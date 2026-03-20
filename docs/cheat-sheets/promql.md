---
title: "PromQL Cheat Sheet"
description: "Quick reference for PromQL selectors, aggregations, common queries, recording rules, and alerting rules"
tags: [promql, prometheus, cheat-sheet, monitoring, observability]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# PromQL Cheat Sheet

Quick reference for PromQL selectors, label matchers, range vectors, aggregation operators, common queries, recording rules, and alerting rules.

---

## Data Types

| Type | Description | Example |
|------|-------------|---------|
| Instant vector | Set of time series, single timestamp | `http_requests_total` |
| Range vector | Set of time series, range of timestamps | `http_requests_total[5m]` |
| Scalar | Single numeric value | `42`, `3.14` |
| String | Single string value (limited use) | `"hello"` |

---

## Selectors & Label Matchers

### Instant Vector Selectors

```promql
# Metric name only
http_requests_total

# With label matchers
http_requests_total{method="GET"}
http_requests_total{method="GET", status="200"}
http_requests_total{job="api-server", instance=~"10.0.0.*"}
```

### Label Matching Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Exact match | `{method="GET"}` |
| `!=` | Not equal | `{status!="200"}` |
| `=~` | Regex match | `{path=~"/api/v[12]/.*"}` |
| `!~` | Regex not match | `{method!~"OPTIONS\|HEAD"}` |

### Range Vector Selectors

```promql
# Last 5 minutes of data
http_requests_total[5m]

# Time durations
http_requests_total[30s]      # 30 seconds
http_requests_total[5m]       # 5 minutes
http_requests_total[1h]       # 1 hour
http_requests_total[1d]       # 1 day
http_requests_total[1w]       # 1 week
```

### Offset Modifier

```promql
# Value 1 hour ago
http_requests_total offset 1h

# Rate 1 day ago (compare to yesterday)
rate(http_requests_total[5m] offset 1d)

# @ modifier (at specific timestamp)
http_requests_total @ 1704067200
```

---

## Rate & Counter Functions

| Function | Description | Use With |
|----------|-------------|----------|
| `rate(v[t])` | Per-second average rate | Counters (always use for counters) |
| `irate(v[t])` | Instantaneous rate (last 2 points) | Counters (volatile, dashboards) |
| `increase(v[t])` | Total increase over range | Counters |
| `delta(v[t])` | Change over range | Gauges |
| `idelta(v[t])` | Change between last 2 points | Gauges |
| `deriv(v[t])` | Per-second derivative (linear regression) | Gauges |

::: tip
Always apply `rate()` or `increase()` to counters before any aggregation. Never use raw counter values directly -- they only go up and reset on restart.
:::

```promql
# Correct: rate first, then sum
sum(rate(http_requests_total[5m])) by (method)

# Wrong: sum first, then rate (hides counter resets)
# rate(sum(http_requests_total)[5m])
```

---

## Aggregation Operators

### Syntax

```promql
<aggr_op>([parameter,] <vector>) [by|without (<labels>)]
```

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `sum` | Sum values | `sum(rate(http_requests_total[5m]))` |
| `avg` | Average | `avg(node_cpu_seconds_total)` |
| `min` | Minimum | `min(node_memory_available_bytes)` |
| `max` | Maximum | `max(container_memory_usage_bytes) by (pod)` |
| `count` | Count series | `count(up == 1)` |
| `stddev` | Standard deviation | `stddev(request_duration_seconds)` |
| `stdvar` | Standard variance | `stdvar(request_duration_seconds)` |
| `topk` | Top K series | `topk(5, rate(http_requests_total[5m]))` |
| `bottomk` | Bottom K series | `bottomk(3, up)` |
| `quantile` | Quantile across series | `quantile(0.95, request_duration_seconds)` |
| `count_values` | Count by value | `count_values("version", build_info)` |
| `group` | Group (all values become 1) | `group(up) by (job)` |

### by vs without

```promql
# Keep only these labels in result
sum(rate(http_requests_total[5m])) by (method, status)

# Remove these labels from result (keep everything else)
sum(rate(http_requests_total[5m])) without (instance)
```

---

## Binary Operators

### Arithmetic

| Operator | Description |
|----------|-------------|
| `+` | Addition |
| `-` | Subtraction |
| `*` | Multiplication |
| `/` | Division |
| `%` | Modulo |
| `^` | Power |

