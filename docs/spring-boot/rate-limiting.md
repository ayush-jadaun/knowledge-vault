---
title: "Rate Limiting"
description: "Complete guide to rate limiting in Spring Boot — Bucket4j token bucket implementation, Spring Cloud Gateway rate limiter, Redis-based distributed rate limiting, per-user and per-endpoint strategies, custom annotations, and production monitoring"
tags: [spring-boot, rate-limiting, bucket4j, redis, api-security]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Rate Limiting

Rate limiting controls how many requests a client can make in a given time window. Without it, a single client — whether malicious, buggy, or simply enthusiastic — can monopolize your API, degrade performance for everyone, and run up your infrastructure costs. Rate limiting is not optional for any production API.

The core algorithms are simple, but the implementation decisions matter: per-user or per-IP? In-memory or distributed? Hard reject or graceful degradation? Fixed window or sliding window? Spring Boot does not include built-in rate limiting, but Bucket4j, Spring Cloud Gateway, and Redis-based solutions integrate cleanly.

## Rate Limiting Algorithms

### Token Bucket

The most common algorithm. A bucket holds tokens. Each request consumes a token. Tokens are refilled at a fixed rate. When the bucket is empty, requests are rejected.

```
Token Bucket (capacity=10, refill=2/second):

Time 0:  [T T T T T T T T T T]  10 tokens, full
         Client sends 3 requests
Time 0:  [T T T T T T T _ _ _]  7 tokens

Time 1s: [T T T T T T T T T _]  9 tokens (2 refilled)
         Client sends 5 requests
Time 1s: [T T T T _ _ _ _ _ _]  4 tokens

Time 2s: [T T T T T T _ _ _ _]  6 tokens (2 refilled)
         Client sends 8 requests
         6 accepted, 2 rejected (429 Too Many Requests)
Time 2s: [_ _ _ _ _ _ _ _ _ _]  0 tokens
```

**Advantages:** Allows bursts up to bucket capacity. Smooth refill rate. Simple to implement.

### Sliding Window Log

Track exact timestamps of each request. Count requests in the sliding window:

```
Window size: 1 minute, limit: 100

Timestamps: [10:00:01, 10:00:05, 10:00:12, ..., 10:00:58]
New request at 10:01:03:
  - Remove timestamps before 10:00:03
  - Count remaining + 1
  - If count > 100, reject
```

**Advantages:** Precise. No boundary effects.
**Disadvantages:** Memory-intensive (stores every timestamp).

### Fixed Window Counter

Simple counter per time window:

```
Window: 10:00 - 10:01 → counter = 47
Window: 10:01 - 10:02 → counter = 0 (reset)
```

**Disadvantage:** Boundary problem — 100 requests at 10:00:59 + 100 at 10:01:00 = 200 in 2 seconds.

### Sliding Window Counter

Weighted combination of current and previous window to approximate a sliding window:

```
Previous window (10:00-10:01): 84 requests
Current window (10:01-10:02):  36 requests
Current position: 10:01:15 (25% into current window)

Estimated rate = 84 * 0.75 + 36 = 99 requests
(75% of previous window still counts)
```

## Bucket4j: In-Memory Rate Limiting

### Dependencies

```xml
<dependency>
    <groupId>com.bucket4j</groupId>
    <artifactId>bucket4j-core</artifactId>
    <version>8.10.1</version>
</dependency>
```

### Basic Implementation

```java
@Component
public class RateLimiterService {

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public Bucket resolveBucket(String key) {
        return buckets.computeIfAbsent(key, this::createBucket);
    }

    private Bucket createBucket(String key) {
        return Bucket.builder()
                .addLimit(BandwidthBuilder.builder()
                        .capacity(100)                    // Max 100 tokens
                        .refillGreedy(100, Duration.ofMinutes(1))  // Refill 100/min
                        .build())
                .addLimit(BandwidthBuilder.builder()
                        .capacity(20)                     // Burst limit
                        .refillGreedy(20, Duration.ofSeconds(10))  // 20 per 10s
                        .build())
                .build();
    }

    public boolean tryConsume(String key) {
        return resolveBucket(key).tryConsume(1);
    }

    public ConsumptionProbe tryConsumeWithProbe(String key) {
        return resolveBucket(key).tryConsumeAndReturnRemaining(1);
    }
}
```

