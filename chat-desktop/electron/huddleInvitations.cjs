// Native incoming-call alerts own only notification presentation, never media.
function installHuddleInvitations(window,{ipcMain,Notification,icon,showWindow,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let current=null;
  const trusted=event=>!window.isDestroyed() && event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame;
  const closeToast=record=>{const toast=record?.toast;if(!toast)return;record.toast=null;toast.removeAllListeners();toast.close();};
  const clear=()=>{if(!current)return;const previous=current;current=null;clearTimer(previous.timer);closeToast(previous);};
  const finish=(record,action)=>{
    if(current!==record)return;
    const valid=record.invitation.expiresAt>now();clear();
    if(!valid || window.isDestroyed())return;
    if(action==='join')showWindow();
    window.webContents.send('huddle-invitation:action',{id:record.invitation.id,action});
  };
  const present=()=>{
    if(!current || current.invitation.expiresAt<=now()){clear();return;}
    if(window.isVisible() && window.isFocused() && !window.isMinimized()){closeToast(current);return;}
    if(current.toast || !Notification.isSupported())return;
    const record=current,item=record.invitation;
    // The renderer plays the same bundled ringtone in foreground and background.
    const toast=new Notification({title:`${item.callerName} is calling`,body:`${item.label}\nIncoming Huddle call`,icon,
      silent:true,timeoutType:'never',urgency:'critical',actions:[{type:'button',text:'Join'},{type:'button',text:'Dismiss'}]});
    record.toast=toast;
    toast.on('click',()=>finish(record,'join'));
    toast.on('action',(details,legacyIndex)=>{const index=details?.actionIndex ?? legacyIndex;if(index===0 || index===1)finish(record,index===0?'join':'dismiss');});
    toast.on('close',details=>{if(details?.reason==='userCanceled')finish(record,'dismiss');});
    toast.on('failed',()=>{if(current===record)window.flashFrame(true);});
    toast.show();
  };
  const show=(event,item)=>{
    if(!trusted(event) || !item || !['id','channelId','huddleId','workspaceId'].every(key=>typeof item[key]==='string' && item[key].length>0 && item[key].length<=256) ||
      !Number.isFinite(item.expiresAt) || item.expiresAt<=now() || item.expiresAt>now()+65000)return;
    if(current?.invitation.id===item.id)return;
    clear();const invitation={id:item.id,expiresAt:item.expiresAt,callerName:String(item.callerName || 'A teammate').slice(0,120),label:String(item.label || 'Huddle').slice(0,180)};
    current={invitation,toast:null,timer:setTimer(clear,invitation.expiresAt-now())};present();
  };
  const dismiss=(event,id)=>{if(trusted(event) && current?.invitation.id===id)clear();};
  const focused=()=>{if(current)closeToast(current);window.flashFrame(false);};
  ipcMain.on('huddle-invitation:show',show);ipcMain.on('huddle-invitation:close',dismiss);
  window.on('focus',focused);window.on('blur',present);window.on('hide',present);window.on('minimize',present);
  const navigating=(details,_url,isInPlace,isMainFrame)=>{if((details?.isMainFrame ?? isMainFrame) && !(details?.isSameDocument ?? isInPlace))clear();};
  window.webContents.on('did-start-navigation',navigating);window.webContents.on('render-process-gone',clear);
  const dispose=()=>{clear();window.removeListener('closed',dispose);ipcMain.removeListener('huddle-invitation:show',show);ipcMain.removeListener('huddle-invitation:close',dismiss);
    window.removeListener('focus',focused);window.removeListener('blur',present);window.removeListener('hide',present);window.removeListener('minimize',present);
    window.webContents.removeListener('did-start-navigation',navigating);window.webContents.removeListener('render-process-gone',clear);};
  window.once('closed',dispose);
  return dispose;
}
module.exports={installHuddleInvitations};
