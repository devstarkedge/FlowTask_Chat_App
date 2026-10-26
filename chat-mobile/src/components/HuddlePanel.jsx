import {huddlePeople} from '../features/huddle/utils/huddlePeople';
import React,{useEffect} from 'react';
import {View,Text,TouchableOpacity} from 'react-native';
import {useHuddleStore} from '../stores/huddleStore';
import {useChatStore} from '../stores/chatStore';
import {useThemeStore} from '../stores/themeStore';
import {useAuthStore} from '../stores/authStore';
import {useHuddleUiStore} from '../stores/huddleUiStore';
export default function HuddlePanel({channelId}) {
  const colors=useThemeStore(s=>s.colors);
  const user=useAuthStore(s=>s.user);
  const state=useHuddleStore(s=>s.byChannel[channelId]);
  const session=useHuddleStore(s=>s.session),error=useHuddleStore(s=>s.error),busy=useHuddleStore(s=>s.busy);
  const act=useHuddleStore(s=>s.act),load=useHuddleStore(s=>s.load);
  const status=useChatStore(s=>s.connectionStatus);
  useEffect(()=>{if(channelId && status==='connected')load(channelId);},[channelId,status,load]);
  const joined=session?.channelId===channelId;
  return <View style={{padding:10,borderBottomWidth:1,borderColor:colors.border,backgroundColor:colors.background}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
      <Text style={{color:colors.textPrimary}}>{state?.huddle?'Huddle active':'Huddle'}</Text>
      <TouchableOpacity disabled={busy || status!=='connected'} onPress={()=>useHuddleUiStore.getState().openPanel({channelId,label:'Huddle'})} accessibilityRole="button">
        <Text style={{color:colors.primary}}>{busy?'Working…':joined?'Open Huddle':state?.huddle?'Join':'Start'}</Text>
      </TouchableOpacity>
    </View>
    {state?.huddle && <Text style={{color:colors.textSecondary,fontSize:12}}>{huddlePeople(state.participants,session?.id).map(p=>p.name).join(', ') || 'Waiting for participants'}</Text>}
    {joined && String(state?.huddle?.startedBy)===String(user?._id) && <TouchableOpacity disabled={busy} onPress={()=>act('end',channelId)}><Text style={{color:colors.primary}}>End huddle</Text></TouchableOpacity>}
    {session && !joined && <TouchableOpacity onPress={()=>act('leave',session.channelId)}><Text style={{color:colors.primary}}>Leave other huddle</Text></TouchableOpacity>}
    {error && <Text accessibilityRole="alert" style={{color:colors.textSecondary,fontSize:12}}>{error}</Text>}
  </View>;
}
