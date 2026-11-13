import mongoose from 'mongoose';
import logger from './logger.js';

export function isSessionFallbackError(err) {
  const msg = err?.message || '';
  return (
    msg.includes('ClientSession must be from the same MongoClient') ||
    msg.includes('Transaction numbers are only allowed') ||
    msg.includes('replica set') ||
    err?.name === 'MongoInvalidArgumentError' ||
    err?.code === 20 ||
    err?.codeName === 'IllegalOperation'
  );
}

function getSharedConnection(models = []) {
  const validModels = models.filter(Boolean);
  if (validModels.length === 0) return mongoose.connection;

  const firstDb = validModels[0]?.db || mongoose.connection;
  const firstClient = firstDb?.client;
  if (!firstClient) return null;

  for (const model of validModels) {
    const db = model?.db;
    if (db?.client !== firstClient) {
      return null;
    }
  }
  return firstDb;
}

/**
 * Executes a multi-document operation inside a MongoDB transaction when all
 * involved models share an active MongoClient supporting transactions.
 * If starting or running the transaction fails due to a ClientSession mismatch
 * or standalone topology, it cleanly retries without a session.
 */
export async function runWithOptionalTransaction(models, work, cleanupOnFallbackFailure = null) {
  const conn = getSharedConnection(models);
  let session = null;

  if (conn && typeof conn.startSession === 'function') {
    try {
      session = await conn.startSession();
      if (session?.client && conn.client && session.client !== conn.client) {
        await session.endSession().catch(() => {});
        session = null;
      }
    } catch (sessionErr) {
      logger.warn('Failed to start MongoDB session; falling back to non-transactional execution', {
        error: sessionErr.message,
      });
      if (session) {
        await session.endSession().catch(() => {});
        session = null;
      }
    }
  }

  if (session) {
    try {
      session.startTransaction();
      const result = await work(session);
      await session.commitTransaction();
      return result;
    } catch (err) {
      if (session.inTransaction()) {
        await session.abortTransaction().catch(() => {});
      }
      if (!isSessionFallbackError(err)) {
        throw err;
      }
      logger.warn('MongoDB transaction failed due to session/client mismatch; retrying without transaction', {
        error: err.message,
      });
    } finally {
      await session.endSession().catch(() => {});
    }
  }

  try {
    return await work(null);
  } catch (fallbackErr) {
    if (typeof cleanupOnFallbackFailure === 'function') {
      await cleanupOnFallbackFailure(fallbackErr).catch(() => {});
    }
    throw fallbackErr;
  }
}
