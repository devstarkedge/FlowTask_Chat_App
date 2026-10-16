// Deliberately omit SDP, ICE addresses, streams and resume credentials.
export const huddleLogger={
  debug(event,details={}) {
    if(import.meta.env?.VITE_HUDDLE_DEBUG==='true')console.debug(`[huddle] ${event}`,details);
  },
};
