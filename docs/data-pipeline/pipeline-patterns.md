---
title: "Pipeline Design Patterns"
description: "Proven pipeline design patterns — fan-out and fan-in, checkpoint and resume, idempotent processing, schema validation gates, data quality gates, retry with backoff, dead letter handling, and pipeline versioning for production data systems."
tags: [pipeline-patterns, architecture, idempotent, retry, data-engineering]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Pipeline Design Patterns

A data pipeline is only as reliable as its weakest pattern. Teams that build pipelines from scratch repeat the same mistakes: processing that is not idempotent, failures that lose data, retries that create duplicates, schema changes that break everything silently. This page catalogs the patterns that production pipelines use to be reliable, observable, and maintainable.

---

## Pattern 1: Fan-Out / Fan-In

Process data in parallel branches, then merge results.

```python
# fan_out_fan_in.py — Parallel processing with merge
import pandas as pd
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class FanOutFanIn:
    """
    Split data into chunks, process in parallel, merge results.

    Use when: Processing is CPU-bound and each chunk is independent.
    """

    def __init__(self, max_workers: int = 4):
        self.max_workers = max_workers

    def process(
        self,
        df: pd.DataFrame,
        transform_fn,
        chunk_size: int = 10_000,
    ) -> pd.DataFrame:
        """Fan-out to workers, fan-in results."""
        # Fan-out: split into chunks
        chunks = [
            df.iloc[i:i + chunk_size]
            for i in range(0, len(df), chunk_size)
        ]
        logger.info(f"Fan-out: {len(chunks)} chunks of ~{chunk_size} rows")

        # Process in parallel
        results = []
        with ProcessPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {
                executor.submit(transform_fn, chunk): i
                for i, chunk in enumerate(chunks)
            }
            for future in as_completed(futures):
                chunk_id = futures[future]
                try:
                    result = future.result()
                    results.append((chunk_id, result))
                except Exception as e:
                    logger.error(f"Chunk {chunk_id} failed: {e}")
                    raise

        # Fan-in: merge in original order
        results.sort(key=lambda x: x[0])
        merged = pd.concat([r[1] for r in results], ignore_index=True)
        logger.info(f"Fan-in: merged {len(merged)} rows from {len(results)} chunks")

        return merged


# Typed fan-out: different processing per data type
class TypedFanOut:
    """Route data to different processors based on content."""

    def __init__(self):
        self.handlers: dict[str, callable] = {}

    def register(self, data_type: str, handler):
        self.handlers[data_type] = handler
        return self

    def process(
        self, df: pd.DataFrame, type_column: str
    ) -> pd.DataFrame:
        results = []
        for dtype, group in df.groupby(type_column):
            handler = self.handlers.get(dtype)
            if handler:
                results.append(handler(group))
            else:
                logger.warning(f"No handler for type '{dtype}', passing through")
                results.append(group)

        return pd.concat(results, ignore_index=True)


# Usage
fan = TypedFanOut()
fan.register("text", lambda df: df.assign(processed=df["content"].str.lower()))
fan.register("numeric", lambda df: df.assign(processed=df["value"].astype(float)))
result = fan.process(df, type_column="data_type")
```

---

## Pattern 2: Checkpoint-Resume

Save progress so pipelines can resume from the last successful step.

