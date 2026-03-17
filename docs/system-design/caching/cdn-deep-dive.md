---
title: "CDN Deep Dive"
description: "Complete deep dive into Content Delivery Networks — how CDNs work at the network level, cache-control headers mastery, cache key design, purging strategies, origin shielding, and provider comparison with real-world configuration examples"
tags: [cdn, caching, cache-control, cloudflare, cloudfront, akamai, edge-computing, performance, system-design]
difficulty: intermediate
prerequisites: [caching, caching-strategies, networking]
lastReviewed: "2026-03-17"
---

# CDN Deep Dive

A Content Delivery Network is a geographically distributed system of proxy servers that caches and delivers content from locations physically closer to end users. CDNs are the single largest performance lever available to any internet-facing application. When configured correctly, a CDN eliminates 50-90% of origin traffic, reduces global latency from hundreds of milliseconds to single-digit milliseconds, and absorbs traffic spikes that would otherwise destroy your infrastructure. When configured incorrectly, it serves stale data to millions of users, leaks private content across accounts, or bypasses your cache entirely — turning an expensive edge network into an overpriced reverse proxy.

This page goes beyond the marketing overview. We examine how CDNs actually work at the network layer, master every `Cache-Control` directive, design cache keys that maximize hit rates without serving wrong content, implement purging strategies that balance freshness with performance, and compare the major providers on the dimensions that actually matter.

## How CDNs Work — From First Principles

### The Fundamental Problem

Your origin server sits in `us-east-1`. A user in Tokyo makes a request. The speed of light in fiber optic cable is roughly 200,000 km/s. The cable distance from Virginia to Tokyo is approximately 14,000 km. Round-trip propagation delay alone is:

```
Round-trip distance: 14,000 km × 2 = 28,000 km
Propagation delay: 28,000 km / 200,000 km/s = 140 ms
```

That's 140ms of unavoidable physics before a single byte of your response is generated. Add TCP handshake (1 RTT), TLS handshake (1-2 RTTs), and actual processing time, and you're looking at 400-600ms for a single request. For a page that makes 50 sub-requests, this is catastrophic.

A CDN solves this by placing cached copies of your content at **Points of Presence (PoPs)** close to users. When a Tokyo user requests your content, the CDN PoP in Tokyo serves it — the round trip is 2-5ms instead of 140ms.

### CDN Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     CDN Architecture                      │
│                                                           │
│  User (Tokyo)                                            │
│      │                                                   │
│      │ DNS resolves to nearest PoP                       │
│      ▼                                                   │
│  ┌──────────────────┐                                    │
│  │   Edge PoP       │                                    │
│  │   (Tokyo)        │◄──── Cache HIT? Serve directly     │
│  │                  │                                    │
│  │  ┌─────────────┐ │      Cache MISS?                   │
│  │  │ Edge Cache  │ │          │                         │
│  │  │ (L1 - SSD)  │ │          ▼                         │
│  │  └─────────────┘ │  ┌──────────────────┐              │
│  └──────────────────┘  │   Shield PoP      │              │
│                        │   (US Regional)   │              │
│                        │                   │              │
│                        │  ┌─────────────┐  │              │
│                        │  │ Mid-Tier     │  │              │
│                        │  │ Cache (L2)   │  │              │
│                        │  └─────────────┘  │              │
│                        └───────┬───────────┘              │
│                                │                          │
│                                │ Shield MISS?             │
│                                ▼                          │
│                        ┌──────────────────┐              │
│                        │   Origin Server   │              │
│                        │   (us-east-1)     │              │
│                        └──────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

### DNS Resolution and Anycast

When a user requests `cdn.example.com`, the CDN's authoritative DNS server returns the IP address of the nearest PoP. CDNs use two approaches:

**GeoDNS (Unicast):** The DNS server looks up the resolver's IP, maps it to a geographic region, and returns the IP of the nearest PoP. Akamai primarily uses this approach.

```
User in Tokyo → DNS query → CDN DNS sees resolver IP 203.x.x.x
  → Maps to Asia-Pacific → Returns IP of Tokyo PoP
```

The weakness: the resolver's IP might not be near the user (e.g., a corporate VPN resolving through a US-based DNS server). EDNS Client Subnet (ECS) mitigates this by including the client's subnet in the DNS query.

**Anycast:** Multiple PoPs advertise the same IP address via BGP. The internet's routing infrastructure naturally directs packets to the nearest advertising node. Cloudflare uses this approach.

```
All PoPs announce: 104.16.132.229/32
BGP routing automatically selects the shortest AS path
User in Tokyo → routed to Tokyo PoP (shortest BGP path)
```

Anycast advantages:
- Automatic failover — if a PoP goes down, BGP reconverges to the next nearest
- No DNS TTL delays during failover
- Works correctly regardless of resolver location

Anycast disadvantages:
- Requires owning IP address space and operating BGP
- TCP connections can break during BGP reconvergence (mitigated by ECMP and session affinity)

