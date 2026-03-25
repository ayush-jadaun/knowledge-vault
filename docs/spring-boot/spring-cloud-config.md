---
title: "Spring Cloud Config"
description: "Complete guide to Spring Cloud Config — config server setup, Git/Vault/JDBC backends, encryption/decryption of sensitive properties, dynamic refresh with @RefreshScope, Spring Cloud Bus for cluster-wide refresh, config client configuration, profile-based config, versioning, security hardening, and Kubernetes ConfigMap integration."
tags: [spring-cloud-config, configuration, vault, microservices, java]
difficulty: intermediate
prerequisites: [spring-boot-fundamentals, git-basics, microservices-basics]
lastReviewed: "2026-03-25"
---

# Spring Cloud Config

Spring Cloud Config provides server-side and client-side support for externalized configuration in a distributed system. The config server serves properties from a centralized backend (Git, Vault, JDBC, or file system) and clients fetch their configuration at startup or on demand.

## 1. Config Server Setup

### 1.1 Dependencies and Bootstrap

```xml
<!-- Config Server -->
<dependencies>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-config-server</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
</dependencies>
```

```java
@SpringBootApplication
@EnableConfigServer
public class ConfigServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ConfigServerApplication.class, args);
    }
}
```

### 1.2 Git Backend Configuration

```yaml
# application.yml for Config Server
server:
  port: 8888

spring:
  cloud:
    config:
      server:
        git:
          uri: https://github.com/myorg/config-repo
          default-label: main
          search-paths:
            - '{application}'          # search in app-named directories
            - shared                   # shared config directory
          clone-on-start: true         # fail fast if Git unreachable
          timeout: 10                  # seconds
          force-pull: true             # always pull latest
          refresh-rate: 30             # seconds between refreshes

          # Multiple repositories
          repos:
            production:
              pattern: '*/production'
              uri: https://github.com/myorg/config-prod
              clone-on-start: true
            staging:
              pattern: '*/staging'
              uri: https://github.com/myorg/config-staging

          # Private repo authentication
          username: ${GIT_USERNAME}
          password: ${GIT_TOKEN}
          # Or SSH
          # uri: git@github.com:myorg/config-repo.git
          # ignore-local-ssh-settings: true
          # private-key: |
          #   -----BEGIN RSA PRIVATE KEY-----
          #   ...
          #   -----END RSA PRIVATE KEY-----
```

### 1.3 Git Repository Structure

```
config-repo/
├── application.yml              # shared by all services, all profiles
├── application-production.yml   # shared production config
├── application-staging.yml      # shared staging config
├── order-service.yml            # order-service default
├── order-service-production.yml # order-service production overrides
├── order-service-staging.yml    # order-service staging overrides
├── user-service.yml
├── user-service-production.yml
├── payment-service/
│   ├── payment-service.yml
│   └── payment-service-production.yml
└── shared/
    ├── logging.yml              # shared logging config
    └── messaging.yml            # shared messaging config
```

Example config files:

```yaml
# application.yml — shared defaults
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,refresh
  health:
    readinessstate:
      enabled: true
    livenessstate:
      enabled: true

logging:
  level:
    root: INFO
    org.springframework: WARN

# order-service.yml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/orders
    username: orders_app
    password: '{cipher}AQC...'  # encrypted
    hikari:
      maximum-pool-size: 10
      minimum-idle: 5

order:
  payment-timeout: 30s
  max-items-per-order: 50
  notification:
    enabled: true
    email-from: orders@example.com

# order-service-production.yml — production overrides
spring:
  datasource:
    url: jdbc:postgresql://db-prod.internal:5432/orders
    hikari:
      maximum-pool-size: 30
      minimum-idle: 10

order:
  payment-timeout: 60s
```

## 2. Vault Backend

### 2.1 Configuration

```yaml
spring:
  cloud:
    config:
      server:
        vault:
          host: vault.internal
          port: 8200
          scheme: https
          backend: secret
          default-key: application
          profile-separator: /
          kv-version: 2
          authentication: TOKEN
          token: ${VAULT_TOKEN}

        # Composite backend: Git + Vault
        composite:
          - type: git
            uri: https://github.com/myorg/config-repo
          - type: vault
            host: vault.internal
            port: 8200
            scheme: https
            authentication: APPROLE
            app-role:
              role-id: ${VAULT_ROLE_ID}
              secret-id: ${VAULT_SECRET_ID}
```

