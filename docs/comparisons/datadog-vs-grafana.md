---
title: "Datadog vs Grafana Stack vs New Relic vs Dynatrace"
description: "Head-to-head comparison of Datadog, Grafana Stack (LGTM), New Relic, and Dynatrace covering pricing models, APM, logs, traces, self-hosted vs SaaS, alerting, dashboards, and total cost of ownership."
tags:
  - comparison
  - datadog
  - grafana
  - new-relic
  - observability
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# Datadog vs Grafana Stack vs New Relic vs Dynatrace

Observability is the most expensive line item that engineering teams underestimate. A wrong choice can mean six-figure annual bills or, worse, blind spots during incidents. This comparison breaks down the four dominant observability platforms across every dimension: pricing, features, operational burden, and the often-ignored total cost of ownership.

## Overview

| Platform | Type | Founded | Core Philosophy |
|---|---|---|---|
| **Datadog** | SaaS only | 2010 | "Unified platform for every signal" |
| **Grafana Stack** | OSS + Cloud | 2014 | "Composable, open-source observability" |
| **New Relic** | SaaS only | 2008 | "All-in-one with generous free tier" |
| **Dynatrace** | SaaS / Managed | 2005 | "AI-powered automatic instrumentation" |

::: tip The Key Trade-off
Datadog, New Relic, and Dynatrace optimize for convenience (SaaS, auto-instrumentation, unified UI). Grafana Stack optimizes for control and cost (open-source, self-hosted option, composable backends). Your choice depends on whether you value operational simplicity or cost control.
:::

## Architecture Comparison

```mermaid
graph TB
    subgraph Datadog
        D1[dd-agent<br/>Host Agent] --> D2[Datadog Intake API]
        D2 --> D3[Metrics Engine]
        D2 --> D4[Log Pipeline]
        D2 --> D5[APM / Traces]
        D3 --> D6[Unified Dashboard<br/>& Alerting]
        D4 --> D6
        D5 --> D6
    end

    subgraph Grafana["Grafana Stack (LGTM)"]
        G1[Grafana Agent / Alloy] --> G2[Loki<br/>Logs]
        G1 --> G3[Mimir<br/>Metrics]
        G1 --> G4[Tempo<br/>Traces]
        G2 --> G5[Grafana<br/>Dashboard]
        G3 --> G5
        G4 --> G5
        G5 --> G6[Alerting<br/>OnCall]
    end

    subgraph NewRelic["New Relic"]
        N1[NR Agent / OTel] --> N2[NRDB<br/>Telemetry DB]
        N2 --> N3[Metrics]
        N2 --> N4[Logs]
        N2 --> N5[Traces]
        N3 --> N6[Unified UI<br/>& AI Insights]
        N4 --> N6
        N5 --> N6
    end

    subgraph Dynatrace
        Y1[OneAgent<br/>Auto-Instrument] --> Y2[Dynatrace Cluster]
        Y2 --> Y3[Smartscape<br/>Topology]
        Y2 --> Y4[Davis AI<br/>Root Cause]
        Y3 --> Y5[Unified Dashboard]
        Y4 --> Y5
    end

    style Datadog fill:#632ca6,color:#fff
    style Grafana fill:#f46800,color:#fff
    style NewRelic fill:#008c99,color:#fff
    style Dynatrace fill:#1496ff,color:#fff
```

## Feature Matrix

| Feature | Datadog | Grafana Stack | New Relic | Dynatrace |
|---|---|---|---|---|
| **Metrics** | Custom metrics, StatsD, DogStatsD | Mimir (Prometheus-compatible) | Dimensional metrics | Built-in + custom |
| **Logs** | Log Management (indexed + archived) | Loki (label-based, no full indexing) | Log Management | Log Management v2 |
| **Traces / APM** | Full APM with profiling | Tempo (Jaeger/Zipkin-compatible) | Distributed tracing | PurePath (auto-instrumented) |
| **Profiling** | Continuous Profiler (built-in) | Pyroscope (acquired) | None (planned) | Code-level profiling |
| **RUM (Real User)** | RUM + Session Replay | Faro (experimental) | Browser monitoring | Real User Monitoring |
| **Synthetics** | Synthetic monitoring | Synthetic monitoring (Cloud) | Synthetic monitoring | Synthetic monitoring |
| **Infrastructure** | 750+ integrations | Prometheus exporters | 700+ integrations | OneAgent auto-discovery |
| **Kubernetes** | Cluster Agent, Helm chart | Native Prometheus + Loki | K8s integration | Full K8s observability |
| **Database monitoring** | DBM (query-level insights) | Plugin-based | None built-in | Database insights |
| **Security** | Cloud Security, ASM, CSPM | None (different tools) | Vulnerability mgmt | Application Security |
| **AI / ML** | Watchdog (anomaly detection) | ML-based alerting (Cloud) | AI-powered alerts | Davis AI (root cause) |
| **Custom dashboards** | Drag-and-drop, 400+ widgets | Grafana (industry standard) | NRQL-powered dashboards | Custom dashboards |
| **Alerting** | Monitors, composite alerts | Grafana Alerting, OnCall | NRQL alert conditions | Davis-powered alerts |
| **SLO tracking** | Built-in SLO management | SLO support (Grafana Cloud) | Service levels (SLI/SLO) | SLO management |
| **OpenTelemetry** | Full OTel support | Native OTel support | Full OTel support | Full OTel support |
| **Self-hosted option** | No | Yes (fully open-source) | No | Managed (on-prem) |
| **Data retention** | 15 days (default) | Configurable (self-hosted) | 8-395 days by data type | 35 days (default) |

