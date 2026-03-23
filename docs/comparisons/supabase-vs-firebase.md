---
title: "Supabase vs Firebase vs Appwrite vs PocketBase"
description: "Comprehensive comparison of Supabase, Firebase, Appwrite, and PocketBase covering database engines, authentication, storage, serverless functions, pricing models, vendor lock-in, and self-hosting capabilities."
tags:
  - comparison
  - supabase
  - firebase
  - appwrite
  - baas
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# Supabase vs Firebase vs Appwrite vs PocketBase

Backend-as-a-Service (BaaS) platforms promise to eliminate the undifferentiated heavy lifting of building auth, databases, storage, and real-time APIs. But every BaaS makes trade-offs: relational vs document, open-source vs proprietary, managed vs self-hosted. This comparison dissects the four leading options across every dimension that matters.

## Overview

| Platform | First Release | Database | License | Language |
|---|---|---|---|---|
| **Supabase** | 2020 | PostgreSQL | Apache 2.0 | Elixir / TypeScript |
| **Firebase** | 2011 (acquired by Google 2014) | Firestore (document) + RTDB | Proprietary | Go / Java (internal) |
| **Appwrite** | 2019 | MariaDB (internal) | BSD-3 | PHP / Node.js |
| **PocketBase** | 2022 | SQLite (embedded) | MIT | Go |

::: tip The Fundamental Divide
Supabase and PocketBase give you a **relational database** with SQL. Firebase gives you a **document store** with its own query language. Appwrite sits in the middle with a document-like API backed by MariaDB. This distinction drives nearly every downstream difference.
:::

## Architecture Comparison

```mermaid
graph TB
    subgraph Supabase
        S1[Client SDK] --> S2[PostgREST<br/>Auto-generated REST API]
        S1 --> S3[Realtime Server<br/>WebSocket]
        S2 --> S4[(PostgreSQL)]
        S3 --> S4
        S5[Auth Server<br/>GoTrue] --> S4
        S6[Storage API] --> S7[(S3-compatible)]
        S8[Edge Functions<br/>Deno Deploy]
    end

    subgraph Firebase
        F1[Client SDK] --> F2[Firestore<br/>Document DB]
        F1 --> F3[RTDB<br/>JSON Tree]
        F4[Firebase Auth] --> F5[Google Identity]
        F6[Cloud Storage] --> F7[(GCS Buckets)]
        F8[Cloud Functions<br/>Node.js / Python]
    end

    subgraph Appwrite
        A1[Client SDK] --> A2[REST API Gateway]
        A2 --> A3[(MariaDB)]
        A4[Auth Service] --> A3
        A5[Storage Service] --> A6[(Local / S3)]
        A7[Functions<br/>Multi-runtime]
    end

    subgraph PocketBase
        P1[Client SDK] --> P2[REST API<br/>Single Binary]
        P2 --> P3[(SQLite)]
        P4[Auth] --> P3
        P5[File Storage] --> P6[(Local FS / S3)]
    end

    style Supabase fill:#3ecf8e,color:#000
    style Firebase fill:#ffca28,color:#000
    style Appwrite fill:#f02e65,color:#fff
    style PocketBase fill:#16161a,color:#fff
```

## Feature Matrix

