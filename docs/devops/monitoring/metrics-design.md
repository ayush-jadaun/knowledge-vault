---
title: Metrics Design
description: RED method, USE method, Four Golden Signals, SLIs/SLOs/SLAs, error budgets, burn rate alerting, and choosing between histograms and summaries for latency measurement — the complete guide to designing metrics that matter.
tags:
  - metrics
  - RED
  - USE
  - SLO
  - SLI
  - error-budget
  - golden-signals
  - monitoring
difficulty: intermediate
prerequisites:
  - monitoring/index
  - monitoring/prometheus-deep-dive
lastReviewed: "2026-03-17"
---

# Metrics Design

The most common monitoring failure is not a lack of metrics — it is a surplus of the wrong ones. Teams instrument everything they can think of, create dashboards for everything they instrumented, and then drown in data while missing the signals that matter. Good metrics design starts with a question: "What do I need to know to determine if my users are having a good experience?"

This guide covers the established frameworks for answering that question, the mechanics of SLOs and error budgets, and the practical tradeoffs between histogram and summary metric types for latency measurement.

## The RED Method

The RED method was created by Tom Wilkie (Grafana Labs) for monitoring request-driven services — which is most microservices. For every service, instrument three things:

### Rate

The number of requests your service is handling per second.

```promql
# Total request rate
sum(rate(http_requests_total[5m]))

# Request rate by route
sum(rate(http_requests_total[5m])) by (route)

# Request rate by method
sum(rate(http_requests_total[5m])) by (method)
```

**Why it matters:** A sudden drop in request rate means either your service is down, your load balancer is routing traffic elsewhere, or your upstream callers have stopped calling you. A spike means you are under unexpected load. Both are signals worth knowing about.

**What to alert on:**
- Request rate drops to zero (service is unreachable)
- Request rate exceeds capacity plan threshold (autoscaling trigger)
- Request rate deviates significantly from the same time last week (anomaly)

### Errors

The number of requests that are failing, typically expressed as an error rate (percentage of total requests).

```promql
# Error rate as a ratio (0 to 1)
sum(rate(http_requests_total{status_code=~"5.."}[5m]))
/ sum(rate(http_requests_total[5m]))

# Error rate by route
sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (route)
/ sum(rate(http_requests_total[5m])) by (route)

# Including client errors (4xx) for API correctness
sum(rate(http_requests_total{status_code=~"[45].."}[5m]))
/ sum(rate(http_requests_total[5m]))
```

**Important nuance:** Not all 4xx responses are errors from the service's perspective. A 404 for a non-existent resource is expected behavior. A 400 for malformed input is the client's fault. However, a spike in 4xx responses might indicate a breaking API change you deployed. Track them separately:

```promql
# Server errors (your fault)
sum(rate(http_requests_total{status_code=~"5.."}[5m]))

# Client errors (their fault, but still worth monitoring)
sum(rate(http_requests_total{status_code=~"4.."}[5m]))
```

**What to alert on:**
- Server error rate above 1% for 5 minutes (warning)
- Server error rate above 5% for 5 minutes (critical)
- Error rate above SLO threshold (SLO burn rate alert)

### Duration

The distribution of request latencies, typically measured at the 50th, 95th, and 99th percentiles.

```promql
# P50 — median latency (50% of requests are faster)
histogram_quantile(0.50,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# P95 — tail latency (5% of requests are slower)
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# P99 — extreme tail (1% of requests are slower)
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# Average (useful but hides the distribution)
sum(rate(http_request_duration_seconds_sum[5m]))
/ sum(rate(http_request_duration_seconds_count[5m]))
```

**Why percentiles matter more than averages:**

Consider a service with the following latencies:
- 95 requests at 10ms
- 4 requests at 100ms
- 1 request at 5000ms (5 seconds)

The average is 64ms — which suggests the service is healthy. But that one user experiencing 5 seconds of latency is having a terrible time, and the average completely hides this. The P99 is 5000ms, which immediately reveals the problem.

**What to alert on:**
- P95 above 500ms for 10 minutes (warning — adjust based on your SLO)
- P99 above 2s for 5 minutes (critical)
- P50 increasing trend (degradation before it becomes an incident)

