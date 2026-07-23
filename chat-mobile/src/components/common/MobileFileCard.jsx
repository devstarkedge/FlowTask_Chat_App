import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Modal,
  Image,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { Video, Audio, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { downloadAndSaveFile } from '../../utils/fileDownload';
import { scale, verticalScale, moderateScale } from '../../utils/responsive';
import { normalizeMediaUrl, getFileKind } from '../../utils/mediaUtils';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import logger from '../../utils/logger';

import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileArchive,
  FileCode,
  Table2,
  File,
  ExternalLink,
  X,
  Play,
  Pause,
  Download,
  ChevronLeft,
  Volume2,
  VolumeX,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(millis) {
  if (!millis) return '0:00';
  const totalSec = Math.floor(millis / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ─── Kind colours ─────────────────────────────────────────────────────────────

const KIND_COLORS = {
  image:        '#1264a3',
  video:        '#7c3aed',
  audio:        '#10b981',
  archive:      '#f97316',
  code:         '#10b981',
  text:         '#6b7280',
  csv:          '#10b981',
  spreadsheet:  '#10b981',
  pdf:          '#ef4444',
  word:         '#1264a3',
  presentation: '#eab308',
  file:         '#6b7280',
};

// ─── Icon map ────────────────────────────────────────────────────────────────

function KindIcon({ kind, color, size = 22 }) {
  const p = { size, color };
  switch (kind) {
    case 'image':        return <ImageIcon {...p} />;
    case 'video':        return <Film {...p} />;
    case 'audio':        return <Music {...p} />;
    case 'archive':      return <FileArchive {...p} />;
    case 'code':
    case 'text':         return <FileCode {...p} />;
    case 'csv':
    case 'spreadsheet':  return <Table2 {...p} />;
    case 'pdf':
    case 'word':
    case 'presentation': return <FileText {...p} />;
    default:             return <File {...p} />;
  }
}

// ─── Fullscreen Image Viewer ──────────────────────────────────────────────────

function ImageViewer({ visible, fileUrl, name, mimeType, headers, onClose }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleDownload = async () => {
    try {
      await downloadAndSaveFile(fileUrl, name, mimeType);
    } catch (e) {
      Alert.alert('Download Error', e.message || 'Could not download image');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={ms.imgModalBg}>
        {/* Header */}
        <View style={ms.imgHeader}>
          <TouchableOpacity onPress={onClose} style={ms.imgCloseBtn} hitSlop={{ top: verticalScale(10), bottom: verticalScale(10), left: scale(10), right: scale(10) }}>
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={ms.imgTitle} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={handleDownload} style={ms.imgCloseBtn}>
            <Download size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Image */}
        <TouchableOpacity style={ms.imgContentArea} activeOpacity={1} onPress={onClose}>
          {!loaded && !error && <ActivityIndicator color="#fff" style={{ position: 'absolute' }} />}
          {error ? (
            <View style={ms.imgErrorBox}>
              <ImageIcon size={48} color="rgba(255,255,255,0.4)" />
              <Text style={ms.imgErrorText}>Failed to load image</Text>
            </View>
          ) : (
            <Image
              source={{ uri: fileUrl, headers }}
              style={ms.fullImg}
              resizeMode="contain"
              onLoad={() => setLoaded(true)}
              onError={(err) => {
                logger.warn('[ImageViewer] Fullscreen image load failed:', fileUrl, err?.nativeEvent);
                setError(true);
              }}
            />
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Fullscreen Video Player ──────────────────────────────────────────────────

function VideoPlayer({ visible, fileUrl, name, onClose }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState({});
  const [muted, setMuted] = useState(false);

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (status.isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  const toggleMute = async () => {
    if (!videoRef.current) return;
    const next = !muted;
    setMuted(next);
    await videoRef.current.setIsMutedAsync(next);
  };

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={ms.videoModalBg}>
        <View style={ms.videoHeader}>
          <TouchableOpacity onPress={onClose} style={ms.videoHeaderBtn}>
            <ChevronLeft size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={ms.videoTitle} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={toggleMute} style={ms.videoHeaderBtn}>
            {muted ? <VolumeX size={22} color="#fff" /> : <Volume2 size={22} color="#fff" />}
          </TouchableOpacity>
        </View>

        <View style={ms.videoArea}>
          <Video
            ref={videoRef}
            source={{ uri: fileUrl }}
            style={ms.videoPlayer}
            resizeMode={ResizeMode.CONTAIN}
            onPlaybackStatusUpdate={setStatus}
            useNativeControls
            shouldPlay
            isMuted={muted}
          />
        </View>

        {/* Progress bar */}
        <View style={ms.videoFooter}>
          <Text style={ms.videoTimeText}>
            {formatDuration(status.positionMillis)} / {formatDuration(status.durationMillis)}
          </Text>
          <View style={ms.progressBarBg}>
            <View style={[
              ms.progressBarFill,
              {
                width: status.durationMillis
                  ? `${(status.positionMillis / status.durationMillis) * 100}%`
                  : '0%',
              },
            ]} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Audio Player Card ────────────────────────────────────────────────────────

function AudioPlayerCard({ fileUrl, name, activeColor, colors }) {
  const soundRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadAndPlay = async () => {
    if (soundRef.current) {
      if (playing) {
        await soundRef.current.pauseAsync();
        setPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setPlaying(true);
      }
      return;
    }
    setLoading(true);
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUrl },
        { shouldPlay: true },
        (s) => {
          if (s.isLoaded) {
            setPosition(s.positionMillis);
            setDuration(s.durationMillis || 0);
            setPlaying(s.isPlaying);
            if (s.didJustFinish) {
              setPlaying(false);
              setPosition(0);
            }
          }
        }
      );
      soundRef.current = sound;
      setPlaying(true);
    } catch {
      Alert.alert('Error', 'Could not play audio.');
    } finally {
      setLoading(false);
    }
  };

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={[ms.audioCard, { backgroundColor: activeColor + '15', borderColor: activeColor + '40' }]}>
      <TouchableOpacity style={[ms.audioPlayBtn, { backgroundColor: activeColor }]} onPress={loadAndPlay} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : playing
            ? <Pause size={16} color="#fff" />
            : <Play size={16} color="#fff" />
        }
      </TouchableOpacity>

      <View style={ms.audioInfo}>
        <Text style={[ms.audioName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
        <View style={ms.audioProgressRow}>
          <View style={[ms.audioProgressBg, { backgroundColor: activeColor + '30' }]}>
            <View style={[ms.audioProgressFill, { backgroundColor: activeColor, width: `${progress * 100}%` }]} />
          </View>
          <Text style={[ms.audioDuration, { color: colors.textTertiary }]}>
            {formatDuration(position)} / {formatDuration(duration)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Code Preview Modal ───────────────────────────────────────────────────────

function CodePreviewModal({ visible, fileUrl, name, onClose }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  React.useEffect(() => {
    if (!visible || !fileUrl) return;
    setLoading(true);
    setError(false);
    fetch(fileUrl)
      .then(r => r.text())
      .then(t => { setCode(t); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [visible, fileUrl]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={ms.codeModalBg}>
        <View style={ms.codeHeader}>
          <TouchableOpacity onPress={onClose} style={ms.videoHeaderBtn}>
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={ms.codeTitle} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={() => Linking.openURL(fileUrl)} style={ms.videoHeaderBtn}>
            <ExternalLink size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <ScrollView style={ms.codeScroll} horizontal={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            {loading
              ? <ActivityIndicator color="#a5f3fc" style={{ margin: moderateScale(40) }} />
              : error
                ? <Text style={ms.codeError}>Failed to load file content.</Text>
                : <Text style={ms.codeText} selectable>{code}</Text>
            }
          </ScrollView>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main MobileFileCard ──────────────────────────────────────────────────────

export default function MobileFileCard({ file, colors }) {
  if (!file) return null;

  const name = file.originalName || file.fileName || file.name || 'File';
  const size = file.fileSize || file.size || file.fileSizeBytes;
  const mime = file.mimeType || file.type || '';
  const ext  = (name.split('.').pop() || '').toLowerCase();
  
  const rawUrl = file.url || file.secureUrl || file.secure_url || file.path || file.uri || file.location || file.fileUrl || file.downloadUrl || '';
  const fileUrl = normalizeMediaUrl(rawUrl);
  
  const rawThumb = file.thumbnailUrl || file.thumbUrl || file.previewUrl || (mime.startsWith('image/') || ext.match(/^(jpg|jpeg|png|gif|webp)$/i) ? rawUrl : null);
  const thumbUrl = normalizeMediaUrl(rawThumb);

  const kind = getFileKind(mime, name, fileUrl);

  const activeColor = (KIND_COLORS[kind] || KIND_COLORS.file);
  const themeColor  = kind === 'image' || kind === 'video' || kind === 'audio'
    ? activeColor
    : (colors.primary || activeColor);

  const [imgVisible,   setImgVisible]   = useState(false);
  const [vidVisible,   setVidVisible]   = useState(false);
  const [codeVisible,  setCodeVisible]  = useState(false);
  const [downloading,  setDownloading]  = useState(false);
  const [imgLoading,   setImgLoading]   = useState(true);
  const [imgError,     setImgError]     = useState(false);

  // ── Action handlers ──

  const openNative = useCallback(async () => {
    if (!fileUrl) return;
    setDownloading(true);
    try {
      await downloadAndSaveFile(fileUrl, name, mime);
    } catch {
      Linking.openURL(fileUrl);
    } finally {
      setDownloading(false);
    }
  }, [fileUrl, name, mime]);

  const handleCardPress = useCallback(() => {
    switch (kind) {
      case 'image': setImgVisible(true);  break;
      case 'video': setVidVisible(true);  break;
      case 'code':
      case 'text':  setCodeVisible(true); break;
      default:      openNative();         break;
    }
  }, [kind, openNative]);

  const isPlaceholder = !fileUrl || fileUrl.includes('/placeholder-loading');

  // ── IMAGES: render inline thumbnail ──
  if (kind === 'image' && isPlaceholder) {
    return (
      <View style={[ms.card, { backgroundColor: colors.backgroundSecondary || colors.background, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.primary || '#1264a3'} style={{ marginRight: scale(8) }} />
        <Text style={[ms.fileName, { color: colors.textSecondary, fontSize: moderateScale(12) }]}>Uploading image...</Text>
      </View>
    );
  }

  const token = useAuthStore.getState().accessToken;
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
  const imageHeaders = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
  };

  if (kind === 'image' && imgError) {
    return (
      <>
        <TouchableOpacity
          style={[ms.card, { backgroundColor: colors.backgroundSecondary || colors.background, borderColor: colors.border }]}
          onPress={() => { setImgError(false); setImgLoading(true); }}
          activeOpacity={0.75}
        >
          <View style={[ms.iconBox, { backgroundColor: activeColor + '20' }]}>
            <ImageIcon size={22} color={activeColor} />
          </View>
          <View style={ms.info}>
            <Text style={[ms.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
            <Text style={[ms.sizeText, { color: colors.textTertiary }]}>Tap to retry image loading</Text>
          </View>
          <TouchableOpacity
            style={[ms.actionBtn, { backgroundColor: activeColor + '15' }]}
            onPress={() => setImgVisible(true)}
          >
            <Download size={16} color={activeColor} />
          </TouchableOpacity>
        </TouchableOpacity>

        <ImageViewer
          visible={imgVisible}
          fileUrl={fileUrl}
          name={name}
          mimeType={mime}
          headers={imageHeaders}
          onClose={() => setImgVisible(false)}
        />
      </>
    );
  }

  if (kind === 'image') {
    const targetUri = thumbUrl || fileUrl;

    logger.info('[MobileFileCard] Final image props:', {
      name,
      targetUri,
      hasAuthToken: !!token,
      hasWorkspaceId: !!workspaceId,
    });

    return (
      <>
        <TouchableOpacity onPress={() => setImgVisible(true)} activeOpacity={0.85} style={ms.imgThumbContainer}>
          <Image
            source={{ uri: targetUri, headers: imageHeaders }}
            style={ms.imgThumb}
            resizeMode="cover"
            onLoadStart={() => {
              logger.info('[MobileFileCard Image] onLoadStart:', targetUri);
              setImgLoading(true);
            }}
            onLoad={(e) => {
              const { width, height } = e.nativeEvent.source || {};
              logger.info('[MobileFileCard Image] onLoad SUCCESS:', { targetUri, width, height });
            }}
            onLoadEnd={() => {
              logger.info('[MobileFileCard Image] onLoadEnd:', targetUri);
              setImgLoading(false);
            }}
            onError={(err) => {
              logger.warn('[MobileFileCard Image] onError FAILURE:', {
                targetUri,
                error: err?.nativeEvent?.error || err?.nativeEvent,
              });
              setImgLoading(false);
              setImgError(true);
            }}
          />
          {imgLoading && (
            <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.06)' }]} pointerEvents="none">
              <ActivityIndicator color={colors.primary || '#1264a3'} size="small" />
            </View>
          )}
        </TouchableOpacity>

        <ImageViewer
          visible={imgVisible}
          fileUrl={fileUrl}
          name={name}
          mimeType={mime}
          headers={imageHeaders}
          onClose={() => setImgVisible(false)}
        />
      </>
    );
  }

  // ── AUDIO: inline player ──
  if (kind === 'audio') {
    return <AudioPlayerCard fileUrl={fileUrl} name={name} activeColor={activeColor} colors={colors} />;
  }

  // ── VIDEOS: thumbnail poster + play button ──
  if (kind === 'video') {
    return (
      <>
        <TouchableOpacity onPress={() => setVidVisible(true)} activeOpacity={0.85} style={ms.vidPoster}>
          {thumbUrl ? (
            <Image source={{ uri: thumbUrl }} style={ms.vidPosterImg} resizeMode="cover" />
          ) : (
            <View style={[ms.vidPosterPlaceholder, { backgroundColor: activeColor + '25' }]}>
              <Film size={40} color={activeColor} />
            </View>
          )}
          {/* Play overlay */}
          <View style={ms.vidPlayOverlay}>
            <View style={ms.vidPlayCircle}>
              <Play size={22} color="#fff" style={{ marginLeft: scale(3) }} />
            </View>
          </View>
        </TouchableOpacity>

        <VideoPlayer
          visible={vidVisible}
          fileUrl={fileUrl}
          name={name}
          onClose={() => setVidVisible(false)}
        />
      </>
    );
  }

  // ── ALL OTHER types: rich file card ──
  return (
    <>
      <TouchableOpacity
        style={[ms.card, { backgroundColor: colors.backgroundSecondary || colors.background, borderColor: colors.border }]}
        onPress={handleCardPress}
        activeOpacity={0.75}
      >
        {/* Icon */}
        <View style={[ms.iconBox, { backgroundColor: activeColor + '20' }]}>
          <KindIcon kind={kind} color={activeColor} size={22} />
        </View>

        {/* Info */}
        <View style={ms.info}>
          <Text style={[ms.fileName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
          <View style={ms.metaRow}>
            {ext ? (
              <View style={[ms.badge, { backgroundColor: activeColor + '20' }]}>
                <Text style={[ms.badgeText, { color: activeColor }]}>{ext.toUpperCase()}</Text>
              </View>
            ) : null}
            {size > 0 && <Text style={[ms.sizeText, { color: colors.textTertiary }]}>{formatFileSize(size)}</Text>}
          </View>
        </View>

        {/* Action button */}
        <TouchableOpacity
          style={[ms.actionBtn, { backgroundColor: activeColor + '15' }]}
          onPress={kind === 'code' || kind === 'text' ? () => setCodeVisible(true) : openNative}
          disabled={downloading}
        >
          {downloading
            ? <ActivityIndicator size="small" color={activeColor} />
            : kind === 'code' || kind === 'text'
              ? <FileCode size={16} color={activeColor} />
              : <Download size={16} color={activeColor} />
          }
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Code Preview Modal */}
      {(kind === 'code' || kind === 'text') && (
        <CodePreviewModal
          visible={codeVisible}
          fileUrl={fileUrl}
          name={name}
          onClose={() => setCodeVisible(false)}
        />
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  // ── Image thumbnail (inline in bubble) ──
  imgThumbContainer: {
    width: scale(250),
    height: verticalScale(200),
    borderRadius: moderateScale(12),
    overflow: 'hidden',
    marginVertical: verticalScale(4),
  },
  imgThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1e1e1e',
  },
  imgThumbOverlay: {
    position: 'absolute',
    bottom: verticalScale(0),
    left: scale(0),
    right: scale(0),
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(5),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  imgThumbName: { color: '#fff', fontSize: moderateScale(11), fontWeight: '600', flex: 1, marginRight: scale(6) },
  imgThumbSize: { color: 'rgba(255,255,255,0.75)', fontSize: moderateScale(10) },

  // ── Fullscreen image viewer ──
  imgModalBg: { flex: 1, backgroundColor: '#000' },
  imgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(12),
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  imgCloseBtn: { padding: moderateScale(6) },
  imgTitle: { flex: 1, color: '#fff', fontSize: moderateScale(15), fontWeight: '600', marginHorizontal: scale(10) },
  imgContentArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullImg: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.72 },
  imgErrorBox: { alignItems: 'center', gap: 12 },
  imgErrorText: { color: 'rgba(255,255,255,0.5)', fontSize: moderateScale(14) },

  // ── Video poster card ──
  vidPoster: {
    width: '100%',
    minWidth: scale(240),
    maxWidth: scale(340),
    borderRadius: moderateScale(12),
    overflow: 'hidden',
    marginVertical: verticalScale(4),
  },
  vidPosterImg: { width: '100%', height: verticalScale(220) },
  vidPosterPlaceholder: {
    width: '100%',
    height: verticalScale(220),
    justifyContent: 'center',
    alignItems: 'center',
  },
  vidPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vidPlayCircle: {
    width: scale(50),
    height: verticalScale(50),
    borderRadius: moderateScale(25),
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vidFooterStrip: {
    position: 'absolute',
    bottom: verticalScale(0),
    left: scale(0),
    right: scale(0),
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(5),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vidName: { color: '#fff', fontSize: moderateScale(11), fontWeight: '600', flex: 1 },
  vidSize: { color: 'rgba(255,255,255,0.7)', fontSize: moderateScale(10) },

  // ── Fullscreen video player ──
  videoModalBg: { flex: 1, backgroundColor: '#000' },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingHorizontal: scale(12),
    paddingBottom: verticalScale(10),
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  videoHeaderBtn: { padding: moderateScale(8) },
  videoTitle: { flex: 1, color: '#fff', fontSize: moderateScale(15), fontWeight: '600', marginHorizontal: scale(8) },
  videoArea: { flex: 1, justifyContent: 'center', backgroundColor: '#000' },
  videoPlayer: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.55 },
  videoFooter: {
    paddingHorizontal: scale(20),
    paddingBottom: verticalScale(40),
    paddingTop: verticalScale(16),
    backgroundColor: 'rgba(0,0,0,0.7)',
    gap: 8,
  },
  videoTimeText: { color: 'rgba(255,255,255,0.7)', fontSize: moderateScale(12), textAlign: 'right' },
  progressBarBg: { height: verticalScale(4), backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: moderateScale(2) },
  progressBarFill: { height: verticalScale(4), backgroundColor: '#fff', borderRadius: moderateScale(2) },

  // ── Audio player card ──
  audioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(14),
    borderWidth: 1,
    padding: moderateScale(12),
    marginVertical: verticalScale(4),
    gap: 12,
  },
  audioPlayBtn: {
    width: scale(38),
    height: verticalScale(38),
    borderRadius: moderateScale(19),
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioInfo: { flex: 1, gap: 6 },
  audioName: { fontSize: moderateScale(13), fontWeight: '600' },
  audioProgressRow: { gap: 4 },
  audioProgressBg: { height: verticalScale(3), borderRadius: moderateScale(2), overflow: 'hidden' },
  audioProgressFill: { height: verticalScale(3), borderRadius: moderateScale(2) },
  audioDuration: { fontSize: moderateScale(10) },

  // ── Code preview modal ──
  codeModalBg: { flex: 1, backgroundColor: '#0d1117' },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingHorizontal: scale(12),
    paddingBottom: verticalScale(12),
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#30363d',
  },
  codeTitle: { flex: 1, color: '#e6edf3', fontSize: moderateScale(14), fontWeight: '600', marginHorizontal: scale(8) },
  codeScroll: { flex: 1, padding: moderateScale(16) },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: moderateScale(12),
    color: '#e6edf3',
    lineHeight: 20,
  },
  codeError: { color: '#f85149', fontSize: moderateScale(13), margin: moderateScale(20) },

  // ── Generic file card ──
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(12),
    borderWidth: 1,
    padding: moderateScale(10),
    marginVertical: verticalScale(3),
    gap: 10,
  },
  iconBox: {
    width: scale(42),
    height: verticalScale(42),
    borderRadius: moderateScale(10),
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1, gap: 4 },
  fileName: { fontSize: moderateScale(13), fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: scale(6), paddingVertical: verticalScale(2), borderRadius: moderateScale(4) },
  badgeText: { fontSize: moderateScale(9), fontWeight: '700', letterSpacing: 0.5 },
  sizeText: { fontSize: moderateScale(11) },
  actionBtn: {
    width: scale(34),
    height: verticalScale(34),
    borderRadius: moderateScale(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
});
