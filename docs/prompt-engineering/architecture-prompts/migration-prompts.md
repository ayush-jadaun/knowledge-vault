---
title: "Migration Prompts: 25+ Prompts for Safe, Large-Scale Technical Migrations"
description: "Production-ready prompt library for planning and executing database migrations, monolith decomposition, cloud migrations, framework upgrades, and API versioning"
tags: [prompt-engineering, migration, database-migration, monolith-to-microservices, cloud-migration, technical-debt]
difficulty: "expert"
prerequisites: [system-design-prompts, scaling-prompts]
lastReviewed: "2026-03-18"
---

# Migration Prompts: 25+ Prompts for Safe, Large-Scale Technical Migrations

## Overview

Migrations are among the highest-risk engineering activities. Done wrong, they cause data loss, extended downtime, or irreversible architectural damage. Done well, they unlock years of future velocity. These prompts help you plan migrations with the rigor they deserve.

## Database Migration Prompts

### 1. Zero-Downtime Schema Migration Planning

```
Plan a zero-downtime database schema migration for this change:

Change: [describe what you want to change — add column, rename column, add index, remove column, change type]
Table: [table name, approximate row count]
Current traffic: [reads/second, writes/second to this table]
Database: [PostgreSQL / MySQL / other — version]

The challenge: How do we change the schema while the application is running?

Expand-and-Contract pattern:
Phase 1 — Expand (add without removing old):
  - Add new column/table (additive changes are non-breaking)
  - Deploy app to write to BOTH old and new
  - Backfill old data to new column/format

Phase 2 — Migrate reads:
  - Deploy app to read from new column/table
  - Verify new column data quality

Phase 3 — Contract (remove the old):
  - Deploy app to stop writing to old column
  - Drop old column (finally safe)

For the specific migration I need:
1. Step-by-step migration phases
2. SQL for each step
3. Application code changes needed at each phase
4. How to verify each phase before proceeding
5. Rollback plan for each phase
6. Time estimate for backfill (rows/second × total rows)
7. Lock types for each SQL operation (which ones block reads/writes?)

Also: Considerations for large tables (>100M rows) — pg_repack, pt-online-schema-change.
```

### 2. Database Technology Migration

```
Plan a migration from [Source DB] to [Target DB].

Source: [PostgreSQL/MySQL/MongoDB/DynamoDB — version, data volume]
Target: [PostgreSQL/CockroachDB/Aurora/Spanner — why you're migrating]
Data: [approximate GB, table count, row counts for largest tables]
SLA: [max acceptable downtime during migration]

Migration strategy options:

1. **Big bang**: Shut down, export, import, switch DNS. Simple, has downtime.
   - Acceptable if: downtime < SLA, small data volume

2. **Phased migration (strangler fig)**:
   - Set up target DB in parallel
   - Dual-write to both databases
   - Gradually migrate reads to target
   - Verify data consistency
   - Cut over writes, then decommission source

3. **Change Data Capture (CDC)**:
   - Stream all changes from source to target using Debezium/AWS DMS
   - Near-zero downtime cut-over
   - Complex setup, replication lag to manage

For chosen strategy:
- Pre-migration: Schema mapping, data type compatibility
- Migration tooling: AWS DMS, pgloader, custom scripts
- Data validation: How to verify integrity post-migration
- Rollback: Can we revert if migration fails?
- Testing: Migrate staging first, performance test on target

Timeline estimate for [data volume] with [chosen strategy].
```

### 3. Database Denormalization Migration

```
Plan a migration to denormalize this schema for performance.

Problem: [describe the join that's slow — e.g., 5-table JOIN on the critical path]
Current normalized schema: [paste DDL or describe]
Proposed denormalized structure: [describe the denormalized alternative]

Migration plan:
1. **Add denormalized columns/tables**: Additive, non-breaking
2. **Synchronization trigger/job**: Keep denormalized data in sync
   - Option A: Database trigger (synchronous, consistent, adds latency to writes)
   - Option B: Application code (dual-write, more complex)
   - Option C: Async background job (eventual consistency, simpler)
3. **Backfill**: Populate denormalized data for existing rows
4. **Migrate reads**: Update queries to use denormalized data
5. **Remove joins**: After validation period
6. **Optional**: Remove original source columns if truly redundant

Consistency model:
- Triggers: Strong consistency (but lock contention risk)
- Application dual-write: Potential inconsistency window
- Async job: Eventual consistency (how stale is acceptable?)

Monitoring:
- How to detect sync failures?
- How to detect denormalized data staleness?
- Performance metrics to validate improvement

SQL: migration scripts for each phase.
```

