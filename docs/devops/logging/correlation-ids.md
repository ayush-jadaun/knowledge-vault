---
title: Correlation IDs
description: Request ID generation with UUID v4 and ULID, propagation across services via HTTP headers and message metadata, async context management in Node.js with AsyncLocalStorage, and distributed tracing correlation for end-to-end request tracking.
tags:
  - correlation-ids
  - request-id
  - distributed-tracing
  - async-local-storage
  - uuid
  - ulid
  - node.js
  - observability
difficulty: intermediate
prerequisites:
  - devops/logging/index
  - devops/logging/structured-logging
  - Understanding of HTTP headers and middleware
lastReviewed: "2026-03-17"
---

# Correlation IDs

In a distributed system, a single user action — clicking "Place Order" — might trigger requests across 10 services: API gateway, order service, inventory service, payment service, notification service, and so on. Without correlation IDs, the logs from each of these services are completely disconnected. You see "payment failed" in the payment service logs but cannot connect it to the specific order in the order service or the specific user request in the API gateway.

Correlation IDs solve this by assigning a unique identifier to each user request and propagating it through every service that handles that request. When you search your log aggregation system for `requestId:req_7f3a2b1c`, you get every log line from every service that participated in that specific request.

## ID Types and Generation

### Request ID

A unique identifier generated for each incoming request at the edge of your system (API gateway or first service to receive the request). Every downstream service receives and propagates this ID.

### Trace ID

A unique identifier from your distributed tracing system (OpenTelemetry, Jaeger, Zipkin). The trace ID follows the same propagation path as the request ID but also carries span information for latency analysis.

### Span ID

Identifies a specific operation within a trace. Each service or significant operation creates a new span. Spans form a tree structure under the trace ID.

### Relationship Between IDs

```
User Request
  │
  ├── Request ID: req_7f3a2b1c  (for log correlation)
  │
  └── Trace ID: 4bf92f3577b34da6a3ce929d0e0e4736  (for distributed tracing)
       │
       ├── Span: api-gateway (span_id: 00f067aa0ba902b7)
       │    │
       │    ├── Span: order-service (span_id: 1a2b3c4d5e6f7890)
       │    │    │
       │    │    ├── Span: db-query (span_id: 2b3c4d5e6f789012)
       │    │    └── Span: payment-service (span_id: 3c4d5e6f78901234)
       │    │         │
       │    │         └── Span: payment-gateway-call (span_id: 4d5e6f7890123456)
       │    │
       │    └── Span: notification-service (span_id: 5e6f789012345678)
```

Both IDs appear on every log line. The request ID is used for log searching. The trace ID is used for trace visualization in Jaeger/Tempo.

## ID Generation Strategies

### UUID v4

```typescript
import { randomUUID } from 'crypto';

// Node.js built-in (crypto.randomUUID, available since v19.0.0)
const requestId = randomUUID();
// Result: "550e8400-e29b-41d4-a716-446655440000"

// Or with uuid package for broader compatibility
import { v4 as uuidv4 } from 'uuid';
const requestId = uuidv4();
```

**Characteristics:**
- 128 bits of randomness
- 36 characters (with hyphens)
- No temporal ordering (random bytes)
- Universally supported
- Negligible collision probability (2^122 possibilities)

### ULID (Universally Unique Lexicographically Sortable Identifier)

```typescript
import { ulid } from 'ulid';

const requestId = ulid();
// Result: "01ARZ3NDEKTSV4RRFFQ69G5FAV"
```

**Characteristics:**
- 128 bits: 48-bit timestamp + 80-bit randomness
- 26 characters (Crockford Base32)
- Lexicographically sortable (IDs generated later sort after earlier ones)
- Time-component allows rough temporal ordering of requests
- Monotonic within the same millisecond

### Comparison

| Aspect | UUID v4 | ULID |
|---|---|---|
| Length | 36 chars | 26 chars |
| Sortable | No | Yes (by time) |
| Time component | No | Yes (ms precision) |
| Uniqueness | 2^122 random | 2^80 random per ms |
| Standard | RFC 4122 | Not an IETF standard |
| Performance | Fast (crypto.randomUUID) | Fast |

**Recommendation:** Use ULIDs for request IDs. The temporal sortability is useful for debugging ("show me all request IDs generated around 14:32"). Use UUID v4 when strict RFC compliance is required.

### Prefixed IDs

Adding a prefix makes IDs self-describing and distinguishable in logs:

```typescript
function generateRequestId(): string {
  return `req_${ulid()}`;
}

function generateTraceId(): string {
  return `trc_${ulid()}`;
}

// In logs:
// requestId: "req_01ARZ3NDEKTSV4RRFFQ69G5FAV"
// traceId: "trc_01ARZ3NDEKTSV4RRFFQ69G5FAV"
```

## Propagation Across Services

### HTTP Header Propagation

The standard pattern is to propagate correlation IDs via HTTP headers.

**Standard headers:**

| Header | Purpose | Standard |
|---|---|---|
| `X-Request-Id` | Request correlation | De facto standard |
| `X-Correlation-Id` | Alternative to X-Request-Id | Common in enterprise |
| `traceparent` | W3C Trace Context | W3C Recommendation |
| `tracestate` | Additional trace vendor data | W3C Recommendation |
| `X-B3-TraceId` | Zipkin/B3 trace ID | Zipkin |
| `X-B3-SpanId` | Zipkin/B3 span ID | Zipkin |

**W3C Trace Context format (traceparent):**

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
              ^^                                  ^^                ^^
              version                             span-id           flags
                 trace-id (32 hex chars)
```

### Complete Propagation Middleware

```typescript
// src/middleware/correlation.ts
import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';
import { ulid } from 'ulid';

export interface CorrelationContext {
  requestId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  userId?: string;
  tenantId?: string;
}

const correlationStore = new AsyncLocalStorage<CorrelationContext>();

export function correlationMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Extract or generate correlation IDs
    const requestId =
      (req.headers['x-request-id'] as string) ??
      `req_${ulid()}`;

    // Parse W3C traceparent header if present
    const traceparent = req.headers['traceparent'] as string;
    let traceId: string;
    let parentSpanId: string | undefined;

    if (traceparent) {
      const parts = traceparent.split('-');
      traceId = parts[1]; // 32 hex chars
      parentSpanId = parts[2]; // 16 hex chars
    } else {
      traceId =
        (req.headers['x-trace-id'] as string) ??
        generateTraceId();
    }

    // Generate a new span ID for this service
    const spanId = generateSpanId();

    const context: CorrelationContext = {
      requestId,
      traceId,
      spanId,
      parentSpanId,
      userId: req.headers['x-user-id'] as string,
      tenantId: req.headers['x-tenant-id'] as string,
    };

    // Set response headers so the caller can correlate
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Trace-Id', traceId);

    // Run the rest of the request in the correlation context
    correlationStore.run(context, () => next());
  };
}

export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStore.getStore();
}

export function getRequestId(): string | undefined {
  return correlationStore.getStore()?.requestId;
}

