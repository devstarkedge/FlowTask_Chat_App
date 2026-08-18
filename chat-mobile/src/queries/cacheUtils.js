import { queryClient } from './queryClient';
import { queryKeys } from './queryKeys';

export const updateThreadReplyInCache = (replyId, updates) => {
  const queries = queryClient.getQueriesData({ queryKey: ['threadReplies'] });
  queries.forEach(([queryKey, oldData]) => {
    if (!oldData || !oldData.pages) return;
    const newPages = oldData.pages.map(page => ({
      ...page,
      items: page.items.map(r => r._id === replyId ? { ...r, ...updates } : r)
    }));
    queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
  });
};

export const removeThreadReplyFromCache = (replyId) => {
  const queries = queryClient.getQueriesData({ queryKey: ['threadReplies'] });
  queries.forEach(([queryKey, oldData]) => {
    if (!oldData || !oldData.pages) return;
    const newPages = oldData.pages.map(page => ({
      ...page,
      items: page.items.map(r => String(r._id) === String(replyId) ? {
        ...r,
        isDeleted: true,
        content: '',
        htmlContent: '',
        fileReferences: [],
        attachments: [],
        files: [],
        deletedAt: r.deletedAt || new Date().toISOString(),
      } : r)
    }));
    queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
  });
};

export const addThreadReplyToCache = (rootMessageId, reply) => {
  const queryKey = queryKeys.threadReplies(rootMessageId);
  const oldData = queryClient.getQueryData(queryKey);
  if (!oldData || !oldData.pages) return;
  
  const newPages = [...oldData.pages];
  if (newPages.length > 0) {
    const firstPage = newPages[0];
    // Dedup
    if (firstPage.items.some(r => r._id === reply._id || (reply.tempId && r._id === reply.tempId))) return;
    
    newPages[0] = {
      ...firstPage,
      items: [reply, ...firstPage.items].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    };
    queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
  }
};

export const addReactionToThreadReplyCache = (replyId, emoji, user) => {
  const queries = queryClient.getQueriesData({ queryKey: ['threadReplies'] });
  queries.forEach(([queryKey, oldData]) => {
    if (!oldData || !oldData.pages) return;
    const newPages = oldData.pages.map(page => ({
      ...page,
      items: page.items.map(r => {
        if (r._id !== replyId) return r;
        const reactions = [...(r.reactions || [])];
        const existing = reactions.find(rx => rx.emoji === emoji);
        if (existing) {
          if (existing.userIds?.includes(user._id)) return r;
          existing.users = [...(existing.users || []), user];
          existing.userIds = [...(existing.userIds || []), user._id];
          existing.count = (existing.count || 0) + 1;
        } else {
          reactions.push({ emoji, users: [user], userIds: [user._id], count: 1 });
        }
        return { ...r, reactions };
      })
    }));
    queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
  });
};

export const removeReactionFromThreadReplyCache = (replyId, emoji, userId) => {
  const queries = queryClient.getQueriesData({ queryKey: ['threadReplies'] });
  queries.forEach(([queryKey, oldData]) => {
    if (!oldData || !oldData.pages) return;
    const newPages = oldData.pages.map(page => ({
      ...page,
      items: page.items.map(r => {
        if (r._id !== replyId) return r;
        const reactions = (r.reactions || []).map(rx => {
          if (rx.emoji !== emoji) return rx;
          const users = (rx.users || []).filter(u => u._id !== userId);
          const userIds = (rx.userIds || []).filter(id => id !== userId);
          return { ...rx, users, userIds, count: users.length };
        }).filter(rx => rx.count > 0);
        return { ...r, reactions };
      })
    }));
    queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
  });
};

export const reconcileMessageInCache = (channelId, tempId, serverMessage) => {
  const queryKey = queryKeys.messages(channelId);
  const oldData = queryClient.getQueryData(queryKey);
  if (!oldData || !oldData.pages) return;

  // Replace the optimistic entry (matched by tempId or by real server _id)
  // and remove any duplicate that may have already arrived via the socket.
  const serverIdStr = String(serverMessage._id);
  let reconciled = false;

  const newPages = oldData.pages.map(page => {
    // First pass: find the optimistic item and replace it
    const newItems = page.items
      .map(m => {
        if (m._id === tempId) {
          reconciled = true;
          return { ...serverMessage, pending: false, tempId };
        }
        return m;
      })
      // Second pass: remove any duplicate of the real server _id that arrived via socket
      .filter((m, idx, arr) => {
        if (String(m._id) !== serverIdStr) return true;
        // Keep only the first occurrence (the reconciled one)
        return arr.findIndex(x => String(x._id) === serverIdStr) === idx;
      });
    return { ...page, items: newItems };
  });

  // If tempId wasn't found (already evicted), ensure server message is present
  if (!reconciled) {
    const firstPage = newPages[0];
    if (firstPage) {
      const alreadyPresent = firstPage.items.some(m => String(m._id) === serverIdStr);
      if (!alreadyPresent) {
        newPages[0] = {
          ...firstPage,
          items: [...firstPage.items, { ...serverMessage, pending: false, tempId }],
        };
      }
    }
  }

  queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
};

