---
title: "Analytics Event Schema"
description: "Event taxonomy, TypeScript types, schema registry, and versioning strategy for analytics events"
tags: [analytics, event-schema, typescript, schema-registry, event-taxonomy]
difficulty: "advanced"
prerequisites: [analytics-pipeline/architecture]
lastReviewed: "2026-03-18"
---

# Analytics Event Schema

## Why Schema Matters

Without a defined schema, analytics pipelines rot. Within 6 months of ad-hoc event tracking:
- `user_id` appears in some events, `userId` in others, `uid` in others
- Some events have `price`, others have `amount`, others have `revenue`
- Properties change meaning: `status` meant "loading state" in v1, "payment status" in v2

A schema registry enforces consistency, enables validation at ingestion, powers auto-generated documentation, and allows breaking-change detection.

## Event Taxonomy

### Event Classification

All analytics events fall into these categories:

```
Track Events (user actions):
├── Page Events        → page views, URL changes
├── UI Events          → clicks, form submissions, scrolls
├── Commerce Events    → purchases, refunds, cart actions
├── Lifecycle Events   → signup, login, upgrade, churn
└── Custom Events      → product-specific actions

Identify Events:
└── User profile updates (name, email, traits)

Group Events:
└── Organization/team membership

Server Events:
├── System Events      → errors, performance metrics
├── Webhook Events     → external service notifications
└── Batch Events       → nightly job completions
```

## Core Type System

```typescript
// src/schema/base-event.ts

/**
 * Base interface for all analytics events.
 * All fields except event, userId/anonymousId are optional
 * to allow partial tracking (e.g., pre-authentication).
 */
export interface BaseEvent {
  // ─── Identity ────────────────────────────────────────────────
  /**
   * Authenticated user ID. Required after login.
   * Must match the ID in your user database.
   */
  userId?: string;

  /**
   * Anonymous ID assigned before authentication.
   * Persisted in localStorage/cookies.
   * At least one of userId or anonymousId must be present.
   */
  anonymousId?: string;

  /** Browser/app session identifier. Rotated on new session. */
  sessionId?: string;

  // ─── Classification ───────────────────────────────────────────
  /**
   * Event name. Follow snake_case convention.
   * Format: {noun}_{verb} (e.g., "button_clicked", "order_completed")
   */
  event: string;

  /** Event category for filtering/grouping */
  category?: EventCategory;

  // ─── Timing ───────────────────────────────────────────────────
  /**
   * When the event occurred on the client.
   * ISO 8601 with milliseconds: "2026-03-18T14:23:45.123Z"
   */
  timestamp?: string;

  // ─── Context ──────────────────────────────────────────────────
  context?: EventContext;

  // ─── Properties ───────────────────────────────────────────────
  /** Event-specific data. Typed per event type. */
  properties?: Record<string, unknown>;
}

export type EventCategory =
  | 'page'
  | 'ui'
  | 'commerce'
  | 'lifecycle'
  | 'media'
  | 'system'
  | 'custom';

export interface EventContext {
  /** URL of the page where event occurred */
  page?: {
    url?: string;
    path?: string;
    search?: string;
    hash?: string;
    title?: string;
    referrer?: string;
  };

  /** Network/request context */
  network?: {
    bluetooth?: boolean;
    cellular?: boolean;
    wifi?: boolean;
    type?: string;  // "4g", "wifi", "offline"
  };

  /** App context (for mobile) */
  app?: {
    name?: string;
    version?: string;
    build?: string;
    namespace?: string;
  };

  /** Campaign/UTM parameters */
  campaign?: {
    name?: string;
    source?: string;
    medium?: string;
    term?: string;
    content?: string;
  };

  /** Raw user agent string */
  userAgent?: string;

  /** IP address (dropped after geo-lookup) */
  ip?: string;

  /** Locale: "en-US", "fr-FR" */
  locale?: string;

  /** Timezone: "America/New_York" */
  timezone?: string;
}
```

## Specific Event Types

