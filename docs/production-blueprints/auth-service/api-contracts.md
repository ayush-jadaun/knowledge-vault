---
title: "Auth Service — API Contracts"
description: "Complete REST API specification for a production authentication service — registration, login, token refresh, logout, password reset, MFA setup/verification, user profile, with full TypeScript types, request/response schemas, and error formats"
tags: [auth, api, rest, typescript, jwt, mfa, oauth, openapi, production-blueprint]
difficulty: advanced
prerequisites: [production-blueprints/auth-service, production-blueprints/auth-service/architecture]
lastReviewed: "2026-03-17"
---

# Auth Service API Contracts

This page defines every endpoint in the auth service. Each endpoint includes the HTTP method, path, request schema, response schema, error responses, rate limits, and authentication requirements. A frontend developer should be able to build a complete auth client from this specification alone.

## Base URL and Conventions

```
Base URL: https://api.yourplatform.com/v1
Content-Type: application/json
Accept: application/json
```

### Common Headers

| Header | Required | Description |
|---|---|---|
| `Content-Type` | Yes | Must be `application/json` for POST/PUT/PATCH |
| `Authorization` | Conditional | `Bearer <access_token>` for authenticated endpoints |
| `X-Request-Id` | No | Client-generated UUID for request tracing |
| `X-Device-Fingerprint` | No | Device identifier for session binding |
| `Accept-Language` | No | Preferred language for error messages (default: `en`) |

### Response Envelope

All successful responses follow this structure:

```typescript
interface SuccessResponse<T> {
  data: T;
  meta?: {
    requestId: string;
    timestamp: string;
  };
}
```

### Error Response Format

All error responses follow this structure:

```typescript
interface ErrorResponse {
  error: {
    code: string;               // Machine-readable error code
    message: string;            // Human-readable description
    statusCode: number;         // HTTP status code
    details?: ValidationError[];// Field-level validation errors
    requestId: string;          // For support debugging
    timestamp: string;          // ISO 8601
  };
}

interface ValidationError {
  field: string;                // JSON path (e.g., "body.email")
  message: string;              // What went wrong
  code: string;                 // e.g., "invalid_format", "too_short"
  received?: string;            // What was received (if safe to echo)
}
```

### Standard Error Codes

| HTTP Status | Error Code | Description |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed schema validation |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 401 | `INVALID_TOKEN` | Access token is invalid or expired |
| 401 | `INVALID_REFRESH_TOKEN` | Refresh token is invalid, expired, or revoked |
| 401 | `SESSION_EXPIRED` | Session has been revoked |
| 403 | `MFA_REQUIRED` | Multi-factor authentication is required |
| 403 | `EMAIL_NOT_VERIFIED` | Email verification is required for this action |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `EMAIL_ALREADY_EXISTS` | Email is already registered |
| 422 | `WEAK_PASSWORD` | Password does not meet strength requirements |
| 422 | `BREACHED_PASSWORD` | Password found in data breach database |
| 423 | `ACCOUNT_LOCKED` | Account temporarily locked due to failed attempts |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected server error |

---

## Shared TypeScript Types

These types are used across multiple endpoints:

```typescript
// User types
interface UserResponse {
  id: string;                    // UUID
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}

// Auth result (returned after login/register)
interface AuthResponse {
  user: UserResponse;
  accessToken: string;           // JWT (RS256)
  refreshToken: string;          // Opaque UUID
  expiresIn: number;             // Seconds until access token expires
  tokenType: 'Bearer';
}

// MFA challenge (returned when MFA is required during login)
interface MFAChallengeResponse {
  mfaRequired: true;
  mfaToken: string;              // Opaque token to continue MFA flow
  mfaMethods: ('totp' | 'backup_code')[]; // Available MFA methods
  expiresIn: number;             // Seconds until MFA challenge expires
}

// Session info
interface SessionResponse {
  id: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActivityAt: string;
  isCurrent: boolean;
}

// Pagination
interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
```

---

## Endpoint: POST /auth/register

Creates a new user account with email and password credentials.

