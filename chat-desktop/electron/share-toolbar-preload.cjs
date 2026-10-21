const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('shareToolbar',{
 onState:callback=>ipcRenderer.on('huddle-share:state',(_event,state)=>callback(state)),
 action:command=>ipcRenderer.send('huddle-share:command',command),
});
