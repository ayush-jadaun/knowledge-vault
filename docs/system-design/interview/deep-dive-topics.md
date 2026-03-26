---
title: "Deep Dive Topics"
description: "What interviewers actually probe in system design deep dives — database schema design, API design, caching strategy, queue choice, consistency model, and scaling bottleneck identification with example 'good answers' including code and schema"
tags: [system-design, interview, deep-dive, preparation, senior]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Deep Dive Topics

After your high-level design, the interviewer will pick 1-2 areas and go deep. This is where senior candidates distinguish themselves. A junior draws boxes. A senior explains exactly how data flows through those boxes, what the database schema looks like, how the cache is invalidated, and what happens when things fail.

This page covers the 6 most common deep dive topics with example "good answers" that demonstrate senior-level thinking.

## Topic 1: Database Schema Design

**Interviewer says:** "Walk me through the database schema for this system."

### What They Are Testing

- Can you design normalized vs denormalized schemas appropriately?
- Do you understand indexing and query patterns?
- Can you choose the right partition key?
- Do you consider data access patterns, not just data storage?

### Good Answer: E-Commerce Order System

```sql
-- Core entities: Users, Products, Orders, Order Items

-- Users table: partitioned by user_id
CREATE TABLE users (
    user_id         BIGINT PRIMARY KEY,    -- Snowflake ID
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Products table: read-heavy, cache-friendly
CREATE TABLE products (
    product_id      BIGINT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    price_cents     INTEGER NOT NULL,       -- Store as cents to avoid float issues
    category_id     INTEGER NOT NULL,
    stock_quantity  INTEGER NOT NULL DEFAULT 0,
    version         INTEGER NOT NULL DEFAULT 1,  -- Optimistic locking
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

    INDEX idx_category (category_id),
    INDEX idx_price (price_cents),
    INDEX idx_name_search (name)            -- For text search
);

-- Orders table: sharded by user_id (queries are per-user)
CREATE TABLE orders (
    order_id        BIGINT PRIMARY KEY,     -- Snowflake ID (time-ordered)
    user_id         BIGINT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- PENDING -> PAYMENT_PROCESSING -> CONFIRMED -> SHIPPED -> DELIVERED -> CANCELLED
    total_cents     INTEGER NOT NULL,
    shipping_address JSONB NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

    INDEX idx_user_orders (user_id, created_at DESC),  -- "My orders" query
    INDEX idx_status (status, created_at DESC)          -- Admin: orders by status
);

-- Order items: always accessed with order
CREATE TABLE order_items (
    order_id        BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    quantity        INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,     -- Price at time of order (not current)

    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);
-- Note: unit_price_cents captures the price AT THE TIME OF PURCHASE
-- Never join to products.price_cents for order totals!
```

**What makes this a good answer:**
- Prices stored as integers (no floating point issues)
- Price captured at order time (products.price can change later)
- Indexes match query patterns explicitly stated
- Sharding key choice explained (user_id for "my orders" queries)
- Optimistic locking version field on products
- Status field uses an enum pattern with transitions documented

## Topic 2: API Design

**Interviewer says:** "What are the key API endpoints?"

### What They Are Testing

- RESTful conventions (resources, HTTP verbs, status codes)
- Pagination strategy (cursor vs offset)
- Error handling
- Idempotency
- API versioning

### Good Answer: Social Media Platform

```yaml
# POST /api/v1/posts — Create a post
# Request:
#   Body: { "content": "Hello world", "media_ids": ["m1", "m2"] }
#   Headers: Authorization: Bearer <token>
# Response: 201 Created
#   Body: { "post_id": "123", "content": "...", "created_at": "..." }
#   Headers: Location: /api/v1/posts/123

# GET /api/v1/feed?cursor={post_id}&limit=20 — Get home feed
# Response: 200 OK
# {
#   "posts": [
#     {
#       "post_id": "456",
#       "author": { "user_id": "789", "name": "Alice", "avatar_url": "..." },
#       "content": "...",
#       "media": [{ "url": "...", "type": "image" }],
#       "engagement": { "likes": 42, "comments": 7, "reposts": 3 },
#       "created_at": "2026-03-25T10:30:00Z"
#     }
#   ],
#   "pagination": {
#     "next_cursor": "455",
#     "has_more": true
#   }
# }

# POST /api/v1/posts/{post_id}/like — Like a post (idempotent)
# Response: 200 OK (even if already liked — idempotent)
# { "liked": true, "like_count": 43 }

# DELETE /api/v1/posts/{post_id}/like — Unlike
# Response: 200 OK
# { "liked": false, "like_count": 42 }
```

**Why cursor pagination, not offset:**

