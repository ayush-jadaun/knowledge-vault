---
title: "Node.js Profiling"
description: "Complete guide to profiling Node.js applications — V8 CPU profiler, Chrome DevTools integration, heap snapshots for memory leak detection, flame graphs with 0x and Clinic.js, async_hooks for async profiling, and production profiling strategies"
tags: [nodejs, profiling, v8, flame-graphs, heap-snapshots, memory-leaks, 0x, clinicjs, async-hooks, chrome-devtools]
difficulty: advanced
prerequisites: [performance/profiling]
lastReviewed: "2026-03-17"
---

# Node.js Profiling

Node.js runs on V8, Google's JavaScript engine, which provides built-in profiling capabilities that are more powerful than most developers realize. This page covers every profiling technique available for Node.js, from zero-overhead sampling to deep heap analysis, with real-world examples of finding and fixing performance problems in production.

## CPU Profiling with the V8 Profiler

### The `--inspect` Flag

The simplest way to profile a Node.js application is to start it with the `--inspect` flag and connect Chrome DevTools.

```bash
# Start with inspector
node --inspect server.js

# Start but wait for debugger to attach before running
node --inspect-brk server.js

# Specify a custom port (useful when running multiple Node processes)
node --inspect=0.0.0.0:9230 server.js
```

When you start with `--inspect`, Node.js opens a WebSocket server on port 9229 (default). Open `chrome://inspect` in Chrome, and your Node.js process appears under "Remote Target."

::: warning Security
Never expose `--inspect` to the public internet. The inspector protocol allows arbitrary code execution. In production, bind to `127.0.0.1` (the default) and use SSH tunneling to access it remotely:

```bash
# On your local machine, forward port 9229 from the remote server
ssh -L 9229:127.0.0.1:9229 user@production-server
```
:::

### Recording a CPU Profile

Once Chrome DevTools is connected:

1. Go to the **Performance** tab (or **Profiler** tab in older versions).
2. Click **Record**.
3. Run your workload (send requests, trigger the slow operation).
4. Click **Stop**.

The result is a flame chart — a visualization of the call stack over time.

### Programmatic CPU Profiling

For automated profiling (e.g., in CI or triggered by an alert), use the `v8-profiler-next` package or the built-in `inspector` module:

```typescript
import { Session } from 'node:inspector/promises';
import { writeFileSync } from 'node:fs';

async function profileCPU(durationMs: number): Promise<void> {
  const session = new Session();
  session.connect();

  await session.post('Profiler.enable');
  await session.post('Profiler.start');

  // Let the application run for the specified duration
  await new Promise(resolve => setTimeout(resolve, durationMs));

  const { profile } = await session.post('Profiler.stop');

  // Save as .cpuprofile — can be loaded in Chrome DevTools
  writeFileSync(
    `profile-${Date.now()}.cpuprofile`,
    JSON.stringify(profile)
  );

  await session.post('Profiler.disable');
  session.disconnect();
}

// Profile for 30 seconds when triggered via an API endpoint
app.post('/debug/profile', async (req, res) => {
  const duration = Math.min(req.body.duration || 30000, 60000);
  profileCPU(duration);
  res.json({ message: `Profiling for ${duration}ms` });
});
```

The `.cpuprofile` file can be loaded directly in Chrome DevTools (Performance tab > Load profile) or processed by tools like `speedscope` or `flamescope`.

### Understanding CPU Profile Output

A CPU profile contains an array of samples (stack traces) taken at regular intervals (typically every 1ms). Each sample records:

- **Timestamp** — when the sample was taken
- **Stack frames** — the complete call stack at that moment
- **Self time** — time spent in the function itself (not its children)
- **Total time** — time spent in the function and all its descendants

