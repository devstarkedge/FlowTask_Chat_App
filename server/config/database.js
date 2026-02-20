import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import env from './environment.js';

/**
 * MongoDB connection manager.
 * Pools up to 100 connections to handle high concurrency.
 * Matches FlowTask backend pool configuration.
 */
const MONGOOSE_OPTIONS = {
  maxPoolSize: 100,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  // Disable auto-indexing in production — indexes should be created via migration scripts
  autoIndex: !env.IS_PRODUCTION,
};

let isConnected = false;

export async function connectDatabase() {
  if (isConnected) return;

  try {
    const conn = await mongoose.connect(env.MONGO_URI, MONGOOSE_OPTIONS);
    isConnected = true;
    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    logger.error('MongoDB connection failed', { error: error.message });
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB runtime error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB disconnected');
  });
}

export async function disconnectDatabase() {
  if (!isConnected) return;

  await mongoose.connection.close();
  isConnected = false;
  logger.info('MongoDB connection closed gracefully');
}

export function isDatabaseConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}
