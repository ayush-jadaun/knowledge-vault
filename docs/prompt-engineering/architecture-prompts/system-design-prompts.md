---
title: "System Design Prompts: 25+ Prompts for Distributed Systems and APIs"
description: "Comprehensive library of system design prompts for distributed systems, database design, API architecture, event-driven systems, and system design interviews"
tags: [prompt-engineering, system-design, distributed-systems, api-design, databases, architecture]
difficulty: "advanced"
prerequisites: []
lastReviewed: "2026-03-18"
---

# System Design Prompts: 25+ Prompts for Distributed Systems and APIs

## Overview

System design is the art of making well-reasoned choices under constraints. These prompts help you use AI to rapidly explore the design space, generate detailed technical specifications, identify failure modes, and produce documentation — all of which a skilled architect would review and refine.

## Core System Design Prompts

### 1. Full System Design

```
Design a complete system for [product description].

Requirements:
- Functional: [list core features]
- Scale: [DAU / MAU / requests per second / data volume]
- SLOs: Availability [X]%, P99 latency [N]ms, RPO [duration], RTO [duration]
- Team: [number of engineers, skill level, existing stack]
- Budget: [monthly infrastructure budget or constraints]
- Compliance: [GDPR, HIPAA, SOC2, PCI, etc.]

Design the following components:
1. **Client layer**: Web, mobile, API consumers
2. **API layer**: REST/GraphQL/gRPC, gateway, authentication
3. **Service layer**: Core business logic services, their responsibilities and boundaries
4. **Data layer**: Databases by type (relational, document, cache, search), schemas, data ownership
5. **Infrastructure**: Cloud provider, regions, CDN, load balancing
6. **Async processing**: Message queues, event streams, background jobs
7. **Observability**: Metrics, logging, tracing, alerting

Deliverables:
- Architecture diagram (describe for mermaid)
- Component responsibility matrix
- Key design decisions with rationale
- Top 5 risks and mitigations
- Estimated infrastructure cost
```

### 2. API Design Review

```
Review and improve this API design:

[paste OpenAPI spec, REST endpoint list, or describe API]

Evaluate against:
1. **RESTful principles**: Resource naming, HTTP verb usage, status codes
2. **Consistency**: Naming conventions, response formats, error formats
3. **Versioning strategy**: URL versioning vs. header versioning vs. content negotiation
4. **Pagination**: Cursor-based vs. offset, response format
5. **Filtering and sorting**: Query parameter conventions
6. **Authentication**: How auth is expressed in the API contract
7. **Idempotency**: Which operations are idempotent, idempotency keys
8. **Rate limiting**: How rate limits are communicated
9. **Error responses**: RFC 7807 Problem Details format

Output:
- Issues found (critical / major / minor)
- Improved API specification
- API changelog describing breaking changes from current design
- Migration path for existing clients
```

### 3. Database Schema Design

```
Design a database schema for [application/domain].

Domain: [describe the domain — e.g., e-commerce, healthcare, social network]
Scale requirements: [rows per table, query patterns, read/write ratio]
Consistency requirements: [strong / eventual / per-operation]

Design for:
1. **Entity model**: Core entities and their attributes
2. **Relationships**: One-to-one, one-to-many, many-to-many
3. **Normalization level**: 3NF, BCNF, or denormalization for performance?
4. **Indexes**: Which indexes to create and why (covering indexes, partial indexes)
5. **Constraints**: NOT NULL, UNIQUE, FOREIGN KEY, CHECK constraints
6. **Partitioning strategy**: If the table will be large (>100M rows)
7. **Soft deletes**: Use deleted_at vs. hard deletes?
8. **Audit trail**: How to track who changed what and when?
9. **Tenancy**: If multi-tenant — row-level, schema-level, or database-level isolation?

Output:
- SQL DDL for all tables
- ER diagram (mermaid)
- Index justifications
- Query examples showing how common access patterns use the schema
- Migration scripts
```

### 4. Event-Driven Architecture Design

