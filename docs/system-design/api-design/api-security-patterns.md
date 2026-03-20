---
title: "API Security Patterns"
description: "Comprehensive API security — authentication methods comparison, OAuth 2.0 and JWT, rate limiting, input validation, request signing, mTLS, and API abuse prevention strategies"
tags: [api-design, security, authentication, rate-limiting, best-practices]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-20"
---

# API Security Patterns

API security is not a feature you bolt on after the API is built. It is a design concern that shapes every decision — from URL structure to error messages, from header requirements to rate limit thresholds. A single misconfigured endpoint can expose customer data, drain your infrastructure budget, or become the entry point for a full system compromise.

This page covers authentication, authorization, rate limiting, input validation, request signing, and abuse prevention as an integrated security architecture.

## Authentication Methods Compared

Authentication answers "who is making this request?" The right method depends on your consumers, your security requirements, and your operational complexity budget.

### Overview

```mermaid
graph TD
    A{Who is the consumer?}
    A -->|Server-to-server| B{Sensitivity?}
    A -->|User-facing app| C[OAuth 2.0 + JWT]
    A -->|Third-party integration| D[API Keys + OAuth]
    A -->|Internal microservice| E{Trust boundary?}

    B -->|High: financial, PII| F[mTLS + OAuth 2.0]
    B -->|Standard| G[OAuth 2.0 client credentials]

    E -->|Same cluster| H[mTLS or service mesh]
    E -->|Cross-cluster| G

    style C fill:#4dabf7,color:#000
    style F fill:#ff6b6b,color:#fff
    style G fill:#69db7c,color:#000
```

### Comparison Table

| Method | Security Level | Consumer Type | Complexity | Revocability |
|--------|:-------------:|---------------|:----------:|:------------:|
| **API Keys** | Medium | Third-party developers | Low | Immediate |
| **OAuth 2.0 + JWT** | High | User-facing applications | High | Token expiry |
| **JWT (standalone)** | Medium-High | Internal services | Medium | Difficult* |
| **mTLS** | Very High | Service-to-service | High | Certificate revocation |
| **HMAC Request Signing** | High | Partner integrations | Medium | Key rotation |
| **Basic Auth** | Low | Development/testing only | Very Low | Immediate |

*JWT revocation requires a blocklist or short-lived tokens with refresh rotation.

## API Keys

API keys are the simplest authentication mechanism — a long random string passed in every request.

```
GET /api/orders
X-API-Key: sk_live_xK8dL2mN9pQrStUvWxYzAbCdEfGhIjKlMnOpQr
```

### Implementation

```typescript
import crypto from 'crypto';

// Key generation — use cryptographically secure randomness
function generateApiKey(prefix: string = 'sk_live'): string {
  const random = crypto.randomBytes(32).toString('base64url');
  return `${prefix}_${random}`;
}

// Key storage — NEVER store raw keys
// Store a hash; the raw key is shown to the user exactly once
async function createApiKey(userId: string): Promise<string> {
  const rawKey = generateApiKey();
  const keyHash = crypto
    .createHash('sha256')
    .update(rawKey)
    .digest('hex');

  await db.query(
    `INSERT INTO api_keys (hash, user_id, prefix, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [keyHash, userId, rawKey.substring(0, 10)] // Store prefix for identification
  );

  return rawKey; // Return raw key to user; never store or log it
}

