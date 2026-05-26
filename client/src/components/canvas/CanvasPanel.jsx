import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, FileText, Clock, Search, Plus } from "lucide-react";
import { useCanvasStore } from "../../stores/canvasStore";
import { canvasAPI } from "../../services/api";
import CanvasMenu from "./CanvasMenu";
import CanvasEditor from "./CanvasEditor";
import TemplateSelector from "./TemplateSelector";
import { buildTemplateContent, TEMPLATES } from "./templates";

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "0 24px",
        textAlign: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: "var(--radius-xl)",
          background: "var(--bg-active)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FileText size={22} style={{ color: "var(--accent-primary)" }} />
      </div>
      <div>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 6,
          }}
        >
          No canvas yet
        </h3>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            lineHeight: 1.6,
            maxWidth: 200,
          }}
        >
          Canvases let you create rich documents right inside your channel.
        </p>
      </div>
      <button
        onClick={onAdd}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 14px",
          borderRadius: "var(--radius-md)",
          border: "none",
          background: "var(--accent-primary)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          transition: "background var(--transition-fast)",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--accent-primary-hover)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "var(--accent-primary)")
        }
      >
        <Plus size={13} />
        Add a canvas
      </button>
    </div>
  );
}

// ─── Existing Canvas List ─────────────────────────────────────────────────────

