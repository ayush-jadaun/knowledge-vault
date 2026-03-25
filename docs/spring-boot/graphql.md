---
title: "GraphQL with Spring"
description: "Complete guide to building GraphQL APIs with Spring Boot — Spring for GraphQL integration, schema-first development, DataFetchers and controllers, mutations, subscriptions, solving N+1 with DataLoader, error handling, and securing GraphQL endpoints"
tags: [spring-boot, graphql, api, schema, java]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# GraphQL with Spring

REST works well for resource-oriented APIs where clients know exactly which resources they need. But when client needs diverge — a mobile app needs a minimal payload while a web dashboard needs deeply nested data — REST forces a choice between over-fetching (send everything) and endpoint proliferation (one endpoint per view). GraphQL solves this by letting clients specify exactly what data they need in a single request.

Spring for GraphQL (the official Spring project, not the older GraphQL Java Kickstart) provides a first-class integration that maps GraphQL operations to Spring controllers, integrates with Spring Security, and leverages the existing Spring ecosystem for data access, validation, and error handling.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                       Client Request                          │
│  POST /graphql                                                │
│  {                                                            │
│    "query": "{ user(id: 1) { name posts { title } } }"       │
│  }                                                            │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    GraphQL Engine                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │
│  │   Parse     │→│  Validate   │→│  Execute (field by      │  │
│  │   Query     │  │  Against    │  │  field, calling         │  │
│  │             │  │  Schema     │  │  DataFetchers)          │  │
│  └────────────┘  └────────────┘  └────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              Spring @Controller / @SchemaMapping               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ UserController│  │PostController │  │CommentController  │   │
│  │ user(id)     │  │ posts(user)   │  │ comments(post)    │   │
│  └──────────────┘  └──────────────┘  └───────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Setup

### Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-graphql</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
```

### Configuration

```yaml
spring:
  graphql:
    graphiql:
      enabled: true              # GraphiQL UI at /graphiql
    schema:
      printer:
        enabled: true            # Schema endpoint at /graphql/schema
      locations: classpath:graphql/  # Schema file location
    path: /graphql               # GraphQL endpoint
```

## Schema Definition

Spring for GraphQL uses a schema-first approach. Define your schema in `.graphqls` files under `src/main/resources/graphql/`:

### `schema.graphqls`

```graphql
type Query {
    user(id: ID!): User
    users(page: Int = 0, size: Int = 20): UserConnection!
    searchUsers(query: String!, limit: Int = 10): [User!]!
}

type Mutation {
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    deleteUser(id: ID!): Boolean!
    createPost(input: CreatePostInput!): Post!
    addComment(postId: ID!, content: String!): Comment!
}

type Subscription {
    postCreated(authorId: ID): Post!
    commentAdded(postId: ID!): Comment!
}

type User {
    id: ID!
    username: String!
    email: String!
    displayName: String!
    bio: String
    avatarUrl: String
    posts(page: Int = 0, size: Int = 10): PostConnection!
    followers: [User!]!
    following: [User!]!
    followerCount: Int!
    createdAt: DateTime!
}

type Post {
    id: ID!
    title: String!
    content: String!
    slug: String!
    status: PostStatus!
    author: User!
    comments(page: Int = 0, size: Int = 10): CommentConnection!
    tags: [Tag!]!
    likeCount: Int!
    viewCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
}

type Comment {
    id: ID!
    content: String!
    author: User!
    post: Post!
    parentComment: Comment
    replies: [Comment!]!
    createdAt: DateTime!
}

type Tag {
    id: ID!
    name: String!
    postCount: Int!
}

# Pagination types
type UserConnection {
    content: [User!]!
    totalElements: Int!
    totalPages: Int!
    hasNext: Boolean!
}

type PostConnection {
    content: [Post!]!
    totalElements: Int!
    totalPages: Int!
    hasNext: Boolean!
}

type CommentConnection {
    content: [Comment!]!
    totalElements: Int!
    totalPages: Int!
    hasNext: Boolean!
}

enum PostStatus {
    DRAFT
    PUBLISHED
    ARCHIVED
}

# Input types
input CreateUserInput {
    username: String!
    email: String!
    displayName: String!
    bio: String
}

input UpdateUserInput {
    displayName: String
    bio: String
    avatarUrl: String
}

input CreatePostInput {
    title: String!
    content: String!
    tags: [String!]
    status: PostStatus = DRAFT
}

scalar DateTime
```

### Custom Scalar Configuration

```java
@Configuration
public class GraphQlConfig {