// Key validation middleware
async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-api-key'] as string;
  if (!key) {
    return res.status(401).json({
      type: 'https://api.example.com/errors/missing-api-key',
      title: 'API key required',
      status: 401
    });
  }

  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const result = await db.query(
    'SELECT user_id, scopes, rate_limit FROM api_keys WHERE hash = $1 AND revoked_at IS NULL',
    [keyHash]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({
      type: 'https://api.example.com/errors/invalid-api-key',
      title: 'Invalid API key',
      status: 401
    });
  }

  req.apiKey = result.rows[0];
  next();
}
```

::: warning
API keys should be treated like passwords — hash before storing, transmit only over HTTPS, and allow immediate revocation. Never log API keys or include them in URLs (they appear in server logs and browser history).
:::

### Key Scoping

Limit what each API key can do:

```json
{
  "key_id": "key_abc123",
  "scopes": ["orders:read", "orders:write", "customers:read"],
  "rate_limit": 1000,
  "allowed_ips": ["203.0.113.0/24"],
  "expires_at": "2027-03-15T00:00:00Z"
}
```

## OAuth 2.0 and JWT

OAuth 2.0 is the industry standard for delegated authorization. Combined with JWT (JSON Web Tokens) for access tokens, it provides a comprehensive auth framework.

### OAuth 2.0 Flows

| Flow | Use Case | Token Type |
|------|----------|------------|
| **Authorization Code + PKCE** | Single-page apps, mobile apps | Short-lived access token + refresh token |
| **Client Credentials** | Server-to-server, machine-to-machine | Access token only |
| **Device Code** | Smart TVs, CLI tools | Access token after user approves on another device |

```mermaid
sequenceDiagram
    participant User
    participant App
    participant AuthServer
    participant API

    Note over App,AuthServer: Authorization Code + PKCE Flow
    App->>App: Generate code_verifier + code_challenge
    App->>AuthServer: GET /authorize?code_challenge=...
    AuthServer->>User: Login prompt
    User->>AuthServer: Credentials
    AuthServer->>App: Authorization code
    App->>AuthServer: POST /token (code + code_verifier)
    AuthServer->>App: Access token + Refresh token
    App->>API: GET /orders (Bearer token)
    API->>API: Validate JWT
    API->>App: 200 OK
```

### JWT Structure and Validation

```typescript
// JWT payload (claims)
interface JwtPayload {
  // Standard claims
  iss: string;   // Issuer (your auth server)
  sub: string;   // Subject (user ID)
  aud: string;   // Audience (this API)
  exp: number;   // Expiration time (Unix timestamp)
  iat: number;   // Issued at
  jti: string;   // JWT ID (unique identifier)

  // Custom claims
  scope: string;      // Space-separated scopes
  org_id: string;     // Organization context
  role: string;       // User role
}

// JWT validation — ALWAYS validate ALL of these
async function validateJwt(token: string): Promise<JwtPayload> {
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],      // Never allow 'none' or symmetric algorithms
    issuer: 'https://auth.example.com',
    audience: 'https://api.example.com',
    clockTolerance: 30          // 30 seconds of clock skew tolerance
  }) as JwtPayload;

  // Additional checks
  if (await isTokenRevoked(decoded.jti)) {
    throw new Error('Token has been revoked');
  }

  return decoded;
}
```

### Token Lifetime Strategy

| Token Type | Lifetime | Storage | Rotation |
|------------|----------|---------|----------|
| **Access token** | 15 minutes | Memory only | Refresh when expired |
| **Refresh token** | 7-30 days | Secure HTTP-only cookie or encrypted storage | Rotate on each use (one-time use) |
| **ID token** | Same as access token | Memory only | Re-fetch with refresh token |

::: danger
Never store access tokens in `localStorage` — it is accessible to any JavaScript on the page (XSS attack vector). Use memory variables for SPAs and secure HTTP-only cookies for server-rendered apps.
:::

### Refresh Token Rotation

```typescript
app.post('/auth/token/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  // Validate the refresh token
  const tokenRecord = await db.query(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND used = false',
    [hash(refresh_token)]
  );

  if (!tokenRecord.rows[0]) {
    // Token is missing or already used — potential theft
    // Revoke ALL tokens for this user (security measure)
    await db.query(
      'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1',
      [getUserFromToken(refresh_token)]
    );
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  // Mark current refresh token as used
  await db.query(
    'UPDATE refresh_tokens SET used = true WHERE id = $1',
    [tokenRecord.rows[0].id]
  );

  // Issue new tokens
  const newAccessToken = generateAccessToken(tokenRecord.rows[0].user_id);
  const newRefreshToken = generateRefreshToken(tokenRecord.rows[0].user_id);

  res.json({
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    expires_in: 900 // 15 minutes
  });
});
```

## Mutual TLS (mTLS)

mTLS extends standard TLS by requiring both the server and client to present certificates. This provides the strongest authentication guarantee — the client must possess a private key that matches a certificate trusted by the server.

```mermaid
sequenceDiagram
    participant Client
    participant Server

    Client->>Server: ClientHello
    Server->>Client: ServerHello + Server Certificate
    Server->>Client: CertificateRequest
    Client->>Server: Client Certificate + CertificateVerify
    Server->>Server: Verify client certificate against CA
    Note over Client,Server: Mutual authentication complete
    Client->>Server: Encrypted API request
