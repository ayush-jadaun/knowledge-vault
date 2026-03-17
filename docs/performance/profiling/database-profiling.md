---
title: "Database Profiling"
description: "Deep dive into database performance profiling — EXPLAIN ANALYZE for PostgreSQL, slow query log for MySQL, query plan visualization, index usage analysis, pg_stat_statements, and auto_explain for production query monitoring"
tags: [database, profiling, postgres, mysql, explain-analyze, query-plans, pg-stat-statements, slow-query-log, index-analysis, auto-explain]
difficulty: advanced
prerequisites: [performance/profiling]
lastReviewed: "2026-03-17"
---

# Database Profiling

The database is the most common bottleneck in web applications. A single missing index can turn a 2ms query into a 20-second table scan. A single N+1 query pattern can multiply your database load by 100x. This page provides a comprehensive guide to finding and fixing database performance problems using the tools built into PostgreSQL and MySQL.

## EXPLAIN ANALYZE — The Most Important Command in Database Profiling

`EXPLAIN ANALYZE` does two things: it runs the query AND shows you exactly how the database executed it — what indexes it used, how many rows it scanned, how long each step took, and where time was spent.

### Basic Usage (PostgreSQL)

```sql
-- EXPLAIN alone shows the plan WITHOUT running the query
EXPLAIN SELECT * FROM orders WHERE user_id = 12345;

-- EXPLAIN ANALYZE actually runs the query and shows real timing
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 12345;

-- EXPLAIN (ANALYZE, BUFFERS) shows I/O statistics too
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders WHERE user_id = 12345;

-- EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) gives machine-readable output
-- with additional detail like actual loops, output rows, etc.
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM orders WHERE user_id = 12345;
```

::: warning
`EXPLAIN ANALYZE` actually **executes** the query. For `UPDATE`, `DELETE`, or `INSERT` statements, wrap it in a transaction and roll back:

```sql
BEGIN;
EXPLAIN ANALYZE UPDATE orders SET status = 'shipped' WHERE id = 12345;
ROLLBACK; -- Undo the actual update
```
:::

### Reading EXPLAIN ANALYZE Output

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o.total, u.name
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.created_at > '2025-01-01'
  AND o.status = 'completed'
ORDER BY o.total DESC
LIMIT 10;
```

Output:

```
Limit  (cost=15234.56..15234.59 rows=10 width=52) (actual time=89.234..89.248 rows=10 loops=1)
  Buffers: shared hit=4521 read=892
  ->  Sort  (cost=15234.56..15347.89 rows=45332 width=52) (actual time=89.232..89.240 rows=10 loops=1)
        Sort Key: o.total DESC
        Sort Method: top-N heapsort  Memory: 26kB
        Buffers: shared hit=4521 read=892
        ->  Hash Join  (cost=1234.56..14567.89 rows=45332 width=52) (actual time=12.345..78.901 rows=45332 loops=1)
              Hash Cond: (o.user_id = u.id)
              Buffers: shared hit=4521 read=892
              ->  Bitmap Heap Scan on orders o  (cost=567.89..12345.67 rows=45332 width=36) (actual time=5.678..56.789 rows=45332 loops=1)
                    Recheck Cond: (created_at > '2025-01-01'::date)
                    Filter: (status = 'completed')
                    Rows Removed by Filter: 23456
                    Heap Blocks: exact=3456
                    Buffers: shared hit=3456 read=892
                    ->  Bitmap Index Scan on idx_orders_created_at  (cost=0.00..456.78 rows=68788 width=0) (actual time=4.567..4.567 rows=68788 loops=1)
                          Index Cond: (created_at > '2025-01-01'::date)
                          Buffers: shared hit=234
              ->  Hash  (cost=456.78..456.78 rows=50000 width=20) (actual time=6.543..6.543 rows=50000 loops=1)
                    Buckets: 65536  Batches: 1  Memory Usage: 2948kB
                    Buffers: shared hit=1065
                    ->  Seq Scan on users u  (cost=0.00..456.78 rows=50000 width=20) (actual time=0.012..3.456 rows=50000 loops=1)
                          Buffers: shared hit=1065
