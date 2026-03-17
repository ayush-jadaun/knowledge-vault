---
title: "GCP Cloud SQL Deep Dive"
description: "Complete guide to Cloud SQL — high availability, read replicas, Cloud SQL Proxy, connection patterns, backup strategies, and production operations."
tags: [gcp, cloud-sql, database, postgresql, mysql, infrastructure]
difficulty: "intermediate"
prerequisites: ["gcp-overview"]
lastReviewed: "2026-03-18"
---

# GCP Cloud SQL Deep Dive

Cloud SQL is GCP's fully managed relational database service, supporting PostgreSQL, MySQL, and SQL Server. It handles patching, replication, backups, failover, and encryption while you focus on schema design and query optimization.

This guide covers Cloud SQL architecture from the storage engine internals through production-grade operational patterns.

---

## 1. Why Cloud SQL Exists: The Problem It Solves

### The Database Operations Burden

Running a production database on bare metal or VMs requires:

1. **Hardware provisioning** — Disks, RAID, memory sizing
2. **OS management** — Kernel tuning, filesystem optimization
3. **Database installation** — Binary installation, initialization
4. **High availability** — Replication setup, failover automation
5. **Backup management** — Scheduled backups, point-in-time recovery, backup testing
6. **Monitoring** — Slow query logs, connection limits, disk utilization
7. **Security** — SSL certificates, network isolation, audit logging
8. **Upgrades** — Minor version patches, major version migrations
9. **Scaling** — Vertical scaling (downtime), read replicas, connection pooling

Each of these is a full-time job at scale. Cloud SQL handles all of them.

### Cloud SQL vs. Self-Managed vs. AlloyDB vs. Cloud Spanner

| Feature | Cloud SQL | Self-Managed (GCE) | AlloyDB | Cloud Spanner |
|---------|----------|-------------------|---------|---------------|
| Management | Fully managed | You manage everything | Fully managed | Fully managed |
| Engine | PG, MySQL, SQL Server | Any | PostgreSQL-compatible | Proprietary (SQL) |
| Max storage | 64 TB | Unlimited | 64 TB | Unlimited |
| Max connections | ~4,000 (depends on tier) | Kernel limits | ~40,000 | Unlimited |
| HA | Regional (2 zones) | DIY | Regional | Multi-region |
| Read replicas | Up to 20 | DIY | Up to 20 | Built-in |
| Global distribution | No | DIY | No | Yes |
| ACID | Yes | Yes | Yes | Yes (external consistency) |
| Cost | $$ | $ (but ops cost) | $$$ | $$$$ |
| Best for | Standard OLTP | Full control needed | High-perf OLTP | Global OLTP |

---

## 2. Architecture Internals

### Storage Architecture

Cloud SQL instances run on Compute Engine VMs with attached persistent disks:

```mermaid
graph TB
    subgraph "Cloud SQL Instance"
        subgraph "Compute Engine VM"
            PG[PostgreSQL/MySQL Process]
            OS[Linux OS (optimized)]
        end

        subgraph "Storage"
            PD[Persistent Disk (SSD)<br/>Auto-growing, encrypted]
        end

        subgraph "Networking"
            VPC_PEER[VPC Peering to your VPC]
            PUBLIC_IP[Public IP (optional)]
            PRIVATE_IP[Private IP (recommended)]
        end
    end

    subgraph "HA (Regional)"
        PRIMARY[(Primary Instance<br/>Zone A)]
        STANDBY[(Standby Instance<br/>Zone B)]
    end

    PRIMARY --> |Synchronous<br/>replication| STANDBY
```

### Instance Tiers

