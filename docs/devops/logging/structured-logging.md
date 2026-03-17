---
title: Structured Logging
description: JSON logging, log schema design, Winston and Pino configuration for Node.js, structured vs unstructured logging, log context propagation, and a complete TypeScript logging setup with Pino for production applications.
tags:
  - structured-logging
  - json-logging
  - pino
  - winston
  - node.js
  - typescript
  - logging
difficulty: intermediate
prerequisites:
  - devops/logging/index
  - Node.js and TypeScript fundamentals
lastReviewed: "2026-03-17"
---

# Structured Logging

Unstructured logs are human-readable and machine-hostile. Structured logs are both. In a world where logs are consumed by Elasticsearch, Loki, or CloudWatch — not by humans reading terminal output — structured logging is not a luxury. It is a requirement.

This guide covers the principles of structured logging, provides a complete log schema design, and gives you production-ready configurations for both Pino and Winston in TypeScript.

## Structured vs Unstructured

### Unstructured Logging

```
[2026-03-17 14:32:01.234] ERROR OrderService - Failed to process order for user john@example.com. Order ID: 12345. Error: ECONNREFUSED to payment-gateway:443. Retry attempt 3/5.
```

Problems:
- To extract the order ID, you need a regex: `/Order ID: (\d+)/`
- If someone changes the format to `OrderID: 12345` or `order_id=12345`, your regex breaks
- You cannot efficiently filter logs by `orderId` in your log aggregation system
- Different developers format similar log lines differently

### Structured Logging

```json
{
  "timestamp": "2026-03-17T14:32:01.234Z",
  "level": "error",
  "service": "order-service",
  "msg": "Failed to process order",
  "orderId": "12345",
  "userId": "user_abc123",
  "error": {
    "message": "connect ECONNREFUSED payment-gateway:443",
    "code": "ECONNREFUSED",
    "type": "Error"
  },
  "retryAttempt": 3,
  "maxRetries": 5,
  "requestId": "req_7f3a2b1c",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

Advantages:
- Every field is a named key — no parsing required
- Log aggregation systems can index and filter by any field
- Consistent format across all services
- Searchable: `orderId:12345 AND level:error`
- Alertable: create an alert when `error.code:ECONNREFUSED` exceeds a threshold

## Log Schema Design

A well-designed log schema ensures consistency across all services in your organization. Define a schema and enforce it through shared libraries.

### Core Fields (Required on Every Log Line)

| Field | Type | Description | Example |
|---|---|---|---|
| `timestamp` | ISO 8601 string | When the event occurred | `"2026-03-17T14:32:01.234Z"` |
| `level` | string | Log level | `"info"`, `"error"`, `"warn"` |
| `msg` | string | Human-readable message | `"Order processed successfully"` |
| `service` | string | Service name | `"order-service"` |
| `environment` | string | Deployment environment | `"production"`, `"staging"` |
| `version` | string | Application version | `"1.4.2"` |

### Request Context Fields (Required on Request-Scoped Logs)

| Field | Type | Description | Example |
|---|---|---|---|
| `requestId` | string | Unique ID for this request | `"req_7f3a2b1c"` |
| `traceId` | string | Distributed trace ID | `"4bf92f3577b34da6..."` |
| `spanId` | string | Current span ID | `"00f067aa0ba902b7"` |
| `method` | string | HTTP method | `"POST"` |
| `path` | string | Request path | `"/api/v1/orders"` |
| `statusCode` | number | Response status code | `200` |
| `duration` | number | Request duration in ms | `142` |
| `userAgent` | string | Client user agent | `"Mozilla/5.0..."` |

### Error Fields (Required on Error Log Lines)

| Field | Type | Description | Example |
|---|---|---|---|
| `error.message` | string | Error message | `"ECONNREFUSED"` |
| `error.type` | string | Error constructor name | `"ConnectionError"` |
| `error.stack` | string | Stack trace | `"Error: ECONN..."` |
| `error.code` | string | Error code if available | `"ECONNREFUSED"` |

### Additional Context Fields (Optional)

| Field | Type | Description |
|---|---|---|
| `userId` | string | Authenticated user identifier (not PII) |
| `tenantId` | string | Multi-tenant organization identifier |
| `component` | string | Application component (`"database"`, `"cache"`, `"queue"`) |
| `action` | string | Business action (`"checkout"`, `"search"`, `"login"`) |

## Pino Configuration for Production

Pino is the recommended logger for Node.js production applications due to its performance characteristics (roughly 5x faster than Winston at high throughput).

### Complete Pino Setup

```typescript
// src/logger/index.ts
import pino, { Logger, LoggerOptions } from 'pino';

