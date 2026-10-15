const path=require('node:path');
const {randomUUID}=require('node:crypto');

function chooseDesktopSource(parent,sources,{BrowserWindow,ipcMain}) {
  return new Promise(resolve=>{
    const requestId=randomUUID();
    const picker=new BrowserWindow({parent,modal:true,title:'Share your screen',width:860,height:620,minWidth:540,minHeight:420,show:false,autoHideMenuBar:true,backgroundColor:'#f7f5fa',webPreferences:{preload:path.join(__dirname,'source-picker-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,partition:`huddle-picker-${requestId}`}});
    let settled=false;
    const finish=source=>{if(settled)return;settled=true;ipcMain.removeListener('huddle-source-selected',selected);parent.removeListener('closed',cancel);resolve(source);if(!picker.isDestroyed())picker.close();};
    const selected=(event,nonce,id)=>{if(event.sender!==picker.webContents || nonce!==requestId)return;if(id===null){finish(null);return;}const source=sources.find(item=>item.id===id);if(source)finish(source);};
    const cancel=()=>finish(null);
    ipcMain.on('huddle-source-selected',selected);parent.once('closed',cancel);picker.once('closed',cancel);
    picker.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    picker.webContents.on('will-navigate',event=>event.preventDefault());
    picker.webContents.session.setPermissionCheckHandler(()=>false);
    picker.webContents.session.setPermissionRequestHandler((_sender,_permission,callback)=>callback(false));
    picker.webContents.once('did-finish-load',()=>{
      if(settled)return;
      picker.webContents.send('huddle-source-list',{requestId,sources:sources.map(source=>({id:source.id,name:source.name,kind:source.id.startsWith('screen:')?'screen':'window',thumbnail:source.thumbnail?.toDataURL() || '',icon:source.appIcon?.toDataURL() || ''}))});
      picker.show();
    });
    picker.loadFile(path.join(__dirname,'source-picker.html')).catch(cancel);
  });
}

function installDisplayCapture(window,deps){
  let choosing=false;
  window.webContents.session.setDisplayMediaRequestHandler(async(request,callback)=>{
    if(choosing || request.frame!==window.webContents.mainFrame || !request.videoRequested || request.audioRequested){callback({});return;}
    choosing=true;
    try {
      const sources=await deps.desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:420,height:236},fetchWindowIcons:true});
      const source=sources.length?await chooseDesktopSource(window,sources,deps):null;
      callback(source && !window.isDestroyed()?{video:source}:{});
    } catch {callback({});}
    finally {choosing=false;}
  });
}
module.exports={chooseDesktopSource,installDisplayCapture};
