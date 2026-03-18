---
title: "Job Queue Monitoring"
description: "Queue depth metrics, Prometheus integration, Grafana dashboards, and alerting thresholds for BullMQ"
tags: [bullmq, monitoring, prometheus, grafana, metrics, alerting, observability]
difficulty: "advanced"
prerequisites: [job-queue/architecture]
lastReviewed: "2026-03-18"
---

# Job Queue Monitoring

## What to Monitor

Queue monitoring has four signal layers:

1. **Queue depth signals** — are jobs accumulating faster than processing?
2. **Throughput signals** — jobs processed per second (trend, not just current)
3. **Latency signals** — time from enqueue to completion
4. **Error signals** — failure rate, DLQ depth, stalled jobs

The most important metric is **queue depth trend**: a queue that's slowly growing is a future incident. A queue that's stable (even at high depth) is fine.

## Prometheus Metrics Collection

### BullMQ Prometheus Exporter

```typescript
// src/monitoring/queue-metrics.ts
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import {
  Gauge,
  Counter,
  Histogram,
  register,
} from 'prom-client';

interface QueueMetricSet {
  depth: Gauge;
  active: Gauge;
  completed: Gauge;
  failed: Gauge;
  delayed: Gauge;
  waiting: Gauge;
  throughput: Counter;
  latency: Histogram;
  errorRate: Counter;
  stalledCount: Counter;
}

export class QueueMetricsCollector {
  private metrics: Map<string, QueueMetricSet> = new Map();
  private queues: Queue[];
  private collectInterval: NodeJS.Timeout | null = null;

  constructor(queues: Queue[]) {
    this.queues = queues;

    for (const queue of queues) {
      this.metrics.set(queue.name, this.createMetricSet(queue.name));
    }
  }

  private createMetricSet(queueName: string): QueueMetricSet {
    const labels = { queue: queueName };
    const labelNames = ['queue'];

    return {
      depth: new Gauge({
        name: `bullmq_queue_depth`,
        help: 'Total number of jobs in queue (waiting + delayed)',
        labelNames,
        registers: [register],
      }),

      active: new Gauge({
        name: `bullmq_queue_active`,
        help: 'Number of jobs currently being processed',
        labelNames,
        registers: [register],
      }),

      completed: new Gauge({
        name: `bullmq_queue_completed`,
        help: 'Number of jobs in completed state',
        labelNames,
        registers: [register],
      }),

      failed: new Gauge({
        name: `bullmq_queue_failed`,
        help: 'Number of jobs in failed state',
        labelNames,
        registers: [register],
      }),

      delayed: new Gauge({
        name: `bullmq_queue_delayed`,
        help: 'Number of delayed jobs',
        labelNames,
        registers: [register],
      }),

      waiting: new Gauge({
        name: `bullmq_queue_waiting`,
        help: 'Number of jobs waiting to be processed',
        labelNames,
        registers: [register],
      }),

      throughput: new Counter({
        name: `bullmq_jobs_processed_total`,
        help: 'Total number of jobs processed',
        labelNames: ['queue', 'status'],
        registers: [register],
      }),

      latency: new Histogram({
        name: `bullmq_job_duration_seconds`,
        help: 'Job processing duration in seconds',
        labelNames: ['queue', 'job_name'],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
        registers: [register],
      }),

      errorRate: new Counter({
        name: `bullmq_job_failures_total`,
        help: 'Total number of job failures',
        labelNames: ['queue', 'job_name', 'error_type'],
        registers: [register],
      }),

      stalledCount: new Counter({
        name: `bullmq_stalled_jobs_total`,
        help: 'Total number of stalled jobs detected',
        labelNames: ['queue'],
        registers: [register],
      }),
    };
  }

  async collectMetrics(): Promise<void> {
    await Promise.all(
      this.queues.map(async (queue) => {
        const m = this.metrics.get(queue.name);
        if (!m) return;

        try {
          const [waiting, active, completed, failed, delayed] =
            await Promise.all([
              queue.getWaitingCount(),
              queue.getActiveCount(),
              queue.getCompletedCount(),
              queue.getFailedCount(),
              queue.getDelayedCount(),
            ]);

          const labels = { queue: queue.name };
          m.depth.set(labels, waiting + delayed);
          m.active.set(labels, active);
          m.completed.set(labels, completed);
          m.failed.set(labels, failed);
          m.delayed.set(labels, delayed);
          m.waiting.set(labels, waiting);
        } catch (err) {
          console.error(`[Metrics] Failed to collect metrics for ${queue.name}:`, err);
        }
      })
    );
  }

  startCollection(intervalMs = 15_000): void {
    this.collectInterval = setInterval(
      () => this.collectMetrics(),
      intervalMs
    );
    // Collect immediately on start
    void this.collectMetrics();
  }

  stopCollection(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = null;
    }
  }

  // Record job completion (call from worker event handlers)
  recordCompletion(queueName: string, jobName: string, durationMs: number): void {
    const m = this.metrics.get(queueName);
    if (!m) return;

    m.throughput.inc({ queue: queueName, status: 'completed' });
    m.latency.observe(
      { queue: queueName, job_name: jobName },
      durationMs / 1000
    );
  }

  recordFailure(
    queueName: string,
    jobName: string,
    errorType: string
  ): void {
    const m = this.metrics.get(queueName);
    if (!m) return;

    m.throughput.inc({ queue: queueName, status: 'failed' });
    m.errorRate.inc({ queue: queueName, job_name: jobName, error_type: errorType });
  }

  recordStall(queueName: string): void {
    const m = this.metrics.get(queueName);
    m?.stalledCount.inc({ queue: queueName });
  }
}
```

