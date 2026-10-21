const canvas=document.getElementById('ink');let state,strokes=[],drawing=false,pending=[];
function paint(){canvas.width=innerWidth;canvas.height=innerHeight;const ctx=canvas.getContext('2d');for(const stroke of strokes){ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=stroke.color;ctx.lineWidth=Math.max(2,innerWidth/640)*(stroke.tool==='eraser'?7:1);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();stroke.points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*innerWidth,p.y*innerHeight));ctx.stroke();}}
window.shareToolbar.onState(next=>{state=next;strokes=next.strokes || strokes;paint();});window.onresize=paint;
const point=e=>({x:Math.max(0,Math.min(1,e.clientX/innerWidth)),y:Math.max(0,Math.min(1,e.clientY/innerHeight))});
function send(type,points){if(state)window.shareToolbar.action({sessionId:state.id,action:'annotation',type,points,tool:state.tool,color:state.color});}
canvas.onpointerdown=e=>{if(e.button!==0 || !state)return;drawing=true;canvas.setPointerCapture(e.pointerId);send('start',[point(e)]);};
canvas.onpointermove=e=>{if(drawing)pending.push(point(e));};
function flush(){if(pending.length){const points=pending;pending=[];send('move',points.length<=32?points:Array.from({length:32},(_,i)=>points[Math.round(i*(points.length-1)/31)]));}}
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{if(drawing){flush();send('end',[]);}drawing=false;};
setInterval(flush,50);
