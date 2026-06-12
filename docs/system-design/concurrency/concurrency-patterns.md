---
title: "Concurrency Patterns"
description: "Producer-consumer, thread pool, reader-writer, actor model, work stealing — the recurring patterns that solve common concurrent programming problems."
tags: [concurrency, patterns, producer-consumer, thread-pool, actor-model, work-stealing]
difficulty: "intermediate"
prerequisites: [system-design/concurrency/mutex-semaphore-monitor, system-design/concurrency/async-patterns]
lastReviewed: "2026-06-12"
---

# Concurrency Patterns

Concurrency problems recur. The same solutions — producer-consumer, thread pool, reader-writer — appear across every language and framework. Knowing these patterns means you recognize the shape of a problem and reach for the proven solution.

---

## Producer-Consumer

The most fundamental pattern. Producers generate work items and place them in a shared queue. Consumers take items and process them. The queue decouples production rate from consumption rate.

```python
import queue, threading

work_queue = queue.Queue(maxsize=100)  # bounded — producer blocks if full (backpressure)

def producer():
    while True:
        item = fetch_from_api()
        work_queue.put(item)  # blocks if queue full

def consumer():
    while True:
        item = work_queue.get()
        process(item)
        work_queue.task_done()

consumers = [threading.Thread(target=consumer) for _ in range(4)]
```

**Bounded vs unbounded queue:** A bounded queue provides backpressure — if consumers are too slow, producers slow down too. An unbounded queue lets producers run ahead, potentially consuming all memory.

**Async version:**
```python
async def producer_consumer():
    queue = asyncio.Queue(maxsize=100)

    async def producer():
        async for item in source:
            await queue.put(item)

    async def consumer():
        while True:
            item = await queue.get()
            await process(item)
            queue.task_done()

    await asyncio.gather(producer(), consumer(), consumer(), consumer())
```

---

## Thread Pool

Creating a thread per task is expensive (~1ms creation, ~1MB stack). A thread pool creates N threads upfront and reuses them.

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

with ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(process_item, item) for item in items]
    for future in as_completed(futures):
        result = future.result()
```

```java
ExecutorService pool = Executors.newFixedThreadPool(10);
Future<Result> future = pool.submit(() -> processItem(item));
Result result = future.get();
pool.shutdown();
pool.awaitTermination(60, TimeUnit.SECONDS);
```

**Sizing:**
- CPU-bound: `N = CPU cores`
- I/O-bound: `N = CPU_cores × (1 + wait_time / compute_time)`
- Mixed: profile under load, start with `2 × CPU_cores`

---

## Reader-Writer Pattern

Multiple readers can access shared data simultaneously. Writers need exclusive access.

```java
ReadWriteLock rwLock = new ReentrantReadWriteLock();

// Many threads can hold readLock simultaneously
public Object read(String key) {
    rwLock.readLock().lock();
    try { return data.get(key); }
    finally { rwLock.readLock().unlock(); }
}

// Only one writer, no readers allowed
public void write(String key, Object value) {
    rwLock.writeLock().lock();
    try { data.put(key, value); }
    finally { rwLock.writeLock().unlock(); }
}
```

Use when reads vastly outnumber writes. If writes are as frequent as reads, plain mutex may be faster (reader-writer lock has more overhead).

---

## Work Stealing

Each worker thread has its own local queue. When a worker's queue is empty, it steals tasks from the back of another worker's queue. Used by Java's `ForkJoinPool` and Go's scheduler.

```
Worker 1: [A, B, C, D]  ← push/pop from front
Worker 2: []             ← empty! steals from back of Worker 1 → gets [D]
```

Eliminates the central-queue bottleneck. Automatic load balancing. Cache-friendly.

```java
// Java ForkJoinPool — divide-and-conquer
class SumTask extends RecursiveTask<Long> {
    protected Long compute() {
        if (size < THRESHOLD) return sumSequentially();
        SumTask left = new SumTask(array, start, mid);
        SumTask right = new SumTask(array, mid, end);
        left.fork();                        // submit to work-stealing pool
        return right.compute() + left.join();
    }
}
ForkJoinPool pool = new ForkJoinPool();
long result = pool.invoke(new SumTask(array, 0, array.length));
```

---

## Actor Model

Actors are independent units that communicate by sending messages to each other's mailboxes. No shared state = no locks needed.

```
Actor A ──[message]──► Actor B's mailbox
Actor B processes messages one at a time (sequential, no locks needed for B's state)
Actor B ──[reply]──► Actor A's mailbox
```

```python
# asyncio-based actor pattern
class Actor:
    def __init__(self):
        self.mailbox = asyncio.Queue()
        self.state = {}

    async def run(self):
        while True:
            msg = await self.mailbox.get()
            await self.handle(msg)

    async def handle(self, msg):
        if msg['type'] == 'increment':
            self.state['count'] = self.state.get('count', 0) + 1

# Real frameworks: Akka (JVM), Erlang/OTP, Elixir, Microsoft Orleans
```

**When actors shine:** Many independent stateful entities (users, sessions, game rooms) where each needs to process events sequentially without coordination with others.

---

## Barrier

All threads must reach the barrier before any can proceed. Used in parallel algorithms where Phase 2 depends on all Phase 1 results.

```python
barrier = threading.Barrier(4)  # wait for 4 threads

def worker(thread_id):
    phase1_work(thread_id)
    barrier.wait()       # all 4 must reach this before any continues
    phase2_work(thread_id)
```

---

## Rate Limiter Pattern

Control the rate at which tasks execute to avoid overwhelming downstream services.

```python
class TokenBucketLimiter:
    def __init__(self, rate: int, period: float = 1.0):
        self.rate = rate
        self.tokens = rate
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_refill
            self.tokens = min(self.rate, self.tokens + elapsed * self.rate)
            self.last_refill = now

            if self.tokens < 1:
                wait = (1 - self.tokens) / self.rate
                await asyncio.sleep(wait)
                self.tokens = 0
            else:
                self.tokens -= 1

limiter = TokenBucketLimiter(rate=100)  # 100 req/s

async def make_request(url):
    await limiter.acquire()
    return await http.get(url)
```

---

## Choosing the Right Pattern

| Problem | Pattern |
|---------|---------|
| Variable production rate, different consumption rate | Producer-Consumer |
| Reuse threads for many short tasks | Thread Pool |
| Read-heavy shared data structure | Reader-Writer Lock |
| Divide-and-conquer with task spawning | Work Stealing / ForkJoin |
| Many independent stateful entities | Actor Model |
| All threads must sync before next phase | Barrier |
| Async result to retrieve later | Future/Promise |
| Limit outgoing request rate | Token Bucket / Rate Limiter |
| First result from multiple redundant sources | `Promise.race` / `asyncio.wait(FIRST_COMPLETED)` |
