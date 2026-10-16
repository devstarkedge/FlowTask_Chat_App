import {useHuddleStore} from '../stores/huddleStore';
import {bindHuddleAudio,retryHuddleAudio} from './huddleAudioService';
import {useHuddleUiStore} from '../stores/huddleUiStore';
import {useHuddleAudioStore} from '../stores/huddleAudioStore';
import {createHuddleNetworkRecovery} from './huddleNetworkRecovery';
// One binding per socket; independent callers release their own ownership lease.
const bindings=new WeakMap();
export function bindHuddleSocket(socket,getWorkspaceId) {
  const existing=bindings.get(socket);
  if(existing)return existing.acquire();
  let owners=0;
  let disposed=false,heartbeatPending=false;
  const recovery=createHuddleNetworkRecovery({
    getSession:()=>useHuddleStore.getState().session,
    resume:()=>useHuddleStore.getState().resume(),restore:retryHuddleAudio,
    expire:id=>useHuddleStore.getState().expireNetworkSession(id),
    onDeadline:reconnectDeadline=>useHuddleAudioStore.getState().update({reconnectDeadline}),
    isOnline:()=>socket.connected && navigator.onLine!==false,
    isRestored:()=>['connected','waiting'].includes(useHuddleAudioStore.getState().connection),
  });
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
  const connected=()=>recovery.reconnect();
  const disconnected=()=>recovery.begin();
  const heartbeat=async()=>{
    if(disposed || heartbeatPending || !useHuddleStore.getState().session)return;
    heartbeatPending=true;const id=useHuddleStore.getState().session.id;
    try {
      const alive=await useHuddleStore.getState().heartbeat();
      if(!disposed && alive===false && useHuddleStore.getState().session?.id===id)recovery.reconnect();
    }finally{heartbeatPending=false;}
  };
  const online=()=>{if(!recovery.active){if(socket.connected)heartbeat();return;}if(!recovery.check())return;if(!socket.connected)socket.connect?.();else recovery.reconnect();};
  const visible=()=>{if(document.visibilityState==='visible')online();};
  window.addEventListener('offline',disconnected);window.addEventListener('online',online);
  window.addEventListener('focus',online);document.addEventListener('visibilitychange',visible);
  const unsubscribeAudio=useHuddleAudioStore.subscribe((audio,previous)=>{
    if(!useHuddleStore.getState().session || useHuddleStore.getState().busy)return;
    if(audio.connection!==previous.connection && ['failed','reconnecting'].includes(audio.connection)) {
      recovery.begin();if(socket.connected && navigator.onLine!==false){if(audio.connection==='failed')recovery.reconnect();else recovery.schedule(8000);}
    }
    if(recovery.active && ['connected','waiting'].includes(audio.connection))recovery.complete();
  });
  const unsubscribeSession=useHuddleStore.subscribe?.(()=>{if(!useHuddleStore.getState().session)recovery.reset();});
  socket.on('huddle:state',state);socket.on('connect',connected);
  socket.on('disconnect',disconnected);
  const timer=setInterval(()=>{
    if(recovery.active && !recovery.check())return;
    if(socket.connected && !recovery.recovering)heartbeat();
    // Socket.IO's normal retry budget may finish before the five-minute call
    // deadline. Retry its transport, preserving the same authenticated socket.
    if(recovery.active && navigator.onLine!==false && !socket.connected && !socket.active)socket.connect?.();
  },20000);
  const dispose=()=>{if(disposed)return;disposed=true;recovery.dispose();unsubscribeAudio();unsubscribeSession?.();window.removeEventListener('offline',disconnected);window.removeEventListener('online',online);window.removeEventListener('focus',online);document.removeEventListener('visibilitychange',visible);clearInterval(timer);socket.off('disconnect',disconnected);socket.off('huddle:state',state);socket.off('huddle:invitation',invitation);socket.off('connect',connected);useHuddleUiStore.getState().clearInvitations();disposeAudio();bindings.delete(socket);};
  const acquire=()=>{
    owners++;let released=false;
    return ()=>{if(released)return;released=true;if(--owners===0)dispose();};
  };
  bindings.set(socket,{acquire});
  return acquire();
}
