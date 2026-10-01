/* KINGDOM BIBLE — shared Scripture reference engine
   ------------------------------------------------------------------
   One parser for every surface that accepts a Bible reference: the reader,
   Search, Ministry Mode, the phone remote (via server.js) and Voice Preacher
   Mode. It understands what people actually type AND what preachers actually
   say:

     typed    "John 3:16"  "jn 3 16"  "Jn.3.16"  "1john2:5"  "John 3:16-18"
     spoken   "the book of John chapter number one verse three"
              "first John chapter two verse five"
              "Psalm one hundred and nineteen verse one hundred and five"
              "John three sixteen to eighteen"
     sloppy   "jhon 3:16"  "revelations 21 4"  "song of songs 2 1"

   Book matching runs in tiers, strictest first, exactly as the handover note
   demands: exact -> prefix -> subsequence -> edit distance. Free-speech
   scanning (Voice Mode) uses only the strict tiers so a sermon never
   hallucinates a reference; typed input gets the forgiving tiers too.

   Dependency-free and DOM-free so server.js and the Node tests can require it,
   exactly like hub-probe.js. Exposes window.KingdomRef in the browser. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.KingdomRef=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';

const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const SMALL={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19};
const TENS={twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const ORDINAL={first:'1',second:'2',third:'3'};
/* words that may follow an ordinal / roman numeral when it names a book */
const NUMBERED=/^(samuel|kings|chronicles|corinthians|thessalonians|timothy|peter|john|epistle|book)/;
/* conversational filler that never changes which verse is meant.
   NOTE: "numbers" (the book) is NOT here — only the singular "number"
   ("chapter number one"). "of"/"the" are also stripped from book names inside
   compact(), so "Song of Solomon" still matches. */
const FILLER=new Set(['the','a','an','holy','book','books','gospel','epistle','letter',
  'according','saint','st','of','to','unto','into','please','open','opened','read','reading',
  'turn','turning','go','going','give','me','us','show','bring','take','from','in','at',
  'with','it','says','say','said','number']);
const RANGE=new Set(['to','through','thru','till','until']);
const VERSEWORD=new Set(['verse','verses','vs','ver','v']);

/* ---- spoken numbers -> digits -------------------------------------------
   Conservative on purpose: "three sixteen" must become "3 16" (chapter then
   verse), never 19. Only real English compounds are merged:
   tens+unit ("twenty three" -> 23) and hundreds ("one hundred and five"). */
function wordsToDigits(toks){
  const out=[];let i=0;
  while(i<toks.length){
    const t=toks[i];
    if(!has(SMALL,t)&&!has(TENS,t)&&t!=='hundred'){out.push(t);i++;continue}
    let val=0,used=0;
    if(has(SMALL,t)){val=SMALL[t];used=1}
    else if(has(TENS,t)){
      val=TENS[t];used=1;
      const nx=toks[i+1];
      if(has(SMALL,nx)&&SMALL[nx]<10){val+=SMALL[nx];used=2}
    }
    else{val=100;used=1} /* bare "hundred" */
    if(toks[i+used]==='hundred'&&val>0&&val<10){
      val*=100;used++;
      let j=i+used;
      if(toks[j]==='and')j++;
      const w=toks[j];
      if(has(TENS,w)){
        val+=TENS[w];j++;
        const nx=toks[j];
        if(has(SMALL,nx)&&SMALL[nx]<10){val+=SMALL[nx];j++}
      }else if(has(SMALL,w)){val+=SMALL[w];j++}
      used=j-i;
    }
    out.push(String(val));i+=used;
  }
  return out;
}

/* ---- normalisation pipeline --------------------------------------------- */
function normalize(input){
  let s=String(input||'').toLowerCase();
  s=s.replace(/[\u2013\u2014\u2212]/g,'-');          /* en/em dash -> hyphen   */
  s=s.replace(/(\d)\s*[.,]\s*(\d)/g,'$1:$2');        /* "3.16" / "3,16" -> 3:16*/
  s=s.replace(/[^a-z0-9\s:\-]/g,' ');                /* strip punctuation      */
  s=s.replace(/(\d)(st|nd|rd|th)\b/g,'$1');          /* 1st -> 1               */
  s=s.replace(/([a-z])-(?=[a-z])/g,'$1 ');           /* twenty-three           */
  s=s.replace(/([a-z])(?=\d)/g,'$1 ').replace(/(\d)(?=[a-z])/g,'$1 '); /* 1john */
  let toks=s.split(/\s+/).filter(Boolean);
  /* ordinal words and roman numerals before numbered books */
  for(let i=0;i<toks.length;i++){
    const nxt=toks[i+1]||'';
    if(has(ORDINAL,toks[i])&&NUMBERED.test(nxt))toks[i]=ORDINAL[toks[i]];
    else if(toks[i]==='ii'&&NUMBERED.test(nxt))toks[i]='2';
    else if(toks[i]==='iii'&&NUMBERED.test(nxt))toks[i]='3';
    else if(toks[i]==='i'&&NUMBERED.test(nxt))toks[i]='1';
  }
  toks=wordsToDigits(toks);
  const out=[];
  for(let i=0;i<toks.length;i++){
    const t=toks[i],prev=out[out.length-1]||'',next=toks[i+1]||'';
    if(RANGE.has(t)&&/\d$/.test(prev)&&/^\d/.test(next)){out.push('-');continue}
    if(VERSEWORD.has(t)){out.push(':');continue}
    if(t==='chapter'||t==='chapters')continue;
    if(FILLER.has(t))continue;
    out.push(t);
  }
  return out.join(' ')
    .replace(/\s*:\s*/g,':').replace(/:{2,}/g,':')
    .replace(/\s*-\s*/g,'-')
    .replace(/^[:\- ]+/,'').replace(/\s+/g,' ').trim();
}

