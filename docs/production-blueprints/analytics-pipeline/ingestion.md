---
title: "Analytics Event Ingestion"
description: "HTTP collection endpoint, client SDK design, batching, retry, and server-side event emission"
tags: [analytics, ingestion, sdk, http, batching, event-collection]
difficulty: "advanced"
prerequisites: [analytics-pipeline/event-schema]
lastReviewed: "2026-03-18"
---

# Analytics Ingestion

## The Ingestion Layer's Job

The ingestion layer has exactly one job: get events from clients to Kafka reliably, with minimal latency added to the client request. Everything else — validation, enrichment, storage — happens downstream.

Design constraints:
- **Latency** — event collection must not block UI interactions (fire-and-forget from client)
- **Durability** — no events should be lost (SDK buffers + server-side Kafka guarantees)
- **Scale** — ingestion servers are stateless and horizontally scalable
- **Privacy** — IP addresses and sensitive data must be handled correctly

## HTTP Collection Endpoint

### Endpoint Design

```
POST /v1/track        → Single event
POST /v1/batch        → Multiple events (up to 1000)
POST /v1/identify     → User identification
POST /v1/page         → Page view (convenience wrapper)
GET  /v1/ping         → Health check (returns 204)
```

All endpoints accept JSON. Authentication via `writeKey` in the body or `Authorization: Basic` header.

### Production Server Implementation

```typescript
// src/ingestion/server.ts
import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import { Kafka, Producer, CompressionTypes } from 'kafkajs';
import { SchemaRegistry } from '../schema/registry';

interface IngestServerConfig {
  kafka: Kafka;
  redis: Redis;
  maxBatchSize?: number;
  maxEventSizeBytes?: number;
}

export async function buildIngestServer(
  config: IngestServerConfig
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: 'warn' },
    trustProxy: true,
    maxParamLength: 100,
  });

  // Rate limiting (protect against abuse)
  await app.register(rateLimit, {
    redis: config.redis,
    max: 10_000,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Rate limit per write key, not per IP
      return extractWriteKey(request) ?? request.ip;
    },
  });

  const producer = config.kafka.producer({
    idempotent: true,
    maxInFlightRequests: 5,
    transactionTimeout: 30_000,
    allowAutoTopicCreation: false,
    retry: {
      initialRetryTime: 100,
      retries: 8,
      factor: 2,
      maxRetryTime: 30_000,
    },
  });
  await producer.connect();

  const registry = new SchemaRegistry();
  const maxBatch = config.maxBatchSize ?? 1000;
  const maxSize = config.maxEventSizeBytes ?? 32_768; // 32KB per event

  // ─── Single Event ─────────────────────────────────────────────
  app.post('/v1/track', async (request, reply) => {
    return handleEvents(request, reply, [request.body], producer, registry);
  });

  // ─── Batch ────────────────────────────────────────────────────
  app.post<{ Body: { writeKey?: string; batch: unknown[] } }>(
    '/v1/batch',
    async (request, reply) => {
      const { batch } = request.body;
      if (!Array.isArray(batch)) {
        return reply.code(400).send({ error: 'batch must be an array' });
      }
      if (batch.length > maxBatch) {
        return reply.code(413).send({
          error: `Batch too large. Max ${maxBatch} events per request.`,
        });
      }
      return handleEvents(request, reply, batch, producer, registry);
    }
  );

  // ─── Page View ────────────────────────────────────────────────
  app.post('/v1/page', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const pageEvent = {
      ...body,
      event: 'page_viewed',
      category: 'page',
    };
    return handleEvents(request, reply, [pageEvent], producer, registry);
  });

  // ─── Health ───────────────────────────────────────────────────
  app.get('/v1/ping', async (_, reply) => {
    return reply.code(204).send();
  });

  return app;
}

async function handleEvents(
  request: any,
  reply: any,
  rawEvents: unknown[],
  producer: Producer,
  registry: SchemaRegistry
): Promise<void> {
  // Authenticate write key
  const writeKey = extractWriteKey(request);
  if (!writeKey) {
    return reply.code(401).send({ error: 'Missing write key' });
  }

  const sourceId = await validateAndCacheWriteKey(writeKey);
  if (!sourceId) {
    return reply.code(401).send({ error: 'Invalid write key' });
  }

  const now = new Date().toISOString();
  const clientIp = request.ip;

  const accepted: unknown[] = [];
  const rejected: Array<{ event: unknown; errors: string[] }> = [];

  for (const rawEvent of rawEvents) {
    const validation = registry.validate(rawEvent);
    if (!validation.valid) {
      rejected.push({ event: rawEvent, errors: validation.errors ?? [] });
      continue;
    }

    const event = {
      ...validation.normalized,
      sourceId,
      receivedAt: now,
      context: {
        ...validation.normalized?.context,
        ip: clientIp,  // Override client-provided IP with real IP
      },
    };

    accepted.push(event);
  }

  if (accepted.length > 0) {
    const messages = accepted.map((event: any) => ({
      key: Buffer.from(event.userId ?? event.anonymousId ?? 'anonymous'),
      value: Buffer.from(JSON.stringify(event)),
      headers: {
        'source-id': sourceId,
        'event-type': String(event.event ?? 'unknown'),
      },
    }));

    await producer.send({
      topic: 'raw-events',
      compression: CompressionTypes.GZIP,
      messages,
      acks: 1,  // Leader acknowledgment (balances durability/latency)
    });
  }

  // Return 200 even with some rejections (partial success)
  reply.code(200).send({
    accepted: accepted.length,
    rejected: rejected.length,
    ...(rejected.length > 0 ? { errors: rejected } : {}),
  });
}

function extractWriteKey(request: any): string | null {
  // Support both Basic auth and body parameter
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
    return decoded.split(':')[0] || null;
  }
  return (request.body as any)?.writeKey ?? null;
}

const writeKeyCache = new Map<string, { sourceId: string; expiresAt: number }>();

async function validateAndCacheWriteKey(writeKey: string): Promise<string | null> {
  const cached = writeKeyCache.get(writeKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sourceId;
  }

  // Lookup from database (implement this)
  const sourceId = await lookupWriteKey(writeKey);
  if (sourceId) {
    writeKeyCache.set(writeKey, {
      sourceId,
      expiresAt: Date.now() + 300_000, // Cache for 5 minutes
    });
  }

  return sourceId;
}
```

