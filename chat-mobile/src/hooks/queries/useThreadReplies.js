import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { threadAPI } from '../../services/api';
import api from '../../services/api';
import { queryKeys } from '../../queries/queryKeys';
import { useAuthStore } from '../../stores/authStore';

export const useThreadReplies = (rootMessageId, options = {}) => {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: queryKeys.threadReplies(rootMessageId),
    queryFn: async ({ pageParam = null }) => {
      if (!rootMessageId) return { items: [], hasMore: false, cursor: null };
      
      const params = { limit: 50 };
      if (pageParam) params.cursor = pageParam;
      
      const { data } = await threadAPI.getReplies(rootMessageId, params);
      let apiReplies = data?.data?.replies || data?.data?.items || [];
      const hasMore = data?.data?.hasMore || false;
      
      const lastItem = apiReplies[apiReplies.length - 1];
      const nextCursor = hasMore && lastItem ? lastItem._id : null;
      
      // Merge with existing cached items for this page to preserve optimistic updates
      const existingData = queryClient.getQueryData(queryKeys.threadReplies(rootMessageId));
      if (existingData && existingData.pages) {
        const pageIndex = !pageParam ? 0 : existingData.pages.findIndex(p => p.nextCursor === pageParam);
        
        if (pageIndex !== -1 && existingData.pages[pageIndex]?.items) {
           const existingItems = existingData.pages[pageIndex].items;
           const apiIds = new Set(apiReplies.map(m => String(m._id)));
           
           // Keep items that are pending OR arrived via socket and are newer
           const localOnly = existingItems.filter(m => 
             m.pending || 
             (!apiIds.has(String(m._id)) && (!apiReplies.length || new Date(m.createdAt) > new Date(apiReplies[apiReplies.length - 1]?.createdAt || 0)))
           );
           
           if (localOnly.length > 0) {
              const combined = [...localOnly, ...apiReplies].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
              
              const seen = new Set();
              apiReplies = combined.filter(m => {
                 const key = String(m._id || m.tempId);
                 if (seen.has(key)) return false;
                 seen.add(key);
                 return true;
              });
           }
        }
      }

      return { items: apiReplies, hasMore, nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!rootMessageId,
    staleTime: 1000 * 60, // 1 minute
    ...options
  });
};

export const useSendThreadReply = () => {
  const queryClient = useQueryClient();
  const user = useAuthStore.getState().user;

  return useMutation({
    mutationFn: async ({ rootMessageId, channelId, content, htmlContent, fileReferences, mentions, parentMessageId, replyTo, tempId }) => {
      const payload = {
        content,
        htmlContent,
        threadId: rootMessageId,
        fileReferences,
        mentions,
        tempId,
      };
      if (parentMessageId) payload.parentMessageId = parentMessageId;
      
      const { data } = await api.post(`/channels/${channelId}/messages`, payload);
      return { rootMessageId, reply: data?.data?.message || data?.data };
    },
    onMutate: async ({ rootMessageId, content, htmlContent, fileReferences, mentions, parentMessageId, replyTo, tempId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.threadReplies(rootMessageId) });
      
      const previousData = queryClient.getQueryData(queryKeys.threadReplies(rootMessageId));
      
      const optimisticReply = {
        _id: tempId,
        content,
        htmlContent,
        authorId: user,
        senderSnapshot: { name: user?.name, avatar: user?.avatar },
        createdAt: new Date().toISOString(),
        pending: true,
        fileReferences: fileReferences || [],
        mentions: mentions || [],
        ...(parentMessageId && replyTo ? { parentMessageId, replyTo } : {}),
      };

      queryClient.setQueryData(queryKeys.threadReplies(rootMessageId), (old) => {
        if (!old || !old.pages) return old;
        const newPages = [...old.pages];
        if (newPages.length > 0) {
          const firstPage = newPages[0];
          newPages[0] = {
            ...firstPage,
            items: [optimisticReply, ...firstPage.items].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          };
        }
        return { ...old, pages: newPages };
      });
      
      return { previousData };
    },
    onError: (err, { rootMessageId, tempId }, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.threadReplies(rootMessageId), context.previousData);
      }
    },
    onSuccess: (data, { rootMessageId, tempId }) => {
      // Data contains the actual reply from server. Update the cache to replace optimistic reply.
      queryClient.setQueryData(queryKeys.threadReplies(rootMessageId), (old) => {
        if (!old || !old.pages) return old;
        const newPages = old.pages.map(page => ({
          ...page,
          items: page.items.map(m => m._id === tempId ? { ...data.reply, pending: false, tempId } : m)
        }));
        return { ...old, pages: newPages };
      });
    }
  });
};

export const useEditThreadReply = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ rootMessageId, replyId, content, htmlContent, fileReferences }) => {
      const payload = { content };
      if (htmlContent) payload.htmlContent = htmlContent;
      if (fileReferences) payload.fileReferences = fileReferences;
      const { data } = await api.put(`/messages/${replyId}`, payload);
      return { rootMessageId, replyId, updated: data?.data?.message || data?.data };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.threadReplies(data.rootMessageId), (old) => {
        if (!old || !old.pages) return old;
        const newPages = old.pages.map(page => ({
          ...page,
          items: page.items.map(r => r._id === data.replyId ? { ...r, ...data.updated, isEdited: true } : r)
        }));
        return { ...old, pages: newPages };
      });
    }
  });
};

export const useDeleteThreadReply = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ rootMessageId, replyId }) => {
      await api.delete(`/messages/${replyId}`);
      return { rootMessageId, replyId };
    },
    onMutate: async ({ rootMessageId, replyId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.threadReplies(rootMessageId) });
      const previousData = queryClient.getQueryData(queryKeys.threadReplies(rootMessageId));
      
      queryClient.setQueryData(queryKeys.threadReplies(rootMessageId), (old) => {
        if (!old || !old.pages) return old;
        const newPages = old.pages.map(page => ({
          ...page,
          items: page.items.map(r => String(r._id) === String(replyId) ? {
            ...r,
            isDeleted: true,
            content: '',
            htmlContent: '',
            fileReferences: [],
            attachments: [],
            files: [],
            deletedAt: new Date().toISOString(),
          } : r)
        }));
        return { ...old, pages: newPages };
      });
      return { previousData };
    },
    onError: (err, { rootMessageId }, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.threadReplies(rootMessageId), context.previousData);
      }
    }
  });
};
