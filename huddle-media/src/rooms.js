const codecs=[{kind:'audio',mimeType:'audio/opus',clockRate:48000,channels:2},{kind:'video',mimeType:'video/VP8',clockRate:90000,parameters:{'x-google-start-bitrate':600}}];
export class MediaRooms {
  constructor({workers,maxRooms=64,maxPeers=32,broadcast=()=>{}}){this.workers=workers;this.maxRooms=maxRooms;this.maxPeers=maxPeers;this.broadcast=broadcast;this.rooms=new Map();this.pending=new Map();this.draining=false;}
  key(claims){return `${claims.workspaceId}:${claims.huddleId}`;}
  async room(claims){
    const key=this.key(claims);if(this.rooms.has(key))return this.rooms.get(key);if(this.pending.has(key))return this.pending.get(key);
    if(this.draining || this.rooms.size+this.pending.size>=this.maxRooms)throw new Error('Media node is at capacity');
    const slot=this.workers.reduce((a,b)=>a.load<=b.load?a:b);slot.load++;
    const creation=(async()=>{try{const router=await slot.worker.createRouter({mediaCodecs:codecs});const room={key,router,slot,peers:new Map()};this.rooms.set(key,room);return room;}catch(error){slot.load--;throw error;}finally{this.pending.delete(key);}})();
    this.pending.set(key,creation);return creation;
  }
  async join(claims){
    if(this.draining)throw new Error('Media node is draining');const room=await this.room(claims);
    if(room.peers.has(claims.sessionId))throw new Error('Media session already connected');
    if(room.peers.size>=this.maxPeers)throw new Error('Meeting is full');
    const peer={claims,room,transports:new Map(),producers:new Map(),consumers:new Map(),closed:false};room.peers.set(claims.sessionId,peer);return peer;
  }
  producers(peer){return [...peer.room.peers.values()].filter(p=>p!==peer).flatMap(p=>[...p.producers.values()].map(producer=>({id:producer.id,sessionId:p.claims.sessionId,source:producer.appData.source})));}
  renew(peer,claims){peer.claims=claims;for(const [id,producer] of peer.producers)if((producer.appData.source==='screen' && !claims.screenAllowed) || (producer.appData.source==='camera' && !claims.cameraAllowed)){peer.producers.delete(id);producer.close();this.broadcast(peer.room.key,'media:changed');}}
  async request(peer,operation,data={}) {
    if(peer.closed || peer.room.peers.get(peer.claims.sessionId)!==peer)throw new Error('Media session closed');
    const room=peer.room;
    if(operation==='capabilities')return {routerRtpCapabilities:room.router.rtpCapabilities};
    if(operation==='list')return this.producers(peer);
    if(operation==='transport') {
      if(!['send','recv'].includes(data.direction) || [...peer.transports.values()].some(t=>t.appData.direction===data.direction))throw new Error('Invalid or duplicate transport');
      const transport=await room.router.createWebRtcTransport({webRtcServer:room.slot.server,enableUdp:true,enableTcp:true,preferUdp:true,initialAvailableOutgoingBitrate:800000,appData:{direction:data.direction}});
      if(peer.closed){transport.close();throw new Error('Media session closed');}peer.transports.set(transport.id,transport);
      transport.on('dtlsstatechange',state=>{if(state==='closed')transport.close();});
      return {id:transport.id,iceParameters:transport.iceParameters,iceCandidates:transport.iceCandidates,dtlsParameters:transport.dtlsParameters};
    }
    if(operation==='connect') {const transport=peer.transports.get(data.transportId);if(!transport)throw new Error('Transport not owned');await transport.connect({dtlsParameters:data.dtlsParameters});return {};}
    if(operation==='produce') {
      const transport=peer.transports.get(data.transportId);const source=data.source;
      if(!transport || transport.appData.direction!=='send' || !['microphone','screen','camera'].includes(source) || (source==='microphone'?data.kind!=='audio':data.kind!=='video') || (source==='camera' && !peer.claims.cameraAllowed) || (source==='screen' && (!peer.claims.screenAllowed || [...room.peers.values()].some(p=>[...p.producers.values()].some(producer=>producer.appData.source==='screen')))) || [...peer.producers.values()].some(p=>p.appData.source===source))throw new Error('Producer not permitted');
      const producer=await transport.produce({kind:data.kind,rtpParameters:data.rtpParameters,appData:{source}});
      if(peer.closed){producer.close();throw new Error('Media session closed');}peer.producers.set(producer.id,producer);this.broadcast(room.key,'media:changed');return {id:producer.id};
    }
    if(operation==='consume') {
      const transport=peer.transports.get(data.transportId);
      const producerPeer=[...room.peers.values()].find(p=>p!==peer && p.producers.has(data.producerId));const producer=producerPeer?.producers.get(data.producerId);
      if(!transport || transport.appData.direction!=='recv' || !producer || !room.router.canConsume({producerId:producer.id,rtpCapabilities:data.rtpCapabilities}) || [...peer.consumers.values()].some(c=>c.producerId===producer.id))throw new Error('Consumer not permitted');
      const consumer=await transport.consume({producerId:producer.id,rtpCapabilities:data.rtpCapabilities,paused:true});
      if(peer.closed){consumer.close();throw new Error('Media session closed');}peer.consumers.set(consumer.id,consumer);
      consumer.on('producerclose',()=>{peer.consumers.delete(consumer.id);consumer.close();this.broadcast(room.key,'media:changed');});
      return {id:consumer.id,producerId:producer.id,kind:consumer.kind,rtpParameters:consumer.rtpParameters,appData:{source:producer.appData.source,sessionId:producerPeer.claims.sessionId}};
    }
    if(operation==='resume') {const consumer=peer.consumers.get(data.consumerId);if(!consumer)throw new Error('Consumer not owned');await consumer.resume();return {};}
    if(operation==='close-producer') {const producer=peer.producers.get(data.producerId);if(!producer)return {};peer.producers.delete(producer.id);producer.close();this.broadcast(room.key,'media:changed');return {};}
    throw new Error('Unknown media operation');
  }
  leave(peer){if(!peer || peer.closed)return;peer.closed=true;for(const item of [...peer.consumers.values(),...peer.producers.values(),...peer.transports.values()])item.close();peer.room.peers.delete(peer.claims.sessionId);if(!peer.room.peers.size){peer.room.router.close();this.rooms.delete(peer.room.key);peer.room.slot.load--;}else this.broadcast(peer.room.key,'media:changed');}
  close(){this.draining=true;for(const room of [...this.rooms.values()])for(const peer of [...room.peers.values()])this.leave(peer);}
}
