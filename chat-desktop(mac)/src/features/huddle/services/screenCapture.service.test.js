import {it,expect,vi} from 'vitest';
import {captureDisplaySource,screenCaptureFailure} from './screenCapture.service';
const capture=()=>{const track={readyState:'live',applyConstraints:vi.fn(async()=>{}),getSettings:()=>({displaySurface:'monitor'}),stop:vi.fn()},stream={getTracks:()=>[track],getVideoTracks:()=>[track],getAudioTracks:()=>[]};return {track,stream};};
it('uses minimal display constraints, then applies optional quality hints',async()=>{
 const {track,stream}=capture(),devices={getDisplayMedia:vi.fn(async()=>stream)};
 const result=await captureDisplaySource({devices,native:{screenCaptureAudioSupported:true},log:vi.fn()});
 expect(devices.getDisplayMedia).toHaveBeenCalledWith({video:true,audio:true});expect(track.applyConstraints).toHaveBeenCalledWith({frameRate:{ideal:15,max:30}});expect(result.stream).toBe(stream);expect(track.contentHint).toBe('detail');
});
it('does not ask unsupported desktop platforms for system audio',async()=>{
 const {stream}=capture(),devices={getDisplayMedia:vi.fn(async()=>stream)};await captureDisplaySource({devices,native:{screenCaptureAudioSupported:false}});expect(devices.getDisplayMedia).toHaveBeenCalledWith({video:true,audio:false});
});
it('keeps capture usable when optional quality tuning is unsupported',async()=>{
 const {stream,track}=capture();track.applyConstraints.mockRejectedValue(new Error('unsupported hint'));expect((await captureDisplaySource({devices:{getDisplayMedia:async()=>stream}})).stream).toBe(stream);
});
it('distinguishes Electron picker cancellation from an actual invalid configuration',async()=>{
 const error=Object.assign(new Error('Invalid capture constraints'),{name:'AbortError'}),log=vi.fn();
 await expect(captureDisplaySource({devices:{getDisplayMedia:async()=>{throw error;}},native:{getHuddleCaptureResult:async()=>({status:'cancelled',code:'SCREEN_CAPTURE_CANCELLED',attemptedAt:Date.now()})},log})).rejects.toMatchObject({screenCaptureCode:'SCREEN_CAPTURE_CANCELLED',message:expect.stringContaining('cancelled'),cause:error});
 expect(log).toHaveBeenCalledWith('SCREEN_CAPTURE_FAILED',expect.objectContaining({name:'AbortError',message:'Invalid capture constraints'}));
 expect(screenCaptureFailure(error).code).toBe('SCREEN_CAPTURE_CONFIG');
});
it('does not reuse an older picker cancellation for a new failed attempt',async()=>{
 await expect(captureDisplaySource({devices:{getDisplayMedia:async()=>{throw Object.assign(new Error('Invalid capture constraints'),{name:'AbortError'});}},native:{getHuddleCaptureResult:async()=>({code:'SCREEN_CAPTURE_CANCELLED',attemptedAt:0})}})).rejects.toMatchObject({screenCaptureCode:'SCREEN_CAPTURE_CONFIG'});
});
it('rejects and releases an invalid capture stream before publication',async()=>{
 const {stream,track}=capture();track.readyState='ended';await expect(captureDisplaySource({devices:{getDisplayMedia:async()=>stream}})).rejects.toMatchObject({screenCaptureCode:'SCREEN_CAPTURE_UNAVAILABLE'});expect(track.stop).toHaveBeenCalledOnce();
});
for(const [name,code] of [['NotAllowedError','SCREEN_CAPTURE_DENIED'],['NotFoundError','SCREEN_CAPTURE_NOT_FOUND'],['NotReadableError','SCREEN_CAPTURE_UNAVAILABLE'],['TypeError','SCREEN_CAPTURE_CONFIG'],['OverconstrainedError','SCREEN_CAPTURE_CONFIG'],['AbortError','SCREEN_CAPTURE_ABORTED']])it(`retains specific ${name} failure information`,()=>{expect(screenCaptureFailure({name,message:'technical detail'})).toMatchObject({name,code});});
