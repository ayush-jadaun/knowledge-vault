---
title: "SQL Advanced Cookbook"
description: "Advanced SQL patterns — window functions, recursive CTEs, LATERAL joins, JSONB operations, pivot/unpivot, query optimization with EXPLAIN ANALYZE, and common anti-patterns"
tags: [sql, advanced, window-functions, cte, postgresql]
difficulty: advanced
prerequisites: [sql]
lastReviewed: "2026-03-20"
---

# SQL Advanced Cookbook

Advanced SQL patterns for production use. All examples use PostgreSQL syntax. Most concepts (window functions, CTEs, LATERAL) work across modern databases with minor syntax differences.

**Prerequisites**: [SQL Cheat Sheet](/cheat-sheets/sql) | **Deep dive**: [Query Optimization](/system-design/databases/query-planning-optimization)

---

## Window Functions

Window functions perform calculations across a set of rows related to the current row — without collapsing them into a group like `GROUP BY` does.

### Syntax

```sql
function_name(args) OVER (
    [PARTITION BY columns]
    [ORDER BY columns [ASC|DESC]]
    [frame_clause]
)
```

### ROW_NUMBER, RANK, DENSE_RANK

```sql
-- Sample data
-- orders: id, customer_id, amount, created_at

-- ROW_NUMBER: unique sequential number per partition
SELECT
    customer_id,
    amount,
    ROW_NUMBER() OVER (
        PARTITION BY customer_id
        ORDER BY amount DESC
    ) AS row_num
FROM orders;

-- RANK: same rank for ties, gaps after ties
-- DENSE_RANK: same rank for ties, NO gaps
SELECT
    customer_id,
    amount,
    RANK()       OVER (ORDER BY amount DESC) AS rank,
    DENSE_RANK() OVER (ORDER BY amount DESC) AS dense_rank
FROM orders;
```

| amount | rank | dense_rank |
|--------|------|------------|
| 500 | 1 | 1 |
| 500 | 1 | 1 |
| 300 | 3 | 2 |
| 200 | 4 | 3 |

::: tip When to Use Which
- **ROW_NUMBER**: Top-N per group, pagination, deduplication
- **RANK**: Competitions where ties share position and next position is skipped
- **DENSE_RANK**: Competitions where ties share position and next position is NOT skipped
:::

### Top-N Per Group

```sql
-- Top 3 orders per customer
WITH ranked AS (
    SELECT
        customer_id,
        id AS order_id,
        amount,
        ROW_NUMBER() OVER (
            PARTITION BY customer_id
            ORDER BY amount DESC
        ) AS rn
    FROM orders
)
SELECT * FROM ranked WHERE rn <= 3;
```

### LAG and LEAD

Access previous or next row values without self-joins.

```sql
-- Compare each order's amount to the previous and next
SELECT
    id,
    customer_id,
    amount,
    created_at,
    LAG(amount, 1)  OVER (PARTITION BY customer_id ORDER BY created_at) AS prev_amount,
    LEAD(amount, 1) OVER (PARTITION BY customer_id ORDER BY created_at) AS next_amount,
    amount - LAG(amount, 1) OVER (
        PARTITION BY customer_id ORDER BY created_at
    ) AS change_from_prev
FROM orders;

-- Month-over-month revenue change
WITH monthly AS (
    SELECT
        DATE_TRUNC('month', created_at) AS month,
        SUM(amount) AS revenue
    FROM orders
    GROUP BY 1
)
SELECT
    month,
    revenue,
    LAG(revenue) OVER (ORDER BY month) AS prev_month_revenue,
    ROUND(
        (revenue - LAG(revenue) OVER (ORDER BY month))
        / LAG(revenue) OVER (ORDER BY month) * 100, 2
    ) AS pct_change
FROM monthly;
```

### NTILE

Divide rows into N roughly equal buckets.

