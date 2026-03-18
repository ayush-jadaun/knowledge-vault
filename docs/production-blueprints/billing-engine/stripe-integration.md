---
title: "Stripe Integration"
description: "Complete Stripe SDK integration with TypeScript, idempotency keys, error handling, and production patterns"
tags: [stripe, payments, typescript, sdk, idempotency]
difficulty: "advanced"
prerequisites: [billing-engine/architecture]
lastReviewed: "2026-03-18"
---

# Stripe Integration

## Why Stripe? (And Its Tradeoffs)

Stripe is the dominant payment processor for SaaS not because it's the cheapest (it isn't — 2.9% + $0.30 per transaction), but because of:
- Best-in-class API design and documentation
- PCI DSS Level 1 compliance out of the box
- Built-in 3DS2 / Strong Customer Authentication (SCA)
- Stripe Billing handles subscription state machine basics
- Radar fraud detection included
- Stripe Tax for automatic tax calculation

**Tradeoffs:**
- Higher fees than Adyen, Braintree, or direct acquiring
- Limited control over payment authorization logic
- Geographic coverage gaps (some countries require local processors)
- Stripe's subscription model can be a leaky abstraction for complex billing

## SDK Setup

```typescript
import Stripe from 'stripe';

// Always pin the API version — Stripe makes breaking changes
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
  maxNetworkRetries: 3,  // Retry on network errors (idempotent by default for GET)
  timeout: 30000,        // 30 second timeout
  telemetry: false,      // Disable Stripe telemetry in production
  appInfo: {
    name: 'YourApp Billing',
    version: '1.0.0',
    url: 'https://yourapp.com',
  },
});

// Validate at startup
export async function validateStripeConnection(): Promise<void> {
  try {
    await stripe.accounts.retrieve();
    console.log('Stripe connection validated');
  } catch (error) {
    throw new Error(`Stripe connection failed: ${(error as Error).message}`);
  }
}
```

## Customer Management

```typescript
import Stripe from 'stripe';
import { stripe } from './stripe-client';
import { CustomerRepository } from './repositories/customer-repository';

interface CreateCustomerParams {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
  idempotencyKey: string;
}

interface AttachPaymentMethodParams {
  customerId: string;      // Your internal customer ID
  paymentMethodId: string; // pm_xxx from Stripe.js
  setAsDefault?: boolean;
}

export class StripeCustomerService {
  constructor(private readonly customerRepo: CustomerRepository) {}

  async createCustomer(params: CreateCustomerParams): Promise<Stripe.Customer> {
    const stripeCustomer = await stripe.customers.create(
      {
        email: params.email,
        name: params.name,
        metadata: {
          ...params.metadata,
          source: 'billing-engine',
        },
      },
      {
        idempotencyKey: `customer-create-${params.idempotencyKey}`,
      }
    );

    return stripeCustomer;
  }

  async attachPaymentMethod(params: AttachPaymentMethodParams): Promise<Stripe.PaymentMethod> {
    const customer = await this.customerRepo.getById(params.customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${params.customerId}`);
    }

    // Attach to Stripe customer
    const paymentMethod = await stripe.paymentMethods.attach(
      params.paymentMethodId,
      { customer: customer.stripeId }
    );

    // Set as default if requested
    if (params.setAsDefault) {
      await stripe.customers.update(customer.stripeId, {
        invoice_settings: {
          default_payment_method: params.paymentMethodId,
        },
      });
    }

    return paymentMethod;
  }

  async listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    const customer = await this.customerRepo.getById(customerId);
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.stripeId,
      type: 'card',
      limit: 10,
    });

    return paymentMethods.data;
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    await stripe.paymentMethods.detach(paymentMethodId);
  }

  // Create a SetupIntent for adding payment methods without charging
  async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    const customer = await this.customerRepo.getById(customerId);
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    return stripe.setupIntents.create({
      customer: customer.stripeId,
      payment_method_types: ['card'],
      usage: 'off_session',  // Will be used for future off-session payments
    });
  }
}
```

## Subscription Management

```typescript
import Stripe from 'stripe';
import { stripe } from './stripe-client';
import { IdempotencyService } from './idempotency-service';
import { SubscriptionRepository } from './repositories/subscription-repository';
import { mapStripeError } from './error-mapping';

