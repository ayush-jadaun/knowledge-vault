---
title: Prometheus Deep Dive
description: Complete guide to Prometheus architecture, PromQL query language, metric types, instrumentation with Node.js prom-client, recording rules, alerting rules, federation, remote write, and long-term storage with Thanos and Cortex.
tags:
  - prometheus
  - promql
  - monitoring
  - metrics
  - tsdb
  - thanos
  - cortex
  - prom-client
  - node.js
difficulty: advanced
prerequisites:
  - monitoring/index
  - Basic understanding of time-series data
  - Node.js and TypeScript fundamentals
lastReviewed: "2026-03-17"
---

# Prometheus Deep Dive

Prometheus is the de facto standard for open-source metrics collection and alerting. Originally built at SoundCloud in 2012 and donated to the Cloud Native Computing Foundation (CNCF) in 2016, it has become the backbone of observability for Kubernetes-native and cloud-native systems. Understanding Prometheus deeply — not just "install it and point Grafana at it" — is what separates teams that detect incidents in seconds from teams that learn about incidents from their users.

## Architecture

Prometheus uses a **pull model**: instead of applications pushing metrics to a central server, the Prometheus server periodically scrapes HTTP endpoints exposed by your applications. This is a deliberate architectural choice with significant implications.

### The Pull Model

```
┌─────────────────┐     scrape every 15s     ┌─────────────────┐
│   Prometheus     │ ──────────────────────►  │  App /metrics   │
│   Server         │                          │  (target)       │
│                  │ ◄──────────────────────  │                 │
│  ┌────────────┐  │     metric exposition    └─────────────────┘
│  │   TSDB     │  │
│  │ (local     │  │     scrape every 15s     ┌─────────────────┐
│  │  storage)  │  │ ──────────────────────►  │  App /metrics   │
│  └────────────┘  │                          │  (target)       │
│                  │ ◄──────────────────────  │                 │
│  ┌────────────┐  │     metric exposition    └─────────────────┘
│  │ Rule       │  │
│  │ Evaluation │  │     scrape every 15s     ┌─────────────────┐
│  └────────────┘  │ ──────────────────────►  │  Node Exporter  │
│                  │                          │  (target)       │
│  ┌────────────┐  │ ◄──────────────────────  │                 │
│  │ Alert      │  │     metric exposition    └─────────────────┘
│  │ Manager    │  │
│  └────────────┘  │
└─────────────────┘
```

**Why pull, not push?**

| Aspect | Pull Model (Prometheus) | Push Model (StatsD, Graphite) |
|---|---|---|
| **Target health** | Prometheus knows immediately if a target is down (scrape fails) | No way to distinguish "target is down" from "target has nothing to report" |
| **Control** | Central configuration of what to scrape and how often | Each application must know where to push |
| **Firewall friendly** | Prometheus reaches out; targets don't need to know about Prometheus | Targets must have network access to the metrics server |
| **Development** | You can scrape your laptop against a running app for local debugging | You need a running metrics server to develop |
| **Scaling** | Can be harder to scale (single Prometheus scraping everything) | Natural horizontal scaling |

### Service Discovery

Prometheus needs to know which targets to scrape. Static configuration works for small deployments, but dynamic environments need service discovery.

```yaml
# prometheus.yml — static targets
scrape_configs:
  - job_name: 'node-app'
    scrape_interval: 15s
    static_configs:
      - targets: ['app1:3000', 'app2:3000', 'app3:3000']
        labels:
          environment: 'production'
          team: 'platform'

  - job_name: 'node-exporter'
    scrape_interval: 30s
    static_configs:
      - targets: ['node1:9100', 'node2:9100']
```

```yaml
# prometheus.yml — Kubernetes service discovery
scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      # Only scrape pods with the annotation prometheus.io/scrape: "true"
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      # Use the annotation prometheus.io/path for the metrics path
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      # Use the annotation prometheus.io/port for the port
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      # Preserve pod name and namespace as labels
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        action: replace
        target_label: pod
```

### The TSDB (Time Series Database)

Prometheus stores data in a custom time-series database optimized for the append-heavy, query-heavy workload of metrics. Understanding its internals helps you tune performance and plan capacity.

**Storage Layout:**

```
data/
├── 01BKGV7JBM69T2G1BGBGM6KB12/   # Block (2-hour chunk)
│   ├── chunks/
│   │   └── 000001                   # Raw chunk data
│   ├── tombstones                   # Deleted series
│   ├── index                        # Inverted index for label lookups
│   └── meta.json                    # Block metadata
├── 01BKGTZQ1SYQJTR4PB43C8PD98/   # Another block
│   ├── ...
├── chunks_head/                     # In-memory head block (current)
│   └── 000001
└── wal/                             # Write-ahead log
    ├── 00000001
    ├── 00000002
    └── checkpoint.00000000/
```

