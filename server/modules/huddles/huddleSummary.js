// A stable Mongo message ID makes completion replayable after a process failure.
export async function completeHuddle(huddle,{messages,users,huddles,channels,publish,serialize,now=()=>new Date()}) {
  const endedAt=huddle.endedAt || now();
  const seconds=Math.max(0,Math.floor((endedAt-new Date(huddle.startedAt))/1000));
  const author=await users.findById(huddle.startedBy).select('name avatar').lean();
  await messages.updateOne({_id:huddle._id},{$setOnInsert:{workspaceId:huddle.workspaceId,channelId:huddle.channelId,authorId:huddle.startedBy,
    senderSnapshot:{name:author?.name || 'Huddle',avatar:author?.avatar || null},contentType:'system',
    content:`Huddle ended · ${Math.floor(seconds/60)}m ${seconds%60}s · ${huddle.attendees?.length || 0} participants`,
    huddleMeta:{huddleId:huddle._id,startedAt:huddle.startedAt,endedAt,notes:huddle.notes || '',attendees:huddle.attendees || []},
    // This insert owns both timestamps. Mongoose must not also add
    // $set.updatedAt, which conflicts with $setOnInsert.updatedAt in MongoDB.
    // Insert-only timestamps also keep a retry from changing the chat record.
    createdAt:endedAt,updatedAt:endedAt}},{upsert:true,timestamps:false});
  const message=await messages.findById(huddle._id).lean();
  const completion=message.huddleMeta.endedAt;
  await channels.updateOne({_id:huddle.channelId,workspaceId:huddle.workspaceId,$or:[{lastMessageAt:{$lte:completion}},{lastMessageAt:null}]},{$set:{lastMessagePreview:'Huddle ended',lastMessageAt:completion}});
  await huddles.updateOne({_id:huddle._id,status:'active'},{$set:{status:'ended',endedAt:completion}});
  // Re-emitting the same ID is safe for the existing message-ID reconciliation.
  publish(String(huddle.channelId),'message:create',{message:serialize(message)},String(huddle.workspaceId));
  return message;
}
