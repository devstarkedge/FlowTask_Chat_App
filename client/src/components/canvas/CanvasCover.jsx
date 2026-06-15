import { useState, useRef, useCallback } from "react";
import { Image, Palette, Move, X, ChevronDown, Upload, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useCanvasStore } from "../../stores/canvasStore";
import { messageAPI } from "../../services/api";

const GRADIENT_PRESETS = [
  { label: "Ocean Blue", value: "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)" },
  { label: "Vivid Purple", value: "linear-gradient(135deg, #2d1b69 0%, #7c3aed 60%, #a855f7 100%)" },
  { label: "Sunset Orange", value: "linear-gradient(135deg, #78350f 0%, #c2410c 50%, #f97316 100%)" },
  { label: "Forest Green", value: "linear-gradient(135deg, #064e3b 0%, #065f46 50%, #059669 100%)" },
  { label: "Rose Pink", value: "linear-gradient(135deg, #881337 0%, #be185d 50%, #f43f5e 100%)" },
  { label: "Slate Storm", value: "linear-gradient(135deg, #1e293b 0%, #334155 60%, #475569 100%)" },
  { label: "Indigo Dusk", value: "linear-gradient(135deg, #1e1b4b 0%, #3730a3 50%, #6366f1 100%)" },
  { label: "Amber Glow", value: "linear-gradient(135deg, #78350f 0%, #b45309 50%, #f59e0b 100%)" },
];

const SOLID_COLORS = [
  "#0f172a", "#1e293b", "#334155", "#1d4ed8", "#7c3aed",
  "#db2777", "#dc2626", "#16a34a", "#b45309", "#0e7490",
];

