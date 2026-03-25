---
title: "Spring AOT & Native"
description: "Deep dive into Spring Ahead-of-Time compilation and GraalVM native images — AOT processing internals, reflection/proxy/serialization hints, @RegisterReflectionForBinding, native testing strategies, Buildpacks vs native-image CLI, startup time and memory benchmarks, and production deployment patterns for native Spring Boot applications."
tags: [spring-aot, graalvm, native-image, performance, java]
difficulty: expert
prerequisites: [spring-boot-fundamentals, jvm-internals, docker-basics]
lastReviewed: "2026-03-25"
---

# Spring AOT & Native

Spring Boot 3+ includes first-class support for compiling applications to GraalVM native images via Ahead-of-Time (AOT) processing. Native images start in milliseconds, use a fraction of the memory, and reach peak performance immediately — ideal for serverless, CLI tools, and resource-constrained environments.

## 1. How AOT Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Standard JVM Startup                          │
│                                                                  │
│  Load Classes → Parse Annotations → Create Bean Definitions →   │
│  Resolve Dependencies → Create Proxies → Initialize Beans       │
│                                                                  │
│  All at RUNTIME. Relies on reflection, classpath scanning,      │
│  and dynamic proxy generation.                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    AOT Processing (Build Time)                   │
│                                                                  │
│  Analyze Context → Generate Bean Definitions (Java source) →    │
│  Generate Reflection Hints → Generate Proxy Classes →           │
│  Generate Resource Hints → Generate Serialization Config        │
│                                                                  │
│  All done at BUILD TIME. The native image contains              │
│  pre-computed metadata — no reflection needed at runtime.       │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 What AOT Generates

During `mvn spring-boot:process-aot` (or the Gradle equivalent), Spring analyzes your application context and generates:

1. **Java source code** for bean definitions (replaces classpath scanning and annotation processing)
2. **Reflection hints** (`reflect-config.json`) for types that must be reflectively accessed
3. **Proxy hints** for JDK and CGLIB proxies
4. **Resource hints** for files loaded at runtime
5. **Serialization hints** for types involved in serialization

```java
// Example: what AOT generates for a simple @Service
// Instead of runtime annotation scanning, it generates this:
public class MyApp__BeanDefinitions {

    public static BeanDefinition getOrderServiceBeanDefinition() {
        RootBeanDefinition beanDefinition = new RootBeanDefinition(OrderService.class);
        beanDefinition.setInstanceSupplier(() -> {
            // Direct constructor call — no reflection
            return new OrderService(
                    applicationContext.getBean(OrderRepository.class),
                    applicationContext.getBean(PaymentService.class));
        });
        return beanDefinition;
    }
}
```

## 2. Project Setup

### 2.1 Maven Configuration

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.0</version>
</parent>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
            <configuration>
                <image>
                    <builder>paketobuildpacks/builder-jammy-tiny:latest</builder>
                    <env>
                        <BP_NATIVE_IMAGE>true</BP_NATIVE_IMAGE>
                        <BP_NATIVE_IMAGE_BUILD_ARGUMENTS>
                            --initialize-at-build-time=org.slf4j
                            -H:+ReportExceptionStackTraces
                        </BP_NATIVE_IMAGE_BUILD_ARGUMENTS>
                    </env>
                </image>
            </configuration>
        </plugin>

        <plugin>
            <groupId>org.graalvm.buildtools</groupId>
            <artifactId>native-maven-plugin</artifactId>
            <configuration>
                <buildArgs>
                    <buildArg>--initialize-at-build-time=org.slf4j</buildArg>
                    <buildArg>-H:+ReportExceptionStackTraces</buildArg>
                    <buildArg>--no-fallback</buildArg>
                </buildArgs>
            </configuration>
        </plugin>
    </plugins>
</build>

<profiles>
    <profile>
        <id>native</id>
        <build>
            <plugins>
                <plugin>
                    <groupId>org.graalvm.buildtools</groupId>
                    <artifactId>native-maven-plugin</artifactId>
                    <executions>
                        <execution>
                            <id>build-native</id>
                            <goals>
                                <goal>compile-no-fork</goal>
                            </goals>
                            <phase>package</phase>
                        </execution>
                    </executions>
                </plugin>
            </plugins>
        </build>
    </profile>
