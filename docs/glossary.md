---
title: Glossary
description: Comprehensive glossary of engineering terms used throughout the Knowledge Vault
---

# Glossary

A comprehensive reference of engineering terms, acronyms, and concepts used throughout the Knowledge Vault. Each entry links to the relevant deep-dive page where the concept is explored in full.

## A

**ACL (Access Control List)**
A list of permissions attached to an object specifying which users or system processes can access the object and what operations they can perform. → [Broken Access Control](/security/owasp/a01-broken-access-control)

**ACID (Atomicity, Consistency, Isolation, Durability)**
A set of properties that guarantee database transactions are processed reliably. Atomicity ensures all-or-nothing execution, Consistency ensures valid state transitions, Isolation ensures concurrent transactions don't interfere, Durability ensures committed data persists. → [Isolation Levels](/system-design/databases/isolation-levels)

**Aggregate**
In Domain-Driven Design, a cluster of domain objects that are treated as a single unit for data changes. The aggregate root is the entry point and guarantees consistency within the boundary. → [Aggregate Design](/architecture-patterns/cqrs-event-sourcing/aggregate-design)

**API Gateway**
A server that acts as the single entry point for a set of microservices, handling request routing, composition, rate limiting, authentication, and protocol translation. → [API Gateway Pattern](/architecture-patterns/microservices/api-gateway-pattern)

## B

**Backpressure**
A flow-control mechanism where a downstream system signals to an upstream producer to slow down when it cannot keep up with the rate of incoming data. Critical in stream processing and message queue architectures. → [Backpressure Patterns](/system-design/message-queues/backpressure-patterns)

**BFT (Byzantine Fault Tolerance)**
The ability of a distributed system to reach consensus even when some nodes may behave maliciously or arbitrarily. Named after the Byzantine Generals Problem. → [Byzantine Fault Tolerance](/system-design/distributed-systems/byzantine-fault-tolerance)

**Blue-Green Deployment**
A deployment strategy that maintains two identical production environments (blue and green), routing traffic to one while deploying to the other, enabling zero-downtime releases and instant rollback. → [Blue-Green](/devops/deployment-strategies/blue-green)

**Bounded Context**
In DDD, a logical boundary within which a particular domain model is defined and applicable. Different bounded contexts can have different models for the same real-world concept. → [Strategic Design](/architecture-patterns/domain-driven-design/strategic-design)

**B-Tree / B+Tree**
Self-balancing tree data structures used by most relational databases for indexing. B+Trees store all data in leaf nodes and link them, enabling efficient range scans. → [Storage Engines](/system-design/databases/storage-engines)

## C

**CAP Theorem**
States that a distributed data store can only provide two of three guarantees simultaneously: Consistency, Availability, and Partition tolerance. In practice, since network partitions are unavoidable, the real trade-off is between C and A during a partition. → [CAP Theorem](/system-design/distributed-systems/cap-theorem)

**CDC (Change Data Capture)**
A pattern for identifying and capturing changes made to data in a database so those changes can be propagated to downstream systems. Common implementations use database transaction logs. → [CDC Patterns](/data-engineering/pipeline-patterns/cdc-patterns)

**Circuit Breaker**
A design pattern that prevents cascading failures by detecting repeated failures to an external service and "opening" the circuit to stop further calls temporarily, allowing the failing service time to recover. → [Communication Patterns](/architecture-patterns/microservices/communication-patterns)

**Consistent Hashing**
A hashing technique that minimizes key redistribution when the number of nodes changes. Used in distributed caching, databases, and load balancers. → [Consistent Hashing](/system-design/distributed-systems/consistent-hashing)

**CQRS (Command Query Responsibility Segregation)**
An architectural pattern that separates read and write operations into different models, allowing each to be optimized independently. → [CQRS Deep Dive](/architecture-patterns/cqrs-event-sourcing/cqrs-deep-dive)

**CRDT (Conflict-free Replicated Data Type)**
Data structures that can be replicated across multiple nodes and independently updated without coordination, with a mathematically guaranteed merge function that always converges. → [CRDTs](/system-design/distributed-systems/crdt-fundamentals)

**CSP (Content Security Policy)**
An HTTP response header that allows web developers to control which resources the browser is allowed to load, mitigating XSS and data injection attacks. → [CSP Headers](/security/api-security/csp-headers)

## D

**DDD (Domain-Driven Design)**
A software development approach that focuses on modeling the software to match the business domain, using a ubiquitous language shared between developers and domain experts. → [Domain-Driven Design](/architecture-patterns/domain-driven-design/)

**Dead Letter Queue (DLQ)**
A queue where messages that cannot be processed successfully are sent for later analysis or reprocessing. Used to prevent poison messages from blocking queue consumers. → [Dead Letter Queues](/system-design/message-queues/dead-letter-queues)

## E

**Eventual Consistency**
A consistency model where, given no new updates, all replicas of a data item will eventually converge to the same value. The system guarantees convergence but not when. → [Consistency Models](/system-design/distributed-systems/consistency-models)

**Event Sourcing**
A pattern where state changes are stored as an immutable sequence of events rather than overwriting current state. The current state is derived by replaying all events. → [Event Sourcing Deep Dive](/architecture-patterns/cqrs-event-sourcing/event-sourcing-deep-dive)

