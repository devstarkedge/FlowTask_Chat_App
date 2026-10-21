import {HuddleMediaManager} from '../features/huddle/services/media.service';
import {mediaError} from '../features/huddle/utils/huddle.errors';
import {huddleLogger} from '../features/huddle/utils/huddle.logger';
import {sendHuddleRequest as audioRequest} from './huddleRequest';
import {useHuddleStore} from '../stores/huddleStore';
import {useHuddleAudioStore} from '../stores/huddleAudioStore';
import {HuddleAudioController} from './HuddleAudioController';
import {HuddleSfuController} from './HuddleSfuController';
import {ScreenShareSession} from '../features/huddle/services/screenShareSession.service';
import {screenAnnotations} from '../features/huddle/services/screenAnnotations.service';
import {SCREEN_CAPTURE_VIDEO,prepareScreenTrack} from '../features/huddle/services/screenQuality.service';
import {huddleCaptureDevices} from '../features/huddle/services/huddlePopout.service';

const microphone=new HuddleMediaManager();
let starting=null;
let audioEpoch=0,renewTimer=null,restarting=null,muteQueue=Promise.resolve();
let screenSharing;
const update=patch=>{
  if(Object.hasOwn(patch,'localScreenStream') && !patch.localScreenStream){
    if(screenSharing?.current)void screenSharing.stop('connection_lost',{transportGone:true});
  }
  useHuddleAudioStore.getState().update(patch);
};
const controllerOptions={
  send:(action,payload)=>audioRequest(action,payload),onUpdate:update,
  onScreenStopped:()=>{void screenSharing?.stop('connection_lost',{transportGone:true});},
  onLocalEnded:channelId=>{
    const session=useHuddleStore.getState().session;
    if(session?.channelId!==channelId)return;
    // Device loss changes only the microphone. Keep camera, screen and remote
    // audio running; the next explicit Unmute can attach a replacement input.
    controller.setMuted(true);
    update({joinWithoutMicrophone:true,withoutMicrophone:true,error:'Microphone disconnected. You remain in listen-only mode. Connect a microphone and click Unmute to speak.'});
    audioRequest('audio-state',{channelId,muted:true}).then(data=>{
      if(useHuddleStore.getState().session?.id===session.id)useHuddleStore.getState().ingest(channelId,data.state);
    }).catch(error=>{if(useHuddleStore.getState().session?.id===session.id)update({error:error.message});});
  },
};
let controller=new HuddleAudioController(controllerOptions);
function selectController(mode){
  if((controller.mediaMode || 'p2p')===mode)return;
  const stream=controller.stream,context=controller.context,muted=controller.muted;
  controller.stream=null;controller.stop();
  controller=mode==='sfu'?new HuddleSfuController(controllerOptions):new HuddleAudioController(controllerOptions);
  if(stream && context){controller.begin({stream,channelId:context.channelId,sessionId:context.sessionId});controller.setMuted(muted);}
}

function currentSession(session,epoch) {
  return epoch===audioEpoch && useHuddleStore.getState().session?.id===session.id;
}

function scheduleRenewal(expiresAt,renewAfterMs) {
  clearTimeout(renewTimer);
  renewTimer=setTimeout(async()=>{
    const context=controller.context,epoch=audioEpoch;
    if(!context)return;
    try {
      const config=await audioRequest('audio-config',{channelId:context.channelId});
      if(epoch!==audioEpoch || controller.context?.sessionId!==context.sessionId)return;
      await controller.updateConfiguration(config);scheduleRenewal(config.mediaExpiresAt || config.expiresAt,config.mediaRenewAfterMs);
    } catch(error){
      if(epoch!==audioEpoch || controller.context?.sessionId!==context.sessionId)return;
      update({error:error.message});
      // A single lost renewal response must not strand a still-valid media
      // lease. Never extend authorization locally or retry revoked access.
      if(!['FORBIDDEN','NOT_FOUND','UNAUTHORIZED'].includes(error.code) && Number.isFinite(expiresAt) && Date.now()<expiresAt*1000-2000) {
        scheduleRenewal(expiresAt,2000);
      }
    }
  },Number.isFinite(renewAfterMs)?Math.max(1000,Math.min(renewAfterMs,40000)):Math.max(1000,(expiresAt-Math.floor(Date.now()/1000)-20)*1000));
}

