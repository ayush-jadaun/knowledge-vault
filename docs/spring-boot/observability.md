---
title: "Spring Boot Observability"
description: "Complete guide to Spring Boot observability — Micrometer metrics, OpenTelemetry integration, distributed tracing with Zipkin/Jaeger, log correlation, custom metrics and SLI/SLO dashboards, Grafana and Prometheus setup, and observability patterns for reactive applications."
tags: [spring-boot, observability, micrometer, opentelemetry, tracing]
difficulty: intermediate
prerequisites: [spring-boot-fundamentals, monitoring-basics, docker-basics]
lastReviewed: "2026-03-25"
---

# Spring Boot Observability

Observability is the ability to understand a system's internal state from its external outputs. Spring Boot 3+ provides a unified observability model built on Micrometer (metrics), Micrometer Tracing (distributed traces), and structured logging — all integrated through the Observation API.

## 1. Observability Stack Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Spring Boot Application                       │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Micrometer   │  │ Micrometer   │  │ SLF4J + Logback      │  │
│  │ Metrics      │  │ Tracing      │  │ (Structured Logging)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────────┘  │
│         │                 │                  │                   │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────────────┐  │
│  │ Prometheus   │  │ OpenTelemetry│  │ Log Aggregator       │  │
│  │ Exporter     │  │ Exporter     │  │ (Loki, ELK)          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────────┘  │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                  │
          ▼                 ▼                  ▼
    ┌──────────┐     ┌──────────┐       ┌──────────┐
    │Prometheus│     │  Zipkin/ │       │   Loki/  │
    │          │     │  Jaeger  │       │   ELK    │
    └────┬─────┘     └──────────┘       └────┬─────┘
         │                                    │
         └──────────┬─────────────────────────┘
                    ▼
              ┌──────────┐
              │ Grafana  │
              └──────────┘
```

### 1.1 Dependencies

```xml
<!-- Core observability -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<!-- Prometheus metrics export -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
<!-- Distributed tracing with Zipkin -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-exporter-zipkin</artifactId>
</dependency>
<!-- Or with OTLP exporter for Jaeger/Tempo/etc. -->
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-exporter-otlp</artifactId>
</dependency>
<!-- Loki log shipping -->
<dependency>
    <groupId>com.github.loki4j</groupId>
    <artifactId>loki-logback-appender</artifactId>
    <version>1.5.1</version>
</dependency>
```

### 1.2 Configuration

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus,loggers
  metrics:
    tags:
      application: ${spring.application.name}
      environment: ${ENVIRONMENT:development}
    distribution:
      percentiles-histogram:
        http.server.requests: true
      percentiles:
        http.server.requests: 0.5, 0.9, 0.95, 0.99
      minimum-expected-value:
        http.server.requests: 1ms
      maximum-expected-value:
        http.server.requests: 10s
    enable:
      jvm: true
      system: true
      process: true
      tomcat: true
      hikaricp: true

  tracing:
    sampling:
      probability: 1.0          # 100% in dev, lower in prod (0.1 = 10%)
    propagation:
      type: w3c                 # W3C Trace Context (default)

  zipkin:
    tracing:
      endpoint: http://zipkin:9411/api/v2/spans

  # Or OTLP
  otlp:
    tracing:
      endpoint: http://otel-collector:4318/v1/traces
    metrics:
      export:
        enabled: true
        url: http://otel-collector:4318/v1/metrics

spring:
  application:
    name: order-service

logging:
  pattern:
    level: "%5p [${spring.application.name},%X{traceId:-},%X{spanId:-}]"
```

## 2. Micrometer Metrics

### 2.1 Auto-Configured Metrics

Spring Boot auto-configures metrics for HTTP requests, JVM memory, GC, threads, database connections, cache, and more.

```java
// Key auto-configured metrics:
// http.server.requests     — HTTP request duration/count
// jvm.memory.used          — JVM memory usage
// jvm.gc.pause             — GC pause times
// jvm.threads.states       — Thread states
// hikaricp.connections.*    — Connection pool metrics
// spring.data.repository.* — Repository call duration
// disk.free                — Disk space
// system.cpu.usage         — CPU usage
```

