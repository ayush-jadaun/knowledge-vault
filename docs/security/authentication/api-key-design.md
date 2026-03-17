---
title: "API Key Design"
description: "Key generation, hashing, rotation, rate limiting, and production-grade API key management"
tags: [security, authentication, api-keys, rate-limiting, key-management]
difficulty: "intermediate"
prerequisites: [session-management, hashing-algorithms]
lastReviewed: "2026-03-18"
---

# API Key Design

## Why API Keys Exist

API keys are the simplest form of machine-to-machine authentication. Unlike user-facing authentication (passwords, passkeys), API keys authenticate *applications*, *services*, and *automated processes*. They answer the question: "Which application is making this request?"

Every major platform uses API keys: Stripe, AWS, Twilio, GitHub, Google Cloud. Despite being conceptually simple, the design of an API key system has enormous security implications. A poorly designed system leads to leaked keys, billing fraud, and data breaches.

### Historical Context

API keys evolved from simple shared secrets to sophisticated systems:

- **2000s**: Simple API keys — long random strings passed in query parameters
- **2010s**: Bearer tokens, key hashing, prefix-based identification
- **2015+**: Scoped keys, short-lived tokens, key rotation automation
- **2020+**: Fine-grained permissions, usage-based rate limiting, key provenance tracking

## First Principles

### What an API Key Actually Is

An API key is a **bearer credential** — anyone who possesses the key can use it. This is fundamentally different from challenge-response authentication (like passwords + sessions or WebAuthn).

$$
\text{API Key Security} = f(\text{entropy}, \text{storage}, \text{transmission}, \text{scope}, \text{rotation})
$$

The security of an API key system depends on every link in this chain. A 256-bit key is useless if it's logged to stdout or committed to GitHub.

### The Trust Model

```mermaid
graph TB
    subgraph "API Key Trust Model"
        K[API Key] --> ID[Identifies the caller]
        K --> AUTH[Authenticates the caller]
        K --> SCOPE[Defines permissions]
        K --> RATE[Controls rate limits]
        K --> AUDIT[Enables audit trail]
    end

    subgraph "What API Keys Do NOT Provide"
        NO1[User identity within the app]
        NO2[Replay protection]
        NO3[Non-repudiation]
        NO4[Forward secrecy]
    end

    style K fill:#e3f2fd
    style NO1 fill:#ffebee
    style NO2 fill:#ffebee
    style NO3 fill:#ffebee
    style NO4 fill:#ffebee
```

### Key Properties Every API Key System Needs

1. **Identifiability**: Given a key, quickly look it up without scanning all keys
2. **Verifiability**: Confirm the key is valid without storing the raw key
3. **Revocability**: Instantly invalidate a compromised key
4. **Scoping**: Limit what each key can do
5. **Auditability**: Track every use of every key

## Core Mechanics

### API Key Anatomy

A well-designed API key has a structured format:

```
sk_live_KjG7dH3fNwQ9v2xR5mP8yT1uZ4bE6cA
│  │    │
│  │    └── Random payload (base62, 32 chars = ~190 bits entropy)
│  └── Environment prefix (live/test/staging)
└── Key type prefix (sk = secret key, pk = publishable key)
```

This structure serves multiple purposes:

| Component | Purpose | Example |
|-----------|---------|---------|
| Type prefix | Quick identification in logs, code | `sk_`, `pk_`, `rk_` |
| Environment | Prevent test/production confusion | `live`, `test` |
| Random payload | The actual secret | `KjG7dH3f...` |

### Key Generation Architecture

```mermaid
flowchart TB
    subgraph "Key Generation"
        A[Request New Key] --> B[Generate Random Bytes]
        B --> C[Encode as Base62]
        C --> D[Add Prefix]
        D --> E[Compute Short Hash - first 8 chars]
    end

    subgraph "Storage"
        E --> F[Store: prefix + short_hash + SHA-256 full hash]
        D --> G[Display to user ONCE]
        G --> H[User copies key]
    end

    subgraph "Verification"
        I[Incoming Request] --> J[Extract prefix + short_hash]
        J --> K[Database lookup by prefix_shortHash]
        K --> L[SHA-256 hash the submitted key]
        L --> M[Constant-time compare with stored hash]
    end

    style G fill:#fff3e0
    style H fill:#fff3e0
```