## Browser SDK

### Design Goals

The browser SDK must:
1. Never block rendering (all operations are async)
2. Buffer events and batch-send to minimize HTTP requests
3. Handle network failures with persistent retry
4. Automatically identify users and maintain anonymous ID

```typescript
// src/sdk/browser/analytics.ts

interface AnalyticsConfig {
  writeKey: string;
  endpoint?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  retryAttempts?: number;
  debug?: boolean;
  plugins?: Plugin[];
}

interface Plugin {
  name: string;
  process?: (event: BaseEvent) => BaseEvent | null;
}

type EventQueue = Array<{
  event: BaseEvent;
  retries: number;
  addedAt: number;
}>;

export class Analytics {
  private config: Required<AnalyticsConfig>;
  private queue: EventQueue = [];
  private userId?: string;
  private anonymousId: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private sessionId: string;

  constructor(config: AnalyticsConfig) {
    this.config = {
      endpoint: 'https://events.example.com',
      batchSize: 30,
      flushIntervalMs: 5_000,
      retryAttempts: 3,
      debug: false,
      plugins: [],
      ...config,
    };

    this.anonymousId = this.getOrCreateAnonymousId();
    this.sessionId = this.getOrCreateSessionId();

    this.start();
  }

  // ─── Public API ───────────────────────────────────────────────

  identify(userId: string, traits?: Record<string, unknown>): void {
    this.userId = userId;
    // Persist userId for page reloads
    try {
      localStorage.setItem('ajs_user_id', userId);
    } catch {}

    this.enqueue({
      event: 'identify',
      userId,
      anonymousId: this.anonymousId,
      sessionId: this.sessionId,
      properties: traits,
    });
  }

  track(
    event: string,
    properties?: Record<string, unknown>
  ): void {
    this.enqueue({
      event,
      userId: this.userId,
      anonymousId: this.anonymousId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      context: this.getContext(),
      properties,
    });
  }

  page(properties?: Partial<{
    title: string;
    url: string;
    path: string;
    referrer: string;
  }>): void {
    this.track('page_viewed', {
      title: document.title,
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer || undefined,
      ...properties,
    });
  }

  // ─── Internal ─────────────────────────────────────────────────

  private enqueue(event: BaseEvent): void {
    // Apply plugins (can modify or drop events)
    let processed: BaseEvent | null = event;
    for (const plugin of this.config.plugins) {
      if (!processed) break;
      processed = plugin.process ? plugin.process(processed) : processed;
    }
    if (!processed) return;

    this.queue.push({ event: processed, retries: 0, addedAt: Date.now() });

    if (this.config.debug) {
      console.log('[Analytics] Queued:', processed.event);
    }

    // Flush immediately if batch is full
    if (this.queue.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  private start(): void {
    this.flushTimer = setInterval(
      () => void this.flush(),
      this.config.flushIntervalMs
    );

    // Flush on page unload
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushSync();
      }
    });

    window.addEventListener('pagehide', () => {
      this.flushSync();
    });
  }

  private async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    const batch = this.queue.splice(0, this.config.batchSize);

    try {
      await this.sendBatch(batch.map((item) => item.event));
    } catch {
      // Re-queue failed events with retry count
      const retryable = batch
        .filter((item) => item.retries < this.config.retryAttempts)
        .map((item) => ({ ...item, retries: item.retries + 1 }));

      this.queue.unshift(...retryable);
    } finally {
      this.isFlushing = false;
    }
  }

  // Synchronous flush for page unload (uses sendBeacon)
  private flushSync(): void {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);
    const payload = JSON.stringify({
      writeKey: this.config.writeKey,
      batch: batch.map((item) => item.event),
    });

    // sendBeacon survives page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `${this.config.endpoint}/v1/batch`,
        new Blob([payload], { type: 'application/json' })
      );
    }
  }

  private async sendBatch(events: BaseEvent[]): Promise<void> {
    const response = await fetch(`${this.config.endpoint}/v1/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writeKey: this.config.writeKey,
        batch: events,
      }),
      // Keep-alive for connection reuse
      keepalive: true,
    });

    if (!response.ok && response.status !== 400) {
      // 400 = validation error (non-retryable), other errors = retry
      throw new Error(`HTTP ${response.status}`);
    }
  }

  private getContext(): EventContext {
    return {
      page: {
        url: window.location.href,
        path: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        title: document.title,
        referrer: document.referrer || undefined,
      },
      userAgent: navigator.userAgent,
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  private getOrCreateAnonymousId(): string {
    try {
      const stored = localStorage.getItem('ajs_anonymous_id');
      if (stored) return stored;
    } catch {}

    const id = `anon-${crypto.randomUUID()}`;
    try {
      localStorage.setItem('ajs_anonymous_id', id);
    } catch {}
    return id;
  }

  private getOrCreateSessionId(): string {
    try {
      const stored = sessionStorage.getItem('ajs_session_id');
      if (stored) return stored;
    } catch {}

    const id = `sess-${crypto.randomUUID()}`;
    try {
      sessionStorage.setItem('ajs_session_id', id);
    } catch {}
    return id;
  }
}

// Re-export types
export type { BaseEvent, EventContext } from '../schema/base-event';
```

### SDK Usage

```typescript
// Initialize once per page
const analytics = new Analytics({
  writeKey: 'your-write-key',
  endpoint: 'https://events.example.com',
  debug: process.env.NODE_ENV === 'development',
});

// After login
analytics.identify('user-12345', {
  email: 'user@example.com',
  plan: 'pro',
  createdAt: '2024-01-15',
});

// Track events
analytics.track('button_clicked', {
  buttonId: 'upgrade-cta',
  buttonLocation: 'pricing-page-hero',
});

// Page views (automatically captures URL, title, referrer)
analytics.page();
```

## Server-Side SDK

```typescript
// src/sdk/server/analytics-server.ts

export class ServerAnalytics {
  private producer: Producer;
  private buffer: BaseEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    kafka: Kafka,
    private options = {
      flushIntervalMs: 1000,
      maxBatchSize: 500,
      sourceId: 'server',
    }
  ) {
    this.producer = kafka.producer({ idempotent: true });
  }

  async initialize(): Promise<void> {
    await this.producer.connect();
    this.flushInterval = setInterval(
      () => void this.flush(),
      this.options.flushIntervalMs
    );
  }

  // Track a server-side event
  track(
    userId: string,
    event: string,
    properties?: Record<string, unknown>
  ): void {
    this.buffer.push({
      userId,
      event,
      timestamp: new Date().toISOString(),
      properties,
      context: { app: { name: 'server', version: process.env.APP_VERSION } },
    });
  }

  // Emit event from a background job (no userId)
  trackSystem(
    event: string,
    properties?: Record<string, unknown>
  ): void {
    this.buffer.push({
      anonymousId: 'system',
      event,
      timestamp: new Date().toISOString(),
      properties,
    });
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);

    await this.producer.send({
      topic: 'raw-events',
      messages: batch.map((event) => ({
        key: Buffer.from(event.userId ?? event.anonymousId ?? 'system'),
        value: Buffer.from(JSON.stringify({
          ...event,
          sourceId: this.options.sourceId,
          receivedAt: new Date().toISOString(),
        })),
      })),
    });
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) clearInterval(this.flushInterval);
    await this.flush();
    await this.producer.disconnect();
  }
}