### RED Dashboard Layout

```
Row 1: [Request Rate (time series)] [Error Rate (time series)] [P95 Latency (time series)]
Row 2: [Request Rate by Route]      [Error Rate by Route]      [P95 by Route]
Row 3: [Status Code Distribution]   [Top Errors (table)]       [Latency Heatmap]
```

## The USE Method

The USE method was created by Brendan Gregg for monitoring infrastructure resources — servers, disks, network interfaces, CPUs. For every resource, measure three things:

### Utilization

The percentage of time the resource is busy, or the proportion of the resource's capacity being consumed.

```promql
# CPU utilization (percentage of time not idle)
100 - (avg by (instance) (
  irate(node_cpu_seconds_total{mode="idle"}[5m])
) * 100)

# Memory utilization
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

# Disk utilization (space)
(1 - node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100

# Network interface utilization (requires knowing link speed)
rate(node_network_transmit_bytes_total[5m]) * 8
/ node_network_speed_bytes * 100
```

### Saturation

The degree to which the resource has extra work it cannot service, often queued. A saturated resource means requests are waiting.

```promql
# CPU saturation (load average vs CPU count)
node_load1 / count without (cpu) (node_cpu_seconds_total{mode="idle"})

# Memory saturation (swap usage — any swap activity means memory pressure)
rate(node_vmstat_pswpin[5m]) + rate(node_vmstat_pswpout[5m])

# Disk saturation (I/O queue depth)
rate(node_disk_io_time_weighted_seconds_total[5m])

# Network saturation (dropped packets)
rate(node_network_receive_drop_total[5m])
+ rate(node_network_transmit_drop_total[5m])
```

### Errors

The count of error events for the resource.

```promql
# Disk errors
rate(node_disk_io_time_seconds_total{result="error"}[5m])

# Network errors
rate(node_network_receive_errs_total[5m])
+ rate(node_network_transmit_errs_total[5m])

# Memory errors (ECC correctable/uncorrectable if available)
node_edac_correctable_errors_total
node_edac_uncorrectable_errors_total
```

### USE Applied to Common Resources

| Resource | Utilization | Saturation | Errors |
|---|---|---|---|
| **CPU** | CPU time not idle | Load average vs CPU count, run queue length | Machine check exceptions |
| **Memory** | Used/available ratio | Swap in/out, OOM kills | ECC errors |
| **Disk (capacity)** | Used/total ratio | — | Filesystem errors |
| **Disk (I/O)** | Disk busy time | I/O wait queue depth | Read/write errors |
| **Network** | Bandwidth consumed vs available | Dropped packets, socket backlog | CRC errors, packet errors |
| **DB connections** | Active/max ratio | Connection queue depth | Connection timeouts |
| **Thread pool** | Active/max ratio | Queue depth | Rejected tasks |

## The Four Golden Signals

Google's Site Reliability Engineering book defines four golden signals for monitoring any user-facing system. They overlap significantly with RED but include saturation from USE.

### 1. Latency

The time it takes to service a request. Distinguish between latency of successful requests and latency of failed requests — a 500 error that returns in 5ms should not improve your latency metrics.

```promql
# Latency of successful requests only
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket{status_code!~"5.."}[5m])) by (le)
)

# Latency of failed requests (useful for distinguishing timeout failures from fast failures)
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket{status_code=~"5.."}[5m])) by (le)
)
```

### 2. Traffic

A measure of demand on your system. For a web service, this is HTTP requests per second. For a streaming service, it might be sessions or concurrent connections. For a database, it might be transactions or queries per second.

```promql
# HTTP traffic
sum(rate(http_requests_total[5m]))

# WebSocket concurrent connections
websocket_active_connections

# Message queue throughput
sum(rate(kafka_server_brokertopicmetrics_messagesin_total[5m]))

# Database queries per second
sum(rate(db_query_duration_seconds_count[5m]))
```

### 3. Errors

