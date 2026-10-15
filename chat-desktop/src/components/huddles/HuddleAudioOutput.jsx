import {useEffect,useRef} from 'react';
import {useHuddleAudioStore} from '../../stores/huddleAudioStore';

// Mounted once above route changes so changing channels cannot silence a call.
export default function HuddleAudioOutput() {
  const ref=useRef(null);
  const stream=useHuddleAudioStore(state=>state.remoteStream);
  const deafened=useHuddleAudioStore(state=>state.deafened);
  const outputDeviceId=useHuddleAudioStore(state=>state.outputDeviceId);
  const blocked=useHuddleAudioStore(state=>state.playbackBlocked);
  const update=useHuddleAudioStore(state=>state.update);
  const play=async()=>{
    if(!ref.current || !stream)return;
    try {await ref.current.play();update({playbackBlocked:false});}
    catch(error){if(error.name==='NotAllowedError')update({playbackBlocked:true});else if(error.name!=='AbortError')update({error:'Remote audio could not play. Retry audio.'});}
  };
  useEffect(()=>{
    const element=ref.current;let disposed=false;
    if(typeof element.setSinkId==='function')element.setSinkId(outputDeviceId).catch(()=>{if(!disposed)update({error:'Could not use this speaker. Choose the default speaker and try again.'});});
    return ()=>{disposed=true;};
  },[outputDeviceId,update]);
  useEffect(()=>{
    const element=ref.current;let disposed=false;
    element.srcObject=stream || null;
    if(stream)element.play().then(()=>{if(!disposed)update({playbackBlocked:false});}).catch(error=>{
      if(disposed || error.name==='AbortError')return;
      if(error.name==='NotAllowedError')update({playbackBlocked:true});else update({error:'Remote audio could not play. Retry audio.'});
    });
    return ()=>{disposed=true;element.pause();element.srcObject=null;};
  },[stream,update]);
  return <><audio ref={ref} autoPlay playsInline muted={deafened} aria-label="Huddle remote audio"/>
    {blocked && stream && <button onClick={play} style={{position:'fixed',bottom:24,right:24,zIndex:1000,padding:'10px 16px',background:'var(--bg-primary)',color:'var(--text-primary)',border:'1px solid var(--border-primary)',borderRadius:8}}>Enable Huddle audio</button>}
  </>;
}
