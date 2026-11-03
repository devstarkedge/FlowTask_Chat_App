let state;
window.shareToolbar.onState(next=>{state=next;document.getElementById('label').textContent=`${next.state==='paused'?'Paused':'Sharing'} · ${next.sourceLabel}`;document.getElementById('audio').textContent=next.audioAvailable?`System audio ${next.systemAudio?'on':'off'}`:'';document.getElementById('tracking').textContent=next.tracked?'':'Outline unavailable';for(const button of document.querySelectorAll('[data-action]')){button.setAttribute('aria-pressed',String(next.tool===button.dataset.action));if(['laser','pen','eraser'].includes(button.dataset.action)){button.disabled=!next.tracked;button.title=next.tracked?button.getAttribute('aria-label'):'Share an entire screen to draw when window bounds are unavailable';}};});
for(const button of document.querySelectorAll('[data-action]'))button.onclick=()=>{
  if(!state) return;
  const targetAction = button.dataset.action;
  const action = (state.tool === targetAction && ['pen','laser','eraser'].includes(targetAction)) ? 'pointer' : targetAction;
  window.shareToolbar.action({sessionId:state.id,action,color:document.getElementById('color').value});
};
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state && state.tool !== 'pointer') {
    window.shareToolbar.action({sessionId:state.id,action:'pointer',color:document.getElementById('color').value});
  }
});
