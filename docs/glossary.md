---
title: "Glossary"
description: "A-Z engineering terms and concepts"
tags: [glossary, reference, terminology, engineering, definitions]
difficulty: beginner
---

# Glossary

A comprehensive A-Z reference of engineering terms, acronyms, and concepts used throughout the Knowledge Vault. Each entry links to the relevant deep-dive page where the concept is explored in full.

---

## A

**A/B Testing** — A controlled experiment comparing two variants (A and B) to determine which performs better on a given metric. Requires statistical significance to draw valid conclusions. → [A/B Testing](/production-blueprints/ab-testing/) | [Statistical Significance](/production-blueprints/ab-testing/statistical-significance)

**ABAC (Attribute-Based Access Control)** — An authorization model that evaluates policies based on attributes of the user, resource, action, and environment rather than static roles. → [RBAC, ABAC & ReBAC](/security/authorization/rbac-abac-rebac)

**ACL (Access Control List)** — A list of permissions attached to an object specifying which users or system processes can access the object and what operations they can perform. → [Broken Access Control](/security/owasp/a01-broken-access-control)

**ACID (Atomicity, Consistency, Isolation, Durability)** — A set of properties guaranteeing reliable database transaction processing. Atomicity ensures all-or-nothing execution, Consistency ensures valid state transitions, Isolation prevents concurrent interference, Durability ensures committed data persists. → [Isolation Levels](/system-design/databases/isolation-levels)

**Actor Model** — A concurrency model where "actors" are independent units of computation that communicate exclusively through asynchronous message passing, avoiding shared mutable state. → [Actor Model](/system-design/concurrency/actor-model)

**ADR (Architecture Decision Record)** — A document capturing an important architectural decision, its context, and consequences, enabling future developers to understand why choices were made. → [Architecture Decision Records](/devops/engineering-practices/architecture-decision-records)

**AES (Advanced Encryption Standard)** — A symmetric block cipher adopted as a standard by NIST, using 128, 192, or 256-bit keys. The most widely used encryption algorithm for data at rest and in transit. → [Symmetric vs Asymmetric](/security/encryption/symmetric-vs-asymmetric)

**Aggregate** — In Domain-Driven Design, a cluster of domain objects treated as a single unit for data changes, with an aggregate root serving as the entry point and consistency boundary. → [Aggregate Design](/architecture-patterns/cqrs-event-sourcing/aggregate-design)

**Anti-Corruption Layer** — A DDD pattern that translates between different bounded contexts or legacy systems, preventing one model from corrupting another. → [Anti-Corruption Layer](/architecture-patterns/domain-driven-design/anti-corruption-layer)

**API Gateway** — A server acting as the single entry point for a set of microservices, handling request routing, composition, rate limiting, authentication, and protocol translation. → [API Gateway Pattern](/architecture-patterns/microservices/api-gateway-pattern)

**APM (Application Performance Monitoring)** — Tools and practices for monitoring application-level metrics such as response times, error rates, throughput, and dependency health in real time. → [Metrics Design](/devops/monitoring/metrics-design)

**Atomic Design** — A methodology for creating design systems by breaking UI components into atoms, molecules, organisms, templates, and pages. → [Atomic Design](/ui-design-systems/component-patterns/atomic-design)

**Autoscaling** — The ability to automatically adjust compute resources based on demand, scaling up during traffic spikes and down during lulls to balance cost and performance. → [HPA, VPA & KEDA](/infrastructure/kubernetes/hpa-vpa-keda)

**Availability Zone** — An isolated data center within a cloud region, providing redundancy and fault isolation. Deploying across multiple AZs is a foundational high-availability practice. → [Well-Architected](/infrastructure/aws/well-architected)

## B

**Backpressure** — A flow-control mechanism where a downstream system signals upstream to slow down when it cannot keep up with the rate of incoming data. Critical in stream processing and message queue architectures. → [Backpressure Patterns](/system-design/message-queues/backpressure-patterns)

**Batch Processing** — Processing large volumes of data in groups at scheduled intervals, as opposed to real-time stream processing. Typically higher throughput but higher latency. → [Batch Processing](/data-engineering/etl-patterns/batch-processing)

**Bcrypt** — A password hashing function based on the Blowfish cipher that incorporates a salt and a configurable work factor, making brute-force attacks computationally expensive. → [Hashing Algorithms](/security/encryption/hashing-algorithms)

**BFF (Backend for Frontend)** — A pattern where a dedicated backend service is built for each frontend application (web, mobile, etc.), tailoring the API to the specific needs of each client. → [API Gateway Pattern](/architecture-patterns/microservices/api-gateway-pattern)

**BFT (Byzantine Fault Tolerance)** — The ability of a distributed system to reach consensus even when some nodes behave maliciously or arbitrarily, named after the Byzantine Generals Problem. → [Byzantine Fault Tolerance](/system-design/distributed-systems/byzantine-fault-tolerance)

**BGP (Border Gateway Protocol)** — The routing protocol that makes the internet work, exchanging routing information between autonomous systems. BGP hijacking and misconfigurations have caused major outages. → [DNS Deep Dive](/system-design/networking/dns-deep-dive)

**Bloom Filter** — A space-efficient probabilistic data structure that tests whether an element is a member of a set, with possible false positives but no false negatives. → [Bloom Filters](/system-design/distributed-systems/bloom-filters)

**Blue-Green Deployment** — A deployment strategy maintaining two identical production environments, routing traffic to one while deploying to the other, enabling zero-downtime releases and instant rollback. → [Blue-Green](/devops/deployment-strategies/blue-green)

**Bounded Context** — In DDD, a logical boundary within which a particular domain model is defined and applicable. Different bounded contexts can have different models for the same real-world concept. → [Strategic Design](/architecture-patterns/domain-driven-design/strategic-design)

**Branching Strategy** — A convention for how Git branches are created, named, and merged. Common strategies include GitFlow, trunk-based development, and GitHub Flow. → [Branching Strategies](/devops/git/branching-strategies)

**BST (Binary Search Tree)** — A tree data structure where each node has at most two children, with left children smaller and right children larger than the parent, enabling O(log n) search in balanced cases. → [Trees](/algorithms/trees)

**B-Tree / B+Tree** — Self-balancing tree data structures used by most relational databases for indexing. B+Trees store all data in leaf nodes and link them, enabling efficient range scans. → [Storage Engines](/system-design/databases/storage-engines)

## C

