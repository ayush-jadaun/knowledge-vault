---
title: Monitoring Antipatterns
description: The most common monitoring mistakes — dashboard rot, alert fatigue, vanity metrics, high-cardinality labels, monitoring without alerting, alerting on symptoms vs causes, and the monitoring cargo cult — with concrete examples and remediation strategies.
tags:
  - monitoring
  - antipatterns
  - alert-fatigue
  - cardinality
  - dashboards
  - observability
difficulty: intermediate
prerequisites:
  - monitoring/index
  - monitoring/metrics-design
  - monitoring/prometheus-deep-dive
lastReviewed: "2026-03-17"
---

# Monitoring Antipatterns

Most monitoring setups fail not because the tools are wrong but because the practices are wrong. Teams invest in Prometheus, Grafana, and PagerDuty, then undermine those investments with the same collection of mistakes that plague every organization. These antipatterns are predictable, recognizable, and fixable — if you know what to look for.

## Antipattern 1: Dashboard Rot

### What It Looks Like

Your Grafana instance has 200 dashboards. Nobody knows what half of them show. Many display "No Data" for panels because the underlying metrics were renamed or removed six months ago. New engineers are told to "check the dashboards" during incidents but have no idea which dashboard is relevant.

### Why It Happens

- Dashboards are created during incidents and never cleaned up
- No ownership model — nobody is responsible for maintaining dashboards
- Metrics change but dashboards are not updated
- Fear of deleting anything ("what if someone needs it?")
- No naming conventions — `API Dashboard`, `API Dashboard (new)`, `API Dashboard v2 (John's copy)`

### The Damage

- Engineers lose trust in dashboards and stop looking at them
- During incidents, time is wasted finding the right dashboard
- Misleading dashboards cause incorrect diagnosis
- New engineers absorb wrong mental models of the system

### Remediation

**Ownership tagging:**

Every dashboard must have an owning team defined in its tags or description. Dashboards without ownership are candidates for deletion.

```json
{
  "tags": ["team:backend", "service:checkout", "tier:production"],
  "description": "Owner: backend-team@company.com. Reviewed: 2026-01-15."
}
```

**Quarterly dashboard review:**

Schedule a recurring meeting where each team reviews their dashboards. For each dashboard, ask three questions:
1. Did anyone look at this dashboard in the last quarter? (Check Grafana usage analytics)
2. Are all panels showing data?
3. Would this dashboard help during an incident?

If the answer to all three is "no," delete the dashboard.

**Dashboard naming conventions:**

```
[Service] - [Purpose] - [Audience]

Examples:
  Checkout - Overview - On-Call
  Checkout - Database Performance - Backend Team
  Platform - Kubernetes Cluster - Infrastructure Team
```

**Dashboard hierarchy enforcement:**

Enforce the Level 0 / Level 1 / Level 2 / Level 3 hierarchy from the Grafana dashboards guide. Every service should have exactly one Level 1 overview dashboard. Any additional dashboards are Level 2 or Level 3 drill-downs linked from the Level 1 dashboard.

**Automated validation:**

Run a CI pipeline that validates dashboard JSON against current metric names. If a dashboard references a metric that no longer exists, fail the build.