```
Design an event-driven architecture for [system/domain].

Current state: [monolith/existing services — describe what produces/consumes events]
Events to design: [list the key events or derive them from requirements]

Design:
1. **Event schema**: Avro / JSON Schema / Protobuf for each event type
2. **Topic structure**: How to name and organize Kafka/SQS/EventBridge topics
3. **Producer design**: How services publish events (transactional outbox pattern?)
4. **Consumer design**: Consumer groups, idempotency, error handling
5. **Event store**: Do events need to be stored for replay?
6. **Ordering guarantees**: Required? At what granularity?
7. **Schema registry**: Managing schema evolution across producers/consumers
8. **Dead letter handling**: What happens to failed events?

Tricky scenarios to address:
- Event ordering when partitioned
- Consumer lag during traffic spikes
- Schema evolution without downtime
- Exactly-once vs. at-least-once semantics

Output:
- Event catalog with schema definitions
- Consumer/producer interaction diagram
- Error handling strategy
- Monitoring: what to alert on
```

### 5. Microservices Decomposition

```
Decompose this [monolith/service] into microservices.

Current system: [describe what the monolith does — its domains, features, databases]
Team structure: [number of teams, ownership boundaries]
Scale requirements: [which components need to scale independently?]

Decomposition criteria to apply:
1. **Domain-Driven Design**: Identify bounded contexts and aggregate boundaries
2. **Business capability**: Each service owns one business capability
3. **Data ownership**: Services own their data — no shared database tables
4. **Team alignment**: Services align to team ownership (Conway's Law)
5. **Deployment independence**: Services can be deployed independently
6. **Scaling independence**: Components that need different scaling are separated

For each proposed service:
- Service name and responsibility
- API surface (what it exposes)
- Data it owns
- Events it produces and consumes
- Dependencies on other services
- Team ownership

Also identify:
- Anti-patterns to avoid (distributed monolith, chatty microservices)
- Synchronous vs. asynchronous communication choices
- Data consistency strategy between services
- Service mesh or API gateway needs
```

### 6. CQRS and Event Sourcing Design

```
Design a CQRS/Event Sourcing architecture for [domain/use case].

Domain: [describe the domain and why CQRS might be appropriate]
Read requirements: [describe read patterns, query complexity, scale]
Write requirements: [describe write patterns, business rules, audit needs]

Design:
1. **Command model**: Commands, command handlers, aggregates, domain events
2. **Event store**: Technology choice (EventStoreDB, PostgreSQL events table, Kafka)
3. **Projections**: Read models derived from events, rebuild strategy
4. **Query model**: Optimized read stores (PostgreSQL, Elasticsearch, Redis)
5. **Eventual consistency**: How to handle the delay between write and read model
6. **Snapshotting**: When to snapshot aggregates to avoid replaying thousands of events
7. **Schema evolution**: Upcasting old events to new schema versions

TypeScript example:
- Aggregate class with state + event application
- Event types (discriminated union)
- Command handler
- Projection handler

When NOT to use this pattern:
- Simple CRUD applications
- Small teams (high operational overhead)
- When strong read-after-write consistency is required
```

## Data Architecture Prompts

### 7. Caching Strategy Design

```
Design a comprehensive caching strategy for [system].

System description: [what you're caching, the data, access patterns]

Cache tiers to consider:
1. **CDN cache**: Static assets, public API responses
2. **Application cache**: In-process (Node.js Map, LRU-Cache)
3. **Distributed cache**: Redis/Memcached
4. **Database cache**: Query result cache, materialized views

For each tier:
- What to cache
- TTL strategy (how long, how to set TTL)
- Invalidation strategy (TTL-based, event-based, manual)
- Cache key design (prevent key collisions, support namespacing)
- Cache stampede prevention (lock, probabilistic early expiration)
- Thundering herd prevention on cache miss

Cache patterns to implement:
- Cache-aside (lazy loading)
- Write-through
- Write-behind (write-back)
- Read-through

Failure scenarios:
- Cache is down: graceful degradation to database
- Cache poisoning prevention
- Memory pressure: eviction policy selection (LRU, LFU, TTL)

Output: Redis configuration, cache key naming conventions, TypeScript cache layer implementation.
```

### 8. Search Architecture Design

