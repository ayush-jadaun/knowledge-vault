---
title: "A08: Software and Data Integrity Failures"
description: Understanding data integrity failures including insecure deserialization, CI/CD pipeline integrity, unsigned software updates, supply chain security, and Subresource Integrity (SRI)
tags: [security, owasp, deserialization, ci-cd, supply-chain, sri, integrity]
difficulty: advanced
prerequisites:
  - owasp/index
  - CI/CD pipeline concepts
  - Understanding of serialization formats
lastReviewed: "2026-03-17"
---

# A08: Software and Data Integrity Failures

This category, new in the 2021 OWASP Top 10, focuses on making assumptions about software updates, critical data, and CI/CD pipelines without verifying integrity. It incorporates the former A08:2017 "Insecure Deserialization" and expands the scope to include any situation where code or data integrity is not verified.

## 1. Insecure Deserialization

Deserialization is the process of converting serialized data (bytes, JSON, XML, etc.) back into objects. Insecure deserialization occurs when untrusted data is deserialized without adequate validation, potentially allowing attackers to manipulate serialized objects to achieve remote code execution, replay attacks, injection, or privilege escalation.

### Vulnerable Code

```typescript
// VULNERABLE: Deserializing untrusted data with node-serialize
import serialize from 'node-serialize';

app.post('/api/session/restore', (req: Request, res: Response) => {
  const sessionData = req.cookies.session;

  // Deserializing untrusted data — node-serialize can execute arbitrary code
  const session = serialize.unserialize(
    Buffer.from(sessionData, 'base64').toString()
  );

  res.json({ user: session.user });
});

// VULNERABLE: Using eval to deserialize
app.post('/api/data/import', (req: Request, res: Response) => {
  const data = req.body.data;

  // eval can execute arbitrary code embedded in the data
  const parsed = eval(`(${data})`);

  res.json(parsed);
});

// VULNERABLE: YAML deserialization (yaml.load with unsafe options)
import yaml from 'js-yaml';

app.post('/api/config/upload', (req: Request, res: Response) => {
  const config = yaml.load(req.body.yaml, {
    // This is not js-yaml's default, but some code examples use it
    schema: yaml.DEFAULT_FULL_SCHEMA,
  });

  res.json(config);
});

// VULNERABLE: Prototype pollution via JSON.parse + merge
function deepMerge(target: any, source: any): any {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object') {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key]; // Allows __proto__ pollution
    }
  }
  return target;
}

app.put('/api/settings', (req: Request, res: Response) => {
  const userSettings = req.body;
  // If userSettings = {"__proto__": {"isAdmin": true}​}
  // All objects now have isAdmin = true
  const merged = deepMerge({}, userSettings);
  res.json(merged);
});
```

### Exploitation

**node-serialize RCE:**

```javascript
// Crafted payload that executes arbitrary code when deserialized
const payload = {
  "rce": "_$$ND_FUNC$$_function(){require('child_process').execSync('id > /tmp/pwned')}()"
};

// Base64 encode and send as cookie
const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
// Set this as the session cookie
```

**Prototype Pollution:**

```json
// Attacker sends this payload
{
  "__proto__": {
    "isAdmin": true,
    "role": "superadmin"
  }
}

// Or using constructor.prototype:
{
  "constructor": {
    "prototype": {
      "isAdmin": true
    }
  }
}

// After pollution, any object checked for .isAdmin will return true:
const user = {};
console.log(user.isAdmin); // true (polluted!)
```

### Secure Code