    @Bean
    public RuntimeWiringConfigurer runtimeWiringConfigurer() {
        return wiringBuilder -> wiringBuilder
                .scalar(ExtendedScalars.DateTime)
                .scalar(ExtendedScalars.Json);
    }
}
```

## Controllers (DataFetchers)

Spring for GraphQL maps schema operations to controller methods using `@SchemaMapping` and `@QueryMapping`:

### Query Controllers

```java
@Controller
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @QueryMapping
    public User user(@Argument ID id) {
        return userService.findById(id.toString())
                .orElseThrow(() -> new UserNotFoundException(id.toString()));
    }

    @QueryMapping
    public UserConnection users(@Argument int page, @Argument int size) {
        Page<User> userPage = userService.findAll(PageRequest.of(page, size));
        return UserConnection.from(userPage);
    }

    @QueryMapping
    public List<User> searchUsers(@Argument String query, @Argument int limit) {
        return userService.search(query, limit);
    }

    // Schema mapping for nested fields
    // When the GraphQL engine resolves User.posts, this method is called
    @SchemaMapping(typeName = "User", field = "posts")
    public PostConnection posts(User user, @Argument int page, @Argument int size) {
        Page<Post> postPage = postService.findByAuthorId(
                user.getId(), PageRequest.of(page, size));
        return PostConnection.from(postPage);
    }

    @SchemaMapping(typeName = "User", field = "followerCount")
    public int followerCount(User user) {
        return userService.getFollowerCount(user.getId());
    }
}
```

```java
@Controller
public class PostController {

    private final PostService postService;

    @QueryMapping
    public Post post(@Argument ID id) {
        return postService.findById(id.toString())
                .orElseThrow(() -> new PostNotFoundException(id.toString()));
    }

    @SchemaMapping(typeName = "Post", field = "author")
    public User author(Post post) {
        return userService.findById(post.getAuthorId())
                .orElseThrow();
    }

    @SchemaMapping(typeName = "Post", field = "comments")
    public CommentConnection comments(Post post,
                                       @Argument int page,
                                       @Argument int size) {
        Page<Comment> commentPage = commentService.findByPostId(
                post.getId(), PageRequest.of(page, size));
        return CommentConnection.from(commentPage);
    }

    @SchemaMapping(typeName = "Post", field = "tags")
    public List<Tag> tags(Post post) {
        return tagService.findByPostId(post.getId());
    }
}
```

## Mutations

```java
@Controller
public class UserMutationController {

    private final UserService userService;

    @MutationMapping
    public User createUser(@Argument CreateUserInput input) {
        return userService.create(input);
    }

    @MutationMapping
    public User updateUser(@Argument ID id, @Argument UpdateUserInput input,
                           @AuthenticationPrincipal UserDetails currentUser) {
        // Verify the user is updating their own profile
        if (!id.toString().equals(currentUser.getUsername())) {
            throw new AccessDeniedException("Cannot update another user's profile");
        }
        return userService.update(id.toString(), input);
    }

    @MutationMapping
    public boolean deleteUser(@Argument ID id,
                              @AuthenticationPrincipal UserDetails currentUser) {
        return userService.delete(id.toString());
    }
}

@Controller
public class PostMutationController {

    private final PostService postService;

    @MutationMapping
    public Post createPost(@Argument @Valid CreatePostInput input,
                           @AuthenticationPrincipal UserDetails currentUser) {
        return postService.create(input, currentUser.getUsername());
    }

    @MutationMapping
    public Comment addComment(@Argument ID postId, @Argument String content,
                              @AuthenticationPrincipal UserDetails currentUser) {
        return commentService.addComment(
                postId.toString(), content, currentUser.getUsername());
    }
}
```

## Solving the N+1 Problem with DataLoader

The N+1 problem is GraphQL's biggest performance trap. Consider this query:

```graphql
{
  users(page: 0, size: 20) {
    content {
      id
      displayName
      posts(page: 0, size: 5) {
        content {
          title
          author {    # N+1: one query per post's author
            displayName
          }
        }
      }
    }
  }
}
```

Without optimization, resolving `author` for each post triggers a separate database query — 100 posts means 100 author queries. DataLoader solves this by batching and caching:

```
Without DataLoader:                 With DataLoader:
────────────────────                ────────────────────
SELECT * FROM users LIMIT 20       SELECT * FROM users LIMIT 20
  SELECT * FROM posts WHERE         SELECT * FROM posts WHERE
    author_id = 1                     author_id IN (1,2,...,20)
  SELECT * FROM posts WHERE         SELECT * FROM users WHERE
    author_id = 2                     id IN (3,7,12,15,...)  ← single batch
  ...                                 ↑ all author lookups batched
  SELECT * FROM users WHERE id=3
  SELECT * FROM users WHERE id=7
  SELECT * FROM users WHERE id=12
  ... (100 queries)                 (3 queries total)
