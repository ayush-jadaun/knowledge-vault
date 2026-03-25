---
title: "Prefect for Data Pipelines"
description: "Modern data orchestration with Prefect — flows, tasks, retries, caching, parameters, deployments, work pools, Prefect Cloud integration, and comparison with Airflow for Python-native pipeline orchestration."
tags: [prefect, orchestration, data-pipeline, workflow, python]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Prefect for Data Pipelines

Prefect is a modern Python-native workflow orchestration framework. Where Airflow was designed around DAGs defined in config-like Python files, Prefect treats flows as normal Python functions. Any Python function can become a task or flow with a decorator — no boilerplate, no operator classes, no XCom. If you know Python, you already know 90% of Prefect.

---

## Prefect vs Airflow

| Feature | Airflow | Prefect |
|---------|---------|---------|
| Task definition | Operators (classes) | Decorated functions |
| Data passing | XCom (limited size) | Return values (native Python) |
| Local testing | Requires Airflow setup | `python my_flow.py` |
| Dynamic tasks | Complex (expand/map) | Natural Python loops |
| Error handling | Callback functions | try/except + retries |
| Scheduling | Built-in scheduler | Prefect server / Cloud |
| Setup complexity | High (DB, webserver, scheduler) | `pip install prefect` |
| Production maturity | Very mature (10+ years) | Mature (5+ years) |
| Best for | Large teams, complex DAGs | Small-medium teams, rapid dev |

---

## Flows and Tasks

```python
# basic_flow.py — Prefect fundamentals
from prefect import flow, task, get_run_logger
from prefect.tasks import task_input_hash
from datetime import timedelta
import pandas as pd
import requests
import json
from pathlib import Path


@task(
    retries=3,
    retry_delay_seconds=30,
    log_prints=True,
)
def extract_data(api_url: str, page_size: int = 100) -> list[dict]:
    """Extract data from an API with automatic retries."""
    logger = get_run_logger()
    all_records = []
    page = 1

    while True:
        response = requests.get(
            api_url,
            params={"page": page, "per_page": page_size},
            timeout=30,
        )
        response.raise_for_status()
        records = response.json().get("data", [])

        if not records:
            break

        all_records.extend(records)
        page += 1
        logger.info(f"Page {page - 1}: {len(records)} records")

    logger.info(f"Total extracted: {len(all_records)} records")
    return all_records


@task(
    cache_key_fn=task_input_hash,
    cache_expiration=timedelta(hours=1),
)
def transform_data(raw_records: list[dict]) -> pd.DataFrame:
    """Transform raw data — cached for 1 hour on same input."""
    logger = get_run_logger()

    df = pd.DataFrame(raw_records)

    # Clean
    df["name"] = df["name"].str.strip().str.title()
    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")

    # Filter
    df = df.dropna(subset=["name", "price"])
    df = df[df["price"] > 0]
    df = df.drop_duplicates(subset=["id"])

    logger.info(f"Transformed: {len(df)} clean records")
    return df


@task
def validate_data(df: pd.DataFrame) -> pd.DataFrame:
    """Validate data quality."""
    logger = get_run_logger()

    assert len(df) > 0, "No records after transformation"
    assert df["price"].min() >= 0, "Negative prices found"
    assert df["id"].is_unique, "Duplicate IDs found"

    null_pct = df.isnull().mean()
    high_null = null_pct[null_pct > 0.1]
    if len(high_null) > 0:
        logger.warning(f"High null columns: {high_null.to_dict()}")

    logger.info("Validation passed")
    return df


@task
def load_data(df: pd.DataFrame, output_path: str):
    """Load data to storage."""
    logger = get_run_logger()
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)
    logger.info(f"Saved {len(df)} records to {output_path}")


@flow(name="ETL Products Pipeline")
def etl_products(
    api_url: str = "https://api.example.com/v1/products",
    output_path: str = "./output/products.parquet",
):
    """End-to-end ETL pipeline."""
    raw_data = extract_data(api_url)
    clean_data = transform_data(raw_data)
    validated_data = validate_data(clean_data)
    load_data(validated_data, output_path)


# Run locally — just execute the Python file
if __name__ == "__main__":
    etl_products()
```

---

## Advanced Task Features

### Retries and Error Handling

```python
# retries.py — Advanced retry configuration
from prefect import flow, task, get_run_logger
from prefect.tasks import exponential_backoff
import httpx


@task(
    retries=5,
    retry_delay_seconds=exponential_backoff(backoff_factor=10),
    retry_jitter_factor=0.5,
)
def fetch_with_backoff(url: str) -> dict:
    """Fetch URL with exponential backoff on failure."""
    response = httpx.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


@task(retries=3, retry_delay_seconds=10)
def risky_transform(data: list[dict]) -> list[dict]:
    """Transform with retry — specific exception handling."""
    logger = get_run_logger()

    try:
        # Primary processing
        return [process_record(r) for r in data]
    except MemoryError:
        # Do not retry on memory errors — they won't fix themselves
        raise
    except ValueError as e:
        logger.warning(f"Transform error (will retry): {e}")
        raise  # Prefect will retry


def process_record(record: dict) -> dict:
    """Process a single record."""
    record["name"] = record["name"].strip().title()
    record["price"] = float(record["price"])
    return record


@flow
def resilient_pipeline():
    """Pipeline with comprehensive error handling."""
    logger = get_run_logger()

    try:
        data = fetch_with_backoff("https://api.example.com/data")
        processed = risky_transform(data)
        logger.info(f"Processed {len(processed)} records")
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        # Could trigger alerting here
        raise
```