### 2.2 Custom Metrics

```java
@Component
public class OrderMetrics {

    private final Counter ordersCreated;
    private final Counter ordersCancelled;
    private final Timer orderProcessingTime;
    private final DistributionSummary orderAmount;
    private final AtomicInteger activeOrders;

    public OrderMetrics(MeterRegistry registry) {
        this.ordersCreated = Counter.builder("orders.created")
                .description("Total number of orders created")
                .tag("service", "order-service")
                .register(registry);

        this.ordersCancelled = Counter.builder("orders.cancelled")
                .description("Total number of orders cancelled")
                .tag("service", "order-service")
                .register(registry);

        this.orderProcessingTime = Timer.builder("orders.processing.duration")
                .description("Time to process an order")
                .publishPercentiles(0.5, 0.9, 0.95, 0.99)
                .publishPercentileHistogram()
                .register(registry);

        this.orderAmount = DistributionSummary.builder("orders.amount")
                .description("Order amount distribution")
                .baseUnit("dollars")
                .publishPercentiles(0.5, 0.9, 0.99)
                .scale(0.01)  // cents to dollars
                .register(registry);

        this.activeOrders = registry.gauge("orders.active",
                new AtomicInteger(0));
    }

    public void recordOrderCreated(BigDecimal amount, String region) {
        ordersCreated.increment();
        orderAmount.record(amount.doubleValue());
        activeOrders.incrementAndGet();
    }

    public void recordOrderCancelled() {
        ordersCancelled.increment();
        activeOrders.decrementAndGet();
    }

    public Timer.Sample startProcessingTimer() {
        return Timer.start();
    }

    public void stopProcessingTimer(Timer.Sample sample, String outcome) {
        sample.stop(Timer.builder("orders.processing.duration")
                .tag("outcome", outcome)
                .register(ordersCreated.getId().getTag("service") != null
                        ? Metrics.globalRegistry : Metrics.globalRegistry));
    }
}

// Usage in service
@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final OrderMetrics metrics;

    @Timed(value = "orders.create", description = "Create order duration")
    public Order createOrder(OrderRequest request) {
        Timer.Sample sample = metrics.startProcessingTimer();
        try {
            Order order = new Order(request);
            order = orderRepository.save(order);
            metrics.recordOrderCreated(order.getTotalAmount(), request.getRegion());
            sample.stop(Timer.builder("orders.processing.duration")
                    .tag("outcome", "success")
                    .register(Metrics.globalRegistry));
            return order;
        } catch (Exception e) {
            sample.stop(Timer.builder("orders.processing.duration")
                    .tag("outcome", "failure")
                    .register(Metrics.globalRegistry));
            throw e;
        }
    }
}
```

### 2.3 Custom MeterBinder

```java
@Component
public class BusinessMetricsBinder implements MeterBinder {

    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;

    public BusinessMetricsBinder(OrderRepository orderRepository,
                                  PaymentRepository paymentRepository) {
        this.orderRepository = orderRepository;
        this.paymentRepository = paymentRepository;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        // Gauges that query the database periodically
        Gauge.builder("orders.pending.count", orderRepository,
                repo -> repo.countByStatus(OrderStatus.PENDING))
                .description("Number of pending orders")
                .register(registry);

        Gauge.builder("orders.total.revenue", orderRepository,
                repo -> repo.sumTotalAmountByStatus(OrderStatus.COMPLETED)
                        .doubleValue())
                .description("Total revenue from completed orders")
                .baseUnit("dollars")
                .register(registry);

        Gauge.builder("payments.pending.amount", paymentRepository,
                repo -> repo.sumPendingAmount().doubleValue())
                .description("Total amount of pending payments")
                .baseUnit("dollars")
                .register(registry);
    }
}
```

## 3. Distributed Tracing

### 3.1 Automatic Tracing

Spring Boot auto-instruments HTTP clients, REST templates, WebClient, JDBC, Kafka producers/consumers, and more.

