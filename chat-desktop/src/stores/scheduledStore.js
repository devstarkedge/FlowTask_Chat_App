import { create } from 'zustand'
import { scheduledMessageAPI } from '../services/api'
import toast from 'react-hot-toast'
import { useWorkspaceStore } from './workspaceStore'

export const useScheduledStore = create((set, get) => ({
  scheduledMessages: [],
  loading: false,
  initialized: false,
  editingMessage: null,
  scheduledCount: 0,

  setEditingMessage: (message) => {
    set({ editingMessage: message })
  },

  clearEditingMessage: () => {
    set({ editingMessage: null })
  },

  fetchScheduledMessages: async () => {
    if (!useWorkspaceStore.getState().activeWorkspaceId) return;
    set({ loading: true })
    try {
      const { data } = await scheduledMessageAPI.list()
      const messages = data?.data?.messages || []
      set({ scheduledMessages: messages, scheduledCount: messages.length, loading: false, initialized: true })
    } catch (error) {
      set({ loading: false })
      console.error('Failed to fetch scheduled messages:', error)
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
    }))
  },

  cancelScheduledMessage: async (id) => {
    try {
      await scheduledMessageAPI.cancel(id)
      get().removeScheduledMessage(id)
      toast.success('Scheduled message cancelled')
    } catch (error) {
      console.error('Failed to cancel scheduled message:', error)
      toast.error('Failed to cancel')
      throw error
    }
  },

  getScheduledCount: () => {
    return get().scheduledCount || get().scheduledMessages.length
  },

  setScheduledCount: (count) => {
    set({ scheduledCount: count })
  },

  // Socket handlers
  handleScheduledSent: ({ scheduledMessageId }) => {
    get().removeScheduledMessage(scheduledMessageId)
  },

  handleScheduledCancelled: ({ scheduledMessageId }) => {
    get().removeScheduledMessage(scheduledMessageId)
  },

  handleScheduledFailed: ({ scheduledMessageId, error }) => {
    // Optionally handle failure
    console.error('Scheduled message failed:', scheduledMessageId, error)
  }
}))
