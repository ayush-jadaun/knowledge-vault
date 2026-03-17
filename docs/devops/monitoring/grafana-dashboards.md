---
title: Grafana Dashboards
description: Dashboard design principles, panel types, variables and templating, annotations, alerting in Grafana, provisioning dashboards as code, and production-ready JSON dashboard configurations for Node.js, PostgreSQL, Redis, Kafka, and Kubernetes.
tags:
  - grafana
  - dashboards
  - monitoring
  - visualization
  - provisioning
  - json
  - kubernetes
difficulty: intermediate
prerequisites:
  - monitoring/index
  - monitoring/prometheus-deep-dive
  - Basic understanding of PromQL
lastReviewed: "2026-03-17"
---

# Grafana Dashboards

A dashboard is not a decoration. It is a diagnostic tool. The best dashboards answer specific questions in under five seconds: Is the system healthy? Where is the problem? Is it getting better or worse? A dashboard that requires interpretation or tribal knowledge to understand is a failed dashboard.

This guide covers dashboard design principles, every major panel type, variables and templating, provisioning dashboards as code, and includes complete importable JSON configurations for production systems.

## Dashboard Design Principles

### The 5-Second Rule

Anyone looking at your dashboard should be able to answer "is something wrong?" within 5 seconds. This means:

- **Red/green status panels at the top** — immediate pass/fail for the system
- **Key metrics front and center** — error rate, latency p95, request rate
- **Details below** — breakdowns by route, instance, or status code for diagnosis
- **No decoration** — every panel must answer a question

### Dashboard Hierarchy

Organize dashboards in a hierarchy that mirrors how engineers investigate issues:

```
Level 0: Service Overview (all services at a glance)
   └── Level 1: Service Detail (single service deep dive)
        └── Level 2: Component Detail (database, cache, queue)
             └── Level 3: Debug (individual queries, traces)
```

**Level 0 — Service Overview:**
- One row per service
- Status (up/down), error rate, p95 latency, request rate
- Use stat panels with color thresholds
- This is the dashboard you look at first during an incident

**Level 1 — Service Detail:**
- RED metrics (Rate, Errors, Duration) broken down by route
- Resource utilization (CPU, memory, connections)
- Dependency health (database, cache, external APIs)

**Level 2 — Component Detail:**
- Database: query duration, connections, lock waits, replication lag
- Cache: hit rate, evictions, memory usage
- Queue: consumer lag, message rate, partition distribution

**Level 3 — Debug:**
- Individual request traces (link to Tempo/Jaeger)
- Slow query logs
- Error log panels

### Layout Conventions

- **Row 1**: Status indicators (stat panels) — green/red at a glance
- **Row 2**: Request rate, error rate, latency (time series panels) — the RED metrics
- **Row 3-4**: Breakdown panels — by route, by status code, by instance
- **Row 5+**: Resource and dependency panels

Use consistent panel sizes: full-width for important metrics, half-width for breakdowns, quarter-width for status indicators.

### Color Standards

Adopt a consistent color scheme across all dashboards:

| Meaning | Color | Hex |
|---|---|---|
| Healthy / Success | Green | `#73BF69` |
| Warning | Yellow/Orange | `#FF9830` |
| Critical / Error | Red | `#F2495C` |
| Info / Neutral | Blue | `#5794F2` |
| Background context | Gray | `#8AB8FF` |

## Panel Types

### Time Series

The workhorse panel for any time-varying metric. Use it for request rates, latency, error rates, resource utilization.

**Configuration best practices:**
- Set meaningful Y-axis labels and units (requests/sec, milliseconds, bytes)
- Use standard units so Grafana auto-formats values (1,000,000 bytes → "1 MB")
- Set axis min to 0 for rate metrics (negative rates make no sense)
- Use "connect null values" for metrics that may have gaps
- Stack series only when they represent parts of a whole (e.g., request rate by status code)

### Stat

A single big number with optional sparkline. Use it for current values that need to be visible at a glance: current error rate, active connections, p95 latency.

**Configuration best practices:**
- Set color thresholds (green → yellow → red) so the panel is self-explanatory
- Use "Last (non-null)" as the calculation for real-time values
- Use "Mean" for smoothed values
- Add a sparkline to show trend direction
- Keep the number of stat panels in a row to 4-6 for readability

### Gauge

A visual gauge showing a value relative to min/max bounds. Use it for utilization metrics: CPU percentage, memory percentage, disk percentage.

**Configuration best practices:**
- Set min and max values (0% to 100% for utilization)
- Set threshold zones (0-60 green, 60-80 yellow, 80-100 red)
- Do not use gauge panels for values without natural bounds (use stat instead)

### Table

A table for showing multiple values side by side. Use it for top-N lists, per-instance breakdowns, or alert status overviews.

**Configuration best practices:**
- Sort by the most important column
- Use color-coded cells for status columns
- Use bar gauge cell type for numeric columns to add visual weight
- Limit to 10-20 rows; use filtering or variables for larger datasets

### Heatmap

A heatmap for showing distribution over time. The canonical use case is histogram buckets: latency distribution where color intensity represents the count of requests in each bucket.