```sql
-- Divide customers into 4 quartiles by total spending
SELECT
    customer_id,
    total_spent,
    NTILE(4) OVER (ORDER BY total_spent DESC) AS quartile
FROM (
    SELECT customer_id, SUM(amount) AS total_spent
    FROM orders
    GROUP BY customer_id
) sub;
```

### FIRST_VALUE, LAST_VALUE, NTH_VALUE

```sql
-- Best and worst order amount per customer
SELECT
    customer_id,
    amount,
    FIRST_VALUE(amount) OVER w AS highest_order,
    LAST_VALUE(amount)  OVER w AS lowest_order
FROM orders
WINDOW w AS (
    PARTITION BY customer_id
    ORDER BY amount DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
);
```

::: warning LAST_VALUE Gotcha
The default frame is `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. This means `LAST_VALUE` returns the current row's value, not the last row in the partition. Always specify `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` when using `LAST_VALUE`.
:::

---

## Running Totals & Moving Averages

### Running Total

```sql
SELECT
    id,
    created_at,
    amount,
    SUM(amount) OVER (
        ORDER BY created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_total
FROM orders;

-- Running total per customer
SELECT
    customer_id,
    created_at,
    amount,
    SUM(amount) OVER (
        PARTITION BY customer_id
        ORDER BY created_at
    ) AS customer_running_total
FROM orders;
```

### Moving Average

```sql
-- 7-day moving average of daily revenue
WITH daily_revenue AS (
    SELECT
        DATE(created_at) AS day,
        SUM(amount) AS revenue
    FROM orders
    GROUP BY 1
)
SELECT
    day,
    revenue,
    AVG(revenue) OVER (
        ORDER BY day
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS moving_avg_7d,
    AVG(revenue) OVER (
        ORDER BY day
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    ) AS moving_avg_30d
FROM daily_revenue;
```

### Percentiles

```sql
-- Median order amount (50th percentile)
SELECT
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) AS median,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY amount) AS p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY amount) AS p99
FROM orders;

-- Percentile per customer
SELECT DISTINCT
    customer_id,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount)
        OVER (PARTITION BY customer_id) AS median_order
FROM orders;
```

### Cumulative Distribution

```sql
-- What percentage of orders are below each amount?
SELECT
    amount,
    CUME_DIST() OVER (ORDER BY amount) AS cumulative_pct,
    PERCENT_RANK() OVER (ORDER BY amount) AS percent_rank
FROM orders;
```

---

## Recursive CTEs

Recursive CTEs let you traverse hierarchies, build sequences, and explore graph-like structures.

### Syntax

```sql
WITH RECURSIVE cte_name AS (
    -- Base case (anchor member)
    SELECT ...
    UNION ALL
    -- Recursive case (references cte_name)
    SELECT ... FROM cte_name JOIN ...
    WHERE termination_condition
)
SELECT * FROM cte_name;
```

### Org Chart / Hierarchy Traversal

```sql
-- employees: id, name, manager_id
-- Find all reports (direct and indirect) for a manager

WITH RECURSIVE org_tree AS (
    -- Base: the root manager
    SELECT id, name, manager_id, 0 AS depth, name AS path
    FROM employees
    WHERE id = 1  -- CEO

    UNION ALL

    -- Recursive: find direct reports of current level
    SELECT
        e.id,
        e.name,
        e.manager_id,
        ot.depth + 1,
        ot.path || ' > ' || e.name
    FROM employees e
    JOIN org_tree ot ON e.manager_id = ot.id
    WHERE ot.depth < 10  -- safety limit
)
SELECT * FROM org_tree ORDER BY depth, name;
```

### Bill of Materials (Parts Explosion)

```sql
-- parts: id, name, parent_id, quantity
-- Calculate total quantity of each sub-part needed

