import {useHuddleStore} from '../stores/huddleStore';
import {bindHuddleAudio,retryHuddleAudio} from './huddleAudioService';
import {useHuddleUiStore} from '../stores/huddleUiStore';
export function bindHuddleSocket(socket,getWorkspaceId) {
  const state=payload=>{
    if(payload.workspaceId!==getWorkspaceId())return;
    useHuddleStore.getState().ingest(payload.channelId,payload);
  };
  const disposeAudio=bindHuddleAudio(socket);
  const invitation=payload=>{
    if(payload?.workspaceId!==getWorkspaceId() || useHuddleStore.getState().session?.channelId===payload.channelId)return;
    useHuddleUiStore.getState().receiveInvitation(payload);
  };
  socket.on('huddle:invitation',invitation);
  const connected=async()=>{await useHuddleStore.getState().resume();if(useHuddleStore.getState().session)await retryHuddleAudio();};
  socket.on('huddle:state',state);socket.on('connect',connected);
  const timer=setInterval(()=>{if(socket.connected)useHuddleStore.getState().heartbeat();},20000);
  return ()=>{clearInterval(timer);socket.off('huddle:state',state);socket.off('huddle:invitation',invitation);socket.off('connect',connected);useHuddleUiStore.getState().clearInvitations();disposeAudio();};
}
