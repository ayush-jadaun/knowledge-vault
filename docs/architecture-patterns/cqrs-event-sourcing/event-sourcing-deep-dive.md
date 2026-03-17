---
title: "Event Sourcing Deep Dive"
description: "Complete guide to Event Sourcing — events as immutable facts, event store design, optimistic concurrency, projections, and full PostgreSQL implementation in TypeScript."
tags: [event-sourcing, event-store, projections, typescript, postgresql, ddd]
difficulty: "intermediate"
prerequisites: ["cqrs-event-sourcing/index", "cqrs-event-sourcing/cqrs-deep-dive"]
lastReviewed: "2026-03-17"
---

# Event Sourcing Deep Dive

## Events as Facts: The Fundamental Shift

Event Sourcing is built on one radical realization: **a sequence of facts that describe what happened is more valuable than the current state derived from them.**

Every other storage mechanism discards history to serve the present. A relational database stores the current state of rows. An object database stores the current state of objects. Redis stores the current value of keys. These systems treat history as implementation detail — a means to an end. The current state is the truth.

Event Sourcing inverts this. **Events are the truth. Current state is a cache.**

This isn't an arbitrary philosophical position. It has concrete consequences:

- You can compute current state at any time from the events.
- You can compute past state (at time T) by replaying events up to that point.
- You can compute alternative views of state by creating new projections that replay all events.
- You can detect bugs by comparing what the events say should have happened with what actually happened.
- You cannot accidentally overwrite or corrupt data — events are immutable, so the worst that can happen is an incorrect new event gets appended.

The conceptual model is close to how humans actually think about history. "What is Alice's bank balance?" is not a question about a current value in a database cell. It's a question about the result of a sequence of events: she deposited X, withdrew Y, received Z in interest. The balance is derived from the events. If you want to audit the balance, you look at the events, not just the number.

### Historical Precedent

The idea is ancient. Double-entry bookkeeping, invented in 13th-century Italy, is event sourcing: every financial transaction is recorded as an event (a journal entry), and account balances are computed by summing the relevant entries. You never modify a posted journal entry — you post a correcting entry. The journal is append-only. The balance sheet is a projection.

Git is event sourcing: every commit is an immutable event (a delta), and the current state of the repository is computed by replaying commits. You cannot modify history without cryptographic evidence of tampering (the SHA chain breaks). `git log` is a query against the event history. `git blame` is a temporal query.

## Event Store Requirements

An event store must provide:

1. **Append-only writes**: Events are never modified or deleted after writing.
2. **Ordered per aggregate**: Events for a given aggregate are guaranteed to come out in the order they went in.
3. **Optimistic concurrency control**: When appending, you can specify the version you expect the aggregate to be at. If it's changed (concurrent write), the append fails.
4. **Efficient aggregate reads**: Load all events for an aggregate in order.
5. **Subscriptions**: Notify consumers of new events (catch-up and live).
6. **Global ordering** (optional but important for projections): A global sequence number or position across all aggregates.

A PostgreSQL-backed event store can satisfy all of these requirements, making it a practical choice for teams that don't want to introduce EventStoreDB as an additional infrastructure dependency.

## Event Schema Design

Every stored event has metadata (the envelope) and a payload (the domain-specific data).

```typescript
// The envelope — required for every event
interface StoredEvent {
  // Identity
  eventId: string          // UUID, globally unique
  streamId: string         // Aggregate ID (e.g., "order-42")
  streamType: string       // Aggregate type (e.g., "Order")

  // Ordering
  streamVersion: number    // Position within the stream, starts at 1
  globalPosition: bigint   // Global position across all streams

  // Classification
  eventType: string        // Event class name (e.g., "OrderPlaced")
  schemaVersion: number    // For upcasting — which version of this event type

  // Timing
  createdAt: Date          // When the event was stored (wall clock)
  occurredAt: Date         // When the event logically occurred (business time)

  // Payload
  data: Record<string, unknown>      // The actual event payload
  metadata: Record<string, unknown>  // Correlation ID, causation ID, user ID, etc.
}

// Domain event — what your application works with
interface DomainEvent {
  readonly type: string
  readonly occurredAt: Date
}

// Example domain events
interface OrderPlacedEvent extends DomainEvent {
  readonly type: 'OrderPlaced'
  readonly orderId: string
  readonly customerId: string
  readonly items: Array<{
    productId: string
    quantity: number
    unitPrice: number
  }>
  readonly shippingAddressId: string
  readonly total: number
}

interface OrderCancelledEvent extends DomainEvent {
  readonly type: 'OrderCancelled'
  readonly orderId: string
  readonly reason: string
  readonly cancelledBy: string
  readonly refundAmount: number
}

interface OrderShippedEvent extends DomainEvent {
  readonly type: 'OrderShipped'
  readonly orderId: string
  readonly trackingNumber: string
  readonly carrier: string
  readonly estimatedDelivery: Date
}
```

