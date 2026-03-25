---
title: "Preprocessing Pipeline Architecture"
description: "Designing robust preprocessing pipelines — raw to staged to clean to feature-ready stages, pipeline DAG design, idempotent transformations, checkpoint and resume patterns, logging, monitoring, and production-grade pipeline orchestration."
tags: [preprocessing, pipeline, architecture, data-quality, python]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Preprocessing Pipeline Architecture

A preprocessing pipeline is not a script — it is a system. Scripts break silently at 3 AM, lose intermediate results on failure, produce different outputs when re-run, and provide no visibility into what happened. A production preprocessing pipeline is idempotent, checkpointed, logged, and recoverable. This page covers the architecture patterns that make that possible.

---

## The Four Stages of Data Maturity

```mermaid
flowchart LR
    A["RAW<br/>(untouched source)"] --> B["STAGED<br/>(validated, deduplicated)"]
    B --> C["CLEAN<br/>(typed, normalized)"]
    C --> D["FEATURE-READY<br/>(engineered, encoded)"]

    style A fill:#ef4444,color:#fff
    style B fill:#f97316,color:#fff
    style C fill:#22c55e,color:#fff
    style D fill:#2563eb,color:#fff
```

| Stage | What Happens | Data Quality |
|-------|-------------|--------------|
| **Raw** | Exact copy from source, no transformations | Unknown |
| **Staged** | Schema validated, duplicates removed, nulls tagged | Structurally valid |
| **Clean** | Types cast, strings normalized, outliers handled | Analytically valid |
| **Feature-ready** | Encoded, scaled, features engineered | Model-ready |

### Why Four Stages?

Every stage is a checkpoint. If the cleaning step fails halfway through, you restart from the staged data — not from the raw data (which might require re-scraping or re-querying). If a feature engineering experiment goes wrong, you revert to clean data without redoing string normalization.

---

## Pipeline DAG Design

