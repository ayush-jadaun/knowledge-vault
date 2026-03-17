---
title: "ETL Patterns"
description: "Comprehensive guide to Extract-Transform-Load patterns — batch vs streaming, ELT inversion, incremental loads, idempotency, error handling, and production pipeline design for modern data infrastructure."
tags: [etl, elt, data-engineering, batch-processing, pipelines, data-integration]
difficulty: intermediate
prerequisites: [data-engineering]
lastReviewed: "2026-03-17"
---

# ETL Patterns

Extract-Transform-Load (ETL) is the foundational pattern of data engineering. Every data warehouse, every analytics dashboard, every ML training pipeline relies on some variant of ETL. Understanding the core patterns — and their trade-offs — is what separates a script that runs once from a pipeline that runs reliably for years.

## Why ETL Patterns Matter

Data does not magically appear in your warehouse clean, consistent, and ready for analysis. It arrives in dozens of formats from dozens of sources, each with its own quirks, latency characteristics, and failure modes. ETL patterns give you a framework for reasoning about how to move data reliably from where it is to where it needs to be.

The wrong ETL pattern leads to:
- **Data loss** — records silently dropped during transformation
- **Duplicates** — the same record loaded multiple times
- **Staleness** — dashboards showing yesterday's data when stakeholders need today's
- **Brittleness** — one schema change upstream breaks everything downstream
- **Cost explosion** — reprocessing entire datasets when only a fraction changed

## ETL vs ELT: The Fundamental Decision

The classic ETL pattern transforms data before loading it into the target system. The modern ELT pattern loads raw data first, then transforms it inside the target (usually a cloud data warehouse).

```
Classic ETL:
  Source → [Extract] → Staging → [Transform] → [Load] → Warehouse

Modern ELT:
  Source → [Extract] → [Load] → Raw Layer → [Transform] → Warehouse
```

This is not a religious debate. The right choice depends on:

| Factor | Favors ETL | Favors ELT |
|--------|-----------|-----------|
| **Compute cost** | Cheap compute available (Spark cluster) | Warehouse compute is elastic (BigQuery, Snowflake) |
| **Data volume** | Moderate — fits in memory | Massive — leverage warehouse parallelism |
| **Schema stability** | Schemas change frequently (transform early to normalize) | Schemas are stable, warehouse handles evolution |
| **Compliance** | PII must be stripped before landing | PII can be masked in warehouse with row-level security |
| **Team skills** | Strong Python/Spark engineers | Strong SQL analysts |
| **Latency** | Batch is acceptable | Need fast iteration on transforms |
| **Data exploration** | Not needed — requirements are clear | Analysts need to explore raw data |

### When to Use ETL

ETL shines when you need to:
1. **Strip sensitive data early** — PII, PHI, or classified data that must not reach the warehouse
2. **Reshape complex nested structures** — JSON blobs from APIs that need flattening
3. **Aggregate before loading** — reduce data volume when the warehouse is expensive
4. **Apply complex business logic** — transformations that are easier in Python than SQL
5. **Integrate non-SQL sources** — binary formats, proprietary protocols, legacy systems

### When to Use ELT

ELT wins when:
1. **Warehouse compute is cheap and elastic** — BigQuery, Snowflake, Databricks
2. **Analysts need access to raw data** — for ad hoc exploration before formalizing transforms
3. **Transforms change frequently** — SQL transforms in dbt are easier to iterate on than Spark jobs
4. **Schema-on-read is valuable** — you don't know all the questions upfront
5. **Data lineage is critical** — raw data preserved for auditability

## Core ETL Components

### Extract

Extraction is about getting data out of source systems without disrupting them. Key concerns:

```python
# Example: Incremental extraction with cursor-based pagination
class IncrementalExtractor:
    """
    Extracts records modified since the last successful run.
    Stores a high-water mark to avoid re-reading old data.
    """

    def __init__(self, source_connection, state_store):
        self.source = source_connection
        self.state = state_store

    def extract(self, table_name: str) -> Iterator[dict]:
        # Get the last successful high-water mark
        hwm = self.state.get_high_water_mark(table_name)

        # Query only records modified after the HWM
        query = f"""
            SELECT * FROM {table_name}
            WHERE updated_at > %(hwm)s
            ORDER BY updated_at ASC
        """

        cursor = self.source.cursor(name='incremental_extract')
        cursor.itersize = 10_000  # Fetch in chunks to limit memory
        cursor.execute(query, {'hwm': hwm})

        max_seen = hwm
        for row in cursor:
            max_seen = max(max_seen, row['updated_at'])
            yield dict(row)

        # Update HWM only after successful processing
        self.state.set_high_water_mark(table_name, max_seen)
```

