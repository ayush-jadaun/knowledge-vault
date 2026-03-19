<script setup lang="ts">
import { ref, computed } from 'vue'

interface Technology {
  name: string
  category: string
  description: string
  strengths: string[]
  weaknesses: string[]
  bestFor: string[]
  avoid: string[]
  specs: Record<string, string>
  link: string
}

const technologies: Technology[] = [
  {
    name: 'Kafka', category: 'Message Queues',
    description: 'Distributed event streaming platform for high-throughput, fault-tolerant messaging.',
    strengths: ['Extreme throughput (millions/sec)', 'Persistent log', 'Replay capability', 'Partitioned parallelism', 'Exactly-once semantics'],
    weaknesses: ['Complex operations', 'High latency for single messages', 'Heavy resource usage', 'Steep learning curve'],
    bestFor: ['Event sourcing', 'Log aggregation', 'Stream processing', 'Activity tracking', 'Data pipelines'],
    avoid: ['Simple task queues', 'Low-latency RPC', 'Small deployments'],
    specs: { 'Throughput': '1M+ msg/sec', 'Latency': '5-50ms', 'Ordering': 'Per-partition', 'Delivery': 'At-least-once / Exactly-once', 'Persistence': 'Disk-based log', 'Protocol': 'TCP binary' },
    link: '/system-design/message-queues/kafka-internals',
  },
  {
    name: 'RabbitMQ', category: 'Message Queues',
    description: 'Traditional message broker with flexible routing and protocol support.',
    strengths: ['Flexible routing (exchanges)', 'Multiple protocols (AMQP, MQTT, STOMP)', 'Priority queues', 'Low latency', 'Easy to operate'],
    weaknesses: ['Lower throughput than Kafka', 'No message replay', 'Single node bottleneck', 'Memory pressure under load'],
    bestFor: ['Task queues', 'RPC patterns', 'Complex routing', 'IoT messaging', 'Microservice communication'],
    avoid: ['Event sourcing', 'High-throughput streaming', 'Long-term message storage'],
    specs: { 'Throughput': '20-50K msg/sec', 'Latency': '1-5ms', 'Ordering': 'Per-queue (FIFO)', 'Delivery': 'At-least-once / At-most-once', 'Persistence': 'Optional per-queue', 'Protocol': 'AMQP 0.9.1' },
    link: '/system-design/message-queues/rabbitmq-internals',
  },
  {
    name: 'Redis Streams', category: 'Message Queues',
    description: 'Lightweight append-only log built into Redis for simple streaming use cases.',
    strengths: ['Sub-millisecond latency', 'Built into Redis', 'Consumer groups', 'Simple API', 'Low resource usage'],
    weaknesses: ['Memory-bound', 'No complex routing', 'Limited ecosystem', 'Persistence concerns'],
    bestFor: ['Real-time notifications', 'Lightweight event bus', 'Chat systems', 'Activity feeds'],
    avoid: ['Large-scale event sourcing', 'Complex routing needs', 'Guaranteed delivery requirements'],
    specs: { 'Throughput': '100K+ msg/sec', 'Latency': '<1ms', 'Ordering': 'Per-stream', 'Delivery': 'At-least-once', 'Persistence': 'RDB/AOF', 'Protocol': 'RESP' },
    link: '/system-design/message-queues/redis-streams',
  },
  {
    name: 'PostgreSQL', category: 'Databases',
    description: 'Advanced open-source relational database with extensibility and standards compliance.',
    strengths: ['ACID compliance', 'Advanced indexing (B-tree, GiST, GIN, BRIN)', 'JSON support', 'Full-text search', 'Extensible (extensions)', 'Mature ecosystem'],
    weaknesses: ['Write-heavy scaling', 'No built-in sharding', 'Complex replication setup', 'Vacuum overhead'],
    bestFor: ['OLTP workloads', 'Complex queries', 'Geospatial data', 'JSON + relational hybrid', 'Financial systems'],
    avoid: ['Simple key-value lookups at scale', 'Time-series at extreme scale', 'Document-only workloads'],
    specs: { 'Model': 'Relational', 'Consistency': 'Strong (ACID)', 'Scaling': 'Vertical + read replicas', 'Max size': '32TB per table', 'Indexing': 'B-tree, Hash, GiST, GIN, BRIN', 'License': 'PostgreSQL (MIT-like)' },
    link: '/system-design/databases/postgres-internals',
  },
  {
    name: 'MongoDB', category: 'Databases',
    description: 'Document database designed for flexible schemas and horizontal scaling.',
    strengths: ['Flexible schema', 'Horizontal scaling (sharding)', 'Rich query language', 'Aggregation pipeline', 'Change streams'],
    weaknesses: ['No multi-document ACID (before 4.0)', 'Memory hungry', 'WiredTiger lock contention', 'Join performance'],
    bestFor: ['Content management', 'Product catalogs', 'Real-time analytics', 'IoT data', 'Rapid prototyping'],
    avoid: ['Financial transactions', 'Complex joins', 'Strong consistency requirements', 'Small datasets'],
    specs: { 'Model': 'Document (BSON)', 'Consistency': 'Tunable (eventual to strong)', 'Scaling': 'Horizontal (sharding)', 'Max doc': '16MB', 'Indexing': 'B-tree, Text, Geospatial, Hashed', 'License': 'SSPL' },
    link: '/system-design/databases/mongodb-internals',
  },
  {
    name: 'Redis', category: 'Databases',
    description: 'In-memory data store used as cache, database, and message broker.',
    strengths: ['Sub-millisecond latency', 'Rich data structures', 'Pub/Sub', 'Lua scripting', 'Cluster mode'],
    weaknesses: ['Memory-bound', 'Single-threaded (mostly)', 'Persistence trade-offs', 'No complex queries'],
    bestFor: ['Caching', 'Session storage', 'Rate limiting', 'Leaderboards', 'Real-time analytics'],
    avoid: ['Primary database for large datasets', 'Complex relational queries', 'Data larger than RAM'],
    specs: { 'Model': 'Key-value + data structures', 'Consistency': 'Eventual (cluster)', 'Scaling': 'Horizontal (cluster)', 'Latency': '<1ms', 'Persistence': 'RDB + AOF', 'License': 'RSALv2 / SSPL' },
    link: '/system-design/databases/redis-internals',
  },
  {
    name: 'Docker', category: 'Infrastructure',
    description: 'Container runtime for packaging and running applications in isolated environments.',
    strengths: ['Consistent environments', 'Fast startup', 'Image layering', 'Huge ecosystem', 'Easy local dev'],
    weaknesses: ['Not a VM (shared kernel)', 'Security surface', 'Image bloat', 'Networking complexity'],
    bestFor: ['Microservices', 'CI/CD pipelines', 'Dev environments', 'Application packaging'],
    avoid: ['Heavy stateful workloads (use VMs)', 'When bare metal performance matters', 'Legacy Windows apps'],
    specs: { 'Isolation': 'Namespaces + cgroups', 'Startup': '< 1 second', 'Image format': 'OCI', 'Networking': 'Bridge, Host, Overlay', 'Storage': 'OverlayFS', 'Orchestration': 'Docker Compose, K8s, Swarm' },
    link: '/infrastructure/docker/',
  },
  {
    name: 'Kubernetes', category: 'Infrastructure',
    description: 'Container orchestration platform for automating deployment, scaling, and management.',
    strengths: ['Auto-scaling', 'Self-healing', 'Service discovery', 'Rolling updates', 'Declarative config', 'Massive ecosystem'],
    weaknesses: ['Extremely complex', 'High resource overhead', 'Steep learning curve', 'Overkill for small teams'],
    bestFor: ['Large microservice deployments', 'Multi-cloud strategy', 'High availability requirements', 'Complex scaling needs'],
    avoid: ['Simple single-service apps', 'Teams < 5 engineers', 'When managed PaaS works (Heroku, Railway)'],
    specs: { 'Scaling': 'HPA, VPA, KEDA', 'Networking': 'Services, Ingress, Network Policies', 'Storage': 'PV, PVC, CSI', 'Config': 'ConfigMaps, Secrets', 'Deploy': 'Deployments, StatefulSets, DaemonSets', 'Min nodes': '3 (production)' },
    link: '/infrastructure/kubernetes/',
  },
  {
    name: 'ECS Fargate', category: 'Infrastructure',
    description: 'AWS serverless container platform — run containers without managing servers.',
    strengths: ['No cluster management', 'Pay per task', 'Deep AWS integration', 'Simple mental model', 'Fast to set up'],
    weaknesses: ['AWS lock-in', 'Limited customization', 'Cold start latency', 'Higher cost at scale vs EC2'],
    bestFor: ['AWS-native teams', 'Small-medium deployments', 'Teams wanting simplicity', 'Batch jobs'],
    avoid: ['Multi-cloud strategy', 'Complex scheduling needs', 'Cost-sensitive large deployments'],
    specs: { 'Scaling': 'Auto (target tracking)', 'Networking': 'awsvpc mode', 'Max CPU': '16 vCPU per task', 'Max Memory': '120GB per task', 'Pricing': 'Per vCPU + memory/sec', 'Deploy': 'Task definitions + services' },
    link: '/infrastructure/aws/ecs-vs-eks',
  },
  {
    name: 'SQS', category: 'Message Queues',
    description: 'AWS managed message queue service — fully serverless, zero ops.',
    strengths: ['Zero operations', 'Infinite scale', 'Dead letter queues', 'FIFO support', 'Pay per message'],
    weaknesses: ['AWS lock-in', 'Max 256KB message', '14 day retention max', 'No replay', 'Higher latency'],
    bestFor: ['AWS-native workloads', 'Decoupling microservices', 'Task queues', 'Fan-out with SNS'],
    avoid: ['Event sourcing', 'Cross-cloud', 'Real-time streaming', 'Large messages'],
    specs: { 'Throughput': 'Unlimited (standard)', 'Latency': '10-50ms', 'Ordering': 'FIFO optional', 'Delivery': 'At-least-once / Exactly-once (FIFO)', 'Persistence': 'Managed', 'Max message': '256KB' },
    link: '/system-design/message-queues/sqs-sns',
  },
  {
    name: 'NATS', category: 'Message Queues',
    description: 'Lightweight cloud-native messaging system with at-most-once and JetStream persistence.',
    strengths: ['Extremely lightweight', 'Sub-ms latency', 'Simple protocol', 'Built-in clustering', 'JetStream for persistence'],
    weaknesses: ['Smaller ecosystem', 'At-most-once by default', 'Less enterprise tooling', 'Fewer integrations'],
    bestFor: ['IoT messaging', 'Edge computing', 'Microservice communication', 'Request-reply patterns'],
    avoid: ['Guaranteed delivery without JetStream', 'Complex routing', 'Large enterprise with compliance needs'],
    specs: { 'Throughput': '10M+ msg/sec', 'Latency': '<0.5ms', 'Ordering': 'Per-subject', 'Delivery': 'At-most-once / At-least-once (JetStream)', 'Persistence': 'JetStream', 'Protocol': 'TCP text' },
    link: '/system-design/message-queues/nats',
  },
  {
    name: 'MySQL', category: 'Databases',
    description: 'Most popular open-source relational database — simple, reliable, well-understood.',
    strengths: ['Battle-tested', 'Simple to operate', 'InnoDB MVCC', 'Great replication', 'Huge ecosystem'],
    weaknesses: ['Limited JSON support vs Postgres', 'No partial indexes', 'Weaker query planner', 'No UPSERT until 8.0'],
    bestFor: ['Web applications', 'WordPress/CMS', 'Read-heavy workloads', 'Simple CRUD apps'],
    avoid: ['Complex analytical queries', 'Advanced data types', 'Full-text search at scale'],
    specs: { 'Model': 'Relational', 'Consistency': 'Strong (ACID)', 'Scaling': 'Vertical + read replicas', 'Engine': 'InnoDB (default)', 'Replication': 'Async/Semi-sync/Group', 'License': 'GPL v2' },
    link: '/system-design/databases/',
  },
  {
    name: 'DynamoDB', category: 'Databases',
    description: 'AWS fully managed NoSQL key-value and document database — infinite scale, zero ops.',
    strengths: ['Single-digit ms latency', 'Infinite scale', 'Zero operations', 'Global tables', 'DAX caching'],
    weaknesses: ['AWS lock-in', 'Expensive at scale', 'Limited query flexibility', '400KB item limit', 'Complex data modeling'],
    bestFor: ['Serverless apps', 'Session stores', 'Gaming leaderboards', 'IoT data', 'Single-table design'],
    avoid: ['Ad-hoc queries', 'Complex joins', 'When you need SQL', 'Small budget large data'],
    specs: { 'Model': 'Key-value + Document', 'Consistency': 'Eventually / Strong (per-read)', 'Scaling': 'Horizontal (auto)', 'Max item': '400KB', 'Indexing': 'GSI, LSI', 'Pricing': 'Per RCU/WCU or on-demand' },
    link: '/system-design/databases/',
  },
  {
    name: 'ClickHouse', category: 'Databases',
    description: 'Column-oriented OLAP database for real-time analytics on massive datasets.',
    strengths: ['Blazing fast aggregations', '100x faster than Postgres for analytics', 'Column compression', 'Real-time ingestion', 'SQL compatible'],
    weaknesses: ['No transactions', 'No UPDATE/DELETE (MergeTree)', 'Not for OLTP', 'Complex cluster ops', 'Memory hungry'],
    bestFor: ['Analytics dashboards', 'Log analysis', 'Time-series', 'Event tracking', 'Real-time reporting'],
    avoid: ['Transactional workloads', 'Frequent updates', 'Small datasets', 'Simple CRUD'],
    specs: { 'Model': 'Columnar', 'Consistency': 'Eventual', 'Scaling': 'Horizontal (sharding)', 'Compression': '10-40x', 'Ingestion': '1M+ rows/sec', 'Query': 'SQL dialect' },
    link: '/production-blueprints/analytics-pipeline/storage-clickhouse',
  },
  {
    name: 'Elasticsearch', category: 'Databases',
    description: 'Distributed search and analytics engine built on Apache Lucene.',
    strengths: ['Full-text search', 'Near real-time', 'Aggregation framework', 'Schema-free', 'Kibana integration'],
    weaknesses: ['Resource heavy (RAM)', 'Split-brain risk', 'No transactions', 'Complex cluster management', 'License concerns'],
    bestFor: ['Full-text search', 'Log aggregation (ELK)', 'E-commerce search', 'Geospatial queries', 'Autocomplete'],
    avoid: ['Primary database', 'Transactional data', 'Small datasets', 'Budget-constrained'],
    specs: { 'Model': 'Document (inverted index)', 'Consistency': 'Near real-time', 'Scaling': 'Horizontal (sharding)', 'Latency': '10-100ms', 'Storage': 'Lucene segments', 'License': 'SSPL / Elastic License' },
    link: '/system-design-interviews/search-engine',
  },
  {
    name: 'Terraform', category: 'Infrastructure',
    description: 'Infrastructure as Code tool for provisioning and managing cloud resources declaratively.',
    strengths: ['Multi-cloud', 'Declarative', 'State management', 'Module system', 'Plan before apply', 'Huge provider ecosystem'],
    weaknesses: ['State file management', 'HCL learning curve', 'Drift detection limited', 'Slow for large infra', 'BSL license'],
    bestFor: ['Multi-cloud infrastructure', 'Reproducible environments', 'Team infrastructure management'],
    avoid: ['Simple single-server deploys', 'When Pulumi/CDK fits better', 'Rapidly changing prototypes'],
    specs: { 'Language': 'HCL', 'State': 'Local/Remote (S3, etc.)', 'Providers': '3000+', 'Execution': 'Plan → Apply', 'Modules': 'Terraform Registry', 'License': 'BSL 1.1' },
    link: '/infrastructure/terraform/',
  },
  {
    name: 'GitHub Actions', category: 'CI/CD',
    description: 'CI/CD platform built into GitHub — workflows triggered by repository events.',
    strengths: ['Native GitHub integration', 'Marketplace (20K+ actions)', 'Matrix builds', 'Free for public repos', 'OIDC for cloud auth'],
    weaknesses: ['Vendor lock-in', '6hr job limit', 'Limited self-hosted runner features', 'YAML complexity', 'Debugging is painful'],
    bestFor: ['GitHub-hosted projects', 'Open source CI/CD', 'Standard build/test/deploy', 'Multi-platform builds'],
    avoid: ['Complex pipelines (use Jenkins)', 'Non-GitHub repos', 'Long-running jobs'],
    specs: { 'Runners': 'Ubuntu, Windows, macOS', 'Concurrency': '20 parallel (free)', 'Artifacts': '90 day retention', 'Secrets': 'Encrypted, per-repo/org', 'Trigger': 'Push, PR, schedule, manual', 'Pricing': 'Free (public) / 2000 min/mo (free private)' },
    link: '/infrastructure/ci-cd/github-actions-deep-dive',
  },
  {
    name: 'GitLab CI', category: 'CI/CD',
    description: 'Integrated CI/CD within GitLab — pipeline-as-code with built-in container registry.',
    strengths: ['All-in-one platform', 'Auto DevOps', 'Built-in container registry', 'DAG pipelines', 'Self-hosted option'],
    weaknesses: ['Resource heavy (self-hosted)', 'Slower UI', 'Complex YAML', 'Smaller marketplace than GitHub'],
    bestFor: ['Enterprise teams wanting all-in-one', 'Self-hosted CI/CD', 'Compliance-heavy environments'],
    avoid: ['Small teams (overkill)', 'GitHub-centric workflows'],
    specs: { 'Runners': 'Docker, Kubernetes, Shell', 'Pipelines': 'DAG support', 'Registry': 'Built-in', 'Security': 'SAST/DAST built-in', 'Trigger': 'Push, MR, schedule, API', 'Pricing': 'Free tier / Premium / Ultimate' },
    link: '/infrastructure/ci-cd/gitlab-ci',
  },
  {
    name: 'AWS Lambda', category: 'Compute',
    description: 'Serverless compute — run code without provisioning servers, pay per invocation.',
    strengths: ['Zero server management', 'Scale to zero', 'Pay per ms', 'Event-driven', '15 min max duration'],
    weaknesses: ['Cold starts', 'Vendor lock-in', '15 min timeout', '10GB memory max', 'Debugging difficulty', 'No persistent connections'],
    bestFor: ['API backends', 'Event processing', 'Scheduled tasks', 'Webhooks', 'Image processing'],
    avoid: ['Long-running processes', 'WebSocket servers', 'High-throughput streaming', 'GPU workloads'],
    specs: { 'Memory': '128MB - 10GB', 'Timeout': '15 min max', 'Cold start': '100ms - 10s', 'Concurrency': '1000 default (adjustable)', 'Pricing': '$0.20 per 1M invocations', 'Languages': 'Node, Python, Go, Java, .NET, Rust' },
    link: '/infrastructure/aws/lambda',
  },
  {
    name: 'Cloud Run', category: 'Compute',
    description: 'GCP fully managed container platform — deploy containers, scale to zero.',
    strengths: ['Container-based (portable)', 'Scale to zero', 'Pay per request', 'Up to 60 min timeout', 'Concurrency per instance'],
    weaknesses: ['GCP lock-in', 'Cold starts', 'No persistent disk', 'Limited GPU'],
    bestFor: ['Containerized APIs', 'Microservices', 'Background jobs', 'Internal tools'],
    avoid: ['Stateful workloads', 'GPU compute', 'Ultra-low latency requirements'],
    specs: { 'CPU': 'Up to 8 vCPU', 'Memory': 'Up to 32GB', 'Timeout': '60 min', 'Concurrency': '1000 per instance', 'Scaling': 'Auto (0 to N)', 'Pricing': 'Per vCPU-second + memory + requests' },
    link: '/infrastructure/gcp/cloud-run',
  },
  {
    name: 'Prometheus', category: 'Monitoring',
    description: 'Open-source metrics monitoring and alerting system with a powerful query language.',
    strengths: ['Pull-based model', 'PromQL', 'Service discovery', 'Alertmanager', 'Grafana integration', 'CNCF graduated'],
    weaknesses: ['No long-term storage (needs Thanos/Cortex)', 'Pull-only', 'Cardinality issues', 'No distributed mode natively'],
    bestFor: ['Kubernetes monitoring', 'Microservice metrics', 'Alert-based operations', 'Infrastructure monitoring'],
    avoid: ['Log aggregation (use Loki)', 'Long-term storage without Thanos', 'High-cardinality metrics'],
    specs: { 'Model': 'Time-series (TSDB)', 'Collection': 'Pull (scrape)', 'Query': 'PromQL', 'Storage': 'Local TSDB (15d default)', 'Alerting': 'Alertmanager', 'License': 'Apache 2.0' },
    link: '/devops/monitoring/prometheus-deep-dive',
  },
  {
    name: 'Grafana', category: 'Monitoring',
    description: 'Open-source visualization and dashboarding platform for metrics, logs, and traces.',
    strengths: ['Beautiful dashboards', 'Multi-datasource', 'Alerting', 'Plugins ecosystem', 'Loki + Tempo integration'],
    weaknesses: ['Not a data store', 'Complex dashboard management', 'Alert fatigue risk', 'Performance with many panels'],
    bestFor: ['Metrics visualization', 'Operational dashboards', 'Multi-source correlation', 'SLO tracking'],
    avoid: ['Data storage (use with Prometheus/InfluxDB)', 'Simple uptime checks (use Uptime Kuma)'],
    specs: { 'Datasources': '100+', 'Alerting': 'Built-in + Alertmanager', 'Auth': 'LDAP, OAuth, SAML', 'Plugins': '1000+', 'Deploy': 'Docker, K8s, binary', 'License': 'AGPL v3' },
    link: '/devops/monitoring/grafana-dashboards',
  },
]

