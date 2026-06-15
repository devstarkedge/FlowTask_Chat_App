import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Link2, Lock, ChevronDown, Check } from "lucide-react";
import toast from "react-hot-toast";
import { useChannelStore } from "../../stores/channelStore";
import { useCanvasStore } from "../../stores/canvasStore";
import { Avatar } from "../chat/MemberAvatarGroup";

const PERMISSIONS = [
  { value: "private", label: "Invite only", desc: "Only people you add" },
  { value: "channel", label: "Channel Members", desc: "Everyone in this channel" },
  { value: "workspace", label: "Workspace Members", desc: "Everyone in the workspace" },
];

export default function CanvasShareModal({ canvas, isOpen, onClose, channelId }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showPermDropdown, setShowPermDropdown] = useState(false);
  const [currentPerm, setCurrentPerm] = useState(canvas?.permissions?.visibility || "channel");
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);

  const members = useChannelStore(
    (s) => s.membersByChannel[channelId] || []
  );
  const fetchMembers = useChannelStore((s) => s.fetchMembers);
  const updateCanvasMetadata = useCanvasStore((s) => s.updateCanvasMetadata);

  useEffect(() => {
    if (isOpen && channelId) {
      fetchMembers(channelId);
    }
  }, [isOpen, channelId, fetchMembers]);

  useEffect(() => {
    if (isOpen) {
      setCurrentPerm(canvas?.permissions?.visibility || "channel");
      const existing = new Set(canvas?.permissions?.allowedUserIds?.map(String) || []);
      setSelectedIds(existing);
    }
  }, [isOpen, canvas]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showPermDropdown) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowPermDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPermDropdown]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) => m.name?.toLowerCase().includes(q));
  }, [members, searchQuery]);

  const toggleMember = useCallback((memberId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(String(memberId))) {
        next.delete(String(memberId));
      } else {
        next.add(String(memberId));
      }
      return next;
    });
  }, []);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast.success("Link copied to clipboard");
    });
  }, []);

  const handlePermissionChange = useCallback(async (newPerm) => {
    setCurrentPerm(newPerm);
    setShowPermDropdown(false);
    if (canvas?._id) {
      try {
        await updateCanvasMetadata(canvas._id, {
          permissions: { ...canvas.permissions, visibility: newPerm },
        });
        toast.success(`Permission updated to ${PERMISSIONS.find(p => p.value === newPerm)?.label}`);
      } catch {
        toast.error("Failed to update permissions");
      }
    }
  }, [canvas, updateCanvasMetadata]);

  const handleDone = useCallback(async () => {
    if (!canvas?._id) {
      onClose();
      return;
    }
    setIsSaving(true);
    try {
      await updateCanvasMetadata(canvas._id, {
        permissions: {
          ...canvas.permissions,
          visibility: currentPerm,
          allowedUserIds: [...selectedIds],
        },
      });
      toast.success("Sharing settings saved");
      onClose();
    } catch {
      toast.error("Failed to save sharing settings");
    } finally {
      setIsSaving(false);
    }
  }, [canvas, currentPerm, selectedIds, updateCanvasMetadata, onClose]);

  if (!isOpen) return null;

  const currentPermLabel = PERMISSIONS.find((p) => p.value === currentPerm)?.label || "Channel Members";

  return createPortal(
    <div className="canvas-share-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="canvas-share-modal">
        {/* Header */}
        <div className="canvas-share-modal__header">
          <div>
            <h2 className="canvas-share-modal__title">Share this canvas</h2>
            <p className="canvas-share-modal__subtitle">{canvas?.title || "Untitled canvas"}</p>
          </div>
          <button className="canvas-share-modal__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="canvas-share-modal__search">
          <input
            ref={searchRef}
            type="text"
            placeholder="Add by name or channel"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="canvas-share-modal__search-input"
          />
        </div>

        {/* People list */}
        <div className="canvas-share-modal__section">
          <h3 className="canvas-share-modal__section-title">People</h3>
          <div className="canvas-share-people-list">
            {filteredMembers.length === 0 ? (
              <div className="canvas-share-modal__empty">No members found</div>
            ) : (
              filteredMembers.map((member) => {
                const isSelected = selectedIds.has(String(member._id || member.userId));
                return (
                  <button
                    key={member._id || member.userId}
                    className={`canvas-share-person-item${isSelected ? " is-selected" : ""}`}
                    onClick={() => toggleMember(member._id || member.userId)}
                  >
                    <Avatar member={{ name: member.name, avatar: member.avatar }} size={32} />
                    <span className="canvas-share-person-item__name">{member.name}</span>
                    {isSelected && <Check size={16} className="canvas-share-person-item__check" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="canvas-share-modal__advanced">
          <button
            className="canvas-share-modal__advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span>Advanced Settings</span>
            <ChevronDown size={14} className={showAdvanced ? "is-rotated" : ""} />
          </button>
          {showAdvanced && (
            <div className="canvas-share-modal__advanced-body">
              <div className="canvas-share-modal__limit-row">
                <span>Limit sharing</span>
                <span className="canvas-share-modal__muted">Off</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="canvas-share-modal__footer">
          <button className="canvas-share-modal__copy-link" onClick={handleCopyLink}>
            <Link2 size={14} />
            Copy link
          </button>

          <div className="canvas-share-modal__actions">
            {/* Permission dropdown */}
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                className="canvas-share-modal__perm-btn"
                onClick={() => setShowPermDropdown(!showPermDropdown)}
              >
                <Lock size={13} />
                {currentPermLabel}
                <ChevronDown size={13} />
              </button>
              {showPermDropdown && (
                <div className="canvas-share-permission-dropdown">
                  {PERMISSIONS.map((perm) => (
                    <button
                      key={perm.value}
                      className={`canvas-share-permission-dropdown__item${currentPerm === perm.value ? " is-active" : ""}`}
                      onClick={() => handlePermissionChange(perm.value)}
                    >
                      <div>
                        <strong>{perm.label}</strong>
                        <small>{perm.desc}</small>
                      </div>
                      {currentPerm === perm.value && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              className="canvas-share-modal__done-btn"
              onClick={handleDone}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
