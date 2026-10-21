import {useHuddleStore} from '../../../stores/huddleStore';
import {useHuddleAudioStore} from '../../../stores/huddleAudioStore';
import {toggleHuddleMute,toggleHuddleCamera,retryHuddleAudio} from '../../../services/huddleAudioService';

// DMs are Channel records in this app. Keep that wire detail out of callers.
function conversationId(conversation) {
  return typeof conversation==='string'?conversation:conversation?.conversationId || conversation?.channelId;
}

export function useHuddle(channelId) {
  const session=useHuddleStore(s=>s.session);
  const state=useHuddleStore(s=>s.byChannel[channelId || s.session?.channelId]);
  const busy=useHuddleStore(s=>s.busy);
  const operation=useHuddleStore(s=>s.operation);
  const error=useHuddleStore(s=>s.error);
  const errorCode=useHuddleStore(s=>s.errorCode);
  const act=useHuddleStore(s=>s.act);
  const load=useHuddleStore(s=>s.load);
  const audio=useHuddleAudioStore();
  const status=operation || (!session?(error || audio.error?'error':'idle'):audio.reconnectDeadline?'reconnecting':
    audio.connection==='failed'?'error':['connected','waiting'].includes(audio.connection)?'connected':audio.connection==='reconnecting'?'reconnecting':'joining');
  return {
    session,state,huddle:state?.huddle || null,participants:state?.participants || [],
    localParticipant:state?.participants?.find(person=>person.id===session?.id) || null,
    status,busy,error:error || audio.error,errorCode:error?errorCode || 'SIGNALING_FAILED':audio.error?audio.errorCode || 'PEER_CONNECTION_FAILED':null,isMuted:audio.muted,isJoining:['starting','joining'].includes(status),isLeaving:status==='leaving',audio,
    // Compatibility action keeps existing presentation components incremental.
    act,load,
    startHuddle:conversation=>act('start',conversationId(conversation)),
    joinHuddle:conversation=>act('join',conversationId(conversation)),
    leaveHuddle:()=>act('leave',session?.channelId || channelId),
    endHuddle:()=>act('end',session?.channelId || channelId),
    toggleMute:toggleHuddleMute,toggleCamera:toggleHuddleCamera,retryAudio:retryHuddleAudio,
  };
}
