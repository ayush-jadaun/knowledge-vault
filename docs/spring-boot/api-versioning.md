---
title: "API Versioning"
description: "Complete guide to API versioning in Spring Boot — URL path versioning, header versioning, content negotiation, deprecation strategies, backward compatibility patterns, and managing multiple API versions in production"
tags: [spring-boot, api-versioning, rest, backward-compatibility, api-design]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# API Versioning

Every API changes. New fields appear, old fields become irrelevant, business logic evolves, and data structures are redesigned. Without versioning, every change risks breaking existing clients — mobile apps that cannot be force-updated, third-party integrations, partner systems with their own release cycles. API versioning lets you evolve your API while keeping existing clients working.

The challenge is not choosing a versioning strategy — it is managing multiple versions in production without drowning in duplicated code, and eventually retiring old versions without stranding clients.

## Versioning Strategies

### Strategy 1: URL Path Versioning

The most common approach. The version is part of the URL:

```
GET /api/v1/users/123
GET /api/v2/users/123
GET /api/v3/users/123
```

```java
@RestController
@RequestMapping("/api/v1/users")
public class UserControllerV1 {

    @GetMapping("/{id}")
    public ResponseEntity<UserResponseV1> getUser(@PathVariable String id) {
        User user = userService.findById(id);
        return ResponseEntity.ok(UserResponseV1.from(user));
    }
}

@RestController
@RequestMapping("/api/v2/users")
public class UserControllerV2 {

    @GetMapping("/{id}")
    public ResponseEntity<UserResponseV2> getUser(@PathVariable String id) {
        User user = userService.findById(id);
        return ResponseEntity.ok(UserResponseV2.from(user));
    }
}
```

**Pros:** Visible, easy to understand, easy to route, cacheable.
**Cons:** URL changes break bookmarks; new version requires new endpoints even for unchanged resources.

### Strategy 2: Header Versioning

The version is in a custom request header:

```
GET /api/users/123
X-API-Version: 2
```

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping(value = "/{id}", headers = "X-API-Version=1")
    public ResponseEntity<UserResponseV1> getUserV1(@PathVariable String id) {
        User user = userService.findById(id);
        return ResponseEntity.ok(UserResponseV1.from(user));
    }

    @GetMapping(value = "/{id}", headers = "X-API-Version=2")
    public ResponseEntity<UserResponseV2> getUserV2(@PathVariable String id) {
        User user = userService.findById(id);
        return ResponseEntity.ok(UserResponseV2.from(user));
    }
}
```

**Pros:** Clean URLs. Same URL for all versions.
**Cons:** Not visible in URLs; harder to test in browser; requires header documentation.

### Strategy 3: Content Negotiation (Accept Header)

The version is encoded in the media type:

```
GET /api/users/123
Accept: application/vnd.myapp.v2+json
```

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping(value = "/{id}",
                produces = "application/vnd.myapp.v1+json")
    public ResponseEntity<UserResponseV1> getUserV1(@PathVariable String id) {
        return ResponseEntity.ok(UserResponseV1.from(userService.findById(id)));
    }

    @GetMapping(value = "/{id}",
                produces = "application/vnd.myapp.v2+json")
    public ResponseEntity<UserResponseV2> getUserV2(@PathVariable String id) {
        return ResponseEntity.ok(UserResponseV2.from(userService.findById(id)));
    }
}
```

**Pros:** RESTfully correct (content negotiation is an HTTP standard). Clean URLs.
**Cons:** Complex media types; harder for clients; poor browser testing.

### Strategy 4: Query Parameter

```
GET /api/users/123?version=2
```

**Pros:** Simple to add. Easy to test.
**Cons:** Not standard; version is an API concern, not a query filter; breaks caching if cache ignores query params.

## Recommended: URL Path with Shared Logic

URL path versioning is the most widely adopted because it is the simplest for consumers. The key is sharing business logic between versions:

```
┌──────────────────────────────────────────────────────┐
│                 Controller Layer                      │
│  ┌────────────────────┐  ┌────────────────────┐      │
│  │ UserControllerV1    │  │ UserControllerV2    │     │
│  │ Maps to V1 DTOs    │  │ Maps to V2 DTOs    │      │
│  └────────┬───────────┘  └────────┬───────────┘      │
│           │                       │                   │
│           └───────────┬───────────┘                   │
│                       ▼                               │
│  ┌────────────────────────────────────────────┐      │
│  │           UserService (shared)              │      │
│  │  Business logic is version-agnostic         │      │
│  └────────────────────────────────────────────┘      │
│                       │                               │
│                       ▼                               │
│  ┌────────────────────────────────────────────┐      │
│  │         UserRepository (shared)             │      │
│  └────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────┘
```

### Version-Specific DTOs

