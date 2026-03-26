---
title: "System Design Glossary"
description: "A comprehensive glossary of 150 system design terms — from sharding and replication to quorum, consistent hashing, circuit breaker, saga, CQRS, and event sourcing, each with a clear 1-2 sentence definition and links to deep dives."
tags: [system-design, glossary, terminology, reference, fundamentals]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-25"
---

# System Design Glossary

This glossary contains 150 terms you will encounter when studying system design. Each term has a concise definition and a link to the relevant deep-dive page in this knowledge base. Bookmark this page — you will come back to it often.

Terms are organized by category, then alphabetically within each category.

## Networking & Protocols

**Anycast**: A routing technique where the same IP address is announced from multiple locations worldwide. Traffic is routed to the nearest location. Used by CDNs and DNS providers for low-latency global distribution.

**Bandwidth**: The maximum amount of data that can be transmitted over a network connection per unit of time. Measured in bits per second (bps). Not the same as throughput (actual data transferred). See [How the Internet Works](/system-design/fundamentals/how-the-internet-works).

**DNS (Domain Name System)**: The distributed system that translates human-readable domain names (like google.com) into IP addresses (like 142.250.80.4). See [DNS Deep Dive](/system-design/networking/dns-deep-dive).

**gRPC**: A high-performance Remote Procedure Call framework built on HTTP/2 and Protocol Buffers. Supports bidirectional streaming and is significantly more efficient than REST/JSON for service-to-service communication. See [gRPC Internals](/system-design/networking/grpc-internals).

**HTTP (HyperText Transfer Protocol)**: The application-layer protocol used by web browsers and APIs to communicate with servers. Follows a request-response model. See [HTTP/2 & HTTP/3](/system-design/networking/http2-http3).

**HTTP/2**: An evolution of HTTP/1.1 that adds multiplexing (multiple requests over one connection), header compression, and server push. Significantly faster for web pages. See [HTTP/2 & HTTP/3](/system-design/networking/http2-http3).

**HTTP/3**: The latest version of HTTP, built on QUIC (UDP-based). Eliminates TCP head-of-line blocking and provides faster connection establishment. See [QUIC Protocol](/system-design/networking/quic-protocol).

**IP Address**: A unique numerical identifier assigned to every device on a network. IPv4 uses 32-bit addresses (like 192.168.1.1), IPv6 uses 128-bit addresses. See [How the Internet Works](/system-design/fundamentals/how-the-internet-works).

**Latency**: The time delay between initiating a request and receiving the first byte of the response. Measured in milliseconds. See [System Design Characteristics](/system-design/fundamentals/characteristics).

**Long Polling**: A technique where the client sends a request to the server, and the server holds the connection open until it has new data to send. Simulates server push over HTTP. See [Event-Driven APIs](/system-design/api-design/event-driven-apis).

**Protocol Buffers (Protobuf)**: A binary serialization format created by Google. Smaller and faster than JSON. Used by gRPC. Requires a schema definition (.proto file).

**QUIC**: A transport protocol built on UDP that combines transport and encryption handshakes for faster connection establishment. The foundation of HTTP/3. See [QUIC Protocol](/system-design/networking/quic-protocol).

**REST (Representational State Transfer)**: An architectural style for designing HTTP APIs using standard methods (GET, POST, PUT, DELETE) and resource-oriented URLs. See [REST Best Practices](/system-design/api-design/rest-best-practices).

**Round-Trip Time (RTT)**: The time it takes for a packet to travel from the sender to the receiver and back. US coast-to-coast is roughly 40ms. US to Europe is roughly 80-100ms.

**Server-Sent Events (SSE)**: A protocol allowing the server to push events to the client over a single HTTP connection. One-way only (server to client). See [Event-Driven APIs](/system-design/api-design/event-driven-apis).

**TCP (Transmission Control Protocol)**: A transport-layer protocol that guarantees reliable, ordered delivery of data. Uses a three-way handshake to establish connections. See [TCP/IP Deep Dive](/system-design/networking/tcp-ip-deep-dive).

