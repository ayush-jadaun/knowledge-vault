---
title: Custom Metrics
description: Designing and implementing business metrics, application-level metrics, Prometheus naming conventions, label cardinality management, and exemplars for connecting metrics to traces — with TypeScript instrumentation examples.
tags:
  - metrics
  - custom-metrics
  - business-metrics
  - prometheus
  - prom-client
  - typescript
  - exemplars
  - cardinality
difficulty: intermediate
prerequisites:
  - monitoring/index
  - monitoring/prometheus-deep-dive
  - monitoring/metrics-design
lastReviewed: "2026-03-17"
---

# Custom Metrics

Default metrics — CPU, memory, GC pauses — tell you whether your infrastructure is healthy. RED metrics tell you whether your HTTP layer is healthy. But neither tells you whether your business is healthy. Are users successfully completing checkout? Is search returning results? Are background jobs keeping up? Custom metrics bridge the gap between infrastructure health and business health.

This guide covers how to design custom metrics, name them correctly, avoid cardinality bombs, and connect them to traces using exemplars.

## Business Metrics

Business metrics measure what your application does, not how your infrastructure performs. They are the most valuable metrics you can instrument because they directly answer "is the business working?"

### What to Instrument

| Domain | Metric | Type | Labels |
|---|---|---|---|
| **E-commerce** | Orders placed | Counter | `payment_method`, `status` |
| **E-commerce** | Order value | Histogram | `payment_method`, `currency` |
| **E-commerce** | Cart abandonment | Counter | `step` (where they dropped off) |
| **Authentication** | Login attempts | Counter | `method` (password, OAuth, SSO), `result` (success, failure, mfa_required) |
| **Authentication** | Token refresh | Counter | `result` |
| **Search** | Queries performed | Counter | `result_count_bucket` (0, 1-10, 10-100, 100+) |
| **Search** | Query latency | Histogram | `query_type` |
| **Messaging** | Messages sent | Counter | `channel` (email, SMS, push) |
| **Messaging** | Delivery status | Counter | `channel`, `status` (delivered, bounced, failed) |
| **API** | Rate limit hits | Counter | `client_id`, `endpoint` |
| **Background jobs** | Jobs processed | Counter | `job_type`, `result` |
| **Background jobs** | Job duration | Histogram | `job_type` |
| **Background jobs** | Queue depth | Gauge | `queue_name` |

### TypeScript Implementation

```typescript
// src/metrics/business-metrics.ts
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export function createBusinessMetrics(registry: Registry) {
  // ---- E-commerce Metrics ----

  const ordersTotal = new Counter({
    name: 'business_orders_total',
    help: 'Total number of orders placed',
    labelNames: ['payment_method', 'status', 'currency'] as const,
    registers: [registry],
  });

  const orderValueDollars = new Histogram({
    name: 'business_order_value_dollars',
    help: 'Value of orders in dollars',
    labelNames: ['payment_method'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [registry],
  });

  const cartAbandonment = new Counter({
    name: 'business_cart_abandonment_total',
    help: 'Cart abandonment events by step',
    labelNames: ['step'] as const,
    registers: [registry],
  });

  const revenueTotal = new Counter({
    name: 'business_revenue_dollars_total',
    help: 'Total revenue in dollars (only successful orders)',
    labelNames: ['currency'] as const,
    registers: [registry],
  });

  // ---- Authentication Metrics ----

  const loginAttempts = new Counter({
    name: 'business_login_attempts_total',
    help: 'Login attempts by method and result',
    labelNames: ['method', 'result'] as const,
    registers: [registry],
  });

  const activeSessionsGauge = new Gauge({
    name: 'business_active_sessions',
    help: 'Number of active user sessions',
    registers: [registry],
  });

  const signupsTotal = new Counter({
    name: 'business_signups_total',
    help: 'User signups by source',
    labelNames: ['source', 'plan'] as const,
    registers: [registry],
  });

  // ---- Search Metrics ----

  const searchQueries = new Counter({
    name: 'business_search_queries_total',
    help: 'Search queries by type',
    labelNames: ['query_type', 'has_results'] as const,
    registers: [registry],
  });

  const searchLatency = new Histogram({
    name: 'business_search_duration_seconds',
    help: 'Search query duration in seconds',
    labelNames: ['query_type'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const searchResultCount = new Histogram({
    name: 'business_search_result_count',
    help: 'Number of search results returned',
    labelNames: ['query_type'] as const,
    buckets: [0, 1, 5, 10, 25, 50, 100, 500, 1000],
    registers: [registry],
  });

  // ---- Background Job Metrics ----

  const jobsProcessed = new Counter({
    name: 'business_jobs_processed_total',
    help: 'Background jobs processed',
    labelNames: ['job_type', 'result'] as const,
    registers: [registry],
  });

  const jobDuration = new Histogram({
    name: 'business_job_duration_seconds',
    help: 'Background job duration in seconds',
    labelNames: ['job_type'] as const,
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300, 600],
    registers: [registry],
  });

  const jobQueueDepth = new Gauge({
    name: 'business_job_queue_depth',
    help: 'Number of jobs waiting in queue',
    labelNames: ['queue_name'] as const,
    registers: [registry],
  });

  const jobQueueLatency = new Histogram({
    name: 'business_job_queue_wait_seconds',
    help: 'Time a job spent waiting in the queue before processing',
    labelNames: ['queue_name'] as const,
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
    registers: [registry],
  });

  return {
    ordersTotal,
    orderValueDollars,
    cartAbandonment,
    revenueTotal,
    loginAttempts,
    activeSessionsGauge,
    signupsTotal,
    searchQueries,
    searchLatency,
    searchResultCount,
    jobsProcessed,
    jobDuration,
    jobQueueDepth,
    jobQueueLatency,
  };
}
```

