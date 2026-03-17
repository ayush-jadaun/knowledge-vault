---
title: "DDD: Specification Pattern"
description: "Comprehensive guide to the Specification Pattern — encapsulating business rules as composable, testable, reusable objects with TypeScript implementations for validation, querying, and construction"
tags: [ddd, specification-pattern, business-rules, composite, strategy, validation, querying]
difficulty: "advanced"
prerequisites: ["architecture-patterns/domain-driven-design", "architecture-patterns/domain-driven-design/tactical-design"]
lastReviewed: "2026-03-18"
---

# Specification Pattern

## Why It Exists

Business rules are the lifeblood of domain logic, but they tend to scatter. Without a disciplined approach, you find the same rule duplicated in:

- A domain entity method
- A repository query's WHERE clause
- A validation check in a controller
- A filtering function in the UI

When a rule changes — say "premium customers are those with 12+ months tenure AND $10K+ lifetime spend" becomes "premium customers are those with 12+ months tenure AND $10K+ lifetime spend OR referred by an existing premium customer" — you must find and update every copy. Miss one and you have a consistency bug.

Eric Evans and Martin Fowler described the Specification Pattern as a way to **encapsulate a business rule into a single, named, testable, composable object**. The rule is defined once, in the domain layer, and reused everywhere: for validation, for querying, and for object construction.

### Historical Context

The pattern was originally published in Evans's *Domain-Driven Design* (2003) and elaborated in Evans & Fowler's paper "Specifications" (2006). It draws from:

- The **Strategy Pattern** (GoF) — encapsulating an algorithm behind an interface
- **Predicate Logic** — treating rules as boolean functions that can be composed with AND, OR, NOT
- **SQL WHERE clauses** — the insight that filter criteria are themselves objects

## First Principles

### A Specification is a Predicate

At its core, a specification is a function:

$$
S: T \rightarrow \{true, false\}
$$

It takes an object of type $T$ and returns whether that object satisfies the specification.

### Composability

Specifications compose using boolean algebra:

$$
S_1 \land S_2 \quad \text{(AND)} \\
S_1 \lor S_2 \quad \text{(OR)} \\
\lnot S \quad \text{(NOT)}
$$

This gives us the full power of propositional logic for building complex rules from simple, testable components.

### The Three Uses of Specification

Evans identified three contexts where specifications are used:

| Use | Question Answered | Example |
|-----|-------------------|---------|
| **Validation** | "Does this object satisfy the rule?" | Is this customer eligible for premium tier? |
| **Selection/Querying** | "Which objects in a collection satisfy the rule?" | Find all overdue invoices |
| **Construction** | "Build me an object that satisfies the rule" | Generate a valid test fixture |

## Core Mechanics

### The Base Specification

```typescript
// domain/specifications/specification.ts

export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}

export abstract class CompositeSpecification<T> implements Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;

  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }

  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }

  not(): Specification<T> {
    return new NotSpecification(this);
  }
}

class AndSpecification<T> extends CompositeSpecification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate);
  }

  toString(): string {
    return `(${this.left} AND ${this.right})`;
  }
}

class OrSpecification<T> extends CompositeSpecification<T> {
  constructor(
    private readonly left: Specification<T>,
    private readonly right: Specification<T>,
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate);
  }

  toString(): string {
    return `(${this.left} OR ${this.right})`;
  }
}

class NotSpecification<T> extends CompositeSpecification<T> {
  constructor(private readonly spec: Specification<T>) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return !this.spec.isSatisfiedBy(candidate);
  }

  toString(): string {
    return `(NOT ${this.spec})`;
  }
}
```

### Concrete Specifications

