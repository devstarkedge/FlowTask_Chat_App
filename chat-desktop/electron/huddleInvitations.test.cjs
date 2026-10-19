const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {installHuddleInvitations}=require('./huddleInvitations.cjs');
function fixture(){
  let clock=1000,visible=true,focused=true;
  const timers=new Map(),ipcMain=new EventEmitter(),window=new EventEmitter(),toasts=[],sent=[];
  window.webContents=new EventEmitter();window.webContents.mainFrame={};window.webContents.send=(...args)=>sent.push(args);
  window.isDestroyed=()=>false;window.isVisible=()=>visible;window.isFocused=()=>focused;window.isMinimized=()=>!visible;window.flashFrame=()=>{};
  class Notification extends EventEmitter{static isSupported(){return true;}constructor(options){super();this.options=options;toasts.push(this);}show(){this.shown=true;}close(){this.closed=true;this.emit('close',{reason:'applicationHidden'});}}
  const item={id:'invite',channelId:'channel',workspaceId:'workspace',huddleId:'meeting',callerName:'Alex',label:'Design',expiresAt:61000};
  let opened=0;
  const dispose=installHuddleInvitations(window,{ipcMain,Notification,icon:'icon.png',showWindow:()=>{opened++;visible=focused=true;window.emit('focus');},now:()=>clock,
    setTimer:callback=>{const id=Symbol();timers.set(id,callback);return id;},clearTimer:id=>timers.delete(id)});
  const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
  return {window,ipcMain,toasts,sent,timers,item,event,dispose,opened:()=>opened,
    show:(override={},sender=event)=>ipcMain.emit('huddle-invitation:show',sender,{...item,...override}),
    background:()=>{visible=focused=false;window.emit('hide');},foreground:()=>{visible=focused=true;window.emit('focus');},
    expire:()=>{clock=62000;for(const callback of [...timers.values()])callback();}};
}
test('foreground uses the in-app popup; hidden-to-tray gets one native Join/Dismiss notification',()=>{
 const f=fixture();f.show();assert.equal(f.toasts.length,0);f.background();assert.equal(f.toasts.length,1);
 assert.deepEqual(f.toasts[0].options.actions,[{type:'button',text:'Join'},{type:'button',text:'Dismiss'}]);assert.equal(f.toasts[0].options.silent,true);
 f.show();f.window.emit('blur');assert.equal(f.toasts.length,1);
 f.foreground();assert.equal(f.toasts[0].closed,true);f.background();assert.equal(f.toasts.length,2);f.dispose();assert.equal(f.timers.size,0);
});
test('Join restores the app once; Dismiss keeps it hidden and sends no join',()=>{
 const f=fixture();f.background();f.show();f.toasts[0].emit('action',{actionIndex:0});f.toasts[0].emit('click',{});
 assert.equal(f.opened(),1);assert.deepEqual(f.sent,[['huddle-invitation:action',{id:'invite',action:'join'}]]);
 f.show({id:'second'});f.background();f.toasts.at(-1).emit('action',{},1);
 assert.equal(f.opened(),1);assert.deepEqual(f.sent.at(-1),['huddle-invitation:action',{id:'second',action:'dismiss'}]);f.dispose();
});
test('expiry, cancellation and shutdown remove notifications, timers and IPC listeners',()=>{
 const f=fixture();f.background();f.show();f.expire();assert.equal(f.toasts[0].closed,true);f.toasts[0].emit('action',{actionIndex:0});assert.equal(f.sent.length,0);assert.equal(f.timers.size,0);
 f.dispose();f.dispose();assert.equal(f.ipcMain.listenerCount('huddle-invitation:show'),0);assert.equal(f.window.listenerCount('hide'),0);
});
test('rejects untrusted senders, subframes, invalid expiry and stale close commands',()=>{
 const f=fixture();f.background();f.show({},{});f.show({}, {sender:f.window.webContents,senderFrame:{}});f.show({expiresAt:999999});assert.equal(f.toasts.length,0);
 f.show();f.ipcMain.emit('huddle-invitation:close',f.event,'wrong');assert.equal(f.toasts[0].closed,undefined);
 f.ipcMain.emit('huddle-invitation:close',f.event,'invite');assert.equal(f.toasts[0].closed,true);f.dispose();
});
test('SPA navigation keeps the alert; a main-frame reload clears it',()=>{
 const f=fixture();f.background();f.show();
 f.window.webContents.emit('did-start-navigation',{isMainFrame:true,isSameDocument:true});assert.equal(f.toasts[0].closed,undefined);
 f.window.webContents.emit('did-start-navigation',{isMainFrame:true,isSameDocument:false});assert.equal(f.toasts[0].closed,true);assert.equal(f.timers.size,0);
 f.dispose();assert.equal(f.window.listenerCount('closed'),0);
});
