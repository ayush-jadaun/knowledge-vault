---
title: "Stream Processing State Management"
description: "Keyed state, operator state, state backends, RocksDB tuning, and state migration strategies"
tags: [stream-processing, state-management, rocksdb, flink, checkpointing]
difficulty: "advanced"
prerequisites: [exactly-once-processing, windowing]
lastReviewed: "2026-03-18"
---

# Stream Processing State Management

## Why State Management Exists

Stateless stream processing is trivial — apply a function to each element independently. But most useful streaming operations are stateful:

- **Aggregations:** Sum, count, average over a window
- **Joins:** Match events from two streams within a time window
- **Pattern detection:** Identify sequences of events (CEP)
- **Deduplication:** Track seen event IDs
- **Session tracking:** Maintain per-user session state

Without managed state, operators would need to query external databases for every event, destroying throughput (network round-trips dominate). Managed state colocates computation and data, enabling millions of stateful operations per second.

### Historical Context

Early stream processors (Storm) had no built-in state management — users implemented their own using Redis or Cassandra. This was error-prone and impossible to make consistent with processing semantics. Apache Samza (2014) introduced local state stores backed by RocksDB. Flink (2015) formalized managed state with automatic checkpointing and exactly-once guarantees. Today, managed state is a core feature of every production stream processor.

## First Principles

### State Categories

Stream processing state falls into two categories:

```mermaid
graph TD
    S[Managed State] --> KS[Keyed State]
    S --> OS[Operator State]

    KS --> VS[ValueState - single value per key]
    KS --> LS[ListState - list per key]
    KS --> MS[MapState - map per key]
    KS --> RS[ReducingState - aggregating value]
    KS --> AS[AggregatingState - accumulator per key]

    OS --> LOS[ListState - partitioned lists]
    OS --> UOS[UnionListState - broadcast on restore]
    OS --> BOS[BroadcastState - same state on all parallel instances]
```

**Keyed state** is partitioned by key. Each key has its own isolated state that is only accessible when processing elements with that key. This enables:
- Automatic key-based partitioning across parallel instances
- No synchronization needed between keys
- Horizontal scalability

**Operator state** is bound to an operator instance, not a key. Used for:
- Source offsets (Kafka consumer positions)
- Buffer state
- Global counters

### State Partitioning

In a parallel stream processor, keyed state is distributed across operator instances by key:

$$
\text{instance}(k) = \text{hash}(k) \bmod P
$$

where $P$ is the parallelism (number of instances).

```mermaid
graph LR
    subgraph "Input Stream (keyed by user_id)"
        E1["user_id=A"]
        E2["user_id=B"]
        E3["user_id=A"]
        E4["user_id=C"]
    end

    subgraph "Operator Instance 0 (keys: A, C)"
        S0["State: A -> count=2, C -> count=1"]
    end

    subgraph "Operator Instance 1 (keys: B)"
        S1["State: B -> count=1"]
    end

    E1 --> S0
    E2 --> S1
    E3 --> S0
    E4 --> S0
```

## Core State Interfaces

### Keyed State Types

```typescript
// Core state interfaces
interface ValueState<T> {
  value(): T | null;
  update(value: T): void;
  clear(): void;
}

interface ListState<T> {
  get(): Iterable<T>;
  add(value: T): void;
  addAll(values: T[]): void;
  update(values: T[]): void;
  clear(): void;
}

interface MapState<K, V> {
  get(key: K): V | null;
  put(key: K, value: V): void;
  putAll(entries: Map<K, V>): void;
  remove(key: K): void;
  contains(key: K): boolean;
  keys(): Iterable<K>;
  values(): Iterable<V>;
  entries(): Iterable<[K, V]>;
  isEmpty(): boolean;
  clear(): void;
}

interface ReducingState<T> {
  get(): T | null;
  add(value: T): void; // Applies the reduce function
  clear(): void;
}

interface AggregatingState<IN, OUT> {
  get(): OUT | null;
  add(value: IN): void; // Applies the aggregate function
  clear(): void;
}

// State descriptor — metadata for state registration
interface StateDescriptor<T> {
  name: string;
  defaultValue: T;
  serializer?: Serializer<T>;
  ttlConfig?: StateTtlConfig;
}

interface StateTtlConfig {
  ttl: number; // milliseconds
  updateType: 'OnCreateAndWrite' | 'OnReadAndWrite';
  stateVisibility: 'NeverReturnExpired' | 'ReturnExpiredIfNotCleanedUp';
  cleanupStrategy: 'FullSnapshot' | 'IncrementalCleanup' | 'RocksdbCompaction';
}
```

