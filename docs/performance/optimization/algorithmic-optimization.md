---
title: "Algorithmic Optimization"
description: "Practical algorithmic optimization — Big-O analysis, amortized analysis, space-time trade-offs, and common optimization patterns including memoization, precomputation, batching, pagination, and cursor-based pagination"
tags: [algorithms, optimization, big-o, amortized-analysis, memoization, batching, pagination, cursor-pagination, space-time-tradeoff, performance]
difficulty: intermediate
prerequisites: [performance/optimization]
lastReviewed: "2026-03-17"
---

# Algorithmic Optimization

Algorithmic optimization delivers the largest performance gains with the least effort. Switching from an O(n^2) algorithm to an O(n log n) one can turn a 10-minute operation into a 100ms one. No amount of micro-optimization, caching, or hardware scaling can compensate for a fundamentally wrong algorithm. This page covers the analytical tools (Big-O, amortized analysis) and practical patterns (memoization, precomputation, batching) you need to make the right algorithmic choices.

## Big-O Analysis — The Language of Performance

Big-O notation describes how an algorithm's resource consumption (time or space) grows as the input size grows. It ignores constants and lower-order terms because at scale, only the dominant term matters.

### Common Complexities

| Big-O | Name | Example | 1K items | 1M items | 1B items |
|-------|------|---------|----------|----------|----------|
| O(1) | Constant | Hash map lookup | 1 op | 1 op | 1 op |
| O(log n) | Logarithmic | Binary search | 10 ops | 20 ops | 30 ops |
| O(n) | Linear | Array scan | 1K ops | 1M ops | 1B ops |
| O(n log n) | Linearithmic | Merge sort | 10K ops | 20M ops | 30B ops |
| O(n^2) | Quadratic | Nested loop | 1M ops | 1T ops | 10^18 ops |
| O(n^3) | Cubic | Matrix multiplication | 1B ops | 10^18 ops | 10^27 ops |
| O(2^n) | Exponential | Power set | 10^301 ops | - | - |
| O(n!) | Factorial | Permutations | - | - | - |

### Why Constants Matter (Sometimes)

Big-O ignores constants, but in practice, constants can dominate for realistic input sizes:

```typescript
// Algorithm A: O(n log n) with constant factor 100
// Algorithm B: O(n^2) with constant factor 1

// At n = 10: A = 100 * 33 = 3,300  vs  B = 100  → B is faster
// At n = 100: A = 100 * 664 = 66,400  vs  B = 10,000  → B is faster
// At n = 1000: A = 100 * 9,966 = 996,600  vs  B = 1,000,000  → roughly equal
// At n = 10000: A = 100 * 132,877 = 13M  vs  B = 100M  → A is 7.5x faster

// Takeaway: For small n, use the simpler algorithm.
// For large n, use the better Big-O.
```

### Analyzing Code Complexity

```typescript
// O(n) — single loop
function sum(arr: number[]): number {
  let total = 0;
  for (const x of arr) {  // n iterations
    total += x;            // O(1) per iteration
  }
  return total;
}

// O(n^2) — nested loops (both depend on n)
function hasDuplicate(arr: number[]): boolean {
  for (let i = 0; i < arr.length; i++) {        // n iterations
    for (let j = i + 1; j < arr.length; j++) {   // n-1 iterations (average n/2)
      if (arr[i] === arr[j]) return true;         // O(1) comparison
    }
  }
  return false;
}
// n * n/2 = n^2/2 → O(n^2)

// O(n) — nested loop where inner loop is bounded
function processChunks(arr: number[], chunkSize: number = 10): void {
  for (let i = 0; i < arr.length; i += chunkSize) {  // n/chunkSize iterations
    for (let j = i; j < Math.min(i + chunkSize, arr.length); j++) {
      process(arr[j]);  // Each element processed exactly once
    }
  }
}
// Total work: n elements processed → O(n)

// O(n log n) — divide and conquer
function mergeSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));   // T(n/2)
  const right = mergeSort(arr.slice(mid));      // T(n/2)
  return merge(left, right);                     // O(n) merge
}
// T(n) = 2*T(n/2) + O(n) → O(n log n)
```

