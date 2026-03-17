---
title: RabbitMQ Internals
description: "Deep dive into RabbitMQ — AMQP model, exchange types, acknowledgements, publisher confirms, dead letter exchanges, quorum queues, clustering, federation, and TypeScript amqplib examples"
tags: [rabbitmq, amqp, message-broker, exchanges, queues, clustering, quorum-queues, typescript]
difficulty: intermediate
prerequisites: [message-queues]
lastReviewed: "2026-03-17"
---

# RabbitMQ Internals

RabbitMQ is the most widely deployed traditional message broker. Unlike Kafka's log-based append-only model, RabbitMQ is built around the AMQP (Advanced Message Queuing Protocol) model where the broker is intelligent — it routes messages based on rules, tracks delivery state, and removes messages after acknowledgement. This makes RabbitMQ excellent for task queues, RPC-style communication, and workflows where messages are consumed once and then discarded.

RabbitMQ is written in Erlang, which gives it lightweight process isolation, hot code reloading, and the OTP framework for fault tolerance. Understanding its AMQP model, exchange types, acknowledgement semantics, and clustering behavior is essential for building reliable messaging systems.

## The AMQP Model

AMQP defines four core concepts that form the messaging pipeline:

```mermaid
graph LR
    P[Producer] -->|publish| E[Exchange]
    E -->|routing key<br/>matches binding| Q1[Queue 1]
    E -->|routing key<br/>matches binding| Q2[Queue 2]
    Q1 -->|consume| C1[Consumer 1]
    Q2 -->|consume| C2[Consumer 2]

    B1[Binding:<br/>key = order.created] --- Q1
    B2[Binding:<br/>key = order.#] --- Q2

    style E fill:#ff922b,color:#fff
    style Q1 fill:#1971c2,color:#fff
    style Q2 fill:#1971c2,color:#fff
```

### Exchanges

An exchange receives messages from producers and routes them to queues based on **bindings** and **routing keys**. The producer never sends directly to a queue — it always publishes to an exchange.

Every RabbitMQ installation has a **default exchange** (empty string name, type `direct`). When you publish to the default exchange with a routing key, it routes to the queue whose name matches the routing key. This is why many tutorials appear to publish "directly to a queue" — they're actually using the default exchange implicitly.

### Queues

A queue is a named buffer that stores messages until consumers retrieve them. Queues have properties:

- **Name:** Identifier for the queue. Can be auto-generated (exclusive queues).
- **Durable:** Survives broker restart (metadata and messages persisted to disk).
- **Exclusive:** Used by only one connection. Deleted when that connection closes.
- **Auto-delete:** Deleted when the last consumer unsubscribes.
- **Arguments:** Extra configuration — message TTL, max length, dead letter exchange, queue type.

### Bindings

A binding is a rule that tells an exchange which queues to route messages to. A binding consists of:

- The exchange
- The queue
- A **binding key** (routing pattern)

The exchange type determines how the binding key is interpreted.

### Routing Keys

A routing key is a string attached to each message by the producer. The exchange compares the routing key against binding keys to decide where to route the message.

## Exchange Types

### Direct Exchange

Routes messages to queues whose binding key exactly matches the message's routing key.

```mermaid
graph LR
    P[Producer] -->|routing_key = error| DE[Direct<br/>Exchange]
    DE -->|binding: error| Q1[Error Queue]
    DE -->|binding: info| Q2[Info Queue]
    DE -->|binding: warning| Q3[Warning Queue]

    style DE fill:#e03131,color:#fff
```

Use case: routing log messages by severity. A message with routing key `error` goes only to the queue bound with key `error`.

```typescript
import amqp from 'amqplib';

async function directExchangeExample(): Promise<void> {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  const exchange = 'logs.direct';
  await channel.assertExchange(exchange, 'direct', { durable: true });

  // Bind queues with specific routing keys
  const errorQueue = await channel.assertQueue('logs.error', { durable: true });
  await channel.bindQueue(errorQueue.queue, exchange, 'error');

  const infoQueue = await channel.assertQueue('logs.info', { durable: true });
  await channel.bindQueue(infoQueue.queue, exchange, 'info');

  // Publish with routing key
  channel.publish(exchange, 'error', Buffer.from(JSON.stringify({
    message: 'Database connection failed',
    timestamp: Date.now(),
  })), {
    persistent: true, // Survive broker restart
    contentType: 'application/json',
  });

  // This message goes to the error queue only
  // Messages with routing key 'info' go to the info queue only
}
```

