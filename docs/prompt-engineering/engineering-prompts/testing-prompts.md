---
title: "Testing Prompts"
description: "25+ production-ready prompts for generating comprehensive test suites with AI assistants"
tags: [prompt-engineering, testing, quality-assurance, tdd, test-automation]
difficulty: "intermediate"
prerequisites: [code-generation-prompts]
lastReviewed: "2026-03-18"
---

# Testing Prompts

## Why Testing Prompts Exist

Testing is the engineering practice with the widest gap between what teams know they should do and what they actually do. Every developer agrees that tests are important. Yet studies consistently show that test coverage in production codebases averages 40-60%, with critical paths often under-tested and edge cases routinely missed.

The problem is not willingness — it is cognitive load. Writing thorough tests requires thinking about the system from a completely different angle than building it. When a developer writes code, they think about the happy path — how things should work. Testing requires thinking about how things can fail, what happens at boundaries, what assumptions are implicit, and what combinations of inputs are dangerous.

AI-assisted testing solves this by bringing a systematic, exhaustive approach to test case generation. The prompts in this library encode the testing expertise of QA engineers, security testers, performance engineers, and reliability engineers into reusable templates that ensure nothing is missed.

::: tip The Testing Paradox
Dijkstra wrote in 1970: "Testing can show the presence of bugs, but never their absence." This remains true. But formal methods (which can prove absence) are impractical for most systems. The pragmatic approach is to maximize the probability of finding bugs through systematic testing — which is exactly what these prompts do.
:::

## First Principles of Testing

### The Testing Pyramid

The testing pyramid, introduced by Mike Cohn, defines the optimal distribution of test types:

```mermaid
graph TD
    subgraph Pyramid
        E2E["E2E Tests (5-10%)<br>Slow, expensive, high confidence"]
        INT["Integration Tests (15-25%)<br>Medium speed, medium cost"]
        UNIT["Unit Tests (65-80%)<br>Fast, cheap, focused"]
    end
    E2E --> INT --> UNIT
```

$$
\text{Test Suite Value} = \sum_{i=1}^{n} \frac{\text{Bug Detection}_i \times \text{Confidence}_i}{\text{Maintenance Cost}_i \times \text{Execution Time}_i}
$$

Each test should maximize bug detection and confidence while minimizing maintenance cost and execution time.

### Test Properties (FIRST)

- **Fast**: Unit tests < 100ms each, full suite < 5 minutes
- **Isolated**: No test depends on another test
- **Repeatable**: Same result every time, on any machine
- **Self-validating**: Pass or fail, no manual inspection
- **Timely**: Written before or alongside the code

### The Behavior Spectrum

```mermaid
flowchart LR
    A[Input Space] --> B[System Under Test]
    B --> C[Output Space]

    A --> A1[Valid inputs]
    A --> A2[Invalid inputs]
    A --> A3[Boundary inputs]
    A --> A4[Null/empty inputs]
    A --> A5[Extreme inputs]

    C --> C1[Expected outputs]
    C --> C2[Error responses]
    C --> C3[Side effects]
    C --> C4[State changes]
    C --> C5[Performance characteristics]
```

## Core Mechanics

### The Test Design Process

```mermaid
flowchart TD
    A[Code/Feature to Test] --> B[Identify Test Boundaries]
    B --> C[Enumerate Scenarios]
    C --> D[Prioritize by Risk]
    D --> E[Write Test Cases]
    E --> F[Implement Tests]
    F --> G[Verify Coverage]
    G --> H{Adequate?}
    H -->|No| C
    H -->|Yes| I[Maintain & Evolve]
```

### Prompt Structure for Testing

```
[CODE UNDER TEST]: The specific code to test
[CONTEXT]: System context, dependencies, constraints
[TEST TYPE]: Unit / Integration / E2E / Performance / Security
[COVERAGE GOALS]: Line, branch, mutation testing targets
[QUALITY REQUIREMENTS]: Flakiness tolerance, speed requirements
```

## Implementation — The Complete Prompt Library

### Category 1: Unit Testing (7 Prompts)

#### Prompt 1 — Exhaustive Unit Test Generation

