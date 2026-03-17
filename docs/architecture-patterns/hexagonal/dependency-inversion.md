---
title: "Dependency Inversion in Practice"
description: "DIP as the theoretical foundation of hexagonal architecture — constructor injection, IoC containers, manual DI, and the stable dependencies principle in TypeScript"
tags: [dependency-inversion, dependency-injection, ioc, typescript, solid, testing]
difficulty: "intermediate"
prerequisites: ["architecture-patterns/hexagonal", "architecture-patterns/hexagonal/ports-and-adapters"]
lastReviewed: "2026-03-17"
---

# Dependency Inversion in Practice

Hexagonal Architecture is not arbitrary. Every rule it imposes — define interfaces before implementations, inject dependencies through constructors, wire everything together in a composition root — flows from a single principle: **the Dependency Inversion Principle (DIP)**. Understanding DIP at the theoretical level explains not just what to do, but why, and it gives you the tools to make good decisions in the gray areas that no pattern description covers.

## The Dependency Inversion Principle

Robert Martin stated the Dependency Inversion Principle in two parts in his 1996 paper "The Dependency Inversion Principle" (C++ Report):

> **A. High-level modules should not depend on low-level modules. Both should depend on abstractions.**
> **B. Abstractions should not depend on details. Details should depend on abstractions.**

In 2002, he clarified this in *Agile Software Development: Principles, Patterns, and Practices*:

> The name "Dependency Inversion" is chosen because the dependency structure of a well-designed object-oriented program is "inverted" with respect to the dependency structure that normally results from naive object-oriented analysis.

"Naive" object-oriented design flows naturally downward: a service creates its own dependencies, which create their own dependencies, forming a chain. The business layer creates a database connection, which talks directly to PostgreSQL. This seems natural because it mirrors the execution order — the service calls the database, so the service depends on the database.

DIP inverts this by inserting abstractions. The business layer declares what it needs (an abstraction — a port). The infrastructure layer implements that need (a detail — an adapter). Both depend on the abstraction. Execution order is unchanged; dependency direction is reversed.

## Formalizing Dependency Direction

Let's be precise about what "depends on" means. Module A depends on module B if:

- A imports B (JavaScript/TypeScript `import` statement)
- A inherits from B
- A uses B's type annotations
- A instantiates B (`new B()`)
- A calls a method on a B instance

If any of these are true, A is coupled to B. If B changes its interface, A may need to change too. If B requires a database connection to instantiate, A cannot be tested without that database.

In a naive layered architecture:

```
OrderService → OrderRepository → PostgresClient → PostgreSQL
```

`OrderService` depends on `OrderRepository`. You cannot instantiate `OrderService` without `OrderRepository`. You cannot test `OrderService` without a real `OrderRepository`. You cannot swap `PostgresClient` without touching `OrderRepository`.

After applying DIP:

```
OrderService → IOrderRepository ← PostgresOrderRepository → PostgresClient → PostgreSQL
```

`OrderService` depends on `IOrderRepository` (the abstraction, a TypeScript interface). `PostgresOrderRepository` also depends on `IOrderRepository` (it implements it). Both depend on the abstraction. `PostgresOrderRepository` depends on `PostgresClient`.

Now:
- `OrderService` can be tested by injecting any implementation of `IOrderRepository`
- `PostgresOrderRepository` can be swapped for another implementation without touching `OrderService`
- The two can be compiled and tested independently

## The Stable Dependencies Principle

DIP works because of a deeper principle: **the Stable Dependencies Principle (SDP)**:

$$\text{Every module should depend on modules that are more stable than itself}$$

"Stability" in this context is not about uptime or reliability — it means resistance to change. A module is stable if few things cause it to change. A module is instable (or volatile) if many things cause it to change.

Measurement of stability:

$$\text{stability}(M) = \frac{\text{efferent couplings}(M)}{\text{afferent couplings}(M) + \text{efferent couplings}(M)}$$

Where:
- **Efferent couplings** (Ce): number of modules that M depends on
- **Afferent couplings** (Ca): number of modules that depend on M

A module that nothing depends on (Ca = 0) has nothing to stabilize it. It can change freely. A module that everything depends on (Ca = large number) is very stable — changing it would require changing all its dependents.

