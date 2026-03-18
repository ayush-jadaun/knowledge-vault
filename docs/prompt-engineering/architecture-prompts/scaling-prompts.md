---
title: "Scaling Prompts: 25+ Prompts for Growth, Performance, and High Availability"
description: "Comprehensive prompt library for scaling systems horizontally, vertically, and architecturally — from database sharding to global CDN strategies"
tags: [prompt-engineering, scaling, performance, high-availability, database-sharding, caching, auto-scaling]
difficulty: "advanced"
prerequisites: [system-design-prompts]
lastReviewed: "2026-03-18"
---

# Scaling Prompts: 25+ Prompts for Growth, Performance, and High Availability

## Overview

Scaling is not a single problem — it's a family of problems that manifest differently depending on your bottleneck. These prompts help you identify bottlenecks, design solutions, and implement scaling strategies with precision.

## Capacity Planning Prompts

### 1. Back-of-Envelope Capacity Estimation

```
Help me do back-of-envelope capacity planning for [system].

Given:
- Current: [N] daily active users, [X] requests/second peak, [Y] GB data
- Projected: [N * growth] users in [timeframe]
- Key operations: [describe the most expensive operations]

Calculate:
1. **QPS**: Current and projected queries per second (peak = 2-3x average)
2. **Storage**: Data growth per day/month/year for each data type
3. **Bandwidth**: Ingress and egress estimates
4. **Compute**: CPU cores needed (rule of thumb: N connections / max connections per core)
5. **Cache**: Hot data size — what percentage of data is hot?
6. **Memory**: Cache size needed to hit [N]% cache hit rate

Show your work for each calculation. Use powers of 10 for approximation.
Round to the nearest order of magnitude.

Final output: "We need approximately [N] web servers, [M] database instances,
[P] cache nodes, serving [Q] requests/second with [R] GB data on day 1,
growing to [2Q] requests/second and [10R] GB in year 2."
```

### 2. Bottleneck Identification

```
Identify the scaling bottlenecks in this system.

System description: [describe architecture]
Current metrics:
- Throughput: [requests/second]
- Latency P99: [ms]
- CPU utilization: [%]
- Memory utilization: [%]
- Database connections: [N used / M max]
- Database query time P99: [ms]
- Cache hit rate: [%]
- Error rate: [%]

Load testing results: [describe what happens at 2x, 5x, 10x current load]

For each potential bottleneck:
1. Evidence that this IS the bottleneck (vs. red herring)
2. Theoretical maximum throughput with current setup
3. Short-term fix (< 1 week)
4. Long-term fix (< 3 months)
5. Estimated effort and risk

Prioritize: Which bottleneck will we hit first? Which has the highest ROI to fix?

Also flag: Bottlenecks that would be revealed only AFTER fixing the current one (second-order bottlenecks).
```

## Database Scaling Prompts

### 3. Database Read Scaling

```
Design a read scaling strategy for [database/service].

Current state:
- Database: [PostgreSQL/MySQL/MongoDB — version]
- Primary instance: [instance type, current utilization]
- Read pattern: [read-heavy? N reads per write? types of read queries?]
- Read/write ratio: [N:1]
- Latency requirement: [P99 target]

Options to evaluate:

1. **Read replicas**: Asynchronous replication, eventual consistency
   - How many replicas needed?
   - Replication lag acceptable?
   - How to route reads vs. writes?

2. **Caching layer**: Redis/Memcached in front of DB
   - What to cache (full results? fragments?)
   - Cache invalidation strategy
   - Expected cache hit rate?
   - Cache size needed

3. **Connection pooling**: PgBouncer, RDS Proxy
   - Current connection overhead
   - Pool size calculation

4. **Query optimization**: Before adding infrastructure
   - Missing indexes?
   - N+1 query patterns?
   - Expensive queries that can be rewritten?

Recommendation: Which combination of approaches for our specific situation?
Expected read capacity improvement: [N]x current.
```

### 4. Database Sharding Design

