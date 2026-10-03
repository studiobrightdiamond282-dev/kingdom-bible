#!/usr/bin/env node
'use strict';
/* KINGDOM BIBLE — build the link-preview card that appears when the hub URL is
 * shared on WhatsApp, Facebook or X.
 *
 * Why this exists: index.html shipped `og:image="/assets/logo-hero.png"` — a
 * RELATIVE url. Every social crawler requires an absolute one, so the preview had
 * no picture at all and a shared link looked like bare text. A square 640px logo
 * is also the wrong shape: WhatsApp renders a large preview at roughly 1.91:1, so
 * a square gets letterboxed.
 *
 * The card is 1200x630 with the real logo centred as a rounded tile over solid
 * brand navy, given a soft drop shadow and a thin gold rule.
 *
 * The first attempt filled the canvas with a gradient sampled from the logo's own
 * corners so the square would blend in. It nearly worked, but left a faint vertical
 * seam at the logo's edges. A deliberate tile with a border and shadow removes the
 * mismatch entirely and simply looks like designed branding.
 *
 * Like icons.js it needs no image library: PowerShell + System.Drawing on Windows.
 */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const ROOT=path.join(__dirname,'..'),PUBLIC=path.join(ROOT,'public');
const MASTER=path.join(PUBLIC,'assets','logo-hero.png');
const OUT=path.join(PUBLIC,'assets','logo-social.png');
const W=1200,H=630,TILE=500,RADIUS=64;

if(!fs.existsSync(MASTER))throw Error('master hero logo missing: '+MASTER);

const BG='11,21,51';       /* #0b1533 solid brand navy, shows only around the tile */
const GOLD='245,215,120';  /* #f5d778, the gold already used by favicon.svg */

function windows(){
  const script=`
Add-Type -AssemblyName System.Drawing
function New-RoundRect($x,$y,$w,$h,$r){
  $p=New-Object System.Drawing.Drawing2D.GraphicsPath
  $d=$r*2
  $p.AddArc($x,$y,$d,$d,180,90)
  $p.AddArc($x+$w-$d,$y,$d,$d,270,90)
  $p.AddArc($x+$w-$d,$y+$h-$d,$d,$d,0,90)
  $p.AddArc($x,$y+$h-$d,$d,$d,90,90)
  $p.CloseFigure()
  return $p
}
$src=[System.Drawing.Image]::FromFile($master)
$bmp=New-Object System.Drawing.Bitmap(${W},${H})
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.Clear([System.Drawing.Color]::FromArgb(${BG}))
$x=[int]((${W}-${TILE})/2)
$y=[int]((${H}-${TILE})/2)
# soft shadow: stacked rounded rects fading outward - System.Drawing has no blur
for($i=6;$i -ge 1;$i--){
  $sp=New-RoundRect ($x-($i*5)) ($y-($i*4)+($i*2)) ($TILE+($i*10)) ($TILE+($i*10)) (${RADIUS}+($i*4))
  $sb=New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(14,0,0,0))
  $g.FillPath($sb,$sp)
  $sb.Dispose();$sp.Dispose()
}
# logo clipped to the rounded tile so its corners are cut cleanly
$clip=New-RoundRect $x $y ${TILE} ${TILE} ${RADIUS}
$state=$g.Save()
$g.SetClip($clip)
$g.DrawImage($src,$x,$y,${TILE},${TILE})
$g.Restore($state)
# thin gold rule around the tile
$pen=New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120,${GOLD})),3
$pen.LineJoin=[System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawPath($pen,$clip)
$pen.Dispose();$clip.Dispose();$g.Dispose()
$bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose();$src.Dispose()`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`
    $master='${MASTER.replace(/'/g,"''")}'
    $out='${OUT.replace(/'/g,"''")}'
    ${script}`],{stdio:'inherit'});
}

if(process.platform==='win32')windows();
else if(fs.existsSync(OUT))console.log('· social card generation needs Windows (System.Drawing); keeping the existing '+path.relative(PUBLIC,OUT).replace(/\\/g,'/'));
else throw Error('social card generation needs Windows (System.Drawing)');

const b=fs.readFileSync(OUT);
console.log('✓ social preview card: '+path.relative(PUBLIC,OUT).replace(/\\/g,'/')+'  '+W+'x'+H+'  '+b.length+' bytes');