import dotenv from 'dotenv';
dotenv.config();

/**
 * Centralized environment configuration with validation.
 * Fails fast on missing required variables to prevent runtime surprises.
 */

const FLOWTASK_ENABLED = process.env.FLOWTASK_ENABLED !== 'false';

// ─── Required Variables ──────────────────────────────────────────────────────
const required = [
  'MONGO_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
];

// FlowTask-specific requirements (only when enabled)
if (FLOWTASK_ENABLED) {
  required.push('FLOWTASK_API_URL', 'FLOWTASK_WEBHOOK_SECRET', 'FLOWTASK_JWT_SECRET');
}

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// ─── Secret Strength Validation ──────────────────────────────────────────────
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn('[SECURITY WARNING] JWT_SECRET should be at least 32 characters for production safety');
}
if (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length < 32) {
  console.warn('[SECURITY WARNING] JWT_REFRESH_SECRET should be at least 32 characters for production safety');
}

// ─── Parse CORS origins ─────────────────────────────────────────────────────
function parseCorsOrigins(raw) {
  if (!raw) return ['http://localhost:5174'];
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, '')) // strip trailing slashes
    .filter(Boolean);
}

// ─── Build Config ────────────────────────────────────────────────────────────
const env = Object.freeze({
  // Application
  APP_NAME: process.env.APP_NAME || 'FlowTask Chat',
  PORT: parseInt(process.env.PORT, 10) || 3200,
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  BASE_URL: process.env.BASE_URL || 'http://localhost:3200',

  // Database
  MONGO_URI: process.env.MONGO_URI,

  // Auth — Native Chat tokens
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '15m',
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '7d',

  // FlowTask Integration
  FLOWTASK_ENABLED,
  FLOWTASK_API_URL: process.env.FLOWTASK_API_URL || '',
  FLOWTASK_WEBHOOK_SECRET: process.env.FLOWTASK_WEBHOOK_SECRET || '',
  FLOWTASK_JWT_SECRET: process.env.FLOWTASK_JWT_SECRET || '',

  // CORS
  CORS_ORIGINS: parseCorsOrigins(process.env.CORS_ORIGINS),

  // Email
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'noreply@flowchat.local',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Uploads
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB

  // Redis (optional)
  REDIS_URL: process.env.REDIS_URL || '',

  // Proxy
  TRUST_PROXY: parseInt(process.env.TRUST_PROXY, 10) || 0,

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

  // Workspace — Multi-tenant configuration
  DEFAULT_WORKSPACE_SLUG: process.env.DEFAULT_WORKSPACE_SLUG || 'flowtask',
  DEFAULT_WORKSPACE_NAME: process.env.DEFAULT_WORKSPACE_NAME || 'FlowTask',
  WORKSPACE_SUBDOMAIN_ENABLED: process.env.WORKSPACE_SUBDOMAIN_ENABLED === 'true',
});

export default env;
