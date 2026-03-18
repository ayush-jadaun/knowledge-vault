---
title: "Cost Optimization Prompts: 25+ Prompts for Cloud FinOps and Infrastructure Cost Reduction"
description: "Comprehensive prompt library for cloud cost analysis, right-sizing, reserved capacity planning, database cost reduction, and building cost-aware architectures"
tags: [prompt-engineering, cost-optimization, finops, cloud-cost, aws, gcp, azure, infrastructure]
difficulty: "advanced"
prerequisites: [system-design-prompts, scaling-prompts]
lastReviewed: "2026-03-18"
---

# Cost Optimization Prompts: 25+ Prompts for Cloud FinOps and Infrastructure Cost Reduction

## Overview

Cloud costs are the largest scaling cost center for most engineering organizations. Without FinOps discipline, bills grow unbounded as engineering velocity increases. These prompts help you analyze, reduce, and govern cloud spending without sacrificing reliability or performance.

## Analysis and Visibility Prompts

### 1. Cloud Cost Audit

```
Perform a cloud cost audit for [AWS/GCP/Azure] account.

Monthly spend: $[amount]
Top cost categories (from billing dashboard):
[paste or describe: EC2/Compute: $X, RDS/Database: $Y, S3/Storage: $Z, Data Transfer: $W, etc.]

For each category, identify:
1. What is this cost? (which service, which workload)
2. Is this expected? (does it match known utilization?)
3. Optimization opportunities? (right-size, reserved, eliminate)

Quick win checklist:
- [ ] Idle resources: EC2 instances with <5% CPU, RDS with <10% connections
- [ ] Oversized resources: CPU utilization consistently <20%
- [ ] Orphaned resources: EBS volumes, load balancers, Elastic IPs not attached to anything
- [ ] Data transfer: Cross-AZ, cross-region, internet egress costs
- [ ] Unused reserved instances: RIs that aren't fully utilized
- [ ] Public data: Is data served directly from S3 instead of CloudFront?
- [ ] Dev/test environments: Running 24/7 instead of on-demand?
- [ ] Logging costs: CloudWatch logs retention too long? Storing too much?

Output:
- Estimated savings by category
- Implementation effort (days/weeks)
- Risk level (low/medium/high)
- Prioritized action plan
```

### 2. Cost Attribution and Tagging Strategy

```
Design a cloud resource tagging strategy for cost attribution.

Problem: $[amount]/month bill but can't attribute costs to teams or products.

Required attributes:
- Team/owner: Which team is responsible for this resource?
- Environment: prod/staging/dev/test
- Product/service: Which product or microservice?
- Cost center: For finance chargebacks
- Project: For project-based billing

Tagging implementation:
1. **Mandatory tags**: Resources without these tags are flagged/blocked
2. **Tag enforcement**: AWS Config rules, Azure Policy, GCP Organization Policy
3. **Auto-tagging**: Infrastructure as Code templates include tags
4. **Tag propagation**: EBS volumes inherit tags from EC2, etc.

Cost allocation:
- AWS Cost Explorer: Group by tag
- Custom cost reports: Monthly per-team breakdown
- Chargeback vs. showback model (are teams charged back or just shown costs?)
- Anomaly detection by tag (alert when team's costs spike unexpectedly)

Process:
- PR review: Every new resource must have required tags
- Monthly review: Tag compliance audit
- New service onboarding: Cost center assignment required

Generate: AWS Config rule YAML for required tags + tagging policy document.
```

### 3. Cost Anomaly Detection

```
Set up cost anomaly detection for [cloud account].

Target: Alert when costs spike unexpectedly, before they appear on the monthly bill.

Detection strategy:
1. **AWS Cost Anomaly Detection**: Built-in ML-based detection
   - Configure monitors by service, linked account, cost category
   - Alert threshold: [$ absolute] or [% relative to baseline]
   - Notification: SNS → Slack/email

2. **Custom anomaly detection**:
   - Pull daily costs via Cost Explorer API
   - Compare to rolling 7-day or 28-day average
   - Alert if current > average × 1.5 (50% above baseline)
   - Alert if absolute spike > $[threshold]

3. **Per-service monitors**:
   - EC2: Alert if running instance count > expected max
   - Lambda: Alert if invocation count × duration × memory exceeds budget
   - Data transfer: Alert if egress bytes > daily baseline × 2
   - NAT Gateway: Often a surprise cost — alert on unexpected processing volume

Terraform/CDK:
- AWS Cost Anomaly Detection monitor resource
- CloudWatch alarm on billing metrics (daily estimate)
- SNS topic for notifications

False positive reduction:
- Suppress alerts for known events (traffic spikes, deploys)
- Business hours only for non-critical alerts

Provide: Terraform configuration for anomaly detection monitors.
```

## Compute Cost Optimization Prompts

### 4. EC2/Compute Right-Sizing