### Integrating with Worker Events

```typescript
// src/monitoring/worker-instrumentation.ts
import { Worker, Job } from 'bullmq';
import { QueueMetricsCollector } from './queue-metrics';

export function instrumentWorker(
  worker: Worker,
  collector: QueueMetricsCollector
): void {
  const jobStartTimes = new Map<string, number>();

  worker.on('active', (job) => {
    jobStartTimes.set(job.id!, Date.now());
  });

  worker.on('completed', (job) => {
    const startTime = jobStartTimes.get(job.id!);
    if (startTime) {
      const durationMs = Date.now() - startTime;
      collector.recordCompletion(worker.name, job.name, durationMs);
      jobStartTimes.delete(job.id!);
    }
  });

  worker.on('failed', (job, err) => {
    if (job) {
      jobStartTimes.delete(job.id!);
      const errorType = err.constructor.name;
      collector.recordFailure(worker.name, job.name, errorType);
    }
  });

  worker.on('stalled', (jobId) => {
    collector.recordStall(worker.name);
    console.warn(`[${worker.name}] Job ${jobId} stalled`);
  });
}
```

### Prometheus HTTP Endpoint

```typescript
// src/monitoring/metrics-server.ts
import http from 'http';
import { register } from 'prom-client';

export function startMetricsServer(port = 9100): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      try {
        const metrics = await register.metrics();
        res.setHeader('Content-Type', register.contentType);
        res.end(metrics);
      } catch (err) {
        res.writeHead(500).end(String(err));
      }
    } else if (req.url === '/health') {
      res.writeHead(200).end('OK');
    } else {
      res.writeHead(404).end('Not Found');
    }
  });

  server.listen(port, () => {
    console.log(`Metrics server listening on :${port}/metrics`);
  });

  return server;
}
```

## Grafana Dashboard Configuration

### Key Dashboard Panels

**Panel 1: Queue Depth Over Time (Line Chart)**

```
# Prometheus query
sum by (queue) (bullmq_queue_depth)

# Visualization: Time series, stacked
# Alert: depth > 1000 AND growing for 5m
```

**Panel 2: Throughput (Jobs/Minute)**

```
# Prometheus query
sum by (queue, status) (rate(bullmq_jobs_processed_total[1m]) * 60)

# Visualization: Time series, separate lines for completed/failed
```

**Panel 3: Job Processing Latency (P50/P95/P99)**

```
# P50
histogram_quantile(0.50, sum by (queue, le) (rate(bullmq_job_duration_seconds_bucket[5m])))

# P95
histogram_quantile(0.95, sum by (queue, le) (rate(bullmq_job_duration_seconds_bucket[5m])))

# P99
histogram_quantile(0.99, sum by (queue, le) (rate(bullmq_job_duration_seconds_bucket[5m])))
```

**Panel 4: Failure Rate**

```
# Failure rate as % of total
sum by (queue) (rate(bullmq_job_failures_total[5m]))
/
sum by (queue) (rate(bullmq_jobs_processed_total[5m]))
* 100
```

**Panel 5: Queue Depth Trend (Are we keeping up?)**

```
# Rate of change in queue depth
deriv(bullmq_queue_waiting[5m])

# Positive = queue growing, negative = queue draining
```

### Grafana Dashboard JSON

