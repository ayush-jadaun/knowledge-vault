---
title: "OpenAPI/Swagger"
description: "Complete guide to API documentation with OpenAPI in Spring Boot — springdoc-openapi setup, @Operation and @Schema annotations, schema customization, API grouping, code generation from spec, CI validation, and best practices for maintainable API docs"
tags: [spring-boot, openapi, swagger, documentation, api]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# OpenAPI/Swagger

API documentation that does not match the actual API is worse than no documentation — it actively misleads consumers. OpenAPI (formerly Swagger) solves this by generating documentation directly from your code, ensuring the docs always match the implementation. With `springdoc-openapi`, Spring Boot can automatically generate an OpenAPI 3.x specification from your controllers, DTOs, and validation annotations, serving both a machine-readable JSON/YAML spec and a human-readable Swagger UI.

## Setup

### Dependencies

```xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.5.0</version>
</dependency>
```

This gives you:
- **Swagger UI** at `/swagger-ui.html`
- **OpenAPI spec** at `/v3/api-docs` (JSON) and `/v3/api-docs.yaml` (YAML)

### Configuration

```yaml
springdoc:
  api-docs:
    path: /v3/api-docs
    enabled: true
  swagger-ui:
    path: /swagger-ui.html
    enabled: true
    tags-sorter: alpha
    operations-sorter: method
    display-request-duration: true
    try-it-out-enabled: true
    filter: true
  default-produces-media-type: application/json
  default-consumes-media-type: application/json
  show-actuator: false
  packages-to-scan: com.example.controller
  paths-to-match: /api/**
```

### Global OpenAPI Configuration

```java
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("MyApp API")
                        .version("2.0.0")
                        .description("""
                            RESTful API for MyApp platform.

                            ## Authentication
                            All endpoints require a Bearer token in the Authorization header.
                            Obtain a token via `POST /api/auth/login`.

                            ## Rate Limits
                            - Free tier: 60 requests/minute
                            - Pro tier: 600 requests/minute

                            ## Errors
                            All errors follow the standard error response format.
                            """)
                        .contact(new Contact()
                                .name("API Support")
                                .email("api-support@example.com")
                                .url("https://docs.example.com"))
                        .license(new License()
                                .name("MIT")
                                .url("https://opensource.org/licenses/MIT")))
                .externalDocs(new ExternalDocumentation()
                        .description("Full Developer Guide")
                        .url("https://docs.example.com/guide"))
                .addSecurityItem(new SecurityRequirement()
                        .addList("bearerAuth"))
                .components(new Components()
                        .addSecuritySchemes("bearerAuth",
                                new SecurityScheme()
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")
                                        .description("JWT access token")));
    }
}
```

## Annotating Controllers

### @Operation and @ApiResponse

```java
@RestController
@RequestMapping("/api/users")
@Tag(name = "Users", description = "User management endpoints")
public class UserController {

    @Operation(
            summary = "Get user by ID",
            description = "Returns a single user by their unique identifier. " +
                    "Requires authentication.",
            operationId = "getUserById"
    )
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "User found",
                    content = @Content(
                            mediaType = "application/json",
                            schema = @Schema(implementation = UserResponse.class)
                    )
            ),
            @ApiResponse(
                    responseCode = "404",
                    description = "User not found",
                    content = @Content(
                            mediaType = "application/json",
                            schema = @Schema(implementation = ErrorResponse.class)
                    )
            ),
            @ApiResponse(
                    responseCode = "401",
                    description = "Not authenticated",
                    content = @Content(schema = @Schema(implementation = ErrorResponse.class))
            )
    })
    @GetMapping("/{id}")
    public ResponseEntity<UserResponse> getUser(
            @Parameter(description = "User ID", example = "usr_abc123", required = true)
            @PathVariable String id) {
        return userService.findById(id)
                .map(UserResponse::from)
                .map(ResponseEntity::ok)
                .orElseThrow(() -> new UserNotFoundException(id));
    }

    @Operation(
            summary = "Create a new user",
            description = "Creates a new user account. Email must be unique."
    )
    @ApiResponse(responseCode = "201", description = "User created successfully")
    @ApiResponse(responseCode = "400", description = "Invalid input")
    @ApiResponse(responseCode = "409", description = "Email already exists")
    @PostMapping
    public ResponseEntity<UserResponse> createUser(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    description = "User registration data",
                    required = true,
                    content = @Content(schema = @Schema(implementation = CreateUserRequest.class))
            )
            @Valid @RequestBody CreateUserRequest request) {
        User user = userService.create(request);
        return ResponseEntity
                .created(URI.create("/api/users/" + user.getId()))
                .body(UserResponse.from(user));
    }

    @Operation(summary = "List users with pagination and filtering")
    @GetMapping
    public ResponseEntity<PagedResponse<UserResponse>> listUsers(
            @Parameter(description = "Page number (0-based)", example = "0")
            @RequestParam(defaultValue = "0") int page,

            @Parameter(description = "Page size", example = "20")
            @RequestParam(defaultValue = "20") @Max(100) int size,

            @Parameter(description = "Filter by status",
                       schema = @Schema(allowableValues = {"ACTIVE", "INACTIVE", "SUSPENDED"}))
            @RequestParam(required = false) String status,

            @Parameter(description = "Sort field and direction",
                       example = "createdAt,desc")
            @RequestParam(defaultValue = "createdAt,desc") String sort) {
        // ...
    }

    @Operation(
            summary = "Delete a user",
            description = "Permanently deletes a user. Requires ADMIN role.",
            security = @SecurityRequirement(name = "bearerAuth")
    )
    @ApiResponse(responseCode = "204", description = "User deleted")
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteUser(@PathVariable String id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

### @Schema on DTOs

```java
@Schema(description = "User creation request")
public record CreateUserRequest(

        @Schema(
                description = "User's email address",
                example = "john.doe@example.com",
                requiredMode = Schema.RequiredMode.REQUIRED,
                format = "email",
                maxLength = 255
        )
        @NotBlank @Email
        String email,

        @Schema(
                description = "Display name",
                example = "John Doe",
                requiredMode = Schema.RequiredMode.REQUIRED,
                minLength = 2,
                maxLength = 100
        )
        @NotBlank @Size(min = 2, max = 100)
        String displayName,

        @Schema(
                description = "Password (min 8 chars, must include uppercase, lowercase, digit)",
                example = "SecureP4ss!",
                requiredMode = Schema.RequiredMode.REQUIRED,
                minLength = 8,
                format = "password"
        )
        @NotBlank @Size(min = 8)
        String password,

        @Schema(
                description = "User's role",
                defaultValue = "USER",
                allowableValues = {"USER", "ADMIN", "MODERATOR"}
        )
        String role
) {}

