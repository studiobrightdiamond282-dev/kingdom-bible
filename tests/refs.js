#!/usr/bin/env node
/* The "Reference not found" regression lived here: the old parser only accepted
   an EXACT book name with a colon between chapter and verse, so "jn 3 16",
   "lk 3 23" and every spoken reference died. These tests pin the reference
   engine that replaces it, for typed input, spoken input and free speech. */
const path=require('path');
const R=require('../public/bible-ref.js');
const books=require(path.join(__dirname,'..','public','data','books.json')).books;
let pass=0,fail=0;
const ok=(name,cond,extra)=>{if(cond){pass++;console.log('  PASS',name)}else{fail++;console.log('  FAIL',name,extra!==undefined?JSON.stringify(extra):'')}};
const P=s=>R.parse(s,books);
const eq=(p,b,c,v,ve)=>!!p&&p.book===b&&p.chapter===c&&p.verse===(v===undefined?null:v)&&p.verseEnd===(ve===undefined?null:ve);

console.log('\n--- typed references (the Ministry portal regression) ---');
ok('John 3:16',eq(P('John 3:16'),42,3,16),P('John 3:16'));
ok('jn 3 16 (space, abbreviation)',eq(P('jn 3 16'),42,3,16),P('jn 3 16'));
ok('lk 3 23 (handover acceptance case)',eq(P('lk 3 23'),41,3,23),P('lk 3 23'));
ok('Jn.3.16 (dots)',eq(P('Jn.3.16'),42,3,16),P('Jn.3.16'));
ok('1john2:5 (no spaces)',eq(P('1john2:5'),61,2,5),P('1john2:5'));
ok('1 John 2 5',eq(P('1 John 2 5'),61,2,5),P('1 John 2 5'));
ok('John 3:16-18 (range)',eq(P('John 3:16-18'),42,3,16,18),P('John 3:16-18'));
ok('John 3:16–18 (en dash)',eq(P('John 3:16–18'),42,3,16,18),P('John 3:16–18'));
ok('John 3 (whole chapter)',eq(P('John 3'),42,3),P('John 3'));
ok('Psalm 23 (singular alias)',eq(P('Psalm 23'),18,23),P('Psalm 23'));
ok('Song of Solomon 2 1',eq(P('Song of Solomon 2 1'),21,2,1),P('Song of Solomon 2 1'));

console.log('\n--- forgiving matching: prefix, subsequence, edit distance ---');
ok('jhon 3:16 (typo)',eq(P('jhon 3:16'),42,3,16),P('jhon 3:16'));
ok('revelations 21 4 (extra s)',eq(P('revelations 21 4'),65,21,4),P('revelations 21 4'));
ok('song of songs 2:1',eq(P('song of songs 2:1'),21,2,1),P('song of songs 2:1'));
ok('genisis 1:1 (misspelt)',eq(P('genisis 1:1'),0,1,1),P('genisis 1:1'));
ok('phil 4:6 resolves uniquely or not at all',(()=>{const p=P('philippians 4:6');return eq(p,49,4,6)})(),P('philippians 4:6'));

console.log('\n--- spoken references (Voice Preacher Mode) ---');
ok('"the book of john chapter number one verse three"',
  eq(P('the book of john chapter number one verse three'),42,1,3),
  P('the book of john chapter number one verse three'));
ok('"first john chapter two verse five"',eq(P('first john chapter two verse five'),61,2,5));
ok('"second timothy chapter 2 verse 15"',eq(P('second timothy chapter 2 verse 15'),54,2,15));
ok('"psalm one hundred and nineteen verse one hundred and five"',
  eq(P('psalm one hundred and nineteen verse one hundred and five'),18,119,105));
ok('"john three sixteen" is 3:16, never 19',eq(P('john three sixteen'),42,3,16),R.normalize('john three sixteen'));
ok('"matthew twenty three" is chapter 23',eq(P('matthew twenty three'),39,23));
ok('"john 3 16 to 18" (spoken range)',eq(P('john 3 16 to 18'),42,3,16,18));
ok('"gospel according to saint john chapter 3 verse 16"',
  eq(P('gospel according to saint john chapter 3 verse 16'),42,3,16));