### Rate Limiting Filter

```java
@Component
@Order(1)
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimiterService rateLimiterService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain)
            throws ServletException, IOException {

        String key = resolveKey(request);
        ConsumptionProbe probe = rateLimiterService.tryConsumeWithProbe(key);

        // Set standard rate limit headers
        response.setHeader("X-RateLimit-Limit", "100");
        response.setHeader("X-RateLimit-Remaining",
                String.valueOf(probe.getRemainingTokens()));

        if (probe.isConsumed()) {
            filterChain.doFilter(request, response);
        } else {
            long waitSeconds = probe.getNanosToWaitForRefill() / 1_000_000_000;
            response.setHeader("Retry-After", String.valueOf(waitSeconds));
            response.setHeader("X-RateLimit-Reset",
                    String.valueOf(Instant.now().plusSeconds(waitSeconds).getEpochSecond()));
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("""
                    {"error": "rate_limit_exceeded", "message": "Too many requests. Retry after %d seconds."}
                    """.formatted(waitSeconds));
        }
    }

    private String resolveKey(HttpServletRequest request) {
        // Prefer authenticated user ID, fallback to IP
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated()
                && !"anonymousUser".equals(auth.getPrincipal())) {
            return "user:" + auth.getName();
        }
        return "ip:" + getClientIp(request);
    }

    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isEmpty()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getRequestURI().startsWith("/actuator");
    }
}
```

## Per-Endpoint Rate Limiting with Custom Annotation

### The Annotation

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {
    int capacity() default 100;
    int refillTokens() default 100;
    int refillSeconds() default 60;
    String keyExpression() default "";  // SpEL expression for custom key
}
```

### The Interceptor

```java
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {

        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return true;
        }

        RateLimit rateLimit = handlerMethod.getMethodAnnotation(RateLimit.class);
        if (rateLimit == null) {
            return true;
        }

        String key = buildKey(request, handlerMethod, rateLimit);
        Bucket bucket = buckets.computeIfAbsent(key, k -> createBucket(rateLimit));

        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);

        response.setHeader("X-RateLimit-Limit", String.valueOf(rateLimit.capacity()));
        response.setHeader("X-RateLimit-Remaining",
                String.valueOf(probe.getRemainingTokens()));

        if (!probe.isConsumed()) {
            long retryAfter = probe.getNanosToWaitForRefill() / 1_000_000_000;
            response.setHeader("Retry-After", String.valueOf(retryAfter));
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(
                    "{\"error\":\"rate_limit_exceeded\",\"retry_after\":" + retryAfter + "}");
            return false;
        }

        return true;
    }

    private Bucket createBucket(RateLimit rateLimit) {
        return Bucket.builder()
                .addLimit(BandwidthBuilder.builder()
                        .capacity(rateLimit.capacity())
                        .refillGreedy(rateLimit.refillTokens(),
                                Duration.ofSeconds(rateLimit.refillSeconds()))
                        .build())
                .build();
    }

    private String buildKey(HttpServletRequest request,
                            HandlerMethod method,
                            RateLimit rateLimit) {
        String userKey = resolveUserKey(request);
        String methodKey = method.getMethod().getDeclaringClass().getSimpleName()
                + "." + method.getMethod().getName();
        return methodKey + ":" + userKey;
    }

    private String resolveUserKey(HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated()) {
            return auth.getName();
        }
        return request.getRemoteAddr();
    }
}
```

### Usage

```java
@RestController
@RequestMapping("/api")
public class ApiController {

