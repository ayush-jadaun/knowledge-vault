---
title: "Dependency Injection Deep Dive"
description: "Complete guide to Dependency Injection — constructor, property, and method injection; IoC containers (InversifyJS, Spring, Wire); DI in serverless and microservices; and how DI transforms testability."
tags: [dependency-injection, design-patterns, ioc, testing, architecture]
difficulty: intermediate
prerequisites: [design-patterns]
lastReviewed: "2026-03-20"
---

# Dependency Injection Deep Dive

Dependency Injection (DI) is the single most impactful design pattern in modern software engineering. It is not a framework feature. It is not an enterprise Java concern. It is a fundamental technique for writing code that is testable, maintainable, and flexible — and it applies equally to a 50-line script and a 500,000-line distributed system.

The core idea is devastatingly simple: **a component should not create its own dependencies; it should receive them from the outside.** That is it. Everything else — IoC containers, service registries, lifecycle management — is tooling built on top of this single principle.

## The Problem DI Solves

Consider a user registration service:

```typescript
// WITHOUT DI — tightly coupled, untestable
class UserService {
  async register(email: string, password: string): Promise<User> {
    const db = new PostgresDatabase('postgresql://localhost:5432/app'); // hardcoded
    const hasher = new BcryptHasher(); // hardcoded
    const mailer = new SendGridMailer('sg-api-key'); // hardcoded

    const existing = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.length > 0) throw new DuplicateEmailError(email);

    const hash = await hasher.hash(password);
    const user = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
      [email, hash],
    );

    await mailer.send(email, 'Welcome!', 'Thanks for signing up.');
    return user;
  }
}
```

This code has five serious problems:

1. **Untestable** — You cannot test `register()` without a real Postgres database, bcrypt (which is intentionally slow), and a real SendGrid connection.
2. **Inflexible** — Switching from Postgres to MySQL, or from SendGrid to SES, requires modifying this class.
3. **Hidden dependencies** — Reading the class signature tells you nothing about what it needs. The dependencies are discovered only by reading the implementation.
4. **No lifecycle control** — Each call creates new database connections instead of using a pool.
5. **Environment coupling** — Connection strings and API keys are embedded in application code.

## The DI Solution

```typescript
// WITH DI — dependencies are received, not created
class UserService {
  constructor(
    private userRepo: UserRepository,    // interface, not concrete class
    private hasher: PasswordHasher,       // interface, not concrete class
    private mailer: EmailService,         // interface, not concrete class
  ) {}

  async register(email: string, password: string): Promise<User> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) throw new DuplicateEmailError(email);

    const hash = await this.hasher.hash(password);
    const user = await this.userRepo.create({ email, passwordHash: hash });

    await this.mailer.sendWelcome(user);
    return user;
  }
}
```

Now:
- **Testable** — Pass mock implementations in tests.
- **Flexible** — Swap Postgres for MongoDB by providing a different `UserRepository`.
- **Explicit** — The constructor signature declares exactly what this class needs.
- **Lifecycle-controlled** — The caller manages connection pools and shared instances.
- **Environment-decoupled** — Configuration lives in the composition root, not in business logic.

## Three Forms of Injection

### Constructor Injection (Preferred)

Dependencies are provided through the constructor. This is the recommended form because it makes dependencies explicit, enforces that the object is fully initialized before use, and enables immutability.

```typescript
class OrderProcessor {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly paymentGateway: PaymentGateway,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
  ) {}

  async process(orderId: string): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new OrderNotFoundError(orderId);

    const payment = await this.paymentGateway.charge(order.total, order.paymentMethod);
    order.markPaid(payment.transactionId);
    await this.orderRepo.save(order);

    this.eventBus.publish({ type: 'OrderProcessed', orderId, transactionId: payment.transactionId });
    this.logger.info('Order processed', { orderId });
  }
}
```

### Property Injection (Use Sparingly)

Dependencies are set through public properties after construction. This is useful when the dependency is optional or has a sensible default, but it introduces the risk of using the object before it is fully configured.

