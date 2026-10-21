const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createIncomingCallWindow}=require('./incomingCallWindow.cjs');

function fixture(){
 const ipcMain=new EventEmitter(),calls=[],actions=[];let window;
 class BrowserWindow extends EventEmitter {
  constructor(options){super();window=this;this.options=options;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(...args)=>calls.push(['details',...args]);}
  isDestroyed(){return Boolean(this.destroyed);}
  loadFile(){return Promise.resolve();}
  setAlwaysOnTop(...args){calls.push(['top',...args]);}
  showInactive(){calls.push(['showInactive']);}
  moveTop(){calls.push(['moveTop']);}
  destroy(){this.destroyed=true;this.emit('closed');}
 }
 let failures=0;
 const handle=createIncomingCallWindow({BrowserWindow,ipcMain,screen:{getCursorScreenPoint:()=>({x:-500,y:100}),getDisplayNearestPoint:point=>{assert.equal(point.x,-500);return {workArea:{x:-1280,y:0,width:1280,height:720}};}}},
  {callerName:'Alex',label:'Team'},action=>actions.push(action),()=>failures++);
 return {window,handle,calls,ipcMain,actions,failures:()=>failures};
}

test('paints popup on active display and raises it without stealing focus',()=>{
 const f=fixture();assert.equal(f.window.options.x,-396);assert.equal(f.window.options.y,344);
 f.window.webContents.emit('did-finish-load');assert.deepEqual(f.calls.map(c=>c[0]),['details']);
 f.window.emit('ready-to-show');
 assert.deepEqual(f.calls.slice(1),[['top',true,'pop-up-menu'],['showInactive'],['moveTop']]);
 f.window.emit('ready-to-show');assert.equal(f.calls.length,4);f.handle.close();
});

test('ready-to-show before load waits for caller details and validates action sender',()=>{
 const f=fixture();f.window.emit('ready-to-show');assert.equal(f.calls.length,0);
 f.window.webContents.emit('did-finish-load');assert.equal(f.calls.length,4);
 f.ipcMain.emit('incoming-call:action',{sender:{},senderFrame:{}},'join');assert.equal(f.actions.length,0);
 f.ipcMain.emit('incoming-call:action',{sender:f.window.webContents,senderFrame:f.window.webContents.mainFrame},'join');assert.deepEqual(f.actions,['join']);
 f.handle.close();f.handle.close();assert.equal(f.ipcMain.listenerCount('incoming-call:action'),0);
});

test('renderer failure falls back once while late paint and shutdown callbacks do nothing',()=>{
 const f=fixture();f.window.webContents.emit('render-process-gone');f.window.webContents.emit('render-process-gone');
 f.window.emit('ready-to-show');assert.equal(f.calls.length,0);assert.equal(f.failures(),1);
 assert.equal(f.window.isDestroyed(),true);assert.equal(f.ipcMain.listenerCount('incoming-call:action'),0);f.handle.close();
});
