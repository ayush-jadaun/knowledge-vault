---
title: "Stability Antipatterns"
description: "The failure modes that bring down production systems — cascading failures, integration point failures, blocked threads, slow responses, and unbounded resource growth. Based on Michael Nygard's Release It!"
tags: [reliability, stability, production, cascading-failures, distributed-systems, release-it]
difficulty: "intermediate"
prerequisites: [system-design/distributed-systems/circuit-breaker]
lastReviewed: "2026-06-12"
---

# Stability Antipatterns

Michael Nygard's book "Release It!" catalogued the recurring patterns that cause production systems to fail — not just fail individually, but drag everything around them down too. These aren't edge cases. They're the patterns that appear in every postmortem.

Understanding these antipatterns is the first step to designing systems that survive them. The [stability patterns](./stability-patterns) page covers the countermeasures.

---

## Integration Points: The #1 Killer

Every call to an external system — a database, a third-party API, another microservice — is an integration point. Integration points will fail. The only question is whether their failure will stay local or propagate to your system.

**The scenario:**
```
Your Service → HTTP call → Payment API (response time: normally 50ms)

Payment API has a database problem. Queries take 30 seconds instead of 50ms.
HTTP calls to Payment API now hang for 30 seconds.
Your thread pool has 50 threads. 
30s × 50 = 50 threads consumed in 1500 seconds? No.
In practice: threads fill up in seconds as new requests keep arriving.
Result: your service stops responding entirely.
```

Payment API had a problem. Your service is now down. Cascading failure.

**What makes integration points dangerous:**
- Remote calls can hang indefinitely without a timeout
- Thread pools can be exhausted by slow remote calls
- The failure doesn't look like a failure — it looks like slowness — until it's catastrophic

**The fix:** Always set timeouts. Always. Use circuit breakers. Covered in [stability patterns](./stability-patterns).

---

## Cascading Failures

A cascading failure occurs when one component's failure propagates through the system, taking down components that were not directly affected.

```
Database → slow queries
Service A (calls database) → slow → thread pool fills
Service B (calls Service A) → slow → thread pool fills
Service C (calls Service B) → slow → thread pool fills
User-facing API (calls Service C) → down
```

The database had a hiccup. The user-facing API is now down because every service in the call chain exhausted its thread pool waiting for the next service.

**Why cascades happen:** Synchronous call chains with no timeout or circuit breaking. One slow service causes the caller to block. Many blocked callers exhaust the caller's thread pool. The caller is now slow. Their callers block. The failure propagates up the entire call chain.

**Real example:** In 2012, Amazon had a cascading failure where an EBS outage in one availability zone caused a cascade that affected services in other availability zones — because those services were making synchronous calls to the affected zone without proper timeouts.

---

## Chain Reactions

A chain reaction is a related but distinct pattern: one instance in a cluster fails, its load transfers to remaining instances, they become overloaded, one fails, its load transfers to fewer instances, they become more overloaded, cascade continues until the cluster collapses.

```
Cluster: 10 instances, each at 60% load
Instance 1 fails → remaining 9 instances take its load → each now at ~67%
Instance 2 fails → remaining 8 instances at ~75%
Instance 3 fails → remaining 7 instances at ~86%
Instance 4 fails → remaining 6 instances at 100% → begin failing
...
```

**Common trigger:** Memory leak. One instance crashes due to OOM. Its load redistributes. Remaining instances now use more memory per request (more load). They crash sooner. Chain reaction.