### 4. Multi-Tenant Data Migration

```
Plan a data migration for a multi-tenant application changing its tenancy model.

Current model: [row-level tenancy: all tenants in same tables with tenant_id column]
Target model: [schema-per-tenant: separate PostgreSQL schema per tenant]

Why this change: [data isolation requirements, compliance, performance isolation]

Migration challenges:
1. Live application cannot stop during migration
2. Each tenant's data must be migrated atomically
3. Tenant cutover must be coordinated with the application
4. Rollback must be possible

Migration approach per tenant:
1. Create new schema for tenant
2. Copy data (pg_dump | pg_restore with schema mapping, or INSERT...SELECT)
3. Apply any backlog changes (CDC from primary tables during copy)
4. Verify data integrity
5. Coordinate application cutover (feature flag per tenant)
6. Decommission row-level data for that tenant

Automation script:
- Migrate tenants in batches (start with smallest/least active)
- Progress tracking and resumability
- Data validation queries
- Rollback procedure per tenant

Timeline: [N tenants × average migration time per tenant]
Risk: How to handle a tenant migration that fails midway?
```

## Monolith to Microservices Prompts

### 5. Strangler Fig Migration Plan

```
Plan a strangler fig migration from monolith to microservices for [domain].

Monolith: [describe the current system — language, framework, database]
First service to extract: [choose one — criteria: isolated domain, clear API boundary, team ownership]

Strangler fig approach:
1. Identify the seam: Where does the new service's responsibility begin and end?
2. Add a routing layer (API gateway / facade): Intercept requests for the new service's domain
3. Build the new service: Implement the same functionality independently
4. Route traffic gradually: Start with 1%, increase to 100%
5. Verify feature parity: Compare responses (shadow mode)
6. Complete the strangling: Remove the code from the monolith

Phase 1 — Facade setup:
- Which component routes [monolith] vs [new service]?
- URL path: /api/[domain]/* goes to new service
- Data: New service has its own database vs. shares monolith DB initially

Data migration options:
A. New service reads from monolith DB (temporary, tight coupling)
B. New service has own DB, monolith syncs via events (complex but clean)
C. Big-bang data migration before routing switch (risky)

Rollback strategy at each phase.
Timeline: [estimate for this specific extraction]
Success metrics: How do you know the migration succeeded?
```

### 6. Shared Database Migration

```
Migrate from a shared database (used by multiple services) to service-owned databases.

Current state:
- [N] services share the [database name] database
- Services with direct DB access: [list]
- Schema owner: unclear (evolved organically)

Problem: Shared database creates tight coupling, blocks independent deployment and scaling.

Migration strategy:
1. **Audit access patterns**: Map which tables each service reads/writes
2. **Identify ownership**: Assign each table to one "owning" service
3. **API-ify cross-service access**: Owning service must expose API for all other services' needs
4. **Create physical separation**: One database per service
5. **Migrate data**: Move tables to service-owned databases
6. **Remove direct DB access**: Each service can only access its own database

Table ownership assignment:
[For each table: proposed owner service and rationale]

Conflict resolution:
- Tables accessed equally by multiple services: Who owns it?
- Shared reference tables: Replicate to each service that needs it?
- Reporting queries that span tables from multiple services: Data warehouse?

Breaking the change incrementally:
- Phase 1: Add abstraction layer (still shared DB, but APIs defined)
- Phase 2: Separate schemas within same database instance
- Phase 3: Separate database instances
- Phase 4: Remove legacy direct access

Timeline and team coordination required.
```

### 7. API-First Extraction Pattern

