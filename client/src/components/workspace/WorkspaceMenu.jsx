import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAuthStore } from "../../stores/authStore";
import { workspaceAPI } from "../../services/api";
import toast from "react-hot-toast";
import { ChevronDown, Plus, Settings, LogIn, Check, MessageCircle, Sparkles, UserPlus, LogOut, Palette, Shield, BarChart3, CreditCard, Users } from 'lucide-react';
import Loader from '../shared/Loader';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────────────────── */

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, var(--accent-primary), var(--accent-purple))",
  "linear-gradient(135deg, var(--accent-yellow), var(--accent-red))",
  "linear-gradient(135deg, var(--accent-green), var(--accent-primary))",
  "linear-gradient(135deg, var(--accent-purple), var(--accent-pink, #ec4899))",
  "linear-gradient(135deg, var(--accent-cyan), var(--accent-primary))",
];

const HEADER_ORBS = [
  { left: "10%", top: "55%", size: 6, dur: "2.6s", delay: "0s" },
  { left: "28%", top: "18%", size: 4, dur: "3.3s", delay: ".7s" },
  { left: "56%", top: "68%", size: 5, dur: "2.9s", delay: "1.3s" },
  { left: "75%", top: "16%", size: 3, dur: "3.7s", delay: ".4s" },
  { left: "90%", top: "58%", size: 4, dur: "3.1s", delay: "1.0s" },
];

/* ─────────────────────────────────────────────────────────────────────────────
   CUSTOM HOOKS
   ───────────────────────────────────────────────────────────────────────────── */

function useClickOutside(ref, handler, enabled) {
  useEffect(() => {
    if (!enabled) return;
    const onMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) handler();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ref, handler, enabled]);
}

function useEscapeKey(handler, enabled) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") handler();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handler, enabled]);
}

/* ─────────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTS
   ───────────────────────────────────────────────────────────────────────────── */

const WorkspaceAvatar = memo(function WorkspaceAvatar({
  workspace,
  index,
  size,
  isActive,
}) {
  const style = {
    width: size,
    height: size,
    background: workspace?.logo
      ? `url(${workspace.logo}) center / cover`
      : AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length],
    fontSize: Math.round(size * 0.38),
  };

  return (
    <div
      className={`wm-avatar${isActive ? " wm-avatar--active" : ""}`}
      style={style}
      aria-hidden="true"
    >
      {!workspace?.logo && (workspace?.name?.charAt(0)?.toUpperCase() ?? "?")}
    </div>
  );
});

