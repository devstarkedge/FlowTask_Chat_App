import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  AppState,
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  useWindowDimensions,
  Share,
  findNodeHandle,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import {
  ChevronDown,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Volume2,
  VolumeX,
  Hand,
  MoreHorizontal,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  FileText,
  Smile,
  Share2,
  UserPlus,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  RotateCcw,
  Headphones,
  X,
  Users,
  Sparkles,
  Phone,
} from 'lucide-react-native';

import { huddlePeople } from '../utils/huddlePeople';
import { useHuddleStore } from '../../../stores/huddleStore';
import { useHuddleAudioStore } from '../../../stores/huddleAudioStore';
import { useHuddleUiStore } from '../../../stores/huddleUiStore';
import { useAuthStore } from '../../../stores/authStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import {
  toggleHuddleMute,
  toggleHuddleCamera,
  toggleHuddleScreen,
  updateHuddleFeature,
  retryHuddleAudio,
} from '../../../services/huddleAudioService';
import {
  getNativeVideoView,
  setHuddleSpeaker,
  getIOSScreenPicker,
  setIOSScreenPickerHandle,
} from '../services/nativeMedia.service';
import { openIncomingHuddle } from '../services/incomingCall.service';
import { getSharedNotesSession } from '../services/sharedNotes.service';
import { sendHuddleRequest } from '../../../services/huddleRequest';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import ENV from '../../../config/environment';
import HuddleReactions from './HuddleReactions';

const ringtone = require('../../../../assets/sounds/huddle_incoming.wav');

const AVATAR_COLORS = [
  '#4F46E5', '#7C3AED', '#DB2777', '#E11D48',
  '#D97706', '#059669', '#0891B2', '#2563EB',
];

