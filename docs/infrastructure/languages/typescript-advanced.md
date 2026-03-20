---
title: "TypeScript Advanced Type System"
description: "Deep dive into TypeScript's advanced type system — conditional types, mapped types, template literal types, discriminated unions, branded types, infer, and recursive types"
tags: [typescript, type-system, advanced, generics, type-safety]
difficulty: advanced
prerequisites: [typescript-basics]
lastReviewed: "2026-03-20"
---

# TypeScript Advanced Type System

TypeScript's type system is one of the most powerful in any mainstream language. It is Turing-complete, which means you can encode arbitrary computation at the type level. This page covers the advanced features that separate TypeScript beginners from engineers who wield the type system as a design tool.

The goal is not type gymnastics for its own sake. Every pattern here solves a real problem: making impossible states unrepresentable, catching bugs at compile time instead of runtime, and building APIs that guide users toward correct usage.

**Related**: [TypeScript Cheat Sheet](/cheat-sheets/typescript) | [Node.js Internals](/infrastructure/languages/nodejs-internals)

---

## Conditional Types

Conditional types select one of two types based on a condition, using the `extends` keyword.

```typescript
// Basic conditional type
type IsString<T> = T extends string ? true : false;

type A = IsString<string>;   // true
type B = IsString<number>;   // false

// Practical: Extract return type
type ReturnOf<T> = T extends (...args: any[]) => infer R ? R : never;

type Fn = (x: number) => string;
type Result = ReturnOf<Fn>;  // string
```

### Distributive Conditional Types

When a conditional type is applied to a union, it distributes over each member.

```typescript
type ToArray<T> = T extends any ? T[] : never;

// Distributes over the union:
type Result = ToArray<string | number>;
// = string[] | number[]   (NOT (string | number)[])

// Prevent distribution by wrapping in tuple:
type ToArrayNonDist<T> = [T] extends [any] ? T[] : never;

type Result2 = ToArrayNonDist<string | number>;
// = (string | number)[]
```

### Filtering with Conditional Types

```typescript
// Extract only string types from a union
type ExtractStrings<T> = T extends string ? T : never;

type Mixed = 'a' | 'b' | 1 | 2 | true;
type OnlyStrings = ExtractStrings<Mixed>;  // 'a' | 'b'

// Remove null and undefined
type NonNullable<T> = T extends null | undefined ? never : T;

type MaybeString = string | null | undefined;
type DefiniteString = NonNullable<MaybeString>;  // string
```

---

## The `infer` Keyword

`infer` declares a type variable within a conditional type's `extends` clause — it "captures" a piece of a type.

```typescript
// Extract element type of an array
type ElementOf<T> = T extends (infer E)[] ? E : never;
type Item = ElementOf<string[]>;  // string

// Extract Promise inner type
type Awaited<T> = T extends Promise<infer U> ? Awaited<U> : T;
type Val = Awaited<Promise<Promise<number>>>;  // number

// Extract first argument of a function
type FirstArg<T> = T extends (first: infer A, ...rest: any[]) => any ? A : never;
type Arg = FirstArg<(name: string, age: number) => void>;  // string

// Extract constructor parameter types
type ConstructorParams<T> = T extends new (...args: infer P) => any ? P : never;

class User {
  constructor(public name: string, public age: number) {}
}
type Params = ConstructorParams<typeof User>;  // [string, number]
```

### `infer` with Template Literals

```typescript
// Parse a route string
type ExtractParams<T extends string> =
  T extends `${infer _}:${infer Param}/${infer Rest}`
    ? Param | ExtractParams<`/${Rest}`>
    : T extends `${infer _}:${infer Param}`
      ? Param
      : never;

type Params = ExtractParams<'/users/:userId/posts/:postId'>;
// 'userId' | 'postId'
```

---

## Mapped Types

Mapped types transform properties of an existing type.

```typescript
// Make all properties optional
type MyPartial<T> = {
  [K in keyof T]?: T[K];
};

// Make all properties required
type MyRequired<T> = {
  [K in keyof T]-?: T[K];
};

// Make all properties readonly
type MyReadonly<T> = {
  readonly [K in keyof T]: T[K];
};

// Remove readonly
type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

// Map to new value types
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

interface Person {
  name: string;
  age: number;
}

type PersonGetters = Getters<Person>;
// { getName: () => string; getAge: () => number }
```

### Key Remapping with `as`

