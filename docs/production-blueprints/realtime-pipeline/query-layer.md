---
title: "Realtime Pipeline: Query Layer"
description: "Funnel queries, retention analysis, caching strategy, and analytics API design"
tags: [analytics, clickhouse, funnels, retention, caching, api]
difficulty: "expert"
prerequisites: [realtime-pipeline/storage-layer]
lastReviewed: "2026-03-18"
---

# Realtime Pipeline: Query Layer

## Analytics Query Taxonomy

Analytics queries fall into distinct patterns with very different performance characteristics:

| Pattern | Example | Complexity | Typical Latency |
|---------|---------|-----------|----------------|
| Aggregation | Event counts by type | Low | < 200ms |
| Trend | DAU over 30 days | Low | < 100ms (pre-aggregated) |
| Funnel | Signup → Trial → Paid | High | 1-5s |
| Retention | Weekly cohort retention | Very High | 2-10s |
| Paths | Most common user journeys | Very High | 5-30s |
| Breakdown | Events by country × device | Medium | 200ms-2s |

## Funnel Analysis

A funnel measures conversion rates between sequential events:

```
Step 1: page_view (landing_page) →
Step 2: signup_started →
Step 3: signup_completed →
Step 4: subscription_created

Conversion: 100% → 45% → 30% → 12%
```

**Mathematical definition:**

$$
\text{conversion\_rate}_{i \to i+1} = \frac{|\text{users completing step } i+1|}{|\text{users completing step } i|}
$$

**Funnel validity window**: A user who completed step 1 on day 1 and step 2 on day 30 might not count as a funnel conversion if the window is 14 days.

### Funnel SQL

```sql
-- Funnel analysis: 3-step funnel within 14-day window
-- Uses ClickHouse's windowFunnel function for optimal performance
WITH
    1710288000 AS start_ts,   -- Unix timestamp for period start
    1712880000 AS end_ts      -- Unix timestamp for period end

SELECT
    level,
    count(DISTINCT user_id) AS users
FROM (
    SELECT
        user_id,
        windowFunnel(14 * 86400)(
            timestamp,
            type = 'page_view' AND JSONExtractString(properties, 'path') = '/',
            type = 'signup_started',
            type = 'signup_completed',
            type = 'subscription_created'
        ) AS level
    FROM events
    WHERE project_id = 'proj_123'
      AND timestamp BETWEEN toDateTime(start_ts) AND toDateTime(end_ts)
      AND user_id != ''   -- Only authenticated users
    GROUP BY user_id
)
GROUP BY level
ORDER BY level
;
```

### Funnel API Implementation

