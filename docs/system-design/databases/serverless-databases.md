---
title: "Serverless Databases"
description: "Neon, PlanetScale, Turso, D1, Supabase — serverless database comparison, architecture, pricing, and when to use each"
tags: [serverless, databases, neon, planetscale, turso, d1, supabase, scale-to-zero, edge]
difficulty: intermediate
prerequisites: [postgres-internals, connection-pooling, sqlite-internals]
lastReviewed: "2026-04-04"
---

# Serverless Databases

A serverless database is a database that separates storage from compute, scales compute to zero when idle, and charges per query or per active compute-second rather than per always-on instance. The operational model shifts: you do not provision instances, choose instance sizes, manage connection pools, or pay for idle capacity. The database provider handles all of that.

This is not the same as a managed database (like RDS or Cloud SQL), where you still pick instance sizes and pay whether the database is busy or sleeping. Serverless databases eliminate the concept of "the instance" entirely.

## Why Serverless Databases Matter

The traditional model of running a database has three fundamental problems for modern workloads:

1. **Idle cost.** A $200/month Postgres instance sitting idle at 3 AM costs the same as during peak hours. For side projects, staging environments, dev branches, and early-stage startups, the database is idle 90%+ of the time.

2. **Scaling friction.** Vertical scaling requires downtime (resizing the instance). Horizontal scaling (read replicas) requires application-level routing. Both require capacity planning — guessing tomorrow's traffic today.

3. **Connection limits.** A traditional Postgres instance supports ~100-500 connections. Serverless compute (Lambda, Edge Functions, Workers) can spawn thousands of concurrent connections, blowing past database limits instantly.

Serverless databases solve all three by fundamentally rearchitecting how compute and storage interact.

```mermaid
graph LR
    subgraph "Traditional Database"
        App1[Application] --> DB1[(Single Instance<br/>Compute + Storage<br/>Always Running)]
    end

    subgraph "Serverless Database"
        App2[Application] --> Proxy[Connection Proxy<br/>/ Pooler]
        Proxy --> C1[Compute 1<br/>On-demand]
        Proxy --> C2[Compute 2<br/>Auto-scaled]
        C1 --> S1[(Shared Storage<br/>Distributed)]
        C2 --> S1
    end

    style DB1 fill:#ff6b6b,color:#fff
    style Proxy fill:#51cf66,color:#fff
    style S1 fill:#339af0,color:#fff
```

### The Core Architecture Pattern

Every serverless database follows a variant of the same architecture:

1. **Storage layer:** Durably stores data, independent of compute. Usually distributed across multiple nodes/availability zones.
2. **Compute layer:** Stateless (or near-stateless) query execution engines that can be started, stopped, and scaled independently.
3. **Proxy/routing layer:** Accepts client connections, routes queries to available compute, handles connection pooling, and manages authentication.

The separation of storage and compute is what enables scale-to-zero: when there are no queries, the compute shuts down, but the data remains safe in the storage layer. When a query arrives, compute spins up (cold start), connects to storage, and executes the query.

---

## Neon — Serverless Postgres

Neon is a serverless PostgreSQL platform built from the ground up with a storage-compute separation architecture. It runs standard PostgreSQL (not a fork with behavioral differences), so your existing queries, ORMs, and tools work unchanged.

### Architecture

Neon's architecture has three key components:

```mermaid
graph TD
    Client[Client Application] --> Proxy[Neon Proxy<br/>Connection Pooling + Auth]
    Proxy --> Compute1[Compute Endpoint<br/>PostgreSQL Process]
    Proxy --> Compute2[Compute Endpoint<br/>Read Replica]
    
    Compute1 --> PS[Pageserver<br/>On-demand Page Serving]
    Compute2 --> PS
    
    PS --> Safekeeper1[Safekeeper 1]
    PS --> Safekeeper2[Safekeeper 2]
    PS --> Safekeeper3[Safekeeper 3]
    
    Safekeeper1 --> S3[(S3 / Object Storage<br/>Long-term WAL storage)]
    Safekeeper2 --> S3
    Safekeeper3 --> S3

    style Proxy fill:#339af0,color:#fff
    style PS fill:#f59f00,color:#000
    style S3 fill:#51cf66,color:#fff
```

- **Safekeepers:** Accept WAL (Write-Ahead Log) records from compute, replicate them across 3 nodes via Paxos consensus, and offload to S3 for durability.
- **Pageserver:** Materializes database pages on demand from the WAL. Instead of storing a full copy of the database, it reconstructs any page by replaying the relevant WAL records. This is what enables branching — a branch is just a pointer to a position in the WAL history.
- **Compute:** Standard PostgreSQL processes that request pages from the Pageserver instead of local disk. They are stateless and can be started/stopped in seconds.

### Branching

Neon's killer feature is database branching. Like `git branch`, you can create a full copy-on-write branch of your database in seconds, regardless of size:

