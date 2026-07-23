import React, { useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, SafeAreaView } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Play, X, Loader2 } from 'lucide-react-native';
import { scale, moderateScale } from '../utils/responsive';
import { normalizeMediaUrl } from '../utils/mediaUtils';
import logger from '../utils/logger';

const VideoMessagePlayer = ({ videoUrl, thumbnailUrl, colors, width, height }) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  const normalizedVideoUrl = normalizeMediaUrl(videoUrl);
  const normalizedThumbUrl = normalizeMediaUrl(thumbnailUrl);

  // Calculate aspect ratio
  const aspectRatio = width && height ? width / height : 16 / 9;
  const displayWidth = scale(220);
  const displayHeight = displayWidth / aspectRatio;

  return (
    <>
      <TouchableOpacity 
        style={[styles.container, { width: displayWidth, height: displayHeight, backgroundColor: '#1a1a1a' }]} 
        activeOpacity={0.9}
        onPress={() => setIsFullScreen(true)}
        disabled={normalizedVideoUrl === '/placeholder-loading' || !normalizedVideoUrl}
      >
        {normalizedVideoUrl === '/placeholder-loading' || !normalizedVideoUrl ? (
          <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
             <Loader2 size={24} color="#FFF" />
          </View>
        ) : (
          <Video
            source={{ uri: normalizedVideoUrl }}
            posterSource={normalizedThumbUrl ? { uri: normalizedThumbUrl } : undefined}
            style={StyleSheet.absoluteFillObject}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            isMuted={true}
          />
        )}
        <View style={styles.overlay}>
          {normalizedVideoUrl === '/placeholder-loading' || !normalizedVideoUrl ? (
            <View style={[styles.playButtonContainer, { backgroundColor: 'transparent' }]} />
          ) : (
            <View style={[styles.playButtonContainer, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
              <Play size={24} color="#FFF" fill="#FFF" style={{ marginLeft: 2 }} />
            </View>
          )}
        </View>
      </TouchableOpacity>

      <Modal visible={isFullScreen} transparent={false} animationType="fade">
        <SafeAreaView style={styles.fullScreenContainer}>
          <Video
            ref={videoRef}
            source={{ uri: normalizedVideoUrl }}
            style={styles.fullScreenVideo}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={isFullScreen}
            onPlaybackStatusUpdate={(status) => {
              if (status.error) {
                logger.error('Video Error:', status.error);
              }
            }}
          />
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={() => {
              if (videoRef.current) {
                videoRef.current.pauseAsync();
              }
              setIsFullScreen(false);
            }}
          >
            <X size={28} color="#FFF" />
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: moderateScale(12),
    overflow: 'hidden',
    position: 'relative',
    marginTop: 4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  playButtonContainer: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullScreenVideo: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default VideoMessagePlayer;