The rate of requests that fail. Categorize errors:
- **Explicit errors**: HTTP 5xx, gRPC error codes, exception counts
- **Implicit errors**: HTTP 200 but with wrong content (requires content validation)
- **Policy errors**: HTTP 200 in 5 seconds when your SLO is 500ms

```promql
# Explicit server errors
sum(rate(http_requests_total{status_code=~"5.."}[5m]))
/ sum(rate(http_requests_total[5m]))

# Policy errors (successful but too slow)
1 - (
  sum(rate(http_request_duration_seconds_bucket{le="0.5"}[5m]))
  / sum(rate(http_request_duration_seconds_count[5m]))
)
```

### 4. Saturation

How "full" your service is. This is the most forward-looking signal — saturation tells you about problems before they happen. Focus on the most constrained resource.

```promql
# Service saturation: in-flight requests vs capacity
http_in_progress_requests / http_max_concurrent_requests * 100

# Database connection pool saturation
db_connection_pool_active / db_connection_pool_max * 100

# Memory saturation
container_memory_working_set_bytes / container_spec_memory_limit_bytes * 100

# Queue saturation
queue_depth / queue_max_depth * 100
```

### Choosing a Framework

| Framework | Best For | Focus |
|---|---|---|
| **RED** | Request-driven services (APIs, microservices) | User-facing behavior |
| **USE** | Infrastructure resources (servers, databases, networks) | Resource capacity |
| **Four Golden Signals** | Any user-facing system | Comprehensive coverage |

**Practical recommendation:** Use RED for your services and USE for the infrastructure those services run on. The Four Golden Signals are the union of both.

## SLIs, SLOs, and SLAs

### Service Level Indicators (SLIs)

An SLI is a quantitative measure of some aspect of the service's behavior. Good SLIs measure things users care about.

**Common SLIs:**

| Category | SLI | Measurement |
|---|---|---|
| **Availability** | Proportion of successful requests | `successful_requests / total_requests` |
| **Latency** | Proportion of requests faster than threshold | `requests_under_500ms / total_requests` |
| **Throughput** | Proportion of time system can serve expected load | `minutes_above_min_throughput / total_minutes` |
| **Correctness** | Proportion of requests returning correct results | `correct_responses / total_responses` |
| **Freshness** | Proportion of data updated within threshold | `records_updated_within_1min / total_records` |

**SLI Implementation in Prometheus:**

```promql
# Availability SLI: fraction of non-5xx responses
sli:availability =
  1 - (
    sum(rate(http_requests_total{status_code=~"5.."}[30d]))
    / sum(rate(http_requests_total[30d]))
  )

# Latency SLI: fraction of requests under 500ms
sli:latency =
  sum(rate(http_request_duration_seconds_bucket{le="0.5"}[30d]))
  / sum(rate(http_request_duration_seconds_count[30d]))
```

### Service Level Objectives (SLOs)

An SLO is a target value for an SLI. It answers "how good does this SLI need to be?"

**Example SLOs:**

| Service | SLI | SLO |
|---|---|---|
| Public API | Availability | 99.9% of requests succeed (30-day rolling) |
| Public API | Latency | 95% of requests complete in under 500ms |
| Public API | Latency | 99% of requests complete in under 2s |
| Internal API | Availability | 99.5% of requests succeed |
| Batch processing | Freshness | 99% of records processed within 5 minutes |
| Search | Correctness | 99.9% of queries return valid results |

**How to choose an SLO:**

1. **Start from user expectations.** If users expect a page to load in under 2 seconds, your latency SLO should be tighter than 2 seconds (because the page load involves multiple service calls).
2. **Start conservative.** Set a 99% SLO and tighten to 99.9% once you have data. It is much harder to loosen an SLO than to tighten one.
3. **Consider the cost.** Going from 99.9% to 99.99% availability requires 10x more investment. Is the business value there?
4. **Make it measurable.** If you cannot compute the SLI from existing metrics, add instrumentation before setting the SLO.

**The nines table:**

| SLO | Allowed downtime per 30 days | Allowed downtime per year |
|---|---|---|
| 99% | 7.2 hours | 3.65 days |
| 99.5% | 3.6 hours | 1.83 days |
| 99.9% | 43.2 minutes | 8.76 hours |
| 99.95% | 21.6 minutes | 4.38 hours |
| 99.99% | 4.3 minutes | 52.6 minutes |
| 99.999% | 26 seconds | 5.26 minutes |