```

### When to Use mTLS

- Service-to-service communication within your infrastructure
- Zero-trust network architectures
- Financial APIs and healthcare systems with strict compliance requirements
- API connections where API keys or JWT are insufficient

```yaml
# Nginx mTLS configuration
server {
    listen 443 ssl;

    # Server certificate
    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;

    # Client certificate verification
    ssl_client_certificate /etc/nginx/certs/trusted-ca.crt;
    ssl_verify_client on;
    ssl_verify_depth 2;

    location /api/ {
        # Pass client certificate info to backend
        proxy_set_header X-Client-Cert-DN $ssl_client_s_dn;
        proxy_set_header X-Client-Cert-Serial $ssl_client_serial;
        proxy_pass http://backend;
    }
}
```

## Rate Limiting and Throttling

Rate limiting prevents abuse, ensures fair usage, and protects your infrastructure from overload. It answers the question: "how much of this API can any single consumer use?"

### Rate Limiting Algorithms

| Algorithm | Behavior | Burst Handling | Complexity |
|-----------|----------|:--------------:|:----------:|
| **Fixed Window** | Count resets at interval boundaries | Allows 2x burst at window edges | Low |
| **Sliding Window** | Weighted average of current and previous window | Smooth | Medium |
| **Token Bucket** | Tokens refill at constant rate; each request consumes a token | Allows burst up to bucket size | Medium |
| **Leaky Bucket** | Requests queue; processed at constant rate | No burst (strictly smooth) | Medium |

For a deep dive with implementation, see [Rate Limiter Algorithms](/production-blueprints/rate-limiter/algorithms).

### Implementation with Redis

```typescript
import Redis from 'ioredis';

const redis = new Redis();

// Sliding window rate limiter
async function slidingWindowRateLimit(
  identifier: string,  // API key, user ID, or IP
  limit: number,       // Max requests per window
  windowMs: number     // Window size in milliseconds
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `ratelimit:${identifier}`;

  // Use Redis sorted set: score = timestamp, member = unique request ID
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart); // Remove expired entries
  pipeline.zadd(key, now.toString(), `${now}:${Math.random()}`); // Add current request
  pipeline.zcard(key);                             // Count requests in window
  pipeline.expire(key, Math.ceil(windowMs / 1000)); // TTL for cleanup

  const results = await pipeline.exec();
  const count = results![2][1] as number;

  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const resetAt = now + windowMs;

  if (!allowed) {
    // Remove the request we just added since it is denied
    await redis.zremrangebyscore(key, now, now);
  }

  return { allowed, remaining, resetAt };
}