| Tier | vCPUs | Memory | Max Storage | Max Connections (PG) | Use Case |
|------|-------|--------|-------------|---------------------|----------|
| db-f1-micro | Shared | 614 MB | 3 TB | ~25 | Development |
| db-g1-small | Shared | 1.7 GB | 3 TB | ~50 | Small staging |
| db-custom-1-3840 | 1 | 3.75 GB | 64 TB | ~100 | Small production |
| db-custom-2-7680 | 2 | 7.5 GB | 64 TB | ~200 | Medium production |
| db-custom-4-15360 | 4 | 15 GB | 64 TB | ~400 | Standard production |
| db-custom-8-30720 | 8 | 30 GB | 64 TB | ~800 | Large production |
| db-custom-16-61440 | 16 | 60 GB | 64 TB | ~1,600 | Heavy production |
| db-custom-32-122880 | 32 | 120 GB | 64 TB | ~3,200 | Enterprise |
| db-custom-96-368640 | 96 | 360 GB | 64 TB | ~4,000 | Maximum |

### Connection Limits

PostgreSQL connection limits depend on memory:

$$\text{max\_connections} \approx \frac{\text{Memory (MB)}}{9.5}$$

Each connection consumes ~10MB of memory. For a 4-vCPU instance with 15GB RAM:

$$\text{max\_connections} \approx \frac{15360}{9.5} \approx 1{,}617$$

Cloud SQL caps this at a reasonable default (usually lower) to prevent OOM.

::: danger
Exhausting connections is the most common Cloud SQL production issue. Use **connection pooling** (PgBouncer, Cloud SQL Proxy, or application-level) and never set pool size higher than your connection limit.
:::

---

## 3. High Availability

### How HA Works

Cloud SQL HA uses **regional instances** with synchronous replication to a standby in a different zone:

```mermaid
sequenceDiagram
    participant App as Application
    participant Primary as Primary (Zone A)
    participant Standby as Standby (Zone B)
    participant Storage as Persistent Disk

    App->>Primary: INSERT INTO orders...
    Primary->>Primary: Write to WAL
    Primary->>Standby: Synchronous replication
    Standby->>Standby: Write to WAL + apply
    Standby-->>Primary: ACK
    Primary->>Storage: Persist
    Primary-->>App: COMMIT

    Note over Primary, Standby: Failover scenario
    Primary->>Primary: Health check fails
    Note over Primary: 60-120 seconds
    Standby->>Standby: Promote to primary
    App->>Standby: Reconnect (same IP)
```

### Failover Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Failover trigger | Health check failures | 3 consecutive failures |
| Failover time | 60-120 seconds | Depends on transaction volume |
| Data loss | Zero | Synchronous replication |
| IP change | No | VIP (Virtual IP) stays the same |
| Connection drop | Yes | Applications must reconnect |
| Cost | 2x instance cost | Standby is a full instance |

### Handling Failover in Application Code

```typescript
// db/resilient-connection.ts
import { Pool, PoolConfig } from 'pg';

function createResilientPool(config: PoolConfig): Pool {
  const pool = new Pool({
    ...config,
    // Connection settings for Cloud SQL HA
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // Important: allow connections to be recycled
    maxLifetimeMillis: 1800000, // 30 minutes
  });

  pool.on('error', (err) => {
    // Connection-level errors (connection dropped during failover)
    console.error('Pool connection error:', err.message);
    // Don't exit — the pool will create new connections
  });

  return pool;
}

// Retry wrapper for transient failures during failover
async function withRetry<T>(
  pool: Pool,
  operation: (client: import('pg').PoolClient) => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const client = await pool.connect();
    try {
      const result = await operation(client);
      return result;
    } catch (error: any) {
      lastError = error;

      // Retry on connection errors (failover)
      const isTransient =
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNREFUSED' ||
        error.code === '57P01' || // admin_shutdown
        error.code === '57P03' || // cannot_connect_now
        error.code === '08006' || // connection_failure
        error.code === '08003';   // connection_does_not_exist

      if (!isTransient || attempt === maxRetries - 1) {
        throw error;
      }

      console.warn(`Transient error (attempt ${attempt + 1}/${maxRetries}):`, error.message);
      // Exponential backoff
      await new Promise(resolve =>
        setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 10000))
      );
    } finally {
      client.release();
    }
  }

  throw lastError;
}

// Usage
const pool = createResilientPool({
  host: '/cloudsql/project:region:instance', // Unix socket for Cloud SQL Proxy
  database: 'mydb',
  user: 'app',
  password: process.env.DB_PASSWORD,
});

const orders = await withRetry(pool, async (client) => {
  const result = await client.query(
    'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 10',
    [customerId]
  );
  return result.rows;
});
```

