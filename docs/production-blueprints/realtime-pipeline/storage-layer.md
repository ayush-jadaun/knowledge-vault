---
title: "Realtime Pipeline: Storage Layer"
description: "ClickHouse schema design, partitioning strategies, TTL policies, and materialized views"
tags: [clickhouse, schema-design, partitioning, materialized-views, columnar-storage]
difficulty: "expert"
prerequisites: [realtime-pipeline/processing-layer]
lastReviewed: "2026-03-18"
---

# Realtime Pipeline: Storage Layer

## Why ClickHouse?

ClickHouse is a column-oriented DBMS optimized for analytical workloads. The key insight: analytical queries read few columns but many rows. Column storage means only the queried columns are read from disk.

**Storage comparison for 1 billion events:**

| Database | Storage Size | Query: COUNT(*) WHERE date = '2026-03-01' |
|----------|-------------|------------------------------------------|
| PostgreSQL | ~800 GB | 45 seconds |
| MySQL | ~700 GB | 30 seconds |
| ClickHouse | ~60 GB | 0.08 seconds |

The 10x storage reduction comes from:
- Column compression (repeated values in a column compress extremely well)
- LZ4 / ZSTD compression per column
- Sparse indexes (ClickHouse reads blocks, not individual rows)

## Core Schema: Events Table

```sql
CREATE TABLE events
(
    -- Identity
    event_id        String,
    type            LowCardinality(String),   -- LowCardinality for repeated strings
    project_id      LowCardinality(String),

    -- User
    user_id         String,                    -- Empty string if anonymous
    anonymous_id    String,
    session_id      String,

    -- Timing (CRITICAL: partition by timestamp for performance)
    timestamp       DateTime64(3, 'UTC'),       -- Millisecond precision
    received_at     DateTime64(3, 'UTC'),
    sent_at         Nullable(DateTime64(3, 'UTC')),

    -- Properties (stored as JSON string for flexibility)
    properties      String,                    -- JSON blob
    -- Also extracted common properties for fast filtering:
    url             LowCardinality(String),
    referrer        LowCardinality(String),
    search          String,

    -- Geo (enriched)
    country         LowCardinality(FixedString(2)),   -- ISO 3166-1 alpha-2
    region          LowCardinality(String),
    city            LowCardinality(String),
    timezone        LowCardinality(String),
    latitude        Float32,
    longitude       Float32,

    -- Device (enriched)
    browser         LowCardinality(String),
    browser_version LowCardinality(String),
    os              LowCardinality(String),
    device_type     LowCardinality(String),

    -- Session (enriched)
    session_start   DateTime64(3, 'UTC'),
    is_new_session  UInt8,                     -- Boolean as UInt8
    session_number  UInt32,

    -- Insert metadata
    _inserted_at    DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY (project_id, toYYYYMM(timestamp))
ORDER BY (project_id, type, timestamp, user_id)
TTL timestamp + INTERVAL 90 DAY              -- Auto-delete after 90 days
SETTINGS
    index_granularity = 8192,               -- Default: read 8192 rows per block
    merge_with_ttl_timeout = 86400          -- Run TTL merges at most every 24h
;
```

### Design Decisions Explained

**`PARTITION BY (project_id, toYYYYMM(timestamp))`**

Partitioning by month creates one partition per project per month. ClickHouse can skip entire partitions that don't match the query's time range. A query for "last 7 days" might only touch 2 partitions vs. scanning the entire table.

::: warning Partition Granularity
Don't partition too finely (e.g., by day). ClickHouse performs merges per partition. Too many partitions = too many simultaneous merges = performance degradation.

Rule of thumb: partitions should be 10 GB - 1 TB each. Monthly partitions work well for most event tables.
:::

**`ORDER BY (project_id, type, timestamp, user_id)`**

The ORDER BY determines the sort order within each partition. This affects:
1. Which queries can use the sparse index efficiently
2. Data compression (similar values together = better compression)

Order from least to most selective:
- `project_id`: Low cardinality, most queries filter on this
- `type`: Low cardinality (100 distinct event types)
- `timestamp`: High selectivity, most range queries use this
- `user_id`: High cardinality, used for per-user queries

**`LowCardinality(String)` vs `String`**

`LowCardinality` is a dictionary encoding for columns with < 10,000 distinct values. It stores a compact integer + dictionary instead of the full string per row. For columns like `country` (256 values), `browser` (100 values), `device_type` (5 values), this saves 50-80% storage.