## The PostgreSQL Event Store: Full Implementation

```typescript
// event-store.ts

import { Pool, PoolClient } from 'pg'

export class ConcurrencyError extends Error {
  constructor(
    public readonly streamId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Concurrency conflict on stream ${streamId}: ` +
      `expected version ${expectedVersion}, actual version ${actualVersion}`
    )
    this.name = 'ConcurrencyError'
  }
}

export interface AppendOptions {
  expectedVersion: number  // -1 means "stream must not exist"; 0+ means specific version
}

export interface EventFilter {
  streamType?: string
  fromGlobalPosition?: bigint
  toGlobalPosition?: bigint
  limit?: number
}

export interface SubscriptionHandler {
  onEvent(event: StoredEvent): Promise<void>
  onError(error: Error): void
}

export interface EventStore {
  append(
    streamId: string,
    streamType: string,
    events: DomainEvent[],
    options: AppendOptions
  ): Promise<StoredEvent[]>

  loadStream(streamId: string, fromVersion?: number): Promise<StoredEvent[]>

  loadStreamUpToVersion(streamId: string, toVersion: number): Promise<StoredEvent[]>

  subscribe(
    fromGlobalPosition: bigint,
    handler: SubscriptionHandler,
    filter?: EventFilter
  ): Promise<Subscription>

  getStreamVersion(streamId: string): Promise<number>
}

export class PostgresEventStore implements EventStore {
  constructor(private pool: Pool) {}

  async append(
    streamId: string,
    streamType: string,
    events: DomainEvent[],
    options: AppendOptions
  ): Promise<StoredEvent[]> {
    if (events.length === 0) return []

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      // Get current stream version with exclusive lock
      const versionResult = await client.query<{ current_version: number }>(
        `SELECT COALESCE(MAX(stream_version), 0) as current_version
         FROM events
         WHERE stream_id = $1
         FOR UPDATE`,  // Row-level lock prevents concurrent appends
        [streamId]
      )
      const currentVersion = versionResult.rows[0]?.current_version ?? 0

      // Optimistic concurrency check
      if (options.expectedVersion === -1) {
        // Expect stream to not exist
        if (currentVersion > 0) {
          throw new ConcurrencyError(streamId, -1, currentVersion)
        }
      } else if (currentVersion !== options.expectedVersion) {
        throw new ConcurrencyError(streamId, options.expectedVersion, currentVersion)
      }

      // Insert events
      const storedEvents: StoredEvent[] = []
      for (let i = 0; i < events.length; i++) {
        const event = events[i]
        const streamVersion = currentVersion + i + 1
        const eventId = crypto.randomUUID()

        const result = await client.query<StoredEvent>(
          `INSERT INTO events (
            event_id, stream_id, stream_type, stream_version,
            event_type, schema_version, occurred_at, data, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *, global_position`,
          [
            eventId,
            streamId,
            streamType,
            streamVersion,
            event.type,
            1,  // Schema version — see upcasting page
            event.occurredAt.toISOString(),
            JSON.stringify(event),
            JSON.stringify({})  // Metadata — correlation ID, user ID, etc.
          ]
        )
        storedEvents.push(result.rows[0])
      }

      await client.query('COMMIT')
      return storedEvents
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async loadStream(streamId: string, fromVersion: number = 1): Promise<StoredEvent[]> {
    const result = await this.pool.query<StoredEvent>(
      `SELECT event_id, stream_id, stream_type, stream_version,
              global_position, event_type, schema_version,
              occurred_at, created_at, data, metadata
       FROM events
       WHERE stream_id = $1 AND stream_version >= $2
       ORDER BY stream_version ASC`,
      [streamId, fromVersion]
    )
    return result.rows
  }

  async loadStreamUpToVersion(streamId: string, toVersion: number): Promise<StoredEvent[]> {
    const result = await this.pool.query<StoredEvent>(
      `SELECT * FROM events
       WHERE stream_id = $1 AND stream_version <= $2
       ORDER BY stream_version ASC`,
      [streamId, toVersion]
    )
    return result.rows
  }

  async getStreamVersion(streamId: string): Promise<number> {
    const result = await this.pool.query<{ version: number }>(
      `SELECT COALESCE(MAX(stream_version), 0) as version
       FROM events WHERE stream_id = $1`,
      [streamId]
    )
    return result.rows[0].version
  }

  async subscribe(
    fromGlobalPosition: bigint,
    handler: SubscriptionHandler,
    filter?: EventFilter
  ): Promise<Subscription> {
    return new CatchUpSubscription(this.pool, fromGlobalPosition, handler, filter)
  }
}

// Database schema
const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  global_position  BIGSERIAL PRIMARY KEY,
  event_id         UUID NOT NULL UNIQUE,
  stream_id        TEXT NOT NULL,
  stream_type      TEXT NOT NULL,
  stream_version   INTEGER NOT NULL,
  event_type       TEXT NOT NULL,
  schema_version   INTEGER NOT NULL DEFAULT 1,
  occurred_at      TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data             JSONB NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT events_stream_version_unique
    UNIQUE (stream_id, stream_version)
);