```typescript
// domain/specifications/customer/premium-customer.spec.ts
import { CompositeSpecification } from '../specification';
import type { Customer } from '../../entities/customer';

export class HasMinimumTenure extends CompositeSpecification<Customer> {
  constructor(private readonly minimumMonths: number) {
    super();
  }

  isSatisfiedBy(customer: Customer): boolean {
    const monthsSinceCreation = this.monthsBetween(customer.createdAt, new Date());
    return monthsSinceCreation >= this.minimumMonths;
  }

  private monthsBetween(start: Date, end: Date): number {
    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth())
    );
  }

  toString(): string {
    return `HasMinimumTenure(${this.minimumMonths} months)`;
  }
}

export class HasMinimumLifetimeSpend extends CompositeSpecification<Customer> {
  constructor(private readonly minimumAmount: number) {
    super();
  }

  isSatisfiedBy(customer: Customer): boolean {
    return customer.lifetimeSpend.amount >= this.minimumAmount;
  }

  toString(): string {
    return `HasMinimumLifetimeSpend($${this.minimumAmount})`;
  }
}

export class IsReferredByPremiumCustomer extends CompositeSpecification<Customer> {
  constructor(
    private readonly premiumSpec: Specification<Customer>,
    private readonly customerLookup: (id: string) => Customer | null,
  ) {
    super();
  }

  isSatisfiedBy(customer: Customer): boolean {
    if (!customer.referredBy) return false;
    const referrer = this.customerLookup(customer.referredBy);
    if (!referrer) return false;
    return this.premiumSpec.isSatisfiedBy(referrer);
  }

  toString(): string {
    return `IsReferredByPremiumCustomer`;
  }
}

export class IsActiveCustomer extends CompositeSpecification<Customer> {
  isSatisfiedBy(customer: Customer): boolean {
    return customer.isActive && !customer.isSuspended;
  }

  toString(): string {
    return `IsActive`;
  }
}
```

### Composing Specifications

```typescript
// domain/specifications/customer/index.ts
import { HasMinimumTenure } from './premium-customer.spec';
import { HasMinimumLifetimeSpend } from './premium-customer.spec';
import { IsReferredByPremiumCustomer } from './premium-customer.spec';
import { IsActiveCustomer } from './premium-customer.spec';
import type { Customer } from '../../entities/customer';
import type { Specification } from '../specification';

/**
 * Premium Customer Specification:
 *
 * A customer is premium if:
 *   (12+ months tenure AND $10K+ lifetime spend)
 *   OR
 *   (referred by an existing premium customer)
 *
 * AND they must be an active customer.
 */
export function createPremiumCustomerSpec(
  customerLookup: (id: string) => Customer | null,
): Specification<Customer> {
  const tenureRule = new HasMinimumTenure(12);
  const spendRule = new HasMinimumLifetimeSpend(10_000);
  const tenureAndSpend = tenureRule.and(spendRule);

  // Note: premiumSpec for referral check uses the same tenure+spend rule
  // to avoid circular definition
  const referralRule = new IsReferredByPremiumCustomer(tenureAndSpend, customerLookup);

  const qualificationRule = tenureAndSpend.or(referralRule);

  // Must also be active
  return qualificationRule.and(new IsActiveCustomer());
}

// Usage:
// const spec = createPremiumCustomerSpec(id => customerRepo.findByIdSync(id));
// const isPremium = spec.isSatisfiedBy(customer);
```

## Use Case 1: Validation

```typescript
// application/use-cases/upgrade-customer/upgrade-customer.interactor.ts
import type { CustomerRepository } from '../../ports/customer.repository';
import { createPremiumCustomerSpec } from '../../../domain/specifications/customer';
import { CustomerNotEligibleError } from '../../errors';

export class UpgradeCustomerInteractor implements UpgradeCustomerUseCase {
  constructor(private readonly customerRepo: CustomerRepository) {}

  async execute(input: UpgradeCustomerInput): Promise<UpgradeCustomerOutput> {
    const customer = await this.customerRepo.findById(input.customerId);
    if (!customer) throw new CustomerNotFoundError(input.customerId);

    const premiumSpec = createPremiumCustomerSpec(
      (id) => this.customerRepo.findByIdSync(id),
    );

    if (!premiumSpec.isSatisfiedBy(customer)) {
      throw new CustomerNotEligibleError(
        input.customerId,
        `Does not satisfy: ${premiumSpec}`,
      );
    }

    customer.upgradeToPremium();
    await this.customerRepo.save(customer);

    return {
      customerId: customer.id.value,
      tier: customer.tier,
      upgradedAt: new Date().toISOString(),
    };
  }
}
```

## Use Case 2: Selection / Querying

### In-Memory Filtering

