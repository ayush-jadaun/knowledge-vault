---
title: "Aggregate Design"
description: "Deep guide to designing aggregates in DDD — consistency boundaries, invariant enforcement, event-sourced aggregates, and avoiding the most common design mistakes."
tags: [aggregates, ddd, domain-driven-design, event-sourcing, invariants, typescript]
difficulty: "advanced"
prerequisites: ["cqrs-event-sourcing/index", "cqrs-event-sourcing/event-sourcing-deep-dive"]
lastReviewed: "2026-03-17"
---

# Aggregate Design

## What an Aggregate Is — And What It Isn't

The word "aggregate" in Domain-Driven Design is one of the most misunderstood terms in software architecture. Ask ten developers what an aggregate is, and most will say something like "a group of related objects" or "a cluster of entities and value objects." This is technically correct but deeply misleading, because it focuses on the composition rather than the purpose.

An aggregate is a **consistency boundary**. It is the smallest unit of transactional consistency in your domain. Every invariant that must be enforced atomically must be enforced within a single aggregate. Every operation that could violate a business rule must be executed within the boundaries of a single aggregate.

The clustering of entities and value objects is a consequence of this purpose, not the definition. You put objects in an aggregate because they share invariants that must be enforced together, not because they are "related" in some vague conceptual sense.

This distinction matters enormously for design. "Related" is subjective and grows without bound — everything is related to everything else in a sufficiently complex domain. "Shares invariants" is objective and specific — it tells you exactly what must be together and suggests that everything else should be separate.

### The Classic Mistake

Consider an e-commerce domain. A natural first instinct:

```
Order aggregate:
  - Order (root)
  - OrderLines (entities)
  - Customer (entity) ← WRONG
  - ShippingAddress (value object)
  - PaymentMethod (entity) ← WRONG
  - ProductDetails (entity) ← WRONG
```

This feels right because these things are "related to an order." But:

- Is there an invariant that involves both Order and Customer state simultaneously? No — the order just needs a valid customer ID.
- Is there an invariant that requires Order and PaymentMethod to be modified in the same transaction? Maybe the "order total must match payment amount" — but that's checked at placement time, not as a continuous invariant.
- Is there an invariant involving ProductDetails? No — products are reference data.

The correct design:

```
Order aggregate:
  - Order (root)
  - OrderLines (value objects or entities, depending on invariants)
  - ShippingAddress (value object)

Customer aggregate:
  - Customer (root)
  - Email, Phone (value objects)

PaymentMethod aggregate (or entity in Customer):
  - PaymentMethod (root)
  - CardDetails (value object)
```

## Aggregate Root

The **aggregate root** is the single entry point into an aggregate. External objects may hold references only to the aggregate root, never to internal entities or value objects. All operations on the aggregate go through the root.

This rule exists to:
1. Ensure all invariant checks are exercised on every modification.
2. Ensure all domain events are collected by one object (the root).
3. Allow the repository to load and save the aggregate atomically.