```typescript
// src/schema/events.ts

// ─── Page Events ─────────────────────────────────────────────────

export interface PageViewEvent extends BaseEvent {
  event: 'page_viewed';
  category: 'page';
  properties: {
    path: string;
    url: string;
    title?: string;
    referrer?: string;
    loadTime?: number;      // Milliseconds
    isFirstView?: boolean;  // First page view in session
  };
}

// ─── UI Events ────────────────────────────────────────────────────

export interface ButtonClickedEvent extends BaseEvent {
  event: 'button_clicked';
  category: 'ui';
  properties: {
    buttonId: string;
    buttonText?: string;
    buttonLocation: string;  // e.g., "header", "hero", "pricing-table"
    pageSection?: string;
    variant?: string;        // A/B test variant
  };
}

export interface FormSubmittedEvent extends BaseEvent {
  event: 'form_submitted';
  category: 'ui';
  properties: {
    formId: string;
    formName: string;
    fields: string[];       // Field names (not values — privacy)
    success: boolean;
    errorMessage?: string;
    timeToCompleteMs?: number;
  };
}

// ─── Commerce Events ──────────────────────────────────────────────

export interface ProductViewedEvent extends BaseEvent {
  event: 'product_viewed';
  category: 'commerce';
  properties: {
    productId: string;
    productName: string;
    category?: string;
    subcategory?: string;
    price: number;
    currency: string;
    sku?: string;
    position?: number;     // Position in a list (for position-based attribution)
    listName?: string;     // "search results", "homepage featured"
  };
}

export interface OrderCompletedEvent extends BaseEvent {
  event: 'order_completed';
  category: 'commerce';
  properties: {
    orderId: string;
    revenue: number;       // Total revenue including tax
    subtotal?: number;     // Revenue before tax/discount
    discount?: number;
    tax?: number;
    shipping?: number;
    currency: string;
    coupon?: string;
    paymentMethod?: string;
    isNewCustomer?: boolean;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      price: number;
      category?: string;
    }>;
  };
}

export interface SubscriptionUpdatedEvent extends BaseEvent {
  event: 'subscription_updated';
  category: 'lifecycle';
  properties: {
    previousPlan: string;
    newPlan: string;
    changeType: 'upgrade' | 'downgrade' | 'renewal' | 'cancellation' | 'reactivation';
    mrr?: number;       // Monthly recurring revenue change
    currency?: string;
    reason?: string;    // User-provided reason for cancellation
  };
}

// ─── Lifecycle Events ─────────────────────────────────────────────

export interface UserSignedUpEvent extends BaseEvent {
  event: 'user_signed_up';
  category: 'lifecycle';
  properties: {
    method: 'email' | 'google' | 'github' | 'saml' | 'invitation';
    invitedBy?: string;      // userId of inviter
    organizationId?: string; // If signing up to join an org
    emailVerified: boolean;
    referralCode?: string;
  };
}

export interface UserLoggedInEvent extends BaseEvent {
  event: 'user_logged_in';
  category: 'lifecycle';
  properties: {
    method: 'email' | 'google' | 'github' | 'saml' | 'magic-link';
    mfaUsed?: boolean;
    daysSinceLastLogin?: number;
  };
}

// ─── System Events ────────────────────────────────────────────────

export interface ErrorOccurredEvent extends BaseEvent {
  event: 'error_occurred';
  category: 'system';
  properties: {
    errorType: string;      // "TypeError", "NetworkError", "AppError"
    errorMessage: string;
    errorStack?: string;
    // Never include user data in error events
    component?: string;     // React component name
    endpoint?: string;      // API endpoint (no query params)
    statusCode?: number;
    requestId?: string;
  };
}

// Discriminated union of all events for type-safe handling
export type AnyEvent =
  | PageViewEvent
  | ButtonClickedEvent
  | FormSubmittedEvent
  | ProductViewedEvent
  | OrderCompletedEvent
  | SubscriptionUpdatedEvent
  | UserSignedUpEvent
  | UserLoggedInEvent
  | ErrorOccurredEvent;

// Extract event names for type safety
export type EventName = AnyEvent['event'];
```

## Schema Registry