### Practical Stateful Operator

```typescript
interface RuntimeContext {
  getState<T>(descriptor: StateDescriptor<T>): ValueState<T>;
  getListState<T>(descriptor: StateDescriptor<T[]>): ListState<T>;
  getMapState<K, V>(descriptor: StateDescriptor<Map<K, V>>): MapState<K, V>;
  getReducingState<T>(
    descriptor: StateDescriptor<T>,
    reducer: (a: T, b: T) => T,
  ): ReducingState<T>;
}

class UserSessionTracker {
  private sessionState!: ValueState<UserSession>;
  private eventBuffer!: ListState<SessionEvent>;
  private featureMap!: MapState<string, number>;

  open(ctx: RuntimeContext): void {
    this.sessionState = ctx.getState<UserSession>({
      name: 'session',
      defaultValue: { startTime: 0, eventCount: 0, totalDuration: 0 },
      ttlConfig: {
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        updateType: 'OnCreateAndWrite',
        stateVisibility: 'NeverReturnExpired',
        cleanupStrategy: 'RocksdbCompaction',
      },
    });

    this.eventBuffer = ctx.getListState<SessionEvent>({
      name: 'events',
      defaultValue: [],
    });

    this.featureMap = ctx.getMapState<string, number>({
      name: 'features',
      defaultValue: new Map(),
    });
  }

  processElement(event: SessionEvent): SessionOutput | null {
    const session = this.sessionState.value() ?? {
      startTime: event.timestamp,
      eventCount: 0,
      totalDuration: 0,
    };

    session.eventCount += 1;
    session.totalDuration = event.timestamp - session.startTime;

    // Track feature usage
    const currentCount = this.featureMap.get(event.feature) ?? 0;
    this.featureMap.put(event.feature, currentCount + 1);

    // Buffer events for pattern detection
    this.eventBuffer.add(event);

    this.sessionState.update(session);

    // Emit session summary every 100 events
    if (session.eventCount % 100 === 0) {
      return {
        sessionDuration: session.totalDuration,
        eventCount: session.eventCount,
        topFeatures: this.getTopFeatures(5),
      };
    }
    return null;
  }

  private getTopFeatures(n: number): Array<[string, number]> {
    const features: Array<[string, number]> = [];
    for (const [key, value] of this.featureMap.entries()) {
      features.push([key, value]);
    }
    return features.sort((a, b) => b[1] - a[1]).slice(0, n);
  }
}

interface UserSession {
  startTime: number;
  eventCount: number;
  totalDuration: number;
}

interface SessionEvent {
  userId: string;
  feature: string;
  timestamp: number;
}

interface SessionOutput {
  sessionDuration: number;
  eventCount: number;
  topFeatures: Array<[string, number]>;
}
```

## State Backends

### Architecture Overview

```mermaid
graph TD
    subgraph "Application Layer"
        OP[Operator] --> SA[State Access API]
    end

    subgraph "State Backend"
        SA --> HSB[HashMapStateBackend]
        SA --> RSB[RocksDBStateBackend]
    end

    subgraph "Checkpoint Storage"
        HSB --> CS[Checkpoint Storage]
        RSB --> CS
        CS --> S3[S3 / HDFS / GCS]
    end

    subgraph "Local Storage"
        RSB --> SSD[Local SSD]
    end
```

