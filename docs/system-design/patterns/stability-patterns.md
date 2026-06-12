---
title: "Stability Patterns"
description: "Production stability patterns from Michael Nygard's Release It! — circuit breaker, bulkhead, timeout, fail fast, steady state, handshaking, and back pressure. The countermeasures to cascading failures."
tags: [reliability, stability, production, bulkhead, circuit-breaker, resilience, release-it]
difficulty: "intermediate"
prerequisites: [system-design/patterns/stability-antipatterns, system-design/distributed-systems/circuit-breaker]
lastReviewed: "2026-06-12"
---

# Stability Patterns

These are the patterns that prevent [stability antipatterns](./stability-antipatterns) from propagating. Each pattern is a countermeasure to a specific failure mode. Most production-grade systems implement several of these in combination.

---

## Timeout

The most fundamental stability pattern. Every call across a trust boundary (database, HTTP, queue, file system) must have a timeout.

**Why it matters:** Without a timeout, a slow or hung remote call blocks your thread indefinitely. With enough blocked threads, your thread pool exhausts and your service appears to be down — because of someone else's problem.

```python
import httpx
import asyncio

# WRONG: no timeout
async def get_user(user_id):
    response = await httpx.get(f"https://api.example.com/users/{user_id}")
    return response.json()

# RIGHT: always timeout
async def get_user(user_id):
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"https://api.example.com/users/{user_id}")
            return response.json()
    except httpx.TimeoutException:
        raise ServiceUnavailableError("User service timeout")
```

```java
// Spring RestTemplate
RestTemplate restTemplate = new RestTemplate();
HttpComponentsClientHttpRequestFactory factory = new HttpComponentsClientHttpRequestFactory();
factory.setConnectTimeout(1000);    // 1s to establish connection
factory.setReadTimeout(2000);       // 2s to read response
restTemplate.setRequestFactory(factory);
```

**Setting timeout values:**
- Connect timeout: 1-2 seconds (TCP handshake should be fast)
- Read timeout: depends on the operation. OLTP queries: 1-5s. Batch operations: longer.
- Too short: false timeouts on slow operations. Too long: you're waiting too long for something that won't recover.

---

## Circuit Breaker

Already covered in depth in the [circuit breaker page](/system-design/distributed-systems/circuit-breaker). The brief summary:

A circuit breaker wraps calls to a remote service and tracks failures. When failures exceed a threshold, the circuit "opens" and calls fail immediately without attempting the remote call. After a recovery period, the circuit "half-opens" and allows one test call through.

```
CLOSED (normal) → failure threshold exceeded → OPEN (failing fast)
OPEN → recovery timeout expires → HALF-OPEN → success → CLOSED
                                             → failure → OPEN
```

**States and behavior:**
- **Closed:** All calls go through. Failures are tracked.
- **Open:** All calls fail immediately (no remote attempt). Caller gets fast failure.
- **Half-Open:** One call goes through. Success → close. Failure → open again.

**Combined with timeout:**
```python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=30, expected_exception=Exception)
async def call_payment_service(payment_data):
    async with httpx.AsyncClient(timeout=2.0) as client:
        response = await client.post("https://payments.example.com/charge", json=payment_data)
        return response.json()
```

---

## Bulkhead

A bulkhead is a partition that prevents failure in one part of a system from affecting other parts. Named after the watertight compartments in a ship's hull — one compartment flooded doesn't sink the ship.

**The problem without bulkheads:**
```
Single thread pool (100 threads) serves all requests:
- Normal product page requests
- Slow search requests (each takes 500ms)
- Fast checkout requests (each takes 10ms)

If search requests are slow:
→ Search fills the entire thread pool
→ Checkout requests can't be served even though checkout is working fine
```

**With bulkheads (separate thread pools):**
```python
from concurrent.futures import ThreadPoolExecutor

# Separate thread pools by criticality
checkout_pool = ThreadPoolExecutor(max_workers=30, thread_name_prefix="checkout")
search_pool = ThreadPoolExecutor(max_workers=20, thread_name_prefix="search")  
content_pool = ThreadPoolExecutor(max_workers=50, thread_name_prefix="content")

async def handle_checkout(request):
    # Runs in checkout_pool — search degradation can't affect this
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(checkout_pool, process_checkout, request)
```

