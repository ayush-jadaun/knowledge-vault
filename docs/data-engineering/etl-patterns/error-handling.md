---
title: "Error Handling in Data Pipelines"
description: "Production error handling for data pipelines — dead letter queues, circuit breakers, retry strategies, data quarantine, alerting design, and recovery patterns for batch and streaming ETL."
tags: [error-handling, data-engineering, dead-letter-queue, circuit-breaker, retry, data-quality]
difficulty: intermediate
prerequisites: [data-engineering/etl-patterns]
lastReviewed: "2026-03-17"
---

# Error Handling in Data Pipelines

Every data pipeline will fail. The question is not whether, but how — and whether the failure is loud, recoverable, and contained, or silent, permanent, and cascading. Good error handling is the difference between a pipeline that wakes you up at 2 AM once a quarter and one that produces quietly corrupt data for weeks before anyone notices.

## Error Taxonomy

Not all errors are equal. The handling strategy depends on the error category:

| Category | Examples | Strategy |
|----------|----------|----------|
| **Transient infrastructure** | Network timeout, rate limit, connection pool exhausted | Retry with exponential backoff |
| **Data quality** | Null required field, invalid email format, negative amount | Dead letter queue + continue |
| **Schema mismatch** | New column in source, type change, missing table | Fail fast + alert |
| **Logic error** | Bug in transform code, incorrect join, wrong aggregation | Fail fast + fix + replay |
| **Resource exhaustion** | Out of memory, disk full, cluster timeout | Scale up / optimize + retry |
| **Upstream failure** | Source system down, API returns 500, stale data | Circuit breaker + backoff |

## Retry Strategies

### Exponential Backoff with Jitter

The standard retry pattern for transient failures:

```python
import random
import time
from functools import wraps

def retry_with_backoff(
    max_retries: int = 5,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    retryable_exceptions: tuple = (ConnectionError, TimeoutError),
):
    """
    Decorator for retrying functions with exponential backoff and jitter.
    Jitter prevents thundering herd when multiple workers retry simultaneously.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except retryable_exceptions as e:
                    if attempt == max_retries:
                        raise  # Exhausted retries

                    # Exponential backoff: 1s, 2s, 4s, 8s, 16s...
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    # Add jitter: ±50% randomization
                    delay = delay * (0.5 + random.random())

                    log.warning(
                        f"Attempt {attempt + 1}/{max_retries} failed: {e}. "
                        f"Retrying in {delay:.1f}s"
                    )
                    time.sleep(delay)
        return wrapper
    return decorator

# Usage
@retry_with_backoff(max_retries=3, retryable_exceptions=(ConnectionError, TimeoutError))
def extract_from_api(endpoint: str, params: dict) -> list[dict]:
    response = requests.get(endpoint, params=params, timeout=30)
    response.raise_for_status()
    return response.json()
```

### Retry Budget

Limit total retry time to prevent infinite loops:

```python
class RetryBudget:
    """
    Limits total time spent retrying across all operations.
    Prevents a series of transient failures from delaying the pipeline indefinitely.
    """

    def __init__(self, total_budget_seconds: float = 300):
        self.budget = total_budget_seconds
        self.spent = 0.0

    def can_retry(self, delay: float) -> bool:
        return self.spent + delay <= self.budget

    def record_delay(self, delay: float):
        self.spent += delay

    @property
    def remaining(self) -> float:
        return max(0, self.budget - self.spent)

# Usage in a pipeline
retry_budget = RetryBudget(total_budget_seconds=300)  # 5 min total

for record in records:
    for attempt in range(MAX_RETRIES):
        try:
            process(record)
            break
        except TransientError:
            delay = 2 ** attempt
            if not retry_budget.can_retry(delay):
                log.error("Retry budget exhausted. Failing pipeline.")
                raise RetryBudgetExhausted()
            retry_budget.record_delay(delay)
            time.sleep(delay)
```

## Dead Letter Queues (DLQ)

A dead letter queue captures records that fail processing so that the pipeline can continue with valid records. Failed records are stored for later investigation and reprocessing.

### DLQ Architecture

```
                    ┌──────────────┐
Input Records ────▶│  Pipeline     │────▶ Output (valid records)
                    │  Processing  │
                    │              │
                    │  ┌────────┐  │
                    │  │ Catch  │──┼────▶ Dead Letter Queue
                    │  │ Errors │  │      (invalid records + error context)
                    │  └────────┘  │
                    └──────────────┘

DLQ Record Structure:
{
    "original_record": { ... },     // The raw input record
    "error_type": "ValidationError",
    "error_message": "Field 'email' is not a valid email address",
    "pipeline_name": "user_ingestion",
    "pipeline_run_id": "run_20260317_001",
    "failed_at": "2026-03-17T14:30:00Z",
    "retry_count": 0,
    "source_partition": "date=2026-03-17"
}
```

### Implementation