### Comparison (Filter)

| Operator | Description |
|----------|-------------|
| `==` | Equal |
| `!=` | Not equal |
| `>` | Greater than |
| `<` | Less than |
| `>=` | Greater or equal |
| `<=` | Less or equal |

```promql
# Filter: keep only series where value > 100
http_requests_total > 100

# Return 0/1 instead of filtering (bool modifier)
http_requests_total > bool 100
```

### Vector Matching

```promql
# One-to-one matching (same labels)
http_requests_total / http_requests_duration_seconds

# Ignore labels for matching
method_a{job="a"} / ignoring(job) method_b{job="b"}

# Match on specific labels only
method_a / on(instance, method) method_b

# Many-to-one / one-to-many
http_errors / ignoring(code) group_left http_requests
```

---

## Built-in Functions

### Math

| Function | Description |
|----------|-------------|
| `abs(v)` | Absolute value |
| `ceil(v)` | Round up |
| `floor(v)` | Round down |
| `round(v, to)` | Round to nearest |
| `clamp(v, min, max)` | Clamp values |
| `clamp_min(v, min)` | Minimum clamp |
| `clamp_max(v, max)` | Maximum clamp |
| `ln(v)` | Natural log |
| `log2(v)` | Log base 2 |
| `log10(v)` | Log base 10 |
| `sqrt(v)` | Square root |
| `exp(v)` | Exponential |
| `sgn(v)` | Sign (-1, 0, 1) |

### Range Vector Functions

| Function | Description |
|----------|-------------|
| `avg_over_time(v[t])` | Average over range |
| `min_over_time(v[t])` | Minimum over range |
| `max_over_time(v[t])` | Maximum over range |
| `sum_over_time(v[t])` | Sum over range |
| `count_over_time(v[t])` | Count of samples in range |
| `quantile_over_time(q, v[t])` | Quantile over range |
| `stddev_over_time(v[t])` | Std deviation over range |
| `last_over_time(v[t])` | Most recent value |
| `present_over_time(v[t])` | 1 if any sample exists |
| `changes(v[t])` | Number of value changes |
| `resets(v[t])` | Number of counter resets |

### Label Functions

| Function | Description |
|----------|-------------|
| `label_replace(v, dst, repl, src, regex)` | Regex replace label |
| `label_join(v, dst, sep, src1, src2, ...)` | Join labels |

```promql
# Extract "api" from path="/api/v1/users"
label_replace(metric, "service", "$1", "path", "/([^/]+)/.*")

# Combine labels
label_join(metric, "full_name", "-", "first", "last")
```

### Other Functions

| Function | Description |
|----------|-------------|
| `histogram_quantile(q, v)` | Quantile from histogram buckets |
| `predict_linear(v[t], secs)` | Linear prediction |
| `sort(v)` | Sort ascending |
| `sort_desc(v)` | Sort descending |
| `time()` | Current Unix timestamp |
| `timestamp(v)` | Timestamp of each sample |
| `vector(scalar)` | Scalar to vector |
| `scalar(v)` | Single-element vector to scalar |
| `absent(v)` | 1 if vector is empty |
| `absent_over_time(v[t])` | 1 if no samples in range |

---

## Common Queries

### Error Rate

```promql
# Error rate (fraction)
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))

# Error rate per service
sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
/
sum(rate(http_requests_total[5m])) by (service)

# Error rate percentage
100 * sum(rate(http_requests_total{status=~"5.."}[5m]))
/ sum(rate(http_requests_total[5m]))
```

### Latency Percentiles (Histograms)

```promql
# p50 latency
histogram_quantile(0.50,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# p95 latency
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# p99 latency per endpoint
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, handler)
)

# Average request duration
sum(rate(http_request_duration_seconds_sum[5m]))
/
sum(rate(http_request_duration_seconds_count[5m]))
```

### Saturation (Resource Usage)

```promql
# CPU utilization per instance
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory utilization
1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)

# Disk utilization
1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})

# Container CPU usage vs limit
sum(rate(container_cpu_usage_seconds_total[5m])) by (pod)
/
sum(container_spec_cpu_quota / container_spec_cpu_period) by (pod)

# Container memory usage vs limit
sum(container_memory_working_set_bytes) by (pod)
/
sum(container_spec_memory_limit_bytes) by (pod)
```

### Traffic

