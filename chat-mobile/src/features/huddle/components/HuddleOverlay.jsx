import {huddlePeople} from '../utils/huddlePeople';
import React,{useEffect,useRef,useState} from 'react';
import {AppState,Modal,View,Text,Pressable,ScrollView,TextInput,StyleSheet,useWindowDimensions,Share,findNodeHandle} from 'react-native';
import {createAudioPlayer,setAudioModeAsync} from 'expo-audio';
import {useHuddleStore} from '../../../stores/huddleStore';
import {useHuddleAudioStore} from '../../../stores/huddleAudioStore';
import {useHuddleUiStore} from '../../../stores/huddleUiStore';
import {useAuthStore} from '../../../stores/authStore';
import {useWorkspaceStore} from '../../../stores/workspaceStore';
import {toggleHuddleMute,toggleHuddleCamera,toggleHuddleScreen,updateHuddleFeature,retryHuddleAudio} from '../../../services/huddleAudioService';
import {getNativeVideoView,setHuddleSpeaker,getIOSScreenPicker,setIOSScreenPickerHandle} from '../services/nativeMedia.service';
import {openIncomingHuddle} from '../services/incomingCall.service';
import {getSharedNotesSession} from '../services/sharedNotes.service';
import {sendHuddleRequest} from '../../../services/huddleRequest';
import ENV from '../../../config/environment';
import HuddleReactions from './HuddleReactions';

const ringtone=require('../../../../assets/sounds/huddle_incoming.wav');
function Button({children,onPress,disabled,danger,active}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,danger && styles.danger,active && styles.active,disabled && {opacity:0.4}]}><Text style={styles.text}>{children}</Text></Pressable>;}
function Video({stream,self=false,style}){const RTCView=getNativeVideoView();return stream && RTCView?<RTCView streamURL={stream.toURL()} objectFit="contain" mirror={self} style={style || {flex:1}}/>:null;}
function BroadcastPicker(){const Picker=getIOSScreenPicker();return Picker?<Picker ref={node=>setIOSScreenPickerHandle(node?findNodeHandle(node):null)} style={{position:'absolute',width:1,height:1,opacity:0}}/>:null;}

function SharedNotes({session,state}){
  const [notes,setNotes]=useState({value:state?.huddle?.notes || '',ready:false}),[error,setError]=useState('');
  const [client,setClient]=useState(null);
  const caret=useRef({start:0,end:0}),focused=useRef(false),[restoredSelection,setRestoredSelection]=useState(undefined);
  useEffect(()=>{
    const current=getSharedNotesSession(session.id,{initialText:state?.huddle?.notes || '',request:async(action,payload)=>{
      if(useHuddleStore.getState().session?.id!==session.id)throw new Error('This Huddle has ended.');
      const data=await sendHuddleRequest(action,{channelId:session.channelId,...payload});
      if(useHuddleStore.getState().session?.id===session.id)useHuddleStore.getState().ingest(session.channelId,data.state);return data.state;
    }});setClient(current);
    current.getSelection=()=>focused.current?caret.current:null;
    current.restoreSelection=selection=>{caret.current=selection;setRestoredSelection(selection);};
    const release=current.subscribe(setNotes);current.start().catch(e=>setError(e.message));
    return()=>{release();current.stopTyping();current.getSelection=null;current.restoreSelection=null;};
  },[session.id]);
  useEffect(()=>{client?.apply(state?.notesDocument);},[client,state?.notesDocument]);
  const typing=(state?.participants || []).filter(p=>p.id!==session.id && Date.now()-p.notesTypingAt<5000).map(p=>p.name);
  return <View style={styles.notes}><Text style={styles.heading}>Meeting notes</Text><Text style={styles.muted}>{typing.length?`${typing.join(', ')} typing…`:'Edits are shared live'}</Text>
    <TextInput accessibilityLabel="Meeting notes" multiline editable={notes.ready} value={notes.value} selection={restoredSelection}
      onSelectionChange={event=>{caret.current=event.nativeEvent.selection;}} onFocus={()=>{focused.current=true;}}
      onChangeText={text=>{setRestoredSelection(undefined);client?.edit(text);}} onBlur={()=>{focused.current=false;client?.stopTyping();}}
      maxLength={10000} style={styles.input}/>
    <Text style={styles.muted}>{error || notes.error || (notes.pending?'Syncing…':'')}</Text><Button disabled={!notes.ready} onPress={()=>client?.save().then(()=>setError('Saved to chat')).catch(e=>setError(e.message))}>Save notes</Button>
  </View>;
}