```typescript
export interface FunnelStep {
  eventType: string;
  filters?: Array<{
    property: string;
    operator: 'eq' | 'ne' | 'contains' | 'gt' | 'lt';
    value: string | number;
  }>;
}

export interface FunnelQuery {
  projectId: string;
  steps: FunnelStep[];
  windowDays: number;
  from: Date;
  to: Date;
  breakdowns?: string[];   // e.g., ['country', 'browser']
}

export interface FunnelResult {
  steps: Array<{
    name: string;
    users: number;
    conversionFromPrevious: number;
    conversionFromFirst: number;
    avgTimeToConvertSeconds?: number;
  }>;
  totalUsers: number;
}

export class FunnelAnalysisService {
  constructor(
    private readonly clickhouse: ClickHouseClient,
    private readonly cache: QueryCache
  ) {}

  async query(funnelQuery: FunnelQuery): Promise<FunnelResult> {
    const cacheKey = this.buildCacheKey(funnelQuery);
    const cached = await this.cache.get<FunnelResult>(cacheKey);
    if (cached) return cached;

    const sql = this.buildFunnelSQL(funnelQuery);
    const rawResult = await this.clickhouse.query({
      query: sql,
      format: 'JSONEachRow',
    });

    const rows = await rawResult.json<{ level: number; users: number }[]>();

    const result = this.formatFunnelResult(rows, funnelQuery.steps);

    // Cache for 1 minute (near-realtime)
    await this.cache.set(cacheKey, result, 60);

    return result;
  }

  private buildFunnelSQL(query: FunnelQuery): string {
    const windowSeconds = query.windowDays * 86400;
    const startTs = Math.floor(query.from.getTime() / 1000);
    const endTs = Math.floor(query.to.getTime() / 1000);

    const stepConditions = query.steps
      .map(step => this.buildStepCondition(step))
      .join(',\n            ');

    return `
      WITH
          ${startTs} AS start_ts,
          ${endTs} AS end_ts
      SELECT
          level,
          count(DISTINCT user_id) AS users
      FROM (
          SELECT
              user_id,
              windowFunnel(${windowSeconds})(
                  timestamp,
                  ${stepConditions}
              ) AS level
          FROM events
          WHERE project_id = ${escapeString(query.projectId)}
            AND timestamp BETWEEN toDateTime(start_ts) AND toDateTime(end_ts)
            AND user_id != ''
          GROUP BY user_id
      )
      GROUP BY level
      ORDER BY level
    `;
  }

  private buildStepCondition(step: FunnelStep): string {
    let condition = `type = ${escapeString(step.eventType)}`;

    if (step.filters) {
      for (const filter of step.filters) {
        const prop = `JSONExtractString(properties, ${escapeString(filter.property)})`;

        switch (filter.operator) {
          case 'eq':
            condition += ` AND ${prop} = ${escapeString(String(filter.value))}`;
            break;
          case 'contains':
            condition += ` AND ${prop} LIKE ${escapeString(`%${filter.value}%`)}`;
            break;
          case 'gt':
            condition += ` AND toFloat64OrZero(${prop}) > ${Number(filter.value)}`;
            break;
        }
      }
    }

    return condition;
  }

  private formatFunnelResult(
    rows: Array<{ level: number; users: number }>,
    steps: FunnelStep[]
  ): FunnelResult {
    const levelMap = new Map(rows.map(r => [r.level, r.users]));
    const totalUsers = levelMap.get(1) ?? 0;  // Users who completed step 1

    const formattedSteps = steps.map((step, i) => {
      const level = i + 1;
      const users = levelMap.get(level) ?? 0;
      const prevUsers = i === 0 ? totalUsers : (levelMap.get(level - 1) ?? 0);

      return {
        name: step.eventType,
        users,
        conversionFromPrevious: prevUsers > 0 ? users / prevUsers : 0,
        conversionFromFirst: totalUsers > 0 ? users / totalUsers : 0,
      };
    });

    return { steps: formattedSteps, totalUsers };
  }

  private buildCacheKey(query: FunnelQuery): string {
    const crypto = require('crypto');
    const content = JSON.stringify({
      ...query,
      from: query.from.toISOString(),
      to: query.to.toISOString(),
    });
    return `funnel:${crypto.createHash('md5').update(content).digest('hex')}`;
  }
}
```

## Retention Analysis

Retention shows what percentage of users from a cohort return in subsequent periods:

$$
\text{retention}_{t}^{\text{cohort}(d)} = \frac{|\text{users active in week } d+t \text{ who first appeared in week } d|}{|\text{users who first appeared in week } d|}
$$

```sql
-- Cohort retention analysis
-- Cohort: week of first event
-- Retention: active in subsequent weeks

WITH cohorts AS (
    SELECT
        user_id,
        toStartOfWeek(min(timestamp)) AS cohort_week
    FROM events
    WHERE project_id = 'proj_123'
      AND user_id != ''
      AND timestamp >= now() - INTERVAL 12 WEEK
    GROUP BY user_id
),
activity AS (
    SELECT
        e.user_id,
        c.cohort_week,
        toStartOfWeek(e.timestamp) AS activity_week,
        dateDiff('week', c.cohort_week, toStartOfWeek(e.timestamp)) AS week_number
    FROM events e
    JOIN cohorts c ON e.user_id = c.user_id
    WHERE e.project_id = 'proj_123'
      AND e.timestamp >= now() - INTERVAL 12 WEEK
)
SELECT
    cohort_week,
    week_number,
    count(DISTINCT user_id) AS retained_users,
    count(DISTINCT user_id) / first_value(count(DISTINCT user_id))
        OVER (PARTITION BY cohort_week ORDER BY week_number) AS retention_rate
FROM activity
WHERE week_number <= 8   -- 8 weeks of retention data
GROUP BY cohort_week, week_number
ORDER BY cohort_week, week_number
;
```

### Retention API

