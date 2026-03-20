---
title: "Disaster Recovery"
description: "Comprehensive guide to disaster recovery — RPO, RTO, DR tiers, active-passive/active-active strategies, backup approaches, DR testing, and game day runbooks"
tags: [disaster-recovery, rpo, rto, backup, reliability]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# Disaster Recovery

Disaster recovery (DR) is the set of policies, tools, and procedures that enable the recovery of critical systems after a catastrophic failure. Every system fails eventually. The question is not *if* but *when*, and whether you will recover in minutes or days.

Most organizations learn this the hard way. They discover their backups are corrupt when they try to restore them. They realize their "DR plan" is a wiki page nobody has read. They find out their RTO is measured in days, not the hours they promised to leadership.

This page gives you a framework for DR that actually works — from defining your recovery objectives through testing your runbooks under pressure.

**Related**: [Incident Response](/devops/incident-response/) | [On-Call Handbook](/devops/engineering-practices/on-call-handbook) | [Chaos Engineering](/devops/incident-response/chaos-engineering)

---

## Core Concepts

### RPO and RTO

| Metric | Definition | Question It Answers |
|--------|-----------|---------------------|
| **RPO** (Recovery Point Objective) | Maximum acceptable data loss measured in time | "How much data can we afford to lose?" |
| **RTO** (Recovery Time Objective) | Maximum acceptable downtime | "How long can we be down?" |

```
            RPO                    RTO
      ←──────────→          ←──────────→
      |            |        |            |
  Last backup   Disaster   Recovery    Back to
  or sync       occurs     begins      normal
```

### RPO/RTO by Business Impact

| Tier | RPO | RTO | Examples |
|------|-----|-----|----------|
| Tier 1 (Critical) | Near-zero | < 15 min | Payment processing, trading systems |
| Tier 2 (High) | < 1 hour | < 1 hour | Core product APIs, auth services |
| Tier 3 (Medium) | < 4 hours | < 4 hours | Internal tools, reporting |
| Tier 4 (Low) | < 24 hours | < 24 hours | Dev environments, documentation |

::: warning
RPO and RTO are business decisions, not engineering decisions. Engineering determines what is technically feasible and the cost. The business decides what is acceptable given the tradeoffs. A near-zero RPO can cost 10x more than a 1-hour RPO.
:::

---

## DR Strategies

### Strategy Comparison

| Strategy | RPO | RTO | Cost | Complexity |
|----------|-----|-----|------|------------|
| **Backup & Restore** | Hours | Hours-days | $ | Low |
| **Pilot Light** | Minutes | 10-30 min | $$ | Medium |
| **Warm Standby** | Seconds-minutes | Minutes | $$$ | High |
| **Active-Active** | Near-zero | Seconds-minutes | $$$$ | Very high |

### Backup & Restore

The simplest and cheapest strategy. Regular backups stored offsite (different region/cloud). Recovery requires provisioning infrastructure and restoring data.

```
Primary Region                     DR Region
┌──────────────┐                  ┌──────────────┐
│  App Servers  │                  │              │
│  Database     │  ──backups──→   │  S3 Bucket   │
│  File Storage │                  │  (backups)   │
└──────────────┘                  └──────────────┘

Recovery: Provision infra → Restore backups → DNS switch
```

**When to use**: Tier 3-4 systems, non-critical internal tools, development environments.

### Pilot Light

A minimal version of the production environment runs in the DR region at all times — just enough to receive data replication (database replicas, core services). When disaster strikes, you scale up the pilot light to full production capacity.

```
Primary Region                     DR Region
┌──────────────┐                  ┌──────────────┐
│  App (active) │                  │  App (off)   │
│  DB (primary) │  ──replication─→ │  DB (replica)│
│  Cache        │                  │  (no cache)  │
└──────────────┘                  └──────────────┘

Recovery: Start app servers → Promote DB → Warm cache → DNS switch
```

**When to use**: Tier 2 systems where you can tolerate 10-30 minutes of downtime.

### Warm Standby

A scaled-down but fully functional copy of production runs in the DR region. It can serve traffic immediately (possibly at reduced capacity), then scale up to full capacity.

```
Primary Region                     DR Region
┌──────────────┐                  ┌──────────────┐
│  App (full)   │                  │  App (small)  │
│  DB (primary) │  ──replication─→ │  DB (replica) │
│  Cache (full) │                  │  Cache (warm) │
└──────────────┘                  └──────────────┘

Recovery: Scale up app → Promote DB → DNS switch
```

**When to use**: Tier 1-2 systems where minutes of downtime is acceptable.

### Active-Active (Multi-Region)

Both regions serve production traffic simultaneously. Data is replicated bidirectionally. If one region fails, the other absorbs the traffic automatically.