```typescript
class ReportGenerator {
  // Optional dependency with default
  formatter: ReportFormatter = new DefaultFormatter();
  cache?: ReportCache;

  async generate(query: ReportQuery): Promise<Report> {
    if (this.cache) {
      const cached = await this.cache.get(query.cacheKey);
      if (cached) return cached;
    }

    const data = await this.fetchData(query);
    const report = this.formatter.format(data);

    if (this.cache) {
      await this.cache.set(query.cacheKey, report);
    }

    return report;
  }
}
```

### Method Injection (Contextual)

Dependencies are passed to the method that needs them. This is appropriate when the dependency varies per call rather than per instance.

```typescript
class AuditService {
  async log(
    action: AuditAction,
    context: RequestContext, // varies per request
  ): Promise<void> {
    await this.store.append({
      action,
      userId: context.user.id,
      ip: context.ip,
      timestamp: new Date(),
    });
  }
}
```

### When to Use Which

| Form | Use When | Avoid When |
|---|---|---|
| **Constructor** | Dependency is required, does not change | Too many parameters (> 5 = design smell) |
| **Property** | Dependency is optional or has default | Dependency is required for correctness |
| **Method** | Dependency varies per call | Dependency is the same for every call |

::: tip Constructor Injection Is Almost Always Right
In 95% of cases, constructor injection is the correct choice. If you find yourself reaching for property or method injection, ask whether the dependency is truly optional or contextual, or whether you are just avoiding a constructor parameter.
:::

## IoC Containers

An Inversion of Control (IoC) container is a framework that automates dependency wiring. Instead of manually constructing the entire object graph, you register components and their dependencies, and the container resolves the graph automatically.

### InversifyJS (TypeScript)

```typescript
import { Container, injectable, inject } from 'inversify';

const TYPES = {
  UserRepository: Symbol.for('UserRepository'),
  PasswordHasher: Symbol.for('PasswordHasher'),
  EmailService: Symbol.for('EmailService'),
  UserService: Symbol.for('UserService'),
};

@injectable()
class PostgresUserRepository implements UserRepository {
  constructor(@inject('DatabasePool') private pool: Pool) {}

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email],
    );
    return result.rows[0] ?? null;
  }

  async create(data: CreateUserData): Promise<User> {
    const result = await this.pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
      [data.email, data.passwordHash],
    );
    return result.rows[0];
  }
}

@injectable()
class UserServiceImpl {
  constructor(
    @inject(TYPES.UserRepository) private userRepo: UserRepository,
    @inject(TYPES.PasswordHasher) private hasher: PasswordHasher,
    @inject(TYPES.EmailService) private mailer: EmailService,
  ) {}
  // ...same implementation as before
}

// Composition root — the ONE place where concrete types are wired together
const container = new Container();
container.bind<UserRepository>(TYPES.UserRepository).to(PostgresUserRepository).inSingletonScope();
container.bind<PasswordHasher>(TYPES.PasswordHasher).to(BcryptHasher).inSingletonScope();
container.bind<EmailService>(TYPES.EmailService).to(SendGridMailer).inSingletonScope();
container.bind(TYPES.UserService).to(UserServiceImpl).inRequestScope();

// Resolution
const userService = container.get<UserServiceImpl>(TYPES.UserService);
```

### Google Wire (Go)

Go takes a different approach to DI. Because Go does not have decorators or runtime reflection (by convention), DI containers in Go use compile-time code generation. Google Wire is the standard tool.

```go
// providers.go — declare how to construct each dependency
func NewPostgresUserRepo(pool *pgxpool.Pool) *PostgresUserRepo {
    return &PostgresUserRepo{pool: pool}
}

func NewBcryptHasher() *BcryptHasher {
    return &BcryptHasher{cost: 12}
}

func NewUserService(
    repo UserRepository,
    hasher PasswordHasher,
    mailer EmailService,
) *UserService {
    return &UserService{repo: repo, hasher: hasher, mailer: mailer}
}

// wire.go — wire set declaration (code generation input)
//+build wireinject

func InitializeUserService(cfg *Config) (*UserService, error) {
    wire.Build(
        NewDatabasePool,
        NewPostgresUserRepo,
        wire.Bind(new(UserRepository), new(*PostgresUserRepo)),
        NewBcryptHasher,
        wire.Bind(new(PasswordHasher), new(*BcryptHasher)),
        NewSESMailer,
        wire.Bind(new(EmailService), new(*SESMailer)),
        NewUserService,
    )
    return nil, nil // wire generates the actual implementation
}
```

