const released=new WeakSet();
// Native WebRTC's stop() disables capture. release() also frees native track
// and stream references; browsers do not require this extra ownership step.
export function releaseStream(stream,local=true){
  if(!stream || released.has(stream))return;
  released.add(stream);
  if(local)for(const track of stream.getTracks()){track.onended=null;track.stop();}
  stream.release?.(local);
}