```
Extract [feature/domain] from the monolith using an API-first approach.

Monolith feature: [describe what you're extracting]
Current implementation: [paste or describe code, DB schema]
Target service: [new service name, language, framework choice]

Step 1: Define the API contract first
- REST or gRPC? [recommendation with reasoning for this use case]
- API design: [list of endpoints with methods, request/response]
- Error handling contract
- Authentication: How does the new service authenticate callers?

Step 2: Create the new service skeleton
- Generate from OpenAPI spec
- Health check, metrics, tracing out of the box
- Test suite setup

Step 3: Implement behind a feature flag
- Flag controls: monolith implementation vs. new service call
- Shadow mode: Call both, compare results, use monolith result

Step 4: Migrate data
- Identify what data this service owns
- Seed from monolith DB (one-time copy)
- Set up sync until traffic is migrated
- Cut over data ownership

Step 5: Traffic migration
- 1% → 10% → 50% → 100% with monitoring at each step
- Automatic rollback if error rate increases

Consumer contract testing: Ensure API consumers don't break when implementation changes.
```

## Cloud Migration Prompts

### 8. On-Premises to Cloud Migration Plan

```
Plan a migration from on-premises to [AWS / GCP / Azure].

Current state:
- On-prem infrastructure: [servers, databases, storage, networking]
- Applications: [list with dependencies]
- Data: [total volume, sensitivity]
- Team: [IT team size, cloud experience]

Migration strategies (6 Rs):
1. **Rehost (lift and shift)**: Move as-is to cloud VMs. Fast, cheap, misses cloud benefits.
2. **Replatform**: Minor optimizations (RDS instead of self-managed MySQL). Some benefit.
3. **Repurchase**: Switch to SaaS (Salesforce instead of custom CRM).
4. **Refactor**: Re-architect for cloud (serverless, managed services). Most benefit, most effort.
5. **Retire**: Decommission what you don't need.
6. **Retain**: Keep on-prem (latency requirements, compliance, cost).

Recommended strategy per application:
[For each application: which R and why]

Wave planning:
- Wave 1 (lowest risk): Dev/test environments
- Wave 2: Non-production applications
- Wave 3: Production applications (simplest first)
- Wave 4: Core/complex applications

Network design:
- VPC design: Subnets, CIDR blocks, routing
- Connectivity: VPN, Direct Connect, or internet
- DNS: Migration strategy

Data migration:
- Offline: Snowball, storage gateway
- Online: DMS, DataSync, custom scripts

Cut-over strategy: How to switch production traffic with minimal downtime?
```

### 9. Cloud Provider Migration (AWS to GCP or Vice Versa)

```
Plan a migration from [Source Cloud] to [Target Cloud].

Reason for migration: [cost / services / compliance / vendor diversification]
Current footprint: [list key services used — compute, database, storage, networking]
Scale: [EC2 instances, RDS size, S3 volume, etc.]

Service mapping:
[For each source service: equivalent target service and differences]
Examples:
- AWS EC2 → GCP Compute Engine: [differences in instance types, pricing]
- AWS RDS → GCP Cloud SQL: [migration approach, feature gaps]
- AWS S3 → GCP Cloud Storage: [migration tooling]
- AWS Lambda → GCP Cloud Functions: [runtime differences]
- AWS EKS → GCP GKE: [Kubernetes — mostly portable]

Provider-specific dependencies to eliminate:
- AWS SDK calls in application code (abstract behind interfaces)
- IAM/security model differences
- Managed service behavior differences (SQS vs. Cloud Pub/Sub semantics)

Migration order:
1. Non-production environments first
2. Stateless services before stateful
3. Test/staging before production

Data migration:
- Storage: Transfer Service (GCP), gsutil rsync
- Database: Dump/restore + CDC for live migration
- Estimated transfer cost and time for [N]TB at [bandwidth]

Multi-cloud period: How long will both clouds be live? How to route traffic?
```

### 10. Kubernetes Migration Plan

