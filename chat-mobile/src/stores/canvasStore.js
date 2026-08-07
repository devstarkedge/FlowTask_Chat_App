import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { canvasAPI, canvasCommentAPI } from '../services/api';
import { getSocket } from '../services/socket';
import logger from '../utils/logger';

// ── AsyncStorage persistence keys ────────────────────────────────────────────
const KEY_ACTIVE_IDS = 'flowtask.canvas.activeIds.v1';
const KEY_OPEN_TABS  = 'flowtask.canvas.openTabs.v1';
const KEY_SAVED_IDS  = 'flowtask.canvas.savedIds.v1';

async function loadPersistedActiveIds() {
  try {
    const raw = await AsyncStorage.getItem(KEY_ACTIVE_IDS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function loadPersistedOpenTabs() {
  try {
    const raw = await AsyncStorage.getItem(KEY_OPEN_TABS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function loadPersistedSavedIds() {
  try {
    const raw = await AsyncStorage.getItem(KEY_SAVED_IDS);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function persistActiveIds(ids) {
  AsyncStorage.setItem(KEY_ACTIVE_IDS, JSON.stringify(ids)).catch(() => {});
}
function persistOpenTabs(tabs) {
  AsyncStorage.setItem(KEY_OPEN_TABS, JSON.stringify(tabs)).catch(() => {});
}
function persistSavedIds(ids) {
  AsyncStorage.setItem(KEY_SAVED_IDS, JSON.stringify([...ids])).catch(() => {});
}

// ── Deep-clean helper ────────────────────────────────────────────────────────
function removeCanvasFromAllState(state, canvasId) {
  const nextCanvases = {};
  Object.keys(state.canvasesByChannel).forEach((chId) => {
    nextCanvases[chId] = (state.canvasesByChannel[chId] || []).filter(
      (c) => c._id !== canvasId,
    );
  });
  const activeIdMap = { ...state.activeCanvasIdByChannel };
  Object.keys(activeIdMap).forEach((chId) => {
    if (activeIdMap[chId] === canvasId) delete activeIdMap[chId];
  });
  const nextTabs = {};
  Object.keys(state.openTabsByChannel).forEach((chId) => {
    nextTabs[chId] = (state.openTabsByChannel[chId] || []).filter(
      (t) => t._id !== canvasId,
    );
  });
  const nextSaved = new Set(state.savedCanvasIds);
  nextSaved.delete(canvasId);
  const active =
    state.activeCanvas && state.activeCanvas._id === canvasId
      ? null
      : state.activeCanvas;
  return {
    canvasesByChannel: nextCanvases,
    activeCanvasIdByChannel: activeIdMap,
    openTabsByChannel: nextTabs,
    savedCanvasIds: nextSaved,
    activeCanvas: active,
  };
}

// ── Helper to convert blocks to TipTap JSON ──────────────────────────────────
function convertBlocksToTipTap(blocks) {
  if (!blocks || !blocks.length) return null;
  const content = blocks.map((block) => {
    if (block.type === 'heading-1') {
      return { type: 'heading', attrs: { level: 1 }, content: block.content ? [{ type: 'text', text: block.content }] : [] };
    } else if (block.type === 'heading-2') {
      return { type: 'heading', attrs: { level: 2 }, content: block.content ? [{ type: 'text', text: block.content }] : [] };
    } else if (block.type === 'heading-3') {
      return { type: 'heading', attrs: { level: 3 }, content: block.content ? [{ type: 'text', text: block.content }] : [] };
    } else if (block.type === 'paragraph') {
      return { type: 'paragraph', content: block.content ? [{ type: 'text', text: block.content }] : [] };
    } else if (block.type === 'checklist') {
      return {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: block.content?.checked || false },
            content: [{ type: 'paragraph', content: block.content?.text ? [{ type: 'text', text: block.content.text }] : [] }],
          },
        ],
      };
    }
    return { type: 'paragraph', content: typeof block.content === 'string' && block.content ? [{ type: 'text', text: block.content }] : [] };
  });

  return { type: 'doc', content };
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useCanvasStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  isLoading: false,
  canvasesByChannel: {},       // { [channelId]: Canvas[] }
  templates: [],               // Templates fetched from backend
  activeCanvas: null,          // currently open canvas object
  comments: [],                // CanvasComment[] for the open canvas
  history: [],                 // CanvasHistory[] for the open canvas
  savedCanvasIds: new Set(),   // Set of canvas IDs saved for later
  savedCanvases: [],           // Canvas[] saved for later (populated)
  openTabsByChannel: {},       // { [channelId]: { _id, title }[] }
  activeCanvasIdByChannel: {}, // { [channelId]: string } — persisted
  presence: [],                // User[] currently in the canvas room
  currentJoinedRoom: null,     // canvasId of socket room we're in
  _createInFlight: {},         // dedup guard

  // ── Hydrate from AsyncStorage (call once on app start) ─────────────────────
  hydrate: async () => {
    const [activeIds, openTabs, savedIds] = await Promise.all([
      loadPersistedActiveIds(),
      loadPersistedOpenTabs(),
      loadPersistedSavedIds(),
    ]);
    set({
      activeCanvasIdByChannel: activeIds,
      openTabsByChannel: openTabs,
      savedCanvasIds: savedIds,
    });
  },

  // ── Fetch canvases for a channel ───────────────────────────────────────────
  fetchChannelCanvases: async (channelId) => {
    if (!channelId) return [];
    set({ isLoading: true });
    try {
      const res = await canvasAPI.getAllForChannel(channelId);
      const list = res.data?.data || [];
      set((s) => ({
        canvasesByChannel: { ...s.canvasesByChannel, [channelId]: list },
      }));
      return list;
    } catch (err) {
      logger.error('[CanvasStore] fetchChannelCanvases:', err.message);
      return [];
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Fetch templates ────────────────────────────────────────────────────────
  fetchTemplates: async () => {
    try {
      const res = await canvasAPI.getTemplates();
      const list = res.data?.data || [];
      set({ templates: list });
      return list;
    } catch (err) {
      logger.error('[CanvasStore] fetchTemplates:', err.message);
      return [];
    }
  },

  // ── Fetch all user canvases (for "Link existing" flow) ──────────────────────
  loadCanvas: async (canvasId) => {
    if (!canvasId) return;
    set({ isLoading: true });
    try {
      // Leave previous room
      const prev = get().currentJoinedRoom;
      if (prev && prev !== canvasId) {
        get().leaveCanvasRoom(prev);
      }

      const res = await canvasAPI.getById(canvasId);
      if (res.data?.success) {
        const { canvas, blocks, comments } = res.data.data;
        
        let activeCanvas = { ...canvas };
        
        const isBlank = !canvas.content || 
                       !canvas.content.content || 
                       (canvas.content.content.length === 0) ||
                       (canvas.content.content.length === 1 && (!canvas.content.content[0].content || canvas.content.content[0].content.length === 0) && canvas.content.content[0].type === 'paragraph');

        if (isBlank && blocks && blocks.length > 0) {
          activeCanvas.content = convertBlocksToTipTap(blocks);
        }

        set((s) => {
          const nextActiveIds = {
            ...s.activeCanvasIdByChannel,
            [activeCanvas.channelId]: activeCanvas._id,
          };
          persistActiveIds(nextActiveIds);
          return {
            activeCanvas,
            comments: comments || [],
            activeCanvasIdByChannel: nextActiveIds,
          };
        });
        get().joinCanvasRoom(canvasId);
      } else {
        logger.warn('[CanvasStore] loadCanvas: no data');
      }
    } catch (err) {
      logger.error('[CanvasStore] loadCanvas:', err.message);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Load default canvas for a channel ─────────────────────────────────────
  loadDefaultCanvas: async (channelId) => {
    if (!channelId) return;
    set({ isLoading: true });
    try {
      let list = get().canvasesByChannel[channelId] || [];
      if (!list.length) {
        list = await get().fetchChannelCanvases(channelId);
      }
      if (list.length > 0) {
        const persistedId = get().activeCanvasIdByChannel[channelId];
        const exists = persistedId && list.some((c) => c._id === persistedId);
        const preferred = exists ? persistedId : list[0]._id;
        await get().loadCanvas(preferred);
      } else {
        set({ activeCanvas: null });
      }
    } catch (err) {
      logger.error('[CanvasStore] loadDefaultCanvas:', err.message);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Create canvas ──────────────────────────────────────────────────────────
  createCanvas: async (channelId, payload) => {
    const key = `${channelId}:${payload?.title || 'blank'}`;
    if (get()._createInFlight[key]) return null;
    set((s) => ({ _createInFlight: { ...s._createInFlight, [key]: true } }));
    set({ isLoading: true });
    let result = null;
    try {
      const res = await canvasAPI.create(channelId, payload);
      if (res.data?.success) {
        const newCanvas = res.data.data;
        set((s) => {
          const nextActiveIds = {
            ...s.activeCanvasIdByChannel,
            [channelId]: newCanvas._id,
          };
          persistActiveIds(nextActiveIds);
          const list = s.canvasesByChannel[channelId] || [];
          return {
            activeCanvas: newCanvas,
            activeCanvasIdByChannel: nextActiveIds,
            canvasesByChannel: {
              ...s.canvasesByChannel,
              [channelId]: [...list, newCanvas],
            },
          };
        });
        await get().loadCanvas(newCanvas._id);
        result = newCanvas;
      }
    } catch (err) {
      logger.error('[CanvasStore] createCanvas:', err.message);
    } finally {
      set((s) => ({
        isLoading: false,
        _createInFlight: { ...s._createInFlight, [key]: false },
      }));
    }
    return result;
  },

  // ── Update canvas metadata (title, cover, content) ─────────────────────────
  updateCanvas: async (canvasId, updates) => {
    try {
      const res = await canvasAPI.update(canvasId, updates);
      if (res.data?.success) {
        const updated = res.data.data;
        set((s) => {
          const active =
            s.activeCanvas?._id === canvasId
              ? { ...s.activeCanvas, ...updated }
              : s.activeCanvas;
          const channelId = updated.channelId || s.activeCanvas?.channelId;
          const nextCanvases = { ...s.canvasesByChannel };
          if (channelId) {
            nextCanvases[channelId] = (nextCanvases[channelId] || []).map(
              (c) => (c._id === canvasId ? { ...c, ...updated } : c),
            );
          }
          // Sync tab title
          let nextTabs = s.openTabsByChannel;
          if (updates.title != null) {
            nextTabs = { ...s.openTabsByChannel };
            Object.keys(nextTabs).forEach((chId) => {
              nextTabs[chId] = (nextTabs[chId] || []).map((t) =>
                t._id === canvasId ? { ...t, title: updates.title } : t,
              );
            });
          }
          return {
            activeCanvas: active,
            canvasesByChannel: nextCanvases,
            openTabsByChannel: nextTabs,
          };
        });
        return updated;
      }
    } catch (err) {
      logger.error('[CanvasStore] updateCanvas:', err.message);
    }
  },

  // ── Delete canvas (optimistic) ─────────────────────────────────────────────
  deleteCanvas: async (canvasId) => {
    try {
      set((s) => {
        const cleaned = removeCanvasFromAllState(s, canvasId);
        persistActiveIds(cleaned.activeCanvasIdByChannel);
        persistSavedIds(cleaned.savedCanvasIds);
        return cleaned;
      });
      await canvasAPI.delete(canvasId);
      return true;
    } catch (err) {
      logger.error('[CanvasStore] deleteCanvas:', err.message);
      return false;
    }
  },

  // ── Duplicate canvas ───────────────────────────────────────────────────────
  duplicateCanvas: async (canvasId) => {
    set({ isLoading: true });
    try {
      const res = await canvasAPI.duplicate(canvasId);
      if (res.data?.success) {
        const dup = res.data.data;
        const channelId = dup.channelId;
        set((s) => {
          const list = s.canvasesByChannel[channelId] || [];
          return {
            canvasesByChannel: {
              ...s.canvasesByChannel,
              [channelId]: [...list, dup],
            },
          };
        });
        return dup;
      }
    } catch (err) {
      logger.error('[CanvasStore] duplicateCanvas:', err.message);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── History ────────────────────────────────────────────────────────────────
  fetchHistory: async (canvasId) => {
    try {
      const res = await canvasAPI.getHistory(canvasId);
      if (res.data?.success) {
        set({ history: res.data.data || [] });
      }
    } catch (err) {
      logger.error('[CanvasStore] fetchHistory:', err.message);
    }
  },

  restoreVersion: async (canvasId, historyId) => {
    set({ isLoading: true });
    try {
      const res = await canvasAPI.restoreVersion(canvasId, historyId);
      if (res.data?.success) {
        await get().loadCanvas(canvasId);
      }
    } catch (err) {
      logger.error('[CanvasStore] restoreVersion:', err.message);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Save for Later ─────────────────────────────────────────────────────────
  toggleSaveForLater: async (canvasId) => {
    try {
      const res = await canvasAPI.toggleSaveForLater(canvasId);
      if (res.data?.success) {
        const saved = res.data.data?.saved;
        const canvas = res.data.data?.canvas;
        set((s) => {
          const next = new Set(s.savedCanvasIds);
          if (saved) {
            next.add(canvasId);
          } else {
            next.delete(canvasId);
          }
          persistSavedIds(next);
          const newSavedCanvases = saved && canvas && !s.savedCanvases.find(c => c._id === canvasId)
            ? [canvas, ...s.savedCanvases]
            : (!saved ? s.savedCanvases.filter(c => c._id !== canvasId) : s.savedCanvases);
          return { savedCanvasIds: next, savedCanvases: newSavedCanvases };
        });
      }
    } catch (err) {
      logger.error('[CanvasStore] toggleSaveForLater:', err.message);
    }
  },

  fetchSavedCanvases: async (channelId = null, status = null) => {
    try {
      const res = await canvasAPI.getSavedCanvases(channelId, status);
      const list = res.data?.data || [];
      const ids = new Set(list.map((c) => c._id));
      set({ savedCanvases: list, savedCanvasIds: ids });
      persistSavedIds(ids);
      return list;
    } catch (err) {
      logger.error('[CanvasStore] fetchSavedCanvases:', err.message);
      return [];
    }
  },

  updateSavedCanvasStatus: async (canvasId, status) => {
    set((s) => ({
      savedCanvases: s.savedCanvases.map((c) =>
        c._id === canvasId ? { ...c, savedForLaterStatus: status } : c
      ),
    }));
    try {
      await canvasAPI.updateSavedStatus(canvasId, status);
    } catch (err) {
      logger.error('[CanvasStore] updateSavedCanvasStatus:', err.message);
      get().fetchSavedCanvases();
    }
  },

  // ── Comments (Socket-based) ───────────────────────────────────────────────
  fetchComments: async (canvasId) => {
    // Comments are automatically fetched in loadCanvas API response
  },

  createComment: async (canvasId, blockId, content, textRange = null) => {
    try {
      const socket = getSocket();
      if (socket) {
        socket.emit('canvas:comment:create', { canvasId, blockId, content, textRange });
      }
    } catch (err) {
      logger.error('[CanvasStore] createComment:', err.message);
    }
  },

  replyToComment: async (commentId, content) => {
    try {
      const socket = getSocket();
      const canvasId = get().activeCanvas?._id;
      if (socket && canvasId) {
        socket.emit('canvas:comment:reply', { canvasId, commentId, content });
      }
    } catch (err) {
      logger.error('[CanvasStore] replyToComment:', err.message);
    }
  },

  resolveComment: async (commentId) => {
    try {
      const socket = getSocket();
      const canvasId = get().activeCanvas?._id;
      if (socket && canvasId) {
        socket.emit('canvas:comment:resolve', { canvasId, commentId });
      }
    } catch (err) {
      logger.error('[CanvasStore] resolveComment:', err.message);
    }
  },

  // ── Open Tabs ──────────────────────────────────────────────────────────────
  addOpenTab: (channelId, canvasMeta) => {
    if (!channelId || !canvasMeta?._id) return;
    set((s) => {
      const list = s.openTabsByChannel[channelId] || [];
      if (list.some((t) => t._id === canvasMeta._id)) return {};
      const next = {
        ...s.openTabsByChannel,
        [channelId]: [...list, { _id: canvasMeta._id, title: canvasMeta.title || '' }],
      };
      persistOpenTabs(next);
      return { openTabsByChannel: next };
    });
  },

  removeOpenTab: (channelId, canvasId) => {
    if (!channelId || !canvasId) return;
    set((s) => {
      const next = {
        ...s.openTabsByChannel,
        [channelId]: (s.openTabsByChannel[channelId] || []).filter(
          (t) => t._id !== canvasId,
        ),
      };
      persistOpenTabs(next);
      return { openTabsByChannel: next };
    });
  },

  // ── Presence ───────────────────────────────────────────────────────────────
  setPresence: (users) => set({ presence: users || [] }),

  addPresenceUser: (user) => {
    if (!user?._id) return;
    set((s) => {
      if (s.presence.some((u) => u._id === user._id)) return {};
      return { presence: [...s.presence, user] };
    });
  },

  removePresenceUser: (userId) => {
    set((s) => ({ presence: s.presence.filter((u) => u._id !== userId) }));
  },

  // ── Socket Room ────────────────────────────────────────────────────────────
  joinCanvasRoom: (canvasId) => {
    const socket = getSocket();
    if (!socket || !canvasId) return;
    if (get().currentJoinedRoom === canvasId) return;
    socket.emit('canvas:join', { canvasId });
    set({ currentJoinedRoom: canvasId });
    logger.info('[CanvasStore] Joined canvas room:', canvasId);
  },

  leaveCanvasRoom: (canvasId) => {
    const socket = getSocket();
    if (socket && canvasId) {
      socket.emit('canvas:leave', { canvasId });
    }
    if (get().currentJoinedRoom === canvasId) {
      set({ currentJoinedRoom: null, presence: [] });
    }
  },

  // ── Clear active canvas (on screen unmount) ────────────────────────────────
  clearActiveCanvas: () => {
    const room = get().currentJoinedRoom;
    if (room) get().leaveCanvasRoom(room);
    set({ activeCanvas: null, comments: [], history: [], presence: [], currentJoinedRoom: null });
  },

  // ── Handle socket events (called from socket.js global listeners) ──────────
  handleSocketTitleUpdated: ({ canvasId, title }) => {
    set((s) => {
      const nextTabs = { ...s.openTabsByChannel };
      Object.keys(nextTabs).forEach((chId) => {
        nextTabs[chId] = (nextTabs[chId] || []).map((t) =>
          t._id === canvasId ? { ...t, title } : t,
        );
      });
      const nextCanvases = { ...s.canvasesByChannel };
      Object.keys(nextCanvases).forEach((chId) => {
        nextCanvases[chId] = (nextCanvases[chId] || []).map((c) =>
          c._id === canvasId ? { ...c, title } : c,
        );
      });
      const active =
        s.activeCanvas?._id === canvasId
          ? { ...s.activeCanvas, title }
          : s.activeCanvas;
      return {
        openTabsByChannel: nextTabs,
        canvasesByChannel: nextCanvases,
        activeCanvas: active,
      };
    });
  },

  handleSocketDeleted: ({ canvasId }) => {
    set((s) => {
      const cleaned = removeCanvasFromAllState(s, canvasId);
      persistActiveIds(cleaned.activeCanvasIdByChannel);
      persistSavedIds(cleaned.savedCanvasIds);
      return cleaned;
    });
  },

  handleSocketCommentCreated: (comment) => {
    if (!comment) return;
    set((s) => ({ comments: [comment, ...s.comments] }));
  },

  handleSocketCommentReplied: (comment) => {
    if (!comment) return;
    set((s) => ({
      comments: s.comments.map((c) => (c._id === comment._id ? comment : c)),
    }));
  },

  handleSocketCommentResolved: ({ commentId }) => {
    if (!commentId) return;
    set((s) => ({
      comments: s.comments.map((c) =>
        c._id === commentId ? { ...c, resolved: true } : c,
      ),
    }));
  },

  handleSocketSavedLater: ({ canvasId, canvas }) => {
    set((s) => {
      const next = new Set(s.savedCanvasIds);
      next.add(canvasId);
      persistSavedIds(next);
      const newSavedCanvases = canvas && !s.savedCanvases.find(c => c._id === canvasId)
        ? [canvas, ...s.savedCanvases]
        : s.savedCanvases;
      return { savedCanvasIds: next, savedCanvases: newSavedCanvases };
    });
  },

  handleSocketUnsavedLater: ({ canvasId }) => {
    set((s) => {
      const next = new Set(s.savedCanvasIds);
      next.delete(canvasId);
      persistSavedIds(next);
      return {
        savedCanvasIds: next,
        savedCanvases: s.savedCanvases.filter((c) => c._id !== canvasId),
      };
    });
  },
}));
