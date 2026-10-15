import {create} from 'zustand';
export const useHuddleAudioStore=create(set=>({
  connection:'idle',muted:false,deafened:false,remoteStream:null,error:null,notice:null,playbackBlocked:false,
  inputDeviceId:'',outputDeviceId:'',startMuted:false,joinWithoutMicrophone:false,withoutMicrophone:false,
  localScreenStream:null,remoteScreenStream:null,screenBusy:false,
  invitation:null,
  reconnectDeadline:null,micBusy:false,cameraBusy:false,localCameraStream:null,remoteCameraStreams:{},
  update:patch=>set(patch),
  toggleDeafen:()=>set(state=>({deafened:!state.deafened})),
}));