### The Two-Part Key Pattern

The most important design pattern for API keys is separating the **lookup component** from the **verification component**:

```
Full key:    sk_live_KjG7dH3fNwQ9v2xR5mP8yT1uZ4bE6cA
                     ^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^
                     Lookup   Verification (hashed)
                     (plaintext, indexable)
```

- **Lookup part** (first 8 chars): Stored in plaintext, used as a database index
- **Verification part** (remaining chars): Only the SHA-256 hash is stored

This means you can find the key record by the lookup part in O(1), then verify the full key by hashing and comparing. You never need to hash every key in the database.

## Implementation

### Key Generation Service

```typescript
import crypto from 'node:crypto';

interface APIKeyConfig {
  prefix: string;        // e.g., 'sk'
  environment: string;   // e.g., 'live', 'test'
  payloadLength: number; // Random bytes (default: 24 = 32 base62 chars)
}

interface GeneratedKey {
  fullKey: string;       // Shown to user once, never stored
  keyId: string;         // Prefix + lookup portion for identification
  hashedKey: string;     // SHA-256 hash for verification
  prefix: string;        // For display and filtering
  shortHash: string;     // First 8 chars for lookup
  lastFour: string;      // Last 4 chars for user identification
  createdAt: Date;
}

const BASE62_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function base62Encode(buffer: Buffer): string {
  let result = '';
  for (const byte of buffer) {
    result += BASE62_CHARS[byte % 62];
  }
  return result;
}

function generateAPIKey(config: APIKeyConfig): GeneratedKey {
  // Generate cryptographically random bytes
  const randomBytes = crypto.randomBytes(config.payloadLength);
  const payload = base62Encode(randomBytes);

  // Construct the full key
  const fullKey = `${config.prefix}_${config.environment}_${payload}`;

  // Compute SHA-256 hash of the full key for storage
  const hashedKey = crypto
    .createHash('sha256')
    .update(fullKey)
    .digest('hex');

  // Short hash for O(1) lookup (first 8 chars of payload)
  const shortHash = payload.substring(0, 8);

  // Last 4 chars for user-facing identification
  const lastFour = payload.substring(payload.length - 4);

  // Key ID combines prefix + environment + short hash
  const keyId = `${config.prefix}_${config.environment}_${shortHash}`;

  return {
    fullKey,
    keyId,
    hashedKey,
    prefix: `${config.prefix}_${config.environment}`,
    shortHash,
    lastFour,
    createdAt: new Date(),
  };
}

// Usage
const key = generateAPIKey({
  prefix: 'sk',
  environment: 'live',
  payloadLength: 24,
});

console.log('Give this to the user (shown once):');
console.log(key.fullKey);
// sk_live_KjG7dH3fNwQ9v2xR5mP8yT1uZ4bE6cA

console.log('Store in database:');
console.log({
  keyId: key.keyId,
  hashedKey: key.hashedKey,
  lastFour: key.lastFour,
  // Never store key.fullKey!
});
```

### Key Verification Middleware