```typescript
// domain/specifications/order/overdue-order.spec.ts
import { CompositeSpecification } from '../specification';
import type { Order } from '../../entities/order';
import { OrderStatus } from '../../value-objects/order-status';

export class IsOverdueOrder extends CompositeSpecification<Order> {
  constructor(private readonly thresholdDays: number = 30) {
    super();
  }

  isSatisfiedBy(order: Order): boolean {
    if (order.status !== OrderStatus.Submitted) return false;

    const daysSinceSubmission = this.daysBetween(order.submittedAt!, new Date());
    return daysSinceSubmission > this.thresholdDays;
  }

  private daysBetween(start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  toString(): string {
    return `IsOverdue(${this.thresholdDays} days)`;
  }
}

export class HasHighValue extends CompositeSpecification<Order> {
  constructor(private readonly threshold: number = 1000) {
    super();
  }

  isSatisfiedBy(order: Order): boolean {
    return order.total.amount >= this.threshold;
  }

  toString(): string {
    return `HasHighValue(>=$${this.threshold})`;
  }
}

// Usage: Find high-value overdue orders
// const spec = new IsOverdueOrder(30).and(new HasHighValue(1000));
// const criticalOrders = allOrders.filter(o => spec.isSatisfiedBy(o));
```

### SQL-Aware Specifications

For querying databases, specifications need to generate SQL predicates:

```typescript
// domain/specifications/queryable-specification.ts
export interface SqlCriteria {
  whereClause: string;
  parameters: unknown[];
  parameterOffset: number;
}

export interface QueryableSpecification<T> extends Specification<T> {
  toSql(paramOffset?: number): SqlCriteria;
}

export abstract class CompositeQueryableSpecification<T>
  extends CompositeSpecification<T>
  implements QueryableSpecification<T>
{
  abstract toSql(paramOffset?: number): SqlCriteria;

  and(other: Specification<T>): CompositeQueryableSpecification<T> {
    if (isQueryable(other)) {
      return new AndQueryableSpecification(this, other);
    }
    // Fall back to non-queryable composition
    return new AndQueryableSpecification(this, wrapAsQueryable(other));
  }

  or(other: Specification<T>): CompositeQueryableSpecification<T> {
    if (isQueryable(other)) {
      return new OrQueryableSpecification(this, other);
    }
    return new OrQueryableSpecification(this, wrapAsQueryable(other));
  }
}

function isQueryable<T>(spec: Specification<T>): spec is QueryableSpecification<T> {
  return 'toSql' in spec;
}

class AndQueryableSpecification<T> extends CompositeQueryableSpecification<T> {
  constructor(
    private readonly left: QueryableSpecification<T>,
    private readonly right: QueryableSpecification<T>,
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate);
  }

  toSql(paramOffset: number = 0): SqlCriteria {
    const leftSql = this.left.toSql(paramOffset);
    const rightSql = this.right.toSql(paramOffset + leftSql.parameters.length);

    return {
      whereClause: `(${leftSql.whereClause} AND ${rightSql.whereClause})`,
      parameters: [...leftSql.parameters, ...rightSql.parameters],
      parameterOffset: paramOffset,
    };
  }
}

class OrQueryableSpecification<T> extends CompositeQueryableSpecification<T> {
  constructor(
    private readonly left: QueryableSpecification<T>,
    private readonly right: QueryableSpecification<T>,
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate);
  }

  toSql(paramOffset: number = 0): SqlCriteria {
    const leftSql = this.left.toSql(paramOffset);
    const rightSql = this.right.toSql(paramOffset + leftSql.parameters.length);

    return {
      whereClause: `(${leftSql.whereClause} OR ${rightSql.whereClause})`,
      parameters: [...leftSql.parameters, ...rightSql.parameters],
      parameterOffset: paramOffset,
    };
  }
}
```