```typescript
export interface RetentionQuery {
  projectId: string;
  cohortEvent: string;     // Event that defines cohort membership
  retentionEvent: string;  // Event that counts as "returned"
  period: 'day' | 'week' | 'month';
  periodsToTrack: number;
  from: Date;
  to: Date;
}

export interface RetentionResult {
  cohorts: Array<{
    cohortDate: string;
    cohortSize: number;
    retention: number[];   // Index = period number, value = retention rate
  }>;
}

export class RetentionAnalysisService {
  async query(retentionQuery: RetentionQuery): Promise<RetentionResult> {
    const sql = this.buildRetentionSQL(retentionQuery);
    const result = await this.clickhouse.query({ query: sql, format: 'JSONEachRow' });
    const rows = await result.json();
    return this.formatRetentionResult(rows as any[], retentionQuery);
  }

  private buildRetentionSQL(query: RetentionQuery): string {
    const periodFn = {
      day: 'toStartOfDay',
      week: 'toStartOfWeek',
      month: 'toStartOfMonth',
    }[query.period];

    const dateDiffUnit = query.period;

    return `
      WITH cohorts AS (
          SELECT
              user_id,
              ${periodFn}(min(timestamp)) AS cohort_period
          FROM events
          WHERE project_id = ${escapeString(query.projectId)}
            AND type = ${escapeString(query.cohortEvent)}
            AND user_id != ''
            AND timestamp BETWEEN ${toClickHouseDate(query.from)} AND ${toClickHouseDate(query.to)}
          GROUP BY user_id
      ),
      activity AS (
          SELECT
              e.user_id,
              c.cohort_period,
              dateDiff('${dateDiffUnit}', c.cohort_period, ${periodFn}(e.timestamp)) AS period_number
          FROM events e
          JOIN cohorts c ON e.user_id = c.user_id
          WHERE e.project_id = ${escapeString(query.projectId)}
            AND e.type = ${escapeString(query.retentionEvent)}
            AND e.timestamp >= ${toClickHouseDate(query.from)}
            AND period_number BETWEEN 0 AND ${query.periodsToTrack}
      )
      SELECT
          cohort_period,
          period_number,
          count(DISTINCT user_id) AS users
      FROM activity
      GROUP BY cohort_period, period_number
      ORDER BY cohort_period, period_number
    `;
  }
}
```

## Caching Strategy

```typescript
export class QueryCache {
  constructor(
    private readonly redis: Redis,
    private readonly defaultTtlSeconds = 60
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(`query_cache:${key}`);
    if (!cached) return null;

    try {
      return JSON.parse(cached) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.redis.set(
      `query_cache:${key}`,
      JSON.stringify(value),
      'EX',
      ttlSeconds ?? this.defaultTtlSeconds
    );
  }

  // Stale-while-revalidate: return cached even if expired, refresh in background
  async getOrRefresh<T>(
    key: string,
    fetch: () => Promise<T>,
    options: { ttlSeconds: number; staleSeconds: number }
  ): Promise<T> {
    const staleKey = `query_cache:stale:${key}`;
    const freshKey = `query_cache:fresh:${key}`;

    const fresh = await this.redis.get(freshKey);
    if (fresh) return JSON.parse(fresh) as T;

    const stale = await this.redis.get(staleKey);
    if (stale) {
      // Return stale data immediately, refresh in background
      fetch().then(value => {
        this.redis.set(freshKey, JSON.stringify(value), 'EX', options.ttlSeconds);
        this.redis.set(staleKey, JSON.stringify(value), 'EX', options.ttlSeconds + options.staleSeconds);
      }).catch(err => logger.error({ msg: 'Background refresh failed', err }));

      return JSON.parse(stale) as T;
    }

    // No cache at all — fetch and cache
    const value = await fetch();
    await Promise.all([
      this.redis.set(freshKey, JSON.stringify(value), 'EX', options.ttlSeconds),
      this.redis.set(staleKey, JSON.stringify(value), 'EX', options.ttlSeconds + options.staleSeconds),
    ]);
    return value;
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(`query_cache:*${pattern}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Cache TTL by query type
export const CACHE_TTLS = {
  'event_counts': 60,        // 1 minute — changes frequently
  'funnel': 60,              // 1 minute
  'retention': 300,          // 5 minutes — expensive to compute
  'top_pages': 300,          // 5 minutes
  'dau_trend': 300,          // 5 minutes — uses materialized view
  'user_profile': 30,        // 30 seconds — user-specific
} as const;
```

## Analytics API

```typescript
import express from 'express';
import { FunnelAnalysisService } from './funnel-analysis';
import { RetentionAnalysisService } from './retention-analysis';
import { QueryCache } from './query-cache';

