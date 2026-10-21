import {HuddleMediaManager} from '../features/huddle/services/media.service';
import {mediaError} from '../features/huddle/utils/huddle.errors';
import {huddleLogger} from '../features/huddle/utils/huddle.logger';
import {sendHuddleRequest as audioRequest} from './huddleRequest';
import {useHuddleStore} from '../stores/huddleStore';
import {useHuddleAudioStore} from '../stores/huddleAudioStore';
import {HuddleAudioController} from './HuddleAudioController';
import {HuddleSfuController} from './HuddleSfuController';
import {screenPresentation} from '../features/huddle/services/screenPresentation.service';
import {SCREEN_CAPTURE_VIDEO,prepareScreenTrack} from '../features/huddle/services/screenQuality.service';
import {huddleCaptureDevices} from '../features/huddle/services/huddlePopout.service';

const microphone=new HuddleMediaManager();
let starting=null;
let audioEpoch=0,renewTimer=null,restarting=null,muteQueue=Promise.resolve();
const update=patch=>{
  if(Object.hasOwn(patch,'localScreenStream') && !patch.localScreenStream){
    screenPresentation.stop();
    globalThis.electronAPI?.setHuddleScreenSharing?.(false);
  }
  useHuddleAudioStore.getState().update(patch);
};
const controllerOptions={
  send:(action,payload)=>audioRequest(action,payload),onUpdate:update,
  onScreenStopped:channelId=>{const session=useHuddleStore.getState().session;if(session?.channelId!==channelId)return;audioRequest('screen-state',{channelId,sharing:false}).then(data=>{if(useHuddleStore.getState().session?.id===session.id)useHuddleStore.getState().ingest(channelId,data.state);}).catch(error=>{if(useHuddleStore.getState().session?.id===session.id)update({error:error.message});});},
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

export async function toggleHuddleScreen() {
  const session=useHuddleStore.getState().session,epoch=audioEpoch;
  if(!session || useHuddleAudioStore.getState().screenBusy)return;
  update({screenBusy:true,error:null});let stream,source;
  const releaseCapture=()=>{
    if(source && screenPresentation.source===source)screenPresentation.stop();
    else for(const track of new Set([...(source?.getTracks() || []),...(stream?.getTracks() || [])])){track.onended=null;track.stop();}
  };
  try {
    if(controller.screenStream) {
      await controller.setScreen(null);
      const data=await audioRequest('screen-state',{channelId:session.channelId,sharing:false});
      if(currentSession(session,epoch))useHuddleStore.getState().ingest(session.channelId,data.state);
      return;
    }
    const captureDevices=huddleCaptureDevices();
    if(!captureDevices?.getDisplayMedia)throw new Error('Screen sharing requires HTTPS or a supported desktop build.');
    source=await captureDevices.getDisplayMedia({video:SCREEN_CAPTURE_VIDEO,audio:{restrictOwnAudio:true},systemAudio:"include"});
    stream=source;
    if(!currentSession(session,epoch)){releaseCapture();return;}
    prepareScreenTrack(source.getVideoTracks()[0]);
    stream=await screenPresentation.start(source);
    if(!currentSession(session,epoch)){releaseCapture();return;}
    const data=await audioRequest('screen-state',{channelId:session.channelId,sharing:true});
    if(!currentSession(session,epoch)){releaseCapture();return;}
    useHuddleStore.getState().ingest(session.channelId,data.state);
    if(controller.mediaMode==='sfu'){const config=await audioRequest('audio-config',{channelId:session.channelId});if(!currentSession(session,epoch)){releaseCapture();return;}await controller.updateConfiguration(config);}
    await controller.setScreen(stream);
    if(!currentSession(session,epoch)){releaseCapture();return;}
    globalThis.electronAPI?.setHuddleScreenSharing?.(true);
    source.getVideoTracks()[0].onended=()=>{if(currentSession(session,epoch))toggleHuddleScreen();};
  } catch(error) {
    releaseCapture();
    if(currentSession(session,epoch))globalThis.electronAPI?.setHuddleScreenSharing?.(false);
    if(currentSession(session,epoch)) {
      if(stream)audioRequest('screen-state',{channelId:session.channelId,sharing:false}).then(data=>{if(currentSession(session,epoch))useHuddleStore.getState().ingest(session.channelId,data.state);}).catch(e=>{if(currentSession(session,epoch))update({error:e.message});});
      update({error:error.name==='NotAllowedError'?'Screen sharing was cancelled or denied. You can try again.':error.message});
    }
  } finally {if(currentSession(session,epoch))update({screenBusy:false});}
}

export async function updateHuddleFeature(action,payload) {
  const session=useHuddleStore.getState().session;if(!session)return;
  try {const data=await audioRequest(action,{channelId:session.channelId,...payload});
    if(useHuddleStore.getState().session?.id===session.id)useHuddleStore.getState().ingest(session.channelId,data.state);
    return data.state;
  } catch(error){update({error:error.message});throw error;}
}

export function bindHuddleAudio(socket) {
  const signal=message=>controller.receive(message),disconnected=()=>{clearTimeout(renewTimer);controller.pause();};
  socket.on('huddle:signal',signal);socket.on('disconnect',disconnected);
  window.addEventListener('offline',disconnected);
  const unsubscribe=useHuddleStore.subscribe(state=>{
    const context=controller.context;
    if(!context)return;
    if(state.session?.id!==context.sessionId){stopHuddleAudio();return;}
    controller.sync(state.byChannel[context.channelId]);
  });
  return ()=>{window.removeEventListener('offline',disconnected);socket.off('huddle:signal',signal);socket.off('disconnect',disconnected);unsubscribe();stopHuddleAudio();};
}