CREATE INDEX IF NOT EXISTS events_stream_id_idx
  ON events (stream_id, stream_version);

CREATE INDEX IF NOT EXISTS events_event_type_idx
  ON events (event_type);

CREATE INDEX IF NOT EXISTS events_stream_type_idx
  ON events (stream_type, global_position);

CREATE INDEX IF NOT EXISTS events_occurred_at_idx
  ON events (occurred_at);
`
```

## Loading an Aggregate: Event Replay

The core operation of event sourcing: rebuild aggregate state by replaying events.

```typescript
// aggregate-repository.ts

export interface EventSourcedAggregate {
  readonly id: string
  readonly version: number
  readonly uncommittedEvents: DomainEvent[]
  applyEvent(event: DomainEvent): void
  clearUncommittedEvents(): void
}

export class AggregateRepository<T extends EventSourcedAggregate> {
  constructor(
    private eventStore: EventStore,
    private factory: AggregateFactory<T>
  ) {}

  async load(id: string): Promise<T | null> {
    const streamId = this.factory.streamId(id)
    const events = await this.eventStore.loadStream(streamId)

    if (events.length === 0) return null

    // Reconstitute aggregate by replaying events
    const aggregate = this.factory.create(id)
    for (const storedEvent of events) {
      const domainEvent = this.deserialize(storedEvent)
      aggregate.applyEvent(domainEvent)
    }

    return aggregate
  }

  async save(aggregate: T): Promise<void> {
    const uncommitted = aggregate.uncommittedEvents
    if (uncommitted.length === 0) return

    const streamId = this.factory.streamId(aggregate.id)
    const expectedVersion = aggregate.version - uncommitted.length

    await this.eventStore.append(
      streamId,
      this.factory.streamType,
      uncommitted,
      { expectedVersion }
    )

    aggregate.clearUncommittedEvents()
  }

  private deserialize(stored: StoredEvent): DomainEvent {
    // Deserialize data field back to typed event
    // Upcasting happens here — see event-upcasting page
    return stored.data as DomainEvent
  }
}
```

## Optimistic Concurrency Control

Concurrency control is the mechanism that prevents two simultaneous writes from corrupting aggregate state. Event sourcing uses **optimistic concurrency** — assume no conflict, verify at append time.

The protocol:

1. Load aggregate events (version = N after loading)
2. Apply command — generates new events
3. Attempt to append new events with `expectedVersion = N`
4. Database checks: is the current stream version still N?
   - Yes: append succeeds, stream is now at version N + number of new events
   - No: another writer appended since we loaded — throw `ConcurrencyError`

