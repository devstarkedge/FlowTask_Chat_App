import {huddlePeople} from '../../features/huddle/utils/huddlePeople';
import {screenShareViews} from '../../features/huddle/utils/screenShareViews';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useHuddlePopout} from '../../features/huddle/hooks/useHuddlePopout';
import {useLocation} from 'react-router-dom';
import {Headphones,Mic,MicOff,Volume2,VolumeX,Video,VideoOff,ChevronDown,Minus,X,AlertTriangle,PhoneOff,Maximize2,Minimize2,LoaderCircle,Hand} from 'lucide-react';
import {useHuddleUiStore} from '../../stores/huddleUiStore';
import {useHuddle} from '../../features/huddle';
import {useHuddleDevices} from '../../features/huddle/hooks/useHuddleDevices';
import {useAuthStore} from '../../stores/authStore';
import {useChatStore} from '../../stores/chatStore';
import {useChannelStore} from '../../stores/channelStore';
import {toggleHuddleScreen,switchHuddleScreen} from '../../services/huddleAudioService';
import './huddle.css';
import './huddle-redesign.css';
import './huddle-presentation.css';
import HuddleTools from './HuddleTools';
import HuddleReactions from './HuddleReactions';
import HuddleMeetingLink from './HuddleMeetingLink';

function CameraVideo({stream,self}) {
  const ref=useRef(null);
  useEffect(()=>{const video=ref.current;video.srcObject=stream;video.play().catch(()=>{});return()=>{video.pause();video.srcObject=null;};},[stream]);
  return <video ref={ref} autoPlay playsInline muted={self} className="huddle-camera-video" aria-label={self?'Your camera':'Participant camera'}/>;
}
function ParticipantTile({name,avatar,muted,self,camera,speaking,handRaised}) {
  const [failed,setFailed]=useState(false);
  const url=typeof avatar==='string'?avatar:avatar?.url;
  useEffect(()=>setFailed(false),[url]);
  return <div className={`huddle-participant-tile${url && !failed?' has-photo':''}${camera?' has-camera':''}${speaking && !muted?' is-speaking':''}`}>
    {camera?<CameraVideo stream={camera} self={self}/>:url && !failed?<img src={url} alt={name} onError={()=>setFailed(true)}/>:<span className="huddle-avatar-letter">{(name || '?').trim().slice(0,1).toUpperCase()}</span>}
    {handRaised && <span className="huddle-participant-hand" role="img" aria-label={`${name || 'Participant'} has raised a hand`} title={`${name || 'Participant'} has raised a hand`}><Hand size={16} aria-hidden="true"/></span>}
    <span className="huddle-participant-name">{name}{self?' (you)':''}</span>
    <div className="huddle-preview-icons"><span>{muted?<MicOff size={18}/>:<Mic size={18}/>}</span><span title={camera?"Camera is on":"Camera is off"}>{camera?<Video size={18}/>:<VideoOff size={18}/>}</span></div>
  </div>;
}