export function startHuddleAudio(channelId,session) {
  if(starting?.sessionId===session.id)return starting.promise;
  if(controller.context?.sessionId===session.id && controller.stream)return Promise.resolve();
  const promise=beginHuddleAudio(channelId,session);
  const operation={sessionId:session.id,promise};starting=operation;
  promise.finally(()=>{if(starting===operation)starting=null;}).catch(()=>{});
  return promise;
}

async function beginHuddleAudio(channelId,session) {
  const epoch=audioEpoch;
  if(!globalThis.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia)throw new Error('Audio requires a supported browser over HTTPS or localhost.');
  update({connection:useHuddleAudioStore.getState().joinWithoutMicrophone?'preparing':'requesting-microphone',error:null,errorCode:null});
  let stream;
  try {
    const {inputDeviceId,startMuted,joinWithoutMicrophone}=useHuddleAudioStore.getState();
    if(joinWithoutMicrophone)stream=new MediaStream();
    else {
      stream=await microphone.getLocalAudioStream({deviceId:inputDeviceId,onFallback:()=>update({inputDeviceId:''})});
    }
    if(!currentSession(session,epoch)){stream.getTracks().forEach(track=>track.stop());return;}
    controller.begin({stream,channelId,sessionId:session.id});
    const muted=joinWithoutMicrophone || startMuted;
    controller.setMuted(muted);
    update({withoutMicrophone:Boolean(joinWithoutMicrophone)});
    const data=await audioRequest('audio-ready',{channelId,muted});
    if(!currentSession(session,epoch))return;
    useHuddleStore.getState().ingest(channelId,data.state);
    selectController(data.mediaMode || 'p2p');await controller.configure(data);if(!currentSession(session,epoch))return;scheduleRenewal(data.mediaExpiresAt || data.expiresAt,data.mediaRenewAfterMs);
    update({invitation:data.state?.invitation || null});
  } catch(error) {
    if(currentSession(session,epoch)) {
      stopHuddleAudio();
      const failure=mediaError(error);
      update({error:failure.message,errorCode:failure.code});throw failure;
    }
    stream?.getTracks().forEach(track=>track.stop());
  }
}

export function stopHuddleAudio() {
  void screenSharing?.stop('huddle_leave',{transportGone:true});
  audioEpoch++;starting=null;restarting=null;microphone.stopLocalStream({stopTracks:microphone.stream!==controller.stream});huddleLogger.debug('CLEANUP');clearTimeout(renewTimer);renewTimer=null;controller.stop();
  update({deafened:false,playbackBlocked:false,invitation:null,withoutMicrophone:false,micBusy:false,cameraBusy:false,screenBusy:false,reconnectDeadline:null});
}

export async function retryHuddleAudio() {
  if(restarting)return false;
  const session=useHuddleStore.getState().session;if(!session)return false;
  const epoch=audioEpoch,token=Symbol('audio-restart');restarting=token;
  try {
    if(!controller.stream){await startHuddleAudio(session.channelId,session);return currentSession(session,epoch);}
    controller.pause();
    let data=await audioRequest('audio-ready',{channelId:session.channelId,muted:controller.muted});
    if(!currentSession(session,epoch))return false;
    if(controller.cameraStream){await audioRequest('camera-state',{channelId:session.channelId,enabled:true});data=await audioRequest('audio-config',{channelId:session.channelId});if(!currentSession(session,epoch))return false;}
    useHuddleStore.getState().ingest(session.channelId,data.state);
    selectController(data.mediaMode || 'p2p');controller.restoreTracks();await controller.configure(data);if(!currentSession(session,epoch))return false;scheduleRenewal(data.mediaExpiresAt || data.expiresAt,data.mediaRenewAfterMs);
    return true;
  } catch(error){if(currentSession(session,epoch))update({connection:'failed',error:error.message});return false;}
  finally {if(restarting===token)restarting=null;}
}

