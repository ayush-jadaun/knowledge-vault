---
title: "A06: Vulnerable and Outdated Components"
description: Managing vulnerable dependencies with npm audit, Snyk, Dependabot, SCA tools, SBOM generation, lock file security, supply chain attacks, and typosquatting defense
tags: [security, owasp, dependencies, npm-audit, snyk, dependabot, sbom, supply-chain]
difficulty: intermediate
prerequisites:
  - owasp/index
  - Node.js and npm familiarity
  - CI/CD pipeline concepts
lastReviewed: "2026-03-17"
---

# A06: Vulnerable and Outdated Components

Applications commonly use third-party libraries and frameworks. If a component with a known vulnerability is used, it can be exploited to cause serious data loss or server takeover. The average Node.js application has hundreds of transitive dependencies, and any one of them can introduce a vulnerability into your application.

## The Scale of the Problem

The npm registry contains over 2 million packages. A typical Node.js application has 200-1,000+ transitive dependencies. Research consistently shows that 70-80% of application code comes from third-party packages.

### Real-World Supply Chain Incidents

| Year | Incident | Impact |
|------|----------|--------|
| 2021 | Log4Shell (Log4j CVE-2021-44228) | RCE in millions of Java applications |
| 2021 | ua-parser-js hijacked | Cryptominer and password stealer injected |
| 2021 | coa and rc packages hijacked | Malware injected into popular packages |
| 2022 | node-ipc protest-ware | Destructive code targeting Russian/Belarusian IPs |
| 2022 | colors and faker sabotaged | Maintainer intentionally broke widely-used packages |
| 2023 | Ledger Connect Kit compromised | Cryptocurrency theft via compromised npm package |

---

## 1. Dependency Scanning with npm audit

npm includes a built-in security audit tool that checks your dependency tree against the GitHub Advisory Database.

### Running npm audit

```bash
# Check for known vulnerabilities
npm audit

# Get output as JSON for CI/CD integration
npm audit --json

# Only show vulnerabilities at or above a severity level
npm audit --audit-level=high

# Automatically fix vulnerabilities where possible
npm audit fix

# Force major version updates (may break things)
npm audit fix --force

# Check production dependencies only
npm audit --omit=dev
```

### Interpreting npm audit Output

```
┌──────────────────────────────────────────────────────────┐
│                       Manual Review                       │
│            Is this vulnerability applicable?              │
├───────────────────┬──────────────────────────────────────┤
│ High              │ Prototype Pollution in lodash         │
├───────────────────┼──────────────────────────────────────┤
│ Package           │ lodash                               │
├───────────────────┼──────────────────────────────────────┤
│ Patched in        │ >=4.17.21                            │
├───────────────────┼──────────────────────────────────────┤
│ Dependency of     │ my-app                               │
├───────────────────┼──────────────────────────────────────┤
│ Path              │ my-app > some-lib > lodash           │
├───────────────────┼──────────────────────────────────────┤
│ More info         │ https://github.com/advisories/GHSA...│
└───────────────────┴──────────────────────────────────────┘
```

### CI/CD Integration

```yaml
# GitHub Actions workflow
name: Security Audit
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6 AM

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run npm audit
        run: npm audit --audit-level=high

      - name: Check for outdated packages
        run: npm outdated || true  # Don't fail on outdated (informational)
```

---

## 2. Snyk

Snyk provides deeper vulnerability scanning, including vulnerabilities in container images, infrastructure as code, and custom fix PRs.

### CLI Usage

```bash
# Install Snyk CLI
npm install -g snyk

# Authenticate
snyk auth

# Test for vulnerabilities
snyk test

# Monitor project (continuous monitoring)
snyk monitor

# Test a specific package
snyk test lodash@4.17.20

# Test a Docker image
snyk container test node:18-alpine

# Infrastructure as Code scanning
snyk iac test kubernetes.yaml

# Get detailed vulnerability information
snyk test --json | jq '.vulnerabilities[] | {title, severity, packageName, version}'
```

### Snyk Configuration (.snyk)

```yaml
# .snyk policy file — manage exceptions
version: v1.25.0
ignore:
  'SNYK-JS-MINIMIST-2429795':
    - '*':
        reason: 'Not exploitable in our usage — minimist is only used in build scripts'
        expires: '2026-06-17T00:00:00.000Z'
        created: '2026-03-17T00:00:00.000Z'
patch: {}
```

### CI/CD Integration

