// Owns one audio connection. React renders the output; it never captures media.
export class HuddleAudioController {
  constructor({send,onUpdate,onLocalEnded=()=>{},onScreenStopped=()=>{},PeerConnection=globalThis.RTCPeerConnection,makeStream=tracks=>new MediaStream(tracks)}) {
    this.send=send; this.update=onUpdate; this.onLocalEnded=onLocalEnded;
    this.onScreenStopped=onScreenStopped;
    this.PeerConnection=PeerConnection; this.makeStream=makeStream;
    this.peer=null; this.context=null; this.stream=null; this.pending=[]; this.initialized=false; this.muted=false;
  }

  begin({stream,channelId,sessionId}) {
    this.stop();
    this.stream=stream; this.context={channelId,sessionId}; this.muted=false;
    for(const track of stream.getAudioTracks())track.onended=()=>{this.stop();this.onLocalEnded(channelId);};
    this.update({connection:'preparing',muted:false,error:null,remoteStream:null,notice:null});
  }

  configure({state,rtcConfiguration,notice,expiresAt}) {
    if(!this.context || !this.stream)return;
    const own=state.participants.find(p=>p.id===this.context.sessionId);
    if(!own?.audioReady || !own.mediaId)throw new Error('Audio session was not registered. Join again.');
    this.context={...this.context,huddleId:String(state.huddle._id),mediaId:own.mediaId};
    this.config=rtcConfiguration; this.expiresAt=expiresAt; this.initialized=true;
    this.update({notice,error:null});this.sync(state);
    const waiting=this.pending.splice(0);
    waiting.forEach(message=>this.receive(message));
  }

