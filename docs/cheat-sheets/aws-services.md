---
title: "AWS Services Cheat Sheet"
description: "AWS services guide — when to use what, pricing models, gotchas, and decision matrices for compute, storage, databases, networking, and more"
tags: [aws, cloud, cheat-sheet, reference, infrastructure]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-04-05"
---

# AWS Services Cheat Sheet

AWS has 200+ services. Most projects use 10-15 of them. The hard part is not learning every service — it is knowing which one to pick for your specific use case, understanding the pricing model before you get a surprise bill, and knowing the gotchas that documentation buries in footnotes.

This page organizes AWS services by category with three things for each: when to use it, how pricing works, and what will bite you. Decision matrices at the end help you choose between overlapping services.

**Related**: [AWS CLI Cheat Sheet](/cheat-sheets/aws-cli) | [Terraform Cheat Sheet](/cheat-sheets/terraform) | [Docker Cheat Sheet](/cheat-sheets/docker)

---

## Compute

### EC2 (Elastic Compute Cloud)

**What it is**: Virtual machines. Full control over OS, networking, storage.

**When to use**: Long-running servers, stateful applications, GPU workloads, applications that need specific OS/kernel configurations, legacy apps that cannot be containerized.

**Pricing model**: Per-second billing (minimum 60 seconds). On-Demand, Reserved Instances (1-3 year commitment, up to 72% savings), Spot Instances (up to 90% savings, can be interrupted with 2-minute warning), Savings Plans.

::: warning EC2 Gotchas
- **Stopped instances still cost money** — EBS volumes attached to stopped instances continue to incur charges. Elastic IPs not associated with a running instance cost $0.005/hr.
- **Spot interruptions are real** — Spot instances can be reclaimed with 2 minutes notice. Design for interruption or do not use Spot.
- **t-class burstable performance** — t3/t4g instances accumulate CPU credits. If you exhaust credits, performance throttles to baseline (5-40% depending on size) unless you enable "unlimited" mode, which charges extra.
- **Data transfer out** costs $0.09/GB after the first 100GB/month. This adds up fast for media-heavy workloads.
:::

### Lambda

**What it is**: Serverless functions. Upload code, AWS handles provisioning, scaling, and patching.

**When to use**: Event-driven workloads (API Gateway triggers, S3 events, SQS consumers, cron jobs), short-lived processing (max 15 min), variable/unpredictable traffic, glue code between services.

**Pricing model**: Per-request ($0.20 per 1M requests) + per-GB-second of compute. Free tier: 1M requests and 400,000 GB-seconds/month.

::: warning Lambda Gotchas
- **Cold starts** — First invocation after idle period adds 100ms-10s latency depending on runtime and VPC configuration. Provisioned Concurrency eliminates this but costs money even when idle.
- **15-minute max execution** — Long-running processes must use Step Functions, ECS, or EC2.
- **512MB `/tmp` storage** (10GB with ephemeral storage config) — Not suitable for large file processing without streaming to S3.
- **Concurrency limits** — Default 1,000 concurrent executions per region. A single Lambda bursting can starve other functions.
- **VPC cold starts are worse** — Lambda in a VPC needs ENI attachment, adding seconds to cold start (mitigated by Hyperplane since 2019, but still noticeable).
:::

### ECS (Elastic Container Service)

**What it is**: AWS-native container orchestrator. Run Docker containers without managing Kubernetes.

**When to use**: Containerized microservices when you want AWS-managed orchestration without Kubernetes complexity. Good for teams already invested in the AWS ecosystem.

**Pricing model**: No charge for ECS itself. You pay for the underlying compute (EC2 or Fargate).

### EKS (Elastic Kubernetes Service)

**What it is**: Managed Kubernetes. AWS manages the control plane; you manage worker nodes (or use Fargate for serverless pods).

**When to use**: You already use Kubernetes, need multi-cloud portability, or need the Kubernetes ecosystem (Helm charts, operators, service mesh).

**Pricing model**: $0.10/hour per cluster ($73/month) for the control plane + EC2/Fargate costs for worker nodes.

::: tip ECS vs EKS Decision
- **Choose ECS** if you are AWS-only, want simplicity, and have < 50 services.
- **Choose EKS** if you need Kubernetes-specific features, multi-cloud, or your team already knows Kubernetes.
- **Choose neither** if you have < 5 services — use Lambda or App Runner instead.
:::

### Fargate

**What it is**: Serverless compute engine for containers. No servers to manage — define CPU/memory and Fargate provisions the infrastructure.

**When to use**: Container workloads where you want to avoid managing EC2 instances. Works with both ECS and EKS.

**Pricing model**: Per-vCPU per hour + per-GB memory per hour. About 20-40% more expensive than equivalent EC2 On-Demand, but you save on ops overhead.

### App Runner

**What it is**: Fully managed service to build, deploy, and run containerized web apps and APIs. Simpler than ECS/EKS.

**When to use**: Simple web apps and APIs that do not need the full power of ECS/EKS. Deployments from source code or container image. Similar to Heroku/Railway.

**Pricing model**: Per-vCPU per second (active) + per-GB memory per second. Automatic scale-to-zero (pay only for provisioned memory when idle).

### Lightsail

**What it is**: Simple virtual servers, databases, and storage with predictable pricing. AWS's answer to DigitalOcean/Linode.

**When to use**: Small projects, WordPress sites, development environments, when you want fixed monthly pricing.

**Pricing model**: Fixed monthly plans starting at $3.50/month (512MB RAM, 1 vCPU). Includes data transfer allowance.

---

## Storage

### S3 (Simple Storage Service)

**What it is**: Object storage. Unlimited capacity, 99.999999999% (11 nines) durability.

