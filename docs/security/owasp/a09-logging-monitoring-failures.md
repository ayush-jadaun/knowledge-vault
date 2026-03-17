---
title: "A09: Security Logging and Monitoring Failures"
description: Comprehensive guide to security logging including what to log, what NOT to log, structured security logging, SIEM integration, audit trails, and compliance logging requirements
tags: [security, owasp, logging, monitoring, siem, audit-trail, compliance]
difficulty: advanced
prerequisites:
  - owasp/index
  - Understanding of application observability concepts
  - Node.js fundamentals
lastReviewed: "2026-03-17"
---

# A09: Security Logging and Monitoring Failures

Insufficient logging, detection, monitoring, and active response occurs more often than you think. Without proper logging and monitoring, breaches cannot be detected. According to studies, the average time to detect a breach is over 200 days. Effective logging and monitoring can dramatically reduce this detection time and limit the impact of security incidents.

## Why Logging Matters for Security

Logging serves multiple critical security functions:

1. **Detection** — Identify attacks in progress or after the fact
2. **Investigation** — Reconstruct the sequence of events during an incident
3. **Compliance** — Meet regulatory requirements (PCI DSS, HIPAA, SOC 2, GDPR)
4. **Deterrence** — Attackers are less likely to persist if they know actions are logged
5. **Forensics** — Provide evidence for legal proceedings
6. **Metrics** — Measure security posture and improvement over time

---

## 1. What to Log

### Security Events That Must Be Logged

