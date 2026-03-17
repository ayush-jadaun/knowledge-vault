---
title: "Exactly-Once Semantics"
description: "Complete deep dive into message delivery guarantees — at-most-once, at-least-once, and exactly-once semantics, idempotent consumers, Kafka transactions, the transactional outbox pattern, and deduplication strategies with TypeScript implementations"
tags: [message-queues, exactly-once, idempotency, kafka-transactions, outbox-pattern, delivery-guarantees, distributed-systems]
difficulty: advanced
prerequisites: [message-queues, kafka-internals, distributed-transactions]
lastReviewed: "2026-03-17"
---

# Exactly-Once Semantics

"Exactly-once" is the most misunderstood term in distributed systems. Engineers hear it and think: "The message is delivered exactly one time." But in any system where networks can fail, processes can crash, and clocks can drift, true exactly-once delivery is physically impossible. What we actually achieve is **exactly-once processing** — ensuring that the *effect* of processing a message happens exactly once, even if the message itself is delivered multiple times.

This distinction matters because it changes the entire design approach. Instead of trying to prevent duplicate delivery (impossible), we build systems that tolerate duplicate delivery and ensure duplicate processing is harmless. This page covers the three delivery guarantees from first principles, then dives into the engineering patterns that make exactly-once processing achievable in production.

## The Three Delivery Guarantees

### Why Delivery Guarantees Exist

Every message delivery involves at least three steps:

```
1. Producer sends message to broker      (can fail: network timeout)
2. Broker stores message durably          (can fail: broker crash)
3. Consumer processes message and acks    (can fail: consumer crash)
```

Failure can occur at any step. The delivery guarantee determines what happens after a failure.

### At-Most-Once Delivery

**Definition:** Each message is delivered zero or one times. Messages may be lost but are never duplicated.

**How it works:**

```
Producer:
  1. Send message to broker
  2. Don't wait for acknowledgment (fire-and-forget)
  3. If send fails, don't retry

Consumer:
  1. Receive message from broker
  2. Acknowledge immediately (before processing)
  3. Process message
  4. If processing fails, message is already acknowledged → lost
```

```
Scenario: Consumer crash during processing

Time 1: Consumer receives message M1
Time 2: Consumer sends ACK for M1
Time 3: Broker marks M1 as delivered
Time 4: Consumer crashes (M1 was not fully processed)
Time 5: Consumer restarts → M1 is gone (already ACKed)

Result: M1 was lost. Delivered zero times.
```