export interface CreateStripeSubscriptionParams {
  stripeCustomerId: string;
  stripePriceId: string;
  quantity?: number;
  trialDays?: number;
  paymentMethodId?: string;
  couponId?: string;
  taxRateIds?: string[];
  metadata?: Record<string, string>;
  idempotencyKey: string;
}

export interface UpdateStripeSubscriptionParams {
  stripeSubscriptionId: string;
  stripePriceId?: string;
  quantity?: number;
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
  idempotencyKey: string;
}

export class StripeSubscriptionService {
  constructor(
    private readonly idempotencyService: IdempotencyService,
    private readonly subscriptionRepo: SubscriptionRepository
  ) {}

  async createSubscription(
    params: CreateStripeSubscriptionParams
  ): Promise<Stripe.Subscription> {
    // Check idempotency first
    const existing = await this.idempotencyService.get(params.idempotencyKey);
    if (existing) {
      return existing as Stripe.Subscription;
    }

    await this.idempotencyService.setProcessing(params.idempotencyKey);

    try {
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: params.stripeCustomerId,
        items: [
          {
            price: params.stripePriceId,
            quantity: params.quantity,
          },
        ],
        expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
        // Collect payment immediately — fail fast on card issues
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        metadata: params.metadata ?? {},
      };

      if (params.paymentMethodId) {
        subscriptionParams.default_payment_method = params.paymentMethodId;
      }

      if (params.trialDays && params.trialDays > 0) {
        subscriptionParams.trial_period_days = params.trialDays;
      }

      if (params.couponId) {
        subscriptionParams.coupon = params.couponId;
      }

      if (params.taxRateIds && params.taxRateIds.length > 0) {
        subscriptionParams.default_tax_rates = params.taxRateIds;
      }

      const subscription = await stripe.subscriptions.create(
        subscriptionParams,
        { idempotencyKey: params.idempotencyKey }
      );

      await this.idempotencyService.setCompleted(
        params.idempotencyKey,
        subscription
      );

      return subscription;
    } catch (error) {
      await this.idempotencyService.setFailed(params.idempotencyKey);
      throw mapStripeError(error as Stripe.errors.StripeError);
    }
  }

  async updateSubscription(
    params: UpdateStripeSubscriptionParams
  ): Promise<Stripe.Subscription> {
    const updateParams: Stripe.SubscriptionUpdateParams = {
      proration_behavior: params.prorationBehavior ?? 'create_prorations',
    };

    if (params.stripePriceId) {
      // Must provide items array with current items to replace
      const currentSub = await stripe.subscriptions.retrieve(
        params.stripeSubscriptionId
      );

      updateParams.items = [
        {
          id: currentSub.items.data[0].id,  // Replace the first item
          price: params.stripePriceId,
          quantity: params.quantity ?? currentSub.items.data[0].quantity,
        },
      ];
    } else if (params.quantity !== undefined) {
      const currentSub = await stripe.subscriptions.retrieve(
        params.stripeSubscriptionId
      );

      updateParams.items = [
        {
          id: currentSub.items.data[0].id,
          quantity: params.quantity,
        },
      ];
    }

    return stripe.subscriptions.update(
      params.stripeSubscriptionId,
      updateParams,
      { idempotencyKey: params.idempotencyKey }
    );
  }

  async cancelSubscription(
    stripeSubscriptionId: string,
    options: {
      immediately?: boolean;
      invoiceNow?: boolean;
      prorate?: boolean;
    } = {}
  ): Promise<Stripe.Subscription> {
    if (options.immediately) {
      return stripe.subscriptions.cancel(stripeSubscriptionId, {
        invoice_now: options.invoiceNow ?? false,
        prorate: options.prorate ?? false,
      });
    } else {
      // Cancel at period end
      return stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }
  }

  async reactivateSubscription(
    stripeSubscriptionId: string
  ): Promise<Stripe.Subscription> {
    // Remove scheduled cancellation
    return stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
  }

  // Retrieve upcoming invoice preview (before actually charging)
  async previewUpcomingInvoice(params: {
    stripeCustomerId: string;
    stripeSubscriptionId?: string;
    newPriceId?: string;
    quantity?: number;
  }): Promise<Stripe.UpcomingInvoice> {
    const previewParams: Stripe.InvoiceRetrieveUpcomingParams = {
      customer: params.stripeCustomerId,
    };

    if (params.stripeSubscriptionId) {
      previewParams.subscription = params.stripeSubscriptionId;
    }

    if (params.newPriceId && params.stripeSubscriptionId) {
      const currentSub = await stripe.subscriptions.retrieve(
        params.stripeSubscriptionId
      );

      previewParams.subscription_items = [
        {
          id: currentSub.items.data[0].id,
          price: params.newPriceId,
          quantity: params.quantity,
        },
      ];
      previewParams.subscription_proration_behavior = 'create_prorations';
    }

    return stripe.invoices.retrieveUpcoming(previewParams);
  }
}
```

## Payment Intent Handling (3DS / SCA)

3D Secure authentication is required for most European cards and increasingly common globally. Always handle it:

```typescript
export interface PaymentConfirmationResult {
  status: 'succeeded' | 'requires_action' | 'failed';
  clientSecret?: string;   // For 3DS redirect
  errorMessage?: string;
}

