---
title: "Airflow for Data Pipelines"
description: "Production Airflow — DAG design patterns, TaskFlow API, dynamic task generation, XCom for inter-task communication, sensors, custom operators, testing DAGs, monitoring, and common patterns for data pipeline orchestration."
tags: [airflow, orchestration, dag, data-pipeline, python]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Airflow for Data Pipelines

Apache Airflow is the industry standard for orchestrating batch data pipelines. It manages scheduling, dependency resolution, retries, monitoring, and alerting for complex workflows. Airflow does not move or process data itself — it tells other systems when and in what order to execute tasks. This page covers DAG design, the modern TaskFlow API, and production patterns.

---

## Airflow Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Airflow Architecture                   │
│                                                           │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Scheduler │───>│   Executor   │───>│   Workers    │   │
│  │           │    │ (Celery/K8s) │    │  (run tasks) │   │
│  └──────────┘    └──────────────┘    └──────────────┘   │
│       │                                     │            │
│       │          ┌──────────────┐           │            │
│       └─────────>│  Metadata DB │<──────────┘            │
│                  │ (PostgreSQL) │                         │
│                  └──────────────┘                         │
│                         │                                 │
│                  ┌──────────────┐                         │
│                  │  Webserver   │                         │
│                  │  (UI/API)    │                         │
│                  └──────────────┘                         │
└─────────────────────────────────────────────────────────┘
```

---

## DAG Design: The Classic Approach

```python
# dags/etl_products.py — Traditional operator-based DAG
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.utils.dates import days_ago


default_args = {
    "owner": "data-team",
    "depends_on_past": False,
    "email": ["alerts@company.com"],
    "email_on_failure": True,
    "email_on_retry": False,
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=30),
    "execution_timeout": timedelta(hours=2),
    "sla": timedelta(hours=4),
}

with DAG(
    dag_id="etl_products",
    default_args=default_args,
    description="Extract products from API, transform, load to warehouse",
    schedule_interval="0 6 * * *",  # 6 AM daily
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["etl", "products", "daily"],
    max_active_runs=1,
) as dag:

    def extract_from_api(**context):
        """Extract products from the external API."""
        import requests
        import json
        from pathlib import Path

        execution_date = context["ds"]
        output_dir = Path(f"/data/raw/products/{execution_date}")
        output_dir.mkdir(parents=True, exist_ok=True)

        all_products = []
        page = 1
        while True:
            response = requests.get(
                "https://api.example.com/v1/products",
                params={"page": page, "per_page": 100},
                headers={"Authorization": f"Bearer {context['var']['value'].api_token}"},
                timeout=30,
            )
            response.raise_for_status()
            products = response.json()["data"]
            if not products:
                break
            all_products.extend(products)
            page += 1

        output_path = output_dir / "products.json"
        with open(output_path, "w") as f:
            json.dump(all_products, f)

        # Push path to XCom for downstream tasks
        context["ti"].xcom_push(key="raw_path", value=str(output_path))
        return len(all_products)

    def transform_products(**context):
        """Clean and transform raw product data."""
        import pandas as pd
        import json
        from pathlib import Path

        raw_path = context["ti"].xcom_pull(task_ids="extract", key="raw_path")
        execution_date = context["ds"]

        with open(raw_path) as f:
            products = json.load(f)

        df = pd.DataFrame(products)

        # Transformations
        df["name"] = df["name"].str.strip().str.title()
        df["price"] = pd.to_numeric(df["price"], errors="coerce")
        df["created_at"] = pd.to_datetime(df["created_at"])
        df = df.dropna(subset=["name", "price"])
        df = df.drop_duplicates(subset=["product_id"])

        output_path = f"/data/clean/products/{execution_date}/products.parquet"
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(output_path, index=False)

        context["ti"].xcom_push(key="clean_path", value=output_path)
        context["ti"].xcom_push(key="row_count", value=len(df))

    def validate_data(**context):
        """Validate transformed data meets quality expectations."""
        import pandas as pd

        clean_path = context["ti"].xcom_pull(task_ids="transform", key="clean_path")
        df = pd.read_parquet(clean_path)

        # Quality checks
        assert len(df) > 0, "No records after transformation"
        assert df["price"].min() >= 0, "Negative prices found"
        assert df["product_id"].is_unique, "Duplicate product IDs"
        assert df["name"].notna().all(), "Null product names"

        null_pct = df.isnull().mean()
        for col, pct in null_pct.items():
            if pct > 0.1:
                raise ValueError(f"Column '{col}' has {pct:.1%} nulls")

    def load_to_warehouse(**context):
        """Load clean data to the data warehouse."""
        import pandas as pd
        from sqlalchemy import create_engine

        clean_path = context["ti"].xcom_pull(task_ids="transform", key="clean_path")
        df = pd.read_parquet(clean_path)

        engine = create_engine(context["var"]["value"].warehouse_url)
        df.to_sql(
            "products_staging",
            engine,
            if_exists="replace",
            index=False,
            method="multi",
            chunksize=1000,
        )

    extract = PythonOperator(
        task_id="extract",
        python_callable=extract_from_api,
    )

    transform = PythonOperator(
        task_id="transform",
        python_callable=transform_products,
    )

    validate = PythonOperator(
        task_id="validate",
        python_callable=validate_data,
    )

    load = PythonOperator(
        task_id="load",
        python_callable=load_to_warehouse,
    )

    merge_to_prod = PostgresOperator(
        task_id="merge_to_production",
        postgres_conn_id="warehouse",
        sql="""
            INSERT INTO products (product_id, name, price, category, created_at)
            SELECT product_id, name, price, category, created_at
            FROM products_staging
            ON CONFLICT (product_id)
            DO UPDATE SET
                name = EXCLUDED.name,
                price = EXCLUDED.price,
                category = EXCLUDED.category,
                updated_at = NOW();
        """,
    )

    notify = BashOperator(
        task_id="notify",
        bash_command='echo "ETL complete: {{ ti.xcom_pull(task_ids=\'transform\', key=\'row_count\') }} products loaded"',
        trigger_rule="all_success",
    )

    # Task dependencies
    extract >> transform >> validate >> load >> merge_to_prod >> notify
