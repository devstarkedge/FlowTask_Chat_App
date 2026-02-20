import dotenv from 'dotenv';
dotenv.config();

/**
 * Centralized environment configuration with validation.
 * Fails fast on missing required variables to prevent runtime surprises.
 */
const required = [
  'MONGO_URI',
  'JWT_SECRET',
  'FLOWTASK_API_URL',
  'FLOWTASK_WEBHOOK_SECRET',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const env = Object.freeze({
  // Server
  PORT: parseInt(process.env.PORT, 10) || 3200,
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',

  // Database
  MONGO_URI: process.env.MONGO_URI,

  // FlowTask Integration
  FLOWTASK_API_URL: process.env.FLOWTASK_API_URL,
  FLOWTASK_WEBHOOK_SECRET: process.env.FLOWTASK_WEBHOOK_SECRET,

  // Auth — MUST match FlowTask's JWT_SECRET
  JWT_SECRET: process.env.JWT_SECRET,

  // CORS
  CORS_ORIGINS: process.env.CORS_ORIGIN || 'http://localhost:5174',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Uploads
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB
});

export default env;