```typescript
// domain/specifications/order/queryable-order-specs.ts
import { CompositeQueryableSpecification } from '../queryable-specification';
import type { SqlCriteria } from '../queryable-specification';
import type { Order } from '../../entities/order';
import { OrderStatus } from '../../value-objects/order-status';

export class OrderStatusIs extends CompositeQueryableSpecification<Order> {
  constructor(private readonly status: OrderStatus) {
    super();
  }

  isSatisfiedBy(order: Order): boolean {
    return order.status === this.status;
  }

  toSql(paramOffset: number = 0): SqlCriteria {
    return {
      whereClause: `status = $${paramOffset + 1}`,
      parameters: [this.status],
      parameterOffset: paramOffset,
    };
  }
}

export class OrderTotalGreaterThan extends CompositeQueryableSpecification<Order> {
  constructor(private readonly amount: number) {
    super();
  }

  isSatisfiedBy(order: Order): boolean {
    return order.total.amount > this.amount;
  }

  toSql(paramOffset: number = 0): SqlCriteria {
    return {
      whereClause: `(subtotal - discount_amount) > $${paramOffset + 1}`,
      parameters: [this.amount],
      parameterOffset: paramOffset,
    };
  }
}

export class OrderCreatedBefore extends CompositeQueryableSpecification<Order> {
  constructor(private readonly date: Date) {
    super();
  }

  isSatisfiedBy(order: Order): boolean {
    return order.createdAt < this.date;
  }

  toSql(paramOffset: number = 0): SqlCriteria {
    return {
      whereClause: `created_at < $${paramOffset + 1}`,
      parameters: [this.date],
      parameterOffset: paramOffset,
    };
  }
}

export class OrderCreatedAfter extends CompositeQueryableSpecification<Order> {
  constructor(private readonly date: Date) {
    super();
  }

  isSatisfiedBy(order: Order): boolean {
    return order.createdAt > this.date;
  }

  toSql(paramOffset: number = 0): SqlCriteria {
    return {
      whereClause: `created_at > $${paramOffset + 1}`,
      parameters: [this.date],
      parameterOffset: paramOffset,
    };
  }
}

export class CustomerOrderSpec extends CompositeQueryableSpecification<Order> {
  constructor(private readonly customerId: string) {
    super();
  }

  isSatisfiedBy(order: Order): boolean {
    return order.customerId.value === this.customerId;
  }

  toSql(paramOffset: number = 0): SqlCriteria {
    return {
      whereClause: `customer_id = $${paramOffset + 1}`,
      parameters: [this.customerId],
      parameterOffset: paramOffset,
    };
  }
}
```

### Using Queryable Specifications in Repositories

```typescript
// adapters/persistence/postgres/order.repository.ts
import type { Pool } from 'pg';
import type { QueryableSpecification } from '../../../domain/specifications/queryable-specification';
import type { Order } from '../../../domain/entities/order';

export class PostgresOrderRepository {
  constructor(private readonly pool: Pool) {}

  async findBySpec(spec: QueryableSpecification<Order>): Promise<Order[]> {
    const { whereClause, parameters } = spec.toSql(0);

    const result = await this.pool.query(
      `SELECT o.*, json_agg(ol.*) as lines
       FROM orders o
       LEFT JOIN order_lines ol ON o.id = ol.order_id
       WHERE ${whereClause}
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      parameters,
    );

    return result.rows.map((row) => this.toDomain(row));
  }

  async countBySpec(spec: QueryableSpecification<Order>): Promise<number> {
    const { whereClause, parameters } = spec.toSql(0);

    const result = await this.pool.query(
      `SELECT COUNT(*) FROM orders WHERE ${whereClause}`,
      parameters,
    );

    return parseInt(result.rows[0].count, 10);
  }
}

// Usage:
const highValueSubmitted = new OrderStatusIs(OrderStatus.Submitted)
  .and(new OrderTotalGreaterThan(1000))
  .and(new OrderCreatedAfter(new Date('2026-01-01')));

const orders = await orderRepo.findBySpec(highValueSubmitted);
// Generates: WHERE (status = $1 AND (subtotal - discount_amount) > $2 AND created_at > $3)
// Params: ['SUBMITTED', 1000, '2026-01-01']
```

## Use Case 3: Construction (Object Building)

Specifications can drive object construction for testing and data generation:

```typescript
// __tests__/builders/order.builder.ts
import type { Specification } from '../../domain/specifications/specification';
import { Order } from '../../domain/entities/order';
import { OrderId } from '../../domain/value-objects/order-id';
import { CustomerId } from '../../domain/value-objects/customer-id';
import { ProductId } from '../../domain/value-objects/product-id';
import { Money } from '../../domain/value-objects/money';

export class OrderBuilder {
  private _customerId = 'cust-1';
  private _lines: Array<{ productId: string; qty: number; price: number }> = [];
  private _submitted = false;

  forCustomer(customerId: string): this {
    this._customerId = customerId;
    return this;
  }

