// Real Web Audio + localhost WebRTC regression; no microphone/desktop capture.
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
app.setPath('userData',path.join(app.getPath('temp'),'taskchat-system-audio-test'));
let window;
const timer=setTimeout(()=>{console.error('Audio integration test timed out');app.exit(1);},30000);
app.whenReady().then(()=>{
  window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.join(__dirname,'preload.cjs'),autoplayPolicy:'no-user-gesture-required',backgroundThrottling:false}});
  ipcMain.once('audio-test:result',(event,result)=>{
    if(event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame)return;
    clearTimeout(timer);console.log(JSON.stringify(result));app.exit(result.ok?0:1);
  });
  window.loadFile(path.join(__dirname,'index.html')).catch(error=>{console.error(error.message);app.exit(1);});
});
