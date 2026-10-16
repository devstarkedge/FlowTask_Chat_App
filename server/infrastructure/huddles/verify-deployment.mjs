import {readFile,stat} from 'node:fs/promises';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';

export function parseSettings(text) {
  const result={};
  for(const raw of text.split(/\r?\n/)) {
    const line=raw.trim();if(!line || line.startsWith('#'))continue;
    const match=line.match(/^([A-Za-z_][\w-]*)(?:=(.*))?$/);
    if(!match)throw new Error('Unsupported configuration syntax');
    let value=(match[2] ?? 'true').trim();
    if((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))value=value.slice(1,-1);
    result[match[1]]=value;
  }
  return result;
}
export function privateConfigPermissions(name,{mode,uid,gid}) {
  if((mode & 0o077)===0)return true;
  // The non-root coturn container needs read-only group access to its config.
  // Other secrets stay owner-only, and no config is world-readable/group-writable.
  return name==='turn' && uid===0 && gid===65534 && (mode & 0o077)===0o040;
}
export function validateDeployment({turn,media,backend}) {
  const errors=[],check=(valid,message)=>{if(!valid)errors.push(message);};
  const strong=value=>typeof value==='string' && value.length>=32 && !/REPLACE|CHANGE_ME|^example/i.test(value);
  const host=turn.realm;
  check(typeof host==='string' && /^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(host) && !/REPLACE|localhost/i.test(host),'TURN realm needs a real DNS hostname');
  check(turn['use-auth-secret']==='true' && !turn['no-auth'],'TURN must require secret-based authentication');
  check(strong(turn['static-auth-secret']) && turn['static-auth-secret']===backend.HUDDLE_TURN_SECRET,'TURN/backend secrets must be strong and match');
  check(strong(media.HUDDLE_MEDIA_SECRET) && media.HUDDLE_MEDIA_SECRET===backend.HUDDLE_MEDIA_SECRET,'Media/backend signing secrets must be strong and match');
  check(media.HUDDLE_MEDIA_SECRET!==backend.HUDDLE_TURN_SECRET,'Use separate TURN and media signing secrets');
  check(isIP((turn['external-ip'] || '').split('/')[0])>0,'TURN needs its public external IP or public/private IP mapping');
  check(isIP(media.MEDIA_ANNOUNCED_ADDRESS || '')>0,'Media node needs its public announced IP');
  const copiedCertificates=turn.cert==='/etc/coturn/certs/fullchain.pem' && turn.pkey==='/etc/coturn/certs/privkey.pem';
  const legacyCertificates=turn.cert===`/etc/letsencrypt/live/${host}/fullchain.pem` && turn.pkey===`/etc/letsencrypt/live/${host}/privkey.pem`;
  check(copiedCertificates || legacyCertificates,'TURN certificate paths must use the private copied pair or matching hostname paths');
  const turnUrls=(backend.HUDDLE_TURN_URLS || '').split(',').map(value=>value.trim());
  check(turnUrls.some(value=>value===`turns:${host}:${turn['tls-listening-port']}?transport=tcp`),'Backend needs the matching TLS TURN URL');
  check(backend.NODE_ENV==='production' && media.NODE_ENV==='production','Backend and media node must use production mode');
  check(backend.HUDDLE_MEDIA_MODE==='sfu' && backend.HUDDLE_PRESENCE_MODE==='redis','Group calls require SFU and shared Redis presence');
  try{check(['redis:','rediss:'].includes(new URL(backend.REDIS_URL).protocol),'Backend needs a valid shared Redis URL');}catch{errors.push('Backend needs a valid shared Redis URL');}
  const peers=Number(backend.HUDDLE_MAX_PEERS),mediaPeers=Number(media.MEDIA_MAX_PEERS);
  check(Number.isInteger(peers) && peers>=2 && peers<=60 && mediaPeers===peers,'Backend/media participant limits must match and be between 2 and 60');
  const min=Number(turn['min-port']),max=Number(turn['max-port']);
  check(Number.isInteger(min) && Number.isInteger(max) && min>=1024 && max<=65535 && max-min+1>=peers*4,'TURN relay port range is invalid or too small for the configured room');
  check(media.MEDIA_BIND_ADDRESS==='127.0.0.1','Keep media signaling on loopback behind its TLS proxy for this deployment');
  const origins=(media.MEDIA_ALLOWED_ORIGINS || '').split(',').map(value=>value.trim());
  check(origins.length>0 && origins.every(value=>{
    if(value==='file://')return true;
    try{const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password && !/REPLACE|\*/i.test(value) && url.origin===value;}catch{return false;}
  }),'Media origins must be explicit HTTPS origins, with file:// only when needed by Desktop');
  try {
    const nodes=JSON.parse(backend.HUDDLE_MEDIA_NODES);
    check(Array.isArray(nodes) && nodes.some(node=>{
      try{const url=new URL(node.url);return node.id===media.HUDDLE_MEDIA_NODE_ID && url.protocol==='https:' && !url.username && !url.password && !url.search && !url.hash && !/REPLACE/i.test(url.hostname);}catch{return false;}
    }),'Backend media nodes must include this node ID and a real HTTPS URL');
  }catch{errors.push('Backend media nodes must be valid JSON');}
  return errors;
}
async function main(args) {
  const options={};for(let i=0;i<args.length;i+=2){if(!['--turn-config','--media-env','--backend-env'].includes(args[i]) || !args[i+1])throw new Error('Use --turn-config FILE --media-env FILE --backend-env FILE');options[args[i]]=args[i+1];}
  const configs={};
  for(const [name,option] of [['turn','--turn-config'],['media','--media-env'],['backend','--backend-env']]) {
    if(!options[option])throw new Error(`Missing ${option}`);
    const info=await stat(options[option]);
    if(process.platform!=='win32' && !privateConfigPermissions(name,info))throw new Error(`${name} file permissions must restrict access to its owner (root:65534 read-only group access is allowed for TURN)`);
    configs[name]=parseSettings(await readFile(options[option],'utf8'));
  }
  const errors=validateDeployment(configs);
  if(errors.length){process.stderr.write('Configuration is not ready:\n'+errors.map(message=>`- ${message}`).join('\n')+'\n');process.exitCode=1;}
  else process.stdout.write('Offline configuration checks passed. Live DNS, TLS, TURN allocation and media delivery still require verification.\n');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv.slice(2)).catch(error=>{process.stderr.write(error.code?'Could not read deployment files. Check paths and permissions.\n':error.message+'\n');process.exitCode=1;});
