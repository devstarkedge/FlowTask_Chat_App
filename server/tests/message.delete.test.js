import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(), softDelete: vi.fn(), latest: vi.fn(),
  savedFind: vi.fn(), deleteMany: vi.fn(), emitToUser: vi.fn(), emitToChannel: vi.fn(),
}));
vi.mock('../modules/messages/message.repository.js', () => ({ default: {
  findById: mocks.findById, softDelete: mocks.softDelete, getLatestInChannel: mocks.latest,
} }));
vi.mock('../modules/channels/channel.repository.js', () => ({ default: { updateLastMessage: vi.fn().mockResolvedValue({}) } }));
vi.mock('../modules/threads/thread.repository.js', () => ({ default: {} }));
vi.mock('../modules/users/user.repository.js', () => ({ default: {} }));
vi.mock('../modules/files/FileReference.model.js', () => ({ default: {} }));
vi.mock('../modules/messages/SavedMessage.model.js', () => ({ default: { find: mocks.savedFind, deleteMany: mocks.deleteMany } }));
vi.mock('../sockets/socketManager.js', () => ({ emitToUser: mocks.emitToUser, emitToChannel: mocks.emitToChannel, getIO: vi.fn(), getRoomOccupancy: vi.fn() }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import messageService from '../modules/messages/message.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findById.mockResolvedValue({ _id: 'message-1', authorId: 'author-1', channelId: 'channel-1', workspaceId: 'workspace-1' });
  mocks.softDelete.mockResolvedValue({});
  mocks.latest.mockResolvedValue(null);
  mocks.deleteMany.mockResolvedValue({ deletedCount: 3 });
  mocks.savedFind.mockReturnValue({ select: () => ({ lean: async () => [
    { userId: 'author-1' }, { userId: 'reader-1' }, { userId: 'reader-1' },
  ] }) });
});

describe('saved-message cleanup on deletion', () => {
  it('deletes all workspace bookmarks and notifies each saving user once', async () => {
    await messageService.deleteMessage('message-1', 'author-1', false, 'workspace-1');
    expect(mocks.deleteMany).toHaveBeenCalledWith({ messageId: 'message-1', workspaceId: 'workspace-1' });
    expect(mocks.emitToUser.mock.calls).toEqual([
      ['author-1', 'savedMessage:removed', { messageId: 'message-1' }, 'workspace-1'],
      ['reader-1', 'savedMessage:removed', { messageId: 'message-1' }, 'workspace-1'],
    ]);
    expect(mocks.emitToChannel).toHaveBeenCalledWith('channel-1', 'message:delete', {
      messageId: 'message-1', channelId: 'channel-1', isDeleted: true,
    }, 'workspace-1');
  });

  it('does not clear bookmarks if the message deletion fails', async () => {
    mocks.softDelete.mockRejectedValueOnce(new Error('Database error'));
    await expect(messageService.deleteMessage('message-1', 'author-1', false, 'workspace-1')).rejects.toThrow('Database error');
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.emitToUser).not.toHaveBeenCalled();
  });

  it('does not clear bookmarks from another workspace', async () => {
    await expect(messageService.deleteMessage('message-1', 'author-1', false, 'workspace-2')).rejects.toThrow('does not belong');
    expect(mocks.softDelete).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