**Canary Deployment** — A deployment strategy that rolls out changes to a small subset of users or servers before a full rollout, allowing early detection of issues with minimal blast radius. → [Canary Deployment](/devops/deployment-strategies/canary)

**CAP Theorem** — States that a distributed data store can only provide two of three guarantees simultaneously: Consistency, Availability, and Partition tolerance. Since partitions are unavoidable, the real trade-off is between C and A during a partition. → [CAP Theorem](/system-design/distributed-systems/cap-theorem)

**CDC (Change Data Capture)** — A pattern for identifying and capturing changes made to data in a database so those changes can be propagated to downstream systems, commonly using database transaction logs. → [CDC Patterns](/data-engineering/pipeline-patterns/cdc-patterns)

**CDN (Content Delivery Network)** — A geographically distributed network of proxy servers and data centers that cache and serve content from locations closer to end users, reducing latency and origin server load. → [CDN Deep Dive](/system-design/caching/cdn-deep-dive)

**Chaos Engineering** — The discipline of experimenting on a distributed system to build confidence in its ability to withstand turbulent conditions in production. → [Chaos Engineering](/devops/incident-response/chaos-engineering)

**CI/CD (Continuous Integration / Continuous Deployment)** — The practice of automatically building, testing, and deploying code changes, enabling rapid and reliable software delivery. → [Pipeline Patterns](/infrastructure/ci-cd/pipeline-patterns)

**Circuit Breaker** — A design pattern that prevents cascading failures by detecting repeated failures to an external service and "opening" the circuit to stop further calls temporarily. → [Circuit Breaker](/system-design/distributed-systems/circuit-breaker)

**Cache Invalidation** — The process of removing or updating stale cached data, famously described as one of the two hard things in computer science. Strategies include TTL, write-through, and event-driven invalidation. → [Cache Invalidation](/system-design/caching/cache-invalidation)

**Clean Architecture** — An architectural approach organizing code into concentric layers with dependencies pointing inward, keeping business logic independent of frameworks, databases, and UI. → [Clean Architecture](/architecture-patterns/clean-architecture/)

**Consistent Hashing** — A hashing technique that minimizes key redistribution when the number of nodes changes, widely used in distributed caching, databases, and load balancers. → [Consistent Hashing](/system-design/distributed-systems/consistent-hashing)

**Connection Pooling** — A technique of maintaining a pool of reusable database connections to avoid the overhead of establishing new connections for every request, critical for high-throughput applications. → [Connection Pooling](/system-design/databases/connection-pooling)

**Container** — A lightweight, standalone executable package that includes everything needed to run a piece of software: code, runtime, libraries, and system settings. Docker is the most common container runtime. → [Docker](/infrastructure/docker/)

**Correlation ID** — A unique identifier attached to a request as it flows through multiple services, enabling end-to-end tracing and log correlation across a distributed system. → [Correlation IDs](/devops/logging/correlation-ids)

**Contract Testing** — A testing strategy that verifies interactions between services by checking that each service adheres to a shared contract, preventing integration failures. → [Contract Testing](/testing/contract-testing)

**CORS (Cross-Origin Resource Sharing)** — An HTTP-header-based mechanism that allows a server to indicate which origins are permitted to load resources, enabling controlled cross-domain requests in browsers. → [CORS Deep Dive](/security/api-security/cors-deep-dive)

**CQRS (Command Query Responsibility Segregation)** — An architectural pattern separating read and write operations into different models, allowing each to be optimized independently. → [CQRS Deep Dive](/architecture-patterns/cqrs-event-sourcing/cqrs-deep-dive)

**CRDT (Conflict-free Replicated Data Type)** — Data structures that can be replicated across multiple nodes and independently updated without coordination, with a mathematically guaranteed merge function that always converges. → [CRDT Fundamentals](/system-design/distributed-systems/crdt-fundamentals)

**CSP (Content Security Policy)** — An HTTP response header that allows web developers to control which resources the browser is allowed to load, mitigating XSS and data injection attacks. → [CSP Headers](/security/api-security/csp-headers)

## D

**Data Lineage** — The tracking of data as it flows through systems, transformations, and pipelines, enabling impact analysis, debugging, and regulatory compliance. → [Data Lineage](/data-engineering/pipeline-patterns/data-lineage)

**DDD (Domain-Driven Design)** — A software development approach that focuses on modeling software to match the business domain, using a ubiquitous language shared between developers and domain experts. → [Domain-Driven Design](/architecture-patterns/domain-driven-design/)

**Dead Letter Queue (DLQ)** — A queue where messages that cannot be processed successfully are sent for later analysis or reprocessing, preventing poison messages from blocking queue consumers. → [Dead Letter Queues](/system-design/message-queues/dead-letter-queues)

**Dependency Injection** — A design pattern where an object receives its dependencies from external sources rather than creating them internally, improving testability and decoupling. → [Dependency Injection](/architecture-patterns/design-patterns/dependency-injection)

**Dimensional Modeling** — A data warehouse design technique organizing data into fact tables (measurements) and dimension tables (context), optimized for analytical queries. → [Dimensional Modeling](/data-engineering/data-modeling/dimensional-modeling)

**Distributed Locking** — A mechanism for coordinating access to shared resources across multiple nodes in a distributed system, ensuring mutual exclusion without a single point of failure. → [Distributed Locking](/system-design/distributed-systems/distributed-locking)

**DNS (Domain Name System)** — The hierarchical naming system that translates human-readable domain names into IP addresses, serving as the internet's phone book. → [DNS Deep Dive](/system-design/networking/dns-deep-dive)

**Docker** — A platform for building, shipping, and running applications in containers, providing lightweight virtualization through OS-level process isolation. → [Docker](/infrastructure/docker/)

**Domain Event** — An event that represents something meaningful that happened in the business domain, used to communicate between bounded contexts or trigger side effects. → [Domain Events](/architecture-patterns/domain-driven-design/domain-events)

**DORA Metrics** — Four key metrics (deployment frequency, lead time for changes, change failure rate, and mean time to recovery) used to measure software delivery performance. → [Metrics Design](/devops/monitoring/metrics-design)

**DPoP (Demonstration of Proof-of-Possession)** — A mechanism binding access tokens to a specific client using asymmetric key cryptography, preventing token theft and replay attacks. → [Token Strategies](/security/authentication/token-strategies)

**Dynamic Programming** — An algorithmic technique that solves complex problems by breaking them down into overlapping subproblems and storing their solutions to avoid redundant computation. → [Dynamic Programming](/algorithms/dynamic-programming)

