---
title: "Security Scanning"
description: "SAST, DAST, dependency scanning, container scanning with Trivy, and supply chain security in CI/CD pipelines"
tags: [security-scanning, sast, dast, trivy, supply-chain, ci-cd]
difficulty: "advanced"
prerequisites: [ci-cd-overview, artifact-management]
lastReviewed: "2026-03-18"
---

# Security Scanning

## Why Security Scanning in CI/CD Exists

In 2017, Equifax suffered a data breach affecting 147 million people. The root cause: an unpatched Apache Struts vulnerability (CVE-2017-5638) that had a fix available for two months before the breach. A dependency scanner in the CI pipeline would have flagged this vulnerability on day one.

Security scanning in CI/CD — often called "shift left security" — moves vulnerability detection from production incident response to the development pipeline. Instead of discovering vulnerabilities after deployment (or after a breach), teams catch them before code ever reaches production.

### The Problem Landscape

```mermaid
graph TB
    subgraph "Attack Vectors"
        V1[Source Code Vulnerabilities<br/>SQL injection, XSS, SSRF]
        V2[Dependency Vulnerabilities<br/>Known CVEs in packages]
        V3[Container Vulnerabilities<br/>OS packages, base images]
        V4[Infrastructure Misconfiguration<br/>Open ports, weak IAM]
        V5[Secret Leakage<br/>API keys in code/history]
        V6[Supply Chain Attacks<br/>Compromised packages/actions]
    end

    subgraph "Scanning Tools"
        S1[SAST<br/>Static Analysis]
        S2[SCA<br/>Dependency Scanning]
        S3[Container Scanning<br/>Image Analysis]
        S4[IaC Scanning<br/>Terraform/K8s]
        S5[Secret Detection<br/>Pattern Matching]
        S6[SBOM + Attestation<br/>Supply Chain]
    end

    V1 --> S1
    V2 --> S2
    V3 --> S3
    V4 --> S4
    V5 --> S5
    V6 --> S6
```

### Cost of Late Detection

The cost of fixing a vulnerability increases exponentially the later it's found:

| Stage Found | Relative Cost | Example |
|-------------|--------------|---------|
| Development (IDE) | 1x | Developer fixes before commit |
| CI Pipeline | 5x | Build fails, developer investigates |
| Staging | 20x | Test environment compromised |
| Production (pre-exploit) | 50x | Emergency patch, coordinated deploy |
| Production (post-exploit) | 100-1000x | Breach response, legal, regulatory |

## First Principles

### Defense in Depth

No single scanning tool catches everything. A defense-in-depth strategy layers multiple scanners:

```mermaid
graph TB
    subgraph "Pre-Commit"
        PC1[IDE Security Plugin]
        PC2[Pre-commit Hooks]
        PC3[Secret Detection]
    end

    subgraph "CI Pipeline"
        CI1[SAST - Source Code]
        CI2[SCA - Dependencies]
        CI3[License Compliance]
        CI4[IaC Scanning]
    end

    subgraph "Build Phase"
        B1[Container Scanning]
        B2[SBOM Generation]
        B3[Image Signing]
    end

    subgraph "Deployment"
        D1[Admission Control]
        D2[Policy Enforcement]
    end

    subgraph "Runtime"
        R1[DAST]
        R2[Runtime Protection]
        R3[WAF]
    end

    PC1 --> CI1
    PC2 --> CI2
    PC3 --> CI3
    CI1 --> B1
    CI2 --> B2
    CI4 --> B3
    B1 --> D1
    B2 --> D2
    D1 --> R1
    D2 --> R2
```

### CVSS Scoring Model

The Common Vulnerability Scoring System (CVSS) provides a standardized severity rating:

$$
\text{CVSS Score} = \text{round}(\min([\text{Impact} + \text{Exploitability}], 10))
$$

Where Impact subscore depends on Confidentiality, Integrity, and Availability impact:

$$
\text{ISS} = 1 - [(1 - C) \times (1 - I) \times (1 - A)]
$$

