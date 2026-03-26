---
title: "Client-Server Architecture"
description: "A complete beginner's guide to client-server architecture — from monoliths to N-tier systems, thin vs thick clients, stateful vs stateless design, REST APIs, and what a web server actually does."
tags: [system-design, client-server, architecture, web-server, fundamentals]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-25"
---

# Client-Server Architecture

Every application you use — Google, Instagram, Spotify, your banking app — follows the same fundamental pattern: one piece of software (the **client**) asks for something, and another piece of software (the **server**) provides it. This pattern is called **client-server architecture**, and it is the foundation of virtually all modern software.

If you have ever opened a browser and loaded a webpage, you have used client-server architecture. The browser is the client. The computer that sent you the webpage is the server. Understanding this pattern deeply is the first step toward designing real systems.

## What Is a Client? What Is a Server?

A **client** is any software that initiates a request. A **server** is any software that responds to requests. That is it. There is nothing magic about servers — they are just programs that listen for incoming requests and send back responses.

```mermaid
graph LR
    Client["Client<br/>(Your Browser)"] -->|"Request: Show me this page"| Server["Server<br/>(Web Server)"]
    Server -->|"Response: Here's the HTML"| Client
```

Important: "client" and "server" are **roles**, not physical machines. The same computer can be a client in one interaction and a server in another. When your backend server queries a database, your backend is the client and the database is the server.

```mermaid
graph LR
    Browser["Browser<br/>(Client)"] -->|Request| Backend["Backend Server<br/>(Server to browser,<br/>Client to database)"]
    Backend -->|Query| DB["Database<br/>(Server)"]
    DB -->|Results| Backend
    Backend -->|Response| Browser
```

## The Evolution of Architecture

Software architecture has evolved over decades. Understanding this history helps you understand why systems are designed the way they are today.

### Stage 1: The Monolith (Everything on One Machine)

In the beginning, there was one computer that did everything. The user interface, the business logic, and the data storage all ran on the same machine. This is called a **monolith**.

```mermaid
graph TD
    subgraph Single Machine
        UI["User Interface<br/>(terminal / GUI)"]
        Logic["Business Logic<br/>(application code)"]
        Data["Data Storage<br/>(files on disk)"]
        UI --> Logic
        Logic --> Data
    end
```

**Examples**: Early desktop applications like Microsoft Word, Excel, or a game installed on your computer. Everything runs locally. No network involved.

**Advantages**:
- Simple to develop and deploy
- No network latency
- No network failures to handle
- Works offline

**Disadvantages**:
- Cannot share data between users easily
- Cannot scale beyond one machine
- Every user needs the software installed
- Updates require every user to download the new version

### Stage 2: Two-Tier Architecture (Client + Database)

As networks became available, developers split the monolith into two layers (tiers). The application ran on the user's computer, but the data lived on a shared database server.

```mermaid
graph LR
    subgraph Tier 1: Client
        App1["Desktop App<br/>(User 1)"]
        App2["Desktop App<br/>(User 2)"]
        App3["Desktop App<br/>(User 3)"]
    end

    subgraph Tier 2: Server
        DB["Shared Database<br/>(Oracle, SQL Server)"]
    end

    App1 -->|SQL queries| DB
    App2 -->|SQL queries| DB
    App3 -->|SQL queries| DB
```

**Examples**: Enterprise applications in the 1990s. A Visual Basic app on each employee's computer connecting directly to a shared Oracle database.

**Advantages**:
- Multiple users can share data
- Data lives in one place (single source of truth)

**Disadvantages**:
- Clients send raw SQL queries to the database (security nightmare)
- Business logic is duplicated across every client
- Updating business logic means updating every client machine
- Database connections scale poorly (each client holds a connection)

### Stage 3: Three-Tier Architecture (The Modern Standard)

The solution was to add a middle layer between the client and the database. This **application server** (or "backend") contains all the business logic. The client only talks to the application server, never directly to the database.

```mermaid
graph TB
    subgraph Tier 1: Presentation
        Browser1["Browser<br/>(User 1)"]
        Browser2["Browser<br/>(User 2)"]
        Mobile["Mobile App<br/>(User 3)"]
    end

    subgraph Tier 2: Application
        API["Application Server<br/>(Business Logic + API)"]
    end

    subgraph Tier 3: Data
        DB["Database<br/>(PostgreSQL, MySQL)"]
    end

    Browser1 -->|HTTP API calls| API
    Browser2 -->|HTTP API calls| API
    Mobile -->|HTTP API calls| API
    API -->|SQL queries| DB
```

This is the architecture behind almost every web application you use today. When you open Instagram:

1. **Tier 1 (Presentation)**: Your phone's Instagram app or the web browser
2. **Tier 2 (Application)**: Instagram's servers that handle your requests
3. **Tier 3 (Data)**: Instagram's databases that store posts, users, and comments

**Advantages**:
- Clients never touch the database (security)
- Business logic lives in one place (easy to update)
- Each tier can scale independently
- Different clients (web, mobile, API) can share the same backend

**Disadvantages**:
- More complexity than a monolith
- Network latency between tiers
- More things that can fail

### Stage 4: N-Tier Architecture (Microservices and Beyond)

As systems grow, the three-tier model evolves into **N-tier** — where the application layer splits into many specialized services. This is the world of microservices, message queues, caches, and CDNs.

```mermaid
graph TB
    subgraph Clients
        Web["Web Browser"]
        Mobile["Mobile App"]
    end

    CDN["CDN<br/>(Static assets)"]
    LB["Load Balancer"]

    subgraph Application Tier
        Auth["Auth Service"]
        Users["User Service"]
        Posts["Post Service"]
        Feed["Feed Service"]
        Notify["Notification Service"]
    end

    Cache["Cache<br/>(Redis)"]
    Queue["Message Queue<br/>(Kafka)"]

    subgraph Data Tier
        UserDB["User DB"]
        PostDB["Post DB"]
        FeedDB["Feed DB"]
    end

    Web --> CDN
    Web --> LB
    Mobile --> LB
    LB --> Auth
    LB --> Users
    LB --> Posts
    LB --> Feed
    Auth --> Cache
    Users --> UserDB
    Posts --> PostDB
    Posts --> Queue
    Queue --> Feed
    Feed --> FeedDB
    Feed --> Notify
```

For a deep exploration of how this evolves at massive scale, see the [Zero to Million Users](/system-design/fundamentals/zero-to-million-users) page and the [Microservices](/architecture-patterns/microservices/) section.

## Thin Clients vs Thick Clients

One of the most important design decisions is how much work the client does versus the server.

### Thin Client

A **thin client** does very little processing. It basically just displays what the server sends. The server does all the heavy lifting.

**Examples**:
- Server-side rendered websites (the server generates full HTML pages)
- Terminal/SSH sessions
- Google Stadia (game runs on server, client just displays the video stream)
- Chromebook (most processing happens in the cloud)

```mermaid
graph LR
    subgraph Thin Client
        Display["Display<br/>+ Minimal Logic"]
    end

    subgraph Server
        Logic["All Business Logic"]
        Render["HTML Rendering"]
        Data["Data Processing"]
    end

    Display -->|"Click a button"| Logic
    Logic --> Render
    Render -->|"Full HTML page"| Display
```

**Advantages**: Easy to update (change server only), works on weak devices, less attack surface on client

**Disadvantages**: Requires constant network connection, server does more work, higher latency for interactions

### Thick Client (Rich Client)

A **thick client** does significant processing locally. The server mainly provides data through APIs.

**Examples**:
- Single Page Applications (React, Vue, Angular)
- Native mobile apps
- Desktop applications like Slack or VS Code
- Video games

```mermaid
graph LR
    subgraph Thick Client
        UI["Rich UI<br/>+ Routing"]
        Logic["Client-side Logic"]
        Cache["Local Cache"]
    end

    subgraph Server
        API["REST/GraphQL API"]
        Data["Data Storage"]
    end

    UI --> Logic
    Logic --> Cache
    Logic -->|"GET /api/posts"| API
    API --> Data
    Data -->|"JSON data"| Logic
    Logic --> UI
```

**Advantages**: Faster interactions (no round trip for every click), works offline partially, lower server load

**Disadvantages**: More complex client code, harder to update (app store releases), more attack surface, larger download

### The Spectrum in Practice

Most modern applications live somewhere in between:

| Application | Client Thickness | Why |
|---|---|---|
| Google Docs | Thick | Real-time editing needs client-side logic |
| Netflix | Medium | Video playback is local, content discovery is server-rendered |
| Banking App | Thin | Security matters more than snappy UI |
| VS Code | Thick | Full IDE running locally |
| Google Search | Thin | Server generates results, client just displays them |

## Stateful vs Stateless Servers

This is one of the most important concepts in system design. It determines how easily your system can scale.

### Stateful Server

A **stateful** server remembers things about each client between requests. It stores session data in memory. If you are talking to Server A, your next request **must** also go to Server A because that is where your session lives.