**Key concepts:**

- **Head block**: The most recent 2 hours of data, kept in memory for fast writes. Backed by a write-ahead log (WAL) on disk for crash recovery.
- **Persistent blocks**: Every 2 hours, the head block is compacted into an immutable block on disk. Blocks are further compacted over time (2h → 6h → 18h → ...).
- **Retention**: Configured by time (`--storage.tsdb.retention.time=15d`) or size (`--storage.tsdb.retention.size=50GB`).
- **Compression**: Prometheus uses Gorilla-style double-delta encoding for timestamps and XOR encoding for values, achieving roughly 1.3 bytes per sample.

**Capacity planning formula:**

```
disk_space = ingestion_rate × retention_time × bytes_per_sample

Example:
  100,000 samples/second × 15 days × 86400 seconds/day × 1.3 bytes/sample
  = 100,000 × 1,296,000 × 1.3
  ≈ 168 GB
```

**Memory requirements:**

```
memory ≈ number_of_active_series × 4 KB

Example:
  1,000,000 active series × 4 KB ≈ 4 GB (just for series data)
  Add 2-3 GB for query processing, WAL, etc.
  Total: ~6-7 GB for 1M series
```

## Metric Types

Prometheus has four core metric types. Using the wrong type is one of the most common instrumentation mistakes.

### Counter

A counter is a cumulative value that only goes up (or resets to zero on process restart). Use counters for things you count: requests served, errors encountered, bytes transmitted.

```typescript
// Node.js with prom-client
import { Counter, register } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// In your request handler
app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestsTotal.inc({
      method: req.method,
      route: req.route?.path ?? 'unknown',
      status_code: String(res.statusCode),
    });
  });
  next();
});
```

**Never do this with a counter:**
- Don't use a counter for values that can decrease (use a gauge)
- Don't use `counter.set()` — counters only have `inc()`
- Don't try to compute a rate in your application and expose it as a gauge — let Prometheus compute the rate from the raw counter

**PromQL for counters:**

```promql
# WRONG: raw counter value is meaningless (it just goes up forever)
http_requests_total

# RIGHT: rate of requests per second over the last 5 minutes
rate(http_requests_total[5m])

# RIGHT: total requests in the last hour
increase(http_requests_total[1h])
```

### Gauge

A gauge is a value that can go up or down. Use gauges for things you measure at a point in time: temperature, memory usage, queue depth, active connections.

```typescript
import { Gauge } from 'prom-client';

const activeConnections = new Gauge({
  name: 'db_active_connections',
  help: 'Number of active database connections',
  labelNames: ['pool'] as const,
});

// Set to current value
activeConnections.set({ pool: 'primary' }, connectionPool.activeCount());

// Or use inc/dec for counting-style gauges
const inProgressRequests = new Gauge({
  name: 'http_in_progress_requests',
  help: 'Number of HTTP requests currently being processed',
});

app.use((req, res, next) => {
  inProgressRequests.inc();
  res.on('finish', () => {
    inProgressRequests.dec();
  });
  next();
});
```

**PromQL for gauges:**

```promql
# Current value (gauges are meaningful as-is)
db_active_connections

# Average over time
avg_over_time(db_active_connections[5m])

# Max value in the last hour
max_over_time(db_active_connections[1h])

# Rate of change (useful for resource consumption)
deriv(node_memory_MemFree_bytes[1h])
```

### Histogram

A histogram samples observations (usually request durations or response sizes) and counts them in configurable buckets. It also provides a sum of all observed values and a count of observations.

```typescript
import { Histogram } from 'prom-client';

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  // Default buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
  // Custom buckets for an API:
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer({
    method: req.method,
    route: req.route?.path ?? 'unknown',
  });
  res.on('finish', () => {
    end({ status_code: String(res.statusCode) });
  });
  next();
});
```

**What a histogram exposes:**

For a histogram named `http_request_duration_seconds` with buckets `[0.1, 0.5, 1, 5]`:

```
# Cumulative bucket counts (how many observations fell into each bucket or below)
http_request_duration_seconds_bucket{le="0.1"} 24054
http_request_duration_seconds_bucket{le="0.5"} 33444
http_request_duration_seconds_bucket{le="1"} 100392
http_request_duration_seconds_bucket{le="5"} 129389
http_request_duration_seconds_bucket{le="+Inf"} 133988

# Total sum of all observed values
http_request_duration_seconds_sum 53423.942

# Total count of observations
http_request_duration_seconds_count 133988
```

**PromQL for histograms:**