**Configuration best practices:**
- Use with Prometheus histogram metrics and the `Format: Heatmap` option
- Set the Y-axis to the unit of the histogram (e.g., seconds for latency)
- Use a color scheme that highlights outliers (YlOrRd is effective)
- Enable tooltip to show exact bucket boundaries and counts

### Logs Panel

Displays log lines from Loki, Elasticsearch, or CloudWatch. Use it in debug dashboards to show relevant logs alongside metrics.

**Configuration best practices:**
- Filter logs to the same service/component shown in the dashboard
- Use variables so the log query matches the selected service
- Enable "wrap lines" for long log messages
- Sort by newest first

## Variables and Templating

Variables make dashboards reusable across environments, services, and time ranges.

### Variable Types

```
Query variable:     Values from a Prometheus query
                    label_values(http_requests_total, route)
                    label_values(up{job="$job"}, instance)

Custom variable:    Static list of values
                    production, staging, development

Datasource variable: Switch between Prometheus instances
                     Type: datasource, Query: prometheus

Interval variable:  Dynamic aggregation interval
                    Values: 1m, 5m, 15m, 1h
                    Auto: $__interval

Text box variable:  Free-text input for ad-hoc filtering
```

### Common Variable Setup

```json
{
  "templating": {
    "list": [
      {
        "name": "datasource",
        "type": "datasource",
        "query": "prometheus",
        "current": { "text": "Prometheus", "value": "Prometheus" }
      },
      {
        "name": "environment",
        "type": "custom",
        "query": "production,staging,development",
        "current": { "text": "production", "value": "production" }
      },
      {
        "name": "job",
        "type": "query",
        "datasource": { "type": "prometheus", "uid": "$datasource" },
        "query": "label_values(up{environment=\"$environment\"}, job)",
        "refresh": 2,
        "sort": 1
      },
      {
        "name": "instance",
        "type": "query",
        "datasource": { "type": "prometheus", "uid": "$datasource" },
        "query": "label_values(up{job=\"$job\"}, instance)",
        "refresh": 2,
        "sort": 1,
        "multi": true,
        "includeAll": true
      },
      {
        "name": "interval",
        "type": "interval",
        "query": "1m,5m,15m,30m,1h",
        "auto": true,
        "auto_count": 30,
        "auto_min": "10s"
      }
    ]
  }
}
```

### Using Variables in Queries

```promql
# Filter by selected environment and job
rate(http_requests_total{environment="$environment", job="$job"}[$interval])

# Multi-select instance (uses regex)
rate(http_requests_total{instance=~"$instance"}[$interval])

# Use $__rate_interval for automatic rate interval
rate(http_requests_total{job="$job"}[$__rate_interval])
```

## Annotations

Annotations overlay events on time series panels, providing context for metric changes.

```json
{
  "annotations": {
    "list": [
      {
        "name": "Deployments",
        "datasource": { "type": "prometheus", "uid": "$datasource" },
        "enable": true,
        "iconColor": "#5794F2",
        "expr": "changes(process_start_time_seconds{job=\"$job\"}[2m]) > 0",
        "step": "60s",
        "titleFormat": "Deploy",
        "textFormat": "{{ $labels.instance }} restarted"
      },
      {
        "name": "Alerts",
        "datasource": { "type": "prometheus", "uid": "$datasource" },
        "enable": true,
        "iconColor": "#F2495C",
        "expr": "ALERTS{alertstate=\"firing\", job=\"$job\"}",
        "step": "60s",
        "titleFormat": "{{ $labels.alertname }}",
        "textFormat": "Severity: {{ $labels.severity }}"
      }
    ]
  }
}
```

## Alerting in Grafana

Grafana supports native alerting (Grafana 8+) as an alternative to Prometheus Alertmanager.

### Alert Rule Configuration

```json
{
  "alert": {
    "name": "High Error Rate",
    "conditions": [
      {
        "evaluator": { "type": "gt", "params": [0.05] },
        "operator": { "type": "and" },
        "query": { "params": ["A", "5m", "now"] },
        "reducer": { "type": "avg" },
        "type": "query"
      }
    ],
    "executionErrorState": "alerting",
    "for": "5m",
    "frequency": "1m",
    "notifications": [
      { "uid": "slack-channel-id" }
    ]
  }
}
```

### Contact Points

Configure where alerts are sent:

- **Slack**: Channel, mention groups, custom templates
- **PagerDuty**: Routing key, severity mapping
- **Email**: Recipients, subject template
- **Webhook**: Custom HTTP endpoint for integration with any system

## Provisioning Dashboards as Code

Store dashboards in version control and deploy them automatically.

### Provisioning Configuration

```yaml
# /etc/grafana/provisioning/dashboards/default.yml
apiVersion: 1
providers:
  - name: 'default'
    orgId: 1
    folder: 'Production'
    type: file
    disableDeletion: false
    editable: true
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: true
```

### Datasource Provisioning