WITH RECURSIVE bom AS (
    SELECT id, name, parent_id, quantity, 1 AS level
    FROM parts
    WHERE parent_id IS NULL  -- top-level assembly

    UNION ALL

    SELECT p.id, p.name, p.parent_id,
           p.quantity * bom.quantity AS quantity,
           bom.level + 1
    FROM parts p
    JOIN bom ON p.parent_id = bom.id
)
SELECT name, SUM(quantity) AS total_needed, MAX(level) AS max_depth
FROM bom
GROUP BY name;
```

### Generate Date Series (Without generate_series)

```sql
-- Works on databases without generate_series (MySQL, SQL Server)
WITH RECURSIVE dates AS (
    SELECT DATE '2025-01-01' AS day

    UNION ALL

    SELECT day + INTERVAL '1 day'
    FROM dates
    WHERE day < DATE '2025-12-31'
)
SELECT day FROM dates;

-- PostgreSQL native (preferred)
SELECT generate_series(
    '2025-01-01'::date,
    '2025-12-31'::date,
    '1 day'::interval
) AS day;
```

### Graph Traversal (Shortest Path)

```sql
-- edges: from_node, to_node, weight

WITH RECURSIVE paths AS (
    -- Start from node 'A'
    SELECT
        from_node,
        to_node,
        weight AS total_weight,
        ARRAY[from_node, to_node] AS path,
        1 AS hops
    FROM edges
    WHERE from_node = 'A'

    UNION ALL

    SELECT
        p.from_node,
        e.to_node,
        p.total_weight + e.weight,
        p.path || e.to_node,
        p.hops + 1
    FROM paths p
    JOIN edges e ON p.to_node = e.from_node
    WHERE NOT e.to_node = ANY(p.path)  -- prevent cycles
      AND p.hops < 10                  -- safety limit
)
SELECT DISTINCT ON (to_node)
    to_node,
    total_weight,
    path
FROM paths
ORDER BY to_node, total_weight;
```

::: warning Recursive CTE Safety
Always include a termination condition (`WHERE depth < N` or cycle detection). Without one, the CTE runs forever.

PostgreSQL 14+ has built-in cycle detection:
```sql
WITH RECURSIVE ... CYCLE id SET is_cycle USING path
```
:::

---

## LATERAL Joins / CROSS APPLY

`LATERAL` lets a subquery reference columns from preceding `FROM` items. Think of it as a "for each row, run this subquery."

```sql
-- For each customer, get their 3 most recent orders
SELECT c.id, c.name, recent.*
FROM customers c
CROSS JOIN LATERAL (
    SELECT id AS order_id, amount, created_at
    FROM orders
    WHERE customer_id = c.id
    ORDER BY created_at DESC
    LIMIT 3
) recent;

-- SQL Server equivalent
SELECT c.id, c.name, recent.*
FROM customers c
CROSS APPLY (
    SELECT TOP 3 id AS order_id, amount, created_at
    FROM orders
    WHERE customer_id = c.id
    ORDER BY created_at DESC
) recent;
```

### LATERAL vs Correlated Subquery

```sql
-- Correlated subquery: can only return one value
SELECT
    c.id,
    (SELECT MAX(amount) FROM orders WHERE customer_id = c.id) AS max_order
FROM customers c;

-- LATERAL: can return multiple columns and rows
SELECT c.id, stats.*
FROM customers c
CROSS JOIN LATERAL (
    SELECT
        COUNT(*) AS order_count,
        SUM(amount) AS total_spent,
        AVG(amount) AS avg_order,
        MAX(amount) AS max_order,
        MIN(created_at) AS first_order,
        MAX(created_at) AS last_order
    FROM orders
    WHERE customer_id = c.id
) stats;
```

### Unnest Arrays with LATERAL

```sql
-- tags: id, name, tag_array (text[])
SELECT p.id, p.name, t.tag
FROM posts p
CROSS JOIN LATERAL UNNEST(p.tag_array) AS t(tag);
```

---

## JSONB Operations (PostgreSQL)

### Basic Access

```sql
-- data column is JSONB
-- -> returns JSON, ->> returns text

SELECT
    data->'user'->>'name' AS user_name,       -- text
    data->'user'->'address' AS address,        -- json object
    (data->>'age')::int AS age,                -- cast to int
    data->'tags'->0 AS first_tag,              -- array index
    data#>>'{user,address,city}' AS city       -- nested path
