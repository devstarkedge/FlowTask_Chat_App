const {contextBridge,ipcRenderer}=require('electron');
let requestId=null;
contextBridge.exposeInMainWorld('capturePicker',{
  onSources:callback=>{const handler=(_event,data)=>{requestId=data.requestId;callback(data.sources);};ipcRenderer.on('huddle-source-list',handler);return()=>ipcRenderer.removeListener('huddle-source-list',handler);},
  select:id=>{if(requestId && (id===null || (typeof id==='string' && id.length<512)))ipcRenderer.send('huddle-source-selected',requestId,id);},
});