function ExistingCanvasList({ canvases, onSelect, onBack }) {
  const [search, setSearch] = useState("");

  const filtered = canvases.filter((c) =>
    (c.title || "Untitled canvas").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-primary)",
          flexShrink: 0,
        }}
      >
        {/* <button
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: 18,
            transition: "all var(--transition-fast)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          ←
        </button> */}
        <div>
          <h2
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.3,
            }}
          >
            Add existing canvas
          </h2>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            Link a canvas from this workspace
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "10px 14px 6px", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 9,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder="Search canvases…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: 28,
              paddingRight: 10,
              paddingTop: 7,
              paddingBottom: 7,
              fontSize: 13,
              color: "var(--text-primary)",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              borderRadius: "var(--radius-md)",
              outline: "none",
              transition: "border-color var(--transition-fast)",
              fontFamily: "var(--font-sans)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--border-focus)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border-primary)")}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px 14px" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 0",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              No canvases found
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((c) => (
              <CanvasListItem key={c._id} canvas={c} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CanvasListItem({ canvas, onSelect }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => onSelect(canvas)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        borderRadius: "var(--radius-md)",
        border: "none",
        background: hovered ? "var(--bg-hover)" : "transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "background var(--transition-fast)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-active)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <FileText size={14} style={{ color: "var(--accent-primary)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {canvas.title || "Untitled canvas"}
        </p>
        {canvas.updatedAt && (
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginTop: 2,
            }}
          >
            <Clock size={10} />
            {new Date(canvas.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 10,
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Loader2
        size={16}
        style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }}
      />
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading canvas…</p>
    </div>
  );
}

// templates and content builders are provided by ./templates

// ─── Main Component ───────────────────────────────────────────────────────────
//
// Props:
//   channelId        – current channel
//   workspaceId      – current workspace
//   intent           – "blank" | "template" | "existing" | null
//                      Set by ChatPanel when user clicks a header-popup option.
//                      CanvasPanel consumes it once on mount/change to enter
//                      the right view immediately.
//   onIntentConsumed – callback to tell ChatPanel we've consumed the intent
//                      so it can clear it.
//
// Internal view state machine:
//   null       → try to load existing canvas; if none → show EmptyState
//   "menu"     → show CanvasMenu (inline full-screen picker)
//   "template" → show TemplateSelector
//   "existing" → show ExistingCanvasList
//   "editor"   → show CanvasEditor
//
export default function CanvasPanel({ channelId, workspaceId, intent, onIntentConsumed }) {
  void workspaceId;
  // view: null | "menu" | "template" | "existing" | "editor"
  const [view, setView] = useState(null);
  const [allCanvases, setAllCanvases] = useState([]);
  const queryClient = useQueryClient();

  const {
    activeCanvas,
    isLoading,
    createCanvas,
    loadDefaultCanvas,
    fetchChannelCanvases,
  } = useCanvasStore();

  const channelCanvasesQuery = useQuery({
    queryKey: ["canvas", "channel", channelId],
    enabled: false,
    queryFn: async () => {
      const res = await canvasAPI.getAllForChannel(channelId);
      return res.data?.data || [];
    },
  });

  // Track whether we already ran the initial channel load so we don't double-fire
  const didInitRef = useRef(false);
  // Track the last intent we processed so we don't re-process on re-renders
  const lastIntentRef = useRef(null);

  // ── On channelId change: reset and load ────────────────────────────────────
  useEffect(() => {
    if (!channelId) return;
    didInitRef.current = false;
    setView(null);
    setAllCanvases([]);

    // If there's a pending intent, handle it directly without loading first
    // (intent processing runs in the effect below)
    if (!intent) {
      loadDefaultCanvas(channelId)
        .then(() => {
          // loadDefaultCanvas sets activeCanvas in the store if a canvas exists.
          // We check the store state after the call.
          const storeCanvas = useCanvasStore.getState().activeCanvas;
          if (storeCanvas && storeCanvas.channelId === channelId) {
            setView("editor");
          } else {
            setView(null); // shows EmptyState
          }
        })
        .catch(() => setView(null));
      didInitRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // ── Consume intent from header popup ───────────────────────────────────────
  // Runs whenever `intent` changes (and is non-null).
  useEffect(() => {
    if (!intent || !channelId) return;
    if (lastIntentRef.current === intent) return; // already handled
    lastIntentRef.current = intent;

    onIntentConsumed?.(); // tell ChatPanel to clear it

    if (intent === "blank") {
      handleCreateBlank();
    } else if (intent === "template") {
      setView("template");
    } else if (intent === "existing") {
      handleLoadExisting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, channelId]);

  // Reset lastIntentRef when channelId changes so the same intent works again
  useEffect(() => {
    lastIntentRef.current = null;
  }, [channelId]);

  // ── Create blank canvas ────────────────────────────────────────────────────
  const handleCreateBlank = useCallback(async () => {
    try {
      await createCanvas(channelId, {
        title: "Untitled canvas",
        content: { type: "doc", content: [{ type: "paragraph" }] },
      });
      queryClient.invalidateQueries({ queryKey: ["canvas", "channel", channelId] });
      setView("editor");
    } catch (err) {
      console.error("[CanvasPanel] createBlank error:", err);
    }
  }, [channelId, createCanvas, queryClient]);

  // ── Load all canvases (for "existing" picker) ──────────────────────────────
  const handleLoadExisting = useCallback(async () => {
    try {
      const queryResult = await channelCanvasesQuery.refetch();
      const canvases = queryResult.data || [];
      setAllCanvases(canvases);
      useCanvasStore.setState((state) => ({
        canvasesByChannel: {
          ...state.canvasesByChannel,
          [channelId]: canvases,
        },
      }));
      setView("existing");
    } catch (err) {
      console.error("[CanvasPanel] loadExisting error:", err);
      await fetchChannelCanvases(channelId);
      setAllCanvases(useCanvasStore.getState().canvasesByChannel[channelId] || []);
      setView("existing");
    }
  }, [channelCanvasesQuery, channelId, fetchChannelCanvases]);

  // ── Menu selection (from the inline CanvasMenu, not the header popup) ──────
  const handleMenuSelect = useCallback(
    async (type) => {
      if (type === "blank") {
        await handleCreateBlank();
      } else if (type === "template") {
        setView("template");
      } else if (type === "existing") {
        await handleLoadExisting();
      }
    },
    [handleCreateBlank, handleLoadExisting],
  );

  // ── Template selection ─────────────────────────────────────────────────────
  const handleTemplateSelect = useCallback(
    async (selection) => {
        try {
              const templateId = selection?.id || selection?.templateId || null;
              // Prefer a full template object when the caller provided it
              // (ensures the editor receives the same sections used by the preview).
              const templateObj = selection?.template || (templateId ? TEMPLATES.find((t) => t.id === templateId) : null);
              const defaultLabel = templateObj ? templateObj.label : null;
              const title = selection?.title || defaultLabel || (selection?.label || "Untitled canvas");
              // Build content from the template object when available so templates
              // sourced from PROD_TEMPLATES (with `sections`) are turned into
              // document content matching the preview.
              let content = buildTemplateContent(templateObj || templateId);

        // Replace variables in the content JSON if provided
        const applyVariablesToDoc = (doc, vars) => {
          if (!vars || Object.keys(vars).length === 0) return doc;

          const replaceText = (text) => {
            if (!text || typeof text !== "string") return text;
            // Replace {{var}} and [var] tokens
            let out = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, p1) => (vars[p1] != null ? vars[p1] : m));
            out = out.replace(/\[([^\]]+)\]/g, (m, p1) => (vars[p1] != null ? vars[p1] : m));
            return out;
          };

          const walk = (node) => {
            if (!node) return node;
            if (node.type === "text" && typeof node.text === "string") {
              return { ...node, text: replaceText(node.text) };
            }
            if (node.content && Array.isArray(node.content)) {
              return { ...node, content: node.content.map(walk) };
            }
            return node;
          };

          return { ...doc, content: (doc.content || []).map(walk) };
        };

        if (selection?.variables) {
          content = applyVariablesToDoc(content, selection.variables);
        }

        // Map cover selection to canvas cover metadata
        let canvasCover = null;
          try {
          const tpl = templateObj || TEMPLATES.find((t) => t.id === templateId);
          const cover = tpl?.cover || (tpl && tpl.coverImage) || null;
          let variation = null;
          if (cover) {
            const variations = Array.isArray(cover) ? cover : (cover.variations || [cover]);
            if (selection?.coverVariation) {
              variation = variations.find((v) => v.id === selection.coverVariation || v.url === selection.coverVariation || v.type === selection.coverVariation) || variations[0];
            } else {
              variation = variations[0];
            }
          }

          if (variation) {
            if (variation.url) {
              canvasCover = { type: "image", value: variation.url };
            } else if (variation.type === "photo" && variation.prompt) {
              // fallback to photo placeholder
              canvasCover = { type: "image", value: variation.url || variation.src || null };
            } else if (variation.type === "gradient" || variation.colorPalette) {
              const p = variation.colorPalette || variation.colors || [];
              const a = p[0] || "#eef2ff";
              const b = p[1] || a;
              canvasCover = { type: "gradient", value: `linear-gradient(135deg, ${a}, ${b})` };
            } else if (typeof variation === "string") {
              canvasCover = { type: "image", value: variation };
            }
          } else if (typeof cover === "string") {
            canvasCover = { type: "image", value: cover };
          }
        } catch (err) {
          // ignore mapping errors
          // eslint-disable-next-line no-console
          console.warn("cover mapping failed", err);
        }

        const payload = { title, content };
        if (canvasCover) payload.cover = canvasCover;

        await createCanvas(channelId, payload);
        queryClient.invalidateQueries({ queryKey: ["canvas", "channel", channelId] });
        setView("editor");
      } catch (err) {
        console.error("[CanvasPanel] createFromTemplate error:", err);
      }
    },
    [channelId, createCanvas, queryClient],
  );

  // ── Select from existing list ──────────────────────────────────────────────
  const handleSelectExisting = useCallback(
    async (canvas) => {
      try {
        const { loadCanvas } = useCanvasStore.getState();
        await loadCanvas(canvas._id);
        setView("editor");
      } catch (err) {
        console.error("[CanvasPanel] loadExisting error:", err);
      }
    },
    [],
  );

  // ── Save handler (called by CanvasEditor on debounced update) ──────────────
  const handleSave = useCallback(
    async (json) => {
      if (!activeCanvas?._id) return;
      const { updateCanvasMetadata } = useCanvasStore.getState();
      await updateCanvasMetadata(activeCanvas._id, { content: json });
    },
    [activeCanvas],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSkeleton />;

  // No canvas and no view choice yet → empty state
  if (!view && !activeCanvas) {
    return <EmptyState onAdd={() => setView("menu")} />;
  }

  // Inline CanvasMenu (when opened via EmptyState "Add a canvas" button)
  if (view === "menu") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          background: "var(--bg-primary)",
          padding: 24,
        }}
      >
        <CanvasMenu
          onSelect={handleMenuSelect}
          onDismiss={() => setView(activeCanvas ? "editor" : null)}
        />
      </div>
    );
  }

  // Template selector
  if (view === "template") {
    return (
      <TemplateSelector
        onSelect={handleTemplateSelect}
        onBack={() => setView(activeCanvas ? "editor" : "menu")}
      />
    );
  }

  // Existing canvas picker
  if (view === "existing") {
    return (
      <ExistingCanvasList
        canvases={allCanvases}
        onSelect={handleSelectExisting}
        onBack={() => setView(activeCanvas ? "editor" : "menu")}
      />
    );
  }

  // Editor (view === "editor" or activeCanvas exists with no other view)
  if (activeCanvas) {
    return (
      <CanvasEditor
        canvas={activeCanvas}
        onSave={handleSave}
        onBack={undefined}
      />
    );
  }

  // Fallback
  return <EmptyState onAdd={() => setView("menu")} />;
}
