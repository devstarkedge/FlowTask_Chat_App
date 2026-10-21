import {getSocket} from './socket';
import {HuddleError} from '../features/huddle/utils/huddle.errors';

export async function sendHuddleRequest(action,payload,retries=2) {
  const socket=getSocket();
  if(!socket?.connected)throw new HuddleError('NETWORK_DISCONNECTED','Connect to TaskChat before using Huddles.');
  try {
    return await new Promise((resolve,reject)=>socket.timeout(10000).emit(`huddle:${action}`,payload,(error,response)=>{
      if(error)return reject(new HuddleError('SIGNALING_FAILED','Huddle request timed out. Try again.'));
      if(!response?.success) {
        const failure=new Error(response?.error?.message || 'Huddle request failed');failure.code=response?.error?.code;return reject(failure);
      }
      resolve(response.data);
    }));
  } catch(error) {
    // Retry only distributed-lock contention, with a bounded backoff.
    if(error.code==='CONFLICT' && retries>0) {
      await new Promise(resolve=>setTimeout(resolve,100*(3-retries)));
      if(socket!==getSocket())throw new Error('Connection changed. Try again.');
      return sendHuddleRequest(action,payload,retries-1);
    }
    throw error;
  }
}
