import Huddle from './Huddle.model.js';
import service from './huddle.service.js';
import logger from '../../utils/logger.js';
export function startHuddleSweeper() {
  let running=false,cursor=null;
  const timer=setInterval(async()=>{
    if(running)return;
    running=true;
    try {
      const rows=await Huddle.find({status:'active',...(cursor?{_id:{$gt:cursor}}:{})}).sort({_id:1}).limit(100).lean();
      cursor=rows.at(-1)?._id || null;
      for(const row of rows) {
        try {await service.run({workspaceId:String(row.workspaceId)},String(row.channelId),'sweep');}
        catch(error) {logger.warn('Huddle cleanup deferred',{huddleId:String(row._id),code:error.code || 'HUDDLE_ERROR'});}
      }
    } catch(error) {logger.warn('Huddle sweep failed',{code:error.code || 'HUDDLE_ERROR'});}
    finally {running=false;}
  },10000);
  timer.unref();
  return ()=>clearInterval(timer);
}