console.log('\n--- canon guards: never hallucinate ---');
ok('Jude 5 maps to the single chapter',eq(P('Jude 5'),64,1,5),P('Jude 5'));
ok('Genesis 51 is rejected (out of range)',P('Genesis 51')===null);
ok('"faith 1" is not a book',P('faith 1')===null,P('faith 1'));
ok('empty input is null',P('')===null&&R.parse(null,books)===null);
ok('book list missing is null',R.parse('John 3:16',[])===null);
ok('a backwards range is dropped, not inverted',eq(P('John 3:18-16'),42,3,18),P('John 3:18-16'));

console.log('\n--- free-speech scanning (continuous sermon audio) ---');
const S=s=>R.scan(s,books);
ok('finds a reference mid-sentence',(()=>{const r=S('please turn with me to the book of john chapter three verse sixteen for it says');return r&&r.type==='ref'&&r.book===42&&r.chapter===3&&r.verse===16})(),S('please turn with me to the book of john chapter three verse sixteen for it says'));
ok('keeps the LAST reference mentioned',(()=>{const r=S('we started in genesis 1 1 but now go to romans 8 28');return r&&r.type==='ref'&&r.book===44&&r.chapter===8&&r.verse===28})());
ok('numbered book inside a sentence',(()=>{const r=S('reading 1 john 2 5 this evening');return r&&r.type==='ref'&&r.book===61&&r.chapter===2&&r.verse===5})(),S('reading 1 john 2 5 this evening'));
ok('"now verse twenty five" is a contextual verse jump',(()=>{const r=S('now verse twenty five');return r&&r.type==='verse'&&r.verse===25})(),S('now verse twenty five'));
ok('ordinary preaching produces nothing',S('God is good all the time and all the time God is good')===null,S('God is good all the time and all the time God is good'));
ok('a chapter beyond the canon is ignored',(()=>{const r=S('in john 95 we see');return r===null||r.type!=='ref'})(),S('in john 95 we see'));
ok('fuzzy guessing is OFF for speech',(()=>{const r=S('the lion 3 16');return r===null||r.type!=='ref'})(),S('the lion 3 16'));
ok('complete verse at the frame edge is marked atEnd',(()=>{const r=S('John 3:16');return r&&r.type==='ref'&&r.atEnd===true})(),S('John 3:16'));
ok('complete verse followed by more speech is not atEnd',(()=>{const r=S('John 3:16 and the promise continues');return r&&r.type==='ref'&&r.verse===16&&r.atEnd===false})(),S('John 3:16 and the promise continues'));
ok('chapter-only reference carries atEnd',(()=>{const r=S('John chapter three');return r&&r.type==='ref'&&r.verse===null&&r.atEnd===true})(),S('John chapter three'));
ok('contextual verse atEnd tracks trailing speech',(()=>{const a=S('now verse twenty five'),b=S('now verse twenty five for the next point');return a&&a.type==='verse'&&a.atEnd===true&&b&&b.type==='verse'&&b.atEnd===false})());

console.log('\n--- presenter voice commands ---');
ok('"next verse"',R.command('let us go to the next verse')==='next');
ok('"previous verse"',R.command('previous verse please')==='prev');
ok('"back one verse"',R.command('take it back one verse')==='prev');
ok('"blank the screen"',R.command('blank the screen')==='blank');
ok('"show the verse"',R.command('show the verse')==='show');
ok('"stop listening"',R.command('you can stop listening now')==='stop');
ok('plain preaching is never a command',R.command('the next thing Jesus said was wonderful')===null);
ok('"the last verse of the chapter" is never a command',R.command('the last verse of the chapter says')===null);

console.log('\n--- formatting ---');
ok('format John 3:16',R.format({book:42,chapter:3,verse:16,verseEnd:null},books)==='John 3:16');
ok('format a range',R.format({book:42,chapter:3,verse:16,verseEnd:18},books)==='John 3:16-18');
ok('format a chapter',R.format({book:18,chapter:23,verse:null,verseEnd:null},books)==='Psalms 23');

console.log('\n'+pass+' passed, '+fail+' failed');
if(fail){process.exitCode=1}
