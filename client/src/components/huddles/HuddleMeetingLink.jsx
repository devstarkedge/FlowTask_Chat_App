import {useState} from 'react';
import {Link,UserPlus} from 'lucide-react';
import {getAppBaseUrl} from '../../utils/urlUtils';
import {sendHuddleRequest} from '../../services/huddleRequest';

export function meetingUrl(workspaceId,channelId) {
  const configured=import.meta.env.VITE_APP_URL || import.meta.env.VITE_FRONTEND_URL;
  const base=configured || (/^https?:$/.test(window.location.protocol)?window.location.origin:getAppBaseUrl());
  return new URL(`/workspace/${encodeURIComponent(workspaceId)}/channel/${encodeURIComponent(channelId)}?huddle=1`,base).href;
}
export default function HuddleMeetingLink({channelId,workspaceId}) {
  const [feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false);
  const copy=async()=>{try{await navigator.clipboard.writeText(meetingUrl(workspaceId,channelId));setFeedback('Meeting link copied. Share it with this conversation’s members.');}catch{setFeedback('Could not copy the link. Check clipboard permission.');}};
  const invite=async()=>{setBusy(true);try{const data=await sendHuddleRequest('invite',{channelId});setFeedback(data.invitation?.error || (data.invitation?.sent?`Invitation sent to ${data.invitation.sent} participant(s).`:'No available participants were notified. Share the meeting link instead.'));}catch(error){setFeedback(error.message);}finally{setBusy(false);}};
  return <div className="huddle-meeting-link"><button onClick={copy} disabled={!workspaceId}><Link size={16}/>Copy meeting link</button><button onClick={invite} disabled={busy}><UserPlus size={16}/>{busy?'Inviting…':'Invite participants'}</button>{feedback && <p role="status">{feedback}</p>}</div>;
}