```
Function                    | Self Time | Total Time | Calls
-----------------------------------------------------------------
processRequest              |     2 ms  |    847 ms  |    1
  ├─ parseBody              |   120 ms  |    120 ms  |    1
  ├─ validateInput          |     5 ms  |     25 ms  |    1
  │   └─ ajv.validate       |    20 ms  |     20 ms  |    1
  ├─ queryDatabase          |     1 ms  |    650 ms  |    1
  │   ├─ pg.query           |   600 ms  |    600 ms  |    1  ← I/O wait
  │   └─ transformResults   |    49 ms  |     49 ms  |    1
  └─ serializeResponse      |    50 ms  |     50 ms  |    1
      └─ JSON.stringify     |    45 ms  |     45 ms  |    1
```

In this example:
- `pg.query` dominates total time (600ms) but it is I/O wait, not CPU — a CPU profiler captures it as idle time
- `parseBody` takes 120ms of actual CPU time — worth investigating
- `JSON.stringify` takes 45ms — consider streaming serialization for large payloads

## Heap Snapshots — Finding Memory Leaks

Memory leaks in Node.js manifest as steadily increasing RSS (Resident Set Size) that never comes back down, eventually leading to OOM kills. Heap snapshots are the definitive tool for finding them.

### Taking a Heap Snapshot

```typescript
import { Session } from 'node:inspector/promises';
import { createWriteStream } from 'node:fs';

async function takeHeapSnapshot(): Promise<string> {
  const session = new Session();
  session.connect();

  const filename = `heap-${Date.now()}.heapsnapshot`;
  const fileStream = createWriteStream(filename);

  session.on('HeapProfiler.addHeapSnapshotChunk', (message) => {
    fileStream.write(message.params.chunk);
  });

  await session.post('HeapProfiler.takeHeapSnapshot', {
    reportProgress: false,
    treatGlobalObjectsAsRoots: true,
  });

  fileStream.end();
  session.disconnect();

  return filename;
}
```

::: danger Performance Impact
Taking a heap snapshot **stops the world** — the entire Node.js process is frozen while the snapshot is being collected. For a 1 GB heap, this can take 5-15 seconds. Never take heap snapshots on a production server that is actively handling traffic without first draining it from the load balancer.
:::

### Analyzing Heap Snapshots in Chrome DevTools

Load the `.heapsnapshot` file in Chrome DevTools (Memory tab > Load).

Three views are available:

1. **Summary** — Objects grouped by constructor. Look for objects with unexpectedly high counts.
2. **Comparison** — Compare two snapshots taken at different times. Objects that grew between snapshots are likely leaking.
3. **Containment** — Shows the actual object graph. Follow reference chains from GC root to the leaked object to understand why it is retained.
4. **Statistics** — Pie chart of memory usage by type.

### The Three-Snapshot Technique

This is the most reliable method for identifying memory leaks:

1. **Snapshot 1:** Take immediately after application starts and handles a few warm-up requests.
2. **Run the workload:** Process a significant number of requests (e.g., 10,000).
3. **Force GC:** Expose V8 GC via `--expose-gc` and call `global.gc()`.
4. **Snapshot 2:** Take after workload and GC.
5. **Run the same workload again** (another 10,000 requests).
6. **Force GC again.**
7. **Snapshot 3:** Take after second workload and GC.

Now compare snapshots 2 and 3. Objects that grew between these two snapshots are leaking — they survive garbage collection and grow proportionally with workload.

```typescript
// Enable with: node --expose-gc server.js

app.post('/debug/heap-snapshot', async (req, res) => {
  // Force garbage collection to get a clean snapshot
  if (global.gc) {
    global.gc();
    // Wait a tick for GC to complete
    await new Promise(resolve => setImmediate(resolve));
  }

  const filename = await takeHeapSnapshot();
  res.json({ filename, heapUsed: process.memoryUsage().heapUsed });
});
```

### Common Memory Leak Patterns in Node.js

#### 1. Unbounded Caches