```
Design a database sharding strategy for [table/database].

Current state:
- Table: [table name, schema description]
- Row count: [current and projected]
- Query patterns: [how data is accessed — by user_id? by time? randomly?]
- Single instance limit: [when will current instance be insufficient?]

Sharding options:

1. **Hash sharding**: shard = hash(shard_key) % num_shards
   - Uniform distribution
   - Range queries are expensive (must query all shards)
   - Resharding is disruptive

2. **Range sharding**: shard = range_of(shard_key)
   - Efficient range queries
   - Hot spot risk (most recent time range gets all traffic)
   - New shards as ranges grow

3. **Directory sharding**: Lookup table maps key → shard
   - Most flexible
   - Lookup table is a potential bottleneck

4. **Consistent hashing**: Virtual nodes, add/remove shards without full reshuffle
   - Best for dynamic shard counts
   - More complex implementation

Shard key selection for our use case:
- Candidate keys: [list possible shard keys]
- Hot spot analysis: Which key distributes load most evenly?
- Cross-shard query analysis: Which queries would require scatter-gather?

Implementation:
- Database technology: Vitess / Citus / app-level sharding / cloud native (Aurora, Spanner)
- Migration: How to migrate from unsharded to sharded
- Application layer changes: Connection routing, transaction handling
```

### 5. Time-Series Data Scaling

```
Design a scaling strategy for time-series data in [application].

Data characteristics:
- Insert rate: [N events/second]
- Retention: [how long to keep data?]
- Query patterns: [aggregate over time ranges, latest values, specific point lookups]
- Cardinality: [number of unique series/metrics]

Database options:
1. **TimescaleDB**: PostgreSQL extension, familiar SQL, good for moderate scale
2. **InfluxDB**: Purpose-built, high write throughput, Flux query language
3. **ClickHouse**: OLAP column store, incredible aggregation performance
4. **Apache Druid**: Real-time analytics, pre-aggregation (rollup)
5. **OpenTSDB**: HBase-backed, massive scale, complex to operate
6. **Prometheus**: Metrics-specific, pull model, 1-year retention limit

For chosen technology:
- Schema / data model design
- Compression settings
- Rollup/downsampling strategy (reduce old data resolution)
- Query optimization for common patterns
- Retention policy
- Estimated storage per month

Hybrid approach: Hot data in time-series DB, cold data in object storage (S3/GCS) in Parquet format.
```

### 6. Connection Pool Optimization

```
Optimize database connection pooling for [application].

Current state:
- Application instances: [N]
- Connections per app instance: [current setting]
- Database max connections: [PostgreSQL default: 100]
- Connection pool tool: [none / PgBouncer / RDS Proxy / application pool]
- Observed issue: [connection exhaustion / high latency / connection refused]

Connection math:
- Total connections = app_instances × pool_size
- PostgreSQL: each connection uses ~5-10MB RAM
- With 100 max connections and 20 app instances: 5 connections each

Design:
1. **Application pool size**: Formula for optimal pool size per instance
   Recommended: pool_size = (core_count * 2) + effective_spindle_count

2. **PgBouncer configuration**:
   - mode: transaction (recommended) vs. session vs. statement
   - pool_size per database user
   - max_client_conn
   - Connection limits

3. **RDS Proxy** (AWS):
   - When to use vs. PgBouncer
   - Multiplexing behavior
   - Pinned connections (when does proxy not multiplex?)

4. **Application layer**:
   - Connection acquire timeout
   - Connection health check
   - Connection release on error

Provide: PgBouncer configuration for our setup.
```

## Application Layer Scaling Prompts

### 7. Horizontal Scaling Strategy

```
Design a horizontal scaling strategy for [application].

Application type: [stateless API / stateful service / WebSocket server]
Current: [N] instances
Target: [N * X] instances to handle projected load

For stateless applications:
1. **Load balancer configuration**: Algorithm (round-robin, least-connections, IP hash)
2. **Health checks**: Readiness vs. liveness probes, intervals, thresholds
3. **Session handling**: Sessions must move out of process (JWT vs. Redis sessions)
4. **File uploads**: Must use shared storage (S3) not local filesystem
5. **Background jobs**: Distributed job queue, not local cron
6. **Configuration**: Environment variables or config service, not local files

For stateful applications (WebSocket, long-running):
1. **Sticky sessions**: When needed, how to configure
2. **State externalization**: Moving state to Redis, database
3. **Consensus**: If multiple instances must agree (leader election)

Auto-scaling configuration:
- Kubernetes HPA: Which metrics to scale on (CPU, memory, custom queue depth metric)?
- Scale-out trigger: CPU > 70% for 5 minutes
- Scale-in: CPU < 30% for 15 minutes (slower to prevent flapping)
- Min/max instances

Provide: Kubernetes manifests for HPA + Deployment.
```

