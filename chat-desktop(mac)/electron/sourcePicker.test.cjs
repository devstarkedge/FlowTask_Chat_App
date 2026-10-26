const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {installDisplayCapture}=require('./sourcePicker.cjs');
function setup({sources=[{id:'screen:1:0',name:'Display'}],cancel=false,enumerationError=false}={}){
 const ipcMain=new EventEmitter(),handlers=new Map();ipcMain.handle=(name,fn)=>handlers.set(name,fn);ipcMain.removeHandler=name=>handlers.delete(name);
 const parent=new EventEmitter();parent.isDestroyed=()=>false;parent.webContents=new EventEmitter();parent.webContents.mainFrame={};let request;
 parent.webContents.session={setDisplayMediaRequestHandler:fn=>{request=fn;}};
 class Picker extends EventEmitter{constructor(){super();this.closed=false;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.session={setPermissionCheckHandler(){},setPermissionRequestHandler(){}};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(name,data)=>{if(name==='huddle-source-list')ipcMain.emit('huddle-source-selected',{sender:this.webContents,senderFrame:this.webContents.mainFrame},data.requestId,cancel?null:data.sources[0].id,false);};}isDestroyed(){return this.closed;}close(){this.closed=true;this.emit('closed');}show(){}async loadFile(){queueMicrotask(()=>this.webContents.emit('did-finish-load'));}}
 installDisplayCapture(parent,{BrowserWindow:Picker,ipcMain,platform:'win32',desktopCapturer:{getSources:async()=>{if(enumerationError)throw new Error('enumeration failed');return sources;}}});
 return {handlers,parent,ipcMain,run:async()=>{let result,calls=0;await request({frame:parent.webContents.mainFrame,videoRequested:true,audioRequested:false},value=>{result=value;calls++;});assert.equal(calls,1);return result;},outcome:()=>handlers.get('huddle-capture:result')({sender:parent.webContents,senderFrame:parent.webContents.mainFrame})};
}
test('provides the selected source and records a successful capture decision',async()=>{const f=setup();assert.equal((await f.run()).video.id,'screen:1:0');assert.equal(f.outcome().status,'selected');assert.ok(f.outcome().attemptedAt>0);assert.equal(f.ipcMain.listenerCount('huddle-source-selected'),0);});
test('cancels using null and retains cancellation independently of Chromium wording',async()=>{const f=setup({cancel:true});assert.equal(await f.run(),null);assert.equal(f.outcome().code,'SCREEN_CAPTURE_CANCELLED');assert.equal(f.ipcMain.listenerCount('huddle-source-selected'),0);assert.equal(f.handlers.get('huddle-capture:result')({sender:{},senderFrame:{}}),null);f.parent.emit('closed');assert.equal(f.handlers.has('huddle-capture:result'),false);});
test('distinguishes no available sources from permission cancellation',async()=>{const f=setup({sources:[]});assert.equal(await f.run(),null);assert.equal(f.outcome().code,'SCREEN_CAPTURE_NOT_FOUND');});
test('preserves enumeration errors without a second or empty-stream callback',async()=>{const f=setup({enumerationError:true});assert.equal(await f.run(),null);assert.equal(f.outcome().code,'SCREEN_CAPTURE_UNAVAILABLE');assert.equal(f.outcome().message,'enumeration failed');});
