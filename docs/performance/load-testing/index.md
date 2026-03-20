---
title: "Load Testing Deep Dive"
description: "Comprehensive guide to load testing — test types, tool comparison (k6, Gatling, Locust, Artillery), scenario design, ramp-up patterns, and capacity planning"
tags: [load-testing, performance, k6, gatling, capacity-planning]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# Load Testing Deep Dive

Load testing is the practice of simulating real-world traffic against your system to find performance bottlenecks before your users do. Most teams skip it until production breaks. The teams that do it often do it wrong — running a single endpoint with constant load and calling it a day.

This page covers the different types of performance tests, when to use each one, how to design realistic test scenarios, and how to interpret results for capacity planning.

**Related**: [Node.js Profiling](/performance/profiling/nodejs-profiling) | [Database Tuning](/performance/database-tuning/) | [Caching Strategies](/performance/caching-strategies/)

---

## Types of Performance Tests

| Type | Goal | Duration | Load Profile |
|------|------|----------|-------------|
| **Load Test** | Validate behavior at expected load | 15-60 min | Ramp up to target, hold steady |
| **Stress Test** | Find the breaking point | 15-30 min | Ramp up until failure |
| **Soak Test** | Find memory leaks, resource exhaustion | 2-8 hours | Constant moderate load |
| **Spike Test** | Test sudden traffic bursts | 5-15 min | Sudden jump, then drop |
| **Breakpoint Test** | Find maximum capacity | Variable | Increment load stepwise |
| **Scalability Test** | Validate auto-scaling behavior | 30-60 min | Ramp beyond single-instance capacity |

### Load Profiles Visualized

```
Load Test:          Stress Test:         Spike Test:
   ___________         /                    |
  /           \       /                     |___
 /             \     /                     /    \
/               \   /                     /      \___
                                         /

Soak Test:          Breakpoint Test:
   ____________        ____
  /            |      /    \____
 /             |     /    /     \____
/              |    /    /      /    \
               |
```

---

## Tool Comparison

### Overview

| Feature | k6 | Gatling | Locust | Artillery |
|---------|------|---------|--------|-----------|
| Language | JavaScript | Scala/Java | Python | YAML/JS |
| Protocol | HTTP, WS, gRPC | HTTP, WS, JMS | HTTP, custom | HTTP, WS, Socket.io |
| Scripting | Full JS (ES6) | Scala DSL | Python classes | YAML config + JS |
| Resource usage | Very low (Go) | Medium (JVM) | High (Python) | Medium (Node.js) |
| Distributed | k6 Cloud, k6-operator | Built-in | Built-in | Artillery Cloud |
| CI/CD integration | Excellent | Good | Good | Excellent |
| Real browser | k6 browser | No | No | No |
| Open source | Yes (AGPL) | Yes (Apache) | Yes (MIT) | Yes (MPL) |
| Best for | Dev teams, CI | Enterprise Java | Python teams | Quick API tests |

### k6 Example

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 VUs
    { duration: '5m', target: 100 },   // Hold at 100
    { duration: '2m', target: 200 },   // Ramp to 200
    { duration: '5m', target: 200 },   // Hold at 200
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95th percentile < 500ms
    http_req_failed: ['rate<0.01'],     // Error rate < 1%
    checks: ['rate>0.99'],              // 99% of checks pass
  },
};

export default function () {
  // Simulate real user flow
  const loginRes = http.post('https://api.example.com/login', JSON.stringify({
    username: 'testuser',
    password: 'testpass',
  }), { headers: { 'Content-Type': 'application/json' } });

  check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'has token': (r) => r.json('token') !== undefined,
  });

  const token = loginRes.json('token');

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Browse products
  const productsRes = http.get('https://api.example.com/products', { headers });
  check(productsRes, {
    'products status 200': (r) => r.status === 200,
    'has products': (r) => r.json('items').length > 0,
  });

  sleep(Math.random() * 3 + 1);  // Think time: 1-4 seconds

  // View a product
  const productId = productsRes.json('items.0.id');
  http.get(`https://api.example.com/products/${productId}`, { headers });

  sleep(Math.random() * 2 + 1);
}
```

### Gatling Example

```scala
class ApiSimulation extends Simulation {