### 8. Queue-Based Load Leveling

```
Design a queue-based load leveling architecture for [high-volume operation].

Problem: [describe the spike — e.g., email notifications, image processing, report generation]
Current behavior: [synchronous processing, overloading the database / third-party API]
Goal: Smooth out spikes, decouple producers and consumers

Design:
1. **Queue technology selection**
   - SQS: AWS managed, at-least-once, no ordering guarantee by default
   - SQS FIFO: Exactly-once, ordered, 300 TPS limit
   - RabbitMQ: Flexible routing, complex topologies
   - Kafka: Durability, replay, high throughput, streaming
   - BullMQ (Redis): Simple, Node.js native, good for 1M jobs/day

2. **Job schema**: What data goes in the message
3. **Consumer design**:
   - Concurrency: How many workers process in parallel
   - Idempotency: How to handle duplicate delivery
   - Retry strategy: exponential backoff, max attempts
   - Dead letter queue: What to do with permanently failed jobs

4. **Backpressure**:
   - Queue depth alerting (alert when queue > N items for > T minutes)
   - Consumer auto-scaling based on queue depth (KEDA for Kubernetes)
   - Rate limiting producers during extreme spikes

5. **Observability**: Queue depth, processing rate, error rate, age of oldest message

Provide: TypeScript producer/consumer implementation for chosen queue technology.
```

### 9. Caching Architecture Design

```
Design a multi-tier caching architecture for [system].

Cache candidates:
[list what you might cache: API responses, database query results, computed values, sessions]

Tier 1: Application-level cache (in-process)
- Technology: Node.js Map, LRU-cache, p-memoize
- What to cache: Rarely changing reference data
- Size limit: [MB]
- Invalidation: TTL only (process restart clears it)
- Use case: Config values, feature flags

Tier 2: Distributed cache (Redis)
- What to cache: User sessions, frequently accessed records, computed results
- Cache key design: [namespace:entity:id] convention
- TTL strategy: Per data type based on staleness tolerance
- Eviction policy: allkeys-lru, allkeys-lfu, or volatile-lru?
- Cache stampede prevention: Mutex lock, background refresh, probabilistic early expiration

Tier 3: CDN cache (CloudFront/Fastly)
- What to cache: API responses that are public/user-specific
- Cache-Control headers
- Vary header for user-specific caches
- Surrogate-Control for CDN-specific TTL

Cache warming:
- On startup: Pre-populate critical cache entries
- On deploy: Warm cache for new feature before traffic switches over

Cache invalidation strategies:
- Event-driven: Publish cache invalidation events
- Write-through: Update cache and DB together
- Time-based: Accept stale data up to TTL

Provide: Redis client configuration and TypeScript caching layer implementation.
```

### 10. Auto-Scaling Configuration

```
Design auto-scaling for [application] on [Kubernetes / AWS ECS / AWS Lambda].

Application characteristics:
- Traffic pattern: [steady / spiky / predictable peaks]
- Startup time: [how long to boot a new instance]
- Resource usage: [CPU/memory correlation with traffic]
- Stateful considerations: [does state need to drain before scale-in?]

For Kubernetes HPA:
- Metrics to scale on:
  a. CPU utilization: most common, works for CPU-bound apps
  b. Memory utilization: careful — memory pressure is a bad scale metric
  c. Custom metrics: requests per second, queue depth (via KEDA)
  d. External metrics: SQS queue depth

- HPA configuration:
  - targetCPUUtilizationPercentage: [recommend 60-70%, not 80%+]
  - minReplicas, maxReplicas
  - behavior: scaleUp (fast) and scaleDown (slow, to prevent flapping)

For predictive scaling (AWS):
- Load-based scaling: React to metrics
- Scheduled scaling: Pre-scale before known peak times
- ML-based: AWS Predictive Scaling (uses historical patterns)

Scale-in safety:
- PodDisruptionBudget: Ensure minimum availability during scale-in
- preStop hook + sleep: Allow in-flight requests to complete
- Connection draining: Graceful shutdown

Provide: Kubernetes HPA YAML + PodDisruptionBudget YAML.
```

## CDN and Edge Prompts

### 11. CDN Architecture for Global Applications

