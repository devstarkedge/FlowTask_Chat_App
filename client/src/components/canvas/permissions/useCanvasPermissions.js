import { useEffect, useRef, useMemo, useCallback } from "react";
import { useAuthStore } from "../../../stores/authStore";
import toast from "react-hot-toast";

// ── Toast Throttling ──────────────────────────────────────────────────────────
export const PERMISSION_TOAST_MESSAGE =
  "You do not have permission to edit this canvas.";

let lastPermissionToastTime = 0;
const PERMISSION_TOAST_COOLDOWN_MS = 3000;

/**
 * Show a throttled permission-denied toast (at most once every 3 seconds globally).
 * Only fires when user ATTEMPTS an action (typing, deleting, formatting, uploading).
 * Does NOT fire on initial load.
 */
export function showPermissionToast() {
  const now = Date.now();
  if (now - lastPermissionToastTime < PERMISSION_TOAST_COOLDOWN_MS) return;
  lastPermissionToastTime = now;
  toast.error(PERMISSION_TOAST_MESSAGE, { duration: 3000 });
}

// ── Helper ────────────────────────────────────────────────────────────────────
function extractUserId(field) {
  if (!field) return null;
  if (typeof field === "object" && field._id) return field._id.toString();
  return field.toString();
}

function isChannelPublic(channel) {
  if (!channel) return false;
  return (
    channel.visibility === "public" ||
    channel.type === "public" ||
    (!channel.visibility && channel.type !== "private" && channel.type !== "dm")
  );
}

// ── CENTRALIZED PERMISSION RESOLVER ───────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for all canvas permission decisions on the frontend.
// Every UI component MUST consume this.
//
// Resolution hierarchy:
//   1. Canvas Owner → full access
//   2. Channel Owner/Admin → edit access (but cannot delete)
//   3. Public Channel Member → edit access
//   4. Private Channel Member with toggle ON → edit access
//   5. Private Channel Member with toggle OFF → view-only
//   6. Explicit share permissions → editor or viewer
//   7. Non-member → no access

export function getCanvasPermissions({
  user,
  canvas,
  channel,
  isChannelMember = false,
  channelRole = null,
}) {
  // Default: no access
  const result = {
    canView: false,
    canEdit: false,
    canDelete: false,
    canComment: false,
    canShare: false,
    canManagePermissions: false,
    role: null,
    isViewOnly: true,
  };

  if (!user || !canvas) return result;

  const userId = extractUserId(user._id || user.id);
  if (!userId) return result;

  const ownerId = extractUserId(canvas.createdBy);
  const isCanvasOwner = ownerId === userId;

  // ── Canvas Owner ─────────────────────────────────────────────────────
  if (isCanvasOwner) {
    result.canView = true;
    result.canEdit = true;
    result.canDelete = true;
    result.canComment = true;
    result.canShare = true;
    result.canManagePermissions = true;
    result.role = "owner";
    result.isViewOnly = false;
    return result;
  }

  // ── Check explicit share permissions ────────────────────────────────
  const users = canvas.permissions?.users || [];
  const userPerm = users.find((u) => extractUserId(u.userId) === userId);
  const hasEditorPerm = userPerm?.role === "editor";
  const hasViewerPerm = userPerm?.role === "viewer";

  // Legacy allowedUserIds
  const legacyIds = canvas.permissions?.allowedUserIds || [];
  const hasLegacyAccess = legacyIds.some((id) => extractUserId(id) === userId);

  // ── No channel context → fall back to explicit permissions only ──────
  if (!channel) {
    if (hasEditorPerm) {
      result.canView = true;
      result.canEdit = true;
      result.canComment = true;
      result.canShare = true;
      result.role = "editor";
      result.isViewOnly = false;
      return result;
    }
    if (hasViewerPerm || hasLegacyAccess) {
      result.canView = true;
      result.canEdit = false;
      result.canComment = true;
      result.role = "viewer";
      result.isViewOnly = true;
      return result;
    }
    return result;
  }

  // ── Non-member ───────────────────────────────────────────────────────
  if (!isChannelMember && !hasEditorPerm && !hasViewerPerm && !hasLegacyAccess) {
    return result;
  }

  // ── Channel Owner/Admin ──────────────────────────────────────────────
  if (channelRole === "owner" || channelRole === "admin") {
    result.canView = true;
    result.canEdit = true;
    result.canDelete = false;
    result.canComment = true;
    result.canShare = true;
    result.canManagePermissions = true;
    result.role = "editor";
    result.isViewOnly = false;
    return result;
  }

  // ── Public Channel ───────────────────────────────────────────────────
  if (isChannelPublic(channel)) {
    result.canView = true;
    result.canEdit = true;
    result.canComment = true;
    result.canShare = true;
    result.role = "editor";
    result.isViewOnly = false;
    return result;
  }

  // ── Private Channel ──────────────────────────────────────────────────
  const allowEdit = channel.allowAllMembersEditCanvas !== false;

  if (allowEdit) {
    result.canView = true;
    result.canEdit = true;
    result.canComment = true;
    result.canShare = true;
    result.role = "editor";
    result.isViewOnly = false;
    return result;
  }

  // Toggle OFF
  result.canView = true;
  result.canEdit = false;
  result.canComment = true;
  result.role = "viewer";
  result.isViewOnly = true;
  return result;
}

