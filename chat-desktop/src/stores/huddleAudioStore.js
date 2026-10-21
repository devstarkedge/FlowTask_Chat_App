import {create} from 'zustand';
export const useHuddleAudioStore=create(set=>({
  connection:'idle',failedPeerIds:[],muted:false,deafened:false,remoteStream:null,remoteAudioStreams:{},localMicrophoneStream:null,speakingSessions:{},error:null,notice:null,playbackBlocked:false,
  inputDeviceId:'',outputDeviceId:'',startMuted:false,joinWithoutMicrophone:false,withoutMicrophone:false,
  localScreenStream:null,remoteScreenStream:null,remoteScreenStreams:{},screenBusy:false,localScreenShare:null,
  invitation:null,
  reconnectDeadline:null,micBusy:false,cameraBusy:false,localCameraStream:null,remoteCameraStreams:{},
  update:patch=>set(patch),
  toggleDeafen:()=>set(state=>({deafened:!state.deafened})),
}));
