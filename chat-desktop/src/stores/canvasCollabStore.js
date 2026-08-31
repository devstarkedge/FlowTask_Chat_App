/**
 * canvasCollabStore.js — Zustand store for real-time collaboration state.
 *
 * Owns: presence (users in room), cursors (cursor positions), typing (per-block indicators).
 * Separated from canvasStore (data/CRUD) for clean domain boundaries.
 */
import { create } from "zustand";
import { getSocket } from "../services/socket";
import { useAuthStore } from "./authStore";
import { useCanvasUiStore } from "./canvasUiStore";
import { useCanvasStore } from "./canvasStore";

const USER_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];

function getUserColor(userId) {
  if (!userId) return USER_COLORS[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash << 5) - hash + userId.charCodeAt(i);
  const idx = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[idx];
}

export const useCanvasCollabStore = create((set, get) => ({
  // ── State ────────────────────────────────────────────────────────
  presence: [],
  cursors: {},
  typing: {},

  // ── Actions ──────────────────────────────────────────────────────

  /** Replace the full presence list (from socket canvas:presence:list) */
  setPresence: (users) => set({ presence: users }),

  /** Add a user to presence (from socket canvas:presence:join) */
  addPresenceUser: (user) =>
    set((state) => {
      if (state.presence.some((p) => p.userId === user.userId)) return {};
      return { presence: [...state.presence, user] };
    }),

  /** Remove a user from presence + clear their cursor (canvas:presence:leave) */
  removePresenceUser: (userId) =>
    set((state) => {
      const nextCursors = { ...state.cursors };
      delete nextCursors[userId];
      return {
        presence: state.presence.filter((p) => p.userId !== userId),
        cursors: nextCursors,
      };
    }),

  /** Update a remote user's cursor position (canvas:cursor:update) */
  setRemoteCursor: (userId, name, blockId, x, y) =>
    set((state) => ({
      cursors: {
        ...state.cursors,
        [userId]: { blockId, x, y, name, color: getUserColor(userId) },
      },
    })),

  /** Update per-block typing state for a remote user (canvas:typing:update) */
  setRemoteTyping: (userId, name, blockId, isTyping) =>
    set((state) => {
      const blockTyping = { ...(state.typing[blockId] || {}) };
      if (isTyping) blockTyping[userId] = name;
      else delete blockTyping[userId];
      return { typing: { ...state.typing, [blockId]: blockTyping } };
    }),

  // ── Client-triggered actions (also emit via socket) ──────────────

  /** Emit local user's cursor position + update local state */
  updateCursor: (blockId, x, y) => {
    const socket = getSocket();
    const canvasId = useCanvasStore.getState().currentJoinedRoom;
    const currentUserId = useAuthStore.getState().user?._id;

    set((state) => ({
      cursors: {
        ...state.cursors,
        [currentUserId]: {
          blockId,
          x,
          y,
          name: useAuthStore.getState().user?.name || "You",
          color: getUserColor(currentUserId),
        },
      },
    }));

    const providerStatus = useCanvasUiStore.getState().providerStatus;
    if (socket && canvasId && !(providerStatus === "connected" || providerStatus === "synced")) {
      socket.emit("canvas:cursor", { canvasId, blockId, x, y });
    }
  },

  /** Emit local user's typing state + update local state */
  setBlockTyping: (blockId, isTyping) => {
    const socket = getSocket();
    const canvasId = useCanvasStore.getState().currentJoinedRoom;
    const currentUserId = useAuthStore.getState().user?._id;

    set((state) => {
      const blockTyping = { ...(state.typing[blockId] || {}) };
      if (isTyping) blockTyping[currentUserId] = useAuthStore.getState().user?.name || "You";
      else delete blockTyping[currentUserId];
      return { typing: { ...state.typing, [blockId]: blockTyping } };
    });

    const providerStatus = useCanvasUiStore.getState().providerStatus;
    if (socket && canvasId && !(providerStatus === "connected" || providerStatus === "synced")) {
      socket.emit("canvas:typing", { canvasId, blockId, isTyping });
    }
  },

  /** Reset all collab state (on canvas unload) */
  resetCollab: () => set({ presence: [], cursors: {}, typing: {} }),
}));