**When to use:**
- Metrics/telemetry where losing a few data points is acceptable
- Log shipping where completeness is not required
- Real-time sensor data with high frequency (missing one reading doesn't matter)

**Implementation:**

```typescript
import { Kafka, CompressionTypes } from 'kafkajs';

const kafka = new Kafka({ brokers: ['localhost:9092'] });
const producer = kafka.producer();

// At-most-once producer: no retries, no idempotence
await producer.connect();
await producer.send({
  topic: 'metrics',
  messages: [{ value: JSON.stringify({ cpu: 45.2, timestamp: Date.now() }) }],
  acks: 0,  // Don't wait for broker acknowledgment
});
// If this fails, the message is lost. That's the trade-off.

// At-most-once consumer: commit before processing
const consumer = kafka.consumer({ groupId: 'metrics-processor' });
await consumer.connect();
await consumer.subscribe({ topic: 'metrics' });

await consumer.run({
  autoCommit: true,
  autoCommitInterval: 100, // Commit offsets aggressively
  eachMessage: async ({ message }) => {
    // Offset is committed before/during processing
    // If we crash here, the message is lost
    await processMetric(JSON.parse(message.value!.toString()));
  },
});
```

### At-Least-Once Delivery

**Definition:** Each message is delivered one or more times. Messages are never lost but may be duplicated.

**How it works:**

```
Producer:
  1. Send message to broker
  2. Wait for acknowledgment
  3. If no ACK received (timeout/error), retry
  4. Retrying may cause duplicates if broker received the original
     but the ACK was lost

Consumer:
  1. Receive message from broker
  2. Process message fully
  3. Acknowledge only after successful processing
  4. If crash before ACK, message is redelivered → duplicate processing
```

```
Scenario: Lost acknowledgment (producer side)

Time 1: Producer sends message M1
Time 2: Broker receives M1, writes to log
Time 3: Broker sends ACK → ACK lost in network
Time 4: Producer times out, retries sending M1
Time 5: Broker receives M1 again, writes to log
Time 6: Broker sends ACK → Producer receives it

Result: M1 is stored twice in the broker's log.

Scenario: Consumer crash before ACK

Time 1: Consumer receives message M1
Time 2: Consumer processes M1 (writes to database)
Time 3: Consumer crashes before sending ACK
Time 4: Consumer restarts
Time 5: Broker redelivers M1 (no ACK was received)
Time 6: Consumer processes M1 again → duplicate processing

Result: M1 was processed twice.
```

**When to use:**
- Most production systems start here
- Any case where data loss is unacceptable
- Works well when combined with idempotent consumers

**Implementation:**

```typescript
// At-least-once producer: retries enabled, acks=all
const producer = kafka.producer({
  retry: {
    retries: 5,
    initialRetryTime: 100,
    maxRetryTime: 30000,
  },
});

await producer.send({
  topic: 'orders',
  messages: [{ key: orderId, value: JSON.stringify(orderEvent) }],
  acks: -1,  // Wait for all ISR replicas to acknowledge
});
// If send fails after retries, throw error (let caller handle)
// If ACK is lost, message may be written twice

// At-least-once consumer: commit after processing
const consumer = kafka.consumer({
  groupId: 'order-processor',
});

await consumer.run({
  autoCommit: false, // Manual offset management
  eachMessage: async ({ topic, partition, message }) => {
    // Process first
    await processOrder(JSON.parse(message.value!.toString()));

    // Commit only after successful processing
    await consumer.commitOffsets([{
      topic,
      partition,
      offset: (BigInt(message.offset) + 1n).toString(),
    }]);
    // If crash between processing and commit, message is redelivered
  },
});
```

### Exactly-Once Semantics (EOS)

**Definition:** Each message is processed exactly once. The *effect* of processing occurs once and only once, even if the message is delivered multiple times.

**The key insight:** Exactly-once is not a property of the delivery mechanism. It is a property of the **end-to-end system** that combines delivery with processing guarantees.

There are two fundamental approaches:

1. **Idempotent processing:** Accept duplicate delivery, make processing idempotent so duplicates have no additional effect.
2. **Transactional processing:** Use transactions to atomically commit the processing result and the offset, so either both happen or neither happens.

Both approaches achieve the same outcome: the effect of each message occurs exactly once.

## Why True Exactly-Once Delivery Is Impossible

This is a consequence of the **Two Generals' Problem** (a special case of the Byzantine Generals' Problem). Consider a producer sending a message to a broker:

```
Producer ──── message M1 ────► Broker
Producer ◄──── ACK ─────────── Broker
```

If the ACK is lost, the producer doesn't know whether the broker received the message. It has two choices:

1. **Don't retry:** Message might be lost (at-most-once)
2. **Retry:** Message might be duplicated (at-least-once)

There is no third option. No amount of protocol engineering can eliminate this fundamental ambiguity when network communication is unreliable. This was formally proven by the Two Generals' Problem in 1975.

**What we CAN do:** We can make duplicate delivery invisible to the application by ensuring that processing the same message twice has the same effect as processing it once. This is exactly-once *semantics* (the apparent behavior) without exactly-once *delivery* (the physical reality).

## Idempotent Producers

### The Problem

When a producer retries a send due to a network timeout, the broker may receive two copies of the same message. Without idempotent producers, both copies are appended to the partition log.

### How Kafka Idempotent Producers Work

Kafka's idempotent producer assigns each producer instance a **Producer ID (PID)** and each message a **sequence number**. The broker deduplicates messages by tracking the expected sequence number per PID per partition.

```
Producer (PID=1):
  Message 1: (PID=1, Seq=0, data="order-1")  → Broker stores
  Message 2: (PID=1, Seq=1, data="order-2")  → Broker stores
  Message 2: (PID=1, Seq=1, data="order-2")  → Broker rejects (duplicate)
  Message 3: (PID=1, Seq=2, data="order-3")  → Broker stores
```

The broker maintains a map of `{PID, Partition} → last_sequence_number`. If an incoming message has a sequence number that's already been seen, it's silently dropped (and an ACK is sent so the producer stops retrying).

**Configuration:**

```typescript
const producer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 5,  // Kafka guarantees ordering with up to 5 in-flight
});
```

When `idempotent: true` is set:
- `acks` is automatically set to `all` (-1)
- `retries` is set to `MAX_INT`
- `maxInFlightRequests` is capped at 5
- The broker assigns a PID and tracks sequence numbers

### Limitations

Idempotent producers only guarantee deduplication within a single producer session. If the producer process restarts, it gets a new PID, and the broker treats it as a new producer. Messages sent by the old producer instance and retried by the new instance are NOT deduplicated.

**To handle cross-session deduplication, you need transactions.**

## Kafka Transactions

Kafka transactions extend idempotent producers to provide exactly-once semantics for **read-process-write** workflows: consume from one topic, process, produce to another topic, and commit the consumer offset — all atomically.

