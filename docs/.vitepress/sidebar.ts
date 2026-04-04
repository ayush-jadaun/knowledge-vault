import type { DefaultTheme } from 'vitepress'

export const sidebar: DefaultTheme.Sidebar = {
  '/system-design/': [
    {
      text: 'System Design',
      items: [
        { text: 'Overview', link: '/system-design/' },
      ],
    },
    {
      text: '📖 Fundamentals',
      collapsed: false,
      items: [
        { text: 'How the Internet Works', link: '/system-design/fundamentals/how-the-internet-works' },
        { text: 'Client-Server Architecture', link: '/system-design/fundamentals/client-server' },
        { text: 'Scaling Fundamentals', link: '/system-design/fundamentals/scaling-fundamentals' },
        { text: 'Zero to Million Users', link: '/system-design/fundamentals/zero-to-million-users' },
        { text: 'System Design Characteristics', link: '/system-design/fundamentals/characteristics' },
        { text: 'Estimation Practice', link: '/system-design/fundamentals/estimation-practice' },
        { text: 'Building Blocks Overview', link: '/system-design/fundamentals/building-blocks' },
        { text: 'Proxies', link: '/system-design/fundamentals/proxies' },
        { text: 'Redundancy & Replication', link: '/system-design/fundamentals/redundancy-replication' },
        { text: 'SQL vs NoSQL Decision', link: '/system-design/fundamentals/sql-vs-nosql' },
        { text: 'How to Read Architecture', link: '/system-design/fundamentals/how-to-read-architecture' },
        { text: 'System Design Glossary', link: '/system-design/fundamentals/system-design-glossary' },
      ],
    },
    {
      text: '🟢 Patterns',
      collapsed: false,
      items: [
        { text: 'Scalability Patterns', link: '/system-design/patterns/scalability-patterns' },
        { text: 'Availability Patterns', link: '/system-design/patterns/availability-patterns' },
        { text: 'Consistency Patterns', link: '/system-design/patterns/consistency-patterns' },
        { text: 'Data Partitioning', link: '/system-design/patterns/data-partitioning' },
        { text: 'Communication Patterns', link: '/system-design/patterns/communication-patterns' },
        { text: 'ID Generation', link: '/system-design/patterns/id-generation' },
        { text: 'Blob Storage', link: '/system-design/patterns/blob-storage' },
        { text: 'Distributed Logging', link: '/system-design/patterns/distributed-logging' },
        { text: 'Notification Patterns', link: '/system-design/patterns/notification-patterns' },
        { text: 'Search Patterns', link: '/system-design/patterns/search-patterns' },
        { text: 'Event vs Request Driven', link: '/system-design/patterns/event-vs-request' },
        { text: 'Microservices vs Monolith', link: '/system-design/patterns/microservices-vs-monolith' },
      ],
    },
    {
      text: 'Distributed Systems',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/distributed-systems/' },
        { text: 'CAP Theorem', link: '/system-design/distributed-systems/cap-theorem' },
        { text: 'Consistency Models', link: '/system-design/distributed-systems/consistency-models' },
        { text: 'Distributed Transactions', link: '/system-design/distributed-systems/distributed-transactions' },
        { text: 'Vector Clocks & Lamport Timestamps', link: '/system-design/distributed-systems/vector-clocks-lamport-timestamps' },
        { text: 'Gossip Protocols', link: '/system-design/distributed-systems/gossip-protocols' },
        { text: 'Consistent Hashing', link: '/system-design/distributed-systems/consistent-hashing' },
        { text: 'Byzantine Fault Tolerance', link: '/system-design/distributed-systems/byzantine-fault-tolerance' },
        { text: 'CRDTs', link: '/system-design/distributed-systems/crdt-fundamentals' },
        { text: 'Distributed Snapshots', link: '/system-design/distributed-systems/distributed-snapshots' },
        { text: 'Failure Detectors', link: '/system-design/distributed-systems/failure-detectors' },
        { text: 'Clock Synchronization', link: '/system-design/distributed-systems/clock-synchronization' },
        { text: 'Rate Limiting', link: '/system-design/distributed-systems/rate-limiting' },
        { text: 'Circuit Breaker', link: '/system-design/distributed-systems/circuit-breaker' },
        { text: 'Bloom Filters', link: '/system-design/distributed-systems/bloom-filters' },
        { text: 'Distributed Locking', link: '/system-design/distributed-systems/distributed-locking' },
        { text: 'Queueing Theory', link: '/system-design/distributed-systems/queueing-theory' },
      ],
    },
    {
      text: 'Databases',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/databases/' },
        { text: 'Storage Engines', link: '/system-design/databases/storage-engines' },
        { text: 'Write-Ahead Logging', link: '/system-design/databases/write-ahead-logging' },
        { text: 'MVCC', link: '/system-design/databases/mvcc' },
        { text: 'Isolation Levels', link: '/system-design/databases/isolation-levels' },
        { text: 'Indexing Deep Dive', link: '/system-design/databases/indexing-deep-dive' },
        { text: 'Query Planning & Optimization', link: '/system-design/databases/query-planning-optimization' },
        { text: 'Connection Pooling', link: '/system-design/databases/connection-pooling' },
        { text: 'Replication', link: '/system-design/databases/replication' },
        { text: 'Sharding', link: '/system-design/databases/sharding' },
        { text: 'PostgreSQL Internals', link: '/system-design/databases/postgres-internals' },
        { text: 'Redis Internals', link: '/system-design/databases/redis-internals' },
        { text: 'MongoDB Internals', link: '/system-design/databases/mongodb-internals' },
        { text: 'Database Selection Guide', link: '/system-design/databases/database-selection-guide' },
        { text: 'Time-Series Databases', link: '/system-design/databases/time-series-databases' },
        { text: 'Graph Databases', link: '/system-design/databases/graph-databases' },
        { text: 'NewSQL', link: '/system-design/databases/newsql' },
        { text: 'DynamoDB Internals', link: '/system-design/databases/dynamodb-internals' },
        { text: 'Cassandra Internals', link: '/system-design/databases/cassandra-internals' },
        { text: 'Elasticsearch Internals', link: '/system-design/databases/elasticsearch-internals' },
        { text: 'ClickHouse Internals', link: '/system-design/databases/clickhouse-internals' },
        { text: 'SQLite Internals', link: '/system-design/databases/sqlite-internals' },
        { text: 'Schema: E-Commerce', link: '/system-design/databases/schema-design-ecommerce' },
        { text: 'Schema: Social Media', link: '/system-design/databases/schema-design-social' },
        { text: 'Schema: SaaS Multi-Tenant', link: '/system-design/databases/schema-design-saas' },
        { text: 'Schema: Chat Application', link: '/system-design/databases/schema-design-chat' },
        { text: 'PostgreSQL DBA Guide', link: '/system-design/databases/postgresql-dba' },
        { text: 'Multi-Region Database', link: '/system-design/databases/multi-region-database' },
      ],
    },
    {
      text: 'Caching',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/caching/' },
        { text: 'Caching Strategies', link: '/system-design/caching/caching-strategies' },
        { text: 'Cache Invalidation', link: '/system-design/caching/cache-invalidation' },
        { text: 'Thundering Herd', link: '/system-design/caching/thundering-herd' },
        { text: 'Cache Warming', link: '/system-design/caching/cache-warming' },
        { text: 'Multi-Layer Caching', link: '/system-design/caching/multi-layer-caching' },
        { text: 'Cache Sizing Math', link: '/system-design/caching/cache-sizing-math' },
        { text: 'Redis Caching Patterns', link: '/system-design/caching/redis-caching-patterns' },
        { text: 'CDN Deep Dive', link: '/system-design/caching/cdn-deep-dive' },
      ],
    },
    {
      text: 'Message Queues',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/message-queues/' },
        { text: 'Kafka Internals', link: '/system-design/message-queues/kafka-internals' },
        { text: 'RabbitMQ Internals', link: '/system-design/message-queues/rabbitmq-internals' },
        { text: 'Redis Streams', link: '/system-design/message-queues/redis-streams' },
        { text: 'Redis Pub/Sub Patterns', link: '/system-design/message-queues/redis-pubsub-patterns' },
        { text: 'SQS & SNS', link: '/system-design/message-queues/sqs-sns' },
        { text: 'NATS', link: '/system-design/message-queues/nats' },
        { text: 'Apache Pulsar', link: '/system-design/message-queues/pulsar' },
        { text: 'Backpressure Patterns', link: '/system-design/message-queues/backpressure-patterns' },
        { text: 'Dead Letter Queues', link: '/system-design/message-queues/dead-letter-queues' },
        { text: 'Ordering Guarantees', link: '/system-design/message-queues/ordering-guarantees' },
        { text: 'Exactly-Once Semantics', link: '/system-design/message-queues/exactly-once-semantics' },
        { text: 'Queue Selection Guide', link: '/system-design/message-queues/queue-selection-guide' },
        { text: 'Kafka Streams', link: '/system-design/message-queues/kafka-streams' },
        { text: 'Kafka Connect', link: '/system-design/message-queues/kafka-connect' },
      ],
    },
    {
      text: 'Consensus',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/consensus/' },
        { text: 'Raft Full Walkthrough', link: '/system-design/consensus/raft-full-walkthrough' },
        { text: 'Paxos Made Simple', link: '/system-design/consensus/paxos-made-simple' },
        { text: 'ZAB Protocol', link: '/system-design/consensus/zab-protocol' },
        { text: 'Viewstamped Replication', link: '/system-design/consensus/viewstamped-replication' },
        { text: 'Practical BFT', link: '/system-design/consensus/practical-bft' },
        { text: 'Leader Election', link: '/system-design/consensus/leader-election' },
      ],
    },
    {
      text: 'Load Balancing',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/load-balancing/' },
        { text: 'L4 vs L7', link: '/system-design/load-balancing/l4-vs-l7' },
        { text: 'Algorithms', link: '/system-design/load-balancing/algorithms' },
        { text: 'Health Checks', link: '/system-design/load-balancing/health-checks' },
        { text: 'Session Affinity', link: '/system-design/load-balancing/session-affinity' },
        { text: 'Global Load Balancing', link: '/system-design/load-balancing/global-load-balancing' },
        { text: 'NGINX Config', link: '/system-design/load-balancing/nginx-config' },
        { text: 'HAProxy Config', link: '/system-design/load-balancing/haproxy-config' },
        { text: 'Envoy Config', link: '/system-design/load-balancing/envoy-config' },
      ],
    },
    {
      text: 'Networking',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/networking/' },
        { text: 'TCP/IP Deep Dive', link: '/system-design/networking/tcp-ip-deep-dive' },
        { text: 'HTTP/2 & HTTP/3', link: '/system-design/networking/http2-http3' },
        { text: 'gRPC Internals', link: '/system-design/networking/grpc-internals' },
        { text: 'WebSockets', link: '/system-design/networking/websockets' },
        { text: 'DNS Deep Dive', link: '/system-design/networking/dns-deep-dive' },
        { text: 'TLS Handshake', link: '/system-design/networking/tls-handshake' },
        { text: 'Service Discovery', link: '/system-design/networking/service-discovery' },
        { text: 'Network Debugging', link: '/system-design/networking/network-debugging' },
        { text: 'GraphQL vs REST', link: '/system-design/networking/graphql-vs-rest' },
        { text: 'QUIC Protocol', link: '/system-design/networking/quic-protocol' },
        { text: 'WebRTC', link: '/system-design/networking/webrtc' },
        { text: 'MQTT for IoT', link: '/system-design/networking/mqtt' },
      ],
    },
    {
      text: 'Concurrency & Parallelism',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/concurrency/' },
        { text: 'Lock-Free Data Structures', link: '/system-design/concurrency/lock-free' },
        { text: 'Actor Model', link: '/system-design/concurrency/actor-model' },
        { text: 'Real-Time Systems', link: '/system-design/concurrency/real-time-systems' },
      ],
    },
    {
      text: 'API Design',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/api-design/' },
        { text: 'REST Best Practices', link: '/system-design/api-design/rest-best-practices' },
        { text: 'API Versioning', link: '/system-design/api-design/api-versioning' },
        { text: 'OpenAPI & Swagger', link: '/system-design/api-design/openapi-swagger' },
        { text: 'Pagination Patterns', link: '/system-design/api-design/pagination-patterns' },
        { text: 'Webhooks', link: '/system-design/api-design/webhooks' },
        { text: 'API Security Patterns', link: '/system-design/api-design/api-security-patterns' },
        { text: 'GraphQL Advanced', link: '/system-design/api-design/graphql-advanced' },
        { text: 'gRPC Deep Dive', link: '/system-design/api-design/grpc-deep-dive' },
        { text: 'Event-Driven APIs', link: '/system-design/api-design/event-driven-apis' },
        { text: 'Webhook Infrastructure', link: '/system-design/api-design/webhook-infrastructure' },
        { text: 'API Gateway Patterns', link: '/system-design/api-design/api-gateway-patterns' },
        { text: 'tRPC', link: '/system-design/api-design/trpc' },
      ],
    },
    {
      text: 'Background Jobs',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/background-jobs/' },
        { text: 'Temporal Deep Dive', link: '/system-design/background-jobs/temporal' },
        { text: 'Job Queue Comparison', link: '/system-design/background-jobs/comparison' },
        { text: 'Job Processing Patterns', link: '/system-design/background-jobs/patterns' },
      ],
    },
    {
      text: 'Geospatial',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/system-design/geospatial/' },
        { text: 'Spatial Indexing', link: '/system-design/geospatial/spatial-indexing' },
      ],
    },
    {
      text: 'Search & File Processing',
      collapsed: false,
      items: [
        { text: 'Search Engineering', link: '/system-design/search-engineering' },
        { text: 'File Processing', link: '/system-design/file-processing' },
      ],
    },
    {
      text: '🔴 Advanced',
      collapsed: false,
      items: [
        { text: 'Database Per Service', link: '/system-design/advanced/database-per-service' },
        { text: 'API Gateway vs Service Mesh', link: '/system-design/advanced/api-gateway-vs-mesh' },
        { text: 'CQRS: When to Use', link: '/system-design/advanced/cqrs-when-to-use' },
        { text: 'Serverless Architecture', link: '/system-design/advanced/serverless-architecture' },
        { text: 'Edge Computing', link: '/system-design/advanced/edge-computing' },
        { text: 'Multi-Region Design', link: '/system-design/advanced/multi-region-design' },
        { text: 'Cost of Scale', link: '/system-design/advanced/cost-of-scale' },
        { text: 'Anti-Patterns', link: '/system-design/advanced/anti-patterns' },
        { text: 'Real-World Architectures', link: '/system-design/advanced/real-world-architectures' },
        { text: 'Security in Design', link: '/system-design/advanced/security-in-design' },
        { text: 'Observability in Design', link: '/system-design/advanced/observability-in-design' },
        { text: 'DDIA Summary', link: '/system-design/advanced/ddia-summary' },
        { text: 'Design Scenarios', link: '/system-design/advanced/design-scenarios' },
        { text: 'Architecture Review Exercises', link: '/system-design/advanced/architecture-review' },
        { text: 'Decision Log Template', link: '/system-design/advanced/decision-log' },
      ],
    },
    {
      text: '🎯 Interview Mastery',
      collapsed: false,
      items: [
        { text: 'Interview Framework', link: '/system-design/interview/framework' },
        { text: 'Discussing Tradeoffs', link: '/system-design/interview/discussing-tradeoffs' },
        { text: 'Common Mistakes', link: '/system-design/interview/common-mistakes' },
        { text: 'Reusable Templates', link: '/system-design/interview/templates' },
        { text: 'Estimation Cheat Sheet', link: '/system-design/interview/estimation-cheat-sheet' },
        { text: 'Deep Dive Topics', link: '/system-design/interview/deep-dive-topics' },
        { text: 'Practice: Easy', link: '/system-design/interview/practice-easy' },
        { text: 'Practice: Medium', link: '/system-design/interview/practice-medium' },
        { text: 'Practice: Hard', link: '/system-design/interview/practice-hard' },
        { text: 'Mock Interview Walkthrough', link: '/system-design/interview/mock-walkthrough' },
      ],
    },
  ],

  '/architecture-patterns/': [
    {
      text: 'Architecture Patterns',
      items: [
        { text: 'Overview', link: '/architecture-patterns/' },
      ],
    },
    {
      text: 'Microservices',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/microservices/' },
        { text: 'Decomposition Strategies', link: '/architecture-patterns/microservices/decomposition-strategies' },
        { text: 'Communication Patterns', link: '/architecture-patterns/microservices/communication-patterns' },
        { text: 'API Gateway Pattern', link: '/architecture-patterns/microservices/api-gateway-pattern' },
        { text: 'Service Mesh', link: '/architecture-patterns/microservices/service-mesh' },
        { text: 'Data Management', link: '/architecture-patterns/microservices/data-management' },
        { text: 'Testing Strategies', link: '/architecture-patterns/microservices/testing-strategies' },
        { text: 'Migration from Monolith', link: '/architecture-patterns/microservices/migration-from-monolith' },
        { text: 'Anti-Patterns', link: '/architecture-patterns/microservices/anti-patterns' },
        { text: 'API Composition', link: '/architecture-patterns/microservices/api-composition' },
        { text: 'Distributed Tracing', link: '/architecture-patterns/microservices/distributed-tracing' },
      ],
    },
    {
      text: 'Event-Driven',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/event-driven/' },
        { text: 'Event Types', link: '/architecture-patterns/event-driven/event-types' },
        { text: 'Event Bus Patterns', link: '/architecture-patterns/event-driven/event-bus-patterns' },
        { text: 'Event Choreography', link: '/architecture-patterns/event-driven/event-choreography' },
        { text: 'Event Orchestration', link: '/architecture-patterns/event-driven/event-orchestration' },
        { text: 'Event Schema Evolution', link: '/architecture-patterns/event-driven/event-schema-evolution' },
        { text: 'Eventual Consistency', link: '/architecture-patterns/event-driven/eventual-consistency' },
        { text: 'Transactional Outbox', link: '/architecture-patterns/event-driven/transactional-outbox' },
        { text: 'Idempotent Consumers', link: '/architecture-patterns/event-driven/idempotent-consumers' },
        { text: 'Event Versioning', link: '/architecture-patterns/event-driven/event-versioning' },
        { text: 'Event Sourcing in Practice', link: '/architecture-patterns/event-driven/event-sourcing-practice' },
      ],
    },
    {
      text: 'CQRS & Event Sourcing',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/cqrs-event-sourcing/' },
        { text: 'CQRS Deep Dive', link: '/architecture-patterns/cqrs-event-sourcing/cqrs-deep-dive' },
        { text: 'Event Sourcing Deep Dive', link: '/architecture-patterns/cqrs-event-sourcing/event-sourcing-deep-dive' },
        { text: 'Aggregate Design', link: '/architecture-patterns/cqrs-event-sourcing/aggregate-design' },
        { text: 'Projections', link: '/architecture-patterns/cqrs-event-sourcing/projections' },
        { text: 'Snapshots', link: '/architecture-patterns/cqrs-event-sourcing/snapshots' },
        { text: 'Sagas & Process Managers', link: '/architecture-patterns/cqrs-event-sourcing/sagas-process-managers' },
        { text: 'Event Upcasting', link: '/architecture-patterns/cqrs-event-sourcing/event-upcasting' },
      ],
    },
    {
      text: 'Hexagonal Architecture',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/hexagonal/' },
        { text: 'Ports & Adapters', link: '/architecture-patterns/hexagonal/ports-and-adapters' },
        { text: 'Dependency Inversion', link: '/architecture-patterns/hexagonal/dependency-inversion' },
        { text: 'TypeScript Implementation', link: '/architecture-patterns/hexagonal/typescript-implementation' },
      ],
    },
    {
      text: 'Clean Architecture',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/clean-architecture/' },
        { text: 'Layers & Boundaries', link: '/architecture-patterns/clean-architecture/layers-and-boundaries' },
        { text: 'Use Cases', link: '/architecture-patterns/clean-architecture/use-cases' },
        { text: 'Entities vs Models', link: '/architecture-patterns/clean-architecture/entities-vs-models' },
        { text: 'TypeScript Implementation', link: '/architecture-patterns/clean-architecture/typescript-implementation' },
      ],
    },
    {
      text: 'Domain-Driven Design',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/domain-driven-design/' },
        { text: 'Strategic Design', link: '/architecture-patterns/domain-driven-design/strategic-design' },
        { text: 'Tactical Design', link: '/architecture-patterns/domain-driven-design/tactical-design' },
        { text: 'Domain Events', link: '/architecture-patterns/domain-driven-design/domain-events' },
        { text: 'Anti-Corruption Layer', link: '/architecture-patterns/domain-driven-design/anti-corruption-layer' },
        { text: 'Specification Pattern', link: '/architecture-patterns/domain-driven-design/specification-pattern' },
        { text: 'TypeScript Implementation', link: '/architecture-patterns/domain-driven-design/typescript-implementation' },
      ],
    },
    {
      text: 'OOP Fundamentals',
      collapsed: false,
      items: [
        { text: 'Object-Oriented Programming', link: '/architecture-patterns/oop-fundamentals' },
      ],
    },
    {
      text: 'Design Patterns',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/design-patterns/' },
        { text: 'Creational Patterns', link: '/architecture-patterns/design-patterns/creational-patterns' },
        { text: 'Structural Patterns', link: '/architecture-patterns/design-patterns/structural-patterns' },
        { text: 'Behavioral Patterns', link: '/architecture-patterns/design-patterns/behavioral-patterns' },
        { text: 'Dependency Injection', link: '/architecture-patterns/design-patterns/dependency-injection' },
        { text: 'Repository Pattern', link: '/architecture-patterns/design-patterns/repository-pattern' },
      ],
    },
    {
      text: 'Cloud-Native',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/cloud-native/' },
        { text: 'Serverless Patterns', link: '/architecture-patterns/cloud-native/serverless-patterns' },
        { text: 'Cloud Design Patterns', link: '/architecture-patterns/cloud-native/cloud-design-patterns' },
      ],
    },
    {
      text: 'SOLID Principles',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/solid-principles/' },
        { text: 'Single Responsibility', link: '/architecture-patterns/solid-principles/single-responsibility' },
        { text: 'Open/Closed', link: '/architecture-patterns/solid-principles/open-closed' },
        { text: 'Liskov Substitution', link: '/architecture-patterns/solid-principles/liskov-substitution' },
        { text: 'Interface Segregation', link: '/architecture-patterns/solid-principles/interface-segregation' },
        { text: 'Dependency Inversion', link: '/architecture-patterns/solid-principles/dependency-inversion' },
      ],
    },
    {
      text: 'Functional Programming',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/functional-programming/' },
        { text: 'Core Concepts', link: '/architecture-patterns/functional-programming/core-concepts' },
        { text: 'Monads & Functors', link: '/architecture-patterns/functional-programming/monads-functors' },
        { text: 'FP in TypeScript', link: '/architecture-patterns/functional-programming/fp-typescript' },
      ],
    },
    {
      text: 'Multi-Tenancy',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/architecture-patterns/multi-tenancy/' },
        { text: 'Database Strategies', link: '/architecture-patterns/multi-tenancy/database-strategies' },
        { text: 'Noisy Neighbor', link: '/architecture-patterns/multi-tenancy/noisy-neighbor' },
      ],
    },
  ],

  '/infrastructure/': [
    {
      text: 'Infrastructure',
      items: [
        { text: 'Overview', link: '/infrastructure/' },
      ],
    },
    {
      text: 'Terraform',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/terraform/' },
        { text: 'Fundamentals', link: '/infrastructure/terraform/fundamentals' },
        { text: 'State Management', link: '/infrastructure/terraform/state-management' },
        { text: 'Modules', link: '/infrastructure/terraform/modules' },
        { text: 'Workspaces', link: '/infrastructure/terraform/workspaces' },
        { text: 'AWS Startup Stack', link: '/infrastructure/terraform/aws-startup-stack' },
        { text: 'GCP Startup Stack', link: '/infrastructure/terraform/gcp-startup-stack' },
        { text: 'Multi-Region', link: '/infrastructure/terraform/multi-region' },
        { text: 'Security Hardening', link: '/infrastructure/terraform/security-hardening' },
        { text: 'Cost Optimization', link: '/infrastructure/terraform/cost-optimization' },
      ],
    },
    {
      text: 'Kubernetes',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/kubernetes/' },
        { text: 'Architecture Internals', link: '/infrastructure/kubernetes/architecture-internals' },
        { text: 'Pod Lifecycle', link: '/infrastructure/kubernetes/pod-lifecycle' },
        { text: 'Deployments & StatefulSets', link: '/infrastructure/kubernetes/deployments-statefulsets' },
        { text: 'Services & Ingress', link: '/infrastructure/kubernetes/services-ingress' },
        { text: 'HPA, VPA & KEDA', link: '/infrastructure/kubernetes/hpa-vpa-keda' },
        { text: 'Network Policies', link: '/infrastructure/kubernetes/network-policies' },
        { text: 'RBAC', link: '/infrastructure/kubernetes/rbac' },
        { text: 'Secrets Management', link: '/infrastructure/kubernetes/secrets-management' },
        { text: 'Helm Charts', link: '/infrastructure/kubernetes/helm-charts' },
        { text: 'Operators', link: '/infrastructure/kubernetes/operators' },
        { text: 'Troubleshooting', link: '/infrastructure/kubernetes/troubleshooting' },
        { text: 'Production Checklist', link: '/infrastructure/kubernetes/production-checklist' },
        { text: 'CRDs & Operators', link: '/infrastructure/kubernetes/crds-operators' },
        { text: 'Admission Webhooks', link: '/infrastructure/kubernetes/admission-webhooks' },
        { text: 'CNI Plugins', link: '/infrastructure/kubernetes/cni-networking' },
        { text: 'GitOps (ArgoCD & Flux)', link: '/infrastructure/kubernetes/gitops' },
      ],
    },
    {
      text: 'Docker',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/docker/' },
        { text: 'Internals', link: '/infrastructure/docker/internals' },
        { text: 'Multi-Stage Builds', link: '/infrastructure/docker/multi-stage-builds' },
        { text: 'Security Hardening', link: '/infrastructure/docker/security-hardening' },
        { text: 'Production Dockerfiles', link: '/infrastructure/docker/production-dockerfiles' },
        { text: 'Compose Patterns', link: '/infrastructure/docker/compose-patterns' },
        { text: 'Image Optimization', link: '/infrastructure/docker/image-optimization' },
      ],
    },
    {
      text: 'AWS',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/aws/' },
        { text: 'VPC & Networking', link: '/infrastructure/aws/vpc-networking' },
        { text: 'ECS vs EKS', link: '/infrastructure/aws/ecs-vs-eks' },
        { text: 'RDS & Aurora', link: '/infrastructure/aws/rds-aurora' },
        { text: 'ElastiCache', link: '/infrastructure/aws/elasticache' },
        { text: 'S3 & CloudFront', link: '/infrastructure/aws/s3-cloudfront' },
        { text: 'Lambda', link: '/infrastructure/aws/lambda' },
        { text: 'IAM Deep Dive', link: '/infrastructure/aws/iam-deep-dive' },
        { text: 'Cost Optimization', link: '/infrastructure/aws/cost-optimization' },
        { text: 'Well-Architected', link: '/infrastructure/aws/well-architected' },
      ],
    },
    {
      text: 'GCP',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/gcp/' },
        { text: 'Cloud Run', link: '/infrastructure/gcp/cloud-run' },
        { text: 'GKE', link: '/infrastructure/gcp/gke' },
        { text: 'Cloud SQL', link: '/infrastructure/gcp/cloud-sql' },
        { text: 'Pub/Sub', link: '/infrastructure/gcp/pub-sub' },
        { text: 'IAM', link: '/infrastructure/gcp/iam' },
        { text: 'Cost Optimization', link: '/infrastructure/gcp/cost-optimization' },
      ],
    },
    {
      text: 'CI/CD',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/ci-cd/' },
        { text: 'GitHub Actions Deep Dive', link: '/infrastructure/ci-cd/github-actions-deep-dive' },
        { text: 'GitLab CI', link: '/infrastructure/ci-cd/gitlab-ci' },
        { text: 'Pipeline Patterns', link: '/infrastructure/ci-cd/pipeline-patterns' },
        { text: 'Artifact Management', link: '/infrastructure/ci-cd/artifact-management' },
        { text: 'Environment Promotion', link: '/infrastructure/ci-cd/environment-promotion' },
        { text: 'Security Scanning', link: '/infrastructure/ci-cd/security-scanning' },
      ],
    },
    {
      text: 'Multi-Region',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/multi-region/' },
        { text: 'Architecture Patterns', link: '/infrastructure/multi-region/architecture-patterns' },
        { text: 'Data Replication', link: '/infrastructure/multi-region/data-replication' },
        { text: 'Traffic Routing', link: '/infrastructure/multi-region/traffic-routing' },
        { text: 'Failover Strategies', link: '/infrastructure/multi-region/failover-strategies' },
        { text: 'Cost Analysis', link: '/infrastructure/multi-region/cost-analysis' },
      ],
    },
    {
      text: 'Nginx',
      collapsed: false,
      items: [
        { text: 'Nginx Deep Dive', link: '/infrastructure/nginx/' },
      ],
    },
    {
      text: 'Service Mesh',
      collapsed: false,
      items: [
        { text: 'Service Mesh Deep Dive', link: '/infrastructure/service-mesh/' },
      ],
    },
    {
      text: 'Observability',
      collapsed: false,
      items: [
        { text: 'Observability Deep Dive', link: '/infrastructure/observability/' },
        { text: 'OpenTelemetry', link: '/infrastructure/observability/opentelemetry' },
        { text: 'Observability Tools', link: '/devops/observability-tools/' },
      ],
    },
    {
      text: 'API Gateway',
      collapsed: false,
      items: [
        { text: 'API Gateway Deep Dive', link: '/infrastructure/api-gateway/' },
      ],
    },
    {
      text: 'Languages & Runtimes',
      collapsed: false,
      items: [
        { text: 'Node.js Internals', link: '/infrastructure/languages/nodejs-internals' },
        { text: 'Go Concurrency', link: '/infrastructure/languages/go-concurrency' },
        { text: 'Rust for Backend', link: '/infrastructure/languages/rust-for-backend' },
        { text: 'TypeScript Advanced', link: '/infrastructure/languages/typescript-advanced' },
        { text: 'TypeScript Patterns', link: '/infrastructure/languages/typescript-patterns' },
        { text: 'Deno & Bun', link: '/infrastructure/languages/deno-bun' },
        { text: 'Python Async', link: '/infrastructure/languages/python-async' },
        { text: 'Python Data Tools', link: '/infrastructure/languages/python-data-tools' },
        { text: 'Next.js Patterns', link: '/infrastructure/languages/nextjs-patterns' },
        { text: 'Fastify Deep Dive', link: '/infrastructure/languages/fastify-deep-dive' },
        { text: 'Tailwind Architecture', link: '/infrastructure/languages/tailwind-architecture' },
      ],
    },
    {
      text: 'Linux Internals',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/linux-internals/' },
        { text: 'Process Model', link: '/infrastructure/linux-internals/process-model' },
        { text: 'Memory Management', link: '/infrastructure/linux-internals/memory-management' },
        { text: 'Containers from Scratch', link: '/infrastructure/linux-internals/containers-from-scratch' },
        { text: 'eBPF', link: '/infrastructure/linux-internals/ebpf' },
      ],
    },
    {
      text: 'Storage Systems',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/storage/' },
        { text: 'Distributed Filesystems', link: '/infrastructure/storage/distributed-filesystems' },
      ],
    },
    {
      text: 'Platform Engineering',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/platform-engineering/' },
        { text: 'Backstage & Dev Portals', link: '/infrastructure/platform-engineering/backstage' },
        { text: 'Developer Experience', link: '/infrastructure/platform-engineering/developer-experience' },
      ],
    },
    {
      text: 'FinOps',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/finops/' },
        { text: 'Cost Optimization Playbook', link: '/infrastructure/finops/cost-optimization' },
        { text: 'Cost Allocation & Tagging', link: '/infrastructure/finops/cost-allocation' },
      ],
    },
    {
      text: 'Scheduling',
      collapsed: false,
      items: [
        { text: 'Cron Jobs', link: '/infrastructure/cron-jobs' },
      ],
    },
    {
      text: 'Cloudflare',
      collapsed: false,
      items: [
        { text: 'Cloudflare Complete Guide', link: '/infrastructure/cloudflare' },
      ],
    },
    {
      text: 'Cloud Comparison',
      collapsed: false,
      items: [
        { text: 'AWS vs GCP vs Azure', link: '/infrastructure/cloud-comparison' },
      ],
    },
    {
      text: 'AI Infrastructure',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/infrastructure/ai-infrastructure/' },
        { text: 'Model Serving', link: '/infrastructure/ai-infrastructure/model-serving' },
        { text: 'GPU & Kubernetes', link: '/infrastructure/ai-infrastructure/gpu-kubernetes' },
      ],
    },
  ],

  '/security/': [
    {
      text: 'Security',
      items: [
        { text: 'Overview', link: '/security/' },
      ],
    },
    {
      text: 'OWASP Top 10 (2021)',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/security/owasp/' },
        { text: 'A01: Broken Access Control', link: '/security/owasp/a01-broken-access-control' },
        { text: 'A02: Cryptographic Failures', link: '/security/owasp/a02-cryptographic-failures' },
        { text: 'A03: Injection', link: '/security/owasp/a03-injection' },
        { text: 'A04: Insecure Design', link: '/security/owasp/a04-insecure-design' },
        { text: 'A05: Security Misconfiguration', link: '/security/owasp/a05-security-misconfiguration' },
        { text: 'A06: Vulnerable Components', link: '/security/owasp/a06-vulnerable-components' },
        { text: 'A07: Auth Failures', link: '/security/owasp/a07-auth-failures' },
        { text: 'A08: Data Integrity Failures', link: '/security/owasp/a08-data-integrity-failures' },
        { text: 'A09: Logging & Monitoring', link: '/security/owasp/a09-logging-monitoring-failures' },
        { text: 'A10: SSRF', link: '/security/owasp/a10-ssrf' },
        { text: '2017 → 2021 Mapping', link: '/security/owasp/2017-to-2021-mapping' },
      ],
    },
    {
      text: 'Authentication',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/security/authentication/' },
        { text: 'JWT Deep Dive', link: '/security/authentication/jwt-deep-dive' },
        { text: 'OAuth2 & OIDC', link: '/security/authentication/oauth2-oidc' },
        { text: 'Session Management', link: '/security/authentication/session-management' },
        { text: 'MFA Implementation', link: '/security/authentication/mfa-implementation' },
        { text: 'Passwordless', link: '/security/authentication/passwordless' },
        { text: 'API Key Design', link: '/security/authentication/api-key-design' },
        { text: 'Biometric Auth', link: '/security/authentication/biometric-auth' },
        { text: 'Auth Architecture', link: '/security/authentication/auth-architecture' },
        { text: 'Token Strategies', link: '/security/authentication/token-strategies' },
        { text: 'OAuth 2.0 Flows', link: '/security/authentication/oauth2-flows' },
        { text: 'Session Deep Dive', link: '/security/authentication/session-deep-dive' },
        { text: 'Account Sharing Prevention', link: '/security/authentication/account-sharing-prevention' },
        { text: 'Enterprise SSO', link: '/security/authentication/enterprise-sso' },
        { text: 'Passkeys & WebAuthn', link: '/security/authentication/passkeys-webauthn' },
        { text: 'MFA Deep Dive', link: '/security/authentication/mfa-deep-dive' },
        { text: 'Auth Providers', link: '/security/authentication/auth-providers' },
        { text: 'Device Trust & Risk', link: '/security/authentication/device-trust' },
        { text: 'Auth Attacks & Defense', link: '/security/authentication/auth-attack-defense' },
      ],
    },
    {
      text: 'Encryption',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/security/encryption/' },
        { text: 'Symmetric vs Asymmetric', link: '/security/encryption/symmetric-vs-asymmetric' },
        { text: 'Hashing Algorithms', link: '/security/encryption/hashing-algorithms' },
        { text: 'Encryption at Rest', link: '/security/encryption/encryption-at-rest' },
        { text: 'Encryption in Transit', link: '/security/encryption/encryption-in-transit' },
        { text: 'Key Management', link: '/security/encryption/key-management' },
        { text: 'Envelope Encryption', link: '/security/encryption/envelope-encryption' },
        { text: 'Cryptography for Engineers', link: '/security/encryption/cryptography-for-engineers' },
      ],
    },
    {
      text: 'Secrets Management',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/security/secrets-management/' },
        { text: 'Vault Deep Dive', link: '/security/secrets-management/vault-deep-dive' },
        { text: 'AWS Secrets Manager', link: '/security/secrets-management/aws-secrets-manager' },
        { text: 'Rotation Automation', link: '/security/secrets-management/rotation-automation' },
        { text: 'Secrets in CI/CD', link: '/security/secrets-management/secrets-in-ci-cd' },
      ],
    },
    {
      text: 'Zero Trust',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/security/zero-trust/' },
        { text: 'Principles', link: '/security/zero-trust/principles' },
        { text: 'Identity Verification', link: '/security/zero-trust/identity-verification' },
        { text: 'Network Segmentation', link: '/security/zero-trust/network-segmentation' },
        { text: 'Least Privilege', link: '/security/zero-trust/least-privilege' },
        { text: 'Continuous Verification', link: '/security/zero-trust/continuous-verification' },
      ],
    },
    {
      text: 'API Security',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/security/api-security/' },
        { text: 'Rate Limiting', link: '/security/api-security/rate-limiting' },
        { text: 'Request Signing', link: '/security/api-security/request-signing' },
        { text: 'Input Validation', link: '/security/api-security/input-validation' },
        { text: 'CORS Deep Dive', link: '/security/api-security/cors-deep-dive' },
        { text: 'CSP Headers', link: '/security/api-security/csp-headers' },
        { text: 'API Abuse Prevention', link: '/security/api-security/api-abuse-prevention' },
        { text: 'Advanced Rate Limiting', link: '/security/api-security/advanced-rate-limiting' },
      ],
    },
    {
      text: 'Compliance',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/security/compliance/' },
        { text: 'GDPR Engineering', link: '/security/compliance/gdpr-engineering' },
        { text: 'SOC 2', link: '/security/compliance/soc2' },
        { text: 'PCI DSS', link: '/security/compliance/pci-dss' },
        { text: 'Audit Logging', link: '/security/compliance/audit-logging' },
      ],
    },
    {
      text: 'Authorization',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/security/authorization/' },
        { text: 'RBAC vs ABAC vs ReBAC', link: '/security/authorization/rbac-abac-rebac' },
        { text: 'Google Zanzibar', link: '/security/authorization/zanzibar' },
        { text: 'Policy Engines (OPA & Cedar)', link: '/security/authorization/policy-engines' },
      ],
    },
    {
      text: 'Exploits & Vulnerabilities',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/security/exploits/' },
        { text: 'XZ Utils Backdoor (2024)', link: '/security/exploits/xz-backdoor-2024' },
        { text: 'Log4Shell', link: '/security/exploits/log4shell' },
        { text: 'SolarWinds Attack', link: '/security/exploits/solarwinds' },
        { text: 'Heartbleed', link: '/security/exploits/heartbleed' },
        { text: 'Spectre & Meltdown', link: '/security/exploits/spectre-meltdown' },
        { text: 'Dirty Pipe & Kernel Exploits', link: '/security/exploits/dirty-pipe' },
        { text: 'Container Escapes', link: '/security/exploits/container-escapes' },
        { text: 'Advanced Injection', link: '/security/exploits/injection-advanced' },
        { text: 'Advanced XSS', link: '/security/exploits/xss-advanced' },
        { text: 'Cloud Misconfigurations', link: '/security/exploits/cloud-misconfigs' },
        { text: 'Cryptographic Attacks', link: '/security/exploits/crypto-attacks' },
      ],
    },
    {
      text: 'Supply Chain Security',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/security/supply-chain/' },
      ],
    },
    {
      text: 'Email Security',
      collapsed: false,
      items: [
        { text: 'Email Security & Deliverability', link: '/security/email-security' },
      ],
    },
  ],

  '/devops/': [
    {
      text: 'DevOps',
      items: [
        { text: 'Overview', link: '/devops/' },
      ],
    },
    {
      text: 'Monitoring',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/monitoring/' },
        { text: 'Prometheus Deep Dive', link: '/devops/monitoring/prometheus-deep-dive' },
        { text: 'Grafana Dashboards', link: '/devops/monitoring/grafana-dashboards' },
        { text: 'Metrics Design', link: '/devops/monitoring/metrics-design' },
        { text: 'Custom Metrics', link: '/devops/monitoring/custom-metrics' },
        { text: 'Monitoring Anti-Patterns', link: '/devops/monitoring/monitoring-antipatterns' },
      ],
    },
    {
      text: 'Logging',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/logging/' },
        { text: 'Structured Logging', link: '/devops/logging/structured-logging' },
        { text: 'Correlation IDs', link: '/devops/logging/correlation-ids' },
        { text: 'Log Aggregation', link: '/devops/logging/log-aggregation' },
        { text: 'Log Levels Strategy', link: '/devops/logging/log-levels-strategy' },
        { text: 'Sensitive Data Redaction', link: '/devops/logging/sensitive-data-redaction' },
      ],
    },
    {
      text: 'Alerting',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/alerting/' },
        { text: 'Alert Design', link: '/devops/alerting/alert-design' },
        { text: 'Severity Levels', link: '/devops/alerting/severity-levels' },
        { text: 'Escalation Policies', link: '/devops/alerting/escalation-policies' },
        { text: 'On-Call Best Practices', link: '/devops/alerting/on-call-best-practices' },
        { text: 'Runbook Templates', link: '/devops/alerting/runbook-templates' },
      ],
    },
    {
      text: 'Deployment Strategies',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/deployment-strategies/' },
        { text: 'Blue-Green', link: '/devops/deployment-strategies/blue-green' },
        { text: 'Canary', link: '/devops/deployment-strategies/canary' },
        { text: 'Rolling Updates', link: '/devops/deployment-strategies/rolling-updates' },
        { text: 'Feature Flags Deployment', link: '/devops/deployment-strategies/feature-flags-deployment' },
        { text: 'Database Migrations', link: '/devops/deployment-strategies/database-migrations' },
        { text: 'Rollback Procedures', link: '/devops/deployment-strategies/rollback-procedures' },
      ],
    },
    {
      text: 'Deployment Guides',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/deployment-guides/' },
        { text: 'Deploy Node.js', link: '/devops/deployment-guides/deploy-nodejs' },
        { text: 'Deploy Next.js', link: '/devops/deployment-guides/deploy-nextjs' },
      ],
    },
    {
      text: 'Incident Response',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/incident-response/' },
        { text: 'Incident Classification', link: '/devops/incident-response/incident-classification' },
        { text: 'Communication Templates', link: '/devops/incident-response/communication-templates' },
        { text: 'Postmortem Framework', link: '/devops/incident-response/postmortem-framework' },
        { text: 'War Room Procedures', link: '/devops/incident-response/war-room-procedures' },
        { text: 'Chaos Engineering', link: '/devops/incident-response/chaos-engineering' },
      ],
    },
    {
      text: 'Git',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/git/' },
        { text: 'Git Internals', link: '/devops/git/internals' },
        { text: 'Branching Strategies', link: '/devops/git/branching-strategies' },
        { text: 'Monorepo Management', link: '/devops/git/monorepo' },
      ],
    },
    {
      text: 'Engineering Practices',
      collapsed: false,
      items: [
        { text: 'Technical Writing', link: '/devops/engineering-practices/technical-writing' },
        { text: 'Code Review', link: '/devops/engineering-practices/code-review' },
        { text: 'ADRs', link: '/devops/engineering-practices/architecture-decision-records' },
        { text: 'On-Call Handbook', link: '/devops/engineering-practices/on-call-handbook' },
        { text: 'Open Source', link: '/devops/engineering-practices/open-source' },
        { text: 'Tech Debt', link: '/devops/engineering-practices/tech-debt' },
        { text: 'Postmortem Template', link: '/devops/engineering-practices/postmortem-template' },
        { text: 'Technical Leadership', link: '/devops/engineering-practices/technical-leadership' },
        { text: 'Hiring & Interviewing', link: '/devops/engineering-practices/hiring-interviewing' },
        { text: 'RFC Template', link: '/devops/engineering-practices/rfc-template' },
        { text: 'Design Doc Template', link: '/devops/engineering-practices/design-doc-template' },
      ],
    },
    {
      text: 'SRE',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/sre/' },
        { text: 'Error Budgets', link: '/devops/sre/error-budgets' },
        { text: 'Toil Reduction', link: '/devops/sre/toil-reduction' },
        { text: 'Capacity Planning', link: '/devops/sre/capacity-planning' },
        { text: 'SLI / SLO / SLA', link: '/devops/sre/sli-slo-sla' },
      ],
    },
    {
      text: 'Migrations',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/migrations/' },
        { text: 'Database Schema Migrations', link: '/devops/migrations/database-schema' },
        { text: 'Monolith to Microservices', link: '/devops/migrations/monolith-to-microservices' },
        { text: 'Cloud Migration Playbook', link: '/devops/migrations/cloud-migration' },
      ],
    },
    {
      text: 'Production Checklists',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/checklists/' },
        { text: 'Pre-Launch Checklist', link: '/devops/checklists/pre-launch' },
        { text: 'Security Review', link: '/devops/checklists/security-review' },
        { text: 'Performance Review', link: '/devops/checklists/performance-review' },
        { text: 'Observability Readiness', link: '/devops/checklists/observability-readiness' },
      ],
    },
    {
      text: 'Runbooks',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/devops/runbooks/' },
        { text: 'Database Failover', link: '/devops/runbooks/database-failover' },
        { text: 'Service Degradation', link: '/devops/runbooks/service-degradation' },
        { text: 'Certificate Rotation', link: '/devops/runbooks/certificate-rotation' },
        { text: 'DDoS Response', link: '/devops/runbooks/ddos-response' },
      ],
    },
    {
      text: 'Disaster Recovery',
      collapsed: false,
      items: [
        { text: 'Disaster Recovery', link: '/devops/disaster-recovery/' },
      ],
    },
    {
      text: 'Scheduling & Cron',
      collapsed: false,
      items: [
        { text: 'Cron Patterns & Reliability', link: '/devops/cron-patterns' },
      ],
    },
    {
      text: 'Release & Debugging',
      collapsed: false,
      items: [
        { text: 'Release Engineering', link: '/devops/release-engineering' },
        { text: 'Debugging in Production', link: '/devops/debugging-production' },
        { text: 'Feature Flags', link: '/devops/feature-flags' },
      ],
    },
  ],

  '/performance/': [
    {
      text: 'Performance',
      items: [
        { text: 'Overview', link: '/performance/' },
      ],
    },
    {
      text: 'Profiling',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/performance/profiling/' },
        { text: 'Node.js Profiling', link: '/performance/profiling/nodejs-profiling' },
        { text: 'Go Profiling', link: '/performance/profiling/go-profiling' },
        { text: 'Browser Profiling', link: '/performance/profiling/browser-profiling' },
        { text: 'Database Profiling', link: '/performance/profiling/database-profiling' },
        { text: 'Continuous Profiling', link: '/performance/profiling/continuous-profiling' },
      ],
    },
    {
      text: 'Optimization',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/performance/optimization/' },
        { text: 'Node.js Event Loop', link: '/performance/optimization/nodejs-event-loop' },
        { text: 'Memory Management', link: '/performance/optimization/memory-management' },
        { text: 'V8 Optimization', link: '/performance/optimization/v8-optimization' },
        { text: 'Algorithmic Optimization', link: '/performance/optimization/algorithmic-optimization' },
        { text: 'Concurrency Patterns', link: '/performance/optimization/concurrency-patterns' },
        { text: 'Worker Threads', link: '/performance/optimization/worker-threads' },
      ],
    },
    {
      text: 'Caching Strategies',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/performance/caching-strategies/' },
        { text: 'Application Level', link: '/performance/caching-strategies/application-level' },
        { text: 'Database Level', link: '/performance/caching-strategies/database-level' },
        { text: 'HTTP Caching', link: '/performance/caching-strategies/http-caching' },
        { text: 'Edge Caching', link: '/performance/caching-strategies/edge-caching' },
      ],
    },
    {
      text: 'Database Tuning',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/performance/database-tuning/' },
        { text: 'Query Optimization', link: '/performance/database-tuning/query-optimization' },
        { text: 'Index Strategy', link: '/performance/database-tuning/index-strategy' },
        { text: 'Connection Pool Tuning', link: '/performance/database-tuning/connection-pool-tuning' },
        { text: 'N+1 Problem', link: '/performance/database-tuning/n-plus-one' },
        { text: 'Vacuum & Analyze', link: '/performance/database-tuning/vacuum-analyze' },
      ],
    },
    {
      text: 'Edge Computing',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/performance/edge-computing/' },
        { text: 'Edge Runtime Constraints', link: '/performance/edge-computing/edge-runtime-constraints' },
        { text: 'Cloudflare Workers', link: '/performance/edge-computing/cloudflare-workers' },
        { text: 'Deno Deploy', link: '/performance/edge-computing/deno-deploy' },
        { text: 'Vercel Edge', link: '/performance/edge-computing/vercel-edge' },
      ],
    },
    {
      text: 'Load Testing',
      collapsed: false,
      items: [
        { text: 'Load Testing Deep Dive', link: '/performance/load-testing/' },
      ],
    },
    {
      text: 'Internals',
      collapsed: false,
      items: [
        { text: 'Compilers & Interpreters', link: '/performance/compiler-interpreters' },
      ],
    },
    {
      text: 'Benchmarks',
      collapsed: false,
      items: [
        { text: 'Benchmarks', link: '/performance/benchmarks' },
      ],
    },
  ],

  '/data-engineering/': [
    {
      text: 'Data Engineering',
      items: [
        { text: 'Overview', link: '/data-engineering/' },
      ],
    },
    {
      text: 'ETL Patterns',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/data-engineering/etl-patterns/' },
        { text: 'ETL vs ELT', link: '/data-engineering/etl-patterns/etl-vs-elt' },
        { text: 'Batch Processing', link: '/data-engineering/etl-patterns/batch-processing' },
        { text: 'Incremental Loads', link: '/data-engineering/etl-patterns/incremental-loads' },
        { text: 'Idempotent Pipelines', link: '/data-engineering/etl-patterns/idempotent-pipelines' },
        { text: 'Error Handling', link: '/data-engineering/etl-patterns/error-handling' },
      ],
    },
    {
      text: 'Stream Processing',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/data-engineering/stream-processing/' },
        { text: 'Windowing', link: '/data-engineering/stream-processing/windowing' },
        { text: 'Watermarks', link: '/data-engineering/stream-processing/watermarks' },
        { text: 'Exactly-Once Processing', link: '/data-engineering/stream-processing/exactly-once-processing' },
        { text: 'State Management', link: '/data-engineering/stream-processing/state-management' },
        { text: 'Backpressure', link: '/data-engineering/stream-processing/backpressure' },
      ],
    },
    {
      text: 'Data Modeling',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/data-engineering/data-modeling/' },
        { text: 'Dimensional Modeling', link: '/data-engineering/data-modeling/dimensional-modeling' },
        { text: 'Data Vault', link: '/data-engineering/data-modeling/data-vault' },
        { text: 'Slowly Changing Dimensions', link: '/data-engineering/data-modeling/slowly-changing-dimensions' },
        { text: 'Normalization & Denormalization', link: '/data-engineering/data-modeling/normalization-denormalization' },
        { text: 'Schema Evolution', link: '/data-engineering/data-modeling/schema-evolution' },
      ],
    },
    {
      text: 'Pipeline Patterns',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/data-engineering/pipeline-patterns/' },
        { text: 'CDC Patterns', link: '/data-engineering/pipeline-patterns/cdc-patterns' },
        { text: 'Data Quality Checks', link: '/data-engineering/pipeline-patterns/data-quality-checks' },
        { text: 'Data Lineage', link: '/data-engineering/pipeline-patterns/data-lineage' },
        { text: 'Orchestration', link: '/data-engineering/pipeline-patterns/orchestration' },
        { text: 'Testing Data Pipelines', link: '/data-engineering/pipeline-patterns/testing-data-pipelines' },
      ],
    },
    {
      text: 'Lakehouse',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/data-engineering/lakehouse/' },
        { text: 'Open Table Formats', link: '/data-engineering/lakehouse/table-formats' },
        { text: 'Medallion Architecture', link: '/data-engineering/lakehouse/medallion-architecture' },
        { text: 'Query Engines', link: '/data-engineering/lakehouse/query-engines' },
      ],
    },
    {
      text: 'Real-Time Analytics',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/data-engineering/real-time-analytics/' },
        { text: 'ClickHouse vs Druid vs Pinot', link: '/data-engineering/real-time-analytics/clickhouse-vs-druid-vs-pinot' },
      ],
    },
  ],

  '/prompt-engineering/': [
    {
      text: 'Prompt Engineering',
      items: [
        { text: 'Overview', link: '/prompt-engineering/' },
      ],
    },
    {
      text: 'Engineering Prompts',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/prompt-engineering/engineering-prompts/' },
        { text: 'Debugging Prompts', link: '/prompt-engineering/engineering-prompts/debugging-prompts' },
        { text: 'Architecture Review', link: '/prompt-engineering/engineering-prompts/architecture-review-prompts' },
        { text: 'Code Generation', link: '/prompt-engineering/engineering-prompts/code-generation-prompts' },
        { text: 'Refactoring', link: '/prompt-engineering/engineering-prompts/refactoring-prompts' },
        { text: 'Testing', link: '/prompt-engineering/engineering-prompts/testing-prompts' },
      ],
    },
    {
      text: 'Product Prompts',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/prompt-engineering/product-prompts/' },
        { text: 'PRD Prompts', link: '/prompt-engineering/product-prompts/prd-prompts' },
        { text: 'User Story Prompts', link: '/prompt-engineering/product-prompts/user-story-prompts' },
        { text: 'Competitive Analysis', link: '/prompt-engineering/product-prompts/competitive-analysis-prompts' },
        { text: 'Go-to-Market', link: '/prompt-engineering/product-prompts/go-to-market-prompts' },
      ],
    },
    {
      text: 'UI Prompts',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/prompt-engineering/ui-prompts/' },
        { text: 'Component Generation', link: '/prompt-engineering/ui-prompts/component-generation-prompts' },
        { text: 'Design System', link: '/prompt-engineering/ui-prompts/design-system-prompts' },
        { text: 'Accessibility', link: '/prompt-engineering/ui-prompts/accessibility-prompts' },
        { text: 'Responsive Design', link: '/prompt-engineering/ui-prompts/responsive-design-prompts' },
      ],
    },
    {
      text: 'Architecture Prompts',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/prompt-engineering/architecture-prompts/' },
        { text: 'System Design', link: '/prompt-engineering/architecture-prompts/system-design-prompts' },
        { text: 'Scaling', link: '/prompt-engineering/architecture-prompts/scaling-prompts' },
        { text: 'Migration', link: '/prompt-engineering/architecture-prompts/migration-prompts' },
        { text: 'Cost Optimization', link: '/prompt-engineering/architecture-prompts/cost-optimization-prompts' },
      ],
    },
  ],

  '/ui-design-systems/': [
    {
      text: 'UI & Design Systems',
      items: [
        { text: 'Overview', link: '/ui-design-systems/' },
      ],
    },
    {
      text: 'Component Patterns',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/ui-design-systems/component-patterns/' },
        { text: 'Atomic Design', link: '/ui-design-systems/component-patterns/atomic-design' },
        { text: 'Compound Components', link: '/ui-design-systems/component-patterns/compound-components' },
        { text: 'Render Props & Hooks', link: '/ui-design-systems/component-patterns/render-props-hooks' },
        { text: 'Controlled vs Uncontrolled', link: '/ui-design-systems/component-patterns/controlled-uncontrolled' },
        { text: 'Polymorphic Components', link: '/ui-design-systems/component-patterns/polymorphic-components' },
        { text: 'Slot Pattern', link: '/ui-design-systems/component-patterns/slot-pattern' },
        { text: 'Headless Components', link: '/ui-design-systems/component-patterns/headless-components' },
      ],
    },
    {
      text: 'Typography',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/ui-design-systems/typography/' },
        { text: 'Type Scale', link: '/ui-design-systems/typography/type-scale' },
        { text: 'Font Loading', link: '/ui-design-systems/typography/font-loading' },
        { text: 'Variable Fonts', link: '/ui-design-systems/typography/variable-fonts' },
        { text: 'Responsive Typography', link: '/ui-design-systems/typography/responsive-typography' },
      ],
    },
    {
      text: 'Color Tokens',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/ui-design-systems/color-tokens/' },
        { text: 'Color Theory', link: '/ui-design-systems/color-tokens/color-theory' },
        { text: 'Semantic Tokens', link: '/ui-design-systems/color-tokens/semantic-tokens' },
        { text: 'Palette Generation', link: '/ui-design-systems/color-tokens/palette-generation' },
        { text: 'Contrast & Accessibility', link: '/ui-design-systems/color-tokens/contrast-accessibility' },
      ],
    },
    {
      text: 'Spacing & Layout',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/ui-design-systems/spacing-layout/' },
        { text: 'Spacing Scale', link: '/ui-design-systems/spacing-layout/spacing-scale' },
        { text: 'Layout Patterns', link: '/ui-design-systems/spacing-layout/layout-patterns' },
        { text: 'Responsive Breakpoints', link: '/ui-design-systems/spacing-layout/responsive-breakpoints' },
        { text: 'Container Queries', link: '/ui-design-systems/spacing-layout/container-queries' },
      ],
    },
    {
      text: 'Accessibility',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/ui-design-systems/accessibility/' },
        { text: 'ARIA Deep Dive', link: '/ui-design-systems/accessibility/aria-deep-dive' },
        { text: 'Keyboard Navigation', link: '/ui-design-systems/accessibility/keyboard-navigation' },
        { text: 'Screen Reader Patterns', link: '/ui-design-systems/accessibility/screen-reader-patterns' },
        { text: 'Focus Management', link: '/ui-design-systems/accessibility/focus-management' },
        { text: 'Testing Accessibility', link: '/ui-design-systems/accessibility/testing-accessibility' },
        { text: 'WCAG Compliance', link: '/ui-design-systems/accessibility/wcag-compliance' },
      ],
    },
    {
      text: 'Dark Mode',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/ui-design-systems/dark-mode/' },
        { text: 'Token Mapping', link: '/ui-design-systems/dark-mode/token-mapping' },
        { text: 'Implementation Patterns', link: '/ui-design-systems/dark-mode/implementation-patterns' },
        { text: 'Image Handling', link: '/ui-design-systems/dark-mode/image-handling' },
        { text: 'System Preference Detection', link: '/ui-design-systems/dark-mode/system-preference-detection' },
      ],
    },
    {
      text: 'Animations',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/ui-design-systems/animations/' },
        { text: 'Timing Curves', link: '/ui-design-systems/animations/timing-curves' },
        { text: 'Motion Principles', link: '/ui-design-systems/animations/motion-principles' },
        { text: 'CSS Animations', link: '/ui-design-systems/animations/css-animations' },
        { text: 'Framer Motion Patterns', link: '/ui-design-systems/animations/framer-motion-patterns' },
        { text: 'Gesture Animations', link: '/ui-design-systems/animations/gesture-animations' },
        { text: 'Performance', link: '/ui-design-systems/animations/performance-considerations' },
      ],
    },
  ],

  '/production-blueprints/': [
    {
      text: 'Production Blueprints',
      items: [
        { text: 'Overview', link: '/production-blueprints/' },
      ],
    },
    {
      text: 'Auth Service',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/production-blueprints/auth-service/' },
        { text: 'Architecture', link: '/production-blueprints/auth-service/architecture' },
        { text: 'API Contracts', link: '/production-blueprints/auth-service/api-contracts' },
        { text: 'Database Schema', link: '/production-blueprints/auth-service/database-schema' },
        { text: 'Deployment', link: '/production-blueprints/auth-service/deployment' },
        { text: 'Scaling Plan', link: '/production-blueprints/auth-service/scaling-plan' },
      ],
    },
    {
      text: 'Billing Engine',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/production-blueprints/billing-engine/' },
        { text: 'Architecture', link: '/production-blueprints/billing-engine/architecture' },
        { text: 'Stripe Integration', link: '/production-blueprints/billing-engine/stripe-integration' },
        { text: 'Subscription Models', link: '/production-blueprints/billing-engine/subscription-models' },
        { text: 'Webhook Handling', link: '/production-blueprints/billing-engine/webhook-handling' },
        { text: 'Idempotency', link: '/production-blueprints/billing-engine/idempotency' },
      ],
    },
    {
      text: 'Notification Service',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/production-blueprints/notification-service/' },
        { text: 'Architecture', link: '/production-blueprints/notification-service/architecture' },
        { text: 'Channel Adapters', link: '/production-blueprints/notification-service/channel-adapters' },
        { text: 'Template Engine', link: '/production-blueprints/notification-service/template-engine' },
        { text: 'Rate Limiting', link: '/production-blueprints/notification-service/rate-limiting' },
        { text: 'Delivery Tracking', link: '/production-blueprints/notification-service/delivery-tracking' },
      ],
    },
    {
      text: 'Realtime Pipeline',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/production-blueprints/realtime-pipeline/' },
        { text: 'Architecture', link: '/production-blueprints/realtime-pipeline/architecture' },
        { text: 'Ingestion Layer', link: '/production-blueprints/realtime-pipeline/ingestion-layer' },
        { text: 'Processing Layer', link: '/production-blueprints/realtime-pipeline/processing-layer' },
        { text: 'Storage Layer', link: '/production-blueprints/realtime-pipeline/storage-layer' },
        { text: 'Query Layer', link: '/production-blueprints/realtime-pipeline/query-layer' },
      ],
    },
    {
      text: 'Rate Limiter',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/production-blueprints/rate-limiter/' },
        { text: 'Algorithms', link: '/production-blueprints/rate-limiter/algorithms' },
        { text: 'Distributed Rate Limiting', link: '/production-blueprints/rate-limiter/distributed-rate-limiting' },
        { text: 'Redis Implementation', link: '/production-blueprints/rate-limiter/redis-implementation' },
        { text: 'API Design', link: '/production-blueprints/rate-limiter/api-design' },
      ],
    },
    {
      text: 'Job Queue',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/production-blueprints/job-queue/' },
        { text: 'Architecture', link: '/production-blueprints/job-queue/architecture' },
        { text: 'Worker Patterns', link: '/production-blueprints/job-queue/worker-patterns' },
        { text: 'Retry Strategies', link: '/production-blueprints/job-queue/retry-strategies' },
        { text: 'Priority Queues', link: '/production-blueprints/job-queue/priority-queues' },
        { text: 'Monitoring', link: '/production-blueprints/job-queue/monitoring' },
      ],
    },
    {
      text: 'A/B Testing',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/production-blueprints/ab-testing/' },
        { text: 'Architecture', link: '/production-blueprints/ab-testing/architecture' },
        { text: 'Statistical Significance', link: '/production-blueprints/ab-testing/statistical-significance' },
        { text: 'Feature Flag Integration', link: '/production-blueprints/ab-testing/feature-flag-integration' },
        { text: 'Assignment Algorithms', link: '/production-blueprints/ab-testing/assignment-algorithms' },
        { text: 'Analysis Pipeline', link: '/production-blueprints/ab-testing/analysis-pipeline' },
      ],
    },
    {
      text: 'Analytics Pipeline',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/production-blueprints/analytics-pipeline/' },
        { text: 'Architecture', link: '/production-blueprints/analytics-pipeline/architecture' },
        { text: 'Event Schema', link: '/production-blueprints/analytics-pipeline/event-schema' },
        { text: 'Ingestion', link: '/production-blueprints/analytics-pipeline/ingestion' },
        { text: 'ClickHouse Storage', link: '/production-blueprints/analytics-pipeline/storage-clickhouse' },
        { text: 'Query Engine', link: '/production-blueprints/analytics-pipeline/query-engine' },
      ],
    },
    {
      text: 'Search Service',
      collapsed: false,
      items: [
        { text: 'Search Service', link: '/production-blueprints/search-service/' },
      ],
    },
    {
      text: 'Feature Flag Service',
      collapsed: false,
      items: [
        { text: 'Feature Flag Service', link: '/production-blueprints/feature-flag-service/' },
      ],
    },
    {
      text: 'Chat Service',
      collapsed: false,
      items: [
        { text: 'Chat Service', link: '/production-blueprints/chat-service/' },
      ],
    },
    {
      text: 'File Storage',
      collapsed: false,
      items: [
        { text: 'File Storage Service', link: '/production-blueprints/file-storage/' },
      ],
    },
    {
      text: 'Audit Log',
      collapsed: false,
      items: [
        { text: 'Audit Log Service', link: '/production-blueprints/audit-log/' },
      ],
    },
    {
      text: 'Config Service',
      collapsed: false,
      items: [
        { text: 'Config Service', link: '/production-blueprints/config-service/' },
      ],
    },
    {
      text: 'Payment Engineering',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/production-blueprints/payment-engineering/' },
        { text: 'Ledger Design', link: '/production-blueprints/payment-engineering/ledger-design' },
        { text: 'Reconciliation', link: '/production-blueprints/payment-engineering/reconciliation' },
      ],
    },
    {
      text: 'Email Service',
      collapsed: false,
      items: [
        { text: 'Email Service', link: '/production-blueprints/email-service/' },
      ],
    },
    {
      text: 'Scheduler Service',
      collapsed: false,
      items: [
        { text: 'Scheduler Service', link: '/production-blueprints/scheduler-service/' },
      ],
    },
  ],

  '/war-room/': [
    {
      text: 'War Room',
      items: [
        { text: 'Overview', link: '/war-room/' },
      ],
    },
    {
      text: 'Database & Data Incidents',
      collapsed: false,
      items: [
        { text: 'GitHub 24-Hour Outage (2018)', link: '/war-room/github-october-2018' },
        { text: 'GitLab Database Deletion (2017)', link: '/war-room/gitlab-database-2017' },
      ],
    },
    {
      text: 'Networking & Infrastructure',
      collapsed: false,
      items: [
        { text: 'Facebook 6-Hour Outage (2021)', link: '/war-room/facebook-october-2021' },
        { text: 'AWS S3 Outage (2017)', link: '/war-room/amazon-s3-2017' },
      ],
    },
    {
      text: 'Deployment & Release',
      collapsed: false,
      items: [
        { text: 'Knight Capital $440M Bug (2012)', link: '/war-room/knight-capital-2012' },
        { text: 'CrowdStrike Global BSOD (2024)', link: '/war-room/crowdstrike-july-2024' },
        { text: 'Cloudflare Regex Outage (2019)', link: '/war-room/cloudflare-regex-2019' },
      ],
    },
    {
      text: 'Supply Chain Attacks',
      collapsed: false,
      items: [
        { text: 'Axios Supply Chain Attack (2026)', link: '/war-room/axios-supply-chain-2026' },
        { text: 'LiteLLM Supply Chain Attack (2026)', link: '/war-room/litellm-supply-chain-2026' },
      ],
    },
    {
      text: 'Scaling & Migration',
      collapsed: false,
      items: [
        { text: 'Twitter Fail Whale & JVM Migration', link: '/war-room/twitter-fail-whale' },
        { text: 'Discord Trillion Message Migration', link: '/war-room/discord-message-storage' },
        { text: 'Stripe 3-Year Ruby Migration', link: '/war-room/stripe-ruby-upgrade' },
      ],
    },
    {
      text: 'Resilience & Culture',
      collapsed: false,
      items: [
        { text: 'Netflix Chaos Engineering Origins', link: '/war-room/netflix-chaos-engineering' },
      ],
    },
  ],

  '/system-design-interviews/': [
    {
      text: 'System Design Interviews',
      items: [
        { text: 'Overview & Framework', link: '/system-design-interviews/' },
      ],
    },
    {
      text: 'Social & Communication',
      collapsed: false,
      items: [
        { text: 'Design Instagram', link: '/system-design-interviews/instagram' },
        { text: 'Design Twitter/X', link: '/system-design-interviews/twitter-feed' },
        { text: 'Design WhatsApp', link: '/system-design-interviews/chat-system' },
        { text: 'Design Facebook', link: '/system-design-interviews/social-network' },
        { text: 'Design Tinder', link: '/system-design-interviews/tinder' },
        { text: 'Design Notification System', link: '/system-design-interviews/notification-system' },
        { text: 'Design Email Service', link: '/system-design-interviews/email-service' },
      ],
    },
    {
      text: 'Media & Streaming',
      collapsed: false,
      items: [
        { text: 'Design YouTube', link: '/system-design-interviews/youtube' },
        { text: 'Design Netflix', link: '/system-design-interviews/netflix' },
        { text: 'Design Spotify', link: '/system-design-interviews/spotify' },
        { text: 'Design News Aggregator', link: '/system-design-interviews/news-aggregator' },
        { text: 'Design Live Streaming', link: '/system-design-interviews/live-streaming' },
      ],
    },
    {
      text: 'Marketplace & Commerce',
      collapsed: false,
      items: [
        { text: 'Design Uber', link: '/system-design-interviews/uber' },
        { text: 'Design Food Delivery', link: '/system-design-interviews/food-delivery' },
        { text: 'Design E-Commerce', link: '/system-design-interviews/e-commerce' },
        { text: 'Design Hotel Booking', link: '/system-design-interviews/hotel-booking' },
        { text: 'Design Ticket Booking', link: '/system-design-interviews/ticket-booking' },
        { text: 'Design Payment System', link: '/system-design-interviews/payment-system' },
        { text: 'Design Parking Lot', link: '/system-design-interviews/parking-lot' },
      ],
    },
    {
      text: 'Infrastructure & Tools',
      collapsed: false,
      items: [
        { text: 'Design URL Shortener', link: '/system-design-interviews/url-shortener' },
        { text: 'Design Dropbox', link: '/system-design-interviews/dropbox' },
        { text: 'Design Web Crawler', link: '/system-design-interviews/web-crawler' },
        { text: 'Design Search Engine', link: '/system-design-interviews/search-engine' },
        { text: 'Design Autocomplete', link: '/system-design-interviews/search-autocomplete' },
        { text: 'Design Twitter Search', link: '/system-design-interviews/twitter-search' },
        { text: 'Design Typeahead', link: '/system-design-interviews/typeahead' },
        { text: 'Design Google Maps', link: '/system-design-interviews/google-maps' },
      ],
    },
    {
      text: 'Core Systems',
      collapsed: false,
      items: [
        { text: 'Design Rate Limiter', link: '/system-design-interviews/rate-limiter' },
        { text: 'Design Key-Value Store', link: '/system-design-interviews/key-value-store' },
        { text: 'Design Distributed Cache', link: '/system-design-interviews/distributed-cache' },
        { text: 'Design API Gateway', link: '/system-design-interviews/api-gateway' },
        { text: 'Design Stock Exchange', link: '/system-design-interviews/stock-exchange' },
      ],
    },
    {
      text: 'Collaboration & Social',
      collapsed: false,
      items: [
        { text: 'Design GitHub', link: '/system-design-interviews/github' },
        { text: 'Design Slack', link: '/system-design-interviews/slack' },
        { text: 'Design Reddit', link: '/system-design-interviews/reddit' },
        { text: 'Design LinkedIn Feed', link: '/system-design-interviews/linkedin' },
        { text: 'Design Google Docs', link: '/system-design-interviews/google-docs' },
        { text: 'Design Airbnb', link: '/system-design-interviews/airbnb' },
      ],
    },
    {
      text: 'Advanced Systems',
      collapsed: false,
      items: [
        { text: 'Design Zoom', link: '/system-design-interviews/zoom' },
        { text: 'Design a CDN', link: '/system-design-interviews/cdn' },
        { text: 'Design Leaderboard', link: '/system-design-interviews/leaderboard' },
        { text: 'Design Ad Platform', link: '/system-design-interviews/ad-platform' },
      ],
    },
    {
      text: 'AI & ML Systems',
      collapsed: false,
      items: [
        { text: 'Design ChatGPT', link: '/system-design-interviews/chatgpt' },
        { text: 'Design Copilot', link: '/system-design-interviews/copilot' },
        { text: 'Design Recommendation Engine', link: '/system-design-interviews/recommendation-engine' },
      ],
    },
    {
      text: 'Trust & Safety',
      collapsed: false,
      items: [
        { text: 'Design Fraud Detection', link: '/system-design-interviews/fraud-detection' },
        { text: 'Design Search Ranking', link: '/system-design-interviews/search-ranking' },
        { text: 'Design Content Moderation', link: '/system-design-interviews/content-moderation' },
      ],
    },
  ],

  '/learning-paths/': [
    {
      text: 'Learning Paths',
      items: [
        { text: 'Choose Your Path', link: '/learning-paths/' },
        { text: 'Backend Engineer', link: '/learning-paths/backend-engineer' },
        { text: 'DevOps Engineer', link: '/learning-paths/devops-engineer' },
        { text: 'Frontend Engineer', link: '/learning-paths/frontend-engineer' },
        { text: 'System Design Interview', link: '/learning-paths/system-design-interview' },
        { text: 'Security Engineer', link: '/learning-paths/security-engineer' },
        { text: 'Data Engineer', link: '/learning-paths/data-engineer' },
        { text: 'AI/ML Engineer', link: '/learning-paths/ai-ml-engineer' },
        { text: 'Platform Engineer', link: '/learning-paths/platform-engineer' },
        { text: 'Full-Stack Engineer', link: '/learning-paths/fullstack-engineer' },
        { text: 'ML & Deep Learning Engineer', link: '/learning-paths/ml-dl-engineer' },
        { text: 'Cybersecurity Engineer', link: '/learning-paths/cybersecurity-engineer' },
        { text: 'Mobile Engineer', link: '/learning-paths/mobile-engineer' },
        { text: 'Data Scientist', link: '/learning-paths/data-scientist' },
        { text: 'Spring Boot Engineer', link: '/learning-paths/spring-boot-engineer' },
        { text: 'Behavioral Interviews', link: '/learning-paths/behavioral-interviews' },
        { text: 'Engineering Resources', link: '/learning-paths/engineering-resources' },
      ],
    },
  ],

  '/frontend-engineering/': [
    {
      text: 'Frontend Engineering',
      items: [
        { text: 'Overview', link: '/frontend-engineering/' },
      ],
    },
    {
      text: 'Core Concepts',
      collapsed: false,
      items: [
        { text: 'Web Performance & Core Web Vitals', link: '/frontend-engineering/web-performance' },
        { text: 'Browser Rendering Pipeline', link: '/frontend-engineering/browser-rendering' },
        { text: 'Rendering Strategies', link: '/frontend-engineering/rendering-strategies' },
      ],
    },
    {
      text: 'Architecture',
      collapsed: false,
      items: [
        { text: 'State Management Patterns', link: '/frontend-engineering/state-management' },
        { text: 'Micro-Frontends', link: '/frontend-engineering/micro-frontends' },
        { text: 'React Internals', link: '/frontend-engineering/react-internals' },
      ],
    },
    {
      text: 'Optimization',
      collapsed: false,
      items: [
        { text: 'Bundle Optimization', link: '/frontend-engineering/bundle-optimization' },
        { text: 'WebAssembly', link: '/frontend-engineering/webassembly' },
      ],
    },
    {
      text: 'Global',
      collapsed: false,
      items: [
        { text: 'i18n & l10n', link: '/frontend-engineering/i18n-l10n' },
      ],
    },
    {
      text: 'Visualization',
      collapsed: false,
      items: [
        { text: 'Data Visualization', link: '/frontend-engineering/data-visualization' },
      ],
    },
  ],

  '/mobile-engineering/': [
    {
      text: 'Mobile Engineering',
      items: [
        { text: 'Overview', link: '/mobile-engineering/' },
      ],
    },
    {
      text: 'Frameworks',
      collapsed: false,
      items: [
        { text: 'React Native Deep Dive', link: '/mobile-engineering/react-native' },
        { text: 'Flutter Architecture', link: '/mobile-engineering/flutter' },
        { text: 'Cross-Platform Comparison', link: '/mobile-engineering/cross-platform-comparison' },
      ],
    },
    {
      text: 'Architecture & State',
      collapsed: false,
      items: [
        { text: 'Mobile Architecture', link: '/mobile-engineering/mobile-architecture' },
        { text: 'State Management', link: '/mobile-engineering/mobile-state-management' },
        { text: 'Mobile Networking', link: '/mobile-engineering/mobile-networking' },
        { text: 'Mobile Databases', link: '/mobile-engineering/mobile-databases' },
      ],
    },
    {
      text: 'Features & UX',
      collapsed: false,
      items: [
        { text: 'Deep Linking', link: '/mobile-engineering/deep-linking' },
        { text: 'Mobile Animations', link: '/mobile-engineering/mobile-animations' },
        { text: 'Mobile Accessibility', link: '/mobile-engineering/mobile-accessibility' },
        { text: 'Mobile Payments', link: '/mobile-engineering/mobile-payments' },
        { text: 'Mobile Analytics', link: '/mobile-engineering/mobile-analytics' },
      ],
    },
    {
      text: 'Operations',
      collapsed: false,
      items: [
        { text: 'Mobile Performance', link: '/mobile-engineering/mobile-performance' },
        { text: 'Push Notification Architecture', link: '/mobile-engineering/push-notifications' },
        { text: 'Offline-First & Local-First', link: '/mobile-engineering/offline-first' },
        { text: 'Mobile Testing', link: '/mobile-engineering/mobile-testing' },
        { text: 'Mobile CI/CD', link: '/mobile-engineering/mobile-cicd' },
        { text: 'Mobile Security', link: '/mobile-engineering/mobile-security' },
        { text: 'Mobile Deployment', link: '/mobile-engineering/mobile-deployment' },
        { text: 'App Store Optimization', link: '/mobile-engineering/app-store-optimization' },
      ],
    },
  ],

  '/cheat-sheets/': [
    {
      text: 'Cheat Sheets',
      items: [
        { text: 'Overview', link: '/cheat-sheets/' },
        { text: 'Docker', link: '/cheat-sheets/docker' },
        { text: 'Kubernetes', link: '/cheat-sheets/kubernetes' },
        { text: 'Git', link: '/cheat-sheets/git' },
        { text: 'SQL', link: '/cheat-sheets/sql' },
        { text: 'SQL Advanced', link: '/cheat-sheets/sql-advanced' },
        { text: 'TypeScript', link: '/cheat-sheets/typescript' },
        { text: 'Linux', link: '/cheat-sheets/linux' },
        { text: 'Redis', link: '/cheat-sheets/redis' },
        { text: 'Terraform', link: '/cheat-sheets/terraform' },
        { text: 'Python', link: '/cheat-sheets/python' },
        { text: 'Go', link: '/cheat-sheets/golang' },
        { text: 'Rust', link: '/cheat-sheets/rust' },
        { text: 'Bash', link: '/cheat-sheets/bash' },
        { text: 'Nginx', link: '/cheat-sheets/nginx' },
        { text: 'PromQL', link: '/cheat-sheets/promql' },
        { text: 'Docker Compose', link: '/cheat-sheets/docker-compose' },
        { text: 'LLM APIs', link: '/cheat-sheets/llm-apis' },
        { text: 'Terminal Productivity', link: '/cheat-sheets/terminal-productivity' },
        { text: 'HTTP Clients', link: '/cheat-sheets/http-clients' },
        { text: 'AWS CLI', link: '/cheat-sheets/aws-cli' },
        { text: 'GraphQL', link: '/cheat-sheets/graphql' },
        { text: 'Helm', link: '/cheat-sheets/helm' },
        { text: 'kubectl Advanced', link: '/cheat-sheets/kubectl-advanced' },
        { text: 'Regex', link: '/cheat-sheets/regex' },
        { text: 'Spring Boot', link: '/cheat-sheets/spring-boot' },
      ],
    },
  ],

  '/spring-boot/': [
    {
      text: 'Spring Boot',
      items: [
        { text: 'Overview', link: '/spring-boot/' },
      ],
    },
    {
      text: 'Fundamentals',
      collapsed: false,
      items: [
        { text: 'Core Concepts', link: '/spring-boot/core-concepts' },
        { text: 'REST API Development', link: '/spring-boot/rest-api' },
        { text: 'Exception Handling', link: '/spring-boot/exception-handling' },
        { text: 'Best Practices', link: '/spring-boot/best-practices' },
      ],
    },
    {
      text: 'Data Access',
      collapsed: false,
      items: [
        { text: 'Spring Data JPA', link: '/spring-boot/spring-data-jpa' },
        { text: 'Spring Data Advanced', link: '/spring-boot/spring-data-advanced' },
        { text: 'Hibernate Tuning', link: '/spring-boot/hibernate-tuning' },
        { text: 'Database Migrations', link: '/spring-boot/database-migrations' },
      ],
    },
    {
      text: 'Security',
      collapsed: false,
      items: [
        { text: 'Spring Security', link: '/spring-boot/security' },
        { text: 'Spring Security Deep Dive', link: '/spring-boot/spring-security-deep-dive' },
        { text: 'JWT Authentication', link: '/spring-boot/jwt-auth' },
        { text: 'OAuth2 & OIDC', link: '/spring-boot/oauth2-oidc' },
      ],
    },
    {
      text: 'Web & API',
      collapsed: false,
      items: [
        { text: 'Spring WebFlux Deep Dive', link: '/spring-boot/spring-webflux-deep-dive' },
        { text: 'Spring for GraphQL Deep Dive', link: '/spring-boot/spring-graphql-deep-dive' },
      ],
    },
    {
      text: 'Batch & Integration',
      collapsed: false,
      items: [
        { text: 'Spring Batch Deep Dive', link: '/spring-boot/spring-batch-deep-dive' },
        { text: 'Spring Integration', link: '/spring-boot/spring-integration' },
        { text: 'Spring State Machine', link: '/spring-boot/spring-statemachine' },
      ],
    },
    {
      text: 'Microservices & Messaging',
      collapsed: false,
      items: [
        { text: 'Spring Cloud', link: '/spring-boot/spring-cloud' },
        { text: 'Spring Cloud Gateway', link: '/spring-boot/spring-cloud-gateway' },
        { text: 'Spring Cloud Config', link: '/spring-boot/spring-cloud-config' },
        { text: 'Service Discovery', link: '/spring-boot/service-discovery' },
        { text: 'Microservices Patterns', link: '/spring-boot/microservices-patterns' },
        { text: 'Spring Modulith Deep Dive', link: '/spring-boot/spring-modulith-deep-dive' },
        { text: 'Spring Kafka', link: '/spring-boot/kafka' },
      ],
    },
    {
      text: 'Operations',
      collapsed: false,
      items: [
        { text: 'Testing', link: '/spring-boot/testing' },
        { text: 'Actuator & Monitoring', link: '/spring-boot/actuator' },
        { text: 'Spring Boot Observability', link: '/spring-boot/observability' },
        { text: 'Docker & Deployment', link: '/spring-boot/docker' },
        { text: 'Caching', link: '/spring-boot/caching' },
        { text: 'Async & Scheduling', link: '/spring-boot/async' },
      ],
    },
    {
      text: 'Advanced',
      collapsed: false,
      items: [
        { text: 'Virtual Threads (Project Loom)', link: '/spring-boot/virtual-threads' },
        { text: 'Spring AOT & Native', link: '/spring-boot/spring-aot' },
        { text: 'Spring AI', link: '/spring-boot/spring-ai' },
      ],
    },
  ],

  '/testing/': [
    {
      text: 'Testing',
      items: [
        { text: 'Overview', link: '/testing/' },
      ],
    },
    {
      text: 'Testing Types',
      collapsed: false,
      items: [
        { text: 'Unit Testing', link: '/testing/unit-testing' },
        { text: 'Integration Testing', link: '/testing/integration-testing' },
        { text: 'E2E Testing', link: '/testing/e2e-testing' },
        { text: 'Contract Testing', link: '/testing/contract-testing' },
        { text: 'Property-Based Testing', link: '/testing/property-based-testing' },
      ],
    },
    {
      text: 'Methodology & Architecture',
      collapsed: false,
      items: [
        { text: 'TDD & BDD', link: '/testing/tdd-bdd' },
        { text: 'Test Architecture', link: '/testing/test-architecture' },
      ],
    },
  ],

  '/ai-ml-engineering/': [
    {
      text: 'AI/ML Engineering',
      items: [
        { text: 'Overview', link: '/ai-ml-engineering/' },
      ],
    },
    {
      text: 'LLM & Generative AI',
      collapsed: false,
      items: [
        { text: 'LLM Integration', link: '/ai-ml-engineering/llm-integration' },
        { text: 'RAG Architecture', link: '/ai-ml-engineering/rag-architecture' },
        { text: 'AI Agents', link: '/ai-ml-engineering/ai-agents' },
      ],
    },
    {
      text: 'Data & Infrastructure',
      collapsed: false,
      items: [
        { text: 'Embeddings & Semantic Search', link: '/ai-ml-engineering/embeddings' },
        { text: 'Vector Databases', link: '/ai-ml-engineering/vector-databases' },
        { text: 'ML Pipelines & MLOps', link: '/ai-ml-engineering/ml-pipelines' },
      ],
    },
    {
      text: 'Frameworks & SDKs',
      collapsed: false,
      items: [
        { text: 'LangChain', link: '/ai-ml-engineering/langchain' },
        { text: 'LangGraph', link: '/ai-ml-engineering/langgraph' },
        { text: 'LangSmith', link: '/ai-ml-engineering/langsmith' },
        { text: 'LlamaIndex', link: '/ai-ml-engineering/llamaindex' },
        { text: 'Vercel AI SDK', link: '/ai-ml-engineering/vercel-ai-sdk' },
        { text: 'HuggingFace', link: '/ai-ml-engineering/huggingface' },
        { text: 'CrewAI & AutoGen', link: '/ai-ml-engineering/crewai-autogen' },
      ],
    },
    {
      text: 'APIs & Providers',
      collapsed: false,
      items: [
        { text: 'Anthropic Claude API', link: '/ai-ml-engineering/anthropic-claude-api' },
        { text: 'OpenAI API', link: '/ai-ml-engineering/openai-api' },
      ],
    },
    {
      text: 'Advanced Topics',
      collapsed: false,
      items: [
        { text: 'Fine-Tuning', link: '/ai-ml-engineering/fine-tuning' },
        { text: 'AI Guardrails', link: '/ai-ml-engineering/ai-guardrails' },
        { text: 'AI in Production', link: '/ai-ml-engineering/ai-in-production' },
        { text: 'Multimodal AI', link: '/ai-ml-engineering/multimodal-ai' },
        { text: 'Prompt Caching', link: '/ai-ml-engineering/prompt-caching' },
        { text: 'Prompt Engineering Advanced', link: '/ai-ml-engineering/prompt-engineering-advanced' },
        { text: 'Data Annotation', link: '/ai-ml-engineering/data-annotation' },
        { text: 'AI Testing', link: '/ai-ml-engineering/ai-testing' },
      ],
    },
  ],
  '/algorithms/': [
    {
      text: 'Algorithms & Data Structures',
      items: [
        { text: 'Overview', link: '/algorithms/' },
      ],
    },
    {
      text: 'Core Data Structures',
      collapsed: false,
      items: [
        { text: 'Arrays & Strings', link: '/algorithms/arrays-strings' },
        { text: 'Linked Lists', link: '/algorithms/linked-lists' },
        { text: 'Hash Tables', link: '/algorithms/hash-tables' },
        { text: 'Trees', link: '/algorithms/trees' },
        { text: 'Heaps & Priority Queues', link: '/algorithms/heaps-priority-queues' },
        { text: 'Graphs', link: '/algorithms/graphs' },
      ],
    },
    {
      text: 'Algorithm Techniques',
      collapsed: false,
      items: [
        { text: 'Sorting & Searching', link: '/algorithms/sorting-searching' },
        { text: 'Backtracking & Recursion', link: '/algorithms/backtracking-recursion' },
        { text: 'Dynamic Programming', link: '/algorithms/dynamic-programming' },
        { text: 'Greedy Algorithms', link: '/algorithms/greedy' },
        { text: 'Bit Manipulation', link: '/algorithms/bit-manipulation' },
        { text: 'String Algorithms', link: '/algorithms/string-algorithms' },
        { text: 'Regex Mastery', link: '/algorithms/regex-mastery' },
      ],
    },
    {
      text: 'Advanced Topics',
      collapsed: false,
      items: [
        { text: 'Advanced Data Structures', link: '/algorithms/advanced-data-structures' },
        { text: 'Math Patterns in System Design', link: '/algorithms/system-design-math' },
      ],
    },
    {
      text: 'Interview Questions',
      collapsed: true,
      items: [
        { text: 'JavaScript (50+)', link: '/algorithms/javascript-interview' },
        { text: 'React', link: '/algorithms/react-interview' },
        { text: 'Node.js', link: '/algorithms/nodejs-interview' },
        { text: 'Probability for Engineers', link: '/algorithms/probability-for-engineers' },
        { text: 'Statistics & A/B Testing', link: '/algorithms/statistics-ab-testing' },
      ],
    },
  ],

  '/lld-interviews/': [
    {
      text: 'Low-Level Design Interviews',
      items: [
        { text: 'Overview', link: '/lld-interviews/' },
      ],
    },
    {
      text: 'LLD Problems',
      collapsed: false,
      items: [
        { text: 'Design Parking Lot', link: '/lld-interviews/parking-lot' },
        { text: 'Design Elevator System', link: '/lld-interviews/elevator-system' },
        { text: 'Design Chess', link: '/lld-interviews/chess' },
        { text: 'Design Library Management', link: '/lld-interviews/library-management' },
        { text: 'Design Snake & Ladders', link: '/lld-interviews/snake-ladders' },
        { text: 'Design Vending Machine', link: '/lld-interviews/vending-machine' },
        { text: 'Design ATM Machine', link: '/lld-interviews/atm-machine' },
        { text: 'Design Movie Ticket Booking', link: '/lld-interviews/movie-booking' },
        { text: 'Design Hotel Management', link: '/lld-interviews/hotel-management' },
        { text: 'Design File System', link: '/lld-interviews/file-system' },
        { text: 'Design Tic-Tac-Toe', link: '/lld-interviews/tic-tac-toe' },
      ],
    },
    {
      text: 'Practice Problems',
      collapsed: false,
      items: [
        { text: 'Practice: Easy', link: '/lld-interviews/practice-easy' },
        { text: 'Practice: Medium', link: '/lld-interviews/practice-medium' },
        { text: 'Practice: Hard', link: '/lld-interviews/practice-hard' },
      ],
    },
  ],

  '/build-from-scratch/': [
    {
      text: 'Build From Scratch',
      items: [
        { text: 'Overview', link: '/build-from-scratch/' },
      ],
    },
    {
      text: 'Projects',
      collapsed: false,
      items: [
        { text: 'Build Redis', link: '/build-from-scratch/redis' },
        { text: 'Build a Rate Limiter', link: '/build-from-scratch/rate-limiter' },
        { text: 'Build a Key-Value Store', link: '/build-from-scratch/key-value-store' },
        { text: 'Build a Load Balancer', link: '/build-from-scratch/load-balancer' },
      ],
    },
  ],

  '/company-architecture/': [
    {
      text: 'Company Architecture',
      items: [
        { text: 'Overview', link: '/company-architecture/' },
      ],
    },
    {
      text: 'Case Studies',
      collapsed: false,
      items: [
        { text: 'Uber Dispatch System', link: '/company-architecture/uber-dispatch' },
        { text: 'Figma Multiplayer', link: '/company-architecture/figma-multiplayer' },
        { text: 'Shopify Black Friday', link: '/company-architecture/shopify-black-friday' },
        { text: 'Discord Scaling', link: '/company-architecture/discord-scaling' },
      ],
    },
  ],

  '/cybersecurity/': [
    {
      text: 'Cybersecurity',
      items: [
        { text: 'Overview', link: '/cybersecurity/' },
      ],
    },
    {
      text: 'Part 1 — Fundamentals',
      collapsed: false,
      items: [
        { text: 'Networking Fundamentals', link: '/cybersecurity/networking-fundamentals' },
        { text: 'Web App Pentesting', link: '/cybersecurity/web-app-pentesting' },
        { text: 'Linux Security & Hardening', link: '/cybersecurity/linux-security' },
        { text: 'Network Attacks & Defense', link: '/cybersecurity/network-attacks' },
        { text: 'Reverse Engineering', link: '/cybersecurity/reverse-engineering' },
        { text: 'Practical Cryptography', link: '/cybersecurity/cryptography-practical' },
      ],
    },
    {
      text: 'Part 2 — Advanced Topics',
      collapsed: false,
      items: [
        { text: 'Active Directory', link: '/cybersecurity/active-directory' },
        { text: 'Red Team Operations', link: '/cybersecurity/red-team-ops' },
        { text: 'Blue Team & SOC', link: '/cybersecurity/blue-team-soc' },
        { text: 'Web3 & Smart Contracts', link: '/cybersecurity/web3-security' },
        { text: 'Mobile Security', link: '/cybersecurity/mobile-security' },
        { text: 'API Security Testing', link: '/cybersecurity/api-security-testing' },
        { text: 'Container & Kubernetes', link: '/cybersecurity/container-security' },
        { text: 'Bug Bounty Hunting', link: '/cybersecurity/bug-bounty' },
        { text: 'Malware Analysis', link: '/cybersecurity/malware-analysis' },
        { text: 'Security Certifications', link: '/cybersecurity/security-certifications' },
        { text: 'Cloud Pentesting', link: '/cybersecurity/cloud-pentesting' },
        { text: 'Incident Response & Forensics', link: '/cybersecurity/incident-response-forensics' },
        { text: 'OSINT', link: '/cybersecurity/osint' },
        { text: 'Secure Coding', link: '/cybersecurity/secure-coding' },
        { text: 'Security Tools', link: '/cybersecurity/security-tools' },
      ],
    },
  ],

  '/debugging-playbooks/': [
    {
      text: 'Debugging Playbooks',
      items: [
        { text: 'Overview', link: '/debugging-playbooks/' },
      ],
    },
    {
      text: 'Playbooks',
      collapsed: false,
      items: [
        { text: 'API Slow Response', link: '/debugging-playbooks/api-slow' },
        { text: 'Database CPU Issues', link: '/debugging-playbooks/database-cpu' },
        { text: 'High Error Rate', link: '/debugging-playbooks/high-error-rate' },
        { text: 'Intermittent 502 Errors', link: '/debugging-playbooks/intermittent-502' },
        { text: 'Memory Leak', link: '/debugging-playbooks/memory-leak' },
        { text: 'Pods Restarting', link: '/debugging-playbooks/pods-restarting' },
      ],
    },
  ],

  '/comparisons/': [
    {
      text: 'Technology Comparisons',
      items: [
        { text: 'Overview', link: '/comparisons/' },
      ],
    },
    {
      text: 'Frontend',
      collapsed: false,
      items: [
        { text: 'React vs Vue vs Svelte', link: '/comparisons/react-vs-vue-vs-svelte' },
        { text: 'Next.js vs Nuxt vs SvelteKit', link: '/comparisons/nextjs-vs-nuxt-vs-sveltekit' },
        { text: 'Tailwind vs CSS Modules vs Styled Components', link: '/comparisons/tailwind-vs-css-modules' },
        { text: 'Vite vs Webpack vs Turbopack vs Rspack', link: '/comparisons/vite-vs-webpack' },
      ],
    },
    {
      text: 'Backend',
      collapsed: false,
      items: [
        { text: 'Express vs Fastify vs Hono vs Elysia', link: '/comparisons/express-vs-fastify-vs-hono' },
        { text: 'Prisma vs Drizzle vs TypeORM vs Knex', link: '/comparisons/prisma-vs-drizzle-vs-typeorm' },
        { text: 'REST vs GraphQL vs gRPC vs tRPC', link: '/comparisons/rest-vs-graphql-vs-grpc-vs-trpc' },
      ],
    },
    {
      text: 'Testing',
      collapsed: false,
      items: [
        { text: 'Jest vs Vitest vs Mocha', link: '/comparisons/jest-vs-vitest' },
        { text: 'Playwright vs Cypress vs Selenium', link: '/comparisons/playwright-vs-cypress' },
      ],
    },
    {
      text: 'Tooling',
      collapsed: false,
      items: [
        { text: 'pnpm vs npm vs yarn vs bun', link: '/comparisons/pnpm-vs-npm-vs-yarn' },
      ],
    },
    {
      text: 'DevOps & Infrastructure',
      collapsed: false,
      items: [
        { text: 'Vercel vs Netlify vs Cloudflare vs Amplify', link: '/comparisons/vercel-vs-netlify-vs-cloudflare' },
        { text: 'Terraform vs Pulumi vs CDK vs Crossplane', link: '/comparisons/terraform-vs-pulumi' },
        { text: 'GitHub Actions vs GitLab CI vs Jenkins', link: '/comparisons/github-actions-vs-gitlab-ci' },
        { text: 'Docker vs Podman', link: '/comparisons/docker-vs-podman' },
        { text: 'Nginx vs Caddy vs Traefik', link: '/comparisons/nginx-vs-caddy-vs-traefik' },
        { text: 'Datadog vs Grafana vs New Relic', link: '/comparisons/datadog-vs-grafana' },
        { text: 'Redis vs Memcached vs DragonflyDB', link: '/comparisons/redis-vs-memcached-vs-dragonfly' },
      ],
    },
    {
      text: 'BaaS & AI',
      collapsed: false,
      items: [
        { text: 'Supabase vs Firebase vs Appwrite', link: '/comparisons/supabase-vs-firebase' },
        { text: 'OpenAI vs Anthropic vs Google vs Mistral', link: '/comparisons/openai-vs-anthropic-vs-google' },
        { text: 'LangChain vs LlamaIndex vs Raw API', link: '/comparisons/langchain-vs-llamaindex' },
      ],
    },
  ],

  '/eda/': [
    {
      text: 'Exploratory Data Analysis',
      items: [
        { text: 'Overview', link: '/eda/' },
      ],
    },
    {
      text: 'Tier 0: EDA Mindset',
      collapsed: false,
      items: [
        { text: 'Asking the Right Questions', link: '/eda/asking-right-questions' },
        { text: 'EDA Workflow (10 Steps)', link: '/eda/eda-workflow' },
        { text: 'Common Mistakes', link: '/eda/common-mistakes' },
        { text: 'EDA for Different Domains', link: '/eda/eda-for-different-domains' },
      ],
    },
    {
      text: 'Tier 1: Data Understanding',
      collapsed: false,
      items: [
        { text: 'Data Types Deep Dive', link: '/eda/data-types-deep-dive' },
        { text: 'Data Shapes & Structures', link: '/eda/data-shapes-structures' },
        { text: 'Data Collection', link: '/eda/data-collection' },
        { text: 'Data Profiling', link: '/eda/data-profiling' },
        { text: 'Understanding Distributions', link: '/eda/understanding-distributions' },
        { text: 'Understanding Scale', link: '/eda/understanding-scale' },
      ],
    },
    {
      text: 'Tier 2: Data Cleaning',
      collapsed: false,
      items: [
        { text: 'Missing Data', link: '/eda/missing-data' },
        { text: 'Outlier Analysis', link: '/eda/outlier-analysis' },
        { text: 'Cleaning Text Data', link: '/eda/data-cleaning-text' },
        { text: 'Cleaning Dates & Times', link: '/eda/data-cleaning-dates' },
        { text: 'Cleaning Categories', link: '/eda/data-cleaning-categories' },
        { text: 'Data Quality Validation', link: '/eda/data-quality-validation' },
        { text: 'Edge Cases', link: '/eda/data-cleaning-edge-cases' },
      ],
    },
    {
      text: 'Tier 3: Univariate Analysis',
      collapsed: true,
      items: [
        { text: 'Numerical', link: '/eda/univariate-numerical' },
        { text: 'Categorical', link: '/eda/univariate-categorical' },
        { text: 'Temporal', link: '/eda/univariate-temporal' },
        { text: 'Text', link: '/eda/univariate-text' },
      ],
    },
    {
      text: 'Tier 4: Bivariate & Multivariate',
      collapsed: true,
      items: [
        { text: 'Numerical vs Numerical', link: '/eda/bivariate-num-num' },
        { text: 'Categorical vs Numerical', link: '/eda/bivariate-cat-num' },
        { text: 'Categorical vs Categorical', link: '/eda/bivariate-cat-cat' },
        { text: 'Multivariate Analysis', link: '/eda/multivariate' },
        { text: 'Correlation Traps', link: '/eda/correlation-traps' },
      ],
    },
    {
      text: 'Tier 5: Feature Engineering',
      collapsed: true,
      items: [
        { text: 'Transformations', link: '/eda/transformations' },
        { text: 'Encoding Strategies', link: '/eda/encoding-strategies' },
        { text: 'Feature Creation', link: '/eda/feature-creation' },
        { text: 'Datetime Features', link: '/eda/datetime-features' },
        { text: 'Text Features', link: '/eda/text-features' },
        { text: 'Scaling & Normalization', link: '/eda/scaling-normalization' },
      ],
    },
    {
      text: 'Tier 6: Special Situations',
      collapsed: true,
      items: [
        { text: 'Imbalanced Data', link: '/eda/imbalanced-data' },
        { text: 'Multicollinearity', link: '/eda/multicollinearity' },
        { text: 'High Cardinality', link: '/eda/high-cardinality' },
        { text: 'Large Datasets', link: '/eda/large-datasets' },
        { text: 'Small Datasets', link: '/eda/small-datasets' },
      ],
    },
    {
      text: 'Tier 7: Libraries',
      collapsed: true,
      items: [
        { text: 'NumPy for EDA', link: '/eda/numpy' },
        { text: 'Pandas Fundamentals', link: '/eda/pandas-fundamentals' },
        { text: 'Pandas Advanced', link: '/eda/pandas-advanced' },
        { text: 'Matplotlib', link: '/eda/matplotlib' },
        { text: 'Seaborn', link: '/eda/seaborn' },
        { text: 'Plotly', link: '/eda/plotly' },
        { text: 'SciPy Statistics', link: '/eda/scipy-stats' },
        { text: 'Polars for EDA', link: '/eda/polars-for-eda' },
      ],
    },
    {
      text: 'Tier 8: Streamlit & Tools',
      collapsed: true,
      items: [
        { text: 'Streamlit', link: '/eda/streamlit' },
        { text: 'Streamlit EDA App', link: '/eda/streamlit-eda-app' },
        { text: 'Automated EDA Tools', link: '/eda/automated-eda' },
      ],
    },
    {
      text: 'Tier 9: Projects',
      collapsed: true,
      items: [
        { text: 'Project: Titanic', link: '/eda/project-titanic' },
        { text: 'Project: E-Commerce', link: '/eda/project-ecommerce' },
        { text: 'Project: Financial', link: '/eda/project-financial' },
        { text: 'Project: Healthcare', link: '/eda/project-healthcare' },
        { text: 'Project: NLP/Text', link: '/eda/project-nlp' },
      ],
    },
    {
      text: 'Tier 10: Reference',
      collapsed: true,
      items: [
        { text: 'EDA Checklist (60 Items)', link: '/eda/eda-checklist' },
        { text: 'Visualization Decision Tree', link: '/eda/visualization-decision-tree' },
        { text: 'Statistical Test Selector', link: '/eda/statistical-test-selector' },
        { text: 'Pandas EDA Cheat Sheet', link: '/cheat-sheets/pandas-eda' },
      ],
    },
    {
      text: 'Tier 11: Geospatial & Media',
      collapsed: true,
      items: [
        { text: 'Geospatial EDA', link: '/eda/geospatial-eda' },
        { text: 'Image & Audio EDA', link: '/eda/image-audio-eda' },
      ],
    },
    {
      text: 'Tier 12: Data Leakage & Sampling',
      collapsed: true,
      items: [
        { text: 'Data Leakage Detection', link: '/eda/data-leakage' },
        { text: 'Sampling Strategies', link: '/eda/sampling-strategies' },
      ],
    },
    {
      text: 'Tier 13: Post-Modeling EDA',
      collapsed: true,
      items: [
        { text: 'Residual & Error Analysis', link: '/eda/post-modeling-eda' },
        { text: 'Explainability as EDA', link: '/eda/explainability-eda' },
      ],
    },
    {
      text: 'Tier 14: Reproducibility',
      collapsed: true,
      items: [
        { text: 'Reproducibility', link: '/eda/reproducibility' },
        { text: 'Communicating Findings', link: '/eda/communicating-findings' },
      ],
    },
    {
      text: 'Tier 15-18: Advanced',
      collapsed: true,
      items: [
        { text: 'Statistical Power', link: '/eda/statistical-power' },
        { text: 'Relational Data EDA', link: '/eda/relational-data-eda' },
        { text: 'Data Drift & Evolution', link: '/eda/data-drift' },
        { text: 'Ethics & Bias Detection', link: '/eda/eda-ethics-bias' },
      ],
    },
  ],

  '/data-pipeline/': [
    {
      text: 'Data Pipeline',
      items: [
        { text: 'Overview', link: '/data-pipeline/' },
      ],
    },
    {
      text: 'Data Collection',
      collapsed: false,
      items: [
        { text: 'Web Scraping at Scale', link: '/data-pipeline/web-scraping' },
        { text: 'API Data Ingestion', link: '/data-pipeline/api-ingestion' },
        { text: 'Database Extraction', link: '/data-pipeline/database-extraction' },
        { text: 'File Formats Deep Dive', link: '/data-pipeline/file-formats' },
      ],
    },
    {
      text: 'Data Preprocessing',
      collapsed: false,
      items: [
        { text: 'Pipeline Architecture', link: '/data-pipeline/preprocessing-pipeline' },
        { text: 'Type Inference & Casting', link: '/data-pipeline/type-inference' },
        { text: 'String Preprocessing', link: '/data-pipeline/string-preprocessing' },
        { text: 'Numerical Preprocessing', link: '/data-pipeline/numerical-preprocessing' },
        { text: 'Categorical Preprocessing', link: '/data-pipeline/categorical-preprocessing' },
        { text: 'Datetime Preprocessing', link: '/data-pipeline/datetime-preprocessing' },
        { text: 'Text Preprocessing (NLP)', link: '/data-pipeline/text-preprocessing' },
        { text: 'Image Preprocessing', link: '/data-pipeline/image-preprocessing' },
        { text: 'Deduplication Strategies', link: '/data-pipeline/deduplication' },
        { text: 'Missing Data Imputation', link: '/data-pipeline/missing-imputation' },
      ],
    },
    {
      text: 'Pipeline Orchestration',
      collapsed: false,
      items: [
        { text: 'Airflow for Data Pipelines', link: '/data-pipeline/airflow-pipelines' },
        { text: 'Prefect for Data Pipelines', link: '/data-pipeline/prefect-pipelines' },
        { text: 'Pipeline Design Patterns', link: '/data-pipeline/pipeline-patterns' },
        { text: 'Pipeline Monitoring & Alerting', link: '/data-pipeline/pipeline-monitoring' },
      ],
    },
    {
      text: 'Data Validation',
      collapsed: false,
      items: [
        { text: 'Great Expectations', link: '/data-pipeline/great-expectations' },
        { text: 'Pandera Schema Validation', link: '/data-pipeline/pandera-validation' },
        { text: 'Data Contracts', link: '/data-pipeline/data-contracts' },
      ],
    },
    {
      text: 'End-to-End Projects',
      collapsed: false,
      items: [
        { text: 'Project: E-Commerce Pipeline', link: '/data-pipeline/project-ecommerce-pipeline' },
        { text: 'Project: Real Estate Pipeline', link: '/data-pipeline/project-real-estate' },
        { text: 'Project: IoT Sensor Pipeline', link: '/data-pipeline/project-iot-streaming' },
      ],
    },
  ],

  '/machine-learning/': [
    {
      text: 'Foundations',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/machine-learning/' },
        { text: 'Math Foundations', link: '/machine-learning/math-foundations' },
        { text: 'ML Workflow', link: '/machine-learning/ml-workflow' },
        { text: 'Python ML Ecosystem', link: '/machine-learning/python-ml-ecosystem' },
        { text: 'Data Preparation', link: '/machine-learning/data-preparation' },
      ],
    },
    {
      text: 'Supervised Learning',
      collapsed: false,
      items: [
        { text: 'Linear Regression', link: '/machine-learning/linear-regression' },
        { text: 'Logistic Regression', link: '/machine-learning/logistic-regression' },
        { text: 'Decision Trees', link: '/machine-learning/decision-trees' },
        { text: 'Random Forests', link: '/machine-learning/random-forests' },
        { text: 'Gradient Boosting', link: '/machine-learning/gradient-boosting' },
        { text: 'SVM', link: '/machine-learning/svm' },
        { text: 'KNN', link: '/machine-learning/knn' },
        { text: 'Naive Bayes', link: '/machine-learning/naive-bayes' },
      ],
    },
    {
      text: 'Unsupervised Learning',
      collapsed: false,
      items: [
        { text: 'Clustering', link: '/machine-learning/clustering' },
        { text: 'Dimensionality Reduction', link: '/machine-learning/dimensionality-reduction' },
        { text: 'Anomaly Detection', link: '/machine-learning/anomaly-detection' },
        { text: 'Association Rules', link: '/machine-learning/association-rules' },
        { text: 'Topic Modeling', link: '/machine-learning/topic-modeling' },
      ],
    },
    {
      text: 'Evaluation & Selection',
      collapsed: false,
      items: [
        { text: 'Evaluation Metrics', link: '/machine-learning/evaluation-metrics' },
        { text: 'Cross-Validation', link: '/machine-learning/cross-validation' },
        { text: 'Hyperparameter Tuning', link: '/machine-learning/hyperparameter-tuning' },
        { text: 'Model Selection', link: '/machine-learning/model-selection' },
      ],
    },
    {
      text: 'Advanced',
      collapsed: false,
      items: [
        { text: 'Feature Engineering Advanced', link: '/machine-learning/feature-engineering-advanced' },
        { text: 'Ensemble Methods', link: '/machine-learning/ensemble-methods' },
        { text: 'Time Series ML', link: '/machine-learning/time-series-ml' },
        { text: 'Recommendation Systems', link: '/machine-learning/recommendation-systems' },
        { text: 'ML Interpretability', link: '/machine-learning/ml-interpretability' },
      ],
    },
    {
      text: 'Reference',
      collapsed: false,
      items: [
        { text: 'ML Checklist', link: '/machine-learning/ml-checklist' },
        { text: 'Algorithm Selection Guide', link: '/machine-learning/algorithm-selection-guide' },
      ],
    },
  ],

  '/deep-learning/': [
    {
      text: 'Foundations',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/deep-learning/' },
        { text: 'Neural Network Basics', link: '/deep-learning/neural-network-basics' },
        { text: 'PyTorch Fundamentals', link: '/deep-learning/pytorch-fundamentals' },
        { text: 'Training Techniques', link: '/deep-learning/training-techniques' },
      ],
    },
    {
      text: 'Core Architectures',
      collapsed: false,
      items: [
        { text: 'CNN', link: '/deep-learning/cnn' },
        { text: 'RNN & LSTM', link: '/deep-learning/rnn-lstm' },
        { text: 'Transformers', link: '/deep-learning/transformers' },
        { text: 'Autoencoders', link: '/deep-learning/autoencoders' },
        { text: 'GANs', link: '/deep-learning/gans' },
        { text: 'Graph Neural Networks', link: '/deep-learning/graph-neural-networks' },
      ],
    },
    {
      text: 'NLP',
      collapsed: false,
      items: [
        { text: 'NLP Fundamentals', link: '/deep-learning/nlp-fundamentals' },
        { text: 'Language Models', link: '/deep-learning/language-models' },
        { text: 'BERT Family', link: '/deep-learning/bert-family' },
        { text: 'Text Generation', link: '/deep-learning/text-generation' },
      ],
    },
    {
      text: 'Computer Vision',
      collapsed: false,
      items: [
        { text: 'Image Classification', link: '/deep-learning/image-classification' },
        { text: 'Object Detection', link: '/deep-learning/object-detection' },
        { text: 'Image Segmentation', link: '/deep-learning/image-segmentation' },
      ],
    },
    {
      text: 'Advanced',
      collapsed: false,
      items: [
        { text: 'Transfer Learning', link: '/deep-learning/transfer-learning' },
        { text: 'Model Optimization', link: '/deep-learning/model-optimization' },
        { text: 'Diffusion Models', link: '/deep-learning/diffusion-models' },
        { text: 'Reinforcement Learning', link: '/deep-learning/reinforcement-learning' },
        { text: 'Multimodal Models', link: '/deep-learning/multimodal-models' },
      ],
    },
    {
      text: 'Reference',
      collapsed: false,
      items: [
        { text: 'DL Checklist', link: '/deep-learning/dl-checklist' },
        { text: 'Architecture Selection Guide', link: '/deep-learning/architecture-selection-guide' },
        { text: 'Papers Reading List', link: '/deep-learning/papers-reading-list' },
      ],
    },
  ],

}
