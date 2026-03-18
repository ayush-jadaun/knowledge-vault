---
title: "SQL Cheat Sheet"
description: "Quick reference for SQL patterns, joins, window functions, CTEs, indexing rules, and EXPLAIN"
tags: [cheat-sheet, sql, databases, postgresql]
difficulty: "intermediate"
lastReviewed: "2026-03-18"
---

# SQL Cheat Sheet

Quick reference for SQL query patterns, joins, window functions, CTEs, indexing strategies, and reading EXPLAIN output. Examples use PostgreSQL syntax.

**Deep dive**: [Database Section](/system-design/databases/) | [Query Optimization](/performance/database-tuning/query-optimization)

---

## Basic Queries

```sql
-- Select with filtering
SELECT id, name, email
FROM users
WHERE status = 'active'
  AND created_at > '2025-01-01'
ORDER BY created_at DESC
LIMIT 20 OFFSET 40;

-- Insert
INSERT INTO users (name, email, status)
VALUES ('Alice', 'alice@example.com', 'active')
RETURNING id;

-- Insert multiple rows
INSERT INTO users (name, email) VALUES
  ('Alice', 'alice@ex.com'),
  ('Bob', 'bob@ex.com'),
  ('Charlie', 'charlie@ex.com');

-- Upsert (INSERT ... ON CONFLICT)
INSERT INTO users (email, name)
VALUES ('alice@ex.com', 'Alice Updated')
ON CONFLICT (email)
DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

-- Update
UPDATE users
SET status = 'inactive', updated_at = NOW()
WHERE last_login < NOW() - INTERVAL '90 days';

-- Delete
DELETE FROM users WHERE status = 'deleted';

-- Truncate (fast delete all rows)
TRUNCATE TABLE logs;
```

---

## Joins

### Join Types Visual Reference

```
INNER JOIN       LEFT JOIN        RIGHT JOIN       FULL OUTER JOIN
 A [AB] B        [A AB] B         A [AB B]         [A AB B]
   ██               ███              ███             █████
```

### Join Syntax

```sql
-- INNER JOIN: rows that match in both tables
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON o.user_id = u.id;

-- LEFT JOIN: all rows from left, matched from right
SELECT u.name, o.total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id;

-- Multiple joins
SELECT u.name, o.id, p.name AS product
FROM users u
JOIN orders o ON o.user_id = u.id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id;

-- Self join (hierarchical data)
SELECT e.name, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;

-- Cross join (cartesian product)
SELECT s.size, c.color
FROM sizes s
CROSS JOIN colors c;

-- Lateral join (per-row subquery)
SELECT u.name, latest.total
FROM users u
CROSS JOIN LATERAL (
  SELECT total
  FROM orders
  WHERE user_id = u.id
  ORDER BY created_at DESC
  LIMIT 1
) latest;
```

### Anti-Join (rows NOT in other table)

```sql
-- Method 1: LEFT JOIN + IS NULL (usually fastest)
SELECT u.*
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.id IS NULL;

-- Method 2: NOT EXISTS
SELECT u.*
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.user_id = u.id
);

-- Method 3: NOT IN (avoid if subquery can return NULL)
SELECT u.*
FROM users u
WHERE u.id NOT IN (SELECT user_id FROM orders);
```

---

## Aggregations

```sql
-- Basic aggregates
SELECT
  status,
  COUNT(*) AS total,
  COUNT(DISTINCT email) AS unique_emails,
  SUM(amount) AS total_amount,
  AVG(amount) AS avg_amount,
  MIN(amount) AS min_amount,
  MAX(amount) AS max_amount
FROM orders
GROUP BY status
HAVING COUNT(*) > 10
ORDER BY total DESC;

-- Grouping sets (multiple groupings in one query)
SELECT
  COALESCE(country, 'ALL') AS country,
  COALESCE(city, 'ALL') AS city,
  COUNT(*)
FROM users
GROUP BY GROUPING SETS (
  (country, city),
  (country),
  ()
);

-- Filter aggregate (PostgreSQL)
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'active') AS active,
  COUNT(*) FILTER (WHERE status = 'inactive') AS inactive
FROM users;
```

---

## Window Functions

Window functions perform calculations across a set of rows related to the current row, without collapsing rows.

### Syntax

```sql
function_name() OVER (
  [PARTITION BY column]
  [ORDER BY column]
  [ROWS/RANGE frame_spec]
)
```

### Common Window Functions