| Feature | Supabase | Firebase | Appwrite | PocketBase |
|---|---|---|---|---|
| **Database type** | PostgreSQL (relational) | Firestore (document) | MariaDB (relational, abstracted) | SQLite (embedded relational) |
| **Query language** | SQL + PostgREST | Firestore SDK queries | REST / GraphQL | REST + filter syntax |
| **Realtime** | WebSocket (Postgres CDC) | Native (Firestore snapshots) | WebSocket (Realtime API) | SSE (Server-Sent Events) |
| **Auth providers** | 30+ OAuth + email/phone/SAML | 20+ OAuth + email/phone | 30+ OAuth + email/phone | OAuth2 + email |
| **Row-Level Security** | PostgreSQL RLS (native SQL) | Firestore Security Rules | Permissions (role-based) | Collection rules (API-level) |
| **Storage** | S3-compatible, CDN, transforms | Google Cloud Storage | Local / S3 | Local filesystem / S3 |
| **Image transforms** | Resize, crop, format on-the-fly | Firebase Extensions | Built-in (limited) | None (BYO) |
| **Serverless functions** | Deno Edge Functions | Cloud Functions (Node/Python) | 10+ runtimes | Go hooks (embedded) |
| **Database extensions** | pgvector, PostGIS, pg_cron, etc. | None (proprietary) | None | None |
| **Full-text search** | PostgreSQL FTS | Algolia integration needed | Built-in (basic) | SQLite FTS5 |
| **Migrations** | SQL migrations CLI | N/A (schemaless) | Appwrite CLI | Automatic (schema changes) |
| **Self-hosting** | Docker Compose (15+ containers) | Not available | Docker Compose (1 container) | Single binary (~15 MB) |
| **Offline support** | Not built-in | Firestore offline persistence | Not built-in | Not built-in |
| **Multi-tenancy** | Schema-per-tenant / RLS | Collection-per-tenant | Project-per-tenant | Collection rules |
| **Vector search** | pgvector (native) | Vertex AI integration | None | None |
| **GraphQL** | pg_graphql extension | None (REST only) | Built-in | None |
| **Pricing model** | Usage-based + tier | Pay-per-read/write/store | Free (self-hosted) | Free (self-hosted) |

## Code & Config Comparison

### Client Initialization

**Supabase:**

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xxx.supabase.co',
  'eyJ...' // anon key (safe for client)
);
```

**Firebase:**

```typescript
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIza...',
  authDomain: 'my-app.firebaseapp.com',
  projectId: 'my-app',
});
const db = getFirestore(app);
```

**Appwrite:**

```typescript
import { Client, Databases } from 'appwrite';

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('my-project-id');

const databases = new Databases(client);
```

**PocketBase:**

```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://my-app.pockethost.io');
```

### CRUD Operations

**Supabase** (SQL-based):

```typescript
// Create
const { data, error } = await supabase
  .from('posts')
  .insert({ title: 'Hello', content: 'World', author_id: user.id })
  .select()
  .single();

// Read with joins
const { data: posts } = await supabase
  .from('posts')
  .select(`
    id, title, created_at,
    author:profiles(name, avatar_url),
    comments(id, body, created_at)
  `)
  .eq('published', true)
  .order('created_at', { ascending: false })
  .range(0, 9);

// Realtime subscription
const channel = supabase
  .channel('posts')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'posts' },
    (payload) => console.log('New post:', payload.new)
  )
  .subscribe();
```

**Firebase** (document-based):

```typescript
import {
  collection, addDoc, query, where,
  orderBy, limit, onSnapshot
} from 'firebase/firestore';

// Create
const docRef = await addDoc(collection(db, 'posts'), {
  title: 'Hello',
  content: 'World',
  authorId: user.uid,
  createdAt: serverTimestamp(),
});

// Read (no joins — denormalize or fan-out)
const q = query(
  collection(db, 'posts'),
  where('published', '==', true),
  orderBy('createdAt', 'desc'),
  limit(10)
);

// Realtime subscription
const unsubscribe = onSnapshot(q, (snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === 'added') {
      console.log('New post:', change.doc.data());
    }
  });
});
```

**PocketBase:**

```typescript
// Create
const record = await pb.collection('posts').create({
  title: 'Hello',
  content: 'World',
  author: user.id,
});

// Read with expand (like joins)
const posts = await pb.collection('posts').getList(1, 10, {
  filter: 'published = true',
  sort: '-created',
  expand: 'author,comments_via_post',
});

// Realtime subscription
pb.collection('posts').subscribe('*', (e) => {
  console.log('Change:', e.action, e.record);
});
```

### Security Rules

**Supabase** (PostgreSQL RLS):

```sql
-- Enable RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Users can read published posts
CREATE POLICY "Public read" ON posts
  FOR SELECT USING (published = true);

-- Users can only edit their own posts
CREATE POLICY "Owner update" ON posts
  FOR UPDATE USING (auth.uid() = author_id);

