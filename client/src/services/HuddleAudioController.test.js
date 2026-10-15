import {describe,it,expect,vi,beforeEach} from 'vitest';
import {HuddleAudioController} from './HuddleAudioController';
class Peer {
  constructor(config){this.config=config;this.signalingState='stable';this.connectionState='new';this.localDescription=null;this.remoteDescription=null;this.added=[];this.closed=false;this.restartIce=vi.fn();this.close=vi.fn(()=>{this.closed=true;});this.addIceCandidate=vi.fn(async candidate=>{this.added.push(candidate);});}
  addTrack(){}
  addTransceiver(){return {sender:{replaceTrack:vi.fn(async()=>{})}};}
  async setLocalDescription(){this.localDescription={type:this.remoteDescription?.type==='offer'?'answer':'offer',sdp:'m=audio 9\r\n'};this.signalingState=this.localDescription.type==='offer'?'have-local-offer':'stable';}
  async setRemoteDescription(description){this.remoteDescription=description;this.signalingState=description.type==='answer'?'stable':'have-remote-offer';}
  setConfiguration(config){this.config=config;}
}
const snapshot={huddle:{_id:'huddle'},participants:[{id:'A',audioReady:true,mediaId:'media-A',connection:'connected'},{id:'B',audioReady:true,mediaId:'media-B',connection:'connected'}]};
const message=(signal,overrides={})=>({channelId:'channel',huddleId:'huddle',fromSessionId:'B',toSessionId:'A',fromMediaId:'media-B',toMediaId:'media-A',signal,...overrides});
function setup(id='A'){const send=vi.fn(async()=>{}),update=vi.fn();const track={kind:'audio',enabled:true,stop:vi.fn()};const stream={getAudioTracks:()=>[track],getTracks:()=>[track]};const controller=new HuddleAudioController({send,onUpdate:update,PeerConnection:Peer});controller.begin({stream,channelId:'channel',sessionId:id});controller.configure({state:snapshot,rtcConfiguration:{iceServers:[]}});return {controller,send,update,track};}
describe('Huddle WebRTC audio controller',()=>{
  it('negotiates receive-only audio for a participant without a microphone',()=>{
    const addTransceiver=vi.spyOn(Peer.prototype,'addTransceiver');
    const controller=new HuddleAudioController({send:vi.fn(),onUpdate:vi.fn(),PeerConnection:Peer});
    controller.begin({stream:{getTracks:()=>[],getAudioTracks:()=>[]},channelId:'channel',sessionId:'A'});
    controller.setMuted(true);controller.configure({state:snapshot,rtcConfiguration:{iceServers:[]}});
    expect(addTransceiver).toHaveBeenCalledWith('audio',{direction:'recvonly'});
    expect(controller.peer).toBeTruthy();controller.stop();addTransceiver.mockRestore();
  });
  it('replaces only the screen sender, routes video separately and releases display tracks',async()=>{
    const {controller,track,update}=setup();controller.makeStream=tracks=>({tracks});
    const screenTrack={kind:'video',stop:vi.fn()},screen={getVideoTracks:()=>[screenTrack],getTracks:()=>[screenTrack]};
    await controller.setScreen(screen);expect(controller.peer.screenSender.replaceTrack).toHaveBeenCalledWith(screenTrack);expect(track.stop).not.toHaveBeenCalled();
    const incoming={kind:'video'};controller.peer.pc.ontrack({track:incoming});expect(update).toHaveBeenLastCalledWith({remoteScreenStream:{tracks:[incoming]}});
    await controller.setScreen(null);expect(screenTrack.stop).toHaveBeenCalledOnce();expect(track.stop).not.toHaveBeenCalled();
    await controller.setScreen(screen);controller.pause();expect(screenTrack.stop).toHaveBeenCalledTimes(2);expect(controller.screenStream).toBeNull();
  });
  it('queues ICE until remote SDP and responds with audio answer',async()=>{
    const {controller,send}=setup();const peer=controller.peer;
    controller.receive(message({candidate:{candidate:'ice',sdpMid:'0',sdpMLineIndex:0}}));await peer.inbound;expect(peer.pc.addIceCandidate).not.toHaveBeenCalled();
    controller.receive(message({description:{type:'offer',sdp:'m=audio 9\r\n'}}));await peer.inbound;await peer.outbound;
    expect(peer.pc.addIceCandidate).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledWith('signal',expect.objectContaining({signal:{description:{type:'answer',sdp:'m=audio 9\r\n'}}}));
  });
  it('ignores colliding offers on the impolite peer and rolls over on the polite peer',async()=>{
    const first=setup();first.controller.peer.makingOffer=true;first.controller.receive(message({description:{type:'offer',sdp:'m=audio 9'}}));await first.controller.peer.inbound;expect(first.controller.peer.pc.remoteDescription).toBeNull();
    const second=setup('B');second.controller.peer.makingOffer=true;second.controller.receive(message({description:{type:'offer',sdp:'m=audio 9'}},{fromSessionId:'A',toSessionId:'B',fromMediaId:'media-A',toMediaId:'media-B'}));await second.controller.peer.inbound;expect(second.controller.peer.pc.remoteDescription.type).toBe('offer');
  });
  it('rejects delayed signals from another channel or media generation',async()=>{
    const {controller}=setup();const peer=controller.peer;
    controller.receive(message({description:{type:'offer',sdp:'m=audio 9'}},{fromMediaId:'old'}));controller.receive(message({description:{type:'offer',sdp:'m=audio 9'}},{channelId:'other'}));await peer.inbound;expect(peer.pc.remoteDescription).toBeNull();
  });
  it('mutes locally, pauses safely on disconnect and releases all tracks on leave',()=>{
    const {controller,track}=setup();const peer=controller.peer;controller.setMuted(true);expect(track.enabled).toBe(false);controller.setMuted(false);expect(track.enabled).toBe(true);
    controller.pause();expect(track.enabled).toBe(false);expect(peer.pc.close).toHaveBeenCalledOnce();expect(track.stop).not.toHaveBeenCalled();controller.restoreTracks();expect(track.enabled).toBe(true);
    controller.stop();expect(track.stop).toHaveBeenCalledOnce();expect(controller.context).toBeNull();expect(controller.stream).toBeNull();
  });
  it('closes the old peer when its media session changes',()=>{
    const {controller}=setup();const old=controller.peer;
    controller.sync({...snapshot,participants:snapshot.participants.map(p=>p.id==='B'?{...p,mediaId:'fresh'}:p)});expect(old.pc.close).toHaveBeenCalledOnce();expect(controller.peer.mediaId).toBe('fresh');
  });
  it('uses only one offerer and lets the answerer request an ICE restart',async()=>{
    const a=setup(),b=setup('B');await a.controller.peer.pc.onnegotiationneeded();await b.controller.peer.pc.onnegotiationneeded();await a.controller.peer.outbound;
    expect(a.send).toHaveBeenCalledTimes(1);expect(b.send).not.toHaveBeenCalled();
    b.controller.peer.pc.connectionState='failed';b.controller.peer.pc.onconnectionstatechange();await b.controller.peer.outbound;
    expect(b.send).toHaveBeenCalledWith('signal',expect.objectContaining({signal:{restart:true}}));
    a.controller.receive(message({restart:true}));await a.controller.peer.inbound;expect(a.controller.peer.pc.restartIce).toHaveBeenCalledOnce();
  });
  it('retains candidates during ignored offers until matching accepted SDP arrives',async()=>{
    const {controller}=setup();const peer=controller.peer;peer.makingOffer=true;
    controller.receive(message({description:{type:'offer',sdp:'m=audio 9'}}));await peer.inbound;
    controller.receive(message({candidate:{candidate:'ice',sdpMid:'0',sdpMLineIndex:0,usernameFragment:'accepted'}}));await peer.inbound;expect(peer.candidates).toHaveLength(1);
    controller.receive(message({description:{type:'answer',sdp:'m=audio 9\r\na=ice-ufrag:accepted\r\n'}}));await peer.inbound;expect(peer.pc.addIceCandidate).toHaveBeenCalledOnce();
  });
});
