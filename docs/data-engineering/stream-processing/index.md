---
title: "Stream Processing"
description: "Real-time data processing fundamentals — event time vs processing time, windowing strategies, watermarks, exactly-once semantics, state management, and backpressure handling with Kafka Streams and Apache Flink."
tags: [stream-processing, kafka, flink, real-time, event-driven, data-engineering]
difficulty: advanced
prerequisites: [data-engineering]
lastReviewed: "2026-03-17"
---

# Stream Processing

Stream processing is the continuous computation over unbounded data — data that has no defined beginning or end. Unlike batch processing where you know the full dataset upfront, stream processing must handle data as it arrives, making decisions about completeness, ordering, and correctness in real time.

## Why Stream Processing

The business case for stream processing grows as the cost of data latency increases:

| Use Case | Latency Tolerance | Why Streaming |
|----------|-------------------|---------------|
| Fraud detection | < 1 second | Block fraudulent transactions before they complete |
| Real-time dashboards | < 30 seconds | Operational visibility for live systems |
| Recommendation engines | < 5 seconds | Personalize based on current session behavior |
| IoT monitoring | < 10 seconds | Detect equipment anomalies before failure |
| Event-driven microservices | < 1 second | React to state changes across services |
| Real-time bidding (AdTech) | < 100 ms | Bid on ad impressions in auction windows |

## Core Concepts

### Event Time vs Processing Time

The most fundamental concept in stream processing. Every event has two timestamps:

- **Event time**: When the event actually occurred (embedded in the data)
- **Processing time**: When the event is processed by the system (wall clock)

```
Event created at source:     2026-03-17T14:00:00Z  (event time)
Event arrives at Kafka:      2026-03-17T14:00:05Z  (5s network delay)
Event processed by Flink:    2026-03-17T14:00:12Z  (processing time)
                                                    12s total latency
```

**Why this matters:** If you window by processing time, late-arriving events fall into the wrong window. Event time gives correct results but requires watermarks to determine completeness.

```python
# Flink: Setting event time semantics
env = StreamExecutionEnvironment.get_execution_environment()

# Assign timestamps and watermarks from event data
class EventTimestampAssigner(TimestampAssignerWithPeriodicWatermarks):
    def extract_timestamp(self, event, previous_timestamp):
        return event['event_timestamp_ms']  # Use event time

    def get_current_watermark(self):
        # Allow 10 seconds of out-of-orderness
        return Watermark(self.current_max_timestamp - 10_000)
```

### The Streaming Data Model

```
                    Unbounded Input
                    ──────────────▶
Events:  [e1] [e2] [e3] [e4] [e5] [e6] [e7] ...

                    ┌────────────────────┐
                    │  Stream Processor   │
                    │                     │
                    │  - Filter           │
                    │  - Map              │
                    │  - Window           │
                    │  - Aggregate        │
                    │  - Join             │
                    │  - State mgmt       │
                    └────────────────────┘

                    Unbounded Output
                    ──────────────▶
Results: [r1]    [r2]    [r3]    [r4]    ...
```

## Technology Landscape

| Technology | Strengths | Weaknesses | Best For |
|-----------|-----------|------------|----------|
| **Apache Flink** | True streaming, advanced windowing, exactly-once | Complex operations, JVM-heavy | Complex event processing, stateful streaming |
| **Kafka Streams** | Lightweight, embedded in app, Kafka-native | Limited to Kafka ecosystem | Microservice event processing |
| **Apache Spark Structured Streaming** | Unified batch+stream, Python support | Micro-batch (not true streaming), latency | Teams already using Spark |
| **Apache Beam** | Portability across runners | Abstraction overhead | Multi-cloud, runner flexibility |
| **Amazon Kinesis** | Managed, AWS-native | AWS lock-in, limited features | Simple AWS streaming pipelines |
| **Flink SQL** | SQL interface for streaming | Limited for complex logic | Stream analytics for SQL-proficient teams |

## Section Contents

This section covers stream processing in depth:

- **[Windowing](windowing.md)** — Tumbling, sliding, session, and global windows
- **[Watermarks](watermarks.md)** — Tracking event-time progress and completeness
- **[Exactly-Once Processing](exactly-once-processing.md)** — Achieving end-to-end exactly-once semantics
- **[State Management](state-management.md)** — Keyed state, state backends, checkpointing
- **[Backpressure](backpressure.md)** — Handling producers faster than consumers