```python
# checkpoint_resume.py — Resumable pipeline execution
import pandas as pd
import json
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict
import logging

logger = logging.getLogger(__name__)


@dataclass
class Checkpoint:
    step_name: str
    status: str  # "complete", "failed"
    output_path: str
    rows: int
    completed_at: str


class CheckpointManager:
    """Manage pipeline checkpoints for resume capability."""

    def __init__(self, pipeline_name: str, checkpoint_dir: str = "./checkpoints"):
        self.pipeline_name = pipeline_name
        self.checkpoint_dir = Path(checkpoint_dir) / pipeline_name
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.manifest_path = self.checkpoint_dir / "manifest.json"

    def _load_manifest(self) -> dict:
        if self.manifest_path.exists():
            return json.loads(self.manifest_path.read_text())
        return {"steps": {}, "last_run": None}

    def _save_manifest(self, manifest: dict):
        self.manifest_path.write_text(json.dumps(manifest, indent=2))

    def is_step_complete(self, step_name: str) -> bool:
        manifest = self._load_manifest()
        step = manifest["steps"].get(step_name, {})
        return step.get("status") == "complete"

    def save_checkpoint(
        self, step_name: str, df: pd.DataFrame
    ) -> str:
        output_path = self.checkpoint_dir / f"{step_name}.parquet"
        df.to_parquet(output_path, index=False)

        manifest = self._load_manifest()
        manifest["steps"][step_name] = asdict(Checkpoint(
            step_name=step_name,
            status="complete",
            output_path=str(output_path),
            rows=len(df),
            completed_at=datetime.utcnow().isoformat(),
        ))
        manifest["last_run"] = datetime.utcnow().isoformat()
        self._save_manifest(manifest)

        logger.info(f"Checkpoint saved: {step_name} ({len(df)} rows)")
        return str(output_path)

    def load_checkpoint(self, step_name: str) -> pd.DataFrame | None:
        manifest = self._load_manifest()
        step = manifest["steps"].get(step_name, {})
        if step.get("status") == "complete":
            path = step["output_path"]
            if Path(path).exists():
                logger.info(f"Resuming from checkpoint: {step_name}")
                return pd.read_parquet(path)
        return None

    def clear(self):
        """Clear all checkpoints for a fresh run."""
        for f in self.checkpoint_dir.glob("*.parquet"):
            f.unlink()
        if self.manifest_path.exists():
            self.manifest_path.unlink()
        logger.info(f"Cleared checkpoints for '{self.pipeline_name}'")


class ResumablePipeline:
    """Pipeline that automatically resumes from last checkpoint."""

    def __init__(self, name: str):
        self.name = name
        self.checkpoint = CheckpointManager(name)
        self.steps: list[tuple[str, callable]] = []

    def add_step(self, name: str, fn: callable):
        self.steps.append((name, fn))
        return self

    def run(self, df: pd.DataFrame, force: bool = False) -> pd.DataFrame:
        if force:
            self.checkpoint.clear()

        current = df
        for step_name, fn in self.steps:
            # Try loading checkpoint
            checkpoint_data = self.checkpoint.load_checkpoint(step_name)
            if checkpoint_data is not None and not force:
                current = checkpoint_data
                continue

            # Execute step
            logger.info(f"Executing: {step_name}")
            current = fn(current)
            self.checkpoint.save_checkpoint(step_name, current)

        return current
```

---

## Pattern 3: Idempotent Processing

Same input always produces same output, safe to re-run.

```python
# idempotent.py — Idempotent write patterns
import pandas as pd
from pathlib import Path
from datetime import datetime
import hashlib
import logging

logger = logging.getLogger(__name__)


class IdempotentWriter:
    """Write data idempotently — running twice produces the same result."""

    @staticmethod
    def overwrite(df: pd.DataFrame, path: str):
        """
        Simplest idempotent pattern: always overwrite.
        Safe when: you always process the complete dataset.
        """
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(path, index=False)

    @staticmethod
    def upsert(
        new_data: pd.DataFrame,
        existing_path: str,
        key_columns: list[str],
    ) -> pd.DataFrame:
        """
        Upsert: insert new, update existing, keep unmodified.
        Safe to re-run with same or overlapping data.
        """
        path = Path(existing_path)
        if path.exists():
            existing = pd.read_parquet(path)
            # Remove existing records that match new keys
            new_keys = set(
                new_data[key_columns].apply(tuple, axis=1)
            )
            keep_mask = ~existing[key_columns].apply(tuple, axis=1).isin(new_keys)
            combined = pd.concat(
                [existing[keep_mask], new_data],
                ignore_index=True,
            )
        else:
            combined = new_data

        path.parent.mkdir(parents=True, exist_ok=True)
        combined.to_parquet(path, index=False)
        return combined

    @staticmethod
    def partition_overwrite(
        df: pd.DataFrame,
        base_path: str,
        partition_column: str,
    ):
        """
        Overwrite only affected partitions.
        Idempotent at the partition level.
        """
        base = Path(base_path)
        for partition_value, group in df.groupby(partition_column):
            partition_dir = base / f"{partition_column}={partition_value}"
            partition_dir.mkdir(parents=True, exist_ok=True)
            group.to_parquet(
                partition_dir / "data.parquet",
                index=False,
            )
```