**Service-level bulkheads:**
In a microservices architecture, each service is a natural bulkhead. But services can still cascade through synchronous calls. Add bulkheads at the call level too:

```python
# Semaphore limits concurrent calls to a specific downstream
payment_semaphore = asyncio.Semaphore(10)  # max 10 concurrent payment calls

async def charge_customer(amount):
    try:
        async with asyncio.timeout(0.1):  # 100ms to acquire semaphore
            async with payment_semaphore:
                return await payment_service.charge(amount)
    except asyncio.TimeoutError:
        # Semaphore full — payment service is under load, fail fast
        raise ServiceUnavailableError("Payment service at capacity")
```

**Kubernetes resource limits as bulkheads:**
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "500m"
  limits:
    memory: "512Mi"
    cpu: "1"
# Each pod's resource usage is bounded — one pod can't starve the others
```

---

## Steady State

The steady state pattern says: for every resource your system accumulates (logs, sessions, cache entries, metrics, data), there must be a corresponding process that removes it. A system that only accumulates eventually runs out of space and crashes.

**Resource → accumulation mechanism → harvest mechanism**

| Resource | Accumulates Via | Harvested Via |
|---------|----------------|---------------|
| Log files | Each request writes a log line | Log rotation (logrotate, daily), S3 archival |
| User sessions | Login creates session | TTL expiry, explicit logout, session GC |
| Database records | Writes accumulate | Archival job, TTL, explicit deletes |
| Cache entries | Set operations | TTL, LRU eviction, explicit invalidation |
| Metrics samples | Every request generates metrics | Downsampling, retention policies |
| Temp files | Batch jobs create temp files | Cleanup step in job, `/tmp` TTL |

**What happens without harvest:**
```
Log directory: 
Day 1: 10GB
Day 30: 300GB
Day 60: 600GB
...
Day N: disk full → all writes fail → service down
```

**Anti-pattern: infinite accumulation**
```python
# ACCUMULATES FOREVER — will eventually OOM
cache = {}

def get_user(user_id):
    if user_id not in cache:
        cache[user_id] = db.get_user(user_id)
    return cache[user_id]
```

**With harvest (LRU eviction):**
```python
from functools import lru_cache

@lru_cache(maxsize=1000)  # bounded size — old entries evicted
def get_user(user_id):
    return db.get_user(user_id)
```

---

## Fail Fast

Fail fast means detecting that a call is going to fail and returning an error immediately rather than going through the motions of a doomed operation.

**Where to fail fast:**

**Input validation:** If the request is invalid, reject it immediately without touching downstream services.
```python
def process_payment(amount, currency, card_token):
    if amount <= 0:
        raise ValueError("Amount must be positive")  # fail fast — no DB call needed
    if currency not in SUPPORTED_CURRENCIES:
        raise ValueError(f"Unsupported currency: {currency}")  # fail fast
    
    return payment_gateway.charge(amount, currency, card_token)
```

**Resource availability:** If a required resource (DB connection, thread pool slot) isn't available, fail immediately rather than queuing.
```python
async def handle_request(request):
    # If we can't get a DB connection in 100ms, the DB is under load
    # Better to fail fast than queue behind 1000 other requests
    try:
        async with asyncio.timeout(0.1):
            conn = await db_pool.acquire()
    except asyncio.TimeoutError:
        return Response(503, "Database at capacity")
    
    # ...
```

**Circuit breaker integration:** When the circuit is open, fail fast without attempting the call.
```python
if circuit_breaker.is_open():
    raise ServiceUnavailableError("Downstream service unavailable")