```
Right-size EC2 instances for these workloads.

Current instances:
[list: instance type | avg CPU% | avg memory% | workload description]
Example:
m5.4xlarge | 12% CPU | 25% memory | API service
r5.2xlarge | 8% CPU | 70% memory | Redis cache

For each instance:
1. **Utilization analysis**: Is CPU or memory the actual constraint?
2. **Right-sized recommendation**:
   - If CPU < 20% and memory < 40%: Downsize to next smaller type
   - If memory > 70%: Consider memory-optimized (r series)
   - If CPU > 50% consistently: Stay or upsize
3. **Instance family evaluation**:
   - Graviton (ARM): 20-40% cheaper, equal or better performance for most workloads
   - Latest generation: m6i vs m5 — newer is often cheaper and faster
4. **Savings estimate**: Current cost → recommended cost

Right-sizing methodology:
- Analyze CloudWatch metrics for 14-30 days (not just today)
- Include peak periods in analysis
- Account for memory not visible to AWS (database buffer pool)
- Test performance before committing to smaller instance

Also: AWS Compute Optimizer recommendations and how to interpret confidence scores.
Savings estimate: $[amount]/month
```

### 5. Reserved Instance and Savings Plan Strategy

```
Design a reserved capacity strategy for [AWS account/workload].

Current situation:
- Monthly on-demand spend: $[amount]
- Utilization pattern: [steady/predictable / variable / growing]
- Services: [EC2, RDS, ElastiCache, Lambda, Fargate — which have significant spend?]

Reserved Instance types:
1. **Standard RI**: Largest discount, no flexibility (can't change instance type)
2. **Convertible RI**: ~15% less discount, can exchange for different instance type
3. **Scheduled RI**: For predictable recurring usage (e.g., business-hours workload)

Savings Plans (more flexible):
1. **Compute Savings Plan**: Applies to any EC2, Lambda, Fargate — most flexible
2. **EC2 Instance Savings Plan**: Specific instance family, more discount than Compute
3. **SageMaker Savings Plan**: For ML workloads

Decision framework:
- Stable, predictable usage of specific instance type: Standard RI
- Know the instance family but might change sizes: EC2 Instance Savings Plan
- Running containers (ECS Fargate) or Lambda: Compute Savings Plan
- Growing team, uncertain future: Start with 1-year Compute Savings Plan

Commitment calculation:
- Commit only what you're CERTAIN you'll use for the full term
- Analyze 30-day utilization baseline
- Commit to the baseline minimum, not the peak

Savings estimate:
- 1-year no-upfront RI: ~30-40% savings
- 3-year partial-upfront RI: ~50-60% savings
- Annual savings: $[current_spend × percentage]

Provide: Analysis of which workloads to commit and which to keep on-demand.
```

### 6. Spot Instance Strategy

```
Design a Spot Instance strategy for [workload types].

Good Spot candidates:
- Batch processing jobs
- CI/CD build agents
- Development/testing environments
- Stateless, fault-tolerant application workers
- Machine learning training jobs
- Log/data processing pipelines

Not suitable for Spot:
- Databases with persistent state
- Stateful applications
- Jobs that can't tolerate 2-minute interruption notice

Spot Instance strategy:
1. **Instance diversification**: Request multiple instance types + AZs
   - If your type is interrupted, capacity exists in alternatives
   - Use instance family (c5, c5d, c5n) not just one type

2. **Spot Fleet / Auto Scaling Group mixed policy**:
   - Base: Reserved instances for minimum capacity
   - Expansion: Spot instances for elastic capacity
   - Fallback: On-demand if no Spot available

3. **Interruption handling**:
   - Two-minute warning: IMDS /spot/termination-time endpoint
   - Graceful shutdown handler
   - In-progress work: Checkpoint to S3, resume on new instance

4. **Pricing strategy**:
   - Don't set max price: Let AWS manage (price rarely exceeds On-Demand)
   - Use Spot price history to avoid high-interruption instance types

5. **CI/CD on Spot** (GitHub Actions / Jenkins):
   - Jenkins on Spot with elastic agents
   - GitHub Actions: EC2 runners on Spot via actions-runner-controller

Savings: Spot = 60-90% less than on-demand.
Provide: Terraform ASG configuration with mixed Spot/On-Demand policy.
```

### 7. Container and Serverless Cost Optimization

```
Optimize costs for [ECS Fargate / Lambda / Kubernetes] workloads.

Current spend: [breakdown by service]
Usage patterns: [describe traffic patterns, invocation rates, durations]

Lambda optimization:
1. **Memory right-sizing**: Lambda charges by GB-seconds
   - Use AWS Lambda Power Tuning to find optimal memory
   - Often: Lower memory = same performance at lower cost (for I/O bound functions)
   - Sometimes: More memory = faster execution = lower total GB-seconds

2. **Duration optimization**:
   - Cold starts: Keep warm (provisioned concurrency) for latency-critical
   - But provisioned concurrency costs money even when idle — only for P99 SLOs
   - Architecture: Can async operations move cold-start-insensitive work to background?

3. **Compute Savings Plans**: 17% savings on Lambda

4. **Architecture**:
   - Lambda@Edge vs. CloudFront Functions: CloudFront Functions 6x cheaper for simple transforms
   - SNS → SQS → Lambda vs. direct invocation: Queue-based is more cost-efficient for spiky workloads

Fargate optimization:
1. **Right-size CPU/memory**: Fargate charges for allocated, not used
2. **Fargate Spot**: 70% savings, use for interruptible workloads
3. **Graviton2 (ARM)**: 20% cost savings, same performance

Kubernetes (EKS) optimization:
1. **Bin packing**: Ensure pods are densely packed (Vertical Pod Autoscaler)
2. **Spot node groups**: Spot for workloads that tolerate interruption
3. **Karpenter**: Faster, more cost-efficient autoscaling than cluster autoscaler

Provide: Cost comparison calculation and configuration for chosen optimizations.
```

