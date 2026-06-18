import { useEffect, useRef } from "react";
import { useAuthStore } from "../../../stores/authStore";
import toast from "react-hot-toast";

export const PERMISSION_TOAST_MESSAGE =
  "You do not have permission to edit this canvas.";

// ── Pure Permission Helpers ──────────────────────────────────────────────────────

/**
 * Extract a user ID string from a field that may be a populated
 * object `{ _id, name, avatar }` or a plain ObjectId / string.
 */
export function extractUserId(field) {
  if (!field) return null;
  if (typeof field === "object" && field._id) return field._id.toString();
  return field.toString();
}

/**
 * Determine the current user's role on a canvas.
 * Priority: owner > editor > viewer > null (no access).
 */
export function getCanvasRole(canvas) {
  if (!canvas) return null;
  const currentUser = useAuthStore.getState().user;
  if (!currentUser) return null;
  const userId = currentUser._id?.toString();
  if (!userId) return null;

  // 1. Owner — full access, overrides ALL share settings
  const createdById = extractUserId(canvas.createdBy);
  if (createdById === userId) return "owner";

  // 2. Editor — explicit editor permission via share settings
  const users = canvas.permissions?.users || [];
  const userPerm = users.find((u) => u.userId?.toString() === userId);
  if (userPerm && userPerm.role === "editor") return "editor";

  // 3. Editor — via accessLevel "edit" (channel members can edit)
  if (canvas.permissions?.accessLevel === "edit") return "editor";

  // 4. Viewer — explicit viewer permission via share settings
  if (userPerm && userPerm.role === "viewer") return "viewer";

  // 5. Viewer — legacy allowedUserIds
  const legacyIds = canvas.permissions?.allowedUserIds || [];
  if (legacyIds.some((id) => id.toString() === userId)) return "viewer";

  // 6. Viewer — via accessLevel "view" (channel members can view)
  if (canvas.permissions?.accessLevel === "view") return "viewer";

  // 7. Viewer — via visibility "channel" or "workspace"
  const visibility = canvas.permissions?.visibility || "channel";
  if (visibility === "channel" || visibility === "workspace") return "viewer";

  // 8. No access — "invite_only" with no explicit permission
  return null;
}

/** Whether the current user may edit the canvas content. */
export function canEditCanvas(canvas) {
  const role = getCanvasRole(canvas);
  return role === "owner" || role === "editor";
}

/** Whether the current user may delete the canvas (owner only). */
export function canDeleteCanvas(canvas) {
  const role = getCanvasRole(canvas);
  return role === "owner";
}

// ── Permission Enforcement Hook ──────────────────────────────────────────────────

/**
 * Manages read-only enforcement for a canvas editor.
 *
 * Responsibilities:
 *  1. Sets `editor.setEditable(false)` for viewers / historical versions.
 *  2. Shows a one-time toast when the user lacks edit permission.
 *  3. Blocks keydown / paste / drop / input events at the DOM level.
 *
 * @param {Object}  canvas          - The canvas document (from store / props).
 * @param {Editor|null} editor      - TipTap editor instance.
 * @param {boolean} viewingVersion  - Whether the user is viewing a historical version.
 * @returns {{ isViewOnly: boolean, canvasRole: string|null }}
 */
export function useCanvasPermissions(canvas, editor, viewingVersion) {
  const isViewOnly = !canEditCanvas(canvas);
  const canvasRole = getCanvasRole(canvas);
  const permissionToastShownRef = useRef(false);

  // ── 1. Editor editable state + toast ───────────────────────────────────────────
  useEffect(() => {
    if (!editor) return;
    if (isViewOnly) {
      editor.setEditable(false);
      if (!permissionToastShownRef.current) {
        permissionToastShownRef.current = true;
        toast.error(PERMISSION_TOAST_MESSAGE, { duration: 4000 });
      }
    } else if (!viewingVersion) {
      editor.setEditable(true);
    }
  }, [editor, isViewOnly, viewingVersion]);

  // Reset toast flag when canvas changes so it fires once per canvas.
  useEffect(() => {
    permissionToastShownRef.current = false;
  }, [canvas?._id]);

  // ── 2. DOM-level event blocking ────────────────────────────────────────────────
  useEffect(() => {
    if (!editor || !isViewOnly) return;
    const dom = editor.view?.dom;
    if (!dom) return;

    const blockKeyDown = (e) => {
      // Allow Tab key for accessibility
      if (e.key === "Tab") return;
      // Allow Ctrl+C / Cmd+C for copy
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") return;
      e.preventDefault();
      e.stopPropagation();
      if (!permissionToastShownRef.current) {
        permissionToastShownRef.current = true;
        toast.error(PERMISSION_TOAST_MESSAGE, { duration: 3000 });
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
  }, [editor, isViewOnly]);

  return {
    isViewOnly,
    canvasRole,
    permissionToastShownRef,
    PERMISSION_TOAST_MESSAGE,
  };
}

export default useCanvasPermissions;
