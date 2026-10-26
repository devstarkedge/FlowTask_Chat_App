export const huddleLogger={debug(event,details={}){if(process.env.EXPO_PUBLIC_HUDDLE_DEBUG==='true')console.debug('[huddle] '+event,details);}};
