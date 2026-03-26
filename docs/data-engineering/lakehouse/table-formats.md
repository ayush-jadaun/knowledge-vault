---
title: "Open Table Formats"
description: "Deep comparison of Delta Lake, Apache Iceberg, and Apache Hudi — ACID transactions on object storage, time travel, schema evolution, and performance optimization"
tags: [delta-lake, iceberg, hudi, table-formats, data-engineering]
difficulty: advanced
prerequisites: [data-engineering/lakehouse]
lastReviewed: "2026-03-20"
---

# Open Table Formats

## The Problem: Files Are Not Tables

Object storage (S3, GCS, ADLS) stores files. Files are not tables. A directory of Parquet files has no concept of transactions, schema enforcement, consistent snapshots, or safe concurrent writes. If two Spark jobs write to the same directory simultaneously, you get corrupted data. If a write fails halfway, you get partial data. If you want to query "what did this table look like yesterday," you cannot.

Open table formats solve this by adding a metadata layer on top of Parquet files that turns a directory of files into a proper table with database-like guarantees. The three dominant formats — Delta Lake, Apache Iceberg, and Apache Hudi — take different approaches to the same core problem.

## How Table Formats Work: First Principles

Every table format follows the same fundamental pattern:

```mermaid
graph TB
    subgraph Logical["Logical Table"]
        Table["orders table<br/>(what users see)"]
    end

    subgraph Metadata["Metadata Layer"]
        TxLog["Transaction Log /<br/>Manifest Files"]
        Stats["Column Statistics<br/>(min, max, count, nulls)"]
        Schema["Schema Definition"]
        Partitions["Partition Info"]
    end

    subgraph Physical["Physical Layer"]
        P1["part-00001.parquet"]
        P2["part-00002.parquet"]
        P3["part-00003.parquet"]
        P4["part-00004.parquet"]
    end

    Table --> Metadata
    Metadata --> Physical
```

1. **Data files** — Parquet (or ORC) files containing the actual data, stored in object storage
2. **Metadata files** — track which data files belong to the current table version, their schemas, column statistics, and partition information
3. **Transaction protocol** — defines how writes are committed atomically by adding new metadata entries

The critical insight: reads never touch the data files until the metadata layer tells them exactly which files to read and which row groups to scan. This enables data skipping, time travel, and snapshot isolation.

## Delta Lake

### Architecture

Delta Lake, created by Databricks, uses a JSON-based transaction log stored in a `_delta_log/` directory alongside the Parquet data files.

```
my_table/
  _delta_log/
    00000000000000000000.json    # Version 0 (table creation)
    00000000000000000001.json    # Version 1 (insert)
    00000000000000000002.json    # Version 2 (update)
    00000000000000000010.checkpoint.parquet  # Checkpoint every 10 versions
  year=2025/
    month=01/
      part-00001.parquet
      part-00002.parquet
    month=02/
      part-00003.parquet
```

Each JSON log entry contains **actions**:

```json
// 00000000000000000001.json
{
  "add": {
    "path": "year=2025/month=01/part-00001.parquet",
    "size": 1048576,
    "partitionValues": {"year": "2025", "month": "01"},
    "modificationTime": 1711929600000,
    "dataChange": true,
    "stats": "{\"numRecords\":50000,\"minValues\":{\"id\":1,\"amount\":0.01},\"maxValues\":{\"id\":50000,\"amount\":9999.99}}"
  }
}
```

### ACID Transactions in Delta Lake

Delta Lake achieves atomicity through **optimistic concurrency control**:

1. A writer reads the current log version (e.g., version 5)
2. The writer computes the changes (new files to add, old files to remove)
3. The writer attempts to write `00000000000000000006.json` atomically
4. If another writer already created version 6, the current writer retries — it re-reads the log, checks for conflicts, and attempts version 7

Conflict detection depends on the operation: two appends to different partitions never conflict, but two updates to the same partition might.

::: warning Checkpoint Files
Reading all JSON log files from version 0 on every query would be slow. Delta Lake creates **checkpoint files** (Parquet format) every 10 commits by default. A checkpoint contains the cumulative state of the table at that version, so readers only need to read the checkpoint plus any subsequent JSON files.
:::