function getAvatarBg(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Video({ stream, self = false, objectFit = 'cover', style }) {
  const RTCView = getNativeVideoView();
  return stream && RTCView ? (
    <RTCView
      streamURL={stream.toURL()}
      objectFit={objectFit}
      mirror={self}
      style={style || { flex: 1 }}
    />
  ) : null;
}

function BroadcastPicker() {
  const Picker = getIOSScreenPicker();
  return Picker ? (
    <Picker
      ref={node => setIOSScreenPickerHandle(node ? findNodeHandle(node) : null)}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
    />
  ) : null;
}

function SharedNotesModal({ session, state, visible, onClose }) {
  const [notes, setNotes] = useState({ value: state?.huddle?.notes || '', ready: false });
  const [error, setError] = useState('');
  const [client, setClient] = useState(null);
  const caret = useRef({ start: 0, end: 0 });
  const focused = useRef(false);
  const [restoredSelection, setRestoredSelection] = useState(undefined);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    const current = getSharedNotesSession(session.id, {
      initialText: state?.huddle?.notes || '',
      request: async (action, payload) => {
        if (useHuddleStore.getState().session?.id !== session.id) {
          throw new Error('This Huddle has ended.');
        }
        const data = await sendHuddleRequest(action, { channelId: session.channelId, ...payload });
        if (useHuddleStore.getState().session?.id === session.id) {
          useHuddleStore.getState().ingest(session.channelId, data.state);
        }
        return data.state;
      },
    });
    setClient(current);
    current.getSelection = () => (focused.current ? caret.current : null);
    current.restoreSelection = selection => {
      caret.current = selection;
      setRestoredSelection(selection);
    };
    const release = current.subscribe(setNotes);
    current.start().catch(e => setError(e.message));
    return () => {
      release();
      current.stopTyping();
      current.getSelection = null;
      current.restoreSelection = null;
    };
  }, [session.id, visible]);

  useEffect(() => {
    client?.apply(state?.notesDocument);
  }, [client, state?.notesDocument]);

  const typing = (state?.participants || [])
    .filter(p => p.id !== session.id && Date.now() - p.notesTypingAt < 5000)
    .map(p => p.name);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.notesContainer, { paddingBottom: Math.max(insets.bottom, 20) + 10 }]}>
          <View style={styles.notesHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <FileText size={20} color="#818CF8" />
              <Text style={styles.notesTitle}>Meeting Notes</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconCircleButtonSmall}>
              <X size={18} color="#94A3B8" />
            </Pressable>
          </View>
          <Text style={styles.notesSubtitle}>
            {typing.length ? `${typing.join(', ')} typing…` : 'Edits sync live for everyone in this call'}
          </Text>
          <TextInput
            accessibilityLabel="Meeting notes"
            multiline
            placeholder="Write meeting notes, action items, or decisions here..."
            placeholderTextColor="#64748B"
            editable={notes.ready}
            value={notes.value}
            selection={restoredSelection}
            onSelectionChange={event => {
              caret.current = event.nativeEvent.selection;
            }}
            onFocus={() => {
              focused.current = true;
            }}
            onChangeText={text => {
              setRestoredSelection(undefined);
              client?.edit(text);
            }}
            onBlur={() => {
              focused.current = false;
              client?.stopTyping();
            }}
            maxLength={10000}
            style={styles.notesInput}
          />
          {Boolean(error || notes.error || notes.pending) && (
            <Text style={styles.notesStatus}>{error || notes.error || (notes.pending ? 'Syncing…' : '')}</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Pressable
              disabled={!notes.ready}
              onPress={() =>
                client
                  ?.save()
                  .then(() => {
                    setError('Saved to chat');
                    Toast.show({ type: 'success', text1: 'Notes saved to chat' });
                  })
                  .catch(e => setError(e.message))
              }
              style={[styles.primaryButton, { flex: 1 }, !notes.ready && { opacity: 0.5 }]}
            >
              <Text style={styles.primaryButtonText}>Save to channel chat</Text>
            </Pressable>
            <Pressable onPress={onClose} style={[styles.secondaryButton, { paddingHorizontal: 20 }]}>
              <Text style={styles.secondaryButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MoreActionsSheet({
  visible,
  onClose,
  session,
  user,
  state,
  audio,
  busy,
  notesOpen,
  onToggleNotes,
  onToggleReactions,
  reactionsOpen,
  onInvite,
  onShareLink,
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const isHost = String(state?.huddle?.startedBy) === String(user?._id);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={[styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetHeading}>Huddle Options</Text>

          <View style={styles.sheetList}>
            {/* Screen Share */}
            <Pressable
              style={styles.sheetItem}
              disabled={busy || audio.screenBusy || (!audio.localScreenStream && state?.participants?.some(p => p.screenSharing))}
              onPress={() => {
                onClose();
                toggleHuddleScreen();
              }}
            >
              <View style={[styles.sheetIconWrap, audio.localScreenStream && styles.sheetIconWrapActive]}>
                {audio.localScreenStream ? (
                  <ScreenShareOff size={20} color="#F87171" />
                ) : (
                  <ScreenShare size={20} color="#38BDF8" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>
                  {audio.localScreenStream ? 'Stop screen sharing' : 'Share screen'}
                </Text>
                <Text style={styles.sheetItemDesc}>
                  {audio.localScreenStream ? 'Currently sharing your screen' : 'Present documents, apps, or slides'}
                </Text>
              </View>
            </Pressable>

            {/* Notes */}
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                onClose();
                onToggleNotes();
              }}
            >
              <View style={[styles.sheetIconWrap, notesOpen && styles.sheetIconWrapActive]}>
                <FileText size={20} color={notesOpen ? '#818CF8' : '#CBD5E1'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Meeting notes</Text>
                <Text style={styles.sheetItemDesc}>Collaborative live notes for all participants</Text>
              </View>
            </Pressable>

            {/* Emoji Reactions Bar Toggle */}
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                onClose();
                onToggleReactions();
              }}
            >
              <View style={[styles.sheetIconWrap, reactionsOpen && styles.sheetIconWrapActive]}>
                <Smile size={20} color={reactionsOpen ? '#FBBF24' : '#CBD5E1'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Emoji reactions bar</Text>
                <Text style={styles.sheetItemDesc}>
                  {reactionsOpen ? 'Hide emoji quick bar' : 'Show floating emoji quick bar'}
                </Text>
              </View>
            </Pressable>

            {/* Invite */}
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                onClose();
                onInvite();
              }}
            >
              <View style={styles.sheetIconWrap}>
                <UserPlus size={20} color="#34D399" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Invite participants</Text>
                <Text style={styles.sheetItemDesc}>Notify workspace members to join this huddle</Text>
              </View>
            </Pressable>

            {/* Copy Meeting Link */}
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                onClose();
                onShareLink();
              }}
            >
              <View style={styles.sheetIconWrap}>
                <Share2 size={20} color="#60A5FA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Share meeting link</Text>
                <Text style={styles.sheetItemDesc}>Copy link or share to other apps</Text>
              </View>
            </Pressable>

            {/* Retry Audio if failed */}
            {audio.connection === 'failed' && (
              <Pressable
                style={styles.sheetItem}
                onPress={() => {
                  onClose();
                  retryHuddleAudio();
                }}
              >
                <View style={[styles.sheetIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                  <RotateCcw size={20} color="#F87171" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetItemTitle, { color: '#F87171' }]}>Retry audio connection</Text>
                  <Text style={styles.sheetItemDesc}>Reconnect audio streams</Text>
                </View>
              </Pressable>
            )}

            {/* End for Everyone (Host Only) */}
            {isHost && (
              <Pressable
                style={styles.sheetItem}
                onPress={() => {
                  onClose();
                  useHuddleStore.getState().act('end', session.channelId);
                }}
              >
                <View style={[styles.sheetIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                  <PhoneOff size={20} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetItemTitle, { color: '#EF4444' }]}>End Huddle for everyone</Text>
                  <Text style={styles.sheetItemDesc}>Disconnect all participants and close room</Text>
                </View>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function HuddleOverlay() {
  const user = useAuthStore(s => s.user);
  const panel = useHuddleUiStore(s => s.panel);
  const session = useHuddleStore(s => s.session);
  const busy = useHuddleStore(s => s.busy);
  const error = useHuddleStore(s => s.error);
  const state = useHuddleStore(s => s.byChannel[panel?.channelId || s.session?.channelId]);
  const audio = useHuddleAudioStore();
  const invitations = useHuddleUiStore(s => s.invitations);

  const [now, setNow] = useState(Date.now());
  const [appState, setAppState] = useState(AppState.currentState);
  const [notesOpen, setNotesOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [speaker, setSpeaker] = useState(true);
  const [screenFullscreen, setScreenFullscreen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showReactionsBar, setShowReactionsBar] = useState(true);

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const invitation = invitations.filter(i => i.expiresAt > now).at(-1);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const subscription = AppState.addEventListener('change', setAppState);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!invitation || !user) return;
    const timer = setTimeout(
      () => useHuddleUiStore.getState().dismissInvitation(invitation.id),
      Math.max(0, invitation.expiresAt - Date.now())
    );
    return () => clearTimeout(timer);
  }, [invitation?.id, user]);

  useEffect(() => {
    if (!invitation || appState !== 'active' || !user || session) return;
    let player, cancelled = false;
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' })
      .then(() => {
        if (cancelled) return;
        player = createAudioPlayer(ringtone);
        player.loop = true;
        player.volume = 0.7;
        player.play();
      })
      .catch(() => setInviteError('Call sound is unavailable. You can still join.'));
    return () => {
      cancelled = true;
      player?.pause();
      player?.remove();
    };
  }, [invitation?.id, appState, user, session?.id]);

  useEffect(() => {
    if (panel?.channelId) useHuddleStore.getState().load(panel.channelId);
  }, [panel?.channelId]);

  const joined = Boolean(session && session.channelId === panel?.channelId);
  const own = state?.participants?.find(p => p.id === session?.id);
  const people = huddlePeople(state?.participants, session?.id);
  const screen = audio.localScreenStream || audio.remoteScreenStream;

  useEffect(() => {
    if (!screen) setScreenFullscreen(false);
  }, [screen]);

  const open = () => useHuddleUiStore.getState().openPanel({ channelId: session.channelId, label: 'Huddle' });
  const action = (name, data) => updateHuddleFeature(name, data).catch(e => setInviteError(e.message));

  const handleShareLink = async () => {
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
    const channelId = session?.channelId || panel?.channelId;
    const url = `${ENV.CLIENT_URL}/workspace/${workspaceId}/channel/${channelId}?huddle=1`;
    try {
      await Clipboard.setStringAsync(url);
      Toast.show({ type: 'success', text1: 'Huddle link copied to clipboard' });
    } catch (e) {}
    Share.share({ message: url }).catch(e => setInviteError(e.message));
  };

  const handleInvite = () => {
    const channelId = session?.channelId || panel?.channelId;
    sendHuddleRequest('invite', { channelId })
      .then(data => {
        const msg = data.invitation?.error || `Invited ${data.invitation?.sent || 0} participants`;
        setInviteError(msg);
        Toast.show({ type: 'info', text1: msg });
      })
      .catch(e => setInviteError(e.message));
  };

  if (!user) return null;

  // Minimized Floating Pill when user navigates away inside the app
  const renderFloatingPill = () => {
    if (!session || panel) return null;
    return (
      <Pressable
        onPress={open}
        style={[styles.floatingPill, { bottom: Math.max(insets.bottom, 20) + 70 }]}
      >
        <View style={styles.floatingPulseDot} />
        <Headphones size={17} color="#A78BFA" />
        <Text style={styles.floatingPillText} numberOfLines={1}>
          {panel?.label || 'Huddle'} · {people.length} in call
        </Text>
      </Pressable>
    );
  };

  // Participant Card Renderer
  const renderParticipant = (p, cardStyle, isTwoUp = false) => {
    const isSelf = p.id === session?.id;
    const camera = isSelf ? audio.localCameraStream : audio.remoteCameraStreams[p.id];
    const isSpeaking = Boolean(audio.speakingSessions?.[p.id]);
    const isMuted = isSelf ? audio.muted : p.muted;
    const initials = (p.name || '?').trim().slice(0, 2).toUpperCase();
    const avatarColor = getAvatarBg(p.name);

    return (
      <View
        key={p.id}
        style={[
          styles.participantCard,
          cardStyle,
          isSpeaking && styles.participantCardSpeaking,
        ]}
      >
        {/* Background / Video Feed / Avatar */}
        {camera ? (
          <View style={styles.videoFill}>
            <Video stream={camera} self={isSelf} objectFit="cover" />
          </View>
        ) : (
          <View style={styles.avatarCenterWrap}>
            <View
              style={[
                styles.largeAvatarCircle,
                { backgroundColor: avatarColor },
                isSpeaking && styles.avatarPulseGlow,
                isTwoUp && { width: 84, height: 84, borderRadius: 42 },
              ]}
            >
              <Text style={[styles.avatarInitials, isTwoUp && { fontSize: 32 }]}>
                {initials}
              </Text>
            </View>
          </View>
        )}

        {/* Floating Top Indicators */}
        <View style={styles.cardTopRow}>
          {p.handRaised ? (
            <View style={styles.handBadge}>
              <Text style={{ fontSize: 13 }}>✋</Text>
              <Text style={styles.handBadgeText}>Raised</Text>
            </View>
          ) : <View />}

          {p.reaction && now - p.reaction.at < 4000 && (
            <View style={styles.reactionBubble}>
              <Text style={{ fontSize: 28 }}>{p.reaction.emoji}</Text>
            </View>
          )}
        </View>

        {/* Bottom User Info Pill */}
        <View style={styles.cardBottomBar}>
          <View style={styles.namePill}>
            <Text style={styles.participantName} numberOfLines={1}>
              {p.name || 'Participant'}
              {isSelf ? ' (you)' : ''}
            </Text>
            {isMuted ? (
              <View style={styles.mutedBadge}>
                <MicOff size={13} color="#F87171" />
              </View>
            ) : isSpeaking ? (
              <View style={styles.speakingBadge}>
                <Mic size={13} color="#34D399" />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <>
      {renderFloatingPill()}

      {/* Main Full-Screen Huddle Modal */}
      <Modal
        visible={Boolean(panel) && !invitation}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() =>
          screenFullscreen ? setScreenFullscreen(false) : useHuddleUiStore.getState().closePanel()
        }
      >
        <View style={[styles.container, { paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <BroadcastPicker />

          {/* Fullscreen Shared Screen View */}
          {screenFullscreen && screen ? (
            <View style={styles.fullscreenScreenContainer}>
              <Video stream={screen} objectFit="contain" style={{ flex: 1 }} />
              <Pressable
                onPress={() => setScreenFullscreen(false)}
                style={[styles.floatingExitFullscreen, { top: Math.max(insets.top, 16) + 12 }]}
              >
                <Minimize2 size={18} color="#FFFFFF" />
                <Text style={styles.floatingExitText}>Exit Fullscreen</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Header Navigation Bar */}
              <View style={styles.headerBar}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Minimize call"
                  onPress={() => useHuddleUiStore.getState().closePanel()}
                  style={styles.headerIconButton}
                >
                  <ChevronDown size={24} color="#CBD5E1" />
                </Pressable>

                <View style={styles.headerCenter}>
                  <View style={styles.headerTitleRow}>
                    <Headphones size={17} color="#818CF8" />
                    <Text style={styles.headerTitle} numberOfLines={1}>
                      {panel?.label || 'Huddle'}
                    </Text>
                  </View>
                  <View style={styles.headerStatusRow}>
                    <View
                      style={[
                        styles.statusDot,
                        audio.connection === 'connected'
                          ? styles.statusDotConnected
                          : audio.connection === 'connecting'
                          ? styles.statusDotConnecting
                          : styles.statusDotFailed,
                      ]}
                    />
                    <Text style={styles.headerSubtitle}>
                      {people.length} {people.length === 1 ? 'person' : 'people'} · {audio.connection}
                    </Text>
                  </View>
                </View>

                <View style={styles.headerRightActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Invite participants"
                    onPress={handleInvite}
                    style={styles.headerIconButton}
                  >
                    <UserPlus size={19} color="#CBD5E1" />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Share meeting link"
                    onPress={handleShareLink}
                    style={styles.headerIconButton}
                  >
                    <Share2 size={19} color="#CBD5E1" />
                  </Pressable>
                </View>
              </View>

              {/* Error Banner */}
              {Boolean(error || audio.error || inviteError) && (
                <View style={styles.alertBanner}>
                  <Text style={styles.alertText}>{error || audio.error || inviteError}</Text>
                </View>
              )}

              {/* Not Joined Yet / Prejoin Lobby */}
              {!joined ? (
                <View style={styles.prejoinContainer}>
                  <View style={styles.prejoinCard}>
                    <View style={styles.prejoinIconWrap}>
                      <Headphones size={44} color="#818CF8" />
                    </View>
                    <Text style={styles.prejoinHeading}>Ready to join?</Text>
                    <Text style={styles.prejoinSubtext}>
                      {people.length > 0
                        ? `${people.length} teammate${people.length > 1 ? 's' : ''} currently in this huddle`
                        : 'No one is here yet. Start the conversation!'}
                    </Text>

                    {/* Prejoin Mic Toggle Option */}
                    <Pressable
                      style={[
                        styles.prejoinTogglePill,
                        audio.joinWithoutMicrophone && styles.prejoinTogglePillActive,
                      ]}
                      onPress={() => audio.update({ joinWithoutMicrophone: !audio.joinWithoutMicrophone })}
                    >
                      {audio.joinWithoutMicrophone ? (
                        <MicOff size={18} color="#F87171" />
                      ) : (
                        <Mic size={18} color="#34D399" />
                      )}
                      <Text style={styles.prejoinToggleText}>
                        {audio.joinWithoutMicrophone ? 'Joining muted' : 'Microphone enabled'}
                      </Text>
                      {audio.joinWithoutMicrophone && <Check size={16} color="#F87171" />}
                    </Pressable>

                    <Pressable
                      disabled={busy}
                      onPress={() =>
                        useHuddleStore.getState().act(state?.huddle ? 'join' : 'start', panel?.channelId)
                      }
                      style={[styles.prejoinJoinButton, busy && { opacity: 0.6 }]}
                    >
                      <Text style={styles.prejoinJoinButtonText}>
                        {busy ? 'Connecting…' : state?.huddle ? 'Join Huddle' : 'Start Huddle'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  {/* Participant Stage */}
                  <View style={styles.stageArea}>
                    {/* Active Shared Screen Hero */}
                    {screen ? (
                      <View style={styles.screenShareStage}>
                        <View
                          style={[
                            styles.screenShareCard,
                            {
                              borderColor: audio.localScreenStream ? '#10B981' : '#3B82F6',
                            },
                          ]}
                        >
                          <Video stream={screen} objectFit="contain" />
                          <View style={styles.screenShareBadge}>
                            <Text style={styles.screenShareBadgeText}>
                              {audio.localScreenStream ? 'Your Screen' : 'Shared Screen'}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => setScreenFullscreen(true)}
                            style={styles.screenShareFullscreenBtn}
                          >
                            <Maximize2 size={16} color="#FFFFFF" />
                          </Pressable>
                        </View>

                        {/* Thumbnails of participants under screen share */}
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.screenThumbnailsRow}
                          style={{ flexGrow: 0, marginTop: 10 }}
                        >
                          {people.map(p =>
                            renderParticipant(p, { width: 110, height: 110, borderRadius: 14 })
                          )}
                        </ScrollView>
                      </View>
                    ) : (
                      /* Regular Audio / Video Grid */
                      <View style={styles.gridContainer}>
                        {people.length === 1 ? (
                          // Solo hero view
                          <View style={styles.soloWrap}>
                            {renderParticipant(people[0], styles.soloCard)}
                            <View style={styles.soloTipPill}>
                              <Users size={15} color="#94A3B8" />
                              <Text style={styles.soloTipText}>
                                Waiting for teammates to join…
                              </Text>
                              <Pressable onPress={handleInvite} style={styles.soloInviteBtn}>
                                <Text style={styles.soloInviteBtnText}>Invite</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : people.length === 2 ? (
                          // 2 participants: Vertical split (two large stacked hero cards)
                          <View style={styles.twoUpWrap}>
                            {people.map(p => renderParticipant(p, styles.twoUpCard, true))}
                          </View>
                        ) : (
                          // 3+ participants: Responsive grid
                          <ScrollView
                            contentContainerStyle={styles.multiGridWrap}
                            showsVerticalScrollIndicator={false}
                          >
                            {people.map(p => renderParticipant(p, styles.multiGridCard))}
                          </ScrollView>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Floating Reactions Bar (Quick Tap Row) */}
                  {showReactionsBar && (
                    <View style={styles.floatingReactionsBar}>
                      {['👍', '❤️', '😂', '🎉', '👏', '🙌'].map(emoji => (
                        <Pressable
                          key={emoji}
                          onPress={() => action('reaction', { emoji })}
                          style={styles.emojiQuickBtn}
                        >
                          <Text style={styles.emojiQuickText}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* Bottom Dock Call Controls */}
                  <View style={styles.bottomDock}>
                    {/* Mic Toggle */}
                    <View style={styles.dockItem}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={audio.muted ? 'Unmute microphone' : 'Mute microphone'}
                        disabled={audio.micBusy || busy}
                        onPress={toggleHuddleMute}
                        style={[
                          styles.dockCircleBtn,
                          audio.muted ? styles.dockBtnMuted : styles.dockBtnUnmuted,
                        ]}
                      >
                        {audio.muted ? (
                          <MicOff size={22} color="#F87171" />
                        ) : (
                          <Mic size={22} color="#34D399" />
                        )}
                      </Pressable>
                      <Text style={styles.dockLabel}>{audio.muted ? 'Unmute' : 'Mute'}</Text>
                    </View>

                    {/* Camera Toggle */}
                    <View style={styles.dockItem}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={audio.localCameraStream ? 'Turn off camera' : 'Turn on camera'}
                        disabled={audio.cameraBusy || busy}
                        onPress={toggleHuddleCamera}
                        style={[
                          styles.dockCircleBtn,
                          audio.localCameraStream ? styles.dockBtnActivePurple : styles.dockBtnDark,
                        ]}
                      >
                        {audio.localCameraStream ? (
                          <VideoIcon size={22} color="#818CF8" />
                        ) : (
                          <VideoOff size={22} color="#94A3B8" />
                        )}
                      </Pressable>
                      <Text style={styles.dockLabel}>Video</Text>
                    </View>

                    {/* Speaker Toggle */}
                    <View style={styles.dockItem}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={speaker ? 'Switch to earpiece' : 'Switch to speaker'}
                        onPress={() => {
                          const next = !speaker;
                          setSpeaker(next);
                          setHuddleSpeaker(next);
                        }}
                        style={[
                          styles.dockCircleBtn,
                          speaker ? styles.dockBtnActiveBlue : styles.dockBtnDark,
                        ]}
                      >
                        {speaker ? (
                          <Volume2 size={22} color="#38BDF8" />
                        ) : (
                          <VolumeX size={22} color="#94A3B8" />
                        )}
                      </Pressable>
                      <Text style={styles.dockLabel}>{speaker ? 'Speaker' : 'Ear'}</Text>
                    </View>

                    {/* Hand Raise */}
                    <View style={styles.dockItem}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={own?.handRaised ? 'Lower hand' : 'Raise hand'}
                        onPress={() => action('hand', { raised: !own?.handRaised })}
                        style={[
                          styles.dockCircleBtn,
                          own?.handRaised ? styles.dockBtnActiveAmber : styles.dockBtnDark,
                        ]}
                      >
                        <Hand size={22} color={own?.handRaised ? '#FBBF24' : '#94A3B8'} />
                      </Pressable>
                      <Text style={styles.dockLabel}>Hand</Text>
                    </View>

                    {/* More Menu */}
                    <View style={styles.dockItem}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="More options"
                        onPress={() => setMoreMenuOpen(true)}
                        style={[styles.dockCircleBtn, styles.dockBtnDark]}
                      >
                        <MoreHorizontal size={22} color="#CBD5E1" />
                      </Pressable>
                      <Text style={styles.dockLabel}>More</Text>
                    </View>

                    {/* Leave Huddle */}
                    <View style={styles.dockItem}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Leave Huddle"
                        onPress={() => useHuddleStore.getState().act('leave', session.channelId)}
                        style={[styles.dockCircleBtn, styles.dockBtnEndCall]}
                      >
                        <PhoneOff size={22} color="#FFFFFF" />
                      </Pressable>
                      <Text style={[styles.dockLabel, { color: '#F87171' }]}>Leave</Text>
                    </View>
                  </View>
                </>
              )}

              {/* Animated Floating Emoji Reactions Layer */}
              {joined && <HuddleReactions participants={state?.participants || []} />}

              {/* More Actions Modal Sheet */}
              <MoreActionsSheet
                visible={moreMenuOpen}
                onClose={() => setMoreMenuOpen(false)}
                session={session}
                user={user}
                state={state}
                audio={audio}
                busy={busy}
                notesOpen={notesOpen}
                onToggleNotes={() => setNotesOpen(!notesOpen)}
                onToggleReactions={() => setShowReactionsBar(!showReactionsBar)}
                reactionsOpen={showReactionsBar}
                onInvite={handleInvite}
                onShareLink={handleShareLink}
              />

              {/* Collaborative Meeting Notes Sheet */}
              {joined && (
                <SharedNotesModal
                  session={session}
                  state={state}
                  visible={notesOpen}
                  onClose={() => setNotesOpen(false)}
                />
              )}
            </>
          )}
        </View>
      </Modal>

      {/* Incoming Call Popup Banner */}
      <Modal
        visible={Boolean(invitation)}
        transparent
        animationType="fade"
        onRequestClose={() => invitation && useHuddleUiStore.getState().dismissInvitation(invitation.id)}
      >
        <View style={styles.incomingBackdrop}>
          <View style={styles.incomingCard}>
            <View style={styles.incomingIconPulsing}>
              <Headphones size={36} color="#A78BFA" />
            </View>
            <Text style={styles.incomingCallerName}>{invitation?.callerName}</Text>
            <Text style={styles.incomingSubtitle}>is inviting you to a Huddle</Text>
            <View style={styles.incomingChannelPill}>
              <Text style={styles.incomingChannelText} numberOfLines={1}>
                #{invitation?.label}
              </Text>
            </View>

            {Boolean(inviteError) && (
              <Text style={styles.alertText}>{inviteError}</Text>
            )}

            <View style={styles.incomingActionsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decline invitation"
                onPress={() => useHuddleUiStore.getState().dismissInvitation(invitation.id)}
                style={styles.incomingDeclineBtn}
              >
                <PhoneOff size={20} color="#FFFFFF" />
                <Text style={styles.incomingBtnText}>Decline</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Join huddle"
                disabled={joining}
                onPress={() => {
                  setJoining(true);
                  setInviteError('');
                  openIncomingHuddle(invitation)
                    .catch(e => setInviteError(e.message))
                    .finally(() => setJoining(false));
                }}
                style={[styles.incomingAcceptBtn, joining && { opacity: 0.6 }]}
              >
                <Phone size={20} color="#FFFFFF" />
                <Text style={styles.incomingBtnText}>{joining ? 'Joining…' : 'Join'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0F17',
    paddingHorizontal: 16,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1E2B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    maxWidth: 180,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotConnected: {
    backgroundColor: '#10B981',
  },
  statusDotConnecting: {
    backgroundColor: '#F59E0B',
  },
  statusDotFailed: {
    backgroundColor: '#EF4444',
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginVertical: 6,
  },
  alertText: {
    color: '#FCA5A5',
    fontSize: 13,
    textAlign: 'center',
  },

  // Participant Stage
  stageArea: {
    flex: 1,
    justifyContent: 'center',
    marginVertical: 12,
  },
  gridContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  soloWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  soloCard: {
    flex: 1,
    maxHeight: 460,
    borderRadius: 24,
  },
  soloTipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151926',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 8,
    alignSelf: 'center',
  },
  soloTipText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  soloInviteBtn: {
    backgroundColor: '#312E81',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  soloInviteBtnText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '600',
  },

  // 2 Participants Stacked Layout
  twoUpWrap: {
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  twoUpCard: {
    flex: 1,
    borderRadius: 20,
    minHeight: 180,
  },

  // 3+ Multi Grid
  multiGridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    paddingBottom: 20,
  },
  multiGridCard: {
    width: '48%',
    height: 180,
    borderRadius: 18,
  },

  // Participant Card Elements
  participantCard: {
    backgroundColor: '#171B26',
    borderWidth: 1.5,
    borderColor: '#242938',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantCardSpeaking: {
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  videoFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  avatarCenterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeAvatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarPulseGlow: {
    borderWidth: 3,
    borderColor: '#34D399',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
  },
  cardTopRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  handBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(217, 119, 6, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  handBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  reactionBubble: {
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    padding: 6,
    borderRadius: 18,
  },
  cardBottomBar: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  namePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    gap: 6,
    maxWidth: '90%',
  },
  participantName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  mutedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    padding: 3,
    borderRadius: 8,
  },
  speakingBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    padding: 3,
    borderRadius: 8,
  },

  // Screen Share Views
  screenShareStage: {
    flex: 1,
    justifyContent: 'center',
  },
  screenShareCard: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 18,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 220,
  },
  screenShareBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  screenShareBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  screenShareFullscreenBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    padding: 8,
    borderRadius: 10,
  },
  screenThumbnailsRow: {
    gap: 10,
    paddingVertical: 4,
  },
  fullscreenScreenContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  floatingExitFullscreen: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  floatingExitText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Floating Reactions Bar
  floatingReactionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#161A26',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 12,
    alignSelf: 'center',
    width: '94%',
  },
  emojiQuickBtn: {
    padding: 6,
    borderRadius: 12,
  },
  emojiQuickText: {
    fontSize: 22,
  },

  // Bottom Calling Controls Dock
  bottomDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141824',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 34,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  dockItem: {
    alignItems: 'center',
    gap: 4,
  },
  dockCircleBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  dockBtnDark: {
    backgroundColor: '#202534',
  },
  dockBtnMuted: {
    backgroundColor: '#381A23',
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  dockBtnUnmuted: {
    backgroundColor: '#133527',
    borderWidth: 1,
    borderColor: '#065F46',
  },
  dockBtnActivePurple: {
    backgroundColor: '#2A244D',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  dockBtnActiveBlue: {
    backgroundColor: '#162C3D',
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  dockBtnActiveAmber: {
    backgroundColor: '#3E2512',
    borderWidth: 1,
    borderColor: '#D97706',
  },
  dockBtnEndCall: {
    backgroundColor: '#EF4444',
  },
  dockLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },

  // Prejoin Screen
  prejoinContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  prejoinCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#161A26',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    gap: 16,
  },
  prejoinIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22283A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  prejoinHeading: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
  },
  prejoinSubtext: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  prejoinTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1F2436',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 20,
    width: '100%',
    justifyContent: 'center',
  },
  prejoinTogglePillActive: {
    backgroundColor: '#381A23',
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  prejoinToggleText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
  prejoinJoinButton: {
    backgroundColor: '#4F46E5',
    width: '100%',
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  prejoinJoinButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Floating Minimized Pill
  floatingPill: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E2333',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  floatingPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  floatingPillText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 200,
  },

  // Modal Backdrop & Bottom Sheets
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#151926',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#475569',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeading: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  sheetList: {
    gap: 6,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 14,
  },
  sheetIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#202638',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetIconWrapActive: {
    backgroundColor: '#2E2856',
  },
  sheetItemTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  sheetItemDesc: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },

  // Notes Modal
  notesContainer: {
    backgroundColor: '#151926',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '80%',
    gap: 12,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notesTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  notesSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
  },
  notesInput: {
    backgroundColor: '#0F121C',
    color: '#F8FAFC',
    minHeight: 140,
    maxHeight: 240,
    borderWidth: 1,
    borderColor: '#262D42',
    borderRadius: 14,
    padding: 14,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
  },
  notesStatus: {
    color: '#A5B4FC',
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#202638',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  iconCircleButtonSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#202638',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Incoming Call Overlay
  incomingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  incomingCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#161A26',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  incomingIconPulsing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#28244D',
    borderWidth: 2,
    borderColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  incomingCallerName: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  incomingSubtitle: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
  },
  incomingChannelPill: {
    backgroundColor: '#202638',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 2,
  },
  incomingChannelText: {
    color: '#C7D2FE',
    fontSize: 13,
    fontWeight: '600',
  },
  incomingActionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 14,
    width: '100%',
  },
  incomingDeclineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  incomingAcceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  incomingBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