export default function HuddleOverlay(){
  const user=useAuthStore(s=>s.user),panel=useHuddleUiStore(s=>s.panel),session=useHuddleStore(s=>s.session),busy=useHuddleStore(s=>s.busy),error=useHuddleStore(s=>s.error);
  const state=useHuddleStore(s=>s.byChannel[panel?.channelId || s.session?.channelId]);
  const audio=useHuddleAudioStore(),invitations=useHuddleUiStore(s=>s.invitations);
  const [now,setNow]=useState(Date.now()),[appState,setAppState]=useState(AppState.currentState),[notesOpen,setNotesOpen]=useState(false),[joining,setJoining]=useState(false),[inviteError,setInviteError]=useState(''),[speaker,setSpeaker]=useState(true);
  const {width,height}=useWindowDimensions();
  const [screenFullscreen,setScreenFullscreen]=useState(false);
  const invitation=invitations.filter(i=>i.expiresAt>now).at(-1);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000),subscription=AppState.addEventListener('change',setAppState);return()=>{clearInterval(timer);subscription.remove();};},[]);
  useEffect(()=>{
    if(!invitation || !user)return;const timer=setTimeout(()=>useHuddleUiStore.getState().dismissInvitation(invitation.id),Math.max(0,invitation.expiresAt-Date.now()));return()=>clearTimeout(timer);
  },[invitation?.id,user]);
  useEffect(()=>{
    if(!invitation || appState!=='active' || !user || session)return;
    let player,cancelled=false;
    setAudioModeAsync({playsInSilentMode:true,interruptionMode:'doNotMix'}).then(()=>{
      if(cancelled)return;player=createAudioPlayer(ringtone);player.loop=true;player.volume=0.7;player.play();
    }).catch(()=>setInviteError('Call sound is unavailable. You can still join.'));
    return()=>{cancelled=true;player?.pause();player?.remove();};
  },[invitation?.id,appState,user,session?.id]);
  useEffect(()=>{if(panel?.channelId)useHuddleStore.getState().load(panel.channelId);},[panel?.channelId]);
  const joined=Boolean(session && session.channelId===panel?.channelId),own=state?.participants?.find(p=>p.id===session?.id);
  const people=huddlePeople(state?.participants,session?.id);
  const screen=audio.localScreenStream || audio.remoteScreenStream;
  useEffect(()=>{if(!screen)setScreenFullscreen(false);},[screen]);
  const open=()=>useHuddleUiStore.getState().openPanel({channelId:session.channelId,label:'Huddle'});
  const action=(name,data)=>updateHuddleFeature(name,data).catch(e=>setInviteError(e.message));
  if(!user)return null;
  return <>
    {session && !panel && <View style={styles.floating}><Button onPress={open}>🎧 Open Huddle</Button></View>}
    <Modal visible={Boolean(panel) && !invitation} animationType="slide" presentationStyle="fullScreen" onRequestClose={()=>screenFullscreen?setScreenFullscreen(false):useHuddleUiStore.getState().closePanel()}>
      <View style={styles.page}>
        <BroadcastPicker/>
        {screenFullscreen && screen?<><View style={{flex:1,backgroundColor:'#0b0e14'}}><Video stream={screen}/></View><Button onPress={()=>setScreenFullscreen(false)}>Exit fullscreen</Button></>:<>
        <View style={styles.row}><Text style={styles.heading}>🎧 {panel?.label || 'Huddle'}</Text><Button onPress={()=>useHuddleUiStore.getState().closePanel()}>Minimize</Button></View>
        <Text style={styles.muted}>{people.length} people · {audio.connection}</Text>
        {Boolean(error || audio.error || inviteError) && <Text accessibilityRole="alert" style={styles.error}>{error || audio.error || inviteError}</Text>}
        {!joined?<View style={styles.prejoin}>
          <Text style={styles.heading}>Ready when you are</Text><Button active={audio.joinWithoutMicrophone} onPress={()=>audio.update({joinWithoutMicrophone:!audio.joinWithoutMicrophone})}>{audio.joinWithoutMicrophone?'✓ ':''}Join without microphone</Button>
          <Button disabled={busy} onPress={()=>useHuddleStore.getState().act(state?.huddle?'join':'start',panel?.channelId)}>{busy?'Connecting…':state?.huddle?'Join Huddle':'Start Huddle'}</Button>
        </View>:<>
          <View style={[styles.stage,{flexDirection:width>height?'row':'column'}]}>
            {screen && <View style={[styles.shared,{borderColor:audio.localScreenStream?'#32d583':'#373a48',borderWidth:audio.localScreenStream?3:1}]}><Video stream={screen}/><View style={{position:'absolute',right:8,bottom:8}}><Button onPress={()=>setScreenFullscreen(true)}>Fullscreen</Button></View></View>}
            <ScrollView horizontal={width<=height} style={screen?{flexGrow:0,maxHeight:width>height?undefined:130,width:width>height?150:undefined}:{flex:1}} contentContainerStyle={styles.people}>
              {people.map(p=>{const camera=p.id===session.id?audio.localCameraStream:audio.remoteCameraStreams[p.id];return <View key={p.id} style={styles.person}>{camera?<Video stream={camera} self={p.id===session.id} style={{width:120,height:85}}/>:<Text style={styles.avatar}>{p.name?.slice(0,1) || '?'}</Text>}<Text style={styles.text}>{p.name}{p.id===session.id?' (you)':''} {p.handRaised?'✋':''} {p.muted?'🔇':''}</Text>{p.reaction && now-p.reaction.at<4000 && <Text style={styles.avatar}>{p.reaction.emoji}</Text>}</View>;})}
            </ScrollView>
          </View>
          {notesOpen && <SharedNotes session={session} state={state}/>}
          <ScrollView horizontal style={{flexGrow:0}} contentContainerStyle={styles.row}>
            <Button active={audio.muted} disabled={audio.micBusy || busy} onPress={toggleHuddleMute}>{audio.muted?'Unmute':'Mute'}</Button>
            <Button onPress={()=>{setSpeaker(!speaker);setHuddleSpeaker(!speaker);}}>{speaker?'Speaker':'Earpiece'}</Button>
            <Button disabled={audio.cameraBusy || busy} onPress={toggleHuddleCamera}>{audio.localCameraStream?'Camera off':'Camera on'}</Button>
            <Button disabled={busy || audio.screenBusy || (!audio.localScreenStream && state?.participants?.some(p=>p.screenSharing))} onPress={toggleHuddleScreen}>{audio.localScreenStream?'Stop sharing':'Share screen'}</Button>
            <Button active={own?.handRaised} onPress={()=>action('hand',{raised:!own?.handRaised})}>✋ Hand</Button>
            <Button active={notesOpen} onPress={()=>setNotesOpen(!notesOpen)}>Notes</Button>
          </ScrollView>
          <View style={styles.row}>{['👍','❤️','😂','🎉','👏','🙌'].map(emoji=><Button key={emoji} onPress={()=>action('reaction',{emoji})}>{emoji}</Button>)}</View>
          <View style={styles.row}>
            <Button onPress={()=>sendHuddleRequest('invite',{channelId:session.channelId}).then(data=>setInviteError(data.invitation?.error || `Invited ${data.invitation?.sent || 0} participants`)).catch(e=>setInviteError(e.message))}>Invite participants</Button>
            <Button onPress={()=>Share.share({message:`${ENV.CLIENT_URL}/workspace/${useWorkspaceStore.getState().activeWorkspaceId}/channel/${session.channelId}?huddle=1`}).catch(e=>setInviteError(e.message))}>Meeting link</Button>
          </View>
          <View style={styles.row}><Button danger onPress={()=>useHuddleStore.getState().act('leave',session.channelId)}>Leave Huddle</Button>
            {String(state?.huddle?.startedBy)===String(user._id) && <Button onPress={()=>useHuddleStore.getState().act('end',session.channelId)}>End for everyone</Button>}
            {audio.connection==='failed' && <Button onPress={retryHuddleAudio}>Retry audio</Button>}
          </View>
        </>}
        {joined && <HuddleReactions participants={state?.participants || []}/>}
        </>}
      </View>
    </Modal>
    <Modal visible={Boolean(invitation)} transparent animationType="fade" onRequestClose={()=>invitation && useHuddleUiStore.getState().dismissInvitation(invitation.id)}>
      <View style={styles.backdrop}><View style={styles.incoming}><Text style={styles.avatar}>🎧</Text><Text style={styles.heading}>{invitation?.callerName} is calling</Text><Text style={styles.muted}>{invitation?.label}</Text>{Boolean(inviteError) && <Text style={styles.error}>{inviteError}</Text>}<View style={styles.row}>
        <Button disabled={joining} onPress={()=>{setJoining(true);setInviteError('');openIncomingHuddle(invitation).catch(e=>setInviteError(e.message)).finally(()=>setJoining(false));}}>{joining?'Opening…':'Join'}</Button>
        <Button onPress={()=>useHuddleUiStore.getState().dismissInvitation(invitation.id)}>Dismiss</Button>
      </View></View></View>
    </Modal>
  </>;
}