### HashMapStateBackend (Heap-Based)

State is stored in Java/JVM HashMap objects on the heap.

**Characteristics:**
- **Speed:** Fastest access — direct object references
- **Capacity:** Limited by JVM heap size (typically 1-16 GB useful)
- **Serialization:** Only during checkpoints
- **GC pressure:** High for large state (GC pauses)

```typescript
class HeapStateBackend<K, V> {
  private state: Map<string, Map<K, V>> = new Map();

  getOrCreateNamespace(namespace: string): Map<K, V> {
    let ns = this.state.get(namespace);
    if (!ns) {
      ns = new Map();
      this.state.set(namespace, ns);
    }
    return ns;
  }

  get(namespace: string, key: K): V | undefined {
    return this.state.get(namespace)?.get(key);
  }

  put(namespace: string, key: K, value: V): void {
    this.getOrCreateNamespace(namespace).set(key, value);
  }

  delete(namespace: string, key: K): void {
    this.state.get(namespace)?.delete(key);
  }

  /**
   * Snapshot all state for checkpointing.
   * BLOCKS processing during serialization for heap backend.
   */
  snapshot(): Map<string, Map<K, V>> {
    // Deep copy — this is the expensive part
    const copy = new Map<string, Map<K, V>>();
    for (const [ns, map] of this.state) {
      copy.set(ns, new Map(map));
    }
    return copy;
  }

  getMemoryUsage(): number {
    let size = 0;
    for (const [, map] of this.state) {
      size += map.size; // Approximate — actual memory depends on object sizes
    }
    return size;
  }
}
```

### RocksDB State Backend

State is stored in RocksDB — an embedded key-value store that uses LSM trees with SSD storage.

**Characteristics:**
- **Speed:** Slower than heap (serialization on every access)
- **Capacity:** Limited only by disk space (terabytes)
- **Serialization:** On every read/write
- **GC pressure:** Minimal — data lives outside the heap
- **Checkpointing:** Incremental (SST file upload)

```typescript
interface RocksDBConfig {
  // Memory management
  blockCacheSize: number;        // Read cache (default: 8 MB per slot)
  writeBufferSize: number;       // Write buffer (default: 64 MB)
  writeBufferCount: number;      // Number of write buffers (default: 2)
  maxOpenFiles: number;          // File handle limit (default: -1 = unlimited)

  // Compaction
  compactionStyle: 'level' | 'universal' | 'fifo';
  targetFileSizeBase: number;    // SST file target size (default: 64 MB)
  maxBytesForLevelBase: number;  // L1 size limit (default: 256 MB)
  levelCompactionDynamicLevelBytes: boolean;

  // Performance tuning
  bloomFilterBitsPerKey: number; // Bloom filter bits (default: 10)
  blockSize: number;             // Block size in SST files (default: 4 KB)
  compressionType: 'none' | 'snappy' | 'lz4' | 'zstd';
}

const productionRocksDBConfig: RocksDBConfig = {
  blockCacheSize: 256 * 1024 * 1024,     // 256 MB block cache
  writeBufferSize: 128 * 1024 * 1024,    // 128 MB write buffer
  writeBufferCount: 3,
  maxOpenFiles: 5000,
  compactionStyle: 'level',
  targetFileSizeBase: 128 * 1024 * 1024,
  maxBytesForLevelBase: 512 * 1024 * 1024,
  levelCompactionDynamicLevelBytes: true,
  bloomFilterBitsPerKey: 10,
  blockSize: 16 * 1024,                  // 16 KB blocks
  compressionType: 'lz4',
};
```

### RocksDB LSM Tree Internals

