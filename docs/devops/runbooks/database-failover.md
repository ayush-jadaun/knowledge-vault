---
title: "Database Failover Runbook"
description: "Step-by-step runbook for PostgreSQL primary database failure — promoting a replica, updating DNS and connection strings, verifying replication, and notifying stakeholders"
tags: [runbook, database, failover, postgresql, disaster-recovery]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# Database Failover Runbook

## Overview

This runbook covers the procedure for handling a PostgreSQL primary database failure. The primary database is unavailable, and you need to promote a replica to become the new primary, redirect application traffic, verify data integrity, and establish new replication.

This is a **SEV1** event. All writes are failing. Read traffic may or may not be affected depending on your read replica configuration.

**Related**: [Disaster Recovery](/devops/disaster-recovery/) | [Service Degradation Runbook](/devops/runbooks/service-degradation) | [Incident Response](/devops/incident-response/) | [Pre-Launch Checklist](/devops/checklists/pre-launch)

---

## Impact Assessment

| Impact Area | Description |
|---|---|
| **User-facing** | All write operations fail. Users cannot create accounts, place orders, update profiles, or perform any state-changing action. Read operations may work if using read replicas. |
| **Business** | Revenue impact: all transactions fail. Estimated loss: $X per minute of downtime (calculate from your business metrics). |
| **Blast radius** | All services that write to this database are affected. Check the dependency map below. |
| **Data risk** | Transactions committed to the primary but not replicated to the replica will be lost. The amount depends on replication lag at time of failure. |

```mermaid
flowchart TD
    A[Primary DB Failure<br/>DETECTED] --> B{Can primary<br/>be recovered?}
    B -->|Yes, < 5 min| C[Restart Primary]
    B -->|No / Unknown| D[Promote Replica]
    C --> E{Primary healthy?}
    E -->|Yes| F[Verify data<br/>integrity]
    E -->|No| D
    D --> G[Update DNS /<br/>connection string]
    G --> H[Verify application<br/>connectivity]
    H --> I[Establish new<br/>replication]
    I --> J[Notify stakeholders]
    F --> J

    style A fill:#ee5253,color:#fff
    style D fill:#ff9f43,color:#fff
    style J fill:#2ed573,color:#fff
```

---

## Prerequisites

Before you begin, verify you have:

- [ ] `kubectl` access to the production Kubernetes cluster
- [ ] `psql` client installed locally or access to a bastion host with it
- [ ] Access to the DNS management console (Route53 / CloudFlare / internal DNS)
- [ ] Access to the secrets management system (Vault / AWS Secrets Manager)
- [ ] PagerDuty/OpsGenie access to notify stakeholders

### Critical Information

| Item | Value |
|---|---|
| Primary host | `pg-primary.db.internal` |
| Replica host(s) | `pg-replica-1.db.internal`, `pg-replica-2.db.internal` |
| Database name | `production` |
| Port | `5432` |
| Admin user | `postgres` (credentials in Vault at `secret/db/postgres-admin`) |
| Application user | `app_user` (credentials in Vault at `secret/db/app-user`) |
| Kubernetes namespace | `database` |
| Dashboard | `https://grafana.example.com/d/postgresql/overview` |
| DNS CNAME | `db-primary.example.com` → points to current primary |

---

## Step 1: Assess the Situation (2 minutes)

### 1.1 Confirm the primary is down

```bash
# Check if primary pod is running
kubectl get pods -n database -l role=primary

# Check pod events for crash information
kubectl describe pod pg-primary-0 -n database | tail -30

# Try to connect to the primary directly
kubectl exec -it pg-replica-1-0 -n database -- pg_isready -h pg-primary.db.internal -p 5432
```

### 1.2 Check replica health

```bash
# Check all replica pods
kubectl get pods -n database -l role=replica

# Check replication status from a replica
kubectl exec -it pg-replica-1-0 -n database -- psql -U postgres -c "
SELECT
    pg_is_in_recovery() as is_replica,
    pg_last_wal_receive_lsn() as last_received,
    pg_last_wal_replay_lsn() as last_replayed,
    pg_last_xact_replay_timestamp() as last_replayed_time,
    NOW() - pg_last_xact_replay_timestamp() as replication_lag
;"
```