**Authentication:** None
**Rate Limit:** 5 requests per 15 minutes per IP

### Request

```typescript
interface RegisterRequest {
  email: string;           // Valid email address, max 255 chars
  password: string;        // 10-128 chars, zxcvbn score >= 3
  displayName: string;     // 2-100 chars, trimmed
  acceptTerms: boolean;    // Must be true
}
```

```json
{
  "email": "alice@example.com",
  "password": "correct-horse-battery-staple",
  "displayName": "Alice Chen",
  "acceptTerms": true
}
```

### Response: 201 Created

```typescript
interface RegisterResponse {
  data: AuthResponse;
}
```

```json
{
  "data": {
    "user": {
      "id": "01913a7c-8e4b-7b3a-9d1f-2c4e6a8b0d2f",
      "email": "alice@example.com",
      "displayName": "Alice Chen",
      "avatarUrl": null,
      "emailVerified": false,
      "mfaEnabled": false,
      "createdAt": "2026-03-17T10:30:00.000Z",
      "updatedAt": "2026-03-17T10:30:00.000Z"
    },
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2LTAzIn0...",
    "refreshToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```

### Response Headers

```
Set-Cookie: refresh_token=f47ac10b-58cc-4372-a567-0e02b2c3d479; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=2592000
```

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing fields, invalid email format, password too short |
| 409 | `EMAIL_ALREADY_EXISTS` | Email is already registered |
| 422 | `WEAK_PASSWORD` | Password zxcvbn score < 3 |
| 422 | `BREACHED_PASSWORD` | Password found in HIBP database |
| 429 | `RATE_LIMIT_EXCEEDED` | More than 5 registrations from this IP in 15 minutes |

### Error Example: Weak Password

```json
{
  "error": {
    "code": "WEAK_PASSWORD",
    "message": "Password is too weak. This is similar to a commonly used password. Suggestions: Add more words that are less common. Avoid repeated words and characters.",
    "statusCode": 422,
    "details": [
      {
        "field": "body.password",
        "message": "Password strength score is 1, minimum required is 3",
        "code": "too_weak",
        "received": "score: 1/4"
      }
    ],
    "requestId": "req_a1b2c3d4",
    "timestamp": "2026-03-17T10:30:00.000Z"
  }
}
```

### JSON Schema (Fastify Validation)

```json
{
  "body": {
    "type": "object",
    "required": ["email", "password", "displayName", "acceptTerms"],
    "properties": {
      "email": {
        "type": "string",
        "format": "email",
        "maxLength": 255
      },
      "password": {
        "type": "string",
        "minLength": 10,
        "maxLength": 128
      },
      "displayName": {
        "type": "string",
        "minLength": 2,
        "maxLength": 100
      },
      "acceptTerms": {
        "type": "boolean",
        "const": true
      }
    },
    "additionalProperties": false
  }
}
```

---

## Endpoint: POST /auth/login

Authenticates a user with email and password. Returns tokens or an MFA challenge.

**Authentication:** None
**Rate Limit:** 10 requests per 15 minutes per IP, 5 failed attempts per account

### Request

```typescript
interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;     // Extends refresh token to 90 days (default: false)
}
```

```json
{
  "email": "alice@example.com",
  "password": "correct-horse-battery-staple",
  "rememberMe": true
}
```

### Response: 200 OK (No MFA)

```typescript
interface LoginResponse {
  data: AuthResponse;
}
```

```json
{
  "data": {
    "user": {
      "id": "01913a7c-8e4b-7b3a-9d1f-2c4e6a8b0d2f",
      "email": "alice@example.com",
      "displayName": "Alice Chen",
      "avatarUrl": "https://cdn.yourplatform.com/avatars/alice.jpg",
      "emailVerified": true,
      "mfaEnabled": false,
      "createdAt": "2026-03-17T10:30:00.000Z",
      "updatedAt": "2026-03-17T12:00:00.000Z"
    },
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```

### Response: 200 OK (MFA Required)

When the user has MFA enabled, the login endpoint returns a challenge instead of tokens. The client must complete the MFA flow to receive tokens.

