import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for user.service.js
 * Tests the business logic for user operations.
 */

// Mock the repository
const mockRepo = {
  findById: vi.fn(),
  findByFlowTaskId: vi.fn(),
  setCustomStatus: vi.fn(),
  clearCustomStatus: vi.fn(),
  setOnlineStatus: vi.fn(),
  findOnline: vi.fn(),
  search: vi.fn(),
};

vi.mock('../modules/users/user.repository.js', () => ({
  default: mockRepo,
}));

vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const userService = (await import('../modules/users/user.service.js')).default;

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const mockUser = {
        _id: 'user1',
        name: 'Test User',
        email: 'test@test.com',
        customStatus: null,
        toObject: () => ({ _id: 'user1', name: 'Test User', email: 'test@test.com', customStatus: null }),
      };
      mockRepo.findById.mockResolvedValue(mockUser);

      const result = await userService.getProfile('user1');

      expect(mockRepo.findById).toHaveBeenCalledWith('user1');
      expect(result).toBeDefined();
    });

    it('should throw for non-existent user', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(userService.getProfile('nonexistent')).rejects.toThrow();
    });

    it('should clear expired custom status', async () => {
      const pastDate = new Date(Date.now() - 1000);
      const mockUser = {
        _id: 'user1',
        name: 'Test',
        customStatus: { emoji: '🏠', text: 'WFH', expiresAt: pastDate },
        toObject: function() { return { ...this } },
        save: vi.fn(),
      };
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.clearCustomStatus.mockResolvedValue(mockUser);

      const result = await userService.getProfile('user1');

      expect(mockRepo.clearCustomStatus).toHaveBeenCalledWith('user1');
    });
  });

  describe('setCustomStatus', () => {
    it('should set custom status with duration', async () => {
      const mockUpdated = { _id: 'user1', customStatus: { emoji: '🎯', text: 'Focusing' } };
      mockRepo.setCustomStatus.mockResolvedValue(mockUpdated);

      const result = await userService.setCustomStatus('user1', {
        emoji: '🎯',
        text: 'Focusing',
        duration: 60,
      });

      expect(mockRepo.setCustomStatus).toHaveBeenCalledWith(
        'user1',
        expect.objectContaining({
          emoji: '🎯',
          text: 'Focusing',
          expiresAt: expect.any(Date),
        }),
      );
    });

    it('should set status without expiry when no duration', async () => {
      const mockUpdated = { _id: 'user1', customStatus: { emoji: '🏠', text: 'Remote' } };
      mockRepo.setCustomStatus.mockResolvedValue(mockUpdated);

      await userService.setCustomStatus('user1', { emoji: '🏠', text: 'Remote' });

      expect(mockRepo.setCustomStatus).toHaveBeenCalledWith(
        'user1',
        expect.objectContaining({
          emoji: '🏠',
          text: 'Remote',
          expiresAt: null,
        }),
      );
    });
  });

  describe('clearCustomStatus', () => {
    it('should clear custom status', async () => {
      mockRepo.clearCustomStatus.mockResolvedValue({});

      await userService.clearCustomStatus('user1');

      expect(mockRepo.clearCustomStatus).toHaveBeenCalledWith('user1');
    });
  });

  describe('setOnlineStatus', () => {
    it('should accept valid statuses', async () => {
      mockRepo.setOnlineStatus.mockResolvedValue({ _id: 'user1' });

      await userService.setOnlineStatus('user1', 'away');

      expect(mockRepo.setOnlineStatus).toHaveBeenCalledWith('user1', 'away');
    });

    it('should reject invalid statuses', async () => {
      await expect(userService.setOnlineStatus('user1', 'invisible')).rejects.toThrow();
    });
  });

  describe('searchUsers', () => {
    it('should search with default limit', async () => {
      mockRepo.search.mockResolvedValue([]);

      await userService.searchUsers('test');

      expect(mockRepo.search).toHaveBeenCalledWith('test', 20);
    });

    it('should pass custom limit to repository', async () => {
      mockRepo.search.mockResolvedValue([]);

      await userService.searchUsers('test', 100);

      expect(mockRepo.search).toHaveBeenCalledWith('test', 100);
    });
  });
});