## E

**eBPF (extended Berkeley Packet Filter)** — A technology that allows running sandboxed programs in the Linux kernel without changing kernel source code, used for networking, observability, and security. → [eBPF](/infrastructure/linux-internals/ebpf)

**Edge Computing** — A distributed computing paradigm that brings computation and data storage closer to the sources of data, reducing latency and bandwidth usage. → [Edge Computing](/performance/edge-computing/)

**EDA (Exploratory Data Analysis)** — The process of analyzing datasets to summarize their main characteristics, often using statistical graphics and visualization, before formal modeling. → [EDA](/eda/)

**EDA (Event-Driven Architecture)** — An architectural pattern where the flow of the program is determined by events such as user actions, sensor outputs, or messages from other systems. → [Event-Driven Architecture](/architecture-patterns/event-driven/)

**Embeddings** — Dense vector representations of data (text, images, etc.) in a continuous vector space, where similar items have similar vectors. Foundational to modern AI/ML search and recommendation systems. → [Embeddings](/ai-ml-engineering/embeddings)

**Encryption** — The process of converting plaintext into ciphertext using an algorithm and key, making data unreadable without the corresponding decryption key. → [Encryption](/security/encryption/)

**Envelope Encryption** — A strategy where data is encrypted with a Data Encryption Key (DEK), and the DEK itself is encrypted with a Key Encryption Key (KEK), enabling efficient key rotation. → [Envelope Encryption](/security/encryption/envelope-encryption)

**Error Budget** — The maximum allowable threshold for errors or downtime, calculated as 1 minus the SLO target. Once exhausted, teams should prioritize reliability over new features. → [Error Budgets](/devops/sre/error-budgets)

**ETL (Extract, Transform, Load)** — A data integration process that extracts data from source systems, transforms it to fit operational needs, and loads it into a target data store. → [ETL vs ELT](/data-engineering/etl-patterns/etl-vs-elt)

**Event Sourcing** — A pattern where state changes are stored as an immutable sequence of events rather than overwriting current state, with current state derived by replaying all events. → [Event Sourcing Deep Dive](/architecture-patterns/cqrs-event-sourcing/event-sourcing-deep-dive)

**Eventual Consistency** — A consistency model where, given no new updates, all replicas of a data item will eventually converge to the same value. The system guarantees convergence but not when. → [Consistency Models](/system-design/distributed-systems/consistency-models)

**Exactly-Once Semantics** — A message delivery guarantee where each message is processed exactly one time, neither lost nor duplicated. The hardest delivery guarantee to achieve in distributed systems. → [Exactly-Once Semantics](/system-design/message-queues/exactly-once-semantics)

## F

**Failover** — The process of automatically switching to a redundant or standby system when the primary system fails, ensuring high availability and minimal downtime. → [Failover Strategies](/infrastructure/multi-region/failover-strategies)

**Fan-out** — A messaging pattern where a single message is delivered to multiple consumers or queues simultaneously. Common in pub/sub architectures and notification systems. → [SQS & SNS](/system-design/message-queues/sqs-sns)

**Feature Flag** — A technique that allows enabling or disabling features at runtime without deploying new code, supporting gradual rollouts, A/B testing, and instant kill switches. → [Feature Flags](/devops/feature-flags)

**FIDO2** — An open authentication standard enabling passwordless authentication using hardware security keys or platform authenticators, based on public-key cryptography. → [Passkeys & WebAuthn](/security/authentication/passkeys-webauthn)

**Fine-Tuning** — The process of taking a pre-trained ML model and further training it on a domain-specific dataset to adapt it for a particular task. → [Fine-Tuning](/ai-ml-engineering/fine-tuning)

**Fork Bomb** — A denial-of-service attack where a process continually replicates itself to deplete available system resources, typically expressed in bash as `:()\{&#x200B; :|:& \}&#x200B;;:`. → [Linux Security](/cybersecurity/linux-security)

**Functional Programming** — A programming paradigm treating computation as the evaluation of mathematical functions, emphasizing immutability, pure functions, and avoiding side effects. → [Functional Programming](/architecture-patterns/functional-programming/)

**Funnel Analysis** — An analytical method tracking user progression through a defined sequence of steps (e.g., signup, onboarding, purchase), identifying where users drop off. → [A/B Testing Architecture](/production-blueprints/ab-testing/architecture)

## G

**GDPR (General Data Protection Regulation)** — The EU regulation governing data protection and privacy, requiring explicit consent, data minimization, right to erasure, and breach notification. → [GDPR Engineering](/security/compliance/gdpr-engineering)

**GitOps** — An operational framework where the entire system state is declaratively described in Git, and automated processes ensure the live environment matches the desired state. → [GitOps](/infrastructure/kubernetes/gitops)

**Gossip Protocol** — A peer-to-peer communication protocol where nodes periodically exchange state information with random peers, used for failure detection, membership management, and data dissemination. → [Gossip Protocols](/system-design/distributed-systems/gossip-protocols)

**GPU (Graphics Processing Unit)** — A specialized processor originally designed for graphics rendering but now widely used for parallel computation in AI/ML training and inference workloads. → [GPU & Kubernetes](/infrastructure/ai-infrastructure/gpu-kubernetes)

**Grafana** — An open-source analytics and visualization platform for monitoring metrics, commonly paired with Prometheus for infrastructure and application observability. → [Grafana Dashboards](/devops/monitoring/grafana-dashboards)

**GraphQL** — A query language for APIs that lets clients request exactly the data they need, eliminating over-fetching and under-fetching problems common in REST APIs. → [GraphQL Advanced](/system-design/api-design/graphql-advanced) | [REST vs GraphQL vs gRPC](/comparisons/rest-vs-graphql-vs-grpc-vs-trpc)

**Greedy Algorithm** — An algorithmic paradigm that makes the locally optimal choice at each step, hoping to find the global optimum. Works for problems with greedy-choice property and optimal substructure. → [Greedy Algorithms](/algorithms/greedy)

**gRPC** — A high-performance RPC framework using Protocol Buffers for serialization and HTTP/2 for transport, supporting streaming, bidirectional communication, and code generation. → [gRPC Deep Dive](/system-design/api-design/grpc-deep-dive)

## H

**HATEOAS (Hypermedia as the Engine of Application State)** — A REST constraint where responses include hypermedia links that clients can follow to discover available actions, making the API self-describing. → [REST Best Practices](/system-design/api-design/rest-best-practices)

