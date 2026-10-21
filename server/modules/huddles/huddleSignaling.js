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
    let mediaSources;
    if(value.mediaSources!==undefined){
      if(!Array.isArray(value.mediaSources) || !value.mediaSources.length || value.mediaSources.length>3)throw new ValidationError('Invalid media source mapping');
      const sections=new Map(sdp.split(/(?=^m=)/m).map(section=>[/^a=mid:([^\r\n]+)/m.exec(section)?.[1],/^m=(audio|video) /m.exec(section)?.[1]]));
      const mids=new Set(),sources=new Set();
      mediaSources=value.mediaSources.map(item=>{
        if(!item || !['microphone','camera','screen'].includes(item.source) || typeof item.mid!=='string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(item.mid) || mids.has(item.mid) || sources.has(item.source) || sections.get(item.mid)!==(item.source==='microphone'?'audio':'video'))throw new ValidationError('Invalid media source mapping');
        mids.add(item.mid);sources.add(item.source);return {mid:item.mid,source:item.source};
      });
      if(!sources.has('microphone') || mediaSources.length!==[...sections.values()].filter(Boolean).length)throw new ValidationError('Incomplete media source mapping');
    }
    return {description:{type,sdp},...(mediaSources?{mediaSources}:{})};
  }
  if(value.candidate) {
    const {candidate,sdpMid,sdpMLineIndex,usernameFragment}=value.candidate;
    if(typeof candidate!=='string' || candidate.length>4096 || (sdpMid!=null && (typeof sdpMid!=='string' || sdpMid.length>64)) || (sdpMLineIndex!=null && (!Number.isInteger(sdpMLineIndex) || sdpMLineIndex<0 || sdpMLineIndex>32)) || (usernameFragment!=null && (typeof usernameFragment!=='string' || usernameFragment.length>256))) throw new ValidationError('Invalid ICE candidate');
    return {candidate:{candidate,sdpMid:sdpMid ?? null,sdpMLineIndex:sdpMLineIndex ?? null,...(usernameFragment?{usernameFragment}: {})}};
  }
  throw new ValidationError('An SDP description or ICE candidate is required');
}
