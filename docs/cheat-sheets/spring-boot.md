---
title: "Spring Boot Cheat Sheet"
description: "Complete Spring Boot quick reference — all annotations, common configurations, actuator endpoints, testing shortcuts, Maven/Gradle commands, and production-ready patterns in one page."
tags: [spring-boot, cheat-sheet, annotations, reference, java]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-25"
---

# Spring Boot Cheat Sheet

A complete quick reference for Spring Boot 3.x with Java 21. Covers every annotation, configuration property, testing shortcut, and CLI command you need in daily development.

## Core Annotations

### Application Setup

| Annotation | Purpose |
|---|---|
| `@SpringBootApplication` | Entry point. Combines `@Configuration` + `@EnableAutoConfiguration` + `@ComponentScan` |
| `@EnableAutoConfiguration` | Enable Spring Boot auto-configuration |
| `@ComponentScan` | Scan for Spring components in current package and sub-packages |
| `@SpringBootConfiguration` | Variant of `@Configuration` for Spring Boot |

### Stereotype Annotations

| Annotation | Purpose | Special Behavior |
|---|---|---|
| `@Component` | Generic Spring bean | None |
| `@Service` | Business logic bean | None (semantic only) |
| `@Repository` | Data access bean | Exception translation |
| `@Controller` | Web MVC controller | View resolution |
| `@RestController` | REST API controller | = `@Controller` + `@ResponseBody` |
| `@Configuration` | Bean definition class | Proxied for singleton beans |

### Dependency Injection

| Annotation | Purpose |
|---|---|
| `@Autowired` | Inject dependency (optional with single constructor) |
| `@Qualifier("name")` | Disambiguate between multiple beans |
| `@Primary` | Preferred bean when multiple candidates |
| `@Value("${key}")` | Inject property value |
| `@Lazy` | Delay bean initialization until first use |

### Bean Definition

| Annotation | Purpose |
|---|---|
| `@Bean` | Declare a bean in `@Configuration` class |
| `@Scope("prototype")` | Set bean scope (singleton/prototype/request/session) |
| `@Profile("dev")` | Activate bean only in specific profile |
| `@ConditionalOnProperty` | Create bean only if property is set |
| `@ConditionalOnClass` | Create bean only if class exists on classpath |
| `@ConditionalOnMissingBean` | Create bean only if no other bean of that type exists |
| `@ConfigurationProperties` | Bind properties to a POJO/record |

### Lifecycle

| Annotation | Purpose |
|---|---|
| `@PostConstruct` | Run after dependency injection |
| `@PreDestroy` | Run before bean destruction |
| `@EventListener` | Handle application events |
| `@TransactionalEventListener` | Handle events after transaction commit |
| `@Order(1)` | Set bean initialization order |

## Web Annotations

### Request Mapping

| Annotation | HTTP Method |
|---|---|
| `@RequestMapping` | Any (configurable) |
| `@GetMapping` | GET |
| `@PostMapping` | POST |
| `@PutMapping` | PUT |
| `@PatchMapping` | PATCH |
| `@DeleteMapping` | DELETE |

### Request Parameters

| Annotation | Source | Example |
|---|---|---|
| `@PathVariable` | URL path | `/users/{id}` |
| `@RequestParam` | Query string | `?name=foo&page=0` |
| `@RequestBody` | Request body | JSON payload |
| `@RequestHeader` | HTTP header | `Authorization` |
| `@CookieValue` | Cookie | Session cookie |
| `@MatrixVariable` | Matrix params | `/cars;color=red` |

### Response

| Annotation | Purpose |
|---|---|
| `@ResponseBody` | Serialize return value to response body |
| `@ResponseStatus(HttpStatus.CREATED)` | Set HTTP status code |
| `@CrossOrigin` | Enable CORS on controller/method |
| `@ExceptionHandler` | Handle specific exception in controller |
| `@ControllerAdvice` | Global exception handler |
| `@RestControllerAdvice` | = `@ControllerAdvice` + `@ResponseBody` |

## Validation Annotations

