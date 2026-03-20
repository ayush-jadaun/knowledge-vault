---
title: "SSR vs SSG vs ISR vs CSR"
description: "Complete comparison of rendering strategies — Client-Side Rendering, Server-Side Rendering, Static Site Generation, Incremental Static Regeneration, Streaming SSR, and React Server Components."
tags: [ssr, ssg, isr, nextjs, rendering]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# SSR vs SSG vs ISR vs CSR

Where and when your HTML is generated is the single most consequential architectural decision in frontend engineering. It affects performance, SEO, infrastructure cost, development complexity, and the user experience across every page of your application. There is no universally correct answer — only trade-offs that align (or conflict) with your specific requirements.

This page explains each rendering strategy from first principles, covers their implementation in modern frameworks, and provides a decision matrix to help you choose.

## Client-Side Rendering (CSR)

CSR is the simplest mental model: the server sends an empty HTML shell, the browser downloads JavaScript, and JavaScript renders everything.

```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant S as Server
    participant API as API Server

    U->>B: Navigate to /dashboard
    B->>S: GET /dashboard
    S-->>B: Minimal HTML shell (< 1KB)
    Note over B: Empty screen
    B->>S: GET /app.js (500KB)
    S-->>B: JavaScript bundle
    Note over B: Parse + compile JS
    Note over B: Execute JS, mount app
    B->>API: GET /api/dashboard
    API-->>B: JSON data
    Note over B: Render content
    Note over B: Page finally visible
```

### The HTML Shell

```html
<!DOCTYPE html>
<html>
<head>
  <title>Dashboard</title>
  <script defer src="/app.js"></script>
</head>
<body>
  <div id="root"></div>
  <!-- Nothing here. Everything rendered by JavaScript. -->
</body>
</html>
```

### When CSR Works

- **Internal dashboards** where SEO is irrelevant
- **Applications behind authentication** (crawlers cannot access anyway)
- **Highly interactive apps** where the initial load penalty is amortized across a long session (Figma, Google Docs)
- **Offline-first PWAs** using service workers

### When CSR Fails

| Problem | Why It Happens |
|---------|---------------|
| Slow First Contentful Paint | No content until JS downloads, parses, and executes |
| Poor SEO | Search engines see an empty `<div id="root">` (Googlebot executes JS but with caveats) |
| Bad on slow devices | Low-end phones may take 5-10s to parse and execute a 500KB bundle |
| Waterfall requests | HTML -> JS -> API data -> render (serial chain) |

```typescript
// Typical CSR app entry point (React)
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

## Server-Side Rendering (SSR)

SSR generates HTML on the server for every request. The browser receives a fully-rendered page, displays it immediately, and then "hydrates" it — attaching JavaScript event handlers to make it interactive.

```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant S as Server
    participant DB as Database

    U->>B: Navigate to /products
    B->>S: GET /products
    S->>DB: Query products
    DB-->>S: Product data
    Note over S: Render HTML with data
    S-->>B: Full HTML page
    Note over B: Page visible immediately (FCP)
    B->>S: GET /app.js
    S-->>B: JavaScript bundle
    Note over B: Hydrate: attach event handlers
    Note over B: Page interactive (TTI)
```

### How Hydration Works

Hydration is the process of making server-rendered HTML interactive. The browser already has the DOM, so React (or Vue, Svelte, etc.) walks the existing DOM tree and attaches event listeners without rebuilding it:

```typescript
// Server: render to HTML string
import { renderToString } from 'react-dom/server';
import { App } from './App';

app.get('/products', async (req, res) => {
  const products = await db.query('SELECT * FROM products');

  const html = renderToString(<App products={products} />);

  res.send(`
    <!DOCTYPE html>
    <html>
    <head><script defer src="/app.js"></script></head>
    <body>
      <div id="root">${html}</div>
      <script>
        window.__INITIAL_DATA__ = ${JSON.stringify(products)};
      </script>
    </body>
    </html>
  `);
});

// Client: hydrate (don't re-render, just attach listeners)
import { hydrateRoot } from 'react-dom/client';
import { App } from './App';

