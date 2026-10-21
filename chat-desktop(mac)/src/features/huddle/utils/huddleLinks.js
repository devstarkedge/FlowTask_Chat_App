import {getAppBaseUrl} from '../../../utils/urlUtils';

export function meetingUrl(workspaceId,channelId){
  const configured=import.meta.env.VITE_APP_URL || import.meta.env.VITE_FRONTEND_URL;
  const base=configured || (/^https?:$/.test(window.location.protocol)?window.location.origin:getAppBaseUrl());
  return new URL(`/workspace/${encodeURIComponent(workspaceId)}/channel/${encodeURIComponent(channelId)}?huddle=1`,base).href;
}

function appOrigins(){
  return [getAppBaseUrl(),import.meta.env.VITE_APP_URL,import.meta.env.VITE_FRONTEND_URL,globalThis.location?.origin].flatMap(value=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)?[url.origin]:[];}catch{return [];}});
}

// A lookalike host or an ordinary channel URL must never become a calling card.
export function parseHuddleLink(value,origins=appOrigins()){
  try{
    const url=new URL(value);
    if(!/^https?:$/.test(url.protocol) || url.username || url.password || !origins.includes(url.origin) || url.searchParams.get('huddle')!=='1')return null;
    const match=url.pathname.match(/^\/workspace\/([^/]+)\/channel\/([^/]+)\/?$/);
    if(!match)return null;
    const [workspaceId,channelId]=match.slice(1).map(decodeURIComponent);
    if(![workspaceId,channelId].every(id=>/^[a-zA-Z0-9_-]{1,100}$/.test(id)))return null;
    return {workspaceId,channelId,href:url.href};
  }catch{return null;}
}

export function huddleLinksFromMessage(message){
  if(message?.isDeleted)return [];
  const links=new Map();
  for(const content of [message?.content,message?.htmlContent]){
    if(typeof content!=='string')continue;
    const doc=new DOMParser().parseFromString(content.slice(0,100000),'text/html');
    doc.querySelectorAll('script,style,template').forEach(node=>node.remove());
    const candidates=[...doc.querySelectorAll('a[href]')].map(node=>node.getAttribute('href'));
    candidates.push(...(doc.body.textContent.match(/https?:\/\/[^\s<>"']+/gi) || []).map(url=>url.replace(/[),.!?;:\]}]+$/,'')));
    for(const value of candidates){const link=parseHuddleLink(value);if(link)links.set(`${link.workspaceId}:${link.channelId}`,link);if(links.size===3)return [...links.values()];}
  }
  return [...links.values()];
}
