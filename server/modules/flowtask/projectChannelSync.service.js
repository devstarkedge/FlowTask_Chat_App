import crypto from 'node:crypto';
import ProjectChannelSyncJob from './ProjectChannelSyncJob.model.js';
import ChatUser from '../users/ChatUser.model.js';
import channelService from '../channels/channel.service.js';
import { addJob, registerQueue } from '../../services/jobQueue.service.js';
import { emitToUser } from '../../sockets/socketManager.js';
import { SOCKET_EVENTS } from '../../config/constants.js';
import logger from '../../utils/logger.js';

const QUEUE_NAME = 'flowtask-project-channel-sync';
const LEASE_MS = 2 * 60 * 1000;
const RECOVERY_INTERVAL_MS = 15 * 1000;
const MAX_JOB_ATTEMPTS = 3;
let recoveryTimer = null;

function scopeKey(workspaceId, flowTaskUserId) {
  return `${workspaceId}:${flowTaskUserId}`;
}

function clientStatus(job, extra = {}) {
  const completedBoards = job?.completedBoards || 0;
  const failedBoards = job?.failedBoards || 0;
  return {
    jobId: job?._id?.toString?.() || job?.jobId || null,
    workspaceId: job?.workspaceId?.toString?.() || job?.workspaceId || null,
    status: job?.status || 'pending',
    totalBoards: job?.totalBoards || 0,
    completedBoards,
    failedBoards,
    processedBoards: completedBoards + failedBoards,
    ...extra,
  };
}

