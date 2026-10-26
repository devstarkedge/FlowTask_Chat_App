import {NativeModules,Platform,PermissionsAndroid,NativeEventEmitter} from 'react-native';
import {releaseStream} from './releaseStream';

let runtime=null,audio=null;
let iosPicker=null,pendingCapture=null;
export function setIOSScreenPickerHandle(handle){iosPicker=handle;}
export function ensureNativeCalling(){
  if(runtime)return runtime;
  if(!NativeModules.WebRTCModule)throw new Error('Calling requires the updated TaskChat native build. It is not available in Expo Go.');
  runtime=require('react-native-webrtc');runtime.registerGlobals();
  return runtime;
}
export async function microphonePermission(){
  ensureNativeCalling();
  if(Platform.OS==='android'){
    const result=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if(result!==PermissionsAndroid.RESULTS.GRANTED)throw Object.assign(new Error('Allow microphone access in Settings to speak in this Huddle.'),{name:'NotAllowedError'});
  }
}
export function nativeCallAudio(){
  if(!NativeModules.InCallManager)return;
  audio=require('react-native-incall-manager').default;
  audio.start({media:'audio',auto:true});audio.setForceSpeakerphoneOn(true);
}
export async function startNativeCallLifetime(microphone){
  if(!NativeModules.TaskChatHuddle)throw new Error('Install the updated native TaskChat build to enable background calling.');
  await NativeModules.TaskChatHuddle.start(Boolean(microphone));
}
export function setHuddleSpeaker(enabled){audio?.setForceSpeakerphoneOn(enabled);}
export function stopNativeCallAudio(){pendingCapture?.();NativeModules.TaskChatHuddle?.stop();audio?.stop();audio=null;}
export function nativeCaptureDevices(){
  const rtc=ensureNativeCalling();
  if(Platform.OS==='ios')return {getDisplayMedia:()=>captureIOSScreen(rtc)};
  return rtc.mediaDevices;
}
export function getNativeVideoView(){return NativeModules.WebRTCModule?ensureNativeCalling().RTCView:null;}
export function getIOSScreenPicker(){return Platform.OS==='ios' && NativeModules.WebRTCModule?ensureNativeCalling().ScreenCapturePickerView:null;}
async function captureIOSScreen(rtc){
  if(!iosPicker || !NativeModules.TaskChatHuddle || !NativeModules.ScreenCapturePickerViewManager)throw new Error('Install the latest signed TaskChat build with its screen-sharing extension.');
  if(pendingCapture)throw new Error('Screen sharing is already opening.');
  let stream,subscription,timer,cancelled=false;
  const started=new Promise((resolve,reject)=>{
    subscription=new NativeEventEmitter(NativeModules.TaskChatHuddle).addListener('taskchat:huddle-broadcast',event=>event.started?resolve():reject(new Error('Screen sharing ended.')));
    pendingCapture=()=>{cancelled=true;reject(Object.assign(new Error('Screen sharing cancelled.'),{name:'NotAllowedError'}));};
    timer=setTimeout(pendingCapture,90000);
  });
  // Install the rejection handler before awaiting native capture permissions.
  started.catch(()=>{});
  try{
    stream=await rtc.mediaDevices.getDisplayMedia({video:true,audio:false});
    if(cancelled)throw Object.assign(new Error('Screen sharing cancelled.'),{name:'NotAllowedError'});
    NativeModules.ScreenCapturePickerViewManager.show(iosPicker);
    await started;
    return stream;
  }catch(error){releaseStream(stream);NativeModules.TaskChatHuddle.stopBroadcast?.();throw error;}
  finally{clearTimeout(timer);subscription?.remove();pendingCapture=null;}
}
