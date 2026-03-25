---
title: "Spring Security Deep Dive"
description: "In-depth guide to Spring Security — SecurityFilterChain internals, custom AuthenticationProvider, UserDetailsService, remember-me, session management, concurrent session control, security events and auditing, custom access decision voters, integration testing, and common vulnerability prevention."
tags: [spring-security, authentication, authorization, filters, java]
difficulty: advanced
prerequisites: [spring-boot-fundamentals, http-basics, authentication-concepts]
lastReviewed: "2026-03-25"
---

# Spring Security Deep Dive

Spring Security is the standard security framework for Spring applications. It provides authentication, authorization, protection against common exploits, and integration with external identity providers. This guide goes beyond the basics to cover the internal architecture and advanced customization patterns.

## 1. SecurityFilterChain Internals

Every HTTP request passes through a chain of servlet filters. Spring Security inserts a `DelegatingFilterProxy` that delegates to a `FilterChainProxy`, which manages one or more `SecurityFilterChain` instances.

```
HTTP Request
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ DelegatingFilterProxy ("springSecurityFilterChain")  │
│   └─ FilterChainProxy                               │
│       ├─ SecurityFilterChain #1 (e.g., /api/**)     │
│       │   ├─ DisableEncodeUrlFilter                  │
│       │   ├─ SecurityContextHolderFilter             │
│       │   ├─ HeaderWriterFilter                      │
│       │   ├─ CorsFilter                              │
│       │   ├─ CsrfFilter                              │
│       │   ├─ LogoutFilter                            │
│       │   ├─ UsernamePasswordAuthenticationFilter    │
│       │   ├─ BearerTokenAuthenticationFilter         │
│       │   ├─ RequestCacheAwareFilter                 │
│       │   ├─ SecurityContextHolderAwareRequestFilter │
│       │   ├─ SessionManagementFilter                 │
│       │   ├─ ExceptionTranslationFilter              │
│       │   └─ AuthorizationFilter                     │
│       └─ SecurityFilterChain #2 (e.g., /**)          │
└─────────────────────────────────────────────────────┘
```

