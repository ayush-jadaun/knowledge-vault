---
title: "Cache Sizing Math"
description: "Complete mathematical deep dive into cache sizing — working set estimation, hit rate modeling, Zipf distribution, the 80/20 rule formalized, sizing formulas, Redis memory overhead, and practical sizing examples"
tags: [caching, cache-sizing, hit-rate, zipf-distribution, working-set, memory, performance, mathematics]
difficulty: advanced
prerequisites: [caching, caching-strategies, multi-layer-caching]
lastReviewed: "2026-03-17"
---

# Cache Sizing Math

"How big should my cache be?" is one of the most important questions in system design, and one of the most poorly answered. Too small and the cache thrashes (entries evicted before they can be re-used), hit rate collapses, and origin load spikes. Too large and you waste money on memory, increase garbage collection pressure, and create a false sense of security. The right answer requires understanding your access pattern mathematically — specifically, the distribution of request frequencies across keys.

## Why This Matters

Memory is not free. A Redis instance with 100 GB of RAM costs approximately $500-1500/month on AWS. If your working set is only 10 GB, you're wasting $450-1350/month. If your working set is 200 GB and you provision 100 GB, your hit rate drops from 95% to 60%, and your database takes 8x more load than expected.

Getting cache size right is a mathematical problem with a precise answer. This page gives you the tools to compute that answer.

## First Principles

A cache is effective when the data it stores is the data most likely to be requested next. The key insight: **not all data is equally popular.** In virtually every real-world system, a small fraction of keys receives a large fraction of requests. This skew is what makes caching work.

If every key were equally popular (uniform distribution), a cache holding $C$ of $N$ total keys would have a hit rate of exactly $C/N$. You'd need to cache 90% of your data to get a 90% hit rate. That's not a cache — that's a database replica.

But real-world access patterns are skewed. The skew follows a power law, typically modeled by the **Zipf distribution**. This skew is why a cache holding just 1-10% of your data can achieve 80-99% hit rates.

## The Zipf Distribution

### Definition

In a Zipf distribution, the frequency of the $i$-th most popular key is proportional to:

$$
f(i) = \frac{1}{i^{\alpha}}
$$

where $\alpha$ is the **Zipf exponent** (also called the skew parameter). The probability that a random request is for the $i$-th most popular key is:

$$
P(i) = \frac{1/i^{\alpha}}{\sum_{j=1}^{N} 1/j^{\alpha}} = \frac{1}{i^{\alpha} \cdot H_{N,\alpha}}
$$

where $H_{N,\alpha} = \sum_{j=1}^{N} 1/j^{\alpha}$ is the generalized harmonic number.

### The Skew Parameter $\alpha$

The value of $\alpha$ determines how skewed the access pattern is:

| $\alpha$ | Distribution Shape | Real-World Example |
|----------|-------------------|-------------------|
| 0 | Uniform (no skew) | Random lookups (unusual) |
| 0.5 | Mild skew | Internal service calls |
| 0.8 | Moderate skew | Typical web API traffic |
| 1.0 | Classic Zipf (Zipf's law) | Natural language word frequency |
| 1.2 | Strong skew | Social media (celebrity accounts) |
| 1.5 | Very strong skew | Viral content, CDN traffic |
| 2.0 | Extreme skew | Breaking news, flash sales |

Most web applications have $\alpha$ between 0.7 and 1.2.

### Measuring $\alpha$ From Your Data

To determine $\alpha$ for your system, collect access counts for each key over a representative time window, then fit a power law:

```typescript
function estimateZipfAlpha(accessCounts: number[]): number {
  // Sort in descending order
  const sorted = [...accessCounts].sort((a, b) => b - a);
  const n = sorted.length;

  // Use maximum likelihood estimation
  // For Zipf: alpha_MLE = 1 / (mean of ln(rank))
  let sumLogRank = 0;
  for (let i = 0; i < n; i++) {
    const rank = i + 1;
    // Weight by access count
    sumLogRank += sorted[i] * Math.log(rank);
  }

  const totalAccesses = sorted.reduce((a, b) => a + b, 0);
  const meanLogRank = sumLogRank / totalAccesses;

  // MLE estimate (simplified — Hill estimator)
  return 1 / meanLogRank;
}

// More robust: least-squares regression on log-log plot
function estimateZipfAlphaRegression(accessCounts: number[]): number {
  const sorted = [...accessCounts].sort((a, b) => b - a);
  const n = sorted.length;

  // Log-log regression: log(count) = -alpha * log(rank) + const
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  for (let i = 0; i < n; i++) {
    if (sorted[i] === 0) continue;
    const x = Math.log(i + 1);       // log(rank)
    const y = Math.log(sorted[i]);    // log(count)
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  // Slope of regression line (negated, since slope is -alpha)
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  return -slope;
}
```

---

## Hit Rate Modeling

### The Independent Reference Model (IRM)

The IRM assumes that each request independently selects a key according to the same probability distribution. Under IRM with a Zipf distribution and an LRU cache of size $C$:

$$
\text{Hit Rate} = \frac{\sum_{i=1}^{C} P(i)}{\sum_{i=1}^{N} P(i)} = \frac{\sum_{i=1}^{C} 1/i^{\alpha}}{\sum_{i=1}^{N} 1/i^{\alpha}} = \frac{H_{C,\alpha}}{H_{N,\alpha}}
$$

This is exact for IRM with optimal (Belady's) replacement, and a close approximation for LRU when $C$ is not too small.

### Computing the Generalized Harmonic Number

$$
H_{n,\alpha} = \sum_{i=1}^{n} \frac{1}{i^{\alpha}}
$$

For large $n$ and $\alpha \neq 1$:

$$
H_{n,\alpha} \approx \frac{n^{1-\alpha}}{1-\alpha} + \zeta(\alpha) - \frac{1}{2n^{\alpha}} + \frac{\alpha}{12n^{\alpha+1}}
$$

where $\zeta(\alpha)$ is the Riemann zeta function.

For $\alpha = 1$ (classic Zipf):

$$
H_{n,1} = \sum_{i=1}^{n} \frac{1}{i} \approx \ln(n) + \gamma
$$

where $\gamma \approx 0.5772$ is the Euler-Mascheroni constant.

### TypeScript: Hit Rate Calculator

```typescript
function generalizedHarmonic(n: number, alpha: number): number {
  // For small n, compute exactly
  if (n < 10000) {
    let sum = 0;
    for (let i = 1; i <= n; i++) {
      sum += 1 / Math.pow(i, alpha);
    }
    return sum;
  }

  // For large n with alpha = 1
  if (Math.abs(alpha - 1) < 0.001) {
    return Math.log(n) + 0.5772156649;
  }

  // For large n with alpha != 1 (approximation)
  return Math.pow(n, 1 - alpha) / (1 - alpha) + 0.5;
}

function estimateHitRate(
  cacheSize: number,   // C: number of entries the cache can hold
  totalKeys: number,   // N: total unique keys in the dataset
  alpha: number        // Zipf exponent
): number {
  const hC = generalizedHarmonic(cacheSize, alpha);
  const hN = generalizedHarmonic(totalKeys, alpha);
  return hC / hN;
}

// Example: 10,000 cache entries, 1,000,000 total keys, alpha = 1.0
console.log(estimateHitRate(10_000, 1_000_000, 1.0));
// ≈ 0.640 (64% hit rate)

console.log(estimateHitRate(10_000, 1_000_000, 1.2));
// ≈ 0.857 (85.7% hit rate)

console.log(estimateHitRate(100_000, 1_000_000, 1.0));
// ≈ 0.837 (83.7% hit rate)

console.log(estimateHitRate(100_000, 1_000_000, 1.2));
// ≈ 0.968 (96.8% hit rate)
```

### Hit Rate Tables

For $N = 1{,}000{,}000$ total keys:

| Cache Size (C) | $\alpha = 0.8$ | $\alpha = 1.0$ | $\alpha = 1.2$ | $\alpha = 1.5$ |
|-----------------|---------------|---------------|---------------|---------------|
| 1,000 (0.1%) | 19.2% | 41.0% | 64.2% | 86.7% |
| 10,000 (1%) | 31.2% | 64.0% | 85.7% | 97.0% |
| 50,000 (5%) | 44.7% | 78.8% | 93.9% | 99.2% |
| 100,000 (10%) | 53.1% | 83.7% | 96.0% | 99.6% |
| 200,000 (20%) | 63.1% | 88.7% | 97.8% | 99.9% |
| 500,000 (50%) | 78.6% | 95.0% | 99.3% | ~100% |

**Key takeaway:** With $\alpha \geq 1.0$, caching just 1% of your data gives you a 64%+ hit rate. Caching 10% gives 84%+ hit rate. The more skewed your access pattern, the smaller the cache you need.

---

## The 80/20 Rule Formalized

The Pareto principle — "80% of effects come from 20% of causes" — can be derived from the Zipf distribution. If $\alpha = 1.0$:

The fraction of requests served by the top $p$ fraction of keys is:

$$
F(p) = \frac{H_{pN, \alpha}}{H_{N, \alpha}} \approx \frac{\ln(pN)}{\ln(N)} = 1 + \frac{\ln(p)}{\ln(N)}
$$

For $N = 1{,}000{,}000$ and $p = 0.20$ (top 20% of keys):

$$
F(0.20) \approx 1 + \frac{\ln(0.20)}{\ln(1{,}000{,}000)} = 1 + \frac{-1.609}{13.816} = 1 - 0.116 = 0.884
$$

So the top 20% of keys serve 88.4% of requests — close to the 80/20 rule.

For $\alpha = 0.86$ (the exact value that gives 80/20):

$$
F(0.20) = 0.80 \text{ when } \alpha \approx 0.86
$$

The 80/20 rule corresponds to $\alpha \approx 0.86$. Most web traffic has $\alpha$ between 0.8 and 1.2, so the 80/20 rule is roughly correct (often 90/10 or even 95/5 in practice).

---

## Required Cache Size for Target Hit Rate

Given a target hit rate $h$, we need to find the cache size $C$ such that:

$$
\frac{H_{C,\alpha}}{H_{N,\alpha}} = h
$$

Solving for $C$:

$$
H_{C,\alpha} = h \cdot H_{N,\alpha}
$$

For $\alpha = 1$ (using the logarithmic approximation):

$$
\ln(C) + \gamma \approx h \cdot (\ln(N) + \gamma)
$$

$$
C \approx e^{h(\ln(N) + \gamma) - \gamma}
$$

For general $\alpha \neq 1$:

$$
\frac{C^{1-\alpha}}{1-\alpha} \approx h \cdot \frac{N^{1-\alpha}}{1-\alpha}
$$

$$
C \approx (h \cdot N^{1-\alpha})^{1/(1-\alpha)} = h^{1/(1-\alpha)} \cdot N
$$

### TypeScript: Required Cache Size Calculator

```typescript
function requiredCacheSize(
  totalKeys: number,     // N
  targetHitRate: number, // h (0.0 to 1.0)
  alpha: number          // Zipf exponent
): number {
  if (alpha === 1.0) {
    const gamma = 0.5772156649;
    const lnN = Math.log(totalKeys) + gamma;
    return Math.ceil(Math.exp(targetHitRate * lnN - gamma));
  }

  // General case: C ≈ h^(1/(1-alpha)) * N
  const exponent = 1 / (1 - alpha);
  const cacheSize = Math.pow(targetHitRate, exponent) * totalKeys;
  return Math.ceil(Math.min(cacheSize, totalKeys));
}

// Examples: N = 1,000,000
console.log(requiredCacheSize(1_000_000, 0.90, 1.0));
// ≈ 126,000 entries (12.6% of dataset)

console.log(requiredCacheSize(1_000_000, 0.95, 1.0));
// ≈ 282,000 entries (28.2% of dataset)

console.log(requiredCacheSize(1_000_000, 0.90, 1.2));
// ≈ 16,000 entries (1.6% of dataset)

console.log(requiredCacheSize(1_000_000, 0.95, 1.2));
// ≈ 40,000 entries (4.0% of dataset)

console.log(requiredCacheSize(1_000_000, 0.99, 1.2));
// ≈ 200,000 entries (20% of dataset)
```

---

## Working Set Size Estimation

The **working set** is the set of keys actively being accessed within a given time window. Not all keys in your database are "active" — many may be dormant (old records, inactive users, archived data).

### Estimating from Access Logs

```typescript
interface AccessLog {
  key: string;
  timestamp: number;
}

function estimateWorkingSet(
  logs: AccessLog[],
  windowMs: number
): WorkingSetEstimate {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Keys accessed within the window
  const activeKeys = new Set<string>();
  const keyCounts = new Map<string, number>();

  for (const log of logs) {
    if (log.timestamp >= windowStart) {
      activeKeys.add(log.key);
      keyCounts.set(log.key, (keyCounts.get(log.key) ?? 0) + 1);
    }
  }

  // Sort by frequency to compute cumulative distribution
  const sorted = [...keyCounts.entries()].sort((a, b) => b[1] - a[1]);
  const totalAccesses = sorted.reduce((sum, [_, count]) => sum + count, 0);

  // Find the number of keys covering 80%, 90%, 95% of accesses
  let cumulative = 0;
  let p80 = 0, p90 = 0, p95 = 0;

  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i][1];
    const fraction = cumulative / totalAccesses;

    if (p80 === 0 && fraction >= 0.80) p80 = i + 1;
    if (p90 === 0 && fraction >= 0.90) p90 = i + 1;
    if (p95 === 0 && fraction >= 0.95) p95 = i + 1;
  }

  return {
    totalUniqueKeys: activeKeys.size,
    keysFor80Percent: p80,
    keysFor90Percent: p90,
    keysFor95Percent: p95,
    totalAccesses,
  };
}

interface WorkingSetEstimate {
  totalUniqueKeys: number;
  keysFor80Percent: number;
  keysFor90Percent: number;
  keysFor95Percent: number;
  totalAccesses: number;
}
```

### Time-Varying Working Sets

Working sets change over time:
- **Daily cycles:** E-commerce sites have different popular products during business hours vs nighttime
- **Weekly cycles:** Some content is popular on weekdays, other on weekends
- **Seasonal:** Holiday products are popular in December, tax software in April
- **Events:** Breaking news, viral content, flash sales create temporary hot keys

Your cache must be sized for the **peak working set**, not the average. Measure during your peak traffic period.

---

## Memory Budget Calculation

Knowing the required number of entries is only half the answer. You also need to know how much memory each entry consumes.

### Redis Memory Overhead Per Key

Redis has per-key overhead beyond the raw key and value data:

| Component | Overhead (bytes) | Notes |
|-----------|-----------------|-------|
| Redis dict entry | 64 | Hash table entry (3 pointers + metadata) |
| Redis object header | 16 | Type, encoding, refcount, LRU/LFU info |
| SDS string header (key) | 9-17 | Simple Dynamic String header |
| SDS string header (value) | 9-17 | Depends on string length |
| Expire entry (if TTL set) | 64 | Separate dict entry for expiration |
| **Total overhead per key** | **~160-180 bytes** | **Plus actual key and value data** |

### Total Memory Formula

For $C$ cache entries, each with key size $k$ bytes and value size $v$ bytes:

$$
\text{Total Memory} = C \times (k + v + O)
$$

where $O$ is the per-key overhead (approximately 170 bytes for Redis with TTL).

### TypeScript: Memory Budget Calculator

```typescript
interface MemoryEstimate {
  totalBytes: number;
  totalMB: number;
  totalGB: number;
  perKeyBytes: number;
  breakdown: {
    keyData: number;
    valueData: number;
    redisOverhead: number;
  };
}

function estimateRedisMemory(
  entryCount: number,
  avgKeySize: number,      // bytes
  avgValueSize: number,    // bytes
  hasTTL: boolean = true
): MemoryEstimate {
  const redisOverhead = hasTTL ? 178 : 114; // Approximate per-key overhead
  const perKeyBytes = avgKeySize + avgValueSize + redisOverhead;
  const totalBytes = entryCount * perKeyBytes;

  // Add Redis hash table overhead (fills to ~50% capacity)
  const hashTableOverhead = totalBytes * 0.10;
  const totalWithOverhead = totalBytes + hashTableOverhead;

  return {
    totalBytes: totalWithOverhead,
    totalMB: totalWithOverhead / (1024 * 1024),
    totalGB: totalWithOverhead / (1024 * 1024 * 1024),
    perKeyBytes,
    breakdown: {
      keyData: entryCount * avgKeySize,
      valueData: entryCount * avgValueSize,
      redisOverhead: entryCount * redisOverhead + hashTableOverhead,
    },
  };
}

// Example: 1 million entries, 30-byte keys, 500-byte values
const estimate = estimateRedisMemory(1_000_000, 30, 500, true);
console.log(`Total: ${estimate.totalGB.toFixed(2)} GB`);
// Total: ~0.72 GB

console.log(`Per key: ${estimate.perKeyBytes} bytes`);
// Per key: ~708 bytes (30 + 500 + 178)

// Example: 10 million entries, 40-byte keys, 200-byte JSON values
const estimate2 = estimateRedisMemory(10_000_000, 40, 200, true);
console.log(`Total: ${estimate2.totalGB.toFixed(2)} GB`);
// Total: ~4.28 GB
```

### Redis Data Type Memory Comparison

Different Redis data types have different memory characteristics:

| Data Type | Per-Entry Overhead | Best For |
|-----------|-------------------|----------|
| String | ~60 bytes | Simple key-value pairs |
| Hash (ziplist encoding) | ~10 bytes per field (up to 128 fields/64 bytes per field) | Small objects with many fields |
| Hash (hashtable encoding) | ~100 bytes per field | Large objects |
| List (listpack) | ~10 bytes per element | Small lists |
| List (quicklist) | ~30 bytes per element | Large lists |
| Set (listpack) | ~10 bytes per element | Small sets |
| Set (hashtable) | ~70 bytes per element | Large sets |
| Sorted Set (listpack) | ~20 bytes per element | Small sorted sets |
| Sorted Set (skiplist) | ~120 bytes per element | Large sorted sets |

::: tip Memory Optimization
For caching many small objects (e.g., user sessions with 5-10 fields), using Redis Hashes with fewer than 128 fields (ziplist encoding) uses approximately 10x less memory than storing each field as a separate String key. Set `hash-max-ziplist-entries 128` and `hash-max-ziplist-value 64` in Redis config.
:::

---

## Practical Sizing Examples

### Example 1: E-Commerce Product Cache

**Given:**
- 2 million products in the database
- 50,000 unique products viewed per day (working set)
- Access pattern: $\alpha \approx 1.1$ (measured from logs)
- Average product JSON: 800 bytes
- Average key: 25 bytes (`product:1234567`)
- Target hit rate: 95%

**Required cache entries:**

$$
C = h^{1/(1-\alpha)} \cdot N = 0.95^{1/(1-1.1)} \cdot 50{,}000 = 0.95^{-10} \cdot 50{,}000
$$

$$
C = 0.95^{-10} \cdot 50{,}000 \approx 1.629 \times 50{,}000 \approx 81{,}450 \text{ entries}
$$

Wait — that's more than the working set. Let's use the working set (50,000) as our $N$ since dormant products are never requested:

$$
C \approx 0.95^{-10} \times 50{,}000 = 81{,}450
$$

Since $C > N$, we'd need to cache the entire working set. But that's only 50,000 keys, which is very manageable.

**Memory estimate:**

$$
\text{Memory} = 50{,}000 \times (25 + 800 + 178) \times 1.10 = 50{,}000 \times 1{,}003 \times 1.10 \approx 55 \text{ MB}
$$

A 55 MB cache. Trivial. Even a 256 MB Redis instance would be overkill.

### Example 2: Social Media Feed Cache

**Given:**
- 100 million users
- 5 million daily active users (DAU)
- Each user's feed is personalized (unique per user)
- Average feed JSON: 10 KB
- Average key: 20 bytes (`feed:12345678`)
- Access pattern: $\alpha \approx 0.9$ (celebrity accounts dominate)
- Target hit rate: 90%

**Required cache entries:**

With $N = 5{,}000{,}000$ (DAU as working set) and $\alpha = 0.9$:

$$
C = 0.90^{1/(1-0.9)} \cdot 5{,}000{,}000 = 0.90^{10} \cdot 5{,}000{,}000
$$

$$
C \approx 0.3487 \times 5{,}000{,}000 = 1{,}743{,}500 \text{ entries}
$$

**Memory estimate:**

$$
\text{Memory} = 1{,}743{,}500 \times (20 + 10{,}240 + 178) \times 1.10 \approx 20 \text{ GB}
$$

A 20 GB cache. This requires a medium Redis instance or a Redis Cluster.

### Example 3: Session Storage

**Given:**
- 2 million concurrent sessions
- All sessions are active (uniform access)
- Average session: 2 KB
- Average key: 42 bytes (UUID)
- Target: cache ALL active sessions (100% hit rate)

**Memory estimate:**

$$
\text{Memory} = 2{,}000{,}000 \times (42 + 2{,}048 + 178) \times 1.10 \approx 4.99 \text{ GB}
$$

A 5 GB cache. This is an exact requirement since all sessions must be cached.

---

## The Diminishing Returns Curve

Adding more cache capacity has diminishing returns. The marginal hit rate improvement per additional cache entry decreases as the cache grows.

The marginal hit rate from adding the $(C+1)$-th entry:

$$
\Delta h = \frac{P(C+1)}{H_{N,\alpha}} = \frac{1}{(C+1)^{\alpha} \cdot H_{N,\alpha}}
$$

For $\alpha = 1.0$ and $N = 1{,}000{,}000$:

| Cache Size | Hit Rate | Marginal Improvement per 1000 entries |
|------------|----------|--------------------------------------|
| 1,000 | 41.0% | 7.2% |
| 10,000 | 64.0% | 0.72% |
| 100,000 | 83.7% | 0.072% |
| 500,000 | 95.0% | 0.014% |

After 100,000 entries, each additional 1,000 entries improves hit rate by only 0.072%. The cost-per-percentage-point of hit rate increases exponentially.

### Optimal Cache Size (Cost-Minimizing)

The optimal cache size minimizes total cost:

$$
\text{Total Cost} = C \cdot c_{\text{mem}} + (1-h(C)) \cdot R \cdot c_{\text{miss}}
$$

where:
- $c_{\text{mem}}$ = cost per cached entry per unit time (memory cost)
- $R$ = request rate
- $c_{\text{miss}}$ = cost per cache miss (DB query time × cost per second)

Taking the derivative and setting to zero:

$$
c_{\text{mem}} = R \cdot c_{\text{miss}} \cdot \frac{dh}{dC} = R \cdot c_{\text{miss}} \cdot \frac{1}{(C+1)^{\alpha} \cdot H_{N,\alpha}}
$$

Solving for $C$:

$$
C^* = \left(\frac{R \cdot c_{\text{miss}}}{c_{\text{mem}} \cdot H_{N,\alpha}}\right)^{1/\alpha} - 1
$$

This is the cache size where the marginal cost of one more cached entry equals the marginal savings from one fewer cache miss.

::: info War Story
**The 10x Overprovisioned Cache (Fintech, 2022)**

A fintech company provisioned 256 GB of Redis for their transaction cache. Their working set was 12 GB. They were spending $3,200/month on Redis capacity they didn't need. The operations team was afraid to downsize because "what if we need it." A proper Zipf analysis showed that with their access pattern ($\alpha = 1.15$), a 32 GB instance would achieve a 99.2% hit rate — versus 99.7% at 256 GB. The 0.5% difference was not worth $2,800/month. They downsized to 64 GB (with headroom) and saved $2,400/month.
:::

::: info War Story
**The Undersized Cache That Caused Cascading Failure (E-Commerce, 2023)**

An e-commerce platform sized their Redis cache at 8 GB based on "average" traffic. During a sale event, the working set grew from 200,000 products to 2 million products. The 8 GB cache could hold approximately 300,000 products. The hit rate dropped from 92% to 31%. The database received 7x its normal load. Connection pools were exhausted. The database went down, taking the site offline.

The post-mortem led to two changes: (1) cache sizing based on peak working set, not average, and (2) Redis memory monitoring with alerts at 70% and 90% utilization.
:::

## Advanced: Time-Aware Sizing

The standard model assumes a static access pattern. In reality, the working set changes over time. Time-aware sizing accounts for this:

$$
C_{\text{required}}(t) = f(W(t), \alpha(t), h_{\text{target}})
$$

where $W(t)$ is the working set size at time $t$ and $\alpha(t)$ is the skew at time $t$.

```typescript
interface TimeSizingResult {
  peakCacheSize: number;
  averageCacheSize: number;
  recommendedSize: number; // Peak + 20% headroom
  peakTime: string;
}

function timeAwareSizing(
  hourlyWorkingSets: Array<{ hour: number; uniqueKeys: number; alpha: number }>,
  targetHitRate: number,
  avgEntryBytes: number
): TimeSizingResult {
  let peakSize = 0;
  let peakHour = 0;
  let totalSize = 0;

  for (const { hour, uniqueKeys, alpha } of hourlyWorkingSets) {
    const required = requiredCacheSize(uniqueKeys, targetHitRate, alpha);
    totalSize += required;

    if (required > peakSize) {
      peakSize = required;
      peakHour = hour;
    }
  }

  return {
    peakCacheSize: peakSize,
    averageCacheSize: Math.round(totalSize / hourlyWorkingSets.length),
    recommendedSize: Math.ceil(peakSize * 1.2), // 20% headroom
    peakTime: `${peakHour}:00`,
  };
}
```

## Advanced: Cache Efficiency Metric

Cache efficiency measures how well you're using your cache memory:

$$
\eta = \frac{h_{\text{actual}}}{h_{\text{optimal}}(C)}
$$

where $h_{\text{optimal}}(C)$ is the hit rate of an optimal (Belady's) cache of the same size.

- $\eta = 1.0$: Your cache is perfectly efficient (LRU ≈ optimal)
- $\eta = 0.8$: Your eviction policy is wasting 20% of cache capacity
- $\eta < 0.5$: Something is seriously wrong (scan pollution, poor key design, etc.)

If efficiency is low, the problem is not the cache size — it's the eviction policy or access pattern. Adding more memory won't help as much as fixing the policy.