export async function confirmSubscriptionPayment(
  subscription: Stripe.Subscription
): Promise<PaymentConfirmationResult> {
  const invoice = subscription.latest_invoice as Stripe.Invoice;
  const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

  if (!paymentIntent) {
    // Free plan or trial with no payment intent
    return { status: 'succeeded' };
  }

  switch (paymentIntent.status) {
    case 'succeeded':
      return { status: 'succeeded' };

    case 'requires_action':
    case 'requires_source_action': {
      // 3DS authentication required — client must handle redirect
      return {
        status: 'requires_action',
        clientSecret: paymentIntent.client_secret!,
      };
    }

    case 'requires_payment_method': {
      // Card was declined
      return {
        status: 'failed',
        errorMessage: 'Payment method declined. Please update your card.',
      };
    }

    case 'processing': {
      // Bank transfers, SEPA — async, will complete via webhook
      return { status: 'succeeded' };  // Treat as success, webhook will confirm
    }

    default:
      return {
        status: 'failed',
        errorMessage: `Unexpected payment state: ${paymentIntent.status}`,
      };
  }
}
```

## Usage-Based Billing

For metered billing (API calls, storage, compute):

```typescript
export class StripeUsageService {
  // Report usage to Stripe for metered billing
  async reportUsage(params: {
    stripeSubscriptionItemId: string;
    quantity: number;
    timestamp: number;        // Unix timestamp
    action?: 'increment' | 'set';
    idempotencyKey: string;
  }): Promise<Stripe.UsageRecord> {
    return stripe.subscriptionItems.createUsageRecord(
      params.stripeSubscriptionItemId,
      {
        quantity: params.quantity,
        timestamp: params.timestamp,
        action: params.action ?? 'increment',
      },
      {
        idempotencyKey: params.idempotencyKey,
      }
    );
  }

  // Get current usage for a subscription item
  async getCurrentUsage(
    stripeSubscriptionItemId: string
  ): Promise<Stripe.UsageRecordSummary[]> {
    const summaries = await stripe.subscriptionItems.listUsageRecordSummaries(
      stripeSubscriptionItemId,
      { limit: 1 }
    );

    return summaries.data;
  }

