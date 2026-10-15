import {describe,it,expect,vi,beforeEach} from 'vitest';
const transport=vi.hoisted(()=>({socket:{connected:true,timeout:vi.fn(),emit:vi.fn()}}));
vi.mock('../services/socket',()=>({getSocket:()=>transport.socket}));
vi.mock('../services/huddleAudioService',()=>({startHuddleAudio:vi.fn(async()=>{}),stopHuddleAudio:vi.fn(),bindHuddleAudio:()=>()=>{},retryHuddleAudio:vi.fn(async()=>{})}));
import {useHuddleStore} from './huddleStore';
import {bindHuddleSocket} from '../services/huddleSocketService';
import {startHuddleAudio} from '../services/huddleAudioService';
const state=()=>useHuddleStore.getState();
const snapshot=(revision=1)=>({huddle:{_id:'call',startedBy:'A'},participants:[],revision});
beforeEach(()=>{state().reset();vi.clearAllMocks();transport.socket.timeout.mockReturnValue(transport.socket);});
describe('Huddle client lifecycle',()=>{
  it('leaves the lifecycle session and restores UI after microphone denial',async()=>{
    transport.socket.emit.mockImplementation((event,payload,ack)=>ack(null,{success:true,data:{...snapshot(),...(event==='huddle:start'?{session:{id:'device',secret:'private'}}: {})}}));
    vi.mocked(startHuddleAudio).mockRejectedValueOnce(new Error('Microphone access was denied'));
    await state().act('start','channel');expect(state().session).toBeNull();expect(state().busy).toBe(false);expect(state().error).toBe('Microphone access was denied');
    expect(transport.socket.emit).toHaveBeenCalledWith('huddle:leave',{channelId:'channel'},expect.any(Function));
  });
  it('keeps device credentials private and refuses stale state',async()=>{
    transport.socket.emit.mockImplementation((event,payload,ack)=>ack(null,{success:true,data:{...snapshot(3),session:{id:'device',secret:'private'}}}));
    await state().act('start','channel');
    expect(state().session).toEqual({id:'device',secret:'private',channelId:'channel'});
    expect(state().byChannel.channel.session).toBeUndefined();
    state().ingest('channel',snapshot(2));expect(state().byChannel.channel.revision).toBe(3);
    state().ingest('channel',{huddle:null,participants:[],revision:4});expect(state().session).toBeNull();
  });
  it('discards delayed join responses after logout or workspace switch',async()=>{
    let ack;transport.socket.emit.mockImplementation((e,p,cb)=>{ack=cb;});
    const joining=state().act('join','old');state().reset();
    ack(null,{success:true,data:{...snapshot(),session:{id:'device',secret:'private'}}});await joining;
    expect(state().session).toBeNull();expect(state().byChannel).toEqual({});expect(state().busy).toBe(false);
  });
  it('releases busy state and shows provider errors',async()=>{
    transport.socket.emit.mockImplementation((e,p,cb)=>cb(null,{success:false,error:{message:'Channel access denied'}}));
    await state().act('join','private');expect(state().error).toBe('Channel access denied');expect(state().busy).toBe(false);
  });
  it('isolates workspace events and removes all listeners and timers',()=>{
    vi.useFakeTimers();const callbacks=new Map();const socket={connected:true,on:vi.fn((event,cb)=>callbacks.set(event,cb)),off:vi.fn()};
    const cleanup=bindHuddleSocket(socket,()=> 'current');
    callbacks.get('huddle:state')({workspaceId:'other',channelId:'private',...snapshot()});expect(state().byChannel).toEqual({});
    callbacks.get('huddle:state')({workspaceId:'current',channelId:'allowed',...snapshot()});expect(state().byChannel.allowed.huddle._id).toBe('call');
    cleanup();expect(socket.off).toHaveBeenCalledWith('huddle:state',callbacks.get('huddle:state'));expect(socket.off).toHaveBeenCalledWith('connect',callbacks.get('connect'));expect(socket.off).toHaveBeenCalledWith('huddle:invitation',callbacks.get('huddle:invitation'));expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();
  });
});
