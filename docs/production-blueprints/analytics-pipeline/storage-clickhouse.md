---
title: "ClickHouse Storage Design"
description: "ClickHouse tables, ReplicatedMergeTree, materialized views, TTL policies, and performance optimization"
tags: [clickhouse, olap, mergetree, materialized-views, ttl, columnar-storage]
difficulty: "expert"
prerequisites: [analytics-pipeline/architecture]
lastReviewed: "2026-03-18"
---

# ClickHouse Storage Design

## Why ClickHouse

ClickHouse is a column-oriented DBMS optimized for online analytical processing. For analytics workloads, it provides:

- **100–1000x faster** aggregation queries than PostgreSQL at scale
- **10–50x compression** compared to row-oriented storage
- **Real-time ingestion** — data queryable within seconds of insert
- **Horizontal scaling** — sharding across multiple nodes
- **SQL interface** — no new query language to learn

### Column-Oriented vs Row-Oriented

For an analytics query like `SELECT avg(revenue), country FROM events WHERE event = 'purchase'`:

**Row-oriented (PostgreSQL):**
- Scan every row in the table
- Read all columns (user_id, session_id, event, timestamp, revenue, country, ...) even unused ones
- Filter rows post-scan

**Column-oriented (ClickHouse):**
- Read only the `event`, `revenue`, and `country` columns
- Columns are compressed independently (text columns compress 20–50x, numbers 5–15x)
- SIMD vectorized operations on column data

For 1 billion rows with 20 columns where you access 3 columns:
- PostgreSQL reads: 20 columns × 1B rows × avg 20 bytes = 400 GB
- ClickHouse reads: 3 columns × 1B rows × avg 4 bytes compressed = 12 GB

## Table Design

### Events Table

```sql
-- Main events table
CREATE TABLE tracking.events
(
    -- Identity
    user_id          String,
    anonymous_id     String DEFAULT '',
    session_id       String DEFAULT '',

    -- Classification
    event            LowCardinality(String),    -- Few unique values → dictionary encoding
    category         LowCardinality(String),

    -- Timing
    timestamp        DateTime64(3, 'UTC'),       -- Millisecond precision
    received_at      DateTime64(3, 'UTC'),

    -- Source
    source_id        LowCardinality(String),

    -- Device/Geo (post-enrichment)
    geo_country      LowCardinality(String) DEFAULT '',
    geo_region       LowCardinality(String) DEFAULT '',
    geo_city         String DEFAULT '',
    browser          LowCardinality(String) DEFAULT '',
    browser_version  String DEFAULT '',
    os               LowCardinality(String) DEFAULT '',
    device_type      LowCardinality(String) DEFAULT 'unknown',

    -- Properties (JSONB equivalent)
    properties       String DEFAULT '{}',

    -- Experiments
    experiments      String DEFAULT '{}',  -- JSON: {expId: variantId}

    -- Metadata
    _version         UInt8 DEFAULT 1,
    _inserted_at     DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (event, user_id, timestamp)
TTL timestamp + INTERVAL 2 YEAR DELETE,
    timestamp + INTERVAL 90 DAY TO DISK 'slow_disk'
SETTINGS
    index_granularity = 8192,
    min_bytes_for_wide_part = 10485760;  -- 10 MB threshold for wide vs compact parts
```

### Key Design Decisions

**`LowCardinality(String)` for high-repetition fields:**
ClickHouse dictionary-encodes these to integers internally. For `device_type` with values "desktop", "mobile", "tablet", "unknown", this reduces storage by 90%+ and enables faster filtering.

**`ORDER BY (event, user_id, timestamp)` — not `(user_id, event, timestamp)`:**
- Event type is the most selective first filter in most queries: `WHERE event = 'purchase'`
- User ID second enables user-level aggregations
- Timestamp last enables time-range filtering within a user's events
- ClickHouse's primary key index is sparse (one entry per 8192 rows by default) — the order determines which queries benefit from the index

**`PARTITION BY toYYYYMMDD(timestamp)`:**
Daily partitions enable:
- Fast partition dropping for TTL (drop whole partition, not row-by-row delete)
- Partition pruning: `WHERE timestamp >= '2026-03-01'` skips pre-March partitions entirely

### Replicated Tables

For production HA, use `ReplicatedMergeTree`:

```sql
-- Replicated version (requires ZooKeeper/ClickHouse Keeper)
CREATE TABLE tracking.events ON CLUSTER 'analytics_cluster'
(
    -- Same columns as above
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/tracking/events',  -- ZooKeeper path
    '{replica}'                                     -- Replica identifier
)
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (event, user_id, timestamp);

-- Distributed table (transparent multi-shard access)
CREATE TABLE tracking.events_distributed ON CLUSTER 'analytics_cluster'
AS tracking.events
ENGINE = Distributed(
    'analytics_cluster',    -- Cluster name
    'tracking',             -- Database
    'events',               -- Table
    rand()                  -- Sharding key (random for even distribution)
);
```