```typescript
// scripts/validate-dashboards.ts
import * as fs from 'fs';
import * as path from 'path';

interface Panel {
  targets?: Array<{ expr?: string }>;
}

interface Dashboard {
  panels?: Panel[];
}

async function getActiveMetrics(prometheusUrl: string): Promise<Set<string>> {
  const response = await fetch(`${prometheusUrl}/api/v1/label/__name__/values`);
  const data = await response.json();
  return new Set(data.data);
}

function extractMetricNames(expr: string): string[] {
  // Extract metric names from PromQL expressions
  const regex = /\b([a-zA-Z_:][a-zA-Z0-9_:]*)\s*[{(\[]/g;
  const names: string[] = [];
  let match;
  while ((match = regex.exec(expr)) !== null) {
    const name = match[1];
    // Exclude PromQL functions and keywords
    const reserved = new Set([
      'sum', 'avg', 'min', 'max', 'count', 'rate', 'irate', 'increase',
      'histogram_quantile', 'topk', 'bottomk', 'by', 'without', 'on',
      'ignoring', 'group_left', 'group_right', 'bool', 'offset',
      'abs', 'ceil', 'floor', 'clamp', 'clamp_min', 'clamp_max',
      'predict_linear', 'deriv', 'changes', 'resets', 'absent',
      'label_replace', 'label_join', 'sort', 'sort_desc', 'time',
      'vector', 'scalar',
    ]);
    if (!reserved.has(name)) {
      names.push(name);
    }
  }
  return names;
}

async function validateDashboards(dashboardDir: string, prometheusUrl: string): Promise<void> {
  const activeMetrics = await getActiveMetrics(prometheusUrl);
  const files = fs.readdirSync(dashboardDir).filter(f => f.endsWith('.json'));
  let hasErrors = false;

  for (const file of files) {
    const content = fs.readFileSync(path.join(dashboardDir, file), 'utf-8');
    const dashboard: Dashboard = JSON.parse(content);

    for (const panel of dashboard.panels ?? []) {
      for (const target of panel.targets ?? []) {
        if (!target.expr) continue;
        const metricNames = extractMetricNames(target.expr);
        for (const name of metricNames) {
          if (!activeMetrics.has(name)) {
            console.error(`${file}: metric "${name}" not found in Prometheus`);
            hasErrors = true;
          }
        }
      }
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}
```

## Antipattern 2: Alert Fatigue

### What It Looks Like

The on-call engineer receives 200 alerts per shift. Most are non-actionable. They start ignoring alerts — acknowledging without investigating, silencing without fixing. Eventually, a real incident is buried in the noise and goes unnoticed for hours.

### Why It Happens

- Alerting on every metric that could possibly go wrong
- Thresholds set too aggressively (alerting on 60% CPU when 80% is fine)
- No `for` duration — alerting on momentary spikes
- Alerting on causes instead of symptoms (alerting on "one pod restarted" when the service is still healthy)
- No deduplication or grouping — the same problem generates 50 alerts
- No maintenance windows — routine maintenance triggers alerts

### The Damage

- The cry-wolf effect: engineers stop taking alerts seriously
- On-call burnout: engineers dread being on call
- Missed real incidents: the signal is lost in the noise
- Wasted engineering time: investigating non-issues

### Remediation

**Every alert must be actionable.** When an alert fires, the on-call engineer must be able to do something about it. "CPU is at 61%" with no runbook and no action to take is not an actionable alert — it is a notification.

**Apply the alert checklist:**

For each alert, ask:
1. Does this alert require immediate human intervention? If no, it should be a ticket or a log entry, not a page.
2. Is there a runbook? If no, write one before enabling the alert.
3. Can this be automatically remediated? If yes, automate it and remove the alert.
4. What is the `for` duration? Most alerts should have a `for` of at least 5 minutes to ignore momentary spikes.
5. What is the appropriate severity? If it can wait until morning, it is not a page — it is a ticket.

**Alert budgeting:**

Set a maximum number of pages per on-call shift. A good target is fewer than 2 pages per 12-hour shift. If you exceed this consistently, hold an alert review meeting:

```markdown
## Weekly Alert Review Agenda

1. How many alerts fired this week?
2. How many were actionable? (Required human intervention)
3. How many were duplicates of the same underlying issue?
4. For each non-actionable alert:
   - Can we adjust the threshold?
   - Can we add a `for` duration?
   - Should this be a ticket instead of a page?
   - Should this alert be deleted?
5. For each missing alert:
   - Did we have an incident with no corresponding alert?
   - What alert would have caught it?
```

**Severity classification:**

