export const queryKeys = {
  // Workspaces
  workspaces: ['workspaces'],
  workspaceDetails: (workspaceId) => ['workspace', workspaceId],
  
  // Channels
  channels: (workspaceId) => ['channels', workspaceId],
  channelDetails: (channelId) => ['channel', channelId],
  
  // Members
  workspaceMembers: (workspaceId) => ['workspaceMembers', workspaceId],
  channelMembers: (channelId) => ['channelMembers', channelId],
  threadReplies: (rootMessageId) => ['threadReplies', rootMessageId],
  
  // Directories
  directories: (workspaceId) => ['directories', workspaceId],
  
  // Messages & Threads
  messages: (channelId) => ['messages', channelId],
  pinnedMessages: (channelId) => ['pinnedMessages', channelId],
  
  // User/Auth
  currentUser: ['currentUser'],
  
  // Notifications
  notifications: ['notifications'],
};
