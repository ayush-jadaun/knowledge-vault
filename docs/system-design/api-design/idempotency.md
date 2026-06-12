---
title: "Idempotency & Safe Retries"
description: "Making API operations safe to retry — HTTP method semantics, idempotency keys for POST requests, and how to implement idempotent endpoints that prevent duplicate payments and duplicate records."
tags: [api-design, idempotency, retries, payments, distributed-systems]
difficulty: "intermediate"
prerequisites: [system-design/api-design/index]
lastReviewed: "2026-06-12"
---

# Idempotency & Safe Retries

Networks fail. Requests time out. Load balancers retry. Mobile clients lose connectivity. In a distributed system, any operation that isn't idempotent will eventually run twice — and if "run twice" means "charge the customer twice" or "create two orders," you have a serious bug.

Idempotency is the property that running an operation multiple times produces the same result as running it once. It's what makes retries safe.

---

## HTTP Method Semantics

HTTP methods have defined idempotency semantics. They're part of the specification, and well-behaved clients (load balancers, proxies) assume them.

| Method | Safe | Idempotent | Notes |
|--------|------|------------|-------|
| GET | Yes | Yes | Read-only, no side effects |
| HEAD | Yes | Yes | Like GET, no body |
| OPTIONS | Yes | Yes | Read-only |
| PUT | No | Yes | Replace entire resource — calling twice produces same state |
| DELETE | No | Yes | Delete is idempotent: deleting an already-deleted resource is still "deleted" |
| POST | No | **No** | Creating twice creates two resources |
| PATCH | No | **Sometimes** | Depends on semantics (`amount += 10` is not idempotent; `amount = 10` is) |

**Safe** means: no side effects, can be repeated by intermediaries without concern.

**Idempotent** means: multiple identical requests have the same effect as a single request.

### PUT vs PATCH Idempotency

```
PUT /users/123                 # Replace entire user object — idempotent
{ "name": "Alice", "age": 30 }

PATCH /users/123               # Partial update
{ "name": "Alice" }            # Safe: setting to a value is idempotent
{ "age": { "$inc": 1 } }      # NOT idempotent: incrementing is not idempotent
```

### DELETE Idempotency Edge Case

DELETE should be idempotent, but some implementations return 404 on the second call. Technically correct (the resource is gone), but it breaks client retry logic that checks for success. The better approach: return 200 or 204 on subsequent deletes, or 404 with a body explaining "already deleted."

---

## The Problem: POST Is Not Idempotent

```
Client → POST /orders (creates order #100)
Network timeout — client doesn't know if request was received
Client → POST /orders (retry — creates order #101!)
```

The user only clicked "Place Order" once. They get charged twice.

This is a fundamental problem with any state-changing operation that can't be retried safely. The solution is idempotency keys.

---

## Idempotency Keys

The client generates a unique key for each logical operation and includes it with the request. The server uses this key to:
1. If it hasn't seen this key before: execute the operation, store the result, return it
2. If it has seen this key: return the stored result without re-executing

```
POST /orders
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{ "items": [...], "payment_method": "card_123" }
```

**First request:** Server creates order, stores {key → result}, returns order.  
**Retry with same key:** Server looks up key, returns stored result. No duplicate order created.

**Used by:** Stripe (required for payments), Plaid, Square, most payment APIs.

---

## Server Implementation

```python
import uuid
from redis import Redis

redis = Redis()

@router.post('/orders')
async def create_order(
    request: OrderRequest,
    idempotency_key: str = Header(None),
    user: User = Depends(get_current_user)
):
    if not idempotency_key:
        # Either require it or generate one
        idempotency_key = str(uuid.uuid4())
    
    cache_key = f"idempotency:{user.id}:{idempotency_key}"
    
    # Check if we've seen this key
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)  # Return stored result, don't re-execute
    
    # Execute the operation
    order = await order_service.create(user.id, request)
    
    # Store the result (24-hour TTL is typical)
    result = order.to_dict()
    redis.setex(cache_key, 86400, json.dumps(result))
    
    return result
```

### Edge Cases to Handle

**Concurrent requests with the same key:** Two retries may arrive simultaneously before the first one completes. Use a distributed lock or database upsert to handle this:

```python
# Using a Redis lock to prevent concurrent execution
lock_key = f"idempotency:lock:{user.id}:{idempotency_key}"
with redis.lock(lock_key, timeout=30):
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    order = await order_service.create(user.id, request)
    redis.setex(cache_key, 86400, json.dumps(order.to_dict()))
    return order.to_dict()
```

**Different payloads, same key:** Client sends key `abc123` with payload A. Client sends key `abc123` with payload B (possibly a bug, possibly a different operation). Handle this by returning a 422 error: "Idempotency key was already used with different request body."

```python
if cached:
    cached_data = json.loads(cached)
    if cached_data['request_hash'] != hash(request.json()):
        raise HTTPException(422, "Idempotency key conflict: different request body")
    return cached_data['response']
```

**Key expiry:** After the TTL expires, the same key can be reused. Stripe's 24-hour window is a good default.

---

## Database-Level Idempotency

For operations that must be exactly-once at the database level, use unique constraints:

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL,
    -- ...
    UNIQUE (user_id, idempotency_key)
);
```

```python
try:
    order = await db.execute(
        INSERT INTO orders (idempotency_key, user_id, ...) VALUES (?, ?, ...)
        RETURNING *
    )
except UniqueViolation:
    order = await db.fetchone(
        SELECT * FROM orders WHERE user_id = ? AND idempotency_key = ?
    )
return order
```

This ensures exactly-once semantics even if the Redis cache is unavailable.

---

## Client-Side Best Practices

**Generate keys with UUID v4:** Cryptographically random, globally unique, no coordination required.

```javascript
// Never reuse a key across different logical operations
async function placeOrder(orderData) {
    const idempotencyKey = crypto.randomUUID();  // generate fresh for each operation
    
    return await fetch('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(orderData)
    });
}

// Retry loop using the SAME key
async function placeOrderWithRetry(orderData) {
    const idempotencyKey = crypto.randomUUID();
    
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await fetch('/orders', {
                method: 'POST',
                headers: { 'Idempotency-Key': idempotencyKey },  // same key on retry
                body: JSON.stringify(orderData)
            });
        } catch (error) {
            if (attempt === 2) throw error;
            await sleep(2 ** attempt * 1000);  // exponential backoff
        }
    }
}
```

---

## When to Use Idempotency Keys

**Always use for:**
- Payment operations (charges, refunds, transfers)
- Creating resources where duplicates are harmful (orders, accounts, subscriptions)
- Sending notifications (emails, SMS — don't send twice)
- Consuming from queues (guarantee at-least-once doesn't become at-most-once)

**Not needed for:**
- GET requests (already idempotent)
- PUT requests (already idempotent by design)
- Operations where duplicates are harmless

---

## Exactly-Once Processing in Message Queues

The same problem appears with message queues. Most queues guarantee at-least-once delivery — a message may be delivered twice. Handlers must be idempotent.

```python
async def process_payment_event(event: PaymentEvent):
    # Check if we've already processed this event
    if await db.exists("processed_events", event.id):
        logger.info(f"Skipping already-processed event {event.id}")
        return
    
    await payment_service.process(event)
    await db.insert("processed_events", event.id)
```

The `processed_events` table becomes a deduplication store. This is the same pattern as server-side idempotency keys, applied to async processing.
