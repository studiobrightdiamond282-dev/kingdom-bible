#!/usr/bin/env node
/* Speech-to-command coverage for Voice Preacher Mode. This drives the actual
   voice.js module with a deterministic fake SpeechRecognition implementation;
   it does not require or claim to test a physical microphone/browser service. */
const fs=require('fs');
const path=require('path');
const assert=require('assert');
const KingdomRef=require('../public/bible-ref.js');
const KingdomNav=require('../public/ministry-nav.js');
const books=require('../public/data/books.json').books;
const bible=require('../public/data/bible_kjv.json').books;
const {createVoiceHarness}=require('./voice-harness');

let pass=0,fail=0;
const ok=(name,cond,extra)=>{
  if(cond){pass++;console.log('  PASS',name)}
  else{fail++;console.log('  FAIL',name,extra===undefined?'':JSON.stringify(extra))}
};

function makePassage(hit,tr='kjv'){
  const book=books[hit.book],chapter=bible[hit.book]&&bible[hit.book][hit.chapter-1];
  if(!book||!chapter)return null;
  const first=hit.verse==null?1:hit.verse;
  if(first<1||first>chapter.length)return null;
  const last=Math.min(hit.verseEnd||first,chapter.length,first+39);
  const verses=[];
  for(let n=first;n<=last;n++)verses.push({n,text:chapter[n-1]});
  const label=book.name+' '+hit.chapter;
  const ref=hit.verse==null?label:verses.length===1?label+':'+first:label+':'+first+'-'+last;
  return{book:hit.book,chapter:hit.chapter,verse:first,verseEnd:last,verses,
    text:verses.map(v=>v.text).join(' '),ref,label,translation:tr};
}
const loadBook=async(tr,book)=>({chapters:bible[book]});
const getPassage=async(hit,tr)=>makePassage(hit,tr);