### Time Travel

```sql
-- Query the table as it was at version 5
SELECT * FROM my_table VERSION AS OF 5;

-- Query the table as it was at a specific timestamp
SELECT * FROM my_table TIMESTAMP AS OF '2025-06-15 10:00:00';
```

```python
# PySpark
df = spark.read.format("delta").option("versionAsOf", 5).load("s3://bucket/my_table")

# Or by timestamp
df = spark.read.format("delta").option("timestampAsOf", "2025-06-15").load("s3://bucket/my_table")
```

### Z-Ordering

Delta Lake supports Z-ordering, which co-locates related data in the same files based on multiple columns. This dramatically improves data skipping when queries filter on those columns.

```sql
OPTIMIZE my_table ZORDER BY (country, product_category);
```

Without Z-ordering, a query filtering on `country = 'US' AND product_category = 'electronics'` might scan 90% of files. With Z-ordering, it might scan 5%.

## Apache Iceberg

### Architecture

Iceberg, created at Netflix, uses a three-level metadata tree: metadata files, manifest lists, and manifest files.

```mermaid
graph TB
    Cat["Catalog<br/>(Hive / Nessie / Polaris)"] --> MF["Metadata File<br/>(JSON)<br/>current-snapshot, schema, partitioning"]
    MF --> ML["Manifest List<br/>(Avro)<br/>list of manifest files + stats"]
    ML --> M1["Manifest File 1<br/>(Avro)<br/>list of data files + column stats"]
    ML --> M2["Manifest File 2<br/>(Avro)<br/>list of data files + column stats"]
    M1 --> D1["data-00001.parquet"]
    M1 --> D2["data-00002.parquet"]
    M2 --> D3["data-00003.parquet"]
    M2 --> D4["data-00004.parquet"]
```

This three-level tree is the key design advantage of Iceberg. Each level contains statistics about the levels below it, enabling aggressive pruning:

- The **manifest list** knows which manifest files contain data matching a filter
- Each **manifest file** knows the min/max values for each column in its data files
- A query can skip entire manifest files (and their thousands of data files) without reading them

### Hidden Partitioning

Iceberg's most distinctive feature. In Hive-style partitioning, you partition by a column directly (e.g., `event_date`), and the partition value appears in the directory path. In Iceberg, you define partition **transforms** that derive partition values from source columns:

```sql
CREATE TABLE events (
    event_id BIGINT,
    event_ts TIMESTAMP,
    user_id BIGINT,
    event_type STRING,
    payload STRING
)
USING iceberg
PARTITIONED BY (days(event_ts), bucket(16, user_id));
```

The `days(event_ts)` transform partitions by day without requiring users to add a `event_date` column. The `bucket(16, user_id)` transform hashes `user_id` into 16 buckets. Queries automatically benefit from partition pruning without needing to know the partitioning scheme:

```sql
-- Iceberg automatically applies partition pruning
-- No need to add WHERE event_date = '2025-06-15'
SELECT * FROM events WHERE event_ts > '2025-06-15 00:00:00';
```

### Partition Evolution

This is where Iceberg pulls ahead of Delta Lake and Hudi. You can change the partitioning scheme of a table without rewriting any data:

```sql
-- Original partitioning: by day
ALTER TABLE events SET PARTITION SPEC (days(event_ts));

-- Later: add hour-level partitioning for recent data
ALTER TABLE events SET PARTITION SPEC (hours(event_ts), bucket(16, user_id));
```

Old data files retain their original partitioning. New data files use the new scheme. Iceberg's query planner handles both transparently.

### Snapshot Isolation and Time Travel

```python
# Read a specific snapshot
spark.read.option("snapshot-id", 10963874102873L).format("iceberg").load("db.events")

# Read as of a timestamp
spark.read.option("as-of-timestamp", "1655290800000").format("iceberg").load("db.events")

# Incremental reads between snapshots
spark.read.option("start-snapshot-id", 100).option("end-snapshot-id", 200) \
    .format("iceberg").load("db.events")
```

::: tip Incremental Reads
Iceberg's incremental read capability is critical for building efficient streaming pipelines. You can read only the data that changed between two snapshots, avoiding full table scans for each pipeline run.
:::

