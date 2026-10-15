import {sendHuddleRequest as audioRequest} from './huddleRequest';
import {useHuddleStore} from '../stores/huddleStore';
import {useHuddleAudioStore} from '../stores/huddleAudioStore';
import {HuddleAudioController} from './HuddleAudioController';
import {HuddleSfuController} from './HuddleSfuController';

let audioEpoch=0,renewTimer=null,restarting=null,muteQueue=Promise.resolve();
const update=patch=>useHuddleAudioStore.getState().update(patch);
const controllerOptions={
  send:(action,payload)=>audioRequest(action,payload),onUpdate:update,
  onScreenStopped:channelId=>{const session=useHuddleStore.getState().session;if(session?.channelId!==channelId)return;audioRequest('screen-state',{channelId,sharing:false}).then(data=>{if(useHuddleStore.getState().session?.id===session.id)useHuddleStore.getState().ingest(channelId,data.state);}).catch(error=>update({error:error.message}));},
  onLocalEnded:channelId=>{update({error:'Microphone disconnected. Join again to choose an available microphone.'});useHuddleStore.getState().act('leave',channelId);},
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
    } catch(error){if(epoch===audioEpoch)update({error:error.message});}
  },Number.isFinite(renewAfterMs)?Math.max(1000,Math.min(renewAfterMs,40000)):Math.max(1000,(expiresAt-Math.floor(Date.now()/1000)-20)*1000));
}

export async function startHuddleAudio(channelId,session) {
  const epoch=audioEpoch;
  if(!globalThis.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia)throw new Error('Audio requires a supported browser over HTTPS or localhost.');
  update({connection:useHuddleAudioStore.getState().joinWithoutMicrophone?'preparing':'requesting-microphone',error:null});
  let stream;
  try {
    const {inputDeviceId,startMuted,joinWithoutMicrophone}=useHuddleAudioStore.getState();
    if(joinWithoutMicrophone)stream=new MediaStream();
    else {
      const audio={echoCancellation:true,noiseSuppression:true,autoGainControl:true};
      try {
        stream=await navigator.mediaDevices.getUserMedia({audio:{...audio,...(inputDeviceId?{deviceId:{exact:inputDeviceId}}: {})},video:false});
      } catch(error) {
        // A removed device must not permanently block an otherwise usable default input.
        if(!inputDeviceId || !['NotFoundError','OverconstrainedError'].includes(error.name) || !currentSession(session,epoch))throw error;
        stream=await navigator.mediaDevices.getUserMedia({audio,video:false});
        if(currentSession(session,epoch))update({inputDeviceId:''});
      }
    }
    if(!currentSession(session,epoch)){stream.getTracks().forEach(track=>track.stop());return;}
    controller.begin({stream,channelId,sessionId:session.id});
    const muted=joinWithoutMicrophone || startMuted;
    controller.setMuted(muted);
    update({withoutMicrophone:Boolean(joinWithoutMicrophone)});
    const data=await audioRequest('audio-ready',{channelId,muted});
    if(!currentSession(session,epoch))return;
    useHuddleStore.getState().ingest(channelId,data.state);
    selectController(data.mediaMode || 'p2p');await controller.configure(data);scheduleRenewal(data.mediaExpiresAt || data.expiresAt,data.mediaRenewAfterMs);
    update({invitation:data.state?.invitation || null});
  } catch(error) {
    if(currentSession(session,epoch)) {
      stopHuddleAudio();
      const message=error.name==='NotAllowedError'?'Microphone access was denied. Allow your headset or computer microphone in browser and device settings, or select Join without microphone.':error.name==='NotFoundError'?'No microphone was found. Connect a headset with a microphone or enable your computer’s built-in microphone. You can also select Join without microphone to listen and share your screen.':error.name==='NotReadableError'?'The microphone is busy or unavailable. Close other recording apps, or select Join without microphone.':error.message;
      update({error:message});throw new Error(message);
    }
    stream?.getTracks().forEach(track=>track.stop());
  }
}