Planning Time: 0.345 ms
Execution Time: 89.456 ms
```

### Anatomy of Each Node

Every line in the plan is a **node** — an operation the database performs. Let's break down one node:

```
Bitmap Heap Scan on orders o  (cost=567.89..12345.67 rows=45332 width=36)
                              (actual time=5.678..56.789 rows=45332 loops=1)
  Recheck Cond: (created_at > '2025-01-01'::date)
  Filter: (status = 'completed')
  Rows Removed by Filter: 23456
  Heap Blocks: exact=3456
  Buffers: shared hit=3456 read=892
```

| Field | Meaning |
|-------|---------|
| `Bitmap Heap Scan` | The operation type (scan method) |
| `on orders o` | The table being scanned |
| `cost=567.89..12345.67` | **Estimated** startup cost .. total cost (arbitrary units) |
| `rows=45332` (in cost line) | **Estimated** number of rows |
| `width=36` | Estimated average row width in bytes |
| `actual time=5.678..56.789` | **Actual** startup time .. total time in milliseconds |
| `rows=45332` (in actual line) | **Actual** number of rows returned |
| `loops=1` | How many times this node was executed |
| `Recheck Cond` | Condition rechecked after bitmap (lossy blocks) |
| `Filter` | Additional filter applied AFTER the index |
| `Rows Removed by Filter: 23456` | Rows that passed the index but failed the filter — **red flag** |
| `Heap Blocks: exact=3456` | Number of heap pages accessed |
| `Buffers: shared hit=3456 read=892` | Buffer cache hits and disk reads |

**Key insight: `Rows Removed by Filter`** — When this number is large, it means the index brought in many rows that were then discarded. This is a sign that you need a better index. In this example, a composite index on `(created_at, status)` would eliminate the 23,456 filtered rows.

### Scan Types — From Best to Worst

| Scan Type | Meaning | Performance |
|-----------|---------|-------------|
| **Index Only Scan** | All needed data is in the index itself | Best — no heap access |
| **Index Scan** | Uses index to find rows, then fetches from heap | Good — for selective queries |
| **Bitmap Index Scan + Bitmap Heap Scan** | Uses index to build a bitmap of matching pages, then reads pages | Good — for moderately selective queries |
| **Seq Scan (Sequential Scan)** | Reads every row in the table | Worst for selective queries — but correct for full-table reads |

::: info When Sequential Scans Are Fine
Sequential scans are not always bad. If you are reading more than ~10-20% of the table, a sequential scan is actually *faster* than an index scan because sequential I/O is much faster than random I/O. PostgreSQL's planner knows this and will choose a sequential scan when it estimates a large fraction of the table will be read.

The problem is when you see a sequential scan on a table with millions of rows for a query that should return 10 rows. That is a missing index.
:::

### Join Types

| Join Type | How It Works | Best When |
|-----------|-------------|-----------|
| **Nested Loop** | For each row in outer table, scan inner table | Inner table is small or has an index |
| **Hash Join** | Build hash table from smaller relation, probe with larger | Equi-joins on larger datasets |
| **Merge Join** | Sort both relations, merge | Both inputs are already sorted (or index-ordered) |

```
-- Nested Loop: O(n*m) worst case, but fast with index on inner table
Nested Loop  (actual time=0.1..5.0 rows=100 loops=1)
  ->  Index Scan on orders  (actual time=0.05..0.5 rows=100 loops=1)
  ->  Index Scan on users   (actual time=0.01..0.01 rows=1 loops=100)
        ← This is fast because it runs 100 times with an index lookup each time

