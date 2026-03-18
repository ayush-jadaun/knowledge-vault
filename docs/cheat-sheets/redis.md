---
title: "Redis Cheat Sheet"
description: "Quick reference for Redis data types, commands, patterns, Lua scripting, and cluster commands"
tags: [cheat-sheet, redis, caching]
difficulty: "intermediate"
lastReviewed: "2026-03-18"
---

# Redis Cheat Sheet

Quick reference for Redis data types, essential commands, common patterns, Lua scripting, and cluster operations.

**Deep dive**: [Redis Internals](/system-design/databases/redis-internals) | [Redis Caching Patterns](/system-design/caching/redis-caching-patterns) | [Redis Streams](/system-design/message-queues/redis-streams)

---

## Connection & Server

| Command | Description |
|---------|-------------|
| `redis-cli` | Connect to local Redis |
| `redis-cli -h host -p 6379 -a password` | Connect with auth |
| `redis-cli --tls` | Connect with TLS |
| `PING` | Test connection (returns PONG) |
| `AUTH password` | Authenticate |
| `SELECT 0` | Switch to database 0 |
| `DBSIZE` | Number of keys in current DB |
| `INFO` | Server info and stats |
| `INFO memory` | Memory usage details |
| `INFO keyspace` | Keys per database |
| `CONFIG GET maxmemory` | Get config value |
| `CONFIG SET maxmemory 1gb` | Set config at runtime |
| `MONITOR` | Real-time command stream (debug only) |
| `SLOWLOG GET 10` | Last 10 slow commands |
| `CLIENT LIST` | Connected clients |
| `FLUSHDB` | Delete all keys in current DB |
| `FLUSHALL` | Delete all keys in all DBs |

---

## Data Types & Commands

### Strings

The simplest type. Stores text, numbers, or binary data up to 512 MB.

```redis
SET key "value"                  -- Set a key
SET key "value" EX 3600          -- Set with 1 hour TTL
SET key "value" NX               -- Set only if not exists
SET key "value" XX               -- Set only if exists
SETNX key "value"                -- Set if not exists (atomic)
MSET k1 "v1" k2 "v2"            -- Set multiple
GET key                          -- Get value
MGET k1 k2 k3                   -- Get multiple
GETSET key "new"                 -- Set and return old value
INCR counter                     -- Increment by 1
INCRBY counter 5                 -- Increment by 5
DECR counter                     -- Decrement by 1
INCRBYFLOAT price 0.5            -- Increment float
APPEND key " more"               -- Append to string
STRLEN key                       -- String length
GETRANGE key 0 4                 -- Substring
```

### Hashes

Key-value pairs within a key. Perfect for objects.

```redis
HSET user:1 name "Alice" age 30 email "alice@ex.com"
HGET user:1 name                 -- Get single field
HMGET user:1 name email          -- Get multiple fields
HGETALL user:1                   -- Get all fields and values
HDEL user:1 email                -- Delete field
HEXISTS user:1 name              -- Check field exists
HKEYS user:1                     -- All field names
HVALS user:1                     -- All values
HLEN user:1                      -- Number of fields
HINCRBY user:1 age 1             -- Increment numeric field
HSETNX user:1 name "Bob"         -- Set field only if not exists
```

### Lists

Ordered collection of strings. Doubly-linked list under the hood.

```redis
LPUSH queue "item1"              -- Push to head
RPUSH queue "item2"              -- Push to tail
LPOP queue                       -- Pop from head
RPOP queue                       -- Pop from tail
BLPOP queue 30                   -- Blocking pop (30s timeout)
BRPOP queue 30                   -- Blocking pop from tail
LLEN queue                       -- List length
LRANGE queue 0 -1                -- Get all elements
LRANGE queue 0 9                 -- Get first 10
LINDEX queue 0                   -- Get by index
LSET queue 0 "new"               -- Set by index
LTRIM queue 0 99                 -- Keep only first 100
LPOS queue "item1"               -- Find position
LMOVE src dst LEFT RIGHT         -- Move between lists
```