**When to use**: Static assets, backups, data lakes, log archival, static website hosting, artifact storage.

**Pricing model**: Per-GB stored/month + per-request (PUT/GET) + data transfer out. Storage classes drastically change cost:

| Storage Class | Cost (per GB/month) | Retrieval | Use Case |
|--------------|-------------------|-----------|----------|
| S3 Standard | ~$0.023 | Instant | Frequently accessed data |
| S3 Intelligent-Tiering | ~$0.023 + monitoring fee | Instant | Unknown access patterns |
| S3 Standard-IA | ~$0.0125 | Instant (per-GB retrieval fee) | Infrequent access, rapid retrieval |
| S3 One Zone-IA | ~$0.010 | Instant | Reproducible, infrequent data |
| S3 Glacier Instant | ~$0.004 | Instant (higher retrieval fee) | Archive with instant access |
| S3 Glacier Flexible | ~$0.0036 | Minutes to hours | Archive |
| S3 Glacier Deep Archive | ~$0.00099 | 12-48 hours | Long-term archive |

::: warning S3 Gotchas
- **Request costs add up** — Listing a million objects costs $5 (LIST is $0.005 per 1,000 requests). Millions of small files can make request costs exceed storage costs.
- **Eventual consistency is gone** — S3 provides strong read-after-write consistency since December 2020. This misconception persists.
- **Lifecycle rules are essential** — Without them, incomplete multipart uploads accumulate silently and you pay for the fragments.
- **Public bucket risks** — S3 Block Public Access should be enabled at the account level. Misconfigured buckets are the #1 source of cloud data breaches.
:::

### EBS (Elastic Block Store)

**What it is**: Block storage volumes for EC2 instances. Like a virtual hard drive.

**When to use**: EC2 boot volumes, databases running on EC2, any workload that needs a filesystem.

**Pricing model**: Per-GB per month + IOPS charges for provisioned IOPS volumes (io1/io2). gp3 volumes: $0.08/GB/month with 3,000 IOPS and 125 MB/s included.