-- Hash Join: O(n+m) — builds hash table then probes
Hash Join  (actual time=10.0..50.0 rows=100000 loops=1)
  ->  Seq Scan on orders  (actual time=0.1..30.0 rows=100000 loops=1)
  ->  Hash  (actual time=5.0..5.0 rows=50000 loops=1)
        ->  Seq Scan on users  (actual time=0.1..3.0 rows=50000 loops=1)

-- Merge Join: O(n log n + m log m) — sort both then merge
Merge Join  (actual time=20.0..40.0 rows=100000 loops=1)
  ->  Sort on orders.user_id  (actual time=10.0..15.0)
  ->  Sort on users.id        (actual time=8.0..10.0)
```

## Slow Query Log (MySQL)

### Enabling the Slow Query Log

```sql
-- Check current settings
SHOW VARIABLES LIKE 'slow_query%';
SHOW VARIABLES LIKE 'long_query_time';

-- Enable slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1; -- Log queries taking > 1 second
SET GLOBAL log_queries_not_using_indexes = 'ON'; -- Also log queries without indexes
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';

-- For persistent configuration, add to my.cnf:
-- [mysqld]
-- slow_query_log = 1
-- long_query_time = 0.5
-- log_queries_not_using_indexes = 1
-- slow_query_log_file = /var/log/mysql/slow.log
```

### Analyzing with `mysqldumpslow`

```bash
# Show top 10 slowest queries
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log

# Show top 10 most frequent slow queries
mysqldumpslow -s c -t 10 /var/log/mysql/slow.log

# Show top 10 by average time
mysqldumpslow -s at -t 10 /var/log/mysql/slow.log

# Output example:
# Count: 1547  Time=2.34s (3618s)  Lock=0.00s (1s)  Rows=1.0 (1547)
#   SELECT * FROM orders WHERE user_id = N AND status = 'S'
```

### Analyzing with `pt-query-digest` (Percona Toolkit)

```bash
# More detailed analysis than mysqldumpslow
pt-query-digest /var/log/mysql/slow.log

# Output includes:
# - Response time distribution (histogram)
# - Query fingerprint (normalized query)
# - EXPLAIN output for each query
# - Table usage statistics
# - Lock time analysis
```

### MySQL EXPLAIN

```sql
-- MySQL's EXPLAIN output
EXPLAIN SELECT * FROM orders WHERE user_id = 12345 AND status = 'completed';

-- Output:
-- +----+-------------+--------+------+---------------+---------+---------+-------+------+-------------+
-- | id | select_type | table  | type | possible_keys | key     | key_len | ref   | rows | Extra       |
-- +----+-------------+--------+------+---------------+---------+---------+-------+------+-------------+
-- |  1 | SIMPLE      | orders | ref  | idx_user_id   | idx_uid | 4       | const | 150  | Using where |
-- +----+-------------+--------+------+---------------+---------+---------+-------+------+-------------+

-- MySQL 8.0+ supports EXPLAIN ANALYZE (tree format)
EXPLAIN ANALYZE
SELECT o.id, o.total, u.name
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.status = 'completed'
ORDER BY o.total DESC
LIMIT 10;
```

**MySQL EXPLAIN `type` column (best to worst):**

| Type | Meaning | Performance |
|------|---------|-------------|
| `system` | Table has one row | Best |
| `const` | At most one matching row (primary key lookup) | Excellent |
| `eq_ref` | One row from this table for each row from previous | Very good (unique index join) |
| `ref` | All rows with matching index value | Good |
| `range` | Index range scan | Good |
| `index` | Full index scan (reads all index entries) | Moderate |
| `ALL` | Full table scan | Worst |

## Query Plan Visualization

### pgAdmin's Visual EXPLAIN

pgAdmin (PostgreSQL's GUI tool) provides a visual representation of query plans:

- Each node is a box with its operation type
- Box width represents estimated cost
- Arrows show data flow between nodes
- Colors indicate performance (green = fast, red = slow)
- Hovering shows detailed statistics

### explain.dalibo.com

Paste your `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` output into [explain.dalibo.com](https://explain.dalibo.com) for an interactive visualization with:

- Node-by-node timing breakdown
- Buffer usage visualization
- Planning vs. actual row estimate accuracy
- Automatic identification of problematic nodes

### explain.depesz.com

Another excellent visualizer at [explain.depesz.com](https://explain.depesz.com):

- Color-coded rows (red = slow, yellow = moderate)
- "Exclusive" vs. "Inclusive" timing (similar to self vs. total)
- Row estimate accuracy highlighting (when estimates are way off, the planner may make bad decisions)

## Index Usage Analysis

### Finding Unused Indexes (PostgreSQL)

```sql
-- Indexes that have NEVER been used (since last stats reset)
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    idx_scan AS times_used,
    idx_tup_read AS tuples_read,
    idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- This query might reveal:
-- indexname                  | index_size | times_used
-- idx_orders_legacy_status   | 256 MB     | 0
-- idx_users_old_email        | 128 MB     | 0
-- These indexes waste disk space and slow down writes — drop them.
```

### Finding Missing Indexes (PostgreSQL)

```sql
-- Tables with high sequential scan counts (potential missing indexes)
SELECT
    schemaname,
    relname AS table_name,
    seq_scan,
    seq_tup_read,
    idx_scan,
    CASE WHEN seq_scan + idx_scan > 0
         THEN round(100.0 * idx_scan / (seq_scan + idx_scan), 1)
         ELSE 0
    END AS index_usage_pct,
    n_live_tup AS estimated_rows
FROM pg_stat_user_tables
WHERE n_live_tup > 10000  -- Only tables with significant data
ORDER BY seq_tup_read DESC
LIMIT 20;

-- If a table has millions of rows but index_usage_pct is < 90%,
-- you likely have queries that would benefit from an index.
```

### Index Efficiency Analysis

```sql
-- For each index, show how much of the table it covers
-- and how selective it is
SELECT
    indexrelname AS index_name,
    relname AS table_name,
    pg_size_pretty(pg_relation_size(idx.indexrelid)) AS index_size,
    pg_size_pretty(pg_relation_size(idx.relid)) AS table_size,
    round(100.0 * pg_relation_size(idx.indexrelid) /
          NULLIF(pg_relation_size(idx.relid), 0), 1) AS index_to_table_pct,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    CASE WHEN idx_tup_read > 0
         THEN round(100.0 * idx_tup_fetch / idx_tup_read, 1)
         ELSE 0
    END AS fetch_pct
FROM pg_stat_user_indexes idx
JOIN pg_stat_user_tables tab ON idx.relid = tab.relid
WHERE idx_scan > 0
ORDER BY pg_relation_size(idx.indexrelid) DESC;

-- fetch_pct close to 100% = index is very selective (good)
-- fetch_pct close to 0% = index returns many rows that are filtered out (bad)
```

## pg_stat_statements — Production Query Monitoring

`pg_stat_statements` is a PostgreSQL extension that tracks execution statistics for all SQL statements. It is the single most important tool for ongoing database performance management.

### Setup

```sql
-- Add to postgresql.conf:
-- shared_preload_libraries = 'pg_stat_statements'
-- pg_stat_statements.max = 10000
-- pg_stat_statements.track = all

-- After restarting PostgreSQL:
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### Finding the Slowest Queries

```sql
-- Top 20 queries by total execution time
SELECT
    round(total_exec_time::numeric, 2) AS total_time_ms,
    calls,
    round(mean_exec_time::numeric, 2) AS avg_time_ms,
    round(stddev_exec_time::numeric, 2) AS stddev_ms,
    round((100.0 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) AS pct_of_total,
    rows,
    round(rows::numeric / NULLIF(calls, 0), 0) AS avg_rows,
    query
FROM pg_stat_statements
WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
ORDER BY total_exec_time DESC
LIMIT 20;
```

### Finding Queries with Most I/O

