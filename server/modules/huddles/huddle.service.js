import Huddle from './Huddle.model.js';
import {createHuddleEngine} from './huddleEngine.js';
import {withPresence} from './huddlePresence.js';
import channelService from '../channels/channel.service.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import {ForbiddenError} from '../../middleware/errorHandler.js';
import {emitToChannel,getIO} from '../../sockets/socketManager.js';
import {buildRoomName} from '../../config/constants.js';
import ChatUser from '../users/ChatUser.model.js';
import {initializeHuddles} from './huddle.initialize.js';
import logger from '../../utils/logger.js';
import Message from '../messages/Message.model.js';
import Channel from '../channels/Channel.model.js';
import {completeHuddle} from './huddleSummary.js';
import {messageSocketPayload} from '../../utils/socketPayload.js';
import {ValidationError} from '../../middleware/errorHandler.js';

const engine=createHuddleEngine({
  presence:withPresence,
  authorize:async(context,channelId)=>{
    await initializeHuddles();
    const user=await ChatUser.findById(context.user?._id).select('_id name avatar isActive').lean();
    if(!user?.isActive) throw new ForbiddenError('User is inactive');
    context.user=user;
    const membership=await WorkspaceMembership.findOne({userId:context.user._id,workspaceId:context.workspaceId,isActive:true}).lean();
    if(!membership) throw new ForbiddenError('Workspace membership is required');
    context.membership=membership;
    const channel=await channelService.getChannelById(channelId,context.user._id,context.workspaceId,membership);
    if(channel.isArchived) throw new ForbiddenError('Channel is archived');
  },
  repository:{
    active:async(workspaceId,channelId)=>{
      const row=await Huddle.findOne({workspaceId,channelId,status:'active'}).lean();
      return row ? JSON.parse(JSON.stringify(row)) : null;
    },
    start:async(context,channelId)=>{
      let row;
      try {row=await Huddle.findOneAndUpdate({workspaceId:context.workspaceId,channelId,status:'active'},{$setOnInsert:{startedBy:context.user._id,startedAt:new Date()}},{upsert:true,new:true,setDefaultsOnInsert:true}).lean();}
      catch(error) {if(error.code!==11000) throw error; row=await Huddle.findOne({workspaceId:context.workspaceId,channelId,status:'active'}).lean();}
      return JSON.parse(JSON.stringify(row));
    },
    attend:(id,userId)=>Huddle.updateOne({_id:id},{$addToSet:{attendees:userId}}),
    notes:async(id,text,version)=>{
      const row=await Huddle.findOneAndUpdate({_id:id,status:'active',notesVersion:version},{$set:{notes:text},$inc:{notesVersion:1}},{new:true}).lean();
      if(!row)throw new ValidationError('Notes changed. Reopen notes to load the latest version before saving.');
      return JSON.parse(JSON.stringify(row));
    },
    end:async id=>{
      const huddle=await Huddle.findById(id).lean();
      if(!huddle)return;
      await completeHuddle(huddle,{messages:Message,users:ChatUser,huddles:Huddle,channels:Channel,publish:emitToChannel,serialize:messageSocketPayload});
    },
  },
  publish:(workspaceId,channelId,state)=>{
    logger.info('Huddle lifecycle updated',{workspaceId,channelId,huddleId:state.huddle?._id || null,event:state.huddle?'active':'ended',participants:state.participants.length,revision:state.revision});
    const room=buildRoomName(workspaceId,'huddle',channelId);
    emitToChannel(channelId,'huddle:state',{channelId,workspaceId,...state},workspaceId,room);
    if(!state.huddle)getIO()?.in(room).socketsLeave(room);
  },
});
export default engine;