```mermaid
graph TD
    subgraph "Write Path"
        W[Write] --> WB[Write Buffer / MemTable]
        WB -->|Full| IMM[Immutable MemTable]
        IMM -->|Flush| L0[Level 0 SST Files]
    end

    subgraph "Compaction"
        L0 -->|Compaction| L1[Level 1]
        L1 -->|Compaction| L2[Level 2]
        L2 -->|Compaction| L3[Level 3]
    end

    subgraph "Read Path"
        R[Read] --> WB
        R --> IMM
        R --> BF[Bloom Filters]
        BF --> L0
        BF --> L1
        BF --> L2
    end

    subgraph "Block Cache"
        BC[LRU Block Cache]
        L0 -.-> BC
        L1 -.-> BC
        L2 -.-> BC
    end
```

**Write amplification:**

$$
\text{Write Amplification} = \frac{\text{bytes written to disk}}{\text{bytes written by application}}
$$

For level compaction:

$$
WA \approx 1 + \frac{\text{size\_ratio} \times (\text{num\_levels} - 1)}{1} \approx 10\text{-}30\times
$$

**Read amplification:**

$$
\text{Read Amplification} = L_0\text{ files} + \text{num\_levels} \approx 5\text{-}15 \text{ reads}
$$

Bloom filters reduce this dramatically:

$$
\text{Read Amplification}_{\text{bloom}} \approx 1 + \text{FPR} \times (\text{num\_levels} - 1)
$$

With FPR (false positive rate) at 1%: $\approx 1.05$ reads on average for point queries.

### State Backend Comparison

| Metric | HeapStateBackend | RocksDBStateBackend |
|--------|-----------------|-------------------|
| Read latency | ~10 ns | ~1-10 us (100-1000x slower) |
| Write latency | ~10 ns | ~1-10 us |
| Max state size | ~16 GB (heap) | Terabytes (disk) |
| Checkpoint type | Full only | Incremental |
| Checkpoint speed | Slow (serialize all) | Fast (upload new SSTs) |
| GC impact | Severe at >4 GB | Negligible |
| CPU overhead | Minimal | Serialization on every access |

::: tip
**Rule of thumb:** Use HeapStateBackend if state fits in 2-4 GB per TaskManager. Use RocksDB for anything larger. In production, RocksDB is almost always the right choice due to incremental checkpoints and predictable memory usage.
:::

## State TTL (Time-To-Live)

State that is never cleaned up grows unboundedly. TTL automatically expires old state:

```typescript
class StateTTLManager<K, V> {
  private state: Map<K, { value: V; lastAccess: number; lastWrite: number }> =
    new Map();

  constructor(
    private readonly ttlMs: number,
    private readonly updateType: 'OnCreateAndWrite' | 'OnReadAndWrite',
  ) {}

  get(key: K): V | null {
    const entry = this.state.get(key);
    if (!entry) return null;

    const now = Date.now();
    const relevantTime =
      this.updateType === 'OnReadAndWrite'
        ? entry.lastAccess
        : entry.lastWrite;

    if (now - relevantTime > this.ttlMs) {
      this.state.delete(key);
      return null; // Expired
    }

    if (this.updateType === 'OnReadAndWrite') {
      entry.lastAccess = now;
    }

    return entry.value;
  }

  put(key: K, value: V): void {
    const now = Date.now();
    this.state.set(key, {
      value,
      lastAccess: now,
      lastWrite: now,
    });
  }

  /**
   * Background cleanup — run periodically to reclaim memory.
   * Incremental: process N entries per invocation to avoid latency spikes.
   */
  incrementalCleanup(maxEntriesToProcess: number): number {
    const now = Date.now();
    let processed = 0;
    let cleaned = 0;

    for (const [key, entry] of this.state) {
      if (processed >= maxEntriesToProcess) break;

      const relevantTime =
        this.updateType === 'OnReadAndWrite'
          ? entry.lastAccess
          : entry.lastWrite;

      if (now - relevantTime > this.ttlMs) {
        this.state.delete(key);
        cleaned++;
      }
      processed++;
    }

    return cleaned;
  }
}
```