```
Design a CDN strategy for a globally distributed [application type].

Requirements:
- User locations: [list regions with approximate percentage of traffic]
- Content types: [static assets, API responses, media files]
- Dynamic vs. static ratio: [%dynamic / %static]
- Latency requirement: [P99 globally]
- Cost sensitivity: [CDN cost budget or tolerance]

CDN provider selection:
1. **Cloudflare**: Best edge network (270+ PoPs), best DDoS protection, Workers for edge compute
2. **Fastly**: Best for programmable CDN, VCL scripting, real-time purge
3. **CloudFront (AWS)**: Best if you're AWS-native, Lambda@Edge for compute
4. **Akamai**: Largest network, enterprise, most expensive

Static asset strategy:
- Long-lived cache (1 year) with content-addressed URLs (hash in filename)
- Brotli + gzip compression
- HTTP/2 or HTTP/3 push hints
- Preconnect and preload headers

API caching strategy:
- Which endpoints are cacheable? (GET with no user-specific data)
- Vary headers for user-specific responses
- Cache-Control: stale-while-revalidate for performance
- Cache-Control: no-store for sensitive data

Edge compute (if applicable):
- What logic to move to the edge?
- Auth token validation at edge
- A/B testing at edge
- Request routing based on user attributes

Also design: Multi-CDN strategy for failover and performance optimization.
```

### 12. Edge Caching for API Responses

```
Design edge caching for [API/service] responses.

API description: [describe endpoints, what data they return]
Traffic: [requests/second, read/write ratio]
Cache candidates: [which endpoints could be cached]

Cache key design:
- Which request attributes determine the response?
- User-specific: Must include user identifier in cache key
- Locale-specific: Language, currency, timezone
- Query parameters: Which parameters affect the response?

Surrogate keys / cache tags:
- Tag responses with entity IDs so you can invalidate by entity
- Example: Cache "product list page" tagged with product IDs in the response
- When product 123 changes, purge all pages tagged with product-123

Cache warming:
- Pre-populate cache after deploy for common requests
- Parallel warmup script

Stale-while-revalidate pattern:
- Serve stale content instantly
- Revalidate in background
- Never have a slow "cold" response

CDN configuration:
- CloudFront behavior rules
- Cache-Control headers your API should set
- X-Cache diagnostic headers

Instrumentation:
- Cache hit rate by endpoint
- Cache miss latency vs. hit latency
- Cache efficiency (cost savings from cache)
```

## Database-Specific Scaling Prompts

### 13. PostgreSQL Scaling Deep Dive

```
Design a PostgreSQL scaling strategy for [workload description].

Current state:
- Instance: [instance type, size]
- Tables: [describe largest tables, row counts]
- Query mix: [read/write ratio, OLTP vs. analytics queries]
- Current performance: [slow query log findings]

Optimization layers (in order before scaling hardware):

1. **Query optimization**:
   - EXPLAIN ANALYZE for slow queries
   - Index coverage
   - Avoid seq scans on large tables
   - Partition large tables by date or range

2. **Connection management**:
   - PgBouncer in transaction mode
   - max_connections tuning

3. **Configuration tuning**:
   - shared_buffers: 25% of RAM
   - effective_cache_size: 75% of RAM
   - work_mem: RAM / max_connections / 4 (for sort operations)
   - wal_buffers: 64MB
   - checkpoint_completion_target: 0.9

4. **Read replicas**:
   - Streaming replication setup
   - read_replica_count = read_qps / (write_qps * replication_factor)

5. **Partitioning**:
   - Table partitioning for large tables (declarative partitioning)
   - Partition key selection
   - Partition pruning for query performance

6. **CITUS (horizontal scaling)**:
   - When single-node PostgreSQL is insufficient
   - Distribution column selection
   - Colocation for JOIN performance

Provide: postgresql.conf settings, index creation scripts, partition setup SQL.
```

### 14. Redis Scaling and Clustering