```bash
# Create a branch from the main database
neonctl branches create --name feature/user-auth --parent main

# Each branch gets its own connection string
# Branch is instant — uses copy-on-write, no data copying
DATABASE_URL="postgresql://user:pass@ep-cool-frost-123456.us-east-2.aws.neon.tech/dbname?sslmode=require"

# Create a branch from a specific point in time
neonctl branches create --name debug/prod-snapshot --parent main --time "2026-04-01T12:00:00Z"
```

Branches share the same underlying storage pages until data diverges (copy-on-write), so creating a branch of a 100 GB database is instant and initially costs no additional storage.

**Use cases for branching:**
- **Preview environments:** Every PR gets its own database branch with real production data
- **CI/CD testing:** Run migrations against a branch, verify, then apply to main
- **Point-in-time debugging:** Branch from the exact moment before a bug occurred
- **Development:** Each developer gets their own isolated copy of the database

### Autoscaling

Neon compute scales from 0.25 vCPU to 10 vCPU automatically based on load:

```
Idle (no queries for 5 min) → Compute suspended (0 cost)
First query arrives → Cold start (~500ms-2s) → 0.25 vCPU
Load increases → Auto-scale to 1 vCPU → 2 vCPU → ... → 10 vCPU
Load decreases → Scale down over 5 minutes
No queries for 5 min → Suspend again
```

### Connection Pooling

Neon includes a built-in connection pooler (based on PgBouncer) accessible by adding `-pooler` to the endpoint hostname:

```typescript
// Direct connection (for migrations, long transactions)
const directUrl = "postgresql://user:pass@ep-cool-frost-123456.us-east-2.aws.neon.tech/dbname";

// Pooled connection (for serverless functions, high-concurrency)
const pooledUrl = "postgresql://user:pass@ep-cool-frost-123456-pooler.us-east-2.aws.neon.tech/dbname";
```

### Neon with Drizzle ORM

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

// src/db/index.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// For serverless (HTTP-based, no persistent connection)
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });

// For long-running servers (WebSocket-based, persistent connection)
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

```typescript
// Usage in a Next.js API route
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request) {
  const allUsers = await db.select().from(users);
  
  const user = await db.query.users.findFirst({
    where: eq(users.email, 'alice@example.com'),
    with: { posts: true },
  });
  
  return Response.json(user);
}
```

---

## PlanetScale — Serverless MySQL

PlanetScale is a serverless MySQL-compatible database built on Vitess, the same technology that scaled YouTube's MySQL database. It provides branching, non-blocking schema changes, and a serverless HTTP API.

::: warning PlanetScale Free Tier Removal (2024)
PlanetScale removed its free tier in April 2024. The cheapest plan (Scaler) starts at $39/month. This shifted many developers to Neon, Turso, or D1 for hobby/side projects. PlanetScale now positions itself primarily for production workloads.
:::

### Architecture

PlanetScale is built on Vitess, which provides:

```mermaid
graph TD
    Client[Client Application] --> VTGate[VTGate<br/>Query Router + Pooler]
    VTGate --> VTTablet1[VTTablet<br/>Shard 1 Primary]
    VTGate --> VTTablet2[VTTablet<br/>Shard 1 Replica]
    VTGate --> VTTablet3[VTTablet<br/>Shard 2 Primary]
    VTGate --> VTTablet4[VTTablet<br/>Shard 2 Replica]
    
    VTTablet1 --> MySQL1[(MySQL<br/>Shard 1)]
    VTTablet2 --> MySQL1
    VTTablet3 --> MySQL2[(MySQL<br/>Shard 2)]
    VTTablet4 --> MySQL2

    style VTGate fill:#339af0,color:#fff
    style MySQL1 fill:#f59f00,color:#000
    style MySQL2 fill:#f59f00,color:#000
```

- **VTGate:** Proxy layer that routes queries, manages connection pooling, and handles cross-shard query planning
- **VTTablet:** Manages individual MySQL shard instances, handles replication and health checking
- **Online DDL:** Schema changes run as background operations using Vitess's VReplication, never locking tables

### Non-Blocking Schema Changes

PlanetScale's schema change workflow uses deploy requests (similar to pull requests):

```bash
# Create a development branch
pscale branch create mydb feature-add-avatar

# Connect to the branch and make schema changes
pscale shell mydb feature-add-avatar
# mysql> ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);
# mysql> CREATE INDEX idx_users_avatar ON users(avatar_url);

# Create a deploy request (like a PR)
pscale deploy-request create mydb feature-add-avatar

# The deploy request shows:
# - Schema diff
# - Whether the change is backward-compatible
# - Estimated deployment time

# Deploy to production (non-blocking)
pscale deploy-request deploy mydb 1
```

The deploy executes online DDL behind the scenes — no table locks, no downtime, even on tables with billions of rows.

### PlanetScale HTTP API

