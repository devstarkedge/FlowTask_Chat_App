// Only presentation is detached. The original renderer remains the call owner.
function installHuddlePopout(parent,{BrowserWindow,ipcMain,icon,openExternal,security,capture}) {
  const contents=parent.webContents;let child=null,disposed=false;
  const alive=()=>!disposed && !parent.isDestroyed() && !contents.isDestroyed();
  contents.setWindowOpenHandler(details=>{
    if(alive() && details.url==='about:blank' && details.frameName==='taskchat-huddle' && !child) {
      return {action:'allow',overrideBrowserWindowOptions:{title:'TaskChat — Huddle',icon,width:1000,height:760,minWidth:600,minHeight:480,show:false,frame:false,skipTaskbar:false,autoHideMenuBar:true,backgroundColor:'#171c26',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}}};
    }
    if(/^https?:\/\//i.test(details.url))openExternal(details.url);
    return {action:'deny'};
  });
  const created=(window,details)=>{
    if(disposed || details.frameName!=='taskchat-huddle' || details.url!=='about:blank')return;
    if(child){window.destroy();return;}
    child=window;security.allowWindow(window);capture.allowWindow(window);
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(event,url)=>{if(url!=='about:blank')event.preventDefault();});
    window.once('closed',()=>{if(child===window)child=null;});
  };
  contents.on('did-create-window',created);
  const control=(event,action)=>{
    if(!alive() || event.sender!==contents || event.senderFrame!==contents.mainFrame || !['minimize','restore','maximize','close'].includes(action) || !child || child.isDestroyed())return {ok:false};
    if(action==='close'){child.close();return {ok:true};}
    if(action==='minimize'){if(!child.isVisible())child.showInactive();child.minimize();}
    if(action==='restore'){if(child.isMinimized())child.restore();child.show();child.focus();}
    if(action==='maximize'){if(child.isMaximized())child.unmaximize();else child.maximize();}
    return {ok:true,maximized:child.isMaximized()};
  };
  ipcMain.handle('huddle-popout:control',control);
  const close=()=>{const current=child;child=null;if(current && !current.isDestroyed())current.destroy();};
  const navigation=(_event,_url,inPlace,isMainFrame)=>{if(isMainFrame && !inPlace)close();};
  const dispose=()=>{if(disposed)return;disposed=true;close();ipcMain.removeHandler('huddle-popout:control');contents.removeListener('did-create-window',created);contents.removeListener('did-start-navigation',navigation);contents.removeListener('render-process-gone',close);};
  contents.on('did-start-navigation',navigation);contents.on('render-process-gone',close);parent.once('closed',dispose);
  return {dispose};
}
module.exports={installHuddlePopout};