### How Kafka Transactions Work

#### Transaction Coordinator

Each Kafka broker can serve as a **Transaction Coordinator**. A producer is assigned a coordinator based on a hash of its `transactional.id`. The coordinator manages the transaction lifecycle using an internal topic (`__transaction_state`).

```
┌──────────────────────────────────────────────────────┐
│                Transaction Flow                       │
│                                                       │
│  Producer                   Transaction Coordinator   │
│    │                               │                  │
│    │── InitProducerId ───────────►│                  │
│    │◄── PID + Epoch ──────────────│                  │
│    │                               │                  │
│    │── BeginTransaction ─────────►│                  │
│    │                               │                  │
│    │── AddPartitionsToTxn ───────►│                  │
│    │   (topic-A/0, topic-B/1)     │                  │
│    │                               │                  │
│    │── Produce to topic-A/0 ─────►│ Broker 1         │
│    │── Produce to topic-B/1 ─────►│ Broker 2         │
│    │                               │                  │
│    │── AddOffsetsToTxn ──────────►│                  │
│    │   (consumer group offsets)    │                  │
│    │                               │                  │
│    │── TxnOffsetCommit ──────────►│ Group Coordinator │
│    │                               │                  │
│    │── EndTransaction ───────────►│                  │
│    │   (COMMIT or ABORT)          │                  │
│    │                               │                  │
│    │   Coordinator writes COMMIT   │                  │
│    │   markers to all partitions   │                  │
│    │                               │                  │
│    │◄── Success ──────────────────│                  │
└──────────────────────────────────────────────────────┘
```

#### Transaction Protocol Steps

1. **InitProducerId:** Producer sends its `transactional.id` to the coordinator. Coordinator returns a PID and epoch. If a previous producer with the same `transactional.id` exists, its epoch is incremented (fencing it off).

2. **BeginTransaction:** Producer marks the start of a transaction (local state only).

3. **AddPartitionsToTxn:** Producer tells the coordinator which partitions it will write to in this transaction.

4. **Produce:** Producer sends messages to target partitions. Messages are written to the log but marked as part of an uncommitted transaction.

5. **AddOffsetsToTxn:** If this is a consume-transform-produce pattern, the producer tells the coordinator which consumer group's offsets should be committed as part of the transaction.

6. **TxnOffsetCommit:** Producer sends the consumer offsets to the group coordinator (not the transaction coordinator).

7. **EndTransaction:** Producer requests COMMIT or ABORT. The coordinator writes the decision to `__transaction_state`, then writes **commit markers** (or **abort markers**) to every partition involved in the transaction.

8. **Consumers:** When a consumer with `isolation.level=read_committed` reads a partition, it skips messages that belong to uncommitted or aborted transactions.

### Implementation: Consume-Transform-Produce

```typescript
import { Kafka, EachMessagePayload } from 'kafkajs';

const kafka = new Kafka({
  brokers: ['broker1:9092', 'broker2:9092', 'broker3:9092'],
});

// Transactional producer with a stable transactional.id
const producer = kafka.producer({
  transactionalId: 'order-processor-tx-1',
  idempotent: true,
  maxInFlightRequests: 1,
});

const consumer = kafka.consumer({
  groupId: 'order-processor',
  // read_committed: only see messages from committed transactions
  readUncommitted: false,
});

await producer.connect();
await consumer.connect();
await consumer.subscribe({ topic: 'raw-orders', fromBeginning: false });

await consumer.run({
  autoCommit: false,
  eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
    const order = JSON.parse(message.value!.toString());

    // Begin transaction
    const transaction = await producer.transaction();

    try {
      // Transform and produce to output topic
      const enrichedOrder = await enrichOrder(order);

      await transaction.send({
        topic: 'enriched-orders',
        messages: [{
          key: message.key,
          value: JSON.stringify(enrichedOrder),
        }],
      });

      // Also produce an event to the audit topic
      await transaction.send({
        topic: 'order-audit',
        messages: [{
          key: message.key,
          value: JSON.stringify({
            orderId: enrichedOrder.id,
            action: 'enriched',
            timestamp: Date.now(),
          }),
        }],
      });

      // Commit consumer offset as part of the transaction
      await transaction.sendOffsets({
        consumerGroupId: 'order-processor',
        topics: [{
          topic,
          partitions: [{
            partition,
            offset: (BigInt(message.offset) + 1n).toString(),
          }],
        }],
      });

      // Commit transaction — atomically commits:
      // 1. Messages to enriched-orders
      // 2. Messages to order-audit
      // 3. Consumer offset for raw-orders
      await transaction.commit();
    } catch (error) {
      // Abort transaction — all writes are rolled back
      await transaction.abort();
      console.error('Transaction aborted:', error);
      // The message will be redelivered (offset not committed)
    }
  },
});
```