(async()=>{
  console.log('\n--- Voice Preacher Mode recognition -> commands ---');
  let current=makePassage({book:0,chapter:1,verse:1});
  const notifications=[];
  const hooks={
    books,
    present:async(hit,tr)=>{const p=await getPassage(hit,tr||'kjv');if(p)current=p;return p||{ok:false,error:'Reference not found'}},
    gotoVerse:async(verse,verseEnd,tr)=>{
      if(!current)return{ok:false,error:'Send a verse first'};
      const p=await getPassage({book:current.book,chapter:current.chapter,verse,verseEnd},tr||current.translation);
      if(p)current=p;
      return p||{ok:false,error:'Verse not found'};
    },
    next:async()=>{const out=await KingdomNav.step(current,1,books,loadBook,getPassage);if(out.ok)current=out.passage;return out.ok?current:out},
    prev:async()=>{const out=await KingdomNav.step(current,-1,books,loadBook,getPassage);if(out.ok)current=out.passage;return out.ok?current:out},
    blank:()=>{if(!current)return{ok:false,error:'Send a verse first'};current={...current,blank:true};return{ok:true}},
    show:()=>{if(!current)return{ok:false,error:'Send a verse first'};current={...current,blank:false};return{ok:true}},
    notify:(message,type)=>notifications.push({message,type}),
  };
  const h=createVoiceHarness(hooks);
  h.voice.start();
  ok('recognition starts in a secure supported context',h.voice.listening()&&h.recognition&&h.recognition.started);

  await h.speak('next verse',false);
  ok('interim command is not fired early',current.ref==='Genesis 1:1');
  await h.speak('next verse');
  ok('spoken next verse advances in local fallback',current.ref==='Genesis 1:2',current.ref);
  await h.speak('previous verse');
  ok('spoken previous verse returns to the prior verse',current.ref==='Genesis 1:1',current.ref);
  await h.speak('blank the screen');
  ok('spoken blank screen blanks the local presentation',current.blank===true);
  await h.speak('show the verse');
  ok('spoken show verse restores the presentation',current.blank===false);

  await h.speak('John chapter three verse sixteen',false);
  ok('one unstable interim reference is not sent early',current.ref==='Genesis 1:1');
  await h.speak('John chapter three verse sixteen',false);
  ok('stable interim speech resolves and presents the reference',current.ref==='John 3:16',current.ref);
  ok('reference is logged as delivered',h.elements['#voiceLog'].innerHTML.includes('John 3:16 sent to the display'));
  await h.speak('next verse');
  ok('voice next advances the resolved reference',current.ref==='John 3:17',current.ref);
  await h.speak('previous verse');
  ok('voice previous returns to the prior reference',current.ref==='John 3:16',current.ref);

  await h.speak('Malachi chapter four verse six');
  await h.speak('next verse');
  ok('local navigation crosses from Malachi to Matthew',current.ref==='Matthew 1:1',current.ref);
  await h.speak('previous verse');
  ok('local navigation crosses back from Matthew to Malachi',current.ref==='Malachi 4:6',current.ref);
  await h.speak('John chapter three verse thirty six');
  await h.speak('next verse');
  ok('local navigation crosses chapter boundary forward',current.ref==='John 4:1',current.ref);
  await h.speak('previous verse');
  ok('local navigation crosses chapter boundary backward',current.ref==='John 3:36',current.ref);

  await h.speak('Genesis chapter one verse one');
  await h.speak('previous verse');
  ok('start-of-Bible failure is not logged as a successful command',
    h.elements['#voiceLog'].innerHTML.includes('Previous verse failed: Start of the Bible')&&
    h.elements['#voiceLog'].innerHTML.includes('class="vlog miss"'));
  ok('boundary failure is surfaced to the presenter',notifications.some(n=>n.message==='Start of the Bible'&&n.type==='error'));
  await h.speak('Revelation chapter twenty two verse twenty one');
  await h.speak('next verse');
  ok('end-of-Bible failure is not logged as success',
    h.elements['#voiceLog'].innerHTML.includes('Next verse failed: End of the Bible'));

  await h.speak('stop listening');
  ok('spoken stop listening stops recognition',!h.voice.listening()&&h.recognition.stopped);
  ok('late recognition results are ignored after stopping',await h.speak('next verse')===false);
  ok('stop command notifies the presenter',notifications.some(n=>n.message==='Voice listening stopped'));

  const blocked=createVoiceHarness({books,notify:(message,type)=>notifications.push({message,type})});
  blocked.voice.start();
  blocked.recognition.onerror({error:'not-allowed'});
  await blocked.flush();
  ok('microphone permission denial stops listening and explains the problem',
    !blocked.voice.listening()&&blocked.elements['#voiceStatus'].innerHTML.includes('Microphone blocked')&&
    blocked.elements['#voiceLog'].innerHTML.includes('Microphone access is blocked'));

  console.log('\n--- Voice Preacher Mode app wiring ---');
  const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const sw=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');
  ok('next and previous speech hooks call Ministry navigation',/next:\s*\(\)=>minStep\(1,true\),\s*prev:\s*\(\)=>minStep\(-1,true\)/.test(app));
  ok('blank and show hooks publish explicit blank/restore state',/blank:\s*\(\)=>\{const c=state\.ministry\.current;return c\?sendPresentation\(\{\.\.\.c,blank:true\}\)/.test(app)&&/show:\s*\(\)=>\{const c=state\.ministry\.current;return c\?sendPresentation\(\{\.\.\.c,blank:false\}\)/.test(app));
  ok('local navigation uses the tested canon-walk module',/window\.KingdomNav\.step\(state\.ministry\.current,d,books,loadBook,getPassage\)/.test(app));
  ok('ministry navigation module loads before app.js and is precached',
    html.indexOf('/ministry-nav.js')>=0&&html.indexOf('/ministry-nav.js')<html.indexOf('/app.js')&&sw.includes("'/ministry-nav.js'"));
  ok('failed live-hub actions are returned as failures to voice mode',/if\(!out\|\|out\.ok!==true\)[\s\S]*?return\{ok:false,error\}/.test(app));

  console.log('\n'+pass+' passed, '+fail+' failed');
  if(fail)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