```typescript
import crypto from 'node:crypto';
import { Redis } from 'ioredis';

interface StoredKeyRecord {
  id: string;
  hashedKey: string;
  organizationId: string;
  scopes: string[];
  rateLimit: number;      // Requests per minute
  expiresAt: Date | null;
  isRevoked: boolean;
  lastUsed: Date;
  createdAt: Date;
  metadata: Record<string, string>;
}

interface VerificationResult {
  valid: boolean;
  keyRecord?: StoredKeyRecord;
  error?: string;
}

class APIKeyVerifier {
  private db: any; // Your database client
  private redis: Redis;
  private verificationCache: Map<string, { result: VerificationResult; expiresAt: number }>;

  constructor(db: any, redis: Redis) {
    this.db = db;
    this.redis = redis;
    this.verificationCache = new Map();
  }

  /**
   * Verify an API key from the Authorization header.
   * Expects: "Bearer sk_live_KjG7dH3fNwQ9v2xR5mP8yT1uZ4bE6cA"
   */
  async verify(authHeader: string | undefined): Promise<VerificationResult> {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { valid: false, error: 'Missing or malformed Authorization header' };
    }

    const fullKey = authHeader.substring(7); // Remove "Bearer "

    // Validate key format
    const keyRegex = /^(sk|pk|rk)_(live|test|staging)_[A-Za-z0-9]{24,}$/;
    if (!keyRegex.test(fullKey)) {
      return { valid: false, error: 'Invalid key format' };
    }

    // Extract the lookup portion
    const parts = fullKey.split('_');
    const prefix = `${parts[0]}_${parts[1]}`;
    const payload = parts[2];
    const shortHash = payload.substring(0, 8);
    const keyId = `${prefix}_${shortHash}`;

    // Check in-memory cache first (short TTL)
    const cached = this.verificationCache.get(fullKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // Look up the key record by keyId (O(1) indexed lookup)
    const record: StoredKeyRecord | null = await this.db.apiKeys.findUnique({
      where: { keyId },
    });

    if (!record) {
      return { valid: false, error: 'Key not found' };
    }

    // Check revocation
    if (record.isRevoked) {
      return { valid: false, error: 'Key has been revoked' };
    }

    // Check expiration
    if (record.expiresAt && record.expiresAt < new Date()) {
      return { valid: false, error: 'Key has expired' };
    }

    // Hash the submitted key and compare
    const hashedSubmitted = crypto
      .createHash('sha256')
      .update(fullKey)
      .digest('hex');

    // Constant-time comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hashedSubmitted, 'hex'),
      Buffer.from(record.hashedKey, 'hex')
    );

    if (!isValid) {
      return { valid: false, error: 'Invalid key' };
    }

    const result: VerificationResult = { valid: true, keyRecord: record };

    // Cache the result for 30 seconds
    this.verificationCache.set(fullKey, {
      result,
      expiresAt: Date.now() + 30_000,
    });

    // Update last used timestamp asynchronously (non-blocking)
    this.updateLastUsed(record.id).catch(console.error);

    return result;
  }

  private async updateLastUsed(keyId: string): Promise<void> {
    // Batch updates to avoid writing on every request
    const batchKey = `key:lastused:${keyId}`;
    const count = await this.redis.incr(batchKey);
    if (count === 1) {
      await this.redis.expire(batchKey, 60); // Flush every 60 seconds
    }
    if (count >= 100 || count === 1) {
      await this.db.apiKeys.update({
        where: { id: keyId },
        data: { lastUsed: new Date() },
      });
    }
  }
}
```

### Rate Limiting per API Key

```typescript
import { Redis } from 'ioredis';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

class SlidingWindowRateLimiter {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Sliding window rate limiter using Redis sorted sets.
   * More accurate than fixed-window counters.
   */
  async checkRateLimit(
    keyId: string,
    limit: number,
    windowSeconds: number = 60
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const redisKey = `ratelimit:${keyId}`;

    // Use a pipeline for atomic operations
    const pipeline = this.redis.pipeline();

    // Remove entries outside the window
    pipeline.zremrangebyscore(redisKey, 0, windowStart);

    // Count entries in the window
    pipeline.zcard(redisKey);

    // Add the current request (we'll remove it if over limit)
    const requestId = `${now}:${Math.random().toString(36).substring(2, 8)}`;
    pipeline.zadd(redisKey, now, requestId);

    // Set expiry on the key
    pipeline.expire(redisKey, windowSeconds);

    const results = await pipeline.exec();
    const currentCount = (results?.[1]?.[1] as number) ?? 0;

    if (currentCount >= limit) {
      // Over limit — remove the request we just added
      await this.redis.zrem(redisKey, requestId);

      // Find the oldest entry to calculate retry-after
      const oldest = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      const oldestTimestamp = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
      const retryAfter = Math.ceil((oldestTimestamp + windowSeconds * 1000 - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(oldestTimestamp + windowSeconds * 1000),
        retryAfter: Math.max(1, retryAfter),
      };
    }

    return {
      allowed: true,
      remaining: limit - currentCount - 1,
      resetAt: new Date(now + windowSeconds * 1000),
    };
  }
}
```

### Express Middleware Putting It All Together

