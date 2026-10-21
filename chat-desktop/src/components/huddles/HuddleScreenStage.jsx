import {createPortal} from 'react-dom';
import {useEffect,useRef,useState} from 'react';
import {Maximize2,Minimize2,Minus,Plus} from 'lucide-react';
import ScreenAnnotationLayer from './ScreenAnnotationLayer';
import ScreenSharePresenterControls from './ScreenSharePresenterControls';

export default function HuddleScreenStage({stream,local=false,controlsHost,share,busy=false,presenterName}) {
  const video=useRef(null),stage=useRef(null),viewport=useRef(null),drawing=useRef(false);
  const [blocked,setBlocked]=useState(false),[zoom,setZoom]=useState(1),[tool,setTool]=useState('pointer'),[color,setColor]=useState('#facc15');
  const [fullscreen,setFullscreen]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const element=video.current;let active=true;setBlocked(false);setZoom(1);setTool('pointer');
    element.srcObject=stream;
    element.play().catch(e=>{if(active && e.name!=='AbortError')setBlocked(true);});
    return()=>{active=false;drawing.current=false;element.pause();element.srcObject=null;};
  },[stream]);
  useEffect(()=>{const owner=stage.current.ownerDocument;const changed=()=>setFullscreen(owner.fullscreenElement===stage.current);owner.addEventListener('fullscreenchange',changed);return()=>owner.removeEventListener('fullscreenchange',changed);},[]);
  const present=async()=>{
    setError('');
    try{const owner=stage.current.ownerDocument;if(owner.fullscreenElement===stage.current)await owner.exitFullscreen();else await stage.current.requestFullscreen();}
    catch{setError('Fullscreen is unavailable. Maximize the Huddle window instead.');}
  };
  const nativeSize=()=>{
    const element=video.current,rect=viewport.current.getBoundingClientRect();
    if(element.videoWidth && rect.width && rect.height)setZoom(Math.max(1,Math.min(12,Math.max(element.videoWidth/rect.width,element.videoHeight/rect.height))));
  };
  const controls=(<div className="huddle-screen-controls-footer">
      <div className="huddle-screen-toolbar" role="toolbar" aria-label="Shared screen controls">

        <button onClick={()=>setZoom(1)} aria-pressed={zoom===1}>Fit</button><button onClick={nativeSize} title="Original pixel size">100%</button>
        <button aria-label="Zoom out shared screen" disabled={zoom<=1} onClick={()=>setZoom(value=>Math.max(1,value-.25))}><Minus size={16}/></button>
        <button aria-label="Zoom in shared screen" disabled={zoom>=12} onClick={()=>setZoom(value=>Math.min(12,value+.25))}><Plus size={16}/></button>
        <button aria-label={fullscreen?'Exit shared screen fullscreen':'View shared screen fullscreen'} onClick={present}>{fullscreen?<Minimize2 size={16}/>:<Maximize2 size={16}/>}</button>
      </div>
    </div>);
  return <div ref={stage} className="huddle-screen-stage" onKeyDown={event=>{if(stage.current.ownerDocument.fullscreenElement===stage.current && event.key==='Escape')event.stopPropagation();}}>
    <div ref={viewport} className="huddle-screen-viewport" tabIndex={0} aria-label="Shared screen. Zoom in to read smaller text.">
      <div className={`huddle-screen-surface${local && tool!=='pointer'?' is-drawing':''}`} style={{width:`${zoom*100}%`,height:`${zoom*100}%`}}>
        <video ref={video} autoPlay muted playsInline aria-label={local?'Your shared screen':'Participant shared screen'} onPlaying={()=>setBlocked(false)}/>
        <ScreenAnnotationLayer video={video} share={share} tool={tool} color={color} allowed={local && !globalThis.electronAPI?.updateHuddleShare} onError={setError}/>
        {share?.state==='paused' && <div className="huddle-share-paused" role="status">{local?'Your share':presenterName || 'Screen share'} is paused</div>}
      </div>
    </div>
    {local && share && !globalThis.electronAPI?.updateHuddleShare && <ScreenSharePresenterControls share={share} busy={busy} tool={tool} setTool={setTool} color={color} setColor={setColor}/>}
    {controlsHost && !fullscreen?createPortal(controls,controlsHost):controls}
    {blocked && <button className="huddle-screen-play" onClick={()=>video.current.play().then(()=>setBlocked(false)).catch(()=>setError('Could not play the shared screen. Try reconnecting.'))}>Show shared screen</button>}
    {error && <p className="huddle-screen-error" role="status">{error}</p>}
  </div>;
}
