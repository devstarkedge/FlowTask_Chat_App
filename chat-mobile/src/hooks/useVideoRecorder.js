import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { Camera } from 'expo-camera';
import logger from '../utils/logger';

let expoAudio;
if (Platform.OS !== 'web') {
  try {
    expoAudio = require('expo-audio');
  } catch (e) {
    logger.warn('Failed to load expo-audio module', e);
  }
}

export const useVideoRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [videoUri, setVideoUri] = useState(null);
  const [hasPermissions, setHasPermissions] = useState(null);
  const [cameraType, setCameraType] = useState('back');
  const [flashMode, setFlashMode] = useState('off');

  const cameraRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web') {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            stream.getTracks().forEach((track) => track.stop());
            setHasPermissions(true);
          } else {
            setHasPermissions(false);
          }
        } else {
          const cameraStatus = await Camera.requestCameraPermissionsAsync();
          let micGranted = false;
          if (expoAudio?.requestRecordingPermissionsAsync) {
            const micStatus = await expoAudio.requestRecordingPermissionsAsync();
            micGranted = micStatus.status === 'granted';
          } else {
            micGranted = true;
          }
          setHasPermissions(cameraStatus.status === 'granted' && micGranted);
        }
      } catch (err) {
        logger.error('Failed to get video/mic permissions', err);
        setHasPermissions(false);
      }
    })();
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || !hasPermissions) return;
    try {
      setIsRecording(true);
      setRecordingDuration(0);
      setVideoUri(null);
      
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Start recording
      const videoRecordPromise = cameraRef.current.recordAsync({
        maxDuration: 60, // 60 seconds max to prevent huge files
        quality: '720p',
      });
      
      const data = await videoRecordPromise;
      clearTimer();
      setVideoUri(data.uri);
      setIsRecording(false);
    } catch (err) {
      logger.error('Failed to start video recording', err);
      setIsRecording(false);
      clearTimer();
    }
  }, [hasPermissions]);

  const stopRecording = useCallback(() => {
    if (!cameraRef.current || !isRecording) return;
    try {
      cameraRef.current.stopRecording();
    } catch (e) {}
    clearTimer();
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    if (!cameraRef.current && !isRecording) {
      setVideoUri(null);
      return;
    }
    if (isRecording && cameraRef.current) {
      try {
        cameraRef.current.stopRecording();
      } catch (e) {}
    }
    clearTimer();
    setIsRecording(false);
    setVideoUri(null);
    setRecordingDuration(0);
  }, [isRecording]);

  const toggleCamera = useCallback(() => {
    setCameraType((prev) => (prev === 'back' ? 'front' : 'back'));
  }, []);

  const toggleFlash = useCallback(() => {
    setFlashMode((prev) => {
      if (prev === 'off') return 'on';
      if (prev === 'on') return 'auto';
      return 'off';
    });
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, []);

  return {
    cameraRef,
    isRecording,
    recordingDuration,
    videoUri,
    hasPermissions,
    cameraType,
    flashMode,
    startRecording,
    stopRecording,
    cancelRecording,
    toggleCamera,
    toggleFlash,
    setVideoUri,
  };
};
