import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Audio } from 'expo-av';
import { Play, Pause } from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import { normalizeMediaUrl } from '../utils/mediaUtils';
import logger from '../utils/logger';

const formatDuration = (millis) => {
  if (!millis || isNaN(millis)) return '0:00';
  const seconds = Math.floor(millis / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatBytes = (bytes) => {
  if (!bytes || isNaN(bytes) || bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const AudioMessagePlayer = ({ audioUrl, duration, fileSize, colors, isMe, onLongPress }) => {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(duration ? duration * 1000 : 0);
  
  const contentColor = isMe ? colors.messageTextSent : colors.messageTextReceived;
  const normalizedAudioUrl = normalizeMediaUrl(audioUrl);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const togglePlayback = async () => {
    if (normalizedAudioUrl === '/placeholder-loading' || !normalizedAudioUrl) {
      logger.warn('Audio is still processing');
      return;
    }
    try {
      if (!sound) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: normalizedAudioUrl },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        setSound(newSound);
        setIsPlaying(true);
      } else {
        if (isPlaying) {
          await sound.pauseAsync();
        } else {
          // Check if it reached the end, if so restart
          if (positionMillis >= durationMillis) {
            await sound.replayAsync();
          } else {
            await sound.playAsync();
          }
        }
      }
    } catch (err) {
      logger.error('Failed to play audio:', err);
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setPositionMillis(status.positionMillis);
      if (status.durationMillis && !duration) {
        setDurationMillis(status.durationMillis);
      }
      setIsPlaying(status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPositionMillis(status.durationMillis); // snap to end
      }
    } else {
      if (status.error) {
        logger.error(`Audio Error: ${status.error}`);
      }
    }
  };

  const progress = durationMillis > 0 ? (positionMillis / durationMillis) : 0;

  const displayTime = (positionMillis > 0 && positionMillis < durationMillis) 
    ? formatDuration(positionMillis) 
    : formatDuration(durationMillis);

  return (
    <TouchableOpacity 
      style={styles.container}
      onLongPress={onLongPress}
      activeOpacity={0.9}
      delayLongPress={300}
    >
      <TouchableOpacity 
        style={[styles.playButton, { backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)' }]}
        onPress={togglePlayback}
        activeOpacity={0.7}
      >
        {isPlaying ? (
          <Pause size={18} color={contentColor} fill={contentColor} />
        ) : (
          <Play size={18} color={contentColor} fill={contentColor} style={{ marginLeft: 3 }} />
        )}
      </TouchableOpacity>
      
      <View style={styles.progressContainer}>
        {/* Slider Track with Thumb */}
        <View style={[styles.trackContainer]}>
          <View style={[styles.track, { backgroundColor: isMe ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)' }]}>
            <View style={[styles.progress, { backgroundColor: contentColor, width: `${progress * 100}%` }]} />
          </View>
          <View style={[styles.thumb, { backgroundColor: contentColor, left: `${progress * 100}%` }]} />
        </View>
        
        <View style={styles.timeContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {!!fileSize && (
              <>
                <Text style={[styles.timeText, { color: contentColor, opacity: 0.7, marginRight: scale(4) }]}>
                  {formatBytes(fileSize)}
                </Text>
                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: contentColor, opacity: 0.5, marginRight: scale(4) }} />
              </>
            )}
            <Text style={[styles.timeText, { color: contentColor, opacity: 0.8 }]}>
              {displayTime}
            </Text>
          </View>
          {isMe && (
            <View style={{ marginLeft: 4 }}>
              {/* Optional: Add read receipt ticks here if available, or just a styling element */}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(4),
    flexShrink: 1,
    minWidth: scale(160),
    maxWidth: '100%',
  },
  playButton: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(19),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(14),
  },
  progressContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  trackContainer: {
    height: scale(12),
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: scale(3),
    borderRadius: scale(1.5),
    width: '100%',
    overflow: 'hidden',
  },
  progress: {
    height: '100%',
    borderRadius: scale(1.5),
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  thumb: {
    position: 'absolute',
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
    top: 0,
    transform: [{ translateX: -scale(6) }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: verticalScale(4),
  },
  timeText: {
    fontSize: moderateScale(11),
    fontWeight: '500',
  },
});

export default AudioMessagePlayer;