---

## Pattern 4: Schema Validation Gates

Stop bad data before it corrupts downstream systems.

```python
# schema_gate.py — Validate data schema at pipeline boundaries
import pandas as pd
from dataclasses import dataclass
from typing import Any
import logging

logger = logging.getLogger(__name__)


@dataclass
class ColumnSpec:
    name: str
    dtype: str
    nullable: bool = True
    min_value: Any = None
    max_value: Any = None


class SchemaGate:
    """
    Validate DataFrame schema at pipeline boundaries.
    Fails fast if data does not match expectations.
    """

    def __init__(self, name: str, columns: list[ColumnSpec]):
        self.name = name
        self.columns = {c.name: c for c in columns}

    def validate(self, df: pd.DataFrame, strict: bool = True) -> list[str]:
        errors = []

        # Check required columns
        expected = set(self.columns.keys())
        actual = set(df.columns)
        missing = expected - actual
        extra = actual - expected

        if missing:
            errors.append(f"Missing columns: {missing}")
        if extra and strict:
            errors.append(f"Unexpected columns: {extra}")

        # Check each column
        for col_name, spec in self.columns.items():
            if col_name not in df.columns:
                continue

            series = df[col_name]

            # Null check
            if not spec.nullable and series.isnull().any():
                errors.append(
                    f"{col_name}: {series.isnull().sum()} nulls (not nullable)"
                )

            # Range checks
            if spec.min_value is not None:
                below = (series.dropna() < spec.min_value).sum()
                if below:
                    errors.append(f"{col_name}: {below} values below {spec.min_value}")

            if spec.max_value is not None:
                above = (series.dropna() > spec.max_value).sum()
                if above:
                    errors.append(f"{col_name}: {above} values above {spec.max_value}")

        if errors:
            logger.error(f"Schema gate '{self.name}' FAILED:\n" + "\n".join(f"  - {e}" for e in errors))
        else:
            logger.info(f"Schema gate '{self.name}' PASSED")

        return errors

    def enforce(self, df: pd.DataFrame) -> pd.DataFrame:
        """Validate and raise on failure."""
        errors = self.validate(df)
        if errors:
            raise ValueError(
                f"Schema gate '{self.name}' failed with {len(errors)} errors:\n"
                + "\n".join(f"  - {e}" for e in errors)
            )
        return df


# Usage
product_gate = SchemaGate("products_clean", [
    ColumnSpec("id", "int64", nullable=False, min_value=1),
    ColumnSpec("name", "string", nullable=False),
    ColumnSpec("price", "float64", nullable=False, min_value=0, max_value=100000),
    ColumnSpec("category", "string", nullable=True),
])

df_validated = product_gate.enforce(df_clean)
```

---

## Pattern 5: Data Quality Gates

Beyond schema — check statistical properties and business rules.