```
Plan a migration of [application/service] to Kubernetes.

Current state:
- Deployment target: [VMs, ECS, Heroku, Docker Compose]
- Application: [language, framework, dependencies]
- External dependencies: [databases, queues, third-party APIs]
- Team Kubernetes experience: [beginner / intermediate / expert]

Kubernetes migration components:

1. **Containerization** (if not already):
   - Dockerfile best practices for production
   - Multi-stage builds for small images
   - Non-root user, read-only filesystem where possible
   - Health check endpoints (liveness, readiness)

2. **Configuration management**:
   - Environment variables → Kubernetes ConfigMaps
   - Secrets → Kubernetes Secrets or external (Vault, AWS Secrets Manager)

3. **Kubernetes manifests**:
   - Deployment (replicas, resource requests/limits, affinity rules)
   - Service (ClusterIP, NodePort, LoadBalancer)
   - Ingress (with TLS, routing rules)
   - HorizontalPodAutoscaler
   - PodDisruptionBudget

4. **Persistent storage** (if needed):
   - PersistentVolumeClaim
   - StorageClass selection

5. **CI/CD integration**:
   - Image build and push
   - kubectl apply or Helm chart deployment
   - ArgoCD or Flux for GitOps

6. **Observability**:
   - Prometheus metrics exposition
   - Structured JSON logging
   - OpenTelemetry tracing

7. **Networking**:
   - Service mesh or not?
   - Network policies for ingress/egress
   - DNS resolution

Generate: Complete set of Kubernetes manifests for this application.
Timeline: Estimate for each phase.
```

## Framework and Language Migration Prompts

### 11. Framework Upgrade Plan

```
Plan an upgrade of [framework/library] from [old version] to [new version].

Application: [describe the application]
Current version: [X.Y.Z]
Target version: [A.B.C]
Codebase size: [approximate — files, lines of code, components]

Migration complexity factors:
1. Breaking changes: [list from framework's migration guide]
2. Deprecated APIs: [what's used in the current code that's removed]
3. Test coverage: [current test coverage % — higher coverage = safer migration]
4. Third-party dependencies: [which ones need to update for compatibility?]

Migration approach:
- Incremental (if possible): Use compatibility shims, migrate file by file
- Big bang (if necessary): Full rewrite in one branch, merge when done

For React 17 → 18 / Next.js 12 → 14 / Node.js 16 → 20 / [specific framework]:
[Tailored guidance for the specific migration]

Step-by-step:
1. Update dependencies and check for peer dependency conflicts
2. Apply automated migration tools (codemods)
3. Fix remaining manual changes
4. Run test suite and fix failures
5. Check bundle size, performance benchmarks
6. Staged rollout to production

Estimated effort: [hours/days based on codebase size and complexity]
Risk areas: What's most likely to break?
```

### 12. JavaScript to TypeScript Migration

```
Plan a migration of [project] from JavaScript to TypeScript.

Project: [describe the project — size, framework, type of application]
Current codebase: [approximate files, KLOC, test coverage]
Team TypeScript experience: [beginner / intermediate / expert]

Migration strategy: Gradual (recommended — never rewrite all at once)

Phase 1 — Setup (1 week):
- Add tsconfig.json with allowJs: true, checkJs: false (permissive to start)
- Add TypeScript and @types/* packages
- Rename entry points to .ts (only a few)
- Get compilation working with zero TS errors

Phase 2 — File by file (ongoing):
- Rename .js → .ts for each file
- Add types as you go (start with any, tighten later)
- Files with fewest dependencies first (utils, helpers)
- Critical path files: prioritize for type safety

Phase 3 — Tighten (ongoing):
- Enable strict flags incrementally: strictNullChecks, noImplicitAny
- Replace any with proper types
- Improve type inference vs. explicit type annotations

Phase 4 — Strict mode (milestone):
- Enable full strict: true
- Fix remaining type errors
- Celebrate

Tools:
- ts-migrate: Automated .js → .ts conversion
- TypeStat: Infers and adds types automatically
- ESLint with @typescript-eslint

ROI analysis: How much development velocity does type safety save?
```

### 13. REST to GraphQL Migration

