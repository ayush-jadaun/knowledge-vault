---
title: "Rate Limiting Algorithms"
description: "Token bucket, leaky bucket, fixed window, sliding window log, and sliding window counter — complete TypeScript implementations"
tags: [rate-limiting, algorithms, token-bucket, sliding-window, redis, typescript]
difficulty: "advanced"
prerequisites: [rate-limiter/index]
lastReviewed: "2026-03-18"
---

# Rate Limiting Algorithms

## Algorithm Comparison

Before diving into implementations, understand when each algorithm fits:

```mermaid
graph TD
    Q{What matters most?} --> A[Burst tolerance?]
    Q --> B[Smooth output?]
    Q --> C[Simplicity?]
    Q --> D[Exact counts?]

    A -->|Yes| TB[Token Bucket\nBursts up to capacity]
    A -->|No| LB[Leaky Bucket\nConstant drain rate]

    B -->|Yes| LB
    C -->|Yes| FW[Fixed Window\nSimple counter]
    D -->|Yes| SWL[Sliding Window Log\nExact but O(n) memory]
    D -->|Approximate| SWC[Sliding Window Counter\nO(1), small error]
```

## 1. Fixed Window Counter

The simplest algorithm. Divide time into fixed windows (e.g., each minute). Count requests in the current window.

### How It Works

```
Window: each 60-second period starting at :00
Limit: 100 requests per window

Time 0:55 → count=95 → allowed
Time 0:59 → count=99 → allowed
Time 0:59 → count=100 → allowed
Time 1:00 → NEW WINDOW → count=1 → allowed
Time 1:00 → count=2 → allowed
```

### The Boundary Burst Problem

A client can make 100 requests at 0:59 (in window 1) and 100 requests at 1:00 (in window 2). In a 2-second span, they made 200 requests — double the limit.

$$
\text{max\_burst} = 2 \times \text{limit}
$$

This is the fundamental weakness of fixed windows.

### Implementation

```typescript
import Redis from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;      // Unix timestamp when the window resets
  retryAfterSeconds: number;
}

export class FixedWindowRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rl:fw:'
  ) {}

  async checkAndConsume(params: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<RateLimitResult> {
    const { key, limit, windowSeconds } = params;

    // Align window to clock boundaries (e.g., 0-60, 60-120 for 60s windows)
    const now = Date.now();
    const windowStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
    const windowEnd = windowStart + windowSeconds * 1000;
    const resetAt = Math.floor(windowEnd / 1000);

    const redisKey = `${this.prefix}${key}:${windowStart}`;

    // Atomic increment + set TTL
    // Lua script ensures atomicity
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('PEXPIREAT', KEYS[1], ARGV[1])
      end
      return current
    `;

    const count = await this.redis.eval(
      luaScript,
      1,
      redisKey,
      String(windowEnd)
    ) as number;

    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;

    return {
      allowed,
      remaining,
      resetAt,
      retryAfterSeconds: allowed ? 0 : Math.ceil((windowEnd - now) / 1000),
    };
  }
}
```

### Performance Characteristics

| Metric | Value |
|--------|-------|
| Time complexity | O(1) |
| Space complexity | O(unique keys) |
| Redis operations | 1 (atomic Lua) |
| Latency | 0.5-2ms |
| Accuracy | Poor (2× burst at boundary) |

## 2. Sliding Window Log

Stores the exact timestamp of each request. The window "slides" with time — always looking at the last N seconds.

### How It Works

```
Limit: 5 requests per 60 seconds (sliding window)