## Code & Config Comparison

### Agent Installation

**Datadog:**

```yaml
# Kubernetes DaemonSet via Helm
# helm install datadog datadog/datadog -f values.yaml
apiVersion: v1
kind: Secret
metadata:
  name: datadog-secret
data:
  api-key: <BASE64_ENCODED_KEY>
---
# values.yaml
datadog:
  apiKey: <DATADOG_API_KEY>
  site: datadoghq.com
  logs:
    enabled: true
    containerCollectAll: true
  apm:
    portEnabled: true
  processAgent:
    enabled: true
  networkMonitoring:
    enabled: true
```

**Grafana Stack** (Alloy):

```hcl
// alloy config.alloy
prometheus.scrape "pods" {
  targets    = discovery.kubernetes.pods.targets
  forward_to = [prometheus.remote_write.mimir.receiver]
}

prometheus.remote_write "mimir" {
  endpoint {
    url = "http://mimir:9009/api/v1/push"
  }
}

loki.source.kubernetes "pods" {
  targets    = discovery.kubernetes.pods.targets
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}

otelcol.receiver.otlp "default" {
  grpc { endpoint = "0.0.0.0:4317" }
  http { endpoint = "0.0.0.0:4318" }
  output {
    traces = [otelcol.exporter.otlphttp.tempo.input]
  }
}

otelcol.exporter.otlphttp "tempo" {
  client { endpoint = "http://tempo:4318" }
}
```

**New Relic** (OTel Collector):

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  prometheus:
    config:
      scrape_configs:
        - job_name: 'kubernetes-pods'
          kubernetes_sd_configs:
            - role: pod

exporters:
  otlphttp:
    endpoint: https://otlp.nr-data.net
    headers:
      api-key: ${NEW_RELIC_LICENSE_KEY}

service:
  pipelines:
    metrics:
      receivers: [otlp, prometheus]
      exporters: [otlphttp]
    traces:
      receivers: [otlp]
      exporters: [otlphttp]
    logs:
      receivers: [otlp]
      exporters: [otlphttp]
```

**Dynatrace:**

```bash
# OneAgent installation — fully automatic
# Kubernetes via Helm
helm install dynatrace-operator \
  oci://public.ecr.aws/dynatrace/dynatrace-operator \
  --create-namespace --namespace dynatrace

# DynaKube custom resource
cat <<'DYNA'
apiVersion: dynatrace.com/v1beta2
kind: DynaKube
metadata:
  name: dynakube
  namespace: dynatrace
spec:
  apiUrl: https://{your-environment}.live.dynatrace.com/api
  tokens: dynakube
  oneAgent:
    cloudNativeFullStack:
      image: ""
  activeGate:
    capabilities:
      - routing
      - kubernetes-monitoring
DYNA
```

### Querying Data

**Datadog** (query syntax):

```
# Metrics
avg:system.cpu.user{env:production,service:api} by {host}

# Logs
service:api status:error @http.status_code:500
  | pattern `Error processing request *`
  | stats count by @http.url

# APM
env:production service:api resource_name:GET_/api/users
```

**Grafana** (PromQL + LogQL):

```promql
# Metrics (PromQL)
rate(http_requests_total{job="api",status=~"5.."}[5m])
  / rate(http_requests_total{job="api"}[5m])

# Logs (LogQL)
{namespace="production", container="api"}
  |= "error"
  | json
  | status_code >= 500
  | line_format "{{.method}} {{.path}} - {{.message}}"

# Traces (TraceQL)
{ resource.service.name = "api" && status = error && duration > 500ms }
```

**New Relic** (NRQL):

```sql
-- Metrics
SELECT average(cpuPercent) FROM SystemSample
  WHERE environment = 'production'
  FACET hostname SINCE 1 hour ago

