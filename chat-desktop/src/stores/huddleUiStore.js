import {create} from 'zustand';

export const useHuddleUiStore=create((set,get)=>({
  panel:null,
  invitations:[],
  receiveInvitation:invitation=>set(state=>{
    if(!invitation?.id || !invitation.channelId || !invitation.huddleId || !Number.isFinite(invitation.expiresAt) || invitation.expiresAt<=Date.now())return state;
    const current=state.invitations.filter(item=>item.expiresAt>Date.now() && item.huddleId!==invitation.huddleId);
    return {invitations:[...current,invitation].slice(-4)};
  }),
  dismissInvitation:id=>set(state=>({invitations:state.invitations.filter(item=>item.id!==id)})),
  clearInvitations:()=>set({invitations:[]}),
  openPanel:panel=>set({panel}),
  closePanel:()=>{const target=get().panel?.returnFocus;set({panel:null});if(target?.isConnected)target.focus();},
}));
