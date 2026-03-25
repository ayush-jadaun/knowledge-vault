---
title: "GraalVM Native Image"
description: "Complete guide to GraalVM native image compilation for Spring Boot — AOT processing, native-image-agent for reflection config, startup time reduction from seconds to milliseconds, memory optimization, runtime limitations, and production readiness"
tags: [spring-boot, graalvm, native-image, aot, performance]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# GraalVM Native Image

A standard Spring Boot application runs on the JVM: it loads classes at runtime, performs just-in-time (JIT) compilation, and uses reflection extensively for dependency injection, auto-configuration, and data binding. This flexibility comes at a cost — startup times of 2-10 seconds, memory usage of 200-500MB, and a warm-up period before peak performance. For long-running server applications, these costs are amortized. For serverless functions, CLI tools, and scale-to-zero microservices, they are deal-breakers.

GraalVM Native Image compiles your Java application ahead of time (AOT) into a standalone binary. The result: startup in 50-100 milliseconds, memory usage of 30-80MB, and instant peak performance with no warm-up. The tradeoff is a longer build time (2-10 minutes), restrictions on reflection and dynamic class loading, and slightly lower peak throughput compared to a warmed-up JVM.

## JVM vs. Native Image

```
JVM Application:
─────────────────
Build:    javac (seconds) → JAR
Start:    java -jar app.jar
          ├── Load classes (~500 classes)        1-2s
          ├── Spring context initialization      2-5s
          ├── Auto-configuration                 1-3s
          └── Ready to serve                     3-10s total
Memory:   200-500MB RSS
Throughput: Peak after 30-60s warm-up (JIT)

Native Image Application:
─────────────────────────
Build:    native-image (2-10 min) → binary
Start:    ./app
          ├── Everything pre-compiled            0ms
          ├── Spring context (minimal)           20-50ms
          └── Ready to serve                     50-100ms total
Memory:   30-80MB RSS
Throughput: Peak immediately (no JIT needed)
```

## Setup

### Dependencies

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.0</version>
</parent>

<!-- GraalVM native support is built into Spring Boot 3.x -->
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.graalvm.buildtools</groupId>
            <artifactId>native-maven-plugin</artifactId>
        </plugin>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
        </plugin>
    </plugins>
</build>
```

### Gradle

```groovy
plugins {
    id 'org.graalvm.buildtools.native' version '0.10.1'
    id 'org.springframework.boot' version '3.3.0'
}
```

## Building a Native Image

### Using Spring Boot Maven Plugin

```bash
# Build native image (requires GraalVM installed)
./mvnw -Pnative native:compile

# Build native image in a container (no GraalVM needed locally)
./mvnw -Pnative spring-boot:build-image
```

### Using Gradle

```bash
# Build native binary
./gradlew nativeCompile

# Build OCI image with native binary
./gradlew bootBuildImage
```

### Build Output

```
Build time:
  JVM JAR:      5 seconds
  Native image: 3-10 minutes (depends on app size)

Binary size:
  JVM JAR:      30-50MB (plus JRE ~200MB)
  Native image: 60-120MB (self-contained, no JRE needed)

Startup:
  JVM:          3-10 seconds
  Native:       50-100 milliseconds
```

## AOT Processing

Spring Boot 3.x includes an Ahead-of-Time (AOT) processing engine that analyzes your application at build time and generates the code that the JVM would normally create at runtime:

```
Standard JVM (Runtime):
┌────────────────────────────────────────────┐
│  Class loading → Reflection → Proxies     │
│  Auto-configuration → Bean creation       │
│  All happens at startup                    │
└────────────────────────────────────────────┘

AOT (Build Time):
┌────────────────────────────────────────────┐
│  AOT engine analyzes application:          │
│  ├── Evaluates @Conditional annotations    │
│  ├── Generates bean definitions as code    │
│  ├── Creates proxy classes                 │
│  ├── Pre-computes reflection metadata      │
│  └── Generates resource hints              │
│                                            │
│  Result: Generated Java source code that   │
│  replaces runtime reflection               │
└────────────────────────────────────────────┘
```

### AOT-Generated Code

AOT processing generates code in `target/spring-aot/main/sources/`:

```java
// Generated: replaces runtime bean creation
public class MyApplication__BeanFactoryRegistrations {
    public static void registerBeanDefinitions(DefaultListableBeanFactory beanFactory) {
        // Direct instantiation — no reflection needed
        beanFactory.registerSingleton("orderService",
            new OrderService(
                beanFactory.getBean(OrderRepository.class),
                beanFactory.getBean(EventPublisher.class)));
    }
}
```

## Reflection Configuration

Native images do not support arbitrary reflection. All classes that are accessed via reflection must be declared at build time:

### Automatic Detection

Spring Boot handles most reflection needs automatically through AOT processing. The following work out of the box:
- `@Component`, `@Service`, `@Repository`, `@Controller` beans
- `@ConfigurationProperties` binding
- Spring Data repositories
- Jackson serialization/deserialization of known types

### Manual Reflection Hints

For cases where Spring cannot detect reflection usage:

```java
@Configuration
@ImportRuntimeHints(MyRuntimeHints.class)
public class NativeConfig {
}

