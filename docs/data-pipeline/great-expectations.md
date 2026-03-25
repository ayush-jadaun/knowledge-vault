---
title: "Great Expectations Deep Dive"
description: "Production data validation with Great Expectations — expectations, suites, checkpoints, data docs, custom expectations, CI/CD integration, automated profiling, and deployment strategies for data quality assurance."
tags: [great-expectations, data-validation, testing, data-quality, python]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Great Expectations Deep Dive

Great Expectations (GX) is the most widely adopted open-source framework for data validation. It lets you define "expectations" about your data — rules like "this column should never be null" or "values in this column should be between 0 and 100" — and automatically validates every batch of data against those rules. When expectations fail, GX generates rich HTML reports showing exactly what went wrong.

---

## Core Concepts

```mermaid
flowchart LR
    A["Data Source"] --> B["Batch"]
    B --> C["Expectation Suite<br/>(collection of rules)"]
    C --> D["Checkpoint<br/>(validation run)"]
    D --> E{"Pass?"}
    E -->|"Yes"| F["Data Docs<br/>(HTML report)"]
    E -->|"No"| G["Validation Result<br/>+ Alert"]

    style A fill:#2563eb,color:#fff
    style C fill:#7c3aed,color:#fff
    style D fill:#f97316,color:#fff
```

| Concept | Description |
|---------|-------------|
| **Data Source** | Connection to your data (file, database, cloud) |
| **Data Asset** | A table, file, or query within a data source |
| **Batch** | A specific slice of data to validate |
| **Expectation** | A single validation rule |
| **Expectation Suite** | A named collection of expectations |
| **Checkpoint** | Bundles data + suite + actions (run, report, alert) |
| **Data Docs** | Auto-generated HTML documentation of validation results |

---

## Setup and Configuration

```python
# gx_setup.py — Initialize Great Expectations project
import great_expectations as gx
from great_expectations.data_context import FileDataContext
from pathlib import Path


def initialize_gx_project(project_dir: str = ".") -> FileDataContext:
    """Initialize a Great Expectations project."""
    context = gx.get_context(
        project_root_dir=project_dir,
        cloud_mode=False,
    )
    return context


def add_pandas_datasource(
    context: FileDataContext,
    name: str = "local_data",
    base_dir: str = "./data",
):
    """Add a pandas filesystem datasource."""
    datasource = context.sources.add_pandas_filesystem(
        name=name,
        base_directory=base_dir,
    )

    # Add CSV data asset
    datasource.add_csv_asset(
        name="csv_files",
        batching_regex=r"(?P<year>\d{4})/(?P<month>\d{2})/(?P<filename>.+)\.csv",
    )

    # Add Parquet data asset
    datasource.add_parquet_asset(
        name="parquet_files",
        batching_regex=r"(?P<year>\d{4})/(?P<month>\d{2})/(?P<filename>.+)\.parquet",
    )

    return datasource


def add_sql_datasource(
    context: FileDataContext,
    name: str = "warehouse",
    connection_string: str = "postgresql://user:pass@host/db",
):
    """Add a SQL datasource."""
    datasource = context.sources.add_sql(
        name=name,
        connection_string=connection_string,
    )

    # Add table assets
    datasource.add_table_asset(name="orders", table_name="orders")
    datasource.add_table_asset(name="products", table_name="products")

    # Add query asset (for complex queries)
    datasource.add_query_asset(
        name="active_orders",
        query="SELECT * FROM orders WHERE status = 'active'",
    )

    return datasource


# Initialize
context = initialize_gx_project("./my_pipeline")
add_pandas_datasource(context, base_dir="./data")
```

---

## Writing Expectations

