// Adversarial probe: real preaching phrases through the SAME scan() Voice Mode
// uses. The contract is that a phrase either resolves to the obvious reference
// or returns null — it must NEVER resolve to a confident wrong verse.
const REF=require('../public/bible-ref.js');
const books=require('../public/data/books.json').books;
const N=books.findIndex(b=>b.name==='John');
const P=books.findIndex(b=>b.name==='Psalms');
const J=books.findIndex(b=>b.name==='Jude');
function fmt(h){
  if(!h)return 'null';
  if(h.type==='verse')return 'verse '+h.verse+(h.verseEnd?'-'+h.verseEnd:'');
  let s=books[h.book].name+' '+h.chapter;
  if(h.verse!=null)s+=':'+h.verse+(h.verseEnd?'-'+h.verseEnd:'');
  return s;
}

console.log('=== A. real preaching phrases that MUST resolve ===');
const must=[
  ['the book of John chapter three verse sixteen',N,3,16],
  ['First John chapter two verse five',books.findIndex(b=>/^1 John/.test(b.name)),2,5],
  ['Second Corinthians chapter five verse seven',books.findIndex(b=>/^2 Cor/.test(b.name)),5,7],
  ['Psalm one hundred and nineteen verse one hundred and five',P,119,105],
  ['John three sixteen to eighteen',N,3,16],
  ['Romans chapter eight verse twenty eight',books.findIndex(b=>b.name==='Romans'),8,28],
  ['Psalm twenty three verse one',P,23,1],
  ['Jude verse five',J,1,5],
  ['John chapter three',N,3,null],
  ['Philippians four verse six',books.findIndex(b=>b.name==='Philippians'),4,6],
];
let bad=0;
for(const [phrase,bi,ch,vs] of must){
  const h=REF.scan(phrase,books);
  const got=h&&h.book===bi&&h.chapter===ch&&((h.verse==null&&vs==null)||h.verse===vs);
  if(!got)bad++;
  console.log((got?'  ok   ':'  FAIL ')+JSON.stringify(phrase)+' -> '+fmt(h)+(got?'':'  EXPECTED '+books[bi].name+' '+(vs==null?ch:ch+':'+vs)));
}

console.log('\n=== B. prose that must NOT produce a reference (null) ===');
const mustNull=[
  'three sixteen','one hundred and five','in the year two thousand',
  'he was born in Bethlehem','she said','chapter and verse',
  'the people gathered','and they were happy','my wife is called grace',
  'one','two','ten','verse','chapter',
  'I read it three times','it happened in chapter one',
];
for(const phrase of mustNull){
  const h=REF.scan(phrase,books);
  const bad2=h!==null;
  if(bad2)bad++;
  console.log((bad2?'  FAIL ':'  ok   ')+JSON.stringify(phrase)+' -> '+fmt(h)+(bad2?'   <-- FALSE POSITIVE':''));
}

console.log('\n=== C. common-number collisions (the dangerous ones) ===');
const collide=[
  ['one john one one',books.findIndex(b=>/^1 John/.test(b.name)),1,1],
  ['second timothy one one',books.findIndex(b=>/^2 Tim/.test(b.name)),1,1],
  ['first peter five eight',books.findIndex(b=>/^1 Pet/.test(b.name)),5,8],
  ['third john one one',books.findIndex(b=>/^3 John/.test(b.name)),1,1],
];
for(const [phrase,bi,ch,vs] of collide){
  const h=REF.scan(phrase,books);
  const got=h&&h.book===bi&&h.chapter===ch&&h.verse===vs;
  if(!got)bad++;
  console.log((got?'  ok   ':'  FAIL ')+JSON.stringify(phrase)+' -> '+fmt(h)+(got?'':'  EXPECTED '+books[bi].name+' '+ch+':'+vs));
}

console.log('\n'+(bad?bad+' FAILURES':'all adversarial checks passed'));
process.exitCode=bad?1:0;