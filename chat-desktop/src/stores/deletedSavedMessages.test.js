import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ deleteMessage: vi.fn(), list: vi.fn() }))
vi.mock('../services/api', () => ({
  messageAPI: { delete: mocks.deleteMessage },
  threadAPI: {},
  botAPI: {},
  savedMessageAPI: { list: mocks.list },
}))
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ user: { _id: 'author-1' } }) } }))
vi.mock('./channelStore', () => ({ useChannelStore: { getState: () => ({}) } }))
vi.mock('./workspaceStore', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'workspace-1' }) } }))
vi.mock('./notificationStore', () => ({ useNotificationStore: { getState: () => ({}) } }))
vi.mock('../services/messageCache', () => ({
  loadChannelMessagesFromCache: vi.fn(),
  saveChannelMessagesToCache: vi.fn(),
  clearMessageCache: vi.fn(),
}))
vi.mock('../components/notifications/MentionToast', () => ({ default: () => null }))
vi.mock('../components/notifications/NotificationToast', () => ({ default: () => null }))
vi.mock('../utils/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { useChatStore } from './chatStore'
import { useLaterStore } from './laterStore'

const bookmark = { _id: 'saved-1', messageId: { _id: 'message-1', content: 'Saved text' }, status: 'in_progress' }
const reminder = { _id: 'reminder-1', type: 'standalone', messageId: null, status: 'in_progress' }

beforeEach(() => {
  vi.clearAllMocks()
  useLaterStore.setState({
    savedMessages: [bookmark, reminder],
    savedMessageIds: new Set(['message-1']),
    activeSavedMessageId: 'saved-1',
  })
  useChatStore.setState({ messagesByChannel: { 'channel-1': [bookmark.messageId] } })
  mocks.deleteMessage.mockResolvedValue({})
})

describe('deleted saved messages', () => {
  it('removes a deleted message from Later after HTTP succeeds without a socket event', async () => {
    await useChatStore.getState().deleteMessage('message-1', 'channel-1')
    expect(useLaterStore.getState().savedMessages).toEqual([reminder])
    expect(useLaterStore.getState().savedMessageIds.has('message-1')).toBe(false)
    expect(useLaterStore.getState().activeSavedMessageId).toBeNull()
    expect(useLaterStore.getState().getTotalSavedCount()).toBe(1)
    expect(useChatStore.getState().messagesByChannel['channel-1'][0].isDeleted).toBe(true)
  })

  it('keeps the bookmark when deletion fails', async () => {
    mocks.deleteMessage.mockRejectedValueOnce(new Error('Delete failed'))
    await useChatStore.getState().deleteMessage('message-1', 'channel-1')
    expect(useLaterStore.getState().savedMessages).toEqual([bookmark, reminder])
    expect(useLaterStore.getState().savedMessageIds.has('message-1')).toBe(true)
  })

  it('handles repeated realtime removals and unpopulated message IDs', () => {
    useLaterStore.setState({ savedMessages: [{ ...bookmark, messageId: 'message-1' }, reminder] })
    useLaterStore.getState().removeSavedMessage('message-1')
    useLaterStore.getState().removeSavedMessage('message-1')
    expect(useLaterStore.getState().savedMessages).toEqual([reminder])
    expect(useLaterStore.getState().activeSavedMessageId).toBeNull()
  })

  it('filters old deleted and missing messages on reload, preserving standalone reminders', async () => {
    mocks.list.mockResolvedValue({ data: { data: { messages: [
      bookmark, reminder,
      { _id: 'saved-deleted', messageId: { _id: 'deleted-1', isDeleted: true } },
      { _id: 'saved-missing', messageId: null },
    ] } } })
    await useLaterStore.getState().fetchSavedMessages()
    expect(useLaterStore.getState().savedMessages).toEqual([bookmark, reminder])
    expect([...useLaterStore.getState().savedMessageIds]).toEqual(['message-1'])
  })
})
