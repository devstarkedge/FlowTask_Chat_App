import {huddleLogger} from '../features/huddle/utils/huddle.logger';
import {HuddleAudioMixer} from '../features/huddle/services/audioMixer.service';
import {configureScreenSender} from '../features/huddle/services/screenQuality.service';
// Native small-group transport. Session IDs own independent peer connections; React never captures media.
export class HuddleAudioController {
  constructor({send,onUpdate,onLocalEnded=()=>{},onScreenStopped=()=>{},PeerConnection=globalThis.RTCPeerConnection,makeStream=tracks=>new MediaStream(tracks),AudioMixer=HuddleAudioMixer}) {
    this.audioMixer=new AudioMixer();
    this.send=send; this.update=onUpdate; this.onLocalEnded=onLocalEnded;
    this.onScreenStopped=onScreenStopped;
    this.PeerConnection=PeerConnection; this.makeStream=makeStream;
    this.peers=new Map(); this.remoteAudio=new Map(); this.remoteCameras=new Map(); this.remoteScreens=new Map(); this.remoteScreenPresenter=null; this.context=null; this.stream=null; this.pending=[]; this.initialized=false; this.muted=false;
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
    this.remoteScreenPresenter=remotes.find(remote=>remote.screenSharing)?.id || null;
    const desired=new Map(remotes.map(remote=>[remote.id,remote]));
    for(const peer of this.peers.values()) {
      if(desired.get(peer.id)?.mediaId!==peer.mediaId)this.closePeer(peer);
    }
    for(const remote of remotes)if(!this.peers.has(remote.id))this.createPeer(own,remote);
    this.publishConnection();this.publishRemote(this.remoteScreens);
    // Lifecycle snapshots and signaling can arrive on different socket paths.
    // Replay bounded early signals only after authoritative presence creates a peer.
    const waiting=this.pending.splice(0);
    for(const message of waiting)this.receive(message);
  }

  isCurrent(peer) {return !peer.failed && this.peers.get(peer.id)===peer;}

  createPeer(own,remote) {
    const pc=new this.PeerConnection(this.config);
    const peer={id:remote.id,mediaId:remote.mediaId,pc,remoteSources:new Map(),polite:own.id>remote.id,makingOffer:false,ignoreOffer:false,settingAnswer:false,candidates:[],inbound:Promise.resolve(),outbound:Promise.resolve(),restarts:0};
    huddleLogger.debug('PEER_CREATED',{participantId:peer.id});
    this.peers.set(peer.id,peer);this.update({connection:'connecting',error:null});
    pc.ontrack=event=>{
      if(!this.isCurrent(peer))return;
      const stream=this.makeStream([event.track]);
      const source=peer.remoteSources.get(event.transceiver?.mid);
      if(event.track.kind==='video' && peer.remoteSources.size && !['camera','screen'].includes(source))return;
      // Old clients use the established reserved SDP slots. New descriptions
      // identify sources by MID, independently of video arrival/slot order.
      const cameraSlot=peer.cameraTransceiver || this.negotiatedVideoSlots(peer)[0];
      const camera=event.track.kind==='video' && (peer.remoteSources.size?source==='camera':event.transceiver===cameraSlot);
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
      if(connection==='connected'){peer.restarts=0;this.update({error:null});configureScreenSender(peer.screenSender).catch(error=>huddleLogger.debug('SCREEN_QUALITY_UNAVAILABLE',{message:error.message}));}
      if(connection==='failed') {
        // One ICE restart per failure episode; explicit Retry remains available.
        if(peer.restarts++===0){if(peer.polite)this.transmit(peer,{restart:true});else pc.restartIce();this.publishConnection();}
        else this.fail(peer,new Error('Audio connection failed. Retry audio or check your TURN server.'));
      }
    };
    // Only the deterministic offerer reserves slots. An answerer's locally
    // added transceivers are not associated with the incoming offer by JSEP.
    if(!peer.polite) {
      const audioTrack=this.audioMixer.track || this.stream.getAudioTracks()[0];
      if(audioTrack)peer.audioSender=pc.addTrack(audioTrack,this.stream);
      else peer.audioSender=pc.addTransceiver('audio',{direction:'sendrecv'}).sender;
      peer.cameraTransceiver=pc.addTransceiver('video',{direction:'sendrecv'});
      if(this.cameraStream)peer.cameraTransceiver.sender.replaceTrack(this.cameraStream.getVideoTracks()[0]).catch(error=>this.fail(peer,error));
      peer.screenSender=pc.addTransceiver('video',{direction:'sendrecv'}).sender;
      if(this.screenStream)peer.screenSender.replaceTrack(this.screenStream.getVideoTracks()[0]).then(()=>configureScreenSender(peer.screenSender)).catch(error=>this.fail(peer,error));
    }
  }

  negotiatedVideoSlots(peer) {
    return (peer.pc.getTransceivers?.() || []).filter(item=>item.mid!=null && item.receiver.track.kind==='video');
  }

