import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Link2, ChevronDown, Check, User, Users, Settings, Plus, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { useChannelStore } from "../../stores/channelStore";
import { useCanvasStore } from "../../stores/canvasStore";
import { useChatStore } from "../../stores/chatStore";
import { getSocket } from "../../services/socket";
import { canvasAPI } from "../../services/api";
import { getCanvasUrl, getPublicCanvasUrl } from "../../utils/urlUtils";

const EMPTY_MEMBERS = [];

const ROLE_OPTIONS = [
  { value: "viewer", label: "Can view" },
  { value: "editor", label: "Can edit" },
];

// Dropdown options for "Anyone in [Workspace] can..."
const WORKSPACE_ACCESS_OPTIONS = [
  { value: "invite_only", label: "Invite only" },
  { value: "view", label: "Anyone in Stark Edge Team can view" },
  { value: "edit", label: "Anyone in Stark Edge Team can edit" },
];

export default function CanvasShareModal({ canvas, isOpen, onClose, channelId }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [userRoles, setUserRoles] = useState(new Map());
  const [currentAccessLevel, setCurrentAccessLevel] = useState("view");
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingPublic, setIsTogglingPublic] = useState(false);
  
  // Accordion state
  const [expandedSection, setExpandedSection] = useState(null); // 'people' | 'advanced' | null

  const searchRef = useRef(null);

  const members = useChannelStore((s) => s.membersByChannel[channelId]) ?? EMPTY_MEMBERS;
  const fetchMembers = useChannelStore((s) => s.fetchMembers);
  const updateCanvasMetadata = useCanvasStore((s) => s.updateCanvasMetadata);
  const sendMessage = useChatStore((s) => s.sendMessage);

  useEffect(() => {
    if (isOpen && channelId) {
      fetchMembers(channelId);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen, channelId, fetchMembers]);

  useEffect(() => {
    if (isOpen) {
      setCurrentAccessLevel(canvas?.permissions?.accessLevel || "view");
      const map = new Map();
      const permUsers = canvas?.permissions?.users || [];
      permUsers.forEach((entry) => {
        const uid = String(entry.userId?._id || entry.userId);
        if (uid) map.set(uid, entry.role || "viewer");
      });
      const legacyIds = canvas?.permissions?.allowedUserIds || [];
      legacyIds.forEach((id) => {
        const uid = String(id._id || id);
        if (uid && !map.has(uid)) map.set(uid, "viewer");
      });
      setUserRoles(map);
      setExpandedSection(null); // reset
      setSearchQuery("");
    }
  }, [isOpen, canvas]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) => m.name?.toLowerCase().includes(q));
  }, [members, searchQuery]);

  const toggleMember = useCallback((memberId) => {
    const uid = String(memberId);
    setUserRoles((prev) => {
      const next = new Map(prev);
      if (next.has(uid)) next.delete(uid);
      else next.set(uid, "viewer");
      return next;
    });
  }, []);

  const setMemberRole = useCallback((memberId, role) => {
    const uid = String(memberId);
    setUserRoles((prev) => {
      const next = new Map(prev);
      if (next.has(uid)) next.set(uid, role);
      return next;
    });
  }, []);

  const handleCopyLink = useCallback(() => {
    const canvasId = canvas?._id;
    if (!canvasId) return;
    const url = getCanvasUrl(canvasId);
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copied to clipboard");
    });
  }, [canvas]);

  const canvasId = canvas?._id;

  const handleAccessLevelChange = useCallback(
    async (newLevel) => {
      setCurrentAccessLevel(newLevel);
      if (canvasId) {
        try {
          await updateCanvasMetadata(canvasId, {
            permissions: { accessLevel: newLevel },
          });
          toast.success("Permission updated");
        } catch {
          toast.error("Failed to update permissions");
        }
      }
    },
    [canvasId, updateCanvasMetadata]
  );

  const handleDone = useCallback(async () => {
    if (!canvasId) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      const users = [];
      const targetUserIds = [];
      userRoles.forEach((role, userId) => {
        users.push({ userId, role });
        targetUserIds.push(userId);
      });

      const permissions = {
        accessLevel: currentAccessLevel,
        users,
        allowedUserIds: [...userRoles.keys()],
      };

      await updateCanvasMetadata(canvasId, { permissions });

      if (targetUserIds.length > 0) {
        const socket = getSocket();
        if (socket) {
          socket.emit("canvas:share:request", {
            canvasId,
            targetUserIds,
            roles: Object.fromEntries(userRoles),
          });
        }
      }

      toast.success("Sharing settings saved");
      onClose();
    } catch {
      toast.error("Failed to save sharing settings");
    } finally {
      setIsSaving(false);
    }
  }, [canvasId, currentAccessLevel, userRoles, updateCanvasMetadata, onClose]);

  const handleTogglePublicShare = useCallback(async () => {
    if (!canvasId) return;
    setIsTogglingPublic(true);
    try {
      const res = await canvasAPI.togglePublicShare(canvasId);
      if (res.data?.success) {
        toast.success(res.data.data.sharing?.isPublic ? "Public sharing enabled" : "Public sharing disabled");
      }
    } catch (err) {
      toast.error("Failed to toggle public share");
    } finally {
      setIsTogglingPublic(false);
    }
  }, [canvasId]);

  const handleShareToChannel = useCallback(async () => {
    if (!canvasId || !channelId) return;
    try {
      // First ensure the permissions are saved
      await handleDone();
      
      // Send the structured Canvas message
      await sendMessage(channelId, "I shared a canvas", {
        contentType: "canvas_share",
        canvasMeta: {
          canvasId: canvasId,
          title: canvas?.title || "Untitled canvas",
          publicToken: canvas?.sharing?.isPublic ? canvas.sharing.publicToken : null,
          permission: currentAccessLevel,
          previewText: canvas?.content 
            ? canvas.content.replace(/<[^>]*>?/gm, '').substring(0, 200) 
            : null
        }
      });
      toast.success("Shared to channel");
    } catch (err) {
      toast.error("Failed to share to channel");
    }
  }, [canvasId, channelId, canvas, currentAccessLevel, handleDone, sendMessage]);

  const handleCopyPublicLink = useCallback(() => {
    if (!canvas?.sharing?.publicToken) return;
    const url = getPublicCanvasUrl(canvas.sharing.publicToken);
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Public link copied");
    });
  }, [canvas?.sharing?.publicToken]);

  if (!isOpen) return null;

  // Derive summary for People section
  const sharedCount = userRoles.size;
  let peopleSummary = "No one added yet";
  if (sharedCount > 0) {
    const firstNames = [];
    let count = 0;
    for (const [uid] of userRoles.entries()) {
      if (count >= 2) break;
      const member = members.find((m) => String(m._id || m.userId) === uid);
      if (member) firstNames.push(member.name);
      count++;
    }
    if (sharedCount <= 2) {
      peopleSummary = firstNames.join(" and ");
    } else {
      peopleSummary = `${firstNames.join(", ")} and ${sharedCount - 2} other${sharedCount - 2 > 1 ? "s" : ""}`;
    }
  }

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(2px)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          handleDone(); // Save and close on click outside
        }
      }}
    >
      <div
        style={{
          background: "var(--bg-primary, #ffffff)",
          borderRadius: 12,
          width: 500,
          maxWidth: "95vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary, #1e293b)" }}>
              Share this canvas
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted, #64748b)" }}>
              {canvas?.title || "Untitled canvas"}
            </p>
          </div>
          <button
            onClick={() => handleDone()}
            style={{
              background: "none", border: "none", padding: 4, cursor: "pointer", color: "var(--text-muted)", borderRadius: 6
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 16px" }}>
          


          {/* Search Input */}
          <div style={{ marginBottom: 16 }}>
            <input
              ref={searchRef}
              type="text"
              placeholder="Add by name, channel or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 14,
                border: "2px solid var(--border-primary, #cbd5e1)",
                borderRadius: 8,
                outline: "none",
                background: "var(--bg-primary, #ffffff)",
                color: "var(--text-primary, #1e293b)",
                transition: "border-color 0.2s, box-shadow 0.2s"
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#3b82f6";
                e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
                setExpandedSection("people"); // Auto-expand people list when typing
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--border-primary, #cbd5e1)";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Accordions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            
            {/* People Section */}
            <div style={{ borderBottom: expandedSection === "people" ? "none" : "1px solid var(--border-secondary, #e2e8f0)" }}>
              <button
                onClick={() => setExpandedSection(expandedSection === "people" ? null : "people")}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left"
                }}
              >
                <div style={{ width: 24, display: "flex", justifyContent: "center" }}>
                  <User size={18} color="var(--text-primary)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>People</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{peopleSummary}</div>
                </div>
                <ChevronDown size={18} color="var(--text-muted)" style={{ transform: expandedSection === "people" ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
              </button>

              {expandedSection === "people" && (
                <div style={{ padding: "8px 0 16px 36px", maxHeight: 200, overflowY: "auto" }}>
                  {filteredMembers.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No members found</div>
                  ) : (
                    filteredMembers.map((member) => {
                      const uid = String(member._id || member.userId);
                      const isSelected = userRoles.has(uid);
                      const currentRole = userRoles.get(uid) || "viewer";

                      return (
                        <div key={uid} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", gap: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                            <div style={{ width: 24, height: 24, borderRadius: 4, background: "#e2e8f0", overflow: "hidden", flexShrink: 0 }}>
                              {member.avatar ? (
                                <img src={member.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#64748b" }}>
                                  {member.name?.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <span style={{ fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {member.name}
                            </span>
                          </div>
                          
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {isSelected ? (
                              <>
                                <select
                                  style={{
                                    fontSize: 12, padding: "4px 8px", border: "1px solid var(--border-secondary)", borderRadius: 6, outline: "none", cursor: "pointer", background: "transparent"
                                  }}
                                  value={currentRole}
                                  onChange={(e) => setMemberRole(uid, e.target.value)}
                                >
                                  {ROLE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                                <button onClick={() => toggleMember(uid)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => toggleMember(uid)}
                                style={{
                                  fontSize: 12, fontWeight: 600, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: "4px 8px"
                                }}
                              >
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Advanced Settings Section */}
            <div style={{ borderBottom: expandedSection === "advanced" ? "none" : "1px solid var(--border-secondary, #e2e8f0)" }}>
              <button
                onClick={() => setExpandedSection(expandedSection === "advanced" ? null : "advanced")}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left"
                }}
              >
                <div style={{ width: 24, display: "flex", justifyContent: "center" }}>
                  <Settings size={18} color="var(--text-primary)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Advanced Settings</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Limit sharing</div>
                </div>
                <ChevronDown size={18} color="var(--text-muted)" style={{ transform: expandedSection === "advanced" ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
              </button>

              {expandedSection === "advanced" && (
                <div style={{ padding: "8px 0 16px 36px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Public Sharing</div>
                      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Allow anyone with the link to view</div>
                    </div>
                    <button
                      onClick={handleTogglePublicShare}
                      disabled={isTogglingPublic}
                      style={{
                        padding: "6px 12px", borderRadius: 16, border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer",
                        background: canvas?.sharing?.isPublic ? "#10b981" : "#e2e8f0",
                        color: canvas?.sharing?.isPublic ? "#fff" : "var(--text-primary)",
                      }}
                    >
                      {isTogglingPublic ? "..." : canvas?.sharing?.isPublic ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                  {canvas?.sharing?.isPublic && canvas?.sharing?.publicToken && (
                    <button onClick={handleCopyPublicLink} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#3b82f6", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      <Link2 size={14} /> Copy Public Link
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-secondary, #e2e8f0)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-secondary, #f8fafc)", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={handleCopyLink}
              style={{
                display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#3b82f6", fontSize: 14, fontWeight: 600, padding: "8px 0"
              }}
            >
              <Link2 size={16} /> Copy Link
            </button>
          </div>

          <div style={{ position: "relative" }}>
            <select
              value={currentAccessLevel}
              onChange={(e) => handleAccessLevelChange(e.target.value)}
              style={{
                appearance: "none",
                background: "var(--bg-primary, #ffffff)",
                border: "1px solid var(--border-primary, #cbd5e1)",
                borderRadius: 8,
                padding: "8px 32px 8px 12px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary, #1e293b)",
                cursor: "pointer",
                outline: "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
              }}
            >
              {WORKSPACE_ACCESS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={14} color="var(--text-muted)" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}