### 1.3 Determine replication lag at time of failure

```bash
# This tells you how much data might be lost
kubectl exec -it pg-replica-1-0 -n database -- psql -U postgres -c "
SELECT
    NOW() - pg_last_xact_replay_timestamp() as lag_at_failure,
    pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) as bytes_behind
;"
```

::: warning Data Loss Assessment
If replication lag at the time of failure is greater than 0, some transactions committed on the primary were not replicated. Document the exact lag for the postmortem. Common causes:
- **< 1 second**: Normal async replication — minimal data loss
- **1-10 seconds**: Elevated lag — check for long-running transactions on the primary
- **> 10 seconds**: Significant lag — investigate why replication was behind before proceeding
:::

---

## Step 2: Decide — Recover or Failover (2 minutes)

### Can the primary be recovered quickly?

| Condition | Action | Max Wait Time |
|---|---|---|
| Pod crashed but node is healthy | Restart the pod | 5 minutes |
| Node failure but EBS volume intact | Reschedule to new node | 10 minutes |
| EBS volume failure | **Failover to replica** | Do not wait |
| Unknown cause | **Failover to replica** | 5 minutes |
| Network partition | Verify with multiple paths | 5 minutes |

```bash
# Attempt pod restart (only if appropriate)
kubectl delete pod pg-primary-0 -n database
# Wait for pod to restart (max 5 minutes)
kubectl wait --for=condition=ready pod/pg-primary-0 -n database --timeout=300s
```

::: danger Split-Brain Prevention
**CRITICAL**: Before promoting a replica, you MUST ensure the old primary is truly down and will not come back online. Two primaries accepting writes simultaneously causes data corruption that is extremely difficult to recover from.

```bash
# Fence the old primary — ensure it cannot accept connections
# Option 1: Delete the primary's PVC (prevents restart)
kubectl delete pvc data-pg-primary-0 -n database

# Option 2: Network fence — block all traffic to old primary
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: fence-old-primary
  namespace: database
spec:
  podSelector:
    matchLabels:
      statefulset.kubernetes.io/pod-name: pg-primary-0
  policyTypes:
    - Ingress
    - Egress
EOF
```
:::

---

## Step 3: Promote Replica (5 minutes)

### 3.1 Choose the best replica

```bash
# Compare replication positions across replicas
for replica in pg-replica-1-0 pg-replica-2-0; do
  echo "=== $replica ==="
  kubectl exec -it $replica -n database -- psql -U postgres -c "
    SELECT
      pg_last_wal_receive_lsn() as received,
      pg_last_wal_replay_lsn() as replayed,
      pg_last_xact_replay_timestamp() as last_time
  ;"
done
```

Choose the replica with the highest `pg_last_wal_receive_lsn()` — it has the most recent data.

### 3.2 Promote the chosen replica

```bash
# Method 1: Using pg_promote() (PostgreSQL 12+)
kubectl exec -it pg-replica-1-0 -n database -- psql -U postgres -c "SELECT pg_promote();"

# Method 2: Using pg_ctl
kubectl exec -it pg-replica-1-0 -n database -- pg_ctl promote -D /var/lib/postgresql/data

# Verify promotion succeeded
kubectl exec -it pg-replica-1-0 -n database -- psql -U postgres -c "SELECT pg_is_in_recovery();"
# Should return 'f' (false) — meaning it is now a primary
```

### 3.3 Verify the new primary accepts writes

```bash
# Test write capability
kubectl exec -it pg-replica-1-0 -n database -- psql -U postgres -d production -c "
  CREATE TABLE IF NOT EXISTS failover_test (
    id SERIAL PRIMARY KEY,
    tested_at TIMESTAMP DEFAULT NOW()
  );
  INSERT INTO failover_test (tested_at) VALUES (NOW());
  SELECT * FROM failover_test ORDER BY tested_at DESC LIMIT 1;
  DROP TABLE failover_test;
"
```

