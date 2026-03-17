---
title: Monitoring Overview
description: The three pillars of observability — metrics, logs, and traces — and how to build a monitoring strategy that moves your team from reactive firefighting to proactive reliability engineering.
tags:
  - monitoring
  - observability
  - metrics
  - logs
  - traces
  - prometheus
  - grafana
difficulty: beginner
prerequisites:
  - Basic understanding of distributed systems
  - Familiarity with HTTP and APIs
lastReviewed: "2026-03-17"
---

# Monitoring Overview

Monitoring is not about dashboards. Dashboards are a side effect. Monitoring is about building the feedback loops that tell you whether your system is doing what your users expect it to do. Without monitoring, you are flying blind — every deploy is a leap of faith and every outage is a surprise.

This section covers the full monitoring stack: from instrumenting your code to collecting metrics, from designing dashboards that people actually look at to writing alerts that people actually respond to.

## The Three Pillars of Observability

Observability is the ability to understand the internal state of a system by examining its external outputs. The three canonical outputs are metrics, logs, and traces. Each pillar has a distinct role, and none is sufficient on its own.

### Metrics

Metrics are numeric measurements collected at regular intervals. They answer questions like "how many requests per second are we serving?" and "what is the 99th percentile latency?" Metrics are the cheapest form of telemetry to store and query, and they should be your first line of defense.

Metrics excel at:
- **Trend detection** — is latency increasing over the past hour?
- **Threshold alerting** — is error rate above 1%?
- **Capacity planning** — at current growth rate, when will we run out of disk?
- **SLO tracking** — are we meeting our 99.9% availability target?

Metrics are weak at:
- **Root cause analysis** — they tell you *what* is broken, not *why*
- **Ad hoc investigation** — you can only query dimensions you instrumented
- **Individual request debugging** — metrics are aggregates, not individual events

The dominant open-source metrics stack is **Prometheus** for collection and storage, **Grafana** for visualization, and **Alertmanager** for alert routing.

### Logs

Logs are discrete events emitted by your application. They answer questions like "why did this request fail?" and "what was the database query that caused the timeout?" Logs are the richest form of telemetry but also the most expensive to store, index, and query.

Logs excel at:
- **Root cause analysis** — the stack trace tells you exactly what went wrong
- **Audit trails** — who did what, when
- **Debugging individual requests** — full context for a specific failure
- **Compliance** — regulatory requirements often mandate log retention

Logs are weak at:
- **Trend detection** — counting log lines is a poor substitute for metrics
- **Cross-service correlation** — without correlation IDs, logs from different services are disconnected
- **Real-time alerting** — log-based alerting is slower and more brittle than metric-based alerting

The dominant stacks are the **ELK stack** (Elasticsearch, Logstash, Kibana) and **Grafana Loki** (which indexes labels rather than full text, dramatically reducing cost).

### Traces

Traces follow a single request as it propagates through multiple services. They answer questions like "which service added the most latency to this request?" and "did the request fan out to all expected downstream services?" Traces are essential in microservice architectures where a single user action might touch dozens of services.

Traces excel at:
- **Latency attribution** — which service is the bottleneck?
- **Dependency mapping** — which services talk to which?
- **Error propagation** — where in the chain did the failure originate?
- **Fan-out analysis** — is the request making too many downstream calls?

Traces are weak at:
- **Aggregate analysis** — traces are individual events, not summaries
- **Storage efficiency** — tracing every request is prohibitively expensive at scale
- **Simple architectures** — if you have one monolith, traces add overhead without much benefit

The dominant standard is **OpenTelemetry**, which provides vendor-neutral instrumentation SDKs for all three pillars. Common backends include **Jaeger**, **Zipkin**, **Grafana Tempo**, and **AWS X-Ray**.

## How the Pillars Connect

The real power of observability comes when you connect the pillars together:

1. **A metric alert fires** — error rate on the checkout service exceeded 5%
2. **You look at logs** filtered by the checkout service and the time window — you see `ConnectionRefusedError` for the payment gateway
3. **You pull a trace** for a failing request — you see the checkout service calling the payment gateway, which is timing out after 30 seconds because it is waiting on a database query
4. **You check database metrics** — connection pool utilization is at 100%, confirming connection exhaustion

This workflow — metrics for detection, logs for diagnosis, traces for localization — is the foundation of effective incident response.

### Connecting Metrics to Traces with Exemplars

Exemplars are a Prometheus feature that attaches a trace ID to a specific metric observation. When you see a latency spike on a dashboard, you can click through to an actual trace that contributed to that spike, bridging the gap between aggregate metrics and individual request traces.

### Connecting Logs to Traces with Correlation IDs

Every log line should include a trace ID and span ID. When you find a relevant log entry, you can jump directly to the full distributed trace. When you find a slow span in a trace, you can jump to the logs emitted during that span.

## Monitoring Strategy by System Maturity

| Maturity | What to Instrument | Tools |
|---|---|---|
| **Day 1** | Health checks, uptime monitoring, error rates | Prometheus + Grafana, or a SaaS like Datadog |
| **Month 1** | RED metrics for every service, structured logging | Prometheus, Pino/Winston, ELK or Loki |
| **Month 3** | SLOs, distributed tracing, custom business metrics | OpenTelemetry, Jaeger/Tempo, error budgets |
| **Month 6** | Exemplars, log-to-trace correlation, anomaly detection | Full observability stack integrated |
| **Year 1** | Chaos engineering validation of monitoring coverage | Litmus/Gremlin, GameDays |

## What to Read Next

| Page | What You Will Learn |
|---|---|
| [Prometheus Deep Dive](/devops/monitoring/prometheus-deep-dive) | Architecture, PromQL, metric types, recording rules, alerting rules, federation, long-term storage |
| [Grafana Dashboards](/devops/monitoring/grafana-dashboards) | Dashboard design, panel types, variables, provisioning dashboards as code, production JSON configs |
| [Metrics Design](/devops/monitoring/metrics-design) | RED method, USE method, Four Golden Signals, SLIs/SLOs/SLAs, error budgets, burn rate alerting |
| [Custom Metrics](/devops/monitoring/custom-metrics) | Business metrics, application instrumentation, naming conventions, label cardinality, exemplars |
| [Monitoring Antipatterns](/devops/monitoring/monitoring-antipatterns) | Dashboard rot, alert fatigue, vanity metrics, high-cardinality labels, cargo cult monitoring |

## Key Takeaways

- Monitoring is not optional. It is the difference between "we detected and resolved the issue in 3 minutes" and "a customer tweeted about our outage."
- Metrics, logs, and traces each serve a distinct purpose. You need all three, connected together.
- Start with metrics. They are the cheapest to implement and provide the fastest feedback loop.
- Invest in correlation — trace IDs in logs, exemplars in metrics — so you can move seamlessly between pillars during an incident.
- Monitoring is never "done." Every incident should result in better monitoring coverage. If an incident surprised you, your monitoring has a gap.
