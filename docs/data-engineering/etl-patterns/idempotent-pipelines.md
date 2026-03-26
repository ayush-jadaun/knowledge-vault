---
title: "Idempotent Pipelines"
description: "Making data pipelines safe to retry — deterministic transforms, atomic writes, natural keys, partition-level idempotency, and patterns for ensuring exactly-once semantics without distributed transactions."
tags: [idempotency, data-engineering, etl, exactly-once, retry-safety, pipelines]
difficulty: intermediate
prerequisites: [data-engineering/etl-patterns]
lastReviewed: "2026-03-17"
---

# Idempotent Pipelines

An idempotent pipeline produces the same result whether it runs once or ten times on the same input. This property is not optional in production data engineering — it is a survival requirement. Pipelines fail. Schedulers retry. Operators re-run jobs manually. If re-running a pipeline produces duplicates, overwrites valid data, or corrupts state, you have a fragile system.

## Why Idempotency Matters

Consider what happens without idempotency:

```
Scenario: Daily revenue pipeline
09:00 — Pipeline runs, loads 50,000 orders, reports $2.3M revenue
09:15 — Network timeout during commit. Did it load? Unknown.
09:16 — Scheduler retries automatically.
09:30 — Pipeline runs again, loads 50,000 orders again.
Result: 100,000 orders loaded, reports $4.6M revenue.
CEO sends champagne. CFO calls an emergency meeting.
```

With idempotency:
```
09:00 — Pipeline runs, loads 50,000 orders.
09:15 — Network timeout during commit. Partial load occurred.
09:16 — Scheduler retries automatically.
09:30 — Pipeline runs again on the same input.
         - Records that already loaded: merge detects them, updates in place.
         - Records that didn't load: inserted normally.
Result: 50,000 orders loaded, reports $2.3M revenue. Correct.
```

## Principles of Idempotent Pipeline Design

### Principle 1: Deterministic Transforms

The same input must always produce the same output. No randomness, no wall-clock timestamps, no external state that changes between runs.

```python
# BAD: Non-deterministic transforms
def transform_order(order: dict) -> dict:
    return {
        **order,
        'processed_at': datetime.now(),      # Different on every run!
        'batch_id': uuid4().hex,              # Different on every run!
        'random_sample': random.random(),     # Different on every run!
    }

# GOOD: Deterministic transforms
def transform_order(order: dict, run_date: str) -> dict:
    return {
        **order,
        'processed_date': run_date,           # Passed as parameter, stable
        'order_hash': hashlib.sha256(         # Deterministic from input
            json.dumps(order, sort_keys=True).encode()
        ).hexdigest(),
    }
```

### Principle 2: Natural Keys for Deduplication

Every record must have a natural key (business identifier) that uniquely identifies it. Synthetic auto-increment IDs break idempotency because a re-run generates new IDs.

```sql
-- BAD: Auto-increment ID means re-runs create duplicates
CREATE TABLE fact_orders (
    id SERIAL PRIMARY KEY,          -- Different ID on every insert!
    order_id INTEGER,
    amount DECIMAL(18,2)
);
-- Running twice: two rows with different `id` for the same order_id

-- GOOD: Natural key prevents duplicates
CREATE TABLE fact_orders (
    order_id INTEGER PRIMARY KEY,   -- Natural key from source
    amount DECIMAL(18,2),
    _loaded_at TIMESTAMP
);
-- Running twice: second run updates the existing row (upsert)
```

### Principle 3: Atomic Partition Overwrites

For partitioned data, overwrite the entire partition atomically. This is the simplest form of idempotency — if you overwrite the whole partition, running twice is the same as running once.

```python
# Partition-level idempotency with atomic overwrite
def load_daily_partition(date: str):
    df = extract_and_transform(date)

    # Overwrite just this date's partition
    df.write \
        .mode("overwrite") \
        .partitionBy("event_date") \
        .parquet("s3://warehouse/fact_events/")

    # Running this twice for the same date:
    # First run: writes partition event_date=2026-03-17
    # Second run: overwrites the same partition with identical data
    # Result: same as running once
```

```sql
-- SQL equivalent: DELETE + INSERT in a transaction
BEGIN TRANSACTION;

DELETE FROM warehouse.fact_events
WHERE event_date = '2026-03-17';

INSERT INTO warehouse.fact_events
SELECT * FROM staging.events_20260317;

COMMIT;
-- Atomic: either both succeed or neither does
```

### Principle 4: Upsert (Merge) Instead of Insert

Never use bare INSERT for incremental loads. Always use MERGE/UPSERT so that re-runs update existing records instead of creating duplicates.

