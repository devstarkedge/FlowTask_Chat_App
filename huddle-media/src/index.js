import {createServer} from 'node:http';
import {availableParallelism} from 'node:os';
import {createWorker} from 'mediasoup';
import {Server} from 'socket.io';
import {MediaRooms} from './rooms.js';
import {verifySession} from './auth.js';
import {readPeerCapacity} from './capacity.js';

const env=process.env,secret=env.HUDDLE_MEDIA_SECRET,nodeId=env.HUDDLE_MEDIA_NODE_ID;
if(!secret || secret.length<32 || /REPLACE|CHANGE_ME/.test(secret) || !/^[a-z0-9-]{1,50}$/.test(nodeId || '') || !env.MEDIA_ANNOUNCED_ADDRESS || /REPLACE/.test(env.MEDIA_ANNOUNCED_ADDRESS))throw new Error('Media node identity, announced address and private signing secret are required');
const integer=(name,fallback,min,max)=>{const value=Number(env[name] || fallback);if(!Number.isInteger(value)||value<min||value>max)throw new Error(`Invalid ${name}`);return value;};
const {maxPeers,requestsPerMinute}=readPeerCapacity(env);
const port=integer('PORT',4443,1024,65535),count=integer('MEDIA_WORKERS',Math.min(2,availableParallelism()),1,availableParallelism()),rtcPort=integer('MEDIA_RTC_PORT',40000,1024,65000),maxRooms=integer('MEDIA_MAX_ROOMS',64,1,10000);
const origins=(env.MEDIA_ALLOWED_ORIGINS || '').split(',').map(value=>value.trim()).filter(Boolean);
if(!origins.length || origins.some(origin=>origin==='*' || /REPLACE/.test(origin)))throw new Error('Explicit TaskChat frontend origins are required');
const http=createServer((req,res)=>{if(req.url==='/health'){res.writeHead(rooms?.draining?503:200,{'Content-Type':'application/json'});res.end(JSON.stringify({ready:!rooms?.draining,nodeId}));}else{res.writeHead(404);res.end();}});
const io=new Server(http,{maxHttpBufferSize:65536,transports:['websocket'],cors:{origin:origins},allowRequest:(req,done)=>done(null,origins.includes(req.headers.origin))});
const workers=[];let rooms;
async function shutdown(){rooms?.close();io.disconnectSockets(true);await new Promise(resolve=>io.close(resolve));for(const slot of workers)slot.worker.close();}
for(let i=0;i<count;i++) {
  const worker=await createWorker({logLevel:'warn'});
  worker.on('died',()=>{console.error(JSON.stringify({event:'media-worker-died',nodeId,pid:worker.pid}));process.exitCode=1;shutdown().catch(()=>{});});
  const server=await worker.createWebRtcServer({listenInfos:['udp','tcp'].map(protocol=>({protocol,ip:env.MEDIA_LISTEN_IP || '0.0.0.0',announcedAddress:env.MEDIA_ANNOUNCED_ADDRESS,port:rtcPort+i}))});
  workers.push({worker,server,load:0});
}
rooms=new MediaRooms({workers,maxRooms,maxPeers,broadcast:(room,event)=>io.to(room).emit(event)});
io.use((socket,next)=>{try{socket.data.claims=verifySession(socket.handshake.auth?.token,{secret,nodeId});next();}catch{next(new Error('Media authorization failed'));}});
io.on('connection',socket=>{
  let peer,timer,queue=Promise.resolve(),requests=0,pending=0,windowAt=Date.now();
  const lease=()=>{clearTimeout(timer);timer=setTimeout(()=>socket.disconnect(true),Math.max(1,socket.data.claims.exp*1000-Date.now()));};lease();
  const ready=rooms.join(socket.data.claims).then(value=>{peer=value;if(!socket.connected){rooms.leave(peer);return;}socket.join(peer.room.key);}).catch(()=>socket.disconnect(true));
  socket.on('media:renew',(token,ack)=>{if(typeof ack!=='function')return;try{const next=verifySession(token,{secret,nodeId});for(const key of ['workspaceId','channelId','huddleId','sessionId','mediaId','userId'])if(next[key]!==socket.data.claims[key])throw new Error('Identity changed');socket.data.claims=next;if(peer)rooms.renew(peer,next);lease();ack({ok:true});}catch{ack({ok:false,error:'Media session expired'});socket.disconnect(true);}});
  socket.on('media:request',(payload,ack)=>{
    if(typeof ack!=='function')return;
    if(Date.now()-windowAt>60000){windowAt=Date.now();requests=0;}
    if(++requests>requestsPerMinute){ack({ok:false,error:'Media request limit reached'});return;}
    if(pending>=8){ack({ok:false,error:'Media request queue is full'});return;}pending++;
    queue=queue.then(async()=>{await ready;if(!peer || !socket.connected)throw new Error('Media unavailable');if(!payload || typeof payload.operation!=='string')throw new Error('Invalid request');return rooms.request(peer,payload.operation,payload.data);}).then(data=>ack({ok:true,data})).catch(error=>ack({ok:false,error:error.message})).finally(()=>{pending--;});
  });
  socket.on('disconnect',()=>{clearTimeout(timer);rooms.leave(peer);});
});
await new Promise(resolve=>http.listen(port,env.MEDIA_BIND_ADDRESS || '127.0.0.1',resolve));
console.log(JSON.stringify({event:'media-ready',nodeId,port,workers:count,maxPeers,maxRooms}));
process.once('SIGTERM',()=>shutdown().catch(()=>{process.exitCode=1;}));process.once('SIGINT',()=>shutdown().catch(()=>{process.exitCode=1;}));