### Transaction Performance Impact

Transactions add latency and reduce throughput:

| Metric | Without Transactions | With Transactions |
|--------|---------------------|-------------------|
| Produce latency (p50) | 5ms | 15-25ms |
| Produce latency (p99) | 20ms | 50-80ms |
| Throughput (records/sec) | 500K | 100-200K |
| Broker CPU overhead | Baseline | +15-25% |

The throughput reduction comes from:
- Extra RPCs per transaction (InitPID, AddPartitions, EndTxn)
- fsync on transaction coordinator's state log
- Commit markers written to all involved partitions
- Consumers must buffer uncommitted messages

### Transaction Timeout and Fencing

**Transaction timeout:** If a producer starts a transaction and crashes before committing, the coordinator aborts the transaction after `transaction.timeout.ms` (default: 60 seconds).

**Producer fencing:** When a new producer instance starts with the same `transactional.id`, the coordinator increments the epoch. Any in-flight transactions from the old producer (with a lower epoch) are automatically aborted. The old producer receives `ProducerFencedException` if it tries to continue.

```typescript
// Producer fencing prevents zombie producers
// If two producers start with the same transactional.id,
// the second one fences off the first

const producer1 = kafka.producer({ transactionalId: 'tx-1' });
await producer1.connect(); // Gets PID=1, Epoch=0

// Producer 1 crashes, a new instance starts
const producer2 = kafka.producer({ transactionalId: 'tx-1' });
await producer2.connect(); // Gets PID=1, Epoch=1

// If producer1 somehow recovers and tries to produce:
// → ProducerFencedException (epoch 0 < current epoch 1)
```

## Idempotent Consumers

Transactions solve exactly-once within Kafka (consume from Kafka, produce to Kafka). But most real-world consumers write to external systems (databases, APIs, file systems). For these, we need **idempotent consumers**.

### What Makes a Consumer Idempotent

An idempotent consumer produces the same result whether it processes a message once or multiple times. The key technique is **deduplication**: detect that a message has already been processed and skip the duplicate.

### Deduplication Strategies

#### Strategy 1: Natural Idempotency

Some operations are naturally idempotent:

```typescript
// Naturally idempotent: SET operations
await redis.set(`user:${userId}:email`, newEmail);
// Running this twice with the same value has no additional effect

// Naturally idempotent: UPSERT
await db.query(
  `INSERT INTO users (id, email) VALUES ($1, $2)
   ON CONFLICT (id) DO UPDATE SET email = $2`,
  [userId, newEmail]
);

// NOT naturally idempotent: increment
await db.query(
  `UPDATE accounts SET balance = balance + $1 WHERE id = $2`,
  [amount, accountId]
);
// Running this twice doubles the amount — NOT idempotent
```

#### Strategy 2: Deduplication Table

Track processed message IDs in the database, using the same transaction as the business logic:

```typescript
interface ProcessedMessage {
  messageId: string;
  processedAt: Date;
  partition: number;
  offset: string;
}

async function processOrderIdempotently(
  message: KafkaMessage,
  partition: number
): Promise<void> {
  const messageId = message.headers?.['message-id']?.toString()
    || `${partition}-${message.offset}`;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if already processed (with row lock to prevent concurrent processing)
    const { rows } = await client.query(
      `SELECT message_id FROM processed_messages
       WHERE message_id = $1
       FOR UPDATE SKIP LOCKED`,
      [messageId]
    );

    if (rows.length > 0) {
      // Already processed — skip
      await client.query('ROLLBACK');
      console.log(`Duplicate message skipped: ${messageId}`);
      return;
    }

    // Process the business logic
    const order = JSON.parse(message.value!.toString());
    await client.query(
      `INSERT INTO orders (id, customer_id, total, status)
       VALUES ($1, $2, $3, $4)`,
      [order.id, order.customerId, order.total, 'CONFIRMED']
    );

    await client.query(
      `UPDATE inventory SET quantity = quantity - $1
       WHERE product_id = $2 AND quantity >= $1`,
      [order.quantity, order.productId]
    );

    // Record that we processed this message
    await client.query(
      `INSERT INTO processed_messages (message_id, processed_at, partition, "offset")
       VALUES ($1, NOW(), $2, $3)`,
      [messageId, partition, message.offset]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error; // Message will be redelivered
  } finally {
    client.release();
  }
}
```

**Schema:**

```sql
CREATE TABLE processed_messages (
  message_id VARCHAR(255) PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  partition INTEGER NOT NULL,
  "offset" VARCHAR(50) NOT NULL
);

-- Clean up old entries periodically
-- (messages older than 7 days won't be redelivered)
CREATE INDEX idx_processed_messages_time ON processed_messages (processed_at);
```

