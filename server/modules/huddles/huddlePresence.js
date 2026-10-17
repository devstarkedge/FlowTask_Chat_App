import {randomUUID} from 'node:crypto';
import redisManager from '../../config/redisManager.js';
import env from '../../config/environment.js';
import {AppError, ConflictError} from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import {createHuddleOperationQueue} from './huddleOperationQueue.js';

export function createHuddlePresence({environment=env,getClient=()=>redisManager.getSharedClient(),checkpoint=null}={}) {
const memory = new Map(), queued=createHuddleOperationQueue();
const mode=environment.HUDDLE_PRESENCE_MODE || (environment.IS_PRODUCTION ? 'redis' : 'memory');
// One serialized lifecycle operation per channel. Redis state survives API
// process restarts; production must never silently fall back to local memory.
function checkedClient() {
  if (!['memory','redis'].includes(mode) || (environment.IS_PRODUCTION && mode!=='redis')) {
    throw new AppError('Invalid Huddle presence configuration. Production requires Redis.',503,'HUDDLE_UNAVAILABLE');
  }
  if(mode==='memory')return null;
  const client = getClient();
  if (!client || client.status !== 'ready') {
    throw new AppError('Huddles presence is unavailable. The shared Redis service is not ready.',503,'HUDDLE_UNAVAILABLE');
  }
  return client;
}
async function withPresence(key, operation) {
  return queued(key,async()=>{
  const client=checkedClient();
  if(!client)return operation(structuredClone(memory.get(key) || null),value=>memory.set(key,structuredClone(value)));
  const token=randomUUID(), lock=`huddle-lock:${key}`, state=`huddle-state:${key}`,deadline=Date.now()+2500;
  while(await client.set(lock,token,'PX',30000,'NX') !== 'OK') {
    if(Date.now()>=deadline)throw new ConflictError('Huddle is updating. Try again.');
    await new Promise(resolve=>setTimeout(resolve,50+Math.floor(Math.random()*50)));
  }
  let lost=false;
  const renew=setInterval(() => {
    client.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('pexpire',KEYS[1],30000) else return 0 end",1,lock,token)
      .then(result=>{if(!result)lost=true;}).catch(()=>{lost=true;});
  },5000);
  renew.unref();
  try {
    const save=async value => {
      if(lost) throw new AppError('Huddle lease changed. Try again.',503,'HUDDLE_UNAVAILABLE');
      // Persist before acknowledging the shared Redis write. A lost/evicted
      // cache key must not silently erase authenticated participant identities.
      await checkpoint?.save(key,value);
      const saved=await client.eval("if redis.call('get',KEYS[1])~=ARGV[1] then return 0 end redis.call('set',KEYS[2],ARGV[2],'EX',3600) return 1",2,lock,state,token,JSON.stringify(value));
      if(!saved) throw new AppError('Huddle lease changed. Try again.',503,'HUDDLE_UNAVAILABLE');
    };
    const raw=await client.get(state);
    let snapshot=raw?JSON.parse(raw):null;
    if(!snapshot && checkpoint){
      snapshot=await checkpoint.load(key);
      if(snapshot){
        await save(snapshot);
        logger.warn('Huddle presence restored from checkpoint',{code:'HUDDLE_PRESENCE_RESTORED',reason:'REDIS_STATE_MISSING',huddleId:String(snapshot.huddle._id),participants:snapshot.participants.length});
      }
    }
    return await operation(snapshot,save);
  } finally {
    clearInterval(renew);
    try {await client.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,lock,token);}
    catch {logger.warn('Huddle lock release deferred to expiry',{code:'HUDDLE_LOCK_RELEASE'});}
  }
  });
}
// SDP/ICE routing validates a snapshot; it does not mutate participants and
// must not compete with lifecycle writes for an exclusive distributed lock.
withPresence.read=async key=>{
  const client=checkedClient();
  if(!client)return structuredClone(memory.get(key) || null);
  const raw=await client.get(`huddle-state:${key}`);
  return raw?JSON.parse(raw):(checkpoint?await checkpoint.load(key):null);
};
return withPresence;
}

export const withPresence=createHuddlePresence();