```
Design a Redis architecture for [use case at scale].

Current usage: [describe: session store / cache / queue / rate limiter / pub-sub]
Scale target: [QPS, memory, persistence requirements]

Single-instance limits:
- Single-threaded (mostly): max ~100K-200K ops/second
- Memory bound by instance size
- No built-in HA

Options:
1. **Redis Sentinel**: Primary/replica with automatic failover
   - Good for: HA without horizontal scale
   - Limitation: All data fits on single node

2. **Redis Cluster**: Sharded across 3+ primary nodes
   - Good for: Data > single node memory, horizontal scale
   - Limitation: Multi-key operations restricted to same slot
   - Hash tags: {user_id}:session to co-locate related keys

3. **Redis ElastiCache / Redis Cloud / Upstash**: Managed options
   - ElastiCache: AWS-native, good integration
   - Upstash: Serverless, per-request pricing, HTTP API
   - Redis Cloud: Managed Redis, more features

Keyspace design:
- Key naming: namespace:entity:id
- Key expiration: Every key should have TTL
- Memory optimization: Use hashes for related data (hash overhead < individual string overhead for small datasets)
- Key size: Keep keys short (bytes matter at millions of keys)

Data types selection:
- String: Simple values, counters
- Hash: Object properties (user profile)
- List: Recent activity, queues
- Set: Unique membership (online users)
- Sorted Set: Leaderboard, rate limiting with sliding window
- Stream: Event log, message queue

Provide: Redis Cluster configuration, Sentinel configuration, application connection setup.
```

## Performance Engineering Prompts

### 15. Load Testing Strategy

```
Design a load testing strategy for [system].

System: [describe what you're testing]
Scenarios to test:
1. Baseline performance (current traffic)
2. Target performance (where we need to be)
3. Breaking point (where does the system fail and how?)
4. Spike test (sudden traffic increase)
5. Soak test (sustained load for [duration])
6. Stress test (gradual ramp until failure)

Tool selection:
- **k6**: JavaScript-based, good for developers, cloud execution option
- **Locust**: Python, very flexible, easy to write complex scenarios
- **JMeter**: Enterprise, GUI, Java — older but widely known
- **Artillery**: Node.js, YAML-based, good for REST/WebSocket/GraphQL
- **Gatling**: Scala DSL, high performance, good reports

For chosen tool:
- Test script for the most critical user journey
- Virtual user ramp-up profile
- Assertions (fail if P99 > [N]ms, error rate > [X]%)
- Output: What metrics to capture and report

Pre-test checklist:
- Test in production-like environment (not staging with 10% resources)
- Warm up caches before testing
- Notify infrastructure monitoring team
- Have rollback ready if test causes real issues

Post-test analysis:
- Where did latency increase first?
- What resource became saturated?
- What errors appeared and at what load level?
```

### 16. Performance Profiling and Optimization

```
Create a performance profiling and optimization plan for [language/platform].

Platform: [Node.js / Python / Go / Java]
Problem: [high CPU / memory leak / slow database / high latency]

Profiling approach:
1. **CPU profiling**: Flame graph generation
   - Node.js: clinic.js, 0x, built-in --prof
   - Go: pprof
   - Python: py-spy, cProfile
   - Java: async-profiler, JFR

2. **Memory profiling**: Heap snapshot, allocation tracking
   - Node.js: V8 heap snapshot in Chrome DevTools
   - Go: runtime/pprof memprofile
   - Python: memory_profiler, tracemalloc
   - Java: heap dump analysis with Eclipse MAT

3. **I/O profiling**: Database queries, HTTP calls
   - Use distributed tracing to find slow I/O
   - Database slow query log
   - HTTP client instrumentation

4. **Continuous profiling**: In production
   - Datadog Continuous Profiler
   - Pyroscope (open source)
   - Grafana Beyla (eBPF-based)

Common optimization patterns:
- Avoid N+1 queries (use DataLoader / eager loading)
- Connection pool sizing
- Async/await correctness (avoid unintended serialization)
- Memory allocation patterns (reduce GC pressure)
- String concatenation in loops

Provide: Step-by-step profiling guide with tool commands.
```

## Global Scale Prompts

### 17. Multi-Region Active-Active Architecture

```
Design an active-active multi-region architecture for [application].

Regions: [list target regions and why — latency, compliance, availability]
Requirements:
- Availability target: [99.99%? That requires multi-region]
- Data consistency: [can users write to any region? must reads be consistent?]
- RTO: [max time to recover from region failure]
- RPO: [max data loss tolerable in region failure]

Components to design:

1. **Traffic routing**:
   - Latency-based routing (Route 53, Cloudflare Load Balancing)
   - Health-check failover between regions
   - Geolocation-based routing for compliance

2. **Data replication**:
   - Database: CockroachDB, Aurora Global, Cloud Spanner
   - Cache: Cross-region Redis replication (or build separately per region)
   - Sessions: Where do sessions live?

3. **Conflict resolution**:
   - If user can write to any region: How to resolve conflicts?
   - Last-write-wins (use timestamp)
   - Application-level merge logic
   - Operational transform (for collaborative editing)

4. **Service discovery**:
   - How do services in Region A call services in Region B?
   - Cross-region mTLS

5. **Deployment**:
   - Blue-green across regions
   - Canary: Deploy to one region first, then expand

6. **Data sovereignty**:
   - EU user data stays in EU (GDPR)
   - Data routing at application layer vs. database layer

Trade-off analysis: Active-active adds 5-10x operational complexity. Is multi-region active-passive sufficient?
```

