/* KINGDOM BIBLE — private, session-gated admin portal.
   The UI only displays allow-listed data from the Node account service. Payment
   records are service-side records, not a claim of provider settlement. Payout
   bank details are fetched on demand from the separately audited details route. */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const app=$('#adminApp');
const modalRoot=$('#adminModalRoot');
const esc=s=>String(s??'').replace(/[&<>\'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const tabs=[
  {id:'overview',label:'Overview'},
  {id:'accounts',label:'Accounts'},
  {id:'payments',label:'Payments'},
  {id:'referrals',label:'Referrals'},
  {id:'withdrawals',label:'Payouts'},
  {id:'notifications',label:'Alerts'},
  {id:'activity',label:'Activity'},
  {id:'analytics',label:'Analytics'}
];
let data=null,busy=false,lastLoaded=null,loadError='',modalSubmit=null,modalGeneration=0,returnFocus=null;
const view={tab:'overview',accountQuery:'',accountStatus:'all',accountAuth:'all',accountSort:'createdAt',accountDir:-1,
  accountPage:0,paymentQuery:'',paymentStatus:'all',referralQuery:'',withdrawalQuery:'',withdrawalStatus:'pending',
  notificationFilter:'unread',activityQuery:'',activityPage:0};

async function api(path,options={}){
  const response=await fetch(path,{cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Request failed');
  return result;
}
function money(value){
  const n=Number(value||0);
  return '₦'+(Number.isFinite(n)?n:0).toLocaleString('en-NG',{maximumFractionDigits:2});
}
function dateTime(value){
  if(!value)return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':date.toLocaleString(undefined,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function relativeTime(value){
  if(!value)return '—';
  const stamp=new Date(value).getTime();
  if(!Number.isFinite(stamp))return '—';
  const minutes=Math.floor((Date.now()-stamp)/60000);
  if(minutes<1)return 'just now';
  if(minutes<60)return minutes+'m ago';
  if(minutes<1440)return Math.floor(minutes/60)+'h ago';
  return Math.floor(minutes/1440)+'d ago';
}
function statusPill(value){
  const text=String(value||'unknown').replace(/[_-]+/g,' ');
  const css=String(value||'unknown').toLowerCase().replace(/[^a-z0-9_-]/g,'');
  return '<span class="status-pill '+esc(css)+'">'+esc(text)+'</span>';
}
function emptyState(icon,title,description){
  return '<div class="empty-state"><span class="empty-icon" aria-hidden="true">'+esc(icon)+'</span><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p></div>';
}
function stat(value,label,note,kind){
  return '<article class="admin-stat card '+esc(kind||'')+'"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span>'+(note?'<small>'+esc(note)+'</small>':'')+'</article>';
}
function summary(){return data?.summary||{}}
function tabCount(id){
  const s=summary();
  if(id==='payments')return Number(s.pendingPayments||0);
  if(id==='withdrawals')return Number(s.pendingWithdrawals||0);
  if(id==='notifications')return Number(s.unreadNotifications||0);
  if(id==='referrals')return Number(s.referralSignups||0);
  return 0;
}
function tabButton(tab){
  const active=view.tab===tab.id,count=tabCount(tab.id);
  return '<button type="button" role="tab" id="admin-tab-'+tab.id+'" aria-controls="adminPanel" aria-selected="'+active+'" tabindex="'+(active?'0':'-1')+'" data-tab="'+tab.id+'" class="'+(active?'active':'')+'">'+esc(tab.label)+(count?'<span class="tab-count" aria-label="'+count+' items">'+esc(count)+'</span>':'')+'</button>';
}
function render(){
  if(!app)return;
  app.setAttribute('aria-busy',busy?'true':'false');
  if(!data){
    app.innerHTML=loadError
      ?'<section class="card admin-card"><h2>Could not load the private portal</h2><p class="admin-context">'+esc(loadError)+'</p><button type="button" class="secondary-btn" id="adminRetry">Try again</button></section>'
      :'<div class="loading-screen admin-loading" role="status"><span></span><p>Loading the control center…</p></div>';
    return;
  }
  const s=summary(),users=data.users||[];
  const panel=panelContent();
  app.innerHTML=
    '<header class="admin-head">'+
      '<div><div class="eyebrow">PRIVATE CONTROL CENTER</div><h2>Administration</h2><p>Manage member access, review records and follow up on account activity.</p></div>'+
      '<div class="admin-head-actions"><span class="admin-updated">'+(lastLoaded?'Updated '+esc(relativeTime(lastLoaded)):'')+'</span>'+
        '<button type="button" class="secondary-btn" id="adminRefresh"'+(busy?' disabled':'')+'>'+ (busy?'Working…':'Refresh data')+'</button>'+
        '<button type="button" class="secondary-btn" id="adminLogout"'+(busy?' disabled':'')+'>Sign out</button></div>'+
    '</header>'+
    '<div class="admin-stats" role="group" aria-label="Account service summary">'+
      stat(Number(s.usersTotal??users.length).toLocaleString(),'accounts','All registered accounts')+
      stat(Number(s.activeSubscribers||0).toLocaleString(),'subscribed','Currently active plans','positive')+
      stat(Number(s.expiringSoon||0).toLocaleString(),'expiring soon','Active plans ending within 7 days','attention')+
      stat(Number(s.pendingPayments||0).toLocaleString(),'payments pending','Stored transaction records','attention')+
      stat(money(s.pendingWithdrawalNaira||0),'payout queue',Number(s.pendingWithdrawals||0)+' requests awaiting review','attention')+
      stat(Number(s.unreadNotifications||0).toLocaleString(),'unread alerts','Across the stored notification queue',Number(s.unreadNotifications)?'attention':'')+
    '</div>'+
    '<p class="admin-service-note"><strong>Service scope:</strong> this is the private Node account portal. Payment rows reflect records stored by the service; verify settlement with the payment provider. Recording a payout here does not transfer funds.</p>'+
    '<nav class="admin-tabs" role="tablist" aria-label="Administration sections">'+tabs.map(tabButton).join('')+'</nav>'+
    '<section id="adminPanel" role="tabpanel" aria-labelledby="admin-tab-'+esc(view.tab)+'" tabindex="0">'+panel+'</section>';
}
function panelContent(){
  switch(view.tab){
    case 'accounts':return accountsPanel();
    case 'payments':return paymentsPanel();
    case 'referrals':return referralsPanel();
    case 'withdrawals':return withdrawalsPanel();
    case 'notifications':return notificationsPanel();
    case 'activity':return activityPanel();
    case 'analytics':return analyticsPanel();
    default:return overviewPanel();
  }
}
function overviewPanel(){
  const s=summary(),payments=data.transactions||[],withdrawals=data.withdrawals||[],audit=data.audit||[];
  const pendingPayments=payments.filter(x=>x.status==='pending').slice(0,4);
  const pendingWithdrawals=withdrawals.filter(x=>x.status==='pending').slice(0,4);
  const recentActivity=audit.slice(0,5);
  const paymentRows=pendingPayments.length?pendingPayments.map(t=>
    '<div class="admin-compact-row"><span>'+esc(t.email||t.userId||'Unknown account')+'<small>'+esc(String(t.plan||'plan').toUpperCase())+' · '+esc(t.reference||'No reference')+'</small></span><strong>'+money(t.amount)+'</strong><span>'+statusPill(t.status)+'</span></div>'
  ).join(''):emptyState('✓','No pending payment records','New pending transactions will appear here.');
  const payoutRows=pendingWithdrawals.length?pendingWithdrawals.map(w=>{
    const u=(data.users||[]).find(x=>x.id===w.userId);
    return '<div class="admin-compact-row"><span>'+esc(u?.email||w.userId||'Unknown account')+'<small>Account ending '+esc(w.accountNumberLast4||'—')+' · due '+esc(dateTime(w.expectedBy))+'</small></span><strong>'+money(w.amount)+'</strong><span>'+statusPill(w.status)+'</span></div>';
  }).join(''):emptyState('✓','Payout queue is clear','Pending withdrawal requests will appear here.');
  const activityRows=recentActivity.length?recentActivity.map(a=>
    '<div class="admin-compact-row"><span>'+esc(a.event||'Activity')+'<small>'+esc(a.actor||'System')+' · '+esc(relativeTime(a.date))+'</small></span><span>'+esc(detailText(a.details,120))+'</span></div>'
  ).join(''):emptyState('○','No recorded activity','Administrative and security events will appear here.');
  return '<div class="admin-overview-grid">'+
    '<section class="admin-card"><div class="admin-section-head"><div><h3>Payment records</h3><p>'+esc(Number(s.successfulPayments||0))+' successful · '+esc(Number(s.failedPayments||0)+Number(s.abandonedPayments||0))+' failed or abandoned</p></div><button type="button" class="text-btn" data-tab="payments">View payments</button></div>'+
      '<p class="admin-context">Stored plan amounts are not a provider settlement report.</p>'+paymentRows+'</section>'+
    '<section class="admin-card"><div class="admin-section-head"><div><h3>Payout review</h3><p>'+esc(Number(s.pendingWithdrawals||0))+' pending · '+money(s.pendingWithdrawalNaira||0)+' queued</p></div><button type="button" class="text-btn" data-tab="withdrawals">Review payouts</button></div>'+
      '<p class="admin-context">Complete the transfer in your banking channel before recording it as paid here.</p>'+payoutRows+'</section>'+
    '<section class="admin-card admin-overview-activity"><div class="admin-section-head"><div><h3>Recent activity</h3><p>Most recent security and account events</p></div><button type="button" class="text-btn" data-tab="activity">Open activity log</button></div>'+activityRows+'</section>'+
    '<section class="admin-card admin-overview-shortcuts"><h3>Quick navigation</h3><p>Jump to the queue that needs your attention.</p><div class="admin-shortcuts">'+
      '<button type="button" class="secondary-btn" data-tab="accounts">Find an account <span>'+esc(s.usersTotal||0)+'</span></button>'+
      '<button type="button" class="secondary-btn" data-tab="referrals">Referral performance <span>'+esc(s.referralSignups||0)+'</span></button>'+
      '<button type="button" class="secondary-btn" data-tab="notifications">Unread alerts <span>'+esc(s.unreadNotifications||0)+'</span></button>'+
      '<button type="button" class="secondary-btn" data-tab="analytics">Public reader analytics <span>30 days</span></button>'+
    '</div></section></div>';
}
function analyticsPageLabel(page){
  return({home:'Home',bible:'Bible reader',study:'Study',search:'Search',prayer:'Prayer',devotional:'Devotional',plans:'Plans',ministry:'Ministry',profile:'Profile',presentation:'Presentation'})[page]||'Other';
}
function analyticsDate(value){
  const date=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return'—';
  return new Date(date+'T00:00:00Z').toLocaleDateString(undefined,{day:'numeric',month:'short',timeZone:'UTC'});
}
function analyticsPanel(){
  const analytics=data.analytics||{},daily=Array.isArray(analytics.daily)?analytics.daily:[],pages=Array.isArray(analytics.pages)?analytics.pages:[];
  const maxViews=Math.max(1,...daily.map(day=>Math.max(0,Number(day.views)||0)));
  const maxVisits=Math.max(1,...daily.map(day=>Math.max(0,Number(day.visits)||0)));
  const dailyRows=daily.map(day=>{
    const views=Math.max(0,Math.floor(Number(day.views)||0)),visits=Math.max(0,Math.floor(Number(day.visits)||0));
    const viewWidth=views?Math.max(1,Math.round(views/maxViews*100)):0,visitWidth=visits?Math.max(1,Math.round(visits/maxVisits*100)):0;
    return '<div class="admin-analytics-row" role="row"><time role="cell">'+esc(analyticsDate(day.date))+'</time><div class="admin-analytics-bars" role="cell" aria-label="'+views+' page views and '+visits+' tab visits"><span class="admin-analytics-bar views" aria-hidden="true" style="width:'+viewWidth+'%"></span><span class="admin-analytics-bar visits" aria-hidden="true" style="width:'+visitWidth+'%"></span></div><strong role="cell">'+views.toLocaleString()+'</strong><span role="cell">'+visits.toLocaleString()+'</span></div>';
  }).join('');
  const pageRows=pages.filter(page=>Number(page.views)>0).map(page=>
    '<div class="admin-analytics-page"><span>'+esc(analyticsPageLabel(page.page))+'</span><strong>'+Math.max(0,Math.floor(Number(page.views)||0)).toLocaleString()+'</strong></div>'
  ).join('');
  return '<div class="admin-record-summary"><div><span>Page views · '+esc(analytics.rangeDays||30)+' days</span><strong>'+Math.max(0,Number(analytics.totalViews)||0).toLocaleString()+'</strong></div><div><span>Tab-session visits</span><strong>'+Math.max(0,Number(analytics.totalVisits)||0).toLocaleString()+'</strong><small>Approximate session starts, not unique people</small></div><div><span>Sections tracked</span><strong>'+pages.length.toLocaleString()+'</strong></div><div><span>Data window</span><strong>'+esc(analyticsDate(analytics.from))+' – '+esc(analyticsDate(analytics.through))+'</strong><small>UTC daily totals</small></div></div>'+
    '<p class="admin-context">Only allow-listed section totals are collected. No names, IPs, cookies, device IDs, fingerprints, search terms, verse references, or raw visit history are stored. Anonymous totals are retained for up to 400 days.</p>'+
    '<section class="admin-card"><div class="admin-section-head"><div><h3>Daily trend</h3><p>Page views and browser-tab session starts</p></div></div>'+
      '<div class="admin-analytics-legend"><span><i class="views"></i>Page views</span><span><i class="visits"></i>Tab-session visits</span></div>'+
      '<div class="admin-analytics-chart" role="table" aria-label="Daily anonymous reader analytics"><div class="admin-analytics-row heading" role="row"><span role="columnheader">Day</span><span role="columnheader">Relative volume</span><span role="columnheader">Views</span><span role="columnheader">Visits</span></div>'+
      (dailyRows||'')+'</div></section>'+
    '<section class="admin-card"><div class="admin-section-head"><div><h3>Reader sections</h3><p>Page views during this 30-day window</p></div></div>'+
      (pageRows?'<div class="admin-analytics-pages">'+pageRows+'</div>':emptyState('○','No reader analytics yet','Aggregate section totals will appear after public readers visit the Vercel app.'))+'</section>';
}
function accountMatches(u,q){
  return [u.email,u.name,u.id,u.referralCode,u.plan,u.status].some(x=>String(x||'').toLowerCase().includes(q));
}
function accountsPanel(){
  const all=data.users||[],q=view.accountQuery.trim().toLowerCase();
  const filtered=all.filter(u=>{
    if(view.accountStatus!=='all'&&u.status!==view.accountStatus)return false;
    if(view.accountAuth==='google'&&!u.hasGoogle)return false;
    if(view.accountAuth==='password'&&!u.hasPassword)return false;
    return !q||accountMatches(u,q);
  });
  const key=view.accountSort,dir=view.accountDir;
  filtered.sort((a,b)=>{
    const x=a[key],y=b[key];
    if(typeof x==='number'&&typeof y==='number')return(x-y)*dir;
    return String(x??'').localeCompare(String(y??''),undefined,{numeric:true,sensitivity:'base'})*dir;
  });
  const sortOptions=[['createdAt','Recently joined'],['email','Email'],['name','Name'],['status','Status'],['plan','Plan'],['walletBalance','Wallet balance'],['daysRemaining','Days remaining']].map(([value,label])=>
    '<option value="'+value+'"'+(view.accountSort===value?' selected':'')+'>'+label+'</option>').join('');
  const statusOptions=[['all','All statuses'],['active','Subscribed'],['trial','Trial'],['expired','Expired'],['admin','Admin']].map(([value,label])=>
    '<option value="'+value+'"'+(view.accountStatus===value?' selected':'')+'>'+label+'</option>').join('');
  const authOptions=[['all','All sign-in methods'],['password','Password available'],['google','Google linked']].map(([value,label])=>
    '<option value="'+value+'"'+(view.accountAuth===value?' selected':'')+'>'+label+'</option>').join('');
  const directionLabel=view.accountSort==='createdAt'?(dir<0?'Newest first':'Oldest first'):(dir<0?'Descending':'Ascending');
  const pageSize=25,pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  view.accountPage=Math.max(0,Math.min(view.accountPage,pages-1));
  const pageRows=filtered.slice(view.accountPage*pageSize,(view.accountPage+1)*pageSize);
  const cards=pageRows.length?pageRows.map(accountCard).join(''):emptyState(all.length?'⌕':'○',all.length?'No matching accounts':'No accounts yet',all.length?'Adjust the search or filters and try again.':'Accounts will appear here when people register.');
  const pager=filtered.length>pageSize?'<div class="admin-pagination"><button type="button" class="secondary-btn small-btn" data-account-page="-1"'+(view.accountPage<=0?' disabled':'')+'>Previous accounts</button><span>Page '+(view.accountPage+1)+' of '+pages+' · showing '+pageRows.length+' of '+filtered.length+'</span><button type="button" class="secondary-btn small-btn" data-account-page="1"'+(view.accountPage>=pages-1?' disabled':'')+'>Next accounts</button></div>':'';
  return '<div class="admin-toolbar admin-filter-toolbar">'+
    '<label class="admin-search-field"><span>Search accounts</span><input id="accountSearch" type="search" autocomplete="off" placeholder="Email, name, referral code, plan or ID" value="'+esc(view.accountQuery)+'"></label>'+
    '<label class="admin-filter-field"><span>Status</span><select id="accountStatus">'+statusOptions+'</select></label>'+
    '<label class="admin-filter-field"><span>Sign-in</span><select id="accountAuth">'+authOptions+'</select></label>'+
    '<label class="admin-filter-field"><span>Sort by</span><select id="accountSort">'+sortOptions+'</select></label>'+
    '<button type="button" class="secondary-btn small-btn admin-sort-direction" id="accountSortDirection" aria-label="Sort '+(dir<0?'descending':'ascending')+'; click to reverse">'+directionLabel+'</button>'+
    '<span class="admin-count" aria-live="polite">'+filtered.length+' of '+all.length+' accounts</span></div>'+
    '<div class="admin-account-list">'+cards+'</div>'+pager;
}
function accountCard(u){
  const details=[u.name,u.referralCode?'Referral '+u.referralCode:'',u.id].filter(Boolean).join(' · ');
  const auth=[u.hasPassword?'Password':'',u.hasGoogle?'Google':''].filter(Boolean).join(' + ')||'No password sign-in';
  const access=u.daysRemaining==null?'No expiry':(u.daysRemaining+' day'+(u.daysRemaining===1?'':'s')+' remaining');
  const source=u.adminGranted?'Complimentary grant'+(u.entitlementExpiresAt?' · ends '+dateTime(u.entitlementExpiresAt):' · permanent'):u.paidSubscription?'Paid subscription':'Trial / free access';
  const wallet=Number(u.walletBalance||0);
  const reset=(data.passwordResets||[]).find(item=>item.userId===u.id);
  const recovery=u.hasPassword?(reset?'Active code · expires '+dateTime(reset.expiresAt):'No active reset code'):'No password recovery required';
  return '<article class="admin-account">'+
    '<div class="admin-account-main"><div class="admin-account-identity"><h3>'+esc(u.email||'Email not set')+'</h3><p>'+esc(details||'No additional account details')+'</p></div>'+
      '<div class="admin-account-badges">'+statusPill(u.status)+' '+statusPill(u.plan||'none')+(u.adminGranted?' '+statusPill('admin-granted'):'')+'</div></div>'+
    '<div class="admin-account-facts"><span><small>Access</small><strong>'+esc(access)+'</strong></span><span><small>Sign-in</small><strong>'+esc(auth)+'</strong></span><span><small>Referral wallet</small><strong>'+money(wallet)+'</strong></span><span><small>Joined</small><strong>'+esc(dateTime(u.createdAt))+'</strong></span></div>'+
    '<p class="admin-account-recovery"><span>Access source</span><strong>'+esc(source)+'</strong></p><p class="admin-account-recovery"><span>Password recovery</span><strong>'+esc(recovery)+'</strong></p>'+
    '<div class="admin-account-actions">'+
      '<button type="button" class="secondary-btn small-btn" data-action="grant" data-user="'+esc(u.id)+'"'+(u.paidSubscription?' disabled title="An active paid subscription cannot be replaced by a complimentary grant"':'')+'>Grant access</button>'+
      (u.adminGranted?'<button type="button" class="danger-btn small-btn" data-action="revoke-grant" data-user="'+esc(u.id)+'">Revoke grant</button>':'')+
      '<button type="button" class="secondary-btn small-btn" data-action="reset-code" data-user="'+esc(u.id)+'"'+(!u.hasPassword?' disabled title="This account has no password sign-in"':'')+'>Issue reset code</button>'+
      '<button type="button" class="secondary-btn small-btn" data-action="reset-account" data-user="'+esc(u.id)+'">Reset account</button>'+
      '<button type="button" class="danger-btn small-btn" data-action="delete-account" data-user="'+esc(u.id)+'">Delete</button>'+
    '</div></article>';
}
function paymentsPanel(){
  const all=data.transactions||[],q=view.paymentQuery.trim().toLowerCase();
  const rows=all.filter(t=>{
    if(view.paymentStatus!=='all'&&t.status!==view.paymentStatus)return false;
    return !q||[t.email,t.userId,t.reference,t.plan,t.status].some(x=>String(x||'').toLowerCase().includes(q));
  });
  const failed=Number(summary().failedPayments||0)+Number(summary().abandonedPayments||0);
  const options=[['all','All statuses'],['pending','Pending'],['success','Successful'],['failed','Failed'],['abandoned','Abandoned']].map(([value,label])=>
    '<option value="'+value+'"'+(view.paymentStatus===value?' selected':'')+'>'+label+'</option>').join('');
  const cards=rows.length?rows.map(t=>{
    const whenPaid=t.paidAt?'Paid '+dateTime(t.paidAt):t.failedAt?'Failed '+dateTime(t.failedAt):'Created '+dateTime(t.createdAt);
    return '<article class="admin-record-card"><div class="admin-record-main"><div><h3>'+esc(t.email||t.userId||'Unknown account')+'</h3><p>'+esc(String(t.plan||'Plan').toUpperCase())+' plan · '+esc(t.reference||'No reference')+'</p></div>'+statusPill(t.status)+'</div>'+
      '<div class="admin-record-facts"><span><small>Recorded plan amount</small><strong>'+money(t.amount)+'</strong></span><span><small>Record date</small><strong>'+esc(dateTime(t.createdAt))+'</strong></span><span><small>Account ID</small><strong>'+esc(t.userId||'—')+'</strong></span></div>'+
      '<p class="admin-record-foot">'+esc(whenPaid)+'</p></article>';
  }).join(''):emptyState(all.length?'⌕':'○',all.length?'No matching payment records':'No payment records',all.length?'Try another search or status.':'Payment transactions recorded by the account service will appear here.');
  return '<section class="admin-card admin-record-summary"><div><span>All records</span><strong>'+esc(summary().totalPayments??all.length)+'</strong></div><div><span>Successful</span><strong>'+esc(summary().successfulPayments||0)+'</strong><small>'+money(summary().successfulPlanValueNaira||0)+' plan value</small></div><div><span>Pending</span><strong>'+esc(summary().pendingPayments||0)+'</strong><small>'+money(summary().pendingPlanValueNaira||0)+' plan value</small></div><div><span>Failed / abandoned</span><strong>'+esc(failed)+'</strong></div></section>'+
    '<p class="admin-context">Showing up to 250 recent transactions plus any older pending records. Amounts are stored plan prices—not a payment-provider settlement or net-revenue report. Confirm status in the provider dashboard when reconciling payments.</p>'+
    '<div class="admin-toolbar admin-filter-toolbar"><label class="admin-search-field"><span>Search transactions</span><input id="paymentSearch" type="search" autocomplete="off" placeholder="Member, reference, plan or status" value="'+esc(view.paymentQuery)+'"></label><label class="admin-filter-field"><span>Status</span><select id="paymentStatus">'+options+'</select></label><span class="admin-count">'+rows.length+' of '+all.length+' loaded</span></div>'+
    '<div class="admin-record-list">'+cards+'</div>';
}
function referralsPanel(){
  const all=data.referrals||[],q=view.referralQuery.trim().toLowerCase();
  const rows=all.filter(r=>[r.email,r.name,r.referralCode,r.userId].some(x=>String(x||'').toLowerCase().includes(q)));
  const cards=rows.length?rows.map(r=>
    '<article class="admin-record-card"><div class="admin-record-main"><div><h3>'+esc(r.email||r.userId)+'</h3><p>'+esc(r.name||'')+(r.name?' · ':'')+'Referral code <strong>'+esc(r.referralCode||'—')+'</strong></p></div><span class="admin-referral-count">'+esc(r.signups)+' signup'+(r.signups===1?'':'s')+'</span></div>'+
      '<div class="admin-record-facts"><span><small>Active paid referrals</small><strong>'+esc(r.paidReferrals||0)+'</strong></span><span><small>Signup rewards</small><strong>'+money(r.signupRewardsNaira)+'</strong></span><span><small>Payment commissions</small><strong>'+money(r.commissionNaira)+'</strong></span><span><small>Wallet balance</small><strong>'+money(r.walletBalance)+'</strong></span></div>'+
      '<p class="admin-record-foot">Total recorded referral earnings: <strong>'+money(r.earnedNaira)+'</strong> · Account ID '+esc(r.userId)+'</p></article>'
  ).join(''):emptyState(all.length?'⌕':'○',all.length?'No matching referral accounts':'No referral activity',all.length?'Try a different email, name or referral code.':'Referral signups and recorded wallet rewards will appear here.');
  return '<section class="admin-card admin-record-summary"><div><span>Referred signups</span><strong>'+esc(summary().referralSignups||0)+'</strong></div><div><span>Signup rewards</span><strong>'+money(summary().referralSignupBonusNaira||0)+'</strong></div><div><span>Payment commissions</span><strong>'+money(summary().referralCommissionNaira||0)+'</strong></div><div><span>Referrer accounts</span><strong>'+esc(all.length)+'</strong></div></section>'+
    '<p class="admin-context">Referral totals come from wallet ledger entries in this service. Wallet balance is separate from pending and already-paid withdrawals; this view does not independently verify provider payment settlement.</p>'+
    '<div class="admin-toolbar admin-filter-toolbar"><label class="admin-search-field"><span>Search referrals</span><input id="referralSearch" type="search" autocomplete="off" placeholder="Email, name or referral code" value="'+esc(view.referralQuery)+'"></label><span class="admin-count">'+rows.length+' referrer accounts</span></div><div class="admin-record-list">'+cards+'</div>';
}
function withdrawalsPanel(){
  const all=data.withdrawals||[],q=view.withdrawalQuery.trim().toLowerCase();
  const users=data.users||[];
  const rows=all.filter(w=>{
    if(view.withdrawalStatus!=='all'&&w.status!==view.withdrawalStatus)return false;
    const u=users.find(x=>x.id===w.userId);
    return !q||[u?.email,u?.name,w.userId,w.accountName,w.id,w.status].some(x=>String(x||'').toLowerCase().includes(q));
  });
  const options=[['pending','Pending review'],['paid','Recorded paid'],['all','All payouts']].map(([value,label])=>
    '<option value="'+value+'"'+(view.withdrawalStatus===value?' selected':'')+'>'+label+'</option>').join('');
  const cards=rows.length?rows.map(w=>{
    const u=users.find(x=>x.id===w.userId),account='Account ending '+(w.accountNumberLast4||'—');
    const paid=w.status==='paid';
    return '<article class="admin-record-card admin-payout-card"><div class="admin-record-main"><div><h3>'+esc(u?.email||w.userId||'Unknown account')+'</h3><p>'+esc(w.accountName||'Account holder not named')+' · '+esc(account)+'</p></div>'+statusPill(w.status)+'</div>'+
      '<div class="admin-record-facts"><span><small>Amount</small><strong>'+money(w.amount)+'</strong></span><span><small>Requested</small><strong>'+esc(dateTime(w.requestedAt))+'</strong></span><span><small>Expected by</small><strong>'+esc(dateTime(w.expectedBy))+'</strong></span>'+(paid?'<span><small>Recorded paid</small><strong>'+esc(dateTime(w.paidAt))+'</strong></span>':'')+'</div>'+
      '<div class="admin-payout-actions">'+(!paid?'<button type="button" class="secondary-btn small-btn" data-action="payout-details" data-id="'+esc(w.id)+'">View bank details</button><button type="button" class="primary-btn small-btn" data-action="payout-paid" data-id="'+esc(w.id)+'">Record as paid</button>':'<span class="admin-muted">Recorded by '+esc(w.paidBy||'admin')+'</span>')+'</div>'+
      '<small class="admin-record-id">Request ID '+esc(w.id)+'</small></article>';
  }).join(''):emptyState(all.length?'⌕':'✓',all.length?'No matching payout requests':(view.withdrawalStatus==='pending'?'No payouts awaiting review':'No payout records'),all.length?'Change the search or status filter.':'Withdrawal requests from member referral wallets will appear here.');
  return '<section class="admin-card admin-record-summary"><div><span>Pending requests</span><strong>'+esc(summary().pendingWithdrawals||0)+'</strong><small>'+money(summary().pendingWithdrawalNaira||0)+' queued</small></div><div><span>Recorded paid</span><strong>'+esc(summary().paidWithdrawals||0)+'</strong><small>'+money(summary().paidWithdrawalNaira||0)+' recorded</small></div><div><span>Records loaded</span><strong>'+esc(all.length)+'</strong></div></section>'+
    '<p class="admin-context admin-context-warning"><strong>Manual settlement:</strong> verify beneficiary and account details, complete the transfer outside this portal, then choose “Record as paid”. That action records the status only; it does not send money. Summary totals cover the store; the list loads 200 recent requests plus any older pending requests.</p>'+
    '<div class="admin-toolbar admin-filter-toolbar"><label class="admin-search-field"><span>Search payouts</span><input id="withdrawalSearch" type="search" autocomplete="off" placeholder="Member, holder name or request ID" value="'+esc(view.withdrawalQuery)+'"></label><label class="admin-filter-field"><span>Status</span><select id="withdrawalStatus">'+options+'</select></label><span class="admin-count">'+rows.length+' of '+all.length+' loaded</span></div><div class="admin-record-list">'+cards+'</div>';
}
function notificationsPanel(){
  const all=data.notifications||[],unreadTotal=Number(summary().unreadNotifications||0);
  const rows=all.filter(n=>view.notificationFilter==='all'||!n.read);
  const loadedUnread=all.filter(n=>!n.read).length;
  const noAlerts=view.notificationFilter==='unread'&&unreadTotal>0&&!loadedUnread
    ?emptyState('i','Unread alerts are older','The service reports '+unreadTotal+' unread alert'+(unreadTotal===1?'':'s')+', but none are in the 50 newest loaded. Use “Mark all read” to clear the queue after review.')
    :emptyState('✓',view.notificationFilter==='unread'?'No unread alerts':'No notifications',view.notificationFilter==='unread'?'Nothing in the loaded alert list needs review.':'New service alerts will appear here.');
  const cards=rows.length?rows.map(n=>
    '<article class="admin-notification'+(n.read?'':' unread')+'"><div class="admin-notification-copy"><div class="admin-record-main"><h3>'+esc(n.type||'Notice').replace(/[._-]+/g,' ')+'</h3>'+statusPill(n.read?'read':'unread')+'</div><p>'+esc(n.message||'Notification details are unavailable.')+'</p><small>'+esc(dateTime(n.date))+' · '+esc(relativeTime(n.date))+'</small></div>'+
    (!n.read?'<button type="button" class="secondary-btn small-btn" data-action="mark-read" data-id="'+esc(n.id)+'">Mark read</button>':'')+'</article>'
  ).join(''):noAlerts;
  return '<div class="admin-notification-heading"><div><h3>Notification queue</h3><p>'+esc(unreadTotal)+' unread across the service. The portal loads the 50 newest notifications.</p></div>'+
    (unreadTotal?'<button type="button" class="secondary-btn small-btn" data-action="mark-all-read"'+(busy?' disabled':'')+'>Mark all read</button>':'')+'</div>'+
    '<div class="admin-filter-pills" role="group" aria-label="Filter notifications"><button type="button" class="'+(view.notificationFilter==='unread'?'active':'')+'" aria-pressed="'+(view.notificationFilter==='unread')+'" data-note-filter="unread">Unread in list</button><button type="button" class="'+(view.notificationFilter==='all'?'active':'')+'" aria-pressed="'+(view.notificationFilter==='all')+'" data-note-filter="all">Newest 50</button></div>'+
    '<div class="admin-notification-list">'+cards+'</div>';
}
function detailText(details,maxLength){
  if(!details||typeof details!=='object')return details==null?'—':String(details);
  const parts=Object.keys(details).map(key=>{
    let value=details[key];
    if(value&&typeof value==='object'){try{value=JSON.stringify(value)}catch{value='[details]'}}
    return key+': '+(value==null?'—':String(value));
  });
  const text=parts.join(' · ');
  return maxLength&&text.length>maxLength?text.slice(0,maxLength-1)+'…':text||'—';
}
function activityPanel(){
  const all=data.audit||[],q=view.activityQuery.trim().toLowerCase();
  const filtered=all.filter(a=>[a.event,a.actor,detailText(a.details,500)].some(x=>String(x||'').toLowerCase().includes(q)));
  const pageSize=25,pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  view.activityPage=Math.min(view.activityPage,pages-1);
  const start=view.activityPage*pageSize,rows=filtered.slice(start,start+pageSize);
  const entries=rows.length?rows.map(a=>
    '<article class="admin-activity-item"><div class="admin-activity-event"><strong>'+esc(a.event||'Activity')+'</strong><small>'+esc(dateTime(a.date))+' · '+esc(relativeTime(a.date))+'</small></div><p>'+esc(detailText(a.details,500))+'</p><span class="admin-activity-actor">'+esc(a.actor||'System')+'</span></article>'
  ).join(''):emptyState('○',all.length?'No matching activity':'No activity recorded',all.length?'Try another event, actor or detail.':'Administrative and security events will appear here.');
  const pager=filtered.length>pageSize?'<div class="admin-pagination"><button type="button" class="secondary-btn small-btn" data-activity-page="-1"'+(view.activityPage<=0?' disabled':'')+'>Previous</button><span>Page '+(view.activityPage+1)+' of '+pages+' · '+filtered.length+' events</span><button type="button" class="secondary-btn small-btn" data-activity-page="1"'+(view.activityPage>=pages-1?' disabled':'')+'>Next</button></div>':'';
  return '<div class="admin-section-head"><div><h3>Security &amp; account activity</h3><p>The newest '+esc(all.length)+' recorded events, newest first.</p></div></div>'+
    '<p class="admin-context">Admin actions, payment updates and password recovery events are recorded here. The log does not show passwords or reset codes.</p>'+
    '<div class="admin-toolbar admin-filter-toolbar"><label class="admin-search-field"><span>Search activity</span><input id="activitySearch" type="search" autocomplete="off" placeholder="Event, actor or detail" value="'+esc(view.activityQuery)+'"></label><span class="admin-count">'+filtered.length+' matching events</span></div><div class="admin-activity-list">'+entries+'</div>'+pager;
}
function preserveSearch(id,update){
  const before=$('#'+id),start=before?.selectionStart,end=before?.selectionEnd;
  update();render();
  const after=$('#'+id);
  if(after){after.focus();try{after.setSelectionRange(start??after.value.length,end??after.value.length)}catch{}}
}
function userById(id){return(data?.users||[]).find(u=>u.id===id)}
function showDialog(title,body,options={}){
  if(!modalRoot)return;
  if(modalRoot.hidden)returnFocus=document.activeElement;
  modalGeneration++;
  modalSubmit=options.onSubmit||null;
  const form=!!options.onSubmit;
  modalRoot.hidden=false;
  modalRoot.innerHTML='<div class="admin-modal-backdrop" data-admin-backdrop><section class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminModalTitle" tabindex="-1">'+
    '<header class="admin-modal-head"><div><div class="eyebrow">'+esc(options.eyebrow||'ADMIN ACTION')+'</div><h2 id="adminModalTitle">'+esc(title)+'</h2>'+(options.description?'<p>'+esc(options.description)+'</p>':'')+'</div><button type="button" class="admin-modal-close" data-modal-close aria-label="Close dialog">×</button></header>'+
    (form?'<form id="adminModalForm" novalidate><div class="admin-modal-body">'+body+'</div><div class="admin-modal-error" id="adminModalError" role="alert" hidden></div><footer class="admin-modal-actions"><button type="button" class="secondary-btn" data-modal-close>Cancel</button><button type="submit" class="'+(options.danger?'danger-btn':'primary-btn')+'" data-modal-submit>'+(options.submitLabel||'Confirm')+'</button></footer></form>':'<div class="admin-modal-body">'+body+'</div><footer class="admin-modal-actions"><button type="button" class="secondary-btn" data-modal-close>Close</button></footer>')+
    '</section></div>';
  const focusTarget=modalRoot.querySelector('[data-autofocus]')||modalRoot.querySelector('[data-modal-submit]')||modalRoot.querySelector('[data-modal-close]');
  focusTarget?.focus();
}
function closeDialog(restore=true){
  if(!modalRoot)return;
  modalRoot.hidden=true;modalRoot.innerHTML='';modalSubmit=null;modalGeneration++;
  if(restore){if(returnFocus?.isConnected)returnFocus.focus();else focusCurrentTab();}
  returnFocus=null;
}
function modalError(message){
  const error=$('#adminModalError');
  if(error){error.textContent=message;error.hidden=false;}
}
async function refreshOverview(){
  try{data=await api('/api/admin/overview');lastLoaded=Date.now();return true;}
  catch(e){toast('Change saved, but the dashboard could not refresh: '+e.message,'error');return false;}
}
function focusCurrentTab(){document.querySelector('[data-tab="'+view.tab+'"]')?.focus();}
async function submitModal(event){
  const form=event.target.closest('#adminModalForm');
  if(!form||!modalSubmit)return;
  event.preventDefault();
  if(busy)return;
  const generation=modalGeneration,submit=form.querySelector('[data-modal-submit]');
  const original=submit?.textContent||'Confirm';
  busy=true;app?.setAttribute('aria-busy','true');
  if(submit){submit.disabled=true;submit.textContent='Saving…';}
  try{
    const result=await modalSubmit(new FormData(form),form);
    if(result?.success)toast(result.success,'success');
    if(generation===modalGeneration)closeDialog(false);
    await refreshOverview();
  }catch(error){
    modalError(error.message||'The action could not be completed.');
    if(submit){submit.disabled=false;submit.textContent=original;}
  }finally{
    busy=false;render();
    if(modalRoot.hidden)focusCurrentTab();
  }
}
async function listAction(button,request,success){
  if(busy)return;
  busy=true;app?.setAttribute('aria-busy','true');button.disabled=true;
  try{
    await request();
    toast(success,'success');
    await refreshOverview();
  }catch(error){toast(error.message||'The action could not be completed.','error');}
  finally{busy=false;render();}
}
function findUser(userId){
  const u=userById(userId);
  if(!u){toast('Account is no longer in the loaded data. Refresh and try again.','error');return null;}
  return u;
}
function openGrant(userId){
  const u=findUser(userId);if(!u)return;
  const plans=data.plans||[];
  const options=plans.map(p=>'<option value="'+esc(p.id)+'"'+(p.id==='premium'?' selected':'')+'>'+esc(p.name)+' · '+esc(money(p.price))+'</option>').join('');
  if(!options){toast('No access plans are available.','error');return;}
  showDialog('Grant member access',
    '<p class="admin-modal-intro">Grant complimentary access to <strong>'+esc(u.email)+'</strong>. This change is recorded in the activity log.</p>'+
    '<label class="admin-form-field"><span>Plan</span><select name="plan">'+options+'</select></label>'+
    '<label class="admin-form-field"><span>Duration</span><span class="admin-grant-duration"><input type="number" name="durationAmount" min="1" max="1200" value="1" required><select name="durationUnit" aria-label="Duration unit"><option value="days">Days</option><option value="months" selected>Months</option><option value="years">Years</option></select></span></label>'+
    '<label class="admin-check-field"><input type="checkbox" name="forever" id="grantForever"><span>Permanent access (no expiry)</span></label>'+
    '<p class="admin-context">Choose a whole number: up to 36,500 days, 1,200 months, or 100 years. Calendar months and years are calculated exactly. This grants service access; it does not charge the member.</p>',
    {description:'Account access change',submitLabel:'Grant access',onSubmit:async form=>{
      const forever=form.get('forever')==='on',plan=String(form.get('plan')||''),payload={plan,forever};
      if(!forever){
        const durationAmount=Number(form.get('durationAmount')),durationUnit=String(form.get('durationUnit')||''),limits={days:36500,months:1200,years:100};
        if(!Object.hasOwn(limits,durationUnit)||!Number.isSafeInteger(durationAmount)||durationAmount<1||durationAmount>limits[durationUnit])throw Error('Enter a valid whole-number duration for the selected unit.');
        payload.durationAmount=durationAmount;payload.durationUnit=durationUnit;
      }
      await api('/api/admin/users/'+encodeURIComponent(userId)+'/entitlement',{method:'POST',body:JSON.stringify(payload)});
      return{success:'Access granted to '+u.email+'.'};
    }});
  const forever=$('#grantForever'),amount=modalRoot.querySelector('[name="durationAmount"]'),unit=modalRoot.querySelector('[name="durationUnit"]');
  const limits={days:36500,months:1200,years:100};
  if(unit&&amount)unit.onchange=()=>{amount.max=String(limits[unit.value]||36500);if(Number(amount.value)>Number(amount.max))amount.value=amount.max;};
  if(forever&&amount&&unit)forever.onchange=()=>{amount.disabled=forever.checked;unit.disabled=forever.checked;};
}
function openRevokeGrant(userId){
  const u=findUser(userId);if(!u)return;
  if(!u.adminGranted){toast('This account has no administrator-granted access to revoke.','error');return;}
  const expiry=u.entitlementExpiresAt?dateTime(u.entitlementExpiresAt):'no expiry';
  showDialog('Revoke complimentary access',
    '<div class="admin-danger-notice"><strong>'+esc(u.email)+'</strong> has administrator-granted access ending '+esc(expiry)+'.</div><p class="admin-modal-intro">This removes only the complimentary grant. It does not cancel a paid subscription. The change is recorded in the activity log.</p>',
    {description:'Access revocation',submitLabel:'Revoke grant',danger:true,onSubmit:async()=>{
      await api('/api/admin/users/'+encodeURIComponent(userId)+'/entitlement',{method:'DELETE'});
      return{success:'Complimentary access revoked for '+u.email+'.'};
    }});
}
function openResetCode(userId){
  const u=findUser(userId);if(!u)return;
  showDialog('Issue a password reset code',
    '<p class="admin-modal-intro">Issue a one-time code for <strong>'+esc(u.email)+'</strong>? Any earlier unused code will be replaced.</p><div class="admin-notice">The code is shown once and expires after 30 minutes. Share it with the member over a channel you already trust.</div>',
    {description:'Recovery action',submitLabel:'Issue one-time code',onSubmit:async()=>{
      const response=await api('/api/admin/users/'+encodeURIComponent(userId)+'/password-code',{method:'POST',body:'{}'});
      showDialog('Copy the one-time code',
        '<p class="admin-modal-intro">Send this code to <strong>'+esc(u.email)+'</strong>. It can be used once and expires in 30 minutes.</p><label class="admin-form-field"><span>One-time reset code</span><input id="issuedResetCode" class="admin-code-input" value="'+esc(response.code)+'" readonly aria-label="One-time password reset code"></label><button type="button" class="secondary-btn" data-copy-reset-code>Copy code</button><p class="admin-context">This is the only time the code will be displayed. Do not leave it visible on a shared device.</p>',
        {description:'Copy before closing'});
      return{success:'Reset code issued. Copy it before closing this dialog.'};
    }});
}
function openResetAccount(userId){
  const u=findUser(userId);if(!u)return;
  const google=u.hasGoogle;
  showDialog('Reset account access',
    '<p class="admin-modal-intro">Prepare <strong>'+esc(u.email)+'</strong> for a clean sign-in. Resetting ends all active sessions.</p>'+
    '<label class="admin-check-field"><input type="checkbox" name="trial" checked><span>Restart the 30-day free trial</span></label>'+
    '<label class="admin-check-field"><input type="checkbox" name="subscription" checked><span>Remove the current subscription</span></label>'+
    (google?'<label class="admin-check-field"><input type="checkbox" name="google"><span>Unlink the Google sign-in on this account</span></label>':'')+
    (u.hasPassword?'<label class="admin-check-field"><input type="checkbox" name="password"><span>Remove the current password</span></label><p class="admin-context admin-context-warning">Only remove a password after confirming an alternate sign-in method. You may need to issue a reset code separately.</p>':'')+
    '<p class="admin-context">Session invalidation and selected changes are recorded in the activity log.</p>',
    {description:'Review each change before continuing',submitLabel:'Reset account',danger:true,onSubmit:async form=>{
      await api('/api/admin/users/'+encodeURIComponent(userId)+'/reset',{method:'POST',body:JSON.stringify({
        restartTrial:form.get('trial')==='on',clearSubscription:form.get('subscription')==='on',
        unlinkGoogle:form.get('google')==='on',clearPassword:form.get('password')==='on'
      })});
      return{success:'Account reset completed for '+u.email+'.'};
    }});
}
function openDeleteAccount(userId){
  const u=findUser(userId);if(!u)return;
  showDialog('Permanently delete account',
    '<div class="admin-danger-notice"><strong>This cannot be undone.</strong><br>Deleting '+esc(u.email)+' removes its account, transaction records, referral wallet and withdrawal requests. The audit record remains.</div>'+
    '<label class="admin-form-field"><span>Type the member’s email to confirm</span><input name="confirmEmail" type="email" autocomplete="off" required></label>',
    {description:'Permanent account deletion',submitLabel:'Delete account',danger:true,onSubmit:async form=>{
      if(String(form.get('confirmEmail')||'').trim().toLowerCase()!==String(u.email||'').toLowerCase())throw Error('The email did not match. Nothing was deleted.');
      const result=await api('/api/admin/users/'+encodeURIComponent(userId),{method:'DELETE'});
      return{success:result.message||u.email+' deleted.'};
    }});
  modalRoot.querySelector('[name="confirmEmail"]')?.focus();
}
function openPayoutDetails(id){
  if(busy)return;
  const payout=(data.withdrawals||[]).find(w=>w.id===id);
  if(!payout){toast('Payout request is no longer in the loaded data. Refresh and try again.','error');return;}
  const user=userById(payout.userId);
  busy=true;render();
  showDialog('Loading bank details','<p class="admin-modal-intro">Fetching protected account details…</p>',{description:'This access is recorded in the audit log.'});
  const requestGeneration=modalGeneration;
  api('/api/admin/withdrawals/'+encodeURIComponent(id)+'/details').then(async response=>{
    await refreshOverview();
    if(modalRoot.hidden||modalGeneration!==requestGeneration)return;
    const w=response.withdrawal||{};
    showDialog('Protected payout details',
      '<p class="admin-modal-intro">Verify these details with <strong>'+esc(user?.email||payout.userId)+'</strong> before arranging a transfer. Viewing this information is recorded.</p>'+
      '<dl class="admin-payout-details"><div><dt>Account holder</dt><dd>'+esc(w.accountName||'—')+'</dd></div><div><dt>Account number</dt><dd><code>'+esc(w.accountNumber||'—')+'</code></dd></div><div><dt>Bank code</dt><dd><code>'+esc(w.bankCode||'—')+'</code></dd></div><div><dt>Requested amount</dt><dd>'+money(payout.amount)+'</dd></div></dl>'+
      '<button type="button" class="secondary-btn" data-copy-account-number="'+esc(w.accountNumber||'')+'">Copy account number</button><p class="admin-context">Sensitive bank information is intentionally not included in the overview response.</p>',
      {description:'On-demand, audited access'});
  }).catch(error=>{
    if(modalRoot.hidden||modalGeneration!==requestGeneration)return;
    showDialog('Could not load payout details','<p class="admin-modal-intro">'+esc(error.message||'The request failed.')+'</p><p class="admin-context">Check administrator access and refresh the payout list before trying again.</p>',{description:'No details were displayed.'});
  }).finally(()=>{busy=false;render();if(modalRoot.hidden)focusCurrentTab();else modalRoot.querySelector('[data-modal-close]')?.focus();});
}
function openMarkPayout(id){
  const payout=(data.withdrawals||[]).find(w=>w.id===id);
  if(!payout){toast('Payout request is no longer in the loaded data. Refresh and try again.','error');return;}
  const user=userById(payout.userId);
  showDialog('Record payout as paid',
    '<div class="admin-danger-notice"><strong>'+money(payout.amount)+'</strong> to '+esc(user?.email||payout.userId)+' · account ending '+esc(payout.accountNumberLast4||'—')+'.</div>'+
    '<p class="admin-modal-intro">This only changes the portal record; it does not initiate or verify a bank transfer.</p><label class="admin-check-field"><input type="checkbox" name="transferConfirmed" required><span>I completed the transfer through the normal banking channel and verified the beneficiary.</span></label>',
    {description:'Manual settlement confirmation',submitLabel:'Confirm transfer recorded',onSubmit:async form=>{
      if(form.get('transferConfirmed')!=='on')throw Error('Confirm that the transfer was completed outside the portal.');
      const result=await api('/api/admin/withdrawals/'+encodeURIComponent(id)+'/pay',{method:'POST',body:'{}'});
      return{success:result.withdrawal?.status==='paid'?'Payout marked as paid.':'Payout status updated.'};
    }});
}
function showToast(message,kind){
  const root=$('#adminToast');if(!root)return;
  const item=document.createElement('div');item.className='toast'+(kind?' '+kind:'');item.setAttribute('role',kind==='error'?'alert':'status');item.textContent=message;root.appendChild(item);
  setTimeout(()=>item.remove(),5000);
}
const toast=showToast;
async function copyText(text){
  try{await navigator.clipboard.writeText(text);toast('Copied to clipboard.','success');}
  catch{toast('Clipboard access was blocked. Select and copy the displayed value manually.','error');}
}
function bind(){
  if(!app)return;
  app.addEventListener('click',async event=>{
    const tab=event.target.closest('[data-tab]');
    if(tab){view.tab=tab.dataset.tab;render();document.querySelector('[data-tab="'+view.tab+'"]')?.focus();return;}
    const action=event.target.closest('[data-action]');
    if(action){
      const id=action.dataset.user||action.dataset.id;
      switch(action.dataset.action){
        case 'grant':openGrant(id);break;
        case 'revoke-grant':openRevokeGrant(id);break;
        case 'reset-code':openResetCode(id);break;
        case 'reset-account':openResetAccount(id);break;
        case 'delete-account':openDeleteAccount(id);break;
        case 'payout-details':openPayoutDetails(id);break;
        case 'payout-paid':openMarkPayout(id);break;
        case 'mark-read':listAction(action,()=>api('/api/admin/notifications/'+encodeURIComponent(id)+'/read',{method:'POST'}),'Notification marked as read.');break;
        case 'mark-all-read':listAction(action,()=>api('/api/admin/notifications/read-all',{method:'POST'}),'Unread notifications marked as read.');break;
      }
      return;
    }
    const noteFilter=event.target.closest('[data-note-filter]');
    if(noteFilter){view.notificationFilter=noteFilter.dataset.noteFilter;render();document.querySelector('[data-note-filter="'+view.notificationFilter+'"]')?.focus();return;}
    const accountPage=event.target.closest('[data-account-page]');
    if(accountPage){view.accountPage=Math.max(0,view.accountPage+Number(accountPage.dataset.accountPage));render();$('#adminPanel')?.focus();return;}
    const page=event.target.closest('[data-activity-page]');
    if(page){view.activityPage=Math.max(0,view.activityPage+Number(page.dataset.activityPage));render();$('#adminPanel')?.focus();return;}
    if(event.target.id==='adminRefresh'||event.target.id==='adminRetry'){refresh();return;}
    if(event.target.id==='adminLogout')logout();
    if(event.target.id==='accountSortDirection'){view.accountDir*=-1;view.accountPage=0;render();$('#accountSortDirection')?.focus();}
  });
  app.addEventListener('input',event=>{
    const input=event.target;
    if(input.id==='accountSearch')preserveSearch('accountSearch',()=>{view.accountQuery=input.value;view.accountPage=0;});
    else if(input.id==='paymentSearch')preserveSearch('paymentSearch',()=>view.paymentQuery=input.value);
    else if(input.id==='referralSearch')preserveSearch('referralSearch',()=>view.referralQuery=input.value);
    else if(input.id==='withdrawalSearch')preserveSearch('withdrawalSearch',()=>view.withdrawalQuery=input.value);
    else if(input.id==='activitySearch')preserveSearch('activitySearch',()=>{view.activityQuery=input.value;view.activityPage=0;});
  });
  app.addEventListener('change',event=>{
    const input=event.target;
    if(input.id==='accountStatus'){view.accountStatus=input.value;view.accountPage=0;}
    else if(input.id==='accountAuth'){view.accountAuth=input.value;view.accountPage=0;}
    else if(input.id==='accountSort'){if(view.accountSort!==input.value)view.accountDir=input.value==='createdAt'?-1:1;view.accountSort=input.value;view.accountPage=0;}
    else if(input.id==='paymentStatus')view.paymentStatus=input.value;
    else if(input.id==='withdrawalStatus')view.withdrawalStatus=input.value;
    else return;
    const focusId=input.id;render();$('#'+focusId)?.focus();
  });
  app.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&event.target.matches('input[type="search"]')&&event.target.value){event.target.value='';event.target.dispatchEvent(new Event('input',{bubbles:true}));return;}
    const tab=event.target.closest('[role="tab"]');
    if(!tab)return;
    const index=tabs.findIndex(x=>x.id===tab.dataset.tab);let next=index;
    if(event.key==='ArrowRight')next=(index+1)%tabs.length;
    else if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=tabs.length-1;
    else return;
    event.preventDefault();view.tab=tabs[next].id;render();document.querySelector('[data-tab="'+view.tab+'"]')?.focus();
  });
}
function bindModal(){
  if(!modalRoot)return;
  modalRoot.addEventListener('submit',submitModal);
  modalRoot.addEventListener('click',async event=>{
    if(event.target.matches('[data-admin-backdrop]')){closeDialog();return;}
    if(event.target.closest('[data-modal-close]')){closeDialog();return;}
    const copy=event.target.closest('[data-copy-reset-code]');
    if(copy){const input=$('#issuedResetCode');if(input)await copyText(input.value);return;}
    const account=event.target.closest('[data-copy-account-number]');
    if(account){await copyText(account.dataset.copyAccountNumber||'');return;}
  });
  document.addEventListener('keydown',event=>{
    if(modalRoot.hidden)return;
    if(event.key==='Escape'){event.preventDefault();closeDialog();return;}
    if(event.key!=='Tab')return;
    const focusable=Array.from(modalRoot.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(el=>!el.hidden);
    if(!focusable.length){event.preventDefault();modalRoot.querySelector('[role="dialog"]')?.focus();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
}
async function refresh(){
  if(busy)return;
  busy=true;loadError='';render();
  try{data=await api('/api/admin/overview');lastLoaded=Date.now();}
  catch(error){loadError=error.message||'Could not refresh dashboard.';if(data)toast(loadError,'error');}
  finally{busy=false;render();}
}
async function logout(){
  if(busy)return;
  busy=true;
  try{await api('/api/auth/logout',{method:'POST'});}catch{}
  location.reload();
}
function login(){
  if(!app)return;
  loadError='';app.setAttribute('aria-busy','false');
  app.innerHTML='<section class="card admin-card admin-login-card"><h2>Administrator sign in</h2><p>Use your administrator credentials for the private Node account service. The logo gesture is not a security boundary.</p><form id="adminLogin" novalidate><label class="admin-form-field" for="adminEmail"><span>Administrator email</span><input id="adminEmail" name="email" type="email" autocomplete="username" required></label><label class="admin-form-field" for="adminPassword"><span>Password</span><input id="adminPassword" name="password" type="password" autocomplete="current-password" required></label><div class="admin-login-error" id="adminError" role="alert" aria-live="polite"></div><button type="submit" class="primary-btn" id="adminLoginButton">Sign in</button></form></section>';
  const form=$('#adminLogin');
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const error=$('#adminError'),button=$('#adminLoginButton');
    error.textContent='';button.disabled=true;button.textContent='Signing in…';
    try{
      const result=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('#adminEmail').value,password:$('#adminPassword').value})});
      if(result.user?.role!=='admin')throw Error('This account does not have administrator access.');
      data=await api('/api/admin/overview');lastLoaded=Date.now();render();
    }catch(e){error.textContent=e.message||'Sign-in failed.';button.disabled=false;button.textContent='Sign in';}
  });
}
async function boot(){
  bind();bindModal();
  let me;
  try{me=await api('/api/auth/me');}catch{login();return;}
  if(me.user?.role!=='admin'){login();return;}
  try{data=await api('/api/admin/overview');lastLoaded=Date.now();render();}
  catch(error){loadError=error.message||'Could not load the private portal.';render();}
}
boot();
})();
