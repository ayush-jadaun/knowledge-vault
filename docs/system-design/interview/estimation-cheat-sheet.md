---
title: "Estimation Cheat Sheet"
description: "One-page reference for system design estimation — powers of 2, Jeff Dean's latency numbers updated for 2026, storage calculations, QPS from DAU formulas, bandwidth formulas, and server capacity rules of thumb"
tags: [system-design, estimation, cheat-sheet, reference, interview-prep]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-25"
---

# Estimation Cheat Sheet

Back-of-envelope estimation is the skill of quickly calculating approximate system requirements. You do not need exact numbers — you need to know whether your system needs 1 server or 1,000, 1 GB or 1 PB of storage, 100 QPS or 100,000 QPS. This page is your one-page reference for interview estimation.

## Powers of 2

Memorize these. They are the building blocks of every calculation.

| Power | Exact Value | Approx | Name |
|-------|------------|--------|------|
| 2^10 | 1,024 | 1 Thousand | 1 KB |
| 2^20 | 1,048,576 | 1 Million | 1 MB |
| 2^30 | 1,073,741,824 | 1 Billion | 1 GB |
| 2^40 | 1,099,511,627,776 | 1 Trillion | 1 TB |
| 2^50 | — | 1 Quadrillion | 1 PB |

**Quick conversions:**
- 1 KB = 1,000 bytes (use 10^3 for estimation)
- 1 MB = 10^6 bytes
- 1 GB = 10^9 bytes
- 1 TB = 10^12 bytes
- 1 PB = 10^15 bytes

## Latency Numbers (2026 Updated)

These are approximate latencies for common operations. Originally from Jeff Dean, updated for modern hardware.

| Operation | Latency | Notes |
|-----------|---------|-------|
| L1 cache reference | 0.5 ns | On-CPU cache |
| Branch mispredict | 3 ns | CPU pipeline |
| L2 cache reference | 3 ns | On-CPU cache |
| Mutex lock/unlock | 17 ns | Thread synchronization |
| L3 cache reference | 12 ns | Shared CPU cache |
| Main memory reference | 50-100 ns | DRAM access |
| Compress 1 KB (Snappy) | 2 us | Fast compression |
| Send 1 KB over 1 Gbps network | 10 us | Network bandwidth |
| Read 1 MB from memory | 50 us | Sequential |
| NVMe SSD random read | 10-20 us | Modern NVMe |
| NVMe SSD read 1 MB | 50-100 us | Sequential |
| Round trip within datacenter | 0.5 ms | Same region |
| Redis GET (in datacenter) | 0.3-1 ms | In-memory key-value |
| Read 1 MB from SSD | 0.2 ms | SATA SSD |
| Read 1 MB from HDD | 2-5 ms | Spinning disk |
| Database simple query | 1-5 ms | Indexed lookup |
| Send packet CA -> Netherlands -> CA | 75 ms | Speed of light + routing |
| Send packet CA -> Australia -> CA | 150 ms | Pacific Ocean RTT |
| TLS handshake | 50-100 ms | Key exchange + verification |
| DNS resolution (uncached) | 20-120 ms | Network lookup |
| HTTP request to external API | 50-500 ms | Varies by distance + processing |

### Latency Comparison (Visual)

```
L1 cache:          |
L2 cache:          |
Main memory:       |
NVMe SSD random:   |||
Redis GET:         |||||||
SSD sequential 1MB:||||||||||||
Database query:    ||||||||||||||||||||
Same-DC round trip:||||||||||||||||||||
HDD sequential 1MB:||||||||||||||||||||||||||||||||||||||||
Cross-country RT:  ||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||
```

**Key insight:** Memory is ~100x faster than SSD. SSD is ~10x faster than HDD. Datacenter network is ~100x faster than cross-country. These ratios drive caching and data placement decisions.

## Time Conversions

| Period | Seconds | For Estimation |
|--------|---------|---------------|
| 1 second | 1 | 1 |
| 1 minute | 60 | ~10^2 |
| 1 hour | 3,600 | ~4 x 10^3 |
| 1 day | 86,400 | ~10^5 |
| 1 month | 2,592,000 | ~2.5 x 10^6 |
| 1 year | 31,536,000 | ~3 x 10^7 |

**Shortcut:** 1 day ~= 100,000 seconds. For interviews, just use 10^5.

## QPS from DAU Formula

```
QPS = DAU × (actions per user per day) / seconds per day

Peak QPS = QPS × peak multiplier (typically 2-5x)
```

```python
def estimate_qps(
    dau: int,
    actions_per_user_per_day: float,
    peak_multiplier: float = 3.0
) -> dict:
    """Estimate queries per second from DAU."""
    seconds_per_day = 86400
    avg_qps = dau * actions_per_user_per_day / seconds_per_day
    peak_qps = avg_qps * peak_multiplier

    return {
        "avg_qps": round(avg_qps),
        "peak_qps": round(peak_qps),
    }


# Examples:
# Social media: 200M DAU, 10 feed views/day
print(estimate_qps(200_000_000, 10))
# {'avg_qps': 23148, 'peak_qps': 69444}

# E-commerce: 50M DAU, 5 page views/day
print(estimate_qps(50_000_000, 5))
# {'avg_qps': 2894, 'peak_qps': 8681}

# Messaging: 100M DAU, 50 messages/day
print(estimate_qps(100_000_000, 50))
# {'avg_qps': 57870, 'peak_qps': 173611}
```

