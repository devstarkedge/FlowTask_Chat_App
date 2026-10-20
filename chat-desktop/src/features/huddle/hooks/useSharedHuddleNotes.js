import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {sendHuddleRequest} from '../../../services/huddleRequest';
import {useHuddleStore} from '../../../stores/huddleStore';
import {getSharedNotesSession} from '../services/sharedNotes.service';

export function useSharedHuddleNotes({enabled,state,session}){
  const textarea=useRef(null),client=useRef(null),selection=useRef(null);
  const [notes,setNotes]=useState({value:state?.huddle?.notes || '',ready:false,error:'',pending:false});
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{
    if(!enabled || !session?.id)return;
    const current=getSharedNotesSession(session.id,{initialText:state?.huddle?.notes || '',request:async(action,payload)=>{
      if(useHuddleStore.getState().session?.id!==session.id)throw new Error('This Huddle has ended.');
      const result=await sendHuddleRequest(action,{channelId:session.channelId,...payload});
      if(useHuddleStore.getState().session?.id===session.id)useHuddleStore.getState().ingest(session.channelId,result.state);
      return result.state;
    }});
    client.current=current;
    current.getSelection=()=>document.activeElement===textarea.current?{start:textarea.current.selectionStart,end:textarea.current.selectionEnd}:null;
    current.restoreSelection=value=>{selection.current=value;};
    const unsubscribe=current.subscribe(setNotes);
    current.start().catch(()=>{});
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return()=>{unsubscribe();clearInterval(timer);current.stopTyping();current.getSelection=null;current.restoreSelection=null;client.current=null;};
  },[enabled,session?.id]);
  useEffect(()=>{if(enabled)client.current?.apply(state?.notesDocument);},[enabled,state?.notesDocument]);
  useLayoutEffect(()=>{
    if(selection.current && document.activeElement===textarea.current){textarea.current.setSelectionRange(selection.current.start,selection.current.end);}
    selection.current=null;
  },[notes.value]);
  const typing=[...new Set((state?.participants || []).filter(person=>person.id!==session?.id && person.connection==='connected' && Number.isFinite(person.notesTypingAt) && now-person.notesTypingAt<5000).map(person=>person.name || 'A participant'))];
  return {...notes,textarea,typing,edit:value=>client.current?.edit(value),stopTyping:()=>client.current?.stopTyping(),save:()=>client.current?.save(),reload:()=>client.current?.start()};
}
