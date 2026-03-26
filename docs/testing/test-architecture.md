---
title: "Test Architecture & Strategy"
description: "Design your test infrastructure for scale — fixtures, factories, builders, mocking strategies, flaky test prevention, test naming, and CI pipeline design for fast, reliable test suites."
tags: [testing, test-architecture, fixtures, mocking, ci-cd]
difficulty: intermediate
prerequisites: ["/testing/unit-testing", "/testing/integration-testing"]
lastReviewed: "2026-03-20"
---

# Test Architecture & Strategy

Writing individual tests is a skill. Organizing thousands of tests into a fast, reliable, maintainable suite is an engineering discipline. This page covers the structural decisions that determine whether your test suite is an asset that enables rapid shipping or a liability that slows every deploy.

## Test Fixtures, Factories, and Builders

Test data is the foundation of every test. How you create, manage, and clean up test data determines how readable, reliable, and maintainable your tests are.

### The Problem with Inline Data

```typescript
// BAD — data repeated in every test, hard to maintain
test('premium user gets free shipping', () => {
  const user = {
    id: 'usr-1',
    name: 'Alice',
    email: 'alice@example.com',
    tier: 'premium',
    createdAt: new Date('2025-01-01'),
    address: { street: '123 Main', city: 'NYC', zip: '10001' },
    preferences: { newsletter: true, darkMode: false },
  };
  const order = {
    id: 'ord-1',
    userId: 'usr-1',
    items: [{ productId: 'prod-1', quantity: 2, price: 5000 }],
    total: 10000,
    status: 'pending',
    createdAt: new Date(),
  };

  expect(calculateShipping(user, order)).toBe(0);
});
```

This test has 15 lines of setup and 1 line of assertion. When the `User` type gains a new required field, every test that creates a user breaks.

### Factory Functions

Factories create test objects with sensible defaults, allowing tests to override only the fields they care about.

```typescript
// test/factories/user-factory.ts
import { User } from '../../src/types';

let counter = 0;

export function createUser(overrides: Partial<User> = {}): User {
  counter++;
  return {
    id: `usr-${counter}`,
    name: `Test User ${counter}`,
    email: `user${counter}@test.com`,
    tier: 'standard',
    createdAt: new Date('2025-01-01'),
    address: {
      street: '123 Test St',
      city: 'Testville',
      zip: '00000',
    },
    preferences: {
      newsletter: false,
      darkMode: false,
    },
    ...overrides,
  };
}

export function createPremiumUser(overrides: Partial<User> = {}): User {
  return createUser({ tier: 'premium', ...overrides });
}
```

```typescript
// Now tests are focused and readable
test('premium user gets free shipping', () => {
  const user = createPremiumUser();
  const order = createOrder({ total: 10000 });

  expect(calculateShipping(user, order)).toBe(0);
});

test('standard user pays shipping', () => {
  const user = createUser({ tier: 'standard' });
  const order = createOrder({ total: 10000 });

  expect(calculateShipping(user, order)).toBe(599);
});
```

### The Builder Pattern

For complex objects with many optional configurations, the Builder pattern provides a fluent API.

```typescript
// test/builders/order-builder.ts
export class OrderBuilder {
  private order: Partial<Order> = {
    id: `ord-${Date.now()}`,
    status: 'pending',
    items: [],
    total: 0,
    createdAt: new Date(),
  };

  withId(id: string): this {
    this.order.id = id;
    return this;
  }

  withStatus(status: OrderStatus): this {
    this.order.status = status;
    return this;
  }

  withItem(product: string, quantity: number, price: number): this {
    this.order.items!.push({ productId: product, quantity, price });
    this.order.total! += quantity * price;
    return this;
  }

  withUser(userId: string): this {
    this.order.userId = userId;
    return this;
  }

  completedYesterday(): this {
    this.order.status = 'completed';
    this.order.completedAt = new Date(Date.now() - 86400000);
    return this;
  }

  build(): Order {
    return this.order as Order;
  }
}

// Usage
test('refund is available for orders completed within 30 days', () => {
  const order = new OrderBuilder()
    .withItem('prod-1', 1, 5000)
    .completedYesterday()
    .build();

  expect(isRefundEligible(order)).toBe(true);
});
```