### Task Mapping (Dynamic Fan-Out)

```python
# mapping.py — Process items in parallel with .map()
from prefect import flow, task, get_run_logger
import pandas as pd


@task
def get_table_list() -> list[str]:
    """Get list of tables to process."""
    return ["users", "orders", "products", "events", "sessions"]


@task
def extract_table(table_name: str) -> dict:
    """Extract a single table."""
    logger = get_run_logger()

    # Simulate extraction
    import time
    time.sleep(1)
    row_count = len(table_name) * 1000  # Fake

    logger.info(f"Extracted {table_name}: {row_count} rows")
    return {"table": table_name, "rows": row_count}


@task
def summarize(results: list[dict]):
    """Combine all results."""
    logger = get_run_logger()
    total = sum(r["rows"] for r in results)
    logger.info(f"Total rows extracted: {total}")
    for r in results:
        logger.info(f"  {r['table']}: {r['rows']}")


@flow
def parallel_extraction():
    """Extract multiple tables in parallel using .map()."""
    tables = get_table_list()

    # .map() runs extract_table for each table concurrently
    results = extract_table.map(tables)

    summarize(results)


if __name__ == "__main__":
    parallel_extraction()
```

### Caching

```python
# caching.py — Cache expensive computations
from prefect import flow, task
from prefect.tasks import task_input_hash
from datetime import timedelta
import pandas as pd
import hashlib


@task(
    cache_key_fn=task_input_hash,
    cache_expiration=timedelta(hours=24),
)
def expensive_computation(data_path: str) -> pd.DataFrame:
    """
    This task is cached based on its input parameters.
    If called again with the same data_path within 24 hours,
    the cached result is returned immediately.
    """
    df = pd.read_parquet(data_path)
    # Expensive processing...
    result = df.groupby("category").agg({
        "price": ["mean", "std", "count"],
        "rating": ["mean", "median"],
    }).reset_index()
    return result


# Custom cache key function
def custom_cache_key(context, parameters):
    """Cache based on file content hash, not just path."""
    data_path = parameters["data_path"]
    with open(data_path, "rb") as f:
        content_hash = hashlib.md5(f.read()).hexdigest()
    return f"{context.task.task_key}-{content_hash}"


@task(
    cache_key_fn=custom_cache_key,
    cache_expiration=timedelta(days=7),
)
def content_aware_task(data_path: str) -> pd.DataFrame:
    """Cache invalidates when file content changes, not just path."""
    return pd.read_parquet(data_path)
```

---

## Deployments

```python
# deploy.py — Deploy flows for scheduled execution
from prefect import flow
from prefect.deployments import Deployment
from prefect.server.schemas.schedules import CronSchedule
from datetime import timedelta


@flow
def daily_etl(source: str = "production"):
    """Daily ETL flow that can be deployed."""
    from prefect import get_run_logger
    logger = get_run_logger()
    logger.info(f"Running ETL for source: {source}")
    # ... pipeline logic ...


# Create deployment programmatically
def create_deployment():
    deployment = Deployment.build_from_flow(
        flow=daily_etl,
        name="daily-etl-production",
        version="1.0",
        schedule=CronSchedule(cron="0 6 * * *", timezone="UTC"),
        parameters={"source": "production"},
        tags=["etl", "daily", "production"],
        description="Daily ETL pipeline for production data",
        work_pool_name="default-agent-pool",
    )
    deployment.apply()
    print(f"Deployment created: {deployment.name}")


# Or use prefect.yaml (preferred for version control)
PREFECT_YAML = """
deployments:
  - name: daily-etl-production
    entrypoint: flows/etl.py:daily_etl
    schedule:
      cron: "0 6 * * *"
      timezone: UTC
    parameters:
      source: production
    work_pool:
      name: default-pool
    tags:
      - etl
      - production
"""
```

---

## Subflows and Composition