-- Users can insert with their own author_id
CREATE POLICY "Authenticated insert" ON posts
  FOR INSERT WITH CHECK (auth.uid() = author_id);
```

**Firebase** (Security Rules):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /posts/{postId} {
      allow read: if resource.data.published == true;
      allow update: if request.auth.uid == resource.data.authorId;
      allow create: if request.auth.uid == request.resource.data.authorId;
    }
  }
}
```

::: warning Firestore Security Rules Gotcha
Firestore security rules cannot filter data — they only allow or deny entire document reads. You cannot write a rule like "only return fields X and Y." If a user can read a document, they read ALL fields. This has significant implications for data modeling.
:::

## Performance

### Read Latency

| Operation | Supabase (managed) | Firebase (Firestore) | Appwrite (cloud) | PocketBase (self-hosted) |
|---|---|---|---|---|
| **Single row by PK** | 5-15ms | 10-30ms | 10-25ms | 1-5ms (local SQLite) |
| **List 100 rows** | 15-40ms | 30-80ms | 20-50ms | 5-15ms |
| **Complex join (3 tables)** | 20-60ms | N/A (denormalized) | N/A (no joins) | 10-30ms |
| **Full-text search** | 10-50ms (pg FTS) | N/A (use Algolia) | 20-60ms | 5-20ms (FTS5) |
| **Realtime delivery** | 50-200ms | 20-100ms | 100-300ms | 50-150ms |

### Scaling Characteristics

| Dimension | Supabase | Firebase | Appwrite | PocketBase |
|---|---|---|---|---|
| **Max connections** | Depends on plan (Supavisor pooler) | Unlimited (managed) | Depends on self-host config | ~10,000 concurrent |
| **Max DB size** | 8 GB (free) to unlimited | 1 GiB free, unlimited paid | Unlimited (self-hosted) | Limited by disk |
| **Write throughput** | PostgreSQL limits (~10K TPS) | ~10K writes/sec per DB | MariaDB limits | SQLite WAL (~1K TPS) |
| **Horizontal scaling** | Read replicas, Supavisor | Automatic (Google infra) | Manual (Docker scale) | Not supported |
| **Best for** | 10K-1M users | 1M+ users (Google scale) | 1K-100K users | 1-10K users |

## Developer Experience

### Strengths

**Supabase:**
- SQL is a superpower — 50 years of tooling, knowledge, and optimization
- Dashboard with table editor, SQL editor, and log explorer
- `supabase` CLI for local dev with Docker (`supabase start`)
- pgvector for AI/ML embedding search without another service

**Firebase:**
- Offline-first with automatic sync (Firestore persistence)
- Firebase Emulator Suite for full local development
- Seamless integration with other Google Cloud services
- Best-in-class mobile SDK (iOS, Android, Flutter)

**Appwrite:**
- Fully self-hostable with a single `docker compose up`
- 10+ function runtimes (Node, Python, Dart, Ruby, PHP, etc.)
- Beautiful dashboard UI
- No vendor lock-in by design

**PocketBase:**
- Single binary, zero dependencies, starts in <1 second
- Embed in Go applications as a library
- Admin UI built-in
- Perfect for prototypes, internal tools, and indie projects

### Weaknesses

| Platform | Key Limitation |
|---|---|
| **Supabase** | Self-hosting is complex (15+ services); no native offline support |
| **Firebase** | No SQL, no joins, no aggregations without Cloud Functions; vendor lock-in |
| **Appwrite** | Smaller community; cloud offering is newer and less battle-tested |
| **PocketBase** | Single-server only (no horizontal scaling); single maintainer project |

## When to Use Which

