---
title: "WebSocket & STOMP"
description: "Complete guide to real-time communication in Spring Boot — WebSocket configuration, STOMP messaging protocol, SockJS fallback, building real-time notifications, chat implementation, scaling with message brokers, and security considerations"
tags: [spring-boot, websocket, stomp, real-time, messaging]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# WebSocket & STOMP

HTTP is a request-response protocol. The client sends a request, the server sends a response, and the connection is done. If the server has something new to tell the client, it has to wait until the client asks. This model works fine for loading web pages, but it falls apart when you need real-time communication — chat messages, live notifications, stock tickers, collaborative editing, multiplayer games.

WebSocket solves this by establishing a persistent, full-duplex connection between client and server. Once the connection is open, either side can send messages at any time without the overhead of HTTP headers, connection establishment, or request-response pairing. Spring Boot provides first-class WebSocket support through both raw WebSocket APIs and the higher-level STOMP messaging protocol.

## Why Not Just Poll?

Before diving into WebSocket, it is worth understanding why simpler approaches fall short.

### Short Polling

The client sends HTTP requests at regular intervals:

```java
// Client-side (JavaScript)
// Every 2 seconds, ask the server for updates
setInterval(() => {
    fetch('/api/notifications/new')
        .then(response => response.json())
        .then(data => updateUI(data));
}, 2000);
```

**Problems:**
- **Wasted requests** — Most polls return empty responses. If 1,000 users poll every 2 seconds, you handle 500 requests per second even when nothing is happening.
- **Latency** — Average delay is half the polling interval. A 2-second poll means up to 2 seconds of latency.
- **Server load** — Each poll is a full HTTP request with headers, authentication, and connection overhead.

### Long Polling

The client sends a request and the server holds it open until there is data:

```java
@GetMapping("/notifications/long-poll")
public DeferredResult<List<Notification>> longPoll(@AuthenticationPrincipal User user) {
    DeferredResult<List<Notification>> result = new DeferredResult<>(30000L);
    notificationService.registerWaiter(user.getId(), result);
    result.onTimeout(() -> result.setResult(Collections.emptyList()));
    return result;
}
```

**Problems:**
- **Connection overhead** — Each long-poll holds a server thread (or at least a connection).
- **Reconnection storms** — When data arrives, all waiting clients reconnect simultaneously.
- **Unidirectional** — Server can push to client, but client-to-server still requires separate HTTP requests.

### Server-Sent Events (SSE)

A unidirectional channel from server to client over HTTP:

```java
@GetMapping(value = "/notifications/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<Notification> streamNotifications(@AuthenticationPrincipal User user) {
    return notificationService.getNotificationStream(user.getId());
}
```

**Problems:**
- **Unidirectional** — Only server-to-client. Good for notifications, insufficient for chat.
- **Limited browser connections** — Browsers limit concurrent SSE connections per domain (typically 6).
- **No binary support** — Text-only.

### WebSocket Advantages

```
              HTTP Polling          WebSocket
              ──────────           ─────────
Latency:      100ms - 5s           < 10ms
Overhead:     Full HTTP headers    2-byte frame header
Direction:    Client → Server      Bidirectional
Connections:  New per request      Single persistent
Efficiency:   Low (wasted polls)   High (push on demand)
```

## Raw WebSocket Configuration

### Basic Setup

