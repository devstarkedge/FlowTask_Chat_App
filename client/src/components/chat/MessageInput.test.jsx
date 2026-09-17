import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import MessageInput from './MessageInput'

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  clearDraft: vi.fn(),
  restoreDraft: vi.fn().mockResolvedValue(false),
  noop: vi.fn(),
  editorRef: null,
  gif: {
    provider: 'klipy',
    providerId: 'cat-yawn',
    gifUrl: 'https://static.klipy.com/cat.gif',
    previewUrl: 'https://static.klipy.com/cat-preview.gif',
    title: 'Good Morning "Cat" Yawn',
    width: 320,
    height: 240,
  },
}))

vi.mock('../../stores/chatStore', () => ({
  useChatStore: () => ({ sendMessage: mocks.sendMessage }),
}))
vi.mock('../../stores/draftStore', () => ({
  useDraftStore: () => ({ clearDraft: mocks.clearDraft }),
}))
vi.mock('../../stores/workspaceStore', () => ({
  useWorkspaceStore: (selector) => selector({ activeWorkspaceId: 'workspace-1' }),
}))
vi.mock('../../services/api', () => ({ messageAPI: {} }))
vi.mock('../../services/socket', () => ({
  emitTypingStart: vi.fn(),
  emitTypingStop: vi.fn(),
}))
vi.mock('../../hooks/useDraftAutoSave', () => ({
  default: () => ({
    restoreDraft: mocks.restoreDraft,
    saveDraftDebounced: mocks.noop,
    saveDraftLocal: mocks.noop,
  }),
}))
vi.mock('../../hooks/useMentions', () => ({
  default: ({ editorRef }) => {
    mocks.editorRef = editorRef
    return {
      items: [],
      detectMention: mocks.noop,
      closeMentions: mocks.noop,
      handleMentionKeyDown: mocks.noop,
    }
  },
}))
vi.mock('./EmojiPickerPortal', () => ({ default: () => null }))
vi.mock('./MentionDropdown', () => ({ default: () => null }))
vi.mock('./ScheduleMessageModal', () => ({ default: () => null }))
vi.mock('./GifPickerModal', () => ({
  default: ({ isOpen, onSelectGif }) => isOpen ? (
    <button onClick={() => onSelectGif(mocks.gif)}>Select cat GIF</button>
  ) : null,
}))

// jsdom has no layout hit testing; TipTap's placeholder uses this browser API.
beforeAll(() => {
  document.elementFromPoint = () => null
  Range.prototype.getClientRects = () => []
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterAll(() => {
  delete document.elementFromPoint
  delete Range.prototype.getClientRects
  delete Range.prototype.getBoundingClientRect
})
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.sendMessage.mockResolvedValue({ _id: 'message-1' })
})

describe('GIF selection', () => {
  it.each([
    ['channel-1', undefined],
    ['dm-1', undefined],
    ['channel-1', 'thread-1'],
  ])('sends a GIF message in %s / %s without inserting HTML', async (channelId, threadId) => {
    render(<MessageInput channelId={channelId} threadId={threadId} />)

    // Keep the real TipTap editor so this catches the original raw-HTML bug.
    const editor = screen.getByRole('textbox')
    await act(async () => {
      editor.innerHTML = '<p>Unsent draft</p>'
      fireEvent.input(editor)
    })

    fireEvent.click(screen.getByRole('button', { name: 'GIF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select cat GIF' }))

    expect(mocks.sendMessage).toHaveBeenCalledExactlyOnceWith(channelId, '', {
      threadId,
      contentType: 'gif',
      gifMeta: mocks.gif,
    })
    expect(editor.textContent).toBe('Unsent draft')
    expect(editor.innerHTML).not.toContain('&lt;img')
    expect(mocks.clearDraft).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Select cat GIF' })).toBeNull()
  })

  it('handles a rejected send without inserting HTML into the editor', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error('Network error'))
    render(<MessageInput channelId="channel-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'GIF' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Select cat GIF' }))
    })
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox').textContent).toBe('')
    expect(screen.queryByRole('button', { name: 'Select cat GIF' })).toBeNull()
  })
})

describe('mention-only messages', () => {
  it.each([
    ['channel-1', undefined, 'click'],
    ['dm-1', undefined, 'enter'],
    ['channel-1', 'thread-1', 'enter'],
  ])('sends a member mention in %s / %s using %s', async (channelId, threadId, action) => {
    render(<MessageInput channelId={channelId} threadId={threadId} />)
    await act(async () => {
      mocks.editorRef.current.insertMention('member-1', 'Tisha Grover')
    })

    expect(screen.getByRole('button', { name: 'Send message' }).disabled).toBe(false)
    await act(async () => {
      if (action === 'enter') fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      else fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    })

    expect(mocks.sendMessage).toHaveBeenCalledExactlyOnceWith(channelId, '@Tisha Grover', {
      threadId,
      htmlContent: expect.stringContaining('data-mention-id="member-1"'),
      fileReferences: undefined,
      mentions: [{ userId: 'member-1', username: 'Tisha Grover', type: 'user' }],
    })
    expect(screen.getByRole('textbox').textContent).toBe('')
  })

  it('keeps an empty message from sending', () => {
    render(<MessageInput channelId="channel-1" />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })
})
