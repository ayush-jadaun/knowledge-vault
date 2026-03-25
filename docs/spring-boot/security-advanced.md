---
title: "Advanced Security"
description: "Complete guide to advanced Spring Security — method-level security with @PreAuthorize and custom SpEL expressions, RBAC and permission-based authorization, audit logging for security events, custom security event handling, penetration testing preparation, and defense-in-depth patterns"
tags: [spring-boot, security, rbac, authorization, audit]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Advanced Security

Basic Spring Security — form login, HTTP Basic, URL-pattern authorization — handles authentication and coarse-grained access control. But production applications need more: method-level authorization based on the resource being accessed ("can this user edit this specific document?"), audit trails for compliance ("who accessed this patient record and when?"), custom security expressions that encode business rules, and defense-in-depth patterns that catch security bugs before they become breaches.

This guide covers the advanced security patterns that distinguish a secure application from one that merely has a login page.

## Method-Level Security

### Enabling Method Security

```java
@Configuration
@EnableMethodSecurity(
    prePostEnabled = true,    // @PreAuthorize, @PostAuthorize
    securedEnabled = true,    // @Secured
    jsr250Enabled = true      // @RolesAllowed
)
public class MethodSecurityConfig {
}
```

### @PreAuthorize

Evaluated **before** the method executes. If the expression returns `false`, an `AccessDeniedException` is thrown:

```java
@Service
public class UserService {

    // Simple role check
    @PreAuthorize("hasRole('ADMIN')")
    public List<User> findAll() {
        return userRepository.findAll();
    }

    // Multiple roles
    @PreAuthorize("hasAnyRole('ADMIN', 'MODERATOR')")
    public void suspendUser(String userId) {
        // ...
    }

    // Check specific authority
    @PreAuthorize("hasAuthority('user:delete')")
    public void deleteUser(String userId) {
        // ...
    }

    // Access method parameters
    @PreAuthorize("#userId == authentication.name or hasRole('ADMIN')")
    public UserProfile getProfile(String userId) {
        // Users can view their own profile, admins can view any
        return userRepository.findById(userId).map(UserProfile::from).orElseThrow();
    }

    // Complex SpEL expression
    @PreAuthorize("""
        hasRole('ADMIN') or
        (hasRole('MANAGER') and @departmentService.isManager(authentication.name, #departmentId))
    """)
    public List<Employee> getEmployees(String departmentId) {
        return employeeRepository.findByDepartmentId(departmentId);
    }
}
```

### @PostAuthorize

Evaluated **after** the method executes. Has access to the return value via `returnObject`. Useful when you cannot determine access rights without fetching the resource first:

```java
@Service
public class DocumentService {

    @PostAuthorize("returnObject.ownerId == authentication.name or hasRole('ADMIN')")
    public Document getDocument(String documentId) {
        return documentRepository.findById(documentId)
                .orElseThrow(() -> new DocumentNotFoundException(documentId));
    }

    @PostFilter("filterObject.department == authentication.principal.department or hasRole('ADMIN')")
    public List<Report> getReports() {
        return reportRepository.findAll();
    }

    @PreFilter("filterObject.assigneeId == authentication.name or hasRole('ADMIN')")
    public void batchUpdateTasks(List<Task> tasks) {
        // Only tasks the user owns (or admin) are passed through
        taskRepository.saveAll(tasks);
    }
}
```

## Custom Security Expressions

### Custom Method Security Expression Root

```java
public class CustomMethodSecurityExpressionRoot
        extends SecurityExpressionRoot
        implements MethodSecurityExpressionOperations {

    private Object filterObject;
    private Object returnObject;
    private Object target;

    private final PermissionService permissionService;

    public CustomMethodSecurityExpressionRoot(
            Authentication authentication,
            PermissionService permissionService) {
        super(authentication);
        this.permissionService = permissionService;
    }

    /**
     * Custom expression: @PreAuthorize("isResourceOwner(#resourceId)")
     */
    public boolean isResourceOwner(String resourceId) {
        String userId = getAuthentication().getName();
        return permissionService.isOwner(userId, resourceId);
    }

    /**
     * Custom expression: @PreAuthorize("hasPermission('document', 'write')")
     */
    public boolean hasPermission(String resource, String action) {
        String userId = getAuthentication().getName();
        return permissionService.hasPermission(userId, resource, action);
    }

    /**
     * Custom expression: @PreAuthorize("isMemberOfTeam(#teamId)")
     */
    public boolean isMemberOfTeam(String teamId) {
        String userId = getAuthentication().getName();
        return permissionService.isTeamMember(userId, teamId);
    }

    /**
     * Custom expression: @PreAuthorize("canAccessPatientRecord(#patientId)")
     */
    public boolean canAccessPatientRecord(String patientId) {
        String userId = getAuthentication().getName();
        return permissionService.canAccessPatient(userId, patientId);
    }

    // Required method implementations
    @Override public void setFilterObject(Object o) { this.filterObject = o; }
    @Override public Object getFilterObject() { return filterObject; }
    @Override public void setReturnObject(Object o) { this.returnObject = o; }
    @Override public Object getReturnObject() { return returnObject; }
    @Override public Object getThis() { return target; }
}
```