```
Plan a migration from REST API to GraphQL.

Current REST API: [describe endpoints, clients that use them]
Why GraphQL: [mobile bandwidth, overfetching, multiple client types]
Migration constraint: [must maintain backward compatibility with existing clients]

Migration approach (run both in parallel):
1. Deploy GraphQL layer alongside REST (same backend logic, two API layers)
2. Migrate internal/new clients to GraphQL
3. Keep REST API running for legacy clients
4. Eventually deprecate REST (with proper deprecation timeline)

Schema design from REST:
- Map REST resources to GraphQL types
- Design queries for common REST GET patterns
- Design mutations for POST/PUT/PATCH/DELETE
- Design subscriptions for polling patterns

Federation strategy (if multiple REST services → GraphQL):
- Apollo Federation to combine multiple GraphQL services
- Each service owns part of the schema
- Router composes them into one endpoint

Performance considerations:
- N+1 problem: DataLoader for batching
- Query depth limiting (prevent expensive nested queries)
- Query complexity analysis and limiting
- Persisted queries for production performance

Security:
- Query allowlist vs. arbitrary queries
- Field-level authorization
- Introspection: disable in production

Also provide: Migration timeline estimate and how to measure GraphQL adoption vs. REST.
```

## Data Migration Prompts

### 14. Large-Scale Data Migration

```
Plan a migration of [N]TB of data from [source] to [target].

Source: [database type, location]
Target: [database type, location]
Data volume: [GB/TB, row counts]
Network: [bandwidth available — affects timeline]
Downtime budget: [maximum acceptable downtime]
Compliance: [any data handling requirements during migration]

Migration options by downtime tolerance:

Option A — Full offline (highest downtime):
- Stop writes, dump, transfer, restore, redirect traffic
- Simple but has clear downtime window

Option B — Logical replication (near-zero downtime):
- Set up replication from source to target
- Allow replication to catch up
- Brief pause for final sync + cutover
- Resume writes on target

Option C — Application dual-write:
- Write to both source and target simultaneously
- Backfill historical data
- Switch reads to target
- Stop writing to source

For [N]TB with [bandwidth]Mbps:
- Transfer time estimate: N × 8 / bandwidth / 3600 hours
- Plus processing overhead: 1.5-3x raw transfer time

Data validation:
- Row count verification
- Checksum sampling (too expensive to verify every row at scale)
- Business logic validation (known aggregates match)
- Application-level smoke tests

Rollback plan: At each phase, what's the rollback and time estimate?
```

### 15. Event Schema Migration

```
Plan a migration of event schemas in an event-driven system.

Current schema: [paste or describe current event format]
Target schema: [paste or describe new event format]
Events in flight: [consumers that already have old events]

Challenge: Events in message queues and event stores have the old format.
New consumers must handle both old and new formats until old events drain.

Migration approach:

1. **Upcasting** (recommended for event sourcing):
   - Keep old events as-is in the store
   - Add an "upcaster" that transforms old format to new format when reading
   - New events are written in new format
   - Never modify historical events

2. **Consumer versioning**:
   - Consumers explicitly handle both v1 and v2 events
   - Version field in event schema
   - Switch based on version

3. **Dual publish** (for external consumers):
   - Publish to v1 topic AND v2 topic
   - New consumers subscribe to v2
   - Old consumers remain on v1
   - Deprecate v1 topic after migration window

4. **Schema registry migration**:
   - Avro/Protobuf: Add new fields as optional, never remove required fields
   - Backward compatibility: New consumers can read old events
   - Forward compatibility: Old consumers can read new events

Event store impact: If events need to be replayed for new projections, upcasters must handle all historical formats.

Timeline: How long before old format events drain from the queue?
```

## API Versioning Prompts

### 16. API Versioning Strategy

```
Design an API versioning strategy for [API].

Current state: [describe current versioning approach or lack thereof]
Clients: [internal only / public third-party / mobile apps (slow to update)]
Breaking change frequency: [how often do you expect to make breaking changes?]

Versioning approaches:

1. **URL versioning** (/v1/users): Most visible, clear, easy to route. Client must update URLs.
2. **Header versioning** (Accept: application/vnd.api.v2+json): REST purist approach, less visible.
3. **Query parameter** (?api_version=2): Convenient but pollutes query string.
4. **Date versioning** (/2024-03-18/users): Stripe uses this, clear change timeline.

My recommendation for your use case: [rationale]

Lifecycle management:
- Deprecation notice period: [N months before removal]
- Sunset header: Include sunset date in API responses for deprecated versions
- Deprecation communication: How to notify API consumers
- Legacy version support: How long to maintain old versions

Breaking vs. non-breaking changes:
- Non-breaking (backward compatible): Adding optional fields, adding new endpoints
- Breaking: Removing fields, changing field types, changing semantics, removing endpoints

Consumer-driven contract testing:
- Pact for consumer-driven contracts
- Prevents accidental breaking changes
- Verified in CI before deployment

Provide: OpenAPI spec with versioning strategy, deprecation headers implementation.
```