```typescript
// LEAKING: Cache grows forever
const cache = new Map<string, any>();

function getData(key: string): any {
  if (cache.has(key)) return cache.get(key);
  const data = computeExpensiveResult(key);
  cache.set(key, data); // Never evicted!
  return data;
}

// FIXED: Use an LRU cache with a maximum size
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, any>({
  max: 10_000,           // Maximum 10,000 entries
  ttl: 1000 * 60 * 5,   // Entries expire after 5 minutes
});
```

#### 2. Event Listener Accumulation

```typescript
// LEAKING: Every request adds a listener, never removed
function handleRequest(req: Request, res: Response): void {
  const onData = (chunk: Buffer) => {
    // Process chunk
  };
  externalStream.on('data', onData);
  // Listener is never removed — accumulates per request
}

// FIXED: Remove listeners when done
function handleRequest(req: Request, res: Response): void {
  const onData = (chunk: Buffer) => {
    // Process chunk
  };
  externalStream.on('data', onData);

  res.on('finish', () => {
    externalStream.removeListener('data', onData);
  });
}
```

#### 3. Closures Retaining Large Scopes

```typescript
// LEAKING: The closure retains a reference to `largeData`
function processData(): () => string {
  const largeData = loadLargeDataset(); // 500 MB
  const summary = computeSummary(largeData);

  // This closure captures the entire scope, including `largeData`
  return () => `Summary: ${summary}`;
}

// FIXED: Extract only what the closure needs
function processData(): () => string {
  const largeData = loadLargeDataset();
  const summary = computeSummary(largeData);
  // largeData goes out of scope and can be GC'd
  return createFormatter(summary);
}

function createFormatter(summary: string): () => string {
  // This closure only captures `summary`, not `largeData`
  return () => `Summary: ${summary}`;
}
```

#### 4. Unresolved Promises

```typescript
// LEAKING: Promises that never resolve hold their entire closure in memory
const pendingOperations = new Map<string, Promise<void>>();

function startOperation(id: string): void {
  const promise = new Promise<void>((resolve) => {
    // If the external service never calls back, this promise
    // and everything it references stays in memory forever
    externalService.doWork(id, () => resolve());
  });
  pendingOperations.set(id, promise);
}

// FIXED: Add timeouts and cleanup
function startOperation(id: string): void {
  const promise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Operation ${id} timed out`));
    }, 30_000);

    externalService.doWork(id, () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  promise.finally(() => {
    pendingOperations.delete(id);
  });

  pendingOperations.set(id, promise);
}
```

#### 5. Global Variables and Module-Level State

```typescript
// LEAKING: Module-level array grows with every import consumer
const allRequests: Request[] = [];

export function trackRequest(req: Request): void {
  allRequests.push(req); // Never cleared
}

// FIXED: Use a circular buffer or WeakRef
class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private index = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.index % this.capacity] = item;
    this.index++;
  }

  getAll(): T[] {
    return this.buffer.filter((item): item is T => item !== undefined);
  }
}

const recentRequests = new CircularBuffer<WeakRef<Request>>(1000);
```

## Flame Graphs with 0x

[0x](https://github.com/davidmarkclements/0x) is the fastest way to generate flame graphs for Node.js. It uses V8's built-in sampling profiler and produces an interactive HTML flame graph.

```bash
# Install globally
npm install -g 0x

# Profile a script
0x -- node server.js

# Profile with a specific duration
0x --collect-only -- node server.js
# (Ctrl+C to stop, then)
0x --visualize-only <pid>.0x

