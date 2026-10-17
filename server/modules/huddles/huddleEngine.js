import {randomUUID} from 'node:crypto';
import {ForbiddenError, NotFoundError, ValidationError} from '../../middleware/errorHandler.js';
const GRACE=30000, RECONNECT_GRACE=300000, LEASE=60000;
const publicState = state => ({huddle:state.huddle, revision:state.revision,
  participants:state.participants.map(({secret,socketId,expiresAt,...profile})=>profile)});
function membershipError(error,state,context,cached,reason){
  const own=state.participants.filter(p=>p.userId===String(context.user._id));
  const sender=own.find(p=>p.socketId===context.socketId);
  error.huddleDiagnostic={
    reason:reason || (!state.huddle?'HUDDLE_ENDED':sender?'PARTICIPANT_RECONNECTING':own.length?'SOCKET_CHANGED':'PARTICIPANT_MISSING'),
    huddleId:state.huddle?String(state.huddle._id):null,
    participantCount:state.participants.length,sameUserParticipants:own.length,
    presenceMatched:Boolean(cached?.huddle && String(cached.huddle._id)===String(state.huddle?._id)),
  };
  return error;
}
function signalPeers(state,context,input,time) {
  const sender=state?.participants.find(p=>p.socketId===context.socketId && p.userId===String(context.user._id));
  const target=state?.participants.find(p=>p.id===input.targetSessionId);
  if(!state?.huddle || String(state.huddle._id)!==input.huddleId || !sender || !target || sender===target ||
    sender.connection!=='connected' || target.connection!=='connected' || !sender.audioReady || !target.audioReady ||
    !Number.isFinite(sender.expiresAt) || !Number.isFinite(target.expiresAt) || sender.expiresAt<=time || target.expiresAt<=time ||
    sender.mediaId!==input.fromMediaId || target.mediaId!==input.toMediaId)throw new ForbiddenError('Audio peer is unavailable or belongs to another session');
  return {sender,target};
}