Add the dependency:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>
```

Configure raw WebSocket handlers:

```java
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final ChatWebSocketHandler chatHandler;

    public WebSocketConfig(ChatWebSocketHandler chatHandler) {
        this.chatHandler = chatHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(chatHandler, "/ws/chat")
                .setAllowedOrigins("https://yourdomain.com")
                .addInterceptors(new HttpSessionHandshakeInterceptor())
                .withSockJS(); // Enable SockJS fallback
    }
}
```

### Implementing a WebSocket Handler

```java
@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();
    private final ObjectMapper objectMapper;

    public ChatWebSocketHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("WebSocket connected: sessionId={}, remoteAddr={}",
                session.getId(), session.getRemoteAddress());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        ChatMessage chatMessage = objectMapper.readValue(message.getPayload(), ChatMessage.class);
        chatMessage.setTimestamp(Instant.now());
        chatMessage.setSenderId(extractUserId(session));

        String json = objectMapper.writeValueAsString(chatMessage);
        TextMessage outgoing = new TextMessage(json);

        // Broadcast to all connected clients
        for (WebSocketSession s : sessions) {
            if (s.isOpen()) {
                try {
                    s.sendMessage(outgoing);
                } catch (IOException e) {
                    log.warn("Failed to send message to session {}", s.getId(), e);
                }
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("WebSocket closed: sessionId={}, status={}",
                session.getId(), status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("Transport error on session {}", session.getId(), exception);
        sessions.remove(session);
    }

    private String extractUserId(WebSocketSession session) {
        return (String) session.getAttributes().get("userId");
    }
}
```

Raw WebSocket works, but you are responsible for everything: message routing, subscription management, message format, error handling. This is where STOMP comes in.

## STOMP: A Higher-Level Protocol

STOMP (Simple Text Oriented Messaging Protocol) is a messaging protocol that runs over WebSocket. Think of it as HTTP for messaging — it defines commands like `CONNECT`, `SUBSCRIBE`, `SEND`, and `MESSAGE` with headers and a body. Spring provides a complete STOMP implementation that integrates with its messaging infrastructure.

```
┌─────────────────────────────────────────────────────┐
│                   Client (Browser)                   │
│                                                      │
│  STOMP.js / SockJS                                   │
│    ├── CONNECT                                       │
│    ├── SUBSCRIBE /topic/chat                         │
│    ├── SEND /app/chat.send  { "text": "Hello" }     │
│    └── DISCONNECT                                    │
└──────────────────────┬──────────────────────────────┘
                       │  WebSocket / SockJS
                       ▼
┌─────────────────────────────────────────────────────┐
│              Spring STOMP Broker Relay                │
│                                                      │
│  /app/**  ──→  @MessageMapping controllers           │
│  /topic/** ──→  SimpleBroker (in-memory)             │
│  /queue/** ──→  SimpleBroker (in-memory)             │
│  /user/**  ──→  User-specific destinations           │
└─────────────────────────────────────────────────────┘
```

### STOMP Configuration

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketStompConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Messages with these prefixes are routed to the broker
        // /topic = one-to-many (broadcasts)
        // /queue = one-to-one (point-to-point)
        registry.enableSimpleBroker("/topic", "/queue")
                .setHeartbeatValue(new long[]{10000, 10000}) // 10s heartbeat
                .setTaskScheduler(heartBeatScheduler());

        // Messages with this prefix are routed to @MessageMapping methods
        registry.setApplicationDestinationPrefixes("/app");

        // User-specific message prefix
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("https://*.yourdomain.com")
                .withSockJS()
                .setStreamBytesLimit(512 * 1024)     // 512KB
                .setHttpMessageCacheSize(1000)
                .setDisconnectDelay(30 * 1000);       // 30s
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.setMessageSizeLimit(128 * 1024)   // 128KB max message
                    .setSendBufferSizeLimit(512 * 1024) // 512KB send buffer
                    .setSendTimeLimit(20 * 1000);       // 20s send timeout
    }

    @Bean
    public TaskScheduler heartBeatScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("ws-heartbeat-");
        return scheduler;
    }
}
```

### Message Controllers

```java
@Controller
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatService chatService;

    public ChatController(SimpMessagingTemplate messagingTemplate, ChatService chatService) {
        this.messagingTemplate = messagingTemplate;
        this.chatService = chatService;
    }

    /**
     * Handles messages sent to /app/chat.send
     * Broadcasts the result to /topic/chat/{roomId}
     */
    @MessageMapping("/chat.send")
    public void sendMessage(@Payload ChatMessage message,
                            SimpMessageHeaderAccessor headerAccessor) {
        String userId = headerAccessor.getUser().getName();
        message.setSenderId(userId);
        message.setTimestamp(Instant.now());

        // Persist the message
        ChatMessage saved = chatService.saveMessage(message);

        // Broadcast to room subscribers
        messagingTemplate.convertAndSend(
                "/topic/chat/" + message.getRoomId(), saved);
    }

    /**
     * Handles messages sent to /app/chat.join
     * Response goes directly to /topic/chat/{roomId}
     */
    @MessageMapping("/chat.join")
    @SendTo("/topic/chat/{roomId}")
    public ChatMessage joinRoom(@DestinationVariable String roomId,
                                @Payload JoinRequest request,
                                SimpMessageHeaderAccessor headerAccessor) {
        String userId = headerAccessor.getUser().getName();
        chatService.addUserToRoom(roomId, userId);

        ChatMessage systemMessage = new ChatMessage();
        systemMessage.setType(MessageType.JOIN);
        systemMessage.setRoomId(roomId);
        systemMessage.setSenderId("system");
        systemMessage.setContent(request.getUsername() + " joined the chat");
        systemMessage.setTimestamp(Instant.now());
        return systemMessage;
    }

    /**
     * Send a private message to a specific user.
     * The message goes to /user/{username}/queue/private
     */
    @MessageMapping("/chat.private")
    public void sendPrivateMessage(@Payload PrivateMessage message,
                                   SimpMessageHeaderAccessor headerAccessor) {
        String senderId = headerAccessor.getUser().getName();
        message.setSenderId(senderId);
        message.setTimestamp(Instant.now());

        messagingTemplate.convertAndSendToUser(
                message.getRecipientId(), "/queue/private", message);
    }
}
```

### Client-Side JavaScript

```javascript
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

