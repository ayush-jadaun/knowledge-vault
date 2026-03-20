---
title: "FP in TypeScript"
description: "Practical functional programming in TypeScript — fp-ts, Effect, purify-ts, pipe operator, branded types, and production patterns"
tags: [functional-programming, typescript, fp-ts, effect, practical-fp]
difficulty: intermediate
prerequisites: ["architecture-patterns/functional-programming/core-concepts"]
lastReviewed: "2026-03-20"
---

# FP in TypeScript

## Why FP in TypeScript?

TypeScript's type system is expressive enough to support FP patterns that were previously only practical in Haskell, Scala, or ML-family languages. With discriminated unions, generic type inference, and structural typing, you can build type-safe FP abstractions without sacrificing developer experience.

The ecosystem has matured significantly:

| Library | Philosophy | Size | Learning Curve |
|---------|-----------|------|---------------|
| **fp-ts** | Haskell-inspired, category theory | ~40 KB | Steep |
| **Effect** | ZIO-inspired, full runtime | ~200 KB | Moderate |
| **purify-ts** | Lightweight, practical | ~10 KB | Gentle |
| **neverthrow** | Result type only | ~3 KB | Minimal |
| **ts-pattern** | Pattern matching | ~5 KB | Minimal |
| **Vanilla TS** | No library, just patterns | 0 KB | Varies |

## The Pipe Operator

Since TypeScript does not have a native pipe operator (the TC39 proposal has stalled), every FP library provides its own. The pipe function is the backbone of FP TypeScript code:

```typescript
// fp-ts pipe
import { pipe } from 'fp-ts/function';

const result = pipe(
  ' Hello, World! ',
  s => s.trim(),
  s => s.toLowerCase(),
  s => s.replace(/\s+/g, '-'),
  s => `slug:${s}`,
);
// "slug:hello,-world!"

// The flow function creates a reusable pipeline
import { flow } from 'fp-ts/function';

const slugify = flow(
  (s: string) => s.trim(),
  s => s.toLowerCase(),
  s => s.replace(/[^\w\s-]/g, ''),
  s => s.replace(/\s+/g, '-'),
);

slugify(' Hello World! '); // "hello-world"
slugify('  FP in TypeScript  '); // "fp-in-typescript"
```

## fp-ts

fp-ts is the most comprehensive FP library for TypeScript, modeled after Haskell's type class hierarchy. It provides `Option`, `Either`, `Task`, `TaskEither`, `Reader`, and many more.

### Option (Maybe)

```typescript
import { pipe } from 'fp-ts/function';
import * as O from 'fp-ts/Option';

// Creating Options
const some = O.some(42);          // Option<number> containing 42
const none = O.none;               // Option<never> — empty
const fromNull = O.fromNullable(user?.name); // null → None, value → Some

// Chaining with pipe
interface Config {
  database?: {
    host?: string;
    port?: number;
  };
}

function getDatabasePort(config: Config): number {
  return pipe(
    O.fromNullable(config.database),
    O.flatMap(db => O.fromNullable(db.port)),
    O.getOrElse(() => 5432),
  );
}
```

### Either (Result)

```typescript
import * as E from 'fp-ts/Either';
import { pipe } from 'fp-ts/function';

type AppError =
  | { _tag: 'ValidationError'; message: string }
  | { _tag: 'NotFoundError'; resource: string; id: string }
  | { _tag: 'UnauthorizedError' };

function parsePositiveInt(input: string): E.Either<AppError, number> {
  const n = parseInt(input, 10);
  if (isNaN(n)) {
    return E.left({ _tag: 'ValidationError', message: `"${input}" is not a number` });
  }
  if (n <= 0) {
    return E.left({ _tag: 'ValidationError', message: `${n} is not positive` });
  }
  return E.right(n);
}

function findUser(id: number): E.Either<AppError, User> {
  const user = users.get(id);
  return user
    ? E.right(user)
    : E.left({ _tag: 'NotFoundError', resource: 'User', id: String(id) });
}

// Compose operations — short-circuits on first Left
const getUserProfile = (rawId: string): E.Either<AppError, UserProfile> =>
  pipe(
    parsePositiveInt(rawId),
    E.flatMap(findUser),
    E.map(user => ({
      id: user.id,
      name: user.name,
      memberSince: user.createdAt.toISOString(),
    })),
  );

// Pattern match the result
pipe(
  getUserProfile(req.params.id),
  E.match(
    error => {
      switch (error._tag) {
        case 'ValidationError': return res.status(400).json(error);
        case 'NotFoundError': return res.status(404).json(error);
        case 'UnauthorizedError': return res.status(401).json(error);
      }
    },
    profile => res.status(200).json(profile),
  ),
);
```