```typescript
// Internal entity — external code never holds direct references
class OrderLine {
  constructor(
    readonly lineId: string,
    readonly productId: string,
    readonly productName: string,
    private _quantity: number,
    readonly unitPrice: number
  ) {}

  get quantity(): number { return this._quantity }

  // Package-private mutation — only the aggregate root calls this
  updateQuantity(newQuantity: number): void {
    if (newQuantity <= 0) throw new Error('Quantity must be positive')
    this._quantity = newQuantity
  }

  get lineTotal(): number {
    return this._quantity * this.unitPrice
  }
}

// Aggregate root — the only thing external code touches
class Order {
  private _lines: Map<string, OrderLine> = new Map()
  private _status: OrderStatus = OrderStatus.Draft
  private _domainEvents: DomainEvent[] = []

  private constructor(
    readonly id: string,
    readonly customerId: string,
    private _version: number = 0
  ) {}

  // Factory method — enforces creation invariants
  static place(
    id: string,
    customer: CustomerSummary,
    items: OrderItemRequest[],
    shippingAddress: Address
  ): Order {
    if (items.length === 0) {
      throw new DomainError('Order must contain at least one item')
    }
    if (items.some(i => i.quantity <= 0)) {
      throw new DomainError('All item quantities must be positive')
    }

    const order = new Order(id, customer.id)
    // Internal apply — emits event and applies state
    order.raise(new OrderPlacedEvent({
      orderId: id,
      customerId: customer.id,
      customerName: customer.name,
      items: items.map(i => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice
      })),
      shippingAddress,
      total: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
      occurredAt: new Date()
    }))
    return order
  }

  // Command method — enforces business rules and emits events
  addItem(productId: string, productName: string, quantity: number, unitPrice: number): void {
    if (this._status !== OrderStatus.Draft) {
      throw new DomainError('Can only add items to draft orders')
    }
    if (this._lines.size >= 100) {
      throw new DomainError('Order cannot have more than 100 line items')
    }

    const lineId = crypto.randomUUID()
    this.raise(new OrderItemAddedEvent({
      orderId: this.id,
      lineId,
      productId,
      productName,
      quantity,
      unitPrice,
      occurredAt: new Date()
    }))
  }

  confirm(): void {
    if (this._status !== OrderStatus.Draft) {
      throw new DomainError(`Cannot confirm order in status: ${this._status}`)
    }
    if (this._lines.size === 0) {
      throw new DomainError('Cannot confirm empty order')
    }

    this.raise(new OrderConfirmedEvent({
      orderId: this.id,
      confirmedAt: new Date(),
      occurredAt: new Date()
    }))
  }

  cancel(reason: string, cancelledBy: string): void {
    if ([OrderStatus.Shipped, OrderStatus.Delivered].includes(this._status)) {
      throw new DomainError(`Cannot cancel order in status: ${this._status}`)
    }

    this.raise(new OrderCancelledEvent({
      orderId: this.id,
      reason,
      cancelledBy,
      refundAmount: this.total,
      occurredAt: new Date()
    }))
  }

  // State accessors — read-only
  get status(): OrderStatus { return this._status }
  get version(): number { return this._version }
  get lines(): ReadonlyMap<string, OrderLine> { return this._lines }
  get total(): number {
    let sum = 0
    for (const line of this._lines.values()) {
      sum += line.lineTotal
    }
    return sum
  }

  // Event infrastructure
  protected raise(event: DomainEvent): void {
    this.applyEvent(event)
    this._domainEvents.push(event)
  }

  applyEvent(event: DomainEvent): void {
    this._version++
    this.apply(event)
  }

  private apply(event: DomainEvent): void {
    switch (event.type) {
      case 'OrderPlaced':
        this.applyOrderPlaced(event as OrderPlacedEvent)
        break
      case 'OrderItemAdded':
        this.applyOrderItemAdded(event as OrderItemAddedEvent)
        break
      case 'OrderConfirmed':
        this._status = OrderStatus.Confirmed
        break
      case 'OrderCancelled':
        this._status = OrderStatus.Cancelled
        break
      case 'OrderShipped':
        this._status = OrderStatus.Shipped
        break
      default:
        // Unknown events are ignored — forward compatibility
        break
    }
  }

  private applyOrderPlaced(event: OrderPlacedEvent): void {
    this._status = OrderStatus.Draft
    for (const item of event.items) {
      const line = new OrderLine(
        crypto.randomUUID(),
        item.productId,
        item.productName,
        item.quantity,
        item.unitPrice
      )
      this._lines.set(line.lineId, line)
    }
  }

  private applyOrderItemAdded(event: OrderItemAddedEvent): void {
    const line = new OrderLine(
      event.lineId,
      event.productId,
      event.productName,
      event.quantity,
      event.unitPrice
    )
    this._lines.set(line.lineId, line)
  }

  get uncommittedEvents(): DomainEvent[] {
    return [...this._domainEvents]
  }

  clearUncommittedEvents(): void {
    this._domainEvents = []
  }
}
```

