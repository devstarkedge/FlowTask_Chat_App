import {releaseStream} from '../features/huddle/services/releaseStream';
// TaskChat-owned signaling; the library only implements local WebRTC transports.
import {HuddleAudioMixer} from "../features/huddle/services/audioMixer.service";
import {SCREEN_ENCODING} from '../features/huddle/services/screenQuality.service';
export class HuddleSfuController {
  constructor({onUpdate,onLocalEnded=()=>{},onScreenStopped=()=>{},AudioMixer=HuddleAudioMixer}){this.audioMixer=new AudioMixer();this.update=onUpdate;this.onLocalEnded=onLocalEnded;this.onScreenStopped=onScreenStopped;this.epoch=0;this.mediaMode='sfu';this.consumers=new Map();this.consumerStreams=new WeakMap();this.stream=null;this.context=null;}
  begin({stream,channelId,sessionId}){this.stop();this.stream=stream;this.context={channelId,sessionId};this.muted=false;for(const track of stream.getAudioTracks())track.onended=()=>{this.setMuted(true);this.onLocalEnded(channelId);};this.update({connection:'preparing',localMicrophoneStream:stream,error:null});}
  request(operation,data={}){const socket=this.socket;if(!socket?.connected)return Promise.reject(new Error('Media connection is unavailable'));return new Promise((resolve,reject)=>socket.timeout(8000).emit('media:request',{operation,data},(error,result)=>error?reject(new Error('Media request timed out')):result?.ok?resolve(result.data):reject(new Error(result?.error || 'Media request failed'))));}
  live(epoch){if(this.epoch!==epoch || !this.context)throw new Error('Media session changed');}
  async configure(config){
    const epoch=this.epoch;
    const [{Device},{io}]=await Promise.all([import('mediasoup-client'),import('socket.io-client')]);this.live(epoch);
    const own=config.state.participants.find(p=>p.id===this.context.sessionId);if(!own?.audioReady)throw new Error('Audio session was not registered');
    this.context={...this.context,mediaId:own.mediaId};this.rtcConfiguration=config.rtcConfiguration;this.iceExpiresAt=config.expiresAt;
    const socket=io(config.media.url,{auth:{token:config.media.token},transports:['websocket'],reconnection:false,timeout:8000});this.socket=socket;
    await new Promise((resolve,reject)=>{const cleanup=()=>{socket.off('connect',connected);socket.off('connect_error',failed);socket.off('disconnect',failed);};const connected=()=>{cleanup();resolve();};const failed=error=>{cleanup();reject(error instanceof Error?error:new Error('Media disconnected'));};socket.once('connect',connected);socket.once('connect_error',failed);socket.once('disconnect',failed);});this.live(epoch);
    socket.on('disconnect',()=>{if(this.socket!==socket)return;if(this.screenStream)this.onScreenStopped(this.context.channelId);this.pause();this.update({connection:'failed',error:'Media server disconnected. Retry audio to reconnect.'});});
    const device=new Device({handlerName:'ReactNative106'});const capabilities=await this.request('capabilities');this.live(epoch);await device.load(capabilities);this.live(epoch);this.device=device;
    for(const direction of ['send','recv']) {
      const parameters=await this.request('transport',{direction});this.live(epoch);
      const options={...parameters,iceServers:config.rtcConfiguration.iceServers,iceTransportPolicy:config.rtcConfiguration.iceTransportPolicy};
      const transport=direction==='send'?device.createSendTransport(options):device.createRecvTransport(options);this[direction]=transport;
      transport.on('connect',({dtlsParameters},callback,errback)=>{this.request('connect',{transportId:transport.id,dtlsParameters}).then(callback,errback);});
      if(direction==='send')transport.on('produce',({kind,rtpParameters,appData},callback,errback)=>{this.request('produce',{transportId:transport.id,kind,rtpParameters,source:appData.source}).then(callback,errback);});
      transport.on('connectionstatechange',state=>{if(this.epoch!==epoch)return;if(state==='failed'){this.pause();this.update({connection:'failed',error:'Media connection failed. Retry audio.'});}else if(state==='connected')this.update({connection:this.consumers.size?'connected':'waiting'});});
    }
    const microphone=this.audioMixer.track || this.stream.getAudioTracks()[0];
    if(microphone)this.audioProducer=await this.send.produce({track:microphone,appData:{source:'microphone'},stopTracks:false});
    if(this.cameraStream)this.cameraProducer=await this.send.produce({track:this.cameraStream.getVideoTracks()[0],appData:{source:'camera'},stopTracks:false});
    this.live(epoch);this.initialized=true;
    const changed=()=>this.requestRefresh(epoch);socket.on('media:changed',changed);changed();this.update({notice:null,error:null});
  }
  requestRefresh(epoch){
    if(!this.initialized || this.epoch!==epoch)return;
    // A burst of joins/camera changes needs the latest producer list, not an
    // ever-growing queue containing one full refresh per event.
    this.refreshPending=true;
    if(this.refreshQueue)return this.refreshQueue;
    const task=(async()=>{while(this.refreshPending && this.initialized && this.epoch===epoch){this.refreshPending=false;await this.refresh(epoch);}})()
      .catch(error=>{if(this.epoch===epoch)this.update({error:error.message});});
    this.refreshQueue=task;
    task.finally(()=>{if(this.refreshQueue===task)this.refreshQueue=null;});
    return task;
  }
  async refresh(epoch){
    if(!this.initialized || this.epoch!==epoch)return;const producers=await this.request('list');this.live(epoch);const ids=new Set(producers.map(p=>p.id));
    for(const [id,consumer] of this.consumers)if(!ids.has(id)){consumer.close();releaseStream(this.consumerStreams.get(consumer),false);this.consumers.delete(id);}
    for(const producer of producers){if(this.consumers.has(producer.id))continue;const data=await this.request('consume',{transportId:this.recv.id,producerId:producer.id,rtpCapabilities:this.device.rtpCapabilities});this.live(epoch);const consumer=await this.recv.consume(data);if(this.epoch!==epoch){consumer.close();return;}this.consumers.set(producer.id,consumer);await this.request('resume',{consumerId:data.id});this.live(epoch);}
    const consumers=[...this.consumers.values()],audio=consumers.filter(c=>c.track.kind==='audio').map(c=>c.track),screen=consumers.find(c=>c.appData.source==='screen');
    const streamFor=consumer=>{let stream=this.consumerStreams.get(consumer);if(!stream){stream=new MediaStream([consumer.track]);this.consumerStreams.set(consumer,stream);}return stream;};
    const remoteAudioStreams=Object.fromEntries(consumers.filter(c=>c.track.kind==='audio').map(c=>[c.appData.sessionId,streamFor(c)]));
    const cameras=Object.fromEntries(consumers.filter(c=>c.appData.source==='camera').map(c=>[c.appData.sessionId,streamFor(c)]));
    if(!this.remoteAudioTracks || audio.length!==this.remoteAudioTracks.length || audio.some((track,index)=>track!==this.remoteAudioTracks[index])){releaseStream(this.remoteAudioStream,false);this.remoteAudioStream=audio.length?new MediaStream(audio):null;}
    this.remoteAudioTracks=audio;
    this.update({remoteAudioStreams,remoteStream:this.remoteAudioStream,remoteScreenStream:screen?streamFor(screen):null,remoteCameraStreams:cameras,connection:consumers.length?'connected':'waiting'});
  }
  sync(state){if(!this.initialized)return;const own=state?.participants?.find(p=>p.id===this.context?.sessionId);if(!own?.audioReady || own.mediaId!==this.context.mediaId)this.pause();}
  receive(){}
  setMuted(muted){this.muted=muted;this.stream?.getAudioTracks().forEach(t=>{t.enabled=!muted;});this.update({muted});}
  async setMicrophone(stream){
    const epoch=this.epoch,track=stream.getAudioTracks()[0];track.enabled=!this.muted;
    const outgoing=await this.audioMixer.setSources(stream,this.screenStream);this.live(epoch);let producer=this.audioProducer;
    if(producer)await producer.replaceTrack({track:outgoing});
    else {if(!this.initialized)throw new Error('Reconnect audio before enabling the microphone');producer=await this.send.produce({track:outgoing,appData:{source:'microphone'},stopTracks:false});}
    if(this.epoch!==epoch || !this.context){producer.close();throw new Error('Media session changed');}
    this.audioProducer=producer;const old=this.stream;this.stream=stream;this.update({localMicrophoneStream:stream});const channelId=this.context.channelId;
    track.onended=()=>{this.setMuted(true);this.onLocalEnded(channelId);};releaseStream(old);
  }
  async setCamera(stream){
    const old=this.cameraStream;
    if(stream){if(!this.initialized)throw new Error('Reconnect audio before enabling the camera');const epoch=this.epoch;const producer=await this.send.produce({track:stream.getVideoTracks()[0],appData:{source:'camera'},stopTracks:false});if(this.epoch!==epoch){producer.close();throw new Error('Media session changed');}this.cameraProducer=producer;}
    else if(this.cameraProducer){const producer=this.cameraProducer;this.cameraProducer=null;this.cameraStream=null;this.update({localCameraStream:null});releaseStream(old);producer.close();await this.request('close-producer',{producerId:producer.id});}
    this.cameraStream=stream || null;releaseStream(old);this.update({localCameraStream:this.cameraStream});
  }
  async setScreen(stream){
    const epoch=this.epoch,previous=this.screenStream;this.screenStream=null;if(!stream)this.update({localScreenStream:null});
    try {
      if(this.screenProducer){const old=this.screenProducer;this.screenProducer=null;old.close();await this.request('close-producer',{producerId:old.id});}
      const track=await this.audioMixer.setSources(this.stream,stream);this.live(epoch);
      if(this.audioProducer){
        if(track)await this.audioProducer.replaceTrack({track});
        else {const old=this.audioProducer;this.audioProducer=null;old.close();await this.request('close-producer',{producerId:old.id});}
      } else if(track){const producer=await this.send.produce({track,appData:{source:'microphone'},stopTracks:false});if(this.epoch!==epoch){producer.close();throw new Error('Media session changed');}this.audioProducer=producer;}
      this.live(epoch);
      if(stream){const producer=await this.send.produce({track:stream.getVideoTracks()[0],appData:{source:'screen'},encodings:[{...SCREEN_ENCODING}],codecOptions:{videoGoogleStartBitrate:2000},stopTracks:false});if(this.epoch!==epoch){producer.close();throw new Error('Media session changed');}this.screenProducer=producer;this.screenStream=stream;}
      this.update({localScreenStream:this.screenStream});
    } catch(error) {
      if(this.epoch===epoch){this.audioMixer.stop();const microphone=this.stream?.getAudioTracks()[0];if(this.audioProducer && microphone)await this.audioProducer.replaceTrack({track:microphone}).catch(()=>{});else if(this.audioProducer){const old=this.audioProducer;this.audioProducer=null;old.close();await this.request('close-producer',{producerId:old.id}).catch(()=>{});}}
      throw error;
    } finally {releaseStream(previous);}
  }
  async updateConfiguration(config){if(!this.socket?.connected)throw new Error('Media connection is unavailable');const socket=this.socket;await new Promise((resolve,reject)=>socket.timeout(8000).emit('media:renew',config.media.token,(error,result)=>error || !result?.ok?reject(new Error('Media authorization could not be renewed')):resolve()));const changed=JSON.stringify(this.rtcConfiguration?.iceServers)!==JSON.stringify(config.rtcConfiguration.iceServers);if(changed && (!this.iceExpiresAt || this.iceExpiresAt-Date.now()/1000<300)){await Promise.all([this.send,this.recv].filter(Boolean).map(transport=>transport.updateIceServers({iceServers:config.rtcConfiguration.iceServers})));this.rtcConfiguration=config.rtcConfiguration;this.iceExpiresAt=config.expiresAt;}}
  pause(){this.audioMixer.stop();this.epoch++;this.initialized=false;this.refreshPending=false;this.refreshQueue=null;const socket=this.socket;this.socket=null;socket?.removeAllListeners();socket?.disconnect();this.send?.close();this.recv?.close();this.send=this.recv=null;this.audioProducer=this.screenProducer=this.cameraProducer=null;for(const consumer of this.consumers.values()){consumer.close();releaseStream(this.consumerStreams.get(consumer),false);}releaseStream(this.remoteAudioStream,false);this.consumers.clear();this.remoteAudioTracks=null;this.remoteAudioStream=null;releaseStream(this.screenStream);this.screenStream=null;this.cameraStream?.getTracks().forEach(t=>{t.enabled=false;});this.stream?.getAudioTracks().forEach(t=>{t.enabled=false;});this.update({remoteStream:null,remoteAudioStreams:{},remoteScreenStream:null,remoteCameraStreams:{},localScreenStream:null,connection:this.context?'reconnecting':'idle'});}
  restoreTracks(){this.stream?.getAudioTracks().forEach(t=>{t.enabled=!this.muted;});this.cameraStream?.getTracks().forEach(t=>{t.enabled=true;});}
  stop(){this.context=null;this.pause();releaseStream(this.cameraStream);this.cameraStream=null;releaseStream(this.stream);this.stream=null;this.context=null;this.update({connection:'idle',localMicrophoneStream:null,muted:false,notice:null,localCameraStream:null});}
}