```promql
# 95th percentile latency over the last 5 minutes
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# 99th percentile latency, grouped by route
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
)

# Average request duration
rate(http_request_duration_seconds_sum[5m])
  / rate(http_request_duration_seconds_count[5m])

# Apdex score (fraction of requests under threshold)
(
  sum(rate(http_request_duration_seconds_bucket{le="0.25"}[5m]))
  +
  sum(rate(http_request_duration_seconds_bucket{le="1"}[5m]))
) / 2
/ sum(rate(http_request_duration_seconds_count[5m]))
```

**Choosing bucket boundaries:**

- Buckets should cover the range of values you care about. If your SLO is "99% of requests complete in under 500ms", you need buckets around 500ms (e.g., 0.1, 0.25, 0.5, 0.75, 1.0).
- Too few buckets = poor quantile accuracy. Too many buckets = more time series (each bucket is a separate series).
- Linear buckets for uniform distributions: `linearBuckets(0.1, 0.1, 10)` = [0.1, 0.2, ..., 1.0]
- Exponential buckets for skewed distributions: `exponentialBuckets(0.01, 2, 10)` = [0.01, 0.02, 0.04, ..., 5.12]

### Summary

A summary is similar to a histogram but calculates quantiles on the client side. Summaries are generally discouraged in favor of histograms because:

- Summaries cannot be aggregated across instances (you cannot average percentiles)
- Summaries have a higher CPU cost on the client
- Histograms can be aggregated server-side with `histogram_quantile`

```typescript
import { Summary } from 'prom-client';

// Use only when you need exact quantiles on a single instance
// and cannot afford the bucket cardinality of a histogram
const requestDurationSummary = new Summary({
  name: 'http_request_duration_summary_seconds',
  help: 'Duration of HTTP requests in seconds (summary)',
  labelNames: ['method'] as const,
  percentiles: [0.5, 0.9, 0.95, 0.99],
  maxAgeSeconds: 600,
  ageBuckets: 5,
});
```

**When to use summary over histogram:**

| Use Case | Histogram | Summary |
|---|---|---|
| Aggregation across instances | Yes | No |
| Exact quantiles | No (approximated by bucket boundaries) | Yes |
| Pre-defined quantiles needed | No (can compute any quantile at query time) | Yes (must be defined at instrumentation time) |
| Computation cost | Low on client, higher on server | Higher on client, lower on server |

**Recommendation: Use histograms unless you have a specific reason to use summaries.**

## PromQL Deep Dive

PromQL is Prometheus's query language. Mastering it is essential for writing effective dashboards and alerts.

### Selectors

```promql
# Exact match
http_requests_total{method="GET"}

# Regex match
http_requests_total{method=~"GET|POST"}

# Negative match
http_requests_total{method!="OPTIONS"}

# Negative regex match
http_requests_total{status_code!~"2.."}

# Multiple selectors (AND logic)
http_requests_total{method="GET", status_code="200", environment="production"}
```

### Range Vectors

```promql
# Last 5 minutes of data points
http_requests_total[5m]

# Last 1 hour
http_requests_total[1h]

# With offset (1 hour ago)
http_requests_total[5m] offset 1h

# At a specific time
http_requests_total @ 1609459200
```

### rate() vs irate()

This is one of the most common sources of confusion. Both compute the per-second rate of a counter, but they work differently.

**`rate()`** — average rate over the entire range:

```promql
# Average requests per second over the last 5 minutes
rate(http_requests_total[5m])
```

- Smooths out spikes
- Good for alerting (fewer false positives)
- Good for dashboards showing trends
- The range should be at least 4x the scrape interval (e.g., `[1m]` for 15s scrape interval)

**`irate()`** — instantaneous rate between the last two data points:

```promql
# Instantaneous requests per second
irate(http_requests_total[5m])
```

- Shows spikes and dips
- Good for dashboards where you want to see actual behavior
- Not good for alerting (too volatile)
- The range is only used to find the last two data points — a wider range is just a safety margin

**Practical guidance:**

| Use Case | Function |
|---|---|
| Alerting rules | `rate()` with at least 5m range |
| Recording rules | `rate()` |
| Dashboards showing trends | `rate()` |
| Dashboards showing real-time behavior | `irate()` |
| Capacity planning | `rate()` with 1h+ range |

### Aggregation Operators

```promql
# Sum across all instances
sum(rate(http_requests_total[5m]))

# Sum grouped by status code
sum(rate(http_requests_total[5m])) by (status_code)

# Sum ignoring instance and pod labels
sum(rate(http_requests_total[5m])) without (instance, pod)

# Average, min, max, stddev
avg(node_cpu_seconds_total) by (mode)
min(node_filesystem_avail_bytes) by (mountpoint)
max(container_memory_usage_bytes) by (pod)
stddev(rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])) by (route)

# Count of time series
count(up == 1)

# Top 5 routes by request rate
topk(5, sum(rate(http_requests_total[5m])) by (route))

# Bottom 3 nodes by available disk
bottomk(3, node_filesystem_avail_bytes)

# Quantile across instances (not histogram quantile)
quantile(0.95, rate(http_requests_total[5m]))
```

