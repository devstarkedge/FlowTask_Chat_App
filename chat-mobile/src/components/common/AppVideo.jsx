import React, { useRef, useEffect } from 'react';
import { Platform, View, StyleSheet } from 'react-native';

let VideoView, useVideoPlayer;
if (Platform.OS !== 'web') {
  try {
    const expoVideo = require('expo-video');
    VideoView = expoVideo.VideoView;
    useVideoPlayer = expoVideo.useVideoPlayer;
  } catch (e) {
    console.warn('Failed to load expo-video:', e);
  }
}

const NativeVideo = ({
  sourceUri,
  posterUri,
  style,
  resizeMode = 'cover',
  shouldPlay = false,
  isMuted = true,
  isLooping = false,
  useNativeControls = false,
  onStatusChange,
  videoRef,
}) => {
  const player = useVideoPlayer ? useVideoPlayer(sourceUri || null, (playerInstance) => {
    try {
      playerInstance.loop = isLooping;
      playerInstance.muted = isMuted;
      if (shouldPlay) {
        playerInstance.play();
      } else {
        playerInstance.pause();
      }
    } catch (e) {}
  }) : null;

  useEffect(() => {
    if (!player) return;
    try {
      player.loop = isLooping;
      player.muted = isMuted;
      if (shouldPlay) {
        player.play();
      } else {
        player.pause();
      }
    } catch (e) {}
  }, [player, shouldPlay, isMuted, isLooping, sourceUri]);

  useEffect(() => {
    if (!player || !onStatusChange) return;
    const sub = player.addListener('statusChange', (status) => {
      onStatusChange({
        isPlaying: player.isPlaying,
        positionMillis: (player.currentTime || 0) * 1000,
        durationMillis: (player.duration || 0) * 1000,
        isLoaded: status === 'readyToPlay',
      });
    });
    return () => sub?.remove?.();
  }, [player, onStatusChange]);

  // Expose control methods via videoRef if provided
  useEffect(() => {
    if (videoRef && player) {
      videoRef.current = {
        pauseAsync: async () => player.pause(),
        playAsync: async () => player.play(),
        setIsMutedAsync: async (muted) => { player.muted = muted; },
        unloadAsync: async () => player.pause(),
      };
    }
  }, [videoRef, player]);

  if (!VideoView || !player) {
    return <View style={style} />;
  }

  const contentFit = resizeMode === 'contain' ? 'contain' : resizeMode === 'cover' ? 'cover' : 'contain';

  return (
    <VideoView
      style={style}
      player={player}
      nativeControls={useNativeControls}
      allowsFullscreen
      allowsPictureInPicture
      contentFit={contentFit}
    />
  );
};

const WebVideo = ({
  sourceUri,
  posterUri,
  style,
  resizeMode = 'cover',
  shouldPlay = false,
  isMuted = true,
  isLooping = false,
  useNativeControls = false,
  onStatusChange,
  videoRef,
}) => {
  const localRef = useRef(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    if (shouldPlay) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [shouldPlay]);

  useEffect(() => {
    if (videoRef) {
      videoRef.current = {
        pauseAsync: async () => localRef.current?.pause(),
        playAsync: async () => localRef.current?.play(),
        setIsMutedAsync: async (muted) => {
          if (localRef.current) localRef.current.muted = muted;
        },
        unloadAsync: async () => localRef.current?.pause(),
      };
    }
  }, [videoRef]);

  const objectFit = resizeMode === 'contain' ? 'contain' : resizeMode === 'cover' ? 'cover' : 'contain';

  return (
    <video
      ref={localRef}
      src={sourceUri}
      poster={posterUri}
      controls={useNativeControls}
      muted={isMuted}
      loop={isLooping}
      autoPlay={shouldPlay}
      playsInline
      onTimeUpdate={() => {
        if (onStatusChange && localRef.current) {
          onStatusChange({
            isPlaying: !localRef.current.paused,
            positionMillis: (localRef.current.currentTime || 0) * 1000,
            durationMillis: (localRef.current.duration || 0) * 1000,
            isLoaded: true,
          });
        }
      }}
      style={{
        width: '100%',
        height: '100%',
        objectFit,
        backgroundColor: '#000',
        ...StyleSheet.flatten(style),
      }}
    />
  );
};

const AppVideo = (props) => {
  if (Platform.OS === 'web') {
    return <WebVideo {...props} />;
  }
  return <NativeVideo {...props} />;
};

export default AppVideo;