```python
# OFFSET pagination: breaks with real-time data
# If a new post is inserted while user paginating, they see duplicates or miss posts
# GET /feed?offset=20&limit=20
# SELECT * FROM feed WHERE user_id = ? ORDER BY created_at DESC OFFSET 20 LIMIT 20;
# Problem: OFFSET scans and discards rows — O(offset) performance

# CURSOR pagination: stable, performant
# GET /feed?cursor=1679750400000&limit=20
# The cursor is the created_at timestamp (or post_id) of the last item seen
# SELECT * FROM feed WHERE user_id = ? AND created_at < cursor
#   ORDER BY created_at DESC LIMIT 20;
# Uses index efficiently — always O(limit) regardless of page number
```

## Topic 3: Caching Strategy

**Interviewer says:** "How does caching work in your design?"

### What They Are Testing

- Cache-aside vs write-through choice with justification
- Cache invalidation strategy
- TTL selection rationale
- What to cache and what NOT to cache
- Cache failure handling (thundering herd, cache stampede)

### Good Answer: Product Catalog + Feed System

```python
class CachingStrategy:
    """Multi-layer caching for an e-commerce + social platform."""

    def __init__(self, redis, db):
        self.redis = redis
        self.db = db

    # === PRODUCT CATALOG: Cache-Aside ===
    # Products change rarely (hours/days), read millions of times
    # TTL: 1 hour with cache invalidation on update

    async def get_product(self, product_id: str) -> dict:
        # L1: Check Redis
        cached = await self.redis.get(f"product:{product_id}")
        if cached:
            return json.loads(cached)

        # L2: Database
        product = await self.db.get_product(product_id)
        if product:
            await self.redis.set(
                f"product:{product_id}",
                json.dumps(product),
                ex=3600  # 1 hour TTL
            )
        return product

    async def update_product(self, product_id: str, updates: dict):
        # Write to database first
        await self.db.update_product(product_id, updates)
        # Invalidate cache (not update — avoid race condition)
        await self.redis.delete(f"product:{product_id}")
        # Next read will populate cache with fresh data

    # === FEED TIMELINE: Write-Through ===
    # Pre-computed on write, served from cache on read
    # No TTL — invalidated by new posts

    async def get_timeline(self, user_id: str, limit: int = 50) -> list:
        # Read from Redis sorted set
        post_ids = await self.redis.zrevrange(
            f"timeline:{user_id}", 0, limit - 1
        )

        if not post_ids:
            # Cache miss: rebuild from database (cold start)
            posts = await self.db.get_timeline(user_id, limit)
            for post in posts:
                await self.redis.zadd(
                    f"timeline:{user_id}",
                    {post["id"]: post["timestamp"]}
                )
            return posts

        # Batch fetch post details (another cache layer)
        return await self.batch_get_posts(post_ids)

    async def add_to_timeline(self, user_id: str, post_id: str, timestamp: float):
        """Called by fanout service when a followed user posts."""
        await self.redis.zadd(f"timeline:{user_id}", {post_id: timestamp})
        # Trim to keep timeline cache bounded
        await self.redis.zremrangebyrank(f"timeline:{user_id}", 0, -1001)
        # Keep last 1000 posts

    # === CACHE STAMPEDE PREVENTION ===

    async def get_with_lock(self, key: str, fetch_fn, ttl: int = 3600):
        """Prevent thundering herd with distributed lock."""
        cached = await self.redis.get(key)
        if cached:
            return json.loads(cached)

        # Try to acquire lock (only one thread rebuilds cache)
        lock_key = f"lock:{key}"
        acquired = await self.redis.set(lock_key, "1", nx=True, ex=30)

        if acquired:
            try:
                data = await fetch_fn()
                await self.redis.set(key, json.dumps(data), ex=ttl)
                return data
            finally:
                await self.redis.delete(lock_key)
        else:
            # Another thread is rebuilding — wait and retry
            import asyncio
            await asyncio.sleep(0.1)
            return await self.get_with_lock(key, fetch_fn, ttl)
```

**What makes this a good answer:**
- Different strategies for different data (cache-aside for catalog, write-through for timeline)
- Explicit TTL choices with reasoning
- Invalidation strategy (delete, not update — avoids race conditions)
- Cache stampede prevention with distributed locking
- Timeline cache is bounded (trim old entries)

## Topic 4: Queue/Message Broker Choice

**Interviewer says:** "Why did you choose Kafka here? Would RabbitMQ work?"

### Good Answer

```markdown
I chose Kafka for the event streaming between services because:

1. **Multiple consumer groups**: Payment, Inventory, Notification, and Analytics
   services all need to independently process the same OrderPlaced event.
   Kafka supports multiple consumer groups natively. With RabbitMQ, I would
   need to set up a fanout exchange and multiple queues.

2. **Event replay**: When we deploy a new Analytics service, it needs to
   process historical events to backfill its data. Kafka retains events
   for a configurable period (7 days in our case). RabbitMQ deletes
   messages after consumption.

3. **Ordering guarantees**: Events for the same order must be processed in
   order (OrderPlaced before OrderShipped). Kafka guarantees ordering
   within a partition. We partition by order_id.

4. **Throughput**: At 10K events/second, Kafka handles this easily on a
   small cluster. RabbitMQ could handle it too, but would need more tuning.

I would use RabbitMQ for the image processing queue (task distribution to
workers with acknowledgments and retries) because:
- We need exactly one worker to process each image (competing consumers)
- We need dead letter queues for failed processing attempts
- We do not need replay or multiple consumer groups
- RabbitMQ's routing capabilities (exchanges, bindings) are simpler
  for point-to-point task distribution
```