### Service Level Agreements (SLAs)

An SLA is a contract with consequences. If an SLO is an internal target, an SLA is an external commitment with financial penalties (credits, refunds) for violations.

**Key differences:**

| Aspect | SLO | SLA |
|---|---|---|
| Audience | Internal (engineering team) | External (customers, partners) |
| Consequence of violation | Engineering action, prioritization | Financial penalties, legal liability |
| Tightness | Tighter (internal target) | Looser (leave margin for safety) |
| Measurement | Precise metrics | Agreed-upon measurement methodology |

**Critical rule: Your SLO must be tighter than your SLA.** If your SLA promises 99.9% availability, your SLO should be 99.95% so you have a safety margin. If you only alert when the SLO is violated, you are already in breach of the SLA.

## Error Budgets

An error budget is the inverse of an SLO. If your SLO is 99.9% availability, your error budget is 0.1% — you can afford 43.2 minutes of downtime per 30-day window.

### How Error Budgets Change Engineering Behavior

Without error budgets, teams face a constant tension:
- Product team: "Ship faster!"
- SRE/Ops team: "Don't break anything!"

Error budgets resolve this tension by making reliability a measurable, spendable resource:

- **Budget remaining > 50%**: Ship aggressively. Deploy frequently. Run experiments.
- **Budget remaining 20-50%**: Ship carefully. Increase testing. Limit blast radius.
- **Budget remaining < 20%**: Slow down. Focus on reliability work. Require extra review for changes.
- **Budget exhausted**: Feature freeze. All engineering effort goes to reliability until the budget recovers.

### Computing Error Budget Remaining

```promql
# Error budget: remaining fraction (1.0 = full budget, 0.0 = exhausted)
# For a 99.9% SLO over 30 days:

# Total error budget (allowed failure ratio)
# error_budget_total = 1 - 0.999 = 0.001

# Consumed error budget
# consumed = (total_errors in window) / (total_requests in window)

# Remaining
1 - (
  (
    sum(increase(http_requests_total{status_code=~"5.."}[30d]))
    / sum(increase(http_requests_total[30d]))
  )
  / 0.001
)
```

### Error Budget Policies

Document what happens at each budget threshold:

```markdown
## Error Budget Policy

### Budget > 50% remaining
- Normal development velocity
- Deploy at will (with standard CI/CD)
- Chaos engineering experiments permitted

### Budget 20-50% remaining
- Review deployment frequency
- Larger changes require staged rollout (canary)
- Increase automated test coverage for risky areas

### Budget 5-20% remaining
- Only critical features and bug fixes ship
- All deployments require canary with automated rollback
- Incident review meeting for each budget-consuming event

### Budget < 5% remaining
- Feature freeze
- All engineering effort on reliability
- Root cause analysis for all errors
- Postmortem review for every incident

### Budget exhausted
- Complete feature freeze
- SRE team has authority to block any deployment
- Daily stand-up on reliability improvement
- Executive visibility and reporting
```

## Burn Rate Alerting

Naive error budget alerting ("alert when budget is exhausted") is useless — by the time the alert fires, the damage is done. Burn rate alerting detects budget consumption rate and alerts before the budget is exhausted.

### Burn Rate Concept

A burn rate of 1 means you are consuming your error budget at exactly the expected rate (you will exhaust it at the end of the SLO window). A burn rate of 10 means you are consuming it 10x faster than expected.

```
burn_rate = actual_error_rate / allowed_error_rate

For 99.9% SLO (allowed_error_rate = 0.001):
  If actual error rate is 0.01 (1%):
    burn_rate = 0.01 / 0.001 = 10
    Time to budget exhaustion: 30 days / 10 = 3 days
```

### Multi-Window, Multi-Burn-Rate Alerts

Google's SRE workbook recommends alerting on multiple windows and burn rates to balance detection speed with false positive rate.