## Amortized Analysis

Some operations are occasionally expensive but cheap on average. Amortized analysis gives the average cost per operation over a sequence of operations.

### Dynamic Array (ArrayList) Growth

```typescript
class DynamicArray<T> {
  private data: T[];
  private length = 0;
  private capacity: number;

  constructor(initialCapacity = 4) {
    this.capacity = initialCapacity;
    this.data = new Array(initialCapacity);
  }

  push(item: T): void {
    if (this.length === this.capacity) {
      // Double the capacity — expensive O(n) copy
      this.capacity *= 2;
      const newData = new Array(this.capacity);
      for (let i = 0; i < this.length; i++) {
        newData[i] = this.data[i];
      }
      this.data = newData;
    }
    this.data[this.length++] = item;
  }
}

// Analysis of n push operations:
// Most pushes are O(1) (just set data[length] and increment)
// Occasionally, a push triggers a resize: copy n elements → O(n)
//
// Resizes happen at sizes: 4, 8, 16, 32, ..., n
// Total copy cost: 4 + 8 + 16 + ... + n = 2n - 4
// Total operations: n
// Amortized cost per push: (n + 2n - 4) / n ≈ 3 → O(1) amortized
```

### Hash Map Rehashing

```typescript
// Similar analysis: hash maps occasionally rehash (resize)
// when the load factor exceeds a threshold (~0.75 for most implementations)
//
// Rehashing is O(n) — must re-insert all entries
// But it only happens when size doubles
// Amortized cost per insert: O(1)
//
// This is why Map.set() is O(1) amortized, not O(1) worst-case
```

### The Banker's Method

A useful mental model: imagine each O(1) operation "deposits" a constant amount of credit. When an expensive operation occurs, it "withdraws" accumulated credit. If the account never goes negative, the amortized cost is the deposit amount.

```
Push #1:  cost=1, deposit 2 credit → balance: 2
Push #2:  cost=1, deposit 2 credit → balance: 4
Push #3:  cost=1, deposit 2 credit → balance: 6
Push #4:  cost=1, deposit 2 credit → balance: 8
Push #5:  cost=5 (resize: copy 4 + insert 1), withdraw 4 credit → balance: 6
Push #6:  cost=1, deposit 2 credit → balance: 8
Push #7:  cost=1, deposit 2 credit → balance: 10
Push #8:  cost=1, deposit 2 credit → balance: 12
Push #9:  cost=9 (resize: copy 8 + insert 1), withdraw 8 credit → balance: 6
...

Balance never goes negative → amortized O(1) per push ✓
```

## Space-Time Trade-offs

The fundamental trade-off in algorithm design: you can often speed up computation by using more memory, and save memory by doing more computation.

### Example: Two Sum Problem

```typescript
// Space-optimized: O(1) space, O(n^2) time
function twoSumBrute(nums: number[], target: number): [number, number] {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) return [i, j];
    }
  }
  return [-1, -1];
}

// Time-optimized: O(n) space, O(n) time
function twoSumHash(nums: number[], target: number): [number, number] {
  const seen = new Map<number, number>(); // Trade space for time
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) {
      return [seen.get(complement)!, i];
    }
    seen.set(nums[i], i);
  }
  return [-1, -1];
}
```

| Approach | Time | Space | 10K items | 1M items |
|----------|------|-------|-----------|----------|
| Brute force | O(n^2) | O(1) | 100ms | 16 min |
| Hash map | O(n) | O(n) | 0.1ms | 10ms |

### When to Choose Space Over Time

| Choose Time Optimization (More Memory) When | Choose Space Optimization (More CPU) When |
|----------------------------------------------|-------------------------------------------|
| Memory is cheap relative to CPU | Running on memory-constrained device |
| Operation is on the critical path | Data is rarely accessed (cold path) |
| Dataset fits comfortably in RAM | Dataset is larger than available RAM |
| Latency matters more than throughput | Processing is offline/batch |

## Pattern 1: Memoization

Cache the results of expensive function calls and return the cached result when the same inputs occur again.

