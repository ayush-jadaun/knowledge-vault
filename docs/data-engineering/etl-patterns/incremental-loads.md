---
title: "Incremental Loads"
description: "Strategies for processing only changed data — timestamp-based, log-based, hash-based, and CDC approaches with merge patterns, late-arriving data handling, and production implementation examples."
tags: [incremental-loads, cdc, data-engineering, etl, merge, upsert, high-water-mark]
difficulty: intermediate
prerequisites: [data-engineering/etl-patterns]
lastReviewed: "2026-03-17"
---

# Incremental Loads

Full reloads are simple but do not scale. When your table grows from 1 million to 1 billion rows, reprocessing everything daily becomes untenable — too slow, too expensive, too fragile. Incremental loading processes only what has changed since the last run, reducing compute costs by orders of magnitude.

## Why Incremental Loading is Hard

Incremental loading sounds simple — "just load the new stuff." In practice, it introduces subtle challenges:

1. **Change detection** — How do you know which records changed?
2. **Deletes** — Full loads naturally handle deleted records. Incremental loads must detect and propagate deletions explicitly.
3. **Late-arriving data** — Records that arrive after the batch window closes.
4. **Ordering** — Records may not arrive in chronological order.
5. **Exactly-once semantics** — Ensuring records are neither duplicated nor lost across runs.
6. **Schema evolution** — New columns appearing in incremental batches.

## Change Detection Strategies

### Timestamp-Based (High-Water Mark)

The most common approach. Track the maximum `updated_at` timestamp from the last successful run and query only records newer than that timestamp.

```python
class TimestampIncrementalLoader:
    """
    Incremental loading using updated_at timestamp as the change marker.
    Requires: source table has a reliable updated_at column.
    """

    def __init__(self, source_db, target_db, state_store):
        self.source = source_db
        self.target = target_db
        self.state = state_store

    def load(self, source_table: str, target_table: str):
        # Retrieve last high-water mark
        hwm = self.state.get(f"{source_table}.hwm", default="1970-01-01T00:00:00Z")

        # Extract records modified after the HWM
        # IMPORTANT: Use >= not > to handle ties at the boundary
        # This may re-read some records, but the merge handles dedup
        new_records = self.source.query(f"""
            SELECT * FROM {source_table}
            WHERE updated_at >= %(hwm)s
            ORDER BY updated_at ASC
        """, {'hwm': hwm})

        if not new_records:
            log.info(f"No new records in {source_table} since {hwm}")
            return 0

        # Merge into target (upsert)
        self.merge_into_target(new_records, target_table)

        # Update HWM to the max updated_at in this batch
        new_hwm = max(r['updated_at'] for r in new_records)
        self.state.set(f"{source_table}.hwm", new_hwm)

        log.info(f"Loaded {len(new_records)} records, HWM: {hwm} → {new_hwm}")
        return len(new_records)
```

**Limitations:**
- Cannot detect deletes (no `updated_at` change on deletion)
- Source must have a reliable `updated_at` column (application bugs can break this)
- Records updated between query start and HWM update may be missed

**Mitigations:**
```python
# Use >= with overlap to handle boundary conditions
# Accept that some records will be read twice — the merge handles idempotency
WHERE updated_at >= %(hwm)s  # >= catches ties

# Add a safety margin for clock skew
hwm_with_margin = hwm - timedelta(minutes=5)
WHERE updated_at >= %(hwm_with_margin)s
```

### Log-Based (CDC)

Read from the database's write-ahead log (WAL) or binary log. Captures inserts, updates, and deletes with zero impact on the source database.

