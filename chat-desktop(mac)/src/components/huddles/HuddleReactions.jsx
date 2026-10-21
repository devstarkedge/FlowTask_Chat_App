import {useEffect,useRef,useState} from 'react';

const LIFETIME=5000;
const EMPTY=[];

// Consume confirmed participant reactions once, even when presence is re-synced.
export default function HuddleReactions({participants=EMPTY}) {
  const seen=useRef(new Set());
  const [reactions,setReactions]=useState([]);
  useEffect(()=>{
    const now=Date.now(),incoming=[];
    for(const person of participants){
      const reaction=person.reaction;
      if(!reaction?.id || !reaction.emoji)continue;
      const key=`${person.id}:${reaction.id}`;
      if(seen.current.has(key))continue;
      seen.current.add(key);
      const age=Math.max(0,now-Number(reaction.at));
      if(!Number.isFinite(age) || age>=LIFETIME)continue;
      let hash=0;for(const character of key)hash=(hash*31+character.charCodeAt(0))>>>0;
      incoming.push({key,name:person.name || 'Participant',emoji:reaction.emoji,age,expiresAt:now+LIFETIME-age,lane:12+hash%70});
    }
    // Bound both retained event IDs and concurrent animation elements.
    while(seen.current.size>256)seen.current.delete(seen.current.values().next().value);
    if(incoming.length)setReactions(current=>[...current.filter(item=>item.expiresAt>now),...incoming].slice(-20));
  },[participants]);
  useEffect(()=>{
    if(!reactions.length)return;
    const timer=setTimeout(()=>setReactions(current=>current.filter(item=>item.expiresAt>Date.now())),Math.max(0,Math.min(...reactions.map(item=>item.expiresAt))-Date.now()));
    return()=>clearTimeout(timer);
  },[reactions]);
  return <div className="huddle-floating-reactions" role="log" aria-live="polite" aria-relevant="additions" aria-label="Participant reactions">
    {reactions.map(item=><div key={item.key} className="huddle-floating-reaction" style={{left:`${item.lane}%`,animationDelay:`-${item.age}ms`}}>
      <span className="huddle-floating-emoji" aria-hidden="true">{item.emoji}</span>
      <span className="huddle-floating-name">{item.name} reacted {item.emoji}</span>
    </div>)}
  </div>;
}
