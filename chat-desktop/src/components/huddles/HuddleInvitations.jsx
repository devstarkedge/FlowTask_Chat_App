import {useEffect,useState} from 'react';
import {Headphones,X} from 'lucide-react';
import {useHuddleUiStore} from '../../stores/huddleUiStore';
import {useHuddleStore} from '../../stores/huddleStore';
import {sendHuddleRequest} from '../../services/huddleRequest';
import './huddle.css';

export default function HuddleInvitations() {
  const invitations=useHuddleUiStore(s=>s.invitations),dismiss=useHuddleUiStore(s=>s.dismissInvitation);
  const [now,setNow]=useState(Date.now()),[joining,setJoining]=useState(null),[error,setError]=useState('');
  useEffect(()=>{if(!invitations.length)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[invitations]);
  const active=invitations.filter(item=>item.expiresAt>now).at(-1);
  if(!active)return null;
  const join=async()=>{
    setJoining(active.id);setError('');
    try {
      const state=await sendHuddleRequest('get',{channelId:active.channelId});
      if(!useHuddleUiStore.getState().invitations.some(item=>item.id===active.id))return;
      // Do not send the recipient into an ended/replaced meeting.
      if(String(state.huddle?._id)!==active.huddleId)throw new Error('This Huddle has ended.');
      if(!state.participants?.some(person=>person.audioReady && person.connection==='connected'))throw new Error('The caller has left this Huddle.');
      useHuddleStore.getState().ingest(active.channelId,state);
      useHuddleUiStore.getState().openPanel({channelId:active.channelId,workspaceId:active.workspaceId,label:active.label || 'Huddle'});
      dismiss(active.id);
    }catch(failure){setError(failure.message);}
    finally{setJoining(null);}
  };
  return <aside className="huddle-invitation" role="dialog" aria-label="Huddle invitation" aria-live="polite"><Headphones size={24}/><div><strong>{active.callerName} invited you to a Huddle</strong><p>{active.label || 'Join the conversation'}</p>{error && <p role="alert">{error}</p>}<button onClick={join} disabled={Boolean(joining)}>{joining?'Opening…':'Join Huddle'}</button><button onClick={()=>dismiss(active.id)}>Dismiss</button></div><button onClick={()=>dismiss(active.id)} aria-label="Dismiss invitation"><X size={17}/></button></aside>;
}