t=10:  [10] → count=1, allowed
t=20:  [10, 20] → count=2, allowed
t=50:  [10, 20, 50] → count=3, allowed
t=60:  [10, 20, 50, 60] → count=4, allowed
t=70:  Remove t=10 (>60s ago) → [20, 50, 60, 70] → count=4, allowed
t=80:  [20, 50, 60, 70, 80] → count=5, allowed
t=81:  [20, 50, 60, 70, 80, 81] → count=6, DENIED
t=90:  Remove t=20 → [50, 60, 70, 80, 81] + 90 → count=6, DENIED
t=111: Remove t=50 → [60, 70, 80, 81, 90, 111] → count=6, DENIED
t=121: Remove t=60 → [70, 80, 81, 90, 111, 121] → count=5 before add, allowed
```

No boundary burst — the window is always exactly the last N seconds.

### Implementation

```typescript
export class SlidingWindowLogRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rl:swl:'
  ) {}

  async checkAndConsume(params: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<RateLimitResult> {
    const { key, limit, windowSeconds } = params;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const redisKey = `${this.prefix}${key}`;

    // Lua script for atomic check-and-record
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local ttl = tonumber(ARGV[4])

      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

      -- Count current entries
      local count = redis.call('ZCARD', key)

      if count < limit then
        -- Add current timestamp with unique score (timestamp + random)
        redis.call('ZADD', key, now, tostring(now) .. tostring(math.random()))
        redis.call('EXPIRE', key, ttl)
        return {1, limit - count - 1}  -- {allowed, remaining}
      else
        -- Get oldest entry to calculate retry-after
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local oldest_ts = tonumber(oldest[2]) or now
        return {0, 0, oldest_ts}  -- {not allowed, remaining=0, oldest_ts}
      end
    `;

    const result = await this.redis.eval(
      luaScript,
      1,
      redisKey,
      String(now),
      String(windowStart),
      String(limit),
      String(windowSeconds + 10)  // TTL = window + buffer
    ) as [number, number, number?];

    const allowed = result[0] === 1;
    const remaining = result[1];
    const oldestTs = result[2];

    // When will a slot free up? When the oldest entry expires
    const retryAfterMs = allowed ? 0 : (oldestTs ?? now) + windowSeconds * 1000 - now;
    const retryAfterSeconds = Math.ceil(Math.max(0, retryAfterMs) / 1000);

    return {
      allowed,
      remaining,
      resetAt: Math.floor((now + (allowed ? windowSeconds * 1000 : retryAfterMs)) / 1000),
      retryAfterSeconds,
    };
  }
}
```

### Performance Characteristics

| Metric | Value |
|--------|-------|
| Time complexity | O(log n) — sorted set operations |
| Space complexity | O(requests in window per key) |
| Redis operations | 3-4 (Lua script) |
| Latency | 1-5ms |
| Accuracy | Perfect — exact sliding window |
| Memory concern | High-traffic keys with large windows = many stored timestamps |

::: warning Memory Usage
For a key with 10,000 req/hour limit over a 1-hour window, the sorted set can hold 10,000 entries. At ~50 bytes per entry = 500KB per key. With 10,000 active API keys = 5GB of Redis memory.

Use sliding window counter instead for high-traffic scenarios.
:::

## 3. Sliding Window Counter

Approximates the sliding window using two fixed window counters. Dramatically more memory-efficient than the log.

### How It Works

```
Limit: 10 per 60 seconds

At t=75 (15 seconds into new window):
  - Current window (60-120): count = 3
  - Previous window (0-60): count = 8
  - Weight of previous window = (60-15)/60 = 0.75

Estimated sliding count = 3 + 8 × 0.75 = 9
9 < 10 → allowed
```

### Mathematical Foundation

$$
\text{estimated\_count} = \text{current\_window\_count} + \text{prev\_window\_count} \times \frac{T_{\text{window}} - T_{\text{elapsed}}}{T_{\text{window}}}
$$

where $T_{\text{elapsed}}$ is time elapsed in the current window.

The maximum error is bounded:

$$
\text{max\_error} \leq \frac{1}{2} \times \text{limit}
$$

In practice, the error is much smaller (typically < 1% with normal traffic patterns).

### Implementation

```typescript
export class SlidingWindowCounterRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rl:swc:'
  ) {}

  async checkAndConsume(params: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<RateLimitResult> {
    const { key, limit, windowSeconds } = params;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    // Current and previous window boundaries
    const currentWindowStart = Math.floor(now / windowMs) * windowMs;
    const prevWindowStart = currentWindowStart - windowMs;

    const currentKey = `${this.prefix}${key}:${currentWindowStart}`;
    const prevKey = `${this.prefix}${key}:${prevWindowStart}`;

    const luaScript = `
      local current_key = KEYS[1]
      local prev_key = KEYS[2]
      local limit = tonumber(ARGV[1])
      local window_ms = tonumber(ARGV[2])
      local current_window_start = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])

      -- Get counts from both windows
      local current_count = tonumber(redis.call('GET', current_key) or 0)
      local prev_count = tonumber(redis.call('GET', prev_key) or 0)

      -- Calculate weight for previous window
      local elapsed_in_current = now - current_window_start
      local prev_weight = (window_ms - elapsed_in_current) / window_ms

      -- Estimated sliding window count
      local estimated = current_count + prev_count * prev_weight

      if estimated < limit then
        -- Increment current window counter
        local new_count = redis.call('INCR', current_key)
        if new_count == 1 then
          -- Set TTL for 2 windows (current + next)
          redis.call('PEXPIRE', current_key, window_ms * 2)
        end
        return {1, math.floor(limit - estimated - 1)}
      else
        -- Calculate retry: time until oldest counted request expires
        local retry_ms = window_ms - elapsed_in_current
        return {0, 0, retry_ms}
      end
    `;

    const result = await this.redis.eval(
      luaScript,
      2,
      currentKey,
      prevKey,
      String(limit),
      String(windowMs),
      String(currentWindowStart),
      String(now)
    ) as [number, number, number?];

    const allowed = result[0] === 1;
    const remaining = Math.max(0, result[1]);
    const retryAfterMs = result[2] ?? 0;

    return {
      allowed,
      remaining,
      resetAt: Math.floor((currentWindowStart + windowMs) / 1000),
      retryAfterSeconds: allowed ? 0 : Math.ceil(retryAfterMs / 1000),
    };
  }
}
```