**TLS (Transport Layer Security)**: A cryptographic protocol that encrypts data in transit between a client and server. HTTPS is HTTP over TLS. See [TLS Handshake](/system-design/networking/tls-handshake).

**UDP (User Datagram Protocol)**: A transport-layer protocol that sends data without guarantees of delivery, ordering, or integrity. Faster than TCP, used for video streaming, gaming, and DNS.

**WebRTC**: A protocol for real-time peer-to-peer audio, video, and data communication directly between browsers without a server intermediary. See [WebRTC](/system-design/networking/webrtc).

**WebSocket**: A protocol providing full-duplex (bidirectional) communication over a single TCP connection. Used for real-time applications like chat, gaming, and live updates. See [WebSockets](/system-design/networking/websockets).

## Databases & Storage

**ACID**: The four properties that guarantee reliable database transactions: Atomicity (all or nothing), Consistency (data satisfies constraints), Isolation (concurrent transactions do not interfere), Durability (committed data survives crashes). See [Isolation Levels](/system-design/databases/isolation-levels).

**B-Tree**: The most common index structure in databases. A self-balancing tree that keeps data sorted and allows searches, insertions, and deletions in O(log n) time. See [Indexing Deep Dive](/system-design/databases/indexing-deep-dive).

**BASE**: An alternative to ACID for distributed systems: Basically Available, Soft state, Eventually consistent. Used by many NoSQL databases. See [SQL vs NoSQL Decision Guide](/system-design/fundamentals/sql-vs-nosql).

**Blob Storage**: Storage optimized for large binary objects (images, videos, files). Examples: AWS S3, Google Cloud Storage. See [Building Blocks Overview](/system-design/fundamentals/building-blocks).

**Columnar Storage**: A storage format that stores data by column rather than by row. Extremely efficient for analytical queries that read few columns but many rows. See [ClickHouse Internals](/system-design/databases/clickhouse-internals).

**Connection Pooling**: Maintaining a pool of reusable database connections rather than creating a new connection for each query. Reduces connection overhead from ~50ms per connection to near zero. See [Connection Pooling](/system-design/databases/connection-pooling).

**Denormalization**: Intentionally adding redundant data to a database to avoid expensive joins and improve read performance. The trade-off is increased write complexity and storage.

**Document Database**: A NoSQL database that stores data as flexible, schema-less documents (usually JSON). Examples: MongoDB, Couchbase. See [MongoDB Internals](/system-design/databases/mongodb-internals).

**Graph Database**: A database optimized for storing and querying relationships between entities. Data is modeled as nodes and edges. Examples: Neo4j, Neptune. See [Graph Databases](/system-design/databases/graph-databases).

**Index**: A data structure that improves the speed of data retrieval operations at the cost of additional storage and slower writes. Like an index in the back of a textbook. See [Indexing Deep Dive](/system-design/databases/indexing-deep-dive).

**Isolation Level**: The degree to which concurrent database transactions are isolated from each other. From weakest to strongest: Read Uncommitted, Read Committed, Repeatable Read, Serializable. See [Isolation Levels](/system-design/databases/isolation-levels).

**Key-Value Store**: The simplest type of NoSQL database — stores values by key, like a dictionary/hash map. Examples: Redis, DynamoDB, etcd. See [Redis Internals](/system-design/databases/redis-internals).

**LSM Tree (Log-Structured Merge Tree)**: A data structure optimized for high write throughput. Writes go to memory first, then are periodically flushed and merged to disk. Used by Cassandra, RocksDB, LevelDB. See [Storage Engines](/system-design/databases/storage-engines).

**Materialized View**: A precomputed query result stored as a table. Updated periodically or on-demand. Trades storage and write cost for faster read queries.

**MVCC (Multi-Version Concurrency Control)**: A concurrency control method where each transaction sees a snapshot of the data at a point in time. Allows readers and writers to not block each other. Used by PostgreSQL, MySQL InnoDB. See [MVCC](/system-design/databases/mvcc).