### 17. GraphQL Schema Evolution

```
Design a schema evolution strategy for a GraphQL API that can never break clients.

Current schema: [paste or describe]
Proposed changes: [describe what needs to change]

GraphQL evolution principles:
1. **Never remove fields**: Mark them @deprecated first
2. **Never change field types**: Add new fields with new types
3. **Never change non-null to null**: OK to make required field optional (not vice versa)
4. **Additive changes are free**: New types, new queries, new optional fields

Deprecation strategy:
- @deprecated(reason: "Use newField instead") on field
- Deprecation tracked in schema registry
- Clients have [N weeks] to migrate before removal
- Removal only after deprecation period expires

For specific changes:
- Rename a field: Add new field, deprecate old, remove after migration window
- Change return type: Add new field with new type, deprecate old
- Split a type: Add new types, migration path for existing queries
- Add required argument: Add with @deprecated optional variant first

Schema registry:
- Track all versions
- Prevent breaking changes in CI
- Apollo Studio, GraphQL Hive, or custom

Consumer query analysis:
- Which deprecated fields are still used? (field usage analytics)
- Safe to remove when field has 0 usage

Provide: Schema migration script and example of each change type.
```

## Platform and Infrastructure Migration Prompts

### 18. Container Migration Plan

```
Plan migration from [Docker Compose / ECS / traditional VMs] to Kubernetes.

Current setup:
- Containers: [N services, approximate CPU/memory per service]
- Orchestration: [current system]
- Team K8s experience: [none/some/experienced]
- Timeline: [desired migration timeline]

Migration phases:
Phase 1 — Learn (weeks 1-4):
- Set up dev cluster (minikube, kind, or cloud managed)
- Translate one simple service to K8s manifests
- Learn: Pods, Deployments, Services, ConfigMaps, Secrets
- Run dev workflow on Kubernetes

Phase 2 — Non-production (weeks 4-8):
- Production-like cluster for staging/testing
- CI/CD pipeline building and pushing to registry
- Ingress controller setup
- Monitoring: Prometheus + Grafana

Phase 3 — Production migration (weeks 8-12):
- Production cluster setup (managed: EKS, GKE, AKS)
- Service by service migration
- Traffic split: old → new (blue-green per service)
- Validation before decommissioning old infrastructure

Production readiness checklist:
- Resource requests and limits on all pods
- Liveness and readiness probes
- HPA for scaling
- PodDisruptionBudget for availability during updates
- Network policies for security
- RBAC for cluster access
- Backup strategy for stateful services

Timeline: [estimate based on N services and team size]
```

### 19. Serverless Migration

```
Evaluate and plan migration from [servers] to serverless for [workload].

Workload: [describe the workload — API, data processing, scheduled jobs]
Current infrastructure: [cost, utilization patterns]
Why serverless: [cost, ops reduction, scaling]

Serverless fit analysis:
Good fit for serverless:
- Spiky, unpredictable traffic
- Event-driven workloads
- Operations teams want less infrastructure to manage
- Pay-per-use is cheaper than baseline server cost

Poor fit:
- Long-running processes (> 15 min for Lambda)
- Constant high utilization (server is cheaper)
- Warm-up latency is unacceptable (cold starts)
- Need predictable performance

If good fit — Migration plan:
1. Identify stateless functions (easy migration)
2. Extract from application (HTTP, event, scheduled triggers)
3. Externalize state (DynamoDB, ElastiCache for anything that was in memory)
4. Handle cold starts (provisioned concurrency, function warmers)
5. Observability: CloudWatch, X-Ray, or third-party

Cost model:
- Current: $X/month for servers
- Serverless estimate: (requests × avg_duration_ms × memory_GB × price_per_GB_second) + API Gateway
- Break-even: [at what request volume does serverless cost more than servers?]

Lambda function design:
- One function per operation (single responsibility)
- Dependency injection for testability
- Environment variables for config (not SSM calls inside handler)
- Connection pooling: RDS Proxy for database connections
```