  // Batch report usage for efficiency
  async batchReportUsage(records: Array<{
    stripeSubscriptionItemId: string;
    quantity: number;
    timestamp: number;
    idempotencyKey: string;
  }>): Promise<void> {
    // Stripe doesn't have a batch API — fire concurrently with rate limit
    const BATCH_SIZE = 10;  // Stay well under 100 req/sec limit

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(record =>
          this.reportUsage({
            ...record,
            action: 'increment',
          })
        )
      );

      // Brief pause between batches to respect rate limits
      if (i + BATCH_SIZE < records.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
}
```

## Coupon & Discount Management

```typescript
export class StripeCouponService {
  async createCoupon(params: {
    id?: string;         // Custom coupon code
    name: string;
    type: 'percent' | 'amount';
    value: number;       // Percent (0-100) or amount in cents
    currency?: string;
    duration: 'once' | 'repeating' | 'forever';
    durationInMonths?: number;  // Required for 'repeating'
    maxRedemptions?: number;
    redeemBy?: Date;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Coupon> {
    const couponParams: Stripe.CouponCreateParams = {
      id: params.id,
      name: params.name,
      duration: params.duration,
      metadata: params.metadata ?? {},
    };

    if (params.type === 'percent') {
      couponParams.percent_off = params.value;
    } else {
      couponParams.amount_off = params.value;
      couponParams.currency = params.currency ?? 'usd';
    }

    if (params.duration === 'repeating') {
      couponParams.duration_in_months = params.durationInMonths;
    }

    if (params.maxRedemptions) {
      couponParams.max_redemptions = params.maxRedemptions;
    }

    if (params.redeemBy) {
      couponParams.redeem_by = Math.floor(params.redeemBy.getTime() / 1000);
    }

    return stripe.coupons.create(couponParams);
  }

  async validateCoupon(couponId: string): Promise<{
    valid: boolean;
    reason?: string;
    coupon?: Stripe.Coupon;
  }> {
    try {
      const coupon = await stripe.coupons.retrieve(couponId);

      if (!coupon.valid) {
        return { valid: false, reason: 'Coupon has expired or been fully redeemed' };
      }

      if (coupon.redeem_by && coupon.redeem_by < Date.now() / 1000) {
        return { valid: false, reason: 'Coupon has expired' };
      }

      if (
        coupon.max_redemptions &&
        coupon.times_redeemed >= coupon.max_redemptions
      ) {
        return { valid: false, reason: 'Coupon has reached maximum redemptions' };
      }

      return { valid: true, coupon };
    } catch (error) {
      if ((error as Stripe.errors.StripeError).code === 'resource_missing') {
        return { valid: false, reason: 'Coupon not found' };
      }
      throw error;
    }
  }
}
```

## Invoice Management

```typescript
export class StripeInvoiceService {
  // Manually trigger an invoice (for one-off charges)
  async createOneTimeInvoice(params: {
    stripeCustomerId: string;
    items: Array<{
      description: string;
      amountCents: number;
      currency?: string;
      quantity?: number;
    }>;
    metadata?: Record<string, string>;
    idempotencyKey: string;
  }): Promise<Stripe.Invoice> {
    // Create invoice items first
    for (const item of params.items) {
      await stripe.invoiceItems.create({
        customer: params.stripeCustomerId,
        amount: item.amountCents,
        currency: item.currency ?? 'usd',
        description: item.description,
        quantity: item.quantity ?? 1,
      });
    }

    // Create and finalize the invoice
    const invoice = await stripe.invoices.create(
      {
        customer: params.stripeCustomerId,
        auto_advance: true,  // Auto-finalize and charge
        metadata: params.metadata ?? {},
        collection_method: 'charge_automatically',
      },
      { idempotencyKey: `invoice-create-${params.idempotencyKey}` }
    );

    // Finalize it (moves from draft to open)
    return stripe.invoices.finalizeInvoice(invoice.id!, {
      auto_advance: true,
    });
  }

  async voidInvoice(stripeInvoiceId: string): Promise<Stripe.Invoice> {
    return stripe.invoices.voidInvoice(stripeInvoiceId);
  }

  async retrieveInvoicePdf(stripeInvoiceId: string): Promise<string> {
    const invoice = await stripe.invoices.retrieve(stripeInvoiceId);
    if (!invoice.invoice_pdf) {
      throw new Error(`Invoice ${stripeInvoiceId} has no PDF`);
    }
    return invoice.invoice_pdf;
  }

  // Send invoice to customer via Stripe's email
  async sendInvoice(stripeInvoiceId: string): Promise<Stripe.Invoice> {
    return stripe.invoices.sendInvoice(stripeInvoiceId);
  }
}
```

## Refunds

```typescript
export interface ProcessRefundParams {
  stripePaymentIntentId: string;
  amountCents?: number;   // Partial refund; omit for full refund
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  metadata?: Record<string, string>;
  idempotencyKey: string;
}

export async function processRefund(
  params: ProcessRefundParams
): Promise<Stripe.Refund> {
  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: params.stripePaymentIntentId,
    reason: params.reason ?? 'requested_by_customer',
    metadata: params.metadata ?? {},
  };

  if (params.amountCents !== undefined) {
    refundParams.amount = params.amountCents;
  }

  return stripe.refunds.create(refundParams, {
    idempotencyKey: `refund-${params.idempotencyKey}`,
  });
}
```

## Stripe Connect (Marketplace Billing)

For platforms that need to charge on behalf of connected accounts:

```typescript
export class StripeConnectService {
  // Create a charge on behalf of a connected account
  async createConnectCharge(params: {
    amount: number;
    currency: string;
    connectedAccountId: string;   // acct_xxx
    applicationFeeAmount: number; // Platform fee in cents
    customerId: string;           // Customer on the connected account
    paymentMethodId: string;
    description: string;
    idempotencyKey: string;
  }): Promise<Stripe.PaymentIntent> {
    return stripe.paymentIntents.create(
      {
        amount: params.amount,
        currency: params.currency,
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        confirm: true,
        application_fee_amount: params.applicationFeeAmount,
        transfer_data: {
          destination: params.connectedAccountId,
        },
        description: params.description,
      },
      {
        stripeAccount: params.connectedAccountId,
        idempotencyKey: params.idempotencyKey,
      }
    );
  }

