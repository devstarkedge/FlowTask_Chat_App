import {ValidationError} from '../../middleware/errorHandler.js';

export function validateAudioSignal(value) {
  if(!value || typeof value!=='object') throw new ValidationError('Invalid WebRTC signal');
  if(value.restart===true)return {restart:true};
  if(value.description) {
    const {type,sdp}=value.description;
    // The peer reserves separate camera and screen transceivers even with
    // camera off. Bound the negotiated slots, including inactive ones, to the
    // same layout as HuddleAudioController: one audio and two video slots.
    if(!['offer','answer'].includes(type) || typeof sdp!=='string' || sdp.length>65536 || (sdp.match(/^m=audio /gm)||[]).length!==1 || /^m=(?!audio |video )/m.test(sdp) || (sdp.match(/^m=video /gm)||[]).length>2) throw new ValidationError('Only one audio, one camera and one screen media slot are supported');
    return {description:{type,sdp}};
  }
  if(value.candidate) {
    const {candidate,sdpMid,sdpMLineIndex,usernameFragment}=value.candidate;
    if(typeof candidate!=='string' || candidate.length>4096 || (sdpMid!=null && (typeof sdpMid!=='string' || sdpMid.length>64)) || (sdpMLineIndex!=null && (!Number.isInteger(sdpMLineIndex) || sdpMLineIndex<0 || sdpMLineIndex>32)) || (usernameFragment!=null && (typeof usernameFragment!=='string' || usernameFragment.length>256))) throw new ValidationError('Invalid ICE candidate');
    return {candidate:{candidate,sdpMid:sdpMid ?? null,sdpMLineIndex:sdpMLineIndex ?? null,...(usernameFragment?{usernameFragment}: {})}};
  }
  throw new ValidationError('An SDP description or ICE candidate is required');
}