$$
\text{Impact} = \begin{cases}
6.42 \times \text{ISS} & \text{if Scope Unchanged} \\
7.52 \times [\text{ISS} - 0.029] - 3.25 \times [\text{ISS} - 0.02]^{15} & \text{if Scope Changed}
\end{cases}
$$

| CVSS Range | Severity | CI/CD Action |
|-----------|----------|-------------|
| 0.0 | None | Informational |
| 0.1 - 3.9 | Low | Log, don't block |
| 4.0 - 6.9 | Medium | Warn, flag for review |
| 7.0 - 8.9 | High | Block merge without override |
| 9.0 - 10.0 | Critical | Block pipeline, alert security team |

### The SLSA Framework

Supply-chain Levels for Software Artifacts (SLSA, pronounced "salsa") defines four levels of supply chain security:

| Level | Requirements | Protects Against |
|-------|-------------|-----------------|
| SLSA 1 | Build process documented | Ad-hoc builds |
| SLSA 2 | Build service, signed provenance | Tampered builds |
| SLSA 3 | Hardened build platform, non-falsifiable provenance | Compromised build |
| SLSA 4 | Two-person review, hermetic builds | Insider threats |

## Core Mechanics

### SAST (Static Application Security Testing)

SAST analyzes source code without executing it, looking for patterns that indicate vulnerabilities:

```mermaid
graph LR
    SRC[Source Code] --> PARSE[AST Parser]
    PARSE --> TAINT[Taint Analysis]
    PARSE --> PATTERN[Pattern Matching]
    PARSE --> FLOW[Data Flow Analysis]

    TAINT --> RESULTS[Vulnerability Report]
    PATTERN --> RESULTS
    FLOW --> RESULTS

    RESULTS --> FILTER[False Positive Filter]
    FILTER --> REPORT[Actionable Report]
```

**Common SAST findings**:

| Vulnerability | CWE | Example |
|--------------|-----|---------|
| SQL Injection | CWE-89 | `query("SELECT * FROM users WHERE id = " + userId)` |
| XSS | CWE-79 | `innerHTML = userInput` |
| Path Traversal | CWE-22 | `readFile("/data/" + userPath)` |
| SSRF | CWE-918 | `fetch(userProvidedUrl)` |
| Hardcoded Secrets | CWE-798 | `const API_KEY = "sk-live-abc123"` |
| Insecure Deserialization | CWE-502 | `JSON.parse(untrustedData)` used unsafely |

**SAST tools by language**:

| Language | Tool | Integration | False Positive Rate |
|----------|------|-------------|-------------------|
| TypeScript/JS | Semgrep | CLI, CI | Low (~10%) |
| TypeScript/JS | ESLint Security | npm | Very Low (~5%) |
| Go | gosec | CLI, CI | Low (~15%) |
| Python | Bandit | CLI, CI | Medium (~20%) |
| Java | SpotBugs + FindSecBugs | Maven/Gradle | Medium (~25%) |
| Multi-language | SonarQube | Server + CI | Medium (~20%) |
| Multi-language | CodeQL | GitHub native | Low (~10%) |

### Semgrep Rules for TypeScript

```yaml
# .semgrep/custom-rules.yml
rules:
  - id: no-sql-injection
    patterns:
      - pattern: |
          $DB.query(`... ${$USER_INPUT} ...`)
      - pattern-not: |
          $DB.query(`... $${$PARAM} ...`, [$VALUES])
    message: |
      Possible SQL injection. Use parameterized queries instead.
    severity: ERROR
    languages: [typescript, javascript]
    metadata:
      cwe: "CWE-89"
      confidence: HIGH

  - id: no-ssrf
    patterns:
      - pattern: |
          fetch($URL)
      - pattern-where-python: |
          # URL comes from user input
          "req." in str(vars["$URL"]) or "params" in str(vars["$URL"])
    message: |
      Possible SSRF. Validate and allowlist URLs before fetching.
    severity: WARNING
    languages: [typescript, javascript]
    metadata:
      cwe: "CWE-918"

  - id: no-eval
    pattern: eval(...)
    message: |
      eval() is dangerous. Use safer alternatives.
    severity: ERROR
    languages: [typescript, javascript]
    metadata:
      cwe: "CWE-95"

  - id: no-hardcoded-jwt-secret
    patterns:
      - pattern: |
          jwt.sign($PAYLOAD, "...")
      - pattern: |
          jwt.verify($TOKEN, "...")
    message: |
      Hardcoded JWT secret. Use environment variable instead.
    severity: ERROR
    languages: [typescript, javascript]
    metadata:
      cwe: "CWE-798"
```