const client = new Client({
    webSocketFactory: () => new SockJS('/ws'),
    connectHeaders: {
        Authorization: `Bearer ${getAccessToken()}`
    },
    debug: (str) => console.log('STOMP: ' + str),
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,

    onConnect: (frame) => {
        console.log('Connected:', frame);

        // Subscribe to a chat room
        client.subscribe('/topic/chat/room-123', (message) => {
            const chatMessage = JSON.parse(message.body);
            displayMessage(chatMessage);
        });

        // Subscribe to private messages
        client.subscribe('/user/queue/private', (message) => {
            const privateMessage = JSON.parse(message.body);
            displayPrivateMessage(privateMessage);
        });
    },

    onStompError: (frame) => {
        console.error('STOMP error:', frame.headers['message']);
        console.error('Details:', frame.body);
    },

    onDisconnect: () => {
        console.log('Disconnected');
    }
});

client.activate();

// Send a message
function sendMessage(roomId, text) {
    client.publish({
        destination: '/app/chat.send',
        body: JSON.stringify({ roomId, content: text }),
        headers: { 'content-type': 'application/json' }
    });
}
```

## SockJS Fallback

WebSocket is not universally available. Corporate proxies, load balancers, and older networks may strip or block WebSocket upgrade requests. SockJS provides automatic fallback transports:

```
Fallback chain (in order of preference):
1. WebSocket          — Full duplex, lowest latency
2. XHR Streaming      — Server pushes via chunked HTTP response
3. XHR Polling        — Long polling over XMLHttpRequest
4. IFrame EventSource — SSE via hidden iframe
5. IFrame XHR Polling — Long polling via hidden iframe
```

SockJS is transparent to application code. The STOMP layer works identically regardless of the underlying transport:

::: code-group

```java
// Server side — just add .withSockJS()
registry.addEndpoint("/ws")
        .setAllowedOriginPatterns("*")
        .withSockJS();