```

---

## TaskFlow API (Modern Approach)

```python
# dags/etl_taskflow.py — Modern TaskFlow API (Airflow 2.x)
from datetime import datetime, timedelta
from airflow.decorators import dag, task
from airflow.models import Variable
import logging

logger = logging.getLogger(__name__)


@dag(
    dag_id="etl_products_taskflow",
    schedule="0 6 * * *",
    start_date=datetime(2024, 1, 1),
    catchup=False,
    default_args={
        "owner": "data-team",
        "retries": 3,
        "retry_delay": timedelta(minutes=5),
    },
    tags=["etl", "products", "taskflow"],
)
def etl_products_taskflow():
    """ETL pipeline using TaskFlow API — cleaner, more Pythonic."""

    @task()
    def extract(execution_date: str = "{{ ds }}") -> dict:
        """Extract products from API."""
        import requests
        import json
        from pathlib import Path

        output_dir = Path(f"/data/raw/products/{execution_date}")
        output_dir.mkdir(parents=True, exist_ok=True)

        all_products = []
        page = 1
        while True:
            response = requests.get(
                "https://api.example.com/v1/products",
                params={"page": page, "per_page": 100},
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()["data"]
            if not data:
                break
            all_products.extend(data)
            page += 1

        output_path = str(output_dir / "products.json")
        with open(output_path, "w") as f:
            json.dump(all_products, f)

        return {"path": output_path, "count": len(all_products)}

    @task()
    def transform(extract_result: dict) -> dict:
        """Transform raw products."""
        import pandas as pd
        import json

        with open(extract_result["path"]) as f:
            products = json.load(f)

        df = pd.DataFrame(products)
        df["name"] = df["name"].str.strip().str.title()
        df["price"] = pd.to_numeric(df["price"], errors="coerce")
        df = df.dropna(subset=["name", "price"])
        df = df.drop_duplicates(subset=["product_id"])

        output_path = extract_result["path"].replace("raw", "clean").replace(".json", ".parquet")
        from pathlib import Path
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(output_path, index=False)

        return {"path": output_path, "count": len(df)}

    @task()
    def validate(transform_result: dict) -> dict:
        """Validate data quality."""
        import pandas as pd

        df = pd.read_parquet(transform_result["path"])
        checks = {
            "has_rows": len(df) > 0,
            "no_negative_prices": (df["price"] >= 0).all(),
            "unique_ids": df["product_id"].is_unique,
            "no_null_names": df["name"].notna().all(),
        }

        failed = {k: v for k, v in checks.items() if not v}
        if failed:
            raise ValueError(f"Validation failed: {failed}")

        return {"path": transform_result["path"], "count": transform_result["count"], "checks": checks}

    @task()
    def load(validate_result: dict):
        """Load to warehouse."""
        import pandas as pd
        from sqlalchemy import create_engine

        df = pd.read_parquet(validate_result["path"])
        engine = create_engine(Variable.get("warehouse_url"))
        df.to_sql("products", engine, if_exists="replace", index=False)
        logger.info(f"Loaded {validate_result['count']} products")

    # Data flows naturally through return values
    raw = extract()
    clean = transform(raw)
    validated = validate(clean)
    load(validated)


# Instantiate the DAG
etl_products_taskflow()
```

---

## Dynamic Task Generation

```python
# dags/dynamic_etl.py — Generate tasks dynamically
from datetime import datetime
from airflow.decorators import dag, task
from airflow.utils.task_group import TaskGroup


TABLES_CONFIG = [
    {"name": "products", "incremental_column": "updated_at", "schema": "public"},
    {"name": "orders", "incremental_column": "created_at", "schema": "public"},
    {"name": "customers", "incremental_column": "modified_at", "schema": "public"},
    {"name": "inventory", "incremental_column": "last_checked", "schema": "warehouse"},
]


@dag(
    dag_id="dynamic_table_extraction",
    schedule="0 */4 * * *",  # Every 4 hours
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["dynamic", "extraction"],
)
def dynamic_extraction():
    """Dynamically generate extraction tasks for each table."""

    @task()
    def start():
        return "Pipeline started"

    @task()
    def extract_table(table_config: dict, ds: str = "{{ ds }}"):
        """Extract a single table incrementally."""
        import pandas as pd
        from sqlalchemy import create_engine, text
        from airflow.models import Variable

        engine = create_engine(Variable.get("source_db_url"))
        table = f"{table_config['schema']}.{table_config['name']}"
        inc_col = table_config["incremental_column"]

        query = text(f"""
            SELECT * FROM {table}
            WHERE {inc_col} >= :start_date
            ORDER BY {inc_col}
        """)

        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"start_date": ds})

        output_path = f"/data/extracted/{table_config['name']}/{ds}.parquet"
        from pathlib import Path
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(output_path, index=False)

        return {"table": table_config["name"], "rows": len(df), "path": output_path}

    @task()
    def summarize(results: list[dict]):
        """Summarize all extraction results."""
        total_rows = sum(r["rows"] for r in results)
        for r in results:
            print(f"  {r['table']}: {r['rows']} rows")
        print(f"Total: {total_rows} rows across {len(results)} tables")

    # Dynamic task generation
    start_task = start()
    extraction_results = []

    for config in TABLES_CONFIG:
        result = extract_table(config)
        start_task >> result
        extraction_results.append(result)

    summarize(extraction_results)


