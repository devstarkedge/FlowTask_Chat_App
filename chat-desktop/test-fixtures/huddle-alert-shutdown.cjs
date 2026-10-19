const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const {installHuddleInvitations}=require('../electron/huddleInvitations.cjs');

// Exercise the real native destruction order without accounts, media or network.
app.on('window-all-closed',()=>{});
process.on('uncaughtException',error=>{console.error(error);app.exit(1);});
app.whenReady().then(()=>{
  const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const contents=window.webContents;
  let alertClosed=false,action,unavailable;
  const dispose=installHuddleInvitations(window,{ipcMain,Notification:{isSupported:()=>false},
    showWindow:()=>{throw new Error('Stale action reopened app');},
    createCallAlert:(_item,onAction,onUnavailable)=>{
      action=onAction;unavailable=onUnavailable;return {close(){alertClosed=true;}};
    }});
  ipcMain.emit('huddle-invitation:show',{sender:contents,senderFrame:contents.mainFrame},
    {id:'shutdown-check',channelId:'channel',huddleId:'huddle',workspaceId:'workspace',expiresAt:Date.now()+60000});
  assert.equal(typeof action,'function');
  window.destroy();dispose();dispose();action('join');unavailable();
  assert.equal(alertClosed,true);
  assert.equal(ipcMain.listenerCount('huddle-invitation:show'),0);
  assert.equal(ipcMain.listenerCount('huddle-invitation:close'),0);
  console.log('PASS: native window destruction, repeated cleanup and stale callbacks');
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