## The AggregateRoot Base Class

To avoid duplicating event infrastructure in every aggregate, extract it to a base class:

```typescript
// aggregate-root.ts

export abstract class AggregateRoot {
  private _uncommittedEvents: DomainEvent[] = []
  private _version: number = 0

  get version(): number {
    return this._version
  }

  get uncommittedEvents(): ReadonlyArray<DomainEvent> {
    return this._uncommittedEvents
  }

  // Called when loading from event store — does NOT add to uncommitted events
  applyEvent(event: DomainEvent): void {
    this._version++
    this.apply(event)
  }

  // Called when raising new events — adds to uncommitted AND applies
  protected raise(event: DomainEvent): void {
    this._version++
    this.apply(event)
    this._uncommittedEvents.push(event)
  }

  // Subclasses implement this to handle state transitions
  protected abstract apply(event: DomainEvent): void

  clearUncommittedEvents(): void {
    this._uncommittedEvents = []
  }

  // For optimistic concurrency: the version before any new events
  get committedVersion(): number {
    return this._version - this._uncommittedEvents.length
  }
}

// Concrete aggregate extends AggregateRoot
class BankAccount extends AggregateRoot {
  private _balance: number = 0
  private _status: 'active' | 'frozen' | 'closed' = 'active'
  private _ownerId: string = ''

  get balance(): number { return this._balance }
  get status(): string { return this._status }

  static open(id: string, ownerId: string, initialBalance: number): BankAccount {
    if (initialBalance < 0) throw new DomainError('Initial balance cannot be negative')
    const account = new BankAccount()
    account.raise(new AccountOpenedEvent({ accountId: id, ownerId, initialBalance, occurredAt: new Date() }))
    return account
  }

  deposit(amount: number): void {
    if (this._status !== 'active') throw new DomainError('Cannot deposit to non-active account')
    if (amount <= 0) throw new DomainError('Deposit amount must be positive')
    this.raise(new MoneyDepositedEvent({ accountId: 'TODO', amount, occurredAt: new Date() }))
  }

  withdraw(amount: number): void {
    if (this._status !== 'active') throw new DomainError('Cannot withdraw from non-active account')
    if (amount <= 0) throw new DomainError('Withdrawal amount must be positive')
    if (amount > this._balance) throw new DomainError('Insufficient funds')
    this.raise(new MoneyWithdrawnEvent({ accountId: 'TODO', amount, occurredAt: new Date() }))
  }

  protected apply(event: DomainEvent): void {
    switch (event.type) {
      case 'AccountOpened': {
        const e = event as AccountOpenedEvent
        this._balance = e.initialBalance
        this._ownerId = e.ownerId
        this._status = 'active'
        break
      }
      case 'MoneyDeposited':
        this._balance += (event as MoneyDepositedEvent).amount
        break
      case 'MoneyWithdrawn':
        this._balance -= (event as MoneyWithdrawnEvent).amount
        break
      case 'AccountFrozen':
        this._status = 'frozen'
        break
      case 'AccountClosed':
        this._status = 'closed'
        break
    }
  }
}
```

## Invariant Enforcement

An **invariant** is a condition that must always be true. The aggregate enforces invariants by:
1. Checking the invariant before raising an event.
2. Never providing a public method that would bypass the check.

### Hard Invariants vs Soft Invariants

**Hard invariants**: Must never be violated. Enforced synchronously by the aggregate.

```typescript
// Hard invariant: balance must never go negative
withdraw(amount: number): void {
  if (amount > this._balance) {
    throw new InsufficientFundsError(this._balance, amount)
  }
  // ...
}
```