const analyticsRouter = express.Router();

// GET /analytics/funnels
analyticsRouter.post('/funnels', async (req, res) => {
  const {
    projectId,
    steps,
    windowDays = 14,
    from,
    to,
  } = req.body;

  if (!steps || steps.length < 2 || steps.length > 8) {
    return res.status(400).json({ error: 'Funnel must have 2-8 steps' });
  }

  try {
    const result = await funnelService.query({
      projectId,
      steps,
      windowDays,
      from: new Date(from),
      to: new Date(to),
    });

    res.json(result);
  } catch (error) {
    logger.error({ msg: 'Funnel query failed', error: (error as Error).message });
    res.status(500).json({ error: 'Query failed' });
  }
});

// GET /analytics/retention
analyticsRouter.post('/retention', async (req, res) => {
  const {
    projectId,
    cohortEvent,
    retentionEvent,
    period = 'week',
    periodsToTrack = 8,
    from,
    to,
  } = req.body;

  try {
    const result = await retentionService.query({
      projectId,
      cohortEvent,
      retentionEvent,
      period,
      periodsToTrack,
      from: new Date(from),
      to: new Date(to),
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Query failed' });
  }
});

// GET /analytics/events?projectId=...&from=...&to=...
analyticsRouter.get('/events', async (req, res) => {
  const { projectId, from, to, groupBy = 'type' } = req.query as Record<string, string>;

  const cacheKey = `events:${projectId}:${from}:${to}:${groupBy}`;
  const result = await queryCache.getOrRefresh(
    cacheKey,
    async () => {
      const rows = await clickhouse.query({
        query: `
          SELECT
              ${groupBy === 'type' ? 'type' : `toDate(timestamp) AS date`},
              count() AS count,
              count(DISTINCT user_id) AS unique_users
          FROM events
          WHERE project_id = ${escapeString(projectId)}
            AND timestamp BETWEEN ${toClickHouseDate(new Date(from))} AND ${toClickHouseDate(new Date(to))}
          GROUP BY ${groupBy === 'type' ? 'type' : 'date'}
          ORDER BY count DESC
          LIMIT 100
        `,
        format: 'JSONEachRow',
      });
      return rows.json();
    },
    { ttlSeconds: 60, staleSeconds: 300 }
  );

  res.json(result);
});
```

## Query Optimization Tips

### 1. Always Filter by project_id First

The ORDER BY starts with `project_id`. Every query must include `WHERE project_id = ?`.

### 2. Use toDate() for Day-Level Aggregations

```sql
-- SLOW: full timestamp comparison
WHERE timestamp >= '2026-03-01 00:00:00' AND timestamp < '2026-03-02 00:00:00'

-- FAST: date-level shortcut
WHERE toDate(timestamp) = '2026-03-01'
```

### 3. Avoid SELECT *

ClickHouse reads only queried columns. `SELECT *` reads all columns — defeats columnar storage.

### 4. Use PREWHERE for Filtering Before Reading

```sql
-- PREWHERE filters at the MergeTree level before columns are read
SELECT count()
FROM events
PREWHERE project_id = 'proj_123'  -- Applied first, very fast
WHERE type = 'purchase'           -- Applied after column read
  AND timestamp >= now() - INTERVAL 7 DAY
;
```

::: info War Story
A customer built a retention query that JOINed the events table to itself twice (cohort table + activity table). On 500M events, this query ran for 45 minutes and then hit ClickHouse's memory limit.

Root cause: ClickHouse joins load the right-side table into memory. Two self-joins of a 500M row table = 2 × 500M rows in memory. ClickHouse gave up at 40GB.

Fix: Rewrite using window functions and `groupArray` instead of JOINs. The rewritten query ran in 8 seconds. The lesson: always use window functions for same-table joins in ClickHouse. The query planner is optimized for them.
:::

## Performance Benchmarks

On a ClickHouse cluster (3 nodes, 32 cores each, 256GB RAM):

| Query Type | Dataset Size | Latency |
|-----------|-------------|---------|
| Simple count | 1B rows | 0.05s |
| Grouped count (50 groups) | 1B rows | 0.2s |
| Funnel (3 steps, 30 days) | 100M rows | 1.2s |
| Retention cohort (12 weeks) | 100M rows | 3.4s |
| Path analysis (top 20 paths) | 100M rows | 8.1s |
| All with pre-aggregation | — | 0.01-0.05s |