```yaml
# /etc/grafana/provisioning/datasources/default.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      timeInterval: '15s'
      exemplarTraceIdDestinations:
        - name: traceID
          datasourceUid: tempo
          urlDisplayLabel: 'View Trace'

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      derivedFields:
        - datasourceUid: tempo
          matcherRegex: '"traceId":"(\w+)"'
          name: TraceID
          url: '$${__value.raw}'

  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
```

## Production Dashboard JSON Configurations

### Node.js Application Dashboard

```json
{
  "dashboard": {
    "id": null,
    "uid": "nodejs-app-overview",
    "title": "Node.js Application Overview",
    "description": "RED metrics, runtime stats, and dependency health for a Node.js application",
    "tags": ["nodejs", "application", "production"],
    "timezone": "browser",
    "refresh": "30s",
    "time": { "from": "now-6h", "to": "now" },
    "fiscalYearStartMonth": 0,
    "liveNow": false,
    "templating": {
      "list": [
        {
          "name": "datasource",
          "type": "datasource",
          "query": "prometheus"
        },
        {
          "name": "job",
          "type": "query",
          "datasource": { "type": "prometheus", "uid": "${datasource}" },
          "query": "label_values(up, job)",
          "refresh": 2,
          "sort": 1
        },
        {
          "name": "instance",
          "type": "query",
          "datasource": { "type": "prometheus", "uid": "${datasource}" },
          "query": "label_values(up{job=\"$job\"}, instance)",
          "refresh": 2,
          "sort": 1,
          "multi": true,
          "includeAll": true
        }
      ]
    },
    "panels": [
      {
        "title": "Service Status",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 0, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "up{job=\"$job\"}",
            "legendFormat": "{{ instance }}"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "mappings": [
              { "options": { "0": { "text": "DOWN", "color": "red" } }, "type": "value" },
              { "options": { "1": { "text": "UP", "color": "green" } }, "type": "value" }
            ],
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "red", "value": null },
                { "color": "green", "value": 1 }
              ]
            }
          }
        },
        "options": { "colorMode": "background", "graphMode": "none", "textMode": "auto" }
      },
      {
        "title": "Request Rate",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 4, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{job=\"$job\"}[5m]))",
            "legendFormat": "req/s"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "reqps",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "green", "value": null }
              ]
            }
          }
        },
        "options": { "colorMode": "value", "graphMode": "area", "textMode": "auto" }
      },
      {
        "title": "Error Rate",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 8, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{job=\"$job\", status_code=~\"5..\"}[5m])) / sum(rate(http_requests_total{job=\"$job\"}[5m])) * 100",
            "legendFormat": "error %"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "green", "value": null },
                { "color": "yellow", "value": 1 },
                { "color": "red", "value": 5 }
              ]
            }
          }
        },
        "options": { "colorMode": "background", "graphMode": "area", "textMode": "auto" }
      },
      {
        "title": "P95 Latency",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 12, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job=\"$job\"}[5m])) by (le))",
            "legendFormat": "p95"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "s",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "green", "value": null },
                { "color": "yellow", "value": 0.5 },
                { "color": "red", "value": 1 }
              ]
            }
          }
        },
        "options": { "colorMode": "value", "graphMode": "area", "textMode": "auto" }
      },
      {
        "title": "P99 Latency",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 16, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job=\"$job\"}[5m])) by (le))",
            "legendFormat": "p99"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "s",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "green", "value": null },
                { "color": "yellow", "value": 1 },
                { "color": "red", "value": 5 }
              ]
            }
          }
        },
        "options": { "colorMode": "value", "graphMode": "area", "textMode": "auto" }
      },
      {
        "title": "Active Instances",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 20, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "count(up{job=\"$job\"} == 1)",
            "legendFormat": "instances"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "red", "value": null },
                { "color": "green", "value": 1 }
              ]
            }
          }
        },
        "options": { "colorMode": "value", "graphMode": "none", "textMode": "auto" }
      },
      {
        "title": "Request Rate by Route",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{job=\"$job\"}[5m])) by (route)",
            "legendFormat": "{{ route }}"
          }
        ],
        "fieldConfig": { "defaults": { "unit": "reqps", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10, "stacking": { "mode": "none" } } } }
      },
      {
        "title": "Error Rate by Route",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{job=\"$job\", status_code=~\"5..\"}[5m])) by (route) / sum(rate(http_requests_total{job=\"$job\"}[5m])) by (route) * 100",
            "legendFormat": "{{ route }}"
          }
        ],
        "fieldConfig": { "defaults": { "unit": "percent", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10, "thresholdsStyle": { "mode": "line" } }, "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "red", "value": 5 }] } } }
      },
      {
        "title": "Latency by Percentile",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 12 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket{job=\"$job\"}[5m])) by (le))",
            "legendFormat": "p50"
          },
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job=\"$job\"}[5m])) by (le))",
            "legendFormat": "p95"
          },
          {
            "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job=\"$job\"}[5m])) by (le))",
            "legendFormat": "p99"
          }
        ],
        "fieldConfig": { "defaults": { "unit": "s", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 5 } } }
      },
      {
        "title": "Latency Heatmap",
        "type": "heatmap",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 12 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "sum(increase(http_request_duration_seconds_bucket{job=\"$job\"}[$__rate_interval])) by (le)",
            "legendFormat": "{{ le }}",
            "format": "heatmap"
          }
        ],
        "options": { "yAxis": { "unit": "s" }, "color": { "scheme": "YlOrRd" }, "tooltip": { "show": true } }
      },
      {
        "title": "Node.js Heap Memory",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 8, "x": 0, "y": 20 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "nodejs_heap_size_used_bytes{job=\"$job\", instance=~\"$instance\"}",
            "legendFormat": "{{ instance }} used"
          },
          {
            "expr": "nodejs_heap_size_total_bytes{job=\"$job\", instance=~\"$instance\"}",
            "legendFormat": "{{ instance }} total"
          }
        ],
        "fieldConfig": { "defaults": { "unit": "bytes", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Event Loop Lag",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 8, "x": 8, "y": 20 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "nodejs_eventloop_lag_seconds{job=\"$job\", instance=~\"$instance\"}",
            "legendFormat": "{{ instance }}"
          }
        ],
        "fieldConfig": { "defaults": { "unit": "s", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 }, "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "red", "value": 0.1 }] } } }
      },
      {
        "title": "Active Handles & Requests",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 8, "x": 16, "y": 20 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "nodejs_active_handles_total{job=\"$job\", instance=~\"$instance\"}",
            "legendFormat": "{{ instance }} handles"
          },
          {
            "expr": "nodejs_active_requests_total{job=\"$job\", instance=~\"$instance\"}",
            "legendFormat": "{{ instance }} requests"
          }
        ],
        "fieldConfig": { "defaults": { "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "GC Duration",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 28 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "rate(nodejs_gc_duration_seconds_sum{job=\"$job\"}[5m])",
            "legendFormat": "{{ instance }} {{ kind }}"
          }
        ],
        "fieldConfig": { "defaults": { "unit": "s", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "HTTP Status Code Distribution",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 28 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{job=\"$job\"}[5m])) by (status_code)",
            "legendFormat": "{{ status_code }}"
          }
        ],
        "fieldConfig": { "defaults": { "unit": "reqps", "custom": { "drawStyle": "bars", "lineWidth": 1, "fillOpacity": 80, "stacking": { "mode": "normal" } } } },
        "options": {}
      }
    ],
    "schemaVersion": 39,
    "version": 1
  }
}
```