```typescript
interface LoginMFAResponse {
  data: MFAChallengeResponse;
}
```

```json
{
  "data": {
    "mfaRequired": true,
    "mfaToken": "mfa_challenge_d4e5f6a7-b8c9-0123-4567-89abcdef0123",
    "mfaMethods": ["totp", "backup_code"],
    "expiresIn": 300
  }
}
```

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Missing or invalid fields |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 423 | `ACCOUNT_LOCKED` | Account locked after too many failed attempts |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many login attempts |

### Error Example: Account Locked

```json
{
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Account is temporarily locked due to multiple failed login attempts. Please try again after 2026-03-17T11:00:00.000Z or reset your password.",
    "statusCode": 423,
    "details": [
      {
        "field": "account",
        "message": "Locked until 2026-03-17T11:00:00.000Z",
        "code": "temporary_lock"
      }
    ],
    "requestId": "req_x1y2z3",
    "timestamp": "2026-03-17T10:30:00.000Z"
  }
}
```

---

## Endpoint: POST /auth/refresh

Exchanges a valid refresh token for a new access token and refresh token (token rotation).

**Authentication:** None (uses refresh token)
**Rate Limit:** 30 requests per minute per user

### Request

```typescript
interface RefreshRequest {
  refreshToken: string;    // The current refresh token (UUID)
}
```

```json
{
  "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

::: tip
For web clients using HTTP-only cookies, the refresh token is automatically included in the cookie. The request body can be empty, and the server reads the token from the `refresh_token` cookie.
:::

### Response: 200 OK

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "new-token-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 401 | `INVALID_REFRESH_TOKEN` | Token not found, expired, or already consumed |
| 401 | `REFRESH_TOKEN_REUSE_DETECTED` | Revoked token presented (all sessions revoked) |

### Refresh Token Reuse Detection

If a client presents a refresh token that has already been consumed (used for rotation), the server assumes the token was stolen. In this case:

1. All refresh tokens in the same family are revoked.
2. All sessions for the user associated with that token family are invalidated.
3. The user must re-authenticate.
4. An `account.security_alert` event is emitted for notification.

```json
{
  "error": {
    "code": "REFRESH_TOKEN_REUSE_DETECTED",
    "message": "This refresh token has already been used. For your security, all sessions have been revoked. Please log in again.",
    "statusCode": 401,
    "requestId": "req_security_001",
    "timestamp": "2026-03-17T10:35:00.000Z"
  }
}
```

---

## Endpoint: POST /auth/logout

Invalidates the current session and associated refresh tokens.

**Authentication:** Required (Bearer token)
**Rate Limit:** None

### Request

```typescript
interface LogoutRequest {
  allDevices?: boolean;    // If true, revoke all sessions (default: false)
}
```

```json
{
  "allDevices": false
}
```

### Response: 204 No Content

No response body. The `Set-Cookie` header clears the refresh token cookie.

```
Set-Cookie: refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=0
```

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |

---

## Endpoint: POST /auth/forgot-password

Initiates a password reset flow by sending a reset email.

**Authentication:** None
**Rate Limit:** 3 requests per 15 minutes per email

### Request

```typescript
interface ForgotPasswordRequest {
  email: string;
}
```

```json
{
  "email": "alice@example.com"
}
```

### Response: 202 Accepted

The response is always 202 regardless of whether the email exists, to prevent user enumeration attacks.

```json
{
  "data": {
    "message": "If an account exists with this email, a password reset link has been sent."
  }
}
```

### Implementation Notes

- The reset token is a 32-byte cryptographically random string, URL-safe base64 encoded.
- The token expires after 1 hour.
- Only one active reset token per user (requesting a new one invalidates the previous one).
- The reset email contains a link: `https://app.yourplatform.com/reset-password?token=<token>`.
- The token is hashed (SHA-256) before storage to prevent token theft from database access.

---

## Endpoint: POST /auth/reset-password

Resets a user's password using a valid reset token.

**Authentication:** None (uses reset token)
**Rate Limit:** 5 requests per 15 minutes per IP

