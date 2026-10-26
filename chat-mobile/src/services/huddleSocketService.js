import {AppState,NativeModules,NativeEventEmitter} from 'react-native';
import {useHuddleStore} from '../stores/huddleStore';
import {useHuddleAudioStore} from '../stores/huddleAudioStore';
import {useHuddleUiStore} from '../stores/huddleUiStore';
import {bindHuddleAudio,retryHuddleAudio} from './huddleAudioService';
import {createHuddleNetworkRecovery} from './huddleNetworkRecovery';
import {disposeSharedNotesSession} from '../features/huddle/services/sharedNotes.service';

const bindings=new WeakMap();
export function bindHuddleSocket(socket,getWorkspaceId){
  const existing=bindings.get(socket);if(existing)return existing.acquire();
  let owners=0,disposed=false,pending=false;
  const recovery=createHuddleNetworkRecovery({getSession:()=>useHuddleStore.getState().session,
    resume:()=>useHuddleStore.getState().resume(),restore:retryHuddleAudio,
    expire:id=>useHuddleStore.getState().expireNetworkSession(id),
    onDeadline:reconnectDeadline=>useHuddleAudioStore.getState().update({reconnectDeadline}),
    isOnline:()=>socket.connected,isRestored:()=>['connected','waiting'].includes(useHuddleAudioStore.getState().connection)});
  const state=payload=>{
    if(payload.workspaceId!==getWorkspaceId())return;
    useHuddleStore.getState().ingest(payload.channelId,payload);
    useHuddleUiStore.getState().reconcileInvitations(payload.channelId,useHuddleStore.getState().byChannel[payload.channelId]);
  };
  const answered=payload=>{if(payload?.huddleId)useHuddleUiStore.getState().silenceHuddle(payload);};
  socket.on('huddle:invitation-answered',answered);
  const invitation=payload=>{if(useHuddleStore.getState().session?.channelId!==payload?.channelId)useHuddleUiStore.getState().receiveInvitation(payload);};
  const connected=()=>recovery.reconnect(),disconnected=()=>recovery.begin();
  const heartbeat=async()=>{if(disposed || pending || !useHuddleStore.getState().session)return;pending=true;
    try{if(await useHuddleStore.getState().heartbeat()===false && !disposed)recovery.reconnect();}finally{pending=false;}};
  const releaseAudio=bindHuddleAudio(socket);
  socket.on('huddle:state',state);socket.on('huddle:invitation',invitation);socket.on('connect',connected);socket.on('disconnect',disconnected);
  const app=AppState.addEventListener('change',value=>{if(value==='active'){if(!socket.connected)socket.connect();if(useHuddleStore.getState().session)recovery.reconnect();}});
  const nativePulse=NativeModules.TaskChatHuddle?new NativeEventEmitter(NativeModules.TaskChatHuddle).addListener('taskchat:huddle-heartbeat',()=>{if(socket.connected)heartbeat();else if(useHuddleStore.getState().session)socket.connect();}):null;
  const timer=setInterval(()=>{if(recovery.active && !recovery.check())return;if(socket.connected && !recovery.recovering)heartbeat();},20000);
  const unsubscribe=useHuddleStore.subscribe((next,previous)=>{if(previous.session?.id!==next.session?.id){disposeSharedNotesSession(previous.session?.id);if(!next.session)recovery.reset();}});
  const audio=useHuddleAudioStore.subscribe((next,previous)=>{if(next.connection!==previous.connection && ['failed','reconnecting'].includes(next.connection) && useHuddleStore.getState().session && !useHuddleStore.getState().busy){recovery.begin();if(socket.connected)recovery.schedule(2000);}});
  const dispose=()=>{if(disposed)return;disposed=true;clearInterval(timer);app.remove();nativePulse?.remove();unsubscribe();audio();recovery.dispose();releaseAudio();disposeSharedNotesSession(useHuddleStore.getState().session?.id);socket.off('huddle:state',state);socket.off('huddle:invitation',invitation);socket.off('huddle:invitation-answered',answered);socket.off('connect',connected);socket.off('disconnect',disconnected);useHuddleUiStore.getState().clearInvitations();bindings.delete(socket);};
  const acquire=()=>{owners++;let released=false;return()=>{if(released)return;released=true;if(--owners===0)dispose();};};bindings.set(socket,{acquire});return acquire();
}
