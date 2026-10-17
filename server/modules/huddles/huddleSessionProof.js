import {createHash,timingSafeEqual} from 'node:crypto';
import {buildRoomName} from '../../config/constants.js';

export function createSessionProof(context,channelId,huddleId,session){
  if(typeof session.secret!=='string')return {};
  return {socketId:context.socketId,userId:String(context.user._id),huddleId:String(huddleId),
    resumeHash:createHash('sha256').update(session.secret).digest('hex')};
}

export function matchesSessionBinding(binding,context,channelId,huddleId){
  return Boolean(binding && binding.socketId===context.socketId && binding.userId===String(context.user._id) &&
    String(binding.workspaceId)===String(context.workspaceId) && binding.channelId===channelId &&
    binding.huddleId===String(huddleId) && binding.room===buildRoomName(context.workspaceId,'huddle',String(huddleId)) &&
    /^[a-f\d]{64}$/.test(binding.resumeHash || ''));
}

export function verifiesSessionProof(context,channelId,huddleId,input){
  const binding=context.huddleBinding;
  if(!matchesSessionBinding(binding,context,channelId,huddleId) || binding.sessionId!==input.sessionId ||
    typeof input.secret!=='string' || input.secret.length>256)return false;
  const digest=createHash('sha256').update(input.secret).digest();
  return timingSafeEqual(digest,Buffer.from(binding.resumeHash,'hex'));
}
