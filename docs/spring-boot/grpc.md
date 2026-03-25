---
title: "gRPC with Spring Boot"
description: "Complete guide to building gRPC services with Spring Boot — protobuf schema design, gRPC server and client starters, service implementation, client stubs and load balancing, streaming patterns, error handling with rich status, health checks, and interceptors"
tags: [spring-boot, grpc, protobuf, microservices, rpc]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# gRPC with Spring Boot

REST APIs serialize data to JSON, parse it back, and rely on HTTP/1.1 text-based semantics. This works for public APIs and browser clients, but for service-to-service communication inside a microservice architecture, it leaves performance on the table. gRPC uses Protocol Buffers (protobuf) for binary serialization, HTTP/2 for multiplexed transport, and code-generated client/server stubs for type safety. The result: 2-10x better throughput, strict API contracts, and built-in support for streaming.

Spring Boot does not include gRPC support out of the box, but the community `grpc-spring-boot-starter` (from `net.devh`) integrates gRPC servers and clients seamlessly into the Spring ecosystem — auto-configuration, dependency injection, Spring Security integration, and Actuator health checks.

## Why gRPC for Microservices

```
                REST/JSON                     gRPC/Protobuf
                ─────────                     ─────────────
Serialization:  JSON (text, ~1KB overhead)    Protobuf (binary, ~100B)
Transport:      HTTP/1.1 (one req per conn)   HTTP/2 (multiplexed streams)
Contract:       OpenAPI (optional, docs)      .proto (mandatory, code-gen)
Streaming:      SSE (server only)             Bidirectional streaming
Type safety:    Runtime (hope JSON matches)   Compile-time (generated code)
Latency:        ~5ms (JSON parse overhead)    ~1ms (binary decode)
Browser:        Native support                Requires gRPC-Web proxy
```

## Protobuf Schema Design

### Project Structure

```
├── proto/
│   └── src/main/proto/
│       ├── user_service.proto
│       ├── order_service.proto
│       └── common/
│           ├── pagination.proto
│           └── money.proto
├── user-service/
│   ├── build.gradle
│   └── src/main/java/...
└── order-service/
    ├── build.gradle
    └── src/main/java/...
```

### Service Definition

```protobuf
// user_service.proto
syntax = "proto3";

package com.example.user.v1;

option java_multiple_files = true;
option java_package = "com.example.user.v1";

import "google/protobuf/timestamp.proto";
import "google/protobuf/empty.proto";
import "google/protobuf/field_mask.proto";
import "common/pagination.proto";

service UserService {
    // Unary RPCs
    rpc GetUser(GetUserRequest) returns (User);
    rpc CreateUser(CreateUserRequest) returns (User);
    rpc UpdateUser(UpdateUserRequest) returns (User);
    rpc DeleteUser(DeleteUserRequest) returns (google.protobuf.Empty);

    // Server streaming: server sends multiple responses
    rpc ListUsers(ListUsersRequest) returns (stream User);

    // Client streaming: client sends multiple requests
    rpc BulkCreateUsers(stream CreateUserRequest) returns (BulkCreateResponse);

    // Bidirectional streaming
    rpc SyncUsers(stream UserSyncRequest) returns (stream UserSyncResponse);
}

message User {
    string id = 1;
    string username = 2;
    string email = 3;
    string display_name = 4;
    string bio = 5;
    UserStatus status = 6;
    google.protobuf.Timestamp created_at = 7;
    google.protobuf.Timestamp updated_at = 8;
    repeated string roles = 9;
}

enum UserStatus {
    USER_STATUS_UNSPECIFIED = 0;
    USER_STATUS_ACTIVE = 1;
    USER_STATUS_INACTIVE = 2;
    USER_STATUS_SUSPENDED = 3;
}

message GetUserRequest {
    string id = 1;
}

message CreateUserRequest {
    string username = 1;
    string email = 2;
    string display_name = 3;
    string bio = 4;
}

message UpdateUserRequest {
    string id = 1;
    User user = 2;
    // Field mask specifies which fields to update
    google.protobuf.FieldMask update_mask = 3;
}

message DeleteUserRequest {
    string id = 1;
}

message ListUsersRequest {
    int32 page_size = 1;
    string page_token = 2;      // Opaque cursor for pagination
    string filter = 3;          // e.g., "status=ACTIVE"
    string order_by = 4;        // e.g., "created_at desc"
}

message BulkCreateResponse {
    int32 created_count = 1;
    int32 failed_count = 2;
    repeated BulkCreateError errors = 3;
}

message BulkCreateError {
    int32 index = 1;
    string message = 2;
}

message UserSyncRequest {
    oneof action {
        User upsert = 1;
        string delete_id = 2;
    }
}

message UserSyncResponse {
    string id = 1;
    SyncAction action = 2;
    bool success = 3;
    string error_message = 4;
}

enum SyncAction {
    SYNC_ACTION_UNSPECIFIED = 0;
    SYNC_ACTION_CREATED = 1;
    SYNC_ACTION_UPDATED = 2;
    SYNC_ACTION_DELETED = 3;
}
```