```python
# Debezium CDC event structure
cdc_event = {
    "op": "u",  # c=create, u=update, d=delete, r=read(snapshot)
    "before": {
        "id": 42,
        "name": "Old Name",
        "email": "old@example.com",
        "updated_at": "2026-03-16T10:00:00Z"
    },
    "after": {
        "id": 42,
        "name": "New Name",
        "email": "new@example.com",
        "updated_at": "2026-03-17T14:30:00Z"
    },
    "source": {
        "ts_ms": 1710685800000,
        "db": "production",
        "table": "users",
        "lsn": 123456789
    }
}

class CDCIncrementalLoader:
    """Process CDC events from Kafka/Debezium."""

    def process_event(self, event: dict, target_table: str):
        op = event['op']

        if op in ('c', 'r'):  # Create or snapshot read
            self.target.upsert(target_table, event['after'])

        elif op == 'u':  # Update
            self.target.upsert(target_table, event['after'])

        elif op == 'd':  # Delete
            # Soft delete — mark as deleted, don't remove
            self.target.update(
                target_table,
                where={'id': event['before']['id']},
                set={'_deleted': True, '_deleted_at': event['source']['ts_ms']}
            )
```

**Advantages:**
- Captures all changes including deletes
- Zero load on source database (reads from WAL, not main tables)
- Provides before/after images for auditing
- Near real-time latency possible

**Challenges:**
- More complex infrastructure (Debezium, Kafka, connectors)
- WAL retention limits how far back you can go
- Initial snapshot required for existing data

### Hash-Based Change Detection

When the source lacks timestamps and CDC is not available, compare hashes of row content:

```sql
-- Step 1: Compute hash of current source data
CREATE TABLE staging.source_hashes AS
SELECT
    id,
    MD5(CONCAT_WS('|',
        COALESCE(name, ''),
        COALESCE(email, ''),
        COALESCE(status, ''),
        COALESCE(CAST(amount AS TEXT), '')
    )) AS row_hash
FROM source.customers;

-- Step 2: Compare with existing target hashes
SELECT
    s.id,
    CASE
        WHEN t.id IS NULL THEN 'INSERT'
        WHEN s.row_hash != t.row_hash THEN 'UPDATE'
        ELSE 'UNCHANGED'
    END AS change_type
FROM staging.source_hashes s
LEFT JOIN target.customer_hashes t ON s.id = t.id

UNION ALL

-- Detect deletes: records in target but not in source
SELECT t.id, 'DELETE' AS change_type
FROM target.customer_hashes t
LEFT JOIN staging.source_hashes s ON t.id = s.id
WHERE s.id IS NULL;
```

**Trade-offs:**
- Works with any source (no schema requirements)
- Can detect deletes (by comparing full sets)
- Expensive: requires reading full source every time
- Hash collisions are theoretically possible (use SHA-256 for safety)

### Sequence Number / Version Column

Some systems maintain a monotonically increasing version or sequence number:

```python
# Extract records with version > last processed version
def load_by_version(source_table: str, target_table: str):
    last_version = state.get(f"{source_table}.version", default=0)

    records = source.query(f"""
        SELECT * FROM {source_table}
        WHERE version > %(last_version)s
        ORDER BY version ASC
    """, {'last_version': last_version})

    if records:
        merge_into_target(records, target_table)
        state.set(f"{source_table}.version", max(r['version'] for r in records))
```

## Merge Patterns (Upsert)

### SQL MERGE Statement

The standard approach for merging incremental data into a target table:

```sql
-- Standard SQL MERGE (works in Snowflake, BigQuery, SQL Server)
MERGE INTO warehouse.dim_customers AS target
USING staging.new_customers AS source
ON target.customer_id = source.customer_id

WHEN MATCHED AND source.updated_at > target.updated_at THEN
    UPDATE SET
        name = source.name,
        email = source.email,
        status = source.status,
        updated_at = source.updated_at,
        _loaded_at = CURRENT_TIMESTAMP

WHEN NOT MATCHED THEN
    INSERT (customer_id, name, email, status, updated_at, _loaded_at)
    VALUES (source.customer_id, source.name, source.email,
            source.status, source.updated_at, CURRENT_TIMESTAMP);
```

### PostgreSQL Upsert