### Request

```typescript
interface ResetPasswordRequest {
  token: string;           // Reset token from email link
  newPassword: string;     // Must meet password strength requirements
}
```

```json
{
  "token": "dGhpcyBpcyBhIHJlc2V0IHRva2Vu...",
  "newPassword": "new-secure-password-2026"
}
```

### Response: 200 OK

```json
{
  "data": {
    "message": "Password has been reset successfully. Please log in with your new password."
  }
}
```

### Side Effects

1. The reset token is invalidated (one-time use).
2. All existing sessions for the user are revoked.
3. All refresh tokens for the user are revoked.
4. A `user.password_changed` event is emitted.
5. A security notification email is sent to the user.
6. An audit log entry is created.

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 400 | `INVALID_RESET_TOKEN` | Token not found, expired, or already used |
| 422 | `WEAK_PASSWORD` | New password does not meet strength requirements |
| 422 | `BREACHED_PASSWORD` | New password found in data breach database |
| 422 | `PASSWORD_RECENTLY_USED` | New password matches one of the last 5 passwords |

---

## Endpoint: GET /auth/me

Returns the authenticated user's profile.

**Authentication:** Required (Bearer token)
**Rate Limit:** 60 requests per minute

### Request

No request body. User is identified by the JWT claims.

### Response: 200 OK

```typescript
interface MeResponse {
  data: {
    user: UserResponse;
    sessions: SessionResponse[];
    oauthProviders: {
      provider: string;     // "google", "github", "apple"
      email: string;
      connectedAt: string;
    }[];
  };
}
```

```json
{
  "data": {
    "user": {
      "id": "01913a7c-8e4b-7b3a-9d1f-2c4e6a8b0d2f",
      "email": "alice@example.com",
      "displayName": "Alice Chen",
      "avatarUrl": "https://cdn.yourplatform.com/avatars/alice.jpg",
      "emailVerified": true,
      "mfaEnabled": true,
      "createdAt": "2026-03-17T10:30:00.000Z",
      "updatedAt": "2026-03-17T12:00:00.000Z"
    },
    "sessions": [
      {
        "id": "sess_abc123",
        "ipAddress": "203.0.113.42",
        "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "createdAt": "2026-03-17T10:30:00.000Z",
        "lastActivityAt": "2026-03-17T14:22:00.000Z",
        "isCurrent": true
      },
      {
        "id": "sess_def456",
        "ipAddress": "198.51.100.23",
        "userAgent": "YourPlatform-iOS/3.2.1",
        "createdAt": "2026-03-15T08:00:00.000Z",
        "lastActivityAt": "2026-03-16T19:45:00.000Z",
        "isCurrent": false
      }
    ],
    "oauthProviders": [
      {
        "provider": "google",
        "email": "alice@gmail.com",
        "connectedAt": "2026-03-17T10:30:00.000Z"
      }
    ]
  }
}
```

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 401 | `SESSION_EXPIRED` | Session has been revoked |

---

## Endpoint: POST /auth/mfa/setup

Initiates MFA setup for the authenticated user. Returns a TOTP secret and QR code URL.

**Authentication:** Required (Bearer token)
**Rate Limit:** 5 requests per hour

### Request

No request body.

### Response: 200 OK

```typescript
interface MFASetupResponse {
  data: {
    secret: string;         // Base32-encoded TOTP secret
    qrCodeUrl: string;      // otpauth:// URI for QR code generation
    backupCodes: string[];  // 10 one-time backup codes
    expiresIn: number;      // Seconds to complete setup (600 = 10 min)
  };
}
```

```json
{
  "data": {
    "secret": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
    "qrCodeUrl": "otpauth://totp/YourPlatform:alice@example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=YourPlatform&algorithm=SHA1&digits=6&period=30",
    "backupCodes": [
      "A1B2-C3D4",
      "E5F6-G7H8",
      "I9J0-K1L2",
      "M3N4-O5P6",
      "Q7R8-S9T0",
      "U1V2-W3X4",
      "Y5Z6-A7B8",
      "C9D0-E1F2",
      "G3H4-I5J6",
      "K7L8-M9N0"
    ],
    "expiresIn": 600
  }
}
```

