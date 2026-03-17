---
title: "gRPC Internals"
description: "Protocol Buffers binary encoding, gRPC stream patterns, interceptors, deadlines, error model, and load balancing deep dive"
tags: [grpc, protobuf, http2, microservices, rpc, typescript]
difficulty: "advanced"
prerequisites: ["networking/http2-http3"]
lastReviewed: "2026-03-17"
---

# gRPC Internals

gRPC is the de facto standard for internal service-to-service communication in microservices architectures. It is fast (binary encoding, HTTP/2 multiplexing), strongly typed (Protobuf schema), and cross-language. But its internals are often opaque — engineers use it without understanding what travels on the wire, how deadlines propagate, why load balancing requires L7, or what happens to streams when a service restarts.

This page goes from the bit-level encoding of Protocol Buffers to production-grade TypeScript implementations of all four service patterns.

## Protocol Buffers: Binary Encoding

Protocol Buffers (protobuf) is a language-neutral binary serialization format. It is not gRPC — you can use protobuf without gRPC, and gRPC historically used protobuf but supports other codecs (JSON, Avro).

### Wire Types

Every protobuf field is encoded as a **tag** followed by a **value**. The tag encodes both the field number (from the `.proto` definition) and the wire type (how to decode the value):

$$\text{tag} = (\text{field\_number} \ll 3) | \text{wire\_type}$$

| Wire Type | Value | Used For |
|-----------|-------|----------|
| VARINT | 0 | int32, int64, uint32, uint64, sint32, sint64, bool, enum |
| I64 | 1 | fixed64, sfixed64, double |
| LEN | 2 | string, bytes, embedded messages, repeated fields |
| SGROUP | 3 | group start (deprecated) |
| EGROUP | 4 | group end (deprecated) |
| I32 | 5 | fixed32, sfixed32, float |

### Varint Encoding

Varints are the clever compression at the heart of protobuf. Small numbers take fewer bytes:

Each byte uses 7 bits for data and 1 bit (the most significant) as a "continuation bit" (1 = more bytes follow, 0 = last byte). Bytes are in **little-endian** order (least significant group first).

Example: encoding the number 300:

$$300 = 0b100101100$$

Split into 7-bit groups (LSB first): `0101100` and `0000010`

Add continuation bits: `10101100 00000010` = `0xAC 0x02`

```
Byte 1: 1|0101100  (continuation=1, data=0101100 = 44)
Byte 2: 0|0000010  (continuation=0, data=0000010 = 2)
Value: 44 + (2 << 7) = 44 + 256 = 300 ✓
```

Numbers 0–127 fit in 1 byte. Numbers 128–16383 take 2 bytes. This is optimal for the typical distribution of small integers in API payloads (IDs, status codes, counts).