**Health Check** — An endpoint or mechanism that reports the operational status of a service, used by load balancers and orchestrators to route traffic away from unhealthy instances. → [Health Checks](/system-design/load-balancing/health-checks)

**Helm** — A package manager for Kubernetes that simplifies deploying and managing applications through reusable, versioned chart templates. → [Helm Charts](/infrastructure/kubernetes/helm-charts)

**Hexagonal Architecture** — An architectural pattern (also called Ports and Adapters) that isolates the core domain logic from external concerns like databases, APIs, and UIs through well-defined ports. → [Hexagonal Architecture](/architecture-patterns/hexagonal/)

**HMAC (Hash-Based Message Authentication Code)** — A mechanism for verifying both the data integrity and authenticity of a message using a cryptographic hash function combined with a secret key. → [Request Signing](/security/api-security/request-signing)

**Hot Partition** — A partition in a distributed system that receives a disproportionate amount of traffic compared to other partitions, causing performance bottlenecks and potential failures. → [Sharding](/system-design/databases/sharding)

**HPA (Horizontal Pod Autoscaler)** — A Kubernetes controller that automatically scales the number of pod replicas based on observed CPU utilization, memory usage, or custom metrics. → [HPA, VPA & KEDA](/infrastructure/kubernetes/hpa-vpa-keda)

**HTTP/2 / HTTP/3** — Modern versions of the HTTP protocol. HTTP/2 introduces multiplexing and header compression; HTTP/3 replaces TCP with QUIC for reduced latency and improved connection migration. → [HTTP/2 & HTTP/3](/system-design/networking/http2-http3)

**Heap** — A specialized tree-based data structure satisfying the heap property: in a max-heap each parent is greater than its children, in a min-heap each parent is smaller. The basis for priority queues. → [Heaps & Priority Queues](/algorithms/heaps-priority-queues)

**Hydration** — The client-side process of attaching JavaScript event handlers to server-rendered HTML, making a static page interactive. A key step in SSR frameworks like Next.js and Nuxt. → [Rendering Strategies](/frontend-engineering/rendering-strategies)

## I

**IaC (Infrastructure as Code)** — The practice of managing and provisioning infrastructure through machine-readable configuration files rather than manual processes, enabling version control and repeatability. → [Terraform Fundamentals](/infrastructure/terraform/fundamentals)

**Idempotency** — The property of an operation where performing it multiple times produces the same result as performing it once, critical for safe retries in distributed systems. → [Idempotent Consumers](/architecture-patterns/event-driven/idempotent-consumers) | [Idempotent Pipelines](/data-engineering/etl-patterns/idempotent-pipelines)

**Isolation Level** — A database setting that defines how transaction integrity is maintained with respect to concurrent operations. Common levels include Read Uncommitted, Read Committed, Repeatable Read, and Serializable. → [Isolation Levels](/system-design/databases/isolation-levels)

**ISR (In-Sync Replicas)** — In Apache Kafka, the set of replicas fully caught up with the leader partition. A message is considered committed only when all ISR members have acknowledged it. → [Kafka Internals](/system-design/message-queues/kafka-internals)

**ISR (Incremental Static Regeneration)** — A Next.js feature that allows statically generated pages to be updated after deployment without rebuilding the entire site, combining static performance with dynamic freshness. → [Next.js Patterns](/infrastructure/languages/nextjs-patterns)

**Indexing** — A database optimization technique creating auxiliary data structures (B-trees, hash indexes, GIN, GiST) to speed up query lookups at the cost of additional storage and write overhead. → [Indexing Deep Dive](/system-design/databases/indexing-deep-dive)

## J

**JIT (Just-In-Time Compilation)** — A compilation technique where code is compiled to machine code at runtime rather than ahead of time, enabling optimizations based on actual execution patterns. → [V8 Optimization](/performance/optimization/v8-optimization)

**JNDI (Java Naming and Directory Interface)** — A Java API for directory services that allows clients to discover and look up data and resources. Infamously exploited in the Log4Shell vulnerability. → [Log4Shell](/security/exploits/log4shell)

**JSON Schema** — A vocabulary for annotating and validating JSON documents, defining the structure, required fields, types, and constraints of JSON data. → [OpenAPI & Swagger](/system-design/api-design/openapi-swagger)

**JWT (JSON Web Token)** — A compact, URL-safe token format for securely transmitting claims between parties, containing a header, payload, and signature, used for stateless authentication and authorization. → [JWT Deep Dive](/security/authentication/jwt-deep-dive)

## K

**Kafka** — A distributed event streaming platform used for high-throughput, fault-tolerant publish-subscribe messaging, event sourcing, and stream processing. → [Kafka Internals](/system-design/message-queues/kafka-internals)

**KEDA (Kubernetes Event-Driven Autoscaling)** — A Kubernetes-based autoscaler that scales workloads based on event-driven metrics such as queue length, HTTP requests, or custom metrics from external sources. → [HPA, VPA & KEDA](/infrastructure/kubernetes/hpa-vpa-keda)

**Kerberos** — A network authentication protocol using tickets to allow nodes communicating over a non-secure network to prove their identity to one another securely. → [Enterprise SSO](/security/authentication/enterprise-sso)

**Kubernetes** — An open-source container orchestration platform that automates deployment, scaling, and management of containerized applications across clusters. → [Kubernetes](/infrastructure/kubernetes/)

**KV Store (Key-Value Store)** — A data storage paradigm that uses a simple key-value pair for storing data, providing fast lookups by key. Examples include Redis, DynamoDB, and etcd. → [Redis Internals](/system-design/databases/redis-internals) | [Build a KV Store](/build-from-scratch/key-value-store)

## L

**Lamport Timestamp** — A logical clock mechanism for ordering events in a distributed system without requiring synchronized physical clocks. Each process maintains a counter incremented on every event. → [Vector Clocks & Lamport Timestamps](/system-design/distributed-systems/vector-clocks-lamport-timestamps)

**LangChain** — A framework for building applications powered by large language models, providing abstractions for chains, agents, memory, and tool integration. → [LangChain](/ai-ml-engineering/langchain)

**Latency** — The time delay between a request being sent and the response being received. Often measured at p50, p95, and p99 percentiles for understanding tail latency behavior. → [Metrics Design](/devops/monitoring/metrics-design)

**Leader Election** — A process in distributed systems where nodes select one node to act as the coordinator for a particular task, ensuring only one node performs critical operations. → [Leader Election](/system-design/consensus/leader-election)