```
Page (wakes you up):
  - Service is down for customers
  - SLO burn rate is critical
  - Data loss is occurring or imminent

Ticket (next business day):
  - Disk will be full in 48 hours
  - Certificate expires in 14 days
  - Non-critical service degradation

Notification (informational, no action):
  - Deploy completed
  - Scaling event occurred
  - Background job queue depth increased temporarily
```

## Antipattern 3: Vanity Metrics

### What It Looks Like

The CEO dashboard shows "99.99% uptime" in big green letters. The team celebrates. Meanwhile, users are experiencing 2-second page loads, the search function returns wrong results half the time, and the checkout flow fails for users with certain payment methods. But the servers are up, so the vanity metric says everything is fine.

### Why It Happens

- Measuring server uptime instead of user experience
- Counting "requests served" instead of "requests served correctly"
- Reporting averages instead of percentiles
- Measuring what is easy instead of what matters
- Optimizing for the metric instead of for the user

### The Damage

- False sense of security — everything looks green while users suffer
- Wrong engineering priorities — teams fix the metrics instead of the problems
- Lost trust from stakeholders — when they hear "99.99% uptime" but the product feels broken

### How to Identify Vanity Metrics

A metric is a vanity metric if:
- It only goes up (total users registered, total requests served)
- It measures activity, not outcomes (page views vs successful checkouts)
- It can be green while users are having a bad experience
- Nobody changes their behavior based on its value

**Vanity vs actionable:**

| Vanity Metric | Actionable Alternative |
|---|---|
| Server uptime (99.99%) | Availability SLI: % of requests with non-5xx response |
| Average response time (50ms) | P95 and P99 response time |
| Total requests served (1M/day) | Request rate trend (is it growing, shrinking, spiking?) |
| Total users (5M) | Daily active users, cohort retention |
| Deployment count (100/month) | Deployment failure rate, rollback rate |
| Test coverage (90%) | Tests that caught bugs vs total tests |

### Remediation

Replace every vanity metric with a metric that answers a specific question:

- "Are users having a good experience?" → SLI-based dashboards
- "Is the system getting better or worse?" → Trend analysis on error rates and latency
- "Where should we invest engineering time?" → Error budget burn rate by service
- "Is this deploy safe?" → Canary analysis comparing new vs old version

## Antipattern 4: High-Cardinality Labels

### What It Looks Like

Prometheus is using 32 GB of memory and queries take 30 seconds. Someone added `user_id` as a label to the HTTP request counter "so we can see per-user metrics." With 2 million users, this creates 2 million time series per label combination, and Prometheus cannot handle it.

### Why It Happens

- Developers think of metrics like logs (per-request context)
- No cardinality review process for new metrics
- No understanding of how labels create time series
- Copy-pasting instrumentation without understanding the implications

### The Damage

- Prometheus OOM crashes
- Slow or failed queries
- Increased storage costs
- Team loses trust in the monitoring system

### Detection

```promql
# Find metrics with excessive cardinality
topk(20, count by (__name__)({__name__=~".+"}))

# Find specific labels causing cardinality explosion
count(http_requests_total) by (route)
# If a route has 10,000+ distinct values, it is not normalized

# Check total series count
prometheus_tsdb_head_series
# If this is above 5M and you don't have that many targets, you have a cardinality problem
```

### Prevention

**Pre-deployment cardinality review:**

Add to your code review checklist: "Does this metric introduce any label with more than 100 unique values?" If yes, it needs architecture review.

**Runtime cardinality limiting:**

Use Prometheus relabeling to drop high-cardinality labels before storage:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'my-app'
    metric_relabel_configs:
      # Drop the user_id label from all metrics
      - action: labeldrop
        regex: 'user_id'
      # Drop entire metric if it has too many series
      - source_labels: [__name__]
        regex: 'dangerous_metric_.*'
        action: drop