### The Request Flow in Detail

Let's trace a complete CDN request from the moment a user clicks a link:

```
1. User requests https://cdn.example.com/images/hero.webp
2. Browser DNS lookup: cdn.example.com → 104.16.132.229 (edge PoP IP)
3. TCP + TLS handshake with edge PoP (2-5ms RTT)
4. Edge receives HTTP request
5. Edge computes cache key: GET|cdn.example.com|/images/hero.webp|webp
6. Edge checks L1 cache (SSD/RAM on edge server)
   ├── HIT → serve response, add Age header, done (sub-millisecond)
   └── MISS → continue to step 7
7. Edge checks if another request for same key is in-flight
   ├── YES → coalesce (wait for other request's response)
   └── NO → continue to step 8
8. Edge forwards to shield/mid-tier PoP
9. Shield checks L2 cache
   ├── HIT → serve to edge, edge caches, serves to user
   └── MISS → continue to step 10
10. Shield forwards to origin
11. Origin generates response with Cache-Control headers
12. Shield caches response, forwards to edge
13. Edge caches response, serves to user
```

### Connection Coalescing (Request Collapsing)

When a popular resource's cache expires, hundreds of edge servers might simultaneously request it from the origin. This is the CDN version of the thundering herd problem. CDNs handle this with **request collapsing** (also called request coalescing):

```
Time 0ms:  Request A for /popular.jpg arrives → cache MISS → fetch from origin
Time 1ms:  Request B for /popular.jpg arrives → sees A is in-flight → WAIT
Time 2ms:  Request C for /popular.jpg arrives → sees A is in-flight → WAIT
Time 50ms: Origin responds to A
           Response cached
           B and C served from cache
```

Without collapsing, the origin would receive three requests. With collapsing, it receives one. At CDN scale, this can reduce origin load by 100x during cache invalidation events.

**Caveat:** Request collapsing only works within a single edge server. If the resource expires across 200 PoPs simultaneously, you still get 200 origin requests (one per PoP). Origin shielding reduces this to one request from the shield PoP.

## Cache-Control Headers — Complete Reference

The `Cache-Control` header is the primary mechanism for controlling CDN behavior. Most developers use `max-age` and nothing else. This section covers every directive and its interactions.

### Response Directives

#### `max-age=<seconds>`

Sets the maximum time a response is considered fresh. Both browsers and CDNs respect this.

```http
Cache-Control: max-age=3600
```

The response is fresh for 3,600 seconds (1 hour) from the time it was generated (indicated by the `Date` header). After this, the response is **stale** — it might still be served (see `stale-while-revalidate`), but the cache knows it needs refreshing.

**Common mistake:** Setting `max-age=31536000` (1 year) on resources without versioned URLs. If you deploy a fix, users are stuck with the old version until the cache expires.

#### `s-maxage=<seconds>`

Like `max-age`, but **only applies to shared caches** (CDNs, reverse proxies). Private caches (browsers) ignore it.

```http
Cache-Control: public, s-maxage=86400, max-age=60
```

This means: CDN caches for 24 hours, browser caches for 60 seconds. This is the most important CDN-specific directive because it lets you cache aggressively at the edge while keeping browser caches short for faster updates.

#### `public`

