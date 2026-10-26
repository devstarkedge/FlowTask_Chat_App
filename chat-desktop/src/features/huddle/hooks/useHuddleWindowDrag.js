import {useLayoutEffect,useRef,useState} from 'react';

function constrain(rect,owner){
  const inset=8;
  const top=owner.document.body.classList.contains('has-native-window-controls')
    ? (owner.navigator.windowControlsOverlay?.getTitlebarAreaRect?.().height || 48)+inset : inset;
  return {
    x:Math.max(inset,Math.min(rect.left,owner.innerWidth-rect.width-inset)),
    y:Math.max(top,Math.min(rect.top,owner.innerHeight-rect.height-inset)),
  };
}

export function useHuddleWindowDrag({dialog,enabled,resetKey,layoutKey}){
  const [position,setPosition]=useState(null);
  const cancelDrag=useRef(()=>{});
  useLayoutEffect(()=>{cancelDrag.current();setPosition(null);},[resetKey]);
  useLayoutEffect(()=>{
    const element=dialog.current,owner=element?.ownerDocument.defaultView;
    if(!enabled || !owner){cancelDrag.current();return;}
    const fit=()=>{
      cancelDrag.current();
      const rect=element.getBoundingClientRect(),next=constrain(rect,owner);
      const dx=next.x-rect.left,dy=next.y-rect.top;
      if(dx || dy)setPosition(previous=>({x:(previous?.x || 0)+dx,y:(previous?.y || 0)+dy}));
    };
    fit();owner.addEventListener('resize',fit);
    return()=>{cancelDrag.current();owner.removeEventListener('resize',fit);};
  },[enabled,resetKey,layoutKey,dialog]);
  useLayoutEffect(()=>()=>cancelDrag.current(),[]);

  const onPointerDown=event=>{
    if(!enabled || event.button!==0 || event.isPrimary===false || event.target.closest('button,a,input,select,textarea,[role="button"]'))return;
    const element=dialog.current,handle=event.currentTarget,doc=element.ownerDocument,owner=doc.defaultView;
    const rect=element.getBoundingClientRect(),start={x:event.clientX,y:event.clientY},initial=position;
    const pointerId=event.pointerId;
    cancelDrag.current();event.preventDefault();
    try{handle.setPointerCapture(pointerId);}catch{}
    const move=next=>{
      if(next.pointerId!==pointerId)return;
      const target=constrain({width:rect.width,height:rect.height,left:rect.left+next.clientX-start.x,top:rect.top+next.clientY-start.y},owner);
      setPosition({x:(initial?.x || 0)+target.x-rect.left,y:(initial?.y || 0)+target.y-rect.top});
    };
    const stop=next=>{if(next.pointerId===pointerId)cleanup();};
    const cleanup=()=>{
      doc.removeEventListener('pointermove',move,true);
      doc.removeEventListener('pointerup',stop,true);
      doc.removeEventListener('pointercancel',stop,true);
      handle.removeEventListener('lostpointercapture',stop);
      owner.removeEventListener('blur',cleanup);
      try{if(handle.hasPointerCapture(pointerId))handle.releasePointerCapture(pointerId);}catch{}
      cancelDrag.current=()=>{};
    };
    cancelDrag.current=cleanup;
    doc.addEventListener('pointermove',move,true);
    doc.addEventListener('pointerup',stop,true);
    doc.addEventListener('pointercancel',stop,true);
    handle.addEventListener('lostpointercapture',stop);
    owner.addEventListener('blur',cleanup);
  };
  return {onPointerDown,style:enabled && position?{translate:`${position.x}px ${position.y}px`}:undefined};
}