```java
// V1 response — original design
public record UserResponseV1(
        String id,
        String name,          // Full name as single field
        String email,
        String phone
) {
    public static UserResponseV1 from(User user) {
        return new UserResponseV1(
                user.getId(),
                user.getFirstName() + " " + user.getLastName(),
                user.getEmail(),
                user.getPhone()
        );
    }
}

// V2 response — split name into first/last, add new fields
public record UserResponseV2(
        String id,
        String firstName,
        String lastName,
        String email,
        String phone,
        String avatarUrl,
        UserStatus status,
        Instant createdAt
) {
    public static UserResponseV2 from(User user) {
        return new UserResponseV2(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getPhone(),
                user.getAvatarUrl(),
                user.getStatus(),
                user.getCreatedAt()
        );
    }
}
```

### Custom Annotation for Version Routing

Reduce boilerplate with a custom annotation:

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RequestMapping
public @interface ApiVersion {
    int value();
}

public class ApiVersionRequestMappingHandlerMapping
        extends RequestMappingHandlerMapping {

    @Override
    protected RequestMappingInfo getMappingForMethod(Method method,
                                                      Class<?> handlerType) {
        RequestMappingInfo info = super.getMappingForMethod(method, handlerType);
        if (info == null) return null;

        ApiVersion apiVersion = AnnotationUtils.findAnnotation(
                handlerType, ApiVersion.class);
        if (apiVersion != null) {
            String prefix = "/api/v" + apiVersion.value();
            return RequestMappingInfo.paths(prefix).build().combine(info);
        }
        return info;
    }

    @Override
    protected boolean isHandler(Class<?> beanType) {
        return super.isHandler(beanType)
                || AnnotationUtils.findAnnotation(beanType, ApiVersion.class) != null;
    }
}

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Bean
    public ApiVersionRequestMappingHandlerMapping apiVersionMapping() {
        ApiVersionRequestMappingHandlerMapping mapping =
                new ApiVersionRequestMappingHandlerMapping();
        mapping.setOrder(0); // Higher priority
        return mapping;
    }
}
```

Usage:

```java
@ApiVersion(1)
@RestController
@RequestMapping("/users")
public class UserControllerV1 {
    // Maps to /api/v1/users
    @GetMapping("/{id}")
    public UserResponseV1 getUser(@PathVariable String id) { ... }
}

@ApiVersion(2)
@RestController
@RequestMapping("/users")
public class UserControllerV2 {
    // Maps to /api/v2/users
    @GetMapping("/{id}")
    public UserResponseV2 getUser(@PathVariable String id) { ... }
}
```

## Deprecation Strategy

### Deprecation Headers

Signal to clients that a version is deprecated:

```java
@Component
public class DeprecationFilter extends OncePerRequestFilter {

    private static final Map<String, DeprecationInfo> DEPRECATED_VERSIONS = Map.of(
            "/api/v1/", new DeprecationInfo(
                    "2026-06-01",
                    "API v1 is deprecated. Migrate to v2. See https://docs.example.com/migration",
                    "/api/v2/"
            )
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();
        for (Map.Entry<String, DeprecationInfo> entry : DEPRECATED_VERSIONS.entrySet()) {
            if (path.startsWith(entry.getKey())) {
                DeprecationInfo info = entry.getValue();
                response.setHeader("Deprecation", info.deprecationDate());
                response.setHeader("Sunset", info.sunsetDate());
                response.setHeader("Link", "<" + info.successorUrl()
                        + ">; rel=\"successor-version\"");
                response.setHeader("X-Deprecation-Notice", info.message());
                break;
            }
        }

        filterChain.doFilter(request, response);
    }
}
```

### Deprecation Monitoring

Track which clients still use deprecated versions:

```java
@Aspect
@Component
public class DeprecatedApiMonitoringAspect {

    private final MeterRegistry meterRegistry;

    @Before("execution(* com.example.controller.v1..*.*(..))")
    public void trackV1Usage(JoinPoint joinPoint) {
        HttpServletRequest request = getCurrentRequest();
        String clientId = resolveClientId(request);
        String endpoint = joinPoint.getSignature().toShortString();

        meterRegistry.counter("api.deprecated.usage",
                "version", "v1",
                "endpoint", endpoint,
                "client", clientId)
                .increment();

        log.warn("Deprecated API v1 called: {} by client {}",
                endpoint, clientId);
    }
}
```

## Backward Compatibility Patterns

### Additive Changes (Non-Breaking)

These changes never require a new version:

```java
// Adding a new optional field — existing clients ignore it
public record UserResponseV2(
        String id,
        String firstName,
        String lastName,
        String email,
        String phone,
        String avatarUrl,    // NEW — clients that don't know about it just ignore
        UserStatus status    // NEW — same
) {}

// Adding a new endpoint — existing clients don't call it
@GetMapping("/users/{id}/preferences")  // NEW endpoint
public Preferences getUserPreferences(@PathVariable String id) { ... }