@Schema(description = "User response")
public record UserResponse(

        @Schema(description = "Unique user identifier", example = "usr_abc123")
        String id,

        @Schema(description = "User's email", example = "john@example.com")
        String email,

        @Schema(description = "Display name", example = "John Doe")
        String displayName,

        @Schema(description = "Account status")
        UserStatus status,

        @Schema(description = "Account creation timestamp",
                example = "2026-03-25T10:30:00Z")
        Instant createdAt
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(), user.getEmail(), user.getDisplayName(),
                user.getStatus(), user.getCreatedAt());
    }
}

@Schema(description = "Standard error response")
public record ErrorResponse(

        @Schema(description = "Machine-readable error code", example = "USER_NOT_FOUND")
        String code,

        @Schema(description = "Human-readable error message",
                example = "User with ID usr_abc123 was not found")
        String message,

        @Schema(description = "Timestamp of the error")
        Instant timestamp,

        @Schema(description = "Request path that caused the error", example = "/api/users/usr_abc123")
        String path,

        @Schema(description = "Field-level validation errors")
        List<FieldError> fieldErrors
) {}
```

## API Grouping

Organize large APIs into logical groups:

```java
@Configuration
public class OpenApiGroupConfig {

    @Bean
    public GroupedOpenApi publicApi() {
        return GroupedOpenApi.builder()
                .group("public")
                .displayName("Public API")
                .pathsToMatch("/api/v2/**")
                .pathsToExclude("/api/v2/admin/**")
                .build();
    }

    @Bean
    public GroupedOpenApi adminApi() {
        return GroupedOpenApi.builder()
                .group("admin")
                .displayName("Admin API")
                .pathsToMatch("/api/v2/admin/**")
                .addOpenApiCustomizer(openApi ->
                        openApi.info(new Info()
                                .title("Admin API")
                                .version("2.0.0")
                                .description("Administrative endpoints. Requires ADMIN role.")))
                .build();
    }

    @Bean
    public GroupedOpenApi internalApi() {
        return GroupedOpenApi.builder()
                .group("internal")
                .displayName("Internal API")
                .pathsToMatch("/internal/**")
                .build();
    }
}
```

Swagger UI shows a dropdown to switch between groups.

## Customization

### Global Response Codes

Apply common response codes to all endpoints:

```java
@Bean
public OpenApiCustomizer globalResponseCustomizer() {
    return openApi -> {
        openApi.getPaths().values().forEach(pathItem ->
                pathItem.readOperations().forEach(operation -> {
                    ApiResponses responses = operation.getResponses();

                    responses.addApiResponse("401", new ApiResponse()
                            .description("Not authenticated")
                            .content(new Content().addMediaType("application/json",
                                    new MediaType().schema(new Schema<>().$ref("#/components/schemas/ErrorResponse")))));

                    responses.addApiResponse("500", new ApiResponse()
                            .description("Internal server error")
                            .content(new Content().addMediaType("application/json",
                                    new MediaType().schema(new Schema<>().$ref("#/components/schemas/ErrorResponse")))));
                }));
    };
}
```

### Hiding Endpoints

```java
// Hide from docs entirely
@Operation(hidden = true)
@GetMapping("/internal/health")
public String internalHealth() { ... }

