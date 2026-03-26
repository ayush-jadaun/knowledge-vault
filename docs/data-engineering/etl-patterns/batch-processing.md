---
title: "Batch Processing"
description: "Designing efficient batch data pipelines — partitioning strategies, parallel processing, checkpoint/restart patterns, resource management, and production scheduling with Spark, Python, and SQL."
tags: [batch-processing, etl, spark, data-engineering, partitioning, scheduling]
difficulty: intermediate
prerequisites: [data-engineering/etl-patterns]
lastReviewed: "2026-03-17"
---

# Batch Processing

Batch processing is the workhorse of data engineering. Despite the industry's fascination with streaming, the vast majority of production data pipelines are batch — running hourly, daily, or weekly to move and transform data in bulk. Understanding how to design efficient, reliable batch pipelines is a foundational skill.

## What Makes Batch Different

Batch processing operates on bounded datasets. You know the start and end of your data — a day's worth of orders, an hour's worth of events, a file that landed in S3. This boundedness gives you advantages that streaming does not have:

| Property | Batch | Streaming |
|----------|-------|-----------|
| **Data completeness** | Known — you have the full dataset | Unknown — data may still be arriving |
| **Retries** | Easy — reprocess the same batch | Complex — need to track offsets |
| **Resource allocation** | Predictable — size cluster for known volume | Variable — must handle spikes |
| **Correctness** | Simpler — no late-arriving data concerns | Complex — watermarks, out-of-order events |
| **Latency** | Minutes to hours | Seconds to minutes |

## Partitioning Strategies

Partitioning is the single most important performance decision in batch processing. Good partitioning enables parallelism, efficient reads, and incremental processing.

### Time-Based Partitioning

The most common strategy. Data is organized by time period:

```
s3://data-lake/events/
  year=2026/month=03/day=17/hour=00/
  year=2026/month=03/day=17/hour=01/
  year=2026/month=03/day=17/hour=02/
  ...
```

```python
# Spark: Write with time-based partitioning
events_df = spark.read.json("s3://raw/events/20260317/")

events_df = events_df.withColumn(
    "event_date", to_date("event_timestamp")
).withColumn(
    "event_hour", hour("event_timestamp")
)

events_df.write \
    .partitionBy("event_date", "event_hour") \
    .mode("overwrite") \
    .parquet("s3://data-lake/events/")
```

**When to use:** Event data, logs, time-series metrics — anything with a natural time dimension.

### Key-Based Partitioning

Partition by a business key (customer ID, region, product category):

```python
# Partition by customer segment for parallel processing
customers_df.write \
    .partitionBy("customer_segment") \
    .mode("overwrite") \
    .parquet("s3://data-lake/customers/")
```

**When to use:** When queries frequently filter by a specific dimension and that dimension has low cardinality (10s-100s of distinct values, not millions).

### Size-Based Partitioning

Ensure each partition is roughly the same size for balanced parallelism:

```python
# Repartition to target 128MB files for optimal Spark performance
target_file_size_mb = 128
total_size_mb = estimate_dataset_size_mb(df)
num_partitions = max(1, int(total_size_mb / target_file_size_mb))

df.repartition(num_partitions).write \
    .mode("overwrite") \
    .parquet("s3://data-lake/output/")
```

### Partition Pruning

The real value of partitioning is partition pruning — reading only the partitions you need:

```sql
-- Without partitioning: Full table scan (reads 365 days of data)
SELECT COUNT(*) FROM events WHERE event_date = '2026-03-17';

-- With date partitioning: Reads only 1 partition
-- Query engine skips 364/365 of the data
SELECT COUNT(*) FROM events WHERE event_date = '2026-03-17';
```

```python
# Spark partition pruning — only reads relevant partitions
events_today = spark.read.parquet("s3://data-lake/events/") \
    .filter(col("event_date") == "2026-03-17")

# Physical plan shows: PartitionFilters: [event_date = 2026-03-17]
# Only reads files under year=2026/month=03/day=17/
```

## Parallel Processing Patterns

### Map-Reduce Pattern

The classic pattern: map (transform in parallel) then reduce (aggregate results):

