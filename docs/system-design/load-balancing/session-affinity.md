---
title: "Session Affinity"
description: "Complete guide to sticky sessions and session affinity — cookie-based, IP-based, and header-based approaches, their problems (uneven load, failover data loss), and modern stateless alternatives using Redis and JWTs"
tags: [load-balancing, session-affinity, sticky-sessions, cookies, redis, jwt, stateless, session-management]
difficulty: intermediate
prerequisites: [load-balancing, algorithms]
lastReviewed: "2026-03-17"
---

# Session Affinity

Session affinity (also called "sticky sessions") is the practice of routing all requests from the same client to the same backend server for the duration of a session. It exists because many applications store session state in local memory — shopping cart contents, authentication tokens, form wizard progress, WebSocket connections — and if a subsequent request lands on a different server, that state is lost.

Session affinity is simultaneously one of the most requested load balancer features and one of the most problematic. It solves the immediate pain of stateful applications but creates a cascade of operational issues: uneven load distribution, failover data loss, deployment complexity, and architectural rigidity. Understanding when to use it, when to avoid it, and what alternatives exist is critical for building resilient systems.

## Why Session Affinity Exists

Consider a simple shopping cart flow without session affinity:

```mermaid
sequenceDiagram
    participant Client
    participant LB as Load Balancer
    participant S1 as Server 1
    participant S2 as Server 2

    Client->>LB: POST /cart/add (item: Widget)
    LB->>S1: POST /cart/add (item: Widget)
    Note over S1: Store in memory:<br/>session["abc"].cart = ["Widget"]
    S1->>LB: 200 OK
    LB->>Client: 200 OK

    Client->>LB: GET /cart
    LB->>S2: GET /cart (different server!)
    Note over S2: session["abc"] = ???<br/>Cart is empty!
    S2->>LB: 200 OK { cart: [] }
    LB->>Client: 200 OK { cart: [] }
    Note over Client: Cart items vanished!
```

The load balancer distributed the two requests to different servers. Server 2 has no knowledge of the cart items added on Server 1. The user sees an empty cart.

Session affinity solves this by ensuring the second request goes to Server 1:

```mermaid
sequenceDiagram
    participant Client
    participant LB as Load Balancer
    participant S1 as Server 1
    participant S2 as Server 2

    Client->>LB: POST /cart/add (item: Widget)
    LB->>S1: POST /cart/add
    Note over S1: Store in memory:<br/>session["abc"].cart = ["Widget"]
    S1->>LB: 200 OK + Set-Cookie: SERVERID=s1
    LB->>Client: 200 OK + Set-Cookie: SERVERID=s1

    Client->>LB: GET /cart + Cookie: SERVERID=s1
    Note over LB: Cookie says Server 1<br/>Route to Server 1
    LB->>S1: GET /cart
    Note over S1: session["abc"].cart = ["Widget"]<br/>Cart found!
    S1->>LB: 200 OK { cart: ["Widget"] }
    LB->>Client: 200 OK { cart: ["Widget"] }
```

## Session Affinity Methods

### 1. Cookie-Based Affinity

The load balancer inserts a cookie into the response that identifies which backend server handled the request. On subsequent requests, the LB reads this cookie and routes to the same server.

#### LB-Injected Cookie

The load balancer generates and manages the cookie. The application is unaware.

```
First request (no cookie):
  Client → LB → selects Server 3 → Server 3 responds
  LB adds header: Set-Cookie: SERVERID=srv3; Path=/; HttpOnly

Subsequent requests:
  Client sends: Cookie: SERVERID=srv3
  LB reads cookie → routes to Server 3
```

**NGINX configuration:**

```nginx
upstream backend {
    # ip_hash;   # Alternative: IP-based affinity
    server 10.0.1.1:8080;
    server 10.0.1.2:8080;
    server 10.0.1.3:8080;
}

server {
    location / {
        proxy_pass http://backend;

        # NGINX Plus: cookie-based session persistence
        # sticky cookie srv_id expires=1h domain=.example.com path=/;
    }
}
```

