---
title: "PostgreSQL DBA Guide"
description: "Production PostgreSQL administration — configuration tuning for shared_buffers, work_mem, and effective_cache_size, vacuum and autovacuum tuning, bloat detection, backup strategies with pg_dump, pgBackRest, and WAL-G, monitoring with pg_stat_statements, connection pooling with PgBouncer, and replication setup"
tags: [postgresql, dba, administration, tuning, backup]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-20"
---

# PostgreSQL DBA Guide

This page is the production reference for PostgreSQL database administration. It covers the decisions and configurations that separate a PostgreSQL instance that runs fine in development from one that survives real production traffic — millions of rows, hundreds of concurrent connections, 99.99% uptime requirements, and the inevitable disk failures and network partitions.

Every section includes specific numbers, configuration values, and monitoring queries. This is not theory — it is a runbook for keeping PostgreSQL healthy in production.

## Configuration Tuning

PostgreSQL ships with conservative defaults designed to run on a laptop with 512MB of RAM. A production server with 64GB RAM running the default configuration is leaving 95% of its resources unused.

### Memory Configuration

```mermaid
graph TB
    subgraph RAM["Server RAM (64 GB example)"]
        SB["shared_buffers<br/>16 GB (25%)"]
        OS_CACHE["OS Page Cache<br/>~32 GB"]
        WM["work_mem<br/>per-sort allocation"]
        MM["maintenance_work_mem<br/>per-maintenance operation"]
        OTHER["Other processes<br/>+ overhead"]
    end

    style SB fill:#4f46e5,color:#fff
    style OS_CACHE fill:#059669,color:#fff
    style WM fill:#f59e0b,color:#000
```

### Key Parameters

| Parameter | Default | Recommended | Formula |
|-----------|---------|-------------|---------|
| `shared_buffers` | 128MB | 25% of RAM | 16GB for 64GB server |
| `effective_cache_size` | 4GB | 75% of RAM | 48GB for 64GB server |
| `work_mem` | 4MB | RAM / (max_connections * 4) | 32-64MB typical |
| `maintenance_work_mem` | 64MB | RAM / 16 | 1-2GB |
| `wal_buffers` | -1 (auto) | 64MB | 1/32 of shared_buffers, max 64MB |
| `max_connections` | 100 | 100-300 | Use PgBouncer for more |
| `effective_io_concurrency` | 1 | 200 (SSD) | 1 for HDD, 200 for SSD |
| `random_page_cost` | 4.0 | 1.1 (SSD) | 4.0 for HDD, 1.1 for SSD |

### Configuration File

```ini
# postgresql.conf — production tuning for 64GB RAM, SSD storage

# Memory
shared_buffers = '16GB'
effective_cache_size = '48GB'
work_mem = '64MB'
maintenance_work_mem = '2GB'
wal_buffers = '64MB'
huge_pages = try

# Connections
max_connections = 200
superuser_reserved_connections = 3

# Disk
effective_io_concurrency = 200
random_page_cost = 1.1
seq_page_cost = 1.0

# WAL
wal_level = replica
max_wal_size = '4GB'
min_wal_size = '1GB'
checkpoint_completion_target = 0.9
checkpoint_timeout = '15min'

# Query Planner
default_statistics_target = 200
enable_partitionwise_join = on
enable_partitionwise_aggregate = on
jit = on

# Parallel Query
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
max_parallel_maintenance_workers = 4

# Logging
log_min_duration_statement = 1000        # Log queries > 1 second
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
log_temp_files = 0                        # Log all temp file usage
log_autovacuum_min_duration = 250         # Log autovacuum > 250ms
log_line_prefix = '%t [%p] %u@%d '
```

::: warning work_mem Trap
`work_mem` is allocated per-sort, per-hash-join, per-operation — not per-query. A complex query with five sort operations consumes 5x `work_mem`. With 200 concurrent connections, setting `work_mem = 256MB` can consume 200 * 5 * 256MB = 250GB — far exceeding your RAM. Start conservative (32-64MB) and increase only for specific queries using `SET LOCAL work_mem = '256MB'` in transactions that need it.
:::