## Database Cost Optimization Prompts

### 8. RDS and Database Cost Reduction

```
Reduce database costs for [RDS / Aurora / CloudSQL] workload.

Current monthly spend: $[amount]
Database: [engine, version, instance type, storage size, Multi-AZ?]
Traffic: [connections, queries/second, peak vs. average]

Optimization areas:

1. **Instance right-sizing**:
   - CPU utilization consistently <20%: Downsize
   - Memory pressure? (check FreeableMemory metric in CloudWatch)
   - Graviton RDS: 20-35% savings

2. **Aurora Serverless v2**:
   - Scales from 0.5 to 128 ACUs
   - Good for: variable workload, dev/test, applications with idle periods
   - Not good for: stable high-traffic production (on-demand RDS cheaper)

3. **Reserved RDS**:
   - 1-year no-upfront: ~30-40% savings
   - Stable, production databases are ideal candidates

4. **Storage optimization**:
   - Aurora: Pay per GB-month for actual storage (auto-grows, doesn't shrink)
   - Delete old snapshots (automated snapshot retention policy)
   - gp3 over gp2 for RDS: gp3 provides more IOPS for less cost at large sizes

5. **Eliminate unnecessary databases**:
   - Dev/test databases running 24/7? Use RDS scheduler to stop nights/weekends
   - Saving: 128h idle × [instance hourly rate] × 4 weeks

6. **Read replica count**:
   - More read replicas than needed? Eliminate unused ones
   - Can caching reduce read load to eliminate replicas?

7. **Multi-AZ analysis**:
   - Multi-AZ doubles cost for standby
   - Is standby RTO acceptable for non-production? Disable for staging
   - Production: Multi-AZ is usually worth it — just confirm you actually need it

Savings estimate: $[amount] by implementing [specific recommendations].
```

### 9. DynamoDB Cost Optimization

```
Optimize DynamoDB costs for [use case].

Current configuration:
- Table: [name, RCU/WCU provisioned or on-demand]
- Monthly cost: $[amount]
- Read/write patterns: [describe access patterns, peak vs. average]
- GSI count: [N global secondary indexes]

Optimization strategies:

1. **Capacity mode selection**:
   - On-demand: Simple, no capacity planning, 3x more expensive than provisioned
   - Provisioned: Requires capacity planning, auto-scaling handles spikes
   - Switch to provisioned when traffic is predictable (saves 60%)

2. **Auto-scaling configuration** (for provisioned):
   - Target utilization: 70% (not 100% — leaves headroom for spikes)
   - Min/max capacity based on traffic range
   - Scale-in cooldown: Longer (15 min) to avoid capacity thrash

3. **DynamoDB Reserved Capacity**:
   - 1-year or 3-year commitment
   - ~50% savings vs. on-demand capacity

4. **GSI cost analysis**:
   - Each GSI charges separately for reads/writes
   - Unused or rarely used GSIs are pure waste
   - Audit: Which GSIs are actually queried?

5. **Item size reduction**:
   - DynamoDB charges per read unit (4KB) and write unit (1KB)
   - Smaller items = fewer units consumed
   - Compress large attribute values (gzip, base64)
   - Use short attribute names (10 char attribute names × millions of items = MB of waste)

6. **Caching with DAX** (DynamoDB Accelerator):
   - Cache reads: 10x-100x cheaper than DynamoDB reads at high volume
   - DAX node cost vs. saved DynamoDB read units — calculate break-even

7. **TTL for expiring data**:
   - Auto-delete old items — no cost for deletion via TTL
   - Reduces storage costs over time

Provide: Auto-scaling configuration + TTL implementation + attribute optimization recommendations.
```

### 10. ElastiCache (Redis/Memcached) Cost Optimization

```
Optimize ElastiCache costs for [use case].

Current configuration:
- Node type: [cache.r6g.large etc.]
- Cluster: [single node / cluster mode / replicas]
- Monthly cost: $[amount]
- Memory utilization: [%]
- Hit rate: [%]

Optimization strategies:

1. **Right-sizing**:
   - Memory utilization consistently <40%: Downsize
   - Memory utilization >80%: Evaluate adding node or increasing memory
   - Graviton (r6g, m6g): 20% cheaper than Intel equivalents

2. **Eviction policy review**:
   - allkeys-lru: Evict least-recently-used across all keys
   - volatile-lru: Only evict keys with TTL (safer for critical data)
   - noeviction: Return error when memory full (requires careful sizing)

3. **TTL strategy**:
   - All cached items should have TTL (avoid infinite cache growth)
   - Review TTLs — are they appropriate for data freshness?
   - Short TTLs = more misses = more DB load (trade-off)

4. **Compression**:
   - Enable client-side compression for large values
   - Can reduce memory usage 50-70% for JSON/HTML values

5. **Reserved Nodes**:
   - 1-year or 3-year committed nodes
   - ~40-60% savings

6. **Data structure optimization**:
   - Use Redis data types efficiently (hashes for multiple fields of same object)
   - Avoid storing large objects in individual string keys

7. **Cluster architecture**:
   - Single AZ if application tolerates cache loss (dev/test)
   - Multi-AZ with replication only for production data that must survive node failure

Cache hit rate analysis:
- Current hit rate: [%]
- Impact of 1% hit rate improvement: [N] fewer DB queries × DB query cost
- Break-even: At what hit rate is the cache ROI positive?
```

