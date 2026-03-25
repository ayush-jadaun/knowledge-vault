---
title: "Internationalization"
description: "Complete guide to internationalization in Spring Boot — MessageSource configuration, LocaleResolver strategies, message bundles for multiple languages, REST API i18n, validation message translation, database-stored messages, and testing i18n"
tags: [spring-boot, i18n, localization, messages, internationalization]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Internationalization

Internationalization (i18n) is the process of designing your application so it can be adapted to different languages and regions without code changes. Localization (l10n) is the actual adaptation — translating messages, formatting dates and currencies, and handling region-specific business rules. Spring Boot provides robust i18n support through `MessageSource`, `LocaleResolver`, and integration with Java's built-in locale system.

For REST APIs, i18n means translating error messages, validation messages, and user-facing content based on the client's preferred language. For server-rendered applications, it extends to every piece of text on the page.

## Basic Setup

### Message Files

Place message files in `src/main/resources/`:

```
src/main/resources/
├── messages.properties           # Default (English)
├── messages_es.properties        # Spanish
├── messages_fr.properties        # French
├── messages_de.properties        # German
├── messages_ja.properties        # Japanese
├── messages_zh_CN.properties     # Chinese (Simplified)
└── messages_pt_BR.properties     # Portuguese (Brazil)
```

### Default Messages (`messages.properties`)

```properties
# Common
app.name=MyApplication
app.welcome=Welcome, {0}!

# User messages
user.created=User {0} has been created successfully
user.updated=User profile updated
user.deleted=User account has been deleted
user.not.found=User with ID {0} was not found
user.email.duplicate=A user with email {0} already exists

# Validation messages
validation.required={0} is required
validation.email.invalid=Please provide a valid email address
validation.password.weak=Password must contain at least {0} characters, including uppercase, lowercase, and a number
validation.name.length={0} must be between {1} and {2} characters

# Error messages
error.internal=An unexpected error occurred. Please try again later.
error.unauthorized=Authentication is required to access this resource
error.forbidden=You do not have permission to perform this action
error.not.found=The requested resource was not found
error.rate.limited=Too many requests. Please try again in {0} seconds.
error.validation=Validation failed. Please check the submitted data.

# Order messages
order.placed=Your order #{0} has been placed successfully
order.shipped=Your order #{0} has been shipped. Tracking: {1}
order.cancelled=Your order #{0} has been cancelled. Refund: {1}
```

### Spanish Messages (`messages_es.properties`)

```properties
app.name=MiAplicacion
app.welcome=Bienvenido, {0}!

user.created=El usuario {0} ha sido creado exitosamente
user.updated=Perfil de usuario actualizado
user.deleted=La cuenta de usuario ha sido eliminada
user.not.found=No se encontro el usuario con ID {0}
user.email.duplicate=Ya existe un usuario con el correo {0}

validation.required={0} es obligatorio
validation.email.invalid=Proporcione una direccion de correo valida
validation.password.weak=La contrasena debe contener al menos {0} caracteres, incluyendo mayusculas, minusculas y un numero
validation.name.length={0} debe tener entre {1} y {2} caracteres

error.internal=Ocurrio un error inesperado. Intentelo de nuevo mas tarde.
error.unauthorized=Se requiere autenticacion para acceder a este recurso
error.forbidden=No tiene permiso para realizar esta accion
error.not.found=No se encontro el recurso solicitado
error.rate.limited=Demasiadas solicitudes. Intentelo de nuevo en {0} segundos.
error.validation=Error de validacion. Verifique los datos enviados.

order.placed=Su pedido #{0} ha sido realizado exitosamente
order.shipped=Su pedido #{0} ha sido enviado. Seguimiento: {1}
order.cancelled=Su pedido #{0} ha sido cancelado. Reembolso: {1}
```

### Configuration

```yaml
spring:
  messages:
    basename: messages       # Base name of message files
    encoding: UTF-8
    cache-duration: 3600     # Cache for 1 hour in production
    fallback-to-system-locale: false  # Fall back to default, not system locale
    use-code-as-default-message: false  # Throw if key missing (dev safety)
```