```typescript
// Filter properties by type
type OnlyStrings<T> = {
  [K in keyof T as T[K] extends string ? K : never]: T[K];
};

interface Mixed {
  name: string;
  age: number;
  email: string;
  active: boolean;
}

type StringProps = OnlyStrings<Mixed>;
// { name: string; email: string }

// Prefix all keys
type Prefixed<T, P extends string> = {
  [K in keyof T as `${P}${Capitalize<string & K>}`]: T[K];
};

type PrefixedPerson = Prefixed<Person, 'user'>;
// { userName: string; userAge: number }

// Remove specific keys
type OmitBy<T, V> = {
  [K in keyof T as T[K] extends V ? never : K]: T[K];
};

type NoFunctions = OmitBy<{ name: string; greet: () => void }, Function>;
// { name: string }
```

---

## Template Literal Types

Template literal types build string types from other types.

```typescript
type EventName = 'click' | 'focus' | 'blur';
type Handler = `on${Capitalize<EventName>}`;
// 'onClick' | 'onFocus' | 'onBlur'

// HTTP methods
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Endpoint = '/users' | '/posts';
type Route = `${Method} ${Endpoint}`;
// 'GET /users' | 'GET /posts' | 'POST /users' | ... (8 combinations)

// CSS units
type CSSUnit = 'px' | 'rem' | 'em' | '%' | 'vh' | 'vw';
type CSSValue = `${number}${CSSUnit}`;
// Accepts '16px', '1.5rem', '100%', etc.
```

### Intrinsic String Manipulation Types

| Type | Effect | Example |
|------|--------|---------|
| `Uppercase<S>` | All caps | `'hello'` -> `'HELLO'` |
| `Lowercase<S>` | All lower | `'HELLO'` -> `'hello'` |
| `Capitalize<S>` | First char upper | `'hello'` -> `'Hello'` |
| `Uncapitalize<S>` | First char lower | `'Hello'` -> `'hello'` |

---

## Discriminated Unions

Discriminated unions (tagged unions) use a literal type member to distinguish between variants. The TypeScript compiler narrows the type in each branch.

```typescript
// The "type" field is the discriminant
type Shape =
  | { type: 'circle'; radius: number }
  | { type: 'rectangle'; width: number; height: number }
  | { type: 'triangle'; base: number; height: number };

function area(shape: Shape): number {
  switch (shape.type) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'rectangle':
      return shape.width * shape.height;
    case 'triangle':
      return (shape.base * shape.height) / 2;
  }
}
```

### Exhaustive Matching

Ensure every variant is handled. If you add a new variant, TypeScript errors at compile time.

```typescript
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

function area(shape: Shape): number {
  switch (shape.type) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'rectangle':
      return shape.width * shape.height;
    case 'triangle':
      return (shape.base * shape.height) / 2;
    default:
      // If a new Shape variant is added without handling it here,
      // TypeScript will error because `shape` won't be `never`
      return assertNever(shape);
  }
}
```

### Result Type Pattern

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return { ok: false, error: 'Division by zero' };
  return { ok: true, value: a / b };
}

const result = divide(10, 3);
if (result.ok) {
  console.log(result.value);   // TypeScript knows value exists
} else {
  console.log(result.error);   // TypeScript knows error exists
}
```

---

## Branded Types (Nominal Typing)

TypeScript uses structural typing. Two types with the same shape are compatible. Branded types add a phantom property to create distinct types that are structurally incompatible.

```typescript
// Brand declaration
type Brand<T, B extends string> = T & { readonly __brand: B };

// Create distinct ID types
type UserId = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;

// Constructor functions
function userId(id: string): UserId {
  return id as UserId;
}

function orderId(id: string): OrderId {
  return id as OrderId;
}

// Now TypeScript prevents mixing them up
function getUser(id: UserId) { /* ... */ }
function getOrder(id: OrderId) { /* ... */ }

const uid = userId('user-123');
const oid = orderId('order-456');

getUser(uid);  // OK
getUser(oid);  // ERROR: Argument of type 'OrderId' is not assignable to 'UserId'

// Validated types
type Email = Brand<string, 'Email'>;
type PositiveInt = Brand<number, 'PositiveInt'>;

function validateEmail(input: string): Email {
  if (!input.includes('@')) throw new Error('Invalid email');
  return input as Email;
}

function positiveInt(n: number): PositiveInt {
  if (n <= 0 || !Number.isInteger(n)) throw new Error('Must be positive integer');
  return n as PositiveInt;
}
```

::: tip
Branded types are zero-cost at runtime — the brand property only exists in the type system. They are the most practical way to prevent "stringly typed" bugs like passing a user ID where an order ID is expected.
:::

---

## Type-Safe Builder Pattern

```typescript
type BuilderState = {
  host: boolean;
  port: boolean;
  database: boolean;
};

type RequiredFields = {
  host: true;
  port: true;
  database: true;
};

class ConnectionBuilder<State extends Partial<BuilderState> = {}> {
  private config: Record<string, any> = {};