interface AppLoggerOptions {
  service: string;
  version: string;
  environment: string;
  level?: string;
}

export function createLogger(options: AppLoggerOptions): Logger {
  const { service, version, environment, level } = options;

  const loggerOptions: LoggerOptions = {
    level: level ?? (environment === 'production' ? 'info' : 'debug'),

    // Base fields attached to every log line
    base: {
      service,
      version,
      environment,
      pid: process.pid,
      hostname: undefined, // Pino adds hostname by default; remove if not needed
    },

    // Timestamp format
    timestamp: pino.stdTimeFunctions.isoTime,

    // Format error objects properly
    serializers: {
      err: pino.stdSerializers.err,
      error: serializeError,
      req: serializeRequest,
      res: serializeResponse,
    },

    // Redaction paths (keys to redact from logs)
    redact: {
      paths: [
        'password',
        'token',
        'authorization',
        'cookie',
        'creditCard',
        'ssn',
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
        '*.secret',
        '*.apiKey',
        '*.creditCardNumber',
      ],
      censor: '[REDACTED]',
    },

    // Format options for development (human-readable)
    ...(environment !== 'production' && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
  };

  return pino(loggerOptions);
}

function serializeError(error: Error & { code?: string; statusCode?: number }) {
  return {
    message: error.message,
    type: error.constructor.name,
    stack: error.stack,
    ...(error.code && { code: error.code }),
    ...(error.statusCode && { statusCode: error.statusCode }),
  };
}

function serializeRequest(req: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  remoteAddress?: string;
}) {
  return {
    method: req.method,
    url: req.url,
    remoteAddress: req.remoteAddress,
    // Only include safe headers
    headers: {
      'user-agent': req.headers?.['user-agent'],
      'content-type': req.headers?.['content-type'],
      'x-request-id': req.headers?.['x-request-id'],
      'x-forwarded-for': req.headers?.['x-forwarded-for'],
    },
  };
}

function serializeResponse(res: {
  statusCode?: number;
  headers?: Record<string, string>;
}) {
  return {
    statusCode: res.statusCode,
  };
}
```

### Application Entry Point

```typescript
// src/app.ts
import express from 'express';
import { createLogger } from './logger';
import { requestLoggingMiddleware } from './middleware/request-logging';
import { errorLoggingMiddleware } from './middleware/error-logging';
import { correlationMiddleware } from './middleware/correlation';

const logger = createLogger({
  service: 'order-service',
  version: process.env.APP_VERSION ?? '0.0.0',
  environment: process.env.NODE_ENV ?? 'development',
  level: process.env.LOG_LEVEL,
});

const app = express();

// Order matters: correlation first, then request logging
app.use(correlationMiddleware());
app.use(requestLoggingMiddleware(logger));

// ... your routes ...

// Error logging should be after routes
app.use(errorLoggingMiddleware(logger));

// Log application lifecycle events
logger.info({ port: 3000 }, 'Application starting');

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  // ... graceful shutdown logic ...
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error: serializeError(error) }, 'Uncaught exception — process will exit');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ error: reason }, 'Unhandled promise rejection');
});
```

### Request Logging Middleware

```typescript
// src/middleware/request-logging.ts
import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';
import { getRequestContext } from './correlation';

export function requestLoggingMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = process.hrtime.bigint();
    const context = getRequestContext();

    // Create a child logger with request context
    const reqLogger = logger.child({
      requestId: context?.requestId,
      traceId: context?.traceId,
      method: req.method,
      path: req.originalUrl,
    });

    // Attach logger to request for use in route handlers
    (req as any).log = reqLogger;

    // Log when the request starts
    reqLogger.info({ req }, 'Request received');

    // Log when the response finishes
    res.on('finish', () => {
      const durationNs = Number(process.hrtime.bigint() - startTime);
      const durationMs = Math.round(durationNs / 1e6);

      const logData = {
        statusCode: res.statusCode,
        duration: durationMs,
        contentLength: res.getHeader('content-length'),
      };

      if (res.statusCode >= 500) {
        reqLogger.error(logData, 'Request completed with server error');
      } else if (res.statusCode >= 400) {
        reqLogger.warn(logData, 'Request completed with client error');
      } else {
        reqLogger.info(logData, 'Request completed');
      }
    });

    next();
  };
}
```

### Error Logging Middleware

```typescript
// src/middleware/error-logging.ts
import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';