```python
# quality_gate.py — Statistical and business rule validation
import pandas as pd
import numpy as np
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class QualityCheck:
    name: str
    check_fn: callable
    severity: str = "error"  # "error" stops pipeline, "warning" logs only
    description: str = ""


class DataQualityGate:
    """Run data quality checks at pipeline boundaries."""

    def __init__(self, name: str):
        self.name = name
        self.checks: list[QualityCheck] = []

    def add_check(self, name, check_fn, severity="error", description=""):
        self.checks.append(QualityCheck(name, check_fn, severity, description))
        return self

    def run(self, df: pd.DataFrame) -> dict:
        results = {"passed": [], "warnings": [], "errors": []}

        for check in self.checks:
            try:
                passed = check.check_fn(df)
                if passed:
                    results["passed"].append(check.name)
                elif check.severity == "error":
                    results["errors"].append(check.name)
                else:
                    results["warnings"].append(check.name)
            except Exception as e:
                results["errors"].append(f"{check.name}: {e}")

        if results["errors"]:
            logger.error(
                f"Quality gate '{self.name}' FAILED: {results['errors']}"
            )
            raise ValueError(f"Quality gate failed: {results['errors']}")

        logger.info(
            f"Quality gate '{self.name}': "
            f"{len(results['passed'])} passed, "
            f"{len(results['warnings'])} warnings"
        )
        return results


# Pre-built quality checks
def no_duplicates(df, columns=None):
    subset = columns or df.columns.tolist()
    return not df.duplicated(subset=subset).any()

def null_rate_below(df, column, threshold=0.05):
    return df[column].isnull().mean() < threshold

def row_count_between(df, min_rows=1, max_rows=10_000_000):
    return min_rows <= len(df) <= max_rows

def values_in_range(df, column, min_val, max_val):
    return (df[column].dropna() >= min_val).all() and (df[column].dropna() <= max_val).all()

def freshness_check(df, date_column, max_age_hours=24):
    latest = pd.to_datetime(df[date_column]).max()
    age = (pd.Timestamp.utcnow() - latest).total_seconds() / 3600
    return age <= max_age_hours


# Usage
gate = DataQualityGate("products_quality")
gate.add_check("no_duplicates", lambda df: no_duplicates(df, ["id"]))
gate.add_check("price_range", lambda df: values_in_range(df, "price", 0, 100000))
gate.add_check("null_rate", lambda df: null_rate_below(df, "name", 0.01))
gate.add_check("row_count", lambda df: row_count_between(df, 100, 1_000_000))
gate.add_check("freshness", lambda df: freshness_check(df, "created_at", 48), severity="warning")

gate.run(df_clean)
```

---

## Pattern 6: Dead Letter Queue

Isolate failed records instead of crashing the entire pipeline.

```python
# dead_letter.py — Route failed records to a dead letter queue
import pandas as pd
from pathlib import Path
from datetime import datetime
import json
import logging

logger = logging.getLogger(__name__)


class DeadLetterQueue:
    """
    Route records that fail processing to a dead letter queue
    for later investigation and reprocessing.
    """

    def __init__(self, name: str, output_dir: str = "./dead_letters"):
        self.name = name
        self.output_dir = Path(output_dir) / name
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.dead_letters: list[dict] = []

    def add(self, record: dict, error: str, step: str):
        """Add a failed record to the dead letter queue."""
        self.dead_letters.append({
            **record,
            "_dlq_error": error,
            "_dlq_step": step,
            "_dlq_timestamp": datetime.utcnow().isoformat(),
            "_dlq_pipeline": self.name,
        })

    def flush(self) -> int:
        """Write accumulated dead letters to storage."""
        if not self.dead_letters:
            return 0

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        path = self.output_dir / f"dlq_{timestamp}.jsonl"

        with open(path, "w") as f:
            for record in self.dead_letters:
                f.write(json.dumps(record, default=str) + "\n")

        count = len(self.dead_letters)
        logger.warning(f"Flushed {count} records to dead letter queue: {path}")
        self.dead_letters = []
        return count

    def process_with_dlq(
        self,
        df: pd.DataFrame,
        transform_fn: callable,
        step_name: str,
        max_failure_rate: float = 0.05,
    ) -> pd.DataFrame:
        """
        Apply transformation row-by-row, routing failures to DLQ.
        Raises if failure rate exceeds threshold.
        """
        good_rows = []
        for idx, row in df.iterrows():
            try:
                result = transform_fn(row.to_frame().T)
                good_rows.append(result.iloc[0])
            except Exception as e:
                self.add(row.to_dict(), str(e), step_name)

        self.flush()

        failure_rate = len(self.dead_letters) / len(df) if len(df) > 0 else 0
        if len(df) > 0 and (len(df) - len(good_rows)) / len(df) > max_failure_rate:
            raise RuntimeError(
                f"Failure rate {(len(df) - len(good_rows)) / len(df):.1%} "
                f"exceeds threshold {max_failure_rate:.1%}"
            )

        return pd.DataFrame(good_rows).reset_index(drop=True) if good_rows else pd.DataFrame()
```