```promql
# Requests per second
sum(rate(http_requests_total[5m]))

# Requests per second by method
sum(rate(http_requests_total[5m])) by (method)

# Top 5 endpoints by request rate
topk(5, sum(rate(http_requests_total[5m])) by (handler))
```

### Availability & Uptime

```promql
# Targets that are down
up == 0

# Count of healthy vs total
count(up == 1) / count(up)

# Availability over 30 days
avg_over_time(up[30d])
```

### Predictions & Trends

```promql
# Predict disk full (in seconds)
predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[6h], 24*3600)

# Disk will be full within 24 hours
predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[6h], 24*3600) < 0

# Rate of change
deriv(process_resident_memory_bytes[1h])
```

---

## Recording Rules

Recording rules precompute expensive queries and store them as new time series.

```yaml
# prometheus.yml or rules file
groups:
  - name: http_rules
    interval: 30s
    rules:
      # Request rate by service
      - record: job:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job)

      # Error ratio by service
      - record: job:http_errors:ratio5m
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)
          /
          sum(rate(http_requests_total[5m])) by (job)

      # p95 latency by handler
      - record: handler:http_duration:p95_5m
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, handler)
          )
```

::: tip
Naming convention for recording rules: `level:metric:operations`. Example: `job:http_requests:rate5m` means aggregated by job, metric is http_requests, operation is rate over 5 minutes.
:::

---

## Alerting Rules

```yaml
groups:
  - name: app_alerts
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: job:http_errors:ratio5m > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {​{ $labels.job }}"
          description: "Error rate is {​{ $value | humanizePercentage }} for {​{ $labels.job }}"

      # High latency
      - alert: HighLatency
        expr: handler:http_duration:p95_5m > 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High p95 latency on {​{ $labels.handler }}"
          description: "p95 latency is {​{ $value | humanizeDuration }}"

      # Target down
      - alert: TargetDown
        expr: up == 0
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "Target {​{ $labels.instance }} is down"

      # Disk filling up
      - alert: DiskFillingUp
        expr: predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[6h], 24*3600) < 0
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Disk predicted full within 24h on {​{ $labels.instance }}"

      # Pod crash looping
      - alert: PodCrashLooping
        expr: increase(kube_pod_container_status_restarts_total[1h]) > 5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Pod {​{ $labels.pod }} is crash looping"
```

---

## Template Functions (Annotations)

| Function | Description | Example |
|----------|-------------|---------|
| `humanize` | Human-readable number | `1234567` to `1.235M` |
| `humanize1024` | Binary units | Bytes to KiB, MiB |
| `humanizeDuration` | Duration string | `3661` to `1h1m1s` |
| `humanizePercentage` | Percentage | `0.05` to `5%` |
| `humanizeTimestamp` | Timestamp to date | Unix to readable date |

---

## Gotchas & Best Practices

| Pitfall | Solution |
|---------|----------|
| Aggregating raw counters | Always apply `rate()` or `increase()` first |
| `rate()` returns 0 for new series | Use longer range `[10m]` or `increase()` |
| Missing series gives no result | Use `or vector(0)` for default |
| `histogram_quantile` wrong labels | Must keep `le` label in `by()` clause |
| High cardinality explosions | Avoid labels with unbounded values (user IDs, URLs) |
| Stale series after restart | Use `up` to detect target health |
| `irate` vs `rate` | `rate` for alerts/recording rules, `irate` only for dashboards |

```promql
# Default to 0 when no error series exist
sum(rate(http_requests_total{status=~"5.."}[5m])) or vector(0)

# Handle division by zero
sum(rate(errors[5m])) / (sum(rate(total[5m])) > 0)
```

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| Rate function | `rate()` | `irate()` | Alerts, recording rules, smooth | Dashboards, spiky detail |
| Counter total | `increase()` | `rate()` | Want total count over window | Want per-second rate |
| Gauge change | `delta()` | `deriv()` | Actual change | Per-second rate of change |
| Aggregation | `by (labels)` | `without (labels)` | Few labels to keep | Few labels to remove |
| Percentile | `histogram_quantile` | `quantile` | Histogram metric (buckets) | Across existing series |
| Missing data | `absent()` | `up == 0` | Metric disappeared entirely | Target is down |
| Time window | Short `[1m]` | Long `[15m]` | High-resolution, volatile | Smooth, stable for alerts |
