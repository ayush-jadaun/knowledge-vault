---
title: "Migration Guide"
description: "Complete guide to migrating Spring Boot 2 to 3 — Jakarta EE namespace migration, Java 17 and 21 feature adoption, dependency upgrades, property changes, security configuration changes, common breaking changes, testing strategy, and step-by-step migration plan"
tags: [spring-boot, migration, jakarta, java-21, upgrade]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Migration Guide

Migrating from Spring Boot 2.x to 3.x is the largest breaking change in Spring Boot's history. The primary driver is the move from Java EE (`javax.*`) to Jakarta EE (`jakarta.*`), but the migration also brings mandatory Java 17+, overhauled security configuration, removed deprecated APIs, and updated third-party dependencies. This is not a simple version bump — it requires systematic code changes, dependency updates, and thorough testing.

The good news: Spring Boot 3.x brings substantial improvements — native image support, virtual threads (Java 21), improved observability with Micrometer, and better performance. The migration effort pays for itself.

## Migration Overview

```
Spring Boot 2.7.x                    Spring Boot 3.x
─────────────────                    ───────────────
Java 8-17                        →   Java 17+ (21 recommended)
javax.* packages                 →   jakarta.* packages
Spring Security 5.x              →   Spring Security 6.x
Spring Framework 5.x             →   Spring Framework 6.x
Hibernate 5.x                    →   Hibernate 6.x
Tomcat 9.x                       →   Tomcat 10.x
Jetty 9/10.x                     →   Jetty 11/12.x
Properties deprecated in 2.x     →   Removed in 3.x
WebSecurityConfigurerAdapter      →   SecurityFilterChain (lambda DSL)
```

## Step-by-Step Migration Plan

### Phase 1: Prepare on Spring Boot 2.7

Before jumping to 3.x, update to the latest 2.7.x and fix all deprecation warnings:

```xml
<!-- Start from latest 2.7.x -->
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>2.7.18</version>
</parent>
```

1. Fix all deprecation warnings (they become errors in 3.x)
2. Migrate security config to lambda DSL (works in both 2.7 and 3.x)
3. Update third-party dependencies to Jakarta-compatible versions
4. Ensure tests pass with no warnings

### Phase 2: Java 17 Minimum

Spring Boot 3.x requires Java 17. Update your build:

```xml
<properties>
    <java.version>21</java.version>  <!-- 17 minimum, 21 recommended -->
</properties>
```

```groovy
java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}
```

### Phase 3: Jakarta EE Namespace Migration

The most pervasive change. Every `javax.*` import for Jakarta EE APIs becomes `jakarta.*`:

```java
// BEFORE (javax.*)
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Email;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.annotation.PostConstruct;
import javax.inject.Inject;
import javax.transaction.Transactional;
import javax.mail.MessagingException;
import javax.websocket.Session;

// AFTER (jakarta.*)
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Email;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.annotation.PostConstruct;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.mail.MessagingException;
import jakarta.websocket.Session;
```

**Important:** Not all `javax.*` packages changed. These stay as `javax.*`:
- `javax.sql.*` (JDBC)
- `javax.crypto.*` (JCA)
- `javax.net.*` (SSL)
- `javax.swing.*` (UI)
- `javax.management.*` (JMX)

### Automated Migration Tools

```bash
# OpenRewrite — automated code transformation
# Add to pom.xml:
```

```xml
<plugin>
    <groupId>org.openrewrite.maven</groupId>
    <artifactId>rewrite-maven-plugin</artifactId>
    <version>5.34.0</version>
    <configuration>
        <activeRecipes>
            <recipe>org.openrewrite.java.spring.boot3.UpgradeSpringBoot_3_3</recipe>
        </activeRecipes>
    </configuration>
    <dependencies>
        <dependency>
            <groupId>org.openrewrite.recipe</groupId>
            <artifactId>rewrite-spring</artifactId>
            <version>5.13.0</version>
        </dependency>
    </dependencies>
</plugin>
```

```bash
# Run the migration
./mvnw rewrite:run

# Or dry-run first to see what would change
./mvnw rewrite:dryRun
```

OpenRewrite handles:
- `javax.*` to `jakarta.*` imports
- Deprecated API replacements
- Configuration property renames
- Security DSL migration

### IntelliJ Migration

IntelliJ IDEA has built-in support:
1. Refactor > Migrate Packages and Classes
2. Select "javax to jakarta" migration
3. Review and apply changes