---

## 4. Cloud SQL Proxy

### What It Is

The Cloud SQL Auth Proxy is a client-side proxy that handles:
1. **Authentication** — Uses IAM to authenticate, no passwords needed
2. **Encryption** — TLS tunnel between your application and Cloud SQL
3. **Connection management** — Maintains persistent connections to Cloud SQL

```mermaid
graph LR
    subgraph "Your Infrastructure"
        APP[Application] --> |localhost:5432| PROXY[Cloud SQL Proxy]
    end

    PROXY --> |Encrypted tunnel<br/>IAM-authenticated| CSQL[Cloud SQL Instance]
```

### Why Use It

| Without Proxy | With Proxy |
|--------------|-----------|
| Manage SSL certificates | Automatic TLS |
| Store and rotate passwords | IAM authentication |
| Whitelist IPs | No IP whitelisting needed |
| Configure connection strings | Connect to localhost |

### Deployment Patterns

#### Sidecar (GKE — recommended)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-api
  namespace: orders
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-api
  template:
    metadata:
      labels:
        app: order-api
    spec:
      serviceAccountName: order-api-ksa # Workload Identity
      containers:
        - name: order-api
          image: gcr.io/my-project/order-api:v1.0.0
          env:
            - name: DB_HOST
              value: "127.0.0.1"
            - name: DB_PORT
              value: "5432"
            - name: DB_NAME
              value: "orders"
            - name: DB_USER
              value: "order-api"
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"

        # Cloud SQL Proxy sidecar
        - name: cloud-sql-proxy
          image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.8.0
          args:
            - "--structured-logs"
            - "--auto-iam-authn"  # Use IAM authentication
            - "--port=5432"
            - "my-project:us-central1:orders-db"
          securityContext:
            runAsNonRoot: true
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "200m"
              memory: "256Mi"
```

#### Cloud Run (Built-in)

Cloud Run has built-in Cloud SQL connectivity — no proxy needed:

```hcl
resource "google_cloud_run_v2_service" "api" {
  name     = "order-api"
  location = "us-central1"

  template {
    containers {
      image = "gcr.io/my-project/order-api:latest"

      env {
        name  = "DB_NAME"
        value = "orders"
      }
      env {
        name  = "DB_USER"
        value = "order-api"
      }
      env {
        name  = "INSTANCE_CONNECTION_NAME"
        value = google_sql_database_instance.main.connection_name
      }
    }

    # Built-in Cloud SQL connection
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }
  }
}
```

```typescript
// In Cloud Run, connect via Unix socket
const pool = new Pool({
  host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  // IAM auth — no password needed
});
```

---

## 5. Read Replicas

### Architecture

```mermaid
graph TB
    subgraph "Write Path"
        APP_W[Application<br/>Writes] --> PRIMARY[(Primary<br/>us-central1)]
    end

    subgraph "Read Path"
        APP_R[Application<br/>Reads] --> LB{Read<br/>Routing}
        LB --> REP1[(Replica 1<br/>us-central1)]
        LB --> REP2[(Replica 2<br/>us-east1)]
        LB --> REP3[(Replica 3<br/>europe-west1)]
    end

    PRIMARY --> |Async replication| REP1
    PRIMARY --> |Async replication| REP2
    PRIMARY --> |Async replication| REP3
```

### Read Replica Characteristics

| Feature | Value |
|---------|-------|
| Max replicas | 20 per primary |
| Replication type | Asynchronous (eventual consistency) |
| Replication lag | Typically < 1 second (same region), 1-5s (cross-region) |
| Promotable | Yes (to standalone instance) |
| Cross-region | Yes |
| Cascading replicas | No |
| Independent scaling | Yes (can be different tier than primary) |

### Replication Lag Formula

$$\text{Lag}_{replica} \approx \frac{\text{WAL Generation Rate}}{\text{Replay Bandwidth}} + \text{Network Latency}$$

For a database generating 10MB/s of WAL with a replica in another region (10ms latency):

$$\text{Lag} \approx \frac{10\text{MB}}{100\text{MB/s}} + 10\text{ms} = 110\text{ms}$$

### Read/Write Splitting

```typescript
// db/read-write-split.ts
import { Pool } from 'pg';

