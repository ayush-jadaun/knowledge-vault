---
title: Log Levels Strategy
description: Definitive guide to TRACE, DEBUG, INFO, WARN, ERROR, and FATAL log levels — what belongs at each level, dynamic log level changing in production, and log sampling strategies for high-volume services.
tags:
  - log-levels
  - logging
  - debug
  - error
  - sampling
  - node.js
  - pino
difficulty: intermediate
prerequisites:
  - devops/logging/index
  - devops/logging/structured-logging
lastReviewed: "2026-03-17"
---

# Log Levels Strategy

Log levels are a contract between the developer who writes the log statement and the operator who reads it. When a developer logs at `ERROR`, they are saying "something is broken and needs attention." When an operator sets the level to `WARN`, they are saying "I only want to see things that are broken or might be broken."

When this contract is violated — when developers log validation errors at `ERROR` or log important state transitions at `DEBUG` — the contract becomes meaningless. Operators cannot filter effectively, alerting on log levels becomes unreliable, and everyone reverts to grepping through all log levels, defeating the purpose entirely.

This guide establishes a clear definition for each level, provides examples for common scenarios, and covers advanced topics like dynamic log level changes and log sampling.

## The Six Levels

### FATAL (Level 60)

The application is about to terminate. A FATAL log line means the process cannot continue and will exit. Every FATAL log line should be followed by process termination.

**Use for:**
- Unrecoverable configuration errors at startup
- Loss of a critical dependency with no fallback (e.g., database unreachable and no read replica)
- Uncaught exceptions that escape all error handlers
- Out-of-memory conditions that prevent operation
- Corrupted state that makes continued operation dangerous

**Never use for:**
- Errors that the application can recover from (use ERROR)
- Dependency timeouts that will be retried (use ERROR or WARN)
- Individual request failures (use ERROR)

```typescript
// FATAL: Application cannot start because the database is unreachable
try {
  await pool.connect();
} catch (error) {
  logger.fatal(
    { error, host: dbConfig.host, port: dbConfig.port },
    'Cannot connect to database — application cannot start'
  );
  process.exit(1);
}

// FATAL: Unrecoverable state corruption
logger.fatal(
  { accountId, balance: account.balance, expectedBalance },
  'Account balance integrity violation detected — shutting down to prevent further damage'
);
process.exit(1);

// FATAL: Required configuration missing
if (!process.env.DATABASE_URL) {
  logger.fatal('DATABASE_URL environment variable is required but not set');
  process.exit(1);
}
```

### ERROR (Level 50)

Something failed and requires attention, but the application can continue serving other requests. Every ERROR log line should correspond to a condition that either an engineer or an automated system needs to investigate and resolve.

**Use for:**
- Unhandled exceptions in request handlers (500 responses)
- Failed operations that have exhausted all retries
- Unexpected null/undefined values that indicate a bug
- External service calls that fail and affect the user response
- Database query failures
- Message processing failures that will not be retried

**Never use for:**
- Expected conditions (user not found, invalid input — those are WARN or INFO)
- Transient failures that will be retried (first retry attempt — use WARN)
- Performance degradation without failure (use WARN)
- Business rule violations (user tried to withdraw more than their balance — use WARN)

```typescript
// ERROR: Request handler failed with an unhandled exception
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (res.statusCode >= 500 || !res.statusCode) {
    logger.error(
      {
        error: { message: err.message, stack: err.stack, type: err.constructor.name },
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode || 500,
      },
      'Unhandled error in request handler'
    );
  }
  next(err);
});

// ERROR: External API call failed after all retries
logger.error(
  {
    service: 'payment-gateway',
    operation: 'charge',
    orderId: order.id,
    attempts: maxRetries,
    lastError: lastError.message,
    duration: totalDurationMs,
  },
  'Payment gateway call failed after all retry attempts'
);

// ERROR: Database query failed
logger.error(
  {
    query: sql.substring(0, 500),
    error: { message: error.message, code: error.code },
    duration: durationMs,
  },
  'Database query failed'
);
```

### WARN (Level 40)

Something unexpected happened but the application handled it. Warning logs indicate conditions that should be investigated during business hours but do not require immediate response.

**Use for:**
- Retry attempts (first and second retries — final failure is ERROR)
- Deprecated API usage by clients
- Configuration values falling back to defaults
- Resource utilization approaching limits (connection pool at 80%)
- Rate limiting applied
- Request validation failures (4xx responses)
- Business rule edge cases handled gracefully
- Slow operations that completed but took longer than expected

**Never use for:**
- Normal business events (use INFO)
- Debugging information (use DEBUG)
- Fatal conditions (use FATAL or ERROR)

