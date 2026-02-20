# FlowTask Chat Application — Architecture Document

> **Version:** 1.0.0  
> **Last Updated:** 2025-01-15  
> **Audience:** Engineers, Tech Leads, DevOps

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Server Architecture](#3-server-architecture)
4. [Client Architecture](#4-client-architecture)
5. [Database Schema](#5-database-schema)
6. [Real-Time Communication](#6-real-time-communication)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Webhook & Event Pipeline](#8-webhook--event-pipeline)
9. [File Upload System](#9-file-upload-system)
10. [Bot System](#10-bot-system)
11. [Security Measures](#11-security-measures)
12. [Directory Structure](#12-directory-structure)
13. [Configuration & Environment](#13-configuration--environment)
14. [Deployment](#14-deployment)

---

## 1. System Overview

The FlowTask Chat Application is an enterprise real-time messaging platform that integrates with the FlowTask project management system. It provides:

- **Channel-based messaging** — project, department, team, and DM channels
- **Threaded discussions** — linked to FlowTask tasks
- **Real-time updates** — via Socket.IO WebSocket transport
- **Webhook event processing** — ingests 15 FlowTask domain events
- **Bot commands** — `/flowtask tasks`, `/flowtask status`, `/flowtask log`, etc.
- **File uploads** — images, documents, archives with inline preview
- **Role-based access control** — admin, manager, hr, employee, custom roles

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                  React SPA (Vite)                    │
│  Zustand Stores │ Socket.IO Client │ Axios HTTP     │
└────────────┬────────────────┬───────────────────────┘
             │ HTTP REST      │ WebSocket
             ▼                ▼
┌─────────────────────────────────────────────────────┐
│              Express + Socket.IO Server              │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐│
│  │  Auth   │ │ Channels │ │ Messages │ │ Threads ││
│  │ Module  │ │  Module  │ │  Module  │ │  Module ││
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └────┬────┘│
│       │           │            │             │      │
│  ┌────▼───────────▼────────────▼─────────────▼────┐│
│  │         Repository Layer (Mongoose ODM)         ││
│  └────────────────────┬───────────────────────────┘│
│                       │                             │
│  ┌────────────────────▼───────────────────────────┐│
│  │            MongoDB (Atlas / Local)              ││
│  └────────────────────────────────────────────────┘│
│                                                     │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────┐│
│  │  Webhooks  │  │  Event Bus   │  │  Bot Service ││
│  │  Receiver  │→ │ (EventEmitter│→ │  + Notifier  ││
│  └────────────┘  └──────────────┘  └─────────────┘│
└─────────────────────────────────────────────────────┘
             ▲ Webhooks (HMAC-signed)
             │
┌────────────┴────────────────────────────────────────┐
│           FlowTask Backend (External)                │
│   https://proofhub-trello-replica.onrender.com       │
└──────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### Server

| Technology | Version | Purpose |
|---|---|---|
| Node.js | ≥ 18.0.0 | Runtime (ES Modules) |
| Express | 4.21.2 | HTTP framework |
| Socket.IO | 4.8.1 | Real-time WebSocket layer |
| Mongoose | 8.9.5 | MongoDB ODM |
| Zod | 4.3.6 | Request validation |
| JWT (jsonwebtoken) | 9.0.2 | Authentication tokens |
| Winston | 3.17.0 | Structured logging |
| Helmet | 8.0.0 | HTTP security headers |
| Multer | 1.4.5-lts.1 | Multipart file upload |
| Axios | 1.7.9 | FlowTask API client |
| DOMPurify + jsdom | 3.2.4 / 25.0.1 | HTML sanitization |
| node-cron | 3.0.3 | Scheduled jobs (deadline warnings) |
| express-rate-limit | 7.5.0 | API rate limiting |
| uuid | 11.0.5 | Unique ID generation |

### Client

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI framework |
| Vite | 5.4.10 | Build tool + dev server |
| Zustand | 5.0.11 | State management |
| React Router | 7.13.0 | Client-side routing |
| Tailwind CSS | 4.1.18 | Utility-first CSS |
| Socket.IO Client | 4.8.3 | WebSocket client |
| Axios | 1.13.5 | HTTP client |
| lucide-react | 0.564.0 | Icon library |
| date-fns | 4.1.0 | Date formatting |
| react-hot-toast | 2.6.0 | Toast notifications |

---

## 3. Server Architecture

### 3.1 Module Pattern

The server follows a **modular architecture** where each domain is a self-contained module:

```
server/modules/{domain}/
  ├── {Domain}.model.js      # Mongoose schema & model
  ├── {domain}.repository.js # Data access (queries)
  ├── {domain}.service.js    # Business logic
  ├── {domain}.controller.js # HTTP request handlers
  └── {domain}.routes.js     # Express route definitions
```

**Request flow:**

```
HTTP Request → Route → Middleware Chain → Controller → Service → Repository → MongoDB
                         │
                         ├── protect (JWT verification)
                         ├── authorize (role check)
                         ├── requireChannelAccess (membership)
                         ├── requireMessageAccess (ownership/membership)
                         ├── validate (Zod schema)
                         └── rateLimiter
```

### 3.2 Modules

| Module | Models | Description |
|---|---|---|
| **auth** | — | JWT verification, FlowTask user sync, RBAC middleware |
| **channels** | `Channel` | Channel CRUD, membership management, DM creation |
| **messages** | `Message`, `ChatUpload` | Message CRUD, reactions, pins, search, file upload |
| **threads** | `Thread` | Thread lifecycle, replies, task-linked threads |
| **users** | `ChatUser` | User profile cache (synced from FlowTask) |
| **readReceipts** | `ReadReceipt` | Per-channel read position tracking |
| **webhooks** | `ProcessedEvent` | Webhook receiver + event dispatch |
| **bot** | — | `/flowtask` command handler (tasks, status, log, projects, help) |
| **flowtask** | `ProcessedEvent` | FlowTask API client + circuit breaker |

### 3.3 Service Layer

Services encapsulate business logic and are the primary integration point:

- **messageService** — message sending (with DOMPurify sanitization), search (scoped by user channels), reactions, pins
- **channelService** — channel creation with slug generation, member sync, visibility enforcement
- **threadService** — thread creation linked to FlowTask tasks, auto-resolve on task completion
- **botService** — command parsing, FlowTask API calls via circuit breaker, response formatting
- **flowtaskService** — wrapped HTTP client to FlowTask with circuit breaker pattern

### 3.4 Cross-Cutting Services

| Service | File | Description |
|---|---|---|
| **Event Bus** | `services/eventBus.js` | Node.js EventEmitter for internal webhook → handler dispatch |
| **Event Processor** | `services/eventProcessor.js` | Deduplication via `ProcessedEvent` model, event routing |
| **Circuit Breaker** | `services/circuitBreaker.js` | Wraps FlowTask API calls; CLOSED → OPEN → HALF-OPEN states |
| **Bot Notifier** | `services/botNotifier.js` | Routes bot messages to #admin, #managers, #announcements channels |

### 3.5 Middleware Stack

Applied in order via `server/index.js`:

1. **Helmet** — security headers (CSP, HSTS, etc.)
2. **CORS** — configurable origins via `CORS_ORIGINS` env
3. **Compression** — gzip response compression
4. **Morgan** — HTTP request logging
5. **express.json** — body parsing (10kb limit)
6. **Rate Limiter** — per-IP request throttling
7. **Static files** — `/api/chat/uploads` serving uploaded files
8. **Route-level**: `protect` → `authorize` → `requireChannelAccess` / `requireMessageAccess` → `validate`

---

## 4. Client Architecture

### 4.1 Component Hierarchy

```
App.jsx
├── LoginPage.jsx
└── ChatLayout.jsx
    ├── Sidebar.jsx
    │   ├── ChannelSection (Channels, DMs)
    │   └── CreateChannelModal.jsx
    ├── ChatPanel.jsx
    │   ├── ChatHeader.jsx
    │   ├── MessageList.jsx
    │   │   └── MessageItem.jsx (reactions, threads, attachments)
    │   ├── MessageInput.jsx (formatting toolbar, file upload)
    │   └── TypingIndicator.jsx
    ├── ThreadPanel.jsx
    ├── ChannelInfoPanel.jsx
    │   └── MemberAvatarGroup.jsx
    └── SearchPanel.jsx
```

### 4.2 State Management (Zustand)

Three stores manage all client state:

| Store | File | Responsibilities |
|---|---|---|
| **authStore** | `stores/authStore.js` | Login, token management, user profile, FlowTask auth sync |
| **channelStore** | `stores/channelStore.js` | Channel list, active channel, members, create/update/archive, info panel toggle |
| **chatStore** | `stores/chatStore.js` | Messages by channel, send/edit/delete, reactions, typing indicators, presence, notifications, socket event listeners |

### 4.3 Services

| Service | File | Purpose |
|---|---|---|
| **api.js** | `services/api.js` | Axios instance with JWT interceptor; exports `authAPI`, `channelAPI`, `messageAPI`, `threadAPI`, `readReceiptAPI`, `botAPI` |
| **socket.js** | `services/socket.js` | Socket.IO client; `connectSocket()`, `disconnectSocket()`, `joinChannel()`, `leaveChannel()`, event helpers |

### 4.4 Routing

```
/           → LoginPage (unauthenticated)
/chat       → ChatLayout (protected, requires auth)
/chat/:slug → ChatLayout with channel pre-selected
```

### 4.5 Theming

Dark Slack-like theme via CSS custom properties in `index.css`:

```css
:root {
  --bg-primary: #1a1d21;
  --bg-secondary: #222529;
  --bg-hover: #2c2f33;
  --text-primary: #d1d2d3;
  --text-white: #f2f3f5;
  --text-muted: #8b8d91;
  --accent-primary: #1264a3;
  --accent-green: #2bac76;
  --accent-red: #e23d4b;
  /* ... */
}
```

---

## 5. Database Schema

### 5.1 Entity-Relationship Overview

```
ChatUser (1)──────(*)  Channel (membership via members[])
    │                     │
    │                     ├──(*)  Message
    │                     │         ├── attachments[]
    │                     │         ├── reactions[]
    │                     │         └── mentions[]
    │                     │
    │                     ├──(*)  Thread
    │                     │         └──(*)  Message (replies)
    │                     │
    │                     └──(*)  ReadReceipt
    │
    └── ChatUpload (uploaded files)

ProcessedEvent (webhook idempotency)
```

### 5.2 Models

#### ChatUser
Synced from FlowTask on `USER_VERIFIED` / `auth/sync`.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Same as FlowTask User._id |
| `flowTaskUserId` | String | FlowTask reference |
| `name` | String | Display name |
| `email` | String | Unique |
| `avatar` | String | Avatar URL |
| `role` | String | admin, manager, hr, employee, custom |
| `department` | [ObjectId] | Department references |
| `isActive` | Boolean | Account status |
| `onlineStatus` | String | online, away, dnd, offline |
| `lastSeen` | Date | Last activity timestamp |
| `preferences` | Object | theme, notifications, sounds |

#### Channel

| Field | Type | Notes |
|---|---|---|
| `name` | String | Display name (max 80) |
| `slug` | String | URL-safe unique identifier |
| `type` | String | project, department, team, dm, system |
| `visibility` | String | public, private |
| `topic` | String | Channel topic (max 250) |
| `description` | String | Long description (max 500) |
| `members` | [ObjectId] | Member user IDs |
| `admins` | [ObjectId] | Channel admin user IDs |
| `flowTaskProjectId` | String | Linked FlowTask board ID |
| `flowTaskDepartmentId` | String | Linked department ID |
| `flowTaskTeamId` | String | Linked team ID |
| `isArchived` | Boolean | Soft-delete flag |
| `pinnedMessages` | [ObjectId] | Pinned message refs |
| `lastMessage` | ObjectId | Latest message (for sidebar sorting) |
| `messageCount` | Number | Total messages |

#### Message

| Field | Type | Notes |
|---|---|---|
| `channelId` | ObjectId | Parent channel |
| `authorId` | ObjectId | Author (null for system messages) |
| `content` | String | Text content (max 4000, sanitized) |
| `contentType` | String | text, system, bot |
| `attachments` | [Attachment] | File attachments (max 10) |
| `reactions` | [Reaction] | Emoji reactions with user lists |
| `mentions` | [Mention] | @user, @role, @channel mentions |
| `threadId` | ObjectId | Parent thread (if reply) |
| `isPinned` | Boolean | Pin status |
| `isEdited` | Boolean | Edit flag |
| `replyCount` | Number | Thread reply count |
| `flowTaskEventId` | String | Source event reference |

#### Thread

| Field | Type | Notes |
|---|---|---|
| `channelId` | ObjectId | Parent channel |
| `rootMessageId` | ObjectId | First message |
| `title` | String | Thread title |
| `flowTaskTaskId` | String | Linked FlowTask card ID |
| `status` | String | active, resolved, locked |
| `participants` | [ObjectId] | Thread participants |
| `replyCount` | Number | Reply count |
| `lastReplyAt` | Date | Latest reply timestamp |

#### ReadReceipt

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId | Reader |
| `channelId` | ObjectId | Channel |
| `lastReadMessageId` | ObjectId | Last read message |
| `unreadCount` | Number | Cached unread count |

#### ProcessedEvent

| Field | Type | Notes |
|---|---|---|
| `deliveryId` | String | Webhook delivery UUID (unique) |
| `eventName` | String | e.g., PROJECT_CREATED |
| `status` | String | processing, completed, failed |
| `receivedAt` | Date | First receipt time |
| `processedAt` | Date | Completion time |
| `attempts` | Number | Processing attempts |

#### ChatUpload

| Field | Type | Notes |
|---|---|---|
| `channelId` | ObjectId | Upload context |
| `uploadedBy` | ObjectId | Uploader |
| `fileName` | String | Stored filename (UUID-based) |
| `originalName` | String | Original filename |
| `mimeType` | String | MIME type |
| `fileSize` | Number | Bytes |
| `url` | String | Serving URL |

---

## 6. Real-Time Communication

### 6.1 Socket.IO Server Setup

The Socket.IO server is initialized alongside Express in `sockets/socketManager.js`:

```
Server → initializeSocket(httpServer) → io instance
       → Connection middleware: JWT verification
       → On connect: auto-join user-{id} room
       → Event handlers registered per connection
```

### 6.2 Socket Events

#### Client → Server

| Event | Payload | Description |
|---|---|---|
| `channel:join` | `{ channelId }` | Join channel room (with membership check) |
| `channel:leave` | `{ channelId }` | Leave channel room |
| `typing:start` | `{ channelId }` | Broadcast typing indicator |
| `typing:stop` | `{ channelId }` | Clear typing indicator |
| `presence:update` | `{ status }` | Update online status |

#### Server → Client

| Event | Payload | Description |
|---|---|---|
| `message:new` | Message object | New message in joined channel |
| `message:updated` | `{ messageId, updates }` | Message edited |
| `message:deleted` | `{ messageId, channelId }` | Message removed |
| `reaction:added` | `{ messageId, reaction }` | Reaction added |
| `reaction:removed` | `{ messageId, emoji, userId }` | Reaction removed |
| `typing:update` | `{ channelId, userId, isTyping }` | Typing indicator |
| `presence:changed` | `{ userId, status }` | User status change |
| `channel:updated` | Channel object | Channel metadata changed |
| `member:joined` | `{ channelId, user }` | Member added to channel |
| `member:left` | `{ channelId, userId }` | Member removed |
| `thread:updated` | Thread object | Thread status change |

### 6.3 Room Topology

| Room | Members | Purpose |
|---|---|---|
| `user-{userId}` | Single user | Personal notifications, DM alerts |
| `channel-{channelId}` | Channel members | Message broadcast |
| `department-{deptId}` | Department members | Department-wide announcements |

---

## 7. Authentication & Authorization

### 7.1 Auth Flow

```
1. User logs in via FlowTask → receives JWT
2. Client calls POST /api/chat/auth/sync with JWT
3. Server verifies JWT, upserts ChatUser from FlowTask user data
4. Server returns chat-specific user profile
5. Client stores token in authStore, connects Socket.IO with auth
6. Socket middleware verifies JWT on connection
```

### 7.2 Middleware Chain

| Middleware | File | Purpose |
|---|---|---|
| `protect` | `auth.middleware.js` | Verifies JWT, attaches `req.user` |
| `authorize(...roles)` | `auth.middleware.js` | Role-based gate (admin, manager, etc.) |
| `requireChannelAccess` | `auth.middleware.js` | Verifies user is a member of the target channel (admin bypasses, public channels accessible) |
| `requireMessageAccess` | `auth.middleware.js` | Resolves message → channel, checks membership |
| `validate(schemas)` | `middleware/validate.js` | Zod schema validation for body/query/params |

### 7.3 Authorization Rules

- **Admins** bypass all channel membership checks
- **Public channels** (non-DM, visibility: public) are readable by all authenticated users
- **Private channels** require explicit membership
- **DM channels** require being one of the two participants
- **Message edit/delete** restricted to message author
- **Channel admin operations** require channel admin or system admin role

---

## 8. Webhook & Event Pipeline

### 8.1 Ingestion Flow

```
FlowTask POST → /api/chat/webhooks/flowtask
    │
    ├── webhookVerifier middleware (HMAC-SHA256 signature check)
    ├── Rate limiter (webhook-specific)
    │
    ▼
webhook.controller.js
    │
    ├── Extract event name from X-FlowTask-Event header
    ├── Extract deliveryId from X-FlowTask-Delivery-Id header
    │
    ▼
eventProcessor.processEvent(eventName, data, deliveryId)
    │
    ├── Check ProcessedEvent collection for idempotency
    ├── Create ProcessedEvent record (status: processing)
    │
    ▼
eventBus.emit(eventName, data)
    │
    ├── Registered handlers from registerHandlers.js
    │   ├── projectEventHandler   (5 events)
    │   ├── taskEventHandler      (7 events)
    │   ├── userEventHandler      (3 events)
    │   └── announcementEventHandler (1 event)
    │
    ▼
Handler creates channels/messages/threads, emits Socket.IO events
    │
    ▼
ProcessedEvent updated (status: completed)
```

### 8.2 Handler Registration

`server/modules/webhooks/registerHandlers.js` wires event names to handler functions:

```javascript
// Each handler listens to specific FLOWTASK_EVENTS constants
eventBus.on('PROJECT_CREATED', projectEventHandler.handleProjectCreated)
eventBus.on('TASK_STATUS_CHANGED', taskEventHandler.handleTaskStatusChanged)
// ... etc for all 15 events
```

### 8.3 Idempotency

The `ProcessedEvent` model prevents duplicate processing:
- Keyed by `deliveryId` (UUID from webhook header)
- Status transitions: `processing` → `completed` / `failed`
- Events older than 7 days are eligible for cleanup

---

## 9. File Upload System

### 9.1 Upload Flow

```
1. User clicks paperclip icon in MessageInput
2. File(s) selected via browser file picker
3. Client sends POST /api/chat/channels/:channelId/upload (multipart/form-data)
4. Multer middleware:
   - Validates MIME type against whitelist
   - Stores file with UUID filename in UPLOAD_DIR
   - Enforces 10MB limit, max 10 files
5. Controller creates ChatUpload documents
6. Returns file metadata (url, originalName, mimeType, fileSize)
7. Client attaches file references to message payload
8. Message sent with attachments[] array
```

### 9.2 Middleware

`server/middleware/upload.js` exports:
- `uploadFiles` — `multer.array('files', 10)` for multi-file upload
- `uploadSingle` — `multer.single('file')` for single file
- `handleMulterError` — error middleware for file size/type validation

### 9.3 Client Rendering

In `MessageItem.jsx`:
- **Images**: Rendered as inline thumbnails with click-to-open in new tab
- **Documents/Archives**: Rendered as file cards with icon, name, size, and download link
- **Pending uploads**: Shown as chips in `MessageInput.jsx` with remove buttons

---

## 10. Bot System

### 10.1 Command Processing

```
User types /flowtask <command> in message input
    │
    ▼
chatStore.sendMessage detects /flowtask prefix
    │
    ▼
botAPI.command(fullCommand, channelId)
    │
    ▼
bot.controller.js → bot.service.js
    │
    ├── Parse command and arguments
    ├── Call FlowTask API via circuit breaker
    ├── Format response
    │
    ▼
Return bot response as system message
```

### 10.2 Available Commands

| Command | FlowTask API Call | Response |
|---|---|---|
| `/flowtask tasks` | `GET /api/cards/board/:boardId` | List of assigned tasks with status |
| `/flowtask status <taskId>` | `GET /api/cards/:id` | Task details (assignees, priority, dates) |
| `/flowtask log <taskId> <time>` | `POST /api/cards/:id/time-tracking` | Confirmation of logged time |
| `/flowtask projects` | `GET /api/boards` | User's project list |
| `/flowtask help` | — | Command reference |

### 10.3 Bot Notification Routing

`server/services/botNotifier.js` posts automated messages to system channels:

- **`notifyAdmins(content)`** → posts to `#flowtask-admin` channel
- **`notifyManagers(content)`** → posts to `#flowtask-managers` channel
- **`notifyAnnouncements(content)`** → posts to `#flowtask-announcements` channel
- Composite methods: `onProjectCreated`, `onUserVerified`, `onAnnouncementCreated`

---

## 11. Security Measures

### 11.1 HTTP Security

| Measure | Implementation |
|---|---|
| Security headers | Helmet middleware (CSP, HSTS, X-Content-Type-Options, etc.) |
| CORS | Configurable `CORS_ORIGINS` with credentials support |
| Rate limiting | express-rate-limit per IP |
| Request validation | Zod schemas on all mutation endpoints |
| Body size limit | 10KB JSON body limit |
| Input sanitization | DOMPurify on all message content |

### 11.2 WebSocket Security

| Measure | Implementation |
|---|---|
| Connection auth | JWT verified in Socket.IO handshake middleware |
| Room access | Membership verification on `channel:join` |
| Admin bypass | Admin role can join any channel room |
| Connection cleanup | Rooms cleared on disconnect |

### 11.3 Webhook Security

| Measure | Implementation |
|---|---|
| HMAC verification | SHA-256 signature check on every webhook payload |
| Timestamp validation | Reject events with stale timestamps (replay protection) |
| Idempotency | Deduplicate by delivery ID via ProcessedEvent collection |
| Rate limiting | Separate rate limit for webhook endpoint |

### 11.4 Data Security

| Measure | Implementation |
|---|---|
| HTML sanitization | DOMPurify strips unsafe HTML from all message content |
| File type validation | MIME type whitelist for uploads |
| File size limit | 10MB per file, configurable via MAX_FILE_SIZE |
| UUID filenames | Prevent path traversal via random filenames |
| Channel access scoping | Message search filtered by user's accessible channels |

---

## 12. Directory Structure

```
ChatApp/
├── FLOWTASK_CHAT_INTEGRATION.md    # Integration specification
├── ARCHITECTURE.md                  # This document
├── package.json                     # Root workspace config
├── README.md
│
├── client/                          # React SPA
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js               # Dev server port 5174, proxy to :3200
│   ├── public/
│   └── src/
│       ├── App.jsx                  # Router setup
│       ├── main.jsx                 # React entry point
│       ├── index.css                # Global styles + CSS custom properties
│       ├── components/
│       │   ├── chat/
│       │   │   ├── ChatHeader.jsx          # Channel header with search toggle
│       │   │   ├── ChatPanel.jsx           # Main chat area container
│       │   │   ├── ChannelInfoPanel.jsx    # Side panel with channel details
│       │   │   ├── CreateChannelModal.jsx  # Channel creation form
│       │   │   ├── MemberAvatarGroup.jsx   # Avatar stack component
│       │   │   ├── MessageInput.jsx        # Rich input with formatting + upload
│       │   │   ├── MessageItem.jsx         # Message display with attachments
│       │   │   ├── MessageList.jsx         # Virtualized message feed
│       │   │   ├── SearchPanel.jsx         # Message search side panel
│       │   │   ├── ThreadPanel.jsx         # Thread discussion panel
│       │   │   └── TypingIndicator.jsx     # Typing dots display
│       │   └── layout/
│       │       ├── ChatLayout.jsx          # Main layout orchestrator
│       │       └── Sidebar.jsx             # Channel navigation sidebar
│       ├── pages/
│       │   └── LoginPage.jsx               # FlowTask SSO login
│       ├── services/
│       │   ├── api.js                      # Axios HTTP client
│       │   └── socket.js                   # Socket.IO client
│       └── stores/
│           ├── authStore.js                # Auth state (Zustand)
│           ├── channelStore.js             # Channel state (Zustand)
│           └── chatStore.js                # Message state (Zustand)
│
└── server/                          # Express + Socket.IO backend
    ├── index.js                     # App entry, middleware, routes, startup
    ├── package.json
    ├── config/
    │   ├── constants.js             # App constants, event names, limits
    │   ├── database.js              # MongoDB connection
    │   └── environment.js           # Env validation + defaults
    ├── middleware/
    │   ├── asyncHandler.js          # Async error wrapper
    │   ├── errorHandler.js          # Global error response formatter
    │   ├── rateLimiter.js           # Rate limit config
    │   ├── schemas.js               # Zod validation schemas
    │   ├── upload.js                # Multer file upload config
    │   ├── validate.js              # Zod validation middleware
    │   └── webhookVerifier.js       # HMAC signature verification
    ├── modules/
    │   ├── auth/                    # JWT auth, RBAC, access middleware
    │   ├── bot/                     # /flowtask command handler
    │   ├── channels/                # Channel CRUD + membership
    │   ├── flowtask/                # FlowTask API client + ProcessedEvent
    │   ├── messages/                # Messages, reactions, pins, upload
    │   ├── readReceipts/            # Read position tracking
    │   ├── threads/                 # Threaded discussions
    │   ├── users/                   # ChatUser model + repository
    │   └── webhooks/                # Webhook receiver + event handlers
    │       ├── registerHandlers.js
    │       ├── webhook.controller.js
    │       ├── webhook.routes.js
    │       └── handlers/
    │           ├── announcementEventHandler.js
    │           ├── projectEventHandler.js
    │           ├── taskEventHandler.js
    │           └── userEventHandler.js
    ├── services/
    │   ├── botNotifier.js           # Admin/manager notification routing
    │   ├── circuitBreaker.js        # Circuit breaker for FlowTask API
    │   ├── eventBus.js              # Internal EventEmitter dispatcher
    │   └── eventProcessor.js        # Idempotent event processing
    ├── sockets/
    │   └── socketManager.js         # Socket.IO init, rooms, auth
    └── utils/
        ├── hmac.js                  # HMAC-SHA256 helpers
        ├── logger.js                # Winston logger config
        ├── pagination.js            # Cursor/offset pagination helpers
        ├── sanitize.js              # DOMPurify wrapper
        └── slugify.js               # Channel slug generation
```

---

## 13. Configuration & Environment

### Required Environment Variables

| Variable | Description | Example |
|---|---|---|
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://...` |
| `JWT_SECRET` | JWT signing secret | `super-secret-key` |
| `FLOWTASK_API_URL` | FlowTask backend URL | `https://proofhub-trello-replica.onrender.com` |
| `FLOWTASK_WEBHOOK_SECRET` | HMAC shared secret for webhooks | `webhook-secret` |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | `http://localhost:5174` |

### Optional Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3200` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `UPLOAD_DIR` | `./uploads` | File upload directory |
| `MAX_FILE_SIZE` | `10485760` | Max upload size in bytes (10MB) |
| `LOG_LEVEL` | `info` | Winston log level |

---

## 14. Deployment

### Development

```bash
# Server (port 3200)
cd server
npm install
npm run dev          # node --watch index.js

# Client (port 5174, proxy to :3200)
cd client
npm install
npm run dev          # vite dev server
```

### Production

```bash
# Build client
cd client
npm run build        # outputs to dist/

# Start server
cd server
NODE_ENV=production npm start
```

### Environment Setup

1. Copy environment template and fill in values
2. Ensure MongoDB is accessible
3. Ensure FlowTask API is reachable at `FLOWTASK_API_URL`
4. Create `uploads/` directory (or set `UPLOAD_DIR`)
5. Start server, then client

---

> **Note:** This document should be updated whenever architectural changes are made. For integration-specific details, see [FLOWTASK_CHAT_INTEGRATION.md](FLOWTASK_CHAT_INTEGRATION.md).