Explicitly marks the response as cacheable by shared caches. Required when:
- The request included an `Authorization` header (shared caches won't cache by default)
- You want to be explicit about cacheability

```http
Cache-Control: public, s-maxage=3600
```

#### `private`

The response is intended for a single user and **must not be stored by shared caches** (CDNs). Only the browser may cache it.

```http
Cache-Control: private, max-age=600
```

**When to use:** Personalized content — user dashboards, account pages, API responses containing user-specific data. If you cache a `private` response at the CDN, you risk serving User A's data to User B. This is a security vulnerability.

#### `no-cache`

The response **may be stored** but **must be revalidated** with the origin before each use. This does NOT mean "don't cache" (that's `no-store`).

```http
Cache-Control: no-cache
```

With `no-cache`, the CDN stores the response but sends a conditional request (`If-None-Match` or `If-Modified-Since`) to the origin every time. If the origin returns `304 Not Modified`, the cached version is served. This gives you freshness guarantees with bandwidth savings.

**Real-world use:** HTML pages that must always be fresh but change infrequently. The revalidation request is small (just headers), and the 304 response avoids re-transferring the full page.

#### `no-store`

The response **must not be stored** in any cache (shared or private). This is the nuclear option.

```http
Cache-Control: no-store
```

**When to use:** Truly sensitive data — banking transactions, medical records, authentication tokens. Note that `no-store` also prevents the browser's back/forward cache from storing the response, which can cause usability issues (e.g., the page reloads when the user hits the back button).

#### `must-revalidate`

Once a cached response becomes stale, it **must not be used** without revalidation. Without this directive, caches may serve stale content in certain situations (e.g., when the origin is unreachable).

```http
Cache-Control: max-age=3600, must-revalidate
```

**The difference from `no-cache`:** `no-cache` requires revalidation on every request. `must-revalidate` only requires revalidation after the response becomes stale (after `max-age` expires).

#### `proxy-revalidate`

Like `must-revalidate`, but only applies to shared caches. Browsers can serve stale content.

```http
Cache-Control: max-age=3600, proxy-revalidate
```

#### `stale-while-revalidate=<seconds>`

Allows the cache to serve a stale response while asynchronously revalidating in the background. This is the most important performance directive for dynamic content.

```http
Cache-Control: max-age=60, stale-while-revalidate=300
```

This means:
- 0-60 seconds: serve from cache (fresh)
- 60-360 seconds: serve stale response immediately, trigger background revalidation
- After 360 seconds: must revalidate before serving (stale period expired)

```
Timeline: |---fresh (60s)---|---stale-while-revalidate (300s)---|---must revalidate---|
          0                60                                  360

Request at t=90:
  → Cache serves stale response instantly (user sees content in ~5ms)
  → Cache asynchronously fetches new version from origin
  → Next request at t=91 gets the fresh version
```

**Why this matters:** Without `stale-while-revalidate`, every request after `max-age` expires must wait for a full round trip to the origin. With it, users never see the latency of a cache miss (except the very first request).

#### `stale-if-error=<seconds>`

Allows the cache to serve a stale response if the origin returns a 5xx error or is unreachable.

```http
Cache-Control: max-age=3600, stale-if-error=86400
```

This means: if the origin is down, serve cached content up to 24 hours old. This is essential for resilience — your CDN acts as a buffer during origin outages.

#### `no-transform`

Prevents intermediaries from modifying the response body. Some CDNs and proxies compress images, minify JavaScript, or convert image formats. `no-transform` prohibits this.

```http
Cache-Control: no-transform
```

#### `immutable`

Indicates the response body will never change. Browsers skip revalidation even when the user explicitly refreshes the page.

```http
Cache-Control: max-age=31536000, immutable
```

**When to use:** Content-addressed URLs (e.g., `/assets/app.a1b2c3d4.js`). The hash in the filename guarantees the content is immutable. Without `immutable`, browsers send conditional requests on manual refresh, wasting bandwidth.

### Request Directives

Clients can also send `Cache-Control` directives in requests:

| Directive | Meaning |
|-----------|---------|
| `no-cache` | Don't serve cached response without revalidation |
| `no-store` | Don't store the response |
| `max-age=0` | Consider cached response stale |
| `max-stale=<seconds>` | Accept a stale response up to N seconds old |
| `min-fresh=<seconds>` | Response must be fresh for at least N more seconds |
| `no-transform` | Don't modify the response |
| `only-if-cached` | Only serve if cached; return 504 otherwise |

**CDN behavior with request directives varies by provider.** Cloudflare ignores client `Cache-Control` by default (for security). CloudFront respects `max-age=0` for cache bypass. Always test your specific CDN's behavior.

### ETag and Conditional Requests

ETags work with `Cache-Control` to enable efficient revalidation:

```
First request:
  Response: 200 OK
  ETag: "abc123"
  Cache-Control: max-age=60

After 60 seconds (stale):
  Request: GET /resource
  If-None-Match: "abc123"

  Origin compares ETag:
  ├── Changed → 200 OK + new body + new ETag
  └── Same   → 304 Not Modified (no body, save bandwidth)
```

**Strong vs Weak ETags:**

```http
ETag: "abc123"        # Strong — byte-for-byte identical
ETag: W/"abc123"      # Weak — semantically equivalent
```

Strong ETags are required for byte-range requests. Weak ETags are sufficient for cache revalidation. Most CDNs strip strong ETags when they modify responses (e.g., applying gzip compression), so you may need weak ETags if your CDN compresses content.

### Vary Header — Cache Key Modification

The `Vary` header tells caches that the response differs based on certain request headers. It effectively adds those headers to the cache key.

```http
Vary: Accept-Encoding
```

This means: cache separate copies for different `Accept-Encoding` values. A client requesting `gzip` gets one cached copy; a client requesting `br` (Brotli) gets another.

```http
Vary: Accept-Encoding, Accept-Language
```

This creates a separate cache entry for every combination of encoding and language. Be careful — `Vary` can destroy your cache hit rate if used carelessly.

**Dangerous:**

```http
Vary: User-Agent
```

There are thousands of unique User-Agent strings. This effectively disables caching because almost every request has a unique User-Agent. Instead, normalize to a few device classes at the CDN level.

**Cloudflare Workers approach:**

```typescript
// Normalize User-Agent to device class in a Cloudflare Worker
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request: Request): Promise<Response> {
  const ua = request.headers.get('User-Agent') || '';
  let deviceClass = 'desktop';

  if (/Mobile|Android|iPhone/i.test(ua)) {
    deviceClass = 'mobile';
  } else if (/iPad|Tablet/i.test(ua)) {
    deviceClass = 'tablet';
  }

  // Create new request with normalized header
  const normalizedRequest = new Request(request, {
    headers: new Headers(request.headers),
  });
  normalizedRequest.headers.set('X-Device-Class', deviceClass);

  const response = await fetch(normalizedRequest);

  // Tell CDN to vary on normalized header instead of full User-Agent
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Vary', 'X-Device-Class, Accept-Encoding');

  return newResponse;
}
```

## Cache Key Design

The cache key determines when two requests are considered "the same" and can share a cached response. Getting this right is the difference between a 95% hit rate and a 30% hit rate.

### Default Cache Key

Most CDNs default to:

```
Method + Host + Path + Query String
```

So these are different cache keys:

```
GET https://cdn.example.com/api/products?page=1&sort=price
GET https://cdn.example.com/api/products?sort=price&page=1
GET https://cdn.example.com/api/products?page=1&sort=price&tracking=abc123
```

**Problem 1: Query string ordering.** The first two requests are semantically identical but have different cache keys because query parameters are in a different order.

**Problem 2: Tracking parameters.** The third request includes a `tracking` parameter that doesn't affect the response but creates a unique cache key.

### Optimizing Cache Keys

#### Sort Query Parameters

Normalize query string parameter order to maximize cache hits:

```typescript
// Cloudflare Worker: sort query parameters
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Sort query parameters alphabetically
  const sortedParams = new URLSearchParams(
    [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
  );

  url.search = sortedParams.toString();

  return fetch(new Request(url.toString(), request));
}
```

#### Strip Irrelevant Parameters

Remove query parameters that don't affect the response:

```typescript
const STRIP_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid',
  '_ga', '_gl',
  'ref', 'source',
]);

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  for (const param of STRIP_PARAMS) {
    url.searchParams.delete(param);
  }

  // Sort remaining params
  const sortedParams = new URLSearchParams(
    [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
  );
  url.search = sortedParams.toString();

  return fetch(new Request(url.toString(), request));
}
```

#### Include Custom Headers in Cache Key

Sometimes the same URL returns different content based on headers (e.g., `Accept-Language`, `X-Country`). Add these to the cache key:

```
// Cloudflare: Use Cache API with custom cache key
const cacheKey = new Request(url.toString(), {
  headers: {
    'X-Cache-Key-Country': request.headers.get('CF-IPCountry') || 'US',
    'X-Cache-Key-Lang': request.headers.get('Accept-Language')?.split(',')[0] || 'en',
  }
});
```

#### Cache Key Design Principles

| Principle | Why |
|-----------|-----|
| Include everything that affects the response | Prevents serving wrong content to users |
| Exclude everything that doesn't | Maximizes hit rate |
| Normalize variable inputs | Same content → same key |
| Keep keys short | Faster lookups, less memory |
| Be explicit about Vary | Don't rely on CDN defaults |

### Debugging Cache Keys

Most CDNs expose the cache key in response headers:

```bash
# Cloudflare
curl -I https://cdn.example.com/page | grep cf-cache-status
# HIT, MISS, EXPIRED, REVALIDATED, DYNAMIC, BYPASS

# CloudFront
curl -I https://d123.cloudfront.net/page | grep x-cache
# Hit from cloudfront, Miss from cloudfront

# Fastly
curl -I https://cdn.example.com/page | grep x-cache
# HIT, MISS, PASS, SYNTH

# Akamai
# Add Pragma: akamai-x-cache-on to request
curl -H "Pragma: akamai-x-cache-on" -I https://cdn.example.com/page
```

## Cache Purging Strategies

Cache invalidation is one of the two hard problems in computer science (along with naming things and off-by-one errors). Purging is how you tell a CDN to discard cached content before it naturally expires.

### Purge Methods

#### Single URL Purge

Purge a specific URL from all edge caches:

```bash
# Cloudflare API
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://cdn.example.com/images/hero.webp"]}'

# CloudFront
aws cloudfront create-invalidation \
  --distribution-id ${DIST_ID} \
  --paths "/images/hero.webp"

# Fastly
curl -X PURGE https://cdn.example.com/images/hero.webp \
  -H "Fastly-Key: ${API_KEY}"
```

**Propagation time:** Cloudflare: <2 seconds globally. CloudFront: 5-10 minutes (invalidation request is queued). Fastly: ~150ms (instant purge is their core differentiator). Akamai: 5-7 seconds.

#### Tag-Based Purge (Surrogate Keys)

Assign tags to cached objects, then purge all objects with a specific tag. This is the most powerful purging mechanism.

```http
# Origin response includes surrogate keys
Surrogate-Key: product-123 category-electronics homepage-featured
# Fastly calls these "surrogate keys"

# Cloudflare uses Cache-Tag
Cache-Tag: product-123, category-electronics, homepage-featured
```

When product 123's price changes, purge all cached content tagged with `product-123`:

```bash
# Fastly: purge by surrogate key
curl -X POST "https://api.fastly.com/service/${SERVICE_ID}/purge/product-123" \
  -H "Fastly-Key: ${API_KEY}"

# Cloudflare: purge by cache tag (Enterprise only)
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"tags":["product-123"]}'
```

This purges the product page, the category listing, and the homepage — all in one call, without knowing their specific URLs.

#### Prefix Purge

Purge all URLs matching a path prefix:

```bash
# CloudFront: wildcard invalidation
aws cloudfront create-invalidation \
  --distribution-id ${DIST_ID} \
  --paths "/images/*"

# Cloudflare: prefix purge (Enterprise)
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"prefixes":["cdn.example.com/images/"]}'
```

#### Purge Everything

Nuclear option — clear the entire CDN cache:

```bash
# Cloudflare: purge everything
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

**Warning:** Purging everything causes a thundering herd on your origin. Every subsequent request is a cache miss. Only do this if you've changed something fundamental (like cache key structure) and have auto-scaling or rate limiting on your origin.

### Purge Strategy Comparison

| Strategy | Precision | Speed | Origin Impact | Use Case |
|----------|-----------|-------|---------------|----------|
| Single URL | Exact | Fast | Minimal | Individual resource update |
| Tag-based | Grouped | Fast | Moderate | Content relationship changes |
| Prefix | Directory-level | Medium | Moderate-High | Deploy new version of asset type |
| Purge all | Everything | Fast | Severe | Nuclear option, structural changes |

### Versioned URLs — Avoiding Purges Entirely

The best purge strategy is to never need one. Use content-addressed URLs:

```
/assets/app.a1b2c3d4.js       ← Hash in filename
/images/hero.v1679234567.webp  ← Timestamp version
```

Set `Cache-Control: max-age=31536000, immutable` on these resources. When content changes, deploy a new filename. The old filename is never requested again (unless someone has a hardcoded link).

**Implementation pattern:**

```typescript
// Build step generates manifest
const manifest = {
  'app.js': 'app.a1b2c3d4.js',
  'styles.css': 'styles.e5f6g7h8.css',
  'hero.webp': 'hero.i9j0k1l2.webp',
};

// HTML template references versioned URLs
function assetUrl(name: string): string {
  const versioned = manifest[name];
  if (!versioned) throw new Error(`Unknown asset: ${name}`);
  return `https://cdn.example.com/assets/${versioned}`;
}
```

The HTML page itself (which references these URLs) must not be cached long-term (use `Cache-Control: no-cache` or short `max-age`). This is the standard pattern used by every major web application.

## Origin Shielding

Origin shielding is a CDN architecture pattern where a single PoP (the "shield") sits between all edge PoPs and the origin. Without shielding, every edge PoP that has a cache miss contacts the origin directly. With 200+ PoPs, a cache expiration can generate 200+ simultaneous origin requests.

### How Origin Shielding Works

```
Without shielding:
  Edge Tokyo  ──→ Origin (us-east-1)
  Edge London ──→ Origin (us-east-1)
  Edge Sydney ──→ Origin (us-east-1)
  Edge Mumbai ──→ Origin (us-east-1)
  ... 200+ simultaneous requests

With shielding:
  Edge Tokyo  ──→ Shield (us-east-1) ──→ Origin (us-east-1)
  Edge London ──→ Shield (us-east-1) ─┘   (single request,
  Edge Sydney ──→ Shield (us-east-1) ─┘    request collapsing
  Edge Mumbai ──→ Shield (us-east-1) ─┘    at shield level)
```

### Benefits

1. **Reduced origin load:** One request per cache miss instead of N (where N = number of PoPs)
2. **Higher cache hit rate:** Shield has aggregated traffic from all edges, so popular content stays warm
3. **Better request collapsing:** Single point for coalescing concurrent requests
4. **Simplified origin infrastructure:** Origin only needs to handle shield traffic, not global edge traffic

### Configuration

```bash
# CloudFront: Origin Shield
aws cloudfront create-distribution --distribution-config '{
  "Origins": {
    "Items": [{
      "DomainName": "origin.example.com",
      "OriginShield": {
        "Enabled": true,
        "OriginShieldRegion": "us-east-1"
      }
    }]
  }
}'
```

**Cost consideration:** Origin shielding adds an additional cache tier, which means additional data transfer costs. CloudFront charges extra for Origin Shield requests. Calculate whether the origin load reduction justifies the cost.

### Choosing the Shield Region

Place the shield PoP close to your origin:

| Origin Location | Shield Region | Why |
|----------------|---------------|-----|
| us-east-1 (Virginia) | us-east-1 | Same region, <1ms latency |
| eu-west-1 (Ireland) | eu-west-1 | Same region |
| Multi-region origin | Two shields | One per region, route by geography |

## CDN for Dynamic Content

CDNs are traditionally associated with static assets, but modern CDNs increasingly cache and accelerate dynamic content.

### What Can Be Cached

| Content Type | Cacheability | Strategy |
|-------------|-------------|----------|
| Images, CSS, JS, fonts | Always cacheable | Long `max-age` + versioned URLs |
| HTML pages (static) | Always cacheable | Short `max-age` or `stale-while-revalidate` |
| API responses (public) | Often cacheable | Short `s-maxage`, `Vary` on relevant headers |
| API responses (personalized) | Partially cacheable | Edge-side composition or `private` |
| HTML pages (personalized) | Usually not cacheable | ESI or edge compute |
| WebSocket/streaming | Not cacheable | CDN provides connection optimization only |

### Edge-Side Includes (ESI)

ESI allows you to cache page fragments independently. A product page might be 90% static (description, images) with 10% dynamic (cart count, user greeting). Cache the static part at the CDN and assemble dynamically:

```html
<!-- Cached at CDN for 1 hour -->
<html>
<body>
  <header>
    <!-- Dynamic fragment, fetched from origin on every request -->
    <esi:include src="/fragments/user-greeting" />
  </header>
  <main>
    <!-- Cached product content -->
    <h1>Product Name</h1>
    <p>Product description...</p>
  </main>
</body>
</html>
```

ESI is supported by Akamai (native), Fastly (via VCL), and Varnish. Cloudflare and CloudFront don't support ESI but offer Workers/Lambda@Edge as alternatives.

### Edge Compute — The Modern Alternative to ESI

Edge compute platforms run your code at CDN PoPs, enabling sophisticated caching logic:

```typescript
// Cloudflare Worker: personalized caching
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Cache the base page content
    const cacheKey = `${url.pathname}`;
    const cache = caches.default;

    let response = await cache.match(new Request(cacheKey));

    if (!response) {
      response = await fetch(request);
      // Cache for 1 hour
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 's-maxage=3600');
      response = new Response(response.body, { ...response, headers });
      await cache.put(new Request(cacheKey), response.clone());
    }

    // Personalize at the edge
    const html = await response.text();
    const userId = getUserFromCookie(request);

    // Inject user-specific content
    const personalizedHtml = html.replace(
      '<!-- USER_GREETING -->',
      userId ? `<span>Welcome back, ${await getUserName(env, userId)}</span>` : ''
    );

    return new Response(personalizedHtml, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'private, no-cache', // Final response is personalized
      },
    });
  },
};
```

## CDN Provider Comparison

### Architecture Comparison

| Feature | Cloudflare | CloudFront | Fastly | Akamai |
|---------|-----------|------------|--------|--------|
| **PoP Count** | 300+ | 600+ | 90+ | 4,000+ |
| **Routing** | Anycast | GeoDNS | Anycast + GeoDNS | GeoDNS (EDNS) |
| **Edge Compute** | Workers (V8) | Lambda@Edge / Functions | Compute@Edge (Wasm) | EdgeWorkers (JS) |
| **Purge Speed** | <2s global | 5-10 min | ~150ms | 5-7s |
| **Origin Shield** | Tiered Caching | Origin Shield | Shielding | SureRoute |
| **Tag Purge** | Enterprise only | No | Yes (Surrogate-Key) | Yes (Cache-Tag) |
| **WebSocket** | Yes | Yes | Yes | Yes |
| **HTTP/3 (QUIC)** | Yes | Yes | Limited | Yes |
| **Free Tier** | Generous | 1TB/mo (12 months) | No | No |

### When to Choose Each

**Cloudflare:**
- Best for: developer experience, DDoS protection, free tier
- Workers platform is the most mature edge compute
- Generous free tier includes unlimited bandwidth
- Tag-based purging requires Enterprise plan
- Best all-around choice for most applications

**CloudFront:**
- Best for: AWS-native applications, integration with S3/ALB/API Gateway
- Tight integration with AWS services (signed URLs via IAM, S3 as origin)
- Slow purge propagation (minutes, not seconds)
- Lambda@Edge has cold start issues; CloudFront Functions is faster but limited
- Choose when your infrastructure is already on AWS

**Fastly:**
- Best for: sub-second purging, VCL power users, media streaming
- Instant purge (~150ms global) is their killer feature
- Surrogate keys enable the most sophisticated purging strategies
- VCL (Varnish Configuration Language) is extremely powerful but has a learning curve
- Compute@Edge uses WebAssembly (supports Rust, Go, JS)
- Choose when you need instant cache invalidation (news, e-commerce pricing)

**Akamai:**
- Best for: enterprise, highest PoP count, compliance requirements
- 4,000+ PoPs — the largest CDN network
- Premium pricing, enterprise sales process
- Best for regulated industries (HIPAA, PCI, FedRAMP)
- Choose when you need the largest network or have enterprise compliance needs

### Pricing Models

```
Cloudflare:
  Free:  Unlimited bandwidth, shared SSL, basic WAF
  Pro:   $20/mo — advanced WAF, image optimization
  Biz:   $200/mo — custom SSL, advanced caching
  Ent:   Custom — tag purging, premium support, SLA