dynamic_extraction()
```

---

## Sensors

```python
# dags/sensor_dag.py — Wait for conditions before processing
from datetime import datetime, timedelta
from airflow.decorators import dag, task
from airflow.sensors.filesystem import FileSensor
from airflow.sensors.external_task import ExternalTaskSensor
from airflow.sensors.python import PythonSensor
from airflow.providers.http.sensors.http import HttpSensor


def check_data_freshness(**context):
    """Custom sensor: check if source data is fresh enough."""
    import pandas as pd
    from sqlalchemy import create_engine, text

    engine = create_engine("postgresql://user:pass@host/db")
    with engine.connect() as conn:
        result = conn.execute(text("SELECT MAX(updated_at) FROM source_table"))
        last_update = result.scalar()

    if last_update is None:
        return False

    freshness = datetime.utcnow() - last_update
    return freshness < timedelta(hours=2)


@dag(
    dag_id="sensor_pipeline",
    schedule="0 8 * * *",
    start_date=datetime(2024, 1, 1),
    catchup=False,
)
def sensor_pipeline():

    wait_for_file = FileSensor(
        task_id="wait_for_file",
        filepath="/data/incoming/daily_export_{{ ds }}.csv",
        poke_interval=300,  # Check every 5 minutes
        timeout=3600 * 4,   # Give up after 4 hours
        mode="reschedule",  # Free up worker slot while waiting
    )

    wait_for_api = HttpSensor(
        task_id="wait_for_api",
        http_conn_id="external_api",
        endpoint="/health",
        response_check=lambda response: response.json()["status"] == "healthy",
        poke_interval=60,
        timeout=1800,
        mode="reschedule",
    )

    wait_for_upstream = ExternalTaskSensor(
        task_id="wait_for_upstream",
        external_dag_id="etl_products_taskflow",
        external_task_id="load",
        allowed_states=["success"],
        poke_interval=120,
        timeout=7200,
        mode="reschedule",
    )

    wait_for_freshness = PythonSensor(
        task_id="wait_for_fresh_data",
        python_callable=check_data_freshness,
        poke_interval=300,
        timeout=3600,
        mode="reschedule",
    )

    @task()
    def process():
        print("All conditions met, processing data...")

    [wait_for_file, wait_for_api, wait_for_upstream, wait_for_freshness] >> process()


