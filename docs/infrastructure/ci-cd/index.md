---
title: "CI/CD Overview"
description: "Continuous Integration and Continuous Delivery — from first principles to production-grade pipeline architectures"
tags: [ci-cd, devops, automation, pipelines, infrastructure]
difficulty: "intermediate"
prerequisites: [docker-internals, kubernetes-architecture]
lastReviewed: "2026-03-18"
---

# CI/CD Overview

## Why CI/CD Exists

In the early 2000s, software teams shipped code quarterly. A "release" meant weeks of manual integration, days of testing, and prayer-filled deployment nights. The cost of a single deployment failure could mean months of rollback work. The industry needed a fundamentally different approach.

**Continuous Integration (CI)** emerged from Kent Beck's Extreme Programming practices in the late 1990s. The core insight was simple: if integration is painful, do it more often. Martin Fowler formalized the practice in 2006, defining CI as developers integrating their work frequently — at least daily — with each integration verified by automated builds and tests.

**Continuous Delivery (CD)** extended this idea: if deploying is painful, automate it. Jez Humble and David Farley's 2010 book "Continuous Delivery" laid the foundation, arguing that software should always be in a deployable state.

**Continuous Deployment** goes further — every change that passes automated tests is deployed to production automatically, with no human gate.

### The Problem Statement

Without CI/CD, teams face:

| Problem | Impact | CI/CD Solution |
|---------|--------|---------------|
| Integration hell | Days of merge conflicts | Continuous integration with automated testing |
| Manual testing bottleneck | Weeks of QA cycles | Automated test suites at every commit |
| Deployment fear | Infrequent, risky releases | Automated, repeatable deployment pipelines |
| Environment drift | "Works on my machine" | Infrastructure as Code, containerized builds |
| Slow feedback loops | Bugs found weeks after introduction | Immediate feedback on every commit |
| Configuration inconsistency | Production differs from staging | Environment promotion with immutable artifacts |

## First Principles

### The Deployment Pipeline as a Value Stream

A CI/CD pipeline is a **value stream** — the sequence of steps that transforms a code change into running production software. Every step must add value; every delay is waste.

```mermaid
graph LR
    A[Developer Commit] --> B[Build]
    B --> C[Unit Tests]
    C --> D[Integration Tests]
    D --> E[Security Scan]
    E --> F[Artifact Build]
    F --> G[Deploy to Staging]
    G --> H[E2E Tests]
    H --> I[Manual Approval]
    I --> J[Deploy to Production]
    J --> K[Smoke Tests]
    K --> L[Monitoring]

    style A fill:#e1f5fe
    style J fill:#c8e6c9
    style L fill:#fff3e0
```

### Fundamental Properties

Every effective CI/CD system must satisfy these properties:

1. **Determinism**: Given the same inputs (code + dependencies + configuration), the pipeline must produce the same outputs. Non-deterministic builds are the root of most CI/CD suffering.

2. **Idempotency**: Running the pipeline twice on the same commit must produce the same result. Deployments must be safe to retry.

3. **Immutability**: Build artifacts are never modified after creation. The binary deployed to staging is byte-for-byte identical to what reaches production.

4. **Observability**: Every pipeline step must emit structured logs, metrics, and traces. When a deployment fails at 3 AM, you need answers fast.

5. **Isolation**: Pipeline steps should not leak state between runs. Today's build must not be affected by yesterday's failure.

### The DORA Metrics Framework

Google's DevOps Research and Assessment (DORA) team identified four key metrics that predict software delivery performance:

$$
\text{Deployment Frequency} = \frac{\text{Number of Deployments}}{\text{Time Period}}
$$

$$
\text{Lead Time for Changes} = T_{\text{deploy}} - T_{\text{commit}}
$$

$$
\text{Change Failure Rate} = \frac{\text{Failed Deployments}}{\text{Total Deployments}} \times 100\%
$$

$$
\text{Mean Time to Recovery (MTTR)} = \frac{\sum_{i=1}^{n} (T_{\text{restored}_i} - T_{\text{failed}_i})}{n}
$$

