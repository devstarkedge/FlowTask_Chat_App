import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDraftStore, getDraftKey } from "../../stores/draftStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChannelStore } from "../../stores/channelStore";
import { draftAPI } from "../../services/api";
import { isContentEmpty } from "../../utils/draftUtils";
import { getChannelPath, getDMPath } from "../../utils/chatRoutes";
import {
  FileEdit,
  Trash2,
  Send,
  Paperclip,
  MessageSquare,
  Search,
  Loader2,
  ChevronDown,
  PencilLine,
} from "lucide-react";
import toast from "react-hot-toast";

function formatTimeAgo(date) {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function truncatePreview(text, max = 80) {
  if (!text) return "";
  const stripped = text.replace(/<[^>]*>/g, "").trim();
  return stripped.length > max ? stripped.slice(0, max) + "…" : stripped;
}

export default function DraftsSidebar() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const channels = useChannelStore((s) => s.channels);
  const localDrafts = useDraftStore((s) => s.drafts);
  const draftListStale = useDraftStore((s) => s.draftListStale);
  const { setSidebarDrafts, removeServerDraft, clearDraftListStale } =
    useDraftStore();
  const navigate = useNavigate();

  const [serverDrafts, setServerDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const skipRef = useRef(0);

  const fetchDrafts = useCallback(
    async (reset = false) => {
      if (!activeWorkspaceId) return;
      const currentSkip = reset ? 0 : skipRef.current;
      try {
        if (reset) setLoading(true);
        else setLoadingMore(true);

        const { data } = await draftAPI.getAll({
          limit: 30,
          skip: currentSkip,
        });
        const fetched = data?.data?.drafts || [];
        const total = data?.data?.total || 0;

        if (reset) {
          setServerDrafts(fetched);
          skipRef.current = fetched.length;
        } else {
          setServerDrafts((prev) => [...prev, ...fetched]);
          skipRef.current = currentSkip + fetched.length;
        }
        setHasMore(currentSkip + fetched.length < total);
        setSidebarDrafts(
          reset ? fetched : [...serverDrafts, ...fetched],
          total,
        );
      } catch {
        // Silent fail — show empty state
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeWorkspaceId, setSidebarDrafts, serverDrafts],
  );

  useEffect(() => {
    fetchDrafts(true);
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when draft list is marked stale (after draft save/delete)
  useEffect(() => {
    if (draftListStale) {
      clearDraftListStale();
      fetchDrafts(true);
    }
  }, [draftListStale]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Merge local + server drafts ────────────────────────────────────
  // Local Zustand drafts may not yet be on the server (sync delay).
  // Merge by channelId+threadId key, prefer local if newer.
  const mergedDrafts = useMemo(() => {
    const draftMap = new Map();

    // Add server drafts first (they have _id, full metadata)
    for (const sd of serverDrafts) {
      if (isContentEmpty(sd.htmlContent, sd.content)) continue;
      const key = getDraftKey(
        sd.channelId,
        sd.workspaceId || activeWorkspaceId,
        sd.threadId,
      );
      draftMap.set(key, {
        ...sd,
        _key: key,
        _source: "server",
        _sortTime: new Date(sd.updatedAt).getTime(),
      });
    }

    // Overlay local drafts — add if missing or replace if newer
    if (!activeWorkspaceId) return [];

    const wsPrefix = `${activeWorkspaceId}:`;
    for (const [key, ld] of Object.entries(localDrafts)) {
      if (!key.startsWith(wsPrefix)) continue;
      if (isContentEmpty(ld.html, ld.text)) continue;

      const existing = draftMap.get(key);
      if (!existing || ld.timestamp > existing._sortTime) {
        draftMap.set(key, {
          _id: existing?._id || `local-${key}`,
          _key: key,
          _source: existing ? "server" : "local",
          channelId: ld.channelId,
          threadId: ld.threadId,
          workspaceId: ld.workspaceId || activeWorkspaceId,
          content: ld.text || "",
          htmlContent: ld.html || "",
          attachments: ld.attachments || existing?.attachments || [],
          mentions: ld.mentions || existing?.mentions || [],
          updatedAt: new Date(ld.timestamp).toISOString(),
          _sortTime: ld.timestamp,
        });
      }
    }

    // Sort by most recent first
    return Array.from(draftMap.values()).sort(
      (a, b) => b._sortTime - a._sortTime,
    );
  }, [serverDrafts, localDrafts, activeWorkspaceId]);

  const handleDelete = async (e, draft) => {
    e.stopPropagation();
    try {
      if (draft._id && !draft._id.startsWith("local-")) {
        await draftAPI.delete(draft._id);
      }
      // Remove from local state
      setServerDrafts((prev) => prev.filter((d) => d._id !== draft._id));
      // Remove from Zustand
      removeServerDraft(
        draft.channelId,
        draft.threadId,
        draft.workspaceId || activeWorkspaceId,
      );
      toast.success("Draft deleted");
    } catch {
      toast.error("Failed to delete draft");
    }
  };

  const handleSendNow = async (e, draft) => {
    e.stopPropagation();
    if (!draft._id || draft._id.startsWith("local-")) {
      toast.error(
        "Draft not yet synced to server. Please wait a moment and try again.",
      );
      return;
    }
    setSendingId(draft._id);
    try {
      await draftAPI.sendDraft(draft._id);
      // Remove from all states
      setServerDrafts((prev) => prev.filter((d) => d._id !== draft._id));
      removeServerDraft(
        draft.channelId,
        draft.threadId,
        draft.workspaceId || activeWorkspaceId,
      );
      toast.success("Draft sent");
    } catch (err) {
      const msg = err?.response?.data?.error?.message || "Failed to send draft";
      toast.error(msg);
    } finally {
      setSendingId(null);
    }
  };

  const handleNavigate = (draft) => {
    const channel = channels.find((c) => c._id === draft.channelId);
    if (!channel) {
      toast.error("Channel not found");
      return;
    }
    if (channel.type === "dm") {
      navigate(getDMPath(activeWorkspaceId, draft.channelId));
    } else {
      navigate(getChannelPath(activeWorkspaceId, draft.channelId));
    }
  };

  const getChannelName = (channelId) => {
    const ch = channels.find((c) => c._id === channelId);
    if (!ch) return "Unknown";
    if (ch.type === "dm") return ch.dmRecipientName || "Direct Message";
    return `#${ch.name}`;
  };

  const filteredDrafts = searchQuery
    ? mergedDrafts.filter((d) => {
        const content = (d.content || "").toLowerCase();
        const name = getChannelName(d.channelId).toLowerCase();
        const q = searchQuery.toLowerCase();
        return content.includes(q) || name.includes(q);
      })
    : mergedDrafts;

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-12"
        style={{ color: "var(--text-muted)" }}
      >
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="panel">
      {/* HEADER */}
      <div className="drafts-header">
        <div className="panel-search mt-3">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search drafts..."
            className="panel-search-input"
          />
        </div>
      </div>

      <div className="drafts-container">
        {filteredDrafts.length === 0 ? (
          /* EMPTY STATE */
          <div className="draft-empty">
            <PencilLine size={100} className="empty-icon" />

            <h1 className="empty-title">
              Draft messages to send when you’re ready
            </h1>

            <p className="empty-text">
              Start typing a message anywhere, then find it here.
            </p>
            <p className="empty-text">
              Re-read, revise, and send whenever you’d like.
            </p>
          </div>
        ) : (
          /* LIST */
          <>
            {filteredDrafts.map((draft) => (
              <div
                key={draft._id || draft._key}
                className="draft-row"
                onClick={() => handleNavigate(draft)}
              >
                {/* Avatar */}
                <div className="draft-avatar">
                  <img
                    src={draft.channel?.avatar || "/default-avatar.png"}
                    alt="avatar"
                  />
                </div>

                {/* Content */}
                <div className="draft-content">
                  <div className="draft-top">
                    <span className="draft-name">
                      {getChannelName(draft.channelId)}
                    </span>

                    {/* RIGHT SIDE (time + actions overlap) */}
                    <div className="draft-right">
                      {/* Time */}
                      <span className="draft-time">
                        {formatTimeAgo(draft.updatedAt)}
                      </span>

                      {/* Actions */}
                      <div className="draft-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendNow(e, draft);
                          }}
                          disabled={sendingId === draft._id}
                          className="ab-btn"
                          title="Send now"
                        >
                          {sendingId === draft._id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(e, draft);
                          }}
                          className="ab-btn"
                          title="Delete draft"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <p className="draft-message">
                    {truncatePreview(draft.content || draft.htmlContent)}
                  </p>
                </div>
              </div>
            ))}

            {/* Load More */}
            {hasMore && (
              <button
                onClick={() => fetchDrafts(false)}
                disabled={loadingMore}
                className="load-more-btn"
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin mx-auto" />
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    <ChevronDown size={13} /> Load more
                  </span>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
