import redisManager from '../../config/redisManager.js';
import env from '../../config/environment.js';
import {annotationEvent,SCREEN_ANNOTATION_HISTORY} from './huddleScreenPolicy.js';
import {screenDocument} from './huddleScreenDocument.js';

// Runtime-only vector journal. Redis keeps snapshots consistent across API
// replicas; no drawing operation writes Mongo or takes a presence mutation lock.
export function createAnnotationJournal({getClient=()=>redisManager.getSharedClient(),production=env.IS_PRODUCTION}={}){
  const memory=new Map();
  return async(key,event)=>{
    const client=getClient();
    if(client?.status==='ready'){
      const snapshotKey=key+':snapshot';
      const read=async()=>{const rows=await client.multi().get(snapshotKey).lrange(key,0,-1).exec();if(!rows || rows.some(([error])=>error))throw new Error('Annotation sync is temporarily unavailable');return {snapshot:rows[0][1]?JSON.parse(rows[0][1]):undefined,tail:rows[1][1].map(item=>JSON.parse(item))};};
      if(event){
        const result=await client.multi().rpush(key,JSON.stringify(event)).ltrim(key,-SCREEN_ANNOTATION_HISTORY,-1).expire(key,3600).expire(snapshotKey,3600).exec();if(!result || result.some(([error])=>error))throw new Error('Annotation sync is temporarily unavailable');
        // The current presenter socket is the sole writer for this share key;
        // its FIFO queue prevents a move overtaking start or compaction.
        if(result[0][1]>=100){const {snapshot,tail}=await read(),doc=screenDocument(snapshot,tail);const saved=await client.multi().set(snapshotKey,JSON.stringify(doc),'EX',3600).del(key).exec();if(!saved || saved.some(([error])=>error))throw new Error('Annotation sync is temporarily unavailable');}
        return null;
      }
      const {snapshot,tail}=await read();return {events:[...(snapshot?.strokes || []),...tail],coveredEventIds:snapshot?.seen || []};
    }
    if(production)throw new Error('Annotation sync is temporarily unavailable');
    const row=memory.get(key);let doc=row && row.expiresAt>Date.now()?row.doc:undefined;
    if(event){doc=screenDocument(doc,[event]);memory.set(key,{doc,expiresAt:Date.now()+3600000});}
    for(const [id,value] of memory)if(value.expiresAt<Date.now())memory.delete(id);
    while(memory.size>128)memory.delete(memory.keys().next().value);
    return {events:doc?.strokes || [],coveredEventIds:doc?.seen || []};
  };
}
const sharedJournal=createAnnotationJournal();
export function registerScreenAnnotations(io,socket,service,journal=sharedJournal){
  let second=0,count=0,queued=0,queue=Promise.resolve();
  socket.on('huddle:screen-annotation',(input={},ack)=>{
    if(typeof ack!=='function')return;
    if(queued>=90){ack({success:false,error:{code:'SCREEN_ANNOTATION',message:'Drawing queue is busy'}});return;}
    queued++;
    queue=queue.catch(()=>{}).then(async()=>{
    try{
      const now=Math.floor(Date.now()/1000);if(second!==now){second=now;count=0;}
      if(++count>45)throw new Error('Drawing too quickly');
      const binding=socket.data.huddle;
      if(!binding || binding.channelId!==input.channelId || String(binding.workspaceId)!==String(socket.workspaceId))throw new Error('Join the Huddle first');
      const state=await service.screenSnapshot({user:socket.chatUser,workspaceId:socket.workspaceId,socketId:socket.id},input.channelId);
      const participant=state?.participants?.find(p=>p.id===binding.sessionId && p.socketId===socket.id && p.userId===String(socket.chatUser._id) && p.connection==='connected');
      const presenter=state?.participants?.find(p=>p.screenSharing && p.screenShare?.id===input.shareId && p.connection==='connected');
      if(!state?.huddle || String(state.huddle._id)!==binding.huddleId || !participant || !presenter)throw new Error('This screen-share session is no longer active');
      // MVP: presenter only. Permission is decided here, not by hidden buttons.
      if(input.type!=='snapshot' && participant!==presenter)throw new Error('Only the presenter can annotate');
      const event=annotationEvent(input,participant);
      const document=await journal(`huddle-ink:${binding.workspaceId}:${binding.huddleId}:${input.shareId}`,input.type==='snapshot'?null:event);
      if(input.type!=='snapshot')io.to(binding.room).emit('huddle:screen-annotation',event);
      ack({success:true,data:input.type==='snapshot'?document:{}});
    }catch(error){ack({success:false,error:{code:'SCREEN_ANNOTATION',message:error.message}});}
    }).finally(()=>{queued--;});
  });
}