```

**Contrast with failing slowly:** A service that accepts requests it can't handle, queues them, lets them time out, generates many errors, and eventually crashes is failing slowly. Failing fast at the boundary prevents the queue from building up.

---

## Handshaking

Handshaking lets services communicate their health and capacity before accepting work. The caller checks if the callee is ready before sending work.

**HTTP health check handshake:**
```python
@app.get('/health')
async def health():
    db_ok = await check_database_connection()
    queue_depth = await get_queue_depth()
    
    if not db_ok:
        return Response(503, {"status": "unhealthy", "reason": "database unreachable"})
    
    if queue_depth > MAX_SAFE_QUEUE_DEPTH:
        return Response(503, {"status": "overloaded", "queue_depth": queue_depth})
    
    return {"status": "healthy", "queue_depth": queue_depth}
```

**Load balancer integration:** The load balancer calls `/health` before routing traffic to a service. A service that returns 503 stops receiving traffic without being removed from the cluster (it can recover and resume serving).

**Kubernetes readiness probe:** The readiness probe is handshaking built into Kubernetes:
```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
# If /health/ready returns non-200, pod stops receiving traffic
# (but isn't restarted — that's the liveness probe)
```

---

## Back Pressure

Back pressure propagates the signal that a system is overloaded back to the producer, so the producer slows down rather than overwhelming the consumer.

**Without back pressure:**
```
Producer → generates 10,000 events/second
Consumer → processes 1,000 events/second

Unbounded queue: fills up, consumes all memory, system crashes
```

**With back pressure:**
```
Producer → generates events → bounded queue (capacity: 10,000)
Consumer → processes 1,000 events/second

When queue is full:
- Option A: Producer blocks (wait until space is available)
- Option B: Producer drops and signals error to its caller
- Option C: Queue applies backpressure to network layer (TCP flow control)
```

```python
# Bounded queue with back pressure
queue = asyncio.Queue(maxsize=1000)  # blocking back pressure

async def producer():
    async for event in event_stream:
        await queue.put(event)  # blocks if queue is full — natural back pressure
        # The producer slows to match consumer speed

async def consumer():
    while True:
        event = await queue.get()
        await process(event)
        queue.task_done()
```

**Reactive streams (RxJava, Project Reactor, Akka Streams):** Frameworks that implement back pressure as a first-class concept. The subscriber signals demand upstream; the publisher only sends as many items as the subscriber can handle.

**Kafka back pressure:** A Kafka consumer that sets `max.poll.records` and controls its own poll rate implements back pressure — the consumer controls how fast it reads from the partition.

---

## Test Harnesses

A test harness is a controlled environment that can simulate the failure modes of integration points.

**What to simulate:**
- Slow responses (latency injection)
- Connection refused
- Packet loss
- Partial responses (connection drops mid-stream)
- Garbage responses (invalid JSON, wrong content type)

```python
# WireMock for Java integration testing
wireMockServer.stubFor(
    post("/payment/charge")
        .willReturn(
            aResponse()
                .withFixedDelay(30000)  // 30 second delay — simulate slow response
                .withStatus(200)
                .withBody("{...}")
        )
);

// Test that your circuit breaker kicks in before the thread pool fills
```

**Chaos Engineering** (Netflix Chaos Monkey, Chaos Toolkit): Inject failures into production to test that stability patterns work as designed. See [Chaos Engineering](/devops/incident-response/chaos-engineering).

---

## Patterns Summary

| Pattern | Protects Against | Implementation |
|---------|-----------------|----------------|
| Timeout | Indefinitely blocked threads | All I/O with bounded duration |
| Circuit Breaker | Cascading failures from slow callee | Failure counter + state machine |
| Bulkhead | One failure consuming all resources | Separate thread pools / connection pools / semaphores |
| Steady State | Resource exhaustion over time | Harvest for every accumulate |
| Fail Fast | Resources wasted on doomed operations | Validate early, check circuit state, check resource availability |
| Handshaking | Overloading services | Health check before routing traffic |
| Back Pressure | Producer overwhelming consumer | Bounded queues, subscriber-driven demand |

**In practice, use them together:** A resilient service call combines timeout (don't wait forever) + circuit breaker (fail fast when downstream is known bad) + bulkhead (limit concurrent calls) + back pressure (don't accept work when queue is full).