```yaml
# GitHub Actions with Snyk
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${​{ secrets.SNYK_TOKEN }​}
        with:
          args: --severity-threshold=high

      - name: Run Snyk to check Docker image
        uses: snyk/actions/docker@master
        env:
          SNYK_TOKEN: ${​{ secrets.SNYK_TOKEN }​}
        with:
          image: my-app:latest
          args: --severity-threshold=high
```

---

## 3. GitHub Dependabot

Dependabot automatically creates pull requests to update vulnerable dependencies.

### Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  # npm dependencies
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "06:00"
      timezone: "UTC"
    open-pull-requests-limit: 10
    reviewers:
      - "security-team"
    labels:
      - "dependencies"
      - "security"
    # Group minor and patch updates to reduce PR noise
    groups:
      production-dependencies:
        dependency-type: "production"
        update-types:
          - "minor"
          - "patch"
      development-dependencies:
        dependency-type: "development"
        update-types:
          - "minor"
          - "patch"
    # Ignore specific packages or versions
    ignore:
      - dependency-name: "aws-sdk"
        versions: [">=3.0.0"]  # Stay on v2 for now
    # Security updates only (no version updates)
    # Uncomment the following to only get security updates:
    # versioning-strategy: increase

  # GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "ci"

  # Docker
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "docker"
```

### Dependabot Security Alerts

```yaml
# .github/workflows/dependabot-auto-merge.yml
name: Dependabot Auto-Merge
on: pull_request

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    steps:
      - name: Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: "${​{ secrets.GITHUB_TOKEN }​}"

      - name: Auto-merge patch updates
        if: steps.metadata.outputs.update-type == 'version-update:semver-patch'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${​{ github.event.pull_request.html_url }​}
          GH_TOKEN: ${​{ secrets.GITHUB_TOKEN }​}
```

---

## 4. Software Composition Analysis (SCA) Tools

SCA tools go beyond simple vulnerability scanning to provide comprehensive dependency analysis.

### Comparison of SCA Tools

| Tool | License | Features |
|------|---------|----------|
| npm audit | Free (built-in) | Basic vuln scanning |
| Snyk | Freemium | Vuln scanning, fix PRs, container/IaC |
| Socket.dev | Freemium | Supply chain attack detection, behavior analysis |
| Mend (WhiteSource) | Commercial | License compliance, vuln management |
| Sonatype Nexus | Commercial | Repository management, policy enforcement |
| OWASP Dependency-Check | Free (OSS) | Multi-language, CVSS scoring |
| Trivy | Free (OSS) | Containers, filesystems, repos |

### Using Socket.dev for Supply Chain Protection

Socket.dev detects supply chain attacks by analyzing package behavior rather than just known vulnerabilities:

```bash
# Install Socket CLI
npm install -g @socketsecurity/cli

# Analyze a project
socket report create .

# Check a specific package before installing
socket npm info suspicious-package

# Integrate with npm to scan before install
socket npm install new-dependency
```

### Using Trivy for Container Scanning

```bash
# Scan a Docker image
trivy image my-app:latest

# Scan with severity filter
trivy image --severity HIGH,CRITICAL my-app:latest

# Scan a filesystem
trivy fs --scanners vuln,secret,misconfig .

# Generate SBOM
trivy image --format spdx-json --output sbom.json my-app:latest
```

---

## 5. Software Bill of Materials (SBOM)

An SBOM is a formal, machine-readable inventory of software components and their relationships. It is increasingly required by regulations (US Executive Order 14028) and enterprise procurement.

### Generating SBOM

```bash
# Using CycloneDX (npm)
npx @cyclonedx/cyclonedx-npm --output-file sbom.json

# Using CycloneDX with specific format
npx @cyclonedx/cyclonedx-npm --output-format XML --output-file sbom.xml

# Using SPDX
npx spdx-sbom-generator -o sbom-spdx.json

# Using Syft (supports multiple formats)
syft . -o spdx-json > sbom-spdx.json
syft . -o cyclonedx-json > sbom-cdx.json
```

### SBOM Structure (CycloneDX)

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.5",
  "serialNumber": "urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79",
  "version": 1,
  "metadata": {
    "timestamp": "2026-03-17T00:00:00Z",
    "tools": [{ "name": "cyclonedx-npm", "version": "1.16.0" }],
    "component": {
      "type": "application",
      "name": "my-app",
      "version": "1.0.0"
    }
  },
  "components": [
    {
      "type": "library",
      "name": "express",
      "version": "4.18.2",
      "purl": "pkg:npm/express@4.18.2",
      "licenses": [{ "license": { "id": "MIT" } }],
      "hashes": [
        {
          "alg": "SHA-256",
          "content": "abc123..."
        }
      ]
    }
  ],
  "dependencies": [
    {
      "ref": "pkg:npm/my-app@1.0.0",
      "dependsOn": ["pkg:npm/express@4.18.2"]
    }
  ]
}
```