::: tip Promotion Verification
Three checks to confirm successful promotion:
1. `pg_is_in_recovery()` returns `false`
2. A test INSERT succeeds
3. The pod logs show "database system is ready to accept connections" (not "read-only mode")
:::

---

## Step 4: Update DNS / Connection Strings (5 minutes)

### 4.1 Update DNS CNAME

```bash
# If using AWS Route53
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "db-primary.example.com",
        "Type": "CNAME",
        "TTL": 60,
        "ResourceRecords": [{"Value": "pg-replica-1.db.internal"}]
      }
    }]
  }'

# If using Kubernetes Service, update the service selector
kubectl patch svc pg-primary -n database -p '{
  "spec": {
    "selector": {
      "statefulset.kubernetes.io/pod-name": "pg-replica-1-0"
    }
  }
}'
```

### 4.2 Update application connection strings (if not using DNS)

```bash
# If connection strings are in ConfigMap
kubectl edit configmap app-config -n production
# Change DATABASE_URL to point to new primary

# If using Vault
vault kv put secret/db/connection-string \
  url="postgresql://app_user:PASSWORD@pg-replica-1.db.internal:5432/production"

# Restart application pods to pick up new connection string
kubectl rollout restart deployment/my-service -n production
```

### 4.3 Verify application connectivity

```bash
# Check that application pods can connect to the new primary
kubectl logs -l app=my-service -n production --since=2m | grep -i "database\|connection\|postgres"

# Verify no connection errors
kubectl logs -l app=my-service -n production --since=2m | grep -ci "connection refused\|connection reset\|timeout"
# Should return 0

# Check application health endpoints
kubectl exec -it $(kubectl get pod -l app=my-service -n production -o jsonpath='{.items[0].metadata.name}') -n production -- curl -s http://localhost:8080/readyz
```

---

## Step 5: Establish New Replication (10 minutes)

### 5.1 Configure remaining replica to follow the new primary

```bash
# On the remaining replica (pg-replica-2-0), update primary_conninfo
kubectl exec -it pg-replica-2-0 -n database -- bash -c "
  cat > /var/lib/postgresql/data/postgresql.auto.conf << 'CONF'
primary_conninfo = 'host=pg-replica-1.db.internal port=5432 user=replicator password=REPL_PASSWORD application_name=replica2'
CONF
"

# Restart the replica to apply
kubectl exec -it pg-replica-2-0 -n database -- pg_ctl restart -D /var/lib/postgresql/data

# Verify replication is working
kubectl exec -it pg-replica-1-0 -n database -- psql -U postgres -c "
SELECT
    application_name,
    client_addr,
    state,
    sent_lsn,
    write_lsn,
    replay_lsn,
    sync_state
FROM pg_stat_replication;
"
```

### 5.2 Verify replication health

```bash
# Confirm replication lag is decreasing
watch -n 5 'kubectl exec -it pg-replica-2-0 -n database -- psql -U postgres -c "
SELECT
    NOW() - pg_last_xact_replay_timestamp() as replication_lag
;"'
```

---

## Step 6: Verify System Health (5 minutes)

### 6.1 Application-level verification

```bash
# Check error rates have returned to normal
# (Check Grafana dashboard: https://grafana.example.com/d/my-service/overview)

# Run a synthetic transaction
curl -X POST https://api.example.com/v1/health/write-test \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Verify read path
curl https://api.example.com/v1/health/read-test \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 6.2 Database-level verification

```bash
# Check for any inconsistencies
kubectl exec -it pg-replica-1-0 -n database -- psql -U postgres -d production -c "
-- Check table sizes are reasonable
SELECT
    schemaname,
    relname as table_name,
    pg_size_pretty(pg_total_relation_size(relid)) as total_size,
    n_live_tup as estimated_rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;
"

