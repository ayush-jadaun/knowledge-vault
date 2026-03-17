---
title: "A04: Insecure Design"
description: Understanding insecure design patterns, threat modeling methodologies, security requirements gathering, secure design patterns, abuse case development, and business logic flaws
tags: [security, owasp, secure-design, threat-modeling, business-logic, abuse-cases]
difficulty: advanced
prerequisites:
  - owasp/index
  - Software architecture fundamentals
  - Understanding of software development lifecycle
lastReviewed: "2026-03-17"
---

# A04: Insecure Design

Insecure Design is a new category in the 2021 OWASP Top 10, focused on risks related to design and architectural flaws. This is distinct from implementation bugs — insecure design cannot be fixed by a perfect implementation because the security controls were never created to defend against specific attacks. An insecure design can never be fixed by a perfect implementation, as the needed security controls were never designed.

## The Difference Between Insecure Design and Insecure Implementation

| Aspect | Insecure Design | Insecure Implementation |
|--------|----------------|------------------------|
| Root cause | Missing or ineffective control design | Bug in an existing control |
| Example | No rate limiting designed for login | Rate limiter exists but has an off-by-one error |
| Fix | Design and implement the control | Fix the bug |
| When to catch | Design phase, architecture review | Code review, testing |
| Cost to fix | Low (during design), very high (after deployment) | Medium (implementation fix) |

## Threat Modeling Methodologies

### STRIDE (Microsoft)

STRIDE categorizes threats by the security property they violate:

| Category | Property | Question | Example |
|----------|----------|----------|---------|
| Spoofing | Authentication | Can someone pretend to be another entity? | Forged JWT, stolen session |
| Tampering | Integrity | Can someone modify data they shouldn't? | Modified price in request |
| Repudiation | Non-repudiation | Can someone deny performing an action? | No audit trail for transfers |
| Information Disclosure | Confidentiality | Can someone access data they shouldn't? | API returns excessive data |
| Denial of Service | Availability | Can someone prevent legitimate use? | Unbounded queries |
| Elevation of Privilege | Authorization | Can someone gain unauthorized access? | Mass assignment to role field |

### STRIDE-per-Element Analysis

Apply STRIDE to each element in your data flow diagram:

```
Element Type           Applicable Threats
─────────────────────  ──────────────────
External Entity        S, R
Process                S, T, R, I, D, E
Data Store             T, R, I, D
Data Flow              T, I, D
Trust Boundary         (apply threats to flows crossing it)
```

### PASTA (Process for Attack Simulation and Threat Analysis)

PASTA is a seven-stage, risk-centric methodology:

1. **Define objectives** — Business objectives, security requirements, compliance needs
2. **Define technical scope** — Architecture, technologies, dependencies, data flows
3. **Decompose application** — DFD, trust boundaries, entry points, assets
4. **Analyze threats** — Threat intelligence, attack libraries, industry-specific threats
5. **Vulnerability analysis** — Map vulnerabilities to threats, scan results, code review findings
6. **Attack modeling** — Attack trees, kill chains, specific attack scenarios
7. **Risk and impact analysis** — Quantify risk, prioritize remediation, map to business impact

### LINDDUN (Privacy Threat Modeling)

For applications handling personal data, complement STRIDE with LINDDUN:

| Category | Privacy Threat |
|----------|---------------|
| Linkability | Ability to link two or more items of interest about a data subject |
| Identifiability | Ability to identify a data subject |
| Non-repudiation (negative) | Inability for a user to deny an action |
| Detectability | Ability to distinguish whether an item of interest exists |
| Disclosure of information | Exposure of personal data to unauthorized parties |
| Unawareness | Data subject is unaware of data processing |
| Non-compliance | Failure to comply with privacy regulations |

## Security Requirements

Security requirements should be gathered and documented alongside functional requirements. Use the OWASP Application Security Verification Standard (ASVS) as a comprehensive checklist.

### Security Requirements Template