::: warning EBS Gotchas
- **Single AZ** — An EBS volume exists in one Availability Zone. If that AZ goes down, your volume is unavailable (but data is not lost). Snapshots are region-wide.
- **Snapshots cost money** — EBS snapshots are incremental, but the first snapshot copies the entire volume. Unmanaged snapshots are a common billing surprise.
- **gp2 vs gp3** — gp3 is cheaper and better (3,000 baseline IOPS vs gp2's burst bucket). If you still have gp2 volumes, switch to gp3.
:::

### EFS (Elastic File System)

**What it is**: Managed NFS file system. Multiple EC2 instances can mount the same filesystem simultaneously.

**When to use**: Shared file storage across multiple instances, content management systems, container storage, home directories.

**Pricing model**: Per-GB per month (~$0.30 Standard, ~$0.016 Infrequent Access). No pre-provisioning required.

### FSx

**What it is**: Managed file systems — FSx for Lustre (high-performance computing), FSx for Windows File Server, FSx for NetApp ONTAP, FSx for OpenZFS.

**When to use**: HPC workloads (Lustre), Windows workloads requiring SMB (Windows File Server), hybrid cloud (ONTAP), Linux workloads needing snapshots/clones (OpenZFS).

### Glacier

**What it is**: Archival storage. Part of S3 now (accessed via S3 storage classes), but can also be used as a standalone vault.

**When to use**: Compliance archives, long-term backups, data you rarely (or never) need to access but must retain.

**Pricing model**: ~$0.004/GB/month (Flexible), ~$0.00099/GB/month (Deep Archive). Retrieval costs depend on speed: expedited (1-5 min, expensive) vs standard (3-5 hours) vs bulk (5-12 hours, cheapest).

---

## Database

### RDS (Relational Database Service)

**What it is**: Managed relational databases — MySQL, PostgreSQL, MariaDB, Oracle, SQL Server.

**When to use**: Traditional relational workloads where you want managed backups, patching, and failover without managing the database server yourself.

**Pricing model**: Per-instance-hour + storage (gp3/io1) + backup storage beyond free allocation + data transfer.

::: warning RDS Gotchas
- **Multi-AZ is not a read replica** — Multi-AZ creates a synchronous standby for failover. It does not serve read traffic. Use Read Replicas for read scaling.
- **Storage auto-scaling can surprise you** — Enable it but set a max. Once allocated storage grows, it never shrinks.
- **Maintenance windows cause downtime** — Multi-AZ reduces this to ~60 seconds failover, but single-AZ instances go down for minutes during patching.
:::

### Aurora

**What it is**: AWS-designed relational database compatible with MySQL and PostgreSQL. 5x throughput of MySQL, 3x of PostgreSQL (per AWS claims).

**When to use**: High-performance relational workloads, when you need up to 15 read replicas with sub-10ms replication lag, when you want automatic storage scaling up to 128TB.

**Pricing model**: Per-instance-hour (higher than RDS) + per-GB storage ($0.10/GB/month) + I/O charges ($0.20 per million requests). Aurora Serverless v2: per-ACU per second (Aurora Capacity Unit).

::: tip Aurora vs RDS Decision
- **Choose RDS** for simple workloads, cost sensitivity, and when you need Oracle/SQL Server.
- **Choose Aurora** for high throughput, fast failover (< 30 seconds), large databases, or when you need serverless auto-scaling.
- **Choose Aurora Serverless v2** for variable/unpredictable workloads where the database needs to scale from near-zero to hundreds of thousands of transactions.
:::

### DynamoDB

**What it is**: Serverless NoSQL key-value and document database. Single-digit millisecond latency at any scale.

**When to use**: High-scale key-value lookups, session stores, shopping carts, gaming leaderboards, IoT data, any workload with known access patterns.

**Pricing model**: On-Demand ($1.25 per million write requests, $0.25 per million read requests) or Provisioned (per-RCU/WCU per hour). Storage: $0.25/GB/month.

::: warning DynamoDB Gotchas
- **You must design your access patterns first** — DynamoDB has no ad-hoc queries. If you do not know your access patterns upfront, you will end up with expensive table scans or awkward GSI proliferation.
- **Hot partitions** — Uneven key distribution creates hot partitions that throttle even with sufficient provisioned capacity. Use composite keys or write sharding.
- **GSI costs are separate** — Each Global Secondary Index has its own capacity. Five GSIs effectively means you pay for five copies of your data.
- **On-Demand mode is expensive at scale** — On-Demand is 6.5x more expensive per request than equivalent provisioned capacity. Use it for unpredictable traffic, switch to provisioned when patterns stabilize.
- **Item size limit: 400KB** — Large documents must be split across items or stored in S3 with a DynamoDB pointer.
:::

### ElastiCache

**What it is**: Managed Redis or Memcached.

**When to use**: Application caching, session stores, real-time leaderboards, rate limiting, pub/sub.

**Pricing model**: Per-node-hour based on instance type. No per-request charges.

::: tip ElastiCache Redis vs Memcached
- **Choose Redis** for persistence, replication, pub/sub, Lua scripting, sorted sets, and data structures beyond key-value.
- **Choose Memcached** for simple caching with multi-threaded performance and when you do not need persistence.
:::

### DocumentDB

**What it is**: MongoDB-compatible document database. Uses Aurora's storage engine under the hood.

**When to use**: When you have a MongoDB application and want managed AWS infrastructure. When you want MongoDB's query API but with better HA/durability.

**Pricing model**: Per-instance-hour + storage ($0.10/GB/month) + I/O ($0.20 per million).

::: warning DocumentDB Gotchas
- **Not actually MongoDB** — DocumentDB implements the MongoDB wire protocol but uses a completely different storage engine. Some MongoDB features (certain aggregation operators, client-side encryption, change streams behavior) work differently or are unsupported. Test before migrating.
:::

### Neptune

**What it is**: Managed graph database supporting Gremlin and SPARQL.

**When to use**: Social networks, recommendation engines, fraud detection, knowledge graphs — any workload where relationships between entities are the primary query pattern.

### Timestream

**What it is**: Serverless time series database.

**When to use**: IoT sensor data, application metrics, DevOps monitoring, financial tick data — any time-ordered data where you query by time ranges.

**Pricing model**: Per-write ($0.50 per million writes) + per-query (data scanned) + storage (memory and magnetic tiers).

### MemoryDB for Redis

**What it is**: Redis-compatible, durable, in-memory database. Unlike ElastiCache Redis, MemoryDB provides durable multi-AZ storage using a distributed transaction log.

**When to use**: When you need Redis as a primary database (not just a cache) with durability guarantees. Microservices data stores, session management with durability requirements.

---

## Networking

### VPC (Virtual Private Cloud)

**What it is**: Your isolated network in AWS. Contains subnets, route tables, internet gateways, NAT gateways.

**When to use**: Everything runs inside a VPC. You configure VPCs, not choose them.

**Pricing model**: VPCs are free. NAT Gateways cost $0.045/hour + $0.045/GB processed — this is the most common VPC billing surprise.

::: warning VPC Gotchas
- **NAT Gateway costs** — A NAT Gateway running 24/7 costs ~$33/month minimum (just for existence) plus data processing. Two AZs means two NAT Gateways = $66/month before any traffic. For dev environments, consider NAT instances (cheaper but less reliable) or VPC endpoints.
- **CIDR planning** — You cannot resize a VPC CIDR block after creation (you can add secondary CIDRs, but not change the primary). Plan for growth. `/16` is common for production.
- **Security Groups are stateful, NACLs are stateless** — Security Groups automatically allow return traffic. NACLs require explicit rules for both inbound and outbound.
:::

### ALB and NLB

**What it is**: Application Load Balancer (Layer 7 — HTTP/HTTPS) and Network Load Balancer (Layer 4 — TCP/UDP/TLS).

| Feature | ALB | NLB |
|---------|-----|-----|
| Layer | 7 (HTTP/HTTPS) | 4 (TCP/UDP) |
| Routing | Path, host, header, query string | Port-based |
| WebSocket | Yes | Yes (passthrough) |
| Static IP | No (use Global Accelerator) | Yes |
| Latency | ~ms added | ~us added |
| Cost | Per LCU | Per NLCU |
| Use case | Web apps, microservices, API routing | High performance, gaming, IoT, gRPC |

**Pricing model**: Per-hour ($0.0225 ALB, $0.0225 NLB) + per-LCU/NLCU (based on new connections, active connections, bandwidth, and rule evaluations).

### Route 53

**What it is**: Managed DNS service + domain registration + health checks.

**When to use**: DNS for all AWS workloads. Health checking and DNS failover. Latency-based routing for global deployments.

**Pricing model**: $0.50/hosted zone/month + $0.40 per million queries (standard). Health checks: $0.50/month each.

### CloudFront

**What it is**: Global CDN with 450+ Points of Presence.

**When to use**: Static asset delivery, API acceleration, DDoS protection (integrated with AWS Shield), Lambda@Edge for edge compute.

**Pricing model**: Per-GB data transfer out (varies by region, $0.085/GB in US) + per-request ($0.01 per 10,000 HTTPS requests). First 1TB/month free.

::: tip CloudFront Cost Optimization
Enable **Origin Shield** ($0.0090 per 10,000 requests) to reduce origin load — it adds a centralized caching layer between edge locations and your origin. For high-traffic sites, this pays for itself by reducing origin compute.
:::

### API Gateway

**What it is**: Managed API proxy. REST APIs, HTTP APIs, and WebSocket APIs.

**When to use**: Frontend for Lambda functions, request validation, rate limiting, API key management, usage plans.

| Type | Cost per million | Features |
|------|-----------------|----------|
| REST API | $3.50 | Full features (caching, WAF, usage plans) |
| HTTP API | $1.00 | Simpler, faster, cheaper (no caching/WAF) |
| WebSocket | $1.00 + $0.25 per million connection-minutes | Real-time two-way communication |

::: warning API Gateway Gotchas
- **29-second timeout** — API Gateway times out at 29 seconds. Long-running operations must return immediately and use async patterns (Step Functions, SQS + polling).
- **10MB payload limit** — Large file uploads must go through S3 presigned URLs, not API Gateway.
- **HTTP API vs REST API** — HTTP APIs are 70% cheaper and faster, but lack caching, WAF integration, and request validation. Default to HTTP API unless you need those features.
:::

### PrivateLink

**What it is**: Private connectivity between VPCs, AWS services, and on-premises without traversing the public internet.

**When to use**: Accessing AWS services privately (S3, DynamoDB via VPC endpoints), exposing your service to other VPCs without VPC peering, compliance requirements that prohibit public internet traffic.

**Pricing model**: Interface endpoints: $0.01/hour per AZ + $0.01/GB processed. Gateway endpoints (S3, DynamoDB): free.

---

## Messaging and Streaming

### SQS (Simple Queue Service)

**What it is**: Fully managed message queuing. Standard (at-least-once, best-effort ordering) and FIFO (exactly-once, ordered).

**When to use**: Decoupling microservices, work queues, buffering writes, handling traffic spikes.

**Pricing model**: $0.40 per million requests (Standard), $0.50 per million requests (FIFO). First 1M requests/month free.

::: warning SQS Gotchas
- **Standard queues can deliver messages more than once** — Your consumer must be idempotent or use FIFO queues.
- **Visibility timeout** — If your consumer does not delete the message within the visibility timeout, the message becomes visible again and another consumer picks it up. Set the timeout to at least 6x your processing time.
- **Long polling** — Always use long polling (`WaitTimeSeconds: 20`). Short polling returns immediately (often empty), wasting requests and money.
- **FIFO throughput** — 300 messages/second without batching, 3,000 with batching. For higher throughput, use Standard queues.
:::

### SNS (Simple Notification Service)

**What it is**: Pub/sub messaging. One message published to a topic is delivered to all subscribers (SQS queues, Lambda, HTTP endpoints, email, SMS).

**When to use**: Fan-out patterns (one event triggers multiple consumers), notifications (email, SMS, push), combining with SQS for reliable fan-out.

**Pricing model**: $0.50 per million publishes. Delivery costs vary by protocol (SQS: free, Lambda: free, HTTP: $0.60/million, SMS: varies by country).

### EventBridge

**What it is**: Serverless event bus. Route events from AWS services, SaaS apps, and custom applications to targets based on rules.

**When to use**: Event-driven architectures, routing events between microservices, triggering workflows from SaaS events (Shopify, Zendesk, Auth0), scheduled events (cron replacement).

**Pricing model**: $1.00 per million events published to custom event bus. AWS service events are free. Schema discovery: $0.10 per million events.

::: tip SQS vs SNS vs EventBridge
- **SQS**: Point-to-point. One producer, one consumer. Use for work queues and decoupling.
- **SNS**: Fan-out. One producer, many consumers. Use when multiple services need the same event.
- **EventBridge**: Content-based routing. Route events to different targets based on event content. Use for complex event-driven architectures, SaaS integrations, and cross-account event routing.
:::

### Kinesis

**What it is**: Real-time data streaming platform.

| Component | Purpose |
|-----------|---------|
| Kinesis Data Streams | Real-time data ingestion (custom consumers) |
| Kinesis Data Firehose | Load streaming data into S3, Redshift, OpenSearch |
| Kinesis Data Analytics | SQL/Flink queries on streaming data |
| Kinesis Video Streams | Ingest and process video streams |

**When to use**: Real-time analytics, log aggregation, IoT data processing, click-stream analysis, when you need multiple consumers reading the same stream.

**Pricing model**: Data Streams: per-shard-hour ($0.015) + per-PUT ($0.014 per million). Firehose: per-GB ingested ($0.029).

### MSK (Managed Streaming for Apache Kafka)

**What it is**: Fully managed Apache Kafka.

**When to use**: When you specifically need Kafka (existing Kafka ecosystem, Kafka Connect, Kafka Streams), high-throughput streaming with consumer groups, event sourcing.

**Pricing model**: Per-broker-hour (based on instance type) + storage. Minimum 3 brokers. MSK Serverless: per-cluster-hour + per-partition-hour + data.

::: tip Kinesis vs MSK Decision
- **Choose Kinesis** for AWS-native integrations, lower ops burden, and pay-per-use pricing.
- **Choose MSK** for existing Kafka ecosystems, Kafka Connect connectors, higher throughput, and when you need the Kafka API specifically.
- **Choose MSK Serverless** for Kafka compatibility without managing brokers.
:::

---

## Security

### IAM (Identity and Access Management)

**What it is**: Controls who can do what in your AWS account. Users, groups, roles, and policies.

**Pricing model**: Free. Always free.

::: warning IAM Gotchas
- **Root account** — Never use the root account for daily operations. Enable MFA on root immediately. Create IAM users/roles for everything else.
- **Wildcard permissions** — `"Action": "*"` or `"Resource": "*"` in production policies is a security incident waiting to happen. Follow least privilege.
- **Policy evaluation** — Explicit Deny always wins. If any policy says Deny, the action is denied regardless of any Allow policies.
- **Service-linked roles** — Some services create roles automatically. Deleting them breaks the service.
:::

### KMS (Key Management Service)

**What it is**: Managed encryption keys. Create, rotate, and control access to encryption keys.

**When to use**: Encrypting S3 objects, EBS volumes, RDS databases, secrets. Required for compliance (PCI-DSS, HIPAA, SOC2).

**Pricing model**: $1/month per customer-managed key + $0.03 per 10,000 API calls. AWS-managed keys: free to use.

### Secrets Manager

**What it is**: Store, rotate, and manage secrets (database credentials, API keys, tokens).

**When to use**: Any secret your application needs at runtime. Automatic rotation of RDS/Redshift credentials.

**Pricing model**: $0.40 per secret per month + $0.05 per 10,000 API calls.

::: tip Secrets Manager vs Parameter Store
- **Secrets Manager**: Automatic rotation, cross-account access, higher cost ($0.40/secret/month). Use for database credentials and secrets that need rotation.
- **Systems Manager Parameter Store**: Free for standard parameters (up to 10,000), $0.05 per advanced parameter per month. No built-in rotation. Use for configuration values and non-rotating secrets.
:::

### WAF (Web Application Firewall)

**What it is**: Firewall rules for CloudFront, ALB, API Gateway, and AppSync. Block SQL injection, XSS, rate-limit by IP.

**When to use**: Any public-facing web application. Required for PCI-DSS compliance.

**Pricing model**: $5/month per web ACL + $1/month per rule + $0.60 per million requests.

### GuardDuty

**What it is**: Threat detection that monitors VPC Flow Logs, CloudTrail, and DNS logs for malicious activity.

**When to use**: Enable on every account. It detects cryptocurrency mining, compromised instances, and unauthorized access.

**Pricing model**: Per-volume of data analyzed. Typical costs: $1-4/month for small accounts, scales with volume.

### Security Hub

**What it is**: Aggregates security findings from GuardDuty, Inspector, Macie, and third-party tools into a single dashboard. Runs compliance checks against CIS, PCI-DSS, and AWS Best Practices.

**When to use**: Multi-account security posture management. Enable alongside GuardDuty.

---

## Observability

### CloudWatch

**What it is**: Monitoring and observability — metrics, logs, alarms, dashboards.

| Component | Purpose | Pricing |
|-----------|---------|---------|
| Metrics | Time-series data (CPU, memory, custom) | $0.30 per metric/month (first 10,000) |
| Logs | Centralized log storage and search | $0.50/GB ingested + $0.03/GB stored |
| Alarms | Alerts based on metric thresholds | $0.10 per standard alarm/month |
| Dashboards | Visualizations | $3/dashboard/month |
| Logs Insights | SQL-like log queries | $0.005 per GB scanned |
| Container Insights | ECS/EKS monitoring | Per metric/log pricing |

::: warning CloudWatch Gotchas
- **Log ingestion costs** — Verbose logging in Lambda or ECS can easily cost more than the compute itself. Use log levels and sampling.
- **Custom metrics cost** — Each custom metric (with dimensions) is $0.30/month. A service pushing 100 custom metrics with 5 dimensions each = 500 metrics = $150/month.
- **Default metric resolution is 5 minutes** — 1-minute detailed monitoring costs extra on EC2 ($2.10/instance/month for 7 metrics).
- **CloudWatch Logs have no TTL by default** — Logs are retained forever unless you set a retention policy. Set retention to 30-90 days for most workloads.
:::

### X-Ray

**What it is**: Distributed tracing. Trace requests across Lambda, API Gateway, ECS, EC2, and AWS SDK calls.

**When to use**: Debugging latency in microservice architectures, identifying bottlenecks, understanding service dependencies.

**Pricing model**: $5 per million traces recorded + $0.50 per million traces retrieved. First 100,000 traces/month free.

### CloudTrail

**What it is**: Audit log of every API call made in your AWS account. Who did what, when, from where.

**When to use**: Always enabled. Required for compliance. Used for security investigations, change tracking, and debugging IAM issues.

**Pricing model**: Management events (first trail): free. Data events (S3/Lambda): $0.10 per 100,000 events. CloudTrail Lake (query): per-GB scanned.

---

## CI/CD

### CodePipeline

**What it is**: Continuous delivery service. Orchestrates build, test, and deploy stages.

**When to use**: AWS-native CI/CD when you want to stay within the AWS ecosystem.

**Pricing model**: $1/active pipeline/month. First pipeline free.

### CodeBuild

**What it is**: Managed build service. Runs builds in Docker containers.

**When to use**: Building and testing code. Compiling artifacts. Running integration tests.

**Pricing model**: Per-build-minute based on compute type. `build.general1.small`: $0.005/min. `build.general1.large`: $0.02/min.

### CodeDeploy

**What it is**: Automates deployments to EC2, ECS, Lambda, and on-premises servers.

**When to use**: Blue/green deployments, rolling updates, canary deployments.

**Pricing model**: Free for EC2/Lambda. $0.02 per on-premises instance update.

::: tip AWS CI/CD vs GitHub Actions / GitLab CI
AWS CI/CD services are tightly integrated with AWS (IAM roles, VPC access, CodeArtifact). But most teams prefer GitHub Actions or GitLab CI for better developer experience, marketplace integrations, and cross-cloud support. Use AWS CodeBuild when you need VPC access during builds or want to keep everything in AWS.
:::

---

## AI and Machine Learning

### SageMaker

**What it is**: End-to-end ML platform — build, train, and deploy models. Includes notebooks, training jobs, endpoints, MLOps pipelines.

**When to use**: Custom model training and deployment, MLOps pipelines, when you need GPU training at scale.

**Pricing model**: Per-instance-hour for notebooks, training, and inference. Training: ml.p3.2xlarge ~$3.82/hr. Inference: ml.m5.large ~$0.13/hr.

::: warning SageMaker Gotchas
- **Notebook instances run 24/7** — A ml.t3.medium notebook forgotten over a weekend costs ~$5. A ml.p3.2xlarge forgotten costs ~$275. Auto-shutdown lifecycle configs are essential.
- **Endpoint costs** — Real-time inference endpoints run continuously. Use Serverless Inference for low-traffic models or Async Inference for batch processing.
:::

### Bedrock

**What it is**: Managed access to foundation models (Claude, Llama, Titan, Mistral, Stable Diffusion) via API. No infrastructure management.

**When to use**: Adding generative AI to applications, RAG systems, text/image generation, when you want to use foundation models without managing GPU infrastructure.

**Pricing model**: Per-input-token + per-output-token. Varies by model. Claude Sonnet: ~$3/million input tokens. Provisioned Throughput available for predictable workloads.

### Comprehend

**What it is**: NLP service — sentiment analysis, entity recognition, topic modeling, language detection.

**When to use**: Text analytics without building/training custom models. Content moderation, customer feedback analysis.

**Pricing model**: Per-unit (100 characters) processed. Starts at $0.0001 per unit for entity recognition.

### Rekognition

**What it is**: Image and video analysis — object detection, facial recognition, text in images, content moderation.

**When to use**: Identity verification, content moderation (NSFW detection), searchable image libraries, video analysis.

**Pricing model**: Per-image ($0.001 per image for first million) or per-minute of video ($0.10/min).

### Textract

**What it is**: OCR + document understanding. Extracts text, tables, and forms from scanned documents.

**When to use**: Invoice processing, form digitization, ID document extraction, any scanned document workflow.

**Pricing model**: Per-page. Detect text: $0.0015/page. Analyze document (tables/forms): $0.015/page.

---

## Decision Matrices

### Compute Decision Matrix

```
Start
  |
  v
Is it a short-lived task (< 15 min)?
  |-- Yes --> Does it respond to events? 
  |             |-- Yes --> Lambda
  |             |-- No --> Lambda (scheduled) or Step Functions
  |
  |-- No --> Is it containerized?
              |-- Yes --> Do you need Kubernetes?
              |            |-- Yes --> EKS (+ Fargate or EC2 nodes)
              |            |-- No --> Is it a simple web app?
              |                        |-- Yes --> App Runner
              |                        |-- No --> ECS on Fargate
              |
              |-- No --> Do you need full OS control?
                          |-- Yes --> EC2
                          |-- No --> Is it a simple site?
                                      |-- Yes --> Lightsail
                                      |-- No --> EC2
```

### Database Decision Matrix

| Requirement | Service |
|-------------|---------|
| Relational, standard SQL | RDS (MySQL/PostgreSQL) |
| Relational, high performance | Aurora |
| Relational, variable traffic | Aurora Serverless v2 |
| Key-value, sub-millisecond | DynamoDB |
| Key-value with caching | DynamoDB + DAX or ElastiCache |
| Document (MongoDB compat) | DocumentDB |
| Graph relationships | Neptune |
| Time series data | Timestream |
| In-memory, durable | MemoryDB for Redis |
| In-memory, cache only | ElastiCache |
| Full-text search | OpenSearch |

### Storage Decision Matrix

| Requirement | Service |
|-------------|---------|
| Object storage (files, images, backups) | S3 |
| Block storage for EC2 | EBS |
| Shared filesystem (NFS) | EFS |
| High-performance shared (HPC) | FSx for Lustre |
| Windows file shares | FSx for Windows |
| Archival (months/years) | S3 Glacier |

---

## Cost Optimization Tips

::: tip Top 10 Cost Optimization Strategies
1. **Enable AWS Cost Explorer and set budget alerts** — You cannot optimize what you do not measure. Set alerts at 50%, 80%, and 100% of expected spend.
2. **Use Savings Plans over Reserved Instances** — Savings Plans are more flexible (apply across instance families and regions) and offer similar discounts (up to 72%).
3. **Right-size instances** — AWS Compute Optimizer gives free recommendations. Most instances are over-provisioned by 40-60%.
4. **Use Spot Instances for fault-tolerant workloads** — Batch processing, CI/CD builds, and stateless web servers can save 60-90% with Spot.
5. **Set S3 lifecycle policies** — Move data to IA after 30 days, Glacier after 90 days, Deep Archive after 365 days. Delete incomplete multipart uploads after 7 days.
6. **Remove unused resources** — Unattached EBS volumes, idle load balancers, unused Elastic IPs, forgotten RDS snapshots. Use AWS Trusted Advisor or third-party tools.
7. **Use VPC Gateway Endpoints for S3 and DynamoDB** — Free. Interface endpoints (PrivateLink) cost money, but Gateway Endpoints for S3/DynamoDB traffic save NAT Gateway data processing charges.
8. **Compress and deduplicate CloudWatch Logs** — Set retention policies. Use log sampling for high-volume Lambda functions.
9. **Use Aurora Serverless v2 for variable workloads** — Scales to zero (0.5 ACU minimum) instead of paying for idle RDS instances.
10. **Review your NAT Gateway bill** — NAT Gateways charge per GB processed. VPC Endpoints, S3 Gateway Endpoints, and IPv6 can dramatically reduce this cost.
:::

### Common Billing Surprises

| Surprise | Cause | Fix |
|----------|-------|-----|
| $100+ NAT Gateway bill | All traffic routed through NAT | VPC Endpoints for AWS services |
| Growing EBS costs | Snapshots accumulating | Snapshot lifecycle policies |
| High CloudWatch bill | Verbose Lambda logging | Log levels, retention policies |
| DynamoDB costs 10x expected | On-Demand mode at scale | Switch to Provisioned with auto-scaling |
| Data transfer charges | Cross-AZ traffic between services | Co-locate services in same AZ (trade HA for cost) |
| Idle SageMaker notebooks | GPU instance left running | Auto-shutdown lifecycle config |
| S3 request costs > storage | Millions of small files | Batch operations, larger objects |

---

::: tip Key Takeaway
- AWS services overlap intentionally — there are multiple valid choices for most workloads. The right choice depends on your team's expertise, traffic patterns, and budget constraints, not on which service is "best" in isolation.
- Pricing models are the hidden architecture driver. A service that costs $0 at low scale can bankrupt you at high scale (DynamoDB On-Demand, API Gateway REST API, CloudWatch custom metrics). Always model costs at 10x your current scale before committing.
- The most expensive AWS service is the one you forgot to turn off. Budget alerts, tagging policies, and regular cost reviews are not optional — they are infrastructure.
:::

::: warning Common Misconceptions
- **"Serverless is always cheaper."** Lambda + API Gateway at sustained high traffic (millions of requests/hour) can cost more than a fleet of EC2 instances. Serverless excels at variable/spiky traffic, not constant high throughput.
- **"Multi-AZ doubles your cost."** Multi-AZ for RDS doubles the instance cost, yes. But Multi-AZ for S3 is the default (11 nines durability). Multi-AZ for DynamoDB is included in the base price. The cost impact depends entirely on the service.
- **"Aurora is always better than RDS."** Aurora has higher per-instance costs and I/O charges that RDS does not have. For small, predictable workloads with low I/O, RDS PostgreSQL/MySQL can be cheaper.
- **"DynamoDB is always the right choice for NoSQL."** DynamoDB requires you to know access patterns upfront. If your query patterns are flexible or evolving, DocumentDB (MongoDB-compatible) or even PostgreSQL with JSONB may be better choices.
- **"AWS Free Tier lasts forever."** Some free tier offers are 12-month (EC2, RDS, S3 standard). Others are always-free (Lambda 1M requests, DynamoDB 25 WCU/25 RCU). The 12-month ones expire, and suddenly you have a bill.
- **"You need a NAT Gateway for every VPC."** You need a NAT Gateway only if private subnets need outbound internet access. VPC Endpoints for AWS services, IPv6, and restructuring which subnets are public vs private can eliminate the need entirely.
:::

## When NOT to Use AWS

- **Simple static sites** — Vercel, Netlify, and Cloudflare Pages offer zero-config deployments with global CDN, preview deployments, and generous free tiers. S3 + CloudFront + Route 53 + ACM requires manual configuration for the same result.
- **Small team MVPs** — AWS's complexity overhead (IAM, VPC, security groups, etc.) can slow down teams of 1-3 developers. Railway, Render, or Fly.io deploy faster with simpler mental models.
- **Cost-sensitive hobby projects** — AWS's pay-per-use model has too many line items to track. A $5/month DigitalOcean droplet or Hetzner VPS is more predictable.
- **Multi-cloud is a hard requirement** — If you must run on AWS and GCP/Azure simultaneously, avoid deep AWS-native services (DynamoDB, Aurora, SQS). Use portable alternatives (PostgreSQL, RabbitMQ, Kubernetes) instead.
- **When compliance mandates on-premises** — Some regulated industries require data to stay on-premises. AWS Outposts exists but is expensive. If most workloads must be on-prem, a cloud-first strategy may not make sense.

::: tip In Production
- **Netflix** runs entirely on AWS. Their architecture is the textbook for EC2 Auto Scaling, S3 for content storage, DynamoDB for session state, CloudFront for content delivery, and Kinesis for real-time analytics. They process petabytes daily.
- **Airbnb** uses a mix of EC2, ECS, S3, DynamoDB, ElastiCache, and SageMaker. Their migration to ECS from a custom deployment system reduced deployment time from 30 minutes to 3 minutes.
- **Stripe** uses AWS across multiple regions with Aurora for payment data, DynamoDB for high-throughput lookups, SQS for async processing, and a sophisticated multi-region failover architecture.
- **Capital One** went all-in on AWS in 2020 (closing all data centers), using Lambda, Step Functions, and DynamoDB for transaction processing with GuardDuty and Security Hub for compliance.
- **NASA JPL** uses AWS for Mars rover data processing — S3 for raw image storage, SageMaker for image analysis, and Step Functions for orchestrating processing pipelines.
:::

::: details Quiz

**1. When should you choose Aurora over standard RDS PostgreSQL?**

::: details Answer
Choose Aurora when you need: high throughput (Aurora claims 3x PostgreSQL performance), fast failover (< 30 seconds vs minutes for RDS Multi-AZ), up to 15 read replicas with sub-10ms replication lag, automatic storage scaling up to 128TB, or serverless auto-scaling (Aurora Serverless v2). Stick with RDS when you need Oracle/SQL Server, want lower costs for small/predictable workloads, or when Aurora's I/O charges make it more expensive than provisioned RDS storage for your access pattern.
:::

**2. What is the key difference between SQS Standard and SQS FIFO queues, and when does it matter?**

::: details Answer
SQS Standard provides at-least-once delivery (messages can be delivered more than once) and best-effort ordering (messages may arrive out of order). FIFO provides exactly-once delivery and strict ordering. Use FIFO when order matters (event sourcing, sequential processing) or when duplicate processing is unacceptable. Use Standard when your consumer is idempotent and you need higher throughput (Standard is virtually unlimited; FIFO is capped at 3,000 messages/second with batching).
:::

**3. A Lambda function behind API Gateway times out after 29 seconds on large data processing. What are your options?**

::: details Answer
API Gateway has a hard 29-second timeout. Options: (1) Return immediately with a job ID and use async processing — the client polls a status endpoint or receives a webhook. Use SQS + Lambda or Step Functions for the actual work. (2) Use Lambda streaming responses (response streaming) to send data progressively. (3) Move the workload to ECS/Fargate behind an ALB (no 29-second limit). (4) Optimize the Lambda to complete within 29 seconds (parallel processing, pre-warming, reducing data). Do not increase the Lambda timeout to 15 minutes — API Gateway will still cut the connection at 29 seconds.
:::

**4. You are running 50 EC2 instances 24/7. What is the most cost-effective purchasing strategy?**

::: details Answer
Use Compute Savings Plans for the baseline (the minimum instances you always need) — this provides up to 66% savings with flexibility across instance families, sizes, and regions. Use On-Demand for the variable portion above baseline. If workloads are fault-tolerant (stateless web servers), use Spot Instances for the variable portion instead (up to 90% savings). Use AWS Compute Optimizer to right-size instances before committing — most instances are over-provisioned. A common mix: 60% Savings Plans, 20% Spot, 20% On-Demand.
:::

**5. Your monthly NAT Gateway bill is $500. How do you reduce it?**

::: details Answer
(1) Use VPC Gateway Endpoints for S3 and DynamoDB traffic — these are free and eliminate NAT Gateway data processing charges for AWS service traffic. (2) Use VPC Interface Endpoints (PrivateLink) for other frequently accessed AWS services (SQS, SNS, CloudWatch). (3) Audit what traffic is going through the NAT Gateway using VPC Flow Logs — you may find unexpected external calls. (4) Consider using IPv6 for outbound traffic where possible (no NAT needed). (5) For dev/staging environments, use a single NAT Gateway instead of one per AZ. (6) If the traffic is mostly to AWS services, restructure to use public subnets with security groups instead of private subnets + NAT.
:::

**6. When would you choose EventBridge over SNS for pub/sub?**

::: details Answer
Choose EventBridge when you need content-based filtering (route events based on payload fields, not just topic), SaaS integrations (EventBridge has built-in partners like Shopify, Zendesk, Auth0), cross-account event routing, schema discovery and registry, event replay (archive and replay past events), or scheduling (cron expressions). Choose SNS when you need raw message throughput (SNS supports up to 30 million messages/second vs EventBridge's much lower limits), SMS/email delivery, or simple fan-out without content-based routing.
:::

:::

::: details Exercise
**Design a Cost-Optimized Architecture**

You are building a SaaS application with the following requirements:
- Web API handling 10,000 requests/minute at peak, 500 requests/minute at off-peak
- User data in a relational database (500GB, complex queries)
- File uploads up to 100MB per file (1TB total storage, growing 100GB/month)
- Background job processing (email sending, PDF generation, data exports)
- Real-time notifications to connected clients
- Budget: $2,000/month maximum

Design the architecture using AWS services and estimate costs:

1. Choose the compute strategy (justify Lambda vs containers vs EC2)
2. Choose the database (justify the specific service)
3. Design the file upload flow
4. Design the background job architecture
5. Design the real-time notification system
6. Estimate monthly costs for each component

::: details Solution Outline
**Compute**: ECS on Fargate for the API. At 10k req/min peak, Lambda + API Gateway would cost ~$900/month just in API Gateway charges ($1/million x ~14M requests/month for HTTP API). Fargate with 2 tasks (2 vCPU, 4GB) auto-scaling: ~$150/month.

**Database**: Aurora PostgreSQL Serverless v2. Complex queries rule out DynamoDB. 500GB is well within Aurora's range. Serverless v2 scales down during off-peak (0.5 ACU minimum = ~$44/month) and up during peak. Estimated: $200-400/month depending on I/O.

**File Uploads**: S3 Standard with presigned URLs (upload directly from client to S3, bypassing the API). Lifecycle policy: move to IA after 90 days. 1TB storage + 100GB/month growth. First year: ~$25/month. Add CloudFront for downloads if files are frequently accessed.

**Background Jobs**: SQS Standard queue + Lambda consumers. Email sending triggers Lambda (< 15 min, event-driven). PDF generation in ECS Fargate Spot task (may need more than 15 min / 10GB /tmp). Data exports in Step Functions orchestrating Lambda + S3. Estimated: ~$50/month.

**Real-Time Notifications**: API Gateway WebSocket API + Lambda. Connected clients maintain WebSocket connection. Notifications published to SNS, Lambda fans out to connected WebSocket clients. Estimated: ~$30/month (depends on connection count and message frequency).

**Observability**: CloudWatch Logs (set 30-day retention) + X-Ray (sample 5% of traces). Estimated: ~$50/month.

**Total Estimate**: ~$550-750/month — well within $2,000 budget with room for growth.

**Key cost decisions**: (1) Fargate over Lambda saved ~$750/month on API Gateway. (2) Aurora Serverless v2 over provisioned Aurora saves ~$200/month during off-peak. (3) S3 presigned URLs avoid data transfer through the API. (4) SQS + Lambda for background jobs avoids always-running workers.
:::

:::

> **One-Liner Summary:** AWS has a service for everything — the skill is not knowing them all, but knowing which 10-15 to pick for your workload, how their pricing scales, and which forgotten resource is silently draining your budget at 3 AM.

*Last updated: 2026-04-05*
