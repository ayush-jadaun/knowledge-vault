---
title: "ETL vs ELT"
description: "Deep comparison of ETL and ELT paradigms — architecture differences, decision framework, cost analysis, team structure implications, and migration strategies from ETL to ELT."
tags: [etl, elt, data-engineering, data-warehouse, dbt, spark, snowflake, bigquery]
difficulty: intermediate
prerequisites: [data-engineering/etl-patterns]
lastReviewed: "2026-03-17"
---

# ETL vs ELT

The debate between ETL (Extract-Transform-Load) and ELT (Extract-Load-Transform) is not about which is universally better. It is about understanding where each pattern excels and making an intentional choice based on your constraints — data volume, team skills, compliance requirements, budget, and latency needs.

## Architecture Comparison

### Traditional ETL Architecture

In ETL, a dedicated processing engine (Spark, Informatica, custom Python) transforms data before it reaches the warehouse.

```
┌─────────┐     ┌──────────────────────┐     ┌─────────────┐
│ Sources  │────▶│  ETL Engine          │────▶│  Warehouse  │
│          │     │  (Spark / Python)    │     │  (Clean)    │
│ DB       │     │                      │     │             │
│ API      │     │  ┌────────────────┐  │     │  Fact tbls  │
│ Files    │     │  │ Extract        │  │     │  Dim tbls   │
│ Streams  │     │  │ Validate       │  │     │             │
│          │     │  │ Clean          │  │     └─────────────┘
│          │     │  │ Conform        │  │
│          │     │  │ Deduplicate    │  │
│          │     │  │ Aggregate      │  │
│          │     │  │ Load           │  │
│          │     │  └────────────────┘  │
└─────────┘     └──────────────────────┘
```

**The ETL engine owns the compute.** It reads from sources, holds data in memory or on disk, applies transformations, and writes the result to the warehouse. The warehouse receives clean, conforming data.

### Modern ELT Architecture

In ELT, raw data is loaded into the warehouse first. Transformations happen inside the warehouse using SQL (often managed by dbt).

```
┌─────────┐     ┌──────────┐     ┌──────────────────────────────┐
│ Sources  │────▶│ Ingestion│────▶│  Cloud Data Warehouse        │
│          │     │ (Fivetran│     │                              │
│ DB       │     │  Airbyte │     │  ┌────────┐    ┌──────────┐ │
│ API      │     │  Custom) │     │  │  Raw   │───▶│ Staging  │ │
│ Files    │     │          │     │  │  Layer │    │  (dbt)   │ │
│ Streams  │     └──────────┘     │  └────────┘    └────┬─────┘ │
│          │                      │                     │       │
└─────────┘                      │               ┌─────▼─────┐ │
                                 │               │  Marts    │ │
                                 │               │  (dbt)    │ │
                                 │               └───────────┘ │
                                 └──────────────────────────────┘
```

**The warehouse owns the compute.** The ingestion layer does minimal transformation (just enough to get data into tables). All business logic, cleaning, and modeling happens in SQL inside the warehouse.

## Decision Framework

### Data Volume and Growth

```
Volume < 10 GB/day:
  → Either works. Choose based on team skills.

Volume 10 GB - 1 TB/day:
  → ELT with cloud warehouse is cost-effective.
  → ETL with Spark is also viable if cluster exists.

Volume > 1 TB/day:
  → Cost analysis required. Warehouse compute at scale is expensive.
  → ETL with dedicated Spark/Flink cluster may be cheaper.
  → Consider hybrid: ETL for heavy transforms, ELT for light ones.
```

### Team Structure and Skills

| Team Profile | Recommended | Why |
|-------------|-------------|-----|
| SQL-heavy analytics team | ELT + dbt | Analysts can own transforms, faster iteration |
| Python/Java engineering team | ETL + Spark | Leverage existing skills, complex logic is easier |
| Mixed team | Hybrid | ETL for ingestion, ELT (dbt) for modeling |
| Small startup (2-3 people) | ELT + managed ingestion | Minimize infrastructure management |

### Compliance and Security

This is often the deciding factor:

```python
# Scenario: Healthcare data with PHI

# ETL approach — strip PHI before warehouse
def etl_transform_patient_record(record: dict) -> dict:
    """PHI never enters the warehouse."""
    return {
        'patient_id_hash': sha256(record['ssn']).hexdigest(),
        'age_bucket': age_to_bucket(record['date_of_birth']),
        'diagnosis_code': record['icd10_code'],
        'encounter_date': record['visit_date'],
        # SSN, name, DOB, address — all stripped
    }

# ELT approach — PHI lands in warehouse, must be governed
# Requires:
# - Column-level encryption
# - Row-level security policies
# - Masking policies for different roles
# - Audit logging of all PHI access
# - Data retention and purge policies
```

**If your compliance team is uncomfortable with raw PHI/PII in the warehouse, ETL is the safer choice.** You can still do ELT for non-sensitive data.

### Latency Requirements

| Requirement | ETL | ELT |
|------------|-----|-----|
| Batch (hourly/daily) | Both work | Both work |
| Near real-time (minutes) | Streaming ETL (Flink) | Micro-batch ELT (Snowpipe, BigQuery streaming) |
| Real-time (seconds) | Streaming ETL required | Not suitable — warehouse latency too high |

### Cost Analysis

A detailed cost comparison for processing 500 GB/day:

```
ETL with Self-Managed Spark on AWS:
  EC2 instances (m5.2xlarge × 4):   $1,840/month
  EBS storage (1 TB):                  $100/month
  S3 staging:                           $50/month
  Management overhead:              8 hrs/week engineering time
  Total:                          ~$1,990/month + eng time

ELT with Snowflake:
  Ingestion (Fivetran):              $1,500/month (MAR-based)
  Snowflake compute (Medium WH):     $2,800/month (8 hrs/day)
  Snowflake storage (compressed):      $230/month
  dbt Cloud:                           $100/month
  Management overhead:              2 hrs/week engineering time
  Total:                          ~$4,630/month + less eng time

ELT with BigQuery:
  Ingestion (Fivetran):              $1,500/month
  BigQuery on-demand queries:        $1,250/month (250 TB scanned)
  BigQuery storage:                    $100/month
  dbt Cloud:                           $100/month
  Total:                          ~$2,950/month + less eng time
```

The numbers vary wildly based on data volume, query patterns, and compression ratios. **Always run your own cost analysis with realistic workload estimates.**

## Common ETL Patterns in Detail

### Staging Pattern

Data passes through a staging area before reaching the final target. The staging area provides a checkpoint for validation and recovery.

```sql
-- Step 1: Load raw data into staging
CREATE TABLE staging.orders_20260317 AS
SELECT * FROM external_source.orders
WHERE order_date = '2026-03-17';

-- Step 2: Validate
SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE order_id IS NULL) as null_ids,
       COUNT(*) FILTER (WHERE amount < 0) as negative_amounts
FROM staging.orders_20260317;

-- Step 3: Transform and load (only if validation passes)
INSERT INTO warehouse.fact_orders
SELECT
    order_id,
    customer_id,
    product_id,
    amount,
    currency,
    CASE
        WHEN status = 'completed' THEN 'COMPLETED'
        WHEN status IN ('pending', 'processing') THEN 'IN_PROGRESS'
        WHEN status = 'cancelled' THEN 'CANCELLED'
        ELSE 'UNKNOWN'
    END as order_status,
    order_date,
    CURRENT_TIMESTAMP as loaded_at
FROM staging.orders_20260317
WHERE order_id IS NOT NULL
  AND amount >= 0;

-- Step 4: Clean up staging
DROP TABLE staging.orders_20260317;
```

### Medallion Architecture (Bronze-Silver-Gold)

A layered approach popularized by Databricks. Data flows through three quality tiers:

```
Bronze (Raw)          Silver (Cleaned)        Gold (Business)
─────────────         ───────────────         ──────────────
Raw JSON/CSV    →     Typed, deduped,    →    Aggregated,
As-is from            validated,              business logic
source                conformed               applied

Schema: source        Schema: canonical       Schema: star/snowflake
Quality: unknown      Quality: validated      Quality: business rules
Retention: long       Retention: medium       Retention: based on use
```