FROM events;
```

### Containment & Existence

```sql
-- @> containment: does the JSON contain this structure?
SELECT * FROM events
WHERE data @> '{"type": "purchase"}'::jsonb;

-- ? existence: does the key exist?
SELECT * FROM events WHERE data ? 'user_id';

-- ?| any key exists
SELECT * FROM events WHERE data ?| ARRAY['email', 'phone'];

-- ?& all keys exist
SELECT * FROM events WHERE data ?& ARRAY['email', 'phone'];
```

### Indexing JSONB

```sql
-- GIN index for containment queries (@>, ?, ?|, ?&)
CREATE INDEX idx_events_data ON events USING GIN (data);

-- GIN with jsonb_path_ops (smaller, faster for @> only)
CREATE INDEX idx_events_data_path ON events USING GIN (data jsonb_path_ops);

-- B-tree index on a specific key (for equality and range)
CREATE INDEX idx_events_type ON events ((data->>'type'));

-- Expression index for casting
CREATE INDEX idx_events_age ON events (((data->>'age')::int));
```

### JSONB Aggregation

```sql
-- Build a JSON object from rows
SELECT jsonb_object_agg(key, value) FROM settings;

-- Build a JSON array from rows
SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'amount', amount
)) AS orders_json
FROM orders
WHERE customer_id = 123;

-- Expand JSON array to rows
SELECT e.id, item.*
FROM events e
CROSS JOIN LATERAL jsonb_array_elements(e.data->'items') AS item;

-- Expand JSON object keys to rows
SELECT e.id, kv.key, kv.value
FROM events e
CROSS JOIN LATERAL jsonb_each(e.data->'metadata') AS kv(key, value);
```

### JSONB Modification

```sql
-- Set a key
UPDATE events
SET data = jsonb_set(data, '{status}', '"processed"')
WHERE id = 1;

-- Set a nested key
UPDATE events
SET data = jsonb_set(data, '{user,verified}', 'true')
WHERE id = 1;

-- Remove a key
UPDATE events SET data = data - 'temp_field';

-- Remove nested key
UPDATE events SET data = data #- '{user,legacy_field}';

-- Concatenate (merge)
UPDATE events SET data = data || '{"priority": "high"}'::jsonb;
```

---

## Pivot / Unpivot Patterns

### Pivot (Rows to Columns)

```sql
-- sales: product, quarter, revenue
-- Turn quarters into columns

-- Method 1: CASE + aggregation (works everywhere)
SELECT
    product,
    SUM(CASE WHEN quarter = 'Q1' THEN revenue ELSE 0 END) AS q1,
    SUM(CASE WHEN quarter = 'Q2' THEN revenue ELSE 0 END) AS q2,
    SUM(CASE WHEN quarter = 'Q3' THEN revenue ELSE 0 END) AS q3,
    SUM(CASE WHEN quarter = 'Q4' THEN revenue ELSE 0 END) AS q4,
    SUM(revenue) AS total
FROM sales
GROUP BY product;

-- Method 2: PostgreSQL crosstab (requires tablefunc extension)
CREATE EXTENSION IF NOT EXISTS tablefunc;

SELECT * FROM crosstab(
    'SELECT product, quarter, revenue FROM sales ORDER BY 1, 2',
    'SELECT DISTINCT quarter FROM sales ORDER BY 1'
) AS ct(product text, q1 numeric, q2 numeric, q3 numeric, q4 numeric);
```

### Unpivot (Columns to Rows)

```sql
-- quarterly_report: product, q1, q2, q3, q4
-- Turn columns into rows

-- Method 1: UNION ALL
SELECT product, 'Q1' AS quarter, q1 AS revenue FROM quarterly_report
UNION ALL
SELECT product, 'Q2', q2 FROM quarterly_report
UNION ALL
SELECT product, 'Q3', q3 FROM quarterly_report
UNION ALL
SELECT product, 'Q4', q4 FROM quarterly_report;

