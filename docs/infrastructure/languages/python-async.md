---
title: "Python Async Deep Dive"
description: "Python async from the ground up — asyncio event loop, coroutines, tasks, structured concurrency with TaskGroups, aiohttp, httpx, asyncpg, and async patterns in FastAPI."
tags: [python, async, asyncio, concurrency, performance]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# Python Async Deep Dive

Python's `asyncio` module enables concurrent I/O-bound programming without threads. Instead of spawning an OS thread per connection (expensive, limited to thousands), asyncio multiplexes thousands of concurrent operations on a single thread using cooperative multitasking. When one coroutine waits for a network response, another runs. This is how Python handles 10,000+ concurrent connections in frameworks like FastAPI, aiohttp, and modern async ORMs.

This page covers the full stack: the event loop, coroutines, tasks, structured concurrency, async HTTP clients, async database access, and production patterns.

## The Event Loop

The event loop is the core of asyncio. It runs in a single thread and manages a queue of coroutines, executing them cooperatively — when one coroutine awaits an I/O operation, the event loop switches to another.

```mermaid
graph TB
    subgraph EventLoop["asyncio Event Loop (single thread)"]
        direction TB
        Queue["Ready Queue<br/>(coroutines ready to run)"]
        Running["Currently Running<br/>Coroutine"]
        Waiting["Waiting for I/O<br/>(network, disk, timer)"]

        Queue -->|"Pick next"| Running
        Running -->|"await (I/O)"| Waiting
        Waiting -->|"I/O complete"| Queue
        Running -->|"yield / return"| Queue
    end
```

```python
import asyncio

async def main():
    print("Hello")
    await asyncio.sleep(1)  # Yields control to the event loop for 1 second
    print("World")

# The entry point — creates and runs the event loop
asyncio.run(main())
```

### How It Works Under the Hood

1. `asyncio.run()` creates an event loop and runs the coroutine until completion
2. When a coroutine hits `await`, it suspends and returns control to the event loop
3. The event loop checks for completed I/O operations and resumes the waiting coroutines
4. This continues until all coroutines are done

```python
import asyncio
import time

async def fetch_data(name: str, delay: float) -> str:
    print(f"[{time.strftime('%H:%M:%S')}] {name}: starting fetch")
    await asyncio.sleep(delay)  # Simulates network I/O
    print(f"[{time.strftime('%H:%M:%S')}] {name}: fetch complete")
    return f"{name} result"

async def main():
    start = time.time()

    # Sequential — takes 3 seconds
    r1 = await fetch_data("A", 1)
    r2 = await fetch_data("B", 1)
    r3 = await fetch_data("C", 1)
    print(f"Sequential: {time.time() - start:.1f}s")  # ~3.0s

    start = time.time()

    # Concurrent — takes 1 second (all run during the same await)
    r1, r2, r3 = await asyncio.gather(
        fetch_data("A", 1),
        fetch_data("B", 1),
        fetch_data("C", 1),
    )
    print(f"Concurrent: {time.time() - start:.1f}s")  # ~1.0s

asyncio.run(main())
```

::: warning Async Is Not Parallelism
`asyncio` runs on a single thread. It provides *concurrency* (multiple tasks making progress), not *parallelism* (multiple tasks running simultaneously on different CPU cores). Async excels at I/O-bound work (network calls, database queries, file I/O). For CPU-bound work (number crunching, image processing), use `multiprocessing` or `concurrent.futures.ProcessPoolExecutor`.
:::

## Coroutines, Tasks, and Futures

### Coroutines

A coroutine is a function defined with `async def`. Calling it does not execute it — it returns a coroutine object. You must `await` it or schedule it as a task.

```python
async def compute(x: int, y: int) -> int:
    await asyncio.sleep(0.1)  # Simulate work
    return x + y

# This does NOT execute the coroutine — it just creates the object
coro = compute(3, 4)
print(type(coro))  # <class 'coroutine'>

# This executes it
result = await coro  # 7
```

### Tasks

A `Task` wraps a coroutine and schedules it for concurrent execution. Unlike `await`, creating a task starts execution immediately (on the next event loop iteration) without blocking.

```python
async def main():
    # Create tasks — they start running immediately
    task1 = asyncio.create_task(fetch_data("A", 2), name="fetch-a")
    task2 = asyncio.create_task(fetch_data("B", 1), name="fetch-b")

    # Do other work while tasks run in the background
    print("Tasks are running...")

    # Wait for results when you need them
    result1 = await task1
    result2 = await task2

    # Task properties
    print(task1.done())        # True
    print(task1.result())      # "A result"
    print(task1.get_name())    # "fetch-a"
```

### Task Cancellation