const DecorativeOrbs = memo(function DecorativeOrbs() {
  return (
    <>
      {HEADER_ORBS.map((o, i) => (
        <span
          key={i}
          className="wm-orb"
          aria-hidden="true"
          style={{
            left: o.left,
            top: o.top,
            width: o.size,
            height: o.size,
            "--dur": o.dur,
            "--delay": o.delay,
          }}
        />
      ))}
    </>
  );
});

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export default function WorkspaceMenu({
  onOpenCreate,
  onOpenJoin,
  onOpenSettings,
  onOpenInvite,
}) {
  const navigate = useNavigate();
  const { workspaces, activeWorkspace, activeWorkspaceId, isSwitching } =
    useWorkspaceStore();
  const { user } = useAuthStore();

  const [isOpen, setIsOpen] = useState(false);
  const [unread, setUnread] = useState({});
  const [isSigningOut, setIsSigningOut] = useState(false);

  const rootRef = useRef(null);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((o) => !o), []);

  useClickOutside(rootRef, close, isOpen);
  useEscapeKey(close, isOpen);

  // Fetch unread counts when dropdown opens
  useEffect(() => {
    if (!isOpen) return;
    import("../../services/api").then(({ workspaceAPI }) => {
      workspaceAPI
        .mine()
        .then(({ data }) => {
          const counts = {};
          (data.data?.workspaces || []).forEach((ws) => {
            if (ws._id !== activeWorkspaceId) {
              counts[ws._id] = ws.unreadCount || 0;
            }
          });
          setUnread(counts);
        })
        .catch(() => {});
    });
  }, [isOpen, activeWorkspaceId]);

  // Switch workspace
  const handleSwitch = useCallback(
    (id) => {
      if (id === activeWorkspaceId) {
        close();
        return;
      }
      close();
      navigate(`/workspace/${id}`);
    },
    [activeWorkspaceId, close, navigate],
  );

  // Wrap action handlers so dropdown closes before action
  const handleAction = useCallback(
    (fn) => {
      close();
      fn?.();
    },
    [close],
  );

  // Check if user can invite (owner or admin)
  const userRole = activeWorkspace?.role || user?.role;
  const canInvite  = ["owner", "admin"].includes(userRole);
  const canManage  = canInvite; // guests should not see workspace settings

  // Sign out handler
  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      const { authAPI } = await import("../../services/api");
      await authAPI.logout(useAuthStore.getState().refreshToken);
    } catch {
      // Silent fail - logout will still clear local state
    } finally {
      useAuthStore.getState().logout();
      navigate("/login");
    }
  }, [navigate]);

  // Unread dot on trigger
  const totalUnread = workspaces.reduce(
    (sum, ws) =>
      ws._id !== activeWorkspaceId ? sum + (unread[ws._id] ?? 0) : sum,
    0,
  );

  /* ── render ── */
  return (
    <div className="wm-root" ref={rootRef}>
      {/* ════════════════════════════════════════
          TRIGGER BUTTON
      ════════════════════════════════════════ */}
      <button
        className="wm-trigger"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Workspace: ${activeWorkspace?.name ?? "None"}. Click to open menu.`}
      >
        {/* Logo */}
        <span className="wm-trigger__logo-wrap">
          <img 
            src="/group2.svg" 
            alt="FlowTask" 
            className="wm-trigger__logo"
          />
        </span>

        {/* Workspace name */}
        <span className="wm-trigger__text">
          <span className="wm-trigger__name">
            {isSwitching ? "Switching…" : (activeWorkspace?.name ?? "")}
          </span>
        </span>

        {/* Animated chevron */}
        <span
          className={`wm-chevron${isOpen ? " wm-chevron--open" : ""}`}
          aria-hidden="true"
        >
          <ChevronDown size={13} strokeWidth={2.5} />
        </span>
      </button>

      {/* ════════════════════════════════════════
          DROPDOWN MENU
      ════════════════════════════════════════ */}
      {isOpen && (
        <div
          role="menu"
          aria-label="Workspace menu"
          className="wm-menu animate-fade-in-scale"
        >
          {/* ── Header gradient band with orbs ── */}
          <div className="wm-header-band">
            <DecorativeOrbs />
            <div className="wm-header-band__label">
              <Sparkles size={11} aria-hidden="true" />
              <span>FlowTask Workspace</span>
            </div>
            {activeWorkspace && (
              <div className="wm-header-band__workspace-name">
                {activeWorkspace.name}
              </div>
            )}
          </div>

          {/* ── Menu Items ── */}
          <div className="wm-list" role="group">
            {/* Invite People - only for owner/admin */}
            {canInvite && (
              <button
                role="menuitem"
                className="wm-menu-item wm-menu-item--primary"
                onClick={() => handleAction(onOpenInvite)}
              >
                <span className="wm-menu-item__icon">
                  <UserPlus size={16} />
                </span>
                <span className="wm-menu-item__text">
                  <span className="wm-menu-item__label">Invite People</span>
                </span>
              </button>
            )}

            {/* Preferences */}
            <button
              role="menuitem"
              className="wm-menu-item"
              onClick={() => handleAction(onOpenSettings)}
            >
              <span className="wm-menu-item__icon">
                <Settings size={16} />
              </span>
              <span className="wm-menu-item__text">
                <span className="wm-menu-item__label">Preferences</span>
              </span>
            </button>

            {/* Tools & Settings — hidden from guests */}
            {canManage && (
              <button
                role="menuitem"
                className="wm-menu-item"
                onClick={() => {
                  handleAction(() => navigate(`/workspace/${activeWorkspaceId}/tools`));
                }}
              >
                <span className="wm-menu-item__icon">
                  <Wrench size={16} />
                </span>
                <span className="wm-menu-item__text">
                  <span className="wm-menu-item__label">Tools & Settings</span>
                </span>
              </button>
            )}

            {/* Sign In On Mobile */}
            <button
              role="menuitem"
              className="wm-menu-item"
              onClick={() => {
                handleAction(() => {
                  toast.info("Mobile sign-in coming soon!");
                });
              }}
            >
              <span className="wm-menu-item__icon">
                <MessageCircle size={16} />
              </span>
              <span className="wm-menu-item__text">
                <span className="wm-menu-item__label">Sign In On Mobile</span>
              </span>
            </button>

            {/* Divider */}
            <div className="wm-divider" aria-hidden="true" />

            {/* Sign Out */}
            <button
              role="menuitem"
              className="wm-menu-item wm-menu-item--danger"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              <span className="wm-menu-item__icon">
                {isSigningOut ? (
                  <Loader size={16} />
                ) : (
                  <LogOut size={16} />
                )}
              </span>
              <span className="wm-menu-item__text">
                <span className="wm-menu-item__label">
                  {isSigningOut ? "Signing out..." : "Sign Out"}
                </span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}