## Apache Hudi

### Architecture

Hudi (Hadoop Upserts Deletes and Incrementals), created at Uber, was designed specifically for streaming upserts — the use case where CDC events flow in continuously and must be merged into existing records.

Hudi has two table types:

| Table Type | Write Pattern | Query Performance | Use Case |
|------------|--------------|-------------------|----------|
| **Copy-on-Write (CoW)** | Rewrites entire file on update | Fast reads (pure Parquet) | Read-heavy, batch updates |
| **Merge-on-Read (MoR)** | Writes delta logs, merges on read | Faster writes, slower reads | Write-heavy, streaming |

```mermaid
graph LR
    subgraph CoW["Copy-on-Write"]
        direction TB
        W1["Write"] --> R1["Rewrite entire<br/>Parquet file"]
        R1 --> Q1["Query reads<br/>Parquet directly"]
    end

    subgraph MoR["Merge-on-Read"]
        direction TB
        W2["Write"] --> L2["Append to<br/>delta log file"]
        L2 --> Q2["Query merges<br/>base + log"]
        L2 --> C2["Compaction merges<br/>into new Parquet"]
    end
```

### Record-Level Indexing

Hudi maintains a record-level index that maps each record key to the file that contains it. This makes upserts efficient — instead of scanning the entire table to find which file contains a record, Hudi looks it up in the index.

```python
hudi_options = {
    'hoodie.table.name': 'orders',
    'hoodie.datasource.write.recordkey.field': 'order_id',
    'hoodie.datasource.write.precombine.field': 'updated_at',
    'hoodie.datasource.write.partitionpath.field': 'order_date',
    'hoodie.datasource.write.operation': 'upsert',
    'hoodie.index.type': 'BLOOM',  # BLOOM, SIMPLE, HBASE, BUCKET
}

df.write.format("hudi") \
    .options(**hudi_options) \
    .mode("append") \
    .save("s3://bucket/orders")
```

### Incremental Queries

Hudi was built for incremental consumption. You can query only the records that changed since a given commit:

```python
incremental_df = spark.read.format("hudi") \
    .option("hoodie.datasource.query.type", "incremental") \
    .option("hoodie.datasource.read.begin.instanttime", "20250615100000") \
    .load("s3://bucket/orders")
```

This is the foundation for building CDC pipelines and [Medallion Architecture](./medallion-architecture) transformations that process only changed data.

## Deep Comparison

### Transaction Guarantees

| Feature | Delta Lake | Apache Iceberg | Apache Hudi |
|---------|-----------|----------------|-------------|
| **ACID compliance** | Full | Full | Full |
| **Concurrency control** | Optimistic (log-based) | Optimistic (snapshot-based) | Optimistic (timeline-based) |
| **Conflict resolution** | Automatic retry for compatible ops | Automatic retry with conflict detection | Lock-based + timeline ordering |
| **Row-level deletes** | Deletion vectors (3.x) | Position delete files + equality deletes | Native (MoR delta logs) |
| **Concurrent writers** | Supported with conflict detection | Supported with retry | Supported with locking |

### Schema Evolution

| Operation | Delta Lake | Apache Iceberg | Apache Hudi |
|-----------|-----------|----------------|-------------|
| **Add column** | Yes | Yes | Yes |
| **Drop column** | Yes | Yes | Yes |
| **Rename column** | Yes | Yes (by ID, not name) | Limited |
| **Reorder columns** | No | Yes | No |
| **Widen type** | Yes (int→long, float→double) | Yes (full type promotion) | Limited |
| **Nested schema evolution** | Limited | Full (struct, list, map) | Limited |

::: tip Iceberg's Column ID Advantage
Iceberg tracks columns by ID, not by name. This means renaming a column does not break compatibility — readers match on the internal ID. Delta Lake and Hudi track by name or position, making renames riskier.
:::

### Performance Features