```sql
SELECT
  name,
  department,
  salary,

  -- Ranking
  ROW_NUMBER() OVER (ORDER BY salary DESC) AS row_num,
  RANK() OVER (ORDER BY salary DESC) AS rank,
  DENSE_RANK() OVER (ORDER BY salary DESC) AS dense_rank,
  NTILE(4) OVER (ORDER BY salary DESC) AS quartile,

  -- Ranking within partition
  ROW_NUMBER() OVER (
    PARTITION BY department ORDER BY salary DESC
  ) AS dept_rank,

  -- Aggregates as windows
  SUM(salary) OVER (PARTITION BY department) AS dept_total,
  AVG(salary) OVER (PARTITION BY department) AS dept_avg,
  COUNT(*) OVER (PARTITION BY department) AS dept_count,

  -- Running total
  SUM(salary) OVER (ORDER BY hire_date) AS running_total,

  -- Moving average (last 3 rows)
  AVG(salary) OVER (
    ORDER BY hire_date
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  ) AS moving_avg,

  -- Access other rows
  LAG(salary, 1) OVER (ORDER BY hire_date) AS prev_salary,
  LEAD(salary, 1) OVER (ORDER BY hire_date) AS next_salary,
  FIRST_VALUE(name) OVER (
    PARTITION BY department ORDER BY salary DESC
  ) AS highest_paid,
  LAST_VALUE(name) OVER (
    PARTITION BY department ORDER BY salary DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
  ) AS lowest_paid

FROM employees;
```

### Ranking Functions Compared

| Function | Ties | Gaps | Example (values: 100, 100, 90) |
|----------|------|------|-------------------------------|
| `ROW_NUMBER()` | No | No | 1, 2, 3 |
| `RANK()` | Yes | Yes | 1, 1, 3 |
| `DENSE_RANK()` | Yes | No | 1, 1, 2 |

---

## Common Table Expressions (CTEs)

```sql
-- Basic CTE
WITH active_users AS (
  SELECT id, name, email
  FROM users
  WHERE status = 'active'
)
SELECT au.name, COUNT(o.id) AS order_count
FROM active_users au
LEFT JOIN orders o ON o.user_id = au.id
GROUP BY au.name;

-- Multiple CTEs
WITH
monthly_revenue AS (
  SELECT
    DATE_TRUNC('month', created_at) AS month,
    SUM(total) AS revenue
  FROM orders
  GROUP BY 1
),
monthly_growth AS (
  SELECT
    month,
    revenue,
    LAG(revenue) OVER (ORDER BY month) AS prev_revenue,
    ROUND(
      (revenue - LAG(revenue) OVER (ORDER BY month))
      / LAG(revenue) OVER (ORDER BY month) * 100, 2
    ) AS growth_pct
  FROM monthly_revenue
)
SELECT * FROM monthly_growth ORDER BY month;

-- Recursive CTE (hierarchical data)
WITH RECURSIVE org_tree AS (
  -- Base case: top-level managers
  SELECT id, name, manager_id, 0 AS depth
  FROM employees
  WHERE manager_id IS NULL

  UNION ALL

  -- Recursive case
  SELECT e.id, e.name, e.manager_id, ot.depth + 1
  FROM employees e
  INNER JOIN org_tree ot ON ot.id = e.manager_id
)
SELECT * FROM org_tree ORDER BY depth, name;
```

---

## Indexing Rules

### When to Create Indexes

| Scenario | Index Type |
|----------|-----------|
| WHERE clause equality | B-tree (default) |
| WHERE clause range (<, >, BETWEEN) | B-tree |
| Full-text search | GIN |
| JSONB field queries | GIN |
| Geospatial queries | GiST |
| Array containment | GIN |
| Pattern matching (LIKE 'prefix%') | B-tree (with text_pattern_ops) |

### Index Creation

```sql
-- Single column
CREATE INDEX idx_users_email ON users (email);

-- Unique index
CREATE UNIQUE INDEX idx_users_email ON users (email);

-- Composite index (column order matters!)
CREATE INDEX idx_orders_user_date ON orders (user_id, created_at DESC);

-- Partial index (smaller, faster)
CREATE INDEX idx_active_users ON users (email) WHERE status = 'active';

-- Expression index
CREATE INDEX idx_users_lower_email ON users (LOWER(email));

-- Covering index (INCLUDE)
CREATE INDEX idx_orders_user ON orders (user_id) INCLUDE (total, status);

-- GIN index for JSONB
CREATE INDEX idx_data ON events USING GIN (payload);

-- Concurrent index creation (no table lock)
CREATE INDEX CONCURRENTLY idx_name ON table (column);
```

### Composite Index Column Order