### Using Business Metrics in Application Code

```typescript
// src/services/order-service.ts
import { businessMetrics } from '../metrics';

export class OrderService {
  async placeOrder(order: Order): Promise<OrderResult> {
    const timer = businessMetrics.jobDuration.startTimer({ job_type: 'place_order' });

    try {
      // Validate payment
      const paymentResult = await this.paymentGateway.charge(order);

      if (paymentResult.success) {
        businessMetrics.ordersTotal.inc({
          payment_method: order.paymentMethod,
          status: 'completed',
          currency: order.currency,
        });
        businessMetrics.orderValueDollars.observe(
          { payment_method: order.paymentMethod },
          order.totalAmountDollars
        );
        businessMetrics.revenueTotal.inc(
          { currency: order.currency },
          order.totalAmountDollars
        );

        timer({ result: 'success' });
        return { success: true, orderId: paymentResult.orderId };
      } else {
        businessMetrics.ordersTotal.inc({
          payment_method: order.paymentMethod,
          status: 'payment_failed',
          currency: order.currency,
        });

        timer({ result: 'payment_failed' });
        return { success: false, reason: 'payment_failed' };
      }
    } catch (error) {
      businessMetrics.ordersTotal.inc({
        payment_method: order.paymentMethod,
        status: 'error',
        currency: order.currency,
      });

      timer({ result: 'error' });
      throw error;
    }
  }
}

// src/services/search-service.ts
export class SearchService {
  async search(query: string, type: string): Promise<SearchResult[]> {
    const timer = businessMetrics.searchLatency.startTimer({ query_type: type });

    try {
      const results = await this.searchEngine.query(query, type);

      businessMetrics.searchQueries.inc({
        query_type: type,
        has_results: results.length > 0 ? 'true' : 'false',
      });
      businessMetrics.searchResultCount.observe(
        { query_type: type },
        results.length
      );

      timer();
      return results;
    } catch (error) {
      timer();
      throw error;
    }
  }
}
```

### Background Job Queue Monitoring

