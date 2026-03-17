---
title: "CQRS Deep Dive"
description: "Complete guide to Command Query Responsibility Segregation — commands, queries, handlers, read models, synchronization, and production TypeScript implementation."
tags: [cqrs, commands, queries, read-models, event-driven, typescript]
difficulty: "intermediate"
prerequisites: ["cqrs-event-sourcing/index", "domain-driven-design"]
lastReviewed: "2026-03-17"
---

# CQRS Deep Dive

## Why Greg Young Created CQRS

In 2010, Greg Young published a document titled "CQRS Documents" that crystallized an architectural insight he and Udi Dahan had been developing through real project work. The motivation was not academic — it came from the pain of building complex financial and order management systems where the tension between the write model and read model was causing concrete, measurable problems.

The core observation: **the shape of data you need to write is almost never the shape of data you need to read.**

Consider an e-commerce order. When writing, you care about:
- Is this customer allowed to place an order? (credit check, fraud detection)
- Is the inventory available?
- Are the payment details valid?
- Do the prices match the current catalog?
- Does this violate any business rules (minimum order value, restricted items by region)?

When reading, you care about:
- Show me all orders for customer 42, sorted by date, with product images, category names, and current shipment status.
- Show me today's orders for the fulfillment team, grouped by warehouse zone, with item weights for shipping calculation.
- Show me the monthly revenue by product category for the finance dashboard.

These are completely different access patterns. The normalized domain model that enforces write-time invariants — orders reference products by ID, quantities are validated against inventory tables, customer references are foreign keys — requires 6-8 joins to serve the first read query and 12+ joins with aggregations for the third.

Traditional architecture forces you to make a choice: optimize the schema for writes (and pay the join cost on reads) or denormalize for reads (and pay the consistency cost on writes). CQRS says: stop choosing. Have separate models.

### The Bertrand Meyer Connection

CQRS is named after Bertrand Meyer's **Command Query Separation** (CQS) principle from his 1988 book "Object-Oriented Software Construction." Meyer's principle operates at the method level:

> Every method should either be a command that performs an action, or a query that returns data to the caller, but not both.

In other words, asking a question should not change the answer. `getBalance()` should not have side effects. `transfer(amount)` should not return anything (or return only success/failure status).

CQRS takes this principle to the architectural level: separate the read stack from the write stack entirely.

## The Command Side

### What Is a Command?

A command is a request to change state. Commands are:

- **Named in the imperative mood**: `PlaceOrder`, `CancelReservation`, `UpdateShippingAddress`
- **Targeted at a specific aggregate**: `PlaceOrder` targets an `Order` aggregate; `ApproveApplication` targets a `LoanApplication` aggregate
- **Rejected if invalid**: Commands can fail if business rules are violated
- **Handled once**: Each command is processed exactly once by exactly one handler

Commands are **not events**. An event is a fact about something that happened in the past. A command is a request that may or may not succeed.

```typescript
// Commands — requests to change state
interface PlaceOrderCommand {
  readonly type: 'PlaceOrder'
  readonly customerId: string
  readonly items: Array<{ productId: string; quantity: number; unitPrice: number }>
  readonly shippingAddress: Address
  readonly correlationId: string  // For tracing
}

interface CancelOrderCommand {
  readonly type: 'CancelOrder'
  readonly orderId: string
  readonly reason: string
  readonly cancelledBy: string
}

// Base command type
interface Command {
  readonly type: string
  readonly correlationId: string
}
```

### Command Validation: Two Layers

Command validation happens at two distinct layers, and confusing them is a common mistake:

**Application layer validation** (in the command handler): Checks that can be done without business logic — input format, required fields, ID existence. This is cheap and fast.

**Domain layer validation** (in the aggregate): Enforces business invariants. This is where the real logic lives.

```typescript
// Application layer validation
class PlaceOrderCommandHandler {
  async handle(command: PlaceOrderCommand): Promise<void> {
    // Application layer: structural validation
    if (!command.customerId) {
      throw new ValidationError('customerId is required')
    }
    if (command.items.length === 0) {
      throw new ValidationError('Order must have at least one item')
    }
    if (!isValidAddress(command.shippingAddress)) {
      throw new ValidationError('Invalid shipping address format')
    }

    // Application layer: existence checks
    const customer = await this.customerRepository.findById(command.customerId)
    if (!customer) {
      throw new NotFoundError(`Customer ${command.customerId} not found`)
    }

    // Load domain aggregate
    const order = Order.create()

    // Domain layer validation happens inside the aggregate
    // The aggregate enforces invariants and raises domain events
    order.place({
      customer,
      items: command.items,
      shippingAddress: command.shippingAddress
    })

    // Persist
    await this.orderRepository.save(order)
  }
}
```