```typescript
import { Client } from '@planetscale/database';

const client = new Client({
  host: process.env.DATABASE_HOST,
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
});

const conn = client.connection();

// Simple query
const results = await conn.execute('SELECT * FROM users WHERE id = ?', [userId]);

// Transaction
const tx = conn.transaction(async (tx) => {
  await tx.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, fromId]);
  await tx.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, toId]);
});
```

::: info Key Limitation
PlanetScale does not support foreign key constraints at the database level. Vitess's sharding model cannot enforce cross-shard foreign keys. Referential integrity must be enforced at the application level. This is a deliberate design decision, not a bug.
:::

---

## Turso — SQLite at the Edge

Turso is a serverless database built on libSQL, a fork of SQLite. Its key innovation is **embedded replicas** — a full copy of the database runs as an embedded SQLite file inside your application process, with replication from a primary server.

### Architecture

```mermaid
graph TD
    subgraph "Edge Location 1"
        App1[Application Process] --> ER1[(Embedded Replica<br/>Local SQLite File)]
    end
    
    subgraph "Edge Location 2"
        App2[Application Process] --> ER2[(Embedded Replica<br/>Local SQLite File)]
    end
    
    subgraph "Turso Primary"
        Primary[(Primary Database<br/>libSQL Server)]
    end
    
    ER1 -.->|"Sync writes"| Primary
    ER2 -.->|"Sync writes"| Primary
    Primary -.->|"Replicate changes"| ER1
    Primary -.->|"Replicate changes"| ER2

    style ER1 fill:#51cf66,color:#fff
    style ER2 fill:#51cf66,color:#fff
    style Primary fill:#339af0,color:#fff
```

- **Primary:** A libSQL server in a chosen region that accepts writes and coordinates replication
- **Replicas:** Read-only libSQL replicas in edge locations worldwide (up to 26+ locations)
- **Embedded replicas:** A SQLite file bundled inside your application that syncs with the primary. Reads are local (microsecond latency), writes go to the primary

### Embedded Replicas

This is Turso's most distinctive feature. The database lives inside your application process:

```typescript
import { createClient } from '@libsql/client';

// Remote-only connection (standard serverless)
const remoteDb = createClient({
  url: 'libsql://my-database-username.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Embedded replica — SQLite file with remote sync
const db = createClient({
  url: 'file:local-replica.db',               // Local SQLite file
  syncUrl: 'libsql://my-database-username.turso.io',  // Remote primary
  authToken: process.env.TURSO_AUTH_TOKEN,
  syncInterval: 60,                            // Sync every 60 seconds
});

// Reads hit the local SQLite file — microsecond latency
const users = await db.execute('SELECT * FROM users WHERE active = 1');

// Writes go to the remote primary, then replicate back
await db.execute({
  sql: 'INSERT INTO users (name, email) VALUES (?, ?)',
  args: ['Alice', 'alice@example.com'],
});

// Manual sync (pull latest changes from primary)
await db.sync();
```

**Why this matters:** Traditional database reads require a network round trip (1-50ms). With embedded replicas, reads hit a local file (0.01ms). For read-heavy workloads at the edge, this is a 100-1000x latency improvement.

### Turso + Drizzle ORM

```typescript
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client);
```

::: info SQLite Limitations
Turso inherits SQLite's limitations: no native ENUM types, limited ALTER TABLE support (cannot drop columns in older SQLite versions), single-writer (all writes serialize through the primary), and no stored procedures. For many web applications, these limitations do not matter. For complex OLTP workloads, they will.
:::

---

## Cloudflare D1 — SQLite on the Edge

D1 is Cloudflare's serverless SQLite database, designed specifically for Cloudflare Workers. It runs SQLite at the edge with automatic replication.

### Architecture

D1 stores data in SQLite databases distributed across Cloudflare's network. Each database has a primary location (where writes happen) and read replicas that Cloudflare manages automatically.

```typescript
// wrangler.toml
// [[d1_databases]]
// binding = "DB"
// database_name = "my-app-db"
// database_id = "xxxx-xxxx-xxxx"

// Worker code
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Simple query
    const { results } = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind('alice@example.com').all();

    // Batch queries (single round trip)
    const batch = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) as count FROM users'),
      env.DB.prepare('SELECT COUNT(*) as count FROM posts'),
      env.DB.prepare('SELECT COUNT(*) as count FROM comments'),
    ]);

    // Transaction via batch
    const transferBatch = await env.DB.batch([
      env.DB.prepare('UPDATE accounts SET balance = balance - 100 WHERE id = ?').bind(fromId),
      env.DB.prepare('UPDATE accounts SET balance = balance + 100 WHERE id = ?').bind(toId),
      env.DB.prepare('INSERT INTO transactions (from_id, to_id, amount) VALUES (?, ?, ?)').bind(fromId, toId, 100),
    ]);

    return Response.json(results);
  },
};
```