```typescript
import { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  apiKey?: StoredKeyRecord;
}

function apiKeyAuth(verifier: APIKeyVerifier, rateLimiter: SlidingWindowRateLimiter) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // 1. Verify the API key
    const result = await verifier.verify(req.headers.authorization);

    if (!result.valid || !result.keyRecord) {
      res.status(401).json({
        error: 'unauthorized',
        message: result.error ?? 'Invalid API key',
      });
      return;
    }

    // 2. Check rate limit
    const rateResult = await rateLimiter.checkRateLimit(
      result.keyRecord.id,
      result.keyRecord.rateLimit
    );

    // Set rate limit headers (standard draft)
    res.set('X-RateLimit-Limit', result.keyRecord.rateLimit.toString());
    res.set('X-RateLimit-Remaining', rateResult.remaining.toString());
    res.set('X-RateLimit-Reset', Math.floor(rateResult.resetAt.getTime() / 1000).toString());

    if (!rateResult.allowed) {
      res.set('Retry-After', (rateResult.retryAfter ?? 60).toString());
      res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Too many requests',
        retryAfter: rateResult.retryAfter,
      });
      return;
    }

    // 3. Attach key record to request
    req.apiKey = result.keyRecord;
    next();
  };
}

// Scope checking middleware
function requireScope(...requiredScopes: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const hasAllScopes = requiredScopes.every(
      (scope) => req.apiKey!.scopes.includes(scope) || req.apiKey!.scopes.includes('*')
    );

    if (!hasAllScopes) {
      res.status(403).json({
        error: 'insufficient_scope',
        message: `Required scopes: ${requiredScopes.join(', ')}`,
        available: req.apiKey.scopes,
      });
      return;
    }

    next();
  };
}

// Usage
app.get(
  '/api/v1/customers',
  apiKeyAuth(verifier, rateLimiter),
  requireScope('customers:read'),
  async (req: AuthenticatedRequest, res) => {
    // req.apiKey is available with organization context
    const customers = await db.customers.findMany({
      where: { organizationId: req.apiKey!.organizationId },
    });
    res.json({ data: customers });
  }
);
```

### Key Rotation System

```typescript
interface RotationPlan {
  newKey: GeneratedKey;
  oldKeyGracePeriodHours: number;
  notifyWebhookUrl?: string;
}

class KeyRotationService {
  private db: any;
  private keyGenerator: typeof generateAPIKey;

  constructor(db: any) {
    this.db = db;
    this.keyGenerator = generateAPIKey;
  }

  /**
   * Rotate an API key with a grace period for the old key.
   * The old key continues working during the grace period.
   */
  async rotateKey(
    oldKeyId: string,
    gracePeriodHours: number = 24
  ): Promise<RotationPlan> {
    const oldRecord = await this.db.apiKeys.findUnique({
      where: { id: oldKeyId },
    });

    if (!oldRecord) {
      throw new Error('Key not found');
    }

    // Generate new key with same properties
    const newKey = this.keyGenerator({
      prefix: oldRecord.prefix.split('_')[0],
      environment: oldRecord.prefix.split('_')[1],
      payloadLength: 24,
    });

    // Create the new key record
    await this.db.apiKeys.create({
      data: {
        keyId: newKey.keyId,
        hashedKey: newKey.hashedKey,
        organizationId: oldRecord.organizationId,
        scopes: oldRecord.scopes,
        rateLimit: oldRecord.rateLimit,
        metadata: {
          ...oldRecord.metadata,
          rotatedFrom: oldKeyId,
          rotatedAt: new Date().toISOString(),
        },
      },
    });

    // Schedule old key revocation after grace period
    const revokeAt = new Date(Date.now() + gracePeriodHours * 60 * 60 * 1000);
    await this.db.apiKeys.update({
      where: { id: oldKeyId },
      data: {
        expiresAt: revokeAt,
        metadata: {
          ...oldRecord.metadata,
          rotatedTo: newKey.keyId,
          scheduledRevocation: revokeAt.toISOString(),
        },
      },
    });

    return {
      newKey,
      oldKeyGracePeriodHours: gracePeriodHours,
    };
  }

  /**
   * Automated rotation check — finds keys that should be rotated.
   */
  async findKeysNeedingRotation(maxAgeDays: number = 90): Promise<string[]> {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    const oldKeys = await this.db.apiKeys.findMany({
      where: {
        createdAt: { lt: cutoff },
        isRevoked: false,
        expiresAt: null,
      },
      select: { id: true, keyId: true, createdAt: true },
    });

    return oldKeys.map((k: any) => k.id);
  }
}
```