```

```javascript
// Client side — use SockJS instead of native WebSocket
const client = new Client({
    webSocketFactory: () => new SockJS('/ws'),
    // ... rest of config
});
```

:::

## Real-Time Notification System

A complete notification system using STOMP:

### Notification Model

```java
@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String recipientId;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private NotificationType type;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String body;

    @Column(nullable = false)
    private boolean read = false;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    private String actionUrl;
    private String sourceEntityId;

    // getters, setters
}

public enum NotificationType {
    COMMENT, MENTION, FOLLOW, LIKE, SYSTEM, ORDER_UPDATE
}
```

### Notification Service

```java
@Service
@Transactional
public class NotificationService {

    private final NotificationRepository notificationRepo;
    private final SimpMessagingTemplate messagingTemplate;

    public NotificationService(NotificationRepository notificationRepo,
                               SimpMessagingTemplate messagingTemplate) {
        this.notificationRepo = notificationRepo;
        this.messagingTemplate = messagingTemplate;
    }

    public Notification createAndSend(String recipientId, NotificationType type,
                                       String title, String body, String actionUrl) {
        Notification notification = new Notification();
        notification.setRecipientId(recipientId);
        notification.setType(type);
        notification.setTitle(title);
        notification.setBody(body);
        notification.setActionUrl(actionUrl);

        Notification saved = notificationRepo.save(notification);

        // Push to the user's personal notification queue
        messagingTemplate.convertAndSendToUser(
                recipientId,
                "/queue/notifications",
                NotificationDto.from(saved)
        );

        // Update the unread count badge
        long unreadCount = notificationRepo.countByRecipientIdAndReadFalse(recipientId);
        messagingTemplate.convertAndSendToUser(
                recipientId,
                "/queue/notification-count",
                Map.of("unread", unreadCount)
        );

        return saved;
    }

    public List<Notification> getUnread(String userId) {
        return notificationRepo.findByRecipientIdAndReadFalseOrderByCreatedAtDesc(userId);
    }

    public void markAsRead(String userId, String notificationId) {
        notificationRepo.findByIdAndRecipientId(notificationId, userId)
                .ifPresent(n -> {
                    n.setRead(true);
                    notificationRepo.save(n);
                });
    }

    public void markAllAsRead(String userId) {
        notificationRepo.markAllReadByRecipientId(userId);
        messagingTemplate.convertAndSendToUser(
                userId, "/queue/notification-count", Map.of("unread", 0));
    }
}
```

### Triggering Notifications from Domain Events

```java
@Component
public class CommentEventListener {

    private final NotificationService notificationService;