public class MyRuntimeHints implements RuntimeHintsRegistrar {

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        // Register classes that need reflection
        hints.reflection()
                .registerType(ExternalDto.class,
                        MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
                        MemberCategory.INVOKE_DECLARED_METHODS,
                        MemberCategory.DECLARED_FIELDS)
                .registerType(ThirdPartyConfig.class,
                        MemberCategory.INVOKE_DECLARED_CONSTRUCTORS);

        // Register resources
        hints.resources()
                .registerPattern("templates/*.html")
                .registerPattern("static/**");

        // Register serialization
        hints.serialization()
                .registerType(MySerializableClass.class);

        // Register JNI
        hints.jni()
                .registerType(NativeLibrary.class);

        // Register proxies
        hints.proxies()
                .registerJdkProxy(MyInterface.class);
    }
}
```

### @RegisterReflectionForBinding

For DTOs that need Jackson serialization:

```java
@RestController
@RegisterReflectionForBinding({
    ExternalApiResponse.class,
    ExternalApiError.class,
    WebhookPayload.class
})
public class WebhookController {
    // External DTOs are now registered for reflection
}
```

## Native Image Agent

For complex applications, the native-image agent discovers reflection usage automatically by running your application and recording what it accesses:

```bash
# Step 1: Run with the agent
java -agentlib:native-image-agent=config-output-dir=src/main/resources/META-INF/native-image \
     -jar target/myapp.jar

# Step 2: Exercise the application (run tests, hit endpoints, etc.)
curl http://localhost:8080/api/users
curl -X POST http://localhost:8080/api/orders -d '...'

# Step 3: Stop the application — agent writes config files:
#   reflect-config.json
#   resource-config.json
#   proxy-config.json
#   serialization-config.json
#   jni-config.json
```

### Generated reflect-config.json

```json
[
  {
    "name": "com.example.dto.UserResponse",
    "allDeclaredConstructors": true,
    "allDeclaredMethods": true,
    "allDeclaredFields": true
  },
  {
    "name": "com.example.config.AppProperties",
    "methods": [
      {"name": "getApiKey", "parameterTypes": []},
      {"name": "setApiKey", "parameterTypes": ["java.lang.String"]}
    ]
  }
]
```

### Running Agent with Tests

```bash
# More thorough: run with your test suite
mvn -Pnative test -DargLine="-agentlib:native-image-agent=config-merge-dir=src/main/resources/META-INF/native-image"
```

## Testing Native Images

### AOT Testing (Without Building Native Image)

```bash
# Run tests in AOT mode (fast feedback)
./mvnw test -PnativeTest
```

### Native Image Testing

```bash
# Build and run tests as native image
./mvnw -Pnative test
```

### RuntimeHints Testing

```java
@Test
void shouldRegisterReflectionHints() {
    RuntimeHints hints = new RuntimeHints();
    new MyRuntimeHints().registerHints(hints, getClass().getClassLoader());

    assertThat(RuntimeHintsPredicates.reflection()
            .onType(ExternalDto.class)
            .withMemberCategory(MemberCategory.INVOKE_DECLARED_CONSTRUCTORS))
            .accepts(hints);
}
```

## Startup Time Optimization

### Profile-Specific AOT

```java
@Configuration
@Profile("native")
public class NativeOptimizedConfig {

    @Bean
    public TomcatServletWebServerFactory servletWebServerFactory() {
        TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory();
        factory.addConnectorCustomizers(connector -> {
            connector.setProperty("socket.appReadBufSize", "1024");
            connector.setProperty("socket.appWriteBufSize", "1024");
        });
        return factory;
    }
}
```

### Lazy Initialization

```yaml
spring:
  main:
    lazy-initialization: true  # Defer bean creation until first use
```

### Startup Time Comparison

| Application Type | JVM Startup | Native Startup | Speedup |
|-----------------|-------------|----------------|---------|
| Simple REST API | 2.5s | 0.05s | 50x |
| Web + JPA + Security | 5.0s | 0.08s | 62x |
| Full microservice | 8.0s | 0.12s | 67x |
| Complex enterprise app | 15.0s | 0.25s | 60x |

## Memory Optimization

```
JVM memory breakdown (typical Spring Boot app):
────────────────────────────────────────────────
Heap:           128-256MB
Metaspace:      50-100MB (class metadata)
Thread stacks:  20-50MB (1MB per thread)
Code cache:     20-50MB (JIT compiled code)
Direct memory:  10-50MB (NIO buffers)
────────────────────────────────────────────────
Total RSS:      250-500MB

