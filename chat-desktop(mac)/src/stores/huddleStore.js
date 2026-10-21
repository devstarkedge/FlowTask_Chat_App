import {create} from 'zustand';
import {sendHuddleRequest as request} from '../services/huddleRequest';
import {startHuddleAudio,stopHuddleAudio} from '../services/huddleAudioService';
import {useHuddleUiStore} from './huddleUiStore';
import {huddleLogger} from '../features/huddle/utils/huddle.logger';

let generation=0,identityGeneration=0,pendingOperation=null;
const pendingLeaves=new Map();
function leaveRemotely(channelId,epoch,onState,registration) {
  const identity=identityGeneration;
  const ready=registration?Promise.resolve(registration).catch(()=>{}):Promise.resolve();
  const pending=ready.then(()=>identity===identityGeneration?request('leave',{channelId}):null)
    .then(data=>{if(data && epoch===generation)onState(data);}).catch(()=>{});
  pendingLeaves.set(channelId,pending);
  pending.finally(()=>{if(pendingLeaves.get(channelId)===pending)pendingLeaves.delete(channelId);});
  return pending;
}
export const useHuddleStore=create((set,get)=>({
  byChannel:{},session:null,busy:false,operation:null,error:null,errorCode:null,
  ingest:(channelId,state)=>{
    const previous=get().byChannel[channelId];
    if(previous && previous.revision>state.revision)return;
    const ended=get().session?.channelId===channelId && !state.huddle;
    if(ended){generation++;pendingOperation=null;stopHuddleAudio();}
    const {session:credentials,...snapshot}=state;
    set(current=>({byChannel:{...current.byChannel,[channelId]:snapshot},
      ...(ended?{session:null,busy:false,operation:null}: {})}));
  },
  load:async channelId=>{
    const epoch=generation;
    try {const data=await request('get',{channelId});if(epoch===generation){get().ingest(channelId,data);if(!get().session)set({error:null});}}
    catch(error){if(epoch===generation)set({error:error.message});}
  },
  act:async(action,channelId)=>{
    // Leave cancels capture immediately, including while the permission prompt
    // or lifecycle acknowledgement is pending. Remote cleanup follows admission.
    if(action==='leave' && (get().session?.channelId===channelId || pendingOperation?.channelId===channelId)) {
      const registration=pendingOperation?.registration;
      generation++;pendingOperation=null;
      const epoch=generation;
      stopHuddleAudio();set({session:null,busy:false,operation:null,error:null,errorCode:null});
      huddleLogger.debug('LEAVE');
      leaveRemotely(channelId,epoch,data=>{if(!get().session)get().ingest(channelId,data);},registration);
      return;
    }
    if(action==='leave' || get().busy)return;
    if(['start','join'].includes(action) && get().session?.channelId===channelId)return;
    if(!channelId)return;
    const epoch=generation;
    const operation={channelId,registration:null};pendingOperation=operation;
    set({busy:true,operation:action==='start'?'starting':action==='join'?'joining':action==='end'?'leaving':null,error:null,errorCode:null});
    huddleLogger.debug(action.toUpperCase());
    try {
      if(['leave','end'].includes(action) && get().session?.channelId===channelId)stopHuddleAudio();
      if(['start','join'].includes(action) && get().session && get().session.channelId!==channelId)throw new Error('Leave your current huddle first.');
      if(['start','join'].includes(action) && pendingLeaves.size)await Promise.all([...pendingLeaves.values()]);
      if(epoch!==generation)return;
      if(action==='join') {
        // The channel strip may have been rendered before the last participant
        // left. Never use its cached record as proof that a meeting is active.
        const current=await request('get',{channelId});
        if(epoch!==generation)return;
        get().ingest(channelId,current);
        if(!current.huddle)throw new Error('This Huddle has ended. Start a new Huddle to call again.');
      }
      operation.registration=request(action,{channelId});
      const data=await operation.registration;
      if(epoch!==generation)return;
      get().ingest(channelId,data);
      if(data.session && String(get().byChannel[channelId]?.huddle?._id)!==String(data.huddle?._id))throw Object.assign(new Error('This Huddle has ended. Start a new Huddle to call again.'),{code:'HUDDLE_ALREADY_ENDED'});
      if(data.session) {
        const session={...data.session,channelId};set({session});
        try {await startHuddleAudio(channelId,session);}
        catch(error) {
          if(epoch===generation){try {await request('leave',{channelId});}catch(cleanupError){error.message+=` Session cleanup is pending: ${cleanupError.message}`;}set({session:null});}
          throw error;
        }
      }
      if(action==='leave' || action==='end')set({session:null});
    } catch(error){
      if(epoch!==generation)return;
      if(action==='join' && error.code==='NOT_FOUND') {
        // Handle a meeting ending between the preflight and the join itself.
        try {
          const current=await request('get',{channelId});
          if(epoch!==generation)return;
          get().ingest(channelId,current);
          error.message=current.huddle?'The active Huddle changed. Try Join again.':'This Huddle has ended. Start a new Huddle to call again.';
        } catch {/* Keep the original error if the refresh also fails. */}
      }
      if(epoch===generation)set({error:error.message,errorCode:error.code || 'SIGNALING_FAILED'});
    }
    finally {if(pendingOperation===operation)pendingOperation=null;if(epoch===generation)set({busy:false,operation:null});}
  },
  resume:async()=>{
    const current=get().session,epoch=generation;
    if(!current)return false;
    try {
      const data=await request('resume',{channelId:current.channelId,sessionId:current.id,secret:current.secret});
      if(epoch!==generation || get().session?.id!==current.id)return false;
      get().ingest(current.channelId,data);set({error:null});
      return Boolean(get().session);
    } catch(error){
      if(epoch===generation && get().session?.id===current.id) {
        // Transport timeouts and lock contention do not revoke membership.
        // Keep the session secret so the next reconnect attempt can resume it.
        const revoked=['FORBIDDEN','NOT_FOUND','UNAUTHORIZED'].includes(error.code);
        set({...(revoked?{session:null}:{}),error:error.message});
      }
      return false;
    }
  },
  heartbeat:async()=>{
    const current=get().session,epoch=generation;if(!current)return;
    try {
      const data=await request('heartbeat',{channelId:current.channelId});
      if(epoch!==generation || get().session?.id!==current.id)return;
      get().ingest(current.channelId,data);
      return data.participants?.some(p=>p.id===current.id && p.connection==='connected')===true;
    }
    catch(error){
      if(epoch===generation && get().session?.id===current.id)set({error:error.message,...(['FORBIDDEN','UNAUTHORIZED'].includes(error.code)?{session:null}: {})});
      // Missing heartbeat membership needs a secret-checked resume before we
      // decide that the meeting/session is genuinely gone.
      return error.code==='NOT_FOUND'?false:undefined;
    }
  },
  expireNetworkSession:id=>{
    const current=get().session;if(current?.id!==id)return;
    generation++;pendingOperation=null;stopHuddleAudio();
    set({session:null,busy:false,operation:null,error:'Huddle ended because the connection could not recover within 5 minutes.'});
    leaveRemotely(current.channelId,generation,data=>{if(!get().session)get().ingest(current.channelId,data);});
  },
  reset:()=>{generation++;identityGeneration++;pendingOperation=null;pendingLeaves.clear();stopHuddleAudio();useHuddleUiStore.getState().closePanel();set({byChannel:{},session:null,busy:false,operation:null,error:null,errorCode:null});},
}));
