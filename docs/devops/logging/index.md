---
title: Logging Overview
description: Logging strategy for production systems — structured logging, correlation IDs, log aggregation, log levels, and sensitive data redaction — building the diagnostic foundation for incident response.
tags:
  - logging
  - observability
  - structured-logging
  - log-aggregation
  - pino
  - winston
difficulty: beginner
prerequisites:
  - devops/monitoring/index
  - Basic understanding of Node.js
lastReviewed: "2026-03-17"
---

# Logging Overview

Logs are the second pillar of observability. Where metrics tell you *what* is happening (error rate is 5%, latency is spiking), logs tell you *why* it is happening (the database connection pool is exhausted because a query is holding connections for 30 seconds due to a missing index).

Logs are also the most abused pillar. Most applications log too much, in the wrong format, without context, and without any strategy for finding relevant entries among millions. This section turns logging from a liability into a diagnostic superpower.

## Why Logging Requires Strategy

A moderately busy service might generate 10,000 log lines per minute. A medium-sized microservice architecture might generate 500,000 lines per minute across all services. Without strategy, you end up with:

- **Unstructured text** that cannot be searched or filtered programmatically
- **Missing context** — a log line says "query failed" but does not say which request, which user, or which query
- **Disconnected services** — logs from Service A and Service B cannot be correlated for the same user request
- **Sensitive data exposure** — PII, passwords, and tokens written to logs that are stored for years
- **Cost explosion** — storing and indexing every log line at every verbosity level
- **Inconsistent levels** — one developer's `DEBUG` is another developer's `INFO`

Each page in this section addresses one of these problems.

## The Logging Stack

A production logging stack has four layers:

```
┌──────────────────────────────────────────────────┐
│                Application Code                   │
│  (Pino/Winston produces structured JSON logs)     │
└────────────────┬─────────────────────────────────┘
                 │ stdout/stderr
                 ▼
┌──────────────────────────────────────────────────┐
│              Log Shipping Agent                    │
│  (Fluent Bit, Fluentd, Promtail, CloudWatch Agent)│
└────────────────┬─────────────────────────────────┘
                 │ forward/push
                 ▼
┌──────────────────────────────────────────────────┐
│              Log Aggregation Backend              │
│  (Elasticsearch, Grafana Loki, CloudWatch Logs)   │
└────────────────┬─────────────────────────────────┘
                 │ query
                 ▼
┌──────────────────────────────────────────────────┐
│             Visualization / Search                 │
│  (Kibana, Grafana, CloudWatch Insights)            │
└──────────────────────────────────────────────────┘
```

### Layer 1: Application Code

The application is responsible for producing structured log output. In Node.js, this means using Pino or Winston configured to output JSON to stdout. The application should:

- Log in structured JSON format (never unstructured text in production)
- Include correlation IDs (trace ID, request ID) in every log line
- Redact sensitive data before it reaches the log output
- Use appropriate log levels

### Layer 2: Log Shipping

A sidecar or agent process collects logs from stdout/stderr and forwards them to the aggregation backend. This layer handles:

- Buffering and batching for network efficiency
- Adding metadata (hostname, container ID, Kubernetes labels)
- Parsing and transformation if needed
- Retry logic for delivery failures

### Layer 3: Log Aggregation

The backend stores, indexes, and makes logs searchable. The two dominant approaches are:

- **Full-text indexing** (Elasticsearch): Index every word in every log line. Powerful search but expensive.
- **Label indexing** (Grafana Loki): Index only labels (service, level, trace ID). Much cheaper, but queries must filter by labels first.

### Layer 4: Visualization

The query interface where engineers search and analyze logs. Key capabilities:

- Full-text search with filtering
- Time range selection
- Log context (show surrounding log lines)
- Live tail (real-time log streaming)
- Integration with metrics and traces (click from a metric spike to related logs)

## Logging Principles

### 1. Log for the Future Debugger