```sql
-- PostgreSQL ON CONFLICT (upsert)
INSERT INTO warehouse.dim_customers (customer_id, name, email, status, updated_at)
SELECT customer_id, name, email, status, updated_at
FROM staging.new_customers
ON CONFLICT (customer_id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at,
    _loaded_at = CURRENT_TIMESTAMP
WHERE dim_customers.updated_at < EXCLUDED.updated_at;
```

### Delta Lake Merge

```python
# Delta Lake MERGE for data lakehouse
from delta.tables import DeltaTable

target = DeltaTable.forPath(spark, "s3://lakehouse/dim_customers/")
source = spark.read.parquet("s3://staging/new_customers/")

target.alias("t").merge(
    source.alias("s"),
    "t.customer_id = s.customer_id"
).whenMatchedUpdate(
    condition="s.updated_at > t.updated_at",
    set={
        "name": "s.name",
        "email": "s.email",
        "status": "s.status",
        "updated_at": "s.updated_at",
        "_loaded_at": "current_timestamp()"
    }
).whenNotMatchedInsert(
    values={
        "customer_id": "s.customer_id",
        "name": "s.name",
        "email": "s.email",
        "status": "s.status",
        "updated_at": "s.updated_at",
        "_loaded_at": "current_timestamp()"
    }
).execute()
```

## Handling Late-Arriving Data

Late data is data that arrives after the batch window for its event time has already been processed.

```python
# Strategy 1: Lookback window — reprocess recent partitions
def incremental_with_lookback(target_date: str, lookback_days: int = 3):
    """
    Process the target date plus N lookback days.
    Late-arriving data within the lookback window is captured.
    """
    for offset in range(lookback_days + 1):
        date = target_date - timedelta(days=offset)
        partition_path = f"s3://raw/events/date={date}/"

        if not path_exists(partition_path):
            continue

        df = spark.read.parquet(partition_path)
        # MERGE handles idempotency — re-processing is safe
        merge_into_target(df, "warehouse.fact_events")
```

```python
# Strategy 2: Late-arriving data table
# Route late data to a separate staging area for special handling
def classify_arrival(record: dict, batch_window_end: datetime) -> str:
    event_time = parse_datetime(record['event_timestamp'])
    if event_time >= batch_window_end - timedelta(hours=1):
        return 'on_time'
    elif event_time >= batch_window_end - timedelta(days=3):
        return 'late_acceptable'
    else:
        return 'late_suspicious'  # Flag for investigation

# Route to appropriate handling
for record in batch:
    classification = classify_arrival(record, batch_end)
    if classification == 'on_time':
        load_to_main_table(record)
    elif classification == 'late_acceptable':
        merge_into_main_table(record)  # Upsert to handle idempotency
    else:
        load_to_quarantine(record)  # Manual review
```

## Handling Deletes in Incremental Pipelines

### Soft Deletes

The most common approach — mark records as deleted rather than physically removing them:

```sql
-- Add soft delete columns
ALTER TABLE warehouse.dim_customers
ADD COLUMN _is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN _deleted_at TIMESTAMP;

-- When a delete is detected (via CDC or hash comparison)
UPDATE warehouse.dim_customers
SET _is_deleted = TRUE,
    _deleted_at = CURRENT_TIMESTAMP
WHERE customer_id = 42;

-- Queries that need active records filter on _is_deleted
SELECT * FROM warehouse.dim_customers
WHERE _is_deleted = FALSE;
```

### Full Outer Join for Delete Detection

When CDC is not available, detect deletes by comparing source and target:

```sql
-- Detect deletes by full outer join
WITH source_ids AS (
    SELECT DISTINCT customer_id FROM staging.current_source_data
),
target_ids AS (
    SELECT DISTINCT customer_id FROM warehouse.dim_customers
    WHERE _is_deleted = FALSE
)
UPDATE warehouse.dim_customers
SET _is_deleted = TRUE, _deleted_at = CURRENT_TIMESTAMP
WHERE customer_id IN (
    SELECT t.customer_id
    FROM target_ids t
    LEFT JOIN source_ids s ON t.customer_id = s.customer_id
    WHERE s.customer_id IS NULL  -- In target but not in source = deleted
);
```