### D1 Limitations

- **Database size:** 10 GB max per database (as of 2026)
- **Row size:** 1 MB max per row
- **Write throughput:** Limited by single-writer SQLite model
- **No real-time subscriptions:** Polling only
- **Cloudflare-only:** Only accessible from Cloudflare Workers (no external TCP connections)

D1 is best for small-to-medium datasets that are read-heavy and benefit from edge proximity. It is not suitable for large transactional workloads.

---

## Supabase — Serverless Postgres Platform

Supabase is an open-source Firebase alternative built on PostgreSQL. It bundles a database, authentication, real-time subscriptions, edge functions, and storage into a single platform.

### Architecture

```mermaid
graph TD
    Client[Client Application] --> Kong[Kong API Gateway<br/>Auth + Rate Limiting]
    
    Kong --> PostgREST[PostgREST<br/>Auto-generated REST API]
    Kong --> Realtime[Realtime Server<br/>WebSocket Subscriptions]
    Kong --> Auth[GoTrue<br/>Authentication]
    Kong --> Storage[Storage API<br/>S3-backed File Storage]
    Kong --> Functions[Edge Functions<br/>Deno Runtime]
    
    PostgREST --> PG[(PostgreSQL<br/>+ pg_graphql<br/>+ pgvector)]
    Realtime --> PG
    Auth --> PG
    
    PG --> Pooler[Supavisor<br/>Connection Pooler]

    style Kong fill:#339af0,color:#fff
    style PG fill:#51cf66,color:#fff
    style Pooler fill:#f59f00,color:#000
```

Supabase is NOT a custom database. It is a full PostgreSQL instance (you get superuser access) with a suite of services layered on top:

- **PostgREST:** Automatically generates a REST API from your database schema
- **Realtime:** Listens to PostgreSQL's WAL and broadcasts changes over WebSockets
- **GoTrue:** Authentication service supporting email, OAuth, magic links, phone auth
- **Supavisor:** Connection pooler (replaced PgBouncer in 2024) supporting both transaction and session pooling modes
- **pgvector:** Vector similarity search for AI/embedding workloads

### Supabase Client SDK

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Query with filters (uses PostgREST under the hood)
const { data: users, error } = await supabase
  .from('users')
  .select('id, name, email, posts(id, title)')  // Joins via foreign keys
  .eq('active', true)
  .order('created_at', { ascending: false })
  .limit(10);

// Insert
const { data, error } = await supabase
  .from('users')
  .insert({ name: 'Alice', email: 'alice@example.com' })
  .select();

// Real-time subscriptions
const channel = supabase
  .channel('public:messages')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: 'room_id=eq.123' },
    (payload) => {
      console.log('New message:', payload.new);
    }
  )
  .subscribe();

// Authentication
const { data: { user }, error } = await supabase.auth.signUp({
  email: 'alice@example.com',
  password: 'securepassword123',
});

// Row Level Security (RLS) — policies run on the database
// Users can only read their own data:
// CREATE POLICY "Users can view own data" ON users
//   FOR SELECT USING (auth.uid() = id);
```

### Supabase vs. Direct Postgres

Supabase gives you a real PostgreSQL instance. You can connect directly with `psql`, use any PostgreSQL client library, run raw SQL, install extensions, and use the full power of PostgreSQL. The Supabase client SDK is a convenience layer on top, not a replacement.

```typescript
// You can also use Drizzle/Prisma directly with the connection string
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);
```

::: info Scale-to-Zero Status
As of 2026, Supabase pauses inactive projects on the free tier after 7 days of inactivity. Paid plans keep the database running 24/7 — there is no auto-scaling compute like Neon. Supabase is "serverless" in the managed-platform sense, not in the scale-to-zero sense. For true scale-to-zero Postgres, use Neon.
:::

---

## Comparison Table

| Feature | Neon | PlanetScale | Turso | D1 | Supabase |
|---------|------|-------------|-------|----|----------|
| **Engine** | PostgreSQL | MySQL (Vitess) | libSQL (SQLite) | SQLite | PostgreSQL |
| **Scale to zero** | Yes | No (always-on) | Yes | Yes | Free tier only |
| **Branching** | Yes (instant, COW) | Yes (Vitess workflow) | No | No | No |
| **Free tier** | 0.5 GB storage, 190 hrs compute | None | 9 GB storage, 500M reads | 5 GB storage, 5M reads/day | 500 MB, 2 projects |
| **Starter price** | $19/mo | $39/mo | $9/mo | $5/mo (Workers Paid) | $25/mo |
| **Connection pooling** | Built-in (PgBouncer) | Built-in (Vitess) | N/A (HTTP or embedded) | N/A (Workers binding) | Built-in (Supavisor) |
| **HTTP API** | Yes (serverless driver) | Yes | Yes | Yes (Workers binding) | Yes (PostgREST) |
| **Edge replicas** | Read replicas (limited regions) | No | Yes (26+ locations) | Yes (automatic) | No |
| **Embedded replicas** | No | No | Yes | No | No |
| **Real-time** | Listen/Notify (manual) | No | No | No | Yes (built-in) |
| **Auth built-in** | No | No | No | No | Yes (GoTrue) |
| **Max DB size** | 200 GB (Pro) | Unlimited (paid) | 100 GB | 10 GB | 8 GB (free), 100+ GB (paid) |
| **Cold start** | 500ms-2s | N/A | ~50ms (embedded) | <10ms (Workers) | N/A (always running) |

---

## Connection Pooling Challenges

Serverless compute (Lambda, Workers, Edge Functions) creates a unique connection challenge. Each invocation may spawn a new connection, and thousands of concurrent invocations can exhaust database connection limits.

### The Problem

```mermaid
graph TD
    subgraph "Serverless Functions"
        F1[Function Instance 1]
        F2[Function Instance 2]
        F3[Function Instance 3]
        FN[... 1000 instances]
    end
    
    subgraph "Database"
        DB[(PostgreSQL<br/>max_connections = 100)]
    end
    
    F1 -->|"conn 1"| DB
    F2 -->|"conn 2"| DB
    F3 -->|"conn 3"| DB
    FN -->|"conn 1000 ❌"| DB

    style DB fill:#ff6b6b,color:#fff
