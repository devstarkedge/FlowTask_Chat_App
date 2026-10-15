import {randomUUID} from 'node:crypto';
import redisManager from '../../config/redisManager.js';
import env from '../../config/environment.js';
import {AppError, ConflictError} from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const memory = new Map(), busy = new Set();
// One serialized lifecycle operation per channel. Redis state survives API
// process restarts; production must never silently fall back to local memory.
export async function withPresence(key, operation) {
  const client = redisManager.getSharedClient();
  if (!client || client.status !== 'ready') {
    if (env.IS_PRODUCTION || env.REDIS_URL) throw new AppError('Huddles presence is unavailable',503,'HUDDLE_UNAVAILABLE');
    if (busy.has(key)) throw new ConflictError('Huddle is updating. Try again.');
    busy.add(key);
    try { return await operation(memory.get(key) || null, value => memory.set(key,value)); }
    finally { busy.delete(key); }
  }
  const token=randomUUID(), lock=`huddle-lock:${key}`, state=`huddle-state:${key}`;
  if (await client.set(lock,token,'PX',30000,'NX') !== 'OK') throw new ConflictError('Huddle is updating. Try again.');
  let lost=false;
  const renew=setInterval(() => {
    client.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('pexpire',KEYS[1],30000) else return 0 end",1,lock,token)
      .then(result=>{if(!result)lost=true;}).catch(()=>{lost=true;});
  },5000);
  renew.unref();
  try {
    const raw=await client.get(state);
    return await operation(raw ? JSON.parse(raw) : null, async value => {
      if(lost) throw new AppError('Huddle lease changed. Try again.',503,'HUDDLE_UNAVAILABLE');
      const saved=await client.eval("if redis.call('get',KEYS[1])~=ARGV[1] then return 0 end redis.call('set',KEYS[2],ARGV[2],'EX',3600) return 1",2,lock,state,token,JSON.stringify(value));
      if(!saved) throw new AppError('Huddle lease changed. Try again.',503,'HUDDLE_UNAVAILABLE');
    });
  } finally {
    clearInterval(renew);
    try {await client.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,lock,token);}
    catch {logger.warn('Huddle lock release deferred to expiry',{code:'HUDDLE_LOCK_RELEASE'});}
  }
}