### 18. Cost-Performance Optimization

```
Optimize the price-to-performance ratio of [infrastructure].

Current monthly cost: $[amount]
Performance: [current metrics]
Budget target: $[target] (or: same budget, improve performance by [X]%)

Cost breakdown:
[paste or estimate: compute, database, storage, networking, monitoring]

Optimization opportunities to evaluate:

1. **Right-sizing compute**:
   - Current utilization: CPU [%], Memory [%]
   - If CPU < 40% and memory < 60%: downsize instance type
   - If memory-bound: Switch to memory-optimized instances

2. **Reserved instances / Committed Use Discounts**:
   - 1-year RI: ~30-40% savings
   - 3-year RI: ~60% savings
   - Which instances are good candidates? (stable, predictable usage)

3. **Spot instances for non-critical workloads**:
   - Spot interruption handling
   - Good candidates: batch jobs, test environments, auto-scaling buffer

4. **Data transfer costs**:
   - Biggest hidden cost in cloud bills
   - Cross-AZ data transfer: consolidate services in same AZ
   - CDN to serve traffic from edge, not origin

5. **Storage tiering**:
   - S3: Standard → Intelligent-Tiering → IA → Glacier based on access frequency
   - Database: Archive old data out of expensive primary DB

Output: Prioritized savings opportunities table (savings/month | implementation effort | risk).
```

## Scaling War Stories as Prompts

### 19. Thundering Herd Prevention

```
Design a solution for the thundering herd problem in [scenario].

Problem: [describe — when cache expires, all requests hit the database simultaneously / when a hot page goes viral and overwhelms origin / when a scheduled job fan-out overwhelms downstream services]

Solutions to evaluate:

1. **Probabilistic early expiration** (also called jitter TTL):
   - Each cache item expires slightly earlier with increasing probability
   - Prevents all items expiring at exactly the same time
   - Formula: TTL * (1 - random() * 0.1) for 10% jitter window

2. **Mutex / distributed lock**:
   - First request acquires lock, fetches from DB
   - Concurrent requests wait for lock, then read from cache
   - Timeout on lock acquisition to prevent deadlock

3. **Background refresh**:
   - Cache items are refreshed before they expire
   - Always serve from cache (never miss)
   - Async refresh doesn't block the request

4. **Request coalescing**:
   - Multiple identical concurrent requests are collapsed to one
   - Promise/Future shared between all callers
   - Only one DB call made regardless of concurrent request count

5. **Staggered cache warm-up**:
   - After deploy or cache flush, warm up incrementally
   - Don't invalidate all cache entries simultaneously

Implement [chosen solution] in TypeScript with Redis.
```

### 20. Database Query Optimization at Scale

```
Optimize these slow database queries for [scale].

Slow queries:
[paste EXPLAIN ANALYZE output or describe query patterns]

Performance targets:
- P99 latency: [current] → [target]
- Throughput: [current QPS] → [target QPS]

Optimization techniques to apply:

1. **Index strategy**:
   - Identify sequential scans that need indexes
   - Covering indexes for frequently queried columns
   - Partial indexes for queries with common filters
   - Composite index column order (most selective first)

2. **Query rewriting**:
   - Avoid SELECT * — specify columns
   - Push filters down (WHERE before JOIN)
   - Avoid functions on indexed columns (WHERE YEAR(created_at) = 2024 vs. date range)
   - CTEs vs. subqueries vs. joins (optimizer may handle differently)

3. **N+1 detection and fix**:
   - Identify N+1 query patterns in the code
   - DataLoader pattern for batching
   - JOIN or IN clause to batch

4. **Pagination optimization**:
   - Offset pagination is O(n) at high offsets — cursor pagination instead
   - Keyset pagination: WHERE id > :last_seen_id ORDER BY id LIMIT 20

5. **Partitioning**:
   - Partition pruning eliminates full table scans
   - Partition key selection

For each optimization: current EXPLAIN ANALYZE → expected EXPLAIN ANALYZE after change.
```