CloudFront:
  Data Transfer: $0.085/GB (first 10TB/mo, US/EU)
  Requests:      $0.0100/10,000 HTTPS requests
  Origin Shield: $0.0090/10,000 requests
  Invalidations: First 1,000/mo free, $0.005 each after

  Example: 10TB/mo, 100M requests ≈ $950/mo

Fastly:
  Data Transfer: $0.12/GB (first 10TB/mo, US)
  Requests:      $0.0090/10,000 requests
  No separate purge charges

  Example: 10TB/mo, 100M requests ≈ $1,290/mo

Akamai:
  Custom pricing (enterprise sales)
  Generally 2-5x CloudFront pricing
  Committed use discounts available
```

### Multi-CDN Strategies

Large-scale applications often use multiple CDNs for redundancy and performance optimization:

```
┌─────────────────────────────────┐
│       DNS Load Balancer         │
│  (NS1, Route53, Cloudflare)    │
│                                 │
│  ┌──────────┐  ┌──────────┐    │
│  │Cloudflare│  │ Fastly   │    │
│  │  (70%)   │  │  (30%)   │    │
│  └────┬─────┘  └────┬─────┘    │
│       │              │          │
│       └──────┬───────┘          │
│              ▼                  │
│       ┌──────────┐              │
│       │  Origin  │              │
│       └──────────┘              │
└─────────────────────────────────┘
```

**Benefits:**
- Failover if one CDN has an outage
- Route to the faster CDN per region (Cloudflare might be faster in Asia, Fastly in Europe)
- Negotiation leverage with CDN vendors

**Challenges:**
- Cache invalidation must be sent to all CDNs
- Debugging is harder (which CDN served the request?)
- Different CDNs interpret headers differently

## Real-World Configuration Patterns

### Static Site with Versioned Assets

```typescript
// Origin server (Express.js example)
import express from 'express';
const app = express();

