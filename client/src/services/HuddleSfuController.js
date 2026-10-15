// TaskChat-owned signaling; the library only implements local WebRTC transports.
export class HuddleSfuController {
  constructor({onUpdate,onLocalEnded=()=>{},onScreenStopped=()=>{}}){this.update=onUpdate;this.onLocalEnded=onLocalEnded;this.onScreenStopped=onScreenStopped;this.epoch=0;this.mediaMode='sfu';this.consumers=new Map();this.stream=null;this.context=null;}
  begin({stream,channelId,sessionId}){this.stop();this.stream=stream;this.context={channelId,sessionId};this.muted=false;for(const track of stream.getAudioTracks())track.onended=()=>{this.stop();this.onLocalEnded(channelId);};this.update({connection:'preparing',error:null});}
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
    const device=new Device();const capabilities=await this.request('capabilities');this.live(epoch);await device.load(capabilities);this.live(epoch);this.device=device;
    for(const direction of ['send','recv']) {
      const parameters=await this.request('transport',{direction});this.live(epoch);
      const options={...parameters,iceServers:config.rtcConfiguration.iceServers,iceTransportPolicy:config.rtcConfiguration.iceTransportPolicy};
      const transport=direction==='send'?device.createSendTransport(options):device.createRecvTransport(options);this[direction]=transport;
      transport.on('connect',({dtlsParameters},callback,errback)=>{this.request('connect',{transportId:transport.id,dtlsParameters}).then(callback,errback);});
      if(direction==='send')transport.on('produce',({kind,rtpParameters,appData},callback,errback)=>{this.request('produce',{transportId:transport.id,kind,rtpParameters,source:appData.source}).then(callback,errback);});
      transport.on('connectionstatechange',state=>{if(this.epoch!==epoch)return;if(state==='failed'){this.pause();this.update({connection:'failed',error:'Media connection failed. Retry audio.'});}else if(state==='connected')this.update({connection:this.consumers.size?'connected':'waiting'});});
    }
    const microphone=this.stream.getAudioTracks()[0];
    if(microphone)this.audioProducer=await this.send.produce({track:microphone,appData:{source:'microphone'},stopTracks:false});
    this.live(epoch);this.initialized=true;
    this.refreshQueue=Promise.resolve();const changed=()=>{this.refreshQueue=this.refreshQueue.then(()=>this.refresh(epoch)).catch(error=>{if(this.epoch===epoch)this.update({error:error.message});});};socket.on('media:changed',changed);changed();this.update({notice:null,error:null});
  }
  async refresh(epoch){
    if(!this.initialized || this.epoch!==epoch)return;const producers=await this.request('list');this.live(epoch);const ids=new Set(producers.map(p=>p.id));
    for(const [id,consumer] of this.consumers)if(!ids.has(id)){consumer.close();this.consumers.delete(id);}
    for(const producer of producers){if(this.consumers.has(producer.id))continue;const data=await this.request('consume',{transportId:this.recv.id,producerId:producer.id,rtpCapabilities:this.device.rtpCapabilities});this.live(epoch);const consumer=await this.recv.consume(data);if(this.epoch!==epoch){consumer.close();return;}this.consumers.set(producer.id,consumer);await this.request('resume',{consumerId:data.id});this.live(epoch);}
    const tracks=[...this.consumers.values()].map(c=>c.track);const audio=tracks.filter(t=>t.kind==='audio'),video=tracks.find(t=>t.kind==='video');
    this.update({remoteStream:audio.length?new MediaStream(audio):null,remoteScreenStream:video?new MediaStream([video]):null,connection:audio.length?'connected':'waiting'});
  }
  sync(state){if(!this.initialized)return;const own=state?.participants?.find(p=>p.id===this.context?.sessionId);if(!own?.audioReady || own.mediaId!==this.context.mediaId)this.pause();}
  receive(){}
  setMuted(muted){this.muted=muted;this.stream?.getAudioTracks().forEach(t=>{t.enabled=!muted;});this.update({muted});}
  async setScreen(stream){const previous=this.screenStream;this.screenStream=null;this.update({localScreenStream:null});try{if(this.screenProducer){const old=this.screenProducer;this.screenProducer=null;old.close();await this.request('close-producer',{producerId:old.id});}}finally{previous?.getTracks().forEach(t=>{t.onended=null;t.stop();});}if(stream){const epoch=this.epoch;const producer=await this.send.produce({track:stream.getVideoTracks()[0],appData:{source:'screen'},stopTracks:false});if(this.epoch!==epoch){producer.close();throw new Error('Media session changed');}this.screenProducer=producer;this.screenStream=stream;}this.update({localScreenStream:this.screenStream});}
  async updateConfiguration(config){if(!this.socket?.connected)throw new Error('Media connection is unavailable');const socket=this.socket;await new Promise((resolve,reject)=>socket.timeout(8000).emit('media:renew',config.media.token,(error,result)=>error || !result?.ok?reject(new Error('Media authorization could not be renewed')):resolve()));const changed=JSON.stringify(this.rtcConfiguration?.iceServers)!==JSON.stringify(config.rtcConfiguration.iceServers);if(changed && (!this.iceExpiresAt || this.iceExpiresAt-Date.now()/1000<300)){await Promise.all([this.send,this.recv].filter(Boolean).map(transport=>transport.updateIceServers({iceServers:config.rtcConfiguration.iceServers})));this.rtcConfiguration=config.rtcConfiguration;this.iceExpiresAt=config.expiresAt;}}
  pause(){this.epoch++;this.initialized=false;const socket=this.socket;this.socket=null;socket?.removeAllListeners();socket?.disconnect();this.send?.close();this.recv?.close();this.send=this.recv=null;this.audioProducer=this.screenProducer=null;for(const consumer of this.consumers.values())consumer.close();this.consumers.clear();this.screenStream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.screenStream=null;this.stream?.getAudioTracks().forEach(t=>{t.enabled=false;});this.update({remoteStream:null,remoteScreenStream:null,localScreenStream:null,connection:'reconnecting'});}
  restoreTracks(){this.stream?.getAudioTracks().forEach(t=>{t.enabled=!this.muted;});}
  stop(){this.pause();this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;this.context=null;this.update({connection:'idle',muted:false,notice:null});}
}
