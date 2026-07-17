import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Mic, Pause, Play, Square, Send, Trash2 } from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const AudioRecorderUI = ({
  isRecording,
  isPaused,
  recordingDuration,
  onPause,
  onResume,
  onStop,
  onCancel,
  onSend,
  colors,
}) => {
  return (
    <View style={[styles.container, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}>
      <View style={styles.leftSection}>
        {/* Blinking red dot when recording (and not paused) */}
        <View style={[styles.redDot, (!isRecording || isPaused) && { opacity: 0 }]} />
        <Text style={[styles.duration, { color: colors.textPrimary }]}>
          {formatDuration(recordingDuration)}
        </Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.iconButton} onPress={onCancel}>
          <Trash2 size={22} color={colors.error} />
        </TouchableOpacity>

        {isPaused ? (
          <TouchableOpacity style={styles.iconButton} onPress={onResume}>
            <Play size={22} color={colors.textPrimary} fill={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.iconButton} onPress={onPause}>
            <Pause size={22} color={colors.textPrimary} fill={colors.textPrimary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={[styles.sendButton, { backgroundColor: colors.primary }]} 
          onPress={() => {
            if (isRecording) {
              onStop().then((data) => {
                if (data) onSend(data);
              });
            } else {
              onSend();
            }
          }}
        >
          <Send size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(24),
    borderWidth: 1,
    minHeight: verticalScale(44),
    flex: 1,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  redDot: {
    width: scale(10),
    height: scale(10),
    borderRadius: scale(5),
    backgroundColor: '#EF4444',
    marginRight: scale(8),
  },
  duration: {
    fontSize: moderateScale(16),
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  iconButton: {
    padding: scale(6),
  },
  sendButton: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: scale(8),
  },
});

export default AudioRecorderUI;