### 2.2 Storing Secrets in Vault

```bash
# Store secrets for order-service
vault kv put secret/order-service \
    spring.datasource.password=s3cur3P@ss \
    order.api-key=ak_live_abc123 \
    order.webhook-secret=whsec_xyz789

# Store secrets for order-service in production profile
vault kv put secret/order-service/production \
    spring.datasource.password=pr0dP@ss! \
    order.api-key=ak_live_prod_key

# Store shared secrets
vault kv put secret/application \
    spring.mail.password=m@ilP@ss \
    jwt.signing-key=jwtS3cr3tK3y
```

## 3. JDBC Backend

```yaml
spring:
  cloud:
    config:
      server:
        jdbc:
          sql: "SELECT prop_key, prop_value FROM config_properties WHERE application=? AND profile=? AND label=?"
          order: 1

  datasource:
    url: jdbc:postgresql://localhost:5432/config_db
    username: config_user
    password: config_pass
```

```sql
CREATE TABLE config_properties (
    id SERIAL PRIMARY KEY,
    application VARCHAR(128) NOT NULL,
    profile VARCHAR(128) NOT NULL DEFAULT 'default',
    label VARCHAR(128) NOT NULL DEFAULT 'main',
    prop_key VARCHAR(256) NOT NULL,
    prop_value TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (application, profile, label, prop_key)
);

-- Insert configuration
INSERT INTO config_properties (application, profile, label, prop_key, prop_value)
VALUES
    ('order-service', 'default', 'main', 'order.max-items', '50'),
    ('order-service', 'default', 'main', 'order.timeout', '30s'),
    ('order-service', 'production', 'main', 'order.timeout', '60s'),
    ('application', 'default', 'main', 'logging.level.root', 'INFO');
```

## 4. Encryption and Decryption

### 4.1 Symmetric Key Encryption

```yaml
# Config server application.yml
encrypt:
  key: ${ENCRYPT_KEY}  # a strong secret key
```

```bash
# Encrypt a value via Config Server REST API
curl -X POST http://localhost:8888/encrypt -d 'myDatabasePassword'
# Returns: AQC4e2b5c8d3a1f...

# Decrypt
curl -X POST http://localhost:8888/decrypt -d 'AQC4e2b5c8d3a1f...'
# Returns: myDatabasePassword
```

### 4.2 Asymmetric Key (RSA) Encryption

```bash
# Generate keystore
keytool -genkeypair -alias config-server-key \
    -keyalg RSA -keysize 2048 \
    -keystore config-server.jks \
    -storepass changeit \
    -validity 365
```

```yaml
encrypt:
  key-store:
    location: classpath:config-server.jks
    password: changeit
    alias: config-server-key
    secret: changeit
```

### 4.3 Using Encrypted Values

```yaml
# In config repo files, prefix with {cipher}
spring:
  datasource:
    password: '{cipher}AQC4e2b5c8d3a1f0e9d8c7b6a5...'

payment:
  stripe-secret: '{cipher}AQBT6f7g8h9i0j1k2l3m4n5o6...'
```

## 5. Config Client

### 5.1 Client Dependencies and Configuration

```xml
<!-- Config Client -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-config</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

```yaml
# application.yml for client service
spring:
  application:
    name: order-service
  profiles:
    active: production
  config:
    import: "configserver:http://config-server:8888"
  cloud:
    config:
      uri: http://config-server:8888
      username: config-user
      password: config-pass
      fail-fast: true              # fail if config server unreachable
      retry:
        initial-interval: 1000
        max-interval: 10000
        max-attempts: 6
        multiplier: 1.5
      label: main                  # Git branch/tag
      request-read-timeout: 5000
```

### 5.2 Using Configuration in Application

```java
@Component
@ConfigurationProperties(prefix = "order")
public class OrderProperties {

    private Duration paymentTimeout = Duration.ofSeconds(30);
    private int maxItemsPerOrder = 50;
    private NotificationConfig notification = new NotificationConfig();

    // getters and setters

    public static class NotificationConfig {
        private boolean enabled = true;
        private String emailFrom = "noreply@example.com";
        // getters and setters
    }
}

@Service
public class OrderService {

    private final OrderProperties orderProperties;

    public OrderService(OrderProperties orderProperties) {
        this.orderProperties = orderProperties;
    }