The schema registry validates events at ingestion and provides auto-generated documentation.

### Zod-Based Validation

```typescript
// src/schema/registry.ts
import { z } from 'zod';

// Base schema (applied to all events)
export const BaseEventSchema = z.object({
  event: z.string().min(1).max(255).regex(/^[a-z][a-z0-9_]*$/,
    'Event names must be snake_case (lowercase letters, numbers, underscores)'),
  userId: z.string().min(1).max(512).optional(),
  anonymousId: z.string().min(1).max(512).optional(),
  sessionId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  category: z.enum(['page', 'ui', 'commerce', 'lifecycle', 'media', 'system', 'custom']).optional(),
  context: z.object({
    page: z.object({
      url: z.string().url().optional(),
      path: z.string().optional(),
      title: z.string().max(1000).optional(),
      referrer: z.string().optional(),
    }).optional(),
    userAgent: z.string().max(1000).optional(),
    ip: z.string().optional(),
    locale: z.string().max(20).optional(),
    timezone: z.string().max(100).optional(),
  }).optional(),
  properties: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.userId !== undefined || data.anonymousId !== undefined,
  { message: 'Either userId or anonymousId must be present' }
);

// Per-event property schemas
const EventPropertySchemas: Record<string, z.ZodType<unknown>> = {
  order_completed: z.object({
    orderId: z.string(),
    revenue: z.number().nonnegative(),
    currency: z.string().length(3), // ISO 4217
    items: z.array(z.object({
      productId: z.string(),
      productName: z.string(),
      quantity: z.number().int().positive(),
      price: z.number().nonnegative(),
    })).min(1),
  }),

  user_signed_up: z.object({
    method: z.enum(['email', 'google', 'github', 'saml', 'invitation']),
    emailVerified: z.boolean(),
  }),

  error_occurred: z.object({
    errorType: z.string(),
    errorMessage: z.string().max(5000),
    errorStack: z.string().max(50000).optional(),
  }),
};

export class SchemaRegistry {
  validate(event: unknown): {
    valid: boolean;
    errors?: string[];
    normalized?: z.infer<typeof BaseEventSchema>;
  } {
    const baseResult = BaseEventSchema.safeParse(event);
    if (!baseResult.success) {
      return {
        valid: false,
        errors: baseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      };
    }

    const normalized = baseResult.data;

    // Apply per-event property schema if available
    const propertySchema = EventPropertySchemas[normalized.event];
    if (propertySchema && normalized.properties) {
      const propResult = propertySchema.safeParse(normalized.properties);
      if (!propResult.success) {
        return {
          valid: false,
          errors: propResult.error.errors.map(
            (e) => `properties.${e.path.join('.')}: ${e.message}`
          ),
        };
      }
    }

    return { valid: true, normalized };
  }
}
```

## Schema Versioning

### Semantic Versioning for Events

Events use semantic versioning:
- **Major version** (breaking): removing a required field, changing field type
- **Minor version** (backward-compatible): adding an optional field
- **Patch version**: documentation changes, validation tightening

```typescript
// src/schema/versioning.ts

interface EventVersion {
  event: string;
  version: string;  // Semver: "1.2.0"
  fields: EventField[];
  deprecated?: boolean;
  deprecatedAt?: string;
  replacedBy?: string;
  changelog: ChangelogEntry[];
}

interface EventField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  deprecated?: boolean;
  addedInVersion?: string;
  removedInVersion?: string;
  pii?: boolean;  // Contains personally identifiable information
}

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

// Example event definition with versioning
export const ORDER_COMPLETED_V2: EventVersion = {
  event: 'order_completed',
  version: '2.0.0',
  fields: [
    {
      name: 'orderId',
      type: 'string',
      required: true,
      description: 'Unique order identifier from your order management system',
      addedInVersion: '1.0.0',
    },
    {
      name: 'revenue',
      type: 'number',
      required: true,
      description: 'Total revenue including all fees, taxes, and discounts',
      addedInVersion: '1.0.0',
    },
    {
      name: 'isNewCustomer',
      type: 'boolean',
      required: false,
      description: 'True if this is the customer\'s first order',
      addedInVersion: '1.1.0',
    },
    {
      name: 'total',  // Renamed to 'revenue' in v2
      type: 'number',
      required: false,
      description: '[DEPRECATED] Use revenue instead',
      deprecated: true,
      addedInVersion: '1.0.0',
      removedInVersion: '3.0.0',
    },
  ],
  changelog: [
    {
      version: '2.0.0',
      date: '2025-01-01',
      changes: ['BREAKING: renamed total to revenue', 'Added isNewCustomer field'],
    },
    {
      version: '1.1.0',
      date: '2024-06-01',
      changes: ['Added optional isNewCustomer field'],
    },
  ],
};
```