```markdown
## Security Requirement: SR-AUTH-001

**Title:** Multi-factor authentication for administrative access
**Category:** Authentication
**ASVS Reference:** V2.8
**Priority:** Critical
**Requirement:**
  All administrative accounts MUST require multi-factor authentication
  using TOTP (RFC 6238) or WebAuthn. SMS-based MFA MUST NOT be the
  sole second factor.

**Acceptance Criteria:**
  - Admin login page requires a second factor after password verification
  - TOTP setup generates a QR code and recovery codes
  - Failed MFA attempts are logged and rate-limited
  - MFA can be enforced at the organization level

**Threat Mitigated:** Credential stuffing, password compromise
**Abuse Case:** AC-AUTH-001
```

### Security Requirements by Domain

**Authentication Requirements:**
- Strong password policy (minimum 12 characters, no maximum, breach database check)
- Account lockout after repeated failures (with CAPTCHA, not permanent lockout)
- Multi-factor authentication for sensitive operations
- Session timeout (idle and absolute)
- Credential rotation for service accounts

**Authorization Requirements:**
- Default deny — all access must be explicitly granted
- Role-based access control with least privilege
- Resource-level authorization checks (not just endpoint-level)
- Separation of duties for critical operations (e.g., two approvals for wire transfers)

**Data Protection Requirements:**
- Encryption at rest for all sensitive data
- Encryption in transit (TLS 1.2+) for all connections
- Data minimization — only collect and store what is needed
- Data retention policies with automated deletion
- PII anonymization in non-production environments

**Input/Output Requirements:**
- Input validation on all untrusted data
- Output encoding for the appropriate context
- File upload restrictions (type, size, content validation)
- Rate limiting on all public endpoints

---

## Secure Design Patterns

### 1. Defense in Depth

Never rely on a single security control. Layer multiple controls so that if one fails, others still protect the system.

```
Layer 1: Network (firewall, WAF, DDoS protection)
  └── Layer 2: Transport (TLS, certificate pinning)
       └── Layer 3: Application (authentication, authorization, input validation)
            └── Layer 4: Data (encryption at rest, tokenization, access controls)
                 └── Layer 5: Monitoring (logging, alerting, anomaly detection)
```

### 2. Zero Trust Architecture

Never implicitly trust any request, even from inside the network perimeter.

```typescript
// Instead of trusting requests from internal IPs:

// BAD: Implicit trust based on network location
app.use('/internal-api', (req, res, next) => {
  if (req.ip.startsWith('10.0.')) {
    next(); // Trusted because it's "internal"
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

// GOOD: Verify identity regardless of network location
app.use('/internal-api', verifyServiceIdentity, checkPermissions, next);

// verifyServiceIdentity checks mTLS certificate or signed JWT
// checkPermissions verifies the service has permission for this specific endpoint
```

### 3. Secure by Default

The default configuration should be the most secure option. Users should have to explicitly opt into less secure settings.

```typescript
interface SessionConfig {
  secure: boolean;        // Default: true
  httpOnly: boolean;      // Default: true
  sameSite: 'strict' | 'lax' | 'none'; // Default: 'strict'
  maxAge: number;         // Default: 3600 (1 hour)
}

// Default secure configuration
const DEFAULT_SESSION_CONFIG: SessionConfig = {
  secure: true,
  httpOnly: true,
  sameSite: 'strict',
  maxAge: 3600,
};

// Users must explicitly override defaults
function createSession(overrides: Partial<SessionConfig> = {}): SessionConfig {
  const config = { ...DEFAULT_SESSION_CONFIG, ...overrides };

  // Warn when security is being reduced
  if (!config.secure) {
    logger.warn('Session created with secure=false — cookies will be sent over HTTP');
  }
  if (!config.httpOnly) {
    logger.warn('Session created with httpOnly=false — cookies accessible to JavaScript');
  }

  return config;
}
```

### 4. Principle of Least Privilege

Every component should operate with the minimum permissions necessary.