## Production Implementation Checklist

```python
class ProductionIncrementalPipeline:
    """
    Production-grade incremental pipeline with all safety features.
    """

    def run(self, source_table: str, target_table: str):
        run_id = uuid4().hex
        log.info(f"Starting incremental load [{run_id}]")

        # 1. Get high-water mark
        hwm = self.state.get_hwm(source_table)
        log.info(f"High-water mark: {hwm}")

        # 2. Extract with safety margin
        safety_margin = timedelta(minutes=5)
        records = self.extract(source_table, hwm - safety_margin)
        metrics.gauge("incremental.extracted_count", len(records))

        if not records:
            log.info("No new records")
            return

        # 3. Validate before loading
        validation = self.validate(records)
        if validation.critical_errors:
            raise PipelineError(f"Critical validation failures: {validation.critical_errors}")

        # Route invalid records to dead letter queue
        valid_records = [r for r in records if r not in validation.invalid_records]
        if validation.invalid_records:
            self.dead_letter_queue.send(validation.invalid_records, reason=validation.errors)

        # 4. Merge into target (idempotent)
        merge_stats = self.merge(valid_records, target_table)
        log.info(f"Merge stats: {merge_stats}")

        # 5. Update high-water mark (only after successful merge)
        new_hwm = max(r['updated_at'] for r in records)
        self.state.set_hwm(source_table, new_hwm)

        # 6. Post-load validation
        self.check_row_count_anomaly(target_table)
        self.check_freshness(target_table)

        # 7. Emit metrics
        metrics.gauge("incremental.loaded_count", merge_stats.upserted)
        metrics.gauge("incremental.rejected_count", len(validation.invalid_records))
        metrics.histogram("incremental.duration_s", time.time() - start)
```

## Key Takeaways

1. **Timestamp-based incremental is the default choice.** Simple, effective, works with most sources.
2. **Use `>=` not `>` for high-water mark queries.** Handle boundary ties safely — the merge deduplicates.
3. **Add a safety margin to the HWM.** Clock skew and transaction isolation can cause records to be missed.
4. **CDC captures everything including deletes.** Use it when the infrastructure cost is justified.
5. **Soft deletes preserve history.** Hard deletes make recovery impossible.
6. **Late-arriving data needs a lookback window.** Reprocess N recent partitions with idempotent merges.
7. **Update the HWM only after successful processing.** Otherwise, records can be permanently skipped.

---

::: tip Key Takeaway
- Timestamp-based incremental loading with a high-water mark is the default strategy -- use `>=` with a safety margin to avoid missing records at boundaries.
- CDC (Change Data Capture) is the gold standard for capturing all changes including deletes, but requires more infrastructure (Debezium, Kafka).
- Always update the high-water mark atomically with the data load and use MERGE/UPSERT to handle idempotent re-processing.
:::

::: details Exercise
**Build an Incremental Pipeline for a Multi-Source CRM**

Your CRM system has three source tables: `customers` (10M rows, has `updated_at`), `orders` (500M rows, has `updated_at`), and `interactions` (2B rows, no `updated_at`, has auto-increment `id`).

Design an incremental pipeline that:
1. Chooses the right change detection strategy for each table
2. Handles late-arriving data for the `orders` table
3. Detects deletes in the `customers` table
4. Processes the `interactions` table incrementally without timestamps

::: details Solution
1. **customers:** Timestamp-based HWM on `updated_at` with 5-minute safety margin. Detect deletes via periodic full-outer-join comparison (weekly) since CDC may not be available.
2. **orders:** Timestamp-based HWM with a 3-day lookback window. Each run processes `HWM - 3 days` to today, using MERGE to handle idempotent re-processing of overlapping records.
3. **customers deletes:** Weekly batch job compares source IDs vs target IDs. IDs in target but not in source are soft-deleted (`_is_deleted = TRUE, _deleted_at = NOW()`). For real-time delete detection, add Debezium CDC.
4. **interactions:** Sequence-number-based HWM on the auto-increment `id`. Query `WHERE id > last_processed_id ORDER BY id ASC`. No safety margin needed since auto-increment IDs are monotonic and gap-free within committed transactions.
:::

