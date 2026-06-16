import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  X,
  MessageSquare,
  Hash,
  Send,
  Pin,
  Edit,
  Heart,
  Repeat,
  AtSign,
  Forward,
  MessageCircle,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  File,
  Calendar,
  User,
  HardDrive,
  Copy,
  Check,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { useAuthStore } from "../../stores/authStore";
import { useChannelStore } from "../../stores/channelStore";
import { messageAPI } from "../../services/api";
import logger from "../../utils/logger";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMessageTime(dateStr) {
  if (!dateStr) return "N/A";
  try {
    return format(new Date(dateStr), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return "N/A";
  }
}

function getFileKind(mime = "", name = "") {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("video/")) return "video";
  if (mime?.startsWith("audio/")) return "audio";
  return "file";
}

function getFileIcon(kind) {
  if (kind === "image") return <ImageIcon size={14} />;
  if (kind === "video") return <Film size={14} />;
  if (kind === "audio") return <Music size={14} />;
  return <FileText size={14} />;
}

// ─── Detail Row Component ─────────────────────────────────────────────────────

function DetailRow({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
        <div style={{
          fontSize: 13, color: "var(--text-primary, #ddd)",
          wordBreak: "break-all", lineHeight: 1.4,
        }}>{value || "N/A"}</div>
      </div>
    </div>
  );
}

// ─── Stat Badge ───────────────────────────────────────────────────────────────