### 21. Rate Limiting at Scale

```
Design a rate limiting system that works across [N] API servers.

Requirements:
- Limits: [per-user / per-API-key / per-IP / per-endpoint]
- Accuracy: [exact / approximate — approximate is faster and cheaper]
- Distributed: [N] API servers must share rate limit state
- Response: Headers indicating limit, remaining, reset time

Algorithms to compare:
1. **Fixed window**: Simple, allows burst at window boundary
2. **Sliding window log**: Accurate, high memory (stores timestamps)
3. **Sliding window counter**: Good accuracy, memory efficient
4. **Token bucket**: Allows bursting, smooth average rate
5. **Leaky bucket**: Consistent output rate, no bursting

For token bucket at scale:
- Redis-based implementation with Lua scripts (atomic operations)
- Local estimation + Redis sync (for lower Redis load)
- Approximate counting with probabilistic data structures

Redis Lua script for token bucket:
[provide or request implementation]

HTTP headers to set:
- X-RateLimit-Limit: [limit]
- X-RateLimit-Remaining: [tokens remaining]
- X-RateLimit-Reset: [Unix timestamp when limit resets]
- Retry-After: [seconds to wait if 429]

Handling rate limit bypass attempts:
- Distributed IPs but same account
- Request forgery of rate limit headers
- Clock skew between servers

Scale considerations:
- At 100K req/sec: Redis can handle this
- At 1M req/sec: Local counting with Redis sync (acceptably approximate)
- At 10M req/sec: Distributed approximate counting (HyperLogLog, Count-Min Sketch)
```

### 22. Scaling WebSocket Connections

```
Design a WebSocket scaling architecture.

Application: [describe what WebSockets are used for — real-time chat, notifications, collaborative editing, live data]
Scale: [concurrent WebSocket connections target]
Current problem: [sticky sessions to single server, can't scale beyond one server]

Architecture:
1. **Connection server layer**: N servers, each holding [M] connections
   - Each connection server is one process (Node.js cluster for multi-core)
   - Connections are persistent — horizontal scale requires session migration or message routing

2. **Message routing**:
   - Problem: Client on Server A needs a message from an event on Server B
   - Solution: Pub/sub backbone (Redis pub/sub, Kafka)
   - Each server subscribes to events for its connected clients

3. **Presence tracking**:
   - Which users are connected, to which server
   - Redis sorted set: user_id → server_id + timestamp
   - TTL for cleanup of stale presence data

4. **Connection migration**:
   - Client reconnects after server restart/deploy
   - Resume from last seen event
   - Sequence numbers or event IDs for ordered delivery

5. **Load balancer configuration**:
   - Sticky sessions (IP hash) for WebSocket upgrades
   - Connection draining for graceful deploys
   - Health check: WebSocket upgrade, not just HTTP

Kubernetes specifics:
- WebSocket-aware Ingress (nginx, Traefik)
- PreStop hook + sleep for graceful drain
- PodDisruptionBudget to prevent mass disconnection during deploys

Provide: Node.js/TypeScript WebSocket server with Redis pub/sub for cross-server messaging.
```

## Advanced Scaling Prompts

### 23. Microservices at Scale

```
Address these scaling challenges in our microservices architecture.

Current situation:
- [N] microservices
- [M] engineers / [K] teams
- Key metrics: [describe current performance and pain points]

Challenges to solve:

1. **Service discovery at scale**:
   - Client-side load balancing vs. server-side
   - Health check overhead with many services
   - DNS TTL vs. real-time health

2. **Distributed tracing overhead**:
   - Trace data volume at 100K req/sec
   - Sampling strategies (1%, 10%, 100% for errors)
   - Tail-based sampling (sample after seeing full trace)

3. **Configuration management**:
   - Service configuration at scale (100 services × 5 environments)
   - Secret rotation without downtime
   - Feature flags across services

4. **Inter-service latency**:
   - P99 latency budget allocation across service hops
   - 100ms budget / 5 service calls = 20ms per call
   - Circuit breakers to prevent cascading failures

5. **Deployment coordination**:
   - Rolling deploys across dependent services
   - API version compatibility during deploys
   - Consumer-driven contract testing

6. **Observability at scale**:
   - Log volume management (sampling, aggregation)
   - Metric cardinality explosion
   - Dashboard sprawl

For each: current best practice recommendation + implementation guidance.
```