### The Command Bus Pattern

A **command bus** is a dispatcher that routes commands to their handlers. It is the entry point for the entire command side.

```typescript
// Command handler interface
interface CommandHandler<TCommand extends Command> {
  handle(command: TCommand): Promise<void>
}

// Command bus interface
interface CommandBus {
  dispatch<TCommand extends Command>(command: TCommand): Promise<void>
  register<TCommand extends Command>(
    commandType: TCommand['type'],
    handler: CommandHandler<TCommand>
  ): void
}

// Implementation with middleware support
type CommandMiddleware = (
  command: Command,
  next: (command: Command) => Promise<void>
) => Promise<void>

class InMemoryCommandBus implements CommandBus {
  private handlers = new Map<string, CommandHandler<any>>()
  private middlewares: CommandMiddleware[] = []

  register<TCommand extends Command>(
    commandType: TCommand['type'],
    handler: CommandHandler<TCommand>
  ): void {
    if (this.handlers.has(commandType)) {
      throw new Error(`Handler already registered for ${commandType}`)
    }
    this.handlers.set(commandType, handler)
  }

  use(middleware: CommandMiddleware): void {
    this.middlewares.push(middleware)
  }

  async dispatch<TCommand extends Command>(command: TCommand): Promise<void> {
    const handler = this.handlers.get(command.type)
    if (!handler) {
      throw new Error(`No handler registered for command: ${command.type}`)
    }

    // Build middleware chain
    let index = 0
    const chain = async (cmd: Command): Promise<void> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++]
        await middleware(cmd, chain)
      } else {
        await handler.handle(cmd)
      }
    }

    await chain(command)
  }
}

// Middleware examples
const loggingMiddleware: CommandMiddleware = async (command, next) => {
  const start = Date.now()
  console.log(`Command: ${command.type}`, { correlationId: command.correlationId })
  try {
    await next(command)
    console.log(`Command completed: ${command.type} in ${Date.now() - start}ms`)
  } catch (error) {
    console.error(`Command failed: ${command.type}`, error)
    throw error
  }
}

const transactionMiddleware = (db: Database): CommandMiddleware =>
  async (command, next) => {
    await db.transaction(async () => {
      await next(command)
    })
  }

const idempotencyMiddleware = (store: IdempotencyStore): CommandMiddleware =>
  async (command, next) => {
    const alreadyProcessed = await store.check(command.correlationId)
    if (alreadyProcessed) {
      return  // Skip duplicate
    }
    await next(command)
    await store.mark(command.correlationId)
  }
```

## The Query Side

### What Is a Query?

A query is a request for data. Queries are:

- **Named in the interrogative**: `GetOrderById`, `ListOrdersByCustomer`, `GetOrderSummaryForDashboard`
- **Pure**: No side effects; calling a query twice returns the same result (given no writes occurred)
- **Optimized for the reader**: The response shape is exactly what the UI/consumer needs, no transformation required
- **Not rejected**: Queries always return something (the data, an empty set, or a "not found" indicator)

```typescript
// Queries — requests for data
interface GetOrderByIdQuery {
  readonly type: 'GetOrderById'
  readonly orderId: string
}

interface ListOrdersByCustomerQuery {
  readonly type: 'ListOrdersByCustomer'
  readonly customerId: string
  readonly status?: 'pending' | 'shipped' | 'delivered' | 'cancelled'
  readonly page: number
  readonly pageSize: number
}

interface GetOrderDashboardQuery {
  readonly type: 'GetOrderDashboard'
  readonly dateFrom: Date
  readonly dateTo: Date
  readonly warehouseId?: string
}

// Query results — shaped for the consumer
interface OrderDetailView {
  id: string
  status: string
  placedAt: Date
  customer: {
    id: string
    name: string
    email: string
    tier: 'standard' | 'premium' | 'vip'
  }
  items: Array<{
    productId: string
    productName: string
    categoryName: string
    thumbnailUrl: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
  shipping: {
    address: Address
    estimatedDelivery: Date | null
    trackingNumber: string | null
    carrier: string | null
  }
  totals: {
    subtotal: number
    shippingCost: number
    taxAmount: number
    total: number
  }
}
```

