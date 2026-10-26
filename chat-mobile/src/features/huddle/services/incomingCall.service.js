import {useHuddleUiStore} from '../../../stores/huddleUiStore';
import {useHuddleStore} from '../../../stores/huddleStore';
import {useWorkspaceStore} from '../../../stores/workspaceStore';
import {getSocket} from '../../../services/socket';
import {sendHuddleRequest} from '../../../services/huddleRequest';
import {useAuthStore} from '../../../stores/authStore';

let joining=null;
function waitForSocket(workspaceId){return new Promise((resolve,reject)=>{let timer;const deadline=Date.now()+15000;
  const check=()=>{if(getSocket()?.connected && getSocket()?.auth?.workspaceId===workspaceId){clearTimeout(timer);resolve();}else if(Date.now()>=deadline)reject(new Error('Connect to TaskChat before joining.'));else timer=setTimeout(check,150);};check();});}
export async function openIncomingHuddle(invitation){
  if(joining)return joining;
  const owner=useAuthStore.getState().user?._id || useAuthStore.getState().user?.id;
  const sameUser=()=>owner && owner===(useAuthStore.getState().user?._id || useAuthStore.getState().user?.id);
  const operation=(async()=>{
    if(!sameUser())throw new Error('Sign in before joining this Huddle.');
    if(!invitation?.huddleId || invitation.expiresAt<=Date.now())throw new Error('This call invitation has expired.');
    const session=useHuddleStore.getState().session;
    if(session && session.channelId!==invitation.channelId)throw new Error('Leave your current Huddle first.');
    if(useWorkspaceStore.getState().activeWorkspaceId!==invitation.workspaceId)await useWorkspaceStore.getState().switchWorkspace(invitation.workspaceId);
    await waitForSocket(invitation.workspaceId);
    if(!sameUser())throw new Error('Your account changed. Reopen this Huddle from your conversation.');
    if(useWorkspaceStore.getState().activeWorkspaceId!==invitation.workspaceId)throw new Error('This workspace is unavailable.');
    const snapshot=await sendHuddleRequest('get',{channelId:invitation.channelId});
    if(!sameUser())throw new Error('Your account changed. Reopen this Huddle from your conversation.');
    if(String(snapshot.huddle?._id)!==invitation.huddleId || invitation.expiresAt<=Date.now())throw new Error('This Huddle has ended.');
    if(!snapshot.participants?.some(person=>String(person.userId)===String(invitation.callerId) && person.audioReady && person.connection==='connected'))throw new Error('The caller has left this Huddle.');
    useHuddleStore.getState().ingest(invitation.channelId,snapshot);
    useHuddleUiStore.getState().openPanel({channelId:invitation.channelId,label:invitation.label || invitation.callerName,workspaceId:invitation.workspaceId});
    useHuddleUiStore.getState().dismissInvitation(invitation.id);
  })();joining=operation;
  try{return await operation;}finally{if(joining===operation)joining=null;}
}
