import { act, cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invalidate: vi.fn() }));
vi.mock('../stores/authStore', async () => ({ useAuthStore: (await import('zustand')).create(() => ({})) }));
vi.mock('../stores/workspaceStore', async () => ({ useWorkspaceStore: (await import('zustand')).create(() => ({})) }));
vi.mock('../stores/channelStore', async () => ({ useChannelStore: (await import('zustand')).create(() => ({})) }));
vi.mock('../stores/chatStore', async () => ({ useChatStore: (await import('zustand')).create(() => ({})) }));
vi.mock('../stores/laterStore', async () => ({ useLaterStore: (await import('zustand')).create(() => ({})) }));
vi.mock('../stores/notificationStore', async () => ({ useNotificationStore: (await import('zustand')).create(() => ({})) }));
vi.mock('./directoriesAPI', () => ({ directoriesAPI: { invalidateCache: mocks.invalidate } }));
vi.mock('../components/chat/FloatingPortal', () => ({ default: ({ children }) => children }));
vi.mock('../components/shared/EmojiRenderer', () => ({ EmojiComponent: () => null }));
import { useAuthStore } from '../stores/authStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChannelStore } from '../stores/channelStore';
import { useChatStore } from '../stores/chatStore';
import { useLaterStore } from '../stores/laterStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useUserProfileStore } from '../stores/userProfileStore';
import { handleUserProfileUpdated } from './userProfileEvents';
import { useLiveProfileData } from '../hooks/useLiveProfileData';
import { renderCurrentMentions } from '../hooks/useLiveMentionRenderer';
import ReactionDetailsPopup from '../components/chat/ReactionDetailsPopup';
import { projectUserProfiles } from '../utils/userProfiles';

const oldUser = { _id: 'chat-a', flowTaskUserId: 'flow-a', name: 'Old Name', email: 'a@example.com', displayName: 'Custom display' };
const message = { _id: 'message-1', authorId: oldUser, senderSnapshot: { name: 'Old Name' },
  content: 'Old Name said hello', htmlContent: '<p>Old Name said hello</p>',
  replyTo: { authorId: 'chat-a', senderName: 'Old Name', content: 'Old Name quote' },
  forwardMeta: { originalSenderId: 'chat-a', originalSenderName: 'Old Name', customMessage: 'Old Name' },
  reactions: [{ emoji: ':thumbsup:', users: [oldUser] }],
};
const event = { workspaceId: 'workspace-1', userId: 'chat-a', flowTaskUserId: 'flow-a', updates: { name: 'New Name', email: 'a@example.com', avatar: null }, profileUpdatedAt: '2026-09-17T10:00:00Z' };
beforeEach(() => {
  cleanup(); vi.clearAllMocks(); useUserProfileStore.getState().clearProfiles();
  useWorkspaceStore.setState({ activeWorkspaceId: 'workspace-1', members: [oldUser, { _id: 'chat-b', name: 'Old Name' }] });
  useAuthStore.setState({ user: { _id: 'self', name: 'Self' } });
  useChannelStore.setState({ channels: [{ _id: 'dm-1', type: 'dm', dmParticipants: ['self','chat-a'], dmRecipientId: 'chat-a', name: 'Old Name' }], membersByChannel: { channel: [oldUser] } });
  useChatStore.setState({ messages: { channel: [message] }, activeThread: { replies: [message] }, pinnedMessagesByChannel: { channel: [message] }, typingByChannel: { channel: { 'chat-a': 'Old Name' } } });
  useLaterStore.setState({ savedMessages: [{ messageId: message }], savedMessageIds: new Set(['message-1']) });
  useNotificationStore.setState({ notifications: [{ _id: 'notification', senderId: 'chat-a', senderName: 'Old Name', body: 'Old Name said hello' }] });
});