hydrateRoot(
  document.getElementById('root')!,
  <App products={window.__INITIAL_DATA__} />
);
```

### The Hydration Problem

Hydration is expensive. The browser must:
1. Download the entire JavaScript bundle
2. Parse and compile it
3. Execute it to re-create the component tree in memory
4. Walk the existing DOM to match it against the virtual DOM
5. Attach all event listeners

During steps 1-5, the page is **visible but not interactive** — buttons appear clickable but do not respond. This gap between FCP and TTI is called the "uncanny valley" of SSR.

::: warning The Worst Case
On a slow device, a server-rendered page might be visible in 1 second but not interactive for 5 seconds. The user clicks a button, nothing happens, they click again, and when hydration finally completes, the queued clicks fire out of order. This is worse than CSR, where at least the page is honestly blank until it is ready.
:::

### SSR in Modern Frameworks

```typescript
// Next.js App Router (SSR by default)
// app/products/page.tsx
export default async function ProductsPage() {
  const products = await fetch('https://api.example.com/products');
  const data = await products.json();

  return (
    <main>
      <h1>Products</h1>
      {data.map((product: Product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </main>
  );
}

// Nuxt 3 (SSR by default)
// pages/products.vue
<script setup lang="ts">
const { data: products } = await useFetch('/api/products');
</script>

<template>
  <main>
    <h1>Products</h1>
    <ProductCard
      v-for="product in products"
      :key="product.id"
      :product="product"
    />
  </main>
</template>
```

## Static Site Generation (SSG)

SSG generates all HTML at **build time**. Every page becomes a static file that can be served from a CDN with no server compute per request.

```mermaid
sequenceDiagram
    participant D as Developer
    participant B as Build Server
    participant CDN as CDN Edge
    participant U as User

    D->>B: git push
    B->>B: Fetch all data
    B->>B: Render all pages to HTML
    B->>CDN: Upload static files

    U->>CDN: GET /blog/my-post
    CDN-->>U: Pre-built HTML (cached, ~50ms TTFB)
    Note over U: Instant content display
```

### When SSG Excels

- **Blogs and documentation** (VitePress, Astro, Hugo)
- **Marketing sites** with infrequently changing content
- **E-commerce product catalogs** (with ISR for updates)
- **Any page where content does not change between requests**

### SSG Limitations

| Limitation | Impact |
|-----------|--------|
| Build time scales with page count | 10,000 pages = 10-30 min builds |
| Stale content until next build | Blog comments, stock prices don't update |
| No per-user personalization | Same HTML for every visitor |
| Dynamic routes need enumeration | Must know all paths at build time |

```typescript
// Next.js static generation
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function BlogPost({ params }: { params: { slug: string } }) {
  const post = await getPostBySlug(params.slug);
  return <Article post={post} />;
}

// VitePress (SSG by default - what Archon uses)
// Every .md file becomes a static HTML page at build time
// Data loading via frontmatter + build-time data loaders
```

## Incremental Static Regeneration (ISR)

ISR bridges the gap between SSG and SSR. Pages are statically generated at build time but can be **revalidated** (regenerated) on a timer or on-demand after deployment.

```mermaid
sequenceDiagram
    participant U as User
    participant CDN as CDN/Edge
    participant S as Server
    participant DB as Database

    U->>CDN: GET /products/widget
    Note over CDN: Cached page exists, age: 55s
    CDN-->>U: Serve cached HTML (fast)

    Note over CDN: revalidate: 60 — page is stale
    CDN->>S: Background revalidation
    S->>DB: Fetch latest data
    DB-->>S: Updated product data
    S-->>CDN: New HTML page
    Note over CDN: Cache updated for next request

    U->>CDN: GET /products/widget (next visit)
    CDN-->>U: Serve fresh HTML
```

### Time-Based Revalidation

```typescript
// Next.js ISR with time-based revalidation
// app/products/[id]/page.tsx
export const revalidate = 60; // Revalidate at most every 60 seconds

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await fetch(`https://api.example.com/products/${params.id}`);
  const data = await product.json();

  return <ProductDetail product={data} />;
}
```

### On-Demand Revalidation

```typescript
// Next.js on-demand revalidation via API route
// app/api/revalidate/route.ts
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { secret, path, tag } = await req.json();

  if (secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  if (path) {
    revalidatePath(path);
  } else if (tag) {
    revalidateTag(tag);
  }

  return NextResponse.json({ revalidated: true });
}

// Called from CMS webhook when content is published:
// POST /api/revalidate { "secret": "...", "path": "/blog/my-post" }
```

### ISR Trade-offs

| Advantage | Limitation |
|-----------|-----------|
| CDN-speed responses | Stale content for up to `revalidate` seconds |
| No full rebuild on content change | Still requires a server (not purely static) |
| Scales to millions of pages | First request after revalidation window is slow (cache miss) |
| Works with existing SSG mental model | Platform-specific (Next.js, Nuxt, etc.) |

## Streaming SSR

Streaming SSR sends HTML to the browser in chunks as it is generated, rather than waiting for the entire page to be rendered. This dramatically improves Time to First Byte (TTFB) and First Contentful Paint (FCP).

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Server
    participant DB as Database
    participant API as External API

    B->>S: GET /dashboard
    S-->>B: HTML head + shell (immediate)
    Note over B: Starts rendering shell
    S->>DB: Query user data
    DB-->>S: User data
    S-->>B: Stream user profile section
    Note over B: Renders profile
    S->>API: Fetch recommendations (slow)
    Note over B: Shows skeleton for recommendations
    API-->>S: Recommendations
    S-->>B: Stream recommendations section
    Note over B: Renders recommendations
```

### Implementation with React Suspense

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';

export default function Dashboard() {
  return (
    <main>
      <h1>Dashboard</h1>

      {/* This renders immediately */}
      <Suspense fallback={<ProfileSkeleton />}>
        <UserProfile /> {/* Async component, streams when ready */}
      </Suspense>

      {/* This renders immediately */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <Recommendations /> {/* Slower API, streams later */}
      </Suspense>
    </main>
  );
}

// This component is async — it suspends until data is available
async function UserProfile() {
  const user = await fetchUser(); // 100ms
  return <div>{user.name}</div>;
}

async function Recommendations() {
  const recs = await fetchRecommendations(); // 2000ms
  return <RecommendationsList items={recs} />;
}
```

The browser receives the HTML in this order:
1. **Immediately:** `<h1>Dashboard</h1>` + both skeleton fallbacks
2. **After ~100ms:** User profile HTML replaces `ProfileSkeleton`
3. **After ~2000ms:** Recommendations HTML replaces `RecommendationsSkeleton`

## React Server Components (RSC)

RSC is a paradigm shift. Components are divided into **Server Components** (run only on the server, ship zero JavaScript) and **Client Components** (hydrate in the browser, support interactivity):

```mermaid
graph TD
    subgraph "Server Only (0 KB JavaScript)"
        A["Layout"] --> B["ProductList"]
        B --> C["ProductCard"]
        C --> D["Price"]
        A --> E["Sidebar"]
    end

    subgraph "Client (ships JavaScript)"
        C --> F["AddToCartButton<br/>'use client'"]
        E --> G["SearchFilter<br/>'use client'"]
    end

    style F fill:#ff6b6b,color:#fff
    style G fill:#ff6b6b,color:#fff
```

```tsx
// Server Component (default in Next.js App Router)
// app/products/page.tsx — runs ONLY on the server
import { AddToCartButton } from './AddToCartButton';

export default async function ProductsPage() {
  // Direct database access — this never reaches the browser
  const products = await db.query('SELECT * FROM products WHERE active = true');

  return (
    <main>
      <h1>Products ({products.length})</h1>
      {products.map((product) => (
        <div key={product.id}>
          <h2>{product.name}</h2>
          <p>{product.description}</p>
          {/* Only this component ships JavaScript */}
          <AddToCartButton productId={product.id} />
        </div>
      ))}
    </main>
  );
}

// Client Component — ships JavaScript for interactivity
// app/products/AddToCartButton.tsx
'use client';

import { useState } from 'react';

export function AddToCartButton({ productId }: { productId: string }) {
  const [added, setAdded] = useState(false);

  return (
    <button onClick={() => {
      addToCart(productId);
      setAdded(true);
    }}>
      {added ? 'Added!' : 'Add to Cart'}
    </button>
  );
}
```

### Why RSC Matters

| Benefit | How |
|---------|-----|
| Smaller JS bundle | Server Components ship 0 KB of JavaScript |
| Direct data access | Query databases, read files — no API layer needed |
| Automatic code splitting | Only Client Components are included in the bundle |
| Streaming | Server Components can stream as they resolve |
| Security | Secrets, API keys, SQL queries never reach the browser |

## Decision Matrix

```mermaid
flowchart TD
    A{"Does the page need SEO?"} -->|No| B{"Is it highly interactive?"}
    A -->|Yes| C{"How often does content change?"}

    B -->|Yes| CSR["CSR<br/>(SPA)"]
    B -->|No| CSR

    C -->|Never / rarely| D{"< 10,000 pages?"}
    C -->|Every few minutes| ISR["ISR"]
    C -->|Every request / personalized| E{"Need fast TTFB?"}

    D -->|Yes| SSG["SSG"]
    D -->|No| ISR

    E -->|Yes| STR["Streaming SSR"]
    E -->|No| SSR["Traditional SSR"]
```

### Comparison Table

| | CSR | SSR | SSG | ISR | Streaming SSR | RSC |
|---|---|---|---|---|---|---|
| **TTFB** | Fast (empty shell) | Slow (compute per request) | Fastest (CDN) | Fast (cached) | Fast (immediate shell) | Fast |
| **FCP** | Slow (JS must execute) | Fast (HTML ready) | Fastest | Fast | Fastest (shell instant) | Fast |
| **TTI** | Slow | Medium (hydration) | Fast (little JS) | Fast | Progressive | Best (less JS) |
| **SEO** | Poor | Excellent | Excellent | Excellent | Excellent | Excellent |
| **Dynamic data** | Excellent | Excellent | Poor | Good | Excellent | Excellent |
| **Infrastructure** | Static hosting | Server required | CDN only | Server + CDN | Server + CDN | Server + CDN |
| **Cost at scale** | Lowest | Highest | Low | Medium | Medium | Medium |
| **Complexity** | Low | Medium | Low | Medium | High | High |

### Framework Mapping

| Framework | CSR | SSR | SSG | ISR | Streaming | RSC |
|-----------|:---:|:---:|:---:|:---:|:---------:|:---:|
| Next.js 15 | Yes | Yes | Yes | Yes | Yes | Yes |
| Nuxt 4 | Yes | Yes | Yes | Yes | Yes | No |
| Remix | Yes | Yes | No | No | Yes | No |
| Astro | Yes | Yes | Yes | No | Yes | No |
| SvelteKit | Yes | Yes | Yes | No | Yes | No |
| VitePress | No | No | Yes | No | No | No |
| Qwik | Yes | Yes | Yes | No | Yes | No |

## Hybrid Approaches

Modern frameworks allow mixing strategies within a single application. This is the correct approach for most production apps:

```typescript
// Next.js App Router — mixing strategies per route

// app/page.tsx — SSG (no dynamic data)
export default function HomePage() {
  return <h1>Welcome</h1>;
}

// app/blog/[slug]/page.tsx — ISR
export const revalidate = 3600; // Revalidate hourly
export default async function BlogPost({ params }) {
  const post = await getPost(params.slug);
  return <Article post={post} />;
}

// app/dashboard/page.tsx — SSR (per-request)
export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  const user = await getCurrentUser();
  return <DashboardView user={user} />;
}

// app/search/page.tsx — CSR (no server rendering)
'use client';
export default function SearchPage() {
  const [query, setQuery] = useState('');
  // Client-only search logic
}
```

## What's Next

- [Web Performance & Core Web Vitals](/frontend-engineering/web-performance) — Measure the impact of your rendering strategy
- [Browser Rendering Pipeline](/frontend-engineering/browser-rendering) — Understand what happens after HTML reaches the browser
- [Bundle Optimization](/frontend-engineering/bundle-optimization) — Minimize the JavaScript penalty for CSR and hydration
- [State Management](/frontend-engineering/state-management) — Handle client and server state across rendering boundaries
