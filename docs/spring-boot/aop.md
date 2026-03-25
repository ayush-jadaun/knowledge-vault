---
title: "AOP (Aspect-Oriented Programming)"
description: "Complete guide to Aspect-Oriented Programming in Spring Boot — @Aspect with @Before, @After, @Around advice, pointcut expressions, logging aspects, performance monitoring, audit trails, retry logic, transaction management, and testing aspects"
tags: [spring-boot, aop, aspects, cross-cutting, java]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# AOP (Aspect-Oriented Programming)

Some concerns do not fit neatly into a single class or method. Logging, security checks, performance monitoring, transaction management, retry logic, and audit trails cut across multiple classes and layers. Without AOP, you end up duplicating the same boilerplate in dozens of methods:

```java
// Without AOP — logging duplicated everywhere
public Order createOrder(OrderRequest request) {
    long start = System.nanoTime();
    log.info("createOrder called with {}", request);
    try {
        Order result = doCreateOrder(request);
        log.info("createOrder completed in {}ms",
                (System.nanoTime() - start) / 1_000_000);
        return result;
    } catch (Exception e) {
        log.error("createOrder failed", e);
        throw e;
    }
}
```

AOP solves this by letting you define cross-cutting behavior in one place (an **aspect**) and apply it declaratively to methods across your application. Spring AOP uses runtime proxies — it wraps your beans in proxy objects that execute advice (the cross-cutting logic) before, after, or around your method calls.

## Core Concepts

```
┌──────────────────────────────────────────────────────────────┐
│                        Aspect                                 │
│  A class annotated with @Aspect that contains                │
│  cross-cutting concerns (logging, security, etc.)            │
│                                                               │
│  ┌──────────────────────┐    ┌──────────────────────────┐    │
│  │     Pointcut          │    │       Advice              │   │
│  │  WHERE to apply       │    │  WHAT to do               │   │
│  │                       │    │                            │   │
│  │  "execution(* com.    │    │  @Before — run before      │   │
│  │   example.service.    │    │  @After — run after         │   │
│  │   *.*(..))"           │    │  @Around — wrap method     │   │
│  │                       │    │  @AfterReturning — on      │   │
│  │                       │    │    success                  │   │
│  │                       │    │  @AfterThrowing — on       │   │
│  │                       │    │    exception                │   │
│  └──────────────────────┘    └──────────────────────────┘    │
│                                                               │
│  Join Point: A specific method execution where advice applies │
└──────────────────────────────────────────────────────────────┘
```

## Setup

Spring Boot auto-configures AOP with:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-aop</artifactId>
</dependency>
```

## Pointcut Expressions

Pointcuts define **where** advice applies. The expression language is powerful:

```java
@Aspect
@Component
public class PointcutDefinitions {

    // Match all methods in a specific class
    @Pointcut("execution(* com.example.service.OrderService.*(..))")
    public void orderServiceMethods() {}

    // Match all methods in the service package
    @Pointcut("execution(* com.example.service.*.*(..))")
    public void allServiceMethods() {}

    // Match all public methods
    @Pointcut("execution(public * *(..))")
    public void allPublicMethods() {}

    // Match methods with a specific return type
    @Pointcut("execution(com.example.model.Order com.example.service.*.*(..))")
    public void methodsReturningOrder() {}

    // Match methods with specific annotations
    @Pointcut("@annotation(com.example.annotation.Audited)")
    public void auditedMethods() {}

    // Match all methods in classes annotated with @Service
    @Pointcut("@within(org.springframework.stereotype.Service)")
    public void serviceBeans() {}

    // Match methods with specific parameter types
    @Pointcut("execution(* com.example.service.*.*(String, ..))")
    public void methodsWithStringFirstParam() {}

    // Combine pointcuts with logical operators
    @Pointcut("allServiceMethods() && !orderServiceMethods()")
    public void nonOrderServiceMethods() {}

    // Match by bean name
    @Pointcut("bean(*Service)")
    public void allServiceBeans() {}

    // Match any subpackage
    @Pointcut("execution(* com.example..*.*(..))")
    public void anyMethodInApplication() {}
}
```

## Advice Types

### @Before

Runs before the target method. Cannot prevent method execution (unless it throws):

```java
@Aspect
@Component
@Slf4j
public class ValidationAspect {

    @Before("execution(* com.example.service.*.create*(..)) && args(request,..)")
    public void validateCreateRequest(JoinPoint joinPoint, Object request) {
        log.debug("Validating create request: {} for {}",
                request.getClass().getSimpleName(),
                joinPoint.getSignature().getName());

        if (request == null) {
            throw new IllegalArgumentException("Request cannot be null");
        }
    }
}
```

### @AfterReturning

Runs after successful method return. Has access to the return value:

```java
@Aspect
@Component
@Slf4j
public class ResponseLoggingAspect {