```typescript
import winston from 'winston';

// Structured security logger
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'ISO' }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'api-server',
    environment: process.env.NODE_ENV,
    hostname: os.hostname(),
  },
  transports: [
    new winston.transports.File({
      filename: '/var/log/app/security.log',
      maxsize: 100 * 1024 * 1024, // 100 MB
      maxFiles: 30,
      tailable: true,
    }),
    // Also send to centralized log system
    new winston.transports.Http({
      host: 'logs.example.com',
      port: 443,
      ssl: true,
      path: '/ingest',
    }),
  ],
});

// ═══════════════════════════════════════════════════════
// AUTHENTICATION EVENTS
// ═══════════════════════════════════════════════════════

function logAuthSuccess(userId: string, req: Request): void {
  securityLogger.info('Authentication successful', {
    event: 'auth.login.success',
    userId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    method: 'password', // or 'sso', 'mfa', 'api_key'
    requestId: req.headers['x-request-id'],
  });
}

function logAuthFailure(email: string, req: Request, reason: string): void {
  securityLogger.warn('Authentication failed', {
    event: 'auth.login.failure',
    email, // Log the attempted email (not the password!)
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    reason, // 'invalid_password', 'user_not_found', 'account_locked', 'mfa_failed'
    requestId: req.headers['x-request-id'],
  });
}

function logLogout(userId: string, req: Request, reason: string): void {
  securityLogger.info('User logged out', {
    event: 'auth.logout',
    userId,
    ip: req.ip,
    reason, // 'user_initiated', 'session_expired', 'forced_by_admin'
    requestId: req.headers['x-request-id'],
  });
}

function logMfaEvent(userId: string, req: Request, action: string, success: boolean): void {
  securityLogger.info('MFA event', {
    event: `auth.mfa.${action}`,
    userId,
    ip: req.ip,
    success,
    method: 'totp', // or 'webauthn', 'sms', 'push'
    requestId: req.headers['x-request-id'],
  });
}

// ═══════════════════════════════════════════════════════
// AUTHORIZATION EVENTS
// ═══════════════════════════════════════════════════════

function logAccessDenied(userId: string, req: Request, resource: string, action: string): void {
  securityLogger.warn('Access denied', {
    event: 'authz.denied',
    userId,
    resource,
    action,
    ip: req.ip,
    path: req.path,
    method: req.method,
    requestId: req.headers['x-request-id'],
  });
}

function logPrivilegeEscalation(userId: string, req: Request, fromRole: string, toRole: string): void {
  securityLogger.warn('Privilege escalation attempt', {
    event: 'authz.escalation',
    severity: 'high',
    userId,
    fromRole,
    toRole,
    ip: req.ip,
    path: req.path,
    requestId: req.headers['x-request-id'],
  });
}

// ═══════════════════════════════════════════════════════
// DATA ACCESS EVENTS
// ═══════════════════════════════════════════════════════

function logDataAccess(userId: string, req: Request, resource: string, recordCount: number): void {
  securityLogger.info('Data accessed', {
    event: 'data.access',
    userId,
    resource,
    recordCount,
    ip: req.ip,
    path: req.path,
    query: sanitizeQuery(req.query), // Remove sensitive params
    requestId: req.headers['x-request-id'],
  });
}

function logDataModification(
  userId: string,
  req: Request,
  resource: string,
  action: 'create' | 'update' | 'delete',
  recordId: string
): void {
  securityLogger.info('Data modified', {
    event: `data.${action}`,
    userId,
    resource,
    recordId,
    ip: req.ip,
    path: req.path,
    requestId: req.headers['x-request-id'],
  });
}

function logBulkDataExport(userId: string, req: Request, resource: string, recordCount: number): void {
  securityLogger.warn('Bulk data export', {
    event: 'data.export',
    severity: 'medium',
    userId,
    resource,
    recordCount,
    ip: req.ip,
    requestId: req.headers['x-request-id'],
  });
}

// ═══════════════════════════════════════════════════════
// SECURITY CONFIGURATION EVENTS
// ═══════════════════════════════════════════════════════

function logConfigChange(userId: string, req: Request, setting: string, oldValue: string, newValue: string): void {
  securityLogger.warn('Security configuration changed', {
    event: 'config.change',
    severity: 'high',
    userId,
    setting,
    oldValue,
    newValue,
    ip: req.ip,
    requestId: req.headers['x-request-id'],
  });
}

// ═══════════════════════════════════════════════════════
// INPUT VALIDATION EVENTS
// ═══════════════════════════════════════════════════════

function logInputValidationFailure(req: Request, field: string, reason: string): void {
  securityLogger.warn('Input validation failure', {
    event: 'input.validation.failure',
    ip: req.ip,
    path: req.path,
    method: req.method,
    field,
    reason,
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'],
  });
}

function logSuspiciousInput(req: Request, field: string, pattern: string): void {
  securityLogger.warn('Suspicious input detected', {
    event: 'input.suspicious',
    severity: 'medium',
    ip: req.ip,
    path: req.path,
    method: req.method,
    field,
    pattern, // 'sql_injection', 'xss', 'path_traversal', 'command_injection'
    requestId: req.headers['x-request-id'],
  });
}

// ═══════════════════════════════════════════════════════
// SYSTEM AND APPLICATION EVENTS
// ═══════════════════════════════════════════════════════

function logApplicationError(error: Error, req: Request): void {
  securityLogger.error('Application error', {
    event: 'app.error',
    errorName: error.name,
    errorMessage: error.message,
    // Only include stack trace in non-production or internal logs
    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    ip: req.ip,
    path: req.path,
    method: req.method,
    requestId: req.headers['x-request-id'],
  });
}

function logRateLimitExceeded(req: Request, limit: string): void {
  securityLogger.warn('Rate limit exceeded', {
    event: 'rate_limit.exceeded',
    ip: req.ip,
    path: req.path,
    limit,
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'],
  });
}
```

### Complete Security Event Catalog

| Category | Event | Severity | Log Level |
|----------|-------|----------|-----------|
| Authentication | Login success | Info | info |
| Authentication | Login failure | Warning | warn |
| Authentication | Account lockout | Warning | warn |
| Authentication | Password change | Info | info |
| Authentication | Password reset request | Info | info |
| Authentication | MFA enrollment | Info | info |
| Authentication | MFA failure | Warning | warn |
| Authorization | Access denied | Warning | warn |
| Authorization | Privilege escalation attempt | High | warn |
| Authorization | Role change | High | warn |
| Data | Sensitive data accessed | Info | info |
| Data | Bulk data export | Medium | warn |
| Data | Data modification | Info | info |
| Data | Data deletion | Medium | info |
| Configuration | Security setting changed | High | warn |
| Configuration | User created/deleted | Medium | info |
| Configuration | API key created/revoked | Medium | info |
| Input | Validation failure | Info | warn |
| Input | Suspicious pattern detected | Medium | warn |
| Rate Limiting | Limit exceeded | Warning | warn |
| System | Application startup/shutdown | Info | info |
| System | Unhandled exception | Error | error |
| System | Dependency vulnerability detected | High | warn |

---

## 2. What NOT to Log

Logging sensitive data creates a second copy of that data outside of its normal protection controls. Log files are often less protected than databases, may be shipped to third-party log aggregation services, and may be retained for extended periods.