**NewSQL**: Databases that provide the scalability of NoSQL while maintaining the ACID guarantees of SQL. Examples: CockroachDB, Google Spanner, TiDB, YugabyteDB. See [NewSQL](/system-design/databases/newsql).

**Normalization**: Organizing database tables to minimize redundancy and dependency. Higher normal forms reduce redundancy but increase the need for joins.

**ORM (Object-Relational Mapping)**: A technique that maps database rows to objects in your programming language. Examples: Prisma, Sequelize, SQLAlchemy, Hibernate.

**Query Optimizer**: The database component that decides the most efficient way to execute a query (which indexes to use, join order, scan strategy). See [Query Planning & Optimization](/system-design/databases/query-planning-optimization).

**Read Replica**: A copy of a database that handles read queries, reducing load on the primary. Writes still go to the primary. See [Replication](/system-design/databases/replication).

**Sharding**: Splitting a database into multiple independent pieces (shards), each holding a subset of the data. Scales write throughput and storage capacity. See [Sharding](/system-design/databases/sharding).

**Time-Series Database**: A database optimized for timestamped data (metrics, sensor readings, events). Examples: InfluxDB, TimescaleDB, Prometheus. See [Time-Series Databases](/system-design/databases/time-series-databases).

**WAL (Write-Ahead Log)**: A technique where changes are written to a log before being applied to the database. Ensures durability even if the server crashes mid-operation. See [Write-Ahead Logging](/system-design/databases/write-ahead-logging).

**Wide-Column Store**: A NoSQL database that stores data in columns grouped by column family. Optimized for large-scale, distributed writes. Examples: Cassandra, HBase, Bigtable. See [Cassandra Internals](/system-design/databases/cassandra-internals).

## Distributed Systems

**Byzantine Fault Tolerance (BFT)**: The ability of a system to function correctly even when some nodes behave maliciously or unpredictably (not just crash). See [Byzantine Fault Tolerance](/system-design/distributed-systems/byzantine-fault-tolerance).

**CAP Theorem**: A proven theorem stating that a distributed data store can only provide two out of three guarantees simultaneously: Consistency, Availability, and Partition tolerance. See [CAP Theorem](/system-design/distributed-systems/cap-theorem).

**Consistent Hashing**: A hashing technique that minimizes key remapping when nodes are added or removed. When a node is added, only K/N keys are remapped (versus all keys with modulo hashing). See [Consistent Hashing](/system-design/distributed-systems/consistent-hashing).

**Clock Synchronization**: The problem of keeping clocks accurate across distributed machines. Network delays make perfect synchronization impossible. NTP provides ~1-10ms accuracy. See [Clock Synchronization](/system-design/distributed-systems/clock-synchronization).

**Consensus**: The problem of getting multiple distributed nodes to agree on a single value, even when some nodes may fail. Solved by algorithms like Raft and Paxos. See [Consensus](/system-design/consensus).

**CRDT (Conflict-free Replicated Data Type)**: A data structure that can be independently updated on multiple nodes and automatically merged without conflicts. Used for eventual consistency. See [CRDT Fundamentals](/system-design/distributed-systems/crdt-fundamentals).

**Distributed Lock**: A lock that works across multiple machines, ensuring only one process can access a resource at a time. Often implemented with Redis (Redlock) or ZooKeeper. See [Distributed Locking](/system-design/distributed-systems/distributed-locking).

**Distributed Snapshot**: A consistent snapshot of the global state of a distributed system, captured without stopping the system. Based on the Chandy-Lamport algorithm. See [Distributed Snapshots](/system-design/distributed-systems/distributed-snapshots).

**Eventual Consistency**: A consistency model where, if no new updates are made, all replicas will eventually converge to the same value. The time to converge is typically milliseconds to seconds. See [Consistency Models](/system-design/distributed-systems/consistency-models).

**Failure Detector**: A component that monitors whether other nodes in a distributed system are alive or dead. Uses heartbeats, timeouts, and sometimes gossip protocols. See [Failure Detectors](/system-design/distributed-systems/failure-detectors).