-- Logs
SELECT count(*) FROM Log
  WHERE service = 'api' AND level = 'error'
  FACET message SINCE 1 hour ago TIMESERIES

-- APM
SELECT percentile(duration, 95) FROM Transaction
  WHERE appName = 'api' AND httpResponseCode >= 500
  FACET name SINCE 1 hour ago
```

::: tip Query Language Comparison
NRQL (New Relic) feels the most natural for SQL-literate engineers. PromQL (Grafana) is the most powerful for time-series math. Datadog's query language sits between them. Dynatrace uses DQL (Dynatrace Query Language) which is similar to KQL.
:::

## Performance

### Ingestion & Query Speed

| Metric | Datadog | Grafana Cloud | New Relic | Dynatrace |
|---|---|---|---|---|
| **Metric ingestion rate** | Millions/sec | Millions/sec (Mimir) | Millions/sec | Millions/sec |
| **Log ingestion rate** | Unlimited (pay per GB) | Unlimited (Loki scales horizontally) | Unlimited (pay per GB) | Unlimited |
| **Trace ingestion** | 50 traces/sec/agent (default) | Unlimited (Tempo) | Unlimited | Automatic sampling |
| **Dashboard load time** | <2s (typical) | <3s (typical) | <2s (typical) | <2s (typical) |
| **Alert evaluation** | Every 1 min | Every 1 min (configurable) | Every 1 min | Real-time (Davis AI) |
| **Query timeout** | 60s | Configurable | 60s | 60s |
| **Data retention (default)** | 15 days metrics | 13 months (Cloud) | 8-30 days (varies) | 35 days |

### Cost at Scale (Monthly Estimates)

| Scale | Datadog | Grafana Cloud | New Relic | Dynatrace |
|---|---|---|---|---|
| **5 hosts, basic APM** | ~$300 | ~$50 (Cloud) / $0 (OSS) | $0 (free tier) | ~$500 |
| **50 hosts, full stack** | ~$5,000 | ~$800 (Cloud) | ~$2,000 | ~$8,000 |
| **200 hosts, enterprise** | ~$25,000 | ~$4,000 (Cloud) | ~$12,000 | ~$35,000 |
| **500 hosts, full observability** | ~$70,000 | ~$12,000 (Cloud) | ~$30,000 | ~$90,000 |
| **Self-hosted option** | N/A | $0 (infra costs only) | N/A | N/A |

::: warning Datadog Pricing Surprises
Datadog's pricing is notoriously complex: per-host APM, per-GB logs, per-million custom metrics, per-million indexed spans, per-GB network monitoring — each billed separately. Teams routinely see 2-5x their estimated bill in the first quarter. Always negotiate annual contracts and set ingestion limits.
:::

## Developer Experience

### Strengths

**Datadog:**
- Single pane of glass: metrics, logs, traces, security, RUM — all correlated
- 750+ out-of-the-box integrations with auto-discovery
- Notebooks for collaborative incident investigation
- Watchdog AI surfaces anomalies without manual threshold tuning

**Grafana Stack:**
- Open-source with no vendor lock-in (Loki, Mimir, Tempo are all OSS)
- Grafana dashboards are the gold standard for visualization
- PromQL is the most expressive metrics query language
- Self-hosted option eliminates per-GB and per-host costs

**New Relic:**
- 100 GB/month free forever (best free tier in the industry)
- NRQL is SQL-like and approachable for most engineers
- Errors Inbox for triaging application errors
- Single pricing dimension (per-GB ingested) is predictable

**Dynatrace:**
- OneAgent auto-instruments everything (zero code changes)
- Davis AI performs automatic root cause analysis
- Smartscape topology maps entire environment automatically
- Best-in-class for enterprise Java / .NET applications

### Pain Points

| Platform | Key Frustration |
|---|---|
| **Datadog** | Bills spiral out of control; custom metrics pricing penalizes cardinality |
| **Grafana** | Self-hosting Mimir + Loki + Tempo is operationally expensive; dashboards require manual building |
| **New Relic** | UI can feel overwhelming; some features feel bolted-on rather than integrated |
| **Dynatrace** | Most expensive option; complex licensing (Davis Data Units); legacy UI alongside new |

## When to Use Which

```mermaid
flowchart TD
    A[Need Observability Platform] --> B{Budget constraint?}
    B -->|Cost is critical| C{Have K8s / ops team?}
    B -->|Have budget| D{Team size & skill?}

    C -->|Yes, can run infra| E[Grafana Stack<br/>Self-Hosted]
    C -->|No, small team| F[New Relic<br/>Free Tier]

    D -->|Want single platform, less ops| G{Enterprise Java / .NET?}
    D -->|Want best dashboards| H[Grafana Cloud]

    G -->|Yes, auto-instrumentation critical| I[Dynatrace]
    G -->|No, modern stack| J{Need security + APM + RUM unified?}

    J -->|Yes, everything in one| K[Datadog]
    J -->|No, core observability enough| H

    style K fill:#632ca6,color:#fff
    style H fill:#f46800,color:#fff
    style E fill:#f46800,color:#fff
    style F fill:#008c99,color:#fff
    style I fill:#1496ff,color:#fff