## Storage and Transfer Cost Prompts

### 11. S3 Storage Cost Optimization

```
Optimize S3 storage costs for [buckets/data].

Current spend: $[amount]/month
Storage breakdown: [Standard: NGB, IA: NGB, Glacier: NGB]
Access patterns: [describe when and how data is accessed]

Storage class optimization:

| Storage Class | Use Case | Cost (per GB/month) | Retrieval |
|--------------|---------|--------------------|----|
| Standard | Active, frequently accessed | $0.023 | Free |
| Intelligent-Tiering | Unknown access pattern | $0.023 + small monitoring fee | Free |
| Standard-IA | Infrequent (monthly or less) | $0.0125 | $0.01/GB |
| One Zone-IA | Infrequent, non-critical | $0.01 | $0.01/GB |
| Glacier Instant | Archive, queried rarely | $0.004 | $0.03/GB |
| Glacier Flexible | Archive, hours to retrieve | $0.0036 | Higher |
| Glacier Deep Archive | True archive, days to retrieve | $0.00099 | Highest |

Lifecycle policies to implement:
- [bucket/prefix]: After 30 days of no access → IA
- [bucket/prefix]: After 90 days → Glacier Instant
- [bucket/prefix]: After 1 year → Deep Archive
- [bucket/prefix]: After 7 years → Delete (compliance)

Intelligent-Tiering:
- Automatically moves objects between Standard and IA
- $0.0025/1000 objects monitoring fee
- Good for: Large buckets with mixed access patterns

Other optimizations:
- Delete incomplete multipart uploads (costs continue until deleted)
- Remove old object versions (if versioning enabled, old versions accumulate)
- Compress data before storing (text, JSON, CSV)
- Request metrics: Are all objects being accessed? Identify dead data.

Lifecycle policy configuration: Provide Terraform resource for S3 lifecycle rules.
```

### 12. Data Transfer Cost Reduction

```
Reduce data transfer costs for [application/infrastructure].

Current transfer costs: $[amount]/month
Transfer breakdown: [cross-AZ: $X, internet egress: $Y, cross-region: $Z]

Data transfer cost sources (often hidden):
1. **Cross-AZ traffic**: EC2 to RDS in different AZ, EC2 to ElastiCache in different AZ
   - Fix: Co-locate resources in same AZ, or accept the cost for Multi-AZ redundancy

2. **Internet egress**: Serving data directly from S3 or EC2 to users
   - Fix: CloudFront CDN (origin egress to CloudFront is cheaper than internet egress)

3. **NAT Gateway**: Private subnet resources accessing internet
   - Cost: $0.045/GB processed (adds up fast)
   - Fix: S3 and DynamoDB VPC endpoints (no NAT Gateway cost for these services)
   - Fix: Interface endpoints for other AWS services

4. **Cross-region replication**: Replicating data between regions
   - Evaluate: Is cross-region replication necessary for all data?
   - Fix: Selective replication, compression before transfer

5. **CloudFront origin fetches**: If cache hit rate is low, origin traffic is high
   - Fix: Improve cache hit rate (better cache-control headers, reduce cache keys)

Quick wins:
- S3 VPC endpoint: Free, eliminates NAT Gateway cost for S3 access
- DynamoDB VPC endpoint: Free, same benefit
- Verify database and application are in same AZ

Data transfer savings estimate: $[X]/month from [specific changes].
```

### 13. CloudFront and CDN Cost Optimization

