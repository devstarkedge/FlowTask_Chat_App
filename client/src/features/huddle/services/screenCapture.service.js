import {prepareScreenTrack} from './screenQuality.service.js';

export function screenCaptureFailure(error,outcome){
  const name=error?.name || 'Error';
  const code=outcome?.code || (name==='NotAllowedError'?'SCREEN_CAPTURE_DENIED':name==='NotFoundError'?'SCREEN_CAPTURE_NOT_FOUND':name==='TypeError' || name==='OverconstrainedError' || /invalid capture constraints/i.test(error?.message || '')?'SCREEN_CAPTURE_CONFIG':name==='NotReadableError'?'SCREEN_CAPTURE_UNAVAILABLE':name==='AbortError'?'SCREEN_CAPTURE_ABORTED':'SCREEN_SHARE_FAILED');
  const messages={SCREEN_CAPTURE_CANCELLED:'Screen sharing was cancelled. Choose a screen or window to try again.',SCREEN_CAPTURE_DENIED:'Screen sharing permission was cancelled or denied.',SCREEN_CAPTURE_NOT_FOUND:'No shareable screen or window was found.',SCREEN_CAPTURE_CONFIG:"TaskChat couldn't start screen sharing because the capture configuration is invalid.",SCREEN_CAPTURE_UNAVAILABLE:"TaskChat couldn't capture this screen or window.",SCREEN_CAPTURE_ABORTED:'Screen capture was interrupted. Try choosing the source again.'};
  return {code,name,message:messages[code] || error?.message || 'Screen sharing could not start.'};
}

// Start, Switch and Retry all use the same standards-based acquisition path.
// Source selection belongs to Electron's request handler, never deviceId/SDP.
export async function captureDisplaySource({devices,native,log=()=>{}}){
  const constraints={video:true,audio:native?native.screenCaptureAudioSupported===true:true};
  let stream;const attemptedAt=Date.now();
  log('SCREEN_CAPTURE_REQUEST',{strategy:'getDisplayMedia',constraints});
  try{
    if(!devices?.getDisplayMedia)throw Object.assign(new Error('Screen sharing requires HTTPS or a supported desktop build.'),{name:'NotSupportedError'});
    stream=await devices.getDisplayMedia(constraints);
    const track=stream?.getVideoTracks?.()[0];
    if(!track || track.readyState!=='live')throw Object.assign(new Error('The selected source has no live video track.'),{name:'NotReadableError'});
    prepareScreenTrack(track);
    // Quality hints are optional and cannot invalidate an already granted share.
    if(track.applyConstraints)try{await track.applyConstraints({frameRate:{ideal:15,max:30}});}catch(error){log('SCREEN_CAPTURE_QUALITY_UNAVAILABLE',{name:error.name,message:error.message});}
    const selected=await native?.getHuddleShareSource?.(),surface=track.getSettings?.()?.displaySurface;
    log('SCREEN_CAPTURE_READY',{strategy:'getDisplayMedia',sourceType:selected?.sourceType || surface || 'unknown',systemAudio:Boolean(stream.getAudioTracks?.().length)});
    return {stream,source:selected || {sourceType:surface==='window'?'window':surface==='monitor'?'screen':'browser',sourceLabel:'Shared screen',audioAvailable:Boolean(stream.getAudioTracks?.().length)}};
  }catch(error){
    stream?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    const result=await native?.getHuddleCaptureResult?.().catch(()=>null);
    const outcome=error.name==='AbortError' && result?.attemptedAt>=attemptedAt?result:null;
    log('SCREEN_CAPTURE_FAILED',{strategy:'getDisplayMedia',name:error.name,message:error.message,code:outcome?.code,nativeError:outcome?.message});
    const failure=screenCaptureFailure(error,outcome);
    throw Object.assign(new Error(failure.message,{cause:error}),{name:failure.name,screenCaptureCode:failure.code});
  }
}
