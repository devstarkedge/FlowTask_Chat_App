import {Router} from 'express';
import {protect} from '../auth/auth.middleware.js';
import {resolveWorkspace} from '../../middleware/workspaceContext.js';
import asyncHandler from '../../middleware/asyncHandler.js';
import {createRateLimiter} from '../../middleware/rateLimiter.js';
import {ForbiddenError,ValidationError} from '../../middleware/errorHandler.js';
import {getIO} from '../../sockets/socketManager.js';
import service from './huddle.service.js';
import {runSocketHuddle} from './huddleSession.js';
const router=Router();
router.use(protect,resolveWorkspace,createRateLimiter({windowMs:60000,max:120,prefix:'huddle'}));
router.get('/channel/:channelId',asyncHandler(async(req,res)=>{
  const data=await service.run({user:req.user,workspaceId:req.workspaceId},req.params.channelId,'get');
  res.json({success:true,data});
}));
// Presence belongs to a verified live TaskChat socket, never a caller-supplied user.
for(const action of ['start','join','leave','end']) {
  router.post(`/${action}`,asyncHandler(async(req,res)=>{
    const socket=getIO()?.sockets.sockets.get(req.body.socketId);
    if(!socket || String(socket.chatUser?._id)!==String(req.user._id) || socket.workspaceId!==req.workspaceId) throw new ForbiddenError('A connected session in this workspace is required');
    if(!req.body.channelId) throw new ValidationError('channelId is required');
    const data=await runSocketHuddle(socket,req.body.channelId,action);
    res.json({success:true,data});
  }));
}
export default router;
