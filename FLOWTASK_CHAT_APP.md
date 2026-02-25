# FlowTask Chat — Enterprise Chat Application

> **Version:** 2.0.0
> **Date:** 2026-02-25
> **Classification:** Internal — Architecture & Product Specification
> **Audience:** Developers, Architects, Stakeholders, DevOps Engineers
> **Status:** Production-Ready Design

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [System Architecture](#2-system-architecture)
3. [High-Level Flow Diagram](#3-high-level-flow-diagram)
4. [Integration Strategy — Webhook Design](#4-integration-strategy--webhook-design)
5. [Data Models](#5-data-models)
6. [Real-Time Event Flow](#6-real-time-event-flow)
7. [Role & Permission Handling](#7-role--permission-handling)
8. [Chat Bot Architecture](#8-chat-bot-architecture)
9. [Repository Folder Structure](#9-repository-folder-structure)
10. [API Design Overview](#10-api-design-overview)
11. [WebSocket Event Design](#11-websocket-event-design)
12. [Security & Production Practices](#12-security--production-practices)
13. [Scalability Strategy](#13-scalability-strategy)
14. [Deployment Architecture](#14-deployment-architecture)
15. [Future Expansion Capabilities](#15-future-expansion-capabilities)

---

## 1. Product Vision

### 1.1 Mission Statement

FlowTask Chat is an **enterprise-grade, standalone real-time communication platform** designed for organizations that use the FlowTask project management system. It delivers Slack-level messaging capabilities while automatically synchronizing project context from FlowTask via event-driven webhooks — ensuring teams always communicate within the right context, with the right people, at the right time.

### 1.2 Core Principles

| Principle | Description |
|---|---|
| **Independence** | Runs as a fully standalone product. Zero runtime dependency on FlowTask. If FlowTask goes offline, chat continues operating normally. |
| **Event-Driven Integration** | All data synchronization occurs through webhooks (inbound) and read-only API calls (outbound). Chat never writes to FlowTask's database. |
| **Real-Time First** | Every interaction — messages, reactions, typing indicators, presence, channel updates — is delivered in real-time via WebSocket. |
| **Enterprise Security** | JWT authentication, HMAC webhook verification, role-based access control, input sanitization, rate limiting, and SSO-ready architecture. |
| **Single Source of Truth** | FlowTask owns projects, tasks, and users. Chat owns messages, threads, reactions, and uploads. No data duplication conflicts. |

### 1.3 Target Scale

- **10,000+ concurrent users**
- **100+ departments / 500+ projects**
- **1M+ messages per month**
- **99.9% uptime SLA target**

### 1.4 Competitive Positioning

| Feature | Slack | MS Teams | FlowTask Chat |
|---|---|---|---|
| Project-aware channels | ❌ Manual | ❌ Manual | ✅ Auto-created from FlowTask |
| Task activity feeds | ❌ Via integration | ❌ Via integration | ✅ Native system messages |
| Role-synced permissions | ❌ Separate | ❌ Separate | ✅ Synced from FlowTask |
| Standalone operation | ✅ | ✅ | ✅ |
| Bot with project context | ❌ Generic bots | ❌ Generic bots | ✅ FlowTask Bot with task commands |

---

## 2. System Architecture

### 2.1 Architecture Overview

FlowTask Chat follows a **modular monolith** server architecture that is **microservice-ready** — each domain module (auth, channels, messages, threads, webhooks, bot) is self-contained with its own model, repository, service, controller, and routes. This allows extraction into independent services when scaling demands it.

### 2.2 Technology Stack

#### Frontend

| Technology | Purpose |
|---|---|
| **React 18+** | UI framework with enterprise component structure |
| **Vite 5** | Build tooling and development server |
| **Zustand** | Lightweight state management (auth, channels, chat stores) |
| **React Router 7** | Client-side routing with protected routes |
| **Socket.IO Client** | WebSocket transport for real-time events |
| **Axios** | HTTP client with JWT interceptor |
| **TailwindCSS v4** | Utility-first CSS with dark enterprise theme |
| **lucide-react** | Icon library |
| **date-fns** | Date formatting and manipulation |
| **react-hot-toast** | Toast notification system |

#### Backend

| Technology | Purpose |
|---|---|
| **Node.js 18+ (ES Modules)** | Runtime environment |
| **Express 4** | HTTP framework with modular routing |
| **Socket.IO 4** | WebSocket server for bidirectional real-time communication |
| **Mongoose 8** | MongoDB ODM with schema validation |
| **Zod** | Runtime request validation schemas |
| **jsonwebtoken** | JWT authentication (shared secret with FlowTask) |
| **Winston** | Structured logging with log levels |
| **Helmet** | HTTP security headers (CSP, HSTS, etc.) |
| **Multer** | Multipart file upload handling |
| **Axios** | FlowTask API client (read-only outbound calls) |
| **DOMPurify + jsdom** | HTML/XSS sanitization for message content |
| **node-cron** | Scheduled jobs (deadline warnings, cleanup) |
| **express-rate-limit** | Per-IP and per-endpoint rate limiting |

#### Infrastructure

| Component | Technology |
|---|---|
| **Database** | MongoDB Atlas (dedicated cluster for chat) |
| **File Storage** | Local disk (production: cloud storage ready) |
| **Hosting** | Render / AWS / GCP (containerized) |
| **Monitoring** | Winston logs + health endpoints |

### 2.3 Data Ownership Boundary

| FlowTask Owns | Chat Owns |
|---|---|
| Projects (Boards), Tasks (Cards), Users | Messages, Threads, Reactions |
| Departments, Roles, Teams | Read Receipts, Chat Uploads |
| Attachments, Announcements, Comments | Channel Membership, User Preferences |
| Sales Data, Labels, Lists | Pinned Messages, Typing State |

> **CRITICAL RULE:** Chat **NEVER** modifies FlowTask data directly. All integration is inbound (webhooks) or read-only outbound (API queries).

---

## 3. High-Level Flow Diagram

### 3.1 System Flow (Text Diagram)

```
┌─────────────────────────────────────────────────────────────┐
│                    REACT SPA (Vite)                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Zustand   │  │ Socket.IO    │  │ Axios HTTP Client     │ │
│  │ Stores    │  │ Client       │  │ (JWT Interceptor)     │ │
│  └─────┬────┘  └──────┬───────┘  └──────────┬────────────┘ │
└────────│───────────────│────────────────────│───────────────┘
         │               │                    │
         │    WebSocket  │    HTTP REST       │
         │               │                    │
┌────────▼───────────────▼────────────────────▼───────────────┐
│               EXPRESS + SOCKET.IO SERVER                     │
│                                                              │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐         │
│  │  Auth  │ │ Channels │ │ Messages │ │ Threads │         │
│  │ Module │ │  Module  │ │  Module  │ │  Module │         │
│  └───┬────┘ └────┬─────┘ └────┬─────┘ └────┬───┘         │
│      │           │            │             │              │
│  ┌───▼───────────▼────────────▼─────────────▼────┐        │
│  │        Repository Layer (Mongoose ODM)         │        │
│  └───────────────────┬───────────────────────────┘        │
│                      │                                     │
│  ┌───────────────────▼───────────────────────────┐        │
│  │           MongoDB (Atlas / Local)              │        │
│  └───────────────────────────────────────────────┘        │
│                                                            │
│  ┌────────────┐  ┌───────────────┐  ┌──────────────┐     │
│  │  Webhook   │  │  Event Bus    │  │  Bot Service  │     │
│  │  Receiver  │──│ (EventEmitter)│──│  + Notifier   │     │
│  └────────────┘  └───────────────┘  └──────────────┘     │
└────────────────────────▲─────────────────────────────────┘
                         │ Webhooks (HMAC-SHA256 Signed)
                         │
┌────────────────────────┴─────────────────────────────────┐
│              FLOWTASK BACKEND (External)                   │
│      https://flowtask-x3z4.onrender.com                    │
│                                                            │
│  Projects │ Tasks │ Users │ Departments │ Sales │ Teams    │
└────────────────────────────────────────────────────────────┘
```

### 3.2 User Authentication Flow

```
1. User logs into FlowTask → receives JWT token
2. User opens Chat App → client calls POST /api/chat/auth/sync with JWT
3. Chat server verifies JWT (shared secret) → upserts ChatUser record
4. Server returns chat-specific user profile + role
5. Client stores token in Zustand authStore
6. Client establishes Socket.IO connection with JWT in handshake
7. Socket middleware verifies JWT → assigns user to personal room (user-{id})
8. User is now fully authenticated in Chat with synced role/permissions
```

### 3.3 Message Lifecycle

```
1. User types message in MessageInput component
2. Client sends POST /api/chat/channels/:channelId/messages
3. Server sanitizes content (DOMPurify), validates via Zod schema
4. Message saved to MongoDB with channelId, authorId, content, attachments
5. Server emits Socket.IO event "message:new" to channel room
6. All connected members receive message in real-time
7. Read receipts updated for sender, unread counts incremented for others
8. Channel's lastMessage and messageCount updated
```

---

## 4. Integration Strategy — Webhook Design

### 4.1 Overview

FlowTask sends **HMAC-SHA256 signed webhook events** to Chat whenever a relevant domain event occurs. Chat processes these events **idempotently** using the `ProcessedEvent` model to prevent duplicate handling.

### 4.2 Webhook Endpoint

```
POST /api/chat/webhooks/flowtask

Headers:
  X-FlowTask-Event: <EVENT_NAME>
  X-FlowTask-Delivery-Id: <UUID>
  X-FlowTask-Signature: sha256=<HMAC_HASH>
  X-FlowTask-Timestamp: <UNIX_TIMESTAMP>
  Content-Type: application/json
```

### 4.3 Event Catalog (15 Events)

#### Project Events (5)

| Event | Trigger | Chat Action |
|---|---|---|
| `PROJECT_CREATED` | New project (board) created with ≥1 member | Create project channel with same name, add all project members |
| `PROJECT_UPDATED` | Project name, description, or status changed | Update channel name/topic to match, broadcast system message |
| `PROJECT_DELETED` | Project permanently deleted | Archive project channel, send system notification |
| `PROJECT_MEMBER_ADDED` | Member added to project | Add user to project channel, send "joined" system message |
| `PROJECT_MEMBER_REMOVED` | Member removed from project | Remove user from channel, send "left" system message. If 0 members remain → archive channel |

#### Task Events (7)

| Event | Trigger | Chat Action |
|---|---|---|
| `TASK_CREATED` | New task (card) created | Post system activity message in project channel |
| `TASK_STATUS_CHANGED` | Task status updated (e.g., planning → in-progress) | Post status change activity message with old/new status |
| `TASK_DELETED` | Task removed | Post deletion activity message |
| `TASK_ASSIGNED` | Member assigned to task | Post assignment activity message, notify assigned user |
| `TASK_COMMENT_ADDED` | Comment added to task | Post comment activity summary in project channel |
| `TASK_DUE_DATE_CHANGED` | Due date modified | Post due date change activity message |
| `TASK_TIME_LOGGED` | Time tracking entry added | Post summary-only activity message (not individual entries) |

#### User Events (2)

| Event | Trigger | Chat Action |
|---|---|---|
| `USER_VERIFIED` | New user email verified | Sync user to ChatUser model, notify admins via FlowTask Bot |
| `USER_UPDATED` | User profile/role/department changed | Update ChatUser record, re-evaluate channel memberships |

#### Announcement Events (1)

| Event | Trigger | Chat Action |
|---|---|---|
| `ANNOUNCEMENT_CREATED` | New announcement published | Post to #flowtask-announcements channel, notify relevant roles |

### 4.4 Webhook Processing Pipeline

```
FlowTask POST → /api/chat/webhooks/flowtask
    │
    ├── webhookVerifier middleware
    │   ├── Extract signature from X-FlowTask-Signature header
    │   ├── Compute HMAC-SHA256 of raw body with shared secret
    │   ├── Timing-safe comparison of signatures
    │   ├── Validate timestamp freshness (reject > 5 min stale)
    │   └── REJECT 401 if invalid
    │
    ├── Rate limiter (webhook-specific: 100 req/min)
    │
    ▼
webhook.controller.js
    │
    ├── Extract eventName from X-FlowTask-Event header
    ├── Extract deliveryId from X-FlowTask-Delivery-Id header
    │
    ▼
eventProcessor.processEvent(eventName, data, deliveryId)
    │
    ├── Query ProcessedEvent collection for existing deliveryId
    │   ├── If found with status "completed" → return (idempotent skip)
    │   └── If not found → create record with status "processing"
    │
    ▼
eventBus.emit(eventName, data)
    │
    ├── projectEventHandler  (5 events)
    ├── taskEventHandler     (7 events)
    ├── userEventHandler     (2 events)
    └── announcementEventHandler (1 event)
    │
    ▼
Handler creates channels/messages/threads → emits Socket.IO events
    │
    ▼
ProcessedEvent updated → status: "completed", processedAt: now
```

### 4.5 Channel Auto-Management Rules

| Rule | Condition | Action |
|---|---|---|
| **Auto-Create** | Project created in FlowTask with ≥1 assigned member | Create channel with `type: "project"`, name = project title, members = project members |
| **Name Sync** | Project title changed in FlowTask | Update channel name and slug to match new title |
| **Member Sync** | Members added/removed from FlowTask project | Add/remove members from corresponding channel in real-time |
| **Auto-Archive (No Members)** | All members removed from project | Archive channel (`isArchived: true`) |
| **Auto-Archive (Deleted)** | Project deleted in FlowTask | Archive channel, post system farewell message |
| **Admin Delete** | Admin or Manager manually deletes channel | Archive channel with audit log entry |
| **Existing Sync** | Chat server starts / sync endpoint called | Query FlowTask API for all active projects, reconcile channels |

### 4.6 Idempotency Guarantees

- Every webhook carries a unique `X-FlowTask-Delivery-Id` (UUID)
- The `ProcessedEvent` model stores delivery IDs with status tracking
- Duplicate deliveries are silently skipped (HTTP 200 returned)
- Events older than 7 days are eligible for TTL cleanup
- Status transitions: `processing` → `completed` | `failed`
- Failed events can be retried with the same delivery ID

---

## 5. Data Models

### 5.1 Entity-Relationship Diagram

```
ChatUser (1)──────────(*)  Channel (membership via members[])
    │                          │
    │                          ├──(*)  Message
    │                          │         ├── attachments[]  (embedded)
    │                          │         ├── reactions[]     (embedded)
    │                          │         └── mentions[]      (embedded)
    │                          │
    │                          ├──(*)  Thread
    │                          │         └──(*)  Message (thread replies)
    │                          │
    │                          └──(*)  ReadReceipt
    │
    └── ChatUpload (uploaded files)

ProcessedEvent (webhook idempotency — standalone)
ActivityMessage (system messages — extends Message with metadata)
```

### 5.2 ChatUser Model

Synced from FlowTask on `USER_VERIFIED` webhook or `POST /api/chat/auth/sync`.

| Field | Type | Constraints | Description |
|---|---|---|---|
| `_id` | ObjectId | Primary key | Same as FlowTask User._id |
| `flowTaskUserId` | String | Required, Indexed | FlowTask reference ID |
| `name` | String | Required, Max 50 | Display name |
| `email` | String | Required, Unique | User email address |
| `avatar` | String | Optional | Avatar URL (from FlowTask) |
| `role` | String | Enum | `admin`, `manager`, `hr`, `employee`, `custom` |
| `department` | [ObjectId] | Ref: Department | Department references (synced from FlowTask) |
| `team` | ObjectId | Ref: Team | Team reference |
| `title` | String | Max 100 | Job title |
| `isActive` | Boolean | Default: true | Account status |
| `onlineStatus` | String | Enum | `online`, `away`, `dnd`, `offline` |
| `lastSeen` | Date | Auto-updated | Last activity timestamp |
| `preferences` | Object | Embedded | `{ theme, notifications, sounds }` |
| `createdAt` | Date | Auto | Account creation |
| `updatedAt` | Date | Auto | Last profile update |

### 5.3 Channel Model

| Field | Type | Constraints | Description |
|---|---|---|---|
| `_id` | ObjectId | Primary key | Auto-generated |
| `name` | String | Required, Max 80 | Display name |
| `slug` | String | Unique, Indexed | URL-safe identifier (auto-generated) |
| `type` | String | Enum | `project`, `department`, `team`, `dm`, `system`, `custom` |
| `visibility` | String | Enum | `public`, `private` |
| `topic` | String | Max 250 | Channel topic / description |
| `description` | String | Max 500 | Detailed description |
| `members` | [ObjectId] | Ref: ChatUser | Member user IDs |
| `admins` | [ObjectId] | Ref: ChatUser | Channel admin user IDs |
| `createdBy` | ObjectId | Ref: ChatUser | Channel creator |
| `flowTaskProjectId` | String | Indexed | Linked FlowTask Board ID |
| `flowTaskDepartmentId` | String | Indexed | Linked Department ID |
| `flowTaskTeamId` | String | Indexed | Linked Team ID |
| `isArchived` | Boolean | Default: false | Soft-delete / archive flag |
| `pinnedMessages` | [ObjectId] | Ref: Message | Pinned message references |
| `lastMessage` | ObjectId | Ref: Message | Latest message (sidebar sorting) |
| `messageCount` | Number | Default: 0 | Total messages in channel |
| `createdAt` | Date | Auto | Channel creation time |

### 5.4 Message Model

| Field | Type | Constraints | Description |
|---|---|---|---|
| `_id` | ObjectId | Primary key | Auto-generated |
| `channelId` | ObjectId | Required, Indexed | Parent channel |
| `authorId` | ObjectId | Nullable | Author (null for system messages) |
| `content` | String | Max 4000, Sanitized | Message text content |
| `contentType` | String | Enum | `text`, `system`, `bot`, `activity` |
| `attachments` | [Attachment] | Max 10 | Embedded file attachment objects |
| `reactions` | [Reaction] | Embedded | Emoji reactions with user lists |
| `mentions` | [Mention] | Embedded | @user, @role, @channel mentions |
| `threadId` | ObjectId | Ref: Thread | Parent thread (if thread reply) |
| `replyTo` | ObjectId | Ref: Message | Quoted / replied message reference |
| `isPinned` | Boolean | Default: false | Pin status |
| `isEdited` | Boolean | Default: false | Edit flag |
| `replyCount` | Number | Default: 0 | Thread reply count |
| `flowTaskEventId` | String | Optional | Source webhook event reference |
| `activityMeta` | Object | Optional | `{ eventType, taskId, projectId, oldValue, newValue }` |
| `createdAt` | Date | Auto | Send time |
| `updatedAt` | Date | Auto | Last edit time |

#### Attachment Sub-Schema

| Field | Type | Description |
|---|---|---|
| `fileId` | ObjectId | Reference to ChatUpload |
| `fileName` | String | Display filename |
| `originalName` | String | Original upload filename |
| `mimeType` | String | MIME type |
| `fileSize` | Number | Size in bytes |
| `url` | String | Download/preview URL |
| `thumbnailUrl` | String | Preview thumbnail (images/videos) |
| `fileType` | String | `image`, `video`, `audio`, `document`, `file` |

#### Reaction Sub-Schema

| Field | Type | Description |
|---|---|---|
| `emoji` | String | Emoji character or shortcode |
| `users` | [ObjectId] | List of users who reacted |
| `count` | Number | Total reaction count |

### 5.5 Thread Model

| Field | Type | Description |
|---|---|---|
| `channelId` | ObjectId | Parent channel |
| `rootMessageId` | ObjectId | First message that started the thread |
| `title` | String | Thread title (auto or manual) |
| `flowTaskTaskId` | String | Linked FlowTask card ID (optional) |
| `status` | String | `active`, `resolved`, `locked` |
| `participants` | [ObjectId] | Thread participants |
| `replyCount` | Number | Total replies |
| `lastReplyAt` | Date | Latest reply timestamp |

### 5.6 Activity Message Model (System Messages)

Activity messages use the standard `Message` model with `contentType: "activity"` and additional `activityMeta`:

| Activity Event | System Message Format | UI Style |
|---|---|---|
| Task Created | `📋 {user} created task "{taskName}"` | System badge — muted, indented, icon-left |
| Task Status Changed | `🔄 {user} changed "{taskName}" from {old} → {new}` | Status pill with color |
| Task Deleted | `🗑️ {user} deleted task "{taskName}"` | Muted red text |
| Member Assigned | `👤 {user} assigned {assignee} to "{taskName}"` | Avatar inline |
| Comment Added | `💬 {user} commented on "{taskName}"` | Italic, link to task |
| Due Date Changed | `📅 {user} changed due date of "{taskName}" to {date}` | Calendar icon |
| Time Logged | `⏱️ {user} logged {duration} on "{taskName}"` | Summary only, no individual entries |

> **UI Differentiation:** Activity messages render with a distinct visual style — lighter background, smaller font, left-aligned icon, no avatar bubble, and a thin left-border accent in the channel's theme color.

### 5.7 Supporting Models

#### ReadReceipt

| Field | Type | Description |
|---|---|---|
| `userId` | ObjectId | Reader |
| `channelId` | ObjectId | Channel |
| `lastReadMessageId` | ObjectId | Last read message |
| `unreadCount` | Number | Cached unread count |

#### ProcessedEvent

| Field | Type | Description |
|---|---|---|
| `deliveryId` | String | Unique webhook delivery UUID |
| `eventName` | String | e.g., `PROJECT_CREATED` |
| `status` | String | `processing`, `completed`, `failed` |
| `payload` | Object | Original webhook payload (for retry) |
| `receivedAt` | Date | First receipt time |
| `processedAt` | Date | Completion time |
| `attempts` | Number | Processing attempts |
| `error` | String | Error message if failed |

#### ChatUpload

| Field | Type | Description |
|---|---|---|
| `channelId` | ObjectId | Upload context |
| `uploadedBy` | ObjectId | Uploader |
| `fileName` | String | Stored filename (UUID-based) |
| `originalName` | String | Original filename |
| `mimeType` | String | MIME type |
| `fileSize` | Number | Bytes |
| `url` | String | Serving URL |
| `fileType` | String | Categorized type |

---

## 6. Real-Time Event Flow

### 6.1 Socket.IO Architecture

```
Client connects → JWT verified in handshake middleware
    │
    ├── Auto-join room: user-{userId} (personal notifications)
    ├── Fetch user's channels → auto-join rooms: channel-{id} for each
    │
    ▼
Bidirectional event flow established
```

### 6.2 Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `channel:join` | `{ channelId }` | Join channel room (membership verified server-side) |
| `channel:leave` | `{ channelId }` | Leave channel room |
| `typing:start` | `{ channelId }` | Broadcast typing indicator to channel |
| `typing:stop` | `{ channelId }` | Clear typing indicator |
| `presence:update` | `{ status }` | Update online status (`online`, `away`, `dnd`) |
| `message:read` | `{ channelId, messageId }` | Mark message as read |

### 6.3 Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `message:new` | Full Message object | New message in joined channel |
| `message:updated` | `{ messageId, updates }` | Message edited |
| `message:deleted` | `{ messageId, channelId }` | Message removed |
| `reaction:added` | `{ messageId, reaction }` | Reaction added to message |
| `reaction:removed` | `{ messageId, emoji, userId }` | Reaction removed |
| `typing:update` | `{ channelId, userId, userName, isTyping }` | Typing indicator |
| `presence:changed` | `{ userId, status, lastSeen }` | User presence change |
| `channel:created` | Full Channel object | New channel (from webhook or manual) |
| `channel:updated` | Channel object with changes | Channel metadata changed |
| `channel:archived` | `{ channelId }` | Channel archived |
| `member:joined` | `{ channelId, user }` | Member added to channel |
| `member:left` | `{ channelId, userId }` | Member removed from channel |
| `thread:created` | Full Thread object | New thread started |
| `thread:updated` | Thread object | Thread status change |
| `unread:update` | `{ channelId, unreadCount }` | Unread count changed |
| `bot:message` | Message object | FlowTask Bot notification |

### 6.4 Room Topology

| Room Pattern | Members | Purpose |
|---|---|---|
| `user-{userId}` | Single user (all tabs) | DM alerts, personal notifications, bot messages |
| `channel-{channelId}` | Channel members online | Message broadcast, typing, reactions |
| `department-{deptId}` | Department members | Department-wide announcements |

---

## 7. Role & Permission Handling

### 7.1 Role Hierarchy (Synced from FlowTask)

```
Admin (Full Access)
  └── Manager (Department Scoped)
       └── HR (People Management)
            └── Employee (Standard Access)
                 └── Custom (Configurable via FlowTask Role model)
```

### 7.2 Permission Matrix

| Action | Admin | Manager | HR | Employee |
|---|---|---|---|---|
| View all channels | ✅ | Department only | ✅ | Joined only |
| Create custom channels | ✅ | ✅ | ✅ | ✅ |
| Delete any channel | ✅ | Department only | ❌ | ❌ |
| Archive project channels | ✅ | Own projects | ❌ | ❌ |
| Send messages | ✅ | ✅ | ✅ | ✅ |
| Delete any message | ✅ | Department channels | ❌ | Own only |
| Edit messages | Own only | Own only | Own only | Own only |
| Pin / unpin messages | ✅ | ✅ | ✅ | Channel admins |
| Add / remove members | ✅ | ✅ | ❌ | Channel admins |
| View FlowTask Bot | ✅ | ✅ | ❌ | ❌ |
| Use bot commands | ✅ | ✅ | ❌ | ❌ |
| Upload files | ✅ | ✅ | ✅ | ✅ |
| Search messages | ✅ All | Department scoped | ✅ All | Joined channels |

### 7.3 Authorization Middleware Chain

```
HTTP Request
    │
    ├── protect middleware
    │   └── Verify JWT → attach req.user (id, role, department)
    │
    ├── authorize(...allowedRoles) middleware
    │   └── Check req.user.role against allowed roles list
    │
    ├── requireChannelAccess middleware
    │   ├── Admin → bypass (access all)
    │   ├── Public channel → allow read
    │   ├── Private channel → verify membership
    │   └── DM channel → verify participant
    │
    └── requireMessageAccess middleware
        └── Resolve message → channel → verify membership
```

---

## 8. Chat Bot Architecture

### 8.1 FlowTask Bot Overview

| Property | Value |
|---|---|
| **Bot Name** | FlowTask Bot |
| **Avatar** | 🤖 System bot avatar |
| **Visibility** | Admin & Manager roles only |
| **Behavior** | Appears as a real chat user in sidebar and messages |
| **Message Style** | `contentType: "bot"` with distinct formatting |

### 8.2 Bot Notification Channels

| System Channel | Audience | Purpose |
|---|---|---|
| `#flowtask-admin` | Admin only | All admin-level notifications |
| `#flowtask-managers` | Managers (department-scoped) | Department-specific notifications |
| `#flowtask-announcements` | All roles (read-only for non-admins) | Organization-wide announcements |

### 8.3 Admin Receives (via FlowTask Bot)

| Event | Message Format |
|---|---|
| New project created (any department) | `📁 New project "{name}" created in {department} by {user}` |
| Sales module data added | `💰 New sales entry: {summary} added by {user}` |
| Verified user registration | `✅ New user verified: {name} ({email}) — Role: {role}` |
| Announcements published | `📢 Announcement: "{title}" published by {user}` |

### 8.4 Manager Receives (via FlowTask Bot)

| Event | Condition | Message Format |
|---|---|---|
| Project created in assigned department | Manager's department matches | `📁 New project "{name}" created by {user}` |
| Sales updates | Only if sales permission granted | `💰 Sales update: {summary}` |
| Verified users in same department | Department match | `✅ New team member: {name} joined {department}` |

### 8.5 Slash Commands

| Command | Description | Calls FlowTask API | Response |
|---|---|---|---|
| `/flowtask tasks` | List assigned tasks | `GET /api/cards/board/:boardId` | Formatted task list with statuses |
| `/flowtask status <taskId>` | Get task details | `GET /api/cards/:id` | Task details (assignees, priority, dates) |
| `/flowtask log <taskId> <time>` | Log time entry | `POST /api/cards/:id/time-tracking` | Confirmation message |
| `/flowtask projects` | List user's projects | `GET /api/boards` | Project list with status badges |
| `/flowtask help` | Command reference | — | Help text with all commands |

### 8.6 Circuit Breaker Pattern

All FlowTask API calls from the bot go through a circuit breaker:

```
State Machine:
  CLOSED (normal) → error threshold exceeded → OPEN (reject all)
  OPEN → timeout expires → HALF-OPEN (allow one test request)
  HALF-OPEN → success → CLOSED | failure → OPEN

Configuration:
  Error Threshold: 5 consecutive failures
  Open Timeout: 30 seconds
  Half-Open Max Attempts: 1
```

---

## 9. Repository Folder Structure

### 9.1 Backend Structure

```
server/
├── index.js                          # App entry, middleware stack, route mounting, startup
├── package.json                      # Dependencies and scripts
├── .env.example                      # Environment variable template
│
├── config/
│   ├── constants.js                  # App constants, event names, limits, enums
│   ├── database.js                   # MongoDB connection with retry logic
│   └── environment.js                # Env validation + defaults (Zod)
│
├── middleware/
│   ├── asyncHandler.js               # Async error wrapper for controllers
│   ├── errorHandler.js               # Global error response formatter
│   ├── rateLimiter.js                # Rate limit configurations (API + webhook)
│   ├── schemas.js                    # Zod validation schemas (shared)
│   ├── upload.js                     # Multer config (file types, size limits)
│   ├── validate.js                   # Zod validation middleware factory
│   └── webhookVerifier.js            # HMAC-SHA256 signature verification
│
├── modules/
│   ├── auth/
│   │   ├── auth.middleware.js        # protect, authorize, requireChannelAccess
│   │   ├── auth.controller.js        # sync, me endpoints
│   │   ├── auth.service.js           # JWT verification, user upsert
│   │   └── auth.routes.js            # /api/chat/auth/*
│   │
│   ├── channels/
│   │   ├── Channel.model.js          # Channel Mongoose schema
│   │   ├── channel.repository.js     # Channel data access queries
│   │   ├── channel.service.js        # CRUD, membership, slug generation
│   │   ├── channel.controller.js     # HTTP request handlers
│   │   └── channel.routes.js         # /api/chat/channels/*
│   │
│   ├── messages/
│   │   ├── Message.model.js          # Message schema (attachments, reactions embedded)
│   │   ├── ChatUpload.model.js       # Upload metadata schema
│   │   ├── message.repository.js     # Message queries, search, pagination
│   │   ├── message.service.js        # Send, edit, delete, react, pin, search
│   │   ├── message.controller.js     # HTTP handlers + file upload
│   │   └── message.routes.js         # /api/chat/channels/:id/messages/*
│   │
│   ├── threads/
│   │   ├── Thread.model.js           # Thread schema
│   │   ├── thread.repository.js      # Thread queries
│   │   ├── thread.service.js         # Create, reply, resolve, task-link
│   │   ├── thread.controller.js      # HTTP handlers
│   │   └── thread.routes.js          # /api/chat/channels/:id/threads/*
│   │
│   ├── readReceipts/
│   │   ├── ReadReceipt.model.js      # Read position schema
│   │   ├── readReceipt.repository.js # Read state queries
│   │   ├── readReceipt.service.js    # Mark read, unread counts
│   │   ├── readReceipt.controller.js # HTTP handlers
│   │   └── readReceipt.routes.js     # /api/chat/channels/:id/read
│   │
│   ├── users/
│   │   ├── ChatUser.model.js         # ChatUser schema (mirrored from FlowTask)
│   │   ├── user.repository.js        # User queries, search
│   │   ├── user.service.js           # Profile sync, presence, search
│   │   ├── user.controller.js        # HTTP handlers
│   │   └── user.routes.js            # /api/chat/users/*
│   │
│   ├── webhooks/
│   │   ├── webhook.controller.js     # Webhook ingestion endpoint
│   │   ├── webhook.routes.js         # POST /api/chat/webhooks/flowtask
│   │   ├── registerHandlers.js       # Wire event names to handler functions
│   │   └── handlers/
│   │       ├── projectEventHandler.js      # PROJECT_* events (5)
│   │       ├── taskEventHandler.js         # TASK_* events (7)
│   │       ├── userEventHandler.js         # USER_* events (2)
│   │       └── announcementEventHandler.js # ANNOUNCEMENT_* events (1)
│   │
│   ├── bot/
│   │   ├── bot.service.js            # Command parsing, FlowTask API calls
│   │   ├── bot.controller.js         # /flowtask command handler
│   │   └── bot.routes.js             # POST /api/chat/bot/command
│   │
│   └── flowtask/
│       ├── ProcessedEvent.model.js   # Idempotency tracking schema
│       └── flowtask.service.js       # FlowTask API client + circuit breaker
│
├── services/
│   ├── botNotifier.js                # Route bot messages to admin/manager channels
│   ├── circuitBreaker.js             # Circuit breaker state machine
│   ├── eventBus.js                   # Node.js EventEmitter for webhook dispatch
│   └── eventProcessor.js             # Idempotent event processing orchestrator
│
├── sockets/
│   └── socketManager.js              # Socket.IO init, auth middleware, room management
│
└── utils/
    ├── hmac.js                       # HMAC-SHA256 helpers
    ├── logger.js                     # Winston structured logger
    ├── pagination.js                 # Cursor/offset pagination helpers
    ├── sanitize.js                   # DOMPurify wrapper
    └── slugify.js                    # Channel slug generation
```

### 9.2 Frontend Structure

```
client/
├── index.html                        # SPA entry point
├── package.json                      # Dependencies
├── vite.config.js                    # Vite config (proxy to :3200, port 5174)
├── public/                           # Static assets
│
└── src/
    ├── App.jsx                       # Router setup, auth guards
    ├── main.jsx                      # React entry point
    ├── index.css                     # Global styles + CSS custom properties (dark theme)
    │
    ├── components/
    │   ├── chat/
    │   │   ├── ChatHeader.jsx              # Channel header (name, topic, search toggle)
    │   │   ├── ChatPanel.jsx               # Main chat area container
    │   │   ├── ChannelInfoPanel.jsx        # Side panel (details, members, settings)
    │   │   ├── CreateChannelModal.jsx       # Channel creation form
    │   │   ├── MemberAvatarGroup.jsx       # Avatar stack display
    │   │   ├── MessageInput.jsx            # Rich input (formatting, file upload, emoji)
    │   │   ├── MessageItem.jsx             # Message display (attachments, reactions, threads)
    │   │   ├── MessageList.jsx             # Virtualized message feed
    │   │   ├── SearchPanel.jsx             # Message search side panel
    │   │   ├── ThreadPanel.jsx             # Thread discussion panel
    │   │   ├── TypingIndicator.jsx         # Typing dots display
    │   │   ├── ActivityMessage.jsx         # System activity message (distinct UI)
    │   │   ├── ReactionPicker.jsx          # Emoji reaction selector
    │   │   ├── FilePreviewModal.jsx        # Single source of truth file preview
    │   │   ├── ProfileSidePanel.jsx        # Read-only user profile (on avatar click)
    │   │   └── EmojiPicker.jsx             # Full emoji picker component
    │   │
    │   ├── layout/
    │   │   ├── ChatLayout.jsx              # Main layout orchestrator
    │   │   └── Sidebar.jsx                 # Channel navigation sidebar
    │   │
    │   └── common/
    │       ├── Avatar.jsx                  # Reusable avatar component
    │       ├── Badge.jsx                   # Notification badge
    │       ├── Modal.jsx                   # Reusable modal wrapper
    │       ├── Loader.jsx                  # Loading spinner
    │       └── Tooltip.jsx                 # Hover tooltip
    │
    ├── pages/
    │   └── LoginPage.jsx                   # FlowTask SSO login page
    │
    ├── services/
    │   ├── api.js                          # Axios instance + JWT interceptor
    │   └── socket.js                       # Socket.IO client manager
    │
    └── stores/
        ├── authStore.js                    # Auth state (Zustand)
        ├── channelStore.js                 # Channel state (Zustand)
        └── chatStore.js                    # Message + real-time state (Zustand)
```

---

## 10. API Design Overview

### 10.1 Base URL

```
Production:  https://chat.flowtask.com/api/chat
Development: http://localhost:3200/api/chat
```

### 10.2 Endpoint Reference

#### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/sync` | JWT | Sync FlowTask user to ChatUser |
| `GET` | `/auth/me` | JWT | Get current authenticated user profile |

#### Channels

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/channels` | JWT | List user's accessible channels |
| `POST` | `/channels` | JWT | Create custom channel |
| `GET` | `/channels/:id` | JWT + Channel Access | Get channel details |
| `PATCH` | `/channels/:id` | JWT + Channel Admin | Update channel metadata |
| `DELETE` | `/channels/:id` | JWT + Admin/Manager | Archive channel |
| `POST` | `/channels/:id/join` | JWT | Join public channel |
| `POST` | `/channels/:id/leave` | JWT | Leave channel |
| `POST` | `/channels/:id/members` | JWT + Channel Admin | Add members |
| `DELETE` | `/channels/:id/members/:userId` | JWT + Channel Admin | Remove member |
| `POST` | `/channels/dm` | JWT | Create or get DM channel |

#### Messages

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/channels/:id/messages` | JWT + Channel Access | Get messages (paginated) |
| `POST` | `/channels/:id/messages` | JWT + Channel Access | Send message |
| `PATCH` | `/channels/:id/messages/:msgId` | JWT + Author | Edit message |
| `DELETE` | `/channels/:id/messages/:msgId` | JWT + Author/Admin | Delete message |
| `POST` | `/channels/:id/messages/:msgId/react` | JWT + Channel Access | Toggle reaction |
| `POST` | `/channels/:id/messages/:msgId/pin` | JWT + Channel Admin | Toggle pin |
| `GET` | `/channels/:id/messages/search` | JWT + Channel Access | Search messages |

#### File Uploads

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/channels/:id/upload` | JWT + Channel Access | Upload files (multipart) |
| `GET` | `/uploads/:filename` | Static | Serve uploaded file |

#### Threads

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/channels/:id/threads` | JWT + Channel Access | List channel threads |
| `POST` | `/channels/:id/threads` | JWT + Channel Access | Create new thread |
| `GET` | `/channels/:id/threads/:threadId` | JWT + Channel Access | Get thread with replies |
| `POST` | `/channels/:id/threads/:threadId/reply` | JWT + Channel Access | Reply to thread |

#### Read Receipts

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/channels/:id/read` | JWT | Mark channel as read |
| `GET` | `/unread` | JWT | Get all unread counts |

#### Bot

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/bot/command` | JWT + Admin/Manager | Execute slash command |

#### Webhooks

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/webhooks/flowtask` | HMAC Signature | FlowTask webhook receiver |

#### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | JWT | List / search ChatUsers |
| `GET` | `/users/:id` | JWT | Get user profile |
| `GET` | `/users/search?q=` | JWT | Search FlowTask users |

#### System

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check endpoint |

---

## 11. WebSocket Event Design

### 11.1 Connection Lifecycle

```
1. CLIENT: Establish connection with auth token
   io("ws://server:3200", { auth: { token: "jwt-token" } })

2. SERVER: Verify JWT in handshake middleware
   → Success: Accept connection, join user-{id} room
   → Failure: Reject with error

3. CLIENT: Join channels after connection
   socket.emit("channel:join", { channelId: "abc123" })

4. SERVER: Verify membership → join channel-{channelId} room

5. BIDIRECTIONAL: Real-time events flow

6. DISCONNECT: Clean up rooms, update presence to "offline"
```

### 11.2 Multi-Tab Support

- Each user can have multiple Socket.IO connections (tabs/devices)
- All connections join the same `user-{id}` room
- Presence is `offline` only when ALL connections disconnect
- Typing indicators deduplicate across tabs

### 11.3 Reconnection Strategy

```
Client Config:
  reconnection: true
  reconnectionAttempts: 10
  reconnectionDelay: 1000 (1s initial)
  reconnectionDelayMax: 30000 (30s max)

On Reconnect:
  1. Re-authenticate (JWT may have refreshed)
  2. Re-join active channel rooms
  3. Fetch missed messages since last seen
  4. Sync unread counts
```

---

## 12. Security & Production Practices

### 12.1 HTTP Security

| Measure | Implementation |
|---|---|
| Security headers | Helmet middleware (CSP, HSTS, X-Content-Type-Options, X-Frame-Options) |
| CORS | Configurable `CORS_ORIGINS` with credentials support |
| Rate limiting | express-rate-limit: 100 req/min API, 50 req/min webhooks |
| Request validation | Zod schemas on ALL mutation endpoints |
| Body size limit | 10KB JSON body limit |
| Input sanitization | DOMPurify on all message content (XSS prevention) |
| File type validation | MIME type whitelist for uploads |
| File size limit | 10MB per file, configurable via `MAX_FILE_SIZE` |
| UUID filenames | Prevent path traversal via random filenames |

### 12.2 WebSocket Security

| Measure | Implementation |
|---|---|
| Connection auth | JWT verified in Socket.IO handshake middleware |
| Room access | Membership verification on `channel:join` |
| Admin bypass | Admin role can join any channel room |
| Connection cleanup | Rooms cleared on disconnect |
| Rate limiting | Event throttling (typing: 1 per 2s, messages: 5 per second) |

### 12.3 Webhook Security

| Measure | Implementation |
|---|---|
| HMAC verification | SHA-256 signature check on every webhook payload |
| Timestamp validation | Reject events older than 5 minutes (replay prevention) |
| Idempotency | Deduplicate by delivery ID via ProcessedEvent collection |
| Rate limiting | Separate rate limit for webhook endpoint |
| IP whitelist (optional) | Configurable allowed IPs for webhook sources |

### 12.4 Authentication Security

| Measure | Implementation |
|---|---|
| JWT shared secret | Same `JWT_SECRET` as FlowTask for SSO |
| Token expiry | Configurable (default: 7 days) |
| Token refresh | Automatic refresh before expiry |
| SSO-ready | Architecture supports SAML/OIDC integration (future) |

### 12.5 Data Protection

| Measure | Implementation |
|---|---|
| Message scoping | Search results filtered by user's accessible channels |
| Channel isolation | Private channels require explicit membership |
| DM privacy | Only two participants can access DM channel |
| Audit logging | All admin actions logged via Winston |
| Soft-delete | Messages and channels use soft-delete with audit trail |

---

## 13. Scalability Strategy

### 13.1 Database Scaling

| Strategy | Implementation |
|---|---|
| **Indexing** | Compound indexes on high-frequency queries (channelId + createdAt, userId + channelId) |
| **Read replicas** | MongoDB Atlas read preference for search/analytics queries |
| **Sharding ready** | channelId as shard key for message collections |
| **TTL indexes** | Auto-expire ProcessedEvent documents after 7 days |
| **Capped collections** | Optional for high-volume activity log channels |

### 13.2 Application Scaling

| Strategy | Implementation |
|---|---|
| **Horizontal scaling** | Stateless server design — scale to N instances behind load balancer |
| **Socket.IO adapter** | Redis adapter for multi-instance Socket.IO room synchronization |
| **Module extraction** | Each module (auth, channels, messages, webhooks) extractable as independent microservice |
| **Event bus upgrade** | Replace in-process EventEmitter with Redis Pub/Sub or RabbitMQ for distributed processing |
| **Connection pooling** | Mongoose connection pool (default: 100 connections) |

### 13.3 Performance Targets

| Metric | Target |
|---|---|
| API response time (p95) | < 200ms |
| WebSocket message latency | < 100ms |
| Webhook processing time | < 500ms |
| Concurrent WebSocket connections | 10,000+ per instance |
| Messages per second | 1,000+ per instance |

### 13.4 File Storage Scaling

| Phase | Strategy |
|---|---|
| MVP | Local disk storage with UUID filenames |
| Growth | AWS S3 / Google Cloud Storage with CDN |
| Enterprise | Signed URLs, automatic thumbnailing, virus scanning |

---

## 14. Deployment Architecture

### 14.1 Environment Matrix

| Environment | Purpose | Infrastructure |
|---|---|---|
| **Development** | Local development | localhost:3200 (server), localhost:5174 (client) |
| **Staging** | Pre-production testing | Render / AWS ECS (same config as production) |
| **Production** | Live users | Render / AWS ECS / GCP Cloud Run |

### 14.2 Production Topology

```
┌─────────────────────────────────────────────────────────┐
│                     CDN (CloudFlare)                     │
│              Static assets + WebSocket upgrade            │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                   Load Balancer                          │
│          (Sticky sessions for Socket.IO)                 │
└──────┬──────────────┬────────────────────┬──────────────┘
       │              │                    │
┌──────▼──────┐ ┌─────▼──────┐ ┌──────────▼──────┐
│  Chat App   │ │  Chat App  │ │   Chat App      │
│ Instance 1  │ │ Instance 2 │ │  Instance N     │
│ (Express +  │ │ (Express + │ │ (Express +      │
│  Socket.IO) │ │  Socket.IO)│ │  Socket.IO)     │
└──────┬──────┘ └─────┬──────┘ └──────────┬──────┘
       │              │                    │
       └──────────────┼────────────────────┘
                      │
        ┌─────────────▼──────────────┐
        │   Redis (Socket.IO Adapter │
        │   + Session Store)         │
        └─────────────┬──────────────┘
                      │
        ┌─────────────▼──────────────┐
        │   MongoDB Atlas Cluster    │
        │   (Chat Database)          │
        └────────────────────────────┘
```

### 14.3 Environment Variables (Production)

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | Must match FlowTask's JWT secret |
| `FLOWTASK_API_URL` | Yes | `https://flowtask-x3z4.onrender.com` |
| `FLOWTASK_WEBHOOK_SECRET` | Yes | HMAC shared secret for webhook verification |
| `CORS_ORIGINS` | Yes | Allowed frontend origins |
| `PORT` | No | Server port (default: 3200) |
| `NODE_ENV` | Yes | `production` |
| `UPLOAD_DIR` | No | File upload directory (default: `./uploads`) |
| `MAX_FILE_SIZE` | No | Max upload size in bytes (default: 10MB) |
| `LOG_LEVEL` | No | Winston log level (default: `info`) |
| `REDIS_URL` | Scaling | Redis connection for Socket.IO adapter |

### 14.4 Health Monitoring

```
GET /api/chat/health

Response:
{
  "status": "healthy",
  "version": "2.0.0",
  "uptime": 86400,
  "database": "connected",
  "socketConnections": 1234,
  "flowtaskApi": "reachable",
  "timestamp": "2026-02-25T11:00:00Z"
}
```

---

## 15. Future Expansion Capabilities

### 15.1 Planned Roadmap

| Phase | Feature | Description |
|---|---|---|
| **Phase 2** | Voice & Video Calls | WebRTC-based 1:1 and group calls |
| **Phase 2** | Screen Sharing | In-call screen sharing for remote collaboration |
| **Phase 2** | SSO / SAML / OIDC | Enterprise single sign-on integration |
| **Phase 3** | Message Scheduling | Schedule messages for future delivery |
| **Phase 3** | Channel Templates | Pre-configured channel types with default settings |
| **Phase 3** | Advanced Search | Full-text search with filters (date, user, channel, file type) |
| **Phase 3** | Message Bookmarks | Personal bookmark collections |
| **Phase 4** | AI Assistant Bot | AI-powered responses, task summarization, smart suggestions |
| **Phase 4** | Analytics Dashboard | Message volume, response times, team engagement metrics |
| **Phase 4** | Workflow Automation | Custom triggers: "When task completed → post in channel" |
| **Phase 5** | Mobile Apps | React Native iOS/Android applications |
| **Phase 5** | Desktop App | Electron-based desktop application |
| **Phase 5** | Guest Access | External collaborators with limited permissions |

### 15.2 Integration Extension Points

| Extension | Mechanism |
|---|---|
| **Additional webhooks** | New event handlers can be registered in `registerHandlers.js` |
| **Third-party APIs** | Circuit breaker pattern extends to any external service |
| **Custom bots** | Bot framework supports adding new slash commands |
| **Plugin system** | Module architecture enables drop-in feature modules |
| **Notification channels** | Email, SMS, push notification providers via service adapters |

### 15.3 Architecture Evolution Path

```
Current: Modular Monolith
    │
    ├── Phase 2: Add Redis for Socket.IO adapter + cache
    │
    ├── Phase 3: Extract webhook processor as independent worker
    │
    ├── Phase 4: Extract message service as microservice
    │             Add message queue (RabbitMQ / SQS)
    │
    └── Phase 5: Full microservice architecture
                 API Gateway + Service Mesh
                 Kubernetes orchestration
```

---

## Chat Feature Specifications

### User Capabilities

| Feature | Description |
|---|---|
| **FlowTask User Search** | After login, users can search all verified FlowTask users for DMs or channel invites |
| **1-to-1 Private Chat** | Direct message channels between two users, auto-created on first message |
| **Custom Channels** | Any user can create custom channels, invite members, set topic |
| **Join / Invite / Exit** | Join public channels freely, invite to private channels, exit any channel |
| **Message Reactions** | 10 predefined emoji reactions per message with user lists |
| **Reply / Thread** | Reply to any message to start a threaded discussion |
| **Like & Emoji** | Quick-react with predefined emojis, full emoji picker available |
| **Attachments** | Files, documents, audio, video, images — max 10 per message, 10MB each |
| **File Preview Modal** | Single source of truth modal for previewing any file type |
| **Profile Side Panel** | Click any user avatar → read-only profile panel (name, role, department, status) |

### File Type Support

| Category | MIME Types | Preview |
|---|---|---|
| **Images** | JPEG, PNG, GIF, SVG, WebP | Inline thumbnail + full preview modal |
| **Videos** | MP4, WebM, MOV | Video player in preview modal |
| **Audio** | MP3, WAV, OGG, M4A | Audio player in preview modal |
| **Documents** | PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX | File card with download link |
| **Archives** | ZIP, RAR, 7Z, TAR.GZ | File card with size and download |

---

> **Document Maintainer:** Architecture Team
> **Last Updated:** 2026-02-25
> **Next Review:** 2026-03-25
> **FlowTask Live URL:** https://flowtask-x3z4.onrender.com/
> **Chat App Target URL:** https://chat.flowtask.com/