### Binary Operators

```promql
# Error rate as a percentage
sum(rate(http_requests_total{status_code=~"5.."}[5m]))
/ sum(rate(http_requests_total[5m]))
* 100

# Available memory as percentage
(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

# Disk will be full in X hours (linear extrapolation)
node_filesystem_avail_bytes
/ (rate(node_filesystem_avail_bytes[6h]) * -1)
/ 3600

# Comparing with a threshold using bool modifier
rate(http_requests_total{status_code="500"}[5m]) > bool 10
```

### Vector Matching

```promql
# One-to-one matching (default)
# Both sides must have the same labels
rate(http_request_duration_seconds_sum[5m])
/ rate(http_request_duration_seconds_count[5m])

# Ignoring specific labels for matching
method_specific_metric / ignoring(method) general_metric

# Many-to-one matching with group_left
# Error rate per route, enriched with team ownership
sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (route)
/ on(route) group_left(team)
sum(rate(http_requests_total[5m])) by (route, team)
```

### Useful Functions

```promql
# Absolute value
abs(deriv(temperature_celsius[1h]))

# Ceiling and floor
ceil(rate(http_requests_total[5m]))
floor(rate(http_requests_total[5m]))

# Clamping values
clamp(cpu_usage_percent, 0, 100)
clamp_min(queue_depth, 0)
clamp_max(response_time_seconds, 30)

# Time functions
time()                           # Current Unix timestamp
day_of_week()                    # 0=Sunday, 6=Saturday
hour()                           # 0-23

# Label manipulation
label_replace(up, "host", "$1", "instance", "(.*):.*")
label_join(up, "full_address", ":", "instance", "port")

# Predict linear value (will disk be full in 4 hours?)
predict_linear(node_filesystem_avail_bytes[6h], 4 * 3600) < 0

# Changes in gauge value
changes(process_start_time_seconds[1h])  # How many times did the process restart?

# Reset detection for counters
resets(http_requests_total[1h])  # How many counter resets (restarts)?

# Absent (for alerting on missing metrics)
absent(up{job="critical-service"})  # Returns 1 if the metric doesn't exist

# Absent over time
absent_over_time(up{job="critical-service"}[5m])
```

### histogram_quantile() Deep Dive

```promql
# Basic 95th percentile
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# CRITICAL: You must aggregate by 'le' label
# WRONG — this doesn't work:
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])))

# RIGHT — preserve 'le' in the grouping:
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# Per-route 95th percentile:
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
)

# Multiple quantiles in one dashboard panel — use recording rules:
# In rules file:
# - record: http:request_duration:p50
#   expr: histogram_quantile(0.5, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
# - record: http:request_duration:p95
#   expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
# - record: http:request_duration:p99
#   expr: histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

**Accuracy pitfall**: `histogram_quantile` interpolates within buckets. If your buckets are `[0.1, 0.5, 1, 5, 10]` and the actual 95th percentile is 2.3 seconds, Prometheus will interpolate linearly between the `1` and `5` boundaries. The result will be close to 2.3 but not exact. Finer-grained buckets around your SLO thresholds improve accuracy.

## Instrumentation Best Practices

### Full Node.js Application Setup

```typescript
// src/metrics.ts
import client, {
  Counter,
  Histogram,
  Gauge,
  Summary,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

// Create a custom registry (recommended over default registry in libraries)
export const metricsRegistry = new Registry();

// Collect default Node.js metrics (GC, event loop, memory, etc.)
collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'nodejs_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// HTTP metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests received',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpRequestSizeBytes = new Histogram({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP request bodies in bytes',
  labelNames: ['method', 'route'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [metricsRegistry],
});

export const httpResponseSizeBytes = new Histogram({
  name: 'http_response_size_bytes',
  help: 'Size of HTTP response bodies in bytes',
  labelNames: ['method', 'route'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [metricsRegistry],
});

// Database metrics
export const dbQueryDurationSeconds = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table', 'success'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

export const dbConnectionPoolSize = new Gauge({
  name: 'db_connection_pool_size',
  help: 'Current size of the database connection pool',
  labelNames: ['pool', 'state'] as const,
  registers: [metricsRegistry],
});

// External API call metrics
export const externalApiCallDurationSeconds = new Histogram({
  name: 'external_api_call_duration_seconds',
  help: 'Duration of external API calls in seconds',
  labelNames: ['service', 'endpoint', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

// Business metrics
export const ordersProcessedTotal = new Counter({
  name: 'orders_processed_total',
  help: 'Total number of orders processed',
  labelNames: ['payment_method', 'status'] as const,
  registers: [metricsRegistry],
});

export const orderValueDollars = new Histogram({
  name: 'order_value_dollars',
  help: 'Value of processed orders in dollars',
  labelNames: ['payment_method'] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 5000],
  registers: [metricsRegistry],
});
```

```typescript
// src/middleware/metrics.ts
import { Request, Response, NextFunction } from 'express';
import {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestSizeBytes,
  httpResponseSizeBytes,
} from '../metrics';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime.bigint();

  // Track request size
  const requestSize = parseInt(req.headers['content-length'] ?? '0', 10);

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - startTime);
    const durationSeconds = durationNs / 1e9;

    // Normalize route to avoid high cardinality
    // /users/123 becomes /users/:id
    const route = req.route?.path ?? normalizeRoute(req.path);
    const method = req.method;
    const statusCode = String(res.statusCode);

    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestDurationSeconds.observe({ method, route, status_code: statusCode }, durationSeconds);
    httpRequestSizeBytes.observe({ method, route }, requestSize);

    const responseSize = parseInt(res.getHeader('content-length') as string ?? '0', 10);
    httpResponseSizeBytes.observe({ method, route }, responseSize);
  });

  next();
}

function normalizeRoute(path: string): string {
  // Replace UUIDs
  let normalized = path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );
  // Replace numeric IDs
  normalized = normalized.replace(/\/\d+/g, '/:id');
  // Replace MongoDB ObjectIds
  normalized = normalized.replace(/[0-9a-f]{24}/gi, ':id');

  return normalized || '/';
}
```

```typescript
// src/routes/metrics.ts
import { Router, Request, Response } from 'express';
import { metricsRegistry } from '../metrics';

