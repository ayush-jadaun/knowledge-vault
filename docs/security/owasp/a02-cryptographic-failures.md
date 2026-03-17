---
title: "A02: Cryptographic Failures"
description: Deep dive into cryptographic failures including weak algorithms, plaintext storage, missing encryption, insecure random number generation, and side-channel attacks with Node.js examples
tags: [security, owasp, cryptography, encryption, hashing, node-js]
difficulty: advanced
prerequisites:
  - owasp/index
  - Basic understanding of encryption concepts
  - Node.js fundamentals
lastReviewed: "2026-03-17"
---

# A02: Cryptographic Failures

Previously known as "Sensitive Data Exposure" (A03 in 2017), this category was renamed and shifted up to emphasize that cryptographic failures are root causes rather than symptoms. Cryptographic failures lead to exposure of sensitive data — including passwords, credit card numbers, health records, personal information, and business secrets — particularly when data requires special protection under privacy laws (GDPR, PCI DSS, HIPAA) or regulations.

## Data Classification

Before applying cryptographic controls, classify your data:

| Classification | Examples | Required Controls |
|---------------|----------|-------------------|
| Public | Marketing materials, documentation | Integrity checks |
| Internal | Internal communications, policies | Encryption in transit |
| Confidential | Customer PII, financial data | Encryption at rest + in transit, access controls |
| Restricted | Credentials, encryption keys, PHI | HSM/KMS, minimal access, audit logging |

## 1. Weak Cryptographic Algorithms

Using deprecated or broken algorithms is one of the most common cryptographic failures. Algorithms are considered "broken" when practical attacks exist that can defeat them in reasonable time.

### Broken Algorithms

| Algorithm | Status | Weakness |
|-----------|--------|----------|
| MD5 | Broken | Collision attacks in seconds |
| SHA-1 | Broken | SHAttered attack demonstrated (2017) |
| DES | Broken | 56-bit key, brute-forced in hours |
| 3DES (Triple DES) | Deprecated | Sweet32 attack, slow, 112-bit effective key |
| RC4 | Broken | Statistical biases in keystream |
| RSA < 2048 bits | Weak | Factoring advances make keys under 2048 bits insecure |
| Blowfish (64-bit block) | Weak | Sweet32 birthday attack on 64-bit block ciphers |

### Vulnerable Code

```typescript
import crypto from 'crypto';

// VULNERABLE: MD5 for password hashing
function hashPasswordMD5(password: string): string {
  return crypto.createHash('md5').update(password).digest('hex');
}

// VULNERABLE: SHA-1 for integrity verification
function signData(data: string, key: string): string {
  return crypto.createHmac('sha1', key).update(data).digest('hex');
}

// VULNERABLE: DES for encryption
function encryptDES(plaintext: string, key: string): string {
  const cipher = crypto.createCipheriv('des-ecb', Buffer.from(key, 'utf-8').slice(0, 8), null);
  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

// VULNERABLE: ECB mode (leaks patterns)
function encryptECB(plaintext: string, key: Buffer): string {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}
```

### Why ECB Mode Leaks Information

ECB (Electronic Codebook) mode encrypts each block independently with the same key. Identical plaintext blocks produce identical ciphertext blocks, revealing patterns in the data. The famous "ECB penguin" example demonstrates this clearly: encrypting an image of a penguin with ECB mode produces ciphertext where the penguin's shape is still visible.

### Secure Code

```typescript
import crypto from 'crypto';

// SECURE: AES-256-GCM for authenticated encryption
function encryptAESGCM(
  plaintext: string,
  key: Buffer // 32 bytes for AES-256
): { ciphertext: string; iv: string; tag: string } {
  // Generate a unique IV for each encryption operation
  const iv = crypto.randomBytes(12); // 96 bits is recommended for GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  // Authentication tag — integrity verification
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

function decryptAESGCM(
  ciphertext: string,
  key: Buffer,
  ivHex: string,
  tagHex: string
): string {
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

// SECURE: HMAC-SHA256 for data integrity
function signDataHMAC(data: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function verifyDataHMAC(data: string, signature: string, key: Buffer): boolean {
  const computed = signDataHMAC(data, key);
  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(computed, 'hex'),
    Buffer.from(signature, 'hex')
  );
}
```