```
Design a search system for [application].

Data to search: [describe — documents, products, users, logs, etc.]
Query types: [full-text, faceted, geo, autocomplete, typo-tolerant]
Scale: [number of documents, query rate]
Latency requirement: [P99 latency target]

Options to compare:
1. **Elasticsearch**: Most flexible, highest operational cost
2. **OpenSearch**: AWS-managed Elasticsearch alternative
3. **PostgreSQL full-text search**: Simple, no extra infrastructure
4. **Typesense**: Easy to operate, great typo tolerance
5. **Meilisearch**: Very fast, typo tolerant, simple API
6. **Algolia**: Fully managed, highest cost

Decision framework:
- Document count < 1M: Typesense or Meilisearch
- Document count 1M-100M: Elasticsearch or OpenSearch
- Simple needs, existing PostgreSQL: Use pg tsvector/tsquery
- Never want to manage infra: Algolia (if budget allows)

Provide for chosen technology:
- Index schema design
- Query patterns with examples
- Indexing pipeline (how data gets into search)
- Update strategy (real-time vs. batch)
- Relevance tuning approach
```

### 9. Multi-Region Database Architecture

```
Design a multi-region database architecture for [application].

Requirements:
- Regions: [list regions — e.g., us-east-1, eu-west-1, ap-southeast-1]
- Data residency requirements: [any GDPR, data sovereignty constraints]
- Consistency requirements: [strong / eventual — user's own data must be consistent?]
- Read/write patterns: [read-heavy? write-heavy? local vs. cross-region]

Architecture options to evaluate:
1. **Active-passive** (single write region, read replicas): Simplest, highest write latency for some regions
2. **Active-active** (writes in any region): Lowest latency, conflict resolution needed
3. **Data partitioning by region**: Each user's data lives in their region (data locality)
4. **CRDT-based eventually consistent**: For conflict-free concurrent writes

For chosen approach:
- Replication technology (CockroachDB, Aurora Global, Spanner, Vitess)
- Conflict resolution strategy (if applicable)
- Failover procedure
- Latency expectations per operation per region
- Cost estimate
- Data migration approach from current single-region

Include: RPO and RTO analysis for each approach.
```

## API Gateway and Service Mesh Prompts

### 10. API Gateway Design

```
Design an API gateway for a microservices architecture.

Services behind the gateway: [list services and their APIs]
Client types: [web browser, mobile app, third-party API consumers, internal services]

Gateway responsibilities to design:
1. **Routing**: Path-based and host-based routing rules
2. **Authentication**: JWT validation, API key validation, OAuth 2.0
3. **Rate limiting**: Per-user, per-endpoint, global rate limits
4. **Request/response transformation**: Header manipulation, body transformation
5. **Load balancing**: Strategy per service
6. **Circuit breaker**: Failure detection and graceful degradation
7. **Observability**: Request logging, metrics, distributed tracing header injection
8. **CORS**: Centralized CORS handling

Technology options:
- **Kong**: Open source, plugin ecosystem, high performance
- **AWS API Gateway**: Managed, tight AWS integration, pay per request
- **nginx + custom**: Maximum control, operational overhead
- **Traefik**: Kubernetes-native, automatic discovery

For each option: pros/cons, configuration example, cost model.

Provide: Configuration files for chosen technology.
```

### 11. Service Mesh Evaluation

```
Evaluate whether we need a service mesh and which to choose.

Current state:
- [N] microservices
- Communication: [REST / gRPC / mix]
- Current security: [describe how services authenticate to each other currently]
- Current observability: [describe current tracing/metrics setup]

Problems we're trying to solve:
- [list the specific problems — e.g., no mTLS, no distributed tracing, circuit breakers needed]

Service mesh options:
1. **Istio**: Most features, highest complexity, Google/IBM/Lyft
2. **Linkerd**: Lightweight, simple, CNCF graduated
3. **Consul Connect**: HashiCorp, good for multi-cloud
4. **AWS App Mesh**: Managed, AWS-native, uses Envoy
5. **Cilium**: eBPF-based, very high performance, network policy

Decision matrix:
- Team K8s expertise: [beginner/intermediate/expert]
- Number of services: [N]
- Compliance requirements: [mTLS required?]
- Performance overhead tolerance: [ms budget]

For each option: installation complexity, resource overhead (CPU/memory per sidecar), feature comparison, migration path.

Also: What can we get without a service mesh? (OpenTelemetry, circuit breakers in code, mTLS via cert-manager)
```