```python
# Pure Python map-reduce for moderate volumes
from concurrent.futures import ProcessPoolExecutor
from functools import reduce

def process_chunk(chunk: list[dict]) -> dict:
    """Map: Process a chunk of records independently."""
    return {
        'total_amount': sum(r['amount'] for r in chunk),
        'record_count': len(chunk),
        'error_count': sum(1 for r in chunk if r.get('is_invalid')),
    }

def merge_results(a: dict, b: dict) -> dict:
    """Reduce: Combine results from two chunks."""
    return {
        'total_amount': a['total_amount'] + b['total_amount'],
        'record_count': a['record_count'] + b['record_count'],
        'error_count': a['error_count'] + b['error_count'],
    }

# Split data into chunks, process in parallel
chunks = [records[i:i+10_000] for i in range(0, len(records), 10_000)]

with ProcessPoolExecutor(max_workers=8) as executor:
    chunk_results = list(executor.map(process_chunk, chunks))

final_result = reduce(merge_results, chunk_results)
```

### Fan-Out / Fan-In Pattern

Distribute work across multiple workers, then collect results:

```python
# Airflow: Fan-out processing by date partition
from airflow.decorators import dag, task
from datetime import datetime, timedelta

@dag(schedule='@daily', start_date=datetime(2026, 1, 1))
def daily_batch_pipeline():

    @task
    def get_partitions(execution_date: str) -> list[str]:
        """Determine which partitions need processing."""
        return [f"{execution_date}/hour={h:02d}" for h in range(24)]

    @task
    def process_partition(partition: str) -> dict:
        """Process a single hour partition independently."""
        df = spark.read.parquet(f"s3://raw/events/{partition}/")
        cleaned = apply_transforms(df)
        cleaned.write.parquet(f"s3://processed/events/{partition}/")
        return {'partition': partition, 'records': cleaned.count()}

    @task
    def aggregate_results(results: list[dict]):
        """Combine all partition results into a daily summary."""
        total = sum(r['records'] for r in results)
        log.info(f"Processed {total} records across {len(results)} partitions")

    partitions = get_partitions()
    results = process_partition.expand(partition=partitions)  # Fan-out
    aggregate_results(results)  # Fan-in

daily_batch_pipeline()
```

### Sliding Window Pattern

Process data in overlapping windows to handle late-arriving records:

```python
# Process with a look-back window to catch late data
def process_with_lookback(target_date: str, lookback_days: int = 3):
    """
    Process the target date plus a lookback window.
    Late-arriving records from the past 3 days are re-processed.
    """
    dates = [
        (datetime.strptime(target_date, '%Y-%m-%d') - timedelta(days=i)).strftime('%Y-%m-%d')
        for i in range(lookback_days + 1)
    ]

    for date in dates:
        partition = f"s3://raw/events/date={date}/"
        df = spark.read.parquet(partition)

        # Idempotent write — overwrite the partition
        cleaned = apply_transforms(df)
        cleaned.write \
            .mode("overwrite") \
            .parquet(f"s3://processed/events/date={date}/")
```

## Checkpoint and Restart

Long-running batch jobs must be restartable without reprocessing everything from scratch.

### High-Water Mark Pattern

Track the last successfully processed record and resume from there:

```python
class CheckpointedPipeline:
    """
    Pipeline that saves checkpoints after each micro-batch.
    On restart, resumes from the last checkpoint.
    """

    def __init__(self, checkpoint_store):
        self.checkpoints = checkpoint_store

    def run(self, source_table: str, batch_size: int = 50_000):
        last_id = self.checkpoints.get(source_table, default=0)
        total_processed = 0

        while True:
            # Read next batch after checkpoint
            batch = self.db.query(f"""
                SELECT * FROM {source_table}
                WHERE id > {last_id}
                ORDER BY id ASC
                LIMIT {batch_size}
            """)

            if not batch:
                break  # No more records

            # Process batch
            transformed = [self.transform(record) for record in batch]
            self.load(transformed)

            # Update checkpoint
            last_id = max(r['id'] for r in batch)
            self.checkpoints.set(source_table, last_id)
            total_processed += len(batch)

            log.info(f"Checkpoint: processed up to id={last_id}, "
                     f"total={total_processed}")

        return total_processed
```

### Spark Checkpointing

Spark provides built-in checkpointing for long-running jobs:

```python
# Enable checkpointing for fault tolerance
spark.sparkContext.setCheckpointDir("s3://checkpoints/pipeline/")

# Use checkpoint after expensive operations
df = spark.read.parquet("s3://raw/massive-dataset/")
df = df.filter(complex_condition)
df = df.join(lookup_table, "key")
df.checkpoint()  # Materialize to checkpoint dir

# If the job fails after this point, it can resume from checkpoint
df = df.groupBy("category").agg(sum("amount"))
df.write.parquet("s3://output/")
```