// Rate limiting middleware
async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const identifier = req.apiKey?.id || req.ip;
  const limit = req.apiKey?.rate_limit || 100; // Per-key limits

  const result = await slidingWindowRateLimit(identifier, limit, 60000);

  // Always set rate limit headers
  res.set({
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString()
  });

  if (!result.allowed) {
    res.set('Retry-After', '60');
    return res.status(429).json({
      type: 'https://api.example.com/errors/rate-limited',
      title: 'Rate limit exceeded',
      status: 429,
      detail: `Rate limit of ${limit} requests per minute exceeded. Retry after ${res.get('Retry-After')} seconds.`
    });
  }

  next();
}
```

### Tiered Rate Limits

```json
{
  "plans": {
    "free": {
      "requests_per_minute": 60,
      "requests_per_day": 1000,
      "burst_size": 10
    },
    "pro": {
      "requests_per_minute": 600,
      "requests_per_day": 50000,
      "burst_size": 100
    },
    "enterprise": {
      "requests_per_minute": 6000,
      "requests_per_day": 500000,
      "burst_size": 1000
    }
  }
}
```

### Rate Limit Response Headers

Always include rate limit information in every response — not just when the limit is exceeded:

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 742
X-RateLimit-Reset: 1679961600
```

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1679961600
Retry-After: 47
```

## Input Validation and Sanitization

Never trust client input. Validate everything at the API boundary — before it reaches your business logic or database.

### Validation with Zod (TypeScript)

```typescript
import { z } from 'zod';

const CreateOrderSchema = z.object({
  items: z.array(z.object({
    product_id: z.string()
      .regex(/^prod_[a-zA-Z0-9]+$/, 'Invalid product ID format'),
    quantity: z.number()
      .int()
      .min(1, 'Quantity must be at least 1')
      .max(999, 'Quantity cannot exceed 999')
  })).min(1, 'At least one item required')
    .max(100, 'Maximum 100 items per order'),

  shipping_address: z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    country: z.string().length(2, 'Use ISO 3166-1 alpha-2 country code'),
    postal_code: z.string().min(3).max(20)
  }),

  notes: z.string().max(500).optional(),

  // Prevent prototype pollution and injection
  metadata: z.record(z.string(), z.string())
    .optional()
    .refine(
      (obj) => !obj || Object.keys(obj).length <= 10,
      'Maximum 10 metadata entries'
    )
});

// Validation middleware
function validate<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(422).json({
        type: 'https://api.example.com/errors/validation-error',
        title: 'Validation Failed',
        status: 422,
        errors: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          code: issue.code,
          message: issue.message
        }))
      });
    }

    req.validatedBody = result.data;
    next();
  };
}

app.post('/api/orders', validate(CreateOrderSchema), createOrderHandler);
```

### Common Injection Vectors

| Attack | Input | Prevention |
|--------|-------|------------|
| **SQL Injection** | `'; DROP TABLE users--` | Parameterized queries (never string concatenation) |
| **NoSQL Injection** | `{ "$gt": "" }` in JSON field | Validate types strictly; reject operators in values |
| **XSS via API** | `<script>alert(1)</script>` in stored fields | HTML-encode output; use CSP headers |
| **Path Traversal** | `../../etc/passwd` in file parameter | Validate against allowlist; use `path.resolve` + prefix check |
| **Prototype Pollution** | `{ "__proto__": { "admin": true } }` | Sanitize JSON keys; use `Object.create(null)` |
| **SSRF** | Internal IP in URL parameter | Validate URLs against allowlist; block RFC 1918 addresses |

::: danger
SQL injection is still the #1 vulnerability in web applications. Always use parameterized queries. Never build SQL strings by concatenating user input, even if you "sanitize" it first.
:::

## Request Signing (AWS Signature V4 Style)

Request signing proves that the request was created by someone with the secret key and has not been tampered with in transit. Unlike bearer tokens, the secret is never transmitted.

### How It Works

```
1. Client constructs a "canonical request" from method, path, query, headers, and body
2. Client creates a "string to sign" from the canonical request hash + timestamp
3. Client generates a signature using HMAC-SHA256 with their secret key
4. Client sends the request with the signature in the Authorization header
5. Server reconstructs the same canonical request and verifies the signature
```

### Implementation

