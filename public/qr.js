/* Tiny dependency-free QR encoder (byte mode, ECC level M) — enough for LAN URLs. */
(function(g){
'use strict';
/* GF(256) log/antilog tables, primitive polynomial 0x11D */
const EXP=new Array(512),LOG=new Array(256);
let x=1;
for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&0x100)x^=0x11D}
for(let i=255;i<512;i++)EXP[i]=EXP[i-255];
const mul=(a,b)=>(a===0||b===0)?0:EXP[LOG[a]+LOG[b]];

/* Version table for ECC level M: [data codewords, ec codewords per block, group1 blocks, group2 blocks]
   totals check out: v1 16+10=26, v2 28+16=44, v3 44+26=70, v4 64+2x18=100 ... */
const VER=[
  [16,10,1,0],[28,16,1,0],[44,26,1,0],[64,18,2,0],[86,24,2,0],[108,16,4,0],
  [124,18,4,0],[154,22,2,2],[182,22,3,2],[216,26,4,1]
];
const ALIGN=[ ,[], [6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50] ];

function rsGenerator(deg){
  let poly=[1];
  for(let i=0;i<deg;i++){
    const next=new Array(poly.length+1).fill(0);
    for(let j=0;j<poly.length;j++){
      next[j]^=mul(poly[j],EXP[i]);
      next[j+1]^=poly[j];
    }
    poly=next;
  }
  return poly;
}
/* rsGenerator builds the product ∏(x + a^i) with the constant term first,
   so reverse it to get the conventional highest-degree-first form used by division. */
