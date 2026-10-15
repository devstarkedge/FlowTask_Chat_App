import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const deps=vi.hoisted(()=>({socket:{connected:true,timeout:vi.fn(),emit:vi.fn(),on:vi.fn(),off:vi.fn()},state:{session:null,ingest:vi.fn(),act:vi.fn()},subscribe:vi.fn(()=>()=>{})}));
vi.mock('./socket',()=>({getSocket:()=>deps.socket}));
vi.mock('../stores/huddleStore',()=>({useHuddleStore:{getState:()=>deps.state,subscribe:deps.subscribe}}));
import {startHuddleAudio,stopHuddleAudio,toggleHuddleMute,bindHuddleAudio,toggleHuddleScreen} from './huddleAudioService';
import {useHuddleAudioStore} from '../stores/huddleAudioStore';
let getUserMedia,track,stream;
const data=()=>({state:{huddle:{_id:'huddle'},revision:1,participants:[{id:'session',audioReady:true,mediaId:'media',connection:'connected'}]},rtcConfiguration:{iceServers:[]},expiresAt:Math.floor(Date.now()/1000)+3600});
beforeEach(()=>{
  stopHuddleAudio();vi.clearAllMocks();vi.useFakeTimers();track={enabled:true,stop:vi.fn()};stream={getTracks:()=>[track],getAudioTracks:()=>[track]};getUserMedia=vi.fn(async()=>stream);
  useHuddleAudioStore.setState({inputDeviceId:'',outputDeviceId:'',startMuted:false,joinWithoutMicrophone:false,withoutMicrophone:false});
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});vi.stubGlobal('RTCPeerConnection',class{});deps.state.session={id:'session',channelId:'channel'};deps.socket.timeout.mockReturnValue(deps.socket);deps.socket.emit.mockImplementation((event,payload,ack)=>ack(null,{success:true,data:data()}));
});
afterEach(()=>{stopHuddleAudio();vi.useRealTimers();vi.unstubAllGlobals();});
describe('Huddle action-only capture and cleanup',()=>{
  it('joins without capture when the user explicitly chooses no microphone',async()=>{
    vi.stubGlobal('MediaStream',class{getTracks(){return [];}getAudioTracks(){return [];}});
    useHuddleAudioStore.setState({joinWithoutMicrophone:true});
    await startHuddleAudio('channel',deps.state.session);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(deps.socket.emit).toHaveBeenCalledWith('huddle:audio-ready',{channelId:'channel',muted:true},expect.any(Function));
    expect(useHuddleAudioStore.getState().withoutMicrophone).toBe(true);
    await toggleHuddleMute();expect(useHuddleAudioStore.getState().muted).toBe(true);
    stopHuddleAudio();expect(vi.getTimerCount()).toBe(0);
  });
  it('recovers from an unavailable selected input by trying the system default once',async()=>{
    useHuddleAudioStore.setState({inputDeviceId:'removed'});
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('missing'),{name:'NotFoundError'}));
    await startHuddleAudio('channel',deps.state.session);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0].audio.deviceId).toBeUndefined();
    expect(useHuddleAudioStore.getState().inputDeviceId).toBe('');
  });
  it('does not silently enter a call or repeatedly request capture when no microphone exists',async()=>{
    getUserMedia.mockRejectedValue(Object.assign(new Error('missing'),{name:'NotFoundError'}));
    await expect(startHuddleAudio('channel',deps.state.session)).rejects.toThrow('Join without microphone');
    expect(getUserMedia).toHaveBeenCalledOnce();expect(deps.socket.emit).not.toHaveBeenCalled();
  });
  it('cancels screen capture cleanly and never requests it during binding',async()=>{
    const capture=vi.fn(async()=>{throw Object.assign(new Error('cancelled'),{name:'NotAllowedError'});});navigator.mediaDevices.getDisplayMedia=capture;
    const dispose=bindHuddleAudio(deps.socket);expect(capture).not.toHaveBeenCalled();await toggleHuddleScreen();expect(capture).toHaveBeenCalledWith({video:expect.any(Object),audio:false});expect(useHuddleAudioStore.getState().screenBusy).toBe(false);expect(useHuddleAudioStore.getState().error).toContain('cancelled or denied');dispose();
  });
  it('stops a late display grant if the user leaves while choosing a screen',async()=>{
    let approve;const video={stop:vi.fn()},display={getTracks:()=>[video],getVideoTracks:()=>[video]};navigator.mediaDevices.getDisplayMedia=vi.fn(()=>new Promise(resolve=>{approve=resolve;}));
    const sharing=toggleHuddleScreen();deps.state.session=null;stopHuddleAudio();approve(display);await sharing;expect(video.stop).toHaveBeenCalledOnce();expect(deps.socket.emit).not.toHaveBeenCalled();expect(useHuddleAudioStore.getState().screenBusy).toBe(false);
  });
  it('socket binding does not request microphone or camera',()=>{
    const dispose=bindHuddleAudio(deps.socket);expect(getUserMedia).not.toHaveBeenCalled();dispose();expect(deps.socket.off).toHaveBeenCalledTimes(2);
  });
  it('captures audio only after Join, mutes actual tracks and stops on leave',async()=>{
    await startHuddleAudio('channel',deps.state.session);expect(getUserMedia).toHaveBeenCalledWith({audio:expect.any(Object),video:false});
    expect(deps.socket.emit).toHaveBeenCalledWith('huddle:audio-ready',{channelId:'channel',muted:false},expect.any(Function));
    await toggleHuddleMute();expect(track.enabled).toBe(false);expect(deps.socket.emit).toHaveBeenCalledWith('huddle:audio-state',{channelId:'channel',muted:true},expect.any(Function));
    stopHuddleAudio();expect(track.stop).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
  });
  it('reports denied access without starting a peer or registering audio',async()=>{
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'),{name:'NotAllowedError'}));
    await expect(startHuddleAudio('channel',deps.state.session)).rejects.toThrow('Microphone access was denied');expect(deps.socket.emit).not.toHaveBeenCalled();expect(useHuddleAudioStore.getState().connection).toBe('idle');
  });
  it('releases a late microphone grant after logout/workspace reset',async()=>{
    let approve;getUserMedia.mockImplementationOnce(()=>new Promise(resolve=>{approve=resolve;}));const joining=startHuddleAudio('channel',deps.state.session);
    deps.state.session=null;stopHuddleAudio();approve(stream);await joining;expect(track.stop).toHaveBeenCalledOnce();expect(deps.socket.emit).not.toHaveBeenCalled();
  });
  it('honors the pre-call microphone selection and starts with muted audio',async()=>{
    useHuddleAudioStore.setState({inputDeviceId:'chosen-microphone',startMuted:true});
    await startHuddleAudio('channel',deps.state.session);
    expect(getUserMedia).toHaveBeenCalledWith({audio:expect.objectContaining({deviceId:{exact:'chosen-microphone'}}),video:false});
    expect(track.enabled).toBe(false);expect(deps.socket.emit).toHaveBeenCalledWith('huddle:audio-ready',{channelId:'channel',muted:true},expect.any(Function));
  });
});
