import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';

const serverDirectory=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const placeholder=value=>!value || /REPLACE|CHANGE_ME/.test(value);

export function readStartupPlan(serverDir=serverDirectory,inherited=process.env) {
  const filename=resolve(serverDir,'.env');
  const file=existsSync(filename)?parseEnv(readFileSync(filename,'utf8')):{};
  // Match config/environment.js: hosted settings win in production, local
  // .env wins during development. Do not silently downgrade an SFU deployment.
  const settings=inherited.NODE_ENV==='production'?{...file,...inherited}:{...inherited,...file};
  const mode=settings.HUDDLE_MEDIA_MODE || 'p2p';
  if(!['p2p','sfu'].includes(mode))throw new Error('Invalid HUDDLE_MEDIA_MODE. Use p2p for local development or sfu for the configured media node.');
  if(settings.NODE_ENV!=='production' && mode==='p2p')return {mediaEnvironment:null};
  if(mode!=='sfu')throw new Error('Production combined Huddles require HUDDLE_MEDIA_MODE=sfu and a configured media node.');
  return {mediaEnvironment:readMediaEnvironment(serverDir,inherited)};
}

export function readMediaEnvironment(serverDir=serverDirectory,inherited=process.env) {
  const filename=inherited.MEDIA_ENV_FILE || resolve(serverDir,'huddle-media','.env');
  const privateSettings=existsSync(filename)?parseEnv(readFileSync(filename,'utf8')):{};
  // Do not pass API database, email or authentication credentials to the media
  // child. PORT belongs to the API host unless explicitly set in media.env.
  const allowed=/^(MEDIA_|HUDDLE_MEDIA_|NODE_ENV$|PATH$|SYSTEMROOT$|WINDIR$|COMSPEC$|TEMP$|TMP$|HOME$|USERPROFILE$|LD_LIBRARY_PATH$|LANG$|TZ$|NODE_EXTRA_CA_CERTS$)/i;
  const select=settings=>Object.fromEntries(Object.entries(settings).filter(([key])=>allowed.test(key)));
  const environment={...select(inherited),...select(privateSettings)};
  environment.PORT=privateSettings.PORT || '4443';
  for(const key of ['HUDDLE_MEDIA_NODE_ID','HUDDLE_MEDIA_SECRET','MEDIA_ANNOUNCED_ADDRESS','MEDIA_ALLOWED_ORIGINS']) {
    if(placeholder(environment[key]))throw new Error(`Complete ${key} in server/huddle-media/.env before starting combined Huddles.`);
  }
  if(environment.HUDDLE_MEDIA_SECRET.length<32)throw new Error('The media signing secret must contain at least 32 characters.');
  return environment;
}

// An explicit combined command for a self-hosted machine. API replicas can
// continue to use npm start without spawning duplicate media nodes.
export function startBackendWithMedia({mediaEnvironment,spawnProcess=spawn,runtime=process,serverDir=serverDirectory,schedule=setTimeout}={}) {
  if(mediaEnvironment===undefined)throw new Error('Validated media environment or an explicit local P2P plan is required.');
  const children=new Set();let stopping=false,forceTimer;
  const detach=()=>{
    if(children.size)return;
    clearTimeout(forceTimer);
    runtime.removeListener('SIGINT',interrupt);runtime.removeListener('SIGTERM',terminate);
  };
  const stop=(code=0)=>{
    if(stopping)return;
    stopping=true;runtime.exitCode=code;
    for(const child of children)child.kill('SIGTERM');
    forceTimer=schedule(()=>{for(const child of children)child.kill('SIGKILL');},10000);
    forceTimer.unref?.();detach();
  };
  const interrupt=()=>stop(130),terminate=()=>stop(143);
  runtime.on('SIGINT',interrupt);runtime.on('SIGTERM',terminate);
  const launch=(name,args,options)=>{
    const child=spawnProcess(runtime.execPath,args,{stdio:'inherit',...options});children.add(child);
    child.once('error',()=>{
      // Never print the child environment or private .env contents.
      console.error(`${name} could not start. Check its installation and configuration.`);
      children.delete(child);stop(1);detach();
    });
    child.once('exit',code=>{
      children.delete(child);
      if(!stopping)stop(Number.isInteger(code) && code!==0?code:1);
      detach();
    });
  };
  try {
    if(mediaEnvironment!==null)launch('Huddle media',['src/index.js'],{cwd:resolve(serverDir,'huddle-media'),env:mediaEnvironment});
    launch('Chat backend',['index.js'],{cwd:serverDir,env:runtime.env});
  } catch(error) {stop(1);throw error;}
  return {stop};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const plan=readStartupPlan();
    if(plan.mediaEnvironment===null)console.info('Local P2P Huddles: starting the chat backend. The SFU process is not needed in this mode; production media setup is still pending.');
    startBackendWithMedia(plan);
  }
  catch(error) {console.error(error.message);process.exitCode=1;}
}