```
Optimize CloudFront and CDN costs for [application].

Current CloudFront spend: $[amount]/month
Traffic: [TB/month data transfer, N million requests/month]
Cache hit rate: [%]

Cost reduction strategies:

1. **Improve cache hit rate** (biggest lever):
   - Current: [%] → Target: [%]
   - Each 10% improvement in hit rate = 10% reduction in origin fetches
   - How to improve hit rate:
     - Remove unnecessary Vary headers (cookie, User-Agent can destroy caching)
     - Cache-Control: max-age to match actual data freshness
     - Normalize cache keys (remove tracking query params: utm_*, fbclid)
     - Cache error responses (prevent cache misses from thundering herd to origin)

2. **CloudFront price class**:
   - All Locations: Maximum performance, maximum cost
   - Price Class 100: US, Canada, Europe only (cheapest)
   - Price Class 200: US, Canada, Europe, Asia, Africa
   - If users are primarily in US/Europe: Price Class 100 saves ~30% on data transfer

3. **Compression**:
   - Enable Gzip and Brotli compression in CloudFront
   - Typically reduces transfer by 60-70% for text content (HTML, JS, CSS, JSON)

4. **WebP/AVIF image optimization**:
   - Lambda@Edge or CloudFront Functions for format negotiation
   - AVIF is 50% smaller than JPEG at same quality
   - WebP is 30% smaller

5. **Request cost reduction**:
   - Cache invalidation is charged (avoid frequent full invalidations)
   - Use versioned URLs instead of invalidation: /app.abc123.js
   - CloudFront Functions (cheaper than Lambda@Edge) for simple operations

6. **Origin shield**:
   - Single origin fetch point, reduces origin load
   - Worth it if: CDN price < saved origin compute cost

Monthly savings estimate from [improvements]:
- Cache hit rate +20%: -$[X] in origin transfer costs
- Price Class 100: -$[Y]
- Compression: -$[Z]
```

## Architecture-Level Cost Prompts

### 14. Serverless Cost Architecture

```
Design a cost-optimized serverless architecture for [use case].

Requirements: [describe functional requirements]
Budget: $[amount]/month
Expected traffic: [requests/month, data volume]

Serverless cost model: Pay-per-use, no idle cost.
Best for: Variable traffic, low-to-medium steady state traffic.

Cost estimation for AWS Lambda:
- Requests: $0.20 per 1M requests
- Duration: $0.0000166667 per GB-second
- Example: 1M req × 200ms × 128MB = 1M × 0.2s × 0.125GB = 25,000 GB-seconds × $0.0000166 = $0.42
- First 1M requests and 400,000 GB-seconds free per month

Optimize for Lambda billing:
1. Minimize memory allocation (don't over-allocate)
2. Minimize duration (fast code, efficient I/O)
3. Use Lambda Power Tuning for the memory-cost sweet spot
4. Batch processing: Process multiple records per invocation

API Gateway vs. Function URL vs. ALB:
- API Gateway: $3.50/million requests (most expensive)
- Function URL: Free (included in Lambda cost)
- ALB + Lambda target: $0.008/LCU-hour (cheaper for high volume)

DynamoDB on-demand vs. provisioned:
- On-demand: $1.25/million WCU, $0.25/million RCU
- Provisioned: ~$0.47/million WCU, ~$0.09/million RCU
- Switch to provisioned at ~[X] requests/second for this workload

Total cost estimate at [N] requests/month: $[calculation]
Break-even vs. server at: [requests/month]
```

### 15. Multi-Cloud Cost Arbitrage

```
Design a cost optimization strategy using multiple cloud providers.

Current situation: [single cloud, primary services and costs]
Reason for multi-cloud consideration: [cost / resilience / best-of-breed services]

Warning: Multi-cloud significantly increases operational complexity.
Only proceed if cost savings exceed the cost of complexity.

Cost arbitrage opportunities:
1. **Egress cost reduction**: Use provider with lower egress to serve specific regions
2. **Compute cost**: Some providers (Hetzner, OVH, DigitalOcean) offer 3-5x cheaper compute
3. **Storage**: Cloudflare R2: no egress fees (vs. S3 egress of $0.09/GB)
4. **Specialized services**: Some providers offer best-in-class at lower cost

Multi-cloud architecture patterns:
- Active/passive: Primary cloud with failover to secondary (DR use case)
- Service-specific: Primary cloud for compute, secondary for object storage
- Geographic: Different clouds for different regions based on cost/performance

Complexity costs to account for:
- Engineering time to maintain two environments
- Increased networking complexity and costs
- Different APIs, CLI tools, IAM models
- Incident response across two platforms

Break-even analysis:
- Cost savings from multi-cloud: $[X]/month
- Engineering cost of multi-cloud overhead: [N engineers × %time × hourly rate]
- If savings > overhead cost: Multi-cloud is worth it

My recommendation for your situation: [tailored advice]
```

### 16. Development Environment Cost Optimization

```
Reduce costs for non-production environments.

Problem: Dev, staging, QA environments often cost as much as production but only run 8-12 hours/day.

Cost breakdown by environment type:
- Development: Used by individual engineers, business hours only
- Staging: Used for integration testing, not 24/7
- QA: Used during sprints
- Performance testing: Used occasionally

Optimization strategies:

1. **Scheduled start/stop** (biggest quick win):
   - Stop all dev/staging resources nights and weekends
   - Mon-Fri, 8am-8pm only: 128h/week running vs. 168h = 24% savings on compute
   - Tools: AWS Instance Scheduler, GCP Scheduler + Cloud Functions, Terraform Cloud

2. **On-demand environments** (ephemeral):
   - Spin up environment per PR, tear down on merge
   - Tools: Pulumi Automation API, Terraform workspaces, Namespace (feature envs)
   - Benefit: Environment exists only when needed

3. **Smaller instances for non-production**:
   - Production: m5.2xlarge | Staging: m5.large (75% cheaper)
   - Database: Production: db.r5.2xlarge | Staging: db.t3.medium
   - Usually sufficient since non-prod doesn't need production-scale performance

4. **Single-AZ for non-production**:
   - Remove Multi-AZ from staging databases
   - Staging doesn't need HA

5. **Development sandboxes**:
   - Personal cloud sandboxes with budget limits
   - AWS Budgets alert when developer exceeds $X/month
   - Sandbox terminated or frozen at budget limit

6. **Spot instances for non-production**:
   - Dev/staging on Spot = 70% savings
   - Interruption acceptable in non-production

Savings estimate: Non-production environments often represent 30-40% of total cloud spend.
Estimated monthly savings: $[X] from [specific changes].
```

