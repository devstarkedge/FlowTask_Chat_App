import service from './huddle.service.js';
import {ConflictError, ForbiddenError} from '../../middleware/errorHandler.js';
import {buildRoomName} from '../../config/constants.js';
import {createHuddleOperationQueue} from './huddleOperationQueue.js';
import {createSessionProof} from './huddleSessionProof.js';
const queued=createHuddleOperationQueue({maxPending:16});

// REST and Socket.IO operations share the same device/session lock.
export async function runSocketHuddle(socket,channelId,action,input={},huddleService=service) {
 return queued(socket,async()=>{
  if(!socket.connected) throw new ForbiddenError('A connected session is required');
  socket.data.huddleOperation=true;
  const context={user:socket.chatUser,workspaceId:socket.workspaceId,socketId:socket.id};
  try {
    const previous=socket.data.huddle;
    if(previous && socket.rooms?.has(previous.room) && socket.rooms?.has(buildRoomName(context.workspaceId,'user',String(context.user._id))))context.huddleBinding=previous;
    if(['start','join','resume'].includes(action) && previous && previous.channelId!==channelId) {
      let state;
      try {state=await huddleService.run(context,previous.channelId,'get');}
      catch(error) {
        if(![403,404].includes(error.statusCode))throw error;
        state={huddle:null,participants:[]};
      }
      if(state.huddle && state.participants.some(p=>p.id===previous.sessionId)) throw new ConflictError('Leave your current huddle first');
      if(previous.room)socket.leave?.(previous.room);
      socket.data.huddle=null;
    }
    const result=await huddleService.run(context,channelId,action,input);
    if(result.session) {
      if(!socket.connected || socket.workspaceId!==context.workspaceId) {
        await huddleService.run(context,channelId,'leave');
        throw new ConflictError('Connection changed. Join the huddle again.');
      }
      const room=buildRoomName(context.workspaceId,'huddle',String(result.huddle._id));
      if(socket.data.huddle?.room && socket.data.huddle.room!==room)socket.leave?.(socket.data.huddle.room);
      await socket.join?.(room);
      socket.data.huddle={channelId,workspaceId:context.workspaceId,sessionId:result.session.id,room,
        ...createSessionProof(context,channelId,result.huddle._id,result.session)};
    }
    if((action==='leave' || action==='end') && socket.data.huddle?.channelId===channelId) {
      if(socket.data.huddle.room)socket.leave?.(socket.data.huddle.room);
      socket.data.huddle=null;
    }
    return result;
  } finally {socket.data.huddleOperation=false;}
 });
}