// Versioned static assets — cache forever
app.use('/assets', express.static('dist/assets', {
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

// HTML pages — always revalidate
app.get('*', (req, res) => {
  res.set('Cache-Control', 'public, no-cache');
  res.set('ETag', computeEtag(req.path));
  res.sendFile('dist/index.html');
});
```

### API with Short-Lived Caching

```typescript
// API endpoint with CDN caching
app.get('/api/products', (req, res) => {
  const products = getProducts(req.query);

  res.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
  res.set('Vary', 'Accept-Encoding');
  res.set('Surrogate-Key', 'products product-list');

  res.json(products);
});

// When a product changes, purge by tag
async function onProductUpdate(productId: string): Promise<void> {
  await purgeByTag('products');
  await purgeByTag(`product-${productId}`);
}
```

### E-Commerce Category Pages

```typescript
app.get('/category/:slug', async (req, res) => {
  const category = await getCategory(req.params.slug);
  const html = renderCategoryPage(category);

  res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400');
  res.set('Surrogate-Key', `category-${category.id} ${category.productIds.map(id => `product-${id}`).join(' ')}`);
  res.set('Vary', 'Accept-Encoding');

  res.send(html);
});
```

This configuration:
- Caches at the CDN for 5 minutes
- Serves stale content for up to 1 hour while revalidating
- Serves stale content for up to 24 hours if the origin is down
- Tags the response with the category ID and all product IDs, enabling targeted purging

## Common Pitfalls

### 1. Caching Set-Cookie Responses

If your origin sets cookies and you cache the response at the CDN, every user gets the same cookie. This can cause session hijacking.

```http
# DANGEROUS: CDN caches this, all users get User A's session
Set-Cookie: session=abc123
Cache-Control: public, s-maxage=3600
```

**Fix:** Never set `Cache-Control: public` on responses with `Set-Cookie`. Most CDNs automatically skip caching when `Set-Cookie` is present, but don't rely on this.

### 2. Caching Authenticated Content

```http
# DANGEROUS: CDN serves User A's dashboard to User B
GET /dashboard HTTP/1.1
Authorization: Bearer eyJ...

HTTP/1.1 200 OK
Cache-Control: public, s-maxage=300
```

**Fix:** Use `Cache-Control: private` for authenticated content, or strip the `Authorization` header at the CDN and implement authentication at the edge.

### 3. Ignoring Cache-Control on Error Responses

If your origin returns a 500 error without `Cache-Control`, some CDNs cache it (following default rules). Now your 500 error is served to all users for the TTL duration.

**Fix:** Always set explicit `Cache-Control` on error responses:

```typescript
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store');
  res.status(500).json({ error: 'Internal Server Error' });
});
```

### 4. Cache Key Explosion

Adding too many dimensions to the cache key (country, language, device type, A/B test variant, feature flags) creates so many cache key combinations that each has very few hits.

```
Cache keys: /page × 50 countries × 10 languages × 3 devices × 4 AB variants = 6,000 entries per URL
```

**Fix:** Only include dimensions that actually change the response. If the same HTML works for mobile and desktop (responsive design), don't include device type in the cache key.

### 5. Thundering Herd After Purge

Purging a popular resource causes every subsequent request to be a cache miss, potentially overwhelming the origin.

**Fix:** Use **soft purge** (mark as stale rather than delete) combined with `stale-while-revalidate`:

```bash
# Fastly: soft purge (marks as stale, serves while revalidating)
curl -X PURGE https://cdn.example.com/popular-page \
  -H "Fastly-Key: ${API_KEY}" \
  -H "Fastly-Soft-Purge: 1"
```

## Monitoring and Observability

### Key Metrics

| Metric | What It Tells You | Target |
|--------|------------------|--------|
| Cache Hit Ratio | % of requests served from cache | >90% for static, >60% for dynamic |
| Origin Bandwidth | Data transferred from origin | Should be fraction of edge bandwidth |
| Time to First Byte (TTFB) | Edge response latency | <50ms for cache hits |
| Purge Propagation Time | Time for purge to reach all PoPs | Provider-dependent |
| Error Rate (5xx at edge) | CDN-level errors | <0.01% |
| Cache Eviction Rate | How often cache entries are evicted | Low = cache is adequately sized |

### Cloudflare Analytics Query

```bash
# Cloudflare GraphQL Analytics API
curl -X POST "https://api.cloudflare.com/client/v4/graphql" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "query": "{ viewer { zones(filter: {zoneTag: \"ZONE_ID\"}) { httpRequests1dGroups(limit: 7, filter: {date_gt: \"2026-03-10\"}) { dimensions { date } sum { requests cachedRequests bytes cachedBytes } } } } }"
  }'