```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);
    private final OrderService orderService;

    // Trace ID is automatically propagated in log messages
    // via the logging pattern: [app-name,traceId,spanId]

    @GetMapping("/{id}")
    public ResponseEntity<Order> getOrder(@PathVariable Long id) {
        // This log line will include traceId and spanId
        log.info("Fetching order {}", id);
        Order order = orderService.findById(id);
        return ResponseEntity.ok(order);
    }
}
```

### 3.2 Custom Spans

```java
@Service
public class PaymentService {

    private final ObservationRegistry observationRegistry;
    private final PaymentGateway paymentGateway;

    public PaymentService(ObservationRegistry observationRegistry,
                           PaymentGateway paymentGateway) {
        this.observationRegistry = observationRegistry;
        this.paymentGateway = paymentGateway;
    }

    public PaymentResult processPayment(PaymentRequest request) {
        // Create a custom observation (generates both metric and span)
        return Observation.createNotStarted("payment.process", observationRegistry)
                .lowCardinalityKeyValue("payment.method", request.getMethod())
                .lowCardinalityKeyValue("payment.currency", request.getCurrency())
                .highCardinalityKeyValue("payment.amount",
                        request.getAmount().toString())
                .observe(() -> {
                    // Validate
                    Observation.createNotStarted("payment.validate", observationRegistry)
                            .observe(() -> validatePayment(request));

                    // Charge
                    PaymentResult result = Observation
                            .createNotStarted("payment.charge", observationRegistry)
                            .lowCardinalityKeyValue("gateway", "stripe")
                            .observe(() -> paymentGateway.charge(request));

                    // Record result
                    Observation.createNotStarted("payment.record", observationRegistry)
                            .observe(() -> recordPayment(request, result));

                    return result;
                });
    }
}
```

### 3.3 Propagating Context Across Async Boundaries

```java
@Service
public class AsyncOrderService {

    private final ObservationRegistry observationRegistry;
    private final TaskExecutor taskExecutor;

    public AsyncOrderService(ObservationRegistry observationRegistry) {
        this.observationRegistry = observationRegistry;
        // Wrap executor to propagate observation context
        this.taskExecutor = ContextExecutorService.wrap(
                Executors.newFixedThreadPool(10));
    }

    public CompletableFuture<Order> processOrderAsync(OrderRequest request) {
        Observation observation = Observation.start("order.async.process",
                observationRegistry);

        return CompletableFuture.supplyAsync(() -> {
            try (Observation.Scope scope = observation.openScope()) {
                // Trace context is available in this thread
                Order order = doProcess(request);
                observation.stop();
                return order;
            } catch (Exception e) {
                observation.error(e);
                observation.stop();
                throw e;
            }
        }, taskExecutor);
    }
}
```

## 4. Log Correlation

### 4.1 Structured Logging with Logback

```xml
<!-- logback-spring.xml -->
<configuration>
    <include resource="org/springframework/boot/logging/logback/defaults.xml"/>

    <!-- Console output with trace context -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <includeMdcKeyName>traceId</includeMdcKeyName>
            <includeMdcKeyName>spanId</includeMdcKeyName>
            <customFields>
                {"service":"${spring.application.name}",
                 "environment":"${ENVIRONMENT:-development}"}
            </customFields>
        </encoder>
    </appender>

    <!-- File output as JSON -->
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>logs/application.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>logs/application.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
            <maxFileSize>100MB</maxFileSize>
            <maxHistory>30</maxHistory>
        </rollingPolicy>
        <encoder class="net.logstash.logback.encoder.LogstashEncoder"/>
    </appender>

    <!-- Loki appender -->
    <appender name="LOKI" class="com.github.loki4j.logback.Loki4jAppender">
        <http>
            <url>http://loki:3100/loki/api/v1/push</url>
        </http>
        <format>
            <label>
                <pattern>service=${spring.application.name},level=%level,host=${HOSTNAME}</pattern>
            </label>
            <message class="com.github.loki4j.logback.JsonLayout"/>
        </format>
    </appender>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="FILE"/>
        <appender-ref ref="LOKI"/>
    </root>
</configuration>
```