### Spring (Java)

```java
@Service
public class UserService {
    private final UserRepository userRepo;
    private final PasswordHasher hasher;
    private final EmailService mailer;

    // Spring automatically injects dependencies via constructor
    public UserService(
        UserRepository userRepo,
        PasswordHasher hasher,
        EmailService mailer
    ) {
        this.userRepo = userRepo;
        this.hasher = hasher;
        this.mailer = mailer;
    }

    public User register(String email, String password) {
        if (userRepo.findByEmail(email).isPresent()) {
            throw new DuplicateEmailException(email);
        }
        String hash = hasher.hash(password);
        User user = userRepo.save(new User(email, hash));
        mailer.sendWelcome(user);
        return user;
    }
}

// Spring auto-discovers @Service, @Repository, @Component annotations
@Repository
public class JpaUserRepository implements UserRepository {
    // Spring provides EntityManager automatically
}
```

### Container Comparison

| Feature | InversifyJS | Google Wire | Spring |
|---|---|---|---|
| Language | TypeScript | Go | Java/Kotlin |
| Resolution | Runtime | Compile-time | Runtime |
| Configuration | Code (bind) | Code (wire sets) | Annotations + code |
| Scope management | Singleton, Request, Transient | Manual | Singleton, Prototype, Request, Session |
| Learning curve | Medium | Low | High |
| Error detection | Runtime | Compile-time | Mixed |
| Performance | Slight overhead | Zero overhead | Startup overhead |

## DI in Serverless

Serverless functions have unique DI challenges: they are short-lived, cold starts matter, and each invocation may or may not reuse the same execution environment.

```typescript
// Serverless DI strategy: module-scoped singletons with lazy init
let container: Container | null = null;

function getContainer(): Container {
  if (!container) {
    container = new Container();
    // Register expensive dependencies as singletons
    // They persist across warm invocations
    container.bind(TYPES.DatabasePool).toDynamicValue(() =>
      new Pool({ connectionString: process.env.DATABASE_URL })
    ).inSingletonScope();

    container.bind(TYPES.UserRepository).to(PostgresUserRepository).inSingletonScope();
    container.bind(TYPES.UserService).to(UserServiceImpl).inTransientScope();
  }
  return container;
}

// Lambda handler
export const handler: APIGatewayProxyHandler = async (event) => {
  const userService = getContainer().get<UserServiceImpl>(TYPES.UserService);
  const body = JSON.parse(event.body ?? '{}');
  const user = await userService.register(body.email, body.password);
  return { statusCode: 201, body: JSON.stringify(user) };
};
```

::: warning Cold Start Impact
In serverless, container initialization happens during cold starts. Keep your dependency graph lean — only register what the function actually needs. Do not register every service in the application. Consider separate containers for separate functions, or lazy registration that only resolves dependencies on first use.
:::

## DI in Microservices

In a [microservices](/architecture-patterns/microservices/) architecture, DI operates at two levels:

1. **Intra-service DI** — Standard constructor injection within each service, exactly as described above.
2. **Inter-service DI** — Service discovery and client injection. The service that calls another service receives a client interface, not a concrete HTTP client.

```typescript
// Inter-service dependency injection
interface InventoryClient {
  checkStock(sku: string): Promise<StockLevel>;
  reserveStock(sku: string, quantity: number): Promise<Reservation>;
}

// HTTP implementation for production
class HttpInventoryClient implements InventoryClient {
  constructor(
    private httpClient: HttpClient,
    private baseUrl: string,
  ) {}

  async checkStock(sku: string): Promise<StockLevel> {
    return this.httpClient.get(`${this.baseUrl}/inventory/${sku}/stock`);
  }

  async reserveStock(sku: string, quantity: number): Promise<Reservation> {
    return this.httpClient.post(`${this.baseUrl}/inventory/reserve`, { sku, quantity });
  }
}

// In-memory implementation for testing
class InMemoryInventoryClient implements InventoryClient {
  private stock = new Map<string, number>();

  seed(sku: string, quantity: number): void {
    this.stock.set(sku, quantity);
  }

  async checkStock(sku: string): Promise<StockLevel> {
    return { sku, available: this.stock.get(sku) ?? 0 };
  }

  async reserveStock(sku: string, quantity: number): Promise<Reservation> {
    const current = this.stock.get(sku) ?? 0;
    if (current < quantity) throw new InsufficientStockError(sku);
    this.stock.set(sku, current - quantity);
    return { id: crypto.randomUUID(), sku, quantity };
  }
}
```

