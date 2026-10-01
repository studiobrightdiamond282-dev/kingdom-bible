/* Independent QR decoder used to verify public/qr.js round-trips correctly.
   Run with: node tests/qr.js
   Validates format info (BCH), ECC level, Reed-Solomon syndromes and exact payload. */
global.window={};global.TextEncoder=require('util').TextEncoder;
require('../public/qr.js');

const EXP=new Array(512),LOG=new Array(256);
let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&0x100)x^=0x11D}
for(let i=255;i<512;i++)EXP[i]=EXP[i-255];
const mul=(a,b)=>(a===0||b===0)?0:EXP[LOG[a]+LOG[b]];

const VER=[[16,10,1,0],[28,16,1,0],[44,26,1,0],[64,18,2,0],[86,24,2,0],[108,16,4,0],[124,18,4,0],[154,22,2,2],[182,22,3,2],[216,26,4,1]];
const ALIGN=[[],[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];

/* which modules are function (not data)? rebuilt independently of qr.js */
function functionMap(ver){
  const size=ver*4+17,f=Array.from({length:size},()=>new Array(size).fill(false));
  const mark=(r,c)=>{if(r>=0&&c>=0&&r<size&&c<size)f[r][c]=true};
  const finder=(r,c)=>{for(let dr=-1;dr<=7;dr++)for(let dc=-1;dc<=7;dc++)mark(r+dr,c+dc)};
  finder(0,0);finder(0,size-7);finder(size-7,0);
  for(let i=0;i<size;i++){mark(6,i);mark(i,6)}
  for(const r of ALIGN[ver])for(const c of ALIGN[ver]){
    if((r===6&&c===6)||(r===6&&c===size-7)||(r===size-7&&c===6))continue;
    for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++)mark(r+dr,c+dc);
  }
  for(let i=0;i<9;i++){mark(8,i);mark(i,8)}
  for(let i=0;i<8;i++){mark(8,size-1-i);mark(size-1-i,8)}
  if(ver>=7)for(let i=0;i<6;i++)for(let j=0;j<3;j++){mark(size-11+j,i);mark(i,size-11+j)}
  return f;
}
function readFormatBits(matrix){
  let v=0;
  for(let i=0;i<15;i++){
    let b;
    if(i<6)b=matrix[8][i];
    else if(i<8)b=matrix[8][i+1];
    else if(i===8)b=matrix[7][8];
    else b=matrix[14-i][8];
    v=(v<<1)|b;
  }
  return v;
}
function bch(data5){let d=data5<<10;for(let i=14;i>=10;i--)if((d>>i)&1)d^=0x537<<(i-10);return((data5<<10)|d)^0x5412}