### Backward Compatibility Strategy

```typescript
// src/schema/compatibility.ts

// Migration function: upgrade v1 events to v2 schema
export function migrateOrderCompleted(
  event: Record<string, unknown>
): Record<string, unknown> {
  const props = (event.properties ?? {}) as Record<string, unknown>;

  return {
    ...event,
    properties: {
      ...props,
      // V1 → V2: rename total to revenue
      revenue: props.revenue ?? props.total,
      total: undefined,  // Remove deprecated field
    },
  };
}

// Apply migrations based on event version
export function applyMigrations(
  event: Record<string, unknown>
): Record<string, unknown> {
  const eventName = event.event as string;
  const schemaVersion = (event.schemaVersion as string) ?? '1.0.0';

  if (eventName === 'order_completed') {
    const [major] = schemaVersion.split('.').map(Number);
    if (major < 2) {
      return migrateOrderCompleted(event);
    }
  }

  return event;
}
```

## PII Handling

Events often contain personally identifiable information. Define a PII policy:

```typescript
// src/schema/pii-handler.ts

// Fields to redact or hash in storage
const PII_REDACT_FIELDS = [
  'email',
  'phone',
  'ssn',
  'creditCard',
  'bankAccount',
];

const PII_HASH_FIELDS = [
  'userId',        // Hash for cross-device matching without storing actual ID
];

export function sanitizePII(
  event: Record<string, unknown>
): Record<string, unknown> {
  const props = (event.properties ?? {}) as Record<string, unknown>;

  for (const field of PII_REDACT_FIELDS) {
    if (props[field] !== undefined) {
      props[field] = '[REDACTED]';
    }
  }

  // Remove IP after geo-lookup (done in enrichment stage)
  if (event.context && typeof event.context === 'object') {
    const ctx = event.context as Record<string, unknown>;
    ctx.ip = undefined;
  }

  return { ...event, properties: props };
}
```

::: warning
Never track passwords, full credit card numbers, SSNs, or other sensitive credentials in analytics events. Even "hashed" versions may be de-anonymizable. When in doubt, don't collect it.
:::

## Event Naming Convention

Consistent naming makes querying much easier. Enforce this via the registry:

| Pattern | Good | Bad |
|---------|------|-----|
| Format | snake_case | camelCase, PascalCase |
| Structure | noun_verb | verb_noun |
| Tense | past tense for completed actions | present tense |
| Specificity | `product_added_to_cart` | `add` |
| Length | 2–4 words max | `user_clicked_the_buy_now_button_on_product_page` |

```typescript
// Validation in schema registry
const EVENT_NAME_REGEX = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const EVENT_NAME_MAX_LENGTH = 64;

function validateEventName(name: string): { valid: boolean; reason?: string } {
  if (!EVENT_NAME_REGEX.test(name)) {
    return { valid: false, reason: 'Event names must be snake_case' };
  }
  if (name.length > EVENT_NAME_MAX_LENGTH) {
    return { valid: false, reason: `Event name too long (max ${EVENT_NAME_MAX_LENGTH} chars)` };
  }
  // Check for generic/ambiguous names
  const BLOCKED_NAMES = ['click', 'view', 'event', 'track', 'action', 'submit'];
  if (BLOCKED_NAMES.includes(name)) {
    return { valid: false, reason: `Event name too generic. Use "${name}_<noun>" format` };
  }
  return { valid: true };
}
```