</profiles>
```

### 2.2 Building Native Images

```bash
# Option 1: Buildpacks (no GraalVM installed locally needed)
mvn -Pnative spring-boot:build-image

# Option 2: Native binary (requires GraalVM installed)
mvn -Pnative native:compile

# Option 3: AOT processing only (for JVM mode with AOT optimizations)
mvn spring-boot:process-aot
mvn spring-boot:run  # runs with AOT-generated code on JVM
```

## 3. Reflection Hints

GraalVM native images perform a closed-world analysis at build time. Any class accessed via reflection must be declared in advance.

### 3.1 @RegisterReflectionForBinding

```java
// For DTOs used in JSON serialization/deserialization
@RegisterReflectionForBinding({
        OrderRequest.class,
        OrderResponse.class,
        OrderItemRequest.class,
        CustomerDTO.class,
        PagedResponse.class
})
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(
            @RequestBody OrderRequest request) {
        // Jackson needs reflection to serialize/deserialize these types
        OrderResponse response = orderService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}

// Record types often need explicit registration
public record OrderRequest(
        Long customerId,
        List<OrderItemRequest> items,
        String shippingAddress
) {}

public record OrderResponse(
        Long id,
        String status,
        BigDecimal total,
        Instant createdAt
) {}
```

### 3.2 RuntimeHintsRegistrar

```java
@Component
@ImportRuntimeHints(AppRuntimeHints.class)
public class AppConfig {}

public class AppRuntimeHints implements RuntimeHintsRegistrar {

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        // Reflection hints
        hints.reflection()
                .registerType(OrderDTO.class,
                        MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
                        MemberCategory.INVOKE_DECLARED_METHODS,
                        MemberCategory.DECLARED_FIELDS)
                .registerType(PaymentCallback.class,
                        MemberCategory.INVOKE_PUBLIC_CONSTRUCTORS,
                        MemberCategory.INVOKE_PUBLIC_METHODS);

        // Resource hints
        hints.resources()
                .registerPattern("templates/*.html")
                .registerPattern("static/**")
                .registerPattern("messages/*.properties")
                .registerPattern("db/migration/*.sql");

        // Proxy hints
        hints.proxies()
                .registerJdkProxy(PaymentGateway.class)
                .registerJdkProxy(NotificationService.class, Serializable.class);

        // Serialization hints
        hints.serialization()
                .registerType(SessionData.class)
                .registerType(CacheEntry.class);
    }
}
```

### 3.3 @Reflective and @NativeHint

```java
// Mark individual methods/fields for reflection
public class DynamicProcessor {

    @Reflective
    public void processEvent(String eventJson) {
        // This method is called reflectively by a framework
    }
}

// For third-party libraries that need reflection
@Configuration
@ImportRuntimeHints(ThirdPartyHints.class)
public class ThirdPartyConfig {

    static class ThirdPartyHints implements RuntimeHintsRegistrar {
        @Override
        public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
            // Register types from third-party library
            hints.reflection()
                    .registerType(
                            TypeReference.of("com.thirdparty.SomeInternalClass"),
                            MemberCategory.values())
                    .registerType(
                            TypeReference.of("com.thirdparty.AnotherClass"),
                            MemberCategory.INVOKE_PUBLIC_CONSTRUCTORS,
                            MemberCategory.INVOKE_PUBLIC_METHODS);
        }
    }
}
```

## 4. Common Native Image Issues

### 4.1 Conditional Bean Registration

```java
// Problem: @ConditionalOnProperty uses reflection on property names
// Solution: Register hints or use AOT-compatible conditions

@Configuration
public class FeatureConfig {

    @Bean
    @ConditionalOnProperty(name = "feature.caching.enabled", havingValue = "true")
    public CacheManager cacheManager() {
        return new ConcurrentMapCacheManager("orders", "products");
    }