```mermaid
sequenceDiagram
    participant Client
    participant ServerA as Server A
    participant ServerB as Server B

    Client->>ServerA: Login (username + password)
    ServerA->>ServerA: Store session in memory: {user: "Alice", cart: []}
    ServerA-->>Client: Welcome, Alice! (session_id=abc)

    Client->>ServerA: Add item to cart (session_id=abc)
    ServerA->>ServerA: Update session: {user: "Alice", cart: ["book"]}
    ServerA-->>Client: Item added!

    Note over Client,ServerB: What if Server A crashes?
    Client->>ServerB: View cart (session_id=abc)
    ServerB-->>Client: ERROR: Unknown session! Who are you?
```

**Problem**: If Server A dies, the session is lost. The user has to log in again and their cart is empty. Also, you cannot easily add more servers because each user is "stuck" on their server.

### Stateless Server

A **stateless** server does not remember anything between requests. Every request contains all the information the server needs to process it. Session data is stored externally (in a database or cache like Redis), not in the server's memory.

```mermaid
sequenceDiagram
    participant Client
    participant LB as Load Balancer
    participant ServerA as Server A
    participant ServerB as Server B
    participant Redis as Redis (Session Store)

    Client->>LB: Login (username + password)
    LB->>ServerA: Forward request
    ServerA->>Redis: Store session {user: "Alice", cart: []}
    ServerA-->>Client: Welcome! (token=xyz)

    Client->>LB: Add item to cart (token=xyz)
    LB->>ServerB: Forward to ANY server
    ServerB->>Redis: Get session for token=xyz
    Redis-->>ServerB: {user: "Alice", cart: []}
    ServerB->>Redis: Update: {user: "Alice", cart: ["book"]}
    ServerB-->>Client: Item added!

    Note over Client,Redis: Server A could crash and nothing changes
```

**Advantages of stateless**:
- Any server can handle any request (easy to scale)
- Servers can crash without losing user data
- Load balancer can send requests anywhere
- Adding new servers is trivial

This is why stateless design is a core principle of scalable systems. See [Scaling Fundamentals](/system-design/fundamentals/scaling-fundamentals) for how this enables horizontal scaling.

## What a Web Server Actually Does

When people say "web server," they might mean two different things:

### 1. HTTP Server Software

Software that listens on a port (usually 80 or 443), accepts HTTP connections, and sends back responses. The most common HTTP servers:

| Server | Market Share (2026) | Known For |
|---|---|---|
| Nginx | ~34% | High performance, reverse proxy, load balancing |
| Apache | ~28% | Oldest major web server, very configurable |
| Cloudflare | ~22% | CDN + edge computing |
| Node.js (Express) | ~5% | JavaScript, event-driven |

### 2. The Application Server

The code that actually processes requests — your Python/Node/Java/Go application that contains business logic:

```mermaid
graph TD
    Request["Incoming HTTP Request<br/>GET /api/users/123"]

    subgraph Web Server: What Actually Happens
        Parse["1. Parse the HTTP request<br/>(method, path, headers, body)"]
        Route["2. Route to the right handler<br/>GET /api/users/:id → getUser()"]
        Auth["3. Authentication & Authorization<br/>Is this request allowed?"]
        Logic["4. Business Logic<br/>Validate input, apply rules"]
        Data["5. Data Access<br/>Query database or cache"]
        Format["6. Format Response<br/>Convert data to JSON/HTML"]
        Send["7. Send HTTP Response<br/>Status code + headers + body"]
    end

    Parse --> Route --> Auth --> Logic --> Data --> Format --> Send

    Response["HTTP Response<br/>200 OK + JSON body"]
    Request --> Parse
    Send --> Response
```

In a typical production setup, Nginx sits in front of your application server. Nginx handles the raw HTTP connections, TLS termination, and static files. Your application server handles the business logic. See [Nginx Config](/system-design/load-balancing/nginx-config) for how to set this up.

## REST APIs — How Clients Talk to Servers

When the client is a browser or mobile app and the server is a backend API, they communicate using **REST** (Representational State Transfer). REST is a set of conventions for designing HTTP APIs.

### REST Conventions

```
GET    /users          → List all users
GET    /users/123      → Get user with ID 123
POST   /users          → Create a new user
PUT    /users/123      → Replace user 123 entirely
PATCH  /users/123      → Update some fields of user 123
DELETE /users/123      → Delete user 123
```

### A Complete Request/Response Example

**Request** (client sends this):
```http
POST /api/users HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...

{
  "name": "Alice Johnson",
  "email": "alice@example.com"
}
```

**Response** (server sends this):
```http
HTTP/1.1 201 Created
Content-Type: application/json
Location: /api/users/456

{
  "id": 456,
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "created_at": "2026-03-25T10:30:00Z"
}
```