In hexagonal architecture:
- **Domain entities and ports** have high Ca (many modules depend on them) → high stability
- **Adapters** have low Ca (only the composition root depends on them) → low stability (can change freely)

This is exactly what you want. Domain entities should be stable (they change only when business rules change). Adapters should be volatile (you want to be able to swap them).

## The Stable Abstractions Principle

The companion to SDP is the **Stable Abstractions Principle (SAP)**:

$$\text{abstractness}(M) = \frac{\text{abstract classes and interfaces in M}}{\text{all classes in M}}$$

$$\text{SAP}: \text{stability}(M) \approx \text{abstractness}(M)$$

Stable modules should be abstract. Volatile modules should be concrete.

In TypeScript:
- Port interfaces (`UserRepository`, `EmailService`) are abstract — they have no implementation, only declarations. They should be stable.
- Adapter classes (`PostgresUserRepository`, `SmtpEmailService`) are concrete — they have implementations. They should be volatile.

Violating SAP produces two pathologies:

1. **The Zone of Pain**: High stability + Low abstractness. A concrete class that nothing depends on directly but that is transitively depended on everywhere. Any change ripples everywhere. Classic: the database entity used as both the domain object and the API response.

2. **The Zone of Uselessness**: Low stability + High abstractness. An abstract class that nobody implements. Interface explosion without benefit.

## Constructor Injection: The Preferred Method

There are three ways to inject dependencies in TypeScript: constructor injection, property injection, and method injection. Constructor injection is almost always the right choice.

```typescript
// PREFERRED: Constructor injection
class OrderService {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly paymentService: PaymentService,
    private readonly notificationService: NotificationService
  ) {}

  async placeOrder(customerId: string, items: OrderItem[]): Promise<OrderId> {
    // uses this.orderRepo, this.paymentService, this.notificationService
  }
}
```

Constructor injection has three virtues:
1. **Dependencies are explicit**: the constructor signature is a declaration of requirements
2. **The object is always valid**: once constructed, all dependencies are present
3. **Testability**: you cannot construct the object without providing all dependencies

Property injection (setting dependencies after construction) is sometimes needed for circular dependencies or framework constraints, but it weakens guarantees — the object exists before it is usable.

Method injection (passing a dependency into a single method) is useful for optional or per-call dependencies, but overuse leads to method signatures that are polluted with infrastructure concerns.

## Manual Dependency Injection: "Poor Man's DI"

You do not need an IoC container to practice dependency injection. Wiring dependencies manually in a composition root is often the best approach, especially for applications under a few hundred classes.

```typescript
// src/main.ts — manual DI, no container needed

import { Pool } from 'pg'
import { PostgresUserRepository } from './adapters/secondary/postgres/user.repository'
import { PostgresOrderRepository } from './adapters/secondary/postgres/order.repository'
import { SmtpEmailService } from './adapters/secondary/smtp/email.service'
import { BcryptPasswordHasher } from './adapters/secondary/bcrypt/password.hasher'
import { JwtTokenGenerator } from './adapters/secondary/jwt/token.generator'
import { StripePaymentService } from './adapters/secondary/stripe/payment.service'
import { RegisterUserService } from './application/services/register-user.service'
import { PlaceOrderService } from './application/services/place-order.service'
import { createExpressApp } from './adapters/primary/http/app'

async function bootstrap() {
  // Infrastructure setup
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  // Secondary adapters — all depend only on infrastructure
  const userRepo = new PostgresUserRepository(pool)
  const orderRepo = new PostgresOrderRepository(pool)
  const emailService = new SmtpEmailService({
    host: process.env.SMTP_HOST!,
    port: 587,
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
    secure: false,
  })
  const passwordHasher = new BcryptPasswordHasher(12)
  const tokenGenerator = new JwtTokenGenerator(process.env.JWT_SECRET!, '24h')
  const paymentService = new StripePaymentService(process.env.STRIPE_KEY!)

  // Application services — depend only on ports
  const registerUser = new RegisterUserService(userRepo, passwordHasher, emailService, tokenGenerator)
  const placeOrder = new PlaceOrderService(orderRepo, userRepo, paymentService, emailService)

  // Primary adapter — depends on application services (through primary port interfaces)
  const app = createExpressApp({ registerUser, placeOrder })

  app.listen(3000, () => console.log('Running on :3000'))
}

bootstrap()
```

