import {releaseStream} from './releaseStream';
// Capture ownership is independent of React and of the selected media transport.
export class HuddleMediaManager {
  constructor(capture=constraints=>navigator.mediaDevices.getUserMedia(constraints)) {
    this.capture=capture;
    this.epoch=0;
    this.stream=null;
    this.pending=null;
  }

  getLocalAudioStream({deviceId='',onFallback=()=>{}}={}) {
    if(this.stream?.getAudioTracks().some(track=>track.readyState!=='ended'))return Promise.resolve(this.stream);
    if(this.pending)return this.pending;
    const epoch=this.epoch;
    const audio={echoCancellation:true,noiseSuppression:true,autoGainControl:true};
    const pending=(async()=>{
      let stream;
      try {
        stream=await this.capture({audio:{...audio,...(deviceId?{deviceId:{exact:deviceId}}:{})},video:false});
      } catch(error) {
        if(epoch!==this.epoch || !deviceId || !['NotFoundError','OverconstrainedError'].includes(error.name))throw error;
        stream=await this.capture({audio,video:false});
        if(epoch===this.epoch)onFallback();
      }
      if(epoch!==this.epoch) {
        releaseStream(stream);
        throw Object.assign(new Error('Huddle capture cancelled'),{code:'HUDDLE_CANCELLED'});
      }
      this.stream=stream;
      return stream;
    })();
    this.pending=pending;
    pending.finally(()=>{if(this.pending===pending)this.pending=null;}).catch(()=>{});
    return pending;
  }

  stopLocalStream({stopTracks=true}={}) {
    this.epoch++;
    this.pending=null;
    if(stopTracks)releaseStream(this.stream);
    this.stream=null;
  }
}
