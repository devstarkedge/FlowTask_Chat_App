// UI identity belongs to a share generation, while transports map media by
// participant session. Raising the central share limit won't require new UI state.
export function screenShareViews(state,audio,localSessionId){
  const sharing=(state?.participants || []).filter(p=>p.screenSharing);
  const remoteCount=sharing.filter(p=>p.id!==localSessionId && p.id!==audio.localScreenShare?.participantSessionId).length;
  return sharing.map(participant=>{
    const isLocal=participant.id===localSessionId || audio.localScreenShare?.participantSessionId===participant.id;
    const metadata=isLocal?audio.localScreenShare || participant.screenShare:participant.screenShare;
    const remote=audio.remoteScreenStreams?.[participant.id] || (remoteCount===1 && !Object.keys(audio.remoteScreenStreams || {}).length?audio.remoteScreenStream:null);
    return {id:metadata?.id || `legacy-${participant.id}-${participant.mediaId || ''}`,sourceLabel:'Shared screen',state:'active',...metadata,
      participantSessionId:participant.id,presenterName:participant.name,isLocal,stream:isLocal?audio.localScreenStream:remote};
  });
}
