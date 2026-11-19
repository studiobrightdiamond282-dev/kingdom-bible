/* Local Ministry Mode navigation shared by the presenter and its tests.
   `step` walks the canon using the caller's translation data, so static/offline
   presentation behaves like the live hub without duplicating boundary logic. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.KingdomNav=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';

  const failure=error=>({ok:false,error});

  async function step(current,direction,books,loadBook,getPassage){
    if(!Array.isArray(books)||!books.length||typeof loadBook!=='function'||typeof getPassage!=='function')
      return failure('Scripture navigation is unavailable');
    if(!current||!Number.isInteger(current.book)||!Number.isInteger(current.chapter)||
       !Number.isInteger(current.verse)||current.book<0||current.book>=books.length||!books[current.book]||
       current.chapter<1||current.chapter>books[current.book].chapters)return failure('Send a verse first');

    const delta=direction>0?1:-1;
    const tr=current.translation||'kjv';
    let bi=current.book,ch=current.chapter;
    let v=(delta>0?(current.verseEnd||current.verse||1):(current.verse||1))+delta;

    if(v<1){
      if(ch===1){
        if(bi===0)return failure('Start of the Bible');
        bi--;ch=books[bi].chapters;
      }else ch--;
      const previous=await loadBook(tr,bi);
      const verses=previous&&previous.chapters&&previous.chapters[ch-1];
      if(!verses||!verses.length)return failure('Cannot advance');
      v=verses.length;
    }

    const data=await loadBook(tr,bi);
    const verses=data&&data.chapters&&data.chapters[ch-1];
    if(!verses||!verses.length)return failure('Cannot advance');
    if(v>verses.length){
      if(ch>=books[bi].chapters){
        if(bi>=books.length-1)return failure('End of the Bible');
        bi++;ch=1;
      }else ch++;
      v=1;
    }

    const passage=await getPassage({book:bi,chapter:ch,verse:v,verseEnd:null},tr);
    if(!passage||!passage.text)return failure('Cannot advance');
    return{ok:true,passage};
  }

  return{step};
});