```typescript
// Generic memoization wrapper
function memoize<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => TResult,
  keyFn: (...args: TArgs) => string = (...args) => JSON.stringify(args)
): (...args: TArgs) => TResult {
  const cache = new Map<string, TResult>();

  return (...args: TArgs): TResult => {
    const key = keyFn(...args);
    if (cache.has(key)) return cache.get(key)!;

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

// Usage
const expensiveCalc = memoize((n: number): number => {
  // Simulates expensive computation
  let result = 0;
  for (let i = 0; i < n * 1000; i++) {
    result += Math.sqrt(i);
  }
  return result;
});

expensiveCalc(1000); // Slow (first call)
expensiveCalc(1000); // Instant (cached)
```

### Memoization with TTL and Size Limits

```typescript
interface MemoOptions {
  maxSize?: number;
  ttlMs?: number;
}

function memoizeWithOptions<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => TResult,
  options: MemoOptions = {}
): (...args: TArgs) => TResult {
  const { maxSize = 1000, ttlMs = 60_000 } = options;

  const cache = new Map<string, { value: TResult; timestamp: number }>();
  const keyOrder: string[] = []; // For LRU eviction

  return (...args: TArgs): TResult => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);

    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.value;
    }

    const result = fn(...args);

    // Evict oldest if at capacity
    if (cache.size >= maxSize) {
      const oldest = keyOrder.shift()!;
      cache.delete(oldest);
    }

    cache.set(key, { value: result, timestamp: Date.now() });
    keyOrder.push(key);

    return result;
  };
}
```

### When Memoization Helps (and When It Doesn't)

| Scenario | Helps? | Reason |
|----------|--------|--------|
| Pure function called with same args | Yes | Same input always gives same output |
| Function with side effects | No | Cached result skips the side effect |
| Huge input space (rarely repeated args) | No | Cache misses everywhere, wastes memory |
| Recursive Fibonacci | Yes | Exponential → linear reduction |
| Database query results | Maybe | Only if data doesn't change between calls |

## Pattern 2: Precomputation

Do work ahead of time so that queries are fast.

```typescript
// WITHOUT precomputation: O(n) per query
function getAverageRating(products: Product[], category: string): number {
  const categoryProducts = products.filter(p => p.category === category);
  const sum = categoryProducts.reduce((s, p) => s + p.rating, 0);
  return sum / categoryProducts.length;
}
// If called for each of 100 categories with 1M products:
// 100 * O(1M) = 100M operations

// WITH precomputation: O(n) upfront, O(1) per query
function buildCategoryStats(products: Product[]): Map<string, { sum: number; count: number }> {
  const stats = new Map<string, { sum: number; count: number }>();

  for (const product of products) {
    const existing = stats.get(product.category) || { sum: 0, count: 0 };
    existing.sum += product.rating;
    existing.count++;
    stats.set(product.category, existing);
  }

  return stats;
}

const stats = buildCategoryStats(products); // O(n) — done once

function getAverageRating(category: string): number {
  const s = stats.get(category)!;
  return s.sum / s.count; // O(1) per query
}
// For 100 queries: O(1M) + 100 * O(1) = 1M operations
// 100x improvement
```

### Prefix Sum Array

A classic precomputation technique for range sum queries:

```typescript
// Without precomputation: O(n) per range query
function rangeSum(arr: number[], left: number, right: number): number {
  let sum = 0;
  for (let i = left; i <= right; i++) {
    sum += arr[i];
  }
  return sum;
}

// With prefix sum: O(n) precomputation, O(1) per query
function buildPrefixSum(arr: number[]): number[] {
  const prefix = new Array(arr.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < arr.length; i++) {
    prefix[i + 1] = prefix[i] + arr[i];
  }
  return prefix;
}

const prefix = buildPrefixSum(arr);

function rangeSum(left: number, right: number): number {
  return prefix[right + 1] - prefix[left]; // O(1)!
}
```

## Pattern 3: Batching

Combine multiple operations into a single operation to reduce overhead.