```
Region A (US-East)                 Region B (EU-West)
┌──────────────┐                  ┌──────────────┐
│  App (active) │  ←── traffic ──→ │  App (active) │
│  DB (multi-   │  ←── sync ────→  │  DB (multi-   │
│    primary)   │                  │    primary)   │
│  Cache        │                  │  Cache        │
└──────────────┘                  └──────────────┘
        ↑                                  ↑
        └──── Global Load Balancer ────────┘
```

**When to use**: Tier 1 systems requiring near-zero RPO and RTO.

::: danger
Active-active is deceptively hard. Bidirectional replication creates conflict resolution challenges. You need to handle write conflicts, eventual consistency, and split-brain scenarios. Do not attempt this unless your business truly requires it and you have the engineering capacity to maintain it.
:::

---

## Backup Strategies

### Backup Types

| Type | Description | Storage | Restore Time |
|------|-------------|---------|-------------|
| **Full** | Complete copy of all data | Large | Fast (single restore) |
| **Incremental** | Only changes since last backup | Small | Slow (chain of restores) |
| **Differential** | Changes since last full backup | Medium | Medium (full + one diff) |
| **Continuous (CDC)** | Real-time change streaming | N/A | Very fast |

### Backup Schedule Pattern

```
Week:   Mon   Tue   Wed   Thu   Fri   Sat   Sun
        Full  Inc   Inc   Inc   Inc   Inc   Full
              Diff              Diff

Retention:
- Daily incrementals: 7 days
- Weekly fulls: 4 weeks
- Monthly fulls: 12 months
- Yearly fulls: 7 years (compliance)
```

### Database Backup Commands

```bash
# PostgreSQL
# Full logical backup
pg_dump -Fc -f backup.dump mydb

# Full backup with parallel jobs
pg_dump -Fc -j 4 -f backup.dump mydb

# Continuous archiving (WAL shipping)
archive_command = 'aws s3 cp %p s3://backups/wal/%f'

# Point-in-time recovery
restore_command = 'aws s3 cp s3://backups/wal/%f %p'
recovery_target_time = '2026-03-20 14:30:00'

# MySQL
# Full backup
mysqldump --single-transaction --routines --triggers mydb > backup.sql

# Binary log for point-in-time
mysqlbinlog --start-datetime="2026-03-20 14:00:00" binlog.000042

# MongoDB
# Full backup
mongodump --uri="mongodb://host:27017/mydb" --out=/backups/full

# Oplog-based incremental
mongodump --oplog --out=/backups/incremental
```

### The 3-2-1 Rule

| Rule | Meaning |
|------|---------|
| **3** copies | Original + 2 backups |
| **2** different media types | Different storage systems (disk + object storage) |
| **1** offsite copy | Different geographic location or cloud region |

```bash
# Example: PostgreSQL backup to multiple destinations
pg_dump -Fc mydb | tee /local/backup.dump | aws s3 cp - s3://backups-us-east/backup.dump
aws s3 cp s3://backups-us-east/backup.dump s3://backups-eu-west/backup.dump --source-region us-east-1 --region eu-west-1
```

---

## DR Testing

### Why Testing Matters

An untested DR plan is not a plan — it is a hope. Common discoveries during first-time DR tests:

- Backups are empty or corrupt
- Restore scripts reference hardcoded IPs from the primary region
- DNS TTLs are set to 24 hours, so failover takes hours
- Nobody knows the password for the DR database
- The DR region has different instance types available
- Application config has hardcoded primary region endpoints

### Test Types

| Test | Effort | Disruption | Confidence |
|------|--------|-----------|------------|
| **Tabletop exercise** | Low | None | Low |
| **Walkthrough** | Low-Medium | None | Medium |
| **Simulation** | Medium | None | Medium-High |
| **Parallel recovery** | High | None (parallel env) | High |
| **Full failover** | Very High | Production impact | Very High |

### DR Test Runbook Template

```markdown
## DR Test: Database Failover
Date: 2026-03-20
Participants: [names]
Target RTO: 15 minutes
Target RPO: < 1 minute

### Pre-Test Checklist
- [ ] Notify stakeholders
- [ ] Confirm monitoring is active
- [ ] Record baseline metrics
- [ ] Verify rollback procedure
- [ ] Confirm communication channels

### Execution Steps
1. [ ] Record current primary DB endpoint and replication lag
2. [ ] Initiate failover: `aws rds failover-db-cluster --db-cluster-identifier prod-cluster`
3. [ ] Monitor replication promotion (target: < 60s)
4. [ ] Verify application reconnects automatically
5. [ ] Run smoke tests against the application
6. [ ] Verify data integrity (compare record counts, latest records)
7. [ ] Record total downtime

### Post-Test
- [ ] Document actual RTO achieved: ___
- [ ] Document actual RPO achieved: ___
- [ ] List issues discovered: ___
- [ ] Create action items for each issue
- [ ] Update runbook with lessons learned
- [ ] Failback to original primary (if needed)
```

---

## Game Days

