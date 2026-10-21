// Audio levels stay on this client. No media or per-frame telemetry is signaled.
export class HuddleSpeakerMonitor {
  constructor({onChange,AudioContext=globalThis.AudioContext || globalThis.webkitAudioContext,now=()=>Date.now()}) {
    this.onChange=onChange;this.AudioContext=AudioContext;this.now=now;this.inputs=new Map();this.last={};
  }
  sync(streams) {
    const entries=Object.entries(streams).filter(([,stream])=>stream?.getAudioTracks?.().length);
    if(!entries.length){this.stop();return;}
    if(!this.AudioContext)return;
    try {
      if(!this.context){this.context=new this.AudioContext();this.context.resume().catch(()=>{});}
      const wanted=new Map(entries);
      for(const [id,input] of this.inputs)if(wanted.get(id)!==input.stream){input.source.disconnect();input.analyser.disconnect();this.inputs.delete(id);}
      for(const [id,stream] of entries)if(!this.inputs.has(id)) {
        const source=this.context.createMediaStreamSource(stream),analyser=this.context.createAnalyser();
        analyser.fftSize=512;source.connect(analyser);
        this.inputs.set(id,{stream,source,analyser,samples:new Float32Array(analyser.fftSize),lastVoice:-Infinity});
      }
      if(!this.timer)this.timer=setInterval(()=>this.sample(),150);
    } catch {this.stop();} // Level decoration must never interrupt audio playback.
  }
  sample() {
    const active={},now=this.now();
    for(const [id,input] of this.inputs) {
      if(!input.stream.getAudioTracks().some(track=>track.enabled!==false && track.readyState!=='ended'))continue;
      input.analyser.getFloatTimeDomainData(input.samples);
      const rms=Math.sqrt(input.samples.reduce((sum,value)=>sum+value*value,0)/input.samples.length);
      if(rms>0.025)input.lastVoice=now;
      if(now-input.lastVoice<450)active[id]=true;
    }
    if(Object.keys(active).length!==Object.keys(this.last).length || Object.keys(active).some(id=>!this.last[id])){this.last=active;this.onChange(active);}
  }
  stop() {
    clearInterval(this.timer);this.timer=null;
    for(const input of this.inputs.values()){input.source.disconnect();input.analyser.disconnect();}
    this.inputs.clear();this.context?.close().catch(()=>{});this.context=null;
    if(Object.keys(this.last).length){this.last={};this.onChange({});}
  }
}