### TaskEither (Async Result)

`TaskEither` is the most commonly used fp-ts type in production code — it combines `Promise` (async) with `Either` (error handling):

```typescript
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { pipe } from 'fp-ts/function';

// Wrap async operations that can fail
function fetchUser(id: string): TE.TaskEither<AppError, User> {
  return TE.tryCatch(
    () => db.query('SELECT * FROM users WHERE id = $1', [id]),
    (reason) => ({ _tag: 'DatabaseError' as const, reason: String(reason) }),
  );
}

function chargePayment(userId: string, amount: number): TE.TaskEither<AppError, Payment> {
  return TE.tryCatch(
    () => stripe.charges.create({ amount, customer: userId }),
    (reason) => ({ _tag: 'PaymentError' as const, reason: String(reason) }),
  );
}

// Compose async operations — railway-oriented
const processOrder = (orderId: string): TE.TaskEither<AppError, OrderConfirmation> =>
  pipe(
    fetchOrder(orderId),
    TE.flatMap(order =>
      pipe(
        fetchUser(order.userId),
        TE.flatMap(user => chargePayment(user.stripeId, order.total)),
        TE.map(payment => ({
          orderId: order.id,
          paymentId: payment.id,
          status: 'confirmed' as const,
        })),
      ),
    ),
  );

// Execute
const result = await processOrder('ord_123')();
// result: Either<AppError, OrderConfirmation>
```

### Array Utilities

fp-ts provides functional array operations that return `Option` instead of throwing or returning `undefined`:

```typescript
import * as A from 'fp-ts/Array';
import * as NEA from 'fp-ts/NonEmptyArray';

// Safe head — returns Option, not T | undefined
pipe(
  [1, 2, 3],
  A.head,
); // O.some(1)

pipe(
  [] as number[],
  A.head,
); // O.none

// NonEmptyArray guarantees at least one element
function average(numbers: NEA.NonEmptyArray<number>): number {
  return pipe(
    numbers,
    NEA.reduce(0, (acc, n) => acc + n),
  ) / numbers.length;
}
```

## Effect (formerly ZIO for TypeScript)

Effect is a newer, more ambitious library that provides a complete effect system. Where fp-ts ports Haskell idioms, Effect builds a full runtime with dependency injection, concurrency, retry, scheduling, and observability built in.

### Core Types

```typescript
import { Effect, pipe } from 'effect';

// Effect<Success, Error, Requirements>
// Success = what it produces on success
// Error = what error types it can fail with
// Requirements = what services it needs (dependency injection)

const divide = (a: number, b: number): Effect.Effect<number, Error> =>
  b === 0
    ? Effect.fail(new Error('Division by zero'))
    : Effect.succeed(a / b);

// Run it
const result = Effect.runSync(divide(10, 2)); // 5
```

### Service Pattern (Dependency Injection)

