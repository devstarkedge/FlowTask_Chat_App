import {useCallback,useEffect,useRef,useState} from 'react';
import {Headphones,X} from 'lucide-react';
import {useHuddleUiStore} from '../../stores/huddleUiStore';
import {useHuddleStore} from '../../stores/huddleStore';
import {sendHuddleRequest} from '../../services/huddleRequest';
import {HuddleRingtone} from '../../services/huddleRingtone';
import './huddle.css';

export default function HuddleInvitations() {
  const invitations=useHuddleUiStore(s=>s.invitations),dismiss=useHuddleUiStore(s=>s.dismissInvitation);
  const [now,setNow]=useState(Date.now()),[joining,setJoining]=useState(null),[error,setError]=useState(''),[soundBlocked,setSoundBlocked]=useState(false);
  const ringtone=useRef(null),pendingJoin=useRef(null);
  if(!ringtone.current)ringtone.current=new HuddleRingtone();
  useEffect(()=>{if(!invitations.length)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[invitations]);
  const active=invitations.filter(item=>item.expiresAt>now).at(-1);
  const join=useCallback(async id=>{
    const invitation=useHuddleUiStore.getState().invitations.find(item=>item.id===id && item.expiresAt>Date.now());
    if(!invitation || pendingJoin.current)return;
    pendingJoin.current=id;setJoining(id);setError('');ringtone.current.stop();
    try {
      const state=await sendHuddleRequest('get',{channelId:invitation.channelId});
      if(!useHuddleUiStore.getState().invitations.some(item=>item.id===id && item.expiresAt>Date.now()))return;
      if(String(state.huddle?._id)!==invitation.huddleId)throw new Error('This Huddle has ended.');
      if(!state.participants?.some(person=>person.audioReady && person.connection==='connected'))throw new Error('The caller has left this Huddle.');
      useHuddleStore.getState().ingest(invitation.channelId,state);
      useHuddleUiStore.getState().openPanel({channelId:invitation.channelId,workspaceId:invitation.workspaceId,label:invitation.label || 'Huddle'});
      dismiss(id);
    }catch(failure){if(useHuddleUiStore.getState().invitations.some(item=>item.id===id))setError(failure.message);}
    finally{pendingJoin.current=null;setJoining(null);}
  },[dismiss]);
  useEffect(()=>{
    if(!active)return;
    let live=true,checking=false;setError('');setSoundBlocked(false);
    ringtone.current.start(active.id).catch(()=>{if(live)setSoundBlocked(true);});
    const timer=setTimeout(()=>dismiss(active.id),Math.max(0,active.expiresAt-Date.now()));
    window.electronAPI?.showHuddleInvitation?.(active);
    // Recipients may be viewing another channel and miss its lifecycle broadcast.
    const check=setInterval(async()=>{
      if(checking || pendingJoin.current)return;
      checking=true;
      try {
        const snapshot=await sendHuddleRequest('get',{channelId:active.channelId});
        if(live)useHuddleUiStore.getState().reconcileInvitations(active.channelId,snapshot);
      }catch(failure){if(live && ['NOT_FOUND','FORBIDDEN','UNAUTHORIZED'].includes(failure.code))dismiss(active.id);}
      finally{checking=false;}
    },5000);
    return()=>{live=false;clearTimeout(timer);clearInterval(check);ringtone.current.stop();window.electronAPI?.closeHuddleInvitation?.(active.id);};
  },[active?.id,active?.expiresAt,dismiss]);
  useEffect(()=>window.electronAPI?.onHuddleInvitationAction?.(({id,action})=>{
    if(action==='join')join(id);else if(action==='dismiss')dismiss(id);
  }),[join,dismiss]);
  if(!active)return null;
  return <aside className="huddle-invitation" role="dialog" aria-label="Incoming Huddle call" aria-live="polite"><Headphones size={24}/><div><strong>{active.callerName} invited you to a Huddle</strong><p>{active.label || 'Join the conversation'}</p>{error && <p role="alert">{error}</p>}{soundBlocked && <p role="status"><button onClick={()=>ringtone.current.start(active.id).then(()=>setSoundBlocked(false)).catch(()=>{})}>Enable call sound</button></p>}<button onClick={()=>join(active.id)} disabled={Boolean(joining)}>{joining?'Opening…':'Join Huddle'}</button><button onClick={()=>dismiss(active.id)}>Dismiss</button></div><button onClick={()=>dismiss(active.id)} aria-label="Dismiss invitation"><X size={17}/></button></aside>;
}