### Topic Exchange

Routes messages based on wildcard pattern matching against the routing key. Routing keys are dot-delimited strings (e.g., `order.created.us`). Binding keys support two wildcards:

- `*` matches exactly one word: `order.*.us` matches `order.created.us` but not `order.created.shipped.us`
- `#` matches zero or more words: `order.#` matches `order.created`, `order.created.us`, and `order`

```mermaid
graph LR
    P[Producer] -->|order.created.us| TE[Topic<br/>Exchange]
    TE -->|order.created.*| Q1[New Orders Queue]
    TE -->|order.#| Q2[All Orders Queue]
    TE -->|*.*.eu| Q3[EU Events Queue]

    style TE fill:#2f9e44,color:#fff
```

```typescript
async function topicExchangeExample(): Promise<void> {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  const exchange = 'events.topic';
  await channel.assertExchange(exchange, 'topic', { durable: true });

  // Queue that receives all order events from the US
  const usOrdersQueue = await channel.assertQueue('us-orders', { durable: true });
  await channel.bindQueue(usOrdersQueue.queue, exchange, 'order.*.us');

  // Queue that receives all events (audit log)
  const auditQueue = await channel.assertQueue('audit-log', { durable: true });
  await channel.bindQueue(auditQueue.queue, exchange, '#');

  // Queue that receives only order creation events globally
  const newOrdersQueue = await channel.assertQueue('new-orders', { durable: true });
  await channel.bindQueue(newOrdersQueue.queue, exchange, 'order.created.*');

  // This message matches 'order.*.us', '#', and 'order.created.*'
  channel.publish(exchange, 'order.created.us', Buffer.from(JSON.stringify({
    orderId: 'ord-123',
    region: 'us',
    action: 'created',
  })), { persistent: true });

  // This message matches 'order.*.us' and '#' but NOT 'order.created.*'
  channel.publish(exchange, 'order.shipped.us', Buffer.from(JSON.stringify({
    orderId: 'ord-123',
    region: 'us',
    action: 'shipped',
  })), { persistent: true });
}
```

### Fanout Exchange

Routes messages to ALL bound queues, ignoring the routing key entirely. Every queue bound to the exchange receives a copy of every message.

```mermaid
graph LR
    P[Producer] -->|any key| FE[Fanout<br/>Exchange]
    FE --> Q1[Email Service Queue]
    FE --> Q2[SMS Service Queue]
    FE --> Q3[Analytics Queue]
    FE --> Q4[Audit Queue]

    style FE fill:#9c36b5,color:#fff
```

Use case: broadcasting an event to multiple services. When an order is placed, every service that cares about orders gets a copy.

```typescript
async function fanoutExchangeExample(): Promise<void> {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  const exchange = 'order.placed';
  await channel.assertExchange(exchange, 'fanout', { durable: true });

  // Each service binds its own queue
  const emailQueue = await channel.assertQueue('email-notifications', { durable: true });
  await channel.bindQueue(emailQueue.queue, exchange, ''); // routing key ignored for fanout

  const analyticsQueue = await channel.assertQueue('analytics-events', { durable: true });
  await channel.bindQueue(analyticsQueue.queue, exchange, '');

  // Both queues receive this message
  channel.publish(exchange, '', Buffer.from(JSON.stringify({
    orderId: 'ord-456',
    userId: 'user-789',
    total: 149.99,
  })), { persistent: true });
}
```

### Headers Exchange

Routes messages based on message headers instead of routing keys. The binding specifies a set of header key-value pairs and a match type (`x-match`):

- `x-match: all` — all specified headers must match
- `x-match: any` — at least one specified header must match

Headers exchanges are rarely used in practice. Topic exchanges cover most routing needs more simply.

```typescript
async function headersExchangeExample(): Promise<void> {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  const exchange = 'events.headers';
  await channel.assertExchange(exchange, 'headers', { durable: true });

  // Queue matches messages with format=json AND type=order
  const jsonOrdersQueue = await channel.assertQueue('json-orders', { durable: true });
  await channel.bindQueue(jsonOrdersQueue.queue, exchange, '', {
    'x-match': 'all',
    format: 'json',
    type: 'order',
  });

  // This matches (both headers present)
  channel.publish(exchange, '', Buffer.from('{"orderId": "123"}'), {
    headers: { format: 'json', type: 'order' },
    persistent: true,
  });

  // This does NOT match (missing type header)
  channel.publish(exchange, '', Buffer.from('{"userId": "456"}'), {
    headers: { format: 'json', type: 'user' },
    persistent: true,
  });
}
```