const router = Router();

router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  } catch (err) {
    res.status(500).end(String(err));
  }
});

export default router;
```

### Database Query Instrumentation

```typescript
// src/db/instrumented-pool.ts
import { Pool, QueryResult, QueryConfig } from 'pg';
import { dbQueryDurationSeconds, dbConnectionPoolSize } from '../metrics';

export class InstrumentedPool {
  private pool: Pool;
  private poolName: string;

  constructor(pool: Pool, poolName: string = 'primary') {
    this.pool = pool;
    this.poolName = poolName;

    // Update connection pool gauge every 5 seconds
    setInterval(() => {
      dbConnectionPoolSize.set(
        { pool: this.poolName, state: 'total' },
        this.pool.totalCount
      );
      dbConnectionPoolSize.set(
        { pool: this.poolName, state: 'idle' },
        this.pool.idleCount
      );
      dbConnectionPoolSize.set(
        { pool: this.poolName, state: 'waiting' },
        this.pool.waitingCount
      );
    }, 5000);
  }

  async query(text: string | QueryConfig, values?: unknown[]): Promise<QueryResult> {
    const operation = this.extractOperation(typeof text === 'string' ? text : text.text);
    const table = this.extractTable(typeof text === 'string' ? text : text.text);
    const end = dbQueryDurationSeconds.startTimer({ operation, table });

    try {
      const result = await this.pool.query(text, values);
      end({ success: 'true' });
      return result;
    } catch (error) {
      end({ success: 'false' });
      throw error;
    }
  }

  private extractOperation(sql: string): string {
    const match = sql.trim().match(/^(\w+)/);
    return match ? match[1].toUpperCase() : 'UNKNOWN';
  }

  private extractTable(sql: string): string {
    const match = sql.match(/(?:FROM|INTO|UPDATE|TABLE)\s+["']?(\w+)["']?/i);
    return match ? match[1].toLowerCase() : 'unknown';
  }
}
```

## Recording Rules

Recording rules pre-compute frequently used or computationally expensive PromQL expressions and save the result as a new time series. This reduces query latency for dashboards and allows more complex alerting expressions.

```yaml
# rules/recording_rules.yml
groups:
  - name: http_request_recording_rules
    interval: 30s  # Evaluate every 30 seconds
    rules:
      # Request rate by route
      - record: http:requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (route, method)

      # Error rate by route (as a ratio, 0 to 1)
      - record: http:errors:rate5m
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (route)
          / sum(rate(http_requests_total[5m])) by (route)

      # Latency percentiles
      - record: http:request_duration:p50
        expr: |
          histogram_quantile(0.50,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
          )

      - record: http:request_duration:p95
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
          )