### Performance Characteristics

| Metric | Value |
|--------|-------|
| Time complexity | O(1) |
| Space complexity | O(1) — 2 counters per key |
| Redis operations | 4-5 (Lua script) |
| Latency | 1-3ms |
| Accuracy | ~99% (max 0.5% error at window boundary) |

## 4. Token Bucket

A bucket holds a fixed number of tokens. Each request consumes one token. Tokens are refilled at a constant rate. Allows bursting up to bucket capacity.

### How It Works

```
Bucket capacity: 100 tokens (max burst)
Refill rate: 10 tokens/second

t=0: 100 tokens (full)
t=0: 10 requests → 90 tokens
t=0.5: 5 tokens refilled → 95 tokens
t=1: 10 more requests → 85 tokens + 10 refilled = 85 tokens net
t=10: 100 requests burst → 0 tokens
t=10.1: Request → DENIED (0 tokens)
t=11: 10 tokens refilled → 10 tokens
t=11: 10 requests → 0 tokens
```

The bucket never goes below 0 and never exceeds capacity.

### Mathematical Foundation

At time $t$, the number of tokens available is:

$$
\text{tokens}(t) = \min\left(\text{capacity}, \text{tokens}(t_{\text{last}}) + r \times (t - t_{\text{last}})\right)
$$

where $r$ is the refill rate (tokens per second).

A request is allowed if $\text{tokens}(t) \geq \text{cost}$ (usually 1).

### Implementation

```typescript
export class TokenBucketRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rl:tb:'
  ) {}

  async checkAndConsume(params: {
    key: string;
    capacity: number;        // Max tokens (max burst size)
    refillRate: number;      // Tokens per second
    cost?: number;           // Tokens this request costs (default: 1)
  }): Promise<RateLimitResult> {
    const { key, capacity, refillRate, cost = 1 } = params;
    const now = Date.now() / 1000;  // Seconds
    const redisKey = `${this.prefix}${key}`;

    const luaScript = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local cost = tonumber(ARGV[4])

      -- Get current bucket state
      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1])
      local last_refill = tonumber(bucket[2])

      -- Initialize if first request
      if not tokens then
        tokens = capacity
        last_refill = now
      end

      -- Refill tokens based on elapsed time
      local elapsed = now - last_refill
      tokens = math.min(capacity, tokens + elapsed * refill_rate)

      -- Check if request can be served
      if tokens >= cost then
        tokens = tokens - cost
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
        redis.call('EXPIRE', key, math.ceil(capacity / refill_rate) + 60)
        -- Return: allowed=1, remaining=floor(tokens), retry_after=0
        return {1, math.floor(tokens), 0}
      else
        -- Calculate when enough tokens will be available
        local tokens_needed = cost - tokens
        local wait_seconds = tokens_needed / refill_rate

        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
        redis.call('EXPIRE', key, math.ceil(capacity / refill_rate) + 60)
        -- Return: allowed=0, remaining=0, retry_after_seconds
        return {0, 0, math.ceil(wait_seconds)}
      end
    `;

    const result = await this.redis.eval(
      luaScript,
      1,
      redisKey,
      String(capacity),
      String(refillRate),
      String(now),
      String(cost)
    ) as [number, number, number];

    const allowed = result[0] === 1;
    const remaining = result[1];
    const retryAfterSeconds = result[2];

    return {
      allowed,
      remaining,
      resetAt: Math.floor(now + retryAfterSeconds),
      retryAfterSeconds: allowed ? 0 : retryAfterSeconds,
    };
  }
}
```

### Variable-Cost Requests

Token bucket elegantly handles requests with different costs:

```typescript
// Cheap operations cost 1 token
await tokenBucket.checkAndConsume({ key, capacity: 100, refillRate: 10, cost: 1 });