    // AOT-compatible alternative — use @Profile
    @Bean
    @Profile("caching")
    public CacheManager profileBasedCacheManager() {
        return new ConcurrentMapCacheManager("orders", "products");
    }
}
```

### 4.2 Dynamic Class Loading

```java
// Problem: Class.forName() at runtime
// Solution: Replace with direct references or register hints

// BAD — won't work in native image without hints
String className = config.getProcessorClass();
Class<?> clazz = Class.forName(className);
Object processor = clazz.getDeclaredConstructor().newInstance();

// GOOD — use a factory/registry pattern
@Component
public class ProcessorFactory {

    private final Map<String, Supplier<Processor>> registry = Map.of(
            "json", JsonProcessor::new,
            "xml", XmlProcessor::new,
            "csv", CsvProcessor::new
    );

    public Processor create(String type) {
        Supplier<Processor> supplier = registry.get(type);
        if (supplier == null) {
            throw new IllegalArgumentException("Unknown processor: " + type);
        }
        return supplier.get();
    }
}
```

### 4.3 Resource Loading

```java
// Problem: resource loading at runtime
// Solution: register resource patterns

public class TemplateLoader {

    // This works on JVM but needs hints for native
    public String loadTemplate(String name) {
        try (InputStream is = getClass().getResourceAsStream("/templates/" + name)) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}

// Register in RuntimeHintsRegistrar:
hints.resources().registerPattern("templates/*");
```

### 4.4 Serialization

```java
// Classes used with ObjectInputStream/ObjectOutputStream need hints
@Configuration
@ImportRuntimeHints(SerializationHints.class)
public class SerializationConfig {}

class SerializationHints implements RuntimeHintsRegistrar {
    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        hints.serialization()
                .registerType(HttpSession.class)
                .registerType(SecurityContext.class)
                .registerType(UsernamePasswordAuthenticationToken.class)
                .registerType(SimpleGrantedAuthority.class);
    }
}
```

## 5. Native Testing

### 5.1 AOT Processing in Tests

```java
// Test that AOT processing works correctly
@SpringBootTest
class AotSmokeTest {

    @Autowired
    private ApplicationContext context;

    @Test
    void contextLoads() {
        // Verifies the context starts with AOT-generated bean definitions
        assertThat(context).isNotNull();
    }

    @Test
    void allExpectedBeansPresent() {
        assertThat(context.getBean(OrderService.class)).isNotNull();
        assertThat(context.getBean(OrderRepository.class)).isNotNull();
        assertThat(context.getBean(PaymentService.class)).isNotNull();
    }
}
```

### 5.2 RuntimeHints Testing

```java
class AppRuntimeHintsTest {

    @Test
    void reflectionHintsRegistered() {
        RuntimeHints hints = new RuntimeHints();
        new AppRuntimeHints().registerHints(hints, getClass().getClassLoader());

        assertThat(RuntimeHintsPredicates.reflection()
                .onType(OrderDTO.class)
                .withMemberCategories(
                        MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
                        MemberCategory.INVOKE_DECLARED_METHODS))
                .accepts(hints);
    }

    @Test
    void resourceHintsRegistered() {
        RuntimeHints hints = new RuntimeHints();
        new AppRuntimeHints().registerHints(hints, getClass().getClassLoader());

        assertThat(RuntimeHintsPredicates.resource()
                .forResource("templates/order-confirmation.html"))
                .accepts(hints);
    }

    @Test
    void proxyHintsRegistered() {
        RuntimeHints hints = new RuntimeHints();
        new AppRuntimeHints().registerHints(hints, getClass().getClassLoader());

        assertThat(RuntimeHintsPredicates.proxies()
                .forInterfaces(PaymentGateway.class))
                .accepts(hints);
    }
}
```

### 5.3 Native Integration Tests

```bash
# Run tests as native image (in CI)
mvn -Pnative -PnativeTest test

# Gradle
./gradlew nativeTest
```

```java
// This test compiles and runs as a native image
@SpringBootTest
@NativeTest  // marker for native test execution
class OrderServiceNativeTest {

    @Autowired
    private OrderService orderService;