  host(value: string): ConnectionBuilder<State & { host: true }> {
    this.config.host = value;
    return this as any;
  }

  port(value: number): ConnectionBuilder<State & { port: true }> {
    this.config.port = value;
    return this as any;
  }

  database(value: string): ConnectionBuilder<State & { database: true }> {
    this.config.database = value;
    return this as any;
  }

  // build() is only available when all required fields are set
  build(this: ConnectionBuilder<RequiredFields>): Connection {
    return new Connection(this.config);
  }
}

// Usage:
new ConnectionBuilder()
  .host('localhost')
  .port(5432)
  .database('mydb')
  .build();  // OK — all fields set

new ConnectionBuilder()
  .host('localhost')
  .build();  // ERROR — port and database not set
```

---

## Recursive Types

Types that reference themselves, useful for tree structures, JSON, and deeply nested data.

```typescript
// JSON type
type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

// Tree structure
type TreeNode<T> = {
  value: T;
  children: TreeNode<T>[];
};

// Deep partial (all nested properties optional)
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// Deep readonly
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

// Path type — get all valid dot-notation paths
type Paths<T, D extends number = 10> = [D] extends [never]
  ? never
  : T extends object
    ? {
        [K in keyof T]-?: K extends string | number
          ? `${K}` | `${K}.${Paths<T[K], Prev[D]>}`
          : never;
      }[keyof T]
    : never;

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface Config {
  db: { host: string; port: number };
  cache: { ttl: number };
}

type ConfigPaths = Paths<Config>;
// 'db' | 'db.host' | 'db.port' | 'cache' | 'cache.ttl'
```

---

## Utility Type Recipes

### Make Specific Properties Required

```typescript
type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

interface Options {
  timeout?: number;
  retries?: number;
  baseUrl?: string;
}

type RequiredOptions = RequireKeys<Options, 'baseUrl'>;
// baseUrl is required, timeout and retries remain optional
```

### Exact Types (Prevent Excess Properties)

```typescript
type Exact<T, Shape> = T extends Shape
  ? Exclude<keyof T, keyof Shape> extends never
    ? T
    : never
  : never;
```

### Union to Intersection

```typescript
type UnionToIntersection<U> =
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void
    ? I
    : never;

type A = { a: string };
type B = { b: number };
type AB = UnionToIntersection<A | B>;  // { a: string } & { b: number }
```

### Strict Omit (Errors on Invalid Keys)

```typescript
type StrictOmit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Built-in Omit allows non-existent keys (no error)
// StrictOmit only allows actual keys of T
```

---

## Const Assertions and Satisfies

### `as const`

```typescript
// Without as const: type is string[]
const colors = ['red', 'green', 'blue'];

// With as const: type is readonly ['red', 'green', 'blue']
const colors = ['red', 'green', 'blue'] as const;
type Color = typeof colors[number]; // 'red' | 'green' | 'blue'

// Object as const
const config = {
  endpoint: '/api',
  timeout: 3000,
  retries: 3,
} as const;
// All properties are readonly with literal types
```

### `satisfies` Operator (TS 4.9+)

```typescript
type Colors = Record<string, string | string[]>;

// satisfies validates the type without widening
const palette = {
  red: '#ff0000',
  green: '#00ff00',
  blue: ['#0000ff', '#0000cc'],
} satisfies Colors;

// TypeScript still knows the exact type:
palette.red.toUpperCase();       // OK — knows it's a string
palette.blue.map(x => x);       // OK — knows it's string[]

// Without satisfies, using a type annotation would widen:
// palette.red would be string | string[], losing specificity
```

---

## Practical Patterns

### Type-Safe Event Emitter

```typescript
type EventMap = {
  'user:login': { userId: string; timestamp: number };
  'user:logout': { userId: string };
  'error': { message: string; code: number };
};

class TypedEmitter<Events extends Record<string, any>> {
  private handlers = new Map<string, Function[]>();

  on<K extends keyof Events>(
    event: K,
    handler: (payload: Events[K]) => void
  ): void {
    const list = this.handlers.get(event as string) ?? [];
    list.push(handler);
    this.handlers.set(event as string, list);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers.get(event as string)?.forEach(fn => fn(payload));
  }
}

const emitter = new TypedEmitter<EventMap>();

emitter.on('user:login', (payload) => {
  console.log(payload.userId);     // TypeScript knows the shape
});

emitter.emit('user:login', { userId: '123', timestamp: Date.now() }); // OK
emitter.emit('user:login', { wrong: 'field' });  // ERROR
```

::: warning
Advanced type-level computation can slow down the TypeScript compiler. If your IDE becomes sluggish, check for deeply recursive types or large union distributions. Use the `--generateTrace` flag to profile compilation.
:::

---

*Last updated: 2026-03-20*
