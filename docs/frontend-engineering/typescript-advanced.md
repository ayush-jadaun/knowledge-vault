---
title: "TypeScript Advanced Patterns"
description: "Advanced TypeScript — generics, conditional types, mapped types, template literals, branded types, type-level programming, and production patterns"
tags: [typescript, advanced, generics, conditional-types, mapped-types, branded-types]
difficulty: advanced
prerequisites: [typescript-basics]
lastReviewed: "2026-04-05"
---

# TypeScript Advanced Patterns

TypeScript's type system is Turing-complete. That means you can encode arbitrary computations at the type level — recursive string parsers, state machine validators, and compile-time arithmetic. Most developers never need to go that far, but understanding the building blocks that enable it — generic constraints, conditional types, mapped types, template literals, and variance — transforms the way you design APIs, catch bugs, and express invariants.

This page covers every major advanced TypeScript pattern with production-grade examples. We start from generic constraints and conditional types, build through mapped and template literal types, then climb into branded types, builder patterns, and type-level programming. Every section includes code you can paste into your editor and immediately verify.

**Related**: [TypeScript Cheat Sheet](/cheat-sheets/typescript) | [React Internals](/frontend-engineering/react-internals) | [State Management](/frontend-engineering/state-management)

---

## Generic Constraints and Conditional Types

### Generic Constraints

Generics become powerful when you constrain them. A constraint tells TypeScript "this type parameter must satisfy a shape":

```typescript
// Without constraint: T could be anything
function broken<T>(value: T): T {
  // value.length — Error: Property 'length' does not exist on type 'T'
  return value;
}

// With constraint: T must have a length property
function withLength<T extends { length: number }>(value: T): T {
  console.log(value.length); // OK — T is guaranteed to have length
  return value;
}

withLength("hello");        // string has length
withLength([1, 2, 3]);      // array has length
withLength({ length: 10 }); // object literal satisfies constraint
// withLength(42);           // Error: number does not have length
```

Multiple constraints use intersection:

```typescript
interface HasId { id: string }
interface HasTimestamp { createdAt: Date }

// T must have both id AND createdAt
function auditLog<T extends HasId & HasTimestamp>(entity: T): void {
  console.log(`Entity ${entity.id} created at ${entity.createdAt}`);
}
```

The `keyof` constraint is one of the most useful:

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: "Alice", age: 30, role: "admin" as const };
const name = getProperty(user, "name");  // type: string
const age = getProperty(user, "age");    // type: number
// getProperty(user, "email");           // Error: "email" is not in keyof user
```

### Conditional Types

Conditional types follow the form `T extends U ? X : Y` — if `T` is assignable to `U`, the type resolves to `X`, otherwise `Y`:

```typescript
type IsString<T> = T extends string ? true : false;

type A = IsString<"hello">;  // true
type B = IsString<42>;       // false
type C = IsString<string>;   // true
```

### The `infer` Keyword

`infer` declares a type variable inside a conditional type that TypeScript infers from the structure:

```typescript
// Extract the return type of a function
type MyReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

type A = MyReturnType<() => string>;           // string
type B = MyReturnType<(x: number) => boolean>; // boolean

// Extract the element type of an array
type ElementOf<T> = T extends (infer E)[] ? E : never;

type C = ElementOf<string[]>;    // string
type D = ElementOf<number[]>;    // number
type E = ElementOf<string>;      // never (not an array)

// Extract the resolved type of a Promise
type UnwrapPromise<T> = T extends Promise<infer V> ? V : T;

type F = UnwrapPromise<Promise<string>>;  // string
type G = UnwrapPromise<number>;           // number (not a promise, returned as-is)

// Extract function parameters
type FirstParam<T> = T extends (first: infer P, ...rest: any[]) => any ? P : never;

type H = FirstParam<(name: string, age: number) => void>; // string
```

### Distributive Conditional Types

When a conditional type acts on a **naked type parameter** (not wrapped in anything), it distributes over union members:

```typescript
type ToArray<T> = T extends any ? T[] : never;

// Distributes: string[] | number[] (NOT (string | number)[])
type A = ToArray<string | number>;

// To prevent distribution, wrap both sides in a tuple:
type ToArrayNonDist<T> = [T] extends [any] ? T[] : never;

// Does NOT distribute: (string | number)[]
type B = ToArrayNonDist<string | number>;
```

This is how `Exclude` and `Extract` work internally:

```typescript
// Built-in Exclude: remove members from union
type Exclude<T, U> = T extends U ? never : T;

type OnlyNumbers = Exclude<string | number | boolean, string | boolean>;
// Distributes: (string extends string | boolean ? never : string)
//            | (number extends string | boolean ? never : number)
//            | (boolean extends string | boolean ? never : boolean)
// = never | number | never = number
```

---

## Mapped Types

Mapped types iterate over the keys of a type and produce a new type:

```typescript
// The basic syntax
type Mapped<T> = {
  [K in keyof T]: T[K];  // identity — copies the type
};
```

### Built-in Mapped Types

```typescript
// Partial — all properties become optional
type Partial<T> = { [K in keyof T]?: T[K] };

// Required — all properties become required
type Required<T> = { [K in keyof T]-?: T[K] };

// Readonly — all properties become readonly
type Readonly<T> = { readonly [K in keyof T]: T[K] };

// Record — create an object type from keys and value types
type Record<K extends keyof any, V> = { [P in K]: V };
```

### Pick and Omit

```typescript
// Pick — select specific properties
type Pick<T, K extends keyof T> = { [P in K]: T[P] };

// Omit — remove specific properties (Pick + Exclude)
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;

interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: "admin" | "user";
}

type PublicUser = Omit<User, "password">;
// { id: number; name: string; email: string; role: "admin" | "user" }

type UserCredentials = Pick<User, "email" | "password">;
// { email: string; password: string }
```

### Custom Mapped Types

```typescript
// Make all properties nullable
type Nullable<T> = { [K in keyof T]: T[K] | null };

// Make all properties return Promises
type Async<T> = { [K in keyof T]: Promise<T[K]> };

// Make all function properties return void
type Muted<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? (...args: A) => void
    : T[K];
};

// Deep Partial — recursively make all properties optional
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

interface Config {
  db: {
    host: string;
    port: number;
    credentials: {
      user: string;
      password: string;
    };
  };
  cache: {
    ttl: number;
    maxSize: number;
  };
}

// Every nested property is optional
type PartialConfig = DeepPartial<Config>;
```

### Key Remapping with `as`

TypeScript 4.1 added key remapping in mapped types:

```typescript
// Prefix all keys with "get"
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

interface Person {
  name: string;
  age: number;
}