  withLine(productId: string, qty: number, price: number): this {
    this._lines.push({ productId, qty, price });
    return this;
  }

  submitted(): this {
    this._submitted = true;
    return this;
  }

  /**
   * Build an order that satisfies the given specification.
   * Throws if the built order doesn't match.
   */
  satisfying(spec: Specification<Order>): Order {
    const order = this.build();
    if (!spec.isSatisfiedBy(order)) {
      throw new Error(
        `Built order does not satisfy specification: ${spec}`,
      );
    }
    return order;
  }

  build(): Order {
    const order = Order.create(
      OrderId.generate(),
      CustomerId.of(this._customerId),
    );

    for (const line of this._lines) {
      order.addLine(
        ProductId.of(line.productId),
        line.qty,
        Money.of(line.price, 'USD'),
      );
    }

    if (this._submitted) {
      order.submit();
    }

    order.clearEvents();
    return order;
  }
}

// Usage in tests:
const overdueHighValueSpec = new IsOverdueOrder(30).and(new HasHighValue(1000));

const order = new OrderBuilder()
  .withLine('prod-1', 5, 300)   // $1500 total
  .submitted()
  .satisfying(overdueHighValueSpec);
```

## Edge Cases & Failure Modes

### 1. Specification Explosion

Creating too many fine-grained specifications leads to an explosion of classes. Use parameterized specifications to keep the count manageable:

```typescript
// Good: Parameterized (one class, many uses)
new OrderTotalGreaterThan(500)
new OrderTotalGreaterThan(1000)

// Bad: Separate classes for each threshold
class HighValueOrder { /* > $1000 */ }
class MediumValueOrder { /* > $500 */ }
class LowValueOrder { /* > $100 */ }
```

### 2. Performance in Large Collections

For in-memory filtering, specification evaluation is O(n) per item. For large collections:

| Collection Size | Simple Spec | Composed (3 AND) | Cost |
|----------------|------------|-------------------|------|
| 100 | 0.01 ms | 0.03 ms | Negligible |
| 10,000 | 1 ms | 3 ms | Acceptable |
| 1,000,000 | 100 ms | 300 ms | Use SQL-aware specs |
| 10,000,000 | 1 sec | 3 sec | Definitely use SQL |

### 3. SQL Generation Complexity

Deeply nested specifications generate deeply nested SQL:

```sql
-- 5 levels of AND/OR nesting:
WHERE ((((status = $1 AND total > $2) OR customer_id = $3) AND created_at > $4) OR category = $5)
```

Most databases handle this fine, but query plan complexity can increase. Monitor EXPLAIN ANALYZE output.

### 4. Specification vs. Entity Invariant

Not every rule belongs in a specification. Use this decision guide:

| Question | Specification | Entity Invariant |
|----------|--------------|-----------------|
| Does the rule describe a **query criterion**? | Yes | No |
| Does the rule prevent **invalid state**? | No | Yes |
| Is the rule **composed of other rules**? | Often | Rarely |
| Should violation cause an **exception**? | No (returns false) | Yes (throws) |
| Is the rule used for **categorization**? | Yes | No |

## Performance Characteristics

### Evaluation Cost

$$
T_{\text{spec}} = \sum_{i=1}^{k} T_{\text{leaf}_i} \cdot P(\text{reached}_i)
$$

Where $k$ is the number of leaf specifications and $P(\text{reached}_i)$ is the probability that leaf $i$ is evaluated (short-circuit evaluation may skip it).

For AND-composed specs, short-circuit means:

$$
T_{\text{AND}} = T_1 + P(\text{pass}_1) \cdot T_2 + P(\text{pass}_1) \cdot P(\text{pass}_2) \cdot T_3 + \ldots
$$

Order specs from most selective (highest rejection rate) to least selective for optimal performance.

### Memory Overhead

Each specification object is small:

| Specification Type | Size (bytes) | Notes |
|-------------------|-------------|-------|
| Leaf spec | ~50-100 | Object + closure/params |
| AND/OR composite | ~100 | Object + 2 references |
| NOT composite | ~60 | Object + 1 reference |
| Tree of 10 specs | ~700 | Typical complex rule |

::: info War Story
**The 47-Condition IF Statement**

A health insurance platform had a function `isEligibleForClaim()` that contained a single IF statement with 47 conditions connected by AND and OR operators. The function was 120 lines long. When regulators changed one eligibility rule, developers spent 3 days understanding which condition to change and 2 more days testing they hadn't broken the others.

After refactoring to specifications:

```typescript
const eligibility = new HasValidPolicy()
  .and(new PolicyCoversService(serviceType))
  .and(new WithinCoveragePeriod(serviceDate))
  .and(new DeductibleMet().or(new ExemptFromDeductible(serviceType)))
  .and(new NotExceedingAnnualMax())
  .and(new PreauthorizationObtained(serviceType).or(new IsEmergencyService()));
