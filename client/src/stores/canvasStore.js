import { create } from "zustand";
import { canvasAPI } from "../services/api";
import { getSocket } from "../services/socket";
import { useAuthStore } from "./authStore";
import { useCanvasUiStore } from "./canvasUiStore";
import { useCanvasCollabStore } from "./canvasCollabStore";
import toast from "react-hot-toast";
import React from "react";
import { useLaterStore } from "./laterStore";

// ── Constants ──────────────────────────────────────────────────────────────────────
const STORAGE_KEY_TABS = "flowtask.canvas.openTabs.v1";
const STORAGE_KEY_ACTIVE_IDS = "flowtask.canvas.activeIds.v1";
const STORAGE_KEY_SAVED_IDS = "flowtask.canvas.savedIds.v1";

// ── Persistence helpers ────────────────────────────────────────────────────────────
function loadPersistedOpenTabs() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY_TABS) || localStorage.getItem("canvas_open_tabs");
    if (!raw) return {};
    const parsed = JSON.parse(raw) || {};
    return Object.fromEntries(
      Object.entries(parsed).map(([channelId, list]) => [channelId, (list || []).map((c) => ({ _id: c._id, title: c.title }))])
    );
  } catch (e) {
    return {};
  }
}

function persistOpenTabs(tabs) {
  try {
    if (typeof localStorage === "undefined") return;
    const sanitized = Object.fromEntries(
      Object.entries(tabs || {}).map(([channelId, list]) => [channelId, (list || []).map((c) => ({ _id: c._id, title: c.title }))])
    );
    localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(sanitized));
    localStorage.setItem("canvas_open_tabs", JSON.stringify(sanitized));
  } catch (e) {
    // ignore
  }
}

function loadPersistedActiveIds() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_IDS);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function persistActiveIds(ids) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY_ACTIVE_IDS, JSON.stringify(ids));
  } catch (e) {
    // ignore
  }
}

function loadPersistedSavedIds() {
  try {
    if (typeof localStorage === "undefined") return new Set();
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_IDS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) {
    return new Set();
  }
}

function persistSavedIds(ids) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY_SAVED_IDS, JSON.stringify([...ids]));
  } catch (e) {
    // ignore
  }
}

// ── Deep cleanup helper: removes a canvas from ALL state slices ────────────────────
function removeCanvasFromAllState(state, canvasId) {
  // Remove from canvasesByChannel for every channel
  const nextCanvases = { ...state.canvasesByChannel };
  Object.keys(nextCanvases).forEach((chId) => {
    nextCanvases[chId] = (nextCanvases[chId] || []).filter((c) => c._id !== canvasId);
  });

  // Remove from activeCanvasIdByChannel for every channel
  const activeIdMap = { ...state.activeCanvasIdByChannel };
  Object.keys(activeIdMap).forEach((chId) => {
    if (activeIdMap[chId] === canvasId) delete activeIdMap[chId];
  });

  // Remove from openTabsByChannel for every channel
  const nextOpenTabs = { ...state.openTabsByChannel };
  Object.keys(nextOpenTabs).forEach((chId) => {
    nextOpenTabs[chId] = (nextOpenTabs[chId] || []).filter((t) => t._id !== canvasId);
  });

  // Remove from savedCanvasIds
  const nextSaved = new Set(state.savedCanvasIds);
  nextSaved.delete(canvasId);

  // Clear activeCanvas if it matches
  const active = state.activeCanvas && state.activeCanvas._id === canvasId ? null : state.activeCanvas;

  return { canvasesByChannel: nextCanvases, activeCanvasIdByChannel: activeIdMap, openTabsByChannel: nextOpenTabs, activeCanvas: active, savedCanvasIds: nextSaved };
}