    public CommentEventListener(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @EventListener
    public void onCommentCreated(CommentCreatedEvent event) {
        Comment comment = event.getComment();
        String postAuthorId = comment.getPost().getAuthorId();

        // Don't notify yourself
        if (!comment.getAuthorId().equals(postAuthorId)) {
            notificationService.createAndSend(
                    postAuthorId,
                    NotificationType.COMMENT,
                    "New comment on your post",
                    comment.getAuthor().getDisplayName() + " commented: "
                            + truncate(comment.getContent(), 100),
                    "/posts/" + comment.getPost().getId() + "#comment-" + comment.getId()
            );
        }

        // Notify mentioned users
        Set<String> mentionedUserIds = extractMentions(comment.getContent());
        mentionedUserIds.remove(comment.getAuthorId());
        for (String userId : mentionedUserIds) {
            notificationService.createAndSend(
                    userId,
                    NotificationType.MENTION,
                    "You were mentioned in a comment",
                    comment.getAuthor().getDisplayName() + " mentioned you: "
                            + truncate(comment.getContent(), 100),
                    "/posts/" + comment.getPost().getId() + "#comment-" + comment.getId()
            );
        }
    }
}
```

## WebSocket Security

### Authentication During Handshake

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketSecurityConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor
                        .getAccessor(message, StompHeaderAccessor.class);

                if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                    String token = accessor.getFirstNativeHeader("Authorization");
                    if (token != null && token.startsWith("Bearer ")) {
                        Authentication auth = tokenProvider.validateToken(
                                token.substring(7));
                        accessor.setUser(auth);
                    } else {
                        throw new MessagingException("Missing or invalid auth token");
                    }
                }
                return message;
            }
        });
    }
}
```

### Destination-Level Authorization

```java
@Configuration
@EnableWebSocketSecurity
public class WebSocketAuthorizationConfig {

    @Bean
    AuthorizationManager<Message<?>> messageAuthorizationManager(
            MessageMatcherDelegatingAuthorizationManager.Builder messages) {
        return messages
                .simpDestMatchers("/app/**").authenticated()
                .simpSubscribeDestMatchers("/topic/admin/**").hasRole("ADMIN")
                .simpSubscribeDestMatchers("/topic/chat/**").authenticated()
                .simpSubscribeDestMatchers("/user/**").authenticated()
                .anyMessage().denyAll()
                .build();
    }
}
```

## Scaling WebSocket with an External Broker

The simple in-memory broker works for a single server instance. For multiple instances behind a load balancer, you need an external message broker:

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Client A │    │ Client B │    │ Client C │
└────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │
     ▼               ▼               ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Server 1 │    │ Server 2 │    │ Server 3 │
└────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │
     └───────────────┼───────────────┘
                     ▼
          ┌──────────────────┐
          │  RabbitMQ / Redis │
          │  (Message Broker) │
          └──────────────────┘
```

### RabbitMQ as STOMP Relay

```java
@Override
public void configureMessageBroker(MessageBrokerRegistry registry) {
    registry.enableStompBrokerRelay("/topic", "/queue")
            .setRelayHost("rabbitmq-host")
            .setRelayPort(61613)               // STOMP port
            .setClientLogin("guest")
            .setClientPasscode("guest")
            .setSystemLogin("guest")
            .setSystemPasscode("guest")
            .setSystemHeartbeatSendInterval(10000)
            .setSystemHeartbeatReceiveInterval(10000);

    registry.setApplicationDestinationPrefixes("/app");
    registry.setUserDestinationPrefix("/user");
}
```

### Session Tracking for Presence

```java
@Component
public class WebSocketEventListener {

    private final SimpMessagingTemplate messagingTemplate;
    private final Set<String> onlineUsers = ConcurrentHashMap.newKeySet();

    public WebSocketEventListener(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @EventListener
    public void handleSessionConnected(SessionConnectedEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String userId = accessor.getUser().getName();
        onlineUsers.add(userId);
        broadcastPresence();
    }

    @EventListener
    public void handleSessionDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        if (accessor.getUser() != null) {
            String userId = accessor.getUser().getName();
            onlineUsers.remove(userId);
            broadcastPresence();
        }
    }

    private void broadcastPresence() {
        messagingTemplate.convertAndSend("/topic/presence",
                Map.of("onlineUsers", onlineUsers, "count", onlineUsers.size()));
    }

    public boolean isUserOnline(String userId) {
        return onlineUsers.contains(userId);
    }
}
```

## Chat Implementation: Full Example

### Data Model

```java
@Entity
@Table(name = "chat_rooms")
public class ChatRoom {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    private String name;
    private boolean isPrivate;
    private Instant createdAt = Instant.now();

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "chat_room_members",
            joinColumns = @JoinColumn(name = "room_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id"))
    private Set<User> members = new HashSet<>();
}

@Entity
@Table(name = "chat_messages", indexes = {
    @Index(name = "idx_chat_messages_room_created", columns = {"room_id", "created_at"})
})
public class ChatMessage {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    private String roomId;
    private String senderId;
    private String senderName;

    @Enumerated(EnumType.STRING)
    private MessageType type; // CHAT, JOIN, LEAVE, TYPING