```typescript
// SECURE: Never use node-serialize, eval, or Function constructor with untrusted data

// SECURE: Use JSON.parse with schema validation
import { z } from 'zod';

const sessionSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['user', 'admin']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

app.post('/api/session/restore', (req: Request, res: Response) => {
  const sessionData = req.cookies.session;

  try {
    const raw = JSON.parse(
      Buffer.from(sessionData, 'base64').toString('utf-8')
    );

    // Validate the structure and types
    const session = sessionSchema.parse(raw);

    // Verify the session hasn't expired
    if (new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'Session expired' });
    }

    // Verify the session is in the server-side store
    const serverSession = await sessionStore.get(session.userId);
    if (!serverSession) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    res.json({ user: session.userId });
  } catch {
    res.status(400).json({ error: 'Invalid session data' });
  }
});

// SECURE: Prototype pollution prevention
function safeMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>
): T {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    // Block prototype pollution vectors
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    const value = source[key];

    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      result[key] !== null
    ) {
      (result as any)[key] = safeMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      (result as any)[key] = value;
    }
  }

  return result;
}

// SECURE: Use Object.create(null) for dictionaries
function createSafeDictionary(): Record<string, unknown> {
  return Object.create(null); // No prototype chain — immune to pollution
}

// SECURE: Freeze Object.prototype in application bootstrap
// (defense-in-depth — may break some libraries)
// Object.freeze(Object.prototype);

// SECURE: YAML with safe schema
import yaml from 'js-yaml';

app.post('/api/config/upload', (req: Request, res: Response) => {
  try {
    // JSON_SCHEMA is the safest — no custom types
    const config = yaml.load(req.body.yaml, {
      schema: yaml.JSON_SCHEMA,
    });

    // Validate the parsed config
    const configSchema = z.object({
      port: z.number().int().min(1).max(65535),
      host: z.string().min(1).max(253),
      debug: z.boolean(),
    });

    const validated = configSchema.parse(config);
    res.json(validated);
  } catch (err) {
    res.status(400).json({ error: 'Invalid configuration' });
  }
});
```

---

## 2. CI/CD Pipeline Integrity

CI/CD pipelines are high-value targets because they have access to source code, secrets, production infrastructure, and often run with elevated privileges. A compromised pipeline can inject malicious code into every deployment.

### Threats to CI/CD Pipelines

| Threat | Description | Impact |
|--------|-------------|--------|
| Poisoned pipeline execution | Attacker modifies CI config in a PR | Code execution in CI environment |
| Dependency confusion | Malicious package replaces internal package | Code execution during build |
| Secret exfiltration | CI secrets accessed by malicious code | Credential theft |
| Build artifact tampering | Attacker modifies built artifacts | Malicious code in production |
| Insufficient access controls | Too many people can trigger deployments | Unauthorized changes |

### Secure CI/CD Configuration

```yaml
# GitHub Actions — Secure workflow
name: Deploy
on:
  push:
    branches: [main]

# Minimal permissions — principle of least privilege
permissions:
  contents: read
  id-token: write  # For OIDC federation (no long-lived secrets)

jobs:
  build:
    runs-on: ubuntu-latest
    environment: production  # Requires environment approval

    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false  # Don't persist git credentials

      # Pin actions to exact SHA (not tags, which can be moved)
      - uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b  # v4.0.3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci  # Uses lock file, fails if inconsistent

      - name: Verify dependency integrity
        run: npm audit signatures

      - name: Run security tests
        run: npm run test:security

      - name: Build
        run: npm run build

      # Generate and sign build provenance
      - name: Generate SBOM
        run: npx @cyclonedx/cyclonedx-npm --output-file sbom.json

      - name: Sign artifact
        run: |
          CHECKSUM=$(sha256sum dist/app.tar.gz | cut -d' ' -f1)
          echo "$CHECKSUM" > dist/app.tar.gz.sha256

      # Deploy using OIDC — no long-lived secrets
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502  # v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/deploy-role
          aws-region: us-east-1

      - name: Deploy
        run: ./scripts/deploy.sh
```

### Protecting Secrets in CI/CD

```yaml
# Secrets should NEVER be:
# - Printed to logs
# - Passed as command-line arguments (visible in process listings)
# - Stored in environment variables of long-running processes

# GitHub Actions secret masking
- name: Use secret safely
  run: |
    # GitHub automatically masks secrets in logs, but be careful with
    # commands that might encode or transform the secret
    curl -H "Authorization: Bearer ${​{ secrets.API_TOKEN }​}" https://api.example.com/deploy

    # DANGEROUS: This might leak the secret in encoded form
    # echo "${​{ secrets.API_TOKEN }​}" | base64  # DON'T DO THIS

# Use OIDC federation instead of long-lived secrets
# This eliminates the need to store cloud provider credentials as secrets
```