const leftTech = ref<Technology | null>(null)
const rightTech = ref<Technology | null>(null)

const categories = computed(() => [...new Set(technologies.map(t => t.category))])

function selectLeft(tech: Technology) {
  leftTech.value = tech
}

function selectRight(tech: Technology) {
  rightTech.value = tech
}

const allSpecs = computed(() => {
  if (!leftTech.value || !rightTech.value) return []
  const keys = new Set([
    ...Object.keys(leftTech.value.specs),
    ...Object.keys(rightTech.value.specs),
  ])
  return [...keys]
})
</script>

<template>
  <div class="compare-mode">
    <div class="compare-selectors">
      <div class="selector">
        <label>Technology A</label>
        <select @change="selectLeft(technologies.find(t => t.name === ($event.target as HTMLSelectElement).value)!)">
          <option value="">Select...</option>
          <optgroup v-for="cat in categories" :key="cat" :label="cat">
            <option v-for="tech in technologies.filter(t => t.category === cat)" :key="tech.name" :value="tech.name">
              {{ tech.name }}
            </option>
          </optgroup>
        </select>
      </div>
      <div class="vs">VS</div>
      <div class="selector">
        <label>Technology B</label>
        <select @change="selectRight(technologies.find(t => t.name === ($event.target as HTMLSelectElement).value)!)">
          <option value="">Select...</option>
          <optgroup v-for="cat in categories" :key="cat" :label="cat">
            <option v-for="tech in technologies.filter(t => t.category === cat)" :key="tech.name" :value="tech.name">
              {{ tech.name }}
            </option>
          </optgroup>
        </select>
      </div>
    </div>

    <div v-if="leftTech && rightTech" class="compare-table">
      <!-- Descriptions -->
      <div class="compare-row header-row">
        <div class="compare-label"></div>
        <div class="compare-cell left">
          <h3>{{ leftTech.name }}</h3>
          <p>{{ leftTech.description }}</p>
          <a :href="leftTech.link" class="deep-dive-link">Deep dive →</a>
        </div>
        <div class="compare-cell right">
          <h3>{{ rightTech.name }}</h3>
          <p>{{ rightTech.description }}</p>
          <a :href="rightTech.link" class="deep-dive-link">Deep dive →</a>
        </div>
      </div>

      <!-- Specs -->
      <div class="compare-section-title">Specifications</div>
      <div v-for="spec in allSpecs" :key="spec" class="compare-row">
        <div class="compare-label">{{ spec }}</div>
        <div class="compare-cell left">{{ leftTech.specs[spec] || '—' }}</div>
        <div class="compare-cell right">{{ rightTech.specs[spec] || '—' }}</div>
      </div>

      <!-- Strengths -->
      <div class="compare-section-title">Strengths</div>
      <div class="compare-row">
        <div class="compare-label"></div>
        <div class="compare-cell left">
          <ul><li v-for="s in leftTech.strengths" :key="s">{{ s }}</li></ul>
        </div>
        <div class="compare-cell right">
          <ul><li v-for="s in rightTech.strengths" :key="s">{{ s }}</li></ul>
        </div>
      </div>

      <!-- Weaknesses -->
      <div class="compare-section-title">Weaknesses</div>
      <div class="compare-row">
        <div class="compare-label"></div>
        <div class="compare-cell left">
          <ul><li v-for="w in leftTech.weaknesses" :key="w">{{ w }}</li></ul>
        </div>
        <div class="compare-cell right">
          <ul><li v-for="w in rightTech.weaknesses" :key="w">{{ w }}</li></ul>
        </div>
      </div>

      <!-- Best For -->
      <div class="compare-section-title">Best For</div>
      <div class="compare-row">
        <div class="compare-label"></div>
        <div class="compare-cell left">
          <span v-for="b in leftTech.bestFor" :key="b" class="use-tag good">{{ b }}</span>
        </div>
        <div class="compare-cell right">
          <span v-for="b in rightTech.bestFor" :key="b" class="use-tag good">{{ b }}</span>
        </div>
      </div>

      <!-- Avoid When -->
      <div class="compare-section-title">Avoid When</div>
      <div class="compare-row">
        <div class="compare-label"></div>
        <div class="compare-cell left">
          <span v-for="a in leftTech.avoid" :key="a" class="use-tag bad">{{ a }}</span>
        </div>
        <div class="compare-cell right">
          <span v-for="a in rightTech.avoid" :key="a" class="use-tag bad">{{ a }}</span>
        </div>
      </div>
    </div>

    <div v-else class="compare-placeholder">
      Select two technologies above to compare them side-by-side.
    </div>
  </div>