```sql
-- Queries causing the most disk I/O (buffer reads)
SELECT
    round(total_exec_time::numeric, 2) AS total_time_ms,
    calls,
    shared_blks_read + shared_blks_written AS total_io_blocks,
    round((shared_blks_read + shared_blks_written)::numeric / NULLIF(calls, 0), 0) AS io_per_call,
    shared_blks_hit,
    round(100.0 * shared_blks_hit /
          NULLIF(shared_blks_hit + shared_blks_read, 0)::numeric, 1) AS cache_hit_pct,
    query
FROM pg_stat_statements
ORDER BY (shared_blks_read + shared_blks_written) DESC
LIMIT 20;

-- cache_hit_pct < 90% means this query is hitting disk frequently
-- Consider: more RAM (shared_buffers), better indexes, or query optimization
```

### Finding Queries with Bad Estimates (Row Estimation Errors)

```sql
-- Queries where actual rows differ significantly from estimated
-- (These queries may have suboptimal plans)
SELECT
    calls,
    round(mean_exec_time::numeric, 2) AS avg_time_ms,
    rows AS total_rows,
    round(rows::numeric / NULLIF(calls, 0), 0) AS avg_rows,
    query
FROM pg_stat_statements
WHERE calls > 100
  AND mean_exec_time > 10 -- Only slow queries
ORDER BY mean_exec_time DESC
LIMIT 20;

-- To fix row estimation errors:
-- 1. Run ANALYZE on the affected tables
-- 2. Increase default_statistics_target for columns with skewed distributions
-- 3. Create extended statistics for correlated columns
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;
ANALYZE orders;

-- Extended statistics for correlated columns (PostgreSQL 10+)
CREATE STATISTICS orders_status_date (dependencies, ndistinct, mcv)
ON status, created_at FROM orders;
ANALYZE orders;
```

### Resetting Statistics

```sql
-- Reset all pg_stat_statements data (do after schema changes or deployments)
SELECT pg_stat_statements_reset();

-- Reset table/index statistics (do after major data changes)
SELECT pg_stat_reset();
```

## auto_explain — Automatic Query Plan Logging

`auto_explain` automatically logs the execution plan of queries that exceed a time threshold. This is invaluable for catching slow queries in production without having to manually run `EXPLAIN ANALYZE`.

### Setup

```sql
-- Add to postgresql.conf:
-- shared_preload_libraries = 'auto_explain'
-- auto_explain.log_min_duration = 1000       -- Log plans for queries > 1 second
-- auto_explain.log_analyze = true            -- Include ANALYZE output (actual timing)
-- auto_explain.log_buffers = true            -- Include buffer usage
-- auto_explain.log_timing = true             -- Include per-node timing
-- auto_explain.log_nested_statements = true  -- Include nested statements (inside functions)
-- auto_explain.log_format = 'json'           -- Machine-readable output

-- Or enable per-session for testing:
LOAD 'auto_explain';
SET auto_explain.log_min_duration = 500; -- 500ms threshold
SET auto_explain.log_analyze = true;
SET auto_explain.log_buffers = true;
```

### Interpreting auto_explain Output

When a query exceeds the threshold, the plan appears in the PostgreSQL log:

```
LOG:  duration: 2345.678 ms  plan:
Query Text: SELECT o.*, u.name FROM orders o JOIN users u ON u.id = o.user_id
            WHERE o.created_at BETWEEN '2025-01-01' AND '2025-12-31'
            AND o.status IN ('completed', 'shipped')
            ORDER BY o.created_at DESC

Nested Loop  (cost=0.85..234567.89 rows=150000 width=256) (actual time=0.123..2340.567 rows=148923 loops=1)
  Buffers: shared hit=45678 read=12345
  ->  Index Scan Backward using idx_orders_created_at on orders o
      (cost=0.43..123456.78 rows=150000 width=236)
      (actual time=0.089..890.123 rows=148923 loops=1)
        Index Cond: ((created_at >= '2025-01-01') AND (created_at <= '2025-12-31'))
        Filter: (status = ANY ('{completed,shipped}'))
        Rows Removed by Filter: 51077
        Buffers: shared hit=34567 read=12345
  ->  Index Scan using users_pkey on users u
      (cost=0.42..0.74 rows=1 width=24)
      (actual time=0.008..0.009 rows=1 loops=148923)
        Index Cond: (id = o.user_id)
        Buffers: shared hit=11111
```