| Annotation | Validates |
|---|---|
| `@Valid` | Cascading validation on `@RequestBody` or nested objects |
| `@Validated` | Enables validation on path vars / request params; supports groups |
| `@NotNull` | Not null |
| `@NotBlank` | Not null, not empty, not whitespace (String) |
| `@NotEmpty` | Not null, not empty (String/Collection) |
| `@Size(min, max)` | String length or collection size |
| `@Min(value)` | Numeric >= value |
| `@Max(value)` | Numeric <= value |
| `@Positive` | > 0 |
| `@PositiveOrZero` | >= 0 |
| `@Email` | Valid email format |
| `@Pattern(regexp)` | Matches regex |
| `@Past` / `@Future` | Date before/after now |
| `@DecimalMin` / `@DecimalMax` | BigDecimal range |
| `@Digits(integer, fraction)` | Number precision |

## JPA Annotations

### Entity Mapping

| Annotation | Purpose |
|---|---|
| `@Entity` | JPA entity class |
| `@Table(name = "...")` | Database table name |
| `@Id` | Primary key |
| `@GeneratedValue` | Auto-generated ID (UUID, IDENTITY, SEQUENCE) |
| `@Column` | Column mapping (name, nullable, unique, length) |
| `@Enumerated(EnumType.STRING)` | Enum stored as string |
| `@Lob` | Large object (BLOB/CLOB) |
| `@Temporal` | Date/time precision |
| `@Version` | Optimistic locking |
| `@CreationTimestamp` | Auto-set on insert |
| `@UpdateTimestamp` | Auto-set on update |
| `@Transient` | Not persisted |

### Relationships

| Annotation | Cardinality | Default Fetch |
|---|---|---|
| `@OneToOne` | 1:1 | EAGER |
| `@OneToMany` | 1:N | LAZY |
| `@ManyToOne` | N:1 | **EAGER** (change to LAZY!) |
| `@ManyToMany` | M:N | LAZY |
| `@JoinColumn` | Foreign key column | — |
| `@JoinTable` | Join table for M:N | — |

### Repository

| Annotation | Purpose |
|---|---|
| `@Query("JPQL")` | Custom JPQL query |
| `@Query(nativeQuery = true)` | Native SQL query |
| `@Modifying` | For UPDATE/DELETE queries |
| `@EntityGraph` | Eager fetch specific associations |
| `@Lock(LockModeType.PESSIMISTIC_WRITE)` | Pessimistic locking |

## Security Annotations

| Annotation | Purpose |
|---|---|
| `@EnableWebSecurity` | Enable Spring Security |
| `@EnableMethodSecurity` | Enable `@PreAuthorize`/`@PostAuthorize` |
| `@PreAuthorize("expression")` | Check before method execution |
| `@PostAuthorize("expression")` | Check after method execution |
| `@Secured("ROLE_ADMIN")` | Role-based access (simpler) |
| `@RolesAllowed("ADMIN")` | Jakarta annotation for role check |
| `@AuthenticationPrincipal` | Inject current user |
| `@WithMockUser` | Test with fake user |

## Testing Annotations

| Annotation | Loads | Speed |
|---|---|---|
| `@SpringBootTest` | Full context | Slow |
| `@WebMvcTest(Controller.class)` | Web slice | Fast |
| `@DataJpaTest` | JPA slice | Medium |
| `@JsonTest` | Jackson only | Fast |
| `@WebFluxTest` | WebFlux slice | Fast |
| `@RestClientTest` | RestTemplate | Fast |

| Annotation | Purpose |
|---|---|
| `@MockBean` | Replace bean with Mockito mock |
| `@SpyBean` | Wrap bean with Mockito spy |
| `@ActiveProfiles("test")` | Activate test profile |
| `@DynamicPropertySource` | Set properties from Testcontainers |
| `@Sql("/data.sql")` | Run SQL before test |
| `@Transactional` | Rollback after each test |
| `@Testcontainers` | Enable Testcontainers |
| `@Container` | Mark Testcontainer field |

## Caching Annotations

| Annotation | Purpose |
|---|---|
| `@EnableCaching` | Enable cache abstraction |
| `@Cacheable(value, key)` | Cache method result |
| `@CacheEvict(value, key)` | Remove from cache |
| `@CachePut(value, key)` | Always execute, update cache |
| `@Caching(...)` | Combine multiple cache operations |
| `@CacheConfig(cacheNames)` | Class-level cache defaults |

## Async & Scheduling

| Annotation | Purpose |
|---|---|
| `@EnableAsync` | Enable `@Async` support |
| `@Async` | Run method in background thread |
| `@Async("executorName")` | Use specific thread pool |
| `@EnableScheduling` | Enable `@Scheduled` support |
| `@Scheduled(fixedRate = 5000)` | Run every 5 seconds |
| `@Scheduled(cron = "0 0 2 * * *")` | Run at 2 AM daily |