## Reliability Engineering Prompts

### 12. SLI/SLO Design

```
Design SLIs and SLOs for [service/product].

Service description: [what it does, who uses it, how critical it is]

Design SLIs for each category:
1. **Availability**: Is the service up?
2. **Latency**: How fast is it responding?
3. **Error rate**: What fraction of requests are failing?
4. **Throughput**: Can it handle the current load?
5. **Saturation**: How full are critical resources?

For each SLI:
- Measurement method (how do you measure this?)
- Threshold for "bad" vs "good"
- Aggregation window
- Proposed SLO target (90th, 95th, 99th, 99.9th percentile)
- Error budget calculation

User journey SLOs (end-to-end):
- [Describe key user journeys]
- What does a "successful" user journey look like?
- SLO for the full journey, not just individual services

Also design:
- Alert policy: When to page on-call (burn rate alerts)
- SLO dashboard: What to display
- Error budget policy: What happens when budget is exhausted?
```

### 13. Resilience Patterns Implementation

```
Implement resilience patterns for service-to-service communication.

Services involved: [list calling service and called service]
Current behavior: [describe — direct HTTP calls, no error handling]

Patterns to implement:

1. **Retry with exponential backoff**
   - When to retry (transient errors only, not 4xx)
   - Exponential backoff with jitter formula
   - Max retry attempts and total timeout budget

2. **Circuit breaker**
   - Closed → Open threshold (N failures in T seconds)
   - Half-open: how many probe requests
   - Open → Closed: recovery conditions

3. **Bulkhead**
   - Separate thread pool / connection pool per downstream service
   - Prevents one slow service from exhausting all resources

4. **Timeout**
   - Per-request timeout
   - Total budget timeout (for chains of calls)
   - How timeouts interact with retries

5. **Fallback**
   - What to return when the service is unavailable
   - Cached response, default value, graceful degradation

TypeScript implementation using:
- axios-retry for retry
- opossum for circuit breaker
- Or implement from scratch

Also: Where to put resilience logic — at the call site, shared library, or service mesh?
```

## System Design Interview Prompts

### 14. System Design Interview Prep

```
Help me prepare for a system design interview for [target company/role].

Interview format: [45 minutes / 60 minutes]
Role level: [L4/L5/L6 or equivalent]
Expected systems to design: [hint at common systems — URL shortener, notification system, etc.]

For each common system design problem:
1. Clarifying questions to ask (scale, features, constraints)
2. Back-of-envelope estimation (QPS, storage, bandwidth)
3. High-level design (diagram components)
4. Deep dives: database choice, API design, caching, scaling
5. Trade-offs: what you're sacrificing in your design
6. Follow-up questions interviewers commonly ask

Systems to cover:
- URL shortener (TinyURL)
- Twitter/X timeline feed
- WhatsApp messaging
- Uber/ride-sharing backend
- Netflix video streaming
- Google Search typeahead
- Rate limiter

For each: provide a structured answer template I can memorize the pattern of, not the exact answer.
```

### 15. Architecture Trade-off Analysis

```
Analyze the trade-offs between these architectural approaches for [use case]:

Option A: [describe approach, e.g., monolith]
Option B: [describe approach, e.g., microservices]
Option C: [describe approach, e.g., modular monolith]

Context:
- Team size: [N engineers]
- Scale: [current and projected]
- Stage: [startup / growth / mature]
- Main risk: [speed to market / reliability / scalability / cost]

Trade-off dimensions:
| Dimension | Option A | Option B | Option C |
| Complexity | | | |
| Development speed | | | |
| Operational overhead | | | |
| Scalability ceiling | | | |
| Fault isolation | | | |
| Deployment independence | | | |
| Data consistency | | | |
| Team cognitive load | | | |

Recommendation: Given the context, which option and why?
What changes in the recommendation if [key assumption] changes?
What are the irreversible decisions to watch out for?
```

## Domain-Specific Design Prompts

### 16. Real-Time Features Architecture