```sql
-- Idempotent merge pattern
MERGE INTO warehouse.dim_products AS target
USING staging.products AS source
ON target.product_id = source.product_id

WHEN MATCHED THEN UPDATE SET
    name = source.name,
    price = source.price,
    category = source.category,
    updated_at = source.updated_at,
    _loaded_at = CURRENT_TIMESTAMP

WHEN NOT MATCHED THEN INSERT
    (product_id, name, price, category, updated_at, _loaded_at)
VALUES
    (source.product_id, source.name, source.price,
     source.category, source.updated_at, CURRENT_TIMESTAMP);
```

### Principle 5: Exactly-Once State Updates

State changes (high-water marks, checkpoints) must be updated atomically with the data load. If they are separate operations, a failure between them breaks idempotency.

```python
# BAD: State update separate from data load
def load_incremental(source_table, target_table):
    hwm = state.get_hwm(source_table)
    records = extract(source_table, since=hwm)
    load(records, target_table)  # Step 1: Load data
    # ← CRASH HERE: data loaded but HWM not updated
    # Next run re-extracts and re-loads → duplicates!
    state.set_hwm(source_table, new_hwm)  # Step 2: Update state

# GOOD: State update in same transaction as data load
def load_incremental(source_table, target_table):
    hwm = state.get_hwm(source_table)
    records = extract(source_table, since=hwm)

    with target_db.transaction() as tx:
        # Both in same transaction — atomic
        merge_records(tx, records, target_table)
        tx.execute("""
            UPDATE pipeline_state
            SET high_water_mark = %(new_hwm)s
            WHERE source_table = %(source)s
        """, {'new_hwm': new_hwm, 'source': source_table})
    # If anything fails, both are rolled back
```

## Idempotency Patterns by Scenario

### Pattern 1: Full Partition Overwrite

```python
# Simplest idempotency: overwrite the entire output
# Works when: output can be fully recomputed from input
# Cost: recomputes everything in the partition

def full_partition_overwrite(date: str):
    # Read all source data for this date
    source = spark.read.parquet(f"s3://raw/events/date={date}/")

    # Apply all transforms
    result = transform(source)

    # Overwrite the output partition
    result.write \
        .mode("overwrite") \
        .option("path", f"s3://warehouse/events/date={date}/") \
        .saveAsTable("warehouse.events")
```

### Pattern 2: Merge with Dedup

```python
# When appending to a non-partitioned table
# Works when: records have natural keys
# Cost: merge operation scales with batch size × target size

def merge_with_dedup(batch_df, target_table: str, key_columns: list[str]):
    # Deduplicate within the batch first
    deduped = batch_df.dropDuplicates(key_columns)

    # Merge into target
    target = DeltaTable.forName(spark, target_table)
    merge_condition = " AND ".join(
        f"t.{col} = s.{col}" for col in key_columns
    )

    target.alias("t").merge(
        deduped.alias("s"),
        merge_condition
    ).whenMatchedUpdateAll() \
     .whenNotMatchedInsertAll() \
     .execute()
```

### Pattern 3: Write-Audit-Publish

A three-phase pattern that separates writing from publishing:

```python
class WriteAuditPublishPipeline:
    """
    Phase 1 (Write):   Write to a staging location
    Phase 2 (Audit):   Validate the staged data
    Phase 3 (Publish): Atomically swap staging into production

    Idempotent because:
    - Staging is always overwritten (Phase 1 is idempotent)
    - Publish is an atomic swap (Phase 3 is idempotent)
    - A failure at any phase leaves production unchanged
    """

    def run(self, date: str):
        staging_path = f"s3://staging/events/date={date}/"
        production_path = f"s3://production/events/date={date}/"

        # Phase 1: Write to staging (overwrite → idempotent)
        result = self.extract_and_transform(date)
        result.write.mode("overwrite").parquet(staging_path)

        # Phase 2: Audit
        staged = spark.read.parquet(staging_path)
        audit = self.validate(staged)
        if not audit.passed:
            raise AuditFailure(f"Validation failed: {audit.errors}")

        # Phase 3: Publish (atomic rename/copy)
        self.atomic_publish(staging_path, production_path)
```

### Pattern 4: Idempotent Inserts with Conflict Handling

```sql
-- PostgreSQL: Insert with conflict handling
INSERT INTO warehouse.events (event_id, user_id, event_type, event_data, event_time)
VALUES
    ('evt_001', 42, 'purchase', '{"amount": 99.99}', '2026-03-17T14:30:00Z'),
    ('evt_002', 43, 'signup', '{}', '2026-03-17T14:31:00Z')
ON CONFLICT (event_id) DO NOTHING;
-- Re-running this: conflicts detected, nothing inserted, no duplicates

-- Alternative: Update on conflict (for mutable records)
ON CONFLICT (event_id) DO UPDATE SET
    event_data = EXCLUDED.event_data,
    event_time = EXCLUDED.event_time,
    _updated_at = CURRENT_TIMESTAMP;
```

## Testing Idempotency

