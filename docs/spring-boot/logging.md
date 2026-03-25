---
title: "Logging"
description: "Complete guide to logging in Spring Boot — SLF4J and Logback configuration, structured JSON logging, MDC for correlation IDs and distributed tracing, per-package log levels, ELK stack integration, log performance optimization, and production logging patterns"
tags: [spring-boot, logging, logback, slf4j, observability]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Logging

Logging is your production debugger. When something goes wrong at 3 AM, you cannot attach a debugger to a running production system — you read logs. Good logging tells you what happened, when it happened, who triggered it, and why it failed. Bad logging buries the signal in noise, misses critical events, or leaks sensitive data.

Spring Boot uses SLF4J as the logging facade and Logback as the default implementation. This combination is configured through `application.yml` for simple cases and `logback-spring.xml` for advanced patterns like JSON formatting, log routing, and conditional behavior.

## Basic Configuration

### application.yml

```yaml
logging:
  level:
    root: INFO
    com.example: DEBUG                          # Your application
    com.example.repository: TRACE               # SQL debugging
    org.springframework.web: INFO
    org.springframework.security: DEBUG          # Security debugging
    org.hibernate.SQL: DEBUG                     # Show SQL statements
    org.hibernate.type.descriptor.sql: TRACE     # Show SQL parameter values
    org.apache.kafka: WARN                       # Reduce Kafka noise
    com.zaxxer.hikari: INFO

  file:
    name: /var/log/myapp/application.log
    max-size: 100MB
    max-history: 30
    total-size-cap: 3GB

  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n"
    file: "%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n"
```

### SLF4J Usage

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class OrderService {

    // Option 1: Manual logger declaration
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    // Option 2: Lombok @Slf4j annotation (generates the above)

    public Order createOrder(CreateOrderRequest request) {
        log.info("Creating order for customer {}", request.getCustomerId());

        // Parameterized logging — avoids string concatenation when level is disabled
        log.debug("Order details: items={}, total={}",
                request.getItems().size(), request.getTotalAmount());

        try {
            Order order = processOrder(request);
            log.info("Order {} created successfully. Total: {}",
                    order.getId(), order.getTotalAmount());
            return order;
        } catch (InsufficientStockException e) {
            log.warn("Order creation failed: insufficient stock for product {}",
                    e.getProductId());
            throw e;
        } catch (Exception e) {
            // Log exception with stack trace — pass exception as last arg
            log.error("Unexpected error creating order for customer {}",
                    request.getCustomerId(), e);
            throw e;
        }
    }
}
```

## Logback Configuration

For production-grade logging, use `logback-spring.xml` in `src/main/resources/`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>

    <!-- Import Spring Boot defaults -->
    <include resource="org/springframework/boot/logging/logback/defaults.xml"/>

    <!-- Properties -->
    <springProperty scope="context" name="APP_NAME" source="spring.application.name"
                    defaultValue="myapp"/>
    <property name="LOG_PATH" value="${LOG_PATH:-/var/log/${APP_NAME}}"/>

    <!-- Console appender (for development) -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} %highlight(%-5level) [%15.15thread]
                %cyan(%-40.40logger{39}) : %msg%n</pattern>
        </encoder>
    </appender>

    <!-- File appender with rolling -->
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_PATH}/application.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>${LOG_PATH}/application.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
            <maxFileSize>100MB</maxFileSize>
            <maxHistory>30</maxHistory>
            <totalSizeCap>3GB</totalSizeCap>
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] %logger{50}
                [%X{correlationId}] [%X{userId}] - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- Async wrapper for file appender (non-blocking) -->
    <appender name="ASYNC_FILE" class="ch.qos.logback.classic.AsyncAppender">
        <appender-ref ref="FILE"/>
        <queueSize>1024</queueSize>
        <discardingThreshold>0</discardingThreshold>
        <neverBlock>true</neverBlock>
    </appender>

    <!-- Error-only file -->
    <appender name="ERROR_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_PATH}/error.log</file>
        <filter class="ch.qos.logback.classic.filter.ThresholdFilter">
            <level>ERROR</level>
        </filter>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>${LOG_PATH}/error.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
            <maxFileSize>50MB</maxFileSize>
            <maxHistory>90</maxHistory>
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} ERROR [%thread] %logger{50}
                [%X{correlationId}] - %msg%n%ex</pattern>
        </encoder>
    </appender>

    <!-- Profile-specific configuration -->
    <springProfile name="dev">
        <root level="INFO">
            <appender-ref ref="CONSOLE"/>
        </root>
        <logger name="com.example" level="DEBUG"/>
    </springProfile>

    <springProfile name="prod">
        <root level="INFO">
            <appender-ref ref="ASYNC_FILE"/>
            <appender-ref ref="ERROR_FILE"/>
        </root>
        <logger name="com.example" level="INFO"/>
        <logger name="org.springframework" level="WARN"/>
    </springProfile>

</configuration>
```