| Performance Level | Deploy Frequency | Lead Time | Change Failure Rate | MTTR |
|-------------------|-----------------|-----------|-------------------|------|
| Elite | On-demand (multiple/day) | < 1 hour | 0-15% | < 1 hour |
| High | Weekly to monthly | 1 day - 1 week | 16-30% | < 1 day |
| Medium | Monthly to 6 months | 1 week - 1 month | 16-30% | 1 day - 1 week |
| Low | > 6 months | > 6 months | 46-60% | > 6 months |

## Core Mechanics

### Pipeline Architecture

A modern CI/CD pipeline consists of several interconnected systems:

```mermaid
graph TB
    subgraph "Source Control"
        VCS[Git Repository]
        PR[Pull Request]
        Webhook[Webhook Event]
    end

    subgraph "CI System"
        Queue[Job Queue]
        Scheduler[Scheduler]
        Runner1[Runner 1]
        Runner2[Runner 2]
        Runner3[Runner 3]
        Cache[Build Cache]
    end

    subgraph "Artifact Storage"
        Registry[Container Registry]
        NPM[Package Registry]
        S3[Object Storage]
    end

    subgraph "CD System"
        GitOps[GitOps Controller]
        Deployer[Deployment Engine]
        Canary[Canary Analyzer]
    end

    subgraph "Target Environments"
        Dev[Development]
        Staging[Staging]
        Prod[Production]
    end

    VCS --> Webhook
    PR --> Webhook
    Webhook --> Queue
    Queue --> Scheduler
    Scheduler --> Runner1
    Scheduler --> Runner2
    Scheduler --> Runner3
    Runner1 --> Cache
    Runner2 --> Cache
    Runner3 --> Cache
    Runner1 --> Registry
    Runner2 --> NPM
    Runner3 --> S3
    Registry --> GitOps
    GitOps --> Deployer
    Deployer --> Dev
    Deployer --> Staging
    Deployer --> Prod
    Canary --> Prod
```

### Build System Internals

At its core, a CI runner is an event-driven job executor:

1. **Event ingestion**: Webhooks from VCS trigger pipeline creation
2. **Job scheduling**: The scheduler matches jobs to available runners based on labels, capacity, and resource requirements
3. **Workspace preparation**: The runner clones the repository, restores caches, and sets up the execution environment
4. **Step execution**: Each step runs in sequence (or parallel where specified) within the job's container/VM
5. **Artifact collection**: Outputs are extracted and stored
6. **Status reporting**: Results are sent back to the VCS via status checks

