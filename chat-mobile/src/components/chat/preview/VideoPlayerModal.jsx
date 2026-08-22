import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { ChevronLeft, Volume2, VolumeX } from 'lucide-react-native';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { scale, verticalScale, moderateScale } from '../../../utils/responsive';
import FileService from '../../../services/FileService';
import logger from '../../../utils/logger';
import { formatDuration } from './previewUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function VideoPlayerModal({
  visible,
  fileUrl,
  name,
  headers,
  cacheFile,
  onClose,
}) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState({});
  const [muted, setMuted] = useState(false);
  const [sourceUri, setSourceUri] = useState(fileUrl);
  const [loading, setLoading] = useState(false);

  const insets = useSafeAreaInsets();
  // Derive top padding purely from device safe-area insets — no hardcoded values.
  const headerTopPadding = insets.top;
  const footerPaddingBottom = Math.max(insets.bottom, verticalScale(20));

  useEffect(() => {
    if (!visible) {
      (async () => {
        try {
          await videoRef.current?.pauseAsync?.();
          await videoRef.current?.unloadAsync?.();
        } catch {
          // ignore cleanup errors
        }
      })();
      setStatus({});
      setSourceUri(fileUrl);
      return;
    }

    let cancelled = false;
    setSourceUri(fileUrl);

    const warmCache = async () => {
      if (!cacheFile?.url && !fileUrl) return;
      setLoading(true);
      try {
        const localUri = await FileService.downloadFile(cacheFile || { url: fileUrl, originalFileName: name });
        if (!cancelled && localUri) setSourceUri(localUri);
      } catch (err) {
        logger.warn('[VideoPlayerModal] Cache download failed, using remote URL', err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    warmCache();
    return () => {
      cancelled = true;
    };
  }, [visible, fileUrl, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = async () => {
    if (!videoRef.current) return;
    const next = !muted;
    setMuted(next);
    await videoRef.current.setIsMutedAsync(next);
  };

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaProvider>
        <View style={styles.videoModalBg}>
          <View style={[styles.videoHeader, { paddingTop: headerTopPadding }]}>
          <TouchableOpacity onPress={onClose} style={styles.videoHeaderBtn}>
            <ChevronLeft size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.videoTitle} numberOfLines={1}>{name}</Text>
          <TouchableOpacity onPress={toggleMute} style={styles.videoHeaderBtn}>
            {muted ? <VolumeX size={22} color="#fff" /> : <Volume2 size={22} color="#fff" />}
          </TouchableOpacity>
        </View>

        <View style={styles.videoArea}>
          {loading && (
            <ActivityIndicator color="#fff" style={StyleSheet.absoluteFillObject} />
          )}
          {sourceUri ? (
            <Video
              ref={videoRef}
              source={{
                uri: sourceUri,
                ...(sourceUri.startsWith('http') ? { headers } : {}),
              }}
              style={styles.videoPlayer}
              resizeMode={ResizeMode.CONTAIN}
              onPlaybackStatusUpdate={setStatus}
              useNativeControls
              shouldPlay={visible}
              isMuted={muted}
            />
          ) : null}
        </View>

        <View style={[styles.videoFooter, { paddingBottom: footerPaddingBottom }]}>
          <Text style={styles.videoTimeText}>
            {formatDuration(status.positionMillis)} / {formatDuration(status.durationMillis)}
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: status.durationMillis
                    ? `${(status.positionMillis / status.durationMillis) * 100}%`
                    : '0%',
                },
              ]}
            />
          </View>
        </View>
      </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  videoModalBg: { flex: 1, backgroundColor: '#000' },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
