import { useState, useRef, useEffect, useCallback } from 'react';
import { Platform, Alert, AppState } from 'react-native';
import { ensureCapturePermission, showCapturePermissionDenied } from '../utils/capturePermissions';
import logger from '../utils/logger';

let expoAudio;
if (Platform.OS !== 'web') {
  try { expoAudio = require('expo-audio'); } catch (error) { logger.warn('Audio capture unavailable', error); }
}

export const useAudioRecorder = (contextId) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingUri, setRecordingUri] = useState(null);
  const [hasPermission, setHasPermission] = useState(null);
  const session = useRef(null), timer = useRef(null), generation = useRef(0), mounted = useRef(true), busy = useRef(false), startedAt = useRef(0);
  const clearTimer = () => { clearInterval(timer.current); timer.current = null; };
  const restoreMode = async () => { if (expoAudio?.setAudioModeAsync) await expoAudio.setAudioModeAsync({ allowsRecording: false }); };
  const dispose = async (capture) => {
    if (!capture) return;
    if (capture.stream) {
      if (capture.recorder.state !== 'inactive') capture.recorder.stop();
      capture.stream.getTracks().forEach(track => track.stop());
    } else {
      try { await capture.recorder.stop(); } finally { capture.recorder.release?.(); await restoreMode(); }
    }
  };
  const cancelRecording = useCallback(async () => {
    generation.current++;
    const attempt = generation.current;
    clearTimer();
    const capture = session.current; session.current = null;
    try { await dispose(capture); } catch (error) { logger.warn('Audio cleanup failed', error); }
    if (mounted.current && generation.current === attempt) { setIsRecording(false); setIsPaused(false); setRecordingDuration(0); setRecordingUri(null); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    setIsRecording(false); setIsPaused(false); setRecordingDuration(0); setRecordingUri(null);
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active' && session.current) void cancelRecording(); });
    return () => { mounted.current = false; subscription.remove(); void cancelRecording(); };
  }, [contextId, cancelRecording]);

  const startRecording = useCallback(async () => {
    if (busy.current || session.current) return false;
    busy.current = true;
    const attempt = generation.current;
    let capture;
    try {
      if (Platform.OS === 'web') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        capture = { stream, chunks: [], recorder: null };
        try { capture.recorder = new window.MediaRecorder(stream); } catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
        capture.recorder.ondataavailable = event => { if (event.data.size) capture.chunks.push(event.data); };
      } else {
        if (!expoAudio?.AudioModule?.AudioRecorder) throw new Error('Native audio recorder unavailable');
        const granted = await ensureCapturePermission(expoAudio.getRecordingPermissionsAsync, expoAudio.requestRecordingPermissionsAsync, 'Microphone');
        if (mounted.current) setHasPermission(granted);
        if (!granted || !mounted.current || generation.current !== attempt) return false;
        await expoAudio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (!mounted.current || generation.current !== attempt) { await restoreMode(); return false; }
        const { android, ios, web, ...common } = expoAudio.RecordingPresets.HIGH_QUALITY;
        capture = { recorder: new expoAudio.AudioModule.AudioRecorder({ ...common, ...(Platform.OS === 'ios' ? ios : android) }) };
        await capture.recorder.prepareToRecordAsync();
      }
      if (!mounted.current || generation.current !== attempt) { await dispose(capture); return false; }
      session.current = capture;
      if (capture.stream) capture.recorder.start(); else capture.recorder.record();
      startedAt.current = Date.now();
      setHasPermission(true); setRecordingUri(null); setRecordingDuration(0); setIsPaused(false); setIsRecording(true);
      clearTimer(); timer.current = setInterval(() => setRecordingDuration(value => value + 1), 1000);
      return true;
    } catch (error) {
      session.current = null; clearTimer();
      try { if (capture) await dispose(capture); else await restoreMode(); } catch {}
      if (mounted.current && generation.current === attempt) {
        setIsRecording(false);
        if (error.name === 'NotAllowedError') showCapturePermissionDenied('Microphone', false);
        else Alert.alert('Recording Unavailable', 'Unable to start audio recording. Please try again.');
      }
      logger.warn('Audio recording failed', error);
      return false;
    } finally { busy.current = false; }
  }, []);
  const stopRecording = useCallback(async () => {
    const capture = session.current;
    if (!capture) return null;
    session.current = null; clearTimer();
    const attempt = generation.current, duration = Math.ceil((Date.now() - startedAt.current) / 1000);
    try {
      let uri;
      if (capture.stream) {
        await new Promise((resolve, reject) => { capture.recorder.onstop = resolve; capture.recorder.onerror = reject; capture.recorder.stop(); });
        uri = URL.createObjectURL(new Blob(capture.chunks, { type: capture.recorder.mimeType || 'audio/webm' }));
      } else { await capture.recorder.stop(); uri = capture.recorder.uri; }
      if (!mounted.current || generation.current !== attempt) { if (capture.stream && uri) URL.revokeObjectURL(uri); return null; }
      setRecordingUri(uri); setIsRecording(false); setIsPaused(false); setRecordingDuration(duration);
      return uri ? { uri, duration } : null;
    } catch (error) { logger.warn('Audio stop failed', error); if (mounted.current) setIsRecording(false); return null; }
    finally { if (capture.stream) capture.stream.getTracks().forEach(track => track.stop()); else { capture.recorder.release?.(); try { await restoreMode(); } catch {} } }
  }, []);
  const pauseRecording = () => { session.current?.recorder.pause(); setIsPaused(true); clearTimer(); };
  const resumeRecording = () => { const capture = session.current; if (!capture) return; if (capture.stream) capture.recorder.resume(); else capture.recorder.record(); setIsPaused(false); timer.current = setInterval(() => setRecordingDuration(value => value + 1), 1000); };
  return { isRecording, isPaused, recordingDuration, recordingUri, hasPermission, startRecording, stopRecording, cancelRecording, pauseRecording, resumeRecording };
};