# Profile with higher sampling frequency (more accurate but more overhead)
0x --kernel-tracing -- node server.js
```

### Interpreting 0x Flame Graphs

The interactive HTML output lets you:

- **Click** on a frame to zoom into it
- **Search** for function names (Ctrl+F)
- **Toggle** between "merged" (aggregate) and "unmerged" (per-sample) views
- **Filter** by color: teal = application code, red = C++ (V8/libuv), yellow = optimization/deoptimization

**What to look for:**

1. **Wide plateaus at the top of the graph** — these are functions consuming the most CPU time. They are your primary optimization targets.
2. **Deep narrow stacks** — deep call chains that consume little time. Usually not worth optimizing.
3. **Red (C++) frames dominating** — indicates time is spent in V8 internals (GC, compilation) or libuv (I/O). If GC is dominant, you have a memory problem, not a CPU problem.
4. **Missing frames** — V8 may inline functions, causing them to disappear from the flame graph. Use `--no-turbo-inlining` to disable inlining during profiling (development only).

### Differential Flame Graphs

Compare two profiles to see what changed:

```bash
# Generate profile before optimization
0x --collect-only -- node server-before.js
# Generate profile after optimization
0x --collect-only -- node server-after.js

# Use flamegraph-diff to compare
# (or use speedscope which supports diff views)
```

## Clinic.js — Automated Diagnostics

[Clinic.js](https://clinicjs.org) is a suite of tools by NearForm that automatically diagnoses common Node.js performance problems.

### Clinic Doctor

Detects common issues by monitoring CPU usage, memory, event loop delay, and active handles:

```bash
npx clinic doctor -- node server.js
# (send traffic, then Ctrl+C)
# Opens an HTML report with recommendations
```

Doctor looks for patterns like:
- **CPU bottleneck** — high CPU usage with low event loop delay
- **Event loop delay** — high delay indicates blocking operations
- **Memory issue** — growing memory with GC pressure
- **I/O issue** — low CPU with high handle count

### Clinic Flame

Generates flame graphs with an opinionated interface optimized for Node.js:

```bash
npx clinic flame -- node server.js
```

### Clinic Bubbleprof

Visualizes async operations as bubbles, showing where time is spent waiting:

```bash
npx clinic bubbleprof -- node server.js
```

Bubbleprof is particularly useful for I/O-bound applications where the bottleneck is not CPU but waiting for network responses, database queries, or file system operations. Each bubble represents an async operation, and its size represents the time spent waiting.

## Async Profiling with `async_hooks`

Standard CPU profilers miss the async nature of Node.js. A function may appear fast (it returns immediately) but actually triggers a long async chain. `async_hooks` lets you track the lifecycle of every async operation.

```typescript
import { createHook, executionAsyncId, triggerAsyncId } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

interface AsyncOperation {
  type: string;
  triggerAsyncId: number;
  startTime: number;
  endTime?: number;
}

const operations = new Map<number, AsyncOperation>();

const hook = createHook({
  init(asyncId: number, type: string, triggerId: number): void {
    operations.set(asyncId, {
      type,
      triggerAsyncId: triggerId,
      startTime: performance.now(),
    });
  },

  before(asyncId: number): void {
    const op = operations.get(asyncId);
    if (op && !op.endTime) {
      op.startTime = performance.now(); // Reset to measure execution time
    }
  },

  after(asyncId: number): void {
    const op = operations.get(asyncId);
    if (op) {
      op.endTime = performance.now();
    }
  },

  destroy(asyncId: number): void {
    const op = operations.get(asyncId);
    if (op) {
      const duration = (op.endTime || performance.now()) - op.startTime;
      if (duration > 100) { // Log slow async operations (> 100ms)
        console.warn(
          `Slow async operation: ${op.type} (${asyncId}) ` +
          `took ${duration.toFixed(1)}ms, ` +
          `triggered by ${op.triggerAsyncId}`
        );
      }
      operations.delete(asyncId);
    }
  },
});