```python
class DeadLetterQueue:
    """
    Routes failed records to a dead letter store.
    Supports S3, database, or message queue backends.
    """

    def __init__(self, backend, pipeline_name: str):
        self.backend = backend
        self.pipeline = pipeline_name

    def send(self, record: dict, error: Exception, context: dict = None):
        dlq_record = {
            'original_record': record,
            'error_type': type(error).__name__,
            'error_message': str(error),
            'error_traceback': traceback.format_exc(),
            'pipeline_name': self.pipeline,
            'run_id': context.get('run_id', 'unknown'),
            'failed_at': datetime.utcnow().isoformat(),
            'retry_count': 0,
        }
        self.backend.write(dlq_record)
        metrics.increment(f"pipeline.{self.pipeline}.dlq.records")

    def replay(self, filter_fn=None, max_records: int = None):
        """Replay DLQ records back through the pipeline."""
        records = self.backend.read(
            pipeline=self.pipeline,
            filter_fn=filter_fn,
            limit=max_records
        )
        for dlq_record in records:
            yield dlq_record['original_record']
            self.backend.mark_replayed(dlq_record)


# Usage in pipeline
dlq = DeadLetterQueue(S3Backend("s3://data-dlq/"), pipeline_name="orders")

def process_batch(records: list[dict]) -> list[dict]:
    valid_records = []
    for record in records:
        try:
            validated = validate(record)
            transformed = transform(validated)
            valid_records.append(transformed)
        except ValidationError as e:
            dlq.send(record, e, context={'run_id': current_run_id})
            # Continue processing remaining records
        except Exception as e:
            # Unexpected errors — fail the pipeline
            raise

    return valid_records
```

### DLQ Monitoring

```python
# Alert when DLQ volume exceeds thresholds
class DLQMonitor:
    def check_thresholds(self, pipeline_name: str):
        dlq_count = self.count_dlq_records(pipeline_name, last_hours=24)
        total_processed = self.count_processed(pipeline_name, last_hours=24)

        error_rate = dlq_count / max(total_processed, 1)

        if error_rate > 0.05:  # >5% error rate
            self.alert_critical(
                f"Pipeline {pipeline_name}: {error_rate:.1%} error rate "
                f"({dlq_count}/{total_processed} records in DLQ)"
            )
        elif error_rate > 0.01:  # >1% error rate
            self.alert_warning(
                f"Pipeline {pipeline_name}: {error_rate:.1%} error rate"
            )

        # Alert on DLQ age — old records indicate forgotten failures
        oldest = self.oldest_dlq_record(pipeline_name)
        if oldest and (datetime.utcnow() - oldest.failed_at).days > 7:
            self.alert_warning(
                f"Pipeline {pipeline_name}: DLQ has records older than 7 days"
            )
```

## Circuit Breaker Pattern

Prevent a failing upstream service from being hammered with retries:

```python
import time
from enum import Enum

class CircuitState(Enum):
    CLOSED = "closed"        # Normal operation
    OPEN = "open"            # Blocking all calls
    HALF_OPEN = "half_open"  # Testing if service recovered

class CircuitBreaker:
    """
    Trips open after N consecutive failures.
    After a cooldown period, allows a single test request.
    If the test succeeds, closes the circuit. If it fails, reopens.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        cooldown_seconds: float = 60,
        name: str = "default"
    ):
        self.failure_threshold = failure_threshold
        self.cooldown = cooldown_seconds
        self.name = name
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0

    def call(self, func, *args, **kwargs):
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time > self.cooldown:
                self.state = CircuitState.HALF_OPEN
                log.info(f"Circuit {self.name}: HALF_OPEN — testing recovery")
            else:
                raise CircuitOpenError(
                    f"Circuit {self.name} is OPEN. "
                    f"Retry after {self.cooldown - (time.time() - self.last_failure_time):.0f}s"
                )

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise

    def _on_success(self):
        self.failure_count = 0
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.CLOSED
            log.info(f"Circuit {self.name}: CLOSED — service recovered")

    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            log.error(
                f"Circuit {self.name}: OPEN after {self.failure_count} failures"
            )

# Usage
api_circuit = CircuitBreaker(failure_threshold=5, cooldown_seconds=120, name="payment_api")

def extract_payments():
    for page in paginate():
        try:
            data = api_circuit.call(fetch_page, page)
            yield from data
        except CircuitOpenError:
            log.warning("Payment API circuit open — skipping remaining pages")
            break
```

## Data Quarantine

Quarantine isolates suspicious data for investigation without blocking the pipeline:

```python
class DataQuarantine:
    """
    Three-tier data routing:
    1. Valid → continues through pipeline
    2. Fixable → auto-corrected with audit trail
    3. Quarantined → isolated for manual review
    """

    def classify(self, record: dict) -> tuple[str, dict]:
        issues = []

        # Check for null required fields
        for field in REQUIRED_FIELDS:
            if record.get(field) is None:
                issues.append(('CRITICAL', f"Missing required field: {field}"))

        # Check for suspicious values
        if record.get('amount', 0) > 1_000_000:
            issues.append(('WARNING', f"Unusually large amount: {record['amount']}"))

        if record.get('email') and not is_valid_email(record['email']):
            issues.append(('FIXABLE', f"Invalid email format: {record['email']}"))

        # Classify
        severities = [s for s, _ in issues]
        if 'CRITICAL' in severities:
            return 'quarantine', {'issues': issues}
        elif 'FIXABLE' in severities:
            return 'fix', {'issues': issues}
        else:
            if 'WARNING' in severities:
                return 'pass_with_warning', {'issues': issues}
            return 'pass', {}

    def process_batch(self, records: list[dict]) -> dict:
        results = {'passed': [], 'fixed': [], 'quarantined': []}

        for record in records:
            classification, context = self.classify(record)

            if classification == 'pass' or classification == 'pass_with_warning':
                results['passed'].append(record)
            elif classification == 'fix':
                fixed = self.auto_fix(record, context['issues'])
                results['fixed'].append(fixed)
            elif classification == 'quarantine':
                self.quarantine_store.write(record, context)
                results['quarantined'].append(record)

        return results
```

## Alerting Design

### Alert Hierarchy

```python
ALERT_RULES = {
    'pipeline_failure': {
        'severity': 'critical',
        'channels': ['pagerduty', 'slack-data-alerts'],
        'condition': 'pipeline run fails after all retries',
        'runbook': 'https://wiki/runbooks/pipeline-failure',
    },
    'high_error_rate': {
        'severity': 'warning',
        'channels': ['slack-data-alerts'],
        'condition': 'DLQ rate > 5% of processed records',
        'runbook': 'https://wiki/runbooks/high-error-rate',
    },
    'volume_anomaly': {
        'severity': 'warning',
        'channels': ['slack-data-alerts'],
        'condition': 'record count < 50% of 7-day average',
        'runbook': 'https://wiki/runbooks/volume-anomaly',
    },
    'freshness_sla_breach': {
        'severity': 'critical',
        'channels': ['pagerduty', 'slack-data-alerts'],
        'condition': 'data freshness > SLA threshold',
        'runbook': 'https://wiki/runbooks/freshness-breach',
    },
    'schema_drift': {
        'severity': 'info',
        'channels': ['slack-data-engineering'],
        'condition': 'new columns detected or type changes',
        'runbook': 'https://wiki/runbooks/schema-drift',
    },
}
```

### Actionable Alert Design

```python
# BAD alert: "Pipeline failed"
# No context, no action, no runbook

# GOOD alert:
def format_pipeline_alert(pipeline: str, error: Exception, context: dict) -> str:
    return f"""
Pipeline Failure: {pipeline}

Error: {type(error).__name__}: {str(error)[:500]}
Stage: {context.get('stage', 'unknown')}
Records processed before failure: {context.get('records_processed', 'unknown')}
Run ID: {context.get('run_id')}
Duration before failure: {context.get('duration_s', 0):.0f}s

Last successful run: {context.get('last_success', 'unknown')}
Consecutive failures: {context.get('consecutive_failures', 1)}

Impact:
- Downstream tables affected: {', '.join(context.get('downstream_tables', []))}
- SLA deadline: {context.get('sla_deadline', 'unknown')}

Runbook: {context.get('runbook_url')}
Logs: {context.get('log_url')}
"""
```

## Recovery Patterns

### Replay from Source

```python
def replay_failed_partition(date: str, pipeline: str):
    """
    Full reprocessing of a failed partition.
    Safe because pipeline is idempotent.
    """
    log.info(f"Replaying {pipeline} for {date}")

    # Re-extract from source
    raw_data = extract(source_table, date=date)

    # Re-transform
    transformed = transform(raw_data)

    # Re-load (idempotent merge)
    merge_into_target(transformed, target_table)

    log.info(f"Replay complete for {pipeline}/{date}")
```

### DLQ Replay

```python
def replay_dlq(pipeline: str, since: datetime, fix_fn=None):
    """
    Replay dead letter queue records after fixing the root cause.
    Optionally apply a fix function to records before reprocessing.
    """
    dlq_records = dlq.read(pipeline=pipeline, since=since)
    log.info(f"Replaying {len(dlq_records)} DLQ records for {pipeline}")

    success_count = 0
    still_failing = 0

    for dlq_record in dlq_records:
        record = dlq_record['original_record']

        if fix_fn:
            record = fix_fn(record)

        try:
            process_record(record)
            dlq.mark_resolved(dlq_record)
            success_count += 1
        except Exception as e:
            dlq.update_retry_count(dlq_record)
            still_failing += 1

    log.info(f"DLQ replay: {success_count} resolved, {still_failing} still failing")
```

## Key Takeaways

1. **Classify errors by category.** Transient errors get retries; data errors get DLQ; schema errors fail fast.
2. **Dead letter queues preserve bad records for investigation.** Never silently drop data.
3. **Exponential backoff with jitter for retries.** Prevents thundering herd on recovery.
4. **Circuit breakers protect upstream services.** Stop hammering a dead service.
5. **Alerts must be actionable.** Include context, impact, and runbook links.
6. **Idempotent pipelines make recovery simple.** Just re-run with confidence.
7. **Monitor DLQ volume and age.** Old DLQ records indicate forgotten failures.

---

*Next: [Stream Processing →](../stream-processing/index.md)*