```typescript
// src/workers/queue-monitor.ts
import { businessMetrics } from '../metrics';
import { Queue } from 'bullmq';

export class QueueMonitor {
  private queues: Map<string, Queue>;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(queues: Map<string, Queue>) {
    this.queues = queues;
  }

  start(intervalMs: number = 5000): void {
    this.intervalHandle = setInterval(async () => {
      for (const [name, queue] of this.queues) {
        const counts = await queue.getJobCounts(
          'waiting', 'active', 'delayed', 'failed'
        );
        businessMetrics.jobQueueDepth.set(
          { queue_name: name },
          counts.waiting + counts.delayed
        );
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}

// In your worker process:
import { Worker, Job } from 'bullmq';

const worker = new Worker('email-queue', async (job: Job) => {
  const queueWaitTime = (Date.now() - job.timestamp) / 1000;
  businessMetrics.jobQueueLatency.observe(
    { queue_name: 'email-queue' },
    queueWaitTime
  );

  const timer = businessMetrics.jobDuration.startTimer({
    job_type: job.name,
  });

  try {
    await processEmailJob(job.data);
    businessMetrics.jobsProcessed.inc({
      job_type: job.name,
      result: 'success',
    });
    timer({ result: 'success' });
  } catch (error) {
    businessMetrics.jobsProcessed.inc({
      job_type: job.name,
      result: 'error',
    });
    timer({ result: 'error' });
    throw error;
  }
});
```

## Prometheus Naming Conventions

Prometheus has strict naming conventions. Following them ensures consistency across your organization and compatibility with community tooling.

### Rules

1. **Metric names must match `[a-zA-Z_:][a-zA-Z0-9_:]*`**
2. **Use snake_case** — `http_requests_total`, not `httpRequestsTotal`
3. **Include the unit as a suffix** — `_seconds`, `_bytes`, `_total`
4. **Use base units** — seconds (not milliseconds), bytes (not kilobytes)
5. **Counters must end in `_total`** — `http_requests_total`
6. **Use a prefix for your application** — `myapp_`, `business_`, `checkout_`
7. **Recording rules use colons** — `job:http_requests:rate5m`

### Naming Examples

| Good | Bad | Why |
|---|---|---|
| `http_request_duration_seconds` | `http_request_duration_ms` | Use base units (seconds, not ms) |
| `http_requests_total` | `http_requests` | Counters must end in `_total` |
| `http_request_size_bytes` | `http_request_size_kb` | Use base units (bytes, not KB) |
| `process_cpu_seconds_total` | `process_cpu_usage` | Include unit and `_total` for counters |
| `node_memory_MemAvailable_bytes` | `node_memory_available` | Include unit |
| `business_orders_total` | `orders` | Include prefix and `_total` |
| `db_query_duration_seconds` | `dbQueryDuration` | Use snake_case |

### Label Naming

- Labels use snake_case: `status_code`, `http_method`, `pod_name`
- Keep label names descriptive but concise
- Use consistent label names across metrics (`method`, not `http_method` in one and `request_method` in another)
- Never encode metric values into label names (antipattern: `requests_get_total`, `requests_post_total`)

## Label Cardinality: The Silent Killer

Label cardinality is the number of unique label value combinations for a metric. Every unique combination creates a separate time series. High cardinality is the #1 cause of Prometheus performance problems and out-of-memory crashes.

### The Math

```
time_series_count = metric × distinct_value(label_1) × distinct_value(label_2) × ...

Example:
  http_request_duration_seconds
    method: 5 values (GET, POST, PUT, DELETE, PATCH)
    route: 20 values
    status_code: 10 values
    instance: 5 values
    buckets: 12 (including +Inf)

  Total: 1 × 5 × 20 × 10 × 5 × 12 = 60,000 time series

  Add user_id with 1,000,000 values:
  Total: 1 × 5 × 20 × 10 × 5 × 12 × 1,000,000 = 60,000,000,000 time series
  PROMETHEUS WILL CRASH.
```

### Cardinality Danger Zones

**NEVER use these as label values:**

| Label | Why It Is Dangerous |
|---|---|
| `user_id` | Millions of unique values |
| `email` | Millions of unique values |
| `request_id` / `trace_id` | Every request creates a new series |
| `ip_address` | Potentially millions of unique values |
| `full_url` with query params | Infinite cardinality |
| `error_message` (free text) | Thousands of unique values |
| `timestamp` | Infinite cardinality |
| `session_id` | Millions of unique values |

**Safe label values (bounded cardinality):**

| Label | Typical Cardinality |
|---|---|
| `method` (HTTP) | 5-7 |
| `status_code` | 5-20 |
| `route` (normalized) | 10-100 |
| `environment` | 2-5 |
| `region` | 3-10 |
| `instance` / `pod` | 5-50 |
| `job_type` | 5-20 |
| `payment_method` | 5-10 |
| `result` (success/failure) | 2-5 |

### Detecting Cardinality Problems