```typescript
// WARN: Retry attempt
logger.warn(
  {
    service: 'payment-gateway',
    attempt: 2,
    maxAttempts: 3,
    error: error.message,
    backoffMs: 2000,
  },
  'Payment gateway call failed, retrying'
);

// WARN: Deprecated API usage
logger.warn(
  {
    client: req.headers['user-agent'],
    endpoint: '/api/v1/users',
    deprecatedSince: '2025-06-01',
    replacedBy: '/api/v2/users',
  },
  'Client using deprecated API endpoint'
);

// WARN: Resource approaching limits
logger.warn(
  {
    pool: 'primary',
    active: pool.activeCount,
    max: pool.maxCount,
    utilization: (pool.activeCount / pool.maxCount * 100).toFixed(1),
  },
  'Database connection pool utilization above 80%'
);

// WARN: Slow query that completed
logger.warn(
  {
    query: sql.substring(0, 500),
    duration: durationMs,
    threshold: 1000,
  },
  'Database query completed but exceeded slow query threshold'
);

// WARN: Request validation failure
logger.warn(
  {
    validationErrors: errors,
    path: req.originalUrl,
    method: req.method,
  },
  'Request validation failed'
);
```

### INFO (Level 30)

Normal operational events that confirm the system is working correctly. INFO logs are the default level in production and should provide enough context to understand the flow of the application without overwhelming the reader.

**Use for:**
- Application lifecycle events (started, stopped, configuration loaded)
- Request received and completed (summary, not details)
- Successful completion of significant business operations
- Scheduled job execution
- Connection established to external systems
- Feature flag state changes
- Deployment-related events

**Never use for:**
- Individual function calls or internal logic flow (use DEBUG)
- Verbose request/response details (use DEBUG)
- Error conditions (use ERROR or WARN)
- Performance debugging data (use DEBUG)

```typescript
// INFO: Application started
logger.info(
  { port: 3000, environment: 'production', version: '1.4.2' },
  'Application started'
);

// INFO: Request completed
logger.info(
  {
    method: req.method,
    path: req.originalUrl,
    statusCode: res.statusCode,
    duration: durationMs,
  },
  'Request completed'
);

// INFO: Business operation completed
logger.info(
  {
    orderId: order.id,
    total: order.total,
    items: order.items.length,
  },
  'Order processed successfully'
);

// INFO: Scheduled job executed
logger.info(
  {
    job: 'cleanup-expired-sessions',
    deleted: count,
    duration: durationMs,
    nextRun: nextRunTime.toISOString(),
  },
  'Scheduled job completed'
);

// INFO: Connection established
logger.info(
  {
    service: 'postgresql',
    host: config.host,
    database: config.database,
    poolSize: config.poolSize,
  },
  'Database connection established'
);
```

### DEBUG (Level 20)

Detailed information useful for diagnosing problems during development or troubleshooting. DEBUG logs are disabled in production by default but can be enabled temporarily for specific services.

**Use for:**
- Function entry/exit with parameters
- Intermediate calculation results
- Cache hit/miss details
- SQL query text and parameters
- HTTP request/response bodies
- Internal state transitions
- Algorithm decision points

**Never use for:**
- Every loop iteration (use TRACE)
- Normal operational events (use INFO)
- Error conditions (use ERROR or WARN)

```typescript
// DEBUG: Function entry with parameters
logger.debug(
  {
    userId,
    filters: { category, minPrice, maxPrice },
    pagination: { page, limit },
  },
  'Searching products for user'
);

// DEBUG: Cache lookup result
logger.debug(
  {
    key: cacheKey,
    hit: !!cachedValue,
    ttlRemaining: ttl,
  },
  'Cache lookup for product catalog'
);

// DEBUG: SQL query details
logger.debug(
  {
    query: sql,
    params: sanitizedParams,
    plan: queryPlan,
  },
  'Executing database query'
);

// DEBUG: HTTP response body from external service
logger.debug(
  {
    service: 'inventory-service',
    statusCode: response.status,
    body: responseBody,
    duration: durationMs,
  },
  'Received response from inventory service'
);
```

### TRACE (Level 10)

The most verbose level. TRACE logs capture every possible detail about execution flow. Never enabled in production except for very specific, short-duration debugging sessions.

**Use for:**
- Entering/exiting every function
- Loop iteration details
- Byte-level protocol details
- Object serialization/deserialization details
- Context propagation details

```typescript
// TRACE: Loop iteration
for (const item of order.items) {
  logger.trace(
    { itemId: item.id, quantity: item.quantity, price: item.price },
    'Processing order item'
  );
}

// TRACE: Middleware chain execution
logger.trace({ middleware: 'authentication', phase: 'enter' }, 'Middleware executing');
// ... middleware logic ...
logger.trace({ middleware: 'authentication', phase: 'exit', authenticated: true }, 'Middleware completed');
```