### SCA (Software Composition Analysis) / Dependency Scanning

SCA tools analyze your dependency tree against vulnerability databases:

```typescript
// scripts/dependency-audit.ts
import { execSync } from 'child_process';

interface Vulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  package: string;
  version: string;
  fixedIn: string | null;
  cwe: string[];
  cvss: number;
  description: string;
  exploitable: boolean;
}

interface AuditResult {
  vulnerabilities: Vulnerability[];
  totalDependencies: number;
  directDependencies: number;
  transitiveDepth: number;
}

interface PolicyDecision {
  action: 'pass' | 'warn' | 'fail';
  reason: string;
  vulnerabilities: Vulnerability[];
}

function evaluatePolicy(audit: AuditResult): PolicyDecision {
  const critical = audit.vulnerabilities.filter(v => v.severity === 'critical');
  const high = audit.vulnerabilities.filter(v => v.severity === 'high');
  const exploitable = audit.vulnerabilities.filter(v => v.exploitable);

  // Policy: Block on critical or exploitable high
  if (critical.length > 0) {
    return {
      action: 'fail',
      reason: `${critical.length} critical vulnerabilities found`,
      vulnerabilities: critical,
    };
  }

  if (exploitable.filter(v => v.severity === 'high').length > 0) {
    return {
      action: 'fail',
      reason: `${exploitable.length} exploitable high-severity vulnerabilities`,
      vulnerabilities: exploitable,
    };
  }

  // Warn on high vulnerabilities with available fixes
  const fixableHigh = high.filter(v => v.fixedIn !== null);
  if (fixableHigh.length > 0) {
    return {
      action: 'warn',
      reason: `${fixableHigh.length} high vulnerabilities with available fixes`,
      vulnerabilities: fixableHigh,
    };
  }

  return {
    action: 'pass',
    reason: 'No policy violations',
    vulnerabilities: [],
  };
}

// Transitive dependency risk analysis
function analyzeDependencyRisk(audit: AuditResult): {
  riskScore: number;
  factors: string[];
} {
  const factors: string[] = [];
  let riskScore = 0;

  // Deep dependency chains increase risk
  if (audit.transitiveDepth > 10) {
    riskScore += 20;
    factors.push(`Deep dependency chain (${audit.transitiveDepth} levels)`);
  }

  // High ratio of transitive to direct deps
  const ratio = audit.totalDependencies / audit.directDependencies;
  if (ratio > 20) {
    riskScore += 15;
    factors.push(`High transitive ratio (${ratio.toFixed(1)}x)`);
  }

  // Vulnerability density
  const vulnDensity = audit.vulnerabilities.length / audit.totalDependencies;
  if (vulnDensity > 0.05) {
    riskScore += 25;
    factors.push(`High vulnerability density (${(vulnDensity * 100).toFixed(1)}%)`);
  }

  // Any critical or exploitable vulnerabilities
  const criticalCount = audit.vulnerabilities.filter(
    v => v.severity === 'critical' || v.exploitable
  ).length;
  riskScore += criticalCount * 10;

  return { riskScore: Math.min(riskScore, 100), factors };
}
```

### Container Scanning with Trivy

Trivy is the de facto standard for container vulnerability scanning:

```yaml
# .github/workflows/container-scan.yml
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t myapp:scan .

      # Comprehensive Trivy scan
      - name: Scan image vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'myapp:scan'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

      # Scan for secrets in image
      - name: Scan for secrets
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'myapp:scan'
          scanners: 'secret'
          severity: 'CRITICAL,HIGH,MEDIUM'
          exit-code: '1'

      # Scan for misconfigurations
      - name: Scan Dockerfile
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'config'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

      # Scan filesystem (IaC files)
      - name: Scan IaC
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: 'infrastructure/'
          scanners: 'misconfig'
          severity: 'CRITICAL,HIGH'

      # Upload to GitHub Security tab
      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'
```

**Trivy configuration for production**:

```yaml
# trivy.yaml
severity:
  - CRITICAL
  - HIGH

vulnerability:
  type:
    - os
    - library

ignorefile: .trivyignore
cache-dir: /tmp/trivy-cache

# Ignore unfixed vulnerabilities (no patch available)
ignore-unfixed: false

# Custom policy
misconfig:
  policy-namespaces:
    - custom

  scanners:
    - dockerfile
    - kubernetes
    - terraform

# DB update settings
db:
  skip-update: false
  java-db-update: true
```

```
# .trivyignore — Accepted risks with justification
# CVE-2023-xxxxx — No patch available, mitigated by WAF rules (expires: 2026-04-01)
CVE-2023-xxxxx

# CVE-2023-yyyyy — Only exploitable in configurations we don't use
CVE-2023-yyyyy
```

### DAST (Dynamic Application Security Testing)

DAST tests the running application by sending crafted requests:

```yaml
# .github/workflows/dast.yml
jobs:
  dast:
    runs-on: ubuntu-latest
    services:
      app:
        image: myapp:latest
        ports: ['3000:3000']
        env:
          DATABASE_URL: postgresql://test:test@postgres:5432/test
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
    steps:
      - uses: actions/checkout@v4

      - name: Wait for application
        run: |
          for i in $(seq 1 30); do
            curl -s http://localhost:3000/health && exit 0
            sleep 2
          done
          exit 1

      # OWASP ZAP baseline scan
      - name: ZAP Baseline Scan
        uses: zaproxy/action-baseline@v0.12.0
        with:
          target: 'http://localhost:3000'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a -j'

      # Nuclei vulnerability scanner
      - name: Nuclei Scan
        run: |
          docker run --network host projectdiscovery/nuclei:latest \
            -u http://localhost:3000 \
            -severity critical,high \
            -json -o nuclei-results.json

      - name: Upload results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: dast-results
          path: |
            nuclei-results.json
            zap-report.html
```

### Secret Detection

```yaml
# .github/workflows/secret-scan.yml
jobs:
  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for git-secrets

      # Gitleaks — scan git history
      - name: Gitleaks scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # TruffleHog — deep scan
      - name: TruffleHog scan
        run: |
          docker run --rm -v "$PWD:/repo" \
            trufflesecurity/trufflehog:latest \
            filesystem /repo \
            --json \
            --only-verified \
            > trufflehog-results.json

          if [ -s trufflehog-results.json ]; then
            echo "VERIFIED SECRETS FOUND!"
            cat trufflehog-results.json | jq '.SourceMetadata'
            exit 1
          fi
```

**Custom Gitleaks configuration**:

```toml
# .gitleaks.toml
title = "Custom Gitleaks Config"

[extend]
useDefault = true

[[rules]]
id = "custom-internal-api-key"
description = "Internal API Key Pattern"
regex = '''myorg-api-[a-zA-Z0-9]{32}'''
secretGroup = 0
entropy = 3.5

[[rules]]
id = "custom-jwt-secret"
description = "JWT Secret in config"
regex = '''(?i)jwt[_-]?secret\s*[=:]\s*['"]([^'"]{16,})['"]'''
secretGroup = 1

[allowlist]
description = "Allow test fixtures and documentation"
paths = [
  '''test/fixtures/''',
  '''docs/''',
  '''.*_test\.go$''',
  '''.*\.test\.ts$''',
]
```

