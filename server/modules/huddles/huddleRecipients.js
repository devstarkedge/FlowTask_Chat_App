import {buildRoomName} from '../../config/constants.js';

// Discovery must not make a healthy local caller/callee depend on every API
// replica answering a global Redis-adapter request.
export async function getHuddleRecipientSockets(io,workspaceId,{onDegraded=()=>{}}={}) {
  if(!io)throw new Error('Calling signaling is unavailable');
  let sockets;
  try {sockets=await io.in(`ws:${workspaceId}:workspace`).fetchSockets();}
  catch(error){
    if(!io.sockets?.sockets?.values)throw error;
    sockets=[...io.sockets.sockets.values()].filter(socket=>socket.connected!==false);
    onDegraded({code:error.code || 'SOCKET_DISCOVERY_FAILED'});
  }
  const prefix=`ws:${workspaceId}:user:`;
  return sockets.flatMap(socket=>[...(socket.rooms || [])]
    .filter(room=>typeof room==='string' && room.startsWith(prefix) && room.length>prefix.length)
    .map(room=>({workspaceId:String(workspaceId),chatUser:{_id:room.slice(prefix.length)}})));
}

export function emitHuddleInvitation(io,workspaceId,userId,payload) {
  if(!io)throw new Error('Calling signaling is unavailable');
  // One scoped room reaches every authenticated device on every replica. No
  // second global socket scan is needed for each recipient.
  // Authenticated user room survives workspace switches. Socket.IO unions
  // these rooms, so existing same-workspace clients receive exactly one event.
  io.to(`huddle:user:${userId}`).to(buildRoomName(workspaceId,'user',userId)).emit('huddle:invitation',payload);
}