```text
Generate an exhaustive unit test suite for this code:

```typescript
[PASTE CODE HERE]
```

TECH STACK: TypeScript, Vitest (or Jest)

For EVERY public method, test:

1. **Happy Path Tests**:
   - Normal input, expected output
   - Multiple valid input variations
   - Return value verification
   - State change verification

2. **Edge Case Tests**:
   - Empty string / empty array / empty object
   - Single element / single character
   - Maximum valid values
   - Minimum valid values
   - Unicode characters
   - Very long strings / very large numbers

3. **Error Case Tests**:
   - null / undefined inputs
   - Wrong type inputs (if JavaScript can reach the code)
   - Invalid format (malformed email, invalid date)
   - Missing required fields
   - Extra unexpected fields

4. **Boundary Value Tests**:
   - Exactly at limits (off-by-one testing)
   - One below minimum
   - One above maximum
   - Zero / negative values for quantities
   - Date boundaries (midnight, DST transitions, leap years)

5. **State Tests**:
   - Initial state before any operation
   - State after single operation
   - State after multiple operations
   - State after error (ensure no corruption)

6. **Interaction Tests** (for dependencies):
   - Verify dependency called with correct arguments
   - Verify dependency called correct number of times
   - Verify behavior when dependency throws
   - Verify behavior when dependency returns unexpected values

TEST STRUCTURE:
```typescript
describe('ClassName', () => {
  describe('methodName', () => {
    it('should [expected behavior] when [condition]', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

NAMING CONVENTION:
- `should return X when given Y`
- `should throw ErrorType when condition`
- `should call dependency with correct args`
- `should not modify state when operation fails`

Generate at least 5 tests per public method.
Mock all external dependencies using vi.mock() or vi.fn().
```

#### Prompt 2 — Test-Driven Development (TDD) Prompt

```text
I want to implement this feature using TDD:

FEATURE: [Describe the feature to implement]
INTERFACE: [Define the public interface — function signatures, class API]
CONSTRAINTS: [Performance, security, or behavioral constraints]

Guide me through the TDD cycle (Red-Green-Refactor):

STEP 1 — Write the first failing test:
- What is the simplest behavior to test first?
- Write the test that defines the expected behavior
- The test must fail because the code doesn't exist yet

STEP 2 — Write minimal code to pass:
- Write the absolute minimum code to make the test pass
- Don't add anything the test doesn't require
- Hardcode values if that makes the test pass (seriously)

STEP 3 — Refactor:
- Clean up the code while keeping tests green
- Remove duplication
- Improve naming

STEP 4 — Next test:
- What is the next simplest behavior to add?
- Follow the same Red-Green-Refactor cycle

ORDERING:
Start with:
1. Simplest happy path (degenerate case)
2. Next simplest happy path
3. Error cases
4. Edge cases
5. Complex scenarios

For each cycle, provide:
```typescript
// TEST (Red)
it('should ...', () => {
  // This test should fail
});

// IMPLEMENTATION (Green)
function feature() {
  // Minimal code to pass
}

// REFACTOR
// What to clean up at this step
```

Guide through at least 10 Red-Green-Refactor cycles.
```

#### Prompt 3 — Property-Based Testing

```text
Generate property-based tests for this code:

```typescript
[PASTE CODE HERE]
```

TOOL: fast-check (or similar property-based testing library)

Instead of specific examples, define PROPERTIES that must hold
for ALL valid inputs:

1. **Invariant Properties** (always true):
   - Sorting: output length equals input length
   - Encryption: decrypt(encrypt(x)) === x (roundtrip)
   - Serialization: deserialize(serialize(x)) deep-equals x
   - Idempotence: f(f(x)) === f(x) for idempotent operations

2. **Relational Properties** (relationship between inputs/outputs):
   - Monotonicity: if a < b then f(a) <= f(b)
   - Commutativity: f(a, b) === f(b, a)
   - Associativity: f(f(a, b), c) === f(a, f(b, c))
   - Distributivity: f(a, b + c) === f(a, b) + f(a, c)

3. **Contract Properties** (preconditions and postconditions):
   - If precondition met, postcondition holds
   - If precondition not met, error is thrown (not silent failure)

4. **Oracle Properties** (compare against simple implementation):
   - Fast implementation matches slow-but-correct implementation
   - New implementation matches old implementation

ARBITRARIES (input generators):
```typescript
import fc from 'fast-check';

// Custom generators for domain types
const emailArbitrary = fc.tuple(
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnop'), { minLength: 1, maxLength: 20 }),
  fc.constantFrom('gmail.com', 'example.com', 'test.org')
).map(([local, domain]) => `${local}@${domain}`);

const moneyArbitrary = fc.record({
  amount: fc.integer({ min: 0, max: 1_000_000_00 }), // cents
  currency: fc.constantFrom('USD', 'EUR', 'GBP'),
});
```

For each property:
```typescript
it('should [property description]', () => {
  fc.assert(
    fc.property(arbitrary, (input) => {
      const result = functionUnderTest(input);
      // Assert property holds
    }),
    { numRuns: 1000 }
  );
});
```

Generate at least 10 property-based tests.
Include shrinking examples (when a test fails, show minimal failing case).
```

#### Prompt 4 — Snapshot Testing Strategy

```text
Generate a snapshot testing strategy for:

```typescript
[PASTE COMPONENT OR SERIALIZABLE OUTPUT CODE]
```

WHEN TO USE SNAPSHOTS:
- UI component rendering
- API response structures
- Configuration file generation
- Error message formatting
- Serialized data structures

WHEN NOT TO USE SNAPSHOTS:
- Logic testing (use assertions instead)
- Dynamic data (timestamps, random IDs)
- Large outputs (hard to review diffs)

SNAPSHOT GUIDELINES:
1. **Focused snapshots**: Snapshot specific parts, not entire DOM trees
2. **Named snapshots**: Descriptive names for multi-snapshot tests
3. **Stable data**: Mock all non-deterministic data
4. **Review discipline**: Actually review snapshot changes in PRs

FOR EACH COMPONENT/FUNCTION:

```typescript
describe('ComponentName', () => {
  it('should render default state', () => {
    const result = render(<Component />);
    expect(result).toMatchSnapshot();
  });

  it('should render loading state', () => {
    const result = render(<Component loading />);
    expect(result).toMatchSnapshot();
  });

  it('should render error state', () => {
    const result = render(<Component error="Something went wrong" />);
    expect(result).toMatchSnapshot();
  });

  it('should render with data', () => {
    const result = render(<Component data={mockData} />);
    expect(result).toMatchSnapshot();
  });
});
```

INLINE SNAPSHOTS for small outputs:
```typescript
it('should format error message', () => {
  expect(formatError(new NotFoundError('User'))).toMatchInlineSnapshot(`
    {
      "code": "NOT_FOUND",
      "message": "User not found",
      "status": 404
    }
  `);
});
```

OUTPUT:
1. Snapshot test files
2. Mock data for consistent snapshots
3. Snapshot update guidelines
4. CI/CD snapshot handling configuration
```

#### Prompt 5 — Mock and Stub Strategy

```text
Design a mocking strategy for testing this code:

```typescript
[PASTE CODE WITH EXTERNAL DEPENDENCIES]
```

DEPENDENCIES TO MOCK:
[List all external dependencies — database, API clients, file system, etc.]

FOR EACH DEPENDENCY:

1. **Mock Type Selection**:
   - **Stub**: Returns canned data (for queries)
   - **Mock**: Verifies interactions (for commands)
   - **Fake**: Working implementation with shortcuts (in-memory database)
   - **Spy**: Wraps real implementation, records calls

2. **Implementation**:
```typescript
// Typed mock factory
function createMockUserRepository(): jest.Mocked<UserRepository> {
  return {
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (data) => ({
      id: 'mock-id',
      ...data,
      createdAt: new Date('2026-01-01'),
    })),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}
```

3. **Shared Test Fixtures**:
```typescript
// fixtures/users.ts
export const testUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'editor',
  createdAt: new Date('2026-01-01'),
};

export const testAdmin: User = {
  ...testUser,
  id: 'admin-456',
  email: 'admin@example.com',
  role: 'admin',
};
```

4. **Mock Reset Strategy**:
```typescript
beforeEach(() => {
  vi.clearAllMocks(); // Reset call counts and implementations
});

afterAll(() => {
  vi.restoreAllMocks(); // Restore original implementations
});
```

ANTI-PATTERNS TO AVOID:
- Over-mocking: Don't mock the unit under test
- Under-mocking: Don't let real I/O happen in unit tests
- Mock implementation leakage: Tests shouldn't know mock internals
- God mock: Don't create one mock that does everything

OUTPUT:
1. Mock factory for each dependency
2. Shared test fixtures
3. Test helpers (setup, teardown)
4. Mock configuration patterns
5. Guidelines for when to mock vs when to use real
```

#### Prompt 6 — Error Handling Test Suite

```text
Generate tests that verify error handling:

```typescript
[PASTE CODE WITH ERROR HANDLING]
```

TEST EVERY ERROR PATH:

1. **Expected Errors** (operational):
   ```typescript
   it('should throw NotFoundError when user does not exist', async () => {
     mockRepo.findById.mockResolvedValue(null);
     await expect(service.getUser('nonexistent'))
       .rejects.toThrow(NotFoundError);
   });

   it('should include the resource ID in NotFoundError', async () => {
     mockRepo.findById.mockResolvedValue(null);
     await expect(service.getUser('missing-id'))
       .rejects.toMatchObject({
         code: 'NOT_FOUND',
         message: expect.stringContaining('missing-id'),
       });
   });
   ```

2. **Unexpected Errors** (programmer errors):
   ```typescript
   it('should propagate database errors as InternalError', async () => {
     mockRepo.findById.mockRejectedValue(new Error('Connection refused'));
     await expect(service.getUser('any-id'))
       .rejects.toThrow(InternalError);
   });
   ```

3. **Error Propagation**:
   - Verify errors include proper context
   - Verify error cause chain is preserved
   - Verify sensitive data is not in error messages
   - Verify error logging occurs

4. **Error Recovery**:
   - Verify state is not corrupted after error
   - Verify partial operations are rolled back
   - Verify resources are cleaned up (connections, file handles)
   - Verify retry logic triggers on transient errors

5. **Validation Errors**:
   - Every validation rule has a test
   - Error messages are helpful
   - Multiple validation errors are collected (not just first)
   - Field-level error paths are correct

6. **Timeout Errors**:
   - Operations timeout after configured duration
   - Timeout error includes what timed out
   - Resources released on timeout

Generate tests for EVERY throw/reject/error-return in the code.
```

#### Prompt 7 — Concurrency Test Suite

```text
Generate tests for concurrent behavior:

```typescript
[PASTE CODE HANDLING CONCURRENT OPERATIONS]
```

TEST SCENARIOS:

1. **Race Condition Detection**:
   ```typescript
   it('should handle concurrent updates without data loss', async () => {
     const results = await Promise.all([
       service.incrementCounter('counter-1'),
       service.incrementCounter('counter-1'),
       service.incrementCounter('counter-1'),
     ]);
     const final = await service.getCounter('counter-1');
     expect(final.value).toBe(3);
   });
   ```

2. **Optimistic Concurrency**:
   ```typescript
   it('should reject stale updates', async () => {
     const v1 = await service.getItem('item-1');
     const v1Copy = { ...v1 }; // Simulate second reader

     await service.updateItem('item-1', { ...v1, name: 'Updated' });

     // This should fail because version is stale
     await expect(
       service.updateItem('item-1', { ...v1Copy, name: 'Conflict' })
     ).rejects.toThrow(ConflictError);
   });
   ```

3. **Idempotency**:
   ```typescript
   it('should produce same result when called twice with same idempotency key', async () => {
     const key = 'idem-key-123';
     const result1 = await service.createPayment(paymentData, key);
     const result2 = await service.createPayment(paymentData, key);
     expect(result1.id).toBe(result2.id);
     expect(result1.amount).toBe(result2.amount);
   });
   ```

4. **Deadlock Prevention**:
   ```typescript
   it('should not deadlock on cross-resource operations', async () => {
     const timeout = setTimeout(() => {
       throw new Error('Deadlock detected: operation did not complete in 5s');
     }, 5000);

     await Promise.all([
       service.transfer('account-a', 'account-b', 100),
       service.transfer('account-b', 'account-a', 50),
     ]);

     clearTimeout(timeout);
   });
   ```

5. **Resource Exhaustion**:
   ```typescript
   it('should handle connection pool exhaustion gracefully', async () => {
     // Exhaust connection pool
     const connections = await Promise.all(
       Array(MAX_POOL_SIZE + 5).fill(null).map(() => service.longOperation())
     );
     // Some should fail with resource error, not hang
   });
   ```

6. **Ordering Guarantees**:
   - Operations on same entity maintain order
   - Event publish order matches operation order
   - Audit log reflects actual execution order

OUTPUT:
1. Concurrency test suite
2. Test utilities for race condition testing
3. Timeout and deadlock detection helpers
4. Parallel execution test patterns
```

### Category 2: Integration Testing (5 Prompts)

#### Prompt 8 — API Integration Tests

```text
Generate API integration tests:

API: [Describe the API endpoints or paste route definitions]
TECH STACK: TypeScript, Vitest, Supertest, Testcontainers

TEST SETUP:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { createApp } from '../src/app';

let app: Express;
let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  app = createApp({
    databaseUrl: container.getConnectionUri(),
  });
  await runMigrations(container.getConnectionUri());
}, 60000);

afterAll(async () => {
  await container.stop();
});

beforeEach(async () => {
  await truncateAllTables(); // Clean state
  await seedTestData();      // Standard test data
});
```

FOR EACH ENDPOINT:

1. **Success Cases**:
   - Valid request returns correct status and body
   - Response matches schema (validate against OpenAPI spec)
   - Side effects occurred (database updated, event published)
   - Response headers correct (Content-Type, Cache-Control)

2. **Authentication**:
   - No token -> 401
   - Invalid token -> 401
   - Expired token -> 401
   - Valid token -> success

3. **Authorization**:
   - Insufficient role -> 403
   - Access to other user's resource -> 403 or 404
   - Admin access -> success

4. **Validation**:
   - Missing required fields -> 400 with field-level errors
   - Invalid format -> 400 with clear message
   - Too long/too short -> 400

5. **Error Handling**:
   - Resource not found -> 404
   - Duplicate create -> 409
   - Server error -> 500 with safe message (no stack trace)

6. **Pagination**:
   - First page returns correct count
   - Cursor-based pagination works correctly
   - Last page has no next cursor
   - Empty result set handled

7. **Filtering & Sorting**:
   - Filters narrow results correctly
   - Sort order is correct
   - Multiple filters combine correctly
   - Invalid filter ignored or returns error

OUTPUT:
1. Test setup with Testcontainers
2. Test helpers (auth token generation, request builders)
3. Test files per endpoint group
4. Seed data and fixtures
5. Response schema validation utilities
```

#### Prompt 9 — Database Integration Tests

```text
Generate database integration tests:

SCHEMA: [Describe or paste the database schema]
ORM: [Prisma/Drizzle/TypeORM/raw SQL]

TEST SETUP:
- Testcontainers PostgreSQL
- Migrations applied before tests
- Truncate tables between tests (not drop/create — too slow)
- Seed reference data

TEST CATEGORIES:

1. **Repository Method Tests**:
   For each repository method:
   ```typescript
   describe('UserRepository', () => {
     describe('findById', () => {
       it('should return user when exists', async () => {
         const created = await repo.create(testUserData);
         const found = await repo.findById(created.id);
         expect(found).toMatchObject(testUserData);
       });

       it('should return null when not exists', async () => {
         const found = await repo.findById('nonexistent');
         expect(found).toBeNull();
       });
     });
   });
   ```

2. **Constraint Tests**:
   - Unique constraints prevent duplicates
   - Foreign key constraints prevent orphans
   - Check constraints enforce domain rules
   - NOT NULL constraints enforced

3. **Transaction Tests**:
   - Successful transaction commits all changes
   - Failed transaction rolls back all changes
   - Nested transaction behavior (savepoints)
   - Concurrent transactions with isolation levels

4. **Query Performance Tests**:
   ```typescript
   it('should find users by email using index scan (not seq scan)', async () => {
     await seedUsers(10000); // Need enough data for planner to use index
     const plan = await db.query('EXPLAIN ANALYZE SELECT * FROM users WHERE email = $1', ['test@example.com']);
     expect(plan).toContain('Index Scan');
     expect(plan).not.toContain('Seq Scan');
   });
   ```

5. **Migration Tests**:
   - Forward migration runs without error
   - Data is preserved after migration
   - New constraints don't violate existing data
   - Migration is idempotent

6. **Data Integrity Tests**:
   - Soft delete doesn't affect counts incorrectly
   - Cascade deletes work correctly
   - Computed columns are correct
   - Audit timestamps are set

OUTPUT:
1. Test setup with Testcontainers
2. Repository tests for each entity
3. Constraint verification tests
4. Transaction behavior tests
5. Performance regression tests
6. Seed data and cleanup utilities
```

#### Prompt 10 — Event/Message Integration Tests

```text
Generate integration tests for event-driven components:

EVENTS: [List event types and their schemas]
BROKER: [Kafka/RabbitMQ/SQS/in-process]

TEST SETUP:
- In-process event bus for fast tests (or Testcontainers for broker)
- Event capture for verification
- Timeout handling for async assertions

TEST SCENARIOS:

1. **Event Publishing**:
   ```typescript
   it('should publish OrderCreated event when order is created', async () => {
     const eventCapture = captureEvents('order.created');

     await orderService.createOrder(testOrderData);

     const events = await eventCapture.waitForEvents(1, { timeout: 5000 });
     expect(events[0]).toMatchObject({
       type: 'order.created',
       payload: {
         orderId: expect.any(String),
         userId: testOrderData.userId,
         total: testOrderData.total,
       },
     });
   });
   ```

2. **Event Consumption**:
   ```typescript
   it('should update inventory when OrderCreated event is received', async () => {
     await publishEvent({
       type: 'order.created',
       payload: { items: [{ productId: 'prod-1', quantity: 2 }] },
     });

     await waitFor(async () => {
       const product = await productRepo.findById('prod-1');
       expect(product.inventory).toBe(initialInventory - 2);
     }, { timeout: 5000 });
   });
   ```

3. **Idempotency**:
   ```typescript
   it('should process duplicate events only once', async () => {
     const event = createEvent('order.created', testPayload);

     await publishEvent(event);
     await publishEvent(event); // Same event ID

     await waitFor(async () => {
       const count = await orderRepo.count({ userId: testPayload.userId });
       expect(count).toBe(1); // Not 2
     });
   });
   ```

4. **Error Handling**:
   - Malformed events are sent to DLQ
   - Handler exceptions don't crash the consumer
   - Transient errors are retried
   - Poison messages don't block the queue

5. **Ordering**:
   - Events for same entity processed in order
   - Out-of-order events handled gracefully

6. **End-to-End Flow**:
   - Trigger action -> Event published -> Handler processes -> State updated
   - Complete saga: events chain through multiple handlers

OUTPUT:
1. Event test utilities (capture, publish, wait)
2. Integration test files per event flow
3. Test fixtures for events
4. DLQ verification helpers
5. Timeout and retry test utilities
```

#### Prompt 11 — Third-Party Service Integration Tests

```text
Generate tests for third-party service integrations:

SERVICES: [List external APIs/services — Stripe, SendGrid, S3, etc.]

TEST STRATEGY:
For each external service, create THREE test levels:

1. **Unit Tests with Mocks** (fast, always run):
   ```typescript
   describe('StripePaymentService', () => {
     const mockStripe = createMockStripe();

     it('should create payment intent with correct params', async () => {
       mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent);

       await paymentService.createPayment({
         amount: 1000,
         currency: 'usd',
         customerId: 'cus_123',
       });

       expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
         amount: 1000,
         currency: 'usd',
         customer: 'cus_123',
         automatic_payment_methods: { enabled: true },
       });
     });
   });
   ```

2. **Contract Tests** (verify our expectations match reality):
   ```typescript
   describe('Stripe API Contract', () => {
     it('should match expected PaymentIntent schema', () => {
       // Verify that our mock PaymentIntent matches real API schema
       const result = StripePaymentIntentSchema.safeParse(mockPaymentIntent);
       expect(result.success).toBe(true);
     });
   });
   ```

3. **Sandbox Integration Tests** (slow, run separately):
   ```typescript
   describe.skipIf(!process.env.STRIPE_TEST_KEY)(
     'Stripe Sandbox Integration',
     () => {
       it('should create a real payment intent in test mode', async () => {
         const intent = await stripe.paymentIntents.create({
           amount: 1000,
           currency: 'usd',
         });
         expect(intent.id).toMatch(/^pi_/);
         expect(intent.status).toBe('requires_payment_method');
       });
     }
   );
   ```

FOR EACH SERVICE:
- Mock factory with realistic responses
- Error response mocks (400, 401, 429, 500)
- Retry behavior verification
- Timeout handling verification
- Rate limit handling verification
- Webhook signature verification

OUTPUT:
1. Mock factories per external service
2. Unit tests with mocks
3. Contract test schemas
4. Sandbox integration tests
5. Test configuration (API keys, sandboxes)
6. CI/CD integration (separate pipeline for sandbox tests)
```

