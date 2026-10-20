const {app,BrowserWindow,ipcMain,screen}=require('electron');
const assert=require('node:assert/strict');
const {createIncomingCallWindow}=require('../electron/incomingCallWindow.cjs');

// Real Windows presentation check, without credentials, sockets or microphone.
app.on('window-all-closed',()=>{});
process.on('uncaughtException',error=>{console.error(error);app.exit(1);});
app.whenReady().then(()=>{
  const parent=new BrowserWindow({show:false,title:'TaskChat minimized-window test',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  parent.show();parent.minimize();
  let handle;
  handle=createIncomingCallWindow({BrowserWindow,ipcMain,screen},
    {callerName:'TaskChat visibility test',label:'Background popup verification'},()=>{handle.close();parent.destroy();app.exit(0);},error=>{console.error(error || 'Popup failed');app.exit(1);});
  setTimeout(()=>{
    const popup=BrowserWindow.getAllWindows().find(window=>window!==parent);
    assert.ok(popup,'Popup was created');
    assert.equal(popup.isVisible(),true);assert.equal(popup.isAlwaysOnTop(),true);
    assert.equal(parent.isMinimized(),true);
    const bounds=popup.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
    assert.ok(bounds.x>=area.x && bounds.y>=area.y && bounds.x+bounds.width<=area.x+area.width && bounds.y+bounds.height<=area.y+area.height);
    console.log('PASS: real popup is visible, always on top and within display; main app remains minimized');
    handle.close();parent.destroy();app.exit(0);
  },3000);
}).catch(error=>{console.error(error);app.exit(1);});
