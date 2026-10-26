import * as Y from 'yjs';

const encode=bytes=>{let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary);};
const decode=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
const sessions=new Map();

export class SharedNotesSession {
  constructor({request,initialText=''}){
    this.request=request;this.initialText=initialText;this.doc=new Y.Doc();this.text=this.doc.getText('notes');
    this.pending=[];this.listeners=new Set();this.ready=false;this.error='';this.disposed=false;
    this.doc.on('update',(update,origin)=>{
      if(origin!=='local')return;
      this.pending.push(update);this.notify();
      if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.flush().catch(()=>{});},500);
    });
  }
  snapshot(){return {value:this.ready?this.text.toString():this.initialText,ready:this.ready,error:this.error,pending:Boolean(this.pending.length || this.inFlight)};}
  subscribe(listener){this.listeners.add(listener);listener(this.snapshot());return()=>this.listeners.delete(listener);}
  notify(){if(!this.disposed)for(const listener of this.listeners)listener(this.snapshot());}
  async start(){
    if(this.starting)return this.starting;
    this.starting=this.request('notes-sync',{}).then(state=>{
      if(this.disposed)return;
      if(!state?.notesDocument)throw new Error('Live notes require the latest Chat API deployment.');
      this.apply(state.notesDocument);this.ready=true;this.error='';this.notify();
    }).catch(error=>{if(!this.disposed){this.error=error.message;this.notify();}throw error;}).finally(()=>{this.starting=null;});
    return this.starting;
  }
  apply(encoded){
    if(this.disposed || !encoded)return;
    const before=this.text.toString(),selection=this.getSelection?.();
    const relative=selection?{start:Y.createRelativePositionFromTypeIndex(this.text,selection.start),end:Y.createRelativePositionFromTypeIndex(this.text,selection.end)}:null;
    Y.applyUpdate(this.doc,decode(encoded),'remote');
    if(relative && before!==this.text.toString()){
      const start=Y.createAbsolutePositionFromRelativePosition(relative.start,this.doc),end=Y.createAbsolutePositionFromRelativePosition(relative.end,this.doc);
      if(start && end)this.restoreSelection?.({start:start.index,end:end.index});
    }
    this.notify();
  }
  edit(value){
    if(!this.ready || this.disposed || value.length>10000)return;
    const previous=this.text.toString();let prefix=0,suffix=0;
    while(prefix<previous.length && prefix<value.length && previous[prefix]===value[prefix])prefix++;
    while(suffix<previous.length-prefix && suffix<value.length-prefix && previous[previous.length-1-suffix]===value[value.length-1-suffix])suffix++;
    this.doc.transact(()=>{
      const removed=previous.length-prefix-suffix;if(removed)this.text.delete(prefix,removed);
      const inserted=value.slice(prefix,value.length-suffix);if(inserted)this.text.insert(prefix,inserted);
    },'local');
    this.typing=true;clearTimeout(this.typingTimer);this.typingTimer=setTimeout(()=>this.stopTyping(),2000);
  }
  stopTyping(){
    this.typing=false;clearTimeout(this.typingTimer);this.typingTimer=null;
    if(this.ready && !this.disposed)this.request('notes-typing',{typing:false}).catch(()=>{});
  }
  async flush(){
    clearTimeout(this.timer);this.timer=null;
    if(this.inFlight){await this.inFlight;return this.flush();}
    if(this.disposed || !this.pending.length)return;
    // Bound each frame even after a long reconnect; later edits remain queued.
    const batch=[];let bytes=0;
    while(this.pending.length && (!batch.length || bytes+this.pending[0].length<=64000)){
      const next=this.pending.shift();batch.push(next);bytes+=next.length;
    }
    const update=Y.mergeUpdates(batch);
    this.inFlight=this.request('notes-edit',{update:encode(update),typing:Boolean(this.typing)}).then(state=>{
      if(this.disposed)return;
      this.apply(state?.notesDocument);this.error='';
    }).catch(error=>{
      if(!this.disposed){this.pending.unshift(update);this.error=`Notes are not synced: ${error.message}`;
        this.timer=setTimeout(()=>{this.timer=null;this.flush().catch(()=>{});},2000);}
      throw error;
    }).finally(()=>{this.inFlight=null;this.notify();});
    this.notify();await this.inFlight;if(this.pending.length)return this.flush();
  }
  async save(){
    await this.flush();if(this.disposed)throw new Error('This Huddle has ended.');
    const state=await this.request('notes-save',{});this.apply(state?.notesDocument);return state;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;clearTimeout(this.timer);clearTimeout(this.typingTimer);
    this.listeners.clear();this.doc.destroy();
  }
}

export function getSharedNotesSession(id,options){
  if(!sessions.has(id))sessions.set(id,new SharedNotesSession(options));
  return sessions.get(id);
}
export function disposeSharedNotesSession(id){sessions.get(id)?.dispose();sessions.delete(id);}
