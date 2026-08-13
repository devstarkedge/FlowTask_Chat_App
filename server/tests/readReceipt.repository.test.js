import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for readReceipt.repository.js
 * Tests the data access layer for read receipts.
 */

// Mock the ReadReceipt model
const mockFindOneAndUpdate = vi.fn();
const mockFindOne = vi.fn();
const mockDeleteOne = vi.fn();
const mockUpdateMany = vi.fn();
const mockLean = vi.fn();
const mockFind = vi.fn(() => ({ lean: mockLean }));

vi.mock('../modules/readReceipts/readReceipt.model.js', () => ({
  default: {
    find: mockFind,
    findOneAndUpdate: mockFindOneAndUpdate,
    findOne: mockFindOne,
    deleteOne: mockDeleteOne,
    updateMany: mockUpdateMany,
  },
}));

const readReceiptRepository = (await import('../modules/readReceipts/readReceipt.repository.js')).default;

describe('readReceiptRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset find to return chainable lean()
    mockFind.mockReturnValue({ lean: mockLean });
  });

  describe('getUnreadCounts', () => {
    it('should return unread counts for a user', async () => {
      const mockResult = [
        { channelId: 'ch1', unreadCount: 5, lastReadMessageId: 'msg1' },
        { channelId: 'ch2', unreadCount: 3, lastReadMessageId: 'msg2' },
      ];
      mockLean.mockResolvedValue(mockResult);

      const result = await readReceiptRepository.getUnreadCounts('user1');

      expect(mockFind).toHaveBeenCalledWith(
        { userId: 'user1', unreadCount: { $gt: 0 } },
        { channelId: 1, unreadCount: 1, unreadMentionCount: 1, lastReadMessageId: 1, _id: 0 },
      );
      expect(result).toEqual(mockResult);
    });

    it('should return empty array for user with no receipts', async () => {
      mockLean.mockResolvedValue([]);

      const result = await readReceiptRepository.getUnreadCounts('user1');

      expect(result).toEqual([]);
    });
  });

  describe('markChannelAsRead', () => {
    it('should upsert read receipt with message ID', async () => {
      const mockReceipt = { userId: 'user1', channelId: 'ch1', unreadCount: 0 };
      mockFindOneAndUpdate.mockResolvedValue(mockReceipt);

      const result = await readReceiptRepository.markChannelAsRead('user1', 'ch1', 'msg99');

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user1', channelId: 'ch1' },
        expect.objectContaining({
          lastReadMessageId: 'msg99',
          unreadCount: 0,
          unreadMentionCount: 0,
        }),
        { upsert: true, returnDocument: 'after' },
      );
      expect(result).toEqual(mockReceipt);
    });
  });

  describe('incrementUnread', () => {
    it('should increment unread count excluding the author', async () => {
      mockUpdateMany.mockResolvedValue({ modifiedCount: 3 });

      await readReceiptRepository.incrementUnread('ch1', 'authorUserId');

      expect(mockUpdateMany).toHaveBeenCalledWith(
        { channelId: 'ch1', userId: { $ne: 'authorUserId' } },
        { $inc: { unreadCount: 1 } },
      );
    });

    it('should also increment mention count when hasMention is true', async () => {
      mockUpdateMany.mockResolvedValue({ modifiedCount: 3 });

      await readReceiptRepository.incrementUnread('ch1', 'authorUserId', true);

      expect(mockUpdateMany).toHaveBeenCalledWith(
        { channelId: 'ch1', userId: { $ne: 'authorUserId' } },
        { $inc: { unreadCount: 1, unreadMentionCount: 1 } },
      );
    });
  });

  describe('removeByUserAndChannel', () => {
    it('should delete the receipt', async () => {
      mockDeleteOne.mockResolvedValue({ deletedCount: 1 });

      await readReceiptRepository.removeByUserAndChannel('user1', 'ch1');

      expect(mockDeleteOne).toHaveBeenCalledWith({ userId: 'user1', channelId: 'ch1' });
    });
  });
});