**LLM (Large Language Model)** — A type of AI model trained on massive text datasets that can generate, summarize, translate, and reason about text. Examples include GPT, Claude, and Gemini. → [LLM Integration](/ai-ml-engineering/llm-integration)

**Load Balancer** — A device or service that distributes incoming network traffic across multiple backend servers to ensure no single server is overwhelmed, improving reliability and performance. → [Load Balancing](/system-design/load-balancing/) | [Build a Load Balancer](/build-from-scratch/load-balancer)

**Lock-Free Data Structures** — Concurrent data structures that guarantee system-wide progress without using traditional locks, using atomic operations like compare-and-swap instead. → [Lock-Free](/system-design/concurrency/lock-free)

**LSM Tree (Log-Structured Merge Tree)** — A data structure optimized for write-heavy workloads, used by databases like Cassandra and RocksDB. Writes go to an in-memory buffer, periodically flushed to sorted on-disk files and compacted. → [Storage Engines](/system-design/databases/storage-engines)

**Log Aggregation** — The practice of collecting, centralizing, and indexing logs from multiple services and hosts into a single system for unified searching, analysis, and alerting. → [Log Aggregation](/devops/logging/log-aggregation)

## M

**Medallion Architecture** — A data lakehouse architecture pattern organizing data into bronze (raw), silver (cleaned), and gold (aggregated) layers, each progressively refined for analytics. → [Medallion Architecture](/data-engineering/lakehouse/medallion-architecture)

**Mermaid** — A JavaScript-based diagramming and charting tool that renders Markdown-inspired text definitions into diagrams, supported natively by GitHub and many documentation platforms.

**MFA (Multi-Factor Authentication)** — An authentication method requiring two or more verification factors (something you know, have, or are) to gain access, significantly reducing account compromise risk. → [MFA Deep Dive](/security/authentication/mfa-deep-dive)

**Micro Frontends** — An architectural approach that extends microservices concepts to the frontend, allowing independent teams to build, test, and deploy frontend features independently. → [Micro Frontends](/frontend-engineering/micro-frontends)

**Microservices** — An architectural style structuring an application as a collection of small, autonomous services modeled around business domains, each independently deployable and scalable. → [Microservices](/architecture-patterns/microservices/)

**MLOps** — A set of practices combining Machine Learning, DevOps, and Data Engineering to deploy and maintain ML models in production reliably and efficiently. → [ML Pipelines](/ai-ml-engineering/ml-pipelines)

**Monad** — In functional programming, a design pattern that defines how functions, actions, inputs, and outputs can be used together to build generic types, enabling composition of operations that may involve side effects. → [Monads & Functors](/architecture-patterns/functional-programming/monads-functors)

**Monorepo** — A version control strategy where multiple projects or services are stored in a single repository, enabling atomic cross-project changes and shared tooling. → [Monorepo](/devops/git/monorepo)

**MQTT** — A lightweight publish-subscribe messaging protocol designed for constrained devices and low-bandwidth, high-latency networks, widely used in IoT. → [MQTT](/system-design/networking/mqtt)

**Multi-Tenancy** — An architecture where a single instance of software serves multiple tenants (customers), with data isolation and resource management between them. → [Multi-Tenancy](/architecture-patterns/multi-tenancy/)

**Mutex (Mutual Exclusion)** — A synchronization primitive that ensures only one thread or process can access a shared resource at a time, preventing race conditions. → [Concurrency Patterns](/performance/optimization/concurrency-patterns)

**MVCC (Multi-Version Concurrency Control)** — A database concurrency control method where each transaction sees a snapshot of data at a point in time, allowing readers and writers to operate without blocking each other. → [MVCC](/system-design/databases/mvcc)

## N

**NAT (Network Address Translation)** — A method of mapping private IP addresses to a public IP address, enabling multiple devices on a local network to share a single public IP for internet access. → [VPC Networking](/infrastructure/aws/vpc-networking)

**NATS** — A lightweight, high-performance messaging system for cloud-native applications supporting publish-subscribe, request-reply, and queue groups. → [NATS](/system-design/message-queues/nats)

**Network Policy** — In Kubernetes, a specification for how groups of pods are allowed to communicate with each other and other network endpoints, enabling micro-segmentation. → [Network Policies](/infrastructure/kubernetes/network-policies)

**Nginx** — A high-performance web server and reverse proxy commonly used for load balancing, caching, and serving static content. → [Nginx](/infrastructure/nginx/) | [Nginx Config](/system-design/load-balancing/nginx-config)

**Node.js** — A JavaScript runtime built on Chrome's V8 engine that enables server-side JavaScript execution using an event-driven, non-blocking I/O model. → [Node.js Internals](/infrastructure/languages/nodejs-internals)

**Normalization** — The process of organizing database tables to minimize redundancy and dependency, following normal forms (1NF, 2NF, 3NF, BCNF) to ensure data integrity. → [Normalization & Denormalization](/data-engineering/data-modeling/normalization-denormalization)

**NoSQL** — A category of database management systems that differ from traditional relational databases by not requiring fixed schemas, supporting horizontal scaling, and using varied data models (document, key-value, column-family, graph). → [Database Selection Guide](/system-design/databases/database-selection-guide)

## O

**OAuth 2.0** — An authorization framework that enables third-party applications to obtain limited access to a web service on behalf of a resource owner, without exposing credentials. → [OAuth2 & OIDC](/security/authentication/oauth2-oidc) | [OAuth2 Flows](/security/authentication/oauth2-flows)

**OIDC (OpenID Connect)** — An identity layer on top of OAuth 2.0 that provides authentication (verifying who the user is), while OAuth 2.0 handles authorization (what the user can access). → [OAuth2 & OIDC](/security/authentication/oauth2-oidc)

**OPA (Open Policy Agent)** — A general-purpose policy engine enabling unified policy enforcement across the stack, from Kubernetes admission control to API authorization to data filtering. → [Policy Engines](/security/authorization/policy-engines)

**OpenAPI** — A specification for describing RESTful APIs in a machine-readable format, enabling documentation generation, client SDK generation, and API testing automation. → [OpenAPI & Swagger](/system-design/api-design/openapi-swagger)

**OpenTelemetry** — A vendor-neutral open-source observability framework for collecting, processing, and exporting traces, metrics, and logs from applications. → [Distributed Tracing](/architecture-patterns/microservices/distributed-tracing)