      - record: http:request_duration:p99
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
          )

      # Average request duration
      - record: http:request_duration:avg
        expr: |
          sum(rate(http_request_duration_seconds_sum[5m])) by (route)
          / sum(rate(http_request_duration_seconds_count[5m])) by (route)

  - name: node_recording_rules
    interval: 60s
    rules:
      # CPU usage percentage
      - record: node:cpu:usage_percent
        expr: |
          100 - (avg by (instance) (
            irate(node_cpu_seconds_total{mode="idle"}[5m])
          ) * 100)

      # Memory usage percentage
      - record: node:memory:usage_percent
        expr: |
          (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

      # Disk usage percentage
      - record: node:disk:usage_percent
        expr: |
          (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}
          / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"}) * 100

  - name: slo_recording_rules
    interval: 30s
    rules:
      # SLI: availability (percentage of non-5xx responses)
      - record: slo:http:availability
        expr: |
          1 - (
            sum(rate(http_requests_total{status_code=~"5.."}[5m]))
            / sum(rate(http_requests_total[5m]))
          )

      # SLI: latency (percentage of requests under 500ms)
      - record: slo:http:latency_target
        expr: |
          sum(rate(http_request_duration_seconds_bucket{le="0.5"}[5m]))
          / sum(rate(http_request_duration_seconds_count[5m]))
```

**Recording rule naming convention:**

```
level:metric:operations

level   = aggregation level (e.g., job, instance, path, namespace)
metric  = metric name
operations = operations applied (rate5m, ratio, p99, etc.)
```

## Alerting Rules

```yaml
# rules/alerting_rules.yml
groups:
  - name: http_alerts
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: http:errors:rate5m > 0.05
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "High error rate on {​{ $labels.route }​}"
          description: |
            Error rate is {​{ $value | humanizePercentage }​} on route {​{ $labels.route }​}.
            This has been above 5% for 5 minutes.
          runbook_url: "https://wiki.internal/runbooks/high-error-rate"
          dashboard_url: "https://grafana.internal/d/http-overview?var-route={​{ $labels.route }​}"

      # High latency (p95)
      - alert: HighLatencyP95
        expr: http:request_duration:p95 > 1
        for: 10m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "High p95 latency on {​{ $labels.route }​}"
          description: |
            P95 latency is {​{ $value | humanizeDuration }​} on route {​{ $labels.route }​}.

      # High latency (p99) — more severe
      - alert: HighLatencyP99
        expr: http:request_duration:p99 > 5
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "Critical p99 latency on {​{ $labels.route }​}"
          description: |
            P99 latency is {​{ $value | humanizeDuration }​} on route {​{ $labels.route }​}.

      # No requests at all (service might be down)
      - alert: NoRequests
        expr: sum(rate(http_requests_total[5m])) == 0
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "No HTTP requests being received"

  - name: node_alerts
    rules:
      # High CPU
      - alert: HighCPUUsage
        expr: node:cpu:usage_percent > 85
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "High CPU on {​{ $labels.instance }​}"
          description: "CPU usage is {​{ $value | printf \"%.1f\" }​}% on {​{ $labels.instance }​}"

      # High memory
      - alert: HighMemoryUsage
        expr: node:memory:usage_percent > 90
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High memory on {​{ $labels.instance }​}"

      # Disk space running low
      - alert: DiskSpaceLow
        expr: node:disk:usage_percent > 85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Disk space low on {​{ $labels.instance }​}:{​{ $labels.mountpoint }​}"
          description: "Disk usage is {​{ $value | printf \"%.1f\" }​}%"

      # Disk will be full in 24 hours
      - alert: DiskWillFillIn24Hours
        expr: |
          predict_linear(node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}[6h], 24 * 3600) < 0
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: "Disk on {​{ $labels.instance }​}:{​{ $labels.mountpoint }​} will be full in 24 hours"

      # Instance down
      - alert: InstanceDown
        expr: up == 0
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "{​{ $labels.instance }​} is down"
          description: "{​{ $labels.instance }​} of job {​{ $labels.job }​} has been down for more than 3 minutes."

  - name: slo_alerts
    rules:
      # SLO burn rate alerting (multi-window)
      # 99.9% SLO = 0.1% error budget = 43.2 minutes/month

      # Fast burn: 14.4x error budget consumption over 1 hour
      # Will exhaust budget in ~2 days
      - alert: SLOHighBurnRate
        expr: |
          (
            slo:http:availability < (1 - 14.4 * 0.001)
          )
          and
          (
            1 - (
              sum(rate(http_requests_total{status_code=~"5.."}[1h]))
              / sum(rate(http_requests_total[1h]))
            ) < (1 - 14.4 * 0.001)
          )
        for: 2m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "SLO burn rate critical — error budget exhausting rapidly"

      # Slow burn: 1x error budget consumption over 3 days
      - alert: SLOSlowBurnRate
        expr: |
          (
            1 - (
              sum(rate(http_requests_total{status_code=~"5.."}[6h]))
              / sum(rate(http_requests_total[6h]))
            ) < (1 - 3 * 0.001)
          )
          and
          (
            1 - (
              sum(rate(http_requests_total{status_code=~"5.."}[3d]))
              / sum(rate(http_requests_total[3d]))
            ) < (1 - 1 * 0.001)
          )
        for: 1h
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "SLO slow burn rate — error budget consumption elevated"
```

## Alertmanager Configuration

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m
  smtp_from: 'alerts@company.com'
  smtp_smarthost: 'smtp.company.com:587'
  smtp_auth_username: 'alerts@company.com'
  smtp_auth_password: '{​{ .SMTP_PASSWORD }​}'
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'
  slack_api_url: '{​{ .SLACK_WEBHOOK_URL }​}'

templates:
  - '/etc/alertmanager/templates/*.tmpl'

route:
  receiver: 'default-slack'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s       # Wait before sending first notification for a group
  group_interval: 5m    # Wait before sending updated notification
  repeat_interval: 4h   # Wait before re-sending an existing notification

  routes:
    # Critical alerts → PagerDuty immediately
    - receiver: 'pagerduty-critical'
      match:
        severity: critical
      group_wait: 10s
      repeat_interval: 1h

    # Warning alerts → Slack
    - receiver: 'team-slack'
      match:
        severity: warning
      group_wait: 1m
      repeat_interval: 12h

    # Specific team routing
    - receiver: 'backend-team-slack'
      match:
        team: backend
      routes:
        - receiver: 'pagerduty-backend'
          match:
            severity: critical

inhibit_rules:
  # If InstanceDown is firing, suppress all other alerts for that instance
  - source_match:
      alertname: 'InstanceDown'
    target_match_re:
      alertname: '.+'
    equal: ['instance']

  # If a critical alert is firing, suppress warnings for the same alertname
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'instance']

receivers:
  - name: 'default-slack'
    slack_configs:
      - channel: '#alerts-default'
        send_resolved: true
        title: '{​{ .Status | toUpper }​}: {​{ .CommonLabels.alertname }​}'
        text: >-
          {​{ range .Alerts }​}
          *Alert:* {​{ .Labels.alertname }​}
          *Severity:* {​{ .Labels.severity }​}
          *Description:* {​{ .Annotations.description }​}
          *Details:*
          {​{ range .Labels.SortedPairs }​} • *{​{ .Name }​}:* `{​{ .Value }​}`
          {​{ end }​}
          {​{ end }​}

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - routing_key: '{​{ .PAGERDUTY_ROUTING_KEY }​}'
        severity: critical
        description: '{​{ .CommonAnnotations.summary }​}'
        details:
          firing: '{​{ .Alerts.Firing | len }​}'
          num_alerts: '{​{ .Alerts | len }​}'

  - name: 'team-slack'
    slack_configs:
      - channel: '#alerts-warnings'
        send_resolved: true

  - name: 'backend-team-slack'
    slack_configs:
      - channel: '#backend-alerts'
        send_resolved: true

  - name: 'pagerduty-backend'
    pagerduty_configs:
      - routing_key: '{​{ .PAGERDUTY_BACKEND_KEY }​}'
        severity: critical
```