Native image memory:
────────────────────
Image heap:     10-30MB (pre-initialized objects)
Runtime heap:   10-30MB (dynamic allocations)
Thread stacks:  5-10MB (fewer threads needed)
────────────────────────────────────────────────
Total RSS:      30-80MB
```

### Controlling Memory

```bash
# Native image memory flags
./myapp -Xmx64m -Xms32m

# Or via environment variable
export JAVA_TOOL_OPTIONS="-Xmx64m"
./myapp
```

## Limitations and Workarounds

### What Does Not Work in Native Image

| Feature | Limitation | Workaround |
|---------|-----------|------------|
| Runtime reflection | Must be pre-declared | `RuntimeHints`, agent, `@RegisterReflectionForBinding` |
| Dynamic class loading | Not supported | Include all classes at build time |
| `Class.forName()` | Must be pre-declared | Register in reflect-config.json |
| Dynamic proxies | Must be pre-declared | Register in proxy-config.json |
| Serialization | Must be pre-declared | Register in serialization-config.json |
| JMX | Not supported | Use Micrometer metrics instead |
| JVMTI agents | Not supported | Use native-image agent during build only |
| `MethodHandles.Lookup` | Limited | Use direct method references |

### Libraries with Known Issues

```java
// Lombok — works with AOT, but configure properly
// pom.xml: add lombok annotation processor before AOT

// MapStruct — works, add annotation processor order
<annotationProcessorPaths>
    <path>
        <groupId>org.mapstruct</groupId>
        <artifactId>mapstruct-processor</artifactId>
    </path>
    <!-- MapStruct before Lombok -->
</annotationProcessorPaths>

// Hibernate — works with Spring Boot 3.x AOT
// Use @RegisterReflectionForBinding for entity classes

// Jackson — works automatically for @RestController DTOs
// Register manually for non-obvious types
```

## Docker Images

### Buildpacks (Recommended)

```bash
# Build native image in a container
./mvnw -Pnative spring-boot:build-image \
  -Dspring-boot.build-image.imageName=myapp:native

# Result: small container image (~100MB vs ~300MB for JVM)
docker run -p 8080:8080 myapp:native
```

### Multi-Stage Dockerfile

```dockerfile
# Stage 1: Build native image
FROM ghcr.io/graalvm/native-image-community:21 AS builder
WORKDIR /app
COPY . .
RUN ./mvnw -Pnative native:compile -DskipTests

# Stage 2: Minimal runtime image
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libc6 libstdc++6 zlib1g && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/myapp /app/myapp
EXPOSE 8080
ENTRYPOINT ["/app/myapp"]
```

Image size comparison:
```
JVM + fat JAR:    ~300MB
Native + distroless: ~100MB
Native + scratch:    ~80MB
```

## When to Use Native Image

| Use Case | Native Image | JVM |
|----------|-------------|-----|
| Serverless (Lambda, Cloud Run) | Excellent — instant cold starts | Poor — 5-10s cold starts |
| CLI tools | Excellent — instant startup | Poor — multi-second startup |
| Scale-to-zero microservices | Excellent — instant scale-up | Poor — warm-up penalty |
| Long-running server | Depends — lower memory, but JVM has higher peak throughput | Good — JIT optimizes over time |
| Development iteration | Poor — 3-10 min build | Good — seconds to restart |
| Complex enterprise apps | Challenging — many reflection-heavy libraries | Easy — everything works |

## Build Time Optimization

```xml
<plugin>
    <groupId>org.graalvm.buildtools</groupId>
    <artifactId>native-maven-plugin</artifactId>
    <configuration>
        <buildArgs>
            <buildArg>-O1</buildArg>              <!-- Optimization level (0-3) -->
            <buildArg>--gc=serial</buildArg>       <!-- Simpler GC for smaller footprint -->
            <buildArg>-march=native</buildArg>     <!-- Optimize for current CPU -->
            <buildArg>--enable-preview</buildArg>  <!-- Java preview features -->
        </buildArgs>
    </configuration>
</plugin>
```

| Flag | Effect |
|------|--------|
| `-Ob` | Quick build (development) — fastest build, larger binary |
| `-O1` | Balanced optimization |
| `-O2` | Maximum optimization — slowest build, best runtime |
| `--gc=serial` | Smaller binary, lower memory, lower throughput |
| `--gc=G1` | Better throughput, larger binary |

GraalVM native images transform Spring Boot from a long-running server framework into a platform suitable for serverless, CLI, and scale-to-zero workloads. The 50-100x startup improvement and 5-10x memory reduction are transformative for these use cases. For traditional long-running servers, the JVM with JIT compilation still delivers higher peak throughput. Choose based on your deployment model, not hype.