## Message Acknowledgement

RabbitMQ uses explicit acknowledgements to track message delivery. When a consumer receives a message, it must acknowledge it — otherwise RabbitMQ considers it undelivered and will redeliver it if the consumer disconnects.

### ACK Modes

**Manual ACK (recommended for production):**
The consumer explicitly acknowledges each message after processing. If the consumer crashes before ACKing, RabbitMQ redelivers the message to another consumer.

**Auto ACK (`noAck: true`):**
The broker considers the message delivered as soon as it's sent to the consumer. If the consumer crashes during processing, the message is lost. Use only for non-critical, lossy workloads.

**NACK and Reject:**
- `nack(deliveryTag, allUpTo, requeue)`: Negatively acknowledge a message. If `requeue` is true, the message goes back to the queue. If false, it's discarded or sent to the dead letter exchange.
- `reject(deliveryTag, requeue)`: Same as nack but for a single message.

```typescript
async function acknowledgementExample(): Promise<void> {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  const queue = 'task-queue';
  await channel.assertQueue(queue, { durable: true });

  // Process one message at a time
  await channel.prefetch(1);

  channel.consume(queue, async (msg) => {
    if (!msg) return;

    try {
      const task = JSON.parse(msg.content.toString());
      await processTask(task);

      // Success: acknowledge the message
      channel.ack(msg);
    } catch (error) {
      const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) as number;

      if (retryCount < 3) {
        // Retry: nack without requeue, let dead letter exchange handle retry
        // Or: republish with incremented retry count
        channel.nack(msg, false, false);
      } else {
        // Max retries exceeded: reject permanently
        // If dead letter exchange is configured, message goes there
        channel.reject(msg, false);
      }
    }
  }, { noAck: false }); // Manual acknowledgement
}
```

### Prefetch (QoS)

The `prefetch` setting controls how many unacknowledged messages RabbitMQ sends to a consumer at a time. Without prefetch, RabbitMQ pushes all available messages to consumers in round-robin, which can overwhelm a slow consumer while a fast consumer sits idle.

```typescript
// Consumer receives at most 10 unacknowledged messages at a time
await channel.prefetch(10);

// Per-channel prefetch (applies to all consumers on this channel)
await channel.prefetch(10, false);

// Global prefetch (applies across all channels on this connection)
await channel.prefetch(100, true);
```

**Tuning prefetch:**

- `prefetch = 1`: Fair dispatch. Each consumer gets one message at a time. Low throughput but ensures no consumer is overwhelmed. Use for slow, CPU-intensive tasks.
- `prefetch = 10–50`: Good balance. Consumer has a buffer of messages to process without waiting for the next fetch.
- `prefetch = 0 (unlimited)`: RabbitMQ pushes all messages. High throughput but can overwhelm consumers and waste memory if messages are large.

## Publisher Confirms

By default, when a producer publishes a message, it has no way to know if the broker received and persisted it. The `publish()` call returns immediately. If the broker crashes or the network drops, the message is silently lost.

**Publisher confirms** solve this. When enabled, the broker sends a confirmation (ACK or NACK) back to the producer for each published message.

```typescript
async function publisherConfirmsExample(): Promise<void> {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createConfirmChannel(); // Confirm channel

  const exchange = 'orders';
  await channel.assertExchange(exchange, 'direct', { durable: true });

  // publish() now returns a promise that resolves when the broker confirms
  try {
    await new Promise<void>((resolve, reject) => {
      channel.publish(
        exchange,
        'order.created',
        Buffer.from(JSON.stringify({ orderId: 'ord-123' })),
        { persistent: true },
        (err) => {
          if (err) {
            reject(new Error(`Message was nacked: ${err.message}`));
          } else {
            resolve();
          }
        },
      );
    });
    console.log('Message confirmed by broker');
  } catch (error) {
    console.error('Message was NOT confirmed:', error);
    // Retry or handle failure
  }
}

// Batch confirm pattern for higher throughput
async function batchPublishWithConfirms(): Promise<void> {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createConfirmChannel();

  const messages = Array.from({ length: 1000 }, (_, i) => ({
    orderId: `ord-${i}`,
    amount: Math.random() * 100,
  }));

  // Publish all messages
  for (const msg of messages) {
    channel.publish('orders', 'order.created', Buffer.from(JSON.stringify(msg)), {
      persistent: true,
    });
  }

  // Wait for all confirms
  await channel.waitForConfirms();
  console.log('All 1000 messages confirmed');
}
```

