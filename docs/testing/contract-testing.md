---
title: "Contract Testing"
description: "Consumer-driven contracts with Pact — verify API agreements between microservices without integration environments, with provider verification and CI integration."
tags: [testing, contract-testing, pact, microservices, api-testing]
difficulty: advanced
prerequisites: ["/testing/integration-testing"]
lastReviewed: "2026-03-20"
---

# Contract Testing

In a [microservices architecture](/architecture-patterns/microservices/), every service depends on the APIs of other services. When Service A calls Service B's `/api/users/{id}` endpoint, both services need to agree on the shape of the request and response. That agreement is the *contract*.

The problem is that contracts break silently. Service B adds a required field, renames a property, or changes a date format, and Service A starts failing — often in production, often at 2 AM. Integration tests catch some of these problems, but they require all services to be running simultaneously, making them slow, expensive, and hard to maintain.

Contract testing solves this by verifying the agreement between consumer and provider independently, without requiring them to run together.

## The Problem Contract Testing Solves

```mermaid
sequenceDiagram
    participant Consumer as Order Service<br/>(Consumer)
    participant Provider as User Service<br/>(Provider)

    Note over Consumer,Provider: Day 1: Everything works
    Consumer->>Provider: GET /api/users/123
    Provider-->>Consumer: { "id": 123, "name": "Alice", "email": "a@b.com" }

    Note over Consumer,Provider: Day 30: Provider changes response
    Consumer->>Provider: GET /api/users/123
    Provider-->>Consumer: { "id": 123, "fullName": "Alice", "emailAddress": "a@b.com" }
    Note over Consumer: CRASH: "name" is undefined

    Note over Consumer,Provider: With contract testing: Provider's CI catches the break BEFORE deploy
```

### Contract Testing vs Integration Testing

| Aspect | Integration Testing | Contract Testing |
|--------|-------------------|-----------------|
| **Requires running services** | Yes — both consumer and provider must be up | No — tested independently |
| **Speed** | Slow (network calls, containers) | Fast (runs locally) |
| **Failure isolation** | Hard — which service caused the failure? | Clear — consumer or provider |
| **Environment** | Needs shared test environment | Runs in CI without shared infra |
| **Confidence** | High for happy path | High for API shape, not business logic |
| **Maintenance** | High — environment drift, data management | Low — contracts are versioned artifacts |
| **When to use** | Critical cross-service flows | Every service-to-service boundary |

::: tip Contract Tests Complement Integration Tests
Contract tests do not replace integration tests. They verify the *shape* of communication (fields, types, status codes) but not the *behavior* (does the query return the right user?). Use contract tests to catch structural breakages early, and targeted integration tests for critical behavioral flows.
:::

## Consumer-Driven Contracts

The most effective form of contract testing is **consumer-driven contracts (CDC)**. The consumer defines what it expects from the provider, and the provider verifies that it can satisfy those expectations.

### Why Consumer-Driven?

The consumer knows what it needs. The provider does not know what every consumer uses. If the provider defines the contract, it has no way of knowing that renaming `name` to `fullName` will break three downstream services. But if each consumer defines its expectations, the provider can verify all of them before deploying.

```mermaid
graph TB
    subgraph Consumers
        C1["Order Service<br/>Expects: id, name, email"]
        C2["Billing Service<br/>Expects: id, email, tier"]
        C3["Notification Service<br/>Expects: id, name, phone"]
    end

    subgraph Provider["User Service (Provider)"]
        API["GET /api/users/:id"]
    end

    subgraph Broker["Pact Broker"]
        CONTRACT1["Order ↔ User Contract"]
        CONTRACT2["Billing ↔ User Contract"]
        CONTRACT3["Notification ↔ User Contract"]
    end

    C1 -->|publishes contract| CONTRACT1
    C2 -->|publishes contract| CONTRACT2
    C3 -->|publishes contract| CONTRACT3

    CONTRACT1 -->|verifies against| API
    CONTRACT2 -->|verifies against| API
    CONTRACT3 -->|verifies against| API

    style C1 fill:#2563eb,color:#fff
    style C2 fill:#2563eb,color:#fff
    style C3 fill:#2563eb,color:#fff
    style API fill:#16a34a,color:#fff
    style CONTRACT1 fill:#ea580c,color:#fff
    style CONTRACT2 fill:#ea580c,color:#fff
    style CONTRACT3 fill:#ea580c,color:#fff
```

