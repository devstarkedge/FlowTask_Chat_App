import { afterEach, describe, expect, it, vi } from 'vitest';
import SavedMessage from '../modules/messages/SavedMessage.model.js';

afterEach(() => vi.restoreAllMocks());

describe('saved messages after old deletions', () => {
  it('excludes deleted or missing message references while keeping standalone reminders', async () => {
    const bookmark = { _id: 'saved-1', type: 'saved_message', messageId: { _id: 'message-1' } };
    const reminder = { _id: 'reminder-1', type: 'standalone', messageId: null };
    const query = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        bookmark, reminder, { _id: 'saved-deleted', type: 'saved_message', messageId: null },
      ]),
    };
    vi.spyOn(SavedMessage, 'find').mockReturnValue(query);

    const saved = await SavedMessage.getUserSaved('user-1', 'workspace-1', { status: 'archived' });
    expect(saved).toEqual([bookmark, reminder]);
    expect(SavedMessage.find).toHaveBeenCalledWith({ userId: 'user-1', workspaceId: 'workspace-1', status: 'archived' });
    expect(query.populate).toHaveBeenCalledWith(expect.objectContaining({
      path: 'messageId', match: { isDeleted: { $ne: true } },
    }));
  });
});
