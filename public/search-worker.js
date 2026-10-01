let cache={};
self.onmessage=async(e)=>{
  const {type,query,translation='kjv',testament='all',book='all',limit=120}=e.data;
  if(type!=='search')return;
  const q=(query||'').trim();
  if(!q){postMessage({type:'results',query,results:[],total:0});return}
  try{
    if(!cache[translation]){
      postMessage({type:'status',message:'Loading Bible index…'});
      const r=await fetch(`/data/bible_${translation}.json`);
      cache[translation]=await r.json();
    }
    const d=cache[translation], lower=q.toLowerCase(), exact=/^".*"$/.test(q);
    const needle=(exact?q.slice(1,-1):q).toLowerCase();
    const results=[];let total=0;
    const names=['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];
    for(let bi=0;bi<d.books.length;bi++){
      if(testament==='ot'&&bi>38||testament==='nt'&&bi<39)continue;
      if(book!=='all'&&Number(book)!==bi)continue;
      for(let ci=0;ci<d.books[bi].length;ci++)for(let vi=0;vi<d.books[bi][ci].length;vi++){
        const text=d.books[bi][ci][vi], at=text.toLowerCase().indexOf(needle);
        if(at>=0){total++;if(results.length<limit)results.push({book:bi,bookName:names[bi],chapter:ci+1,verse:vi+1,text,at,len:needle.length,translation});}
      }
    }
    postMessage({type:'results',query,results,total});
  }catch(error){postMessage({type:'error',message:error.message});}
};