## Implementation: Unified Security Pipeline

```yaml
# .github/workflows/security.yml
name: Security Pipeline

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday scan

permissions:
  security-events: write
  contents: read

jobs:
  # Secret detection (fastest, run first)
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # SAST — Source code analysis
  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/typescript
            p/javascript
            p/owasp-top-ten
            p/xss
            p/sql-injection
            .semgrep/

      - name: CodeQL Analysis
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript

      - name: CodeQL Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:javascript-typescript"

  # Dependency scanning
  dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: npm audit
        run: |
          npm audit --audit-level=high --json > npm-audit.json || true
          CRITICAL=$(jq '.metadata.vulnerabilities.critical // 0' npm-audit.json)
          HIGH=$(jq '.metadata.vulnerabilities.high // 0' npm-audit.json)
          echo "Critical: $CRITICAL, High: $HIGH"
          if [ "$CRITICAL" -gt 0 ]; then
            echo "Critical vulnerabilities found!"
            exit 1
          fi

      - name: Trivy filesystem scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          severity: 'CRITICAL,HIGH'
          format: 'sarif'
          output: 'trivy-fs.sarif'

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-fs.sarif'
          category: 'dependency-scan'

  # IaC scanning
  iac:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Trivy IaC scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'config'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-iac.sarif'

      - name: Checkov IaC scan
        uses: bridgecrewio/checkov-action@master
        with:
          directory: infrastructure/
          framework: terraform,kubernetes
          output_format: sarif
          output_file_path: checkov-results.sarif
          quiet: true
          soft_fail: false

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-iac.sarif'
          category: 'iac-scan'

  # Container scanning (only on main or when Dockerfile changes)
  container:
    runs-on: ubuntu-latest
    if: >
      github.ref == 'refs/heads/main' ||
      contains(github.event.pull_request.changed_files, 'Dockerfile')
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t myapp:scan .

      - name: Trivy container scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'myapp:scan'
          format: 'sarif'
          output: 'trivy-container.sarif'
          severity: 'CRITICAL,HIGH'

      - name: Grype container scan
        uses: anchore/scan-action@v3
        with:
          image: 'myapp:scan'
          severity-cutoff: high
          output-format: sarif
          fail-build: true

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-container.sarif'
          category: 'container-scan'

  # License compliance
  licenses:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci

      - name: Check licenses
        run: |
          npx license-checker --production --json --out licenses.json

          # Check for copyleft licenses
          COPYLEFT=$(jq -r 'to_entries[] | select(.value.licenses | test("GPL|AGPL|SSPL"; "i")) | .key' licenses.json)
          if [ -n "$COPYLEFT" ]; then
            echo "Copyleft licenses detected:"
            echo "$COPYLEFT"
            exit 1
          fi

  # Security report aggregation
  report:
    needs: [secrets, sast, dependencies, iac, container, licenses]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Security summary
        run: |
          echo "## Security Scan Results" >> "$GITHUB_STEP_SUMMARY"
          echo "| Scanner | Status |" >> "$GITHUB_STEP_SUMMARY"
          echo "|---------|--------|" >> "$GITHUB_STEP_SUMMARY"
          echo "| Secrets | ${{ needs.secrets.result }} |" >> "$GITHUB_STEP_SUMMARY"
          echo "| SAST | ${{ needs.sast.result }} |" >> "$GITHUB_STEP_SUMMARY"
          echo "| Dependencies | ${{ needs.dependencies.result }} |" >> "$GITHUB_STEP_SUMMARY"
          echo "| IaC | ${{ needs.iac.result }} |" >> "$GITHUB_STEP_SUMMARY"
          echo "| Container | ${{ needs.container.result }} |" >> "$GITHUB_STEP_SUMMARY"
          echo "| Licenses | ${{ needs.licenses.result }} |" >> "$GITHUB_STEP_SUMMARY"
```

## Edge Cases & Failure Modes

