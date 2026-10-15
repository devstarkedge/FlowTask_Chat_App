import {useEffect} from 'react';
import {Headphones} from 'lucide-react';
import {useHuddleStore} from '../../stores/huddleStore';
import {useHuddleUiStore} from '../../stores/huddleUiStore';
import {useChatStore} from '../../stores/chatStore';
import {useChannelStore} from '../../stores/channelStore';
import './huddle.css';

export default function HuddlePanel({channelId}) {
  const current=useHuddleStore(s=>s.byChannel[channelId]);
  const session=useHuddleStore(s=>s.session);
  const load=useHuddleStore(s=>s.load),status=useChatStore(s=>s.connectionStatus);
  const channel=useChannelStore(s=>s.channels.find(c=>c._id===channelId));
  const openPanel=useHuddleUiStore(s=>s.openPanel);
  useEffect(()=>{if(status==='connected' && channelId)load(channelId);},[status,channelId,load]);
  if(!current?.huddle)return null;
  return <section className="huddle-active-strip" aria-label="Active channel Huddle"><Headphones size={17}/><span>Huddle active <small>{current.participants.map(p=>p.name).join(', ')}</small></span>
    <button onClick={event=>openPanel({channelId,label:channel?.name || 'Channel',workspaceId:channel?.workspaceId,returnFocus:event.currentTarget})}>{session?.channelId===channelId?'Open Huddle':'Join Huddle'}</button>
  </section>;
}
