import {useEffect,useState} from 'react';

// Device metadata/permission observation never requests microphone capture.
export function useHuddleDevices(enabled,scope) {
  const [devices,setDevices]=useState([]),[permission,setPermission]=useState('unknown');
  useEffect(()=>{
    if(!enabled)return;
    let disposed=false,permissionStatus;
    setPermission('unknown');
    const refresh=async()=>{
      try {const list=await navigator.mediaDevices?.enumerateDevices?.();if(!disposed)setDevices(list || []);}
      catch {if(!disposed)setDevices([]);}
    };
    refresh();navigator.mediaDevices?.addEventListener?.('devicechange',refresh);
    navigator.permissions?.query?.({name:'microphone'}).then(result=>{
      if(disposed)return;
      permissionStatus=result;setPermission(result.state);
      result.onchange=()=>{if(!disposed)setPermission(result.state);};
    }).catch(()=>{if(!disposed)setPermission('unknown');});
    return ()=>{
      disposed=true;if(permissionStatus)permissionStatus.onchange=null;
      navigator.mediaDevices?.removeEventListener?.('devicechange',refresh);
    };
  },[enabled,scope]);
  return {devices,permission,sinkSupported:typeof globalThis.HTMLMediaElement?.prototype?.setSinkId==='function'};
}