### False Positive Management

| Scanner Type | Typical FP Rate | Mitigation |
|-------------|----------------|------------|
| SAST | 15-30% | Custom rules, inline suppressions |
| SCA | 10-20% | Reachability analysis, VEX |
| Container | 5-10% | .trivyignore, base image selection |
| Secret detection | 20-40% | Allowlists, entropy thresholds |
| IaC scanning | 10-20% | Custom policies, skip rules |

**Vulnerability Exploitability eXchange (VEX)** lets you declare that a detected vulnerability is not exploitable in your context:

```json
{
  "@context": "https://openvex.dev/ns",
  "@id": "https://myorg.com/vex/2024-001",
  "author": "security@myorg.com",
  "timestamp": "2026-03-18T00:00:00Z",
  "statements": [
    {
      "vulnerability": "CVE-2024-12345",
      "products": ["pkg:docker/myorg/myapp@sha256:abc123"],
      "status": "not_affected",
      "justification": "vulnerable_code_not_in_execute_path",
      "impact_statement": "The affected function is in a module we don't import"
    }
  ]
}
```

### Scanner Comparison Matrix

| Capability | Trivy | Grype | Snyk | SonarQube | Semgrep |
|-----------|-------|-------|------|-----------|---------|
| Container scanning | Yes | Yes | Yes | No | No |
| Filesystem scanning | Yes | Yes | Yes | No | No |
| IaC scanning | Yes | No | Yes (partial) | No | Yes |
| Secret detection | Yes | No | No | No | Yes |
| SAST | No | No | Yes | Yes | Yes |
| License checking | Yes | No | Yes | No | No |
| SBOM generation | Yes | Yes | No | No | No |
| Cost | Free | Free | Free/Paid | Free/Paid | Free/Paid |
| CI integration | Excellent | Good | Excellent | Good | Excellent |

## Performance Characteristics

### Scanner Benchmarks

| Scanner | Scan Type | Time (Small App) | Time (Large App) | Memory Usage |
|---------|-----------|------------------|-------------------|-------------|
| Trivy (container) | Image | 15-30s | 60-120s | 200-500 MB |
| Trivy (filesystem) | Dependencies | 5-10s | 20-40s | 100-200 MB |
| Grype (container) | Image | 20-40s | 90-180s | 300-600 MB |
| Semgrep | SAST | 10-30s | 60-300s | 200-800 MB |
| CodeQL | SAST | 120-300s | 600-1800s | 2-8 GB |
| Gitleaks | Secrets | 5-15s | 30-120s | 50-200 MB |
| npm audit | Dependencies | 3-10s | 10-30s | 100 MB |
| Checkov | IaC | 10-20s | 30-60s | 200-400 MB |

### Optimization Strategies

$$
T_{\text{security}} = \max(T_{\text{sast}}, T_{\text{sca}}, T_{\text{container}}, T_{\text{iac}})
$$

Running scanners in parallel reduces total time to the slowest scanner. For a pipeline with SAST (60s), SCA (15s), Container (45s), and IaC (20s):

- Sequential: $60 + 15 + 45 + 20 = 140$ seconds
- Parallel: $\max(60, 15, 45, 20) = 60$ seconds (57% reduction)

**Trivy DB caching**:

```yaml
# Cache Trivy vulnerability DB
- uses: actions/cache@v4
  with:
    path: /tmp/trivy-cache
    key: trivy-db-${{ github.run_id }}
    restore-keys: trivy-db-

- name: Scan with cached DB
  env:
    TRIVY_CACHE_DIR: /tmp/trivy-cache
  run: trivy image --severity CRITICAL,HIGH myapp:scan
```

## Mathematical Foundations

### Vulnerability Risk Scoring

A more nuanced risk score considers exploitability, asset value, and existing mitigations:

$$
R = \frac{\text{CVSS} \times E \times A}{M}
$$

