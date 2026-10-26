import {screenShareViews} from '../../features/huddle/utils/screenShareViews';
import {createPortal} from 'react-dom';
import {huddlePeople} from '../../features/huddle/utils/huddlePeople';
import {useEffect,useRef,useState} from 'react';
import {MonitorUp,Hand,Smile,NotebookPen,X} from 'lucide-react';
import {toggleHuddleScreen,updateHuddleFeature} from '../../services/huddleAudioService';
import {useSharedHuddleNotes} from '../../features/huddle/hooks/useSharedHuddleNotes';
import HuddleScreenStage from './HuddleScreenStage';

export default function HuddleTools({state,session,audio,controlsHost,notesHost,screenFocused=true,onScreenFocus}) {
  const [notesOpen,setNotesOpen]=useState(false),[reactionsOpen,setReactionsOpen]=useState(false);
  const [saving,setSaving]=useState(false),[feedback,setFeedback]=useState('');
  const notesPanel=useRef(null),notesButton=useRef(null);
  useEffect(()=>{
    if(!notesOpen)return;
    const dismiss=event=>{
      if(notesPanel.current?.contains(event.target) || notesButton.current?.contains(event.target))return;
      setNotesOpen(false);
    };
    const documents=new Set([notesPanel.current?.ownerDocument,notesButton.current?.ownerDocument].filter(Boolean));
    for(const doc of documents)doc.addEventListener('pointerdown',dismiss,true);
    return()=>{for(const doc of documents)doc.removeEventListener('pointerdown',dismiss,true);};
  },[notesOpen,controlsHost,notesHost]);
  const notes=useSharedHuddleNotes({enabled:notesOpen,state,session});
  const own=state?.participants.find(p=>p.id===session.id);
  const nativePresenter=Boolean(audio.localScreenShare && globalThis.electronAPI?.updateHuddleShare);
  const shares=screenShareViews(state,audio,session.id),share=shares.find(value=>value.isLocal) || shares[0];
  const presenter=state?.participants.find(p=>p.screenSharing && p.id!==session.id);
  const stream=share?.stream;
  const perform=(action,payload)=>updateHuddleFeature(action,payload).catch(error=>setFeedback(error.message));
  const openNotes=()=>{setFeedback('');setNotesOpen(!notesOpen);};
  const save=async()=>{setSaving(true);setFeedback('');try {if(await notes.save())setFeedback('Notes saved');}catch(error){setFeedback(error.message);}finally{setSaving(false);}};
  const controls=(<div className="huddle-tools-bar">
      {!audio.localScreenShare && <button onClick={toggleHuddleScreen} disabled={audio.screenBusy || (!audio.localScreenStream && Boolean(presenter))} aria-pressed={Boolean(audio.localScreenStream)}><MonitorUp size={19}/>{audio.screenBusy?'Opening…':audio.localScreenStream?'Stop sharing':'Share screen'}</button>}
      <button onClick={()=>perform('hand',{raised:!own?.handRaised})} aria-pressed={Boolean(own?.handRaised)}><Hand size={19}/>{own?.handRaised?'Lower hand':'Raise hand'}</button>
      <button onClick={()=>setReactionsOpen(!reactionsOpen)} aria-expanded={reactionsOpen}><Smile size={19}/>React</button>
      <button ref={notesButton} onClick={openNotes} aria-expanded={notesOpen}><NotebookPen size={19}/>Notes</button>
    </div>);
  return <section className="huddle-tools">
    {nativePresenter && <p className="huddle-presenter-status" role="status">You’re sharing {audio.localScreenShare.sourceLabel}{audio.localScreenShare.state==='paused'?' · Paused':''}. Screen controls are in the floating source toolbar.</p>}
    {share && <><button className="huddle-focus-share" onClick={()=>onScreenFocus?.(!screenFocused)}>{screenFocused?'Show participants':`View ${share.isLocal?'your':share.presenterName || 'shared'} screen`}</button><div className="huddle-share-focus-surface" hidden={!screenFocused}><p className="huddle-screen-label">{share.isLocal?'You are':`${share.presenterName || 'Participant'} is`} sharing · {share.sourceLabel}</p>{stream?<HuddleScreenStage stream={stream} local={share.isLocal} controlsHost={controlsHost} share={share} busy={audio.screenBusy} presenterName={share.presenterName}/>:<p role="status">Connecting shared screen…</p>}</div></>}
    {controlsHost?createPortal(controls,controlsHost):controls}
    {reactionsOpen && <div className="huddle-reactions" aria-label="Huddle reactions">{['👍','❤️','😂','🎉','👏','🙌'].map(emoji=><button key={emoji} aria-label={`React ${emoji}`} onClick={()=>{perform('reaction',{emoji});setReactionsOpen(false);}}>{emoji}</button>)}</div>}
    <div className="huddle-participant-signals" aria-live="polite">{huddlePeople(state?.participants,session?.id).map(p=><ParticipantSignal key={p.id} person={p}/>)}</div>
    {notesOpen && (()=>{const panel=<section ref={notesPanel} className="huddle-notes" aria-label="Meeting notes panel"><header className="huddle-notes-heading"><h3>Meeting notes</h3><button type="button" onClick={()=>setNotesOpen(false)} aria-label="Close meeting notes"><X size={18}/></button></header><p>Edits are shared live. Save notes to publish them in chat.</p><p className="huddle-notes-status" role="status">{notes.error || (!notes.ready?'Connecting shared notes…':[notes.pending?'Syncing notes…':'',notes.typing.length?`${notes.typing.join(', ')} ${notes.typing.length===1?'is':'are'} typing…`:''].filter(Boolean).join(' ') || 'Everyone is up to date')}</p><textarea ref={notes.textarea} aria-label="Meeting notes" value={notes.value} disabled={!notes.ready} maxLength={10000} onChange={event=>notes.edit(event.target.value)} onBlur={notes.stopTyping} rows={7}/><div className="huddle-notes-actions"><button onClick={save} disabled={saving || !notes.ready}>{saving?'Saving…':'Save notes'}</button></div></section>;return notesHost?createPortal(panel,notesHost):panel;})()}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}

function ParticipantSignal({person}) {
  if(!person.handRaised)return null;
  return <span>{person.name} ✋</span>;
}
