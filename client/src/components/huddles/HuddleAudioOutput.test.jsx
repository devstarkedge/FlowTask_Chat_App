import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import HuddleAudioOutput from './HuddleAudioOutput';
import {useHuddleAudioStore} from '../../stores/huddleAudioStore';
let root,container,play,pause;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;useHuddleAudioStore.setState({remoteStream:null,deafened:false,playbackBlocked:false,error:null});play=vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.restoreAllMocks();});
it('attaches remote audio once and detaches it during cleanup',async()=>{
  const stream={id:'remote'};useHuddleAudioStore.setState({remoteStream:stream});await act(async()=>root.render(<HuddleAudioOutput/>));
  expect(container.querySelector('audio').srcObject).toBe(stream);expect(play).toHaveBeenCalledOnce();
  await act(async()=>useHuddleAudioStore.setState({deafened:true}));expect(container.querySelector('audio').muted).toBe(true);
  const element=container.querySelector('audio');await act(async()=>useHuddleAudioStore.setState({remoteStream:null}));expect(element.srcObject).toBeNull();expect(pause).toHaveBeenCalled();
});
it('shows a user-gesture playback action when autoplay is blocked',async()=>{
  play.mockRejectedValueOnce(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));useHuddleAudioStore.setState({remoteStream:{id:'remote'}});
  await act(async()=>root.render(<HuddleAudioOutput/>));const button=container.querySelector('button');expect(button.textContent).toBe('Enable Huddle audio');
  await act(async()=>{button.click();});expect(useHuddleAudioStore.getState().playbackBlocked).toBe(false);
});