### 20. Legacy System Modernization

```
Create a modernization roadmap for a legacy [system description].

Legacy system:
- Language/framework: [COBOL / Java EE / VB.NET / PHP 5]
- Age: [N years]
- Team knowledge: [who understands it? is there documentation?]
- Business criticality: [core business / important / nice to have]

Modernization options:
1. **Strangler fig**: Gradually replace piece by piece
2. **Complete rewrite**: High risk, high reward
3. **Encapsulation**: Wrap in API, leave internals alone
4. **Incremental modernization**: Upgrade components in place

For your system, I recommend: [option + rationale]

Strangler fig approach for [system]:
1. Document the system (ADRs, architectural map)
2. Add strangler fig facade in front of legacy system
3. Identify and extract bounded domains (start with simplest)
4. Migrate domain by domain
5. Decommission legacy when last domain migrated

Risk management:
- Never rewrite everything simultaneously
- Maintain feature parity at each phase
- Dark launch and shadow mode testing
- Clear rollback at each phase
- Parallel runs to verify new implementation

Timeline: [realistic estimate given system complexity and team size]
Success metrics: [how you'll know modernization is successful]
```

## Testing Migration Prompts

### 21. Test Framework Migration

```
Plan a migration of [test suite] from [Jest X] to [Vitest] or from [Enzyme] to [React Testing Library].

Current test suite:
- Test count: [N unit / M integration / P E2E]
- Framework: [current framework + version]
- Coverage: [current coverage %]

Migration approach: Incremental (migrate one test file at a time)

For Jest → Vitest:
- API is nearly identical — mostly config changes
- vitest.config.ts setup
- Differences: browser globals, ESM handling, mock syntax
- Migration script: Convert jest.config.js → vitest.config.ts
- Automated file transforms: Replace jest imports with vitest imports

For Enzyme → React Testing Library:
- Fundamentally different philosophy: test behavior, not implementation
- Never test internal state, component instances
- Test what the user sees: text, roles, labels
- Migration per component: Rewrite test assertions

Step-by-step for each file:
1. Move file to new framework
2. Run tests — identify failures
3. Fix failures (mostly API differences, not logic)
4. Remove implementation-detail assertions

Tools: jest-to-vitest-codemod, codeshift for automated transforms

Don't try to 1-to-1 migrate Enzyme to RTL — it's a rewrite of the tests from the user's perspective.
```

## Migration Risk and Planning Prompts

### 22. Migration Risk Assessment

```
Assess the risks of this migration plan.

Migration: [describe what you're planning]
Plan: [describe the approach]

For each migration phase, identify:

1. **Data risks**:
   - Could this cause data loss? Under what conditions?
   - Could this cause data corruption?
   - Mitigation: Backup strategy, validation queries

2. **Availability risks**:
   - What's the downtime scenario?
   - What if migration takes 3x longer than expected?
   - Mitigation: Cutover plan, rollback SLA

3. **Performance risks**:
   - Could the new system be slower?
   - How will you detect performance regression?
   - Mitigation: Load testing in staging before production cutover

4. **Rollback risks**:
   - Can you rollback at every phase?
   - What's the rollback time and process?
   - When does rollback become impossible?

5. **Team risks**:
   - Does the team have the skills to execute this migration?
   - Who is the single point of failure for knowledge?
   - Mitigation: Knowledge documentation, pair migrations

Risk matrix output: [Risk | Likelihood | Impact | Mitigation | Owner]

Go/No-Go criteria: What conditions must be true before proceeding with each phase?
```

### 23. Cutover Planning

```
Design a cutover plan for [migration].

Migration context: [describe what's being migrated and current state]
Cutover objective: Switch production traffic from old to new with minimal downtime

Pre-cutover checklist:
- [ ] New system fully tested in staging with production-like data
- [ ] Data migration complete and validated
- [ ] Monitoring configured for new system
- [ ] Rollback procedure documented and tested
- [ ] Communication plan prepared (status page, team notifications)
- [ ] War room bridge set up
- [ ] On-call team briefed

Cutover sequence:
1. T-2h: Final verification of new system health
2. T-1h: Enable read traffic to new system (validate before writes)
3. T-0: Switch write traffic to new system
4. T+15m: Verify all metrics healthy
5. T+1h: Confirm old system decommission schedule

Traffic switching strategies:
- DNS cutover: Fast to execute, slow to roll back (DNS TTL)
- Load balancer weight: Instant, easy rollback (0% → 1% → 10% → 100%)
- Feature flag: Application-level routing, most flexible

Rollback triggers:
- Error rate > [X]%
- Latency P99 > [N]ms
- Any data integrity check fails
- On-call engineer's discretion

Post-cutover monitoring period: [duration to watch before declaring success]
```