## Vacuum and Autovacuum

PostgreSQL's MVCC implementation means that `UPDATE` and `DELETE` do not immediately remove old row versions. They create "dead tuples" that consume space. `VACUUM` reclaims this space. Without vacuum, tables grow without bound, queries slow down, and eventually the transaction ID counter wraps around (the "transaction ID wraparound" failure — the one PostgreSQL failure that can cause data loss).

### How MVCC Creates Dead Tuples

```mermaid
graph LR
    subgraph Before["Before UPDATE"]
        T1["Tuple v1<br/>name='Alice'<br/>xmin=100, xmax=∞"]
    end

    subgraph After["After UPDATE (name='Bob')"]
        T2["Tuple v1 (DEAD)<br/>name='Alice'<br/>xmin=100, xmax=200"]
        T3["Tuple v2 (LIVE)<br/>name='Bob'<br/>xmin=200, xmax=∞"]
    end

    Before -->|"UPDATE"| After

    style T2 fill:#dc2626,color:#fff
    style T3 fill:#059669,color:#fff
```

### Autovacuum Tuning

```ini
# postgresql.conf — autovacuum tuning for high-write workloads

# Enable autovacuum (NEVER disable this)
autovacuum = on

# Number of autovacuum workers
autovacuum_max_workers = 5            # Default: 3. Increase for many tables.

# How often the launcher checks for work
autovacuum_naptime = '30s'            # Default: 1min. Reduce for faster cleanup.

# When to trigger vacuum
autovacuum_vacuum_threshold = 50      # Minimum dead tuples before considering
autovacuum_vacuum_scale_factor = 0.05 # 5% of table (default 20% is too high)

# When to trigger analyze
autovacuum_analyze_threshold = 50
autovacuum_analyze_scale_factor = 0.02  # 2% of table

# Cost-based vacuum delay (prevents vacuum from starving queries)
autovacuum_vacuum_cost_delay = '2ms'   # Default: 2ms
autovacuum_vacuum_cost_limit = 1000    # Default: -1 (uses vacuum_cost_limit=200)
                                       # Increase to make vacuum faster

# Per-table override for critical high-write tables
# ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.01);
# ALTER TABLE orders SET (autovacuum_vacuum_cost_limit = 2000);
```

### Autovacuum Decision Formula

Autovacuum triggers when:

```
dead_tuples > autovacuum_vacuum_threshold + (autovacuum_vacuum_scale_factor * reltuples)
```

| Table Size | Default (20% scale) | Tuned (5% scale) |
|-----------|---------------------|-------------------|
| 1,000 rows | 250 dead tuples | 100 dead tuples |
| 100,000 rows | 20,050 dead tuples | 5,050 dead tuples |
| 10,000,000 rows | 2,000,050 dead tuples | 500,050 dead tuples |

With the default 20% scale factor, a 10-million-row table accumulates 2 million dead tuples before vacuum runs. This is too many. Reduce `autovacuum_vacuum_scale_factor` to 0.05 or lower for large tables.

::: danger Transaction ID Wraparound
PostgreSQL uses 32-bit transaction IDs. After ~2 billion transactions without vacuum, the counter wraps around and existing data becomes invisible. PostgreSQL will shut down to prevent data loss. Monitor `age(datfrozenxid)` and ensure autovacuum is keeping up:

```sql
SELECT datname, age(datfrozenxid) AS xid_age,
       current_setting('autovacuum_freeze_max_age')::bigint AS freeze_max
FROM pg_database
ORDER BY xid_age DESC;
-- Alert if xid_age > 500,000,000
```
:::

## Bloat Detection and Management

Bloat occurs when dead tuples accumulate faster than vacuum can reclaim them. Bloated tables are larger than necessary and queries scan more pages than needed.

### Detecting Table Bloat

```sql
-- Table bloat estimate using pgstattuple extension
CREATE EXTENSION IF NOT EXISTS pgstattuple;

SELECT
    schemaname || '.' || relname AS table_name,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    n_dead_tup AS dead_tuples,
    n_live_tup AS live_tuples,
    CASE WHEN n_live_tup > 0
        THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
        ELSE 0
    END AS dead_pct,
    last_autovacuum,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;
```