### The Query Bus Pattern

```typescript
// Query handler interface
interface QueryHandler<TQuery, TResult> {
  handle(query: TQuery): Promise<TResult>
}

// Query bus
class QueryBus {
  private handlers = new Map<string, QueryHandler<any, any>>()

  register<TQuery extends { type: string }, TResult>(
    queryType: TQuery['type'],
    handler: QueryHandler<TQuery, TResult>
  ): void {
    this.handlers.set(queryType, handler)
  }

  async dispatch<TQuery extends { type: string }, TResult>(
    query: TQuery
  ): Promise<TResult> {
    const handler = this.handlers.get(query.type)
    if (!handler) {
      throw new Error(`No handler registered for query: ${query.type}`)
    }
    return handler.handle(query)
  }
}

// Query handler implementation — reads directly from the read model
class GetOrderByIdHandler implements QueryHandler<GetOrderByIdQuery, OrderDetailView | null> {
  constructor(private db: ReadDatabase) {}

  async handle(query: GetOrderByIdQuery): Promise<OrderDetailView | null> {
    // Direct query to denormalized read model — no joins needed
    const row = await this.db.queryOne<OrderDetailView>(
      `SELECT * FROM order_detail_view WHERE id = $1`,
      [query.orderId]
    )
    return row
  }
}

class ListOrdersByCustomerHandler
  implements QueryHandler<ListOrdersByCustomerQuery, PaginatedResult<OrderSummaryView>>
{
  constructor(private db: ReadDatabase) {}

  async handle(query: ListOrdersByCustomerQuery): Promise<PaginatedResult<OrderSummaryView>> {
    const offset = (query.page - 1) * query.pageSize

    const [rows, total] = await Promise.all([
      this.db.query<OrderSummaryView>(
        `SELECT id, status, placed_at, item_count, total
         FROM order_summary_view
         WHERE customer_id = $1
           AND ($2::text IS NULL OR status = $2)
         ORDER BY placed_at DESC
         LIMIT $3 OFFSET $4`,
        [query.customerId, query.status ?? null, query.pageSize, offset]
      ),
      this.db.queryScalar<number>(
        `SELECT COUNT(*) FROM order_summary_view
         WHERE customer_id = $1 AND ($2::text IS NULL OR status = $2)`,
        [query.customerId, query.status ?? null]
      )
    ])

    return {
      items: rows,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize)
    }
  }
}
```

## Read Models: The Core of the Query Side

Read models (also called "projections" or "query models") are purpose-built data structures optimized for specific read patterns. They are derived from domain events or from the write model.

### Designing Read Models

The key insight: **design read models backwards from the UI/API response, not forward from the domain model.**

Ask: "What does the consumer need?" Then build exactly that, no more, no less.

```typescript
// Wrong: designing the read model from the domain model
// This just mirrors the normalized domain structure
interface OrderReadModel {
  id: string
  customerId: string      // Still needs to JOIN to get name
  orderLineIds: string[]  // Still needs to JOIN to get product details
  status: string
  createdAt: Date
}

// Right: designing the read model from the consumer's needs
// Everything needed is already there — zero joins
interface OrderListItem {
  id: string
  status: string
  placedAt: Date
  customerName: string     // Pre-joined
  itemCount: number        // Pre-computed
  totalAmount: number      // Pre-computed
  lastUpdatedAt: Date
}

interface OrderDetail {
  id: string
  status: string
  placedAt: Date
  customer: {
    id: string
    name: string
    email: string
  }
  items: Array<{
    productId: string
    productName: string    // Pre-joined
    sku: string
    quantity: number
    unitPrice: number
  }>
  // ... more fields
}
```

### Read Model Storage Options