## Common Configuration

### application.yml Template

```yaml
spring:
  application:
    name: my-app
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:dev}

  # Database
  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:5432/${DB_NAME:myapp}
    username: ${DB_USERNAME:postgres}
    password: ${DB_PASSWORD:postgres}
    hikari:
      maximum-pool-size: ${HIKARI_MAX_POOL:10}
      minimum-idle: 5
      connection-timeout: 30000
      leak-detection-threshold: 60000

  # JPA
  jpa:
    hibernate:
      ddl-auto: validate
    open-in-view: false
    properties:
      hibernate:
        default_batch_fetch_size: 25
        format_sql: true
        jdbc.batch_size: 25
        order_inserts: true
        order_updates: true

  # Jackson
  jackson:
    default-property-inclusion: non_null
    serialization:
      write-dates-as-timestamps: false

  # Flyway
  flyway:
    enabled: true
    locations: classpath:db/migration
    clean-disabled: true

# Server
server:
  port: ${SERVER_PORT:8080}
  shutdown: graceful
  error:
    include-message: always
    include-binding-errors: always

# Actuator
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: when_authorized
      probes:
        enabled: true

# Logging
logging:
  level:
    root: WARN
    com.example: INFO
    org.hibernate.SQL: ${SQL_LOG_LEVEL:WARN}
  pattern:
    console: "%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n"
```

## Maven Commands

```bash
# Run application
./mvnw spring-boot:run

# Run with profile
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# Run tests
./mvnw test

# Skip tests
./mvnw package -DskipTests

# Build JAR
./mvnw clean package

# Build native image
./mvnw -Pnative native:compile

# Build Docker image (Buildpacks)
./mvnw spring-boot:build-image

# Build Docker image (JIB)
./mvnw jib:dockerBuild

# Dependency tree
./mvnw dependency:tree

# Check for dependency updates
./mvnw versions:display-dependency-updates

# Generate project from Initializr
curl https://start.spring.io/starter.tgz \
  -d type=maven-project -d language=java \
  -d bootVersion=3.4.3 -d javaVersion=21 \
  -d dependencies=web,data-jpa,postgresql,validation,actuator,lombok \
  -d groupId=com.example -d artifactId=my-app | tar -xzvf -
```

## Gradle Commands

```bash
# Run application
./gradlew bootRun

# Run with profile
SPRING_PROFILES_ACTIVE=dev ./gradlew bootRun

# Run tests
./gradlew test

# Build JAR
./gradlew bootJar

# Build native image
./gradlew nativeCompile

# Build Docker image
./gradlew bootBuildImage

# Dependency report
./gradlew dependencies --configuration runtimeClasspath
```

## Actuator Endpoints

```bash
# Health check
curl http://localhost:8080/actuator/health

# Application info
curl http://localhost:8080/actuator/info

# List all metrics
curl http://localhost:8080/actuator/metrics

# Specific metric
curl http://localhost:8080/actuator/metrics/jvm.memory.used

# Prometheus format
curl http://localhost:8080/actuator/prometheus

# View log levels
curl http://localhost:8080/actuator/loggers/com.example

# Change log level at runtime
curl -X POST http://localhost:8080/actuator/loggers/com.example \
     -H 'Content-Type: application/json' -d '{"configuredLevel":"DEBUG"}'

# Environment properties
curl http://localhost:8080/actuator/env
```

## HTTP Status Code Quick Reference

| Code | Constant | When to Use |
|---|---|---|
| 200 | `OK` | Successful GET, PUT, PATCH |
| 201 | `CREATED` | Successful POST (resource created) |
| 204 | `NO_CONTENT` | Successful DELETE |
| 400 | `BAD_REQUEST` | Validation errors, malformed request |
| 401 | `UNAUTHORIZED` | Authentication required |
| 403 | `FORBIDDEN` | Authenticated but not authorized |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate resource (e.g., duplicate email) |
| 422 | `UNPROCESSABLE_ENTITY` | Business rule violation |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected server error |
| 502 | `BAD_GATEWAY` | External service error |
| 503 | `SERVICE_UNAVAILABLE` | Service temporarily down |

## Common Spring Boot Starters