Game days are scheduled events where you intentionally inject failures into production (or a production-like environment) to test your DR capabilities and team response.

### Running a Game Day

| Phase | Activities |
|-------|-----------|
| **Planning** (2-4 weeks before) | Define scope, scenarios, success criteria, rollback plan |
| **Communication** | Notify all stakeholders, set expectations, establish war room |
| **Execution** | Inject failure, observe, respond, measure |
| **Review** | Document findings, measure actual vs target RPO/RTO, action items |

### Example Scenarios

| Scenario | What You Learn |
|----------|---------------|
| Kill the primary database | Automatic failover works, app reconnects |
| Block traffic from one AZ | Multi-AZ resilience, load balancer behavior |
| Corrupt S3 bucket | Backup restore process, alternative data sources |
| Revoke all IAM credentials | Secrets rotation, manual override procedures |
| Simulate region outage | Full DR failover, DNS propagation, data consistency |
| Kill random pods (Chaos Monkey) | Kubernetes self-healing, pod disruption budgets |

### Game Day Rules

1. **Always have a rollback plan** — you must be able to undo the failure injection
2. **Start small** — begin with non-production, then low-traffic periods, then full production
3. **Communicate proactively** — everyone should know a game day is happening
4. **Have a kill switch** — one command to stop the experiment immediately
5. **Never blame** — the goal is to find weaknesses, not assign fault
6. **Document everything** — record timeline, decisions, outcomes

::: tip
Schedule game days during business hours when your team is alert and available. Running them off-hours defeats the purpose — you want to test the full response pipeline including human decision-making.
:::

---

## DNS and Traffic Management

### DNS Failover

```
Normal operation:
  api.example.com → Primary (us-east-1) [Health check: passing]
                   → DR (eu-west-1)      [Health check: passing, standby]

After primary failure:
  api.example.com → DR (eu-west-1)       [Health check: passing, active]
                   → Primary (us-east-1)  [Health check: failing, removed]
```

### Critical DNS Settings

| Setting | Recommendation | Why |
|---------|---------------|-----|
| TTL | 60 seconds | Fast failover (clients re-resolve quickly) |
| Health checks | 10s interval, 3 failures | Fast detection without false positives |
| Routing policy | Failover or weighted | Automatic traffic shift |

::: warning
Long DNS TTLs are the most common DR delay. If your TTL is 3600 (1 hour), clients may continue sending traffic to the failed primary for up to an hour after you switch DNS. Set TTLs to 60 seconds for critical services. This increases DNS query volume but is negligible for modern DNS infrastructure.
:::

---

## DR Automation

### Infrastructure as Code

```hcl
# Terraform — DR region infrastructure
module "dr_region" {
  source = "./modules/application"
  providers = {
    aws = aws.eu-west-1
  }

  environment    = "dr"
  instance_count = var.dr_active ? var.production_instance_count : 0
  db_instance    = var.dr_active ? "db.r5.2xlarge" : "db.r5.large"
}

# Database read replica in DR region
resource "aws_rds_cluster" "dr_replica" {
  provider              = aws.eu-west-1
  cluster_identifier    = "myapp-dr"
  replication_source_arn = aws_rds_cluster.primary.arn
  engine                = "aurora-postgresql"
}
```

### Failover Script

```bash
#!/bin/bash
set -euo pipefail

echo "=== INITIATING DR FAILOVER ==="
echo "Time: $(date -u)"

# 1. Promote DR database
echo "Promoting DR database..."
aws rds promote-read-replica-db-cluster \
  --db-cluster-identifier myapp-dr \
  --region eu-west-1

# 2. Scale up DR application
echo "Scaling DR application..."
aws ecs update-service \
  --cluster myapp-dr \
  --service api \
  --desired-count 10 \
  --region eu-west-1

# 3. Wait for services to stabilize
echo "Waiting for services..."
aws ecs wait services-stable \
  --cluster myapp-dr \
  --services api \
  --region eu-west-1

# 4. Run smoke tests
echo "Running smoke tests..."
./scripts/smoke-test.sh https://dr-api.example.com

# 5. Switch DNS
echo "Switching DNS..."
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456 \
  --change-batch file://dns-failover.json

echo "=== FAILOVER COMPLETE ==="
echo "Time: $(date -u)"
```

---

## Checklist

Before you can say you have a DR plan:

- [ ] RPO and RTO defined for every critical service
- [ ] Backup schedule implemented and monitored
- [ ] Backup restore tested successfully (not just backup creation)
- [ ] DR environment provisioned (at least pilot light)
- [ ] Runbooks written for every failover scenario
- [ ] DNS TTLs set appropriately (60s for critical services)
- [ ] Secrets and credentials accessible in DR region
- [ ] Monitoring active in DR region
- [ ] DR test completed successfully within target RTO
- [ ] Game day conducted at least once per quarter
- [ ] Post-incident reviews feed back into DR improvements

---

*Last updated: 2026-03-20*