```typescript
// Database: Use separate credentials with limited permissions
// Application database user should NOT have DROP, CREATE, ALTER permissions

// Service accounts: Scope permissions to specific resources
const s3Client = new S3Client({
  credentials: {
    // This IAM role only has s3:GetObject and s3:PutObject
    // on the specific bucket, not s3:*
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// API keys: Scope to specific operations
interface ApiKeyScope {
  resources: string[];    // ['orders:read', 'products:read']
  ipAllowlist?: string[]; // ['203.0.113.0/24']
  rateLimit: number;      // 1000 requests per hour
  expiresAt: Date;
}
```

### 5. Fail Securely

When a security control fails, the system should default to a secure state (deny access) rather than an insecure one (allow access).

```typescript
// BAD: Fail open — if auth service is down, allow access
async function authenticate(token: string): Promise<User | null> {
  try {
    return await authService.verify(token);
  } catch (error) {
    // Auth service is down — let them through anyway
    return { id: 0, role: 'user' } as User;
  }
}

// GOOD: Fail closed — if auth service is down, deny access
async function authenticate(token: string): Promise<User> {
  try {
    const user = await authService.verify(token);
    if (!user) {
      throw new AuthenticationError('Invalid token');
    }
    return user;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    // Auth service is down — deny access and alert
    logger.error('Auth service unavailable', { error: error.message });
    alertOps('Auth service down — all requests being denied');
    throw new ServiceUnavailableError('Authentication temporarily unavailable');
  }
}
```

### 6. Complete Mediation

Every access to every resource must be checked for authorization. Never cache authorization decisions beyond the validity of the credentials.

```typescript
// BAD: Authorization checked once, result cached indefinitely
const authCache = new Map<string, boolean>();

function checkAccess(userId: string, resource: string): boolean {
  const key = `${userId}:${resource}`;
  if (authCache.has(key)) {
    return authCache.get(key)!; // Stale authorization decision
  }
  const allowed = performAuthCheck(userId, resource);
  authCache.set(key, allowed);
  return allowed;
}

// GOOD: Short-lived cache with TTL, invalidation on permission changes
class AuthorizationCache {
  private cache: Map<string, { allowed: boolean; expiresAt: number }> = new Map();
  private readonly TTL_MS = 60_000; // 1 minute

  check(userId: string, resource: string): boolean | null {
    const key = `${userId}:${resource}`;
    const entry = this.cache.get(key);

    if (!entry || entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null; // Cache miss — must check authorization
    }

    return entry.allowed;
  }

  set(userId: string, resource: string, allowed: boolean): void {
    const key = `${userId}:${resource}`;
    this.cache.set(key, {
      allowed,
      expiresAt: Date.now() + this.TTL_MS,
    });
  }

  invalidateUser(userId: string): void {
    for (const [key] of this.cache) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }
}
```

### 7. Separation of Concerns

Critical operations should require multiple components or approvals, so compromising one component is not sufficient.

```typescript
// Dual-authorization for high-value operations
interface TransferRequest {
  id: string;
  from: string;
  to: string;
  amount: number;
  requestedBy: string;
  requestedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
}

async function requestTransfer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { to, amount } = req.body;
  const requesterId = req.user!.id;

  if (amount > 10000) {
    // High-value transfers require dual approval
    const transfer: TransferRequest = {
      id: crypto.randomUUID(),
      from: requesterId,
      to,
      amount,
      requestedBy: requesterId,
      requestedAt: new Date(),
      status: 'pending',
    };

    await saveTransferRequest(transfer);
    await notifyApprovers(transfer);

    res.json({ message: 'Transfer pending approval', transferId: transfer.id });
    return;
  }

  // Low-value transfers can proceed immediately
  await executeTransfer(requesterId, to, amount);
  res.json({ message: 'Transfer complete' });
}

async function approveTransfer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { transferId } = req.params;
  const approverId = req.user!.id;

  const transfer = await getTransferRequest(transferId);

  if (!transfer || transfer.status !== 'pending') {
    res.status(404).json({ error: 'Transfer not found or already processed' });
    return;
  }

  // The approver cannot be the requester
  if (transfer.requestedBy === approverId) {
    res.status(403).json({ error: 'Cannot approve your own transfer' });
    return;
  }

  transfer.approvedBy = approverId;
  transfer.approvedAt = new Date();
  transfer.status = 'approved';

  await updateTransferRequest(transfer);
  await executeTransfer(transfer.from, transfer.to, transfer.amount);

  res.json({ message: 'Transfer approved and executed' });
}
```