```python
async def long_running_task():
    try:
        while True:
            await asyncio.sleep(1)
            print("Still running...")
    except asyncio.CancelledError:
        print("Task was cancelled — cleaning up...")
        # Perform cleanup here
        raise  # Re-raise to confirm cancellation

async def main():
    task = asyncio.create_task(long_running_task())
    await asyncio.sleep(3)

    task.cancel()          # Request cancellation
    try:
        await task         # Wait for cancellation to complete
    except asyncio.CancelledError:
        print("Task successfully cancelled")
```

## Gathering and Waiting

### asyncio.gather

Runs multiple coroutines concurrently and returns results in the same order.

```python
async def main():
    # All succeed — returns list of results
    results = await asyncio.gather(
        fetch_data("A", 1),
        fetch_data("B", 2),
        fetch_data("C", 1),
    )
    # results == ["A result", "B result", "C result"]

    # With error handling — return_exceptions=True returns exceptions instead of raising
    results = await asyncio.gather(
        fetch_data("A", 1),
        failing_task(),          # This raises an exception
        fetch_data("C", 1),
        return_exceptions=True,
    )
    # results == ["A result", ValueError("failed"), "C result"]
    for result in results:
        if isinstance(result, Exception):
            print(f"Task failed: {result}")
```

### asyncio.wait

More control than `gather` — lets you handle tasks as they complete.

```python
async def main():
    tasks = [
        asyncio.create_task(fetch_data(f"task-{i}", i))
        for i in range(5)
    ]

    # Wait for first to complete
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in done:
        print(f"Completed: {task.result()}")

    # Wait for all remaining
    done, _ = await asyncio.wait(pending)

    # Wait with timeout
    done, pending = await asyncio.wait(tasks, timeout=3.0)
    for task in pending:
        task.cancel()  # Cancel tasks that did not complete in time
```

### asyncio.as_completed

Process results as they arrive, not in submission order.

```python
async def main():
    coros = [fetch_data(f"task-{i}", random.uniform(0.5, 3.0)) for i in range(10)]

    for coro in asyncio.as_completed(coros):
        result = await coro
        print(f"Got result: {result}")  # Printed as each task finishes
```

## Structured Concurrency with TaskGroup

Python 3.11 introduced `TaskGroup` — a safer alternative to `gather` that ensures all tasks are properly cleaned up, even when exceptions occur.

```python
async def main():
    results = []

    async with asyncio.TaskGroup() as tg:
        task1 = tg.create_task(fetch_data("A", 1))
        task2 = tg.create_task(fetch_data("B", 2))
        task3 = tg.create_task(fetch_data("C", 1))

    # All tasks are guaranteed complete here
    results = [task1.result(), task2.result(), task3.result()]
```

### TaskGroup Error Handling

The key advantage of `TaskGroup`: if any task raises an exception, all other tasks are automatically cancelled, and the exception is raised as an `ExceptionGroup`.

```python
async def risky_operation(name: str) -> str:
    await asyncio.sleep(1)
    if name == "B":
        raise ValueError(f"{name} failed!")
    return f"{name} succeeded"

async def main():
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(risky_operation("A"))
            tg.create_task(risky_operation("B"))  # This will fail
            tg.create_task(risky_operation("C"))
    except* ValueError as eg:
        # Python 3.11+ except* syntax for ExceptionGroups
        for exc in eg.exceptions:
            print(f"Caught: {exc}")
    # Task A and C are automatically cancelled when B fails
```

```mermaid
graph TB
    subgraph Gather["asyncio.gather"]
        G1["Task A fails"] --> G2["Task B continues running"]
        G1 --> G3["Task C continues running"]
        G2 --> G4["Orphaned tasks possible"]
    end

    subgraph TaskGroup["asyncio.TaskGroup"]
        T1["Task A fails"] --> T2["Task B cancelled"]
        T1 --> T3["Task C cancelled"]
        T2 --> T4["Clean shutdown guaranteed"]
        T3 --> T4
    end
```

::: tip Prefer TaskGroup Over gather
On Python 3.11+, use `TaskGroup` instead of `asyncio.gather()`. TaskGroup provides structured concurrency — guaranteed cleanup, proper exception propagation, and no orphaned tasks. The only reason to use `gather` is if you need `return_exceptions=True` behavior.
:::

## Async HTTP Clients

### httpx (Recommended)

`httpx` is a modern HTTP client that supports both sync and async, with an API similar to `requests`.