```python
# expectations.py — Define validation rules
import great_expectations as gx


def create_product_expectations(context):
    """Create an expectation suite for product data."""

    suite = context.add_expectation_suite(
        expectation_suite_name="products_quality"
    )

    # Get a validator (connects suite to data for interactive development)
    validator = context.get_validator(
        datasource_name="local_data",
        data_asset_name="parquet_files",
        expectation_suite_name="products_quality",
        batch_request={
            "options": {"year": "2024", "month": "01"}
        },
    )

    # --- Column existence ---
    validator.expect_table_columns_to_match_set(
        column_set=["id", "name", "price", "category", "created_at"],
        exact_match=False,  # Allow extra columns
    )

    # --- Not null ---
    validator.expect_column_values_to_not_be_null("id")
    validator.expect_column_values_to_not_be_null("name")
    validator.expect_column_values_to_not_be_null("price")

    # --- Uniqueness ---
    validator.expect_column_values_to_be_unique("id")

    # --- Type checks ---
    validator.expect_column_values_to_be_of_type("id", "int64")
    validator.expect_column_values_to_be_of_type("price", "float64")

    # --- Value ranges ---
    validator.expect_column_values_to_be_between(
        "price", min_value=0, max_value=100000
    )

    # --- String patterns ---
    validator.expect_column_value_lengths_to_be_between(
        "name", min_value=1, max_value=500
    )

    # --- Categorical values ---
    validator.expect_column_values_to_be_in_set(
        "category",
        value_set=["electronics", "clothing", "food", "books", "home", "sports"],
        mostly=0.95,  # Allow 5% unknown categories
    )

    # --- Row count ---
    validator.expect_table_row_count_to_be_between(
        min_value=100,
        max_value=10_000_000,
    )

    # --- Null rate ---
    validator.expect_column_values_to_not_be_null(
        "category",
        mostly=0.9,  # At least 90% non-null
    )

    # --- Distribution ---
    validator.expect_column_mean_to_be_between(
        "price", min_value=5.0, max_value=500.0
    )
    validator.expect_column_median_to_be_between(
        "price", min_value=1.0, max_value=200.0
    )
    validator.expect_column_stdev_to_be_between(
        "price", min_value=1.0, max_value=1000.0
    )

    # --- Date ranges ---
    validator.expect_column_values_to_be_between(
        "created_at",
        min_value="2020-01-01",
        max_value="2030-01-01",
        parse_strings_as_datetimes=True,
    )

    # --- Regex patterns ---
    validator.expect_column_values_to_match_regex(
        "email",
        regex=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
        mostly=0.95,
    )

    # Save the suite
    validator.save_expectation_suite(discard_failed_expectations=False)
    return suite
```

---

## Checkpoints

```python
# checkpoints.py — Configure and run validation checkpoints
import great_expectations as gx
from great_expectations.checkpoint import Checkpoint


def create_product_checkpoint(context):
    """
    Create a checkpoint that validates products and generates reports.

    A checkpoint bundles:
    - Which data to validate
    - Which expectation suite to use
    - What actions to take (report, alert, etc.)
    """

    checkpoint = Checkpoint(
        name="products_daily_check",
        data_context=context,
        config_version=1.0,
        run_name_template="products_%Y%m%d_%H%M%S",
        validations=[
            {
                "batch_request": {
                    "datasource_name": "local_data",
                    "data_asset_name": "parquet_files",
                    "options": {},
                },
                "expectation_suite_name": "products_quality",
            }
        ],
        action_list=[
            # Store validation result
            {
                "name": "store_validation_result",
                "action": {
                    "class_name": "StoreValidationResultAction",
                },
            },
            # Update Data Docs (HTML reports)
            {
                "name": "update_data_docs",
                "action": {
                    "class_name": "UpdateDataDocsAction",
                },
            },
            # Send Slack notification on failure
            {
                "name": "send_slack_notification",
                "action": {
                    "class_name": "SlackNotificationAction",
                    "slack_webhook": "${SLACK_WEBHOOK_URL}",
                    "notify_on": "failure",
                    "renderer": {
                        "module_name": "great_expectations.render.renderer.slack_renderer",
                        "class_name": "SlackRenderer",
                    },
                },
            },
        ],
    )

    context.add_or_update_checkpoint(checkpoint=checkpoint)
    return checkpoint


def run_checkpoint(context, checkpoint_name: str = "products_daily_check"):
    """Run a checkpoint and return results."""
    result = context.run_checkpoint(checkpoint_name=checkpoint_name)

    if result.success:
        print("All expectations passed!")
    else:
        print("Validation FAILED:")
        for validation_result in result.run_results.values():
            results = validation_result.get("validation_result", {})
            for r in results.get("results", []):
                if not r.get("success", True):
                    expectation = r.get("expectation_config", {})
                    print(f"  FAILED: {expectation.get('expectation_type')}")
                    print(f"    Column: {expectation.get('kwargs', {}).get('column', 'N/A')}")
                    observed = r.get("result", {}).get("observed_value")
                    print(f"    Observed: {observed}")

    return result
```

---

## Custom Expectations