sensor_pipeline()
```

---

## Testing DAGs

```python
# tests/test_etl_products.py — Unit tests for Airflow DAGs
import pytest
from datetime import datetime
from airflow.models import DagBag
import pandas as pd
import json
from unittest.mock import patch, MagicMock


@pytest.fixture
def dagbag():
    """Load all DAGs from the dags folder."""
    return DagBag(dag_folder="dags/", include_examples=False)


def test_dag_loads(dagbag):
    """Verify DAG loads without import errors."""
    assert dagbag.import_errors == {}, f"DAG import errors: {dagbag.import_errors}"


def test_dag_structure(dagbag):
    """Verify DAG has expected tasks and dependencies."""
    dag = dagbag.get_dag("etl_products_taskflow")
    assert dag is not None

    task_ids = [t.task_id for t in dag.tasks]
    assert "extract" in task_ids
    assert "transform" in task_ids
    assert "validate" in task_ids
    assert "load" in task_ids


def test_dag_no_cycles(dagbag):
    """Verify DAG has no circular dependencies."""
    for dag_id, dag in dagbag.dags.items():
        # This will raise if there is a cycle
        dag.topological_sort()


def test_transform_logic():
    """Test the transform function in isolation."""
    raw_data = [
        {"product_id": 1, "name": "  Widget  ", "price": "19.99"},
        {"product_id": 2, "name": "Gadget", "price": "invalid"},
        {"product_id": 1, "name": "Widget", "price": "19.99"},  # Duplicate
    ]

    df = pd.DataFrame(raw_data)
    df["name"] = df["name"].str.strip().str.title()
    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df = df.dropna(subset=["name", "price"])
    df = df.drop_duplicates(subset=["product_id"])

    assert len(df) == 1  # Duplicate + invalid removed
    assert df.iloc[0]["name"] == "Widget"
    assert df.iloc[0]["price"] == 19.99


def test_validation_catches_issues():
    """Test that validation detects bad data."""
    bad_df = pd.DataFrame({
        "product_id": [1, 1],  # Duplicate
        "name": ["Widget", None],  # Null
        "price": [19.99, -5.00],  # Negative
    })

    # Simulated validation checks
    checks = {
        "unique_ids": bad_df["product_id"].is_unique,
        "no_null_names": bad_df["name"].notna().all(),
        "no_negative_prices": (bad_df["price"] >= 0).all(),
    }

    failed = {k: v for k, v in checks.items() if not v}
    assert len(failed) == 3  # All three should fail
```

---

## Monitoring and Alerting

```python
# dags/includes/callbacks.py — Task failure and SLA callbacks
from airflow.models import Variable
import requests
import logging

logger = logging.getLogger(__name__)


def on_task_failure(context):
    """Called when any task fails."""
    dag_id = context["dag"].dag_id
    task_id = context["task_instance"].task_id
    execution_date = context["execution_date"]
    exception = context.get("exception", "Unknown error")
    log_url = context["task_instance"].log_url

    message = (
        f"Task Failed\n"
        f"DAG: {dag_id}\n"
        f"Task: {task_id}\n"
        f"Date: {execution_date}\n"
        f"Error: {str(exception)[:500]}\n"
        f"Logs: {log_url}"
    )

    # Send to Slack
    slack_url = Variable.get("slack_webhook_url", default_var=None)
    if slack_url:
        requests.post(slack_url, json={"text": message}, timeout=10)

    logger.error(message)