// ── Store ──────────────────────────────────────────────────────────────────────────
export const useCanvasStore = create((set, get) => ({
  // Store state
  isLoading: false,
  canvasesByChannel: {},
  activeCanvas: null,
  blocks: [],
  comments: [],
  history: [],
  currentJoinedRoom: null,
  // Persisted active canvas ID per channel (survives refresh)
  activeCanvasIdByChannel: loadPersistedActiveIds(),
  openTabsByChannel: loadPersistedOpenTabs(),
  globalSocketAttached: false,
  lastDeletedCanvas: null,
  savedCanvasIds: loadPersistedSavedIds(),
  savedCanvases: [],

  // ── Set active canvas ID for a channel (persisted) ───────────────────────────────
  setActiveCanvasId: (channelId, canvasId) => {
    if (!channelId || !canvasId) return;
    set((state) => {
      const next = { ...state.activeCanvasIdByChannel, [channelId]: canvasId };
      persistActiveIds(next);
      return { activeCanvasIdByChannel: next };
    });
  },

  // ── Load specific canvas details (REST) ──────────────────────────────────────────
  loadCanvas: async (canvasId) => {
    if (!canvasId) return;
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

        // Reset collaboration state for the newly loaded canvas
        useCanvasCollabStore.getState().resetCollab();

        set((state) => {
          // Sync loaded title into openTabsByChannel so tab label is always fresh
          const nextOpenTabs = { ...state.openTabsByChannel };
          const channelId = canvas.channelId;
          if (channelId && nextOpenTabs[channelId]) {
            nextOpenTabs[channelId] = (nextOpenTabs[channelId] || []).map((t) =>
              t._id === canvas._id ? { ...t, title: canvas.title } : t
            );
          }

          // Persist active canvas ID for this channel
          const nextActiveIds = { ...state.activeCanvasIdByChannel, [channelId]: canvas._id };
          persistActiveIds(nextActiveIds);

          return {
            activeCanvas: canvas,
            blocks: sortedBlocks,
            comments: comments || [],
            activeCanvasIdByChannel: nextActiveIds,
            openTabsByChannel: nextOpenTabs,
          };
        });

        // Persist the synced open tabs so localStorage matches server
        try {
          persistOpenTabs(get().openTabsByChannel);
        } catch (e) {
          // ignore
        }

        // Join room for the newly loaded canvas
        get().joinCanvasRoom(canvasId);
        // Ensure global listeners are attached too
        get().ensureGlobalSocketListeners?.();
      } else {
        // Canvas not found or error — clear active state for this channel
        set((state) => {
          const nextActiveIds = { ...state.activeCanvasIdByChannel };
          Object.keys(nextActiveIds).forEach((chId) => {
            if (nextActiveIds[chId] === canvasId) delete nextActiveIds[chId];
          });
          persistActiveIds(nextActiveIds);
          return { activeCanvasIdByChannel: nextActiveIds };
        });
      }
    } catch (err) {
      console.error("[CanvasStore] loadCanvas error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Create Canvas (with deduplication guard) ─────────────────────────────────────
  _createInFlight: {},

  createCanvas: async (channelId, payload) => {
    // Deduplication guard: prevent double-click from creating two canvases
    const dedupKey = `${channelId}:${payload?.title || 'blank'}`;
    if (get()._createInFlight[dedupKey]) return null;
    set((state) => ({ _createInFlight: { ...state._createInFlight, [dedupKey]: true } }));

    set({ isLoading: true });
    let result = null;
    try {
      const res = await canvasAPI.create(channelId, payload);
      if (res.data && res.data.success) {
        const newCanvas = res.data.data;
        set((state) => {
          const nextActiveIds = { ...state.activeCanvasIdByChannel, [channelId]: newCanvas._id };
          persistActiveIds(nextActiveIds);

          // Add to canvasesByChannel list
          const list = state.canvasesByChannel[channelId] || [];
          return {
            activeCanvas: newCanvas,
            activeCanvasIdByChannel: nextActiveIds,
            blocks: [],
            canvasesByChannel: { ...state.canvasesByChannel, [channelId]: [...list, newCanvas] },
          };
        });

        // Load the created canvas to attach sockets/providers
        await get().loadCanvas(newCanvas._id);
        result = newCanvas;
      }
    } catch (err) {
      console.error("[CanvasStore] createCanvas error:", err);
    } finally {
      set({ isLoading: false, _createInFlight: { ...get()._createInFlight, [dedupKey]: false } });
    }
    return result;
  },

  // ── Update canvas metadata (title, cover, content pointer, etc.) ─────────────────
  updateCanvasMetadata: async (canvasId, updates) => {
    try {
      const res = await canvasAPI.update(canvasId, updates);
      if (res.data && res.data.success) {
        const updated = res.data.data;
        set((state) => {
          const active = state.activeCanvas && state.activeCanvas._id === canvasId
            ? { ...state.activeCanvas, ...updated }
            : state.activeCanvas;
          const channelId = updated.channelId || (state.activeCanvas && state.activeCanvas.channelId) || null;
          const nextCanvases = { ...state.canvasesByChannel };
          if (channelId) {
            nextCanvases[channelId] = (nextCanvases[channelId] || []).map((c) =>
              c._id === canvasId ? { ...c, ...updated } : c
            );
          }

          // Sync tab title in openTabsByChannel when title changes — INSTANTLY
          let nextOpenTabs = state.openTabsByChannel;
          if (updates.title != null) {
            nextOpenTabs = { ...state.openTabsByChannel };
            Object.keys(nextOpenTabs).forEach((chId) => {
              nextOpenTabs[chId] = (nextOpenTabs[chId] || []).map((t) =>
                t._id === canvasId ? { ...t, title: updates.title } : t
              );
            });
          }

          return {
            activeCanvas: active,
            canvasesByChannel: nextCanvases,
            openTabsByChannel: nextOpenTabs,
          };
        });

        // Persist updated tab titles
        if (updates.title != null) {
          try {
            persistOpenTabs(get().openTabsByChannel);
          } catch (e) {
            // ignore
          }
        }

        return updated;
      }
    } catch (err) {
      console.error("[CanvasStore] updateCanvasMetadata error:", err);
    }
  },

  // ── Duplicate Canvas ─────────────────────────────────────────────────────────────
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

  // ── Delete Canvas (optimistic + undo) ────────────────────────────────────────────
  deleteCanvas: async (canvasId) => {
    try {
      const state = get();

      // Find canvas metadata and channel
      let found = null;
      let foundChannel = null;
      Object.keys(state.canvasesByChannel || {}).forEach((chId) => {
        const list = state.canvasesByChannel[chId] || [];
        const match = list.find((c) => c._id === canvasId);
        if (match) {
          found = match;
          foundChannel = chId;
        }
      });

      // If not present locally, attempt to fetch details for snapshot
      let snapshot = null;
      if (found) {
        snapshot = { canvas: found, blocks: null };
      } else {
        try {
          const details = await canvasAPI.getById(canvasId);
          if (details.data && details.data.success) {
            snapshot = { canvas: details.data.data.canvas, blocks: details.data.data.blocks };
            foundChannel = details.data.data.canvas.channelId;
          }
        } catch (err) {
          // ignore; proceed without rich snapshot
        }
      }

      // Persist snapshot in store for possible Undo
      set({ lastDeletedCanvas: snapshot });

      // Optimistically remove the canvas from ALL client state
      set((state) => {
        const cleaned = removeCanvasFromAllState(state, canvasId);
        persistActiveIds(cleaned.activeCanvasIdByChannel);
        return cleaned;
      });

      // Persist the open tabs changes
      try {
        persistOpenTabs(get().openTabsByChannel);
      } catch (e) {
        // ignore
      }
      try {
        persistSavedIds(get().savedCanvasIds);
      } catch (e) {
        // ignore
      }

      // Show undo toast (use createElement to avoid JSX in .js file)
      const undoId = toast((t) =>
        React.createElement(
          "div",
          { style: { display: "flex", gap: 12, alignItems: "center" } },
          React.createElement("div", null, "Canvas deleted"),
          React.createElement(
            "div",
            { style: { marginLeft: 8 } },
            React.createElement(
              "button",
              {
                onClick: async () => {
                  toast.dismiss(t.id);
                  const snap = get().lastDeletedCanvas;
                  if (!snap || !foundChannel) return;
                  try {
                    const createPayload = {
                      title: snap.canvas.title,
                      type: snap.canvas.type,
                      content: snap.canvas.content || undefined,
                      cover: snap.canvas.cover || undefined,
                    };
                    const res = await canvasAPI.create(foundChannel, createPayload);
                    if (res.data && res.data.success) {
                      const newCanvas = res.data.data;
                      set((s) => {
                        const list = s.canvasesByChannel[foundChannel] || [];
                        return { canvasesByChannel: { ...s.canvasesByChannel, [foundChannel]: [...list, newCanvas] } };
                      });
                      await get().loadCanvas(newCanvas._id);
                      set({ lastDeletedCanvas: null });
                      toast.success("Canvas restored");
                    }
                  } catch (err) {
                    console.error("Undo recreate failed", err);
                    toast.error("Failed to restore canvas");
                  }
                },
                style: { padding: "6px 10px", borderRadius: 8, background: "var(--bg-primary)", border: "1px solid var(--border-primary)", color: "var(--text-primary)", cursor: "pointer" },
              },
              "Undo"
            )
          )
        ),
        { duration: 8000 }
      );

      // Fire server deletion (do not await restore)
      (async () => {
        try {
          await canvasAPI.delete(canvasId);
        } catch (err) {
          console.error("[CanvasStore] deleteCanvas error:", err);
          const snap = get().lastDeletedCanvas;
          if (snap && foundChannel) {
            set((s) => ({
              canvasesByChannel: {
                ...s.canvasesByChannel,
                [foundChannel]: [...(s.canvasesByChannel[foundChannel] || []), snap.canvas],
              },
              lastDeletedCanvas: null,
            }));
            toast.error("Failed to delete canvas. Restored locally.");
          }
        }
      })();

      return true;
    } catch (err) {
      console.error("[CanvasStore] deleteCanvas error:", err);
      return false;
    }
  },

  // ── Fetch snapshots (History) ────────────────────────────────────────────────────
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

  // ── Fetch canvases for a channel and cache locally ───────────────────────────────
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

  // ── Load a default canvas for a channel (used on initial channel open) ───────────
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
        // Use persisted activeCanvasIdByChannel to restore the correct canvas
        const persistedId = get().activeCanvasIdByChannel[channelId];
        const canvasExists = persistedId && list.some((c) => c._id === persistedId);
        const preferred = canvasExists ? persistedId : list[0]._id;
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

  // ── Open tabs (shared across clients) ────────────────────────────────────────────
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

    socket.on('canvas:tabs:state', ({ channelId, tabs }) => {
      if (!channelId) return;
      try {
        const normalized = Array.isArray(tabs) ? tabs.map((t) => ({ _id: t._id || t.canvasId || t.id, title: t.title || '' })).filter(Boolean) : [];
        get().setOpenTabs(channelId, normalized);
      } catch (err) {
        // best-effort
      }
    });

    socket.on('canvas:tabs:updated', ({ channelId, tabs }) => {
      if (!channelId) return;
      try {
        const normalized = Array.isArray(tabs) ? tabs.map((t) => ({ _id: t._id || t.canvasId || t.id, title: t.title || '' })).filter(Boolean) : [];
        get().setOpenTabs(channelId, normalized);
      } catch (err) {
        // best-effort
      }
    });

    socket.on('canvas:title:updated', ({ canvasId, title }) => {
      if (!canvasId) return;
      try {
        set((state) => {
          const nextOpenTabs = { ...state.openTabsByChannel };
          Object.keys(nextOpenTabs).forEach((chId) => {
            nextOpenTabs[chId] = (nextOpenTabs[chId] || []).map((t) =>
              t._id === canvasId ? { ...t, title: title } : t
            );
          });
          const nextCanvases = { ...state.canvasesByChannel };
          Object.keys(nextCanvases).forEach((chId) => {
            nextCanvases[chId] = (nextCanvases[chId] || []).map((c) =>
              c._id === canvasId ? { ...c, title: title } : c
            );
          });
          const active = state.activeCanvas && state.activeCanvas._id === canvasId
            ? { ...state.activeCanvas, title }
            : state.activeCanvas;
          return { openTabsByChannel: nextOpenTabs, canvasesByChannel: nextCanvases, activeCanvas: active };
        });
        persistOpenTabs(get().openTabsByChannel);
      } catch (err) {
        // best-effort
      }
    });

    // ── Real-time share notification: refresh canvas list for the channel
    socket.on('canvas:shared', ({ canvasId, channelId, title, sharedBy, role }) => {
      if (!channelId) return;
      try {
        toast.success(`${sharedBy?.name || 'Someone'} shared "${title || 'a canvas'}" with you`);
        // Refresh channel canvases to include the newly shared one
        get().fetchChannelCanvases(channelId);
      } catch (err) {
        // best-effort
      }
    });

    // ── Canvas deleted globally — clean up ALL state for deleted canvas
    socket.on('canvas:deleted', ({ canvasId, channelId }) => {
      if (!canvasId) return;
      set((state) => {
        const cleaned = removeCanvasFromAllState(state, canvasId);
        persistActiveIds(cleaned.activeCanvasIdByChannel);
        return { ...cleaned, _persistTabs: true };
      });
      // Persist the cleaned state
      try {
        persistOpenTabs(get().openTabsByChannel);
        persistSavedIds(get().savedCanvasIds);
      } catch (e) {
        // ignore
      }
      // If the deleted canvas was the active one, clear its room
      if (canvasId === get().currentJoinedRoom) {
        get().clearActiveCanvas();
      }
    });

    socket.on('canvas:saved:later', ({ canvasId, canvas }) => {
      if (!canvasId) return;
      set((state) => {
        const next = new Set(state.savedCanvasIds);
        next.add(canvasId);
        persistSavedIds(next);
        const newCanvases = canvas && !state.savedCanvases.find(c => c._id === canvasId) 
          ? [canvas, ...state.savedCanvases] 
          : state.savedCanvases;
        return { savedCanvasIds: next, savedCanvases: newCanvases };
      });
    });

    socket.on('canvas:unsaved:later', ({ canvasId }) => {
      if (!canvasId) return;
      set((state) => {
        const next = new Set(state.savedCanvasIds);
        next.delete(canvasId);
        persistSavedIds(next);
        
        // Clean up standalone canvas reminder if any
        try {
          const { savedMessages } = useLaterStore.getState();
          const reminder = savedMessages.find(m => m.type === "standalone" && m.canvasRef === canvasId);
          if (reminder) {
            useLaterStore.setState({
              savedMessages: savedMessages.filter(m => m._id !== reminder._id)
            });
          }
        } catch (err) {
          console.error("Failed to remove canvas reminder on socket event:", err);
        }

        return { 
          savedCanvasIds: next,
          savedCanvases: state.savedCanvases.filter(c => c._id !== canvasId)
        };
      });
    });

    set({ globalSocketAttached: true });
  },

  // ── Restore Snapshot Version ─────────────────────────────────────────────────────
  restoreVersion: async (canvasId, historyId) => {
    set({ isLoading: true });
    try {
      const res = await canvasAPI.restoreVersion(canvasId, historyId);
      if (res.data && res.data.success) {
        await get().loadCanvas(canvasId);
      }
    } catch (err) {
      console.error("[CanvasStore] restoreVersion error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Clear active canvas state entirely (e.g. on leave tab) ──────────────────────
  clearActiveCanvas: () => {
    const currentRoom = get().currentJoinedRoom;
    if (currentRoom) {
      get().leaveCanvasRoom(currentRoom);
    }
    useCanvasCollabStore.getState().resetCollab();
    set({
      activeCanvas: null,
      blocks: [],
      comments: [],
      history: [],
      currentJoinedRoom: null,
    });
  },

  // ── Websocket Room Handlers ──────────────────────────────────────────────────────
  joinCanvasRoom: (canvasId) => {
    const socket = getSocket();
    if (!socket || !canvasId) return;

    if (get().currentJoinedRoom === canvasId) return;

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

    socket._canvasHandlers = socket._canvasHandlers || {};
    const handlers = {};

    handlers.presenceList = ({ canvasId: cid, users }) => {
      if (cid !== get().currentJoinedRoom) return;
      useCanvasCollabStore.getState().setPresence(users);
    };

    handlers.presenceJoin = ({ canvasId: cid, user }) => {
      if (cid !== get().currentJoinedRoom) return;
      useCanvasCollabStore.getState().addPresenceUser(user);
    };

    handlers.presenceLeave = ({ canvasId: cid, userId }) => {
      if (cid !== get().currentJoinedRoom) return;
      useCanvasCollabStore.getState().removePresenceUser(userId);
    };

    handlers.cursorUpdate = ({ userId, name, blockId, x, y }) => {
      useCanvasCollabStore.getState().setRemoteCursor(userId, name, blockId, x, y);
    };

    handlers.typingUpdate = ({ userId, name, blockId, isTyping }) => {
      useCanvasCollabStore.getState().setRemoteTyping(userId, name, blockId, isTyping);
    };

    handlers.blockCreated = (newBlock) => {
      const providerStatus = useCanvasUiStore.getState().providerStatus;
      if (providerStatus === 'connected' || providerStatus === 'synced') return;
      set((state) => ({ blocks: [...state.blocks, newBlock].sort((a, b) => a.order - b.order) }));
    };

    handlers.blockUpdated = ({ blockId, content, type, lastEditedBy }) => {
      const currentUserId = useAuthStore.getState().user?._id;
      const providerStatus = useCanvasUiStore.getState().providerStatus;
      if (providerStatus === 'connected' || providerStatus === 'synced') {
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
      // Canvas was deleted by another user in the same room — clean up all state
      set((state) => {
        const cleaned = removeCanvasFromAllState(state, cid);
        persistActiveIds(cleaned.activeCanvasIdByChannel);
        return cleaned;
      });
      try {
        persistOpenTabs(get().openTabsByChannel);
        persistSavedIds(get().savedCanvasIds);
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
      set({ currentJoinedRoom: null });
    }
  },

  // ── Client Triggered Interactions ────────────────────────────────────────────────
  createBlock: (blockData) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    if (socket && canvasId) {
      const providerStatus = useCanvasUiStore.getState().providerStatus;
      if (!(providerStatus === 'connected' || providerStatus === 'synced')) {
        socket.emit("canvas:block:create", { canvasId, blockData });
      }
    }
  },

  updateBlock: (blockId, content, type) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;

    set((state) => {
      const updatedBlocks = state.blocks.map((b) => {
        if (b._id === blockId) {
          return { ...b, content, type };
        }
        return b;
      });
      return { blocks: updatedBlocks };
    });

    const providerStatus = useCanvasUiStore.getState().providerStatus;
    if (socket && canvasId && !(providerStatus === 'connected' || providerStatus === 'synced')) {
      socket.emit("canvas:block:update", { canvasId, blockId, content, type });
    }
  },

  deleteBlock: (blockId) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;

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

  // ── Comment interactions ────────────────────────────────────────────────────────
  createComment: (blockId, content, textRange) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    if (socket && canvasId) {
      socket.emit("canvas:comment:create", { canvasId, blockId, content, textRange });
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

  // ── Save for Later ───────────────────────────────────────────────────────────────
  savedCanvasIds: loadPersistedSavedIds(),

  toggleSaveForLater: async (canvasId) => {
    if (!canvasId) return;
    const wasSaved = get().savedCanvasIds.has(canvasId);
    const prevIds = new Set(get().savedCanvasIds);

    try {
      const newIds = new Set(prevIds);
      if (wasSaved) {
        newIds.delete(canvasId);
        // Clean up standalone canvas reminder locally
        try {
          const { savedMessages } = useLaterStore.getState();
          const reminder = savedMessages.find(m => m.type === "standalone" && m.canvasRef === canvasId);
          if (reminder) {
            useLaterStore.setState({
              savedMessages: savedMessages.filter(m => m._id !== reminder._id)
            });
          }
        } catch (err) {
          console.error("Failed to remove canvas reminder locally on toggleSaveCanvas:", err);
        }
      } else {
        newIds.add(canvasId);
      }
      set((state) => ({ 
        savedCanvasIds: newIds,
        savedCanvases: wasSaved ? state.savedCanvases.filter(c => c._id !== canvasId) : state.savedCanvases
      }));
      persistSavedIds(newIds);

      const { data } = await canvasAPI.toggleSaveForLater(canvasId);
      const saved = data.data?.saved;
      const canvas = data.data?.canvas;
      
      if (saved && canvas) {
        set((state) => {
          if (!state.savedCanvases.find(c => c._id === canvas._id)) {
            return { savedCanvases: [canvas, ...state.savedCanvases] };
          }
          return {};
        });
        toast.success("Saved for later");
      } else if (!saved) {
        toast.success("Removed from saved for later");
      }
    } catch {
      set((state) => ({
        savedCanvasIds: prevIds,
        savedCanvases: state.savedCanvases // revert logic could be more complex but keeping it simple
      }));
      persistSavedIds(prevIds);
      toast.error("Failed to update saved status");
    }
  },

  updateSavedCanvasStatus: async (canvasId, status) => {
    // Optimistic update
    set((state) => ({
      savedCanvases: state.savedCanvases.map((c) =>
        c._id === canvasId ? { ...c, savedForLaterStatus: status } : c
      ),
    }));
    try {
      await canvasAPI.updateSavedStatus(canvasId, status);
      toast.success(`Moved to ${status.replace('_', ' ')}`);
    } catch {
      toast.error("Failed to update status");
      // Re-fetch to fix state on failure
      get().fetchSavedCanvases();
    }
  },

  fetchSavedCanvases: async () => {
    try {
      // Always fetch all saved canvases to keep counts accurate
      const { data } = await canvasAPI.getSavedCanvases(null, null);
      const canvases = data.data || [];
      const ids = new Set(canvases.map(c => c._id));
      set({ savedCanvases: canvases, savedCanvasIds: ids });
      persistSavedIds(ids);
      return canvases;
    } catch {
      return [];
    }
  },

  isCanvasSaved: (canvasId) => {
    return get().savedCanvasIds.has(canvasId);
  },
}));