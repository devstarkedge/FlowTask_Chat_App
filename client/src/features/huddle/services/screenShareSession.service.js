// Owns capture generations, never peer connections. The existing transport owns
// publication; all Stop paths converge here, including a late permission result.
export class ScreenShareSession {
  constructor({capture,publish,signal,context,update,present=()=>{},resetAnnotations=()=>{},log=()=>{},id=()=>crypto.randomUUID()}) {
    Object.assign(this,{capture,publish,signal,context,update,present,resetAnnotations,log,id});
    this.generation=0;this.current=null;this.pending=false;this.publication=Promise.resolve();this.publishing=false;
  }
  release(stream){for(const track of stream?.getTracks() || []){track.onended=null;if(track.readyState!=='ended')track.stop();}}
  publishSerial(stream){const operation=this.publication.catch(()=>{}).then(()=>this.publish(stream));this.publication=operation;return operation;}
  view(){const s=this.current;return s?{id:s.id,huddleId:s.context.huddleId,participantSessionId:s.context.id,sourceType:s.sourceType,sourceLabel:s.sourceLabel,sourceToken:s.sourceToken,state:s.state,startedAt:s.startedAt,systemAudio:s.systemAudio,audioAvailable:s.audioAvailable}:null;}
  notify(){this.update({localScreenShare:this.view(),screenBusy:this.pending});Promise.resolve(this.present(this.view())).catch(error=>this.update({error:error.message}));}
  async start({switching=false}={}) {
    if(this.pending || (this.current && !switching))return;
    const context=this.context();if(!context)return;
    const previous=this.current,generation=++this.generation;this.pending=true;this.update({screenError:null});this.notify();
    this.log(switching?'SCREEN_SWITCH_REQUESTED':'SCREEN_START_REQUESTED');
    let candidate,announced=false,next;
    const live=()=>generation===this.generation && this.context()?.id===context.id;
    try {
      const captured=await this.capture();candidate=captured.stream;
      if(!live()){this.release(candidate);return;}
      const video=candidate.getVideoTracks()[0];if(!video || video.readyState!=='live')throw new Error('The selected capture source is unavailable.');
      next={...captured.source,id:this.id(),context,stream:candidate,state:'active',startedAt:Date.now(),systemAudio:candidate.getAudioTracks().length>0};
      // Register the exact generation before sending media. Existing screen
      // senders replace their track; no new Huddle or peer is created.
      await this.signal({sharing:true,screenShare:this.public(next),previousShareId:previous?.id});announced=true;
      if(!live()){this.release(candidate);if(this.context()?.id===context.id)await this.signal({sharing:false,shareId:next.id});return;}
      this.publishing=true;
      try{await this.publishSerial(candidate);}finally{this.publishing=false;}
      if(!live()){this.release(candidate);if(this.context()?.id===context.id)await this.signal({sharing:false,shareId:next.id});return;}
      this.release(previous?.stream);this.current=next;
      video.onended=()=>{if(this.current?.id===next.id)void this.stop('track_ended');};
      this.resetAnnotations(previous?.id);this.pending=false;this.notify();
      this.log('SCREEN_ACTIVE',{shareId:next.id,sourceType:next.sourceType});
      if(video.readyState==='ended')await this.stop('track_ended');
    } catch(error) {
      this.release(candidate);
      if(live()) {
        if(announced){await this.signal(previous?{sharing:true,screenShare:this.public(previous)}:{sharing:false}).catch(()=>{});}
        this.log('SCREEN_SHARE_FAILED',{name:error.name,message:error.cause?.message || error.message,code:error.screenCaptureCode});
        this.update({screenError:{code:error.screenCaptureCode || 'SCREEN_SHARE_FAILED',name:error.name,message:error.message}});
      }
    } finally {if(live()){this.pending=false;this.notify();}}
  }
  public(s){return {id:s.id,state:s.state,sourceType:s.sourceType,sourceLabel:s.sourceLabel,startedAt:s.startedAt,systemAudio:s.systemAudio};}
  async pause() {
    if(!this.current || this.pending)return;
    const current=this.current,next=current.state==='paused'?'active':'paused';this.pending=true;this.notify();
    try {
      await this.signal({sharing:true,screenShare:{...this.public(current),state:next},previousShareId:current.id});
      if(this.current!==current)return;
      // Disabling only capture tracks sends a privacy-safe black frame and
      // silences system audio. The microphone and camera are separate streams.
      for(const track of current.stream.getTracks())track.enabled=next==='active';
      current.state=next;
      this.log(next==='paused'?'SCREEN_PAUSED':'SCREEN_RESUMED',{shareId:current.id});
    }catch(error){if(this.current===current)this.update({error:error.message});}
    finally{if(this.current===current){this.pending=false;this.notify();}}
  }
  async stop(reason='user_stop',{transportGone=false}={}) {
    ++this.generation;const current=this.current,needsDetach=Boolean(current || this.publishing);this.current=null;this.pending=false;this.update({screenError:null});
    this.release(current?.stream);this.resetAnnotations(current?.id);this.notify();
    if(needsDetach)this.log('SCREEN_STOP',{shareId:current?.id,reason});
    if(!transportGone && needsDetach)await this.publishSerial(null).catch(error=>this.update({error:error.message}));
    if(!current)return;
    if(this.context()?.id===current.context.id)await this.signal({sharing:false,shareId:current.id,reason}).catch(error=>{if(!['connection_lost','huddle_leave'].includes(reason))this.update({error:error.message});});
  }
}