| Feature | Delta Lake | Apache Iceberg | Apache Hudi |
|---------|-----------|----------------|-------------|
| **Data skipping** | File-level stats in log | Multi-level stats (manifest → file → row group) | File-level stats via metadata table |
| **Z-ordering / sorting** | `OPTIMIZE ... ZORDER BY` | `sort-order` on table creation | Clustering |
| **Compaction** | `OPTIMIZE` | `rewrite_data_files` | Compaction service (inline or async) |
| **Partition evolution** | Requires full rewrite | In-place, no rewrite | Limited |
| **Merge-on-read** | Deletion vectors (3.x) | Delete files | Native MoR table type |
| **Bloom filter index** | No | Yes (on manifests) | Yes (record-level) |

### Ecosystem Compatibility

| Engine | Delta Lake | Apache Iceberg | Apache Hudi |
|--------|-----------|----------------|-------------|
| **Apache Spark** | Native | Excellent | Excellent |
| **Trino / Presto** | Good | Excellent | Good |
| **Apache Flink** | Limited | Good | Good |
| **DuckDB** | Good (via extension) | Good (via extension) | Limited |
| **Snowflake** | Yes (Iceberg tables) | Native | No |
| **BigQuery** | Via BigLake | Native (BigLake) | No |
| **Dremio** | Limited | Excellent (primary format) | No |
| **Databricks** | Native | Good (via UniForm) | Limited |

## Choosing a Table Format

```mermaid
flowchart TD
    Start["Choosing a Table Format"] --> Q1{"Databricks is your<br/>primary platform?"}
    Q1 -->|Yes| Delta["Delta Lake"]
    Q1 -->|No| Q2{"Primary use case?"}
    Q2 -->|"Multi-engine analytics<br/>(Spark + Trino + Flink)"| Iceberg["Apache Iceberg"]
    Q2 -->|"Streaming upserts<br/>(CDC, high-write)"| Q3{"Latency requirement?"}
    Q3 -->|"Sub-minute"| Hudi["Apache Hudi<br/>(MoR tables)"]
    Q3 -->|"Minutes OK"| Iceberg2["Apache Iceberg"]
    Q2 -->|"Pure analytics<br/>(batch reads)"| Q4{"Need partition<br/>evolution?"}
    Q4 -->|"Yes"| Iceberg3["Apache Iceberg"]
    Q4 -->|"No"| Either["Delta Lake or Iceberg"]

    style Delta fill:#3b82f6,color:#fff
    style Iceberg fill:#22c55e,color:#fff
    style Iceberg2 fill:#22c55e,color:#fff
    style Iceberg3 fill:#22c55e,color:#fff
    style Hudi fill:#f59e0b,color:#fff
    style Either fill:#8b5cf6,color:#fff
```

::: warning Format Convergence
The three formats are converging. Delta Lake 3.x added deletion vectors (Iceberg had them first). Iceberg added row-level merge capabilities. Hudi is improving multi-engine support. Databricks' UniForm generates Iceberg metadata alongside Delta metadata, blurring the lines further. Pick based on your current ecosystem, not theoretical feature lists.
:::

## ACID Transactions on Object Storage

Object stores like S3 provide **eventual consistency for listing** and **strong consistency for individual object reads/writes** (as of December 2020 for S3). Table formats build ACID on top of this:

1. **Atomicity** — a new commit is a single metadata file write. Either the file exists (committed) or it doesn't (aborted). No partial commits.
2. **Consistency** — the metadata always points to a valid, complete set of data files. Readers see a consistent snapshot.
3. **Isolation** — snapshot isolation. Each reader sees the table as of a specific version. Writers don't interfere with readers.
4. **Durability** — once the metadata file is written to object storage, it is durable (object storage provides 99.999999999% durability).

```python
# Delta Lake: write transaction example
from delta.tables import DeltaTable

delta_table = DeltaTable.forPath(spark, "s3://bucket/orders")

# This is a single atomic transaction:
# 1. Read existing data matching the condition
# 2. Merge new data with existing data
# 3. Write new Parquet files
# 4. Commit a new log entry atomically
delta_table.alias("target") \
    .merge(
        new_orders.alias("source"),
        "target.order_id = source.order_id"
    ) \
    .whenMatchedUpdateAll() \
    .whenNotMatchedInsertAll() \
    .execute()
```

## Compaction and Optimization

All three formats accumulate small files over time, especially with streaming ingestion. Small files degrade query performance because each file has fixed overhead (metadata reads, HTTP requests to object storage).