export const updateMessageStatusLocalInCache = (channelId, tempId, status) => {
  const queryKey = queryKeys.messages(channelId);
  const oldData = queryClient.getQueryData(queryKey);
  if (!oldData || !oldData.pages) return;

  const newPages = oldData.pages.map(page => ({
    ...page,
    items: page.items.map(m => m._id === tempId ? { ...m, deliveryStatus: status, pending: status === 'pending' } : m)
  }));
  queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
};

export const markMessageFailedInCache = (channelId, tempId, error) => {
  const queryKey = queryKeys.messages(channelId);
  const oldData = queryClient.getQueryData(queryKey);
  if (!oldData || !oldData.pages) return;

  const newPages = oldData.pages.map(page => ({
    ...page,
    items: page.items.map(m => m._id === tempId ? { ...m, pending: false, failed: true, error } : m)
  }));
  queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
};

export const addMessageToCache = (channelId, message) => {
  const queryKey = queryKeys.messages(channelId);
  const oldData = queryClient.getQueryData(queryKey);
  if (!oldData || !oldData.pages) return;

  const newPages = [...oldData.pages];
  if (newPages.length > 0) {
    const firstPage = newPages[0];
    // Dedup: skip if the message (or its pending twin) is already in the page
    if (firstPage.items.some(m =>
      String(m._id) === String(message._id) ||
      (message.tempId && m._id === message.tempId)
    )) return;

    newPages[0] = {
      ...firstPage,
      // Append at end to maintain oldest-first order within the page
      items: [...firstPage.items, message],
    };
    queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
  }
};

export const updateMessageInCache = (channelId, message) => {
  const queryKey = queryKeys.messages(channelId);
  const oldData = queryClient.getQueryData(queryKey);
  if (!oldData || !oldData.pages) return;

  const newPages = oldData.pages.map(page => ({
    ...page,
    items: page.items.map(m => m._id === message._id ? { ...m, ...message } : m)
  }));
  queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
};

export const removeMessageFromCache = (channelId, messageId) => {
  const queryKey = queryKeys.messages(channelId);
  const oldData = queryClient.getQueryData(queryKey);
  if (!oldData || !oldData.pages) return;

  const newPages = oldData.pages.map(page => ({
    ...page,
    items: page.items.map(m => String(m._id) === String(messageId) ? {
      ...m,
      isDeleted: true,
      content: '',
      htmlContent: '',
      fileReferences: [],
      attachments: [],
      files: [],
      deletedAt: m.deletedAt || new Date().toISOString(),
    } : m)
  }));
  queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
};

export const addReactionToMessageCache = (channelId, messageId, emoji, user) => {
  const queryKey = queryKeys.messages(channelId);
  const oldData = queryClient.getQueryData(queryKey);
  if (!oldData || !oldData.pages) return;

  const newPages = oldData.pages.map(page => ({
    ...page,
    items: page.items.map(m => {
      if (m._id !== messageId) return m;
      const reactions = [...(m.reactions || [])];
      const existing = reactions.find(rx => rx.emoji === emoji);
      if (existing) {
        if (existing.userIds?.includes(user._id)) return m;
        existing.users = [...(existing.users || []), user];
        existing.userIds = [...(existing.userIds || []), user._id];
        existing.count = (existing.count || 0) + 1;
      } else {
        reactions.push({ emoji, users: [user], userIds: [user._id], count: 1 });
      }
      return { ...m, reactions };
    })
  }));
  queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
};

export const removeReactionFromMessageCache = (channelId, messageId, emoji, userId) => {
  const queryKey = queryKeys.messages(channelId);
  const oldData = queryClient.getQueryData(queryKey);
  if (!oldData || !oldData.pages) return;

  const newPages = oldData.pages.map(page => ({
    ...page,
    items: page.items.map(m => {
      if (m._id !== messageId) return m;
      const reactions = (m.reactions || []).map(rx => {
        if (rx.emoji !== emoji) return rx;
        const users = (rx.users || []).filter(u => u._id !== userId);
        const userIds = (rx.userIds || []).filter(id => id !== userId);
        return { ...rx, users, userIds, count: users.length };
      }).filter(rx => rx.count > 0);
      return { ...m, reactions };
    })
  }));
  queryClient.setQueryData(queryKey, { ...oldData, pages: newPages });
};