#### Strategy 3: Idempotency Key in the Message

Producers include a unique idempotency key that represents the business operation:

```typescript
// Producer: include idempotency key
await producer.send({
  topic: 'payments',
  messages: [{
    key: paymentId,
    value: JSON.stringify({
      paymentId,
      orderId,
      amount,
      currency: 'USD',
    }),
    headers: {
      'idempotency-key': `payment-${orderId}-${amount}-${currency}`,
    },
  }],
});

// Consumer: use idempotency key for deduplication
async function processPayment(message: KafkaMessage): Promise<void> {
  const idempotencyKey = message.headers?.['idempotency-key']?.toString();
  if (!idempotencyKey) throw new Error('Missing idempotency key');

  // Atomic upsert with idempotency check
  const result = await db.query(
    `INSERT INTO payments (idempotency_key, order_id, amount, status)
     VALUES ($1, $2, $3, 'PENDING')
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [idempotencyKey, payment.orderId, payment.amount]
  );

  if (result.rows.length === 0) {
    // Already processed
    return;
  }

  // Process payment with external payment provider
  const paymentResult = await chargePaymentProvider(payment);

  await db.query(
    `UPDATE payments SET status = $1, provider_ref = $2
     WHERE idempotency_key = $3`,
    [paymentResult.status, paymentResult.reference, idempotencyKey]
  );
}
```

#### Strategy 4: Conditional Writes (Optimistic Concurrency)

Use version numbers or timestamps to ensure updates are only applied once:

```typescript
async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfile>,
  expectedVersion: number
): Promise<boolean> {
  const result = await db.query(
    `UPDATE user_profiles
     SET name = COALESCE($1, name),
         email = COALESCE($2, email),
         version = version + 1,
         updated_at = NOW()
     WHERE user_id = $3 AND version = $4`,
    [updates.name, updates.email, userId, expectedVersion]
  );

  // If no rows updated, either the version changed (concurrent update)
  // or this is a duplicate (version already incremented)
  return result.rowCount === 1;
}
```

#### Strategy 5: Content-Based Deduplication

For systems where messages don't have unique IDs, compute a fingerprint of the message content:

```typescript
import { createHash } from 'crypto';

function computeMessageFingerprint(message: KafkaMessage): string {
  const content = {
    key: message.key?.toString(),
    value: message.value?.toString(),
    // Don't include offset or timestamp — those change on redelivery
  };

  return createHash('sha256')
    .update(JSON.stringify(content))
    .digest('hex');
}

// Use fingerprint as the deduplication key
const fingerprint = computeMessageFingerprint(message);
const alreadyProcessed = await deduplicationStore.has(fingerprint);

if (!alreadyProcessed) {
  await processMessage(message);
  await deduplicationStore.set(fingerprint, Date.now(), { ttl: 7 * 24 * 60 * 60 });
}
```

### Deduplication Window

You don't need to remember every message ID forever. Deduplication entries only need to persist longer than the maximum redelivery window:

| Scenario | Redelivery Window | Deduplication TTL |
|----------|------------------|-------------------|
| Kafka consumer restart | Minutes | 1 hour |
| Consumer group rebalance | Seconds | 1 hour |
| Manual offset reset | Indefinite | 7 days |
| Dead letter queue replay | Days | 30 days |

```sql
-- Periodic cleanup of deduplication table
DELETE FROM processed_messages
WHERE processed_at < NOW() - INTERVAL '7 days';
```

## The Transactional Outbox Pattern

The outbox pattern solves a critical problem: **how to atomically update a database AND publish a message.** Without it, you have two options, both broken:

### The Problem

```
Option A: Publish first, then update DB
  1. Publish message to Kafka       ✓
  2. Update database                ✗ (crash)
  Result: Message published, but DB not updated. Inconsistent.

Option B: Update DB first, then publish
  1. Update database                ✓
  2. Publish message to Kafka       ✗ (crash)
  Result: DB updated, but message not published. Downstream not notified.