```json
{
  "dashboard": {
    "title": "BullMQ Queue Monitoring",
    "uid": "bullmq-queues",
    "panels": [
      {
        "type": "timeseries",
        "title": "Queue Depth",
        "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum by (queue) (bullmq_queue_depth)",
            "legendFormat": "{​{queue}}"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "steps": [
                { "value": 0, "color": "green" },
                { "value": 500, "color": "yellow" },
                { "value": 2000, "color": "red" }
              ]
            }
          }
        }
      },
      {
        "type": "timeseries",
        "title": "Job Throughput (per minute)",
        "gridPos": { "x": 12, "y": 0, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum by (queue) (rate(bullmq_jobs_processed_total{status='completed'}[1m]) * 60)",
            "legendFormat": "{​{queue}} completed"
          },
          {
            "expr": "sum by (queue) (rate(bullmq_job_failures_total[1m]) * 60)",
            "legendFormat": "{​{queue}} failed"
          }
        ]
      },
      {
        "type": "gauge",
        "title": "Active Jobs",
        "gridPos": { "x": 0, "y": 8, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "sum(bullmq_queue_active)",
            "legendFormat": "Active"
          }
        ]
      },
      {
        "type": "gauge",
        "title": "Failed Jobs",
        "gridPos": { "x": 6, "y": 8, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "sum(bullmq_queue_failed)",
            "legendFormat": "Failed"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "steps": [
                { "value": 0, "color": "green" },
                { "value": 10, "color": "yellow" },
                { "value": 100, "color": "red" }
              ]
            }
          }
        }
      }
    ]
  }
}
```

## Alerting Rules

### Prometheus AlertManager Rules

```yaml
# alert-rules.yml
groups:
  - name: bullmq
    interval: 30s
    rules:
      # Queue depth growing: potential capacity issue
      - alert: QueueDepthGrowing
        expr: |
          deriv(bullmq_queue_waiting[5m]) > 10
          AND bullmq_queue_waiting > 100
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Queue {​{ $labels.queue }} depth is growing"
          description: |
            Queue {​{ $labels.queue }} has {​{ $value | humanize }} waiting jobs
            and is growing at {​{ printf "%.1f" (deriv bullmq_queue_waiting[5m]) }} jobs/second.
          runbook_url: "https://runbooks.example.com/queue-depth-growing"

      # Queue depth critical: jobs backed up significantly
      - alert: QueueDepthCritical
        expr: bullmq_queue_waiting > 5000
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Queue {​{ $labels.queue }} has critical backlog"
          description: "{​{ $value }} jobs waiting in {​{ $labels.queue }}"

      # High failure rate
      - alert: QueueHighFailureRate
        expr: |
          (
            sum by (queue) (rate(bullmq_job_failures_total[5m]))
            /
            sum by (queue) (rate(bullmq_jobs_processed_total[5m]))
          ) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Queue {​{ $labels.queue }} failure rate > 5%"
          description: "Failure rate: {​{ $value | humanizePercentage }}"

      # Jobs stalling (worker crashes)
      - alert: QueueJobsStalling
        expr: increase(bullmq_stalled_jobs_total[5m]) > 5
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Jobs stalling in {​{ $labels.queue }}"
          description: "{​{ $value }} jobs stalled in last 5 minutes — workers may be crashing"

      # P99 latency too high
      - alert: QueueLatencyHigh
        expr: |
          histogram_quantile(0.99,
            sum by (queue, le) (rate(bullmq_job_duration_seconds_bucket[10m]))
          ) > 30
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High P99 job latency in {​{ $labels.queue }}"
          description: "P99 latency: {​{ $value | humanizeDuration }}"

      # Dead letter queue growing
      - alert: DeadLetterQueueGrowing
        expr: bullmq_queue_waiting{queue="dead-letter"} > 50
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Dead letter queue has {​{ $value }} jobs"
          description: "Investigate failed jobs in the dead letter queue"
          runbook_url: "https://runbooks.example.com/dlq"

      # No jobs processed in a while (worker down?)
      - alert: QueueNoThroughput
        expr: |
          sum by (queue) (rate(bullmq_jobs_processed_total[5m])) == 0
          AND sum by (queue) (bullmq_queue_waiting) > 10
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Queue {​{ $labels.queue }} has jobs but no throughput"
          description: "Workers may be down or all jobs are failing immediately"
```

### TypeScript Alerting Integration

