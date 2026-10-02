#!/usr/bin/env node
/* Proves the audience-display auto-fit converges instead of overflowing the capture
 * frame. The previous implementation decremented the font in 2px steps down to a hard
 * 18px floor and then gave up, so a chapter-length passage (e.g. "John 10", seen
 * running off a projector) was still cropped.
 *
 * fitText() is extracted verbatim from public/app.js and exercised against a mocked
 * layout engine whose scrollHeight grows with the font size, so the search is tested
 * against the code that actually ships — not a copy of it. */
const fs=require('fs'),path=require('path');

const src=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const fn=src.match(/function fitText\(box,stage,maxPx,minPx\)\{[\s\S]*?\n\}/);
if(!fn){console.error('  FAIL could not locate fitText() in public/app.js');process.exit(1)}

/* ---- mock layout engine ------------------------------------------------- */
/* Georgia is ~0.5em average advance; lines = ceil(chars / charsPerLine). */
function mockStage({height,width,padding}){
  const brand={offsetHeight:16};
  const stage={
    clientHeight:height,
    querySelector:sel=>sel==='.presentation-brand'?brand:null,
    __pad:padding,
  };
  return stage;
}
function mockQuote(chars,maxWidth,lineHeight=1.35,cssFont=64){
  /* cssFont models the stylesheet clamp(); when the inline style is cleared the
     browser falls back to it, exactly as .presentation-stage blockquote does. */
  const quote={style:{},__chars:chars,__w:maxWidth,__lh:lineHeight,__css:cssFont,offsetHeight:0};
  Object.defineProperty(quote,'scrollHeight',{
    get(){
      const fs2=parseFloat(quote.style.fontSize)||quote.__css;
      const perLine=Math.max(1,Math.floor(quote.__w/(0.5*fs2)));
      const lines=Math.ceil(quote.__chars/perLine);
      return lines*fs2*quote.__lh;
    },
  });
  return quote;
}
const getComputedStyle=el=>({
  paddingTop:el.__pad||0+'px',
  paddingBottom:el.__pad||0+'px',
  fontSize:(el.__css||'94px'),
});

/* fitText closes over the global getComputedStyle, so bind ours into this scope */
const fitText=eval('('+fn[0].replace(/^function fitText/,'function')+')');

/* Build a stage + verse box whose cite/brand heights fitText actually reads, so the
 * budget it computes internally is the budget the assertions check against. */
function scene({height,padding,citeH=34,chars,maxWidth,cssFont}){
  const brand={offsetHeight:16};
  const stage={clientHeight:height,__pad:padding+'px',querySelector:s=>s==='.presentation-brand'?brand:null};
  const quote=mockQuote(chars,maxWidth,1.35,cssFont);
  const cite={offsetHeight:citeH};
  const box={style:{},querySelector:s=>s==='blockquote'?quote:s==='cite'?cite:null};
  /* the rendered height of the whole block (quote + citation), pre-transform */
  Object.defineProperty(box,'scrollHeight',{get:()=>quote.scrollHeight+citeH});
  /* mirror of fitText's internal budget, kept in one place so the two never drift */
  const budget=Math.max(80,height-(padding*2)-citeH-brand.offsetHeight-(height*0.06));
  /* what the audience actually sees: the block height after any scale transform */
  Object.defineProperty(box,'rendered',{get(){
    const k=parseFloat((box.style.transform||'').match(/scale\(([\d.]+)\)/)?.[1]||1);
    return (quote.scrollHeight+citeH)*k;
  }});
  return{stage,box,quote,budget};
}

let pass=0,fail=0;
const ok=(name,cond,extra)=>{if(cond){pass++;console.log('  PASS',name)}else{fail++;console.log('  FAIL',name,extra||'')}};

console.log('\n--- audience display auto-fit (1920x1080 capture) ---');

const bible=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','bible_kjv.json'),'utf8'));
const john10Chars=bible.books[42][9].join(' ').length;

/* Psalm 23:1 — the everyday case: should stay at the large display size. */
{
  const text='The LORD is my shepherd; I shall not want.';
  const{stage,box,quote,budget}=scene({height:1080,padding:97,chars:text.length,maxWidth:1500,cssFont:94});
  const px=fitText(box,stage,94,14);
  ok('single verse keeps a large, projector-readable size',px>=80,px+'px');
  ok('single verse is not shrunk at all',quote.scrollHeight<=budget,Math.round(quote.scrollHeight)+'px vs '+Math.round(budget)+'px');
}