```

**Application-level cardinality limits in prom-client:**

```typescript
// Custom middleware to reject high-cardinality labels
function safeInc(counter: Counter, labels: Record<string, string>): void {
  for (const [key, value] of Object.entries(labels)) {
    if (key === 'user_id' || key === 'email' || key === 'request_id') {
      throw new Error(
        `High-cardinality label "${key}" is not allowed in metrics. ` +
        `Use logs or traces for per-request data.`
      );
    }
  }
  counter.inc(labels);
}
```

## Antipattern 5: Monitoring Without Alerting

### What It Looks Like

The team has beautiful Grafana dashboards. CPU, memory, disk, request rate, error rate — all graphed in real time. But nobody is looking at the dashboards unless someone mentions "check the dashboard." There are no alerts configured. The dashboards are reactive — you only look when you already know something is wrong.

### Why It Happens

- "We'll add alerts later" (later never comes)
- Fear of alert fatigue (so they add zero alerts instead of good alerts)
- Dashboard creation is fun; alert design is tedious
- No clear ownership of alerting
- No SLOs defined, so no clear thresholds to alert on

### The Damage

- Incidents are detected by users, not by monitoring
- Time-to-detection is minutes or hours instead of seconds
- Monitoring investment is wasted — dashboards without alerts are decorations

### Remediation

For every Level 1 service dashboard, define at least these alerts:

```yaml
# Minimum viable alerting for any service
groups:
  - name: minimum_viable_alerts
    rules:
      # 1. Service is unreachable
      - alert: ServiceDown
        expr: up{job="my-service"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "{​{ $labels.job }​} is down"

      # 2. Error rate is elevated
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{job="my-service", status_code=~"5.."}[5m]))
          / sum(rate(http_requests_total{job="my-service"}[5m])) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 5% for {​{ $labels.job }​}"

      # 3. Latency is elevated
      - alert: HighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket{job="my-service"}[5m])) by (le)
          ) > 1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency above 1s for {​{ $labels.job }​}"

      # 4. Resource exhaustion approaching
      - alert: DiskSpaceLow
        expr: |
          (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}
          / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"}) > 0.85
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Disk usage above 85% on {​{ $labels.instance }​}"
```

**Rule of thumb:** If you have a dashboard panel, ask "what value on this panel would make me take action?" That value is your alert threshold.

## Antipattern 6: Alerting on Causes Instead of Symptoms

### What It Looks Like

You get paged because a single pod restarted. The service has 10 replicas, the load balancer already routed traffic away from the restarted pod, and zero users were affected. But the "PodRestarted" alert does not know that — it fires every time any pod restarts.

More examples:
- Alert: "CPU at 75% on node-3" → No user impact
- Alert: "One Kafka consumer behind by 100 messages" → The consumer catches up in 30 seconds
- Alert: "Database replication lag at 2 seconds" → No read query returned stale data

### Why It Happens

- It is easier to alert on infrastructure metrics than user-facing metrics
- "Better safe than sorry" mentality leads to alerting on everything
- Lack of SLOs means there is no definition of "user impact"
- Infrastructure teams alert on infrastructure metrics without considering the application layer

### The Damage

- Alert fatigue from non-impactful alerts
- Wrong mental model: engineers think of infrastructure health as the goal instead of user experience as the goal
- Delayed response to real incidents because time is spent investigating non-issues

### Remediation

**Alert on symptoms, investigate causes:**

| Symptom Alert (Good) | Cause Alert (Bad) |
|---|---|
| "Error rate above 5% for checkout service" | "Pod restarted" |
| "P95 latency above 2s" | "CPU at 75%" |
| "Search returning zero results for 10% of queries" | "Elasticsearch cluster yellow" |
| "SLO burn rate critical" | "Kafka consumer lag > 100" |

**Cause-based metrics should be on dashboards, not in pagers.** When the symptom alert fires, the on-call engineer opens the dashboard and investigates causes. The dashboard might show that CPU is high, or that a pod restarted, or that Kafka lag spiked. But none of those should have been a page by themselves.

**Exception:** Alert on causes when the cause will inevitably lead to symptoms within a predictable timeframe and early intervention can prevent the symptoms:
- Disk will be full in 24 hours → page (action: add space or clean up)
- SSL certificate expires in 7 days → ticket (action: renew)
- Database connection pool at 95% → warning (action: investigate query backlog)

## Antipattern 7: The Monitoring Cargo Cult

### What It Looks Like

The team installed Prometheus, Grafana, Alertmanager, Jaeger, Loki, and a service mesh with Envoy telemetry. They have 50 dashboards, 200 alerts, and a 100-page monitoring runbook. They followed every "how to monitor microservices" blog post. And yet, when an incident happens, nobody knows where to look, the alerts do not fire for real problems, and the dashboards are overwhelming.

The tools are present. The understanding is absent.

### Why It Happens

- Following best practices by the letter without understanding the spirit
- Adopting tools without adapting them to the specific system
- Monitoring as a checkbox exercise ("we need monitoring → install Prometheus → done")
- No feedback loop from incidents to monitoring improvements
- Copying configurations from blog posts without understanding what they measure

### The Damage

- Complexity without value — more tools to maintain, more things to break
- False confidence — "we have monitoring" becomes "our monitoring is good"
- Slower incident response — too many sources of truth, no clear starting point
- Engineering time wasted on maintaining monitoring infrastructure instead of improving monitoring quality

### Remediation

**Start small, iterate based on incidents:**

1. Start with a single metric: error rate. Set an alert for error rate above 5%.
2. Wait for an incident.
3. After the incident, ask: "What additional monitoring would have helped us detect this sooner or diagnose it faster?"
4. Add that specific monitoring.
5. Repeat.

This incident-driven approach ensures every piece of monitoring exists because it would have helped in a real situation, not because a blog post said to add it.

**The monitoring postmortem question:**

After every incident, add this section to the postmortem:

```markdown
## Monitoring Gaps