function generateTraceId(): string {
  // 32 hex characters (128 bits) — compatible with W3C Trace Context
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSpanId(): string {
  // 16 hex characters (64 bits)
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### Propagating to Downstream HTTP Calls

```typescript
// src/http/correlated-fetch.ts
import { getCorrelationContext, CorrelationContext } from '../middleware/correlation';

export function getCorrelationHeaders(): Record<string, string> {
  const ctx = getCorrelationContext();
  if (!ctx) return {};

  const headers: Record<string, string> = {
    'X-Request-Id': ctx.requestId,
    'X-Trace-Id': ctx.traceId,
  };

  // W3C Trace Context
  headers['traceparent'] = `00-${ctx.traceId}-${ctx.spanId}-01`;

  if (ctx.userId) {
    headers['X-User-Id'] = ctx.userId;
  }
  if (ctx.tenantId) {
    headers['X-Tenant-Id'] = ctx.tenantId;
  }

  return headers;
}

export async function correlatedFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const correlationHeaders = getCorrelationHeaders();

  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(correlationHeaders)) {
    headers.set(key, value);
  }

  return fetch(url, { ...init, headers });
}
```

```typescript
// Usage in a service:
import { correlatedFetch } from '../http/correlated-fetch';

async function chargePayment(orderId: string, amount: number): Promise<PaymentResult> {
  const response = await correlatedFetch('https://payment-service.internal/charge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, amount }),
  });
  // The payment service receives X-Request-Id, X-Trace-Id, and traceparent
  // and includes them in its own logs
  return response.json();
}
```

### Propagating Through Message Queues

For asynchronous communication (Kafka, RabbitMQ, SQS), propagate correlation IDs in message metadata.

```typescript
// src/messaging/correlated-producer.ts
import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import { getCorrelationContext } from '../middleware/correlation';

export class CorrelatedProducer {
  constructor(private producer: Producer) {}

  async send(record: ProducerRecord): Promise<void> {
    const ctx = getCorrelationContext();

    // Add correlation IDs to message headers
    const messages = record.messages.map(msg => ({
      ...msg,
      headers: {
        ...msg.headers,
        ...(ctx && {
          'x-request-id': Buffer.from(ctx.requestId),
          'x-trace-id': Buffer.from(ctx.traceId),
          'x-span-id': Buffer.from(ctx.spanId),
          ...(ctx.userId && { 'x-user-id': Buffer.from(ctx.userId) }),
          ...(ctx.tenantId && { 'x-tenant-id': Buffer.from(ctx.tenantId) }),
        }),
      },
    }));

    await this.producer.send({ ...record, messages });
  }
}
```

```typescript
// src/messaging/correlated-consumer.ts
import { EachMessagePayload } from 'kafkajs';
import { AsyncLocalStorage } from 'async_hooks';
import { CorrelationContext } from '../middleware/correlation';

const correlationStore = new AsyncLocalStorage<CorrelationContext>();

export function extractCorrelationFromMessage(
  payload: EachMessagePayload
): CorrelationContext {
  const headers = payload.message.headers ?? {};

  return {
    requestId: headers['x-request-id']?.toString() ?? `msg_${ulid()}`,
    traceId: headers['x-trace-id']?.toString() ?? generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: headers['x-span-id']?.toString(),
    userId: headers['x-user-id']?.toString(),
    tenantId: headers['x-tenant-id']?.toString(),
  };
}

export async function processWithCorrelation(
  payload: EachMessagePayload,
  handler: (payload: EachMessagePayload) => Promise<void>
): Promise<void> {
  const context = extractCorrelationFromMessage(payload);

  await correlationStore.run(context, async () => {
    const logger = getLogger();
    logger.info({
      topic: payload.topic,
      partition: payload.partition,
      offset: payload.message.offset,
      requestId: context.requestId,
      traceId: context.traceId,
    }, 'Processing message');

    await handler(payload);
  });
}
```

## AsyncLocalStorage Deep Dive

`AsyncLocalStorage` is the Node.js mechanism that makes implicit context propagation possible. Understanding its behavior is essential for reliable correlation ID propagation.

### How It Works

```typescript
import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage<{ requestId: string }>();

// .run() establishes a context for all sync and async operations within the callback
storage.run({ requestId: 'req_123' }, () => {
  // Synchronous access
  console.log(storage.getStore()?.requestId); // "req_123"

  // Asynchronous access — context follows the async chain
  setTimeout(() => {
    console.log(storage.getStore()?.requestId); // "req_123"
  }, 100);

  // Promise chains preserve context
  Promise.resolve()
    .then(() => storage.getStore()?.requestId)  // "req_123"
    .then(id => console.log(id));

  // Async/await preserves context
  (async () => {
    await someAsyncOperation();
    console.log(storage.getStore()?.requestId); // "req_123"
  })();

  // Event emitters preserve context
  const emitter = new EventEmitter();
  emitter.on('data', () => {
    console.log(storage.getStore()?.requestId); // "req_123"
  });
  emitter.emit('data');
});

// Outside the .run() callback, context is undefined
console.log(storage.getStore()); // undefined
```

### Context Loss Scenarios

Context can be lost in specific scenarios. Knowing these helps prevent hard-to-debug correlation failures.

**Native addons that create new async contexts:**

Some native addons (e.g., certain database drivers) create new async contexts that do not inherit from the parent. If your database driver loses context, wrap the callback:

```typescript
// If a library loses async context, wrap its callback
someNativeLib.doOperation((err, result) => {
  // Context might be lost here with some native addons
  const ctx = getCorrelationContext(); // undefined!
});

// Workaround: capture context before the call
const ctx = getCorrelationContext();
someNativeLib.doOperation((err, result) => {
  correlationStore.run(ctx, () => {
    // Context is restored
    const logger = getLogger();
    logger.info('Operation completed');
  });
});
```

**Worker threads:**

`AsyncLocalStorage` does not propagate across worker threads. You must manually pass context:

```typescript
import { Worker, parentPort, workerData } from 'worker_threads';

// Main thread: pass context in workerData
const worker = new Worker('./worker.js', {
  workerData: {
    correlationContext: getCorrelationContext(),
    // ... other data
  },
});

// Worker thread: restore context
const context = workerData.correlationContext;
correlationStore.run(context, () => {
  // Process in context
});
```

### Performance Considerations

`AsyncLocalStorage` has a small performance overhead (roughly 5-8% in microbenchmarks). In real applications with I/O operations, this overhead is negligible. Do not avoid `AsyncLocalStorage` for performance reasons — the debugging value far outweighs the cost.

```
Benchmark: 10,000 async operations with context propagation
  Without AsyncLocalStorage: 142ms
  With AsyncLocalStorage:    153ms
  Overhead: ~7.7%

In a real request that takes 50ms, the overhead is < 0.5ms — invisible.
```

## Distributed Tracing Integration

### OpenTelemetry Integration

If you use OpenTelemetry for distributed tracing, your trace ID is automatically propagated. You can extract it for logging:

```typescript
// src/middleware/otel-correlation.ts
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorage } from 'async_hooks';
import { ulid } from 'ulid';

const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export function otelCorrelationMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Get trace context from OpenTelemetry (automatically propagated)
    const span = trace.getSpan(context.active());
    const spanContext = span?.spanContext();

    // Generate a request ID (separate from trace ID for log correlation)
    const requestId =
      (req.headers['x-request-id'] as string) ??
      `req_${ulid()}`;

    res.setHeader('X-Request-Id', requestId);

    requestContext.run({ requestId }, () => {
      // If using Pino, create a child logger with both IDs
      const childLogger = logger.child({
        requestId,
        traceId: spanContext?.traceId,
        spanId: spanContext?.spanId,
      });

      (req as any).log = childLogger;
      next();
    });
  };
}
```

### Connecting Logs to Traces in Grafana

When your logs contain a `traceId` field and you have Tempo or Jaeger configured as a datasource:

1. In the Loki datasource configuration, add a derived field:
   - Name: `TraceID`
   - Regex: `"traceId":"([a-f0-9]+)"`
   - Internal link → Tempo datasource
   - URL: `${__value.raw}`

2. Now when viewing logs in Grafana, each log line with a `traceId` will have a clickable link that opens the trace in Tempo.

This creates the "metrics → logs → traces" investigation flow:
1. Metric dashboard shows error rate spike
2. Click on the time range to jump to Loki logs filtered by that time window
3. Find an error log line with a `traceId`
4. Click the trace link to see the full distributed trace in Tempo

## Testing Correlation ID Propagation

```typescript
// src/__tests__/correlation.test.ts
import request from 'supertest';
import { app } from '../app';

describe('Correlation ID Propagation', () => {
  it('should generate a request ID when none is provided', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['x-request-id']).toMatch(/^req_/);
  });

  it('should preserve the request ID when provided', async () => {
    const requestId = 'req_01ARZ3NDEKTSV4RRFFQ69G5FAV';

    const response = await request(app)
      .get('/api/health')
      .set('X-Request-Id', requestId);

    expect(response.headers['x-request-id']).toBe(requestId);
  });

  it('should propagate request ID to downstream services', async () => {
    const requestId = 'req_test_propagation';
    let capturedHeaders: Record<string, string> = {};

    // Mock downstream service to capture headers
    nock('https://downstream-service.internal')
      .post('/api/action')
      .reply(function () {
        capturedHeaders = this.req.headers;
        return [200, { success: true }];
      });

    await request(app)
      .post('/api/trigger-downstream')
      .set('X-Request-Id', requestId);

    expect(capturedHeaders['x-request-id']).toBe(requestId);
  });

  it('should include request ID in all log lines', async () => {
    const logLines: any[] = [];
    // Capture log output
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      try {
        logLines.push(JSON.parse(chunk));
      } catch {
        // Not JSON, ignore
      }
      return true;
    }) as any;

    const response = await request(app).get('/api/orders/123');
    const requestId = response.headers['x-request-id'];

    process.stdout.write = originalWrite;

    // Every log line for this request should have the request ID
    const requestLogLines = logLines.filter(l => l.requestId === requestId);
    expect(requestLogLines.length).toBeGreaterThan(0);

    for (const line of requestLogLines) {
      expect(line.requestId).toBe(requestId);
    }
  });
});
```

## Key Takeaways

- Every request entering your system must receive a unique correlation ID at the edge, and that ID must appear in every log line across every service that handles the request.
- Use ULIDs for request IDs (sortable, shorter than UUIDs) and W3C Trace Context for distributed tracing interoperability.
- Propagate correlation IDs via HTTP headers (`X-Request-Id`, `traceparent`) for synchronous calls and via message headers for asynchronous communication.
- Use Node.js `AsyncLocalStorage` to make correlation context implicitly available without passing logger instances through every function.
- Connect your logs to your traces by including `traceId` in log lines and configuring derived fields in Grafana.
- Test correlation propagation just like you test application logic — verify that IDs are generated, preserved, and propagated correctly.