```python
# Idempotency test: run pipeline twice, assert same result
class TestPipelineIdempotency:

    def test_double_run_produces_same_result(self):
        """Running the pipeline twice on the same input must produce identical output."""
        input_data = self.generate_test_data(1000)

        # First run
        self.pipeline.run(input_data, target="test_table")
        result_after_first_run = self.db.query("SELECT * FROM test_table ORDER BY id")
        count_after_first_run = len(result_after_first_run)

        # Second run — same input
        self.pipeline.run(input_data, target="test_table")
        result_after_second_run = self.db.query("SELECT * FROM test_table ORDER BY id")
        count_after_second_run = len(result_after_second_run)

        # Assert: same number of records
        assert count_after_first_run == count_after_second_run, \
            f"Duplicate records: {count_after_first_run} → {count_after_second_run}"

        # Assert: same content
        assert result_after_first_run == result_after_second_run, \
            "Record content changed on re-run"

    def test_partial_failure_recovery(self):
        """Pipeline must recover correctly from partial failure."""
        input_data = self.generate_test_data(1000)

        # Simulate partial failure: load 500 records, then crash
        with self.simulate_crash_after(500):
            try:
                self.pipeline.run(input_data, target="test_table")
            except SimulatedCrash:
                pass

        partial_count = self.db.count("test_table")
        assert partial_count <= 1000  # Some records loaded

        # Retry: full run
        self.pipeline.run(input_data, target="test_table")
        final_count = self.db.count("test_table")
        assert final_count == 1000  # Exactly 1000, no duplicates
```

## Common Idempotency Mistakes

### Mistake 1: Using Wall-Clock Time as Data

```python
# BAD: Embeds current time into output
record['processed_at'] = datetime.utcnow()
# Re-running produces different processed_at → output differs

# GOOD: Use logical time (pipeline execution date) passed as parameter
record['processed_date'] = execution_date  # e.g., "2026-03-17"
```

### Mistake 2: Generating IDs Inside the Pipeline

```python
# BAD: New UUID on every run
record['surrogate_key'] = str(uuid4())
# Re-running generates different keys → duplicates with different IDs

# GOOD: Derive ID deterministically from business keys
record['surrogate_key'] = hashlib.sha256(
    f"{record['source_system']}:{record['source_id']}".encode()
).hexdigest()
```

### Mistake 3: Counting on Insert Order

```python
# BAD: Row number as a key
df = df.withColumn("row_number", monotonically_increasing_id())
# Different parallelism → different row numbers on re-run

# GOOD: Use natural business keys that are stable across runs
```

### Mistake 4: Side Effects Without Guards

```python
# BAD: Sends notification on every run
def load_and_notify(records):
    load(records)
    send_slack_notification(f"Loaded {len(records)} records")
    # Re-run: sends duplicate notification

# GOOD: Idempotent notification with dedup key
def load_and_notify(records, run_id: str):
    load(records)
    send_slack_notification(
        f"Loaded {len(records)} records",
        dedup_key=f"pipeline-{run_id}"  # Same run_id → same notification
    )
```

## Key Takeaways

1. **Idempotency is a requirement, not a feature.** Every pipeline will be retried.
2. **Partition overwrite is the simplest idempotency pattern.** Use it when you can recompute an entire partition.
3. **MERGE/UPSERT on natural keys for incremental loads.** Never bare INSERT.
4. **Deterministic transforms: no `now()`, no `uuid4()`, no `random()`.** Pass execution parameters explicitly.
5. **Update state atomically with data.** Put HWM updates in the same transaction as data loads.
6. **Test idempotency explicitly.** Run the pipeline twice and assert the output is identical.

---

::: tip Key Takeaway
- An idempotent pipeline produces the same result whether it runs once or ten times -- this is a survival requirement, not a nice-to-have.
- Use partition overwrites for the simplest idempotency, MERGE/UPSERT on natural keys for incremental loads, and deterministic transforms with no `now()`, `uuid4()`, or `random()`.
- Always test idempotency explicitly by running the pipeline twice and asserting identical output.
:::

::: details Exercise
**Audit a Pipeline for Idempotency Violations**

Review this pipeline code and identify all idempotency violations. Then fix each one.

```python
def daily_order_pipeline(orders):
    results = []
    for order in orders:
        record = {
            'id': uuid4().hex,
            'order_id': order['order_id'],
            'amount': order['amount'],
            'processed_at': datetime.now(),
            'batch_id': random.randint(1, 1000000),
        }
        results.append(record)
    db.execute("INSERT INTO fact_orders VALUES (...)", results)
    send_slack_notification(f"Processed {len(results)} orders")
    state.set_hwm('orders', max(o['updated_at'] for o in orders))
```