-- Method 2: VALUES + LATERAL (PostgreSQL, cleaner)
SELECT qr.product, v.quarter, v.revenue
FROM quarterly_report qr
CROSS JOIN LATERAL (
    VALUES ('Q1', qr.q1), ('Q2', qr.q2), ('Q3', qr.q3), ('Q4', qr.q4)
) AS v(quarter, revenue);
```

---

## Query Optimization with EXPLAIN ANALYZE

### Reading EXPLAIN Output

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders
WHERE customer_id = 123
  AND created_at > '2025-01-01'
ORDER BY created_at DESC
LIMIT 10;
```

### Key Metrics to Watch

| Metric | What It Means |
|--------|-------------|
| **Seq Scan** | Full table scan — no index used |
| **Index Scan** | Index used, then fetches heap rows |
| **Index Only Scan** | All data from index, no heap access (best) |
| **Bitmap Index Scan** | Builds bitmap from index, then scans heap |
| **actual time** | `{start}..{total}` in milliseconds |
| **rows** | Estimated vs actual row count |
| **Buffers: shared hit** | Pages read from cache |
| **Buffers: shared read** | Pages read from disk |

### Optimization Checklist

```sql
-- 1. Add missing indexes
CREATE INDEX CONCURRENTLY idx_orders_customer_date
ON orders (customer_id, created_at DESC);

-- 2. Use covering indexes to avoid heap fetches
CREATE INDEX idx_orders_covering
ON orders (customer_id, created_at DESC)
INCLUDE (amount, status);

-- 3. Partial indexes for common filters
CREATE INDEX idx_orders_active
ON orders (customer_id, created_at)
WHERE status = 'active';

-- 4. Update statistics after bulk loads
ANALYZE orders;

-- 5. Check index usage
SELECT
    indexrelname AS index_name,
    idx_scan AS times_used,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan;
```

### Join Optimization

```sql
-- Force join order (use with caution)
SET join_collapse_limit = 1;

-- Check join types in EXPLAIN:
-- Nested Loop: best for small result sets, indexed lookups
-- Hash Join: best for large datasets, no indexes
-- Merge Join: best for pre-sorted data

-- Ensure join columns are indexed
CREATE INDEX idx_order_items_order_id ON order_items (order_id);
```

---

## Common Anti-Patterns and Fixes

### Anti-Pattern 1: SELECT *

```sql
-- Bad: fetches all columns, breaks covering indexes
SELECT * FROM orders WHERE customer_id = 123;

-- Good: select only what you need
SELECT id, amount, created_at FROM orders WHERE customer_id = 123;
```

### Anti-Pattern 2: N+1 Queries

```sql
-- Bad: one query per customer (application loop)
-- SELECT * FROM orders WHERE customer_id = ?  (repeated N times)

-- Good: single query with IN or JOIN
SELECT o.*
FROM orders o
WHERE o.customer_id = ANY(ARRAY[1, 2, 3, 4, 5]);

-- Or with JOIN
SELECT o.*
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.region = 'US';
```

### Anti-Pattern 3: Functions on Indexed Columns

```sql
-- Bad: index on created_at is NOT used
SELECT * FROM orders WHERE DATE(created_at) = '2025-06-15';
SELECT * FROM orders WHERE LOWER(email) = 'alice@example.com';

-- Good: rewrite to preserve index usage
SELECT * FROM orders
WHERE created_at >= '2025-06-15' AND created_at < '2025-06-16';

-- Or create an expression index
CREATE INDEX idx_users_email_lower ON users (LOWER(email));
```

### Anti-Pattern 4: OR on Different Columns

```sql
-- Bad: can't use a single index efficiently
SELECT * FROM users WHERE email = 'alice@ex.com' OR phone = '555-1234';

-- Good: UNION (uses separate indexes)
SELECT * FROM users WHERE email = 'alice@ex.com'
UNION
SELECT * FROM users WHERE phone = '555-1234';
```