```

### Solutions by Database

**Neon:** Use the pooled connection string (`-pooler` endpoint). For serverless functions, use the `@neondatabase/serverless` driver which communicates over HTTP/WebSocket, avoiding traditional TCP connections entirely.

**PlanetScale:** The `@planetscale/database` driver uses HTTP, not TCP connections. No pooling needed for serverless.

**Turso:** The `@libsql/client` driver uses HTTP. Embedded replicas use a local SQLite file. Neither requires connection pooling.

**D1:** Direct Workers binding, no TCP connections involved.

**Supabase:** Use Supavisor (the built-in pooler) in transaction mode. For serverless, connect through the pooler endpoint on port 6543.

```typescript
// Supabase connection pooling for serverless
// Direct connection (for migrations)
const directUrl = "postgresql://user:pass@db.xxxx.supabase.co:5432/postgres";

// Pooled connection (for serverless functions)
const pooledUrl = "postgresql://user:pass@db.xxxx.supabase.co:6543/postgres?pgbouncer=true";
```

---

## Cold Starts

Cold starts are the latency penalty when a serverless database compute node starts from a suspended state. This is the most commonly cited criticism of serverless databases.

### Cold Start Latencies

| Database | Cold Start | Warm Query | Notes |
|----------|-----------|------------|-------|
| **Neon** | 500ms-2s | 5-30ms | Compute must start PostgreSQL process |
| **PlanetScale** | N/A | 5-20ms | Always-on, no scale-to-zero |
| **Turso (remote)** | 100-300ms | 5-15ms | Lightweight libSQL process |
| **Turso (embedded)** | 0ms | 0.01-0.5ms | Local SQLite, always warm |
| **D1** | <10ms | 1-5ms | Runs within already-warm Workers |
| **Supabase** | N/A (paid) | 5-30ms | Always-on on paid tiers |

### Mitigating Cold Starts

```typescript
// Strategy 1: Keep-alive ping (anti-pattern but works)
// Ping the database every 4 minutes to prevent suspension
// Only use this for critical production databases where cold starts are unacceptable
setInterval(async () => {
  await db.execute('SELECT 1');
}, 4 * 60 * 1000);

// Strategy 2: Use Neon's configurable suspend delay
// neonctl endpoint update --suspend-timeout 300  (5 minutes)
// neonctl endpoint update --suspend-timeout 0    (never suspend — but costs more)