    @Test
    void createAndRetrieveOrder() {
        OrderRequest request = new OrderRequest(1L, List.of(
                new OrderItemRequest("SKU-001", 2, new BigDecimal("29.99"))));

        Order order = orderService.create(request);
        assertThat(order.getId()).isNotNull();

        Order retrieved = orderService.findById(order.getId());
        assertThat(retrieved.getTotalAmount())
                .isEqualByComparingTo("59.98");
    }
}
```

## 6. Buildpacks vs native-image CLI

```
┌────────────────────────┬─────────────────────────┬──────────────────────────┐
│ Aspect                 │ Buildpacks              │ native-image CLI         │
├────────────────────────┼─────────────────────────┼──────────────────────────┤
│ GraalVM Required       │ No (containerized)      │ Yes (installed locally)  │
│ Output                 │ Docker image             │ Binary executable       │
│ Build Environment      │ Docker/Podman            │ Host OS                 │
│ CI Friendly            │ Very (just Docker)       │ Needs GraalVM in CI     │
│ Build Time             │ Longer (download layers) │ Shorter after first run │
│ Image Size             │ Larger (~100-200MB)      │ Smaller (50-100MB)      │
│ OS Compatibility       │ Linux container only     │ Host OS native binary   │
│ Caching                │ Layer caching            │ Manual                  │
│ Reproducibility        │ High (pinned builder)    │ Depends on local env    │
│ Customization          │ ENV variables            │ Full CLI control        │
├────────────────────────┼─────────────────────────┼──────────────────────────┤
│ Best For               │ Container deployments,   │ Local dev, non-Docker   │
│                        │ CI/CD pipelines          │ deployments, CLI tools  │
└────────────────────────┴─────────────────────────┴──────────────────────────┘
```

### 6.1 Buildpacks Configuration

```xml
<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
    <configuration>
        <image>
            <builder>paketobuildpacks/builder-jammy-tiny:latest</builder>
            <name>${project.artifactId}:native</name>
            <env>
                <BP_NATIVE_IMAGE>true</BP_NATIVE_IMAGE>
                <BP_NATIVE_IMAGE_BUILD_ARGUMENTS>
                    --initialize-at-build-time=org.slf4j
                    -H:+ReportExceptionStackTraces
                    -march=compatibility
                </BP_NATIVE_IMAGE_BUILD_ARGUMENTS>
                <BP_JVM_VERSION>21</BP_JVM_VERSION>
            </env>
            <pullPolicy>IF_NOT_PRESENT</pullPolicy>
        </image>
    </configuration>
</plugin>
```

### 6.2 Multi-Stage Dockerfile

```dockerfile
# Stage 1: Build native image
FROM ghcr.io/graalvm/native-image-community:21 AS builder
WORKDIR /app
COPY . .
RUN ./mvnw -Pnative native:compile -DskipTests

# Stage 2: Run
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libc6 libstdc++6 zlib1g && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/myapp /app/myapp

EXPOSE 8080
ENTRYPOINT ["/app/myapp"]
```

## 7. Startup and Memory Benchmarks

```
┌──────────────────────────────────────────────────────────────────┐
│           Typical Spring Boot Application Comparison              │
│                                                                   │
│  Metric              │ JVM (OpenJDK 21)  │ Native Image          │
│  ────────────────────┼───────────────────┼───────────────────── │
│  Startup Time        │ 2.5 - 5.0 seconds │ 0.03 - 0.15 seconds  │
│  Time to First Req   │ 3.0 - 6.0 seconds │ 0.05 - 0.20 seconds  │
│  RSS at Idle         │ 250 - 400 MB      │ 50 - 100 MB           │
│  RSS Under Load      │ 400 - 800 MB      │ 100 - 250 MB          │
│  Peak Throughput     │ Higher (JIT)       │ ~80-90% of JVM        │
│  P99 Latency (warm)  │ Lower (JIT)        │ Slightly higher       │
│  Binary Size         │ 20 MB (JAR)        │ 80 - 150 MB           │
│  Build Time          │ 30 - 60 seconds    │ 3 - 10 minutes        │
│  CPU at Build        │ Moderate            │ Very High             │
│  RAM at Build        │ 1 - 2 GB           │ 6 - 14 GB             │
└──────────────────────────────────────────────────────────────────┘
```

### 7.1 Measuring Performance

```java
@SpringBootApplication
public class MyApp {

