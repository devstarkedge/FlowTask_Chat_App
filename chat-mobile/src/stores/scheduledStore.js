import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import storage from '../services/storage';
import { scheduledAPI } from '../services/api';
import logger from '../utils/logger';

export const useScheduledStore = create(
  persist(
    (set, get) => ({
      scheduledMessages: [],
      scheduledCount: 0,
      isLoading: false,
      editingMessage: null,

      setEditingMessage: (message) => {
        set({ editingMessage: message });
      },

      clearEditingMessage: () => {
        set({ editingMessage: null });
      },

      fetchScheduledMessages: async () => {
        set({ isLoading: true });
        try {
          const { data } = await scheduledAPI.list();
          const messages = data?.data?.messages || [];
          set({ 
            scheduledMessages: messages, 
            scheduledCount: messages.length, 
            isLoading: false 
          });
        } catch (error) {
          set({ isLoading: false, scheduledMessages: [], scheduledCount: 0 });
          logger.error('Failed to fetch scheduled messages:', error);
        }
      },

      createScheduledMessage: async (channelId, payload) => {
        try {
          const { data } = await scheduledAPI.create(channelId, payload);
          const message = data?.data?.scheduledMessage || data?.data;
          if (message) {
            get().addScheduledMessage(message);
          }
          return message;
        } catch (error) {
          logger.error('Failed to create scheduled message:', error);
          throw error;
        }
      },

      addScheduledMessage: (message) => {
        set((state) => {
          const newMessages = [message, ...state.scheduledMessages];
          return {
            scheduledMessages: newMessages,
            scheduledCount: newMessages.length
          };
        });
      },

      removeScheduledMessage: (scheduledMessageId) => {
        set((state) => {
          const newMessages = state.scheduledMessages.filter(m => m._id !== scheduledMessageId);
          return {
            scheduledMessages: newMessages,
            scheduledCount: newMessages.length
          };
        });
      },

      updateScheduledMessage: (id, updates) => {
        set((state) => ({
          scheduledMessages: state.scheduledMessages.map(m => 
            m._id === id ? { ...m, ...updates } : m
          )
        }));
      },

      cancelScheduledMessage: async (id) => {
        try {
          await scheduledAPI.cancel(id);
          get().removeScheduledMessage(id);
        } catch (error) {
          logger.error('Failed to cancel scheduled message:', error);
          throw error;
        }
      },

      rescheduleMessage: async (id, scheduledAt) => {
        try {
          const { data } = await scheduledAPI.reschedule(id, scheduledAt);
          const updated = data?.data?.scheduledMessage || data?.data?.message || data?.data;
          if (updated) {
            get().updateScheduledMessage(id, updated);
          }
        } catch (error) {
          logger.error('Failed to reschedule message:', error);
          throw error;
        }
      },

      editScheduledMessageText: async (id, content, htmlContent) => {
        try {
          const payload = { content };
          if (htmlContent) payload.htmlContent = htmlContent;
          const { data } = await scheduledAPI.update(id, payload);
          const updated = data?.data?.scheduledMessage || data?.data?.message || data?.data;
          if (updated) {
            get().updateScheduledMessage(id, updated);
          }
        } catch (error) {
          logger.error('Failed to edit scheduled message:', error);
          throw error;
        }
      },

      sendNowScheduledMessage: async (id) => {
        try {
          await scheduledAPI.sendNow(id);
          get().removeScheduledMessage(id);
        } catch (error) {
          logger.error('Failed to send scheduled message now:', error);
          throw error;
        }
      },

      handleScheduledSent: ({ scheduledMessageId }) => {
        get().removeScheduledMessage(scheduledMessageId);
      },

      handleScheduledCancelled: ({ scheduledMessageId }) => {
        get().removeScheduledMessage(scheduledMessageId);
      },

      handleScheduledFailed: ({ scheduledMessageId, error }) => {
        logger.error('Scheduled message failed:', scheduledMessageId, error);
      },

      clearScheduledMessages: () => set({ 
        scheduledMessages: [], 
        scheduledCount: 0,
        editingMessage: null 
      }),
    }),
    {
      name: 'flowtask-scheduled-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ 
        scheduledCount: state.scheduledCount,
      }),
    }
  )
);
