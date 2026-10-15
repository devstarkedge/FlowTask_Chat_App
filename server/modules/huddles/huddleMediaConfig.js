import {createHash} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {AppError} from '../../middleware/errorHandler.js';
import Huddle from './Huddle.model.js';

export function mediaSettings(source=process.env) {
  const mode=source.HUDDLE_MEDIA_MODE || 'p2p';
  if(!['p2p','sfu'].includes(mode))throw new AppError('Invalid Huddle media mode',503,'HUDDLE_CONFIG');
  if(mode==='p2p'){
    if(source.NODE_ENV==='production')throw new AppError('Production Huddles require TaskChat SFU configuration',503,'HUDDLE_CONFIG');
    return {mode,maxPeers:2};
  }
  const secret=source.HUDDLE_MEDIA_SECRET;
  let nodes;try{nodes=JSON.parse(source.HUDDLE_MEDIA_NODES || '[]');}catch{throw new AppError('Invalid Huddle media nodes',503,'HUDDLE_CONFIG');}
  const maxPeers=Number(source.HUDDLE_MAX_PEERS || 32);
  if(!secret || secret.length<32 || /REPLACE|CHANGE_ME/.test(secret) || !Array.isArray(nodes) || !nodes.length || nodes.length>100 || !Number.isInteger(maxPeers) || maxPeers<2 || maxPeers>50)throw new AppError('TaskChat SFU configuration is incomplete',503,'HUDDLE_CONFIG');
  const ids=new Set();
  for(const node of nodes){let url;try{url=new URL(node.url);}catch{throw new AppError('Invalid media node URL',503,'HUDDLE_CONFIG');}if(!/^[a-z0-9-]{1,50}$/.test(node.id || '') || ids.has(node.id) || url.username || url.password || url.search || url.hash || (url.protocol!=='https:' && !(source.NODE_ENV!=='production' && url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))))throw new AppError('Invalid media node configuration',503,'HUDDLE_CONFIG');ids.add(node.id);}
  return {mode,maxPeers,nodes,secret};
}
export function chooseMediaNode(huddleId,nodes) {
  return nodes.reduce((best,node)=>{const score=createHash('sha256').update(`${huddleId}:${node.id}`).digest('hex');return !best || score>best.score?{node,score}:best;},null).node;
}
export async function createSfuConfiguration(context,state,sessionId,{source=process.env,model=Huddle,now=Date.now()}={}) {
  const settings=mediaSettings(source);if(settings.mode!=='sfu')return {mediaMode:'p2p'};
  const own=state.participants.find(p=>p.id===sessionId && p.userId===String(context.user._id));
  if(!own?.audioReady)throw new AppError('Join audio before requesting media access',403,'FORBIDDEN');
  const selected=chooseMediaNode(String(state.huddle._id),settings.nodes);
  // Pin a meeting to its media node across API replicas/restarts. Never silently
  // move an active room when the configured pool changes.
  await model.updateOne({_id:state.huddle._id,workspaceId:context.workspaceId,status:'active',mediaNodeId:null},{$set:{mediaNodeId:selected.id}});
  const row=await model.findOne({_id:state.huddle._id,workspaceId:context.workspaceId,status:'active'}).select('mediaNodeId').lean();
  const node=settings.nodes.find(n=>n.id===row?.mediaNodeId);if(!node)throw new AppError('This meeting media node is unavailable',503,'HUDDLE_MEDIA_UNAVAILABLE');
  const expiresAt=Math.floor(now/1000)+60;
  const token=jwt.sign({workspaceId:String(context.workspaceId),channelId:String(state.huddle.channelId),huddleId:String(state.huddle._id),sessionId,mediaId:own.mediaId,userId:String(context.user._id),screenAllowed:own.screenSharing===true,cameraAllowed:own.cameraOn===true,exp:expiresAt,iat:Math.floor(now/1000)},settings.secret,{algorithm:'HS256',issuer:'taskchat-huddles',audience:`taskchat-media:${node.id}`});
  return {mediaMode:'sfu',media:{url:node.url,token},mediaExpiresAt:expiresAt,mediaRenewAfterMs:30000,maxPeers:settings.maxPeers};
}