    private static final Logger log = LoggerFactory.getLogger(MyApp.class);

    public static void main(String[] args) {
        long start = System.nanoTime();
        SpringApplication app = new SpringApplication(MyApp.class);
        ConfigurableApplicationContext context = app.run(args);
        long duration = (System.nanoTime() - start) / 1_000_000;
        log.info("Application started in {} ms", duration);

        Runtime runtime = Runtime.getRuntime();
        log.info("Memory: used={}MB, total={}MB, max={}MB",
                (runtime.totalMemory() - runtime.freeMemory()) / 1024 / 1024,
                runtime.totalMemory() / 1024 / 1024,
                runtime.maxMemory() / 1024 / 1024);
    }
}
```

## 8. Production Deployment

### 8.1 Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service-native
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: order-service
          image: myregistry/order-service:native
          resources:
            requests:
              memory: "64Mi"     # native uses much less memory
              cpu: "100m"
            limits:
              memory: "256Mi"    # vs 512Mi-1Gi for JVM
              cpu: "500m"
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 1    # native starts instantly
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 3
            periodSeconds: 10
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "production"
            - name: JAVA_TOOL_OPTIONS
              value: ""   # no JVM flags needed for native
```

### 8.2 When to Use Native vs JVM

```
┌─────────────────────────────────────────────────────────────────┐
│                    Decision Matrix                                │
│                                                                  │
│  USE NATIVE WHEN:                                                │
│  - Serverless / FaaS (AWS Lambda, Azure Functions)               │
│  - Kubernetes with tight resource limits                         │
│  - CLI tools and utilities                                       │
│  - Microservices that need instant startup for autoscaling       │
│  - Edge computing with limited memory                            │
│  - Applications with predictable, steady-state workloads         │
│                                                                  │
│  USE JVM WHEN:                                                   │
│  - Long-running services where JIT optimization matters          │
│  - Applications with heavy dynamic features (reflection, etc.)   │
│  - When build time is critical (CI/CD speed)                     │
│  - Debugging and profiling convenience is important              │
│  - Using libraries without native support                        │
│  - Peak throughput is the primary concern                        │
│                                                                  │
│  HYBRID APPROACH:                                                │
│  - Use native for user-facing microservices (fast cold start)    │
│  - Use JVM for background workers (JIT throughput)               │
│  - Run AOT on JVM for faster startup without native constraints  │
└─────────────────────────────────────────────────────────────────┘
```

## 9. AOT-Compatible Coding Practices

```java
/**
 * Guidelines for writing native-friendly Spring Boot code:
 *
 * 1. PREFER constructor injection over field injection
 *    - Constructor params are resolved at build time
 *
 * 2. AVOID Class.forName(), Method.invoke(), Field.set()
 *    - Use direct references or register hints
 *
 * 3. USE records/classes for DTOs
 *    - Register with @RegisterReflectionForBinding
 *
 * 4. AVOID dynamic proxies where possible
 *    - Prefer class-based proxies (spring.aop.proxy-target-class=true is default)
 *
 * 5. DECLARE resources explicitly
 *    - No classpath scanning at runtime
 *
 * 6. TEST with AOT processing enabled
 *    - mvn spring-boot:process-aot && mvn test
 *
 * 7. CHECK library compatibility
 *    - https://www.graalvm.org/native-image/libraries-and-frameworks/
 *
 * 8. USE @Conditional carefully
 *    - Conditions are evaluated at build time in AOT mode
 *    - Runtime conditions need special handling
 */
```

Spring AOT and native images represent a fundamental shift in how Spring applications are built and deployed. The tradeoff is clear: invest more build time (and build-time complexity) to gain dramatically faster startup and lower memory usage at runtime. For most teams, the recommended approach is to develop on the JVM for fast iteration, run AOT-processed tests in CI to catch compatibility issues early, and build native images for production containers. As the GraalVM ecosystem matures, the list of compatible libraries continues to grow, making native deployment viable for an increasing number of applications.