```java
@Configuration
public class MessageConfig {

    @Bean
    public MessageSource messageSource() {
        ReloadableResourceBundleMessageSource source =
                new ReloadableResourceBundleMessageSource();
        source.setBasenames(
                "classpath:messages",
                "classpath:validation-messages",
                "classpath:email-messages"
        );
        source.setDefaultEncoding("UTF-8");
        source.setCacheSeconds(3600);
        source.setFallbackToSystemLocale(false);
        source.setUseCodeAsDefaultMessage(false);
        return source;
    }

    @Bean
    public LocalValidatorFactoryBean validator(MessageSource messageSource) {
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.setValidationMessageSource(messageSource);
        return validator;
    }
}
```

## Locale Resolution

### Accept-Language Header (Best for REST APIs)

```java
@Configuration
public class LocaleConfig implements WebMvcConfigurer {

    @Bean
    public LocaleResolver localeResolver() {
        AcceptHeaderLocaleResolver resolver = new AcceptHeaderLocaleResolver();
        resolver.setDefaultLocale(Locale.ENGLISH);
        resolver.setSupportedLocales(List.of(
                Locale.ENGLISH,
                Locale.forLanguageTag("es"),
                Locale.FRENCH,
                Locale.GERMAN,
                Locale.JAPANESE,
                Locale.SIMPLIFIED_CHINESE,
                Locale.forLanguageTag("pt-BR")
        ));
        return resolver;
    }
}
```

Client sends:
```
GET /api/users/123
Accept-Language: es,en;q=0.9
```

### Query Parameter or Custom Header

```java
@Bean
public LocaleResolver localeResolver() {
    return new LocaleResolver() {
        @Override
        public Locale resolveLocale(HttpServletRequest request) {
            // 1. Check query parameter: ?lang=es
            String lang = request.getParameter("lang");
            if (lang != null) return Locale.forLanguageTag(lang);

            // 2. Check custom header: X-Locale: es
            String header = request.getHeader("X-Locale");
            if (header != null) return Locale.forLanguageTag(header);

            // 3. Check Accept-Language header
            String acceptLang = request.getHeader("Accept-Language");
            if (acceptLang != null) {
                return Locale.LanguageRange.parse(acceptLang).stream()
                        .map(range -> Locale.forLanguageTag(range.getRange()))
                        .filter(SUPPORTED_LOCALES::contains)
                        .findFirst()
                        .orElse(Locale.ENGLISH);
            }

            return Locale.ENGLISH;
        }

        @Override
        public void setLocale(HttpServletRequest request,
                              HttpServletResponse response, Locale locale) {
            // No-op for stateless API
        }
    };
}
```

### User Profile-Based Locale

```java
@Component
public class UserProfileLocaleResolver implements LocaleResolver {

    private final UserService userService;

    @Override
    public Locale resolveLocale(HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated()) {
            String userId = auth.getName();
            UserPreferences prefs = userService.getPreferences(userId);
            if (prefs.getLocale() != null) {
                return Locale.forLanguageTag(prefs.getLocale());
            }
        }
        // Fallback to Accept-Language header
        return resolveFromHeader(request);
    }
}
```

## Using Messages in Code

### MessageSource in Services

```java
@Service
public class UserService {

    private final MessageSource messageSource;
    private final UserRepository userRepository;

    public User createUser(CreateUserRequest request, Locale locale) {
        if (userRepository.existsByEmail(request.getEmail())) {
            String message = messageSource.getMessage(
                    "user.email.duplicate",
                    new Object[]{request.getEmail()},
                    locale);
            throw new DuplicateResourceException(message);
        }

        User user = new User();
        user.setEmail(request.getEmail());
        user.setDisplayName(request.getDisplayName());
        User saved = userRepository.save(user);

        log.info(messageSource.getMessage("user.created",
                new Object[]{saved.getDisplayName()}, locale));

        return saved;
    }
}
```

### MessageSource Helper

Reduce boilerplate with a helper class:

```java
@Component
public class Messages {

    private final MessageSource messageSource;

    public Messages(MessageSource messageSource) {
        this.messageSource = messageSource;
    }

    public String get(String code, Object... args) {
        Locale locale = LocaleContextHolder.getLocale();
        return messageSource.getMessage(code, args, locale);
    }

    public String get(String code, Locale locale, Object... args) {
        return messageSource.getMessage(code, args, locale);
    }

    public String getOrDefault(String code, String defaultMessage, Object... args) {
        Locale locale = LocaleContextHolder.getLocale();
        return messageSource.getMessage(code, args, defaultMessage, locale);
    }
}
```

