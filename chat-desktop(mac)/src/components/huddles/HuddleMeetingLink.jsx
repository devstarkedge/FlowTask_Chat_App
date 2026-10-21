import {useState} from 'react';
import {Link,UserPlus} from 'lucide-react';
import {meetingUrl} from '../../features/huddle/utils/huddleLinks';
export {meetingUrl} from '../../features/huddle/utils/huddleLinks';
import {sendHuddleRequest} from '../../services/huddleRequest';

export default function HuddleMeetingLink({channelId,workspaceId}) {
  const [feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false);
  const copy=async()=>{try{await navigator.clipboard.writeText(meetingUrl(workspaceId,channelId));setFeedback('Meeting link copied. Share it with this conversation’s members.');}catch{setFeedback('Could not copy the link. Check clipboard permission.');}};
  const invite=async()=>{setBusy(true);try{const data=await sendHuddleRequest('invite',{channelId});setFeedback(data.invitation?.error || (data.invitation?.sent?`Invitation sent to ${data.invitation.sent} participant(s).`:'No available participants were notified. Share the meeting link instead.'));}catch(error){setFeedback(error.message);}finally{setBusy(false);}};
  return <div className="huddle-meeting-link"><button onClick={copy} disabled={!workspaceId}><Link size={16}/>Copy meeting link</button><button onClick={invite} disabled={busy}><UserPlus size={16}/>{busy?'Inviting…':'Invite participants'}</button>{feedback && <p role="status">{feedback}</p>}</div>;
}
