import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ channelAPI: {}, readReceiptAPI: {}, categoryAPI: {}, messageAPI: {}, threadAPI: {}, botAPI: {}, savedMessageAPI: {} }))
vi.mock('./socket', () => ({ getSocket: () => null }))
vi.mock('../stores/authStore', () => ({ useAuthStore: { getState: () => ({ user: { _id: 'user-1' } }) } }))
vi.mock('../stores/workspaceStore', () => ({ useWorkspaceStore: { getState: () => ({ activeWorkspaceId: 'workspace-1' }) } }))
vi.mock('../components/notifications/MentionToast', () => ({ default: () => null }))
vi.mock('../components/notifications/NotificationToast', () => ({ default: () => null }))

import { useChannelStore } from '../stores/channelStore'
import { useChatStore } from '../stores/chatStore'
import { handleChannelRemoved } from './channelEvents'

const removed = { _id: 'project-channel', type: 'project' }
const other = { _id: 'other-channel', type: 'public' }
const thread = { rootMessageId: 'root-1', channelId: removed._id }

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useChannelStore.setState({
    channels: [removed, other], activeChannelId: removed._id, showInfoPanel: true,
    membersByChannel: { [removed._id]: ['user-1'], [other._id]: ['user-2'] },
    unreads: { [removed._id]: 3, [other._id]: 2 },
    lastReadByChannel: { [removed._id]: 'message-1', [other._id]: 'message-2' },
  })
  useChatStore.getState().openThread(thread)
})

describe('project channel removal events', () => {
  it('removes the sidebar entry, active selection, thread and unread/member state immediately', () => {
    handleChannelRemoved({ channelId: removed._id, workspaceId: 'workspace-1', reason: 'project_deleted' })
    const state = useChannelStore.getState()
    expect(state.channels).toEqual([other])
    expect(state.activeChannelId).toBeNull()
    expect(state.showInfoPanel).toBe(false)
    expect(state.membersByChannel).toEqual({ [other._id]: ['user-2'] })
    expect(state.unreads).toEqual({ [other._id]: 2 })
    expect(state.lastReadByChannel).toEqual({ [other._id]: 'message-2' })
    expect(useChatStore.getState().activeThread).toBeNull()
    expect(sessionStorage.getItem('chat_activeThread')).toBeNull()
    expect(JSON.parse(localStorage.getItem('flowtask-channel-storage')).state.channels).toEqual([other])
  })

  it('keeps another selected channel and its thread open', () => {
    useChannelStore.setState({ activeChannelId: other._id })
    useChatStore.getState().openThread({ ...thread, channelId: other._id })
    handleChannelRemoved({ channelId: removed._id, workspaceId: 'workspace-1' })
    expect(useChannelStore.getState().activeChannelId).toBe(other._id)
    expect(useChatStore.getState().activeThread.channelId).toBe(other._id)
  })

  it('ignores events for a workspace the user has left', () => {
    handleChannelRemoved({ channelId: removed._id, workspaceId: 'old-workspace' })
    expect(useChannelStore.getState().channels).toEqual([removed, other])
    expect(useChatStore.getState().activeThread).toEqual(thread)
  })

  it('handles repeated deliveries and legacy member-removal events without workspace IDs', () => {
    handleChannelRemoved({ channelId: removed._id })
    handleChannelRemoved({ channelId: removed._id })
    expect(useChannelStore.getState().channels).toEqual([other])
    expect(useChatStore.getState().activeThread).toBeNull()
  })
})