## Pact Framework Deep Dive

Pact is the de facto standard for consumer-driven contract testing. It supports JavaScript, TypeScript, Python, Go, Java, Ruby, and .NET.

### How Pact Works

The Pact workflow has four steps:

1. **Consumer writes a test** that defines the expected interaction (request + response)
2. **Pact generates a contract file** (a JSON "pact") from the consumer test
3. **Contract is published** to a Pact Broker (shared artifact repository)
4. **Provider verifies** the contract by replaying the interactions against its real API

```mermaid
sequenceDiagram
    participant CT as Consumer Test
    participant PF as Pact File
    participant PB as Pact Broker
    participant PV as Provider Verification

    CT->>PF: 1. Generate pact from test
    PF->>PB: 2. Publish pact to broker
    PB->>PV: 3. Provider fetches pacts
    PV->>PV: 4. Replay interactions against real API
    PV->>PB: 5. Publish verification results
```

### Consumer Side (TypeScript)

The consumer writes a test that describes what it expects from the provider:

```typescript
import { PactV4, MatchersV3 } from '@pact-foundation/pact';
import { describe, it, expect } from 'vitest';
import { UserApiClient } from './user-api-client';

const { like, eachLike, uuid, email } = MatchersV3;

const provider = new PactV4({
  consumer: 'OrderService',
  provider: 'UserService',
  dir: './pacts',
});

describe('UserApiClient', () => {
  it('fetches a user by ID', async () => {
    // Define the expected interaction
    await provider
      .addInteraction()
      .given('a user with ID usr-1 exists')
      .uponReceiving('a request to get user usr-1')
      .withRequest('GET', '/api/users/usr-1', (builder) => {
        builder.headers({
          Accept: 'application/json',
          Authorization: like('Bearer token-123'),
        });
      })
      .willRespondWith(200, (builder) => {
        builder
          .headers({ 'Content-Type': 'application/json' })
          .jsonBody({
            id: like('usr-1'),
            name: like('Alice'),
            email: email('alice@example.com'),
            tier: like('premium'),
          });
      })
      .executeTest(async (mockServer) => {
        // Use the mock server as the provider
        const client = new UserApiClient(mockServer.url);
        const user = await client.getUserById('usr-1');

        expect(user.id).toBe('usr-1');
        expect(user.name).toBe('Alice');
        expect(user.email).toBe('alice@example.com');
      });
  });

  it('returns 404 for unknown user', async () => {
    await provider
      .addInteraction()
      .given('no user with ID usr-999 exists')
      .uponReceiving('a request to get nonexistent user')
      .withRequest('GET', '/api/users/usr-999')
      .willRespondWith(404, (builder) => {
        builder.jsonBody({
          error: like('not_found'),
          message: like('User not found'),
        });
      })
      .executeTest(async (mockServer) => {
        const client = new UserApiClient(mockServer.url);

        await expect(client.getUserById('usr-999')).rejects.toThrow(
          'User not found'
        );
      });
  });
});
```

### Pact Matchers

Pact matchers are crucial. They allow you to verify the *shape* of data without hardcoding exact values:

| Matcher | What It Verifies | Example |
|---------|-----------------|---------|
| `like(value)` | Same type as example | `like("Alice")` matches any string |
| `eachLike(value)` | Array where each element matches | `eachLike({ id: like("1") })` |
| `regex(value, pattern)` | Matches regex | `regex("2026-01-01", "\\d{4}-\\d{2}-\\d{2}")` |
| `email()` | Valid email format | `email("a@b.com")` |
| `uuid()` | Valid UUID format | `uuid("550e8400...")` |
| `integer()` | Any integer | `integer(42)` |
| `decimal()` | Any decimal | `decimal(3.14)` |
| `boolean()` | Any boolean | `boolean(true)` |
| `datetime()` | ISO 8601 datetime | `datetime("2026-01-01T00:00:00Z")` |