/* ---- book matching ------------------------------------------------------- */
const _idx=typeof WeakMap!=='undefined'?new WeakMap():null;
function compact(s){
  return String(s||'').toLowerCase().split(/\s+/)
    .filter(w=>w&&w!=='of'&&w!=='the').join('').replace(/[^a-z0-9]/g,'');
}
function index(books){
  if(_idx&&_idx.has(books))return _idx.get(books);
  const ix=books.map((b,i)=>{
    const keys=new Set([compact(b.name)]);
    if(b.abbr)keys.add(compact(b.abbr));
    for(const a of b.aliases||[])keys.add(compact(a));
    keys.delete('');
    return{i,name:compact(b.name),keys:[...keys]};
  });
  if(_idx)_idx.set(books,ix);
  return ix;
}
function isSubseq(a,b){let i=0;for(const ch of b){if(ch===a[i])i++}return i===a.length}
/* Damerau-Levenshtein: a transposed typo ("jhon") must cost 1, not 2 */
function editDist(a,b,max){
  if(Math.abs(a.length-b.length)>max)return max+1;
  const m=a.length,n=b.length;
  let prev2=null,prev=new Array(n+1),cur=new Array(n+1);
  for(let j=0;j<=n;j++)prev[j]=j;
  for(let i=1;i<=m;i++){
    cur[0]=i;let best=cur[0];
    for(let j=1;j<=n;j++){
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])cur[j]=Math.min(cur[j],prev2[j-2]+1);
      if(cur[j]<best)best=cur[j];
    }
    if(best>max)return max+1;
    prev2=prev;prev=cur;cur=new Array(n+1);
  }
  return prev[n];
}
/* -> book index or -1. opts.fuzzy=false keeps only the strict tiers
   (free-speech scanning); typed input defaults to fuzzy=true. */
function matchBook(q,books,opts){
  const o=opts||{},fuzzy=o.fuzzy!==false,qc=compact(q);
  if(!qc)return -1;
  const ix=index(books);
  for(const e of ix)if(e.keys.indexOf(qc)>=0)return e.i;                 /* exact */
  if(qc.length>=3){                                                     /* prefix */
    const pre=ix.filter(e=>e.name.startsWith(qc)||qc.startsWith(e.name)
      ||e.keys.some(k=>k.length>=3&&k.startsWith(qc)));
    if(pre.length===1)return pre[0].i;
    if(pre.length>1&&!fuzzy)return -1;
  }
  if(!fuzzy)return -1;
  if(qc.length>=4){                                                     /* subsequence */
    const sub=ix.filter(e=>isSubseq(qc,e.name));
    if(sub.length===1)return sub[0].i;
  }
  const th=qc.length<=4?1:2;                                            /* edit distance */
  let best=th+1,hits=[];
  for(const e of ix){
    const dn=editDist(qc,e.name,th);
    let d=dn;
    for(const k of e.keys){const dk=editDist(qc,k,th);if(dk<d)d=dk}
    if(d<best){best=d;hits=[{i:e.i,onName:dn===d}]}
    else if(d===best)hits.push({i:e.i,onName:dn===d});
  }
  if(best>th)return -1;
  if(hits.length===1)return hits[0].i;
  /* a tie on distance: the full book name outranks an alias ("jhon" is John,
     not Jonah's "jon" alias) — but only when that leaves exactly one book */
  const named=hits.filter(h=>h.onName);
  return named.length===1?named[0].i:-1;
}

/* validate chapter/verse against the canon shape (verse counts are validated
   later against the actual text by the caller) */
