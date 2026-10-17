import {AppError} from '../../middleware/errorHandler.js';
import {buildRoomName} from '../../config/constants.js';
import {matchesSessionBinding} from './huddleSessionProof.js';

export async function hasBoundHuddleSession(io,workspaceId,channelId,huddleId){
  if(!io)throw new AppError('Huddle connection check unavailable',503,'HUDDLE_UNAVAILABLE');
  const room=buildRoomName(workspaceId,'huddle',String(huddleId));
  const sockets=await io.in(room).fetchSockets();
  return sockets.some(socket=>{
    const binding=socket.data?.huddle;
    if(!binding?.userId || !binding.sessionId)return false;
    return socket.rooms.has(room) && socket.rooms.has(buildRoomName(workspaceId,'user',binding.userId)) &&
      matchesSessionBinding(binding,{workspaceId,socketId:socket.id,user:{_id:binding.userId}},channelId,huddleId);
  });
}

// Socket.IO transport heartbeats run independently of renderer activity. Query
// the adapter so sockets on other API replicas count as connected too.
export async function connectedHuddleParticipants(io,workspaceId,huddleId,participants) {
  if(!io)throw new AppError('Huddle connection check unavailable',503,'HUDDLE_UNAVAILABLE');
  const room=buildRoomName(workspaceId,'huddle',String(huddleId));
  const sockets=await io.in(room).fetchSockets();
  return new Set(participants.filter(participant=>sockets.some(socket=>{
    const binding=socket.data?.huddle;
    return socket.id===participant.socketId && binding?.sessionId===participant.id &&
      String(binding.workspaceId)===String(workspaceId) && binding.room===room &&
      socket.rooms.has(room) && socket.rooms.has(buildRoomName(workspaceId,'user',participant.userId));
  })).map(participant=>participant.id));
}