**Soft invariants** (also called "eventual invariants" or "policies"): Can be temporarily violated and corrected through a compensating process.

```typescript
// Soft invariant: a customer should not have more than 5 active subscriptions
// This is enforced by a policy, not synchronously
// The aggregate allows the subscription, but a policy checks after and cancels if violated
// Rationale: the check requires querying multiple aggregates, which can't be done in one transaction
```

The rule of thumb: if an invariant spans multiple aggregates, it cannot be a hard invariant. It must be eventual.

## Aggregate Boundaries: The Hard Problem

Deciding what belongs inside an aggregate is the hardest part of DDD and the question most teams get wrong. Here are the rules:

### Rule 1: The Invariant Rule

An aggregate contains exactly the data needed to enforce its invariants. Nothing more.

Ask: "To enforce invariant X, what data do I need to access in the same transaction?" That data belongs together.

### Rule 2: The Size Rule

**Small aggregates are almost always better than large ones.**

Reasons:
- Smaller aggregates have fewer concurrent modification conflicts (the entire aggregate is locked for a write).
- Smaller event streams replay faster.
- Smaller aggregates are easier to understand and test.
- Boundaries are easier to refactor when they're already small.

### Rule 3: The Reference Rule

Aggregates reference each other only by ID, never by object reference.

```typescript
// WRONG: Holding reference to another aggregate
class Order {
  customer: Customer  // Direct reference — wrong!
}

// RIGHT: Reference by ID only
class Order {
  customerId: string  // Just the ID
  customerName: string  // Snapshot of name at time of order
  customerEmail: string  // Snapshot of email at time of order
}
```

Why? If you hold a reference, you either load the entire Customer when you load the Order (coupling, performance), or you have a stale reference (consistency issues). The snapshot approach (denormalize at write time) avoids both problems.

### Rule 4: The Transaction Rule

One aggregate per transaction. If your command handler needs to modify two aggregates, reconsider your aggregate boundaries.

```typescript
// WRONG: Modifying two aggregates in one transaction
async function transferMoney(command: TransferMoneyCommand): Promise<void> {
  const sourceAccount = await accountRepo.load(command.fromAccountId)
  const destAccount = await accountRepo.load(command.toAccountId)

  sourceAccount.debit(command.amount)
  destAccount.credit(command.amount)

  // PROBLEM: Can't atomically save both in event sourcing!
  // If source saves but dest fails, money disappears.
  await accountRepo.save(sourceAccount)  // If this succeeds...
  await accountRepo.save(destAccount)    // ...but this fails, money is gone
}

// RIGHT: One aggregate per transaction, use a saga for coordination
// Option A: Transfer aggregate
class Transfer {
  private _status: 'pending' | 'debited' | 'completed' | 'failed' = 'pending'

  initiate(fromAccountId: string, toAccountId: string, amount: number): void {
    this.raise(new TransferInitiatedEvent({ /* ... */ }))
  }

  markDebited(): void {
    this.raise(new TransferDebitedEvent({ /* ... */ }))
  }

  complete(): void {
    this.raise(new TransferCompletedEvent({ /* ... */ }))
  }

  fail(reason: string): void {
    this.raise(new TransferFailedEvent({ reason, /* ... */ }))
  }
}
// The saga/process manager coordinates: debit source, credit dest, complete transfer
```

## Domain Events Raised by Aggregates

Aggregates raise domain events as a natural part of executing commands. The events:

1. **Capture the decision made by the aggregate** — they record that the aggregate enforced its invariants and decided to accept the command.
2. **Are the authoritative record of what happened** — in event sourcing, they are stored. In non-ES CQRS, they are published to update read models.
3. **Should be raised even if the command appears to be a no-op** — sometimes the fact that "nothing changed" is itself meaningful.

### Event Granularity

Events should be at the right level of granularity:

```typescript
// Too coarse: doesn't tell you what actually changed
interface OrderUpdatedEvent {
  type: 'OrderUpdated'
  orderId: string
  newState: Order  // The entire order state — useless for projectors
}

// Too fine: exposes implementation details
interface OrderLineQuantityInternalCounterIncrementedEvent {
  type: 'OrderLineQuantityInternalCounterIncremented'
  orderId: string
  lineId: string
}

// Right level: business-meaningful, specific, self-contained
interface OrderItemQuantityChangedEvent {
  type: 'OrderItemQuantityChanged'
  orderId: string
  lineId: string
  productId: string
  productName: string
  previousQuantity: number
  newQuantity: number
  quantityDelta: number  // Convenience field
  occurredAt: Date
}
```

## Event-Sourced Aggregate: Complete Pattern

```typescript
// Complete event-sourced aggregate with all patterns

enum LoanApplicationStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  UnderReview = 'UnderReview',
  Approved = 'Approved',
  Rejected = 'Rejected',
  Disbursed = 'Disbursed',
  Closed = 'Closed'
}

class LoanApplication extends AggregateRoot {
  private _id: string = ''
  private _applicantId: string = ''
  private _requestedAmount: number = 0
  private _approvedAmount: number | null = null
  private _status: LoanApplicationStatus = LoanApplicationStatus.Draft
  private _reviewerId: string | null = null
  private _rejectionReason: string | null = null

  // Factory: create new application
  static submit(
    id: string,
    applicantId: string,
    requestedAmount: number,
    purpose: string
  ): LoanApplication {
    if (requestedAmount <= 0) {
      throw new DomainError('Requested amount must be positive')
    }
    if (requestedAmount > 1_000_000) {
      throw new DomainError('Applications over $1,000,000 require manual processing')
    }

    const app = new LoanApplication()
    app.raise(new LoanApplicationSubmittedEvent({
      applicationId: id,
      applicantId,
      requestedAmount,
      purpose,
      occurredAt: new Date()
    }))
    return app
  }

  // Factory: reconstitute from events (used by repository)
  static reconstitute(id: string, events: DomainEvent[]): LoanApplication {
    const app = new LoanApplication()
    app._id = id
    for (const event of events) {
      app.applyEvent(event)
    }
    return app
  }

  // Commands
  assignReviewer(reviewerId: string): void {
    if (this._status !== LoanApplicationStatus.Submitted) {
      throw new DomainError(`Cannot assign reviewer to application in status: ${this._status}`)
    }
    this.raise(new ReviewerAssignedEvent({
      applicationId: this._id,
      reviewerId,
      occurredAt: new Date()
    }))
  }

  approve(reviewerId: string, approvedAmount: number, notes: string): void {
    if (this._status !== LoanApplicationStatus.UnderReview) {
      throw new DomainError(`Cannot approve application in status: ${this._status}`)
    }
    if (this._reviewerId !== reviewerId) {
      throw new DomainError('Only the assigned reviewer can approve this application')
    }
    if (approvedAmount > this._requestedAmount) {
      throw new DomainError('Approved amount cannot exceed requested amount')
    }

    this.raise(new LoanApplicationApprovedEvent({
      applicationId: this._id,
      reviewerId,
      approvedAmount,
      notes,
      occurredAt: new Date()
    }))
  }

  reject(reviewerId: string, reason: string): void {
    if (this._status !== LoanApplicationStatus.UnderReview) {
      throw new DomainError(`Cannot reject application in status: ${this._status}`)
    }
    if (!reason || reason.trim().length < 10) {
      throw new DomainError('Rejection reason must be at least 10 characters')
    }

    this.raise(new LoanApplicationRejectedEvent({
      applicationId: this._id,
      reviewerId,
      reason,
      occurredAt: new Date()
    }))
  }

  // Getters
  get id(): string { return this._id }
  get status(): LoanApplicationStatus { return this._status }
  get requestedAmount(): number { return this._requestedAmount }
  get approvedAmount(): number | null { return this._approvedAmount }

  // Event application — pure state transitions, no side effects, no throwing
  protected apply(event: DomainEvent): void {
    switch (event.type) {
      case 'LoanApplicationSubmitted': {
        const e = event as LoanApplicationSubmittedEvent
        this._id = e.applicationId
        this._applicantId = e.applicantId
        this._requestedAmount = e.requestedAmount
        this._status = LoanApplicationStatus.Submitted
        break
      }
      case 'ReviewerAssigned': {
        const e = event as ReviewerAssignedEvent
        this._reviewerId = e.reviewerId
        this._status = LoanApplicationStatus.UnderReview
        break
      }
      case 'LoanApplicationApproved': {
        const e = event as LoanApplicationApprovedEvent
        this._approvedAmount = e.approvedAmount
        this._status = LoanApplicationStatus.Approved
        break
      }
      case 'LoanApplicationRejected': {
        const e = event as LoanApplicationRejectedEvent
        this._rejectionReason = e.reason
        this._status = LoanApplicationStatus.Rejected
        break
      }
      // Handle all events; unknown events are silently ignored
    }
  }
}
```