## FinOps Practice Prompts

### 17. FinOps Program Setup

```
Design a FinOps program for [organization size: startup / mid-size / enterprise].

Current state: [no cost governance / ad-hoc / some practices]
Goals: [specific goals — reduce spend by X%, establish budgets, chargebacks]

FinOps maturity levels:
1. **Crawl**: Visibility. Know what you're spending and why.
2. **Walk**: Accountability. Teams know their costs, budget targets exist.
3. **Run**: Optimization. Continuous improvement culture, cost part of every decision.

Program components to build:

1. **Governance structure**:
   - FinOps Champion (usually Cloud/Platform team lead)
   - Engineering representatives per team (cost contacts)
   - Finance partner for chargebacks
   - Monthly FinOps review meeting

2. **Visibility tooling**:
   - AWS Cost Explorer / GCP Cost Management / Azure Cost Management
   - Tagging strategy for cost attribution
   - Cost dashboard per team
   - Monthly cost report automated

3. **Budget management**:
   - Budget per team (start with current spend as budget, reduce over time)
   - Budget alerts at 80%, 100%, 120%
   - Budget forecast (next month prediction)

4. **Optimization workflow**:
   - Monthly: Right-sizing reviews
   - Quarterly: Reserved capacity review
   - Annually: Architecture cost reviews

5. **Cost culture**:
   - Cost metrics in engineering KPIs
   - Cost estimates in design documents
   - Cost impact in pull request descriptions for infrastructure changes

Starting toolkit: AWS Cost Explorer + tagging + budget alerts → get quick wins → invest in more sophisticated tooling.
```

### 18. Cloud Cost Forecasting

```
Build a cloud cost forecast model for [organization].

Input data:
- Current monthly spend: $[amount]
- Growth rate: [% monthly / YoY]
- Planned changes: [new services, traffic growth, team headcount]
- Committed spend: [RIs, Savings Plans, committed use discounts]

Forecast components:
1. **Baseline forecast**: Current spend × growth rate
2. **New workload additions**: New services coming online
3. **Reserved capacity impact**: Discounts from commitments
4. **Optimization savings**: Planned cost reductions
5. **Demand fluctuations**: Seasonal patterns

Forecasting methodology:
- Bottom-up: Estimate per service, sum up
- Top-down: Apply growth rate to current total
- Regression model: Historical spend + growth variables

Simple spreadsheet model:
- Monthly: [current] × (1 + growth_rate)
- Annual: SUM of monthly
- With optimization: Subtract one-time savings in first month they apply
- With commitments: Apply discount % starting from commitment date

Scenario modeling:
- Base case: [assumptions]
- Optimistic case: Optimizations succeed + lower growth
- Pessimistic case: Growth exceeds plan + optimization delays

Cloud provider forecast tools:
- AWS Cost Explorer: 12-month forecast based on historical
- Custom model: Incorporates business metrics (user growth, transaction volume)

How to use: Monthly actuals vs. forecast → adjust model → improve accuracy over time.
```

### 19. Cost Per Unit Metrics

```
Design cost per unit metrics for [product/service].

Problem: Absolute spend growing but unclear if it's growing faster or slower than the business.
Solution: Track cost per business unit — unit economics for infrastructure.

Identify the right unit:
- SaaS: Cost per active user per month
- E-commerce: Cost per order
- API product: Cost per API call
- Media: Cost per view or per hour streamed

Metric calculation:
- Unit cost = Total infrastructure cost / Business unit count
- Track over time: Is unit cost increasing or decreasing?
- Decreasing unit cost = efficiency improving as you scale

Implementation:
1. Tag infrastructure for attribution to each product/feature
2. Pull cost data from cloud billing API (daily or monthly)
3. Pull business metrics from product analytics
4. Calculate: cost_per_unit = cloud_cost / business_metric
5. Dashboard: Track over time

Target for healthy scaling: Unit cost should decrease or stay flat as volume increases.
If unit cost is increasing: The architecture is not scaling efficiently.

Benchmarks for [product type]:
- B2B SaaS: $[X]-[Y] infrastructure cost per user per month
- Consumer app: $[X]-[Y] per MAU per month
- API platform: $[X]-[Y] per million API calls

Provide: SQL query to calculate cost per unit from billing data + business metrics table.
```

## Advanced Cost Optimization Prompts

### 20. Kubernetes Cost Optimization

