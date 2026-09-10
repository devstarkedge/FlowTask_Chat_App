import { useState, useRef, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import logger from '../utils/logger';

let expoAudio;
if (Platform.OS !== 'web') {
  try {
    expoAudio = require('expo-audio');
  } catch (e) {
    logger.warn('Failed to load expo-audio module', e);
  }
}

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingUri, setRecordingUri] = useState(null);
  const [hasPermission, setHasPermission] = useState(null);
  
  const recordingRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  const requestPermissions = useCallback(async () => {
    if (Platform.OS === 'web') {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
          setHasPermission(true);
          return true;
        }
        setHasPermission(false);
        return false;
      } catch (err) {
        logger.error('Failed to get web audio permission', err);
        setHasPermission(false);
        return false;
      }
    } else if (expoAudio?.requestRecordingPermissionsAsync) {
      try {
        const { status } = await expoAudio.requestRecordingPermissionsAsync();
        const granted = status === 'granted';
        setHasPermission(granted);
        return granted;
      } catch (err) {
        logger.error('Failed to get audio permissions', err);
        setHasPermission(false);
        return false;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    requestPermissions();
  }, [requestPermissions]);

  const startRecording = useCallback(async () => {
    const granted = hasPermission ?? (await requestPermissions());
    if (!granted) return;

    try {
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);
      setRecordingUri(null);
      startTimeRef.current = Date.now();

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      if (Platform.OS === 'web') {
        audioChunksRef.current = [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new window.MediaRecorder(stream);
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        mediaRecorder.start();
        mediaRecorderRef.current = { mediaRecorder, stream };
      } else if (expoAudio) {
        if (expoAudio.setAudioModeAsync) {
          await expoAudio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        }
        if (expoAudio.createAudioRecorder) {
          const recorder = expoAudio.createAudioRecorder();
          recorder.record();
          recordingRef.current = recorder;
        }
      }
    } catch (err) {
      logger.error('Failed to start recording', err);
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [hasPermission, requestPermissions]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const finalDuration = recordingDuration || (startTimeRef.current ? Math.ceil((Date.now() - startTimeRef.current) / 1000) : 0);

    if (Platform.OS === 'web') {
      if (!mediaRecorderRef.current) return null;
      const { mediaRecorder, stream } = mediaRecorderRef.current;
      mediaRecorderRef.current = null;

      return new Promise((resolve) => {
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const uri = URL.createObjectURL(audioBlob);
          setRecordingUri(uri);
          setIsRecording(false);
          setIsPaused(false);
          resolve({ uri, duration: finalDuration });
        };
        mediaRecorder.stop();
      });
    } else {
      if (!recordingRef.current) return null;
      const recorder = recordingRef.current;
      recordingRef.current = null;
      try {
        if (recorder.stop) await recorder.stop();
        if (expoAudio?.setAudioModeAsync) {
          await expoAudio.setAudioModeAsync({ allowsRecording: false });
        }
        const uri = recorder.uri;
        setRecordingUri(uri);
        setIsRecording(false);
        setIsPaused(false);
        return { uri, duration: finalDuration };
      } catch (err) {
        logger.error('Failed to stop recording', err);
        setIsRecording(false);
        return null;
      }
    }
  }, [recordingDuration]);

  const cancelRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (Platform.OS === 'web') {
      if (mediaRecorderRef.current) {
        const { mediaRecorder, stream } = mediaRecorderRef.current;
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorder.stop();
        mediaRecorderRef.current = null;
      }
    } else if (recordingRef.current) {
      try {
        if (recordingRef.current.stop) await recordingRef.current.stop();
      } catch (e) {}
      recordingRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    setRecordingDuration(0);
    setRecordingUri(null);
  }, []);

  return {
    isRecording,
    isPaused,
    recordingDuration,
    recordingUri,
    hasPermission,
    startRecording,
    stopRecording,
    pauseRecording: () => {},
    resumeRecording: () => {},
    cancelRecording,
  };
};