### Python Factories with factory_boy

```python
import factory
from app.models import User, Order

class UserFactory(factory.Factory):
    class Meta:
        model = User

    id = factory.Sequence(lambda n: f"usr-{n}")
    name = factory.Faker("name")
    email = factory.Sequence(lambda n: f"user{n}@test.com")
    tier = "standard"
    created_at = factory.LazyFunction(datetime.utcnow)

class PremiumUserFactory(UserFactory):
    tier = "premium"

class OrderFactory(factory.Factory):
    class Meta:
        model = Order

    id = factory.Sequence(lambda n: f"ord-{n}")
    user = factory.SubFactory(UserFactory)
    total = 10000
    status = "pending"

# Usage
def test_premium_user_gets_free_shipping():
    user = PremiumUserFactory()
    order = OrderFactory(user=user, total=10000)

    assert calculate_shipping(user, order) == 0
```

### Go Test Helpers

```go
// testutil/factories.go
func NewTestUser(t *testing.T, opts ...func(*User)) *User {
    t.Helper()
    user := &User{
        ID:    uuid.New().String(),
        Name:  "Test User",
        Email: fmt.Sprintf("test-%d@example.com", time.Now().UnixNano()),
        Tier:  "standard",
    }
    for _, opt := range opts {
        opt(user)
    }
    return user
}

func WithTier(tier string) func(*User) {
    return func(u *User) { u.Tier = tier }
}

func WithEmail(email string) func(*User) {
    return func(u *User) { u.Email = email }
}

// Usage
func TestFreeShipping(t *testing.T) {
    user := NewTestUser(t, WithTier("premium"))
    order := NewTestOrder(t, WithTotal(10000))

    shipping := CalculateShipping(user, order)
    if shipping != 0 {
        t.Errorf("expected 0, got %d", shipping)
    }
}
```

## Mocking Strategies and Anti-Patterns

### The Mocking Spectrum

```mermaid
graph LR
    NO["No Mocking<br/>(real objects)"]
    FAKE["Fakes<br/>(in-memory DB)"]
    STUB["Stubs<br/>(canned responses)"]
    MOCK["Mocks<br/>(verify interactions)"]
    OVER["Over-Mocking<br/>(mock everything)"]

    NO --- FAKE
    FAKE --- STUB
    STUB --- MOCK
    MOCK --- OVER

    style NO fill:#16a34a,color:#fff
    style FAKE fill:#2563eb,color:#fff
    style STUB fill:#ea580c,color:#fff
    style MOCK fill:#7c3aed,color:#fff
    style OVER fill:#dc2626,color:#fff
```

| Strategy | When to Use | When to Avoid |
|----------|------------|---------------|
| **No mocking** | Pure functions, value objects | Functions with external dependencies |
| **Fakes** | Database repositories, file storage | When the fake diverges from real behavior |
| **Stubs** | Controlling inputs from dependencies | When you need to verify the dependency was called |
| **Mocks** | Verifying important side effects (email, payment) | For internal implementation details |
| **No mocking** | Never | Mocking your own code's internal methods |

### Anti-Pattern: Mocking What You Do Not Own

```typescript
// BAD — mocking a third-party library directly
vi.mock('stripe', () => ({
  Stripe: vi.fn().mockReturnValue({
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_123' }),
    },
  }),
}));
```

If Stripe changes their SDK interface, your mocks keep passing but your code breaks. Instead, wrap the third-party library in your own adapter and mock the adapter.

```typescript
// GOOD — own the interface, mock your wrapper
interface PaymentGateway {
  createCustomer(email: string): Promise<{ id: string }>;
}

// Production: uses real Stripe
class StripeGateway implements PaymentGateway { ... }

// Test: stub your interface
const gateway: PaymentGateway = {
  createCustomer: vi.fn().mockResolvedValue({ id: 'cus_123' }),
};
```

This is the [Ports and Adapters](/architecture-patterns/hexagonal/ports-and-adapters) pattern applied to testing.

### Anti-Pattern: Testing Implementation via Mocks

