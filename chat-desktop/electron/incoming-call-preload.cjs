const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('incomingCall',{
  onDetails:callback=>{const handler=(_event,details)=>callback(details);ipcRenderer.on('incoming-call:details',handler);return()=>ipcRenderer.removeListener('incoming-call:details',handler);},
  join:()=>ipcRenderer.send('incoming-call:action','join'),
  dismiss:()=>ipcRenderer.send('incoming-call:action','dismiss'),
});