  // Transfer funds to a connected account
  async transferToAccount(params: {
    amount: number;
    currency: string;
    destination: string;  // acct_xxx
    description: string;
    idempotencyKey: string;
  }): Promise<Stripe.Transfer> {
    return stripe.transfers.create(
      {
        amount: params.amount,
        currency: params.currency,
        destination: params.destination,
        description: params.description,
      },
      { idempotencyKey: params.idempotencyKey }
    );
  }
}
```

## Stripe Rate Limiting

```typescript
import Stripe from 'stripe';

// Retry with exponential backoff for rate limits
export async function withStripeRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;

      // Only retry on rate limits and 5xx errors
      const isRetryable =
        stripeError.statusCode === 429 ||
        (stripeError.statusCode ?? 0) >= 500;

      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }

      lastError = error as Error;

      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      const jitterMs = Math.random() * 500;

      console.warn(
        `Stripe API error (attempt ${attempt}/${maxAttempts}), ` +
        `retrying in ${delayMs}ms: ${stripeError.message}`
      );

      await new Promise(resolve => setTimeout(resolve, delayMs + jitterMs));
    }
  }

  throw lastError!;
}
```

## Testing Stripe Integration

```typescript
// Use Stripe test clock for time-sensitive subscription tests
export async function createTestClock(
  frozenTime: Date
): Promise<Stripe.TestHelpers.TestClock> {
  return stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(frozenTime.getTime() / 1000),
  });
}