---

## 2. Plaintext Storage of Sensitive Data

Storing passwords, API keys, credit card numbers, or other sensitive data in plaintext is a critical failure. If the database is compromised, all data is immediately exposed.

### Vulnerable Code

```typescript
import { Pool } from 'pg';

const pool = new Pool();

// VULNERABLE: Storing password in plaintext
async function registerUser(email: string, password: string): Promise<void> {
  await pool.query(
    'INSERT INTO users (email, password) VALUES ($1, $2)',
    [email, password] // Password stored as-is!
  );
}

// VULNERABLE: Storing password with a fast hash (no salt)
async function registerUserMD5(email: string, password: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  await pool.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
    [email, hash] // Same password always produces the same hash (rainbow tables)
  );
}

// VULNERABLE: Storing credit card numbers in plaintext
async function saveCard(
  userId: number,
  cardNumber: string,
  cvv: string
): Promise<void> {
  await pool.query(
    'INSERT INTO cards (user_id, card_number, cvv) VALUES ($1, $2, $3)',
    [userId, cardNumber, cvv] // PCI DSS violation — never store CVV
  );
}

// VULNERABLE: Logging sensitive data
function processPayment(cardNumber: string, amount: number): void {
  console.log(`Processing payment of ${amount} for card ${cardNumber}`);
  // ...
}
```

### Secure Code

```typescript
import argon2 from 'argon2';
import crypto from 'crypto';

// SECURE: Password hashing with Argon2id
async function registerUser(email: string, password: string): Promise<void> {
  const hash = await argon2.hash(password, {
    type: argon2.argon2id, // Resistant to both side-channel and GPU attacks
    memoryCost: 65536,     // 64 MB
    timeCost: 3,           // 3 iterations
    parallelism: 4,        // 4 threads
    saltLength: 16,        // 128-bit salt (auto-generated)
  });

  // The hash string includes the algorithm, parameters, salt, and hash
  // Example: $argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$hash
  await pool.query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
    [email, hash]
  );
}

async function verifyPassword(email: string, password: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT password_hash FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    // Perform a dummy hash to prevent timing attacks that reveal
    // whether a user exists
    await argon2.hash(password, { type: argon2.argon2id });
    return false;
  }

  try {
    return await argon2.verify(result.rows[0].password_hash, password);
  } catch {
    return false;
  }
}

// SECURE: Encrypt sensitive data before storage
// (For PCI compliance, use a PCI-certified tokenization service instead)
async function saveCard(
  userId: number,
  cardNumber: string
  // NEVER accept or store CVV
): Promise<void> {
  const encryptionKey = Buffer.from(process.env.CARD_ENCRYPTION_KEY!, 'hex');
  const { ciphertext, iv, tag } = encryptAESGCM(cardNumber, encryptionKey);

  // Store only the last 4 digits for display purposes
  const lastFour = cardNumber.slice(-4);

  await pool.query(
    `INSERT INTO cards (user_id, encrypted_number, iv, tag, last_four)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, ciphertext, iv, tag, lastFour]
  );
}

// SECURE: Sanitize logs
function processPayment(cardNumber: string, amount: number): void {
  const masked = `****-****-****-${cardNumber.slice(-4)}`;
  logger.info('Processing payment', { amount, card: masked });
}
```

---

## 3. Missing Encryption in Transit

Data transmitted without encryption can be intercepted by anyone on the network path — ISPs, Wi-Fi operators, or attackers performing man-in-the-middle attacks.

### Vulnerable Code

```typescript
import http from 'http';
import express from 'express';

const app = express();

// VULNERABLE: HTTP server (no TLS)
http.createServer(app).listen(80);

// VULNERABLE: Connecting to database without TLS
const pool = new Pool({
  host: 'db.example.com',
  port: 5432,
  ssl: false, // Data in transit is unencrypted
});