```

### Registering DataLoaders

```java
@Configuration
public class DataLoaderConfig {

    @Bean
    public BatchLoaderRegistry batchLoaderRegistry() {
        return new DefaultBatchLoaderRegistry();
    }
}
```

### Batch Loading with @BatchMapping

Spring for GraphQL provides `@BatchMapping` which handles DataLoader registration automatically:

```java
@Controller
public class PostController {

    private final UserService userService;
    private final TagService tagService;

    /**
     * Instead of loading one author per post,
     * this receives ALL posts that need authors
     * and returns all authors in a single batch.
     */
    @BatchMapping(typeName = "Post", field = "author")
    public Map<Post, User> authors(List<Post> posts) {
        Set<String> authorIds = posts.stream()
                .map(Post::getAuthorId)
                .collect(Collectors.toSet());

        Map<String, User> userMap = userService.findByIds(authorIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        return posts.stream()
                .collect(Collectors.toMap(
                        Function.identity(),
                        post -> userMap.get(post.getAuthorId())
                ));
    }

    @BatchMapping(typeName = "Post", field = "tags")
    public Map<Post, List<Tag>> tags(List<Post> posts) {
        List<String> postIds = posts.stream()
                .map(Post::getId)
                .toList();

        Map<String, List<Tag>> tagsByPostId = tagService.findByPostIds(postIds);

        return posts.stream()
                .collect(Collectors.toMap(
                        Function.identity(),
                        post -> tagsByPostId.getOrDefault(post.getId(), List.of())
                ));
    }

    @BatchMapping(typeName = "Post", field = "likeCount")
    public Map<Post, Integer> likeCounts(List<Post> posts) {
        List<String> postIds = posts.stream().map(Post::getId).toList();
        Map<String, Integer> counts = likeService.countByPostIds(postIds);
        return posts.stream()
                .collect(Collectors.toMap(
                        Function.identity(),
                        post -> counts.getOrDefault(post.getId(), 0)
                ));
    }
}
```

### Manual DataLoader Registration

For complex scenarios, register DataLoaders manually:

```java
@Controller
public class UserController {

    @SchemaMapping(typeName = "User", field = "followers")
    public CompletableFuture<List<User>> followers(User user, DataLoader<String, List<User>> followersLoader) {
        return followersLoader.load(user.getId());
    }
}

@Component
public class FollowersDataLoaderRegistrar implements BatchLoaderRegistry {

    private final FollowService followService;

    @Override
    public void registerBatchLoaders(BatchLoaderRegistry registry) {
        registry.<String, List<User>>forName("followersLoader")
                .registerMappedBatchLoader((userIds, env) -> {
                    Map<String, List<User>> followersByUserId =
                            followService.findFollowersByUserIds(userIds);
                    return Mono.just(followersByUserId);
                });
    }
}
```

## Subscriptions

GraphQL subscriptions provide real-time data over WebSocket:

```java
@Controller
public class SubscriptionController {

    private final Sinks.Many<Post> postSink = Sinks.many().multicast().onBackpressureBuffer();
    private final Sinks.Many<Comment> commentSink = Sinks.many().multicast().onBackpressureBuffer();

    @SubscriptionMapping
    public Flux<Post> postCreated(@Argument String authorId) {
        Flux<Post> stream = postSink.asFlux();
        if (authorId != null) {
            stream = stream.filter(post -> post.getAuthorId().equals(authorId));
        }
        return stream;
    }

    @SubscriptionMapping
    public Flux<Comment> commentAdded(@Argument String postId) {
        return commentSink.asFlux()
                .filter(comment -> comment.getPostId().equals(postId));
    }

    // Called from PostService when a post is created
    public void publishPostCreated(Post post) {
        postSink.tryEmitNext(post);
    }

    public void publishCommentAdded(Comment comment) {
        commentSink.tryEmitNext(comment);
    }
}
```

### WebSocket Configuration for Subscriptions

```yaml
spring:
  graphql:
    websocket:
      path: /graphql          # Same path, different protocol
      connection-init-timeout: 60s
      keep-alive:
        interval: 30s
```

## Error Handling

### Custom Exception Resolver

```java
@Component
public class GraphQlExceptionResolver extends DataFetcherExceptionResolverAdapter {