// Adding a new optional query parameter
@GetMapping("/users")
public List<User> listUsers(
        @RequestParam(required = false) String status,   // Existing
        @RequestParam(required = false) String sortBy) { // NEW — optional
    ...
}
```

### Breaking Changes (Require New Version)

- Removing or renaming a field
- Changing a field's type
- Making an optional field required
- Changing the URL structure
- Modifying error response format
- Changing authentication mechanism

### Version Negotiation with Default

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    private static final int LATEST_VERSION = 3;
    private static final int MIN_SUPPORTED_VERSION = 2;

    @GetMapping("/{id}")
    public ResponseEntity<?> getUser(
            @PathVariable String id,
            @RequestHeader(value = "X-API-Version",
                           defaultValue = "3") int version) {

        if (version < MIN_SUPPORTED_VERSION) {
            return ResponseEntity.status(HttpStatus.GONE)
                    .body(Map.of(
                            "error", "api_version_unsupported",
                            "message", "API v" + version
                                    + " is no longer supported. Minimum: v"
                                    + MIN_SUPPORTED_VERSION,
                            "minimum_version", MIN_SUPPORTED_VERSION,
                            "latest_version", LATEST_VERSION));
        }

        User user = userService.findById(id);
        return switch (version) {
            case 2 -> ResponseEntity.ok(UserResponseV2.from(user));
            case 3 -> ResponseEntity.ok(UserResponseV3.from(user));
            default -> ResponseEntity.ok(UserResponseV3.from(user));
        };
    }
}
```

## Version Lifecycle

```
Version State Timeline:
─────────────────────────────────────────────────────────

v1  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░
    Active              Deprecated    Sunset    Removed

v2  ░░░░░░████████████████████████████░░░░░░░░░░░░░░
         Active                       Deprecated

v3  ░░░░░░░░░░░░░░░░████████████████████████████████
                     Active (current)

████ = Active (fully supported)
░░░░ = Not yet released / Deprecated / Removed
```

### Lifecycle Management

```java
@Component
public class ApiVersionLifecycle {

    public enum VersionStatus { ACTIVE, DEPRECATED, SUNSET, REMOVED }

    private static final Map<Integer, VersionInfo> VERSIONS = Map.of(
            1, new VersionInfo(VersionStatus.REMOVED,
                    LocalDate.of(2025, 1, 1), LocalDate.of(2025, 6, 1)),
            2, new VersionInfo(VersionStatus.DEPRECATED,
                    LocalDate.of(2025, 6, 1), LocalDate.of(2026, 6, 1)),
            3, new VersionInfo(VersionStatus.ACTIVE, null, null)
    );

    public VersionStatus getStatus(int version) {
        VersionInfo info = VERSIONS.get(version);
        return info != null ? info.status() : VersionStatus.REMOVED;
    }

    public boolean isSupported(int version) {
        VersionStatus status = getStatus(version);
        return status == VersionStatus.ACTIVE
                || status == VersionStatus.DEPRECATED;
    }
}
```

## Testing Multiple Versions

```java
@SpringBootTest
@AutoConfigureMockMvc
class ApiVersioningTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void v1ShouldReturnCombinedName() throws Exception {
        mockMvc.perform(get("/api/v1/users/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("John Doe"))
                .andExpect(jsonPath("$.firstName").doesNotExist());
    }

    @Test
    void v2ShouldReturnSplitName() throws Exception {
        mockMvc.perform(get("/api/v2/users/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.firstName").value("John"))
                .andExpect(jsonPath("$.lastName").value("Doe"))
                .andExpect(jsonPath("$.name").doesNotExist());
    }

    @Test
    void v1ShouldIncludeDeprecationHeaders() throws Exception {
        mockMvc.perform(get("/api/v1/users/1"))
                .andExpect(header().exists("Deprecation"))
                .andExpect(header().exists("Sunset"))
                .andExpect(header().string("Link",
                        containsString("successor-version")));
    }

    @Test
    void contractTestV2ResponseShape() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v2/users/1"))
                .andExpect(status().isOk())
                .andReturn();

        // Validate against JSON Schema
        String json = result.getResponse().getContentAsString();
        assertThat(JsonSchemaValidator.isValid(json, "schemas/user-v2.json"))
                .isTrue();
    }
}
```

## Guidelines

| Guideline | Rationale |
|-----------|-----------|
| Prefer additive changes | Adding fields is not breaking; always prefer it over versioning |
| Support at most 2-3 active versions | More versions = more maintenance burden |
| Deprecate for at least 6 months | Give clients time to migrate |
| Monitor deprecated version usage | Know when it is safe to remove |
| Document migration guides | Make it easy for clients to upgrade |
| Use contract tests | Catch accidental breaking changes in CI |
| Version the API, not the resources | `/api/v2/users`, not `/api/users/v2` |

API versioning is a necessary evil. The best API version strategy is to need as few versions as possible. Design your API for extensibility from day one — use objects instead of flat fields, make new fields optional, use enums that can grow. When you must version, URL path versioning with shared business logic is the pragmatic choice that works for most teams.