### PostgreSQL Dashboard

```json
{
  "dashboard": {
    "id": null,
    "uid": "postgresql-overview",
    "title": "PostgreSQL Overview",
    "description": "Connection pool, query performance, replication, and storage for PostgreSQL",
    "tags": ["postgresql", "database", "production"],
    "timezone": "browser",
    "refresh": "30s",
    "time": { "from": "now-6h", "to": "now" },
    "templating": {
      "list": [
        {
          "name": "datasource",
          "type": "datasource",
          "query": "prometheus"
        },
        {
          "name": "instance",
          "type": "query",
          "datasource": { "type": "prometheus", "uid": "${datasource}" },
          "query": "label_values(pg_up, instance)",
          "refresh": 2
        }
      ]
    },
    "panels": [
      {
        "title": "PostgreSQL Up",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 0, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [{ "expr": "pg_up{instance=\"$instance\"}" }],
        "fieldConfig": {
          "defaults": {
            "mappings": [
              { "options": { "0": { "text": "DOWN", "color": "red" } }, "type": "value" },
              { "options": { "1": { "text": "UP", "color": "green" } }, "type": "value" }
            ]
          }
        },
        "options": { "colorMode": "background" }
      },
      {
        "title": "Active Connections",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 4, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [{ "expr": "pg_stat_activity_count{instance=\"$instance\", state=\"active\"}" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 50 }, { "color": "red", "value": 80 }] } } }
      },
      {
        "title": "Total Connections",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 8, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [{ "expr": "sum(pg_stat_activity_count{instance=\"$instance\"})" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 80 }, { "color": "red", "value": 95 }] } } }
      },
      {
        "title": "Max Connections",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 12, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [{ "expr": "pg_settings_max_connections{instance=\"$instance\"}" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "blue", "value": null }] } } }
      },
      {
        "title": "Database Size",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 16, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [{ "expr": "sum(pg_database_size_bytes{instance=\"$instance\"})" }],
        "fieldConfig": { "defaults": { "unit": "bytes" } }
      },
      {
        "title": "Replication Lag",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 20, "y": 0 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [{ "expr": "pg_replication_lag{instance=\"$instance\"}" }],
        "fieldConfig": { "defaults": { "unit": "s", "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 1 }, { "color": "red", "value": 5 }] } } }
      },
      {
        "title": "Transactions per Second",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          { "expr": "rate(pg_stat_database_xact_commit{instance=\"$instance\"}[5m])", "legendFormat": "{{ datname }} commits/s" },
          { "expr": "rate(pg_stat_database_xact_rollback{instance=\"$instance\"}[5m])", "legendFormat": "{{ datname }} rollbacks/s" }
        ],
        "fieldConfig": { "defaults": { "unit": "ops", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Rows Affected per Second",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          { "expr": "rate(pg_stat_database_tup_fetched{instance=\"$instance\"}[5m])", "legendFormat": "{{ datname }} fetched" },
          { "expr": "rate(pg_stat_database_tup_inserted{instance=\"$instance\"}[5m])", "legendFormat": "{{ datname }} inserted" },
          { "expr": "rate(pg_stat_database_tup_updated{instance=\"$instance\"}[5m])", "legendFormat": "{{ datname }} updated" },
          { "expr": "rate(pg_stat_database_tup_deleted{instance=\"$instance\"}[5m])", "legendFormat": "{{ datname }} deleted" }
        ],
        "fieldConfig": { "defaults": { "unit": "ops", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Cache Hit Ratio",
        "type": "gauge",
        "gridPos": { "h": 6, "w": 8, "x": 0, "y": 12 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [{ "expr": "pg_stat_database_blks_hit{instance=\"$instance\"} / (pg_stat_database_blks_hit{instance=\"$instance\"} + pg_stat_database_blks_read{instance=\"$instance\"}) * 100" }],
        "fieldConfig": { "defaults": { "unit": "percent", "min": 0, "max": 100, "thresholds": { "mode": "absolute", "steps": [{ "color": "red", "value": null }, { "color": "yellow", "value": 90 }, { "color": "green", "value": 99 }] } } }
      },
      {
        "title": "Connection States",
        "type": "timeseries",
        "gridPos": { "h": 6, "w": 8, "x": 8, "y": 12 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          { "expr": "pg_stat_activity_count{instance=\"$instance\"}", "legendFormat": "{{ state }}" }
        ],
        "fieldConfig": { "defaults": { "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 20, "stacking": { "mode": "normal" } } } }
      },
      {
        "title": "Lock Waits",
        "type": "timeseries",
        "gridPos": { "h": 6, "w": 8, "x": 16, "y": 12 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          { "expr": "pg_locks_count{instance=\"$instance\"}", "legendFormat": "{{ mode }}" }
        ],
        "fieldConfig": { "defaults": { "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Slow Queries (from app metrics)",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 18 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          { "expr": "histogram_quantile(0.95, sum(rate(db_query_duration_seconds_bucket{instance=~\"$instance\"}[5m])) by (le, operation))", "legendFormat": "p95 {{ operation }}" },
          { "expr": "histogram_quantile(0.99, sum(rate(db_query_duration_seconds_bucket{instance=~\"$instance\"}[5m])) by (le, operation))", "legendFormat": "p99 {{ operation }}" }
        ],
        "fieldConfig": { "defaults": { "unit": "s", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 5 } } }
      },
      {
        "title": "Database Size Over Time",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 18 },
        "datasource": { "type": "prometheus", "uid": "${datasource}" },
        "targets": [
          { "expr": "pg_database_size_bytes{instance=\"$instance\"}", "legendFormat": "{{ datname }}" }
        ],
        "fieldConfig": { "defaults": { "unit": "bytes", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      }
    ],
    "schemaVersion": 39,
    "version": 1
  }
}
```