## Stream Processing Architecture

### Lambda Architecture

Runs both batch and streaming pipelines, merges results for queries:

```
                    ┌──────────────────┐
                    │  Batch Layer     │
Raw Events ───────▶│  (Spark, hourly)  │──┐
     │              └──────────────────┘  │
     │                                     ├──▶ Serving Layer ──▶ Queries
     │              ┌──────────────────┐  │
     └─────────────▶│  Speed Layer     │──┘
                    │  (Flink, real-time)│
                    └──────────────────┘
```

**Pros:** Batch layer provides correctness; speed layer provides freshness.
**Cons:** Maintaining two codebases (batch + stream) with equivalent logic is expensive.

### Kappa Architecture

Everything is a stream. Batch is just a bounded stream replayed from storage:

```
                    ┌──────────────────┐
Raw Events ───────▶│  Stream Layer     │──▶ Serving Layer ──▶ Queries
(Kafka with        │  (Flink)          │
 retention)        └──────────────────┘

Reprocessing: Replay Kafka topic from beginning
```

**Pros:** Single codebase, simpler architecture.
**Cons:** Reprocessing by replay can be slow for large historical datasets.

## Building Your First Stream Pipeline

```python
# Kafka Streams example: Real-time order aggregation
from confluent_kafka import Consumer, Producer
import json

class OrderAggregator:
    """
    Reads order events from Kafka, aggregates revenue per minute,
    writes aggregated results to an output topic.
    """

    def __init__(self):
        self.consumer = Consumer({
            'bootstrap.servers': 'kafka:9092',
            'group.id': 'order-aggregator',
            'auto.offset.reset': 'latest',
            'enable.auto.commit': False,
        })
        self.producer = Producer({'bootstrap.servers': 'kafka:9092'})
        self.window_state = {}  # minute -> {total, count}

    def run(self):
        self.consumer.subscribe(['orders'])

        while True:
            msg = self.consumer.poll(timeout=1.0)
            if msg is None:
                self.flush_expired_windows()
                continue
            if msg.error():
                handle_error(msg.error())
                continue

            order = json.loads(msg.value())
            window_key = self.get_window_key(order['timestamp'])

            # Update window state
            if window_key not in self.window_state:
                self.window_state[window_key] = {'total': 0, 'count': 0}

            self.window_state[window_key]['total'] += order['amount']
            self.window_state[window_key]['count'] += 1

            # Commit offset after processing
            self.consumer.commit(asynchronous=False)

    def flush_expired_windows(self):
        """Emit results for windows that are complete."""
        current_minute = int(time.time() / 60)
        expired = [k for k in self.window_state if k < current_minute - 1]

        for window_key in expired:
            state = self.window_state.pop(window_key)
            result = {
                'window_start': window_key * 60,
                'total_revenue': state['total'],
                'order_count': state['count'],
                'avg_order_value': state['total'] / state['count'],
            }
            self.producer.produce(
                'order-aggregates',
                value=json.dumps(result).encode()
            )
        self.producer.flush()
```

## Stream Processing Guarantees

| Guarantee | Description | Mechanism |
|-----------|-------------|-----------|
| **At-most-once** | Messages processed 0 or 1 times. May lose data. | Commit offset before processing |
| **At-least-once** | Messages processed 1 or more times. May duplicate. | Commit offset after processing |
| **Exactly-once** | Messages processed exactly 1 time. No loss, no duplication. | Transactional processing + idempotent sinks |

## Key Takeaways

1. **Event time, not processing time.** Always window and aggregate by event time for correctness.
2. **Watermarks define completeness.** Without watermarks, you never know if a window has all its data.
3. **Exactly-once is achievable but expensive.** Understand the trade-offs before requiring it.
4. **State is the hard part.** Stateful stream processing requires checkpointing, state backends, and careful management.
5. **Backpressure protects the system.** Without it, a fast producer overwhelms a slow consumer.
6. **Start with Kappa architecture.** Only add a batch layer if stream reprocessing is too slow.

---

*Next: [Windowing →](windowing.md)*
