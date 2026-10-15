import {it,expect,vi} from 'vitest';
const deps=vi.hoisted(()=>({state:{session:null,ingest:vi.fn(),heartbeat:vi.fn()},receive:vi.fn(),clear:vi.fn(),dispose:vi.fn()}));
vi.mock('../stores/huddleStore',()=>({useHuddleStore:{getState:()=>deps.state}}));
vi.mock('../stores/huddleUiStore',()=>({useHuddleUiStore:{getState:()=>({receiveInvitation:deps.receive,clearInvitations:deps.clear})}}));
vi.mock('./huddleAudioService',()=>({bindHuddleAudio:()=>deps.dispose,retryHuddleAudio:vi.fn()}));
import {bindHuddleSocket} from './huddleSocketService';
it('routes only matching-workspace invitations and disposes the global listener',()=>{const handlers={};const socket={connected:true,on:vi.fn((event,callback)=>{handlers[event]=callback;}),off:vi.fn()};const dispose=bindHuddleSocket(socket,()=> 'workspace');try{handlers['huddle:invitation']({workspaceId:'other',channelId:'channel'});expect(deps.receive).not.toHaveBeenCalled();handlers['huddle:invitation']({workspaceId:'workspace',channelId:'channel'});expect(deps.receive).toHaveBeenCalledTimes(1);deps.state.session={channelId:'channel'};handlers['huddle:invitation']({workspaceId:'workspace',channelId:'channel'});expect(deps.receive).toHaveBeenCalledTimes(1);}finally{dispose();}expect(socket.off).toHaveBeenCalledWith('huddle:invitation',handlers['huddle:invitation']);expect(deps.clear).toHaveBeenCalled();});
