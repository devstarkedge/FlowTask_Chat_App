import {useEffect,useRef,useState} from 'react';
import {openHuddlePopout} from '../services/huddlePopout.service';

export function useHuddlePopout({panel,session,closePanel}) {
  const record=useRef(null),previousPanel=useRef(panel),wasJoined=useRef(false),closedAction=useRef(closePanel);
  closedAction.current=closePanel;
  const [host,setHost]=useState(null);
  const control=action=>globalThis.electronAPI?.controlHuddleWindow?.(action);
  const close=()=>{record.current?.close();record.current=null;setHost(null);};
  useEffect(()=>{
    if(!panel || (wasJoined.current && !session))close();
    else if(record.current && previousPanel.current!==panel)control('restore')?.catch(()=>{});
    previousPanel.current=panel;wasJoined.current=Boolean(session);
  },[panel,session]);
  useEffect(()=>()=>{record.current?.close();record.current=null;},[]);
  useEffect(()=>{
    if(!host)return;
    // The portal must commit its content before the native thumbnail is captured.
    const current=record.current;
    control('minimize')?.then(result=>{if(!result?.ok && record.current===current)close();}).catch(()=>{if(record.current===current)close();});
  },[host]);
  const minimize=()=>{
    if(!globalThis.electronAPI?.controlHuddleWindow){closePanel();return;}
    if(!record.current) {
      const created=openHuddlePopout({label:panel?.label,onClosed:()=>{record.current=null;setHost(null);closedAction.current();}});
      if(!created){closePanel();return;}
      record.current=created;setHost(created.host);return;
    }
    control('minimize')?.then(result=>{if(!result?.ok)close();}).catch(close);
  };
  const restore=()=>control('restore')?.catch(()=>{});
  const maximize=()=>control('maximize');
  return {host,document:record.current?.document,minimize,restore,maximize};
}
