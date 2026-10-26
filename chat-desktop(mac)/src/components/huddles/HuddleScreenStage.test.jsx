import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
vi.mock('../../features/huddle/hooks/useSharedHuddleNotes',()=>({useSharedHuddleNotes:()=>({})}));
vi.mock('../../services/huddleAudioService',()=>({toggleHuddleScreen:vi.fn(),updateHuddleFeature:vi.fn(),sendScreenAnnotation:vi.fn(),pauseHuddleScreen:vi.fn(),switchHuddleScreen:vi.fn(),stopHuddleScreen:vi.fn()}));
vi.mock('./ScreenAnnotationLayer',()=>({default:()=>null}));
import HuddleTools from './HuddleTools';
import {screenShareViews} from '../../features/huddle/utils/screenShareViews';
let root,container;
const localStream={name:'real local capture'},remoteStream={name:'real remote screen'},cameraStream={name:'camera'};
const session={id:'alice',channelId:'channel'};
const participant=(id,sharing=false)=>({id,name:id,screenSharing:sharing,screenShare:sharing?{id:'share-1',sourceLabel:'Report',state:'active'}:null});
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});globalThis.electronAPI={updateHuddleShare:vi.fn()};});
afterEach(async()=>{await act(()=>root.unmount());container.remove();delete globalThis.electronAPI;vi.restoreAllMocks();});
const render=(state,audio,extra={})=>act(()=>root.render(<HuddleTools state={state} audio={audio} session={session} {...extra}/>));
it('shows native presenter capture and keeps it mounted when returning to participant view',async()=>{
 const state={participants:[participant('alice',true),participant('bob')]},audio={localScreenStream:localStream,localScreenShare:{...state.participants[0].screenShare,participantSessionId:'alice'}};
 await render(state,audio);const video=container.querySelector('video');expect(video.srcObject).toBe(localStream);expect(video.getAttribute('aria-label')).toBe('Your shared screen');
 expect(container.querySelector('[aria-label="Screen presentation controls"]')).toBeNull();expect(container.textContent).toContain('floating source toolbar');
 await render(state,audio,{screenFocused:false});expect(container.querySelector('video')).toBe(video);expect(video.srcObject).toBe(localStream);expect(container.querySelector('.huddle-share-focus-surface').hidden).toBe(true);
 await render({participants:[participant('alice'),participant('bob')]},{localScreenStream:null});expect(container.querySelector('video')).toBeNull();expect(video.srcObject).toBeNull();
});
it('attaches remote screen rather than camera and displays pause state',async()=>{
 const state={participants:[participant('alice'),participant('bob',true)]};state.participants[1].screenShare.state='paused';
 const audio={remoteScreenStreams:{bob:remoteStream},remoteCameraStreams:{bob:cameraStream}};
 await render(state,audio);expect(container.querySelector('video').srcObject).toBe(remoteStream);expect(container.textContent).toContain('Screen sharing paused');
 expect(container.textContent).not.toContain('Stop sharing');expect(screenShareViews(state,audio,'alice')[0].isLocal).toBe(false);
});
it('waits for the authorized screen track without substituting camera content',async()=>{
 await render({participants:[participant('alice'),participant('bob',true)]},{remoteCameraStreams:{bob:cameraStream}});
 expect(container.querySelector('video')).toBeNull();expect(container.textContent).toContain('Connecting shared screen');
});
it('does not assign a legacy singleton stream to multiple distinct presenters',()=>{
 const views=screenShareViews({participants:[participant('bob',true),participant('charlie',true)]},{remoteScreenStream:remoteStream},'alice');
 expect(views.every(share=>!share.stream)).toBe(true);
});