### Registering the Custom Expression Handler

```java
@Configuration
@EnableMethodSecurity
public class MethodSecurityConfig {

    @Bean
    public MethodSecurityExpressionHandler methodSecurityExpressionHandler(
            PermissionService permissionService) {
        DefaultMethodSecurityExpressionHandler handler =
                new DefaultMethodSecurityExpressionHandler() {
            @Override
            protected MethodSecurityExpressionOperations createSecurityExpressionRoot(
                    Authentication authentication,
                    MethodInvocation invocation) {
                CustomMethodSecurityExpressionRoot root =
                        new CustomMethodSecurityExpressionRoot(
                                authentication, permissionService);
                root.setPermissionEvaluator(getPermissionEvaluator());
                root.setTrustResolver(getTrustResolver());
                root.setRoleHierarchy(getRoleHierarchy());
                return root;
            }
        };
        return handler;
    }
}
```

Usage:

```java
@Service
public class PatientService {

    @PreAuthorize("canAccessPatientRecord(#patientId)")
    public PatientRecord getPatientRecord(String patientId) {
        return patientRepository.findById(patientId).orElseThrow();
    }

    @PreAuthorize("isResourceOwner(#documentId) or hasRole('ADMIN')")
    public void deleteDocument(String documentId) {
        documentRepository.deleteById(documentId);
    }

    @PreAuthorize("isMemberOfTeam(#teamId)")
    public List<Project> getTeamProjects(String teamId) {
        return projectRepository.findByTeamId(teamId);
    }
}
```

## RBAC Implementation

### Role and Permission Model

```java
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    private String username;
    private String passwordHash;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "user_roles",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id"))
    private Set<Role> roles = new HashSet<>();
}

@Entity
@Table(name = "roles")
public class Role {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    private String name; // ADMIN, MANAGER, USER, VIEWER

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "role_permissions",
            joinColumns = @JoinColumn(name = "role_id"),
            inverseJoinColumns = @JoinColumn(name = "permission_id"))
    private Set<Permission> permissions = new HashSet<>();
}

@Entity
@Table(name = "permissions")
public class Permission {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    private String resource;    // "document", "user", "report"
    private String action;      // "read", "write", "delete", "admin"

    public String getAuthority() {
        return resource + ":" + action;  // "document:write"
    }
}
```

### UserDetailsService with Permissions

```java
@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException(
                        "User not found: " + username));

        Set<GrantedAuthority> authorities = new HashSet<>();

        for (Role role : user.getRoles()) {
            // Add role
            authorities.add(new SimpleGrantedAuthority("ROLE_" + role.getName()));

            // Add permissions from role
            for (Permission permission : role.getPermissions()) {
                authorities.add(
                        new SimpleGrantedAuthority(permission.getAuthority()));
            }
        }

        return new org.springframework.security.core.userdetails.User(
                user.getUsername(),
                user.getPasswordHash(),
                authorities
        );
    }
}
```

### Role Hierarchy

```java
@Bean
public RoleHierarchy roleHierarchy() {
    return RoleHierarchyImpl.withDefaultRolePrefix()
            .role("ADMIN").implies("MANAGER")
            .role("MANAGER").implies("USER")
            .role("USER").implies("VIEWER")
            .build();
}
```

With this hierarchy, ADMIN automatically has all permissions of MANAGER, USER, and VIEWER.

## Audit Logging

### Security Event Listener