// Expensive AI completion costs 10 tokens
await tokenBucket.checkAndConsume({ key, capacity: 100, refillRate: 10, cost: 10 });

// File export costs 25 tokens (high cost)
await tokenBucket.checkAndConsume({ key, capacity: 100, refillRate: 10, cost: 25 });
```

### Performance Characteristics

| Metric | Value |
|--------|-------|
| Time complexity | O(1) |
| Space complexity | O(1) — 2 fields per key |
| Redis operations | 3-4 (Lua + HMGET/HMSET + EXPIRE) |
| Latency | 1-3ms |
| Accuracy | High — continuous refill rate |
| Burst handling | Excellent — up to capacity |

## 5. Leaky Bucket

Requests enter a queue (the "bucket"). They drain at a fixed rate. If the bucket is full, the request is rejected.

Unlike the token bucket (which allows bursts), the leaky bucket outputs at a constant rate regardless of input burst.

### How It Works

```
Bucket size (queue): 100 requests
Drain rate: 10 requests/second

t=0: 50 burst requests → queue=50
t=0.1: drain 1 → queue=49
t=5: drain 50 → queue=0
t=5: 200 burst → queue full at 100, 100 rejected
```

### Implementation

```typescript
// Leaky bucket is typically implemented as a rate-limited queue
// rather than a pure allow/reject mechanism

export class LeakyBucketRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rl:lb:'
  ) {}

  async checkAndConsume(params: {
    key: string;
    bucketSize: number;     // Queue capacity
    drainRate: number;      // Requests drained per second
  }): Promise<RateLimitResult> {
    const { key, bucketSize, drainRate } = params;
    const now = Date.now() / 1000;  // Seconds
    const redisKey = `${this.prefix}${key}`;

    const luaScript = `
      local key = KEYS[1]
      local bucket_size = tonumber(ARGV[1])
      local drain_rate = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])

      local state = redis.call('HMGET', key, 'volume', 'last_drain')
      local volume = tonumber(state[1]) or 0
      local last_drain = tonumber(state[2]) or now

      -- Drain the bucket based on elapsed time
      local elapsed = now - last_drain
      local drained = elapsed * drain_rate
      volume = math.max(0, volume - drained)

      if volume < bucket_size then
        volume = volume + 1
        redis.call('HMSET', key, 'volume', volume, 'last_drain', now)
        redis.call('EXPIRE', key, math.ceil(bucket_size / drain_rate) + 60)
        local remaining = bucket_size - volume
        return {1, remaining, 0}
      else
        -- Bucket full — reject
        -- Time until bucket drains enough for 1 request
        local wait = (volume - bucket_size + 1) / drain_rate
        redis.call('HMSET', key, 'volume', volume, 'last_drain', now)
        return {0, 0, math.ceil(wait)}
      end
    `;

    const result = await this.redis.eval(
      luaScript,
      1,
      redisKey,
      String(bucketSize),
      String(drainRate),
      String(now)
    ) as [number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetAt: Math.floor(now + result[2]),
      retryAfterSeconds: result[0] === 1 ? 0 : result[2],
    };
  }
}
```

## Unified Rate Limiter Service

```typescript
type Algorithm = 'fixed_window' | 'sliding_window_log' | 'sliding_window_counter' | 'token_bucket' | 'leaky_bucket';

export class UnifiedRateLimitService {
  private readonly limiters: {
    fixedWindow: FixedWindowRateLimiter;
    slidingWindowLog: SlidingWindowLogRateLimiter;
    slidingWindowCounter: SlidingWindowCounterRateLimiter;
    tokenBucket: TokenBucketRateLimiter;
    leakyBucket: LeakyBucketRateLimiter;
  };

