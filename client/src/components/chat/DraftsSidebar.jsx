import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDraftStore, getDraftKey } from "../../stores/draftStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChannelStore } from "../../stores/channelStore";
import { draftAPI } from "../../services/api";
import { isContentEmpty } from "../../utils/draftUtils";
import { getChannelPath, getDMPath } from "../../utils/chatRoutes";
import {
  Trash2,
  Send,
  Search,
  Loader2,
  ChevronDown,
  PencilLine,
  Hash,
  X,
  FileText,
} from "lucide-react";
import toast from "react-hot-toast";

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function formatTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function truncatePreview(text, max = 90) {
  if (!text) return "";
  const stripped = text.replace(/<[^>]*>/g, "").trim();
  return stripped.length > max ? stripped.slice(0, max) + "…" : stripped;
}

function getInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/* ─── Avatar ─────────────────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  "#1264a3", "#059669", "#7c3aed", "#ea580c",
  "#0891b2", "#d97706", "#db2777", "#65a30d",
];

function ChannelAvatar({ name, type, size = 38 }) {
  const initials = getInitials(name.replace(/^#/, ""));
  const colorIndex =
    name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  const bg = AVATAR_COLORS[colorIndex];

  return (
    <div
      className={`dsl-avatar${type === "dm" ? " dm" : ""}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        background: bg,
        fontSize: size * 0.35,
      }}
    >
      {type === "dm" ? (
        initials
      ) : (
        <Hash size={size * 0.42} strokeWidth={2.2} style={{ opacity: 0.9 }} />
      )}
    </div>
  );
}

/* ─── Skeleton Card ──────────────────────────────────────────────────────── */
function SkeletonCard({ delay = 0 }) {
  return (
    <div className="dsl-skeleton-card" style={{ animationDelay: `${delay}ms` }}>
      {/* Avatar skeleton */}
      <div
        className="dsl-skeleton-line"
        style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0 }}
      />
      <div className="dsl-skeleton-body">
        <div
          className="dsl-skeleton-line"
          style={{ width: "50%", height: 12 }}
        />
        <div
          className="dsl-skeleton-line"
          style={{ width: "88%", height: 11 }}
        />
        <div
          className="dsl-skeleton-line"
          style={{ width: "65%", height: 11 }}
        />
      </div>
    </div>
  );
}

