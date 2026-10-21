export const MAX_ACTIVE_SCREEN_SHARES=1;
export const SCREEN_ANNOTATION_HISTORY=1500;
export function screenShareMetadata(value){
  if(!value || typeof value!=='object' || !/^[a-zA-Z0-9-]{1,80}$/.test(value.id || '') ||
    !['active','paused'].includes(value.state) || !['screen','window','browser'].includes(value.sourceType) ||
    typeof value.sourceLabel!=='string' || !value.sourceLabel.trim() || value.sourceLabel.length>160 ||
    !Number.isFinite(value.startedAt))throw new Error('Invalid screen-share session');
  return {id:value.id,state:value.state,sourceType:value.sourceType,sourceLabel:value.sourceLabel,startedAt:value.startedAt,systemAudio:value.systemAudio===true};
}
export function annotationEvent(input,participant){
  if(!input || !['snapshot','start','move','end','clear','undo','pointer','pointer-hide'].includes(input.type))throw new Error('Invalid annotation action');
  const event={id:input.id,shareId:input.shareId,type:input.type,creatorSessionId:participant.id};
  if(input.type==='snapshot')return event;
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(event.id || ''))throw new Error('Invalid annotation identity');
  if(['start','move','end'].includes(input.type)){
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(input.strokeId || ''))throw new Error('Invalid stroke identity');
    event.strokeId=input.strokeId;
  }
  if(['start','move','pointer'].includes(input.type)){
    if(!Array.isArray(input.points) || !input.points.length || input.points.length>32 || input.points.some(p=>!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x<0 || p.x>1 || p.y<0 || p.y>1))throw new Error('Invalid annotation coordinates');
    event.points=input.points.map(({x,y})=>({x,y}));
    if(input.type==='pointer' && event.points.length!==1)throw new Error('Invalid pointer coordinates');
  }
  if(input.type==='start'){
    if(!['pen','eraser'].includes(input.tool) || !/^#[0-9a-f]{6}$/i.test(input.color || ''))throw new Error('Invalid drawing tool');
    event.tool=input.tool;event.color=input.color;
  }
  return event;
}