#### Prompt 12 — Cross-Service Integration Tests

```text
Generate tests for multi-service interactions:

SERVICES: [List your microservices and how they interact]
TEST APPROACH: [Contract testing / shared test environment / service virtualization]

TEST SCENARIOS:

1. **Request-Response Chain**:
   ```
   Client -> API Gateway -> Service A -> Service B -> Database
   ```
   Test the full chain with Service B stubbed or real.

2. **Event Chain**:
   ```
   Service A publishes -> Event Bus -> Service B consumes -> Service C queries
   ```
   Verify the complete event flow produces expected final state.

3. **Saga/Distributed Transaction**:
   ```
   Service A starts -> Service B participates -> Service C commits
   or: Service A starts -> Service B fails -> Service A compensates
   ```
   Test both success and compensation paths.

4. **Failure Scenarios**:
   - What happens when Service B is unavailable?
   - What happens when Service B is slow (timeout)?
   - What happens when Service B returns an error?
   - Does the system reach a consistent state after recovery?

TEST INFRASTRUCTURE:

Option A — Service Virtualization:
```typescript
const serviceB = createVirtualService('service-b', {
  'GET /api/users/:id': {
    status: 200,
    body: { id: ':id', name: 'Mock User' },
  },
  'POST /api/users': {
    status: 201,
    body: (req) => ({ id: 'new-id', ...req.body }),
  },
});
```

Option B — Docker Compose Test Environment:
```yaml
services:
  service-a:
    build: ./service-a
    depends_on: [service-b, database]
  service-b:
    build: ./service-b
    depends_on: [database]
  database:
    image: postgres:16