**Gossip Protocol**: A communication protocol where nodes periodically exchange state information with random peers. Used for failure detection, membership, and data dissemination. See [Gossip Protocols](/system-design/distributed-systems/gossip-protocols).

**Idempotency**: The property of an operation such that performing it multiple times produces the same result as performing it once. Critical for safely retrying failed requests. Example: charging a credit card should be idempotent.

**Lamport Timestamp**: A logical clock that assigns a monotonically increasing number to events, ensuring a partial ordering of events across distributed nodes. See [Vector Clocks & Lamport Timestamps](/system-design/distributed-systems/vector-clocks-lamport-timestamps).

**Leader Election**: The process by which distributed nodes select one node to be the leader (primary). The leader coordinates operations. If the leader fails, a new one is elected. See [Leader Election](/system-design/consensus/leader-election).

**Linearizability**: The strongest form of consistency. The system behaves as if there is a single copy of the data, and all operations happen atomically and in real-time order. This is the "C" in CAP.

**PACELC**: An extension of CAP: if there is a Partition, trade off Availability vs Consistency; Else (normal operation), trade off Latency vs Consistency. More practical than CAP alone.

**Partition (Network)**: A network failure that prevents some nodes from communicating with others. The system is split into two or more groups that cannot coordinate. See [CAP Theorem](/system-design/distributed-systems/cap-theorem).

**Paxos**: One of the original consensus algorithms, proven correct by Leslie Lamport. Notoriously difficult to understand and implement. See [Paxos Made Simple](/system-design/consensus/paxos-made-simple).

**Quorum**: The minimum number of nodes that must agree for an operation to succeed. Typically a majority (more than half). Ensures overlapping sets of nodes participate in reads and writes.

**Raft**: A consensus algorithm designed to be more understandable than Paxos. Used by etcd, CockroachDB, and TiKV. See [Raft Full Walkthrough](/system-design/consensus/raft-full-walkthrough).

**Replication Lag**: The delay between a write to the primary database and that write becoming visible on a replica. Can range from milliseconds (same data center) to seconds (under load). See [Replication](/system-design/databases/replication).

**Split-Brain**: A failure scenario where both nodes in a replicated system believe they are the primary and independently accept writes, leading to data divergence. See [Redundancy & Replication](/system-design/fundamentals/redundancy-replication).

**Vector Clock**: A mechanism for tracking causality between events in a distributed system. Each node maintains a vector of counters, one per node. See [Vector Clocks & Lamport Timestamps](/system-design/distributed-systems/vector-clocks-lamport-timestamps).

## Architecture Patterns

**Backpressure**: A flow control mechanism where a component signals upstream that it is overwhelmed and cannot process more data. Prevents cascade failures. See [Backpressure Patterns](/system-design/message-queues/backpressure-patterns).

**Blue-Green Deployment**: A deployment strategy with two identical production environments (Blue and Green). You deploy to the inactive one, test it, then switch traffic. Enables zero-downtime deployments.

**Canary Deployment**: A deployment strategy where you route a small percentage of traffic (1-5%) to the new version while monitoring for errors. If it looks good, you gradually increase.

**Circuit Breaker**: A pattern that stops calling a failing service to prevent cascade failures. Like an electrical circuit breaker — when failures exceed a threshold, the circuit "opens" and requests fail fast without calling the service. See [Circuit Breaker](/system-design/distributed-systems/circuit-breaker).

**CQRS (Command Query Responsibility Segregation)**: A pattern that uses separate models for reading and writing data. The write model is optimized for writes, the read model is optimized for queries. Often combined with event sourcing.

**Event Sourcing**: A pattern where state changes are stored as a sequence of immutable events rather than as the current state. The current state is derived by replaying events. Provides a complete audit trail.

**Event-Driven Architecture**: An architecture where components communicate by producing and consuming events through a message broker (like Kafka). Promotes loose coupling. See [Event-Driven APIs](/system-design/api-design/event-driven-apis).

**Fanout**: The pattern of distributing a message or event to multiple recipients. "Fanout on write" means distributing at write time (precomputation). "Fanout on read" means computing at read time.