export default function CanvasCover({ cover, canvasId, canvasTitle, channelId, onClose }) {
  const updateCanvasMetadata = useCanvasStore((s) => s.updateCanvasMetadata);
  const [activeTab, setActiveTab] = useState("gradient"); // gradient | color | image | upload
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(null);
  const [yOffset, setYOffset] = useState(cover?.yOffset ?? 50);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const coverRef = useRef(null);
  const fileInputRef = useRef(null);

  const coverStyle = cover
    ? cover.type === "gradient"
      ? { background: cover.value }
      : cover.type === "color"
      ? { background: cover.value }
      : { backgroundImage: `url(${cover.value})`, backgroundSize: "cover", backgroundPosition: `center ${yOffset}%` }
    : { background: "linear-gradient(135deg, #1e293b 0%, #334155 60%, #475569 100%)" };

  const applyPreset = useCallback(async (type, value) => {
    if (!canvasId) return;
    await updateCanvasMetadata(canvasId, { cover: { type, value, yOffset } });
  }, [canvasId, updateCanvasMetadata, yOffset]);

  const applyImageUrl = useCallback(async () => {
    if (!canvasId || !customImageUrl.trim()) return;
    await updateCanvasMetadata(canvasId, {
      cover: { type: "image", value: customImageUrl.trim(), yOffset },
    });
  }, [canvasId, customImageUrl, updateCanvasMetadata, yOffset]);

  const removeCover = useCallback(async () => {
    if (!canvasId) return;
    await updateCanvasMetadata(canvasId, { cover: null });
    onClose?.();
  }, [canvasId, updateCanvasMetadata, onClose]);

  // Prevent duplicate uploads
  const isUploadingRef = useRef(false);

  // Track the last uploaded file URL to prevent duplicate uploads
  const lastUploadedUrlRef = useRef(null);

  // File upload handler
  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !canvasId) return;

    // Prevent duplicate upload of the same file
    if (isUploadingRef.current) {
      toast.error("Upload already in progress. Please wait.");
      return;
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please select a JPG, PNG, or WEBP image.");
      return;
    }

    // Show local preview immediately
    const previewUrl = URL.createObjectURL(file);
    setUploadPreview(previewUrl);
    setIsUploading(true);
    isUploadingRef.current = true;

    try {
      const formData = new FormData();
      formData.append("files", file);

      const res = await messageAPI.uploadFiles(channelId, formData);
      if (res.data && res.data.success) {
        const uploadedUrl = res.data.data?.urls?.[0] || res.data.data?.files?.[0]?.url;
        if (uploadedUrl) {
          await updateCanvasMetadata(canvasId, {
            cover: { type: "image", value: uploadedUrl, yOffset },
          });
          toast.success("Cover image uploaded!");
        } else {
          toast.error("Upload succeeded but no URL returned.");
        }
      } else {
        toast.error("Failed to upload cover image.");
      }
    } catch (err) {
      console.error("[CanvasCover] Upload error:", err);
      toast.error("Failed to upload cover image.");
    } finally {
      setIsUploading(false);
      setUploadPreview(null);
      isUploadingRef.current = false;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [canvasId, channelId, updateCanvasMetadata, yOffset]);

  // Drag-to-reposition cover image
  const handleMouseDown = (e) => {
    if (cover?.type !== "image") return;
    setIsDragging(true);
    setDragStartY(e.clientY);
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !coverRef.current) return;
    const dy = e.clientY - dragStartY;
    const containerH = coverRef.current.offsetHeight;
    const delta = (dy / containerH) * 100;
    setYOffset((prev) => Math.max(0, Math.min(100, prev - delta)));
    setDragStartY(e.clientY);
  }, [isDragging, dragStartY]);

  const handleMouseUp = useCallback(async () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (cover?.type === "image" && canvasId) {
      await updateCanvasMetadata(canvasId, {
        cover: { type: "image", value: cover.value, yOffset },
      });
    }
  }, [isDragging, cover, canvasId, yOffset, updateCanvasMetadata]);

  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>
      {/* ── Cover Preview ── */}
      <div
        ref={coverRef}
        style={{
          ...coverStyle,
          height: 160,
          position: "relative",
          cursor: cover?.type === "image" ? (isDragging ? "grabbing" : "grab") : "default",
          overflow: "hidden",
          userSelect: "none",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Gradient overlay for text legibility */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%)",
        }} />

        {/* Canvas Title */}
        <div style={{
          position: "absolute", bottom: 16, left: 20,
          color: "#fff", fontSize: 20, fontWeight: 700,
          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
          maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {canvasTitle || "Untitled Canvas"}
        </div>

        {/* Drag hint for images */}
        {cover?.type === "image" && (
          <div style={{
            position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.5)", color: "#fff",
            fontSize: 11, padding: "3px 10px", borderRadius: 20,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <Move size={10} /> Drag to reposition
          </div>
        )}

        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 8, right: 8,
              background: "rgba(0,0,0,0.45)", border: "none",
              color: "#fff", borderRadius: "50%", width: 26, height: 26,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Picker Panel ── */}
      <div style={{
        background: "var(--bg-modal)", border: "1px solid var(--border-primary)",
        borderRadius: "0 0 12px 12px", padding: "12px 14px",
      }}>
        {/* Tab strip */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {[
            { id: "gradient", label: "Gradients", icon: Palette },
            { id: "color", label: "Colors", icon: Palette },
            { id: "image", label: "Image URL", icon: Image },
            { id: "upload", label: "Upload", icon: Upload },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                padding: "5px 10px", borderRadius: "var(--radius-sm)",
                border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                background: activeTab === id ? "var(--accent-primary)" : "var(--bg-secondary)",
                color: activeTab === id ? "#fff" : "var(--text-secondary)",
                transition: "all 150ms",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Gradient presets */}
        {activeTab === "gradient" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {GRADIENT_PRESETS.map((g) => (
              <button
                key={g.label}
                title={g.label}
                onClick={() => applyPreset("gradient", g.value)}
                style={{
                  height: 36, borderRadius: "var(--radius-md)",
                  background: g.value, border: "2px solid transparent",
                  cursor: "pointer", transition: "border-color 150ms, transform 150ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent-primary)";
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              />
            ))}
          </div>
        )}

        {/* Solid colors */}
        {activeTab === "color" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SOLID_COLORS.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => applyPreset("color", c)}
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: c, border: "2px solid transparent",
                  cursor: "pointer", transition: "border-color 150ms, transform 150ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent-primary)";
                  e.currentTarget.style.transform = "scale(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              />
            ))}
          </div>
        )}

        {/* Image URL */}
        {activeTab === "image" && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="Paste an image URL\u2026"
              value={customImageUrl}
              onChange={(e) => setCustomImageUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyImageUrl()}
              style={{
                flex: 1, padding: "7px 10px", fontSize: 12,
                borderRadius: "var(--radius-md)", border: "1px solid var(--border-primary)",
                background: "var(--bg-secondary)", color: "var(--text-primary)",
                outline: "none", fontFamily: "var(--font-sans)",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent-primary)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border-primary)")}
            />
            <button
              onClick={applyImageUrl}
              style={{
                padding: "7px 14px", borderRadius: "var(--radius-md)",
                border: "none", background: "var(--accent-primary)",
                color: "#fff", fontSize: 12, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Apply
            </button>
          </div>
        )}
        
        {/* Upload from Computer */}
        {activeTab === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".jpg,.jpeg,.png,.webp"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            {isUploading && uploadPreview && (
              <div style={{
                width: "100%", height: 80, borderRadius: "var(--radius-md)",
                backgroundImage: `url(${uploadPreview})`, backgroundSize: "cover",
                backgroundPosition: "center", position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 12, fontWeight: 600, gap: 6,
                }}>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  Uploading...
                </div>
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 20px", borderRadius: "var(--radius-md)",
                border: "1px dashed var(--border-primary)",
                background: "var(--bg-secondary)", color: "var(--text-primary)",
                fontSize: 13, fontWeight: 600, cursor: isUploading ? "not-allowed" : "pointer",
                transition: "all 150ms", width: "100%", justifyContent: "center",
                opacity: isUploading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isUploading) e.currentTarget.style.borderColor = "var(--accent-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-primary)";
              }}
            >
              <Upload size={16} />
              {isUploading ? "Uploading..." : "Upload from Computer"}
            </button>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>JPG, PNG, or WEBP</span>
          </div>
        )}

        {/* Remove cover */}
        {cover && (
          <button
            onClick={removeCover}
            style={{
              marginTop: 10, width: "100%", padding: "6px",
              background: "transparent", border: "1px solid var(--border-primary)",
              borderRadius: "var(--radius-md)", color: "var(--text-muted)",
              fontSize: 11, cursor: "pointer", transition: "all 150ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-red)";
              e.currentTarget.style.color = "var(--accent-red)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-primary)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            Remove Cover
          </button>
        )}
      </div>
    </div>
  );
}