### Database Schema

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id VARCHAR(64) NOT NULL UNIQUE,       -- "sk_live_KjG7dH3f" (prefix + short hash)
    hashed_key VARCHAR(64) NOT NULL,          -- SHA-256 hash of full key
    last_four VARCHAR(4) NOT NULL,            -- Last 4 chars for user display
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(255),                         -- User-friendly name
    scopes TEXT[] NOT NULL DEFAULT '{}',       -- Permission scopes
    rate_limit INTEGER NOT NULL DEFAULT 1000,  -- Requests per minute
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    metadata JSONB DEFAULT '{}',

    -- Indexes
    CONSTRAINT api_keys_key_id_idx UNIQUE (key_id)
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_hashed ON api_keys(hashed_key);
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at)
    WHERE expires_at IS NOT NULL AND is_revoked = FALSE;

-- Audit log for key events
CREATE TABLE api_key_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_id UUID NOT NULL REFERENCES api_keys(id),
    event_type VARCHAR(50) NOT NULL, -- 'created', 'used', 'rotated', 'revoked'
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_key_events_key ON api_key_events(key_id, created_at);
```

## Edge Cases & Failure Modes

### Key Leakage Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| Committed to GitHub | Full access to API | GitHub secret scanning, git-leaks | Auto-revoke, rotate |
| Logged in server logs | Exposed to log readers | Log scanning rules | Rotate, fix logging |
| Exposed in client-side code | Public exposure | CSP reports, monitoring | Revoke immediately |
| Shared via Slack/email | Lateral movement | Cannot detect reliably | Educate, enforce rotation |
| Stolen via MITM | Full impersonation | TLS enforcement | Require TLS 1.2+, pin certs |

### Handling Key Prefix Collisions

With base62 encoding and 8-character short hashes, the collision space is:

$$
N = 62^8 = 218{,}340{,}105{,}584{,}896 \approx 2.18 \times 10^{14}
$$

The probability of collision with $n$ keys:

$$
P(\text{collision}) \approx 1 - e^{-n^2 / (2 \times 62^8)}
$$

With 1 million keys:

$$
P(\text{collision}) \approx \frac{(10^6)^2}{2 \times 2.18 \times 10^{14}} \approx 2.3 \times 10^{-3} \approx 0.23\%
$$

With 10 million keys, this rises to ~19%. For large-scale systems, use a longer short hash (12+ chars) or handle collisions with a secondary lookup.

::: warning
If you have more than 1 million API keys in production, increase the short hash length from 8 to 12 characters to avoid collisions. Alternatively, use the full SHA-256 hash as the lookup key (slower but collision-free).
:::

## Performance Characteristics

### Verification Latency Breakdown

| Operation | Time | Notes |
|-----------|------|-------|
| Key parsing and format check | ~0.01ms | Pure string operations |
| SHA-256 hash computation | ~0.005ms | Hardware-accelerated on modern CPUs |
| Database lookup by key_id | ~0.5–2ms | Indexed B-tree lookup |
| Constant-time comparison | ~0.001ms | Fixed 32-byte comparison |
| Redis rate limit check | ~0.3–1ms | Sorted set operations |
| **Total** | **~1–3ms** | Without caching |
| **With cache hit** | **~0.05ms** | In-memory cache |

### Throughput

With the sliding window rate limiter in Redis:

- **Single Redis node**: ~100K verifications/second
- **Redis cluster (3 nodes)**: ~250K verifications/second
- **With local cache (30s TTL)**: ~1M verifications/second (cache hits)

### Storage

Per API key:

$$
\text{Storage} = 64_{\text{key\_id}} + 64_{\text{hash}} + 4_{\text{last4}} + 36_{\text{uuid}} + \text{metadata} \approx 500 \text{ bytes}
$$

One million API keys: ~500 MB in PostgreSQL (including indexes).

## Mathematical Foundations

### Entropy Requirements

For an API key to resist brute-force attacks, it needs sufficient entropy:

$$
H_{\text{min}} = -\log_2(P_{\text{acceptable}}) + \log_2(R \times T)
$$

where:
- $P_{\text{acceptable}}$ = acceptable probability of a successful guess
- $R$ = attacker's attempt rate (guesses per second)
- $T$ = time window (seconds before detection/rotation)

Assuming:
- $P_{\text{acceptable}} = 10^{-15}$ (one in a quadrillion)
- $R = 10^9$ (1 billion guesses/sec, cloud-scale)
- $T = 86{,}400$ (24 hours before detection)

$$
H_{\text{min}} = -\log_2(10^{-15}) + \log_2(10^9 \times 86{,}400)
$$
$$
H_{\text{min}} = 49.8 + 46.3 = 96.1 \text{ bits}
$$

Our 24-byte (192-bit) keys provide a comfortable **2x safety margin** over the minimum.

### Birthday Attack on Key Space

If an attacker can check if *any* key is valid (not a specific one), the birthday bound applies:

$$
n \approx \sqrt{2 \times N \times p}
$$

With $N = 2^{192}$ total possible keys and $p = 10^{-15}$:

$$
n \approx \sqrt{2 \times 2^{192} \times 10^{-15}} \approx 2^{71}
$$

This means an attacker would need $2^{71}$ attempts to have a $10^{-15}$ chance of finding any valid key — still computationally infeasible.

## Real-World War Stories

::: info War Story
**Stripe's API Key Design Evolution**

Stripe's API key format (`sk_live_...`, `pk_test_...`) became the gold standard for API key design. Their key insight was the prefix system: when a developer accidentally commits a key to GitHub, automated scanning can immediately identify it as a Stripe key and notify the owner. Before this, leaked API keys looked like random strings and were much harder to attribute.

Stripe also introduced the concept of "restricted keys" — keys with fine-grained permissions (e.g., `charges:write`, `customers:read`). This followed the principle of least privilege and reduced the blast radius of a leaked key from "full account access" to "only the specific operations this integration needs."

**Key takeaway**: The prefix isn't just for aesthetics — it's a critical security feature for leak detection.
:::

::: info War Story
**Heroku's 2022 OAuth Token Breach**

In April 2022, attackers used stolen OAuth tokens from Heroku's GitHub integration to access private repositories of Heroku customers. The tokens had been stored in a database that was compromised through a separate vulnerability.

The root cause: the OAuth tokens were stored in plaintext (not hashed) because Heroku needed to use them to make API calls on behalf of users. This is the fundamental tension with API keys — if the server needs to send the key to a third party, it must be stored reversibly.

**Resolution**: Heroku revoked all affected tokens, implemented envelope encryption for token storage, and added anomaly detection for token usage patterns. They also shortened token lifetimes and implemented automatic rotation.
:::

::: info War Story
**A Startup's $72,000 AWS Bill from Leaked Keys**

A developer at a startup accidentally committed AWS access keys to a public GitHub repository. Within 15 minutes, automated bots scraped the keys and spun up cryptocurrency mining instances across multiple AWS regions. By the time the team noticed (6 hours later), the bill was $72,000.

**Prevention measures implemented**:
1. Pre-commit hooks using `git-secrets` to block AWS key patterns
2. GitHub secret scanning alerts enabled
3. AWS SCPs (Service Control Policies) restricting instance types and regions
4. AWS billing alerts at $100, $500, and $1,000 thresholds
5. Automated key rotation every 30 days
:::

## Decision Framework

### API Key vs. Other Auth Methods

| Factor | API Keys | OAuth2 Tokens | JWTs | mTLS |
|--------|----------|---------------|------|------|
| **Complexity** | Low | High | Medium | High |
| **Stateless** | No (requires DB) | Depends | Yes | Yes |
| **Rotation** | Manual or scheduled | Token refresh | Short-lived | Cert rotation |
| **Granularity** | Per-key scopes | Per-token scopes | Claims-based | Cert-based |
| **Best for** | Server-to-server | User delegation | Microservices | Service mesh |
| **Key management** | Simple | Complex | Signing keys | PKI infrastructure |

### When to Use API Keys

**Use API Keys when:**
- Machine-to-machine authentication
- Developer platform / public API
- Simplicity is more important than fine-grained delegation
- Long-lived credentials are acceptable (with rotation)

**Do NOT use API Keys when:**
- Authenticating end users (use sessions/tokens instead)
- You need user delegation (use OAuth2 instead)
- Zero-trust environment (use mTLS or short-lived tokens)
- Client-side applications (keys will be exposed)

### Key Scope Design Patterns

```
# Resource-based scopes (Stripe pattern)
customers:read
customers:write
charges:read
charges:write