### Data That Must Never Be Logged

```typescript
// DANGEROUS: Logging sensitive data
function badLogging(req: Request): void {
  // NEVER log these:
  logger.info('Login attempt', {
    password: req.body.password,           // NEVER log passwords
    creditCard: req.body.cardNumber,       // NEVER log card numbers
    ssn: req.body.ssn,                     // NEVER log SSN/national IDs
    token: req.headers.authorization,      // NEVER log auth tokens
    apiKey: req.headers['x-api-key'],      // NEVER log API keys
    sessionId: req.cookies.sid,            // NEVER log session IDs
    dateOfBirth: req.body.dob,             // Avoid logging PII
    healthData: req.body.diagnosis,        // NEVER log PHI (HIPAA)
    privateKey: process.env.PRIVATE_KEY,   // NEVER log cryptographic keys
  });
}

// SECURE: Sanitized logging
function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = new Set([
    'password', 'passwd', 'pwd', 'secret',
    'token', 'accessToken', 'refreshToken', 'access_token', 'refresh_token',
    'apiKey', 'api_key', 'apiSecret', 'api_secret',
    'authorization', 'cookie', 'session', 'sessionId', 'session_id',
    'creditCard', 'credit_card', 'cardNumber', 'card_number', 'cvv', 'cvc',
    'ssn', 'socialSecurity', 'social_security', 'nationalId', 'national_id',
    'privateKey', 'private_key', 'secretKey', 'secret_key',
    'dateOfBirth', 'date_of_birth', 'dob',
    'healthData', 'diagnosis', 'prescription',
  ]);

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.substring(0, 100) + '...[TRUNCATED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// Middleware to sanitize request logging
function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    const logData: Record<string, unknown> = {
      event: 'http.request',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.headers['x-request-id'],
      userId: (req as any).user?.id,
      contentLength: res.getHeader('content-length'),
    };

    // Log query params but sanitize sensitive ones
    if (Object.keys(req.query).length > 0) {
      logData.query = sanitizeForLogging(req.query as Record<string, unknown>);
    }

    if (res.statusCode >= 500) {
      securityLogger.error('Server error response', logData);
    } else if (res.statusCode >= 400) {
      securityLogger.warn('Client error response', logData);
    } else {
      securityLogger.info('Request completed', logData);
    }
  });

  next();
}
```

### Masking Techniques

```typescript
// Email masking: user@example.com → u***@example.com
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '[invalid-email]';
  return `${local[0]}***@${domain}`;
}

// Credit card masking: 4111111111111111 → ****1111
function maskCreditCard(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  return `****${digits.slice(-4)}`;
}

// IP address masking (for GDPR compliance): 192.168.1.100 → 192.168.1.0
function maskIP(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  return ip; // IPv6 or other format — handle accordingly
}

// Phone masking: +1-555-123-4567 → +1-555-***-4567
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 7) {
    return phone.replace(/\d(?=\d{4})/g, '*').replace(/\*{4,}/, '****');
  }
  return '[REDACTED]';
}
```

---

## 3. Structured Security Logging

### Log Format

All security logs should use a consistent structured format (JSON) with standardized fields.

```typescript
interface SecurityLogEntry {
  // Required fields
  timestamp: string;         // ISO 8601 format
  level: 'info' | 'warn' | 'error' | 'critical';
  event: string;             // Dot-notation event type (e.g., 'auth.login.failure')
  message: string;           // Human-readable description

  // Context fields
  service: string;           // Service name
  environment: string;       // 'production', 'staging', 'development'
  hostname: string;          // Server hostname
  requestId: string;         // Unique request ID for correlation

  // Actor fields (who)
  userId?: string;           // Authenticated user ID
  ip?: string;               // Client IP address
  userAgent?: string;        // Client user agent

  // Action fields (what)
  resource?: string;         // Resource being accessed
  action?: string;           // Action being performed
  outcome?: 'success' | 'failure'; // Result of the action

  // Additional context
  severity?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>; // Additional structured data
}

// Winston format for consistent output
const securityFormat = winston.format.printf(
  ({ timestamp, level, message, event, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      event,
      message,
      ...meta,
    });
  }
);
```

### Correlation IDs

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

// Create a request context that persists across async operations
const requestContext = new AsyncLocalStorage<{
  requestId: string;
  userId?: string;
  traceId?: string;
}>();

