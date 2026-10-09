// Executes the REAL renderHome() out of public/app.js in a sandboxed DOM and
// inspects the markup it produces. String assertions alone cannot catch a
// thrown template literal, a leaked `undefined`, or a missing event binding.
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('public/app.js','utf8');
const start=src.indexOf('async function renderHome()');
const block=src.slice(src.lastIndexOf('/* HOME */'),src.indexOf('/* BIBLE READER */'));
const mk=()=>({innerHTML:'',textContent:'',value:'',dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},style:{setProperty(){}},setAttribute(){},getAttribute:()=>null,addEventListener(){},removeEventListener(){},querySelectorAll:()=>[],querySelector:()=>null,focus(){},scrollIntoView(){},append(){},appendChild(){},children:[],childNodes:[],disabled:false,hidden:false,tabIndex:0,options:[],length:0});
const main=mk();
// Record every id the render binds a handler to, so a missing element is caught.
const bound=[];
const sel=id=>{const o=mk();bound.push(id);return o};
const books=JSON.parse(fs.readFileSync('public/data/books.json')).books.map(b=>({name:b.name,abbr:b.abbr,chapters:b.chapters,t:b.t}));
const ctx={
  console:{log(){},warn(){},error(...a){throw new Error('console.error: '+a.join(' '))}},
  document:{querySelector:s=>s==='#main'?main:mk(),querySelectorAll:()=>[],documentElement:mk(),createElement:mk,getElementById:()=>null,addEventListener(){},body:mk()},
  window:{},localStorage:{getItem:()=>null,setItem(){}},navigator:{},location:{origin:'http://x',hash:''},
  fetch:()=>Promise.reject(new Error('no net')),history:{pushState(){}},structuredClone,JSON,Date,Math,Object,Array,Promise,RegExp,String,Number,Boolean,Set,Map,Intl,
  setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},clearInterval(){},addEventListener(){},
  $:s=>s==='#main'?main:sel(s), $$:()=>[],
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])),
  books,state:{reader:{book:42,chapter:3,translation:'kjv',lastVerse:16},bookmarks:{'John 3:16':{}},chaptersRead:['42:3'],prayers:[{id:1}],readingDays:[],profile:{name:'Ada',theme:'light'},ministry:{theme:'royal',church:'KINGDOM BIBLE'}},
  TR:{kjv:'KJV',asv:'ASV',web:'WEB'},
  DEVOTIONAL:{title:'Walking by Faith',scripture:'2 Corinthians 5:7',verse:'For we walk by faith, not by sight.'},
  QUICK:[['bible','A','Read Bible'],['prayer','B','Pray'],['ministry','C','Present']],
  getVerse:async ref=>({text:'For God so loved the world, that he gave his only begotten Son.',ref,translation:'kjv'}),
  fmtDate:()=>'Friday, March 6',displayName:()=>'Ada',streak:()=>3,today:()=>'2026-10-03',
  navigate(){},toast(){},save(){},setTitle(){},installApp:async()=>{},openReference(){},openMemory(){},shareText(){},openGuide(){},openManual(){},
  hub:()=>({isLive:()=>true}),hubState:'live',deferredInstall:null,loadHub:async()=>'live'
};
ctx.window.KingdomPremium={config:()=>({appVersion:'1.2.1'}),load:async()=>{},supportText:()=>'https://wa.me/x',open(){},openAuth(){}};
vm.createContext(ctx);
vm.runInContext(block,ctx,{filename:'home-block.js'});
let pass=0,fail=0;
const ok=(name,cond,extra)=>{if(cond){pass++;console.log('  PASS '+name)}else{fail++;console.log('  FAIL '+name+(extra!==undefined?' -> '+extra:''))}};
ctx.renderHome().then(()=>{
  const h=main.innerHTML;
  console.log('rendered '+h.length+' chars\n');
  ok('renders substantial markup',h.length>2000,h.length);
  ok('no `undefined` leaked',!/\bundefined\b/.test(h));
  ok('no [object Object] leaked',!h.includes('[object Object]'));
  ok('no unexpanded ${',!h.includes('${'));
  ok('no NaN leaked',!/NaN/.test(h));
  ok('greeted by name (Ada)',h.includes('Good ')&&h.includes('Ada'));
  ok('verse-of-the-day present',h.includes('VERSE OF THE DAY')&&h.includes('For God so loved'));
  ok('verse ref rendered',/<cite>— [A-Za-z ]+ \d+:\d+<\/cite>/.test(h));
  ok('continue reading + book initial',h.includes('CONTINUE READING')&&h.includes('book-mark'));
  ok('devotional card',h.includes('TODAY’S DEVOTIONAL')&&h.includes('Walking by Faith'));
  ok('reading stats: streak',h.includes('>3</strong>')||h.includes('day reading streak'));
  ok('reading stats: 4 panels',(h.match(/stat-card/g)||[]).length>=4);
  ok('quick actions grid',h.includes('Quick actions')&&(h.match(/quick-card/g)||[]).length>=3);
  ok('next step / memory verse',h.includes('Your next step')&&h.includes('Memory verse'));
  ok('membership upsell present',h.includes('home-membership')&&h.includes('KINGDOM BIBLE PRO'));
  ok('privacy + refund links',h.includes('href="/privacy"')&&h.includes('href="/refund"'));
  ok('WhatsApp support wired',h.includes('WhatsApp support'));
  // Every id the template creates must be the id the binding code reaches for.
  const ids=[...h.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]);
  const dup=ids.filter((v,i)=>ids.indexOf(v)!==i);
  ok('no duplicate ids',dup.length===0,dup.join(','));
  // `bound` stores full selectors ("#resumeTop"), so compare with the hash.
  for(const need of ['resumeTop','resumeReading','homeUpgrade','homeWhatsApp','dailySave','dailyShare','dailyOpen','memoryStart'])
    ok(`#${need} rendered AND bound`,ids.includes(need)&&bound.includes('#'+need),`rendered=${ids.includes(need)} bound=${bound.includes('#'+need)}`);
  const openD=(h.match(/<div/g)||[]).length-(h.match(/<\/div>/g)||[]).length;
  ok('div tags balanced',openD===0,openD);
  const openS=(h.match(/<section/g)||[]).length-(h.match(/<\/section>/g)||[]).length;
  ok('section tags balanced',openS===0,openS);
  ok('no explainer markup leaked',!h.includes('kbx-')&&!h.includes('READ THE WORD.'));
  console.log('\n'+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
}).catch(e=>{console.log('RENDER THREW: '+e.message);console.log((e.stack||'').split('\n').slice(0,5).join('\n'));process.exit(1)});