**Gateway Pattern**: A single entry point that routes requests to appropriate backend services. Handles cross-cutting concerns like authentication and rate limiting. See [API Gateway Pattern](/architecture-patterns/microservices/api-gateway-pattern).

**Microservices**: An architectural style where an application is composed of small, independent services that communicate over the network. Each service is owned by a small team and can be deployed independently. See [Microservices](/architecture-patterns/microservices/).

**Monolith**: An architectural style where the entire application is a single deployable unit. Simpler than microservices, but harder to scale independently. See [Client-Server Architecture](/system-design/fundamentals/client-server).

**Saga**: A pattern for managing distributed transactions across microservices. Instead of a single ACID transaction, a saga is a sequence of local transactions with compensating actions for rollback. See [Distributed Transactions](/system-design/distributed-systems/distributed-transactions).

**Service Mesh**: An infrastructure layer that handles service-to-service communication, including load balancing, encryption, authentication, and observability. Implemented as sidecar proxies. See [Service Mesh](/architecture-patterns/microservices/service-mesh).

**Sidecar Pattern**: A pattern where a helper process runs alongside the main application container, handling networking, logging, or security. Used in service meshes (Envoy as sidecar).

**Strangler Fig Pattern**: A migration strategy where you gradually replace parts of an old system with a new system. New functionality goes to the new system while old code is slowly migrated. See [Migration from Monolith](/architecture-patterns/microservices/migration-from-monolith).

## Caching

**Cache-Aside (Lazy Loading)**: The application checks the cache first. On a miss, it fetches from the database, stores in the cache, and returns. The most common caching pattern. See [Caching Strategies](/system-design/caching/caching-strategies).

**Cache Hit / Miss**: A cache hit is when the requested data is found in the cache. A cache miss is when it is not, requiring a database query. Cache hit rate is the percentage of requests served from cache.

**Cache Invalidation**: The process of removing or updating stale cache entries. The hardest problem in caching — "There are only two hard things in computer science: cache invalidation and naming things." See [Cache Invalidation](/system-design/caching/cache-invalidation).

**CDN (Content Delivery Network)**: A globally distributed network of servers that caches and serves content from the location closest to the user. See [CDN Deep Dive](/system-design/caching/cdn-deep-dive).

**Read-Through Cache**: A cache that automatically loads data from the database on a miss. The application only ever reads from the cache. See [Caching Strategies](/system-design/caching/caching-strategies).

**Thundering Herd**: A problem where many requests simultaneously hit the database when a popular cache key expires. Solved by locking, probabilistic early expiration, or cache warming. See [Thundering Herd](/system-design/caching/thundering-herd).

**TTL (Time to Live)**: The duration a cached item is considered valid. After the TTL expires, the item must be refreshed from the source.

**Write-Behind (Write-Back)**: A caching pattern where writes go to the cache first, and the cache asynchronously writes to the database later. Fast writes, but risk of data loss. See [Caching Strategies](/system-design/caching/caching-strategies).

**Write-Through**: A caching pattern where writes go to both the cache and the database simultaneously. Consistent but slower writes. See [Caching Strategies](/system-design/caching/caching-strategies).

## Load Balancing & Proxying

**Forward Proxy**: A proxy that sits in front of clients and forwards their requests to servers. The server does not know the client's identity. Example: VPN, corporate proxy. See [Proxies](/system-design/fundamentals/proxies).

**Health Check**: A periodic request sent to a server to determine if it is healthy and able to serve traffic. If health checks fail, the load balancer stops sending traffic. See [Health Checks](/system-design/load-balancing/health-checks).

**L4 Load Balancing**: Load balancing at the transport layer (TCP/UDP). Routes based on IP address and port. Faster but less intelligent than L7. See [L4 vs L7](/system-design/load-balancing/l4-vs-l7).

**L7 Load Balancing**: Load balancing at the application layer (HTTP). Can route based on URL path, headers, cookies. More intelligent but slightly slower. See [L4 vs L7](/system-design/load-balancing/l4-vs-l7).

