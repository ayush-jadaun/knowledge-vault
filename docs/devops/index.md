---
title: DevOps
description: Operational excellence from monitoring and logging to deployment strategies, incident response, and chaos engineering — with real Prometheus queries, Grafana dashboards, and runbook templates.
tags:
  - devops
  - monitoring
  - logging
  - alerting
  - deployment
  - incident-response
  - chaos-engineering
  - observability
difficulty: intermediate
lastReviewed: "2026-03-17"
---

# DevOps

DevOps is not a job title. It is a set of practices that determine whether your software is a joy to operate or a nightmare that wakes people up at 3 AM. The difference between a team that ships confidently ten times a day and a team that dreads every release comes down to the operational foundations covered in this section.

The hard truth: most teams are stuck at maturity level 1 or 2. They have basic monitoring but no structured alerts. They have logs but can't correlate them across services. They deploy manually or with fragile scripts and cross their fingers. Incidents get resolved through heroics, not process. This section gives you the playbook to systematically level up.

## DevOps Maturity Model

Use this model to assess where your team is and where to focus next. Each level builds on the previous one — skip a level and you build on sand.

```mermaid
graph TB
    L1["Level 1: Reactive<br/>Manual deploys, no monitoring,<br/>learn about outages from users"]
    L2["Level 2: Managed<br/>Basic monitoring, manual runbooks,<br/>some CI, deploy scripts"]
    L3["Level 3: Defined<br/>Structured logging, alerting with<br/>runbooks, CD pipeline, postmortems"]
    L4["Level 4: Measured<br/>SLOs/SLIs, distributed tracing,<br/>automated rollback, error budgets"]
    L5["Level 5: Optimized<br/>Chaos engineering, auto-remediation,<br/>progressive delivery, platform team"]

    L1 --> L2 --> L3 --> L4 --> L5

    style L1 fill:#dc2626,color:#fff
    style L2 fill:#ea580c,color:#fff
    style L3 fill:#ca8a04,color:#fff
    style L4 fill:#2563eb,color:#fff
    style L5 fill:#16a34a,color:#fff
```

| Level | Key Indicator | What to Implement Next |
|---|---|---|
| **Level 1: Reactive** | You learn about outages from users | Basic uptime monitoring, central log aggregation |
| **Level 2: Managed** | You know when things break but respond ad-hoc | Structured logging, alert routing, CI pipeline |
| **Level 3: Defined** | You have process but limited visibility into why things break | Distributed tracing, SLOs, CD pipeline, blameless postmortems |
| **Level 4: Measured** | You make data-driven decisions about reliability | Chaos experiments, progressive delivery, auto-rollback |
| **Level 5: Optimized** | Reliability is a competitive advantage | Platform engineering, self-service infrastructure, auto-remediation |

Most teams should aim to reach Level 3 within their first year and Level 4 within two years. Level 5 is for organizations where engineering velocity and reliability are core business differentiators.

## Learning Path

Follow this order — each section builds on the last. You can't alert on what you haven't measured, and you can't respond to incidents without alerts.

| Order | Subsection | What You'll Learn | Maturity Impact |
|-------|---|---|---|
| 1 | [Monitoring](/devops/monitoring) | Prometheus, PromQL, Grafana dashboards, USE method, RED method, the four golden signals | Level 1 → 2 |
| 2 | [Logging](/devops/logging) | Structured logging, correlation IDs, ELK/Loki stack, log levels, log-based alerting | Level 2 → 3 |
| 3 | [Alerting](/devops/alerting) | Alert design, SLOs, error budgets, PagerDuty/OpsGenie routing, killing alert fatigue | Level 2 → 4 |
| 4 | [SRE Practices](/devops/sre) | Error budgets, toil reduction, reliability targets, SLI/SLO/SLA distinctions, blameless culture | Level 3 → 5 |
| 5 | [Deployment Strategies](/devops/deployment-strategies) | Rolling, blue-green, canary, feature flags, progressive delivery, automated rollback | Level 2 → 4 |
| 6 | [Incident Response](/devops/incident-response) | Incident commander framework, comms templates, blameless postmortems, runbook structure, on-call | Level 2 → 3 |

## Extended Topics

| Subsection | What You'll Learn |
|---|---|
| [Git](/devops/git) | Branching strategies, rebase vs merge, monorepo patterns, large file handling |
| [Release Engineering](/devops/release-engineering) | Versioning, changelogs, release trains, feature flags at scale |
| [Disaster Recovery](/devops/disaster-recovery) | RTO/RPO targets, backup strategies, chaos engineering, runbooks |
| [Engineering Practices](/devops/engineering-practices) | Code review culture, pair programming, tech debt management |
| [Debugging Production](/devops/debugging-production) | Distributed tracing, flame graphs, memory dumps, live debugging |
| [Feature Flags](/devops/feature-flags) | LaunchDarkly, Unleash, flag lifecycle, avoiding flag debt |
| [FinOps](/devops/finops) | Cloud cost attribution, rightsizing, reserved instances, unit economics |

## The Three Pillars of Observability

Everything in this section connects back to the three pillars:

- **Metrics** tell you *what* is happening. Request rate is spiking. Error rate is climbing. Latency is increasing. Metrics are cheap to store and fast to query, making them the first line of defense.
- **Logs** tell you *why* it is happening. The database connection pool is exhausted. A downstream API is returning 503s. A deploy introduced a nil pointer dereference. Logs are expensive but indispensable for diagnosis.
- **Traces** tell you *where* it is happening. In a distributed system, a single user request might touch fifteen services. Traces let you follow that request end to end and identify exactly which service is the bottleneck.

Metrics tell you there is a fire. Logs tell you what is burning. Traces tell you where the fire started. You need all three.

## How to Use This Section

Start by honestly assessing your team against the maturity model above. Then read the subsections that correspond to your next level. Each page includes real configuration files, actual Prometheus queries, importable Grafana dashboard JSON, and runbook templates you can adopt directly. This is not theory — it is the operational playbook.
