/* KINGDOM BIBLE — authenticated admin portal
   Phase 1: the portal had to scale past a handful of accounts. It offered a single
   <select> of every user for granting access, ignored the audit trail the API was
   already returning, and re-rendered the whole page after every action. This adds
   tabs, search/sort/filter, a real activity log, clearable notifications, toasts and
   honest loading/empty states. */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let cfg=null, data=null, busy=false;

/* view state survives a refresh so a reload never throws away the operator's place */
const view={tab:'accounts',q:'',status:'all',sort:'createdAt',dir:-1};

async function api(p,o={}){
  const r=await fetch(p,{...o,headers:{'content-type':'application/json',...(o.headers||{})}}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'Request failed');
  return d;
}
function toast(message,kind){
  const root=$('#adminToast');if(!root)return;
  const el=document.createElement('div');
  el.className='toast'+(kind?' '+kind:'');
  el.textContent=message;
  root.appendChild(el);
  setTimeout(()=>el.remove(),4200);
}
const naira=n=>'₦'+Number(n||0).toLocaleString('en-NG');
function when(iso){
  if(!iso)return '—';
  const d=new Date(iso);
  return isNaN(d)?'—':d.toLocaleString(undefined,{day:'2-digit',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function ago(iso){
  if(!iso)return '—';
  const mins=Math.floor((Date.now()-new Date(iso))/60000);
  if(isNaN(mins))return '—';
  if(mins<1)return 'just now';
  if(mins<60)return mins+'m ago';
  if(mins<1440)return Math.floor(mins/60)+'h ago';
  return Math.floor(mins/1440)+'d ago';
}
const pill=(text,kind)=>`<span class="status-pill ${esc(kind||'')}">${esc(text)}</span>`;
function empty(icon,title,body){
  return `<div class="empty-state"><div class="empty-icon">${esc(icon)}</div><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
}
async function boot(){
  try{cfg=await api('/api/premium/config');const me=await api('/api/auth/me');if(me.user?.role==='admin')return dashboard();login();}
  catch{login();}
}
function login(){
  const f=$('#adminLogin');if(!f)return;
  f.onsubmit=async e=>{
    e.preventDefault();
    const err=$('#adminError');err.textContent='';
    const btn=f.querySelector('button');btn.disabled=true;btn.textContent='Signing in…';
    try{
      const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('#adminEmail').value,password:$('#adminPassword').value})});
      if(d.user?.role!=='admin')throw Error('This account is not an administrator');
      dashboard();
    }catch(x){err.textContent=x.message;}
    finally{btn.disabled=false;btn.textContent='Sign in';}
  };
}
async function dashboard(){
  const app=$('#adminApp');
  if(!data)app.innerHTML='<div class="loading-screen"><span></span><p>Loading the control center…</p></div>';
  try{
    data=await api('/api/admin/overview');
  }catch(e){
    app.innerHTML=empty('!','Could not load the portal',e.message);
    return;
  }
  render();
}
function render(){
  const users=data.users||[],notes=data.notifications||[],wds=data.withdrawals||[];
  const unread=notes.filter(n=>!n.read).length;
  const pending=wds.filter(w=>w.status==='pending').length;
  const active=users.filter(u=>u.status==='active').length;
  const expiring=users.filter(u=>u.status==='active'&&u.daysRemaining!=null&&u.daysRemaining<=7).length;
  $('#adminApp').innerHTML=
    '<div class="admin-head">'+
      '<div><div class="eyebrow">CONTROL CENTER</div><h2>Administration</h2><p>Accounts, access grants, payouts and activity.</p></div>'+
      '<div><button class="secondary-btn" id="adminRefresh"'+(busy?' disabled':'')+'>'+(busy?'Refreshing…':'Refresh')+'</button> <button class="secondary-btn" id="adminLogout">Sign out</button></div>'+
    '</div>'+
    '<div class="admin-stats" style="grid-template-columns:repeat(5,1fr);margin-top:16px">'+
      stat(users.length,'accounts')+stat(active,'subscribed')+stat(expiring,'expiring ≤ 7d')+
      stat(pending,'payouts pending')+stat(unread,'unread alerts')+
    '</div>'+
    '<div class="admin-tabs" role="tablist">'+
      tabBtn('accounts','Accounts',users.length)+
      tabBtn('withdrawals','Withdrawals',pending)+
      tabBtn('notifications','Notifications',unread)+
      tabBtn('activity','Activity',0)+
    '</div>'+
    '<div id="adminPanel">'+panel()+'</div>';
  bind();
}
function stat(value,label){
  return '<div class="card"><strong>'+esc(value)+'</strong><small>'+esc(label)+'</small></div>';
}
/* a zero count renders no badge: an empty queue should not look like an alarm */
function tabBtn(id,label,count){
  const badge=count?'<span class="tab-count">'+esc(count)+'</span>':'';
  return '<button role="tab" data-tab="'+id+'" class="'+(view.tab===id?'active':'')+'" aria-selected="'+(view.tab===id)+'">'+esc(label)+badge+'</button>';
}
function panel(){
  if(view.tab==='accounts')return accountsPanel();
  if(view.tab==='withdrawals')return withdrawalsPanel();
  if(view.tab==='notifications')return notificationsPanel();
  return activityPanel();
}
function accountsPanel(){
  const all=data.users||[];
  const q=view.q.trim().toLowerCase();
  const rows=all.filter(function(u){
    if(view.status!=='all'&&u.status!==view.status)return false;
    if(!q)return true;
    return [u.email,u.name,u.referralCode,u.plan].some(function(v){
      return String(v||'').toLowerCase().indexOf(q)>-1;
    });
  });
  const key=view.sort,dir=view.dir;
  rows.sort(function(a,b){
    const x=a[key],y=b[key];
    if(typeof x==='number'&&typeof y==='number')return (x-y)*dir;
    return String(x==null?'':x).localeCompare(String(y==null?'':y),undefined,{numeric:true})*dir;
  });
  const head=function(label,field){
    return '<span class="admin-sort" data-sort="'+field+'"'+(key===field?' data-dir="'+(dir===1?'↑':'↓')+'"':'')+'>'+esc(label)+'</span>';
  };
  let body;
  if(!rows.length){
    body=empty(all.length?'⌕':'○',rows.length?'No matches':'No accounts yet',rows.length?'Try a different search term or status filter.':'Accounts will appear here as people register.');
  }else{
    body=rows.map(function(u){
      const days=u.daysRemaining==null?'—':u.daysRemaining+'d left';
      const planKind=u.status==='active'?'active':(u.status==='admin'?'admin':'');
      const wallet=Number(u.walletBalance||0)?naira(u.walletBalance):'<span class="admin-row-muted">—</span>';
      return '<div class="admin-row">'+
        '<span>'+esc(u.email)+'<small>'+esc(u.name||'')+(u.referralCode?' · '+esc(u.referralCode):'')+'</small></span>'+
        '<span>'+pill(String(u.plan||'none').toUpperCase(),planKind)+'<small>'+esc(days)+'</small></span>'+
        '<span>'+pill(u.status,u.status)+'</span>'+
        '<span>'+wallet+'<small>joined '+esc(ago(u.createdAt))+'</small></span>'+
        '<span><button class="secondary-btn small-btn" data-grant="'+esc(u.id)+'">Grant</button> <button class="secondary-btn small-btn" data-resetcode="'+esc(u.id)+'">Reset code</button> <button class="secondary-btn small-btn" data-resetuser="'+esc(u.id)+'">Reset</button> <button class="danger-btn small-btn" data-deleteuser="'+esc(u.id)+'">Delete</button></span>'+
      '</div><div class="admin-grant-slot" data-slot="'+esc(u.id)+'"></div>';
    }).join('');
  }
  const opts=['all','active','trial','expired'].map(function(s){
    const label=s==='all'?'All statuses':(s==='active'?'Subscribed':(s==='trial'?'Trial':'Expired'));
    return '<option value="'+s+'"'+(view.status===s?' selected':'')+'>'+label+'</option>';
  }).join('');
  return '<div class="admin-toolbar">'+
    '<input type="search" id="adminSearch" placeholder="Search email, name, plan or referral code" value="'+esc(view.q)+'">'+
    '<select id="adminStatus">'+opts+'</select>'+
    '<span class="admin-count">'+rows.length+' of '+all.length+' shown</span></div>'+
    '<div class="admin-table"><div class="admin-row admin-row-head">'+
    head('Account','email')+head('Plan','plan')+head('Status','status')+head('Wallet','walletBalance')+'<span>Action</span>'+
    '</div>'+body+'</div>';
}
function withdrawalsPanel(){
  const wds=data.withdrawals||[];
  if(!wds.length)return empty('○','No payout requests','Withdrawal requests from member referral wallets will appear here.');
  const rows=wds.map(function(w){
    const u=(data.users||[]).find(function(x){return x.id===w.userId;});
    const who=u?u.email:w.userId;
    const meta=[w.accountName,w.accountNumber?'****'+String(w.accountNumber).slice(-4):''].filter(Boolean).join(' · ');
    let action;
    if(w.status==='pending')action='<button class="primary-btn small-btn" data-pay="'+esc(w.id)+'">Mark paid</button>';
    else action='<span class="admin-row-muted">settled</span>';
    return '<div class="admin-row">'+
      '<span>'+esc(who)+'<small>'+esc(meta)+'</small></span>'+
      '<span>'+naira(w.amount)+'<small>requested '+esc(ago(w.requestedAt))+'</small></span>'+
      '<span>'+pill(w.status,w.status)+'</span>'+
      '<span>'+esc(w.expectedBy?when(w.expectedBy):'—')+'</span>'+
      '<span>'+action+'</span>'+
    '</div>';
  }).join('');
  return '<div class="admin-card" style="padding-top:8px"><h3>Payout requests</h3>'+
    '<p style="color:var(--muted);font-size:11px;margin:4px 0 10px">Check each request against the member\'s wallet balance before paying. Every action is recorded.</p>'+
    '<div class="admin-table"><div class="admin-row admin-row-head">'+
    '<span>Member</span><span>Amount</span><span>Status</span><span>Due by</span><span>Action</span>'+
    '</div>'+rows+'</div></div>';
}
function notificationsPanel(){
  const notes=data.notifications||[];
  const unread=notes.filter(function(n){return !n.read;}).length;
  const summary=unread?unread+' unread of '+notes.length:(notes.length?notes.length+' notifications':'Nothing to review');
  const head='<div class="admin-toolbar"><span class="admin-count" style="margin:0">'+esc(summary)+'</span>'+
    (unread?'<button class="secondary-btn small-btn" id="adminReadAll" style="margin-left:auto">Mark all read</button>':'')+'</div>';
  if(!notes.length)return head+empty('○','No notifications','Alerts about withdrawals, referrals and payments will appear here.');
  return head+notes.map(function(n){
    const action=n.read?'':'<div class="admin-note-actions"><button class="secondary-btn small-btn" data-read="'+esc(n.id)+'">Mark read</button></div>';
    const stamp=[n.type,when(n.date),ago(n.date)].filter(Boolean).join(' · ');
    return '<div class="admin-note'+(n.read?'':' unread')+'"><div><p>'+esc(n.message)+'</p>'+
      '<small>'+esc(stamp)+'</small></div>'+action+'</div>';
  }).join('');
}
function activityPanel(){
  const log=data.audit||[];
  if(!log.length)return empty('○','No activity yet','Grants, payments and sign-ins are recorded here.');
  const describe=function(d){
    if(!d||typeof d!=='object')return '—';
    return Object.keys(d).map(function(k){
      const v=d[k];
      return k+': '+(v==null?'—':(typeof v==='object'?JSON.stringify(v):String(v)));
    }).join(' · ');
  };
  const rows=log.map(function(a){
    return '<div><span>'+esc(a.event)+'<small>'+esc(when(a.date))+' · '+esc(ago(a.date))+'</small></span>'+
      '<span>'+esc(describe(a.details))+'</span>'+
      '<span>'+esc(a.actor)+'</span></div>';
  }).join('');
return '<div class="admin-card" style="padding-top:8px"><h3>Activity log</h3>'+
    '<p style="color:var(--muted);font-size:11px;margin:4px 0 10px">The most recent '+log.length+' recorded events, newest first.</p>'+
    '<div class="admin-log">'+rows+'</div></div>';
}
function bind(){
  const refresh=$('#adminRefresh');
  const logout=$('#adminLogout');
  if(refresh){
    refresh.onclick=async function(){
      busy=true;render();
      try{await dashboard();}finally{busy=false;}
    };
  }
  if(logout){
    logout.onclick=async function(){
      try{await api('/api/auth/logout',{method:'POST'});}catch(e){}
      location.reload();
    };
  }
  document.querySelectorAll('[data-tab]').forEach(function(b){
    b.onclick=function(){view.tab=b.dataset.tab;render();};
  });
  const search=$('#adminSearch');
  if(search){
    search.oninput=function(){
      view.q=search.value;
      const pos=search.selectionStart;
      render();
      const again=$('#adminSearch');
      if(again){again.focus();again.setSelectionRange(pos,pos);}
    };
    search.onkeydown=function(e){if(e.key==='Escape'){view.q='';render();}};
  }
  const status=$('#adminStatus');
  if(status)status.onchange=function(){view.status=status.value;render();};
  document.querySelectorAll('[data-sort]').forEach(function(h){
    h.onclick=function(){
      if(view.sort===h.dataset.sort)view.dir*=-1;
      else{view.sort=h.dataset.sort;view.dir=1;}
      render();
    };
  });
  document.querySelectorAll('[data-grant]').forEach(function(b){
    b.onclick=function(){openGrant(b.dataset.grant);};
  });
  document.querySelectorAll('[data-resetuser]').forEach(function(b){
    b.onclick=function(){openReset(b.dataset.resetuser);};
  });
  /* Delete is permanent, so it asks the operator to type the exact email. A portal
     that deletes on a single click will eventually delete a paying member, and the
     only defence is friction proportional to how bad the mistake would be. */
  document.querySelectorAll('[data-deleteuser]').forEach(function(b){
    b.onclick=async function(){
      const id=b.dataset.deleteuser;
      const u=(data.users||[]).find(function(x){return x.id===id;});
      if(!u)return;
      const typed=window.prompt('Permanently delete '+u.email+'?\n\nThis removes the account, its payments, wallet and any withdrawal requests. The activity log keeps a record.\n\nType the email to confirm:','');
      if(typed===null)return;
      if(String(typed).trim().toLowerCase()!==String(u.email).toLowerCase()){toast('Email did not match — nothing was deleted','error');return}
      b.disabled=true;
      try{
        const r=await api('/api/admin/users/'+encodeURIComponent(id),{method:'DELETE'});
        toast(r.message,'success');
        await dashboard();
      }catch(x){toast(x.message,'error');b.disabled=false}
    };
  });
  /* Issue a one-time password reset code. The code is shown once, here, and only the
     hash is stored — so copy it into the member's chat before leaving this page. */
  document.querySelectorAll('[data-resetcode]').forEach(function(b){
    b.onclick=async function(){
      const userId=b.dataset.resetcode;
      if(!confirm('Issue a one-time password reset code for this member?'))return;
      try{
        const r=await api('/api/admin/users/'+encodeURIComponent(userId)+'/password-code',{method:'POST',body:'{}'});
        const message=r.code+'\n\n'+r.message+'\n\nSend it to the member. It is valid once and expires in 30 minutes.';
        try{await navigator.clipboard.writeText(r.code);}catch{}
        window.prompt('Copy this code now (also on your clipboard):',message);
        toast('Reset code issued — copy it now, it cannot be shown again','success');
        await dashboard();
      }catch(e){toast(e.message,'error');}
    };
  });
  document.querySelectorAll('[data-pay]').forEach(function(b){
    b.onclick=async function(){
      if(!confirm('Confirm this withdrawal has actually been paid to the member?'))return;
      try{
        await api('/api/admin/withdrawals/'+encodeURIComponent(b.dataset.pay)+'/pay',{method:'POST',body:'{}'});
        toast('Withdrawal marked as paid','success');
        await dashboard();
      }catch(e){toast(e.message,'error');}
    };
  });
  document.querySelectorAll('[data-read]').forEach(function(b){
    b.onclick=async function(){
      try{
        await api('/api/admin/notifications/'+encodeURIComponent(b.dataset.read)+'/read',{method:'POST'});
        toast('Marked as read','success');
        await dashboard();
      }catch(e){toast(e.message,'error');}
    };
  });
  const readAll=$('#adminReadAll');
  if(readAll){
    readAll.onclick=async function(){
      try{
        const r=await api('/api/admin/notifications/read-all',{method:'POST'});
        toast(r.count+' notification'+(r.count===1?'':'s')+' marked read','success');
        await dashboard();
      }catch(e){toast(e.message,'error');}
    };
  }
}
function openGrant(userId){
  const u=(data.users||[]).find(function(x){return x.id===userId;});
  if(!u)return;
  const slot=document.querySelector('[data-slot="'+userId+'"]');
  const host=slot||document.getElementById('adminPanel');
  if(!host)return;
  const plans=(data.plans||[]).map(function(p){
    return '<option value="'+esc(p.id)+'"'+(p.id==='premium'?' selected':'')+'>'+esc(p.name)+'</option>';
  }).join('');
  host.innerHTML='<form class="admin-grant-form">'+
    '<select name="plan">'+plans+'</select>'+
    '<input name="months" type="number" min="1" max="24" value="1" aria-label="Months">'+
    '<label><input name="forever" type="checkbox"> Permanent</label>'+
    '<button class="primary-btn small-btn">Grant</button></form>';
  const form=host.querySelector('form');
  form.onsubmit=async function(e){
    e.preventDefault();
    if(!confirm('Grant '+form.plan.value+' access to '+u.email+'? This is recorded in the activity log.'))return;
    const btn=form.querySelector('button');
    btn.disabled=true;btn.textContent='Granting…';
    try{
      await api('/api/admin/users/'+encodeURIComponent(userId)+'/entitlement',{method:'POST',body:JSON.stringify({plan:form.plan.value,freeMonths:form.months.value,forever:form.forever.checked})});
      toast('Access granted to '+u.email,'success');
      await dashboard();
    }catch(x){
      toast(x.message,'error');
      btn.disabled=false;btn.textContent='Grant';
    }
  };
}
/* Hand an account back in a clean state: a fresh 30-day trial, no subscription, and
   every live session ended so the person must sign in again and actually sees the
   change. The two optional boxes are the "sign in anew" cases the user asked for —
   an account bound to the wrong Google, or one whose password should be replaced
   through the reset-code flow rather than kept. */
function openReset(userId){
  const u=(data.users||[]).find(function(x){return x.id===userId;});
  if(!u)return;
  const slot=document.querySelector('[data-slot="'+userId+'"]');
  const host=slot||document.getElementById('adminPanel');
  if(!host)return;
  const isGoogle=u.authProvider==='google';
  host.innerHTML='<form class="admin-grant-form admin-reset-form">'+
    '<p class="admin-note">Give <strong>'+esc(u.email)+'</strong> a clean start. Currently <strong>'+esc(u.status)+'</strong>.</p>'+
    '<label><input name="trial" type="checkbox" checked> Restart the 30-day free trial</label>'+
    '<label><input name="sub" type="checkbox" checked> Remove any subscription</label>'+
    '<label><input name="google" type="checkbox"'+(isGoogle?'':' disabled')+'> Unlink Google sign-in'+(isGoogle?'':' (not a Google account)')+'</label>'+
    '<label><input name="pw" type="checkbox"> Require a new password</label>'+
    '<div class="admin-reset-actions"><button class="danger-btn small-btn">Reset account</button>'+
    '<button class="secondary-btn small-btn" type="button" data-cancel>Cancel</button></div>'+
    '</form>';
  const form=host.querySelector('form');
  host.querySelector('[data-cancel]').onclick=()=>dashboard();
  form.onsubmit=async function(e){
    e.preventDefault();
    if(!confirm('Reset '+u.email+'?\n\nThe person is signed out and, with the trial restarted, gets a fresh 30 days.'))return;
    const btn=form.querySelector('button');
    btn.disabled=true;btn.textContent='Resetting…';
    try{
      const r=await api('/api/admin/users/'+encodeURIComponent(userId)+'/reset',{method:'POST',body:JSON.stringify({
        restartTrial:form.trial.checked,
        clearSubscription:form.sub.checked,
        unlinkGoogle:form.google.checked,
        clearPassword:form.pw.checked
      })});
      toast(r.message,'success');
      await dashboard();
    }catch(x){
      toast(x.message,'error');
      btn.disabled=false;btn.textContent='Reset account';
    }
  };
}
boot();
})();