export async function toggleHuddleMute() {
  const session=useHuddleStore.getState().session;if(!session || useHuddleAudioStore.getState().micBusy)return;
  if(!controller.stream?.getAudioTracks().some(track=>track.readyState!=='ended')) {
    const epoch=audioEpoch;let stream;update({micBusy:true,error:null});
    try {
      const inputDeviceId=useHuddleAudioStore.getState().inputDeviceId;
      stream=await microphone.getLocalAudioStream({deviceId:inputDeviceId,onFallback:()=>update({inputDeviceId:''})});
      if(!currentSession(session,epoch)){stream.getTracks().forEach(track=>track.stop());return;}
      await controller.setMicrophone(stream);
      if(!currentSession(session,epoch)){stream.getTracks().forEach(track=>track.stop());return;}
      update({withoutMicrophone:false,joinWithoutMicrophone:false,startMuted:false});controller.setMuted(false);
      const data=await audioRequest('audio-state',{channelId:session.channelId,muted:false});
      if(currentSession(session,epoch))useHuddleStore.getState().ingest(session.channelId,data.state);
    } catch(error){stream?.getTracks().forEach(track=>{track.onended=null;track.stop();});if(currentSession(session,epoch)){controller.setMuted(true);update({error:error.name==='NotAllowedError'?'Microphone access was denied. Allow Microphone in your device settings and try again.':error.message});}}
    finally {if(currentSession(session,epoch))update({micBusy:false});}
    return;
  }
  const muted=!controller.muted,epoch=audioEpoch;controller.setMuted(muted);
  muteQueue=muteQueue.then(async()=>{
    if(!currentSession(session,epoch))return;
    const data=await audioRequest('audio-state',{channelId:session.channelId,muted});
    if(currentSession(session,epoch))useHuddleStore.getState().ingest(session.channelId,data.state);
  }).catch(error=>{if(currentSession(session,epoch)){if(!muted)controller.setMuted(true);update({error:error.message});}});
  await muteQueue;
}

export async function toggleHuddleCamera() {
  const session=useHuddleStore.getState().session,epoch=audioEpoch;
  if(!session || useHuddleAudioStore.getState().cameraBusy)return;
  update({cameraBusy:true,error:null});let stream;
  try {
    if(controller.cameraStream){
      controller.cameraStream.getTracks().forEach(track=>{track.onended=null;track.stop();});update({localCameraStream:null});
      await controller.setCamera(null);
      const data=await audioRequest('camera-state',{channelId:session.channelId,enabled:false});
      if(currentSession(session,epoch))useHuddleStore.getState().ingest(session.channelId,data.state);
      return;
    }
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:360},frameRate:{ideal:24,max:30}}});
    if(!currentSession(session,epoch)){stream.getTracks().forEach(track=>track.stop());return;}
    const state=await audioRequest('camera-state',{channelId:session.channelId,enabled:true});
    if(!currentSession(session,epoch)){stream.getTracks().forEach(track=>track.stop());return;}
    if(controller.mediaMode==='sfu'){const config=await audioRequest('audio-config',{channelId:session.channelId});if(!currentSession(session,epoch)){stream.getTracks().forEach(track=>track.stop());return;}await controller.updateConfiguration(config);}
    await controller.setCamera(stream);
    if(!currentSession(session,epoch)){stream.getTracks().forEach(track=>track.stop());return;}
    useHuddleStore.getState().ingest(session.channelId,state.state);
    stream.getVideoTracks()[0].onended=()=>{if(currentSession(session,epoch))toggleHuddleCamera();};
  } catch(error){
    stream?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    if(currentSession(session,epoch)){
      audioRequest('camera-state',{channelId:session.channelId,enabled:false}).catch(()=>{});
      update({error:error.name==='NotAllowedError'?'Camera access was denied. Allow Camera in your device settings and try again.':error.name==='NotFoundError'?'No camera was found. Connect a camera and try again.':error.message});
    }
  } finally {if(currentSession(session,epoch))update({cameraBusy:false});}
}

