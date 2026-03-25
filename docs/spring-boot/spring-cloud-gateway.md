---
title: "Spring Cloud Gateway Deep Dive"
description: "Comprehensive guide to Spring Cloud Gateway — route predicates, GatewayFilter factories, global filters, rate limiting with Redis, circuit breaker integration, request/response modification, load balancing, security at the gateway, custom predicates/filters, WebSocket proxying, and performance tuning."
tags: [spring-cloud-gateway, api-gateway, routing, filters, microservices]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, spring-webflux-deep-dive, microservices-basics]
lastReviewed: "2026-03-25"
---

# Spring Cloud Gateway Deep Dive

Spring Cloud Gateway is the reactive API gateway built on Spring WebFlux and Project Reactor. It provides a non-blocking, event-driven gateway for routing requests to downstream microservices with cross-cutting concerns like rate limiting, circuit breaking, authentication, and request transformation.

## 1. Architecture Overview

```
Client Request
    │
    ▼
┌───────────────────────────────────────────────────────────┐
│                  Spring Cloud Gateway                      │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Gateway Handler Mapping                             │  │
│  │  (matches request to Route via Predicates)          │  │
│  └────────────────────┬────────────────────────────────┘  │
│                       ▼                                    │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Gateway Web Handler                                 │  │
│  │  (executes filter chain: pre → proxy → post)        │  │
│  │                                                      │  │
│  │  Global Filter 1 → Global Filter 2 → ...            │  │
│  │  Route Filter 1 → Route Filter 2 → ...              │  │
│  │  → NettyRoutingFilter (proxy to downstream)         │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
    │
    ▼
Downstream Microservice
```

### 1.1 Dependencies

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-gateway</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-circuitbreaker-reactor-resilience4j</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-redis-reactive</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-loadbalancer</artifactId>
    </dependency>