function refine(bi,chapter,verse,verseEnd,books){
  const b=books[bi];if(!b)return null;
  /* single-chapter books: "Jude 5" means Jude 1:5 */
  if(b.chapters===1&&chapter>1&&verse==null){verse=chapter;chapter=1}
  if(!(chapter>=1&&chapter<=b.chapters))return null;
  if(verse!=null&&!(verse>=1&&verse<=200))return null;
  if(verseEnd!=null&&(verse==null||verseEnd<=verse||verseEnd>200))verseEnd=null;
  return{book:bi,chapter,verse:verse==null?null:verse,verseEnd:verseEnd==null?null:verseEnd};
}

/* ---- parse one typed/spoken reference ------------------------------------
   -> {book, chapter, verse|null, verseEnd|null} or null. verse===null means
   the whole chapter was asked for. */
const REF_RE=/^(.+?)\s+(\d{1,3})(?:[:\s](\d{1,3})(?:-(\d{1,3}))?)?$/;
function parse(input,books,opts){
  if(!Array.isArray(books)||!books.length)return null;
  let s=normalize(input);
  if(!s)return null;
  let m=s.match(REF_RE);
  if(!m){m=s.replace(/:/g,' ').replace(/\s+/g,' ').match(REF_RE);if(!m)return null}
  const bi=matchBook(m[1],books,opts);
  if(bi<0)return null;
  return refine(bi,+m[2],m[3]?+m[3]:null,m[4]?+m[4]:null,books);
}

/* ---- scan free speech for the most recent reference ----------------------
   Strict book matching only — a sermon must never trigger a fuzzy guess.
   -> {type:'ref',book,chapter,verse,verseEnd}
   -> {type:'verse',verse,verseEnd}   ("...now verse twenty five" — caller
      resolves it against the verse currently on the display)
   -> null */
const SCAN_RE=/((?:[1-3]\s)?[a-z]+(?:\s[a-z]+){0,2})\s(\d{1,3})(?:[:\s](\d{1,3})(?:-(\d{1,3}))?)?(?=[\s:]|$)/g;
function scan(text,books){
  if(!Array.isArray(books)||!books.length)return null;
  const s=normalize(text);
  if(!s)return null;
  let best=null,m;
  SCAN_RE.lastIndex=0;
  while((m=SCAN_RE.exec(s))){
    const words=m[1].split(' ');
    let hit=null;
    for(let k=0;k<words.length&&!hit;k++){
      const bi=matchBook(words.slice(k).join(' '),books,{fuzzy:false});
      if(bi>=0)hit=refine(bi,+m[2],m[3]?+m[3]:null,m[4]?+m[4]:null,books);
    }
    if(hit)best={type:'ref',book:hit.book,chapter:hit.chapter,verse:hit.verse,verseEnd:hit.verseEnd};
    /* the phrase may have eaten a numbered-book prefix ("reading 1 john 2 5"):
       retry from inside the failed phrase */
    else SCAN_RE.lastIndex=m.index+words[0].length+1;
  }
  if(best)return best;
  let vm=null;
  const vre=/:(\d{1,3})(?:-(\d{1,3}))?/g;let v;
  while((v=vre.exec(s)))vm=v;
  if(vm){
    const verse=+vm[1],verseEnd=vm[2]?+vm[2]:null;
    if(verse>=1&&verse<=200)return{type:'verse',verse,verseEnd:verseEnd&&verseEnd>verse?verseEnd:null};
  }
  return null;
}

/* ---- presenter voice commands --------------------------------------------
   Deliberately narrow phrases so ordinary preaching never fires one. */
function command(text){
  const s=' '+String(text||'').toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim()+' ';
  if(/\b(next|following) (verse|scripture)\b/.test(s))return 'next';
  if(/\b(previous|preceding) (verse|scripture)\b/.test(s)||/\bback (one|a) verse\b/.test(s)||/\b(one|a) verse back\b/.test(s))return 'prev';
  if(/\b(blank|clear|hide|black) (the |that )?(screen|display|projector)\b/.test(s))return 'blank';
  if(/\b(show|unblank|restore) (the |that )?(screen|display|verse)\b/.test(s)||/\bbring (the verse |it )?back\b/.test(s))return 'show';
  if(/\b(stop|pause|end) (the )?(listening|voice|recognition|dictation|microphone)\b/.test(s))return 'stop';
  return null;
}

/* format a parsed reference back into a canonical string */
function format(p,books){
  if(!p||!books||!books[p.book])return '';
  const base=books[p.book].name+' '+p.chapter;
  if(p.verse==null)return base;
  return base+':'+p.verse+(p.verseEnd?'-'+p.verseEnd:'');
}

return{normalize,parse,scan,command,matchBook,format,wordsToDigits,compact,VERSION:'1.2.0'};
});