```
Optimize costs for Kubernetes clusters.

Current state:
- Cluster: [node types, count, cloud provider (EKS/GKE/AKS)]
- Monthly spend: $[amount] (compute + persistent storage)
- Average cluster utilization: CPU [%], Memory [%]

Cost drivers in K8s:
1. Over-provisioned node groups
2. Pods with high resource requests but low actual usage
3. Underutilized persistent volumes
4. Load balancers per service (use Ingress instead)

Tools to implement:

1. **Vertical Pod Autoscaler (VPA)**:
   - Recommends optimal CPU/memory requests for each pod
   - Based on actual usage over time
   - Mode: recommendation only (don't auto-apply in production initially)
   - Apply recommendations to reduce wasted reserved capacity

2. **Cluster Autoscaler / Karpenter**:
   - Scale down nodes when pods fit in fewer nodes
   - Karpenter: More aggressive bin-packing than Cluster Autoscaler
   - Spot node groups: Add Spot nodes for non-critical workloads

3. **Resource quota enforcement**:
   - Namespace ResourceQuota prevents teams from over-allocating
   - LimitRange: Default requests/limits for pods without explicit settings

4. **Kubecost** (cost visibility):
   - Cost per namespace, per deployment, per team
   - Idle cost (reserved but unused)
   - Cost efficiency score

5. **Node consolidation**:
   - Nodes with only a few small pods: Drain and remove
   - Schedule pods to fill nodes more completely (affinity rules)

Savings estimate:
- Right-sizing requests: [X]% cost reduction
- Spot nodes: [Y]% of workload on Spot × 70% savings = [Z]% total savings
- Node consolidation: [N] fewer nodes × [instance cost]
```

### 21. Database Query Cost Optimization

```
Optimize database query costs for [cloud-managed database].

Problem: [describe — high RCU on DynamoDB, high I/O on RDS, high query cost on BigQuery/Athena]

For DynamoDB read cost optimization:
- Current read patterns: [scan vs. query vs. get_item]
- Identify table scans (most expensive): Any Scan operations?
- Fix: Design proper partition keys and sort keys to use Query instead of Scan
- Projection: Project only needed attributes (fewer RCUs for smaller items)
- Filter expressions: Filter AFTER read (still charges for read — design access patterns instead)

For RDS/Aurora IOPS optimization:
- IOPS are charged separately on gp3 and io1 volumes
- Identify high-IOPS queries (full table scans, missing indexes)
- Add indexes to convert seq scan → index scan
- Reduce IOPS: Better caching (larger buffer pool), fewer unnecessary reads

For BigQuery/Athena cost optimization:
- BigQuery: Charges per TB scanned
- SELECT *: Scans all columns — specify only needed columns
- Partition pruning: WHERE partition_column = 'value' limits scan to partitions
- Clustering: Further reduces scan for queries on clustered columns
- Materialized views: Pre-compute expensive aggregations, charged for storage not scan

For Redshift cost optimization:
- Sort keys: Data stored sorted → range queries scan less data
- Distribution keys: Co-locate related data → avoid shuffle/network
- Concurrency scaling: Additional clusters for bursting (charged per second)
- Automatic workload management: Prioritize queries, prevent runaway queries

Savings estimate and implementation priority.
```

### 22. Egress Optimization with Cloudflare R2

```
Evaluate migrating [S3 buckets] to Cloudflare R2 for egress cost savings.

Current S3 usage:
- Storage: [N]GB
- Egress (to internet): [M]GB/month at $0.09/GB = $[cost]/month
- Egress via CloudFront: [P]GB/month at $0.0085-0.02/GB

Cloudflare R2:
- Storage: $0.015/GB (vs S3 Standard $0.023/GB)
- Egress: $0 (zero egress fees)
- Class A operations (writes): $4.50/million
- Class B operations (reads): $0.36/million
- API: S3-compatible (minimal code change)

Migration analysis:
- Current monthly S3 + CloudFront egress: $[X]
- R2 storage: $[Y]
- R2 operations: $[Z]
- Total R2 cost: $[Y+Z]
- Monthly savings: $[X - (Y+Z)]
- Payback period: Migration effort / monthly savings

When R2 is worth it:
- High egress volume (you're paying significant monthly egress)
- Public files served directly (not requiring AWS-native features)
- When S3 object Lambda, event notifications, Glacier not needed

When R2 is NOT worth it:
- Egress already through CloudFront at low rates
- Tight AWS integration (Lambda triggers, SQS notifications)
- Need Glacier storage class

Migration plan:
1. Upload new files to R2, sync old files
2. Update CDN to point to R2 origin
3. Verify cache behavior
4. Gradually shift traffic
5. Decommission S3 bucket after validation

Provide: R2 migration script using rclone.
```

### 23. Cost-Aware Architecture Reviews