### Phase 4: Spring Boot 3.x Upgrade

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.0</version>
</parent>
```

## Security Configuration Changes

The biggest API change. `WebSecurityConfigurerAdapter` is removed entirely:

```java
// BEFORE (Spring Boot 2.x) — REMOVED
@Configuration
@EnableWebSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {

    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.authorizeRequests()
                .antMatchers("/api/public/**").permitAll()
                .antMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
                .and()
            .httpBasic()
                .and()
            .csrf().disable();
    }

    @Override
    protected void configure(AuthenticationManagerBuilder auth) throws Exception {
        auth.userDetailsService(userDetailsService)
            .passwordEncoder(passwordEncoder());
    }

    @Bean
    @Override
    public AuthenticationManager authenticationManagerBean() throws Exception {
        return super.authenticationManagerBean();
    }
}
```

```java
// AFTER (Spring Boot 3.x) — Lambda DSL
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/public/**").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .httpBasic(Customizer.withDefaults())
                .csrf(csrf -> csrf.disable())
                .build();
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public UserDetailsService userDetailsService() {
        return username -> userRepository.findByUsername(username)
                .map(CustomUserDetails::new)
                .orElseThrow(() -> new UsernameNotFoundException(username));
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

### Key Security API Changes

| Spring Boot 2.x | Spring Boot 3.x |
|------------------|-----------------|
| `WebSecurityConfigurerAdapter` | `SecurityFilterChain` bean |
| `.authorizeRequests()` | `.authorizeHttpRequests()` |
| `.antMatchers()` | `.requestMatchers()` |
| `.mvcMatchers()` | `.requestMatchers()` |
| `.access("hasRole('ADMIN')")` | `.hasRole("ADMIN")` |
| `@EnableGlobalMethodSecurity` | `@EnableMethodSecurity` |
| `@WithMockUser` | Same (unchanged) |

## Hibernate 6 Changes

### HQL/JPQL Changes

```java
// BEFORE (Hibernate 5) — implicit joins worked
@Query("SELECT u FROM User u WHERE u.address.city = :city")

// AFTER (Hibernate 6) — explicit joins often needed
@Query("SELECT u FROM User u JOIN u.address a WHERE a.city = :city")
```

### ID Generation

```java
// BEFORE (Hibernate 5) — GenerationType.AUTO used native strategy
@Id
@GeneratedValue(strategy = GenerationType.AUTO)
private Long id;

// AFTER (Hibernate 6) — AUTO uses sequence by default
// If you need identity columns:
@Id
@GeneratedValue(strategy = GenerationType.IDENTITY)
private Long id;
```

### Type Mapping Changes

```yaml
# Hibernate 6 requires explicit timezone handling
spring:
  jpa:
    properties:
      hibernate:
        timezone:
          default_storage: NORMALIZE_UTC
```

### Removed Features

| Hibernate 5 | Hibernate 6 |
|-------------|-------------|
| `@Type(type = "json")` | `@JdbcTypeCode(SqlTypes.JSON)` |
| `hibernate.id.new_generator_mappings` | Always true (removed) |
| `NamingStrategy` | `PhysicalNamingStrategy` (already preferred) |
| Criteria API (legacy) | Use JPA Criteria API |

## Property Changes

### Renamed Properties

```yaml
# BEFORE (2.x)                          AFTER (3.x)
spring.redis.host                    →   spring.data.redis.host
spring.redis.port                    →   spring.data.redis.port
spring.elasticsearch.rest.uris       →   spring.elasticsearch.uris
server.max-http-header-size          →   server.max-http-request-header-size
spring.flyway.check-location         →   (removed, always checked)
management.metrics.export.*          →   management.*.metrics.export.*
```

### Removed Properties

```yaml
# These properties no longer exist in 3.x
spring.config.use-legacy-processing  # Removed (legacy processing gone)
spring.mvc.ignore-default-model-on-redirect  # Always true
spring.data.jpa.repositories.bootstrap-mode  # Use spring.data.jpa.repositories.enabled
```

## Dependency Updates

### Common Third-Party Dependencies

| Library | Spring Boot 2.x | Spring Boot 3.x |
|---------|-----------------|-----------------|
| Swagger/SpringFox | `springfox-boot-starter` 3.x | `springdoc-openapi-starter-webmvc-ui` 2.x |
| Querydsl | querydsl-jpa (javax) | `querydsl-jpa:5.1.0:jakarta` classifier |
| Flyway | 8.x | 9.x+ (breaking changes in API) |
| Liquibase | 4.x | 4.x (compatible) |
| MapStruct | 1.5.x | 1.5.x (compatible) |
| Lombok | 1.18.x | 1.18.x (compatible) |

### Querydsl Migration

```xml
<!-- BEFORE -->
<dependency>
    <groupId>com.querydsl</groupId>
    <artifactId>querydsl-jpa</artifactId>
</dependency>

<!-- AFTER — add jakarta classifier -->
<dependency>
    <groupId>com.querydsl</groupId>
    <artifactId>querydsl-jpa</artifactId>
    <version>5.1.0</version>
    <classifier>jakarta</classifier>
</dependency>
```

### Swagger Migration

```xml
<!-- BEFORE — SpringFox (no longer maintained) -->
<dependency>
    <groupId>io.springfox</groupId>
    <artifactId>springfox-boot-starter</artifactId>
    <version>3.0.0</version>
</dependency>

<!-- AFTER — springdoc-openapi -->
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.5.0</version>
</dependency>
```

## Java 17 and 21 Feature Adoption

### Records (Java 17)

```java
// BEFORE: POJO with Lombok or manual getters
@Data
@AllArgsConstructor
public class UserResponse {
    private String id;
    private String email;
    private String displayName;
}

// AFTER: Record
public record UserResponse(
    String id,
    String email,
    String displayName
) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName());
    }
}
```

### Sealed Classes (Java 17)

```java
public sealed interface PaymentResult
        permits PaymentResult.Success,
                PaymentResult.Declined,
                PaymentResult.Error {

    record Success(String transactionId, BigDecimal amount) implements PaymentResult {}
    record Declined(String reason) implements PaymentResult {}
    record Error(String errorCode, String message) implements PaymentResult {}
}
```

### Pattern Matching (Java 21)

```java
// BEFORE
if (event instanceof OrderPlacedEvent) {
    OrderPlacedEvent placed = (OrderPlacedEvent) event;
    processOrderPlaced(placed);
} else if (event instanceof OrderCancelledEvent) {
    OrderCancelledEvent cancelled = (OrderCancelledEvent) event;
    processOrderCancelled(cancelled);
}

// AFTER — pattern matching with switch
switch (event) {
    case OrderPlacedEvent placed -> processOrderPlaced(placed);
    case OrderCancelledEvent cancelled -> processOrderCancelled(cancelled);
    case OrderShippedEvent shipped -> processOrderShipped(shipped);
    default -> log.warn("Unknown event type: {}", event.getClass());
}
```

### Text Blocks (Java 17)

```java
// BEFORE
String query = "SELECT u.id, u.email, u.display_name " +
               "FROM users u " +
               "WHERE u.status = :status " +
               "AND u.created_at > :since " +
               "ORDER BY u.created_at DESC";

// AFTER
String query = """
        SELECT u.id, u.email, u.display_name
        FROM users u
        WHERE u.status = :status
          AND u.created_at > :since
        ORDER BY u.created_at DESC
        """;
```

### Virtual Threads (Java 21)

```yaml
spring:
  threads:
    virtual:
      enabled: true   # Enable virtual threads for request handling
```

```java
// Spring Boot 3.2+ with Java 21
// Each request gets a virtual thread (no thread pool exhaustion)
// No code changes needed — Spring auto-configures virtual threads
```

## Testing Migration

### Update Test Dependencies

```xml
<!-- MockMvc with Security -->
<dependency>
    <groupId>org.springframework.security</groupId>
    <artifactId>spring-security-test</artifactId>
    <scope>test</scope>
</dependency>
```

### Common Test Breaks

```java
// BEFORE: MockMvc security
mockMvc.perform(get("/api/data")
        .with(SecurityMockMvcRequestPostProcessors.httpBasic("user", "pass")))

// AFTER: Same syntax, but import changed
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;

mockMvc.perform(get("/api/data")
        .with(httpBasic("user", "pass")))
```

```java
// BEFORE: @AutoConfigureTestDatabase
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class UserRepositoryTest { }

// AFTER: Same, but add service connection for testcontainers
@DataJpaTest
@Testcontainers
class UserRepositoryTest {
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");
}
```

## Migration Checklist

| Step | Description | Status |
|------|-------------|--------|
| 1 | Update to Spring Boot 2.7.x latest | |
| 2 | Fix all deprecation warnings | |
| 3 | Migrate security to lambda DSL | |
| 4 | Update Java to 17+ | |
| 5 | Run OpenRewrite `javax` to `jakarta` | |
| 6 | Update Spring Boot to 3.x | |
| 7 | Update Hibernate/JPA annotations | |
| 8 | Update third-party dependencies | |
| 9 | Fix renamed/removed properties | |
| 10 | Update Swagger from SpringFox to springdoc | |
| 11 | Fix Hibernate 6 query changes | |
| 12 | Update test configurations | |
| 13 | Run full test suite | |
| 14 | Performance test (compare with 2.x baseline) | |
| 15 | Deploy to staging environment | |
| 16 | Adopt Java 17/21 features (records, sealed, text blocks) | |

## Troubleshooting Common Issues

| Issue | Cause | Solution |
|-------|-------|---------|
| `ClassNotFoundException: javax.persistence.Entity` | Jakarta migration incomplete | Run OpenRewrite, check all imports |
| `NoSuchMethodError` in security config | `WebSecurityConfigurerAdapter` removed | Migrate to `SecurityFilterChain` bean |
| Hibernate `LazyInitializationException` more frequent | Hibernate 6 stricter about lazy loading | Use `@EntityGraph` or explicit joins |
| `spring.redis.*` properties ignored | Renamed to `spring.data.redis.*` | Update properties |
| Tests fail with `No qualifying bean of type SecurityFilterChain` | Security auto-config changed | Add `@Import(SecurityConfig.class)` to tests |
| Flyway migration checksum mismatch | Flyway version upgrade | Set `spring.flyway.validate-migration-naming=true` |

The migration from Spring Boot 2 to 3 is a significant effort, but it is a one-time cost that unlocks native images, virtual threads, improved performance, and continued security updates. Do not rush it — migrate incrementally, test thoroughly, and use automated tools like OpenRewrite to handle the mechanical `javax` to `jakarta` conversion. The remaining manual work is primarily security configuration and Hibernate query adjustments.
