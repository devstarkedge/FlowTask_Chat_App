import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({huddle:{byChannel:{},session:null,busy:false,error:null,act:vi.fn(),load:vi.fn()},user:{_id:'A',name:'Alice'},chat:{connectionStatus:'connected'},channel:{channels:[{_id:'channel',name:'Design',workspaceId:'workspace'}]}}));
vi.mock('../../stores/huddleStore',()=>({useHuddleStore:selector=>selector(state.huddle)}));
vi.mock('../../stores/authStore',()=>({useAuthStore:selector=>selector({user:state.user})}));
vi.mock('../../stores/chatStore',()=>({useChatStore:selector=>selector(state.chat)}));
vi.mock('../../stores/channelStore',()=>({useChannelStore:Object.assign(selector=>selector(state.channel),{getState:()=>state.channel})}));
vi.mock('../../services/huddleAudioService',()=>({toggleHuddleMute:vi.fn(),retryHuddleAudio:vi.fn(),toggleHuddleScreen:vi.fn(),updateHuddleFeature:vi.fn(async()=>{})}));
import HuddleHeaderMenu from './HuddleHeaderMenu';
import HuddleWindow from './HuddleWindow';
import {useHuddleUiStore} from '../../stores/huddleUiStore';
import {useHuddleAudioStore} from '../../stores/huddleAudioStore';
let root,container,microphone,clipboard,permissions;
const render=async(route='/')=>act(async()=>root.render(<MemoryRouter initialEntries={[route]}><HuddleHeaderMenu channelId="channel" label="Design" workspaceId="workspace"/><HuddleWindow/></MemoryRouter>));
const button=label=>container.querySelector(`button[aria-label="${label}"]`) || Array.from(container.querySelectorAll('button')).find(element=>element.textContent.trim()===label);
const click=async element=>act(async()=>{element.click();});
beforeEach(()=>{
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();state.huddle.byChannel={};state.huddle.session=null;state.huddle.error=null;state.huddle.busy=false;state.chat.connectionStatus='connected';useHuddleUiStore.setState({panel:null});useHuddleAudioStore.setState({connection:'idle',error:null,startMuted:false,inputDeviceId:'',outputDeviceId:'',joinWithoutMicrophone:false,withoutMicrophone:false});
  microphone=vi.fn();clipboard=vi.fn(async()=>{});permissions={state:'prompt',onchange:null};vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:microphone,enumerateDevices:vi.fn(async()=>[]),addEventListener:vi.fn(),removeEventListener:vi.fn()},permissions:{query:vi.fn(async()=>permissions)},clipboard:{writeText:clipboard}});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('opens a pre-call panel from the header without starting capture or a call',async()=>{
  await render();await click(button('Huddle options'));expect(button('Copy huddle link')).toBeTruthy();await click(button('Start Huddle'));
  expect(container.querySelector('[role="dialog"]')).toBeTruthy();expect(container.textContent).toContain('Start huddle with');expect(state.huddle.act).not.toHaveBeenCalled();expect(microphone).not.toHaveBeenCalled();
  expect(container.querySelector('.huddle-camera-control').disabled).toBe(true);await click(button('Start Huddle'));expect(state.huddle.act).toHaveBeenCalledWith('start','channel');
});
it('cancel closes the preview and returns focus without changing lifecycle state',async()=>{
  await render();await click(button('Huddle options'));await click(button('Start Huddle'));await click(button('Cancel'));
  expect(container.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(button('Huddle options'));expect(state.huddle.act).not.toHaveBeenCalled();expect(microphone).not.toHaveBeenCalled();
});
it('offers an explicit no-microphone join without requesting capture or pretending to unmute',async()=>{
  useHuddleUiStore.getState().openPanel({channelId:'channel',label:'Design'});await render();
  await click(container.querySelector('input[type="checkbox"]'));
  expect(useHuddleAudioStore.getState().joinWithoutMicrophone).toBe(true);
  expect(button('Unmute microphone').disabled).toBe(false);
  await click(button('Unmute microphone'));
  expect(container.textContent).toContain('Connect headphones or a headset with a microphone');
  expect(container.textContent).toContain("computer's built-in microphone");
  expect(microphone).not.toHaveBeenCalled();expect(state.huddle.act).not.toHaveBeenCalled();
  await click(button('Start Huddle'));expect(state.huddle.act).toHaveBeenCalledWith('start','channel');
});
it('shows headset and computer input guidance when unmuting a listener without leaving the call',async()=>{
  state.huddle.session={id:'session',channelId:'channel'};
  state.huddle.byChannel.channel={huddle:{_id:'call',startedBy:'A'},participants:[{id:'session',userId:'A',name:'Alice'}]};
  useHuddleAudioStore.setState({withoutMicrophone:true,muted:true});
  useHuddleUiStore.getState().openPanel({channelId:'channel',label:'Design'});await render();
  await click(button('Unmute microphone'));expect(container.textContent).toContain('Connect your microphone');
  expect(container.textContent).toContain('To speak, leave and rejoin');
  expect(state.huddle.act).not.toHaveBeenCalled();expect(microphone).not.toHaveBeenCalled();
  await click(button('Microphone settings'));expect(container.textContent).toContain("this site's permissions");
  await click(button('Dismiss'));expect(container.textContent).not.toContain('Connect your microphone');
});
it('copies an existing channel route with a pre-call link instead of a file URL',async()=>{
  await render();await click(button('Huddle options'));await click(button('Copy huddle link'));const url=new URL(clipboard.mock.calls[0][0]);expect(url.pathname).toBe('/workspace/workspace/channel/channel');expect(url.searchParams.get('huddle')).toBe('1');expect(container.textContent).toContain('Link copied');
});
it('shows denied microphone guidance based on real permission status without prompting',async()=>{
  permissions.state='denied';useHuddleUiStore.getState().openPanel({channelId:'channel',label:'Design'});await render();expect(container.textContent).toContain('Allow microphone access');expect(microphone).not.toHaveBeenCalled();await click(button('Microphone settings'));expect(container.textContent).toContain("this site's permissions");
});
it('minimizing an active call preserves its session and provides reopen/leave/end controls',async()=>{
  state.huddle.session={id:'session',channelId:'channel'};state.huddle.byChannel.channel={huddle:{_id:'call',startedBy:'A',startedAt:new Date().toISOString()},participants:[{id:'session',userId:'A',name:'Alice',audioReady:true}]};useHuddleUiStore.getState().openPanel({channelId:'channel',label:'Design'});await render();await click(button('Minimize Huddle'));expect(button('Open Huddle')).toBeTruthy();expect(state.huddle.act).not.toHaveBeenCalled();await click(button('Open Huddle'));await click(button('Leave Huddle'));expect(state.huddle.act).toHaveBeenCalledWith('leave','channel');await click(button('End for everyone'));expect(state.huddle.act).toHaveBeenCalledWith('end','channel');
});
it('a copied link opens only the pre-call UI and does not request microphone',async()=>{
  await render('/workspace/workspace/channel/channel?huddle=1');expect(container.querySelector('[role="dialog"]')).toBeTruthy();expect(state.huddle.act).not.toHaveBeenCalled();expect(microphone).not.toHaveBeenCalled();
});
