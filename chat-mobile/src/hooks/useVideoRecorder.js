import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform, AppState } from 'react-native';
import { Camera } from 'expo-camera';
import logger from '../utils/logger';
import { ensureCapturePermission, showCapturePermissionDenied } from '../utils/capturePermissions';

export const useVideoRecorder = (contextId) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [videoUri, setVideoUri] = useState(null);
  const [hasPermissions, setHasPermissions] = useState(null);
  const [cameraType, setCameraType] = useState('back');
  const [flashMode, setFlashMode] = useState('off');

  const cameraRef = useRef(null);
  const timerRef = useRef(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const preparing = useRef(false);

  const preparePermissions = useCallback(async () => {
    if (preparing.current) return false;
    preparing.current = true;
    const attempt = generation.current;
      try {
        let granted = false;
        if (Platform.OS === 'web') {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            stream.getTracks().forEach((track) => track.stop());
            granted = true;
          }
        } else {
          granted = await ensureCapturePermission(Camera.getCameraPermissionsAsync, Camera.requestCameraPermissionsAsync, 'Camera');
          if (granted && mounted.current && generation.current === attempt) granted = await ensureCapturePermission(Camera.getMicrophonePermissionsAsync, Camera.requestMicrophonePermissionsAsync, 'Microphone');
        }
        if (!mounted.current || generation.current !== attempt) return false;
        setHasPermissions(granted);
        return granted;
      } catch (err) {
        logger.error('Failed to get video/mic permissions', err);
        if (mounted.current && generation.current === attempt) { setHasPermissions(false); showCapturePermissionDenied('Camera', false); }
        return false;
      } finally {
        preparing.current = false;
      }
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || !hasPermissions || isRecording) return;
    const attempt = generation.current;
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
      if (mounted.current && generation.current === attempt) { setVideoUri(data?.uri || null); setIsRecording(false); }
    } catch (err) {
      logger.error('Failed to start video recording', err);
      if (mounted.current && generation.current === attempt) setIsRecording(false);
      clearTimer();
    }
  }, [hasPermissions, isRecording]);

  const stopRecording = useCallback(() => {
    if (!cameraRef.current || !isRecording) return;
    try {
      cameraRef.current.stopRecording();
    } catch (e) {}
    clearTimer();
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    generation.current++;
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
    mounted.current = true;
    setIsRecording(false); setVideoUri(null); setHasPermissions(null);
    const cleanup = () => { generation.current++; clearTimer(); try { cameraRef.current?.stopRecording(); } catch {} };
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active' && cameraRef.current) { cleanup(); setIsRecording(false); setVideoUri(null); setHasPermissions(false); } });
    return () => { mounted.current = false; subscription.remove(); cleanup(); };
  }, [contextId]);

  return {
    cameraRef,
    isRecording,
    recordingDuration,
    videoUri,
    hasPermissions,
    preparePermissions,
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