This is clean, explicit, and completely transparent. The dependency graph is readable. There is no magic.

**When manual DI starts to hurt:**
- Many transitive dependencies (A needs B, B needs C, C needs D — wiring A requires knowing about D)
- Scope management (per-request vs singleton lifetimes)
- Conditional construction based on environment or feature flags
- Large number of services (50+ classes)

At that point, an IoC container starts to pay off.

## IoC Containers in TypeScript

An Inversion of Control container manages the lifecycle and wiring of dependencies. TypeScript has several options:

### tsyringe (Microsoft)

Lightweight, decorator-based, works well with TypeScript's decorator metadata:

```typescript
// tsconfig.json: "experimentalDecorators": true, "emitDecoratorMetadata": true

import 'reflect-metadata'
import { container, injectable, inject } from 'tsyringe'

// Tokens for interface bindings
const USER_REPOSITORY = Symbol('UserRepository')
const EMAIL_SERVICE = Symbol('EmailService')
const PASSWORD_HASHER = Symbol('PasswordHasher')
const TOKEN_GENERATOR = Symbol('TokenGenerator')

@injectable()
class RegisterUserService {
  constructor(
    @inject(USER_REPOSITORY) private userRepo: UserRepository,
    @inject(PASSWORD_HASHER) private passwordHasher: PasswordHasher,
    @inject(EMAIL_SERVICE) private emailService: EmailService,
    @inject(TOKEN_GENERATOR) private tokenGenerator: TokenGenerator
  ) {}

  async execute(command: RegisterUserCommand): Promise<RegisterUserResult> {
    // ...
  }
}

// Composition root — register implementations
container.register(USER_REPOSITORY, { useClass: PostgresUserRepository })
container.register(EMAIL_SERVICE, { useClass: SmtpEmailService })
container.register(PASSWORD_HASHER, { useClass: BcryptPasswordHasher })
container.register(TOKEN_GENERATOR, { useClass: JwtTokenGenerator })
container.register(RegisterUserService, { useClass: RegisterUserService })

// Resolve
const service = container.resolve(RegisterUserService)
```

**Pros**: Lightweight, no runtime overhead beyond reflection, straightforward API.
**Cons**: Requires decorator metadata (increases bundle size), decorator syntax is still a TC39 proposal (Stage 3 as of 2026), couples service classes to tsyringe decorators.

### InversifyJS

More feature-rich, with support for middleware, tags, and multi-injection:

```typescript
import 'reflect-metadata'
import { Container, injectable, inject } from 'inversify'

const TYPES = {
  UserRepository: Symbol.for('UserRepository'),
  EmailService: Symbol.for('EmailService'),
  RegisterUserService: Symbol.for('RegisterUserService'),
}

@injectable()
class RegisterUserService {
  constructor(
    @inject(TYPES.UserRepository) private userRepo: UserRepository,
    @inject(TYPES.EmailService) private emailService: EmailService
  ) {}
}

// Container configuration
const container = new Container()
container.bind<UserRepository>(TYPES.UserRepository).to(PostgresUserRepository).inSingletonScope()
container.bind<EmailService>(TYPES.EmailService).to(SmtpEmailService).inSingletonScope()
container.bind<RegisterUserService>(TYPES.RegisterUserService).to(RegisterUserService)

// Resolution
const service = container.get<RegisterUserService>(TYPES.RegisterUserService)
```

**Pros**: Battle-tested, extensive documentation, scope management (Singleton, Transient, Request), middleware support.
**Cons**: Heavier API surface, decorator metadata required, more configuration needed.

### NestJS DI

NestJS ships with its own IoC container built into the framework module system:

```typescript
// NestJS module approach
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [
    RegisterUserService,
    { provide: 'UserRepository', useClass: TypeOrmUserRepository },
    { provide: 'EmailService', useClass: SendGridEmailService },
  ],
  controllers: [UserController],
})
export class UserModule {}
```

