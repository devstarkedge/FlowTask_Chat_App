import {create} from 'zustand';

export const useHuddleUiStore=create((set,get)=>({
  panel:null,
  invitations:[],
  seenInvitationIds:[],
  receiveInvitation:invitation=>set(state=>{
    if(state.seenInvitationIds.includes(invitation?.id) || !invitation?.id || !invitation.channelId || !invitation.huddleId || !Number.isFinite(invitation.expiresAt) || invitation.expiresAt<=Date.now())return state;
    const current=state.invitations.filter(item=>item.expiresAt>Date.now() && item.huddleId!==invitation.huddleId);
    return {invitations:[...current,invitation].slice(-4),seenInvitationIds:[...state.seenInvitationIds,invitation.id].slice(-128)};
  }),
  dismissInvitation:id=>set(state=>({invitations:state.invitations.filter(item=>item.id!==id)})),
  clearInvitations:()=>set({invitations:[],seenInvitationIds:[]}),
  reconcileInvitations:(channelId,snapshot)=>set(state=>({invitations:state.invitations.filter(item=>item.channelId!==channelId || (String(snapshot.huddle?._id)===item.huddleId && snapshot.participants?.some(person=>String(person.userId)===String(item.callerId) && person.audioReady && person.connection==='connected')))})),
  openPanel:panel=>set({panel}),
  closePanel:()=>{const target=get().panel?.returnFocus;set({panel:null});if(target?.isConnected)target.focus();},
}));
