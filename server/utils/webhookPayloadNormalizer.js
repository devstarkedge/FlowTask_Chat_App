import logger from './logger.js';
import { FLOWTASK_EVENTS } from '../config/constants.js';

/**
 * Webhook Payload Normalizer
 *
 * Maps FlowTask webhook payload field names to the internal ChatApp handler format.
 * FlowTask sends payloads with `project`, `actor`, `task` fields, but ChatApp event
 * handlers expect `board`, `userId`, `card`, etc.
 *
 * This normalizer runs ONCE in eventProcessor before dispatching to the event bus,
 * keeping all handler code clean. It ADDS alias fields — original fields are preserved
 * for forward compatibility.
 *
 * Mapping contract (FlowTask → ChatApp):
 *   project       → board     (with id → _id, name → title + name)
 *   project.id    → boardId   (for deletion/member events)
 *   actor.id      → userId
 *   task          → card      (with id → _id)
 *   task.boardId  → boardId
 *   member.userId → memberId
 *   assignees     → assigneeId / assignerId
 *   user.id       → user._id  (user events keep `user` but need _id alias)
 */

/**
 * Normalize a FlowTask webhook payload into ChatApp internal format.
 * Preserves all original fields and adds mapped aliases.
 *
 * @param {string} eventName - The FLOWTASK_EVENTS constant
 * @param {object} payload - Raw webhook payload (after unwrapping .data)
 * @returns {object} Normalized payload with alias fields added
 */
export function normalizeWebhookPayload(eventName, payload) {
  if (!payload || typeof payload !== 'object') return payload || {};

  const normalizer = NORMALIZERS[eventName];
  if (!normalizer) {
    logger.debug('webhookPayloadNormalizer: no normalizer for event, passing through', { eventName });
    return { ...payload };
  }

  try {
    return normalizer(payload);
  } catch (error) {
    logger.error('webhookPayloadNormalizer: normalization failed, using raw payload', {
      eventName,
      error: error.message,
    });
    return { ...payload };
  }
}

// ─── Helper: Build board object from project ─────────────────────────────────

function projectToBoard(project) {
  if (!project) return undefined;
  return {
    _id: project.id || project._id,
    id: project.id || project._id,
    title: project.name || project.title,
    name: project.name || project.title,
    description: project.description,
    department: project.departmentName
      ? { _id: project.department, name: project.departmentName }
      : project.department,
    owner: project.owner,
    members: project.members || [],
    visibility: project.visibility,
    status: project.status,
    createdAt: project.createdAt,
  };
}

// ─── Helper: Build card object from task ─────────────────────────────────────

function taskToCard(task) {
  if (!task) return undefined;
  return {
    _id: task.id || task._id,
    id: task.id || task._id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    assignedTo: task.assignees?.[0] || task.assignedTo,
    assignees: task.assignees,
    boardId: task.boardId,
  };
}

// ─── Helper: Extract userId from actor ───────────────────────────────────────

function actorToUserId(actor) {
  if (!actor) return undefined;
  return actor.id || actor._id;
}

// ─── Helper: Normalize user object (add _id alias for id) ───────────────────

function normalizeUser(user) {
  if (!user) return undefined;
  return {
    ...user,
    _id: user.id || user._id,
  };
}

// ─── Event-Specific Normalizers ──────────────────────────────────────────────