### 4.2 Structured Log Events

```java
@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public Order createOrder(OrderRequest request) {
        // Structured key-value pairs in log messages
        log.atInfo()
                .addKeyValue("customerId", request.getCustomerId())
                .addKeyValue("itemCount", request.getItems().size())
                .addKeyValue("totalAmount", request.getTotalAmount())
                .log("Creating order");

        Order order = processOrder(request);

        log.atInfo()
                .addKeyValue("orderId", order.getId())
                .addKeyValue("status", order.getStatus())
                .addKeyValue("processingTimeMs", order.getProcessingTime())
                .log("Order created successfully");

        return order;
    }

    public void handlePayment(Long orderId, PaymentResult result) {
        if (result.isSuccess()) {
            log.atInfo()
                    .addKeyValue("orderId", orderId)
                    .addKeyValue("paymentId", result.getPaymentId())
                    .addKeyValue("amount", result.getAmount())
                    .log("Payment processed");
        } else {
            log.atWarn()
                    .addKeyValue("orderId", orderId)
                    .addKeyValue("errorCode", result.getErrorCode())
                    .addKeyValue("errorMessage", result.getErrorMessage())
                    .log("Payment failed");
        }
    }
}
```

## 5. Prometheus and Grafana Setup

### 5.1 Docker Compose

```yaml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - ./grafana/dashboards:/var/lib/grafana/dashboards
      - ./grafana/provisioning:/etc/grafana/provisioning

  zipkin:
    image: openzipkin/zipkin:latest
    ports:
      - "9411:9411"

  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml
```

### 5.2 Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'spring-boot-apps'
    metrics_path: '/actuator/prometheus'
    scrape_interval: 5s
    static_configs:
      - targets:
          - 'order-service:8080'
          - 'payment-service:8081'
          - 'inventory-service:8082'
        labels:
          group: 'spring-boot'

  # Kubernetes service discovery
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
```

## 6. SLI/SLO Dashboards

### 6.1 SLI Definitions

```java
@Configuration
public class SliConfig {

    @Bean
    public MeterBinder sliMetrics(MeterRegistry registry) {
        return r -> {
            // SLI: Availability — percentage of successful requests
            // Tracked via http.server.requests with status tag

            // SLI: Latency — percentage of requests under threshold
            // Tracked via http.server.requests histogram

            // SLI: Error Rate — percentage of 5xx responses
            // Tracked via http.server.requests with status tag

            // Custom SLI: Order Processing Success Rate
            FunctionCounter.builder("sli.order.processing.total",
                    this, obj -> getTotalOrders())
                    .register(r);
            FunctionCounter.builder("sli.order.processing.success",
                    this, obj -> getSuccessfulOrders())
                    .register(r);
        };
    }
}
```

### 6.2 PromQL Queries for Dashboards

```promql
# Availability SLO (99.9%)
# Success rate over 5 minutes
sum(rate(http_server_requests_seconds_count{status!~"5.."}[5m]))
/
sum(rate(http_server_requests_seconds_count[5m]))

# Latency SLO (P99 < 500ms)
histogram_quantile(0.99,
  sum(rate(http_server_requests_seconds_bucket[5m])) by (le))

# Error Budget Remaining (30-day window)
1 - (
  (1 - (sum(increase(http_server_requests_seconds_count{status!~"5.."}[30d]))
        / sum(increase(http_server_requests_seconds_count[30d]))))
  / (1 - 0.999)
)

# Request rate by endpoint
sum(rate(http_server_requests_seconds_count[5m])) by (uri, method)

# Average response time by endpoint
sum(rate(http_server_requests_seconds_sum[5m])) by (uri)
/
sum(rate(http_server_requests_seconds_count[5m])) by (uri)

# JVM memory usage
jvm_memory_used_bytes{area="heap"} / jvm_memory_max_bytes{area="heap"}