    @GetMapping("/data")
    @RateLimit(capacity = 100, refillTokens = 100, refillSeconds = 60)
    public ResponseEntity<List<Data>> getData() {
        return ResponseEntity.ok(dataService.findAll());
    }

    // Stricter limit for expensive operations
    @PostMapping("/reports/generate")
    @RateLimit(capacity = 5, refillTokens = 5, refillSeconds = 3600)
    public ResponseEntity<Report> generateReport(@RequestBody ReportRequest request) {
        return ResponseEntity.ok(reportService.generate(request));
    }

    // Very strict limit for authentication attempts
    @PostMapping("/auth/login")
    @RateLimit(capacity = 10, refillTokens = 10, refillSeconds = 900)
    public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }
}
```

## Distributed Rate Limiting with Redis

In-memory rate limiting breaks with multiple application instances — each instance maintains its own counters. Redis provides a shared, atomic counter:

### Dependencies

```xml
<dependency>
    <groupId>com.bucket4j</groupId>
    <artifactId>bucket4j-redis</artifactId>
    <version>8.10.1</version>
</dependency>
<dependency>
    <groupId>io.lettuce</groupId>
    <artifactId>lettuce-core</artifactId>
</dependency>
```

### Redis-Backed Bucket4j

```java
@Configuration
public class RedisRateLimitConfig {

    @Bean
    public ProxyManager<String> proxyManager(RedisConnectionFactory connectionFactory) {
        LettuceBasedProxyManager<String> proxyManager = LettuceBasedProxyManager
                .builderFor(RedisClient.create(
                        RedisURI.builder()
                                .withHost("localhost")
                                .withPort(6379)
                                .build()))
                .withExpirationAfterWrite(
                        ExpirationAfterWriteStrategy.basedOnTimeForRefillingBucketUpToMax(
                                Duration.ofMinutes(5)))
                .build();
        return proxyManager;
    }
}
```

```java
@Service
public class RedisRateLimiterService {

    private final ProxyManager<String> proxyManager;

    public RedisRateLimiterService(ProxyManager<String> proxyManager) {
        this.proxyManager = proxyManager;
    }

    public ConsumptionProbe tryConsume(String key, RateLimitPlan plan) {
        BucketConfiguration config = BucketConfiguration.builder()
                .addLimit(BandwidthBuilder.builder()
                        .capacity(plan.getCapacity())
                        .refillGreedy(plan.getRefillTokens(),
                                Duration.ofSeconds(plan.getRefillSeconds()))
                        .build())
                .build();

        Bucket bucket = proxyManager.builder()
                .build(key, () -> config);

        return bucket.tryConsumeAndReturnRemaining(1);
    }
}
```

### Sliding Window Counter in Redis (Manual)

```java
@Service
public class RedisSlidingWindowRateLimiter {

    private final StringRedisTemplate redisTemplate;

    public boolean isAllowed(String key, int maxRequests, Duration window) {
        String redisKey = "ratelimit:" + key;
        long now = Instant.now().toEpochMilli();
        long windowStart = now - window.toMillis();

        // Lua script for atomic sliding window check
        String luaScript = """
            -- Remove entries outside the window
            redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
            -- Count entries in window
            local count = redis.call('ZCARD', KEYS[1])
            if count < tonumber(ARGV[2]) then
                -- Add the current request
                redis.call('ZADD', KEYS[1], ARGV[3], ARGV[3])
                -- Set expiry on the key
                redis.call('PEXPIRE', KEYS[1], ARGV[4])
                return 1
            end
            return 0
            """;

        RedisScript<Long> script = RedisScript.of(luaScript, Long.class);

        Long result = redisTemplate.execute(script,
                List.of(redisKey),
                String.valueOf(windowStart),        // ARGV[1]: window start
                String.valueOf(maxRequests),         // ARGV[2]: max requests
                String.valueOf(now),                 // ARGV[3]: current time (score + member)
                String.valueOf(window.toMillis()));  // ARGV[4]: TTL

        return result != null && result == 1;
    }
}
```

## Spring Cloud Gateway Rate Limiter

For API gateway rate limiting:

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: api-service
          uri: lb://api-service
          predicates:
            - Path=/api/**
          filters:
            - name: RequestRateLimiter
              args:
                redis-rate-limiter:
                  replenishRate: 10       # 10 requests per second
                  burstCapacity: 20       # Allow bursts up to 20
                  requestedTokens: 1      # 1 token per request
                key-resolver: "#{@userKeyResolver}"
```

