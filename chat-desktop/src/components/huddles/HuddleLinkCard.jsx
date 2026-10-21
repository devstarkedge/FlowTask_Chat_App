import {Headphones} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useChannelStore} from '../../stores/channelStore';
import {useAuthStore} from '../../stores/authStore';
import {useWorkspaceStore} from '../../stores/workspaceStore';
import {useHuddleStore} from '../../stores/huddleStore';
import {useHuddleUiStore} from '../../stores/huddleUiStore';
import './huddle-link-card.css';

export default function HuddleLinkCard({link}){
  const navigate=useNavigate();
  const channel=useChannelStore(state=>state.channels.find(item=>item._id===link.channelId));
  const ownName=useAuthStore(state=>state.user?.name);
  const workspaceId=useWorkspaceStore(state=>state.activeWorkspaceId);
  const active=useHuddleStore(state=>state.byChannel[link.channelId]?.huddle);
  const joined=useHuddleStore(state=>state.session?.channelId===link.channelId);
  const openPanel=useHuddleUiStore(state=>state.openPanel);
  const names=channel?.dmParticipantNames?.filter(name=>name!==ownName);
  const label=(channel?.type==='dm' && !channel.dmRecipientId && names?.length?names.join(', '):channel?.name || channel?.slug) || 'this conversation';
  const action=joined?'Open Huddle':active?'Join Huddle':'Start a Huddle';
  const open=event=>{
    event.stopPropagation();
    // Workspace navigation retains the existing membership/authorization checks.
    if(String(workspaceId)!==link.workspaceId)navigate(`/workspace/${encodeURIComponent(link.workspaceId)}/channel/${encodeURIComponent(link.channelId)}?huddle=1`);
    else openPanel({workspaceId:link.workspaceId,channelId:link.channelId,label});
  };
  return <article className="taskchat-huddle-link-card" aria-label="TaskChat Huddle invitation">
    <div className="taskchat-huddle-link-heading"><span className="taskchat-huddle-link-icon"><Headphones size={21} aria-hidden="true"/></span><div><strong>A Huddle link has been shared</strong><p>{channel?.type==='dm'?'With':channel?'In':'For'} <span>{channel && channel.type!=='dm'?'#':''}{label}</span><small>TaskChat</small></p></div></div>
    <div className="taskchat-huddle-link-footer"><button type="button" onClick={open}>{action}</button></div>
  </article>;
}