```promql
# Top 10 metrics by number of time series
topk(10, count by (__name__)({__name__=~".+"}))

# Total active time series
count({__name__=~".+"})

# Time series count per job
count by (job) ({__name__=~".+"})

# Specifically check a suspect metric
count(http_requests_total) by (route)
```

### Route Normalization to Control Cardinality

The most common cardinality problem is un-normalized routes. `/users/123` and `/users/456` become separate time series.

```typescript
// src/middleware/route-normalizer.ts
export function normalizeRoute(path: string): string {
  let normalized = path;

  // Replace UUIDs: /users/550e8400-e29b-41d4-a716-446655440000 → /users/:id
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );

  // Replace numeric IDs: /users/12345 → /users/:id
  normalized = normalized.replace(/\/\d+/g, '/:id');

  // Replace MongoDB ObjectIds: /users/507f1f77bcf86cd799439011 → /users/:id
  normalized = normalized.replace(/[0-9a-f]{24}/gi, ':id');

  // Replace slugs after known collection paths
  // /articles/my-great-article → /articles/:slug
  const collectionPaths = ['articles', 'posts', 'products', 'categories'];
  for (const collection of collectionPaths) {
    const regex = new RegExp(`(/${collection}/)[^/]+`, 'g');
    normalized = normalized.replace(regex, `$1:slug`);
  }

  // Collapse repeated path segments
  normalized = normalized.replace(/\/:id\/:id/g, '/:id/:id');

  return normalized || '/';
}

// In Express middleware:
app.use((req, res, next) => {
  // Use Express route pattern if available (best option)
  const route = req.route?.path ?? normalizeRoute(req.path);
  // Store for metrics middleware to use
  res.locals.metricsRoute = route;
  next();
});
```

### Error Message Bucketing

Instead of using raw error messages as labels, categorize them:

```typescript
function categorizeError(error: Error): string {
  if (error.message.includes('ECONNREFUSED')) return 'connection_refused';
  if (error.message.includes('ETIMEDOUT')) return 'timeout';
  if (error.message.includes('ENOTFOUND')) return 'dns_resolution';
  if (error.message.includes('CERT_')) return 'tls_error';
  if (error instanceof SyntaxError) return 'parse_error';
  if (error instanceof TypeError) return 'type_error';
  if (error instanceof RangeError) return 'range_error';
  return 'unknown';
}

// Use the category as a label, not the message
errorCounter.inc({ error_type: categorizeError(error) });
```

## Exemplars: Connecting Metrics to Traces

Exemplars are a Prometheus feature (added in Prometheus 2.26 / OpenMetrics format) that attach trace context to individual metric observations. They bridge the gap between aggregate metrics and individual request traces.

### How Exemplars Work

When you observe a value for a histogram or counter, you can attach a set of key-value pairs (typically a trace ID) to that specific observation. When viewing a histogram in Grafana, you can see individual exemplar points and click through to the corresponding trace.

```
Without exemplars:
  Dashboard shows p99 latency spike → ??? → You manually search for traces

With exemplars:
  Dashboard shows p99 latency spike → Click exemplar dot → View the exact trace
```

### TypeScript Implementation

```typescript
// src/metrics/exemplar-metrics.ts
import { Histogram, Counter } from 'prom-client';
import { context, trace } from '@opentelemetry/api';

// Enable OpenMetrics format for exemplar support
import { Registry } from 'prom-client';
const registry = new Registry();
registry.setContentType(
  // Use OpenMetrics format which supports exemplars
  'application/openmetrics-text; version=1.0.0; charset=utf-8'
);

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  enableExemplars: true,
  registers: [registry],
});

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  enableExemplars: true,
  registers: [registry],
});

// Middleware that records metrics with exemplars
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    const route = res.locals.metricsRoute ?? req.route?.path ?? 'unknown';
    const method = req.method;
    const statusCode = String(res.statusCode);

    // Extract trace ID from OpenTelemetry context
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext().traceId;

    const labels = { method, route, status_code: statusCode };

    if (traceId) {
      // Record with exemplar — the trace ID is attached to this specific observation
      httpRequestDuration.observe(
        { ...labels },
        durationSeconds,
        { traceID: traceId }  // Exemplar labels
      );
      httpRequestsTotal.inc(
        { ...labels },
        1,
        { traceID: traceId }
      );
    } else {
      httpRequestDuration.observe(labels, durationSeconds);
      httpRequestsTotal.inc(labels);
    }
  });

  next();
}
```