// Middleware to establish request context
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  const traceId = (req.headers['x-trace-id'] as string) || crypto.randomUUID();

  res.setHeader('X-Request-ID', requestId);

  requestContext.run({ requestId, traceId }, () => {
    next();
  });
});

// Logger automatically includes correlation IDs
function getSecurityLogger() {
  const context = requestContext.getStore();

  return {
    info: (message: string, data: Record<string, unknown> = {}) => {
      securityLogger.info(message, {
        ...data,
        requestId: context?.requestId,
        traceId: context?.traceId,
        userId: context?.userId,
      });
    },
    warn: (message: string, data: Record<string, unknown> = {}) => {
      securityLogger.warn(message, {
        ...data,
        requestId: context?.requestId,
        traceId: context?.traceId,
        userId: context?.userId,
      });
    },
    error: (message: string, data: Record<string, unknown> = {}) => {
      securityLogger.error(message, {
        ...data,
        requestId: context?.requestId,
        traceId: context?.traceId,
        userId: context?.userId,
      });
    },
  };
}
```

---

## 4. SIEM Integration

Security Information and Event Management (SIEM) systems aggregate logs from multiple sources, correlate events, and generate alerts.

### Common SIEM Platforms

| Platform | Type | Key Features |
|----------|------|--------------|
| Splunk | Commercial | Powerful query language (SPL), machine learning |
| Elastic SIEM | Open Source / Commercial | ELK stack, Kibana dashboards |
| Microsoft Sentinel | Cloud | Azure-native, KQL queries, playbooks |
| Datadog Security | SaaS | APM + security, cloud-native |
| Sumo Logic | SaaS | Cloud-native, real-time analytics |
| Wazuh | Open Source | HIDS + SIEM, compliance reporting |

### Shipping Logs to SIEM

```typescript
// Using Winston with multiple transports
import { ElasticsearchTransport } from 'winston-elasticsearch';

const esTransport = new ElasticsearchTransport({
  level: 'info',
  index: 'security-logs',
  clientOpts: {
    node: process.env.ELASTICSEARCH_URL,
    auth: {
      username: process.env.ES_USERNAME!,
      password: process.env.ES_PASSWORD!,
    },
    tls: {
      rejectUnauthorized: true,
    },
  },
  transformer: (logData) => ({
    '@timestamp': logData.timestamp || new Date().toISOString(),
    severity: logData.level,
    message: logData.message,
    fields: logData.meta,
  }),
  bufferLimit: 100,
  flushInterval: 5000, // Send every 5 seconds
});

securityLogger.add(esTransport);

// Syslog transport (for traditional SIEMs)
import { Syslog } from 'winston-syslog';

securityLogger.add(new Syslog({
  host: 'siem.example.com',
  port: 514,
  protocol: 'tcp4',
  facility: 'auth',
  app_name: 'api-server',
  eol: '\n',
}));
```

### Alert Rules

```yaml
# Example Elasticsearch/Kibana alert rules

# Rule 1: Brute force detection
- name: "Brute Force Attack Detected"
  query: |
    event: "auth.login.failure" AND
    NOT ip: ("10.0.0.0/8" OR "172.16.0.0/12" OR "192.168.0.0/16")
  threshold:
    count: 10
    timeWindow: "5m"
    groupBy: "ip"
  severity: high
  actions:
    - type: webhook
      url: "https://alerts.example.com/incident"
    - type: email
      to: "security-team@example.com"

# Rule 2: Unusual data access
- name: "Bulk Data Access Detected"
  query: |
    event: "data.export" AND recordCount: >1000
  threshold:
    count: 1
    timeWindow: "1h"
  severity: medium
  actions:
    - type: slack
      channel: "#security-alerts"

# Rule 3: Account takeover indicators
- name: "Account Takeover Indicators"
  query: |
    (event: "auth.login.success" AND metadata.newDevice: true) AND
    (event: "data.access" AND resource: "financial") WITHIN 10m
  severity: high

# Rule 4: Off-hours admin activity
- name: "Admin Activity Outside Business Hours"
  query: |
    event: "config.change" AND
    NOT (timestamp.hour >= 9 AND timestamp.hour <= 17 AND
         timestamp.dayOfWeek IN ["Mon","Tue","Wed","Thu","Fri"])
  severity: medium

