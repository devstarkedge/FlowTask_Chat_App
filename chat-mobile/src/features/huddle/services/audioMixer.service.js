// Capture tracks stay owned by the media service; only the mixed output is ours.
export class HuddleAudioMixer {
  constructor({AudioContext=globalThis.AudioContext,makeStream=tracks=>new MediaStream(tracks)}={}) {
    this.AudioContext=AudioContext;this.makeStream=makeStream;this.context=null;this.nodes=[];this.track=null;
  }
  async setSources(microphone,screen) {
    const shared=screen?.getAudioTracks?.().filter(track=>track.readyState!=='ended') || [];
    if(!shared.length){this.stop();return microphone?.getAudioTracks?.()[0] || null;}
    if(!this.AudioContext)throw new Error('Sharing sound is unavailable. Turn off Share system audio and try again.');
    if(!this.context) {
      this.context=new this.AudioContext({latencyHint:'interactive'});
      this.destination=this.context.createMediaStreamDestination();
      this.destination.channelCount=1;this.destination.channelCountMode='explicit';
      this.compressor=this.context.createDynamicsCompressor();
      this.compressor.threshold.value=-6;this.compressor.knee.value=6;this.compressor.ratio.value=4;
      this.compressor.connect(this.destination);this.track=this.destination.stream.getAudioTracks()[0];
    }
    const context=this.context;
    this.nodes.forEach(node=>node.disconnect());this.nodes=[];
    for(const tracks of [microphone?.getAudioTracks?.() || [],shared]) {
      if(!tracks.length)continue;
      const source=context.createMediaStreamSource(this.makeStream(tracks));source.connect(this.compressor);this.nodes.push(source);
    }
    await context.resume();
    if(this.context!==context)throw new Error('Audio sharing was cancelled.');
    return this.track;
  }
  stop() {
    const context=this.context;this.context=null;
    this.nodes.forEach(node=>node.disconnect());this.nodes=[];
    this.compressor?.disconnect();this.compressor=null;
    this.track?.stop();this.track=null;this.destination=null;
    context?.close().catch(()=>{});
  }
}