::: warning Be Specific with Matchers
Using `like()` for everything defeats the purpose. If a field must be a UUID, use `uuid()`. If it must be an email, use `email()`. The more specific your matchers, the more breakages you catch.
:::

### Provider Side (TypeScript)

The provider verifies that it can satisfy all consumer contracts:

```typescript
import { Verifier } from '@pact-foundation/pact';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { createApp } from './app';
import { seedDatabase, cleanDatabase } from './test-helpers';

describe('UserService Provider Verification', () => {
  let server: Server;

  beforeAll(async () => {
    const app = createApp();
    server = app.listen(0);
  });

  afterAll(() => {
    server.close();
  });

  it('satisfies all consumer contracts', async () => {
    const port = (server.address() as AddressInfo).port;

    await new Verifier({
      providerBaseUrl: `http://localhost:${port}`,
      pactBrokerUrl: process.env.PACT_BROKER_URL,
      provider: 'UserService',
      providerVersion: process.env.GIT_SHA,
      publishVerificationResult: !!process.env.CI,

      // State handlers set up preconditions
      stateHandlers: {
        'a user with ID usr-1 exists': async () => {
          await seedDatabase({
            users: [
              { id: 'usr-1', name: 'Alice', email: 'alice@example.com', tier: 'premium' },
            ],
          });
        },
        'no user with ID usr-999 exists': async () => {
          await cleanDatabase();
        },
      },
    }).verifyProvider();
  });
});
```

### Provider States

Provider states (the `given()` clause) are the mechanism for setting up test preconditions. They solve the problem of the provider needing specific data to satisfy consumer expectations.

```typescript
// Provider state handlers — run before each interaction
stateHandlers: {
  'a user with ID usr-1 exists': async () => {
    // Seed the database with the expected user
    await db.users.create({
      id: 'usr-1',
      name: 'Alice',
      email: 'alice@example.com',
      tier: 'premium',
    });
  },
  'user usr-1 has 3 orders': async () => {
    // Seed user and their orders
    await db.users.create({ id: 'usr-1', name: 'Alice' });
    await db.orders.createMany([
      { userId: 'usr-1', total: 5000 },
      { userId: 'usr-1', total: 3000 },
      { userId: 'usr-1', total: 7500 },
    ]);
  },
  'the system has no users': async () => {
    await db.users.deleteAll();
  },
},
```

### Python Consumer Example

```python
import atexit
import unittest
from pact import Consumer, Provider

pact = Consumer('OrderService').has_pact_with(
    Provider('UserService'),
    pact_dir='./pacts',
)
pact.start_service()
atexit.register(pact.stop_service)

class TestUserApiClient(unittest.TestCase):
    def test_get_user_by_id(self):
        expected = {
            "id": "usr-1",
            "name": "Alice",
            "email": "alice@example.com",
        }

        (pact
         .given("a user with ID usr-1 exists")
         .upon_receiving("a request to get user usr-1")
         .with_request("GET", "/api/users/usr-1")
         .will_respond_with(200, body=Like(expected)))

        with pact:
            client = UserApiClient(pact.uri)
            user = client.get_user_by_id("usr-1")

            self.assertEqual(user["name"], "Alice")