# Check for blocked queries
kubectl exec -it pg-replica-1-0 -n database -- psql -U postgres -c "
SELECT
    pid,
    usename,
    state,
    wait_event_type,
    wait_event,
    query_start,
    LEFT(query, 80) as query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;
"
```

---

## Step 7: Notify Stakeholders (5 minutes)

### Communication Template

```markdown
## Incident Update: Database Failover Completed

**Status**: Resolved / Monitoring
**Time of failure**: [HH:MM UTC]
**Time of recovery**: [HH:MM UTC]
**Total downtime**: [X minutes]
**Data loss**: [None / Estimated X seconds of transactions]

### What Happened
The primary PostgreSQL database became unavailable at [time].
Root cause: [crash / node failure / disk failure / unknown — pending investigation].

### What We Did
1. Detected failure via [alert name] at [time]
2. Assessed replica health and replication lag
3. Promoted pg-replica-1 to primary at [time]
4. Updated DNS/connection strings at [time]
5. Verified application connectivity and data integrity
6. Established replication to remaining replica

### Current State
- New primary: pg-replica-1 (healthy, accepting reads and writes)
- Replication: pg-replica-2 following new primary (lag: [X]ms)
- Application: All services healthy, error rates normal

### Follow-Up
- [ ] Provision replacement replica to restore redundancy
- [ ] Investigate root cause of original primary failure
- [ ] Postmortem scheduled for [date/time]

### Contacts
- Incident Commander: @[name]
- Database Team: @[name]
- On-Call: @[name]
```

---

## Post-Failover Tasks

Complete these within 24 hours:

- [ ] Provision a new replica to restore full redundancy
- [ ] Investigate root cause of the primary failure
- [ ] Verify backup schedule is running against the new primary
- [ ] Update monitoring to reflect the new topology
- [ ] Update Kubernetes labels (role=primary on the promoted pod)
- [ ] Update this runbook if the procedure has changed
- [ ] Schedule postmortem if downtime exceeded SLO

### Provisioning a Replacement Replica

```bash
# Create a new replica from the new primary using pg_basebackup
kubectl exec -it pg-new-replica-0 -n database -- pg_basebackup \
  -h pg-replica-1.db.internal \
  -U replicator \
  -D /var/lib/postgresql/data \
  -Fp -Xs -P -R

# The -R flag creates standby.signal and configures recovery
# Start the new replica
kubectl exec -it pg-new-replica-0 -n database -- pg_ctl start -D /var/lib/postgresql/data
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `pg_promote()` returns error | PostgreSQL < 12, or already primary | Use `pg_ctl promote` instead |
| Application still connecting to old primary | DNS TTL not expired / connection pooling | Restart application pods: `kubectl rollout restart` |
| New primary rejects connections | `pg_hba.conf` only allows replication connections | Add application user rules to `pg_hba.conf` |
| Replication to remaining replica fails | Old primary info in `primary_conninfo` | Update `primary_conninfo` to point to new primary |
| Data appears missing after failover | Async replication lag at time of failure | Check WAL gap; data may be unrecoverable |
| Split-brain detected | Old primary came back online | **Immediately** fence old primary. Stop its PostgreSQL process. Do NOT let both accept writes. |

::: danger Split-Brain Recovery
If you discover that both the old primary and the new primary were accepting writes simultaneously, **stop immediately** and escalate to the database team lead. This requires manual data reconciliation and cannot be automated safely. Document the time window of split-brain operation precisely.
:::

---

## Expected Timeline

| Step | Expected Duration | Escalate If |
|---|---|---|
| Assess situation | 2 minutes | > 5 minutes |
| Decide: recover or failover | 2 minutes | > 5 minutes (default: failover) |
| Promote replica | 5 minutes | > 10 minutes |
| Update DNS/connections | 5 minutes | > 10 minutes |
| Establish new replication | 10 minutes | > 20 minutes |
| Verify system health | 5 minutes | Errors persist after 15 minutes |
| **Total** | **~30 minutes** | **> 45 minutes → escalate to VP** |