### Redis Dashboard

```json
{
  "dashboard": {
    "id": null,
    "uid": "redis-overview",
    "title": "Redis Overview",
    "description": "Memory, hit rate, connections, command stats, and replication for Redis",
    "tags": ["redis", "cache", "production"],
    "timezone": "browser",
    "refresh": "30s",
    "time": { "from": "now-6h", "to": "now" },
    "templating": {
      "list": [
        { "name": "datasource", "type": "datasource", "query": "prometheus" },
        { "name": "instance", "type": "query", "datasource": { "type": "prometheus", "uid": "${datasource}" }, "query": "label_values(redis_up, instance)", "refresh": 2 }
      ]
    },
    "panels": [
      {
        "title": "Redis Up",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 0, "y": 0 },
        "targets": [{ "expr": "redis_up{instance=\"$instance\"}" }],
        "fieldConfig": { "defaults": { "mappings": [{ "options": { "0": { "text": "DOWN", "color": "red" } }, "type": "value" }, { "options": { "1": { "text": "UP", "color": "green" } }, "type": "value" }] } },
        "options": { "colorMode": "background" }
      },
      {
        "title": "Memory Used",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 4, "y": 0 },
        "targets": [{ "expr": "redis_memory_used_bytes{instance=\"$instance\"}" }],
        "fieldConfig": { "defaults": { "unit": "bytes", "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "red", "value": 4294967296 }] } } }
      },
      {
        "title": "Hit Rate",
        "type": "gauge",
        "gridPos": { "h": 4, "w": 4, "x": 8, "y": 0 },
        "targets": [{ "expr": "redis_keyspace_hits_total{instance=\"$instance\"} / (redis_keyspace_hits_total{instance=\"$instance\"} + redis_keyspace_misses_total{instance=\"$instance\"}) * 100" }],
        "fieldConfig": { "defaults": { "unit": "percent", "min": 0, "max": 100, "thresholds": { "mode": "absolute", "steps": [{ "color": "red", "value": null }, { "color": "yellow", "value": 80 }, { "color": "green", "value": 95 }] } } }
      },
      {
        "title": "Connected Clients",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 12, "y": 0 },
        "targets": [{ "expr": "redis_connected_clients{instance=\"$instance\"}" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 100 }, { "color": "red", "value": 500 }] } } }
      },
      {
        "title": "Total Keys",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 16, "y": 0 },
        "targets": [{ "expr": "sum(redis_db_keys{instance=\"$instance\"})" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "blue", "value": null }] } } }
      },
      {
        "title": "Evictions/s",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 20, "y": 0 },
        "targets": [{ "expr": "rate(redis_evicted_keys_total{instance=\"$instance\"}[5m])" }],
        "fieldConfig": { "defaults": { "unit": "ops", "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "red", "value": 1 }] } } }
      },
      {
        "title": "Commands per Second",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
        "targets": [{ "expr": "rate(redis_commands_processed_total{instance=\"$instance\"}[5m])", "legendFormat": "commands/s" }],
        "fieldConfig": { "defaults": { "unit": "ops", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Memory Usage Over Time",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
        "targets": [
          { "expr": "redis_memory_used_bytes{instance=\"$instance\"}", "legendFormat": "used" },
          { "expr": "redis_memory_max_bytes{instance=\"$instance\"}", "legendFormat": "max" },
          { "expr": "redis_memory_used_rss_bytes{instance=\"$instance\"}", "legendFormat": "rss" }
        ],
        "fieldConfig": { "defaults": { "unit": "bytes", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Hit/Miss Rate",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 12 },
        "targets": [
          { "expr": "rate(redis_keyspace_hits_total{instance=\"$instance\"}[5m])", "legendFormat": "hits/s" },
          { "expr": "rate(redis_keyspace_misses_total{instance=\"$instance\"}[5m])", "legendFormat": "misses/s" }
        ],
        "fieldConfig": { "defaults": { "unit": "ops", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Command Latency by Type",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 12 },
        "targets": [
          { "expr": "rate(redis_commands_duration_seconds_total{instance=\"$instance\"}[5m]) / rate(redis_commands_total{instance=\"$instance\"}[5m])", "legendFormat": "{{ cmd }} avg" }
        ],
        "fieldConfig": { "defaults": { "unit": "s", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 5 } } }
      }
    ],
    "schemaVersion": 39,
    "version": 1
  }
}
```