type PersonGetters = Getters<Person>;
// { getName: () => string; getAge: () => number }

// Filter keys by value type
type OnlyStrings<T> = {
  [K in keyof T as T[K] extends string ? K : never]: T[K];
};

type StringProps = OnlyStrings<{ name: string; age: number; email: string }>;
// { name: string; email: string }

// Remove specific keys
type RemoveReadonly<T> = {
  [K in keyof T as K extends `readonly${string}` ? never : K]: T[K];
};
```

---

## Template Literal Types

Template literal types combine string literal types with template syntax:

```typescript
type Greeting = `Hello, ${string}`;

const a: Greeting = "Hello, Alice";  // OK
const b: Greeting = "Hello, Bob";    // OK
// const c: Greeting = "Hi, Alice";  // Error: does not match pattern
```

### Route Patterns

```typescript
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type ApiVersion = "v1" | "v2";

type ApiRoute = `/${ApiVersion}/${string}`;

const route: ApiRoute = "/v1/users";       // OK
// const bad: ApiRoute = "/v3/users";       // Error: v3 not in ApiVersion

// Dynamic route parameters
type Route =
  | "/users"
  | "/users/:id"
  | "/users/:id/posts"
  | "/users/:id/posts/:postId";

// Extract params from route strings
type ExtractParams<T extends string> =
  T extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractParams<`/${Rest}`>
    : T extends `${string}:${infer Param}`
      ? Param
      : never;

type UserPostParams = ExtractParams<"/users/:id/posts/:postId">;
// "id" | "postId"
```

### Event Names

```typescript
type EventName<T extends string> = `${T}Changed` | `${T}Clicked` | `${T}Loaded`;

type ButtonEvents = EventName<"button">;
// "buttonChanged" | "buttonClicked" | "buttonLoaded"

// Type-safe event emitter
type EventMap = {
  userCreated: { id: string; name: string };
  userDeleted: { id: string };
  orderPlaced: { orderId: string; total: number };
};

type EventCallback<T extends keyof EventMap> = (payload: EventMap[T]) => void;

function on<T extends keyof EventMap>(event: T, callback: EventCallback<T>): void {
  // register callback
}

on("userCreated", (payload) => {
  // payload is typed as { id: string; name: string }
  console.log(payload.name);
});

on("orderPlaced", (payload) => {
  // payload is typed as { orderId: string; total: number }
  console.log(payload.total);
});
```

### CSS Type Safety

```typescript
type CSSUnit = "px" | "rem" | "em" | "vh" | "vw" | "%";
type CSSValue = `${number}${CSSUnit}`;

function setWidth(value: CSSValue): void {
  // ...
}

setWidth("100px");   // OK
setWidth("2.5rem");  // OK
// setWidth("100");  // Error: missing unit
// setWidth("big");  // Error: not a number + unit

// CSS color
type HexColor = `#${string}`;
type RGBColor = `rgb(${number}, ${number}, ${number})`;
type CSSColor = HexColor | RGBColor | "transparent" | "inherit";

// Tailwind-style class names
type Spacing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
type Direction = "t" | "r" | "b" | "l" | "x" | "y";
type SpacingClass = `p${Direction}-${Spacing}` | `m${Direction}-${Spacing}`;

const cls: SpacingClass = "px-4";  // OK
// const bad: SpacingClass = "px-7"; // Error: 7 not in Spacing
```

### Built-in String Manipulation Types

```typescript
type A = Uppercase<"hello">;     // "HELLO"
type B = Lowercase<"HELLO">;     // "hello"
type C = Capitalize<"hello">;    // "Hello"
type D = Uncapitalize<"Hello">;  // "hello"

// Combine with mapped types for API transformations
type CamelToSnake<S extends string> =
  S extends `${infer Head}${infer Tail}`
    ? Head extends Uppercase<Head>
      ? `_${Lowercase<Head>}${CamelToSnake<Tail>}`
      : `${Head}${CamelToSnake<Tail>}`
    : S;

type Snake = CamelToSnake<"userName">;     // "user_name"
type Snake2 = CamelToSnake<"createdAt">;   // "created_at"
```

---

## Type Guards and Narrowing

### The `is` Type Predicate

A type predicate tells TypeScript that when the function returns `true`, the argument has a specific type:

```typescript
interface Fish { swim(): void }
interface Bird { fly(): void }

// Type predicate: "pet is Fish"
function isFish(pet: Fish | Bird): pet is Fish {
  return (pet as Fish).swim !== undefined;
}

function move(pet: Fish | Bird) {
  if (isFish(pet)) {
    pet.swim();  // TypeScript knows pet is Fish here
  } else {
    pet.fly();   // TypeScript knows pet is Bird here
  }
}
```

Custom type guards for real-world use:

```typescript
// Guard for non-null values (filters arrays)
function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

const items = [1, null, 2, undefined, 3];
const defined = items.filter(isDefined); // type: number[]

// Guard for error responses
interface ApiError { error: string; code: number }
interface ApiSuccess<T> { data: T }
type ApiResponse<T> = ApiError | ApiSuccess<T>;

function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return "error" in response;
}

function handleResponse<T>(response: ApiResponse<T>): T {
  if (isApiError(response)) {
    throw new Error(`API Error ${response.code}: ${response.error}`);
  }
  return response.data; // narrowed to ApiSuccess<T>
}
```

### The `asserts` Keyword

Assertion functions throw if the condition is not met, and TypeScript narrows after the call:

```typescript
function assertIsString(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`Expected string, got ${typeof value}`);
  }
}

function processInput(input: unknown) {
  assertIsString(input);
  // After assertion, TypeScript knows input is string
  console.log(input.toUpperCase());
}