```

### Go Consumer Example

```go
func TestUserAPIClient(t *testing.T) {
    mockProvider, err := consumer.NewV4Pact(consumer.MockHTTPProviderConfig{
        Consumer: "OrderService",
        Provider: "UserService",
        PactDir:  "./pacts",
    })
    if err != nil {
        t.Fatal(err)
    }

    err = mockProvider.
        AddInteraction().
        Given("a user with ID usr-1 exists").
        UponReceiving("a request to get user usr-1").
        WithCompleteRequest(consumer.Request{
            Method: "GET",
            Path:   matchers.String("/api/users/usr-1"),
        }).
        WithCompleteResponse(consumer.Response{
            Status: 200,
            Body: matchers.MapMatcher{
                "id":    matchers.Like("usr-1"),
                "name":  matchers.Like("Alice"),
                "email": matchers.Like("alice@example.com"),
            },
        }).
        ExecuteTest(t, func(config consumer.MockServerConfig) error {
            client := NewUserAPIClient(config.URL)
            user, err := client.GetUserByID("usr-1")
            if err != nil {
                return err
            }
            if user.Name != "Alice" {
                return fmt.Errorf("expected Alice, got %s", user.Name)
            }
            return nil
        })

    if err != nil {
        t.Fatal(err)
    }
}
```

## The Pact Broker

The Pact Broker is the central repository where contracts are published and verification results are stored. It acts as the single source of truth for API compatibility.

```mermaid
graph LR
    subgraph ConsumerCI["Consumer CI Pipeline"]
        CT["Consumer Tests"] -->|publish pact| BROKER
    end

    subgraph Broker["Pact Broker"]
        BROKER["Contract Repository<br/>+ Verification Matrix<br/>+ can-i-deploy"]
    end

    subgraph ProviderCI["Provider CI Pipeline"]
        BROKER -->|fetch pacts| PV["Provider Verification"]
        PV -->|publish results| BROKER
    end

    subgraph Deploy["Deployment Gate"]
        BROKER -->|can-i-deploy?| GATE["Deploy or Block"]
    end

    style CT fill:#2563eb,color:#fff
    style BROKER fill:#ea580c,color:#fff
    style PV fill:#16a34a,color:#fff
    style GATE fill:#7c3aed,color:#fff
```

### The can-i-deploy Check

The most powerful feature of the Pact Broker is `can-i-deploy`. Before deploying any service, you ask the broker: "Is this version of my service compatible with all its consumers and providers in production?"

```bash
# Before deploying UserService, check compatibility
pact-broker can-i-deploy \
  --pacticipant UserService \
  --version $(git rev-parse HEAD) \
  --to-environment production

# Output:
# COMPUTER SAYS YES
# All contracts verified successfully.
# UserService (abc123) -> OrderService (def456): VERIFIED
# UserService (abc123) -> BillingService (ghi789): VERIFIED
```

This becomes a mandatory CI gate — no service deploys unless `can-i-deploy` passes.

## Contract Testing for Events

Contract testing is not limited to HTTP APIs. Pact supports message-based contracts for event-driven systems using [message queues](/system-design/message-queues/) and [event-driven architectures](/architecture-patterns/event-driven/).

```typescript
// Consumer — expects to receive an OrderCreated event
await provider
  .addInteraction()
  .given('an order is placed')
  .expectsToReceive('an OrderCreated event')
  .withContent({
    type: like('order.created'),
    payload: {
      orderId: uuid(),
      userId: uuid(),
      total: integer(5000),
      currency: like('USD'),
      items: eachLike({
        productId: uuid(),
        quantity: integer(1),
        price: integer(2500),
      }),
    },
  })
  .executeTest(async (message) => {
    // Verify your consumer can process this message
    const handler = new OrderCreatedHandler();
    await handler.handle(JSON.parse(message.contents.toString()));
  });