```
Design real-time features for [application].

Features needed:
- [list: live notifications, collaborative editing, presence indicators, live updates, etc.]

Connection options:
1. **WebSockets**: Full-duplex, persistent connection
2. **Server-Sent Events (SSE)**: Server push, simpler than WebSocket
3. **Long polling**: Compatible fallback, higher latency
4. **WebRTC**: Peer-to-peer, for media or low-latency data

For chosen approach:
- Connection management at scale (how many concurrent connections?)
- Fan-out: how do you push to multiple users simultaneously?
- Message ordering guarantees
- Reconnection and state synchronization
- Load balancing: sticky sessions vs. message broker fan-out
- Scalability: 10K, 100K, 1M concurrent connections

Also design:
- Presence system (who is online)
- Message delivery guarantees (at-least-once, exactly-once)
- Read receipts (delivered, read)

Technology options: Socket.io, native WebSocket, Ably, Pusher, Phoenix Channels
```

### 17. Authentication and Authorization Architecture

```
Design authentication and authorization for [application].

Requirements:
- User types: [end users / admins / service accounts / third-party]
- Authentication methods needed: [email+password / SSO / OAuth / passkeys / MFA]
- Authorization model: [RBAC / ABAC / ReBAC / policy-based]
- Multi-tenant: [yes/no — if yes, tenant isolation requirements]
- Compliance: [SOC 2, HIPAA, FedRAMP — affects cryptography and audit requirements]

Authentication design:
1. Token strategy: JWT vs. opaque tokens vs. session cookies
2. Token storage: HttpOnly cookies vs. localStorage trade-offs
3. Token refresh: Silent refresh vs. refresh token rotation
4. MFA: TOTP, WebAuthn, SMS (discouraged — why?)
5. SSO: SAML vs. OIDC, provider selection

Authorization design:
1. Permission model: Define roles, permissions, scope
2. Policy evaluation: Where authorization logic lives
3. Permission caching: Avoid DB lookup on every request
4. Audit log: Every authorization decision logged?
5. Least privilege: How to prevent privilege creep over time

Provide:
- JWT payload structure
- Authorization middleware
- Permission check utility
- Database schema for RBAC
```

### 18. File Storage and CDN Architecture

```
Design a file storage and delivery architecture for [application].

File types: [images / videos / documents / user uploads / static assets]
Scale: [number of files, total storage, upload/download rates]
Requirements: [access control — public vs. private, geographic distribution, compliance]

Storage tiers:
1. **Hot storage**: Frequently accessed (S3 Standard, GCS Standard)
2. **Warm storage**: Infrequently accessed (S3 IA, GCS Nearline)
3. **Cold storage**: Archive (S3 Glacier, GCS Coldline)
4. **Lifecycle policies**: Auto-transition between tiers

CDN strategy:
- CDN selection: CloudFront, Fastly, Cloudflare, Akamai
- Cache control headers: max-age, stale-while-revalidate, stale-if-error
- Cache invalidation: On-demand purge vs. versioned URLs
- Geographic distribution: Which edge locations?
- HTTPS: TLS termination at CDN

Private file access:
- Presigned URLs: How to generate and how long should they be valid?
- CDN signed cookies: For authenticated video streaming
- Access control: Token-based access at CDN layer

Image processing:
- On-the-fly resizing: Imgix, Cloudinary, CloudFront with Lambda@Edge
- Responsive images: Multiple sizes in storage vs. dynamic generation
- Format conversion: AVIF, WebP fallback pipeline
```

## Advanced System Design Prompts

### 19. Distributed Transactions Design

```
Design distributed transaction handling for [system].

Problem: [describe the multi-service operation that needs to be consistent]
Services involved: [list]

Options to compare:
1. **Two-Phase Commit (2PC)**: Strong consistency, tight coupling, not for microservices
2. **Saga pattern**: Eventually consistent, loose coupling
   - Choreography-based: events trigger compensating transactions
   - Orchestration-based: central coordinator drives the saga
3. **Outbox pattern**: Reliably publish events after DB writes
4. **CRDT**: For commutative operations where eventual consistency is sufficient

For Saga pattern implementation:
- Define each step and its compensating transaction
- Failure scenarios: What if step 3 of 5 fails? How to compensate steps 1-2?
- Idempotency: Each step must be safe to replay
- Visibility: How to track saga progress?

TypeScript implementation:
- Saga orchestrator class
- Step definitions with execute() and compensate()
- Persistence of saga state
- Timeout handling

Also: When is eventual consistency acceptable? What user-facing inconsistencies result?
```

