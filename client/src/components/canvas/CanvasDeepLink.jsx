import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCanvasStore } from "../../stores/canvasStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { canvasAPI } from "../../services/api";

/**
 * CanvasDeepLink — handles /canvas/:canvasId URLs.
 *
 * On mount, fetches the canvas by ID to discover its workspace and channel,
 * then navigates to the workspace layout WITH the exact canvas pre-selected.
 * Does NOT render any previously open canvas, default canvas, or first canvas.
 * Only the requested canvas ID is loaded and activated.
 */
export default function CanvasDeepLink() {
  const { canvasId } = useParams();
  const navigate = useNavigate();
  const loadCanvas = useCanvasStore((s) => s.loadCanvas);
  const setActiveCanvasId = useCanvasStore((s) => s.setActiveCanvasId);
  const clearActiveCanvas = useCanvasStore((s) => s.clearActiveCanvas);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canvasId) return;

    let cancelled = false;
    let canvasData = null;

    (async () => {
      try {
        setLoading(true);

        // Step 1: Clear any previous canvas state to avoid rendering wrong canvas
        clearActiveCanvas();

        // Step 2: Load the EXACT canvas by ID (not default, not first, not active)
        const res = await canvasAPI.getById(canvasId);
        if (!res.data?.success || !res.data?.data?.canvas) {
          if (!cancelled) {
            setError("Canvas not found or you don't have access.");
            setLoading(false);
          }
          return;
        }

        canvasData = res.data.data.canvas;
        const channelId = canvasData.channelId;
        const workspaceId = canvasData.workspaceId;

        if (!channelId || !workspaceId) {
          if (!cancelled) {
            setError("Unable to determine canvas workspace.");
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;

        // Step 3: Load the canvas into the store (this populates activeCanvas)
        await loadCanvas(canvasId);

        if (cancelled) return;

        // Verify the correct canvas was loaded
        const storeCanvas = useCanvasStore.getState().activeCanvas;
        if (!storeCanvas || storeCanvas._id !== canvasId) {
          if (!cancelled) {
            setError("Canvas not found or you don't have access.");
            setLoading(false);
          }
          return;
        }

        // Step 4: Set active canvas ID for the channel (persisted)
        setActiveCanvasId(channelId, canvasId);

        // Step 5: Navigate to workspace layout with the channel selected
        // The canvas is already loaded in the store, so when ChatPanel renders
        // it will see the activeCanvas and show the canvas tab
        navigate(`/workspace/${workspaceId}/channel/${channelId}`, { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || "Failed to load canvas.");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [canvasId, loadCanvas, setActiveCanvasId, clearActiveCanvas, navigate]);

  if (error) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: 16,
        background: "var(--bg-primary, #1a1a2e)",
        color: "var(--text-primary, #e0e0e0)",
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={{ margin: 0 }}>Canvas Unavailable</h2>
        <p style={{ color: "var(--text-secondary, #999)", maxWidth: 400, textAlign: "center" }}>
          {error}
        </p>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent-primary, #4e7cff)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "var(--bg-primary, #1a1a2e)",
      color: "var(--text-secondary, #999)",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "var(--accent-primary, #4e7cff)", borderTopColor: "transparent" }} />
        <span>Loading canvas…</span>
      </div>
    </div>
  );
}