export function errorLoggingMiddleware(logger: Logger) {
  return (err: Error & { statusCode?: number }, req: Request, res: Response, _next: NextFunction): void => {
    const reqLogger: Logger = (req as any).log ?? logger;
    const statusCode = err.statusCode ?? 500;

    if (statusCode >= 500) {
      reqLogger.error(
        {
          error: {
            message: err.message,
            type: err.constructor.name,
            stack: err.stack,
          },
          statusCode,
        },
        'Unhandled error in request'
      );
    } else {
      reqLogger.warn(
        {
          error: {
            message: err.message,
            type: err.constructor.name,
          },
          statusCode,
        },
        'Client error in request'
      );
    }

    if (!res.headersSent) {
      res.status(statusCode).json({
        error: {
          message: statusCode >= 500 ? 'Internal Server Error' : err.message,
          ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
        },
      });
    }
  };
}
```

## Winston Configuration for Production

When Winston is preferred (existing codebase, need for custom transports, team familiarity):

```typescript
// src/logger/winston-logger.ts
import winston, { Logger, format, transports } from 'winston';

interface WinstonLoggerOptions {
  service: string;
  version: string;
  environment: string;
  level?: string;
}

export function createWinstonLogger(options: WinstonLoggerOptions): Logger {
  const { service, version, environment, level } = options;

  const baseFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    format.errors({ stack: true }),
    format((info) => {
      // Add base fields
      info.service = service;
      info.version = version;
      info.environment = environment;
      return info;
    })()
  );

  const productionFormat = format.combine(
    baseFormat,
    redactFormat(),
    format.json()
  );

  const developmentFormat = format.combine(
    baseFormat,
    format.colorize(),
    format.printf(({ timestamp, level, message, service, ...meta }) => {
      const metaStr = Object.keys(meta).length > 0
        ? '\n' + JSON.stringify(meta, null, 2)
        : '';
      return `${timestamp} [${level}] [${service}] ${message}${metaStr}`;
    })
  );

  return winston.createLogger({
    level: level ?? (environment === 'production' ? 'info' : 'debug'),
    format: environment === 'production' ? productionFormat : developmentFormat,
    defaultMeta: { service },
    transports: [
      new transports.Console(),
      // In production, logs go to stdout and are collected by the log agent
      // Do NOT write to files in containerized environments
    ],
    // Handle uncaught exceptions
    exceptionHandlers: [
      new transports.Console(),
    ],
    // Handle unhandled promise rejections
    rejectionHandlers: [
      new transports.Console(),
    ],
  });
}

function redactFormat() {
  const sensitiveKeys = new Set([
    'password', 'token', 'secret', 'apiKey', 'authorization',
    'cookie', 'creditCard', 'ssn', 'creditCardNumber',
  ]);

  return format((info) => {
    const redacted = redactObject(info, sensitiveKeys);
    return redacted;
  })();
}

function redactObject(obj: any, sensitiveKeys: Set<string>): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => redactObject(item, sensitiveKeys));

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      result[key] = redactObject(value, sensitiveKeys);
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

### Winston Child Logger Pattern

Winston does not natively support child loggers the way Pino does. Implement the pattern manually:

```typescript
// src/logger/child-logger.ts
import winston, { Logger } from 'winston';

export function createChildLogger(
  parent: Logger,
  context: Record<string, unknown>
): Logger {
  return parent.child(context);
}

// Usage in middleware:
const childLogger = createChildLogger(logger, {
  requestId: req.headers['x-request-id'],
  traceId: req.headers['x-trace-id'],
  method: req.method,
  path: req.originalUrl,
});

childLogger.info('Processing request');
// Output includes all child context fields automatically
```

## Log Context Propagation

