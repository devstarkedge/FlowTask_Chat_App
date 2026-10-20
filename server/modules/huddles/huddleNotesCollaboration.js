import * as Y from 'yjs';
import {ValidationError} from '../../middleware/errorHandler.js';

// A serializable CRDT checkpoint follows the existing distributed Huddle lease.
// No process-local document map or separate collaboration server is required.
export function updateSharedNotes(state,update){
  const doc=new Y.Doc();
  try {
    const text=doc.getText('notes');
    if(state.notesDocument)Y.applyUpdate(doc,Buffer.from(state.notesDocument,'base64'));
    else if(state.huddle.notes)text.insert(0,state.huddle.notes);
    if(update!==undefined){
      if(typeof update!=='string' || update.length>90000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(update))throw new Error('Invalid update');
      Y.applyUpdate(doc,Buffer.from(update,'base64'));
    }
    if(doc.share.size!==1 || text.length>10000 || text.toDelta().some(part=>typeof part.insert!=='string' || part.attributes))throw new Error('Invalid notes');
    const encoded=Y.encodeStateAsUpdate(doc);
    if(encoded.length>512000)throw new Error('Notes history is full');
    return {document:Buffer.from(encoded).toString('base64'),text:text.toString()};
  }catch {throw new ValidationError('Notes could not sync. Reopen notes to load the shared draft.');}
  finally{doc.destroy();}
}