**Least Connections**: A load balancing algorithm that sends new requests to the server with the fewest active connections. Better than round-robin when requests have varying processing times. See [Load Balancing Algorithms](/system-design/load-balancing/algorithms).

**Reverse Proxy**: A proxy that sits in front of servers and handles incoming client requests. The client does not know about the backend servers. Example: Nginx, CDN. See [Proxies](/system-design/fundamentals/proxies).

**Round Robin**: The simplest load balancing algorithm — requests are distributed to servers sequentially (1, 2, 3, 1, 2, 3...). See [Load Balancing Algorithms](/system-design/load-balancing/algorithms).

**Session Affinity (Sticky Sessions)**: Routing all requests from the same client to the same server. Necessary for stateful servers but prevents true load balancing. See [Session Affinity](/system-design/load-balancing/session-affinity).

**TLS Termination**: Decrypting HTTPS traffic at the proxy/load balancer and forwarding plain HTTP to backend servers. Reduces CPU load on application servers. See [Proxies](/system-design/fundamentals/proxies).

**Weighted Round Robin**: A load balancing variant where servers are assigned weights proportional to their capacity. A server with weight 3 gets 3x more requests than one with weight 1. See [Load Balancing Algorithms](/system-design/load-balancing/algorithms).

## Message Queues & Streaming

**At-Least-Once Delivery**: A guarantee that every message will be delivered to the consumer at least once. Messages may be delivered more than once (duplicates possible). Requires idempotent consumers.

**At-Most-Once Delivery**: A guarantee that every message will be delivered at most once. Messages may be lost but never duplicated. The weakest delivery guarantee.

**Backpressure**: See Architecture Patterns section above.

**Consumer Group**: A group of consumers that share the work of consuming messages from a topic. Each message is delivered to exactly one consumer in the group. Used in Kafka and SQS.

**Dead Letter Queue (DLQ)**: A separate queue where messages that cannot be processed (after multiple retries) are sent for later investigation. See [Dead Letter Queues](/system-design/message-queues/dead-letter-queues).

**Exactly-Once Semantics**: A guarantee that every message is processed exactly once, even in the presence of failures. Extremely difficult to achieve in distributed systems. See [Exactly-Once Semantics](/system-design/message-queues/exactly-once-semantics).

**Event Streaming**: A pattern where events are published to a persistent, ordered log (like Kafka) and can be consumed by multiple consumers independently. See [Kafka Internals](/system-design/message-queues/kafka-internals).

**Message Broker**: An intermediary that routes messages from producers to consumers. Examples: RabbitMQ, Kafka, SQS, Redis Streams. See [Queue Selection Guide](/system-design/message-queues/queue-selection-guide).

**Ordering Guarantee**: The guarantee that messages are delivered to consumers in the order they were produced. Kafka provides ordering within a partition. See [Ordering Guarantees](/system-design/message-queues/ordering-guarantees).

**Partition (Kafka)**: A Kafka topic is divided into partitions. Each partition is an ordered, immutable log. Partitions enable parallel consumption and are the unit of scaling. See [Kafka Internals](/system-design/message-queues/kafka-internals).

**Pub/Sub (Publish-Subscribe)**: A messaging pattern where publishers send messages to topics, and subscribers receive messages from topics they are subscribed to. Decouples senders from receivers.

**Topic**: A named channel in a message broker where messages are published. Consumers subscribe to topics to receive messages.

## Scaling & Performance

**Auto-Scaling**: Automatically adding or removing servers based on current load (CPU, memory, request count). Scales up during traffic spikes and down during quiet periods to save cost.

**Bloom Filter**: A probabilistic data structure that can quickly test whether an element is a member of a set. May produce false positives but never false negatives. Very memory-efficient. See [Bloom Filters](/system-design/distributed-systems/bloom-filters).

**Capacity Planning**: The process of estimating the resources (servers, storage, bandwidth) needed to support a given workload. See [Estimation Practice](/system-design/fundamentals/estimation-practice).