```typescript
// Conceptual model of a CI pipeline executor
interface PipelineConfig {
  trigger: TriggerEvent;
  stages: Stage[];
  globalEnv: Record<string, string>;
  timeout: number;
}

interface Stage {
  name: string;
  jobs: Job[];
  dependsOn?: string[];
}

interface Job {
  name: string;
  runner: RunnerSelector;
  container?: ContainerConfig;
  steps: Step[];
  services?: ServiceConfig[];
  cache?: CacheConfig;
  artifacts?: ArtifactConfig;
  timeout: number;
  retries: RetryConfig;
}

interface Step {
  name: string;
  run?: string;
  uses?: string;   // reusable action reference
  with?: Record<string, string>;
  env?: Record<string, string>;
  if?: string;      // conditional expression
  continueOnError?: boolean;
}

interface RunnerSelector {
  labels: string[];
  group?: string;
}

interface CacheConfig {
  key: string;
  paths: string[];
  restoreKeys?: string[];
}

class PipelineExecutor {
  private stageResults: Map<string, StageResult> = new Map();

  async execute(config: PipelineConfig): Promise<PipelineResult> {
    const startTime = Date.now();

    for (const stage of this.topologicalSort(config.stages)) {
      // Check if dependencies succeeded
      if (stage.dependsOn?.some(dep =>
        this.stageResults.get(dep)?.status !== 'success'
      )) {
        this.stageResults.set(stage.name, { status: 'skipped' });
        continue;
      }

      // Execute all jobs in the stage concurrently
      const jobResults = await Promise.allSettled(
        stage.jobs.map(job => this.executeJob(job, config.globalEnv))
      );

      const stageStatus = jobResults.every(
        r => r.status === 'fulfilled' && r.value.status === 'success'
      ) ? 'success' : 'failure';

      this.stageResults.set(stage.name, { status: stageStatus });

      if (stageStatus === 'failure') {
        return {
          status: 'failure',
          duration: Date.now() - startTime,
          stages: this.stageResults,
        };
      }
    }

    return {
      status: 'success',
      duration: Date.now() - startTime,
      stages: this.stageResults,
    };
  }

  private async executeJob(
    job: Job,
    globalEnv: Record<string, string>
  ): Promise<JobResult> {
    const env = { ...globalEnv, ...this.resolveJobEnv(job) };
    const workspace = await this.prepareWorkspace(job);

    // Restore cache
    if (job.cache) {
      await this.restoreCache(job.cache, workspace);
    }

    // Start services (databases, redis, etc.)
    const services = job.services
      ? await this.startServices(job.services)
      : [];

    try {
      for (const step of job.steps) {
        // Evaluate conditional
        if (step.if && !this.evaluateExpression(step.if, env)) {
          continue;
        }

        const stepResult = await this.executeStep(step, workspace, env);

        if (stepResult.exitCode !== 0 && !step.continueOnError) {
          return { status: 'failure', failedStep: step.name };
        }
      }

      // Save cache
      if (job.cache) {
        await this.saveCache(job.cache, workspace);
      }

      // Collect artifacts
      if (job.artifacts) {
        await this.collectArtifacts(job.artifacts, workspace);
      }

      return { status: 'success' };
    } finally {
      await Promise.all(services.map(s => s.stop()));
      await workspace.cleanup();
    }
  }

  private topologicalSort(stages: Stage[]): Stage[] {
    const visited = new Set<string>();
    const sorted: Stage[] = [];
    const stageMap = new Map(stages.map(s => [s.name, s]));

    const visit = (stage: Stage) => {
      if (visited.has(stage.name)) return;
      visited.add(stage.name);
      for (const dep of stage.dependsOn ?? []) {
        const depStage = stageMap.get(dep);
        if (depStage) visit(depStage);
      }
      sorted.push(stage);
    };

    stages.forEach(visit);
    return sorted;
  }

  // ... additional helper methods
}
```

### Caching Mechanics

Caching is the single most impactful optimization in CI/CD. Without it, every build starts from scratch — downloading dependencies, compiling code, and building containers.

**Cache key strategies**:

```
// Exact match — fastest, least flexible
cache-key: deps-{​{ hashFiles('package-lock.json') }}

// Prefix match — falls back to partial restore
restore-keys:
  - deps-{​{ hashFiles('package-lock.json') }}
  - deps-{​{ branch }}
  - deps-main
  - deps-
```

**Cache invalidation formula**:

$$
\text{Cache Hit Rate} = \frac{\text{Cache Hits}}{\text{Cache Hits} + \text{Cache Misses}} \times 100\%
$$

$$
\text{Time Saved} = \text{Cache Hits} \times (T_{\text{cold}} - T_{\text{warm}})
$$

Where $T_{\text{cold}}$ is the time for a cacheless build and $T_{\text{warm}}$ is the time when cache is available.

## Implementation: Production Pipeline Configuration