```

## When Not to Use Contract Testing

Contract testing is powerful but not universal. Skip it when:

- **Single-team monolith** — You own both sides of the API. [Integration tests](/testing/integration-testing) are sufficient.
- **Third-party APIs** — You do not control the provider, so you cannot run provider verification. Use integration tests with recorded responses instead.
- **GraphQL** — Pact's HTTP-interaction model does not fit GraphQL's query-based approach well. Use schema validation tools instead.
- **Rapidly changing prototypes** — Contract tests add friction. Wait until API boundaries stabilize.

## CI Pipeline Integration

```mermaid
graph LR
    subgraph ConsumerPipeline["Consumer CI"]
        CL["Lint"] --> CU["Unit Tests"]
        CU --> CC["Contract Tests<br/>(generate pact)"]
        CC --> CP["Publish Pact<br/>to Broker"]
    end

    subgraph ProviderPipeline["Provider CI"]
        PL["Lint"] --> PU["Unit Tests"]
        PU --> PI["Integration Tests"]
        PI --> PV["Verify Pacts<br/>from Broker"]
        PV --> PD["can-i-deploy"]
    end

    CP -.->|trigger| PV

    style CC fill:#ea580c,color:#fff
    style CP fill:#ea580c,color:#fff
    style PV fill:#16a34a,color:#fff
    style PD fill:#7c3aed,color:#fff
```

## Common Pitfalls

### 1. Over-specifying Contracts

```typescript
// BAD — hardcodes exact values, breaks on any change
.willRespondWith(200, (builder) => {
  builder.jsonBody({
    id: 'usr-1',                    // Exact value
    name: 'Alice Johnson',          // Exact value
    createdAt: '2026-01-15T10:00Z', // Exact timestamp
  });
})

// GOOD — specifies shape, not values
.willRespondWith(200, (builder) => {
  builder.jsonBody({
    id: like('usr-1'),
    name: like('Alice'),
    createdAt: datetime('2026-01-15T10:00:00Z', "yyyy-MM-dd'T'HH:mm:ss'Z'"),
  });
})
```

### 2. Testing Business Logic in Contracts

Contract tests verify *shape*, not *behavior*. Do not assert that the discount calculation is correct — that belongs in a unit test.

### 3. Ignoring Provider States

If your consumer test uses `given('a user exists')` but the provider does not implement a matching state handler, verification fails for the wrong reason. Keep state handler names explicit and consistent.

## Further Reading

- [Integration Testing](/testing/integration-testing) — when you need to test real behavior, not just API shape
- [Microservices Communication](/architecture-patterns/microservices/communication-patterns) — the architectural patterns that create the need for contract testing
- [Event Schema Evolution](/architecture-patterns/event-driven/event-schema-evolution) — managing breaking changes in event-driven contracts
- [API Gateway Pattern](/architecture-patterns/microservices/api-gateway-pattern) — where contract testing meets API gateways
- [Test Architecture](/testing/test-architecture) — organizing contract tests within your broader test strategy

---

## Key Takeaway

::: tip
- Contract tests verify the shape of API agreements (fields, types, status codes) between services independently, without requiring them to run simultaneously.
- Consumer-driven contracts (CDC) let each consumer define what it needs, and the provider verifies all consumer expectations before deploying -- catching silent breakages before production.
- The Pact Broker's `can-i-deploy` command is the critical CI gate: no service deploys unless it is verified compatible with all consumers and providers in production.
:::

## Common Misconceptions

::: warning Misconception: Contract tests replace integration tests
Contract tests verify the shape of communication (fields, types, status codes) but not the behavior (does the query return the right user for a given ID?). They are complementary: use contract tests for structural compatibility and integration tests for critical behavioral flows.
:::

::: warning Misconception: The provider should define the contract
If the provider defines the contract, it has no way of knowing which fields each consumer actually uses. Consumer-driven contracts ensure the provider knows exactly what every consumer depends on, so renaming `name` to `fullName` is caught immediately.
:::

::: warning Misconception: Contract testing works for all API types
Contract testing with Pact is optimized for HTTP REST APIs and message-based systems. It does not fit well with GraphQL (query-based approach) or third-party APIs (you cannot run provider verification). Use schema validation for GraphQL and recorded response tests for third-party APIs.
:::

::: warning Misconception: Pact matchers should use exact values
Using exact values (`id: 'usr-1'`) defeats the purpose of contract testing. Use type matchers (`like('usr-1')`) to verify shape, not content. Be specific with format matchers (`uuid()`, `email()`, `datetime()`) to catch more breakages.
:::

## In Production

::: tip Uber
Uber uses consumer-driven contract testing across 4,000+ microservices. Their internal contract testing platform automatically triggers provider verification whenever a consumer publishes a new contract. The `can-i-deploy` check is mandatory before any service promotion to production.
:::

::: tip Stripe
Stripe's API versioning strategy is backed by contract tests. When they release a new API version, contract tests from all consumer teams (internal and partner integrations) are verified against the new version before it goes live. This is how Stripe maintains backward compatibility across hundreds of API versions.
:::

::: tip Netflix
Netflix uses contract testing for their event-driven architecture. Producers of Kafka events publish message contracts, and all consumers verify they can deserialize the events. When a producer wants to change an event schema, the contract broker shows exactly which consumers would break.
:::

## Try It Yourself

**Exercise 1: Write a consumer contract test**

Write a Pact consumer test for an `OrderService` that expects to call `GET /api/products/{id}` and receive a response with `id`, `name`, `price`, and `inStock` fields.

::: details Solution
```typescript
import { PactV4, MatchersV3 } from '@pact-foundation/pact';
const { like, integer, boolean } = MatchersV3;

