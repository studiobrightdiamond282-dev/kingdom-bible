#!/usr/bin/env node
'use strict';
/* Voice Preacher Mode timing tests. These use a tiny Web Speech API/DOM double so
   the important contract is exercised without a browser: every interim frame is
   scanned, edge references use their fuses, and dispatch-time locking suppresses
   duplicate recogniser frames. */
const assert=require('assert');
const REF=require('../public/bible-ref.js');
const books=require('../public/data/books.json').books;

class Element{
  constructor(){this.className='';this.innerHTML='';this.textContent='';this.value='';this.onclick=null;this.onchange=null;this.classList={toggle:()=>{}}}
  setAttribute(){}
}
const elements=new Map();
for(const id of ['voiceMic','voiceStatus','voiceHint','voiceTranscript','voiceLog','voiceTr','voiceLang','voiceAuto'])elements.set('#'+id,new Element());
global.document={querySelector:s=>elements.get(s)||new Element()};
global.localStorage={getItem:()=>null,setItem:()=>{}};
global.location={hostname:'localhost'};
global.isSecureContext=true;
let recogniser=null;
class FakeSpeechRecognition{
  constructor(){recogniser=this}
  start(){this.started=true}
  stop(){this.stopped=true}
}
global.SpeechRecognition=FakeSpeechRecognition;
global.KingdomRef=REF;
delete require.cache[require.resolve('../public/voice.js')];
require('../public/voice.js');
const Voice=global.KingdomVoice;
const hooks={books,present:hit=>{calls.push(hit);return Promise.resolve({ref:REF.format(hit,books)})},gotoVerse:()=>Promise.resolve({ref:'John 3:16'}),next:()=>Promise.resolve(),prev:()=>Promise.resolve(),blank:()=>Promise.resolve(),show:()=>Promise.resolve(),notify:()=>{}};
let calls=[];

function frame(text,isFinal=false){
  recogniser.onresult({resultIndex:0,results:[Object.assign({isFinal}, {'0':{transcript:text}})]});
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function main(){
  Voice.bind(hooks);
  Voice.start();
  assert(recogniser,'Voice Mode started a recogniser double');

  /* More words after a complete verse means no pause/final result is needed. */
  frame('John 3:16 for the next point');
  assert.equal(calls.length,1,'a complete interim reference followed by speech dispatches immediately');
  Voice.stop(true);

  /* A verse at the edge gets only the 350 ms fuse. */
  calls=[];Voice.start();frame('John 3:16');
  assert.equal(calls.length,0,'edge verse waits for its short fuse');
  await wait(380);
  assert.equal(calls.length,1,'edge verse dispatches after 350 ms');
  Voice.stop(true);

  /* Chapter-only references get the longer 1.1 s hold for a following verse. */
  calls=[];Voice.start();frame('John 3');
  await wait(400);
  assert.equal(calls.length,0,'chapter-only reference is held while a verse may follow');
  await wait(760);
  assert.equal(calls.length,1,'chapter-only reference dispatches after 1.1 s');
  Voice.stop(true);

  /* Dispatch-time locking wins even when the first display send is still pending. */
  calls=[];Voice.start();
  frame('John 3:16 for the next point');
  frame('John 3:16 for the next point');
  assert.equal(calls.length,1,'the same verse is locked at dispatch and cannot fire twice');
  Voice.stop(true);

  /* A reference split across a recogniser restart is still resolved: Chrome ends
     a session on its own, and "the book of" must not be lost with it. */
  calls=[];Voice.start();
  const firstRun=recogniser;
  frame('the book of',true);
  firstRun.onend();                      /* Chrome closed the session itself */
  await wait(120);
  assert(recogniser&&recogniser!==firstRun,'the recogniser restarted with a fresh session');
  frame('John 3:16 for the next point');
  assert.equal(calls.length,1,'a reference spanning a recogniser restart still reaches the display');
  Voice.stop(true);

  /* Waiting for a reference must never throw the listening session away. */
  calls=[];Voice.start();
  const ended=recogniser;
  ended.onend();
  await wait(120);
  assert(recogniser&&recogniser!==ended,'the recogniser restarts promptly after an unexpected end');
  assert.equal(ended.stopped,undefined,'a restart never stops the recogniser it replaced');
  assert.equal(recogniser.stopped,undefined,'the live recogniser keeps listening');
  Voice.stop(true);

  console.log('✓ Voice Preacher Mode interim timing, fuses, dedupe lock, and restart recovery');
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1});
