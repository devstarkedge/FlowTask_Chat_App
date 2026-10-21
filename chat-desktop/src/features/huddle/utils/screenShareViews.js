// UI identity belongs to a share generation, while transports map media by
// participant session. Raising the central share limit won't require new UI state.
export function screenShareViews(state,audio){
  return (state?.participants || []).filter(p=>p.screenSharing).map(participant=>({
    ...participant.screenShare,participantSessionId:participant.id,presenterName:participant.name,
    stream:audio.localScreenShare?.participantSessionId===participant.id?audio.localScreenStream:audio.remoteScreenStreams?.[participant.id] || audio.remoteScreenStream,
  }));
}