```typescript
import crypto from 'crypto';

interface SigningParams {
  method: string;
  path: string;
  queryString: string;
  headers: Record<string, string>;
  body: string;
  accessKeyId: string;
  secretKey: string;
  timestamp: string; // ISO 8601
}

function signRequest(params: SigningParams): string {
  const {
    method, path, queryString, headers, body,
    accessKeyId, secretKey, timestamp
  } = params;

  // Step 1: Canonical request
  const signedHeaders = Object.keys(headers)
    .map(k => k.toLowerCase())
    .sort()
    .join(';');

  const canonicalHeaders = Object.entries(headers)
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}`)
    .sort()
    .join('\n');

  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');

  const canonicalRequest = [
    method.toUpperCase(),
    path,
    queryString,
    canonicalHeaders,
    '',
    signedHeaders,
    bodyHash
  ].join('\n');

  // Step 2: String to sign
  const canonicalRequestHash = crypto
    .createHash('sha256')
    .update(canonicalRequest)
    .digest('hex');

  const dateStamp = timestamp.substring(0, 10).replace(/-/g, '');
  const credentialScope = `${dateStamp}/api/request`;

  const stringToSign = [
    'MYAPP-HMAC-SHA256',
    timestamp,
    credentialScope,
    canonicalRequestHash
  ].join('\n');

  // Step 3: Signing key (derived from secret)
  const dateKey = crypto
    .createHmac('sha256', `MYAPP${secretKey}`)
    .update(dateStamp)
    .digest();

  const signingKey = crypto
    .createHmac('sha256', dateKey)
    .update('api')
    .digest();

  // Step 4: Signature
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(stringToSign)
    .digest('hex');

  return `MYAPP-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
         `SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

// Usage
const authHeader = signRequest({
  method: 'POST',
  path: '/api/orders',
  queryString: '',
  headers: {
    'Host': 'api.example.com',
    'Content-Type': 'application/json',
    'X-Timestamp': '2026-03-15T10:30:00Z'
  },
  body: JSON.stringify({ product_id: 'prod_1', quantity: 2 }),
  accessKeyId: 'AKID_abc123',
  secretKey: 'secret_xyz789',
  timestamp: '2026-03-15T10:30:00Z'
});

// Authorization: MYAPP-HMAC-SHA256 Credential=AKID_abc123/20260315/api/request,
//   SignedHeaders=content-type;host;x-timestamp, Signature=a1b2c3d4...
```

### When to Use Request Signing

- **Financial APIs** where tamper-proof requests are required
- **Webhook delivery** (simpler HMAC variant — see [Webhooks](/system-design/api-design/webhooks))
- **Partner APIs** where both sides need non-repudiation
- **Infrastructure APIs** (AWS, Azure, GCP all use request signing)

## API Abuse Prevention

Beyond rate limiting, sophisticated abuse requires layered defenses.

### Defense Layers

```mermaid
graph TD
    A[Incoming Request] --> B{TLS Valid?}
    B -->|No| X1[Reject]
    B -->|Yes| C{Auth Valid?}
    C -->|No| X2[401 Unauthorized]
    C -->|Yes| D{Rate Limited?}
    D -->|Yes| X3[429 Too Many Requests]
    D -->|No| E{Input Valid?}
    E -->|No| X4[422 Validation Error]
    E -->|Yes| F{Behavioral Analysis}
    F -->|Suspicious| G[Challenge / Throttle]
    F -->|Normal| H[Process Request]

    style X1 fill:#ff6b6b,color:#fff
    style X2 fill:#ff6b6b,color:#fff
    style X3 fill:#ffa94d,color:#000
    style X4 fill:#ffa94d,color:#000
    style G fill:#ffa94d,color:#000
    style H fill:#69db7c,color:#000
```

### Behavioral Signals

| Signal | Normal | Suspicious |
|--------|--------|------------|
| **Request rate** | Consistent, within limits | Burst patterns, near limits |
| **Endpoint distribution** | Mix of endpoints | Repeated access to sensitive endpoints |
| **Error rate** | < 5% | > 30% (scanning, fuzzing) |
| **Response data volume** | Stable | Rapid increase (scraping) |
| **Time pattern** | Business hours or cron-like | 24/7 continuous |
| **User-Agent** | Consistent | Rotating or spoofed |
| **Geographic origin** | Consistent | Rapid changes (credential stuffing from botnets) |

### Practical Abuse Prevention

```typescript
// Track behavioral metrics per API key
interface BehaviorMetrics {
  requestCount: number;
  errorCount: number;
  uniqueEndpoints: Set<string>;
  dataVolumeBytes: number;
  windowStart: number;
}