const NORMALIZERS = {
  // ─── Project Events ─────────────────────────────────────────────────────

  [FLOWTASK_EVENTS.PROJECT_CREATED]: (p) => ({
    ...p,
    board: p.board || projectToBoard(p.project),
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.PROJECT_UPDATED]: (p) => ({
    ...p,
    board: p.board || projectToBoard(p.project),
    userId: p.userId || actorToUserId(p.actor),
    changes: p.changes || {},
  }),

  [FLOWTASK_EVENTS.PROJECT_DELETED]: (p) => ({
    ...p,
    boardId: p.boardId || p.project?.id || p.project?._id,
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.PROJECT_MEMBER_ADDED]: (p) => ({
    ...p,
    boardId: p.boardId || p.project?.id || p.project?._id,
    memberId: p.memberId || p.member?.userId || p.member?.id,
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.PROJECT_MEMBER_REMOVED]: (p) => ({
    ...p,
    boardId: p.boardId || p.project?.id || p.project?._id,
    memberId: p.memberId || p.member?.userId || p.member?.id,
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.PROJECT_MEMBER_ASSIGNED]: (p) => ({
    ...p,
    boardId: p.boardId || p.project?.id || p.project?._id,
    memberId: p.memberId || p.member?.userId || p.member?.id,
    role: p.role || p.member?.role,
    userId: p.userId || actorToUserId(p.actor),
  }),

  // ─── Task Events ────────────────────────────────────────────────────────

  [FLOWTASK_EVENTS.TASK_CREATED]: (p) => ({
    ...p,
    card: p.card || taskToCard(p.task),
    boardId: p.boardId || p.task?.boardId || p.project?.id,
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.TASK_UPDATED]: (p) => ({
    ...p,
    card: p.card || taskToCard(p.task),
    boardId: p.boardId || p.task?.boardId || p.project?.id,
    changes: p.changes || {},
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.TASK_DELETED]: (p) => ({
    ...p,
    cardId: p.cardId || p.task?.id || p.task?._id,
    cardTitle: p.cardTitle || p.task?.title,
    boardId: p.boardId || p.task?.boardId || p.project?.id,
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.TASK_ASSIGNED]: (p) => ({
    ...p,
    card: p.card || taskToCard(p.task),
    boardId: p.boardId || p.task?.boardId || p.project?.id,
    assigneeId: p.assigneeId || p.assignees?.[0]?.userId || p.assignees?.[0]?.id,
    assignerId: p.assignerId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.TASK_COMMENTED]: (p) => ({
    ...p,
    comment: p.comment,
    card: p.card || taskToCard(p.task),
    boardId: p.boardId || p.task?.boardId || p.project?.id,
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.TASK_STATUS_CHANGED]: (p) => ({
    ...p,
    card: p.card || taskToCard(p.task),
    boardId: p.boardId || p.task?.boardId || p.project?.id,
    oldStatus: p.oldStatus,
    newStatus: p.newStatus,
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.TASK_DUE_DATE_CHANGED]: (p) => ({
    ...p,
    card: p.card || taskToCard(p.task),
    boardId: p.boardId || p.task?.boardId || p.project?.id,
    oldDueDate: p.oldDueDate,
    newDueDate: p.newDueDate,
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.TIME_ENTRY_ADDED]: (p) => ({
    ...p,
    timeEntry: p.timeEntry,
    card: p.card || taskToCard(p.task),
    boardId: p.boardId || p.task?.boardId || p.project?.id,
    userId: p.userId || actorToUserId(p.actor),
  }),

  // ─── User Events ────────────────────────────────────────────────────────

  [FLOWTASK_EVENTS.USER_CREATED]: (p) => ({
    ...p,
    user: normalizeUser(p.user),
  }),

  [FLOWTASK_EVENTS.USER_UPDATED]: (p) => ({
    ...p,
    user: normalizeUser(p.user),
    changes: p.changes || {},
  }),

  [FLOWTASK_EVENTS.USER_DEACTIVATED]: (p) => ({
    ...p,
    userId: p.userId || p.user?.id || p.user?._id,
    user: p.user ? normalizeUser(p.user) : undefined,
  }),

  [FLOWTASK_EVENTS.USER_REGISTERED]: (p) => ({
    ...p,
    user: normalizeUser(p.user),
  }),

  [FLOWTASK_EVENTS.USER_VERIFIED]: (p) => ({
    ...p,
    user: normalizeUser(p.user),
  }),

  // ─── Announcement Events ────────────────────────────────────────────────

  [FLOWTASK_EVENTS.ANNOUNCEMENT_CREATED]: (p) => ({
    ...p,
    announcement: p.announcement ? { ...p.announcement, _id: p.announcement.id || p.announcement._id } : undefined,
    userId: p.userId || actorToUserId(p.actor),
  }),

  // ─── Department Events ──────────────────────────────────────────────────

  [FLOWTASK_EVENTS.DEPARTMENT_CREATED]: (p) => ({
    ...p,
    department: p.department ? { ...p.department, _id: p.department.id || p.department._id } : undefined,
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.DEPARTMENT_UPDATED]: (p) => ({
    ...p,
    department: p.department ? { ...p.department, _id: p.department.id || p.department._id } : undefined,
    changes: p.changes || {},
  }),

  [FLOWTASK_EVENTS.DEPARTMENT_DELETED]: (p) => ({
    ...p,
    departmentId: p.departmentId || p.department?.id || p.department?._id,
    departmentName: p.departmentName || p.department?.name,
  }),

  [FLOWTASK_EVENTS.DEPARTMENT_MEMBER_ADDED]: (p) => ({
    ...p,
    departmentId: p.departmentId || p.department?.id || p.department?._id,
    memberId: p.memberId || p.member?.userId || p.member?.id,
  }),

  [FLOWTASK_EVENTS.DEPARTMENT_MEMBER_REMOVED]: (p) => ({
    ...p,
    departmentId: p.departmentId || p.department?.id || p.department?._id,
    memberId: p.memberId || p.member?.userId || p.member?.id,
  }),

  // ─── Team Events ────────────────────────────────────────────────────────

  [FLOWTASK_EVENTS.TEAM_CREATED]: (p) => ({
    ...p,
    team: p.team ? { ...p.team, _id: p.team.id || p.team._id } : undefined,
    userId: p.userId || actorToUserId(p.actor),
  }),

  [FLOWTASK_EVENTS.TEAM_UPDATED]: (p) => ({
    ...p,
    team: p.team ? { ...p.team, _id: p.team.id || p.team._id } : undefined,
    changes: p.changes || {},
  }),

  [FLOWTASK_EVENTS.TEAM_DELETED]: (p) => ({
    ...p,
    teamId: p.teamId || p.team?.id || p.team?._id,
    teamName: p.teamName || p.team?.name,
  }),

  [FLOWTASK_EVENTS.TEAM_MEMBER_ADDED]: (p) => ({
    ...p,
    teamId: p.teamId || p.team?.id || p.team?._id,
    memberId: p.memberId || p.member?.userId || p.member?.id,
  }),

  [FLOWTASK_EVENTS.TEAM_MEMBER_REMOVED]: (p) => ({
    ...p,
    teamId: p.teamId || p.team?.id || p.team?._id,
    memberId: p.memberId || p.member?.userId || p.member?.id,
  }),
};