    @Column(columnDefinition = "TEXT")
    private String content;
    private Instant createdAt = Instant.now();
}
```

### Typing Indicator

::: code-group

```java
@MessageMapping("/chat.typing")
public void typingIndicator(@Payload TypingEvent event,
                            SimpMessageHeaderAccessor headerAccessor) {
    String userId = headerAccessor.getUser().getName();
    event.setUserId(userId);

    // Broadcast to room, exclude sender
    messagingTemplate.convertAndSend(
            "/topic/chat/" + event.getRoomId() + "/typing", event);
}
```

```javascript
// Client: Debounced typing indicator
let typingTimeout;
messageInput.addEventListener('input', () => {
    if (!typingTimeout) {
        client.publish({
            destination: '/app/chat.typing',
            body: JSON.stringify({ roomId: currentRoom, isTyping: true })
        });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        client.publish({
            destination: '/app/chat.typing',
            body: JSON.stringify({ roomId: currentRoom, isTyping: false })
        });
        typingTimeout = null;
    }, 2000);
});
```

:::

## Performance Tuning

### Thread Pool Configuration

```yaml
spring:
  websocket:
    stomp:
      broker-relay:
        system-heartbeat-send-interval: 10s
        system-heartbeat-receive-interval: 10s

# Undertow (better for WebSocket than Tomcat)
server:
  undertow:
    threads:
      io: 4        # I/O threads = CPU cores
      worker: 64   # Worker threads for blocking operations
    buffer-size: 1024
    direct-buffers: true
```

### Connection Limits and Backpressure

```java
@Override
public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
    registration
        .setMessageSizeLimit(64 * 1024)        // 64KB max message
        .setSendBufferSizeLimit(256 * 1024)    // 256KB send buffer per session
        .setSendTimeLimit(15 * 1000)           // 15s to send a message
        .setTimeToFirstMessage(30 * 1000);     // 30s to receive first message after connect
}
```

### Monitoring

```java
@Component
public class WebSocketMetrics {

    private final MeterRegistry meterRegistry;
    private final AtomicInteger activeConnections = new AtomicInteger(0);

    public WebSocketMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        Gauge.builder("websocket.connections.active", activeConnections, AtomicInteger::get)
             .description("Number of active WebSocket connections")
             .register(meterRegistry);
    }

    @EventListener
    public void onConnect(SessionConnectedEvent event) {
        activeConnections.incrementAndGet();
        meterRegistry.counter("websocket.connections.total", "event", "connect").increment();
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        activeConnections.decrementAndGet();
        meterRegistry.counter("websocket.connections.total", "event", "disconnect").increment();
    }
}
```

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Message ordering not guaranteed across multiple server instances | Use a single-partition topic per room, or use external broker with ordering guarantees |
| Memory leak from unclosed sessions | Implement heartbeat detection and session cleanup on `SessionDisconnectEvent` |
| Proxy/load balancer drops WebSocket | Enable SockJS fallback; configure proxy `proxy_set_header Upgrade $http_upgrade;` |
| Authentication token expires during session | Send token refresh events over the WebSocket; reconnect with new token |
| Broadcast storms with many subscribers | Use topic segmentation (per-room, per-group) rather than single global topics |
| Sending large payloads over WebSocket | Use WebSocket for signaling only; serve large content via REST with a reference URL |

## Testing WebSocket

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ChatControllerIntegrationTest {

    @LocalServerPort
    private int port;

    private WebSocketStompClient stompClient;

    @BeforeEach
    void setup() {
        stompClient = new WebSocketStompClient(
                new StandardWebSocketClient());
        stompClient.setMessageConverter(new MappingJackson2MessageConverter());
    }

    @Test
    void shouldBroadcastChatMessage() throws Exception {
        BlockingQueue<ChatMessage> receivedMessages = new LinkedBlockingQueue<>();

        StompSession session = stompClient.connectAsync(
                "ws://localhost:" + port + "/ws",
                new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS);

        session.subscribe("/topic/chat/room-1", new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return ChatMessage.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                receivedMessages.add((ChatMessage) payload);
            }
        });

        // Send a message
        ChatMessage message = new ChatMessage();
        message.setRoomId("room-1");
        message.setContent("Hello, WebSocket!");
        session.send("/app/chat.send", message);

        // Assert
        ChatMessage received = receivedMessages.poll(5, TimeUnit.SECONDS);
        assertThat(received).isNotNull();
        assertThat(received.getContent()).isEqualTo("Hello, WebSocket!");

        session.disconnect();
    }
}
```

