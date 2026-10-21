import {screenShareViews} from '../../features/huddle/utils/screenShareViews';
import {createPortal} from 'react-dom';
import {huddlePeople} from '../../features/huddle/utils/huddlePeople';
import {useState} from 'react';
import {MonitorUp,Hand,Smile,NotebookPen} from 'lucide-react';
import {toggleHuddleScreen,updateHuddleFeature} from '../../services/huddleAudioService';
import {useSharedHuddleNotes} from '../../features/huddle/hooks/useSharedHuddleNotes';
import HuddleScreenStage from './HuddleScreenStage';

export default function HuddleTools({state,session,audio,controlsHost,screenFocused=true,onScreenFocus}) {
  const [notesOpen,setNotesOpen]=useState(false),[reactionsOpen,setReactionsOpen]=useState(false);
  const [saving,setSaving]=useState(false),[feedback,setFeedback]=useState('');
  const notes=useSharedHuddleNotes({enabled:notesOpen,state,session});
  const own=state?.participants.find(p=>p.id===session.id);
  const nativePresenter=Boolean(audio.localScreenShare && globalThis.electronAPI?.updateHuddleShare);
  const presenter=state?.participants.find(p=>p.id!==session.id && p.screenSharing);
  const share=audio.localScreenShare || screenShareViews(state,audio).find(value=>value.participantSessionId===presenter?.id);
  const stream=(!nativePresenter && audio.localScreenStream) || (presenter?(audio.remoteScreenStreams?.[presenter.id] || audio.remoteScreenStream):null);
  const perform=(action,payload)=>updateHuddleFeature(action,payload).catch(error=>setFeedback(error.message));
  const openNotes=()=>{setFeedback('');setNotesOpen(!notesOpen);};
  const save=async()=>{setSaving(true);setFeedback('');try {if(await notes.save())setFeedback('Notes saved');}catch(error){setFeedback(error.message);}finally{setSaving(false);}};
  const controls=(<div className="huddle-tools-bar">
      {!audio.localScreenShare && <button onClick={toggleHuddleScreen} disabled={audio.screenBusy || (!audio.localScreenStream && Boolean(presenter))} aria-pressed={Boolean(audio.localScreenStream)}><MonitorUp size={19}/>{audio.screenBusy?'Opening…':audio.localScreenStream?'Stop sharing':'Share screen'}</button>}
      <button onClick={()=>perform('hand',{raised:!own?.handRaised})} aria-pressed={Boolean(own?.handRaised)}><Hand size={19}/>{own?.handRaised?'Lower hand':'Raise hand'}</button>
      <button onClick={()=>setReactionsOpen(!reactionsOpen)} aria-expanded={reactionsOpen}><Smile size={19}/>React</button>
      <button onClick={openNotes} aria-expanded={notesOpen}><NotebookPen size={19}/>Notes</button>
    </div>);
  return <section className="huddle-tools">
    {nativePresenter && <p className="huddle-presenter-status" role="status">You’re sharing {audio.localScreenShare.sourceLabel}{audio.localScreenShare.state==='paused'?' · Paused':''}. Screen controls are in the floating source toolbar.</p>}
    {stream && <><button className="huddle-focus-share" onClick={()=>onScreenFocus?.(!screenFocused)}>{screenFocused?'Show participants':`View ${presenter?.name || 'shared'} screen`}</button><div className="huddle-share-focus-surface" hidden={!screenFocused}><p className="huddle-screen-label">{audio.localScreenStream?'You are':`${presenter?.name || 'Participant'} is`} sharing a screen</p><HuddleScreenStage stream={stream} local={Boolean(audio.localScreenStream)} controlsHost={controlsHost} share={share} busy={audio.screenBusy} presenterName={presenter?.name}/></div></>}
    {controlsHost?createPortal(controls,controlsHost):controls}
    {reactionsOpen && <div className="huddle-reactions" aria-label="Huddle reactions">{['👍','❤️','😂','🎉','👏','🙌'].map(emoji=><button key={emoji} aria-label={`React ${emoji}`} onClick={()=>{perform('reaction',{emoji});setReactionsOpen(false);}}>{emoji}</button>)}</div>}
    <div className="huddle-participant-signals" aria-live="polite">{huddlePeople(state?.participants,session?.id).map(p=><ParticipantSignal key={p.id} person={p}/>)}</div>
    {notesOpen && <div className="huddle-notes"><h3>Meeting notes</h3><p>Edits are shared live. Save notes to publish them in chat.</p><p role="status">{notes.error || (!notes.ready?'Connecting shared notes…':[notes.pending?'Syncing notes…':'',notes.typing.length?`${notes.typing.join(', ')} ${notes.typing.length===1?'is':'are'} typing…`:''].filter(Boolean).join(' ') || 'Everyone is up to date')}</p><textarea ref={notes.textarea} aria-label="Meeting notes" value={notes.value} disabled={!notes.ready} maxLength={10000} onChange={event=>notes.edit(event.target.value)} onBlur={notes.stopTyping} rows={7}/><div><button onClick={save} disabled={saving || !notes.ready}>{saving?'Saving…':'Save notes'}</button><button onClick={()=>notes.reload()?.catch(error=>setFeedback(error.message))}>Load latest</button></div></div>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}

function ParticipantSignal({person}) {
  if(!person.handRaised)return null;
  return <span>{person.name} ✋</span>;
}