```typescript
import { Effect, Context, Layer } from 'effect';

// Define a service interface
class UserRepo extends Context.Tag('UserRepo')<
  UserRepo,
  {
    findById: (id: string) => Effect.Effect<User, NotFoundError>;
    save: (user: User) => Effect.Effect<void, DatabaseError>;
  }
>() {}

class EmailService extends Context.Tag('EmailService')<
  EmailService,
  {
    send: (to: string, subject: string, body: string) => Effect.Effect<void, EmailError>;
  }
>() {}

// Use services in business logic
const registerUser = (input: RegisterInput) =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepo;
    const emailService = yield* EmailService;

    const user = User.create(input);
    yield* userRepo.save(user);
    yield* emailService.send(user.email, 'Welcome!', 'Thanks for joining.');

    return user;
  });

// Provide implementations via Layers
const PostgresUserRepoLive = Layer.succeed(UserRepo, {
  findById: (id) => Effect.tryPromise(() => db.query('SELECT * FROM users WHERE id = $1', [id])),
  save: (user) => Effect.tryPromise(() => db.query('INSERT INTO users ...', [user])),
});

const SesEmailServiceLive = Layer.succeed(EmailService, {
  send: (to, subject, body) => Effect.tryPromise(() => ses.sendEmail({ to, subject, body })),
});

// Wire everything together
const MainLive = Layer.merge(PostgresUserRepoLive, SesEmailServiceLive);

// Run with all dependencies provided
Effect.runPromise(
  registerUser({ email: 'alice@example.com', name: 'Alice' }).pipe(
    Effect.provide(MainLive),
  ),
);
```

### Effect Generators

Effect's generator syntax (`Effect.gen`) reads like imperative code while maintaining full type safety:

```typescript
const checkout = (orderId: string) =>
  Effect.gen(function* () {
    const orderRepo = yield* OrderRepo;
    const payments = yield* PaymentService;
    const events = yield* EventBus;

    const order = yield* orderRepo.findById(orderId);

    if (order.total <= 0) {
      return yield* Effect.fail(new InvalidOrderError('Total must be positive'));
    }

    const charge = yield* payments.charge(order.customerId, order.total);

    order.markPaid(charge.id);
    yield* orderRepo.save(order);
    yield* events.publish(new OrderPaidEvent(order.id, charge.id));

    return { orderId: order.id, chargeId: charge.id };
  });
```

## purify-ts

purify-ts is a lightweight alternative for teams that want FP types without the category theory overhead:

```typescript
import { Maybe, Just, Nothing } from 'purify-ts/Maybe';
import { EitherAsync } from 'purify-ts/EitherAsync';

// Maybe
const name = Maybe.fromNullable(user?.profile?.name)
  .map(n => n.trim())
  .filter(n => n.length > 0)
  .orDefault('Anonymous');

// EitherAsync for async error handling
const createOrder = EitherAsync(async ({ liftEither, throwE }) => {
  const user = await fetchUser(userId).run();
  if (user.isLeft()) throwE(user.extract());

  const validOrder = liftEither(validateOrder(input));
  const saved = await saveOrder(validOrder).run();

  return saved;
});
```

## Branded Types

Branded types (also called opaque types or newtypes) prevent mixing up values that share the same underlying type. They are a lightweight way to bring type safety to domain concepts.

```typescript
// Declare branded types
declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B };
type Branded<T, B> = T & Brand<B>;

// Domain types that are all strings, but cannot be mixed up
type UserId = Branded<string, 'UserId'>;
type OrderId = Branded<string, 'OrderId'>;
type Email = Branded<string, 'Email'>;

// Smart constructors that validate
function UserId(value: string): UserId {
  if (!value.startsWith('usr_')) throw new Error('Invalid UserId format');
  return value as UserId;
}

function Email(value: string): Email {
  if (!value.includes('@')) throw new Error('Invalid email format');
  return value.toLowerCase() as Email;
}

// Type system prevents mixing IDs
function findUser(id: UserId): Promise<User> { /* ... */ }
function findOrder(id: OrderId): Promise<Order> { /* ... */ }

const userId = UserId('usr_123');
const orderId = OrderId('ord_456');

findUser(userId);    // OK
findUser(orderId);   // Compile error! OrderId is not UserId
```

### With Effect Schema

```typescript
import { Schema } from 'effect';

const UserId = Schema.String.pipe(
  Schema.brand('UserId'),
  Schema.filter(s => s.startsWith('usr_'), {
    message: () => 'Must start with usr_',
  }),
);
type UserId = Schema.Schema.Type<typeof UserId>;

const Email = Schema.String.pipe(
  Schema.brand('Email'),
  Schema.filter(s => /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(s)),
  Schema.transform(Schema.String, { decode: s => s.toLowerCase(), encode: s => s }),
);
```

## Practical Patterns

### Pattern 1: Validation Accumulation

Collect all validation errors instead of stopping at the first:

```typescript
import * as E from 'fp-ts/Either';
import * as A from 'fp-ts/Apply';
import { pipe } from 'fp-ts/function';
import * as NEA from 'fp-ts/NonEmptyArray';

type ValidationErrors = NEA.NonEmptyArray<string>;
type Validated<T> = E.Either<ValidationErrors, T>;

const validateName = (name: string): Validated<string> =>
  name.length >= 2
    ? E.right(name)
    : E.left(NEA.of('Name must be at least 2 characters'));

const validateEmail = (email: string): Validated<string> =>
  email.includes('@')
    ? E.right(email.toLowerCase())
    : E.left(NEA.of('Invalid email format'));

const validateAge = (age: number): Validated<number> =>
  age >= 18 && age <= 120
    ? E.right(age)
    : E.left(NEA.of('Age must be between 18 and 120'));

// Accumulate ALL errors using Apply
const validateUser = (input: { name: string; email: string; age: number }) =>
  pipe(
    E.Do,
    E.apS('name', validateName(input.name)),
    E.apS('email', validateEmail(input.email)),
    E.apS('age', validateAge(input.age)),
  );

// Returns Left(["Name must be at least 2 characters", "Invalid email format"])
// instead of stopping at first error
```

### Pattern 2: Exhaustive Pattern Matching

```typescript
import { match, P } from 'ts-pattern';

type ApiResponse =
  | { status: 'success'; data: User }
  | { status: 'not_found'; id: string }
  | { status: 'unauthorized'; reason: string }
  | { status: 'rate_limited'; retryAfter: number };

const handleResponse = (response: ApiResponse) =>
  match(response)
    .with({ status: 'success' }, ({ data }) => renderUser(data))
    .with({ status: 'not_found' }, ({ id }) => render404(id))
    .with({ status: 'unauthorized' }, ({ reason }) => redirectToLogin(reason))
    .with({ status: 'rate_limited' }, ({ retryAfter }) => showRetryMessage(retryAfter))
    .exhaustive(); // Compile error if a case is missed!
```

### Pattern 3: Functional Core, Imperative Shell

```typescript
// === FUNCTIONAL CORE (pure, no I/O) ===

function calculateDiscount(order: Order, promos: Promotion[]): DiscountResult {
  const applicable = promos
    .filter(p => p.isActive && p.appliesTo(order))
    .sort((a, b) => b.value - a.value);

  if (applicable.length === 0) return { discount: 0, applied: [] };

  const best = applicable[0];
  return {
    discount: best.calculate(order.subtotal),
    applied: [best.code],
  };
}

// === IMPERATIVE SHELL (handles I/O, calls the pure core) ===

async function handleCheckout(req: Request, res: Response) {
  // I/O: read from database
  const order = await orderRepo.findById(req.params.id);
  const promos = await promoRepo.findActive();

  // Pure: calculate discount (no I/O, no side effects)
  const discountResult = calculateDiscount(order, promos);

  // I/O: apply result and persist
  order.applyDiscount(discountResult);
  await orderRepo.save(order);
  await eventBus.publish(new OrderDiscountApplied(order.id, discountResult));

  res.json(order.toResponse());
}
```

## Decision Matrix

| Need | Solution | Library |
|------|----------|---------|
| Just `Result<T, E>` | neverthrow or hand-rolled | neverthrow |
| Option + Either + pipe | fp-ts core | fp-ts |
| Full effect system with DI | Effect | effect |
| Lightweight FP types | purify-ts | purify-ts |
| Pattern matching | ts-pattern | ts-pattern |
| Branded/opaque types | Hand-rolled or Effect Schema | - |

## Further Reading

- [FP Core Concepts](./core-concepts) — fundamentals that these libraries build on
- [Monads & Functors](./monads-functors) — theory behind Option, Either, and railway-oriented programming
- [Functional Programming Overview](./) — paradigm foundations, FP vs OOP
- [Clean Architecture](/architecture-patterns/clean-architecture/) — functional core, imperative shell maps to the Dependency Rule
- [SOLID Principles](/architecture-patterns/solid-principles/) — DIP and OCP expressed through FP abstractions