function StatBadge({ icon, label, count }) {
  const displayCount = typeof count === "number" ? count : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-white, #f1f1f1)", lineHeight: 1 }}>{displayCount}</div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Conversation Badge ───────────────────────────────────────────────────────

function ConversationBadge({ channel, time }) {
  if (!channel) return null;
  const channelName = channel.name || channel._id || "Unknown";
  const channelType = channel.type || "channel";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 14px", borderRadius: 10,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.06)",
      fontSize: 13,
    }}>
      {channelType === "dm" ? (
        <User size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      ) : (
        <Hash size={14} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: "var(--text-primary, #ddd)", fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {channelType === "dm" ? `DM with ${channelName}` : `#${channelName}`}
        </div>
        {time && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {formatMessageTime(time)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Message Details Panel (Portal-based) ─────────────────────────────────────
// Uses the same design pattern as FileDetailsModal in SlackFileCard.jsx

export default function MessageDetailsPanel({ message, onClose, onForward }) {
  const { user } = useAuthStore();
  const channels = useChannelStore((s) => s.channels || []);
  const [details, setDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch fresh message details from API
  useEffect(() => {
    if (!message?._id) return;
    let cancelled = false;
    setIsLoading(true);
    messageAPI.get(message._id)
      .then(({ data }) => {
        if (!cancelled) setDetails(data?.message || data?.data?.message || data);
      })
      .catch((err) => {
        logger.error("Failed to fetch message details:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [message?._id]);

  const msg = details || message;
  if (!msg) return null;

  // Extract data from message object
  const authorName = msg.senderSnapshot?.name || msg.authorId?.name || "Unknown";
  const authorAvatar = msg.senderSnapshot?.avatar || (typeof msg.authorId === "object" ? msg.authorId?.avatar : null);
  const createdAt = msg.createdAt;
  const updatedAt = msg.updatedAt;
  const isEdited = msg.isEdited === true;
  const isPinned = msg.isPinned === true;
  const replyCount = msg.replyCount || 0;
  const threadCount = msg.replyCount || 0;
  const reactionCount = (msg.reactions || []).reduce((sum, r) => sum + (r.users?.length || r.count || 0), 0);
  const reactionTypes = (msg.reactions || []).length;
  const forwardCount = msg.forwardCount || 0;
  const channelId = msg.channelId?._id || msg.channelId || message.channelId;
  const channelName = msg.channelId?.name || "";
  const channelType = msg.channelId?.type || "channel";
  const messageType = msg.contentType || "text";

  // Find channel display name
  const channelInfo = useMemo(() => {
    if (msg.channelId?.name) return msg.channelId;
    const found = channels.find((c) => c._id === channelId || c._id?.toString() === channelId?.toString());
    return found || { name: channelName || channelId, type: channelType };
  }, [msg.channelId, channels, channelId, channelName, channelType]);

  // Attachments
  const attachments = msg.fileReferences?.length > 0
    ? msg.fileReferences
        .map((ref) => (ref.fileId ? { ...ref.fileId, name: ref.fileId.originalName || ref.fileId.fileName || "File" } : null))
        .filter(Boolean)
    : msg.attachments || [];

  // Forward meta
  const forwardMeta = msg.forwardMeta;
  const isForwarded = forwardMeta?.isForwarded;

  // Message content preview
  const contentPreview = msg.htmlContent || msg.content || "";
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(contentPreview);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(msg._id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  const handleShare = () => {
    onForward?.(msg);
    onClose?.();
  };

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10001,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "fm-overlay-in 0.18s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose?.(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: 480, margin: "0 1rem",
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          background: "var(--bg-secondary, #1e1f24)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16, overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.05) inset",
          animation: "fm-modal-in 0.22s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={18} style={{ color: "var(--accent-primary)" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-white, #f1f1f1)" }}>
              Message Details
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-muted)", padding: 4, borderRadius: 8,
              display: "flex", alignItems: "center", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable Content ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0" }}>
          {/* Message Preview */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Message
            </div>
            {looksLikeHtml ? (
              <div
                className="rich-message-content"
                style={{ fontSize: 13, color: "var(--text-primary, #ddd)", lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: contentPreview }}
              />
            ) : (
              <div style={{
                fontSize: 13, color: "var(--text-primary, #ddd)",
                whiteSpace: "pre-wrap", lineHeight: 1.5, wordBreak: "break-word",
              }}>
                {contentPreview}
              </div>
            )}
          </div>

          {/* Image Preview (for image messages) */}
          {attachments.length > 0 && (
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Attachment Preview
              </div>
              {attachments.map((att, i) => {
                const akind = getFileKind(att.mimeType || att.type, att.originalName || att.fileName || att.name);
                const url = att.secureUrl || att.url;
                const name = att.originalName || att.fileName || att.name || "File";
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 10,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    marginBottom: 8,
                  }}>
                    <div style={{ flexShrink: 0, color: "var(--text-muted)" }}>{getFileIcon(akind)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-white)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                    </div>
                    {akind === "image" && url && (
                      <img src={url} alt={name} style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Details Section */}
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            {/* Author */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 2 }}><User size={14} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Sent By</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {authorAvatar && (
                    <img src={authorAvatar} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
                  )}
                  <span style={{ fontSize: 13, color: "var(--text-primary, #ddd)" }}>{authorName}</span>
                </div>
              </div>
            </div>

            <DetailRow icon={<Calendar size={14} />} label="Created" value={formatMessageTime(createdAt)} />
            {updatedAt && updatedAt !== createdAt && (
              <DetailRow icon={<Calendar size={14} />} label="Last Modified" value={formatMessageTime(updatedAt)} />
            )}
            <DetailRow icon={<Hash size={14} />} label="Message ID" value={
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>{msg._id}</span>
                <button
                  onClick={handleCopyId}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex" }}
                  title="Copy ID"
                >
                  {copied ? <Check size={12} style={{ color: "#22c55e" }} /> : <Copy size={12} />}
                </button>
              </span>
            } />
            <DetailRow icon={<MessageSquare size={14} />} label="Type" value={messageType} />
          </div>

          {/* Stats Section */}
          <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{
              display: "flex", gap: 12, marginTop: 4,
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              flexWrap: "wrap",
            }}>
              <StatBadge icon={<MessageCircle size={13} />} label="Replies" count={replyCount} />
              <StatBadge icon={<Heart size={13} />} label="Reactions" count={reactionCount} />
              <StatBadge icon={<Repeat size={13} />} label="Forwards" count={forwardCount} />
            </div>
            <div style={{
              display: "flex", gap: 12, marginTop: 8,
              padding: "10px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <Pin size={13} style={{ color: isPinned ? "var(--accent-yellow)" : "var(--text-muted)" }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-white, #f1f1f1)", lineHeight: 1 }}>
                    {isPinned ? "Yes" : "No"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Pinned</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <Edit size={13} style={{ color: isEdited ? "var(--accent-primary)" : "var(--text-muted)" }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-white, #f1f1f1)", lineHeight: 1 }}>
                    {isEdited ? "Yes" : "No"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Edited</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <AtSign size={13} style={{ color: "var(--text-muted)" }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-white, #f1f1f1)", lineHeight: 1 }}>
                    { (msg.content || "").match(/@\w+/g)?.length || 0 }
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Mentions</div>
                </div>
              </div>
            </div>
          </div>

          {/* Conversation Usage */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Conversation
            </div>
            <ConversationBadge channel={channelInfo} time={createdAt} />
          </div>

          {/* Forward Information */}
          {isForwarded && forwardMeta && (
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Forward Information
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {forwardMeta.originalChannelName && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", borderRadius: 10,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 13,
                  }}>
                    <Forward size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    <span style={{ color: "var(--text-primary)" }}>
                      Forwarded from <strong style={{ color: "var(--accent-primary)" }}>#{forwardMeta.originalChannelName}</strong>
                    </span>
                  </div>
                )}
                {forwardMeta.originalSenderName && (
                  <DetailRow icon={<User size={14} />} label="Forwarded By" value={forwardMeta.originalSenderName} />
                )}
                {forwardMeta.forwardedAt && (
                  <DetailRow icon={<Calendar size={14} />} label="Forwarded On" value={formatMessageTime(forwardMeta.forwardedAt)} />
                )}
              </div>
            </div>
          )}

          {/* Reaction List */}
          {msg.reactions?.length > 0 && (
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Reactions ({reactionTypes})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {msg.reactions.map((r, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 10px", borderRadius: 8,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    fontSize: 13,
                  }}>
                    <span>{r.emoji}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{r.users?.length || r.count || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoading && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>
              Loading details...
            </div>
          )}
        </div>

        {/* ── Footer Actions ── */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", justifyContent: "flex-end", gap: 8,
          flexShrink: 0,
        }}>
          <button
            onClick={handleShare}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8, border: "none",
              background: "var(--accent-primary, #5865f2)", color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-primary-hover, #4752c4)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "var(--accent-primary, #5865f2)"}
          >
            <Forward size={14} /> Share Message
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}