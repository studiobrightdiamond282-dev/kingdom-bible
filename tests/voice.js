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

  /* ---- the book must survive "Jude verse five" ------------------------------
     Regression: the spoken word "verse" becomes a colon, so "jude:5" had no
     whitespace for the scanner and the book was DISCARDED, leaving a bare
     contextual "verse 5" that app.js resolved inside whatever was on screen —
     preaching Romans 8 and saying "Jude verse five" put ROMANS 8:5 up. */
  calls=[];Voice.start();
  frame('Jude verse five for the next point');
  assert.equal(calls.length,1,'Jude verse five reached the display');
  const jude=calls[0];
  assert.equal(jude.type,'ref','a named single-chapter book resolves as a full reference, not a bare verse');
  assert.equal(jude.chapter,1,'Jude has one chapter');
  assert.equal(jude.verse,5,'and it is verse 5');
  Voice.stop(true);

  /* The named book must travel to the display so a mismatch can be refused. */
  let seen=null;
  Voice.bind(Object.assign({},hooks,{gotoVerse:(v,ve,tr,bookHint)=>{seen={verse:v,book:bookHint};return Promise.resolve({ref:'x'})}}));
  calls=[];Voice.start();
  frame('John verse sixteen for the next point');
  assert(seen&&seen.verse===16,'verse 16 was passed to the display');
  assert(seen&&seen.book!=null,'the spoken book was passed to the display instead of being dropped');
  Voice.stop(true);

  /* Two different books at the same verse number must not be swallowed as
     duplicates of one another by the dedupe key. */
  Voice.bind(hooks);calls=[];Voice.start();
  frame('Jude verse five for the next point');
  frame('Philemon verse five for the next point');
  assert.equal(calls.length,2,'the same verse number in two books is not a duplicate');
  Voice.stop(true);

  /* A bare "verse 5" with no book still means the passage on the display. */
  Voice.bind(Object.assign({},hooks,{gotoVerse:(v,ve,tr,bookHint)=>{seen={verse:v,book:bookHint};return Promise.resolve({ref:'x'})}}));
  seen=null;calls=[];Voice.start();
  frame('now verse sixteen for the next point');
  assert(seen&&seen.verse===16,'a bare verse number still resolves inside the current passage');
  assert(seen&&seen.book==null,'with no book spoken, no book hint is invented');
  Voice.stop(true);

  console.log('✓ Voice Preacher Mode interim timing, fuses, dedupe lock, restart recovery, and spoken-book preservation');
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1});