WebSocket with STOMP gives you a robust, scalable real-time messaging layer. Use the simple broker for development and single-server deployments, switch to RabbitMQ or ActiveMQ for multi-instance production setups, and always plan for SockJS fallback because the real world is messier than your development environment.

## Interview Questions

**Q1: What is the difference between WebSocket, SSE, and long polling?**
::: details Answer
**WebSocket**: Full-duplex, persistent connection. Both client and server can send messages at any time with minimal overhead (2-byte frame header). Best for bidirectional real-time communication (chat, gaming). **SSE (Server-Sent Events)**: Unidirectional server-to-client channel over HTTP. Simple, auto-reconnects, text-only. Best for notifications, live feeds. Limited to ~6 concurrent connections per domain. **Long polling**: Client sends HTTP request, server holds it until data is available, then responds. Client immediately reconnects. Higher overhead (full HTTP headers per response), reconnection storms. WebSocket is the best choice when you need bidirectional communication; SSE is simpler for server push only.
:::

**Q2: What is STOMP and why use it over raw WebSocket?**
::: details Answer
STOMP (Simple Text Oriented Messaging Protocol) is a messaging protocol that runs over WebSocket. Raw WebSocket gives you a byte stream -- you must define your own message format, routing, and subscription management. STOMP provides structured commands (`CONNECT`, `SUBSCRIBE`, `SEND`, `MESSAGE`), destination-based routing (`/topic/chat`, `/queue/private`), message headers, and subscription management. Spring's STOMP support integrates with `@MessageMapping` controllers, `SimpMessagingTemplate` for server-side pushing, user-specific destinations, and Spring Security. It eliminates the need to build your own messaging protocol.
:::

**Q3: How do you scale WebSocket connections across multiple server instances?**
::: details Answer
The simple in-memory broker only works for a single instance because WebSocket connections are sticky to specific servers. For multi-instance deployments: (1) Use an external message broker (RabbitMQ, ActiveMQ) as a STOMP relay with `registry.enableStompBrokerRelay("/topic", "/queue")`. Messages published on any instance are relayed through the broker to all instances. (2) Configure sticky sessions on the load balancer for the WebSocket upgrade. (3) Use SockJS fallback for clients behind proxies that strip WebSocket headers. (4) Track online presence in a shared store (Redis) instead of in-memory sets.
:::

**Q4: How do you authenticate WebSocket connections in Spring Security?**
::: details Answer
Authentication happens during the STOMP `CONNECT` frame, not the HTTP handshake. Implement a `ChannelInterceptor` on the client inbound channel: in `preSend()`, check for `StompCommand.CONNECT`, extract the `Authorization` header from STOMP native headers, validate the JWT token, and set the `Authentication` on the accessor with `accessor.setUser(auth)`. For destination-level authorization, use `@EnableWebSocketSecurity` with `AuthorizationManager<Message<?>>` to restrict subscriptions (e.g., `/topic/admin/**` requires `ROLE_ADMIN`).
:::

**Q5: How do you implement user-specific messaging (private messages) with STOMP?**
::: details Answer
Spring STOMP supports user destinations with the `/user/` prefix. To send a private message to a specific user: `messagingTemplate.convertAndSendToUser(username, "/queue/private", message)`. This routes to `/user/{username}/queue/private`. The client subscribes to `/user/queue/private` (without the username -- Spring resolves it from the authenticated session). The `UserDestinationPrefix` is configured as `/user` in the broker registry. For this to work, the WebSocket connection must be authenticated so Spring can map the session to a username.
:::