  async bindAnswerTracks(peer) {
    // Remote-created transceivers already own the offered mids, including the
    // two distinct camera/screen slots. Configure them before creating an answer.
    const slots=(peer.pc.getTransceivers?.() || []).filter(item=>item.mid!=null);
    const named=source=>slots.find(slot=>peer.remoteSources.get(slot.mid)===source);
    const audio=peer.remoteSources.size?named('microphone'):slots.find(item=>item.receiver.track.kind==='audio');
    const [camera,screen]=peer.remoteSources.size?[named('camera'),named('screen')]:this.negotiatedVideoSlots(peer);
    peer.audioSender=audio?.sender;peer.cameraTransceiver=camera;peer.screenSender=screen?.sender;
    const replacements=[[audio,this.audioMixer.track || this.stream?.getAudioTracks()[0]],[camera,this.cameraStream?.getVideoTracks()[0]],[screen,this.screenStream?.getVideoTracks()[0]]];
    await Promise.all(replacements.filter(([slot])=>slot).map(([slot,track])=>{slot.direction='sendrecv';return slot.sender.replaceTrack(track || null);}));
    configureScreenSender(peer.screenSender).catch(error=>huddleLogger.debug('SCREEN_QUALITY_UNAVAILABLE',{message:error.message}));
  }

  transmit(peer,signal) {
    const context=this.context;
    if(signal.description){
      const mediaSources=(peer.pc.getTransceivers?.() || []).filter(slot=>slot.mid!=null).map(slot=>({mid:slot.mid,source:slot.sender===peer.audioSender?'microphone':slot===peer.cameraTransceiver?'camera':slot.sender===peer.screenSender?'screen':null})).filter(slot=>slot.source);
      if(mediaSources.length)signal={...signal,mediaSources};
    }
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
      const {description,candidate,restart,mediaSources}=message.signal;
      const pc=peer.pc;
      if(restart) {
        if(!peer.polite)pc.restartIce();
      } else if(description) {
        const readyForOffer=!peer.makingOffer && (pc.signalingState==='stable' || peer.settingAnswer);
        const collision=description.type==='offer' && !readyForOffer;
        peer.ignoreOffer=!peer.polite && collision;
        if(peer.ignoreOffer)return;
        peer.remoteSources=new Map((mediaSources || []).map(({mid,source})=>[mid,source]));
        peer.settingAnswer=description.type==='answer';
        try {await pc.setRemoteDescription(description);}
        finally {peer.settingAnswer=false;}
        if(!this.isCurrent(peer))return;
        const candidates=peer.candidates.splice(0);
        for(const queued of candidates)await this.addCandidate(peer,queued);
        if(description.type==='offer') {
          if(peer.polite)await this.bindAnswerTracks(peer);
          if(!this.isCurrent(peer))return;
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
    track.enabled=!this.muted;
    const outgoing=await this.audioMixer.setSources(stream,this.screenStream);
    if(this.context!==context || !context)throw new Error('Media session changed');
    await Promise.all([...this.peers.values()].filter(peer=>!peer.failed).map(peer=>peer.audioSender?.replaceTrack(outgoing)));
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
    try {
      const outgoing=await this.audioMixer.setSources(this.stream,stream);
      if(this.context!==context || !context)throw new Error('Media session changed');
      await Promise.all([...this.peers.values()].filter(peer=>!peer.failed).flatMap(peer=>[
        peer.screenSender?.replaceTrack(stream?.getVideoTracks()[0] || null),peer.audioSender?.replaceTrack(outgoing)]));
      if(stream)await Promise.all([...this.peers.values()].filter(peer=>!peer.failed).map(peer=>configureScreenSender(peer.screenSender).catch(error=>huddleLogger.debug('SCREEN_QUALITY_UNAVAILABLE',{message:error.message}))));
    } catch(error) {
      if(this.context===context){const restored=await this.audioMixer.setSources(this.stream,old).catch(()=>this.stream?.getAudioTracks()[0] || null);await Promise.allSettled([...this.peers.values()].flatMap(peer=>[peer.audioSender?.replaceTrack(restored),peer.screenSender?.replaceTrack(old?.getVideoTracks()[0] || null)]));}
      throw error;
    }
    if(this.context!==context || !context)throw new Error('Media session changed');
    this.screenStream=stream || null;
    old?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    this.update({localScreenStream:this.screenStream});
  }

  pause() {
    this.audioMixer.stop();
    this.cameraStream?.getTracks().forEach(track=>{track.enabled=false;});
    this.screenStream?.getTracks().forEach(track=>{track.onended=null;track.stop();});this.screenStream=null;
    this.update({localScreenStream:null,remoteScreenStream:null,remoteScreenStreams:{}});
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
    else this.update({remoteScreenStream:collection.get(this.remoteScreenPresenter) || null,remoteScreenStreams:Object.fromEntries(collection)});
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
    this.audioMixer.stop();
    this.cameraStream?.getTracks().forEach(track=>{track.onended=null;track.stop();});this.cameraStream=null;
    this.update({localCameraStream:null,remoteCameraStreams:{}});
    this.screenStream?.getTracks().forEach(track=>{track.onended=null;track.stop();});this.screenStream=null;
    this.remoteScreenPresenter=null;
    this.initialized=false;this.pending=[];this.closePeer();
    this.stream?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    this.stream=null;this.context=null;
    this.update({connection:'idle',failedPeerIds:[],localMicrophoneStream:null,remoteStream:null,localScreenStream:null,remoteScreenStream:null,muted:false,notice:null});
  }
}