function maskFn(id){return(r,c)=>{
  switch(id){
    case 0:return(r+c)%2===0;case 1:return r%2===0;case 2:return c%3===0;case 3:return(r+c)%3===0;
    case 4:return(Math.floor(r/2)+Math.floor(c/3))%2===0;case 5:return(r*c)%2+(r*c)%3===0;
    case 6:return((r*c)%2+(r*c)%3)%2===0;default:return((r+c)%2+(r*c)%3)%2===0;
  }
}}
function decode(url){
  const {matrix,size}=window.QR(url);
  const ver=(size-17)/4;
  if(!Number.isInteger(ver)||ver<1||ver>10)throw new Error('unexpected version '+ver);
  const rawFormat=readFormatBits(matrix);
  const data5=(rawFormat^0x5412)>>>10;
  if(bch(data5)!==rawFormat)throw new Error('format info BCH mismatch');
  const level=(data5>>3)&3,mask=data5&7;
  if(level!==0)throw new Error('expected ECC level M, got '+level);
  const fn=maskFn(mask),fmap=functionMap(ver);

  /* finder patterns must be intact */
  const want=['1111111','1000001','1011101','1011101','1011101','1000001','1111111'];
  for(let r=0;r<7;r++){
    const got=matrix[r].slice(0,7).join('');
    if(got!==want[r])throw new Error('finder damaged at row '+r+': '+got);
  }
  if(matrix[size-8][8]!==1)throw new Error('dark module missing');
const bits=[];let up=true;
  for(let col=size-1;col>0;col-=2){
    if(col===6)col--;
    for(let i=0;i<size;i++){
      const row=up?size-1-i:i;
      for(let c=0;c<2;c++){
        const cc=col-c;
        if(fmap[row][cc])continue;
        bits.push(matrix[row][cc]^(fn(row,cc)?1:0));
      }
    }
    up=!up;
  }
  const cw=[];
  for(let i=0;i+8<=bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|bits[i+j];cw.push(b)}

  const[dLen,ecLen,g1,g2]=VER[ver-1],total=g1+g2;
  const shortLen=Math.floor(dLen/total),extra=dLen%total;
  const lens=[];for(let i=0;i<total;i++)lens.push(shortLen+(i<extra?1:0));
  const blocks=lens.map(()=>[]),ecBlocks=lens.map(()=>[]);
  let idx=0;
  for(let i=0;i<shortLen+1;i++)for(let b=0;b<total;b++)if(i<lens[b])blocks[b].push(cw[idx++]);
  for(let i=0;i<ecLen;i++)for(let b=0;b<total;b++)ecBlocks[b].push(cw[idx++]);
  if(idx!==cw.length)throw new Error('codeword count mismatch: consumed '+idx+' of '+cw.length);

  /* Reed-Solomon syndromes must all vanish */
  blocks.forEach((blk,b)=>{
    const full=blk.concat(ecBlocks[b]);
    for(let i=0;i<ecLen;i++){
      let r=0;
      for(const c of full)r=mul(r,EXP[i])^c;
      if(r!==0)throw new Error('Reed-Solomon syndrome non-zero for block '+b);
    }
  });

  const data=blocks.flat();
  let bitPos=0;
  const read=n=>{let v=0;for(let i=0;i<n;i++){const byte=data[bitPos>>3];v=(v<<1)|((byte>>(7-(bitPos&7)))&1);bitPos++}return v};
  const mode=read(4),len=read(ver<10?8:16);
  if(mode!==4)throw new Error('expected byte mode, got '+mode);
  const out=[];
  for(let i=0;i<len;i++)out.push(read(8));
  return{ver,size,mask,text:Buffer.from(out).toString('utf8')};
}

const cases=[
 'http://192.168.100.5:4173/remote?code=WPYYQ4',
 'http://10.0.0.7:4173/remote',
 'http://192.168.100.5:4173/present?code=ABC123',
 'https://kingdombible.app/remote?code=ZZZZZZ',
 'A','http://a',
 'http://192.168.100.5:4173/remote?code=1',
 'http://192.168.100.5:4173/remote?code=12',
 'http://192.168.100.5:4173/remote?code=123',
 'http://192.168.100.5:4173/remote?code=1234',
 'http://churchwifi.local:4173/remote?code=ABCD',
 'http://very-long-church-network-hostname.example.internal:4173/remote?code=XY9QW2'
];
/* sweep payload lengths so every version 1..10 is exercised */
for(let n=1;n<=213;n+=3){
  let s='http://192.168.100.5:4173/remote?code=';
  while(s.length<n)s+='ABCDEFGH';
  cases.push(s.slice(0,n));
}
let pass=0,fail=0;const versions=new Set();
for(const url of cases){
  try{
    const d=decode(url);
    if(d.text!==url)throw new Error('payload mismatch');
    versions.add(d.ver);pass++;
  }catch(e){console.log('  FAIL len '+url.length+' ->',e.message);fail++}
}
console.log((fail?'x':'OK')+' '+pass+' QR payloads decode cleanly, '+fail+' failed');
console.log((fail?'x':'OK')+' versions exercised: '+[...versions].sort((a,b)=>a-b).join(', '));

/* the encoder must refuse payloads beyond its table instead of emitting a broken code */
let threw=false;
try{window.QR('x'.repeat(300))}catch(e){threw=true}
console.log((threw?'OK':'x')+' oversized payload is rejected');
if(!threw)fail++;
process.exit(fail?1:0);