**Connection Pool**: A cache of reusable network connections (to a database, API, etc.) that avoids the overhead of creating new connections for each request. See [Connection Pooling](/system-design/databases/connection-pooling).

**Horizontal Scaling (Scale Out)**: Adding more machines of the same size to handle more load. See [Scaling Fundamentals](/system-design/fundamentals/scaling-fundamentals).

**Hot Spot**: A disproportionately loaded node or partition. Often caused by a bad shard key or a popular entity (celebrity on social media). See [Sharding](/system-design/databases/sharding).

**p50 / p95 / p99**: Percentile latency metrics. p50 is the median (50% of requests are faster). p99 means 99% of requests are faster. See [System Design Characteristics](/system-design/fundamentals/characteristics).

**QPS (Queries Per Second)**: The number of queries a system handles per second. Used to measure database or API throughput.

**Rate Limiting**: Restricting the number of requests a client can make in a given time window. Protects against abuse and ensures fair resource allocation. See [Rate Limiting](/system-design/distributed-systems/rate-limiting).

**Shared-Nothing Architecture**: An architecture where each node is completely independent — no shared disk, memory, or CPU. Scales linearly. See [Scaling Fundamentals](/system-design/fundamentals/scaling-fundamentals).

**Stateless Service**: A service that does not store any client state between requests. Every request contains all necessary information. Enables easy horizontal scaling. See [Scaling Fundamentals](/system-design/fundamentals/scaling-fundamentals).

**Throughput**: The amount of work a system can handle per unit of time. Measured in requests per second, messages per second, or bytes per second. See [System Design Characteristics](/system-design/fundamentals/characteristics).

**Vertical Scaling (Scale Up)**: Upgrading to a more powerful machine (more CPU, RAM, storage). Simpler but has an upper limit. See [Scaling Fundamentals](/system-design/fundamentals/scaling-fundamentals).

## Reliability & Availability

**Active-Active**: A redundancy pattern where all nodes actively handle traffic. If one fails, the others continue without interruption. See [Redundancy & Replication](/system-design/fundamentals/redundancy-replication).

**Active-Passive**: A redundancy pattern where one node handles traffic (active) while another waits as a backup (passive). On failure, the passive is promoted. See [Redundancy & Replication](/system-design/fundamentals/redundancy-replication).

**Availability**: The percentage of time a system is operational. Usually expressed as "nines" — 99.99% means 52.6 minutes of downtime per year. See [System Design Characteristics](/system-design/fundamentals/characteristics).

**Chaos Engineering**: The practice of intentionally injecting failures into production systems to test resilience. Pioneered by Netflix (Chaos Monkey).

**Durability**: The guarantee that once data is written, it survives failures. AWS S3 offers 99.999999999% (11 nines) durability. See [System Design Characteristics](/system-design/fundamentals/characteristics).

**Failover**: The process of switching from a failed component to a backup. Can be automatic or manual. See [Redundancy & Replication](/system-design/fundamentals/redundancy-replication).

**Fencing**: Preventing a failed or partitioned node from continuing to act as primary. Often implemented by forcibly shutting down the old primary (STONITH). See [Redundancy & Replication](/system-design/fundamentals/redundancy-replication).

**Graceful Degradation**: Designing a system so that when some components fail, the system continues to function with reduced capability rather than failing completely.

**MTBF (Mean Time Between Failures)**: The average time a system operates between failures. Higher is better. See [System Design Characteristics](/system-design/fundamentals/characteristics).

**MTTR (Mean Time To Recovery)**: The average time to restore a system after a failure. Lower is better. See [System Design Characteristics](/system-design/fundamentals/characteristics).

**Redundancy**: Having duplicate components so the system can survive individual failures. See [Redundancy & Replication](/system-design/fundamentals/redundancy-replication).

**Resilience**: The ability of a system to withstand and recover from failures without user-visible impact.

**SLA (Service Level Agreement)**: A formal agreement defining the expected availability, latency, and performance of a service. Usually includes penalties for violations.