export function stopHuddleAudio() {
  audioEpoch++;restarting=null;clearTimeout(renewTimer);renewTimer=null;controller.stop();
  update({deafened:false,playbackBlocked:false,invitation:null,withoutMicrophone:false});
}

export async function retryHuddleAudio() {
  if(restarting)return;
  const session=useHuddleStore.getState().session;if(!session)return;
  const epoch=audioEpoch,token=Symbol('audio-restart');restarting=token;
  try {
    if(!controller.stream){await startHuddleAudio(session.channelId,session);return;}
    controller.pause();
    const data=await audioRequest('audio-ready',{channelId:session.channelId,muted:controller.muted});
    if(!currentSession(session,epoch))return;
    useHuddleStore.getState().ingest(session.channelId,data.state);
    selectController(data.mediaMode || 'p2p');controller.restoreTracks();await controller.configure(data);scheduleRenewal(data.mediaExpiresAt || data.expiresAt,data.mediaRenewAfterMs);
  } catch(error){if(currentSession(session,epoch))update({connection:'failed',error:error.message});}
  finally {if(restarting===token)restarting=null;}
}

export async function toggleHuddleMute() {
  const session=useHuddleStore.getState().session;if(!session || !controller.stream?.getAudioTracks().length)return;
  const muted=!controller.muted,epoch=audioEpoch;controller.setMuted(muted);
  muteQueue=muteQueue.then(async()=>{
    if(!currentSession(session,epoch))return;
    const data=await audioRequest('audio-state',{channelId:session.channelId,muted});
    if(currentSession(session,epoch))useHuddleStore.getState().ingest(session.channelId,data.state);
  }).catch(error=>{if(currentSession(session,epoch))update({error:error.message});});
  await muteQueue;
}

export async function toggleHuddleScreen() {
  const session=useHuddleStore.getState().session,epoch=audioEpoch;
  if(!session || useHuddleAudioStore.getState().screenBusy)return;
  update({screenBusy:true,error:null});let stream;
  try {
    if(controller.screenStream) {
      await controller.setScreen(null);
      const data=await audioRequest('screen-state',{channelId:session.channelId,sharing:false});
      if(currentSession(session,epoch))useHuddleStore.getState().ingest(session.channelId,data.state);
      return;
    }
    if(!navigator.mediaDevices?.getDisplayMedia)throw new Error('Screen sharing requires HTTPS or a supported desktop build.');
    stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:30}},audio:false});
    if(!currentSession(session,epoch)){stream.getTracks().forEach(t=>t.stop());return;}
    const data=await audioRequest('screen-state',{channelId:session.channelId,sharing:true});
    if(!currentSession(session,epoch)){stream.getTracks().forEach(t=>t.stop());return;}
    useHuddleStore.getState().ingest(session.channelId,data.state);
    if(controller.mediaMode==='sfu'){const config=await audioRequest('audio-config',{channelId:session.channelId});if(!currentSession(session,epoch)){stream.getTracks().forEach(t=>t.stop());return;}await controller.updateConfiguration(config);}
    await controller.setScreen(stream);
    stream.getVideoTracks()[0].onended=()=>{if(currentSession(session,epoch))toggleHuddleScreen();};
  } catch(error) {
    stream?.getTracks().forEach(t=>t.stop());
    if(currentSession(session,epoch)) {
      if(stream)audioRequest('screen-state',{channelId:session.channelId,sharing:false}).then(data=>useHuddleStore.getState().ingest(session.channelId,data.state)).catch(e=>update({error:e.message}));
      update({error:error.name==='NotAllowedError'?'Screen sharing was cancelled or denied. You can try again.':error.message});
    }
  } finally {update({screenBusy:false});}
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
  const unsubscribe=useHuddleStore.subscribe(state=>{
    const context=controller.context;
    if(!context)return;
    if(state.session?.id!==context.sessionId){stopHuddleAudio();return;}
    controller.sync(state.byChannel[context.channelId]);
  });
  return ()=>{socket.off('huddle:signal',signal);socket.off('disconnect',disconnected);unsubscribe();stopHuddleAudio();};
}