    public Order createOrder(OrderRequest request) {
        if (request.getItems().size() > orderProperties.getMaxItemsPerOrder()) {
            throw new OrderLimitExceededException(
                    "Maximum " + orderProperties.getMaxItemsPerOrder() + " items");
        }

        Order order = new Order();
        order.setPaymentDeadline(
                Instant.now().plus(orderProperties.getPaymentTimeout()));
        // ...
        return order;
    }
}
```

## 6. Dynamic Refresh with @RefreshScope

### 6.1 Refresh Scope Basics

```java
@RestController
@RefreshScope
@RequestMapping("/api/feature")
public class FeatureFlagController {

    @Value("${feature.new-checkout.enabled:false}")
    private boolean newCheckoutEnabled;

    @Value("${feature.dark-mode.enabled:false}")
    private boolean darkModeEnabled;

    @Value("${feature.max-concurrent-users:1000}")
    private int maxConcurrentUsers;

    @GetMapping("/flags")
    public Map<String, Object> getFlags() {
        return Map.of(
                "newCheckout", newCheckoutEnabled,
                "darkMode", darkModeEnabled,
                "maxConcurrentUsers", maxConcurrentUsers
        );
    }
}

// Trigger refresh via actuator
// POST /actuator/refresh
// Returns: ["feature.new-checkout.enabled", "feature.max-concurrent-users"]
```

### 6.2 Refresh Event Listener

```java
@Component
public class ConfigRefreshListener {

    private static final Logger log = LoggerFactory.getLogger(ConfigRefreshListener.class);

    @EventListener
    public void onRefresh(RefreshScopeRefreshedEvent event) {
        log.info("Configuration refreshed. Event: {}", event.getName());
    }

    @EventListener
    public void onEnvironmentChanged(EnvironmentChangeEvent event) {
        log.info("Environment changed. Keys: {}", event.getKeys());
        event.getKeys().forEach(key ->
                log.info("  Changed: {}", key));
    }
}
```

### 6.3 Programmatic Refresh

```java
@RestController
@RequestMapping("/api/admin/config")
public class ConfigAdminController {

    private final ContextRefresher contextRefresher;
    private final Environment environment;

    public ConfigAdminController(ContextRefresher contextRefresher,
                                  Environment environment) {
        this.contextRefresher = contextRefresher;
        this.environment = environment;
    }

    @PostMapping("/refresh")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> refreshConfig() {
        Set<String> changedKeys = contextRefresher.refresh();
        return ResponseEntity.ok(Map.of(
                "status", "refreshed",
                "changedKeys", changedKeys,
                "timestamp", Instant.now()
        ));
    }

    @GetMapping("/property/{key}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, String>> getProperty(@PathVariable String key) {
        String value = environment.getProperty(key);
        if (value == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(Map.of("key", key, "value", value));
    }
}
```

## 7. Spring Cloud Bus

Spring Cloud Bus links microservice instances with a message broker (RabbitMQ or Kafka) so a refresh event on one instance propagates to all instances.

### 7.1 Setup with RabbitMQ

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-bus-amqp</artifactId>
</dependency>
```

```yaml
spring:
  rabbitmq:
    host: rabbitmq.internal
    port: 5672
    username: config-bus
    password: busP@ss

management:
  endpoints:
    web:
      exposure:
        include: busrefresh,busenv
```

### 7.2 Setup with Kafka

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-bus-kafka</artifactId>
</dependency>
```

```yaml
spring:
  cloud:
    bus:
      enabled: true
      destination: config-events   # Kafka topic name
  kafka:
    bootstrap-servers: kafka:9092
```

### 7.3 Triggering Cluster-Wide Refresh

```bash
# Refresh all instances of all services
curl -X POST http://config-server:8888/actuator/busrefresh

# Refresh only order-service instances
curl -X POST http://config-server:8888/actuator/busrefresh/order-service:**

# Refresh a specific instance
curl -X POST http://config-server:8888/actuator/busrefresh/order-service:8081
```

### 7.4 Git Webhook for Automatic Refresh

```java
// Config server webhook endpoint
@RestController
@RequestMapping("/webhook")
public class GitWebhookController {

    private final ApplicationEventPublisher publisher;

    public GitWebhookController(ApplicationEventPublisher publisher) {
        this.publisher = publisher;
    }