### Branch Protection Rules

```typescript
// Required branch protection for production branches
const branchProtection = {
  // Require pull request reviews
  required_pull_request_reviews: {
    required_approving_review_count: 2,
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
    require_last_push_approval: true,  // Reviewer must approve after last push
  },

  // Require status checks
  required_status_checks: {
    strict: true,  // Require branch to be up-to-date
    contexts: [
      'build',
      'test',
      'security-scan',
      'lint',
    ],
  },

  // Require signed commits
  required_signatures: true,

  // Enforce for administrators too
  enforce_admins: true,

  // Restrict who can push
  restrictions: {
    teams: ['deploy-team'],
  },

  // Require linear history (no merge commits)
  required_linear_history: true,

  // Don't allow force pushes
  allow_force_pushes: false,

  // Don't allow deletions
  allow_deletions: false,
};
```

---

## 3. Unsigned Software Updates

If an application updates itself without verifying the integrity of the update, an attacker who can intercept or modify the update channel can inject malicious code.

### Vulnerable Code

```typescript
// VULNERABLE: Downloading and executing updates without verification
async function autoUpdate(): Promise<void> {
  const response = await fetch('http://updates.example.com/latest.tar.gz'); // HTTP!
  const data = await response.arrayBuffer();

  // No signature verification
  // No checksum verification
  // Downloaded over HTTP (not HTTPS)
  fs.writeFileSync('/app/update.tar.gz', Buffer.from(data));

  // Extracting and executing untrusted content
  execSync('tar -xzf /app/update.tar.gz -C /app/');
  execSync('node /app/updated-app.js');
}
```

### Secure Code

```typescript
import crypto from 'crypto';
import fs from 'fs';

interface UpdateManifest {
  version: string;
  sha256: string;
  signature: string;
  url: string;
  releaseNotes: string;
}

const UPDATE_PUBLIC_KEY = fs.readFileSync('/app/keys/update-signing-key.pub', 'utf-8');

async function secureAutoUpdate(): Promise<void> {
  // Step 1: Fetch the manifest over HTTPS
  const manifestResponse = await fetch('https://updates.example.com/manifest.json', {
    headers: { 'Accept': 'application/json' },
  });

  if (!manifestResponse.ok) {
    throw new Error('Failed to fetch update manifest');
  }

  const manifest: UpdateManifest = await manifestResponse.json();

  // Step 2: Verify the manifest signature
  const manifestData = JSON.stringify({
    version: manifest.version,
    sha256: manifest.sha256,
    url: manifest.url,
  });

  const isManifestValid = crypto.verify(
    'sha256',
    Buffer.from(manifestData),
    {
      key: UPDATE_PUBLIC_KEY,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    },
    Buffer.from(manifest.signature, 'base64')
  );

  if (!isManifestValid) {
    logger.error('Update manifest signature verification failed');
    throw new Error('Invalid update signature');
  }

  // Step 3: Check if update is newer than current version
  const currentVersion = require('/app/package.json').version;
  if (!isNewerVersion(manifest.version, currentVersion)) {
    logger.info('Already up to date');
    return;
  }

  // Step 4: Download the update over HTTPS
  const updateResponse = await fetch(manifest.url);
  const updateData = Buffer.from(await updateResponse.arrayBuffer());

  // Step 5: Verify the SHA-256 checksum
  const computedHash = crypto.createHash('sha256').update(updateData).digest('hex');

  if (computedHash !== manifest.sha256) {
    logger.error('Update checksum mismatch', {
      expected: manifest.sha256,
      computed: computedHash,
    });
    throw new Error('Update integrity check failed');
  }

  // Step 6: Write update to a temporary location
  const tempPath = `/app/updates/${manifest.version}.tar.gz`;
  fs.writeFileSync(tempPath, updateData);

  // Step 7: Extract to a staging directory (not directly to app)
  const stagingDir = `/app/staging/${manifest.version}`;
  fs.mkdirSync(stagingDir, { recursive: true });

  execFileSync('tar', ['-xzf', tempPath, '-C', stagingDir]);

  // Step 8: Verify extracted contents
  // (additional checks: no symlinks outside staging, no unexpected files, etc.)

  // Step 9: Atomic swap
  const backupDir = `/app/backup/${currentVersion}`;
  fs.renameSync('/app/current', backupDir);
  fs.renameSync(stagingDir, '/app/current');

  logger.info('Update applied successfully', {
    from: currentVersion,
    to: manifest.version,
  });

  // Step 10: Restart the application
  process.exit(0); // Process manager (PM2, systemd) will restart
}
```