```

Neither option provides atomicity. Distributed transactions (2PC) between a database and a message broker are complex and have poor availability characteristics.

### The Solution: Outbox Pattern

Instead of publishing directly to the message broker, write the message to an **outbox table** in the same database, in the same transaction as your business logic. A separate process reads the outbox table and publishes to the broker.

```
┌─────────────────────────────────────────────────────┐
│                  Outbox Pattern                      │
│                                                      │
│  Application                                         │
│    │                                                 │
│    │  BEGIN TRANSACTION                               │
│    │    INSERT INTO orders (...) VALUES (...)         │
│    │    INSERT INTO outbox (event_type, payload, ...) │
│    │  COMMIT                                         │
│    │                                                 │
│    │  Both writes succeed or both fail               │
│    │  (single database transaction)                  │
│                                                      │
│  Outbox Publisher (separate process)                  │
│    │                                                 │
│    │  Poll outbox table for unpublished events       │
│    │  Publish to Kafka                               │
│    │  Mark as published                              │
│    │                                                 │
│    │  If crash after publish but before marking:     │
│    │  → Message published again (duplicate)          │
│    │  → Consumer handles via idempotency             │
└─────────────────────────────────────────────────────┘
```

### Implementation

#### Database Schema

```sql
CREATE TABLE outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(100) NOT NULL,     -- e.g., 'Order', 'Payment'
  aggregate_id VARCHAR(100) NOT NULL,       -- e.g., order ID
  event_type VARCHAR(100) NOT NULL,         -- e.g., 'OrderCreated'
  payload JSONB NOT NULL,                   -- event data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,                 -- NULL until published
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE INDEX idx_outbox_unpublished ON outbox (created_at)
  WHERE published_at IS NULL;

CREATE INDEX idx_outbox_aggregate ON outbox (aggregate_type, aggregate_id);
```

#### Application Code

```typescript
import { Pool, PoolClient } from 'pg';

interface OutboxEvent {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

class OrderService {
  constructor(private pool: Pool) {}

  async createOrder(order: CreateOrderRequest): Promise<Order> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Business logic: insert order
      const { rows } = await client.query(
        `INSERT INTO orders (id, customer_id, items, total, status)
         VALUES ($1, $2, $3, $4, 'CREATED')
         RETURNING *`,
        [order.id, order.customerId, JSON.stringify(order.items), order.total]
      );

      const createdOrder = rows[0];

      // Write event to outbox (same transaction)
      await this.writeToOutbox(client, {
        aggregateType: 'Order',
        aggregateId: createdOrder.id,
        eventType: 'OrderCreated',
        payload: {
          orderId: createdOrder.id,
          customerId: createdOrder.customer_id,
          items: order.items,
          total: order.total,
          createdAt: createdOrder.created_at,
        },
      });

      // Update inventory (same transaction)
      for (const item of order.items) {
        const result = await client.query(
          `UPDATE inventory SET quantity = quantity - $1
           WHERE product_id = $2 AND quantity >= $1`,
          [item.quantity, item.productId]
        );

        if (result.rowCount === 0) {
          throw new Error(`Insufficient inventory for ${item.productId}`);
        }
      }

