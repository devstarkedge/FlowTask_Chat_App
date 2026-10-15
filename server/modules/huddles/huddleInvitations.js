import {randomUUID} from 'node:crypto';

// Send to authenticated personal sockets, independent of the channel being viewed.
export async function deliverHuddleInvitations(context,channelId,state,{getSockets,getChannel,getMembers,authorize,allowsNotification,emit,now=Date.now}) {
  const sockets=await getSockets();
  const users=[...new Set(sockets.filter(s=>String(s.workspaceId)===String(context.workspaceId) && s.chatUser?._id && String(s.chatUser._id)!==String(context.user._id)).map(s=>String(s.chatUser._id)))];
  const channel=await getChannel(channelId,context.workspaceId);
  if(!channel || channel.isArchived)return {sent:0};
  const members=await getMembers(channelId,context.workspaceId,users);
  const eligible=new Set(members.filter(m=>m.isActive!==false && m.notificationsEnabled!==false).map(m=>String(m.userId)));
  // Legacy DMs may predate the separate ChannelMember collection. Their
  // stored participant IDs are still verified through current authorization.
  if(channel.type==='dm')for(const id of channel.dmParticipants || []) {
    const entry=members.find(member=>String(member.userId)===String(id));
    if(!entry || (entry.isActive!==false && entry.notificationsEnabled!==false))eligible.add(String(id));
  }
  const alreadyJoined=new Set(state.participants.map(p=>String(p.userId)));
  let sent=0;
  for(const userId of users) {
    if(!eligible.has(userId) || alreadyJoined.has(userId))continue;
    try {await authorize(userId,channelId,context.workspaceId);}catch(error){if([403,404].includes(error.statusCode))continue;throw error;}
    if(!await allowsNotification(userId,String(context.user._id),channelId))continue;
    emit(userId,{id:randomUUID(),huddleId:String(state.huddle._id),channelId,workspaceId:String(context.workspaceId),
      callerId:String(context.user._id),callerName:context.user.name || 'A teammate',label:channel.type==='dm'?context.user.name:channel.name,expiresAt:now()+60000});
    sent++;
  }
  return {sent};
}