```python
import httpx

async def fetch_multiple_apis():
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=5.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        headers={"User-Agent": "my-service/1.0"},
    ) as client:
        # Concurrent requests
        async with asyncio.TaskGroup() as tg:
            task_users = tg.create_task(client.get("https://api.example.com/users"))
            task_orders = tg.create_task(client.get("https://api.example.com/orders"))
            task_products = tg.create_task(client.get("https://api.example.com/products"))

        users = task_users.result().json()
        orders = task_orders.result().json()
        products = task_products.result().json()
        return users, orders, products

# Streaming large responses
async def download_large_file(url: str, path: str):
    async with httpx.AsyncClient() as client:
        async with client.stream("GET", url) as response:
            with open(path, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    f.write(chunk)
```

### aiohttp

`aiohttp` is the original async HTTP library. It is more mature and often faster for high-throughput scenarios.

```python
import aiohttp

async def fetch_with_aiohttp():
    connector = aiohttp.TCPConnector(
        limit=100,              # Max connections
        limit_per_host=30,      # Max connections per host
        ttl_dns_cache=300,      # DNS cache TTL
        enable_cleanup_closed=True,
    )

    async with aiohttp.ClientSession(connector=connector) as session:
        # Simple GET
        async with session.get("https://api.example.com/data") as response:
            data = await response.json()

        # POST with JSON body
        async with session.post(
            "https://api.example.com/create",
            json={"name": "test", "value": 42},
            headers={"Authorization": "Bearer token"},
        ) as response:
            result = await response.json()

        # Concurrent requests
        urls = [f"https://api.example.com/item/{i}" for i in range(100)]
        tasks = [session.get(url) for url in urls]
        responses = await asyncio.gather(*tasks)
        results = [await r.json() for r in responses]
```

| Feature | httpx | aiohttp |
|---------|-------|---------|
| **API style** | requests-like | Custom context managers |
| **Sync + Async** | Both | Async only |
| **HTTP/2 support** | Yes | No |
| **WebSocket client** | No | Yes |
| **Performance** | Very good | Slightly faster at high concurrency |
| **Ease of use** | Higher | Lower |
| **Recommendation** | Default choice | High-throughput services |

## Async Database Access

### asyncpg (PostgreSQL)

`asyncpg` is a high-performance async PostgreSQL client written in Cython. It is significantly faster than synchronous alternatives.

```python
import asyncpg

async def database_operations():
    # Connection pool — always use a pool in production
    pool = await asyncpg.create_pool(
        dsn="postgresql://user:pass@localhost:5432/mydb",
        min_size=5,
        max_size=20,
        command_timeout=30,
    )

    # Query with pool
    async with pool.acquire() as conn:
        # Single row
        row = await conn.fetchrow(
            "SELECT id, name, email FROM users WHERE id = $1", user_id
        )
        print(f"User: {row['name']} ({row['email']})")

        # Multiple rows
        rows = await conn.fetch(
            "SELECT * FROM orders WHERE user_id = $1 AND status = $2",
            user_id, "active"
        )

        # Insert
        await conn.execute(
            "INSERT INTO events (type, payload, created_at) VALUES ($1, $2, NOW())",
            "user.login", '{"ip": "1.2.3.4"}'
        )

        # Transaction
        async with conn.transaction():
            await conn.execute(
                "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
                amount, from_account
            )
            await conn.execute(
                "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
                amount, to_account
            )

        # Batch insert (much faster than individual inserts)
        records = [(f"user_{i}", f"user_{i}@example.com") for i in range(1000)]
        await conn.copy_records_to_table(
            "users",
            records=records,
            columns=["name", "email"],
        )

    # Always close the pool on shutdown
    await pool.close()
```

### SQLAlchemy Async

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select, text

# Create async engine
engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost:5432/mydb",
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    echo=False,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_active_users():
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.is_active == True).limit(100)
        )
        users = result.scalars().all()
        return users

async def create_user(name: str, email: str):
    async with async_session() as session:
        async with session.begin():
            user = User(name=name, email=email)
            session.add(user)
        # Transaction commits automatically on exit
        return user
```

## FastAPI Async Patterns

FastAPI is built on top of Starlette, which is fully async. Understanding when to use async vs sync endpoints is critical for performance.

```python
from fastapi import FastAPI, Depends, HTTPException
from contextlib import asynccontextmanager
import httpx
import asyncpg

# Application lifespan — setup and teardown async resources
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — create connection pools
    app.state.db_pool = await asyncpg.create_pool(
        "postgresql://user:pass@localhost:5432/mydb",
        min_size=5, max_size=20,
    )
    app.state.http_client = httpx.AsyncClient(timeout=30.0)
    yield
    # Shutdown — close connections
    await app.state.http_client.aclose()
    await app.state.db_pool.close()

app = FastAPI(lifespan=lifespan)

# Async endpoint — uses async database and HTTP calls
@app.get("/users/{user_id}")
async def get_user(user_id: int):
    async with app.state.db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(row)