### Anti-Pattern 5: NOT IN with NULLs

```sql
-- Bad: NOT IN returns no results if subquery contains NULL
SELECT * FROM users
WHERE id NOT IN (SELECT manager_id FROM employees);
-- If any manager_id is NULL, this returns ZERO rows!

-- Good: use NOT EXISTS
SELECT * FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.manager_id = u.id
);
```

### Anti-Pattern 6: Implicit Type Casting

```sql
-- Bad: index on user_id (integer) not used because of string comparison
SELECT * FROM orders WHERE user_id = '123';

-- Good: use correct type
SELECT * FROM orders WHERE user_id = 123;
```

### Anti-Pattern 7: Correlated Subquery in SELECT

```sql
-- Bad: runs subquery once per row
SELECT
    o.id,
    o.amount,
    (SELECT name FROM customers WHERE id = o.customer_id) AS customer_name
FROM orders o;

-- Good: use JOIN
SELECT o.id, o.amount, c.name AS customer_name
FROM orders o
JOIN customers c ON c.id = o.customer_id;
```

---

## Advanced Patterns

### Gap Detection

```sql
-- Find gaps in a sequence (e.g., missing invoice numbers)
WITH numbered AS (
    SELECT
        invoice_number,
        LEAD(invoice_number) OVER (ORDER BY invoice_number) AS next_number
    FROM invoices
)
SELECT
    invoice_number AS gap_start,
    next_number AS gap_end,
    next_number - invoice_number - 1 AS gap_size
FROM numbered
WHERE next_number - invoice_number > 1;
```

### Islands and Gaps (Consecutive Sequences)

```sql
-- Find consecutive date ranges for each user's login streak
WITH groups AS (
    SELECT
        user_id,
        login_date,
        login_date - (ROW_NUMBER() OVER (
            PARTITION BY user_id ORDER BY login_date
        ))::int AS grp
    FROM user_logins
)
SELECT
    user_id,
    MIN(login_date) AS streak_start,
    MAX(login_date) AS streak_end,
    COUNT(*) AS streak_length
FROM groups
GROUP BY user_id, grp
HAVING COUNT(*) > 1
ORDER BY streak_length DESC;
```

### Deduplication

```sql
-- Keep only the latest row per (email), delete duplicates
DELETE FROM users
WHERE id NOT IN (
    SELECT DISTINCT ON (email) id
    FROM users
    ORDER BY email, created_at DESC
);

-- Alternative: CTE-based (safer, can preview first)
WITH duplicates AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY email
            ORDER BY created_at DESC
        ) AS rn
    FROM users
)
DELETE FROM users
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);
```

### Efficient Pagination

```sql
-- Bad: OFFSET scales poorly (scans and discards rows)
SELECT * FROM products ORDER BY id LIMIT 20 OFFSET 10000;

-- Good: keyset/cursor pagination
SELECT * FROM products
WHERE id > 10020  -- last seen ID
ORDER BY id
LIMIT 20;

-- For complex sorts: use a composite cursor
SELECT * FROM products
WHERE (popularity, id) < (95, 5432)  -- last seen values
ORDER BY popularity DESC, id DESC
LIMIT 20;
```

### Upsert with Conflict Handling

```sql
-- Insert or update, returning what happened
INSERT INTO product_views (product_id, view_count, last_viewed)
VALUES (123, 1, NOW())
ON CONFLICT (product_id)
DO UPDATE SET
    view_count = product_views.view_count + 1,
    last_viewed = NOW()
RETURNING
    product_id,
    view_count,
    (xmax = 0) AS was_inserted;  -- true if inserted, false if updated
```

### Conditional Aggregation

```sql
-- Single query: multiple aggregations with different filters
SELECT
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending,
    COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
    SUM(amount) FILTER (WHERE status = 'completed') AS completed_revenue,
    AVG(amount) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS avg_recent
FROM orders;
```

### Self-Referencing Updates