::: warning
The `secret` and `backupCodes` are shown to the user exactly once. The client must display them clearly and instruct the user to save the backup codes securely. After the setup is verified, the secret is encrypted and stored server-side. It is never returned again.
:::

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 409 | `MFA_ALREADY_ENABLED` | MFA is already active on this account |

---

## Endpoint: POST /auth/mfa/verify

Verifies a TOTP code. Used in two contexts:

1. **During MFA setup** — Confirms the user has correctly configured their authenticator app. Activates MFA on the account.
2. **During login** — Completes the MFA challenge after successful password verification. Returns auth tokens.

**Authentication:** Conditional (setup requires Bearer token, login uses MFA token)
**Rate Limit:** 5 attempts per 5 minutes per MFA challenge

### Request (During Login)

```typescript
interface MFAVerifyLoginRequest {
  mfaToken: string;        // MFA challenge token from login response
  code: string;            // 6-digit TOTP code or backup code (e.g., "A1B2-C3D4")
}
```

```json
{
  "mfaToken": "mfa_challenge_d4e5f6a7-b8c9-0123-4567-89abcdef0123",
  "code": "482917"
}
```

### Request (During Setup)

```typescript
interface MFAVerifySetupRequest {
  code: string;            // 6-digit TOTP code to confirm setup
}
```

```json
{
  "code": "482917"
}
```

### Response: 200 OK (Login Flow)

Returns the same `AuthResponse` as a successful login:

```json
{
  "data": {
    "user": {
      "id": "01913a7c-8e4b-7b3a-9d1f-2c4e6a8b0d2f",
      "email": "alice@example.com",
      "displayName": "Alice Chen",
      "avatarUrl": "https://cdn.yourplatform.com/avatars/alice.jpg",
      "emailVerified": true,
      "mfaEnabled": true,
      "createdAt": "2026-03-17T10:30:00.000Z",
      "updatedAt": "2026-03-17T12:00:00.000Z"
    },
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```

### Response: 200 OK (Setup Flow)

```json
{
  "data": {
    "mfaEnabled": true,
    "message": "MFA has been successfully enabled on your account."
  }
}
```

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 400 | `INVALID_MFA_CODE` | Code is wrong or expired |
| 401 | `INVALID_MFA_TOKEN` | MFA challenge token is invalid or expired |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many verification attempts |

### Error Example: Invalid Code

```json
{
  "error": {
    "code": "INVALID_MFA_CODE",
    "message": "The verification code is incorrect. Please try again.",
    "statusCode": 400,
    "details": [
      {
        "field": "body.code",
        "message": "TOTP code verification failed",
        "code": "invalid_code"
      }
    ],
    "requestId": "req_mfa_001",
    "timestamp": "2026-03-17T10:36:00.000Z"
  }
}
```

---

## Endpoint: POST /auth/verify-email

Verifies a user's email address using the verification token from the registration email.

**Authentication:** None
**Rate Limit:** 10 requests per hour per IP

### Request

```typescript
interface VerifyEmailRequest {
  token: string;           // Email verification token from the email link
}
```

### Response: 200 OK

```json
{
  "data": {
    "message": "Email has been verified successfully.",
    "emailVerified": true
  }
}
```

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 400 | `INVALID_VERIFICATION_TOKEN` | Token not found, expired, or already used |

---

## Endpoint: POST /auth/resend-verification

Resends the email verification email.

**Authentication:** Required (Bearer token)
**Rate Limit:** 3 requests per hour

### Request

No request body. The email is determined from the authenticated user's profile.

### Response: 202 Accepted

```json
{
  "data": {
    "message": "Verification email has been sent."
  }
}
```

---

## Endpoint: POST /auth/change-password

Changes the authenticated user's password.

**Authentication:** Required (Bearer token)
**Rate Limit:** 5 requests per hour

### Request

```typescript
interface ChangePasswordRequest {
  currentPassword: string;  // Current password for verification
  newPassword: string;      // New password (must meet strength requirements)
}
```

