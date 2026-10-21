import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {screenAnnotations,paintAnnotations} from '../../features/huddle/services/screenAnnotations.service';
import {screenPoint} from '../../features/huddle/services/screenPresentation.service';
import {sendScreenAnnotation} from '../../services/huddleAudioService';

export default function ScreenAnnotationLayer({video,share,tool='pointer',color='#facc15',allowed=false,onError}){
  const canvas=useRef(null),stroke=useRef(null),pending=useRef([]),lastSent=useRef(0),lastPointer=useRef(-Infinity);
  const [rect,setRect]=useState(null),revision=useSyncExternalStore(screenAnnotations.subscribe,screenAnnotations.snapshot);
  useEffect(()=>{
    if(!share?.id)return;
    const element=video.current;if(!element)return;
    const measure=()=>{const bounds=element.getBoundingClientRect(),width=element.videoWidth,height=element.videoHeight;if(!width || !height)return;const scale=Math.min(bounds.width/width,bounds.height/height);setRect({left:(bounds.width-width*scale)/2,top:(bounds.height-height*scale)/2,width:width*scale,height:height*scale});};
    const observer=new ResizeObserver(measure);observer.observe(element);element.addEventListener('loadedmetadata',measure);element.addEventListener('resize',measure);measure();
    return()=>{observer.disconnect();element.removeEventListener('loadedmetadata',measure);element.removeEventListener('resize',measure);};
  },[video,share?.id]);
  useEffect(()=>{if(rect && canvas.current)paintAnnotations(canvas.current,screenAnnotations.get(share?.id),rect.width,rect.height,screenAnnotations.pointer(share?.id));},[rect,revision,share?.id]);
  useEffect(()=>{if(!share?.id)return;let current=true;screenAnnotations.sync(share.id,event=>sendScreenAnnotation(event)).catch(error=>{if(current)onError?.(error.message);});return()=>{current=false;stroke.current=null;pending.current=[];};},[share?.id]);
  const send=(type,points=[])=>{
    if(!share?.id)return;
    const event={id:crypto.randomUUID(),shareId:share.id,creatorSessionId:share.participantSessionId,type,strokeId:stroke.current,tool,color,points};
    screenAnnotations.receive(event,{optimistic:true});void sendScreenAnnotation(event).catch(error=>onError?.(error.message));
  };
  useEffect(()=>()=>{if(allowed && share?.id && tool==='laser'){screenAnnotations.setPointer(share.id,null);void sendScreenAnnotation({id:crypto.randomUUID(),shareId:share.id,type:'pointer-hide'}).catch(()=>{});}},[allowed,share?.id,tool]);
  const flush=()=>{if(pending.current.length){const points=pending.current;send('move',points.length<=32?points:Array.from({length:32},(_,i)=>points[Math.round(i*(points.length-1)/31)]));pending.current=[];lastSent.current=Date.now();}};
  const point=event=>screenPoint(event,video.current.getBoundingClientRect(),video.current.videoWidth,video.current.videoHeight);
  const end=()=>{if(!stroke.current)return;flush();send('end');stroke.current=null;};
  if(!rect)return null;
  return <canvas ref={canvas} className="huddle-vector-annotations" aria-label={allowed?'Draw on shared screen':'Shared screen annotations'} style={{position:'absolute',...rect,pointerEvents:allowed && tool!=='pointer'?'auto':'none',touchAction:'none',cursor:tool==='eraser'?'cell':'crosshair'}}
    onPointerDown={event=>{if(!allowed || ['pointer','laser'].includes(tool) || event.button!==0)return;const p=point(event);if(!p)return;stroke.current=crypto.randomUUID();event.currentTarget.setPointerCapture(event.pointerId);send('start',[p]);lastSent.current=Date.now();}}
    onPointerMove={event=>{const p=point(event);if(allowed && tool==='laser' && p){screenAnnotations.setPointer(share.id,p);if(Date.now()-lastPointer.current>=100){lastPointer.current=Date.now();send('pointer',[p]);}return;}if(!stroke.current)return;if(p)pending.current.push(p);if(Date.now()-lastSent.current>=50)flush();}}
    onPointerLeave={()=>{if(allowed && tool==='laser')send('pointer-hide');}}
    onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}/>;
}