```python
# pipeline_dag.py — Directed Acyclic Graph for preprocessing
from dataclasses import dataclass, field
from typing import Callable, Any
import pandas as pd
import time
import logging
import json
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class PipelineStep:
    """A single step in the preprocessing pipeline."""
    name: str
    fn: Callable[[pd.DataFrame], pd.DataFrame]
    depends_on: list[str] = field(default_factory=list)
    checkpoint: bool = True  # Save output after this step
    description: str = ""

    def __repr__(self):
        return f"Step({self.name})"


@dataclass
class StepResult:
    """Result metadata from executing a step."""
    name: str
    status: str  # "success", "skipped", "failed"
    rows_in: int
    rows_out: int
    columns_in: int
    columns_out: int
    duration_seconds: float
    memory_mb: float
    error: str | None = None


class PreprocessingDAG:
    """
    DAG-based preprocessing pipeline with checkpoints,
    dependency resolution, and comprehensive logging.
    """

    def __init__(
        self,
        name: str,
        checkpoint_dir: str = "./checkpoints",
    ):
        self.name = name
        self.steps: dict[str, PipelineStep] = {}
        self.checkpoint_dir = Path(checkpoint_dir) / name
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.results: list[StepResult] = []

    def add_step(
        self,
        name: str,
        fn: Callable[[pd.DataFrame], pd.DataFrame],
        depends_on: list[str] | None = None,
        checkpoint: bool = True,
        description: str = "",
    ) -> "PreprocessingDAG":
        """Add a step to the DAG."""
        step = PipelineStep(
            name=name,
            fn=fn,
            depends_on=depends_on or [],
            checkpoint=checkpoint,
            description=description,
        )
        # Validate dependencies exist
        for dep in step.depends_on:
            if dep not in self.steps:
                raise ValueError(
                    f"Step '{name}' depends on '{dep}' which hasn't been added yet"
                )
        self.steps[name] = step
        return self

    def _topological_sort(self) -> list[str]:
        """Sort steps in dependency order."""
        visited = set()
        order = []

        def visit(name: str):
            if name in visited:
                return
            visited.add(name)
            for dep in self.steps[name].depends_on:
                visit(dep)
            order.append(name)

        for name in self.steps:
            visit(name)
        return order

    def _checkpoint_path(self, step_name: str) -> Path:
        return self.checkpoint_dir / f"{step_name}.parquet"

    def _load_checkpoint(self, step_name: str) -> pd.DataFrame | None:
        """Load a checkpoint if it exists."""
        path = self._checkpoint_path(step_name)
        if path.exists():
            logger.info(f"Loading checkpoint: {step_name}")
            return pd.read_parquet(path)
        return None

    def _save_checkpoint(self, step_name: str, df: pd.DataFrame):
        """Save a checkpoint."""
        path = self._checkpoint_path(step_name)
        df.to_parquet(path, index=False)
        logger.info(f"Checkpoint saved: {step_name} ({len(df)} rows)")

    def run(
        self,
        df: pd.DataFrame,
        resume_from: str | None = None,
        force_rerun: bool = False,
    ) -> pd.DataFrame:
        """
        Execute the pipeline.

        Args:
            df: Input DataFrame
            resume_from: Skip steps until this step, loading its checkpoint
            force_rerun: Ignore all checkpoints
        """
        execution_order = self._topological_sort()
        logger.info(
            f"Pipeline '{self.name}': {len(execution_order)} steps "
            f"({', '.join(execution_order)})"
        )

        current_df = df
        skip_until_found = resume_from is not None

        for step_name in execution_order:
            step = self.steps[step_name]

            # Handle resume logic
            if skip_until_found:
                if step_name == resume_from:
                    skip_until_found = False
                    checkpoint = self._load_checkpoint(step_name)
                    if checkpoint is not None:
                        current_df = checkpoint
                        continue
                else:
                    continue

            # Check for existing checkpoint
            if not force_rerun and step.checkpoint:
                checkpoint = self._load_checkpoint(step_name)
                if checkpoint is not None:
                    current_df = checkpoint
                    self.results.append(StepResult(
                        name=step_name,
                        status="skipped",
                        rows_in=len(checkpoint),
                        rows_out=len(checkpoint),
                        columns_in=len(checkpoint.columns),
                        columns_out=len(checkpoint.columns),
                        duration_seconds=0,
                        memory_mb=checkpoint.memory_usage(deep=True).sum() / 1e6,
                    ))
                    continue

            # Execute step
            logger.info(f"Running step: {step_name}")
            t0 = time.time()
            rows_in = len(current_df)
            cols_in = len(current_df.columns)

            try:
                current_df = step.fn(current_df)
                duration = time.time() - t0
                mem_mb = current_df.memory_usage(deep=True).sum() / 1e6

                result = StepResult(
                    name=step_name,
                    status="success",
                    rows_in=rows_in,
                    rows_out=len(current_df),
                    columns_in=cols_in,
                    columns_out=len(current_df.columns),
                    duration_seconds=duration,
                    memory_mb=mem_mb,
                )
                self.results.append(result)

                logger.info(
                    f"  {step_name}: {rows_in} -> {len(current_df)} rows, "
                    f"{duration:.2f}s, {mem_mb:.1f}MB"
                )

                if step.checkpoint:
                    self._save_checkpoint(step_name, current_df)

            except Exception as e:
                logger.error(f"Step '{step_name}' failed: {e}")
                self.results.append(StepResult(
                    name=step_name,
                    status="failed",
                    rows_in=rows_in,
                    rows_out=0,
                    columns_in=cols_in,
                    columns_out=0,
                    duration_seconds=time.time() - t0,
                    memory_mb=0,
                    error=str(e),
                ))
                raise

        return current_df

    def report(self) -> str:
        """Generate execution report."""
        lines = [f"Pipeline: {self.name}", "=" * 60]
        total_duration = sum(r.duration_seconds for r in self.results)

        for r in self.results:
            status_icon = {"success": "OK", "skipped": "SKIP", "failed": "FAIL"}
            lines.append(
                f"  [{status_icon.get(r.status, '?'):>4}] {r.name:<25} "
                f"rows: {r.rows_in:>8} -> {r.rows_out:>8}  "
                f"time: {r.duration_seconds:>6.2f}s  "
                f"mem: {r.memory_mb:>6.1f}MB"
            )
            if r.error:
                lines.append(f"         ERROR: {r.error}")

        lines.append(f"\nTotal time: {total_duration:.2f}s")
        return "\n".join(lines)

    def clear_checkpoints(self):
        """Remove all checkpoints for this pipeline."""
        for path in self.checkpoint_dir.glob("*.parquet"):
            path.unlink()
        logger.info(f"Cleared checkpoints for pipeline '{self.name}'")
```

