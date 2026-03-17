---
title: Log Aggregation
description: Complete comparison of log aggregation solutions — ELK stack (Elasticsearch, Logstash, Kibana), Grafana Loki with LogQL, CloudWatch Logs, Fluentd and Fluent Bit — with architecture diagrams, configuration examples, and cost analysis.
tags:
  - log-aggregation
  - elk
  - elasticsearch
  - loki
  - logql
  - fluentd
  - fluent-bit
  - cloudwatch
  - kibana
difficulty: intermediate
prerequisites:
  - devops/logging/index
  - devops/logging/structured-logging
  - Basic understanding of distributed systems
lastReviewed: "2026-03-17"
---

# Log Aggregation

A log aggregation system collects logs from dozens or hundreds of services, stores them in a searchable format, and provides a query interface for engineers to find the information they need during incidents. Without log aggregation, debugging a production issue means SSH-ing into individual servers and running `grep` — a process that does not scale beyond a single server.

This guide covers the four major log aggregation approaches, their architectures, configuration, query languages, and — critically — their cost profiles.

## Architecture Overview

Every log aggregation system follows the same pattern:

```
Sources          →  Shipping         →  Aggregation      →  Query/UI
─────────────────────────────────────────────────────────────────────
Application logs    Fluent Bit           Elasticsearch       Kibana
System logs         Fluentd              Grafana Loki        Grafana
Container logs      Logstash             CloudWatch Logs     CloudWatch
Audit logs          Promtail             Datadog             Datadog UI
                    CloudWatch Agent     Splunk              Splunk
```

The key architectural decisions are:

1. **What ships the logs?** (Agent running on each node)
2. **How are logs indexed?** (Full-text vs label-only)
3. **Where are logs stored?** (Self-hosted vs cloud-managed)
4. **How much does it cost?** (Often the deciding factor)

## ELK Stack (Elasticsearch, Logstash, Kibana)

The ELK stack is the most established open-source log aggregation solution. It provides full-text indexing of every log line, enabling powerful free-form searches.

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────┐
│ Application  │     │ Fluent Bit  │     │  Logstash    │     │ Elastic- │
│ (stdout)     │────▶│ (sidecar    │────▶│  (pipeline   │────▶│ search   │
│              │     │  or daemon) │     │  processing) │     │ (index   │
└─────────────┘     └─────────────┘     └──────────────┘     │  & store)│
                                                              └────┬─────┘
                                                                   │
                                                              ┌────▼─────┐
                                                              │ Kibana   │
                                                              │ (query & │
                                                              │  visualize)
                                                              └──────────┘
```

**Simplified architecture (without Logstash):**

For many deployments, Logstash is unnecessary. Fluent Bit can send directly to Elasticsearch:

```
Application → Fluent Bit → Elasticsearch → Kibana
```

### Elasticsearch Configuration

```yaml
# elasticsearch.yml
cluster.name: production-logs
node.name: es-node-1
network.host: 0.0.0.0
discovery.seed_hosts: ["es-node-1", "es-node-2", "es-node-3"]
cluster.initial_master_nodes: ["es-node-1", "es-node-2", "es-node-3"]

# Index lifecycle management
xpack.ilm.enabled: true

# Storage
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch

# Memory
bootstrap.memory_lock: true
```

### Index Lifecycle Policy

```json
PUT _ilm/policy/logs-lifecycle
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_primary_shard_size": "50gb",
            "max_age": "1d"
          },
          "set_priority": {
            "priority": 100
          }
        }
      },
      "warm": {
        "min_age": "2d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          },
          "forcemerge": {
            "max_num_segments": 1
          },
          "set_priority": {
            "priority": 50
          }
        }
      },
      "cold": {
        "min_age": "7d",
        "actions": {
          "set_priority": {
            "priority": 0
          },
          "allocate": {
            "number_of_replicas": 0
          }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

### Index Template

```json
PUT _index_template/logs
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "index.lifecycle.name": "logs-lifecycle",
      "index.lifecycle.rollover_alias": "logs"
    },
    "mappings": {
      "properties": {
        "timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "service": { "type": "keyword" },
        "environment": { "type": "keyword" },
        "msg": { "type": "text" },
        "requestId": { "type": "keyword" },
        "traceId": { "type": "keyword" },
        "userId": { "type": "keyword" },
        "statusCode": { "type": "integer" },
        "duration": { "type": "integer" },
        "error": {
          "properties": {
            "message": { "type": "text" },
            "type": { "type": "keyword" },
            "stack": { "type": "text", "index": false },
            "code": { "type": "keyword" }
          }
        }
      }
    }
  }
}
```

### Kibana Query Examples

```
# Search by request ID
requestId: "req_7f3a2b1c"

# Search errors in a specific service
level: "error" AND service: "order-service"

# Search for a specific error message
error.message: "ECONNREFUSED" AND environment: "production"

# Time range + service + level
service: "payment-service" AND level: ("error" OR "warn") AND @timestamp >= "2026-03-17T14:00:00"

# Full-text search across all fields
"connection pool exhausted"

# Status code range
statusCode >= 500 AND statusCode < 600

# Slow requests
duration > 5000 AND service: "api-gateway"
```

### ELK Strengths and Weaknesses

**Strengths:**
- Full-text search across every field in every log line
- Powerful aggregation engine (log analytics, not just log search)
- Mature ecosystem with extensive documentation
- Kibana provides excellent visualization and dashboard capabilities
- Supports complex queries with boolean logic, wildcards, and regex

**Weaknesses:**
- Resource-intensive: requires significant CPU, memory, and disk
- Operational complexity: managing Elasticsearch clusters is non-trivial
- Cost: indexing every word in every log line is expensive at scale
- JVM-based: requires tuning heap size, GC, and other JVM parameters
- Scaling is complex: shard management, rebalancing, cluster state

## Grafana Loki

Loki is a log aggregation system designed by Grafana Labs as a "Prometheus, but for logs." Its key innovation is that it indexes only labels (service, level, pod name) rather than the full text of log lines. This dramatically reduces storage and compute costs.

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────┐
│ Application  │     │ Promtail    │     │  Loki        │     │ Grafana  │
│ (stdout)     │────▶│ (agent,     │────▶│  (label      │◀────│ (query & │
│              │     │  discovers  │     │   index +    │     │  visualize)
└─────────────┘     │  & ships)   │     │   chunk store)│     └──────────┘
                    └─────────────┘     └──────────────┘
```

**Loki's storage model:**

```
Label Index (small, fast):
  {service="order-service", level="error"}  →  chunk_001, chunk_002

Chunk Store (large, cheap):
  chunk_001: [timestamp] [log line] [timestamp] [log line] ...
  chunk_002: [timestamp] [log line] [timestamp] [log line] ...

Chunks are stored in object storage (S3, GCS) — very cheap.
The index is small and can be stored in DynamoDB, Cassandra, or BoltDB.
```

### Loki Configuration

```yaml
# loki-config.yml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2020-10-24
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  max_query_length: 721h
  max_query_parallelism: 32

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100
```

### Loki Production Configuration (S3 Backend)

```yaml
# loki-config-production.yml
auth_enabled: true

server:
  http_listen_port: 3100

common:
  replication_factor: 3
  ring:
    kvstore:
      store: consul
      consul:
        host: consul:8500

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: s3
      schema: v13
      index:
        prefix: loki_index_
        period: 24h

storage_config:
  aws:
    s3: s3://us-east-1/loki-logs-bucket
    s3forcepathstyle: false

  tsdb_shipper:
    active_index_directory: /loki/tsdb-index
    cache_location: /loki/tsdb-cache

limits_config:
  ingestion_rate_mb: 10
  ingestion_burst_size_mb: 20
  per_stream_rate_limit: 5MB
  max_query_series: 5000
  max_entries_limit_per_query: 10000
  retention_period: 720h  # 30 days

compactor:
  working_directory: /loki/compactor
  compaction_interval: 10m
  retention_enabled: true
  retention_delete_delay: 2h
  retention_delete_worker_count: 150
```

### Promtail Configuration

```yaml
# promtail-config.yml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push
    batchwait: 1s
    batchsize: 1048576
    tenant_id: default

scrape_configs:
  # Scrape Kubernetes pods
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    pipeline_stages:
      # Parse JSON logs
      - json:
          expressions:
            level: level
            service: service
            msg: msg
            requestId: requestId
            traceId: traceId
            timestamp: timestamp
      # Set timestamp from log line
      - timestamp:
          source: timestamp
          format: RFC3339Nano
      # Extract labels from parsed fields
      - labels:
          level:
          service:
      # Keep only specific labels (control cardinality)
      - label_drop:
          - filename
          - stream
    relabel_configs:
      - source_labels: ['__meta_kubernetes_pod_label_app']
        target_label: app
      - source_labels: ['__meta_kubernetes_namespace']
        target_label: namespace
      - source_labels: ['__meta_kubernetes_pod_name']
        target_label: pod
```

### LogQL Query Language

LogQL is Loki's query language. It is inspired by PromQL and operates in two modes: log queries (return log lines) and metric queries (return computed values from logs).

**Log stream selectors (filtering by labels):**

```logql
# Exact match
{service="order-service"}

# Regex match
{service=~"order-.*"}

# Negation
{service!="health-check"}

# Multiple labels (AND)
{service="order-service", level="error"}

# Environment + service
{environment="production", service="payment-service", level=~"error|warn"}
```

**Log pipeline (filtering and parsing log lines):**

```logql
# Filter by content (grep equivalent)
{service="order-service"} |= "connection refused"

# Negative filter (exclude lines)
{service="order-service"} != "health check"

# Regex filter
{service="order-service"} |~ "status_code=[45]\\d{2}"

# JSON parsing
{service="order-service"} | json | requestId="req_7f3a2b1c"

# JSON parsing + field filtering
{service="order-service"} | json | duration > 5000

# Line format (reformat output)
{service="order-service"} | json | line_format "{{.timestamp}} [{{.level}}] {{.msg}} ({{.duration}}ms)"

# Multiple stages
{service="order-service", level="error"}
  | json
  | error_code != ""
  | line_format "{{.timestamp}} {{.error_code}}: {{.error_message}}"
```

**Metric queries (compute values from logs):**

```logql
# Count error log lines per second
rate({service="order-service", level="error"}[5m])

# Count log lines matching a pattern
count_over_time({service="order-service"} |= "timeout" [1h])

# Average request duration from log lines
avg_over_time(
  {service="order-service"} | json | unwrap duration [5m]
) by (route)

# P95 duration from log lines
quantile_over_time(0.95,
  {service="order-service"} | json | unwrap duration [5m]
) by (route)

# Top 5 services by error rate
topk(5,
  sum(rate({level="error"}[5m])) by (service)
)

# Bytes rate (how much log volume per service)
sum(bytes_rate({service=~".+"}[5m])) by (service)
```

### Loki Strengths and Weaknesses

**Strengths:**
- 10-50x cheaper than Elasticsearch at scale (label indexing only)
- Object storage backend (S3, GCS) — near-infinite capacity at low cost
- Integrates seamlessly with Grafana (same UI for metrics, logs, and traces)
- Multi-tenancy built in
- Simple to operate compared to Elasticsearch
- LogQL provides powerful filtering and aggregation

**Weaknesses:**
- No full-text indexing — you must filter by labels first, then grep
- Queries can be slow if you do not narrow by labels (scanning all chunks)
- Less mature than Elasticsearch
- Fewer search features (no fuzzy matching, no relevance scoring)
- Query performance depends heavily on label cardinality design

## CloudWatch Logs

AWS CloudWatch Logs is a fully managed log aggregation service. No infrastructure to manage.

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│ Application  │     │ CloudWatch   │     │ CloudWatch    │
│ (stdout/SDK) │────▶│ Agent        │────▶│ Logs          │
│              │     │ or Fluent Bit│     │               │
└─────────────┘     └──────────────┘     │ ┌───────────┐ │
                                         │ │ Log Groups│ │
                                         │ │ Log Stream│ │
                                         │ └───────────┘ │
                                         └───────┬───────┘
                                                 │
                                         ┌───────▼───────┐
                                         │ CloudWatch    │
                                         │ Insights      │
                                         │ (query engine)│
                                         └───────────────┘
```

### CloudWatch Logs Insights Queries

```sql
-- Find errors in a service
fields @timestamp, @message
| filter service = 'order-service' and level = 'error'
| sort @timestamp desc
| limit 100

-- Count errors by service
fields service
| filter level = 'error'
| stats count(*) as errorCount by service
| sort errorCount desc

-- Average duration by route
fields route, duration
| filter service = 'api-gateway'
| stats avg(duration) as avgDuration, p95(duration) as p95Duration, count(*) as requestCount by route
| sort p95Duration desc

-- Find slow requests
fields @timestamp, service, route, duration, requestId
| filter duration > 5000
| sort duration desc
| limit 50

-- Error rate over time (15-minute buckets)
fields @timestamp
| filter service = 'order-service'
| stats count(*) as total,
        sum(level = 'error') as errors
        by bin(15m)
| sort @timestamp desc
```

### CloudWatch Strengths and Weaknesses

**Strengths:**
- Zero infrastructure to manage
- Native integration with AWS services (Lambda, ECS, EKS, EC2)
- CloudWatch Insights provides SQL-like queries
- Automatic scaling
- Cross-account log aggregation
- Metric filters (create CloudWatch metrics from log patterns)

**Weaknesses:**
- AWS vendor lock-in
- CloudWatch Insights query syntax is limited compared to Kibana or LogQL
- Can become expensive at high volume (ingestion + storage + query charges)
- UI is less polished than Kibana or Grafana
- Query performance can be slow for large log groups
- No native correlation with non-AWS tracing systems

## Log Shipping: Fluentd vs Fluent Bit

Both are CNCF projects for log collection and forwarding. Fluent Bit is the lightweight successor to Fluentd.

### Comparison

| Aspect | Fluentd | Fluent Bit |
|---|---|---|
| **Language** | Ruby + C | C |
| **Memory footprint** | ~40 MB | ~1 MB |
| **Performance** | Good | Excellent (10x throughput) |
| **Plugin ecosystem** | 1000+ plugins | Fewer but growing |
| **Use case** | Aggregator node | Per-node sidecar/agent |
| **Kubernetes** | DaemonSet aggregator | DaemonSet collector |
| **Configuration** | Ruby DSL | INI-like |

### Fluent Bit Configuration

```ini
# fluent-bit.conf
[SERVICE]
    Flush         1
    Log_Level     info
    Daemon        off
    Parsers_File  parsers.conf
    HTTP_Server   On
    HTTP_Listen   0.0.0.0
    HTTP_Port     2020

# Read container logs from Kubernetes
[INPUT]
    Name              tail
    Tag               kube.*
    Path              /var/log/containers/*.log
    Parser            cri
    DB                /var/log/flb_kube.db
    Mem_Buf_Limit     5MB
    Skip_Long_Lines   On
    Refresh_Interval  10

# Enrich with Kubernetes metadata
[FILTER]
    Name                kubernetes
    Match               kube.*
    Kube_URL            https://kubernetes.default.svc:443
    Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
    Merge_Log           On
    Merge_Log_Key       log_processed
    K8S-Logging.Parser  On
    K8S-Logging.Exclude On

# Parse JSON log lines
[FILTER]
    Name    parser
    Match   kube.*
    Key_Name log
    Parser  json
    Reserve_Data On

# Output to Loki
[OUTPUT]
    Name        loki
    Match       kube.*
    Host        loki.monitoring.svc.cluster.local
    Port        3100
    Labels      job=fluent-bit
    Label_keys  $service,$level,$namespace,$pod
    Remove_keys kubernetes,stream,logtag

# Output to Elasticsearch (alternative)
[OUTPUT]
    Name            es
    Match           kube.*
    Host            elasticsearch.monitoring.svc.cluster.local
    Port            9200
    Index           logs
    Type            _doc
    Logstash_Format On
    Logstash_Prefix logs
    Retry_Limit     5
    Buffer_Size     5MB
```

```ini
# parsers.conf
[PARSER]
    Name        json
    Format      json
    Time_Key    timestamp
    Time_Format %Y-%m-%dT%H:%M:%S.%LZ

[PARSER]
    Name        cri
    Format      regex
    Regex       ^(?<time>[^ ]+) (?<stream>stdout|stderr) (?<logtag>[^ ]*) (?<log>.*)$
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%L%z
```

### Fluentd Configuration

```xml
<!-- fluentd.conf -->
<source>
  @type forward
  port 24224
  bind 0.0.0.0
</source>

<filter **>
  @type parser
  key_name log
  reserve_data true
  <parse>
    @type json
  </parse>
</filter>

<!-- Add hostname and tag -->
<filter **>
  @type record_transformer
  <record>
    hostname "#{Socket.gethostname}"
    tag ${tag}
  </record>
</filter>

<!-- Route based on log level -->
<match **>
  @type copy

  <!-- All logs to Elasticsearch -->
  <store>
    @type elasticsearch
    host elasticsearch.internal
    port 9200
    index_name logs
    logstash_format true
    logstash_prefix logs
    <buffer>
      @type memory
      flush_interval 5s
      chunk_limit_size 5m
      total_limit_size 256m
    </buffer>
  </store>

  <!-- Error logs also to a dedicated error index -->
  <store>
    @type elasticsearch
    host elasticsearch.internal
    port 9200
    index_name errors
    logstash_format true
    logstash_prefix errors
    <buffer tag>
      @type memory
      flush_interval 1s
    </buffer>
    <filter>
      @type grep
      <regexp>
        key level
        pattern ^(error|fatal)$
      </regexp>
    </filter>
  </store>
</match>
```

## Cost Comparison

Cost is often the deciding factor. Here is a realistic comparison for a medium-sized deployment:

**Assumptions:** 50 services, 10 GB/day log ingestion, 30-day retention.

| Solution | Monthly Cost | Notes |
|---|---|---|
| **ELK (self-hosted, 3-node)** | $800-1,500 | 3 × r6g.xlarge EC2 + EBS storage |
| **Elastic Cloud (managed)** | $1,200-2,500 | Based on deployment size and data transfer |
| **Grafana Loki (self-hosted)** | $200-500 | Small compute + S3 storage ($0.023/GB) |
| **Grafana Cloud (managed Loki)** | $400-800 | Based on ingested log volume |
| **CloudWatch Logs** | $600-1,200 | Ingestion ($0.50/GB) + storage ($0.03/GB/month) + queries |
| **Datadog** | $2,000-5,000 | Ingestion ($0.10/GB) + retention + per-host pricing |
| **Splunk Cloud** | $3,000-10,000 | License based on daily ingestion volume |

**Key cost drivers:**
- **Ingestion rate**: How much log data per day
- **Retention period**: How long you keep logs
- **Query volume**: How often engineers search logs
- **Indexing depth**: Full-text vs label-only

### Cost Optimization Strategies

1. **Filter at the source**: Use log levels to exclude `debug` and `trace` in production
2. **Sample high-volume logs**: For health checks or repetitive events, log 1% instead of 100%
3. **Use Loki instead of ELK**: If full-text search is not critical, Loki's label-only indexing is dramatically cheaper
4. **Tiered retention**: Keep recent logs in fast storage, move old logs to cold storage or delete them
5. **Structured logging**: Properly structured logs require less indexing compute
6. **Drop noisy logs**: Health check logs, readiness probe logs, and Kubernetes system logs often dominate volume with zero diagnostic value

## Choosing the Right Solution

| If you need... | Choose... | Because... |
|---|---|---|
| Full-text search across all log content | ELK / Elastic Cloud | Full inverted index on every field |
| Cost-effective logging at scale | Grafana Loki | Label-only indexing, S3 backend |
| Zero infrastructure management on AWS | CloudWatch Logs | Fully managed, native AWS integration |
| Unified metrics + logs + traces UI | Grafana Loki + Tempo + Prometheus | All in Grafana |
| Enterprise features and support | Datadog or Splunk | Comprehensive platform, premium support |
| Simple setup for a small team | Grafana Cloud | Managed Loki + Grafana, generous free tier |

**Recommendation for most teams:** Start with Grafana Loki. It handles 80% of use cases at 20% of the cost. If you find yourself needing full-text search frequently (not just label filtering + grep), evaluate Elasticsearch for specific high-value log streams while keeping Loki for everything else.