```typescript
// BAD — testing HOW the code works, not WHAT it does
test('processes order', async () => {
  const repo = { save: vi.fn() };
  const service = new OrderService(repo);

  await service.process(order);

  // These assertions are implementation details
  expect(repo.save).toHaveBeenCalledTimes(1);
  expect(repo.save).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'processed' })
  );
});

// GOOD — testing observable outcomes
test('marks order as processed', async () => {
  const repo = new FakeOrderRepository();
  const service = new OrderService(repo);

  await service.process(order);

  const saved = await repo.findById(order.id);
  expect(saved.status).toBe('processed');
});
```

::: warning The Mock Smell Test
If your test has more mock setup than assertions, something is wrong. Either the code has too many dependencies (refactor it) or you are testing implementation details (test behavior instead).
:::

## Test Data Management

### Strategies by Test Type

| Test Type | Data Strategy | Isolation |
|-----------|--------------|-----------|
| **[Unit tests](/testing/unit-testing)** | In-memory factories | Per test (inherent) |
| **[Integration tests](/testing/integration-testing)** | Database factories + transaction rollback | Per test |
| **[E2E tests](/testing/e2e-testing)** | API seeding + cleanup | Per test |
| **[Contract tests](/testing/contract-testing)** | Provider states | Per interaction |

### The Test Data Pyramid

```mermaid
graph TB
    subgraph DataPyramid["Test Data Strategy"]
        SEED["Seeded Reference Data<br/>Countries, currencies, config<br/>Loaded once per suite"]
        FACTORY["Factory-Generated Data<br/>Users, orders, products<br/>Created per test"]
        INLINE["Inline Data<br/>Specific values for this test<br/>Only when the value matters"]
    end

    SEED --- FACTORY
    FACTORY --- INLINE

    style SEED fill:#16a34a,color:#fff
    style FACTORY fill:#2563eb,color:#fff
    style INLINE fill:#ea580c,color:#fff
```

## Flaky Test Prevention

Flaky tests — tests that sometimes pass and sometimes fail with no code change — are the single biggest threat to a test suite's credibility. When engineers stop trusting the suite, they stop running it.

### Root Causes and Fixes

| Cause | Symptom | Fix |
|-------|---------|-----|
| **Time dependence** | Fails on New Year's, month boundaries | Inject a clock; use fixed timestamps in tests |
| **Order dependence** | Fails only when run after test X | Ensure each test sets up and tears down its own state |
| **Race conditions** | Passes locally, fails in CI | Use `waitFor` patterns; avoid `sleep()`; synchronize properly |
| **Shared mutable state** | Fails intermittently in parallel mode | Isolate state per test; reset singletons in `beforeEach` |
| **Network calls** | Fails when DNS/API is slow | Mock external calls in [unit tests](/testing/unit-testing); use Testcontainers for [integration tests](/testing/integration-testing) |
| **Floating point** | `0.1 + 0.2 !== 0.3` | Use `toBeCloseTo()` or integer arithmetic (cents, not dollars) |
| **Random data** | Test fails on specific random values | Use seeded random generators; pin seeds in CI |

### Time Dependence Fix

```typescript
// BAD — uses real time, will fail someday
function isExpired(token: Token): boolean {
  return token.expiresAt < new Date();
}

// GOOD — injectable clock
function isExpired(token: Token, now: Date = new Date()): boolean {
  return token.expiresAt < now;
}

// Test
test('token expired 1 second ago is expired', () => {
  const now = new Date('2026-03-20T12:00:00Z');
  const token = { expiresAt: new Date('2026-03-20T11:59:59Z') };
  expect(isExpired(token, now)).toBe(true);
});
```

### Quarantine Pattern

When a test starts flaking, quarantine it immediately:

```typescript
// Mark as skipped with a tracking issue
test.skip('flaky: handles concurrent updates', () => {
  // TODO: Fix race condition — https://github.com/org/repo/issues/234
});
```

Track quarantined tests as bugs with the same urgency as production bugs. Set a policy: quarantined tests must be fixed or deleted within 48 hours.

## Test Organization and Naming

### Directory Structure