**SLI (Service Level Indicator)**: A measured metric that indicates service health (e.g., p99 latency, error rate). SLIs are what you measure to determine if you are meeting your SLO.

**SLO (Service Level Objective)**: An internal target for service performance (e.g., "99.9% of requests complete in under 200ms"). Stricter than the external SLA.

## Security

**API Key**: A secret token used to authenticate API requests. Simpler than OAuth but less secure (no expiration, no scoping). See [API Security Patterns](/system-design/api-design/api-security-patterns).

**Authentication (AuthN)**: Verifying who the user is. "Are you who you claim to be?" Methods include passwords, tokens (JWT), and certificates.

**Authorization (AuthZ)**: Determining what an authenticated user is allowed to do. "Do you have permission to perform this action?"

**JWT (JSON Web Token)**: A compact, self-contained token that encodes user identity and permissions. Signed by the server so it cannot be tampered with. See [API Security Patterns](/system-design/api-design/api-security-patterns).

**mTLS (Mutual TLS)**: A variant of TLS where both the client and server present certificates and authenticate each other. Used in service-to-service communication. See [Service Mesh](/architecture-patterns/microservices/service-mesh).

**OAuth 2.0**: An authorization framework that allows third-party applications to access user resources without exposing credentials. Used by "Login with Google/GitHub" flows.

**Rate Limiting**: See Scaling & Performance section above.

**WAF (Web Application Firewall)**: A security layer that filters, monitors, and blocks malicious HTTP traffic. Protects against SQL injection, XSS, and other attacks. See [API Security Patterns](/system-design/api-design/api-security-patterns).

## Observability

**Alert**: An automated notification triggered when a metric exceeds a defined threshold. "CPU > 90% for 5 minutes" → page the on-call engineer.

**Dashboard**: A visual display of key metrics (latency, error rate, throughput, resource utilization) for monitoring system health.

**Distributed Tracing**: Tracking a request as it flows through multiple services, providing a timeline of every service call. Used to identify latency bottlenecks. See [Observability Tools](/devops/observability-tools).

**Log Aggregation**: Collecting logs from all services into a centralized system for searching and analysis. See [Logging](/devops/logging).

**Metric**: A numerical measurement recorded over time (CPU usage, request latency, error count). See [Custom Metrics](/devops/monitoring/custom-metrics).

**Span**: A single unit of work in a distributed trace, representing one service call. A trace is composed of multiple spans.

**Trace**: The end-to-end path of a request through a distributed system, composed of spans from each service it touches.

## API Design

**API Gateway**: See Architecture Patterns section above.

**API Versioning**: Strategies for evolving an API without breaking existing clients. Common approaches: URL versioning (/v1/users), header versioning, query parameter versioning. See [API Versioning](/system-design/api-design/api-versioning).

**GraphQL**: A query language for APIs where the client specifies exactly what data it needs. Avoids over-fetching and under-fetching. See [GraphQL Advanced](/system-design/api-design/graphql-advanced).

**OpenAPI / Swagger**: A specification for describing REST APIs in a machine-readable format. Used to generate documentation, client SDKs, and mock servers. See [OpenAPI & Swagger](/system-design/api-design/openapi-swagger).

**Pagination**: Returning large result sets in smaller chunks (pages). Common patterns: offset-based, cursor-based, keyset-based. See [Pagination Patterns](/system-design/api-design/pagination-patterns).

**Webhook**: A user-defined HTTP callback. When an event occurs, the server sends an HTTP POST to a URL the client registered. See [Webhooks](/system-design/api-design/webhooks).

## What to Learn Next

- **[Building Blocks Overview](/system-design/fundamentals/building-blocks)** — See how these terms map to actual components
- **[Zero to Million Users](/system-design/fundamentals/zero-to-million-users)** — Watch these concepts applied at every scale
- **[How to Read Architecture Diagrams](/system-design/fundamentals/how-to-read-architecture)** — Understand diagrams that use these terms
- **[Estimation Practice](/system-design/fundamentals/estimation-practice)** — Practice calculating the numbers behind these concepts
