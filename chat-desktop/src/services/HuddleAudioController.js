import {huddleLogger} from '../features/huddle/utils/huddle.logger';
// Native small-group transport. Session IDs own independent peer connections; React never captures media.
export class HuddleAudioController {
  constructor({send,onUpdate,onLocalEnded=()=>{},onScreenStopped=()=>{},PeerConnection=globalThis.RTCPeerConnection,makeStream=tracks=>new MediaStream(tracks)}) {
    this.send=send; this.update=onUpdate; this.onLocalEnded=onLocalEnded;
    this.onScreenStopped=onScreenStopped;
    this.PeerConnection=PeerConnection; this.makeStream=makeStream;
    this.peers=new Map(); this.remoteAudio=new Map(); this.remoteCameras=new Map(); this.remoteScreens=new Map(); this.context=null; this.stream=null; this.pending=[]; this.initialized=false; this.muted=false;
  }

  begin({stream,channelId,sessionId}) {
    this.stop();
    this.stream=stream; this.context={channelId,sessionId}; this.muted=false;
    for(const track of stream.getAudioTracks())track.onended=()=>{this.setMuted(true);this.onLocalEnded(channelId);};
    this.update({connection:'preparing',localMicrophoneStream:stream,muted:false,error:null,remoteStream:null,notice:null});
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
    const remotes=state.participants.filter(p=>p.id!==own.id && p.audioReady && p.connection==='connected');
    const desired=new Map(remotes.map(remote=>[remote.id,remote]));
    for(const peer of this.peers.values()) {
      if(desired.get(peer.id)?.mediaId!==peer.mediaId)this.closePeer(peer);
    }
    for(const remote of remotes)if(!this.peers.has(remote.id))this.createPeer(own,remote);
    this.publishConnection();
    // Lifecycle snapshots and signaling can arrive on different socket paths.
    // Replay bounded early signals only after authoritative presence creates a peer.
    const waiting=this.pending.splice(0);
    for(const message of waiting)this.receive(message);
  }

  isCurrent(peer) {return !peer.failed && this.peers.get(peer.id)===peer;}