## Dead Letter Exchanges (DLX)

A dead letter exchange is a regular exchange that receives messages that were "dead-lettered" from a queue. Messages are dead-lettered when:

1. The message is rejected (`nack` or `reject` with `requeue = false`)
2. The message's TTL expires
3. The queue exceeds its maximum length

```mermaid
graph LR
    P[Producer] --> E[Main Exchange]
    E --> Q[Task Queue]
    Q -->|rejected / expired / overflow| DLX[Dead Letter<br/>Exchange]
    DLX --> DLQ[Dead Letter Queue]
    DLQ --> PROC[DLQ Processor<br/>Retry / Alert / Log]

    style DLX fill:#e03131,color:#fff
    style DLQ fill:#868e96,color:#fff
```

```typescript
async function deadLetterExchangeSetup(): Promise<void> {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  // Set up the dead letter exchange and queue
  const dlxExchange = 'tasks.dlx';
  await channel.assertExchange(dlxExchange, 'direct', { durable: true });

  const dlqQueue = 'tasks.dead-letter';
  await channel.assertQueue(dlqQueue, { durable: true });
  await channel.bindQueue(dlqQueue, dlxExchange, 'task-queue');

  // Set up the main queue with dead letter exchange
  const mainQueue = 'task-queue';
  await channel.assertQueue(mainQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': dlxExchange,
      'x-dead-letter-routing-key': 'task-queue',
      'x-message-ttl': 60000, // Messages expire after 60 seconds if not consumed
      'x-max-length': 10000,  // Queue holds at most 10,000 messages
    },
  });

  // Main exchange
  const mainExchange = 'tasks';
  await channel.assertExchange(mainExchange, 'direct', { durable: true });
  await channel.bindQueue(mainQueue, mainExchange, 'process');

  // Consume from main queue
  await channel.prefetch(1);
  channel.consume(mainQueue, async (msg) => {
    if (!msg) return;

    try {
      await processTask(JSON.parse(msg.content.toString()));
      channel.ack(msg);
    } catch (error) {
      // Reject without requeue — sends to DLX
      channel.reject(msg, false);
    }
  }, { noAck: false });

  // Consume from DLQ for monitoring/retry
  channel.consume(dlqQueue, async (msg) => {
    if (!msg) return;

    const originalHeaders = msg.properties.headers;
    const deathInfo = originalHeaders?.['x-death']?.[0];

    console.log('Dead-lettered message:', {
      reason: deathInfo?.reason, // 'rejected', 'expired', 'maxlen'
      queue: deathInfo?.queue,
      exchange: deathInfo?.exchange,
      count: deathInfo?.count,
      time: deathInfo?.time,
    });

    // Process or alert
    channel.ack(msg);
  }, { noAck: false });
}
```

## Priority Queues

RabbitMQ supports priority queues where messages with higher priority are delivered before messages with lower priority. The queue must be declared with a maximum priority level (1–255, recommended max 10 for performance).

```typescript
async function priorityQueueExample(): Promise<void> {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  // Declare a priority queue with max priority 10
  await channel.assertQueue('tasks.priority', {
    durable: true,
    arguments: {
      'x-max-priority': 10,
    },
  });

  // Publish with priority
  channel.sendToQueue('tasks.priority', Buffer.from(JSON.stringify({
    task: 'send-welcome-email',
    userId: 'user-123',
  })), {
    persistent: true,
    priority: 1, // Low priority
  });

  channel.sendToQueue('tasks.priority', Buffer.from(JSON.stringify({
    task: 'process-payment',
    orderId: 'ord-456',
  })), {
    persistent: true,
    priority: 9, // High priority — delivered first
  });
}
```

**Priority queues trade-offs:**

- Higher priority levels use more memory (each level maintains a sub-queue)
- Priority sorting adds CPU overhead
- Under load, low-priority messages may starve
- Keep max priority levels at 10 or fewer

