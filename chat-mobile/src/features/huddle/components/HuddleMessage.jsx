import React,{useState} from 'react';
import {View,Text,Pressable} from 'react-native';
export default function HuddleMessage({message,colors}){
  const [expanded,setExpanded]=useState(false),meta=message.huddleMeta;
  if(message.isDeleted)return <Text style={{color:colors.textSecondary}}>This Huddle message was deleted.</Text>;
  const notesOnly=meta.kind==='notes';
  const seconds=Math.max(0,Math.floor((new Date(meta.endedAt)-new Date(meta.startedAt))/1000));
  return <View style={{padding:14,margin:10,borderWidth:1,borderColor:colors.border,borderRadius:10}}>
    <Text style={{color:colors.textPrimary,fontWeight:'700'}}>{notesOnly?'Meeting notes':'🎧 Huddle ended'}</Text>
    {!notesOnly && <Text style={{color:colors.textSecondary,marginVertical:6}}>{Math.floor(seconds/60)}m {seconds%60}s · {meta.attendees?.length || 0} participants</Text>}
    {!notesOnly && Boolean(meta.notes) && <Pressable accessibilityRole="button" onPress={()=>setExpanded(!expanded)}><Text style={{color:colors.textPrimary}}>{expanded?'▾':'▸'} Meeting notes</Text></Pressable>}
    {(notesOnly || expanded) && <Text style={{color:colors.textPrimary,marginTop:8}}>{meta.notes || 'No notes yet.'}</Text>}
  </View>;
}