function rsEncode(data,ecLen){
  const gen=rsGenerator(ecLen).slice().reverse();
  const res=new Array(data.length+ecLen).fill(0);
  for(let i=0;i<data.length;i++)res[i]=data[i];
  for(let i=0;i<data.length;i++){
    const factor=res[i];
    if(!factor)continue;
    for(let j=0;j<gen.length;j++)res[i+j]^=mul(gen[j],factor);
  }
  return res.slice(data.length);
}
function byteCapacity(v){
  const headerBits=4+(v<10?8:16);          /* mode indicator + character count field */
  return Math.floor((VER[v-1][0]*8-headerBits)/8);
}
function encodeBytes(bytes){
  let ver=1;
  for(let v=1;v<=10;v++){ver=v;if(bytes.length<=byteCapacity(v))break}
  if(bytes.length>byteCapacity(ver))throw new Error('QR payload too long ('+bytes.length+' bytes)');
  const dataCapacity=VER[ver-1][0];
  const bits=[],push=(val,len)=>{for(let i=len-1;i>=0;i--)bits.push((val>>i)&1)};
  push(4,4);                          /* byte mode */
  push(bytes.length,ver<10?8:16);     /* character count */
  bytes.forEach(b=>push(b,8));
  const totalBits=dataCapacity*8;
  for(let i=0;i<4&&bits.length<totalBits;i++)bits.push(0);
  while(bits.length%8)bits.push(0);
  const codewords=[];
  for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bits[i+j];codewords.push(v)}
  const pads=[0xEC,0x11];
  for(let i=0;codewords.length<dataCapacity;i++)codewords.push(pads[i%2]);
  return{ver,codewords};
}
function buildMatrix(ver,codewords){
  const size=ver*4+17;
  const m=Array.from({length:size},()=>new Array(size).fill(null));
  /* explicit finder template — unambiguous and easy to verify */
  const FINDER=[
    [1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1]
  ];
  const finder=(r,c)=>{
    for(let dr=-1;dr<=7;dr++)for(let dc=-1;dc<=7;dc++){
      const rr=r+dr,cc=c+dc;
      if(rr<0||cc<0||rr>=size||cc>=size)continue;
      const inside=dr>=0&&dr<7&&dc>=0&&dc<7;
      m[rr][cc]=inside?FINDER[dr][dc]:0;
    }
  };
  finder(0,0);finder(0,size-7);finder(size-7,0);
  for(let i=8;i<size-8;i++){m[6][i]=i%2===0?1:0;m[i][6]=i%2===0?1:0}
  const centers=ALIGN[ver]||[];
  for(const r of centers)for(const c of centers){
    if((r===6&&c===6)||(r===6&&c===size-7)||(r===size-7&&c===6))continue;
    for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){
      m[r+dr][c+dc]=(Math.abs(dr)===2||Math.abs(dc)===2||(dr===0&&dc===0))?1:0;
    }
  }
  m[size-8][8]=1;                       /* dark module */
  const reserve=(r,c)=>{if(r>=0&&c>=0&&r<size&&c<size&&m[r][c]===null)m[r][c]=0};
  for(let i=0;i<9;i++){reserve(8,i);reserve(i,8)}
  for(let i=0;i<8;i++){reserve(8,size-1-i);reserve(size-1-i,8)}
  if(ver>=7)for(let i=0;i<6;i++)for(let j=0;j<3;j++){reserve(size-11+j,i);reserve(i,size-11+j)}

  /* interleave data + error correction into the zigzag */
  const [dLen,ecLen,g1,g2]=VER[ver-1];
  const totalBlocks=g1+g2;
  const shortLen=Math.floor(dLen/totalBlocks),extra=dLen%totalBlocks;
  const blocks=[],ecBlocks=[];
  let off=0;
  for(let i=0;i<totalBlocks;i++){
    const len=shortLen+(i<extra?1:0);
    blocks.push(codewords.slice(off,off+len));off+=len;
  }
  for(const b of blocks)ecBlocks.push(rsEncode(b,ecLen));
  const stream=[];
  for(let i=0;i<shortLen+1;i++)for(let b=0;b<totalBlocks;b++){
    if(i<blocks[b].length)stream.push(blocks[b][i]);
  }
  for(let i=0;i<ecLen;i++)for(let b=0;b<totalBlocks;b++)stream.push(ecBlocks[b][i]);

  let bitIdx=0,up=true;
  /* remember which modules carry data before they are filled in */
  const isData=m.map(row=>row.map(v=>v===null));
  for(let col=size-1;col>0;col-=2){
    if(col===6)col--;                    /* skip timing column */
    for(let i=0;i<size;i++){
      const row=up?size-1-i:i;
      for(let c=0;c<2;c++){
        const cc=col-c;
        if(m[row][cc]!==null)continue;
        m[row][cc]=bitIdx<stream.length*8?((stream[bitIdx>>3]>>(7-(bitIdx&7)))&1):0;
        bitIdx++;
      }
    }
    up=!up;
  }
  return{matrix:m,isData};
}
function maskFn(id){return (r,c)=>{
  switch(id){
    case 0:return (r+c)%2===0;
    case 1:return r%2===0;
    case 2:return c%3===0;
    case 3:return (r+c)%3===0;
    case 4:return (Math.floor(r/2)+Math.floor(c/3))%2===0;
    case 5:return (r*c)%2+(r*c)%3===0;
    case 6:return ((r*c)%2+(r*c)%3)%2===0;
    default:return ((r+c)%2+(r*c)%3)%2===0;
  }
}}
/* level M format info, precomputed for masks 0-7 */
const FMT_M=[0x5412,0x5125,0x5E7C,0x5B4B,0x45F9,0x40CE,0x4F97,0x4AA0];
function penalty(m){
  const size=m.length;let p=0;
  for(let r=0;r<size;r++){let run=1;
    for(let c=1;c<size;c++){if(m[r][c]===m[r][c-1])run++;else{run=1;p+=run>=5?3+(run-5):0}}
    if(run>=5)p+=3+(run-5);}
  for(let c=0;c<size;c++){let run=1;
    for(let r=1;r<size;r++){if(m[r][c]===m[r-1][c])run++;else{run=1;p+=run>=5?3+(run-5):0}}
    if(run>=5)p+=3+(run-5);}
  for(let r=0;r<size-1;r++)for(let c=0;c<size-1;c++){
    const v=m[r][c];if(v===m[r][c+1]&&v===m[r+1][c]&&v===m[r+1][c+1])p+=3;}
  let dark=0;for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(m[r][c])dark++;
  p+=Math.floor(Math.abs(dark*100/(size*size)-50)/5)*10;
  return p;
}
function encode(text){
  const bytes=Array.from(new TextEncoder().encode(String(text)));
  const{ver,codewords}=encodeBytes(bytes);
  const built=buildMatrix(ver,codewords);
  const base=built.matrix,isData=built.isData;
  const size=base.length;
  let best=null,bestPenalty=Infinity;
  for(let id=0;id<8;id++){
    const fn=maskFn(id);
    const m=base.map(row=>row.slice());
    for(let r=0;r<size;r++)for(let c=0;c<size;c++){
      if(isData[r][c]&&fn(r,c))m[r][c]^=1;
    }
    const fmt=FMT_M[id];                /* level M */
    for(let i=0;i<15;i++){
      const bit=(fmt>>(14-i))&1;
      if(i<6)m[8][i]=bit;
      else if(i<8)m[8][i+1]=bit;
      else if(i===8)m[7][8]=bit;
      else m[14-i][8]=bit;
      if(i<8)m[size-1-i][8]=bit;
      else m[8][size-15+i]=bit;
    }
    m[size-8][8]=1;
    const p=penalty(m);
    if(p<bestPenalty){bestPenalty=p;best=m}
  }
  return{matrix:best,size:ver*4+17};
}
g.QR=encode;
})(window);