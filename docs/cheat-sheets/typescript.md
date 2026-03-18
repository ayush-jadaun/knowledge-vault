---
title: "TypeScript Cheat Sheet"
description: "Quick reference for TypeScript patterns, utility types, generics, type guards, and common gotchas"
tags: [cheat-sheet, typescript, javascript]
difficulty: "intermediate"
lastReviewed: "2026-03-18"
---

# TypeScript Cheat Sheet

Quick reference for TypeScript utility types, generics, type guards, patterns, and common gotchas.

---

## Utility Types

### Built-in Utility Types

| Type | Description | Example |
|------|-------------|---------|
| `Partial<T>` | All properties optional | `Partial<User>` |
| `Required<T>` | All properties required | `Required<Config>` |
| `Readonly<T>` | All properties readonly | `Readonly<State>` |
| `Pick<T, K>` | Select properties | `Pick<User, 'id' \| 'name'>` |
| `Omit<T, K>` | Remove properties | `Omit<User, 'password'>` |
| `Record<K, V>` | Object with typed keys/values | `Record<string, number>` |
| `Extract<T, U>` | Extract union members | `Extract<'a' \| 'b' \| 'c', 'a' \| 'b'>` |
| `Exclude<T, U>` | Remove union members | `Exclude<'a' \| 'b' \| 'c', 'a'>` |
| `NonNullable<T>` | Remove null and undefined | `NonNullable<string \| null>` |
| `ReturnType<T>` | Function return type | `ReturnType<typeof fn>` |
| `Parameters<T>` | Function parameter types | `Parameters<typeof fn>` |
| `Awaited<T>` | Unwrap Promise type | `Awaited<Promise<string>>` |
| `InstanceType<T>` | Class instance type | `InstanceType<typeof MyClass>` |
| `ConstructorParameters<T>` | Constructor param types | `ConstructorParameters<typeof MyClass>` |

### Usage Examples

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

// Partial - for update payloads
function updateUser(id: number, data: Partial<User>) {}
updateUser(1, { name: 'Alice' }); // Only need some fields

// Pick - for specific views
type UserPreview = Pick<User, 'id' | 'name'>;

// Omit - for creation (no ID yet)
type CreateUser = Omit<User, 'id'>;

// Record - for lookup maps
type RolePermissions = Record<User['role'], string[]>;
const permissions: RolePermissions = {
  admin: ['read', 'write', 'delete'],
  user: ['read'],
};
```

---

## Generics

### Basic Generics

```typescript
// Generic function
function identity<T>(value: T): T {
  return value;
}

// Generic with constraint
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// Generic interface
interface Repository<T> {
  findById(id: string): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

// Generic class
class TypedMap<K, V> {
  private map = new Map<K, V>();
  set(key: K, value: V): void { this.map.set(key, value); }
  get(key: K): V | undefined { return this.map.get(key); }
}
```

### Generic Constraints

```typescript
// Constrain to objects with id
function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}

// Constrain to specific keys
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => { result[key] = obj[key]; });
  return result;
}

// Default generic type
interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  message: string;
}
```

### Advanced Generic Patterns

```typescript
// Conditional types
type IsString<T> = T extends string ? true : false;

// Infer keyword
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
type ArrayElement<T> = T extends (infer U)[] ? U : never;

// Mapped types
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

// Template literal types
type EventName<T extends string> = `on${Capitalize<T>}`;
type ClickEvent = EventName<'click'>; // 'onClick'
```

---

## Type Guards

### typeof Guards

```typescript
function process(value: string | number) {
  if (typeof value === 'string') {
    // TypeScript knows value is string here
    return value.toUpperCase();
  }
  // TypeScript knows value is number here
  return value.toFixed(2);
}
```

### instanceof Guards

```typescript
class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

function handleError(error: Error) {
  if (error instanceof ApiError) {
    // TypeScript knows error is ApiError
    console.log(error.statusCode);
  }
}
```

### Custom Type Guards

```typescript
interface Cat { meow(): void; }
interface Dog { bark(): void; }

// Type predicate function
function isCat(animal: Cat | Dog): animal is Cat {
  return 'meow' in animal;
}

function handleAnimal(animal: Cat | Dog) {
  if (isCat(animal)) {
    animal.meow(); // TypeScript knows it's a Cat
  } else {
    animal.bark(); // TypeScript knows it's a Dog
  }
}
```

### Discriminated Unions

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

// Exhaustive check helper
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}
```

### Assertion Functions

```typescript
function assertDefined<T>(value: T | null | undefined, msg?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(msg ?? 'Value is not defined');
  }
}

function process(input: string | null) {
  assertDefined(input, 'Input required');
  // TypeScript knows input is string here
  console.log(input.toUpperCase());
}
```

---

## Common Patterns

### Builder Pattern

```typescript
class QueryBuilder<T> {
  private filters: string[] = [];
  private sortField?: keyof T;

  where(field: keyof T, value: unknown): this {
    this.filters.push(`${String(field)} = ${value}`);
    return this;
  }

  orderBy(field: keyof T): this {
    this.sortField = field;
    return this;
  }

  build(): string {
    let query = `SELECT * FROM table`;
    if (this.filters.length) {
      query += ` WHERE ${this.filters.join(' AND ')}`;
    }
    if (this.sortField) {
      query += ` ORDER BY ${String(this.sortField)}`;
    }
    return query;
  }
}
```

### Result Type (Error Handling)

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// Usage
function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return err('Division by zero');
  return ok(a / b);
}