**The fix:** Autoscaling with appropriate headroom. Load shedding when load exceeds safe threshold (return 503, don't accept requests that will fail anyway). Bulkheads to isolate the failing cluster.

---

## Blocked Threads

Threads are expensive (typically 1MB stack). Most web servers have a fixed thread pool. When threads block, they can't serve new requests.

**What blocks threads:**
- Synchronous I/O without timeout (waiting for database, HTTP call, filesystem)
- Waiting for a lock held by a hung thread
- Infinite loops
- Long-running computation

```java
// Danger: no timeout on database query
public User getUser(long id) {
    return jdbcTemplate.queryForObject(  // blocks indefinitely if DB is slow
        "SELECT * FROM users WHERE id = ?", User.class, id
    );
}

// Safe: with timeout
public User getUser(long id) {
    try {
        return jdbcTemplate.queryForObject(
            "SELECT * FROM users WHERE id = ?", User.class, id,
            Duration.ofSeconds(2)  // timeout
        );
    } catch (QueryTimeoutException e) {
        throw new ServiceUnavailableException("Database timeout");
    }
}
```

**Diagnostic:** Take a thread dump. If you see many threads blocked on the same operation (socket read, lock acquisition), you've found your culprit.

---

## Self-Denial Attacks

A self-denial attack is when your own system causes its own overload — typically through marketing or scheduled events.

**Classic scenario:**
- Marketing sends an email to 10 million users at 9am
- Email contains a link to your product
- 10 million users click simultaneously
- Your site gets 10,000x normal traffic in seconds
- Site goes down

This isn't an external attack — it's self-inflicted. Common in e-commerce (flash sales), social media (viral posts), and anywhere marketing campaigns drive traffic.

**Related: thundering herd**
```
Cache expires at midnight for popular content.
All servers have the same TTL.
At midnight, all servers get a cache miss simultaneously.
All servers make the same database query simultaneously.
Database is overwhelmed.
```

**Fixes:**
- Pre-warm caches before campaigns
- Stagger TTLs with jitter (`TTL = base_ttl + random(0, jitter)`)
- Use probabilistic early cache refresh (refresh before expiry with some probability)
- Use load shedding — return 503 when queue is too deep

---

## Slow Responses

Slow responses are often worse than no response. With a slow response, the caller is still holding a thread. With an error response, the caller can immediately handle the failure.

**The slow-response death spiral:**
```
Normal: request takes 50ms
Degraded: request takes 5000ms

At steady load: system handles 100 requests/second normally
During degradation: each request ties up a thread for 5s instead of 50ms
Thread pool (100 threads) fills in 5 seconds
New requests queue, queue fills, requests drop
Service appears unresponsive
```

**The fix:** Fail fast. Set timeouts. Return 503 when the service is under unacceptable load rather than accepting requests that will just time out anyway.

```python
async def handle_request(request):
    queue_depth = await get_queue_depth()
    if queue_depth > MAX_QUEUE_DEPTH:
        return Response(503, {"error": "service temporarily unavailable"})
    
    try:
        async with asyncio.timeout(2.0):
            return await process_request(request)
    except asyncio.TimeoutError:
        return Response(503, {"error": "request timeout"})
```

---

## Unbounded Result Sets

When a query returns more rows than expected, it can exhaust memory, take too long, and block other queries.

```sql
-- Production query with no LIMIT — fine with 100 rows in dev
SELECT * FROM events WHERE user_id = ? ORDER BY created_at DESC;

-- In production: user has 500,000 events
-- Query returns 500,000 rows
-- Serializing them to JSON takes 5 seconds
-- The 500MB JSON payload OOMs the serializer
```

**The fix:**
- Always LIMIT queries in application code
- Enforce limits at the database level (statement timeout)
- Paginate result sets in APIs

```python
def get_user_events(user_id, limit=100, after=None):
    assert limit <= 1000, "Maximum 1000 events per request"
    query = (
        db.select(Event)
        .where(Event.user_id == user_id)
        .order_by(Event.created_at.desc())
        .limit(limit)
    )
    if after:
        query = query.where(Event.id < after)
    return query.all()
```

---

## Resource Leaks

Resources (connections, file handles, threads, memory) must be explicitly released. Leaks accumulate until the system runs out.

**Connection leak:**
```python
# LEAK: connection never returned to pool on exception
def get_user(user_id):
    conn = pool.get_connection()
    result = conn.execute(query, user_id)  # exception here leaks conn
    pool.release(conn)  # never reached on exception
    return result

# SAFE: context manager ensures release
def get_user(user_id):
    with pool.get_connection() as conn:  # released even on exception
        return conn.execute(query, user_id)
```

**File handle leak:**
```python
# LEAK
f = open('data.txt')
process(f.read())  # exception here leaks file handle
f.close()  # never reached

# SAFE
with open('data.txt') as f:
    process(f.read())  # file closed even on exception
```

Symptoms of leaks: memory grows over time, connection pool exhaustion, "too many open files" errors.

---

## Anti-Pattern Summary

| Anti-pattern | Root Cause | Primary Symptom |
|-------------|-----------|-----------------|
| Integration Points | Remote calls without timeout/circuit breaking | Threads blocked on hanging remote calls |
| Cascading Failures | Synchronous call chains with no isolation | One failure brings down everything |
| Chain Reactions | Cluster shrinks, remaining nodes overload | Cluster collapses under normal load |
| Blocked Threads | I/O without timeout, deadlock | Thread pool exhausted, no new requests served |
| Self-Denial Attacks | Marketing/scheduled events cause traffic spikes | Site down under own traffic |
| Slow Responses | Degradation accepted instead of rejected | Thread pool fills, service appears down |
| Unbounded Results | Queries without LIMIT | OOM, long-running queries, API timeouts |
| Resource Leaks | Missing cleanup in error paths | Memory/connection growth, eventual exhaustion |

See [Stability Patterns](./stability-patterns) for the countermeasures to each of these.