### Sets

Unordered collection of unique strings.

```redis
SADD tags "redis" "cache" "db"   -- Add members
SREM tags "db"                   -- Remove member
SISMEMBER tags "redis"           -- Check membership
SMEMBERS tags                    -- All members
SCARD tags                       -- Set size
SRANDMEMBER tags 2               -- 2 random members
SPOP tags                        -- Remove and return random
SUNION tags1 tags2               -- Union
SINTER tags1 tags2               -- Intersection
SDIFF tags1 tags2                -- Difference (in tags1 not in tags2)
SUNIONSTORE dest tags1 tags2     -- Store union result
```

### Sorted Sets

Like sets but each member has a score. Sorted by score.

```redis
ZADD leaderboard 100 "alice"     -- Add with score
ZADD leaderboard 95 "bob" 110 "charlie"
ZSCORE leaderboard "alice"       -- Get score
ZRANK leaderboard "alice"        -- Rank (0-based, low to high)
ZREVRANK leaderboard "alice"     -- Rank (high to low)
ZRANGE leaderboard 0 9           -- Top 10 (low to high)
ZREVRANGE leaderboard 0 9        -- Top 10 (high to low)
ZRANGEBYSCORE lb 90 100          -- Members with score 90-100
ZRANGEBYSCORE lb -inf +inf       -- All by score
ZCARD leaderboard                -- Set size
ZCOUNT leaderboard 90 100        -- Count in score range
ZINCRBY leaderboard 5 "alice"    -- Increment score
ZREM leaderboard "bob"           -- Remove member
ZREMRANGEBYRANK lb 0 -4          -- Keep only top 3
ZRANGEBYSCORE lb 90 100 LIMIT 0 5 -- Paginate
```

### Streams

Append-only log structure for event streaming.

```redis
XADD stream * field1 value1      -- Append entry (auto-ID)
XADD stream 1234-0 field1 value1 -- Append with specific ID
XLEN stream                      -- Stream length
XRANGE stream - +                -- All entries
XRANGE stream - + COUNT 10       -- First 10 entries
XREVRANGE stream + -             -- Reverse order
XREAD COUNT 10 STREAMS stream 0  -- Read from beginning
XREAD BLOCK 5000 STREAMS s $     -- Block-read new entries (5s)

-- Consumer groups
XGROUP CREATE stream group 0     -- Create consumer group
XREADGROUP GROUP group consumer COUNT 10 STREAMS stream >
XACK stream group id             -- Acknowledge message
XPENDING stream group            -- Pending messages info
XCLAIM stream group consumer 60000 id -- Claim stale message
```

---

## Key Management

| Command | Description |
|---------|-------------|
| `EXISTS key` | Check if key exists |
| `DEL key` | Delete key (blocking) |
| `UNLINK key` | Delete key (non-blocking) |
| `TYPE key` | Get key type |
| `RENAME key newkey` | Rename key |
| `EXPIRE key 3600` | Set TTL in seconds |
| `PEXPIRE key 60000` | Set TTL in milliseconds |
| `EXPIREAT key timestamp` | Set expiry at Unix time |
| `TTL key` | Remaining TTL in seconds |
| `PTTL key` | Remaining TTL in milliseconds |
| `PERSIST key` | Remove expiry |
| `KEYS pattern` | Find keys (NEVER in production) |
| `SCAN 0 MATCH "user:*" COUNT 100` | Iterate keys safely |
| `OBJECT ENCODING key` | Internal encoding |
| `MEMORY USAGE key` | Memory used by key |
| `DUMP key` | Serialize key |
| `RESTORE key 0 data` | Deserialize key |

::: warning
Never use `KEYS *` in production. It blocks the server. Always use `SCAN` instead.
:::

---

## Common Patterns

### Cache-Aside Pattern

