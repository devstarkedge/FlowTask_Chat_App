import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { laterAPI } from '../services/api';

export const useLaterStore = create(
  persist(
    (set, get) => ({
      savedMessages: [],
      savedCount: 0,
      isLoading: false,
      savedMessageIds: new Set(),

      fetchSavedMessages: async () => {
        set({ isLoading: true });
        try {
          const { data } = await laterAPI.list();
          const messages = data.data?.messages || [];
          const ids = new Set(messages.map(m => m.messageId?._id).filter(Boolean));
          set({ 
            savedMessages: messages, 
            savedCount: messages.length,
            savedMessageIds: ids,
            isLoading: false 
          });
        } catch (error) {
          set({ isLoading: false, savedMessages: [], savedCount: 0 });
          console.error('Failed to fetch saved messages:', error);
        }
      },

      toggleSaveMessage: async (messageId, channelId) => {
        if (!messageId) return;
        
        const wasSaved = get().savedMessageIds.has(messageId);
        const prevSavedMessages = [...get().savedMessages];
        const prevIds = new Set(get().savedMessageIds);

        try {
          const newIds = new Set(prevIds);
          if (wasSaved) {
            newIds.delete(messageId);
            set({ 
              savedMessageIds: newIds,
              savedMessages: prevSavedMessages.filter(m => m.messageId?._id !== messageId),
              savedCount: get().savedCount - 1,
            });
          } else {
            newIds.add(messageId);
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
          console.error('Failed to toggle save:', error);
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
          console.error('Failed to update status:', error);
        }
      },

      isMessageSaved: (messageId) => {
        return get().savedMessageIds.has(messageId);
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

          const newIds = new Set(state.savedMessageIds);
          if (savedMessage.messageId?._id) {
            newIds.add(savedMessage.messageId._id);
          }
          return {
            savedMessages: newMessages,
            savedMessageIds: newIds,
            savedCount: newMessages.length,
          };
        });
      },

      removeSavedMessage: (messageId) => {
        set((state) => {
          const newIds = new Set(state.savedMessageIds);
          newIds.delete(messageId);
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
        savedMessageIds: new Set() 
      }),
    }),
    {
      name: 'flowtask-later-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        savedCount: state.savedCount,
      }),
    }
  )
);
