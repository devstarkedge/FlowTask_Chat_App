import './huddle.css';
export default function HuddleSummary({message}) {
  if(message.isDeleted)return <p style={{margin:'12px 20px',color:'var(--text-muted)',fontSize:13}}>This Huddle message was deleted.</p>;
  const meta=message.huddleMeta;
  if(meta.kind==='notes')return <div style={{margin:'12px 20px',padding:16,border:'1px solid var(--border-primary)',borderRadius:10}}>
    <strong>Meeting notes</strong><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',marginTop:10}}>{meta.notes || 'No notes yet.'}</p>
  </div>;
  const seconds=Math.max(0,Math.floor((new Date(meta.endedAt)-new Date(meta.startedAt))/1000));
  return <div style={{margin:'12px 20px',padding:16,border:'1px solid var(--border-primary)',borderRadius:10}}>
    <strong>🎧 Huddle ended</strong><p style={{fontSize:13,margin:'6px 0'}}>{Math.floor(seconds/60)}m {seconds%60}s · {meta.attendees?.length || 0} participants</p>
    {meta.notes && <details><summary style={{cursor:'pointer'}}>Meeting notes</summary><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',marginTop:10}}>{meta.notes}</p></details>}
  </div>;
}