---

## 4. Subresource Integrity (SRI)

SRI allows browsers to verify that resources fetched from CDNs or third-party origins haven't been tampered with. It works by comparing a cryptographic hash of the fetched resource against a hash specified in the HTML.

### Without SRI (Vulnerable)

```html
<!-- If the CDN is compromised, malicious JavaScript will execute -->
<script src="https://cdn.example.com/lodash@4.17.21/lodash.min.js"></script>
<link rel="stylesheet" href="https://cdn.example.com/bootstrap@5.3.0/bootstrap.min.css">
```

### With SRI (Secure)

```html
<!-- The browser will refuse to execute the script if the hash doesn't match -->
<script
  src="https://cdn.example.com/lodash@4.17.21/lodash.min.js"
  integrity="sha384-5gBDCZU5Cq+JYK3oJXmIxf15LfNH29o7IaFZ6WuO5Sw5n9oXf0kI8y2O0T3/rXl"
  crossorigin="anonymous"
></script>

<link
  rel="stylesheet"
  href="https://cdn.example.com/bootstrap@5.3.0/bootstrap.min.css"
  integrity="sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM"
  crossorigin="anonymous"
>
```

### Generating SRI Hashes

```bash
# Generate SRI hash for a file
cat lodash.min.js | openssl dgst -sha384 -binary | openssl base64 -A
# Output: 5gBDCZU5Cq+JYK3oJXmIxf15LfNH29o7IaFZ6WuO5Sw5n9oXf0kI8y2O0T3/rXl

# Using shasum
shasum -b -a 384 lodash.min.js | xxd -r -p | base64

# Using the srihash.org service or npm package
npx ssri hash lodash.min.js
```

### Build-Time SRI Generation

```typescript
// Webpack plugin or build script to generate SRI hashes
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface AssetIntegrity {
  [filename: string]: string;
}

function generateSRIHashes(distDir: string): AssetIntegrity {
  const hashes: AssetIntegrity = {};

  const files = fs.readdirSync(distDir);

  for (const file of files) {
    if (file.endsWith('.js') || file.endsWith('.css')) {
      const content = fs.readFileSync(path.join(distDir, file));
      const hash = crypto
        .createHash('sha384')
        .update(content)
        .digest('base64');

      hashes[file] = `sha384-${hash}`;
    }
  }

  // Write the manifest
  fs.writeFileSync(
    path.join(distDir, 'sri-manifest.json'),
    JSON.stringify(hashes, null, 2)
  );

  return hashes;
}

// Use in HTML template generation
function generateScriptTag(src: string, integrity: string): string {
  return `<script src="${src}" integrity="${integrity}" crossorigin="anonymous"></script>`;
}
```

### CSP with require-sri-for

```typescript
// Content Security Policy that requires SRI for all scripts and styles
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://cdn.example.com",
    "style-src 'self' https://cdn.example.com",
    // require-sri-for is deprecated in favor of using CSP to restrict sources
    // but SRI should still be used on all third-party resources
  ].join('; '));

  next();
});
```

---

## 5. Code Signing

Code signing ensures that released software has not been tampered with and comes from a trusted publisher.

### Git Commit Signing

```bash
# Configure GPG signing for git commits
git config --global commit.gpgsign true
git config --global user.signingkey YOUR_GPG_KEY_ID

# Verify a signed commit
git log --show-signature -1

# Verify all commits in a range
git log --show-signature main..feature-branch
```

### Container Image Signing with Cosign