  createPeer(own,remote) {
    const pc=new this.PeerConnection(this.config);
    const peer={id:remote.id,mediaId:remote.mediaId,pc,polite:own.id>remote.id,makingOffer:false,ignoreOffer:false,settingAnswer:false,candidates:[],inbound:Promise.resolve(),outbound:Promise.resolve(),restarts:0};
    huddleLogger.debug('PEER_CREATED',{participantId:peer.id});
    this.peers.set(peer.id,peer);this.update({connection:'connecting',error:null});
    pc.ontrack=event=>{
      if(!this.isCurrent(peer))return;
      const stream=this.makeStream([event.track]);
      const camera=event.track.kind==='video' && event.transceiver===peer.cameraTransceiver;
      const collection=event.track.kind==='audio'?this.remoteAudio:camera?this.remoteCameras:this.remoteScreens;
      collection.set(peer.id,stream);
      this.publishRemote(collection);
      event.track.onended=()=>{
        if(!this.isCurrent(peer) || collection.get(peer.id)!==stream)return;
        collection.delete(peer.id);this.publishRemote(collection);
      };
    };
    pc.onicecandidate=event=>{
      if(event.candidate)this.transmit(peer,{candidate:event.candidate.toJSON?.() || event.candidate});
    };
    pc.onnegotiationneeded=async()=>{
      if(!this.isCurrent(peer))return;
      // One deterministic offerer keeps initial setup and ICE restarts free of
      // duplicate offers. The answerer requests a restart over signaling.
      if(peer.polite)return;
      try {
        peer.makingOffer=true;
        await pc.setLocalDescription();
        if(this.isCurrent(peer))this.transmit(peer,{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
      } catch(error){this.fail(peer,error);}
      finally {peer.makingOffer=false;}
    };
    pc.onconnectionstatechange=()=>{
      if(!this.isCurrent(peer))return;
      const connection=pc.connectionState;
      huddleLogger.debug('ICE',{participantId:peer.id,state:connection});
      this.publishConnection();
      if(connection==='connected'){peer.restarts=0;this.update({error:null});}
      if(connection==='failed') {
        // One ICE restart per failure episode; explicit Retry remains available.
        if(peer.restarts++===0){if(peer.polite)this.transmit(peer,{restart:true});else pc.restartIce();this.publishConnection();}
        else this.fail(peer,new Error('Audio connection failed. Retry audio or check your TURN server.'));
      }
    };
    for(const track of this.stream.getAudioTracks())peer.audioSender=pc.addTrack(track,this.stream);
    // Keep audio negotiation/receipt when joining without a capture device.
    if(!this.stream.getAudioTracks().length)peer.audioSender=pc.addTransceiver('audio',{direction:'sendrecv'}).sender;
    peer.cameraTransceiver=pc.addTransceiver?.('video',{direction:'sendrecv'});
    if(this.cameraStream)peer.cameraTransceiver?.sender.replaceTrack(this.cameraStream.getVideoTracks()[0]).catch(error=>this.fail(peer,error));
    // Reserve one bidirectional screen slot so either participant can share
    // without racing offers or renegotiating the microphone connection.
    peer.screenSender=pc.addTransceiver?.('video',{direction:'sendrecv'}).sender;
    if(this.screenStream)peer.screenSender?.replaceTrack(this.screenStream.getVideoTracks()[0]).catch(error=>this.fail(peer,error));
  }

  transmit(peer,signal) {
    const context=this.context;
    peer.outbound=peer.outbound.then(async()=>{
      if(!this.isCurrent(peer) || !this.initialized || !context)return;
      huddleLogger.debug(signal.description?.type?.toUpperCase() || 'ICE_SENT',{participantId:peer.id});
      await this.send('signal',{channelId:context.channelId,huddleId:context.huddleId,targetSessionId:peer.id,
        fromMediaId:context.mediaId,toMediaId:peer.mediaId,signal});
    }).catch(error=>this.fail(peer,error));
  }

  receive(message) {
    const context=this.context;
    if(!context || message.channelId!==context.channelId || message.toSessionId!==context.sessionId)return;
    if(!this.initialized) {
      if(this.pending.length<64)this.pending.push(message);else this.update({error:'Too many early media signals. Retry audio.'});
      return;
    }
    if(message.huddleId!==context.huddleId || message.toMediaId!==context.mediaId)return;
    const peer=this.peers.get(message.fromSessionId);
    if(!peer){if(this.pending.length<64)this.pending.push(message);else this.update({error:'Too many early media signals. Retry audio.'});return;}
    if(message.huddleId!==context.huddleId || message.toMediaId!==context.mediaId || message.fromSessionId!==peer.id || message.fromMediaId!==peer.mediaId)return;
    peer.inbound=peer.inbound.then(async()=>{
      if(!this.isCurrent(peer))return;
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
        if(!this.isCurrent(peer))return;
        const candidates=peer.candidates.splice(0);
        for(const queued of candidates)await this.addCandidate(peer,queued);
        if(description.type==='offer') {
          await pc.setLocalDescription();
          if(this.isCurrent(peer))this.transmit(peer,{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
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
    if(!this.isCurrent(peer))return;
    // Candidates from a previous ICE generation must not poison a restart.
    if(candidate.usernameFragment && !peer.pc.remoteDescription.sdp.includes(`a=ice-ufrag:${candidate.usernameFragment}`))return;
    await peer.pc.addIceCandidate(candidate);
  }

  setMuted(muted) {
    this.muted=muted;
    this.stream?.getAudioTracks().forEach(track=>{track.enabled=!muted;});
    this.update({muted});
  }

  async setMicrophone(stream) {
    const context=this.context;
    const track=stream.getAudioTracks()[0];
    await Promise.all([...this.peers.values()].filter(peer=>!peer.failed).map(peer=>peer.audioSender.replaceTrack(track)));
    if(this.context!==context || !context)throw new Error('Media session changed');
    track.enabled=!this.muted;
    const old=this.stream;this.stream=stream;this.update({localMicrophoneStream:stream});
    const channelId=this.context?.channelId;track.onended=()=>{this.setMuted(true);this.onLocalEnded(channelId);};
    old?.getTracks().forEach(t=>{t.onended=null;t.stop();});
  }

  async setCamera(stream) {
    const context=this.context;
    const old=this.cameraStream;
    await Promise.all([...this.peers.values()].filter(peer=>!peer.failed).map(peer=>peer.cameraTransceiver?.sender.replaceTrack(stream?.getVideoTracks()[0] || null)));
    if(this.context!==context || !context)throw new Error('Media session changed');
    this.cameraStream=stream || null;
    old?.getTracks().forEach(t=>{t.onended=null;t.stop();});
    this.update({localCameraStream:this.cameraStream});
  }

  async setScreen(stream) {
    const old=this.screenStream;
    const context=this.context;
    await Promise.all([...this.peers.values()].filter(peer=>!peer.failed).map(peer=>peer.screenSender?.replaceTrack(stream?.getVideoTracks()[0] || null)));
    if(this.context!==context || !context)throw new Error('Media session changed');
    this.screenStream=stream || null;
    old?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    this.update({localScreenStream:this.screenStream});
  }

  pause() {
    this.cameraStream?.getTracks().forEach(track=>{track.enabled=false;});
    this.screenStream?.getTracks().forEach(track=>{track.onended=null;track.stop();});this.screenStream=null;
    this.update({localScreenStream:null,remoteScreenStream:null});
    this.initialized=false;this.pending=[];this.closePeer();
    this.stream?.getAudioTracks().forEach(track=>{track.enabled=false;});
    if(this.context)this.update({connection:'reconnecting'});
  }

  restoreTracks() {this.stream?.getAudioTracks().forEach(track=>{track.enabled=!this.muted;});this.cameraStream?.getTracks().forEach(track=>{track.enabled=true;});}

  updateConfiguration({rtcConfiguration,expiresAt,notice}) {
    this.config=rtcConfiguration;this.expiresAt=expiresAt;
    for(const peer of this.peers.values())if(!peer.failed)peer.pc.setConfiguration(rtcConfiguration);
    this.update({notice});
  }

  publishConnection() {
    const peers=[...this.peers.values()];
    const states=peers.map(peer=>peer.failed?'failed':peer.pc.connectionState);
    const connection=!peers.length?'waiting':states.some(state=>state==='connected')?'connected'
      :states.every(state=>state==='failed')?'failed'
      :states.some(state=>['disconnected','failed'].includes(state))?'reconnecting':'connecting';
    this.update({connection,failedPeerIds:peers.filter(peer=>peer.failed).map(peer=>peer.id)});
  }

  publishRemote(collection) {
    if(collection===this.remoteAudio) {
      // Keep the same output stream as peers join/leave so audio playback and
      // the selected speaker are not restarted for every participant event.
      const tracks=[...collection.values()].flatMap(stream=>stream.getAudioTracks());
      if(!this.remoteStream && tracks.length)this.remoteStream=this.makeStream(tracks);
      else if(this.remoteStream) {
        for(const track of this.remoteStream.getTracks())if(!tracks.includes(track))this.remoteStream.removeTrack(track);
        for(const track of tracks)if(!this.remoteStream.getTracks().includes(track))this.remoteStream.addTrack(track);
      }
      this.update({remoteStream:tracks.length?this.remoteStream:null,remoteAudioStreams:Object.fromEntries(collection)});
    } else if(collection===this.remoteCameras)this.update({remoteCameraStreams:Object.fromEntries(collection)});
    else this.update({remoteScreenStream:collection.values().next().value || null});
  }

  fail(peer,error) {
    if(!this.isCurrent(peer))return;
    // A failed remote must not switch off the microphone, camera, or screen
    // sent to other participants. Explicit Retry can rebuild this transport.
    this.closePeer(peer);
    peer.failed=true;this.peers.set(peer.id,peer);
    this.publishConnection();this.update({error:error.message || 'Audio connection failed'});
  }

  closePeer(peer) {
    if(!peer) {
      for(const current of [...this.peers.values()])this.closePeer(current);
      this.remoteStream=null;
      return;
    }
    this.peers.delete(peer.id);
    const pc=peer.pc;
    pc.ontrack=pc.onicecandidate=pc.onnegotiationneeded=pc.onconnectionstatechange=null;
    peer.candidates=[];pc.close();
    for(const collection of [this.remoteAudio,this.remoteCameras,this.remoteScreens]) {
      const stream=collection.get(peer.id);
      stream?.getTracks?.().forEach(track=>{track.onended=null;});
      collection.delete(peer.id);this.publishRemote(collection);
    }
  }

  stop() {
    this.cameraStream?.getTracks().forEach(track=>{track.onended=null;track.stop();});this.cameraStream=null;
    this.update({localCameraStream:null,remoteCameraStreams:{}});
    this.screenStream?.getTracks().forEach(track=>{track.onended=null;track.stop();});this.screenStream=null;
    this.initialized=false;this.pending=[];this.closePeer();
    this.stream?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    this.stream=null;this.context=null;
    this.update({connection:'idle',failedPeerIds:[],localMicrophoneStream:null,remoteStream:null,localScreenStream:null,remoteScreenStream:null,muted:false,notice:null});
  }
}