## Quorum Queues

Quorum queues (introduced in RabbitMQ 3.8) are the modern replacement for mirrored queues (now deprecated). They provide a replicated, fault-tolerant queue implementation based on the **Raft consensus protocol**.

### How Quorum Queues Work

A quorum queue replicates each message to a majority (quorum) of nodes in the cluster. For a 5-node cluster, a quorum is 3 nodes. A write is committed when a majority of replicas acknowledge it.

```mermaid
graph TB
    subgraph "Quorum Queue: orders (replication factor 5)"
        L[Leader<br/>Node 1] -->|replicate| F1[Follower<br/>Node 2]
        L -->|replicate| F2[Follower<br/>Node 3]
        L -->|replicate| F3[Follower<br/>Node 4]
        L -->|replicate| F4[Follower<br/>Node 5]
    end

    P[Producer] -->|publish| L
    L -->|consume| C[Consumer]

    Note["Quorum = 3 of 5<br/>Tolerates 2 node failures"]

    style L fill:#e03131,color:#fff
    style F1 fill:#1971c2,color:#fff
    style F2 fill:#1971c2,color:#fff
    style F3 fill:#868e96,color:#fff
    style F4 fill:#868e96,color:#fff
```

### Quorum Queues vs Classic Queues

| Feature | Classic Queue | Quorum Queue |
|---|---|---|
| Replication | None (single node) or mirrored (deprecated) | Raft-based replication |
| Data safety | Messages can be lost on node failure | Messages survive minority node failures |
| Performance | Higher throughput for transient messages | Slightly lower throughput due to replication |
| Non-durable messages | Supported | Not supported (always durable) |
| Priority | Supported | Not supported |
| Lazy mode | Supported | Not applicable (similar behavior built-in) |
| Poison message handling | Manual | Built-in delivery count tracking |

```typescript
async function quorumQueueExample(): Promise<void> {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();

  // Declare a quorum queue
  await channel.assertQueue('orders.quorum', {
    durable: true, // Must be durable
    arguments: {
      'x-queue-type': 'quorum',
      'x-quorum-initial-group-size': 3, // Number of replicas
      'x-delivery-limit': 5, // Max delivery attempts before dead-lettering
      'x-dead-letter-exchange': 'orders.dlx',
      'x-dead-letter-routing-key': 'orders.dead',
    },
  });

  // Usage is identical to classic queues
  channel.sendToQueue('orders.quorum', Buffer.from(JSON.stringify({
    orderId: 'ord-789',
    action: 'process',
  })), { persistent: true });
}
```

### Poison Message Handling in Quorum Queues

Quorum queues track a delivery count for each message. When a message is redelivered (because the consumer crashed or rejected it), the count increments. When it exceeds `x-delivery-limit`, the message is automatically dead-lettered. This is a significant improvement over classic queues where you had to track retry counts manually in message headers.

## Clustering

RabbitMQ clustering connects multiple nodes into a single logical broker. All nodes share:

- Exchange and queue metadata (definitions)
- Users, vhosts, permissions, policies
- Runtime parameters

**But not message data.** By default, messages in a classic queue exist only on the node that owns the queue. If that node goes down, the queue is unavailable. Quorum queues solve this by replicating messages across multiple nodes.

### Cluster Formation

```bash
# On node 2, join node 1's cluster
rabbitmqctl stop_app
rabbitmqctl join_cluster rabbit@node1
rabbitmqctl start_app

# On node 3, join the same cluster
rabbitmqctl stop_app
rabbitmqctl join_cluster rabbit@node1
rabbitmqctl start_app
```

### Node Types

- **Disc node:** Stores metadata on disk. At least one disc node is required.
- **RAM node:** Stores metadata in memory only. Faster for metadata operations but loses metadata on restart. Rarely needed with modern hardware.

### Client Connection and Queue Location

Clients can connect to any node in the cluster. If a client connects to Node 2 but consumes from a queue owned by Node 1, Node 2 proxies the messages from Node 1. This adds latency. For optimal performance:

- Use a load balancer that distributes connections across nodes
- Use `x-queue-master-locator` to control which node owns a queue
- Use quorum queues so the leader can be on any node

## Federation

Federation connects separate RabbitMQ clusters (or individual brokers) across WANs. Unlike clustering (which requires low-latency LAN), federation works over unreliable, high-latency networks.