| Operation | Purpose | Frequency |
|-----------|---------|-----------|
| **Compaction** | Merge small files into larger ones | Hourly / daily |
| **Z-ordering** | Co-locate related data for better data skipping | After large ingestion batches |
| **Vacuum / expire snapshots** | Delete old data files no longer referenced | Daily / weekly |
| **Analyze / compute stats** | Update column statistics for query planning | After schema or data changes |

```sql
-- Delta Lake: compact small files
OPTIMIZE my_table;

-- Delta Lake: remove old files (retain 7 days for time travel)
VACUUM my_table RETAIN 168 HOURS;

-- Iceberg: rewrite data files targeting 512MB file size
CALL catalog.system.rewrite_data_files(
    table => 'db.my_table',
    options => map('target-file-size-bytes', '536870912')
);

-- Iceberg: expire old snapshots
CALL catalog.system.expire_snapshots('db.my_table', TIMESTAMP '2025-06-01 00:00:00');
```

::: danger Vacuum Safety
Never set the vacuum retention period shorter than the longest-running query against your table. If a query started 2 hours ago and is still reading files, vacuuming with a 1-hour retention will delete files that query needs, causing it to fail.
:::

## Further Reading

- Databricks, *"Delta Lake: High-Performance ACID Table Storage over Cloud Object Stores"* (VLDB 2020)
- Netflix, *"Iceberg: A Modern Table Format for Big Data"* (2018)
- Uber, *"Apache Hudi: The Streaming Data Lake Platform"* (2020)
- Related Archon pages:
  - [Data Lakehouse Overview](./index) — the architecture that open table formats enable
  - [Medallion Architecture](./medallion-architecture) — organizing lakehouse data into Bronze/Silver/Gold layers
  - [Query Engines](./query-engines) — engines that read these table formats
  - [Storage Engines](/system-design/databases/storage-engines) — how databases store data at the page level
  - [Stream Processing](/data-engineering/stream-processing/) — real-time ingestion into lakehouse tables

---

::: tip Key Takeaway
- Open table formats (Delta Lake, Iceberg, Hudi) add ACID transactions, time travel, and schema evolution on top of Parquet files in object storage.
- Delta Lake is tightly integrated with Databricks/Spark, Iceberg has the broadest multi-engine support, and Hudi excels at record-level upserts for CDC workloads.
- All three formats are converging in features -- choose based on your engine ecosystem, not feature checklists.
:::

::: details Exercise
**Choose a Table Format for These Use Cases**

For each scenario, recommend a table format and justify your choice:

1. A Databricks-centric analytics platform with 500 TB of data
2. A multi-engine lakehouse where Spark writes and Trino/DuckDB read
3. A CDC pipeline that needs to apply millions of row-level upserts per hour
4. A data lake where time travel (querying historical snapshots) is a compliance requirement
5. A startup with a small team that wants the simplest path to production

::: details Solution
1. **Delta Lake.** Tight Databricks integration, Unity Catalog for governance, optimized Spark performance with Z-ordering and liquid clustering. The Databricks ecosystem advantage is significant.

2. **Apache Iceberg.** Best multi-engine support: native readers in Spark, Trino, Flink, DuckDB, Snowflake, BigQuery, and Athena. Iceberg's catalog-based design (REST catalog, Hive Metastore, Nessie) decouples the format from any single engine.

3. **Apache Hudi.** Purpose-built for record-level upserts with Merge-on-Read (MoR) tables. Hudi's indexing (bucket, bloom, HBase) makes upserts efficient at scale. Copy-on-Write (CoW) is also available for read-heavy workloads.

4. **Any of the three.** All support time travel/snapshot queries. Iceberg has the most elegant snapshot management (snapshot IDs, branch/tag). Delta Lake integrates time travel with Databricks Unity Catalog for compliance.

5. **Delta Lake.** Simplest getting-started experience with `pip install delta-spark`. Good documentation, largest community, and the `delta-rs` library enables Python-native reads/writes without Spark.
:::