    @AfterReturning(
            pointcut = "execution(* com.example.controller.*.*(..))",
            returning = "result")
    public void logResponse(JoinPoint joinPoint, Object result) {
        log.info("Method {} returned: {}",
                joinPoint.getSignature().toShortString(),
                summarize(result));
    }

    private String summarize(Object result) {
        if (result == null) return "null";
        if (result instanceof Collection<?> c) return "Collection[size=" + c.size() + "]";
        if (result instanceof ResponseEntity<?> r) return "ResponseEntity[status=" + r.getStatusCode() + "]";
        return result.toString();
    }
}
```

### @AfterThrowing

Runs when the method throws an exception:

```java
@Aspect
@Component
@Slf4j
public class ExceptionLoggingAspect {

    @AfterThrowing(
            pointcut = "execution(* com.example.service.*.*(..))",
            throwing = "ex")
    public void logException(JoinPoint joinPoint, Exception ex) {
        log.error("Exception in {}.{}: {} - {}",
                joinPoint.getTarget().getClass().getSimpleName(),
                joinPoint.getSignature().getName(),
                ex.getClass().getSimpleName(),
                ex.getMessage());
    }
}
```

### @After

Runs after the method regardless of outcome (like `finally`):

```java
@Aspect
@Component
public class ResourceCleanupAspect {

    @After("execution(* com.example.service.FileProcessingService.*(..))")
    public void cleanup(JoinPoint joinPoint) {
        log.debug("Cleaning up after {}",
                joinPoint.getSignature().getName());
        TempFileContext.cleanup();
    }
}
```

### @Around (Most Powerful)

Wraps the method execution. Can modify arguments, suppress the call, modify the return value, or handle exceptions:

```java
@Aspect
@Component
@Slf4j
public class PerformanceMonitoringAspect {

    private final MeterRegistry meterRegistry;

    public PerformanceMonitoringAspect(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Around("@within(org.springframework.stereotype.Service)")
    public Object measureExecutionTime(ProceedingJoinPoint joinPoint) throws Throwable {
        String className = joinPoint.getTarget().getClass().getSimpleName();
        String methodName = joinPoint.getSignature().getName();
        String metricName = "method.execution.time";

        Timer.Sample sample = Timer.start(meterRegistry);

        try {
            Object result = joinPoint.proceed();  // Execute the actual method

            sample.stop(Timer.builder(metricName)
                    .tag("class", className)
                    .tag("method", methodName)
                    .tag("outcome", "success")
                    .register(meterRegistry));

            return result;
        } catch (Throwable t) {
            sample.stop(Timer.builder(metricName)
                    .tag("class", className)
                    .tag("method", methodName)
                    .tag("outcome", "error")
                    .tag("exception", t.getClass().getSimpleName())
                    .register(meterRegistry));
            throw t;
        }
    }
}
```

## Practical Aspects

### Logging Aspect with MDC

```java
@Aspect
@Component
@Slf4j
public class LoggingAspect {

    @Around("execution(* com.example.controller.*.*(..))")
    public Object logControllerCall(ProceedingJoinPoint joinPoint) throws Throwable {
        HttpServletRequest request = getCurrentHttpRequest();
        String requestId = UUID.randomUUID().toString().substring(0, 8);

        MDC.put("requestId", requestId);
        MDC.put("method", request != null ? request.getMethod() : "N/A");
        MDC.put("path", request != null ? request.getRequestURI() : "N/A");

        String methodSignature = joinPoint.getSignature().toShortString();
        Object[] args = joinPoint.getArgs();

        log.info("→ {} args={}", methodSignature, sanitizeArgs(args));

        long start = System.nanoTime();
        try {
            Object result = joinPoint.proceed();
            long duration = (System.nanoTime() - start) / 1_000_000;

            log.info("← {} returned in {}ms", methodSignature, duration);
            return result;
        } catch (Throwable t) {
            long duration = (System.nanoTime() - start) / 1_000_000;
            log.error("✗ {} failed in {}ms: {}", methodSignature, duration,
                    t.getMessage());
            throw t;
        } finally {
            MDC.clear();
        }
    }

    private Object[] sanitizeArgs(Object[] args) {
        return Arrays.stream(args)
                .map(arg -> {
                    if (arg instanceof MultipartFile f) {
                        return "MultipartFile[name=" + f.getOriginalFilename()
                                + ",size=" + f.getSize() + "]";
                    }
                    if (arg instanceof HttpServletRequest) return "[HttpServletRequest]";
                    if (arg instanceof HttpServletResponse) return "[HttpServletResponse]";
                    return arg;
                })
                .toArray();
    }

