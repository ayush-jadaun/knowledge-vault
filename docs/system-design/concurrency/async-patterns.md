---
title: "Async Patterns: Callbacks → Promises → Async/Await"
description: "How single-threaded async concurrency works — the event loop, callbacks, promises, async/await, Python asyncio, Node.js, coroutines, and when to use async vs threads."
tags: [concurrency, async, await, promises, event-loop, asyncio, nodejs, python-gil]
difficulty: "intermediate"
prerequisites: [system-design/concurrency/race-conditions]
lastReviewed: "2026-06-12"
---

# Async Patterns: Callbacks → Promises → Async/Await

Most network-connected code is I/O-bound — it spends most of its time waiting for database responses, HTTP replies, file reads. A thread blocked on I/O is wasted memory and a wasted OS scheduler slot.

Async programming lets a single thread handle thousands of concurrent I/O operations: pausing when waiting for I/O, resuming when the response arrives.

---

## The Problem: Blocking I/O Wastes Threads

```python
# Synchronous: thread blocks for ~100ms per request
def handle_request(user_id):
    user  = db.query("SELECT * FROM users WHERE id = %s", user_id)   # blocks 50ms
    posts = db.query("SELECT * FROM posts WHERE user_id = %s", user_id)  # blocks 50ms
    return render(user, posts)
```

With 1,000 concurrent requests, you need 1,000 threads × ~1MB stack = 1GB RAM just for thread stacks. At 10,000 concurrent requests this becomes unworkable.

**Async solves this:** one thread, 10,000 concurrent I/O operations.

---

## The Event Loop

The event loop runs in a single thread:
1. Picks up tasks ready to run
2. Runs the task until it hits an I/O await
3. Registers the I/O with the OS (epoll/kqueue/IOCP)
4. Picks up the next ready task — never blocks
5. When OS signals I/O complete, queues the continuation

```
Task Queue: [callback1, callback2, callback3]
    ↓
Run callback1 → hits HTTP await → suspend, register with OS
    ↓
Run callback2 → hits DB await → suspend, register with OS
    ↓
[OS: HTTP for callback1 complete] → queue callback1 continuation
    ↓
Run callback1 continuation...
```

---

## Stage 1: Callbacks (The Problem)

```javascript
// Node.js callback style — "callback hell"
fs.readFile('data.txt', (err, data) => {
    if (err) return;
    db.query('SELECT * FROM items', (err, rows) => {
        if (err) return;
        http.get('https://api.example.com/data', (err, response) => {
            render(data, rows, response);  // 3 levels deep, error handling duplicated
        });
    });
});
```

No `try/catch` across callbacks, no `for` loops, deeply nested.

---

## Stage 2: Promises

```javascript
readFile('data.txt')
    .then(data => db.query('SELECT * FROM items'))
    .then(rows => http.get('https://api.example.com/data'))
    .then(response => render())
    .catch(err => console.error(err));  // one handler for the whole chain

// Concurrency with Promise.all
const [user, posts, settings] = await Promise.all([
    fetchUser(id),
    fetchPosts(id),
    fetchSettings(id)
]);

// First to resolve wins
const result = await Promise.race([fetchFromPrimary(), fetchFromFallback()]);
```

---

## Stage 3: Async/Await

Syntactic sugar over Promises. Makes async code look synchronous.

```javascript
async function handleRequest(userId) {
    try {
        const user  = await fetchUser(userId);   // suspends here, non-blocking
        const posts = await fetchPosts(userId);  // suspends here, non-blocking
        return render(user, posts);
    } catch (err) {
        console.error(err);
    }
}
```

```python
# Python async/await
import asyncio, asyncpg, aiohttp

async def handle_request_fast(user_id: int):
    async with asyncpg.connect(DATABASE_URL) as conn:
        user, posts = await asyncio.gather(
            conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id),
            conn.fetch("SELECT * FROM posts WHERE user_id = $1", user_id)
        )
    return render(user, posts)
```

**`await` suspends the current coroutine and yields control back to the event loop.** Other coroutines can run while waiting for I/O.

---

## Python asyncio Deep Dive

### Coroutines vs Threads

```python
# Thread-based: 100 threads blocking
def blocking_io():
    time.sleep(1)  # blocks the thread
# 100 threads × ~1MB = ~100MB RAM

# Async: 1 thread, 100 concurrent operations
async def async_io():
    await asyncio.sleep(1)  # suspends, doesn't block

async def main():
    await asyncio.gather(*[async_io() for _ in range(100)])
# ~1MB RAM, 1 OS thread
```

### The GIL and asyncio

Python's GIL prevents true thread parallelism for CPU-bound work. For I/O, asyncio bypasses this — I/O operations release the GIL.

For **CPU-bound work** inside async code, offload to a thread or process pool:

```python
async def cpu_intensive_task():
    loop = asyncio.get_event_loop()
    # Thread pool: shares GIL, good for C extensions that release GIL
    result = await loop.run_in_executor(ThreadPoolExecutor(), cpu_work)
    # Process pool: separate process, true parallelism
    result = await loop.run_in_executor(ProcessPoolExecutor(), pure_python_cpu_work)
```

### Common Async Pitfalls

```python
# BAD: blocking sleep in async function — blocks entire event loop
async def bad():
    time.sleep(1)

# GOOD: yields to event loop
async def good():
    await asyncio.sleep(1)

# BAD: forgetting await — creates coroutine object, doesn't run it
async def bad():
    fetch_user(id)  # silently does nothing!

# GOOD
async def good():
    await fetch_user(id)

# BAD: CPU work blocks event loop for all other requests
async def bad():
    result = process_huge_file(data)  # 500ms of CPU — nothing else runs

# GOOD: offload to pool
async def good():
    result = await loop.run_in_executor(None, process_huge_file, data)
```

---

## Node.js Event Loop Phases

```
timers         → setTimeout, setInterval
pending cb     → I/O callbacks deferred to next loop
idle/prepare   → internal
poll           → retrieve new I/O events (blocks here if empty)
check          → setImmediate
close          → socket.on('close')
```

`process.nextTick()` runs after current operation, before next phase (higher priority than Promises).  
`Promise.then()` runs in the microtask queue — after current phase, before next phase.

---

## Async vs Threads: When to Use What

| Workload | Best Model | Why |
|----------|-----------|-----|
| Many concurrent HTTP/DB calls | Async/await | Low memory, event loop handles I/O |
| CPU-bound (encoding, crypto) | Multiprocessing | Use multiple cores |
| Mixed I/O + CPU | Async + thread/process pool | Offload CPU, keep async for I/O |
| Interop with blocking libraries | Threads | Can't await blocking calls |
| Real-time bidirectional | Async | WebSockets work naturally with event loop |

**Rule of thumb:** I/O-bound → async/await. CPU-bound → multiprocessing. Mixed → async + pool executors.

---

## Async Patterns Reference

```python
# Concurrent execution
results = await asyncio.gather(coro1(), coro2(), coro3())

# Timeout
async with asyncio.timeout(5.0):
    result = await slow_operation()

# Background tasks
task = asyncio.create_task(background_worker())
result = await task  # wait for it later

# Semaphore — limit concurrent requests
semaphore = asyncio.Semaphore(10)
async def fetch(url):
    async with semaphore:
        return await http.get(url)

# Producer-consumer queue
queue = asyncio.Queue(maxsize=100)
async def producer():
    await queue.put(item)   # blocks if full (backpressure)
async def consumer():
    item = await queue.get()
    queue.task_done()
```
