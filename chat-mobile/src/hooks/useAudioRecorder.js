import { useState, useRef, useEffect, useCallback } from 'react';
import { Audio } from 'expo-av';
import logger from '../utils/logger';

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingUri, setRecordingUri] = useState(null);
  const [metering, setMetering] = useState(-160);
  const [hasPermission, setHasPermission] = useState(null);
  
  const recordingRef = useRef(null);
  const timerRef = useRef(null);

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

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = setInterval(async () => {
      if (recordingRef.current) {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          setRecordingDuration(Math.floor(status.durationMillis / 1000));
          setMetering(status.metering || -160);
        }
      }
    }, 200); // Poll every 200ms
  };

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

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const customOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      };

      const { recording } = await Audio.Recording.createAsync(
        customOptions,
        (status) => {
          if (status.isRecording) {
            setRecordingDuration(Math.floor(status.durationMillis / 1000));
            setMetering(status.metering || -160);
          }
        },
        100 // metering interval
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);
      setRecordingUri(null);
      startTimer();
    } catch (err) {
      logger.error('Failed to start recording', err);
    }
  }, [hasPermission]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return null;
    try {
      clearTimer();
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recordingRef.current.getURI();
      setRecordingUri(uri);
      setIsRecording(false);
      setIsPaused(false);
      const finalDuration = recordingDuration;
      recordingRef.current = null;
      return { uri, duration: finalDuration };
    } catch (err) {
      logger.error('Failed to stop recording', err);
      return null;
    }
  }, [recordingDuration]);

  const pauseRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.pauseAsync();
      setIsPaused(true);
      clearTimer();
    } catch (err) {
      logger.error('Failed to pause recording', err);
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.startAsync();
      setIsPaused(false);
      startTimer();
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
    try {
      clearTimer();
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      recordingRef.current = null;
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
      clearTimer();
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
    metering,
    hasPermission,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
  };
};