// Usage in Express middleware — auto-track API calls
export function analyticsMiddleware(analytics: ServerAnalytics) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.id;
    const start = Date.now();

    res.on('finish', () => {
      if (userId) {
        analytics.track(userId, 'api_request_completed', {
          method: req.method,
          path: req.path,            // No query params (privacy)
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
        });
      }
    });

    next();
  };
}
```

## Edge Cases

### Clock Skew

Clients send `timestamp` based on their local clock. Mobile device clocks can be wildly wrong (minutes or hours off). Detect and handle:

```typescript
// In ingestion server: validate timestamp sanity
function validateTimestamp(clientTs: string, serverReceivedAt: string): string {
  const client = new Date(clientTs).getTime();
  const server = new Date(serverReceivedAt).getTime();
  const skewMs = Math.abs(client - server);

  if (skewMs > 24 * 60 * 60 * 1000) {
    // More than 24 hours off — use server time
    return serverReceivedAt;
  }

  // Allow up to 30 minutes of future-dating (legitimate for some SDKs)
  if (client > server + 30 * 60 * 1000) {
    return serverReceivedAt;
  }

  return clientTs;
}
```

### Duplicate Events

Networks retry on timeout. SDK retries on failure. A single user action can generate 2–3 identical events. Deduplicate in the stream processor:

```typescript
// In Kafka Streams processor: deduplicate within 1-hour window
const dedup = new Set<string>();

function isDuplicate(event: ValidatedEvent): boolean {
  // Use messageId if present, else hash key fields
  const dedupeKey = event.messageId ?? `${event.event}:${event.userId}:${event.timestamp}`;
  if (dedup.has(dedupeKey)) return true;
  dedup.add(dedupeKey);
  // Clean up old entries (simple TTL with periodic cleanup)
  return false;
}
```

::: info War Story
**The sendBeacon Race Condition**

A team noticed their "checkout_completed" event was missing for about 8% of orders. The event was tracked correctly on the client (confirmed via debug mode), but wasn't showing up in analytics.

The issue: `checkout_completed` was fired immediately before redirecting to the confirmation page. The redirect happened faster than the batch flush interval (5 seconds). Even though they had `pagehide` listener for `sendBeacon`, the Safari bug in iOS 13 silently dropped `sendBeacon` calls made during page navigation.

The fix: track the event before starting the navigation, and wait for it to flush before redirecting.

```typescript
await analytics.flush();  // Wait for pending events
window.location.href = '/confirmation';
```

Additionally, fire server-side events for critical commerce actions from the order fulfillment backend — if the client event is missing, the server event catches it.
:::