**Pros**: Integrated with the NestJS ecosystem, module-level scoping, built-in support for testing (TestingModule).
**Cons**: Tightly coupled to NestJS — using NestJS DI in a non-NestJS project is impractical. The framework IS the container.

### Manual DI vs Container: Decision Framework

Use **manual DI** when:
- The application has fewer than ~30 services
- You want maximum transparency and debuggability
- You want to avoid decorator metadata overhead
- The team is unfamiliar with IoC container concepts

Use a **container** when:
- The application has complex transitive dependency graphs
- You need per-request scoping (each HTTP request gets its own DB connection wrapper)
- You want conditional bindings (bind different implementations based on environment)
- You have circular dependencies that require lazy resolution

## Testing with Dependency Injection

DI is the mechanism that makes unit testing application code possible. There are three kinds of test doubles you inject in place of real adapters:

### Stubs: Preset Return Values

A stub returns predetermined values. Use stubs when the test only cares about the application's reaction to specific data:

```typescript
class StubUserRepository implements UserRepository {
  private users: Map<string, User>

  constructor(seed: User[] = []) {
    this.users = new Map(seed.map(u => [u.id.toString(), u]))
  }

  async findById(id: UserId): Promise<User | null> {
    return this.users.get(id.toString()) ?? null
  }

  async findByEmail(email: Email): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email.equals(email)) return user
    }
    return null
  }

  async save(_user: User): Promise<void> { /* no-op */ }
  async delete(_id: UserId): Promise<void> { /* no-op */ }
  async existsByEmail(email: Email): Promise<boolean> {
    for (const user of this.users.values()) {
      if (user.email.equals(email)) return true
    }
    return false
  }
}

// Usage
const repo = new StubUserRepository([
  User.reconstitute({ id: UserId.from('user-1'), email: Email.from('alice@example.com'), /* ... */ })
])
const service = new AuthenticateUserService(repo, new FakePasswordHasher(), new FakeTokenGenerator())
const result = await service.execute({ email: 'alice@example.com', password: 'password' })
expect(result.userId).toBe('user-1')
```

### Fakes: Working Implementations

A fake is a working implementation that uses lightweight in-process storage. The in-memory repository from the previous page is a fake. Fakes are the most valuable test doubles — they behave correctly for multiple interactions and can verify stateful behavior:

```typescript
describe('PlaceOrderService with fake repositories', () => {
  let orderRepo: InMemoryOrderRepository
  let userRepo: InMemoryUserRepository
  let paymentService: FakePaymentService
  let sut: PlaceOrderService

  beforeEach(async () => {
    orderRepo = new InMemoryOrderRepository()
    userRepo = new InMemoryUserRepository()
    paymentService = new FakePaymentService()

    // Seed: a verified, non-banned user
    await userRepo.save(User.reconstitute({
      id: UserId.from('user-1'),
      email: Email.from('alice@example.com'),
      verifiedAt: new Date(),
      bannedAt: null,
      /* ... */
    }))

    sut = new PlaceOrderService(orderRepo, userRepo, paymentService)
  })

  it('saves the order after successful payment', async () => {
    await sut.execute({ userId: 'user-1', items: [{ productId: 'p1', quantity: 2 }] })
    const orders = orderRepo.all()
    expect(orders).toHaveLength(1)
    expect(orders[0].userId.toString()).toBe('user-1')
  })

  it('does not save the order if payment fails', async () => {
    paymentService.nextCallShouldFail = true
    await expect(sut.execute({ userId: 'user-1', items: [{ productId: 'p1', quantity: 2 }] }))
      .rejects.toThrow(PaymentFailedError)
    expect(orderRepo.all()).toHaveLength(0)
  })
})
```

### Spies: Interaction Verification

A spy records calls made to it. Use spies when you need to verify that the application made a specific call with specific arguments:

```typescript
class SpyEmailService implements EmailService {
  public calls: Array<{ method: string; args: unknown[] }> = []

  async sendVerificationEmail(to: Email, token: string): Promise<void> {
    this.calls.push({ method: 'sendVerificationEmail', args: [to.toString(), token] })
  }

  async sendPasswordResetEmail(to: Email, token: string): Promise<void> {
    this.calls.push({ method: 'sendPasswordResetEmail', args: [to.toString(), token] })
  }

  async sendWelcomeEmail(to: Email, userName: string): Promise<void> {
    this.calls.push({ method: 'sendWelcomeEmail', args: [to.toString(), userName] })
  }

  callsTo(method: string) {
    return this.calls.filter(c => c.method === method)
  }
}

// Usage
const emailSpy = new SpyEmailService()
const service = new RegisterUserService(userRepo, hasher, emailSpy, tokens)
await service.execute({ email: 'alice@example.com', password: 'pw' })

expect(emailSpy.callsTo('sendVerificationEmail')).toHaveLength(1)
expect(emailSpy.callsTo('sendVerificationEmail')[0].args[0]).toBe('alice@example.com')
```

## TypeScript Decorators for DI

TypeScript's experimental decorators allow metadata to be attached to classes for reflection at runtime. This powers the IoC containers described above. Here is what happens under the hood:

```typescript
// When you write:
@injectable()
class RegisterUserService {
  constructor(
    @inject(TYPES.UserRepository) private userRepo: UserRepository
  ) {}
}

// TypeScript compiles this to approximately:
Reflect.defineMetadata('design:paramtypes', [Object], RegisterUserService)
Reflect.defineMetadata('inversify:tagged', [{
  key: 'inject', value: TYPES.UserRepository, index: 0
}], RegisterUserService)
```

At runtime, when the container needs to create `RegisterUserService`, it calls `Reflect.getMetadata('design:paramtypes', RegisterUserService)` to learn what types are expected, then looks up registrations for each type/token.

The limitation: `design:paramtypes` emits TypeScript types, but TypeScript interfaces are erased at runtime. The interface `UserRepository` does not exist as a JavaScript value. This is why IoC containers use `Symbol` tokens (`Symbol.for('UserRepository')`) rather than the interface itself as the binding key.

**Without decorator metadata** (using a factory function pattern):

```typescript
// No decorators needed — factory functions provide the wiring
interface Dependencies {
  userRepo: UserRepository
  emailService: EmailService
  passwordHasher: PasswordHasher
  tokenGenerator: TokenGenerator
}

function createRegisterUserService(deps: Dependencies): RegisterUserPort {
  return new RegisterUserService(
    deps.userRepo,
    deps.passwordHasher,
    deps.emailService,
    deps.tokenGenerator
  )
}
```

This is completely transparent and requires no metadata or decorators. It is the recommended approach for new projects that do not have an existing IoC container investment.

## Circular Dependency Detection and Prevention

Circular dependencies are a red flag in any codebase but are especially dangerous with DI containers. When A depends on B and B depends on A, neither can be constructed first.

```typescript
// PROBLEM: Circular dependency
class OrderService {
  constructor(private readonly notificationService: NotificationService) {}
}

class NotificationService {
  constructor(private readonly orderService: OrderService) {}  // circular!
}
```

This always indicates an architectural problem. The resolution strategies:

### 1. Extract a Common Dependency

Usually, the circular dependency points to a missing abstraction:

```typescript
// SOLUTION: Extract the shared concept
interface OrderSummaryProvider {
  getSummary(orderId: OrderId): Promise<OrderSummary>
}

class OrderService implements OrderSummaryProvider {
  // Does not depend on NotificationService
  async getSummary(orderId: OrderId): Promise<OrderSummary> { /* ... */ }
}

class NotificationService {
  constructor(private readonly orderSummary: OrderSummaryProvider) {}
  // Depends on the abstraction, not on OrderService
}
```

### 2. Event-Based Decoupling

Replace direct method calls with domain events:

```typescript
// OrderService publishes events
class OrderService {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly events: DomainEventPublisher
  ) {}

  async placeOrder(/* ... */): Promise<OrderId> {
    const order = Order.create(/* ... */)
    await this.orderRepo.save(order)
    await this.events.publish(new OrderPlacedEvent(order.id, order.userId))
    return order.id
  }
}

// NotificationService subscribes to events
class OrderNotificationHandler {
  constructor(private readonly notificationService: NotificationService) {}

  async handle(event: OrderPlacedEvent): Promise<void> {
    await this.notificationService.sendOrderConfirmation(event.userId, event.orderId)
  }
}
```