```python
# custom_expectations.py — Build domain-specific validation rules
from great_expectations.expectations import ExpectationConfiguration
from great_expectations.core import ExpectationValidationResult
from great_expectations.execution_engine import PandasExecutionEngine
from great_expectations.expectations.expectation import ColumnMapExpectation
from great_expectations.expectations.metrics import ColumnMapMetricProvider, column_condition_partial
import re


class ExpectColumnValuesToBeValidPhoneNumber(ColumnMapExpectation):
    """Expect column values to be valid US phone numbers."""

    expectation_type = "expect_column_values_to_be_valid_phone_number"

    # Define the metric this expectation uses
    map_metric = "column_values.valid_phone_number"

    # Default parameters
    success_keys = ("mostly",)

    default_kwarg_values = {
        "mostly": 1.0,
    }

    # Documentation
    library_metadata = {
        "tags": ["phone", "validation", "custom"],
        "contributors": ["data-team"],
    }

    class ColumnValuesValidPhoneNumber(ColumnMapMetricProvider):
        condition_metric_name = "column_values.valid_phone_number"

        @column_condition_partial(engine=PandasExecutionEngine)
        def _pandas(cls, column, **kwargs):
            phone_pattern = re.compile(
                r"^(\+1[-.]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})$"
            )
            return column.apply(
                lambda x: bool(phone_pattern.match(str(x))) if x else True
            )


class ExpectColumnValuesToBeValidJSON(ColumnMapExpectation):
    """Expect column values to be valid JSON strings."""

    expectation_type = "expect_column_values_to_be_valid_json"
    map_metric = "column_values.valid_json"
    success_keys = ("mostly",)
    default_kwarg_values = {"mostly": 1.0}

    class ColumnValuesValidJSON(ColumnMapMetricProvider):
        condition_metric_name = "column_values.valid_json"

        @column_condition_partial(engine=PandasExecutionEngine)
        def _pandas(cls, column, **kwargs):
            import json

            def is_valid_json(val):
                if not isinstance(val, str):
                    return False
                try:
                    json.loads(val)
                    return True
                except (json.JSONDecodeError, TypeError):
                    return False

            return column.apply(is_valid_json)


# Usage in an expectation suite
# validator.expect_column_values_to_be_valid_phone_number("phone", mostly=0.95)
# validator.expect_column_values_to_be_valid_json("metadata")
```

---

## Automated Profiling

```python
# profiling.py — Auto-generate expectations from data
import great_expectations as gx
import pandas as pd


def auto_profile(
    context,
    datasource_name: str,
    data_asset_name: str,
    suite_name: str = "auto_profiled",
) -> dict:
    """
    Automatically generate expectations by profiling data.
    Good starting point, but always review and refine.
    """

    profiler = context.add_or_update_profiler(
        name="auto_profiler",
        config_version=1.0,
        rules={
            "column_ranges": {
                "domain_builder": {
                    "class_name": "ColumnDomainBuilder",
                    "include_semantic_types": ["numeric"],
                },
                "parameter_builders": [
                    {
                        "class_name": "NumericMetricRangeMultiBatchParameterBuilder",
                        "metric_name": "column.min",
                        "false_positive_rate": 0.01,
                    },
                    {
                        "class_name": "NumericMetricRangeMultiBatchParameterBuilder",
                        "metric_name": "column.max",
                        "false_positive_rate": 0.01,
                    },
                ],
                "expectation_configuration_builders": [
                    {
                        "class_name": "DefaultExpectationConfigurationBuilder",
                        "expectation_type": "expect_column_values_to_be_between",
                        "column": "$domain.domain_kwargs.column",
                        "min_value": "$parameter.column.min.value[-1]",
                        "max_value": "$parameter.column.max.value[-1]",
                    }
                ],
            },
            "not_null": {
                "domain_builder": {
                    "class_name": "ColumnDomainBuilder",
                },
                "expectation_configuration_builders": [
                    {
                        "class_name": "DefaultExpectationConfigurationBuilder",
                        "expectation_type": "expect_column_values_to_not_be_null",
                        "column": "$domain.domain_kwargs.column",
                        "mostly": 0.95,
                    }
                ],
            },
        },
    )

    # Run profiler
    suite = profiler.run(
        expectation_suite_name=suite_name,
        batch_request={
            "datasource_name": datasource_name,
            "data_asset_name": data_asset_name,
        },
    )

    return suite


# Quick profiling with pandas
def quick_profile(df: pd.DataFrame, suite_name: str = "quick_profile") -> list[dict]:
    """Generate expectations from DataFrame statistics (no GX required)."""
    expectations = []

    # Row count
    expectations.append({
        "type": "expect_table_row_count_to_be_between",
        "kwargs": {
            "min_value": int(len(df) * 0.5),
            "max_value": int(len(df) * 2.0),
        },
    })

    for col in df.columns:
        # Not null
        null_rate = df[col].isnull().mean()
        if null_rate < 0.01:
            expectations.append({
                "type": "expect_column_values_to_not_be_null",
                "kwargs": {"column": col},
            })
        elif null_rate < 0.5:
            expectations.append({
                "type": "expect_column_values_to_not_be_null",
                "kwargs": {"column": col, "mostly": round(1 - null_rate - 0.05, 2)},
            })

        # Numeric ranges
        if pd.api.types.is_numeric_dtype(df[col]):
            q01 = df[col].quantile(0.01)
            q99 = df[col].quantile(0.99)
            expectations.append({
                "type": "expect_column_values_to_be_between",
                "kwargs": {
                    "column": col,
                    "min_value": float(q01),
                    "max_value": float(q99),
                    "mostly": 0.98,
                },
            })

        # Uniqueness
        if df[col].nunique() == len(df):
            expectations.append({
                "type": "expect_column_values_to_be_unique",
                "kwargs": {"column": col},
            })

        # Low cardinality -> value set
        if df[col].dtype == "object" and df[col].nunique() < 20:
            expectations.append({
                "type": "expect_column_values_to_be_in_set",
                "kwargs": {
                    "column": col,
                    "value_set": df[col].dropna().unique().tolist(),
                    "mostly": 0.95,
                },
            })

    return expectations
```