```

Each specification was independently tested with its own unit test suite. When the regulation changed (new pre-authorization rules for certain specialties), the team updated a single specification class and its tests. Total time: 2 hours.

Bonus: the specification's `toString()` output served as human-readable documentation for auditors:
```
(HasValidPolicy AND PolicyCoversService(SURGERY) AND WithinCoveragePeriod(2026-03-18)
AND (DeductibleMet OR ExemptFromDeductible(SURGERY)) AND NotExceedingAnnualMax
AND (PreauthorizationObtained(SURGERY) OR IsEmergencyService))
```
:::

## Mathematical Foundations

### Boolean Algebra

Specifications form a **Boolean algebra** $(B, \land, \lor, \lnot, 0, 1)$ where:

- $B$ = set of all specifications
- $\land$ = AND composition
- $\lor$ = OR composition
- $\lnot$ = NOT composition
- $0$ = `AlwaysFalse` specification
- $1$ = `AlwaysTrue` specification

The algebra satisfies:

$$
\begin{align}
S \land S &= S & \text{(Idempotent)} \\
S \land \top &= S & \text{(Identity)} \\
S \land \bot &= \bot & \text{(Annihilation)} \\
S \land (T \lor U) &= (S \land T) \lor (S \land U) & \text{(Distributive)} \\
\lnot(S \land T) &= \lnot S \lor \lnot T & \text{(De Morgan)}
\end{align}
$$

These laws can be used to simplify complex specification trees.

### Specification as Set Membership

A specification $S$ defines a subset of the universe $U$:

$$
\text{set}(S) = \{ x \in U : S.\text{isSatisfiedBy}(x) = \text{true} \}
$$

Composition maps directly to set operations:

$$
\text{set}(S_1 \land S_2) = \text{set}(S_1) \cap \text{set}(S_2) \\
\text{set}(S_1 \lor S_2) = \text{set}(S_1) \cup \text{set}(S_2) \\
\text{set}(\lnot S) = U \setminus \text{set}(S)
$$

## Decision Framework

### When to Use the Specification Pattern

| Situation | Use Specification? | Why |
|-----------|-------------------|-----|
| Rule is used for both validation and querying | **Yes** | Single source of truth |
| Rule is composed of sub-rules | **Yes** | Composability |
| Rule changes frequently | **Yes** | Isolated change |
| Rule is a simple one-liner | **No** | Over-engineering |
| Rule is an entity invariant | **No** | Use entity method |
| Rule requires external service call | **Carefully** | Spec should be fast; use a domain service instead |

### Specification vs. Alternatives

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **Specification Pattern** | Composable, testable, reusable | More classes | Complex, reusable business rules |
| **Predicate functions** | Simple, inline | Not composable, not queryable | One-off checks |
| **Strategy Pattern** | Swappable algorithm | Not composable | Varying algorithm, not rule composition |
| **Rule Engine (Drools, etc.)** | External rule management | Complex, performance overhead | Rules managed by non-developers |
| **Policy Pattern** | Groups related rules | Not individually composable | Authorization checks |

## Advanced Topics

### Generic Repository with Specifications

```typescript
// application/ports/specification-repository.ts
import type { QueryableSpecification } from '../../domain/specifications/queryable-specification';

export interface SpecificationRepository<T, TId> {
  findById(id: TId): Promise<T | null>;
  findAll(spec: QueryableSpecification<T>, options?: QueryOptions): Promise<T[]>;
  count(spec: QueryableSpecification<T>): Promise<number>;
  exists(spec: QueryableSpecification<T>): Promise<boolean>;
  save(entity: T): Promise<void>;
  delete(spec: QueryableSpecification<T>): Promise<number>;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}