```bash
# Sign a container image
cosign sign --key cosign.key ghcr.io/myorg/myapp:v1.0.0

# Verify a signed image
cosign verify --key cosign.pub ghcr.io/myorg/myapp:v1.0.0

# Keyless signing with Sigstore (uses OIDC identity)
cosign sign ghcr.io/myorg/myapp:v1.0.0
# This creates a transparency log entry in Rekor
```

### npm Package Signing and Provenance

```bash
# Publish with provenance (requires GitHub Actions with id-token permission)
npm publish --provenance

# Verify package provenance
npm audit signatures

# Check provenance of a specific package
npm view <package> --json | jq '.dist.attestations'
```

---

## 6. Data Integrity in Transit and at Rest

### Ensuring Data Integrity

```typescript
// HMAC for data integrity verification
function createIntegrityTag(data: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function verifyIntegrity(data: string, tag: string, key: Buffer): boolean {
  const expectedTag = createIntegrityTag(data, key);
  return crypto.timingSafeEqual(
    Buffer.from(tag, 'hex'),
    Buffer.from(expectedTag, 'hex')
  );
}

// Database row integrity (detect tampering)
interface AuditableRecord {
  id: string;
  data: Record<string, unknown>;
  integrity_hash: string;
  previous_hash: string;
  created_at: string;
}

class IntegrityChain {
  private readonly key: Buffer;

  constructor(secretKey: Buffer) {
    this.key = secretKey;
  }

  createRecord(data: Record<string, unknown>, previousHash: string): AuditableRecord {
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    const hashInput = JSON.stringify({
      id,
      data,
      previous_hash: previousHash,
      created_at,
    });

    const integrity_hash = crypto
      .createHmac('sha256', this.key)
      .update(hashInput)
      .digest('hex');

    return {
      id,
      data,
      integrity_hash,
      previous_hash: previousHash,
      created_at,
    };
  }

  verifyChain(records: AuditableRecord[]): {
    valid: boolean;
    firstInvalidIndex?: number;
  } {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      // Recompute hash
      const hashInput = JSON.stringify({
        id: record.id,
        data: record.data,
        previous_hash: record.previous_hash,
        created_at: record.created_at,
      });

      const expectedHash = crypto
        .createHmac('sha256', this.key)
        .update(hashInput)
        .digest('hex');

      if (expectedHash !== record.integrity_hash) {
        return { valid: false, firstInvalidIndex: i };
      }

      // Verify chain linkage
      if (i > 0 && record.previous_hash !== records[i - 1].integrity_hash) {
        return { valid: false, firstInvalidIndex: i };
      }
    }

    return { valid: true };
  }
}
```

---

## Prevention Checklist

- [ ] Never deserialize untrusted data with libraries that support code execution
- [ ] Validate all deserialized data against a strict schema (Zod, Joi)
- [ ] Protect against prototype pollution (filter `__proto__`, `constructor`, `prototype`)
- [ ] Pin CI/CD action versions to exact SHA hashes (not tags)
- [ ] Use OIDC federation instead of long-lived secrets in CI/CD
- [ ] Require code review and signed commits for production branches
- [ ] Verify integrity of software updates with cryptographic signatures and checksums
- [ ] Use Subresource Integrity (SRI) for all third-party scripts and styles
- [ ] Sign container images with Cosign/Sigstore
- [ ] Publish npm packages with provenance attestation
- [ ] Implement HMAC-based integrity verification for sensitive data
- [ ] Use Content Security Policy to restrict script sources
- [ ] Maintain audit trails with cryptographic integrity chains
- [ ] Verify dependency integrity with `npm audit signatures`

## References

- CWE-345: Insufficient Verification of Data Authenticity
- CWE-353: Missing Support for Integrity Check
- CWE-502: Deserialization of Untrusted Data
- CWE-829: Inclusion of Functionality from Untrusted Control Sphere
- CWE-915: Improperly Controlled Modification of Dynamically-Determined Object Attributes (Prototype Pollution)
- SLSA Framework (Supply chain Levels for Software Artifacts)
- Sigstore Project
- OWASP Deserialization Cheat Sheet