The hardest part of structured logging is ensuring that context (request ID, trace ID, user ID) is available everywhere in your code without passing a logger instance through every function call.

### The Problem

```typescript
// Without context propagation, you must pass the logger everywhere:
async function processOrder(logger: Logger, order: Order) {
  logger.info({ orderId: order.id }, 'Processing order');
  await validateOrder(logger, order);
  await chargePayment(logger, order);
  await sendConfirmation(logger, order);
}

async function validateOrder(logger: Logger, order: Order) {
  logger.info({ orderId: order.id }, 'Validating order');
  await checkInventory(logger, order.items);
}

// This is tedious and creates logger-passing spaghetti
```

### The Solution: AsyncLocalStorage

Node.js `AsyncLocalStorage` (available since Node.js 16.4, stable since 18) provides implicit context that follows the async execution chain without passing it through function parameters.

```typescript
// src/logger/async-context.ts
import { AsyncLocalStorage } from 'async_hooks';
import { Logger } from 'pino';

interface RequestContext {
  requestId: string;
  traceId?: string;
  spanId?: string;
  logger: Logger;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

export function getContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

export function getLogger(): Logger {
  const context = asyncLocalStorage.getStore();
  if (!context) {
    // Fall back to a root logger if no context is available
    // This handles logging outside of a request context (startup, background jobs)
    throw new Error('No logging context available. Use runWithContext() to establish context.');
  }
  return context.logger;
}
```

```typescript
// src/middleware/context-middleware.ts
import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { runWithContext } from '../logger/async-context';

export function contextMiddleware(rootLogger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
    const traceId = req.headers['x-trace-id'] as string;

    const childLogger = rootLogger.child({
      requestId,
      traceId,
      method: req.method,
      path: req.originalUrl,
    });

    // Set request ID on response header
    res.setHeader('x-request-id', requestId);

    // Run the rest of the request in a context with the child logger
    runWithContext(
      { requestId, traceId, logger: childLogger },
      () => next()
    );
  };
}
```

```typescript
// Now any code in the request chain can get the logger without parameters:
// src/services/order-service.ts
import { getLogger } from '../logger/async-context';

export async function processOrder(order: Order): Promise<void> {
  const logger = getLogger();

  logger.info({ orderId: order.id }, 'Processing order');
  await validateOrder(order);
  await chargePayment(order);
  await sendConfirmation(order);
  logger.info({ orderId: order.id }, 'Order processed successfully');
}

async function validateOrder(order: Order): Promise<void> {
  const logger = getLogger();
  logger.info({ orderId: order.id }, 'Validating order');
  // ... validation logic ...
}

async function chargePayment(order: Order): Promise<void> {
  const logger = getLogger();
  logger.info({ orderId: order.id, amount: order.total }, 'Charging payment');
  // ... payment logic ...
}
```

## Database Query Logging

```typescript
// src/db/logged-pool.ts
import { Pool, QueryResult, QueryConfig } from 'pg';
import { getContext } from '../logger/async-context';

export class LoggedPool {
  constructor(private pool: Pool) {}

  async query(text: string | QueryConfig, values?: unknown[]): Promise<QueryResult> {
    const context = getContext();
    const logger = context?.logger;
    const sql = typeof text === 'string' ? text : text.text;
    const startTime = process.hrtime.bigint();

    try {
      const result = await this.pool.query(text, values);
      const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;

      if (durationMs > 1000) {
        // Log slow queries as warnings
        logger?.warn({
          component: 'database',
          query: sql.substring(0, 500), // Truncate long queries
          duration: Math.round(durationMs),
          rowCount: result.rowCount,
        }, 'Slow database query');
      } else {
        logger?.debug({
          component: 'database',
          query: sql.substring(0, 200),
          duration: Math.round(durationMs),
          rowCount: result.rowCount,
        }, 'Database query completed');
      }

      return result;
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;

      logger?.error({
        component: 'database',
        query: sql.substring(0, 500),
        duration: Math.round(durationMs),
        error: {
          message: (error as Error).message,
          code: (error as any).code,
        },
      }, 'Database query failed');

      throw error;
    }
  }
}
```

## External API Call Logging