```

Option C — Contract Testing:
- Each service defines its expectations
- Provider verifies against consumer expectations
- Broker stores and validates contracts

OUTPUT:
1. Cross-service test scenarios
2. Service virtualization stubs
3. Docker Compose test environment
4. Test orchestration script
5. Failure injection utilities
6. Consistency verification helpers
```

### Category 3: Specialized Testing (6 Prompts)

#### Prompt 13 — Security Testing Prompt

```text
Generate security-focused tests for this application:

```typescript
[PASTE CODE OR API DEFINITION]
```

OWASP TOP 10 TESTS:

1. **Injection (SQL, NoSQL, Command)**:
   ```typescript
   const injectionPayloads = [
     "'; DROP TABLE users; --",
     "{ $gt: '' }",
     "; ls -la",
     "<script>alert('xss')</script>",
     "{​{7*7}}", // Template injection
   ];

   for (const payload of injectionPayloads) {
     it(`should sanitize injection payload: ${payload.slice(0, 20)}...`, async () => {
       const response = await request(app)
         .post('/api/search')
         .send({ query: payload });
       expect(response.status).not.toBe(500);
       // Verify the payload was not executed
     });
   }
   ```

2. **Broken Authentication**:
   - Brute force protection after 5 failed attempts
   - Session fixation prevention
   - Token cannot be reused after logout
   - Weak password rejected
   - Account enumeration prevented (same response for valid/invalid email)

3. **Sensitive Data Exposure**:
   - Passwords never in API responses
   - API keys not in URLs
   - PII not in logs (check log output)
   - Error messages don't reveal system details
   - Response headers don't reveal server technology

4. **Broken Access Control**:
   - IDOR: User A cannot access User B's resources
   - Privilege escalation: Regular user cannot access admin endpoints
   - Missing function-level access control
   - CORS misconfiguration

5. **Security Misconfiguration**:
   - HTTPS enforced (HTTP redirects to HTTPS)
   - Security headers present
   - Default credentials not active
   - Directory listing disabled
   - Debug mode off in production config

6. **Cross-Site Scripting (XSS)**:
   ```typescript
   const xssPayloads = [
     '<script>alert(1)</script>',
     '<img src=x onerror=alert(1)>',
     'javascript:alert(1)',
     '<svg onload=alert(1)>',
     '"><script>alert(1)</script>',
   ];

   for (const payload of xssPayloads) {
     it(`should escape XSS in user-generated content`, async () => {
       await createContent({ title: payload });
       const response = await request(app).get('/api/content');
       expect(response.text).not.toContain('<script>');
     });
   }
   ```

7. **Mass Assignment**:
   ```typescript
   it('should ignore admin fields in user update', async () => {
     const response = await request(app)
       .patch('/api/users/me')
       .set('Authorization', userToken)
       .send({ name: 'New Name', role: 'admin', isVerified: true });

     const user = await getUser(userId);
     expect(user.role).toBe('user'); // Not admin
     expect(user.isVerified).toBe(false); // Not true
   });
   ```

8. **Rate Limiting**:
   ```typescript
   it('should rate limit after 100 requests per minute', async () => {
     const requests = Array(101).fill(null).map(() =>
       request(app).get('/api/data').set('Authorization', token)
     );
     const responses = await Promise.all(requests);
     const rateLimited = responses.filter(r => r.status === 429);
     expect(rateLimited.length).toBeGreaterThan(0);
   });
   ```

OUTPUT:
1. Security test suite organized by OWASP category
2. Attack payload datasets
3. Security header verification tests
4. Authentication bypass tests
5. Authorization matrix tests
6. Security test running configuration
```

#### Prompt 14 — Performance Testing Prompt

```text
Generate performance tests and benchmarks:

```typescript
[PASTE CODE TO BENCHMARK]
```

PERFORMANCE REQUIREMENTS:
- Response time p95: [target]
- Throughput: [target requests/second]
- Memory: [maximum per request]
- CPU: [maximum utilization target]

BENCHMARKS:

1. **Micro-Benchmarks** (function-level):
   ```typescript
   import { bench, describe } from 'vitest';

   describe('UserService.getUser', () => {
     bench('cached hit', async () => {
       await userService.getUser('cached-user');
     });

     bench('cache miss, DB lookup', async () => {
       await userService.getUser('uncached-user');
     });

     bench('not found', async () => {
       try {
         await userService.getUser('nonexistent');
       } catch { /* expected */ }
     });
   });
   ```

2. **Endpoint Benchmarks** (API-level):
   ```typescript
   describe('GET /api/users/:id', () => {
     bench('simple user', async () => {
       await request(app).get('/api/users/user-1');
     }, { time: 10000 });

     bench('user with 100 orders', async () => {
       await request(app).get('/api/users/heavy-user');
     }, { time: 10000 });
   });
   ```

3. **Memory Leak Detection**:
   ```typescript
   it('should not leak memory over 10000 requests', async () => {
     const baseline = process.memoryUsage().heapUsed;

     for (let i = 0; i < 10000; i++) {
       await service.processRequest(testData);
     }

     // Force GC if available
     if (global.gc) global.gc();

     const after = process.memoryUsage().heapUsed;
     const growth = (after - baseline) / baseline;
     expect(growth).toBeLessThan(0.1); // Less than 10% growth
   });
   ```

4. **Regression Gates**:
   ```typescript
   it('should respond within 100ms at p95', async () => {
     const latencies: number[] = [];

     for (let i = 0; i < 1000; i++) {
       const start = performance.now();
       await service.getUser('test-user');
       latencies.push(performance.now() - start);
     }

     latencies.sort((a, b) => a - b);
     const p95 = latencies[Math.floor(latencies.length * 0.95)];
     expect(p95).toBeLessThan(100);
   });
   ```

5. **Scalability Test**:
   ```typescript
   it('should scale linearly with data size', async () => {
     const results: { size: number; time: number }[] = [];

     for (const size of [100, 1000, 10000, 100000]) {
       await seedData(size);
       const start = performance.now();
       await service.aggregateData();
       results.push({ size, time: performance.now() - start });
     }

     // Verify no worse than O(n log n)
     const ratio = results[3].time / results[2].time;
     const sizeRatio = results[3].size / results[2].size;
     expect(ratio).toBeLessThan(sizeRatio * 1.5); // Allow 50% overhead
   });
   ```

OUTPUT:
1. Benchmark suite
2. Performance regression tests
3. Memory leak detection tests
4. Scalability tests
5. Performance budget configuration
6. CI/CD performance gate integration
```