// ── REACT HOOK ─────────────────────────────────────────────────────────────────

/**
 * useCanvasPermissions — Centralized permission hook for all canvas areas.
 *
 * Resolves permissions using the single source of truth (getCanvasPermissions).
 *
 * @param {Object}  canvas           - Canvas document
 * @param {Object}  [channel]        - Channel document (optional, fetched if not provided)
 * @param {Object}  [editor]         - TipTap editor instance (for read-only mode)
 * @param {boolean} [viewingVersion] - Whether viewing a historical version
 * @param {boolean} [isChannelMember]- Whether user is a channel member
 * @param {string}  [channelRole]    - User's channel role
 * @returns {{
 *   canView: boolean,
 *   canEdit: boolean,
 *   canDelete: boolean,
 *   canComment: boolean,
 *   canShare: boolean,
 *   canManagePermissions: boolean,
 *   role: string|null,
 *   isViewOnly: boolean,
 *   permissionToastShownRef: React.MutableRefObject<boolean>,
 *   PERMISSION_TOAST_MESSAGE: string,
 * }}
 */
export function useCanvasPermissions(
  canvas,
  channel = null,
  editor = null,
  viewingVersion = false,
  isChannelMember = false,
  channelRole = null,
) {
  const user = useAuthStore((s) => s.user);

  // Resolve permissions using the centralized pure function
  const permissions = useMemo(
    () =>
      getCanvasPermissions({
        user,
        canvas,
        channel,
        isChannelMember,
        channelRole,
      }),
    [user, canvas, channel, isChannelMember, channelRole],
  );

  const permissionToastShownRef = useRef(false);

  // ── 1. Editor editable state ──────────────────────────────────────────────
  useEffect(() => {
    if (!editor) return;
    if (permissions.isViewOnly) {
      editor.setEditable(false);
    } else if (!viewingVersion) {
      editor.setEditable(true);
    }
  }, [editor, permissions.isViewOnly, viewingVersion]);

  // Reset toast flag when canvas changes
  useEffect(() => {
    permissionToastShownRef.current = false;
  }, [canvas?._id]);

  // ── 2. DOM-level event blocking (only blocks on EDIT ATTEMPTS, not on load) ─┈
  useEffect(() => {
    if (!editor || !permissions.isViewOnly) return;
    const dom = editor.view?.dom;
    if (!dom) return;

    const blockKeyDown = (e) => {
      // Allow Tab key for accessibility
      if (e.key === "Tab") return;
      // Allow Ctrl+C / Cmd+C for copy
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") return;
      // Allow navigation keys
      const navKeys = [
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
        "Home", "End", "PageUp", "PageDown",
        "Control", "Shift", "Alt", "Meta",
      ];
      if (navKeys.includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();
      if (!permissionToastShownRef.current) {
        permissionToastShownRef.current = true;
        showPermissionToast();
      }
    };

    const blockEvent = (e) => {
      e.preventDefault();
    };

    dom.addEventListener("keydown", blockKeyDown, true);
    dom.addEventListener("paste", blockEvent, true);
    dom.addEventListener("drop", blockEvent, true);
    dom.addEventListener("input", blockEvent, true);

    return () => {
      dom.removeEventListener("keydown", blockKeyDown, true);
      dom.removeEventListener("paste", blockEvent, true);
      dom.removeEventListener("drop", blockEvent, true);
      dom.removeEventListener("input", blockEvent, true);
    };
  }, [editor, permissions.isViewOnly]);

  return {
    ...permissions,
    permissionToastShownRef,
    PERMISSION_TOAST_MESSAGE,
  };
}

export default useCanvasPermissions;