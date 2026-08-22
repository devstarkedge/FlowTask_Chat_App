import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import { Play, Pause, X, Music } from 'lucide-react-native';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { scale, verticalScale, moderateScale } from '../../../utils/responsive';
import FileService from '../../../services/FileService';
import logger from '../../../utils/logger';
import { formatDuration, KIND_COLORS } from './previewUtils';

/**
 * Inline audio renderer used in chat bubbles.
 */
export function AudioPlayerCard({ fileUrl, name, activeColor, colors, cacheFile }) {
  const soundRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync?.().catch(() => {});
    };
  }, []);

  const resolveUri = async () => {
    if (cacheFile?.url || fileUrl) {
      try {
        return await FileService.downloadFile(cacheFile || { url: fileUrl, originalFileName: name });
      } catch (err) {
        logger.warn('[AudioPlayerCard] Cache miss, playing remote', err?.message);
      }
    }
    return fileUrl;
  };

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
      const uri = await resolveUri();
      const { sound } = await Audio.Sound.createAsync(
        { uri },
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
        },
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
  const accent = activeColor || KIND_COLORS.audio;

  return (
    <View style={[styles.audioCard, { backgroundColor: accent + '15', borderColor: accent + '40' }]}>
      <TouchableOpacity style={[styles.audioPlayBtn, { backgroundColor: accent }]} onPress={loadAndPlay} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : playing
            ? <Pause size={16} color="#fff" />
            : <Play size={16} color="#fff" />
        }
      </TouchableOpacity>

      <View style={styles.audioInfo}>
        <Text style={[styles.audioName, { color: colors?.textPrimary || '#fff' }]} numberOfLines={1}>{name}</Text>
        <View style={styles.audioProgressRow}>
          <View style={[styles.audioProgressBg, { backgroundColor: accent + '30' }]}>
            <View style={[styles.audioProgressFill, { backgroundColor: accent, width: `${progress * 100}%` }]} />
          </View>
          <Text style={[styles.audioDuration, { color: colors?.textTertiary || 'rgba(255,255,255,0.6)' }]}>
            {formatDuration(position)} / {formatDuration(duration)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Modal player used by Files Screen (chat keeps the inline card).
 */
export default function AudioPlayerModal({
  visible,
  fileUrl,
  name,
  cacheFile,
  onClose,
  colors,
}) {
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom, 20);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaProvider>
        <View style={[styles.modalBg, { paddingBottom }]}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors?.backgroundSecondary || '#161b22' }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetIcon}>
              <Music size={20} color={KIND_COLORS.audio} />
            </View>
            <Text style={[styles.sheetTitle, { color: colors?.textPrimary || '#fff' }]} numberOfLines={1}>
              {name}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors?.textSecondary || '#fff'} />
            </TouchableOpacity>
          </View>
          <AudioPlayerCard
            fileUrl={fileUrl}
            name={name}
            activeColor={KIND_COLORS.audio}
            colors={colors}
            cacheFile={cacheFile}
          />
        </View>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  modalBg: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    marginHorizontal: scale(16),
    borderRadius: moderateScale(16),
    padding: moderateScale(16),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: verticalScale(12),
    gap: 10,
  },
  sheetIcon: {
    width: scale(32),
    height: scale(32),
    borderRadius: moderateScale(8),
    backgroundColor: KIND_COLORS.audio + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { flex: 1, fontSize: moderateScale(15), fontWeight: '600' },
  closeBtn: { padding: moderateScale(4) },
});