```typescript
// WITHOUT batching: 1000 individual database inserts
async function insertUsers(users: User[]): Promise<void> {
  for (const user of users) {
    await db.query(
      'INSERT INTO users (name, email) VALUES ($1, $2)',
      [user.name, user.email]
    );
  }
}
// 1000 round-trips to the database
// Each round-trip: ~1ms network + ~0.5ms execution = ~1.5ms
// Total: 1000 * 1.5ms = 1.5 seconds

// WITH batching: single multi-row insert
async function insertUsersBatched(users: User[]): Promise<void> {
  const BATCH_SIZE = 500;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const values: any[] = [];
    const placeholders: string[] = [];

    batch.forEach((user, j) => {
      const offset = j * 2;
      placeholders.push(`($${offset + 1}, $${offset + 2})`);
      values.push(user.name, user.email);
    });

    await db.query(
      `INSERT INTO users (name, email) VALUES ${placeholders.join(', ')}`,
      values
    );
  }
}
// 2 round-trips to the database (1000 / 500 = 2 batches)
// Total: 2 * (1ms network + 10ms execution) = 22ms
// 68x improvement
```

### Batching API Calls

```typescript
// DataLoader pattern: batch multiple individual lookups into one query
class UserLoader {
  private pending = new Map<string, {
    resolve: (user: User) => void;
    reject: (err: Error) => void;
  }[]>();

  private scheduled = false;

  async load(id: string): Promise<User> {
    return new Promise((resolve, reject) => {
      if (!this.pending.has(id)) {
        this.pending.set(id, []);
      }
      this.pending.get(id)!.push({ resolve, reject });

      if (!this.scheduled) {
        this.scheduled = true;
        // Batch all loads in this tick into a single query
        process.nextTick(() => this.dispatch());
      }
    });
  }

  private async dispatch(): Promise<void> {
    const ids = Array.from(this.pending.keys());
    const callbacks = new Map(this.pending);
    this.pending.clear();
    this.scheduled = false;

    try {
      // Single query for all requested IDs
      const users = await db.query(
        'SELECT * FROM users WHERE id = ANY($1)',
        [ids]
      );

      const userMap = new Map(users.rows.map(u => [u.id, u]));

      for (const [id, cbs] of callbacks) {
        const user = userMap.get(id);
        if (user) {
          cbs.forEach(cb => cb.resolve(user));
        } else {
          cbs.forEach(cb => cb.reject(new Error(`User ${id} not found`)));
        }
      }
    } catch (error) {
      for (const [, cbs] of callbacks) {
        cbs.forEach(cb => cb.reject(error as Error));
      }
    }
  }
}

// Usage: these three calls result in ONE database query
const loader = new UserLoader();
const [user1, user2, user3] = await Promise.all([
  loader.load('id-1'),
  loader.load('id-2'),
  loader.load('id-3'),
]);
```

## Pattern 4: Pagination

Never return unbounded result sets. Always paginate.

### Offset-Based Pagination

```typescript
// Simple but has performance problems at large offsets
async function getUsers(page: number, pageSize: number = 20): Promise<User[]> {
  const offset = (page - 1) * pageSize;

  const result = await db.query(
    'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [pageSize, offset]
  );

  return result.rows;
}

// Problem: OFFSET 100000 means the database must scan and skip 100,000 rows
// Page 1:     OFFSET 0      → scan 20 rows     → fast
// Page 100:   OFFSET 1980   → scan 2000 rows   → OK
// Page 5000:  OFFSET 99980  → scan 100,000 rows → SLOW
```

**When offset pagination is acceptable:**
- Small datasets (< 10K rows)
- Users rarely paginate past page 10
- UI shows page numbers (1, 2, 3, ..., N)

### Cursor-Based Pagination

