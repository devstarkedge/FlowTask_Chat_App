import { create } from "zustand";
import { canvasAPI } from "../services/api";
import { getSocket } from "../services/socket";
import { useAuthStore } from "./authStore";
import toast from "react-hot-toast";
import React from "react";

const getUserColor = (userId) => {
  if (!userId) return "#6366f1";
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 75%, 55%)`;
};

export const useCanvasStore = create((set, get) => ({
  canvasesByChannel: {}, // channelId -> array of canvas metadata
  activeCanvas: null, // metadata of active canvas
  blocks: [], // sorted array of blocks
  comments: [], // active unresolved comments
  presence: [], // list of active users in room
  cursors: {}, // userId -> cursor coords { blockId, x, y, name, color }
  typing: {}, // blockId -> { userId -> name }
  history: [], // version snapshots
  activeCanvasIdByChannel: {}, // channelId -> active canvas ID
  lastDeletedCanvas: null, // snapshot used for Undo
  isLoading: false,
  currentJoinedRoom: null,
  globalSocketAttached: false,

  // ── Fetch all canvases in a channel
  fetchChannelCanvases: async (channelId) => {
    set({ isLoading: true });
    // Ensure a global socket listener is attached so remote deletions update lists
    get().ensureGlobalSocketListeners?.();
    try {
      const res = await canvasAPI.getAllForChannel(channelId);
      if (res.data && res.data.success) {
        set((state) => ({
          canvasesByChannel: {
            ...state.canvasesByChannel,
            [channelId]: res.data.data,
          },
        }));
      }
    } catch (err) {
      console.error("[CanvasStore] fetchChannelCanvases error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

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

  ensureGlobalSocketListeners: () => {
    const socket = getSocket();
    if (!socket) return;
    if (get().globalSocketAttached) return;

    // Handle canvas deletions globally so lists stay in sync across clients
    socket.on("canvas:deleted", ({ canvasId: cid, channelId }) => {
      set((state) => {
        const nextCanvases = { ...state.canvasesByChannel };
        Object.keys(nextCanvases).forEach((chId) => {
          nextCanvases[chId] = (nextCanvases[chId] || []).filter((c) => c._id !== cid);
        });

        const activeIdMap = { ...state.activeCanvasIdByChannel };
        Object.keys(activeIdMap).forEach((chId) => {
          if (activeIdMap[chId] === cid) delete activeIdMap[chId];
        });

        const active = state.activeCanvas && state.activeCanvas._id === cid ? null : state.activeCanvas;

        return {
          canvasesByChannel: nextCanvases,
          activeCanvasIdByChannel: activeIdMap,
          activeCanvas: active,
        };
      });
      // If we're in the deleted canvas room, clear editor
      if (cid === get().currentJoinedRoom) get().clearActiveCanvas();
    });

    set({ globalSocketAttached: true });
  },

  // ── Load default canvas for channel
  loadDefaultCanvas: async (channelId) => {
    set({ isLoading: true });
    try {
      const res = await canvasAPI.get(channelId);
      if (res.data && res.data.success) {
        const canvas = res.data.data;
        await get().loadCanvas(canvas._id);
      }
    } catch (err) {
      console.error("[CanvasStore] loadDefaultCanvas error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Create Canvas
  createCanvas: async (channelId, data) => {
    set({ isLoading: true });
    try {
      const res = await canvasAPI.create(channelId, data);
      if (res.data && res.data.success) {
        const newCanvas = res.data.data;
        
        // Add to channel list and mark as active immediately so the editor
        // can seed content before the full load completes.
        set((state) => {
          const currentList = state.canvasesByChannel[channelId] || [];
          return {
            canvasesByChannel: {
              ...state.canvasesByChannel,
              [channelId]: [...currentList, newCanvas],
            },
            activeCanvas: newCanvas,
            activeCanvasIdByChannel: {
              ...state.activeCanvasIdByChannel,
              [channelId]: newCanvas._id,
            },
            blocks: [],
          };
        });

        // Load full canvas details (blocks, comments, and room join)
        await get().loadCanvas(newCanvas._id);
        return newCanvas;
      }
    } catch (err) {
      console.error("[CanvasStore] createCanvas error:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Update Canvas Details (Title/Cover)
  updateCanvasMetadata: async (canvasId, updates) => {
    try {
      const res = await canvasAPI.update(canvasId, updates);
      if (res.data && res.data.success) {
        const updated = res.data.data;
        set((state) => {
          // Update activeCanvas metadata if matches
          const active = state.activeCanvas && state.activeCanvas._id === canvasId
            ? { ...state.activeCanvas, ...updated }
            : state.activeCanvas;

          // Update in channel lists
          const channelId = updated.channelId;
          const list = state.canvasesByChannel[channelId] || [];
          const updatedList = list.map((c) => (c._id === canvasId ? updated : c));

          return {
            activeCanvas: active,
            canvasesByChannel: {
              ...state.canvasesByChannel,
              [channelId]: updatedList,
            },
          };
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
    if (!socket) return;

    socket.emit("canvas:join", { canvasId });
    set({ currentJoinedRoom: canvasId });

    // Setup socket listeners
    socket.on("canvas:presence:list", ({ canvasId: cid, users }) => {
      if (cid !== get().currentJoinedRoom) return;
      set({ presence: users });
    });

    socket.on("canvas:presence:join", ({ canvasId: cid, user }) => {
      if (cid !== get().currentJoinedRoom) return;
      set((state) => {
        if (state.presence.some((p) => p.userId === user.userId)) return {};
        return { presence: [...state.presence, user] };
      });
    });

    socket.on("canvas:presence:leave", ({ canvasId: cid, userId }) => {
      if (cid !== get().currentJoinedRoom) return;
      set((state) => {
        const nextCursors = { ...state.cursors };
        delete nextCursors[userId];
        return {
          presence: state.presence.filter((p) => p.userId !== userId),
          cursors: nextCursors,
        };
      });
    });

    socket.on("canvas:cursor:update", ({ userId, name, blockId, x, y }) => {
      set((state) => ({
        cursors: {
          ...state.cursors,
          [userId]: {
            blockId,
            x,
            y,
            name,
            color: getUserColor(userId),
          },
        },
      }));
    });

    socket.on("canvas:typing:update", ({ userId, name, blockId, isTyping }) => {
      set((state) => {
        const blockTyping = { ...(state.typing[blockId] || {}) };
        if (isTyping) {
          blockTyping[userId] = name;
        } else {
          delete blockTyping[userId];
        }

        return {
          typing: {
            ...state.typing,
            [blockId]: blockTyping,
          },
        };
      });
    });

    socket.on("canvas:block:created", (newBlock) => {
      set((state) => {
        const newBlocks = [...state.blocks, newBlock].sort((a, b) => a.order - b.order);
        return { blocks: newBlocks };
      });
    });

    socket.on("canvas:block:updated", ({ blockId, content, type, lastEditedBy }) => {
      const currentUserId = useAuthStore.getState().user?._id;
      // Skip socket updates from ourselves to prevent focus loss & resetting text cursor
      if (lastEditedBy === currentUserId) return;

      set((state) => {
        const updatedBlocks = state.blocks.map((b) => {
          if (b._id === blockId) {
            return { ...b, content, type };
          }
          return b;
        });
        return { blocks: updatedBlocks };
      });
    });

    socket.on("canvas:block:deleted", ({ blockId }) => {
      set((state) => ({
        blocks: state.blocks.filter((b) => b._id !== blockId),
        comments: state.comments.filter((c) => c.blockId !== blockId),
      }));
    });

    socket.on("canvas:block:reordered", ({ blockIdsOrder }) => {
      set((state) => {
        const blocksMap = new Map(state.blocks.map((b) => [b._id, b]));
        const reordered = blockIdsOrder
          .map((id) => blocksMap.get(id))
          .filter(Boolean);

        // Append any blocks that might not be in the ordering array (safety fallback)
        state.blocks.forEach((b) => {
          if (!blockIdsOrder.includes(b._id)) {
            reordered.push(b);
          }
        });

        return { blocks: reordered };
      });
    });

    socket.on("canvas:reaction:updated", ({ blockId, reactions }) => {
      set((state) => {
        const updatedBlocks = state.blocks.map((b) => {
          if (b._id === blockId) {
            return { ...b, reactions };
          }
          return b;
        });
        return { blocks: updatedBlocks };
      });
    });

    // ── Comment Socket listeners
    socket.on("canvas:comment:created", (populatedComment) => {
      set((state) => ({
        comments: [...state.comments, populatedComment],
      }));
    });

    socket.on("canvas:comment:replied", (populatedComment) => {
      set((state) => ({
        comments: state.comments.map((c) =>
          c._id === populatedComment._id ? populatedComment : c
        ),
      }));
    });

    socket.on("canvas:comment:resolved", ({ commentId }) => {
      set((state) => ({
        comments: state.comments.filter((c) => c._id !== commentId),
      }));
    });

    socket.on("canvas:restored", ({ canvasId: cid, title, cover }) => {
      if (cid !== get().currentJoinedRoom) return;
      // Re-load canvas when restored
      get().loadCanvas(cid);
    });

    socket.on("canvas:updated", ({ canvasId: cid, updates }) => {
      if (cid !== get().currentJoinedRoom) return;
      set((state) => {
        if (state.activeCanvas && state.activeCanvas._id === cid) {
          return {
            activeCanvas: { ...state.activeCanvas, ...updates },
          };
        }
        return {};
      });
    });

    socket.on("canvas:deleted", ({ canvasId: cid, channelId }) => {
      // Remove deleted canvas from all channel lists and clear any active mappings
      set((state) => {
        const nextCanvases = { ...state.canvasesByChannel };
        Object.keys(nextCanvases).forEach((chId) => {
          nextCanvases[chId] = (nextCanvases[chId] || []).filter((c) => c._id !== cid);
        });

        const activeIdMap = { ...state.activeCanvasIdByChannel };
        Object.keys(activeIdMap).forEach((chId) => {
          if (activeIdMap[chId] === cid) delete activeIdMap[chId];
        });

        const active = state.activeCanvas && state.activeCanvas._id === cid ? null : state.activeCanvas;

        return {
          canvasesByChannel: nextCanvases,
          activeCanvasIdByChannel: activeIdMap,
          activeCanvas: active,
        };
      });

      // If we're currently in the deleted canvas room, leave it and clear editor state
      if (cid === get().currentJoinedRoom) {
        get().clearActiveCanvas();
      }
    });
  },

  leaveCanvasRoom: (canvasId) => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit("canvas:leave", { canvasId });

    // Tear down socket listeners
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

    set({ currentJoinedRoom: null });
  },

  // ── Client Triggered Interactions
  updateCursor: (blockId, x, y) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    if (socket && canvasId) {
      socket.emit("canvas:cursor", { canvasId, blockId, x, y });
    }
  },

  setBlockTyping: (blockId, isTyping) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    if (socket && canvasId) {
      socket.emit("canvas:typing", { canvasId, blockId, isTyping });
    }
  },

  createBlock: (blockData) => {
    const socket = getSocket();
    const canvasId = get().currentJoinedRoom;
    if (socket && canvasId) {
      socket.emit("canvas:block:create", { canvasId, blockData });
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

    if (socket && canvasId) {
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
      socket.emit("canvas:block:delete", { canvasId, blockId });
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
      socket.emit("canvas:block:reorder", { canvasId, blockIdsOrder });
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