#!/usr/bin/env node
'use strict';
/* KINGDOM BIBLE — regenerate every app icon from the raster master.
 *
 * The icons used to be produced from public/favicon.svg, which was a hand-drawn
 * "simplified mark" that did not match the real logo. That is how the browser tab and
 * the installed app ended up showing a crown-and-book that the owner never approved.
 *
 * This script derives all PNGs from public/assets/logo.png (the real artwork), so the
 * only file anyone has to edit to change branding is the master itself. It needs no
 * image library: PowerShell + System.Drawing is already present on Windows, and on
 * other platforms we fall back to `sips` (macOS) so the script stays dependency-free.
 */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..'),PUBLIC=path.join(ROOT,'public'),ICONS=path.join(PUBLIC,'icons');
const MASTER=path.join(PUBLIC,'assets','logo.png');
const TARGETS=[32,48,64,180,192,512];
const BRAND_NAVY='0,7,22';

if(!fs.existsSync(MASTER))throw Error('master logo missing: '+MASTER);

/* Windows: System.Drawing gives us high-quality bicubic scaling. */
function windows(sizes){
  const script=sizes.map(s=>`
$src=[System.Drawing.Image]::FromFile($master)
$bmp=New-Object System.Drawing.Bitmap(${s},${s})
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.Clear([System.Drawing.Color]::FromArgb(${BRAND_NAVY}))
$g.DrawImage($src,0,0,${s},${s})
$g.Dispose()
$out=Join-Path $icons 'icon-${s}.png'
$bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose();$src.Dispose()`).join('\n');
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`
    $master='${MASTER.replace(/'/g,"''")}'
    $icons='${ICONS.replace(/'/g,"''")}'
    Add-Type -AssemblyName System.Drawing${script}`],{stdio:'inherit'});
}

/* Maskable icons are cropped to a circle by the launcher, so the artwork is inset to
 * roughly 80% of the canvas on an opaque brand-navy field. Without the padding, Android
 * clips the crown and the wordmark. */
function windowsMaskable(size){
  const script=`
$src=[System.Drawing.Image]::FromFile($master)
$pad=[int](${size}*0.1)
$inner=${size}-(2*$pad)
$bmp=New-Object System.Drawing.Bitmap(${size},${size})
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.Clear([System.Drawing.Color]::FromArgb(${BRAND_NAVY}))
$g.DrawImage($src,$pad,$pad,$inner,$inner)
$g.Dispose()
$bmp.Save((Join-Path $icons 'maskable-${size}.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose();$src.Dispose()`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`
    $master='${MASTER.replace(/'/g,"''")}'
    $icons='${ICONS.replace(/'/g,"''")}'
    Add-Type -AssemblyName System.Drawing${script}`],{stdio:'inherit'});
}

function mac(sizes){
  for(const s of sizes)execFileSync('sips',['-z',String(s),String(s),MASTER,'--out',path.join(ICONS,`icon-${s}.png`)],{stdio:'inherit'});
  execFileSync('sips',['-z','410','410',MASTER,'--out','/tmp/kb-mask-inner.png'],{stdio:'inherit'});
  execFileSync('sips',['-p','512','512','/tmp/kb-mask-inner.png','--out',path.join(ICONS,'maskable-512.png')],{stdio:'inherit'});
}

if(process.platform==='win32'){fs.mkdirSync(ICONS,{recursive:true});windows(TARGETS);windowsMaskable(512);}
else if(process.platform==='darwin'){mac(TARGETS);}
else throw Error('icon generation needs Windows (System.Drawing) or macOS (sips)');

/* favicon.png mirrors icon-48.png; several pages still request it explicitly. */
if(process.platform==='win32')fs.copyFileSync(path.join(ICONS,'icon-48.png'),path.join(PUBLIC,'favicon.png'));
else execFileSync('sips',['-z','48','48',path.join(ICONS,'icon-48.png'),'--out',path.join(PUBLIC,'favicon.png')],{stdio:'inherit'});

console.log('✓ icons regenerated from assets/logo.png:');
[...TARGETS,'maskable-512'].forEach(s=>{
  const f=path.join(ICONS,s===512&&fs.existsSync(path.join(ICONS,'maskable-512.png'))?'maskable-512.png':`icon-${s}.png`);
  console.log('   '+path.relative(PUBLIC,f).replace(/\\/g,'/')+'  '+(fs.existsSync(f)?fs.statSync(f).size+' bytes':'MISSING'));
});