</dependencies>
```

## 2. Route Configuration

### 2.1 YAML Configuration

```yaml
spring:
  cloud:
    gateway:
      routes:
        # Simple route
        - id: order-service
          uri: http://order-service:8081
          predicates:
            - Path=/api/orders/**
          filters:
            - StripPrefix=1

        # Route with multiple predicates
        - id: user-service
          uri: lb://user-service    # load-balanced via service discovery
          predicates:
            - Path=/api/users/**
            - Method=GET,POST,PUT,DELETE
            - Header=X-Request-Source, mobile|web
          filters:
            - StripPrefix=1
            - AddRequestHeader=X-Gateway-Source, spring-cloud-gateway
            - AddResponseHeader=X-Response-Time, ${response.time}

        # Route with rate limiting
        - id: payment-service
          uri: lb://payment-service
          predicates:
            - Path=/api/payments/**
          filters:
            - StripPrefix=1
            - name: RequestRateLimiter
              args:
                redis-rate-limiter.replenishRate: 10
                redis-rate-limiter.burstCapacity: 20
                redis-rate-limiter.requestedTokens: 1
                key-resolver: "#{@userKeyResolver}"

        # Route with circuit breaker
        - id: inventory-service
          uri: lb://inventory-service
          predicates:
            - Path=/api/inventory/**
          filters:
            - StripPrefix=1
            - name: CircuitBreaker
              args:
                name: inventoryCircuitBreaker
                fallbackUri: forward:/fallback/inventory

        # Weighted routing (canary deployments)
        - id: product-service-v1
          uri: lb://product-service-v1
          predicates:
            - Path=/api/products/**
            - Weight=group1, 80
          filters:
            - StripPrefix=1

        - id: product-service-v2
          uri: lb://product-service-v2
          predicates:
            - Path=/api/products/**
            - Weight=group1, 20
          filters:
            - StripPrefix=1
```

### 2.2 Java DSL Configuration

```java
@Configuration
public class GatewayRoutesConfig {

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
                .route("order-service", r -> r
                        .path("/api/orders/**")
                        .filters(f -> f
                                .stripPrefix(1)
                                .addRequestHeader("X-Gateway", "true")
                                .retry(config -> config
                                        .setRetries(3)
                                        .setStatuses(HttpStatus.SERVICE_UNAVAILABLE)
                                        .setBackoff(Duration.ofMillis(100),
                                                Duration.ofSeconds(1), 2, true)))
                        .uri("lb://order-service"))

                .route("user-service", r -> r
                        .path("/api/users/**")
                        .and()
                        .method(HttpMethod.GET, HttpMethod.POST)
                        .filters(f -> f
                                .stripPrefix(1)
                                .circuitBreaker(cb -> cb
                                        .setName("userServiceCB")
                                        .setFallbackUri("forward:/fallback/users")))
                        .uri("lb://user-service"))

                .route("websocket-route", r -> r
                        .path("/ws/**")
                        .filters(f -> f.stripPrefix(1))
                        .uri("ws://websocket-service:8085"))

                .build();
    }
}
```

## 3. Route Predicates

### 3.1 Built-in Predicates

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: predicate-examples
          uri: http://httpbin.org
          predicates:
            # Time-based
            - After=2026-01-01T00:00:00+00:00
            - Before=2027-01-01T00:00:00+00:00
            - Between=2026-01-01T00:00:00+00:00,2026-12-31T23:59:59+00:00

            # Header-based
            - Header=X-Request-Id, \d+
            - Cookie=session, .+

            # Host-based
            - Host=**.example.com,**.example.org

            # Method-based
            - Method=GET,POST

            # Path-based
            - Path=/api/{segment}/**

            # Query parameter
            - Query=search
            - Query=category, electronics|books

            # Remote address
            - RemoteAddr=192.168.1.0/24,10.0.0.0/8

            # Weight (for A/B testing)
            - Weight=groupA, 80
```

### 3.2 Custom Predicate Factory

```java
@Component
public class ApiVersionRoutePredicateFactory
        extends AbstractRoutePredicateFactory<ApiVersionRoutePredicateFactory.Config> {

    public ApiVersionRoutePredicateFactory() {
        super(Config.class);
    }

    @Override
    public Predicate<ServerWebExchange> apply(Config config) {
        return exchange -> {
            String versionHeader = exchange.getRequest().getHeaders()
                    .getFirst("X-API-Version");
            String versionParam = exchange.getRequest().getQueryParams()
                    .getFirst("api-version");

            String version = versionHeader != null ? versionHeader : versionParam;

            if (version == null) {
                return config.getVersion().equals(config.getDefaultVersion());
            }

            return config.getVersion().equals(version);
        };
    }

    @Override
    public List<String> shortcutFieldOrder() {
        return List.of("version", "defaultVersion");
    }

    @Validated
    public static class Config {
        @NotEmpty
        private String version;
        private String defaultVersion = "v1";

        // getters and setters
        public String getVersion() { return version; }
        public void setVersion(String version) { this.version = version; }
        public String getDefaultVersion() { return defaultVersion; }
        public void setDefaultVersion(String defaultVersion) {
            this.defaultVersion = defaultVersion;
        }
    }
}

// Usage in YAML:
// predicates:
//   - ApiVersion=v2,v1
```

## 4. GatewayFilter Factories

### 4.1 Built-in Filters

```yaml
filters:
  # Request modification
  - AddRequestHeader=X-Request-Color, blue
  - AddRequestParameter=color, blue
  - RemoveRequestHeader=Cookie
  - SetRequestHeader=X-Request-Id, #{T(java.util.UUID).randomUUID().toString()}
  - PrefixPath=/api
  - StripPrefix=1
  - RewritePath=/api/(?<segment>.*), /${segment}

  # Response modification
  - AddResponseHeader=X-Response-Default-Color, blue
  - RemoveResponseHeader=Server
  - SetResponseHeader=X-Response-Id, #{T(java.util.UUID).randomUUID().toString()}
  - SetStatus=401
  - DedupeResponseHeader=Access-Control-Allow-Origin, RETAIN_FIRST

  # Size limiting
  - RequestSize=5000000   # 5 MB max request size

  # Retry
  - name: Retry
    args:
      retries: 3
      statuses: SERVICE_UNAVAILABLE,BAD_GATEWAY
      methods: GET
      backoff:
        firstBackoff: 100ms
        maxBackoff: 500ms
        factor: 2
        basedOnPreviousValue: true
```

### 4.2 Custom GatewayFilter Factory

```java
@Component
public class RequestLoggingGatewayFilterFactory
        extends AbstractGatewayFilterFactory<RequestLoggingGatewayFilterFactory.Config> {

    private static final Logger log = LoggerFactory.getLogger(
            RequestLoggingGatewayFilterFactory.class);

    public RequestLoggingGatewayFilterFactory() {
        super(Config.class);
    }

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            ServerHttpRequest request = exchange.getRequest();
            String requestId = UUID.randomUUID().toString().substring(0, 8);

            long startTime = System.nanoTime();

            // Mutate request to add tracking header
            ServerHttpRequest mutatedRequest = request.mutate()
                    .header("X-Request-Id", requestId)
                    .header("X-Gateway-Timestamp",
                            Instant.now().toString())
                    .build();

            if (config.isLogHeaders()) {
                log.info("[{}] {} {} Headers: {}", requestId,
                        request.getMethod(), request.getURI(),
                        request.getHeaders().toSingleValueMap());
            } else {
                log.info("[{}] {} {}", requestId,
                        request.getMethod(), request.getURI());
            }

            return chain.filter(exchange.mutate().request(mutatedRequest).build())
                    .then(Mono.fromRunnable(() -> {
                        long duration = (System.nanoTime() - startTime) / 1_000_000;
                        HttpStatusCode statusCode = exchange.getResponse().getStatusCode();
                        log.info("[{}] Response: {} ({}ms)", requestId,
                                statusCode, duration);
                    }));
        };
    }

    @Override
    public List<String> shortcutFieldOrder() {
        return List.of("logHeaders");
    }

    public static class Config {
        private boolean logHeaders = false;

        public boolean isLogHeaders() { return logHeaders; }
        public void setLogHeaders(boolean logHeaders) {
            this.logHeaders = logHeaders;
        }
    }
}

// Usage: filters: - RequestLogging=true
```

### 4.3 Request/Response Body Modification

```java
@Component
public class ResponseBodyModificationFilter
        extends AbstractGatewayFilterFactory<ResponseBodyModificationFilter.Config> {

    public ResponseBodyModificationFilter() {
        super(Config.class);
    }

    @Override
    public GatewayFilter apply(Config config) {
        return new OrderedGatewayFilter((exchange, chain) -> {
            return chain.filter(exchange.mutate()
                    .response(new ServerHttpResponseDecorator(exchange.getResponse()) {
                        @Override
                        public Mono<Void> writeWith(Publisher<? extends DataBuffer> body) {
                            if (getDelegate().getHeaders().getContentType() != null &&
                                getDelegate().getHeaders().getContentType()
                                        .includes(MediaType.APPLICATION_JSON)) {

                                return super.writeWith(
                                        DataBufferUtils.join(Flux.from(body))
                                                .map(dataBuffer -> {
                                                    byte[] content = new byte[dataBuffer.readableByteCount()];
                                                    dataBuffer.read(content);
                                                    DataBufferUtils.release(dataBuffer);

                                                    String originalBody = new String(content, StandardCharsets.UTF_8);
                                                    String modifiedBody = wrapResponse(originalBody);

                                                    byte[] modifiedBytes = modifiedBody.getBytes(StandardCharsets.UTF_8);
                                                    getDelegate().getHeaders()
                                                            .setContentLength(modifiedBytes.length);
                                                    return exchange.getResponse()
                                                            .bufferFactory()
                                                            .wrap(modifiedBytes);
                                                }));
                            }
                            return super.writeWith(body);
                        }
                    }).build());
        }, -1);
    }

    private String wrapResponse(String body) {
        return "{\"gateway\":\"spring-cloud-gateway\",\"timestamp\":\""
                + Instant.now() + "\",\"data\":" + body + "}";
    }

    public static class Config {}
}
```

## 5. Global Filters

```java
@Component
@Order(-1)
public class GlobalLoggingFilter implements GlobalFilter {

    private static final Logger log = LoggerFactory.getLogger(GlobalLoggingFilter.class);
    private final MeterRegistry meterRegistry;

    public GlobalLoggingFilter(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        String method = exchange.getRequest().getMethod().name();
        long startTime = System.nanoTime();

        return chain.filter(exchange)
                .doFinally(signalType -> {
                    long duration = (System.nanoTime() - startTime) / 1_000_000;
                    HttpStatusCode status = exchange.getResponse().getStatusCode();

                    meterRegistry.timer("gateway.request.duration",
                            "method", method,
                            "path", normalizePath(path),
                            "status", String.valueOf(
                                    status != null ? status.value() : 0))
                            .record(Duration.ofMillis(duration));
                });
    }

    private String normalizePath(String path) {
        // Replace IDs with placeholders for metric cardinality control
        return path.replaceAll("/\\d+", "/{id}")
                   .replaceAll("/[a-f0-9-]{36}", "/{uuid}");
    }
}
```

### 5.1 Authentication Global Filter

```java
@Component
@Order(0)
public class JwtAuthenticationFilter implements GlobalFilter {

    private final JwtDecoder jwtDecoder;
    private final Set<String> publicPaths;

    public JwtAuthenticationFilter(JwtDecoder jwtDecoder) {
        this.jwtDecoder = jwtDecoder;
        this.publicPaths = Set.of("/api/auth/login", "/api/auth/register",
                "/api/public", "/actuator/health");
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        if (publicPaths.stream().anyMatch(path::startsWith)) {
            return chain.filter(exchange);
        }

        String authHeader = exchange.getRequest().getHeaders()
                .getFirst(HttpHeaders.AUTHORIZATION);

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return unauthorized(exchange, "Missing or invalid Authorization header");
        }

        String token = authHeader.substring(7);
        try {
            Jwt jwt = jwtDecoder.decode(token);
            String userId = jwt.getSubject();
            String roles = jwt.getClaimAsString("roles");

            // Add user info as headers for downstream services
            ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                    .header("X-User-Id", userId)
                    .header("X-User-Roles", roles)
                    .header("X-Auth-Token", token)
                    .build();

            return chain.filter(exchange.mutate().request(mutatedRequest).build());

        } catch (JwtException e) {
            return unauthorized(exchange, "Invalid or expired token");
        }
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String message) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        exchange.getResponse().getHeaders()
                .setContentType(MediaType.APPLICATION_JSON);
        String body = "{\"error\":\"" + message + "\"}";
        DataBuffer buffer = exchange.getResponse().bufferFactory()
                .wrap(body.getBytes(StandardCharsets.UTF_8));
        return exchange.getResponse().writeWith(Mono.just(buffer));
    }
}
```

## 6. Rate Limiting with Redis

```java
@Configuration
public class RateLimiterConfig {

    @Bean
    public KeyResolver userKeyResolver() {
        return exchange -> {
            String userId = exchange.getRequest().getHeaders().getFirst("X-User-Id");
            if (userId != null) {
                return Mono.just(userId);
            }
            // Fall back to IP address
            return Mono.just(exchange.getRequest().getRemoteAddress()
                    .getAddress().getHostAddress());
        };
    }

    @Bean
    public KeyResolver apiKeyResolver() {
        return exchange -> {
            String apiKey = exchange.getRequest().getHeaders().getFirst("X-API-Key");
            return Mono.just(apiKey != null ? apiKey : "anonymous");
        };
    }

    @Bean
    public KeyResolver pathKeyResolver() {
        return exchange -> {
            String path = exchange.getRequest().getURI().getPath();
            String userId = exchange.getRequest().getHeaders()
                    .getFirst("X-User-Id");
            return Mono.just(userId + ":" + path);
        };
    }
}

// Custom rate limiter for tiered limits
@Component
public class TieredRateLimiter implements RateLimiter<TieredRateLimiter.Config> {

    private final ReactiveStringRedisTemplate redisTemplate;

    public TieredRateLimiter(ReactiveStringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public Mono<Response> isAllowed(String routeId, String id) {
        return getUserTier(id).flatMap(tier -> {
            int limit = switch (tier) {
                case "premium" -> 1000;
                case "standard" -> 100;
                default -> 10;
            };

            String key = "rate:" + routeId + ":" + id;
            return redisTemplate.opsForValue().increment(key)
                    .flatMap(count -> {
                        if (count == 1) {
                            redisTemplate.expire(key, Duration.ofMinutes(1)).subscribe();
                        }
                        boolean allowed = count <= limit;
                        return Mono.just(new Response(allowed,
                                Map.of("X-RateLimit-Remaining",
                                        String.valueOf(Math.max(0, limit - count)),
                                       "X-RateLimit-Limit",
                                        String.valueOf(limit))));
                    });
        });
    }

    private Mono<String> getUserTier(String userId) {
        return redisTemplate.opsForValue()
                .get("user:tier:" + userId)
                .defaultIfEmpty("free");
    }

    @Override
    public Class<Config> getConfigClass() {
        return Config.class;
    }

    @Override
    public Config newConfig() {
        return new Config();
    }

    public static class Config {}
}
```

## 7. Circuit Breaker Integration

```java
@Configuration
public class CircuitBreakerConfig {

    @Bean
    public Customizer<ReactiveResilience4JCircuitBreakerFactory> defaultCustomizer() {
        return factory -> {
            factory.configureDefault(id -> new Resilience4JConfigBuilder(id)
                    .circuitBreakerConfig(io.github.resilience4j.circuitbreaker.CircuitBreakerConfig.custom()
                            .slidingWindowType(SlidingWindowType.COUNT_BASED)
                            .slidingWindowSize(10)
                            .failureRateThreshold(50)
                            .waitDurationInOpenState(Duration.ofSeconds(10))
                            .permittedNumberOfCallsInHalfOpenState(3)
                            .slowCallDurationThreshold(Duration.ofSeconds(2))
                            .slowCallRateThreshold(80)
                            .build())
                    .timeLimiterConfig(TimeLimiterConfig.custom()
                            .timeoutDuration(Duration.ofSeconds(5))
                            .build())
                    .build());
        };
    }
}

// Fallback controller
@RestController
@RequestMapping("/fallback")
public class FallbackController {

    @GetMapping("/inventory")
    public ResponseEntity<Map<String, Object>> inventoryFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of(
                        "message", "Inventory service is currently unavailable",
                        "fallback", true,
                        "timestamp", Instant.now()
                ));
    }

    @GetMapping("/users")
    public ResponseEntity<Map<String, Object>> usersFallback() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of(
                        "message", "User service is currently unavailable",
                        "fallback", true,
                        "timestamp", Instant.now()
                ));
    }

    @RequestMapping("/generic")
    public ResponseEntity<Map<String, Object>> genericFallback(ServerWebExchange exchange) {
        String originalPath = exchange.getRequest().getURI().getPath();
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of(
                        "message", "Service unavailable",
                        "path", originalPath,
                        "fallback", true,
                        "timestamp", Instant.now()
                ));
    }
}
```

## 8. WebSocket Proxying

```java
@Bean
public RouteLocator webSocketRoutes(RouteLocatorBuilder builder) {
    return builder.routes()
            .route("websocket-route", r -> r
                    .path("/ws/chat/**")
                    .filters(f -> f
                            .stripPrefix(1)
                            .filter(webSocketAuthFilter()))
                    .uri("ws://chat-service:8085"))
            .route("websocket-sse", r -> r
                    .path("/ws/notifications/**")
                    .filters(f -> f.stripPrefix(1))
                    .uri("ws://notification-service:8086"))
            .build();
}

private GatewayFilter webSocketAuthFilter() {
    return (exchange, chain) -> {
        String token = exchange.getRequest().getQueryParams()
                .getFirst("token");
        if (token == null) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }
        try {
            Jwt jwt = jwtDecoder.decode(token);
            ServerHttpRequest mutated = exchange.getRequest().mutate()
                    .header("X-User-Id", jwt.getSubject())
                    .build();
            return chain.filter(exchange.mutate().request(mutated).build());
        } catch (JwtException e) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }
    };
}
```

## 9. Performance Tuning

```yaml
spring:
  cloud:
    gateway:
      httpclient:
        connect-timeout: 2000
        response-timeout: 5s
        pool:
          type: elastic         # elastic | fixed | disabled
          max-connections: 500
          acquire-timeout: 5000
          max-idle-time: 20s
          max-life-time: 60s
          eviction-interval: 120s
        compression: true
        wiretap: false          # enable for debugging only

      # Global default filters
      default-filters:
        - name: Retry
          args:
            retries: 2
            statuses: BAD_GATEWAY,SERVICE_UNAVAILABLE,GATEWAY_TIMEOUT
            methods: GET
            backoff:
              firstBackoff: 50ms
              maxBackoff: 500ms
              factor: 2

server:
  netty:
    connection-timeout: 2000

# Reactor Netty tuning
reactor:
  netty:
    ioWorkerCount: 4              # default: available processors
    pool:
      leasingStrategy: fifo       # fifo | lifo
```

### 9.1 Connection Pool Monitoring

```java
@Configuration
public class GatewayMetricsConfig {

    @Bean
    public HttpClientCustomizer metricsCustomizer(MeterRegistry registry) {
        return httpClient -> httpClient
                .metrics(true, uri -> {
                    // Normalize URIs to avoid high cardinality
                    return uri.replaceAll("/\\d+", "/{id}")
                              .replaceAll("/[a-f0-9-]{36}", "/{uuid}");
                })
                .doOnConnected(conn ->
                        registry.counter("gateway.connections.active").increment())
                .doOnDisconnected(conn ->
                        registry.counter("gateway.connections.closed").increment());
    }
}
```

## 10. Dynamic Route Configuration

```java
@RestController
@RequestMapping("/api/gateway/routes")
public class DynamicRouteController {

    private final RouteDefinitionWriter routeDefinitionWriter;
    private final ApplicationEventPublisher publisher;

    public DynamicRouteController(RouteDefinitionWriter routeDefinitionWriter,
                                   ApplicationEventPublisher publisher) {
        this.routeDefinitionWriter = routeDefinitionWriter;
        this.publisher = publisher;
    }

    @PostMapping
    public Mono<ResponseEntity<String>> addRoute(@RequestBody RouteDefinition route) {
        return routeDefinitionWriter.save(Mono.just(route))
                .then(Mono.fromRunnable(() ->
                        publisher.publishEvent(new RefreshRoutesEvent(this))))
                .then(Mono.just(ResponseEntity.status(HttpStatus.CREATED)
                        .body("Route " + route.getId() + " created")));
    }

    @DeleteMapping("/{routeId}")
    public Mono<ResponseEntity<String>> deleteRoute(@PathVariable String routeId) {
        return routeDefinitionWriter.delete(Mono.just(routeId))
                .then(Mono.fromRunnable(() ->
                        publisher.publishEvent(new RefreshRoutesEvent(this))))
                .then(Mono.just(ResponseEntity.ok("Route " + routeId + " deleted")))
                .onErrorResume(e -> Mono.just(
                        ResponseEntity.notFound().build()));
    }
}

// Route definition from database
@Component
public class DatabaseRouteDefinitionLocator implements RouteDefinitionLocator {

    private final RouteConfigRepository routeConfigRepository;

    public DatabaseRouteDefinitionLocator(RouteConfigRepository routeConfigRepository) {
        this.routeConfigRepository = routeConfigRepository;
    }

    @Override
    public Flux<RouteDefinition> getRouteDefinitions() {
        return Flux.fromIterable(routeConfigRepository.findAllActive())
                .map(this::toRouteDefinition);
    }

    private RouteDefinition toRouteDefinition(RouteConfig config) {
        RouteDefinition route = new RouteDefinition();
        route.setId(config.getRouteId());
        route.setUri(URI.create(config.getUri()));

        PredicateDefinition pathPredicate = new PredicateDefinition();
        pathPredicate.setName("Path");
        pathPredicate.addArg("pattern", config.getPath());
        route.setPredicates(List.of(pathPredicate));

        if (config.getStripPrefix() > 0) {
            FilterDefinition stripFilter = new FilterDefinition();
            stripFilter.setName("StripPrefix");
            stripFilter.addArg("parts", String.valueOf(config.getStripPrefix()));
            route.setFilters(List.of(stripFilter));
        }

        return route;
    }
}
```

Spring Cloud Gateway is the preferred gateway solution in the Spring ecosystem for reactive microservice architectures. Its filter-chain model makes cross-cutting concerns composable and testable. For production deployments, pay close attention to connection pool sizing, timeout configuration, and rate limiter key design to ensure the gateway does not become a bottleneck itself.