#### Prompt 15 — Accessibility Testing Prompt

```text
Generate accessibility tests for this UI:

```typescript
[PASTE COMPONENT CODE OR DESCRIBE THE UI]
```

TOOL: axe-core with Playwright/Testing Library

WCAG 2.1 AA TESTS:

1. **Automated Axe Checks**:
   ```typescript
   import { axe, toHaveNoViolations } from 'jest-axe';

   expect.extend(toHaveNoViolations);

   it('should have no accessibility violations', async () => {
     const { container } = render(<Component />);
     const results = await axe(container);
     expect(results).toHaveNoViolations();
   });
   ```

2. **Keyboard Navigation**:
   ```typescript
   it('should be fully navigable with keyboard', async () => {
     render(<Component />);

     // Tab through all interactive elements
     await userEvent.tab();
     expect(screen.getByRole('button', { name: 'Submit' })).toHaveFocus();

     await userEvent.tab();
     expect(screen.getByRole('link', { name: 'Cancel' })).toHaveFocus();

     // Escape closes modal
     await userEvent.keyboard('{Escape}');
     expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
   });
   ```

3. **Screen Reader Compatibility**:
   - All images have alt text
   - Form inputs have labels
   - Buttons have accessible names
   - ARIA attributes are correct
   - Live regions announce dynamic content

4. **Color and Contrast**:
   - Text contrast ratio >= 4.5:1 (AA standard)
   - Large text contrast ratio >= 3:1
   - Information not conveyed by color alone
   - Focus indicator visible

5. **Semantic HTML**:
   ```typescript
   it('should use semantic HTML elements', () => {
     render(<Component />);
     expect(screen.getByRole('navigation')).toBeInTheDocument();
     expect(screen.getByRole('main')).toBeInTheDocument();
     expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
   });
   ```

6. **Dynamic Content**:
   - Loading states announced to screen readers
   - Error messages associated with form fields
   - Toast/notification announced via live region
   - Modal focus trap works correctly

OUTPUT:
1. Accessibility test suite
2. Custom matchers for common patterns
3. Keyboard navigation tests
4. ARIA attribute verification tests
5. Color contrast verification
6. CI/CD accessibility gate configuration
```

#### Prompt 16 — Mutation Testing Prompt

```text
Design a mutation testing strategy:

```typescript
[PASTE CODE AND EXISTING TESTS]
```

TOOL: Stryker (for TypeScript)

MUTATION OPERATORS TO APPLY:
1. **Arithmetic**: Replace + with -, * with /, etc.
2. **Conditional**: Replace > with >=, === with !==, etc.
3. **Logical**: Replace && with ||, negate conditions
4. **Statement**: Remove statements, replace returns
5. **String**: Empty strings, alter string values
6. **Array**: Empty arrays, remove elements
7. **Block**: Remove entire blocks, switch branches
8. **Assignment**: Replace values, swap assignments

ANALYSIS:

1. **Run Mutations**:
   ```
   stryker run --mutate 'src/**/*.ts' --testRunner vitest
   ```

2. **Interpret Results**:
   - Mutation Score = (Killed + Timeout) / Total Mutations
   - Target: > 80% mutation score

3. **Surviving Mutants Analysis**:
   For each surviving mutant:
   | Mutation | Location | Why It Survived | Test to Add |

   Common reasons mutations survive:
   - Missing assertion (test doesn't check the output)
   - Missing edge case (boundary not tested)
   - Dead code (mutation in unreachable code)
   - Equivalent mutant (mutation doesn't change behavior)

4. **Test Improvements**:
   Write additional tests that would kill surviving mutants:
   ```typescript
   // Mutant survived: changed > to >=
   // Original: if (age > 18)
   // Mutant:   if (age >= 18)
   // Missing test: exact boundary value
   it('should reject age exactly 18', () => {
     expect(isAdult(18)).toBe(false); // Kills the mutant
   });
   ```

OUTPUT:
1. Stryker configuration
2. Analysis of surviving mutants
3. Additional tests to improve mutation score
4. Mutation testing CI/CD integration
5. Quality gates (minimum mutation score)
```

#### Prompt 17 — Data-Driven Test Generation

```text
Generate data-driven tests using parameterization:

```typescript
[PASTE CODE TO TEST]
```

APPROACH:
Instead of writing individual test cases, define test data tables:

1. **Parameterized Tests**:
   ```typescript
   describe('calculateTax', () => {
     const testCases = [
       { income: 0,       expected: 0,       description: 'zero income' },
       { income: 10000,   expected: 1000,    description: 'low bracket' },
       { income: 50000,   expected: 8000,    description: 'middle bracket' },
       { income: 100000,  expected: 22000,   description: 'high bracket' },
       { income: 500000,  expected: 150000,  description: 'top bracket' },
       { income: -1000,   expected: 'error', description: 'negative income' },
     ];

     it.each(testCases)(
       'should return $expected for $description ($income)',
       ({ income, expected }) => {
         if (expected === 'error') {
           expect(() => calculateTax(income)).toThrow();
         } else {
           expect(calculateTax(income)).toBe(expected);
         }
       }
     );
   });
   ```

2. **Matrix Testing** (all combinations):
   ```typescript
   const currencies = ['USD', 'EUR', 'GBP'];
   const amounts = [0, 1, 100, 999999];
   const operations = ['deposit', 'withdraw'];

   describe.each(currencies)('currency: %s', (currency) => {
     describe.each(operations)('operation: %s', (operation) => {
       it.each(amounts)('amount: %d', async (amount) => {
         // Test this specific combination
       });
     });
   });
   ```

3. **CSV/JSON Data Source**:
   ```typescript
   import testData from './test-data.json';

   describe('address validation', () => {
     it.each(testData.validAddresses)(
       'should accept valid address: $country $zip',
       (address) => {
         expect(validateAddress(address)).toEqual({ valid: true });
       }
     );

     it.each(testData.invalidAddresses)(
       'should reject invalid address: $reason',
       ({ address, expectedError }) => {
         const result = validateAddress(address);
         expect(result.valid).toBe(false);
         expect(result.error).toBe(expectedError);
       }
     );
   });
   ```

4. **Equivalence Class Partitioning**:
   For each input, identify:
   - Valid equivalence classes (test one from each)
   - Invalid equivalence classes (test one from each)
   - Boundary values (test at each boundary)

   | Input | Valid Classes | Invalid Classes | Boundaries |
   |-------|-------------|----------------|------------|
   | age   | 0-17, 18-64, 65+ | negative, >150 | 0, 17, 18, 64, 65, 150 |

OUTPUT:
1. Test data tables for each function
2. Parameterized test implementations
3. Test data files (JSON/CSV) for large datasets
4. Equivalence class documentation
5. Boundary value catalog
```

#### Prompt 18 — Regression Test Suite

```text
Generate regression tests for known bugs:

BUG HISTORY: [List past bugs or describe the system areas that break often]

FOR EACH PAST BUG, create a regression test:

TEMPLATE:
```typescript
/**
 * Regression test for BUG-123: Users could bypass email verification
 * by modifying the verification token in the URL.
 *
 * Root cause: Token validation only checked format, not signature.
 * Fixed in: commit abc123
 * Date: 2026-01-15
 */