```
src/
  services/
    order-service.ts
    user-service.ts
  repositories/
    order-repository.ts
tests/
  unit/
    services/
      order-service.test.ts      # Mirrors src structure
      user-service.test.ts
  integration/
    repositories/
      order-repository.test.ts   # Tests against real DB
    api/
      users-api.test.ts          # API endpoint tests
  e2e/
    flows/
      checkout.spec.ts           # User flow tests
      signup.spec.ts
    pages/
      login.page.ts              # Page objects
      dashboard.page.ts
  fixtures/
    users.ts                     # Shared factories
    orders.ts
  helpers/
    test-database.ts             # DB setup/teardown
    test-server.ts               # Server setup
```

### Naming Conventions

Test names should describe a scenario clearly enough that a failing test tells you what broke without reading the source code.

```
Pattern: [unit]_[scenario]_[expected result]

Good:
  calculateShipping_premiumUser_returnsFreeShipping
  validateEmail_missingAtSign_throwsValidationError
  createOrder_insufficientStock_returnsOutOfStockError

Bad:
  test1
  testCalculateShipping
  it works
  handles edge case
```

For BDD-style (describe/it):

```typescript
describe('OrderService', () => {
  describe('createOrder', () => {
    describe('when stock is available', () => {
      it('creates the order and reserves inventory', () => { ... });
      it('publishes an OrderCreated event', () => { ... });
    });

    describe('when stock is insufficient', () => {
      it('throws an InsufficientStockError', () => { ... });
      it('does not charge the customer', () => { ... });
    });
  });
});
```

## CI Test Pipeline Design

### The Optimal Pipeline

```mermaid
graph LR
    subgraph Fast["Fast Feedback (< 3 min)"]
        LINT["Lint + Types"]
        UNIT["Unit Tests"]
    end

    subgraph Medium["Medium Feedback (< 10 min)"]
        INT["Integration Tests"]
        CONTRACT["Contract Tests"]
    end

    subgraph Slow["Slow Feedback (< 20 min)"]
        E2E["E2E Tests"]
        VISUAL["Visual Regression"]
    end

    LINT --> UNIT
    UNIT --> INT
    UNIT --> CONTRACT
    INT --> E2E
    CONTRACT --> E2E
    E2E --> VISUAL

    style LINT fill:#16a34a,color:#fff
    style UNIT fill:#16a34a,color:#fff
    style INT fill:#ea580c,color:#fff
    style CONTRACT fill:#ea580c,color:#fff
    style E2E fill:#dc2626,color:#fff
    style VISUAL fill:#dc2626,color:#fff
```

### Pipeline Principles

1. **Fail fast.** Run the fastest tests first. If linting fails, do not waste 10 minutes on integration tests.

2. **Parallelize aggressively.** Unit tests and contract tests can run simultaneously. [Integration tests](/testing/integration-testing) for different services can run in parallel.

3. **Cache dependencies.** Docker images, npm packages, and compiled artifacts should be cached between runs. See [GitHub Actions Deep Dive](/infrastructure/ci-cd/github-actions-deep-dive) for caching strategies.

4. **Report clearly.** Use JUnit XML output for CI integration. Upload test artifacts (screenshots, traces, coverage reports) on failure.

5. **Gate deploys on all tests.** Never deploy if any test stage fails. "It's probably just flaky" is how production incidents start.

### GitHub Actions Example

```yaml
name: Test Pipeline
on: [push, pull_request]

jobs:
  lint-and-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  integration:
    needs: lint-and-unit
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test

  e2e:
    needs: integration
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1/3, 2/3, 3/3]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test --shard=${​{ matrix.shard }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-report-${​{ matrix.shard }}
          path: playwright-report/
```

## Test Coverage Strategy

### What to Measure

| Metric | What It Tells You | Target |
|--------|------------------|--------|
| **Line coverage** | Which lines were executed | Informational only |
| **Branch coverage** | Which if/else paths were taken | More useful than line |
| **Function coverage** | Which functions were called | Useful for spotting dead code |
| **Mutation score** | How many code mutations were caught | The gold standard for test quality |

### Mutation Testing

Coverage tells you what code was *executed* by tests. Mutation testing tells you what code was *verified* by tests. It works by making small changes to your code (mutations) and checking if any test fails.

