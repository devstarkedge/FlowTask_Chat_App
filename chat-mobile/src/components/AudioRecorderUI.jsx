import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity } from 'react-native';
import { Mic, Pause, Play, Send, Trash2, ChevronLeft, ChevronUp } from 'lucide-react-native';
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
  onStart,
  onPause,
  onResume,
  onStop,
  onCancel,
  onSend,
  colors,
}) => {
  const [isLocked, setIsLocked] = useState(false);
  const pan = useRef(new Animated.ValueXY()).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [uiDuration, setUiDuration] = useState(0);

  // Track latest state for PanResponder
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;

  const callbacksRef = useRef({ onStart, onStop, onCancel, onSend });
  callbacksRef.current = { onStart, onStop, onCancel, onSend };

  // Sync final duration when stopped, or reset when started
  useEffect(() => {
    if (isRecording) {
      setUiDuration(0);
    } else {
      setUiDuration(recordingDuration || 0);
    }
  }, [isRecording, recordingDuration]);

  // Isolated high-performance UI timer (60fps animation, 1hz tick)
  useEffect(() => {
    let interval;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setUiDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Blinking red dot
  useEffect(() => {
    let anim;
    if (isRecording && !isPaused) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true })
        ])
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => anim && anim.stop();
  }, [isRecording, isPaused]);

  const resetPan = () => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
    }).start();
    Animated.timing(opacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  const hasHandledActionRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isLockedRef.current,
      onMoveShouldSetPanResponder: () => !isLockedRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        setIsLocked(false);
        hasHandledActionRef.current = false;
        callbacksRef.current.onStart();
      },
      onPanResponderMove: (e, gestureState) => {
        if (isLockedRef.current || hasHandledActionRef.current) return;

        // Allow dragging left and up
        let dx = gestureState.dx;
        let dy = gestureState.dy;

        if (dx > 0) dx = 0; // Don't allow drag right
        if (dy > 0) dy = 0; // Don't allow drag down

        pan.setValue({ x: dx, y: dy });

        // Fade out as it drags left
        if (dx < 0) {
          const fade = Math.max(0, 1 + dx / 100);
          opacity.setValue(fade);
        }

        // Lock if swiped up enough
        if (dy < -40) {
          hasHandledActionRef.current = true;
          setIsLocked(true);
          resetPan();
        } else if (dx < -60) {
          // Cancel if swiped left enough
          hasHandledActionRef.current = true;
          callbacksRef.current.onCancel();
          resetPan();
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        if (isLockedRef.current || hasHandledActionRef.current) return; // Keep UI open if locked

        // If not cancelled during drag
        hasHandledActionRef.current = true;
        callbacksRef.current.onStop().then((data) => {
          if (data) callbacksRef.current.onSend(data);
        });
        resetPan();
      },
      onPanResponderTerminate: () => {
        if (!isLockedRef.current && !hasHandledActionRef.current) {
          hasHandledActionRef.current = true;
          callbacksRef.current.onCancel();
          resetPan();
        }
      },
    })
  ).current;

  const handleSend = () => {
    if (isRecording) {
      onStop().then((data) => {
        if (data) onSend(data);
        setIsLocked(false);
      });
    } else {
      onSend();
      setIsLocked(false);
    }
  };

  const handleCancel = () => {
    onCancel();
    setIsLocked(false);
    resetPan();
  };

  const isRecordingActive = isRecording || isPaused || recordingDuration > 0;

  return (
    <View
      {...panResponder.panHandlers}
      style={
        isRecordingActive
          ? [styles.overlay, { backgroundColor: colors.inputBackground, borderColor: colors.border }]
          : { marginBottom: verticalScale(4) }
      }
    >
      {!isRecordingActive ? (
        <View style={styles.iconButton}>
          <Mic size={20} color={colors.textSecondary} />
        </View>
      ) : isLocked ? (
        // Locked State UI
        <>
          <TouchableOpacity style={styles.iconButton} onPress={handleCancel}>
            <Trash2 size={22} color={colors.error} />
          </TouchableOpacity>

          <View style={styles.centerSection}>
            <Animated.View style={[styles.redDot, { opacity: pulseAnim }]} />
            <Text style={[styles.duration, { color: colors.textPrimary }]}>
              {formatDuration(uiDuration)}
            </Text>
          </View>

          <View style={styles.controls}>
            {isPaused ? (
              <TouchableOpacity style={styles.iconButton} onPress={onResume}>
                <Play size={22} color={colors.error} fill={colors.error} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.iconButton} onPress={onPause}>
                <Pause size={22} color={colors.error} fill={colors.error} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.sendButton, { backgroundColor: colors.primary }]} onPress={handleSend}>
              <Send size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        // Dragging State UI
        <Animated.View style={[styles.slidingContainer, { opacity }]}>
          <View style={styles.centerSection}>
            <Animated.View style={[styles.redDot, { opacity: pulseAnim }]} />
            <Text style={[styles.duration, { color: colors.textPrimary }]}>
              {formatDuration(uiDuration)}
            </Text>
          </View>

          <View style={styles.slideHint}>
            <ChevronLeft size={16} color={colors.textTertiary} />
            <Text style={[styles.hintText, { color: colors.textTertiary }]}>Slide to cancel</Text>
          </View>

          <Animated.View style={[styles.micWrapper, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]}>
            {/* Slide up hint */}
            <View style={styles.lockHint}>
              <ChevronUp size={16} color={colors.textTertiary} />
            </View>
            <View style={[styles.recordingMic, { backgroundColor: colors.primary }]}>
              <Mic size={24} color="#FFF" />
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    borderRadius: moderateScale(24),
    borderWidth: 1,
    zIndex: 10,
  },
  iconButton: {
    padding: scale(6),
  },
  centerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  sendButton: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  slidingContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slideHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: scale(40),
  },
  hintText: {
    fontSize: moderateScale(14),
    marginLeft: scale(4),
  },
  micWrapper: {
    position: 'absolute',
    right: 0,
    bottom: -verticalScale(10), // Adjust based on parent padding to make it overlap nicely
    alignItems: 'center',
  },
  lockHint: {
    marginBottom: verticalScale(4),
  },
  recordingMic: {
    width: scale(50),
    height: scale(50),
    borderRadius: scale(25),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  }
});

export default AudioRecorderUI;
