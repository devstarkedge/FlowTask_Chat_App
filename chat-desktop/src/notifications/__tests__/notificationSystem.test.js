import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('../../services/api', () => ({ default: {}, notificationAPI: {} }))
vi.mock('../../services/desktopService', () => ({
  showDesktopNotification: vi.fn(),
  onDesktopNotificationClicked: vi.fn(),
  isDesktopApp: () => true,
}))
vi.mock('../../stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      user: {
        _id: 'user-123',
        workspaceId: 'workspace-99',
        chatPreferences: { desktopNotifications: true, notificationSound: true },
      },
    }),
  },
}))
vi.mock('../../stores/channelStore', () => ({
  useChannelStore: {
    getState: () => ({
      activeChannelId: 'channel-1',
      channels: [
        { _id: 'channel-1', name: 'general', type: 'public' },
        { _id: 'channel-dm', name: 'Alice', type: 'dm' },
      ],
      setActiveChannel: vi.fn(),
    }),
  },
}))
vi.mock('../../stores/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      openThread: vi.fn(),
      addNotification: vi.fn(),
    }),
  },
}))
vi.mock('../../stores/notificationStore', () => ({
  useNotificationStore: {
    getState: () => ({
      isPaused: false,
      preferences: { channels: {} },
      addNotification: vi.fn(),
    }),
  },
}))

import {
  NotificationType,
  NotificationPriority,
  NavigationTargetType,
  ActiveConversationBehavior,
  eventMapper,
  NotificationBuilder,
  DeduplicationManager,
  deduplicationManager,
  navigationRouter,
  NotificationService,
  notificationConfig,
} from '../index.js'
import { showDesktopNotification } from '../../services/desktopService.js'