// Strategy 3: Use Turso embedded replicas (no cold start for reads)
const db = createClient({
  url: 'file:local.db',
  syncUrl: 'libsql://...',
  authToken: '...',
});
// Reads are always instant from local file
```

---

## When Serverless Databases Are Wrong

Not every workload belongs on a serverless database. Here are scenarios where traditional databases are a better fit:

### High-Throughput OLTP

If your workload sustains 10,000+ writes per second continuously, a serverless database will either cost more than a dedicated instance or hit performance ceilings. The per-query pricing model penalizes high-throughput workloads. A dedicated RDS instance or self-managed PostgreSQL cluster is cheaper and faster.

### Latency-Sensitive Workloads

If every query must complete in under 5ms and cold starts are unacceptable, serverless databases with scale-to-zero are a poor fit. You need an always-on database. PlanetScale and Supabase (paid) are always-on, but Neon and Turso remote connections may hit cold starts.

### Complex Analytical Queries

Serverless databases are optimized for OLTP (short, simple queries). Long-running analytical queries (full table scans, large JOINs, aggregations across millions of rows) will be slow and expensive. Use a dedicated OLAP database (ClickHouse, BigQuery, DuckDB) instead.

### Workloads Requiring Full PostgreSQL Extension Ecosystem

If you depend on PostGIS, TimescaleDB, Citus, or other heavy PostgreSQL extensions, check compatibility. Neon supports many extensions but not all. PlanetScale and Turso are not PostgreSQL at all. Supabase supports the most extensions since it runs standard PostgreSQL.

| Scenario | Problem | Better Alternative |
|----------|---------|-------------------|
| Sustained 10K+ writes/sec | Per-query pricing too expensive | Dedicated PostgreSQL, Aurora |
| Sub-5ms P99 required | Cold starts break SLA | Always-on RDS, self-managed |
| Heavy OLAP queries | Serverless compute too slow | ClickHouse, BigQuery |
| PostGIS/spatial heavy | Limited extension support | Dedicated PostgreSQL |
| Multi-TB datasets | Storage limits, cost at scale | Aurora, CockroachDB |
| Complex stored procedures | Limited or unsupported | Dedicated PostgreSQL |

---

## Migration Patterns from Traditional Databases

### Phase 1: Evaluate Connection Patterns

```sql
-- Check current connection usage
SELECT count(*) as active_connections,
       state,
       usename
FROM pg_stat_activity
GROUP BY state, usename;

-- Check query patterns (what percentage are simple OLTP?)
SELECT calls,
       mean_exec_time,
       query
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;
```

### Phase 2: Dual-Write Migration

```mermaid
graph LR
    App[Application] --> Router{Write Router}
    Router --> OldDB[(Traditional DB<br/>Primary)]
    Router --> NewDB[(Serverless DB<br/>Shadow)]
    
    OldDB --> Compare[Comparison<br/>Service]
    NewDB --> Compare
    Compare --> Metrics[Discrepancy<br/>Metrics]

    style OldDB fill:#ff6b6b,color:#fff
    style NewDB fill:#51cf66,color:#fff
```

1. **Shadow writes:** Write to both databases, compare results
2. **Shadow reads:** Read from both, return old DB result but log serverless DB result
3. **Cutover reads:** Once results match, read from serverless DB
4. **Cutover writes:** Once confident, write to serverless DB only
5. **Decommission:** Turn off old database

### Phase 3: Schema Migration

```bash
# Neon — use pg_dump/pg_restore
pg_dump --format=custom --no-owner old_database | \
  pg_restore --no-owner -d "$NEON_DATABASE_URL"

# PlanetScale — use pscale data import
pscale database import mydb --from-url="mysql://user:pass@old-host:3306/mydb"

# Turso — export to SQL, import
sqlite3 old.db .dump | turso db shell my-database

# Supabase — use pg_dump/pg_restore (standard PostgreSQL)
pg_dump --format=custom --no-owner old_database | \
  pg_restore --no-owner -d "$SUPABASE_DATABASE_URL"
```

### Phase 4: Application Changes

```typescript
// Before: Traditional connection pool
import { Pool } from 'pg';
const pool = new Pool({
  host: 'db.internal.company.com',
  port: 5432,
  database: 'myapp',
  max: 20,  // Fixed pool size
});

// After: Neon serverless driver
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);

// The neon() driver uses HTTP — no connection pool needed
// Each call is a single HTTP request
const users = await sql`SELECT * FROM users WHERE active = true`;