// Assert non-null
function assertDefined<T>(value: T | null | undefined, name: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${name} must be defined`);
  }
}

function getUser(id: string) {
  const user = db.findUser(id); // User | null
  assertDefined(user, "User");
  // user is now User (not User | null)
  return user.name;
}
```

### Discriminated Unions

Discriminated unions use a common literal property (the "discriminant") to narrow:

```typescript
// The discriminant is the "type" field
type Shape =
  | { type: "circle"; radius: number }
  | { type: "rectangle"; width: number; height: number }
  | { type: "triangle"; base: number; height: number };

function area(shape: Shape): number {
  switch (shape.type) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "rectangle":
      return shape.width * shape.height;
    case "triangle":
      return (shape.base * shape.height) / 2;
  }
}

// More complex: API events
type WebSocketEvent =
  | { kind: "connected"; sessionId: string }
  | { kind: "message"; data: string; timestamp: number }
  | { kind: "error"; error: Error; retryable: boolean }
  | { kind: "disconnected"; code: number; reason: string };

function handleEvent(event: WebSocketEvent): void {
  switch (event.kind) {
    case "connected":
      console.log(`Session: ${event.sessionId}`);
      break;
    case "message":
      console.log(`Data at ${event.timestamp}: ${event.data}`);
      break;
    case "error":
      if (event.retryable) reconnect();
      break;
    case "disconnected":
      console.log(`Closed: ${event.code} ${event.reason}`);
      break;
  }
}
```

### Exhaustive Checking with `never`

The `never` type ensures you handle every variant. If you miss a case, TypeScript errors at compile time:

```typescript
function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

function area(shape: Shape): number {
  switch (shape.type) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "rectangle":
      return shape.width * shape.height;
    case "triangle":
      return (shape.base * shape.height) / 2;
    default:
      // If you add a new Shape variant and forget to handle it,
      // TypeScript errors here because the new variant is not never
      return assertNever(shape);
  }
}
```

::: warning Exhaustive Checks Catch Bugs at Compile Time
If someone adds `{ type: "polygon"; sides: number; sideLength: number }` to the `Shape` union, every `switch` with an `assertNever` default immediately shows a compile error. Without it, the new variant silently falls through.
:::

---

## Utility Types Deep Dive

### `Parameters<T>` and `ReturnType<T>`

```typescript
function createUser(name: string, age: number, role: "admin" | "user") {
  return { id: crypto.randomUUID(), name, age, role };
}

type CreateUserParams = Parameters<typeof createUser>;
// [name: string, age: number, role: "admin" | "user"]

type CreateUserReturn = ReturnType<typeof createUser>;
// { id: string; name: string; age: number; role: "admin" | "user" }

// Use Parameters to create wrapper functions
function loggedCreateUser(...args: Parameters<typeof createUser>) {
  console.log("Creating user:", args);
  return createUser(...args);
}
```

### `Awaited<T>`

Recursively unwraps Promise types:

```typescript
type A = Awaited<Promise<string>>;                    // string
type B = Awaited<Promise<Promise<number>>>;            // number (recursively unwraps)
type C = Awaited<string | Promise<number>>;            // string | number

// Useful for typing async function results
async function fetchData() {
  const response = await fetch("/api/data");
  return response.json() as Promise<{ items: string[] }>;
}

type Data = Awaited<ReturnType<typeof fetchData>>;
// { items: string[] }
```

### `NoInfer<T>` (TypeScript 5.4+)

`NoInfer` prevents TypeScript from inferring a type parameter from a specific position. This is critical for API design:

```typescript
// Without NoInfer: TypeScript infers T from BOTH defaultValue and items
function getFirst<T>(items: T[], defaultValue: T): T {
  return items[0] ?? defaultValue;
}

// T is inferred as string | number (union of both arguments)
const result = getFirst(["a", "b"], 42); // No error — but wrong!

// With NoInfer: T is inferred ONLY from items
function getFirstFixed<T>(items: T[], defaultValue: NoInfer<T>): T {
  return items[0] ?? defaultValue;
}

// Now TypeScript errors: 42 is not assignable to string
// const bad = getFirstFixed(["a", "b"], 42);

const good = getFirstFixed(["a", "b"], "default"); // OK
```

### `ConstructorParameters<T>` and `InstanceType<T>`

```typescript
class HttpClient {
  constructor(
    private baseUrl: string,
    private timeout: number = 5000,
    private headers: Record<string, string> = {}
  ) {}
}

type ClientParams = ConstructorParameters<typeof HttpClient>;
// [baseUrl: string, timeout?: number, headers?: Record<string, string>]

type ClientInstance = InstanceType<typeof HttpClient>;
// HttpClient

// Factory pattern
function createInstance<T extends new (...args: any[]) => any>(
  ctor: T,
  ...args: ConstructorParameters<T>
): InstanceType<T> {
  return new ctor(...args);
}

const client = createInstance(HttpClient, "https://api.example.com", 3000);
// type: HttpClient
```

---

## Variance: Covariance, Contravariance, `in` / `out`

Variance describes how subtype relationships between generic types relate to the subtype relationships of their type parameters.

### Covariance (output position — `out`)

If `Dog extends Animal`, then `Producer<Dog>` is a subtype of `Producer<Animal>`. The type parameter appears in output positions (return types):

```typescript
interface Animal { name: string }
interface Dog extends Animal { breed: string }

type Producer<out T> = () => T;

// Dog extends Animal, so Producer<Dog> extends Producer<Animal>
const produceDog: Producer<Dog> = () => ({ name: "Rex", breed: "Labrador" });
const produceAnimal: Producer<Animal> = produceDog; // OK — covariant
```

### Contravariance (input position — `in`)

If `Dog extends Animal`, then `Consumer<Animal>` is a subtype of `Consumer<Dog>`. The direction flips:

```typescript
type Consumer<in T> = (value: T) => void;

const consumeAnimal: Consumer<Animal> = (a) => console.log(a.name);
const consumeDog: Consumer<Dog> = consumeAnimal; // OK — contravariant
// consumeAnimal accepts any Animal, so it can accept a Dog
```

### Why This Matters

```typescript
// This is why function parameters are contravariant
type EventHandler<in T> = (event: T) => void;

interface BaseEvent { timestamp: number }
interface ClickEvent extends BaseEvent { x: number; y: number }

const handleBase: EventHandler<BaseEvent> = (e) => console.log(e.timestamp);
const handleClick: EventHandler<ClickEvent> = handleBase;
// OK: a handler that accepts any BaseEvent can handle ClickEvents too

// But NOT the other way:
// const handleBase2: EventHandler<BaseEvent> = handleClick;
// Error: handleClick expects x, y which a BaseEvent might not have
```

### Explicit Variance Annotations (TypeScript 4.7+)

The `in` and `out` modifiers let you declare variance explicitly, which improves type-checking performance and catches errors in interface declarations:

```typescript
// Covariant: T only appears in output positions
interface ReadonlyBox<out T> {
  get(): T;
  // set(value: T): void;  // Error: T in input position violates 'out'
}

// Contravariant: T only appears in input positions
interface WriteOnlyBox<in T> {
  set(value: T): void;
  // get(): T;  // Error: T in output position violates 'in'
}

// Invariant: T appears in both positions
interface MutableBox<in out T> {
  get(): T;
  set(value: T): void;
}
```

---

## Declaration Merging

TypeScript merges declarations with the same name in the same scope. This is powerful for augmenting third-party types.

### Interface Merging

```typescript
// Original library definition
interface Window {
  title: string;
}

// Your augmentation — merged with the original
interface Window {
  analytics: {
    track(event: string, data: Record<string, unknown>): void;
  };
}

// window now has both title and analytics
window.analytics.track("pageView", { path: "/home" });
```

### Module Augmentation

```typescript
// Augment Express's Request type
declare module "express" {
  interface Request {
    user?: {
      id: string;
      role: "admin" | "user";
    };
  }
}

// Now req.user is available in all Express route handlers
app.get("/profile", (req, res) => {
  if (req.user) {
    res.json({ id: req.user.id, role: req.user.role });
  }
});
```

### Namespace Merging

```typescript
// Merge a namespace with a class to add static utility methods
class Validator {
  validate(input: string): boolean {
    return input.length > 0;
  }
}

namespace Validator {
  export function isEmail(input: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
  }

  export function isUrl(input: string): boolean {
    try { new URL(input); return true; } catch { return false; }
  }
}

const v = new Validator();
v.validate("hello");           // instance method
Validator.isEmail("a@b.com");  // static-like method from namespace
```

### Global Augmentation

```typescript
// Add to global scope from a module
export {};

declare global {
  interface Array<T> {
    groupBy<K extends string>(fn: (item: T) => K): Record<K, T[]>;
  }

  var __APP_VERSION__: string;
}
```

---

## Branded and Nominal Types

TypeScript uses structural typing: if two types have the same shape, they are compatible. Branded types break this for type-safe domain modeling.

### The Problem

```typescript
// Both are strings — TypeScript cannot distinguish them
type UserId = string;
type OrderId = string;

function getOrder(orderId: OrderId): void { /* ... */ }

const userId: UserId = "user_123";
getOrder(userId); // No error! But this is a bug.
```

### The Solution: Branded Types

```typescript
// Use a unique symbol brand to make types nominally distinct
type Brand<T, B extends string> = T & { readonly __brand: B };

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;
type Email = Brand<string, "Email">;

// Constructor functions validate and brand
function UserId(id: string): UserId {
  if (!id.startsWith("user_")) throw new Error("Invalid UserId");
  return id as UserId;
}

function OrderId(id: string): OrderId {
  if (!id.startsWith("order_")) throw new Error("Invalid OrderId");
  return id as OrderId;
}

function Email(email: string): Email {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");
  return email as Email;
}

function getOrder(orderId: OrderId): void { /* ... */ }

const userId = UserId("user_123");
const orderId = OrderId("order_456");

getOrder(orderId);  // OK
// getOrder(userId); // Error: UserId is not assignable to OrderId
```

### Type-Safe Currencies

```typescript
type USD = Brand<number, "USD">;
type EUR = Brand<number, "EUR">;
type GBP = Brand<number, "GBP">;

function usd(amount: number): USD { return amount as USD; }
function eur(amount: number): EUR { return amount as EUR; }

function addUSD(a: USD, b: USD): USD {
  return ((a as number) + (b as number)) as USD;
}

const price = usd(9.99);
const tax = usd(0.80);
const total = addUSD(price, tax);    // OK

const euros = eur(9.99);
// addUSD(price, euros);             // Error: EUR not assignable to USD
```

### Type-Safe IDs with Generics

```typescript
// Generic branded ID — one pattern for all entity IDs
type EntityId<Entity extends string> = string & { readonly __entity: Entity };

type UserId = EntityId<"User">;
type PostId = EntityId<"Post">;
type CommentId = EntityId<"Comment">;

function createId<E extends string>(prefix: string): EntityId<E> {
  return `${prefix}_${crypto.randomUUID()}` as EntityId<E>;
}

const userId = createId<"User">("usr");
const postId = createId<"Post">("post");

function deletePost(id: PostId): void { /* ... */ }

deletePost(postId);    // OK
// deletePost(userId); // Error: EntityId<"User"> not assignable to EntityId<"Post">
```

---

## Builder Pattern with Types

The builder pattern can track which properties have been set at the type level, making `.build()` only callable when all required properties are provided:

```typescript
interface QueryConfig {
  table: string;
  select: string[];
  where?: string;
  orderBy?: string;
  limit?: number;
}

// Track which required fields have been set using a generic parameter
type RequiredFields = "table" | "select";

class QueryBuilder<Set extends string = never> {
  private config: Partial<QueryConfig> = {};

  table(name: string): QueryBuilder<Set | "table"> {
    this.config.table = name;
    return this as any;
  }

  select(...columns: string[]): QueryBuilder<Set | "select"> {
    this.config.select = columns;
    return this as any;
  }

  where(condition: string): QueryBuilder<Set> {
    this.config.where = condition;
    return this as any;
  }

  orderBy(column: string): QueryBuilder<Set> {
    this.config.orderBy = column;
    return this as any;
  }

  limit(n: number): QueryBuilder<Set> {
    this.config.limit = n;
    return this as any;
  }

  // build() is only available when ALL required fields are set
  build(this: QueryBuilder<RequiredFields>): QueryConfig {
    return this.config as QueryConfig;
  }
}

// Works: both table and select are provided
const query = new QueryBuilder()
  .table("users")
  .select("id", "name", "email")
  .where("active = true")
  .limit(10)
  .build(); // OK

// Fails: missing select()
// new QueryBuilder()
//   .table("users")
//   .build();
// Error: 'build' does not exist on QueryBuilder<"table">
```

### Fluent API with Chained Type Narrowing

```typescript
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface RequestConfig {
  url: string;
  method: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
}

class RequestBuilder<HasUrl extends boolean = false, HasMethod extends boolean = false> {
  private config: Partial<RequestConfig> = {};

  url(url: string): RequestBuilder<true, HasMethod> {
    this.config.url = url;
    return this as any;
  }

  method(method: HttpMethod): RequestBuilder<HasUrl, true> {
    this.config.method = method;
    return this as any;
  }

  body(body: unknown): this {
    this.config.body = body;
    return this;
  }

  header(key: string, value: string): this {
    this.config.headers = { ...this.config.headers, [key]: value };
    return this;
  }

  // Only callable when both url and method have been set
  send(this: RequestBuilder<true, true>): Promise<Response> {
    return fetch(this.config.url!, {
      method: this.config.method,
      body: this.config.body ? JSON.stringify(this.config.body) : undefined,
      headers: this.config.headers,
    });
  }
}

// Works
new RequestBuilder()
  .url("/api/users")
  .method("POST")
  .body({ name: "Alice" })
  .header("Content-Type", "application/json")
  .send();

// Error: send() not available without url and method
// new RequestBuilder().method("GET").send();
```

---

## Type-Level Programming

### Recursive Types

TypeScript supports recursive type definitions for deeply nested structures:

```typescript
// JSON type — recursively defined
type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

// Deep readonly — recursively freeze an entire object tree
type DeepReadonly<T> =
  T extends (infer E)[]
    ? ReadonlyArray<DeepReadonly<E>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

// Flatten nested arrays
type Flatten<T> = T extends Array<infer E> ? Flatten<E> : T;

type A = Flatten<number[][][]>;  // number
type B = Flatten<string[]>;      // string
type C = Flatten<number>;        // number
```

### Tuple Manipulation

```typescript
// Get the first element of a tuple
type Head<T extends any[]> = T extends [infer H, ...any[]] ? H : never;

// Get all elements except the first
type Tail<T extends any[]> = T extends [any, ...infer Rest] ? Rest : [];

// Get the last element
type Last<T extends any[]> = T extends [...any[], infer L] ? L : never;

// Prepend to a tuple
type Prepend<E, T extends any[]> = [E, ...T];

// Append to a tuple
type Append<T extends any[], E> = [...T, E];

// Reverse a tuple
type Reverse<T extends any[]> =
  T extends [infer H, ...infer Rest]
    ? [...Reverse<Rest>, H]
    : [];

type A = Head<[1, 2, 3]>;     // 1
type B = Tail<[1, 2, 3]>;     // [2, 3]
type C = Last<[1, 2, 3]>;     // 3
type D = Reverse<[1, 2, 3]>;  // [3, 2, 1]

// Length of a tuple
type Length<T extends any[]> = T["length"];

type E = Length<[string, number, boolean]>; // 3
```

### String Parsing at the Type Level

```typescript
// Split a string by a delimiter
type Split<S extends string, D extends string> =
  S extends `${infer Head}${D}${infer Tail}`
    ? [Head, ...Split<Tail, D>]
    : [S];

type Parts = Split<"a.b.c.d", ".">;  // ["a", "b", "c", "d"]

// Join a tuple into a string
type Join<T extends string[], D extends string> =
  T extends [infer H extends string]
    ? H
    : T extends [infer H extends string, ...infer Rest extends string[]]
      ? `${H}${D}${Join<Rest, D>}`
      : "";

type Joined = Join<["a", "b", "c"], "-">;  // "a-b-c"

// Type-safe dot-notation path access
type PathValue<T, P extends string> =
  P extends `${infer Key}.${infer Rest}`
    ? Key extends keyof T
      ? PathValue<T[Key], Rest>
      : never
    : P extends keyof T
      ? T[P]
      : never;

interface Config {
  db: {
    host: string;
    port: number;
    credentials: { user: string; password: string };
  };
  cache: { ttl: number };
}

type DbHost = PathValue<Config, "db.host">;              // string
type DbUser = PathValue<Config, "db.credentials.user">;   // string
type CacheTtl = PathValue<Config, "cache.ttl">;           // number
// type Bad = PathValue<Config, "db.missing">;             // never

// Type-safe get function
function get<T, P extends string>(obj: T, path: P): PathValue<T, P> {
  return path.split(".").reduce((acc: any, key) => acc?.[key], obj) as any;
}

const config: Config = {
  db: { host: "localhost", port: 5432, credentials: { user: "admin", password: "secret" } },
  cache: { ttl: 3600 },
};

const host = get(config, "db.host");              // type: string, value: "localhost"
const user = get(config, "db.credentials.user");  // type: string, value: "admin"
```

---

## `const` Assertions and `satisfies`

### `const` Assertions

`as const` makes TypeScript infer the narrowest possible type:

```typescript
// Without as const
const routes = {
  home: "/",
  users: "/users",
  settings: "/settings",
};
// type: { home: string; users: string; settings: string }

// With as const
const routes2 = {
  home: "/",
  users: "/users",
  settings: "/settings",
} as const;
// type: { readonly home: "/"; readonly users: "/users"; readonly settings: "/settings" }

// Array as const
const colors = ["red", "green", "blue"] as const;
// type: readonly ["red", "green", "blue"]

type Color = (typeof colors)[number]; // "red" | "green" | "blue"
```

### `satisfies` Operator (TypeScript 4.9+)

`satisfies` validates that an expression matches a type without widening it:

```typescript
type Route = { path: string; method: "GET" | "POST" };

// Problem with type annotation: loses literal types
const route1: Route = { path: "/users", method: "GET" };
// route1.method is "GET" | "POST" — widened

// Problem with as const: no type checking
const route2 = { path: "/users", method: "GET", typo: true } as const;
// No error on "typo" — no validation against Route

// satisfies: validates AND preserves literal types
const route3 = { path: "/users", method: "GET" } satisfies Route;
// route3.method is "GET" — narrow literal type
// And typos are caught:
// const bad = { path: "/users", methd: "GET" } satisfies Route; // Error

// Real-world: configuration objects
type ColorConfig = Record<string, string | { light: string; dark: string }>;

const colors = {
  primary: "#007bff",
  secondary: { light: "#6c757d", dark: "#343a40" },
  danger: "#dc3545",
} satisfies ColorConfig;

// TypeScript knows colors.primary is string (not string | { light; dark })
// TypeScript knows colors.secondary is { light: string; dark: string }
colors.secondary.light; // OK — would error with a plain type annotation
```

### Combining `as const` and `satisfies`

```typescript
const PERMISSIONS = {
  READ: 1,
  WRITE: 2,
  DELETE: 4,
  ADMIN: 8,
} as const satisfies Record<string, number>;

// Values are literal types: 1, 2, 4, 8 (not just number)
// AND the object is validated as Record<string, number>
type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]; // 1 | 2 | 4 | 8
```

---

## Overloads vs Unions

### Function Overloads

Overloads provide different call signatures for the same function:

```typescript
// Overload signatures
function parseInput(input: string): string[];
function parseInput(input: number): number[];
function parseInput(input: string | number): string[] | number[] {
  if (typeof input === "string") return input.split(",");
  return [input];
}

const a = parseInput("a,b,c");  // string[] (not string[] | number[])
const b = parseInput(42);        // number[] (not string[] | number[])
```

Without overloads, the return type would always be `string[] | number[]`.

### When to Prefer Unions

```typescript
// Overloads can get verbose. Generics + conditional types are often cleaner:
function parseInput<T extends string | number>(
  input: T
): T extends string ? string[] : number[] {
  if (typeof input === "string") return input.split(",") as any;
  return [input] as any;
}

// Same result, single signature
const a = parseInput("a,b,c"); // string[]
const b = parseInput(42);       // number[]
```

::: tip When to Use Overloads vs Generics
Use **overloads** when:
- Different parameter counts per signature
- Return type depends on specific parameter values (not just types)
- You want clearer API documentation in editor tooltips

Use **generics + conditional types** when:
- The relationship between input and output types follows a pattern
- You have many combinations (overloads get exponential)
- You want to avoid duplicating implementation signatures
:::

### Practical Overload Example: Event Listener

```typescript
interface EventMap {
  click: MouseEvent;
  keydown: KeyboardEvent;
  scroll: Event;
  resize: UIEvent;
}

function addEventListener<K extends keyof EventMap>(
  event: K,
  callback: (e: EventMap[K]) => void
): void;
function addEventListener(event: string, callback: (e: Event) => void): void;
function addEventListener(event: string, callback: (e: any) => void): void {
  document.addEventListener(event, callback);
}

// Known events get specific types
addEventListener("click", (e) => {
  console.log(e.clientX, e.clientY); // MouseEvent
});

// Unknown events fall back to Event
addEventListener("custom-event", (e) => {
  console.log(e.type); // Event
});
```

---

## Common Gotchas

### Structural Typing Surprises

```typescript
interface Point2D { x: number; y: number }
interface Point3D { x: number; y: number; z: number }

// Point3D has all properties of Point2D, so it is assignable
const p3: Point3D = { x: 1, y: 2, z: 3 };
const p2: Point2D = p3; // OK — structural typing

// But excess property checking catches literal objects:
// const p2b: Point2D = { x: 1, y: 2, z: 3 }; // Error: excess property 'z'

// The excess check only applies to object literals.
// This is a frequent source of confusion.
function accepts2D(point: Point2D) { /* ... */ }
accepts2D({ x: 1, y: 2, z: 3 }); // Error — literal
accepts2D(p3);                     // OK — variable (no excess check)
```

### Enum Pitfalls

```typescript
// Numeric enums have reverse mappings and weird assignability
enum Direction {
  Up,    // 0
  Down,  // 1
  Left,  // 2
  Right, // 3
}

// Any number is assignable to a numeric enum (no type safety!)
const d: Direction = 999; // No error! This is a known TypeScript issue.

// Prefer string enums or union types:
enum Status {
  Active = "ACTIVE",
  Inactive = "INACTIVE",
}

const s: Status = "RANDOM" as any; // Error with string enums (unless cast)

// Best: use union types instead of enums entirely
type Direction2 = "up" | "down" | "left" | "right";
// No reverse mapping, no weird assignability, tree-shakeable
```

### `any` vs `unknown` vs `never`

```typescript
// any: disables type checking entirely. Avoid.
let a: any = "hello";
a.nonExistent.method(); // No error — but crashes at runtime

// unknown: the type-safe counterpart to any
let u: unknown = "hello";
// u.toUpperCase(); // Error: Object is of type 'unknown'

// Must narrow before use
if (typeof u === "string") {
  u.toUpperCase(); // OK after narrowing
}

// never: the empty type — no value can be never
// Used for functions that never return:
function throwError(msg: string): never {
  throw new Error(msg);
}

// And for exhaustive checks (see above)
// never is the bottom type — assignable to everything, nothing assignable to it
```

::: danger The `any` Infection
`any` propagates. If a function returns `any`, every downstream operation loses type safety. A single `any` in a chain of calls can silently corrupt types across your entire codebase. Use `unknown` instead and narrow explicitly.
:::

### Object vs object vs `{}`

```typescript
// Object (capital O): includes primitives — almost never what you want
const a: Object = "hello"; // OK (string is an Object)
const b: Object = 42;      // OK (number is an Object)

// object (lowercase): non-primitive types only
const c: object = { key: "value" }; // OK
// const d: object = "hello";        // Error: string is primitive

// {}: any non-nullish value (like unknown minus null/undefined)
const e: {} = "hello";    // OK
const f: {} = 42;         // OK
// const g: {} = null;     // Error
// const h: {} = undefined; // Error

// For "any object", use Record<string, unknown>
const obj: Record<string, unknown> = { key: "value" };
```

---

## Real-World Patterns

### Type-Safe API Responses

```typescript
// Define the API contract as a type map
interface ApiEndpoints {
  "GET /users": {
    params: { page?: number; limit?: number };
    response: { users: User[]; total: number };
  };
  "GET /users/:id": {
    params: { id: string };
    response: User;
  };
  "POST /users": {
    body: Omit<User, "id">;
    response: User;
  };
  "DELETE /users/:id": {
    params: { id: string };
    response: { deleted: boolean };
  };
}

// Type-safe fetch wrapper
async function api<K extends keyof ApiEndpoints>(
  endpoint: K,
  ...args: "body" extends keyof ApiEndpoints[K]
    ? [options: { body: ApiEndpoints[K]["body"] }]
    : "params" extends keyof ApiEndpoints[K]
      ? [options?: { params?: ApiEndpoints[K]["params"] }]
      : []
): Promise<ApiEndpoints[K]["response"]> {
  // implementation
  return {} as any;
}

// Usage — fully typed
const users = await api("GET /users", { params: { page: 1 } });
// type: { users: User[]; total: number }

const user = await api("GET /users/:id", { params: { id: "123" } });
// type: User

const newUser = await api("POST /users", { body: { name: "Alice", email: "a@b.com" } });
// type: User
```

### Type-Safe Form Validation

```typescript
type ValidationRule<T> = {
  required?: boolean;
  min?: T extends number ? number : never;
  max?: T extends number ? number : never;
  minLength?: T extends string ? number : never;
  maxLength?: T extends string ? number : never;
  pattern?: T extends string ? RegExp : never;
  custom?: (value: T) => string | null; // null = valid, string = error message
};

type FormSchema<T> = {
  [K in keyof T]: ValidationRule<T[K]>;
};

interface SignupForm {
  username: string;
  email: string;
  age: number;
  password: string;
}

// Schema is fully typed — you cannot add minLength to a number field
const signupSchema: FormSchema<SignupForm> = {
  username: { required: true, minLength: 3, maxLength: 20, pattern: /^[a-zA-Z0-9_]+$/ },
  email: { required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  age: { required: true, min: 13, max: 120 },
  password: { required: true, minLength: 8 },
};

type ValidationErrors<T> = Partial<Record<keyof T, string>>;

function validate<T extends Record<string, any>>(
  data: T,
  schema: FormSchema<T>
): ValidationErrors<T> {
  const errors: ValidationErrors<T> = {};
  for (const key in schema) {
    const rule = schema[key];
    const value = data[key];
    if (rule.required && (value === undefined || value === null || value === "")) {
      errors[key] = `${String(key)} is required`;
    }
    if (rule.custom) {
      const error = rule.custom(value);
      if (error) errors[key] = error;
    }
  }
  return errors;
}
```

### Type-Safe State Machines

```typescript
// Define states and their allowed transitions
interface StateMachine {
  idle: "loading";
  loading: "success" | "error";
  success: "idle";
  error: "loading" | "idle";
}

type State = keyof StateMachine;

class Machine<S extends State = "idle"> {
  constructor(private state: S) {}

  transition<Next extends StateMachine[S]>(
    next: Next
  ): Machine<Next & State> {
    console.log(`${this.state} -> ${next}`);
    return new Machine(next as any) as any;
  }

  getState(): S {
    return this.state;
  }
}

const machine = new Machine("idle");

const loading = machine.transition("loading");     // Machine<"loading">
const success = loading.transition("success");     // Machine<"success">
const backToIdle = success.transition("idle");     // Machine<"idle">

// Type errors for invalid transitions:
// loading.transition("idle");
// Error: "idle" is not assignable to "success" | "error"
```

### Type-Safe Event Emitter

```typescript
type EventMap = Record<string, any>;

class TypedEmitter<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<Function>>();

  on<K extends keyof Events>(
    event: K,
    listener: (payload: Events[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }
}

// Usage
interface AppEvents {
  "user:login": { userId: string; timestamp: number };
  "user:logout": { userId: string };
  "order:created": { orderId: string; total: number; items: string[] };
  "notification": { message: string; level: "info" | "warn" | "error" };
}

const emitter = new TypedEmitter<AppEvents>();

emitter.on("user:login", (payload) => {
  // payload is { userId: string; timestamp: number }
  console.log(`User ${payload.userId} logged in`);
});

emitter.emit("order:created", {
  orderId: "ord_123",
  total: 99.99,
  items: ["item1", "item2"],
});

// Type errors:
// emitter.emit("user:login", { wrong: "shape" });
// emitter.on("nonexistent", () => {});
```

---

::: tip Key Takeaway
- TypeScript's type system is a programming language unto itself. Generic constraints, conditional types with `infer`, mapped types with key remapping, template literal types, and recursive type definitions give you the tools to encode complex invariants — API contracts, state machine transitions, dot-path accessors, branded domain IDs — at compile time rather than runtime.
- The goal is not to write the most sophisticated types possible, but to make impossible states unrepresentable. Every branded type, discriminated union, and exhaustive check eliminates a category of bugs from your codebase permanently.
- Start simple (utility types, type guards, discriminated unions), adopt middle-tier patterns as your domain complexity demands (branded types, builder patterns, template literals), and reach for type-level programming (recursive types, string parsing) only when the safety payoff justifies the complexity.
:::

::: warning Common Misconceptions
- **"Advanced TypeScript types make code slower at runtime."** Types are erased entirely during compilation. A `Brand<string, "UserId">` is just a `string` at runtime. The compile-time cost increases with complex types, but there is zero runtime impact.
- **"You should always use the strictest possible types."** Over-typing is a real problem. If a function accepts `string` and you brand it as `UserId`, every caller must go through the branding ceremony. The tradeoff is safety vs ergonomics — brand at domain boundaries, not everywhere.
- **"`any` is fine for internal code."** The `any` type propagates silently. A function returning `any` infects every downstream consumer. Use `unknown` and narrow explicitly — it takes seconds more to write and catches entire categories of bugs.
- **"Enums are the best way to define constants."** Numeric enums accept any number (`Direction = 999` compiles). String enums are better, but union types (`"up" | "down" | "left" | "right"`) are simpler, tree-shakeable, and require no import. Enums are a legacy pattern from TypeScript 0.x.
- **"TypeScript's structural typing means you cannot have nominal types."** Branded types provide nominal-like behavior within structural typing. The `__brand` property is a phantom type that exists only in the type system and has no runtime cost.
- **"`satisfies` replaces type annotations."** `satisfies` validates without widening, but it does not constrain reassignment. A `const` variable with `satisfies` cannot be reassigned anyway, but a `let` variable with `satisfies` can be reassigned to any value of the wider type.
:::

## When NOT to Use Advanced TypeScript

- **Prototyping and MVPs** — When you are exploring an idea, complex types slow you down. Use basic types, ship, and add type safety later when the API stabilizes.
- **Simple CRUD endpoints** — If your function takes a string and returns a string, do not brand it, template-literal-parse it, or wrap it in conditional types. Match type complexity to domain complexity.
- **One-off scripts** — CLI scripts, migration scripts, and throwaway tools do not benefit from branded types or builder patterns. Basic TypeScript is sufficient.
- **When your team does not understand the types** — Types are documentation. If your team cannot read the types, they cannot maintain them. A simpler type that everyone understands is better than a clever type that one person wrote.
- **Performance-sensitive compilation** — Deep recursive types and complex conditional chains can slow the TypeScript compiler significantly on large codebases. Profile `tsc --diagnostics` before adding type-level string parsers to a 500-file monorepo.

::: tip In Production
- **Stripe's Node SDK** uses branded types for IDs (`Stripe.Customer.Id` is not interchangeable with `Stripe.Charge.Id`), conditional types for API versioning, and overloads for their `create`/`retrieve`/`update` methods.
- **tRPC** encodes entire API contracts (routes, input validation, output types) at the type level, using generic constraints and conditional types to provide end-to-end type safety between client and server with zero code generation.
- **Zod** uses builder-pattern types where each `.string()`, `.min()`, `.email()` call narrows the schema type, and the final `.parse()` infers the output type automatically.
- **Prisma** generates branded types for each model, uses template literal types for query building (`findMany`, `findUnique`), and maps database schemas to TypeScript types through deep recursive mapped types.
- **Effect-TS** uses variance annotations (`in`/`out`) extensively, with branded types for typed errors, and type-level programming for composing complex service dependency graphs.
:::

::: details Quiz

**1. What does `infer` do inside a conditional type, and why can it only appear in the `extends` clause?**

::: details Answer
`infer` introduces a new type variable that TypeScript infers from the structural position where it appears. It can only appear in the `extends` clause because that is where TypeScript performs the structural matching — it needs to "pattern match" the type and extract the inferred variable from the matched structure. For example, `T extends Promise<infer V> ? V : never` extracts the resolved type `V` from a Promise.
:::

**2. Why does `type ToArray<T> = T extends any ? T[] : never` produce `string[] | number[]` when given `string | number`, instead of `(string | number)[]`?**

::: details Answer
Conditional types distribute over union members when the type parameter is "naked" (not wrapped in a tuple, array, or other structure). TypeScript evaluates the conditional for each member of the union separately: `(string extends any ? string[] : never) | (number extends any ? number[] : never)`, which yields `string[] | number[]`. To prevent distribution, wrap both sides in a tuple: `[T] extends [any] ? T[] : never`.
:::

**3. What is the difference between `as const` and `satisfies`, and when would you use both together?**

::: details Answer
`as const` makes TypeScript infer the narrowest literal types (readonly properties, literal string/number values, readonly tuples). `satisfies` validates that an expression matches a type without widening the inferred type. Used together (`{} as const satisfies SomeType`), you get both: the narrowest possible type inference AND compile-time validation that the value matches the expected shape. Use this for configuration objects where you want literal types for values but validation against a schema.
:::

**4. Explain why branded types solve a problem that TypeScript's structural typing creates, and show the runtime cost.**

::: details Answer
TypeScript uses structural typing: if two types have the same shape, they are interchangeable. This means `type UserId = string` and `type OrderId = string` are identical — you can pass a `UserId` where an `OrderId` is expected with no error. Branded types add a phantom property (`__brand`) that makes the types structurally different at the type level. The runtime cost is zero — the brand property exists only in the type system and is erased during compilation. The value at runtime is still a plain string or number.
:::

**5. When should you use function overloads versus generics with conditional types?**

::: details Answer
Use overloads when you have different parameter counts per signature, when the return type depends on specific parameter values rather than types, or when you want explicit documentation in editor tooltips for each call variant. Use generics with conditional types when the input-to-output type relationship follows a consistent pattern, when you have many type combinations (overloads grow exponentially), or when you want a single implementation signature. In practice, generics with conditional types scale better but are harder to read.
:::

**6. What happens if you add a new variant to a discriminated union but forget to handle it in a switch statement? How do you make TypeScript catch this?**

::: details Answer
Without an exhaustive check, the new variant silently falls through the switch (or hits a default case). To catch this at compile time, add a default case that assigns the switch value to a `never`-typed variable or passes it to an `assertNever(x: never): never` function. Since the new variant is not `never`, TypeScript produces a compile error, forcing you to handle it. This is called exhaustive checking with `never`.
:::

**7. Why is `any` considered dangerous even for "internal" code, and what should you use instead?**

::: details Answer
`any` disables all type checking and propagates silently through the type system. A function returning `any` means every consumer of that function loses type safety — and their consumers lose it too. This "infection" can corrupt type safety across an entire codebase from a single `any`. Use `unknown` instead: it is the type-safe counterpart that requires explicit narrowing (via `typeof`, `instanceof`, or type guards) before the value can be used. The extra few characters of narrowing code prevent entire categories of runtime errors.
:::

:::

::: details Exercise
**Build a Type-Safe Configuration System**

Create a configuration library that uses advanced TypeScript patterns:

1. Define a config schema using branded types for sensitive values (`DatabaseUrl`, `ApiKey`)
2. Create a `ConfigBuilder` that tracks which required fields have been set at the type level
3. Implement dot-path access (`config.get("db.credentials.host")`) with full type inference
4. Add environment variable mapping with template literal types (`DB_HOST` maps to `db.host`)
5. Ensure `.build()` is only callable when all required fields are provided

::: details Solution
```typescript
// 1. Branded types for sensitive values
type Brand<T, B extends string> = T & { readonly __brand: B };
type DatabaseUrl = Brand<string, "DatabaseUrl">;
type ApiKey = Brand<string, "ApiKey">;

function DatabaseUrl(url: string): DatabaseUrl {
  if (!url.startsWith("postgres://") && !url.startsWith("mysql://")) {
    throw new Error("Invalid database URL");
  }
  return url as DatabaseUrl;
}

function ApiKey(key: string): ApiKey {
  if (key.length < 32) throw new Error("API key too short");
  return key as ApiKey;
}

// 2. Config schema
interface AppConfig {
  db: {
    url: DatabaseUrl;
    pool: { min: number; max: number };
  };
  api: {
    key: ApiKey;
    baseUrl: string;
    timeout: number;
  };
  cache: {
    ttl: number;
    maxSize: number;
  };
}

// 3. Dot-path type
type DotPath<T, Prefix extends string = ""> =
  T extends object
    ? {
        [K in keyof T & string]: T[K] extends object
          ? DotPath<T[K], `${Prefix}${K}.`>
          : `${Prefix}${K}`;
      }[keyof T & string]
    : never;

type PathValue<T, P extends string> =
  P extends `${infer Key}.${infer Rest}`
    ? Key extends keyof T ? PathValue<T[Key], Rest> : never
    : P extends keyof T ? T[P] : never;

type ConfigPath = DotPath<AppConfig>;
// "db.url" | "db.pool.min" | "db.pool.max" | "api.key" | ...

// 4. Environment variable mapping
type DotToUpper<S extends string> =
  S extends `${infer H}.${infer T}`
    ? `${Uppercase<H>}_${DotToUpper<T>}`
    : Uppercase<S>;

type EnvVar<P extends string> = DotToUpper<P>;
// EnvVar<"db.pool.max"> = "DB_POOL_MAX"

// 5. Builder with type tracking
type RequiredPaths = "db.url" | "api.key" | "api.baseUrl";

class ConfigBuilder<Set extends string = never> {
  private values = new Map<string, unknown>();

  set<P extends ConfigPath>(
    path: P,
    value: PathValue<AppConfig, P>
  ): ConfigBuilder<Set | P> {
    this.values.set(path, value);
    return this as any;
  }

  fromEnv<P extends ConfigPath>(
    path: P,
    envVar?: EnvVar<P>
  ): ConfigBuilder<Set | P> {
    const key = envVar ?? path.replace(/\./g, "_").toUpperCase();
    const value = process.env[key as string];
    if (value !== undefined) this.values.set(path, value);
    return this as any;
  }

  build(this: ConfigBuilder<RequiredPaths>): AppConfig {
    // Build nested object from dot paths
    const config: any = {};
    for (const [path, value] of this.values) {
      const keys = path.split(".");
      let current = config;
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] ??= {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
    }
    return config;
  }
}

// Usage
const config = new ConfigBuilder()
  .set("db.url", DatabaseUrl("postgres://localhost:5432/mydb"))
  .set("db.pool.min", 2)
  .set("db.pool.max", 10)
  .set("api.key", ApiKey("sk_test_example_key_replace_me_1234"))
  .set("api.baseUrl", "https://api.example.com")
  .set("api.timeout", 5000)
  .set("cache.ttl", 3600)
  .set("cache.maxSize", 1000)
  .build(); // OK — all required paths set

// Missing required path:
// new ConfigBuilder()
//   .set("db.url", DatabaseUrl("postgres://localhost:5432/mydb"))
//   .build();
// Error: build() not available — "api.key" and "api.baseUrl" not set
```
:::

:::

> **One-Liner Summary:** TypeScript's type system is a compile-time programming language — mastering generics, conditional types, mapped types, branded types, and template literals lets you shift entire categories of bugs from runtime crashes to red squiggles in your editor.

*Last updated: 2026-04-05*
