window.incomingCall.onDetails(details=>{
  const name=String(details?.callerName || 'A teammate');
  document.getElementById('caller').textContent=`${name} is calling`;
  document.getElementById('initial').textContent=Array.from(name.trim())[0]?.toUpperCase() || 'T';
  document.getElementById('conversation').textContent=details?.label || 'Huddle invitation';
});
document.getElementById('join').addEventListener('click',()=>window.incomingCall.join());
document.getElementById('dismiss').addEventListener('click',()=>window.incomingCall.dismiss());