# Active database connections
hikaricp_connections_active{pool="HikariPool-1"}

# GC pause time (seconds per minute)
sum(rate(jvm_gc_pause_seconds_sum[1m]))
```

## 7. Custom ObservationHandler

```java
@Component
public class OrderObservationHandler implements ObservationHandler<Observation.Context> {

    private static final Logger log = LoggerFactory.getLogger(
            OrderObservationHandler.class);
    private final MeterRegistry meterRegistry;

    public OrderObservationHandler(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Override
    public boolean supportsContext(Observation.Context context) {
        return context.getName().startsWith("order.");
    }

    @Override
    public void onStart(Observation.Context context) {
        log.debug("Observation started: {}", context.getName());
    }

    @Override
    public void onStop(Observation.Context context) {
        String name = context.getName();
        long durationNanos = context.getHighCardinalityKeyValues().stream()
                .filter(kv -> kv.getKey().equals("duration"))
                .findFirst()
                .map(kv -> Long.parseLong(kv.getValue()))
                .orElse(0L);

        log.info("Observation completed: {} ({}ms)", name,
                durationNanos / 1_000_000);

        meterRegistry.counter("observations.completed",
                "name", name).increment();
    }

    @Override
    public void onError(Observation.Context context) {
        log.error("Observation error in {}: {}",
                context.getName(),
                context.getError().getMessage());

        meterRegistry.counter("observations.errors",
                "name", context.getName(),
                "error", context.getError().getClass().getSimpleName())
                .increment();
    }
}
```

## 8. Health and Readiness

```java
@Component
public class OrderServiceHealthIndicator implements HealthIndicator {

    private final DataSource dataSource;
    private final KafkaTemplate<String, ?> kafkaTemplate;

    @Override
    public Health health() {
        Health.Builder builder = new Health.Builder();

        // Check database
        try (Connection conn = dataSource.getConnection()) {
            if (conn.isValid(2)) {
                builder.withDetail("database", "UP");
            } else {
                return builder.down().withDetail("database", "Connection invalid").build();
            }
        } catch (SQLException e) {
            return builder.down(e).withDetail("database", "DOWN").build();
        }

        // Check Kafka
        try {
            kafkaTemplate.getProducerFactory().createProducer().metrics();
            builder.withDetail("kafka", "UP");
        } catch (Exception e) {
            return builder.down(e).withDetail("kafka", "DOWN").build();
        }

        return builder.up().build();
    }
}

@Component
public class ReadinessIndicator implements HealthIndicator {

    private final AtomicBoolean ready = new AtomicBoolean(false);

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        ready.set(true);
    }

    @Override
    public Health health() {
        if (ready.get()) {
            return Health.up().build();
        }
        return Health.down().withDetail("reason", "Application not ready").build();
    }
}
```

## 9. Observability in Reactive Applications

```java
@Configuration
public class ReactiveObservabilityConfig {

    @Bean
    public WebClient.Builder observableWebClientBuilder(
            ObservationRegistry observationRegistry) {
        return WebClient.builder()
                .observationRegistry(observationRegistry)
                .observationConvention(new DefaultClientRequestObservationConvention());
    }
}

@Service
public class ReactiveOrderService {

    private final ObservationRegistry observationRegistry;

    public Mono<Order> createOrder(OrderRequest request) {
        return Mono.deferContextual(ctx -> {
            return Mono.just(request)
                    .flatMap(this::validateOrder)
                    .flatMap(this::reserveInventory)
                    .flatMap(this::processPayment)
                    .flatMap(this::saveOrder)
                    .name("order.create")  // observation name
                    .tag("order.type", request.getType())
                    .tap(Micrometer.observation(observationRegistry));
        });
    }
}
```

Observability is not optional for production microservices. Start with the auto-configured metrics and traces from Spring Boot Actuator, add custom business metrics for your SLIs, correlate logs with trace IDs, and build Grafana dashboards for both operational and business visibility. The unified Observation API in Spring Boot 3+ makes it straightforward to instrument code once and get both metrics and traces from the same observation.