### Detecting Index Bloat

```sql
-- Index bloat estimation
SELECT
    schemaname || '.' || indexrelname AS index_name,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    idx_scan AS index_scans,
    CASE WHEN idx_scan = 0 THEN 'UNUSED — consider dropping'
         ELSE 'Active'
    END AS usage_status
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;
```

### Fixing Bloat

| Method | Downtime | Locks | Best For |
|--------|----------|-------|----------|
| `VACUUM` | None | ShareUpdateExclusiveLock | Routine maintenance |
| `VACUUM FULL` | Table offline | AccessExclusiveLock | Severe bloat (last resort) |
| `pg_repack` | None | Brief lock at end | Reclaiming space without downtime |
| `REINDEX CONCURRENTLY` | None | ShareUpdateExclusiveLock | Index-only bloat |

```bash
# pg_repack — online table reorganization (no downtime)
# Install: apt install postgresql-16-repack
pg_repack -d mydb -t orders --no-superuser-check
pg_repack -d mydb --only-indexes -t orders
```

::: tip pg_repack Over VACUUM FULL
Never use `VACUUM FULL` in production — it locks the entire table for the duration. Use `pg_repack` instead, which rebuilds the table online and only takes a brief exclusive lock at the end to swap the old and new table files.
:::

## Backup Strategies

### Backup Method Comparison

| Method | Type | Point-in-Time Recovery | Speed | Complexity |
|--------|------|----------------------|-------|------------|
| `pg_dump` | Logical | No | Slow (large DBs) | Low |
| `pg_basebackup` | Physical | Yes (with WAL archiving) | Medium | Medium |
| pgBackRest | Physical | Yes | Fast (parallel, incremental) | Medium |
| WAL-G | Physical | Yes | Fast (cloud-native) | Medium |

### pg_dump (Logical Backup)

```bash
# Full database dump (compressed, custom format)
pg_dump -Fc -Z 6 -j 4 \
  -h localhost -U postgres -d mydb \
  -f /backups/mydb_$(date +%Y%m%d_%H%M%S).dump

# Restore
pg_restore -j 4 -d mydb_restored /backups/mydb_20260320_120000.dump

# Schema-only dump
pg_dump -s -d mydb -f schema.sql

# Data-only dump for a specific table
pg_dump -a -t orders -d mydb -f orders_data.sql
```

### pgBackRest (Production Recommended)

```ini
# /etc/pgbackrest/pgbackrest.conf
[global]
repo1-type=s3
repo1-path=/pgbackrest
repo1-s3-bucket=my-pg-backups
repo1-s3-endpoint=s3.us-east-1.amazonaws.com
repo1-s3-region=us-east-1
repo1-s3-key=AKIAIOSFODNN7EXAMPLE
repo1-s3-key-secret=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
repo1-retention-full=4
repo1-retention-diff=14
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=your-encryption-password
compress-type=zst
compress-level=3
process-max=4

[mydb]
pg1-path=/var/lib/postgresql/16/main
pg1-port=5432
```

```bash
# Initial full backup
pgbackrest --stanza=mydb stanza-create
pgbackrest --stanza=mydb backup --type=full

# Incremental backup (daily)
pgbackrest --stanza=mydb backup --type=incr

# Differential backup (weekly)
pgbackrest --stanza=mydb backup --type=diff

# Point-in-time recovery
pgbackrest --stanza=mydb \
  --target="2026-03-20 14:30:00" \
  --target-action=promote \
  restore
```

### Backup Schedule

```mermaid
graph LR
    subgraph Schedule["Backup Schedule"]
        FULL["Full Backup<br/>Weekly (Sunday)"]
        DIFF["Differential<br/>Daily"]
        WAL["WAL Archiving<br/>Continuous"]
    end

    FULL --> S3["S3 / GCS<br/>(encrypted, versioned)"]
    DIFF --> S3
    WAL --> S3

    S3 --> PITR["Point-in-Time Recovery<br/>(any second in retention)"]

    style FULL fill:#4f46e5,color:#fff
    style DIFF fill:#059669,color:#fff
    style WAL fill:#f59e0b,color:#000
```