## Transactional Consistency

The aggregate is the **unit of transaction**. When you save an aggregate, all its events are appended atomically. This gives you:

- **All-or-nothing**: Either all events for a command are stored, or none are.
- **No partial state**: The aggregate is never in a half-applied state in the store.
- **Version integrity**: The version check and event append happen in the same database transaction.

```typescript
// Repository: atomic save
class LoanApplicationRepository {
  async save(application: LoanApplication): Promise<void> {
    const uncommitted = application.uncommittedEvents
    if (uncommitted.length === 0) return

    const streamId = `loan-application-${application.id}`
    const expectedVersion = application.committedVersion

    // This is atomic: all events appended or none
    await this.eventStore.append(
      streamId,
      'LoanApplication',
      uncommitted,
      { expectedVersion }
    )

    application.clearUncommittedEvents()
  }
}
```

## Cross-Aggregate Operations: Using Sagas

When a business operation must span multiple aggregates, use a **saga** (or process manager). The saga orchestrates the steps, with each step being a separate transaction on a single aggregate.

```typescript
// Money transfer saga
// Each step is a separate transaction on a single aggregate

class MoneyTransferSaga {
  private _id: string
  private _fromAccountId: string
  private _toAccountId: string
  private _amount: number
  private _status: 'initiated' | 'debited' | 'completed' | 'compensating' | 'failed'

  // Step 1: Debit source account (one aggregate)
  async handleTransferInitiated(event: TransferInitiatedEvent): Promise<void> {
    const sourceAccount = await this.accountRepo.load(event.fromAccountId)
    sourceAccount.debit(event.amount, event.transferId)
    await this.accountRepo.save(sourceAccount)
    // Emits AccountDebitedEvent → triggers step 2
  }

  // Step 2: Credit destination account (different aggregate)
  async handleAccountDebited(event: AccountDebitedEvent): Promise<void> {
    if (event.transferId !== this._id) return  // Not our event

    const destAccount = await this.accountRepo.load(this._toAccountId)
    destAccount.credit(this._amount, this._id)
    await this.accountRepo.save(destAccount)
    // Emits AccountCreditedEvent → triggers step 3
  }

  // Step 3: Mark transfer complete
  async handleAccountCredited(event: AccountCreditedEvent): Promise<void> {
    if (event.transferId !== this._id) return

    const transfer = await this.transferRepo.load(this._id)
    transfer.complete()
    await this.transferRepo.save(transfer)
  }

  // Compensation: if credit fails, reverse the debit
  async handleCreditFailed(event: CreditFailedEvent): Promise<void> {
    const sourceAccount = await this.accountRepo.load(this._fromAccountId)
    sourceAccount.reverseDebit(this._amount, this._id, 'Credit to destination failed')
    await this.accountRepo.save(sourceAccount)
  }
}
```

