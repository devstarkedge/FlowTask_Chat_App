import {AppError} from '../../middleware/errorHandler.js';

// Recovery data contains session secrets and must only be read through the
// model's explicitly selected private field, never a public Huddle response.
export function createHuddleCheckpoint(model) {
  const scope=key=>{const [workspaceId,channelId]=key.split(':');return {workspaceId,channelId,status:'active'};};
  return {
    async load(key){
      const row=await model.findOne(scope(key)).select({_id:1,presenceCheckpoint:1}).lean();
      const snapshot=row?.presenceCheckpoint;
      return snapshot && String(snapshot.huddle?._id)===String(row._id)?snapshot:null;
    },
    async save(key,state){
      if(!state.huddle)return;
      const result=await model.updateOne({...scope(key),_id:state.huddle._id,
        $or:[{presenceCheckpoint:null},{'presenceCheckpoint.revision':{$lte:state.revision}}]},
      {$set:{presenceCheckpoint:state}},{timestamps:false});
      if(!result.matchedCount)throw new AppError('Huddle session changed. Reconnect to sync its state.',503,'HUDDLE_UNAVAILABLE');
    },
  };
}