## Resource Management

### Memory Management

```python
# Bad: Load entire dataset into memory
all_records = list(db.query("SELECT * FROM huge_table"))  # OOM!

# Good: Process in chunks with generators
def chunked_query(table: str, chunk_size: int = 10_000):
    """Stream results in chunks to limit memory usage."""
    offset = 0
    while True:
        chunk = db.query(f"""
            SELECT * FROM {table}
            ORDER BY id
            LIMIT {chunk_size} OFFSET {offset}
        """)
        if not chunk:
            break
        yield chunk
        offset += chunk_size

for chunk in chunked_query("huge_table"):
    transformed = transform_batch(chunk)
    load_batch(transformed)
    # Each chunk is garbage collected after processing
```

### Spark Resource Tuning

```python
# Spark session with tuned resources
spark = SparkSession.builder \
    .appName("daily-batch-pipeline") \
    .config("spark.executor.memory", "8g") \
    .config("spark.executor.cores", "4") \
    .config("spark.executor.instances", "10") \
    .config("spark.sql.shuffle.partitions", "200") \
    .config("spark.sql.adaptive.enabled", "true") \
    .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \
    .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer") \
    .getOrCreate()

# Key tuning rules:
# 1. executor.memory: Leave 10% headroom for overhead
# 2. executor.cores: 4-5 cores per executor (more → GC pressure)
# 3. shuffle.partitions: 2-3x the total number of cores
# 4. adaptive: Let Spark auto-tune partition sizes
```

### Backfill Patterns

When you need to reprocess historical data:

```python
# Backfill strategy: Process date ranges in parallel
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta

def backfill_date(date_str: str):
    """Reprocess a single date partition."""
    df = spark.read.parquet(f"s3://raw/events/date={date_str}/")
    transformed = apply_new_logic(df)
    transformed.write.mode("overwrite") \
        .parquet(f"s3://processed/events/date={date_str}/")

# Airflow backfill: airflow dags backfill -s 2026-01-01 -e 2026-03-17 daily_pipeline
# Processes each date independently, respecting max_active_tasks
```

## Production Scheduling

### Scheduling Best Practices

```yaml
# Airflow DAG configuration for a production batch pipeline
dag_config:
  schedule: "0 6 * * *"       # 6 AM UTC daily
  start_date: "2026-01-01"
  catchup: false               # Don't backfill on deploy
  max_active_runs: 1           # Only one run at a time
  dagrun_timeout: 7200         # 2-hour timeout
  retries: 2
  retry_delay: 300             # 5 minutes between retries
  retry_exponential_backoff: true
  tags: ["batch", "daily", "critical"]
```

### Dependency Management

```python
# DAG dependencies with proper ordering
with DAG("daily_batch", ...) as dag:
    extract_orders = PythonOperator(task_id="extract_orders", ...)
    extract_customers = PythonOperator(task_id="extract_customers", ...)
    extract_products = PythonOperator(task_id="extract_products", ...)

    validate_orders = PythonOperator(task_id="validate_orders", ...)
    validate_customers = PythonOperator(task_id="validate_customers", ...)

    transform = PythonOperator(task_id="transform", ...)
    load = PythonOperator(task_id="load", ...)
    notify = PythonOperator(task_id="notify_success", ...)

    # Extract in parallel, validate individually, then transform and load
    extract_orders >> validate_orders
    extract_customers >> validate_customers
    [validate_orders, validate_customers, extract_products] >> transform >> load >> notify
```

## Performance Optimization

### File Format Selection

| Format | Compression | Columnar | Schema | Best For |
|--------|------------|----------|--------|----------|
| **Parquet** | Excellent | Yes | Embedded | Analytics, warehousing |
| **ORC** | Excellent | Yes | Embedded | Hive ecosystem |
| **Avro** | Good | No | Embedded | Row-oriented, schema evolution |
| **CSV** | Poor | No | No | Simple interchange (avoid at scale) |
| **JSON** | Poor | No | No | Semi-structured (avoid at scale) |

### File Sizing

```python
# Target 128-256 MB files for optimal performance
# Too small: excessive metadata overhead, slow listing
# Too large: poor parallelism, long retry on failure

def compact_small_files(input_path: str, output_path: str, target_mb: int = 128):
    """Compact many small files into optimally-sized files."""
    df = spark.read.parquet(input_path)
    total_bytes = sum(f.size for f in dbutils.fs.ls(input_path))
    target_files = max(1, int(total_bytes / (target_mb * 1024 * 1024)))

    df.coalesce(target_files).write \
        .mode("overwrite") \
        .parquet(output_path)
```

