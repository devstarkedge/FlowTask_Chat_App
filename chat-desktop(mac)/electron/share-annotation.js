const canvas=document.getElementById('ink');let state,strokes=[],drawing=false,pending=[],pointer=null,lastPointer=-Infinity;
function paint(){canvas.width=innerWidth;canvas.height=innerHeight;const ctx=canvas.getContext('2d');for(const stroke of strokes){ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=stroke.color;ctx.lineWidth=Math.max(2,innerWidth/640)*(stroke.tool==='eraser'?7:1);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();stroke.points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*innerWidth,p.y*innerHeight));ctx.stroke();}if(pointer){ctx.globalCompositeOperation="source-over";ctx.beginPath();ctx.arc(pointer.x*innerWidth,pointer.y*innerHeight,Math.max(4,innerWidth/180),0,Math.PI*2);ctx.fillStyle="#ff526d";ctx.fill();ctx.strokeStyle="#ffffff";ctx.lineWidth=2;ctx.stroke();}}
window.shareToolbar.onState(next=>{state=next;strokes=next.strokes || strokes;pointer=next.state==='paused'?null:next.pointer || null;if(next.state==='paused'){drawing=false;pending=[];}paint();});window.onresize=paint;
const point=e=>({x:Math.max(0,Math.min(1,e.clientX/innerWidth)),y:Math.max(0,Math.min(1,e.clientY/innerHeight))});
function send(type,points){if(state)window.shareToolbar.action({sessionId:state.id,action:'annotation',type,points,tool:state.tool,color:state.color});}
canvas.onpointerdown=e=>{if(e.button!==0 || !state || state.state==='paused' || state.tool==='laser')return;drawing=true;canvas.setPointerCapture(e.pointerId);send('start',[point(e)]);};
canvas.onpointermove=e=>{if(state?.tool==='laser' && state.state!=='paused'){pointer=point(e);paint();if(Date.now()-lastPointer>=100){lastPointer=Date.now();send('pointer',[pointer]);}}else if(drawing)pending.push(point(e));};
canvas.onpointerleave=()=>{if(state?.tool==='laser'){pointer=null;paint();send('pointer-hide',[]);}};
function flush(){if(pending.length){const points=pending;pending=[];send('move',points.length<=32?points:Array.from({length:32},(_,i)=>points[Math.round(i*(points.length-1)/31)]));}}
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{if(drawing){flush();send('end',[]);}drawing=false;};
setInterval(flush,50);