::: warning Common Misconceptions
- **"Table formats replace databases."** Table formats add database-like guarantees to files on object storage, but they do not provide indexing, query optimization, or a query engine. You still need Spark/Trino/DuckDB to query them.
- **"Delta Lake only works with Databricks."** Delta Lake is open source and works with Apache Spark, the `delta-rs` library (Python/Rust), Trino, and Flink. Databricks adds proprietary optimizations but the core format is open.
- **"You must choose one format for your entire lake."** Different tables can use different formats. Use Hudi for CDC-heavy tables and Iceberg for analytics tables. Engines like Trino can query both.
- **"Time travel is free."** Every write operation creates a new snapshot. Without vacuuming old snapshots, storage grows linearly with write frequency. Schedule regular maintenance (VACUUM, expire_snapshots).
- **"Table formats solve the small files problem."** They manage transactions, not file sizes. You still need compaction jobs (OPTIMIZE in Delta, rewrite_data_files in Iceberg) to consolidate small files.
:::

::: tip In Production
- **Netflix** uses Apache Iceberg as their primary table format, processing petabytes of viewing data with Spark and querying with Trino, leveraging Iceberg's snapshot isolation for concurrent reads and writes.
- **Uber** built Apache Hudi specifically for their CDC workloads, handling billions of record-level upserts daily for their trip and payment data lake.
- **Airbnb** standardized on Apache Iceberg across their data lake, using Iceberg's partition evolution to change partitioning strategies without rewriting data.
- **Adobe** uses Delta Lake for their Experience Platform, processing trillions of events with Delta's ACID transactions ensuring consistency across hundreds of concurrent writers.
:::

::: details Quiz
**1. What fundamental problem do open table formats solve?**

A) They compress data more efficiently than Parquet
B) They add ACID transactions, consistent snapshots, and schema enforcement on top of files in object storage
C) They replace the need for a query engine
D) They provide faster network transfer speeds

::: details Answer
**B)** Without table formats, a directory of Parquet files has no transactions (partial writes are visible), no consistent reads (readers may see partial updates), and no schema enforcement. Table formats add a metadata layer that provides these guarantees.
:::

**2. What is the difference between Copy-on-Write (CoW) and Merge-on-Read (MoR)?**

A) CoW is for reads; MoR is for writes
B) CoW rewrites entire files on updates (fast reads, slow writes); MoR writes deltas that are merged at read time (fast writes, slower reads)
C) CoW uses more memory; MoR uses more disk
D) They produce different data formats

::: details Answer
**B)** CoW creates new data files containing the updated data on every write (great for read-heavy workloads). MoR writes small delta/log files that are merged with base files at query time (great for write-heavy workloads with periodic compaction).
:::

**3. What is "time travel" in the context of table formats?**

A) Replicating data across time zones
B) Querying historical versions of a table as it existed at a specific point in time, using retained snapshots
C) Predicting future data values
D) Scheduling queries to run at specific times

::: details Answer
**B)** Table formats retain snapshots of the table state at each write. You can query any historical snapshot: `SELECT * FROM table VERSION AS OF '2026-03-01'`. This enables auditing, debugging, and compliance without maintaining separate historical tables.
:::

**4. Why is regular maintenance (VACUUM/compaction) necessary?**

A) To improve query accuracy
B) To reclaim storage from old snapshots and compact small files into optimally-sized ones for query performance
C) To update the table schema
D) To refresh the query cache

::: details Answer
**B)** Without maintenance: (1) old snapshots accumulate, growing storage linearly; (2) many small files from streaming writes create metadata overhead and slow queries. VACUUM removes old snapshots; OPTIMIZE/compaction merges small files.
:::

**5. Which table format has the broadest multi-engine support as of 2026?**

A) Delta Lake
B) Apache Hudi
C) Apache Iceberg
D) They all have identical engine support

::: details Answer
**C)** Apache Iceberg has native support in Spark, Flink, Trino, DuckDB, Snowflake, BigQuery, Athena, Dremio, and StarRocks. Its catalog-based design (REST catalog API) makes it engine-agnostic by design.
:::
:::

---

> **One-Liner Summary:** Open table formats turn a directory of Parquet files into a proper table with ACID transactions, time travel, and schema evolution -- choose based on your engine ecosystem, not feature checklists.