### Prometheus Configuration for Exemplars

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  # Enable exemplar storage
  # (requires Prometheus 2.26+ with --enable-feature=exemplar-storage)

scrape_configs:
  - job_name: 'node-app'
    scrape_interval: 15s
    # Scrape in OpenMetrics format to receive exemplars
    scrape_protocols:
      - OpenMetricsText1.0.0
      - PrometheusProto
      - PrometheusText0.0.4
    static_configs:
      - targets: ['app:3000']
```

Start Prometheus with exemplar storage enabled:

```bash
prometheus --enable-feature=exemplar-storage --storage.tsdb.retention.exemplars=5m
```

### Grafana Configuration for Exemplars

In the Prometheus datasource configuration, add exemplar trace ID destination:

```yaml
# Grafana datasource provisioning
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    jsonData:
      exemplarTraceIdDestinations:
        - name: traceID
          datasourceUid: tempo  # or jaeger
          urlDisplayLabel: 'View Trace'
```

In dashboard panels, enable "Exemplars" toggle to show exemplar dots on time series graphs.

### What Exemplars Look Like in OpenMetrics Format

```
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/api/users",status_code="200",le="0.1"} 245 # {traceID="abc123def456"} 0.087 1625000000.000
http_request_duration_seconds_bucket{method="GET",route="/api/users",status_code="200",le="0.25"} 312 # {traceID="xyz789ghi012"} 0.234 1625000001.000
```

The `# {traceID="abc123def456"} 0.087 1625000000.000` part is the exemplar: it says "one of the observations counted in this bucket had traceID=abc123def456, value=0.087, at timestamp 1625000000."

## Application-Level Metrics Beyond Business

### Cache Metrics

```typescript
export function createCacheMetrics(registry: Registry) {
  return {
    cacheHits: new Counter({
      name: 'app_cache_hits_total',
      help: 'Cache hits',
      labelNames: ['cache_name', 'operation'] as const,
      registers: [registry],
    }),
    cacheMisses: new Counter({
      name: 'app_cache_misses_total',
      help: 'Cache misses',
      labelNames: ['cache_name', 'operation'] as const,
      registers: [registry],
    }),
    cacheEvictions: new Counter({
      name: 'app_cache_evictions_total',
      help: 'Cache evictions',
      labelNames: ['cache_name', 'reason'] as const,
      registers: [registry],
    }),
    cacheSize: new Gauge({
      name: 'app_cache_size_items',
      help: 'Number of items in cache',
      labelNames: ['cache_name'] as const,
      registers: [registry],
    }),
    cacheLookupDuration: new Histogram({
      name: 'app_cache_lookup_duration_seconds',
      help: 'Cache lookup duration',
      labelNames: ['cache_name', 'result'] as const,
      buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05],
      registers: [registry],
    }),
  };
}
```

### Circuit Breaker Metrics

```typescript
export function createCircuitBreakerMetrics(registry: Registry) {
  return {
    circuitBreakerState: new Gauge({
      name: 'app_circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
      labelNames: ['service', 'endpoint'] as const,
      registers: [registry],
    }),
    circuitBreakerTrips: new Counter({
      name: 'app_circuit_breaker_trips_total',
      help: 'Number of times the circuit breaker tripped to open',
      labelNames: ['service', 'endpoint'] as const,
      registers: [registry],
    }),
    circuitBreakerSuccesses: new Counter({
      name: 'app_circuit_breaker_successes_total',
      help: 'Successful calls through the circuit breaker',
      labelNames: ['service', 'endpoint'] as const,
      registers: [registry],
    }),
    circuitBreakerFailures: new Counter({
      name: 'app_circuit_breaker_failures_total',
      help: 'Failed calls through the circuit breaker',
      labelNames: ['service', 'endpoint'] as const,
      registers: [registry],
    }),
    circuitBreakerRejections: new Counter({
      name: 'app_circuit_breaker_rejections_total',
      help: 'Calls rejected because the circuit breaker is open',
      labelNames: ['service', 'endpoint'] as const,
      registers: [registry],
    }),
  };
}
```