**HAProxy configuration:**

```
backend web_servers
    balance roundrobin
    cookie SERVERID insert indirect nocache

    server web1 10.0.1.1:8080 check cookie s1
    server web2 10.0.1.2:8080 check cookie s2
    server web3 10.0.1.3:8080 check cookie s3
```

- `insert`: HAProxy adds the cookie (app doesn't need to)
- `indirect`: HAProxy removes the cookie before forwarding to the backend (backend never sees it)
- `nocache`: Adds `Cache-Control: no-cache` and `Pragma: no-cache` to responses that set the cookie
- `cookie s1/s2/s3`: The value mapped to each server

#### Application-Set Cookie

The application sets a session cookie (e.g., `JSESSIONID` in Java, `connect.sid` in Express). The LB learns which server issued which session and routes accordingly.

```
backend web_servers
    balance roundrobin
    cookie JSESSIONID prefix nocache

    server web1 10.0.1.1:8080 check cookie s1
    server web2 10.0.1.2:8080 check cookie s2
```

With `prefix`, HAProxy prepends the server identifier to the existing cookie value: `JSESSIONID=s1~abc123def456`. On subsequent requests, HAProxy extracts the prefix, routes to server `s1`, and forwards the original cookie value `abc123def456` to the backend.

#### Cookie-Based Affinity Advantages

- Works across different client IPs (mobile users switching between WiFi and cellular)
- Works through NAT and proxies (the cookie travels with the HTTP request)
- The LB can detect if the target server is down and re-route (with a new cookie)
- Can set expiration to control session lifetime

#### Cookie-Based Affinity Disadvantages

- Requires HTTP (doesn't work for TCP/UDP protocols)
- Requires the client to support and return cookies
- First request has no cookie — must use a different algorithm for initial placement
- Adds cookie overhead to every request/response
- Cookie security concerns (tampering, replay) if not properly signed

### 2. IP-Based Affinity

Hash the client's IP address to determine the target server. Same IP always goes to the same server.

```
Client IP: 203.0.113.45
Hash: hash("203.0.113.45") = 724918372
Server: 724918372 % 3 = 1 → Server 2
```

**NGINX:**

```nginx
upstream backend {
    ip_hash;
    server 10.0.1.1:8080;
    server 10.0.1.2:8080;
    server 10.0.1.3:8080;
}
```

**HAProxy:**

```
backend web_servers
    balance source
    hash-type consistent

    server web1 10.0.1.1:8080 check
    server web2 10.0.1.2:8080 check
    server web3 10.0.1.3:8080 check
```

#### IP Affinity Problems

**NAT / Shared IP:**

Thousands of users behind a corporate NAT gateway all share the same public IP. IP-based affinity sends all of them to the same server, creating severe imbalance.

```
Corporate office (500 users) → NAT → Single IP 198.51.100.1
                                          ↓
                               All 500 users → Server 2
                               Server 1: 10 users
                               Server 3: 15 users
```

**IPv6 and Mobile Networks:**

Mobile users frequently change IP addresses as they switch between cell towers, WiFi networks, and carriers. Each IP change breaks the affinity.

**CDN and Proxy Chains:**

When traffic flows through a CDN (Cloudflare, CloudFront), the client's IP is replaced by the CDN's IP. All traffic from one CDN edge node appears to come from the same IP.

**Rehashing on Server Changes:**

Adding or removing a server changes the hash modulo, reassigning most clients to different servers. Consistent hashing mitigates this but doesn't eliminate it.

### 3. Header-Based Affinity

Route based on a specific HTTP header. Common headers used:

| Header | Use Case |
|--------|----------|
| `X-Session-ID` | Application-specific session identifier |
| `Authorization` | Route same API token to same server |
| `X-Forwarded-For` | Use the real client IP (behind CDN/proxy) |
| `X-Client-ID` | Client identifier for API partners |

**HAProxy:**

```
backend api_servers
    balance hdr(X-API-Key)
    hash-type consistent

    server api1 10.0.1.1:8080 check
    server api2 10.0.1.2:8080 check
    server api3 10.0.1.3:8080 check
```

This hashes the `X-API-Key` header value, ensuring all requests from the same API client go to the same server. Useful for per-client rate limiting or per-client caching.

### 4. Consistent Hashing for Affinity

Using consistent hashing (from the algorithms page) as the affinity mechanism provides the best of both worlds: session stickiness with minimal disruption when servers change.

```
Hash ring with client session IDs:

    session:abc → Server 2
    session:def → Server 1
    session:ghi → Server 3

When Server 2 is removed:
    session:abc → Server 3  (reassigned — only sessions on Server 2 move)
    session:def → Server 1  (unchanged)
    session:ghi → Server 3  (unchanged)
```

Only ~$1/n$ of sessions are disrupted when a server is added or removed. With IP hash (`% n`), nearly all sessions are disrupted.

## The Problems with Sticky Sessions

Session affinity creates a set of interconnected operational problems that get worse as the system scales:

### Problem 1: Uneven Load Distribution

With sticky sessions, the load balancer cannot freely distribute requests. Some servers accumulate more sessions than others due to:

- **Session length variation:** Some users browse for 5 minutes, others for 2 hours. Servers with long-session users accumulate more active sessions.
- **Activity variation:** Some sessions generate 1 request per minute, others generate 10 per second. A server with a few high-activity sessions is more loaded than one with many idle sessions.
- **Hot clients:** A single client (API partner, crawler, power user) generating massive traffic is pinned to one server.

```
Without sticky sessions (ideal distribution):
  Server 1: ████████████████████  100 req/s
  Server 2: ████████████████████  100 req/s
  Server 3: ████████████████████  100 req/s

With sticky sessions (typical distribution):
  Server 1: ████████████████████████████████  160 req/s  (hot client)
  Server 2: ████████████████                   80 req/s
  Server 3: ████████████                       60 req/s  (mostly idle sessions)
```

### Problem 2: Failover Data Loss

When a server crashes, all sessions stored in its memory are lost. Users must re-authenticate, shopping carts are emptied, form progress is reset.

```mermaid
sequenceDiagram
    participant Client
    participant LB as Load Balancer
    participant S1 as Server 1
    participant S2 as Server 2

    Note over S1: Storing 500 sessions<br/>in local memory

    Client->>LB: GET /dashboard (Cookie: SERVERID=s1)
    LB->>S1: GET /dashboard
    Note over S1: 💥 Server crashes!
    LB->>LB: Server 1 failed health check<br/>Redirect to Server 2

    LB->>S2: GET /dashboard
    Note over S2: No session found!<br/>Redirect to login
    S2->>LB: 302 Redirect → /login
    LB->>Client: 302 Redirect → /login
    Note over Client: 500 users suddenly<br/>logged out
```

### Problem 3: Deployment Complexity

Rolling deployments with sticky sessions are painful. When you deploy a new version:

1. Server 1 is drained (stop sending new sessions)
2. Existing sessions on Server 1 must complete or be migrated
3. Server 1 is updated and restarted
4. Sessions that were on Server 1 are lost (unless migrated)
5. Repeat for each server

This is much slower than a standard rolling deployment where any server can be replaced at any time.

### Problem 4: Autoscaling Limitations

When the system scales up (adds new servers), no existing sessions are routed to the new servers (they have no affinity). The new servers sit mostly idle while old servers remain overloaded.

When the system scales down (removes servers), sessions on the removed servers are lost unless explicitly migrated.

### Problem 5: Testing and Debugging

Sticky sessions make it harder to reproduce issues. A bug that only manifests on one server requires you to route specifically to that server. Load testing with sticky sessions is also harder — you can't simply blast requests at the load balancer because they'll all stick to the server that handled the first request.

## Alternatives to Sticky Sessions

The root cause of the sticky session problem is **server-local state**. Eliminate local state and you eliminate the need for affinity. There are three main approaches:

### Alternative 1: Externalized Session Storage (Redis / Memcached)

Move session data from server-local memory to a shared external store. Any server can handle any request because all servers access the same session data.

```mermaid
graph TB
    LB[Load Balancer] --> S1[Server 1]
    LB --> S2[Server 2]
    LB --> S3[Server 3]

    S1 --> Redis[(Redis<br/>Session Store)]
    S2 --> Redis
    S3 --> Redis

    style Redis fill:#ff6b6b,color:#fff
```

```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  url: 'redis://redis-cluster.internal:6379',
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 10) return new Error('Redis connection lost');
      return Math.min(retries * 100, 3000);
    },
  },
});

await redisClient.connect();

const app = express();

app.use(
  session({
    store: new RedisStore({
      client: redisClient,
      prefix: 'sess:',
      ttl: 86400,           // Session TTL: 24 hours
    }),
    secret: process.env.SESSION_SECRET!,
    name: 'sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,           // HTTPS only
      httpOnly: true,          // Not accessible via JavaScript
      maxAge: 86400000,        // 24 hours in milliseconds
      sameSite: 'lax',
    },
  })
);

// Now any server can handle any request
app.post('/cart/add', (req, res) => {
  if (!req.session.cart) {
    req.session.cart = [];
  }
  req.session.cart.push(req.body.item);
  res.json({ cart: req.session.cart });
});

app.get('/cart', (req, res) => {
  res.json({ cart: req.session.cart || [] });
});
```

**Advantages:**
- Any server can handle any request — load balancer can use any algorithm
- Server crashes don't lose sessions (data is in Redis)
- Rolling deployments are trivial — replace any server at any time
- Autoscaling works perfectly — new servers immediately serve all sessions

**Disadvantages:**
- Redis becomes a single point of failure (mitigate with Redis Cluster or Sentinel)
- Every request incurs a network round-trip to Redis (~1ms on same datacenter)
- Session data serialization/deserialization overhead
- Redis costs money and requires operational management

**Redis Session Store Sizing:**

```
Per session: ~1-5 KB (typical web session with user info, cart, preferences)
1 million active sessions × 3 KB = 3 GB of Redis memory
Read/write per request: 2 operations (get session + save session)
100,000 requests/second → 200,000 Redis operations/second
Redis can handle 100,000+ ops/s per instance — so 2 Redis instances suffice
```

### Alternative 2: JWT-Based Stateless Sessions

Encode the session data directly into a signed token (JWT) that the client sends with every request. No server-side session storage at all.

```
Traditional session:
  Client → Cookie: session_id=abc123
  Server → Redis: GET sess:abc123 → {user: "bob", role: "admin"}

JWT-based:
  Client → Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYm9iIiwicm9sZSI6ImFkbWluIn0.signature
  Server → Decode JWT → {user: "bob", role: "admin"}
  No Redis, no database, no external store
```

```typescript
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY = '24h';

interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Login: create JWT
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await authenticateUser(email, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    } satisfies SessionPayload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  // Set as HttpOnly cookie (more secure than localStorage)
  res.cookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 86400000,
  });

  res.json({ user: { id: user.id, email: user.email } });
});

// Middleware: verify JWT on every request
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as SessionPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
    } else {
      res.status(401).json({ error: 'Invalid token' });
    }
  }
}

// Protected route — no session store needed
app.get('/dashboard', requireAuth, (req, res) => {
  res.json({ message: `Welcome, ${req.user.email}` });
});
```

**Advantages:**
- Zero server-side state — truly stateless
- No Redis, no database lookups for session data
- Infinite horizontal scalability — any server handles any request
- Works across services without shared session store (microservices-friendly)
- Works across domains and origins

**Disadvantages:**
- **Cannot revoke individual tokens** before expiry. If a user's account is compromised, you can't invalidate their JWT without a server-side blacklist (which defeats the purpose).
- **Token size:** JWTs are larger than session IDs. A session ID is ~32 bytes. A JWT with user data is ~500 bytes to several KB. This is sent with every request.
- **Cannot store large data:** Shopping carts, form wizard state, and other large session data can't practically be stored in a JWT (cookie size limit is 4KB).
- **Stale data:** If user data changes (role updated, email changed), the JWT still contains old data until it expires and is refreshed.
- **Security:** If the JWT secret is compromised, all tokens are forged. Rotating secrets invalidates all active sessions.

### Alternative 3: Hybrid Approach

Use JWTs for authentication (identity, role) and Redis for mutable session state (cart, preferences, form state):

```typescript
// JWT carries identity (immutable during session)
const authToken = jwt.sign(
  { userId: user.id, role: user.role },
  JWT_SECRET,
  { expiresIn: '1h' }
);

// Redis stores mutable session data
await redis.hSet(`cart:${user.id}`, {
  items: JSON.stringify(cartItems),
  updatedAt: Date.now().toString(),
});

// Middleware combines both
app.use(async (req, res, next) => {
  // Step 1: Verify JWT (no network call)
  const payload = jwt.verify(req.cookies.token, JWT_SECRET);
  req.user = payload;

  // Step 2: Load mutable state from Redis (network call only when needed)
  if (req.path.startsWith('/cart')) {
    const cartData = await redis.hGetAll(`cart:${payload.userId}`);
    req.cart = cartData.items ? JSON.parse(cartData.items) : [];
  }

  next();
});
```

This gives you the best of both:
- Authentication is stateless (JWT) — fast, no Redis call needed for identity
- Mutable state is in Redis — can be updated, won't bloat the token
- No sticky sessions — any server handles any request

## When Sticky Sessions Are Actually Okay

Despite all the drawbacks, there are legitimate scenarios for session affinity:

### 1. WebSocket Connections

WebSocket connections are inherently sticky — once established, a WebSocket connection is a persistent TCP connection to a specific server. You need affinity for the HTTP upgrade request to reach the same server that will hold the WebSocket connection.

```nginx
upstream websocket_servers {
    ip_hash;  # Or use cookie-based affinity
    server 10.0.1.1:3000;
    server 10.0.1.2:3000;
}

server {
    location /ws {
        proxy_pass http://websocket_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

### 2. In-Memory Caches (Warm Cache Benefit)

If each server maintains an in-memory cache (e.g., compiled templates, parsed config, query results), routing the same user to the same server increases cache hit rates. The server already has the user's frequently accessed data in memory.

This is a performance optimization, not a correctness requirement. If the server fails, the request goes elsewhere and the cache misses — but the system still works.

### 3. File Upload Continuations

When a client uploads a large file in chunks, all chunks must go to the same server to be reassembled. Session affinity ensures this.

### 4. Legacy Applications

Sometimes you inherit an application that stores session state in local memory and cannot be easily modified. Sticky sessions are a pragmatic solution while you migrate to externalized session storage.

## Comparison Table

| Approach | Server State | Failover | Load Balance | Scalability | Complexity |
|----------|-------------|----------|-------------|-------------|------------|
| **No affinity + local state** | In-memory | Data loss | Broken | Bad | Low |
| **Cookie affinity** | In-memory | Data loss | Uneven | Limited | Low |
| **IP affinity** | In-memory | Data loss | Very uneven | Limited | Low |
| **Redis sessions** | Redis | Preserved | Optimal | Excellent | Medium |
| **JWT (stateless)** | None | N/A | Optimal | Excellent | Medium |
| **JWT + Redis hybrid** | Redis (mutable only) | Preserved | Optimal | Excellent | Medium |

## Recommendation

For new applications:

1. **Start stateless.** Use JWTs for authentication. Do not store session state on the server.
2. **When you need server-side state** (shopping cart, multi-step workflows), use **Redis**. Do not use local memory.
3. **Never use sticky sessions** as a first choice. They are a workaround for stateful applications, not a feature.
4. **If you must use sticky sessions** (WebSocket, legacy app), use **cookie-based affinity with consistent hashing** for the least disruption during server changes.

::: tip The Test
Ask yourself: "If I randomly kill any server, what happens to users on that server?" If the answer is "they lose data" or "they're logged out," your session management has a problem that sticky sessions are masking, not solving.
:::