// Advance test clock to simulate time passing
export async function advanceTestClock(
  testClockId: string,
  frozenTime: Date
): Promise<void> {
  await stripe.testHelpers.testClocks.advance(testClockId, {
    frozen_time: Math.floor(frozenTime.getTime() / 1000),
  });

  // Wait for clock advancement to process
  let clock: Stripe.TestHelpers.TestClock;
  do {
    await new Promise(r => setTimeout(r, 500));
    clock = await stripe.testHelpers.testClocks.retrieve(testClockId);
  } while (clock.status === 'advancing');
}

// Test card numbers
export const TEST_CARDS = {
  success: '4242424242424242',
  requiresAction: '4000002500003155',  // 3DS
  decline: '4000000000000002',
  insufficientFunds: '4000000000009995',
  expired: '4000000000000069',
  incorrectCvc: '4000000000000127',
  processingError: '4000000000000119',
} as const;
```

::: info War Story
We shipped a feature that updated subscription quantities in response to user seat additions. The flow was: user adds seat → API call → Stripe subscription update → webhook confirms.

Under load testing at 500 concurrent seat additions, we hit Stripe's 100 req/sec rate limit. Every request after the first 100 returned `429 Too Many Requests`. Our retry logic had a bug — it wasn't exponential backoff, it was a fixed 1-second retry. So 500 requests hit Stripe, 400 failed, all retried in 1 second, 400 failed again, and so on. We effectively DDoS'd ourselves.

The fix: proper exponential backoff with jitter (Decorrelated Jitter works best), plus a token bucket rate limiter in front of all Stripe API calls that enforces our own 80 req/sec limit (20% buffer below Stripe's limit).
:::

## Security Checklist

::: warning Never do these
- Never log raw Stripe API keys — even to debug logs
- Never store raw card numbers in your database
- Never transmit card data through your own servers (use Stripe.js / Stripe Elements)
- Never disable signature verification on webhooks in production
- Never reuse idempotency keys for different operations
:::

::: tip Always do these
- Rotate webhook signing secrets if you suspect exposure
- Use Stripe's restricted API keys for services that only need read access
- Enable Stripe Radar fraud rules appropriate for your business model
- Use test mode for all development and staging environments
- Monitor for `stripe.error` events in your APM
:::

## Mathematical Precision

All monetary amounts must use integers (cents), never floating point:

$$
\text{amount\_cents} = \lfloor \text{dollars} \times 100 \rfloor
$$

For currency conversion:
$$
\text{amount\_target} = \lfloor \text{amount\_source} \times \text{exchange\_rate} \rfloor
$$

Always round down (floor) when converting to avoid overcharging. Use `decimal.js` or `big.js` for any intermediate calculations:

```typescript
import Decimal from 'decimal.js';

// CORRECT: Use Decimal for intermediate calculation
function calculateTieredPrice(units: number, tiers: PriceTier[]): number {
  let totalCents = new Decimal(0);
  let remainingUnits = units;

  for (const tier of tiers) {
    const unitsInTier = tier.upTo
      ? Math.min(remainingUnits, tier.upTo)
      : remainingUnits;

    if (unitsInTier <= 0) break;

    totalCents = totalCents.plus(
      new Decimal(unitsInTier).times(tier.unitAmountCents)
    );

    remainingUnits -= unitsInTier;
  }

  // Floor to integer cents
  return totalCents.floor().toNumber();
}

// WRONG: Floating point arithmetic for money
function calculateTieredPriceWrong(units: number, tiers: PriceTier[]): number {
  let total = 0;
  for (const tier of tiers) {
    // Floating point errors accumulate here
    total += units * tier.unitAmountCents;
  }
  return Math.round(total);  // May be wrong by 1 cent
}
```