::: warning Common Misconceptions
- **"Full loads are always simpler than incremental."** Full loads are simpler to implement but become untenable at scale. A 1B-row table taking 4 hours to reload daily is not simpler when it misses SLAs.
- **"Incremental loads cannot detect deletes."** They can with CDC (captures delete events), hash-based comparison (detects missing rows), or periodic full-outer-join reconciliation.
- **"Using `>` instead of `>=` for HWM queries is fine."** It is not. If multiple records share the same `updated_at` timestamp at the boundary, `>` will miss records. Always use `>=` and rely on the MERGE to deduplicate.
- **"Incremental pipelines eliminate the need for full reloads."** You still need full reload capability for initial loads, disaster recovery, and periodic reconciliation to catch drift.
:::

::: tip In Production
- **Uber** uses log-based CDC with Debezium to incrementally replicate hundreds of microservice databases into their data lake, processing billions of change events daily.
- **Spotify** runs timestamp-based incremental loads for their content metadata pipelines, with a 6-hour lookback window to catch late-arriving metadata updates from label systems.
- **Airbnb** combines CDC for booking data (captures cancellations/deletes) with timestamp-based incremental loads for search impression data (append-only, no deletes).
- **Netflix** uses hash-based change detection for their content catalog pipeline, where source systems lack reliable `updated_at` columns but data correctness is critical.
:::

::: details Quiz
**1. Why should you use `>=` instead of `>` when querying with a high-water mark?**

A) It is faster for the database to execute
B) It handles ties at the boundary where multiple records share the same timestamp
C) It reduces network traffic
D) It is required by the SQL standard

::: details Answer
**B)** If two records have the same `updated_at` value at the HWM boundary, using `>` would miss the second record. Using `>=` re-reads some records, but the downstream MERGE handles deduplication.
:::

**2. What is the key advantage of log-based CDC over timestamp-based incremental loading?**

A) It is simpler to implement
B) It captures all changes including deletes, with zero load on the source database
C) It requires no infrastructure
D) It is faster for initial loads

::: details Answer
**B)** Log-based CDC reads from the database's write-ahead log (WAL), capturing inserts, updates, and deletes without querying the main tables. This eliminates source database load and captures changes that timestamp-based approaches miss.
:::

**3. What is the purpose of a safety margin on the high-water mark?**

A) To make queries run faster
B) To account for clock skew and transaction isolation that could cause records to be missed
C) To reduce storage costs
D) To handle schema changes

::: details Answer
**B)** Clock differences between application servers and the database, combined with in-flight transactions at query time, can cause records to have timestamps slightly before the HWM. A 5-minute safety margin re-reads a small overlap to prevent data loss.
:::

**4. How do soft deletes differ from hard deletes in incremental pipelines?**

A) Soft deletes are faster to execute
B) Soft deletes mark records as deleted without removing them, preserving history for recovery and auditing
C) Soft deletes use less storage
D) Soft deletes are only possible with CDC

::: details Answer
**B)** Soft deletes add `_is_deleted = TRUE` and `_deleted_at` columns instead of physically removing rows. This preserves the audit trail and makes recovery possible if a delete was incorrect.
:::

**5. When would you choose hash-based change detection over timestamp-based?**

A) When the source has a reliable `updated_at` column
B) When the source lacks timestamps and CDC is not available
C) When processing streaming data
D) When data volumes exceed 1 TB

::: details Answer
**B)** Hash-based detection works with any source by computing MD5/SHA-256 hashes of row content and comparing them. It is the fallback when the source has no `updated_at` column and CDC infrastructure is not available.
:::
:::

---

> **One-Liner Summary:** Incremental loading processes only what changed -- use timestamps with `>=` and a safety margin as the default, CDC when you need deletes, and always MERGE into the target.

---

*Next: [Idempotent Pipelines →](idempotent-pipelines.md)*