## Testing Benefits

DI transforms testing from "set up the entire world" to "provide the exact dependencies this test needs."

```typescript
describe('UserService', () => {
  let userService: UserService;
  let mockRepo: jest.Mocked<UserRepository>;
  let mockHasher: jest.Mocked<PasswordHasher>;
  let mockMailer: jest.Mocked<EmailService>;

  beforeEach(() => {
    mockRepo = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };
    mockHasher = {
      hash: jest.fn().mockResolvedValue('hashed_password'),
      verify: jest.fn(),
    };
    mockMailer = {
      sendWelcome: jest.fn().mockResolvedValue(undefined),
    };

    // Pure constructor injection — no container needed for tests
    userService = new UserService(mockRepo, mockHasher, mockMailer);
  });

  it('registers a new user', async () => {
    mockRepo.findByEmail.mockResolvedValue(null);
    mockRepo.create.mockResolvedValue({ id: '1', email: 'a@b.com', passwordHash: 'hashed' });

    const user = await userService.register('a@b.com', 'password123');

    expect(mockRepo.findByEmail).toHaveBeenCalledWith('a@b.com');
    expect(mockHasher.hash).toHaveBeenCalledWith('password123');
    expect(mockRepo.create).toHaveBeenCalledWith({
      email: 'a@b.com',
      passwordHash: 'hashed_password',
    });
    expect(mockMailer.sendWelcome).toHaveBeenCalledWith(user);
  });

  it('rejects duplicate emails', async () => {
    mockRepo.findByEmail.mockResolvedValue({ id: '1', email: 'a@b.com' } as User);

    await expect(
      userService.register('a@b.com', 'password123'),
    ).rejects.toThrow(DuplicateEmailError);

    expect(mockHasher.hash).not.toHaveBeenCalled();
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});
```

::: tip The Composition Root
The composition root is the single place in your application where all concrete implementations are wired together. In an Express app, it is your `app.ts` or `main.ts`. In a Lambda, it is the module-level initialization. In Spring, it is the application context configuration. Everything outside the composition root should depend on interfaces, never on concrete implementations.
:::

## Common Anti-Patterns

### Service Locator (Anti-Pattern)

```typescript
// BAD: Service Locator — hides dependencies, hard to test
class OrderService {
  async placeOrder(order: Order): Promise<void> {
    const repo = ServiceLocator.resolve<OrderRepository>('OrderRepository');
    const payment = ServiceLocator.resolve<PaymentGateway>('PaymentGateway');
    // Dependencies are hidden — you only discover them by reading the code
  }
}

// GOOD: Constructor injection — dependencies are explicit
class OrderService {
  constructor(
    private repo: OrderRepository,
    private payment: PaymentGateway,
  ) {}
}
```

### Over-Injection

If a constructor has more than 5-6 dependencies, the class is doing too much. Split it into smaller, focused classes.

### Interface Explosion

Do not create an interface for every class. Create interfaces at **architectural boundaries** — where you need to swap implementations (database adapters, external services, strategies). Internal implementation classes that will never be swapped do not need interfaces.

## Further Reading

- [Creational Patterns](/architecture-patterns/design-patterns/creational-patterns) — DI as the modern replacement for Singleton and Factory
- [Hexagonal Architecture](/architecture-patterns/hexagonal/) — Ports and adapters depend fundamentally on DI
- [Clean Architecture](/architecture-patterns/clean-architecture/) — The Dependency Rule is enforced through DI
- [Repository Pattern](/architecture-patterns/design-patterns/repository-pattern) — Repositories are the canonical example of injected dependencies
- [Microservices](/architecture-patterns/microservices/) — Inter-service DI and service discovery