| Severity | Burn Rate | Long Window | Short Window | Time to Exhaustion |
|---|---|---|---|---|
| Page (critical) | 14.4x | 1 hour | 5 minutes | 2.08 days |
| Page (critical) | 6x | 6 hours | 30 minutes | 5 days |
| Ticket (warning) | 3x | 1 day | 2 hours | 10 days |
| Ticket (warning) | 1x | 3 days | 6 hours | 30 days |

**Why two windows?** The long window detects sustained problems. The short window prevents alerting on problems that have already resolved. Both conditions must be true simultaneously.

```yaml
# Prometheus alerting rules for multi-window burn rate
groups:
  - name: slo_burn_rate
    rules:
      # 99.9% SLO, error budget = 0.001

      # ---- Critical: 14.4x burn rate ----
      # Long window: 1 hour
      - record: slo:error_rate:1h
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[1h]))
          / sum(rate(http_requests_total[1h]))

      # Short window: 5 minutes
      - record: slo:error_rate:5m
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m]))

      - alert: SLOBurnRateCritical
        expr: |
          slo:error_rate:1h > (14.4 * 0.001)
          and
          slo:error_rate:5m > (14.4 * 0.001)
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error budget burning 14.4x — budget exhausted in ~2 days"
          description: |
            1h error rate: {​{ with printf `slo:error_rate:1h` | query }​}{​{ . | first | value | humanizePercentage }​}{​{ end }​}
            5m error rate: {​{ with printf `slo:error_rate:5m` | query }​}{​{ . | first | value | humanizePercentage }​}{​{ end }​}

      # ---- Critical: 6x burn rate ----
      - record: slo:error_rate:6h
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[6h]))
          / sum(rate(http_requests_total[6h]))

      - record: slo:error_rate:30m
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[30m]))
          / sum(rate(http_requests_total[30m]))

      - alert: SLOBurnRateHigh
        expr: |
          slo:error_rate:6h > (6 * 0.001)
          and
          slo:error_rate:30m > (6 * 0.001)
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error budget burning 6x — budget exhausted in ~5 days"

      # ---- Warning: 3x burn rate ----
      - record: slo:error_rate:1d
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[1d]))
          / sum(rate(http_requests_total[1d]))

      - record: slo:error_rate:2h
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[2h]))
          / sum(rate(http_requests_total[2h]))

      - alert: SLOBurnRateWarning
        expr: |
          slo:error_rate:1d > (3 * 0.001)
          and
          slo:error_rate:2h > (3 * 0.001)
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Error budget burning 3x — budget exhausted in ~10 days"

      # ---- Info: 1x burn rate ----
      - record: slo:error_rate:3d
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[3d]))
          / sum(rate(http_requests_total[3d]))

      - record: slo:error_rate:6h_check
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[6h]))
          / sum(rate(http_requests_total[6h]))

      - alert: SLOBurnRateElevated
        expr: |
          slo:error_rate:3d > (1 * 0.001)
          and
          slo:error_rate:6h_check > (1 * 0.001)
        for: 1h
        labels:
          severity: info
        annotations:
          summary: "Error budget burning at expected rate — budget will exhaust by end of window"
```

## Histogram vs Summary for Latency

This is one of the most frequently asked questions in Prometheus instrumentation. Both metric types can measure latency distributions, but they have fundamentally different tradeoffs.

### Histogram

A histogram counts observations in pre-defined buckets. The Prometheus server computes quantiles at query time using `histogram_quantile()`.

**Characteristics:**
- Buckets are configured at instrumentation time
- Quantiles are computed server-side (aggregatable)
- Each bucket is a separate time series (bucket cardinality × label cardinality)
- Quantile accuracy depends on bucket boundaries

```typescript
// Histogram instrumentation
const latency = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Request duration in seconds',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
```