---

## Abuse Case Development

Abuse cases (also called misuse cases) describe how an attacker might abuse the system's functionality. They complement use cases by explicitly modeling adversarial behavior.

### Abuse Case Template

```markdown
## Abuse Case: AC-ECOM-001

**Title:** Price Manipulation via Race Condition
**Attacker Profile:** Authenticated customer with moderate technical skill
**Target Feature:** Shopping cart and checkout flow

**Attack Scenario:**
1. Attacker adds an item to cart at $100
2. Attacker initiates checkout
3. Simultaneously, attacker sends a request to update the item's price to $1
   (exploiting a race condition in the cart update logic)
4. Checkout processes with the $1 price

**Impact:** Financial loss (severity: high)
**Likelihood:** Medium (requires knowledge of API timing)
**Risk Rating:** High

**Countermeasures:**
- Lock cart items at the start of checkout
- Re-validate prices from the source of truth (product catalog) at payment time
- Use database transactions with proper isolation levels
- Log price discrepancies for fraud detection
```

### Common Business Logic Abuse Cases

**E-Commerce:**

```typescript
// Abuse Case: Negative Quantity
// Attacker sets quantity to -1 to get a refund credit

// VULNERABLE
app.post('/api/cart/update', async (req, res) => {
  const { itemId, quantity } = req.body;
  const price = await getItemPrice(itemId);
  const total = price * quantity; // -1 * $100 = -$100 (credit!)
  await updateCartItem(req.user.id, itemId, quantity, total);
  res.json({ total });
});

// SECURE
app.post('/api/cart/update', async (req, res) => {
  const schema = z.object({
    itemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(100), // Enforce positive quantity with max
  });

  const { itemId, quantity } = schema.parse(req.body);
  const price = await getItemPrice(itemId);

  if (price <= 0) {
    return res.status(400).json({ error: 'Invalid item price' });
  }

  const total = price * quantity;
  await updateCartItem(req.user.id, itemId, quantity, total);
  res.json({ total });
});
```

**Coupon/Discount Abuse:**

```typescript
// Abuse Case: Coupon stacking, coupon reuse, coupon brute-forcing

// SECURE: Complete coupon validation
async function applyCoupon(
  userId: string,
  orderId: string,
  couponCode: string
): Promise<{ discount: number }> {
  // Rate limit coupon attempts per user
  const attempts = await rateLimiter.check(`coupon:${userId}`, 10, '1h');
  if (attempts.exceeded) {
    throw new Error('Too many coupon attempts');
  }

  const coupon = await db.query(
    'SELECT * FROM coupons WHERE code = $1 FOR UPDATE', // Lock the row
    [couponCode]
  );

  if (!coupon) {
    throw new Error('Invalid coupon');
  }

  // Check expiration
  if (new Date(coupon.expires_at) < new Date()) {
    throw new Error('Coupon expired');
  }

  // Check usage limit
  if (coupon.uses >= coupon.max_uses) {
    throw new Error('Coupon usage limit reached');
  }

  // Check per-user limit
  const userUses = await db.query(
    'SELECT COUNT(*) FROM coupon_uses WHERE coupon_id = $1 AND user_id = $2',
    [coupon.id, userId]
  );
  if (userUses.count >= coupon.per_user_limit) {
    throw new Error('Coupon already used');
  }

  // Check if another coupon is already applied
  const existingCoupons = await db.query(
    'SELECT COUNT(*) FROM order_coupons WHERE order_id = $1',
    [orderId]
  );
  if (existingCoupons.count > 0 && !coupon.stackable) {
    throw new Error('Cannot stack coupons');
  }

  // Check minimum order value
  const orderTotal = await calculateOrderTotal(orderId);
  if (orderTotal < coupon.min_order_value) {
    throw new Error(`Minimum order value is $${coupon.min_order_value}`);
  }

  // Apply coupon atomically
  await db.transaction(async (tx) => {
    await tx.query(
      'UPDATE coupons SET uses = uses + 1 WHERE id = $1',
      [coupon.id]
    );
    await tx.query(
      'INSERT INTO coupon_uses (coupon_id, user_id, order_id) VALUES ($1, $2, $3)',
      [coupon.id, userId, orderId]
    );
    await tx.query(
      'INSERT INTO order_coupons (order_id, coupon_id, discount) VALUES ($1, $2, $3)',
      [orderId, coupon.id, coupon.discount_amount]
    );
  });

  return { discount: coupon.discount_amount };
}
```