describe('BUG-123: Email verification bypass', () => {
  it('should reject tampered verification tokens', async () => {
    const validToken = await generateVerificationToken('user@example.com');
    const tamperedToken = validToken.slice(0, -5) + 'XXXXX';

    const response = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: tamperedToken });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_TOKEN');
  });

  it('should reject expired verification tokens', async () => {
    const expiredToken = await generateVerificationToken('user@example.com', {
      expiresIn: '-1h', // Already expired
    });

    const response = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: expiredToken });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('TOKEN_EXPIRED');
  });
});
```

REGRESSION TEST ORGANIZATION:
```
tests/
  regression/
    BUG-123-email-verification.test.ts
    BUG-124-payment-double-charge.test.ts
    BUG-125-race-condition-inventory.test.ts
```

FOR COMMON BUG CATEGORIES:

1. **Off-by-one errors**: Test at exact boundaries
2. **Race conditions**: Test with concurrent operations
3. **Null pointer**: Test with null/undefined at every nullable point
4. **Timezone bugs**: Test across DST transitions, UTC vs local
5. **Unicode bugs**: Test with emoji, RTL text, zero-width chars
6. **Precision bugs**: Test with floating point edge cases (0.1 + 0.2)
7. **State bugs**: Test unexpected state transitions

OUTPUT:
1. Regression test files per bug
2. Bug->test mapping document
3. Common bug pattern test templates
4. CI/CD integration (regression suite runs on every PR)
```

### Category 4: Test Infrastructure (5 Prompts)

#### Prompt 19 — Test Helper Library

```text
Generate a test helper library for this project:

PROJECT: [Describe the project and tech stack]
TEST FRAMEWORK: [Vitest/Jest]

HELPERS NEEDED:

1. **Request Helpers**:
   ```typescript
   // Authenticated request builder
   function authenticatedRequest(app: Express, user?: Partial<User>) {
     const token = generateTestToken(user ?? testUser);
     return {
       get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
       post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
       put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`),
       patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
       delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
     };
   }
   ```

2. **Wait Helpers** (for async assertions):
   ```typescript
   async function waitFor<T>(
     fn: () => Promise<T>,
     options: { timeout?: number; interval?: number } = {}
   ): Promise<T> {
     const { timeout = 5000, interval = 100 } = options;
     const deadline = Date.now() + timeout;
     let lastError: Error;
     while (Date.now() < deadline) {
       try {
         return await fn();
       } catch (error) {
         lastError = error as Error;
         await new Promise(r => setTimeout(r, interval));
       }
     }
     throw lastError!;
   }
   ```

3. **Database Helpers**:
   ```typescript
   async function truncateAllTables(db: PrismaClient): Promise<void> {
     const tables = await db.$queryRaw<{ tablename: string }[]>`
       SELECT tablename FROM pg_tables WHERE schemaname = 'public'
     `;
     for (const { tablename } of tables) {
       await db.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE`);
     }
   }
   ```

4. **Time Helpers**:
   ```typescript
   function freezeTime(date: Date | string): () => void {
     const original = Date.now;
     const frozen = new Date(date).getTime();
     Date.now = () => frozen;
     return () => { Date.now = original; };
   }
   ```

5. **Event Helpers**:
   ```typescript
   function captureEvents(eventType: string) {
     const captured: DomainEvent[] = [];
     const subscription = eventBus.subscribe(eventType, (event) => {
       captured.push(event);
     });
     return {
       events: captured,
       waitForEvents: (count: number, opts?: { timeout?: number }) =>
         waitFor(() => {
           if (captured.length >= count) return captured;
           throw new Error(`Expected ${count} events, got ${captured.length}`);
         }, opts),
       dispose: () => subscription.unsubscribe(),
     };
   }
   ```

6. **Custom Matchers**:
   ```typescript
   expect.extend({
     toBeValidUUID(received: string) {
       const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
       return {
         pass: uuidRegex.test(received),
         message: () => `Expected ${received} to be a valid UUID`,
       };
     },
     toBeWithinRange(received: number, min: number, max: number) {
       return {
         pass: received >= min && received <= max,
         message: () => `Expected ${received} to be within [${min}, ${max}]`,
       };
     },
   });
   ```

OUTPUT:
1. Test helper library with all utilities
2. Custom matcher definitions
3. Type declarations for custom matchers
4. Setup file that registers helpers globally
5. Documentation for each helper
```

#### Prompt 20 — Test Environment Setup

```text
Generate a complete test environment configuration:

PROJECT: [Describe the project]
TECH STACK: TypeScript, Vitest, Testcontainers

CONFIGURATION:

1. **Vitest Configuration**:
   ```typescript
   // vitest.config.ts
   export default defineConfig({
     test: {
       // Unit tests (fast)
       include: ['src/**/*.test.ts'],
       exclude: ['src/**/*.integration.test.ts', 'src/**/*.e2e.test.ts'],
       globals: true,
       environment: 'node',
       setupFiles: ['./tests/setup.ts'],
       coverage: {
         provider: 'v8',
         reporter: ['text', 'html', 'json'],
         thresholds: {
           lines: 80,
           branches: 75,
           functions: 80,
           statements: 80,
         },
       },
       pool: 'forks', // Isolation between test files
       poolOptions: {
         forks: { minForks: 1, maxForks: 4 },
       },
     },
   });
   ```

2. **Integration Test Configuration**:
   Separate config for integration tests (slower, uses containers)

3. **Global Setup/Teardown**:
   ```typescript
   // tests/setup.ts
   import { beforeAll, afterAll, beforeEach } from 'vitest';

   beforeAll(async () => {
     // Start test containers
     // Run migrations
     // Seed reference data
   });

   afterAll(async () => {
     // Stop test containers
     // Cleanup
   });

   beforeEach(async () => {
     // Reset mocks
     // Truncate tables
     // Reset caches
   });
   ```

4. **CI/CD Configuration**:
   - Parallel test execution
   - Test splitting for CI
   - Coverage upload
   - Test result reporting
   - Flaky test detection

5. **Environment Variables**:
   ```
   # .env.test
   NODE_ENV=test
   DATABASE_URL=postgresql://test:test@localhost:5433/test
   REDIS_URL=redis://localhost:6380
   JWT_SECRET=test-secret-do-not-use-in-production
   LOG_LEVEL=silent
   ```

OUTPUT:
1. vitest.config.ts (unit tests)
2. vitest.integration.config.ts (integration tests)
3. vitest.e2e.config.ts (E2E tests)
4. Global setup files
5. Test environment configuration (.env.test)
6. CI/CD pipeline configuration
7. Test scripts in package.json
```

#### Prompt 21 — Flaky Test Investigation Prompt

```text
Investigate and fix this flaky test:

```typescript
[PASTE THE FLAKY TEST]
```

SYMPTOMS:
- Pass rate: [e.g., 90% - passes 9/10 times]
- Fails in CI but passes locally (or vice versa)
- Fails when run with other tests but passes alone

INVESTIGATION CHECKLIST:

1. **Timing Dependencies**:
   - Uses setTimeout/setInterval without proper await
   - Depends on real clock (Date.now())
   - Race condition between async operations
   - Network timeout in test

   FIX: Use fake timers, await proper signals, increase timeouts

2. **State Leakage**:
   - Shared mutable state between tests
   - Database not cleaned between tests
   - Global variable mutation
   - Module-level cache not reset

   FIX: Isolate state, clean up in beforeEach/afterEach

3. **Order Dependency**:
   - Test depends on another test running first
   - Test depends on specific execution order
   - Parallel execution causes conflicts

   FIX: Make each test self-contained

4. **Environment Dependency**:
   - Different behavior on different OS
   - Locale-dependent string comparison
   - File path differences (Unix vs Windows)
   - Available memory/CPU affects timing

   FIX: Mock environment-specific behavior

5. **Non-Deterministic Data**:
   - Math.random() in test
   - UUID generation
   - Timestamp comparison
   - Hash ordering (Map/Set iteration)

   FIX: Seed random, use deterministic IDs, freeze time

6. **Resource Contention**:
   - Port already in use
   - File system conflicts
   - Database connection limit
   - Docker container startup timing

   FIX: Dynamic ports, isolated resources, proper waiting

RESOLUTION TEMPLATE:
```typescript
// BEFORE (flaky)
it('should process order', async () => {
  await createOrder(orderData);
  // Race condition: event handler might not have run yet
  const inventory = await getInventory('product-1');
  expect(inventory.quantity).toBe(9);
});