### Using the DAG Pipeline

```python
# pipeline_usage.py — Configuring and running a preprocessing pipeline
import pandas as pd
import numpy as np

# Define preprocessing functions
def validate_schema(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure required columns exist."""
    required = ["id", "name", "price", "category", "created_at"]
    missing = set(required) - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    return df


def remove_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """Remove exact duplicates, keeping the last occurrence."""
    return df.drop_duplicates(subset=["id"], keep="last")


def cast_types(df: pd.DataFrame) -> pd.DataFrame:
    """Cast columns to correct types."""
    df = df.copy()
    df["id"] = pd.to_numeric(df["id"], errors="coerce").astype("Int64")
    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
    return df


def clean_strings(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize string columns."""
    df = df.copy()
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].str.strip().str.lower()
    return df


def handle_missing(df: pd.DataFrame) -> pd.DataFrame:
    """Handle missing values with column-specific strategies."""
    df = df.copy()
    df["price"] = df["price"].fillna(df["price"].median())
    df["category"] = df["category"].fillna("unknown")
    df = df.dropna(subset=["id", "name"])  # These are required
    return df


def remove_outliers(df: pd.DataFrame) -> pd.DataFrame:
    """Remove price outliers using IQR method."""
    df = df.copy()
    Q1 = df["price"].quantile(0.25)
    Q3 = df["price"].quantile(0.75)
    IQR = Q3 - Q1
    mask = (df["price"] >= Q1 - 1.5 * IQR) & (df["price"] <= Q3 + 1.5 * IQR)
    return df[mask]


# Build and run the pipeline
pipeline = PreprocessingDAG(name="product_cleaning")

pipeline.add_step("validate_schema", validate_schema, checkpoint=False)
pipeline.add_step("remove_duplicates", remove_duplicates, depends_on=["validate_schema"])
pipeline.add_step("cast_types", cast_types, depends_on=["remove_duplicates"])
pipeline.add_step("clean_strings", clean_strings, depends_on=["cast_types"])
pipeline.add_step("handle_missing", handle_missing, depends_on=["clean_strings"])
pipeline.add_step("remove_outliers", remove_outliers, depends_on=["handle_missing"])

# Run
df_raw = pd.read_parquet("raw_products.parquet")
df_clean = pipeline.run(df_raw)
print(pipeline.report())

# If it fails at "handle_missing", resume from the checkpoint:
# df_clean = pipeline.run(df_raw, resume_from="clean_strings")
```

---

## Idempotent Transformations

An idempotent transformation produces the same output regardless of how many times you run it on the same input. This is critical for pipeline reliability.

```python
# idempotent.py — Patterns for idempotent preprocessing
import pandas as pd
import hashlib
import json
from pathlib import Path
from datetime import datetime


class IdempotentProcessor:
    """
    Ensure preprocessing is idempotent:
    - Same input always produces same output
    - Running twice does not duplicate or corrupt data
    """

    def __init__(self, output_dir: str = "./processed"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _hash_dataframe(self, df: pd.DataFrame) -> str:
        """Create a deterministic hash of a DataFrame's content."""
        content = pd.util.hash_pandas_object(df).values.tobytes()
        return hashlib.sha256(content).hexdigest()[:16]

    def process_idempotent(
        self,
        df: pd.DataFrame,
        name: str,
        transform_fn,
    ) -> pd.DataFrame:
        """
        Process data idempotently.
        If output already exists for this exact input, skip processing.
        """
        input_hash = self._hash_dataframe(df)
        output_path = self.output_dir / f"{name}_{input_hash}.parquet"

        if output_path.exists():
            # Same input was already processed
            return pd.read_parquet(output_path)

        # Process and save
        result = transform_fn(df)
        result.to_parquet(output_path, index=False)
        return result


# Idempotent upsert pattern
def upsert_records(
    new_data: pd.DataFrame,
    existing_path: Path,
    key_columns: list[str],
) -> pd.DataFrame:
    """
    Upsert: insert new records, update existing ones.
    Idempotent — running with same data twice produces same result.
    """
    if existing_path.exists():
        existing = pd.read_parquet(existing_path)
        # Remove existing records that will be replaced
        key_tuples_new = set(
            new_data[key_columns].apply(tuple, axis=1)
        )
        mask = ~existing[key_columns].apply(tuple, axis=1).isin(key_tuples_new)
        kept = existing[mask]
        result = pd.concat([kept, new_data], ignore_index=True)
    else:
        result = new_data

    result.to_parquet(existing_path, index=False)
    return result
```

