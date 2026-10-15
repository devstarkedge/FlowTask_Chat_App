export function readPeerCapacity(source=process.env) {
  const maxPeers=Number(source.MEDIA_MAX_PEERS || 60);
  if(!Number.isInteger(maxPeers) || maxPeers<2 || maxPeers>60)throw new Error('Invalid MEDIA_MAX_PEERS');
  // Each remote microphone/camera needs consume + resume. Allow bounded room
  // updates and device changes in addition to that initial subscription burst.
  return {maxPeers,requestsPerMinute:Math.max(240,120+maxPeers*8)};
}