// AFTER (reliable)
it('should process order', async () => {
  const eventCapture = captureEvents('inventory.updated');
  await createOrder(orderData);
  await eventCapture.waitForEvents(1, { timeout: 5000 });
  const inventory = await getInventory('product-1');
  expect(inventory.quantity).toBe(9);
});
```

OUTPUT:
1. Root cause analysis
2. Fixed test code
3. Prevention guidelines
4. Flaky test detection configuration
```

#### Prompt 22 — Test Coverage Gap Analysis

```text
Analyze test coverage gaps for this code:

```typescript
[PASTE CODE]
```

```typescript
[PASTE EXISTING TESTS]
```

COVERAGE ANALYSIS:

1. **Line Coverage Gaps**:
   Identify specific lines not covered by any test.
   Categorize:
   - Error handling paths not tested
   - Edge case branches not tested
   - Dead code (should be removed)
   - Complex logic paths not tested

2. **Branch Coverage Gaps**:
   For each conditional:
   | Condition | True Branch Tested? | False Branch Tested? |
   Identify untested branches.

3. **Function Coverage**:
   | Function | Tested? | Test Quality (assertions on output?) |

4. **Path Coverage**:
   Identify untested combinations of branches.
   (Path coverage is usually impractical for 100% but
   identify the highest-risk uncovered paths.)

5. **Mutation Coverage**:
   Even with 100% line coverage, mutations may survive:
   - Assertions too weak (always pass)
   - Output not verified (only checked for no error)
   - State changes not verified

6. **Risk-Based Gap Prioritization**:
   | Gap | Risk (1-5) | Effort (1-5) | Priority |

   Highest priority: High risk, low effort gaps

OUTPUT:
1. Coverage gap report
2. Prioritized list of tests to write
3. Test implementations for top 10 gaps
4. Coverage improvement estimate
```

#### Prompt 23 — Test Refactoring Prompt

```text
Refactor this test suite for maintainability:

```typescript
[PASTE TEST CODE]
```

TEST SMELLS TO FIX:

1. **Obscure Tests** -> Add clarity:
   - Rename tests to describe behavior, not implementation
   - Add comments explaining "why" for non-obvious assertions
   - Use Arrange-Act-Assert structure consistently

2. **Fragile Tests** -> Increase resilience:
   - Replace CSS selector assertions with role-based queries
   - Test behavior, not implementation details
   - Use matchers like toMatchObject instead of toEqual for partial matching

3. **Slow Tests** -> Increase speed:
   - Replace real I/O with mocks in unit tests
   - Reduce unnecessary setup
   - Parallelize independent tests
   - Use beforeAll for expensive one-time setup

4. **Duplicate Tests** -> Use parameterization:
   ```typescript
   // BEFORE: 5 nearly identical tests
   it('should validate US phone', () => { ... });
   it('should validate UK phone', () => { ... });

   // AFTER: parameterized
   it.each([
     ['US', '+1234567890', true],
     ['UK', '+441234567890', true],
     ['invalid', '123', false],
   ])('should validate %s phone: %s -> %s', (country, phone, expected) => {
     expect(validatePhone(phone)).toBe(expected);
   });
   ```

5. **Giant Setup** -> Extract builders/factories:
   Replace 50-line beforeEach with focused factory methods.

6. **Missing Abstractions** -> Create test helpers:
   Extract repeated patterns into reusable helpers.

OUTPUT:
1. Refactored test suite
2. Extracted test helpers
3. Test factories/builders
4. Before/after comparison (test count, duration, readability)
```

### Category 5: End-to-End & Acceptance Testing (5 Prompts)

#### Prompt 24 — Behavior-Driven Development (BDD) Tests

```text
Generate BDD-style acceptance tests:

FEATURE: [Describe the feature]
USER STORIES: [List user stories]

GHERKIN SCENARIOS:
```gherkin
Feature: [Feature Name]
  As a [role]
  I want [capability]
  So that [benefit]

  Background:
    Given a registered user "john@example.com"
    And the user is logged in

  Scenario: [Happy path]
    Given [precondition]
    When [action]
    Then [expected result]
    And [additional verification]

  Scenario: [Error case]
    Given [precondition]
    When [action with invalid data]
    Then [error response]

  Scenario Outline: [Parameterized]
    Given a product with price <price>
    When the user applies coupon <coupon>
    Then the final price should be <final>

    Examples:
      | price | coupon    | final |
      | 100   | 10OFF     | 90    |
      | 100   | 50PERCENT | 50    |
      | 50    | 10OFF     | 40    |
```

IMPLEMENTATION:
```typescript
import { Given, When, Then } from '@cucumber/cucumber';
// Or use Vitest with step-based testing

describe('Feature: [Name]', () => {
  describe('Scenario: [Happy path]', () => {
    let context: TestContext;

    // Given
    beforeEach(async () => {
      context = await setupTestContext();
      await context.createUser({ email: 'john@example.com' });
      await context.login('john@example.com');
    });

    // When
    it('should [expected behavior]', async () => {
      const result = await context.performAction(/* ... */);

      // Then
      expect(result).toMatchObject({ /* expected */ });
    });
  });
});
```

OUTPUT:
1. Gherkin feature files
2. Step definitions
3. Test context and helpers
4. Test data management
5. Acceptance criteria verification
```

#### Prompt 25 — Smoke Test Suite

