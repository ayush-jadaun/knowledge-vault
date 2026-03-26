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
    SELECT * FROM {​{ source('raw', 'orders') }​}
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
    SELECT * FROM {​{ ref('stg_orders') }​}
),

customers AS (
    SELECT * FROM {​{ ref('stg_customers') }​}
),

products AS (
    SELECT * FROM {​{ ref('stg_order_items') }​}
)

SELECT
    o.order_id,
    o.customer_id,
    c.customer_segment,
    c.acquisition_channel,
    o.order_amount,
    o.currency_code,
    {​{ convert_to_usd('o.order_amount', 'o.currency_code') }​} AS order_amount_usd,
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

::: tip Key Takeaway
- ETL transforms data before it enters the warehouse; ELT loads raw data first and transforms inside the warehouse using SQL/dbt.
- ELT wins when your team is SQL-proficient and your warehouse is elastic; ETL wins when compliance forbids raw PII in the warehouse.
- Most mature organizations adopt a hybrid approach -- Spark/Python for heavy lifting, dbt for modeling.
:::

::: details Exercise
**Design an ELT Migration Plan**

Your company currently runs 15 ETL pipelines on a self-managed Spark cluster, loading data into PostgreSQL. The CTO wants to migrate to Snowflake with dbt. Three of the pipelines handle HIPAA-regulated patient data.

Design a migration strategy that answers:
1. Which pipelines migrate to ELT and which stay as ETL?
2. What is your parallel-run validation strategy?
3. How do you handle the HIPAA pipelines?
4. What is the rollback plan if migration fails?

::: details Solution
1. **Non-HIPAA pipelines (12)** migrate to ELT with Fivetran + dbt. **HIPAA pipelines (3)** stay as ETL with Spark stripping PHI before loading into a separate, access-controlled Snowflake schema.
2. Run both systems in parallel for 4 weeks. Automated daily comparison: row counts (within 0.1%), key metric sums (exact match), schema diff checks.
3. HIPAA pipelines use Spark to hash/tokenize identifiers, remove direct PHI fields, and load de-identified data. Column-level masking in Snowflake for remaining quasi-identifiers.
4. Keep the old Spark cluster running (read-only) for 60 days post-cutover. Fivetran connectors can be paused; Spark pipelines reactivated within hours.
:::

::: warning Common Misconceptions
- **"ELT is always cheaper than ETL."** At scale (1+ TB/day), warehouse compute costs can exceed a dedicated Spark cluster. Always run a cost analysis with your actual workload.
- **"ETL is legacy and should be replaced."** ETL is essential for PII stripping, binary file processing, and complex ML feature engineering that SQL cannot express.
- **"dbt replaces Spark."** dbt handles SQL transformations inside the warehouse. It cannot read from APIs, process images, or run Python ML code. They solve different problems.
- **"ELT means no data quality checks."** You still need validation. dbt tests, Great Expectations, and staging-layer checks are critical in ELT pipelines.
:::

::: tip In Production
- **Spotify** uses a hybrid approach: Spark-based ETL for audio feature extraction and ML pipelines, BigQuery ELT with dbt for business analytics and reporting.
- **Airbnb** migrated from a monolithic ETL pipeline to ELT with their internal Minerva metrics layer on top of their data warehouse, dramatically reducing time-to-insight.
- **GitLab** runs a fully open-source ELT stack: Meltano for extraction, dbt for transformation, Snowflake for warehousing -- all configurations version-controlled in Git.
- **Netflix** keeps ETL for their massive-scale event processing (Spark/Flink) but uses ELT patterns for business reporting on top of Redshift and internal tools.
:::

::: details Quiz
**1. What is the primary architectural difference between ETL and ELT?**

A) ETL uses SQL; ELT uses Python
B) In ETL, a dedicated engine transforms data before loading; in ELT, the warehouse itself handles transformations after loading
C) ETL is for batch; ELT is for streaming
D) ETL stores data on-premise; ELT uses the cloud

::: details Answer
**B)** In ETL, an external engine (Spark, Python) transforms data before it reaches the warehouse. In ELT, raw data is loaded first and the warehouse's compute engine handles transformations (typically via SQL/dbt).
:::

**2. When is ETL preferred over ELT for compliance reasons?**

A) When data volumes exceed 1 TB/day
B) When the team prefers Python over SQL
C) When sensitive data (PHI/PII) must be stripped before entering the warehouse
D) When using open-source tools

::: details Answer
**C)** ETL allows you to strip PHI/PII in the transform step before data ever enters the warehouse. With ELT, raw sensitive data lands in the warehouse, requiring column-level encryption, masking policies, and audit logging.
:::

**3. In the cost analysis for 500 GB/day, what makes the self-managed Spark ETL option cheaper?**

A) Spark is free software
B) EC2 compute is cheaper than warehouse compute, though it requires more engineering time for management
C) Spark does not need storage
D) Fivetran is always more expensive than custom extraction

::: details Answer
**B)** The raw compute cost for EC2 instances (~$1,990/month) is lower than Snowflake compute (~$4,630/month), but the self-managed option requires ~8 hrs/week of engineering time vs ~2 hrs/week for the managed ELT stack.
:::

**4. What does a "Medallion Architecture" refer to in ELT pipelines?**

A) A security certification for data warehouses
B) A three-layer data organization (Bronze/Silver/Gold) with increasing data quality
C) A type of database index
D) A monitoring dashboard pattern

::: details Answer
**B)** Medallion Architecture organizes data into Bronze (raw, as-is from source), Silver (cleaned, validated, conformed), and Gold (business-level aggregations with logic applied).
:::

**5. Why do most mature organizations use a hybrid ETL/ELT approach?**

A) It is required by data governance regulations
B) Different workloads have different requirements -- heavy transforms suit ETL while SQL-based modeling suits ELT
C) Cloud providers mandate both approaches
D) Hybrid is cheaper than either approach alone

::: details Answer
**B)** Heavy transforms (ML features, binary processing, PII stripping) are better handled by ETL with Spark/Python. Light transforms (joins, aggregations, business metrics) are faster to develop and iterate in ELT with dbt/SQL.
:::
:::

---

> **One-Liner Summary:** ETL cleans before loading, ELT loads before cleaning -- choose based on compliance needs, team skills, and warehouse elasticity, or use both.

---

*Next: [Batch Processing →](batch-processing.md)*
