const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('audioTest',{result:result=>ipcRenderer.send('audio-test:result',result)});