### TTL Cleanup Strategies

| Strategy | When Cleanup Runs | Latency Impact | Completeness |
|----------|------------------|----------------|-------------|
| Full Snapshot | During checkpoint | High spike | Complete |
| Incremental | Per-record (N entries) | Low per-record | Gradual |
| RocksDB Compaction | During compaction | Background | Complete |

## State Migration & Schema Evolution

### Rescaling State

When changing parallelism, state must be redistributed:

```mermaid
graph LR
    subgraph "Before (parallelism=2)"
        P0["Instance 0: keys {A,C,E}"]
        P1["Instance 1: keys {B,D,F}"]
    end

    subgraph "After (parallelism=3)"
        Q0["Instance 0: keys {A,D}"]
        Q1["Instance 1: keys {B,E}"]
        Q2["Instance 2: keys {C,F}"]
    end

    P0 -.-> Q0
    P0 -.-> Q1
    P0 -.-> Q2
    P1 -.-> Q0
    P1 -.-> Q1
    P1 -.-> Q2
```

**Keyed state rescaling:** Key groups are redistributed. Each key group maps to exactly one operator instance:

$$
\text{key\_group}(k) = \text{hash}(k) \bmod \text{max\_parallelism}
$$

$$
\text{instance}(kg) = \left\lfloor \frac{kg \times P}{\text{max\_parallelism}} \right\rfloor
$$

where $P$ is the current parallelism and max_parallelism is the configured upper bound.

### State Schema Evolution

When the state schema changes (e.g., adding a field), the system must migrate existing state:

```typescript
// Version 1 state schema
interface UserStateV1 {
  version: 1;
  userId: string;
  loginCount: number;
}

// Version 2 state schema (added lastLogin field)
interface UserStateV2 {
  version: 2;
  userId: string;
  loginCount: number;
  lastLogin: number; // NEW FIELD
}

// Version 3 (renamed field, added email)
interface UserStateV3 {
  version: 3;
  userId: string;
  totalLogins: number; // RENAMED from loginCount
  lastLogin: number;
  email: string | null; // NEW FIELD
}

type UserState = UserStateV1 | UserStateV2 | UserStateV3;

class StateMigrator {
  migrate(state: UserState): UserStateV3 {
    let current: UserState = state;

    if (current.version === 1) {
      current = this.v1ToV2(current);
    }
    if (current.version === 2) {
      current = this.v2ToV3(current);
    }

    return current as UserStateV3;
  }

  private v1ToV2(state: UserStateV1): UserStateV2 {
    return {
      version: 2,
      userId: state.userId,
      loginCount: state.loginCount,
      lastLogin: 0, // Default value for new field
    };
  }

  private v2ToV3(state: UserStateV2): UserStateV3 {
    return {
      version: 3,
      userId: state.userId,
      totalLogins: state.loginCount, // Renamed field
      lastLogin: state.lastLogin,
      email: null, // Default value
    };
  }
}
```

## Performance Characteristics

### State Access Patterns

The performance of state access depends heavily on access patterns:

| Pattern | HeapBackend | RocksDB | Recommendation |
|---------|-------------|---------|----------------|
| Point lookup | O(1) ~10ns | O(1) ~5us | Heap if small |
| Range scan | O(n) | O(n) but sorted | RocksDB |
| High write rate | O(1) ~10ns | O(1) ~5us amortized | Either |
| Large values | GC pressure | Efficient | RocksDB |
| Many small keys | Fine | Key overhead | Merge state |

### Memory Budget Calculation

For RocksDB state backend:

$$
\text{Memory}_{\text{total}} = \text{block\_cache} + \text{write\_buffers} + \text{index\_filters}
$$

$$
\text{write\_buffers} = \text{write\_buffer\_size} \times \text{write\_buffer\_count} \times \text{state\_count}
$$