export function createHuddleEngine({authorize,repository,presence,publish,notify=async()=>({sent:0}),mediaCapacity=()=>2,connectedParticipants=async()=>new Set(),now=Date.now}) {
  async function run(context,channelId,action,input={}) {
    if(!/^[a-f\d]{24}$/i.test(channelId || '')) throw new ValidationError('Invalid channel ID');
    if(action!=='sweep') await authorize(context,channelId);
    const key=`${context.workspaceId}:${channelId}`;
    if(action==='signal' && typeof presence.read==='function') {
      const state=await presence.read(key);
      const {target}=signalPeers(state,context,input,now());
      await authorize({workspaceId:context.workspaceId,user:{_id:target.userId},socketId:target.socketId},channelId);
      const active=await repository.active(context.workspaceId,channelId);
      if(!active || String(active._id)!==input.huddleId)throw new ForbiddenError('Active audio meeting is unavailable');
      // Recheck after asynchronous permission/database work: a peer could
      // have left or replaced its media generation while those checks ran.
      const current=signalPeers(await presence.read(key),context,input,now());
      return {route:{socketId:current.target.socketId,channelId,workspaceId:context.workspaceId,huddleId:input.huddleId,
        fromSessionId:current.sender.id,toSessionId:current.target.id,fromMediaId:current.sender.mediaId,toMediaId:current.target.mediaId,signal:input.signal}};
    }
    const completed=await presence(key,async (cached,save)=>{
      const active=await repository.active(context.workspaceId,channelId);
      let state=cached && String(cached.huddle?._id)===String(active?._id) ? structuredClone(cached) :
        {huddle:active,participants:[],revision:Math.max(cached?.revision || 0,now()*1000),emptySince:now()};
      const previousHuddleId=cached?.huddle?._id || active?._id;
      const publicationState=()=>({...publicState(state),...(!state.huddle && previousHuddleId?{endedHuddleId:previousHuddleId}:{})});
      // A record ended outside this presence snapshot must also remove the
      // active strip for subscribers, including when discovered by a get.
      let changed=Boolean(cached?.huddle && String(cached.huddle._id)!==String(active?._id));
      let route;
      let invite=false;
      const before=state.participants.length;
      const overdue=state.participants.filter(p=>p.connection==='connected' && p.expiresAt<=now());
      // A missed renderer timer is not evidence of transport loss. Preserve
      // healthy peer/media state when the exact server-bound socket is alive.
      // Adapter failures defer cleanup rather than treating unknown as offline.
      const connected=overdue.length && state.huddle
        ? await connectedParticipants(context.workspaceId,state.huddle._id,overdue):new Set();
      state.participants=state.participants.filter(p=>{
        if(p.expiresAt>now())return true;
        if(p.connection==='connected' && connected.has(p.id)){
          p.expiresAt=now()+LEASE;return true;
        }
        // A delayed browser heartbeat is not an explicit Leave. Retain the
        // secret-bound identity for a bounded resume window, just as on a
        // transport disconnect. Anchor expiry to the missed lease, not sweeps.
        if(p.connection==='connected' && p.expiresAt+RECONNECT_GRACE>now()) {
          p.expiresAt+=RECONNECT_GRACE;p.connection='reconnecting';
          p.audioReady=false;p.mediaId=null;p.screenSharing=false;p.cameraOn=false;p.handRaised=false;
          changed=true;return true;
        }
        return false;
      });
      if(state.participants.length!==before) changed=true;
      if(before && !state.participants.length) state.emptySince=now();
      if(state.huddle && !state.participants.length && now()-state.emptySince>=GRACE) {
        await repository.end(state.huddle._id); state.huddle=null; changed=true;
      }
      if(action==='start' && !state.huddle) {
        state.huddle=await repository.start(context,channelId);
        state.emptySince=now(); changed=true;
      }
      if(action==='start' || action==='join' || action==='resume') {
        if(!state.huddle) {
          // Expiry may have completed the database record above, or another
          // process may already have ended it. Publish that state before the
          // failed join returns, so clients cannot retain a stale Join strip.
          if(changed || cached?.huddle) {
            state.revision=Math.max(state.revision+1,now()*1000);
            await save(state);publish(context.workspaceId,channelId,publicationState());
          }
          throw new NotFoundError('Active huddle');
        }
        const existing=state.participants.find(p=>p.id===input.sessionId);
        if(action==='resume' && (!existing || existing.userId!==String(context.user._id) || existing.secret!==input.secret)) throw membershipError(new ForbiddenError('Huddle session cannot be resumed'),state,context,cached,existing?'RESUME_REJECTED':'SESSION_MISSING');
        let participant=existing;
        if(action!=='resume') participant=state.participants.find(p=>p.socketId===context.socketId);
        if(!participant) {
          if(state.participants.length>=mediaCapacity()) throw new ValidationError('Huddle participant limit reached');
          participant={id:randomUUID(),secret:randomUUID(),userId:String(context.user._id),name:context.user.name,avatar:context.user.avatar || null};
          state.participants.push(participant); changed=true;
        }
        if(participant.connection!=='connected') changed=true;
        participant.connection='connected';
        if(repository.attend) await repository.attend(state.huddle._id,context.user._id);
        participant.socketId=context.socketId; participant.expiresAt=now()+LEASE;
        state.emptySince=null;
        input.session={id:participant.id,secret:participant.secret};
      } else if(['invite','hand','reaction','notes','screen-state','camera-state','audio-ready','audio-state','audio-config','signal'].includes(action)) {
        const sender=state.participants.find(p=>p.socketId===context.socketId && p.userId===String(context.user._id));
        if(!state.huddle || !sender || sender.connection!=='connected') throw membershipError(new ForbiddenError('Join this huddle before using audio'),state,context,cached);
        if(action==='invite') {
          if(!sender.audioReady)throw new ForbiddenError('Enable audio before inviting participants');
          if(state.lastInviteAt!=null && now()-state.lastInviteAt<15000)throw new ValidationError('Please wait before inviting again');
          state.lastInviteAt=now();invite=true;
        } else if(action==='hand') {
          if(typeof input.raised!=='boolean')throw new ValidationError('Invalid hand state');
          sender.handRaised=input.raised;changed=true;
        } else if(action==='reaction') {
          if(!['👍','❤️','😂','🎉','👏','🙌'].includes(input.emoji))throw new ValidationError('Unsupported reaction');
          sender.reaction={emoji:input.emoji,at:now(),id:randomUUID()};changed=true;
        } else if(action==='notes') {
          if(typeof input.text!=='string' || input.text.length>10000 || !Number.isInteger(input.version))throw new ValidationError('Invalid meeting notes');
          state.huddle=await repository.notes(state.huddle._id,input.text,input.version);changed=true;
        } else if(action==='screen-state') {
          if(!sender.audioReady || typeof input.sharing!=='boolean')throw new ValidationError('Invalid screen sharing state');
          if(input.sharing && state.participants.some(p=>p!==sender && p.screenSharing))throw new ValidationError('Someone is already sharing a screen');
          sender.screenSharing=input.sharing;changed=true;
        } else if(action==='camera-state') {
          if(!sender.audioReady || typeof input.enabled!=='boolean')throw new ValidationError('Invalid camera state');
          sender.cameraOn=input.enabled;changed=true;
        } else if(action==='audio-ready') {
          const capacity=mediaCapacity();
          if(!sender.audioReady && state.participants.filter(p=>p.audioReady).length>=capacity) throw new ValidationError(`This Huddle is full. It currently supports ${capacity===2?'two':capacity} devices.`);
          sender.audioReady=true; sender.screenSharing=false;sender.cameraOn=false; sender.mediaId=randomUUID(); sender.muted=input.muted!==false;
          if(!state.announced && String(state.huddle.startedBy)===sender.userId){state.announced=true;state.lastInviteAt=now();invite=true;}
          changed=true;
        } else if(action==='audio-state') {
          if(!sender.audioReady || typeof input.muted!=='boolean') throw new ValidationError('Invalid audio state');
          sender.muted=input.muted; changed=true;
        } else if(action==='audio-config') {
          if(!sender.audioReady) throw new ForbiddenError('Audio is not enabled for this session');
        } else {
          const target=state.participants.find(p=>p.id===input.targetSessionId);
          if(String(state.huddle._id)!==input.huddleId || !sender.audioReady || sender.mediaId!==input.fromMediaId || !target || target===sender || !target.audioReady || target.connection!=='connected' || target.mediaId!==input.toMediaId) throw new ForbiddenError('Audio peer is unavailable or belongs to another session');
          // Recheck the receiver through the existing membership/permission layer.
          await authorize({workspaceId:context.workspaceId,user:{_id:target.userId},socketId:target.socketId},channelId);
          route={socketId:target.socketId,channelId,workspaceId:context.workspaceId,huddleId:input.huddleId,
            fromSessionId:sender.id,toSessionId:target.id,fromMediaId:sender.mediaId,toMediaId:target.mediaId,signal:input.signal};
        }
        // Authenticated media renewals/actions also prove this device is alive.
        // They must not depend on a separate UI interval winning a Redis lock.
        sender.expiresAt=now()+LEASE;
      } else if(action==='leave' || action==='heartbeat' || action==='disconnect') {
        const participant=state.participants.find(p=>p.socketId===context.socketId);
        if(participant) {
          if(action==='leave') {state.participants=state.participants.filter(p=>p!==participant); changed=true;}
          else {
            if(action==='disconnect' || participant.connection==='connected')participant.expiresAt=now()+(action==='disconnect'?RECONNECT_GRACE:LEASE);
            if(action==='disconnect') {participant.connection='reconnecting';participant.audioReady=false;participant.screenSharing=false;participant.cameraOn=false;participant.handRaised=false;participant.mediaId=null;changed=true;}
          }
        } else if(action==='heartbeat') throw membershipError(new NotFoundError('Huddle participant'),state,context,cached);
      } else if(action==='end') {
        if(state.huddle && String(state.huddle.startedBy)!==String(context.user._id) && !['owner','admin'].includes(context.membership.role)) throw new ForbiddenError('Only the starter or workspace owner/admin can end this huddle');
        if(state.huddle) await repository.end(state.huddle._id);
        state.huddle=null; state.participants=[]; changed=true;
      }
      if(!state.participants.length && state.emptySince===null) state.emptySince=now();
      if(changed) state.revision=Math.max(state.revision+1,now()*1000);
      await save(state);
      const result=publicState(state);
      if(changed) publish(context.workspaceId,channelId,publicationState());
      return {...result,inviteRequested:invite,...(input.session?{session:input.session}: {}),...(route?{route}: {})};
    });
    // Recipient queries/delivery must not hold the distributed presence lock.
    const {inviteRequested,...result}=completed;
    const invitation=inviteRequested?await notify(context,channelId,result):undefined;
    return {...result,...(invitation?{invitation}:{})};
  }
  return {run};
}