async function detectAbuse(
  apiKeyId: string,
  endpoint: string,
  responseStatus: number,
  responseSize: number
): Promise<'allow' | 'throttle' | 'block'> {
  const metrics = await getMetrics(apiKeyId);

  const errorRate = metrics.errorCount / metrics.requestCount;
  const requestRate = metrics.requestCount / getWindowMinutes(metrics);

  // High error rate suggests scanning or fuzzing
  if (errorRate > 0.5 && metrics.requestCount > 50) {
    await alertSecurityTeam(apiKeyId, 'High error rate', errorRate);
    return 'throttle';
  }

  // Unusual data volume suggests scraping
  if (metrics.dataVolumeBytes > 100 * 1024 * 1024) { // 100MB in window
    await alertSecurityTeam(apiKeyId, 'High data volume', metrics.dataVolumeBytes);
    return 'throttle';
  }

  // Concentrated access to auth endpoints suggests brute force
  const authEndpointRatio = countAuthEndpoints(metrics) / metrics.requestCount;
  if (authEndpointRatio > 0.8 && metrics.requestCount > 20) {
    return 'block';
  }

  return 'allow';
}
```

### Security Response Headers

Include these headers on every API response:

```typescript
app.use((req, res, next) => {
  // Prevent MIME type sniffing
  res.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking (if API serves HTML errors)
  res.set('X-Frame-Options', 'DENY');

  // Strict transport security
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // No caching for authenticated responses
  if (req.headers.authorization) {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
  }

  // Remove server identification
  res.removeHeader('X-Powered-By');

  // Request ID for tracing
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.set('X-Request-Id', requestId);

  next();
});
```

## Security Checklist

Use this checklist for every API you ship:

**Authentication:**
- [ ] All endpoints require authentication (except public health check)
- [ ] Tokens have appropriate expiration times
- [ ] Refresh token rotation is implemented
- [ ] API keys are hashed before storage
- [ ] Failed auth attempts are rate-limited (prevent brute force)

**Authorization:**
- [ ] Every endpoint checks authorization (not just authentication)
- [ ] Users cannot access other users' resources (broken object-level authorization)
- [ ] Endpoints enforce minimum required scopes
- [ ] Admin endpoints are on a separate path with additional verification

**Transport:**
- [ ] HTTPS required (HTTP redirects to HTTPS or returns 403)
- [ ] TLS 1.2+ enforced (1.0 and 1.1 disabled)
- [ ] HSTS header set with long max-age

**Input:**
- [ ] All input is validated against a strict schema
- [ ] File uploads are restricted by type and size
- [ ] SQL queries use parameterized statements
- [ ] User-supplied URLs are validated against allowlist

**Output:**
- [ ] Error messages do not leak stack traces or internal details
- [ ] Responses do not include fields the consumer is not authorized to see
- [ ] Sensitive data (passwords, secrets) is never returned in responses
- [ ] List endpoints are paginated with enforced limits

**Operational:**
- [ ] Rate limiting is enabled with appropriate thresholds
- [ ] All authentication events are logged (login, logout, failed attempts)
- [ ] API keys and tokens can be revoked immediately
- [ ] Security headers are set on all responses

## Further Reading

- [REST API Best Practices](/system-design/api-design/rest-best-practices) — error handling and status code design
- [Webhooks](/system-design/api-design/webhooks) — HMAC signature verification for webhook delivery
- [Rate Limiter Blueprint](/production-blueprints/rate-limiter/) — full implementation of rate limiting infrastructure
- [API Key Design](/security/authentication/api-key-design) — deep dive on API key lifecycle management
- [OWASP API Security](/security/owasp/) — the OWASP Top 10 for API security
- [CSP Headers](/security/api-security/csp-headers) — content security policy for API responses
