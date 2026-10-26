import { useChannelStore } from '../stores/channelStore'
import { useChatStore } from '../stores/chatStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { directoriesAPI } from './directoriesAPI'

export function handleChannelRemoved({ channelId, workspaceId }) {
  if (!channelId) return
  if (workspaceId && String(workspaceId) !== String(useWorkspaceStore.getState().activeWorkspaceId)) return
  useChannelStore.getState().removeChannel(channelId)
  directoriesAPI.invalidateChannels?.()
  const chat = useChatStore.getState()
  const threadChannelId = chat.activeThread?.channelId?._id || chat.activeThread?.channelId
  if (String(threadChannelId) === String(channelId)) chat.closeThread()
}