// Or use @Hidden on the class
@Hidden
@RestController
@RequestMapping("/debug")
public class DebugController { ... }
```

### Enum Documentation

```java
@Schema(description = "Order status", enumAsRef = true)
public enum OrderStatus {
    @Schema(description = "Order has been placed but not yet processed")
    PENDING,

    @Schema(description = "Order is being prepared")
    PROCESSING,

    @Schema(description = "Order has been shipped")
    SHIPPED,

    @Schema(description = "Order has been delivered")
    DELIVERED,

    @Schema(description = "Order has been cancelled")
    CANCELLED
}
```

## Code Generation from OpenAPI Spec

### Server Stub Generation (API-First)

Write the OpenAPI spec first, generate the Spring controller interfaces:

```xml
<plugin>
    <groupId>org.openapitools</groupId>
    <artifactId>openapi-generator-maven-plugin</artifactId>
    <version>7.5.0</version>
    <executions>
        <execution>
            <goals><goal>generate</goal></goals>
            <configuration>
                <inputSpec>${project.basedir}/src/main/resources/openapi/api.yaml</inputSpec>
                <generatorName>spring</generatorName>
                <apiPackage>com.example.api</apiPackage>
                <modelPackage>com.example.model</modelPackage>
                <configOptions>
                    <interfaceOnly>true</interfaceOnly>
                    <useSpringBoot3>true</useSpringBoot3>
                    <useTags>true</useTags>
                    <dateLibrary>java8</dateLibrary>
                </configOptions>
            </configuration>
        </execution>
    </executions>
</plugin>
```

Then implement the generated interfaces:

```java
@RestController
public class UserControllerImpl implements UsersApi {

    @Override
    public ResponseEntity<UserResponse> getUserById(String id) {
        // Implementation
    }
}
```

### Client SDK Generation

Generate client libraries for consumers:

```bash
# Generate TypeScript client
openapi-generator-cli generate \
  -i http://localhost:8080/v3/api-docs \
  -g typescript-fetch \
  -o ./generated/typescript-client

# Generate Python client
openapi-generator-cli generate \
  -i http://localhost:8080/v3/api-docs \
  -g python \
  -o ./generated/python-client
```

## CI Validation

### Validate Spec Has No Breaking Changes

```java
// In your test suite
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OpenApiSpecTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void specShouldBeValid() {
        ResponseEntity<String> response = restTemplate.getForEntity(
                "/v3/api-docs", String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        // Parse and validate
        OpenAPI spec = new OpenAPIParser()
                .readContents(response.getBody(), null, null)
                .getOpenAPI();

        assertThat(spec).isNotNull();
        assertThat(spec.getPaths()).isNotEmpty();
        assertThat(spec.getInfo().getVersion()).isEqualTo("2.0.0");
    }

    @Test
    void allEndpointsShouldHaveDescriptions() {
        ResponseEntity<String> response = restTemplate.getForEntity(
                "/v3/api-docs", String.class);

        OpenAPI spec = new OpenAPIParser()
                .readContents(response.getBody(), null, null)
                .getOpenAPI();

        spec.getPaths().forEach((path, item) -> {
            item.readOperations().forEach(op -> {
                assertThat(op.getSummary())
                        .as("Missing summary for operation at " + path)
                        .isNotBlank();
            });
        });
    }
}
```

### Export Spec in CI

```yaml
# GitHub Actions
- name: Export OpenAPI spec
  run: |
    mvn spring-boot:run &
    sleep 15
    curl -o openapi-spec.json http://localhost:8080/v3/api-docs
    kill %1

- name: Upload spec artifact
  uses: actions/upload-artifact@v4
  with:
    name: openapi-spec
    path: openapi-spec.json
```

## Disable in Production

```java
@Configuration
@Profile("!prod")
public class SwaggerConfig {
    // Only enable Swagger UI in non-production environments
}
```

```yaml
# application-prod.yml
springdoc:
  swagger-ui:
    enabled: false
  api-docs:
    enabled: false     # Disable spec endpoint in production
```

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Add `@Operation(summary=...)` to every endpoint | Swagger UI is unusable without summaries |
| Use `@Schema(example=...)` on DTO fields | Examples make the "Try it out" feature useful |
| Group APIs logically | Large APIs need organization |
| Validate spec in CI | Catch missing docs before merge |
| Version the spec alongside the code | Spec version matches API version |
| Generate client SDKs from spec | Single source of truth |
| Disable Swagger UI in production | Security exposure and performance |
| Document error responses | Consumers need to handle errors |

OpenAPI documentation serves two audiences: human developers who read the Swagger UI, and automated tools that consume the machine-readable spec for code generation, testing, and monitoring. Invest time in making both readable and accurate, because inaccurate API documentation is the leading cause of integration failures.