**Exactly-Once Semantics**
A message delivery guarantee where each message is processed exactly one time — neither lost nor duplicated. The hardest delivery guarantee to achieve in distributed systems. → [Exactly-Once Semantics](/system-design/message-queues/exactly-once-semantics)

## G

**Gossip Protocol**
A peer-to-peer communication protocol where nodes periodically exchange state information with random peers, used for failure detection, membership management, and data dissemination. → [Gossip Protocols](/system-design/distributed-systems/gossip-protocols)

## H

**HPA (Horizontal Pod Autoscaler)**
A Kubernetes controller that automatically scales the number of pod replicas based on observed CPU utilization, memory usage, or custom metrics. → [HPA, VPA & KEDA](/infrastructure/kubernetes/hpa-vpa-keda)

## I

**ISR (In-Sync Replicas)**
In Apache Kafka, the set of replicas that are fully caught up with the leader partition. A message is considered committed only when all ISR members have acknowledged it. → [Kafka Internals](/system-design/message-queues/kafka-internals)

## J

**JWT (JSON Web Token)**
A compact, URL-safe token format for securely transmitting claims between parties. Contains a header, payload, and signature. Used for stateless authentication and authorization. → [JWT Deep Dive](/security/authentication/jwt-deep-dive)

## L

**Lamport Timestamp**
A logical clock mechanism for ordering events in a distributed system without requiring synchronized physical clocks. Each process maintains a counter incremented on every event. → [Vector Clocks & Lamport Timestamps](/system-design/distributed-systems/vector-clocks-lamport-timestamps)

**LSM Tree (Log-Structured Merge Tree)**
A data structure for write-optimized storage, used by databases like Cassandra, RocksDB, and LevelDB. Writes go to an in-memory buffer, which is periodically flushed to sorted on-disk files (SSTables) and compacted. → [Storage Engines](/system-design/databases/storage-engines)

## M

**MVCC (Multi-Version Concurrency Control)**
A database concurrency control method where each transaction sees a snapshot of the data at a point in time, allowing readers and writers to operate without blocking each other. → [MVCC](/system-design/databases/mvcc)

## O

**OIDC (OpenID Connect)**
An identity layer on top of OAuth 2.0 that provides authentication (verifying who the user is), while OAuth 2.0 handles authorization (what the user can access). → [OAuth2 & OIDC](/security/authentication/oauth2-oidc)

**OPA (Open Policy Agent)**
A general-purpose policy engine that enables unified policy enforcement across the stack — from Kubernetes admission control to API authorization to data filtering. → [Zero Trust Principles](/security/zero-trust/principles)

## P

**Partition Tolerance**
The ability of a distributed system to continue operating despite an arbitrary number of messages being dropped or delayed by the network between nodes. → [CAP Theorem](/system-design/distributed-systems/cap-theorem)

**Paxos**
A family of consensus protocols for achieving agreement among a set of distributed processes. Proven correct but notoriously difficult to implement. → [Paxos Made Simple](/system-design/consensus/paxos-made-simple)

## R

**Raft**
A consensus algorithm designed to be more understandable than Paxos while providing the same guarantees. Decomposes consensus into leader election, log replication, and safety. → [Raft Full Walkthrough](/system-design/consensus/raft-full-walkthrough)

**RBAC (Role-Based Access Control)**
An access control model where permissions are assigned to roles, and users are assigned to roles. Simplifies permission management in large systems. → [Broken Access Control](/security/owasp/a01-broken-access-control)

## S

**Saga**
A pattern for managing distributed transactions across multiple services where each step has a compensating action. Used instead of 2PC in microservices architectures. → [Distributed Transactions](/system-design/distributed-systems/distributed-transactions)

**Sharding**
Horizontally partitioning data across multiple database instances to distribute load. Each shard holds a subset of the total data. → [Sharding](/system-design/databases/sharding)

**SLO (Service Level Objective)**
A target value or range of values for a service level measured by a Service Level Indicator (SLI). SLOs set expectations for system reliability. → [Metrics Design](/devops/monitoring/metrics-design)

**SSRF (Server-Side Request Forgery)**
A vulnerability where an attacker can induce the server to make HTTP requests to an arbitrary domain of their choosing, potentially accessing internal services. → [SSRF](/security/owasp/a10-ssrf)

## T

**Two-Phase Commit (2PC)**
A distributed algorithm for coordinating transactions across multiple nodes. The coordinator first asks all participants to prepare (phase 1), then tells them to commit or abort (phase 2). → [Distributed Transactions](/system-design/distributed-systems/distributed-transactions)

## V

**Vector Clock**
A data structure used for determining the partial ordering of events in a distributed system and detecting causality violations. Each node maintains a vector of logical timestamps. → [Vector Clocks & Lamport Timestamps](/system-design/distributed-systems/vector-clocks-lamport-timestamps)

## W

**WAL (Write-Ahead Log)**
A technique where all modifications are written to a log before being applied to the database. Ensures durability and enables crash recovery. → [Write-Ahead Logging](/system-design/databases/write-ahead-logging)

**Watermark**
In stream processing, a timestamp that indicates the system's progress through event time. Used to determine when a time-based window can be considered complete. → [Watermarks](/data-engineering/stream-processing/watermarks)

## Z

**Zero Trust**
A security model that assumes no implicit trust for any entity inside or outside the network perimeter. Every request must be verified, authorized, and encrypted. → [Zero Trust](/security/zero-trust/)
