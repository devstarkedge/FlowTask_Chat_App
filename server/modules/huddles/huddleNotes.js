// One durable card per meeting, separate from the eventual completion summary.
export async function publishHuddleNotes(huddle,{messages,users,channels,publish,serialize,now=()=>new Date()}) {
  // Allocated on the first save, preserving chronological ObjectId pagination.
  const id=huddle.notesMessageId;
  if(!id)throw new Error('Meeting notes message identity is missing');
  const author=await users.findById(huddle.startedBy).select('name avatar').lean();
  const savedAt=now();
  const result=await messages.updateOne({_id:id}, {
    $setOnInsert:{workspaceId:huddle.workspaceId,channelId:huddle.channelId,authorId:huddle.startedBy,
      senderSnapshot:{name:author?.name || 'Huddle',avatar:author?.avatar || null},
      contentType:'system',createdAt:savedAt},
    $set:{content:'Meeting notes',updatedAt:savedAt,
      huddleMeta:{kind:'notes',huddleId:huddle._id,startedAt:huddle.startedAt,
        notes:huddle.notes || '',attendees:huddle.attendees || []}},
  },{upsert:true,timestamps:false});
  const message=await messages.findById(id).lean();
  if(result.upsertedCount){
    await channels.updateOne({_id:huddle.channelId,workspaceId:huddle.workspaceId,
      $or:[{lastMessageAt:{$lte:savedAt}},{lastMessageAt:null}]},
    {$set:{lastMessagePreview:'Meeting notes',lastMessageAt:savedAt}});
  }
  publish(String(huddle.channelId),result.upsertedCount?'message:create':'message:update',
    {message:serialize(message)},String(huddle.workspaceId));
  return message;
}