// VULNERABLE: Calling external APIs over HTTP
async function fetchUserData(userId: string): Promise<any> {
  const response = await fetch(`http://api.partner.com/users/${userId}`);
  return response.json();
}

// VULNERABLE: Missing HSTS header
// Browser might initially connect over HTTP before being redirected
```

### Secure Code

```typescript
import https from 'https';
import fs from 'fs';
import express from 'express';
import helmet from 'helmet';

const app = express();

// SECURE: Force HTTPS with HSTS
app.use(helmet.hsts({
  maxAge: 31536000,      // 1 year
  includeSubDomains: true,
  preload: true,         // Submit to HSTS preload list
}));

// Redirect HTTP to HTTPS
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, `https://${req.hostname}${req.url}`);
  }
  next();
});

// SECURE: HTTPS server with modern TLS configuration
const server = https.createServer(
  {
    key: fs.readFileSync('/etc/ssl/private/server.key'),
    cert: fs.readFileSync('/etc/ssl/certs/server.crt'),
    ca: fs.readFileSync('/etc/ssl/certs/ca.crt'),
    minVersion: 'TLSv1.2',
    ciphers: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES128-GCM-SHA256',
    ].join(':'),
    honorCipherOrder: true,
  },
  app
);

server.listen(443);

// SECURE: Database connection with TLS
const pool = new Pool({
  host: 'db.example.com',
  port: 5432,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('/etc/ssl/certs/db-ca.crt').toString(),
    cert: fs.readFileSync('/etc/ssl/certs/db-client.crt').toString(),
    key: fs.readFileSync('/etc/ssl/private/db-client.key').toString(),
  },
});

// SECURE: External API calls over HTTPS with certificate verification
async function fetchUserData(userId: string): Promise<any> {
  const response = await fetch(`https://api.partner.com/users/${userId}`, {
    headers: { 'Authorization': `Bearer ${process.env.PARTNER_API_KEY}` },
  });

  if (!response.ok) {
    throw new Error(`Partner API error: ${response.status}`);
  }

  return response.json();
}
```

---

## 4. Insecure Random Number Generation

Cryptographic operations require truly random (or cryptographically secure pseudorandom) values. Using `Math.random()` or other non-cryptographic PRNGs for security-sensitive operations is a critical vulnerability.

### Vulnerable Code

```typescript
// VULNERABLE: Math.random() is not cryptographically secure
// It uses a PRNG (like xoshiro128**) that is deterministic and predictable

function generateToken(): string {
  // Only 2^32 possible outputs — trivially brute-forceable
  return Math.random().toString(36).substring(2);
}