**Race Condition Abuse:**

```typescript
// Abuse Case: Double-spending via race condition
// Two simultaneous requests to spend the same balance

// VULNERABLE: Check-then-act without locking
async function transferFunds(from: string, to: string, amount: number) {
  const balance = await db.query('SELECT balance FROM accounts WHERE id = $1', [from]);

  if (balance < amount) {
    throw new Error('Insufficient funds');
  }

  // Race condition: two concurrent requests both pass the check
  await db.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, from]);
  await db.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, to]);
}

// SECURE: Use database transaction with row-level locking
async function transferFunds(from: string, to: string, amount: number) {
  await db.transaction(async (tx) => {
    // SELECT FOR UPDATE acquires an exclusive lock on the row
    const result = await tx.query(
      'SELECT balance FROM accounts WHERE id = $1 FOR UPDATE',
      [from]
    );

    const balance = result.rows[0].balance;

    if (balance < amount) {
      throw new Error('Insufficient funds');
    }

    await tx.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
      [amount, from]
    );
    await tx.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
      [amount, to]
    );

    // Insert audit trail
    await tx.query(
      `INSERT INTO transfers (from_account, to_account, amount, timestamp)
       VALUES ($1, $2, $3, NOW())`,
      [from, to, amount]
    );
  });
}
```

---

## Secure Design Review Checklist

### Architecture Review

- [ ] Data flow diagrams are current and include trust boundaries
- [ ] Threat model has been created and reviewed
- [ ] All external interfaces are documented with security controls
- [ ] Sensitive data is classified and mapped to storage locations
- [ ] Encryption is applied to data at rest and in transit
- [ ] Authentication and authorization architecture is documented
- [ ] Service-to-service communication uses mutual authentication

### Business Logic Review

- [ ] Abuse cases are documented for each critical business function
- [ ] Rate limiting is designed for all public-facing operations
- [ ] Transaction integrity is maintained (ACID properties)
- [ ] Race conditions are addressed with proper locking mechanisms
- [ ] Input validation is designed for all user-controlled inputs
- [ ] Price, quantity, and balance calculations are server-side only
- [ ] Multi-step processes cannot be completed out of order
- [ ] Dual authorization is required for high-risk operations

### Error Handling Review

- [ ] Errors fail securely (deny access on failure)
- [ ] Error messages do not leak implementation details
- [ ] Error handling is consistent across the application
- [ ] Unhandled exceptions are caught at the top level
- [ ] Circuit breakers protect against cascading failures

### Monitoring Design

- [ ] Security events are logged (authentication, authorization, data access)
- [ ] Anomaly detection is designed for critical business flows
- [ ] Alerting thresholds are defined for security events
- [ ] Audit trails are tamper-evident

## References

- CWE-840: Business Logic Errors
- CWE-362: Concurrent Execution Using Shared Resource (Race Condition)
- CWE-799: Improper Control of Interaction Frequency
- OWASP Application Security Verification Standard (ASVS)
- OWASP Threat Modeling Cheat Sheet
- Microsoft SDL Threat Modeling
- NIST SP 800-160: Systems Security Engineering
