import {create} from 'zustand';
import {sendHuddleRequest as request} from '../services/huddleRequest';
import {startHuddleAudio,stopHuddleAudio} from '../services/huddleAudioService';
import {useHuddleUiStore} from './huddleUiStore';

let generation=0;
export const useHuddleStore=create((set,get)=>({
  byChannel:{},session:null,busy:false,error:null,
  ingest:(channelId,state)=>set(current=>{
    const previous=current.byChannel[channelId];
    if(previous && previous.revision>state.revision)return current;
    const {session:credentials,...snapshot}=state;
    return {byChannel:{...current.byChannel,[channelId]:snapshot},
      session:current.session?.channelId===channelId && !state.huddle ? null : current.session};
  }),
  load:async channelId=>{
    const epoch=generation;
    try {const data=await request('get',{channelId});if(epoch===generation)get().ingest(channelId,data);}
    catch(error){if(epoch===generation)set({error:error.message});}
  },
  act:async(action,channelId)=>{
    if(get().busy)return;
    const epoch=generation;
    if(action==='leave' && get().session?.channelId===channelId) {
      stopHuddleAudio();set({session:null,error:null});
      request('leave',{channelId}).catch(()=>{});
      return;
    }
    set({busy:true,error:null});
    try {
      if(['leave','end'].includes(action) && get().session?.channelId===channelId)stopHuddleAudio();
      if(['start','join'].includes(action) && get().session && get().session.channelId!==channelId)throw new Error('Leave your current huddle first.');
      const data=await request(action,{channelId});
      if(epoch!==generation)return;
      get().ingest(channelId,data);
      if(data.session) {
        const session={...data.session,channelId};set({session});
        try {await startHuddleAudio(channelId,session);}
        catch(error) {
          if(epoch===generation){try {await request('leave',{channelId});}catch(cleanupError){error.message+=` Session cleanup is pending: ${cleanupError.message}`;}set({session:null});}
          throw error;
        }
      }
      if(action==='leave' || action==='end')set({session:null});
    } catch(error){if(epoch===generation)set({error:error.message});}
    finally {if(epoch===generation)set({busy:false});}
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
    try {await request('heartbeat',{channelId:current.channelId});}
    catch(error){if(epoch===generation && get().session?.id===current.id)set({error:error.message,...(['FORBIDDEN','NOT_FOUND','UNAUTHORIZED'].includes(error.code)?{session:null}: {})});}
  },
  expireNetworkSession:id=>{
    const current=get().session;if(current?.id!==id)return;
    generation++;stopHuddleAudio();
    set({session:null,busy:false,error:'Huddle ended because the connection could not recover within 5 minutes.'});
    request('leave',{channelId:current.channelId}).catch(()=>{});
  },
  reset:()=>{generation++;stopHuddleAudio();useHuddleUiStore.getState().closePanel();set({byChannel:{},session:null,busy:false,error:null});},
}));
