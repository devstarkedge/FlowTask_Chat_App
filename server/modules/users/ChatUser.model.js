import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * ChatUser — mirrors FlowTask User identity for chat operations.
 *
 * This is NOT a duplicate of the FlowTask User model. It stores:
 *  - Identity fields synced from FlowTask (read-only source of truth)
 *  - Chat-specific preferences and status (chat-owned)
 *
 * Auth is always proxied via FlowTask JWT — no password stored here.
 */

const chatPreferencesSchema = new Schema({
  theme: {
    type: String,
    enum: ['light', 'dark', 'system'],
    default: 'system',
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
}, { _id: false });

const chatUserSchema = new Schema({
  // ─── FlowTask-synced fields (read-only in chat context) ───
  flowTaskUserId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
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
    type: String, // Store as strings to avoid cross-DB ObjectId dependency
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
    index: true,
  },

  // ─── Chat-owned fields ───
  onlineStatus: {
    type: String,
    enum: ['online', 'away', 'dnd', 'offline'],
    default: 'offline',
  },
  lastSeenAt: {
    type: Date,
    default: null,
  },
  chatPreferences: {
    type: chatPreferencesSchema,
    default: () => ({}),
  },
  socketIds: [{
    type: String, // Track active socket connections for multi-tab support
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
chatUserSchema.index({ email: 1 });
chatUserSchema.index({ departmentIds: 1 });
chatUserSchema.index({ role: 1, isActive: 1 });
chatUserSchema.index({ onlineStatus: 1 });

// ─── Instance Methods ────────────────────────────────────────────────────────
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
  return this.find({
    departmentIds: departmentId,
    isActive: true,
  });
};

const ChatUser = model('ChatUser', chatUserSchema);

export default ChatUser;