::: warning Test Your Backups
A backup that has never been restored is not a backup — it is a hope. Schedule monthly restore tests to a separate server. Automate the test: restore, run a validation query, report success/failure.
:::

## Monitoring

### Essential Monitoring Queries

```sql
-- 1. Active connections and state
SELECT state, count(*)
FROM pg_stat_activity
GROUP BY state;

-- 2. Long-running queries (> 60 seconds)
SELECT pid, now() - pg_stat_activity.query_start AS duration,
       query, state, wait_event_type, wait_event
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '60 seconds'
  AND state != 'idle'
ORDER BY duration DESC;

-- 3. Table sizes and row counts
SELECT
    schemaname || '.' || relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
    n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

-- 4. Index usage (find unused indexes)
SELECT
    schemaname || '.' || indexrelname AS index_name,
    idx_scan AS times_used,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- 5. Cache hit ratio (should be > 99%)
SELECT
    sum(heap_blks_read) AS heap_read,
    sum(heap_blks_hit) AS heap_hit,
    round(sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read) + 1)::numeric * 100, 2) AS cache_hit_ratio
FROM pg_statio_user_tables;
```

### pg_stat_statements

`pg_stat_statements` tracks execution statistics for all SQL statements. It is the single most important extension for PostgreSQL performance monitoring.

```sql
-- Enable (requires restart)
-- shared_preload_libraries = 'pg_stat_statements'
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 slowest queries by total time
SELECT
    round(total_exec_time::numeric, 2) AS total_time_ms,
    calls,
    round(mean_exec_time::numeric, 2) AS mean_time_ms,
    round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) AS pct_total,
    left(query, 100) AS query_preview
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Top 10 most called queries
SELECT
    calls,
    round(mean_exec_time::numeric, 2) AS mean_time_ms,
    round(total_exec_time::numeric, 2) AS total_time_ms,
    rows,
    left(query, 100) AS query_preview
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;

-- Queries with worst cache hit ratio
SELECT
    calls,
    shared_blks_hit,
    shared_blks_read,
    round(shared_blks_hit::numeric / nullif(shared_blks_hit + shared_blks_read, 0) * 100, 2) AS hit_ratio,
    left(query, 100) AS query_preview
FROM pg_stat_statements
WHERE shared_blks_hit + shared_blks_read > 100
ORDER BY hit_ratio ASC
LIMIT 10;
```

### Monitoring Dashboard Metrics

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Cache hit ratio | `pg_statio_user_tables` | < 99% |
| Connection count | `pg_stat_activity` | > 80% of `max_connections` |
| Replication lag | `pg_stat_replication` | > 30 seconds |
| Dead tuple ratio | `pg_stat_user_tables` | > 10% of live tuples |
| Transaction ID age | `pg_database.datfrozenxid` | > 500M |
| Long-running queries | `pg_stat_activity` | > 5 minutes |
| Lock waits | `pg_locks` + `pg_stat_activity` | > 30 seconds |
| WAL generation rate | `pg_stat_wal` | Sustained > 100MB/s |
| Disk usage | OS-level | > 80% |

## Connection Pooling with PgBouncer

PostgreSQL creates a new OS process for each connection. With 500+ connections, the overhead of context switching and memory consumption degrades performance. PgBouncer solves this by maintaining a pool of database connections shared across application connections.

```mermaid
graph LR
    subgraph Apps["Application Instances"]
        A1["App 1 (50 conns)"]
        A2["App 2 (50 conns)"]
        A3["App 3 (50 conns)"]
    end

    subgraph PGB["PgBouncer"]
        POOL["Connection Pool<br/>(20 actual connections)"]
    end

    A1 --> PGB
    A2 --> PGB
    A3 --> PGB
    PGB --> PG["PostgreSQL<br/>(20 backend processes)"]

    style PGB fill:#4f46e5,color:#fff
```

