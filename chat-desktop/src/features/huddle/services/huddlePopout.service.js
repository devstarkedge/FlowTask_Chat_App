let activeWindow=null;

export function huddleCaptureDevices() {
  // Display capture must use the window in which the user clicked Share.
  return activeWindow && !activeWindow.closed?activeWindow.navigator.mediaDevices:navigator.mediaDevices;
}

export function openHuddlePopout({label,onClosed,opener=window}) {
  const popup=opener.open('about:blank','taskchat-huddle');
  if(!popup)return null;
  const doc=popup.document;
  doc.title=`TaskChat — Huddle${label?` · ${label}`:''}`;
  doc.documentElement.lang=opener.document.documentElement.lang || 'en';
  doc.documentElement.className=opener.document.documentElement.className;
  doc.body.className='huddle-popout';
  const host=doc.createElement('div');doc.body.append(host);
  const copyStyles=()=>{
    for(const node of doc.head.querySelectorAll('[data-huddle-style]'))node.remove();
    for(const node of opener.document.head.querySelectorAll('style,link[rel="stylesheet"]')){
      const copy=node.cloneNode(true);copy.setAttribute('data-huddle-style','');
      if(copy.tagName==='LINK')copy.href=node.href;
      doc.head.append(copy);
    }
    const style=doc.createElement('style');style.setAttribute('data-huddle-style','');
    style.textContent='html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#171c26}body.huddle-popout .huddle-window{inset:0!important;width:100%!important;height:100dvh!important;max-width:none!important;transform:none!important;border-radius:0!important}';
    doc.head.append(style);
  };
  copyStyles();
  const observer=new MutationObserver(copyStyles);
  observer.observe(opener.document.head,{childList:true,subtree:true,characterData:true});
  let disposed=false;
  activeWindow=popup;
  const cleanup=()=>{observer.disconnect();if(activeWindow===popup)activeWindow=null;};
  const closed=()=>{cleanup();if(!disposed){disposed=true;onClosed();}};
  popup.addEventListener('beforeunload',closed,{once:true});
  popup.addEventListener('pagehide',closed,{once:true});
  return {host,document:doc,window:popup,close(){if(disposed)return;disposed=true;cleanup();popup.removeEventListener('beforeunload',closed);popup.removeEventListener('pagehide',closed);if(!popup.closed)popup.close();}};
}