### Kafka Dashboard

```json
{
  "dashboard": {
    "id": null,
    "uid": "kafka-overview",
    "title": "Kafka Overview",
    "description": "Broker health, topic throughput, consumer lag, partition distribution, and replication for Kafka",
    "tags": ["kafka", "messaging", "production"],
    "timezone": "browser",
    "refresh": "30s",
    "time": { "from": "now-6h", "to": "now" },
    "templating": {
      "list": [
        { "name": "datasource", "type": "datasource", "query": "prometheus" },
        { "name": "cluster", "type": "query", "datasource": { "type": "prometheus", "uid": "${datasource}" }, "query": "label_values(kafka_server_brokertopicmetrics_messagesin_total, cluster)", "refresh": 2 },
        { "name": "topic", "type": "query", "datasource": { "type": "prometheus", "uid": "${datasource}" }, "query": "label_values(kafka_server_brokertopicmetrics_messagesin_total{cluster=\"$cluster\"}, topic)", "refresh": 2, "multi": true, "includeAll": true }
      ]
    },
    "panels": [
      {
        "title": "Active Brokers",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 0, "y": 0 },
        "targets": [{ "expr": "count(kafka_server_kafkaserver_brokerstate{cluster=\"$cluster\"} == 3)" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "red", "value": null }, { "color": "green", "value": 3 }] } } }
      },
      {
        "title": "Messages In/s",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 4, "y": 0 },
        "targets": [{ "expr": "sum(rate(kafka_server_brokertopicmetrics_messagesin_total{cluster=\"$cluster\", topic=~\"$topic\"}[5m]))" }],
        "fieldConfig": { "defaults": { "unit": "ops" } }
      },
      {
        "title": "Bytes In/s",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 8, "y": 0 },
        "targets": [{ "expr": "sum(rate(kafka_server_brokertopicmetrics_bytesin_total{cluster=\"$cluster\", topic=~\"$topic\"}[5m]))" }],
        "fieldConfig": { "defaults": { "unit": "Bps" } }
      },
      {
        "title": "Under-Replicated Partitions",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 12, "y": 0 },
        "targets": [{ "expr": "sum(kafka_server_replicamanager_underreplicatedpartitions{cluster=\"$cluster\"})" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "red", "value": 1 }] } } },
        "options": { "colorMode": "background" }
      },
      {
        "title": "Total Consumer Lag",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 16, "y": 0 },
        "targets": [{ "expr": "sum(kafka_consumergroup_lag{cluster=\"$cluster\"})" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 10000 }, { "color": "red", "value": 100000 }] } } }
      },
      {
        "title": "ISR Shrinks/s",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 20, "y": 0 },
        "targets": [{ "expr": "sum(rate(kafka_server_replicamanager_isrshrinks_total{cluster=\"$cluster\"}[5m]))" }],
        "fieldConfig": { "defaults": { "unit": "ops", "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "red", "value": 0.01 }] } } }
      },
      {
        "title": "Messages In per Topic",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
        "targets": [{ "expr": "sum(rate(kafka_server_brokertopicmetrics_messagesin_total{cluster=\"$cluster\", topic=~\"$topic\"}[5m])) by (topic)", "legendFormat": "{{ topic }}" }],
        "fieldConfig": { "defaults": { "unit": "ops", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Consumer Lag by Group",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
        "targets": [{ "expr": "sum(kafka_consumergroup_lag{cluster=\"$cluster\", topic=~\"$topic\"}) by (consumergroup)", "legendFormat": "{{ consumergroup }}" }],
        "fieldConfig": { "defaults": { "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Bytes In/Out per Broker",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 12 },
        "targets": [
          { "expr": "rate(kafka_server_brokertopicmetrics_bytesin_total{cluster=\"$cluster\"}[5m])", "legendFormat": "{{ instance }} in" },
          { "expr": "rate(kafka_server_brokertopicmetrics_bytesout_total{cluster=\"$cluster\"}[5m])", "legendFormat": "{{ instance }} out" }
        ],
        "fieldConfig": { "defaults": { "unit": "Bps", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Request Handler Idle %",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 12 },
        "targets": [{ "expr": "kafka_server_kafkarequesthandlerpool_requesthandleravgidlepercent_count{cluster=\"$cluster\"}", "legendFormat": "{{ instance }}" }],
        "fieldConfig": { "defaults": { "unit": "percentunit", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 }, "thresholds": { "mode": "absolute", "steps": [{ "color": "red", "value": null }, { "color": "yellow", "value": 0.3 }, { "color": "green", "value": 0.7 }] } } }
      }
    ],
    "schemaVersion": 39,
    "version": 1
  }
}
```