  val httpProtocol = http
    .baseUrl("https://api.example.com")
    .acceptHeader("application/json")

  val searchScenario = scenario("Search Flow")
    .exec(
      http("Login")
        .post("/login")
        .body(StringBody("""{"username":"test","password":"test"}"""))
        .check(jsonPath("$.token").saveAs("token"))
    )
    .pause(1, 3)
    .exec(
      http("Search Products")
        .get("/products?q=laptop")
        .header("Authorization", "Bearer #{token}")
        .check(jsonPath("$.items[0].id").saveAs("productId"))
    )
    .pause(1, 2)
    .exec(
      http("View Product")
        .get("/products/#{productId}")
        .header("Authorization", "Bearer #{token}")
        .check(status.is(200))
    )

  setUp(
    searchScenario.inject(
      rampUsers(100).during(2.minutes),
      constantUsersPerSec(50).during(5.minutes),
      rampUsersPerSec(50).to(100).during(3.minutes)
    )
  ).protocols(httpProtocol)
   .assertions(
     global.responseTime.percentile(95).lt(500),
     global.successfulRequests.percent.gt(99)
   )
}
```

### Locust Example

```python
from locust import HttpUser, task, between

class ApiUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        """Login on start"""
        response = self.client.post("/login", json={
            "username": "testuser",
            "password": "testpass"
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def browse_products(self):
        self.client.get("/products", headers=self.headers)

    @task(2)
    def search_products(self):
        self.client.get("/products?q=laptop", headers=self.headers)

    @task(1)
    def view_product(self):
        product_id = "prod-123"
        self.client.get(f"/products/{product_id}", headers=self.headers)
```

### Artillery Example

```yaml
config:
  target: "https://api.example.com"
  phases:
    - duration: 120
      arrivalRate: 10
      name: "Warm up"
    - duration: 300
      arrivalRate: 50
      name: "Sustained load"
    - duration: 120
      arrivalRate: 100
      name: "Peak load"
  defaults:
    headers:
      Content-Type: "application/json"
  ensure:
    p95: 500
    maxErrorRate: 1

scenarios:
  - name: "Browse and purchase"
    flow:
      - post:
          url: "/login"
          json:
            username: "testuser"
            password: "testpass"
          capture:
            json: "$.token"
            as: "token"
      - get:
          url: "/products"
          headers:
            Authorization: "Bearer {​{ token }}"
      - think: 2
      - get:
          url: "/products/prod-123"
          headers:
            Authorization: "Bearer {​{ token }}"
```

---

## Test Design Principles

### 1. Model Real User Behavior

| Element | Bad Test | Good Test |
|---------|----------|-----------|
| Think time | No pauses between requests | Random pauses (1-5s) matching real usage |
| User flow | Hit one endpoint repeatedly | Complete user journeys (login, browse, buy) |
| Data | Same request every time | Parameterized data, varied payloads |
| Ramp-up | Full load immediately | Gradual ramp matching real traffic patterns |

### 2. Ramp-Up Patterns

```javascript
// k6 ramp-up patterns

// Linear ramp
export const options = {
  stages: [
    { duration: '5m', target: 500 },   // Ramp to 500 over 5 minutes
    { duration: '10m', target: 500 },   // Hold for 10 minutes
    { duration: '5m', target: 0 },      // Ramp down
  ],
};

// Step ramp (find breakpoint)
export const options = {
  stages: [
    { duration: '3m', target: 100 },
    { duration: '3m', target: 100 },  // Hold, observe
    { duration: '3m', target: 200 },
    { duration: '3m', target: 200 },  // Hold, observe
    { duration: '3m', target: 300 },
    { duration: '3m', target: 300 },  // Hold, observe
    { duration: '3m', target: 400 },
    { duration: '3m', target: 400 },  // Hold, observe — when does it break?
  ],
};
```

### 3. Define Pass/Fail Thresholds

Set thresholds based on your SLOs (Service Level Objectives):

```javascript
export const options = {
  thresholds: {
    // Response time
    'http_req_duration': ['p(50)<200', 'p(95)<500', 'p(99)<1000'],

    // Error rate
    'http_req_failed': ['rate<0.01'],

    // Throughput
    'http_reqs': ['rate>100'],

    // Per-endpoint thresholds
    'http_req_duration{name:login}': ['p(95)<300'],
    'http_req_duration{name:search}': ['p(95)<800'],

    // Custom metrics
    'checks': ['rate>0.99'],
  },
};
```

::: tip
Use percentiles (p95, p99), not averages. An average of 200ms can hide the fact that 5% of your users experience 5-second response times. The 95th percentile tells the truth.
:::

---

## Interpreting Results

### Key Metrics

| Metric | What It Tells You |
|--------|-------------------|
| **p50 (median)** | Typical user experience |
| **p95** | Worst case for most users |
| **p99** | Tail latency (affects power users, API consumers) |
| **Error rate** | System reliability under load |
| **Throughput (RPS)** | How many requests per second the system handles |
| **Active VUs** | How many virtual users are active |
| **Iteration duration** | How long a complete user journey takes |

### Red Flags

| Symptom | Likely Cause |
|---------|-------------|
| Latency increases linearly with load | Resource contention (CPU, connections) |
| Latency spikes at specific VU count | Hitting a pool limit (DB connections, threads) |
| Error rate climbs while latency stays low | Rate limiting or circuit breaker |
| Everything degrades at once | Memory exhaustion, GC pressure |
| Latency is fine but throughput plateaus | Bottleneck (single thread, lock contention) |
| Increasing latency during soak test | Memory leak, connection leak |

---

## Capacity Planning from Results

### The Process

1. **Baseline test**: Find throughput at acceptable latency (e.g., 500 RPS at p95 < 200ms)
2. **Per-instance capacity**: Divide by number of instances (e.g., 500 RPS / 4 instances = 125 RPS per instance)
3. **Peak traffic estimate**: Analyze production traffic patterns, find peak (e.g., 800 RPS)
4. **Headroom factor**: Multiply by 1.5-2x for safety (e.g., 1200-1600 RPS capacity needed)
5. **Instance count**: Divide required capacity by per-instance throughput (1600 / 125 = 13 instances)

```
Required instances = (Peak RPS * Safety Factor) / RPS per Instance
                   = (800 * 2) / 125
                   = 12.8 → 13 instances
```

### Scaling Limits

::: warning
Linear scaling is a myth. Amdahl's Law says that the speedup from parallelism is limited by the serial portion of your workload. A shared database, a global lock, or a single-threaded component will eventually cap your throughput regardless of how many instances you add.
:::

---

## CI/CD Integration

### k6 in GitHub Actions

```yaml
name: Load Test
on:
  pull_request:
    branches: [main]

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/k6-action@v0.3.1
        with:
          filename: tests/load/api-test.js
          flags: --out json=results.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: k6-results
          path: results.json
```

### Shift-Left Testing

| Environment | Test Type | Frequency | Duration |
|-------------|-----------|-----------|----------|
| PR/CI | Smoke test (10 VUs, 1 min) | Every PR | 1-2 min |
| Staging | Load test (target load) | Daily/weekly | 15-30 min |
| Pre-prod | Full load + stress | Before release | 1-2 hours |
| Production | Soak test (shadow traffic) | Monthly | 4-8 hours |

::: tip
Start with smoke tests in CI — they catch regressions without slowing down development. Graduate to full load tests on staging for release validation.
:::

---

## Common Mistakes

| Mistake | Why It's Wrong |
|---------|----------------|
| Testing from the same machine as the server | Network is not the bottleneck, you are measuring localhost |
| No think time between requests | Real users pause; without it you test 10x the actual load |
| Testing a single endpoint | Real traffic hits many endpoints with different costs |
| Using average latency | Averages hide tail latency problems |
| Not warming up the system | Cold JVMs, empty caches, cold DB connections skew results |
| Running from a single region | Does not reveal geographic latency issues |
| Ignoring client-side bottlenecks | Your load generator might be the bottleneck, not the server |

---

*Last updated: 2026-03-20*