hook.enable();
```

::: warning Performance Overhead
`async_hooks` adds measurable overhead — typically 10-30% depending on the workload. Do not enable it in production without understanding the impact. For production async tracking, consider using `AsyncLocalStorage` (which has lower overhead) or OpenTelemetry's context propagation.
:::

### Building an Async Operation Tree

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestContext {
  requestId: string;
  operations: Array<{
    name: string;
    startTime: number;
    duration?: number;
    children: Array<any>;
  }>;
  currentOperation: any;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

function startOperation(name: string): () => void {
  const ctx = asyncLocalStorage.getStore();
  if (!ctx) return () => {};

  const operation = {
    name,
    startTime: performance.now(),
    duration: undefined as number | undefined,
    children: [] as any[],
  };

  if (ctx.currentOperation) {
    ctx.currentOperation.children.push(operation);
  } else {
    ctx.operations.push(operation);
  }

  const previousOperation = ctx.currentOperation;
  ctx.currentOperation = operation;

  return () => {
    operation.duration = performance.now() - operation.startTime;
    ctx.currentOperation = previousOperation;
  };
}

// Usage in request handler
app.get('/api/users/:id', (req, res) => {
  asyncLocalStorage.run(
    { requestId: req.id, operations: [], currentOperation: null },
    async () => {
      const endAuth = startOperation('authenticate');
      await authenticate(req);
      endAuth();

      const endQuery = startOperation('query-database');
      const user = await db.findUser(req.params.id);
      endQuery();

      const endSerialize = startOperation('serialize');
      const json = JSON.stringify(user);
      endSerialize();

      const ctx = asyncLocalStorage.getStore()!;
      console.log(JSON.stringify(ctx.operations, null, 2));
      // Output:
      // [
      //   { "name": "authenticate", "duration": 12.3, "children": [] },
      //   { "name": "query-database", "duration": 45.6, "children": [] },
      //   { "name": "serialize", "duration": 2.1, "children": [] }
      // ]

      res.json(user);
    }
  );
});
```

## Production Profiling with Minimal Overhead

Profiling in production requires techniques that add less than 1% overhead:

### Technique 1: Linux `perf` with Node.js

```bash
# Start Node.js with perf map support
node --perf-basic-prof server.js

# In another terminal, record a 30-second profile
perf record -F 99 -p $(pgrep -f server.js) -g -- sleep 30

# Generate a flame graph
perf script | stackcollapse-perf.pl | flamegraph.pl > flamegraph.svg
```

The `--perf-basic-prof` flag writes a `/tmp/perf-<pid>.map` file that maps JIT-compiled code addresses to JavaScript function names, allowing `perf` to resolve stack frames.

### Technique 2: Continuous Profiling with Pyroscope

```typescript
import Pyroscope from '@pyroscope/nodejs';

Pyroscope.init({
  serverAddress: 'http://pyroscope:4040',
  appName: 'my-service',
  tags: {
    region: process.env.AWS_REGION || 'unknown',
    version: process.env.APP_VERSION || 'dev',
  },
});

Pyroscope.start();
// Now CPU profiles are continuously sent to Pyroscope
// with < 1% overhead using V8's sampling profiler
```

### Technique 3: On-Demand Profiling via Signal

```typescript
import { Session } from 'node:inspector/promises';
import { writeFileSync } from 'node:fs';

let profiling = false;

process.on('SIGUSR2', async () => {
  if (profiling) {
    console.log('Already profiling, ignoring signal');
    return;
  }

  profiling = true;
  console.log('Starting 30-second CPU profile...');

  const session = new Session();
  session.connect();

  await session.post('Profiler.enable');
  await session.post('Profiler.start');

  setTimeout(async () => {
    const { profile } = await session.post('Profiler.stop');
    const filename = `/tmp/cpu-profile-${Date.now()}.cpuprofile`;
    writeFileSync(filename, JSON.stringify(profile));
    console.log(`Profile saved to ${filename}`);

    await session.post('Profiler.disable');
    session.disconnect();
    profiling = false;
  }, 30_000);
});
```

```bash
# Trigger profiling on a running process
kill -USR2 $(pgrep -f server.js)
```

### Technique 4: Event Loop Lag Monitoring

