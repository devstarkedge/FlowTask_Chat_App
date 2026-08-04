import { useState, useRef, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
import logger from '../utils/logger';

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingUri, setRecordingUri] = useState(null);
  const [hasPermission, setHasPermission] = useState(null);
  
  const recordingRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        setHasPermission(status === 'granted');
      } catch (err) {
        logger.error('Failed to get audio permissions', err);
      }
    })();
  }, []);

  const startRecording = useCallback(async () => {
    if (!hasPermission) {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;
      setHasPermission(true);
    }
    
    try {
      if (recordingRef.current) {
        await cancelRecording();
      }

      // Synchronously set UI state to prevent latency on tap
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);
      setRecordingUri(null);

      // Production-grade audio mode configuration
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      const customOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: false,
      };

      // Omit status callback to eliminate JS thread choking (MessageComposer re-renders)
      const { recording } = await Audio.Recording.createAsync(customOptions);

      recordingRef.current = recording;
    } catch (err) {
      logger.error('Failed to start recording', err);
      setIsRecording(false); // Revert state if hardware fails
    }
  }, [hasPermission]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return null;
    const recording = recordingRef.current;
    recordingRef.current = null; // nullify synchronously to prevent duplicate calls
    try {
      const status = await recording.getStatusAsync();
      const finalDuration = Math.ceil((status.durationMillis || 0) / 1000);
      
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recording.getURI();
      setRecordingUri(uri);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingDuration(finalDuration); // Update state for UI just in case
      return { uri, duration: finalDuration };
    } catch (err) {
      logger.error('Failed to stop recording', err);
      return null;
    }
  }, []);

  const pauseRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.pauseAsync();
      setIsPaused(true);
    } catch (err) {
      logger.error('Failed to pause recording', err);
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.startAsync();
      setIsPaused(false);
    } catch (err) {
      logger.error('Failed to resume recording', err);
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    if (!recordingRef.current) {
      setIsRecording(false);
      setIsPaused(false);
      setRecordingDuration(0);
      setRecordingUri(null);
      return;
    }
    const recording = recordingRef.current;
    recordingRef.current = null; // nullify synchronously
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch (err) {
      logger.error('Failed to cancel recording', err);
    } finally {
      setIsRecording(false);
      setIsPaused(false);
      setRecordingDuration(0);
      setRecordingUri(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync();
      }
    };
  }, []);

  return {
    isRecording,
    isPaused,
    recordingDuration,
    recordingUri,
    hasPermission,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
  };
};