**ORM (Object-Relational Mapping)** — A technique that maps objects in code to database tables, allowing developers to interact with databases using their programming language rather than raw SQL. → [Prisma vs Drizzle vs TypeORM](/comparisons/prisma-vs-drizzle-vs-typeorm)

**Outbox Pattern** — A pattern ensuring reliable event publishing by writing events to an "outbox" table in the same database transaction as the business operation, then asynchronously publishing them to a message broker. → [Transactional Outbox](/architecture-patterns/event-driven/transactional-outbox)

**OSINT (Open-Source Intelligence)** — The practice of collecting and analyzing publicly available information for intelligence purposes, including reconnaissance in cybersecurity assessments. → [OSINT](/cybersecurity/osint)

**OWASP (Open Web Application Security Project)** — A nonprofit foundation providing freely available resources for web application security, best known for the OWASP Top 10 list of critical security risks. → [OWASP Top 10](/security/owasp/)

## P

**Pagination** — The practice of dividing API responses into discrete pages to limit data returned per request, using strategies like offset-based, cursor-based, or keyset pagination. → [Pagination Patterns](/system-design/api-design/pagination-patterns)

**Partition Tolerance** — The ability of a distributed system to continue operating despite an arbitrary number of messages being dropped or delayed by the network between nodes. → [CAP Theorem](/system-design/distributed-systems/cap-theorem)

**Passkeys** — A passwordless authentication method based on FIDO2/WebAuthn, using public-key cryptography synced across devices, replacing passwords with biometric or device-based authentication. → [Passkeys & WebAuthn](/security/authentication/passkeys-webauthn)

**Paxos** — A family of consensus protocols for achieving agreement among distributed processes, proven correct but notoriously difficult to implement. → [Paxos Made Simple](/system-design/consensus/paxos-made-simple)

**PgBouncer** — A lightweight connection pooler for PostgreSQL that reduces database overhead by reusing connections across multiple clients. → [Connection Pooling](/system-design/databases/connection-pooling)

**PostGIS** — A spatial database extension for PostgreSQL that adds support for geographic objects, spatial indexing, and geospatial queries. → [Spatial Indexing](/system-design/geospatial/spatial-indexing)

**Postmortem** — A structured review conducted after an incident to identify what happened, why, and how to prevent recurrence, focused on learning rather than blame. → [Postmortem Framework](/devops/incident-response/postmortem-framework)

**Prometheus** — An open-source monitoring and alerting toolkit using a pull-based model to collect time-series metrics, with a powerful query language (PromQL). → [Prometheus Deep Dive](/devops/monitoring/prometheus-deep-dive)

**Prompt Engineering** — The practice of designing and optimizing inputs (prompts) to large language models to elicit desired outputs, including techniques like few-shot learning and chain-of-thought. → [Prompt Engineering](/prompt-engineering/)

**Pub/Sub (Publish-Subscribe)** — A messaging pattern where senders (publishers) broadcast messages to a topic without knowledge of receivers (subscribers), enabling loose coupling between components. → [Kafka Internals](/system-design/message-queues/kafka-internals)

**Projection** — In event sourcing and CQRS, a read model built by processing a stream of events into a denormalized view optimized for specific queries. → [Projections](/architecture-patterns/cqrs-event-sourcing/projections)

**Property-Based Testing** — A testing approach where tests define properties that should hold for all inputs, and the framework generates random inputs to find counterexamples. → [Property-Based Testing](/testing/property-based-testing)

**PWA (Progressive Web App)** — A web application that uses service workers, manifests, and other web platform features to deliver app-like experiences including offline functionality, push notifications, and installability. → [Web Performance](/frontend-engineering/web-performance)

## Q

**Query Plan** — The execution strategy chosen by a database query optimizer to retrieve data, describing the sequence of operations (scans, joins, sorts) used to fulfill a SQL query. → [Query Planning & Optimization](/system-design/databases/query-planning-optimization)

**Queueing Theory** — The mathematical study of waiting lines, providing models for understanding throughput, latency, and utilization in systems with finite capacity. Foundational to capacity planning. → [Queueing Theory](/system-design/distributed-systems/queueing-theory)

**QUIC** — A transport-layer protocol built on UDP, providing multiplexed connections, built-in TLS 1.3, and reduced connection establishment latency. The foundation of HTTP/3. → [QUIC Protocol](/system-design/networking/quic-protocol)

## R

**RBAC (Role-Based Access Control)** — An access control model where permissions are assigned to roles, and users are assigned to roles, simplifying permission management in large systems. → [RBAC, ABAC & ReBAC](/security/authorization/rbac-abac-rebac)

**Raft** — A consensus algorithm designed to be more understandable than Paxos while providing the same guarantees, decomposing consensus into leader election, log replication, and safety. → [Raft Full Walkthrough](/system-design/consensus/raft-full-walkthrough)

**RAG (Retrieval-Augmented Generation)** — An AI architecture pattern that enhances LLM responses by first retrieving relevant documents from a knowledge base, then providing them as context for generation. → [RAG Architecture](/ai-ml-engineering/rag-architecture)

**Rate Limiting** — A technique for controlling the rate of requests a client can make to an API, protecting services from abuse and ensuring fair resource allocation. → [Rate Limiting](/system-design/distributed-systems/rate-limiting) | [Build a Rate Limiter](/build-from-scratch/rate-limiter)

**Redis** — An in-memory data structure store used as a database, cache, message broker, and queue, supporting strings, hashes, lists, sets, sorted sets, and streams. → [Redis Internals](/system-design/databases/redis-internals) | [Build Redis](/build-from-scratch/redis)

**Replication** — The process of copying and maintaining database data across multiple servers, providing redundancy, fault tolerance, and read scalability. → [Replication](/system-design/databases/replication)

**Repository Pattern** — A design pattern that mediates between the domain and data mapping layers, acting as an in-memory collection of domain objects with an interface for persistence operations. → [Repository Pattern](/architecture-patterns/design-patterns/repository-pattern)

**RPC (Remote Procedure Call)** — A protocol that allows a program to execute a procedure on a remote server as if it were a local call, abstracting the network communication details. → [gRPC Deep Dive](/system-design/api-design/grpc-deep-dive)

**Rolling Update** — A deployment strategy that incrementally replaces instances of the old version with the new version, ensuring some instances remain available throughout the process. → [Rolling Updates](/devops/deployment-strategies/rolling-updates)

