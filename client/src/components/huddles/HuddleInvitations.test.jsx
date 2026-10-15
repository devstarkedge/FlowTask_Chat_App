import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const deps=vi.hoisted(()=>({request:vi.fn(),ingest:vi.fn()}));
vi.mock('../../services/huddleRequest',()=>({sendHuddleRequest:deps.request}));
vi.mock('../../stores/huddleStore',()=>({useHuddleStore:{getState:()=>({ingest:deps.ingest})}}));
import HuddleInvitations from './HuddleInvitations';
import HuddleMeetingLink from './HuddleMeetingLink';
import {useHuddleUiStore} from '../../stores/huddleUiStore';
let root,container;
const invite={id:'invitation',channelId:'channel',huddleId:'meeting',workspaceId:'workspace',callerName:'Alex',label:'Design',expiresAt:Date.now()+60000};
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();useHuddleUiStore.setState({panel:null,invitations:[]});container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(()=>root.unmount());container.remove();});
async function click(text){await act(async()=>{[...container.querySelectorAll('button')].find(button=>button.textContent===text).click();await Promise.resolve();});}
it('shows an invitation outside the viewed channel, opens a verified pre-call preview without capturing media',async()=>{deps.request.mockResolvedValue({huddle:{_id:'meeting'},participants:[{audioReady:true,connection:'connected'}],revision:1});await act(()=>{useHuddleUiStore.getState().receiveInvitation(invite);root.render(<HuddleInvitations/>);});expect(container.textContent).toContain('Alex invited you');await click('Join Huddle');expect(deps.request).toHaveBeenCalledWith('get',{channelId:'channel'});expect(useHuddleUiStore.getState().panel.channelId).toBe('channel');expect(useHuddleUiStore.getState().invitations).toEqual([]);});
it('rejects an ended/replaced call and allows dismissing without a join request',async()=>{deps.request.mockResolvedValue({huddle:{_id:'different'}});await act(()=>{useHuddleUiStore.getState().receiveInvitation(invite);root.render(<HuddleInvitations/>);});await click('Join Huddle');expect(container.textContent).toContain('This Huddle has ended');expect(useHuddleUiStore.getState().panel).toBeNull();await click('Dismiss');expect(container.textContent).toBe('');});
it('ignores expired invitations and deduplicates meeting prompts',()=>{useHuddleUiStore.getState().receiveInvitation({...invite,expiresAt:Date.now()-1});expect(useHuddleUiStore.getState().invitations).toHaveLength(0);useHuddleUiStore.getState().receiveInvitation(invite);useHuddleUiStore.getState().receiveInvitation({...invite,id:'second'});expect(useHuddleUiStore.getState().invitations).toHaveLength(1);});
it('provides a meeting link and reports invitation delivery instead of silently waiting',async()=>{const copy=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});deps.request.mockResolvedValue({invitation:{sent:1}});await act(()=>root.render(<HuddleMeetingLink workspaceId="workspace" channelId="channel"/>));await click('Copy meeting link');expect(copy).toHaveBeenCalledWith(expect.stringContaining('/workspace/workspace/channel/channel?huddle=1'));await click('Invite participants');expect(deps.request).toHaveBeenCalledWith('invite',{channelId:'channel'});expect(container.textContent).toContain('Invitation sent to 1');});
