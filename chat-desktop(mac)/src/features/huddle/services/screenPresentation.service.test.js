import {afterEach,expect,it,vi} from 'vitest';
import {screenPoint} from './screenPresentation.service';
import {configureScreenSender,SCREEN_MAX_BITRATE} from './screenQuality.service';

afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it('maps strokes inside the fitted video and ignores unused letterbox space',()=>{
  const rect={left:10,top:20,width:1000,height:1000};
  expect(screenPoint({clientX:510,clientY:520},rect,1920,1080)).toEqual({x:.5,y:.5});
  expect(screenPoint({clientX:20,clientY:30},rect,1920,1080)).toBeNull();
  expect(screenPoint({clientX:1,clientY:1},rect,0,0)).toBeNull();
});
it('preserves negotiated sender parameters while maintaining screen resolution',async()=>{
  const setParameters=vi.fn();const sender={track:{},getParameters:()=>({transactionId:'keep',encodings:[{rid:'screen',active:true}]}),setParameters};
  await configureScreenSender(sender);
  expect(setParameters).toHaveBeenCalledWith(expect.objectContaining({transactionId:'keep',degradationPreference:'maintain-resolution',encodings:[expect.objectContaining({rid:'screen',active:true,maxBitrate:SCREEN_MAX_BITRATE,scaleResolutionDownBy:1})]}));
  await configureScreenSender({track:{},getParameters:()=>({}),setParameters});expect(setParameters).toHaveBeenCalledOnce();
});
