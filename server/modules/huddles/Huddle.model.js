import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  workspaceId: {type:mongoose.Schema.Types.ObjectId,ref:'Workspace',required:true},
  channelId: {type:mongoose.Schema.Types.ObjectId,ref:'Channel',required:true},
  startedBy: {type:mongoose.Schema.Types.ObjectId,ref:'ChatUser',required:true},
  status: {type:String,enum:['active','ended'],default:'active',required:true},
  startedAt: {type:Date,default:Date.now}, endedAt: Date,
  notes: {type:String,default:'',maxlength:10000},
  notesVersion: {type:Number,default:0},
  mediaNodeId: {type:String,default:null},
  attendees: [{type:mongoose.Schema.Types.ObjectId,ref:'ChatUser'}],
}, {timestamps:true});
schema.index({workspaceId:1,channelId:1},{unique:true,partialFilterExpression:{status:'active'}});
schema.index({status:1,_id:1});
export default mongoose.models.Huddle || mongoose.model('Huddle',schema);
