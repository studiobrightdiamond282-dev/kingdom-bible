#!/usr/bin/env node
/* Executes the REAL back-navigation block out of public/app.js against a fake
   history, so "Backspace / the ‹ button returns to the previous page" is proven
   by running the code — smoke.js only string-matches that the wiring exists. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const start=src.indexOf('function presenting()');
const end=src.indexOf('function renderRoute(full)');
if(start<0||end<=start){console.error('FAIL back-navigation block not found in app.js');process.exit(1)}
const block=src.slice(start,end);

let pass=0,fail=0;
const ok=(name,cond,extra)=>{if(cond){pass++;console.log('  PASS '+name)}else{fail++;console.log('  FAIL '+name+(extra!==undefined?' -> '+extra:''))}};

/* One environment per scenario: a fake history whose back()/replaceState are
   recorded, plus the minimal DOM the block touches. `route` is a free variable
   in app.js (declared at the top of the file), so it is seeded on the context
   and the non-strict assignments inside navigate() update it in place. */
function env(opts={}){
  const btn={hidden:true},modal={firstChild:opts.modalOpen?{}:null};
  const history={state:opts.state??null,backs:0,pushed:[],replaced:[],
    back(){this.backs++},
    pushState(s,u,h){this.state=s;this.pushed.push(h)},
    replaceState(s,u,h){this.state=s;this.replaced.push(h)}};
  const e={route:opts.route||'home',rendered:0,closed:false,history,
    btn,location:{pathname:opts.pathname||'/',search:opts.search||'',hash:''}};
  const ctx={
    console,URLSearchParams,location:e.location,history,NAV:[['home','H','Home'],['bible','B','Bible']],
    $:sel=>sel==='#backBtn'?btn:(sel==='#modalRoot'?modal:{textContent:'',classList:{toggle(){}}}),
    $$:()=>[],
    closeModal(){e.closed=true},
    renderRoute(){e.rendered++},
    scrollTo(){},
  };
  ctx.route=e.route;
  vm.createContext(ctx);
  vm.runInContext(block,ctx,{filename:'back-nav-block.js'});
  e.goBack=()=>vm.runInContext('goBack()',ctx);
  e.navigate=(t,p)=>vm.runInContext(`navigate(${JSON.stringify(t)},${p===false?'false':'true'})`,ctx);
  e.paint=()=>vm.runInContext('paintBackBtn()',ctx);
  e.ctx=ctx;
  return e;
}

console.log('--- back navigation ---');

/* 1. Home with no history: the button must hide itself — a visible control that
      does nothing is worse than no control. */
{
  const e=env({route:'home',state:null});
  e.paint();
  ok('button hidden on Home with no history',e.btn.hidden===true,'hidden='+e.btn.hidden);
}

/* 2. Navigating stamps depth and reveals the button. */
{
  const e=env({route:'home',state:null});
  e.navigate('bible');
  ok('navigate pushes a history entry',e.history.pushed.includes('#bible'),JSON.stringify(e.history.pushed));
  ok('navigate stamps depth 1',e.history.state&&e.history.state.depth===1,JSON.stringify(e.history.state));
  ok('button appears once there is somewhere to go',e.btn.hidden===false);
  ok('navigate renders the target route',e.ctx.route==='bible'&&e.rendered===1);
}

/* 3. goBack() walks real history — the previous page, not a re-render. */
{
  const e=env({route:'bible',state:{depth:1}});
  e.paint();
  ok('button visible on a pushed page',e.btn.hidden===false);
  e.goBack();
  ok('goBack calls history.back() when depth > 0',e.history.backs===1,'backs='+e.history.backs);
  ok('goBack does not push a new entry',e.history.pushed.length===0,JSON.stringify(e.history.pushed));
}

/* 4. An open dialog is dismissed first, exactly like Escape. */
{
  const e=env({route:'bible',state:{depth:1},modalOpen:true});
  e.goBack();
  ok('an open modal is closed before navigating',e.closed===true);
  ok('history is untouched while a modal is open',e.history.backs===0);
}

/* 5. Deep link (no history): falls back to Home by REPLACING the entry, so
      Backspace cannot ping-pong between Home and the deep link forever. */
{
  const e=env({route:'bible',state:null});
  e.goBack();
  ok('deep link falls home without history.back()',e.history.backs===0);
  ok('deep link replaces instead of pushing',e.history.replaced.includes('#home')&&e.history.pushed.length===0,
     JSON.stringify({replaced:e.history.replaced,pushed:e.history.pushed}));
  ok('deep link lands on Home',e.ctx.route==='home');
  ok('button hides again on Home',e.btn.hidden===true);
  e.goBack();
  ok('back on Home with no history does nothing',e.history.backs===0&&e.ctx.route==='home');
}

/* 6. The presentation surface is a capture target: back must never touch it. */
{
  const e=env({route:'bible',state:{depth:1},pathname:'/present'});
  e.goBack();
  ok('presentation surface never navigates back',e.history.backs===0&&e.rendered===0);
  e.paint();
  ok('button stays hidden in presentation mode',e.btn.hidden===true);
}

/* 7. ?present is the same surface (opened with a query instead of a path). */
{
  const e=env({route:'bible',state:{depth:1},search:'?present=1'});
  e.goBack();
  ok('?present is treated as presentation mode',e.history.backs===0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);