import mongoose from 'mongoose';
import { EVENT_STATUS, EVENT_PROCESSING } from '../../config/constants.js';

const { Schema, model } = mongoose;

/**
 * ProcessedEvent — idempotency table for FlowTask webhook events.
 *
 * Per spec §8.1:
 *  1. On event receipt, check if deliveryId exists
 *  2. If completed → return 200 immediately
 *  3. If processing → return 202 (already in progress)
 *  4. If not found → insert with 'processing', process, update to 'completed'
 *  5. Purge entries older than 7 days via TTL index
 *
 * This prevents duplicate event processing when FlowTask retries deliveries.
 */

const processedEventSchema = new Schema({
  // ─── Workspace Scope (multi-tenant isolation) ─────────────────────────────
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },

  deliveryId: {
    type: String,
    required: true,
    // unique per workspace — compound index below replaces global unique
  },
  eventName: {
    type: String,
    required: true,
    maxlength: 50,
  },
  status: {
    type: String,
    enum: Object.values(EVENT_STATUS),
    required: true,
    default: EVENT_STATUS.PROCESSING,
  },
  receivedAt: {
    type: Date,
    default: Date.now,
  },
  processedAt: {
    type: Date,
    default: null,
  },
  attempts: {
    type: Number,
    default: 1,
  },
  lastError: {
    type: String,
    default: null,
  },
  // TTL: automatically purge after 7 days
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + EVENT_PROCESSING.PROCESSED_EVENT_TTL_DAYS * 24 * 60 * 60 * 1000),
    index: { expires: 0 },
  },
}, {
  timestamps: false, // Use receivedAt/processedAt instead
});

// ─── Indexes (workspace-scoped) ──────────────────────────────────────────────
// Unique deliveryId per workspace (replaces global unique)
processedEventSchema.index({ workspaceId: 1, deliveryId: 1 }, { unique: true });
processedEventSchema.index({ workspaceId: 1, status: 1 });

// ─── Static Methods ──────────────────────────────────────────────────────────

/**
 * Attempt to claim an event for processing. Returns the claim result.
 * Uses findOneAndUpdate with upsert to handle race conditions atomically.
 *
 * @param {string} deliveryId
 * @param {string} eventName
 * @returns {{ status: 'new'|'duplicate'|'retry', doc: object }}
 */
processedEventSchema.statics.claimEvent = async function (deliveryId, eventName, workspaceId) {
  // Try to find existing
  const filter = { deliveryId };
  if (workspaceId) filter.workspaceId = workspaceId;
  const existing = await this.findOne(filter);

  if (existing) {
    if (existing.status === EVENT_STATUS.COMPLETED) {
      return { status: 'duplicate', doc: existing };
    }
    if (existing.status === EVENT_STATUS.PROCESSING) {
      // Already being processed (possibly by another instance)
      return { status: 'duplicate', doc: existing };
    }
    // Failed — allow retry
    existing.status = EVENT_STATUS.PROCESSING;
    existing.attempts += 1;
    existing.lastError = null;
    await existing.save();
    return { status: 'retry', doc: existing };
  }

  // New event — claim it
  let doc;
  try {
    doc = await this.create({
      deliveryId,
      eventName,
      status: EVENT_STATUS.PROCESSING,
      ...(workspaceId && { workspaceId }),
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const concurrent = await this.findOne(filter);
    return { status: 'duplicate', doc: concurrent };
  }

  return { status: 'new', doc };
};

processedEventSchema.statics.markCompleted = function (deliveryId, workspaceId) {
  const filter = { deliveryId };
  if (workspaceId) filter.workspaceId = workspaceId;
  return this.findOneAndUpdate(
    filter,
    {
      status: EVENT_STATUS.COMPLETED,
      processedAt: new Date(),
    },
  );
};

processedEventSchema.statics.markFailed = function (deliveryId, error, workspaceId) {
  const filter = { deliveryId };
  if (workspaceId) filter.workspaceId = workspaceId;
  return this.findOneAndUpdate(
    filter,
    {
      status: EVENT_STATUS.FAILED,
      lastError: typeof error === 'string' ? error : error?.message || 'Unknown error',
    },
  );
};

const ProcessedEvent = model('ProcessedEvent', processedEventSchema);

export default ProcessedEvent;
