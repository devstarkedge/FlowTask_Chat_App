import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema, model } = mongoose;

/**
 * ChatUser — supports dual authentication:
 *  1. Native: email/password registration directly in the Chat app
 *  2. FlowTask: SSO via FlowTask JWT tokens
 *
 * Fields:
 *  - Identity fields (name, email, role, etc.)
 *  - Password infrastructure (native auth only)
 *  - Email verification & password reset tokens
 *  - Refresh token rotation for session management
 *  - Chat-specific preferences and presence status
 */

const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

const chatPreferencesSchema = new Schema({
  theme: {
    type: String,
    enum: ['light', 'dark', 'system'],
    default: 'system',
  },
  sidebarTheme: {
    type: String,
    enum: ['aubergine', 'purple', 'blue', 'green', 'graphite', 'custom'],
    default: 'aubergine',
  },
  customTheme: {
    sidebarBg: { type: String, default: '#3f0e40' },
    sidebarText: { type: String, default: '#f8edf7' },
    accentColor: { type: String, default: '#1264a3' },
    sidebarActive: { type: String, default: '#1164a3' },
  },
  notificationSound: {
    type: Boolean,
    default: true,
  },
  desktopNotifications: {
    type: Boolean,
    default: true,
  },
  sidebarCollapsed: {
    type: Boolean,
    default: false,
  },
  compactMode: {
    type: Boolean,
    default: false,
  },
  // Per-channel mute overrides: Map<channelId, { muted: boolean, muteUntil: Date }>
  channelMutes: {
    type: Map,
    of: new Schema({
      muted: { type: Boolean, default: false },
      muteUntil: { type: Date, default: null },
    }, { _id: false }),
    default: new Map(),
  },
  // DND schedule — suppress all notifications during these hours (user's local time)
  dndSchedule: {
    enabled: { type: Boolean, default: false },
    startHour: { type: Number, default: 22, min: 0, max: 23 },
    endHour: { type: Number, default: 8, min: 0, max: 23 },
    timezone: { type: String, default: 'UTC' },
  },
  // Email notification preferences
  emailNotifications: {
    enabled: { type: Boolean, default: true },
    mentions: { type: Boolean, default: true },
    dms: { type: Boolean, default: true },
    threadReplies: { type: Boolean, default: true },
    // Delay before sending email (batch window) — in minutes
    delayMinutes: { type: Number, default: 5, min: 1, max: 60 },
  },
}, { _id: false });

const chatUserSchema = new Schema({
  // ─── Auth Provider ────────────────────────────────────────────────────
  authProvider: {
    type: String,
    enum: ['native', 'flowtask'],
    default: 'native',
    required: true,
  },

  // ─── FlowTask-synced fields (only for FlowTask auth) ─────────────────
  flowTaskUserId: {
    type: String,
    // sparse index defined explicitly below
  },
  flowTaskToken: {
    type: String,
    select: false, // Never returned unless explicitly requested
    default: null,
  },
  flowTaskTokenExpiry: {
    type: Date,
    select: false,
    default: null,
  },
  // ─── Identity ─────────────────────────────────────────────────────────
  name: {
    type: String,
    required: true,
    maxlength: 50,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  role: {
    type: String,
    default: 'employee',
    lowercase: true,
  },
  departmentIds: [{
    type: String,
  }],
  teamId: {
    type: String,
    default: null,
  },
  avatar: {
    type: String,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
    // index: removed — covered by compound { role: 1, isActive: 1 }
  },

  // ─── Password (native auth only, excluded from queries by default) ────
  password: {
    type: String,
    select: false, // Never returned unless explicitly requested
    minlength: 8,
  },

  // ─── Email Verification ───────────────────────────────────────────────
  emailVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: {
    type: String,
    select: false,
  },
  verificationExpiry: {
    type: Date,
    select: false,
  },

  // ─── Password Reset ──────────────────────────────────────────────────
  passwordResetToken: {
    type: String,
    select: false,
  },
  passwordResetExpiry: {
    type: Date,
    select: false,
  },

  // ─── Refresh Tokens (hashed, for rotation-based revocation) ──────────
  refreshTokens: [{
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    userAgent: { type: String, default: '' },
  }],

  // ─── Login Lockout (brute-force protection) ──────────────────────────
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: {
    type: Date,
    default: null,
  },

  // ─── Chat-owned fields ───────────────────────────────────────────────
  onlineStatus: {
    type: String,
    enum: ['online', 'away', 'dnd', 'offline'],
    default: 'offline',
  },
  lastSeenAt: {
    type: Date,
    default: null,
  },

  // ─── Custom Status ("In a meeting", "On vacation", etc.) ──────────
  customStatus: {
    emoji: { type: String, default: null, maxlength: 10 },
    text: { type: String, default: null, maxlength: 100 },
    expiresAt: { type: Date, default: null },
  },

  chatPreferences: {
    type: chatPreferencesSchema,
    default: () => ({}),
  },
  socketIds: [{
    type: String,
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Globally unique email
chatUserSchema.index({ email: 1 }, { unique: true });
// Globally unique flowTaskUserId (sparse — null for native users)
chatUserSchema.index({ flowTaskUserId: 1 }, { unique: true, sparse: true });
// Role/status lookup
chatUserSchema.index({ role: 1, isActive: 1 });
chatUserSchema.index({ onlineStatus: 1 });
chatUserSchema.index({ departmentIds: 1, isActive: 1 });

// ─── Pre-save: Hash password on change ───────────────────────────────────────
chatUserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  try {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Instance Methods ────────────────────────────────────────────────────────

/** Compare a candidate password against the stored hash. */
chatUserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

/** Check if the account is currently locked due to failed login attempts. */
chatUserSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

/** Increment login attempts; lock account after MAX_LOGIN_ATTEMPTS. */
chatUserSchema.methods.incrementLoginAttempts = async function () {
  // Reset if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked()) {
    updates.$set = { lockUntil: new Date(Date.now() + LOCK_TIME_MS) };
  }
  return this.updateOne(updates);
};

/** Reset login attempts after successful login. */
chatUserSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 },
  });
};

chatUserSchema.methods.isAdmin = function () {
  return this.role === 'admin';
};

chatUserSchema.methods.isManagerOrAdmin = function () {
  return ['admin', 'manager'].includes(this.role);
};

chatUserSchema.methods.belongsToDepartment = function (departmentId) {
  return this.role === 'admin' || this.departmentIds.includes(departmentId);
};

// ─── Static Methods ──────────────────────────────────────────────────────────
chatUserSchema.statics.findByFlowTaskId = function (flowTaskUserId) {
  return this.findOne({ flowTaskUserId });
};

chatUserSchema.statics.findActiveByDepartment = function (departmentId) {
  return this.find({ departmentIds: departmentId, isActive: true });
};

const ChatUser = model('ChatUser', chatUserSchema);

export default ChatUser;