### Kubernetes Dashboard

```json
{
  "dashboard": {
    "id": null,
    "uid": "kubernetes-overview",
    "title": "Kubernetes Cluster Overview",
    "description": "Node health, pod status, resource utilization, and workload metrics for Kubernetes",
    "tags": ["kubernetes", "k8s", "infrastructure", "production"],
    "timezone": "browser",
    "refresh": "30s",
    "time": { "from": "now-6h", "to": "now" },
    "templating": {
      "list": [
        { "name": "datasource", "type": "datasource", "query": "prometheus" },
        { "name": "cluster", "type": "query", "datasource": { "type": "prometheus", "uid": "${datasource}" }, "query": "label_values(kube_node_info, cluster)", "refresh": 2 },
        { "name": "namespace", "type": "query", "datasource": { "type": "prometheus", "uid": "${datasource}" }, "query": "label_values(kube_pod_info{cluster=\"$cluster\"}, namespace)", "refresh": 2, "multi": true, "includeAll": true }
      ]
    },
    "panels": [
      {
        "title": "Nodes Ready",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 0, "y": 0 },
        "targets": [{ "expr": "sum(kube_node_status_condition{cluster=\"$cluster\", condition=\"Ready\", status=\"true\"})" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "red", "value": null }, { "color": "green", "value": 1 }] } } }
      },
      {
        "title": "Running Pods",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 4, "y": 0 },
        "targets": [{ "expr": "sum(kube_pod_status_phase{cluster=\"$cluster\", namespace=~\"$namespace\", phase=\"Running\"})" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }] } } }
      },
      {
        "title": "Failed Pods",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 8, "y": 0 },
        "targets": [{ "expr": "sum(kube_pod_status_phase{cluster=\"$cluster\", namespace=~\"$namespace\", phase=\"Failed\"})" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "red", "value": 1 }] } } },
        "options": { "colorMode": "background" }
      },
      {
        "title": "Cluster CPU Utilization",
        "type": "gauge",
        "gridPos": { "h": 4, "w": 4, "x": 12, "y": 0 },
        "targets": [{ "expr": "sum(rate(container_cpu_usage_seconds_total{cluster=\"$cluster\", namespace=~\"$namespace\"}[5m])) / sum(kube_node_status_allocatable{cluster=\"$cluster\", resource=\"cpu\"}) * 100" }],
        "fieldConfig": { "defaults": { "unit": "percent", "min": 0, "max": 100, "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 70 }, { "color": "red", "value": 85 }] } } }
      },
      {
        "title": "Cluster Memory Utilization",
        "type": "gauge",
        "gridPos": { "h": 4, "w": 4, "x": 16, "y": 0 },
        "targets": [{ "expr": "sum(container_memory_working_set_bytes{cluster=\"$cluster\", namespace=~\"$namespace\"}) / sum(kube_node_status_allocatable{cluster=\"$cluster\", resource=\"memory\"}) * 100" }],
        "fieldConfig": { "defaults": { "unit": "percent", "min": 0, "max": 100, "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 70 }, { "color": "red", "value": 85 }] } } }
      },
      {
        "title": "Pod Restarts (1h)",
        "type": "stat",
        "gridPos": { "h": 4, "w": 4, "x": 20, "y": 0 },
        "targets": [{ "expr": "sum(increase(kube_pod_container_status_restarts_total{cluster=\"$cluster\", namespace=~\"$namespace\"}[1h]))" }],
        "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "color": "green", "value": null }, { "color": "yellow", "value": 5 }, { "color": "red", "value": 20 }] } } }
      },
      {
        "title": "CPU Usage by Namespace",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
        "targets": [{ "expr": "sum(rate(container_cpu_usage_seconds_total{cluster=\"$cluster\", namespace=~\"$namespace\", container!=\"\"}[5m])) by (namespace)", "legendFormat": "{{ namespace }}" }],
        "fieldConfig": { "defaults": { "unit": "short", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 20, "stacking": { "mode": "normal" } } } }
      },
      {
        "title": "Memory Usage by Namespace",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
        "targets": [{ "expr": "sum(container_memory_working_set_bytes{cluster=\"$cluster\", namespace=~\"$namespace\", container!=\"\"}) by (namespace)", "legendFormat": "{{ namespace }}" }],
        "fieldConfig": { "defaults": { "unit": "bytes", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 20, "stacking": { "mode": "normal" } } } }
      },
      {
        "title": "Pod Status by Namespace",
        "type": "table",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 12 },
        "targets": [
          { "expr": "sum(kube_pod_status_phase{cluster=\"$cluster\", namespace=~\"$namespace\"}) by (namespace, phase)", "format": "table", "instant": true }
        ],
        "transformations": [
          { "id": "groupBy", "options": { "fields": { "namespace": { "aggregations": [], "operation": "groupby" }, "phase": { "aggregations": [], "operation": "groupby" }, "Value": { "aggregations": ["sum"], "operation": "aggregate" } } } },
          { "id": "organize", "options": { "renameByName": { "Value (sum)": "Count" } } }
        ]
      },
      {
        "title": "Top Pods by CPU",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 12 },
        "targets": [{ "expr": "topk(10, sum(rate(container_cpu_usage_seconds_total{cluster=\"$cluster\", namespace=~\"$namespace\", container!=\"\"}[5m])) by (pod))", "legendFormat": "{{ pod }}" }],
        "fieldConfig": { "defaults": { "unit": "short", "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 5 } } }
      },
      {
        "title": "Node CPU Usage",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 20 },
        "targets": [{ "expr": "100 - (avg by (node) (irate(node_cpu_seconds_total{cluster=\"$cluster\", mode=\"idle\"}[5m])) * 100)", "legendFormat": "{{ node }}" }],
        "fieldConfig": { "defaults": { "unit": "percent", "min": 0, "max": 100, "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "Node Memory Usage",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 20 },
        "targets": [{ "expr": "(1 - node_memory_MemAvailable_bytes{cluster=\"$cluster\"} / node_memory_MemTotal_bytes{cluster=\"$cluster\"}) * 100", "legendFormat": "{{ node }}" }],
        "fieldConfig": { "defaults": { "unit": "percent", "min": 0, "max": 100, "custom": { "drawStyle": "line", "lineWidth": 2, "fillOpacity": 10 } } }
      },
      {
        "title": "OOM Kills",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 28 },
        "targets": [{ "expr": "increase(kube_pod_container_status_last_terminated_reason{cluster=\"$cluster\", namespace=~\"$namespace\", reason=\"OOMKilled\"}[1h])", "legendFormat": "{{ pod }}" }],
        "fieldConfig": { "defaults": { "custom": { "drawStyle": "bars", "lineWidth": 1, "fillOpacity": 80 } } }
      },
      {
        "title": "Deployment Replicas",
        "type": "table",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 28 },
        "targets": [
          { "expr": "kube_deployment_spec_replicas{cluster=\"$cluster\", namespace=~\"$namespace\"}", "format": "table", "instant": true, "legendFormat": "desired" },
          { "expr": "kube_deployment_status_replicas_available{cluster=\"$cluster\", namespace=~\"$namespace\"}", "format": "table", "instant": true, "legendFormat": "available" }
        ]
      }
    ],
    "schemaVersion": 39,
    "version": 1
  }
}
```

## Dashboard Maintenance

### Avoiding Dashboard Rot

Dashboard rot happens when dashboards become outdated, inaccurate, or ignored. Prevent it with:

- **Dashboard ownership**: Every dashboard has an owning team recorded in tags or description
- **Regular reviews**: Quarterly dashboard review sessions — delete or update stale dashboards
- **Automated validation**: CI pipeline that validates dashboard JSON against current metric names
- **Usage tracking**: Grafana analytics to identify dashboards nobody views — candidates for deletion
- **Version control**: All dashboards stored as JSON in Git, deployed via provisioning

### Performance Tips

- Use recording rules for expensive queries instead of computing them in dashboard panels
- Set appropriate `$__rate_interval` or manual intervals instead of letting Grafana auto-select
- Limit the number of series returned per panel (use `topk()` or label filters)
- Use `instant` queries for stat/gauge panels instead of range queries
- Set dashboard refresh interval to 30s or 1m — not 5s — unless real-time monitoring is required
- Use mixed datasource only when necessary; prefer single-datasource dashboards for faster loading