screenSharing=new ScreenShareSession({
  log:(event,details)=>huddleLogger.debug(event,details),
  context:()=>{const session=useHuddleStore.getState().session;return session?{...session,huddleId:useHuddleStore.getState().byChannel?.[session.channelId]?.huddle?._id}:null;},
  capture:async()=>{
    const devices=huddleCaptureDevices();if(!devices?.getDisplayMedia)throw new Error('Screen sharing requires HTTPS or a supported desktop build.');
    const stream=await devices.getDisplayMedia({video:SCREEN_CAPTURE_VIDEO,audio:{restrictOwnAudio:true},systemAudio:'include'});
    try{prepareScreenTrack(stream.getVideoTracks()[0]);
    let selected;
    selected=await globalThis.electronAPI?.getHuddleShareSource?.();
    const track=stream.getVideoTracks()[0],surface=track.getSettings?.()?.displaySurface;
    return {stream,source:selected || {sourceType:surface==='window'?'window':surface==='monitor'?'screen':'browser',sourceLabel:'Shared screen',audioAvailable:(stream.getAudioTracks?.() || []).length>0}};
    }catch(error){stream.getTracks().forEach(track=>{track.onended=null;track.stop();});throw error;}
  },
  publish:async stream=>{
    if(controller.mediaMode==='sfu' && stream){const session=useHuddleStore.getState().session;const config=await audioRequest('audio-config',{channelId:session.channelId});await controller.updateConfiguration(config);}
    await controller.setScreen(stream);
  },
  signal:async payload=>{
    const session=useHuddleStore.getState().session;if(!session)return;
    const data=await audioRequest('screen-state',{channelId:session.channelId,...payload});
    if(useHuddleStore.getState().session?.id===session.id)useHuddleStore.getState().ingest(session.channelId,data.state);
  },
  update,present:value=>globalThis.electronAPI?.updateHuddleShare?.(value),resetAnnotations:id=>screenAnnotations.reset(id),
});
export const toggleHuddleScreen=()=>screenSharing.current?screenSharing.stop():screenSharing.start();
export const switchHuddleScreen=()=>screenSharing.start({switching:true});
export const pauseHuddleScreen=()=>screenSharing.pause();
export const stopHuddleScreen=reason=>screenSharing.stop(reason);
export async function sendScreenAnnotation(event){
  const session=useHuddleStore.getState().session;if(!session)return;
  const data=await audioRequest('screen-annotation',{channelId:session.channelId,...event},0);
  return event.type==='snapshot'?data:data.events;
}
let nativeStroke=null;
function presenterAction(event){
  const share=screenSharing.current;if(!share || event?.sessionId!==share.id)return;
  if(event.action==='stop')return void screenSharing.stop(event.reason || 'user_stop');
  if(event.action==='switch')return void switchHuddleScreen();
  if(event.action==='pause')return void pauseHuddleScreen();
  if(['clear','undo','annotation'].includes(event.action)){
    const type=event.action==='annotation'?event.type:event.action;
    if(type==='start')nativeStroke=crypto.randomUUID();
    if(['move','end'].includes(type) && !nativeStroke)return;
    const message={id:crypto.randomUUID(),shareId:share.id,creatorSessionId:share.context.id,type,strokeId:nativeStroke,points:event.points || [],tool:event.tool,color:event.color};
    screenAnnotations.receive(message);void sendScreenAnnotation(message).catch(error=>update({error:error.message}));
    if(type==='end')nativeStroke=null;
  }
}

export async function updateHuddleFeature(action,payload) {
  const session=useHuddleStore.getState().session;if(!session)return;
  try {const data=await audioRequest(action,{channelId:session.channelId,...payload});
    if(useHuddleStore.getState().session?.id===session.id)useHuddleStore.getState().ingest(session.channelId,data.state);
    return data.state;
  } catch(error){update({error:error.message});throw error;}
}

export function bindHuddleAudio(socket) {
  const signal=message=>controller.receive(message),disconnected=()=>{clearTimeout(renewTimer);void screenSharing.stop('connection_lost',{transportGone:true});controller.pause();};
  const ink=event=>screenAnnotations.receive(event);socket.on('huddle:screen-annotation',ink);
  const disposePresenter=globalThis.electronAPI?.onHuddleShareAction?.(presenterAction);
  const disposeInk=screenAnnotations.subscribe(()=>{const share=screenSharing.current;if(share)globalThis.electronAPI?.updateHuddleAnnotations?.({sessionId:share.id,strokes:screenAnnotations.get(share.id)});});
  socket.on('huddle:signal',signal);socket.on('disconnect',disconnected);
  window.addEventListener('offline',disconnected);
  const unsubscribe=useHuddleStore.subscribe(state=>{
    const context=controller.context;
    if(!context)return;
    if(state.session?.id!==context.sessionId){stopHuddleAudio();return;}
    const own=state.byChannel[context.channelId]?.participants?.find(person=>person.id===context.sessionId);
    if(screenSharing.current && !screenSharing.pending && own?.screenSharing===false)void screenSharing.stop('session_reset');
    const activeShares=new Set((state.byChannel[context.channelId]?.participants || []).map(person=>person.screenShare?.id).filter(Boolean));
    for(const id of screenAnnotations.documents.keys())if(!activeShares.has(id))screenAnnotations.reset(id);
    controller.sync(state.byChannel[context.channelId]);
  });
  return ()=>{disposePresenter?.();disposeInk();screenAnnotations.reset();socket.off('huddle:screen-annotation',ink);window.removeEventListener('offline',disconnected);socket.off('huddle:signal',signal);socket.off('disconnect',disconnected);unsubscribe();stopHuddleAudio();};
}