**Produced time series:**
```
http_request_duration_seconds_bucket{le="0.005"} 1203
http_request_duration_seconds_bucket{le="0.01"}  2042
http_request_duration_seconds_bucket{le="0.025"} 4500
http_request_duration_seconds_bucket{le="0.05"}  6721
http_request_duration_seconds_bucket{le="0.1"}   8932
http_request_duration_seconds_bucket{le="0.25"}  9856
http_request_duration_seconds_bucket{le="0.5"}   9967
http_request_duration_seconds_bucket{le="1"}     9990
http_request_duration_seconds_bucket{le="2.5"}   9998
http_request_duration_seconds_bucket{le="5"}     10000
http_request_duration_seconds_bucket{le="10"}    10000
http_request_duration_seconds_bucket{le="+Inf"}  10000
http_request_duration_seconds_sum                452.332
http_request_duration_seconds_count              10000
```

### Summary

A summary calculates quantiles on the client side using a streaming algorithm over a sliding time window.

**Characteristics:**
- Quantiles are configured at instrumentation time
- Quantiles are computed client-side (not aggregatable)
- Each quantile is a separate time series
- Quantile accuracy is configurable but exact within configuration

```typescript
// Summary instrumentation
const latency = new Summary({
  name: 'http_request_duration_seconds',
  help: 'Request duration in seconds',
  percentiles: [0.5, 0.9, 0.95, 0.99],
  maxAgeSeconds: 600,
  ageBuckets: 5,
});
```

**Produced time series:**
```
http_request_duration_seconds{quantile="0.5"}  0.042
http_request_duration_seconds{quantile="0.9"}  0.234
http_request_duration_seconds{quantile="0.95"} 0.456
http_request_duration_seconds{quantile="0.99"} 1.234
http_request_duration_seconds_sum              452.332
http_request_duration_seconds_count            10000
```

### Detailed Comparison

| Aspect | Histogram | Summary |
|---|---|---|
| **Aggregation across instances** | Yes — sum buckets, then compute quantile | No — you cannot average percentiles |
| **Dynamic quantile selection** | Yes — compute any quantile at query time | No — must define quantiles at instrumentation |
| **Accuracy** | Depends on bucket boundaries | Configurable, but exact within config |
| **Client CPU cost** | Low (just incrementing counters) | Higher (maintaining sliding window quantile) |
| **Time series count** | buckets + 2 (sum, count) per label set | quantiles + 2 per label set |
| **Server query cost** | Higher (computing quantile from buckets) | Lower (quantile is pre-computed) |
| **SLO computation** | Directly from bucket counts | Not possible |
| **Apdex computation** | Directly from bucket counts | Not possible |

### When to Use Which

**Use histograms (recommended default):**
- When you have multiple instances of the same service and need to aggregate latencies
- When you want to compute SLOs (percentage of requests under threshold)
- When you want flexibility to compute different quantiles without re-instrumenting
- When you want to compute Apdex scores
- For any new instrumentation — histograms are the better default

**Use summaries only when:**
- You have a single instance (no aggregation needed)
- You need exact quantiles (not bucket-boundary approximations)
- You know exactly which quantiles you need and they will not change
- Client CPU is not a concern

### Histogram Accuracy Optimization

The key to accurate histogram quantiles is placing bucket boundaries near the values you care about.

**Bad buckets for a 500ms SLO:**
```typescript
buckets: [1, 5, 10, 30, 60]  // No bucket near 500ms!
```

**Good buckets for a 500ms SLO:**
```typescript
buckets: [0.05, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 10]
// Multiple buckets near 500ms for accurate quantile estimation
```

**Exponential buckets for general-purpose latency:**
```typescript
// exponentialBuckets(start, factor, count)
// 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12
buckets: exponentialBuckets(0.01, 2, 10)
```

## Putting It All Together

A complete metrics design for a service should include:

1. **RED metrics** for the service itself (rate, errors, duration)
2. **USE metrics** for the infrastructure it runs on (CPU, memory, disk, network)
3. **Dependency metrics** for everything it calls (database, cache, external APIs — also using RED)
4. **Business metrics** for what the service does (orders processed, users signed up, searches performed)
5. **SLIs derived from RED metrics** for formal reliability tracking
6. **SLOs setting targets** for those SLIs
7. **Error budget burn rate alerts** for proactive SLO violation detection

This layered approach ensures you can detect issues (RED), attribute them to resources (USE), track reliability commitments (SLO), and measure business impact (business metrics).
