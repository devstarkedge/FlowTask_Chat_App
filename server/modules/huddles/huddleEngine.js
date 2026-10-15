import {randomUUID} from 'node:crypto';
import {ForbiddenError, NotFoundError, ValidationError} from '../../middleware/errorHandler.js';
const GRACE=30000, RECONNECT_GRACE=300000, LEASE=60000;
const publicState = state => ({huddle:state.huddle, revision:state.revision,
  participants:state.participants.map(({secret,socketId,expiresAt,...profile})=>profile)});

export function createHuddleEngine({authorize,repository,presence,publish,notify=async()=>({sent:0}),mediaCapacity=()=>2,now=Date.now}) {
  async function run(context,channelId,action,input={}) {
    if(!/^[a-f\d]{24}$/i.test(channelId || '')) throw new ValidationError('Invalid channel ID');
    if(action!=='sweep') await authorize(context,channelId);
    const key=`${context.workspaceId}:${channelId}`;
    const completed=await presence(key,async (cached,save)=>{
      const active=await repository.active(context.workspaceId,channelId);
      let state=cached && String(cached.huddle?._id)===String(active?._id) ? structuredClone(cached) :
        {huddle:active,participants:[],revision:Math.max(cached?.revision || 0,now()*1000),emptySince:now()};
      // A record ended outside this presence snapshot must also remove the
      // active strip for subscribers, including when discovered by a get.
      let changed=Boolean(cached?.huddle && String(cached.huddle._id)!==String(active?._id));
      let route;
      let invite=false;
      const before=state.participants.length;
      state.participants=state.participants.filter(p=>p.expiresAt>now());
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
            await save(state);publish(context.workspaceId,channelId,publicState(state));
          }
          throw new NotFoundError('Active huddle');
        }
        const existing=state.participants.find(p=>p.id===input.sessionId);
        if(action==='resume' && (!existing || existing.userId!==String(context.user._id) || existing.secret!==input.secret)) throw new ForbiddenError('Huddle session cannot be resumed');
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
        if(!state.huddle || !sender || sender.connection!=='connected') throw new ForbiddenError('Join this huddle before using audio');
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
      } else if(action==='leave' || action==='heartbeat' || action==='disconnect') {
        const participant=state.participants.find(p=>p.socketId===context.socketId);
        if(participant) {
          if(action==='leave') {state.participants=state.participants.filter(p=>p!==participant); changed=true;}
          else {
            participant.expiresAt=now()+(action==='disconnect'?RECONNECT_GRACE:LEASE);
            if(action==='disconnect') {participant.connection='reconnecting';participant.audioReady=false;participant.screenSharing=false;participant.cameraOn=false;participant.handRaised=false;participant.mediaId=null;changed=true;}
          }
        } else if(action==='heartbeat') throw new NotFoundError('Huddle participant');
      } else if(action==='end') {
        if(state.huddle && String(state.huddle.startedBy)!==String(context.user._id) && !['owner','admin'].includes(context.membership.role)) throw new ForbiddenError('Only the starter or workspace owner/admin can end this huddle');
        if(state.huddle) await repository.end(state.huddle._id);
        state.huddle=null; state.participants=[]; changed=true;
      }
      if(!state.participants.length && state.emptySince===null) state.emptySince=now();
      if(changed) state.revision=Math.max(state.revision+1,now()*1000);
      await save(state);
      const result=publicState(state);
      if(changed) publish(context.workspaceId,channelId,result);
      return {...result,inviteRequested:invite,...(input.session?{session:input.session}: {}),...(route?{route}: {})};
    });
    // Recipient queries/delivery must not hold the distributed presence lock.
    const {inviteRequested,...result}=completed;
    const invitation=inviteRequested?await notify(context,channelId,result):undefined;
    return {...result,...(invitation?{invitation}:{})};
  }
  return {run};
}