---

## Logging and Monitoring

```python
# pipeline_logging.py — Structured logging for pipeline observability
import logging
import json
import time
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
from pathlib import Path
import pandas as pd


class StructuredFormatter(logging.Formatter):
    """JSON-formatted log entries for machine parsing."""

    def format(self, record):
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        if hasattr(record, "pipeline_context"):
            log_entry["context"] = record.pipeline_context
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)


def setup_pipeline_logging(
    pipeline_name: str,
    log_dir: str = "./logs",
    level: int = logging.INFO,
) -> logging.Logger:
    """Set up structured logging for a pipeline."""
    log_path = Path(log_dir) / f"{pipeline_name}.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger(f"pipeline.{pipeline_name}")
    logger.setLevel(level)

    # File handler with structured JSON
    file_handler = logging.FileHandler(log_path)
    file_handler.setFormatter(StructuredFormatter())
    logger.addHandler(file_handler)

    # Console handler with human-readable format
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(name)s] %(levelname)s: %(message)s")
    )
    logger.addHandler(console_handler)

    return logger


@dataclass
class PipelineMetrics:
    """Metrics collected during pipeline execution."""
    pipeline_name: str
    step_name: str
    started_at: str
    finished_at: str = ""
    rows_input: int = 0
    rows_output: int = 0
    rows_dropped: int = 0
    null_counts: dict = None
    memory_peak_mb: float = 0.0
    duration_seconds: float = 0.0
    status: str = "running"

    def finalize(self, df_output: pd.DataFrame):
        self.finished_at = datetime.now(timezone.utc).isoformat()
        self.rows_output = len(df_output)
        self.rows_dropped = self.rows_input - self.rows_output
        self.null_counts = df_output.isnull().sum().to_dict()
        self.memory_peak_mb = df_output.memory_usage(deep=True).sum() / 1e6
        self.status = "success"


class MonitoredPipeline:
    """Pipeline wrapper that collects metrics for every step."""

    def __init__(self, name: str, metrics_dir: str = "./metrics"):
        self.name = name
        self.logger = setup_pipeline_logging(name)
        self.metrics_dir = Path(metrics_dir)
        self.metrics_dir.mkdir(parents=True, exist_ok=True)
        self.all_metrics: list[PipelineMetrics] = []

    def run_step(
        self,
        step_name: str,
        df: pd.DataFrame,
        fn,
    ) -> pd.DataFrame:
        """Run a step with full metrics collection."""
        metrics = PipelineMetrics(
            pipeline_name=self.name,
            step_name=step_name,
            started_at=datetime.now(timezone.utc).isoformat(),
            rows_input=len(df),
        )

        self.logger.info(f"Starting step: {step_name} ({len(df)} rows)")
        t0 = time.time()

        try:
            result = fn(df)
            metrics.duration_seconds = time.time() - t0
            metrics.finalize(result)

            self.logger.info(
                f"Completed step: {step_name} "
                f"({metrics.rows_input} -> {metrics.rows_output} rows, "
                f"{metrics.duration_seconds:.2f}s)"
            )

        except Exception as e:
            metrics.status = "failed"
            metrics.duration_seconds = time.time() - t0
            self.logger.error(f"Step failed: {step_name}: {e}", exc_info=True)
            raise

        finally:
            self.all_metrics.append(metrics)

        return result

    def save_metrics(self):
        """Save all metrics to a JSON file."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        path = self.metrics_dir / f"{self.name}_{timestamp}.json"
        data = [asdict(m) for m in self.all_metrics]
        path.write_text(json.dumps(data, indent=2, default=str))
        self.logger.info(f"Metrics saved to {path}")


# Usage
pipeline = MonitoredPipeline("product_preprocessing")

df = pd.read_parquet("raw_products.parquet")
df = pipeline.run_step("validate", df, validate_schema)
df = pipeline.run_step("deduplicate", df, remove_duplicates)
df = pipeline.run_step("cast_types", df, cast_types)
df = pipeline.run_step("clean_strings", df, clean_strings)
df = pipeline.run_step("handle_missing", df, handle_missing)

pipeline.save_metrics()
```