```typescript
// In a command handler
async function handleTransferMoney(command: TransferMoneyCommand): Promise<void> {
  let retries = 0
  const maxRetries = 3

  while (retries < maxRetries) {
    try {
      // Load current state
      const account = await accountRepository.load(command.accountId)
      if (!account) throw new NotFoundError('Account not found')

      // Apply command — may throw if business rule violated
      account.transferMoney(command.amount, command.destinationAccountId)

      // Save — may throw ConcurrencyError
      await accountRepository.save(account)
      return

    } catch (error) {
      if (error instanceof ConcurrencyError && retries < maxRetries - 1) {
        retries++
        // Brief backoff before retry
        await new Promise(resolve => setTimeout(resolve, 10 * Math.pow(2, retries)))
        continue
      }
      throw error
    }
  }
}
```

::: warning Retry Carefully
Retrying on `ConcurrencyError` is appropriate for commands that don't have side effects beyond the aggregate (e.g., balance transfers between accounts in the same aggregate). For commands that trigger external side effects (email, payment gateway calls), retry logic must be idempotent at the application level.
:::

## Catch-Up Subscriptions

Projectors need to stay synchronized with the event store. The catch-up subscription pattern:

1. Projector tracks its last processed `globalPosition`.
2. On startup (or after a gap), projector asks the event store for all events after its last position.
3. Projector processes events in order, updating its checkpoint after each batch.
4. Once caught up, the projector transitions to live mode (listening for new events).

```typescript
// catch-up-subscription.ts

interface Subscription {
  stop(): Promise<void>
}

class CatchUpSubscription implements Subscription {
  private running = false
  private pollIntervalMs = 100

  constructor(
    private pool: Pool,
    private fromPosition: bigint,
    private handler: SubscriptionHandler,
    private filter?: EventFilter
  ) {}

  async start(): Promise<void> {
    this.running = true
    let currentPosition = this.fromPosition

    while (this.running) {
      try {
        const events = await this.fetchEvents(currentPosition)

        if (events.length === 0) {
          // Caught up — wait before polling again
          await this.sleep(this.pollIntervalMs)
          continue
        }

        for (const event of events) {
          await this.handler.onEvent(event)
          currentPosition = event.globalPosition + 1n
        }

      } catch (error) {
        this.handler.onError(error as Error)
        await this.sleep(this.pollIntervalMs * 5)
      }
    }
  }

  private async fetchEvents(fromPosition: bigint): Promise<StoredEvent[]> {
    let query = `
      SELECT * FROM events
      WHERE global_position >= $1
    `
    const params: unknown[] = [fromPosition]
    let paramIndex = 2

    if (this.filter?.streamType) {
      query += ` AND stream_type = $${paramIndex++}`
      params.push(this.filter.streamType)
    }

    if (this.filter?.eventType) {
      query += ` AND event_type = $${paramIndex++}`
      params.push(this.filter.eventType)
    }

    query += ` ORDER BY global_position ASC LIMIT 500`

    const result = await this.pool.query<StoredEvent>(query, params)
    return result.rows
  }

  async stop(): Promise<void> {
    this.running = false
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Projector with checkpoint persistence
class ProjectorRunner {
  constructor(
    private eventStore: EventStore,
    private projector: Projector,
    private checkpointStore: CheckpointStore
  ) {}

  async run(): Promise<void> {
    const lastCheckpoint = await this.checkpointStore.get(this.projector.name)
    const fromPosition = lastCheckpoint?.globalPosition ?? 0n

    const subscription = await this.eventStore.subscribe(fromPosition, {
      onEvent: async (event) => {
        await this.projector.handle(event)
        await this.checkpointStore.save(this.projector.name, event.globalPosition)
      },
      onError: (error) => {
        console.error(`Projector ${this.projector.name} error:`, error)
        // Alert monitoring
      }
    })

    // Keep running until told to stop
    process.on('SIGTERM', () => subscription.stop())
  }
}
```

## Domain Events vs Integration Events vs Storage Events

These three concepts are often conflated, causing architectural confusion.

**Domain Events** are facts about what happened within a bounded context, expressed in the domain's ubiquitous language. They are internal implementation details of a service.

```typescript
// Domain event — internal to the Order bounded context
interface OrderPlacedEvent {
  type: 'OrderPlaced'
  orderId: string
  customerId: string  // Internal customer ID
  items: OrderItem[]
  total: Money
}
```