      await client.query('COMMIT');
      return createdOrder;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async writeToOutbox(
    client: PoolClient,
    event: OutboxEvent
  ): Promise<void> {
    await client.query(
      `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [event.aggregateType, event.aggregateId, event.eventType, event.payload]
    );
  }
}
```

#### Outbox Publisher

```typescript
import { Kafka, Producer } from 'kafkajs';
import { Pool } from 'pg';

class OutboxPublisher {
  private producer: Producer;
  private running = false;

  constructor(
    private pool: Pool,
    kafka: Kafka,
    private pollIntervalMs: number = 100,
    private batchSize: number = 100
  ) {
    this.producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
    });
  }

  async start(): Promise<void> {
    await this.producer.connect();
    this.running = true;

    while (this.running) {
      const published = await this.publishBatch();

      if (published === 0) {
        // No messages to publish — wait before polling again
        await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
      }
      // If we published messages, immediately check for more
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.producer.disconnect();
  }

  private async publishBatch(): Promise<number> {
    const client = await this.pool.connect();

    try {
      // Select unpublished events with row-level locking
      // SKIP LOCKED allows multiple publisher instances
      await client.query('BEGIN');

      const { rows: events } = await client.query(
        `SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at
         FROM outbox
         WHERE published_at IS NULL AND retry_count < 10
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [this.batchSize]
      );

      if (events.length === 0) {
        await client.query('ROLLBACK');
        return 0;
      }

      // Publish each event to Kafka
      for (const event of events) {
        const topic = `${event.aggregate_type.toLowerCase()}-events`;

        try {
          await this.producer.send({
            topic,
            messages: [{
              key: event.aggregate_id,
              value: JSON.stringify({
                eventId: event.id,
                eventType: event.event_type,
                aggregateType: event.aggregate_type,
                aggregateId: event.aggregate_id,
                payload: event.payload,
                timestamp: event.created_at,
              }),
              headers: {
                'event-type': event.event_type,
                'aggregate-type': event.aggregate_type,
                'idempotency-key': event.id,
              },
            }],
          });

          // Mark as published
          await client.query(
            `UPDATE outbox SET published_at = NOW() WHERE id = $1`,
            [event.id]
          );
        } catch (error) {
          // Increment retry count and record error
          await client.query(
            `UPDATE outbox SET retry_count = retry_count + 1, last_error = $2
             WHERE id = $1`,
            [event.id, (error as Error).message]
          );
        }
      }

      await client.query('COMMIT');
      return events.length;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Outbox publisher error:', error);
      return 0;
    } finally {
      client.release();
    }
  }
}
```

### Change Data Capture (CDC) Alternative

Instead of polling the outbox table, use Change Data Capture to stream changes from the database transaction log:

```
┌──────────────────────────────────────────────────────────┐
│              CDC-Based Outbox                             │
│                                                           │
│  Application                                              │
│    │                                                      │
│    │  BEGIN TRANSACTION                                    │
│    │    INSERT INTO orders (...)                           │
│    │    INSERT INTO outbox (...)                           │
│    │  COMMIT                                              │
│    │                                                      │
│    ▼                                                      │
│  PostgreSQL WAL (Write-Ahead Log)                         │
│    │                                                      │
│    │  Debezium reads WAL entries                          │
│    ▼                                                      │
│  Debezium Connector                                       │
│    │                                                      │
│    │  Publishes outbox inserts to Kafka                   │
│    ▼                                                      │
│  Kafka Topic                                              │
└──────────────────────────────────────────────────────────┘
```

**Debezium outbox connector configuration:**

```json
{
  "name": "outbox-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "secret",
    "database.dbname": "orders",
    "database.server.name": "orders-db",
    "table.include.list": "public.outbox",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.table.field.event.id": "id",
    "transforms.outbox.table.field.event.key": "aggregate_id",
    "transforms.outbox.table.field.event.type": "event_type",
    "transforms.outbox.table.field.event.payload": "payload",
    "transforms.outbox.route.by.field": "aggregate_type",
    "transforms.outbox.route.topic.replacement": "${routedByValue}-events"
  }
}
```

**Advantages of CDC over polling:**
- No polling delay — events are published as soon as the WAL entry is written
- No load on the database from polling queries
- Guaranteed ordering (WAL order = publication order)
- Debezium handles checkpointing and crash recovery

**Disadvantages:**
- Additional infrastructure (Debezium, Kafka Connect)
- More complex operational story
- WAL retention must be configured carefully

## Exactly-Once Across External Systems

When the consumer writes to an external system (not Kafka), achieving exactly-once requires the external system to support at least one of:

### Pattern 1: Idempotent Writes

Make the external write idempotent so duplicates are harmless:

```typescript
// External API that supports idempotency keys
async function processPayment(event: PaymentEvent): Promise<void> {
  await stripeClient.paymentIntents.create({
    amount: event.amount,
    currency: event.currency,
    customer: event.customerId,
    idempotency_key: event.eventId, // Stripe deduplicates by this key
  });
}
```

### Pattern 2: Transactional Offset Storage

Store the Kafka offset in the same transaction as the business logic:

```typescript
async function processWithStoredOffset(
  message: KafkaMessage,
  partition: number,
  topic: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if we've already processed past this offset
    const { rows } = await client.query(
      `SELECT committed_offset FROM consumer_offsets
       WHERE topic = $1 AND partition = $2 AND consumer_group = $3`,
      [topic, partition, 'order-processor']
    );

    const lastOffset = rows[0]?.committed_offset ?? '-1';

    if (BigInt(message.offset) <= BigInt(lastOffset)) {
      // Already processed — skip
      await client.query('ROLLBACK');
      return;
    }

    // Process business logic
    const order = JSON.parse(message.value!.toString());
    await client.query(
      `INSERT INTO orders (id, data) VALUES ($1, $2)`,
      [order.id, message.value!.toString()]
    );

    // Store offset in the same transaction
    await client.query(
      `INSERT INTO consumer_offsets (topic, partition, consumer_group, committed_offset)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (topic, partition, consumer_group)
       DO UPDATE SET committed_offset = $4`,
      [topic, partition, 'order-processor', message.offset]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

This pattern means you don't commit offsets to Kafka at all — you manage them in your database. On restart, the consumer reads the last committed offset from the database and seeks to that position.

### Pattern 3: Two-Phase Approach with Compensation

When the external system doesn't support idempotency or transactions, use a two-phase approach with compensation:

```typescript
// Phase 1: Create a reservation
const reservation = await externalService.createReservation({
  orderId: order.id,
  items: order.items,
});

// Phase 2: Confirm or cancel based on success
try {
  await processOrderInDatabase(order);
  await externalService.confirmReservation(reservation.id);
} catch (error) {
  await externalService.cancelReservation(reservation.id);
  throw error;
}
```

## Comparison of Approaches

| Approach | Scope | Overhead | Complexity | When to Use |
|----------|-------|----------|------------|-------------|
| Idempotent Producer | Producer→Broker | Low | Low | Always enable |
| Kafka Transactions | Kafka→Kafka | Medium | Medium | Stream processing within Kafka |
| Deduplication Table | Kafka→Database | Medium | Medium | Most common consumer pattern |
| Transactional Outbox | Database→Kafka | Medium | Medium | Database as source of truth |
| CDC Outbox | Database→Kafka | Low (runtime) | High (setup) | High throughput, low latency |
| External Idempotency Keys | Kafka→External API | Low | Low | When external API supports it |
| Stored Offsets | Kafka→Database | Medium | Medium | When consumer manages own offsets |

## Testing Exactly-Once Guarantees

### Chaos Testing Framework

```typescript
import { Kafka, Producer, Consumer } from 'kafkajs';

class ExactlyOnceTest {
  private producer: Producer;
  private consumer: Consumer;
  private processedCounts: Map<string, number> = new Map();

  async runChaosTest(messageCount: number): Promise<TestResult> {
    // Produce messages with unique IDs
    for (let i = 0; i < messageCount; i++) {
      await this.producer.send({
        topic: 'test-exactly-once',
        messages: [{
          key: `msg-${i}`,
          value: JSON.stringify({ id: `msg-${i}`, value: i }),
          headers: { 'message-id': `msg-${i}` },
        }],
      });
    }

    // Run consumer with random failures injected
    let restartCount = 0;

    while (this.processedCounts.size < messageCount) {
      try {
        await this.runConsumerWithChaos();
      } catch (error) {
        restartCount++;
        console.log(`Consumer crashed (restart #${restartCount}): ${error}`);
        // Consumer will restart and reprocess from last committed offset
      }
    }

    // Verify exactly-once processing
    let duplicates = 0;
    let missed = 0;

    for (let i = 0; i < messageCount; i++) {
      const count = this.processedCounts.get(`msg-${i}`) || 0;
      if (count > 1) duplicates++;
      if (count === 0) missed++;
    }

    return {
      totalMessages: messageCount,
      uniqueProcessed: this.processedCounts.size,
      duplicates,
      missed,
      restarts: restartCount,
      exactlyOnce: duplicates === 0 && missed === 0,
    };
  }

  private async runConsumerWithChaos(): Promise<void> {
    // Randomly crash after processing 10-50 messages
    const crashAfter = 10 + Math.floor(Math.random() * 40);
    let processed = 0;

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        processed++;

        if (processed >= crashAfter) {
          throw new Error('Simulated crash');
        }

        const messageId = message.headers?.['message-id']?.toString();
        if (!messageId) return;

        // Track processing count
        const currentCount = this.processedCounts.get(messageId) || 0;
        this.processedCounts.set(messageId, currentCount + 1);

        // Commit offset
        await this.consumer.commitOffsets([{
          topic,
          partition,
          offset: (BigInt(message.offset) + 1n).toString(),
        }]);
      },
    });
  }
}