```

### Decision Summary

| Scenario | Recommended Platform |
|---|---|
| Startup, budget-constrained, <100 GB/mo | **New Relic** (free tier) |
| Engineering team wants full control, has ops capacity | **Grafana Stack** (self-hosted) |
| Enterprise wants one vendor for everything | **Datadog** |
| Enterprise Java/.NET, needs auto-instrumentation | **Dynatrace** |
| Kubernetes-native stack, Prometheus already in use | **Grafana Cloud** |
| Security + observability unified | **Datadog** (Cloud Security) |
| Cost-sensitive with moderate scale (50-200 hosts) | **Grafana Cloud** |
| Compliance-heavy industry, on-prem required | **Grafana Stack** or **Dynatrace Managed** |

## Migration

### Datadog to Grafana Stack

```bash
# 1. Deploy Grafana Stack (Docker Compose or Helm)
helm repo add grafana https://grafana.github.io/helm-charts

# Install LGTM stack
helm install mimir grafana/mimir-distributed -n monitoring
helm install loki grafana/loki -n monitoring
helm install tempo grafana/tempo-distributed -n monitoring
helm install grafana grafana/grafana -n monitoring

# 2. Deploy Grafana Alloy (replaces dd-agent)
helm install alloy grafana/alloy -n monitoring -f alloy-values.yaml

# 3. Migrate dashboards
# Export Datadog dashboards via API
curl -s "https://api.datadoghq.com/api/v1/dashboard" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -H "DD-APPLICATION-KEY: $DD_APP_KEY" > dashboards.json

# Use community converter tools to transform
# Datadog dashboard JSON → Grafana dashboard JSON
# Manual adjustment will be needed for queries

# 4. Migrate alerts
# Datadog monitors → Grafana alerting rules
# Query language must be rewritten:
#   Datadog:  avg:system.cpu.user{env:prod}
#   PromQL:   avg(node_cpu_seconds_total{mode="user",env="prod"})

# 5. Run both in parallel for 2-4 weeks
# Compare alert fidelity and dashboard accuracy
```

### Prometheus/Grafana to Grafana Cloud

```bash
# 1. Configure remote_write in existing Prometheus
# prometheus.yml
remote_write:
  - url: https://prometheus-prod-01-xxx.grafana.net/api/prom/push
    basic_auth:
      username: <GRAFANA_CLOUD_INSTANCE_ID>
      password: <GRAFANA_CLOUD_API_KEY>

# 2. Configure Loki for log shipping
# Use Grafana Alloy or Promtail to forward to Grafana Cloud

# 3. Import existing dashboards
# Grafana dashboard JSON is compatible between
# self-hosted and Grafana Cloud (same format)

# 4. Migrate alerting rules
# Export from self-hosted Grafana and import to Cloud
# Alert rules format is identical
```

::: tip Migration Timeline
Budget 2-4 weeks for a migration between observability platforms. The hardest part is not the tooling — it is rewriting queries, rebuilding dashboards, and retraining the team on a new query language. Run both platforms in parallel during transition.
:::

## Verdict

**Datadog** is the most complete observability platform on the market. If budget is not a constraint and you want metrics, logs, traces, RUM, security, database monitoring, and synthetic testing in a single unified UI, Datadog is the answer. But prepare for aggressive pricing.

**Grafana Stack** offers the best value proposition. The open-source LGTM stack (Loki, Grafana, Mimir, Tempo) gives you full observability with no per-host or per-GB licensing. Grafana Cloud removes the operational burden while keeping costs 3-5x lower than Datadog.

**New Relic** has the most generous free tier (100 GB/month) and the most approachable query language (NRQL). It is the best starting point for startups that need full observability without upfront costs.

**Dynatrace** is the premium choice for large enterprises running Java/.NET monoliths. Its automatic instrumentation and AI-powered root cause analysis justify the premium for organizations where manual instrumentation is not feasible.

::: tip Bottom Line
For most teams, **Grafana Cloud** offers the best balance of cost, features, and flexibility. Choose **Datadog** when you need every signal in one platform and have the budget. Start with **New Relic** if you want to ship observability today for $0. Pick **Dynatrace** for enterprise Java/.NET environments where auto-instrumentation is worth the premium.
:::