## Structured JSON Logging

Plain text logs are easy to read but hard to query. Structured JSON logs can be ingested by Elasticsearch, Datadog, Splunk, and other log aggregation tools:

### Using Logback Logstash Encoder

```xml
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.4</version>
</dependency>
```

```xml
<!-- logback-spring.xml -->
<appender name="JSON_CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <includeMdc>true</includeMdc>
        <includeCallerData>false</includeCallerData>
        <fieldNames>
            <timestamp>@timestamp</timestamp>
            <version>[ignore]</version>
            <levelValue>[ignore]</levelValue>
        </fieldNames>
        <customFields>{"service":"myapp","environment":"${ENVIRONMENT:-dev}"}</customFields>
    </encoder>
</appender>
```

Output:
```json
{
    "@timestamp": "2026-03-25T14:30:00.123Z",
    "level": "INFO",
    "thread": "http-nio-8080-exec-1",
    "logger": "com.example.service.OrderService",
    "message": "Order ORD-123 created successfully. Total: 99.99",
    "correlationId": "abc-def-123",
    "userId": "usr_456",
    "service": "myapp",
    "environment": "prod"
}
```

### Adding Custom Fields to JSON Logs

```java
import net.logstash.logback.argument.StructuredArguments;
import static net.logstash.logback.argument.StructuredArguments.*;

@Service
public class OrderService {

    public Order createOrder(CreateOrderRequest request) {
        // Key-value pairs become JSON fields in the log entry
        log.info("Order created",
                kv("orderId", order.getId()),
                kv("customerId", request.getCustomerId()),
                kv("totalAmount", order.getTotalAmount()),
                kv("itemCount", request.getItems().size()),
                kv("paymentMethod", request.getPaymentMethod()));
    }
}
```

Output:
```json
{
    "@timestamp": "2026-03-25T14:30:00.123Z",
    "message": "Order created",
    "orderId": "ORD-123",
    "customerId": "usr_456",
    "totalAmount": 99.99,
    "itemCount": 3,
    "paymentMethod": "credit_card"
}
```

## MDC (Mapped Diagnostic Context)

MDC stores key-value pairs in a thread-local context that gets automatically included in every log statement. Essential for correlation IDs in distributed tracing:

### Correlation ID Filter

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

    private static final String CORRELATION_HEADER = "X-Correlation-ID";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain)
            throws ServletException, IOException {

        String correlationId = request.getHeader(CORRELATION_HEADER);
        if (correlationId == null || correlationId.isBlank()) {
            correlationId = UUID.randomUUID().toString().substring(0, 12);
        }

        MDC.put("correlationId", correlationId);
        MDC.put("requestMethod", request.getMethod());
        MDC.put("requestPath", request.getRequestURI());
        MDC.put("clientIp", getClientIp(request));

        // Add user info if authenticated
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated()
                && !"anonymousUser".equals(auth.getPrincipal())) {
            MDC.put("userId", auth.getName());
        }

        // Return correlation ID in response header
        response.setHeader(CORRELATION_HEADER, correlationId);

        try {
            chain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}
```

### Propagating MDC to Async Threads

MDC is thread-local, so it is lost when work moves to a different thread:

```java
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {

    @Override
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(50);
        executor.setThreadNamePrefix("async-");
        executor.setTaskDecorator(new MdcTaskDecorator());  // Propagate MDC
        executor.initialize();
        return executor;
    }
}

public class MdcTaskDecorator implements TaskDecorator {
    @Override
    public Runnable decorate(Runnable runnable) {
        Map<String, String> contextMap = MDC.getCopyOfContextMap();
        return () -> {
            try {
                if (contextMap != null) {
                    MDC.setContextMap(contextMap);
                }
                runnable.run();
            } finally {
                MDC.clear();
            }
        };
    }
}
```

## Request/Response Logging

### HTTP Request Logging Filter

```java
@Component
public class RequestLoggingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain)
            throws ServletException, IOException {

        long startTime = System.nanoTime();

        chain.doFilter(request, response);

        long duration = (System.nanoTime() - startTime) / 1_000_000;
        int status = response.getStatus();

        if (status >= 500) {
            log.error("HTTP {} {} → {} ({}ms)",
                    request.getMethod(), request.getRequestURI(),
                    status, duration);
        } else if (status >= 400) {
            log.warn("HTTP {} {} → {} ({}ms)",
                    request.getMethod(), request.getRequestURI(),
                    status, duration);
        } else {
            log.info("HTTP {} {} → {} ({}ms)",
                    request.getMethod(), request.getRequestURI(),
                    status, duration);
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/actuator") || path.startsWith("/swagger");
    }
}
```

## ELK Stack Integration

```
Application → Logback JSON → Filebeat → Logstash → Elasticsearch → Kibana
```

### Filebeat Configuration

```yaml
# filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/myapp/application.log
    json:
      keys_under_root: true
      add_error_key: true
      message_key: message
    fields:
      service: myapp
      environment: production

