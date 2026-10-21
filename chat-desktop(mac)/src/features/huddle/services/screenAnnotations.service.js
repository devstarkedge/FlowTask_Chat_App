// Vector-only, bounded, per-share documents. Neither video nor application
// pixels are modified. Identity/permissions are checked again by the server.
export class ScreenAnnotations {
  constructor(){this.documents=new Map();this.pointers=new Map();this.pointerTimers=new Map();this.listeners=new Set();this.revision=0;this.seen=new Set();this.syncing=new Map();}
  subscribe=callback=>{this.listeners.add(callback);return()=>this.listeners.delete(callback);};
  snapshot=()=>this.revision;
  changed(){this.revision++;for(const callback of this.listeners)callback();}
  reset(id){if(id){this.documents.delete(id);this.syncing.delete(id);this.pointers.delete(id);clearTimeout(this.pointerTimers.get(id));this.pointerTimers.delete(id);}else {this.documents.clear();this.seen.clear();this.syncing.clear();this.pointers.clear();for(const timer of this.pointerTimers.values())clearTimeout(timer);this.pointerTimers.clear();}this.changed();}
  get(id){return this.documents.get(id) || [];}
  pointer(id){return this.pointers.get(id);}
  setPointer(id,point){
    clearTimeout(this.pointerTimers.get(id));this.pointerTimers.delete(id);
    if(point){this.pointers.set(id,point);const timer=setTimeout(()=>{this.pointers.delete(id);this.pointerTimers.delete(id);this.changed();},2000);timer.unref?.();this.pointerTimers.set(id,timer);}
    else this.pointers.delete(id);
    while(this.pointers.size>4){const old=this.pointers.keys().next().value;this.pointers.delete(old);clearTimeout(this.pointerTimers.get(old));this.pointerTimers.delete(old);}this.changed();
  }
  receive(event,{optimistic=false}={}){
    if(event?.shareId && ['pointer','pointer-hide'].includes(event.type)){const key=`${event.shareId}:${event.id}`;if(this.seen.has(key))return;this.seen.add(key);while(this.seen.size>4096)this.seen.delete(this.seen.values().next().value);this.setPointer(event.shareId,event.type==='pointer'?event.points?.[0]:null);return;}
    const buffered=this.syncing.get(event?.shareId);if(buffered){buffered.events.push(event);if(buffered.events.length>1500)buffered.events.shift();if(!optimistic)return;}
    const key=`${event?.shareId}:${event?.id}`;
    if(!event?.shareId || !event.id || this.seen.has(key))return;
    this.seen.add(key);while(this.seen.size>4096)this.seen.delete(this.seen.values().next().value);
    let strokes=this.get(event.shareId);
    if(event.type==='clear')strokes=[];
    else if(event.type==='undo'){
      const last=[...strokes].reverse().find(s=>s.creatorSessionId===event.creatorSessionId);
      if(last)strokes=strokes.filter(s=>s!==last);
    } else if(event.type==='start'){
      if(strokes.some(s=>s.id===event.strokeId))return;
      strokes=[...strokes,{id:event.strokeId,creatorSessionId:event.creatorSessionId,tool:event.tool,color:event.color,points:event.points || []}].slice(-128);
    } else if(event.type==='move')strokes=strokes.map(s=>s.id===event.strokeId && s.creatorSessionId===event.creatorSessionId?{...s,points:[...s.points,...event.points].slice(-2048)}:s);
    let total=strokes.reduce((count,s)=>count+s.points.length,0);while(total>32768 && strokes.length>1){total-=strokes[0].points.length;strokes=strokes.slice(1);}
    this.documents.set(event.shareId,strokes);while(this.documents.size>4)this.documents.delete(this.documents.keys().next().value);this.changed();
  }
  async sync(shareId,request){
    if(this.syncing.has(shareId))return this.syncing.get(shareId).promise;
    const pending={events:[]};this.syncing.set(shareId,pending);
    pending.promise=(async()=>{try{
      const data=await request({shareId,type:'snapshot'});if(this.syncing.get(shareId)!==pending)return;
      this.syncing.delete(shareId);this.documents.delete(shareId);for(const key of this.seen)if(key.startsWith(shareId+':'))this.seen.delete(key);
      for(const event of (Array.isArray(data)?data:data?.events) || [])this.receive(event);
      for(const id of data?.coveredEventIds || [])this.seen.add(`${shareId}:${id}`);
      while(this.seen.size>4096)this.seen.delete(this.seen.values().next().value);
      for(const event of pending.events)this.receive(event);this.changed();
    }catch(error){if(this.syncing.get(shareId)===pending){this.syncing.delete(shareId);for(const event of pending.events)this.receive(event);}throw error;}})();
    return pending.promise;
  }
}
export const screenAnnotations=new ScreenAnnotations();

export function paintAnnotations(canvas,strokes,width,height,pointer){
  const context=canvas.getContext('2d');if(!context)return;
  canvas.width=Math.max(1,width);canvas.height=Math.max(1,height);
  for(const stroke of strokes){
    context.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';
    context.strokeStyle=stroke.color || '#facc15';context.lineWidth=Math.max(2,width/640)*(stroke.tool==='eraser'?7:1);
    context.lineCap='round';context.lineJoin='round';context.beginPath();
    stroke.points.forEach((point,index)=>context[index?'lineTo':'moveTo'](point.x*width,point.y*height));context.stroke();
  }
  if(pointer){context.globalCompositeOperation='source-over';context.beginPath();context.arc(pointer.x*width,pointer.y*height,Math.max(4,width/180),0,Math.PI*2);context.fillStyle='#ff526d';context.fill();context.strokeStyle='#ffffff';context.lineWidth=2;context.stroke();}
}