**Negative numbers:** int64 of -1 is encoded as a 10-byte varint (the full 64-bit two's complement value). For fields that are commonly negative, use `sint32`/`sint64` which apply ZigZag encoding:

$$ZigZag(n) = (n \ll 1) \oplus (n \gg 31)$$

This maps `0 → 0`, `-1 → 1`, `1 → 2`, `-2 → 3`, etc., making small negative numbers efficient.

### Wire Example

```protobuf
message SearchRequest {
  string query = 1;
  int32 page_number = 2;
  int32 results_per_page = 3;
}
```

Encoding `{query: "testing", page_number: 1, results_per_page: 3}`:

```
Field 1 (query), wire type 2 (LEN):
  Tag: (1 << 3) | 2 = 0x0A
  Length: 7 (varint: 0x07)
  Data: "testing" = 0x74 0x65 0x73 0x74 0x69 0x6E 0x67

Field 2 (page_number), wire type 0 (VARINT):
  Tag: (2 << 3) | 0 = 0x10
  Value: 1 (varint: 0x01)

Field 3 (results_per_page), wire type 0 (VARINT):
  Tag: (3 << 3) | 0 = 0x18
  Value: 3 (varint: 0x03)

Full encoding: 0A 07 74 65 73 74 69 6E 67 10 01 18 03 (13 bytes)
```

JSON equivalent: `{"query":"testing","page_number":1,"results_per_page":3}` = 55 bytes.

**4.2× smaller** with protobuf for this example. The ratio improves for nested messages and repeated fields with numeric values.

### Proto3 Field Evolution Rules

Protobuf's evolution rules are what make it safe to use as an API schema across independently deployed services:

::: danger Never Do These
1. **Never reuse a field number** — old clients/servers will misinterpret the type
2. **Never change a field's type** in a way that changes wire type (e.g., int32 → string)
3. **Never change required to optional** (proto2 only, but still) or vice versa
4. **Never remove a field and reuse its number** — the "removed" field is just reserved
:::

::: tip Safe Evolution
1. **Add new fields** — old clients ignore unknown fields; old servers return default values
2. **Remove fields** — mark as `reserved` to prevent number reuse
3. **Rename fields** — names don't appear in the binary encoding, only numbers matter
4. **Change optional to repeated** — wire-compatible for scalar types
:::

```protobuf
syntax = "proto3";

message User {
  uint64 id = 1;
  string email = 2;
  string name = 3;

  // Field 4 was "phone" — removed in v2. Mark as reserved to prevent reuse.
  reserved 4;
  reserved "phone";

  // Added in v2 — safe, old clients ignore it
  repeated string roles = 5;

  // Added in v3
  google.protobuf.Timestamp created_at = 6;
}
```

## gRPC over HTTP/2

gRPC maps its four communication patterns onto HTTP/2 streams:

- **Request headers** → HTTP/2 HEADERS frame (gRPC metadata + `:method POST`, `:content-type application/grpc`)
- **Request body** → HTTP/2 DATA frames (length-prefixed protobuf messages)
- **Response headers** → HTTP/2 HEADERS frame (gRPC metadata + `:status 200`)
- **Response body** → HTTP/2 DATA frames
- **Trailers** → HTTP/2 HEADERS frame with END_STREAM flag (`grpc-status`, `grpc-message`)

### The gRPC Message Format

Each gRPC message on the wire is a 5-byte length-prefixed frame:

```
+-------+--------+--------+--------+--------+--------+---------...
| Compr.|         Message Length (4 bytes)    | Message bytes
| Flag  |                                     | (protobuf)
+-------+--------------------------------------+---------...
  1 byte              4 bytes
```

- **Compression flag:** 0 = not compressed, 1 = compressed (using negotiated algorithm)
- **Message length:** 32-bit unsigned big-endian integer
- **Message bytes:** protobuf-encoded message body

HTTP/2 splits these into arbitrary-sized DATA frames. The gRPC layer reassembles them.

### gRPC Status and Trailers

gRPC status codes are sent in HTTP/2 trailers (a HEADERS frame after the DATA frames, with the END_STREAM flag set):

```
grpc-status: 0          # 0 = OK
grpc-message:           # empty on success
grpc-status-details-bin: <base64-encoded google.rpc.Status>
```

The trailers model is why gRPC-Web (gRPC in browsers) is complex — browsers cannot access HTTP/2 trailers from the Fetch API. gRPC-Web uses a different encoding that puts trailers at the end of the response body.

## The Four Service Patterns

### Complete Proto Definition

```protobuf
// user_service.proto
syntax = "proto3";

package userservice.v1;

option go_package = "github.com/example/userservice/gen/go";

import "google/protobuf/timestamp.proto";
import "google/protobuf/empty.proto";

service UserService {
  // Unary: one request, one response
  rpc GetUser (GetUserRequest) returns (User);

  // Server streaming: one request, stream of responses
  rpc ListUsersStream (ListUsersRequest) returns (stream User);

  // Client streaming: stream of requests, one response
  rpc BatchCreateUsers (stream CreateUserRequest) returns (BatchCreateResponse);

  // Bidirectional streaming: stream of requests, stream of responses
  rpc SyncUsers (stream SyncRequest) returns (stream SyncResponse);
}

message GetUserRequest {
  uint64 id = 1;
}

message ListUsersRequest {
  uint32 page_size = 1;
  string page_token = 2;
}

message CreateUserRequest {
  string email = 1;
  string name = 2;
  repeated string roles = 3;
}

message SyncRequest {
  oneof payload {
    CreateUserRequest create = 1;
    UpdateUserRequest update = 2;
    DeleteUserRequest delete = 3;
  }
}

message SyncResponse {
  uint64 id = 1;
  SyncStatus status = 2;
  string error_message = 3;

  enum SyncStatus {
    UNKNOWN = 0;
    SUCCESS = 1;
    FAILED = 2;
    SKIPPED = 3;
  }
}

message User {
  uint64 id = 1;
  string email = 2;
  string name = 3;
  repeated string roles = 5;
  google.protobuf.Timestamp created_at = 6;
  google.protobuf.Timestamp updated_at = 7;
}

message BatchCreateResponse {
  uint32 created = 1;
  uint32 failed = 2;
  repeated string errors = 3;
}

message UpdateUserRequest {
  uint64 id = 1;
  optional string email = 2;
  optional string name = 3;
}

message DeleteUserRequest {
  uint64 id = 1;
}
```

### Pattern 1: Unary RPC (TypeScript)

```typescript
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Load proto
const packageDefinition = protoLoader.loadSync(
  path.join(__dirname, '../proto/user_service.proto'),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [path.join(__dirname, '../proto')],
  }
);

const proto = grpc.loadPackageDefinition(packageDefinition) as any;

// Server implementation
class UserServiceImpl {
  async getUser(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    const { id } = call.request;

    // Access gRPC metadata
    const authToken = call.metadata.get('authorization')[0] as string;
    if (!authToken?.startsWith('Bearer ')) {
      return callback({
        code: grpc.status.UNAUTHENTICATED,
        message: 'Missing or invalid authorization token',
      });
    }

    // Check deadline
    const deadline = call.deadline;
    if (deadline && Date.now() > (deadline as Date).getTime()) {
      return callback({
        code: grpc.status.DEADLINE_EXCEEDED,
        message: 'Deadline exceeded before processing started',
      });
    }

    try {
      const user = await db.findUser(BigInt(id));
      if (!user) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: `User ${id} not found`,
          details: `No user exists with id=${id}`,
        });
      }

      callback(null, {
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        roles: user.roles,
        created_at: {
          seconds: Math.floor(user.createdAt.getTime() / 1000),
          nanos: (user.createdAt.getTime() % 1000) * 1_000_000,
        },
      });
    } catch (err) {
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal error',
        details: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
}
```

### Pattern 2: Server Streaming RPC

```typescript
async listUsersStream(
  call: grpc.ServerWritableStream<any, any>
): Promise<void> {
  const { page_size } = call.request;
  const batchSize = Math.min(page_size || 100, 1000);

  // Check for client cancellation
  call.on('cancelled', () => {
    console.log('Client cancelled ListUsersStream');
    // Cleanup, stop DB cursors, etc.
  });

  try {
    // Use a database cursor for memory-efficient streaming
    const cursor = db.streamAllUsers({ batchSize });

    for await (const user of cursor) {
      // Check if client cancelled between sends
      if (call.cancelled) break;

      // Check if deadline exceeded
      if (call.deadline && Date.now() > (call.deadline as Date).getTime()) {
        call.destroy(new Error('Deadline exceeded'));
        return;
      }

      // Apply backpressure: write() returns false if buffer is full
      const canContinue = call.write({
        id: user.id.toString(),
        email: user.email,
        name: user.name,
        roles: user.roles,
      });

      // If downstream is slow, wait for drain before sending more
      if (!canContinue) {
        await new Promise<void>((resolve) => call.once('drain', resolve));
      }
    }

    call.end();  // Signals end of stream; sends trailers with grpc-status: 0
  } catch (err) {
    call.destroy(
      Object.assign(new Error('Stream failed'), { code: grpc.status.INTERNAL })
    );
  }
}
```

### Pattern 3: Client Streaming RPC

```typescript
async batchCreateUsers(
  call: grpc.ServerReadableStream<any, any>,
  callback: grpc.sendUnaryData<any>
): Promise<void> {
  const results = { created: 0, failed: 0, errors: [] as string[] };

  call.on('data', async (createRequest: any) => {
    // Pause stream to handle backpressure during DB writes
    call.pause();

    try {
      await db.createUser({
        email: createRequest.email,
        name: createRequest.name,
        roles: createRequest.roles,
      });
      results.created++;
    } catch (err) {
      results.failed++;
      results.errors.push(
        err instanceof Error ? err.message : `Failed to create ${createRequest.email}`
      );
    } finally {
      call.resume();
    }
  });

  call.on('end', () => {
    // Stream complete; return single response
    callback(null, results);
  });

  call.on('error', (err) => {
    console.error('Client stream error:', err);
    callback({
      code: grpc.status.INTERNAL,
      message: 'Stream error',
    });
  });
}
```

### Pattern 4: Bidirectional Streaming RPC

```typescript
async syncUsers(
  call: grpc.ServerDuplexStream<any, any>
): Promise<void> {
  const activeOps = new Map<string, Promise<void>>();
  let streamEnded = false;

  call.on('data', async (syncRequest: any) => {
    const opId = `${Date.now()}-${Math.random()}`;

    const operation = (async () => {
      try {
        let result: any;

        switch (syncRequest.payload) {
          case 'create':
            const user = await db.createUser(syncRequest.create);
            result = { id: user.id.toString(), status: 'SUCCESS' };
            break;
          case 'update':
            await db.updateUser(syncRequest.update.id, syncRequest.update);
            result = { id: syncRequest.update.id.toString(), status: 'SUCCESS' };
            break;
          case 'delete':
            await db.deleteUser(syncRequest.delete.id);
            result = { id: syncRequest.delete.id.toString(), status: 'SUCCESS' };
            break;
          default:
            result = { id: '0', status: 'SKIPPED', error_message: 'Unknown operation' };
        }

        if (!call.cancelled) {
          call.write(result);
        }
      } catch (err) {
        if (!call.cancelled) {
          call.write({
            id: '0',
            status: 'FAILED',
            error_message: err instanceof Error ? err.message : 'Operation failed',
          });
        }
      } finally {
        activeOps.delete(opId);
        // If stream ended and no more ops, close
        if (streamEnded && activeOps.size === 0) {
          call.end();
        }
      }
    })();

    activeOps.set(opId, operation);
  });

  call.on('end', () => {
    streamEnded = true;
    // Wait for all in-flight ops before ending
    if (activeOps.size === 0) {
      call.end();
    }
  });

  call.on('cancelled', () => {
    console.log('SyncUsers stream cancelled by client');
  });

  call.on('error', (err) => {
    console.error('SyncUsers error:', err);
  });
}
```

### Starting the gRPC Server

```typescript
function createServer(): grpc.Server {
  const server = new grpc.Server({
    'grpc.keepalive_time_ms': 10_000,              // Send keepalive every 10s
    'grpc.keepalive_timeout_ms': 5_000,            // Expect pong within 5s
    'grpc.keepalive_permit_without_calls': 1,      // Keepalive even with no active streams
    'grpc.max_connection_idle_ms': 300_000,        // Close connections idle > 5min
    'grpc.max_connection_age_ms': 600_000,         // Max connection age 10min (for load balancing)
    'grpc.max_connection_age_grace_ms': 30_000,    // Grace period for in-flight RPCs
    'grpc.http2.max_pings_without_data': 0,        // Allow keepalive pings without active RPCs
  });

  const impl = new UserServiceImpl();
  server.addService(proto.userservice.v1.UserService.service, {
    getUser: impl.getUser.bind(impl),
    listUsersStream: impl.listUsersStream.bind(impl),
    batchCreateUsers: impl.batchCreateUsers.bind(impl),
    syncUsers: impl.syncUsers.bind(impl),
  });

  return server;
}

const server = createServer();
server.bindAsync(
  '0.0.0.0:50051',
  grpc.ServerCredentials.createSsl(
    fs.readFileSync('ca.crt'),
    [{ cert_chain: fs.readFileSync('server.crt'), private_key: fs.readFileSync('server.key') }],
    true  // requireClientAuth (for mTLS)
  ),
  (err, port) => {
    if (err) throw err;
    console.log(`gRPC server listening on port ${port}`);
    server.start();
  }
);

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down gRPC server`);
  await new Promise<void>((resolve, reject) => {
    server.tryShutdown((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

## Interceptors (Middleware)

gRPC interceptors are middleware that wraps RPC calls, equivalent to HTTP middleware:

```typescript
import * as grpc from '@grpc/grpc-js';

// Authentication interceptor
function authInterceptor(
  options: grpc.InterceptorOptions,
  nextCall: (options: grpc.InterceptorOptions) => grpc.InterceptingCall
): grpc.InterceptingCall {
  return new grpc.InterceptingCall(nextCall(options), {
    start(metadata, listener, next) {
      const token = metadata.get('authorization')[0] as string;

      if (!token || !token.startsWith('Bearer ')) {
        const errorStatus = {
          code: grpc.status.UNAUTHENTICATED,
          details: 'Missing authorization token',
          metadata: new grpc.Metadata(),
        };
        // Short-circuit: don't call next, report error directly
        listener.onReceiveStatus(errorStatus);
        return;
      }

      // Validate JWT (simplified)
      try {
        const payload = validateJWT(token.slice(7));
        // Inject validated identity into metadata for downstream handlers
        metadata.set('x-user-id', payload.sub);
        metadata.set('x-user-roles', JSON.stringify(payload.roles));
        next(metadata, listener);
      } catch {
        listener.onReceiveStatus({
          code: grpc.status.UNAUTHENTICATED,
          details: 'Invalid token',
          metadata: new grpc.Metadata(),
        });
      }
    },
  });
}

// Logging and metrics interceptor
function observabilityInterceptor(
  options: grpc.InterceptorOptions,
  nextCall: (options: grpc.InterceptorOptions) => grpc.InterceptingCall
): grpc.InterceptingCall {
  const method = options.method_definition?.path ?? 'unknown';
  const startTime = Date.now();

  return new grpc.InterceptingCall(nextCall(options), {
    start(metadata, listener, next) {
      const requestId = metadata.get('x-request-id')[0] as string ?? generateRequestId();
      metadata.set('x-request-id', requestId);

      console.log({ event: 'rpc_start', method, requestId });

      const wrappedListener: grpc.Listener = {
        onReceiveMetadata: listener.onReceiveMetadata?.bind(listener),
        onReceiveMessage: listener.onReceiveMessage?.bind(listener),
        onReceiveStatus(status) {
          const duration = Date.now() - startTime;
          const ok = status.code === grpc.status.OK;

          console.log({
            event: 'rpc_end',
            method,
            requestId,
            statusCode: grpc.status[status.code],
            durationMs: duration,
            ok,
          });

          // Emit metrics
          metrics.histogram('grpc_request_duration_ms', duration, { method, status: grpc.status[status.code] });
          metrics.counter('grpc_requests_total', 1, { method, ok: String(ok) });

          listener.onReceiveStatus(status);
        },
      };

      next(metadata, wrappedListener);
    },
  });
}

// Retry interceptor (for idempotent RPCs)
function retryInterceptor(maxAttempts: number = 3) {
  return function(
    options: grpc.InterceptorOptions,
    nextCall: (options: grpc.InterceptorOptions) => grpc.InterceptingCall
  ): grpc.InterceptingCall {
    const retriableStatuses = new Set([
      grpc.status.UNAVAILABLE,
      grpc.status.RESOURCE_EXHAUSTED,
    ]);

    let attempts = 0;

    function attempt(): grpc.InterceptingCall {
      attempts++;
      return new grpc.InterceptingCall(nextCall(options), {
        start(metadata, listener, next) {
          next(metadata, {
            onReceiveMetadata: listener.onReceiveMetadata?.bind(listener),
            onReceiveMessage: listener.onReceiveMessage?.bind(listener),
            onReceiveStatus(status) {
              if (retriableStatuses.has(status.code) && attempts < maxAttempts) {
                const delay = Math.min(100 * 2 ** (attempts - 1), 5000);
                console.warn(`gRPC retry attempt ${attempts}/${maxAttempts} for ${options.method_definition?.path} after ${delay}ms`);
                setTimeout(() => {
                  // Restart the call
                  attempt().start(metadata, listener, next);
                }, delay);
              } else {
                listener.onReceiveStatus(status);
              }
            },
          });
        },
      });
    }

    return attempt();
  };
}

// Apply interceptors to client
const client = new proto.userservice.v1.UserService(
  'localhost:50051',
  grpc.credentials.createSsl(fs.readFileSync('ca.crt')),
  {
    interceptors: [
      observabilityInterceptor,
      authInterceptor,
      retryInterceptor(3),
    ],
  }
);
```

## Deadlines and Cancellation

Deadlines are one of gRPC's most important features — and one of the most commonly misused.

### How Deadlines Work

A **deadline** is an absolute timestamp by which the entire RPC must complete (not a timeout duration). This is crucial: when service A calls service B with a 5-second deadline, and service B calls service C, service B should pass the *remaining* deadline to service C — not a fresh 5 seconds.

```typescript
// WRONG: gives C a fresh 5 seconds; ignores how long A→B took
function callServiceC() {
  const deadline = new Date(Date.now() + 5000);
  return cClient.someRPC(request, { deadline });
}

// CORRECT: propagate the deadline from the incoming RPC
async function handleRPCFromA(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  // The deadline from A is available here
  const incomingDeadline = call.deadline;

  // Pass it through to downstream calls
  const outgoingMetadata = call.metadata.clone();

  return new Promise((resolve, reject) => {
    cClient.someRPC(
      request,
      { deadline: incomingDeadline },  // Pass through, don't reset
      (err, response) => {
        if (err) reject(err);
        else resolve(response);
      }
    );
  });
}
```

### Deadline Propagation via Metadata

gRPC encodes the deadline as a `grpc-timeout` header (e.g., `100m` for 100 milliseconds). To propagate properly across service boundaries, use context propagation libraries or pass `call.deadline` explicitly.

```typescript
// Middleware that enforces deadline propagation
function deadlinePropagationInterceptor(
  options: grpc.InterceptorOptions,
  nextCall: (options: grpc.InterceptorOptions) => grpc.InterceptingCall
): grpc.InterceptingCall {
  return new grpc.InterceptingCall(nextCall(options), {
    start(metadata, listener, next) {
      // Get the remaining time from context (injected by incoming RPC handler)
      const remainingMs = AsyncLocalStorage.getStore()?.remainingDeadlineMs;
      if (remainingMs !== undefined && remainingMs < options.deadline) {
        // Tighten the deadline to match incoming request deadline
        options.deadline = new Date(Date.now() + remainingMs);
      }
      next(metadata, listener);
    },
  });
}
```

### Cancellation

When a client cancels an RPC (network drop, client timeout, explicit cancel), the server receives a `cancelled` event on the call object. Servers must check for and respect cancellation:

```typescript
async function longRunningOperation(call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) {
  let cancelled = false;
  call.on('cancelled', () => { cancelled = true; });

  for (const item of largeDataset) {
    if (cancelled) {
      // Don't call callback — client is gone
      return;
    }
    await processItem(item);
  }

  if (!cancelled) {
    callback(null, result);
  }
}
```

::: info War Story
**gRPC deadline propagation bug causing cascading timeouts**

A search service (A) called a ranking service (B) which called a features service (C). A's deadline was 2 seconds. B's client for C was configured with a static 5-second deadline.

Under load, C started getting slow (P99 = 3s). B's calls to C with 5-second deadlines succeeded, but they took 3s — leaving only 1s for B's processing and response to A. A's 2-second deadline expired, and it returned an error to its callers.

But the insidious part: B's calls to C were still in flight (B had given C 5 seconds). When A's request failed and A cancelled, the cancellation didn't propagate to B→C calls because B wasn't listening for cancellation from A. C processed requests that had already been cancelled, wasting resources.

The cascade: A got 100% errors. A's callers retried. B and C processed 3× the load (original + retries). C got slower due to load. All deadlines became more likely to trigger. System oscillated.

**Fix:** Every handler checks `call.on('cancelled')` and propagates cancellation. Every downstream call uses the incoming deadline, not a static one. After the fix, a C slowdown caused graceful degradation instead of a cascade.
:::

## gRPC Error Model

gRPC has 16 status codes (distinct from HTTP status codes):

| Code | Value | Meaning | When to Use |
|------|-------|---------|-------------|
| OK | 0 | Success | — |
| CANCELLED | 1 | Operation cancelled | Client cancelled or propagated cancel |
| UNKNOWN | 2 | Unknown error | Uncaught exceptions |
| INVALID_ARGUMENT | 3 | Bad request argument | Field validation failure |
| DEADLINE_EXCEEDED | 4 | Deadline expired | Timeout |
| NOT_FOUND | 5 | Resource not found | Missing entity |
| ALREADY_EXISTS | 6 | Conflict | Duplicate creation |
| PERMISSION_DENIED | 7 | No permission | Authorization failure |
| RESOURCE_EXHAUSTED | 8 | Quota exceeded | Rate limit, out of resources |
| FAILED_PRECONDITION | 9 | Precondition failed | Wrong state |
| ABORTED | 10 | Conflict (retryable) | Optimistic concurrency |
| OUT_OF_RANGE | 11 | Out of range | Iterator past end |
| UNIMPLEMENTED | 12 | Method not found | Missing handler |
| INTERNAL | 13 | Internal error | Bug |
| UNAVAILABLE | 14 | Service unavailable | Retry later |
| DATA_LOSS | 15 | Data corruption | Critical failure |
| UNAUTHENTICATED | 16 | Not authenticated | Missing credentials |

**Rich error details:** gRPC supports attaching structured error details via `google.rpc.Status` and well-known types (`google.rpc.BadRequest`, `google.rpc.RetryInfo`, etc.):

```typescript
import { Status } from '@grpc/grpc-js/build/src/generated/google/rpc/Status';

// Return a validation error with field-level detail
callback({
  code: grpc.status.INVALID_ARGUMENT,
  message: 'Validation failed',
  metadata: (() => {
    const m = new grpc.Metadata();
    // Encode google.rpc.BadRequest as base64 in grpc-status-details-bin
    const badRequest = BadRequest.encode({
      fieldViolations: [
        { field: 'email', description: 'Must be a valid email address' },
        { field: 'name', description: 'Must be 1-100 characters' },
      ],
    }).finish();
    m.set('grpc-status-details-bin', Buffer.from(badRequest).toString('base64'));
    return m;
  })(),
});
```

## Load Balancing gRPC

### Why L7 Load Balancing is Required

gRPC uses HTTP/2, which maintains persistent connections. An L4 load balancer (like AWS Classic LB or a TCP proxy) distributes TCP connections — once a connection is established, all gRPC requests on that connection go to the same backend. This is fine for HTTP/1.1 (short-lived connections) but breaks gRPC (long-lived connections).

**Result:** one backend gets 100% of the gRPC traffic from one client, while others sit idle.

The fix: **L7 (application-layer) load balancing** that understands HTTP/2 and can distribute at the stream level, not the connection level.

### Options for gRPC Load Balancing

**1. Client-side load balancing (DNS):**
```typescript
// gRPC resolves the DNS name and maintains connections to all endpoints
const client = new UserServiceClient(
  'dns:///user-service.default.svc.cluster.local:50051',
  credentials
);
// gRPC's built-in round_robin policy distributes across discovered IPs
```

**2. Server-side via Envoy/Istio:**
Envoy understands HTTP/2 and distributes at the stream level. This is the standard approach in Kubernetes with a service mesh.

**3. xDS (extended Discovery Service):**
Google's xDS API (used by Envoy) provides dynamic configuration of load balancing policies, health checking, and routing rules. gRPC clients can act as xDS clients, receiving dynamic configuration from a control plane.

```typescript
// xDS client-side load balancing
const client = new UserServiceClient(
  'xds:///user-service',  // xDS name, resolved by gRPC xDS resolver
  credentials,
  { 'grpc.service_config': JSON.stringify({
      loadBalancingConfig: [{ 'round_robin': {} }],
    }) }
);
```

## gRPC Health Checking Protocol

The [gRPC Health Checking Protocol](https://github.com/grpc/grpc/blob/master/doc/health-checking.md) defines a standard service for reporting health:

```protobuf
service Health {
  rpc Check(HealthCheckRequest) returns (HealthCheckResponse);
  rpc Watch(HealthCheckRequest) returns (stream HealthCheckResponse);
}

enum ServingStatus {
  UNKNOWN = 0;
  SERVING = 1;
  NOT_SERVING = 2;
  SERVICE_UNKNOWN = 3;
}
```

```typescript
import { HealthImplementation } from 'grpc-health-check';

// Register health check for each service
const healthImpl = new HealthImplementation({
  '': proto.grpc.health.v1.HealthCheckResponse.ServingStatus.SERVING,
  'userservice.v1.UserService': proto.grpc.health.v1.HealthCheckResponse.ServingStatus.SERVING,
});

healthImpl.addToServer(server);

// Update status when service degrades (e.g., DB connection lost)
db.on('disconnect', () => {
  healthImpl.setStatus(
    'userservice.v1.UserService',
    proto.grpc.health.v1.HealthCheckResponse.ServingStatus.NOT_SERVING
  );
});
```

## Performance: Protobuf vs JSON

| Metric | JSON | Protobuf | Ratio |
|--------|------|----------|-------|
| Encoding speed | ~500 MB/s | ~2,000 MB/s | 4× faster |
| Decoding speed | ~300 MB/s | ~1,500 MB/s | 5× faster |
| Payload size (typical API) | 100% | 20–30% | 3–5× smaller |
| Compression (gzip) JSON | 100% → 30% | — | — |
| Compression (gzip) protobuf | — | 20% → 15% | Better baseline |
| Human readable | Yes | No | — |
| Schema required | No | Yes | — |

In practice, gRPC over HTTP/2 with protobuf achieves **5–10× higher throughput** and **2–5× lower latency** than REST over HTTP/1.1 with JSON for typical microservice workloads.

## Debugging gRPC: grpcurl and Evans

```bash
# List services (requires server reflection enabled)
grpcurl -plaintext localhost:50051 list

# Describe a service
grpcurl -plaintext localhost:50051 describe userservice.v1.UserService

# Call a unary RPC
grpcurl -plaintext -d '{"id": "123"}' localhost:50051 userservice.v1.UserService/GetUser

# Call with metadata (auth token)
grpcurl -plaintext \
  -H 'authorization: Bearer eyJhbGc...' \
  -d '{"id": "123"}' \
  localhost:50051 userservice.v1.UserService/GetUser

# Server streaming RPC
grpcurl -plaintext -d '{"page_size": 10}' localhost:50051 userservice.v1.UserService/ListUsersStream

# Evans: interactive gRPC client (better for development)
evans --host localhost --port 50051 --reflection repl
> service UserService
> call GetUser
id (TYPE_UINT64) => 123
{
  "id": "123",
  "email": "user@example.com",
  "name": "Test User"
}
```

Enable server reflection (development only — disables in production):

```typescript
import { ServerReflection } from 'grpc-reflection-js';

ServerReflection.addToServer(server, [packageDefinition]);
```

---

**Next:** [WebSockets](./websockets) — persistent bidirectional connections for real-time applications, and how to scale them.