$$
\text{index\_filters} \approx 0.05 \times \text{total\_state\_size}
$$

Example: 10 GB state, 128 MB write buffer, 2 buffers, 3 state descriptors:

$$
\text{write\_buffers} = 128 \text{ MB} \times 2 \times 3 = 768 \text{ MB}
$$

$$
\text{index\_filters} = 0.05 \times 10 \text{ GB} = 512 \text{ MB}
$$

$$
\text{block\_cache} = 256 \text{ MB (configured)}
$$

$$
\text{Total} = 256 + 768 + 512 = 1,536 \text{ MB} = 1.5 \text{ GB}
$$

::: warning
RocksDB memory usage can exceed expectations. The managed memory fraction in Flink controls the total RocksDB memory budget. Set `state.backend.rocksdb.memory.managed: true` to let Flink manage it.
:::

### Serialization Overhead

RocksDB requires serialization on every state access:

$$
\text{Overhead}_{\text{per\_access}} = T_{\text{serialize}} + T_{\text{rocksdb}} + T_{\text{deserialize}}
$$

For a typical 100-byte state value:

$$
T_{\text{serialize}} \approx 200\text{ ns}
$$

$$
T_{\text{rocksdb}} \approx 3\text{ us (cache hit)} \text{ or } 50\text{ us (cache miss)}
$$

$$
T_{\text{deserialize}} \approx 200\text{ ns}
$$

**Optimization: Reduce serialization frequency**

```typescript
class BatchedStateAccessor<K, V> {
  private localCache: Map<K, V> = new Map();
  private dirty: Set<K> = new Set();

  constructor(private readonly backend: MapState<K, V>) {}

  get(key: K): V | null {
    // Check local cache first
    if (this.localCache.has(key)) {
      return this.localCache.get(key)!;
    }
    // Cache miss: go to RocksDB
    const value = this.backend.get(key);
    if (value !== null) {
      this.localCache.set(key, value);
    }
    return value;
  }

  put(key: K, value: V): void {
    this.localCache.set(key, value);
    this.dirty.add(key);
  }

  /**
   * Flush dirty entries to backend.
   * Call at the end of processing each element.
   */
  flush(): void {
    for (const key of this.dirty) {
      const value = this.localCache.get(key);
      if (value !== undefined) {
        this.backend.put(key, value);
      }
    }
    this.dirty.clear();
    // Optionally evict cache entries to limit memory
    if (this.localCache.size > 10000) {
      this.localCache.clear();
    }
  }
}
```

## Edge Cases & Failure Modes

### State Size Explosion

**Symptom:** Checkpoint size grows linearly over time, eventually causing timeouts.

**Common causes:**
1. Missing TTL configuration
2. Session windows that never close
3. Deduplication state without expiry
4. ListState that only appends, never truncates

```typescript
class StateMonitor {
  private stateSizeHistory: Array<{ timestamp: number; sizeBytes: number }> = [];

  recordCheckpointSize(sizeBytes: number): void {
    this.stateSizeHistory.push({ timestamp: Date.now(), sizeBytes });
  }

  detectGrowthAnomaly(): {
    isGrowing: boolean;
    growthRatePerHour: number;
    estimatedTimeToLimit: number;
  } {
    if (this.stateSizeHistory.length < 10) {
      return { isGrowing: false, growthRatePerHour: 0, estimatedTimeToLimit: Infinity };
    }

    const recent = this.stateSizeHistory.slice(-10);
    const oldest = recent[0];
    const newest = recent[recent.length - 1];

    const durationHours =
      (newest.timestamp - oldest.timestamp) / (3600 * 1000);
    const growthRatePerHour =
      (newest.sizeBytes - oldest.sizeBytes) / durationHours;

    const stateLimit = 100 * 1024 * 1024 * 1024; // 100 GB
    const estimatedTimeToLimit =
      growthRatePerHour > 0
        ? (stateLimit - newest.sizeBytes) / growthRatePerHour
        : Infinity;

    return {
      isGrowing: growthRatePerHour > 1024 * 1024, // Growing > 1 MB/hour
      growthRatePerHour,
      estimatedTimeToLimit,
    };
  }
}
```