    @Override
    protected GraphQLError resolveToSingleError(Throwable ex,
                                                  DataFetchingEnvironment env) {
        if (ex instanceof UserNotFoundException) {
            return GraphqlErrorBuilder.newError(env)
                    .message("User not found: " + ex.getMessage())
                    .errorType(ErrorType.NOT_FOUND)
                    .extensions(Map.of("code", "USER_NOT_FOUND"))
                    .build();
        }

        if (ex instanceof AccessDeniedException) {
            return GraphqlErrorBuilder.newError(env)
                    .message("Access denied")
                    .errorType(ErrorType.FORBIDDEN)
                    .build();
        }

        if (ex instanceof ConstraintViolationException cve) {
            return GraphqlErrorBuilder.newError(env)
                    .message("Validation failed")
                    .errorType(ErrorType.BAD_REQUEST)
                    .extensions(Map.of(
                            "code", "VALIDATION_ERROR",
                            "violations", cve.getConstraintViolations().stream()
                                    .map(v -> Map.of(
                                            "field", v.getPropertyPath().toString(),
                                            "message", v.getMessage()))
                                    .toList()
                    ))
                    .build();
        }

        // Unknown errors — log and return generic message
        log.error("Unexpected error in GraphQL execution at {}.{}",
                env.getParentType().getName(), env.getField().getName(), ex);
        return GraphqlErrorBuilder.newError(env)
                .message("Internal server error")
                .errorType(ErrorType.INTERNAL_ERROR)
                .build();
    }
}
```

## Security

### Securing at the Controller Level

```java
@Controller
public class AdminController {

    @QueryMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<User> allUsers() {
        return userService.findAll();
    }

    @MutationMapping
    @PreAuthorize("hasRole('ADMIN')")
    public boolean deleteUser(@Argument ID id) {
        return userService.delete(id.toString());
    }
}
```

### Query Depth and Complexity Limiting

Prevent abuse with query complexity analysis:

```java
@Bean
public GraphQlSourceBuilderCustomizer graphQlSourceCustomizer() {
    return builder -> builder.configureGraphQl(graphQlBuilder ->
        graphQlBuilder.instrumentation(List.of(
                new MaxQueryDepthInstrumentation(10),
                new MaxQueryComplexityInstrumentation(200)
        ))
    );
}
```

## Testing

```java
@SpringBootTest
@AutoConfigureHttpGraphQlTester
class UserControllerTest {

    @Autowired
    private HttpGraphQlTester graphQlTester;

    @Test
    void shouldFetchUser() {
        graphQlTester.document("""
                    query {
                        user(id: "1") {
                            id
                            username
                            displayName
                        }
                    }
                """)
                .execute()
                .path("user.username").entity(String.class).isEqualTo("johndoe")
                .path("user.displayName").entity(String.class).isEqualTo("John Doe");
    }

    @Test
    void shouldCreateUser() {
        graphQlTester.document("""
                    mutation {
                        createUser(input: {
                            username: "newuser"
                            email: "new@example.com"
                            displayName: "New User"
                        }) {
                            id
                            username
                        }
                    }
                """)
                .execute()
                .path("createUser.username").entity(String.class).isEqualTo("newuser")
                .path("createUser.id").entity(String.class).satisfies(id ->
                        assertThat(id).isNotBlank());
    }

    @Test
    void shouldReturnErrorForMissingUser() {
        graphQlTester.document("""
                    query {
                        user(id: "999") {
                            id
                        }
                    }
                """)
                .execute()
                .errors()
                .expect(error -> error.getErrorType() == ErrorType.NOT_FOUND)
                .verify()
                .path("user").valueIsNull();
    }
}
```

## REST vs GraphQL Decision Matrix

| Factor | REST | GraphQL |
|--------|------|---------|
| Client diversity | Single client, fixed views | Multiple clients with different data needs |
| Data relationships | Simple, flat resources | Deeply nested, interconnected data |
| Caching | HTTP caching built-in | Requires client-side cache (Apollo, Relay) |
| File uploads | Straightforward | Requires multipart spec or separate endpoint |
| Learning curve | Low | Medium-high |
| Monitoring | Standard HTTP metrics | Custom per-field instrumentation needed |
| API evolution | Versioned endpoints | Schema evolution with deprecation |

GraphQL is not a universal replacement for REST. Use it when clients genuinely need flexibility in what data they fetch. For simple CRUD with a single consumer, REST is simpler and better supported by infrastructure tooling. For complex, multi-client APIs where over-fetching and under-fetching are real problems, GraphQL delivers significant value.