interface TestResult {
  totalMessages: number;
  uniqueProcessed: number;
  duplicates: number;
  missed: number;
  restarts: number;
  exactlyOnce: boolean;
}
```

## Decision Framework

Use this decision tree to choose your exactly-once strategy:

```
Start
  │
  ├── Is the consumer writing to Kafka? (stream processing)
  │   └── YES → Use Kafka Transactions
  │
  ├── Is the consumer writing to a database?
  │   ├── Can you store offsets in the same DB transaction?
  │   │   └── YES → Use Stored Offsets pattern
  │   └── Otherwise → Use Deduplication Table
  │
  ├── Is the consumer calling an external API?
  │   ├── Does the API support idempotency keys?
  │   │   └── YES → Use External Idempotency Keys
  │   └── NO → Use Reservation + Compensation
  │
  └── Is the database the source of truth for events?
      └── YES → Use Transactional Outbox (polling or CDC)
```

## Further Reading

- [Kafka Internals](/system-design/message-queues/kafka-internals) — Deep dive into the storage and replication that enables transactions
- [Dead Letter Queues](/system-design/message-queues/dead-letter-queues) — What happens when messages fail even with exactly-once guarantees
- [Ordering Guarantees](/system-design/message-queues/ordering-guarantees) — How ordering interacts with exactly-once semantics
- [Distributed Transactions](/system-design/distributed-systems/distributed-transactions) — The broader context of atomicity across systems
- [Queue Selection Guide](/system-design/message-queues/queue-selection-guide) — How exactly-once support varies across message brokers