### PgBouncer Configuration

```ini
# pgbouncer.ini
[databases]
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

# Pool mode
pool_mode = transaction    # Recommended for most apps

# Pool sizing
default_pool_size = 20     # Connections per user/database pair
min_pool_size = 5          # Keep at least 5 connections warm
reserve_pool_size = 5      # Extra connections for bursts
reserve_pool_timeout = 3   # Seconds before using reserve pool

# Connection limits
max_client_conn = 500      # Max client connections to PgBouncer
max_db_connections = 50    # Max backend connections per database

# Timeouts
server_idle_timeout = 600  # Close idle backend connections after 10min
client_idle_timeout = 0    # Never close idle client connections
query_timeout = 30         # Kill queries longer than 30s
query_wait_timeout = 120   # Error if no pool connection available in 2min

# Logging
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
stats_period = 60
```

### Pool Modes

| Mode | Connection Reuse | Best For | Limitation |
|------|-----------------|---------|-----------|
| `session` | After client disconnects | `LISTEN/NOTIFY`, prepared statements | No multiplexing benefit |
| `transaction` | After each transaction | Most applications | No cross-transaction state |
| `statement` | After each statement | Simple queries | No multi-statement transactions |

::: tip Transaction Mode Is Almost Always Right
Use `transaction` pool mode. It provides the best connection multiplexing. The only limitation is that session-level features (`SET`, `PREPARE`, `LISTEN`) do not persist between transactions. If your ORM uses prepared statements, configure it to use protocol-level prepared statements or disable them.
:::

## Replication Setup

### Streaming Replication

```ini
# Primary server — postgresql.conf
wal_level = replica
max_wal_senders = 10
wal_keep_size = '2GB'

# Primary server — pg_hba.conf
host    replication     replicator    10.0.0.0/24    scram-sha-256
```

```bash
# Create replication user on primary
psql -c "CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'secure_password';"

# Create base backup for replica
pg_basebackup -h primary-host -U replicator -D /var/lib/postgresql/16/main -Fp -Xs -P -R

# The -R flag creates standby.signal and sets primary_conninfo in postgresql.auto.conf
```

### Monitoring Replication Lag

```sql
-- On primary: check replication status
SELECT
    client_addr,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes,
    pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS replay_lag_pretty
FROM pg_stat_replication;

-- On replica: confirm it is in recovery mode
SELECT pg_is_in_recovery();

-- On replica: check lag from the replica side
SELECT now() - pg_last_xact_replay_timestamp() AS replay_lag;
```

## Cross-References

- [PostgreSQL Internals](/system-design/databases/postgres-internals) — architecture, MVCC, and query execution
- [Connection Pooling](/system-design/databases/connection-pooling) — detailed pooling strategies
- [Replication](/system-design/databases/replication) — replication patterns and failure scenarios
- [Indexing Deep Dive](/system-design/databases/indexing-deep-dive) — B-tree, GiST, GIN indexes
- [Query Planning & Optimization](/system-design/databases/query-planning-optimization) — EXPLAIN ANALYZE

## Summary

| Area | Key Action |
|------|-----------|
| Memory | `shared_buffers` = 25% RAM, `effective_cache_size` = 75% RAM |
| Vacuum | Reduce `autovacuum_vacuum_scale_factor` to 0.05, increase workers |
| Bloat | Monitor dead tuple ratio, use `pg_repack` for online rebuilds |
| Backups | pgBackRest to S3 — full weekly, incremental daily, continuous WAL |
| Monitoring | `pg_stat_statements` for query performance, cache hit ratio > 99% |
| Connection pooling | PgBouncer in transaction mode, 20 backend connections |
| Replication | Streaming replication with continuous monitoring of lag |

PostgreSQL administration is not about learning every parameter — it is about understanding the ten parameters that matter, monitoring the five metrics that predict failures, and having a backup strategy that you have actually tested. If your cache hit ratio is above 99%, your autovacuum is keeping up, and you can restore from backup in under an hour, your PostgreSQL instance is in good shape.