### CI/CD SBOM Generation

```yaml
# Generate and store SBOM on every release
jobs:
  sbom:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate SBOM
        run: npx @cyclonedx/cyclonedx-npm --output-file sbom.json

      - name: Upload SBOM as artifact
        uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: sbom.json

      - name: Scan SBOM for vulnerabilities
        run: |
          trivy sbom sbom.json --severity HIGH,CRITICAL
```

---

## 6. Lock File Security

Lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) pin exact dependency versions and integrity hashes. They are critical for reproducible and secure builds.

### Lock File Best Practices

```bash
# Always commit lock files to version control
# NEVER add package-lock.json to .gitignore

# Use npm ci instead of npm install in CI/CD
# npm ci:
#   - Requires package-lock.json to exist
#   - Installs exact versions from lock file
#   - Fails if package.json and lock file are out of sync
#   - Deletes node_modules before installing (clean state)
npm ci

# Verify lock file integrity
npm audit signatures
```

### Lock File Integrity Verification

```typescript
// Script to verify that package-lock.json hasn't been tampered with
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

interface PackageLock {
  lockfileVersion: number;
  packages: Record<string, {
    version: string;
    resolved: string;
    integrity: string;
  }>;
}

function verifyLockFile(lockFilePath: string): void {
  const lockFile: PackageLock = JSON.parse(
    readFileSync(lockFilePath, 'utf-8')
  );

  const issues: string[] = [];

  for (const [name, pkg] of Object.entries(lockFile.packages)) {
    if (!name) continue; // Skip root package

    // Check that resolved URL points to the official npm registry
    if (pkg.resolved && !pkg.resolved.startsWith('https://registry.npmjs.org/')) {
      issues.push(`${name}: resolved to non-npm registry: ${pkg.resolved}`);
    }

    // Check that integrity hash exists
    if (!pkg.integrity) {
      issues.push(`${name}: missing integrity hash`);
    }

    // Check that integrity uses SHA-512
    if (pkg.integrity && !pkg.integrity.startsWith('sha512-')) {
      issues.push(`${name}: weak integrity algorithm (not SHA-512)`);
    }
  }

  if (issues.length > 0) {
    console.error('Lock file verification failed:');
    issues.forEach(issue => console.error(`  - ${issue}`));
    process.exit(1);
  }

  console.log('Lock file verification passed');
}
```

---

## 7. Supply Chain Attacks

Supply chain attacks target the software development and delivery process rather than the application itself. They are particularly effective because they exploit trust relationships between developers and their tools/dependencies.

### Attack Vectors

**Compromised Maintainer Accounts:**
- Attacker gains access to a maintainer's npm account (credential stuffing, phishing)
- Publishes a malicious version of a popular package
- All downstream consumers receive the malicious code on next install

**Typosquatting:**
- Attacker publishes packages with names similar to popular packages
- Examples: `lodahs` (lodash), `crossenv` (cross-env), `electorn` (electron)
- Developers accidentally install the malicious package

**Dependency Confusion:**
- Attacker publishes a public package with the same name as an internal/private package
- Package managers may prioritize the public registry over the private one
- The malicious public package gets installed instead of the internal one

**Build Tool Compromise:**
- Attacker compromises a build tool (webpack plugin, babel plugin, etc.)
- Malicious code runs during the build process
- The built artifact contains injected code

### Defense Against Typosquatting

```typescript
// Pre-install script to check for typosquatting
// .npmrc configuration
// Add to your project's .npmrc:
// ignore-scripts=true    # Prevent post-install scripts from running

// Script to check package names before installation
const POPULAR_PACKAGES = new Map([
  ['lodash', true],
  ['express', true],
  ['react', true],
  ['typescript', true],
  // ... add your known-good packages
]);

function checkForTyposquat(packageName: string): boolean {
  // Levenshtein distance check against known packages
  for (const [knownPkg] of POPULAR_PACKAGES) {
    if (packageName === knownPkg) continue;

    const distance = levenshteinDistance(packageName, knownPkg);
    if (distance <= 2 && distance > 0) {
      console.warn(
        `WARNING: "${packageName}" is similar to "${knownPkg}" ` +
        `(Levenshtein distance: ${distance}). Possible typosquatting.`
      );
      return true;
    }
  }
  return false;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        matrix[i][j] = j;
      } else {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
  }
  return matrix[a.length][b.length];
}
```

