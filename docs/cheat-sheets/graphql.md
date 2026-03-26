---
title: "GraphQL Cheat Sheet"
description: "Quick reference for GraphQL — queries, mutations, subscriptions, schema definition, directives, fragments, and Apollo Client patterns"
tags: [graphql, cheat-sheet, reference, api, frontend]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# GraphQL Cheat Sheet

Quick reference for GraphQL schema design, query syntax, and client-side patterns. Covers SDL, operations, variables, directives, fragments, error handling, and Apollo Client.

**Related**: [REST API Design](/architecture/api-design) | [State Management](/frontend-engineering/state-management)

---

## Schema Definition Language (SDL)

### Scalar Types

| Type | Description |
|------|-------------|
| `Int` | Signed 32-bit integer |
| `Float` | Signed double-precision floating-point |
| `String` | UTF-8 character sequence |
| `Boolean` | `true` or `false` |
| `ID` | Unique identifier (serialized as String) |

### Type Definitions

```graphql
# Object type
type User {
  id: ID!
  name: String!
  email: String!
  age: Int
  posts: [Post!]!
  role: Role!
  createdAt: DateTime!
}

# Enum
enum Role {
  ADMIN
  USER
  MODERATOR
}

# Interface
interface Node {
  id: ID!
}

interface Timestamped {
  createdAt: DateTime!
  updatedAt: DateTime!
}

# Implementing multiple interfaces
type Post implements Node & Timestamped {
  id: ID!
  title: String!
  body: String!
  author: User!
  tags: [String!]!
  status: PostStatus!
  createdAt: DateTime!
  updatedAt: DateTime!
}

# Union type
union SearchResult = User | Post | Comment

# Input type (for mutations)
input CreatePostInput {
  title: String!
  body: String!
  tags: [String!] = []
  status: PostStatus = DRAFT
}

# Custom scalar
scalar DateTime
scalar JSON
scalar URL
```

### Non-Null & Lists

| Syntax | Meaning |
|--------|---------|
| `String` | Nullable string |
| `String!` | Non-null string |
| `[String]` | Nullable list of nullable strings |
| `[String!]` | Nullable list of non-null strings |
| `[String!]!` | Non-null list of non-null strings |

---

## Queries

### Basic Query

```graphql
query GetUser {
  user(id: "123") {
    id
    name
    email
    posts {
      title
      createdAt
    }
  }
}
```

### With Variables

```graphql
query GetUser($userId: ID!, $includeEmail: Boolean = false) {
  user(id: $userId) {
    id
    name
    email @include(if: $includeEmail)
    posts(first: 10, orderBy: CREATED_AT_DESC) {
      edges {
        node {
          title
        }
      }
    }
  }
}
```

Variables JSON:

```json
{
  "userId": "123",
  "includeEmail": true
}
```

### Aliases

```graphql
query ComparePosts {
  firstPost: post(id: "1") {
    title
    viewCount
  }
  secondPost: post(id: "2") {
    title
    viewCount
  }
}
```

---

## Fragments

### Named Fragments

```graphql
fragment UserBasic on User {
  id
  name
  email
  avatar
}

fragment PostSummary on Post {
  id
  title
  createdAt
  author {
    ...UserBasic
  }
}

query Dashboard {
  me {
    ...UserBasic
    role
  }
  recentPosts(limit: 10) {
    ...PostSummary
  }
}
```

### Inline Fragments (for Unions/Interfaces)

```graphql
query Search($term: String!) {
  search(term: $term) {
    ... on User {
      id
      name
      email
    }
    ... on Post {
      id
      title
      author { name }
    }
    ... on Comment {
      id
      body
      post { title }
    }
  }
}
```

---

## Mutations

```graphql
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    id
    title
    status
    author {
      id
      name
    }
  }
}

mutation UpdatePost($id: ID!, $input: UpdatePostInput!) {
  updatePost(id: $id, input: $input) {
    id
    title
    updatedAt
  }
}

mutation DeletePost($id: ID!) {
  deletePost(id: $id) {
    success
    message
  }
}
```

### Batch Mutations

```graphql
mutation BatchOps {
  updateUser(id: "1", input: { name: "New Name" }) {
    id
    name
  }
  publishPost(id: "42") {
    id
    status
  }
}
```

---

## Subscriptions

```graphql
subscription OnNewMessage($roomId: ID!) {
  messageCreated(roomId: $roomId) {
    id
    body
    sender {
      id
      name
    }
    createdAt
  }
}
```

---

## Directives

### Built-in Directives

| Directive | Usage |
|-----------|-------|
| `@include(if: Boolean!)` | Include field when condition is true |
| `@skip(if: Boolean!)` | Skip field when condition is true |
| `@deprecated(reason: String)` | Mark field as deprecated in schema |

```graphql
# Client-side
query GetUser($withPosts: Boolean!) {
  user(id: "1") {
    name
    posts @include(if: $withPosts) {
      title
    }
  }
}
```

### Custom Directives (Schema)

```graphql
# Define
directive @auth(requires: Role!) on FIELD_DEFINITION
directive @cacheControl(maxAge: Int!) on FIELD_DEFINITION

# Use
type Query {
  publicPosts: [Post!]! @cacheControl(maxAge: 300)
  adminDashboard: Dashboard! @auth(requires: ADMIN)
}
```

---

## Pagination Patterns

### Cursor-Based (Relay Style)

