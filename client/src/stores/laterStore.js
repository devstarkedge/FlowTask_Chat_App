import { create } from 'zustand';
import { savedMessageAPI } from '../services/api';
import toast from 'react-hot-toast';

export const useLaterStore = create((set, get) => ({
  savedMessages: [],
  loading: false,
  activeTab: 'in_progress',
  
  fetchSavedMessages: async (status = null) => {
    set({ loading: true });
    try {
      const { data } = await savedMessageAPI.list(status);
      set({ savedMessages: data.data?.messages || [], loading: false });
    } catch (error) {
      set({ loading: false });
      toast.error('Failed to load saved messages');
    }
  },

  toggleSaveMessage: async (messageId) => {
    try {
      const { data } = await savedMessageAPI.toggle(messageId);
      if (data.data.saved) {
        toast.success('Message saved');
        get().fetchSavedMessages(get().activeTab === 'in_progress' ? 'in_progress' : null);
      } else {
        set((state) => ({
          savedMessages: state.savedMessages.filter((m) => m.messageId?._id !== messageId),
        }));
        toast.success('Message removed');
      }
    } catch (error) {
      toast.error('Failed to save message');
    }
  },

  updateStatus: async (idOrMessageId, status) => {
    try {
      await savedMessageAPI.updateStatus(idOrMessageId, status);
      // Remove from current list since status changed
      set((state) => ({
        savedMessages: state.savedMessages.filter((m) => 
          m._id !== idOrMessageId && m.messageId?._id !== idOrMessageId
        ),
      }));
      toast.success(`Moved to ${status.replace('_', ' ')}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  },

  updateReminder: async (messageId, reminderData) => {
    if (!messageId) {
      toast.error('No message selected');
      return;
    }
    try {
      await savedMessageAPI.updateReminder(messageId, reminderData);
      await get().fetchSavedMessages(get().activeTab);
      toast.success('Reminder set successfully');
    } catch (error) {
      console.error('Failed to update reminder:', error);
      toast.error('Failed to set reminder');
      throw error;
    }
  },

  createStandaloneReminder: async (reminderData) => {
    try {
      await savedMessageAPI.createStandalone(reminderData);
      await get().fetchSavedMessages(get().activeTab);
      toast.success('Reminder created');
    } catch (error) {
      console.error('Failed to create reminder:', error);
      toast.error('Failed to create reminder');
      throw error;
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

  clearSavedMessages: () => set({ savedMessages: [], activeTab: 'in_progress' }),
}));
