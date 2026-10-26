import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function load(relative,mocks={}){
  const result=await build({entryPoints:[path.join(root,relative)],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent',external:Object.keys(mocks)});
  const module={exports:{}};
  vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:name=>{if(name in mocks)return mocks[name];throw new Error(`Unexpected dependency: ${name}`);},setTimeout,clearTimeout,console,process});
  return module.exports;
}
test('native calling loads safely on an old build and reports missing WebRTC only when joining',async()=>{
  const {ensureNativeCalling}=await load('src/features/huddle/services/nativeMedia.service.js',{'react-native':{NativeModules:{},Platform:{OS:'android'}},'react-native-webrtc':{},'react-native-incall-manager':{}});
  assert.throws(ensureNativeCalling,/updated TaskChat native build/);
});
test('native WebRTC registers once, permission denial is actionable, and call routing starts/stops',async()=>{
  let registered=0,started=0,stopped=0,speaker;
  const runtime={registerGlobals:()=>registered++,mediaDevices:{},RTCView:()=>null};
  const service=await load('src/features/huddle/services/nativeMedia.service.js',{
    'react-native':{NativeModules:{WebRTCModule:{},InCallManager:{}},Platform:{OS:'android'},PermissionsAndroid:{PERMISSIONS:{RECORD_AUDIO:'mic'},RESULTS:{GRANTED:'granted'},request:async()=> 'denied'}},
    'react-native-webrtc':runtime,'react-native-incall-manager':{default:{start:()=>started++,stop:()=>stopped++,setForceSpeakerphoneOn:value=>speaker=value}},
  });
  assert.equal(service.ensureNativeCalling(),runtime);service.ensureNativeCalling();assert.equal(registered,1);
  await assert.rejects(service.microphonePermission(),error=>error.name==='NotAllowedError');
  service.nativeCallAudio();assert.equal(started,1);assert.equal(speaker,true);service.setHuddleSpeaker(false);assert.equal(speaker,false);
  service.stopNativeCallAudio();service.stopNativeCallAudio();assert.equal(stopped,1);
});
test('one microphone capture is shared, and leaving during a permission prompt stops the late stream',async()=>{
  const {HuddleMediaManager}=await load('src/features/huddle/services/media.service.js');
  let capture,requests=0,stopped=0;
  const media=new HuddleMediaManager(()=>{requests++;return new Promise(resolve=>capture=resolve);});
  const first=media.getLocalAudioStream(),second=media.getLocalAudioStream();assert.equal(first,second);assert.equal(requests,1);
  media.stopLocalStream();capture({getTracks:()=>[{stop:()=>stopped++}]});
  await assert.rejects(first,error=>error.code==='HUDDLE_CANCELLED');assert.equal(stopped,1);media.stopLocalStream();
});
test('shared notes merge edits from two platforms without overwriting concurrent changes',async()=>{
  // Use the production Yjs protocol, including base64 wire updates.
  const result=await build({entryPoints:[path.join(root,'src/features/huddle/services/sharedNotes.service.js')],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent'});
  const module={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url),setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,TextDecoder,Uint8Array,crypto:globalThis.crypto,btoa,atob,console,process});
  const {SharedNotesSession}=module.exports;
  const Y=await import('../node_modules/yjs/dist/yjs.mjs');const server=new Y.Doc();
  const encoded=()=>Buffer.from(Y.encodeStateAsUpdate(server)).toString('base64');
  const request=async(action,payload)=>{if(action==='notes-edit')Y.applyUpdate(server,Buffer.from(payload.update,'base64'));return {notesDocument:encoded()};};
  const a=new SharedNotesSession({request}),b=new SharedNotesSession({request});
  try{await Promise.all([a.start(),b.start()]);a.edit('Alpha');b.edit('Beta');await Promise.all([a.flush(),b.flush()]);a.apply(encoded());b.apply(encoded());assert.equal(a.snapshot().value,b.snapshot().value);assert.match(a.snapshot().value,/Alpha/);assert.match(a.snapshot().value,/Beta/);}finally{a.dispose();b.dispose();server.destroy();}
});
test('native stream cleanup releases resources once without stopping remote tracks',async()=>{
  const {releaseStream}=await load('src/features/huddle/services/releaseStream.js');
  let stopped=0,released=0,releaseTracks;
  const stream={getTracks:()=>[{stop:()=>stopped++}],release:value=>{released++;releaseTracks=value;}};
  releaseStream(stream,false);releaseStream(stream,false);assert.equal(stopped,0);assert.equal(released,1);assert.equal(releaseTracks,false);
});
test('incoming push uses the in-app call popup in foreground and OS sound in background; expired calls stay silent',async()=>{
  let handler;const invitations=[],AppState={currentState:'active'};
  await load('src/services/pushNotificationService.js',{
    'expo-device':{},'expo':{isRunningInExpoGo:()=>false},'react-native':{Platform:{OS:'android'},AppState},
    './storage':{default:{}},'./api':{},'../utils/logger':{default:{info(){},warn(){},error(){}}},
    '../constants/notificationSounds':{},
    '../stores/authStore':{useAuthStore:{getState:()=>({user:{_id:'recipient'},accessToken:'test'})}},
    '../stores/huddleUiStore':{useHuddleUiStore:{getState:()=>({receiveInvitation:item=>invitations.push(item)})}},
    '../stores/notificationStore':{},'../stores/channelStore':{},'../stores/workspaceStore':{},'../features/huddle/services/incomingCall.service':{},
    'expo-notifications':{setNotificationHandler:value=>handler=value},
  });
  const data={id:'invitation',type:'huddle_invitation',channelId:'channel',huddleId:'meeting',expiresAt:Date.now()+60000};
  const incoming=()=>({request:{content:{data}}});
  assert.equal((await handler.handleNotification(incoming())).shouldPlaySound,false);assert.equal(invitations.length,1);
  AppState.currentState='background';assert.equal((await handler.handleNotification(incoming())).shouldPlaySound,true);
  data.expiresAt=Date.now()-1;assert.equal((await handler.handleNotification(incoming())).shouldShowBanner,false);
});
test('iPhone screen sharing waits for the broadcast extension first frame and removes its native listener',async()=>{
  let listener,removed=0,shown=0,ready=false;
  const stream={getTracks:()=>[],release(){}};
  class Events {addListener(_name,callback){listener=callback;return {remove:()=>removed++};}}
  const service=await load('src/features/huddle/services/nativeMedia.service.js',{
    'react-native':{Platform:{OS:'ios'},NativeEventEmitter:Events,NativeModules:{WebRTCModule:{},TaskChatHuddle:{},ScreenCapturePickerViewManager:{show:()=>shown++}}},
    'react-native-webrtc':{registerGlobals(){},mediaDevices:{getDisplayMedia:async()=>stream}},'react-native-incall-manager':{},
  });
  service.setIOSScreenPickerHandle(1);
  const pending=service.nativeCaptureDevices().getDisplayMedia().then(value=>{ready=true;return value;});
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(shown,1);assert.equal(ready,false);
  listener({started:true});assert.equal(await pending,stream);assert.equal(removed,1);
});
test('leaving during iPhone capture setup cancels before presenting the OS broadcast picker',async()=>{
  let capture,shown=0,released=0;
  const stream={getTracks:()=>[],release:()=>released++};
  class Events {addListener(){return {remove(){}};}}
  const service=await load('src/features/huddle/services/nativeMedia.service.js',{
    'react-native':{Platform:{OS:'ios'},NativeEventEmitter:Events,NativeModules:{WebRTCModule:{},TaskChatHuddle:{stop(){},stopBroadcast(){}},ScreenCapturePickerViewManager:{show:()=>shown++}}},
    'react-native-webrtc':{registerGlobals(){},mediaDevices:{getDisplayMedia:()=>new Promise(resolve=>capture=resolve)}},'react-native-incall-manager':{},
  });
  service.setIOSScreenPickerHandle(1);const pending=service.nativeCaptureDevices().getDisplayMedia();
  service.stopNativeCallAudio();capture(stream);await assert.rejects(pending,error=>error.name==='NotAllowedError');assert.equal(shown,0);assert.equal(released,1);
});