```

### CloudFront Real-Time Logs

```typescript
// CloudFront real-time log configuration
// Logs are sent to Kinesis Data Streams
const logConfig = {
  StreamType: 'RealTime',
  Fields: [
    'timestamp',
    'c-ip',
    'sc-status',
    'sc-bytes',
    'cs-uri-stem',
    'x-edge-result-type',    // Hit, Miss, Error
    'x-edge-response-result-type',
    'time-to-first-byte',
    'cs-protocol',
  ],
  SamplingRate: 100,  // 100% of requests
  EndPoints: [{
    StreamType: 'Kinesis',
    KinesisStreamConfig: {
      RoleARN: 'arn:aws:iam::role/CloudFrontLogger',
      StreamARN: 'arn:aws:kinesis:us-east-1::stream/cdn-logs',
    },
  }],
};
```

## Performance Optimization Checklist

### Headers

- [ ] Set `Cache-Control` with `s-maxage` on all cacheable responses
- [ ] Use `stale-while-revalidate` for near-zero latency on dynamic content
- [ ] Use `stale-if-error` for resilience during origin outages
- [ ] Set `immutable` on content-addressed URLs
- [ ] Configure `Vary` carefully — only include headers that change the response
- [ ] Set `no-store` on sensitive/personalized responses
- [ ] Always include `Cache-Control` on error responses

### Cache Keys

- [ ] Strip marketing/tracking query parameters (UTM, fbclid, etc.)
- [ ] Sort query parameters for consistent keys
- [ ] Normalize `Accept-Language`, `User-Agent` to reduce key cardinality
- [ ] Audit cache key dimensions to prevent key explosion

### Architecture

- [ ] Enable origin shielding to reduce origin load
- [ ] Use versioned/fingerprinted URLs for static assets
- [ ] Implement tag-based purging for related content
- [ ] Use soft purge to prevent thundering herd
- [ ] Configure request collapsing at the CDN level
- [ ] Set up multi-CDN if availability requirements demand it

### Monitoring

- [ ] Track cache hit ratio by content type
- [ ] Alert on sudden drops in hit ratio (indicates misconfiguration or purge storm)
- [ ] Monitor origin bandwidth — spikes indicate cache misses
- [ ] Track TTFB at the edge to detect performance regressions
- [ ] Log cache status headers for debugging

## Further Reading

- [Caching Strategies](/system-design/caching/caching-strategies) — Fundamental patterns that apply at every layer including CDNs
- [Cache Invalidation](/system-design/caching/cache-invalidation) — Deep dive into the hardest problem in caching
- [Thundering Herd](/system-design/caching/thundering-herd) — The failure mode that cache expiration creates
- [Multi-Layer Caching](/system-design/caching/multi-layer-caching) — How CDN caching fits into L1/L2/L3 cache architectures
- [DNS Deep Dive](/system-design/networking/dns-deep-dive) — How CDN routing works at the DNS level
- [HTTP/2 & HTTP/3](/system-design/networking/http2-http3) — Protocols that CDNs use to accelerate delivery
- [TLS Handshake](/system-design/networking/tls-handshake) — How CDNs terminate TLS at the edge