**RSA** — An asymmetric cryptographic algorithm using a pair of public and private keys for encryption, digital signatures, and key exchange. Named after its inventors: Rivest, Shamir, and Adleman. → [Symmetric vs Asymmetric](/security/encryption/symmetric-vs-asymmetric)

**Runbook** — A documented procedure for handling routine operations or incident response, providing step-by-step instructions to reduce mean time to recovery. → [Runbooks](/devops/runbooks/)

## S

**Saga** — A pattern for managing distributed transactions across multiple services where each step has a compensating action, used instead of 2PC in microservices architectures. → [Sagas & Process Managers](/architecture-patterns/cqrs-event-sourcing/sagas-process-managers) | [Distributed Transactions](/system-design/distributed-systems/distributed-transactions)

**Schema Evolution** — The process of managing changes to data schemas over time in a backward- and forward-compatible way, critical for systems with multiple producers and consumers. → [Schema Evolution](/data-engineering/data-modeling/schema-evolution) | [Event Schema Evolution](/architecture-patterns/event-driven/event-schema-evolution)

**Service Discovery** — The mechanism by which services in a distributed system locate each other, either through client-side discovery, server-side discovery, or a service registry. → [Service Discovery](/system-design/networking/service-discovery)

**Service Mesh** — An infrastructure layer handling service-to-service communication through sidecar proxies, providing observability, traffic management, and security without changing application code. → [Service Mesh](/architecture-patterns/microservices/service-mesh)

**Sharding** — Horizontally partitioning data across multiple database instances to distribute load, where each shard holds a subset of the total data. → [Sharding](/system-design/databases/sharding)

**SIEM (Security Information and Event Management)** — A system that aggregates and analyzes security event data from across an organization's IT infrastructure, enabling threat detection and incident response. → [Blue Team & SOC](/cybersecurity/blue-team-soc)

**SLI/SLO/SLA** — Service Level Indicators are metrics measuring service behavior; Service Level Objectives are target values for SLIs; Service Level Agreements are contractual commitments with consequences for violations. → [SLI, SLO & SLA](/devops/sre/sli-slo-sla)

**Snapshot** — In event sourcing, a periodic capture of the current aggregate state to avoid replaying the entire event history from the beginning when rebuilding state. → [Snapshots](/architecture-patterns/cqrs-event-sourcing/snapshots)

**SOLID** — Five design principles (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion) for writing maintainable and extensible object-oriented code. → [SOLID Principles](/architecture-patterns/solid-principles/)

**SRE (Site Reliability Engineering)** — A discipline applying software engineering principles to infrastructure and operations problems, pioneered by Google, focused on building and running reliable production systems. → [SRE](/devops/sre/)

**SSR (Server-Side Rendering)** — A technique where HTML is generated on the server for each request, sending fully rendered pages to the client for faster initial loads and better SEO. → [Rendering Strategies](/frontend-engineering/rendering-strategies)

**SSRF (Server-Side Request Forgery)** — A vulnerability where an attacker can induce the server to make HTTP requests to an arbitrary domain, potentially accessing internal services. → [SSRF](/security/owasp/a10-ssrf)

**State Machine** — A computational model where a system can be in one of a finite number of states and transitions between them based on inputs. Useful for modeling workflows, protocols, and UI state. → [Behavioral Patterns](/architecture-patterns/design-patterns/behavioral-patterns)

**Structured Logging** — A logging practice where log entries are formatted as structured data (usually JSON) rather than plain text, enabling easier parsing, searching, and analysis. → [Structured Logging](/devops/logging/structured-logging)

**Supply Chain Security** — Practices to protect software from threats introduced through third-party dependencies, build tools, and CI/CD pipelines, including SBOM generation, dependency scanning, and artifact signing. → [Supply Chain Security](/security/supply-chain/)

## T

**TCP/IP** — The foundational protocol suite of the internet, where TCP provides reliable, ordered delivery of data streams and IP handles addressing and routing of packets. → [TCP/IP Deep Dive](/system-design/networking/tcp-ip-deep-dive)

**TDD (Test-Driven Development)** — A development practice where tests are written before the implementation code, following a red-green-refactor cycle. → [TDD & BDD](/testing/tdd-bdd)

**Temporal** — A durable execution platform for running long-lived, reliable workflows across distributed services, handling retries, timeouts, and failure recovery automatically. → [Temporal](/system-design/background-jobs/temporal)

**Terraform** — An open-source infrastructure as code tool that enables defining and provisioning infrastructure across multiple cloud providers using a declarative configuration language (HCL). → [Terraform](/infrastructure/terraform/)

**Thundering Herd** — A problem where a large number of processes or clients simultaneously attempt to access the same resource (e.g., after a cache expiration), causing a load spike on the backend. → [Thundering Herd](/system-design/caching/thundering-herd)

**TLS (Transport Layer Security)** — A cryptographic protocol providing end-to-end encryption, authentication, and integrity for data transmitted over a network, succeeding SSL. → [TLS Handshake](/system-design/networking/tls-handshake)

**Token Bucket** — A rate limiting algorithm where tokens are added to a bucket at a fixed rate, and each request consumes a token. Allows bursts up to bucket capacity while enforcing an average rate. → [Rate Limiter Algorithms](/production-blueprints/rate-limiter/algorithms)

**Toil** — In SRE, repetitive, manual, automatable, and tactically-driven operational work that scales linearly with service size and provides no enduring value. → [Toil Reduction](/devops/sre/toil-reduction)