| Storage | Best For | Tradeoffs |
|---------|----------|-----------|
| PostgreSQL tables | Relational queries, reporting | SQL joins still available; mature tooling |
| PostgreSQL JSONB | Variable schema read models | Flexible but harder to index |
| Redis hash/sorted set | Low-latency lookups, leaderboards | Memory-limited; no complex queries |
| Elasticsearch | Full-text search, faceted filtering | Eventually consistent; operational overhead |
| MongoDB | Document-shaped reads, flexible schema | Consistency guarantees weaker |
| ClickHouse/BigQuery | Analytical queries over large datasets | Read-optimized, not for OLTP |

## Synchronization: Keeping Read Models Updated

The write side changes state. The read side must reflect those changes. How?

### Option 1: Synchronous Update (Same Transaction)

The command handler updates both the write model and the read model in the same database transaction.

```typescript
class PlaceOrderCommandHandler {
  async handle(command: PlaceOrderCommand): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Write side: save aggregate state
      const order = Order.create(command)
      await this.orderRepository.save(order, tx)

      // Read side: update read model in same transaction
      await tx.execute(
        `INSERT INTO order_list_view (id, customer_name, status, total, placed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, command.customerName, 'pending', order.total, new Date()]
      )
    })
  }
}
```

**Pros**: Strong consistency — reads immediately reflect writes.
**Cons**: Tight coupling between write and read sides; complex read model updates slow down the transaction; cannot use different storage for reads.

### Option 2: Eventual Consistency via Domain Events

The command handler saves the aggregate and publishes domain events. Separate projectors subscribe to those events and update read models asynchronously.

```typescript
class PlaceOrderCommandHandler {
  async handle(command: PlaceOrderCommand): Promise<void> {
    const order = Order.create(command)

    // Save aggregate — this also persists domain events
    await this.orderRepository.save(order)

    // Publish events (async — projectors will pick them up)
    const events = order.pullDomainEvents()
    await this.eventBus.publishAll(events)
  }
}