interface DatabasePools {
  writer: Pool;
  reader: Pool;
}

function createDatabasePools(): DatabasePools {
  const writer = new Pool({
    host: process.env.DB_PRIMARY_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 10,
    ssl: { rejectUnauthorized: true },
  });

  const reader = new Pool({
    host: process.env.DB_REPLICA_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20, // More read connections
    ssl: { rejectUnauthorized: true },
  });

  return { writer, reader };
}

class OrderRepository {
  constructor(private readonly pools: DatabasePools) {}

  // Writes go to primary
  async createOrder(order: CreateOrderInput): Promise<Order> {
    const result = await this.pools.writer.query(
      `INSERT INTO orders (customer_id, total, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [order.customerId, order.total]
    );
    return result.rows[0];
  }

  // Reads can go to replica (acceptable staleness)
  async getRecentOrders(customerId: string): Promise<Order[]> {
    const result = await this.pools.reader.query(
      `SELECT * FROM orders
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [customerId]
    );
    return result.rows;
  }

  // Read-after-write must go to primary (consistency requirement)
  async getOrderById(orderId: string): Promise<Order | null> {
    const result = await this.pools.writer.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );
    return result.rows[0] ?? null;
  }
}
```

::: warning
Read replicas are **eventually consistent**. After a write to the primary, the replica may not have the data yet. For "read-your-own-writes" consistency, read from the primary immediately after writing. For non-critical reads (listing, search, analytics), replicas are ideal.
:::

---

## 6. Backup and Recovery

### Automated Backups

Cloud SQL provides two backup types:

| Feature | Automated Backups | On-Demand Backups |
|---------|-------------------|-------------------|
| Frequency | Daily (configurable window) | Manual trigger |
| Retention | 1-365 days (default: 7) | Until deleted |
| Point-in-time recovery | Yes (with binary logging/WAL) | No |
| Cost | Included in instance cost | Storage cost only |
| Cross-region | Optional | No |

### Point-in-Time Recovery (PITR)

```mermaid
graph LR
    B1[Backup<br/>Mon 2:00 AM] --> WAL1[WAL Logs<br/>Mon 2:00-24:00]
    WAL1 --> B2[Backup<br/>Tue 2:00 AM]
    B2 --> WAL2[WAL Logs<br/>Tue 2:00-14:35]

    PITR[PITR Target:<br/>Tue 14:35] -.-> B2
    PITR -.-> WAL2
```

PITR restores to any point within the retention window:

$$\text{Recovery Window} = [\text{Oldest Backup}, \text{Now} - \text{Replication Lag}]$$

### Terraform Backup Configuration

```hcl
resource "google_sql_database_instance" "main" {
  name             = "orders-db"
  database_version = "POSTGRES_16"
  region           = "us-central1"
  project          = var.project_id

  settings {
    tier              = "db-custom-4-15360" # 4 vCPU, 15GB RAM
    availability_type = "REGIONAL"           # HA

    disk_size       = 100
    disk_type       = "PD_SSD"
    disk_autoresize = true
    disk_autoresize_limit = 500 # Max 500 GB

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00" # 2 AM UTC
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7  # Sunday
      hour         = 4  # 4 AM UTC
      update_track = "stable"
    }

    ip_configuration {
      ipv4_enabled    = false           # No public IP
      private_network = google_compute_network.main.id
      require_ssl     = true
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000" # Log queries > 1 second
    }
    database_flags {
      name  = "max_connections"
      value = "400"
    }
    database_flags {
      name  = "shared_buffers"
      value = "3932160" # ~25% of RAM in 8KB pages
    }
    database_flags {
      name  = "work_mem"
      value = "16384" # 16MB
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 4096
      record_application_tags = true
      record_client_address   = true
      query_plans_per_minute  = 5
    }

    user_labels = {
      environment = "production"
      team        = "platform"
      service     = "orders"
    }
  }

  deletion_protection = true
}
```

::: info War Story
A SaaS company ran a migration that accidentally deleted 2 months of customer data from a table. They had Cloud SQL automated backups with PITR enabled. Recovery steps:

1. Identified the exact timestamp of the DELETE statement from query logs
2. Created a PITR clone of the database to 1 second before the DELETE (took ~15 minutes for their 200GB database)
3. Extracted the deleted data from the clone using `pg_dump` with table filter
4. Restored the data to production using `COPY`
5. Total recovery time: 45 minutes, zero data loss

Without PITR, they would have lost everything since the last daily backup (up to 24 hours of data).
:::

---

## 7. Performance Optimization

### Query Insights

Cloud SQL Query Insights provides:
- Top queries by CPU, latency, and I/O
- Query plan visualization
- Query tagging for application-level attribution

```typescript
// Tag queries for Cloud SQL Insights attribution
import { Pool } from 'pg';

