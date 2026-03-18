---
title: "Realtime Pipeline: Ingestion Layer"
description: "HTTP ingestion API, SDK design, client-side batching, and server-side validation"
tags: [ingestion, sdk, batching, kafka, typescript, api]
difficulty: "advanced"
prerequisites: [realtime-pipeline/architecture]
lastReviewed: "2026-03-18"
---

# Realtime Pipeline: Ingestion Layer

## Ingestion Design Principles

The ingestion layer is the entry point for all events. Its job is to:
1. Accept events as fast as possible (minimize client-facing latency)
2. Validate and normalize events
3. Publish to Kafka durably
4. Return immediately — no processing in the hot path

The ingestion API should NOT: enrich events, run business logic, query the database.

## API Endpoints

```
POST /v1/track          Single event
POST /v1/batch          Batch of events (recommended, up to 100 events)
POST /v1/identify       User identity association
POST /v1/page           Page view tracking (web)
```

### Batch Endpoint

The batch endpoint is the primary endpoint. Even for single events, clients should use the batch endpoint for consistency:

```typescript
import express from 'express';
import { Kafka, Producer, Partitioners } from 'kafkajs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { EventValidator } from './event-validator';
import { RateLimiter } from './rate-limiter';
import { logger } from './logger';
import { metrics } from './metrics';

const router = express.Router();
const ajv = new Ajv({ allErrors: true, removeAdditional: 'all' });
addFormats(ajv);

// Kafka producer for ingestion
const producer: Producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
  idempotent: true,           // Exactly-once at producer level
  maxInFlightRequests: 5,     // Required for idempotent
  transactionTimeout: 60000,
  retry: {
    initialRetryTime: 100,
    retries: 5,
    factor: 2,
    maxRetryTime: 30000,
  },
});

interface BatchRequest {
  writeKey: string;         // API key for authentication
  batch: Array<{
    type: 'track' | 'page' | 'identify';
    event?: string;         // For track events
    userId?: string;
    anonymousId: string;
    timestamp?: string;
    properties?: Record<string, unknown>;
    context?: Partial<EventContext>;
    messageId?: string;     // Client-generated dedup key
  }>;
  sentAt?: string;
  context?: Partial<EventContext>;  // Shared context for all events in batch
}

router.post('/v1/batch', async (req, res) => {
  const startTime = Date.now();
  const body: BatchRequest = req.body;

  // 1. Authenticate
  const project = await authenticateWriteKey(body.writeKey);
  if (!project) {
    return res.status(401).json({ error: 'Invalid write key' });
  }

  // 2. Rate limit per project
  const allowed = await rateLimiter.check(`project:${project.id}`, {
    maxRequests: project.rateLimitPerSecond ?? 1000,
    windowMs: 1000,
  });

  if (!allowed) {
    metrics.increment('ingestion_rate_limited_total', { projectId: project.id });
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: 1,
    });
  }

  // 3. Validate batch size
  if (!body.batch || body.batch.length === 0) {
    return res.status(400).json({ error: 'batch array is required and must not be empty' });
  }

  if (body.batch.length > 100) {
    return res.status(400).json({ error: 'batch must contain at most 100 events' });
  }

  // 4. Normalize and validate each event
  const validEvents: NormalizedEvent[] = [];
  const errors: Array<{ index: number; error: string }> = [];
  const now = new Date().toISOString();
  const serverIp = getClientIp(req);

  for (let i = 0; i < body.batch.length; i++) {
    const raw = body.batch[i];

    try {
      const normalized = normalizeEvent(raw, {
        projectId: project.id,
        receivedAt: now,
        sentAt: body.sentAt,
        serverIp,
        sharedContext: body.context,
      });

      const validation = EventValidator.validate(normalized);
      if (!validation.valid) {
        errors.push({ index: i, error: validation.error! });
        continue;
      }

      validEvents.push(normalized);
    } catch (error) {
      errors.push({ index: i, error: (error as Error).message });
    }
  }

  // 5. Publish valid events to Kafka (fire-and-forget to maintain low latency)
  if (validEvents.length > 0) {
    // Do not await — respond immediately
    publishToKafka(validEvents, project.id).catch(error => {
      logger.error({ msg: 'Failed to publish events to Kafka', error: error.message });
      metrics.increment('ingestion_kafka_publish_error_total');
    });
  }

  const latencyMs = Date.now() - startTime;
  metrics.histogram('ingestion_api_latency_ms', latencyMs);
  metrics.increment('ingestion_events_received_total', {
    projectId: project.id,
    count: body.batch.length,
  });

  // 6. Return immediately
  return res.status(200).json({
    success: true,
    received: validEvents.length,
    errors: errors.length > 0 ? errors : undefined,
  });
});

async function publishToKafka(
  events: NormalizedEvent[],
  projectId: string
): Promise<void> {
  const messages = events.map(event => ({
    key: Buffer.from(event.userId ?? event.anonymousId),
    value: Buffer.from(JSON.stringify(event)),
    headers: {
      'project-id': projectId,
      'schema-version': '1.1',
      'received-at': event.receivedAt,
    },
  }));

  await producer.send({
    topic: 'events-raw',
    messages,
    acks: -1,  // Wait for all in-sync replicas (strongest durability)
  });
}

function normalizeEvent(
  raw: BatchRequest['batch'][0],
  meta: {
    projectId: string;
    receivedAt: string;
    sentAt?: string;
    serverIp: string;
    sharedContext?: Partial<EventContext>;
  }
): NormalizedEvent {
  // Enforce timestamp bounds — reject events too far in the future or past
  const eventTime = raw.timestamp ? new Date(raw.timestamp) : new Date();
  const now = new Date();
  const maxFutureMs = 10 * 1000;          // 10 seconds in future
  const maxPastMs = 30 * 24 * 3600 * 1000; // 30 days in past

  let timestamp: Date;

  if (eventTime.getTime() > now.getTime() + maxFutureMs) {
    // Future event — use server time
    timestamp = now;
  } else if (eventTime.getTime() < now.getTime() - maxPastMs) {
    // Too old — use server time (likely a bug)
    timestamp = now;
  } else {
    timestamp = eventTime;
  }

  return {
    eventId: raw.messageId ?? generateUUID(),
    type: raw.type === 'track' ? raw.event ?? 'Unknown Event' : raw.type,
    userId: raw.userId,
    anonymousId: raw.anonymousId,
    sessionId: extractSessionId(raw.context),
    projectId: meta.projectId,
    timestamp: timestamp.toISOString(),
    receivedAt: meta.receivedAt,
    sentAt: meta.sentAt,
    properties: sanitizeProperties(raw.properties ?? {}),
    context: mergeContext(meta.sharedContext, raw.context, meta.serverIp),
  };
}

function sanitizeProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  // Remove PII fields if configured
  const PII_FIELDS = ['password', 'ssn', 'creditCard', 'cvv', 'secret'];
  const sanitized = { ...properties };

  for (const field of PII_FIELDS) {
    if (field in sanitized) {
      delete sanitized[field];
    }
  }

  // Enforce max property size
  const json = JSON.stringify(sanitized);
  if (json.length > 10_000) {
    throw new Error('Event properties exceed 10KB limit');
  }

  return sanitized;
}
```