Always write to the **local** table via Kafka consumer, query via the **distributed** table.

## Materialized Views for Pre-Aggregation

Materialized views in ClickHouse run as triggers on insert — they process each batch of inserts and update pre-aggregated tables. This enables dashboard queries that run in < 10ms.

### Daily Event Counts

```sql
-- Aggregate table: one row per event per day
CREATE TABLE tracking.event_daily_agg
(
    date         Date,
    event        LowCardinality(String),
    geo_country  LowCardinality(String),
    device_type  LowCardinality(String),
    source_id    LowCardinality(String),
    -- AggregateFunction for partial states (enables incremental merge)
    total_count  AggregateFunction(count),
    unique_users AggregateFunction(uniq, String)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, event, geo_country, device_type, source_id);

-- Materialized view that populates the aggregate table
CREATE MATERIALIZED VIEW tracking.mv_event_daily_agg
TO tracking.event_daily_agg
AS SELECT
    toDate(timestamp) AS date,
    event,
    geo_country,
    device_type,
    source_id,
    countState() AS total_count,
    uniqState(user_id) AS unique_users
FROM tracking.events
GROUP BY date, event, geo_country, device_type, source_id;

-- Query pre-aggregated data (extremely fast)
SELECT
    date,
    event,
    countMerge(total_count) AS total,
    uniqMerge(unique_users) AS unique_users
FROM tracking.event_daily_agg
WHERE date >= today() - 30
GROUP BY date, event
ORDER BY date, total DESC;
```

### User Session Aggregation

```sql
CREATE TABLE tracking.user_sessions_agg
(
    user_id         String,
    date            Date,
    session_count   UInt32,
    pageview_count  UInt32,
    event_count     UInt32,
    first_seen      DateTime64(3, 'UTC'),
    last_seen       DateTime64(3, 'UTC')
)
ENGINE = SummingMergeTree((session_count, pageview_count, event_count))
PARTITION BY toYYYYMM(date)
ORDER BY (user_id, date);

CREATE MATERIALIZED VIEW tracking.mv_user_sessions
TO tracking.user_sessions_agg
AS SELECT
    user_id,
    toDate(timestamp) AS date,
    uniq(session_id) AS session_count,
    countIf(event = 'page_viewed') AS pageview_count,
    count() AS event_count,
    min(timestamp) AS first_seen,
    max(timestamp) AS last_seen
FROM tracking.events
WHERE user_id != ''
GROUP BY user_id, date;
```

### Conversion Funnel Materialized View

```sql
-- Pre-aggregate conversion steps for fast funnel queries
CREATE TABLE tracking.funnel_steps_agg
(
    date         Date,
    step_event   LowCardinality(String),
    user_id      String,
    first_step_at DateTime64(3, 'UTC')
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, step_event, user_id);

CREATE MATERIALIZED VIEW tracking.mv_funnel_steps
TO tracking.funnel_steps_agg
AS SELECT
    toDate(timestamp) AS date,
    event AS step_event,
    user_id,
    min(timestamp) AS first_step_at
FROM tracking.events
WHERE event IN (
    'page_viewed',
    'product_viewed',
    'cart_item_added',
    'checkout_started',
    'order_completed'
)
AND user_id != ''
GROUP BY date, event, user_id;
```

## TTL Policies

TTL in ClickHouse operates at the partition level (most efficient) or row level (fine-grained).

### Multi-Level TTL

```sql
ALTER TABLE tracking.events
MODIFY TTL
    -- Move to cheaper storage after 90 days
    timestamp + INTERVAL 90 DAY TO VOLUME 'slow',
    -- Move to archive (S3 via ClickHouse S3 disk) after 1 year
    timestamp + INTERVAL 1 YEAR TO VOLUME 'archive',
    -- Delete after 2 years
    timestamp + INTERVAL 2 YEAR DELETE;
```

### Storage Volume Configuration

```xml
<!-- /etc/clickhouse-server/config.d/storage.xml -->
<storage_configuration>
    <disks>
        <fast>
            <type>local</type>
            <path>/data/clickhouse/fast/</path>
        </fast>
        <slow>
            <type>local</type>
            <path>/data/clickhouse/slow/</path>
        </slow>
        <s3_archive>
            <type>s3</type>
            <endpoint>https://s3.amazonaws.com/my-analytics-archive/</endpoint>
            <access_key_id>...</access_key_id>
            <secret_access_key>...</secret_access_key>
        </s3_archive>
    </disks>
    <policies>
        <tiered>
            <volumes>
                <hot>
                    <disk>fast</disk>
                    <max_data_part_size_bytes>10737418240</max_data_part_size_bytes>
                </hot>
                <slow>
                    <disk>slow</disk>
                </slow>
                <archive>
                    <disk>s3_archive</disk>
                </archive>
            </volumes>
        </tiered>
    </policies>
</storage_configuration>
```