Where:
- CVSS = base vulnerability score (0-10)
- $E$ = exploitability factor (0-1): is there a public exploit?
- $A$ = asset value factor (1-5): how critical is the affected system?
- $M$ = mitigation factor (1-5): are there compensating controls?

| Factor | Value 1 | Value 3 | Value 5 |
|--------|---------|---------|---------|
| Exploitability | No known exploit | PoC available | Active exploitation |
| Asset Value | Internal tool | Business app | Payment system |
| Mitigation | WAF + network isolation | Partial controls | No mitigations |

For a CVSS 9.0 vulnerability with active exploitation ($E=1.0$), in a payment system ($A=5$), with no mitigations ($M=1$):

$$
R = \frac{9.0 \times 1.0 \times 5}{1} = 45 \text{ (Critical — immediate action)}
$$

### False Positive Probability

With $n$ independent scanners each having false positive rate $f_i$, the combined false positive rate for a finding flagged by all scanners is:

$$
F_{\text{combined}} = \prod_{i=1}^{n} f_i
$$

If Trivy, Grype, and Snyk each have a 10% false positive rate, a finding flagged by all three has only $0.1^3 = 0.1\%$ false positive probability. This is why running multiple scanners improves signal quality.

## Real-World War Stories

::: info War Story — The Log4Shell Emergency (CVE-2021-44228)
On December 9, 2021, a critical remote code execution vulnerability in Apache Log4j 2 (Log4Shell, CVSS 10.0) was publicly disclosed. It affected virtually every Java application on earth. Organizations with automated dependency scanning in their CI pipelines identified affected services within hours. Those without it spent weeks manually auditing codebases.

**Timeline at a well-prepared organization**:
- Hour 0: CVE published
- Hour 1: Trivy DB updated with CVE
- Hour 2: All CI pipelines flagged affected services (12 out of 45 microservices)
- Hour 4: Patches applied to all 12 services, deployed through standard promotion pipeline
- Hour 6: All production services patched

**Timeline at an unprepared organization**:
- Day 0: CVE published
- Day 1: Security team begins manual audit
- Day 3: First services identified as affected
- Day 5: First patches deployed (manually, with errors)
- Day 14: All services patched (they hoped)
- Day 30: Found three more affected services they'd missed

**Lesson**: Automated dependency scanning isn't overhead — it's your first line of defense when the next Log4Shell drops.
:::

::: info War Story — The Secret in the Docker Layer
A startup engineer committed an AWS access key in their application config, then "fixed" it in the next commit by replacing it with an environment variable reference. The Dockerfile copied the entire application directory including the git history. An attacker pulled the public image, extracted the layers, and found the key in a previous layer's filesystem diff.

**Root cause**: The `.git` directory was included in the Docker build context and embedded in a layer.

**Triple failure**:
1. No `.dockerignore` excluding `.git`
2. No pre-commit hook for secret detection
3. No container scanning in CI

**Fix**: Added `.dockerignore` (excluding `.git`, `.env`, `node_modules`), Gitleaks pre-commit hook, Trivy container scanning with secret scanning enabled, and rotated all compromised credentials.
:::

## Decision Framework

### Minimum Viable Security Pipeline

For teams just starting with security scanning:

| Priority | Tool | What It Catches | Effort |
|----------|------|----------------|--------|
| 1 | Gitleaks (pre-commit) | Secrets before they enter history | 5 min setup |
| 2 | npm audit / Trivy fs | Known dependency CVEs | 5 min setup |
| 3 | Trivy container | OS + library vulnerabilities | 10 min setup |
| 4 | Semgrep | Code-level vulnerabilities | 15 min setup |
| 5 | Checkov | IaC misconfigurations | 15 min setup |
| 6 | DAST (ZAP) | Runtime vulnerabilities | 30 min setup |

### When to Block vs. Warn