```text
Generate a smoke test suite for production deployment verification:

SYSTEM: [Describe the production system]
ENDPOINTS: [List critical endpoints]

SMOKE TESTS run after every deployment to verify core functionality:

```typescript
describe('Production Smoke Tests', () => {
  const baseUrl = process.env.SMOKE_TEST_URL;
  const timeout = 10000; // 10 second timeout per test

  describe('Health Checks', () => {
    it('should return healthy status', async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe('healthy');
    }, timeout);

    it('should have all dependencies healthy', async () => {
      const response = await fetch(`${baseUrl}/health/deep`);
      const body = await response.json();
      for (const [dep, status] of Object.entries(body.checks)) {
        expect(status).toMatchObject({ status: 'healthy' });
      }
    }, timeout);
  });

  describe('Authentication', () => {
    it('should accept valid credentials', async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.SMOKE_TEST_USER,
          password: process.env.SMOKE_TEST_PASSWORD,
        }),
      });
      expect(response.status).toBe(200);
    }, timeout);

    it('should reject invalid credentials', async () => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid@example.com',
          password: 'wrong',
        }),
      });
      expect(response.status).toBe(401);
    }, timeout);
  });

  describe('Core API', () => {
    let authToken: string;

    beforeAll(async () => {
      authToken = await getAuthToken();
    });

    it('should list resources', async () => {
      const response = await fetch(`${baseUrl}/api/resources`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toBeInstanceOf(Array);
    }, timeout);

    it('should create and delete a test resource', async () => {
      // Create
      const createResponse = await fetch(`${baseUrl}/api/resources`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `smoke-test-${Date.now()}`,
          type: 'test',
        }),
      });
      expect(createResponse.status).toBe(201);
      const created = await createResponse.json();

      // Clean up
      const deleteResponse = await fetch(
        `${baseUrl}/api/resources/${created.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      expect(deleteResponse.status).toBe(204);
    }, timeout);
  });

  describe('External Integrations', () => {
    it('should connect to payment provider', async () => {
      // Light check that payment provider is reachable
      const response = await fetch(`${baseUrl}/api/payments/health`);
      expect(response.status).toBe(200);
    }, timeout);
  });

  describe('Performance Sanity', () => {
    it('should respond within 2 seconds', async () => {
      const start = Date.now();
      await fetch(`${baseUrl}/api/resources`);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    }, timeout);
  });
});
```

SMOKE TEST PROPERTIES:
- Fast: Complete suite < 2 minutes
- Non-destructive: Don't modify production data (or clean up)
- Independent: No test depends on another
- Environment-agnostic: Works on any deployment target
- Automated: Runs in CI/CD post-deployment

OUTPUT:
1. Smoke test suite
2. Configuration (environment variables, endpoints)
3. CI/CD integration (run after deployment)
4. Alert configuration (notify on failure)
5. Rollback trigger (auto-rollback on smoke test failure)
```

#### Prompt 26 — Contract Test Suite

```text
Generate consumer-driven contract tests:

CONSUMER: [Service that calls the API]
PROVIDER: [Service that provides the API]
INTERACTIONS: [List API interactions between them]

CONSUMER SIDE:
```typescript
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const provider = new PactV3({
  consumer: 'OrderService',
  provider: 'UserService',
});

describe('OrderService -> UserService Contract', () => {
  it('should get user by ID', async () => {
    await provider
      .given('user with ID user-123 exists')
      .uponReceiving('a request for user user-123')
      .withRequest({
        method: 'GET',
        path: '/api/users/user-123',
        headers: {
          Authorization: MatchersV3.string('Bearer token-123'),
        },
      })
      .willRespondWith({
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          id: MatchersV3.string('user-123'),
          email: MatchersV3.email(),
          name: MatchersV3.string('John Doe'),
          role: MatchersV3.regex('admin|editor|viewer', 'editor'),
        },
      })
      .executeTest(async (mockServer) => {
        const client = new UserServiceClient(mockServer.url);
        const user = await client.getUser('user-123');
        expect(user.id).toBe('user-123');
        expect(user.email).toBeDefined();
      });
  });

  it('should return 404 for non-existent user', async () => {
    await provider
      .given('user with ID nonexistent does not exist')
      .uponReceiving('a request for nonexistent user')
      .withRequest({
        method: 'GET',
        path: '/api/users/nonexistent',
      })
      .willRespondWith({
        status: 404,
        body: {
          error: 'NOT_FOUND',
          message: MatchersV3.string(),
        },
      })
      .executeTest(async (mockServer) => {
        const client = new UserServiceClient(mockServer.url);
        await expect(client.getUser('nonexistent')).rejects.toThrow(NotFoundError);
      });
  });
});
```

PROVIDER SIDE:
```typescript
import { Verifier } from '@pact-foundation/pact';

describe('UserService Provider Verification', () => {
  it('should fulfill all consumer contracts', async () => {
    const verifier = new Verifier({
      provider: 'UserService',
      providerBaseUrl: 'http://localhost:3000',
      pactBrokerUrl: process.env.PACT_BROKER_URL,
      publishVerificationResult: process.env.CI === 'true',
      stateHandlers: {
        'user with ID user-123 exists': async () => {
          await seedUser({ id: 'user-123', email: 'john@example.com', name: 'John Doe' });
        },
        'user with ID nonexistent does not exist': async () => {
          // No setup needed — user doesn't exist
        },
      },
    });

    await verifier.verifyProvider();
  });
});
```

OUTPUT:
1. Consumer contract tests
2. Provider verification tests
3. State handlers
4. Pact broker configuration
5. CI/CD integration (can-i-deploy check)
6. Contract documentation
```

## Edge Cases & Failure Modes

### Testing Anti-Patterns

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| Ice Cream Cone | Too many E2E, too few unit tests | Invert the pyramid |
| Test Interdependency | Tests fail when run in different order | Isolate all tests |
| Testing Implementation | Tests break on refactor | Test behavior, not code |
| Ignoring Flaky Tests | Team ignores all test failures | Fix or quarantine immediately |
| 100% Coverage Worship | High coverage but low quality | Use mutation testing |

::: info War Story
A healthcare startup had 95% code coverage but still shipped a critical bug: patient medication dosages were being doubled when a concurrent update occurred. Their tests all ran sequentially and never tested concurrent access. After the incident, they added concurrency tests to their testing prompts (similar to Prompt 7) and discovered 3 more race conditions in their codebase. The lesson: coverage percentage alone is a vanity metric. Test quality — what scenarios are covered — matters far more than what lines are covered.
:::

## Performance Characteristics

| Test Type | Target Duration | Typical Count | Run Frequency |
|-----------|----------------|---------------|---------------|
| Unit Tests | < 100ms each | 500-5000 | Every commit |
| Integration Tests | < 5s each | 50-500 | Every PR |
| E2E Tests | < 30s each | 20-100 | Every merge to main |
| Performance Tests | 5-60 min total | 10-50 | Nightly/weekly |
| Security Tests | 1-10 min total | 50-200 | Every PR |
| Smoke Tests | < 2 min total | 10-20 | Every deployment |

The optimal test suite execution time follows:

$$
T_{optimal} = \alpha \cdot n_{unit} \cdot t_{unit} + \beta \cdot n_{int} \cdot t_{int} + \gamma \cdot n_{e2e} \cdot t_{e2e}
$$

Where $\alpha, \beta, \gamma$ account for parallelization factor (0.1-1.0 depending on available CPU cores and test isolation).

## Mathematical Foundations

### Test Coverage as a Probabilistic Model

Test coverage can be modeled as a probability of detecting a bug:

$$
P(\text{detect bug } b) = 1 - \prod_{i=1}^{n} (1 - p_i(b))
$$

Where $p_i(b)$ is the probability that test $i$ detects bug $b$. More diverse tests (testing different aspects) increase overall detection probability more than similar tests.

### Mutation Testing Confidence

The mutation score provides a confidence measure:

$$
\text{Mutation Score} = \frac{|\text{Killed Mutants}|}{|\text{Total Mutants}| - |\text{Equivalent Mutants}|}
$$

A mutation score of 0.85 means approximately 85% of possible bugs in the tested code would be caught by the test suite.

## Decision Framework

| Question | Answer | Testing Strategy |
|----------|--------|-----------------|
| What kind of code? | Pure function | Property-based tests (Prompt 3) |
| What kind of code? | Stateful service | State transition tests (Prompt 7) |
| What kind of code? | API endpoint | Integration tests (Prompt 8) |
| What kind of code? | UI component | Snapshot + accessibility (Prompt 4, 15) |
| What kind of code? | Data pipeline | Data-driven tests (Prompt 17) |
| What risk level? | Critical (payments) | Full coverage + mutation testing |
| What risk level? | Medium (CRUD) | Standard unit + integration |
| What risk level? | Low (internal tool) | Smoke tests + key scenarios |

## Advanced Topics

### AI-Assisted Test Oracle

Use AI to generate test oracles (expected outputs) for complex transformations:

```typescript
// Instead of hand-computing expected outputs:
const testCases = await generateTestOracle({
  function: 'calculateShippingCost',
  inputs: [
    { weight: 2.5, destination: 'US', expedited: false },
    { weight: 10, destination: 'EU', expedited: true },
    { weight: 0.1, destination: 'UK', expedited: false },
  ],
  rules: `
    Base rate: $5 for US, $15 for international
    Weight surcharge: $2 per kg over 1kg
    Expedited: 2x base rate
    Minimum charge: $5
  `,
});
```

### Metamorphic Testing

When you cannot easily determine the correct output, test relationships between inputs and outputs:

$$
\text{If } f(x) = y, \text{ then } f(2x) \approx 2y \text{ (for linear functions)}
$$

```typescript
it('should double the tax when income doubles', () => {
  const tax1 = calculateTax(50000);
  const tax2 = calculateTax(100000);
  // Tax is progressive, so doubling income should MORE than double tax
  expect(tax2).toBeGreaterThan(tax1 * 2);
});
```

## Cross-References

- [Code Generation Prompts](./code-generation-prompts.md) — Generate code with tests
- [Refactoring Prompts](./refactoring-prompts.md) — Refactor tests and tested code
- [Architecture Review Prompts](./architecture-review-prompts.md) — Review test architecture
- [Accessibility Prompts](../ui-prompts/accessibility-prompts.md) — Accessibility testing
- [System Design Prompts](../architecture-prompts/system-design-prompts.md) — Testability in design

## Related Deep Dives

- [Microservices Testing Strategies](/architecture-patterns/microservices/testing-strategies) — Contract testing, integration testing, and end-to-end testing patterns specific to distributed microservice systems
- [Deployment Strategies](/devops/deployment-strategies/) — Blue-green, canary, rolling updates, and feature flag deployment patterns that rely on comprehensive test suites
- [Database Migrations](/devops/deployment-strategies/database-migrations) — Safe migration testing workflows including rollback validation and data integrity verification
- [Chaos Engineering](/devops/incident-response/chaos-engineering) — Failure injection and resilience testing techniques to validate system behavior under stress