describe('Centralized Notification System', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deduplicationManager.clear()
    notificationConfig.updateConfig({
      desktopNotificationsEnabled: true,
      activeConversationBehavior: ActiveConversationBehavior.ALLOW_CRITICAL,
    })
  })

  // ─── 1. Event Normalizer & Mapper Tests ──────────────────────────────────
  describe('Event Mapper & Payload Generation', () => {
    it('normalizes a standard new message event correctly', () => {
      const rawPayload = {
        message: {
          _id: 'msg-101',
          content: 'Hello <b>world</b>',
          channelId: 'channel-1',
          authorId: { _id: 'user-456', name: 'Bob' },
          createdAt: new Date().toISOString(),
        },
      }

      const normalized = eventMapper.normalize('message:create', rawPayload, { currentUserId: 'user-123' })
      expect(normalized).not.toBeNull()
      expect(normalized.type).toBe(NotificationType.NEW_MESSAGE)
      expect(normalized.eventId).toBe('msg-101')
      expect(normalized.sender.name).toBe('Bob')
      expect(normalized.rawContent).toBe('Hello <b>world</b>')
    })

    it('resolves author name when authorId is a string ID and senderSnapshot/name is present', () => {
      const rawPayload = {
        message: {
          _id: 'msg-102',
          content: 'hlo',
          channelId: 'channel-1',
          authorId: 'user-456',
          senderSnapshot: { _id: 'user-456', name: 'Alice Smith' },
        },
      }

      const normalized = eventMapper.normalize('message:create', rawPayload, { currentUserId: 'user-123' })
      expect(normalized).not.toBeNull()
      expect(normalized.sender.name).toBe('Alice Smith')
    })

    it('detects GIF messages and assigns GIF_RECEIVED type', () => {
      const rawPayload = {
        message: {
          _id: 'msg-gif',
          content: 'https://giphy.com/embed/test',
          channelId: 'channel-1',
          authorId: { _id: 'user-456', name: 'Bob' },
        },
      }
      const normalized = eventMapper.normalize('message:create', rawPayload)
      expect(normalized.type).toBe(NotificationType.GIF_RECEIVED)
    })

    it('detects File Attachment messages and assigns FILE_RECEIVED type', () => {
      const rawPayload = {
        message: {
          _id: 'msg-file',
          content: '',
          attachments: [{ url: 'http://test.com/file.png' }],
          channelId: 'channel-1',
          authorId: { _id: 'user-456', name: 'Bob' },
        },
      }
      const normalized = eventMapper.normalize('message:create', rawPayload)
      expect(normalized.type).toBe(NotificationType.FILE_RECEIVED)
    })

    it('detects direct mentions and assigns MENTION_RECEIVED type', () => {
      const rawPayload = {
        message: {
          _id: 'msg-mention',
          content: 'Hey @user-123 check this',
          channelId: 'channel-1',
          authorId: { _id: 'user-456', name: 'Bob' },
        },
      }
      const normalized = eventMapper.normalize('message:create', rawPayload, { currentUserId: 'user-123' })
      expect(normalized.type).toBe(NotificationType.MENTION_RECEIVED)
    })

    it('normalizes thread reply events', () => {
      const rawPayload = {
        message: {
          _id: 'reply-1',
          content: 'I agree',
          threadId: 'root-99',
          channelId: 'channel-1',
          authorId: { _id: 'user-456', name: 'Bob' },
        },
        rootMessageId: 'root-99',
      }
      const normalized = eventMapper.normalize('thread:reply', rawPayload)
      expect(normalized.type).toBe(NotificationType.THREAD_REPLY)
      expect(normalized.threadId).toBe('root-99')
    })

    it('normalizes FlowTask task-card events', () => {
      const taskCreatedPayload = { task: { id: 'task-1', title: 'Fix bug' }, updaterName: 'Manager' }
      const taskUpdatedPayload = { task: { id: 'task-1', title: 'Fix bug' }, updaterName: 'Manager' }
      const taskDeletedPayload = { card: { id: 'task-1', title: 'Fix bug' }, deleterName: 'Admin' }

      const created = eventMapper.normalize('task:created', taskCreatedPayload)
      const updated = eventMapper.normalize('task:updated', taskUpdatedPayload)
      const deleted = eventMapper.normalize('task:deleted', taskDeletedPayload)

      expect(created.type).toBe(NotificationType.TASK_CREATED)
      expect(updated.type).toBe(NotificationType.TASK_UPDATED)
      expect(deleted.type).toBe(NotificationType.TASK_DELETED)
    })
  })

  // ─── 2. Notification Builder & Formatting Tests ─────────────────────────
  describe('Notification Builder & Formatting', () => {
    const channels = [
      { _id: 'channel-1', name: 'general', type: 'public' },
      { _id: 'channel-dm', name: 'Alice', type: 'dm' },
    ]

    it('formats channel message title and body correctly (stripping HTML)', () => {
      const intermediate = {
        type: NotificationType.NEW_MESSAGE,
        eventId: 'msg-1',
        channelId: 'channel-1',
        sender: { id: 'user-2', name: 'Charlie' },
        rawContent: '<p>Check out <strong>this</strong> feature</p>',
      }

      const built = NotificationBuilder.build(intermediate, { channels })
      expect(built.title).toBe('#general')
      expect(built.body).toBe('Charlie: Check out this feature')
      expect(built.navigationTarget.type).toBe(NavigationTargetType.CHANNEL)
      expect(built.navigationTarget.targetId).toBe('channel-1')
    })

    it('formats DM message title and body correctly', () => {
      const intermediate = {
        type: NotificationType.NEW_MESSAGE,
        eventId: 'msg-dm',
        channelId: 'channel-dm',
        sender: { id: 'user-alice', name: 'Alice' },
        rawContent: 'Hey there',
      }

      const built = NotificationBuilder.build(intermediate, { channels })
      expect(built.title).toBe('Alice')
      expect(built.body).toBe('Hey there')
      expect(built.navigationTarget.type).toBe(NavigationTargetType.DM)
      expect(built.navigationTarget.targetId).toBe('channel-dm')
    })

    it('formats thread reply title and navigation target', () => {
      const intermediate = {
        type: NotificationType.THREAD_REPLY,
        eventId: 'rep-1',
        channelId: 'channel-1',
        threadId: 'root-55',
        sender: { id: 'user-2', name: 'Charlie' },
        rawContent: 'Replying here',
      }

      const built = NotificationBuilder.build(intermediate, { channels })
      expect(built.title).toBe('Reply in #general')
      expect(built.navigationTarget.type).toBe(NavigationTargetType.THREAD)
      expect(built.navigationTarget.targetId).toBe('root-55')
      expect(built.navigationTarget.extra.channelId).toBe('channel-1')
    })

    it('formats FlowTask task events with task navigation target', () => {
      const intermediate = {
        type: NotificationType.TASK_UPDATED,
        eventId: 'task-evt-1',
        sender: { id: 'mgr-1', name: 'Manager Dave' },
        metadata: { taskId: 'card-777', taskTitle: 'Implement Billing API' },
      }

      const built = NotificationBuilder.build(intermediate, { channels })
      expect(built.title).toBe('Task Updated: Implement Billing API')
      expect(built.body).toBe('Updated by Manager Dave')
      expect(built.navigationTarget.type).toBe(NavigationTargetType.TASK)
      expect(built.navigationTarget.targetId).toBe('card-777')
    })
  })

  // ─── 3. Deduplication Manager Tests ────────────────────────────────────
  describe('Deduplication Manager', () => {
    it('detects duplicate events using event ID, type, workspace, and channel context', () => {
      const dedup = new DeduplicationManager()
      const event = {
        type: NotificationType.NEW_MESSAGE,
        eventId: 'msg-dup-1',
        workspaceId: 'ws-1',
        channelId: 'ch-1',
      }

      expect(dedup.isDuplicate(event)).toBe(false)
      dedup.track(event)
      expect(dedup.isDuplicate(event)).toBe(true)
    })

    it('protects against socket reconnection duplicate event bursts', () => {
      const dedup = new DeduplicationManager()
      const event = {
        type: NotificationType.TASK_UPDATED,
        eventId: 'task-100',
        workspaceId: 'ws-1',
      }

      // First time socket delivers event
      const isDup1 = dedup.checkAndTrack(event)
      expect(isDup1).toBe(false)

      // Reconnect triggers duplicate socket emit
      const isDup2 = dedup.checkAndTrack(event)
      expect(isDup2).toBe(true)
    })

    it('allows distinct event IDs for the same channel', () => {
      const dedup = new DeduplicationManager()
      const event1 = { type: NotificationType.NEW_MESSAGE, eventId: 'msg-1', channelId: 'ch-1' }
      const event2 = { type: NotificationType.NEW_MESSAGE, eventId: 'msg-2', channelId: 'ch-1' }

      expect(dedup.checkAndTrack(event1)).toBe(false)
      expect(dedup.checkAndTrack(event2)).toBe(false)
    })
  })

  // ─── 4. Active vs Background Conversation & Mute Tests ──────────────────
  describe('Active & Mute Suppression Rules', () => {
    let service

    beforeEach(() => {
      service = new NotificationService()
    })

    it('suppresses notification if user is actively viewing channel with document visible', () => {
      const event = {
        type: NotificationType.NEW_MESSAGE,
        eventId: 'msg-active',
        channelId: 'channel-1', // Matches mocked activeChannelId
        priority: NotificationPriority.NORMAL,
      }

      // Mock document visibility
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true })

      const suppressed = service.shouldSuppressNotification(event, {
        activeChannelId: 'channel-1',
        notifStore: { isPaused: false },
      })

      expect(suppressed).toBe(true)
    })

    it('allows notification if user is viewing a DIFFERENT channel', () => {
      const event = {
        type: NotificationType.NEW_MESSAGE,
        eventId: 'msg-bg',
        channelId: 'channel-other',
        priority: NotificationPriority.NORMAL,
      }

      const suppressed = service.shouldSuppressNotification(event, {
        activeChannelId: 'channel-1',
        notifStore: { isPaused: false },
      })

      expect(suppressed).toBe(false)
    })

    it('allows HIGH priority notifications even in active channel', () => {
      const event = {
        type: NotificationType.MENTION_RECEIVED,
        eventId: 'msg-urgent',
        channelId: 'channel-1',
        priority: NotificationPriority.HIGH,
      }

      const suppressed = service.shouldSuppressNotification(event, {
        activeChannelId: 'channel-1',
        notifStore: { isPaused: false },
      })

      expect(suppressed).toBe(false)
    })

    it('suppresses notifications for muted channels', () => {
      const event = {
        type: NotificationType.NEW_MESSAGE,
        eventId: 'msg-muted',
        channelId: 'channel-muted',
        priority: NotificationPriority.NORMAL,
      }

      const suppressed = service.shouldSuppressNotification(event, {
        activeChannelId: 'channel-1',
        notifStore: {
          isPaused: false,
          preferences: { channels: { 'channel-muted': { muted: true } } },
        },
      })

      expect(suppressed).toBe(true)
    })
  })

  // ─── 5. Notification Click Navigation Router Tests ─────────────────────
  describe('Notification Click Navigation Router', () => {
    it('routes channel navigation correctly', () => {
      const spy = vi.spyOn(navigationRouter, 'navigate')
      navigationRouter.navigate({ type: NavigationTargetType.CHANNEL, targetId: 'channel-99' })
      expect(spy).toHaveBeenCalledWith({ type: NavigationTargetType.CHANNEL, targetId: 'channel-99' })
    })

    it('dispatches custom event for FlowTask task card clicks', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
      navigationRouter.navigate({ type: NavigationTargetType.TASK, targetId: 'card-123' })

      expect(dispatchSpy).toHaveBeenCalled()
      const customEvt = dispatchSpy.mock.calls[0][0]
      expect(customEvt.type).toBe('flowtask:navigate:task')
      expect(customEvt.detail.taskId).toBe('card-123')
    })
  })

  // ─── 6. Full End-to-End Pipeline Execution ──────────────────────────────
  describe('Full End-to-End Pipeline Execution', () => {
    it('processes incoming socket message and calls native desktop delivery', () => {
      const service = new NotificationService()

      // Event in a background channel
      const rawMessage = {
        _id: 'msg-e2e',
        content: 'Hi background channel',
        channelId: 'channel-dm',
        authorId: { _id: 'user-bob', name: 'Bob' },
      }

      const event = service.processEvent('message:create', { message: rawMessage }, { currentUserId: 'user-123' })

      expect(event).not.toBeNull()
      expect(event.title).toBe('Bob')
      expect(event.body).toBe('Hi background channel')
      expect(showDesktopNotification).toHaveBeenCalledWith(
        'Bob',
        expect.objectContaining({
          body: 'Hi background channel',
          data: expect.objectContaining({
            eventId: 'msg-e2e',
            channelId: 'channel-dm',
          }),
        }),
      )
    })
  })
})
