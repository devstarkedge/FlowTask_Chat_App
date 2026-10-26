import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const fixture=vi.hoisted(()=>({navigate:vi.fn(),open:vi.fn(),active:null,session:null,workspace:'workspace',channels:[{_id:'channel',type:'dm',dmParticipantNames:['Alice','Bob'],name:'Alice, Bob'}]}));
vi.mock('react-router-dom',()=>({useNavigate:()=>fixture.navigate}));
vi.mock('../../stores/channelStore',()=>({useChannelStore:selector=>selector({channels:fixture.channels})}));
vi.mock('../../stores/authStore',()=>({useAuthStore:selector=>selector({user:{name:'Alice'}})}));
vi.mock('../../stores/workspaceStore',()=>({useWorkspaceStore:selector=>selector({activeWorkspaceId:fixture.workspace})}));
vi.mock('../../stores/huddleStore',()=>({useHuddleStore:selector=>selector({byChannel:{channel:{huddle:fixture.active}},session:fixture.session})}));
vi.mock('../../stores/huddleUiStore',()=>({useHuddleUiStore:selector=>selector({openPanel:fixture.open})}));
vi.mock('../chat/CanvasDocumentCard',()=>({default:()=> <div>Existing document preview</div>}));
import MessageContentResolver from '../chat/MessageContentResolver';
import {meetingUrl,parseHuddleLink,huddleLinksFromMessage} from '../../features/huddle/utils/huddleLinks';
let root,container;
const url='https://taskchat.example/workspace/workspace/channel/channel?huddle=1';
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;vi.stubEnv('VITE_APP_URL','https://taskchat.example');vi.clearAllMocks();fixture.active=null;fixture.session=null;fixture.workspace='workspace';fixture.channels=[{_id:'channel',type:'dm',dmParticipantNames:['Alice','Bob'],name:'Alice, Bob'}];container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(()=>root.unmount());container.remove();vi.unstubAllEnvs();});
const render=(content=url,message={})=>act(()=>root.render(<MessageContentResolver rawContent={content} message={message}><p>Original message</p></MessageContentResolver>));
it('keeps the copied link usable and recognizes only trusted TaskChat Huddle URLs',()=>{
 expect(meetingUrl('workspace','channel')).toBe(url);expect(parseHuddleLink(url)).toMatchObject({workspaceId:'workspace',channelId:'channel'});
 for(const value of [url.replace('taskchat.example','other.example'),url.replace('?huddle=1',''),url.replace('taskchat.example','taskchat.example.attacker.test'),url.replace('/channel/channel','/channel/%2Fescape'),url.replace('https://','https://user:password@')])expect(parseHuddleLink(value)).toBeNull();
});
it('deduplicates plain, rich-text and forwarded hrefs and ignores script/deleted content',()=>{
 expect(huddleLinksFromMessage({content:`Join ${url}`,htmlContent:`<p><a href="${url}">Join meeting</a></p>`})).toHaveLength(1);
 expect(huddleLinksFromMessage({content:`<script>${url}</script>`})).toEqual([]);expect(huddleLinksFromMessage({content:url,isDeleted:true})).toEqual([]);
});
it('shows the invitation card below the message and opens the existing pre-call flow',async()=>{
 await render();expect(container.textContent).toContain('Original message');expect(container.textContent).toContain('A Huddle link has been shared');expect(container.textContent).toContain('With Bob');expect(container.textContent).toContain('TaskChat');
 expect(fixture.open).not.toHaveBeenCalled();await act(()=>container.querySelector('button').click());expect(fixture.open).toHaveBeenCalledWith({workspaceId:'workspace',channelId:'channel',label:'Bob'});expect(fixture.navigate).not.toHaveBeenCalled();
});
it('uses Join/Open actions for an active/joined Huddle',async()=>{
 fixture.active={_id:'huddle'};await render();expect(container.querySelector('button').textContent).toBe('Join Huddle');fixture.session={channelId:'channel'};await render();expect(container.querySelector('button').textContent).toBe('Open Huddle');
});
it('navigates through the existing Huddle deep link for a different workspace',async()=>{
 fixture.workspace='other';await render();await act(()=>container.querySelector('button').click());expect(fixture.navigate).toHaveBeenCalledWith('/workspace/workspace/channel/channel?huddle=1');expect(fixture.open).not.toHaveBeenCalled();
});
it('keeps ordinary messages, deleted links and existing document cards unchanged',async()=>{
 await render('Ordinary text');expect(container.querySelector('article')).toBeNull();await render(url,{isDeleted:true});expect(container.querySelector('article')).toBeNull();await render('https://taskchat.example/canvas/document');expect(container.textContent).toContain('Existing document preview');expect(container.querySelector('article')).toBeNull();
});