---

## Pattern 7: Pipeline Versioning

Track which version of your pipeline produced each dataset.

```python
# pipeline_versioning.py — Version tracking for reproducibility
import hashlib
import json
import inspect
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict
import logging

logger = logging.getLogger(__name__)


@dataclass
class PipelineVersion:
    """Track pipeline version for reproducibility."""
    pipeline_name: str
    version: str
    git_commit: str
    code_hash: str
    config_hash: str
    created_at: str
    python_version: str
    dependencies: dict


def get_pipeline_version(
    pipeline_name: str,
    pipeline_fn: callable,
    config: dict,
) -> PipelineVersion:
    """Generate version info for a pipeline run."""
    import sys
    import subprocess

    # Hash the pipeline code
    source = inspect.getsource(pipeline_fn)
    code_hash = hashlib.sha256(source.encode()).hexdigest()[:12]

    # Hash the config
    config_str = json.dumps(config, sort_keys=True, default=str)
    config_hash = hashlib.sha256(config_str.encode()).hexdigest()[:12]

    # Get git commit
    try:
        git_commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
        ).decode().strip()[:8]
    except Exception:
        git_commit = "unknown"

    return PipelineVersion(
        pipeline_name=pipeline_name,
        version=f"{code_hash[:6]}-{config_hash[:6]}",
        git_commit=git_commit,
        code_hash=code_hash,
        config_hash=config_hash,
        created_at=datetime.utcnow().isoformat(),
        python_version=sys.version.split()[0],
        dependencies={},
    )


def stamp_output(
    df,
    version: PipelineVersion,
    output_path: str,
):
    """Save dataset with version metadata sidecar."""
    path = Path(output_path)
    df.to_parquet(path, index=False)

    # Write version sidecar
    meta_path = path.with_suffix(".version.json")
    meta_path.write_text(json.dumps(asdict(version), indent=2))

    logger.info(f"Output stamped with version {version.version}")
```

---

## Quick Reference

| Pattern | Problem It Solves | When to Use |
|---------|------------------|-------------|
| Fan-Out/Fan-In | Slow sequential processing | CPU-bound transforms, independent chunks |
| Checkpoint-Resume | Lost progress on failure | Long-running pipelines (>10 min) |
| Idempotent Processing | Duplicates from re-runs | Every production pipeline |
| Schema Gates | Structural data corruption | Pipeline boundaries |
| Quality Gates | Statistical anomalies | Before loading to warehouse |
| Dead Letter Queue | Single bad record crashes batch | Messy external data |
| Pipeline Versioning | Cannot reproduce old results | Regulated / ML pipelines |
| Retry with Backoff | Transient external failures | API calls, DB connections |

---

::: tip Key Takeaway
- Every production pipeline needs idempotent processing, checkpointing, and dead letter queues -- these three patterns prevent 90% of pipeline failures from becoming data incidents.
- Fan-out/fan-in parallelism speeds up CPU-bound processing, but only when chunks are truly independent; shared state requires coordination.
- Schema and quality gates at pipeline boundaries are the only reliable way to prevent bad data from propagating downstream.
:::

::: details Exercise
**Implement a Dead Letter Queue Pipeline**

Build a pipeline that:
1. Reads records from a JSON file.
2. Applies a transformation that may fail on individual records (e.g., parsing a price field).
3. Routes failed records to a "dead letter" Parquet file with the error message and timestamp.
4. Halts processing if more than 10% of records fail (systematic error detection).
5. Produces a summary report of processed vs failed records.

**Solution Sketch**

