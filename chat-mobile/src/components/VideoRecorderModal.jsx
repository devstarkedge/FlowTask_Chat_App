import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, SafeAreaView } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { Video } from 'expo-av';
import { X, FlipHorizontal, Zap, ZapOff, Circle, Square, Send, RotateCcw } from 'lucide-react-native';
import { scale, verticalScale, moderateScale } from '../utils/responsive';

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const VideoRecorderModal = ({
  visible,
  onClose,
  onSend,
  cameraRef,
  isRecording,
  recordingDuration,
  videoUri,
  cameraType,
  flashMode,
  startRecording,
  stopRecording,
  toggleCamera,
  toggleFlash,
  onRetake,
  colors,
}) => {
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        {!videoUri ? (
          <View style={styles.cameraContainer}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing={cameraType}
              enableTorch={flashMode === 'on'}
              mode="video"
            />
            {/* Top Controls */}
            <View style={styles.topControls}>
              <TouchableOpacity onPress={onClose} style={styles.iconButton}>
                <X size={28} color="#FFF" />
              </TouchableOpacity>
              {isRecording && (
                <View style={styles.recordingIndicator}>
                  <View style={styles.redDot} />
                  <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
                </View>
              )}
              <View style={styles.rightControls}>
                <TouchableOpacity onPress={toggleFlash} style={styles.iconButton}>
                  {flashMode === 'on' || flashMode === 'auto' ? (
                    <Zap size={24} color="#FFF" />
                  ) : (
                    <ZapOff size={24} color="#FFF" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleCamera} style={[styles.iconButton, { marginTop: 16 }]}>
                  <FlipHorizontal size={24} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Bottom Controls */}
            <View style={styles.bottomControls}>
              <TouchableOpacity
                onPress={isRecording ? stopRecording : startRecording}
                style={styles.recordButtonContainer}
              >
                {isRecording ? (
                  <View style={styles.stopIcon} />
                ) : (
                  <View style={styles.recordIcon} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.previewContainer}>
            <Video
              source={{ uri: videoUri }}
              style={styles.previewVideo}
              useNativeControls
              resizeMode="contain"
              shouldPlay
              isLooping
            />
            <View style={styles.previewBottomControls}>
              <TouchableOpacity onPress={onRetake} style={styles.retakeButton}>
                <RotateCcw size={20} color="#FFF" />
                <Text style={styles.buttonText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onSend(videoUri)} style={styles.sendButton}>
                <Text style={styles.buttonText}>Send</Text>
                <Send size={20} color="#FFF" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  topControls: {
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightControls: {
    alignItems: 'center',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    height: 32,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 8,
  },
  durationText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recordButtonContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EF4444',
  },
  stopIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EF4444',
  },
  previewContainer: {
    flex: 1,
  },
  previewVideo: {
    flex: 1,
  },
  previewBottomControls: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6', // primary color fallback
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default VideoRecorderModal;