```
Add cost awareness to architecture review process.

Problem: Architecture reviews focus on reliability/scalability/security but not cost.
Result: Expensive designs approved without cost trade-off analysis.

Architecture cost review checklist:

1. **Estimated monthly cost**:
   - Every architecture proposal should include cost estimate
   - Use AWS Pricing Calculator / GCP Pricing Calculator
   - Include compute, storage, networking, managed services

2. **Cost assumptions**:
   - What traffic/usage assumptions were made?
   - What happens to cost at 10x traffic?
   - What are the variable vs. fixed costs?

3. **Cost optimization analysis**:
   - Are Reserved Instances/Savings Plans considered?
   - Are Spot instances applicable for any workloads?
   - Is Graviton considered for compute?
   - Are storage costs and tiers appropriate?

4. **Alternative analysis**:
   - Was a simpler, cheaper alternative considered?
   - Cost comparison: Option A vs. Option B

5. **Cost ownership**:
   - Which team owns the cost?
   - How will costs be tracked (tags, account structure)?

ADR template addition:
```
## Cost Impact
- Estimated monthly cost: $[X]
- Cost assumptions: [traffic, usage]
- Cost at 10x scale: $[Y]
- Cost optimization opportunities identified: [list]
- Compared to alternatives:
  - Option A (chosen): $[X]/month
  - Option B: $[Y]/month
  - Reason to choose A despite potentially higher cost: [explain]
```

Implement: Mandatory cost section in architecture proposal template.
```

### 24. Cost Governance and Budgets

```
Design a cloud cost governance framework for [team size: 10/50/200 engineers].

Goal: Cost accountability without slowing down engineering.

Governance principles:
1. Teams are responsible for costs they control
2. Visibility before accountability (can't control what you can't see)
3. Education before enforcement (teach the why before the rules)
4. Automation over process (automated alerts > manual reviews)

Budget structure:
- Account-level budgets: Hard limits per AWS account or GCP project
- Team budgets: Allocated from account budget, owned by team lead
- Environment budgets: Production (higher), non-production (lower, capped)

Budget alert strategy:
- 50% of budget: Informational, no action
- 80% of budget: Warning, team lead notified
- 100% of budget: Alert, engineering manager notified
- 120% of budget: Escalation, resources may be frozen

Governance touchpoints:
1. Architecture review: Cost estimate required
2. Monthly FinOps review: Teams present optimization progress
3. Quarterly: Budget reallocation based on actual vs. planned
4. Annual: Budget planning for next year

What to NOT govern:
- Don't require approval for every resource creation — too slow
- Don't block deployments for cost reasons without engineering discussion
- Don't shame teams publicly for overspending — show how to optimize

Automation:
- Budget alerts → Slack notifications to team channel
- Auto-stop dev environments after business hours
- Tag compliance: Resources without required tags flagged daily

Provide: AWS Budgets configuration + Slack notification Lambda function.
```

### 25. Infrastructure Cost Dashboard Design

```
Design a cloud cost dashboard for engineering leadership.

Audience: VP Engineering, CTOs, FinOps team
Refresh: Daily (not real-time — billing data has delay)
Tool: Grafana + CloudWatch / DataDog / AWS QuickSight / Tableau

Required metrics:

1. **Executive summary**:
   - Current month-to-date spend
   - Forecast for end of month
   - vs. Budget (% used)
   - vs. Same month last year (YoY growth)
   - vs. Last month (MoM growth)

2. **Cost breakdown**:
   - By service (compute, database, storage, networking, other)
   - By team/department (requires tagging)
   - By environment (production, non-production)
   - By region

3. **Optimization metrics**:
   - Reserved Instance / Savings Plan coverage (%)
   - RI/SP utilization (% of committed capacity used)
   - Spot vs. On-Demand ratio
   - Waste: Idle resources cost

4. **Unit economics**:
   - Cost per [business metric] over time
   - Infrastructure cost as % of revenue (target: <5% for SaaS)

5. **Anomalies**:
   - Services or teams with >20% cost increase week-over-week
   - New services appearing (unexpected spend)

6. **Optimization tracker**:
   - Identified savings opportunities
   - Implemented savings (actual reduction achieved)
   - Pipeline of upcoming optimizations

Dashboard design principles:
- Green/yellow/red status indicators
- Trend arrows (improving/worsening)
- Drill-down from summary to detail
- Mobile-friendly for executive review

Provide: Grafana dashboard JSON configuration.
```

## Cost Optimization Quick Wins Reference

### Immediate Actions (Day 1)

```
Generate a list of immediate cost optimizations that take less than 1 day to implement.

Account: [cloud provider and rough size]

Quick wins that typically save $X/month:
1. Delete unattached EBS volumes and snapshots: Usually $[X]-[X]/month
2. Release unused Elastic IPs: $3.65/month each
3. Delete unused load balancers: ~$16-22/month each
4. Enable S3 Intelligent-Tiering for large buckets with unknown access patterns
5. Set S3 lifecycle rules to delete old versions and incomplete multipart uploads
6. Stop dev/test instances on weekends (AWS Instance Scheduler)
7. S3 VPC Endpoint (free but saves NAT Gateway costs)
8. Right-size obvious outliers: Any instance at <5% CPU for 7+ days

For each: one-liner command or console action, estimated savings, risk level.
```

::: tip
The most powerful cost optimization insight is: measure cost per unit of business value, not just absolute cost. If your infrastructure cost doubles but your revenue triples, your unit economics are improving — that's good cost scaling. If costs grow faster than business value, you have an efficiency problem to solve.
:::