# Role-based scopes
admin
billing
readonly

# Hierarchical scopes
org:read
org:members:read
org:members:write
org:billing:read
org:billing:write
```

::: tip
Start with coarse-grained scopes (e.g., `read`, `write`) and add granularity only when customers request it. Over-engineering scopes early creates complexity without clear benefit.
:::

## Advanced Topics

### Publishable vs. Secret Keys

Many APIs have two types of keys:

| | Publishable Key (`pk_`) | Secret Key (`sk_`) |
|-|------------------------|-------------------|
| **Exposure** | Safe to expose in client-side code | Must be kept server-side |
| **Permissions** | Read-only, public data | Full read/write access |
| **Use case** | Frontend SDKs, tokenization | Backend API calls |
| **Rate limit** | Aggressive | Generous |
| **Example** | Stripe.js card tokenization | Stripe charge creation |

### Key Hierarchy and Organization

For multi-tenant platforms:

```mermaid
graph TB
    ORG[Organization] --> ENV1[Production Environment]
    ORG --> ENV2[Staging Environment]
    ORG --> ENV3[Development Environment]

    ENV1 --> K1[Root Key - full access]
    ENV1 --> K2[Restricted Key - billing only]
    ENV1 --> K3[Restricted Key - read only]

    ENV2 --> K4[Root Key]
    ENV2 --> K5[CI/CD Key]

    K1 --> SCOPE1["scopes: [*]"]
    K2 --> SCOPE2["scopes: [billing:*, customers:read]"]
    K3 --> SCOPE3["scopes: [*.read]"]

    style ORG fill:#e3f2fd
    style ENV1 fill:#e8f5e9
    style ENV2 fill:#fff3e0
    style ENV3 fill:#fce4ec
