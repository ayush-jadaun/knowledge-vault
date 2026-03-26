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

::: tip Key Takeaway
- Classify errors by category: transient errors get retries with exponential backoff, data quality errors go to a dead letter queue, schema errors fail fast.
- Dead letter queues preserve bad records for investigation and replay -- never silently drop data.
- Alerts must be actionable with context, impact assessment, and runbook links; "Pipeline failed" is not an acceptable alert.
:::

::: details Exercise
**Design an Error Handling Strategy for a Payment Pipeline**

You are building a pipeline that ingests payment events from Stripe webhooks, enriches them with customer data from a PostgreSQL database, and loads results into a data warehouse.

Design the error handling for:
1. Stripe API rate limiting (429 responses)
2. Invalid payment amounts (negative values, amounts over $1M)
3. Customer lookup failures (customer ID not found in database)
4. Data warehouse connection timeouts
5. A new field appearing in Stripe webhook payloads

Specify the retry strategy, DLQ policy, circuit breaker config, and alerting rules for each.

::: details Solution
1. **Rate limiting (429):** Exponential backoff with jitter, max 5 retries, base delay 2s, max delay 60s. Respect `Retry-After` header if present.
2. **Invalid amounts:** Route to DLQ with error context. Negative amounts are a data quality issue (DLQ + continue). Amounts over $1M trigger a WARNING alert for manual review but still process.
3. **Customer lookup failures:** Classify as "late reference" -- buffer the record in a staging table and retry with the next batch. If still missing after 24 hours, route to DLQ.
4. **Warehouse timeouts:** Retry with exponential backoff (3 retries). Circuit breaker with threshold=5, cooldown=120s. Alert if circuit opens.
5. **New field in payload:** Log as INFO alert ("schema drift detected"), continue processing. The pipeline should be resilient to new fields (don't fail on unknown keys).

**Alerting rules:**
- Circuit breaker opens: PagerDuty CRITICAL
- DLQ rate > 5%: Slack WARNING
- DLQ records older than 7 days: Slack WARNING
- Schema drift: Slack INFO (data engineering channel)
:::

::: warning Common Misconceptions
- **"Retry everything on failure."** Retrying data quality errors (null fields, invalid formats) is wasteful -- they will fail every time. Only retry transient infrastructure errors.
- **"Dead letter queues are where data goes to die."** DLQs should be actively monitored with alerts on volume and age. Old DLQ records indicate forgotten failures that need resolution.
- **"Circuit breakers add unnecessary complexity."** Without them, a failing upstream service gets hammered with retries from every pipeline instance, potentially making the outage worse.
- **"More retries means more reliability."** Excessive retries delay pipeline completion and can mask persistent issues. Use a retry budget to cap total retry time.
- **"If the pipeline succeeds, the data is correct."** A pipeline can succeed while silently producing wrong results (wrong joins, stale lookups, dropped records). Monitoring must check data quality, not just pipeline status.
:::

::: tip In Production
- **Uber** uses a tiered DLQ system for their trip data pipeline: Level 1 (auto-retry after 1 hour), Level 2 (manual review), Level 3 (permanent quarantine with compliance team notification).
- **Spotify** implements circuit breakers on all external API calls in their data pipelines, with per-service cooldown periods tuned to each API's typical recovery time.
- **Netflix** formats all pipeline alerts with runbook links, blast radius (which downstream tables and dashboards are affected), and estimated time to SLA breach.
- **LinkedIn** uses a replay infrastructure that can re-process any DLQ records through a fixed version of the pipeline, with automated A/B comparison against production output.
:::

::: details Quiz
**1. What is the purpose of jitter in exponential backoff?**

A) To make retries faster
B) To prevent multiple workers from retrying at the same instant (thundering herd)
C) To reduce network bandwidth
D) To randomize the order of processing

::: details Answer
**B)** Without jitter, all workers that failed at the same time will retry at the same time (1s, 2s, 4s, ...), creating load spikes. Jitter adds randomization so retries spread out evenly.
:::

**2. When should a pipeline fail fast instead of using a dead letter queue?**

A) When any record has a validation error
B) When the error indicates a schema mismatch or logic bug that will affect all records
C) When the error rate exceeds 1%
D) When the pipeline is running in production

::: details Answer
**B)** Schema mismatches (missing table, type change) and logic errors (bug in transform code) affect ALL records, not just individual ones. Continuing would produce entirely wrong output. Fail fast, fix the code, replay.
:::

**3. What defines a good alert versus a bad alert?**

A) Good alerts include the pipeline name and error message
B) Good alerts are actionable: they include context, impact, runbook link, and enough information to diagnose without reading logs
C) Good alerts are sent to every team member
D) Good alerts only fire for critical errors

::: details Answer
**B)** A good alert answers: What failed? What stage? How many records processed? What is downstream impact? When is the SLA? Where are the logs? What is the runbook? "Pipeline failed" without context is not actionable.
:::

**4. How does a circuit breaker protect upstream services?**

A) It encrypts requests to prevent data leaks
B) It stops sending requests after consecutive failures, giving the upstream service time to recover
C) It caches responses to reduce load
D) It routes traffic to a backup service

::: details Answer
**B)** After N consecutive failures (threshold), the circuit "opens" and blocks all calls for a cooldown period. After cooldown, it sends a single test request (half-open). If the test succeeds, the circuit closes. If it fails, it reopens.
:::

**5. What is the three-tier data quarantine pattern?**

A) Three levels of data encryption
B) Data is classified as valid (continue), fixable (auto-correct with audit trail), or quarantined (isolated for manual review)
C) Three stages of data processing
D) Three types of backup storage

::: details Answer
**B)** Tier 1 (Valid): data passes all checks. Tier 2 (Fixable): data has minor issues that can be auto-corrected (e.g., email format normalization) with an audit trail. Tier 3 (Quarantine): data has critical issues requiring manual investigation.
:::
:::

---

> **One-Liner Summary:** Classify errors, retry only transient ones, route bad records to a dead letter queue, protect upstreams with circuit breakers, and make every alert actionable.

---

*Next: [Stream Processing →](../stream-processing/index.md)*