1. Did our monitoring detect this incident? If no, what alert would have caught it?
2. Did we have the right dashboards for diagnosis? If no, what panels were missing?
3. Did we have the right logs for root cause analysis? If no, what should we be logging?
4. Did we have traces that showed the request path? If no, where should we add tracing?
5. Were any existing alerts or dashboards misleading during this incident?
```

**Monitoring maturity assessment:**

Instead of counting dashboards and alerts, measure monitoring effectiveness:

| Metric | Target | How to Measure |
|---|---|---|
| **Time to detection** (TTD) | < 5 minutes | Time between incident start and first alert |
| **Percentage of incidents detected by monitoring** | > 90% | Incidents detected by alerts vs reported by users |
| **Alert precision** | > 80% | Actionable alerts / total alerts |
| **Dashboard relevance** | 100% | Dashboards viewed during incidents / total dashboards |
| **Mean time to diagnosis** (MTTD) | < 15 minutes | Time between first alert and root cause identification |

If your TTD is 30 minutes despite having 200 alerts, you do not have an alert quantity problem — you have an alert quality problem.

## Summary of Antipatterns and Fixes

| Antipattern | Key Symptom | Fix |
|---|---|---|
| Dashboard Rot | 200 dashboards, nobody knows which to use | Ownership, quarterly review, naming conventions, automated validation |
| Alert Fatigue | 200 alerts per shift, most ignored | Actionability requirement, severity classification, alert budgeting, weekly review |
| Vanity Metrics | "99.99% uptime" while users suffer | SLI-based metrics, percentiles instead of averages, outcome metrics |
| High-Cardinality Labels | Prometheus OOM, slow queries | Cardinality review in code review, runtime limits, relabeling |
| Monitoring Without Alerting | Incidents detected by users | Minimum viable alerts for every service, alert-per-dashboard-panel rule |
| Symptoms vs Causes | Paged for non-impactful infrastructure events | Alert on user-facing symptoms, investigate infrastructure causes on dashboards |
| Cargo Cult | All the tools, none of the understanding | Incident-driven monitoring, start small, measure monitoring effectiveness |

The path to good monitoring is not adding more tools — it is adding the right signals, alerts, and dashboards one at a time, driven by real incidents and real questions.