Usage:

```java
@Service
public class OrderService {

    private final Messages messages;

    public void cancelOrder(String orderId) {
        // ...
        String message = messages.get("order.cancelled", orderId, refundAmount);
        notificationService.notify(userId, message);
    }
}
```

## Internationalized Error Responses

### Error Response Structure

```java
public record ErrorResponse(
        String code,          // Machine-readable: "USER_NOT_FOUND"
        String message,       // Human-readable, localized
        Instant timestamp,
        String path,
        List<FieldError> fieldErrors
) {
    public record FieldError(
            String field,
            String code,
            String message       // Localized
    ) {}
}
```

### Global Exception Handler with i18n

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    private final MessageSource messageSource;

    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleUserNotFound(
            UserNotFoundException ex, Locale locale, HttpServletRequest request) {

        String message = messageSource.getMessage(
                "user.not.found", new Object[]{ex.getUserId()}, locale);

        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse(
                        "USER_NOT_FOUND",
                        message,
                        Instant.now(),
                        request.getRequestURI(),
                        List.of()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(
            MethodArgumentNotValidException ex,
            Locale locale,
            HttpServletRequest request) {

        List<ErrorResponse.FieldError> fieldErrors = ex.getBindingResult()
                .getFieldErrors().stream()
                .map(error -> new ErrorResponse.FieldError(
                        error.getField(),
                        error.getCode(),
                        messageSource.getMessage(error, locale)))
                .toList();

        String message = messageSource.getMessage(
                "error.validation", null, locale);

        return ResponseEntity.badRequest()
                .body(new ErrorResponse(
                        "VALIDATION_ERROR",
                        message,
                        Instant.now(),
                        request.getRequestURI(),
                        fieldErrors));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(
            AccessDeniedException ex, Locale locale, HttpServletRequest request) {

        String message = messageSource.getMessage(
                "error.forbidden", null, locale);

        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ErrorResponse("FORBIDDEN", message,
                        Instant.now(), request.getRequestURI(), List.of()));
    }
}
```

## Validation Message Translation

### Using Message Codes in Validation

```java
public class CreateUserRequest {

    @NotBlank(message = "{validation.required}")
    @Size(min = 2, max = 50, message = "{validation.name.length}")
    private String displayName;

    @NotBlank(message = "{validation.required}")
    @Email(message = "{validation.email.invalid}")
    private String email;

    @NotBlank(message = "{validation.required}")
    @Size(min = 8, message = "{validation.password.weak}")
    private String password;
}
```

`validation-messages.properties`:
```properties
javax.validation.constraints.NotBlank.message={0} is required
javax.validation.constraints.Size.message={0} must be between {min} and {max} characters
javax.validation.constraints.Email.message=Invalid email format
```

`validation-messages_es.properties`:
```properties
javax.validation.constraints.NotBlank.message={0} es obligatorio
javax.validation.constraints.Size.message={0} debe tener entre {min} y {max} caracteres
javax.validation.constraints.Email.message=Formato de correo invalido
```

## Database-Stored Messages

For dynamic content that non-developers need to manage (CMS content, notification templates):

```java
@Entity
@Table(name = "translations", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"message_key", "locale"})
})
public class Translation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_key", nullable = false)
    private String key;

    @Column(nullable = false, length = 10)
    private String locale;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String value;

    private Instant updatedAt = Instant.now();
}
```

```java
@Component
public class DatabaseMessageSource extends AbstractMessageSource {

    private final TranslationRepository translationRepo;
    private final Cache<String, String> cache;

    public DatabaseMessageSource(TranslationRepository translationRepo) {
        this.translationRepo = translationRepo;
        this.cache = Caffeine.newBuilder()
                .maximumSize(10_000)
                .expireAfterWrite(Duration.ofMinutes(10))
                .build();
    }

    @Override
    protected MessageFormat resolveCode(String code, Locale locale) {
        String cacheKey = code + ":" + locale.toLanguageTag();
        String message = cache.get(cacheKey, key ->
                translationRepo.findByKeyAndLocale(code, locale.toLanguageTag())
                        .map(Translation::getValue)
                        .orElse(null));

        if (message != null) {
            return createMessageFormat(message, locale);
        }

        // Fallback to parent (properties files)
        return null;
    }

