# Production Setup Guide

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Configuration](#environment-configuration)
3. [Authentication System](#authentication-system)
4. [FlowTask Integration Toggle](#flowtask-integration-toggle)
5. [Deployment Checklist](#deployment-checklist)
6. [API Reference — Auth Endpoints](#api-reference--auth-endpoints)
7. [Email Service](#email-service)
8. [Security Features](#security-features)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Development

```bash
# 1. Clone & install
cd server && npm install
cd ../client && npm install

# 2. Configure environment
cp server/.env.example server/.env    # Edit with your values
cp client/.env.example client/.env    # Usually defaults are fine

# 3. Start
cd server && npm run dev     # API on :3200
cd client && npm run dev     # UI on :5174
```

### Production

```bash
# Server
cd server
NODE_ENV=production node index.js

# Client
cd client
npm run build   # Output in client/dist/
# Serve dist/ with nginx or any static host
```

---

## Environment Configuration

### Server Variables (`server/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` | **Yes** | — | MongoDB connection string |
| `JWT_SECRET` | **Yes** | — | Secret for Chat access tokens (64+ chars) |
| `JWT_REFRESH_SECRET` | **Yes** | — | Secret for refresh tokens (must differ from JWT_SECRET) |
| `JWT_EXPIRY` | No | `15m` | Access token expiry (`15m`, `1h`, etc.) |
| `REFRESH_TOKEN_EXPIRY` | No | `7d` | Refresh token expiry |
| `FLOWTASK_ENABLED` | No | `true` | Enable/disable FlowTask integration |
| `FLOWTASK_API_URL` | When FT on | — | FlowTask backend URL |
| `FLOWTASK_WEBHOOK_SECRET` | When FT on | — | HMAC secret for webhook verification |
| `FLOWTASK_JWT_SECRET` | When FT on | — | FlowTask's JWT signing secret |
| `CORS_ORIGINS` | No | `http://localhost:5174` | Comma-separated allowed origins |
| `PORT` | No | `3200` | HTTP port |
| `NODE_ENV` | No | `development` | `development` \| `production` |
| `BASE_URL` | No | `http://localhost:3200` | Public server URL (for email links) |
| `TRUST_PROXY` | No | `0` | Trust proxy hops (set to `1` behind nginx) |
| `SMTP_HOST` | No | — | SMTP server for email delivery |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `SMTP_FROM` | No | `noreply@flowchat.local` | From address for emails |
| `LOG_LEVEL` | No | `info` | `debug` \| `info` \| `warn` \| `error` |

### Client Variables (`client/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `/api/chat` | API base (use full URL in production) |
| `VITE_SOCKET_URL` | `window.location.origin` | Socket.IO server URL |
| `VITE_FLOWTASK_ENABLED` | `true` | Show/hide FlowTask SSO tab |

### Generating Secrets

```bash
# JWT secrets (run twice — one for JWT_SECRET, one for JWT_REFRESH_SECRET)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Webhook secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Authentication System

### Dual Auth Architecture

The app supports two authentication methods simultaneously:

1. **Native Auth** — Users register with email/password directly in the Chat app
2. **FlowTask SSO** — Users authenticate via FlowTask JWT tokens

Both methods issue **Chat-owned tokens** (access + refresh) so the downstream middleware only deals with one token format.

### Token Flow

```
┌─────────────────┐    ┌──────────────────────────┐
│ Native Login     │    │ FlowTask SSO Login        │
│ POST /auth/login │    │ POST /auth/login/flowtask │
│ (email+password) │    │ (FlowTask JWT)            │
└────────┬────────┘    └──────────┬───────────────┘
         │                        │
         ▼                        ▼
   ┌─────────────────────────────────┐
   │  Chat Server issues:            │
   │  • Access Token  (15min, JWT)   │
   │  • Refresh Token (7d, JWT)      │
   └──────────────┬──────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────┐
   │  Client stores both tokens      │
   │  Uses access token for API/WS   │
   │  On 401 → auto-refresh          │
   └─────────────────────────────────┘
```

### Token Refresh (Rotation)

When the access token expires:

1. Client sends refresh token to `POST /auth/refresh`
2. Server verifies refresh token, checks it exists in DB
3. Old refresh token is revoked (deleted from DB)
4. New access + refresh tokens issued
5. If refresh token reuse is detected → all tokens cleared (security measure)

### Protected Middleware Flow

The `protect` middleware tries two verification strategies:

1. **Strategy 1**: Verify as Chat-issued access token (`JWT_SECRET`) → lookup by `_id`
2. **Strategy 2**: Verify as FlowTask token (`FLOWTASK_JWT_SECRET`) → lookup by `flowTaskUserId`

This means existing FlowTask tokens still work after the upgrade.

---

## FlowTask Integration Toggle

Set `FLOWTASK_ENABLED=false` in `server/.env` to run as a standalone chat:

### What gets disabled when `FLOWTASK_ENABLED=false`:

| Feature | Behavior |
|---------|----------|
| FlowTask SSO login | `POST /auth/login/flowtask` returns error |
| Webhook routes | Not mounted on Express |
| Webhook handlers | Not registered |
| FlowTask token verification | Skipped in auth middleware |
| FlowTask API URL | Not required in env |
| Client SSO tab | Hidden (via `VITE_FLOWTASK_ENABLED=false`) |

### What still works:

- Native email/password registration & login
- All chat features (channels, messages, threads, file uploads)
- Bot commands
- All middleware and authorization

---

## Deployment Checklist

### Pre-deploy

- [ ] Set `NODE_ENV=production`
- [ ] Generate strong `JWT_SECRET` and `JWT_REFRESH_SECRET` (64+ chars each)
- [ ] Set `CORS_ORIGINS` to your actual domain(s)
- [ ] Set `BASE_URL` to the server's public URL
- [ ] Set `TRUST_PROXY=1` if behind nginx/load balancer
- [ ] Configure SMTP for production email delivery
- [ ] Set `VITE_API_BASE_URL` to production API URL in client
- [ ] Build client: `cd client && npm run build`
- [ ] Ensure MongoDB has authentication enabled
- [ ] Review rate limiter settings for your expected traffic

### Security

- [ ] Real `.env` is listed in `.gitignore` (it is by default)
- [ ] No real credentials in `.env.example`
- [ ] HTTPS enforced at reverse proxy level
- [ ] Helmet headers active (enabled by default)
- [ ] Rate limiting active on auth routes (enabled by default)

### Nginx Config Example

```nginx
server {
    listen 443 ssl;
    server_name chat.yourdomain.com;

    # SSL
    ssl_certificate /etc/letsencrypt/live/chat.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.yourdomain.com/privkey.pem;

    # API & WebSocket
    location /api/chat/ {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Client static files
    location / {
        root /var/www/chat/client/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## API Reference — Auth Endpoints

### Public Endpoints (No auth required)

#### `POST /api/chat/auth/register`
Register a native user.

```json
// Request
{ "name": "John Doe", "email": "john@example.com", "password": "MyPass123" }

// Response 201
{
  "success": true,
  "data": { "user": { "_id": "...", "name": "...", "email": "...", "authProvider": "native" } },
  "message": "Registration successful. Please check your email to verify your account."
}
```

#### `POST /api/chat/auth/login`
Login with email & password.

```json
// Request
{ "email": "john@example.com", "password": "MyPass123" }

// Response 200
{
  "success": true,
  "data": {
    "user": { ... },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

#### `POST /api/chat/auth/login/flowtask`
Login via FlowTask JWT.

```json
// Request
{ "token": "eyJhbGciOiJIUzI1NiIs..." }

// Response 200
{
  "success": true,
  "data": {
    "user": { ... },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "channels": [...]
  }
}
```

#### `POST /api/chat/auth/refresh`
Refresh access token (with rotation).

```json
// Request
{ "refreshToken": "eyJ..." }

// Response 200
{ "success": true, "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." } }
```

#### `POST /api/chat/auth/forgot-password`
Request password reset email.

```json
// Request
{ "email": "john@example.com" }

// Response 200
{ "success": true, "message": "If an account exists with that email, a reset link has been sent." }
```

#### `POST /api/chat/auth/reset-password`
Reset password with token.

```json
// Request
{ "token": "abc123...", "newPassword": "NewPass456" }

// Response 200
{ "success": true, "message": "Password reset successful." }
```

#### `GET /api/chat/auth/verify-email?token=...`
Verify email (redirects to login page).

### Protected Endpoints (Bearer token required)

#### `GET /api/chat/auth/me`
Get current user profile.

#### `PUT /api/chat/auth/preferences`
Update chat preferences.

#### `POST /api/chat/auth/logout`
Revoke refresh token.

```json
// Request
{ "refreshToken": "eyJ..." }
```

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/register`, `/login`, `/login/flowtask` | 5 per 15 min per IP |
| `/refresh` | 30 per min per IP |
| `/forgot-password`, `/reset-password` | 3 per 15 min per IP |

---

## Email Service

### Development Mode

When `SMTP_HOST` is not set (default), emails are logged to the server console:

```
[INFO] 📧 [DEV EMAIL] Email not sent — no SMTP configured. Content:
  to: john@example.com
  subject: Verify your FlowTask Chat account
  text: Welcome to FlowTask Chat, John! Verify your email: http://localhost:3200/api/chat/auth/verify-email?token=abc123...
```

### Production Mode

Configure `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, etc. in `.env`:

```bash
# Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com

# Amazon SES
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=YOUR_SES_KEY
SMTP_PASS=YOUR_SES_SECRET
SMTP_FROM=noreply@yourdomain.com
```

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcrypt with 12 salt rounds |
| Brute-force protection | Account lockout after 5 failed attempts (15 min) |
| Token rotation | Refresh tokens rotated on each use; reuse detection clears all tokens |
| Rate limiting | Per-IP limits on auth endpoints |
| HMAC webhook verification | SHA-256 signature on all FlowTask webhooks |
| Helmet headers | CSP, HSTS, X-Frame-Options, etc. |
| CORS | Configurable allowed origins |
| Trust proxy | Configurable for correct IP behind reverse proxies |
| Password validation | Min 8 chars, requires uppercase, lowercase, number (Zod) |
| Email enumeration prevention | forgot-password always returns success |
| Token separation | Separate secrets for access, refresh, and FlowTask tokens |

---

## Troubleshooting

### "FlowTask integration is disabled" error

Set `FLOWTASK_ENABLED=true` in `server/.env` and provide `FLOWTASK_API_URL`, `FLOWTASK_WEBHOOK_SECRET`, `FLOWTASK_JWT_SECRET`.

### "Invalid or expired token" on page refresh

The access token (15 min) expired. The client auto-refreshes using the refresh token. If this fails, the user is logged out. Check that `JWT_REFRESH_SECRET` hasn't changed since the refresh token was issued.

### Emails not sending in production

1. Verify `SMTP_HOST` is set in `.env`
2. Check server logs for SMTP errors
3. For Gmail: use an App Password (not your regular password)
4. For cloud providers: verify sender domain/email is verified

### Rate limiting returns 429 too early

If behind a reverse proxy without `TRUST_PROXY=1`, all requests appear from the same IP. Set `TRUST_PROXY=1` to use `X-Forwarded-For`.

### MongoDB "duplicate key error" on email

Email has a unique index. If migrating from FlowTask-only to dual auth, ensure no duplicate emails exist between FlowTask-synced users and native registrations. The system handles this by checking for existing users during registration.