describe('workspace-scoped live username propagation', () => {
  it('refreshes historical messages, threads, reactions, DMs, saved/pinned items and notifications by ID', () => {
    handleUserProfileUpdated(event);
    const updated = useChatStore.getState().messages.channel[0];
    expect(updated.authorId.name).toBe('New Name');
    expect(updated.senderSnapshot.name).toBe('New Name');
    expect(updated.reactions[0].users[0].name).toBe('New Name');
    expect(updated.replyTo.senderName).toBe('New Name');
    expect(updated.forwardMeta.originalSenderName).toBe('New Name');
    expect(updated.content).toBe(message.content);
    expect(updated.htmlContent).toBe(message.htmlContent);
    expect(updated.replyTo.content).toBe(message.replyTo.content);
    expect(updated.forwardMeta.customMessage).toBe('Old Name');
    expect(updated.authorId.displayName).toBe('Custom display');
    expect(useWorkspaceStore.getState().members[1].name).toBe('Old Name');
    expect(useChannelStore.getState().channels[0].name).toBe('New Name');
    expect(useChannelStore.getState().membersByChannel.channel[0].name).toBe('New Name');
    expect(useChatStore.getState().activeThread.replies[0].authorId.name).toBe('New Name');
    expect(useChatStore.getState().pinnedMessagesByChannel.channel[0].authorId.name).toBe('New Name');
    expect(useLaterStore.getState().savedMessages[0].messageId.authorId.name).toBe('New Name');
    expect(useLaterStore.getState().savedMessageIds.has('message-1')).toBe(true);
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({ senderName: 'New Name', body: 'Old Name said hello' });
    expect(useChatStore.getState().typingByChannel.channel['chat-a']).toBe('New Name');
    expect(mocks.invalidate.mock.calls).toEqual([['users'],['external'],['groups']]);
  });
  it('ignores foreign workspace events, older versions, and stale responses; duplicate events remain safe', () => {
    handleUserProfileUpdated({ ...event, workspaceId: 'other-workspace' });
    expect(useChatStore.getState().messages.channel[0]).toBe(message);
    handleUserProfileUpdated(event); handleUserProfileUpdated(event);
    handleUserProfileUpdated({ ...event, updates: { name: 'Stale Name' }, profileUpdatedAt: '2026-09-16T10:00:00Z' });
    useUserProfileStore.getState().ingestProfiles('workspace-1', oldUser);
    expect(useUserProfileStore.getState().profilesByWorkspace['workspace-1']['chat-a'].name).toBe('New Name');
    expect(useChatStore.getState().messages.channel).toHaveLength(1);
    expect(useChatStore.getState().messages.channel[0].authorId.name).toBe('New Name');
    expect(useAuthStore.getState().user.name).toBe('Self');
  });
  it('updates already-open UI and reaction tooltips without replacing captured props', () => {
    function ProfilePopup({ user }) { const current = useLiveProfileData(user); return <div data-testid="profile-name">{current.name}</div>; }
    render(<><ProfilePopup user={oldUser} /><ReactionDetailsPopup users={[oldUser]} emoji=":thumbsup:" currentUserId="self" /></>);
    expect(screen.getByTestId('profile-name').textContent).toBe('Old Name');
    act(() => handleUserProfileUpdated(event));
    expect(screen.getByTestId('profile-name').textContent).toBe('New Name');
    expect(screen.getAllByText(/New Name/).length).toBeGreaterThan(1);
    expect(screen.queryByText(/Old Name/)).toBeNull();
  });
  it('resolves mention labels and search metadata by stable ChatApp/FlowTask IDs without editing plain text', () => {
    handleUserProfileUpdated(event);
    const profiles = useUserProfileStore.getState().profilesByWorkspace['workspace-1'];
    const html = '<p>Old Name <span data-mention-type="user" data-mention-id="flow-a">@Old Name</span> <span data-mention-type="user" data-mention-id="flow-b">@Old Name</span></p>';
    const rendered = renderCurrentMentions(html, profiles);
    expect(rendered).toContain('Old Name <span');
    expect(rendered).toContain('>@New Name</span>');
    expect(rendered).toContain('data-mention-id="flow-b">@Old Name</span>');
    expect(html).not.toContain('New Name');
    expect(projectUserProfiles({ id: 'message-1', senderId: 'chat-a', senderName: 'Old Name', snippet: 'Old Name' }, profiles)).toMatchObject({ senderName: 'New Name', snippet: 'Old Name' });
    expect(projectUserProfiles({ id: 'flow-a', type: 'user', name: 'Old Name', label: 'Old Name' }, profiles).label).toBe('New Name');
    expect(renderCurrentMentions('<span data-mention-type="user" data-mention-id="flow-a">Old</span>', { 'flow-a': { name: '<img src=x onerror=alert(1)>' } })).toContain('&lt;img');
  });
  it('hydrates latest profiles after reload and resolves presence/member aliases', () => {
    useUserProfileStore.getState().ingestProfiles('workspace-1', { users: [{ ...oldUser, name: 'Reloaded Name', flowTaskProfileUpdatedAt: event.profileUpdatedAt }, { _id: 'flow-c', chatUserId: 'chat-c', name: 'Contact', email: 'c@example.com' }] });
    const profiles = useUserProfileStore.getState().profilesByWorkspace['workspace-1'];
    expect(projectUserProfiles({ _id: 'flow-a', name: 'Old Name' }, profiles).name).toBe('Reloaded Name');
    expect(projectUserProfiles({ _id: 'chat-c', name: 'Old Contact', onlineStatus: 'online' }, profiles)).toMatchObject({ name: 'Contact', onlineStatus: 'online' });
    expect(useUserProfileStore.getState().profilesByWorkspace['other-workspace']).toBeUndefined();
  });
});
