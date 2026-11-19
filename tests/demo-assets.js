#!/usr/bin/env node
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const style=fs.readFileSync(path.join(root,'public/demo-tour.css'),'utf8');
const sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
const posterPath=path.join(root,'public/assets/kingdom-bible-product-preview.jpg');
const videoPath=path.join(root,'public/assets/kingdom-bible-product-preview.mp4');
const poster=fs.readFileSync(posterPath),video=fs.readFileSync(videoPath);

assert(/<video\b[^>]*\bcontrols\b/.test(app),'Home preview has native accessible video controls');
assert(/<video\b[^>]*\bpreload="none"/.test(app),'video is not downloaded until a visitor chooses to play it');
assert(/<video\b[^>]*\bplaysinline\b/.test(app),'video stays inline on mobile');
assert(!/<video\b[^>]*\bautoplay\b/.test(app),'video never autoplays');
assert(app.includes('poster="/assets/kingdom-bible-product-preview.jpg?v=1.2.9"'),'video points at the versioned branded poster');
assert(app.includes('<source src="/assets/kingdom-bible-product-preview.mp4?v=1.2.9" type="video/mp4">'),'video source is a versioned same-origin MP4');
assert(app.includes('v=1.2.9')&&sw.includes("VERSION='kingdom-bible-v1.2.9'"),'video URLs are cache-busted with the app version');
assert(app.includes('Illustrative sample screens · no personal account data shown'),'the sample footage is not represented as a real user account');
assert(app.includes('Explore the interactive demo'),'the animated guided tour remains available beside the video');
assert(/\.home-demo-video\s*\{[^}]*aspect-ratio:\s*16\/9/s.test(style),'video player keeps a responsive 16:9 layout');

assert(poster.length>20_000&&poster.length<500_000,'poster is a reasonably sized image');
assert(poster[0]===0xff&&poster[1]===0xd8&&poster.at(-2)===0xff&&poster.at(-1)===0xd9,'poster is a complete JPEG');
let width=0,height=0;
for(let i=2;i<poster.length-9;){
  if(poster[i]!==0xff){i++;continue}
  const marker=poster[i+1],segment=poster.readUInt16BE(i+2);
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
    height=poster.readUInt16BE(i+5);width=poster.readUInt16BE(i+7);break;
  }
  if(segment<2)break;
  i+=2+segment;
}
assert.strictEqual(width,1280,'poster width is 1280px');
assert.strictEqual(height,720,'poster height is 720px');
assert(video.length>100_000&&video.length<5_000_000,'MP4 preview stays lightweight');
assert(video.subarray(4,8).toString()==='ftyp','video is an MP4 container');
assert(video.includes(Buffer.from('avc1')),'MP4 contains an H.264 video track');
assert(video.includes(Buffer.from('moov'))&&video.includes(Buffer.from('mdat')),'MP4 has playable metadata and media data');
assert(sw.includes("'/assets/kingdom-bible-product-preview.jpg?v=1.2.9'"),'poster is available from the offline shell cache');
assert(/if\(\/\\\.\(mp4\|webm\|mov\)\$\/i\.test\(u\.pathname\)\)\{e\.respondWith\(fetch\(r\)\);return\}/.test(sw),'video Range requests bypass CacheStorage and remain network-only');
console.log(`✓ Home product preview: ${Math.round(video.length/1024)} KB H.264 MP4, ${width}×${height} poster, accessible controls, offline poster`);