```typescript
// Original code
function isAdult(age: number): boolean {
  return age >= 18;
}

// Mutation: change >= to >
function isAdult(age: number): boolean {
  return age > 18;  // MUTANT
}

// If no test fails, your test suite does not actually verify
// the boundary condition at age 18
```

Tools: **Stryker** (JavaScript/TypeScript), **mutmut** (Python), **pitest** (Java).

::: tip Coverage as a Ratchet, Not a Target
Instead of mandating a coverage percentage, use a coverage ratchet: coverage must never *decrease*. This ensures new code is tested without forcing engineers to write meaningless tests to hit an arbitrary number.
:::

## Test Suite Health Metrics

Track these metrics over time to monitor your test suite's health:

| Metric | Healthy | Concerning | Critical |
|--------|---------|------------|----------|
| **Unit test run time** | < 60s | 1-3 min | > 5 min |
| **Integration test run time** | < 5 min | 5-15 min | > 15 min |
| **E2E test run time** | < 15 min | 15-30 min | > 30 min |
| **Flaky test rate** | < 0.5% | 0.5-2% | > 2% |
| **Test-to-code ratio** | 1:1 to 3:1 | < 0.5:1 | No tests |
| **Time to debug a failure** | < 5 min | 5-30 min | > 30 min |

## Key Takeaway

::: tip
- Factory functions and builders eliminate brittle inline test data — tests override only the fields they care about, so adding a new required field to a type does not break hundreds of tests.
- Mock only what you do not own by wrapping third-party libraries in your own adapters — mocking implementation details couples tests to internal structure and causes false failures on every refactor.
- Flaky tests are production-severity bugs that erode trust in the entire suite — quarantine them immediately, fix within 48 hours, and track root causes (time dependence, shared state, race conditions) systematically.
:::

## Common Misconceptions

::: warning Misconception: More mocking makes tests better isolated
Over-mocking replaces real behavior with assumptions about implementation. If your test has more mock setup than assertions, you are testing your mocks, not your code. Default to real objects, use fakes for external dependencies, and reserve mocks for verifying important side effects.
:::

::: warning Misconception: Test coverage percentage is the best measure of test quality
Coverage measures which lines were executed, not whether assertions are meaningful. Mutation testing is the gold standard — it checks whether your tests actually *detect* code changes. A coverage ratchet (coverage must never decrease) is more useful than a fixed target.
:::

::: warning Misconception: Flaky tests are normal and acceptable
Teams that tolerate flaky tests train engineers to ignore failures. When ignoring failures becomes habit, real bugs slip through. Every flaky test has a root cause (time dependence, shared state, race conditions), and each one must be treated as a bug with the same urgency as production issues.
:::

::: warning Misconception: Test structure should mirror source code structure exactly
Mirroring source structure is a reasonable starting convention, but test organization should prioritize discoverability. Group tests by behavior or feature rather than by class name. A test named `calculateShipping_premiumUser_returnsFreeShipping` is worth more than `OrderServiceTest.test1`.
:::

## Quick Quiz

**1. What is the primary advantage of factory functions over inline test data?**
- A) They run faster
- B) They centralize defaults so adding a new required field does not break all tests
- C) They use less memory
- D) They produce random data for property-based testing

::: details Answer
**B) They centralize defaults so adding a new required field does not break all tests.** When you add a new required field to a type, you update one factory function instead of fixing hundreds of tests. Tests override only the fields they care about, making them focused and readable.
:::

**2. Why should you NOT mock third-party libraries directly?**
- A) Third-party libraries are too complex to mock
- B) Mocking is too slow for third-party code
- C) If the library changes its interface, your mocks keep passing but your code breaks
- D) Mocking libraries is against their license terms

::: details Answer
**C) If the library changes its interface, your mocks keep passing but your code breaks.** Wrap third-party libraries in your own adapter (Ports and Adapters pattern) and mock the adapter. This way, a library API change is caught at compile time in one place, not silently hidden by mocks.
:::

**3. What does mutation testing measure that code coverage does not?**
- A) How many lines of code were executed
- B) How fast the tests run
- C) Whether tests actually detect code changes (mutations)
- D) The number of test files in the project