export default function HuddleWindow() {
  const panel=useHuddleUiStore(s=>s.panel),openPanel=useHuddleUiStore(s=>s.openPanel),closePanel=useHuddleUiStore(s=>s.closePanel);
  const {session,busy,error,state,startHuddle,joinHuddle,leaveHuddle,endHuddle,load,audio,toggleMute:toggleHuddleMute,toggleCamera:toggleHuddleCamera,retryAudio:retryHuddleAudio}=useHuddle(panel?.channelId);
  const user=useAuthStore(s=>s.user),status=useChatStore(s=>s.connectionStatus);
  const channels=useChannelStore(s=>s.channels);
  const location=useLocation(),dialog=useRef(null);
  const [maximized,setMaximized]=useState(false);
  const [sharingFooter,setSharingFooter]=useState(null),[screenFocused,setScreenFocused]=useState(true);
  const popout=useHuddlePopout({panel:user?panel:null,session:user?session:null,closePanel});
  const {devices,permission,sinkSupported}=useHuddleDevices(Boolean(panel && user),`${panel?.channelId}:${user?._id}:${status}`);
  const [settingsHelp,setSettingsHelp]=useState(false),[microphoneHelp,setMicrophoneHelp]=useState(false),[now,setNow]=useState(Date.now());
  const joined=Boolean(panel && session?.channelId===panel.channelId);
  const shareKey=screenShareViews(state,audio,session?.id).filter(share=>share.stream?.getVideoTracks?.().some(track=>track.readyState==='live')).map(share=>share.id).join('|');
  useEffect(()=>{setScreenFocused(true);},[shareKey]);
  const sharing=screenFocused && joined && Boolean(shareKey);
  const beforeSharingSize=useRef(null);
  useEffect(()=>{
    if(sharing && beforeSharingSize.current===null){beforeSharingSize.current=maximized;setMaximized(true);}
    else if(!sharing && beforeSharingSize.current!==null){const previous=beforeSharingSize.current;beforeSharingSize.current=null;setMaximized(previous);}
  },[sharing,maximized]);
  const reconnecting=joined && Boolean(audio.reconnectDeadline);
  useEffect(()=>{
    if(!user || new URLSearchParams(location.search).get('huddle')!=='1')return;
    const match=location.pathname.match(/^\/workspace\/([^/]+)\/channel\/([^/]+)\/?$/);
    if(match)openPanel({workspaceId:match[1],channelId:match[2],label:'Channel'});
  },[location.pathname,location.search,user?._id,openPanel]);
  useEffect(()=>{
    if(!panel || !user)return;
    setSettingsHelp(false);setMicrophoneHelp(false);if(!popout.document)dialog.current?.focus();
    if(status==='connected')load(panel.channelId);
    const owner=popout.document || document;
    const escape=event=>{if(event.key==='Escape' && !owner.fullscreenElement){event.preventDefault();closePanel();}};
    owner.addEventListener('keydown',escape);
    return ()=>owner.removeEventListener('keydown',escape);
  },[panel?.channelId,user?._id,status,load,closePanel,popout.document]);
  useEffect(()=>{if(!joined)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[joined]);
  if(!user)return null;
  if(!panel) {
    if(!session)return null;
    const channel=channels.find(c=>c._id===session.channelId);
    return <button className="huddle-minimized" onClick={()=>openPanel({channelId:session.channelId,label:channel?.name || 'Huddle',workspaceId:channel?.workspaceId})}>{audio.reconnectDeadline?<LoaderCircle size={18} className="huddle-reconnect-spinner"/>:<Headphones size={18}/>} {audio.reconnectDeadline?'Reconnecting…':'Open Huddle'}</button>;
  }
  const channel=channels.find(c=>c._id===panel.channelId);
  const label=panel.label==='Channel'?(channel?.name || panel.label):panel.label || channel?.name || 'Huddle';
  const otherSession=session && !joined;
  const failure=error || audio.error;
  const denied=!(joined?audio.withoutMicrophone:audio.joinWithoutMicrophone) && (permission==='denied' || /microphone.*(?:denied|access)/i.test(failure || ''));
  const people=joined?huddlePeople(state?.participants,session?.id):[{id:'preview',userId:user._id,name:user.name || 'You',avatar:user.avatar}];
  const muted=joined?audio.muted:audio.joinWithoutMicrophone || audio.startMuted;
  const elapsed=Math.max(0,Math.floor((now-new Date(state?.huddle?.startedAt || now).getTime())/1000));
  const duration=`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
  const inputs=devices.filter(d=>d.kind==='audioinput' && d.deviceId && d.deviceId!=='default'),outputs=devices.filter(d=>d.kind==='audiooutput' && d.deviceId && d.deviceId!=='default');
  const audioStatus={connected:'Audio connected',waiting:'Waiting for someone to join',connecting:'Connecting audio…',reconnecting:'Reconnecting audio…',preparing:'Preparing audio…','requesting-microphone':'Waiting for microphone permission',failed:'Audio connection needs attention',idle:'Audio is off'}[audio.connection] || 'Connecting audio…';
  const deviceControls=(<div className="huddle-device-row">
          <div className="huddle-device-control"><button aria-label={muted?'Unmute microphone':'Mute microphone'} onClick={()=>{if(!joined && (audio.joinWithoutMicrophone || (muted && permission==='denied'))){setMicrophoneHelp(true);return;}if(joined)toggleHuddleMute();else audio.update({startMuted:!audio.startMuted});}} disabled={busy || audio.micBusy || reconnecting} title={muted?'Unmute microphone':'Mute microphone'}>{muted?<MicOff size={18}/>:<Mic size={18}/>}</button><select aria-label="Microphone device" value={audio.inputDeviceId} onChange={event=>audio.update({inputDeviceId:event.target.value})} disabled={joined || busy || audio.joinWithoutMicrophone} title={joined?'Leave the Huddle to change microphone':'Choose microphone'}><option value="">Default mic</option>{inputs.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index+1}`}</option>)}</select></div>
          <div className="huddle-device-control"><button aria-label={audio.deafened?'Enable speaker':'Deafen speaker'} onClick={audio.toggleDeafen} title={audio.deafened?'Enable speaker':'Deafen speaker'}>{audio.deafened?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><select aria-label="Speaker device" value={audio.outputDeviceId} onChange={event=>audio.update({outputDeviceId:event.target.value})} disabled={!sinkSupported} title={!sinkSupported?'This browser uses your system speaker':'Choose speaker'}><option value="">Default speaker</option>{outputs.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{device.label || `Speaker ${index+1}`}</option>)}</select></div>
          <button className="huddle-camera-control" onClick={toggleHuddleCamera} disabled={!joined || busy || audio.cameraBusy || (reconnecting && !audio.localCameraStream)} aria-label={audio.localCameraStream?'Turn camera off':'Turn camera on'} aria-pressed={Boolean(audio.localCameraStream)} title={joined?'Toggle camera':'Join the Huddle to turn on your camera'}>{audio.localCameraStream?<Video size={18}/>:<VideoOff size={18}/>}<span>{audio.cameraBusy?'Opening…':audio.localCameraStream?'Camera on':'Camera off'}</span></button>
        </div>);
  const content=<aside ref={dialog} className={`huddle-window${joined?' is-live':''}${joined && people.length<=2?' is-small-call':''}${maximized?' is-maximized':''}${sharing?' is-sharing':''}`} role="dialog" aria-modal="false" aria-labelledby="huddle-window-title" tabIndex={-1}>
    <header className="huddle-window-chrome"><Headphones size={17}/><span>{label}</span><button onClick={popout.minimize} aria-label="Minimize Huddle"><Minus size={17}/></button><button onClick={()=>{if(popout.host)popout.maximize()?.then(result=>{if(result?.ok)setMaximized(result.maximized);}).catch(()=>{});else setMaximized(value=>!value);}} aria-label={maximized?'Restore Huddle':'Maximize Huddle'} aria-pressed={maximized}>{maximized?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button><button onClick={closePanel} aria-label="Close Huddle window"><X size={18}/></button></header>
    <div className="huddle-window-content">
      {reconnecting && <div className="huddle-reconnecting" role="status" aria-live="polite"><LoaderCircle className="huddle-reconnect-spinner" size={22}/><div><strong>Reconnecting…</strong><p>Waiting for the network. The call will close if it cannot reconnect within 5 minutes.</p><span>{Math.max(0,Math.ceil((audio.reconnectDeadline-now)/1000))} seconds remaining</span></div></div>}
      {denied && <div className="huddle-warning huddle-warning--mic" role="alert"><AlertTriangle size={18}/><div><strong>Allow microphone access</strong><p>Allow TaskChat to use your headset microphone or computer's built-in microphone in your browser and device settings, then try again. Connecting headphones does not change a blocked permission.</p><button onClick={()=>setSettingsHelp(!settingsHelp)}>Microphone settings</button>{settingsHelp && <p>Browser: open this site's permissions and allow Microphone. Desktop: open your device's privacy settings, enable microphone access for TaskChat, then reopen the app if needed.</p>}</div></div>}
      {microphoneHelp && <div className="huddle-warning huddle-warning--notice" role="status"><Headphones size={18}/><div><strong>Connect your microphone</strong><p>Connect headphones or a headset with a microphone. On a laptop, you can also use the computer's built-in microphone. Earphones without a microphone only play sound.</p><p>{joined?'Click Unmute microphone to enable your headset or computer microphone without leaving.':'Uncheck Join without microphone and choose your headset or computer input under Microphone device, then start or join.'}</p><button onClick={()=>setSettingsHelp(!settingsHelp)}>Microphone settings</button>{settingsHelp && !denied && <p>Browser: allow Microphone in this site's permissions. Computer: open microphone privacy settings and allow TaskChat, then check your sound input settings to select the headset or built-in microphone.</p>}<button onClick={()=>setMicrophoneHelp(false)}>Dismiss</button></div></div>}
      {failure && !denied && <div className="huddle-warning huddle-warning--notice" role="alert"><AlertTriangle size={18}/><div><strong>Huddle needs attention</strong><p>{failure}</p></div></div>}
      {!joined && <div className="huddle-camera-note"><VideoOff size={17}/><span>Your camera stays off until you turn it on during the Huddle.</span></div>}
      {!joined && <label className="huddle-camera-note"><input type="checkbox" checked={Boolean(audio.joinWithoutMicrophone)} disabled={busy} onChange={event=>audio.update({joinWithoutMicrophone:event.target.checked})}/>Join without microphone — listen and share your screen</label>}
      <div className="huddle-heading"><span className="huddle-eyebrow">{joined?'YOUR HUDDLE':'READY WHEN YOU ARE'}</span><h2 id="huddle-window-title">{joined?'Huddle in':state?.huddle?'Join huddle with':'Start huddle with'} <strong>{label}</strong></h2><p>{joined?`${people.length} ${people.length===1?'person':'people'} here · Camera ${audio.localCameraStream?'on':'off'}`:'A little room for a conversation. Join when you’re ready.'}</p></div>
      {joined && audio.screenError && <div className="huddle-capture-alert" role="alert"><AlertTriangle size={16}/><span><strong>Screen sharing {audio.localScreenShare?'needs attention':"couldn’t start"}</strong><span>{audio.screenError.message}</span></span><button onClick={()=>audio.localScreenShare?switchHuddleScreen():toggleHuddleScreen()} disabled={audio.screenBusy}>Retry screen sharing</button><button onClick={()=>audio.update({screenError:null})} aria-label="Dismiss screen sharing error"><X size={16}/></button></div>}
      {joined && audio.withoutMicrophone && <details className="huddle-listener-note"><summary><MicOff size={14}/>You’re listening without a microphone <span>How to speak</span></summary><p>Click Unmute microphone to allow your headset or computer microphone and speak without leaving the Huddle.</p></details>}
      <div className="huddle-call-layout">
      <div className="huddle-preview-card">
        <div className={`huddle-participant-grid${people.length>1?' has-peers':''}`}>
          {people.map(person=><ParticipantTile key={person.id} handRaised={person.handRaised} speaking={audio.speakingSessions?.[person.id]} name={person.name} avatar={person.avatar} self={person.id===session?.id || (!joined && String(person.userId)===String(user._id))} muted={person.id===session?.id || !joined?muted:person.muted} camera={person.id===session?.id?audio.localCameraStream:person.cameraOn?audio.remoteCameraStreams?.[person.id]:null}/>) }
        </div>
        {sharing && sharingFooter?createPortal(deviceControls,sharingFooter):deviceControls}
      </div>
      {joined && <div className="huddle-call-status" role="status"><span className={`huddle-status-dot${audio.connection==='connected'?' is-connected':''}`}/>{audioStatus}<span>{duration}</span></div>}
      {joined && <HuddleTools key={session.id} state={state} session={session} audio={audio} controlsHost={sharing?sharingFooter:null} screenFocused={screenFocused} onScreenFocus={setScreenFocused}/>}
      </div>
      {joined && <HuddleMeetingLink channelId={panel.channelId} workspaceId={panel.workspaceId || state?.huddle?.workspaceId || channel?.workspaceId}/>}
      {joined && audio.invitation && <p className="huddle-connection-note" role="status">{audio.invitation.error || (audio.invitation.sent?`Invitation sent to ${audio.invitation.sent} online participant(s).`:'No available participants were notified. Share the meeting link to join.')}</p>}
      {joined && (['failed','idle'].includes(audio.connection) || audio.failedPeerIds?.length>0) && <button className="huddle-retry" onClick={retryHuddleAudio} disabled={busy || status!=='connected'}>Retry audio</button>}
      {otherSession && <div className="huddle-warning huddle-warning--notice"><Headphones size={18}/><div><strong>You're already in another Huddle</strong><button disabled={busy} onClick={leaveHuddle}>Leave current Huddle</button></div></div>}
      {status!=='connected' && !joined && <p className="huddle-connection-note" role="status">Reconnect to TaskChat to start or join a Huddle.</p>}
    </div>
    {joined && <HuddleReactions key={session.id} participants={state?.participants || []}/>}
    <footer className="huddle-window-footer">
      {sharing && <div className="huddle-sharing-footer" ref={setSharingFooter}/> }
      {!joined && <button className="huddle-footer-action" onClick={closePanel} disabled={busy}><span className="huddle-action-icon huddle-action-cancel"><X size={23}/></span><span>Cancel</span></button>}
      <button className="huddle-footer-action huddle-primary-action" disabled={busy || (!joined && status!=='connected') || Boolean(otherSession)} onClick={()=>joined?leaveHuddle():state?.huddle?joinHuddle({conversationId:panel.channelId}):startHuddle({conversationId:panel.channelId})}><span className={`huddle-action-icon${joined?' huddle-action-leave':''}`}>{joined?<PhoneOff size={23}/>:<Headphones size={24}/>}</span><span>{busy?'Connecting…':joined?'Leave Huddle':state?.huddle?'Join Huddle':'Start Huddle'}</span></button>
      {joined && String(state?.huddle?.startedBy)===String(user._id) && <button className="huddle-end-action" onClick={endHuddle} disabled={busy}>End for everyone</button>}
    </footer>
  </aside>;
  return popout.host?<>{createPortal(content,popout.host)}<button className="huddle-minimized" onClick={popout.restore}><Headphones size={18}/>Open Huddle</button></>:content;
}