## Storage Estimation Formula

```
Daily storage = Daily new records × Record size
Yearly storage = Daily storage × 365
N-year storage = Yearly storage × N × (1 + replication factor)
```

### Common Record Sizes

| Data Type | Typical Size | Notes |
|-----------|-------------|-------|
| Short text (tweet) | 200-500 bytes | Text + metadata |
| Chat message | 100-500 bytes | Text + metadata |
| User profile | 1-5 KB | Name, email, settings |
| JSON API response | 1-10 KB | Varies by payload |
| Product listing | 2-10 KB | Text + metadata |
| Thumbnail image | 10-50 KB | Compressed JPEG/WebP |
| Profile photo | 50-200 KB | Compressed |
| Standard photo | 200 KB - 2 MB | Full resolution |
| Short video (1 min) | 5-20 MB | Compressed |
| Long video (1 hour) | 500 MB - 2 GB | Multiple resolutions |
| Log entry | 200-500 bytes | Structured JSON |

### Storage Calculation Example

```python
def estimate_storage(
    daily_records: int,
    record_size_bytes: int,
    retention_years: int = 5,
    replication_factor: int = 3
) -> dict:
    """Estimate total storage requirements."""
    daily_gb = daily_records * record_size_bytes / 1e9
    yearly_tb = daily_gb * 365 / 1000
    total_tb = yearly_tb * retention_years
    with_replication_tb = total_tb * replication_factor

    return {
        "daily": f"{daily_gb:.1f} GB",
        "yearly": f"{yearly_tb:.1f} TB",
        "5_year": f"{total_tb:.1f} TB",
        "with_replication": f"{with_replication_tb:.1f} TB",
    }

# Example: 100M tweets/day, 300 bytes each, 5 years, 3 replicas
print(estimate_storage(100_000_000, 300, 5, 3))
# {'daily': '30.0 GB', 'yearly': '10.9 TB', '5_year': '54.8 TB', 'with_replication': '164.3 TB'}

# Example: 1B chat messages/day, 200 bytes each
print(estimate_storage(1_000_000_000, 200, 5, 3))
# {'daily': '200.0 GB', 'yearly': '73.0 TB', '5_year': '365.0 TB', 'with_replication': '1095.0 TB'}
```

## Bandwidth Estimation Formula

```
Bandwidth = QPS × Response size

Incoming (ingress) = Write QPS × Request size
Outgoing (egress) = Read QPS × Response size
```

```python
def estimate_bandwidth(
    read_qps: int,
    write_qps: int,
    avg_read_response_kb: float,
    avg_write_request_kb: float
) -> dict:
    """Estimate bandwidth requirements."""
    ingress_mbps = write_qps * avg_write_request_kb * 8 / 1000
    egress_mbps = read_qps * avg_read_response_kb * 8 / 1000

    return {
        "ingress": f"{ingress_mbps:.0f} Mbps ({ingress_mbps / 1000:.1f} Gbps)",
        "egress": f"{egress_mbps:.0f} Mbps ({egress_mbps / 1000:.1f} Gbps)",
    }

# Example: Twitter-scale
print(estimate_bandwidth(
    read_qps=70_000,       # Peak timeline reads
    write_qps=1_200,       # Tweet writes
    avg_read_response_kb=50,  # Timeline response
    avg_write_request_kb=1    # Tweet creation
))
# {'ingress': '10 Mbps (0.0 Gbps)', 'egress': '28000 Mbps (28.0 Gbps)'}
```

## Server Capacity Rules of Thumb

### Single Server Capabilities (2026)

| Resource | Modern Cloud Server | Notes |
|----------|-------------------|-------|
| CPU cores | 64-128 | c7i.metal (AWS) |
| RAM | 256-512 GB | r7i.16xlarge |
| SSD storage | 30 TB NVMe | i4i.metal |
| Network | 25-100 Gbps | Depends on instance |

### Application Server Throughput

| Workload Type | QPS per Server | Notes |
|--------------|---------------|-------|
| Static file serving (Nginx) | 50,000-100,000 | CPU-bound |
| REST API (simple CRUD) | 5,000-20,000 | Depends on framework |
| REST API (with DB queries) | 1,000-5,000 | DB is usually the bottleneck |
| GraphQL (complex queries) | 500-2,000 | Resolver overhead |
| WebSocket connections | 50,000-200,000 | Per server (memory-bound) |

### Database Throughput

