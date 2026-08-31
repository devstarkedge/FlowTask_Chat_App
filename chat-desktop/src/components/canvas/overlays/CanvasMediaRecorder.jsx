import { useState, useRef, useCallback } from "react";
import { Mic } from "lucide-react";

/**
 * CanvasMediaRecorder — self-contained component that manages video/audio
 * recording and renders the recording overlay dialog.
 *
 * @param {{ isViewOnly: boolean, onInsertMedia: (file: File, nodeType: string) => void }} props
 */
export function useCanvasMediaRecorder({ isViewOnly, onInsertMedia }) {
  const [recordingType, setRecordingType] = useState(null); // 'video' | 'audio'
  const [recordingState, setRecordingState] = useState("idle"); // 'idle' | 'recording' | 'preview'
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const videoPreviewRef = useRef(null);

  const startRecording = useCallback(
    async (type) => {
      setRecordingType(type);
      setRecordingState("recording");
      setRecordedBlob(null);
      setRecordedUrl(null);
      try {
        const constraints =
          type === "video" ? { video: true, audio: true } : { audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        // Small timeout to let ref attach
        setTimeout(() => {
          if (type === "video" && videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = stream;
            videoPreviewRef.current.play().catch(() => {});
          }
        }, 100);

        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, {
            type: type === "video" ? "video/webm" : "audio/webm",
          });
          setRecordedBlob(blob);
          setRecordedUrl(URL.createObjectURL(blob));
          setRecordingState("preview");
        };
        recorder.start();
      } catch (err) {
        console.error("Failed to start media recorder:", err);
        alert("Microphone/Camera permission denied or not support.");
        setRecordingState("idle");
        setRecordingType(null);
      }
    },
  );

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const closeMediaRecorder = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setRecordingState("idle");
    setRecordingType(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
  }, []);

  const saveRecordedClip = useCallback(() => {
    if (!recordedBlob) return;
    const file = new File(
      [recordedBlob],
      `recorded-${recordingType}-${Date.now()}.webm`,
      { type: recordingType === "video" ? "video/webm" : "audio/webm" },
    );
    onInsertMedia(
      file,
      recordingType === "video" ? "videoBlock" : "audioBlock",
    );
    closeMediaRecorder();
  }, [recordedBlob, recordingType, onInsertMedia, closeMediaRecorder]);

  return {
    recordingType,
    recordingState,
    recordedUrl,
    startRecording,
    stopRecording,
    saveRecordedClip,
    closeMediaRecorder,
    videoPreviewRef,
    RecorderOverlay: recordingType ? (
      <div className="canvas-media-recorder-overlay">
        <div className="canvas-media-recorder-card">
          <h3>
            Record{" "}
            {recordingType === "video" ? "Video Clip" : "Audio Clip"}
          </h3>

          {recordingType === "video" && (
            <div className="canvas-video-record-preview-wrapper">
              {recordingState === "recording" && (
                <video
                  ref={videoPreviewRef}
                  muted
                  playsInline
                  className="canvas-recording-video"
                />
              )}
              {recordingState === "preview" && recordedUrl && (
                <video
                  src={recordedUrl}
                  controls
                  className="canvas-recording-video"
                />
              )}
            </div>
          )}

          {recordingType === "audio" && (
            <div className="canvas-audio-record-preview-wrapper">
              {recordingState === "recording" && (
                <div className="canvas-audio-pulse">
                  <Mic size={32} />
                  <span>Recording...</span>
                </div>
              )}
              {recordingState === "preview" && recordedUrl && (
                <audio
                  src={recordedUrl}
                  controls
                  className="canvas-recording-audio"
                />
              )}
            </div>
          )}

          <div className="canvas-media-recorder-actions">
            {recordingState === "recording" && (
              <button
                className="canvas-media-btn stop-btn"
                onClick={stopRecording}
              >
                Stop Recording
              </button>
            )}
            {recordingState === "preview" && (
              <>
                <button
                  className="canvas-media-btn insert-btn"
                  onClick={saveRecordedClip}
                >
                  Insert into Canvas
                </button>
                <button
                  className="canvas-media-btn retry-btn"
                  onClick={() => startRecording(recordingType)}
                >
                  Record Again
                </button>
              </>
            )}
            <button
              className="canvas-media-btn cancel-btn"
              onClick={closeMediaRecorder}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    ) : null,
  };
}
