import { useState, useRef, useCallback } from "react";
import { Upload, Image as ImageIcon } from "lucide-react";
import Loader from "../../shared/Loader";
import { useCanvasStore } from "../../../stores/canvasStore";
import { useChannelStore } from "../../../stores/channelStore";
import { messageAPI } from "../../../services/api";
import toast from "react-hot-toast";

const LIBRARY_PRESETS = [
  { label: "Desk Items", value: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80" },
  { label: "Cozy Room", value: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=80" },
  { label: "Abstract Shapes", value: "https://images.unsplash.com/photo-1604871000636-074fa5117945?auto=format&fit=crop&w=600&q=80" },
  { label: "Forest Sunlight", value: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=600&q=80" },
  { label: "City Street View", value: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=600&q=80" },
  { label: "Modern Gallery", value: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80" },
  { label: "Desk Work", value: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80" },
  { label: "Retro Workspace", value: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=600&q=80" },
  { label: "Bookshelves", value: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=600&q=80" },
  { label: "Sunny Beach", value: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80" },
  { label: "Gradient Abstract", value: "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=600&q=80" },
  { label: "Minimalist Block House", value: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=600&q=80" }
];

export default function CanvasCover({
  cover,
  canvasId,
  channelId,
  onClose
}) {
  const updateCanvasMetadata = useCanvasStore((s) => s.updateCanvasMetadata);
  const [activeTab, setActiveTab] = useState("library"); // library | upload
  const [isUploading, setIsUploading] = useState(false);
  const [originalCover] = useState(cover);
  const fileInputRef = useRef(null);

  const handleCancel = async () => {
    if (canvasId) {
      await updateCanvasMetadata(canvasId, { cover: originalCover });
    }
    onClose?.();
  };

  const handleSave = () => {
    onClose?.();
  };

  const handleRemove = async () => {
    if (canvasId) {
      await updateCanvasMetadata(canvasId, { cover: null });
    }
    onClose?.();
  };

  const selectLibraryImage = async (url) => {
    if (canvasId) {
      await updateCanvasMetadata(canvasId, {
        cover: { type: "image", value: url, yOffset: 50 }
      });
    }
  };

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !canvasId) return;

    if (isUploading) {
      toast.error("Upload already in progress. Please wait.");
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please select a JPG, PNG, or WEBP image.");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("files", file);

      const channelIdToUse = channelId || useChannelStore.getState().activeChannelId || useChannelStore.getState().channels?.[0]?._id;
      if (!channelIdToUse) {
        toast.error("No active channel context found for uploading.");
        setIsUploading(false);
        return;
      }

      const res = await messageAPI.uploadFilesSync(channelIdToUse, formData);
      if (res.data && res.data.success) {
        const uploadedUrl = res.data.data?.urls?.[0] || res.data.data?.files?.[0]?.url;
        if (uploadedUrl) {
          await updateCanvasMetadata(canvasId, {
            cover: { type: "image", value: uploadedUrl, yOffset: 50 },
          });
          toast.success("Cover image uploaded!");
        } else {
          toast.error("Upload succeeded but no URL returned.");
        }
      } else {
        const serverMsg = res.data?.error?.message || "Failed to upload cover image.";
        toast.error(serverMsg);
      }
    } catch (err) {
      console.error("[CanvasCover] Upload error:", err);
      toast.error(err?.response?.data?.error?.message || "Failed to upload cover image.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [canvasId, channelId, updateCanvasMetadata, isUploading]);

  return (
    <div style={{
      fontFamily: "var(--font-sans)",
      background: "var(--bg-primary, #fff)",
      padding: "16px 20px",
      borderRadius: 12,
      border: "1px solid var(--border-primary, rgba(0,0,0,0.1))",
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
      boxSizing: "border-box",
      width: "100%",
    }}>
      {/* Tab strip */}
      <div style={{
        display: "flex",
        gap: 16,
        marginBottom: 16,
        borderBottom: "1px solid var(--border-primary, rgba(0,0,0,0.1))",
        position: "relative",
      }}>
        {[
          { id: "library", label: "Library" },
          { id: "upload", label: "Upload" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 4px 10px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "var(--text-primary, #111)" : "var(--text-muted, #777)",
                position: "relative",
                transition: "color 150ms",
              }}
            >
              {tab.label}
              {isActive && (
                <div style={{
                  position: "absolute",
                  bottom: -1,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "#0079bf", // Notion / Trello blue indicator bar
                  borderRadius: 2,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Library tab content */}
      {activeTab === "library" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          maxHeight: 280,
          overflowY: "auto",
          paddingRight: 4,
          boxSizing: "border-box",
        }}>
          {LIBRARY_PRESETS.map((preset) => {
            const isSelected = cover?.type === "image" && cover.value === preset.value;
            return (
              <button
                key={preset.value}
                onClick={() => selectLibraryImage(preset.value)}
                style={{
                  height: 80,
                  borderRadius: 8,
                  backgroundImage: `url(${preset.value})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  border: isSelected ? "3px solid #0079bf" : "1px solid var(--border-primary, rgba(0,0,0,0.1))",
                  cursor: "pointer",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "transform 120ms ease",
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.03)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              />
            );
          })}
        </div>
      )}

      {/* Upload tab content */}
      {activeTab === "upload" && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: 240,
          border: "1px dashed var(--border-primary, rgba(0,0,0,0.15))",
          borderRadius: 8,
          background: "var(--bg-secondary, #fafafa)",
          padding: 24,
          boxSizing: "border-box",
          textAlign: "center",
          position: "relative",
        }}>
          <input
            type="file"
            ref={fileInputRef}
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          {isUploading ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}>
              <Loader size="lg" />
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
                Uploading cover...
              </p>
            </div>
          ) : (
            <>
              <ImageIcon size={44} style={{ color: "var(--text-muted, #999)", marginBottom: 12 }} />
              <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: "var(--text-primary, #111)" }}>
                Upload an image
              </h3>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-muted, #777)" }}>
                Images larger than 100kb work best.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: "8px 20px",
                  borderRadius: 6,
                  border: "1px solid var(--border-primary, rgba(0,0,0,0.15))",
                  background: "var(--bg-primary, #fff)",
                  color: "var(--text-primary, #111)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 140ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--text-secondary, #555)";
                  e.currentTarget.style.background = "var(--bg-hover, #f3f4f6)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-primary, rgba(0,0,0,0.15))";
                  e.currentTarget.style.background = "var(--bg-primary, #fff)";
                }}
              >
                Upload
              </button>
            </>
          )}
        </div>
      )}

      {/* Footer bar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 20,
        paddingTop: 16,
        borderTop: "1px solid var(--border-primary, rgba(0,0,0,0.1))",
      }}>
        {cover ? (
          <button
            onClick={handleRemove}
            style={{
              background: "none",
              border: "none",
              color: "#de350b", // red remove link
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Remove cover
          </button>
        ) : (
          <div />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleCancel}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid var(--border-primary, rgba(0,0,0,0.15))",
              background: "var(--bg-primary, #fff)",
              color: "var(--text-primary, #111)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "none",
              background: "#0079bf", // matching Notion/Trello save
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