```python
# composition.py — Compose complex pipelines from smaller flows
from prefect import flow, task, get_run_logger
import pandas as pd
from pathlib import Path


@flow(name="Data Collection")
def collect_data(sources: list[str]) -> list[str]:
    """Sub-flow: collect data from multiple sources."""
    logger = get_run_logger()
    collected_files = []

    for source in sources:
        path = f"/data/raw/{source}.parquet"
        # ... collection logic ...
        collected_files.append(path)
        logger.info(f"Collected: {source}")

    return collected_files


@flow(name="Data Preprocessing")
def preprocess_data(file_paths: list[str]) -> str:
    """Sub-flow: clean and transform data."""
    logger = get_run_logger()

    dfs = [pd.read_parquet(p) for p in file_paths if Path(p).exists()]
    combined = pd.concat(dfs, ignore_index=True)

    # Clean
    combined = combined.drop_duplicates()
    combined = combined.dropna(subset=["id"])

    output_path = "/data/clean/combined.parquet"
    combined.to_parquet(output_path, index=False)
    logger.info(f"Preprocessed: {len(combined)} rows")
    return output_path


@flow(name="Data Validation")
def validate(clean_path: str) -> bool:
    """Sub-flow: validate data quality."""
    df = pd.read_parquet(clean_path)

    checks = [
        len(df) > 0,
        df["id"].is_unique,
        df.isnull().mean().max() < 0.2,
    ]

    return all(checks)


@flow(name="Main Pipeline")
def main_pipeline(
    sources: list[str] = ["api", "database", "files"],
):
    """
    Main pipeline composed of sub-flows.
    Each sub-flow appears as a nested flow run in the UI.
    """
    logger = get_run_logger()

    # Sub-flows are called like regular functions
    raw_files = collect_data(sources)
    clean_path = preprocess_data(raw_files)
    is_valid = validate(clean_path)

    if is_valid:
        logger.info("Pipeline complete — data is valid")
    else:
        logger.error("Pipeline complete — VALIDATION FAILED")
        raise ValueError("Data validation failed")


if __name__ == "__main__":
    main_pipeline()
```

---

## Notifications and Hooks

```python
# notifications.py — Alert on flow completion/failure
from prefect import flow, task, get_run_logger
from prefect.blocks.notifications import SlackWebhook
import httpx


def send_slack_notification(message: str, webhook_url: str):
    """Send a notification to Slack."""
    httpx.post(webhook_url, json={"text": message}, timeout=10)


@flow(
    name="monitored-pipeline",
    on_failure=[lambda flow, flow_run, state: send_slack_notification(
        f"Pipeline FAILED: {flow.name}\nState: {state.name}",
        "https://hooks.slack.com/services/XXX/YYY/ZZZ",
    )],
    on_completion=[lambda flow, flow_run, state: send_slack_notification(
        f"Pipeline completed: {flow.name}\nState: {state.name}",
        "https://hooks.slack.com/services/XXX/YYY/ZZZ",
    )],
)
def monitored_pipeline():
    """Pipeline with automatic notifications."""
    logger = get_run_logger()
    logger.info("Processing...")

    # ... pipeline logic ...

    logger.info("Done!")


if __name__ == "__main__":
    monitored_pipeline()
```

---

## Prefect Cloud Integration

```python
# cloud_integration.py — Use Prefect Cloud features
from prefect import flow, task, get_run_logger
from prefect.blocks.system import Secret
from prefect.artifacts import create_markdown_artifact
import pandas as pd


@task
def extract_with_secret() -> list[dict]:
    """Use Prefect Secret block for credentials."""
    api_key = Secret.load("external-api-key")

    import requests
    response = requests.get(
        "https://api.example.com/data",
        headers={"Authorization": f"Bearer {api_key.get()}"},
    )
    return response.json()


@task
def create_report(df: pd.DataFrame):
    """Create a Markdown artifact visible in Prefect Cloud UI."""
    report = f"""
## Pipeline Report

- **Total Records**: {len(df):,}
- **Columns**: {', '.join(df.columns)}
- **Date Range**: {df['date'].min()} to {df['date'].max()}
- **Null Summary**:

| Column | Null % |
|--------|--------|
"""
    for col in df.columns:
        null_pct = df[col].isnull().mean() * 100
        report += f"| {col} | {null_pct:.1f}% |\n"

    create_markdown_artifact(
        key="pipeline-report",
        markdown=report,
        description="Daily pipeline summary",
    )


@flow
def cloud_pipeline():
    data = extract_with_secret()
    df = pd.DataFrame(data)
    create_report(df)


if __name__ == "__main__":
    cloud_pipeline()
```

---

## Quick Reference

| Concept | Code | Description |
|---------|------|-------------|
| Task | `@task` | Unit of work, retryable, cacheable |
| Flow | `@flow` | Container for tasks, entry point |
| Retry | `@task(retries=3)` | Auto-retry on failure |
| Cache | `@task(cache_key_fn=task_input_hash)` | Skip if same input |
| Map | `task.map(items)` | Fan-out parallel execution |
| Subflow | Call `@flow` inside `@flow` | Nested flow composition |
| Deployment | `prefect deploy` | Schedule and trigger flows |
| Block | `Secret.load("name")` | Stored config/credentials |
| Artifact | `create_markdown_artifact()` | Rich output in UI |

| Command | Description |
|---------|-------------|
| `prefect server start` | Start local Prefect server |
| `prefect deploy` | Deploy flows from prefect.yaml |
| `prefect flow-run create` | Trigger a flow run |
| `prefect work-pool create` | Create a work pool |
| `prefect worker start` | Start a worker for a pool |