---

## Configuration-Driven Pipelines

```python
# config_pipeline.py — Define pipelines via configuration
import yaml
import pandas as pd
from pathlib import Path
from typing import Callable
import importlib
import logging

logger = logging.getLogger(__name__)


# Pipeline configuration (pipeline_config.yaml)
EXAMPLE_CONFIG = """
pipeline:
  name: ecommerce_preprocessing
  input: ./raw/products.parquet
  output: ./clean/products.parquet
  checkpoint_dir: ./checkpoints/products

stages:
  - name: validate_schema
    module: preprocessing.validators
    function: validate_product_schema
    checkpoint: false

  - name: remove_duplicates
    module: preprocessing.dedup
    function: deduplicate_by_id
    params:
      key_column: product_id
      keep: last

  - name: normalize_strings
    module: preprocessing.strings
    function: normalize_text_columns
    params:
      columns: [name, description, category]
      lowercase: true
      strip: true

  - name: handle_missing
    module: preprocessing.missing
    function: impute_missing
    params:
      strategies:
        price: median
        category: constant
        description: drop
      constant_value: unknown

  - name: remove_outliers
    module: preprocessing.outliers
    function: iqr_filter
    params:
      columns: [price]
      multiplier: 1.5
"""


class ConfigDrivenPipeline:
    """Build and run pipelines from YAML configuration."""

    def __init__(self, config_path: str):
        with open(config_path) as f:
            self.config = yaml.safe_load(f)

        self.name = self.config["pipeline"]["name"]
        self.input_path = self.config["pipeline"]["input"]
        self.output_path = self.config["pipeline"]["output"]
        self.checkpoint_dir = Path(
            self.config["pipeline"].get("checkpoint_dir", "./checkpoints")
        )
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    def _load_function(self, module_path: str, function_name: str) -> Callable:
        """Dynamically load a function from a module."""
        module = importlib.import_module(module_path)
        return getattr(module, function_name)

    def run(self, force: bool = False) -> pd.DataFrame:
        """Execute all stages in order."""
        df = pd.read_parquet(self.input_path)
        logger.info(f"Pipeline '{self.name}': loaded {len(df)} rows")

        for stage_config in self.config["stages"]:
            stage_name = stage_config["name"]
            checkpoint_path = self.checkpoint_dir / f"{stage_name}.parquet"

            # Check for checkpoint
            if not force and checkpoint_path.exists():
                df = pd.read_parquet(checkpoint_path)
                logger.info(f"Loaded checkpoint: {stage_name}")
                continue

            # Load and execute function
            fn = self._load_function(
                stage_config["module"],
                stage_config["function"],
            )
            params = stage_config.get("params", {})

            logger.info(f"Running: {stage_name}")
            df = fn(df, **params)

            # Save checkpoint
            if stage_config.get("checkpoint", True):
                df.to_parquet(checkpoint_path, index=False)

            logger.info(f"  {stage_name}: {len(df)} rows remaining")

        # Save final output
        output_path = Path(self.output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(output_path, index=False)
        logger.info(f"Pipeline complete: {len(df)} rows saved to {output_path}")

        return df
```

---

## Error Recovery Patterns