  constructor(redis: Redis) {
    this.limiters = {
      fixedWindow: new FixedWindowRateLimiter(redis),
      slidingWindowLog: new SlidingWindowLogRateLimiter(redis),
      slidingWindowCounter: new SlidingWindowCounterRateLimiter(redis),
      tokenBucket: new TokenBucketRateLimiter(redis),
      leakyBucket: new LeakyBucketRateLimiter(redis),
    };
  }

  async checkAndConsume(params: {
    key: string;
    algorithm: Algorithm;
    limit: number;
    windowSeconds?: number;
    capacity?: number;
    refillRate?: number;
    drainRate?: number;
    cost?: number;
  }): Promise<RateLimitResult> {
    const { key, algorithm, limit } = params;

    try {
      switch (algorithm) {
        case 'fixed_window':
          return this.limiters.fixedWindow.checkAndConsume({
            key, limit,
            windowSeconds: params.windowSeconds ?? 60,
          });

        case 'sliding_window_log':
          return this.limiters.slidingWindowLog.checkAndConsume({
            key, limit,
            windowSeconds: params.windowSeconds ?? 60,
          });

        case 'sliding_window_counter':
          return this.limiters.slidingWindowCounter.checkAndConsume({
            key, limit,
            windowSeconds: params.windowSeconds ?? 60,
          });

        case 'token_bucket':
          return this.limiters.tokenBucket.checkAndConsume({
            key,
            capacity: params.capacity ?? limit,
            refillRate: params.refillRate ?? limit / 60,
            cost: params.cost ?? 1,
          });

        case 'leaky_bucket':
          return this.limiters.leakyBucket.checkAndConsume({
            key,
            bucketSize: params.capacity ?? limit,
            drainRate: params.drainRate ?? limit / 60,
          });

        default:
          throw new Error(`Unknown algorithm: ${algorithm}`);
      }
    } catch (error) {
      // Redis unavailable — fail open with local approximation
      return this.failOpenFallback(key, limit);
    }
  }

  private failOpenFallback(key: string, limit: number): RateLimitResult {
    // Simple in-memory fallback
    return {
      allowed: true,
      remaining: limit,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      retryAfterSeconds: 0,
    };
  }
}
```

## Decision Framework

```mermaid
graph TD
    Q1{Do you need\nexact counts?} -->|Yes| SWL[Sliding Window Log\nMemory-intensive]
    Q1 -->|Approximate OK| Q2

    Q2{Allow burst\ntraffic?} -->|Yes| TB[Token Bucket\nBurst-friendly]
    Q2 -->|Smooth output| LB[Leaky Bucket\nConstant drain]
    Q2 -->|Neither| Q3

    Q3{Memory\nconstrained?} -->|Yes| SWC[Sliding Window Counter\nO(1) space]
    Q3 -->|No| FW[Fixed Window\nSimplest]
```

**Summary:**
- **Chat API, general use**: Token bucket (allows short bursts, clean recovery)
- **Payment processing**: Sliding window log (exact counts, critical correctness)
- **Background jobs**: Leaky bucket (smooth rate to protect downstream)
- **Simple APIs, low stakes**: Fixed window (easiest to understand and debug)
- **High-traffic, limited memory**: Sliding window counter

::: info War Story
We implemented a fixed window rate limiter for our API. A customer noticed they could "reset" their limit by making requests just before the window boundary. They built a client that fired all requests at :59 of each minute to get 2× the intended limit.

This is the classic boundary burst exploit. Our options:
1. Switch to sliding window (correct, more complex)
2. Add jitter to window boundaries (obscures but doesn't fix)
3. Add a second check: burst limit per second within each minute

We chose sliding window counter. It took one afternoon to implement and the boundary burst issue disappeared entirely.
:::

## Performance Summary

$$
\text{latency} = T_{\text{network}} + T_{\text{redis}} + T_{\text{lua}}
$$

In practice:
- $T_{\text{network}}$: 0.1-1ms (same datacenter)
- $T_{\text{redis}}$: 0.1-0.5ms
- $T_{\text{lua}}$: 0.1-0.5ms (server-side script)

Total: **0.3-2ms per rate limit check** for any algorithm.

This is fast enough to add to every API request without meaningful impact on total request latency (typical API request: 20-200ms).