**Extraction patterns:**
- **Full extraction** — read everything every time (simple but expensive)
- **Incremental extraction** — read only what changed since last run
- **Log-based extraction** — read from WAL/binlog (CDC)
- **API pagination** — cursor-based or offset-based page through API results
- **File-based extraction** — new files land in a directory or S3 bucket

### Transform

Transformation converts raw data into the shape needed by consumers. Key principles:

1. **Idempotency** — running the same transform twice produces the same result
2. **Determinism** — same inputs always produce same outputs (avoid `random()`, `now()`)
3. **Testability** — transforms should be pure functions that can be unit tested
4. **Composability** — small transforms chained together, not one monolithic function

```python
# Good: Pure, testable, composable transforms
def normalize_email(record: dict) -> dict:
    """Lowercase and strip whitespace from email."""
    return {**record, 'email': record['email'].strip().lower()}

def validate_required_fields(record: dict, fields: list[str]) -> dict:
    """Raise if any required field is missing or empty."""
    missing = [f for f in fields if not record.get(f)]
    if missing:
        raise ValidationError(f"Missing fields: {missing}", record=record)
    return record

def enrich_with_geo(record: dict, geo_lookup: dict) -> dict:
    """Add country and region from IP address."""
    geo = geo_lookup.get(record.get('ip_address'), {})
    return {**record, 'country': geo.get('country'), 'region': geo.get('region')}

# Compose into a pipeline
def transform_user_event(record: dict, geo_lookup: dict) -> dict:
    record = normalize_email(record)
    record = validate_required_fields(record, ['user_id', 'email', 'event_type'])
    record = enrich_with_geo(record, geo_lookup)
    return record
```

### Load

Loading writes transformed data into the target system. The critical concern is **atomicity** — either all records from a batch are loaded or none are.

```python
# Example: Atomic load with staging table pattern
class AtomicLoader:
    """
    Loads data atomically using a staging table.
    If anything fails, the target table is unchanged.
    """

    def load(self, records: list[dict], target_table: str):
        staging_table = f"{target_table}_staging_{uuid4().hex[:8]}"

        try:
            # 1. Create staging table with same schema
            self.db.execute(f"""
                CREATE TABLE {staging_table} (LIKE {target_table} INCLUDING ALL)
            """)

            # 2. Bulk insert into staging
            self.db.copy_from(records, staging_table)

            # 3. Atomic swap — single transaction
            self.db.execute(f"""
                BEGIN;
                -- Merge new data (upsert)
                INSERT INTO {target_table}
                SELECT * FROM {staging_table}
                ON CONFLICT (id) DO UPDATE SET
                    -- update all columns
                    updated_at = EXCLUDED.updated_at,
                    data = EXCLUDED.data;
                COMMIT;
            """)
        finally:
            # 4. Clean up staging table
            self.db.execute(f"DROP TABLE IF EXISTS {staging_table}")
```

## Pipeline Composition Patterns

### Linear Pipeline

The simplest pattern: extract, transform, load — one step after another.

```
Source A → Extract → Transform → Load → Target
```

**Use when:** Single source, simple transformations, low data volume.

### Fan-In Pipeline

Multiple sources converge into a single target.

```
Source A → Extract A ─┐
Source B → Extract B ─┼→ Merge → Transform → Load → Target
Source C → Extract C ─┘
```

**Use when:** Aggregating data from multiple systems (e.g., combining CRM, billing, and product data).

### Fan-Out Pipeline

One source feeds multiple targets.

```
                    ┌→ Transform A → Load → Warehouse
Source → Extract ───┼→ Transform B → Load → Search Index
                    └→ Transform C → Load → Cache
```

**Use when:** The same source data serves different consumers with different shape requirements.

### Diamond Pipeline

Fan-out followed by fan-in — common in complex data workflows.

```
                    ┌→ Enrich (Geo) ────┐
Source → Extract ───┤                   ├→ Join → Load → Target
                    └→ Enrich (Company) ┘
```

**Use when:** Independent enrichments that must be merged before loading.

## Error Handling Strategies

Every ETL pipeline will fail. The question is how it fails:

| Strategy | Description | Best For |
|----------|-------------|----------|
| **Fail Fast** | Stop the pipeline on first error | Critical data — financials, compliance |
| **Dead Letter Queue** | Route bad records aside, continue processing good ones | High-volume feeds where some bad records are acceptable |
| **Retry with Backoff** | Retry transient failures (network, rate limits) | API extractions, cloud service calls |
| **Circuit Breaker** | Stop calling a failing service after N failures | Protecting source systems from retry storms |
| **Compensating Transaction** | Undo partial work when a later step fails | Multi-target loads where partial state is dangerous |

## Monitoring and Observability

A pipeline without monitoring is a pipeline waiting to fail silently. Every ETL pipeline should emit:

### Volume Metrics
- Records extracted per run
- Records transformed (passed validation)
- Records rejected (failed validation)
- Records loaded
- **Volume anomaly detection** — alert if today's volume is 50% less than the 7-day average

### Latency Metrics
- End-to-end pipeline duration
- Per-stage duration (extract, transform, load)
- Data freshness (time between source event and availability in warehouse)

### Quality Metrics
- Null rate per column
- Uniqueness violations
- Referential integrity failures
- Schema drift detection

```python
# Example: Pipeline metrics emission
class PipelineMetrics:
    def __init__(self, pipeline_name: str, metrics_client):
        self.pipeline = pipeline_name
        self.metrics = metrics_client

    def record_run(self, stage: str, records: int, duration_ms: float, errors: int = 0):
        tags = {'pipeline': self.pipeline, 'stage': stage}
        self.metrics.gauge('pipeline.records_processed', records, tags=tags)
        self.metrics.histogram('pipeline.duration_ms', duration_ms, tags=tags)
        self.metrics.increment('pipeline.errors', errors, tags=tags)

    def check_volume_anomaly(self, current_count: int, historical_avg: float):
        ratio = current_count / max(historical_avg, 1)
        if ratio < 0.5:
            self.alert(f"Volume drop: {current_count} vs avg {historical_avg}")
        elif ratio > 2.0:
            self.alert(f"Volume spike: {current_count} vs avg {historical_avg}")
```

## Technology Landscape

| Category | Tools | When to Use |
|----------|-------|-------------|
| **Batch ETL** | Apache Spark, dbt, Apache Beam | Large-scale data transformation |
| **Orchestration** | Airflow, Dagster, Prefect | Scheduling, dependency management |
| **Streaming** | Kafka Streams, Apache Flink, Spark Streaming | Real-time or near-real-time processing |
| **CDC** | Debezium, AWS DMS, Fivetran | Database replication |
| **Quality** | Great Expectations, dbt tests, Soda | Automated data validation |
| **Lineage** | OpenLineage, DataHub, Amundsen | Tracking data flow and impact analysis |

## Anti-Patterns to Avoid

### The Monolithic Transform
One giant function that does everything. Impossible to test, debug, or modify without breaking something.

### The Invisible Pipeline
No logging, no metrics, no alerting. You discover it is broken when the CEO asks why the dashboard is empty.

### The Dual Write
Writing to two systems without coordination. Guaranteed to produce inconsistency.

### The Unversioned Schema
Changing source schemas without communicating. Every downstream pipeline breaks simultaneously.

### The Full Reload Crutch
Reloading everything every day because incremental is "too hard." Works until data volume makes it impossible.

## Section Overview

This section covers ETL patterns in depth:

- **[ETL vs ELT](etl-vs-elt.md)** — Detailed comparison with decision framework
- **[Batch Processing](batch-processing.md)** — Designing efficient batch pipelines
- **[Incremental Loads](incremental-loads.md)** — Processing only what changed
- **[Idempotent Pipelines](idempotent-pipelines.md)** — Making pipelines safe to retry
- **[Error Handling](error-handling.md)** — Dead letter queues, circuit breakers, and recovery

## Key Takeaways

1. **Choose ELT when your warehouse is elastic and your team is SQL-first.** Choose ETL when compliance requires early transformation or when transformations are complex.
2. **Incremental extraction is almost always worth the complexity.** Full extractions do not scale.
3. **Every transform should be a pure, testable function.** No side effects, no hidden state.
4. **Atomic loads prevent partial state.** Use staging tables or transactional writes.
5. **Monitor volume, latency, and quality.** Silent failures are the most dangerous failures.
6. **Idempotency is not optional.** Every pipeline will be retried. Design for it from day one.

---

*Next: [ETL vs ELT →](etl-vs-elt.md)*