**Transactional Outbox** — See [Outbox Pattern](#o).

**Trie (Prefix Tree)** — A tree-like data structure used for efficient retrieval of keys in a dataset of strings, commonly used in autocomplete, spell checkers, and IP routing tables. → [Advanced Data Structures](/algorithms/advanced-data-structures)

**tRPC** — A framework for building end-to-end typesafe APIs in TypeScript, enabling direct function calls from client to server without code generation or schemas. → [tRPC](/system-design/api-design/trpc)

**t-SNE (t-Distributed Stochastic Neighbor Embedding)** — A dimensionality reduction technique for visualizing high-dimensional data in 2D or 3D, preserving local structure and revealing clusters. → [Multivariate Analysis](/eda/multivariate)

**Two-Phase Commit (2PC)** — A distributed algorithm for coordinating transactions across multiple nodes where the coordinator asks participants to prepare (phase 1), then tells them to commit or abort (phase 2). → [Distributed Transactions](/system-design/distributed-systems/distributed-transactions)

## U

**UMAP (Uniform Manifold Approximation and Projection)** — A dimensionality reduction technique that preserves both local and global data structure, often preferred over t-SNE for larger datasets and producing more meaningful global topology. → [Multivariate Analysis](/eda/multivariate)

**Union-Find (Disjoint Set Union)** — A data structure that keeps track of elements partitioned into disjoint sets, supporting efficient union and find operations, commonly used in graph algorithms like Kruskal's MST. → [Advanced Data Structures](/algorithms/advanced-data-structures)

**Upstream / Downstream** — In system architecture, upstream services are closer to the data source or client, while downstream services depend on upstream outputs. In DDD, upstream contexts influence downstream contexts. → [Strategic Design](/architecture-patterns/domain-driven-design/strategic-design)

**UUID (Universally Unique Identifier)** — A 128-bit identifier designed to be globally unique without a central coordinating authority, commonly used as primary keys in distributed systems. Variants include UUIDv4 (random) and UUIDv7 (time-ordered). → [Database Selection Guide](/system-design/databases/database-selection-guide)

## V

**V8** — Google's open-source high-performance JavaScript and WebAssembly engine, used in Chrome and Node.js, featuring JIT compilation and advanced garbage collection. → [V8 Optimization](/performance/optimization/v8-optimization)

**Vault** — HashiCorp's tool for secrets management, encryption as a service, and privileged access management, providing dynamic secrets, leasing, and audit logging. → [Vault Deep Dive](/security/secrets-management/vault-deep-dive)

**Vector Clock** — A data structure used for determining the partial ordering of events in a distributed system and detecting causality violations, where each node maintains a vector of logical timestamps. → [Vector Clocks & Lamport Timestamps](/system-design/distributed-systems/vector-clocks-lamport-timestamps)

**Vector Database** — A database optimized for storing and querying high-dimensional vector embeddings, enabling similarity search for AI/ML applications like semantic search and recommendation systems. → [Vector Databases](/ai-ml-engineering/vector-databases)

**VIF (Variance Inflation Factor)** — A statistical measure quantifying the severity of multicollinearity in regression analysis, where values above 5-10 indicate problematic collinearity between predictor variables. → [Multicollinearity](/eda/multicollinearity)

**Virtual DOM** — An in-memory representation of the real DOM used by frameworks like React to batch and optimize UI updates by computing the minimal set of changes needed. → [React Internals](/frontend-engineering/react-internals)

**VPC (Virtual Private Cloud)** — An isolated virtual network within a cloud provider where you define IP address ranges, subnets, route tables, and gateways, providing network-level isolation for cloud resources. → [VPC Networking](/infrastructure/aws/vpc-networking)

## W

**WAF (Web Application Firewall)** — A security layer that monitors, filters, and blocks HTTP traffic to and from a web application, protecting against attacks like SQL injection, XSS, and DDoS. → [API Security](/security/api-security/)

**WAL (Write-Ahead Log)** — A technique where all modifications are written to a log before being applied to the database, ensuring durability and enabling crash recovery. → [Write-Ahead Logging](/system-design/databases/write-ahead-logging)

**Watermark** — In stream processing, a timestamp indicating the system's progress through event time, used to determine when a time-based window can be considered complete. → [Watermarks](/data-engineering/stream-processing/watermarks)

**WebAssembly (Wasm)** — A binary instruction format for a stack-based virtual machine, enabling near-native performance for web applications by running compiled code alongside JavaScript. → [WebAssembly](/frontend-engineering/webassembly)

**WebAuthn** — A W3C standard for passwordless authentication using public-key cryptography, enabling hardware security keys and platform biometrics as authentication factors. → [Passkeys & WebAuthn](/security/authentication/passkeys-webauthn)

**Webhook** — An HTTP callback that delivers real-time notifications from one application to another when a specific event occurs, enabling event-driven integrations without polling. → [Webhooks](/system-design/api-design/webhooks)

**WebRTC (Web Real-Time Communication)** — A set of APIs and protocols enabling peer-to-peer audio, video, and data sharing directly between browsers without plugins or intermediary servers. → [WebRTC](/system-design/networking/webrtc)

**WebSocket** — A communication protocol providing full-duplex, persistent connections between client and server over a single TCP connection, enabling real-time bidirectional data flow. → [WebSockets](/system-design/networking/websockets)

**Windowing** — In stream processing, the division of an unbounded data stream into finite chunks (windows) based on time or count for aggregation. Types include tumbling, sliding, session, and global windows. → [Windowing](/data-engineering/stream-processing/windowing)

**Worker Threads** — A Node.js module that enables running JavaScript in parallel threads, useful for CPU-intensive operations that would otherwise block the event loop. → [Worker Threads](/performance/optimization/worker-threads)

## X

**XSS (Cross-Site Scripting)** — A security vulnerability where malicious scripts are injected into web pages viewed by other users, enabling session hijacking, data theft, and defacement. Types include stored, reflected, and DOM-based XSS. → [XSS Advanced](/security/exploits/xss-advanced)

**XZ Backdoor** — A 2024 supply chain attack where a malicious backdoor was inserted into the XZ Utils compression library (versions 5.6.0-5.6.1), targeting SSH authentication on Linux systems. → [XZ Backdoor 2024](/security/exploits/xz-backdoor-2024)

## Y

**YAML (YAML Ain't Markup Language)** — A human-readable data serialization format commonly used for configuration files in DevOps tools like Kubernetes, Docker Compose, GitHub Actions, and Ansible. → [Kubernetes](/infrastructure/kubernetes/)

**Yeo-Johnson Transform** — A power transformation technique similar to Box-Cox but applicable to both positive and negative values, used to stabilize variance and make data more normally distributed. → [Transformations](/eda/transformations)

## Z

**Zanzibar** — Google's global authorization system providing consistent, scalable access control using relationship-based access control (ReBAC), serving as the foundation for systems like SpiceDB and Authzed. → [Zanzibar](/security/authorization/zanzibar)

**Zero Trust** — A security model that assumes no implicit trust for any entity inside or outside the network perimeter. Every request must be verified, authorized, and encrypted regardless of its origin. → [Zero Trust](/security/zero-trust/)

**ZooKeeper** — A centralized service for distributed coordination, providing primitives like distributed locks, leader election, configuration management, and service discovery. → [Leader Election](/system-design/consensus/leader-election)

**zram** — A Linux kernel module that creates compressed RAM-based block devices, effectively increasing available memory by compressing pages in RAM rather than swapping to disk. → [Memory Management](/infrastructure/linux-internals/memory-management)