## Level Selection Quick Reference

| Scenario | Level | Reasoning |
|---|---|---|
| Process is crashing | FATAL | Application termination |
| Unhandled exception in request | ERROR | Failed operation needing investigation |
| Database query failed | ERROR | Operation failed |
| External API call, first retry | WARN | Transient, will retry |
| External API call, all retries failed | ERROR | Operation permanently failed |
| User submitted invalid input (400) | WARN | Client error, not system error |
| User not found (404) | INFO or WARN | Expected business case |
| Request completed successfully | INFO | Normal operation |
| Order placed successfully | INFO | Significant business event |
| Application started | INFO | Lifecycle event |
| Cache miss | DEBUG | Diagnostic detail |
| SQL query text | DEBUG | Diagnostic detail |
| HTTP response body | DEBUG | Diagnostic detail |
| Loop iteration | TRACE | Extreme verbosity |

## Dynamic Log Level Changing

In production, you normally run at INFO level. But when debugging a specific issue, you may need to temporarily enable DEBUG for a single service — without redeploying.

### HTTP Endpoint for Runtime Level Change

```typescript
// src/routes/admin.ts
import { Router, Request, Response } from 'express';
import { Logger } from 'pino';

export function createAdminRoutes(logger: Logger): Router {
  const router = Router();

  // Require admin authentication for this endpoint
  router.use(requireAdminAuth);

  // GET current log level
  router.get('/log-level', (_req: Request, res: Response) => {
    res.json({
      level: logger.level,
      levelNumber: logger.levelVal,
    });
  });

  // PUT to change log level
  router.put('/log-level', (req: Request, res: Response) => {
    const { level } = req.body;
    const validLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

    if (!validLevels.includes(level)) {
      res.status(400).json({
        error: `Invalid level "${level}". Valid levels: ${validLevels.join(', ')}`,
      });
      return;
    }

    const previousLevel = logger.level;
    logger.level = level;

    logger.info(
      { previousLevel, newLevel: level, changedBy: (req as any).user?.id },
      'Log level changed at runtime'
    );

    res.json({
      previousLevel,
      currentLevel: level,
      message: `Log level changed from ${previousLevel} to ${level}`,
    });
  });

  return router;
}
```

### Auto-Revert Timer

When enabling DEBUG in production, always set a timer to revert to INFO automatically. Otherwise, someone enables DEBUG at 3 AM, forgets to revert it, and the service generates 100x more logs — eating through your log aggregation budget.

```typescript
router.put('/log-level', (req: Request, res: Response) => {
  const { level, durationMinutes = 15 } = req.body;

  const previousLevel = logger.level;
  logger.level = level;

  // Auto-revert after the specified duration
  const maxDuration = Math.min(durationMinutes, 60); // Cap at 60 minutes
  const revertTimer = setTimeout(() => {
    logger.level = previousLevel;
    logger.info(
      { previousLevel: level, newLevel: previousLevel },
      'Log level auto-reverted after timeout'
    );
  }, maxDuration * 60 * 1000);

  // Don't let the timer prevent process shutdown
  revertTimer.unref();

  logger.info(
    { previousLevel, newLevel: level, autoRevertMinutes: maxDuration },
    'Log level changed temporarily'
  );

  res.json({
    previousLevel,
    currentLevel: level,
    autoRevertAt: new Date(Date.now() + maxDuration * 60 * 1000).toISOString(),
  });
});
```

### Environment Variable-Based Level Control

For Kubernetes deployments, change the log level by updating an environment variable and restarting the pod (or using a ConfigMap with a file watcher):

```typescript
// Check for level changes periodically
const LOG_LEVEL_FILE = '/etc/config/log-level';

setInterval(() => {
  try {
    const newLevel = fs.readFileSync(LOG_LEVEL_FILE, 'utf-8').trim();
    if (newLevel !== logger.level) {
      logger.info({ previousLevel: logger.level, newLevel }, 'Log level changed via config');
      logger.level = newLevel;
    }
  } catch {
    // File doesn't exist or is unreadable — keep current level
  }
}, 10_000);
```

## Log Sampling for High-Volume Services

Some services generate millions of log lines per minute. Logging every single request at INFO level is neither affordable nor useful. Log sampling lets you capture a representative subset.

### Deterministic Sampling

Always log the same percentage of requests, based on a hash of the request ID:

```typescript
// src/middleware/sampled-logging.ts
import { createHash } from 'crypto';
import { Logger } from 'pino';

interface SamplingConfig {
  defaultRate: number;        // 0.0 to 1.0 (e.g., 0.01 = 1%)
  errorRate: number;          // Sample rate for errors (usually 1.0 = 100%)
  slowRequestRate: number;    // Sample rate for slow requests
  slowThresholdMs: number;    // What counts as "slow"
}

const DEFAULT_SAMPLING: SamplingConfig = {
  defaultRate: 0.01,          // Log 1% of normal requests
  errorRate: 1.0,             // Log 100% of errors
  slowRequestRate: 1.0,       // Log 100% of slow requests
  slowThresholdMs: 1000,      // Requests taking > 1s
};

export function sampledRequestLogging(
  logger: Logger,
  config: SamplingConfig = DEFAULT_SAMPLING
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req as any).requestId ?? '';
    const shouldSample = shouldSampleRequest(requestId, config.defaultRate);

    res.on('finish', () => {
      const durationMs = (req as any).durationMs ?? 0;
      const isError = res.statusCode >= 500;
      const isSlow = durationMs > config.slowThresholdMs;

      // Always log errors and slow requests
      const shouldLog =
        (isError && Math.random() < config.errorRate) ||
        (isSlow && Math.random() < config.slowRequestRate) ||
        shouldSample;

      if (shouldLog) {
        const logData = {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          duration: durationMs,
          sampled: !isError && !isSlow, // Mark whether this was a sample
        };

        if (isError) {
          logger.error(logData, 'Request completed with error');
        } else if (isSlow) {
          logger.warn(logData, 'Request completed slowly');
        } else {
          logger.info(logData, 'Request completed (sampled)');
        }
      }
    });

    next();
  };
}

function shouldSampleRequest(requestId: string, rate: number): boolean {
  if (rate >= 1.0) return true;
  if (rate <= 0.0) return false;

  // Deterministic sampling based on request ID hash
  // The same request ID always produces the same sampling decision
  const hash = createHash('md5').update(requestId).digest();
  const value = hash.readUInt32BE(0) / 0xFFFFFFFF;
  return value < rate;
}
```

### Head-Based vs Tail-Based Sampling

**Head-based sampling** decides at the start of the request whether to log it. Simple but misses errors on non-sampled requests.

**Tail-based sampling** decides at the end of the request, based on the outcome. More useful but requires buffering log lines during the request.

```typescript
// Tail-based sampling: buffer logs and flush based on outcome
export function tailSampledLogging(logger: Logger, sampleRate: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const buffer: Array<{ level: string; data: any; msg: string }> = [];

    // Create a buffered logger
    const bufferedLogger = {
      info: (data: any, msg: string) => buffer.push({ level: 'info', data, msg }),
      warn: (data: any, msg: string) => buffer.push({ level: 'warn', data, msg }),
      debug: (data: any, msg: string) => buffer.push({ level: 'debug', data, msg }),
      error: (data: any, msg: string) => {
        // Errors are always logged immediately
        logger.error(data, msg);
      },
    };

    (req as any).log = bufferedLogger;

    res.on('finish', () => {
      const isError = res.statusCode >= 500;
      const shouldFlush = isError || Math.random() < sampleRate;

      if (shouldFlush) {
        // Flush all buffered log lines
        for (const entry of buffer) {
          (logger as any)[entry.level](entry.data, entry.msg);
        }
      }
      // If not flushed, the buffer is garbage collected
    });

    next();
  };
}
```

### Per-Service Sampling Configuration

Different services have different logging needs:

```yaml
# logging-config.yml
services:
  api-gateway:
    # High volume, mostly health checks and simple proxying
    defaultSampleRate: 0.001    # 0.1%
    errorSampleRate: 1.0
    slowThresholdMs: 2000

  order-service:
    # Medium volume, business-critical
    defaultSampleRate: 0.1      # 10%
    errorSampleRate: 1.0
    slowThresholdMs: 1000

  admin-service:
    # Low volume, audit requirements
    defaultSampleRate: 1.0      # 100% — log everything
    errorSampleRate: 1.0
    slowThresholdMs: 5000

  health-check-service:
    # Very high volume, very low value
    defaultSampleRate: 0.0001   # 0.01%
    errorSampleRate: 0.1        # Even errors are mostly noise
    slowThresholdMs: 5000
```

## Key Takeaways

- Log levels are a contract. Define what each level means for your team and enforce it through code review.
- FATAL means the process is dying. ERROR means something is broken. WARN means something is unexpected but handled. INFO means normal operation. DEBUG and TRACE are for development and temporary production debugging.
- Always provide the ability to change log levels at runtime — you will need it during incidents.
- Auto-revert debug levels after a timeout to prevent log volume explosions.
- For high-volume services, implement sampling: log 100% of errors, 100% of slow requests, and a representative sample of normal requests.
- Tail-based sampling is superior to head-based sampling because it captures the full context for errors and slow requests.