const result = divide(10, 0);
if (result.ok) {
  console.log(result.value); // TypeScript knows it's number
} else {
  console.log(result.error); // TypeScript knows it's string
}
```

### Branded Types

```typescript
// Prevent mixing up primitive types
type UserId = string & { readonly __brand: unique symbol };
type OrderId = string & { readonly __brand: unique symbol };

function createUserId(id: string): UserId {
  return id as UserId;
}

function getUser(id: UserId): void {}
function getOrder(id: OrderId): void {}

const userId = createUserId('u123');
getUser(userId);  // OK
// getOrder(userId); // Error: UserId is not assignable to OrderId
```

### Strict Event Emitter

```typescript
type EventMap = {
  'user:login': { userId: string; timestamp: number };
  'user:logout': { userId: string };
  'error': { message: string; code: number };
};

class TypedEmitter<T extends Record<string, unknown>> {
  private handlers = new Map<string, Set<Function>>();

  on<K extends keyof T>(event: K, handler: (payload: T[K]) => void): void {
    if (!this.handlers.has(event as string)) {
      this.handlers.set(event as string, new Set());
    }
    this.handlers.get(event as string)!.add(handler);
  }

  emit<K extends keyof T>(event: K, payload: T[K]): void {
    this.handlers.get(event as string)?.forEach(h => h(payload));
  }
}

const emitter = new TypedEmitter<EventMap>();
emitter.on('user:login', (data) => {
  // data is typed as { userId: string; timestamp: number }
  console.log(data.userId);
});
```

---

## Type Narrowing Techniques

| Technique | Syntax | Narrows To |
|-----------|--------|------------|
| typeof | `typeof x === 'string'` | Primitive types |
| instanceof | `x instanceof Date` | Class instances |
| in | `'name' in x` | Objects with property |
| Discriminant | `x.type === 'a'` | Union members |
| Truthiness | `if (x)` | Non-nullish |
| Equality | `x === null` | Specific value |
| Custom guard | `isFoo(x)` | Custom type |
| Assertion | `assertFoo(x)` | Custom type (throws) |

---

## Common Gotchas

### Object vs object vs Record

```typescript
// Object - almost anything (avoid)
let a: Object = 'string'; // works but useless

// object - any non-primitive
let b: object = {}; // OK
// let c: object = 'string'; // Error

// Record<string, unknown> - typed object (preferred)
let d: Record<string, unknown> = { key: 'value' };
```

### Readonly Arrays

```typescript
// Mutable array
const arr: number[] = [1, 2, 3];
arr.push(4); // OK

// Readonly array
const readonlyArr: readonly number[] = [1, 2, 3];
// readonlyArr.push(4); // Error

// as const makes deeply readonly
const config = {
  ports: [3000, 3001],
  host: 'localhost',
} as const;
// config.ports.push(3002); // Error
// config.host = 'other';   // Error
```

### Enums vs Union Types

```typescript
// Prefer union types over enums
// Bad: enum creates runtime code
enum Direction {
  Up = 'UP',
  Down = 'DOWN',
}

// Good: union type is zero-runtime
type Direction = 'UP' | 'DOWN';

// If you need enum-like objects, use as const
const Direction = {
  Up: 'UP',
  Down: 'DOWN',
} as const;
type Direction = typeof Direction[keyof typeof Direction];
```

### Function Overloads

```typescript
// Overload signatures
function parse(input: string): number;
function parse(input: string[]): number[];
// Implementation signature
function parse(input: string | string[]): number | number[] {
  if (Array.isArray(input)) {
    return input.map(Number);
  }
  return Number(input);
}

parse('42');     // returns number
parse(['1','2']); // returns number[]
```

### The any Escape Hatches

```typescript
// unknown is the safe alternative to any
function process(data: unknown) {
  // Must narrow before using
  if (typeof data === 'string') {
    console.log(data.toUpperCase());
  }
}

// never for exhaustive checks
type Shape = 'circle' | 'square';
function handle(shape: Shape) {
  switch (shape) {
    case 'circle': return;
    case 'square': return;
    default:
      const _exhaustive: never = shape;
      throw new Error(`Unhandled: ${_exhaustive}`);
  }
}
```

---

## tsconfig.json Key Options

| Option | Recommended | Why |
|--------|-------------|-----|
| `strict` | `true` | Enables all strict checks |
| `noUncheckedIndexedAccess` | `true` | Array/object access returns `T \| undefined` |
| `exactOptionalPropertyTypes` | `true` | Distinguishes `undefined` from missing |
| `noImplicitReturns` | `true` | All code paths must return |
| `noFallthroughCasesInSwitch` | `true` | Prevent switch fallthrough |
| `forceConsistentCasingInFileNames` | `true` | Prevent casing bugs on case-insensitive OS |
| `skipLibCheck` | `true` | Faster builds, skip .d.ts checking |
| `moduleResolution` | `bundler` | Modern bundler resolution |
| `target` | `ES2022` | Modern JS output |
| `verbatimModuleSyntax` | `true` | Explicit type imports |

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| Type | `interface` | `type` | Object shapes, extends | Unions, intersections, mapped types |
| Assertion | `as Type` | Type guard | You are certain, one-off | Runtime check needed, reusable |
| Null check | `!` (non-null assertion) | Proper null check | 100% certain, testing | Production code |
| Generic default | `T = unknown` | No default | Library API, optional generic | Internal code |
| Import | `import type` | `import` | Type only, no runtime | Need the value at runtime |
