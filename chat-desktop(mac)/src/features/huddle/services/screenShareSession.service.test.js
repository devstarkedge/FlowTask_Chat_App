import {it,expect,vi} from 'vitest';
import {ScreenShareSession} from './screenShareSession.service';
function setup(){let n=0;const captures=[];const capture=vi.fn(async()=>{const track={enabled:true,readyState:'live',stop:vi.fn(()=>{track.readyState='ended';})},stream={getTracks:()=>[track],getVideoTracks:()=>[track],getAudioTracks:()=>[]};captures.push(track);return {stream,source:{sourceType:'window',sourceLabel:'Report'}};});const publish=vi.fn(async()=>{}),signal=vi.fn(async()=>{}),resetAnnotations=vi.fn(),update=vi.fn(),present=vi.fn();return {captures,capture,publish,signal,resetAnnotations,update,present,manager:new ScreenShareSession({capture,publish,signal,resetAnnotations,update,present,context:()=>({id:'alice',huddleId:'huddle'}),id:()=>`share-${++n}`})};}
it('never announces failed acquisition and clears the error on a fresh retry',async()=>{
 const {manager,capture,publish,signal,update,present}=setup();capture.mockRejectedValueOnce(Object.assign(new Error('Permission denied'),{name:'NotAllowedError',screenCaptureCode:'SCREEN_CAPTURE_DENIED'}));
 await manager.start();expect(manager.current).toBeNull();expect(publish).not.toHaveBeenCalled();expect(signal).not.toHaveBeenCalled();expect(present.mock.calls.every(([value])=>value===null)).toBe(true);expect(update).toHaveBeenCalledWith({screenError:expect.objectContaining({code:'SCREEN_CAPTURE_DENIED'})});
 await manager.start();expect(capture).toHaveBeenCalledTimes(2);expect(manager.current).not.toBeNull();expect(update).toHaveBeenCalledWith({screenError:null});await manager.stop();
});
it('pauses and switches the existing screen publication, then resets both share generations',async()=>{
 const {manager,captures,publish,signal,resetAnnotations}=setup();await manager.start();const first=manager.view();await manager.start();expect(captures).toHaveLength(1);
 await manager.pause();expect(captures[0].enabled).toBe(false);expect(signal).toHaveBeenLastCalledWith(expect.objectContaining({screenShare:expect.objectContaining({state:'paused'})}));
 await manager.pause();expect(captures[0].enabled).toBe(true);await manager.start({switching:true});expect(manager.view().id).not.toBe(first.id);expect(captures[0].stop).toHaveBeenCalledOnce();expect(resetAnnotations).toHaveBeenCalledWith(first.id);
 await manager.stop();await manager.stop();expect(publish).toHaveBeenLastCalledWith(null);expect(captures[1].stop).toHaveBeenCalledOnce();expect(manager.view()).toBeNull();
});
it('uses canonical cleanup when the OS capture track ends and permits a fresh share',async()=>{
 const {manager,captures,publish,signal}=setup();await manager.start();const first=manager.view().id;await captures[0].onended();await manager.publication;await Promise.resolve();
 expect(manager.view()).toBeNull();expect(publish).toHaveBeenLastCalledWith(null);expect(signal).toHaveBeenCalledWith({sharing:false,shareId:first,reason:'track_ended'});
 await manager.start();expect(manager.view().id).not.toBe(first);expect(captures).toHaveLength(2);await manager.stop();
});