**Integration Events** cross bounded context boundaries. They are contracts between services. They use IDs that are stable across service boundaries and contain only the data the receiving service needs.

```typescript
// Integration event — crosses service boundaries
// The Shipping service subscribes to this; it doesn't care about Order internals
interface OrderReadyForShipmentIntegrationEvent {
  type: 'OrderReadyForShipment'
  orderId: string
  customerId: string
  shippingAddress: Address
  items: Array<{
    sku: string       // SKU is stable across services; internal IDs are not
    weight: number
    quantity: number
  }>
  requestedDeliveryDate?: string
}
```

**Storage Events** are the actual records in the event store. They are the serialized form of domain events, wrapped in metadata.

```
StoredEvent {
  globalPosition: 10042,
  eventId: "uuid",
  streamId: "order-42",
  eventType: "OrderPlaced",
  data: { ...OrderPlacedEvent payload... },
  metadata: { correlationId: "...", causationId: "...", userId: "..." }
}
```

The translation: Domain Events → (upcasted if needed) → Storage Events in the event store. Storage Events → (deserialized) → Domain Events in projections and aggregates. Domain Events → (translated) → Integration Events for cross-service communication.

## Temporal Queries

One of event sourcing's most powerful capabilities: answering "what was the state at time T?"

```typescript
// Load aggregate state as of a specific timestamp
async function getOrderStateAt(orderId: string, asOf: Date): Promise<OrderState> {
  const allEvents = await eventStore.loadStream(`order-${orderId}`)

  // Filter to events that occurred before or at the target time
  const eventsUpToTime = allEvents.filter(e => e.occurredAt <= asOf)

  // Replay only those events
  const order = new Order(orderId)
  for (const event of eventsUpToTime) {
    order.applyEvent(event.data as DomainEvent)
  }

  return order.state
}

// Even more powerful: load state as of a specific event version
async function getOrderStateAtVersion(orderId: string, version: number): Promise<OrderState> {
  const events = await eventStore.loadStreamUpToVersion(`order-${orderId}`, version)
  const order = new Order(orderId)
  for (const event of events) {
    order.applyEvent(event.data as DomainEvent)
  }
  return order.state
}
```

This capability is invaluable for:
- **Regulatory compliance**: "What was the customer's account status at the time of this transaction?"
- **Debugging**: "What state was the order in when the shipment label was created?"
- **Dispute resolution**: "What did the order look like when the customer complained?"

## Audit Log for Free

With event sourcing, you get a complete audit log as a natural byproduct. Every state change is an event with metadata:

```typescript
interface EventMetadata {
  correlationId: string    // Links all events caused by the same external request
  causationId: string      // The specific command or event that caused this event
  userId?: string          // Who initiated the action
  userAgent?: string       // How they initiated it (API, UI, batch job)
  ipAddress?: string
  environment: string      // Production, staging, etc.
}
```

Building a human-readable audit log is simply a projection over the event stream:

```typescript
class AuditLogProjector {
  async on(event: StoredEvent): Promise<void> {
    const description = this.describeEvent(event)
    const userId = event.metadata.userId

    await this.db.execute(
      `INSERT INTO audit_log (event_id, entity_type, entity_id, action, user_id, occurred_at, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.eventId,
        event.streamType,
        event.streamId,
        event.eventType,
        userId ?? 'system',
        event.occurredAt,
        description
      ]
    )
  }

  private describeEvent(event: StoredEvent): string {
    switch (event.eventType) {
      case 'OrderPlaced':
        return `Order placed with ${(event.data as any).items.length} items, total ${(event.data as any).total}`
      case 'OrderCancelled':
        return `Order cancelled: ${(event.data as any).reason}`
      case 'OrderShipped':
        return `Order shipped via ${(event.data as any).carrier}, tracking ${(event.data as any).trackingNumber}`
      default:
        return `${event.eventType} occurred`
    }
  }
}
```

## Process Managers vs Sagas

These terms are often confused. In the context of event sourcing:

**Sagas** (in the Eric Evans/DDD sense, sometimes called "choreography-based sagas"): Each service reacts to events by doing its part and publishing new events. No central coordinator. The saga is "emergent" from the sequence of reactions.

**Process Managers** (sometimes called "orchestration-based sagas"): A stateful object (the process manager) receives events and issues commands. It maintains state across multiple steps. It coordinates the overall flow.

Both are discussed in depth in [Sagas & Process Managers](./sagas-process-managers). The key distinction: sagas know what to do, process managers know who to tell what to do.

## EventStoreDB vs Custom PostgreSQL Event Store

| Aspect | EventStoreDB | PostgreSQL Event Store |
|--------|-------------|----------------------|
| Purpose-built | Yes — optimized for events | No — general purpose |
| Global ordering | Built-in with $all stream | Via BIGSERIAL column |
| Subscriptions | Native server-side push | Polling or LISTEN/NOTIFY |
| Projections | Built-in projection engine | Custom code |
| Throughput | 20,000+ events/second | 2,000-5,000/second |
| Operational complexity | New infrastructure to operate | Already using PostgreSQL |
| ACID guarantees | Eventual within cluster | Full ACID |
| Tooling maturity | Mature, EventStoreDB-specific | Excellent PostgreSQL tooling |
| Best for | High-throughput, event-native teams | Teams already on PostgreSQL |

**Recommendation**: Start with PostgreSQL. The throughput difference only matters at scale you probably don't have yet. Migrate to EventStoreDB if you hit the limits.

## Mathematical Foundation: Event Sourcing as a Monoidal Fold

Event sourcing can be formally expressed as a **left fold** over a monoid:

$$\text{State} = \bigoplus_{i=1}^{n} \text{apply}(\text{initial}, e_i)$$

More precisely, if we define:
- $S$ as the set of all possible aggregate states
- $E$ as the set of all domain events
- $\text{apply}: S \times E \rightarrow S$ as the state transition function

Then the current state after $n$ events is:

$$s_n = \text{foldl}(\text{apply}, s_0, [e_1, e_2, ..., e_n])$$

This is a **left fold** (not right fold) because the order matters — applying events in order 1, 2, 3 is not the same as 3, 2, 1.

The aggregate state transitions form a **state machine**:

$$s_0 \xrightarrow{e_1} s_1 \xrightarrow{e_2} s_2 \xrightarrow{e_3} s_3$$

The event store provides the formal guarantee that the sequence $[e_1, e_2, ..., e_n]$ is total order within a stream — every element has a well-defined position, and the sequence is determined (no ambiguity about which comes before which).

### Snapshot as Memoization

A snapshot is memoization of the fold up to a given position:

$$\text{snapshot}(n) = \text{foldl}(\text{apply}, s_0, [e_1, ..., e_n])$$

Loading with snapshot:

$$s_m = \text{foldl}(\text{apply}, \text{snapshot}(n), [e_{n+1}, ..., e_m])$$

This reduces replay cost from $O(m)$ to $O(m - n)$, where $n$ is the snapshot position.

## Performance Characteristics

### Write Performance

Appending events to PostgreSQL:

| Events per transaction | Throughput (p50) | Throughput (p99) |
|-----------------------|-----------------|-----------------|
| 1 event | ~3,000/s | ~1,200/s |
| 5 events | ~8,000/s | ~3,000/s |
| 10 events | ~12,000/s | ~4,500/s |

The bottleneck is fsync latency. On SSDs, fsync takes 1-3ms; on spinning disks, 7-15ms. This is why PostgreSQL `synchronous_commit = off` (or using AWS Aurora which batches fsyncs) dramatically improves event store write throughput at the cost of up to ~200ms of potential data loss on crash.

### Read Performance

Loading a stream of N events from PostgreSQL:

$$T_{load}(n) \approx T_{query} + n \times T_{deserialize}$$

Typical numbers:
- $T_{query}$: 1-5ms (indexed lookup)
- $T_{deserialize}$: 0.01-0.1ms per event (JSON parsing)
- $T_{apply}$: 0.001-0.05ms per event (pure function)

For a stream of 1,000 events: $\approx 5ms + 1000 \times 0.05ms = 55ms$ end-to-end.

For a stream of 10,000 events: $\approx 5ms + 10000 \times 0.05ms = 505ms$ — this is where snapshots become necessary.

::: info War Story
A billing system at a SaaS company was migrated to event sourcing after a catastrophic data corruption incident. The corruption was caused by a race condition in a batch job that ran monthly to recompute account balances. Because the database stored only current state, the corruption was undetectable until customers started reporting incorrect invoices — two weeks after the batch job had run.

During the migration, they replayed 18 months of billing events and discovered something remarkable: the old system had been silently miscalculating prorated charges for mid-month plan changes since its launch. The error was small (0.3% on affected accounts) and had never been caught because there was no way to verify the computed balance against the raw transaction history.

With event sourcing, the fix was mechanical: correct the calculation logic, replay all events, and issue credits for the difference. Total time from discovery to correction: 4 hours. Without event sourcing, the same correction would have required custom SQL scripts, extensive manual verification, and significant customer service effort — estimated at 2-3 weeks of engineering time.

The billing system now runs at 95% event sourcing coverage (some reference data like pricing tiers still uses CRUD). The team considers it their most reliable subsystem.
:::

## What Constitutes an Event: Design Principles

Good domain events have these properties:

**1. Named in past tense**: `OrderPlaced`, not `PlaceOrder` or `OrderPlacing`.

**2. Immutable**: Once created, the event data never changes. The `data` field is sealed.

**3. Self-contained**: The event contains enough information to reconstruct what happened without looking up additional data. Don't store only IDs when you need the actual values.

```typescript
// BAD: Forces projector to look up product name by ID
interface OrderItemAddedEvent {
  type: 'OrderItemAdded'
  orderId: string
  productId: string    // Projector has to join to get the name
  quantity: number
}

