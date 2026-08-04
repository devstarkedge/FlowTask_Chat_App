import { create } from 'zustand';
import { createMessagesSlice } from './messagesSlice';
import { createReceiptsSlice } from './receiptsSlice';
import { createQueueSlice } from './queueSlice';
import { createUploadSlice } from './uploadSlice';
import { createSyncSlice } from './syncSlice';

export const useChatStore = create((set, get) => ({
  ...createMessagesSlice(set, get),
  ...createReceiptsSlice(set, get),
  ...createQueueSlice(set, get),
  ...createUploadSlice(set, get),
  ...createSyncSlice(set, get),
}));