```python
# error_recovery.py — Graceful error handling in pipelines
import pandas as pd
import logging
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


class RecoverablePipeline:
    """Pipeline that isolates errors to individual records, not entire batches."""

    def __init__(self, name: str, quarantine_dir: str = "./quarantine"):
        self.name = name
        self.quarantine_dir = Path(quarantine_dir) / name
        self.quarantine_dir.mkdir(parents=True, exist_ok=True)
        self.quarantine_count = 0

    def apply_with_quarantine(
        self,
        df: pd.DataFrame,
        fn,
        step_name: str,
        quarantine_threshold: float = 0.1,
    ) -> pd.DataFrame:
        """
        Apply a transformation row-by-row, quarantining failures
        instead of crashing the entire pipeline.

        If more than quarantine_threshold fraction of rows fail,
        raise an error (something is systematically wrong).
        """
        good_rows = []
        bad_rows = []

        for idx, row in df.iterrows():
            try:
                result = fn(row.to_frame().T)
                good_rows.append(result.iloc[0])
            except Exception as e:
                bad_row = row.to_dict()
                bad_row["_error"] = str(e)
                bad_row["_step"] = step_name
                bad_row["_quarantined_at"] = datetime.utcnow().isoformat()
                bad_rows.append(bad_row)

        # Check threshold
        failure_rate = len(bad_rows) / len(df) if len(df) > 0 else 0
        if failure_rate > quarantine_threshold:
            raise RuntimeError(
                f"Step '{step_name}': {failure_rate:.1%} failure rate "
                f"exceeds threshold ({quarantine_threshold:.1%}). "
                f"Systematic error likely."
            )

        # Save quarantined records
        if bad_rows:
            quarantine_df = pd.DataFrame(bad_rows)
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            path = self.quarantine_dir / f"{step_name}_{timestamp}.parquet"
            quarantine_df.to_parquet(path, index=False)
            self.quarantine_count += len(bad_rows)
            logger.warning(
                f"Quarantined {len(bad_rows)} rows from step '{step_name}'"
            )

        if good_rows:
            return pd.DataFrame(good_rows).reset_index(drop=True)
        return pd.DataFrame()

    def apply_batch_with_fallback(
        self,
        df: pd.DataFrame,
        primary_fn,
        fallback_fn,
        step_name: str,
    ) -> pd.DataFrame:
        """
        Try the primary transform. If it fails on the whole batch,
        fall back to a simpler (but less optimal) transform.
        """
        try:
            return primary_fn(df)
        except Exception as e:
            logger.warning(
                f"Step '{step_name}' primary failed ({e}), "
                f"trying fallback..."
            )
            try:
                return fallback_fn(df)
            except Exception as e2:
                logger.error(
                    f"Step '{step_name}' fallback also failed: {e2}"
                )
                raise


# Usage
pipeline = RecoverablePipeline("product_pipeline")

def parse_price_strict(df):
    df = df.copy()
    df["price"] = df["price"].apply(lambda x: float(x.replace("$", "").replace(",", "")))
    return df

# Quarantine rows where price parsing fails, instead of crashing
df_clean = pipeline.apply_with_quarantine(
    df_raw,
    fn=parse_price_strict,
    step_name="parse_price",
    quarantine_threshold=0.05,  # Allow up to 5% failures
)
```

---

## Quick Reference

| Pattern | Purpose | When to Use |
|---------|---------|-------------|
| **DAG Pipeline** | Dependency-ordered steps | Multi-step preprocessing |
| **Checkpointing** | Resume from failure | Long-running pipelines |
| **Idempotent transforms** | Safe re-runs | Any production pipeline |
| **Quarantine** | Isolate bad records | Messy real-world data |
| **Config-driven** | Non-code pipeline changes | Teams with varying skill levels |
| **Structured logging** | Machine-parseable logs | Pipeline monitoring/alerting |

| Stage | Checkpoint Format | Why |
|-------|-------------------|-----|
| Raw | Original format (JSON, CSV) | Preserve exact source |
| Staged | Parquet | Fast reads, type preservation |
| Clean | Parquet | Analytics-ready |
| Feature-ready | Parquet or Feather | ML framework compatibility |