## Sessions Table

```sql
CREATE TABLE sessions
(
    session_id          String,
    project_id          LowCardinality(String),
    anonymous_id        String,
    user_id             String,
    session_start       DateTime64(3, 'UTC'),
    session_end         Nullable(DateTime64(3, 'UTC')),
    duration_seconds    UInt32,
    page_count          UInt32,
    event_count         UInt32,
    session_number      UInt32,
    entry_page          LowCardinality(String),
    exit_page           LowCardinality(String),
    utm_source          LowCardinality(String),
    utm_medium          LowCardinality(String),
    utm_campaign        LowCardinality(String),
    country             LowCardinality(FixedString(2)),
    browser             LowCardinality(String),
    device_type         LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY (project_id, toYYYYMM(session_start))
ORDER BY (project_id, session_start, anonymous_id)
TTL session_start + INTERVAL 90 DAY
;
```

## Aggregation Tables

Pre-aggregate common metrics to avoid expensive real-time counts:

```sql
-- Daily active users per project
CREATE TABLE dau_daily
(
    project_id  LowCardinality(String),
    date        Date,
    user_count  UInt64,   -- Approximate with HyperLogLog
    user_hll    AggregateFunction(uniq, String)  -- For merging
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, date)
;

-- Event counts per type per day
CREATE TABLE event_counts_daily
(
    project_id  LowCardinality(String),
    date        Date,
    type        LowCardinality(String),
    count       UInt64
)
ENGINE = SummingMergeTree(count)
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, date, type)
TTL date + INTERVAL 365 DAY
;
```

## Materialized Views

Materialized views in ClickHouse automatically aggregate data as it's inserted into the source table. They are one of the most powerful ClickHouse features.

```sql
-- Materialized view: DAU aggregation
-- Automatically updated when new events are inserted
CREATE MATERIALIZED VIEW mv_dau_daily
TO dau_daily
AS
SELECT
    project_id,
    toDate(timestamp) AS date,
    uniqState(user_id) AS user_hll,     -- HyperLogLog state for later merging
    uniqMerge(user_hll) AS user_count
FROM events
WHERE user_id != ''
GROUP BY project_id, date
;

-- Materialized view: Event counts
CREATE MATERIALIZED VIEW mv_event_counts_daily
TO event_counts_daily
AS
SELECT
    project_id,
    toDate(timestamp) AS date,
    type,
    count() AS count
FROM events
GROUP BY project_id, date, type
;

-- Materialized view: Page view counts
CREATE TABLE pv_counts_daily
(
    project_id  LowCardinality(String),
    date        Date,
    path        String,
    count       UInt64
)
ENGINE = SummingMergeTree(count)
ORDER BY (project_id, date, path)
;

CREATE MATERIALIZED VIEW mv_pv_counts_daily
TO pv_counts_daily
AS
SELECT
    project_id,
    toDate(timestamp) AS date,
    JSONExtractString(properties, 'path') AS path,
    count() AS count
FROM events
WHERE type = 'page'
GROUP BY project_id, date, path
;
```

## TTL Policies

```sql
-- Tiered retention: keep detailed events for 90 days,
-- then aggregate and delete raw rows

-- Step 1: After 90 days, move to cold storage (S3)
ALTER TABLE events
MODIFY TTL
    timestamp + INTERVAL 90 DAY TO DISK 'cold_storage',
    timestamp + INTERVAL 365 DAY DELETE
;

-- Step 2: Create aggregated archive table for long-term retention
CREATE TABLE events_monthly_archive
(
    project_id  LowCardinality(String),
    year_month  UInt32,              -- YYYYMM
    type        LowCardinality(String),
    user_count  UInt64,
    event_count UInt64,
    country     LowCardinality(FixedString(2))
)
ENGINE = MergeTree()
ORDER BY (project_id, year_month, type, country)
;
```

## ClickHouse Configuration

For a production ClickHouse cluster handling 10k events/second:

```xml
<!-- config.xml -->
<clickhouse>
  <max_connections>4096</max_connections>
  <max_concurrent_queries>100</max_concurrent_queries>
  <max_memory_usage>40000000000</max_memory_usage>  <!-- 40 GB -->

  <!-- Async inserts: buffer inserts in memory before writing -->
  <async_insert>1</async_insert>
  <async_insert_threads>16</async_insert_threads>
  <async_insert_max_data_size>104857600</async_insert_max_data_size>  <!-- 100MB -->
  <async_insert_busy_timeout_ms>200</async_insert_busy_timeout_ms>
  <wait_for_async_insert>0</wait_for_async_insert>

  <!-- MergeTree settings -->
  <max_insert_block_size>1048576</max_insert_block_size>
  <min_insert_block_size_rows>1048576</min_insert_block_size_rows>

  <!-- Compression -->
  <compression>
    <case>
      <method>zstd</method>
      <level>3</level>
    </case>
  </compression>
</clickhouse>
```

## Async Inserts

ClickHouse performs best with large batches (100k+ rows). For small, frequent inserts, use async inserts to let ClickHouse batch internally:

```typescript
import { createClient } from '@clickhouse/client';

const client = createClient({
  host: 'http://clickhouse:8123',
  clickhouse_settings: {
    // ClickHouse will buffer inserts and flush when:
    // - Buffer reaches async_insert_max_data_size (100MB)
    // - OR async_insert_busy_timeout_ms (200ms) elapses
    async_insert: 1,
    wait_for_async_insert: 0,  // Fire-and-forget (higher throughput)
    // Set to 1 for at-least-once guarantees (lower throughput)
  },
});

// With async inserts enabled, each call is non-blocking
// ClickHouse batches internally before writing to MergeTree
export async function insertEvents(events: ClickHouseRow[]): Promise<void> {
  await client.insert({
    table: 'events',
    values: events,
    format: 'JSONEachRow',
  });
  // Returns immediately — ClickHouse buffers internally
}
```

## Query Examples

```sql
-- Count events by type for last 7 days (uses index on project_id, type, timestamp)
SELECT
    type,
    count() AS event_count
FROM events
WHERE project_id = 'proj_123'
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY type
ORDER BY event_count DESC
LIMIT 20
;
-- Typical: 50-200ms on 1 billion events

-- Daily active users trend (uses materialized view)
SELECT
    date,
    uniqMerge(user_hll) AS unique_users
FROM dau_daily
WHERE project_id = 'proj_123'
  AND date >= today() - 30
GROUP BY date
ORDER BY date
;
-- Typical: 5-20ms (pre-aggregated)

-- User journey: what events precede 'purchase'?
SELECT
    prev_event,
    count() AS occurrences
FROM (
    SELECT
        user_id,
        type AS curr_event,
        lagInFrame(type) OVER (
            PARTITION BY user_id
            ORDER BY timestamp
            ROWS BETWEEN 1 PRECEDING AND CURRENT ROW
        ) AS prev_event
    FROM events
    WHERE project_id = 'proj_123'
      AND timestamp >= now() - INTERVAL 30 DAY
)
WHERE curr_event = 'purchase'
  AND prev_event IS NOT NULL
GROUP BY prev_event
ORDER BY occurrences DESC
LIMIT 10
;
-- Typical: 2-10 seconds on 100M events
```

## Storage Sizing

$$
\text{storage\_bytes} = \text{events\_per\_day} \times \text{days\_retention} \times \text{bytes\_per\_event\_compressed}
$$

Typical compression ratio for event data: 10:1 to 20:1

$$
\text{bytes\_per\_event\_raw} \approx 500 \text{ bytes}
$$

$$
\text{bytes\_per\_event\_compressed} \approx 30-50 \text{ bytes}
$$

For 10M events/day, 90-day retention:

$$
10 \times 10^6 \times 90 \times 40 \text{ bytes} = 36 \text{ GB}
$$

Add 2x for replicas + indexes: ~72 GB. This fits on a single modern server.

::: info War Story
We hit a ClickHouse performance cliff when our `properties` JSON column grew to contain deeply nested objects (tracking entire UI component trees as events). A query that previously took 200ms started taking 45 seconds.

The problem: `JSONExtract` on a 50KB JSON string, 100 million times per query. ClickHouse can't use column-level compression on arbitrary JSON keys, so these queries end up reading and parsing the entire JSON string for every row.

The fix: Extract the 5 most common property keys into dedicated columns. Keep the JSON column for everything else. Queries using the dedicated columns are 200x faster. Document which properties will be "high-frequency" during schema design, not retroactively.
:::
