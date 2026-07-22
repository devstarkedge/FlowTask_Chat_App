import crypto from 'node:crypto';
import ProjectChannelSyncLock from './ProjectChannelSyncLock.model.js';
import logger from '../../utils/logger.js';

const LEASE_MS = 30 * 1000;
const MAX_ACQUIRE_ATTEMPTS = 40;

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function acquire(workspaceId, boardId) {
  const scopeKey = `${workspaceId}:${boardId}`;
  const leaseToken = crypto.randomUUID();

  for (let attempt = 1; attempt <= MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LEASE_MS);
    try {
      await ProjectChannelSyncLock.create({
        scopeKey,
        workspaceId,
        boardId,
        leaseToken,
        expiresAt,
      });
      return { scopeKey, leaseToken };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const reclaimed = await ProjectChannelSyncLock.findOneAndUpdate(
        { scopeKey, expiresAt: { $lte: now } },
        { $set: { leaseToken, expiresAt } },
        { returnDocument: 'after' },
      );
      if (reclaimed?.leaseToken === leaseToken) return { scopeKey, leaseToken };
      await wait(50 + Math.floor(Math.random() * 75));
    }
  }

  const error = new Error(`Timed out waiting for project-channel sync lock: ${boardId}`);
  error.code = 'PROJECT_CHANNEL_SYNC_LOCK_TIMEOUT';
  error.retryable = true;
  throw error;
}

export async function withProjectChannelLock({ workspaceId, boardId, jobId }, operation) {
  const lease = await acquire(workspaceId, boardId);
  const heartbeat = setInterval(() => {
    ProjectChannelSyncLock.updateOne(
      { scopeKey: lease.scopeKey, leaseToken: lease.leaseToken },
      { $set: { expiresAt: new Date(Date.now() + LEASE_MS) } },
    ).catch((error) => logger.warn('Project-channel lock heartbeat failed', {
      jobId,
      workspaceId,
      boardId,
      error: error.message,
    }));
  }, Math.floor(LEASE_MS / 3));
  heartbeat.unref?.();

  try {
    return await operation();
  } finally {
    clearInterval(heartbeat);
    await ProjectChannelSyncLock.deleteOne({
      scopeKey: lease.scopeKey,
      leaseToken: lease.leaseToken,
    }).catch((error) => logger.warn('Project-channel lock release failed', {
      jobId,
      workspaceId,
      boardId,
      error: error.message,
    }));
  }
}