const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#191c26',paddingTop:48,paddingHorizontal:16,paddingBottom:24,gap:12},row:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,flexWrap:'wrap'},heading:{color:'#fff',fontSize:19,fontWeight:'700'},text:{color:'#eee',fontSize:13},muted:{color:'#b9b4c7',fontSize:12},error:{color:'#ffc982',fontSize:13},button:{backgroundColor:'#30303e',paddingVertical:12,paddingHorizontal:15,borderRadius:10},danger:{backgroundColor:'#bd4566'},active:{backgroundColor:'#6b488c'},stage:{flex:1,gap:12,minHeight:150},shared:{flex:1,backgroundColor:'#0b0e14',borderRadius:10,overflow:'hidden',minHeight:180},people:{gap:10,alignItems:'center',justifyContent:'center'},person:{backgroundColor:'#2e2b3b',borderRadius:12,padding:12,minWidth:124,alignItems:'center',gap:5},avatar:{fontSize:36,color:'#c9a7f2',padding:10},prejoin:{flex:1,alignItems:'center',justifyContent:'center',gap:20},notes:{backgroundColor:'#282535',borderRadius:12,padding:12,maxHeight:280,gap:8},input:{color:'#fff',minHeight:90,maxHeight:140,borderWidth:1,borderColor:'#575162',borderRadius:8,padding:10,textAlignVertical:'top'},backdrop:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:'#0008',padding:24},incoming:{backgroundColor:'#252331',padding:24,borderRadius:18,gap:18,alignItems:'center',width:'100%',maxWidth:400},floating:{position:'absolute',bottom:85,right:16,zIndex:1000}});
