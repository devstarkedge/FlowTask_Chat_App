// Compact runtime snapshot: retain complete strokes rather than truncating a
// journal halfway through one. Limits match the presentation-side document.
export function screenDocument(previous={strokes:[],seen:[]},events=[]){
 let strokes=previous.strokes || [],seen=new Set(previous.seen || []);
 for(const event of events){
  if(seen.has(event.id))continue;seen.add(event.id);
  if(event.type==='clear')strokes=[];
  else if(event.type==='undo'){const last=[...strokes].reverse().find(s=>s.creatorSessionId===event.creatorSessionId);if(last)strokes=strokes.filter(s=>s!==last);}
  else if(event.type==='start' && !strokes.some(s=>s.strokeId===event.strokeId))strokes=[...strokes,event].slice(-128);
  else if(event.type==='move')strokes=strokes.map(s=>s.strokeId===event.strokeId && s.creatorSessionId===event.creatorSessionId?{...s,points:[...s.points,...event.points].slice(-2048)}:s);
 }
 let points=strokes.reduce((sum,s)=>sum+s.points.length,0);while(points>32768 && strokes.length>1){points-=strokes[0].points.length;strokes=strokes.slice(1);}
 return {strokes,seen:[...seen].slice(-1500)};
}