</template>

<style scoped>
.compare-mode { max-width: 100%; margin: 20px 0; }

.compare-selectors {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 24px;
}

.selector { flex: 1; }
.selector label { display: block; font-size: 12px; font-weight: 600; color: var(--vp-c-text-3); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
.selector select {
  width: 100%; padding: 10px 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px;
  background: var(--vp-c-bg); color: var(--vp-c-text-1); font-size: 14px; font-family: inherit;
  cursor: pointer; outline: none;
}
.selector select:focus { border-color: var(--vp-c-brand-1); }

.vs {
  font-size: 18px; font-weight: 800; color: var(--vp-c-text-3);
  padding-bottom: 10px; flex-shrink: 0;
}

.compare-table { border: 1px solid var(--vp-c-divider); border-radius: 12px; overflow: hidden; }

.compare-section-title {
  padding: 10px 16px; font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--vp-c-text-3); background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
}

.compare-row {
  display: grid; grid-template-columns: 140px 1fr 1fr;
  border-bottom: 1px solid var(--vp-c-divider);
}
.compare-row:last-child { border-bottom: none; }
.compare-row.header-row { grid-template-columns: 0px 1fr 1fr; }

.compare-label {
  padding: 12px 16px; font-size: 12px; font-weight: 600; color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft); display: flex; align-items: center;
}

