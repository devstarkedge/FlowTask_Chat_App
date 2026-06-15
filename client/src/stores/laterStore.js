import { create } from 'zustand';
import { savedMessageAPI } from '../services/api';
import toast from 'react-hot-toast';
import { useNotificationStore } from './notificationStore';

export const useLaterStore = create((set, get) => ({
  savedMessages: [],
  loading: false,
  activeTab: 'in_progress',
  activeSavedMessageId: null,
  savedMessageIds: new Set(), // Track which messages are saved for instant UI updates
  
  fetchSavedMessages: async (status = null) => {
    set({ loading: true });
    try {
      // Always fetch all to keep counts in background accurate across all status tabs
      const { data } = await savedMessageAPI.list(null);
      const messages = data.data?.messages || [];
      // Build saved message ID set for instant lookup in ChatPanel
      const ids = new Set(messages.map(m => m.messageId?._id).filter(Boolean));
      set({ savedMessages: messages, loading: false, savedMessageIds: ids });
    } catch (error) {
      set({ loading: false });
      toast.error('Failed to load saved messages');
    }
  },

  toggleSaveMessage: async (messageId) => {
    if (!messageId) return;
    
    const wasSaved = get().savedMessageIds.has(messageId);
    const prevSavedMessages = [...get().savedMessages];
    const prevIds = new Set(get().savedMessageIds);

    try {
      // Optimistic update for the ID set (used for icon states in ChatPanel)
      const newIds = new Set(prevIds);
      if (wasSaved) {
        newIds.delete(messageId);
        set({ 
          savedMessageIds: newIds,
          savedMessages: prevSavedMessages.filter(m => m.messageId?._id !== messageId)
        });
      } else {
        newIds.add(messageId);
        set({ savedMessageIds: newIds });
      }

      const { data } = await savedMessageAPI.toggle(messageId);
      const { saved, savedMessage } = data.data;

      if (saved && savedMessage) {
        get().addSavedMessage(savedMessage);
        toast.success('Message Saved');
      } else if (!saved) {
        get().removeSavedMessage(messageId);
        toast.success('Message removed from Later');
      }
    } catch (error) {
      set({ savedMessages: prevSavedMessages, savedMessageIds: prevIds });
      toast.error('Failed to update saved status');
    }
  },

  updateStatus: async (idOrMessageId, status) => {
    try {
      // Optimistically update status in local list
      set((state) => ({
        savedMessages: state.savedMessages.map((m) =>
          (m._id === idOrMessageId || m.messageId?._id === idOrMessageId) 
            ? { ...m, status } 
            : m
        ),
      }));

      await savedMessageAPI.updateStatus(idOrMessageId, status);
      toast.success(`Moved to ${status.replace('_', ' ')}`);
    } catch (error) {
      get().fetchSavedMessages();
      toast.error('Failed to update status');
    }
  },

  updateReminder: async (messageId, reminderData) => {
    if (!messageId) {
      toast.error('No message selected');
      return;
    }
    const prevMessages = [...get().savedMessages];
    
    // Optimistic update for immediate feedback
    set((state) => ({
      savedMessages: state.savedMessages.map((m) =>
        m.messageId?._id === messageId || m._id === messageId
          ? {
              ...m,
              reminderAt: reminderData.reminderAt,
              recurrence: reminderData.recurrence,
              reminderDescription: reminderData.reminderDescription,
            }
          : m
      ),
    }));

    try {
      await savedMessageAPI.updateReminder(messageId, reminderData);
    } catch (error) {
      set({ savedMessages: prevMessages });
      console.error('Failed to update reminder:', error);
      toast.error('Failed to set reminder');
      throw error;
    }

    // Success path
    const reminderDate = new Date(reminderData.reminderAt);
    const formattedDate = reminderDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    toast.success(`Reminder set for ${formattedDate}`, {
      duration: 3000,
      icon: '⏰'
    });
    
    // Background updates - don't await to keep UI snappy
    get().fetchSavedMessages(get().activeTab).catch(console.error);
    if (useNotificationStore?.getState) {
      useNotificationStore.getState().fetchNotifications(true).catch(console.error);
    }
  },

  snoozeReminder: async (messageId, snoozeUntil) => {
    try {
      const { data } = await savedMessageAPI.snooze(messageId, { snoozeUntil });
      const saved = data.data?.saved;
      if (saved) {
        get().addSavedMessage(saved);
        toast.success('Reminder snoozed');
      }
    } catch (err) {
      console.error('Failed to snooze reminder', err);
      toast.error('Failed to snooze reminder');
      throw err;
    }
  },

  parseText: async (text, referenceDate) => {
    try {
      const { data } = await savedMessageAPI.parseText(text, referenceDate);
      return data.data?.suggestions || [];
    } catch (err) {
      console.error('Failed to parse text for reminders', err);
      return [];
    }
  },

  suggestFromMessage: async (messageId) => {
    try {
      const { data } = await savedMessageAPI.suggestFromMessage(messageId);
      return data.data?.suggestions || [];
    } catch (err) {
      console.error('Failed to get suggestions', err);
      return [];
    }
  },

  createStandaloneReminder: async (reminderData) => {
    try {
      const { data } = await savedMessageAPI.createStandalone(reminderData);
      const newReminder = data.data?.savedMessage;

      if (newReminder) {
        set((state) => ({
          savedMessages: [newReminder, ...state.savedMessages],
        }));
      } else {
        get().fetchSavedMessages(get().activeTab).catch(console.error);
      }
    } catch (error) {
      console.error('Failed to create reminder:', error);
      toast.error('Failed to create reminder');
      throw error;
    }

    // Success path
    const reminderDate = new Date(reminderData.reminderAt);
    const formattedDate = reminderDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    toast.success(`Reminder "${reminderData.title}" created for ${formattedDate}`, {
      duration: 3000,
      icon: '⏰'
    });
    
    // Background updates
    if (useNotificationStore?.getState) {
      useNotificationStore.getState().fetchNotifications(true).catch(console.error);
    }
  },

  deleteReminder: async (reminderId) => {
    try {
      await savedMessageAPI.deleteReminder(reminderId);
      set((state) => ({
        savedMessages: state.savedMessages.filter((m) => m._id !== reminderId),
      }));
      toast.success('Reminder deleted');
    } catch (error) {
      toast.error('Failed to delete reminder');
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setActiveSavedMessageId: (id) => set({ activeSavedMessageId: id }),

  clearActiveSavedMessageId: () => set({ activeSavedMessageId: null }),

  // Get counts by status for badges
  getCountByStatus: (status) => {
    return get().savedMessages.filter(m => m.status === status).length;
  },

  // Get total saved count (all statuses)
  getTotalSavedCount: () => {
    return get().savedMessages.length;
  },

  // Check if a message is saved
  isMessageSaved: (messageId) => {
    return get().savedMessageIds.has(messageId);
  },

  // Real-time socket handler: add or update saved message
  addSavedMessage: (savedMessage) => {
    set((state) => {
      const incomingMessageId = savedMessage.messageId?._id;

      // Dedup: first try by _id (if non-null), then by messageId._id
      let index = -1;
      if (savedMessage._id) {
        index = state.savedMessages.findIndex(m => m._id === savedMessage._id);
      }
      if (index === -1 && incomingMessageId) {
        index = state.savedMessages.findIndex(m => m.messageId?._id === incomingMessageId);
      }

      let newMessages = [...state.savedMessages];
      if (index !== -1) {
        // Update existing (merge, preserving _id if incoming is null)
        newMessages[index] = {
          ...newMessages[index],
          ...savedMessage,
          _id: savedMessage._id || newMessages[index]._id,
        };
      } else {
        // Add new
        newMessages = [savedMessage, ...newMessages];
      }

      const newIds = new Set(state.savedMessageIds);
      if (incomingMessageId) {
        newIds.add(incomingMessageId);
      }
      return {
        savedMessages: newMessages,
        savedMessageIds: newIds,
      };
    });
  },

  // Real-time socket handler: remove saved message
  removeSavedMessage: (messageId) => {
    set((state) => {
      const newIds = new Set(state.savedMessageIds);
      newIds.delete(messageId);
      return {
        savedMessages: state.savedMessages.filter((m) => m.messageId?._id !== messageId),
        savedMessageIds: newIds,
      };
    });
  },

  // Real-time socket handler: update saved message status
  updateSavedMessageStatus: (messageId, status) => {
    set((state) => ({
      savedMessages: state.savedMessages.map((m) =>
        m.messageId?._id === messageId ? { ...m, status } : m
      ),
    }));
  },

  clearSavedMessages: () => set({ savedMessages: [], activeTab: 'in_progress', savedMessageIds: new Set(), activeSavedMessageId: null }),
}));