async function queuePersistedJob(job, { recovery = false, delay = 0 } = {}) {
  const jobId = [
    'flowtask-sync',
    job._id.toString(),
    job.generation,
    recovery ? Math.floor(Date.now() / RECOVERY_INTERVAL_MS) : 'initial',
  ].join('-');

  return addJob(
    QUEUE_NAME,
    { jobId: job._id.toString(), generation: job.generation },
    {
      jobId,
      delay,
      backgroundOnly: true,
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  );
}

async function processPersistedJob(queueJob) {
  const { jobId, generation } = queueJob.data;
  const leaseToken = crypto.randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);

  const job = await ProjectChannelSyncJob.findOneAndUpdate(
    {
      _id: jobId,
      generation,
      $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } },
        { status: 'running', leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'running',
        startedAt: now,
        heartbeatAt: now,
        leaseToken,
        leaseExpiresAt,
        lastError: null,
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after' },
  );

  if (!job) {
    logger.info('Duplicate FlowTask channel-sync job skipped', {
      jobId,
      generation,
      queueJobId: queueJob.id,
    });
    return { skipped: true };
  }

  const logContext = {
    jobId: job._id.toString(),
    generation: job.generation,
    requestId: job.requestId,
    workspaceId: job.workspaceId.toString(),
    flowTaskUserId: job.flowTaskUserId,
    chatUserId: job.chatUserId.toString(),
  };

  logger.info('FlowTask channel-sync job started', logContext);
  emitToUser(
    job.chatUserId.toString(),
    SOCKET_EVENTS.CHANNEL_SYNC_PROGRESS,
    clientStatus(job, { status: 'running' }),
    job.workspaceId.toString(),
  );

  const heartbeat = setInterval(() => {
    const heartbeatAt = new Date();
    ProjectChannelSyncJob.updateOne(
      { _id: job._id, leaseToken, status: 'running' },
      {
        $set: {
          heartbeatAt,
          leaseExpiresAt: new Date(heartbeatAt.getTime() + LEASE_MS),
        },
      },
    ).catch((error) => logger.warn('FlowTask channel-sync heartbeat failed', {
      ...logContext,
      error: error.message,
    }));
  }, Math.floor(LEASE_MS / 3));
  heartbeat.unref?.();

  try {
    const chatUser = await ChatUser.findById(job.chatUserId).select('+flowTaskToken');
    if (!chatUser?.flowTaskToken) {
      throw new Error('Authenticated FlowTask token is unavailable for channel synchronization');
    }

    await channelService.activatePendingParticipantsForUser(
      chatUser,
      job.workspaceId.toString(),
    ).catch((error) => logger.warn('Pending FlowTask participant activation deferred', {
      ...logContext,
      error: error.message,
    }));

    const result = await channelService.syncProjectChannelsForUser(
      chatUser.flowTaskToken,
      chatUser,
      job.workspaceId.toString(),
      {
        jobId: job._id.toString(),
        requestId: job.requestId,
        concurrency: 3,
        boardIds: job.retryBoardIds?.length ? job.retryBoardIds : null,
        onBoardsDiscovered: async (boards) => {
          if ((job.boardResults || []).length > 0) return;
          await ProjectChannelSyncJob.updateOne(
            { _id: job._id, leaseToken, status: 'running' },
            { $set: { boardResults: boards, totalBoards: boards.length } },
          );
        },
        onBoardState: async (state) => {
          await ProjectChannelSyncJob.updateOne(
            {
              _id: job._id,
              leaseToken,
              status: 'running',
              'boardResults.boardId': state.boardId,
            },
            {
              $set: {
                'boardResults.$.boardName': state.boardName,
                'boardResults.$.status': state.status,
                'boardResults.$.retryable': state.retryable,
                'boardResults.$.error': state.error || null,
              },
            },
          );
        },
        onProgress: async (progress) => {
          const heartbeatAt = new Date();
          await ProjectChannelSyncJob.updateOne(
            { _id: job._id, leaseToken, status: 'running' },
            {
              $max: {
                totalBoards: progress.totalBoards,
                completedBoards: progress.completedBoards,
                failedBoards: progress.failedBoards,
                heartbeatAt,
                leaseExpiresAt: new Date(heartbeatAt.getTime() + LEASE_MS),
              },
            },
          );
          emitToUser(
            job.chatUserId.toString(),
            SOCKET_EVENTS.CHANNEL_SYNC_PROGRESS,
            clientStatus(job, { status: 'running', ...progress }),
            job.workspaceId.toString(),
          );
        },
      },
    );

    const mergedByBoardId = new Map(
      (job.boardResults || []).map((item) => [item.boardId, item.toObject?.() || item]),
    );
    for (const item of result.results) mergedByBoardId.set(item.boardId, item);
    const mergedResults = [...mergedByBoardId.values()];
    const retryBoardIds = mergedResults
      .filter((item) => item.status === 'failed' && item.retryable)
      .map((item) => item.boardId);
    const shouldRetry = retryBoardIds.length > 0 && job.attempts < MAX_JOB_ATTEMPTS;
    const completedBoards = mergedResults.filter((item) => item.status === 'completed').length;
    const failedBoards = mergedResults.filter((item) => item.status === 'failed').length;
    const totalBoards = Math.max(job.totalBoards || 0, result.totalBoards, mergedResults.length);
    const terminalStatus = failedBoards === 0
      ? 'completed'
      : (completedBoards > 0 ? 'partial' : 'failed');
    const nextAttemptAt = shouldRetry
      ? new Date(Date.now() + Math.min(30000, 1000 * (2 ** job.attempts)))
      : null;

    const updated = await ProjectChannelSyncJob.findOneAndUpdate(
      { _id: job._id, leaseToken, status: 'running' },
      {
        $set: {
          status: shouldRetry ? 'pending' : terminalStatus,
          completedAt: shouldRetry ? null : new Date(),
          nextAttemptAt,
          totalBoards,
          completedBoards,
          failedBoards,
          retryBoardIds: shouldRetry ? retryBoardIds : [],
          boardResults: mergedResults,
          lastError: failedBoards > 0
            ? `${failedBoards} board synchronization(s) failed`
            : null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      },
      { returnDocument: 'after' },
    );

    if (shouldRetry && updated) {
      const delay = Math.max(0, nextAttemptAt.getTime() - Date.now());
      await queuePersistedJob(updated, { recovery: true, delay });
      logger.warn('FlowTask channel-sync retry scheduled', {
        ...logContext,
        attempt: job.attempts,
        retryBoards: retryBoardIds.length,
        nextAttemptAt,
      });
      return clientStatus(updated);
    }

    const event = terminalStatus === 'completed'
      ? SOCKET_EVENTS.CHANNEL_SYNC_COMPLETED
      : SOCKET_EVENTS.CHANNEL_SYNC_FAILED;
    emitToUser(
      job.chatUserId.toString(),
      event,
      clientStatus(updated || job, { status: terminalStatus }),
      job.workspaceId.toString(),
    );
    emitToUser(
      job.chatUserId.toString(),
      SOCKET_EVENTS.CHANNEL_LIST_INVALIDATED,
      { workspaceId: job.workspaceId.toString(), jobId: job._id.toString() },
      job.workspaceId.toString(),
    );
    logger.info('FlowTask channel-sync job completed', {
      ...logContext,
      status: terminalStatus,
      totalBoards,
      completedBoards,
      failedBoards,
      attempts: job.attempts,
    });
    return clientStatus(updated || job, { status: terminalStatus });
  } catch (error) {
    const shouldRetry = job.attempts < MAX_JOB_ATTEMPTS;
    const nextAttemptAt = shouldRetry
      ? new Date(Date.now() + Math.min(30000, 1000 * (2 ** job.attempts)))
      : null;
    const updated = await ProjectChannelSyncJob.findOneAndUpdate(
      { _id: job._id, leaseToken, status: 'running' },
      {
        $set: {
          status: shouldRetry ? 'pending' : 'failed',
          nextAttemptAt,
          completedAt: shouldRetry ? null : new Date(),
          lastError: error.message,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      },
      { returnDocument: 'after' },
    );
    logger.error('FlowTask channel-sync job failed', {
      ...logContext,
      attempt: job.attempts,
      willRetry: shouldRetry,
      error: error.message,
    });
    if (shouldRetry && updated) {
      await queuePersistedJob(updated, {
        recovery: true,
        delay: Math.max(0, nextAttemptAt.getTime() - Date.now()),
      });
    } else {
      emitToUser(
        job.chatUserId.toString(),
        SOCKET_EVENTS.CHANNEL_SYNC_FAILED,
        clientStatus(updated || job, { status: 'failed', error: error.message }),
        job.workspaceId.toString(),
      );
    }
    return clientStatus(updated || job);
  } finally {
    clearInterval(heartbeat);
  }
}

registerQueue(QUEUE_NAME, processPersistedJob, { concurrency: 2 });

class ProjectChannelSyncService {
  async getStatusForUser(chatUserId, workspaceId) {
    const job = await ProjectChannelSyncJob.findOne({ chatUserId, workspaceId })
      .sort({ updatedAt: -1 });
    return job ? clientStatus(job) : { workspaceId: workspaceId.toString(), status: 'completed' };
  }

  async enqueueForUser({ chatUser, workspaceId, requestId, reason = 'login' }) {
    const flowTaskUserId = chatUser?.flowTaskUserId?.toString?.();
    if (!workspaceId || !flowTaskUserId || !chatUser?._id) {
      throw new Error('workspaceId, ChatApp user, and FlowTask identity are required');
    }

    const key = scopeKey(workspaceId, flowTaskUserId);
    let existing = await ProjectChannelSyncJob.findOne({ scopeKey: key });
    let job;
    let reused = false;

    if (existing && ['pending', 'running'].includes(existing.status)) {
      job = existing;
      reused = true;
    } else if (existing) {
      job = await ProjectChannelSyncJob.findOneAndUpdate(
        { _id: existing._id, generation: existing.generation, status: existing.status },
        {
          $set: {
            status: 'pending',
            chatUserId: chatUser._id,
            reason,
            requestId,
            requestedAt: new Date(),
            startedAt: null,
            completedAt: null,
            heartbeatAt: null,
            nextAttemptAt: new Date(),
            attempts: 0,
            totalBoards: 0,
            completedBoards: 0,
            failedBoards: 0,
            retryBoardIds: [],
            boardResults: [],
            lastError: null,
            leaseToken: null,
            leaseExpiresAt: null,
          },
          $inc: { generation: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!job) {
        job = await ProjectChannelSyncJob.findOne({ scopeKey: key });
        reused = true;
      }
    } else {
      try {
        job = await ProjectChannelSyncJob.create({
          scopeKey: key,
          workspaceId,
          chatUserId: chatUser._id,
          flowTaskUserId,
          reason,
          requestId,
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        job = await ProjectChannelSyncJob.findOne({ scopeKey: key });
        reused = true;
      }
    }

    if (!job) throw new Error('Unable to create or resolve channel synchronization job');

    if (!reused) {
      await queuePersistedJob(job);
      logger.info('FlowTask channel-sync job queued', {
        jobId: job._id,
        generation: job.generation,
        requestId,
        workspaceId,
        flowTaskUserId,
        reason,
      });
    } else {
      logger.info('Duplicate FlowTask channel-sync request joined existing job', {
        jobId: job._id,
        generation: job.generation,
        requestId,
        workspaceId,
        flowTaskUserId,
        status: job.status,
      });
    }

    return clientStatus(job, { reused });
  }

  async recoverDueJobs() {
    const now = new Date();
    const jobs = await ProjectChannelSyncJob.find({
      $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } },
        { status: 'running', leaseExpiresAt: { $lte: now } },
      ],
    }).sort({ nextAttemptAt: 1 }).limit(25);

    for (const job of jobs) {
      await queuePersistedJob(job, { recovery: true });
    }
    if (jobs.length > 0) {
      logger.info('Recovered due FlowTask channel-sync jobs', { count: jobs.length });
    }
    return jobs.length;
  }

  startRecovery() {
    if (recoveryTimer) return;
    this.recoverDueJobs().catch((error) => logger.error(
      'Initial FlowTask channel-sync recovery failed',
      { error: error.message },
    ));
    recoveryTimer = setInterval(() => {
      this.recoverDueJobs().catch((error) => logger.error(
        'FlowTask channel-sync recovery failed',
        { error: error.message },
      ));
    }, RECOVERY_INTERVAL_MS);
    recoveryTimer.unref?.();
  }

  stopRecovery() {
    if (recoveryTimer) clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
}

export { processPersistedJob, clientStatus };
export default new ProjectChannelSyncService();
