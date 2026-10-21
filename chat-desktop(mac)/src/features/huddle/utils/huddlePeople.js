// Presentation groups people; transports must keep the original device sessions.
export function huddlePeople(participants=[],localSessionId) {
  const groups=new Map();
  const rank=p=>p.id===localSessionId?100:(p.connection==='connected'?10:0)+(p.cameraOn?3:0)+(p.audioReady?2:0);
  for(const participant of participants || []) {
    const key=participant.userId?String(participant.userId):participant.id;
    const group=groups.get(key) || [];
    group.push(participant);groups.set(key,group);
  }
  return [...groups.values()].map(group=>{
    const representative=group.reduce((best,p)=>rank(p)>=rank(best)?p:best);
    return {...representative,handRaised:group.some(p=>p.handRaised)};
  });
}