# Rule 5: Multiple failed MFA attempts
- name: "MFA Bypass Attempt"
  query: |
    event: "auth.mfa.verify" AND outcome: "failure"
  threshold:
    count: 5
    timeWindow: "10m"
    groupBy: "userId"
  severity: high
```

---

## 5. Audit Trails

Audit trails provide a complete, tamper-evident record of all actions performed on sensitive data or systems. They are required by many compliance frameworks.

### Immutable Audit Log Implementation

```typescript
import crypto from 'crypto';

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: {
    userId: string;
    ip: string;
    userAgent: string;
    role: string;
  };
  action: string;
  resource: {
    type: string;
    id: string;
  };
  details: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

class AuditTrail {
  private readonly hmacKey: Buffer;

  constructor(hmacKey: Buffer) {
    this.hmacKey = hmacKey;
  }

  async createEntry(
    actor: AuditEntry['actor'],
    action: string,
    resource: AuditEntry['resource'],
    details: Record<string, unknown>
  ): Promise<AuditEntry> {
    // Get the hash of the last entry for chain integrity
    const lastEntry = await db.query(
      'SELECT hash FROM audit_log ORDER BY created_at DESC LIMIT 1'
    );
    const previousHash = lastEntry.rows[0]?.hash || '0'.repeat(64);

    const entry: Omit<AuditEntry, 'hash'> = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: {
        userId: actor.userId,
        ip: actor.ip,
        userAgent: actor.userAgent,
        role: actor.role,
      },
      action,
      resource,
      details: sanitizeForLogging(details),
      previousHash,
    };

    // Compute HMAC hash for integrity
    const hash = crypto
      .createHmac('sha256', this.hmacKey)
      .update(JSON.stringify(entry))
      .digest('hex');

    const fullEntry: AuditEntry = { ...entry, hash };