### Common Types

```protobuf
// common/pagination.proto
syntax = "proto3";

package com.example.common;

option java_multiple_files = true;
option java_package = "com.example.common";

message PageRequest {
    int32 page_size = 1;
    string page_token = 2;
}

message PageResponse {
    string next_page_token = 1;
    int32 total_size = 2;
}
```

## Build Configuration

### Maven

```xml
<dependencies>
    <dependency>
        <groupId>net.devh</groupId>
        <artifactId>grpc-spring-boot-starter</artifactId>
        <version>3.1.0.RELEASE</version>
    </dependency>
</dependencies>

<build>
    <extensions>
        <extension>
            <groupId>kr.motd.maven</groupId>
            <artifactId>os-maven-plugin</artifactId>
            <version>1.7.1</version>
        </extension>
    </extensions>
    <plugins>
        <plugin>
            <groupId>org.xolstice.maven.plugins</groupId>
            <artifactId>protobuf-maven-plugin</artifactId>
            <version>0.6.1</version>
            <configuration>
                <protocArtifact>com.google.protobuf:protoc:3.25.3:exe:${os.detected.classifier}</protocArtifact>
                <pluginId>grpc-java</pluginId>
                <pluginArtifact>io.grpc:protoc-gen-grpc-java:1.63.0:exe:${os.detected.classifier}</pluginArtifact>
            </configuration>
            <executions>
                <execution>
                    <goals>
                        <goal>compile</goal>
                        <goal>compile-custom</goal>
                    </goals>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

### Gradle

```groovy
plugins {
    id 'com.google.protobuf' version '0.9.4'
}

dependencies {
    implementation 'net.devh:grpc-spring-boot-starter:3.1.0.RELEASE'
}

protobuf {
    protoc {
        artifact = 'com.google.protobuf:protoc:3.25.3'
    }
    plugins {
        grpc {
            artifact = 'io.grpc:protoc-gen-grpc-java:1.63.0'
        }
    }
    generateProtoTasks {
        all()*.plugins {
            grpc {}
        }
    }
}
```

## Server Implementation

### Service Implementation

```java
@GrpcService
public class UserGrpcService extends UserServiceGrpc.UserServiceImplBase {

    private final UserService userService;
    private final UserMapper userMapper;

    public UserGrpcService(UserService userService, UserMapper userMapper) {
        this.userService = userService;
        this.userMapper = userMapper;
    }