### Hot Keys

When a few keys receive disproportionate traffic, the operator instances handling those keys become bottlenecks:

$$
\text{Skew factor} = \frac{\max_i(\text{events for instance } i)}{\text{avg events per instance}}
$$

A skew factor > 3 indicates a hot key problem.

**Mitigation: Key splitting**

```typescript
class HotKeyDetector<K> {
  private keyCounts: Map<string, number> = new Map();
  private totalCount: number = 0;

  recordKey(key: K): void {
    const keyStr = String(key);
    this.keyCounts.set(keyStr, (this.keyCounts.get(keyStr) ?? 0) + 1);
    this.totalCount++;
  }

  getHotKeys(thresholdMultiplier: number): string[] {
    const avgCount = this.totalCount / this.keyCounts.size;
    const threshold = avgCount * thresholdMultiplier;

    const hotKeys: string[] = [];
    for (const [key, count] of this.keyCounts) {
      if (count > threshold) {
        hotKeys.push(key);
      }
    }
    return hotKeys;
  }

  /**
   * Split a hot key into N sub-keys for parallel processing.
   * Requires a combine step to merge results.
   */
  static splitKey<K>(key: K, numSplits: number): Array<{ originalKey: K; splitId: number }> {
    return Array.from({ length: numSplits }, (_, i) => ({
      originalKey: key,
      splitId: i,
    }));
  }
}
```

### Corrupted State

State corruption can occur due to serialization bugs, version mismatches, or storage failures:

```typescript
class StateValidator<T> {
  constructor(
    private readonly validate: (state: T) => boolean,
    private readonly repair: (state: T) => T,
  ) {}

  accessWithValidation(state: ValueState<T>): T | null {
    const value = state.value();
    if (value === null) return null;

    if (!this.validate(value)) {
      console.error('Corrupted state detected, attempting repair');
      const repaired = this.repair(value);
      state.update(repaired);
      return repaired;
    }

    return value;
  }
}

// Example: validate that counts are non-negative
const counterValidator = new StateValidator<{ count: number }>(
  (state) => state.count >= 0,
  (state) => ({ count: Math.max(0, state.count) }),
);
```

## Mathematical Foundations

### State Consistency Model

For a stream processing system with state, the consistency model is defined by:

**Sequential consistency:** The result of execution is the same as if all operations were executed in some sequential order, consistent with the program order of each individual operator.

$$
\forall \text{op}_1, \text{op}_2: \text{op}_1 \prec \text{op}_2 \implies S(\text{op}_1) \text{ happens before } S(\text{op}_2)
$$

where $\prec$ is the happens-before relation.

With checkpointing:

$$
C_n \text{ is consistent} \iff \forall \text{op}_i, \text{op}_j: \text{the state snapshot is a consistent cut}
$$

### State Space Complexity

For keyed state with $K$ keys, each with state size $s$:

$$
\text{Total state} = K \times s + O(K) \text{ (metadata overhead)}
$$

For window state:

$$
\text{Window state} = K \times W \times \text{avg\_elements\_per\_window} \times \text{element\_size}
$$

where $W$ is the average number of active windows per key.

## Real-World War Stories

::: info War Story
**The 2 TB State Nightmare**

A ride-sharing company maintained per-driver state including location history, current ride details, and driver score. With 5 million active drivers and growing state per driver, the total state grew to 2 TB.

Problems:
1. Checkpoints took 15 minutes (even incremental)
2. Rescaling required 45 minutes of downtime
3. Recovery from failure took 20 minutes