```typescript
// src/monitoring/alerting.ts

interface Alert {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  runbook?: string;
}

async function sendAlert(alert: Alert): Promise<void> {
  // PagerDuty integration
  if (alert.severity === 'critical') {
    await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: process.env.PAGERDUTY_KEY,
        event_action: 'trigger',
        payload: {
          summary: alert.title,
          severity: 'critical',
          custom_details: {
            message: alert.message,
            ...alert.metadata,
          },
        },
        links: alert.runbook
          ? [{ href: alert.runbook, text: 'Runbook' }]
          : [],
      }),
    });
  }

  // Slack notification for all severities
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attachments: [
        {
          color: alert.severity === 'critical' ? 'danger' : 'warning',
          title: alert.title,
          text: alert.message,
          fields: Object.entries(alert.metadata ?? {}).map(([key, value]) => ({
            title: key,
            value: String(value),
            short: true,
          })),
          footer: alert.runbook ? `<${alert.runbook}|Runbook>` : undefined,
        },
      ],
    }),
  });
}

// Queue-specific SLA monitoring
export class QueueSLAMonitor {
  constructor(
    private queue: Queue,
    private sla: {
      maxWaitMs: number;        // Max time job should wait before processing
      maxDurationMs: number;    // Max processing time
      maxFailureRate: number;   // Max failure rate (0–1)
    }
  ) {}

  async checkSLA(): Promise<void> {
    const jobs = await this.queue.getWaiting(0, 100);
    const now = Date.now();

    for (const job of jobs) {
      const waitMs = now - job.timestamp;
      if (waitMs > this.sla.maxWaitMs) {
        await sendAlert({
          severity: 'warning',
          title: `SLA Violation: Job waiting too long`,
          message: `Job ${job.id} in ${this.queue.name} has been waiting ${Math.floor(waitMs / 1000)}s (SLA: ${Math.floor(this.sla.maxWaitMs / 1000)}s)`,
          metadata: { jobId: job.id, queueName: this.queue.name, waitMs },
        });
      }
    }
  }
}
```

## Bull Board: Web UI for Queues

Bull Board provides a production-ready web UI for BullMQ queue inspection:

```typescript
// src/monitoring/bull-board.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';
import { Queue } from 'bullmq';

export function setupBullBoard(
  app: express.Application,
  queues: Queue[],
  basePath = '/admin/queues'
): void {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);

  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
    options: {
      uiConfig: {
        boardTitle: 'Job Queues',
      },
    },
  });

  // Add authentication middleware for production
  app.use(
    basePath,
    requireAdminAuth,  // Your auth middleware
    serverAdapter.getRouter()
  );
}

function requireAdminAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== process.env.ADMIN_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
```

## Queue Performance Dashboard

### Key Metrics for SREs

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Queue depth | < 100 | 100–1000 | > 1000 |
| Queue depth growth | Stable/declining | +10/min | +100/min |
| Job failure rate | < 1% | 1–5% | > 5% |
| P99 job latency | < 5s | 5–30s | > 30s |
| Stalled jobs (5m) | 0 | 1–5 | > 5 |
| DLQ depth | 0 | 1–50 | > 50 |
| Active workers | Expected | 50% of expected | < 25% |

### Runbook: Queue Depth Growing

1. **Check throughput vs arrival rate:**
   ```bash
   # Via metrics
   curl -s localhost:9100/metrics | grep bullmq_jobs_processed
   curl -s localhost:9100/metrics | grep bullmq_queue_waiting
   ```

2. **Check worker health:**
   ```bash
   kubectl get pods -l app=email-worker
   # Are all pods Running? Any CrashLoopBackOff?
   ```

3. **Check for stalled jobs:**
   ```typescript
   const stalled = await queue.getJobs(['stalled']);
   console.log(`${stalled.length} stalled jobs`);
   ```

4. **Check failure rate:** If workers are failing on all jobs, queue drains slowly.

5. **Scale workers if needed:**
   ```bash
   kubectl scale deployment email-worker --replicas=10
   ```

::: info War Story
**The Metric That Wasn't There**

A team had comprehensive queue depth monitoring but didn't monitor the rate of change (deriv). Their email queue held steadily at ~500 jobs for months. Then slowly, over 3 days, it climbed to 50,000 without triggering any alert.

Their alert threshold was > 10,000 jobs, which finally fired. But by then they had 3 days of backlog. The issue: their email provider had silently rate-limited them by 90%, and jobs were completing, but 10x slower than arriving.

The fix: add a `deriv` alert that fires when queue depth grows by > 5 jobs/minute for 30 consecutive minutes. This would have caught the issue within an hour of it starting.
:::