const provider = new PactV4({
  consumer: 'OrderService',
  provider: 'ProductService',
});

describe('ProductApiClient', () => {
  it('fetches a product by ID', async () => {
    await provider
      .addInteraction()
      .given('product P-1 exists')
      .uponReceiving('a request for product P-1')
      .withRequest('GET', '/api/products/P-1')
      .willRespondWith(200, (builder) => {
        builder.jsonBody({
          id: like('P-1'),
          name: like('Widget'),
          price: integer(2999),
          inStock: boolean(true),
        });
      })
      .executeTest(async (mockServer) => {
        const client = new ProductApiClient(mockServer.url);
        const product = await client.getById('P-1');
        expect(product.name).toBe('Widget');
        expect(product.price).toBe(2999);
      });
  });
});
```
:::

**Exercise 2: Implement provider state handlers**

Write provider state handlers for two scenarios: "product P-1 exists" and "no products exist". These handlers should seed or clean the database before Pact replays each interaction.

::: details Solution
```typescript
const stateHandlers = {
  'product P-1 exists': async () => {
    await db.products.deleteAll();
    await db.products.create({
      id: 'P-1',
      name: 'Widget',
      price: 2999,
      inStock: true,
    });
  },
  'no products exist': async () => {
    await db.products.deleteAll();
  },
};

// Used in provider verification
await new Verifier({
  providerBaseUrl: `http://localhost:${port}`,
  pactBrokerUrl: process.env.PACT_BROKER_URL,
  provider: 'ProductService',
  stateHandlers,
}).verifyProvider();
```
:::

## Quick Quiz

**1. What does the consumer publish in consumer-driven contract testing?**
- A) The provider's API documentation
- B) A contract file (pact) describing expected requests and responses
- C) The provider's source code
- D) Integration test results

::: details Answer
**B) A contract file (pact) describing expected requests and responses.** The consumer defines what it expects, and this is published as a versioned artifact to the Pact Broker.
:::

**2. What does `can-i-deploy` check before a service deploys?**
- A) Whether the service has 100% code coverage
- B) Whether the service's version is compatible with all consumers and providers in production
- C) Whether the service passes unit tests
- D) Whether the service has been manually approved

::: details Answer
**B) Whether the service's version is compatible with all consumers and providers in production.** It queries the Pact Broker's verification matrix to determine if all contracts have been verified successfully.
:::

**3. When should you NOT use contract testing?**
- A) In a microservices architecture with 10+ services
- B) For event-driven message-based communication
- C) For third-party APIs you do not control
- D) For HTTP REST APIs between internal services

::: details Answer
**C) For third-party APIs you do not control.** You cannot run provider verification against a third-party API. Use integration tests with recorded responses instead.
:::

---

> **One-Liner Summary:** Contract tests catch silent API breakages between services before production by letting consumers define their expectations and providers verify them independently.
