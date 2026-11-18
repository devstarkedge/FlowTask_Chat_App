import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supportsProjectActivity, messageTimeline } from './projectActivity.js';
import { messageSocketPayload } from '../server/utils/socketPayload.js';

const workspaceId = '111111111111111111111111';
const projectId = '222222222222222222222222';
const channel = { _id: '333333333333333333333333', workspaceId, type: 'project', name: 'Same project name',
  flowTaskRef: { entityType: 'board', entityId: projectId } };
const event = { _id: '444444444444444444444444', workspaceId, channelId: channel._id, contentType: 'activity',
  authorId: { _id: '555555555555555555555555', flowTaskUserId: 'SYSTEM_BOT' },
  activityMeta: { eventType: 'TASK_CREATED', projectId, taskId: '666666666666666666666666' } };

test('actual board mappings enable Activity, including legacy public/private channels', () => {
  for (const type of ['project', 'public', 'private']) {
    assert.equal(supportsProjectActivity({ ...channel, type }, workspaceId), true);
  }
});

test('DMs, group DMs, manual name collisions, system and attendance channels keep events in Messages', () => {
  const others = [
    ...['dm', 'group_dm', 'system', 'department', 'team'].map(type => ({ ...channel, type })),
    ...['public', 'private', 'project'].map(type => ({ ...channel, type, flowTaskRef: null })),
    { ...channel, recipientOnly: true },
    { ...channel, type: 'private', flowTaskRef: { entityType: 'attendance_department', entityId: projectId } },
    { ...channel, flowTaskRef: { entityType: 'board', entityId: 'invalid' } },
  ];
  for (const other of others) {
    assert.equal(supportsProjectActivity(other, workspaceId), false);
    assert.equal(messageTimeline(other, event, workspaceId), 'messages');
  }
});

test('task, subtask, nano, time, attachment and comment events retain their Activity route', () => {
  for (const eventType of ['TASK_CREATED', 'TASK_STATUS_CHANGED', 'SUBTASK_UPDATED', 'NANO_COMPLETED',
    'LOGGED_TIME_ADDED', 'ATTACHMENT_ADDED', 'ATTACHMENT_DELETED', 'COMMENT_UPDATED']) {
    assert.equal(messageTimeline(channel, { ...event, activityMeta: { ...event.activityMeta, eventType } }, workspaceId), 'activity');
  }
  assert.equal(messageTimeline(channel, { ...event, contentType: 'system', activityMeta: null, flowTaskRef: channel.flowTaskRef }, workspaceId), 'activity');
});

test('manual check-in/out, auto checkout and other reporting events always stay in Messages', () => {
  for (const eventType of ['attendance.checked_in', 'attendance.checked_out', 'attendance.auto_checked_out']) {
    assert.equal(messageTimeline(channel, { ...event, reportingMeta: { eventType } }, workspaceId), 'messages');
  }
  assert.equal(messageTimeline(channel, { ...event, reportingEventId: 'report' }, workspaceId), 'messages');
});

test('user messages, manually linked messages, forwarded events, huddles and unknown legacy records remain accessible', () => {
  for (const message of [
    { ...event, contentType: 'text' },
    { ...event, authorId: { _id: 'user' }, flowTaskRef: channel.flowTaskRef },
    { ...event, forwardMeta: { isForwarded: true } },
    { ...event, huddleMeta: { event: 'start' } },
    { ...event, activityMeta: null, flowTaskRef: null },
  ]) assert.equal(messageTimeline(channel, message, workspaceId), 'messages');
});

test('workspace, project and channel mismatches never enter project Activity', () => {
  assert.equal(supportsProjectActivity(channel, projectId), false);
  for (const change of [
    { workspaceId: projectId }, { channelId: projectId },
    { activityMeta: { ...event.activityMeta, projectId: workspaceId } },
    { activityMeta: { ...event.activityMeta, channelId: projectId } },
    { flowTaskRef: { entityType: 'board', entityId: workspaceId } },
  ]) assert.equal(messageTimeline(channel, { ...event, ...change }, workspaceId), 'messages');
});

test('history and real-time socket serialization classify identically after reconnect', () => {
  const socket = messageSocketPayload(event);
  assert.equal(socket.workspaceId, workspaceId);
  assert.equal(socket.isFlowTaskSystemMessage, true);
  assert.equal(messageTimeline(channel, event, workspaceId), messageTimeline(channel, socket, workspaceId));
  const rawSystemEvent = { ...event, authorId: event.authorId._id };
  const emitted = messageSocketPayload(rawSystemEvent, { isFlowTaskSystemMessage: true });
  assert.equal(messageTimeline(channel, emitted, workspaceId), 'activity');
  const manual = messageSocketPayload({ ...event, authorId: { _id: 'user' } });
  assert.equal(messageTimeline(channel, manual, workspaceId), 'messages');
});

test('splitting a mixed historical page preserves order and assigns every record once', () => {
  const page = [event, { ...event, _id: 'second', contentType: 'text' },
    { ...event, _id: 'third', reportingMeta: { eventType: 'attendance.checked_out' } }];
  const messages = page.filter(message => messageTimeline(channel, message, workspaceId) === 'messages');
  const activities = page.filter(message => messageTimeline(channel, message, workspaceId) === 'activity');
  assert.deepEqual(messages.map(message => message._id), ['second', 'third']);
  assert.deepEqual(activities.map(message => message._id), [event._id]);
  assert.equal(new Set([...messages, ...activities].map(message => message._id)).size, page.length);
});