.compare-cell {
  padding: 12px 16px; font-size: 13px; color: var(--vp-c-text-2); line-height: 1.6;
  border-left: 1px solid var(--vp-c-divider);
}

.compare-cell h3 { font-size: 18px; font-weight: 700; color: var(--vp-c-text-1); margin-bottom: 6px; }
.compare-cell p { font-size: 13px; margin-bottom: 8px; }

.deep-dive-link {
  font-size: 13px; color: var(--vp-c-brand-1); text-decoration: none; font-weight: 500;
}
.deep-dive-link:hover { text-decoration: underline; }

.compare-cell ul { margin: 0; padding-left: 16px; }
.compare-cell li { font-size: 13px; margin-bottom: 4px; }

.use-tag {
  display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px;
  margin: 2px 4px 2px 0; font-weight: 500;
}
.use-tag.good { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
.use-tag.bad { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

.compare-placeholder {
  text-align: center; padding: 60px 20px; color: var(--vp-c-text-3); font-size: 14px;
  border: 1px dashed var(--vp-c-divider); border-radius: 12px;
}

@media (max-width: 768px) {
  .compare-row { grid-template-columns: 1fr; }
  .compare-row.header-row { grid-template-columns: 1fr 1fr; }
  .compare-label { border-bottom: 1px solid var(--vp-c-divider); }
  .compare-selectors { flex-direction: column; }
  .vs { text-align: center; padding: 0; }
}
</style>