### GitHub Actions Multi-Stage Pipeline

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${​{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  REGISTRY: ghcr.io
  IMAGE_NAME: ${​{ github.repository }}

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${​{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${​{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run test -- --shard=${​{ matrix.shard }}/4
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-${​{ matrix.shard }}
          path: coverage/

  integration-tests:
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck]
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${​{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379

  security-scan:
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck]
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

  build:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests, security-scan]
    permissions:
      contents: read
      packages: write
    outputs:
      image-tag: ${​{ steps.meta.outputs.tags }}
      image-digest: ${​{ steps.build.outputs.digest }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${​{ env.REGISTRY }}
          username: ${​{ github.actor }}
          password: ${​{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${​{ env.REGISTRY }}/${​{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
      - id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${​{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    runs-on: ubuntu-latest
    needs: [build]
    if: github.ref == 'refs/heads/main'
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: |
          echo "Deploying ${​{ needs.build.outputs.image-tag }} to staging"
          # kubectl set image deployment/app app=${​{ needs.build.outputs.image-tag }}

  deploy-production:
    runs-on: ubuntu-latest
    needs: [deploy-staging]
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          echo "Deploying to production with canary strategy"
```

## Edge Cases & Failure Modes

### Common Pipeline Failures

| Failure Mode | Cause | Mitigation |
|-------------|-------|------------|
| Flaky tests | Non-deterministic test order, timing, shared state | Test isolation, retry policies, quarantine |
| Cache poisoning | Corrupted cache restored to new builds | Cache key versioning, periodic invalidation |
| Runner exhaustion | Too many concurrent jobs | Autoscaling runners, queue limits |
| Secret leakage | Secrets printed in logs | Secret masking, audit logging |
| Dependency confusion | Malicious package with internal name | Scoped registries, lockfile pinning |
| Webhook storms | VCS sends duplicate events | Idempotency keys, deduplication |
| Clock skew | Runners have drifted clocks | NTP enforcement, relative timestamps |
| Disk exhaustion | Large artifacts fill runner disk | Cleanup steps, ephemeral runners |

### Flaky Test Management

```typescript
interface FlakyTestConfig {
  maxRetries: number;
  quarantineEnabled: boolean;
  quarantineThreshold: number; // failures in last N runs
  alertOnNewFlaky: boolean;
}

class FlakyTestDetector {
  private testHistory: Map<string, boolean[]> = new Map();

  recordResult(testName: string, passed: boolean): void {
    const history = this.testHistory.get(testName) ?? [];
    history.push(passed);

    // Keep last 50 runs
    if (history.length > 50) history.shift();
    this.testHistory.set(testName, history);
  }

  getFlakyScore(testName: string): number {
    const history = this.testHistory.get(testName);
    if (!history || history.length < 5) return 0;

    // Count transitions (pass -> fail or fail -> pass)
    let transitions = 0;
    for (let i = 1; i < history.length; i++) {
      if (history[i] !== history[i - 1]) transitions++;
    }

    // Flaky score: ratio of transitions to total runs
    // A consistently passing or failing test has score ~0
    // A randomly flipping test approaches 1.0
    return transitions / (history.length - 1);
  }

  shouldQuarantine(testName: string, config: FlakyTestConfig): boolean {
    return config.quarantineEnabled &&
           this.getFlakyScore(testName) > config.quarantineThreshold;
  }
}
```

## Performance Characteristics

### Pipeline Duration Benchmarks

| Pipeline Component | Cold (No Cache) | Warm (Cached) | Optimization |
|-------------------|-----------------|---------------|-------------|
| Git clone (monorepo, 10GB) | 120s | 5s (shallow) | Shallow clone, sparse checkout |
| npm install (2000 deps) | 90s | 8s | npm ci + cache |
| TypeScript compilation | 45s | 12s | Incremental compilation |
| Unit tests (5000 tests) | 180s | 180s (parallelized: 45s) | Sharding across 4 runners |
| Docker build (Node.js) | 120s | 15s | Layer caching, multi-stage |
| Security scan (Trivy) | 30s | 10s | DB cache |
| E2E tests (100 scenarios) | 600s | 600s (parallelized: 120s) | Test sharding, 5 runners |
| **Total (sequential)** | **~1185s** | **~830s** | |
| **Total (optimized)** | **~480s** | **~200s** | Parallelism + caching |

### Cost Model

$$
\text{Monthly CI Cost} = \sum_{i=1}^{N} \left( D_i \times R_i \times C_r \right) + S_{\text{storage}} + T_{\text{transfer}}
$$

Where:
- $N$ = number of pipeline types
- $D_i$ = daily runs of pipeline $i$
- $R_i$ = average runner-minutes for pipeline $i$
- $C_r$ = cost per runner-minute
- $S_{\text{storage}}$ = artifact storage cost
- $T_{\text{transfer}}$ = data transfer cost

**Example cost calculation** for a team of 20 developers:

| Resource | Quantity | Unit Cost | Monthly Cost |
|----------|----------|-----------|-------------|
| CI minutes (GitHub Actions) | 50,000 min | $0.008/min (Linux) | $400 |
| Larger runners (4 vCPU) | 10,000 min | $0.032/min | $320 |
| Artifact storage | 50 GB | $0.25/GB | $12.50 |
| Self-hosted runners (3x m5.xlarge) | 3 instances | $140/mo each | $420 |
| **Total** | | | **~$1,152** |

## Mathematical Foundations

### Queue Theory in CI/CD

CI runners form a queuing system. Using M/M/c queue model (Poisson arrivals, exponential service, c servers):

$$
\rho = \frac{\lambda}{c \mu}
$$

Where:
- $\lambda$ = average job arrival rate (jobs/minute)
- $\mu$ = average job service rate per runner (jobs/minute)
- $c$ = number of runners
- $\rho$ = server utilization (must be < 1 for stability)

The probability of waiting (Erlang C formula):

$$
P_w = \frac{\frac{(c\rho)^c}{c!(1-\rho)}}{\sum_{k=0}^{c-1} \frac{(c\rho)^k}{k!} + \frac{(c\rho)^c}{c!(1-\rho)}}
$$

Average wait time in queue:

$$
W_q = \frac{P_w}{c\mu(1-\rho)}
$$

::: tip Practical Application
If your team generates 30 CI jobs/hour ($\lambda = 0.5$ jobs/min), each taking an average of 10 minutes ($\mu = 0.1$ jobs/min), you need at least $c = \lceil \lambda / \mu \rceil = 5$ runners to avoid unbounded queue growth. In practice, target $\rho < 0.7$ to keep wait times reasonable — meaning 8 runners.
:::

### Little's Law Applied to Pipelines

$$
L = \lambda W
$$

Where $L$ is the average number of in-flight pipelines, $\lambda$ is the arrival rate, and $W$ is the average pipeline duration. This is useful for capacity planning:

If $\lambda = 100$ pipelines/day and $W = 15$ minutes (0.01 days), then $L = 1$ pipeline in-flight on average. During peak hours (3x average), $L = 3$ concurrent pipelines.

## Real-World War Stories

::: info War Story — The npm Left-Pad Incident (2016)
When Azer Koculu unpublished the `left-pad` package from npm, thousands of CI/CD pipelines worldwide broke instantly. Builds that had worked for months suddenly failed because they pulled dependencies fresh every time.

**Root cause**: No lockfile pinning, no private registry mirror.

**Fix**: Teams adopted `npm ci` (which uses lockfiles strictly), private registries like Verdaccio, and artifact caching strategies that didn't rely on public registries being available.

**Lesson**: Your pipeline is only as reliable as its weakest external dependency. Mirror everything critical.
:::

::: info War Story — The 6-Hour Build Queue
A fintech company with 200 developers on a monorepo experienced build queues exceeding 6 hours during peak development. Developers started batching changes into larger PRs to avoid the queue — which made reviews harder, increased merge conflicts, and ultimately slowed delivery.

**Root cause**: Fixed pool of 20 self-hosted runners, no autoscaling, all jobs running on the same runner type.

**Fix**: Migrated to autoscaling runner groups with spot instances. Implemented job-level runner selection (lint on small runners, builds on large runners). Added aggressive caching that cut build times from 25 minutes to 8 minutes. Queue times dropped to under 2 minutes.

**Lesson**: CI infrastructure must scale with your team. The cost of idle developers waiting for builds far exceeds the cost of additional compute.
:::

## Decision Framework

### Choosing a CI/CD Platform

| Factor | GitHub Actions | GitLab CI | Jenkins | CircleCI | Buildkite |
|--------|---------------|-----------|---------|----------|-----------|
| Hosted runners | Yes | Yes | No | Yes | No |
| Self-hosted runners | Yes | Yes | Yes | Yes | Yes |
| Container-native | Yes | Yes | Plugin | Yes | Yes |
| Monorepo support | Good | Good | Excellent | Good | Excellent |
| Config format | YAML | YAML | Groovy/YAML | YAML | YAML |
| Marketplace/plugins | 20,000+ | 500+ | 1,800+ | 300+ | 200+ |
| OIDC auth | Yes | Yes | Plugin | Yes | Yes |
| Max concurrency | 500 (enterprise) | Unlimited (self) | Unlimited | 80 | Unlimited |
| Free tier | 2,000 min/mo | 400 min/mo | Self-host | 6,000 min/mo | Free (self-host) |
| Best for | GitHub-native teams | GitLab-native teams | Complex enterprises | Startups | Large-scale |

### When to Use Each Approach

```mermaid
graph TD
    A{Where is your code?} -->|GitHub| B{Team size?}
    A -->|GitLab| C[GitLab CI]
    A -->|Other| D{Need managed?}

    B -->|< 20 devs| E[GitHub Actions hosted]
    B -->|20-100 devs| F{Monorepo?}
    B -->|> 100 devs| G[GitHub Actions + self-hosted]

    F -->|Yes| H[Buildkite or GitHub Actions with custom runners]
    F -->|No| E

    D -->|Yes| I[CircleCI or GitHub Actions]
    D -->|No| J[Jenkins or Buildkite]
```

## Advanced Topics

### Pipeline as Code Patterns

Modern CI/CD has evolved toward **pipeline-as-code** — treating pipeline definitions as first-class software artifacts with the same rigor as application code:

1. **Reusable workflows**: Shared pipeline definitions across repositories
2. **Pipeline testing**: Unit tests for pipeline logic
3. **Pipeline versioning**: Semantic versioning for shared pipeline libraries
4. **Policy as Code**: OPA/Rego policies governing what pipelines can do

### GitOps and Declarative CD

GitOps inverts the deployment model: instead of CI pushing to environments, a controller in each environment pulls the desired state from Git.

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant CI as CI Pipeline
    participant Reg as Container Registry
    participant Git as Config Repo
    participant Argo as ArgoCD
    participant K8s as Kubernetes

    Dev->>CI: Push code
    CI->>CI: Build & test
    CI->>Reg: Push image (v1.2.3)
    CI->>Git: Update image tag in manifests
    Argo->>Git: Poll for changes
    Argo->>K8s: Apply desired state
    K8s->>Argo: Report actual state
    Argo->>Argo: Reconcile drift
```

### Emerging Trends

1. **AI-powered CI/CD**: Predictive test selection, automatic flaky test detection, intelligent retry policies
2. **Supply chain security**: SLSA framework, Sigstore signing, SBOM generation
3. **Ephemeral environments**: Per-PR preview environments with full stack
4. **Platform engineering**: Internal developer platforms abstracting CI/CD complexity
5. **WebAssembly runners**: Wasm-based build isolation for faster, more secure builds

## Section Overview

This section covers CI/CD in depth across the following pages:

| Page | What You'll Learn |
|------|------------------|
| [GitHub Actions Deep Dive](./github-actions-deep-dive) | Workflows, matrix strategies, caching, OIDC, reusable workflows |
| [GitLab CI](./gitlab-ci) | Stages, jobs, pipelines, runners, DAG pipelines |
| [Pipeline Patterns](./pipeline-patterns) | Trunk-based development, monorepo strategies, parallel testing |
| [Artifact Management](./artifact-management) | Container registries, npm packages, versioning strategies |
| [Environment Promotion](./environment-promotion) | Dev to staging to production, GitOps, progressive delivery |
| [Security Scanning](./security-scanning) | SAST, DAST, dependency scanning, Trivy, supply chain security |

Each page builds on the fundamentals covered here. Start with GitHub Actions if you're new to CI/CD, or jump to Pipeline Patterns if you're optimizing existing workflows.