```sql
-- Update a column based on aggregate of related rows
UPDATE products p
SET avg_rating = sub.avg_rating
FROM (
    SELECT product_id, AVG(rating)::numeric(3,2) AS avg_rating
    FROM reviews
    GROUP BY product_id
) sub
WHERE p.id = sub.product_id;
```

---

## Quick Reference: Window Frame Clauses

| Frame | Meaning |
|-------|---------|
| `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` | Default. All rows from start to current |
| `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` | Entire partition |
| `ROWS BETWEEN 3 PRECEDING AND CURRENT ROW` | Current row + 3 before it |
| `ROWS BETWEEN CURRENT ROW AND 3 FOLLOWING` | Current row + 3 after it |
| `ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING` | Sliding window of 7 rows |
| `RANGE BETWEEN ...` | Same as ROWS but groups rows with equal ORDER BY values |
| `GROUPS BETWEEN ...` | (PG12+) Groups of peer rows |

## Quick Reference: Common Window Functions

| Function | Returns |
|----------|---------|
| `ROW_NUMBER()` | Unique sequential integer per partition |
| `RANK()` | Rank with gaps for ties |
| `DENSE_RANK()` | Rank without gaps for ties |
| `NTILE(n)` | Bucket number (1 to n) |
| `LAG(col, n, default)` | Value from n rows before |
| `LEAD(col, n, default)` | Value from n rows after |
| `FIRST_VALUE(col)` | First value in the frame |
| `LAST_VALUE(col)` | Last value in the frame |
| `NTH_VALUE(col, n)` | Nth value in the frame |
| `CUME_DIST()` | Cumulative distribution (0-1) |
| `PERCENT_RANK()` | Relative rank (0-1) |
| `SUM/AVG/MIN/MAX() OVER()` | Aggregate as window function |

---

::: details Test Yourself
1. **What window function gives unique sequential numbers even for ties?**
   `ROW_NUMBER()`

2. **What frame clause do you need for `LAST_VALUE` to work correctly across the entire partition?**
   `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`

3. **What is the base case in a recursive CTE called?**
   The anchor member.

4. **How does `LATERAL` differ from a correlated subquery?**
   `LATERAL` can return multiple columns and rows; a correlated subquery in `SELECT` can only return a single value.

5. **What JSONB operator checks if a JSON document contains a specific structure?**
   `@>` (containment operator)

6. **How do you pivot rows to columns without the `crosstab` extension?**
   Use `SUM(CASE WHEN column = 'value' THEN amount ELSE 0 END) AS alias` with `GROUP BY`.

7. **What index type should you use for JSONB containment queries?**
   `GIN` index.

8. **Why is `SELECT *` an anti-pattern?**
   It fetches all columns (breaking covering indexes), is fragile to schema changes, and wastes network bandwidth.

9. **What is the islands-and-gaps technique used for?**
   Finding consecutive sequences (streaks) by using `ROW_NUMBER()` to create grouping keys.

10. **How do you avoid the N+1 query problem in SQL?**
    Use a single query with `JOIN` or `WHERE column = ANY(ARRAY[...])` instead of looping with individual queries.
:::

::: danger Common Gotchas
- **`LAST_VALUE` returns the current row by default.** The default window frame is `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, so `LAST_VALUE` gives the current row's value, not the last in the partition.
- **Recursive CTEs without termination conditions run forever.** Always include `WHERE depth < N` or cycle detection. PostgreSQL 14+ has built-in `CYCLE` detection.
- **`NOT IN` with NULLs returns zero rows.** If the subquery contains any NULL, `NOT IN` evaluates to UNKNOWN for every row and returns nothing. Use `NOT EXISTS` instead.
- **Applying functions on indexed columns prevents index usage.** `WHERE LOWER(email) = 'x'` cannot use an index on `email`. Create an expression index or rewrite the query.
:::

## One-Liner Summary

Advanced SQL unlocks window functions, recursive CTEs, LATERAL joins, JSONB, and EXPLAIN ANALYZE -- the tools that turn you from someone who can query data into someone who can query data efficiently at scale.