```java
@Component
@Slf4j
public class SecurityAuditListener {

    private final AuditEventRepository auditRepository;

    @EventListener
    public void onAuthenticationSuccess(AuthenticationSuccessEvent event) {
        String username = event.getAuthentication().getName();
        HttpServletRequest request = getCurrentRequest();

        auditRepository.add(new AuditEvent(
                username,
                "AUTHENTICATION_SUCCESS",
                Map.of(
                        "ip", getClientIp(request),
                        "userAgent", request.getHeader("User-Agent"),
                        "timestamp", Instant.now().toString()
                )
        ));

        log.info("Authentication success: user={}, ip={}",
                username, getClientIp(request));
    }

    @EventListener
    public void onAuthenticationFailure(AbstractAuthenticationFailureEvent event) {
        String username = event.getAuthentication().getName();
        HttpServletRequest request = getCurrentRequest();

        auditRepository.add(new AuditEvent(
                username,
                "AUTHENTICATION_FAILURE",
                Map.of(
                        "ip", getClientIp(request),
                        "reason", event.getException().getMessage(),
                        "timestamp", Instant.now().toString()
                )
        ));

        log.warn("Authentication failure: user={}, ip={}, reason={}",
                username, getClientIp(request),
                event.getException().getMessage());
    }

    @EventListener
    public void onAccessDenied(AuthorizationDeniedEvent event) {
        Authentication auth = event.getAuthentication().get();
        log.warn("Access denied: user={}, source={}",
                auth.getName(), event.getSource());

        auditRepository.add(new AuditEvent(
                auth.getName(),
                "ACCESS_DENIED",
                Map.of(
                        "resource", event.getSource().toString(),
                        "timestamp", Instant.now().toString()
                )
        ));
    }
}
```

### Persistent Audit Repository

```java
@Entity
@Table(name = "security_audit_log", indexes = {
    @Index(name = "idx_audit_principal", columnList = "principal"),
    @Index(name = "idx_audit_timestamp", columnList = "timestamp"),
    @Index(name = "idx_audit_event_type", columnList = "event_type")
})
public class SecurityAuditEntry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String principal;
    private String eventType;
    private Instant timestamp;
    private String ipAddress;
    private String userAgent;
    private String details;
    private String resource;
    private boolean success;
}

@Repository
public class JpaAuditEventRepository implements AuditEventRepository {

    private final SecurityAuditEntryRepository entryRepository;

    @Override
    public void add(AuditEvent event) {
        SecurityAuditEntry entry = new SecurityAuditEntry();
        entry.setPrincipal(event.getPrincipal());
        entry.setEventType(event.getType());
        entry.setTimestamp(event.getTimestamp());
        entry.setDetails(serializeData(event.getData()));
        entry.setIpAddress(
                (String) event.getData().getOrDefault("ip", "unknown"));
        entryRepository.save(entry);
    }

    @Override
    public List<AuditEvent> find(String principal, Instant after, String type) {
        return entryRepository
                .findByPrincipalAndTimestampAfterAndEventType(
                        principal, after, type)
                .stream()
                .map(this::toAuditEvent)
                .toList();
    }
}
```

### Data Access Auditing

```java
@Aspect
@Component
public class DataAccessAuditAspect {

    private final SecurityAuditService auditService;

    @Around("@annotation(audited)")
    public Object auditDataAccess(ProceedingJoinPoint joinPoint,
                                   AuditDataAccess audited) throws Throwable {
        String userId = SecurityContextHolder.getContext()
                .getAuthentication().getName();
        String resource = audited.resource();
        String action = audited.action();
        String resourceId = extractResourceId(joinPoint.getArgs());

        try {
            Object result = joinPoint.proceed();

            auditService.logAccess(DataAccessAuditEntry.builder()
                    .userId(userId)
                    .resource(resource)
                    .action(action)
                    .resourceId(resourceId)
                    .success(true)
                    .timestamp(Instant.now())
                    .ipAddress(getClientIp())
                    .build());

            return result;
        } catch (Exception e) {
            auditService.logAccess(DataAccessAuditEntry.builder()
                    .userId(userId)
                    .resource(resource)
                    .action(action)
                    .resourceId(resourceId)
                    .success(false)
                    .errorMessage(e.getMessage())
                    .timestamp(Instant.now())
                    .build());
            throw e;
        }
    }
}

// Usage
@AuditDataAccess(resource = "patient_record", action = "read")
public PatientRecord getPatientRecord(String patientId) {
    return patientRepo.findById(patientId).orElseThrow();
}
```