    // Store in append-only table
    await db.query(
      `INSERT INTO audit_log (id, timestamp, actor_user_id, actor_ip, actor_ua,
       actor_role, action, resource_type, resource_id, details, previous_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        fullEntry.id, fullEntry.timestamp,
        actor.userId, actor.ip, actor.userAgent, actor.role,
        action, resource.type, resource.id,
        JSON.stringify(fullEntry.details),
        previousHash, hash,
      ]
    );

    return fullEntry;
  }

  async verifyIntegrity(): Promise<{
    valid: boolean;
    entries: number;
    firstInvalidId?: string;
  }> {
    const entries = await db.query(
      'SELECT * FROM audit_log ORDER BY created_at ASC'
    );

    let previousHash = '0'.repeat(64);

    for (const row of entries.rows) {
      // Verify chain linkage
      if (row.previous_hash !== previousHash) {
        return {
          valid: false,
          entries: entries.rows.length,
          firstInvalidId: row.id,
        };
      }

      // Recompute hash
      const entry = {
        id: row.id,
        timestamp: row.timestamp,
        actor: {
          userId: row.actor_user_id,
          ip: row.actor_ip,
          userAgent: row.actor_ua,
          role: row.actor_role,
        },
        action: row.action,
        resource: {
          type: row.resource_type,
          id: row.resource_id,
        },
        details: row.details,
        previousHash: row.previous_hash,
      };

      const computedHash = crypto
        .createHmac('sha256', this.hmacKey)
        .update(JSON.stringify(entry))
        .digest('hex');

      if (computedHash !== row.hash) {
        return {
          valid: false,
          entries: entries.rows.length,
          firstInvalidId: row.id,
        };
      }

      previousHash = row.hash;
    }

    return { valid: true, entries: entries.rows.length };
  }
}

// Database: Create append-only audit table
// PostgreSQL:
// CREATE TABLE audit_log (...);
// REVOKE UPDATE, DELETE ON audit_log FROM app_user;
// GRANT INSERT, SELECT ON audit_log TO app_user;
// -- Only the DBA can modify or delete audit entries
```

### Audit Trail Middleware

```typescript
const audit = new AuditTrail(Buffer.from(process.env.AUDIT_HMAC_KEY!, 'hex'));

function auditMiddleware(action: string, resourceType: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      // Only audit successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        audit.createEntry(
          {
            userId: req.user?.id || 'anonymous',
            ip: req.ip!,
            userAgent: req.headers['user-agent'] || '',
            role: req.user?.role || 'none',
          },
          action,
          {
            type: resourceType,
            id: req.params.id || body?.id || 'unknown',
          },
          {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
          }
        ).catch(err => {
          securityLogger.error('Audit trail write failed', {
            error: err.message,
            action,
            resourceType,
          });
        });
      }

      return originalJson(body);
    };

    next();
  };
}

// Usage
app.post(
  '/api/users',
  authenticate,
  requireRole('admin'),
  auditMiddleware('create', 'user'),
  createUserHandler
);

app.delete(
  '/api/users/:id',
  authenticate,
  requireRole('admin'),
  auditMiddleware('delete', 'user'),
  deleteUserHandler
);
```

---

## 6. Compliance Logging Requirements

### PCI DSS Requirements (Payment Card Industry)

```
Requirement 10: Track and monitor all access to network resources and cardholder data

10.2 - Implement automated audit trails for all system components:
  10.2.1 - All individual user accesses to cardholder data
  10.2.2 - All actions taken by any individual with root or admin privileges
  10.2.3 - Access to all audit trails
  10.2.4 - Invalid logical access attempts
  10.2.5 - Use of and changes to identification and authentication mechanisms
  10.2.6 - Initialization, stopping, or pausing of audit logs
  10.2.7 - Creation and deletion of system-level objects

10.3 - Record at least the following audit trail entries:
  10.3.1 - User identification
  10.3.2 - Type of event
  10.3.3 - Date and time
  10.3.4 - Success or failure indication
  10.3.5 - Origination of event
  10.3.6 - Identity or name of affected data, system component, or resource

10.5 - Secure audit trails so they cannot be altered
10.7 - Retain audit trail history for at least one year
```

### GDPR Requirements

```
Article 30 - Records of processing activities:
  - Log all processing of personal data
  - Record the purposes of processing
  - Record categories of data subjects and personal data
  - Record recipients of personal data
  - Record data transfers to third countries

Article 33 - Notification of a personal data breach:
  - Detect breaches within 72 hours
  - This requires adequate logging and monitoring

Right to be forgotten implications:
  - Audit logs containing personal data must be addressed
  - Consider pseudonymization of user identifiers in logs
  - Define retention periods for logs containing PII
```

### SOC 2 Requirements

```
CC7.2 - The entity monitors system components for anomalies
CC7.3 - The entity evaluates security events to determine whether they indicate a failure
CC7.4 - The entity responds to identified security incidents

Logging requirements:
  - System access logging
  - Change management logging
  - Incident detection and response
  - Data access monitoring
  - Third-party activity monitoring
```

---

## Log Protection and Retention

```typescript
// Log rotation and retention configuration
const logConfig = {
  // Rotate logs daily
  rotation: {
    frequency: 'daily',
    maxSize: '100MB',
    maxFiles: 365, // 1 year retention
    compress: true,
  },

  // Protect log integrity
  integrity: {
    // Ship logs to a separate, write-only log server
    // Use append-only storage (WORM — Write Once Read Many)
    // Hash log entries for tamper detection
    // Use TLS for log transport
  },

  // Access control
  access: {
    // Logs should be readable only by authorized personnel
    // Use separate credentials for log access
    // Audit access to the logs themselves
  },
};
```

---

## Prevention Checklist

- [ ] Log all authentication events (success and failure)
- [ ] Log all authorization failures
- [ ] Log all input validation failures
- [ ] Log all data access to sensitive resources
- [ ] Log all administrative actions
- [ ] Use structured logging (JSON) with consistent fields
- [ ] Include correlation IDs (request ID, trace ID) in all log entries
- [ ] Never log passwords, tokens, API keys, credit card numbers, or PII
- [ ] Sanitize all log entries to prevent log injection
- [ ] Ship logs to a centralized SIEM or log aggregation service
- [ ] Configure alerts for security events (brute force, privilege escalation, bulk data access)
- [ ] Implement tamper-evident audit trails for compliance
- [ ] Protect log storage with access controls and encryption
- [ ] Retain logs for at least 1 year (or as required by compliance)
- [ ] Regularly verify audit trail integrity
- [ ] Test that logging works correctly (include in integration tests)
- [ ] Monitor for gaps in logging (missing events, failed log shipping)

## References

- CWE-223: Omission of Security-Relevant Information
- CWE-778: Insufficient Logging
- CWE-532: Insertion of Sensitive Information into Log File
- OWASP Logging Cheat Sheet
- NIST SP 800-92: Guide to Computer Security Log Management
- PCI DSS Requirement 10
- GDPR Articles 30, 33
