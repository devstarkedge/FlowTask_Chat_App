// A fixed wall-clock deadline survives repeated socket/online events. A retry
// never extends the five-minute window or creates a new meeting/session.
export function createHuddleNetworkRecovery({getSession,resume,restore,expire,onDeadline,isOnline,isRestored=()=>true,now=Date.now}) {
  let sessionId=null,deadline=null,expiryTimer=null,retryTimer=null,epoch=0,running=false,disposed=false;
  const clear=()=>{clearTimeout(expiryTimer);clearTimeout(retryTimer);expiryTimer=retryTimer=null;};
  const reset=()=>{epoch++;running=false;clear();sessionId=deadline=null;onDeadline(null);};
  const check=()=>{
    if(disposed)return false;
    if(!getSession() || (sessionId && getSession().id!==sessionId)){reset();return false;}
    if(deadline && now()>=deadline){const id=sessionId;reset();expire(id);return false;}
    return true;
  };
  const begin=()=>{
    if(disposed || !getSession())return;
    if(sessionId && sessionId!==getSession().id)reset();
    if(!deadline){sessionId=getSession().id;deadline=now()+300000;onDeadline(deadline);expiryTimer=setTimeout(check,300000);}
    check();
  };
  const reconnect=async()=>{
    begin();if(!check() || !isOnline() || running)return;
    running=true;const ticket=epoch;
    try {
      const restored=await resume();
      if(ticket!==epoch || !check() || !isOnline())return;
      if(restored===false)throw new Error('Resume pending');
      const audio=await restore();
      if(ticket!==epoch || !check() || !isOnline())return;
      if(audio===false)throw new Error('Media recovery pending');
      if(isRestored())reset();
    } catch {
      if(ticket===epoch && check() && isOnline())retryTimer=setTimeout(reconnect,2000);
    } finally {if(ticket===epoch)running=false;}
  };
  return {begin,reconnect,check,reset,complete(){if(check() && isOnline() && isRestored())reset();},get active(){return Boolean(deadline);},get recovering(){return running;},dispose(){disposed=true;reset();}};
}
