// Collapse the live notes card once the matching completion summary is available.
// Keep raw messages intact for history pagination and cached message reconciliation.
export function getHuddleTimeline(messages,unreadBoundary) {
  const completed=new Set(messages.filter(message=>message.huddleMeta?.kind!=='notes' && message.huddleMeta?.endedAt && message.huddleMeta?.huddleId).map(message=>String(message.huddleMeta.huddleId)));
  const visible=messages.filter(message=>!(message.huddleMeta?.kind==='notes' && completed.has(String(message.huddleMeta.huddleId))));
  if(visible.length===messages.length)return {messages,unreadBoundary};
  const visibleIds=new Set(visible.map(message=>message._id));
  let boundary=unreadBoundary;
  if(unreadBoundary && !visibleIds.has(unreadBoundary)) {
    const index=messages.findIndex(message=>message._id===unreadBoundary);
    for(let i=index-1;i>=0;i--)if(visibleIds.has(messages[i]._id)){boundary=messages[i]._id;break;}
  }
  return {messages:visible,unreadBoundary:boundary};
}
