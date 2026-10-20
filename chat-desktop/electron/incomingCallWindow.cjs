const path = require('node:path');

// A separate local window remains visible while the main app is hidden in tray.
// It has no account, microphone or signaling access of its own.
function createIncomingCallWindow({BrowserWindow,ipcMain,screen,icon},invitation,onAction,onUnavailable=()=>{}) {
  // Notify on the display the user is currently using, including secondary
  // monitors, instead of silently opening on an unattended primary display.
  const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width=Math.min(380,area.width),height=Math.min(360,area.height);
  const alert=new BrowserWindow({width,height,x:area.x+Math.max(0,area.width-width-16),y:area.y+Math.max(0,area.height-height-16),
    title:'TaskChat — Incoming call',icon,show:false,resizable:false,maximizable:false,minimizable:false,
    alwaysOnTop:true,skipTaskbar:false,backgroundColor:'#191b27',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'incoming-call-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  let live=true,loaded=false,painted=false,shown=false;
  const act=(event,action)=>{
    if(!live || event.sender!==alert.webContents || event.senderFrame!==alert.webContents.mainFrame || !['join','dismiss'].includes(action))return;
    onAction(action);
  };
  const cleanup=()=>{if(!live)return;live=false;ipcMain.removeListener('incoming-call:action',act);};
  const unavailable=()=>{if(!live)return;cleanup();if(!alert.isDestroyed())alert.destroy();onUnavailable();};
  const reveal=()=>{
    if(!live || shown || !loaded || !painted || alert.isDestroyed())return;
    shown=true;
    // Keep the call above other applications without stealing keyboard focus
    // or restoring the hidden main TaskChat window.
    alert.setAlwaysOnTop(true,'pop-up-menu');
    alert.showInactive();alert.moveTop();
  };
  ipcMain.on('incoming-call:action',act);
  alert.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  alert.webContents.on('will-navigate',event=>event.preventDefault());
  alert.webContents.on('will-attach-webview',event=>event.preventDefault());
  alert.webContents.once('did-finish-load',()=>{
    if(!live || alert.isDestroyed())return;
    alert.webContents.send('incoming-call:details',{callerName:invitation.callerName,label:invitation.label});
    loaded=true;reveal();
  });
  alert.once('ready-to-show',()=>{painted=true;reveal();});
  alert.webContents.once('render-process-gone',unavailable);
  alert.on('close',event=>{if(live){event.preventDefault();onAction('dismiss');}});
  alert.once('closed',cleanup);
  alert.loadFile(path.join(__dirname,'incoming-call.html')).catch(unavailable);
  return {close(){cleanup();if(!alert.isDestroyed())alert.destroy();}};
}
module.exports={createIncomingCallWindow};