## Query Optimization

### Secondary Indexes

ClickHouse's primary index (ORDER BY key) is sparse — one entry per 8192 rows. For highly selective queries on non-primary-key columns, use bloom filter or minmax indexes:

```sql
-- Bloom filter index for high-cardinality string column (session_id)
ALTER TABLE tracking.events
ADD INDEX idx_session_id session_id TYPE bloom_filter GRANULARITY 4;

-- MinMax index for efficient date range queries on received_at
ALTER TABLE tracking.events
ADD INDEX idx_received_at received_at TYPE minmax GRANULARITY 8;

-- Set index for categorical filtering
ALTER TABLE tracking.events
ADD INDEX idx_geo_country geo_country TYPE set(256) GRANULARITY 4;
```

### Projection for Common Query Patterns

Projections are pre-sorted copies of data optimized for specific query patterns:

```sql
-- Projection for user-centric queries (sorted by user_id first)
ALTER TABLE tracking.events
ADD PROJECTION proj_by_user (
    SELECT *
    ORDER BY (user_id, timestamp)
);

-- Projection for daily unique user counts (pre-aggregated)
ALTER TABLE tracking.events
ADD PROJECTION proj_daily_active_users (
    SELECT
        toDate(timestamp) AS date,
        uniqExact(user_id) AS daily_active_users
    GROUP BY date
);

-- Materialize projections on existing data
ALTER TABLE tracking.events
MATERIALIZE PROJECTION proj_by_user;
```

## Performance Monitoring

### Slow Query Log

```sql
-- Find the slowest queries in the last 24 hours
SELECT
    query_duration_ms,
    read_rows,
    read_bytes,
    memory_usage,
    query
FROM system.query_log
WHERE
    type = 'QueryFinish'
    AND query_duration_ms > 1000
    AND event_time >= now() - INTERVAL 1 DAY
    AND query NOT LIKE '%system.%'
ORDER BY query_duration_ms DESC
LIMIT 20;
```

### Merge Activity

```sql
-- Monitor merge backlog (high merge count = I/O pressure)
SELECT
    database,
    table,
    count() AS parts_count,
    sum(rows) AS total_rows,
    formatReadableSize(sum(bytes_on_disk)) AS size_on_disk,
    max(modification_time) AS latest_part
FROM system.parts
WHERE active AND database = 'tracking'
GROUP BY database, table
ORDER BY parts_count DESC;
```

### Compression Ratios

```sql
-- Check compression effectiveness per column
SELECT
    name,
    type,
    formatReadableSize(data_uncompressed_bytes) AS uncompressed,
    formatReadableSize(data_compressed_bytes) AS compressed,
    round(data_uncompressed_bytes / data_compressed_bytes, 2) AS compression_ratio
FROM system.columns
WHERE database = 'tracking' AND table = 'events'
ORDER BY data_compressed_bytes DESC;
```

## Mathematical Foundations

### Compression Ratio Analysis

ClickHouse uses LZ4 (fast) or ZSTD (high ratio) compression per column block. For a string column with 8,192 values:

- **Random UUIDs**: entropy ≈ 128 bits → ~1.1x compression
- **LowCardinality**: dictionary of 4 values → 64 bytes dict + 8192 × 2 bits ≈ 20x compression
- **IP addresses**: limited range → ~8x compression with delta+LZ4

For your event data, compression ratio $R$ determines storage cost:

$$\text{Storage (GB)} = \frac{N_{\text{events}} \times S_{\text{uncompressed}}}{R \times 10^9}$$

At 100M events/day, 500 bytes average uncompressed, 20x compression:

$$\text{Storage per day} = \frac{10^8 \times 500}{20 \times 10^9} = 2.5 \text{ GB/day}$$

Over 2 years: 2.5 × 730 = 1,825 GB ≈ 1.8 TB for the raw events table.

::: info War Story
**The ORDER BY Gotcha**

A team designed their ClickHouse table with `ORDER BY (user_id, event, timestamp)`. This made per-user queries very fast. They were happy.

Six months later, they added a dashboard showing "events per event type per day." This query became the most common: `SELECT event, count() FROM events WHERE timestamp > ... GROUP BY event`.

This query had to scan the entire table because `event` is second in the ORDER BY — ClickHouse couldn't use the primary index to skip data. The query took 45 seconds on their 500GB table.

After changing the ORDER BY to `(event, user_id, timestamp)`, the same query ran in 0.8 seconds (using the primary index to read only the `event = X` granules). The per-user queries were slightly slower (4s → 8s) but the project_by_user projection compensated for this.

Lesson: design ORDER BY around your most frequent/latency-sensitive query pattern, and use projections for secondary access patterns.
:::