    private HttpServletRequest getCurrentHttpRequest() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes sra) {
            return sra.getRequest();
        }
        return null;
    }
}
```

### Audit Trail Aspect

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Audited {
    String action();
    String resourceType() default "";
}

@Aspect
@Component
public class AuditAspect {

    private final AuditLogRepository auditLogRepo;

    @Around("@annotation(audited)")
    public Object audit(ProceedingJoinPoint joinPoint, Audited audited) throws Throwable {
        String userId = getCurrentUserId();
        String action = audited.action();
        String resourceType = audited.resourceType().isEmpty()
                ? inferResourceType(joinPoint)
                : audited.resourceType();

        Instant startTime = Instant.now();
        Object result = null;
        Exception exception = null;

        try {
            result = joinPoint.proceed();
            return result;
        } catch (Exception e) {
            exception = e;
            throw e;
        } finally {
            AuditLog log = new AuditLog();
            log.setUserId(userId);
            log.setAction(action);
            log.setResourceType(resourceType);
            log.setResourceId(extractResourceId(joinPoint.getArgs(), result));
            log.setTimestamp(startTime);
            log.setDurationMs(Duration.between(startTime, Instant.now()).toMillis());
            log.setSuccess(exception == null);
            log.setErrorMessage(exception != null ? exception.getMessage() : null);
            log.setIpAddress(getClientIp());
            log.setRequestDetails(serializeArgs(joinPoint.getArgs()));

            auditLogRepo.save(log);
        }
    }

    private String inferResourceType(ProceedingJoinPoint joinPoint) {
        String className = joinPoint.getTarget().getClass().getSimpleName();
        return className.replace("Service", "").replace("Controller", "");
    }

    private String extractResourceId(Object[] args, Object result) {
        // Try to extract ID from arguments or result
        for (Object arg : args) {
            if (arg instanceof String s && looksLikeId(s)) return s;
            if (arg instanceof Long l) return l.toString();
        }
        if (result != null) {
            try {
                Method getId = result.getClass().getMethod("getId");
                Object id = getId.invoke(result);
                return id != null ? id.toString() : null;
            } catch (Exception ignored) {}
        }
        return null;
    }
}
```

Usage:

```java
@Service
public class UserService {

    @Audited(action = "CREATE_USER", resourceType = "User")
    public User createUser(CreateUserRequest request) {
        // ...
    }

    @Audited(action = "DELETE_USER", resourceType = "User")
    public void deleteUser(String userId) {
        // ...
    }

    @Audited(action = "UPDATE_ROLE")
    public User updateRole(String userId, String newRole) {
        // ...
    }
}
```

### Retry Aspect

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Retryable {
    int maxAttempts() default 3;
    long delayMs() default 1000;
    double backoffMultiplier() default 2.0;
    Class<? extends Throwable>[] retryOn() default {Exception.class};
}

@Aspect
@Component
@Slf4j
public class RetryAspect {

    @Around("@annotation(retryable)")
    public Object retry(ProceedingJoinPoint joinPoint, Retryable retryable)
            throws Throwable {

        int maxAttempts = retryable.maxAttempts();
        long delay = retryable.delayMs();
        Class<? extends Throwable>[] retryOn = retryable.retryOn();

        Throwable lastException = null;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return joinPoint.proceed();
            } catch (Throwable t) {
                lastException = t;
                boolean shouldRetry = Arrays.stream(retryOn)
                        .anyMatch(cls -> cls.isInstance(t));

                if (!shouldRetry || attempt == maxAttempts) {
                    log.error("Method {} failed after {} attempts",
                            joinPoint.getSignature().toShortString(), attempt, t);
                    throw t;
                }

                log.warn("Method {} attempt {}/{} failed: {}. Retrying in {}ms...",
                        joinPoint.getSignature().toShortString(),
                        attempt, maxAttempts,
                        t.getMessage(), delay);

                Thread.sleep(delay);
                delay = (long) (delay * retryable.backoffMultiplier());
            }
        }

        throw lastException;
    }
}
```

### Caching Aspect with TTL

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface CacheResult {
    String cacheName();
    String keyExpression();  // SpEL expression
    int ttlSeconds() default 300;
}

@Aspect
@Component
public class CachingAspect {

    private final CacheManager cacheManager;
    private final SpelExpressionParser parser = new SpelExpressionParser();

    @Around("@annotation(cacheResult)")
    public Object cacheResult(ProceedingJoinPoint joinPoint,
                               CacheResult cacheResult) throws Throwable {
        String cacheName = cacheResult.cacheName();
        String key = evaluateKey(cacheResult.keyExpression(), joinPoint);

        Cache cache = cacheManager.getCache(cacheName);
        if (cache != null) {
            Cache.ValueWrapper cached = cache.get(key);
            if (cached != null) {
                return cached.get();
            }
        }

        Object result = joinPoint.proceed();

        if (cache != null && result != null) {
            cache.put(key, result);
        }

        return result;
    }

    private String evaluateKey(String expression, ProceedingJoinPoint joinPoint) {
        MethodSignature sig = (MethodSignature) joinPoint.getSignature();
        StandardEvaluationContext context = new StandardEvaluationContext();

        String[] paramNames = sig.getParameterNames();
        Object[] args = joinPoint.getArgs();
        for (int i = 0; i < paramNames.length; i++) {
            context.setVariable(paramNames[i], args[i]);
        }

        return parser.parseExpression(expression).getValue(context, String.class);
    }
}
```