### Rate Limiter Metrics

```typescript
export function createRateLimiterMetrics(registry: Registry) {
  return {
    rateLimitAllowed: new Counter({
      name: 'app_rate_limit_allowed_total',
      help: 'Requests allowed by the rate limiter',
      labelNames: ['limiter', 'tier'] as const,
      registers: [registry],
    }),
    rateLimitRejected: new Counter({
      name: 'app_rate_limit_rejected_total',
      help: 'Requests rejected by the rate limiter',
      labelNames: ['limiter', 'tier'] as const,
      registers: [registry],
    }),
    rateLimitCurrentUsage: new Gauge({
      name: 'app_rate_limit_current_usage',
      help: 'Current rate limit usage (percentage of limit consumed)',
      labelNames: ['limiter', 'tier'] as const,
      registers: [registry],
    }),
  };
}
```

### Feature Flag Metrics

```typescript
export function createFeatureFlagMetrics(registry: Registry) {
  return {
    featureFlagEvaluations: new Counter({
      name: 'app_feature_flag_evaluations_total',
      help: 'Feature flag evaluations',
      labelNames: ['flag_name', 'variation', 'default_used'] as const,
      registers: [registry],
    }),
    featureFlagErrors: new Counter({
      name: 'app_feature_flag_errors_total',
      help: 'Feature flag evaluation errors',
      labelNames: ['flag_name', 'error_type'] as const,
      registers: [registry],
    }),
  };
}
```

## Metrics Testing

Validate that your metrics are correctly instrumented:

```typescript
// src/__tests__/metrics.test.ts
import { Registry } from 'prom-client';
import { createBusinessMetrics } from '../metrics/business-metrics';

describe('Business Metrics', () => {
  let registry: Registry;
  let metrics: ReturnType<typeof createBusinessMetrics>;

  beforeEach(() => {
    registry = new Registry();
    metrics = createBusinessMetrics(registry);
  });

  it('should increment order counter with correct labels', async () => {
    metrics.ordersTotal.inc({
      payment_method: 'credit_card',
      status: 'completed',
      currency: 'USD',
    });

    const metricOutput = await registry.getSingleMetricAsString('business_orders_total');
    expect(metricOutput).toContain('payment_method="credit_card"');
    expect(metricOutput).toContain('status="completed"');
    expect(metricOutput).toContain('currency="USD"');
    expect(metricOutput).toContain('} 1');
  });

  it('should observe order values in correct buckets', async () => {
    metrics.orderValueDollars.observe({ payment_method: 'credit_card' }, 49.99);
    metrics.orderValueDollars.observe({ payment_method: 'credit_card' }, 149.99);

    const metricOutput = await registry.getSingleMetricAsString('business_order_value_dollars');
    // 49.99 should be counted in bucket le="50" and above
    expect(metricOutput).toContain('le="50"} 1');
    // 149.99 should be counted in bucket le="250" and above
    expect(metricOutput).toContain('le="250"} 2');
  });

  it('should not allow labels with unbounded cardinality', () => {
    // This test ensures we don't accidentally add high-cardinality labels
    const metricNames = [
      'business_orders_total',
      'business_order_value_dollars',
      'business_login_attempts_total',
    ];

    for (const name of metricNames) {
      const metric = registry.getSingleMetric(name);
      if (!metric) continue;
      const labelNames = (metric as any).labelNames as string[];
      const dangerousLabels = ['user_id', 'email', 'ip', 'session_id', 'request_id'];
      for (const dangerous of dangerousLabels) {
        expect(labelNames).not.toContain(dangerous);
      }
    }
  });
});
```

## Key Takeaways

- Business metrics are the most valuable metrics you can instrument — they tell you whether the business is working, not just whether the servers are running.
- Follow Prometheus naming conventions religiously: snake_case, base units as suffix, `_total` for counters.
- Label cardinality is the #1 cause of Prometheus performance problems. Never use user IDs, request IDs, email addresses, or free-text error messages as label values.
- Normalize routes before using them as labels to prevent cardinality explosion.
- Use exemplars to connect aggregate metrics to individual traces — this eliminates the manual search for relevant traces during incidents.
- Test your metrics just like you test your application code: verify labels, bucket boundaries, and cardinality constraints.
