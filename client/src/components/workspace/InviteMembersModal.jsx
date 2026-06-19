import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useChannelStore } from "../../stores/channelStore";
import { workspaceAPI } from "../../services/api";
import toast from "react-hot-toast";
import {
  X,
  UserPlus,
  Mail,
  Hash,
  Search,
  Copy,
  Check,
  Send,
  Loader2,
  AlertCircle,
  Users,
  Link,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────────────────────── */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function parseEmails(input) {
  return input
    .split(/[,\n;]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

/* ─────────────────────────────────────────────────────────────────────────────
   EMAIL CHIP
   ───────────────────────────────────────────────────────────────────────────── */

function EmailChip({ email, onRemove }) {
  return (
    <span className="imm-chip">
      <Mail size={11} />
      <span>{email}</span>
      <button
        type="button"
        className="imm-chip__remove"
        onClick={() => onRemove(email)}
        aria-label={`Remove ${email}`}
      >
        <X size={11} />
      </button>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CHANNEL ITEM
   ───────────────────────────────────────────────────────────────────────────── */

function ChannelItem({ channel, isSelected, onToggle }) {
  return (
    <button
      type="button"
      className={`imm-channel-item${isSelected ? " imm-channel-item--selected" : ""}`}
      onClick={() => onToggle(channel._id)}
    >
      <span className="imm-channel-item__check">
        {isSelected ? <Check size={13} /> : <span className="imm-channel-item__check-empty" />}
      </span>
      <Hash size={14} className="imm-channel-item__hash" />
      <span className="imm-channel-item__name">{channel.name}</span>
      {channel.memberCount !== undefined && (
        <span className="imm-channel-item__count">{channel.memberCount}</span>
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export default function InviteMembersModal({ isOpen, onClose, workspaceId }) {
  const { activeWorkspace } = useWorkspaceStore();
  const { channels, fetchChannels } = useChannelStore();

  const [emails, setEmails] = useState([]);
  const [emailInput, setEmailInput] = useState("");
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [channelSearch, setChannelSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [errors, setErrors] = useState({});

  const overlayRef = useRef(null);
  const emailInputRef = useRef(null);
  const channelSearchRef = useRef(null);

  // Fetch channels when modal opens
  useEffect(() => {
    if (isOpen && workspaceId) {
      setIsLoading(true);
      fetchChannels(workspaceId)
        .then(() => setIsLoading(false))
        .catch(() => setIsLoading(false));

      // Generate invite link
      const link = `${window.location.origin}/invite/${workspaceId}`;
      setInviteLink(link);
    }
  }, [isOpen, workspaceId, fetchChannels]);

  // Focus email input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => emailInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Close on overlay click
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Email input handlers
  const handleEmailInputChange = (value) => {
    setEmailInput(value);

    // Auto-add emails on comma or enter
    if (value.includes(",") || value.includes("\n")) {
      const newEmails = parseEmails(value);
      const validEmails = newEmails.filter(isValidEmail);
      const invalidEmails = newEmails.filter((e) => !isValidEmail(e));

      if (invalidEmails.length > 0) {
        toast.error(`Invalid email: ${invalidEmails[0]}`);
      }

      setEmails((prev) => {
        const combined = [...prev, ...validEmails];
        const unique = [...new Set(combined)];
        return unique;
      });
      setEmailInput("");
      setErrors((prev) => ({ ...prev, emails: null }));
    }
  };

  const handleEmailKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = emailInput.trim();
      if (trimmed && isValidEmail(trimmed)) {
        setEmails((prev) => {
          const combined = [...prev, trimmed];
          const unique = [...new Set(combined)];
          return unique;
        });
        setEmailInput("");
        setErrors((prev) => ({ ...prev, emails: null }));
      } else if (trimmed) {
        toast.error("Please enter a valid email address");
      }
    }

    // Backspace on empty input removes last chip
    if (e.key === "Backspace" && emailInput === "" && emails.length > 0) {
      setEmails((prev) => prev.slice(0, -1));
    }
  };

  const removeEmail = (emailToRemove) => {
    setEmails((prev) => prev.filter((e) => e !== emailToRemove));
  };

  // Channel handlers
  const toggleChannel = (channelId) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  };

  const filteredChannels = channels.filter((ch) =>
    ch.name.toLowerCase().includes(channelSearch.toLowerCase()),
  );

  // Copy invite link
  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      toast.success("Invite link copied!");
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  // Send invites
  const handleSendInvites = async () => {
    setErrors({});

    // Validate emails
    if (emails.length === 0) {
      setErrors({ emails: "Please add at least one email address" });
      toast.error("Please add at least one email address");
      return;
    }

    const invalidEmails = emails.filter((e) => !isValidEmail(e));
    if (invalidEmails.length > 0) {
      setErrors({ emails: `Invalid emails: ${invalidEmails.join(", ")}` });
      toast.error("Please check email addresses");
      return;
    }

    setIsSending(true);

    try {
      // Send invites for each email
      const results = await Promise.allSettled(
        emails.map((email) =>
          workspaceAPI.inviteByEmail(workspaceId, {
            email,
            channels: selectedChannels,
          }),
        ),
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      if (succeeded > 0) {
        toast.success(`Invitation${succeeded > 1 ? "s" : ""} sent to ${succeeded} email${succeeded > 1 ? "s" : ""}!`);
      }

      if (failed > 0) {
        toast.error(`${failed} invitation${failed > 1 ? "s" : ""} failed to send`);
      }

      // Close modal after short delay
      setTimeout(() => {
        onClose();
        resetForm();
      }, 1500);
    } catch (error) {
      const message = error.response?.data?.error?.message || "Failed to send invitations";
      toast.error(message);
      setErrors({ submit: message });
    } finally {
      setIsSending(false);
    }
  };

  const resetForm = () => {
    setEmails([]);
    setEmailInput("");
    setSelectedChannels([]);
    setChannelSearch("");
    setErrors({});
    setLinkCopied(false);
  };

  const handleClose = () => {
    onClose();
    // Reset after close animation
    setTimeout(resetForm, 200);
  };

  if (!isOpen) return null;

  const workspaceName = activeWorkspace?.name || "Workspace";

  return createPortal(
    <div className="imm-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="imm-shell" role="dialog" aria-modal="true" aria-label={`Invite people to ${workspaceName}`}>
        {/* ══ HEADER ══ */}
        <div className="imm-header">
          <div className="imm-header-left">
            <div className="imm-header-icon">
              <UserPlus size={20} color="#fff" />
            </div>
            <div>
              <h2 className="imm-title">Invite people to {workspaceName}</h2>
              <p className="imm-subtitle">
                Add team members to collaborate in your workspace
              </p>
            </div>
          </div>
          <button
            type="button"
            className="imm-close-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ══ BODY ══ */}
        <div className="imm-body">
          {/* Email Input Section */}
          <div className="imm-section">
            <label className="imm-label">
              <Mail size={13} />
              <span>Email addresses</span>
            </label>
            <div className="imm-email-input-wrap">
              <div className="imm-email-chips">
                {emails.map((email) => (
                  <EmailChip
                    key={email}
                    email={email}
                    onRemove={removeEmail}
                  />
                ))}
              </div>
              <input
                ref={emailInputRef}
                type="text"
                className="imm-email-input"
                placeholder={emails.length === 0 ? "user1@example.com, user2@example.com" : "Add more..."}
                value={emailInput}
                onChange={(e) => handleEmailInputChange(e.target.value)}
                onKeyDown={handleEmailKeyDown}
              />
            </div>
            {errors.emails && (
              <p className="imm-error-text">{errors.emails}</p>
            )}
            <p className="imm-hint">
              Separate multiple emails with commas or press Enter
            </p>
          </div>

          {/* Channel Selection Section */}
          <div className="imm-section">
            <label className="imm-label">
              <Hash size={13} />
              <span>Add to channels (optional)</span>
            </label>

            {/* Channel Search */}
            <div className="imm-channel-search">
              <Search size={14} className="imm-channel-search__icon" />
              <input
                ref={channelSearchRef}
                type="text"
                className="imm-channel-search__input"
                placeholder="Search channels..."
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
              />
            </div>

            {/* Channel List */}
            <div className="imm-channel-list">
              {isLoading ? (
                <div className="imm-channel-loading">
                  <Loader2 size={16} className="wm-spin" />
                  <span>Loading channels...</span>
                </div>
              ) : filteredChannels.length === 0 ? (
                <p className="imm-channel-empty">
                  {channelSearch ? "No channels found" : "No channels available"}
                </p>
              ) : (
                filteredChannels.map((channel) => (
                  <ChannelItem
                    key={channel._id}
                    channel={channel}
                    isSelected={selectedChannels.includes(channel._id)}
                    onToggle={toggleChannel}
                  />
                ))
              )}
            </div>

            {selectedChannels.length > 0 && (
              <p className="imm-hint">
                {selectedChannels.length} channel{selectedChannels.length > 1 ? "s" : ""} selected
              </p>
            )}
          </div>

          {/* Invite Link Section */}
          <div className="imm-section">
            <label className="imm-label">
              <Link size={13} />
              <span>Invite link</span>
            </label>
            <div className="imm-link-row">
              <input
                type="text"
                className="imm-link-input"
                value={inviteLink}
                readOnly
                onClick={(e) => e.target.select()}
              />
              <button
                type="button"
                className="imm-copy-btn"
                onClick={copyInviteLink}
                aria-label="Copy invite link"
              >
                {linkCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <p className="imm-hint">
              Share this link to invite people directly
            </p>
          </div>

          {errors.submit && (
            <div className="imm-error-banner">
              <AlertCircle size={16} />
              <span>{errors.submit}</span>
            </div>
          )}
        </div>

        {/* ══ FOOTER ══ */}
        <div className="imm-footer">
          <button
            type="button"
            className="imm-cancel-btn"
            onClick={handleClose}
            disabled={isSending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="imm-send-btn"
            onClick={handleSendInvites}
            disabled={isSending || emails.length === 0}
          >
            {isSending ? (
              <>
                <Loader2 size={16} className="wm-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>Send Invitations</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}