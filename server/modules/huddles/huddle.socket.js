import service from './huddle.service.js';
import logger from '../../utils/logger.js';
import {runSocketHuddle} from './huddleSession.js';
import {createRtcConfiguration} from './huddleRtcConfig.js';
import {validateAudioSignal} from './huddleSignaling.js';
import {mediaSettings,createSfuConfiguration} from './huddleMediaConfig.js';

export default function registerHuddleSocket(io,socket,huddleService=service) {
  let operations=0, windowStart=Date.now();
  let signals=0, signalWindow=Date.now();
  const context=()=>({user:socket.chatUser,workspaceId:socket.workspaceId,socketId:socket.id});
  for(const action of ['get','start','join','resume','leave','end','heartbeat']) {
    socket.on(`huddle:${action}`,async(payload={},ack)=>{
      if(typeof ack!=='function') return;
      try {
        if(Date.now()-windowStart>60000){operations=0;windowStart=Date.now();}
        if(++operations>120) throw new Error('Too many huddle requests. Try again shortly.');
        if(!payload || typeof payload!=='object') throw new Error('Invalid huddle request');
        const channelId=payload.channelId;
        const result=await runSocketHuddle(socket,channelId,action,{sessionId:payload.sessionId,secret:payload.secret},huddleService);
        ack({success:true,data:result});
      } catch(error) {
        if(['FORBIDDEN','NOT_FOUND','UNAUTHORIZED'].includes(error.code) && socket.data.huddle) {
          socket.leave(socket.data.huddle.room);socket.data.huddle=null;
        }
        logger.warn('Huddle operation failed',{action,userId:String(socket.chatUser._id),code:error.code || 'HUDDLE_ERROR'});
        ack({success:false,error:{message:error.message,code:error.code || 'HUDDLE_ERROR'}});
      }
    });
  }
  for(const action of ['invite','hand','reaction','notes','screen-state','audio-ready','audio-state','audio-config','signal']) {
    socket.on(`huddle:${action}`,async(payload={},ack)=>{
      if(typeof ack!=='function')return;
      try {
        if(Date.now()-signalWindow>60000){signals=0;signalWindow=Date.now();}
        if(++signals>240) throw new Error('Too many audio requests');
        if(!payload || typeof payload!=='object' || socket.data.huddle?.channelId!==payload.channelId) throw new Error('Join this huddle first');
        if(action==='audio-ready' || action==='audio-config') {
          mediaSettings();
          const config=createRtcConfiguration(socket.data.huddle.sessionId);
          const state=await huddleService.run(context(),payload.channelId,action,{muted:payload.muted});
          const media=await createSfuConfiguration(context(),state,socket.data.huddle.sessionId);
          ack({success:true,data:{state,...config,...media}});
        } else if(['invite','hand','reaction','notes','screen-state'].includes(action)) {
          const state=await huddleService.run(context(),payload.channelId,action,{raised:payload.raised,emoji:payload.emoji,text:payload.text,version:payload.version,sharing:payload.sharing});
          const {invitation,...snapshot}=state;
          ack({success:true,data:{state:snapshot,...(invitation?{invitation}:{})}});
        } else if(action==='audio-state') {
          const state=await huddleService.run(context(),payload.channelId,action,{muted:payload.muted});
          ack({success:true,data:{state}});
        } else {
          if(mediaSettings().mode==='sfu')throw new Error('This meeting requires the current TaskChat SFU client');
          const signal=validateAudioSignal(payload.signal);
          const result=await huddleService.run(context(),payload.channelId,'signal',{
            targetSessionId:payload.targetSessionId,huddleId:payload.huddleId,
            fromMediaId:payload.fromMediaId,toMediaId:payload.toMediaId,signal,
          });
          const {socketId,...event}=result.route;
          io.to(socketId).emit('huddle:signal',event);
          ack({success:true,data:{delivered:true}});
        }
      } catch(error) {
        logger.warn('Huddle audio operation failed',{action,code:error.code || 'HUDDLE_AUDIO'});
        ack({success:false,error:{message:error.message,code:error.code || 'HUDDLE_AUDIO'}});
      }
    });
  }
  socket.on('disconnect',()=>{
    const current=socket.data.huddle;
    if(!current) return;
    huddleService.run({...context(),workspaceId:current.workspaceId},current.channelId,'disconnect')
      .catch(error=>logger.warn('Huddle disconnect lease update failed',{code:error.code || 'HUDDLE_ERROR'}));
  });
}

// Called only after the existing workspace-switch handler validates membership
// and changes the socket context. Rejected switches must not remove a session.
export function leaveHuddleForWorkspaceSwitch(socket) {
  const current=socket.data.huddle;
  if(!current)return;
  socket.data.huddle=null;
  if(current.room)socket.leave(current.room);
  service.run({user:socket.chatUser,workspaceId:current.workspaceId,socketId:socket.id},current.channelId,'leave')
    .catch(error=>logger.warn('Huddle workspace leave failed',{code:error.code || 'HUDDLE_ERROR'}));
}