```
Read:  Check cache -> miss -> read DB -> write cache -> return
Write: Write DB -> invalidate cache
```

```redis
-- Read: check cache first
GET user:123
-- If nil, read from DB and cache
SET user:123 "{json}" EX 3600

-- Write: invalidate after DB write
DEL user:123
```

### Distributed Lock

```redis
-- Acquire lock (NX = only if not exists, EX = TTL)
SET lock:resource unique_id NX EX 30

-- Release lock (only if we own it) -- use Lua for atomicity
EVAL "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end" 1 lock:resource unique_id
```

### Rate Limiter (Sliding Window)

```redis
-- Using sorted set for sliding window
ZADD ratelimit:user:123 <now_ms> <request_id>
ZREMRANGEBYSCORE ratelimit:user:123 0 <now_ms - window_ms>
ZCARD ratelimit:user:123
EXPIRE ratelimit:user:123 <window_seconds>
```

### Pub/Sub

```redis
-- Subscriber
SUBSCRIBE channel
PSUBSCRIBE "events:*"           -- Pattern subscribe

-- Publisher
PUBLISH channel "message"
```

### Session Storage

```redis
-- Store session as hash
HSET session:abc123 user_id 42 role "admin" created_at 1234567890
EXPIRE session:abc123 86400     -- 24 hour TTL

-- Extend session on activity
EXPIRE session:abc123 86400     -- Reset TTL

-- Get session
HGETALL session:abc123
```

### Counter with Expiry

```redis
-- Page view counter (daily)
INCR pageviews:2026-03-18:/home
EXPIRE pageviews:2026-03-18:/home 172800  -- Keep 2 days
```

### Leaderboard

```redis
-- Add/update score
ZINCRBY leaderboard 10 "player:42"

-- Get top 10
ZREVRANGE leaderboard 0 9 WITHSCORES

-- Get player rank (1-based)
ZREVRANK leaderboard "player:42"  -- Add 1 for 1-based
```

---

## Lua Scripting

### Why Lua?

- Atomic execution (no other commands run during script)
- Reduce round trips (multiple operations in one call)
- Complex conditional logic

### Basic Syntax

```redis
EVAL "return redis.call('GET', KEYS[1])" 1 mykey
-- KEYS[1] = first key argument
-- ARGV[1] = first non-key argument

-- Multi-command script
EVAL "
  local current = redis.call('GET', KEYS[1])
  if current then
    return redis.call('INCR', KEYS[1])
  else
    redis.call('SET', KEYS[1], ARGV[1])
    return tonumber(ARGV[1])
  end
" 1 counter 100
```

### Common Lua Scripts

```redis
-- Compare and delete (safe lock release)
EVAL "
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
" 1 lock:resource owner_id

-- Rate limiter (fixed window)
EVAL "
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local current = redis.call('INCR', key)
  if current == 1 then
    redis.call('EXPIRE', key, window)
  end
  if current > limit then
    return 0
  end
  return 1
" 1 ratelimit:user:123 100 60

-- Get or set with TTL
EVAL "
  local val = redis.call('GET', KEYS[1])
  if val then
    return val
  end
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  return ARGV[1]
" 1 cache:key "computed_value" 3600
```

### Loading Scripts

```redis
-- Load script and get SHA
SCRIPT LOAD "return redis.call('GET', KEYS[1])"
-- Returns SHA hash

-- Execute by SHA (more efficient)
EVALSHA <sha> 1 mykey

-- Check if script is cached
SCRIPT EXISTS <sha>
```

---

## Cluster Operations

### Cluster Info

| Command | Description |
|---------|-------------|
| `CLUSTER INFO` | Cluster state overview |
| `CLUSTER NODES` | All nodes and slots |
| `CLUSTER SLOTS` | Slot-to-node mapping |
| `CLUSTER MYID` | Current node ID |
| `CLUSTER KEYSLOT key` | Hash slot for a key |

### Cluster Management

