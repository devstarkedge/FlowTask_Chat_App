import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import HuddleAudioOutput from './HuddleAudioOutput';
import {useHuddleAudioStore} from '../../stores/huddleAudioStore';
let root,container,play,pause;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;useHuddleAudioStore.setState({remoteStream:null,remoteAudioStreams:{},deafened:false,playbackBlocked:false,error:null});play=vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
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

it('plays both remote microphones and preserves an existing output when a peer leaves',async()=>{
  const b={id:'B'},c={id:'C'};useHuddleAudioStore.setState({remoteAudioStreams:{B:b,C:c},remoteStream:{id:'aggregate'}});
  await act(async()=>root.render(<HuddleAudioOutput/>));const outputs=[...container.querySelectorAll('audio')];
  expect(outputs.map(element=>element.srcObject)).toEqual([b,c]);expect(play).toHaveBeenCalledTimes(2);
  await act(async()=>useHuddleAudioStore.setState({remoteAudioStreams:{B:b}}));
  expect(container.querySelector('audio')).toBe(outputs[0]);expect(outputs[1].srcObject).toBeNull();expect(play).toHaveBeenCalledTimes(2);
});
it('keeps the playback prompt until every blocked microphone can play',async()=>{
  play.mockRejectedValue(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));
  useHuddleAudioStore.setState({remoteAudioStreams:{B:{id:'B'},C:{id:'C'}}});await act(async()=>root.render(<HuddleAudioOutput/>));
  expect(useHuddleAudioStore.getState().playbackBlocked).toBe(true);
  play.mockResolvedValueOnce().mockRejectedValueOnce(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));
  await act(async()=>container.querySelector('button').click());expect(useHuddleAudioStore.getState().playbackBlocked).toBe(true);
  play.mockResolvedValue();await act(async()=>container.querySelector('button').click());expect(useHuddleAudioStore.getState().playbackBlocked).toBe(false);
});