### Predicate Pushdown

```python
# Push filters as close to the data source as possible

# Bad: Read everything, then filter in Python
df = spark.read.parquet("s3://data/events/")
df = df.filter(col("event_date") == "2026-03-17")
# Spark still reads all files, then filters

# Good: Use partition pruning
df = spark.read.parquet("s3://data/events/") \
    .filter(col("event_date") == "2026-03-17")
# With proper partitioning, only reads one partition

# Best: Push filters to the source
df = spark.read \
    .option("pushDownPredicate", "true") \
    .jdbc(url, "events",
          predicates=["event_date = '2026-03-17'"])
# Database only returns matching rows
```

## Monitoring Batch Pipelines

### Key Metrics to Track

```python
class BatchPipelineMonitor:
    def __init__(self, pipeline_name: str):
        self.pipeline = pipeline_name
        self.start_time = time.time()

    def record_stage(self, stage: str, records_in: int, records_out: int):
        duration = time.time() - self.start_time
        metrics.gauge(f"batch.{self.pipeline}.{stage}.records_in", records_in)
        metrics.gauge(f"batch.{self.pipeline}.{stage}.records_out", records_out)
        metrics.gauge(f"batch.{self.pipeline}.{stage}.drop_rate",
                      1 - (records_out / max(records_in, 1)))
        metrics.histogram(f"batch.{self.pipeline}.{stage}.duration_s", duration)

    def check_sla(self, sla_minutes: int):
        elapsed_minutes = (time.time() - self.start_time) / 60
        if elapsed_minutes > sla_minutes * 0.8:
            alert(f"Pipeline {self.pipeline} approaching SLA: "
                  f"{elapsed_minutes:.0f}/{sla_minutes} minutes")
```

### SLA Management

```python
# Define SLAs per pipeline
PIPELINE_SLAS = {
    'daily_orders': {'deadline': '08:00 UTC', 'max_duration_min': 120},
    'hourly_events': {'deadline': ':45 past hour', 'max_duration_min': 30},
    'weekly_reports': {'deadline': 'Monday 06:00 UTC', 'max_duration_min': 360},
}

# Airflow SLA miss callback
def sla_miss_callback(dag, task_list, blocking_task_list, slas, blocking_tis):
    """Called when a task exceeds its SLA."""
    slack.post_message(
        channel="#data-alerts",
        text=f"SLA MISS: {dag.dag_id} — tasks {task_list} "
             f"blocked by {blocking_task_list}"
    )
    pagerduty.trigger_incident(
        service="data-pipelines",
        description=f"SLA miss for {dag.dag_id}"
    )
```

## Key Takeaways

1. **Partition for pruning.** Time-based partitioning is the default choice for event data.
2. **Target 128-256 MB files.** Too small creates overhead; too large hurts parallelism.
3. **Use Parquet for analytics workloads.** The columnar format with predicate pushdown is unbeatable.
4. **Implement checkpoints for long jobs.** Jobs will fail; make them restartable.
5. **Process in chunks, not all at once.** Memory is finite; generators and cursors are your friends.
6. **Monitor SLAs actively.** Alert at 80% of the deadline, not after it passes.
7. **Adaptive query execution in Spark is free performance.** Always enable it.

---

::: tip Key Takeaway
- Partition by time for pruning, target 128-256 MB file sizes, and use columnar formats like Parquet for analytics workloads.
- Implement checkpoint/restart patterns so long-running jobs can recover without reprocessing from scratch.
- Monitor SLA compliance proactively -- alert at 80% of the deadline, not after it passes.
:::

::: details Exercise
**Design a Batch Pipeline for E-Commerce Order Processing**

You receive 50 million order events per day as JSON files landing in S3. Design a batch pipeline that:
1. Reads the raw JSON, validates records, and writes clean Parquet files partitioned by date
2. Compacts small files into optimally sized outputs
3. Handles a failure at 70% completion without reprocessing the entire day
4. Runs on a schedule with proper SLA monitoring

Draw the DAG and specify the Spark configuration you would use.

::: details Solution
**DAG:** `extract_json` >> `validate_records` >> `transform_to_parquet` >> `compact_files` >> `update_catalog` >> `notify_success`