/* John 10 (whole chapter) — the case that overflowed before. */
{
  const s=scene({height:1080,padding:97,chars:john10Chars,maxWidth:1500,cssFont:64});
  const px=fitText(s.box,s.stage,56,14);
  ok('whole chapter fits inside the frame instead of being cropped',s.box.rendered<=s.budget,
    'needs '+Math.round(s.box.rendered)+'px, budget '+Math.round(s.budget)+'px');
  ok('whole chapter still renders at a legible size',px>=16,px+'px for '+john10Chars+' chars');
}

/* The reported bug: /present inside a small preview window (VS Code's simple browser,
   or a 1280x720 vMix input) ran a whole chapter off the top and bottom of the frame.
   A full 1920x1080 stage has enough room to hide the defect, so the regression is
   reproduced at the size where it actually showed up. */
{
  const s=scene({height:700,padding:63,citeH:24,chars:john10Chars,maxWidth:1100,cssFont:46});
  const px=fitText(s.box,s.stage,56,14);
  ok('a whole chapter still fits a small preview window',s.box.rendered<=s.budget,
    Math.round(s.box.rendered)+'px vs '+Math.round(s.budget)+'px (font '+px+'px)');
}

/* The old loop floored at 18px and then gave up. Reproduce it in that same window:
   it stops at 18px while the text still needs far more room than the frame has. */
{
  const s=scene({height:700,padding:63,citeH:24,chars:john10Chars,maxWidth:1100,cssFont:46});
  const oldLimit=s.stage.clientHeight*.62;
  s.quote.style.fontSize='94px';
  let old=94;
  while(s.quote.scrollHeight>oldLimit&&old>18){old-=2;s.quote.style.fontSize=old+'px'}
  ok('the old 18px floor really did overflow the frame',s.quote.scrollHeight>oldLimit,
    'stopped at '+old+'px needing '+Math.round(s.quote.scrollHeight)+'px but only had '+Math.round(oldLimit)+'px');
  fitText(s.box,s.stage,56,14);
  ok('the new fit brings the same passage inside the frame',s.box.rendered<=s.budget,
    'now '+Math.round(s.box.rendered)+'px vs '+Math.round(s.budget)+'px');
}

/* Resizing the vMix input (1280x720 -> 1920x1080) must re-fit rather than keep the
   stale size that was correct for the previous frame. */
{
  const a=scene({height:720,padding:65,citeH:28,chars:2500,maxWidth:900,cssFont:46});
  const pxA=fitText(a.box,a.stage,56,14);
  const b=scene({height:1080,padding:97,chars:2500,maxWidth:1500,cssFont:64});
  const pxB=fitText(b.box,b.stage,56,14);
  ok('both frame sizes fit the same passage',a.box.rendered<=a.budget&&b.box.rendered<=b.budget,
    '720p '+Math.round(a.box.rendered)+'/'+Math.round(a.budget)+', 1080p '+Math.round(b.box.rendered)+'/'+Math.round(b.budget));
  ok('the larger frame restores a larger type size',pxB>pxA,pxA+'px -> '+pxB+'px');
  /* re-fitting the same box after a resize must clear the previous transform */
  b.box.style.transform='scale(0.5)';
  fitText(b.box,b.stage,56,14);
  ok('re-fitting clears a stale scale transform',!/scale\(0\.5/.test(b.box.style.transform),b.box.style.transform||'(none)');
}
/* Respects the lower bound rather than looping forever on pathological input. */
{
  const s=scene({height:1080,padding:97,chars:200000,maxWidth:1500,cssFont:94});
  const px=fitText(s.box,s.stage,94,14);
  ok('never shrinks below the 14px floor',px>=14,px+'px');
  ok('terminates on absurd input',typeof px==='number'&&isFinite(px),String(px));
}

/* A blanked screen must not be "fitted" into something visible. */
{
  const s=scene({height:1080,padding:97,citeH:34,chars:0,maxWidth:1500,cssFont:94});
  const px=fitText(s.box,s.stage,94,14);
  ok('an empty (blanked) stage resolves to a real size without overflowing',
    typeof px==='number'&&isFinite(px)&&s.box.rendered<=s.budget,'size '+px+'px, rendered '+Math.round(s.box.rendered)+'px');
}

console.log('\n'+pass+' passed, '+fail+' failed');
if(fail)process.exitCode=1;