## Aspect Ordering

When multiple aspects apply to the same method, `@Order` controls execution sequence:

```java
@Aspect
@Component
@Order(1)  // Outermost — runs first on the way in, last on the way out
public class SecurityAspect { /* ... */ }

@Aspect
@Component
@Order(2)
public class LoggingAspect { /* ... */ }

@Aspect
@Component
@Order(3)  // Innermost — runs last before the actual method
public class TransactionAspect { /* ... */ }

/*
Execution order:
    SecurityAspect.before()
        LoggingAspect.before()
            TransactionAspect.before()
                actual method()
            TransactionAspect.after()
        LoggingAspect.after()
    SecurityAspect.after()
*/
```

## Spring AOP Limitations

| Limitation | Explanation | Workaround |
|-----------|-------------|------------|
| Self-invocation | Calling `this.method()` bypasses proxy | Inject the bean into itself, or use `AopContext.currentProxy()` |
| Private methods | Cannot intercept private methods | Make the method package-private or use AspectJ weaving |
| Final classes/methods | Cannot proxy final classes | Remove `final`, or use AspectJ |
| Field access | Cannot intercept field reads/writes | Use AspectJ for field-level pointcuts |
| Constructor calls | Cannot intercept constructors | Use `@PostConstruct` or factory methods |

### The Self-Invocation Trap

```java
@Service
public class OrderService {

    @Transactional  // This works — called through proxy
    public Order createOrder(OrderRequest request) {
        // ...
        this.notifyCustomer(order);  // This BYPASSES the proxy!
        return order;
    }

    @Async  // This annotation has NO effect when called via this.
    public void notifyCustomer(Order order) {
        // Runs synchronously because the proxy is bypassed
    }
}

// Fix: inject the proxy
@Service
public class OrderService {

    @Lazy
    @Autowired
    private OrderService self;  // Inject proxy

    @Transactional
    public Order createOrder(OrderRequest request) {
        // ...
        self.notifyCustomer(order);  // Goes through proxy
        return order;
    }

    @Async
    public void notifyCustomer(Order order) {
        // Now runs asynchronously
    }
}
```

## Testing Aspects

```java
@SpringBootTest
class AuditAspectTest {

    @Autowired
    private UserService userService;

    @Autowired
    private AuditLogRepository auditLogRepo;

    @Test
    void shouldCreateAuditLogOnUserCreation() {
        CreateUserRequest request = new CreateUserRequest("testuser", "test@example.com");

        userService.createUser(request);

        List<AuditLog> logs = auditLogRepo.findByAction("CREATE_USER");
        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).getResourceType()).isEqualTo("User");
        assertThat(logs.get(0).isSuccess()).isTrue();
    }

    @Test
    void shouldRecordFailedOperation() {
        assertThatThrownBy(() -> userService.deleteUser("nonexistent"))
                .isInstanceOf(UserNotFoundException.class);

        List<AuditLog> logs = auditLogRepo.findByAction("DELETE_USER");
        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).isSuccess()).isFalse();
        assertThat(logs.get(0).getErrorMessage()).contains("not found");
    }
}
```

AOP is powerful but invisible — aspects execute without any visible call in the business code. Use it for genuinely cross-cutting concerns (logging, security, monitoring, transactions), not for business logic. When debugging, remember that aspects wrap your methods in proxy layers. Too many aspects create "magic" that makes code hard to follow. The rule of thumb: if someone reading the business code needs to understand the aspect to understand the business behavior, the aspect is in the wrong place.
