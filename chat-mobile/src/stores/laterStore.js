import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import { laterAPI, resolveWorkspaceId } from '../services/api';
import logger from '../utils/logger';

export const useLaterStore = create(
  persist(
    (set, get) => ({
      savedMessages: [],
      savedCount: 0,
      isLoading: false,
      savedMessageIds: [],

      fetchSavedMessages: async () => {
        if (!resolveWorkspaceId()) {
          logger.warn('[LaterStore] Skipping fetchSavedMessages — no active workspace');
          return;
        }
        set({ isLoading: true });
        try {
          const { data } = await laterAPI.list();
          const messages = data.data?.messages || [];
          const ids = messages.map(m => m.messageId?._id).filter(Boolean);
          set({ 
            savedMessages: messages, 
            savedCount: messages.length,
            savedMessageIds: ids,
            isLoading: false 
          });
        } catch (error) {
          set({ isLoading: false, savedMessages: [], savedCount: 0 });
          logger.error('Failed to fetch saved messages:', error);
        }
      },

      toggleSaveMessage: async (messageId, channelId) => {
        if (!messageId) return;
        
        const wasSaved = get().savedMessageIds.includes(messageId);
        const prevSavedMessages = [...get().savedMessages];
        const prevIds = [...get().savedMessageIds];

        try {
          let newIds;
          if (wasSaved) {
            newIds = prevIds.filter(id => id !== messageId);
            set({ 
              savedMessageIds: newIds,
              savedMessages: prevSavedMessages.filter(m => m.messageId?._id !== messageId),
              savedCount: get().savedCount - 1,
            });
          } else {
            newIds = [...prevIds, messageId];
            set({ savedMessageIds: newIds, savedCount: get().savedCount + 1 });
          }

          const { data } = await laterAPI.toggle(messageId);
          const { saved, savedMessage } = data.data;

          if (saved && savedMessage) {
            get().addSavedMessage(savedMessage);
          } else if (!saved) {
            get().removeSavedMessage(messageId);
          }
        } catch (error) {
          set({ savedMessages: prevSavedMessages, savedMessageIds: prevIds });
          logger.error('Failed to toggle save:', error);
        }
      },

      deleteSavedItem: async (savedMessageId, messageId) => {
        if (!savedMessageId) return;

        const prevSavedMessages = [...get().savedMessages];
        const prevIds = [...get().savedMessageIds];

        try {
          // Optimistic UI updates
          set({
            savedMessages: prevSavedMessages.filter(m => m._id !== savedMessageId),
            savedMessageIds: messageId ? prevIds.filter(id => id !== messageId) : prevIds,
            savedCount: Math.max(0, get().savedCount - 1),
          });

          await laterAPI.deleteReminder(savedMessageId);
        } catch (error) {
          logger.error('Failed to delete saved item:', error);
          // Rollback
          set({
            savedMessages: prevSavedMessages,
            savedMessageIds: prevIds,
            savedCount: prevSavedMessages.length,
          });
          throw error;
        }
      },

      updateStatus: async (messageId, status) => {
        try {
          set((state) => ({
            savedMessages: state.savedMessages.map((m) =>
              (m._id === messageId || m.messageId?._id === messageId) 
                ? { ...m, status } 
                : m
            ),
          }));

          await laterAPI.updateStatus(messageId, status);
        } catch (error) {
          get().fetchSavedMessages();
          logger.error('Failed to update status:', error);
        }
      },

      updateReminder: async (messageId, reminderData) => {
        try {
          const reminderAt = typeof reminderData === 'string' ? reminderData : (reminderData?.date || null);
          const rawRecurrence = typeof reminderData === 'object' ? (reminderData.recurrence || 'None') : 'None';
          const recurrence = rawRecurrence.toLowerCase();

          set((state) => ({
            savedMessages: state.savedMessages.map((m) =>
              (m._id === messageId || m.messageId?._id === messageId)
                ? { ...m, reminderAt, recurrence }
                : m
            ),
          }));
          const targetId = messageId;
          await laterAPI.updateReminder(targetId, { reminderAt, recurrence });
        } catch (error) {
          get().fetchSavedMessages();
          logger.error('Failed to update reminder:', error);
        }
      },

      // Local-only status update — used by socket handler to avoid API feedback loop
      updateSavedMessageStatus: (messageId, status) => {
        set((state) => ({
          savedMessages: state.savedMessages.map((m) =>
            (m._id === messageId || m.messageId?._id === messageId)
              ? { ...m, status }
              : m
          ),
        }));
      },

      isMessageSaved: (messageId) => {
        return get().savedMessageIds.includes(messageId);
      },

      addSavedMessage: (savedMessage) => {
        set((state) => {
          const index = state.savedMessages.findIndex(m => m._id === savedMessage._id);
          let newMessages = [...state.savedMessages];
          
          if (index !== -1) {
            newMessages[index] = { ...newMessages[index], ...savedMessage };
          } else {
            newMessages = [savedMessage, ...newMessages];
          }

          const newIds = [...state.savedMessageIds];
          if (savedMessage.messageId?._id && !newIds.includes(savedMessage.messageId._id)) {
            newIds.push(savedMessage.messageId._id);
          }
          return {
            savedMessages: newMessages,
            savedMessageIds: newIds,
            savedCount: newMessages.length,
          };
        });
      },

      addCustomReminder: async (reminder) => {
        try {
          const { activeWorkspaceId } = require('./workspaceStore').useWorkspaceStore.getState();
          if (!activeWorkspaceId) throw new Error('No active workspace');
          
          await laterAPI.createStandaloneReminder({
            title: reminder.description || 'Custom Reminder',
            reminderAt: reminder.date,
            recurrence: (reminder.recurrence || 'none').toLowerCase(),
          }, {
            headers: { 'X-Workspace-Id': activeWorkspaceId }
          });
          
          // No need to update local state immediately; the backend will emit 
          // a 'savedMessage:added' socket event which will automatically add it.
        } catch (error) {
          logger.error('Failed to create custom reminder:', error);
          throw error;
        }
      },

      removeSavedMessage: (messageId) => {
        set((state) => {
          const newIds = state.savedMessageIds.filter(id => id !== messageId);
          const newMessages = state.savedMessages.filter((m) => m.messageId?._id !== messageId);
          return {
            savedMessages: newMessages,
            savedMessageIds: newIds,
            savedCount: newMessages.length,
          };
        });
      },

      clearSavedMessages: () => set({ 
        savedMessages: [], 
        savedCount: 0,
        savedMessageIds: []
      }),
    }),
    {
      name: 'flowtask-later-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ 
        savedCount: state.savedCount,
      }),
    }
  )
);