```typescript
// Uses the last item's sort key as a cursor — constant time regardless of page
interface PaginatedResult<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}

async function getUsers(
  cursor: string | null,
  pageSize: number = 20
): Promise<PaginatedResult<User>> {
  let query: string;
  let params: any[];

  if (cursor) {
    // Decode cursor (e.g., base64-encoded timestamp + id)
    const { timestamp, id } = decodeCursor(cursor);
    query = `
      SELECT * FROM users
      WHERE (created_at, id) < ($1, $2)
      ORDER BY created_at DESC, id DESC
      LIMIT $3
    `;
    params = [timestamp, id, pageSize + 1];
  } else {
    query = `
      SELECT * FROM users
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `;
    params = [pageSize + 1];
  }

  const result = await db.query(query, params);
  const hasMore = result.rows.length > pageSize;
  const items = result.rows.slice(0, pageSize);

  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem
    ? encodeCursor({ timestamp: lastItem.created_at, id: lastItem.id })
    : null;

  return { items, cursor: nextCursor, hasMore };
}

function encodeCursor(data: { timestamp: string; id: string }): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function decodeCursor(cursor: string): { timestamp: string; id: string } {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString());
}
```

**Why cursor pagination is fast:**

The query `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20` uses the index on `(created_at, id)` to seek directly to the cursor position. It never scans skipped rows. Whether you are on "page 1" or "page 5000", the database does the same amount of work.

### Comparison

| Feature | Offset Pagination | Cursor Pagination |
|---------|-------------------|-------------------|
| Performance at depth | O(offset + limit) | O(limit) — constant |
| Jump to arbitrary page | Yes (page N) | No (sequential only) |
| Consistent with real-time data | No (inserts shift pages) | Yes (stable cursor) |
| Implementation complexity | Simple | Moderate |
| UI pattern | Page numbers | "Load more" / infinite scroll |
| API design | `?page=5&size=20` | `?cursor=abc&size=20` |

## Pattern 5: Early Termination

Stop processing as soon as you have the answer.

```typescript
// BAD: Processes all items even after finding the answer
function hasAdmin(users: User[]): boolean {
  return users.filter(u => u.role === 'admin').length > 0;
  // filter() scans ALL users, creates a new array, THEN checks length
}

// GOOD: Stops at first match
function hasAdmin(users: User[]): boolean {
  return users.some(u => u.role === 'admin');
  // some() stops as soon as it finds one admin
}

// GOOD: Short-circuit in complex validations
function isValid(data: ComplexData): boolean {
  // Cheapest checks first — fail fast
  if (!data) return false;                          // O(1)
  if (!data.id) return false;                       // O(1)
  if (data.items.length > MAX_ITEMS) return false;  // O(1)

  // Moderate checks next
  if (!isValidEmail(data.email)) return false;      // O(n) on email length

  // Most expensive check last — only runs if everything else passed
  if (!isUniqueInDatabase(data.id)) return false;   // O(1) but network round-trip

  return true;
}
```

## Choosing the Right Data Structure

| Need | Data Structure | Operation Costs |
|------|---------------|-----------------|
| Fast lookup by key | `Map` / `Object` | Get: O(1), Set: O(1) |
| Fast membership test | `Set` | Has: O(1), Add: O(1) |
| Ordered iteration | Array | Access: O(1), Search: O(n) |
| Sorted data + range queries | Sorted array + binary search | Search: O(log n), Insert: O(n) |
| Priority queue | Binary heap | Insert: O(log n), Extract min: O(log n) |
| FIFO queue | Linked list or circular buffer | Enqueue/Dequeue: O(1) |
| LRU cache | Map + doubly-linked list | Get/Set/Evict: O(1) |
| Prefix matching | Trie | Search: O(m) where m = key length |
| Counting occurrences | Map<string, number> | Increment: O(1) |

### Practical Example: Replacing O(n) Lookups

```typescript
// BAD: O(n) lookup on every request
const users: User[] = await loadAllUsers();

function findUser(id: string): User | undefined {
  return users.find(u => u.id === id); // O(n) scan
}

// GOOD: O(1) lookup with a Map
const userMap = new Map<string, User>(
  users.map(u => [u.id, u])
);

function findUser(id: string): User | undefined {
  return userMap.get(id); // O(1) lookup
}

// If you do this for 10,000 lookups on 100,000 users:
// Array.find: 10,000 * 100,000 / 2 = 500M operations
// Map.get:    10,000 * 1 = 10,000 operations
// 50,000x improvement
```

---

> *"The best optimization is the one that eliminates work entirely. The second best is the one that does work once instead of n times."*
