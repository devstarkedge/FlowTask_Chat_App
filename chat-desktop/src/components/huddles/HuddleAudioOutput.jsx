import {useCallback,useEffect,useRef} from 'react';
import {HuddleSpeakerMonitor} from '../../services/HuddleSpeakerMonitor';
import {useHuddleStore} from '../../stores/huddleStore';
import {useHuddleAudioStore} from '../../stores/huddleAudioStore';

function ParticipantAudio({id,stream,deafened,outputDeviceId,register,report}) {
  const ref=useRef(null);
  useEffect(()=>{
    const element=ref.current;let disposed=false;
    register(id,element);element.srcObject=stream;
    element.play().then(()=>{if(!disposed)report(id,null);}).catch(error=>{if(!disposed && error.name!=='AbortError')report(id,error);});
    return()=>{disposed=true;register(id,null);element.pause();element.srcObject=null;report(id,null);};
  },[id,stream,register,report]);
  useEffect(()=>{
    const element=ref.current;let disposed=false;
    if(typeof element.setSinkId==='function')element.setSinkId(outputDeviceId).catch(()=>{if(!disposed)useHuddleAudioStore.getState().update({error:'Could not use this speaker. Choose the default speaker and try again.'});});
    return()=>{disposed=true;};
  },[outputDeviceId]);
  return <audio ref={ref} autoPlay playsInline muted={deafened} aria-label="Huddle remote audio"/>;
}

// One output per microphone: never rely on a browser mixing multiple audio
// tracks in a single media element. Mounted above routes for the call lifetime.
export default function HuddleAudioOutput() {
  const stream=useHuddleAudioStore(state=>state.remoteStream);
  const streams=useHuddleAudioStore(state=>state.remoteAudioStreams);
  const deafened=useHuddleAudioStore(state=>state.deafened);
  const outputDeviceId=useHuddleAudioStore(state=>state.outputDeviceId);
  const blocked=useHuddleAudioStore(state=>state.playbackBlocked);
  const local=useHuddleAudioStore(state=>state.localMicrophoneStream);
  const sessionId=useHuddleStore(state=>state.session?.id);
  const monitor=useRef(null);
  useEffect(()=>{
    monitor.current=new HuddleSpeakerMonitor({onChange:speakingSessions=>useHuddleAudioStore.getState().update({speakingSessions})});
    return()=>{monitor.current.stop();monitor.current=null;};
  },[]);
  useEffect(()=>{monitor.current.sync({...streams,...(sessionId && local?{[sessionId]:local}:{})});},[streams,local,sessionId]);
  const elements=useRef(new Map()),blockedIds=useRef(new Set());
  const register=useCallback((id,element)=>{if(element)elements.current.set(id,element);else elements.current.delete(id);},[]);
  const report=useCallback((id,error)=>{
    if(error?.name==='NotAllowedError')blockedIds.current.add(id);else blockedIds.current.delete(id);
    useHuddleAudioStore.getState().update({playbackBlocked:blockedIds.current.size>0,...(error && error.name!=='NotAllowedError'?{error:'Remote audio could not play. Retry audio.'}:{})});
  },[]);
  const play=()=>{for(const [id,element] of elements.current)element.play().then(()=>report(id,null)).catch(error=>report(id,error));};
  const entries=streams && Object.keys(streams).length?Object.entries(streams):stream?[['legacy',stream]]:[];
  return <>{entries.map(([id,remote])=><ParticipantAudio key={id} id={id} stream={remote} deafened={deafened} outputDeviceId={outputDeviceId} register={register} report={report}/>)}
    {blocked && entries.length>0 && <button onClick={play} style={{position:'fixed',bottom:24,right:24,zIndex:1000,padding:'10px 16px',background:'var(--bg-primary)',color:'var(--text-primary)',border:'1px solid var(--border-primary)',borderRadius:8}}>Enable Huddle audio</button>}
  </>;
}