```java
@Configuration
public class GatewayRateLimitConfig {

    @Bean
    public KeyResolver userKeyResolver() {
        return exchange -> {
            // Resolve by authenticated user
            return exchange.getPrincipal()
                    .map(Principal::getName)
                    .defaultIfEmpty(
                            exchange.getRequest().getRemoteAddress()
                                    .getAddress().getHostAddress());
        };
    }

    @Bean
    public KeyResolver apiKeyResolver() {
        return exchange -> {
            String apiKey = exchange.getRequest().getHeaders()
                    .getFirst("X-API-Key");
            return Mono.justOrEmpty(apiKey)
                    .switchIfEmpty(Mono.just("anonymous"));
        };
    }
}
```

## Tiered Rate Limits (API Plans)

```java
public enum ApiPlan {
    FREE(60, 60, 60),          // 60 req/min
    BASIC(600, 600, 60),       // 600 req/min
    PRO(6000, 6000, 60),       // 6000 req/min
    ENTERPRISE(60000, 60000, 60); // 60000 req/min

    private final int capacity;
    private final int refillTokens;
    private final int refillSeconds;

    ApiPlan(int capacity, int refillTokens, int refillSeconds) {
        this.capacity = capacity;
        this.refillTokens = refillTokens;
        this.refillSeconds = refillSeconds;
    }

    // getters
}

@Service
public class TieredRateLimiter {

    private final ProxyManager<String> proxyManager;
    private final ApiKeyService apiKeyService;

    public RateLimitResult checkLimit(String apiKey) {
        ApiPlan plan = apiKeyService.getPlan(apiKey);

        BucketConfiguration config = BucketConfiguration.builder()
                .addLimit(BandwidthBuilder.builder()
                        .capacity(plan.getCapacity())
                        .refillGreedy(plan.getRefillTokens(),
                                Duration.ofSeconds(plan.getRefillSeconds()))
                        .build())
                .build();

        Bucket bucket = proxyManager.builder()
                .build("plan:" + apiKey, () -> config);

        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);

        return new RateLimitResult(
                probe.isConsumed(),
                probe.getRemainingTokens(),
                plan.getCapacity(),
                plan.name(),
                probe.isConsumed() ? 0
                        : probe.getNanosToWaitForRefill() / 1_000_000_000
        );
    }
}
```

## Monitoring and Alerting

```java
@Component
public class RateLimitMetrics {

    private final MeterRegistry meterRegistry;

    public void recordRateLimitHit(String endpoint, String clientId, boolean allowed) {
        meterRegistry.counter("rate_limit.requests",
                "endpoint", endpoint,
                "result", allowed ? "allowed" : "rejected")
                .increment();

        if (!allowed) {
            meterRegistry.counter("rate_limit.rejections",
                    "endpoint", endpoint,
                    "client", clientId)
                    .increment();
        }
    }
}
```

## Response Headers Reference

| Header | Description | Example |
|--------|-------------|---------|
| `X-RateLimit-Limit` | Maximum requests in the window | `100` |
| `X-RateLimit-Remaining` | Requests remaining | `47` |
| `X-RateLimit-Reset` | Unix timestamp when limit resets | `1711382400` |
| `Retry-After` | Seconds to wait before retrying | `30` |

Rate limiting protects your API from abuse, ensures fair usage across clients, and prevents a single bad actor from affecting everyone. Start with in-memory Bucket4j for single-instance deployments, move to Redis-backed rate limiting when you scale to multiple instances, and always communicate limits clearly through response headers so clients can self-regulate.
