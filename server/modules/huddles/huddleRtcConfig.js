import {createHmac} from 'node:crypto';
import {AppError} from '../../middleware/errorHandler.js';

export function createRtcConfiguration(sessionId,source=process.env,now=Date.now()) {
  const urls=name=>(source[name] || '').split(',').map(value=>value.trim()).filter(Boolean);
  const stun=urls('HUDDLE_STUN_URLS'),turn=urls('HUDDLE_TURN_URLS');
  const host='(?:[a-z\\d.-]+|\\[[a-f\\d:]+\\])(?::\\d{1,5})?';
  if(stun.some(url=>!new RegExp(`^stuns?:${host}$`,'i').test(url)) || turn.some(url=>!new RegExp(`^turns?:${host}(?:\\?transport=(?:tcp|udp))?$`,'i').test(url))) throw new AppError('Invalid Huddle ICE configuration',503,'HUDDLE_CONFIG');
  if(turn.length && (!source.HUDDLE_TURN_SECRET || source.HUDDLE_TURN_SECRET.length<32)) throw new AppError('Huddle TURN shared secret must be configured on the server',503,'HUDDLE_CONFIG');
  if(source.NODE_ENV==='production' && !turn.length) throw new AppError('Self-hosted TURN must be configured before production audio is enabled',503,'HUDDLE_CONFIG');
  const iceServers=stun.length ? [{urls:stun}] : [];
  const expiresAt=Math.floor(now/1000)+3600;
  if(turn.length) {
    const username=`${expiresAt}:${sessionId}`;
    const credential=createHmac('sha1',source.HUDDLE_TURN_SECRET).update(username).digest('base64');
    iceServers.push({urls:turn,username,credential});
  }
  return {rtcConfiguration:{iceServers,iceTransportPolicy:source.HUDDLE_ICE_RELAY_ONLY==='true'?'relay':'all'},expiresAt,
    notice:turn.length?null:'Local network audio only: self-hosted TURN is not configured.'};
}