### 24. Dependency Upgrade Strategy

```
Design a strategy for keeping dependencies up to date.

Problem: Dependencies have accumulated [N months/years] of updates. Security vulnerabilities exist.
Current approach: [manual and infrequent / none]

Immediate remediation:
1. Run `npm audit / pip-audit / govulncheck` to identify vulnerabilities
2. Categorize: Critical (fix now) / High (fix this week) / Medium (this month)
3. Upgrade critical security vulnerabilities first (may be breaking)

Ongoing process:
1. **Renovate Bot or Dependabot**: Automate dependency PRs
   - Configuration: Auto-merge patch updates, review minor/major
   - Grouping: Batch related packages together
   - Rate limiting: Max PRs per day to avoid overwhelming team

2. **Testing gates**: Dependency PRs must pass full test suite
   - Green test suite required before merge
   - If tests are flaky: Fix the tests first

3. **Major version upgrades**:
   - Schedule: Review major updates quarterly
   - Research: Breaking changes before upgrading
   - Allocate time: Major upgrades take real engineering effort

4. **Evergreen policy**:
   - No dependency more than [N] major versions behind
   - No dependency that hasn't been updated in [N years] (abandoned?)

Security SLAs:
- Critical vulnerability: Patch within 24 hours
- High vulnerability: Patch within 7 days
- Medium vulnerability: Patch within 30 days
- Low vulnerability: Next regular update cycle

Provide: Renovate Bot configuration file.
```

### 25. Feature Flag Migration Pattern

```
Design a feature flag strategy for managing large migrations safely.

Migration: [describe the migration]
Constraint: Must be able to roll back instantly if issues arise

Feature flag implementation:
1. **Flag definition**: Name, description, default value (off for new behavior)
2. **Targeting rules**: Percentage rollout, specific users, environments
3. **Flag lifecycle**: Draft → Active → Fully rolled out → Deprecated → Removed

Flag types for migration:
1. **Kill switch**: Instantly disable new behavior (binary on/off)
2. **Percentage rollout**: 1% → 10% → 50% → 100%
3. **User targeting**: Enable for internal users, beta users, specific accounts
4. **Environment**: On in staging, off in production until ready

Implementation:
- Flag SDK: LaunchDarkly, Unleash, Flagsmith, or custom
- Flag evaluation: Client-side vs. server-side
- SSR considerations: Flag evaluation during server render

Rollout monitoring:
- Compare error rate: flag=on vs. flag=off
- Compare latency: flag=on vs. flag=off
- Alert if flag=on cohort performs worse

Flag cleanup:
- After 100% rollout: Flag is no longer branching — remove the flag
- Technical debt: Unmigrated flags accumulate — require cleanup within [N] weeks of full rollout

Provide: TypeScript flag evaluation middleware + rollout configuration example.
```

## Best Practices for Migration Prompts

### The Reversibility Rule

Always ask the AI:

```
For each step in this migration plan, indicate:
1. Is this step reversible?
2. If reversible, what does rollback take? (time, effort, data loss risk)
3. Is there a point of no return? What is it?

Present migration steps as: [Reversible] or [Point of No Return] with rollback details.
```

### The "What Could Go Wrong" Prompt

```
You proposed this migration plan: [paste plan]

Now play a skeptical SRE who has seen migrations fail. For each step:
- What's the most likely failure mode?
- What would the blast radius be?
- What monitoring would catch this early?
- What's the emergency response?

Don't be optimistic — assume things will go wrong and design for it.
```

::: warning
Never start a large-scale migration in production without having run the complete migration (including rollback) successfully in a staging environment with production-like data volumes. The most expensive surprises are the ones that only appear at scale.
:::