    @Override
    public void getUser(GetUserRequest request,
                        StreamObserver<User> responseObserver) {
        try {
            UserEntity entity = userService.findById(request.getId())
                    .orElseThrow(() -> Status.NOT_FOUND
                            .withDescription("User not found: " + request.getId())
                            .asRuntimeException());

            responseObserver.onNext(userMapper.toProto(entity));
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (Exception e) {
            responseObserver.onError(Status.INTERNAL
                    .withDescription("Internal error")
                    .withCause(e)
                    .asRuntimeException());
        }
    }

    @Override
    public void createUser(CreateUserRequest request,
                           StreamObserver<User> responseObserver) {
        // Validate
        if (request.getUsername().isBlank()) {
            responseObserver.onError(Status.INVALID_ARGUMENT
                    .withDescription("Username is required")
                    .asRuntimeException());
            return;
        }

        if (userService.existsByUsername(request.getUsername())) {
            responseObserver.onError(Status.ALREADY_EXISTS
                    .withDescription("Username already taken: " + request.getUsername())
                    .asRuntimeException());
            return;
        }

        UserEntity entity = userService.create(
                request.getUsername(),
                request.getEmail(),
                request.getDisplayName(),
                request.getBio()
        );

        responseObserver.onNext(userMapper.toProto(entity));
        responseObserver.onCompleted();
    }

    @Override
    public void listUsers(ListUsersRequest request,
                          StreamObserver<User> responseObserver) {
        // Server streaming: send users one by one
        int pageSize = request.getPageSize() > 0 ? request.getPageSize() : 100;

        userService.streamAll(request.getFilter(), pageSize)
                .forEach(entity -> {
                    responseObserver.onNext(userMapper.toProto(entity));
                });

        responseObserver.onCompleted();
    }

    @Override
    public StreamObserver<CreateUserRequest> bulkCreateUsers(
            StreamObserver<BulkCreateResponse> responseObserver) {

        // Client streaming: receive multiple create requests
        return new StreamObserver<>() {
            private final AtomicInteger created = new AtomicInteger(0);
            private final AtomicInteger failed = new AtomicInteger(0);
            private final List<BulkCreateError> errors =
                    Collections.synchronizedList(new ArrayList<>());
            private int index = 0;

            @Override
            public void onNext(CreateUserRequest request) {
                try {
                    userService.create(
                            request.getUsername(),
                            request.getEmail(),
                            request.getDisplayName(),
                            request.getBio());
                    created.incrementAndGet();
                } catch (Exception e) {
                    failed.incrementAndGet();
                    errors.add(BulkCreateError.newBuilder()
                            .setIndex(index)
                            .setMessage(e.getMessage())
                            .build());
                }
                index++;
            }

            @Override
            public void onError(Throwable t) {
                log.error("Error in bulk create stream", t);
            }

            @Override
            public void onCompleted() {
                responseObserver.onNext(BulkCreateResponse.newBuilder()
                        .setCreatedCount(created.get())
                        .setFailedCount(failed.get())
                        .addAllErrors(errors)
                        .build());
                responseObserver.onCompleted();
            }
        };
    }
}
```

### Server Configuration

```yaml
grpc:
  server:
    port: 9090
    security:
      enabled: false               # Enable for TLS
      cert-chain: classpath:certs/server.crt
      private-key: classpath:certs/server.key
    max-inbound-message-size: 4MB
    max-inbound-metadata-size: 8KB
    keep-alive-time: 30s
    keep-alive-timeout: 5s
    permit-keep-alive-time: 5m
```

## Client Stubs

### Client Configuration

```yaml
grpc:
  client:
    user-service:
      address: dns:///user-service:9090
      negotiation-type: plaintext    # Use TLS in production
      enable-keep-alive: true
      keep-alive-time: 30s
      keep-alive-timeout: 5s
      deadline-after: 5s             # Default deadline for all calls
```

### Using @GrpcClient

```java
@Service
public class OrderService {

    @GrpcClient("user-service")
    private UserServiceGrpc.UserServiceBlockingStub userStub;

    @GrpcClient("user-service")
    private UserServiceGrpc.UserServiceFutureStub userFutureStub;

    @GrpcClient("user-service")
    private UserServiceGrpc.UserServiceStub userAsyncStub;