::: details Solution
**Violations found:**
1. `uuid4().hex` -- generates a new surrogate key on every run (creates duplicates)
2. `datetime.now()` -- non-deterministic timestamp (output differs per run)
3. `random.randint()` -- random value (output differs per run)
4. Bare `INSERT` -- creates duplicates on re-run (should be MERGE/UPSERT)
5. `send_slack_notification` without dedup key -- duplicate notifications on retry
6. HWM update is separate from data load -- crash between them causes data loss or duplication

**Fixed version:**
```python
def daily_order_pipeline(orders, execution_date: str):
    results = []
    for order in orders:
        record = {
            'id': hashlib.sha256(f"order:{order['order_id']}".encode()).hexdigest(),
            'order_id': order['order_id'],
            'amount': order['amount'],
            'processed_date': execution_date,
            'batch_id': hashlib.md5(execution_date.encode()).hexdigest()[:8],
        }
        results.append(record)
    with db.transaction() as tx:
        tx.execute("MERGE INTO fact_orders ...", results)
        tx.execute("UPDATE pipeline_state SET hwm = ...", new_hwm)
    send_slack_notification(f"Processed {len(results)}", dedup_key=f"orders-{execution_date}")
```
:::

::: warning Common Misconceptions
- **"Idempotency only matters for production pipelines."** Development and staging pipelines also get retried. Non-idempotent dev pipelines create confusing test results and unreproducible bugs.
- **"Using `INSERT ... ON CONFLICT DO NOTHING` is the same as MERGE."** `DO NOTHING` silently discards updates to existing records. Use `DO UPDATE` if source records can be modified.
- **"Partition overwrite is wasteful because it recomputes everything."** It is the simplest and most reliable idempotency pattern. The compute cost is usually small compared to the debugging cost of duplicate data.
- **"UUIDs are fine as primary keys in ETL."** Generated UUIDs break idempotency because re-runs create new keys. Derive surrogate keys deterministically from business keys using hashing.
:::

::: tip In Production
- **Airbnb** enforces idempotency by convention: every Spark job uses partition overwrite mode, and all incremental pipelines use MERGE with natural keys from the source system.
- **Uber** tests idempotency as part of their CI pipeline for data jobs -- every new pipeline must pass a "run twice, assert same output" test before deployment.
- **Netflix** uses the Write-Audit-Publish pattern for critical recommendation pipelines: write to staging, validate, then atomically swap into production.
- **Spotify** passes execution dates as explicit parameters (never `datetime.now()`) in all Airflow DAGs to ensure deterministic re-runs during backfills.
:::

::: details Quiz
**1. What makes a pipeline idempotent?**

A) It runs faster on subsequent executions
B) It produces the same result whether it runs once or multiple times on the same input
C) It automatically retries on failure
D) It uses exactly-once message delivery

::: details Answer
**B)** Idempotency means running the pipeline N times on the same input produces the exact same output as running it once. No duplicates, no missing data, no changed values.
:::

**2. Why is `datetime.now()` a violation of idempotency?**

A) It is slow to compute
B) It produces a different value on each run, making the output non-deterministic
C) It requires network access
D) It is not supported in all SQL databases

::: details Answer
**B)** `datetime.now()` returns the current wall-clock time, which is different on every execution. A re-run produces different `processed_at` values, making the output differ from the first run.
:::

**3. What is the Write-Audit-Publish pattern?**

A) A logging pattern for data pipelines
B) A three-phase pattern: write to staging, validate, then atomically swap into production
C) A notification system for pipeline completion
D) A version control pattern for SQL queries

::: details Answer
**B)** Write-Audit-Publish separates writing (to staging), auditing (validation), and publishing (atomic swap to production). Each phase is idempotent: staging is overwritten, publish is atomic, and failure at any phase leaves production unchanged.
:::

**4. Why should state updates (HWM) be in the same transaction as data loads?**

A) To improve query performance
B) If they are separate, a crash between data load and state update causes either duplicates or data loss on retry
C) To reduce storage costs
D) It is required by the SQL standard

::: details Answer
**B)** If data loads successfully but HWM update fails (crash between the two), the next run re-extracts and re-loads the same data, creating duplicates. If HWM updates but data load failed, those records are permanently skipped.
:::

**5. How should you generate surrogate keys in an idempotent pipeline?**

A) Use auto-increment database sequences
B) Use `uuid4()` for globally unique identifiers
C) Derive them deterministically from business keys using a hash function
D) Use the current timestamp combined with a random number

::: details Answer
**C)** Deterministic hashing (e.g., `SHA-256("source:order_id")`) produces the same key for the same input on every run. Auto-increment, UUID, and random-based keys generate different values on re-runs.
:::
:::

---

> **One-Liner Summary:** If running your pipeline twice produces different output, it is broken -- use partition overwrites, natural-key MERGE, and deterministic transforms to make re-runs safe.

---

*Next: [Error Handling →](error-handling.md)*