/* ─── Draft Card ─────────────────────────────────────────────────────────── */
function DraftCard({ draft, channelName, channelType, onNavigate, onSend, onDelete, sendingId }) {
  const isSending      = sendingId === draft._id;
  const preview        = truncatePreview(draft.content || draft.htmlContent);
  const hasAttachments = draft.attachments?.length > 0;
  const isLocal        = draft._source === "local";

  return (
    <div
      className="dsl-card"
      onClick={() => onNavigate(draft)}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onNavigate(draft)}
      role="button"
      aria-label={`Draft for ${channelName}`}
    >
      {/* Avatar */}
      <ChannelAvatar name={channelName} type={channelType} size={38} />

      {/* Body */}
      <div className="dsl-body">
        <div className="dsl-top">
          <div className="dsl-channel-wrap">
            <span className="dsl-channel">{channelName}</span>
            {hasAttachments && (
              <span className="dsl-badge dsl-badge--attach">
                {draft.attachments.length} file{draft.attachments.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <span className="dsl-time">{formatTimeAgo(draft.updatedAt)}</span>
        </div>

        <p className="dsl-preview">
          {preview || (
            <em style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              No text content
            </em>
          )}
        </p>
      </div>

      {/* Hover actions */}
      <div className="dsl-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="dsl-action-btn dsl-action-btn--send"
          onClick={(e) => onSend(e, draft)}
          disabled={isSending}
          title="Send now"
          aria-label="Send draft"
        >
          {isSending
            ? <Loader2 size={13} className="dsl-spin" />
            : <Send size={13} />
          }
        </button>
        <button
          className="dsl-action-btn dsl-action-btn--delete"
          onClick={(e) => onDelete(e, draft)}
          title="Delete draft"
          aria-label="Delete draft"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function DraftsSidebar() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const channels          = useChannelStore((s) => s.channels);
  const localDrafts       = useDraftStore((s) => s.drafts);
  const draftListStale    = useDraftStore((s) => s.draftListStale);
  const { setSidebarDrafts, removeServerDraft, clearDraftListStale } = useDraftStore();
  const navigate = useNavigate();

  const [serverDrafts,  setServerDrafts]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [hasMore,       setHasMore]       = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [sendingId,     setSendingId]     = useState(null);
  const skipRef   = useRef(0);
  const searchRef = useRef(null);

  /* ── Fetch ── */
  const fetchDrafts = useCallback(
    async (reset = false) => {
      if (!activeWorkspaceId) return;
      const currentSkip = reset ? 0 : skipRef.current;
      try {
        if (reset) setLoading(true);
        else       setLoadingMore(true);

        const { data } = await draftAPI.getAll({ limit: 30, skip: currentSkip });
        const fetched = data?.data?.drafts || [];
        const total   = data?.data?.total  || 0;

        if (reset) {
          setServerDrafts(fetched);
          skipRef.current = fetched.length;
        } else {
          setServerDrafts((prev) => {
            const next = [...prev, ...fetched];
            skipRef.current = currentSkip + fetched.length;
            return next;
          });
        }
        setHasMore(currentSkip + fetched.length < total);
        setSidebarDrafts(
          reset ? fetched : [...serverDrafts, ...fetched],
          total,
        );
      } catch {
        /* silent */
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeWorkspaceId, setSidebarDrafts, serverDrafts],
  );

  useEffect(() => { fetchDrafts(true); }, [activeWorkspaceId]); // eslint-disable-line
  useEffect(() => {
    if (draftListStale) { clearDraftListStale(); fetchDrafts(true); }
  }, [draftListStale]); // eslint-disable-line

  /* ── Merge local + server ── */
  const mergedDrafts = useMemo(() => {
    const map = new Map();

    for (const sd of serverDrafts) {
      if (isContentEmpty(sd.htmlContent, sd.content)) continue;
      const key = getDraftKey(sd.channelId, sd.workspaceId || activeWorkspaceId, sd.threadId);
      map.set(key, { ...sd, _key: key, _source: "server", _sortTime: new Date(sd.updatedAt).getTime() });
    }

    if (activeWorkspaceId) {
      const wsPrefix = `${activeWorkspaceId}:`;
      for (const [key, ld] of Object.entries(localDrafts)) {
        if (!key.startsWith(wsPrefix)) continue;
        if (isContentEmpty(ld.html, ld.text)) continue;
        const existing = map.get(key);
        if (!existing || ld.timestamp > existing._sortTime) {
          map.set(key, {
            _id:         existing?._id || `local-${key}`,
            _key:        key,
            _source:     existing ? "server" : "local",
            channelId:   ld.channelId,
            threadId:    ld.threadId,
            workspaceId: ld.workspaceId || activeWorkspaceId,
            content:     ld.text || "",
            htmlContent: ld.html || "",
            attachments: ld.attachments || existing?.attachments || [],
            mentions:    ld.mentions    || existing?.mentions    || [],
            updatedAt:   new Date(ld.timestamp).toISOString(),
            _sortTime:   ld.timestamp,
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b._sortTime - a._sortTime);
  }, [serverDrafts, localDrafts, activeWorkspaceId]);

  /* ── Handlers ── */
  const handleDelete = async (e, draft) => {
    e.stopPropagation();
    try {
      if (draft._id && !draft._id.startsWith("local-")) {
        await draftAPI.delete(draft._id);
      }
      setServerDrafts((prev) => prev.filter((d) => d._id !== draft._id));
      removeServerDraft(draft.channelId, draft.threadId, draft.workspaceId || activeWorkspaceId);
      toast.success("Draft deleted");
    } catch {
      toast.error("Failed to delete draft");
    }
  };

  const handleSendNow = async (e, draft) => {
    e.stopPropagation();
    if (!draft._id || draft._id.startsWith("local-")) {
      toast.error("Draft not yet synced. Please wait a moment.");
      return;
    }
    setSendingId(draft._id);
    try {
      await draftAPI.sendDraft(draft._id);
      setServerDrafts((prev) => prev.filter((d) => d._id !== draft._id));
      removeServerDraft(draft.channelId, draft.threadId, draft.workspaceId || activeWorkspaceId);
      toast.success("Draft sent!");
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || "Failed to send draft");
    } finally {
      setSendingId(null);
    }
  };

  const handleNavigate = (draft) => {
    const channel = channels.find((c) => c._id === draft.channelId);
    if (!channel) { toast.error("Channel not found"); return; }
    navigate(
      channel.type === "dm"
        ? getDMPath(activeWorkspaceId, draft.channelId)
        : getChannelPath(activeWorkspaceId, draft.channelId),
    );
  };

  const getChannelInfo = (channelId) => {
    const ch = channels.find((c) => c._id === channelId);
    if (!ch) return { name: "Unknown", type: "channel" };
    if (ch.type === "dm") return { name: ch.dmRecipientName || "Direct Message", type: "dm" };
    return { name: `#${ch.name}`, type: "channel" };
  };

  const filteredDrafts = searchQuery
    ? mergedDrafts.filter((d) => {
        const { name } = getChannelInfo(d.channelId);
        const content  = (d.content || "").toLowerCase();
        const q        = searchQuery.toLowerCase();
        return content.includes(q) || name.toLowerCase().includes(q);
      })
    : mergedDrafts;

  /* ── Render ── */
  return (
    <div className="dsl-root">
      {/* Header */}
      <div className="dsl-header">
        <div className="dsl-header-top">
          <div className="dsl-title">
            <span className="dsl-title-icon">
              <PencilLine size={14} strokeWidth={2.2} />
            </span>
            Drafts
            {!loading && mergedDrafts.length > 0 && (
              <span className="dsl-count-pill">{mergedDrafts.length}</span>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="dsl-search">
          <Search size={13} className="dsl-search-icon" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search drafts…"
            className="dsl-search-input"
            aria-label="Search drafts"
          />
          {searchQuery && (
            <button
              className="dsl-search-clear"
              onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
              aria-label="Clear search"
            >
              <X size={10} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="dsl-scroll">
        {loading ? (
          <>
            <SkeletonCard delay={0} />
            <SkeletonCard delay={80} />
            <SkeletonCard delay={160} />
            <SkeletonCard delay={240} />
          </>
        ) : filteredDrafts.length === 0 ? (
          <div className="dsl-empty">
            <div className="dsl-empty-icon">
              <PencilLine size={28} />
            </div>
            <h3 className="dsl-empty-title">
              {searchQuery ? "No matching drafts" : "No drafts yet"}
            </h3>
            <p className="dsl-empty-desc">
              {searchQuery
                ? "Try a different search term."
                : "Start composing a message — it'll appear here automatically."}
            </p>
          </div>
        ) : (
          <>
            <div className="dsl-section-label">
              {searchQuery
                ? `${filteredDrafts.length} result${filteredDrafts.length !== 1 ? "s" : ""}`
                : "Recent"}
            </div>

            {filteredDrafts.map((draft) => {
              const { name, type } = getChannelInfo(draft.channelId);
              return (
                <DraftCard
                  key={draft._id || draft._key}
                  draft={draft}
                  channelName={name}
                  channelType={type}
                  onNavigate={handleNavigate}
                  onSend={handleSendNow}
                  onDelete={handleDelete}
                  sendingId={sendingId}
                />
              );
            })}

            {hasMore && (
              <button
                className="dsl-load-more"
                onClick={() => fetchDrafts(false)}
                disabled={loadingMore}
              >
                {loadingMore
                  ? <Loader2 size={13} className="dsl-spin" />
                  : <><ChevronDown size={13} /> Load more</>
                }
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {!loading && mergedDrafts.length > 0 && (
        <div className="dsl-footer">
          <FileText size={11} />
          {mergedDrafts.length} draft{mergedDrafts.length !== 1 ? "s" : ""} · auto-saved
        </div>
      )}
    </div>
  );
}