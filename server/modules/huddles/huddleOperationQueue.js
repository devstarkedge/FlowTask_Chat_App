import {ConflictError} from '../../middleware/errorHandler.js';

// Serialize mutations locally instead of treating ordinary overlap as failure.
// Queue size and waiting time are bounded; timed-out work never executes later.
export function createHuddleOperationQueue({maxPending=64,timeoutMs=5000}={}) {
  const entries=new Map();
  return function queued(key,operation) {
    let entry=entries.get(key);
    if(!entry){entry={running:false,waiting:[]};entries.set(key,entry);}
    if(Number(entry.running)+entry.waiting.length>=maxPending)return Promise.reject(new ConflictError('Huddle request queue is full. Try again.'));
    return new Promise((resolve,reject)=>{
      const task={operation,resolve,reject,timer:null};
      const start=task=>{
        entry.running=true;clearTimeout(task.timer);
        Promise.resolve().then(task.operation).then(task.resolve,task.reject).finally(()=>{
          entry.running=false;const next=entry.waiting.shift();
          if(next)start(next);else if(entries.get(key)===entry)entries.delete(key);
        });
      };
      if(!entry.running){start(task);return;}
      entry.waiting.push(task);
      task.timer=setTimeout(()=>{
        const index=entry.waiting.indexOf(task);
        if(index<0)return;
        entry.waiting.splice(index,1);reject(new ConflictError('Huddle request queue timed out. Try again.'));
      },timeoutMs);
    });
  };
}