When writing a log statement, imagine yourself at 3 AM debugging a production incident. What information would you need? Include it.

```typescript
// Bad — the future debugger has no context
logger.error('Request failed');

// Good — the future debugger can reproduce and investigate
logger.error({
  msg: 'Payment processing failed',
  orderId: order.id,
  amount: order.total,
  currency: order.currency,
  paymentMethod: order.paymentMethod,
  gatewayResponse: {
    code: response.code,
    message: response.message,
  },
  retryCount: attempt,
  requestDuration: durationMs,
}, 'Payment gateway returned non-success response');
```

### 2. Structured Over Unstructured

Structured (JSON) logs are machine-parseable. Unstructured (text) logs require regex to extract information, and regex breaks when someone changes the log format.

```
// Unstructured — try writing a regex that reliably extracts all fields
2026-03-17 14:32:01 ERROR [OrderService] Failed to process order #12345 for user john@example.com: payment declined (amount: $49.99, method: visa)

// Structured — every field is a named key
{"timestamp":"2026-03-17T14:32:01.000Z","level":"error","service":"OrderService","msg":"Failed to process order","orderId":"12345","userId":"john@example.com","error":"payment declined","amount":49.99,"paymentMethod":"visa"}
```

### 3. Correlation Is Everything

Without correlation IDs, logs from different services are isolated islands of information. With correlation IDs, you can reconstruct the entire journey of a request across every service it touched.

### 4. Log Levels Are a Contract

Each log level has a specific meaning. When a level means different things to different developers, log filtering becomes useless. Define and enforce the meaning of each level across the team.

### 5. Redaction Is Not Optional

Logs are stored for weeks or months, often in systems with broad access. Any sensitive data in a log line is a compliance violation waiting to happen.

## What to Read Next

| Page | What You Will Learn |
|---|---|
| [Structured Logging](/devops/logging/structured-logging) | JSON logging, log schema design, Winston and Pino configuration for Node.js, context propagation |
| [Correlation IDs](/devops/logging/correlation-ids) | Request ID generation, propagation across services, AsyncLocalStorage in Node.js, distributed tracing correlation |
| [Log Aggregation](/devops/logging/log-aggregation) | ELK stack, Grafana Loki, CloudWatch Logs, Fluentd/Fluent Bit, cost analysis |
| [Log Levels Strategy](/devops/logging/log-levels-strategy) | What goes at each level, dynamic level changing, log sampling |
| [Sensitive Data Redaction](/devops/logging/sensitive-data-redaction) | PII detection, automatic redaction middleware, masking strategies, GDPR/HIPAA compliance |

## Key Decision: Which Logger?

For Node.js applications, the choice is between Pino and Winston:

| Aspect | Pino | Winston |
|---|---|---|
| **Performance** | ~5x faster (benchmark: 30,000 logs/sec vs 6,000) | Slower but adequate for most applications |
| **Output format** | JSON by default | Configurable (JSON, text, custom) |
| **Transports** | Separate process (pino-pretty, pino-file) | In-process (Console, File, HTTP) |
| **Ecosystem** | Focused, lean | Larger ecosystem of transports |
| **Philosophy** | Fast, opinionated, minimal | Flexible, configurable |

**Recommendation:** Use Pino for production services where performance matters. Use Winston when you need maximum transport flexibility or are working with a team already familiar with Winston.

## Quick Start: Minimum Viable Logging

If you are starting from scratch, implement these five things first:

1. **Structured JSON logging** — Configure Pino with JSON output
2. **Request ID middleware** — Generate a UUID for each request, attach it to every log line
3. **Error logging** — Log all unhandled errors with stack traces and context
4. **Log shipping** — Send logs to a central location (even CloudWatch is better than local files)
5. **Log level filtering** — Default to `info` in production, `debug` in development

This gets you from zero to useful in an afternoon. The remaining pages in this section take you from useful to excellent.