## Federation

Federation allows one Prometheus server to scrape selected time series from another Prometheus server. This is used for:

- **Hierarchical federation**: A global Prometheus scrapes aggregated metrics from per-datacenter Prometheus servers
- **Cross-service federation**: A team's Prometheus pulls relevant metrics from another team's Prometheus

```yaml
# Global Prometheus scraping from datacenter Prometheus instances
scrape_configs:
  - job_name: 'federate-dc1'
    scrape_interval: 60s
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        # Only pull pre-aggregated recording rules
        - '{__name__=~"http:.*"}'
        - '{__name__=~"node:.*"}'
        - '{__name__=~"slo:.*"}'
    static_configs:
      - targets:
          - 'prometheus-dc1.internal:9090'
        labels:
          datacenter: 'dc1'

  - job_name: 'federate-dc2'
    scrape_interval: 60s
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{__name__=~"http:.*"}'
        - '{__name__=~"node:.*"}'
        - '{__name__=~"slo:.*"}'
    static_configs:
      - targets:
          - 'prometheus-dc2.internal:9090'
        labels:
          datacenter: 'dc2'
```

## Remote Write and Long-Term Storage

Prometheus's local TSDB is not designed for long-term storage. For data retention beyond 15-30 days, you need a remote storage solution.

### Remote Write Configuration

```yaml
# prometheus.yml
remote_write:
  - url: 'http://thanos-receive.internal:19291/api/v1/receive'
    queue_config:
      capacity: 10000
      max_shards: 30
      min_shards: 1
      max_samples_per_send: 5000
      batch_send_deadline: 5s
      min_backoff: 30ms
      max_backoff: 5s
    write_relabel_configs:
      # Only send specific metrics to remote storage to control costs
      - source_labels: [__name__]
        regex: 'http_.*|node_.*|slo_.*|container_.*'
        action: keep
```

