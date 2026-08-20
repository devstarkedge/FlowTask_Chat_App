import dotenv from 'dotenv';
dotenv.config({ override: true });

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

// ─── Production enforcement ──────────────────────────────────────────────────
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
if (IS_PRODUCTION) {
  const prodRequired = ['BASE_URL', 'CORS_ORIGINS'];
  const prodMissing = prodRequired.filter((key) => !process.env[key]);
  if (prodMissing.length > 0) {
    console.error(`[FATAL] Missing production-required env vars: ${prodMissing.join(', ')}`);
    process.exit(1);
  }
}

// ─── Parse CORS origins ─────────────────────────────────────────────────────
function parseCorsOrigins(raw) {
  if (!raw) return IS_PRODUCTION ? [] : ['http://localhost:5174'];
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
  IS_PRODUCTION,
  BASE_URL: process.env.BASE_URL || (IS_PRODUCTION ? '' : 'http://localhost:3200'),
  // Client/frontend URL — used in emails and invite links.
  // Priority: CLIENT_URL env → first CORS origin → Vite dev default.
  CLIENT_URL: process.env.CLIENT_URL
    || (parseCorsOrigins(process.env.CORS_ORIGINS) || [])[0]
    || (IS_PRODUCTION ? '' : 'http://localhost:5174'),

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
  // development → 'debug'  (error, warn, info, http/morgan, debug all visible)
  // production  → 'info'   (only error, warn, info — debug and http suppressed)
  // Override via LOG_LEVEL env var (e.g. LOG_LEVEL=debug in Render for a session)
  LOG_LEVEL: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  // Uploads
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 50 * 1024 * 1024, // 50MB

  // Redis (optional)
  REDIS_URL: process.env.REDIS_URL || '',
  CANVAS_COLLAB_ENABLED: process.env.CANVAS_COLLAB_ENABLED !== 'false',
  CANVAS_COLLAB_PORT: parseInt(process.env.CANVAS_COLLAB_PORT, 10) || ((parseInt(process.env.PORT, 10) || 3200) + 1),
  CANVAS_COLLAB_DEBOUNCE_MS: parseInt(process.env.CANVAS_COLLAB_DEBOUNCE_MS, 10) || 1200,
  CANVAS_COLLAB_MAX_DEBOUNCE_MS: parseInt(process.env.CANVAS_COLLAB_MAX_DEBOUNCE_MS, 10) || 8000,

  // Proxy
  TRUST_PROXY: parseInt(process.env.TRUST_PROXY, 10) || 0,

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

  // Workspace — Multi-tenant configuration.
  // No default/global workspace env vars — every workspace is created
  // dynamically (FlowTask SSO or ChatApp-native creation), never bootstrapped
  // from a hardcoded slug/name. See workspace.service.js.
  WORKSPACE_SUBDOMAIN_ENABLED: process.env.WORKSPACE_SUBDOMAIN_ENABLED === 'true',
  // When true, all socket emits/joins must include a workspace context.
  // Default to strict mode in production to avoid accidental cross-tenant leaks.
  SOCKET_REQUIRE_WORKSPACE: (process.env.SOCKET_REQUIRE_WORKSPACE === 'true') || IS_PRODUCTION,
  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || (process.env.SMTP_FROM ? `mailto:${process.env.SMTP_FROM}` : 'mailto:admin@localhost'),

  // Firebase Cloud Messaging (FCM)
  FCM_SERVER_KEY: process.env.FCM_SERVER_KEY || '',
  FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT || '',
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',

  // Expo Push Notifications
  EXPO_ACCESS_TOKEN: process.env.EXPO_ACCESS_TOKEN || '',
});

export default env;