Federation works at the exchange or queue level:

- **Federated exchange:** Messages published to an exchange in one cluster are replicated to a corresponding exchange in another cluster.
- **Federated queue:** Messages in a queue in one cluster are moved to a corresponding queue in another cluster when consumers request them.

```mermaid
graph LR
    subgraph "Datacenter US"
        E1[Exchange: orders]
        Q1[Queue: us-orders]
        E1 --> Q1
    end

    subgraph "Datacenter EU"
        E2[Exchange: orders<br/>federated]
        Q2[Queue: eu-orders]
        E2 --> Q2
    end

    E1 -.->|Federation Link<br/>over WAN| E2

    style E1 fill:#ff922b,color:#fff
    style E2 fill:#ff922b,color:#fff
```

Use cases:

- Geo-distributed processing (orders in the US are also available in the EU cluster)
- Aggregating messages from multiple sites to a central cluster
- Migrating between clusters

## Shovel Plugin

The Shovel plugin moves messages from a queue in one broker to an exchange or queue in another broker. It's simpler than federation — it's essentially a built-in consumer that republishes messages to a different destination.

```json
{
  "src-uri": "amqp://source-broker",
  "src-queue": "source-queue",
  "dest-uri": "amqp://destination-broker",
  "dest-exchange": "destination-exchange",
  "dest-exchange-key": "routing.key",
  "ack-mode": "on-confirm",
  "reconnect-delay": 5
}
```

**Shovel vs Federation:**

| Feature | Shovel | Federation |
|---|---|---|
| Granularity | Queue-to-exchange or queue-to-queue | Exchange-to-exchange or queue-to-queue |
| Configuration | Per-shovel | Per-upstream |
| Topology | Point-to-point | Mesh-capable |
| Use case | Simple migration, one-way replication | Multi-datacenter messaging |

## Monitoring with Management UI

RabbitMQ's management plugin provides an HTTP API and web UI for monitoring and management.

### Key Metrics to Monitor

| Metric | What It Means | Alert When |
|---|---|---|
| Queue depth | Number of messages waiting in each queue | Growing over time (consumers too slow) |
| Consumer count | Number of active consumers per queue | Drops to 0 (consumer crash) |
| Message rates | Publish, deliver, acknowledge rates | Publish >> deliver (queue growing) |
| Unacknowledged messages | Messages delivered but not yet acked | Growing (consumer processing too slow or stuck) |
| Memory usage | Broker memory consumption | Approaching memory alarm threshold |
| Disk space | Available disk on the broker | Approaching disk alarm threshold |
| Connection/channel count | Open connections and channels | Unexpected spikes (connection leak) |
| Node availability | Cluster node health | Any node down |

### Management HTTP API

```typescript
// Query RabbitMQ management API for queue metrics
async function getQueueMetrics(queueName: string): Promise<QueueMetrics> {
  const response = await fetch(
    `http://rabbitmq-host:15672/api/queues/%2F/${queueName}`,
    {
      headers: {
        Authorization: 'Basic ' + Buffer.from('guest:guest').toString('base64'),
      },
    },
  );

  const data = await response.json();

  return {
    name: data.name,
    messages: data.messages,
    messagesReady: data.messages_ready,
    messagesUnacknowledged: data.messages_unacknowledged,
    consumers: data.consumers,
    publishRate: data.message_stats?.publish_details?.rate ?? 0,
    deliverRate: data.message_stats?.deliver_get_details?.rate ?? 0,
    ackRate: data.message_stats?.ack_details?.rate ?? 0,
    memory: data.memory,
    state: data.state,
  };
}

interface QueueMetrics {
  name: string;
  messages: number;
  messagesReady: number;
  messagesUnacknowledged: number;
  consumers: number;
  publishRate: number;
  deliverRate: number;
  ackRate: number;
  memory: number;
  state: string;
}
```

## Complete Application Example

A robust RabbitMQ consumer with connection recovery, graceful shutdown, and structured error handling:

```typescript
import amqp, { Channel, Connection, ConsumeMessage } from 'amqplib';

interface RabbitConfig {
  url: string;
  exchange: string;
  queue: string;
  routingKey: string;
  prefetch: number;
  maxRetries: number;
}

class RabbitMQConsumer {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isShuttingDown = false;

  constructor(private config: RabbitConfig) {}