## JavaScript SDK

The client SDK handles batching, retries, and local buffering:

```typescript
// Client-side SDK (browser/Node.js)
interface AnalyticsConfig {
  writeKey: string;
  endpoint?: string;     // Default: https://ingest.yourapp.com
  batchSize?: number;    // Default: 30 events
  flushInterval?: number; // Default: 5000ms
  maxRetries?: number;   // Default: 3
  debug?: boolean;
}

export class Analytics {
  private queue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: Required<AnalyticsConfig>;
  private failedEvents: QueuedEvent[] = [];

  constructor(config: AnalyticsConfig) {
    this.config = {
      endpoint: 'https://ingest.yourapp.com',
      batchSize: 30,
      flushInterval: 5000,
      maxRetries: 3,
      debug: false,
      ...config,
    };

    // Flush before page unload (best effort)
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
      // sendBeacon for guaranteed delivery on page close
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flushWithBeacon();
        }
      });
    }

    this.startFlushTimer();
  }

  track(event: string, properties?: Record<string, unknown>): void {
    this.enqueue({
      type: 'track',
      event,
      anonymousId: this.getAnonymousId(),
      userId: this.getUserId(),
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId(),
      properties: properties ?? {},
      context: this.getContext(),
    });
  }

  page(properties?: Record<string, unknown>): void {
    this.enqueue({
      type: 'page',
      anonymousId: this.getAnonymousId(),
      userId: this.getUserId(),
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId(),
      properties: {
        ...properties,
        url: window.location.href,
        path: window.location.pathname,
        title: document.title,
        referrer: document.referrer,
      },
    });
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    // Associate anonymous ID with user ID
    this.setUserId(userId);

    this.enqueue({
      type: 'identify',
      userId,
      anonymousId: this.getAnonymousId(),
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId(),
      properties: traits ?? {},
    });
  }

  private enqueue(event: QueuedEvent): void {
    this.queue.push(event);

    if (this.config.debug) {
      console.log('[Analytics] Queued event:', event.type, event.event);
    }

    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.config.endpoint}/v1/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            writeKey: this.config.writeKey,
            batch,
            sentAt: new Date().toISOString(),
            context: this.getContext(),
          }),
          keepalive: true,  // Allow request to outlive page
        });

        if (!response.ok) {
          const shouldRetry = response.status >= 500;
          if (!shouldRetry || attempt === this.config.maxRetries) {
            if (this.config.debug) {
              console.error('[Analytics] Failed to flush:', response.status);
            }
            break;
          }
          // Retry with exponential backoff
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
          continue;
        }

        return;  // Success
      } catch (networkError) {
        if (attempt < this.config.maxRetries) {
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
        }
      }
    }

    // Failed after all retries — store in localStorage for next session
    this.persistFailedEvents(batch);
  }

  private flushWithBeacon(): void {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);
    const payload = JSON.stringify({
      writeKey: this.config.writeKey,
      batch,
      sentAt: new Date().toISOString(),
    });

    // sendBeacon is fire-and-forget, works after page close
    navigator.sendBeacon(
      `${this.config.endpoint}/v1/batch`,
      new Blob([payload], { type: 'application/json' })
    );
  }

  private persistFailedEvents(events: QueuedEvent[]): void {
    try {
      const existing = JSON.parse(
        localStorage.getItem('analytics_failed_events') ?? '[]'
      ) as QueuedEvent[];
      const combined = [...existing, ...events].slice(-100);  // Max 100 failed events
      localStorage.setItem('analytics_failed_events', JSON.stringify(combined));
    } catch {
      // localStorage not available (Safari private mode, etc.)
    }
  }

  private retryFailedEvents(): void {
    try {
      const failed = JSON.parse(
        localStorage.getItem('analytics_failed_events') ?? '[]'
      ) as QueuedEvent[];
      if (failed.length > 0) {
        this.queue.push(...failed);
        localStorage.removeItem('analytics_failed_events');
      }
    } catch {}
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
  }

  private getAnonymousId(): string {
    let id = localStorage.getItem('analytics_anonymous_id');
    if (!id) {
      id = this.generateMessageId();
      localStorage.setItem('analytics_anonymous_id', id);
    }
    return id;
  }

  private getUserId(): string | undefined {
    return localStorage.getItem('analytics_user_id') ?? undefined;
  }

  private setUserId(userId: string): void {
    localStorage.setItem('analytics_user_id', userId);
  }

  private generateMessageId(): string {
    // UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private getContext(): Partial<EventContext> {
    if (typeof window === 'undefined') return {};

    return {
      page: {
        url: window.location.href,
        path: window.location.pathname,
        title: document.title,
        referrer: document.referrer,
        search: window.location.search,
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        density: window.devicePixelRatio,
      },
      locale: navigator.language,
    };
  }
}
```