    public OrderResponse createOrder(CreateOrderRequest request) {
        // Blocking call with deadline
        User user;
        try {
            user = userStub
                    .withDeadlineAfter(3, TimeUnit.SECONDS)
                    .getUser(GetUserRequest.newBuilder()
                            .setId(request.getUserId())
                            .build());
        } catch (StatusRuntimeException e) {
            if (e.getStatus().getCode() == Status.Code.NOT_FOUND) {
                throw new UserNotFoundException(request.getUserId());
            }
            if (e.getStatus().getCode() == Status.Code.DEADLINE_EXCEEDED) {
                throw new ServiceTimeoutException("User service timeout");
            }
            throw new ServiceUnavailableException("User service error", e);
        }

        // Process order with user data...
        return processOrder(request, user);
    }

    // Async call example
    public CompletableFuture<User> getUserAsync(String userId) {
        ListenableFuture<User> future = userFutureStub
                .withDeadlineAfter(3, TimeUnit.SECONDS)
                .getUser(GetUserRequest.newBuilder().setId(userId).build());

        return toCompletableFuture(future);
    }

    private <T> CompletableFuture<T> toCompletableFuture(ListenableFuture<T> lf) {
        CompletableFuture<T> cf = new CompletableFuture<>();
        Futures.addCallback(lf, new FutureCallback<>() {
            @Override
            public void onSuccess(T result) { cf.complete(result); }

            @Override
            public void onFailure(Throwable t) { cf.completeExceptionally(t); }
        }, MoreExecutors.directExecutor());
        return cf;
    }
}
```

## Streaming Patterns

### Server Streaming: Real-Time Feed

```java
// Server side
@Override
public void watchOrderStatus(WatchOrderRequest request,
                              StreamObserver<OrderStatusUpdate> responseObserver) {
    String orderId = request.getOrderId();

    // Register the observer for push updates
    orderStatusRegistry.register(orderId, update -> {
        responseObserver.onNext(update);
    });

    // Send current status immediately
    OrderStatusUpdate current = orderService.getCurrentStatus(orderId);
    responseObserver.onNext(current);

    // Stream stays open until client cancels or order reaches terminal state
}

// Client side
public void watchOrder(String orderId, Consumer<OrderStatusUpdate> callback) {
    userAsyncStub.watchOrderStatus(
            WatchOrderRequest.newBuilder().setOrderId(orderId).build(),
            new StreamObserver<>() {
                @Override
                public void onNext(OrderStatusUpdate update) {
                    callback.accept(update);
                }

                @Override
                public void onError(Throwable t) {
                    log.error("Watch stream error for order {}", orderId, t);
                    // Reconnect after delay
                    scheduler.schedule(() -> watchOrder(orderId, callback),
                            5, TimeUnit.SECONDS);
                }

                @Override
                public void onCompleted() {
                    log.info("Watch stream completed for order {}", orderId);
                }
            });
}
```

### Bidirectional Streaming: Chat

```java
@Override
public StreamObserver<ChatMessage> chat(StreamObserver<ChatMessage> responseObserver) {
    String sessionId = UUID.randomUUID().toString();
    chatSessions.put(sessionId, responseObserver);

    return new StreamObserver<>() {
        @Override
        public void onNext(ChatMessage message) {
            // Broadcast to all other sessions
            chatSessions.forEach((id, observer) -> {
                if (!id.equals(sessionId)) {
                    try {
                        observer.onNext(message);
                    } catch (StatusRuntimeException e) {
                        chatSessions.remove(id);
                    }
                }
            });
        }

        @Override
        public void onError(Throwable t) {
            chatSessions.remove(sessionId);
        }

        @Override
        public void onCompleted() {
            chatSessions.remove(sessionId);
            responseObserver.onCompleted();
        }
    };
}
```

## Error Handling with Rich Status

gRPC uses status codes (similar to HTTP status codes but more specific):

```java
@GrpcService
public class UserGrpcService extends UserServiceGrpc.UserServiceImplBase {

