import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { messageAPI } from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';
import { useAuthStore } from '../../stores/authStore';
import { enqueueMessage } from '../../services/offlineQueue';
import { useChatStore } from '../../stores/chatStore';

/**
 * useMessages — fetches channel messages using cursor-based pagination.
 *
 * Server contract:
 *   - GET /channels/:id/messages?limit=50           → returns up to 50 messages in
 *     oldest-to-newest (chronological) order.  No cursor = latest page.
 *   - GET /channels/:id/messages?limit=50&cursor=ID → returns up to 50 messages
 *     whose _id < cursor (i.e. older than cursor), also oldest-to-newest.
 *
 * So:
 *   - pages[0].items  = the LATEST 50 messages  (oldest item first in the array)
 *   - pages[1].items  = 50 messages older than pages[0].items[0]
 *   - The correct "load more" cursor is pages[N].items[0]._id  (the OLDEST item)
 *
 * flatMap(page => page.items) therefore yields messages in a consistent
 * oldest-first order across all pages — callers can reverse() for inverted list.
 */
export const useMessages = (channelId, options = {}) => {
  const queryClient = useQueryClient();

  return useInfiniteQuery({
    queryKey: queryKeys.messages(channelId),
    queryFn: async ({ pageParam = null }) => {
      if (!channelId) return { items: [], hasMore: false, nextCursor: null };

      const params = { limit: 50 };
      if (pageParam) params.cursor = pageParam;

      const { data } = await api.get(`/channels/${channelId}/messages`, { params });
      let apiMessages = data?.data?.items || [];
      const hasMore = data?.data?.hasMore || false;

      // The cursor for the NEXT (older) page is the OLDEST message in this page.
      // The server uses $lt: cursor, so we pass the _id of apiMessages[0] (oldest).
      const oldestItem = apiMessages[0];
      const nextCursor = hasMore && oldestItem ? oldestItem._id : null;

      // ─── Merge with existing cache to preserve optimistic / socket messages ──
      // When TanStack Query refetches (after staleTime), we keep local-only items
      // (pending optimistic entries, or socket-received messages not yet in the
      // API page) so they don't vanish on refresh.
      const existingData = queryClient.getQueryData(queryKeys.messages(channelId));
      if (existingData?.pages) {
        const pageIndex = !pageParam
          ? 0
          : existingData.pages.findIndex(p => p.nextCursor === pageParam);

        if (pageIndex !== -1 && existingData.pages[pageIndex]?.items) {
          const existingItems = existingData.pages[pageIndex].items;
          const apiIds = new Set(apiMessages.map(m => String(m._id)));

          // Keep items that:
          // 1. Are still pending (optimistic, not yet confirmed by server)
          // 2. Are NOT in the API response (arrived via socket or already reconciled
          //    with a real _id but the API page window doesn't include them yet)
          // NOTE: We deliberately do NOT filter by createdAt — a reconciled message
          // with a real _id can be older than the newest API message yet still absent
          // from this page; dropping it causes the "message disappears after send" bug.
          const localOnly = existingItems.filter(m => {
            if (m.pending) return true;          // always keep optimistic
            if (apiIds.has(String(m._id))) return false; // server returned it — use API version
            return true;                          // keep socket / reconciled items missing from page
          });

          if (localOnly.length > 0) {
            const combined = [...localOnly, ...apiMessages].sort(
              (a, b) => new Date(a.createdAt) - new Date(b.createdAt) // oldest-first
            );
            // Deduplicate: prefer API version (already filtered above, but safety net)
            const seen = new Set();
            apiMessages = combined.filter(m => {
              const key = String(m._id || m.tempId);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          }
        }
      }

      return { items: apiMessages, hasMore, nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!channelId,
    // Keep data fresh — 30 s is enough so socket events don't get wiped too quickly.
    staleTime: 30 * 1000,
    ...options,
  });
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  // Capture user at mutation time so it's always fresh (avoids stale closure)
  const getUser = () => useAuthStore.getState().user;

  return useMutation({
    mutationFn: async ({ channelId, content, options = {}, tempId }) => {
      const {
        htmlContent, threadId, parentMessageId, replyTo,
        fileReferences, attachments, mentions, contentType,
        gifMeta, audioMeta, videoMeta,
      } = options;

      const payload = { content };
      if (htmlContent) payload.htmlContent = htmlContent;
      if (threadId) payload.threadId = threadId;
      if (parentMessageId) payload.parentMessageId = parentMessageId;
      if (fileReferences?.length) payload.fileReferences = fileReferences;
      if (attachments?.length) payload.attachments = attachments;
      if (mentions?.length) payload.mentions = mentions;
      if (contentType) payload.contentType = contentType;
      if (gifMeta) payload.gifMeta = gifMeta;
      if (audioMeta) payload.audioMeta = audioMeta;
      if (videoMeta) payload.videoMeta = videoMeta;
      if (replyTo) payload.replyTo = replyTo;
      if (tempId) payload.tempId = tempId;

      const connectionStatus = useChatStore.getState().connectionStatus;

      if (connectionStatus !== 'connected') {
        // Enqueue for when we come back online
        await enqueueMessage({ _id: tempId, createdAt: new Date().toISOString() }, channelId, payload);
        useChatStore.getState().setOfflineQueueStatus(tempId, 'pending');
        // Resolve (not reject) so the optimistic message stays visible
        return { channelId, isOffline: true, tempId };
      }

      const { data } = await api.post(`/channels/${channelId}/messages`, payload);
      return { channelId, reply: data?.data?.message || data?.data, tempId };
    },

    onMutate: async ({ channelId, content, options = {}, tempId }) => {
      // Cancel any in-flight refetch so it doesn't overwrite the optimistic entry
      await queryClient.cancelQueries({ queryKey: queryKeys.messages(channelId) });
      const previousData = queryClient.getQueryData(queryKeys.messages(channelId));

      const user = getUser();
      const optimisticMessage = {
        _id: tempId,
        content,
        htmlContent: options?.htmlContent,
        channelId,
        authorId: user,
        senderSnapshot: { name: user?.name, avatar: user?.avatar },
        createdAt: new Date().toISOString(),
        pending: true,
        fileReferences: options?.fileReferences || [],
        attachments: options?.attachments || [],
        mentions: options?.mentions || [],
        threadId: options?.threadId,
        parentMessageId: options?.parentMessageId,
        replyTo: options?.replyTo,
        contentType: options?.contentType || 'text',
        gifMeta: options?.gifMeta,
        audioMeta: options?.audioMeta,
        videoMeta: options?.videoMeta,
      };

      queryClient.setQueryData(queryKeys.messages(channelId), (old) => {
        if (!old?.pages) {
          // No cache yet — create a minimal structure so the message appears immediately
          return {
            pages: [{ items: [optimisticMessage], hasMore: false, nextCursor: null }],
            pageParams: [null],
          };
        }
        const newPages = [...old.pages];
        const firstPage = newPages[0] || { items: [], hasMore: false, nextCursor: null };
        newPages[0] = {
          ...firstPage,
          // Append at the end (oldest-first order) so it shows as the latest message
          items: [...firstPage.items.filter(m => m._id !== tempId), optimisticMessage],
        };
        return { ...old, pages: newPages };
      });

      return { previousData };
    },

    onError: (err, { channelId, tempId }, context) => {
      // Only roll back if we have saved state AND the message hasn't been reconciled
      if (context?.previousData) {
        const current = queryClient.getQueryData(queryKeys.messages(channelId));
        const wasReconciled = current?.pages?.some(p =>
          p.items?.some(m => m.tempId === tempId && !m.pending)
        );
        if (!wasReconciled) {
          queryClient.setQueryData(queryKeys.messages(channelId), context.previousData);
        }
      }
    },

    onSuccess: (data, { channelId, tempId }) => {
      if (data.isOffline) return; // Keep the pending optimistic message visible

      const serverMessage = data.reply;
      if (!serverMessage) {
        // No server message body — invalidate so the next background fetch picks it up
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(channelId) });
        return;
      }

      // Replace the optimistic (tempId) entry with the confirmed server message.
      // We match on either tempId (normal case) or the real _id (if the socket ACK
      // already reconciled it before onSuccess fired).
      queryClient.setQueryData(queryKeys.messages(channelId), (old) => {
        if (!old?.pages) return old;

        let replaced = false;
        const newPages = old.pages.map(page => {
          const newItems = page.items.map(m => {
            if (m._id === tempId || (serverMessage._id && String(m._id) === String(serverMessage._id))) {
              replaced = true;
              return { ...serverMessage, pending: false, tempId };
            }
            return m;
          });
          return { ...page, items: newItems };
        });

        // Safety net: if the optimistic item was already evicted (e.g. mid-flight
        // cache invalidation), append the server message so it never vanishes.
        if (!replaced) {
          const firstPage = newPages[0];
          if (firstPage) {
            const alreadyPresent = firstPage.items.some(
              m => String(m._id) === String(serverMessage._id)
            );
            if (!alreadyPresent) {
              newPages[0] = {
                ...firstPage,
                items: [...firstPage.items, { ...serverMessage, pending: false, tempId }],
              };
            }
          }
        }

        return { ...old, pages: newPages };
      });
    },
  });
};

export const useEditMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, channelId, content, htmlContent, fileReferences, attachments, clearAttachments }) => {
      const payload = { content };
      if (htmlContent !== undefined) payload.htmlContent = htmlContent;
      if (fileReferences !== undefined) payload.fileReferences = fileReferences;
      if (attachments !== undefined) payload.attachments = attachments;
      if (clearAttachments) payload.clearAttachments = true;

      const { data } = await api.put(`/messages/${messageId}`, payload);
      return { channelId, messageId, updated: data?.data?.message || data?.data };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.messages(data.channelId), (old) => {
        if (!old?.pages) return old;
        const newPages = old.pages.map(page => ({
          ...page,
          items: page.items.map(m =>
            m._id === data.messageId ? { ...m, ...data.updated, isEdited: true } : m
          ),
        }));
        return { ...old, pages: newPages };
      });
    },
  });
};

export const useDeleteMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, channelId }) => {
      await api.delete(`/messages/${messageId}`);
      return { channelId, messageId };
    },
    onMutate: async ({ channelId, messageId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.messages(channelId) });
      const previousData = queryClient.getQueryData(queryKeys.messages(channelId));

      queryClient.setQueryData(queryKeys.messages(channelId), (old) => {
        if (!old?.pages) return old;
        const newPages = old.pages.map(page => ({
          ...page,
          items: page.items.map(m =>
            String(m._id) === String(messageId)
              ? {
                  ...m,
                  isDeleted: true,
                  content: '',
                  htmlContent: '',
                  fileReferences: [],
                  attachments: [],
                  files: [],
                  deletedAt: new Date().toISOString(),
                }
              : m
          ),
        }));
        return { ...old, pages: newPages };
      });
      return { previousData };
    },
    onError: (err, { channelId }, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.messages(channelId), context.previousData);
      }
    },
  });
};