async function queryWithTags(
  pool: Pool,
  sql: string,
  params: any[],
  tags: { route: string; action: string },
): Promise<any[]> {
  const client = await pool.connect();
  try {
    // Set application tags for Query Insights
    await client.query(
      `SET google_db_advisor.query_tag = '${JSON.stringify(tags)}'`
    );
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// Usage
const orders = await queryWithTags(
  pool,
  'SELECT * FROM orders WHERE customer_id = $1 AND status = $2',
  [customerId, 'active'],
  { route: '/api/orders', action: 'listActive' }
);
```

### Key PostgreSQL Tuning Parameters

| Parameter | Default | Recommended | Why |
|-----------|---------|-------------|-----|
| `shared_buffers` | 128MB | 25% of RAM | Buffer pool for caching data |
| `effective_cache_size` | 4GB | 75% of RAM | Planner hint for available cache |
| `work_mem` | 4MB | 16-64MB | Sort/hash operations per query |
| `maintenance_work_mem` | 64MB | 512MB-1GB | VACUUM, CREATE INDEX |
| `random_page_cost` | 4.0 | 1.1 (SSD) | Cost model for SSD storage |
| `effective_io_concurrency` | 1 | 200 (SSD) | Async I/O for SSD |
| `max_parallel_workers_per_gather` | 2 | 4 | Parallel query workers |

### Connection Pooling with PgBouncer

For applications that need more connections than Cloud SQL supports:

```yaml
# PgBouncer deployment on GKE
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pgbouncer
  namespace: database
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pgbouncer
  template:
    spec:
      containers:
        - name: pgbouncer
          image: edoburu/pgbouncer:1.22.0
          ports:
            - containerPort: 5432
          env:
            - name: DATABASE_URL
              value: "postgresql://app:password@127.0.0.1:5433/orders"
            - name: POOL_MODE
              value: "transaction"
            - name: DEFAULT_POOL_SIZE
              value: "50"
            - name: MAX_CLIENT_CONN
              value: "1000"
            - name: SERVER_IDLE_TIMEOUT
              value: "120"
          resources:
            requests:
              cpu: "200m"
              memory: "256Mi"

        - name: cloud-sql-proxy
          image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.8.0
          args:
            - "--port=5433"
            - "my-project:us-central1:orders-db"
```

---

## 8. Security

### Authentication Methods

| Method | Use Case | Recommendation |
|--------|----------|----------------|
| Built-in users (password) | Legacy applications | Rotate regularly |
| IAM database authentication | GCP workloads | Preferred for GKE/Cloud Run |
| Cloud SQL Proxy + IAM | Any environment | Best security posture |
| SSL/TLS only | All connections | Always enforce |

### IAM Database Authentication

```hcl
# Create IAM database user
resource "google_sql_user" "iam_user" {
  name     = "order-api@my-project.iam"
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

# Grant the service account login permission
resource "google_project_iam_member" "cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.order_api.email}"
}

resource "google_project_iam_member" "cloudsql_instance_user" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.order_api.email}"
}
```

### Encryption

| Layer | Mechanism | Key Management |
|-------|-----------|----------------|
| Data at rest | AES-256 | Google-managed (default) or CMEK |
| Data in transit | TLS 1.2+ | Managed certificates |
| Backups | AES-256 | Same as instance |
| WAL logs | AES-256 | Same as instance |

---

## 9. Migration Strategies

### Migrating to Cloud SQL

| Source | Method | Downtime |
|-------|--------|----------|
| Self-managed PostgreSQL | Database Migration Service (DMS) | Minutes (with CDC) |
| Amazon RDS | DMS or pg_dump/pg_restore | Depends on size |
| Azure Database | DMS or pg_dump/pg_restore | Depends on size |
| Another Cloud SQL instance | DMS or pg_dump/pg_restore | Minutes |

### Zero-Downtime Migration Pattern

```mermaid
sequenceDiagram
    participant App as Application
    participant Source as Source DB
    participant DMS as Database Migration Service
    participant Target as Cloud SQL

    Note over DMS: Phase 1: Initial Load
    DMS->>Source: Read all data
    DMS->>Target: Write all data

    Note over DMS: Phase 2: CDC (Change Data Capture)
    loop Continuous replication
        Source->>DMS: Stream changes
        DMS->>Target: Apply changes
    end

    Note over App: Phase 3: Cutover
    App->>App: Stop writes to source
    DMS->>DMS: Wait for replication lag = 0
    App->>Target: Switch connection string
    App->>App: Resume writes to target