### Defense Against Dependency Confusion

```bash
# .npmrc — scope packages to your private registry
@mycompany:registry=https://npm.mycompany.com/
registry=https://registry.npmjs.org/

# Always scope internal packages
# Use: @mycompany/utils instead of mycompany-utils

# Pre-install check for dependency confusion
# Verify that packages resolved from the public registry
# are not also defined in your private registry
```

### Package Pinning and Verification

```json
// package.json — pin exact versions (no ranges)
{
  "dependencies": {
    "express": "4.18.2",
    "lodash": "4.17.21",
    "pg": "8.11.3"
  }
}
```

```bash
# Verify npm package signatures (npm v8.15.0+)
npm audit signatures

# Use npm provenance to verify package origin
# Packages built with GitHub Actions can include provenance
# Check: npm view <package> --json | jq '.dist.attestations'
```

### Secure .npmrc Configuration

```ini
# .npmrc

# Use exact versions by default
save-exact=true

# Disable lifecycle scripts from dependencies
ignore-scripts=true

# Verify package integrity
# (npm verifies integrity by default, but be explicit)
package-lock=true

# Use the official npm registry
registry=https://registry.npmjs.org/

# Enable 2FA for publishing
//registry.npmjs.org/:_authToken=${NPM_TOKEN}

# Scope internal packages
@mycompany:registry=https://npm.mycompany.com/

# Audit settings
audit=true
audit-level=moderate
```

---

## Dependency Management Strategy

### Update Policy

| Update Type | Frequency | Process |
|-------------|-----------|---------|
| Security patches | Immediately | Auto-merge after tests pass |
| Bug fix (patch) | Weekly | Review changelog, auto-merge after tests |
| Minor version | Monthly | Review changelog, manual review |
| Major version | Quarterly | Full testing, migration guide review |

### Dependency Evaluation Checklist

Before adding a new dependency, evaluate it against these criteria:

- [ ] **Popularity**: Does it have significant downloads and GitHub stars?
- [ ] **Maintenance**: Has it been updated in the last 6 months?
- [ ] **Security history**: Check for past vulnerabilities (Snyk, npm audit)
- [ ] **License**: Is the license compatible with your project?
- [ ] **Size**: How much does it add to your bundle? Can you use a lighter alternative?
- [ ] **Transitive dependencies**: How many additional packages does it pull in?
- [ ] **Alternatives**: Is there a built-in API or smaller package that does the same thing?
- [ ] **Maintainer trust**: Is the package maintained by a reputable organization or individual?
- [ ] **Provenance**: Does the package have build provenance or sigstore attestation?

---

## Prevention Checklist

- [ ] Run `npm audit` in every CI/CD pipeline build
- [ ] Configure Dependabot or Renovate for automated dependency updates
- [ ] Use Snyk or Socket.dev for continuous vulnerability monitoring
- [ ] Pin exact dependency versions (no `^` or `~` prefixes)
- [ ] Always commit lock files to version control
- [ ] Use `npm ci` (not `npm install`) in CI/CD
- [ ] Generate and maintain an SBOM for each release
- [ ] Scope internal packages with an organization prefix
- [ ] Configure `.npmrc` with `ignore-scripts=true` for untrusted packages
- [ ] Verify npm package signatures with `npm audit signatures`
- [ ] Evaluate all new dependencies against the evaluation checklist
- [ ] Set up alerts for new vulnerabilities in your dependency tree
- [ ] Regularly review and remove unused dependencies
- [ ] Monitor for dependency confusion attacks (public packages matching internal names)
- [ ] Use a private npm registry or proxy for all production builds

## References

- CWE-1104: Use of Unmaintained Third-Party Components
- OWASP Dependency-Check
- NIST SP 800-218: Secure Software Development Framework
- US Executive Order 14028 (SBOM requirements)
- OpenSSF Scorecard — Automated security health metrics for open source
- SLSA (Supply chain Levels for Software Artifacts)