```python
# Bronze: Raw ingestion — no transformation
def bronze_ingest(source_path: str, bronze_table: str):
    """Load raw data as-is. Add metadata columns only."""
    raw_df = spark.read.json(source_path)
    raw_df = raw_df.withColumn("_ingested_at", current_timestamp())
    raw_df = raw_df.withColumn("_source_file", input_file_name())
    raw_df.write.mode("append").saveAsTable(bronze_table)

# Silver: Clean and conform
def silver_transform(bronze_table: str, silver_table: str):
    """Apply data quality rules, deduplicate, type-cast."""
    bronze_df = spark.table(bronze_table)

    silver_df = (bronze_df
        .dropDuplicates(["event_id"])
        .filter(col("event_type").isNotNull())
        .withColumn("event_timestamp", to_timestamp("event_time"))
        .withColumn("user_id", col("user_id").cast("long"))
        .withColumn("amount", col("amount").cast("decimal(18,2)"))
        .withColumn("_processed_at", current_timestamp())
    )

    silver_df.write.mode("overwrite").saveAsTable(silver_table)

# Gold: Business aggregations
def gold_aggregate(silver_table: str, gold_table: str):
    """Build business-level metrics from clean data."""
    silver_df = spark.table(silver_table)

    gold_df = (silver_df
        .groupBy("user_id", date_trunc("day", "event_timestamp").alias("event_date"))
        .agg(
            count("event_id").alias("total_events"),
            sum("amount").alias("total_amount"),
            countDistinct("session_id").alias("unique_sessions"),
            min("event_timestamp").alias("first_event"),
            max("event_timestamp").alias("last_event"),
        )
    )

    gold_df.write.mode("overwrite").saveAsTable(gold_table)
```

## Common ELT Patterns in Detail

### dbt-Based Transformation

dbt (data build tool) is the standard for ELT transformations. Models are SQL SELECT statements that dbt materializes as tables or views.

```sql
-- models/staging/stg_orders.sql
-- Bronze → Silver: Clean and type raw order data
WITH source AS (
    SELECT * FROM {{ source('raw', 'orders') }}
),

renamed AS (
    SELECT
        id::INTEGER AS order_id,
        customer_id::INTEGER AS customer_id,
        TRIM(LOWER(status)) AS order_status,
        amount::DECIMAL(18, 2) AS order_amount,
        currency::VARCHAR(3) AS currency_code,
        created_at::TIMESTAMP AS ordered_at,
        updated_at::TIMESTAMP AS updated_at
    FROM source
    WHERE id IS NOT NULL
),

deduplicated AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY order_id
            ORDER BY updated_at DESC
        ) AS row_num
    FROM renamed
)

SELECT * EXCEPT (row_num)
FROM deduplicated
WHERE row_num = 1
```

```sql
-- models/marts/fct_orders.sql
-- Silver → Gold: Business logic applied
WITH orders AS (
    SELECT * FROM {{ ref('stg_orders') }}
),

customers AS (
    SELECT * FROM {{ ref('stg_customers') }}
),

products AS (
    SELECT * FROM {{ ref('stg_order_items') }}
)

SELECT
    o.order_id,
    o.customer_id,
    c.customer_segment,
    c.acquisition_channel,
    o.order_amount,
    o.currency_code,
    {{ convert_to_usd('o.order_amount', 'o.currency_code') }} AS order_amount_usd,
    o.ordered_at,
    DATE_TRUNC('month', o.ordered_at) AS order_month,
    DATEDIFF('day', c.first_order_at, o.ordered_at) AS days_since_first_order,
    CASE
        WHEN DATEDIFF('day', c.first_order_at, o.ordered_at) = 0 THEN 'First Order'
        WHEN DATEDIFF('day', c.first_order_at, o.ordered_at) <= 30 THEN 'Repeat (30d)'
        ELSE 'Returning'
    END AS order_type,
    COUNT(p.product_id) AS item_count,
    o.order_status
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN products p ON o.order_id = p.order_id
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
```