## Event Validation

```typescript
import Ajv, { JSONSchemaType } from 'ajv';

const ajv = new Ajv({ allErrors: true });

const EVENT_SCHEMA = {
  type: 'object',
  required: ['eventId', 'type', 'anonymousId', 'timestamp'],
  properties: {
    eventId:     { type: 'string', minLength: 1, maxLength: 100 },
    type:        { type: 'string', minLength: 1, maxLength: 100 },
    userId:      { type: 'string', maxLength: 500 },
    anonymousId: { type: 'string', minLength: 1, maxLength: 500 },
    sessionId:   { type: 'string', maxLength: 500 },
    timestamp:   { type: 'string', format: 'date-time' },
    properties: {
      type: 'object',
      additionalProperties: true,
      maxProperties: 200,  // Prevent runaway properties
    },
  },
  additionalProperties: true,
};

const validateFn = ajv.compile(EVENT_SCHEMA);

export class EventValidator {
  static validate(event: unknown): { valid: boolean; error?: string } {
    const valid = validateFn(event);
    if (!valid) {
      const errors = validateFn.errors
        ?.map(e => `${e.instancePath} ${e.message}`)
        .join('; ');
      return { valid: false, error: errors };
    }
    return { valid: true };
  }
}
```

## Server-Side SDK

