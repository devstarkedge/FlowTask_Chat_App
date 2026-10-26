import React,{useEffect,useRef,useState} from 'react';
import {Animated,View,Text,StyleSheet} from 'react-native';
function Bubble({entry,onDone,index}){
  const progress=useRef(new Animated.Value(0)).current;
  useEffect(()=>{const animation=Animated.timing(progress,{toValue:1,duration:3500,useNativeDriver:true});animation.start(({finished})=>{if(finished)onDone(entry.id);});return()=>animation.stop();},[entry.id]);
  return <Animated.View style={{position:'absolute',bottom:130,left:`${12+(index%4)*20}%`,alignItems:'center',opacity:progress.interpolate({inputRange:[0,.1,.8,1],outputRange:[0,1,1,0]}),transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[0,-240]})}]}}><Text style={{fontSize:44}}>{entry.emoji}</Text><Text style={{color:'white',backgroundColor:'#352b46',padding:5,borderRadius:8,fontSize:12}}>{entry.name}</Text></Animated.View>;
}
export default function HuddleReactions({participants}){
  const [entries,setEntries]=useState([]),seen=useRef(new Set());
  useEffect(()=>{const incoming=[];for(const person of participants){const reaction=person.reaction;if(!reaction?.id || seen.current.has(reaction.id) || Date.now()-reaction.at>4000)continue;seen.current.add(reaction.id);incoming.push({...reaction,name:person.name});}if(incoming.length)setEntries(current=>[...current,...incoming].slice(-12));if(seen.current.size>256)seen.current=new Set([...seen.current].slice(-128));},[participants]);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{entries.map((entry,index)=><Bubble key={entry.id} entry={entry} index={index} onDone={id=>setEntries(current=>current.filter(item=>item.id!==id))}/>)}</View>;
}