For a complete guide to REST API design, see [REST Best Practices](/system-design/api-design/rest-best-practices). For alternatives to REST, see [GraphQL vs REST](/system-design/networking/graphql-vs-rest) and [gRPC Internals](/system-design/networking/grpc-internals).

## Request-Response vs Push Models

Client-server is not always request-response. There are other patterns:

```mermaid
graph TD
    subgraph Request-Response
        C1["Client"] -->|"1. Request"| S1["Server"]
        S1 -->|"2. Response"| C1
    end

    subgraph Long Polling
        C2["Client"] -->|"1. Request"| S2["Server"]
        S2 -->|"2. Holds connection..."| S2
        S2 -->|"3. Response when data ready"| C2
    end

    subgraph WebSocket
        C3["Client"] <-->|"Bidirectional messages"| S3["Server"]
    end

    subgraph Server-Sent Events
        C4["Client"] -->|"1. Subscribe"| S4["Server"]
        S4 -->|"2. Push events"| C4
        S4 -->|"3. Push events"| C4
    end
```

| Pattern | Direction | Use Case |
|---|---|---|
| Request-Response | Client → Server → Client | Loading pages, API calls |
| Long Polling | Client → Server (waits) → Client | Email checking, basic notifications |
| WebSocket | Bidirectional | Chat apps, gaming, live collaboration |
| Server-Sent Events | Server → Client only | Live dashboards, news feeds |

For details on these patterns, see [Event-Driven APIs](/system-design/api-design/event-driven-apis) and [WebSockets](/system-design/networking/websockets).

## Real-World Architecture Example: A Simple Blog

Let us walk through a concrete example. You are building a blog. Here is how the architecture evolves:

### Version 1: Simple Static Files

```mermaid
graph LR
    Browser["Browser"] -->|"GET /index.html"| Nginx["Nginx<br/>(serves static files)"]
    Nginx -->|"HTML file"| Browser
```

Just HTML, CSS, and JavaScript files served by Nginx. No database. No backend. Works for a personal portfolio.

### Version 2: Dynamic Content with a Database

```mermaid
graph LR
    Browser["Browser"] -->|"GET /posts/1"| Server["Node.js Server<br/>(Express)"]
    Server -->|"SELECT * FROM posts WHERE id=1"| DB["PostgreSQL"]
    DB -->|"Post data"| Server
    Server -->|"Rendered HTML"| Browser
```

Now you have a server that fetches blog posts from a database and generates HTML. Users can create and edit posts through an admin panel.

### Version 3: Separate Frontend and Backend

```mermaid
graph TD
    subgraph Frontend
        React["React App<br/>(hosted on CDN)"]
    end

    subgraph Backend
        API["REST API<br/>(Node.js/Express)"]
    end

    subgraph Data
        DB["PostgreSQL"]
        Redis["Redis Cache"]
    end

    React -->|"GET /api/posts"| API
    API --> Redis
    Redis -->|Miss| DB
    DB --> API
    API -->|"JSON"| React
```

The frontend is a React SPA served from a CDN. The backend is a REST API. This is the standard architecture for most web applications today.

## Common Mistakes Beginners Make

1. **Putting business logic in the client** — Never trust the client. It can be manipulated. Validate everything on the server.

2. **Making the client talk directly to the database** — This is a massive security hole. Always put a server in between.

3. **Storing session state in the server's memory** — This prevents horizontal scaling. Use Redis or a database for sessions.

4. **Not understanding that the client and server are separate programs** — They run on different machines, have different clocks, and the network between them is unreliable.

5. **Thinking "server" means a physical machine** — A server is software. One physical machine can run dozens of server programs.

## Summary

| Concept | Key Takeaway |
|---|---|
| Client-Server | One program requests, another responds |
| Monolith | Everything on one machine (simple but limited) |
| Two-Tier | Client + Database (security issues) |
| Three-Tier | Client + Application Server + Database (modern standard) |
| N-Tier | Many specialized services (microservices) |
| Thin Client | Server does the work, client just displays |
| Thick Client | Client does significant processing |
| Stateful | Server remembers between requests (hard to scale) |
| Stateless | Every request is self-contained (easy to scale) |
| REST | Convention for designing HTTP APIs |

## What to Learn Next

- **[Scaling Fundamentals](/system-design/fundamentals/scaling-fundamentals)** — How to handle more users than one server can manage
- **[Building Blocks Overview](/system-design/fundamentals/building-blocks)** — All the components that make up a modern system
- **[How the Internet Works](/system-design/fundamentals/how-the-internet-works)** — The networking layer underneath client-server
- **[REST Best Practices](/system-design/api-design/rest-best-practices)** — How to design clean, consistent APIs
- **[Load Balancing](/system-design/load-balancing)** — How to distribute requests across multiple servers