    public void evictCache() {
        cache.invalidateAll();
    }
}
```

### Composite MessageSource

Chain database and file-based sources:

```java
@Bean
public MessageSource messageSource() {
    DatabaseMessageSource dbSource = new DatabaseMessageSource(translationRepo);

    ReloadableResourceBundleMessageSource fileSource =
            new ReloadableResourceBundleMessageSource();
    fileSource.setBasename("classpath:messages");
    fileSource.setDefaultEncoding("UTF-8");

    // Database takes priority; falls back to files
    dbSource.setParentMessageSource(fileSource);
    return dbSource;
}
```

## Number, Date, and Currency Formatting

```java
@Component
public class LocalizedFormatter {

    public String formatCurrency(BigDecimal amount, Locale locale) {
        NumberFormat formatter = NumberFormat.getCurrencyInstance(locale);

        // Set currency based on locale (or explicit)
        Currency currency = determineCurrency(locale);
        formatter.setCurrency(currency);

        return formatter.format(amount);
        // en-US: $1,234.56
        // de-DE: 1.234,56 €
        // ja-JP: ¥1,235
    }

    public String formatDate(Instant instant, Locale locale) {
        ZoneId zone = determineZone(locale);
        DateTimeFormatter formatter = DateTimeFormatter
                .ofLocalizedDateTime(FormatStyle.MEDIUM)
                .withLocale(locale)
                .withZone(zone);
        return formatter.format(instant);
        // en-US: Mar 25, 2026, 2:30:00 PM
        // de-DE: 25.03.2026, 14:30:00
        // ja-JP: 2026/03/25 14:30:00
    }

    public String formatNumber(long number, Locale locale) {
        return NumberFormat.getNumberInstance(locale).format(number);
        // en-US: 1,234,567
        // de-DE: 1.234.567
        // fr-FR: 1 234 567
    }
}
```

## Testing i18n

```java
@SpringBootTest
class InternationalizationTest {

    @Autowired
    private MessageSource messageSource;

    @Test
    void shouldResolveEnglishMessages() {
        String message = messageSource.getMessage(
                "user.not.found", new Object[]{"123"}, Locale.ENGLISH);
        assertThat(message).isEqualTo("User with ID 123 was not found");
    }

    @Test
    void shouldResolveSpanishMessages() {
        Locale spanish = Locale.forLanguageTag("es");
        String message = messageSource.getMessage(
                "user.not.found", new Object[]{"123"}, spanish);
        assertThat(message).isEqualTo("No se encontro el usuario con ID 123");
    }

    @Test
    void shouldFallbackToDefaultLocale() {
        Locale unsupported = Locale.forLanguageTag("ko"); // Korean not defined
        String message = messageSource.getMessage(
                "user.not.found", new Object[]{"123"}, unsupported);
        assertThat(message).isEqualTo("User with ID 123 was not found");
    }
}

@WebMvcTest(UserController.class)
class UserControllerI18nTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldReturnSpanishErrorMessage() throws Exception {
        mockMvc.perform(get("/api/users/999")
                        .header("Accept-Language", "es"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message")
                        .value(containsString("No se encontro")));
    }

    @Test
    void shouldReturnEnglishByDefault() throws Exception {
        mockMvc.perform(get("/api/users/999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message")
                        .value(containsString("was not found")));
    }
}
```

## Checklist

| Item | Notes |
|------|-------|
| All user-facing strings in message files | Never hardcode user-visible text |
| Accept-Language header resolved correctly | Test with various locale headers |
| Fallback locale configured | Application works without Accept-Language |
| Validation messages translated | Custom messages in message bundles |
| Error responses include localized message | Error codes stay machine-readable |
| Date/time/currency locale-aware | Use Java's built-in formatters |
| Message keys consistent | Convention like `entity.action` or `error.type` |
| All languages tested | Integration tests per supported language |

Internationalization done right is invisible — users see content in their language without knowing the effort behind it. Done wrong, users see untranslated keys (`user.not.found`), mojibake from encoding issues, or dates in the wrong format. Set up the infrastructure early, enforce the convention of never hardcoding user-facing strings, and test every supported language in CI.