```typescript
import { monitorEventLoopDelay } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

// Report every 10 seconds
setInterval(() => {
  const stats = {
    min: histogram.min / 1e6,       // Convert ns to ms
    max: histogram.max / 1e6,
    mean: histogram.mean / 1e6,
    p50: histogram.percentile(50) / 1e6,
    p99: histogram.percentile(99) / 1e6,
    p999: histogram.percentile(99.9) / 1e6,
  };

  // Send to your metrics system (Prometheus, DataDog, etc.)
  console.log('Event loop delay (ms):', stats);

  // Alert if p99 exceeds threshold
  if (stats.p99 > 100) {
    console.error(`EVENT LOOP LAG ALERT: p99 = ${stats.p99.toFixed(1)}ms`);
    // Trigger a CPU profile automatically
  }

  histogram.reset();
}, 10_000);
```

### Technique 5: `--diagnostic-report` for Post-Mortem Analysis

```bash
# Generate a diagnostic report on unhandled exception
node --report-uncaught-exception server.js

# Generate a report on fatal error (OOM)
node --report-on-fatalerror server.js

# Generate a report on signal
node --report-on-signal --report-signal=SIGUSR2 server.js

# Programmatic report generation
node -e "process.report.writeReport('/tmp/report.json')"
```

The diagnostic report includes:
- Node.js and V8 version information
- Command-line flags
- System resource usage (CPU, memory)
- libuv handle and request information
- Heap statistics
- Native stack trace
- JavaScript stack trace
- Environment variables

## Benchmarking Node.js Code

### Micro-Benchmarks with `tinybench`

```typescript
import { Bench } from 'tinybench';

const bench = new Bench({ time: 5000 });

const data = Array.from({ length: 10_000 }, (_, i) => ({
  id: i,
  name: `user-${i}`,
  email: `user${i}@example.com`,
}));

bench
  .add('JSON.stringify', () => {
    JSON.stringify(data);
  })
  .add('Manual serialization', () => {
    let result = '[';
    for (let i = 0; i < data.length; i++) {
      if (i > 0) result += ',';
      result += `{"id":${data[i].id},"name":"${data[i].name}","email":"${data[i].email}"}`;
    }
    result += ']';
    return result;
  })
  .add('fast-json-stringify', () => {
    fastStringify(data);
  });

await bench.warmup();
await bench.run();

console.table(bench.table());
// ┌───────────────────────┬──────────┬────────────┬──────────┐
// │ Task Name             │ ops/sec  │ Average ns │ Margin   │
// ├───────────────────────┼──────────┼────────────┼──────────┤
// │ JSON.stringify        │ 1,234    │ 810,000    │ ±1.2%    │
// │ Manual serialization  │ 3,456    │ 289,000    │ ±0.8%    │
// │ fast-json-stringify   │ 5,678    │ 176,000    │ ±0.5%    │
// └───────────────────────┴──────────┴────────────┴──────────┘
```

### Load Testing for Profiling

Use `autocannon` to generate realistic load while profiling:

```bash
# Install
npm install -g autocannon

# Send 100 concurrent connections for 30 seconds
autocannon -c 100 -d 30 http://localhost:3000/api/users

# With POST body
autocannon -c 50 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"name":"test","email":"test@example.com"}' \
  http://localhost:3000/api/users
```

Combine with profiling:

```bash
# Terminal 1: Start server with profiling
0x -- node server.js

# Terminal 2: Generate load
autocannon -c 100 -d 30 http://localhost:3000/api/users

# Terminal 1: Ctrl+C to stop — flame graph generated
```

## Memory Profiling Beyond Heap Snapshots

### Allocation Tracking

Track where objects are allocated (not just what is retained):

```typescript
import { Session } from 'node:inspector/promises';

async function trackAllocations(durationMs: number): Promise<void> {
  const session = new Session();
  session.connect();

  await session.post('HeapProfiler.enable');

  // Start tracking allocations with stack traces
  await session.post('HeapProfiler.startTrackingHeapObjects', {
    trackAllocations: true,
  });

  await new Promise(resolve => setTimeout(resolve, durationMs));

  await session.post('HeapProfiler.stopTrackingHeapObjects');

  // Get the allocation profile
  const { profile } = await session.post(
    'HeapProfiler.getSamplingProfile'
  );

  writeFileSync(
    `allocation-profile-${Date.now()}.heapprofile`,
    JSON.stringify(profile)
  );

  await session.post('HeapProfiler.disable');
  session.disconnect();
}
```

