/* Local, device-only analytics preference control for the privacy policy. */
(function(){
'use strict';
const button=document.querySelector('#analyticsPreferenceButton');
const status=document.querySelector('#analyticsPreferenceStatus');
const analytics=window.KingdomAnalytics;
if(!button||!status||!analytics)return;
function render(message){
  const signal=analytics.privacySignal(),off=analytics.isOptedOut();
  button.disabled=signal;
  button.setAttribute('aria-pressed',String(off));
  button.textContent=signal?'Disabled by your browser privacy signal':off?'Allow anonymous analytics on this browser':'Turn off anonymous analytics on this browser';
  status.textContent=message||(signal?'Your Do Not Track or Global Privacy Control signal is active; analytics remain off.':off?'Anonymous analytics are off on this browser.':'Anonymous analytics are enabled on this browser.');
}
button.addEventListener('click',()=>{
  const wanted=!analytics.isOptedOut(),actual=analytics.setOptOut(wanted);
  render(actual===wanted?'Preference saved on this browser only.':actual?'Could not enable analytics because this browser blocks local preference storage.':'Could not save the analytics preference.');
});
render();
})();