## Aggregate Versioning for Optimistic Locking

Two versions are tracked:

1. **Stream version**: The number of events in the stream. Used by the event store for optimistic concurrency.
2. **Domain version**: A semantic version for the aggregate's schema (used in snapshots and upcasting).

```typescript
class AggregateRoot {
  // Stream version: incremented by each event
  private _version: number = 0

  applyEvent(event: DomainEvent): void {
    this._version++
    this.apply(event)
  }

  // The version before uncommitted events — used as expectedVersion
  get committedVersion(): number {
    return this._version - this._uncommittedEvents.length
  }

  // Total version including uncommitted events
  get version(): number {
    return this._version
  }
}
```

## Testing Aggregates: Given/When/Then

The event-sourced aggregate maps perfectly to given/when/then testing:

- **Given**: A sequence of past events (the history)
- **When**: A command is executed
- **Then**: A sequence of new events is emitted (or an error is thrown)

```typescript
// Aggregate test helpers
function given(aggregate: AggregateRoot, events: DomainEvent[]): void {
  for (const event of events) {
    aggregate.applyEvent(event)
  }
  aggregate.clearUncommittedEvents()  // History is clean; future events are uncommitted
}

function when(aggregate: Order, command: () => void): DomainEvent[] {
  command()
  return [...aggregate.uncommittedEvents]
}

// Tests
describe('Order aggregate', () => {
  describe('cancel', () => {
    it('cancels a confirmed order', () => {
      const order = new Order('ord-1', 'cust-1')
      given(order, [
        new OrderPlacedEvent({ orderId: 'ord-1', /* ... */ }),
        new OrderConfirmedEvent({ orderId: 'ord-1', /* ... */ })
      ])

      const events = when(order, () => {
        order.cancel('Customer changed mind', 'cust-1')
      })

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('OrderCancelled')
      expect((events[0] as OrderCancelledEvent).reason).toBe('Customer changed mind')
    })

    it('rejects cancellation of shipped order', () => {
      const order = new Order('ord-1', 'cust-1')
      given(order, [
        new OrderPlacedEvent({ orderId: 'ord-1', /* ... */ }),
        new OrderConfirmedEvent({ orderId: 'ord-1', /* ... */ }),
        new OrderShippedEvent({ orderId: 'ord-1', /* ... */ })
      ])

      expect(() => {
        order.cancel('Too late', 'cust-1')
      }).toThrow(DomainError)
    })

    it('cannot cancel the same order twice', () => {
      const order = new Order('ord-1', 'cust-1')
      given(order, [
        new OrderPlacedEvent({ orderId: 'ord-1', /* ... */ }),
        new OrderCancelledEvent({ orderId: 'ord-1', reason: 'First cancel', /* ... */ })
      ])

      expect(() => {
        order.cancel('Second cancel', 'cust-1')
      }).toThrow(DomainError)
    })
  })
})
```

## Common Anti-Patterns

### 1. Anemic Aggregates

An aggregate with no behavior — just getters and setters. All business logic lives in services.

```typescript
// WRONG: Anemic aggregate
class Order {
  id: string
  customerId: string
  status: string
  lines: OrderLine[]

  setStatus(status: string): void { this.status = status }
  addLine(line: OrderLine): void { this.lines.push(line) }
}

// The domain logic is in a service — wrong place
class OrderService {
  cancel(order: Order, reason: string): void {
    if (order.status === 'shipped') {
      throw new Error('Cannot cancel shipped order')
    }
    order.setStatus('cancelled')  // Bypasses any aggregate invariants
  }
}
```

### 2. God Aggregates

One giant aggregate that contains everything loosely related to it. `UserAggregate` that contains user profile, all orders, all addresses, payment methods, preferences, notifications...