::: details Answer
**C) Whether tests actually detect code changes (mutations).** Mutation testing makes small changes to your code (like changing `>=` to `>`) and checks if any test fails. If no test catches the change, the test suite has a gap — even if coverage says 100%.
:::

**4. What is the recommended fix for time-dependent flaky tests?**
- A) Add retry logic to the test
- B) Increase the timeout
- C) Inject a clock and use fixed timestamps in tests
- D) Skip the test in CI

::: details Answer
**C) Inject a clock and use fixed timestamps in tests.** Time dependence is the most common cause of flaky tests. By injecting a clock (or using `vi.useFakeTimers()` / `freezegun`), you make tests deterministic regardless of when they run.
:::

**5. In the optimal CI pipeline, what should run FIRST?**
- A) E2E tests for maximum confidence
- B) Integration tests for real dependencies
- C) Lint and type checks followed by unit tests
- D) Visual regression tests

::: details Answer
**C) Lint and type checks followed by unit tests.** Fail fast. If linting or type checks fail, there is no point spending 10 minutes on integration or E2E tests. Run the fastest, cheapest checks first.
:::

## Try It Yourself

**Exercise: Build a test factory system**

Create a factory system for an e-commerce domain with `User`, `Product`, and `Order` types. Requirements:
1. Each factory should provide sensible defaults
2. Factories should support partial overrides
3. Build a `createPremiumUser()` convenience factory
4. Build an `OrderBuilder` with a fluent API for adding items

::: details Solution
```typescript
// Types
interface User {
  id: string;
  name: string;
  email: string;
  tier: 'standard' | 'premium';
}

interface Product {
  id: string;
  name: string;
  price: number; // in cents
  stock: number;
}

interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'completed' | 'cancelled';
}

// Factories
let userCounter = 0;
function createUser(overrides: Partial<User> = {}): User {
  userCounter++;
  return {
    id: `usr-${userCounter}`,
    name: `Test User ${userCounter}`,
    email: `user${userCounter}@test.com`,
    tier: 'standard',
    ...overrides,
  };
}

function createPremiumUser(overrides: Partial<User> = {}): User {
  return createUser({ tier: 'premium', ...overrides });
}

let productCounter = 0;
function createProduct(overrides: Partial<Product> = {}): Product {
  productCounter++;
  return {
    id: `prod-${productCounter}`,
    name: `Test Product ${productCounter}`,
    price: 1999,
    stock: 100,
    ...overrides,
  };
}

// Builder
class OrderBuilder {
  private order: Partial<Order> = {
    id: `ord-${Date.now()}`,
    items: [],
    total: 0,
    status: 'pending',
  };

  forUser(userId: string): this {
    this.order.userId = userId;
    return this;
  }

  withItem(productId: string, quantity: number, price: number): this {
    this.order.items!.push({ productId, quantity, price });
    this.order.total! += quantity * price;
    return this;
  }

  completed(): this {
    this.order.status = 'completed';
    return this;
  }

  build(): Order {
    return this.order as Order;
  }
}

// Usage in tests
test('premium user gets free shipping', () => {
  const user = createPremiumUser();
  const order = new OrderBuilder()
    .forUser(user.id)
    .withItem('prod-1', 2, 2500)
    .build();

  expect(calculateShipping(user, order)).toBe(0);
});
```
:::

---

> **One-Liner Summary:** Test architecture is what separates a test suite that enables fearless shipping from one that makes every deploy a gamble — invest in factories, fight flakiness, and fail fast in CI.

## Further Reading

- [Unit Testing](/testing/unit-testing) — the patterns that test architecture organizes at scale
- [Integration Testing](/testing/integration-testing) — Testcontainers and database testing patterns
- [E2E Testing](/testing/e2e-testing) — Page Object Model and CI integration
- [Pipeline Patterns](/infrastructure/ci-cd/pipeline-patterns) — CI/CD pipeline design beyond testing
- [GitHub Actions Deep Dive](/infrastructure/ci-cd/github-actions-deep-dive) — caching, parallelization, and artifact management
- [Monitoring Anti-Patterns](/devops/monitoring/monitoring-antipatterns) — the production-side equivalent of test anti-patterns