| Starter | Includes |
|---|---|
| `spring-boot-starter-web` | Spring MVC, Tomcat, Jackson |
| `spring-boot-starter-data-jpa` | Hibernate, HikariCP, Spring Data JPA |
| `spring-boot-starter-security` | Spring Security |
| `spring-boot-starter-validation` | Hibernate Validator |
| `spring-boot-starter-actuator` | Health, metrics, info endpoints |
| `spring-boot-starter-cache` | Caching abstraction |
| `spring-boot-starter-mail` | Email sending |
| `spring-boot-starter-webflux` | Reactive web (Netty) |
| `spring-boot-starter-data-redis` | Redis client |
| `spring-boot-starter-oauth2-resource-server` | JWT validation |
| `spring-boot-starter-oauth2-client` | OAuth2 login |
| `spring-boot-starter-test` | JUnit 5, Mockito, MockMvc, AssertJ |
| `spring-boot-starter-hateoas` | HATEOAS links |
| `spring-boot-starter-batch` | Batch processing |

## Quick Patterns

### Constructor Injection (Lombok)

```java
@Service
@RequiredArgsConstructor  // Generates constructor for final fields
public class OrderService {
    private final OrderRepository orderRepository;
    private final PaymentGateway paymentGateway;
}
```

### Record DTO with Validation

```java
public record CreateUserRequest(
        @NotBlank @Email String email,
        @NotBlank @Size(min = 8) String password,
        @NotBlank String firstName
) {}
```

### Paginated Endpoint

```java
@GetMapping
public Page<ProductResponse> list(
        @PageableDefault(size = 20, sort = "createdAt",
                direction = Sort.Direction.DESC) Pageable pageable) {
    return productService.findAll(pageable);
}
```

### Global Exception Handler (Minimal)

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleNotFound(ResourceNotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleAll(Exception ex) {
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred");
    }
}
```

## Further Reading

- **[Spring Boot Overview](../spring-boot/)** — Getting started with Spring Boot
- **[Core Concepts](../spring-boot/core-concepts)** — IoC, DI, and bean lifecycle
- **[REST API Development](../spring-boot/rest-api)** — Building production APIs
- **[Best Practices](../spring-boot/best-practices)** — Patterns and anti-patterns

---

::: details Test Yourself
1. **What annotation combines `@Controller` and `@ResponseBody`?**
   `@RestController`

2. **How do you inject a property value from `application.yml` into a field?**
   `@Value("${property.key}")`

3. **What annotation activates a bean only in a specific profile?**
   `@Profile("dev")`

4. **What is the default fetch type for `@ManyToOne` in JPA, and why is it problematic?**
   EAGER -- it loads the related entity on every query, causing N+1 problems. Change to `fetch = FetchType.LAZY`.

5. **What test slice annotation loads only the web layer for a specific controller?**
   `@WebMvcTest(Controller.class)`

6. **How do you change the log level of a package at runtime via Actuator?**
   `curl -X POST .../actuator/loggers/com.example -H 'Content-Type: application/json' -d '{"configuredLevel":"DEBUG"}'`

7. **What annotation makes a bean initialize only after another specific bean exists?**
   `@ConditionalOnMissingBean` (creates only if no other bean of that type exists).

8. **What HTTP status should a successful POST that creates a resource return?**
   `201 CREATED`

9. **How do you build a Docker image from a Spring Boot project using Buildpacks?**
   `./mvnw spring-boot:build-image`

10. **What annotation enables method-level security like `@PreAuthorize`?**
    `@EnableMethodSecurity`
:::

::: danger Common Gotchas
- **`spring.jpa.open-in-view=true` (default).** It keeps the Hibernate session open during the entire HTTP request, which hides lazy loading issues in development but causes performance problems in production. Set it to `false`.
- **`@ManyToOne` defaults to EAGER fetch.** Every time you load an entity, JPA also loads the related entity. Always set `fetch = FetchType.LAZY` on `@ManyToOne`.
- **Using `@Autowired` on fields instead of constructor injection.** Field injection makes testing harder and hides dependencies. Use `@RequiredArgsConstructor` with `final` fields.
- **`ddl-auto=update` in production.** Hibernate's schema auto-update can drop columns or create wrong indexes. Use `validate` in production with Flyway or Liquibase for migrations.
:::

## One-Liner Summary

Spring Boot is an opinionated Java framework that auto-configures everything -- master annotations, profiles, Actuator, and test slices to build production-ready APIs with minimal boilerplate.
