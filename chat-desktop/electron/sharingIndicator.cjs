const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {createShareGeometry,toolbarBounds,windowSourceKey}=require('./shareGeometry.cjs');

// One presenter surface group per owner renderer. Capture and RTC stay in the
// existing renderer service; main owns geometry and narrowly validated windows.
function installSharingIndicator(parent,{BrowserWindow,ipcMain,screen,platform=process.platform,geometry}) {
 const contents=parent.webContents,adapter=geometry || createShareGeometry({screen,BrowserWindow,platform});
 let disposed=false,candidate=null,current=null,border=null,toolbar=null,ink=null,untrack=null,bounds=null,captureBounds=null;
 const alive=()=>!disposed && !parent.isDestroyed() && !contents.isDestroyed();
 const trusted=event=>alive() && event.sender===contents && event.senderFrame===contents.mainFrame;
 const destroy=window=>{if(window && !window.isDestroyed())window.destroy();};
 const hide=()=>{untrack?.();untrack=null;destroy(border);destroy(toolbar);destroy(ink);border=toolbar=ink=null;bounds=captureBounds=null;};
 const stop=()=>{hide();current=null;};
 const secure=window=>{window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());};
 const options={frame:false,transparent:true,focusable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,resizable:false,movable:false,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}};
 const protect=window=>{if(platform==='win32')window.setContentProtection(true);};
 const show=window=>{if(window.isDestroyed())return;window.setAlwaysOnTop(true,'screen-saver');window.showInactive();};
 const sendState=()=>{
  const state=current?{...current,sourceToken:undefined,source:undefined,tracked:Boolean(bounds)}:null;
  if(toolbar && !toolbar.isDestroyed())toolbar.webContents.send('huddle-share:state',state?{...state,strokes:undefined}:null);
  if(ink && !ink.isDestroyed())ink.webContents.send('huddle-share:state',state);
 };
 const annotationWindow=()=>{
  if(!bounds || !current || current.tool==='pointer'){destroy(ink);ink=null;return;}
  if(!ink){
   ink=new BrowserWindow({...options,...captureBounds,title:'TaskChat Share Annotation Overlay',webPreferences:{...options.webPreferences,preload:path.join(__dirname,'share-toolbar-preload.cjs')}});
   const target=ink;secure(target);protect(target);target.once('ready-to-show',()=>{if(ink===target){sendState();show(target);if(toolbar)show(toolbar);}});
   target.loadFile(path.join(__dirname,'share-annotation.html')).catch(()=>{if(ink===target){destroy(ink);ink=null;}});
  }else ink.setBounds(captureBounds);
 };
 const position=rect=>{
  if(!current)return;bounds=rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null;captureBounds=rect?.captureBounds || bounds;
  if(!rect){border?.hide();ink?.hide();sendState();return;}
  if(!border){
   border=new BrowserWindow({...options,...rect,title:'TaskChat Share Source Outline'});const target=border;secure(target);protect(target);target.setIgnoreMouseEvents(true);
   target.once('ready-to-show',()=>{if(border===target && bounds){show(target);target.setBounds(bounds);}});
   target.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{box-sizing:border-box;border:3px solid #36d17d;pointer-events:none}</style>')).catch(()=>{if(border===target){destroy(border);border=null;}});
  }else {border.setBounds(rect);show(border);}
  if(toolbar && !toolbar.isDestroyed())toolbar.setBounds(toolbarBounds(rect,screen,740,86));
  annotationWindow();if(ink)show(ink);if(toolbar)show(toolbar);sendState();
 };
 const begin=value=>{
  hide();current={...value,source:candidate.source,sourceLabel:candidate.source.name.slice(0,160),sourceType:candidate.source.id.startsWith('screen:')?'screen':'window',audioAvailable:candidate.audioAvailable,tool:'pointer',color:'#facc15',strokes:[]};
  // Unknown external-window geometry gets a truthful toolbar, never a fake
  // full-monitor green border. Only Electron-owned windows expose their bounds.
  const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  toolbar=new BrowserWindow({...options,...toolbarBounds(display.workArea,screen,740,86),title:'TaskChat Screen Share Controls',focusable:true,movable:true,webPreferences:{...options.webPreferences,preload:path.join(__dirname,'share-toolbar-preload.cjs')}});
  const target=toolbar;secure(target);protect(target);target.once('ready-to-show',()=>{if(toolbar===target){sendState();show(target);}});
  target.loadFile(path.join(__dirname,'share-toolbar.html')).catch(()=>{if(toolbar!==target)return;const id=current?.id;stop();if(alive())contents.send('huddle-share:action',{sessionId:id,action:'stop',reason:'toolbar_failed'});});
  const shareId=current.id;
  const release=adapter.track(current.source,rect=>{if(current?.id===shareId)position(rect);},()=>{if(current?.id!==shareId)return;stop();if(alive())contents.send('huddle-share:action',{sessionId:shareId,action:'stop',reason:'source_closed'});});
  if(current?.id===shareId)untrack=release;else release();
 };
 const sourceInfo=event=>trusted(event) && candidate?{sourceToken:candidate.token,sourceLabel:candidate.source.name.slice(0,160),sourceType:candidate.source.id.startsWith('screen:')?'screen':'window',audioAvailable:candidate.audioAvailable}:null;
 const update=(event,value)=>{
  if(!trusted(event))return {ok:false};
  if(value===null){stop();return {ok:true};}
  if(!value || !/^[a-zA-Z0-9-]{1,80}$/.test(value.id || '') || !['active','paused'].includes(value.state))return {ok:false};
  if(current?.id===value.id && current.sourceToken===value.sourceToken){current.state=value.state;current.systemAudio=value.systemAudio===true;sendState();return {ok:true};}
  if(!candidate || value.sourceToken!==candidate.token)return {ok:false};
  begin(value);return {ok:true};
 };
 const annotations=(event,value)=>{
  if(!trusted(event) || !current || value?.sessionId!==current.id || !Array.isArray(value.strokes) || value.strokes.length>128)return;
  let total=0;
  if(value.strokes.some(s=>!s || !['pen','eraser'].includes(s.tool) || !/^#[0-9a-f]{6}$/i.test(s.color || '') || !Array.isArray(s.points) || (total+=s.points.length)>32768 || s.points.some(p=>!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x<0 || p.x>1 || p.y<0 || p.y>1)))return;
  current.strokes=value.strokes;sendState();
 };
 const command=(event,value)=>{
  if(!alive() || !current || ![toolbar?.webContents,ink?.webContents].includes(event.sender) || event.senderFrame!==event.sender.mainFrame || value?.sessionId!==current.id)return;
  if(!['stop','pause','switch','pointer','pen','eraser','clear','undo','annotation'].includes(value.action))return;
  if(['pointer','pen','eraser'].includes(value.action)){if(value.action!=='pointer' && !bounds)return;current.tool=value.action;current.color=/^#[0-9a-f]{6}$/i.test(value.color || '')?value.color:'#facc15';annotationWindow();sendState();return;}
  if(value.action==='annotation'){
   if(event.sender!==ink?.webContents || !['start','move','end'].includes(value.type) || !Array.isArray(value.points) || value.points.length>32 || value.points.some(p=>!p || !Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))return;
  }
  if(value.action==='stop')hide();
  contents.send('huddle-share:action',{...value,sessionId:current.id,tool:current.tool,color:current.color});
 };
 const legacy=(event,active)=>{if(!trusted(event) || typeof active!=='boolean')return;if(!active)stop();};
 const reset=()=>{stop();candidate=null;};
 const navigation=(_event,_url,inPlace,isMainFrame)=>{if(isMainFrame && !inPlace)reset();};
 const dispose=()=>{if(disposed)return;disposed=true;reset();ipcMain.removeHandler('huddle-share:source');ipcMain.removeHandler('huddle-share:update');ipcMain.removeListener('huddle-share:command',command);ipcMain.removeListener('huddle-share:annotations',annotations);ipcMain.removeListener('huddle-screen-sharing',legacy);contents.removeListener('did-start-navigation',navigation);contents.removeListener('render-process-gone',reset);parent.removeListener('closed',dispose);};
 ipcMain.handle('huddle-share:source',sourceInfo);ipcMain.handle('huddle-share:update',update);ipcMain.on('huddle-share:command',command);ipcMain.on('huddle-share:annotations',annotations);ipcMain.on('huddle-screen-sharing',legacy);
 contents.on('did-start-navigation',navigation);contents.on('render-process-gone',reset);parent.once('closed',dispose);
 return {select(source,{audioAvailable=false}={}){if(source)candidate={source,token:randomUUID(),audioAvailable};},isOwnSource(source){
  if([border,toolbar,ink].some(window=>window && !window.isDestroyed() && window.getTitle?.()===source.name))return true;
  const key=windowSourceKey(source.id);if(!key)return false;
  return [border,toolbar,ink].some(window=>window && !window.isDestroyed() && windowSourceKey(window.getMediaSourceId())===key);
 },dispose};
}
module.exports={installSharingIndicator};