# Async dependency injection
async def get_db():
    async with app.state.db_pool.acquire() as conn:
        yield conn

@app.get("/orders")
async def list_orders(conn=Depends(get_db)):
    rows = await conn.fetch("SELECT * FROM orders ORDER BY created_at DESC LIMIT 50")
    return [dict(row) for row in rows]

# Fan-out pattern — concurrent external API calls
@app.get("/dashboard/{user_id}")
async def get_dashboard(user_id: int):
    client = app.state.http_client

    async with asyncio.TaskGroup() as tg:
        profile_task = tg.create_task(client.get(f"http://user-service/users/{user_id}"))
        orders_task = tg.create_task(client.get(f"http://order-service/users/{user_id}/orders"))
        recs_task = tg.create_task(client.get(f"http://rec-service/users/{user_id}/recommendations"))

    return {
        "profile": profile_task.result().json(),
        "orders": orders_task.result().json(),
        "recommendations": recs_task.result().json(),
    }
```

::: warning Sync vs Async Endpoints in FastAPI
If your endpoint calls sync I/O (file reads, sync database, CPU work), define it as a regular `def` function — FastAPI will run it in a thread pool automatically. If you define it as `async def` but call sync blocking code inside, you will block the entire event loop and freeze all concurrent requests.
```python
# GOOD: FastAPI runs this in a thread pool automatically
@app.get("/sync")
def sync_endpoint():
    data = blocking_database_call()  # OK — runs in thread pool
    return data

# BAD: blocks the event loop
@app.get("/broken")
async def broken_endpoint():
    data = blocking_database_call()  # BLOCKS the event loop!
    return data

# GOOD: truly async
@app.get("/async")
async def async_endpoint():
    data = await async_database_call()  # Non-blocking
    return data
```
:::

## Common Patterns

### Semaphore (Rate Limiting)

```python
async def fetch_with_rate_limit(urls: list[str], max_concurrent: int = 10):
    """Fetch URLs with a concurrency limit."""
    semaphore = asyncio.Semaphore(max_concurrent)
    results = []

    async def fetch_one(url: str):
        async with semaphore:  # At most max_concurrent tasks run here
            async with httpx.AsyncClient() as client:
                response = await client.get(url)
                return response.json()

    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(fetch_one(url)) for url in urls]

    return [task.result() for task in tasks]
```

### Async Queue (Producer-Consumer)

```python
async def producer(queue: asyncio.Queue, items: list):
    for item in items:
        await queue.put(item)
        print(f"Produced: {item}")
    await queue.put(None)  # Sentinel to signal completion

async def consumer(queue: asyncio.Queue, name: str):
    while True:
        item = await queue.get()
        if item is None:
            queue.task_done()
            break
        await process(item)  # Your async processing
        queue.task_done()
        print(f"[{name}] Consumed: {item}")

async def main():
    queue = asyncio.Queue(maxsize=50)  # Backpressure at 50 items

    async with asyncio.TaskGroup() as tg:
        tg.create_task(producer(queue, range(100)))
        # Multiple consumers for parallelism
        for i in range(5):
            tg.create_task(consumer(queue, f"worker-{i}"))
```

### Timeout Patterns

```python
async def with_timeout():
    # Simple timeout
    try:
        result = await asyncio.wait_for(slow_operation(), timeout=5.0)
    except asyncio.TimeoutError:
        print("Operation timed out after 5 seconds")

    # Timeout with cleanup (Python 3.11+)
    async with asyncio.timeout(10.0):
        await long_running_operation()

    # Deadline-based timeout
    deadline = asyncio.get_event_loop().time() + 30.0
    async with asyncio.timeout_at(deadline):
        await phase_one()
        await phase_two()  # Shares the 30s budget with phase_one
```

## Debugging Async Code

```python
# Enable debug mode for better error messages
asyncio.run(main(), debug=True)

# Or via environment variable
# PYTHONASYNCIODEBUG=1 python my_script.py

# Common pitfalls and fixes:
# 1. "coroutine was never awaited" — you forgot to await
# 2. "Task was destroyed but it is pending" — fire-and-forget without proper cleanup
# 3. "Event loop is closed" — trying to use async after asyncio.run() completes
# 4. Deadlock — awaiting something that will never complete
```

## See Also

- [Go Concurrency](/infrastructure/languages/go-concurrency) — Compare Python async with Go's goroutine model
- [Node.js Internals](/infrastructure/languages/nodejs-internals) — Compare with Node's event loop
- [Python Cheat Sheet](/cheat-sheets/python) — Quick reference for Python fundamentals
- [Event-Driven APIs](/system-design/api-design/event-driven-apis) — Async patterns at the API level