For backend event tracking (server-to-server):

```typescript
// Server-side SDK with synchronous flush support
export class ServerAnalytics {
  private readonly queue: NormalizedEvent[] = [];
  private readonly client: AnalyticsHttpClient;

  constructor(config: { writeKey: string; endpoint: string }) {
    this.client = new AnalyticsHttpClient(config);
  }

  track(params: {
    userId?: string;
    anonymousId: string;
    event: string;
    properties?: Record<string, unknown>;
    timestamp?: Date;
    context?: Partial<EventContext>;
  }): void {
    this.queue.push({
      eventId: generateUUID(),
      type: params.event,
      userId: params.userId,
      anonymousId: params.anonymousId,
      sessionId: `server-${params.anonymousId}`,
      timestamp: (params.timestamp ?? new Date()).toISOString(),
      properties: params.properties ?? {},
      context: {
        ...params.context,
        library: { name: 'analytics-server-sdk', version: '1.0.0' },
      },
    });
  }

  // Synchronous flush — await before process.exit() or request end
  async flush(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, 100);
      await this.client.sendBatch(batch);
    }
  }
}
```

## Performance Characteristics

| Metric | Target | Notes |
|--------|--------|-------|
| API p50 latency | < 5ms | Kafka publish is async |
| API p99 latency | < 50ms | Includes validation |
| API throughput | 10k req/s per instance | Horizontally scalable |
| Batch size (client) | 30 events | Optimal for network efficiency |
| Kafka publish latency | 20-100ms | async, doesn't block API response |
| Max event size | 64KB | Enforced at API layer |
| Max batch size | 100 events | Enforced at API layer |

::: info War Story
Our ingestion API had 10ms p99 latency. After a deploy, p99 jumped to 2000ms. Investigation revealed the Kafka producer was waiting synchronously for `acks: -1` (all in-sync replicas acknowledge). During one broker's leader election, all publishes waited until the new leader was elected (~1.8s).

The fix: Kafka publish is fire-and-forget in the ingestion API. We decouple the HTTP response from the Kafka ack. The tradeoff: if the API pod crashes after responding 200 but before Kafka acknowledges, we lose those events. For analytics (not financial), this is acceptable.

Alternative: use `acks: 1` (only leader must ack) for lower latency with slightly weaker durability.
:::