### 1.1 Multiple SecurityFilterChains

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    // API endpoints — stateless, JWT-based
    @Bean
    @Order(1)
    public SecurityFilterChain apiSecurityFilterChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher("/api/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/public/**").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE).hasRole("ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 ->
                        oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(
                                jwtAuthenticationConverter())))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(new BearerTokenAuthenticationEntryPoint())
                        .accessDeniedHandler(new BearerTokenAccessDeniedHandler()))
                .build();
    }

    // Web UI — session-based, form login
    @Bean
    @Order(2)
    public SecurityFilterChain webSecurityFilterChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher("/**")
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/", "/login", "/register", "/css/**",
                                "/js/**", "/images/**").permitAll()
                        .requestMatchers("/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .formLogin(form -> form
                        .loginPage("/login")
                        .defaultSuccessUrl("/dashboard")
                        .failureUrl("/login?error=true")
                        .usernameParameter("email")
                        .passwordParameter("password"))
                .logout(logout -> logout
                        .logoutUrl("/logout")
                        .logoutSuccessUrl("/login?logout=true")
                        .deleteCookies("JSESSIONID", "remember-me")
                        .invalidateHttpSession(true))
                .rememberMe(remember -> remember
                        .key("uniqueAndSecretKey")
                        .tokenValiditySeconds(86400 * 30)
                        .rememberMeParameter("remember-me"))
                .build();
    }
}
```

### 1.2 Custom Filter

```java
public class ApiKeyAuthenticationFilter extends OncePerRequestFilter {

    private static final String API_KEY_HEADER = "X-API-Key";
    private final ApiKeyService apiKeyService;

    public ApiKeyAuthenticationFilter(ApiKeyService apiKeyService) {
        this.apiKeyService = apiKeyService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain)
            throws ServletException, IOException {

        String apiKey = request.getHeader(API_KEY_HEADER);

        if (apiKey != null) {
            try {
                ApiKeyDetails details = apiKeyService.validateKey(apiKey);
                ApiKeyAuthenticationToken authentication =
                        new ApiKeyAuthenticationToken(details, details.getAuthorities());
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (InvalidApiKeyException e) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.getWriter().write("{\"error\": \"Invalid API key\"}");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/partner/");
    }
}

// Custom authentication token
public class ApiKeyAuthenticationToken extends AbstractAuthenticationToken {

    private final ApiKeyDetails principal;

    public ApiKeyAuthenticationToken(ApiKeyDetails principal,
                                      Collection<? extends GrantedAuthority> authorities) {
        super(authorities);
        this.principal = principal;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return principal;
    }
}

// Register the filter
@Bean
public SecurityFilterChain partnerApiChain(HttpSecurity http,
                                            ApiKeyService apiKeyService) throws Exception {
    return http
            .securityMatcher("/api/partner/**")
            .addFilterBefore(new ApiKeyAuthenticationFilter(apiKeyService),
                    UsernamePasswordAuthenticationFilter.class)
            .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
            .csrf(csrf -> csrf.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .build();
}
```

## 2. Custom AuthenticationProvider

```java
@Component
public class LdapFallbackAuthenticationProvider implements AuthenticationProvider {

    private final LdapAuthenticator ldapAuthenticator;
    private final UserDetailsService localUserDetailsService;
    private final PasswordEncoder passwordEncoder;

    public LdapFallbackAuthenticationProvider(LdapAuthenticator ldapAuthenticator,
                                               UserDetailsService localUserDetailsService,
                                               PasswordEncoder passwordEncoder) {
        this.ldapAuthenticator = ldapAuthenticator;
        this.localUserDetailsService = localUserDetailsService;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public Authentication authenticate(Authentication authentication)
            throws AuthenticationException {

        String username = authentication.getName();
        String password = authentication.getCredentials().toString();

        // Try LDAP first
        try {
            DirContextOperations ctx = ldapAuthenticator.authenticate(
                    new UsernamePasswordAuthenticationToken(username, password));

            List<GrantedAuthority> authorities = extractLdapAuthorities(ctx);
            return new UsernamePasswordAuthenticationToken(username, null, authorities);

        } catch (AuthenticationException ldapEx) {
            // Fall back to local database
            try {
                UserDetails userDetails = localUserDetailsService.loadUserByUsername(username);
                if (passwordEncoder.matches(password, userDetails.getPassword())) {
                    return new UsernamePasswordAuthenticationToken(
                            userDetails, null, userDetails.getAuthorities());
                }
                throw new BadCredentialsException("Invalid credentials");
            } catch (UsernameNotFoundException e) {
                throw new BadCredentialsException(
                        "User not found in LDAP or local database");
            }
        }
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return UsernamePasswordAuthenticationToken.class.isAssignableFrom(authentication);
    }

    private List<GrantedAuthority> extractLdapAuthorities(DirContextOperations ctx) {
        String[] groups = ctx.getStringAttributes("memberOf");
        if (groups == null) return List.of();
        return Arrays.stream(groups)
                .map(group -> new SimpleGrantedAuthority("ROLE_" +
                        extractCN(group).toUpperCase()))
                .collect(Collectors.toList());
    }

    private String extractCN(String dn) {
        return dn.split(",")[0].replace("CN=", "");
    }
}
```

### 2.1 Multi-Factor Authentication Provider

```java
@Component
public class MfaAuthenticationProvider implements AuthenticationProvider {

    private final UserDetailsService userDetailsService;
    private final PasswordEncoder passwordEncoder;
    private final TotpService totpService;

    public MfaAuthenticationProvider(UserDetailsService userDetailsService,
                                      PasswordEncoder passwordEncoder,
                                      TotpService totpService) {
        this.userDetailsService = userDetailsService;
        this.passwordEncoder = passwordEncoder;
        this.totpService = totpService;
    }

    @Override
    public Authentication authenticate(Authentication authentication)
            throws AuthenticationException {

        MfaAuthenticationToken mfaToken = (MfaAuthenticationToken) authentication;
        String username = mfaToken.getName();
        String password = mfaToken.getCredentials().toString();
        String totpCode = mfaToken.getTotpCode();

        UserDetails user = userDetailsService.loadUserByUsername(username);

        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new BadCredentialsException("Invalid password");
        }

        if (user instanceof MfaUserDetails mfaUser && mfaUser.isMfaEnabled()) {
            if (totpCode == null || totpCode.isBlank()) {
                throw new MfaRequiredException("MFA code required");
            }
            if (!totpService.verifyCode(mfaUser.getMfaSecret(), totpCode)) {
                throw new BadCredentialsException("Invalid MFA code");
            }
        }

        return new UsernamePasswordAuthenticationToken(
                user, null, user.getAuthorities());
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return MfaAuthenticationToken.class.isAssignableFrom(authentication);
    }
}
```

## 3. Custom UserDetailsService

```java
@Service
public class DatabaseUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public DatabaseUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        AppUser user = userRepository.findByEmailWithRoles(username)
                .orElseThrow(() -> new UsernameNotFoundException(
                        "User not found: " + username));

        if (!user.isEmailVerified()) {
            throw new DisabledException("Email not verified");
        }

        if (user.isAccountLocked()) {
            throw new LockedException("Account locked until " + user.getLockExpiresAt());
        }

        return new org.springframework.security.core.userdetails.User(
                user.getEmail(),
                user.getPasswordHash(),
                user.isEnabled(),
                !user.isAccountExpired(),
                !user.isCredentialsExpired(),
                !user.isAccountLocked(),
                mapAuthorities(user)
        );
    }

    private Collection<? extends GrantedAuthority> mapAuthorities(AppUser user) {
        Set<GrantedAuthority> authorities = new HashSet<>();

        for (Role role : user.getRoles()) {
            authorities.add(new SimpleGrantedAuthority("ROLE_" + role.getName()));
            for (Permission permission : role.getPermissions()) {
                authorities.add(new SimpleGrantedAuthority(permission.getName()));
            }
        }

        return authorities;
    }
}

// Entity with roles and permissions
@Entity
@Table(name = "users")
public class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    private boolean enabled = true;
    private boolean emailVerified = false;
    private boolean accountLocked = false;
    private boolean accountExpired = false;
    private boolean credentialsExpired = false;
    private LocalDateTime lockExpiresAt;
    private int failedLoginAttempts;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "user_roles",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id"))
    private Set<Role> roles = new HashSet<>();

    // getters, setters
}

@Entity
@Table(name = "roles")
public class Role {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true)
    private String name;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "role_permissions",
            joinColumns = @JoinColumn(name = "role_id"),
            inverseJoinColumns = @JoinColumn(name = "permission_id"))
    private Set<Permission> permissions = new HashSet<>();
}
```

## 4. Session Management

### 4.1 Concurrent Session Control

```java
@Bean
public SecurityFilterChain sessionSecurityChain(HttpSecurity http) throws Exception {
    return http
            .sessionManagement(session -> session
                    .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                    .maximumSessions(2)                  // max 2 concurrent sessions
                    .maxSessionsPreventsLogin(false)      // false = kick oldest session
                    .expiredSessionStrategy(event -> {
                        HttpServletResponse response = event.getResponse();
                        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                        response.getWriter().write(
                                "{\"error\": \"Session expired — logged in from another device\"}");
                    })
                    .sessionRegistry(sessionRegistry()))
            .sessionManagement(session -> session
                    .sessionFixation().migrateSession()  // prevent session fixation
                    .invalidSessionUrl("/login?expired"))
            .build();
}

@Bean
public SessionRegistry sessionRegistry() {
    return new SessionRegistryImpl();
}

// Expose session information via REST
@RestController
@RequestMapping("/api/admin/sessions")
public class SessionController {

    private final SessionRegistry sessionRegistry;

    public SessionController(SessionRegistry sessionRegistry) {
        this.sessionRegistry = sessionRegistry;
    }

    @GetMapping
    public List<SessionInfo> getActiveSessions() {
        return sessionRegistry.getAllPrincipals().stream()
                .flatMap(principal -> sessionRegistry
                        .getAllSessions(principal, false).stream()
                        .map(session -> new SessionInfo(
                                principal.toString(),
                                session.getSessionId(),
                                session.getLastRequest(),
                                session.isExpired())))
                .toList();
    }

    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Void> invalidateSession(@PathVariable String sessionId) {
        SessionInformation info = sessionRegistry
                .getSessionInformation(sessionId);
        if (info != null) {
            info.expireNow();
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }
}
```

### 4.2 Redis Session Storage

```java
@Configuration
@EnableRedisHttpSession(maxInactiveIntervalInSeconds = 3600)
public class RedisSessionConfig {

    @Bean
    public LettuceConnectionFactory connectionFactory() {
        return new LettuceConnectionFactory(
                new RedisStandaloneConfiguration("localhost", 6379));
    }

    @Bean
    public CookieSerializer cookieSerializer() {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setCookieName("SESSION");
        serializer.setCookiePath("/");
        serializer.setDomainNamePattern("^.+?\\.(\\w+\\.[a-z]+)$");
        serializer.setSameSite("Lax");
        serializer.setUseSecureCookie(true);
        serializer.setUseHttpOnlyCookie(true);
        return serializer;
    }
}
```

## 5. Security Events and Auditing

```java
@Component
public class SecurityEventListener {

    private static final Logger log = LoggerFactory.getLogger(SecurityEventListener.class);
    private final AuditEventRepository auditRepository;
    private final AccountLockoutService lockoutService;

    public SecurityEventListener(AuditEventRepository auditRepository,
                                  AccountLockoutService lockoutService) {
        this.auditRepository = auditRepository;
        this.lockoutService = lockoutService;
    }

    @EventListener
    public void onAuthenticationSuccess(AuthenticationSuccessEvent event) {
        String username = event.getAuthentication().getName();
        log.info("Successful login: {}", username);

        auditRepository.save(new SecurityAuditEvent(
                username, "LOGIN_SUCCESS",
                Map.of("authorities", event.getAuthentication().getAuthorities().toString())
        ));

        lockoutService.resetFailedAttempts(username);
    }

    @EventListener
    public void onAuthenticationFailure(AbstractAuthenticationFailureEvent event) {
        String username = event.getAuthentication().getName();
        String reason = event.getException().getClass().getSimpleName();
        log.warn("Failed login for {}: {}", username, reason);

        auditRepository.save(new SecurityAuditEvent(
                username, "LOGIN_FAILURE",
                Map.of("reason", reason,
                       "message", event.getException().getMessage())
        ));

        lockoutService.recordFailedAttempt(username);
    }

    @EventListener
    public void onAuthorizationDenied(AuthorizationDeniedEvent<?> event) {
        log.warn("Access denied: {} attempted to access protected resource",
                event.getAuthentication().get().getName());

        auditRepository.save(new SecurityAuditEvent(
                event.getAuthentication().get().getName(),
                "ACCESS_DENIED",
                Map.of()
        ));
    }

    @EventListener
    public void onSessionCreated(SessionCreatedEvent event) {
        log.debug("Session created: {}", event.getSessionId());
    }

    @EventListener
    public void onSessionDestroyed(SessionDestroyedEvent event) {
        log.debug("Session destroyed: {}", event.getId());
    }
}

@Service
public class AccountLockoutService {

    private static final int MAX_ATTEMPTS = 5;
    private static final Duration LOCKOUT_DURATION = Duration.ofMinutes(30);

    private final UserRepository userRepository;

    public AccountLockoutService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional
    public void recordFailedAttempt(String username) {
        userRepository.findByEmail(username).ifPresent(user -> {
            int attempts = user.getFailedLoginAttempts() + 1;
            user.setFailedLoginAttempts(attempts);

            if (attempts >= MAX_ATTEMPTS) {
                user.setAccountLocked(true);
                user.setLockExpiresAt(LocalDateTime.now().plus(LOCKOUT_DURATION));
            }

            userRepository.save(user);
        });
    }

    @Transactional
    public void resetFailedAttempts(String username) {
        userRepository.findByEmail(username).ifPresent(user -> {
            user.setFailedLoginAttempts(0);
            user.setAccountLocked(false);
            user.setLockExpiresAt(null);
            userRepository.save(user);
        });
    }
}
```

## 6. Method-Level Security

```java
@Configuration
@EnableMethodSecurity(prePostEnabled = true, securedEnabled = true)
public class MethodSecurityConfig {

    @Bean
    public MethodSecurityExpressionHandler methodSecurityExpressionHandler(
            PermissionEvaluator permissionEvaluator) {
        DefaultMethodSecurityExpressionHandler handler =
                new DefaultMethodSecurityExpressionHandler();
        handler.setPermissionEvaluator(permissionEvaluator);
        return handler;
    }
}

@Service
public class DocumentService {

    private final DocumentRepository documentRepository;

    public DocumentService(DocumentRepository documentRepository) {
        this.documentRepository = documentRepository;
    }

    @PreAuthorize("hasRole('ADMIN') or hasAuthority('DOCUMENT_READ')")
    public Document findById(Long id) {
        return documentRepository.findById(id)
                .orElseThrow(() -> new DocumentNotFoundException(id));
    }

    @PreAuthorize("hasRole('ADMIN') or @documentSecurity.isOwner(#id, authentication)")
    public void deleteDocument(Long id) {
        documentRepository.deleteById(id);
    }

    @PostAuthorize("returnObject.owner == authentication.name or hasRole('ADMIN')")
    public Document getDocument(Long id) {
        return documentRepository.findById(id)
                .orElseThrow(() -> new DocumentNotFoundException(id));
    }

    @PreFilter("filterObject.status != 'DRAFT' or hasRole('ADMIN')")
    public List<Document> publishDocuments(List<Document> documents) {
        return documentRepository.saveAll(documents);
    }

    @PostFilter("filterObject.confidential == false or hasAuthority('VIEW_CONFIDENTIAL')")
    public List<Document> findAll() {
        return documentRepository.findAll();
    }

    // Using custom PermissionEvaluator
    @PreAuthorize("hasPermission(#id, 'Document', 'WRITE')")
    public Document updateDocument(Long id, DocumentUpdateRequest request) {
        Document doc = documentRepository.findById(id)
                .orElseThrow(() -> new DocumentNotFoundException(id));
        doc.setTitle(request.getTitle());
        doc.setContent(request.getContent());
        return documentRepository.save(doc);
    }
}

// Custom PermissionEvaluator
@Component
public class CustomPermissionEvaluator implements PermissionEvaluator {

    private final DocumentAccessRepository accessRepository;

    public CustomPermissionEvaluator(DocumentAccessRepository accessRepository) {
        this.accessRepository = accessRepository;
    }

    @Override
    public boolean hasPermission(Authentication auth, Object targetId,
                                  Object targetType, Object permission) {
        if (auth == null || targetId == null || targetType == null) {
            return false;
        }

        String username = auth.getName();
        Long entityId = (Long) targetId;
        String type = targetType.toString();
        String perm = permission.toString();

        return accessRepository.hasAccess(username, type, entityId, perm);
    }

    @Override
    public boolean hasPermission(Authentication auth, Serializable targetId,
                                  String targetType, Object permission) {
        return hasPermission(auth, targetId, (Object) targetType, permission);
    }
}

// Security helper bean referenced in SpEL
@Component("documentSecurity")
public class DocumentSecurityHelper {

    private final DocumentRepository documentRepository;

    public DocumentSecurityHelper(DocumentRepository documentRepository) {
        this.documentRepository = documentRepository;
    }

    public boolean isOwner(Long documentId, Authentication authentication) {
        return documentRepository.findById(documentId)
                .map(doc -> doc.getOwner().equals(authentication.getName()))
                .orElse(false);
    }
}
```

## 7. JWT Configuration

```java
@Configuration
public class JwtConfig {

    @Bean
    public JwtDecoder jwtDecoder(@Value("${jwt.public-key-location}") RSAPublicKey publicKey) {
        return NimbusJwtDecoder.withPublicKey(publicKey)
                .signatureAlgorithm(SignatureAlgorithm.RS256)
                .build();
    }

    @Bean
    public JwtEncoder jwtEncoder(
            @Value("${jwt.public-key-location}") RSAPublicKey publicKey,
            @Value("${jwt.private-key-location}") RSAPrivateKey privateKey) {
        JWK jwk = new RSAKey.Builder(publicKey)
                .privateKey(privateKey)
                .build();
        return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(jwk)));
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter grantedAuthoritiesConverter =
                new JwtGrantedAuthoritiesConverter();
        grantedAuthoritiesConverter.setAuthoritiesClaimName("roles");
        grantedAuthoritiesConverter.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(grantedAuthoritiesConverter);
        return converter;
    }
}

@Service
public class TokenService {

    private final JwtEncoder jwtEncoder;

    public TokenService(JwtEncoder jwtEncoder) {
        this.jwtEncoder = jwtEncoder;
    }

    public TokenPair generateTokens(Authentication authentication) {
        Instant now = Instant.now();
        String scope = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.joining(" "));

        // Access token — short-lived
        JwtClaimsSet accessClaims = JwtClaimsSet.builder()
                .issuer("myapp")
                .issuedAt(now)
                .expiresAt(now.plus(15, ChronoUnit.MINUTES))
                .subject(authentication.getName())
                .claim("roles", scope)
                .claim("type", "access")
                .build();

        String accessToken = jwtEncoder.encode(
                JwtEncoderParameters.from(accessClaims)).getTokenValue();

        // Refresh token — long-lived
        JwtClaimsSet refreshClaims = JwtClaimsSet.builder()
                .issuer("myapp")
                .issuedAt(now)
                .expiresAt(now.plus(7, ChronoUnit.DAYS))
                .subject(authentication.getName())
                .claim("type", "refresh")
                .id(UUID.randomUUID().toString())
                .build();

        String refreshToken = jwtEncoder.encode(
                JwtEncoderParameters.from(refreshClaims)).getTokenValue();

        return new TokenPair(accessToken, refreshToken,
                now.plus(15, ChronoUnit.MINUTES));
    }
}
```

## 8. CORS and CSRF Configuration

```java
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    return http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf
                    .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                    .csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler())
                    .ignoringRequestMatchers("/api/webhooks/**"))
            .build();
}

@Bean
public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of(
            "https://app.example.com",
            "https://admin.example.com"
    ));
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH"));
    config.setAllowedHeaders(List.of(
            "Authorization", "Content-Type", "X-Requested-With",
            "X-CSRF-TOKEN"
    ));
    config.setExposedHeaders(List.of("X-Total-Count", "Link"));
    config.setAllowCredentials(true);
    config.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
}

// SPA CSRF handler for React/Angular frontends
public class SpaCsrfTokenRequestHandler extends CsrfTokenRequestAttributeHandler {

    private final CsrfTokenRequestHandler delegate = new XorCsrfTokenRequestAttributeHandler();

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       Supplier<CsrfToken> csrfToken) {
        this.delegate.handle(request, response, csrfToken);
    }

    @Override
    public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
        if (StringUtils.hasText(request.getHeader(csrfToken.getHeaderName()))) {
            return super.resolveCsrfTokenValue(request, csrfToken);
        }
        return this.delegate.resolveCsrfTokenValue(request, csrfToken);
    }
}
```

## 9. Common Vulnerability Prevention

### 9.1 Security Headers

```java
@Bean
public SecurityFilterChain headersChain(HttpSecurity http) throws Exception {
    return http
            .headers(headers -> headers
                    .contentTypeOptions(Customizer.withDefaults())         // X-Content-Type-Options: nosniff
                    .frameOptions(frame -> frame.deny())                   // X-Frame-Options: DENY
                    .xssProtection(xss -> xss.headerValue(               // X-XSS-Protection
                            XXssProtectionHeaderWriter.HeaderValue.ENABLED_MODE_BLOCK))
                    .httpStrictTransportSecurity(hsts -> hsts             // HSTS
                            .includeSubDomains(true)
                            .maxAgeInSeconds(31536000)
                            .preload(true))
                    .contentSecurityPolicy(csp -> csp
                            .policyDirectives(
                                    "default-src 'self'; " +
                                    "script-src 'self' 'nonce-{nonce}'; " +
                                    "style-src 'self' 'unsafe-inline'; " +
                                    "img-src 'self' data: https:; " +
                                    "font-src 'self'; " +
                                    "connect-src 'self' https://api.example.com; " +
                                    "frame-ancestors 'none'"
                            ))
                    .referrerPolicy(referrer ->
                            referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                    .permissionsPolicyHeader(permissions ->
                            permissions.policy("camera=(), microphone=(), geolocation=()")))
            .build();
}
```

### 9.2 Rate Limiting Login Attempts

```java
@Component
public class LoginRateLimitFilter extends OncePerRequestFilter {

    private final LoadingCache<String, AtomicInteger> attemptCache;

    public LoginRateLimitFilter() {
        this.attemptCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(15))
                .build(key -> new AtomicInteger(0));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain)
            throws ServletException, IOException {

        String clientIp = getClientIp(request);
        AtomicInteger attempts = attemptCache.get(clientIp);

        if (attempts.get() >= 10) {
            response.setStatus(HttpServletResponse.SC_TOO_MANY_REQUESTS);
            response.getWriter().write(
                    "{\"error\": \"Too many login attempts. Try again later.\"}");
            return;
        }

        if ("POST".equals(request.getMethod())) {
            attempts.incrementAndGet();
        }

        filterChain.doFilter(request, response);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().equals("/login");
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
```

## 10. Integration Testing Security

```java
@SpringBootTest
@AutoConfigureMockMvc
class SecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void publicEndpoint_noAuth_shouldSucceed() throws Exception {
        mockMvc.perform(get("/api/public/health"))
                .andExpect(status().isOk());
    }

    @Test
    void protectedEndpoint_noAuth_shouldReturn401() throws Exception {
        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "user@example.com", roles = {"USER"})
    void protectedEndpoint_withUser_shouldSucceed() throws Exception {
        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "user@example.com", roles = {"USER"})
    void adminEndpoint_withUser_shouldReturn403() throws Exception {
        mockMvc.perform(get("/api/admin/users"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "admin@example.com", roles = {"ADMIN"})
    void adminEndpoint_withAdmin_shouldSucceed() throws Exception {
        mockMvc.perform(get("/api/admin/users"))
                .andExpect(status().isOk());
    }

    @Test
    void loginWithValidCredentials() throws Exception {
        mockMvc.perform(post("/login")
                        .param("email", "user@example.com")
                        .param("password", "correctPassword")
                        .with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/dashboard"));
    }

    @Test
    void loginWithInvalidCredentials() throws Exception {
        mockMvc.perform(post("/login")
                        .param("email", "user@example.com")
                        .param("password", "wrongPassword")
                        .with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login?error=true"));
    }

    // Testing with custom UserDetails
    @Test
    @WithUserDetails(value = "admin@example.com",
                      userDetailsServiceBeanName = "databaseUserDetailsService")
    void withRealUserDetails() throws Exception {
        mockMvc.perform(get("/api/profile"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("admin@example.com"));
    }

    // Testing JWT-protected endpoints
    @Test
    void jwtProtectedEndpoint() throws Exception {
        String token = generateTestJwt("user@example.com", List.of("ROLE_USER"));

        mockMvc.perform(get("/api/orders")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    // Custom annotation for testing
    @Test
    @WithMockUser(authorities = {"DOCUMENT_READ", "DOCUMENT_WRITE"})
    void methodSecurityWithPermissions() throws Exception {
        mockMvc.perform(get("/api/documents/1"))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/documents/1")
                        .with(csrf()))
                .andExpect(status().isOk());
    }
}
```

Spring Security's depth becomes apparent as applications grow. Start with `SecurityFilterChain` configuration and `UserDetailsService`, then layer on method-level security, event auditing, and custom filters as requirements dictate. The key to maintainable security configuration is keeping filter chains focused and well-separated by request pattern, so each chain is simple to reason about in isolation.
