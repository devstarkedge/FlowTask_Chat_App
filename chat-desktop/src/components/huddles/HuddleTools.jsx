import {useEffect,useRef,useState} from 'react';
import {MonitorUp,Hand,Smile,NotebookPen} from 'lucide-react';
import {toggleHuddleScreen,updateHuddleFeature} from '../../services/huddleAudioService';

function Screen({stream}) {
  const ref=useRef(null),[blocked,setBlocked]=useState(false);
  useEffect(()=>{const video=ref.current;video.srcObject=stream;video.play().catch(()=>setBlocked(true));return()=>{video.srcObject=null;};},[stream]);
  return <div className="huddle-screen-stage"><video ref={ref} autoPlay muted playsInline/>{blocked && <button onClick={()=>ref.current.play().then(()=>setBlocked(false)).catch(()=>{})}>Show shared screen</button>}</div>;
}

export default function HuddleTools({state,session,audio}) {
  const [notesOpen,setNotesOpen]=useState(false),[reactionsOpen,setReactionsOpen]=useState(false);
  const [draft,setDraft]=useState(''),[version,setVersion]=useState(0),[saving,setSaving]=useState(false),[feedback,setFeedback]=useState('');
  const own=state?.participants.find(p=>p.id===session.id);
  const presenter=state?.participants.find(p=>p.screenSharing);
  const stream=audio.localScreenStream || (presenter?audio.remoteScreenStream:null);
  const perform=(action,payload)=>updateHuddleFeature(action,payload).catch(error=>setFeedback(error.message));
  const openNotes=()=>{if(!notesOpen){setDraft(state?.huddle?.notes || '');setVersion(state?.huddle?.notesVersion || 0);setFeedback('');}setNotesOpen(!notesOpen);};
  const save=async()=>{setSaving(true);setFeedback('');try {const result=await updateHuddleFeature('notes',{text:draft,version});if(result){setVersion(result.huddle.notesVersion);setFeedback('Notes saved');}}catch(error){setFeedback(error.message);}finally{setSaving(false);}};
  return <section className="huddle-tools">
    {stream && <><p className="huddle-screen-label">{audio.localScreenStream?'You are':`${presenter?.name || 'Participant'} is`} sharing a screen</p><Screen stream={stream}/></>}
    <div className="huddle-tools-bar">
      <button onClick={toggleHuddleScreen} disabled={audio.screenBusy || (!audio.localScreenStream && Boolean(presenter))} aria-pressed={Boolean(audio.localScreenStream)}><MonitorUp size={19}/>{audio.screenBusy?'Opening…':audio.localScreenStream?'Stop sharing':'Share screen'}</button>
      <button onClick={()=>perform('hand',{raised:!own?.handRaised})} aria-pressed={Boolean(own?.handRaised)}><Hand size={19}/>{own?.handRaised?'Lower hand':'Raise hand'}</button>
      <button onClick={()=>setReactionsOpen(!reactionsOpen)} aria-expanded={reactionsOpen}><Smile size={19}/>React</button>
      <button onClick={openNotes} aria-expanded={notesOpen}><NotebookPen size={19}/>Notes</button>
    </div>
    {reactionsOpen && <div className="huddle-reactions" aria-label="Huddle reactions">{['👍','❤️','😂','🎉','👏','🙌'].map(emoji=><button key={emoji} aria-label={`React ${emoji}`} onClick={()=>{perform('reaction',{emoji});setReactionsOpen(false);}}>{emoji}</button>)}</div>}
    <div className="huddle-participant-signals" aria-live="polite">{state?.participants.map(p=><ParticipantSignal key={p.id} person={p}/>)}</div>
    {notesOpen && <div className="huddle-notes"><h3>Meeting notes</h3><p>Shared with this conversation. Save notes to publish them in chat immediately.</p><textarea aria-label="Meeting notes" value={draft} maxLength={10000} onChange={event=>setDraft(event.target.value)} rows={7}/><div><button onClick={save} disabled={saving}>{saving?'Saving…':'Save notes'}</button><button onClick={()=>{setDraft(state?.huddle?.notes || '');setVersion(state?.huddle?.notesVersion || 0);setFeedback('Latest notes loaded');}}>Load latest</button></div></div>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}

function ParticipantSignal({person}) {
  if(!person.handRaised)return null;
  return <span>{person.name} ✋</span>;
}
