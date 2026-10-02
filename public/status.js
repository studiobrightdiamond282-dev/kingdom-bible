/* Presentation sync is the one row that is genuinely host-dependent: the live stream,
   service codes and phone remote are served by the local Node hub. A static host such
   as Vercel answers /health with 200 text/html, so only a real JSON body counts —
   otherwise this page would report "Operational" for a hub that does not exist. */
(function(){
'use strict';
const row=document.querySelectorAll('.row')[3];
const set=(text,ok)=>{const s=row.querySelector('strong');s.textContent=text;s.className=ok?'ok':''};
const banner=document.querySelector('.all strong');
const dot=banner.querySelector('.dot');
fetch('/health',{cache:'no-store'}).then(r=>r.json()).then(d=>{
  if(d&&d.ok===true&&d.app==='KINGDOM BIBLE'){
    set('Operational',true);
    dot.style.background='#22c55e';
    banner.lastChild.textContent='All included systems operational';
  }else{
    set('Needs the local hub',false);
    dot.style.background='#f59e0b';
    banner.lastChild.textContent='App available — live ministry sync needs the local hub';
  }
}).catch(()=>{
  set('Hub offline',false);
  dot.style.background='#f59e0b';
  banner.lastChild.textContent='App available — live ministry sync needs the local hub';
});
})();