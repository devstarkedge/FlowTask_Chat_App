import {randomUUID} from 'node:crypto';

// Send to authenticated personal sockets, independent of the channel being viewed.
export async function deliverHuddleInvitations(context,channelId,state,{getChannel,getMembers,authorize,allowsNotification,emit,push=()=>{},now=Date.now}) {
  const channel=await getChannel(channelId,context.workspaceId);
  if(!channel || channel.isArchived)return {sent:0};
  const members=await getMembers(channelId,context.workspaceId);
  const eligible=new Set(members.filter(m=>m.isActive!==false && m.notificationsEnabled!==false).map(m=>String(m.userId)));
  // Legacy DMs may predate the separate ChannelMember collection. Their
  // stored participant IDs are still verified through current authorization.
  if(channel.type==='dm')for(const id of channel.dmParticipants || []) {
    const entry=members.find(member=>String(member.userId)===String(id));
    if(!entry || (entry.isActive!==false && entry.notificationsEnabled!==false))eligible.add(String(id));
  }
  const alreadyJoined=new Set(state.participants.map(p=>String(p.userId)));
  let sent=0,cursor=0;
  // Membership, not online socket discovery, determines who can be invited.
  // Offline installations receive the same invitation through push.
  const recipients=[...eligible].filter(userId=>userId!==String(context.user._id) && !alreadyJoined.has(userId));
  async function deliver() {
   while(cursor<recipients.length) {
    const userId=recipients[cursor++];
    try {await authorize(userId,channelId,context.workspaceId);}catch(error){if([403,404].includes(error.statusCode))continue;throw error;}
    if(!await allowsNotification(userId,String(context.user._id),channelId))continue;
    const invitation={id:randomUUID(),huddleId:String(state.huddle._id),channelId,workspaceId:String(context.workspaceId),
      callerId:String(context.user._id),callerName:context.user.name || 'A teammate',label:channel.type==='dm'?context.user.name:channel.name,expiresAt:now()+60000};
    await emit(userId,invitation);
    push(userId,invitation);
    sent++;
   }
  }
  // Large channels must not perform sixty serial permission/notification
  // round trips before acknowledging audio-ready. Keep database work bounded.
  await Promise.all(Array.from({length:Math.min(8,recipients.length)},()=>deliver()));
  return {sent};
}