| Database | Read QPS | Write QPS | Notes |
|----------|----------|-----------|-------|
| PostgreSQL (single) | 10,000-30,000 | 5,000-15,000 | Indexed queries |
| MySQL (single) | 10,000-30,000 | 5,000-15,000 | Similar to PostgreSQL |
| Redis (single node) | 100,000-200,000 | 100,000-200,000 | In-memory |
| Cassandra (per node) | 10,000-30,000 | 10,000-30,000 | Linear scaling |
| DynamoDB (on-demand) | Unlimited* | Unlimited* | Per partition: 3K read, 1K write |
| Elasticsearch (per node) | 1,000-5,000 | 500-2,000 | Depends on query complexity |
| MongoDB (single) | 10,000-30,000 | 5,000-15,000 | WiredTiger engine |

### Number of Servers Formula

```
Servers needed = Peak QPS / QPS per server × safety margin

Safety margin = 1.3 to 1.5 (30-50% headroom)
```

```python
def estimate_servers(
    peak_qps: int,
    qps_per_server: int,
    safety_margin: float = 1.3,
    min_servers: int = 3  # For availability
) -> int:
    """Estimate number of servers needed."""
    raw = peak_qps / qps_per_server * safety_margin
    return max(min_servers, int(raw) + 1)

# Example: 70K peak QPS, 5K QPS per app server
print(estimate_servers(70_000, 5_000))  # 19 servers
```

## Quick Reference Card

Use this during interviews:

```
╔═══════════════════════════════════════════════════════════╗
║  ESTIMATION QUICK REFERENCE                               ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  1 day = ~100K seconds  (86,400 ≈ 10^5)                  ║
║  1 year = ~30M seconds  (31.5M ≈ 3×10^7)                 ║
║                                                           ║
║  QPS = DAU × actions/day / 100,000                        ║
║  Peak = QPS × 3                                           ║
║                                                           ║
║  Storage/day = records/day × record_size                  ║
║  Storage/year = storage/day × 365                         ║
║                                                           ║
║  Bandwidth = QPS × response_size                          ║
║                                                           ║
║  Servers = peak_QPS / QPS_per_server × 1.3                ║
║                                                           ║
║  Redis: ~100K ops/sec     PostgreSQL: ~10K reads/sec      ║
║  App server: ~5K QPS      CDN: unlimited ($$)             ║
║                                                           ║
║  Char = 1B   Int = 4B   Long = 8B   UUID = 16B           ║
║  Tweet ~300B  Image ~200KB  Video ~10MB/min               ║
║                                                           ║
║  L1: 0.5ns  RAM: 100ns  SSD: 20μs  HDD: 5ms             ║
║  Same-DC: 0.5ms  Cross-country: 75ms                     ║
╚═══════════════════════════════════════════════════════════╝
```

## Common Interview Estimation Scenarios

| Scenario | Key Numbers |
|----------|-------------|
| Twitter-scale | 200M DAU, 100M tweets/day, 2B timeline reads/day, ~30 GB/day text |
| Instagram-scale | 500M DAU, 50M photos/day, ~100 TB/day media, 10B feed views/day |
| WhatsApp-scale | 2B users, 100B messages/day, ~20 TB/day text, 50K QPS peak |
| YouTube-scale | 2B MAU, 500 hours uploaded/min, 1B hours watched/day |
| Uber-scale | 100M riders, 5M drivers, 20M trips/day, 50K location updates/sec |

## Estimation Practice

```python
# Practice: Design a URL shortener
dau = 100_000_000  # 100M
urls_created_per_day = dau * 0.1  # 10% create short URLs = 10M
redirects_per_day = dau * 5  # avg 5 redirects per user = 500M

write_qps = urls_created_per_day / 86400  # ~116 writes/sec
read_qps = redirects_per_day / 86400     # ~5,787 reads/sec
# Read-heavy: 50:1 ratio

url_record_size = 200  # bytes (short URL + long URL + metadata)
daily_storage = urls_created_per_day * url_record_size  # 2 GB/day
yearly_storage = daily_storage * 365 / 1e12  # 0.73 TB/year
five_year_storage = yearly_storage * 5  # 3.65 TB — fits on one machine

# Conclusion: Simple system. One PostgreSQL with read replicas handles this.
# Redis cache for hot URLs. ~2 app servers behind a load balancer.
```

## Cross-References

- [System Design Interview Framework](/system-design/interview/framework) — use estimation in Phase 2
- [Discussing Tradeoffs](/system-design/interview/discussing-tradeoffs) — estimation informs tradeoffs
- [Common Mistakes](/system-design/interview/common-mistakes) — estimation mistakes to avoid
- [Practice Questions: Easy](/system-design/interview/practice-easy) — practice estimation on easy problems
- [Scalability Patterns](/system-design/patterns/scalability-patterns) — what to do with your estimates

---

*Estimation is a communication tool, not a math exercise. The interviewer does not care if your answer is 23,148 QPS or "roughly 25K QPS." They care that you can derive reasonable numbers and use them to justify architecture decisions. Round aggressively, explain your assumptions, and always connect estimates to design choices.*