```python
import pandas as pd, json
from datetime import datetime
from pathlib import Path

def pipeline_with_dlq(input_path, output_path, dlq_path, threshold=0.1):
    with open(input_path) as f:
        records = json.load(f)

    good, bad = [], []
    for r in records:
        try:
            r["price"] = float(str(r["price"]).replace("$", "").replace(",", ""))
            good.append(r)
        except (ValueError, KeyError) as e:
            r["_error"] = str(e)
            r["_failed_at"] = datetime.utcnow().isoformat()
            bad.append(r)

    failure_rate = len(bad) / len(records) if records else 0
    if failure_rate > threshold:
        raise RuntimeError(f"Failure rate {failure_rate:.1%} exceeds {threshold:.1%}")

    pd.DataFrame(good).to_parquet(output_path, index=False)
    if bad:
        pd.DataFrame(bad).to_parquet(dlq_path, index=False)

    return {"processed": len(good), "failed": len(bad), "rate": failure_rate}
```
:::

::: details Debugging Scenario
**Your pipeline processes data in 3 steps. Step 2 fails midway, but when you restart the pipeline, step 1 runs again (taking 45 minutes) even though its output is already correct.**

Diagnose and fix it.

**Answer**

The pipeline lacks **checkpointing**. Without checkpoints, every restart begins from scratch because there is no record of which steps completed successfully.

Fix: implement checkpoint-resume:
1. After each step completes, save its output to a checkpoint file (Parquet).
2. Before running a step, check if its checkpoint exists. If so, load it and skip execution.
3. Add a `--force` flag to ignore checkpoints when you need a clean re-run.
4. Include input hashing: checkpoint is valid only if the input data has not changed.

```python
def run_step(name, fn, df, checkpoint_dir):
    checkpoint = Path(checkpoint_dir) / f"{name}.parquet"
    if checkpoint.exists():
        return pd.read_parquet(checkpoint)
    result = fn(df)
    result.to_parquet(checkpoint, index=False)
    return result
```
:::

::: warning Common Misconceptions
- **"Retry solves all failures."** Retrying a non-idempotent step that partially succeeded creates duplicates. The step must be idempotent before retries are safe.
- **"Checkpointing is only for long pipelines."** Even a 5-minute pipeline benefits from checkpoints during development and debugging. The cost is a few Parquet writes; the savings are hours of re-processing.
- **"Schema validation is overkill for internal data."** Internal services change schemas without notice more often than external APIs. A schema gate catches a renamed column before it produces wrong results.
- **"Dead letter queues lose data."** The opposite -- without a DLQ, a single bad record crashes the entire batch and loses everything. DLQs preserve bad records for investigation while allowing the pipeline to continue.
:::

::: details Quiz
**1. What does it mean for a pipeline to be idempotent?**

> Running the pipeline multiple times with the same input produces the same output, with no side effects like duplicated rows or accumulated state. This is essential for safe retries and backfills.

**2. What is a dead letter queue (DLQ) in data pipelines?**

> A DLQ is a separate storage location where records that fail processing are saved with error metadata, allowing the pipeline to continue processing valid records while preserving failed ones for investigation.

**3. How does fan-out/fan-in parallelism work?**

> Data is split into independent chunks (fan-out), each chunk is processed in parallel by separate workers, and results are merged back together (fan-in). It is effective when processing is CPU-bound and chunks do not depend on each other.

**4. What is a quality gate, and where should it be placed?**

> A quality gate validates statistical properties of data (row counts, null rates, value distributions) and blocks the pipeline if quality falls below thresholds. Place gates at pipeline boundaries: after extraction, after transformation, and before loading.

**5. Why is pipeline versioning important?**

> It enables reproducibility (re-running a pipeline from 6 months ago produces the same results) and debugging (comparing outputs between versions to find when a regression was introduced).
:::

> **One-Liner Summary:** Production pipeline reliability comes from five patterns: idempotent processing, checkpoint-resume, dead letter queues, schema/quality gates, and retry with backoff.