### 3. Lazy Injection

Last resort — use a factory or lazy resolution to break the instantiation cycle:

```typescript
class OrderService {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly getNotificationService: () => NotificationService  // factory
  ) {}

  async placeOrder(/* ... */): Promise<OrderId> {
    // NotificationService is resolved lazily, after both are constructed
    const notifications = this.getNotificationService()
    await notifications.sendConfirmation(/* ... */)
  }
}
```

In the composition root, the factory closes over the already-constructed instance.

## The Real-World Test: Can You Swap Every Adapter?

A quick test for whether DIP is being applied correctly: can you swap every secondary adapter for an in-memory version and run your application fully locally without any external services?

If yes: DIP is working. The application core is isolated.
If no: find every `import` statement in your application services or domain entities that references an adapter or external library. Each one is a DIP violation.

```typescript
// Run this mental check on every application service file:
// 1. What does this file import?
import { RegisterUserCommand } from '../dtos/register-user.command'  // ✓ domain DTO
import { UserRepository } from '../../domain/ports/user.repository' // ✓ port
import { EmailService } from '../../domain/ports/email.service'      // ✓ port
import { Pool } from 'pg'                                            // ✗ DIP violation!
import { PostgresUserRepository } from '../../adapters/...'         // ✗ DIP violation!
```

## Mathematical Foundation

The relationship between abstractions and testability can be expressed formally. Define the **coupling cost** of a module M:

$$\text{coupling\_cost}(M) = \sum_{D \in \text{dependencies}(M)} \text{volatility}(D)$$

Where volatility of D is the probability that D will change in a given time period. For a database adapter (`pg`, TypeORM), volatility is moderate to high — library updates, schema changes, database migrations all cause changes. For a port interface, volatility is low — it changes only when the application's expressed needs change.

With DIP:

$$\text{coupling\_cost}(\text{ApplicationService}) = \sum_{P \in \text{ports}} \text{volatility}(P) \approx \text{low}$$

Without DIP:

$$\text{coupling\_cost}(\text{ApplicationService}) = \sum_{A \in \text{adapters}} \text{volatility}(A) \approx \text{high}$$

The insertion of the abstraction (port) between the application service and the adapter reduces the service's coupling cost to the volatility of the interface, not the volatility of the implementation.

## War Story: Wrong Adapter in Production

::: info War Story
A team built a multi-tenant SaaS application using InversifyJS with environment-based container configuration. In production, they used a Redis-backed session store. In staging, they used an in-memory session store. The container bindings lived in separate files: `container.production.ts` and `container.staging.ts`.

During a deployment incident, the build system configuration was updated to use the wrong container file for a production deployment. The application started in production mode but with the in-memory session store. There was no startup error — the `SessionStore` interface was implemented correctly by both adapters. The application appeared healthy.

Sessions worked correctly — until the first application restart (a pod rollout in Kubernetes, about 45 minutes later). All active sessions were lost. Users were logged out mid-session. For a fintech application where users were in the middle of transfer confirmations, this caused real harm.

The post-mortem had two findings. First, the container configuration selection was implicit — an environment variable pointed to a filename, and that filename was wrong. Second, there was no startup check that verified the expected adapter was loaded.

The fix: add an adapter health check at startup that verified connectivity to the real infrastructure (Redis PING in this case), emit a startup log line naming every adapter that was wired, and add an integration test that verified the production container configuration resolved to non-in-memory adapters for every port. Container configuration is now part of the CI/CD test suite.

The lesson: DI containers are powerful but their magic is also their danger. The wiring is invisible. Make it visible through startup logs, health checks, and integration tests that verify the container resolves to the right adapters.
:::

## Checklist: DIP Applied Correctly

- [ ] Application services have no `import` statements for adapter or framework modules
- [ ] Port interfaces contain no external library types
- [ ] Secondary adapters are constructed only in the composition root
- [ ] All constructor parameters are interfaces (or primitives/value objects), never concrete adapter classes
- [ ] Changing any adapter requires zero changes to application services
- [ ] The full application can run in-memory (for tests) by swapping all secondary adapters
- [ ] Circular dependencies have been eliminated or explained
- [ ] Container configuration (if used) is verified by integration tests