### 20. Observability Architecture

```
Design a complete observability stack for [system].

Current state: [describe existing monitoring, if any]
Scale: [N services, M requests/second, L logs/day]
Team: [engineers responsible for operating the system]

Three pillars:

**Metrics (Prometheus/Grafana)**
- Service-level metrics to instrument (RED: Rate, Errors, Duration)
- Infrastructure metrics (CPU, memory, disk, network)
- Business metrics (users active, revenue per minute)
- Recording rules and alerts
- Dashboard design

**Logs (Loki/Elasticsearch)**
- Log levels and when to use each
- Structured logging format (JSON, what fields to always include)
- Correlation ID: trace_id, span_id, request_id
- Log aggregation pipeline
- Retention policy

**Traces (Jaeger/Tempo/OpenTelemetry)**
- Auto-instrumentation vs. manual
- Sampling strategy (100% for errors, 1% for success traces)
- Span attributes to capture
- Service map generation

Alerting strategy:
- Alert fatigue prevention
- Symptom-based alerts (user-visible impact) vs. cause-based
- PagerDuty/OpsGenie routing rules
- Runbook links in alert definitions

Cost management:
- Log sampling to reduce volume
- Metrics cardinality reduction
- Trace storage tiering
```

### 21. Security Architecture Review

```
Review the security architecture of [system].

System description: [describe what it is and what data it processes]

Security domains to review:
1. **Network security**: Ingress/egress controls, network policies, VPC design
2. **Application security**: Authentication, authorization, input validation, output encoding
3. **Data security**: Encryption at rest, encryption in transit, key management
4. **Secret management**: How secrets are stored and rotated
5. **Dependency security**: Vulnerability scanning, dependency pinning
6. **Supply chain security**: Container image signing, SBOM
7. **Incident response**: Detection, response, forensics capability

Threat modeling:
- Identify threat actors (external attacker, insider, compromised dependency)
- Attack vectors for each component
- Crown jewels: what would an attacker most want?
- Defense-in-depth: multiple layers before reaching crown jewels

Provide:
- Security risk matrix (likelihood × impact)
- Top 10 security gaps to address
- Compliance mapping (relevant standards)
- Security testing checklist (SAST, DAST, penetration test scope)
```

### 22. Data Pipeline Architecture

```
Design a data pipeline for [use case: analytics / ML training / reporting].

Data sources: [list source systems, formats, volumes]
Destinations: [data warehouse, ML platform, BI tool]
Requirements: [latency — real-time / near-real-time / batch]
Team: [data engineering team size, skills]

Pipeline architecture options:
1. **Batch (daily/hourly)**: Simple, high latency
2. **Micro-batch (1-15 min)**: Compromise
3. **Streaming (sub-second)**: Complex, low latency
4. **Lambda architecture**: Both batch and streaming, complex
5. **Kappa architecture**: Streaming only, reprocess from log

For chosen approach:
- Ingestion layer: Kafka, Kinesis, Firehose, custom connector
- Processing layer: Spark, Flink, dbt, Airflow
- Storage layer: S3/GCS data lake + data warehouse (Snowflake, BigQuery, Redshift)
- Serving layer: How analysts and applications query the data

Schema management:
- Schema registry for streaming events
- Data contracts between producers and consumers
- Schema evolution strategy

Data quality:
- Validation at ingestion
- Monitoring for data freshness and completeness
- dbt tests for transformation correctness
```

### 23. Platform Engineering Design

```
Design an internal developer platform (IDP) for [organization].

Current pain points: [describe — slow deployments, inconsistent environments, manual infra provisioning]
Teams: [N product teams, M engineers per team]
Target: [what "good" looks like after the platform is built]

Platform capabilities to design:
1. **Service templates**: "Golden path" for creating new services
2. **CI/CD**: Standardized pipelines, deployment to any environment
3. **Environment management**: Dev, staging, prod — how are environments provisioned?
4. **Secret management**: How do services get credentials?
5. **Observability**: Automatic metrics, logs, traces for all services
6. **Service catalog**: Discovery of internal services
7. **Self-service infra**: Teams can provision databases, queues via platform API

Technology choices:
- Backstage for service catalog / developer portal
- Crossplane or Terraform Cloud for infra provisioning
- ArgoCD / Flux for GitOps deployments
- Vault for secrets
- GitHub Actions / Tekton for CI/CD

Platform team responsibilities vs. product team responsibilities (clear boundary)

Success metrics: deploy frequency, lead time, MTTR, developer satisfaction score (SPACE framework)
```