// Separate projector — runs in a different process or async handler
class OrderListViewProjector {
  async on(event: OrderPlacedEvent): Promise<void> {
    await this.db.execute(
      `INSERT INTO order_list_view (id, customer_id, customer_name, status, total, placed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,  // Idempotent!
      [event.orderId, event.customerId, event.customerName, 'pending', event.total, event.occurredAt]
    )
  }

  async on(event: OrderShippedEvent): Promise<void> {
    await this.db.execute(
      `UPDATE order_list_view
       SET status = 'shipped', last_updated_at = $2
       WHERE id = $1`,
      [event.orderId, event.occurredAt]
    )
  }
}
```

**Pros**: Loose coupling; can use different storage for reads; projectors can be rebuilt independently; natural event history for audit.
**Cons**: Eventual consistency — there is a window after a write where reads may return stale data.

## The "Read Your Own Writes" Problem

In an eventually consistent system, a user places an order and immediately navigates to their order list. The projector hasn't processed the `OrderPlaced` event yet, so the order doesn't appear in the list. The user refreshes and sees... nothing. They think their order didn't go through and place it again.

This is the "read your own writes" (RYWW) problem, and it is the most common complaint about eventually consistent CQRS.

### Solutions

**1. Pessimistic: Return command results directly**

After dispatching a command, don't redirect to a read model. Instead, return a constructed response from the command result itself.

```typescript
// Command returns enough data to show success UI without reading the model
interface PlaceOrderResult {
  orderId: string
  estimatedDelivery: Date
  confirmationNumber: string
}

class PlaceOrderCommandHandler {
  async handle(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
    const order = Order.create(command)
    await this.orderRepository.save(order)
    // Return constructed result — no read model needed
    return {
      orderId: order.id,
      estimatedDelivery: order.estimatedDelivery,
      confirmationNumber: order.confirmationNumber
    }
  }
}
```

**2. Wait for projection**: After dispatching a command, poll the read model until it reflects the change.

```typescript
async function placeOrderAndWait(command: PlaceOrderCommand): Promise<OrderDetailView> {
  await commandBus.dispatch(command)

  // Poll read model with exponential backoff
  const orderId = command.correlationId  // Or returned from command
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(50 * Math.pow(2, attempt))
    const order = await queryBus.dispatch({ type: 'GetOrderById', orderId })
    if (order) return order
  }
  throw new Error('Projection timeout — order not visible after 10 attempts')
}
```

**3. Version-based consistency token**: The command returns the aggregate version. The query includes a "minimum version" parameter. The query handler returns a 503 if the projection hasn't caught up.

```typescript
// Command returns version
interface PlaceOrderResult {
  orderId: string
  version: number  // aggregate version after this command
}

// Query includes expected version
interface GetOrderByIdQuery {
  type: 'GetOrderById'
  orderId: string
  minVersion?: number  // Caller knows what version to expect
}

// Query handler checks version
class GetOrderByIdHandler {
  async handle(query: GetOrderByIdQuery): Promise<OrderDetailView> {
    const order = await this.db.queryOne(
      `SELECT * FROM order_detail_view WHERE id = $1`,
      [query.orderId]
    )

    if (query.minVersion && (!order || order.version < query.minVersion)) {
      throw new ProjectionNotReadyError('Projection has not caught up yet', {
        retryAfterMs: 100
      })
    }

    return order
  }
}
```

## CQRS Without Event Sourcing

The simplest CQRS implementation does not use event sourcing at all. The write side uses traditional ORM-based persistence. Domain events are generated when aggregates change, published to an in-process event bus, and picked up by projectors that update read tables.

```typescript
// Write side: traditional aggregate with ORM
class Order {
  private _events: DomainEvent[] = []

  static create(command: PlaceOrderCommand): Order {
    const order = new Order()
    // ... set properties
    order._events.push(new OrderPlacedEvent(order.id, command.customerId, /* ... */))
    return order
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this._events]
    this._events = []
    return events
  }
}

// Repository: saves aggregate state to normalized tables
class OrderRepository {
  async save(order: Order): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Write the aggregate state
      await tx.execute(
        `INSERT INTO orders (id, customer_id, status, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
        [order.id, order.customerId, order.status, order.createdAt]
      )
      // Write order lines
      for (const line of order.lines) {
        await tx.execute(
          `INSERT INTO order_lines (order_id, product_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [order.id, line.productId, line.quantity, line.unitPrice]
        )
      }

      // Publish domain events (after successful commit)
      const events = order.pullDomainEvents()
      await tx.execute(
        `INSERT INTO outbox (id, event_type, payload, created_at)
         VALUES ${events.map((_, i) => `($${i*4+1}, $${i*4+2}, $${i*4+3}, $${i*4+4})`).join(',')}`,
        events.flatMap(e => [e.id, e.type, JSON.stringify(e), new Date()])
      )
    })
  }
}
```

## CQRS With Separate Databases

When read scale requirements exceed what one database can handle:

```typescript
// Write: PostgreSQL with normalized schema
// Read: Elasticsearch for full-text search and filtering

class SearchableOrderProjector {
  constructor(
    private eventBus: EventBus,
    private elasticsearch: Client
  ) {}

  async on(event: OrderPlacedEvent): Promise<void> {
    await this.elasticsearch.index({
      index: 'orders',
      id: event.orderId,
      document: {
        id: event.orderId,
        customerId: event.customerId,
        customerName: event.customerName,
        status: 'pending',
        total: event.total,
        placedAt: event.occurredAt.toISOString(),
        // Flatten items for search
        productNames: event.items.map(i => i.productName),
        skus: event.items.map(i => i.sku),
        searchableText: `${event.customerName} ${event.items.map(i => i.productName).join(' ')}`
      }
    })
  }

  async on(event: OrderStatusChangedEvent): Promise<void> {
    await this.elasticsearch.update({
      index: 'orders',
      id: event.orderId,
      doc: { status: event.newStatus }
    })
  }
}
```

## Testing CQRS

The separation of commands and queries makes testing dramatically cleaner.

### Testing Command Handlers

```typescript
describe('PlaceOrderCommandHandler', () => {
  let handler: PlaceOrderCommandHandler
  let orderRepository: jest.Mocked<OrderRepository>
  let eventBus: jest.Mocked<EventBus>

  beforeEach(() => {
    orderRepository = createMock<OrderRepository>()
    eventBus = createMock<EventBus>()
    handler = new PlaceOrderCommandHandler(orderRepository, eventBus)
  })

  it('saves the order and publishes OrderPlaced event', async () => {
    const command: PlaceOrderCommand = {
      type: 'PlaceOrder',
      correlationId: 'corr-1',
      customerId: 'cust-1',
      items: [{ productId: 'prod-1', quantity: 2, unitPrice: 29.99 }],
      shippingAddress: validAddress()
    }

    await handler.handle(command)

    expect(orderRepository.save).toHaveBeenCalledOnce()
    const savedOrder = orderRepository.save.mock.calls[0][0]
    expect(savedOrder.customerId).toBe('cust-1')
    expect(savedOrder.lines).toHaveLength(1)

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OrderPlaced', orderId: savedOrder.id })
    )
  })

  it('rejects order with empty items', async () => {
    const command: PlaceOrderCommand = {
      type: 'PlaceOrder',
      correlationId: 'corr-2',
      customerId: 'cust-1',
      items: [],  // Invalid!
      shippingAddress: validAddress()
    }

    await expect(handler.handle(command)).rejects.toThrow(ValidationError)
    expect(orderRepository.save).not.toHaveBeenCalled()
  })
})
```

### Testing Projectors

```typescript
describe('OrderListViewProjector', () => {
  let projector: OrderListViewProjector
  let db: TestDatabase

  beforeEach(async () => {
    db = await TestDatabase.create()
    projector = new OrderListViewProjector(db)
  })

  afterEach(() => db.cleanup())

  it('creates a row when OrderPlaced is received', async () => {
    const event: OrderPlacedEvent = {
      type: 'OrderPlaced',
      orderId: 'ord-1',
      customerId: 'cust-1',
      customerName: 'Alice Smith',
      total: 59.98,
      itemCount: 2,
      occurredAt: new Date('2026-03-17T10:00:00Z')
    }

    await projector.on(event)

    const row = await db.queryOne(
      'SELECT * FROM order_list_view WHERE id = $1',
      ['ord-1']
    )
    expect(row.customer_name).toBe('Alice Smith')
    expect(row.status).toBe('pending')
    expect(row.total).toBe(59.98)
  })

  it('is idempotent — handles duplicate events without error', async () => {
    const event = makeOrderPlacedEvent({ orderId: 'ord-2' })

    await projector.on(event)
    await projector.on(event)  // Process same event twice

    const count = await db.queryScalar(
      'SELECT COUNT(*) FROM order_list_view WHERE id = $1',
      ['ord-2']
    )
    expect(count).toBe(1)  // Only one row, despite two events
  })
})
```

## Common Mistakes

### Mistake 1: Business Logic in Command Handlers

```typescript
// WRONG: Business logic in the handler, not the aggregate
class PlaceOrderCommandHandler {
  async handle(command: PlaceOrderCommand): Promise<void> {
    // This is domain logic! It belongs in the Order aggregate.
    const totalAmount = command.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice, 0
    )
    if (totalAmount < 10) {
      throw new BusinessError('Minimum order value is $10')
    }
    if (command.items.length > 100) {
      throw new BusinessError('Maximum 100 items per order')
    }

    const order = new Order()
    order.id = uuid()
    order.customerId = command.customerId
    // ... manually set all fields
    await this.db.insert('orders', order)
  }
}

// RIGHT: Handler orchestrates; aggregate enforces invariants
class PlaceOrderCommandHandler {
  async handle(command: PlaceOrderCommand): Promise<void> {
    const customer = await this.customerRepository.findById(command.customerId)
    if (!customer) throw new NotFoundError('Customer not found')

    // Aggregate enforces all business rules
    const order = Order.place(customer, command.items, command.shippingAddress)

    await this.orderRepository.save(order)
  }
}
```

### Mistake 2: Read Models That Mirror the Write Model

If your read model is an exact copy of your write model with different column names, you haven't gained anything from CQRS. Design read models for specific query needs.

### Mistake 3: Commands That Return Domain Objects

Commands should return primitive IDs or nothing. Returning a full domain object from a command means you're reading the write model for display purposes.

### Mistake 4: Fat Commands

Commands should be thin. They carry data needed to execute the intent, not pre-computed business decisions.

```typescript
// WRONG: Command making business decisions
interface PlaceOrderCommand {
  customerId: string
  items: OrderItem[]
  discountPercentage: number  // Calculated where? By whom?
  taxAmount: number           // Same problem
  finalTotal: number          // Don't trust the client!
}

// RIGHT: Command carries intent, aggregate computes
interface PlaceOrderCommand {
  customerId: string
  items: Array<{ productId: string; quantity: number }>
  couponCode?: string
  shippingAddressId: string
}
```

## Performance Characteristics

### Command Side

- **Write throughput**: Typically limited by the aggregate's lock contention and storage write speed. For PostgreSQL, expect 1,000-10,000 writes/second per aggregate type with proper indexing.
- **Command processing time**: O(n) in the number of events if using event sourcing (mitigated by snapshots). O(1) with traditional state storage.
- **Optimistic concurrency**: Expected version check is a single indexed read — O(1).

### Query Side

- **Read throughput**: Effectively unlimited with read replicas and caching. Read models can serve 100,000+ requests/second from a single PostgreSQL read replica with proper denormalization.
- **Query complexity**: O(1) or O(log n) for most queries against properly indexed read model tables. No joins means no join explosion.
- **Projection lag**: Typically 1-100ms in healthy systems. Can grow to seconds or minutes under high load or during rebuilds.

### The CQRS Performance Guarantee

In a CRUD system, write performance degrades as read requirements grow (more indexes to maintain, more join complexity affects query plans). In CQRS, write performance is completely independent of read performance. Adding a new read model never slows down writes.

$$\text{Write Throughput} \perp \text{Read Complexity}$$

::: info War Story
A large European logistics company had a CRUD-based order management system that ground to a halt during peak shipping season. Every `UPDATE orders SET status = 'shipped' WHERE id = ?` was invalidating indexes on the 14 columns the reporting team had added to serve their dashboards. The write-side database was spending 40% of its time maintaining indexes for columns that the write side never queried.

They migrated to CQRS with a separate reporting database (Elasticsearch). Writes went to PostgreSQL, which now had only 4 indexes (id, customer_id, status, created_at). Reporting queries went to Elasticsearch. Write throughput increased 3.4x. Reporting query time dropped from 4-8 seconds to under 200ms. The key insight: writes were being throttled by reporting requirements, and CQRS made those concerns independent.

The migration took 3 months and required careful projection design, but they measured a 68% reduction in database CPU during their next peak season.
:::

## Mathematical Foundations

### Command-Query Separation as a Category

CQS can be formalized as a category where:
- Objects are system states: $S_0, S_1, S_2, ...$
- Commands are morphisms that change state: $c: S_i \rightarrow S_j$
- Queries are morphisms that leave state unchanged: $q: S_i \rightarrow (S_i, \text{Result})$

The separation principle says these two kinds of morphisms should be syntactically distinct — their types reveal which kind they are.

### Eventual Consistency Bound

For an eventually consistent CQRS system, the staleness of a read model at time $t$ is bounded by:

$$\text{Staleness}(t) \leq \text{EventPublishLatency} + \text{ProjectionProcessingLatency}$$

In practice, with a healthy message broker and fast projectors:

$$\text{Staleness}(t) \approx 5\text{ms} + 20\text{ms} = 25\text{ms} \text{ (p99)}$$

At p99.9 during normal operations, staleness is typically under 500ms. During backlog processing after an outage, it can be minutes to hours — which is why projection lag monitoring is critical.

## Decision Framework

| Situation | Recommendation |
|-----------|---------------|
| Team < 3, simple domain | Don't use CQRS |
| Complex business rules, single team | CQRS in same codebase, same DB |
| Read queries > 10x write rate | CQRS with read replicas or separate read DB |
| Read and write shape dramatically different | CQRS with purpose-built read models |
| Multiple teams, separate deployment | Full CQRS with message bus |
| Audit requirements | CQRS + Event Sourcing |
| Temporal queries needed | CQRS + Event Sourcing required |
| Regulatory compliance (GDPR, SOX, HIPAA) | CQRS + Event Sourcing + audit projections |

## Advanced: CQRS at the Service Level

In microservices architectures, CQRS can operate at two levels:

1. **Within a service**: Separate command and query handlers within one service, possibly sharing a database.
2. **Across services**: The "Order Service" owns writes; a "Order Query Service" or "BFF" owns reads, subscribing to the Order Service's event stream.

The second model is powerful but introduces distributed systems complexity: you must manage event schema contracts across service boundaries, version events for backward compatibility, and monitor cross-service projection lag.

This is discussed further in the [Sagas & Process Managers](./sagas-process-managers) page, which covers coordination across service boundaries.
