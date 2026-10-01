#!/usr/bin/env node
'use strict';
/* KINGDOM BIBLE — Digital Asset Links helper.
 *
 * Play Store / TWA verification only passes when /.well-known/assetlinks.json lists the
 * exact SHA-256 fingerprint of the certificate that signed the uploaded bundle. This
 * script derives that value from the keystore so the file can never drift from the APK.
 *
 *   npm run assetlinks -- ./upload-keystore.jks
 *   npm run assetlinks -- ./upload-keystore.jks my-alias
 *
 * Requires keytool (ships with Android Studio and with the JDK).
 * Debug keystores are intentionally refused: Play signs releases with the upload key.
 */
const {execFileSync}=require('child_process');
const fs=require('fs');
const path=require('path');

const OUT=path.join(__dirname,'..','public','.well-known','assetlinks.json');
const PACKAGE=process.env.ANDROID_PACKAGE||'app.kingdombible.app';

function die(msg){console.error('\n  ✖ '+msg+'\n');process.exit(1)}

const [keystore,aliasRaw]=process.argv.slice(2);
if(!keystore){
  console.log('\n  Digital Asset Links helper\n');
  console.log('  Usage: npm run assetlinks -- <upload-keystore.jks> [alias]');
  console.log('  Prints and writes the SHA-256 fingerprint into public/.well-known/assetlinks.json\n');
  process.exit(0);
}
if(!fs.existsSync(keystore))die('Keystore not found: '+keystore);

/* resolve the alias the same way apksigner does: prefer an explicit one, else the only one */
function detectAlias(){
  if(aliasRaw)return aliasRaw;
  try{
    const out=execFileSync('keytool',['-list','-keystore',keystore,'-storetype','JKS'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
    const aliases=[...out.matchAll(/^(?:Alias name|别名):\s*(\S+)/gmi)].map(m=>m[1]);
    if(aliases.length===1)return aliases[0];
    if(aliases.length>1)die('Keystore has several aliases ('+aliases.join(', ')+'). Pass the upload-key alias explicitly.');
  }catch(e){
    /* the store may be PKCS12 or password-prompted; fall through and let keytool report */
  }
  return null;
}

const alias=detectAlias();
const args=['-list','-v','-keystore',keystore];
if(alias)args.push('-alias',alias);
let out;
try{ out=execFileSync('keytool',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}); }
catch(e){ die('keytool could not read the keystore.\n    '+(e.stderr||e.message).toString().trim()+'\n    (Is ANDROID_SDK_ROOT set, and is this the upload keystore?)'); }

const match=out.match(/SHA256:\s*([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){31})/);
if(!match)die('No SHA256 fingerprint found in keytool output.');
const fingerprint=match[1].toUpperCase();

if(/androiddebug\.key|\.android\\debug\.keystore/i.test(keystore))
  die('That looks like a debug keystore. Play Store requires the UPLOAD key fingerprint.\n    Generate one with: keytool -genkeypair -v -keystore upload.jks ...');

const doc=[{
  relation:['delegate_permission/common.handle_all_urls'],
  target:{namespace:'android_app',package_name:PACKAGE,sha256_cert_fingerprints:[fingerprint]},
}];
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(doc,null,2)+'\n');

console.log('\n  ✔ Wrote '+path.relative(process.cwd(),OUT));
console.log('    package : '+PACKAGE);
console.log('    SHA-256 : '+fingerprint+'\n');
console.log('    Verify at https://digitalassetlinks.googleapis.com/v1/statements:list\n');