### 24. Data Consistency Patterns

```
Design data consistency patterns for [distributed system scenario].

Scenario: [describe the data that needs to be consistent — user profile across services, inventory count across regions, etc.]

Consistency levels to understand:
1. **Strong consistency**: All reads see latest write. Simple but expensive.
2. **Sequential consistency**: Operations appear in some sequential order, same for all processes.
3. **Causal consistency**: Causally related operations are seen in order.
4. **Eventual consistency**: All nodes will eventually have same data. Fast but complex.
5. **Read-your-writes**: You always read your own writes (subset of causal).

CAP theorem applied:
- Our system must be: [Consistent + Available / Consistent + Partition Tolerant / Available + Partition Tolerant]
- What we sacrifice: [explain trade-off]

Patterns to implement:
1. **Saga**: Distributed transactions via compensating actions
2. **Outbox pattern**: Reliably publish events after DB write
3. **Two-phase commit**: Synchronous, strongly consistent, tightly coupled
4. **CRDT**: Conflict-free eventual consistency for specific data types
5. **Vector clocks**: Track causality across distributed nodes

For our use case:
- Which consistency level is sufficient for each operation?
- What is the user-visible impact of inconsistency?
- What is the operational cost of stronger consistency?

Provide: Implementation of [chosen pattern] in TypeScript.
```

### 25. Observability at Scale

```
Design an observability strategy for a system processing [N] million events/day.

Scale challenges:
- Log volume: [GB/day]
- Metric time series: [cardinality — number of unique label combinations]
- Trace volume: [traces/second]
- Cost: [current observability spend]

Scaling strategies:

1. **Log management at scale**:
   - Log sampling: 100% error logs, 10% info, 1% debug
   - Structured logging for efficient querying
   - Log aggregation: Loki vs. Elasticsearch vs. S3 + Athena
   - Retention tiers: 7 days hot, 30 days warm, 1 year cold

2. **Metrics cardinality control**:
   - High cardinality labels destroy Prometheus performance
   - Never use user IDs, request IDs in label values
   - Histogram for latency (not gauge per request)
   - Recording rules for pre-aggregation

3. **Trace sampling**:
   - Head-based sampling: Decide at trace start (simple, misses long-tail errors)
   - Tail-based sampling: Decide after trace completes (catches all errors, complex)
   - Collector: OpenTelemetry Collector with sampling processor

4. **Cost optimization**:
   - Metrics: Recording rules + remote_write to long-term storage (Thanos, Cortex, Mimir)
   - Traces: Tail-based sampler keeps 100% of error traces, 1% of success
   - Logs: Index only searchable fields, compress raw logs to S3

5. **Dashboards and alerts at scale**:
   - Alert fatigue: Symptom-based alerts > cause-based
   - Dashboard standards: SLO dashboard per service
   - Runbook links in all alerts

Provide: OpenTelemetry Collector configuration for sampling + cost-optimized observability stack recommendation.
```

## Prompt Patterns for Scaling Work

### The Scaling Constraint Pattern

Add these constraints to any scaling prompt for more grounded output:

```
Additional constraints for realistic scaling advice:
- We have [N] engineers to implement and maintain this
- Our team expertise in [technology] is [beginner/intermediate/expert]
- We are on AWS / GCP / Azure [region]
- We cannot change our primary database ([technology]) for at least [timeframe]
- Our monthly budget for this system is $[amount]
- We need this in production in [timeframe]
```

### The Incremental Scaling Pattern

```
Design a scaling roadmap for [system] that we can execute incrementally.

Current state: [describe]
Target state: [10x / 100x current scale]

Design a 3-phase roadmap:
- Phase 1 (Week 1-4, "Quick wins"): Optimizations with minimal risk
- Phase 2 (Month 2-3, "Architecture changes"): Structural improvements
- Phase 3 (Month 4-6, "Scaling infrastructure"): New infrastructure components

For each phase: what changes, expected improvement, risk, rollback plan.
```

::: tip
The most effective scaling prompt is one that describes your current metrics. "How do I scale?" is vague. "My PostgreSQL is at 80% CPU with 5,000 connections and P99 latency of 800ms at 10,000 QPS — what do I scale first?" has a specific, actionable answer.
:::