### Schema-on-Read with Semi-Structured Data

Cloud warehouses natively handle JSON, Avro, and Parquet, enabling schema-on-read:

```sql
-- Snowflake: Query semi-structured data without predefined schema
SELECT
    raw_data:user_id::INTEGER AS user_id,
    raw_data:event_type::STRING AS event_type,
    raw_data:properties:page_url::STRING AS page_url,
    raw_data:properties:referrer::STRING AS referrer,
    raw_data:timestamp::TIMESTAMP AS event_timestamp
FROM raw.events
WHERE raw_data:event_type::STRING = 'page_view'
  AND raw_data:timestamp::TIMESTAMP > DATEADD('hour', -24, CURRENT_TIMESTAMP());
```

## Migrating from ETL to ELT

Migration is common as teams adopt cloud warehouses. Key steps:

### Phase 1: Parallel Run (Weeks 1-4)
```
Source → ETL Engine → Warehouse (existing)
     └→ Ingestion → Raw Layer → dbt → Warehouse (new schema)

Compare outputs daily. Both systems run simultaneously.
```

### Phase 2: Validation (Weeks 5-6)
```python
# Automated comparison between ETL and ELT outputs
def validate_migration(etl_table: str, elt_table: str):
    etl_count = query(f"SELECT COUNT(*) FROM {etl_table}")
    elt_count = query(f"SELECT COUNT(*) FROM {elt_table}")

    assert abs(etl_count - elt_count) / max(etl_count, 1) < 0.001, \
        f"Row count mismatch: ETL={etl_count}, ELT={elt_count}"

    # Check key metrics match
    etl_sum = query(f"SELECT SUM(amount) FROM {etl_table}")
    elt_sum = query(f"SELECT SUM(amount) FROM {elt_table}")

    assert abs(etl_sum - elt_sum) < 0.01, \
        f"Amount mismatch: ETL={etl_sum}, ELT={elt_sum}"
```

### Phase 3: Cutover (Weeks 7-8)
```
Source → Ingestion → Raw Layer → dbt → Warehouse
ETL Engine: decommissioned
```

### Phase 4: Optimization (Weeks 9-12)
- Tune warehouse sizing (auto-scaling, auto-suspend)
- Optimize dbt model materializations (table vs incremental vs view)
- Set up monitoring and alerting for the new pipeline
- Document the new architecture and train the team

## Hybrid Patterns

Most production systems use a hybrid approach:

```
Heavy transforms (Python/Spark):
  - Complex ML feature engineering
  - Binary file processing (images, PDFs)
  - Real-time stream processing
  - PII stripping / anonymization

Light transforms (dbt/SQL):
  - Joins and aggregations
  - Business metric calculations
  - Dimensional modeling
  - Data quality tests
```

```python
# Hybrid example: Spark for heavy lifting, dbt for modeling
class HybridPipeline:
    def run(self):
        # Step 1: Spark — heavy extraction and initial cleaning
        raw_df = self.spark_extract_from_api(api_url, batch_size=10_000)
        clean_df = self.spark_strip_pii(raw_df)
        clean_df.write.parquet("s3://data-lake/cleaned/events/")

        # Step 2: Load into warehouse (Snowflake COPY INTO)
        self.snowflake_load("s3://data-lake/cleaned/events/", "raw.events")

        # Step 3: dbt — SQL transformations inside warehouse
        self.dbt_run(models=["staging.stg_events", "marts.fct_events"])
```

## Key Takeaways

1. **ETL and ELT are tools, not religions.** Use what fits your constraints.
2. **ELT dominates when your warehouse is elastic and your team knows SQL.** The trend is toward ELT for good reasons.
3. **ETL remains essential for compliance-heavy environments** and workloads that require Python/Java logic.
4. **Hybrid is the pragmatic choice** for most mature organizations.
5. **Migration from ETL to ELT should be incremental** with parallel runs and automated validation.
6. **Cost analysis must use realistic workload estimates,** not vendor marketing numbers.

---

*Next: [Batch Processing →](batch-processing.md)*
