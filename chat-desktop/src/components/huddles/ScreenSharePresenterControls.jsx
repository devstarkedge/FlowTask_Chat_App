import {useState} from 'react';
import {stopHuddleScreen,sendScreenAnnotation} from '../../services/huddleAudioService';
import {screenAnnotations} from '../../features/huddle/services/screenAnnotations.service';

// Browser fallback belongs to the share surface. Desktop uses the native source
// toolbar and never renders a second complete presenter toolbar here.
export default function ScreenSharePresenterControls({share,tool,setTool,color,setColor}){
  const [error,setError]=useState('');
  const action=type=>{const event={id:crypto.randomUUID(),shareId:share.id,creatorSessionId:share.participantSessionId,type};screenAnnotations.receive(event,{optimistic:true});sendScreenAnnotation(event).catch(e=>setError(e.message));};
  return <div className="huddle-web-presenter" role="toolbar" aria-label="Screen presentation controls">
    <span>{share.sourceLabel} · {share.state==='paused'?'Paused':'Sharing'}</span>
    {[['pointer','Pointer','🖱️'],['laser','Laser','🔴'],['pen','Pencil','✏️'],['eraser','Eraser','🧽']].map(([value,label,emoji])=><button key={value} aria-label={label} title={label} aria-pressed={tool===value} onClick={()=>setTool(value)}><span aria-hidden="true">{emoji}</span></button>)}
    <input type="color" aria-label="Drawing color" value={color} onChange={e=>setColor(e.target.value)}/>
    <button onClick={()=>action('undo')} aria-label="Undo" title="Undo"><span aria-hidden="true">↶</span></button><button onClick={()=>action('clear')}>Clear</button>
    {share.audioAvailable && <span>System audio {share.systemAudio?'on':'off'}</span>}
    <button onClick={()=>stopHuddleScreen('user_stop')} aria-label="Stop sharing" title="Stop sharing"><span aria-hidden="true">⏹️</span></button>{error && <span role="status">{error}</span>}
  </div>;
}