    @PostMapping("/github")
    public ResponseEntity<String> handleGithubWebhook(
            @RequestHeader("X-Hub-Signature-256") String signature,
            @RequestBody String payload) {

        if (!verifySignature(payload, signature)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Invalid signature");
        }

        // Trigger bus refresh
        publisher.publishEvent(new RefreshRemoteApplicationEvent(
                this, "config-server", "**"));

        return ResponseEntity.ok("Refresh triggered");
    }

    private boolean verifySignature(String payload, String signature) {
        String secret = System.getenv("GITHUB_WEBHOOK_SECRET");
        String computed = "sha256=" + HmacUtils.hmacSha256Hex(secret, payload);
        return MessageDigest.isEqual(
                computed.getBytes(StandardCharsets.UTF_8),
                signature.getBytes(StandardCharsets.UTF_8));
    }
}
```

## 8. Security

```java
@Configuration
@EnableWebSecurity
public class ConfigServerSecurity {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/webhook/**").permitAll()
                        .requestMatchers("/encrypt", "/decrypt").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .httpBasic(Customizer.withDefaults())
                .build();
    }

    @Bean
    public UserDetailsService userDetailsService() {
        UserDetails configClient = User.builder()
                .username("config-client")
                .password("{bcrypt}$2a$10$...")
                .roles("CLIENT")
                .build();

        UserDetails admin = User.builder()
                .username("config-admin")
                .password("{bcrypt}$2a$10$...")
                .roles("ADMIN", "CLIENT")
                .build();

        return new InMemoryUserDetailsManager(configClient, admin);
    }
}
```

## 9. Kubernetes ConfigMap Integration

### 9.1 Using Spring Cloud Kubernetes Config

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-kubernetes-client-config</artifactId>
</dependency>
```

```yaml
spring:
  cloud:
    kubernetes:
      config:
        enabled: true
        name: order-service       # ConfigMap name
        namespace: production
        enable-api: true
      reload:
        enabled: true
        mode: event               # event | polling
        strategy: refresh         # refresh | restart_context | shutdown
        period: 15000             # polling interval (ms)
```

### 9.2 Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service
  namespace: production
  labels:
    spring.cloud.kubernetes.config: "true"
data:
  application.yml: |
    order:
      payment-timeout: 60s
      max-items-per-order: 100
      notification:
        enabled: true
        email-from: orders@prod.example.com

    spring:
      datasource:
        url: jdbc:postgresql://db-prod:5432/orders
        hikari:
          maximum-pool-size: 30
---
apiVersion: v1
kind: Secret
metadata:
  name: order-service-secrets
  namespace: production
type: Opaque
data:
  spring.datasource.password: cHJvZFBAc3M=   # base64 encoded
  order.api-key: YWtfbGl2ZV9wcm9k             # base64 encoded
```

### 9.3 Hybrid: Config Server + Kubernetes

```yaml
# Use Config Server as primary, Kubernetes ConfigMap for overrides
spring:
  config:
    import:
      - "configserver:http://config-server:8888"
      - "kubernetes:"
  cloud:
    config:
      override-none: true    # allow local/K8s properties to override
    kubernetes:
      config:
        enabled: true
        sources:
          - name: order-service
          - name: shared-config
```

## 10. Config Server High Availability

```yaml
# Config Server behind a load balancer
# Deploy multiple Config Server instances pointing to the same Git repo

# Client configuration for HA
spring:
  cloud:
    config:
      uri:
        - http://config-server-1:8888
        - http://config-server-2:8888
        - http://config-server-3:8888
      retry:
        initial-interval: 1000
        max-attempts: 6
        multiplier: 1.5
      fail-fast: true
```

```java
// Health indicator for Config Server
@Component
public class ConfigServerHealthIndicator implements HealthIndicator {

    private final Environment environment;

    public ConfigServerHealthIndicator(Environment environment) {
        this.environment = environment;
    }

    @Override
    public Health health() {
        try {
            String configLabel = environment.getProperty(
                    "spring.cloud.config.label", "unknown");
            return Health.up()
                    .withDetail("configLabel", configLabel)
                    .withDetail("profiles", Arrays.toString(
                            environment.getActiveProfiles()))
                    .build();
        } catch (Exception e) {
            return Health.down(e).build();
        }
    }
}
```

Spring Cloud Config centralizes configuration management across your microservice fleet. Start with a Git backend for simplicity, add Vault for secrets, and use Spring Cloud Bus for cluster-wide refresh. In Kubernetes environments, consider the hybrid approach that combines Config Server with native ConfigMaps for environment-specific overrides.