```typescript
// src/http/logged-client.ts
import { getContext } from '../logger/async-context';

interface LoggedFetchOptions extends RequestInit {
  serviceName: string;
  operationName: string;
}

export async function loggedFetch(
  url: string,
  options: LoggedFetchOptions
): Promise<Response> {
  const { serviceName, operationName, ...fetchOptions } = options;
  const context = getContext();
  const logger = context?.logger;
  const startTime = process.hrtime.bigint();

  // Propagate correlation headers
  const headers = new Headers(fetchOptions.headers);
  if (context?.requestId) {
    headers.set('x-request-id', context.requestId);
  }
  if (context?.traceId) {
    headers.set('x-trace-id', context.traceId);
  }

  logger?.info({
    component: 'http-client',
    service: serviceName,
    operation: operationName,
    method: fetchOptions.method ?? 'GET',
    url: sanitizeUrl(url),
  }, `Calling ${serviceName}`);

  try {
    const response = await fetch(url, { ...fetchOptions, headers });
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;

    const logData = {
      component: 'http-client',
      service: serviceName,
      operation: operationName,
      statusCode: response.status,
      duration: Math.round(durationMs),
    };

    if (response.ok) {
      logger?.info(logData, `${serviceName} responded successfully`);
    } else {
      logger?.warn(logData, `${serviceName} responded with error status`);
    }

    return response;
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;

    logger?.error({
      component: 'http-client',
      service: serviceName,
      operation: operationName,
      duration: Math.round(durationMs),
      error: {
        message: (error as Error).message,
        type: (error as Error).constructor.name,
      },
    }, `${serviceName} call failed`);

    throw error;
  }
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove query parameters that might contain sensitive data
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url;
  }
}
```

## Log Output Examples

### Production (JSON to stdout)

```json
{"level":"info","time":"2026-03-17T14:32:01.234Z","service":"order-service","version":"1.4.2","environment":"production","requestId":"req_7f3a2b1c","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","method":"POST","path":"/api/v1/orders","msg":"Request received"}
{"level":"info","time":"2026-03-17T14:32:01.250Z","service":"order-service","version":"1.4.2","environment":"production","requestId":"req_7f3a2b1c","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","component":"database","query":"INSERT INTO orders (id, user_id, total) VALUES ($1, $2, $3)","duration":12,"rowCount":1,"msg":"Database query completed"}
{"level":"info","time":"2026-03-17T14:32:01.380Z","service":"order-service","version":"1.4.2","environment":"production","requestId":"req_7f3a2b1c","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","component":"http-client","service":"payment-gateway","operation":"charge","statusCode":200,"duration":125,"msg":"payment-gateway responded successfully"}
{"level":"info","time":"2026-03-17T14:32:01.392Z","service":"order-service","version":"1.4.2","environment":"production","requestId":"req_7f3a2b1c","traceId":"4bf92f3577b34da6a3ce929d0e0e4736","statusCode":201,"duration":158,"msg":"Request completed"}
```

### Development (Human-Readable via pino-pretty)

```
2026-03-17 14:32:01 [INFO] [order-service] Request received
    requestId: "req_7f3a2b1c"
    method: "POST"
    path: "/api/v1/orders"
2026-03-17 14:32:01 [INFO] [order-service] Database query completed
    component: "database"
    query: "INSERT INTO orders..."
    duration: 12
2026-03-17 14:32:01 [INFO] [order-service] payment-gateway responded successfully
    component: "http-client"
    statusCode: 200
    duration: 125
2026-03-17 14:32:01 [INFO] [order-service] Request completed
    statusCode: 201
    duration: 158
```

## Logging Best Practices Checklist

- [ ] All logs are structured JSON in production
- [ ] Every log line includes `requestId` and `traceId` (for request-scoped logs)
- [ ] Every log line includes `service`, `version`, `environment`
- [ ] Log levels are used consistently (see Log Levels Strategy page)
- [ ] Sensitive data is redacted (see Sensitive Data Redaction page)
- [ ] Errors include `message`, `type`, and `stack`
- [ ] Database queries are logged with duration (slow queries at `warn` level)
- [ ] External API calls are logged with duration and status code
- [ ] Logs go to stdout/stderr, not to files (in containerized environments)
- [ ] Development mode uses human-readable formatting (pino-pretty)
- [ ] AsyncLocalStorage propagates context without parameter drilling
- [ ] Logger is created once at application startup and child loggers are derived for each request