**Solution:**
1. Split state into "hot" (current ride) and "cold" (historical) paths
2. Hot state in Flink: ~50 GB
3. Cold state offloaded to async writes to DynamoDB
4. Checkpoint duration dropped to 30 seconds
5. Recovery time: 2 minutes
:::

::: info War Story
**The Serializer That Ate Throughput**

A team processing 2 million events/second noticed throughput dropped to 500K after enabling RocksDB state backend. Profiling revealed that 70% of CPU time was spent in serialization.

**Root cause:** They used JSON serialization for state. Each state access serialized/deserialized complex nested objects.

**Fix:** Switched to a binary serializer (Avro) and flattened the state schema. Throughput recovered to 1.8M events/second.

Serialization benchmark:
- JSON: 50 us per object
- Avro: 2 us per object
- Protobuf: 1.5 us per object
- Custom binary: 0.5 us per object
:::

## Decision Framework

### Choosing a State Backend

```mermaid
graph TD
    A{Total state size?} -->|< 2 GB| B[HeapStateBackend]
    A -->|2-16 GB| C{GC tolerance?}
    A -->|> 16 GB| D[RocksDB]

    C -->|Can tune GC| E[HeapStateBackend + G1GC tuning]
    C -->|No GC pauses| D

    D --> F{Incremental checkpoints?}
    F -->|Yes| G[RocksDB + Incremental]
    F -->|No| H[RocksDB + Full - NOT recommended]
```

## Advanced Topics

### Queryable State

Expose streaming state for external queries without going through a database:

```typescript
interface QueryableStateServer {
  register(stateName: string, state: MapState<string, unknown>): void;
  query(stateName: string, key: string): Promise<unknown>;
}

class SimpleQueryableState implements QueryableStateServer {
  private states: Map<string, MapState<string, unknown>> = new Map();

  register(stateName: string, state: MapState<string, unknown>): void {
    this.states.set(stateName, state);
  }

  async query(stateName: string, key: string): Promise<unknown> {
    const state = this.states.get(stateName);
    if (!state) throw new Error(`Unknown state: ${stateName}`);
    return state.get(key);
  }
}
```

::: warning
Queryable state provides stale reads (eventual consistency). The result reflects the state at the last checkpoint, not the current processing position.
:::

### State Processor API

For advanced state manipulation (migration, cleanup, analysis):

```typescript
interface StateProcessor<K, V> {
  process(key: K, value: V, context: StateProcessorContext): V | null;
}

interface StateProcessorContext {
  currentKey(): unknown;
  timestamp(): number;
  delete(): void;
}

// Example: Bulk cleanup of expired state
class ExpiredStateCleanup implements StateProcessor<string, UserStateV3> {
  process(
    _key: string,
    value: UserStateV3,
    context: StateProcessorContext,
  ): UserStateV3 | null {
    const now = context.timestamp();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    if (now - value.lastLogin > thirtyDays) {
      context.delete();
      return null;
    }

    return value;
  }
}
```

### Research: Disaggregated State

Current state backends colocate state with compute. Research systems (S-Store, Saber) explore disaggregated state where state lives on separate storage nodes:

$$
\text{Access latency}_{\text{disaggregated}} = \text{network RTT} + \text{storage access}
$$

$$
\approx 100\text{ us (RDMA)} + 10\text{ us (NVMe)} = 110\text{ us}
$$

Compared to colocated RocksDB: ~5 us. The 22x latency increase is offset by:
- Independent scaling of compute and storage
- Instant rescaling (no state migration)
- Better resource utilization

This is the direction Flink's remote state backend research is heading.

## Cross-References

- [Exactly-Once Processing](./exactly-once-processing.md) — State consistency during checkpointing
- [Windowing](./windowing.md) — Window state management
- [Backpressure](./backpressure.md) — State growth under backpressure
- [Schema Evolution](../data-modeling/schema-evolution.md) — State schema evolution patterns