```

### GitHub Secret Scanning Integration

GitHub scans every push for known API key patterns. Register your key format with GitHub's partner program:

```json
{
  "pattern": "(sk|pk|rk)_(live|test|staging)_[A-Za-z0-9]{24,48}",
  "token_type": "yourapp_api_key",
  "alert_endpoint": "https://api.yourapp.com/webhooks/github-secret-scanning"
}
```

When GitHub detects a match, it sends a webhook to your endpoint. Your handler should:

1. Verify the webhook signature
2. Hash the leaked key and look it up
3. Automatically revoke the key
4. Notify the key owner
5. Log the incident

### Key Provenance and Audit

Track the entire lifecycle of every key:

```typescript
enum KeyEvent {
  CREATED = 'created',
  FIRST_USED = 'first_used',
  SCOPE_CHANGED = 'scope_changed',
  RATE_LIMIT_HIT = 'rate_limit_hit',
  ROTATED = 'rotated',
  REVOKED = 'revoked',
  LEAKED_DETECTED = 'leak_detected',
  EXPIRED = 'expired',
}

interface KeyAuditEntry {
  keyId: string;
  event: KeyEvent;
  timestamp: Date;
  actor: string;           // User ID or "system"
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
}

// Query: "Show me all keys created by user X that have never been used"
// Query: "Show me all keys that hit rate limits in the last 24 hours"
// Query: "Show me the full lifecycle of leaked key sk_live_KjG7..."
```

### Versioned Key Formats

Plan for key format evolution:

```
# Version 1 (current)
sk_live_KjG7dH3fNwQ9v2xR5mP8yT1uZ4bE6cA

# Version 2 (future: longer, with checksum)
sk_v2_live_KjG7dH3fNwQ9v2xR5mP8yT1uZ4bE6cA_k7x2

# The version indicator lets you:
# - Support old and new formats simultaneously
# - Gradually migrate to stronger key formats
# - Add checksums for typo detection
```

## Cross-References

- [Hashing Algorithms](/security/encryption/hashing-algorithms) — SHA-256, HMAC for key storage
- [Rate Limiting](/security/api-security/rate-limiting) — Detailed rate limiting algorithms
- [Key Management](/security/encryption/key-management) — Enterprise key lifecycle
- [Request Signing](/security/api-security/request-signing) — HMAC-based request authentication
- [Secrets in CI/CD](/security/secrets-management/secrets-in-ci-cd) — Securing API keys in pipelines
- [Rotation Automation](/security/secrets-management/rotation-automation) — Zero-downtime key rotation