---

## CI/CD Integration

```python
# ci_validation.py — Run GX validations in CI/CD pipelines
import sys
import json
import great_expectations as gx
from pathlib import Path


def validate_in_ci(
    project_dir: str,
    checkpoint_name: str,
    fail_on_error: bool = True,
) -> bool:
    """
    Run validation in CI/CD. Returns True if all checks pass.
    Exits with code 1 on failure for CI pipeline integration.
    """
    context = gx.get_context(project_root_dir=project_dir)
    result = context.run_checkpoint(checkpoint_name=checkpoint_name)

    # Extract summary
    summary = {
        "success": result.success,
        "statistics": {},
    }

    for run_id, run_result in result.run_results.items():
        vr = run_result.get("validation_result", {})
        stats = vr.get("statistics", {})
        summary["statistics"][str(run_id)] = {
            "evaluated": stats.get("evaluated_expectations", 0),
            "successful": stats.get("successful_expectations", 0),
            "unsuccessful": stats.get("unsuccessful_expectations", 0),
            "success_percent": stats.get("success_percent", 0),
        }

    # Print summary
    print(json.dumps(summary, indent=2))

    if not result.success and fail_on_error:
        print("VALIDATION FAILED - blocking pipeline")
        sys.exit(1)

    return result.success


# GitHub Actions workflow step:
# - name: Validate data quality
#   run: python ci_validation.py --project-dir . --checkpoint products_daily_check

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-dir", default=".")
    parser.add_argument("--checkpoint", required=True)
    args = parser.parse_args()

    validate_in_ci(args.project_dir, args.checkpoint)
```

---

## Quick Reference

| Expectation Category | Example |
|---------------------|---------|
| Column existence | `expect_table_columns_to_match_set()` |
| Not null | `expect_column_values_to_not_be_null(mostly=0.95)` |
| Uniqueness | `expect_column_values_to_be_unique()` |
| Value range | `expect_column_values_to_be_between(min, max)` |
| Value set | `expect_column_values_to_be_in_set(["a", "b"])` |
| Regex match | `expect_column_values_to_match_regex(pattern)` |
| Type check | `expect_column_values_to_be_of_type("int64")` |
| Row count | `expect_table_row_count_to_be_between(100, 10000)` |
| Mean range | `expect_column_mean_to_be_between(10, 50)` |
| Distribution | `expect_column_kl_divergence_to_be_less_than()` |

| Component | Purpose |
|-----------|---------|
| Expectation Suite | Group of related validation rules |
| Checkpoint | Executable validation configuration |
| Data Docs | Auto-generated HTML reports |
| Profiler | Auto-generate expectations from data |
| Store | Persist validation results |
| Action | What to do after validation (alert, report) |