| Command | Description |
|---------|-------------|
| `CLUSTER MEET host port` | Add node to cluster |
| `CLUSTER ADDSLOTS 0 1 2 ... 5460` | Assign hash slots |
| `CLUSTER REPLICATE node_id` | Make current node a replica |
| `CLUSTER FAILOVER` | Manual failover |
| `CLUSTER RESET` | Reset cluster config |
| `CLUSTER FORGET node_id` | Remove node from cluster |

### redis-cli Cluster Mode

```bash
# Connect in cluster mode
redis-cli -c -h host -p 6379

# Create cluster
redis-cli --cluster create host1:6379 host2:6379 host3:6379 \
  host4:6379 host5:6379 host6:6379 --cluster-replicas 1

# Check cluster health
redis-cli --cluster check host:6379

# Reshard
redis-cli --cluster reshard host:6379

# Add node
redis-cli --cluster add-node new_host:6379 existing_host:6379

# Rebalance slots
redis-cli --cluster rebalance host:6379
```

### Hash Tags (Force Same Slot)

```redis
-- Keys with same hash tag go to same slot
SET {user:123}.profile "data"
SET {user:123}.settings "data"
-- Both in same slot, can use in multi-key commands
```

---

## Memory Optimization

### Eviction Policies

| Policy | Description |
|--------|-------------|
| `noeviction` | Return error when full (default) |
| `allkeys-lru` | Evict least recently used |
| `allkeys-lfu` | Evict least frequently used |
| `volatile-lru` | LRU among keys with TTL |
| `volatile-lfu` | LFU among keys with TTL |
| `volatile-ttl` | Evict keys with shortest TTL |
| `allkeys-random` | Random eviction |
| `volatile-random` | Random among keys with TTL |

### Memory Commands

```redis
INFO memory                      -- Memory overview
MEMORY USAGE key                 -- Bytes used by key
MEMORY DOCTOR                    -- Memory issues diagnosis
MEMORY STATS                     -- Detailed memory stats
CONFIG SET maxmemory 2gb         -- Set memory limit
CONFIG SET maxmemory-policy allkeys-lru
```

---

## Persistence

| Mode | Description | Data Safety | Performance |
|------|-------------|-------------|-------------|
| RDB | Point-in-time snapshots | May lose last minutes | Better |
| AOF | Append every write | Better durability | Slower |
| RDB + AOF | Both enabled | Best durability | Slowest |
| None | No persistence | Data loss on restart | Fastest |

```redis
-- Manual snapshot
BGSAVE

-- Manual AOF rewrite
BGREWRITEAOF

-- Last save timestamp
LASTSAVE
```

---

## When to Use X vs Y

| Decision | Choice A | Choice B | Use A When | Use B When |
|----------|----------|----------|------------|------------|
| Data type | String | Hash | Single value, counter | Object with fields |
| Queue | List | Stream | Simple FIFO | Consumer groups, persistence |
| Unique items | Set | Sorted Set | No ordering needed | Need ranking/scoring |
| Caching | String + EX | Hash + EXPIRE | Simple key-value | Multiple fields per cache entry |
| Messaging | Pub/Sub | Streams | Fire-and-forget | Need delivery guarantees |
| Counter | INCR | Sorted Set | Simple counter | Need ranking of counters |
| Lock | SET NX EX | Redlock | Single instance | Distributed cluster |

---

## Troubleshooting

| Problem | Diagnosis |
|---------|-----------|
| High latency | `SLOWLOG GET 10`, check `INFO commandstats` |
| Memory too high | `MEMORY DOCTOR`, check `INFO memory` |
| Too many connections | `CLIENT LIST`, check `INFO clients` |
| Keys not expiring | Check `maxmemory-policy`, run `INFO keyspace` |
| Cluster slot errors | `CLUSTER INFO`, `CLUSTER NODES` |
| Replication lag | `INFO replication`, check `master_link_status` |
