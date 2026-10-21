import {useEffect,useRef,useState} from 'react';
import {Headphones,ChevronDown,Link,Check} from 'lucide-react';
import {useHuddleUiStore} from '../../stores/huddleUiStore';
import {useHuddleStore} from '../../stores/huddleStore';
import {meetingUrl} from './HuddleMeetingLink';
import './huddle.css';

export default function HuddleHeaderMenu({channelId,label,workspaceId}) {
  const [open,setOpen]=useState(false),[copied,setCopied]=useState(false),[error,setError]=useState(null);
  const ref=useRef(null),trigger=useRef(null);
  const active=useHuddleStore(s=>s.byChannel[channelId]?.huddle);
  const joined=useHuddleStore(s=>s.session?.channelId===channelId);
  const openPanel=useHuddleUiStore(s=>s.openPanel);
  useEffect(()=>{
    if(!open)return;
    const dismiss=event=>{if(!ref.current?.contains(event.target))setOpen(false);};
    const escape=event=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[open]);
  const show=()=>{openPanel({channelId,label,workspaceId,returnFocus:trigger.current});setOpen(false);};
  const copy=async()=>{
    try {
      await navigator.clipboard.writeText(meetingUrl(workspaceId,channelId));setCopied(true);setError(null);
    }catch {setError('Could not copy the link. Please allow clipboard access and try again.');}
  };
  return <div className="huddle-header-menu" ref={ref}>
    <button ref={trigger} className={`huddle-header-trigger${active?' is-active':''}`} onClick={()=>{setOpen(!open);setCopied(false);setError(null);}} aria-label="Huddle options" aria-haspopup="menu" aria-expanded={open} disabled={!channelId} title="Huddle options"><Headphones size={19}/><ChevronDown size={13}/></button>
    {open && <div className="huddle-header-dropdown" role="menu" aria-label="Huddle actions">
      <button role="menuitem" onClick={show}><Headphones size={17}/>{joined?'Open Huddle':active?'Join Huddle':'Start Huddle'}</button>
      <button role="menuitem" onClick={copy} disabled={!workspaceId}>{copied?<Check size={17}/>:<Link size={17}/>} {copied?'Link copied':'Copy huddle link'}</button>
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