These cause:
- Massive event replay time (thousands of events)
- Lock contention — all user activity serialized through one aggregate
- Unrelated invariants mixed together
- Difficulty understanding the aggregate's responsibility

### 3. Cross-Aggregate References (by Object, not ID)

Holding object references to other aggregates (not just IDs) causes tight coupling and prevents independent transactions.

### 4. Lazy Aggregates

Aggregates that defer validation to an external service:

```typescript
// WRONG: Validation depends on external service
class Order {
  addItem(productId: string, quantity: number): void {
    // Aggregate calls external service to validate!
    const product = this.productService.findById(productId)  // ← external call in aggregate
    if (!product.isAvailable()) throw new Error('Product unavailable')
    // ...
  }
}
```

Aggregates must be able to enforce invariants using only the data they carry. Availability checks belong in the command handler (before calling the aggregate).

::: info War Story
A fintech startup built their transaction processing system with an `Account` aggregate that contained the account holder's profile, all transaction history, all active cards, all linked bank accounts, and all notifications. Every transaction command loaded an event stream that grew by approximately 500 events per month per active account.

At launch with 1,000 users, performance was fine. At 50,000 users (18 months later), loading an active account took 2-8 seconds because the event stream had grown to 9,000+ events. Snapshots were added as a band-aid but the real issue was aggregate boundary design.

The migration was painful: they needed to extract `Card`, `LinkedBankAccount`, and `Notification` into separate aggregates, which required data migration scripts and a period of dual-write while they transitioned. The migration took 6 weeks and required extreme care to avoid losing transaction history.

The lesson: correct aggregate boundaries are critical at design time. Refactoring them later is one of the most expensive operations in an event-sourced system. Start small, add only what's needed to enforce invariants, and treat each aggregate boundary as a design commitment.
:::

## Mathematical Foundation

### Aggregate as a State Machine

An aggregate can be formally modeled as a deterministic finite state machine:

$$M = (Q, \Sigma, \delta, q_0, F)$$

Where:
- $Q$ is the finite set of aggregate states (e.g., `{Draft, Submitted, Approved, Rejected}`)
- $\Sigma$ is the input alphabet — the set of all possible events
- $\delta: Q \times \Sigma \rightarrow Q$ is the transition function (the `apply` method)
- $q_0 \in Q$ is the initial state
- $F \subseteq Q$ is the set of accepting (terminal) states

The invariant is: $\delta$ must be total and deterministic. For any state and any event, there is exactly one next state. Unknown events map to the same state (are ignored). This is why the `apply` method has a default case that does nothing — unknown events don't crash the aggregate.

### Consistency Boundary as a Monad

The aggregate's consistency guarantee can be modeled as a monad where:
- Return (`unit`): Creates an aggregate from initial state.
- Bind (`>>=`): Applies a command, checking invariants, yielding a new aggregate state and a list of events.

$$\text{bind}(a, c) = \begin{cases} (a', [e_1, ..., e_n]) & \text{if command } c \text{ is valid in state } a \\ \text{Error}(\text{invariant violation}) & \text{otherwise} \end{cases}$$

The monad laws hold:
1. Left identity: Applying a command to a fresh aggregate then binding is the same as the command in isolation.
2. Right identity: Binding with an identity command (do nothing) returns the same aggregate.
3. Associativity: Sequential command application is associative (order is preserved by event sequence).

## Decision Framework: Aggregate Boundary

When deciding whether object X belongs in aggregate A:

| Question | Yes → | No → |
|----------|-------|------|
| Is there a business rule that jointly constrains A and X? | Include X in A | Reference X by ID only |
| Can X be modified independently of A? | Reference X by ID | Include X in A |
| Would including X cause A's event stream to grow unboundedly? | Separate aggregate | Include X if bounded |
| Is X large enough to justify its own lifecycle? | Separate aggregate | Include X in A |
| Do commands on A regularly need to read X? | Include X in A (but check all other rules first) | Reference by ID |
