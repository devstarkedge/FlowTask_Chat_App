import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Audio } from 'expo-av';
import { Play, Pause } from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';
import logger from '../utils/logger';

const formatDuration = (millis) => {
  if (!millis || isNaN(millis)) return '0:00';
  const seconds = Math.floor(millis / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const AudioMessagePlayer = ({ audioUrl, duration, colors, isMe }) => {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(duration ? duration * 1000 : 0);
  
  const contentColor = isMe ? colors.messageTextSent : colors.messageTextReceived;

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const togglePlayback = async () => {
    if (audioUrl === '/placeholder-loading' || !audioUrl) {
      logger.warn('Audio is still processing');
      return;
    }
    try {
      if (!sound) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
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

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.playButton, { backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)' }]}
        onPress={togglePlayback}
      >
        {isPlaying ? (
          <Pause size={18} color={contentColor} fill={contentColor} />
        ) : (
          <Play size={18} color={contentColor} fill={contentColor} style={{ marginLeft: 2 }} />
        )}
      </TouchableOpacity>
      
      <View style={styles.progressContainer}>
        {/* Simple Progress Bar */}
        <View style={[styles.track, { backgroundColor: isMe ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)' }]}>
          <View style={[styles.progress, { backgroundColor: contentColor, width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.timeContainer}>
          <Text style={[styles.timeText, { color: contentColor, opacity: 0.8 }]}>
            {formatDuration(positionMillis)}
          </Text>
          <Text style={[styles.timeText, { color: contentColor, opacity: 0.8 }]}>
            {formatDuration(durationMillis)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(4),
    minWidth: scale(180),
  },
  playButton: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(12),
  },
  progressContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    width: '100%',
    overflow: 'hidden',
  },
  progress: {
    height: '100%',
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: verticalScale(6),
  },
  timeText: {
    fontSize: moderateScale(11),
  },
});

export default AudioMessagePlayer;