The leftmost prefix rule: a composite index on `(A, B, C)` can serve queries on:
- `A` alone
- `A, B` together
- `A, B, C` together
- But NOT `B` alone or `C` alone

### When NOT to Index

- Small tables (< 1000 rows) -- sequential scan is faster
- Columns with very low cardinality (e.g., boolean with 50/50 split)
- Heavily written tables where index maintenance cost > query benefit
- Columns rarely used in WHERE, JOIN, or ORDER BY

---

## EXPLAIN Reading Guide

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM users WHERE email = 'alice@ex.com';
```

### Key Metrics

| Metric | Meaning |
|--------|---------|
| `cost=0.00..8.17` | Startup cost..total cost (arbitrary units) |
| `rows=1` | Estimated rows returned |
| `actual time=0.01..0.02` | Actual time in ms (with ANALYZE) |
| `loops=1` | Times this node executed |
| `Buffers: shared hit=3` | Pages read from cache |
| `Buffers: shared read=1` | Pages read from disk |

### Scan Types (Best to Worst)

| Scan | Meaning | Performance |
|------|---------|-------------|
| Index Only Scan | All data from index | Best |
| Index Scan | Index lookup + heap fetch | Good |
| Bitmap Index Scan | Index bitmap + heap scan | Good for many rows |
| Seq Scan | Full table scan | Bad for large tables |

### Join Types

| Join | Meaning |
|------|---------|
| Nested Loop | For each row in outer, scan inner. Good for small sets |
| Hash Join | Build hash table from smaller set. Good for equality joins |
| Merge Join | Sort both, then merge. Good for large sorted sets |

### Red Flags in EXPLAIN

| Red Flag | Meaning |
|----------|---------|
| Seq Scan on large table | Missing index |
| High `rows` estimate vs actual | Stale statistics, run ANALYZE |
| Nested Loop with large inner | May need hash or merge join |
| Sort with large `sort_method: external merge` | Need more work_mem |
| Many `Buffers: shared read` | Cold cache or table too large for memory |

---

## Useful Patterns

### Pagination

```sql
-- Offset pagination (simple but slow for large offsets)
SELECT * FROM posts ORDER BY id LIMIT 20 OFFSET 100;

-- Keyset pagination (fast for any page)
SELECT * FROM posts
WHERE id > 12345  -- last ID from previous page
ORDER BY id
LIMIT 20;
```

### Deduplication

```sql
-- Keep latest per group
DELETE FROM events a
USING (
  SELECT DISTINCT ON (user_id)
    id, user_id
  FROM events
  ORDER BY user_id, created_at DESC
) b
WHERE a.user_id = b.user_id AND a.id != b.id;
```

### Date Ranges

```sql
-- Generate date series
SELECT d::date
FROM generate_series('2025-01-01', '2025-12-31', '1 day'::interval) d;

-- Fill in missing dates
SELECT d.date, COALESCE(o.count, 0) AS orders
FROM generate_series('2025-01-01', '2025-01-31', '1 day'::interval) d(date)
LEFT JOIN (
  SELECT DATE(created_at) AS date, COUNT(*) AS count
  FROM orders
  GROUP BY 1
) o ON o.date = d.date;
```

### JSON Operations (PostgreSQL)

```sql
-- Extract value
SELECT payload->>'name' FROM events;           -- text
SELECT payload->'address'->>'city' FROM events; -- nested text
SELECT payload#>>'{address,city}' FROM events;  -- path extraction

-- Query JSONB
SELECT * FROM events WHERE payload @> '{"type": "click"}';
SELECT * FROM events WHERE payload ? 'name';           -- key exists
SELECT * FROM events WHERE payload ?| ARRAY['a', 'b']; -- any key exists

-- Aggregate to JSON
SELECT json_agg(row_to_json(u)) FROM users u;
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Query is slow | Run `EXPLAIN ANALYZE`, check for Seq Scan |
| Table bloat | Run `VACUUM FULL table` |
| Stale statistics | Run `ANALYZE table` |
| Lock contention | Check `pg_stat_activity` for blocked queries |
| Connection exhaustion | Use connection pooling (PgBouncer) |
| Deadlock | Check `pg_locks`, ensure consistent lock ordering |
| Index not being used | Check if query pattern matches index columns |

```sql
-- Check running queries
SELECT pid, query, state, wait_event, query_start
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- Kill a query
SELECT pg_cancel_backend(pid);    -- graceful
SELECT pg_terminate_backend(pid); -- force

-- Check table sizes
SELECT
  relname,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_indexes_size(relid)) AS index_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- Check index usage
SELECT
  indexrelname,
  idx_scan AS scans,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY idx_scan;
```