```mermaid
graph TD
    A{Vulnerability Found} --> B{Severity?}

    B -->|Critical| C{Fix Available?}
    B -->|High| D{Exploitable?}
    B -->|Medium| E[Warn, Track]
    B -->|Low| F[Log Only]

    C -->|Yes| G[BLOCK - Fix Required]
    C -->|No| H{Mitigations?}

    D -->|Yes| G
    D -->|No| I{Fix Available?}

    H -->|WAF/Network| J[Warn + Timeline]
    H -->|None| K[BLOCK - Mitigate or Accept]

    I -->|Yes| L[Warn - Fix in 7 days]
    I -->|No| J

    style G fill:#ffcdd2
    style K fill:#ffcdd2
    style J fill:#fff9c4
    style L fill:#fff9c4
    style E fill:#fff9c4
    style F fill:#c8e6c9
```

## Advanced Topics

### Kubernetes Admission Control

Enforce security policies at deployment time:

```yaml
# Kyverno policy — block unscanned images
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-image-scan
spec:
  validationFailureAction: enforce
  background: true
  rules:
    - name: check-trivy-scan
      match:
        any:
          - resources:
              kinds:
                - Pod
      verifyImages:
        - imageReferences:
            - "ghcr.io/myorg/*"
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/myorg/*"
                    issuer: "https://token.actions.githubusercontent.com"
          attestations:
            - type: https://trivy.dev/scan/v1
              conditions:
                all:
                  - key: "criticalCount"
                    operator: Equals
                    value: "0"
                  - key: "highCount"
                    operator: LessThanOrEquals
                    value: "5"
```

### SBOM-Driven Vulnerability Management

```typescript
// scripts/sbom-monitor.ts — Continuous SBOM monitoring
interface SBOMPackage {
  name: string;
  version: string;
  purl: string;  // Package URL
  licenses: string[];
  supplier: string;
}

interface VulnerabilityAlert {
  cve: string;
  package: string;
  severity: string;
  affectedVersions: string;
  fixedVersion: string | null;
  publishedDate: Date;
}

class SBOMMonitor {
  // Continuously monitor SBOMs against new CVEs
  async checkForNewVulnerabilities(
    sbom: SBOMPackage[]
  ): Promise<VulnerabilityAlert[]> {
    const alerts: VulnerabilityAlert[] = [];

    for (const pkg of sbom) {
      // Query OSV (Open Source Vulnerabilities) database
      const response = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package: { purl: pkg.purl },
        }),
      });

      const data = await response.json() as { vulns?: Array<{
        id: string;
        severity: Array<{ type: string; score: string }>;
        affected: Array<{ ranges: Array<{ events: Array<{ fixed?: string }> }> }>;
        published: string;
      }> };

      for (const vuln of data.vulns ?? []) {
        alerts.push({
          cve: vuln.id,
          package: pkg.name,
          severity: vuln.severity?.[0]?.score ?? 'unknown',
          affectedVersions: pkg.version,
          fixedVersion: vuln.affected?.[0]?.ranges?.[0]?.events
            ?.find(e => e.fixed)?.fixed ?? null,
          publishedDate: new Date(vuln.published),
        });
      }
    }

    return alerts;
  }
}
```

### Zero-Trust CI/CD Pipeline

```mermaid
graph TB
    subgraph "Zero-Trust Principles"
        ZT1[Never trust, always verify]
        ZT2[Least privilege access]
        ZT3[Assume breach]
    end

    subgraph "Implementation"
        I1[OIDC - No stored secrets]
        I2[Ephemeral runners - No persistence]
        I3[Signed artifacts - Verify provenance]
        I4[Network isolation - No lateral movement]
        I5[Minimal permissions - Scoped tokens]
        I6[Audit everything - Immutable logs]
    end

    ZT1 --> I1
    ZT1 --> I3
    ZT2 --> I2
    ZT2 --> I5
    ZT3 --> I4
    ZT3 --> I6
```

Security scanning is not a checkbox — it's a continuous discipline. The tools and patterns described here form the foundation of a secure software supply chain, complementing the [CI/CD Overview](./index.md) principles and the [Artifact Management](./artifact-management) practices that ensure your build outputs are trustworthy.
