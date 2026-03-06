# FlowTask + ChatApp â€” Master Architecture & Integration Blueprint

> **Version:** 3.0.0
> **Date:** 2026-03-05
> **Status:** Production-Grade Specification â€” Single Source of Truth
> **Audience:** FlowTask Engineering, ChatApp Engineering, DevOps, Security, Product
> **Classification:** Internal â€” Confidential

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture Diagram](#2-high-level-architecture-diagram)
3. [Domain Model Mapping](#3-domain-model-mapping)
4. [Event-Driven Architecture](#4-event-driven-architecture)
5. [Webhook Contract Specification](#5-webhook-contract-specification)
6. [Socket Architecture](#6-socket-architecture)
7. [Database Design](#7-database-design)
8. [API Specification](#8-api-specification)
9. [Required Changes in FlowTask](#9-required-changes-in-flowtask)
10. [Required Changes in ChatApp](#10-required-changes-in-chatapp)
11. [Slack-Level Feature Enhancements](#11-slack-level-feature-enhancements)
12. [RBAC & Security Model](#12-rbac--security-model)
13. [Performance & Scaling](#13-performance--scaling)
14. [Failure Handling & Recovery](#14-failure-handling--recovery)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Observability & Monitoring](#16-observability--monitoring)
17. [Future Roadmap](#17-future-roadmap)

---

## 1. System Overview

### 1.1 Vision

We are building a **unified enterprise work operating system** that combines the project-management power of FlowTask with the real-time collaboration capabilities of ChatApp. The integrated ecosystem is designed to:

- **Eliminate context switching** â€” surface task updates, comments, and status changes inside chat channels automatically.
- **Provide a single notification funnel** â€” consolidate in-app, email, push, and chat notifications through one event pipeline.
- **Enable conversational workflows** â€” allow users to act on tasks (update status, log time, assign members) from within chat.
- **Maintain organizational boundaries** â€” enforce FlowTask's department and role-based access control in every chat interaction.

The combined platform competes with **Slack + Jira**, **Microsoft Teams + Azure DevOps**, and **Discord + Linear** â€” but as a single, tightly integrated SaaS product.

### 1.2 SaaS Model

| Aspect | Design |
|---|---|
| **Tenancy** | Single-organization deployment (V1); multi-tenant with workspace isolation (V2 roadmap) |
| **Billing** | Per-seat licensing with tier-based feature gating (Free / Pro / Enterprise) |
| **Data Residency** | Configurable per deployment; default: single-region MongoDB Atlas |
| **SLA Target** | 99.9% uptime; < 200ms Socket.IO latency; < 2s webhook delivery |
| **Compliance** | SOC 2 Type II (roadmap); GDPR-ready data isolation |

### 1.3 Multi-Tenant Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 ORGANIZATION (Tenant)                       │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   Workspace Boundary (Data Isolation Envelope)        │  │
│  │                                                       │  │
│  │   ┌─────────┐   ┌─────────┐   ┌─────────────────────┐ │  │
│  │   │ Dept A  │   │ Dept B  │   │ Dept C              │ │  │
│  │   │ ┌─────┐ │   │ ┌─────┐ │   │ ┌─────┐  ┌─────┐    │ │  │
│  │   │ │Team1│ │   │ │Team2│ │   │ │Team3│  │Team4│    │ │  │
│  │   │ └─────┘ │   │ └─────┘ │   │ └─────┘  └─────┘    │ │  │
│  │   │ Projects│   │ Projects│   │ Projects            │ │  │
│  │   └─────────┘   └─────────┘   └─────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  FlowTask DB ←──── Event Bus ────→ ChatApp DB               │
│  (System of Record)          (Messaging Layer)              │
└─────────────────────────────────────────────────────────────┘
```

### 1.4 System Boundaries & Ownership

| Boundary | Owner | Description |
|---|---|---|
| **Projects, Tasks, Subtasks** | FlowTask | Kanban boards, cards, hierarchical task tracking |
| **Users, Roles, Departments, Teams** | FlowTask | Identity, RBAC, organizational structure |
| **Announcements** | FlowTask | Organization-wide or targeted broadcasts |
| **Sales Pipeline** | FlowTask | Bidding data, sales permissions, analytics |
| **Finance Pages** | FlowTask | Custom finance analytics with approval workflow |
| **Time Tracking** | FlowTask | Logged, billed, and estimated time entries |
| **Chat Messages & Threads** | ChatApp | Real-time messaging, threaded discussions |
| **Channels** | ChatApp (structure synced from FlowTask) | Project/dept/team channels auto-provisioned |
| **Reactions, Read Receipts, Typing** | ChatApp | Ephemeral and persistent chat state |
| **File Uploads (Chat)** | ChatApp | Files shared directly within chat context |
| **Notifications (Chat)** | ChatApp | Chat-specific notification delivery and preferences |

**Cardinal Rule:** FlowTask is the **System of Record**. ChatApp must never create, modify, or delete FlowTask entities directly â€” only consume events emitted by FlowTask.

### 1.5 Entity Hierarchy (FlowTask)

```
Organization
 └── Department
      ├── Team
      │    └── Members (User[])
      ├── Board (Project)
      │    ├── Members (User[])
      │    ├── List (Status Column)
      │    │    └── Card (Task)
      │    │         ├── Assignees (User[])
      │    │         ├── Labels (Label[])
      │    │         ├── Comments (Comment[])
      │    │         ├── Attachments (Attachment[])
      │    │         ├── Time Entries (loggedTime[], billedTime[], estimationTime[])
      │    │         ├── Subtask
      │    │         │    └── SubtaskNano
      │    │         └── Recurrence (RecurringTask)
      │    └── Labels (Board-scoped)
      └── Announcements
```

## 2. High-Level Architecture Diagram

```
                           ┌──────────────────────┐
                           │   CDN / CloudFront   │
                           │    (Static Assets)   │
                           └──────────┬───────────┘
                                      │
                           ┌──────────▼───────────┐
                           │     Load Balancer    │
                           │     (Nginx / ALB)    │
                           │    SSL Termination   │
                           └───────┬────────┬─────┘
                                   │        │
              ┌────────────────────▼──┐   ┌──▼────────────────────┐
              │   FlowTask Backend    │   │    ChatApp Backend    │
              │   (Node.js / Express) │   │   (Node.js / Express) │
              │       Port 5000       │   │        Port 3001      │
              │                       │   │                       │
              │  ┌─────────────────┐  │   │  ┌─────────────────┐  │
              │  │     REST API    │  │   │  │     REST API    │  │
              │  │    Controllers  │  │   │  │     Modules     │  │
              │  └─────────────────┘  │   │  └─────────────────┘  │
              │  ┌─────────────────┐  │   │  ┌─────────────────┐  │
              │  │    Socket.IO    │  │   │  │    Socket.IO    │  │
              │  │     Server      │  │   │  │     Server      │  │
              │  └─────────────────┘  │   │  └─────────────────┘  │
              │  ┌─────────────────┐  │   │  ┌─────────────────┐  │
              │  │   Webhook       │──┼──▶│  │   Webhook       │  │
              │  │   Emitter       │  │   │  │   Receiver      │  │
              │  └─────────────────┘  │   │  └─────────────────┘  │
              │  ┌─────────────────┐  │   │  ┌─────────────────┐  │
              │  │   Queue Worker  │  │   │  │   Bot Engine    │  │
              │  │    (BullMQ)     │  │   │  │   (Commands)    │  │
              │  └─────────────────┘  │   │  └─────────────────┘  │
              └───────────┬───────────┘   └───────────┬───────────┘
                          │                           │
             ┌────────────▼───────────┐   ┌───────────▼───────────┐
             │     FlowTask DB        │   │      ChatApp DB       │
             │    (MongoDB Atlas)     │   │     (MongoDB Atlas)   │
             └────────────┬───────────┘   └───────────┬───────────┘
                          │                           │
                          └───────────────┬───────────┘
                                          │
                               ┌──────────▼──────────┐
                               │        Redis        │
                               │   (Cache + Pub/Sub  │
                               │      + BullMQ)      │
                               └──────────┬──────────┘
                                          │
                           ┌──────────────▼──────────────┐
                           │     Email / Push Service    │
                           │    (Nodemailer / FCM)       │
                           └─────────────────────────────┘
```

### 2.1 Data Flow Summary

```
┌────────────┐   REST / Socket.IO    ┌───────────────┐
│  FlowTask  │ ────────────────────▶ │   FlowTask    │
│  Frontend  │ ◀──────────────────── │    Backend    │
└────────────┘                        └───────┬───────┘
                                             │
                         Webhook POST        │   Socket.IO Events
                        (HMAC signed)        │   (JWT authenticated)
                                             │
                                      ┌──────▼───────┐
                                      │   ChatApp    │
                                      │    Backend   │
                                      └──────┬───────┘
                                             │
                                  Socket.IO  │  REST API
                                             │
                                      ┌──────▼───────┐
                                      │   ChatApp    │
                                      │   Frontend   │
                                      └──────────────┘
```

## 3. Domain Model Mapping

### 3.1 Core Entity Mapping

| FlowTask Entity | FlowTask Model | ChatApp Representation | ChatApp Model | Mapping Key | Cardinality |
|---|---|---|---|---|---|
| Board (Project) | `Board` | Channel | `Channel` | `Board._id` â†’ `Channel.flowTaskRef` | 1:1 |
| Card (Task) | `Card` | Thread | `Thread` | `Card._id` â†’ `Thread.taskId` | 1:1 |
| Comment | `Comment` | Message (in Thread) | `Message` | `Comment._id` â†’ `Message.flowTaskCommentId` | 1:1 |
| Department | `Department` | Channel Group / Category | `Channel` (type: `department`) | `Department._id` | 1:1 |
| Team | `Team` | Private Group Channel | `Channel` (type: `team`) | `Team._id` | 1:1 |
| User | `User` | Chat User | `ChatUser` | `User._id` â†’ `ChatUser.flowTaskUserId` | 1:1 |
| Role | `Role` | Permission Scope | Derived from FlowTask JWT | `Role.name` | N/A |
| Announcement | `Announcement` | Pinned Broadcast Message | `Message` (type: `announcement`) | `Announcement._id` | 1:1 |
| Label | `Label` | Tag / Emoji Badge | Visual only (no model) | â€” | â€” |
| Subtask | `Subtask` | Sub-thread / Checklist | Nested within Thread | `Subtask._id` | 1:N |
| Time Entry | `Card.loggedTime[]` | Bot System Message | `Message` (type: `system`) | `entryId` | 1:1 |
| Attachment (FT) | `Attachment` | Linked File | `Message.attachments[]` | `source: 'flowtask'` | 1:1 |

### 3.2 Channel Type Taxonomy

| Channel Type | Source | Naming Pattern | Access Rule | Auto-Created |
|---|---|---|---|---|
| **Project** | `Board` | `flowtask-{dept_slug}-{project_slug}` | Board members + assignees | Yes (on `PROJECT_CREATED`) |
| **Department** | `Department` | `flowtask-dept-{dept_slug}` | Department members + managers | Yes (on dept creation) |
| **Team** | `Team` | `flowtask-team-{team_slug}` | Team members | Yes (on team creation) |
| **Admin** | System | `#flowtask-admin` | `role === 'admin'` only | Yes (singleton) |
| **Managers** | System | `#flowtask-managers` | `role === 'manager'` or `'admin'` | Yes (singleton) |
| **Announcements** | System | `#flowtask-announcements` | All verified users | Yes (singleton) |
| **General** | System | `#flowtask-general` | All verified users | Yes (singleton) |
| **DM** | User-initiated | `dm-{sorted_userIds}` | Two participants only | On first DM |
| **Group** | User-initiated | User-defined name | Invited members | Manual |

### 3.3 Channel Naming Rules

```
Pattern: flowtask-{department_slug}-{project_slug}

Rules:
1. department_slug = Department.name â†’ lowercase â†’ replace spaces with hyphens â†’ strip non-alphanumeric
2. project_slug   = Board.name â†’ lowercase â†’ replace spaces with hyphens â†’ strip non-alphanumeric
3. Truncate total length to 80 characters (platform limit)
4. If collision detected â†’ append "-{last4chars_of_boardId}"

Examples:
  Department: "Engineering"  + Project: "FlowTask V2"  â†’ #flowtask-engineering-flowtask-v2
  Department: "Sales"        + Project: "Q1 Pipeline"  â†’ #flowtask-sales-q1-pipeline
  Department: "HR"           + Project: "Onboarding"   â†’ #flowtask-hr-onboarding

Department Channel: flowtask-dept-{department_slug}
Team Channel:       flowtask-team-{team_slug}
```

### 3.4 Member Synchronization Logic

**Membership Sources (Union):**

```
Channel Members = Board.owner
                + Board.members[]
                + Card.assignees[] (across all cards in the board)
                + Subtask.assignees[] (across all subtasks)
                + SubtaskNano.assignees[] (across all nano-subtasks)
```

**Sync Rules:**

1. On `PROJECT_CREATED` → add `owner` + `members[]` to channel.
2. On `PROJECT_MEMBER_ASSIGNED` → add new members to channel.
3. On `PROJECT_MEMBER_REMOVED` → remove members, unless still assigned to tasks within the project.
4. On `TASK_CREATED` / `TASK_UPDATED` with assignee changes → add new assignees (additive only).
5. Full sync reconciliation runs **every 6 hours** to correct drift.

---

## 4. Event-Driven Architecture

### 4.1 Event Catalog â€” FlowTask Domain Events

| # | Event Name | Trigger | Source Controller | Socket Room | Severity |
|---|---|---|---|---|---|
| 1 | `PROJECT_CREATED` | `POST /api/boards` | `boardController.createBoard` | `board-{id}`, `department-{id}` | Medium |
| 2 | `PROJECT_UPDATED` | `PUT /api/boards/:id` | `boardController.updateBoard` | `board-{id}` | Low |
| 3 | `PROJECT_DELETED` | `DELETE /api/boards/:id` | `boardController.deleteBoard` | `board-{id}` | High |
| 4 | `PROJECT_MEMBER_ASSIGNED` | Member added to board | `boardController.updateBoard` | `board-{id}` | Medium |
| 5 | `PROJECT_MEMBER_REMOVED` | Member removed from board | `boardController.updateBoard` | `board-{id}` | Medium |
| 6 | `TASK_CREATED` | `POST /api/cards` | `cardController.createCard` | `board-{boardId}` | Medium |
| 7 | `TASK_UPDATED` | `PUT /api/cards/:id` | `cardController.updateCard` | `board-{boardId}` | Low |
| 8 | `TASK_DELETED` | `DELETE /api/cards/:id` | `cardController.deleteCard` | `board-{boardId}` | Medium |
| 9 | `TASK_STATUS_CHANGED` | Card status/list change | `cardController.updateCard` | `board-{boardId}` | Medium |
| 10 | `TASK_DUE_DATE_CHANGED` | Due date modified | `cardController.updateCard` | `board-{boardId}` | Medium |
| 11 | `TASK_COMMENT_ADDED` | `POST /api/comments` | `commentController.addComment` | `board-{boardId}` | Medium |
| 12 | `TIME_ENTRY_ADDED` | `POST /api/cards/:id/time-tracking` | `cardController.addTimeEntry` | `board-{boardId}` | Low |
| 13 | `USER_REGISTERED` | `POST /api/auth/register` | `authController.register` | `admin` | Critical |
| 14 | `USER_VERIFIED` | `PUT /api/users/:id/verify` | `userController.verifyUser` | `admin` | High |
| 15 | `ANNOUNCEMENT_CREATED` | `POST /api/announcements` | `announcementController.create` | `announcements`, `department-{id}` | Medium |

### 4.2 Extended Events (New â€” Required for SaaS-Grade)

| # | Event Name | Trigger | Purpose |
|---|---|---|---|
| 16 | `TASK_ASSIGNEE_CHANGED` | Assignees array modified | Granular assignee tracking |
| 17 | `TASK_OVERDUE` | Scheduler detects past-due | Proactive alerting |
| 18 | `TASK_DUE_SOON` | Scheduler: due within 24h | Reminder system |
| 19 | `TASK_COMPLETED` | Status â†’ "done" | Completion celebration |
| 20 | `SUBTASK_UPDATED` | Subtask modified | Thread sub-item sync |
| 21 | `USER_UPDATED` | Profile/role changed | RBAC sync |
| 22 | `USER_DEACTIVATED` | Account disabled | Access revocation |
| 23 | `DEPARTMENT_CREATED` | New department | Channel auto-creation |
| 24 | `DEPARTMENT_UPDATED` | Department modified | Channel rename/update |
| 25 | `DEPARTMENT_DELETED` | Department removed | Channel archive |
| 26 | `TEAM_CREATED` | New team | Channel auto-creation |
| 27 | `TEAM_UPDATED` | Team modified | Channel update |
| 28 | `TEAM_DELETED` | Team removed | Channel archive |
| 29 | `ANNOUNCEMENT_UPDATED` | Announcement modified | Message update |
| 30 | `ANNOUNCEMENT_DELETED` | Announcement removed | Message removal |
| 31 | `SALES_DATA_UPDATED` | Sales row modified | Admin/manager notification |
| 32 | `FINANCE_PAGE_PENDING` | Finance page submitted | Approval workflow |
| 33 | `FINANCE_PAGE_STATUS_CHANGED` | Finance page status change | Status notification |
| 34 | `COMMENT_UPDATED` | Comment edited | Message sync |
| 35 | `COMMENT_DELETED` | Comment removed | Message deletion |
| 36 | `ATTACHMENT_ADDED` | File attached to card | File sync |
| 37 | `ATTACHMENT_DELETED` | File removed from card | File cleanup |
| 38 | `DEADLINE_APPROACHING` | Custom reminder schedule | Smart notifications |
| 39 | `INTEGRATION_DELIVERY_FAILED` | Webhook delivery failure | Admin alerting |
| 40 | `RECONCILIATION_COMPLETED` | Daily sync finished | Audit trail |

### 4.3 Universal Event Envelope Schema

```json
{
  "event": "EVENT_NAME",
  "version": "1.0",
  "timestamp": "2026-03-05T09:22:14.000Z",
  "deliveryId": "550e8400-e29b-41d4-a716-446655440000",
  "source": "flowtask",
  "workspaceId": "org_abc123",
  "data": {
    // Event-specific payload
  },
  "metadata": {
    "correlationId": "req_xyz789",
    "causationId": "evt_prev_456",
    "actor": {
      "userId": "ObjectId",
      "name": "string",
      "role": "string"
    },
    "retryCount": 0
  }
}
```

### 4.4 Event Versioning Rules

| Change Type | Version Increment | Consumer Impact | Deprecation Period |
|---|---|---|---|
| New optional field added | Minor (1.0 â†’ 1.1) | None â€” ignore unknown fields | N/A |
| Field type changed | Major (1.0 â†’ 2.0) | Must update parsing | 90 days parallel emission |
| Field removed | Major (1.0 â†’ 2.0) | Must remove dependency | 90 days parallel emission |
| New required field | Major (1.0 â†’ 2.0) | Must populate | 90 days parallel emission |

### 4.5 Idempotency Strategy

```
1. Extract `X-FlowTask-Delivery-Id` from webhook headers (or `deliveryId` from payload)

2. Check `WebhookEvents` collection:
   - If `deliveryId` exists AND `status === 'completed'` → return 200 immediately (skip processing)
   - If `deliveryId` exists AND `status === 'failed'` → retry processing
   - If `deliveryId` does not exist → process normally

3. Before processing: insert record with `status: 'processing'`

4. After successful processing: update status to `completed`

5. On failure: update status to `failed`, increment `attempts`, store error

6. Purge entries older than **7 days** via TTL index
```

### 4.6 Dead-Letter Queue (DLQ)

```
                    ┌───────────────┐
                    │     Event     │
                    │    Emitter    │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐        Success
                    │    Primary    │ ───────────────▶ Done
                    │     Queue     │
                    └───────┬───────┘
                            │ Failure (after 5 retries)
                    ┌───────▼───────┐
                    │  Dead Letter  │
                    │     Queue     │
                    └───────┬───────┘
                            │
              ┌─────────────▼─────────────┐
              │       Admin Alert +       │
              │    Manual Retry Endpoint  │
              │   POST /api/integrations  │
              │        /retry/:deliveryId │
              └───────────────────────────┘
```

## 5. Webhook Contract Specification

### 5.1 Request Headers

| Header | Value | Purpose |
|---|---|---|
| `Content-Type` | `application/json` | Payload format |
| `X-FlowTask-Event` | Event name (e.g., `PROJECT_CREATED`) | Event routing |
| `X-FlowTask-Event-Version` | `1.0` | Schema versioning |
| `X-FlowTask-Signature` | `sha256=<HMAC-SHA256>` | Payload integrity |
| `X-FlowTask-Delivery-Id` | UUID v4 | Idempotency key |
| `X-FlowTask-Timestamp` | ISO 8601 | Emission time |
| `User-Agent` | `FlowTask-Webhook/1.0` | Client identification |

### 5.2 HMAC Signature Verification

```javascript
// FlowTask â€” Signing (Emitter Side)
const crypto = require('crypto');
const payload = JSON.stringify(eventData);
const signature = 'sha256=' + crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(payload, 'utf8')
  .digest('hex');
// Set header: X-FlowTask-Signature = signature

// ChatApp â€” Verification (Receiver Side)
function verifyWebhookSignature(req) {
  const signature = req.headers['x-flowtask-signature'];
  const timestamp = req.headers['x-flowtask-timestamp'];

  // 1. Replay attack protection: reject if timestamp > 5 minutes old
  const eventTime = new Date(timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - eventTime) > 5 * 60 * 1000) {
    throw new Error('Webhook timestamp too old â€” possible replay attack');
  }

  // 2. Compute expected signature
  const payload = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(payload, 'utf8')
    .digest('hex');

  // 3. Constant-time comparison
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('Invalid webhook signature');
  }
  return true;
}
```

### 5.3 Delivery Guarantees

| Guarantee | Implementation |
|---|---|
| **Delivery Model** | At-least-once (consumers must be idempotent) |
| **Timeout** | 10 seconds per attempt |
| **Expected Response** | HTTP 2xx within timeout |
| **Max Payload Size** | 256 KB |

### 5.4 Retry Strategy with Exponential Backoff

| Attempt | Delay | Timeout | Action on Failure |
|---|---|---|---|
| 1 | Immediate | 10s | Retry |
| 2 | 1 second | 10s | Retry |
| 3 | 5 seconds | 10s | Retry |
| 4 | 30 seconds | 10s | Retry |
| 5 (final) | 5 minutes | 10s | Move to DLQ + Admin alert |

### 5.5 Sample Webhook Payloads

**PROJECT_CREATED:**

```json
{
  "event": "PROJECT_CREATED",
  "version": "1.0",
  "timestamp": "2026-03-05T09:22:14.000Z",
  "deliveryId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "projectId": "65a1b2c3d4e5f6789012abcd",
    "name": "FlowTask V2 Redesign",
    "description": "Complete redesign of the FlowTask platform",
    "departmentId": "65a1b2c3d4e5f6789012aaaa",
    "departmentName": "Engineering",
    "ownerId": "65a1b2c3d4e5f6789012bbbb",
    "ownerName": "Mohit Gahlyan",
    "ownerEmail": "mohit@flowtask.io",
    "members": ["65a1...cccc", "65a1...dddd", "65a1...eeee"],
    "visibility": "private",
    "status": "planning",
    "priority": "high",
    "startDate": "2026-03-10T00:00:00.000Z",
    "dueDate": "2026-06-30T00:00:00.000Z",
    "teamId": "65a1b2c3d4e5f6789012ffff"
  }
}
```

**TASK_STATUS_CHANGED:**

```json
{
  "event": "TASK_STATUS_CHANGED",
  "version": "1.0",
  "timestamp": "2026-03-05T14:30:00.000Z",
  "deliveryId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "data": {
    "taskId": "65b1c2d3e4f5a6789012bcde",
    "title": "Implement WebSocket reconnection",
    "projectId": "65a1b2c3d4e5f6789012abcd",
    "projectName": "FlowTask V2 Redesign",
    "oldStatus": "In Progress",
    "newStatus": "Done",
    "changedBy": "65a1b2c3d4e5f6789012bbbb",
    "changedByName": "Mohit Gahlyan",
    "assigneeIds": ["65a1...cccc", "65a1...dddd"],
    "isCompleted": true
  }
}
```

**TASK_COMMENT_ADDED:**

```json
{
  "event": "TASK_COMMENT_ADDED",
  "version": "1.0",
  "timestamp": "2026-03-05T15:00:00.000Z",
  "deliveryId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "data": {
    "commentId": "65c1d2e3f4a5b6789012cdef",
    "taskId": "65b1c2d3e4f5a6789012bcde",
    "projectId": "65a1b2c3d4e5f6789012abcd",
    "projectName": "FlowTask V2 Redesign",
    "taskTitle": "Implement WebSocket reconnection",
    "authorId": "65a1b2c3d4e5f6789012cccc",
    "authorName": "Dev Engineer",
    "text": "Reconnection logic is now handling edge cases properly. @Mohit please review.",
    "htmlContent": "<p>Reconnection logic is now handling edge cases properly. <span class=\"mention\">@Mohit</span> please review.</p>",
    "contextType": "card",
    "contextRef": "65b1c2d3e4f5a6789012bcde",
    "parentCommentId": null,
    "mentions": [
      { "type": "User", "targetId": "65a1...bbbb", "targetModel": "User", "name": "Mohit" }
    ],
    "attachments": []
  }
}
```

---

## 6. Socket Architecture

### 6.1 Dual Socket.IO Topology

Both FlowTask and ChatApp run independent Socket.IO servers. The ChatApp server handles chat-specific real-time events while subscribing to FlowTask events via webhooks.

**FlowTask Socket.IO Rooms:**

| Room Pattern | Join Condition | Events Emitted |
|---|---|---|
| `user-{userId}` | Automatic on connect | `notification`, personal alerts |
| `board-{boardId}` | User joins project view | `card-updated`, `comment-added`, `comment-updated`, `comment-deleted`, `subtask-updated`, `attachment-added`, `attachment-deleted`, `time-logged`, `estimation-updated` |
| `team-{teamId}` | User joins team view | Team-level updates |
| `department-{departmentId}` | Automatic (from JWT) | Department-scoped announcements |
| `admin` | `role === 'admin'` | Admin alerts, finance events, user registration |
| `managers` | `role === 'manager'` | Manager alerts, finance events |
| `announcements` | User opens announcements | `announcement-created/updated/deleted` |
| `finance` | User opens finance view | `finance:data:refresh`, `finance:page:*` |
| `sales` | User opens sales view | Sales data updates |
| `card-{cardId}` | User opens card detail | Card-specific updates |

**ChatApp Socket.IO Rooms:**

| Room Pattern | Join Condition | Events Emitted |
|---|---|---|
| `user:{userId}` | Automatic on connect | `notification`, `unread-update`, `dm-received` |
| `channel:{channelId}` | User opens channel | `message:new`, `message:updated`, `message:deleted`, `typing:start`, `typing:stop`, `member:joined`, `member:left` |
| `thread:{threadId}` | User opens thread | `reply:new`, `reply:updated`, `reply:deleted`, `thread:resolved`, `thread:locked` |
| `workspace:{workspaceId}` | Automatic on connect | `channel:created`, `channel:archived`, `channel:updated` |
| `presence` | Automatic on connect | `user:online`, `user:offline`, `user:away` |

### 6.2 Connection Authentication

```
Client â†’ ChatApp Socket.IO handshake:
{
  auth: {
    userId: string,       // FlowTask User._id
    token: string,        // FlowTask JWT Bearer token
    workspaceId: string   // Workspace identifier
  }
}

Server verifies:
1. userId is present (required â€” disconnect if missing)
2. JWT token is verified via jwt.verify(token, JWT_SECRET)
3. Decoded token provides: { _id, role, department }
4. User existence verified in ChatApp database
5. Auto-join rooms: user:{userId}, workspace:{workspaceId}, presence
6. Role-based auto-joins: admin â†’ flowtask-admin channel room; manager â†’ flowtask-managers
```

### 6.3 Presence Tracking

```javascript
// Presence States
const PRESENCE_STATES = {
  ONLINE: 'online',       // Active connection, recent activity
  AWAY: 'away',           // Connected but idle > 5 minutes
  DND: 'dnd',             // Do Not Disturb (user-set)
  OFFLINE: 'offline'      // Disconnected
};

// Redis Hash: presence:{workspaceId}
// Field: userId â†’ JSON { status, lastSeen, socketId }

// Presence Update Flow:
// 1. On connect â†’ set ONLINE, broadcast to workspace room
// 2. On activity â†’ update lastSeen timestamp
// 3. After 5min idle â†’ set AWAY (server-side heartbeat check)
// 4. On disconnect â†’ set OFFLINE after 30s grace period (reconnection window)
// 5. Manual DND toggle â†’ set DND, suppress notifications
```

### 6.4 Typing Indicators

```javascript
// Client emits: throttled to once per 3 seconds
socket.emit('typing:start', { channelId, userId, userName });

// Server broadcasts to channel room (excluding sender):
io.to(`channel:${channelId}`).except(socket.id).emit('typing:start', {
  channelId, userId, userName, expiresAt: Date.now() + 5000
});

// Auto-clear after 5 seconds if no new typing event
// Client clears on message send
```

### 6.5 Read Receipts

```javascript
// When user reads messages in a channel:
socket.emit('messages:read', {
  channelId: string,
  lastReadMessageId: ObjectId,
  timestamp: ISO8601
});

// Server updates ReadReceipt collection and broadcasts:
io.to(`channel:${channelId}`).emit('read:update', {
  userId, channelId, lastReadMessageId, timestamp
});

// Unread count calculation:
// count = Messages.countDocuments({
//   channelId,
//   _id: { $gt: lastReadMessageId },
//   senderId: { $ne: userId }
// })
```

### 6.6 Reconnect Strategy

```
Connection Strategy:
  Transport: WebSocket primary, polling fallback
  Reconnection: enabled
  Reconnection attempts: Infinity
  Reconnection delay: 1000ms (initial)
  Reconnection delay max: 30000ms
  Randomization factor: 0.5
  Timeout: 20000ms

On Reconnect:
  1. Re-authenticate with stored token
  2. Re-join all previously subscribed rooms
  3. Fetch missed messages since last known message ID
  4. Reconcile unread counts
  5. Re-establish presence status
```

### 6.7 Offline Queue Behavior

```
When client is disconnected:
  1. Messages sent while offline are queued in IndexedDB (client-side)
  2. On reconnect, queued messages are sent in order
  3. Server validates each message and assigns server timestamps
  4. Optimistic IDs are replaced with server-generated IDs
  5. Client reconciles local state with server response

When server-side events occur while user is offline:
  1. Events are persisted in MongoDB (messages, notifications)
  2. Unread counts are maintained in Redis
  3. On user reconnect, client fetches delta since lastSeen
  4. Push notifications sent via FCM/APNs for critical events
```

---

## 7. Database Design

### 7.1 FlowTask Collections (MongoDB)

#### Users Collection

```javascript
{
  _id: ObjectId,
  name: { type: String, required: true, maxLength: 50 },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },  // bcrypt hashed
  role: { type: String, enum: ['admin', 'manager', 'hr', 'employee', 'custom'], default: 'employee' },
  customRole: { type: ObjectId, ref: 'Role' },
  department: [{ type: ObjectId, ref: 'Department' }],
  team: { type: ObjectId, ref: 'Team' },
  isVerified: { type: Boolean, default: false },
  profileImage: String,
  phone: String,
  designation: String,
  dateOfJoining: Date,
  address: { street: String, city: String, state: String, zipCode: String, country: String },
  settings: {
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    theme: { type: String, default: 'system' }
  },
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { email: 1 } unique, { role: 1 }, { department: 1 }, { isVerified: 1 }
```

#### Boards Collection

```javascript
{
  _id: ObjectId,
  name: { type: String, required: true, maxLength: 100 },
  description: String,
  department: { type: ObjectId, ref: 'Department', required: true },
  owner: { type: ObjectId, ref: 'User', required: true },
  members: [{ type: ObjectId, ref: 'User' }],
  status: { type: String, enum: ['planning', 'in-progress', 'completed', 'on-hold'], default: 'planning' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  startDate: Date,
  dueDate: Date,
  team: { type: ObjectId, ref: 'Team' },
  isArchived: { type: Boolean, default: false },
  tags: [String],
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { department: 1 }, { owner: 1 }, { members: 1 }, { status: 1 }, { isArchived: 1 }
```

#### Cards Collection

```javascript
{
  _id: ObjectId,
  title: { type: String, required: true, maxLength: 200 },
  description: String,
  board: { type: ObjectId, ref: 'Board', required: true },
  list: { type: ObjectId, ref: 'List', required: true },
  assignees: [{ type: ObjectId, ref: 'User' }],
  labels: [{ type: ObjectId, ref: 'Label' }],
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
  status: String,
  startDate: Date,
  dueDate: Date,
  position: Number,
  isArchived: { type: Boolean, default: false },
  loggedTime: [{ user: ObjectId, hours: Number, minutes: Number, description: String, date: Date, _id: ObjectId }],
  billedTime: [{ user: ObjectId, hours: Number, minutes: Number, description: String, date: Date, _id: ObjectId }],
  estimationTime: [{ hours: Number, minutes: Number, setBy: ObjectId, date: Date, _id: ObjectId }],
  createdBy: { type: ObjectId, ref: 'User' },
  createdFrom: { type: String, enum: ['calendar', 'project', 'board', 'slack', 'api'] },
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { board: 1 }, { list: 1, position: 1 }, { assignees: 1 }, { dueDate: 1 }, { isArchived: 1 }
```

#### Comments Collection

```javascript
{
  _id: ObjectId,
  text: { type: String, maxLength: 10000 },
  htmlContent: String,
  author: { type: ObjectId, ref: 'User', required: true },
  contextType: { type: String, enum: ['card', 'subtask', 'subtaskNano', 'announcement'], required: true },
  contextRef: { type: ObjectId, required: true },
  card: { type: ObjectId, ref: 'Card' },
  parentComment: { type: ObjectId, ref: 'Comment' },
  mentions: [{
    type: { type: String, enum: ['User', 'Role', 'Team'] },
    targetId: ObjectId,
    targetModel: String,
    name: String
  }],
  attachments: [{
    url: String,
    original_name: String,
    file_size: Number,
    mimetype: String
  }],
  isEdited: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  editHistory: [{ content: String, editedAt: Date }],
  reactions: [{ emoji: String, users: [ObjectId] }],
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { card: 1, createdAt: -1 }, { contextType: 1, contextRef: 1 }, { author: 1 }
```

#### Additional FlowTask Collections

| Collection | Key Fields | Indexes |
|---|---|---|
| `departments` | `name`, `managers[]`, `members[]`, `projects[]` | `{ name: 1 }` unique |
| `teams` | `name`, `department`, `members[]`, `lead` | `{ department: 1 }`, `{ name: 1 }` |
| `roles` | `name`, `permissions{}`, `isSystemRole`, `createdBy` | `{ name: 1 }` unique |
| `lists` | `title`, `board`, `position` | `{ board: 1, position: 1 }` |
| `labels` | `name`, `color`, `board` | `{ board: 1 }` |
| `announcements` | `title`, `description`, `category`, `subscribers{}`, `isPinned`, `expiresAt` | `{ createdAt: -1 }`, `{ expiresAt: 1 }` TTL |
| `subtasks` | `title`, `card`, `assignees[]`, `isCompleted`, `position` | `{ card: 1, position: 1 }` |
| `subtaskNanos` | `title`, `subtask`, `isCompleted`, `position` | `{ subtask: 1, position: 1 }` |
| `notifications` | `recipient`, `type`, `title`, `message`, `isRead`, `metadata` | `{ recipient: 1, isRead: 1, createdAt: -1 }` |
| `activities` | `entityType`, `entityId`, `action`, `performedBy`, `changes{}` | `{ entityId: 1, createdAt: -1 }`, TTL 90 days |
| `reminders` | `user`, `card`, `reminderDate`, `status`, `recurrence` | `{ user: 1, reminderDate: 1 }` |
| `recurringTasks` | `card`, `board`, `frequency`, `nextRunDate` | `{ nextRunDate: 1 }` |
| `attachments` | `card`, `fileName`, `originalName`, `mimeType`, `fileSize`, `url` | `{ card: 1 }` |
| `salesRows` | `columns{}`, `createdBy`, `department` | `{ department: 1 }` |
| `salesPermissions` | `user`, `moduleVisible`, `canCreate`, `canUpdate`, `canDelete` | `{ user: 1 }` unique |
| `financePages` | `name`, `status`, `createdBy`, `data` | `{ status: 1 }` |
| `versionHistories` | `entityType`, `entityId`, `version`, `snapshot`, `changedBy` | `{ entityType: 1, entityId: 1 }` |

### 7.2 ChatApp Collections (MongoDB)

#### Workspaces Collection

```javascript
{
  _id: ObjectId,
  name: { type: String, required: true },
  flowTaskOrgId: String,          // Maps to FlowTask organization
  settings: {
    messageRetentionDays: { type: Number, default: 365 },
    maxFileSize: { type: Number, default: 10485760 },  // 10MB
    allowedFileTypes: [String],
    defaultChannelNotification: { type: String, default: 'all' }
  },
  systemChannels: {
    general: ObjectId,
    admin: ObjectId,
    managers: ObjectId,
    announcements: ObjectId
  },
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { flowTaskOrgId: 1 } unique
```

#### Channels Collection

```javascript
{
  _id: ObjectId,
  name: { type: String, required: true, maxLength: 80 },
  slug: { type: String, required: true },
  description: String,
  topic: { type: String, maxLength: 250 },
  type: { type: String, enum: ['project', 'department', 'team', 'dm', 'group', 'system'], required: true },
  workspace: { type: ObjectId, ref: 'Workspace', required: true },
  flowTaskRef: String,             // Board._id / Department._id / Team._id
  flowTaskRefType: { type: String, enum: ['board', 'department', 'team', null] },
  members: [{ type: ObjectId, ref: 'ChatUser' }],
  admins: [{ type: ObjectId, ref: 'ChatUser' }],
  createdBy: { type: ObjectId, ref: 'ChatUser' },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  isArchived: { type: Boolean, default: false },
  archivedAt: Date,
  archivedBy: { type: ObjectId, ref: 'ChatUser' },
  pinnedMessages: [{ type: ObjectId, ref: 'Message' }],
  lastMessage: { type: ObjectId, ref: 'Message' },
  lastActivity: Date,
  metadata: {
    projectStatus: String,
    projectPriority: String,
    departmentId: String
  },
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { workspace: 1, slug: 1 } unique, { flowTaskRef: 1 }, { members: 1 },
//          { type: 1 }, { isArchived: 1 }, { lastActivity: -1 }
```

#### Messages Collection

```javascript
{
  _id: ObjectId,
  channel: { type: ObjectId, ref: 'Channel', required: true },
  sender: { type: ObjectId, ref: 'ChatUser', required: true },
  content: { type: String, maxLength: 40000 },
  htmlContent: String,
  type: { type: String, enum: ['text', 'system', 'bot', 'announcement', 'task-action'], default: 'text' },
  thread: { type: ObjectId, ref: 'Thread' },
  parentMessage: { type: ObjectId, ref: 'Message' },
  replyCount: { type: Number, default: 0 },
  mentions: [{
    type: { type: String, enum: ['user', 'role', 'team', 'channel', 'everyone'] },
    targetId: String,
    name: String
  }],
  attachments: [{
    fileName: String,
    originalName: String,
    mimeType: String,
    fileSize: Number,
    url: String,
    thumbnailUrl: String,
    source: { type: String, enum: ['upload', 'flowtask'], default: 'upload' },
    flowTaskAttachmentId: String
  }],
  reactions: [{
    emoji: String,
    users: [{ type: ObjectId, ref: 'ChatUser' }],
    count: Number
  }],
  isPinned: { type: Boolean, default: false },
  pinnedAt: Date,
  pinnedBy: { type: ObjectId, ref: 'ChatUser' },
  isEdited: { type: Boolean, default: false },
  editedAt: Date,
  editHistory: [{ content: String, editedAt: Date }],
  isDeleted: { type: Boolean, default: false },  // Soft delete
  deletedAt: Date,
  deletedBy: { type: ObjectId, ref: 'ChatUser' },
  flowTaskCommentId: String,       // Links to FlowTask Comment._id
  flowTaskTaskId: String,          // Links to FlowTask Card._id
  metadata: {
    taskAction: String,            // 'status_change', 'time_logged', etc.
    taskData: Object               // Structured task data for action buttons
  },
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { channel: 1, createdAt: -1 }, { thread: 1, createdAt: 1 },
//          { sender: 1 }, { isPinned: 1 }, { isDeleted: 1 },
//          { flowTaskCommentId: 1 }, { flowTaskTaskId: 1 },
//          { content: 'text' } (text search index)
```

#### Threads Collection

```javascript
{
  _id: ObjectId,
  channel: { type: ObjectId, ref: 'Channel', required: true },
  rootMessage: { type: ObjectId, ref: 'Message', required: true },
  taskId: String,                  // FlowTask Card._id (if task-linked)
  title: String,
  participants: [{ type: ObjectId, ref: 'ChatUser' }],
  replyCount: { type: Number, default: 0 },
  lastReply: { type: ObjectId, ref: 'Message' },
  lastReplyAt: Date,
  isLocked: { type: Boolean, default: false },
  lockedAt: Date,
  lockedBy: { type: ObjectId, ref: 'ChatUser' },
  isResolved: { type: Boolean, default: false },
  resolvedAt: Date,
  resolvedBy: { type: ObjectId, ref: 'ChatUser' },
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { channel: 1 }, { taskId: 1 } unique sparse, { lastReplyAt: -1 }
```

#### Additional ChatApp Collections

| Collection | Key Fields | Purpose | Indexes |
|---|---|---|---|
| `chatUsers` | `flowTaskUserId`, `name`, `email`, `avatar`, `role`, `status`, `preferences` | User profiles synced from FlowTask | `{ flowTaskUserId: 1 }` unique |
| `readReceipts` | `userId`, `channelId`, `lastReadMessageId`, `lastReadAt` | Per-user per-channel read state | `{ userId: 1, channelId: 1 }` unique |
| `chatUploads` | `channelId`, `uploadedBy`, `fileName`, `originalName`, `mimeType`, `fileSize`, `url` | File upload metadata | `{ channelId: 1 }` |
| `webhookEvents` | `deliveryId`, `eventName`, `status`, `receivedAt`, `processedAt`, `attempts`, `lastError` | Idempotency tracking | `{ deliveryId: 1 }` unique, `{ receivedAt: 1 }` TTL 7d |
| `channelMembers` | `channelId`, `userId`, `role`, `joinedAt`, `notificationPreference`, `isMuted` | Channel membership details | `{ channelId: 1, userId: 1 }` unique |
| `auditLogs` | `action`, `actor`, `target`, `details`, `ipAddress`, `timestamp` | Security audit trail | `{ timestamp: -1 }`, `{ actor: 1 }` |
| `notifications` (Chat) | `userId`, `type`, `title`, `body`, `channelId`, `messageId`, `isRead`, `priority` | Chat notification queue | `{ userId: 1, isRead: 1, createdAt: -1 }` |
| `scheduledMessages` | `channelId`, `senderId`, `content`, `scheduledFor`, `status` | Scheduled message queue | `{ scheduledFor: 1, status: 1 }` |
| `messageBookmarks` | `userId`, `messageId`, `channelId`, `note` | User message bookmarks | `{ userId: 1, createdAt: -1 }` |

### 7.3 Database Strategies

| Strategy | Implementation |
|---|---|
| **Indexing** | Compound indexes on frequent query patterns; text index on `Messages.content` for search |
| **Unique Constraints** | `Users.email`, `Channels.{workspace, slug}`, `WebhookEvents.deliveryId`, `ChatUsers.flowTaskUserId` |
| **TTL Indexes** | `Activities`: 90 days; `WebhookEvents`: 7 days; `Announcements.expiresAt`: auto-expire |
| **Soft Delete** | Messages use `isDeleted` flag (preserve thread integrity); Channels use `isArchived` flag |
| **Pagination** | Cursor-based using `_id` for messages (infinite scroll); offset-based for admin lists |
| **Sharding Key** | `channelId` for Messages collection (high-volume); `workspace` for multi-tenant |

---

## 8. API Specification

### 8.1 FlowTask API Endpoints

#### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | User registration |
| `POST` | `/api/auth/login` | Public | Login, returns JWT |
| `GET` | `/api/auth/me` | Bearer | Current user profile |
| `GET` | `/api/auth/verify` | Bearer | Verify token validity |
| `POST` | `/api/auth/refresh` | Bearer | Refresh JWT token |
| `POST` | `/api/auth/admin-create-user` | Bearer + admin | Admin creates user |

#### Projects (Boards)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/boards` | Bearer | List user's boards |
| `GET` | `/api/boards/:id` | Bearer | Get board details |
| `GET` | `/api/boards/department/:departmentId` | Bearer | Boards by department |
| `GET` | `/api/boards/:id/workflow-complete` | Bearer | Full board + lists + cards |
| `GET` | `/api/boards/:id/activity` | Bearer | Project activity log |
| `POST` | `/api/boards` | Bearer | Create board |
| `PUT` | `/api/boards/:id` | Bearer | Update board |
| `DELETE` | `/api/boards/:id` | Bearer | Delete board |

#### Tasks (Cards)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/cards/list/:listId` | Bearer | Cards in a list (paginated) |
| `GET` | `/api/cards/board/:boardId` | Bearer | Cards in a board (paginated) |
| `GET` | `/api/cards/department/:departmentId` | Bearer | Cards by department |
| `GET` | `/api/cards/:id` | Bearer | Get card details |
| `GET` | `/api/cards/:id/activity` | Bearer | Card activity log |
| `POST` | `/api/cards` | Bearer | Create card |
| `PUT` | `/api/cards/:id` | Bearer | Update card |
| `PUT` | `/api/cards/:id/move` | Bearer | Move card between lists |
| `PUT` | `/api/cards/:id/archive` | Bearer | Archive card |
| `PUT` | `/api/cards/:id/restore` | Bearer | Restore archived card |
| `DELETE` | `/api/cards/:id` | Bearer | Delete card |
| `POST` | `/api/cards/:id/time-tracking` | Bearer | Add time entry |
| `PUT` | `/api/cards/:id/time-tracking/:entryId` | Bearer | Update time entry |
| `DELETE` | `/api/cards/:id/time-tracking/:entryId` | Bearer | Delete time entry |

#### Users, Departments, Announcements, Comments, Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users` | Bearer + hr/admin | List all users |
| `GET` | `/api/users/verified` | Bearer + hr/admin | List verified users |
| `GET` | `/api/users/:id` | Bearer | Get user profile |
| `PUT` | `/api/users/:id` | Bearer + owner/admin | Update user |
| `PUT` | `/api/users/:id/verify` | Bearer + admin | Verify user |
| `PUT` | `/api/users/:id/assign` | Bearer + mgr/hr/admin | Assign to dept/team |
| `DELETE` | `/api/users/:id` | Bearer + admin | Delete user |
| `GET/POST/PUT/DELETE` | `/api/departments/*` | Bearer + scoped | Department CRUD |
| `GET/POST/PUT/DELETE` | `/api/announcements/*` | Bearer + scoped | Announcement CRUD |
| `GET/POST/PUT/DELETE` | `/api/comments/*` | Bearer + scoped | Comment CRUD |
| `GET/PUT` | `/api/notifications/*` | Bearer | Notification management |

#### New APIs Required for Integration

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/webhooks/register` | Bearer + admin | Register webhook endpoint |
| `GET` | `/api/webhooks/deliveries` | Bearer + admin | List recent webhook deliveries |
| `POST` | `/api/integrations/retry/:deliveryId` | Bearer + admin | Retry failed webhook |
| `GET` | `/api/integrations/health` | Bearer + admin | Integration health check |
| `GET` | `/api/events/replay` | Bearer + admin | Replay events from time range |
| `GET` | `/api/audit-log` | Bearer + admin | Organization audit log |
| `GET` | `/api/users/:id/permissions` | Bearer | Get computed permissions |
| `GET` | `/api/activity-feed` | Bearer | Unified activity feed |

### 8.2 ChatApp API Endpoints

#### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat/auth/sync` | FlowTask JWT | Sync user from FlowTask |
| `GET` | `/api/chat/auth/me` | Bearer | Get chat user profile |
| `PUT` | `/api/chat/auth/preferences` | Bearer | Update preferences |

#### Channels

| Method | Path | Auth | Description | Permission |
|---|---|---|---|---|
| `GET` | `/api/chat/channels` | Bearer | List user's channels | Authenticated |
| `GET` | `/api/chat/channels/:id` | Bearer | Get channel details | Channel member |
| `GET` | `/api/chat/channels/slug/:slug` | Bearer | Get channel by slug | Channel member |
| `POST` | `/api/chat/channels` | Bearer | Create channel | `canCreateProject` or admin |
| `PUT` | `/api/chat/channels/:id` | Bearer | Update channel | Channel admin |
| `POST` | `/api/chat/channels/:id/archive` | Bearer | Archive channel | Channel admin or system |
| `POST` | `/api/chat/channels/dm` | Bearer | Create DM | Authenticated |
| `POST` | `/api/chat/channels/:id/members` | Bearer | Add member | Channel admin |
| `DELETE` | `/api/chat/channels/:id/members/:userId` | Bearer | Remove member | Channel admin |
| `POST` | `/api/chat/channels/:id/leave` | Bearer | Leave channel | Channel member |
| `GET` | `/api/chat/channels/search` | Bearer | Search channels | Authenticated |
| `GET` | `/api/chat/channels/:id/members` | Bearer | List members | Channel member |

#### Messages

| Method | Path | Auth | Description | Permission |
|---|---|---|---|---|
| `GET` | `/api/chat/channels/:channelId/messages` | Bearer | List messages (cursor pagination) | Channel member |
| `POST` | `/api/chat/channels/:channelId/messages` | Bearer | Send message | Channel member |
| `POST` | `/api/chat/channels/:channelId/upload` | Bearer | Upload files | Channel member |
| `GET` | `/api/chat/channels/:channelId/pins` | Bearer | List pinned messages | Channel member |
| `GET` | `/api/chat/messages/:id` | Bearer | Get single message | `requireMessageAccess` |
| `PUT` | `/api/chat/messages/:id` | Bearer | Edit message | Message author |
| `DELETE` | `/api/chat/messages/:id` | Bearer | Delete message | Author or admin |
| `POST` | `/api/chat/messages/:id/reactions` | Bearer | Add reaction | Channel member |
| `DELETE` | `/api/chat/messages/:id/reactions/:emoji` | Bearer | Remove reaction | Reaction owner |
| `POST` | `/api/chat/messages/:id/pin` | Bearer | Pin message | Channel admin |
| `DELETE` | `/api/chat/messages/:id/pin` | Bearer | Unpin message | Channel admin |
| `GET` | `/api/chat/messages/search` | Bearer | Search messages | Scoped to user's channels |

#### Threads

| Method | Path | Auth | Description | Permission |
|---|---|---|---|---|
| `POST` | `/api/chat/threads` | Bearer | Create thread | Channel member |
| `GET` | `/api/chat/threads/:id` | Bearer | Get thread | Thread participant |
| `GET` | `/api/chat/threads/:id/replies` | Bearer | List replies (paginated) | Thread participant |
| `GET` | `/api/chat/threads/task/:taskId` | Bearer | Get thread by task ID | Task assignee/member |
| `GET` | `/api/chat/channels/:channelId/threads` | Bearer | List channel threads | Channel member |
| `GET` | `/api/chat/threads/my` | Bearer | User's active threads | Authenticated |
| `POST` | `/api/chat/threads/:id/lock` | Bearer | Lock thread | Channel admin |
| `POST` | `/api/chat/threads/:id/resolve` | Bearer | Resolve thread | Thread participant |
| `PUT` | `/api/chat/threads/:id/title` | Bearer | Update thread title | Thread creator or admin |

#### Webhooks, Bot & Utilities

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat/webhooks/flowtask` | HMAC signature | FlowTask webhook receiver |
| `POST` | `/api/chat/bot/command` | Bearer | Execute bot command |
| `GET` | `/api/chat/unread` | Bearer | Get unread counts |
| `POST` | `/api/chat/channels/:channelId/read` | Bearer | Mark channel as read |

#### New APIs Required for Slack-Level Features

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat/messages/:id/bookmark` | Bearer | Bookmark a message |
| `GET` | `/api/chat/bookmarks` | Bearer | List bookmarked messages |
| `POST` | `/api/chat/messages/schedule` | Bearer | Schedule a message |
| `GET` | `/api/chat/messages/scheduled` | Bearer | List scheduled messages |
| `DELETE` | `/api/chat/messages/scheduled/:id` | Bearer | Cancel scheduled message |
| `POST` | `/api/chat/channels/:id/mute` | Bearer | Mute channel notifications |
| `GET` | `/api/chat/activity-timeline` | Bearer | Cross-channel activity feed |
| `GET` | `/api/chat/admin/audit-log` | Bearer + admin | Chat audit log |
| `POST` | `/api/chat/admin/retention` | Bearer + admin | Configure message retention |
| `GET` | `/api/chat/admin/analytics` | Bearer + admin | Chat usage analytics |
| `POST` | `/api/chat/channels/:id/topic` | Bearer | Update channel topic |
| `GET` | `/api/chat/mentions` | Bearer | List user's mentions |

### 8.3 Error Response Schema

```json
{
  "success": false,
  "error": {
    "code": "CHANNEL_NOT_FOUND",
    "message": "The requested channel does not exist or you do not have access.",
    "status": 404,
    "details": {}
  },
  "requestId": "req_abc123"
}
```

| HTTP Status | Error Code | Description |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid request body/params |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Duplicate resource |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | Dependency down |

---

## 9. Required Changes in FlowTask

### 9.1 New Services to Add

| Service | Location | Purpose |
|---|---|---|
| **WebhookEmitterService** | `backend/services/webhookEmitter.js` | Centralized webhook dispatch with HMAC signing, retry logic, and DLQ |
| **EventBusService** | `backend/services/eventBus.js` | Unified internal event bus (EventEmitter + Redis pub/sub) |
| **ChangeDiffGenerator** | `backend/utils/changeDiff.js` | Generates structured change diffs for `data.changes` payloads |
| **EventReplayService** | `backend/services/eventReplay.js` | Replays events from audit log for disaster recovery |
| **WebhookRegistryService** | `backend/services/webhookRegistry.js` | Manages registered webhook endpoints |
| **IntegrationHealthService** | `backend/services/integrationHealth.js` | Monitors webhook delivery success rates |

### 9.2 Controller Modifications

| Controller | Modification | Details |
|---|---|---|
| `boardController.js` | Add webhook emission | Emit `PROJECT_CREATED/UPDATED/DELETED/MEMBER_*` after successful DB operations |
| `cardController.js` | Add webhook emission | Emit `TASK_*` events with structured change diffs |
| `commentController.js` | Add webhook emission | Emit `TASK_COMMENT_ADDED/UPDATED/DELETED` |
| `authController.js` | Add webhook emission | Emit `USER_REGISTERED` on successful registration |
| `userController.js` | Add webhook emission | Emit `USER_VERIFIED/UPDATED/DEACTIVATED` |
| `announcementController.js` | Add webhook emission | Emit `ANNOUNCEMENT_CREATED/UPDATED/DELETED` |
| `departmentController` | Add webhook emission | Emit `DEPARTMENT_CREATED/UPDATED/DELETED` |
| `teamController` | Add webhook emission | Emit `TEAM_CREATED/UPDATED/DELETED` |

### 9.3 New Database Collections

| Collection | Purpose |
|---|---|
| `webhookEndpoints` | Registered webhook URLs with secrets and event subscriptions |
| `webhookDeliveries` | Log of all webhook deliveries (attempts, status, response codes) |
| `eventReplayLog` | Ordered log of all domain events for replay capability |
| `integrationConfig` | Integration configuration (secrets, endpoints, feature flags) |

### 9.4 Infrastructure Changes

| Change | Details |
|---|---|
| **Redis Integration** | Add Redis for: event bus pub/sub, webhook rate limiting, caching user permissions |
| **BullMQ Workers** | Queue workers for: webhook delivery, event replay, reconciliation, scheduled tasks |
| **Health Endpoint Enhancement** | Add `/api/health/integrations` with webhook delivery stats |
| **Audit Log Enhancement** | Extend Activity model with `eventEmitted`, `webhookDeliveryId` fields |
| **Rate Limiting** | Add per-endpoint rate limits: 100 req/min general, 1000 req/min for webhooks |

---

## 10. Required Changes in ChatApp

### 10.1 New Services to Add

| Service | Location | Purpose |
|---|---|---|
| **ChannelProvisioningService** | `server/services/channelProvisioning.js` | Auto-create channels from FlowTask events (project, dept, team) |
| **ThreadAutoCreationService** | `server/services/threadAutoCreation.js` | Auto-create threads for tasks, link to `Card._id` |
| **RBACSyncService** | `server/services/rbacSync.js` | Sync roles/permissions from FlowTask JWT + API |
| **MentionResolutionService** | `server/services/mentionResolver.js` | Resolve `@User`, `@Role`, `@Team` mentions to chat users |
| **EventDeduplicationService** | `server/services/eventDedup.js` | Deduplicate webhook events using `WebhookEvents` collection |
| **ReconciliationService** | `server/services/reconciliation.js` | Scheduled sync to correct drift between FlowTask and ChatApp |
| **MessageRetentionService** | `server/services/messageRetention.js` | Enforce configurable message retention policies |
| **SearchService** | `server/services/searchService.js` | Full-text message search with filters and access scoping |
| **NotificationService** | `server/services/notificationService.js` | Smart notification routing with priority and DND awareness |
| **ScheduledMessageService** | `server/services/scheduledMessages.js` | Queue and deliver scheduled messages |

### 10.2 Webhook Handler Enhancements

| Handler | Current Status | Required Enhancement |
|---|---|---|
| `projectEventHandler.js` | ✅ Implemented | Add: `PROJECT_MEMBER_ASSIGNED` bulk handling, channel rename on project update |
| `taskEventHandler.js` | ✅ Implemented | Add: `TASK_ASSIGNEE_CHANGED`, `TASK_OVERDUE`, `TASK_DUE_SOON`, task action buttons |
| `userEventHandler.js` | ✅ Implemented | Add: `USER_UPDATED` (role change → channel access update), `USER_DEACTIVATED` |
| `announcementEventHandler.js` | ✅ Implemented | Add: `ANNOUNCEMENT_UPDATED`, `ANNOUNCEMENT_DELETED` |
| (new) `departmentEventHandler.js` | ❌ Missing | Handle: `DEPARTMENT_CREATED/UPDATED/DELETED` → channel lifecycle |
| (new) `teamEventHandler.js` | ❌ Missing | Handle: `TEAM_CREATED/UPDATED/DELETED` → channel lifecycle |
| (new) `subtaskEventHandler.js` | ❌ Missing | Handle: `SUBTASK_UPDATED` → thread sub-items |
| (new) `attachmentEventHandler.js` | ❌ Missing | Handle: `ATTACHMENT_ADDED/DELETED` → file sync |
```

### 10.3 Security Enhancements

| Enhancement | Details |
|---|---|
| **Cross-Workspace Isolation** | All queries must include `workspaceId` filter; middleware enforcement |
| **Role-Based Message Visibility** | System channels (`#flowtask-admin`, `#flowtask-managers`) enforce role checks on every message read |
| **RBAC Cache** | Redis cache for user permissions with 5-minute TTL; invalidate on `USER_UPDATED` |
| **File Upload Scanning** | Integrate ClamAV for malware scanning on upload |
| **Content Security** | Sanitize HTML content in messages; prevent XSS via DOMPurify |
| **Audit Trail** | Log all admin actions, message deletions, channel modifications |

### 10.4 Architecture Changes

| Change | Details |
|---|---|
| **Module Structure** | Add: `departmentEvents`, `teamEvents`, `subtaskEvents`, `attachmentEvents` modules |
| **Worker Architecture** | Add BullMQ workers for: scheduled messages, reconciliation, notification digests |
| **Redis Integration** | Use for: presence tracking, typing indicators, unread counts, RBAC cache, rate limiting |
| **Database Optimization** | Add compound indexes; implement virtual scrolling queries; message archival pipeline |

---

## 11. Slack-Level Feature Enhancements

### 11.1 Thread-First Architecture

| Feature | Implementation |
|---|---|
| **Every task becomes a thread** | On `TASK_CREATED` → auto-create Thread with `taskId` link |
| **Thread sidebar** | Dedicated UI panel showing user's active threads across channels |
| **Thread following** | Users can follow/unfollow threads; notifications scoped accordingly |
| **Thread resolution** | Mark threads as resolved; visual indicator + optional auto-archive |
| **Thread locking** | On `TASK_DELETED` → lock thread; prevent new replies |

### 11.2 Channel Intelligence

| Feature | Implementation |
|---|---|
| **Channel topic auto-sync** | On `PROJECT_UPDATED` → update channel topic from project description |
| **Channel status badge** | Show project status (planning / in-progress / completed) as channel badge |
| **Channel archiving** | On `PROJECT_DELETED` → archive channel; preserve history; remove from nav |
| **Smart channel suggestions** | Suggest channels based on user's department, team, and assigned projects |

### 11.3 Message Enhancements

| Feature | Implementation |
|---|---|
| **Message pinning** | Pin/unpin with `POST/DELETE /api/chat/messages/:id/pin`; pinned list per channel |
| **Message bookmarks** | Personal bookmarks with optional notes |
| **Message editing** | Edit with history tracking; "edited" indicator; 15-minute edit window |
| **Emoji reactions** | Full emoji picker; reaction counts; animated reaction feedback |
| **Scheduled messages** | Schedule via `POST /api/chat/messages/schedule`; BullMQ delayed job |
| **Rich message formatting** | Markdown support; code blocks; inline task references; link previews |
| **Task action buttons** | Inline buttons: "Mark Complete", "Log Time", "Change Priority" |
| **Inline task editing** | Edit task title, status, priority directly from chat message |

### 11.4 Notification Intelligence

| Feature | Implementation |
|---|---|
| **Priority-based alerts** | Critical > High > Medium > Low; DND respects critical only |
| **Smart notifications** | Debounce rapid updates (30s window); group similar notifications |
| **Notification preferences** | Per-channel: all / mentions / nothing; global DND schedule |
| **Role mentions** | `@admin`, `@managers`, `@hr` → notify all users with that role |
| **Reminder bot** | `/flowtask remind #channel "message" in 2h` → scheduled notification |
| **Activity timeline** | Cross-channel activity feed with filters (by project, type, user) |

### 11.5 Search & Discovery

| Feature | Implementation |
|---|---|
| **Full-text search** | MongoDB text index on `Messages.content`; result highlighting |
| **Search filters** | By: channel, sender, date range, has:attachment, has:reaction, is:pinned |
| **Search scoping** | Results filtered to user's accessible channels only |
| **Message links** | Deep links to specific messages with context loading |

### 11.6 Administrative Features

| Feature | Implementation |
|---|---|
| **Audit log viewer** | Searchable log of all admin actions, message deletions, access changes |
| **Message retention policy** | Configurable per-workspace: 30/90/180/365 days / unlimited |
| **Channel analytics** | Message volume, active users, response times per channel |
| **Moderation tools** | Delete messages, mute users, restrict file uploads per channel |
| **User activity reports** | Login frequency, message counts, active hours |


---

## 12. RBAC & Security Model

### 12.1 JWT Trust Chain

```
┌───────────────┐     Login      ┌───────────────┐
│   FlowTask    │ ◄───────────── │     User      │
│    Auth API   │ ─────────────► │   (Browser)   │
│               │   JWT Token    │               │
└───────┬───────┘                └───────┬───────┘
        │                                │
        │   Same JWT                     │   Same JWT
        │                                │
        ▼                                ▼
┌───────────────┐                ┌───────────────┐
│   FlowTask    │                │    ChatApp    │
│    Backend    │                │    Backend    │
│   (verify)    │                │ (verify same  │
│               │                │    secret)    │
└───────────────┘                └───────────────┘

JWT Payload:
{
  "id": "ObjectId — User._id",
  "role": "admin | manager | hr | employee | custom",
  "department": ["ObjectId — Department._id[]"],
  "iat": 1738800000,
  "exp": 1739404800
  // 7-day TTL
}
```

**Trust Rules:**
1. Both FlowTask and ChatApp use the **same `JWT_SECRET`** to verify tokens.
2. Token issued by FlowTask is accepted by ChatApp without re-authentication.
3. ChatApp caches decoded token claims with a 5-minute TTL in Redis.
4. Token refresh is handled by FlowTask only; ChatApp does not issue tokens.
5. On token expiry, ChatApp Socket.IO disconnects the user; client must re-authenticate.

### 12.2 Role Hierarchy

```
admin (Level 4 — God Mode)
  ├── Full system access
  ├── All channels visible
  ├── Can manage all users, roles, departments
  ├── Receives all bot notifications
  └── Can override any permission
      │
manager (Level 3 — Department Scope)
  ├── Department-scoped access
  ├── Can create projects, tasks, announcements
  ├── Can assign members within department
  ├── Can delete tasks/projects in department
  ├── Accesses #flowtask-managers channel
  └── Receives department-scoped notifications
      │
hr (Level 2.5 — Organizational Scope)
  ├── Can create departments
  ├── Can create tasks, announcements
  ├── Can assign members
  └── Accesses HR-specific channels
      │
employee (Level 1 — Task Scope)
  ├── Can create tasks and reminders
  ├── Access only to assigned project channels
  ├── Task-level notifications only
  └── No administrative capabilities
      │
custom (Variable — Permission-Based)
  └── Evaluate each permission flag from Role.permissions{}
      Default deny; explicit grant required
```

### 12.3 Granular Permission Flags

| Permission Flag | Default (employee) | Chat App Implication |
|---|---|---|
| `canCreateDepartment` | `false` | Can trigger department channel creation |
| `canCreateTask` | `true` | Can create task threads in project channels |
| `canCreateProject` | `false` | Can trigger project channel creation |
| `canCreateAnnouncement` | `false` | Can post to announcement channels |
| `canCreateReminder` | `true` | Can use reminder bot commands |
| `canAssignMembers` | `false` | Can add members to channels |
| `canDeleteTasks` | `false` | Can lock/archive task threads |
| `canDeleteProjects` | `false` | Can archive project channels |
| `canManageRoles` | `false` | Can modify channel permission groups |
| `canManageUsers` | `false` | Can deactivate chat users |
| `canManageSystem` | `false` | Full chat admin access |

### 12.4 Sales Module Access (Special Case)

| Permission | Chat Implication |
|---|---|
| `moduleVisible === true` | User receives sales bot notifications |
| `moduleVisible === false` | Sales notifications completely hidden |
| `canViewActivityLog === true` | Can search sales-related messages |

**Rule:** Sales-related bot notifications are **only** delivered to users where `SalesPermission.moduleVisible === true`.

### 12.5 Channel-Level Permission Override

| Override | Description |
|---|---|
| **Channel Admin** | Channel creator + FlowTask project owner; can pin, delete messages, manage members |
| **System Channel Lock** | `#flowtask-admin`, `#flowtask-managers` â€” membership managed exclusively by role; no manual add/remove |
| **Archived Channel** | Read-only; no new messages; search still works |
| **Locked Thread** | No new replies; existing content preserved |
| **DM Privacy** | Only two participants; cannot be joined by others; admin cannot read without audit log entry |

### 12.6 Security Controls

| Control | Implementation |
|---|---|
| **HMAC Webhook Verification** | SHA-256 HMAC on raw JSON body; reject invalid signatures |
| **Replay Attack Protection** | Reject events with `X-FlowTask-Timestamp` older than 5 minutes |
| **Event Deduplication** | `WebhookEvents` collection with `deliveryId` unique index |
| **Rate Limiting** | Per-IP: 100 req/min API; per-user: 60 messages/min; webhook: 1000 req/min |
| **Payload Size Limits** | API: 1 MB; Webhook: 256 KB; File Upload: 10 MB |
| **File Upload Scanning** | MIME type whitelist; future: ClamAV integration |
| **Content Sanitization** | DOMPurify for HTML content; prevent XSS in messages |
| **CORS** | Strict origin whitelist via `CORS_ORIGINS` environment variable |
| **Data Isolation** | All queries include workspace/organization scope; no cross-tenant data access |
| **Audit Trail** | All admin actions, message deletions, permission changes logged to `auditLogs` |

---

## 13. Performance & Scaling

### 13.1 Horizontal Scaling Strategy

```
                    ┌─────────────────────┐
                    │    Load Balancer    │
                    │   (Sticky Sessions  │
                    │    for Socket.IO)   │
                    └───────┬───────┬─────┘
                            │       │
              ┌─────────────▼┐  ┌───▼─────────┐  ┌─────────────▼┐
              │    App #1    │  │    App #2   │  │    App #3    │
              │   (API +     │  │   (API +    │  │   (API +     │
              │   Socket)    │  │   Socket)   │  │   Socket)    │
              └───────┬──────┘  └──────┬──────┘  └──────┬──────┘
                      │                │                │
              ┌───────▼────────────────▼────────────────▼───────┐
              │           Redis (Pub/Sub Adapter)               │
              │     Socket.IO cross-instance synchronization    │
              │        Session store / Cache / Rate Limit       │
              └───────────────────────┬─────────────────────────┘
                                      │
              ┌───────────────────────▼─────────────────────────┐
              │             MongoDB Atlas Cluster               │
              │            Primary + Read Replicas              │
              └─────────────────────────────────────────────────┘
```

### 13.2 Redis Caching Strategy

| Cache Key Pattern | TTL | Purpose |
|---|---|---|
| `user:permissions:{userId}` | 5 min | Cached RBAC permissions from FlowTask |
| `channel:members:{channelId}` | 10 min | Channel membership list |
| `presence:{workspaceId}` | Real-time | Hash of online/away/DND user statuses |
| `unread:{userId}:{channelId}` | Real-time | Unread message count per channel |
| `typing:{channelId}` | 5 sec | Active typing indicator users |
| `ratelimit:{ip}` | 1 min | Sliding window rate limit counter |
| `webhook:circuit:{endpoint}` | Dynamic | Circuit breaker state |

### 13.3 Read Replicas

| Query Type | Target | Rationale |
|---|---|---|
| Message listing | Read replica | High-volume read; eventual consistency acceptable |
| Channel listing | Read replica | Infrequent updates |
| Search queries | Read replica | CPU-intensive text search |
| Message sending | Primary | Write operation; immediate consistency |
| Webhook processing | Primary | Write + read consistency required |
| User authentication | Primary | Security-critical |

### 13.4 Queue Architecture (BullMQ / Redis)

| Queue Name | Concurrency | Purpose |
|---|---|---|
| `webhook-delivery` | 10 | Outbound FlowTask â†’ ChatApp webhook delivery |
| `webhook-retry` | 5 | Retry failed webhook deliveries |
| `webhook-dlq` | 1 | Dead-letter queue processing |
| `scheduled-messages` | 5 | Deliver scheduled messages at target time |
| `notification-digest` | 3 | Batch notifications into digests |
| `reconciliation` | 1 | Scheduled data reconciliation jobs |
| `file-processing` | 3 | Thumbnail generation, virus scanning |
| `email-notification` | 5 | Email delivery for critical notifications |
| `event-replay` | 1 | Manual event replay processing |

### 13.5 Message Pagination Strategy

```javascript
// Cursor-based pagination for infinite scroll
// GET /api/chat/channels/:channelId/messages?before=<messageId>&limit=50

const messages = await Message.find({
  channel: channelId,
  isDeleted: false,
  ...(before && { _id: { $lt: new ObjectId(before) } })
})
.sort({ _id: -1 })
.limit(limit + 1)  // Fetch one extra to determine hasMore
.populate('sender', 'name avatar')
.lean();

const hasMore = messages.length > limit;
if (hasMore) messages.pop();

return { messages: messages.reverse(), hasMore, cursor: messages[0]?._id };
```

### 13.6 Performance Targets

| Metric | Target | Measurement |
|---|---|---|
| API Response Time (p95) | < 200ms | Application-level latency |
| Socket.IO Event Delivery | < 100ms | Server emit to client receive |
| Webhook Delivery (p95) | < 2s | End-to-end including network |
| Message Search (p95) | < 500ms | Full-text search query |
| Time to First Message | < 300ms | Channel open to first message render |
| Concurrent WebSocket Connections | 10,000+ | Per server instance with Redis adapter |
| Message Throughput | 5,000 msg/min | Sustained write throughput |

---

## 14. Failure Handling & Recovery

### 14.1 Failure Scenarios Matrix

| Scenario | Detection | Immediate Action | Recovery |
|---|---|---|---|
| **Webhook delivery fails** | HTTP non-2xx or timeout | Retry with exponential backoff (5 attempts) | DLQ + admin alert + manual retry endpoint |
| **ChatApp is completely down** | All webhook attempts fail | Events queued in FlowTask's DLQ | On recovery: replay events from DLQ; reconciliation job |
| **FlowTask is completely down** | ChatApp health check fails | ChatApp operates independently for chat | Circuit breaker opens; cached permissions used; reconciliation on recovery |
| **MongoDB primary fails** | Connection error | Read replica promotion (Atlas automatic) | Automatic failover; brief write unavailability |
| **Redis fails** | Connection error | Degrade gracefully: no caching, no presence | Reconnect with backoff; rebuild cache on recovery |
| **Socket.IO disconnection** | Client heartbeat timeout | Client auto-reconnect with backoff | Re-join rooms; fetch missed messages since last ID |
| **Duplicate events received** | `deliveryId` exists in `WebhookEvents` | Return 200 immediately; skip processing | No action needed â€” idempotent by design |
| **Out-of-order events** | Entity doesn't exist for update | Queue update; wait 60s for creation event | Process if creation arrives; discard with warning if timeout |
| **Rate limit exceeded** | HTTP 429 response | Respect `Retry-After` header | Exponential backoff starting at 1s |
| **Malformed webhook payload** | Validation error | Return 400; log error | Alert admin; do not retry (client error) |

### 14.2 Circuit Breaker Pattern

```
States:
  CLOSED (normal)     → track failure count
  OPEN (tripped)      → reject all calls for cooldown
  HALF-OPEN (testing) → allow single probe request

Thresholds:
  - Open after: 5 consecutive failures OR > 50% failure rate in 60s window
  - Cooldown period: 30 seconds
  - Half-open probe: GET /api/health (FlowTask) or GET /api/chat/auth/me (ChatApp)
  - Close after: 2 consecutive successful probes

Implementation: Redis key webhook:circuit:{endpoint} with state + failure count
```

### 14.3 Data Reconciliation Schedule

| Frequency | Scope | Process |
|---|---|---|
| **Every 6 hours** | Channel membership | Compare Board.members with Channel.members; sync differences |
| **Daily (02:00 UTC)** | User accounts | Compare FlowTask verified users with ChatApp users; add/deactivate |
| **Daily (03:00 UTC)** | Channel inventory | Compare Boards with Channels; create missing; archive orphaned |
| **Weekly (Sunday 04:00)** | Full audit | Comprehensive comparison; generate discrepancy report |

### 14.4 Event Replay Endpoint

```
POST /api/integrations/retry/:deliveryId
  - Auth: Bearer + admin
  - Retrieves event from eventReplayLog by deliveryId
  - Re-emits to webhook endpoint
  - Tracks as new delivery attempt

GET /api/events/replay?from=<ISO8601>&to=<ISO8601>&eventType=<type>
  - Auth: Bearer + admin
  - Replays all events in time range
  - Rate limited to 100 events/request
  - Returns: { replayed: N, failed: M, results: [...] }
```

---

## 15. Deployment Architecture

### 15.1 Production Environment

```
┌─────────────────────────────────────────────────────────────┐
│                     Production Cluster                      │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │   FlowTask   │   │   ChatApp    │   │     Worker      │  │
│  │  Backend x3  │   │  Backend x3  │   │  Instances x2   │  │
│  │ (PM2/Docker) │   │ (PM2/Docker) │   │   (BullMQ)      │  │
│  └───────┬──────┘   └───────┬──────┘   └───────┬─────────┘  │
│          │                  │                  │            │
│  ┌───────▼──────────────────▼──────────────────▼─────────┐  │
│  │                 Redis Cluster (HA)                    │  │
│  │   Cache + Pub/Sub + BullMQ + Sessions + Rate Limit    │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │           MongoDB Atlas Cluster (M30+)                │  │
│  │   Primary + 2 Read Replicas + Analytics Node          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 15.2 Environment Variables

#### FlowTask Backend

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `JWT_SECRET` | JWT signing secret (shared with ChatApp) | `<256-bit secret>` |
| `REDIS_URL` | Redis connection string | `redis://...` |
| `WEBHOOK_SECRET` | HMAC signing secret for webhooks | `<256-bit secret>` |
| `CHATAPP_WEBHOOK_URL` | ChatApp webhook endpoint | `https://chat.example.com/api/chat/webhooks/flowtask` |
| `CORS_ORIGINS` | Allowed CORS origins | `https://app.example.com,https://chat.example.com` |
| `SMTP_HOST/PORT/USER/PASS` | Email configuration | SMTP credentials |
| `SLACK_CLIENT_ID/SECRET` | Slack OAuth credentials | Slack app credentials |
| `SLACK_SIGNING_SECRET` | Slack signature verification | `<secret>` |

#### ChatApp Backend

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `3001` |
| `MONGODB_URI` | ChatApp MongoDB connection | `mongodb+srv://...` |
| `JWT_SECRET` | Same JWT secret as FlowTask | `<256-bit secret>` |
| `REDIS_URL` | Redis connection string | `redis://...` |
| `WEBHOOK_SECRET` | Same HMAC secret as FlowTask | `<256-bit secret>` |
| `FLOWTASK_API_URL` | FlowTask API base URL | `https://api.example.com` |
| `CORS_ORIGINS` | Allowed CORS origins | `https://chat.example.com` |
| `UPLOAD_DIR` | File upload directory | `./uploads` |
| `MAX_FILE_SIZE` | Max upload size in bytes | `10485760` |

### 15.3 CI/CD Strategy

```
┌───────────┐     ┌────────────┐     ┌──────────────┐     ┌──────────────┐
│    Git    │     │     CI     │     │   Staging    │     │  Production  │
│    Push   │ ──▶ │  Pipeline  │ ──▶ │    Deploy    │ ──▶ │    Deploy    │
│           │     │            │     │    (auto)    │     │   (manual)   │
└───────────┘     └────────────┘     └──────────────┘     └──────────────┘
```

CI Pipeline Steps:
1. Lint (ESLint)
2. Unit tests (Jest)
3. Integration tests (Supertest)
4. Security audit (npm audit)
5. Build Docker image
6. Push to container registry
7. Deploy to staging (automatic)
8. Smoke tests on staging
9. Deploy to production (manual approval)
```

### 15.4 Reverse Proxy Setup (Nginx)

```nginx
# FlowTask API + Socket.IO
upstream flowtask_backend {
    ip_hash;  # Sticky sessions for Socket.IO
    server flowtask-app-1:5000;
    server flowtask-app-2:5000;
    server flowtask-app-3:5000;
}

# ChatApp API + Socket.IO
upstream chatapp_backend {
    ip_hash;
    server chatapp-app-1:3001;
    server chatapp-app-2:3001;
    server chatapp-app-3:3001;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/ssl/fullchain.pem;
    ssl_certificate_key /etc/ssl/privkey.pem;

    # FlowTask API
    location /api/ {
        proxy_pass http://flowtask_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # FlowTask Socket.IO
    location /socket.io/ {
        proxy_pass http://flowtask_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 443 ssl http2;
    server_name chat.example.com;

    # ChatApp API
    location /api/chat/ {
        proxy_pass http://chatapp_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # ChatApp Socket.IO
    location /socket.io/ {
        proxy_pass http://chatapp_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Static file uploads
    location /api/chat/uploads/ {
        proxy_pass http://chatapp_backend;
        proxy_cache_valid 200 7d;
        add_header Cache-Control "public, max-age=604800";
    }
}
```

---

## 16. Observability & Monitoring

### 16.1 Logging Strategy

| Log Level | Usage | Example |
|---|---|---|
| `error` | Unhandled exceptions, failed webhook deliveries, auth failures | `Webhook delivery failed: PROJECT_CREATED to chat.example.com â€” 500` |
| `warn` | Rate limits hit, circuit breaker state changes, deprecated API usage | `Circuit breaker OPEN for ChatApp webhook endpoint` |
| `info` | Request/response logs, webhook deliveries, user actions | `Webhook delivered: TASK_CREATED deliveryId=abc123 â€” 200 in 145ms` |
| `debug` | Detailed processing, event payloads, query performance | `Processing PROJECT_MEMBER_ASSIGNED: adding 3 members to channel` |

**Structured Log Format:**

```json
{
  "timestamp": "2026-03-05T09:22:14.000Z",
  "level": "info",
  "service": "flowtask-backend",
  "requestId": "req_abc123",
  "userId": "65a1...",
  "action": "webhook.delivered",
  "event": "TASK_CREATED",
  "deliveryId": "550e8400...",
  "target": "https://chat.example.com/api/chat/webhooks/flowtask",
  "statusCode": 200,
  "duration": 145,
  "message": "Webhook delivered successfully"
}
```

### 16.2 Key Metrics

| Metric | Type | Alert Threshold |
|---|---|---|
| `webhook.delivery.success_rate` | Gauge | < 95% over 5 min |
| `webhook.delivery.latency_p95` | Histogram | > 5s |
| `webhook.dlq.size` | Gauge | > 10 events |
| `api.response_time_p95` | Histogram | > 500ms |
| `api.error_rate` | Gauge | > 5% |
| `socket.connected_clients` | Gauge | < 10 (unexpected drop) |
| `socket.reconnection_rate` | Counter | > 100/min |
| `db.query_time_p95` | Histogram | > 200ms |
| `redis.memory_usage` | Gauge | > 80% |
| `queue.waiting_jobs` | Gauge | > 1000 |
| `queue.failed_jobs` | Counter | > 50/hour |
| `circuit_breaker.state` | Gauge | State = OPEN |

### 16.3 Dashboards

| Dashboard | Panels |
|---|---|
| **Integration Health** | Webhook success rate, delivery latency, DLQ size, circuit breaker state, event throughput |
| **Chat Performance** | Active connections, messages/min, API latency, search latency, file upload throughput |
| **User Activity** | DAU, concurrent users, messages sent, channels created, threads opened |
| **Infrastructure** | CPU/Memory/Disk, MongoDB ops/sec, Redis memory, queue depths, error rates |
| **Security** | Auth failures, rate limit triggers, signature verification failures, audit log entries |

### 16.4 Alerting Rules

| Alert | Condition | Severity | Action |
|---|---|---|---|
| Webhook delivery failure spike | Success rate < 90% for 5 minutes | Critical | Page on-call; check ChatApp health |
| DLQ growing | DLQ size > 50 events | High | Investigate and process manually |
| API error rate | > 10% 5xx responses for 3 minutes | Critical | Page on-call; check logs |
| Database slow queries | p95 > 500ms for 10 minutes | High | Review query plans; check indexes |
| Socket disconnect storm | > 500 disconnects in 1 minute | High | Check server health; review logs |
| Redis memory critical | > 90% memory usage | Critical | Flush caches; increase capacity |

---

## 17. Future Roadmap

### 17.1 Phase 1 â€” Foundation (Current â†’ Q2 2026)

| Feature | Priority | Status |
|---|---|---|
| Complete webhook emitter in FlowTask | P0 | ðŸ”´ Not started |
| All 40 event handlers in ChatApp | P0 | ðŸŸ¡ 15/40 done |
| Channel auto-provisioning | P0 | ðŸŸ¡ Partial |
| Thread auto-creation for tasks | P0 | ðŸŸ¡ Partial |
| RBAC sync from FlowTask | P0 | ðŸŸ¢ Implemented |
| Idempotency layer | P0 | ðŸŸ¡ Partial |
| Basic reconciliation | P1 | ðŸ”´ Not started |
| Rate limiting | P1 | ðŸŸ¡ Partial |

### 17.2 Phase 2 â€” Slack Parity (Q3 2026)

| Feature | Priority |
|---|---|
| Scheduled messages | P1 |
| Message bookmarks | P1 |
| Advanced search with filters | P1 |
| Notification digest (daily/weekly) | P1 |
| Channel analytics dashboard | P2 |
| Audit log viewer (admin) | P1 |
| Message retention policies | P2 |
| Task action buttons in messages | P1 |
| Inline task editing from chat | P2 |
| Smart notification routing | P1 |

### 17.3 Phase 3 â€” AI & Intelligence (Q4 2026)

| Feature | Description |
|---|---|
| **AI Task Summarization** | GPT-powered summary of task thread discussions |
| **AI Channel Summary** | "Catch up" feature â€” summarize missed messages |
| **Smart Task Suggestions** | AI suggests task creation from chat conversations |
| **Sentiment Analysis** | Detect frustration/blockers in task threads |
| **Auto-categorization** | AI categorizes messages by topic/urgency |
| **Meeting Notes to Tasks** | Convert meeting summaries into FlowTask cards |

### 17.4 Phase 4 â€” Enterprise & Scale (2027)

| Feature | Description |
|---|---|
| **Multi-Organization SaaS** | Full multi-tenant with workspace isolation |
| **SSO / SAML** | Enterprise single sign-on integration |
| **SOC 2 Type II** | Compliance certification |
| **Data Residency** | Region-specific data storage (EU, APAC) |
| **Advanced Analytics** | Cross-project reporting, team velocity, burndown charts |
| **Enterprise Compliance Mode** | Data retention enforcement, legal hold, e-discovery |
| **Custom Integrations API** | Public API for third-party integrations |
| **Mobile Native Apps** | iOS and Android native chat + task management |
| **Video/Voice Calls** | WebRTC-based calls within chat channels |
| **Plugin System** | Extensible bot/plugin architecture |

---

## Appendix A: FlowTask Socket.IO Event Reference

| Event Name | Room | Payload | Source |
|---|---|---|---|
| `notification` | `user-{userId}` | Full notification object | `emitNotification()` |
| `card-updated` | `board-{boardId}` | `{ cardId, updates, updatedBy }` | `emitCardUpdate()` |
| `comment-added` | `board-{boardId}` | `{ cardId, comment }` | `emitCommentAdded()` |
| `comment-updated` | `board-{boardId}` | `{ cardId, commentId, updates }` | `emitCommentUpdated()` |
| `comment-deleted` | `board-{boardId}` | `{ cardId, commentId }` | `emitCommentDeleted()` |
| `subtask-updated` | `board-{boardId}` | `{ cardId, subtaskId, updates }` | `emitSubtaskUpdated()` |
| `attachment-added` | `board-{boardId}` | `{ cardId, attachment }` | `emitAttachmentAdded()` |
| `attachment-deleted` | `board-{boardId}` | `{ cardId, attachmentId }` | `emitAttachmentDeleted()` |
| `time-logged` | `board-{boardId}` | `{ cardId, timeEntry }` | `emitTimeLogged()` |
| `estimation-updated` | `board-{boardId}` | `{ cardId, estimationEntry }` | `emitEstimationUpdated()` |
| `user-assigned` | Broadcast | `{ userId, departmentId }` | `emitUserAssigned()` |
| `user-unassigned` | Broadcast | `{ userId, departmentId }` | `emitUserUnassigned()` |
| `department-bulk-assigned` | Broadcast | `{ userIds, departmentId, count }` | `emitBulkUsersAssigned()` |
| `department-bulk-unassigned` | Broadcast | `{ userIds, departmentId, count }` | `emitBulkUsersUnassigned()` |
| `finance:page:pending` | `admin` | `{ page, creatorName, message }` | `emitFinancePagePending()` |
| `finance:page:published` | `admin`, `manager` | `{ page, message }` | `emitFinancePagePublished()` |
| `finance:page:status-changed` | `admin`, `manager` | `{ page, action, message }` | `emitFinancePageStatusChanged()` |
| `finance:page:updated` | `admin`, `manager` | `{ page, message }` | `emitFinancePageUpdated()` |
| `finance:page:deleted` | `admin`, `manager` | `{ pageId, pageName, message }` | `emitFinancePageDeleted()` |
| `finance:data:refresh` | `finance`, `admin`, `manager` | `{ type, timestamp, cardId?, boardId? }` | `emitFinanceDataRefresh()` |

## Appendix B: Notification Type Reference

| Type | Priority | Admin | Manager | Employee |
|---|---|---|---|---|
| `task_assigned` | medium | — | — | ✅ |
| `task_updated` | medium | — | — | ✅ |
| `task_due_soon` | high | — | — | ✅ |
| `task_overdue` | high | — | ✅ | ✅ |
| `task_created` | medium | — | ✅ | ✅ |
| `task_deleted` | medium | — | — | ✅ |
| `task_completed` | medium | — | ✅ | ✅ |
| `project_created` | medium | ✅ | ✅ | ✅ |
| `project_deleted` | medium | ✅ | ✅ | — |
| `comment_added` | medium | — | — | ✅ |
| `comment_mention` | high | — | — | ✅ |
| `role_mention` | high | ✅ | ✅ | ✅ |
| `team_mention` | high | — | ✅ | ✅ |
| `user_registered` | critical | ✅ | ✅ | — |
| `user_verified` | medium | ✅ | ✅ | — |
| `announcement_created` | low | ✅ | ✅ | ✅ |
| `deadline_approaching` | high | — | ✅ | ✅ |
| `system_alert` | critical | ✅ | — | — |

> **This document is the single source of truth for the FlowTask <-> ChatApp integrated ecosystem. Any discrepancies between this document and implementation should be resolved in favor of this specification. Changes require review from both FlowTask and ChatApp team leads.**

---

*Document generated: 2026-03-05 | Version: 3.0.0 | Classification: Internal â€” Confidential*