**Analysis of this plan:**

1. **`Rows Removed by Filter: 51077`** — 51K rows were fetched by the index but discarded by the `status` filter. A composite index on `(created_at, status)` would avoid this.

2. **The Nested Loop runs 148,923 times** — Each iteration does an index scan on `users`. While each individual lookup is fast (0.008ms), the sheer volume is significant. Consider a Hash Join for this query.

3. **`Buffers: read=12345`** — 12,345 pages were read from disk (not in buffer cache). Either increase `shared_buffers` or the working set is too large for memory.

## Production Database Monitoring Dashboard

Essential queries to run periodically or expose as metrics:

```sql
-- 1. Cache hit ratio (should be > 99%)
SELECT
    sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) AS cache_hit_ratio
FROM pg_statio_user_tables;

-- 2. Transaction throughput
SELECT
    xact_commit + xact_rollback AS total_transactions,
    xact_commit AS commits,
    xact_rollback AS rollbacks,
    round(100.0 * xact_rollback / NULLIF(xact_commit + xact_rollback, 0)::numeric, 2) AS rollback_pct
FROM pg_stat_database
WHERE datname = current_database();

-- 3. Table bloat estimate
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
    n_dead_tup,
    n_live_tup,
    round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0)::numeric, 1) AS dead_pct,
    last_autovacuum,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE n_live_tup > 10000
ORDER BY n_dead_tup DESC
LIMIT 20;

-- 4. Lock contention
SELECT
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_query,
    blocking_activity.query AS blocking_query,
    now() - blocked_activity.query_start AS blocked_duration
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_locks.pid = blocked_activity.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocked_locks.locktype = blocking_locks.locktype
    AND blocked_locks.relation = blocking_locks.relation
    AND blocked_locks.pid != blocking_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_locks.pid = blocking_activity.pid
WHERE NOT blocked_locks.granted
ORDER BY blocked_duration DESC;

-- 5. Active queries (what is running right now)
SELECT
    pid,
    usename,
    now() - query_start AS duration,
    state,
    wait_event_type,
    wait_event,
    left(query, 100) AS query_preview
FROM pg_stat_activity
WHERE state != 'idle'
  AND pid != pg_backend_pid()
ORDER BY duration DESC;

-- 6. Connection usage
SELECT
    count(*) AS total_connections,
    count(*) FILTER (WHERE state = 'active') AS active,
    count(*) FILTER (WHERE state = 'idle') AS idle,
    count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_txn,
    count(*) FILTER (WHERE wait_event_type = 'Lock') AS waiting_on_lock,
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
FROM pg_stat_activity
WHERE backend_type = 'client backend';
```

## Query Optimization Quick Wins

Based on what profiling reveals, here are the most impactful fixes:

| Finding | Fix | Expected Impact |
|---------|-----|-----------------|
| Sequential scan on large table | Add appropriate index | 100x-10000x faster |
| `Rows Removed by Filter` is large | Add composite index including filter columns | 2x-100x faster |
| Hash Join on small table | Ensure statistics are up to date (`ANALYZE`) | 2x-10x faster |
| `Buffers: read` much larger than `hit` | Increase `shared_buffers` or optimize query | 2x-10x faster |
| Many Nested Loop iterations | Consider restructuring as Hash Join (sometimes PostgreSQL needs hints) | 2x-5x faster |
| Sort using disk (`external merge`) | Add index matching ORDER BY or increase `work_mem` | 5x-50x faster |
| Many sequential scans on same table | Combine queries or use CTEs | 2x-5x faster |

---

> *"The best index is the one you don't need, because your query doesn't hit the database at all."*
