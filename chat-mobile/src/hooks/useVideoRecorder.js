import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';
import logger from '../utils/logger';

export const useVideoRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [videoUri, setVideoUri] = useState(null);
  const [hasPermissions, setHasPermissions] = useState(null);
  const [cameraType, setCameraType] = useState('back'); // expo-camera defaults to 'back' or 'front' depending on version, newer expo-camera uses CameraType.back/front
  const [flashMode, setFlashMode] = useState('off');

  const cameraRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const cameraStatus = await Camera.requestCameraPermissionsAsync();
        const micStatus = await Audio.requestPermissionsAsync();
        setHasPermissions(cameraStatus.status === 'granted' && micStatus.status === 'granted');
      } catch (err) {
        logger.error('Failed to get video/mic permissions', err);
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
    cameraRef.current.stopRecording();
    clearTimer();
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    if (!cameraRef.current && !isRecording) {
      setVideoUri(null);
      return;
    }
    if (isRecording) {
      cameraRef.current.stopRecording();
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
    setVideoUri, // allow clearing after sending
  };
};