// After: Turso with embedded replica
import { createClient } from '@libsql/client';
const db = createClient({
  url: 'file:local.db',
  syncUrl: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
const users = await db.execute('SELECT * FROM users WHERE active = 1');
```

---

## Choosing the Right Serverless Database

```mermaid
graph TD
    Start["Need a serverless database"] --> Realtime{"Need real-time<br/>+ auth + storage?"}
    
    Realtime -->|Yes| Supabase["Supabase<br/>Full platform"]
    Realtime -->|No| Engine{"Preferred engine?"}
    
    Engine -->|PostgreSQL| Branch{"Need branching<br/>+ scale-to-zero?"}
    Engine -->|MySQL| PS["PlanetScale<br/>Vitess-powered MySQL"]
    Engine -->|SQLite| Edge{"Deploy on<br/>Cloudflare Workers?"}
    
    Branch -->|Yes| Neon["Neon<br/>Branching + autoscaling"]
    Branch -->|No| Supabase2["Supabase<br/>Standard Postgres + extras"]
    
    Edge -->|Yes| D1["Cloudflare D1<br/>Native Workers integration"]
    Edge -->|No| Turso["Turso<br/>Embedded replicas + edge"]

    style Supabase fill:#22c55e,color:#fff
    style Neon fill:#339af0,color:#fff
    style PS fill:#f59f00,color:#000
    style D1 fill:#ff6b6b,color:#fff
    style Turso fill:#be4bdb,color:#fff
    style Supabase2 fill:#22c55e,color:#fff
```

---

## Key Takeaways

::: tip Key Takeaways

1. **Serverless databases separate storage from compute.** This is the architectural change that enables scale-to-zero, instant branching, and pay-per-query pricing. Understand this separation and you understand every serverless database.

2. **Connection pooling is solved differently per platform.** Neon uses PgBouncer + HTTP drivers. PlanetScale and Turso use HTTP natively. D1 uses Workers bindings. Supabase uses Supavisor. Never open raw TCP connections from serverless functions.

3. **Cold starts are real but manageable.** Neon's 500ms-2s cold start matters for user-facing requests. Use embedded replicas (Turso), always-on tiers, or keep-alive pings for latency-sensitive paths.

4. **Choose by workload, not hype.** Neon for branching-heavy dev workflows. PlanetScale for MySQL shops needing non-blocking DDL. Turso for edge-first reads. D1 for Cloudflare-native apps. Supabase for full-stack platforms needing auth + realtime.

5. **Serverless databases are not universally cheaper.** At sustained high throughput, per-query pricing exceeds reserved instance pricing. Model your actual query volume before committing.
:::

---

## Misconceptions

::: danger 7 Serverless Database Misconceptions

**1. "Serverless means no server."**
There are absolutely servers running your database. "Serverless" means you do not manage, provision, or pay for those servers when idle. The compute is abstracted away, not absent.

**2. "All serverless databases scale to zero."**
PlanetScale does not scale to zero. Supabase on paid plans runs 24/7. Only Neon, Turso, and D1 truly suspend compute when idle. Always check the specific platform's behavior.

**3. "Serverless databases are always cheaper."**
At low traffic, yes. At sustained high throughput (thousands of queries per second), per-query pricing often exceeds a dedicated instance. A $200/month RDS instance handling 100M queries/month costs $0.000002 per query — far less than any serverless per-query price.

**4. "I can use my existing connection pool with serverless databases."**
Traditional connection pools (PgBouncer, HikariCP) assume persistent TCP connections to a fixed host. Serverless databases often use HTTP-based drivers or proprietary protocols. You need the platform-specific driver, not your standard pool.

**5. "Branching copies my entire database."**
Neon and PlanetScale branching uses copy-on-write. Creating a branch of a 100 GB database is instant and initially uses zero additional storage. Only pages/rows that change in the branch consume extra space.

**6. "SQLite-based serverless databases can not handle production workloads."**
Turso and D1 run SQLite, which handles millions of reads per second. SQLite is the most deployed database engine in the world. The limitation is write throughput (single-writer model), not reliability or read performance.

**7. "Supabase is a proprietary database."**
Supabase runs standard PostgreSQL. You can `pg_dump` your data, connect with any PostgreSQL client, and migrate to any other PostgreSQL host with zero code changes. The Supabase services (auth, realtime, storage) are the proprietary layer, not the database itself.
:::

---

## When NOT to Use Serverless Databases

| Scenario | Why Not | Better Alternative |
|----------|---------|-------------------|
| Sustained 10K+ writes/sec | Per-query cost exceeds reserved pricing | Dedicated PostgreSQL, Aurora |
| Sub-2ms P99 latency required | Cold starts violate SLA | Always-on RDS with read replicas |
| Heavy OLAP / analytics | Serverless compute underpowered for scans | ClickHouse, BigQuery, DuckDB |
| Multi-TB dataset with complex queries | Storage limits, compute costs balloon | Aurora, CockroachDB, AlloyDB |
| Regulatory requirement for self-hosted | Data sovereignty / compliance | Self-managed PostgreSQL on-prem |
| Need full extension ecosystem | Not all extensions available everywhere | Dedicated PostgreSQL |

---

## In Production

::: warning Production Considerations

**Connection strings rotate.** Serverless database connection strings may change during maintenance. Always use environment variables, never hardcode. Some platforms (Neon, PlanetScale) provide stable endpoints, but auth tokens may rotate.

**Cold start budgets.** If your API has a 200ms P95 SLA, a 2-second cold start will violate it. Monitor cold start frequency and configure suspend timeouts accordingly. For critical paths, keep the database warm.

**Billing surprises.** A runaway query, a misconfigured background job, or a DDoS attack can generate millions of queries overnight. Set billing alerts and configure query rate limits. Neon and PlanetScale both support spending caps.

**Backup and disaster recovery.** Serverless databases handle backups for you, but understand the RPO (Recovery Point Objective). Neon provides point-in-time recovery to any second in its retention window. Supabase takes daily backups on free tier, point-in-time on Pro. Test restoration regularly.

**Vendor lock-in gradient.** Neon and Supabase use standard PostgreSQL — migration is a `pg_dump` away. Turso uses libSQL (SQLite-compatible) — export with `.dump`. PlanetScale uses Vitess-flavored MySQL — migration requires testing for Vitess-specific behaviors. D1 is Cloudflare-only — the most locked-in option.

**Observability.** Built-in dashboards vary in depth. Supplement with your own monitoring: track query latency percentiles, connection pool utilization, cold start frequency, and billing burn rate. Most platforms expose Prometheus-compatible metrics or provide API endpoints for programmatic monitoring.
:::

---

## Quiz

::: details Quiz — 5 Questions

**Q1: What architectural feature enables serverless databases to scale to zero?**
The separation of storage and compute. When compute is separated from storage, the compute layer can be fully suspended (no running processes, no cost) while data remains safely in the storage layer. When a query arrives, a new compute instance starts, connects to the persistent storage, and executes the query.

**Q2: How does Neon implement instant database branching?**
Neon uses copy-on-write (COW) at the storage layer. A branch is a pointer to a position in the WAL history stored on the Pageserver. Creating a branch does not copy any data — both the parent and the branch share the same underlying storage pages. Only when data diverges (a write occurs on the branch) are new pages created. This is why branching a 100 GB database is instant and initially costs zero additional storage.

**Q3: What is an embedded replica in Turso, and why does it matter for latency?**
An embedded replica is a full SQLite database file that runs inside your application process and syncs with a remote Turso primary server. Reads hit the local SQLite file (microsecond latency) instead of making a network round trip (millisecond latency). Writes still go to the remote primary and replicate back. This provides 100-1000x read latency improvement for edge-deployed applications.

**Q4: Why does PlanetScale not support foreign key constraints?**
PlanetScale is built on Vitess, which shards data across multiple MySQL instances. Foreign key constraints cannot be enforced across shard boundaries — if the parent row and child row live on different shards, the database cannot atomically verify referential integrity. This is a deliberate architectural decision to enable horizontal scaling, not a missing feature.

**Q5: When is a serverless database more expensive than a traditional dedicated instance?**
At sustained high throughput. Serverless databases charge per query, per compute-second, or per data transferred. A dedicated $200/month instance handling 100 million queries per month amortizes to $0.000002 per query. At the same volume, serverless per-query pricing (typically $0.001-$1 per million reads) can exceed the dedicated instance cost significantly. Serverless pricing wins at low-to-moderate, bursty workloads — not at sustained high throughput.
:::

---

## Exercise

::: details Build a Multi-Database Edge Application

**Scenario:** Build a URL shortener that uses serverless databases optimally:

1. **Turso with embedded replicas** for URL lookups (read-heavy, latency-critical)
2. **Neon** for analytics and user management (complex queries, branching for dev)
3. **D1** for rate limiting counters (edge-native, simple key-value)

**Requirements:**

```typescript
// 1. Set up Turso with embedded replica for URL redirects
//    - Schema: urls(id, short_code, long_url, created_at, click_count)
//    - Reads must be under 1ms (embedded replica)
//    - Writes sync to primary

// 2. Set up Neon for analytics
//    - Schema: clicks(id, url_id, timestamp, country, device, referrer)
//    - Use branching to test new analytics queries
//    - Connection via serverless HTTP driver

// 3. Set up D1 for rate limiting
//    - Schema: rate_limits(ip TEXT PRIMARY KEY, count INT, window_start INT)
//    - Check rate limit on every request (must be <5ms)

// 4. Implement the redirect handler:
async function handleRedirect(shortCode: string, request: Request): Promise<Response> {
  // a. Check rate limit in D1
  // b. Look up URL in Turso embedded replica
  // c. If found, async log click to Neon (do not block redirect)
  // d. Return 302 redirect
  // e. If not found, return 404
}

// 5. Implement analytics query in Neon
async function getUrlStats(urlId: string): Promise<UrlStats> {
  // Top countries, devices, referrers, clicks over time
}
```

**Evaluation criteria:**
- Redirect latency under 10ms (P95) using embedded replica
- Analytics queries use Neon branching for safe iteration
- Rate limiting does not add perceptible latency
- Async click logging does not block redirects
- Proper error handling when any database is unavailable
:::

---

## One-Liner Summary

Serverless databases separate storage from compute to enable scale-to-zero, pay-per-query pricing, and instant branching — choose Neon for Postgres branching, PlanetScale for MySQL DDL, Turso for edge reads, D1 for Workers-native apps, or Supabase for a full-stack platform.

---

## Further Reading

- [PostgreSQL Internals](/system-design/databases/postgres-internals) — core architecture underlying Neon and Supabase
- [SQLite Internals](/system-design/databases/sqlite-internals) — engine powering Turso and D1
- [Connection Pooling](/system-design/databases/connection-pooling) — deep dive into pooling strategies
- [NewSQL](/system-design/databases/newsql) — distributed SQL databases for heavy workloads
- [Database Selection Guide](/system-design/databases/database-selection-guide) — how to choose the right database