**Partitioning:** Partition by `order_date` and `order_hour` for 24 partitions per day. Each partition processes ~2M records independently.

**Checkpoint:** Use the fan-out pattern. Process each hourly partition independently with idempotent overwrites. Track completed partitions in a state table. On restart, skip already-completed partitions.

**Spark config:**
```python
spark.executor.memory = "8g"
spark.executor.cores = 4
spark.executor.instances = 10
spark.sql.adaptive.enabled = True
spark.sql.shuffle.partitions = 120  # 3x total cores
```

**File sizing:** After transform, coalesce to target 128 MB files: `total_size / 128MB = num_output_files`.

**SLA:** Schedule at 6 AM UTC, SLA deadline 8 AM UTC. Alert at 80% (7:36 AM) if still running.
:::

::: warning Common Misconceptions
- **"More partitions always means faster processing."** Over-partitioning creates millions of tiny files, increasing metadata overhead and slowing down queries. Match partition count to query patterns, not data volume.
- **"Spark's default shuffle partitions (200) are fine."** The default of 200 is arbitrary. Set shuffle partitions to 2-3x your total executor cores for your cluster size.
- **"CSV and JSON are acceptable at scale."** They lack columnar storage, schema enforcement, and efficient compression. Switch to Parquet or ORC for any dataset over 1 GB.
- **"Batch processing is being replaced by streaming."** The vast majority of production data pipelines are still batch. Streaming adds complexity that is only justified when sub-minute latency is required.
:::

::: tip In Production
- **Uber** processes over 100 PB of batch data using Apache Spark on their internal platform, partitioning ride data by city and time for efficient query pruning.
- **Netflix** runs thousands of daily batch Spark jobs for content recommendation features, using adaptive query execution and dynamic resource allocation to optimize cluster utilization.
- **Airbnb** uses Airflow to orchestrate batch pipelines with fan-out/fan-in patterns, processing search and booking data across geographic partitions in parallel.
- **LinkedIn** processes billions of events daily in batch mode with Spark, using checkpoint/restart patterns to handle failures across their multi-hour ETL windows.
:::

::: details Quiz
**1. What is the recommended target file size for Parquet files in a batch pipeline?**

A) 1-10 MB
B) 128-256 MB
C) 1-2 GB
D) 10+ GB

::: details Answer
**B)** 128-256 MB is the sweet spot. Too small (< 10 MB) creates excessive metadata overhead and slow listing. Too large (> 1 GB) hurts parallelism and makes retries expensive.
:::

**2. What is the purpose of partition pruning?**

A) Deleting old partitions to save storage
B) Skipping irrelevant partitions so only matching data is read
C) Compressing partitions for smaller file sizes
D) Splitting large partitions into smaller ones

::: details Answer
**B)** Partition pruning allows the query engine to skip entire partitions that don't match the filter predicate. For example, filtering by `event_date = '2026-03-17'` reads only that day's partition instead of scanning all 365 days.
:::

**3. Why is the sliding window pattern useful in batch processing?**

A) It processes data faster than other patterns
B) It handles late-arriving records by reprocessing recent partitions with overlap
C) It reduces memory usage
D) It eliminates the need for checkpoints

::: details Answer
**B)** The sliding window pattern reprocesses a lookback window (e.g., last 3 days) to catch records that arrived after their batch window closed. Combined with idempotent writes, this safely handles late data.
:::

**4. What does `spark.sql.adaptive.enabled = true` do?**

A) Enables automatic schema detection
B) Lets Spark auto-tune partition sizes, join strategies, and skew handling at runtime
C) Enables automatic error recovery
D) Turns on real-time processing mode

::: details Answer
**B)** Adaptive Query Execution (AQE) lets Spark dynamically adjust shuffle partition sizes, switch join strategies based on runtime statistics, and handle data skew -- all automatically with no code changes.
:::

**5. What is the high-water mark pattern used for?**

A) Monitoring memory usage in Spark executors
B) Tracking the last successfully processed record so jobs can resume after failure
C) Setting the maximum number of parallel tasks
D) Measuring network throughput between nodes

::: details Answer
**B)** The high-water mark tracks the ID or timestamp of the last successfully processed record. On restart, the pipeline queries only records after the HWM, avoiding full reprocessing.
:::
:::

---

> **One-Liner Summary:** Batch processing wins with good partitioning, right-sized files, checkpoint/restart patterns, and the understanding that most data pipelines do not need real-time.

---

*Next: [Incremental Loads →](incremental-loads.md)*