## Security Event Monitoring

### Brute Force Detection

```java
@Component
public class BruteForceProtectionService {

    private final Cache<String, AtomicInteger> failedAttempts;

    public BruteForceProtectionService() {
        this.failedAttempts = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(15))
                .maximumSize(10_000)
                .build();
    }

    public void recordFailedLogin(String identifier) {
        AtomicInteger attempts = failedAttempts.get(identifier,
                k -> new AtomicInteger(0));
        int count = attempts.incrementAndGet();

        if (count >= 5) {
            log.warn("Brute force detected: {} has {} failed attempts",
                    identifier, count);
        }

        if (count >= 10) {
            log.error("Account lockout triggered: {}", identifier);
            // Temporarily lock the account or IP
        }
    }

    public boolean isBlocked(String identifier) {
        AtomicInteger attempts = failedAttempts.getIfPresent(identifier);
        return attempts != null && attempts.get() >= 10;
    }

    public void recordSuccessfulLogin(String identifier) {
        failedAttempts.invalidate(identifier);
    }
}
```

## Penetration Testing Preparation

### Security Headers

```java
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    return http
            .headers(headers -> headers
                    .contentTypeOptions(Customizer.withDefaults())       // X-Content-Type-Options: nosniff
                    .frameOptions(frame -> frame.deny())                  // X-Frame-Options: DENY
                    .xssProtection(xss -> xss.headerValue(
                            XXssProtectionHeaderWriter.HeaderValue.ENABLED_MODE_BLOCK))
                    .httpStrictTransportSecurity(hsts -> hsts
                            .includeSubDomains(true)
                            .maxAgeInSeconds(31536000))
                    .contentSecurityPolicy(csp -> csp
                            .policyDirectives("default-src 'self'; " +
                                    "script-src 'self'; " +
                                    "style-src 'self' 'unsafe-inline'; " +
                                    "img-src 'self' data:; " +
                                    "connect-src 'self'"))
                    .referrerPolicy(referrer -> referrer
                            .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                    .permissionsPolicy(permissions -> permissions
                            .policy("geolocation=(), camera=(), microphone=()")))
            .build();
}
```

### Common Vulnerability Checklist

| Vulnerability | Prevention |
|--------------|-----------|
| SQL Injection | Parameterized queries (JPA/Hibernate), input validation |
| XSS | Content-Security-Policy, output encoding, `HttpOnly` cookies |
| CSRF | CSRF tokens (enabled by default for form-based auth) |
| IDOR | `@PostAuthorize` to verify resource ownership |
| Mass Assignment | Use DTOs with explicit fields, never bind directly to entities |
| Broken Authentication | Rate limit login, MFA, secure password hashing (BCrypt) |
| Security Misconfiguration | Disable Swagger in prod, hide error details, secure Actuator |
| Sensitive Data Exposure | TLS everywhere, encrypt at rest, mask in logs |
| Broken Access Control | Method-level security, principle of least privilege |
| Logging & Monitoring | Audit all auth events, alert on anomalies |

## Testing Security

```java
@WebMvcTest(UserController.class)
@Import(SecurityConfig.class)
class UserControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldRejectUnauthenticatedRequest() throws Exception {
        mockMvc.perform(get("/api/users"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(roles = "USER")
    void shouldAllowAuthenticatedUser() throws Exception {
        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "USER")
    void shouldDenyAdminEndpointForRegularUser() throws Exception {
        mockMvc.perform(delete("/api/users/123"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void shouldAllowAdminEndpoint() throws Exception {
        mockMvc.perform(delete("/api/users/123"))
                .andExpect(status().isNoContent());
    }

    @Test
    @WithMockUser(username = "user-123")
    void shouldAllowOwnerToAccessOwnProfile() throws Exception {
        mockMvc.perform(get("/api/users/user-123/profile"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "user-456")
    void shouldDenyAccessToOtherUserProfile() throws Exception {
        mockMvc.perform(get("/api/users/user-123/profile"))
                .andExpect(status().isForbidden());
    }
}
```

Security is not a feature you add at the end — it is a property of every line of code. Method-level security ensures that even if a URL-pattern rule is wrong, the service layer catches unauthorized access. Audit logging ensures that when (not if) a breach occurs, you can trace exactly what was accessed. And defense-in-depth means that a single bug does not compromise the entire system. Security is layers, and every layer you skip is a vulnerability waiting to be found.