## Topic 5: Consistency Model

**Interviewer says:** "What is the consistency model? What happens if the cache is stale?"

### Good Answer

```markdown
Let me walk through the consistency guarantees for each part of the system:

**User profile updates: Read-your-writes consistency**
When a user updates their name, they must see the new name immediately.
I route the updating user's subsequent reads to the primary database
for 5 seconds after a write, bypassing the cache and read replicas.
Other users may see the old name for up to 60 seconds (cache TTL).
This is acceptable — nobody notices if someone else's name change
is delayed by a minute.

**Inventory / stock counts: Strong consistency**
For the checkout flow, we use pessimistic locking with SELECT FOR UPDATE.
We cannot sell more items than we have. The tradeoff is reduced throughput
on hot products, which we mitigate by processing popular items on
dedicated database shards.

**Like counts: Eventual consistency**
Like counts on posts can be slightly stale. We use Redis INCR for real-time
counting and periodically persist to the database. If Redis goes down,
we lose some counts and reconcile from the database's at-least-once
event processing. Users seeing 1,042 likes instead of 1,045 is a
negligible inconsistency.

**Home feed: Eventual consistency (seconds)**
The feed is pre-computed by the fanout service. When someone you follow
posts, it appears in your feed within 1-5 seconds (time for event
processing + cache write). This is similar to how Twitter works —
you never notice a 2-second delay.
```

## Topic 6: Scaling Bottleneck

**Interviewer says:** "What breaks at 10x the current scale?"

### Good Answer

```markdown
At 10x our current scale (2M DAU -> 20M DAU):

**What does NOT break:**
- Application servers: stateless, just add more behind the load balancer
- CDN: handles scale natively
- Redis cache: we have headroom; can add more shards if needed

**What breaks:**
1. **Database writes:** Our single PostgreSQL primary handles ~10K writes/sec.
   At 10x, we need ~50K writes/sec.
   Fix: Shard the database by user_id. Orders, posts, and user data are
   all accessed per-user, making user_id a natural shard key.

2. **Fanout service:** A popular user posting now fans out to 10x more
   followers. The fanout queue depth will grow.
   Fix: Add more fanout workers (horizontal scaling). Switch more users
   to the "pull" model by lowering the celebrity threshold from 10K to 5K.

3. **Search indexing:** 10x more posts means 10x more indexing throughput.
   Fix: Add Elasticsearch nodes and increase the number of shards.
   Search indexing is already async, so it just needs more workers.

4. **Media storage costs:** 10x more uploads = 10x more S3 storage.
   Fix: More aggressive lifecycle policies (move to Glacier sooner),
   better compression, and deduplication.

The first thing I would actually fix is adding a caching layer in front
of the database for read queries. At our current scale we can get away
without it, but at 10x, the database would be overwhelmed by reads.
A Redis cache with 95% hit rate reduces database read load by 20x.
```

## Deep Dive Preparation Checklist

For each component in your design, be prepared to answer:

| Question | What to Cover |
|----------|-------------|
| "How is data stored?" | Schema, indexes, partition key, storage engine |
| "What is the API?" | Endpoints, request/response, pagination, idempotency |
| "How does the cache work?" | Strategy, TTL, invalidation, failure handling |
| "Why this queue?" | Kafka vs RabbitMQ vs SQS, ordering, replay, consumer groups |
| "What is the consistency model?" | Per-component consistency guarantee |
| "What breaks at 10x?" | Database, queue, cache, network, storage |
| "How do you monitor it?" | Key metrics, alerting thresholds, dashboards |
| "What if X fails?" | Failover, degradation, recovery procedure |

## Cross-References

- [System Design Interview Framework](/system-design/interview/framework) — Phase 4 is the deep dive
- [Discussing Tradeoffs](/system-design/interview/discussing-tradeoffs) — articulating deep dive choices
- [Database Selection Guide](/system-design/databases/database-selection-guide) — choosing the right database
- [Caching Strategies](/system-design/caching/caching-strategies) — cache patterns in depth
- [Consistency Patterns](/system-design/patterns/consistency-patterns) — consistency models explained
- [Kafka Internals](/system-design/message-queues/kafka-internals) — when they ask you to go deeper on Kafka

---

*The deep dive is where you prove you have built real systems. Theory gets you through the high-level design. Experience gets you through the deep dive. If you have not built distributed systems, simulate the experience by studying how real companies solved these problems — read engineering blogs from Uber, Netflix, Airbnb, and Stripe.*