function generateOTP(): string {
  // Predictable — attacker can predict future OTPs after observing a few
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSessionId(): string {
  // Insufficient entropy
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// VULNERABLE: Using a seed-based PRNG
function seededRandom(seed: number): number {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}
```

### Why Math.random() Is Insecure

`Math.random()` in V8 (Node.js) uses the xoshiro128** algorithm with a 128-bit state. An attacker who observes a few outputs can reconstruct the internal state and predict all future (and past) outputs. This has been demonstrated in practice — tools like `v8_rand_buster` can recover the state from just a handful of outputs.

### Secure Code

```typescript
import crypto from 'crypto';

// SECURE: Cryptographically secure random token
function generateToken(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
  // 32 bytes = 256 bits of entropy = 64 hex characters
}

// SECURE: Cryptographically secure OTP
function generateOTP(digits: number = 6): string {
  const max = Math.pow(10, digits);
  const min = Math.pow(10, digits - 1);

  // Generate a random integer in the range [min, max)
  let otp: number;
  do {
    const buf = crypto.randomBytes(4);
    otp = buf.readUInt32BE(0) % max;
  } while (otp < min); // Reject values below minimum to avoid bias

  return otp.toString();
}

// SECURE: Generate a random UUID (v4)
function generateUUID(): string {
  return crypto.randomUUID();
}

// SECURE: Generate a random string from a custom alphabet
function generateRandomString(
  length: number,
  alphabet: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string {
  const bytes = crypto.randomBytes(length);
  const chars: string[] = [];

  for (let i = 0; i < length; i++) {
    // Use rejection sampling to avoid modulo bias
    const maxValid = 256 - (256 % alphabet.length);
    let byte: number;

    do {
      byte = crypto.randomBytes(1)[0];
    } while (byte >= maxValid);

    chars.push(alphabet[byte % alphabet.length]);
  }

  return chars.join('');
}

// SECURE: Generate a random integer in a range (inclusive)
function secureRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValid = Math.pow(256, bytesNeeded) - (Math.pow(256, bytesNeeded) % range);

  let value: number;
  do {
    const buf = crypto.randomBytes(bytesNeeded);
    value = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      value = value * 256 + buf[i];
    }
  } while (value >= maxValid); // Rejection sampling to eliminate bias

  return min + (value % range);
}
```

---

## 5. Side-Channel Attacks

Side-channel attacks extract secret information by observing the physical characteristics of a cryptographic implementation — timing, power consumption, electromagnetic emissions, or even sound.

### Timing Attacks

The most relevant side-channel attack in web applications is the timing attack, where an attacker measures how long a comparison operation takes to determine how many bytes of a secret they have guessed correctly.

### Vulnerable Code

```typescript
// VULNERABLE: String comparison short-circuits on first mismatch
function verifyApiKey(provided: string, stored: string): boolean {
  return provided === stored;
  // If the first character mismatches, this returns immediately.
  // If the first 10 characters match, it takes longer.
  // The attacker can determine the key character by character.
}

// VULNERABLE: HMAC comparison with early return
function verifySignature(payload: string, signature: string, key: string): boolean {
  const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
  return signature === expected; // Timing leak!
}

// VULNERABLE: Password comparison (even with hashing)
function checkPassword(hash1: string, hash2: string): boolean {
  if (hash1.length !== hash2.length) return false;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) return false; // Returns on first mismatch
  }
  return true;
}
```

### Exploitation

A timing attack against a string comparison can be performed remotely. While network jitter adds noise, statistical analysis over many requests can still reveal the secret:

```python
import requests
import time
import statistics

def time_request(api_key: str, url: str, n: int = 100) -> float:
    """Measure average response time for a given API key."""
    times = []
    for _ in range(n):
        start = time.perf_counter_ns()
        requests.get(url, headers={"X-API-Key": api_key})
        elapsed = time.perf_counter_ns() - start
        times.append(elapsed)
    # Use median to reduce impact of outliers
    return statistics.median(times)

# Character-by-character key recovery
charset = "abcdef0123456789"
known = ""

for position in range(32):  # 32-character hex key
    best_char = ""
    best_time = 0

    for char in charset:
        candidate = known + char + "0" * (31 - position)
        t = time_request(candidate, "https://target.com/api/data")
        if t > best_time:
            best_time = t
            best_char = char

    known += best_char
    print(f"Key so far: {known}")
```

### Secure Code

```typescript
import crypto from 'crypto';

// SECURE: Constant-time comparison
function verifyApiKey(provided: string, stored: string): boolean {
  // Convert to buffers of equal length
  const providedBuf = Buffer.from(provided, 'utf-8');
  const storedBuf = Buffer.from(stored, 'utf-8');

  // If lengths differ, still perform the comparison with a dummy buffer
  // to avoid leaking length information
  if (providedBuf.length !== storedBuf.length) {
    // Compare against itself to maintain constant time, then return false
    crypto.timingSafeEqual(storedBuf, storedBuf);
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, storedBuf);
}

