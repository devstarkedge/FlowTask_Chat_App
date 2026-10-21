const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
app.setPath('userData',path.join(app.getPath('temp'),'taskchat-screen-presentation-check'));
let window;
const timeout=setTimeout(()=>{console.error('Screen presentation integration timed out');app.exit(1);},35000);
app.whenReady().then(()=>{
  window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(__dirname,'preload.cjs')}});
  ipcMain.once('screen-test:result',(event,result)=>{
    if(event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame)return;
    clearTimeout(timeout);console.log(JSON.stringify(result));app.exit(result.ok?0:1);
  });
  window.loadFile(path.join(__dirname,'index.html')).catch(error=>{console.error(error.message);app.exit(1);});
});
