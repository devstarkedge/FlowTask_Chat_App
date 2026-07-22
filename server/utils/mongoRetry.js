import logger from './logger.js';

const RETRYABLE_MONGO_CODES = new Set([112, 244, 251]);

export function isRetryableMongoError(error) {
  if (!error) return false;
  if (RETRYABLE_MONGO_CODES.has(error.code)) return true;
  if (typeof error.hasErrorLabel === 'function') {
    if (error.hasErrorLabel('TransientTransactionError')) return true;
    if (error.hasErrorLabel('UnknownTransactionCommitResult')) return true;
  }
  return /write conflict|please retry your operation|transienttransactionerror|unknowntransactioncommitresult/i.test(
    error.message || '',
  );
}

export async function retryMongoOperation(operation, {
  maxAttempts = 3,
  baseDelayMs = 40,
  context = {},
  shouldRetry = isRetryableMongoError,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === maxAttempts) throw error;
      const delayMs = Math.min(1000, baseDelayMs * (2 ** (attempt - 1)))
        + Math.floor(Math.random() * baseDelayMs);
      logger.warn('Retrying transient MongoDB operation', {
        ...context,
        attempt,
        maxAttempts,
        delayMs,
        mongoCode: error.code,
        error: error.message,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  const values = Array.from(items || []);
  if (values.length === 0) return [];
  const results = new Array(values.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, values.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }));

  return results;
}