  sync(state) {
    if(!this.context || !this.initialized)return;
    const own=state?.participants.find(p=>p.id===this.context.sessionId);
    if(!state?.huddle || !own?.audioReady || own.connection!=='connected') {
      this.closePeer();this.update({connection:'reconnecting'});return;
    }
    const remote=state.participants.find(p=>p.id!==own.id && p.audioReady && p.connection==='connected');
    if(!remote){this.closePeer();this.update({connection:'waiting'});return;}
    if(this.peer?.id===remote.id && this.peer.mediaId===remote.mediaId)return;
    this.closePeer();
    const pc=new this.PeerConnection(this.config);
    const peer={id:remote.id,mediaId:remote.mediaId,pc,polite:own.id>remote.id,makingOffer:false,ignoreOffer:false,settingAnswer:false,candidates:[],inbound:Promise.resolve(),outbound:Promise.resolve(),restarts:0};
    this.peer=peer;this.update({connection:'connecting',error:null});
    pc.ontrack=event=>{
      if(this.peer!==peer)return;
      const stream=this.makeStream([event.track]);
      this.update(event.track.kind==='video'?{remoteScreenStream:stream}:{remoteStream:stream});
      if(event.track.kind==='video')event.track.onended=()=>{if(this.peer===peer)this.update({remoteScreenStream:null});};
    };
    pc.onicecandidate=event=>{
      if(event.candidate)this.transmit(peer,{candidate:event.candidate.toJSON?.() || event.candidate});
    };
    pc.onnegotiationneeded=async()=>{
      if(this.peer!==peer)return;
      // One deterministic offerer keeps initial setup and ICE restarts free of
      // duplicate offers. The answerer requests a restart over signaling.
      if(peer.polite)return;
      try {
        peer.makingOffer=true;
        await pc.setLocalDescription();
        if(this.peer===peer)this.transmit(peer,{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
      } catch(error){this.fail(peer,error);}
      finally {peer.makingOffer=false;}
    };
    pc.onconnectionstatechange=()=>{
      if(this.peer!==peer)return;
      const connection=pc.connectionState;
      this.update({connection:connection==='disconnected'?'reconnecting':connection});
      if(connection==='connected'){peer.restarts=0;this.update({error:null});}
      if(connection==='failed') {
        // One ICE restart per failure episode; explicit Retry remains available.
        if(peer.restarts++===0){if(peer.polite)this.transmit(peer,{restart:true});else pc.restartIce();this.update({connection:'reconnecting'});}
        else this.fail(peer,new Error('Audio connection failed. Retry audio or check your TURN server.'));
      }
    };
    for(const track of this.stream.getAudioTracks())pc.addTrack(track,this.stream);
    // Keep audio negotiation/receipt when joining without a capture device.
    if(!this.stream.getAudioTracks().length)pc.addTransceiver('audio',{direction:'recvonly'});
    // Reserve one bidirectional screen slot so either participant can share
    // without racing offers or renegotiating the microphone connection.
    peer.screenSender=pc.addTransceiver?.('video',{direction:'sendrecv'}).sender;
    if(this.screenStream)peer.screenSender?.replaceTrack(this.screenStream.getVideoTracks()[0]).catch(error=>this.fail(peer,error));
  }

  transmit(peer,signal) {
    const context=this.context;
    peer.outbound=peer.outbound.then(async()=>{
      if(this.peer!==peer || !this.initialized || !context)return;
      await this.send('signal',{channelId:context.channelId,huddleId:context.huddleId,targetSessionId:peer.id,
        fromMediaId:context.mediaId,toMediaId:peer.mediaId,signal});
    }).catch(error=>this.fail(peer,error));
  }

  receive(message) {
    const context=this.context;
    if(!context || message.channelId!==context.channelId || message.toSessionId!==context.sessionId)return;
    if(!this.initialized) {
      if(this.pending.length<64)this.pending.push(message);
      return;
    }
    const peer=this.peer;
    if(!peer || message.huddleId!==context.huddleId || message.toMediaId!==context.mediaId || message.fromSessionId!==peer.id || message.fromMediaId!==peer.mediaId)return;
    peer.inbound=peer.inbound.then(async()=>{
      if(this.peer!==peer)return;
      const {description,candidate,restart}=message.signal;
      const pc=peer.pc;
      if(restart) {
        if(!peer.polite)pc.restartIce();
      } else if(description) {
        const readyForOffer=!peer.makingOffer && (pc.signalingState==='stable' || peer.settingAnswer);
        const collision=description.type==='offer' && !readyForOffer;
        peer.ignoreOffer=!peer.polite && collision;
        if(peer.ignoreOffer)return;
        peer.settingAnswer=description.type==='answer';
        try {await pc.setRemoteDescription(description);}
        finally {peer.settingAnswer=false;}
        if(this.peer!==peer)return;
        const candidates=peer.candidates.splice(0);
        for(const queued of candidates)await this.addCandidate(peer,queued);
        if(description.type==='offer') {
          await pc.setLocalDescription();
          if(this.peer===peer)this.transmit(peer,{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
        }
      } else if(candidate) {
        // A polite peer's answer can reuse the ignored offer's ICE generation.
        // Hold those candidates, then filter them against the accepted SDP.
        if(!pc.remoteDescription || peer.ignoreOffer) {
          if(peer.candidates.length>=64)throw new Error('Too many pending ICE candidates');
          peer.candidates.push(candidate);
        } else await this.addCandidate(peer,candidate);
      }
    }).catch(error=>this.fail(peer,error));
  }

  async addCandidate(peer,candidate) {
    if(this.peer!==peer)return;
    // Candidates from a previous ICE generation must not poison a restart.
    if(candidate.usernameFragment && !peer.pc.remoteDescription.sdp.includes(`a=ice-ufrag:${candidate.usernameFragment}`))return;
    await peer.pc.addIceCandidate(candidate);
  }

  setMuted(muted) {
    this.muted=muted;
    this.stream?.getAudioTracks().forEach(track=>{track.enabled=!muted;});
    this.update({muted});
  }

  async setScreen(stream) {
    const old=this.screenStream;
    await this.peer?.screenSender?.replaceTrack(stream?.getVideoTracks()[0] || null);
    this.screenStream=stream || null;
    old?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    this.update({localScreenStream:this.screenStream});
  }

  pause() {
    this.screenStream?.getTracks().forEach(track=>{track.onended=null;track.stop();});this.screenStream=null;
    this.update({localScreenStream:null,remoteScreenStream:null});
    this.initialized=false;this.pending=[];this.closePeer();
    this.stream?.getAudioTracks().forEach(track=>{track.enabled=false;});
    if(this.context)this.update({connection:'reconnecting'});
  }

  restoreTracks() {this.stream?.getAudioTracks().forEach(track=>{track.enabled=!this.muted;});}

  updateConfiguration({rtcConfiguration,expiresAt,notice}) {
    this.config=rtcConfiguration;this.expiresAt=expiresAt;
    this.peer?.pc.setConfiguration(rtcConfiguration);this.update({notice});
  }

  fail(peer,error) {
    if(this.peer!==peer)return;
    if(this.screenStream){this.screenStream.getTracks().forEach(track=>{track.onended=null;track.stop();});this.screenStream=null;this.update({localScreenStream:null});this.onScreenStopped(this.context?.channelId);}
    this.stream?.getAudioTracks().forEach(track=>{track.enabled=false;});
    this.closePeer();this.update({connection:'failed',error:error.message || 'Audio connection failed'});
  }

  closePeer() {
    const peer=this.peer;this.peer=null;
    if(peer) {
      const pc=peer.pc;
      pc.ontrack=pc.onicecandidate=pc.onnegotiationneeded=pc.onconnectionstatechange=null;
      pc.close();
    }
    this.update({remoteStream:null,remoteScreenStream:null});
  }

  stop() {
    this.screenStream?.getTracks().forEach(track=>{track.onended=null;track.stop();});this.screenStream=null;
    this.initialized=false;this.pending=[];this.closePeer();
    this.stream?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    this.stream=null;this.context=null;
    this.update({connection:'idle',remoteStream:null,localScreenStream:null,remoteScreenStream:null,muted:false,notice:null});
  }
}