output.logstash:
  hosts: ["logstash:5044"]
```

### Direct Logstash Appender

```xml
<appender name="LOGSTASH" class="net.logstash.logback.appender.LogstashTcpSocketAppender">
    <destination>logstash-host:5000</destination>
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <customFields>{"service":"myapp"}</customFields>
    </encoder>
    <reconnectionDelay>5 seconds</reconnectionDelay>
    <keepAliveDuration>5 minutes</keepAliveDuration>
</appender>
```

## Performance Optimization

### Avoid Expensive Operations at Disabled Levels

```java
// BAD — toString() always called even if DEBUG is disabled
log.debug("Processing user: " + user.toString());

// GOOD — parameterized logging (no computation if level disabled)
log.debug("Processing user: {}", user);

// GOOD — guard expensive computation
if (log.isDebugEnabled()) {
    String expensiveReport = generateDebugReport(data);
    log.debug("Debug report: {}", expensiveReport);
}
```

### Async Appenders

Logging should never block your request thread. The async appender queues log events and writes them in a background thread:

```xml
<appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
    <appender-ref ref="FILE"/>
    <queueSize>2048</queueSize>
    <discardingThreshold>0</discardingThreshold>
    <neverBlock>true</neverBlock>
    <includeCallerData>false</includeCallerData>
</appender>
```

| Setting | Description |
|---------|-------------|
| `queueSize` | Internal queue capacity (default: 256) |
| `discardingThreshold` | Drop DEBUG/INFO when queue is 80% full (set 0 to never drop) |
| `neverBlock` | Never block the calling thread (drop instead) |
| `includeCallerData` | Include class/method/line info (expensive, disable in prod) |

## Sensitive Data Protection

```java
// NEVER log passwords, tokens, or full credit card numbers
log.info("User login: email={}", email);
// NOT: log.info("User login: email={}, password={}", email, password);

// Mask sensitive fields
public class SensitiveDataMasker {
    public static String maskEmail(String email) {
        int atIndex = email.indexOf('@');
        if (atIndex <= 1) return "***";
        return email.charAt(0) + "***" + email.substring(atIndex);
    }

    public static String maskCard(String cardNumber) {
        if (cardNumber.length() < 4) return "****";
        return "****-****-****-" + cardNumber.substring(cardNumber.length() - 4);
    }

    public static String maskToken(String token) {
        if (token.length() < 8) return "***";
        return token.substring(0, 4) + "..." + token.substring(token.length() - 4);
    }
}
```

### Logback Pattern Masker

```xml
<encoder class="net.logstash.logback.encoder.LogstashEncoder">
    <jsonGeneratorDecorator
        class="net.logstash.logback.mask.MaskJsonGeneratorDecorator">
        <valueMask>
            <value>"password"\s*:\s*"[^"]*"</value>
            <mask>"password":"****"</mask>
        </valueMask>
        <valueMask>
            <value>"ssn"\s*:\s*"[^"]*"</value>
            <mask>"ssn":"***-**-****"</mask>
        </valueMask>
    </jsonGeneratorDecorator>
</encoder>
```

## Dynamic Log Level Changes

Change log levels at runtime without restarting:

```yaml
management:
  endpoints:
    web:
      exposure:
        include: loggers
```

```bash
# View current log level
curl http://localhost:8080/actuator/loggers/com.example.service

# Change log level at runtime
curl -X POST http://localhost:8080/actuator/loggers/com.example.service \
  -H "Content-Type: application/json" \
  -d '{"configuredLevel": "DEBUG"}'

# Reset to default
curl -X POST http://localhost:8080/actuator/loggers/com.example.service \
  -H "Content-Type: application/json" \
  -d '{"configuredLevel": null}'
```

## Logging Best Practices

| Practice | Rationale |
|----------|-----------|
| Log at the right level | ERROR = something broke. WARN = something is wrong. INFO = notable events. DEBUG = developer detail. |
| Include context | Who (userId), what (orderId), where (correlationId) |
| Structured over unstructured | JSON logs are queryable; text logs are not |
| Never log sensitive data | Passwords, tokens, SSN, full credit card numbers |
| Use MDC for cross-cutting context | Correlation ID propagates without passing parameters |
| Async appenders in production | Never block request threads on log I/O |
| Log exceptions with stack trace | Pass exception as the last argument to `log.error()` |
| Guard expensive debug logging | Use `log.isDebugEnabled()` before computing debug output |
| Rotate and cap log files | Prevent disk exhaustion with `maxFileSize`, `maxHistory`, `totalSizeCap` |

Logging is the foundation of observability. Metrics tell you something is wrong, tracing tells you where, and logs tell you why. Invest in structured logging, correlation IDs, and a proper log aggregation pipeline early — retrofitting them is painful and the cost of flying blind in production is much higher.