### Thanos Architecture

Thanos extends Prometheus with long-term storage, global querying, and downsampling.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Prometheus   │     │ Prometheus   │     │ Prometheus   │
│ + Sidecar    │     │ + Sidecar    │     │ + Sidecar    │
│ (DC 1)       │     │ (DC 2)       │     │ (DC 3)       │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │  upload blocks     │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                    Object Storage (S3/GCS)                │
│              (long-term block storage)                    │
└──────────────────────────────────────────────────────────┘
       ▲                    ▲                    ▲
       │                    │                    │
┌──────┴───────┐     ┌──────┴───────┐     ┌──────┴───────┐
│ Thanos Store │     │ Thanos       │     │ Thanos       │
│ Gateway      │     │ Compactor    │     │ Ruler        │
└──────┬───────┘     └──────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐
│ Thanos Query │ ◄── Grafana connects here
│ (global view)│
└──────────────┘
```

**Thanos components:**

| Component | Role |
|---|---|
| **Sidecar** | Runs alongside each Prometheus instance, uploads TSDB blocks to object storage, serves real-time data to the Query component |
| **Store Gateway** | Serves historical block data from object storage |
| **Query** | Fan-out query engine that merges results from Sidecars and Store Gateways — Grafana points here |
| **Compactor** | Compacts and downsamples blocks in object storage (5m → 1h resolution for old data) |
| **Ruler** | Evaluates recording and alerting rules against the global view |

### Cortex Architecture

Cortex is an alternative to Thanos that uses the remote-write path instead of the sidecar approach. It provides multi-tenancy natively, making it popular for managed Prometheus services.

```
┌─────────────┐     ┌─────────────┐
│ Prometheus   │     │ Prometheus   │
│ (remote_write│     │ (remote_write│
│  to Cortex)  │     │  to Cortex)  │
└──────┬───────┘     └──────┬───────┘
       │                    │
       ▼                    ▼
┌──────────────────────────────────┐
│          Cortex Cluster          │
│  ┌────────────┐ ┌─────────────┐  │
│  │ Distributor│ │  Ingester   │  │
│  └────────────┘ └─────────────┘  │
│  ┌────────────┐ ┌─────────────┐  │
│  │ Querier    │ │ Store GW    │  │
│  └────────────┘ └─────────────┘  │
│  ┌────────────┐ ┌─────────────┐  │
│  │ Compactor  │ │ Ruler       │  │
│  └────────────┘ └─────────────┘  │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│        Object Storage (S3/GCS)   │
└──────────────────────────────────┘
```

**Thanos vs Cortex comparison:**

| Aspect | Thanos | Cortex |
|---|---|---|
| **Data path** | Sidecar uploads blocks from Prometheus | Prometheus remote-writes to Cortex |
| **Multi-tenancy** | Requires external solutions | Built-in (per-tenant limits, isolation) |
| **Operational complexity** | Simpler for single-tenant | More components but better for multi-tenant |
| **Data availability** | Recent data from Prometheus, historical from object store | All data flows through Cortex |
| **Prometheus dependency** | Tightly coupled (sidecar) | Loosely coupled (any remote-write source) |
| **Grafana Mimir** | — | Cortex was forked into Grafana Mimir (the successor) |

## Production Checklist

Before running Prometheus in production:

- [ ] **Retention configured**: Set `--storage.tsdb.retention.time` based on your query patterns (15d is a good default; use remote storage for longer)
- [ ] **Resource limits**: Memory limit should be at least `active_series × 4KB + 2GB` for headroom
- [ ] **Recording rules**: Pre-compute expensive queries used in dashboards
- [ ] **Alerting rules validated**: Use `promtool check rules rules.yml`
- [ ] **Config validated**: Use `promtool check config prometheus.yml`
- [ ] **Scrape interval appropriate**: 15s for most targets, 60s for slow-changing infrastructure metrics
- [ ] **Label cardinality audited**: No label with more than a few hundred unique values
- [ ] **Remote write configured**: For data retention beyond local TSDB retention
- [ ] **Alertmanager HA**: Run at least 2 Alertmanager instances in a cluster
- [ ] **Prometheus HA**: Run 2 identical Prometheus instances scraping the same targets (Thanos Query or Cortex deduplicates)
- [ ] **Backup strategy**: WAL and TSDB snapshots via `POST /api/v1/admin/tsdb/snapshot`
- [ ] **Monitoring the monitor**: A separate lightweight monitoring system to alert if Prometheus itself is down