```graphql
type Query {
  posts(first: Int, after: String, last: Int, before: String): PostConnection!
}

type PostConnection {
  edges: [PostEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type PostEdge {
  cursor: String!
  node: Post!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

```graphql
# Usage
query Posts($cursor: String) {
  posts(first: 20, after: $cursor) {
    edges {
      cursor
      node {
        id
        title
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Offset-Based

```graphql
type Query {
  posts(limit: Int = 20, offset: Int = 0): PostList!
}

type PostList {
  items: [Post!]!
  total: Int!
}
```

::: tip
Cursor-based pagination is more robust for real-time data. Offset-based is simpler but breaks when items are inserted/deleted during pagination.
:::

---

## Error Handling

### Standard Error Format

```json
{
  "data": null,
  "errors": [
    {
      "message": "User not found",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["user"],
      "extensions": {
        "code": "NOT_FOUND",
        "statusCode": 404
      }
    }
  ]
}
```

### Union-Based Errors (Recommended)

```graphql
type Mutation {
  createPost(input: CreatePostInput!): CreatePostResult!
}

union CreatePostResult = CreatePostSuccess | ValidationError | AuthError

type CreatePostSuccess {
  post: Post!
}

type ValidationError {
  field: String!
  message: String!
}

type AuthError {
  message: String!
}
```

---

## Apollo Client Patterns

### Setup

```typescript
import { ApolloClient, InMemoryCache, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const httpLink = new HttpLink({ uri: '/graphql' });

const wsLink = new GraphQLWsLink(
  createClient({ url: 'ws://localhost:4000/graphql' })
);

// Route subscriptions over WebSocket, everything else over HTTP
const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === 'OperationDefinition' && def.operation === 'subscription';
  },
  wsLink,
  httpLink
);

const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
```

### useQuery

```typescript
const GET_POSTS = gql`
  query GetPosts($limit: Int!) {
    posts(limit: $limit) {
      id
      title
      author { name }
    }
  }
`;

function PostList() {
  const { data, loading, error, refetch } = useQuery(GET_POSTS, {
    variables: { limit: 20 },
    pollInterval: 30000,           // refetch every 30s
    fetchPolicy: 'cache-and-network',
  });

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return data.posts.map(post => <PostCard key={post.id} post={post} />);
}
```

### useMutation

```typescript
const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
      title
    }
  }
`;

function CreatePostForm() {
  const [createPost, { loading }] = useMutation(CREATE_POST, {
    // Update cache after mutation
    update(cache, { data: { createPost } }) {
      cache.modify({
        fields: {
          posts(existingPosts = []) {
            const newRef = cache.writeFragment({
              data: createPost,
              fragment: gql`fragment NewPost on Post { id title }`,
            });
            return [...existingPosts, newRef];
          },
        },
      });
    },
    onCompleted: () => toast.success('Post created'),
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (input) => {
    createPost({ variables: { input } });
  };
}
```

### Fetch Policies

| Policy | Description |
|--------|-------------|
| `cache-first` | Read from cache, fetch only if missing (default) |
| `cache-and-network` | Return cache immediately, then fetch and update |
| `network-only` | Always fetch, then update cache |
| `cache-only` | Only read from cache, never fetch |
| `no-cache` | Always fetch, never read or write cache |

::: warning
`cache-first` is the default. This is efficient but can show stale data. Use `cache-and-network` for data that changes frequently.
:::

---

## Schema Design Best Practices

| Practice | Why |
|----------|-----|
| Use `input` types for mutations | Clear separation, reusable, versionable |
| Non-null by default, nullable when needed | Prevents null checks everywhere |
| Use enums over strings | Type safety, autocomplete, validation |
| Cursor pagination over offset | Stable with real-time data |
| Union errors over thrown errors | Client handles all cases explicitly |
| Consistent naming: `createX`, `updateX`, `deleteX` | Predictable API surface |
| Avoid deeply nested queries | N+1 risk, complexity budget |
| Version via new fields, not new endpoints | Additive schema evolution |

---

---

::: details Test Yourself
1. **What does `!` mean after a type in GraphQL SDL?**
   Non-null -- the field is guaranteed to return a value (never null).

2. **How do you request the same field with different arguments in one query?**
   Use aliases: `firstPost: post(id: "1") { title }`

3. **What directive conditionally includes a field based on a variable?**
   `@include(if: $variable)`

4. **What is the difference between `input` types and regular types?**
   `input` types are used for mutation arguments; regular `type` definitions are for output/return types.

5. **How do you handle union types in a query?**
   Use inline fragments: `... on User { name }` and `... on Post { title }`

6. **What pagination style is recommended for real-time data?**
   Cursor-based (Relay style) with `edges`, `node`, and `pageInfo`.

7. **What Apollo Client fetch policy returns cached data immediately, then fetches and updates?**
   `cache-and-network`

8. **How do you mark a field as deprecated in the schema?**
   `@deprecated(reason: "Use newField instead")`

9. **What is the recommended approach for error handling in mutations?**
   Union-based errors: `union CreatePostResult = CreatePostSuccess | ValidationError | AuthError`

10. **How do you force the Apollo cache to update after a mutation?**
    Use the `update` callback on `useMutation` to modify the cache directly with `cache.modify`.
:::

::: danger Common Gotchas
- **N+1 query problem.** A naive resolver that fetches related data per-item creates N+1 database queries. Use DataLoader for batching.
- **Over-fetching nested queries.** Deeply nested queries can explode into huge responses. Implement query depth limiting and complexity analysis on the server.
- **`cache-first` shows stale data.** It is the Apollo Client default, but for frequently changing data, use `cache-and-network` or `network-only`.
- **Confusing `null` field vs missing field.** A null field means the server returned null; a missing field means you did not request it. The `!` modifier prevents nulls at the schema level.
:::

## One-Liner Summary

GraphQL lets clients request exactly the data they need in a single query -- master SDL types, fragments, variables, and cursor pagination to build flexible, efficient APIs.

*Last updated: 2026-03-20*