```mermaid
flowchart TD
    A[Need a BaaS] --> B{Data model?}
    B -->|Relational with joins| C{Scale requirements?}
    B -->|Document / NoSQL| D{Google ecosystem?}
    B -->|Simple CRUD, solo dev| E[PocketBase]

    C -->|Enterprise / high scale| F[Supabase Managed]
    C -->|Startup / side project| G{Self-host priority?}

    G -->|Yes, own the stack| H{Team size?}
    G -->|No, want managed| F

    H -->|Solo dev / small team| E
    H -->|Team with ops capacity| I[Appwrite Self-Hosted]

    D -->|Yes, mobile-first| J[Firebase]
    D -->|No| K{Offline-first needed?}

    K -->|Yes, must work offline| J
    K -->|No| F

    style F fill:#3ecf8e,color:#000
    style J fill:#ffca28,color:#000
    style I fill:#f02e65,color:#fff
    style E fill:#16161a,color:#fff
```

### Decision Summary

| Scenario | Recommended Platform |
|---|---|
| SaaS app with complex data relationships | **Supabase** |
| Mobile app with offline-first requirement | **Firebase** |
| Self-hosted backend, team wants full control | **Appwrite** |
| Weekend project, internal tool, prototype | **PocketBase** |
| AI/ML app needing vector search | **Supabase** (pgvector) |
| Enterprise needing Google Cloud integration | **Firebase** |
| Startup wanting to avoid vendor lock-in | **Supabase** or **Appwrite** |
| Indie hacker shipping fast, solo | **PocketBase** |

## Migration

### Firebase to Supabase

Supabase provides an official migration tool:

```bash
# 1. Export Firestore data
npx firestore-export --accountCredentials serviceAccount.json \
  --backupFile firestore-export.json

# 2. Transform document data to relational schema
# This is the hard part — you must design proper tables
# and normalize the denormalized Firestore documents

# 3. Create tables in Supabase
psql "postgresql://postgres:password@db.xxx.supabase.co:5432/postgres" \
  -f schema.sql

# 4. Import data
# Use Supabase's CSV import or write a migration script

# 5. Migrate auth users
# Supabase provides a Firebase Auth migration guide
# that preserves user IDs and password hashes

# 6. Update client code
# Replace Firebase SDK calls with Supabase SDK calls
# Main change: document queries → SQL-like queries
```

::: warning Firebase Migration Complexity
Migrating from Firestore to a relational database is not a simple data export. You must redesign your data model from denormalized documents to normalized tables. Budget 2-6 weeks for a production migration depending on data complexity.
:::

### Supabase to Self-Hosted

```bash
# 1. Clone the Supabase Docker setup
git clone https://github.com/supabase/supabase
cd supabase/docker

# 2. Configure environment
cp .env.example .env
# Edit .env with your secrets

# 3. Export data from managed Supabase
pg_dump "postgresql://postgres:password@db.xxx.supabase.co:5432/postgres" \
  --no-owner --no-acl > backup.sql

# 4. Start self-hosted Supabase
docker compose up -d

# 5. Restore data
psql "postgresql://postgres:password@localhost:5432/postgres" \
  -f backup.sql

# 6. Update client to point to self-hosted URL
```

## Verdict

**Supabase** is the best general-purpose BaaS for web applications. PostgreSQL gives you the full power of SQL, joins, extensions (pgvector, PostGIS), and 50 years of ecosystem. The managed offering is mature, and the open-source nature means you always have an exit path.

**Firebase** remains the king of mobile development. Its offline persistence, real-time sync, and deep Google Cloud integration make it the natural choice for iOS/Android apps. The cost of Firestore's document model is the inability to do relational queries — you pay for this with denormalization and data duplication.

**Appwrite** is the strongest choice for teams that want a self-hosted BaaS with a polished experience. Its multi-runtime function support and beautiful dashboard set it apart, though the community is smaller than Supabase or Firebase.

**PocketBase** is a revelation for solo developers and small projects. A single 15 MB binary that includes auth, database, file storage, and an admin UI is remarkable. It will not scale to millions of users, but for internal tools, prototypes, and indie projects it is hard to beat.

::: tip Bottom Line
If you are building a web SaaS, start with **Supabase**. If you are building a mobile app that must work offline, start with **Firebase**. If you want to self-host everything in one `docker compose up`, choose **Appwrite**. If you are a solo developer who wants to ship this weekend, grab **PocketBase**.
:::