// SECURE: HMAC verification with constant-time comparison
function verifySignature(
  payload: string,
  signature: string,
  key: Buffer
): boolean {
  const expected = crypto
    .createHmac('sha256', key)
    .update(payload)
    .digest();

  const provided = Buffer.from(signature, 'hex');

  if (expected.length !== provided.length) {
    crypto.timingSafeEqual(expected, expected);
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
}

// SECURE: Hash-based API key verification
// Instead of comparing the key directly, compare hashes
// This also means the plaintext key is never stored
async function verifyApiKeyHashed(
  providedKey: string,
  storedKeyHash: string
): Promise<boolean> {
  // Hash the provided key the same way it was hashed when stored
  const providedHash = crypto
    .createHash('sha256')
    .update(providedKey)
    .digest('hex');

  const providedBuf = Buffer.from(providedHash, 'hex');
  const storedBuf = Buffer.from(storedKeyHash, 'hex');

  if (providedBuf.length !== storedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, storedBuf);
}
```

---

## 6. Insufficient Key Management

Using hard-coded keys, sharing keys across environments, or failing to rotate keys undermines all encryption.

### Vulnerable Code

```typescript
// VULNERABLE: Hard-coded encryption key
const ENCRYPTION_KEY = 'super-secret-key-12345678901234';

// VULNERABLE: Key derived from password without proper KDF
function deriveKey(password: string): Buffer {
  return crypto.createHash('sha256').update(password).digest();
}

// VULNERABLE: Same key for all purposes
const UNIVERSAL_KEY = Buffer.from(process.env.SECRET_KEY!, 'hex');
// Used for encryption, signing, API keys, everything...
```

### Secure Code

```typescript
// SECURE: Key derivation from password using scrypt
async function deriveKeyFromPassword(
  password: string,
  salt: Buffer
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      32, // key length in bytes
      { N: 32768, r: 8, p: 1 }, // CPU/memory cost parameters
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

// SECURE: Separate keys for separate purposes
interface KeySet {
  encryptionKey: Buffer;
  signingKey: Buffer;
  tokenKey: Buffer;
}

function loadKeys(): KeySet {
  return {
    encryptionKey: Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'),
    signingKey: Buffer.from(process.env.SIGNING_KEY!, 'hex'),
    tokenKey: Buffer.from(process.env.TOKEN_KEY!, 'hex'),
  };
}

// SECURE: Key rotation support
interface EncryptedData {
  keyVersion: number;
  ciphertext: string;
  iv: string;
  tag: string;
}

class KeyRotationManager {
  private keys: Map<number, Buffer>;
  private currentVersion: number;

  constructor() {
    this.keys = new Map();
    this.currentVersion = 0;
  }

  addKey(version: number, key: Buffer): void {
    this.keys.set(version, key);
    if (version > this.currentVersion) {
      this.currentVersion = version;
    }
  }

  encrypt(plaintext: string): EncryptedData {
    const key = this.keys.get(this.currentVersion)!;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let ciphertext = cipher.update(plaintext, 'utf-8', 'hex');
    ciphertext += cipher.final('hex');

    return {
      keyVersion: this.currentVersion,
      ciphertext,
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
    };
  }

  decrypt(data: EncryptedData): string {
    const key = this.keys.get(data.keyVersion);
    if (!key) {
      throw new Error(`Key version ${data.keyVersion} not found — it may have been retired`);
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(data.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(data.tag, 'hex'));

    let plaintext = decipher.update(data.ciphertext, 'hex', 'utf-8');
    plaintext += decipher.final('utf-8');

    return plaintext;
  }

  // Re-encrypt data with the current key version
  reEncrypt(data: EncryptedData): EncryptedData {
    if (data.keyVersion === this.currentVersion) {
      return data; // Already using current key
    }
    const plaintext = this.decrypt(data);
    return this.encrypt(plaintext);
  }
}
```

---

## 7. Certificate and TLS Failures

### Vulnerable Code

```typescript
// VULNERABLE: Disabling certificate verification
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // NEVER do this in production

// VULNERABLE: Ignoring certificate errors per-request
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // Accepts any certificate, including self-signed
});

// VULNERABLE: Weak TLS version
const server = https.createServer({
  minVersion: 'TLSv1', // TLS 1.0 and 1.1 are deprecated (RFC 8996)
});
```

### Secure Code

```typescript
import tls from 'tls';

// SECURE: Strict TLS configuration
const server = https.createServer({
  key: fs.readFileSync('/etc/ssl/private/server.key'),
  cert: fs.readFileSync('/etc/ssl/certs/server.crt'),
  ca: fs.readFileSync('/etc/ssl/certs/ca-chain.crt'),
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
  ciphers: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
  ].join(':'),
  ecdhCurve: 'X25519:P-256:P-384',
  honorCipherOrder: true,
  // Enable OCSP stapling
  // sessionTimeout: 3600,
}, app);