def on_sla_miss(dag, task_list, blocking_task_list, slas, blocking_tis):
    """Called when a task misses its SLA."""
    message = (
        f"SLA Miss\n"
        f"DAG: {dag.dag_id}\n"
        f"Tasks: {[t.task_id for t in task_list]}\n"
        f"Blocking: {[t.task_id for t in blocking_tis]}"
    )
    logger.warning(message)


def on_dag_success(context):
    """Called when the entire DAG succeeds."""
    dag_id = context["dag"].dag_id
    execution_date = context["execution_date"]
    duration = context["dag_run"].end_date - context["dag_run"].start_date

    logger.info(
        f"DAG '{dag_id}' completed successfully. "
        f"Date: {execution_date}, Duration: {duration}"
    )
```

---

## Common DAG Patterns

### Pattern: Backfill-Safe DAG

```python
# Idempotent DAG that can safely backfill historical dates
@dag(
    dag_id="backfill_safe",
    schedule="@daily",
    start_date=datetime(2024, 1, 1),
    catchup=True,  # Enable backfill
    max_active_runs=3,  # Limit concurrent backfill runs
)
def backfill_safe():
    @task()
    def process(ds: str = "{{ ds }}", ds_nodash: str = "{{ ds_nodash }}"):
        """
        Process data for a specific date.
        MUST be idempotent — running for the same date twice
        produces the same result.
        """
        import pandas as pd
        from pathlib import Path

        output_path = Path(f"/data/output/{ds_nodash}.parquet")

        # Idempotent: overwrite if exists
        df = pd.read_parquet(f"/data/raw/{ds_nodash}.parquet")
        df_clean = df.drop_duplicates()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        df_clean.to_parquet(output_path, index=False)

    process()

backfill_safe()
```

---

## Quick Reference

| Concept | Description |
|---------|-------------|
| **DAG** | Directed Acyclic Graph — defines task dependencies |
| **Operator** | Defines what a task does (Python, Bash, SQL, etc.) |
| **Sensor** | Waits for a condition before proceeding |
| **XCom** | Cross-communication between tasks (small values only) |
| **TaskFlow** | Decorator-based API for Python tasks (Airflow 2+) |
| **Connection** | Stored credentials for external systems |
| **Variable** | Runtime configuration values |
| **Pool** | Limit concurrent tasks (e.g., max 3 DB connections) |
| **SLA** | Service Level Agreement — alert if task takes too long |
| **Trigger Rule** | When a task should run (all_success, one_success, etc.) |

| Schedule Preset | Cron Equivalent | Meaning |
|----------------|-----------------|---------|
| `@once` | — | Run once |
| `@hourly` | `0 * * * *` | Every hour |
| `@daily` | `0 0 * * *` | Midnight daily |
| `@weekly` | `0 0 * * 0` | Midnight Sunday |
| `@monthly` | `0 0 1 * *` | First of month |
| `None` | --- | Trigger only (no schedule) |

---

::: tip Key Takeaway
- Airflow orchestrates when and in what order tasks execute -- it does not move or process data itself; tasks call external systems.
- The TaskFlow API (Airflow 2+) eliminates XCom boilerplate by letting tasks pass data through Python return values.
- Every DAG must be idempotent and backfill-safe: running the same execution date twice should produce identical results.
:::

::: details Exercise
**Design a Multi-Source ETL DAG**

Create an Airflow DAG using the TaskFlow API that:
1. Extracts data from 3 tables in parallel using dynamic task generation.
2. Transforms each table's data (cleaning, type casting).
3. Validates each table's quality (null checks, row count assertions).
4. Merges all tables into a single dataset and loads to a warehouse.
5. Sends a Slack notification on success or failure.

Use `@task` decorators and natural Python data flow.

**Solution Sketch**

```python
from airflow.decorators import dag, task
from datetime import datetime

TABLES = ["orders", "products", "customers"]

@dag(dag_id="multi_source_etl", schedule="@daily",
     start_date=datetime(2024, 1, 1), catchup=False)