```json
{
  "currentPassword": "old-password-here",
  "newPassword": "new-secure-password-2026"
}
```

### Response: 200 OK

```json
{
  "data": {
    "message": "Password has been changed successfully."
  }
}
```

### Side Effects

1. All other sessions (except the current one) are revoked.
2. All other refresh tokens are revoked.
3. A `user.password_changed` event is emitted.
4. A security notification email is sent.
5. An audit log entry is created.

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | Current password is wrong |
| 422 | `WEAK_PASSWORD` | New password does not meet strength requirements |
| 422 | `PASSWORD_RECENTLY_USED` | New password matches a recent password |

---

## Endpoint: DELETE /auth/sessions/:sessionId

Revokes a specific session. Allows users to remotely log out devices.

**Authentication:** Required (Bearer token)
**Rate Limit:** 20 requests per hour

### Request

Path parameter: `sessionId` (UUID)

### Response: 204 No Content

No response body.

### Error Responses

| Status | Code | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 403 | `FORBIDDEN` | Session does not belong to the authenticated user |
| 404 | `NOT_FOUND` | Session not found |

---

## Endpoint: GET /.well-known/jwks.json

Returns the public keys used to verify JWT access tokens. This is a standard JWKS (JSON Web Key Set) endpoint used by downstream services for token verification.

**Authentication:** None
**Rate Limit:** None
**Caching:** `Cache-Control: public, max-age=3600`

### Response: 200 OK

```typescript
interface JWKSResponse {
  keys: {
    kty: 'RSA';
    use: 'sig';
    alg: 'RS256';
    kid: string;           // Key ID
    n: string;             // RSA modulus (base64url)
    e: string;             // RSA exponent (base64url)
  }[];
}
```

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "key-2026-03",
      "n": "0vx7agoebGcQSuuPiLJXZptN9nndrQm...",
      "e": "AQAB"
    },
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "key-2025-12",
      "n": "rqOtBtBN3H0ZGD1e5YbP5EUj...",
      "e": "AQAB"
    }
  ]
}
```

::: info
Multiple keys may be present during key rotation. The JWT `kid` header indicates which key to use for verification. Clients should cache the JWKS response and only refresh when encountering an unknown `kid`.
:::

---

## Endpoint: GET /auth/oauth/:provider/authorize

Initiates an OAuth login flow for the specified provider.

**Authentication:** None
**Rate Limit:** 10 requests per minute per IP

### Request

Path parameter: `provider` — one of `google`, `github`, `apple`

Query parameters:

| Parameter | Required | Description |
|---|---|---|
| `redirect_uri` | Yes | Where to redirect after OAuth (must be whitelisted) |
| `state` | No | Client-generated opaque state for CSRF protection |

### Response: 302 Found

Redirects to the OAuth provider's authorization page.

```
HTTP/1.1 302 Found
Location: https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&scope=openid+email+profile&state=...&code_challenge=...&code_challenge_method=S256&response_type=code
```

---

## Endpoint: GET /auth/oauth/:provider/callback

Handles the OAuth callback from the provider. Exchanges the authorization code for tokens, creates or links the user account, and redirects to the client application.

**Authentication:** None
**Rate Limit:** 10 requests per minute per IP

### Request

Query parameters (set by the OAuth provider):

| Parameter | Description |
|---|---|
| `code` | Authorization code from the provider |
| `state` | State parameter for CSRF verification |

### Response: 302 Found

Redirects to the client application with auth tokens:

```
HTTP/1.1 302 Found
Location: https://app.yourplatform.com/oauth/callback?access_token=eyJ...&refresh_token=f47a...&expires_in=900
```

### Error Redirect

```
HTTP/1.1 302 Found
Location: https://app.yourplatform.com/oauth/callback?error=oauth_failed&error_description=Failed+to+authenticate+with+Google
```

---

## Rate Limit Headers

All responses include rate limit headers:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1710672600
Retry-After: 893
```

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds until the next request is allowed (only on 429) |

---

## Client SDK Example

A TypeScript client that consumes this API:

```typescript
// auth-client.ts

class AuthClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async register(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<AuthResponse> {
    const res = await this.request('POST', '/auth/register', {
      ...input,
      acceptTerms: true,
    });
    this.setTokens(res.data);
    return res.data;
  }

  async login(email: string, password: string): Promise<AuthResponse | MFAChallengeResponse> {
    const res = await this.request('POST', '/auth/login', { email, password });

    if (res.data.mfaRequired) {
      return res.data as MFAChallengeResponse;
    }

    this.setTokens(res.data as AuthResponse);
    return res.data;
  }

  async verifyMFA(mfaToken: string, code: string): Promise<AuthResponse> {
    const res = await this.request('POST', '/auth/mfa/verify', { mfaToken, code });
    this.setTokens(res.data);
    return res.data;
  }

  async logout(allDevices = false): Promise<void> {
    await this.authenticatedRequest('POST', '/auth/logout', { allDevices });
    this.clearTokens();
  }

  async getMe(): Promise<MeResponse> {
    return this.authenticatedRequest('GET', '/auth/me');
  }

  private async authenticatedRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<any> {
    try {
      return await this.request(method, path, body, {
        Authorization: `Bearer ${this.accessToken}`,
      });
    } catch (error: any) {
      if (error.statusCode === 401 && error.code === 'INVALID_TOKEN') {
        await this.refreshTokens();
        return this.request(method, path, body, {
          Authorization: `Bearer ${this.accessToken}`,
        });
      }
      throw error;
    }
  }

  private async refreshTokens(): Promise<void> {
    // Deduplicate concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const res = await this.request('POST', '/auth/refresh', {
          refreshToken: this.refreshToken,
        });
        this.setTokens(res.data);
      } catch {
        this.clearTokens();
        throw new Error('Session expired. Please log in again.');
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private setTokens(data: AuthResponse): void {
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;

    // Schedule proactive refresh (refresh at 80% of lifetime)
    const refreshIn = data.expiresIn * 0.8 * 1000;
    setTimeout(() => this.refreshTokens(), refreshIn);
  }

  private clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': crypto.randomUUID(),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.json();
      const error = new Error(errorBody.error.message) as any;
      error.statusCode = errorBody.error.statusCode;
      error.code = errorBody.error.code;
      error.details = errorBody.error.details;
      throw error;
    }

    if (response.status === 204) return undefined;
    return response.json();
  }
}
```

### React Hook Example

```typescript
// useAuth.ts

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface AuthContextType {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthResponse | MFAChallengeResponse>;
  register: (input: RegisterInput) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  verifyMFA: (mfaToken: string, code: string) => Promise<AuthResponse>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const client = useMemo(() => new AuthClient('/api/v1'), []);

  useEffect(() => {
    // Check for existing session on mount
    client.getMe()
      .then(res => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, [client]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await client.login(email, password);
    if (!('mfaRequired' in result)) {
      setUser(result.user);
    }
    return result;
  }, [client]);

  const register = useCallback(async (input: RegisterInput) => {
    const result = await client.register(input);
    setUser(result.user);
    return result;
  }, [client]);

  const logout = useCallback(async () => {
    await client.logout();
    setUser(null);
  }, [client]);

  const verifyMFA = useCallback(async (mfaToken: string, code: string) => {
    const result = await client.verifyMFA(mfaToken, code);
    setUser(result.user);
    return result;
  }, [client]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      logout,
      verifyMFA,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

---

## API Versioning Strategy

The API is versioned via URL path (`/v1/auth/...`). When breaking changes are necessary:

1. Introduce the new version (`/v2/auth/...`) alongside the old one.
2. Set a deprecation header on v1 responses: `Deprecation: true`, `Sunset: 2027-01-01`.
3. Maintain v1 for at least 6 months after v2 launch.
4. Monitor v1 usage and notify consumers before shutdown.

Non-breaking changes (new optional fields, new endpoints) are added to the current version without incrementing.

---

> *"A well-documented API contract is cheaper than a well-staffed support team. Invest in the spec upfront."*