### 24. Infrastructure as Code Design

```
Design an Infrastructure as Code strategy for [organization/system].

Current state: [manual, ClickOps, existing IaC tool]
Cloud: [AWS / GCP / Azure / multi-cloud]
Team: [engineers who will maintain IaC]

IaC tool selection:
1. **Terraform**: Most popular, multi-cloud, large ecosystem
2. **Pulumi**: Real programming languages, same semantics as Terraform
3. **CDK (AWS)**: TypeScript/Python, compiles to CloudFormation
4. **Crossplane**: Kubernetes-native, GitOps friendly

Repository structure:
- Monorepo vs. separate repos for different environments
- Module structure
- How environments (dev, staging, prod) are managed
- State management (S3 backend, Terraform Cloud, etc.)

Workflow:
- Pull request review for infra changes
- Plan in CI, apply in CI/CD or manual?
- Drift detection and remediation
- Secret handling in IaC (never commit credentials)

Modules to create:
- Network (VPC, subnets, security groups)
- Compute (ECS, EKS, EC2 auto-scaling)
- Database (RDS, ElastiCache)
- Monitoring (CloudWatch, alerts)

Also: testing strategy for IaC (Terratest, LocalStack, kitchen-terraform)
```

### 25. AI/ML System Architecture

```
Design the infrastructure and architecture for [ML use case].

Use case: [inference API / training pipeline / recommendation system / RAG system]
Model: [model type and size — e.g., LLM 7B parameters / classification model / embedding model]
Scale: [queries per second, latency requirement, users]

Training infrastructure (if applicable):
- Compute: GPU cluster (on-demand vs. spot for training)
- Data pipeline: Feature store design
- Experiment tracking: MLflow, Weights & Biases
- Model registry: How models are versioned and promoted to production
- Training orchestration: Kubeflow, SageMaker, Vertex AI

Inference infrastructure:
- Serving framework: Triton, TorchServe, vLLM, FastAPI
- Batching: Dynamic batching for GPU efficiency
- Caching: Semantic caching for LLM responses (embedding similarity)
- Auto-scaling: Queue depth-based scaling for async, latency-based for sync
- Cost optimization: Spot instances, model quantization, smaller models for lower-tier queries

RAG system specifics (if applicable):
- Vector store: Pinecone, Weaviate, pgvector, Qdrant
- Chunking strategy: Chunk size, overlap, semantic chunking
- Retrieval: Hybrid search (BM25 + semantic), reranking
- Context window management: How to fit retrieved context

Monitoring:
- Model performance drift detection
- Inference latency P50/P99
- Cost per query
- Output quality metrics
```

## Prompt Enhancement Strategies

### Adding Constraints for Better Output

Architecture prompts produce better output when you constrain the design space:

```
Constraints to add to any design prompt:
- "Assume a 5-engineer team — avoid operational complexity requiring more"
- "Budget is $10,000/month for infrastructure — cost is a primary constraint"
- "We must be HIPAA compliant — data encryption and audit logging are non-negotiable"
- "No vendor lock-in — prefer open source or multi-cloud portable solutions"
- "Existing stack is Node.js/PostgreSQL/AWS — minimize new technology introduction"
```

### Critique Mode

After generating a design, ask the AI to critique it:

```
You just designed [system]. Now play the role of a skeptical senior engineer reviewing this proposal.

What are the:
1. The three most likely failure modes?
2. Assumptions that might not hold at 10x scale?
3. Hidden operational costs you didn't account for?
4. Simpler alternatives that might work just as well?
5. Tech debt risks this design introduces?
```

::: tip
The most valuable use of AI for system design is not generating the "right answer" — it's rapidly exploring the design space, generating alternatives, and stress-testing assumptions. Use these prompts as the start of a conversation, not the end of one.
:::