```

### Specification with Explanation

For auditing and debugging, specifications can explain why they matched or didn't:

```typescript
export interface ExplainableSpecification<T> extends Specification<T> {
  explain(candidate: T): SpecificationResult;
}

export interface SpecificationResult {
  satisfied: boolean;
  rule: string;
  reason: string;
  children?: SpecificationResult[];
}

export class ExplainableHasMinimumTenure
  extends CompositeSpecification<Customer>
  implements ExplainableSpecification<Customer>
{
  constructor(private readonly minimumMonths: number) {
    super();
  }

  isSatisfiedBy(customer: Customer): boolean {
    return this.explain(customer).satisfied;
  }

  explain(customer: Customer): SpecificationResult {
    const months = this.monthsBetween(customer.createdAt, new Date());
    const satisfied = months >= this.minimumMonths;

    return {
      satisfied,
      rule: `Minimum tenure: ${this.minimumMonths} months`,
      reason: satisfied
        ? `Customer has ${months} months tenure (>= ${this.minimumMonths})`
        : `Customer has only ${months} months tenure (< ${this.minimumMonths})`,
    };
  }

  private monthsBetween(start: Date, end: Date): number {
    return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  }
}
```

### Async Specifications

For rules that require I/O (checking against external systems):

```typescript
export interface AsyncSpecification<T> {
  isSatisfiedBy(candidate: T): Promise<boolean>;
}

export class HasNoOutstandingDebt implements AsyncSpecification<Customer> {
  constructor(private readonly billingService: BillingService) {}

  async isSatisfiedBy(customer: Customer): Promise<boolean> {
    const balance = await this.billingService.getOutstandingBalance(customer.id);
    return balance.amount <= 0;
  }
}
```

::: warning
Async specifications should be used sparingly. They cannot be used for SQL generation and may cause N+1 problems when filtering collections. Prefer pre-loading the required data and using synchronous specifications.
:::

## Testing Specifications

```typescript
describe('PremiumCustomerSpec', () => {
  const customerLookup = (id: string) => null; // No referrals in these tests
  const spec = createPremiumCustomerSpec(customerLookup);

  it('should satisfy: 24-month tenure + $15K spend + active', () => {
    const customer = createTestCustomer({
      createdAt: monthsAgo(24),
      lifetimeSpend: 15_000,
      isActive: true,
    });
    expect(spec.isSatisfiedBy(customer)).toBe(true);
  });

  it('should not satisfy: 6-month tenure despite high spend', () => {
    const customer = createTestCustomer({
      createdAt: monthsAgo(6),
      lifetimeSpend: 50_000,
      isActive: true,
    });
    expect(spec.isSatisfiedBy(customer)).toBe(false);
  });

  it('should not satisfy: suspended customer despite qualifying', () => {
    const customer = createTestCustomer({
      createdAt: monthsAgo(24),
      lifetimeSpend: 15_000,
      isActive: true,
      isSuspended: true,
    });
    expect(spec.isSatisfiedBy(customer)).toBe(false);
  });

  it('should satisfy: referred by premium customer', () => {
    const referrer = createTestCustomer({
      id: 'referrer-1',
      createdAt: monthsAgo(24),
      lifetimeSpend: 15_000,
      isActive: true,
    });

    const lookup = (id: string) => id === 'referrer-1' ? referrer : null;
    const specWithReferral = createPremiumCustomerSpec(lookup);

    const customer = createTestCustomer({
      createdAt: monthsAgo(1), // New customer
      lifetimeSpend: 0,
      isActive: true,
      referredBy: 'referrer-1',
    });

    expect(specWithReferral.isSatisfiedBy(customer)).toBe(true);
  });
});
```

## Further Reading

- [Tactical Design](/architecture-patterns/domain-driven-design/tactical-design) — entities, value objects, and domain services
- [Anti-Corruption Layer](./anti-corruption-layer) — protecting domain model from external systems
- [DDD TypeScript Implementation](./typescript-implementation) — full project using specifications
- [Clean Architecture: Use Cases](/architecture-patterns/clean-architecture/use-cases) — using specifications in interactors
- [CQRS Projections](/architecture-patterns/cqrs-event-sourcing/projections) — SQL-aware specifications for read models