def multi_source_etl():

    @task()
    def extract(table: str) -> dict:
        import pandas as pd
        df = pd.read_parquet(f"/data/raw/{table}.parquet")
        path = f"/data/staged/{table}.parquet"
        df.to_parquet(path, index=False)
        return {"table": table, "path": path, "rows": len(df)}

    @task()
    def validate(result: dict) -> dict:
        import pandas as pd
        df = pd.read_parquet(result["path"])
        assert len(df) > 0, f"{result['table']} is empty"
        assert df.isnull().mean().max() < 0.2
        return result

    @task()
    def merge_and_load(results: list[dict]):
        import pandas as pd
        dfs = [pd.read_parquet(r["path"]) for r in results]
        # Merge logic here...
        total = sum(r["rows"] for r in results)
        print(f"Loaded {total} total rows from {len(results)} tables")

    validated = []
    for table in TABLES:
        raw = extract(table)
        valid = validate(raw)
        validated.append(valid)
    merge_and_load(validated)

multi_source_etl()
```
:::

::: details Debugging Scenario
**Your Airflow DAG ran successfully for months. After upgrading Airflow, the DAG starts failing with `XComArg` serialization errors on the `merge_and_load` task.**

Diagnose and fix it.

**Answer**

Airflow serializes XCom values to the metadata database. Common causes of serialization failures after upgrades:

1. **Large XCom values**: the task returns a DataFrame or large dict that exceeds the XCom size limit (default 48KB in the metadata DB). Fix: return only file paths and metadata, not data itself.
2. **Custom objects in XCom**: returning objects that are not JSON-serializable (e.g., `Path` objects, numpy arrays). Fix: convert all return values to basic Python types (str, int, dict, list).
3. **XCom backend change**: the upgrade may have switched from database XCom to a custom backend. Fix: check `airflow.cfg` for `xcom_backend` setting.
4. **Pickling disabled**: newer Airflow versions disable pickle serialization by default for security. Fix: ensure all XCom values are JSON-serializable or set `enable_xcom_pickling = True` (not recommended).

Best practice: tasks should communicate via file paths on shared storage, not via XCom data.
:::

::: warning Common Misconceptions
- **"Airflow processes data."** Airflow is an orchestrator, not a processing engine. It schedules tasks that call Spark, Python scripts, SQL, or APIs to do the actual work.
- **"XCom is for passing datasets between tasks."** XCom stores values in the metadata database (usually PostgreSQL). It is designed for small values like file paths, row counts, and status flags -- not DataFrames.
- **"catchup=True means my DAG is backfill-safe."** Enabling catchup runs the DAG for all missed dates, but the DAG must be idempotent (overwrite, not append) to produce correct results.
- **"More retries are always safer."** Retrying a non-idempotent task that partially succeeded can create duplicates. Fix the root cause rather than adding retries.
:::

::: details Quiz
**1. What is the difference between an Operator and a Sensor in Airflow?**

> An Operator executes an action (run Python code, execute SQL, call an API). A Sensor waits for a condition to be true (file exists, API is healthy, upstream DAG completed) before the pipeline continues.

**2. What does `mode="reschedule"` do for sensors?**

> Instead of occupying a worker slot while polling, the sensor releases the slot between pokes and is rescheduled by the scheduler. This prevents sensors from blocking workers during long waits.

**3. Why should Airflow DAGs be idempotent?**

> Because DAGs are re-run for failed dates, backfills, and testing. An idempotent DAG produces the same output regardless of how many times it runs for the same execution date, preventing duplicate or inconsistent data.

**4. What is the purpose of `max_active_runs=1` on a DAG?**

> It prevents multiple concurrent runs of the same DAG, which is critical for pipelines that write to shared resources (databases, files) where concurrent writes would cause conflicts or corruption.

**5. How does the TaskFlow API improve over the traditional Operator approach?**

> TaskFlow uses `@task` decorators that let you write normal Python functions and pass data via return values. It eliminates XCom boilerplate, reduces code by 40-60%, and makes the data flow explicit in the code.
:::

> **One-Liner Summary:** Airflow is an orchestrator that tells tasks when to run and in what order, not a data processor -- and every DAG must be idempotent, backfill-safe, and observable.