```

---

## 10. Cost Model

### Pricing Components

| Component | Cost (us-central1) | Notes |
|-----------|-------------------|-------|
| vCPU | $0.0413/hr | Per vCPU |
| Memory | $0.0070/hr/GB | Per GB |
| Storage (SSD) | $0.170/GB/month | Auto-growing |
| Storage (HDD) | $0.090/GB/month | Alternative |
| HA standby | 2x instance cost | Full replica |
| Backups | $0.080/GB/month | Above free tier |
| Network egress | Standard GCP rates | Cross-region |
| Read replicas | Same as instance | Full instance cost |

### Cost Example

A production HA instance with 4 vCPU, 15GB RAM, 200GB SSD:

$$\text{Primary} = (4 \times \$0.0413 + 15 \times \$0.0070) \times 730 = \$196.81$$

$$\text{HA Standby} = \$196.81$$

$$\text{Storage} = 200 \times \$0.170 = \$34.00$$

$$\text{Backups (50GB over free)} = 50 \times \$0.080 = \$4.00$$

$$\text{Total} = \$431.62/\text{month}$$

---

## 11. Edge Cases and Failure Modes

| Issue | Cause | Mitigation |
|-------|-------|-----------|
| Connection exhaustion | Too many application connections | PgBouncer, reduce pool size |
| Storage full | Disk autoresize disabled or limit reached | Enable autoresize, monitor |
| Replication lag spike | Heavy write load | Scale replica, reduce write volume |
| Maintenance window disruption | Auto-maintenance during peak | Set window to off-peak hours |
| Slow failover | Large uncommitted transactions | Keep transactions short |
| SSL certificate rotation | Annual cert rotation | Use Cloud SQL Proxy (handles automatically) |

---

## 12. Decision Framework

| Choose Cloud SQL When | Choose AlloyDB When | Choose Cloud Spanner When |
|----------------------|--------------------|-----------------------|
| Standard OLTP workloads | High-performance OLTP | Global distribution needed |
| < 4,000 connections | > 4,000 connections | Unlimited horizontal scaling |
| Cost-sensitive | Performance-critical | Strong consistency across regions |
| Standard PostgreSQL features | PostgreSQL + column engine | SLA > 99.999% required |
| < 10TB data | < 64TB data | Unlimited data size |

---

## See Also

- [GCP Overview](./index.md) — GCP fundamentals
- [Cloud Run](./cloud-run.md) — Connecting Cloud Run to Cloud SQL
- [GKE](./gke.md) — Cloud SQL Proxy as sidecar in GKE
- [IAM](./iam.md) — IAM database authentication
- [Cost Optimization](./cost-optimization.md) — Database cost strategies