  async start(): Promise<void> {
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    await this.connect();
    await this.setupTopology();
    await this.startConsuming();
  }

  private async connect(): Promise<void> {
    this.connection = await amqp.connect(this.config.url);

    this.connection.on('error', (err) => {
      console.error('Connection error:', err);
      if (!this.isShuttingDown) {
        setTimeout(() => this.reconnect(), 5000);
      }
    });

    this.connection.on('close', () => {
      if (!this.isShuttingDown) {
        console.log('Connection closed, reconnecting...');
        setTimeout(() => this.reconnect(), 5000);
      }
    });

    this.channel = await this.connection.createChannel();

    this.channel.on('error', (err) => {
      console.error('Channel error:', err);
    });
  }

  private async reconnect(): Promise<void> {
    try {
      await this.connect();
      await this.setupTopology();
      await this.startConsuming();
      console.log('Reconnected successfully');
    } catch (error) {
      console.error('Reconnection failed:', error);
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  private async setupTopology(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    // Main exchange and queue
    await this.channel.assertExchange(this.config.exchange, 'topic', { durable: true });

    // Dead letter exchange and queue
    const dlxExchange = `${this.config.exchange}.dlx`;
    await this.channel.assertExchange(dlxExchange, 'direct', { durable: true });

    const dlqQueue = `${this.config.queue}.dlq`;
    await this.channel.assertQueue(dlqQueue, { durable: true });
    await this.channel.bindQueue(dlqQueue, dlxExchange, this.config.queue);

    // Main queue with DLX
    await this.channel.assertQueue(this.config.queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': dlxExchange,
        'x-dead-letter-routing-key': this.config.queue,
      },
    });
    await this.channel.bindQueue(this.config.queue, this.config.exchange, this.config.routingKey);
  }

  private async startConsuming(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    await this.channel.prefetch(this.config.prefetch);

    this.channel.consume(this.config.queue, async (msg) => {
      if (!msg) return;
      await this.handleMessage(msg);
    }, { noAck: false });

    console.log(`Consuming from ${this.config.queue}`);
  }

  private async handleMessage(msg: ConsumeMessage): Promise<void> {
    if (!this.channel) return;

    const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) as number;

    try {
      const payload = JSON.parse(msg.content.toString());
      await this.processMessage(payload);
      this.channel.ack(msg);
    } catch (error) {
      if (retryCount < this.config.maxRetries) {
        // Republish with incremented retry count and delay
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);

        setTimeout(() => {
          this.channel?.publish(
            this.config.exchange,
            this.config.routingKey,
            msg.content,
            {
              persistent: true,
              headers: {
                ...msg.properties.headers,
                'x-retry-count': retryCount + 1,
                'x-original-exchange': msg.fields.exchange,
                'x-original-routing-key': msg.fields.routingKey,
                'x-error-message': (error as Error).message,
              },
            },
          );
          this.channel?.ack(msg);
        }, delay);
      } else {
        // Max retries exceeded — reject to DLX
        console.error(`Message exceeded max retries (${this.config.maxRetries}):`, error);
        this.channel.reject(msg, false);
      }
    }
  }

  private async processMessage(payload: unknown): Promise<void> {
    // Your business logic here
    console.log('Processing:', payload);
  }

  private async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    console.log('Shutting down...');

    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      console.log('Disconnected gracefully');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }

    process.exit(0);
  }
}

// Usage
const consumer = new RabbitMQConsumer({
  url: 'amqp://user:password@rabbitmq-host:5672',
  exchange: 'order-events',
  queue: 'order-processor',
  routingKey: 'order.#',
  prefetch: 10,
  maxRetries: 5,
});

consumer.start().catch(console.error);
```

## When to Choose RabbitMQ

**Choose RabbitMQ when:**

- You need flexible routing (topic, headers, fan-out patterns)
- Your use case is task queues / work distribution
- You want messages to be consumed once and deleted
- You need priority queues
- You want a mature, well-documented broker with excellent management tools
- Your message volume is moderate (tens of thousands per second, not millions)

**Choose something else when:**

- You need message replay (Kafka retains messages; RabbitMQ deletes them after ACK)
- You need millions of messages per second per topic (Kafka scales better for high throughput)
- You need exactly-once processing guarantees (Kafka has built-in EOS; RabbitMQ requires application-level idempotency)
- You need long-term event storage (Kafka is a log; RabbitMQ is a queue)