// SECURE: Custom certificate verification for internal services
const agent = new https.Agent({
  ca: fs.readFileSync('/etc/ssl/certs/internal-ca.crt'),
  rejectUnauthorized: true,
  checkServerIdentity: (hostname: string, cert: tls.PeerCertificate) => {
    // Verify the certificate's CN or SAN matches the expected hostname
    const err = tls.checkServerIdentity(hostname, cert);
    if (err) {
      logger.error('Certificate identity mismatch', {
        hostname,
        certCN: cert.subject?.CN,
        certSAN: cert.subjectaltname,
      });
    }
    return err;
  },
});
```

---

## 8. Hardcoded Secrets

### Detection

```bash
# Tools for detecting secrets in code
# gitleaks — scans git repositories for secrets
gitleaks detect --source . --verbose

# trufflehog — searches through git history
trufflehog git file://. --since-commit HEAD~50

# Common patterns to search for:
# API keys, passwords, tokens, private keys
grep -rn "password\s*=\s*['\"]" --include="*.ts" .
grep -rn "PRIVATE KEY" --include="*.ts" .
grep -rn "sk_live_" --include="*.ts" .
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for potential secrets before committing
PATTERNS=(
  'password\s*[:=]\s*["\x27][^\s]+'
  'api[_-]?key\s*[:=]\s*["\x27][^\s]+'
  'secret\s*[:=]\s*["\x27][^\s]+'
  'token\s*[:=]\s*["\x27][^\s]+'
  'BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY'
  'sk_live_'
  'sk_test_'
  'AKIA[0-9A-Z]{16}'
)

FOUND=0

for pattern in "${PATTERNS[@]}"; do
  matches=$(git diff --cached --diff-filter=ACM | grep -iP "$pattern" || true)
  if [ -n "$matches" ]; then
    echo "POTENTIAL SECRET DETECTED:"
    echo "$matches"
    FOUND=1
  fi
done

if [ $FOUND -eq 1 ]; then
  echo ""
  echo "Commit blocked — potential secrets detected."
  echo "If these are false positives, use 'git commit --no-verify'."
  exit 1
fi
```

---

## Prevention Checklist

- [ ] Classify all data by sensitivity level
- [ ] Use AES-256-GCM for symmetric encryption
- [ ] Use RSA-2048+ or Ed25519 for asymmetric encryption
- [ ] Use Argon2id, bcrypt, or scrypt for password hashing
- [ ] Use HMAC-SHA256 or HMAC-SHA384 for data integrity
- [ ] Never use MD5, SHA-1, DES, RC4, or ECB mode
- [ ] Generate all random values with `crypto.randomBytes()` or equivalent CSPRNG
- [ ] Use `crypto.timingSafeEqual()` for all secret comparisons
- [ ] Enforce TLS 1.2+ for all connections (database, API, external services)
- [ ] Configure HSTS with `includeSubDomains` and `preload`
- [ ] Never hard-code secrets — use environment variables or a secrets manager
- [ ] Implement key rotation with versioning
- [ ] Use separate keys for separate purposes (encryption, signing, tokens)
- [ ] Run secret scanning tools in CI/CD pipelines
- [ ] Never log sensitive data (passwords, keys, tokens, PII, card numbers)
- [ ] Never store CVV/CVC — PCI DSS strictly prohibits it

## References

- CWE-261: Weak Encoding for Password
- CWE-296: Improper Following of a Certificate's Chain of Trust
- CWE-310: Cryptographic Issues
- CWE-326: Inadequate Encryption Strength
- CWE-327: Use of a Broken or Risky Cryptographic Algorithm
- CWE-328: Reversible One-Way Hash
- CWE-330: Use of Insufficiently Random Values
- NIST SP 800-132: Recommendation for Password-Based Key Derivation
- NIST SP 800-175B: Guideline for Using Cryptographic Standards