// GOOD: Self-contained snapshot of what the data was at the time
interface OrderItemAddedEvent {
  type: 'OrderItemAdded'
  orderId: string
  productId: string
  productName: string  // Denormalized at write time
  sku: string
  quantity: number
  unitPrice: number    // The price at time of order, not current price
}
```

**4. Business-meaningful**: Events describe domain concepts, not technical operations.

```typescript
// BAD: Technical event
interface RowUpdatedEvent {
  type: 'RowUpdated'
  tableName: 'orders'
  column: 'status'
  oldValue: 'pending'
  newValue: 'shipped'
}

// GOOD: Business event
interface OrderShippedEvent {
  type: 'OrderShipped'
  orderId: string
  trackingNumber: string
  carrier: 'FedEx' | 'UPS' | 'USPS' | 'DHL'
  shippedAt: Date
}
```

**5. Fine-grained**: Prefer multiple small events over one large generic event.

```typescript
// BAD: One event for everything
interface OrderUpdatedEvent {
  type: 'OrderUpdated'
  changes: Record<string, unknown>
}

// GOOD: Specific events for each state transition
type OrderEvent =
  | OrderPlacedEvent
  | OrderConfirmedEvent
  | OrderPickedEvent
  | OrderPackedEvent
  | OrderShippedEvent
  | OrderDeliveredEvent
  | OrderCancelledEvent
  | OrderRefundedEvent
```

## Decision Framework

| Use Case | Event Sourcing? | Rationale |
|----------|----------------|-----------|
| Financial transactions | Always | Audit trail is mandatory; temporal queries essential |
| Order management | Yes | Multi-step lifecycle; debugging value high |
| User profiles | Maybe | If audit trail needed; otherwise CRUD is simpler |
| Session storage | No | Transient data; history has no value |
| Configuration store | No | Read-heavy, rare writes; CRUD + versioning sufficient |
| Product catalog | No | CRUD with edit history is simpler |
| Workflow/process tracking | Yes | Long-running processes; step tracking essential |
| Analytics events | Yes (but append-only log, not ES) | Clickstream needs append-only, not aggregate replay |
| Chat messages | No | Append-only log; no aggregates to reconstitute |

## Advanced: Event Sourcing Without a Framework

Teams new to event sourcing often reach for a framework immediately. The value of building a minimal implementation first: you understand what the framework is doing, making debugging and customization far easier.

The minimal implementation is 200 lines of TypeScript:

1. `events` table with the schema above
2. `append()` function with optimistic concurrency
3. `loadStream()` function
4. `AggregateRoot` base class with `apply()` and `uncommittedEvents`
5. `AggregateRepository` with `load()` and `save()`

Everything else — snapshots, projections, subscriptions, catch-up — is built on top of these primitives. Add complexity only when you have the specific problem it solves.
