import { create } from "zustand";
import { canvasAPI } from "../services/api";
import { getSocket } from "../services/socket";
import { useAuthStore } from "./authStore";
import { useCanvasUiStore } from "./canvasUiStore";
import toast from "react-hot-toast";
import React from "react";
// Simple helpers
const USER_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];
function getUserColor(userId) {
  if (!userId) return USER_COLORS[0];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash << 5) - hash + userId.charCodeAt(i);
  const idx = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[idx];
}

// Load persisted open-tabs (lightweight UI state only)
function loadPersistedOpenTabs() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem("flowtask.canvas.openTabs.v1") || localStorage.getItem("canvas_open_tabs");
    if (!raw) return {};
    const parsed = JSON.parse(raw) || {};
    return Object.fromEntries(
      Object.entries(parsed).map(([channelId, list]) => [channelId, (list || []).map((c) => ({ _id: c._id, title: c.title }))])
    );
  } catch (e) {
    return {};
  }
}

// Persist only lightweight UI state for open tabs (id + title). Do NOT store
// full canvas metadata, content, permissions, or collaborators in localStorage.
function persistOpenTabs(tabs) {
  try {
    if (typeof localStorage === "undefined") return;
    const sanitized = Object.fromEntries(
      Object.entries(tabs || {}).map(([channelId, list]) => [channelId, (list || []).map((c) => ({ _id: c._id, title: c.title }))])
    );
    // Versioned key for future migrations
    localStorage.setItem("flowtask.canvas.openTabs.v1", JSON.stringify(sanitized));
    // Keep legacy key for compatibility (reads prefer the new key first)
    localStorage.setItem("canvas_open_tabs", JSON.stringify(sanitized));
  } catch (e) {
    // ignore
  }
}
export const useCanvasStore = create((set, get) => ({
  // Store state
  isLoading: false,
  canvasesByChannel: {},
  activeCanvas: null,
  blocks: [],
  comments: [],
  presence: [],
  cursors: {},
  typing: {},
  history: [],
  currentJoinedRoom: null,
  activeCanvasIdByChannel: {},
  openTabsByChannel: loadPersistedOpenTabs(),
  // Whether we've attached global socket listeners (idempotent)
  globalSocketAttached: false,
  lastDeletedCanvas: null,

  // ── Load specific canvas details (REST)
  loadCanvas: async (canvasId) => {
    set({ isLoading: true });
    try {
      // Clean up previous room if any
      const currentRoom = get().currentJoinedRoom;
      if (currentRoom && currentRoom !== canvasId) {
        get().leaveCanvasRoom(currentRoom);
      }

      const res = await canvasAPI.getById(canvasId);
      if (res.data && res.data.success) {
        const { canvas, blocks, comments } = res.data.data;

        // Sort blocks by order
        const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

        set((state) => ({
          activeCanvas: canvas,
          blocks: sortedBlocks,
          comments: comments || [],
          presence: [],
          cursors: {},
          typing: {},
          activeCanvasIdByChannel: {
            ...state.activeCanvasIdByChannel,
            [canvas.channelId]: canvas._id,
          },
        }));

        // Join room for the newly loaded canvas
        get().joinCanvasRoom(canvasId);
        // Ensure global listeners are attached too
        get().ensureGlobalSocketListeners?.();
      }
    } catch (err) {
      console.error("[CanvasStore] loadCanvas error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Create Canvas
  createCanvas: async (channelId, payload) => {
    set({ isLoading: true });
    try {
      const res = await canvasAPI.create(channelId, payload);
      if (res.data && res.data.success) {
        const newCanvas = res.data.data;
        set((state) => ({
          activeCanvas: newCanvas,
          activeCanvasIdByChannel: { ...state.activeCanvasIdByChannel, [channelId]: newCanvas._id },
          blocks: [],
        }));

        // Load the created canvas to attach sockets/providers
        await get().loadCanvas(newCanvas._id);
        return newCanvas;
      }
    } catch (err) {
      console.error("[CanvasStore] createCanvas error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Update canvas metadata (title, cover, content pointer, etc.)
  updateCanvasMetadata: async (canvasId, updates) => {
    try {
      const res = await canvasAPI.update(canvasId, updates);
      if (res.data && res.data.success) {
        const updated = res.data.data;
        set((state) => {
          const active = state.activeCanvas && state.activeCanvas._id === canvasId ? { ...state.activeCanvas, ...updated } : state.activeCanvas;
          const channelId = updated.channelId || (state.activeCanvas && state.activeCanvas.channelId) || null;
          const nextCanvases = { ...state.canvasesByChannel };
          if (channelId) {
            nextCanvases[channelId] = (nextCanvases[channelId] || []).map((c) => (c._id === canvasId ? updated : c));
          }
          return { activeCanvas: active, canvasesByChannel: nextCanvases };
        });
        return updated;
      }
    } catch (err) {
      console.error("[CanvasStore] updateCanvasMetadata error:", err);
    }
  },

  // ── Duplicate Canvas
  duplicateCanvas: async (canvasId) => {
    set({ isLoading: true });
    try {
      const res = await canvasAPI.duplicate(canvasId);
      if (res.data && res.data.success) {
        const dup = res.data.data;
        const channelId = dup.channelId;

        set((state) => {
          const list = state.canvasesByChannel[channelId] || [];
          return {
            canvasesByChannel: {
              ...state.canvasesByChannel,
              [channelId]: [...list, dup],
            },
          };
        });

        // Load duplicated canvas
        await get().loadCanvas(dup._id);
        return dup;
      }
    } catch (err) {
      console.error("[CanvasStore] duplicateCanvas error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Delete Canvas (optimistic + undo)
  // deleteCanvas: async (canvasId) => {
  //   // Optimistic deletion with Undo support.
  //   try {
  //     const state = get();

  //     // Find canvas metadata and channel
  //     let found = null;
  //     let foundChannel = null;
  //     Object.keys(state.canvasesByChannel || {}).forEach((chId) => {
  //       const list = state.canvasesByChannel[chId] || [];
  //       const match = list.find((c) => c._id === canvasId);
  //       if (match) {
  //         found = match;
  //         foundChannel = chId;
  //       }
  //     });

  //     // If not present locally, attempt to fetch details for snapshot
  //     let snapshot = null;
  //     if (found) {
  //       snapshot = { canvas: found, blocks: null };
  //     } else {
  //       try {
  //         const details = await canvasAPI.getById(canvasId);
  //         if (details.data && details.data.success) {
  //           snapshot = { canvas: details.data.data.canvas, blocks: details.data.data.blocks };
  //           foundChannel = details.data.data.canvas.channelId;
  //         }
  //       } catch (err) {
  //         // ignore; proceed without rich snapshot
  //       }
  //     }

  //     // Persist snapshot in store for possible Undo
  //     set({ lastDeletedCanvas: snapshot });

  //     // Optimistically remove the canvas from client state
  //     set((state) => {
  //       const nextCanvases = { ...state.canvasesByChannel };
  //       Object.keys(nextCanvases).forEach((chId) => {
  //         nextCanvases[chId] = (nextCanvases[chId] || []).filter((c) => c._id !== canvasId);
  //       });

  //       const activeIdMap = { ...state.activeCanvasIdByChannel };
  //       Object.keys(activeIdMap).forEach((chId) => {
  //         if (activeIdMap[chId] === canvasId) delete activeIdMap[chId];
  //       });

  //       const active = state.activeCanvas && state.activeCanvas._id === canvasId ? null : state.activeCanvas;

  //       return {
  //         canvasesByChannel: nextCanvases,
  //         activeCanvas: active,
  //         activeCanvasIdByChannel: activeIdMap,
  //       };
  //     });

  //     // Show undo toast (use createElement to avoid JSX in .js file)
  //     const undoId = toast((t) =>
  //       React.createElement(
  //         "div",
  //         { style: { display: "flex", gap: 12, alignItems: "center" } },
  //         React.createElement("div", null, "Canvas deleted"),
  //         React.createElement(
  //           "div",
  //           { style: { marginLeft: 8 } },
  //           React.createElement(
  //             "button",
  //             {
  //               onClick: async () => {
  //                 toast.dismiss(t.id);
  //                 // Attempt to recreate the canvas using snapshot
  //                 const snap = get().lastDeletedCanvas;
  //                 if (!snap || !foundChannel) return;
  //                 try {
  //                   const createPayload = {
  //                     title: snap.canvas.title,
  //                     type: snap.canvas.type,
  //                     content: snap.canvas.content || undefined,
  //                     cover: snap.canvas.cover || undefined,
  //                   };
  //                   const res = await canvasAPI.create(foundChannel, createPayload);
  //                   if (res.data && res.data.success) {
  //                     const newCanvas = res.data.data;
  //                     // Insert recreated canvas into list and load it
  //                     set((s) => {
  //                       const list = s.canvasesByChannel[foundChannel] || [];
  //                       return { canvasesByChannel: { ...s.canvasesByChannel, [foundChannel]: [...list, newCanvas] } };
  //                     });
  //                     await get().loadCanvas(newCanvas._id);
  //                     // clear snapshot
  //                     set({ lastDeletedCanvas: null });
  //                     toast.success("Canvas restored");
  //                   }
  //                 } catch (err) {
  //                   console.error("Undo recreate failed", err);
  //                   toast.error("Failed to restore canvas");
  //                 }
  //               },
  //               style: { padding: "6px 10px", borderRadius: 8, background: "var(--bg-primary)", border: "1px solid var(--border-primary)", color: "var(--text-primary)", cursor: "pointer" },
  //             },
  //             "Undo"
  //           )
  //         )
  //       ),
  //       { duration: 8000 }
  //     );

  //     // Fire server deletion (do not await restore)
  //     (async () => {
  //       try {
  //         await canvasAPI.delete(canvasId);
  //       } catch (err) {
  //         console.error("[CanvasStore] deleteCanvas error:", err);
  //         // Attempt to revert to snapshot if available
  //         const snap = get().lastDeletedCanvas;
  //         if (snap && foundChannel) {
  //           set((s) => ({ canvasesByChannel: { ...s.canvasesByChannel, [foundChannel]: [...(s.canvasesByChannel[foundChannel] || []), snap.canvas] }, lastDeletedCanvas: null }));
  //           toast.error("Failed to delete canvas. Restored locally.");
  //         }
  //       }
  //     })();

  //     return true;
  //   } catch (err) {
  //     console.error("[CanvasStore] deleteCanvas error:", err);
  //     return false;
  //   }
  // },

  // ── Fetch snapshots (History)
  fetchHistory: async (canvasId) => {
    try {
      const res = await canvasAPI.getHistory(canvasId);
      if (res.data && res.data.success) {
        set({ history: res.data.data });
      }
    } catch (err) {
      console.error("[CanvasStore] fetchHistory error:", err);
    }
  },

  // ── Fetch canvases for a channel and cache locally
  fetchChannelCanvases: async (channelId) => {
    if (!channelId) return [];
    set({ isLoading: true });
    try {
      const res = await canvasAPI.getAllForChannel(channelId);
      const list = res.data?.data || [];
      set((state) => ({ canvasesByChannel: { ...state.canvasesByChannel, [channelId]: list } }));
      return list;
    } catch (err) {
      console.error("[CanvasStore] fetchChannelCanvases error:", err);
      return [];
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Load a default canvas for a channel (used on initial channel open)
  loadDefaultCanvas: async (channelId) => {
    if (!channelId) return;
    set({ isLoading: true });
    try {
      // Prefer cached list
      let list = get().canvasesByChannel[channelId] || [];
      if (!list || list.length === 0) {
        try {
          list = await get().fetchChannelCanvases(channelId) || [];
        } catch (e) {
          list = [];
        }
      }

      if (list && list.length > 0) {
        const preferred = get().activeCanvasIdByChannel[channelId] || list[0]._id;
        await get().loadCanvas(preferred);
      } else {
        // Nothing to load; clear any active canvas for this channel
        set({ activeCanvas: null });
      }
    } catch (err) {
      console.error("[CanvasStore] loadDefaultCanvas error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Open tabs (shared across clients) ───────────────────────────────────
  addOpenTab: async (channelId, canvasMeta) => {
    if (!channelId || !canvasMeta || !canvasMeta._id) return;
    set((state) => {
      const list = state.openTabsByChannel[channelId] || [];
      if (list.some((c) => c._id === canvasMeta._id)) return {};
      const minimal = { _id: canvasMeta._id, title: canvasMeta.title || "" };
      return {
        openTabsByChannel: {
          ...state.openTabsByChannel,
          [channelId]: [...list, minimal],
        },
      };
    });

    // Persist local view and emit update to server with minimal metadata
    try {
      persistOpenTabs(get().openTabsByChannel);
    } catch (e) {
      // ignore
    }

    try {
      const socket = getSocket();
      if (socket) {
        const tabs = get().openTabsByChannel[channelId]?.map((c) => ({ _id: c._id, title: c.title })) || [];
        socket.emit("canvas:tabs:update", { channelId, tabs });
      }
    } catch (err) {
      // ignore
    }
  },

  removeOpenTab: async (channelId, canvasId) => {
    if (!channelId || !canvasId) return;
    set((state) => ({
      openTabsByChannel: {
        ...state.openTabsByChannel,
        [channelId]: (state.openTabsByChannel[channelId] || []).filter((c) => c._id !== canvasId),
      },
    }));

    // Persist and notify server
    try {
      persistOpenTabs(get().openTabsByChannel);
    } catch (e) {
      // ignore
    }

    try {
      const socket = getSocket();
      if (socket) {
        const tabs = get().openTabsByChannel[channelId]?.map((c) => ({ _id: c._id, title: c.title })) || [];
        socket.emit("canvas:tabs:update", { channelId, tabs });
      }
    } catch (err) {
      // ignore
    }
  },

  setOpenTabs: (channelId, tabs) => {
    set((state) => {
      const sanitized = (tabs || []).map((c) => ({ _id: c._id, title: c.title }));
      const next = { ...state.openTabsByChannel, [channelId]: sanitized };
      try {
        persistOpenTabs(next);
      } catch (e) {}
      return { openTabsByChannel: next };
    });
  },

  requestChannelTabs: (channelId) => {
    try {
      // Ensure global listeners are attached so we can receive the response
      get().ensureGlobalSocketListeners?.();
      const socket = getSocket();
      if (socket && channelId) socket.emit("canvas:tabs:request", { channelId });
    } catch (err) {
      // ignore
    }
  },

  // Attach global socket listeners once per client session.
  ensureGlobalSocketListeners: () => {
    const socket = getSocket();
    if (!socket) return;
    if (get().globalSocketAttached) return;

    // Server sends authoritative state for a channel
    socket.on('canvas:tabs:state', ({ channelId, tabs }) => {
      if (!channelId) return;
      try {
        // Normalize incoming tab metadata
        const normalized = Array.isArray(tabs) ? tabs.map((t) => ({ _id: t._id || t.canvasId || t.id, title: t.title || '' })).filter(Boolean) : [];
        get().setOpenTabs(channelId, normalized);
      } catch (err) {
        // best-effort
      }
    });

    // Broadcast updates when another member changes the tabs
    socket.on('canvas:tabs:updated', ({ channelId, tabs }) => {
      if (!channelId) return;
      try {
        const normalized = Array.isArray(tabs) ? tabs.map((t) => ({ _id: t._id || t.canvasId || t.id, title: t.title || '' })).filter(Boolean) : [];
        get().setOpenTabs(channelId, normalized);
      } catch (err) {
        // best-effort
      }
    });

    set({ globalSocketAttached: true });
  },

  // ── Restore Snapshot Version
  restoreVersion: async (canvasId, historyId) => {
    set({ isLoading: true });
    try {
      const res = await canvasAPI.restoreVersion(canvasId, historyId);
      if (res.data && res.data.success) {
        // Re-load canvas to refresh blocks, comments, and structure
        await get().loadCanvas(canvasId);
      }
    } catch (err) {
      console.error("[CanvasStore] restoreVersion error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Clear active canvas state entirely (e.g. on leave tab)
  clearActiveCanvas: () => {
    const currentRoom = get().currentJoinedRoom;
    if (currentRoom) {
      get().leaveCanvasRoom(currentRoom);
    }
    set({
      activeCanvas: null,
      blocks: [],
      comments: [],
      presence: [],
      cursors: {},
      typing: {},
      history: [],
      currentJoinedRoom: null,
    });
  },

  // ── Websocket Room Handlers
  joinCanvasRoom: (canvasId) => {
    const socket = getSocket();
    if (!socket || !canvasId) return;

    // Avoid re-joining same room
    if (get().currentJoinedRoom === canvasId) return;

    // Leave prior room if present
    const prev = get().currentJoinedRoom;
    if (prev && prev !== canvasId) {
      try {
        get().leaveCanvasRoom(prev);
      } catch (e) {
        // ignore
      }
    }

    socket.emit("canvas:join", { canvasId });
    set({ currentJoinedRoom: canvasId });

    // Build handlers so we can remove them individually on leave
    socket._canvasHandlers = socket._canvasHandlers || {};
    const handlers = {};

    handlers.presenceList = ({ canvasId: cid, users }) => {
      if (cid !== get().currentJoinedRoom) return;
      set({ presence: users });
    };

    handlers.presenceJoin = ({ canvasId: cid, user }) => {
      if (cid !== get().currentJoinedRoom) return;
      set((state) => {
        if (state.presence.some((p) => p.userId === user.userId)) return {};
        return { presence: [...state.presence, user] };
      });
    };

    handlers.presenceLeave = ({ canvasId: cid, userId }) => {
      if (cid !== get().currentJoinedRoom) return;
      set((state) => {
        const nextCursors = { ...state.cursors };
        delete nextCursors[userId];
        return {
          presence: state.presence.filter((p) => p.userId !== userId),
          cursors: nextCursors,
        };
      });
    };

    handlers.cursorUpdate = ({ userId, name, blockId, x, y }) => {
      set((state) => ({
        cursors: {
          ...state.cursors,
          [userId]: { blockId, x, y, name, color: getUserColor(userId) },
        },
      }));
    };

    handlers.typingUpdate = ({ userId, name, blockId, isTyping }) => {
      set((state) => {
        const blockTyping = { ...(state.typing[blockId] || {}) };
        if (isTyping) blockTyping[userId] = name;
        else delete blockTyping[userId];
        return { typing: { ...state.typing, [blockId]: blockTyping } };
      });
    };

    handlers.blockCreated = (newBlock) => {
      // If Yjs collaboration is active, the CRDT will drive document structure.
      // Ignore socket-driven block creation to avoid conflicts and duplicates.
      const providerStatus = useCanvasUiStore.getState().providerStatus;
      if (providerStatus === 'connected' || providerStatus === 'synced') return;

      set((state) => ({ blocks: [...state.blocks, newBlock].sort((a, b) => a.order - b.order) }));
    };

    handlers.blockUpdated = ({ blockId, content, type, lastEditedBy }) => {
      const currentUserId = useAuthStore.getState().user?._id;
      // If collaboration is active, do not let socket updates override CRDT-managed content.
      const providerStatus = useCanvasUiStore.getState().providerStatus;
      if (providerStatus === 'connected' || providerStatus === 'synced') {
        // Still update metadata safely (type/lastEditedBy) but avoid replacing content.
        set((state) => ({
          blocks: state.blocks.map((b) => (b._id === blockId ? { ...b, type: type ?? b.type, lastEditedBy: lastEditedBy ?? b.lastEditedBy } : b)),
        }));
        return;
      }

      if (lastEditedBy === currentUserId) return;
      set((state) => ({ blocks: state.blocks.map((b) => (b._id === blockId ? { ...b, content, type } : b)) }));
    };

    handlers.blockDeleted = ({ blockId }) => {
      const providerStatus = useCanvasUiStore.getState().providerStatus;
      if (providerStatus === 'connected' || providerStatus === 'synced') return;
      set((state) => ({ blocks: state.blocks.filter((b) => b._id !== blockId), comments: state.comments.filter((c) => c.blockId !== blockId) }));
    };

    handlers.blockReordered = ({ blockIdsOrder }) => {
      const providerStatus = useCanvasUiStore.getState().providerStatus;
      if (providerStatus === 'connected' || providerStatus === 'synced') return;
      set((state) => {
        const blocksMap = new Map(state.blocks.map((b) => [b._id, b]));
        const reordered = blockIdsOrder.map((id) => blocksMap.get(id)).filter(Boolean);
        state.blocks.forEach((b) => { if (!blockIdsOrder.includes(b._id)) reordered.push(b); });
        return { blocks: reordered };
      });
    };

    handlers.reactionUpdated = ({ blockId, reactions }) => {
      set((state) => ({ blocks: state.blocks.map((b) => (b._id === blockId ? { ...b, reactions } : b)) }));
    };

    handlers.commentCreated = (populatedComment) => { set((state) => ({ comments: [...state.comments, populatedComment] })); };
    handlers.commentReplied = (populatedComment) => { set((state) => ({ comments: state.comments.map((c) => (c._id === populatedComment._id ? populatedComment : c)) })); };
    handlers.commentResolved = ({ commentId }) => { set((state) => ({ comments: state.comments.filter((c) => c._id !== commentId) })); };

    handlers.restored = ({ canvasId: cid }) => { if (cid !== get().currentJoinedRoom) return; get().loadCanvas(cid); };
    handlers.updated = ({ canvasId: cid, updates }) => { if (cid !== get().currentJoinedRoom) return; set((state) => ({ activeCanvas: state.activeCanvas && state.activeCanvas._id === cid ? { ...state.activeCanvas, ...updates } : state.activeCanvas })); };
    handlers.deleted = ({ canvasId: cid }) => {
      set((state) => {
        const nextCanvases = { ...state.canvasesByChannel };
        Object.keys(nextCanvases).forEach((chId) => { nextCanvases[chId] = (nextCanvases[chId] || []).filter((c) => c._id !== cid); });
        const activeIdMap = { ...state.activeCanvasIdByChannel };
        Object.keys(activeIdMap).forEach((chId) => { if (activeIdMap[chId] === cid) delete activeIdMap[chId]; });
        const active = state.activeCanvas && state.activeCanvas._id === cid ? null : state.activeCanvas;

        // Remove deleted canvas from any open tabs across channels
        const nextOpenTabs = { ...state.openTabsByChannel };
        Object.keys(nextOpenTabs).forEach((chId) => {
          nextOpenTabs[chId] = (nextOpenTabs[chId] || []).filter((t) => t._id !== cid);
        });

        return { canvasesByChannel: nextCanvases, activeCanvasIdByChannel: activeIdMap, activeCanvas: active, openTabsByChannel: nextOpenTabs };
      });
      try {
        persistOpenTabs(get().openTabsByChannel);
      } catch (e) {
        // ignore
      }
      if (cid === get().currentJoinedRoom) get().clearActiveCanvas();
    };

    // Register handlers
    socket.on("canvas:presence:list", handlers.presenceList);
    socket.on("canvas:presence:join", handlers.presenceJoin);
    socket.on("canvas:presence:leave", handlers.presenceLeave);
    socket.on("canvas:cursor:update", handlers.cursorUpdate);
    socket.on("canvas:typing:update", handlers.typingUpdate);
    socket.on("canvas:block:created", handlers.blockCreated);
    socket.on("canvas:block:updated", handlers.blockUpdated);
    socket.on("canvas:block:deleted", handlers.blockDeleted);
    socket.on("canvas:block:reordered", handlers.blockReordered);
    socket.on("canvas:reaction:updated", handlers.reactionUpdated);
    socket.on("canvas:comment:created", handlers.commentCreated);
    socket.on("canvas:comment:replied", handlers.commentReplied);
    socket.on("canvas:comment:resolved", handlers.commentResolved);
    socket.on("canvas:restored", handlers.restored);
    socket.on("canvas:updated", handlers.updated);
    socket.on("canvas:deleted", handlers.deleted);

    socket._canvasHandlers[canvasId] = handlers;
  },

  leaveCanvasRoom: (canvasId) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit("canvas:leave", { canvasId });

    // If we stored per-room handlers, remove only those to avoid clearing
    // global listeners that other parts of the app rely on.
    try {
      if (socket._canvasHandlers && socket._canvasHandlers[canvasId]) {
        const h = socket._canvasHandlers[canvasId];
        if (h.presenceList) socket.off("canvas:presence:list", h.presenceList);
        if (h.presenceJoin) socket.off("canvas:presence:join", h.presenceJoin);
        if (h.presenceLeave) socket.off("canvas:presence:leave", h.presenceLeave);
        if (h.cursorUpdate) socket.off("canvas:cursor:update", h.cursorUpdate);
        if (h.typingUpdate) socket.off("canvas:typing:update", h.typingUpdate);
        if (h.blockCreated) socket.off("canvas:block:created", h.blockCreated);
        if (h.blockUpdated) socket.off("canvas:block:updated", h.blockUpdated);
        if (h.blockDeleted) socket.off("canvas:block:deleted", h.blockDeleted);
        if (h.blockReordered) socket.off("canvas:block:reordered", h.blockReordered);
        if (h.reactionUpdated) socket.off("canvas:reaction:updated", h.reactionUpdated);
        if (h.commentCreated) socket.off("canvas:comment:created", h.commentCreated);
        if (h.commentReplied) socket.off("canvas:comment:replied", h.commentReplied);
        if (h.commentResolved) socket.off("canvas:comment:resolved", h.commentResolved);
        if (h.restored) socket.off("canvas:restored", h.restored);
        if (h.updated) socket.off("canvas:updated", h.updated);
        if (h.deleted) socket.off("canvas:deleted", h.deleted);
        delete socket._canvasHandlers[canvasId];
      } else {
        // Fallback: remove commonly used handlers if no per-room tracking exists
        socket.off("canvas:presence:list");
        socket.off("canvas:presence:join");
        socket.off("canvas:presence:leave");
        socket.off("canvas:cursor:update");
        socket.off("canvas:typing:update");
        socket.off("canvas:block:created");
        socket.off("canvas:block:updated");
        socket.off("canvas:block:deleted");
        socket.off("canvas:block:reordered");
        socket.off("canvas:reaction:updated");
        socket.off("canvas:comment:created");
        socket.off("canvas:comment:replied");
        socket.off("canvas:comment:resolved");
        socket.off("canvas:restored");
        socket.off("canvas:updated");
        socket.off("canvas:deleted");
      }

      set({ currentJoinedRoom: null });
    } catch (err) {
      // best-effort cleanup — don't throw
      set({ currentJoinedRoom: null });
    }
  },

  // ── Client Triggered Interactions
  updateCursor: (blockId, x, y) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    const currentUserId = useAuthStore.getState().user?._id;

    // Optimistically update local cursor state for immediate UI feedback
    set((state) => ({
      cursors: {
        ...state.cursors,
        [currentUserId]: { blockId, x, y, name: useAuthStore.getState().user?.name || 'You', color: getUserColor(currentUserId) },
      },
    }));

    // If collaboration provider is active, use Yjs awareness instead of socket emission
    const providerStatus = useCanvasUiStore.getState().providerStatus;
    if (socket && canvasId && !(providerStatus === 'connected' || providerStatus === 'synced')) {
      socket.emit("canvas:cursor", { canvasId, blockId, x, y });
    }
  },

  setBlockTyping: (blockId, isTyping) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    const currentUserId = useAuthStore.getState().user?._id;

    // Update local typing state immediately
    set((state) => {
      const blockTyping = { ...(state.typing[blockId] || {}) };
      if (isTyping) blockTyping[currentUserId] = useAuthStore.getState().user?.name || 'You';
      else delete blockTyping[currentUserId];
      return { typing: { ...state.typing, [blockId]: blockTyping } };
    });

    // If provider active, awareness is canonical — avoid socket emission
    const providerStatus = useCanvasUiStore.getState().providerStatus;
    if (socket && canvasId && !(providerStatus === 'connected' || providerStatus === 'synced')) {
      socket.emit("canvas:typing", { canvasId, blockId, isTyping });
    }
  },

  createBlock: (blockData) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    if (socket && canvasId) {
      // If collaboration (CRDT) is active, avoid socket emits for editor content
      const providerStatus = useCanvasUiStore.getState().providerStatus;
      if (!(providerStatus === 'connected' || providerStatus === 'synced')) {
        socket.emit("canvas:block:create", { canvasId, blockData });
      }
    }
  },

  updateBlock: (blockId, content, type) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    
    // Optimistic Local Update
    set((state) => {
      const updatedBlocks = state.blocks.map((b) => {
        if (b._id === blockId) {
          return { ...b, content, type };
        }
        return b;
      });
      return { blocks: updatedBlocks };
    });

    // If collaboration is active, let CRDT handle document updates; otherwise emit socket
    const providerStatus = useCanvasUiStore.getState().providerStatus;
    if (socket && canvasId && !(providerStatus === 'connected' || providerStatus === 'synced')) {
      socket.emit("canvas:block:update", { canvasId, blockId, content, type });
    }
  },

  deleteBlock: (blockId) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;

    // Optimistic Local Update
    set((state) => ({
      blocks: state.blocks.filter((b) => b._id !== blockId),
      comments: state.comments.filter((c) => c.blockId !== blockId),
    }));

    if (socket && canvasId) {
      const providerStatus = useCanvasUiStore.getState().providerStatus;
      if (!(providerStatus === 'connected' || providerStatus === 'synced')) {
        socket.emit("canvas:block:delete", { canvasId, blockId });
      }
    }
  },

  reorderBlocks: (blockIdsOrder) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;

    // Optimistic Local Update
    set((state) => {
      const blocksMap = new Map(state.blocks.map((b) => [b._id, b]));
      const reordered = blockIdsOrder
        .map((id) => blocksMap.get(id))
        .filter(Boolean);

      state.blocks.forEach((b) => {
        if (!blockIdsOrder.includes(b._id)) {
          reordered.push(b);
        }
      });
      return { blocks: reordered };
    });

    if (socket && canvasId) {
      const providerStatus = useCanvasUiStore.getState().providerStatus;
      if (!(providerStatus === 'connected' || providerStatus === 'synced')) {
        socket.emit("canvas:block:reorder", { canvasId, blockIdsOrder });
      }
    }
  },

  toggleBlockReaction: (blockId, emoji) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    if (socket && canvasId) {
      socket.emit("canvas:reaction:toggle", { canvasId, blockId, emoji });
    }
  },

  // ── Comment interactions
  createComment: (blockId, content) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    if (socket && canvasId) {
      socket.emit("canvas:comment:create", { canvasId, blockId, content });
    }
  },

  replyToComment: (commentId, content) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    if (socket && canvasId) {
      socket.emit("canvas:comment:reply", { canvasId, commentId, content });
    }
  },

  resolveComment: (commentId) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    if (socket && canvasId) {
      socket.emit("canvas:comment:resolve", { canvasId, commentId });
    }
  },
}));