The `.heapprofile` file can be loaded in Chrome DevTools (Memory tab > Load).

### Tracking External Memory

Node.js memory is not limited to the V8 heap. Buffers, native addons, and libuv structures use "external" memory that does not appear in heap snapshots:

```typescript
function logMemoryUsage(): void {
  const usage = process.memoryUsage();
  console.log({
    rss: `${(usage.rss / 1024 / 1024).toFixed(1)} MB`,        // Total process memory
    heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(1)} MB`, // V8 heap allocated
    heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(1)} MB`,  // V8 heap used
    external: `${(usage.external / 1024 / 1024).toFixed(1)} MB`,   // C++ objects bound to JS
    arrayBuffers: `${(usage.arrayBuffers / 1024 / 1024).toFixed(1)} MB`, // ArrayBuffers + SharedArrayBuffers
  });
}

// If RSS >> heapTotal, memory is being used outside V8 (Buffers, native code)
// If heapUsed grows but never decreases, you have a JS memory leak
// If external grows, you have a Buffer/native addon leak
```

### V8 Heap Statistics

```typescript
import v8 from 'node:v8';

function logHeapStatistics(): void {
  const stats = v8.getHeapStatistics();
  console.log({
    totalHeapSize: `${(stats.total_heap_size / 1024 / 1024).toFixed(1)} MB`,
    usedHeapSize: `${(stats.used_heap_size / 1024 / 1024).toFixed(1)} MB`,
    heapSizeLimit: `${(stats.heap_size_limit / 1024 / 1024).toFixed(1)} MB`,
    mallocedMemory: `${(stats.malloced_memory / 1024 / 1024).toFixed(1)} MB`,
    numberOfNativeContexts: stats.number_of_native_contexts,
    numberOfDetachedContexts: stats.number_of_detached_contexts,
    // If detachedContexts > 0, you may be leaking iframes or vm contexts
  });

  const spaces = v8.getHeapSpaceStatistics();
  for (const space of spaces) {
    console.log(`  ${space.space_name}: ` +
      `${(space.space_used_size / 1024 / 1024).toFixed(1)} MB / ` +
      `${(space.space_size / 1024 / 1024).toFixed(1)} MB`
    );
  }
}

// Example output:
// new_space:        1.2 MB / 2.0 MB    (young generation)
// old_space:       45.3 MB / 52.0 MB   (old generation)
// code_space:       3.1 MB / 4.0 MB    (JIT compiled code)
// large_object_space: 12.5 MB / 12.6 MB (objects > 256KB)
```

## Profiling Checklist

Before you start profiling a Node.js application, use this checklist:

| Step | Action | Notes |
|------|--------|-------|
| 1 | Define the metric you want to improve | "P99 latency" not "make it faster" |
| 2 | Establish a baseline | Record current performance numbers |
| 3 | Create a reproducible workload | Use autocannon or a test script |
| 4 | Choose the right profiler | CPU profiler for CPU, heap snapshot for memory |
| 5 | Profile under realistic conditions | Production-like data volume and concurrency |
| 6 | Identify the top 3 hot paths | Focus on the biggest bottlenecks first |
| 7 | Form a hypothesis | "Switching to streaming JSON will reduce P99 by 40%" |
| 8 | Make one change at a time | Multiple changes make attribution impossible |
| 9 | Measure again | Confirm the improvement with the same workload |
| 10 | Set up regression detection | Add performance tests to CI, alert on degradation |

---

> *"A performance optimization that is not measured is a performance regression that has not been detected yet."*