    @Override
    public void createUser(CreateUserRequest request,
                           StreamObserver<User> responseObserver) {
        // Rich error details using com.google.rpc.Status
        List<String> violations = validate(request);
        if (!violations.isEmpty()) {
            com.google.rpc.Status status = com.google.rpc.Status.newBuilder()
                    .setCode(Code.INVALID_ARGUMENT.getNumber())
                    .setMessage("Validation failed")
                    .addDetails(Any.pack(BadRequest.newBuilder()
                            .addAllFieldViolations(violations.stream()
                                    .map(v -> BadRequest.FieldViolation.newBuilder()
                                            .setField(v.split(":")[0])
                                            .setDescription(v.split(":")[1])
                                            .build())
                                    .toList())
                            .build()))
                    .build();

            responseObserver.onError(StatusProto.toStatusRuntimeException(status));
            return;
        }

        // ... create user
    }
}
```

## Interceptors

### Server Interceptor: Logging and Metrics

```java
@Component
public class GrpcServerLoggingInterceptor implements ServerInterceptor {

    private final MeterRegistry meterRegistry;

    @Override
    public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(
            ServerCall<ReqT, RespT> call,
            Metadata headers,
            ServerCallHandler<ReqT, RespT> next) {

        String methodName = call.getMethodDescriptor().getFullMethodName();
        long startTime = System.nanoTime();
        Timer.Sample sample = Timer.start(meterRegistry);

        // Extract correlation ID
        String correlationId = headers.get(
                Metadata.Key.of("x-correlation-id", Metadata.ASCII_STRING_MARSHALLER));
        if (correlationId == null) {
            correlationId = UUID.randomUUID().toString();
        }
        MDC.put("correlationId", correlationId);

        log.info("gRPC call started: {}", methodName);

        return new ForwardingServerCallListener.SimpleForwardingServerCallListener<>(
                next.startCall(new ForwardingServerCall.SimpleForwardingServerCall<>(call) {
                    @Override
                    public void close(Status status, Metadata trailers) {
                        long duration = System.nanoTime() - startTime;
                        sample.stop(Timer.builder("grpc.server.calls")
                                .tag("method", methodName)
                                .tag("status", status.getCode().name())
                                .register(meterRegistry));

                        log.info("gRPC call completed: {} status={} duration={}ms",
                                methodName, status.getCode(),
                                TimeUnit.NANOSECONDS.toMillis(duration));
                        MDC.clear();

                        super.close(status, trailers);
                    }
                }, headers)) {};
    }
}
```

## Health Checks

```java
@Component
public class GrpcHealthService extends HealthGrpc.HealthImplBase {

    private final Map<String, HealthCheckResponse.ServingStatus> statusMap =
            new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        // Overall service status
        statusMap.put("", HealthCheckResponse.ServingStatus.SERVING);
        statusMap.put("user.v1.UserService", HealthCheckResponse.ServingStatus.SERVING);
    }

    @Override
    public void check(HealthCheckRequest request,
                      StreamObserver<HealthCheckResponse> responseObserver) {
        String service = request.getService();
        HealthCheckResponse.ServingStatus status =
                statusMap.getOrDefault(service, HealthCheckResponse.ServingStatus.SERVICE_UNKNOWN);

        responseObserver.onNext(HealthCheckResponse.newBuilder()
                .setStatus(status)
                .build());
        responseObserver.onCompleted();
    }

    public void setStatus(String service, HealthCheckResponse.ServingStatus status) {
        statusMap.put(service, status);
    }
}
```

## gRPC vs REST Decision Guide

| Scenario | Recommendation |
|----------|---------------|
| Public API consumed by browsers | REST — gRPC-Web adds complexity |
| Internal service-to-service calls | gRPC — better performance, type safety |
| Streaming data (real-time feeds) | gRPC — native bidirectional streaming |
| Simple CRUD with few consumers | REST — simpler tooling and debugging |
| Polyglot microservices | gRPC — code generation for all languages |
| High-throughput, low-latency | gRPC — binary serialization, HTTP/2 multiplexing |
| Mobile clients (bandwidth-sensitive) | gRPC — 5-10x smaller payloads |

gRPC excels at internal service-to-service communication where performance and type safety matter. For external-facing APIs, REST remains the pragmatic choice. Many production systems use both — gRPC internally, REST (or GraphQL) externally — with an API gateway handling the translation at the boundary.
