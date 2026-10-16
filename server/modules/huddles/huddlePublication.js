import {buildRoomName} from '../../config/constants.js';

// Discovery follows the conversation; call delivery follows the meeting lifetime.
export function createHuddlePublisher({emitToChannel,getIO}) {
  return (workspaceId,channelId,state)=>{
    const {endedHuddleId,...snapshot}=state;
    const meetingId=state.huddle?._id || endedHuddleId;
    const room=meetingId?buildRoomName(workspaceId,'huddle',String(meetingId)):undefined;
    emitToChannel(channelId,'huddle:state',{channelId,workspaceId,...snapshot},workspaceId,room);
    if(!state.huddle && room)getIO()?.in(room).socketsLeave(room);
  };
}
