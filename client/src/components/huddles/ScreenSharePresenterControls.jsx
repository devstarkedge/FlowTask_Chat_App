import {useState} from 'react';
import {pauseHuddleScreen,switchHuddleScreen,stopHuddleScreen,sendScreenAnnotation} from '../../services/huddleAudioService';
import {screenAnnotations} from '../../features/huddle/services/screenAnnotations.service';

// Browser fallback belongs to the share surface. Desktop uses the native source
// toolbar and never renders a second complete presenter toolbar here.
export default function ScreenSharePresenterControls({share,busy,tool,setTool,color,setColor}){
  const [error,setError]=useState('');
  const action=type=>{const event={id:crypto.randomUUID(),shareId:share.id,creatorSessionId:share.participantSessionId,type};screenAnnotations.receive(event);sendScreenAnnotation(event).catch(e=>setError(e.message));};
  return <div className="huddle-web-presenter" role="toolbar" aria-label="Screen presentation controls">
    <span>{share.sourceLabel} · {share.state==='paused'?'Paused':'Sharing'}</span>
    <button onClick={pauseHuddleScreen} disabled={busy}>{share.state==='paused'?'Resume':'Pause'}</button>
    <button onClick={switchHuddleScreen} disabled={busy}>Switch source</button>
    {['pointer','pen','eraser'].map(value=><button key={value} aria-pressed={tool===value} onClick={()=>setTool(value)}>{value==='pen'?'Pencil':value==='eraser'?'Eraser':'Pointer'}</button>)}
    <input type="color" aria-label="Drawing color" value={color} onChange={e=>setColor(e.target.value)}/>
    <button onClick={()=>action('undo')}>Undo</button><button onClick={()=>action('clear')}>Clear</button>
    {share.audioAvailable && <span>System audio {share.systemAudio?'on':'off'}</span>}
    <button onClick={()=>stopHuddleScreen('user_stop')}>Stop sharing</button>{error && <span role="status">{error}</span>}
  </div>;
}
