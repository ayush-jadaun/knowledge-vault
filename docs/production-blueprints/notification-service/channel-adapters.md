---
title: "Channel Adapters"
description: "Email (SES/SendGrid), SMS (Twilio), push (FCM/APNs), in-app, and Slack adapter implementations"
tags: [notifications, email, sms, push, fcm, apns, twilio, sendgrid, ses]
difficulty: "advanced"
prerequisites: [notification-service/architecture]
lastReviewed: "2026-03-18"
---

# Channel Adapters

## Adapter Interface

All channel adapters implement a common interface, enabling the worker to treat them uniformly:

```typescript
export interface NotificationAdapter<TContent> {
  readonly name: string;
  send(recipient: string, content: TContent): Promise<SendResult>;
  validateRecipient(recipient: string): boolean;
  handleProviderError(error: unknown): AdapterError;
}

export interface SendResult {
  messageId: string;
  provider: string;
  metadata?: Record<string, unknown>;
}

export interface AdapterError {
  code: AdapterErrorCode;
  message: string;
  retryable: boolean;
  suppressRecipient?: boolean;  // True if we should never retry this recipient
}

export enum AdapterErrorCode {
  INVALID_RECIPIENT = 'INVALID_RECIPIENT',       // Bad email/phone format
  RECIPIENT_BOUNCED = 'RECIPIENT_BOUNCED',        // Hard bounce
  RATE_LIMITED = 'RATE_LIMITED',                  // Provider rate limit
  PROVIDER_ERROR = 'PROVIDER_ERROR',              // 5xx from provider
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',  // Bad API key
  CONTENT_REJECTED = 'CONTENT_REJECTED',          // Content policy violation
  INVALID_TOKEN = 'INVALID_TOKEN',                // Stale push token
}
```

## Email: AWS SES

SES is the most cost-effective high-volume email provider ($0.10/1000 emails vs. SendGrid's $0.89/1000). Use SES for high-volume transactional, SendGrid for marketing analytics.

```typescript
import { SESClient, SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-ses';
import { logger } from '../logger';

export interface RenderedEmail {
  subject: string;
  htmlBody: string;
  textBody: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export class SESEmailAdapter implements NotificationAdapter<RenderedEmail> {
  readonly name = 'ses';
  private readonly client: SESClient;

  constructor(private readonly config: { region: string; fromEmail: string }) {
    this.client = new SESClient({ region: config.region });
  }

  async send(recipient: string, content: RenderedEmail): Promise<SendResult> {
    const params: SendEmailCommandInput = {
      Source: `${content.fromName} <${content.fromEmail}>`,
      Destination: {
        ToAddresses: [recipient],
      },
      Message: {
        Subject: {
          Data: content.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: content.htmlBody,
            Charset: 'UTF-8',
          },
          Text: {
            Data: content.textBody,
            Charset: 'UTF-8',
          },
        },
      },
      ReplyToAddresses: content.replyTo ? [content.replyTo] : undefined,
      // Add List-Unsubscribe header for marketing emails
      ...(content.headers && {
        Tags: Object.entries(content.headers).map(([Name, Value]) => ({ Name, Value })),
      }),
    };

    try {
      const command = new SendEmailCommand(params);
      const response = await this.client.send(command);

      if (!response.MessageId) {
        throw new Error('SES returned no MessageId');
      }

      logger.info({ msg: 'Email sent via SES', messageId: response.MessageId, recipient });

      return {
        messageId: response.MessageId,
        provider: 'ses',
      };
    } catch (error) {
      throw this.handleProviderError(error);
    }
  }

  validateRecipient(email: string): boolean {
    // RFC 5322 simplified validation
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  handleProviderError(error: unknown): AdapterError {
    const awsError = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };

    switch (awsError.name) {
      case 'MessageRejected':
        return {
          code: AdapterErrorCode.CONTENT_REJECTED,
          message: awsError.message ?? 'Message rejected by SES',
          retryable: false,
        };
      case 'MailFromDomainNotVerifiedException':
        return {
          code: AdapterErrorCode.AUTHENTICATION_ERROR,
          message: 'Sending domain not verified in SES',
          retryable: false,
        };
      case 'ThrottlingException':
        return {
          code: AdapterErrorCode.RATE_LIMITED,
          message: 'SES rate limit exceeded',
          retryable: true,
        };
      default:
        return {
          code: AdapterErrorCode.PROVIDER_ERROR,
          message: awsError.message ?? 'Unknown SES error',
          retryable: (awsError.$metadata?.httpStatusCode ?? 0) >= 500,
        };
    }
  }
}
```

## Email: SendGrid

SendGrid excels at deliverability analytics — click tracking, open tracking, geographic data.

```typescript
import sgMail from '@sendgrid/mail';

export class SendGridEmailAdapter implements NotificationAdapter<RenderedEmail> {
  readonly name = 'sendgrid';

  constructor(apiKey: string) {
    sgMail.setApiKey(apiKey);
  }

  async send(recipient: string, content: RenderedEmail): Promise<SendResult> {
    const msg: sgMail.MailDataRequired = {
      to: recipient,
      from: {
        email: content.fromEmail,
        name: content.fromName,
      },
      subject: content.subject,
      html: content.htmlBody,
      text: content.textBody,
      replyTo: content.replyTo,
      headers: content.headers,
      trackingSettings: {
        clickTracking: { enable: true },
        openTracking: { enable: true },
      },
    };

    const [response] = await sgMail.send(msg);

    // SendGrid returns X-Message-Id in response headers
    const messageId = response.headers['x-message-id'] as string;

    return {
      messageId: messageId ?? `sg-${Date.now()}`,
      provider: 'sendgrid',
      metadata: {
        statusCode: response.statusCode,
      },
    };
  }

  validateRecipient(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  handleProviderError(error: unknown): AdapterError {
    const sgError = error as { code?: number; response?: { body?: { errors?: Array<{ message: string }> } } };

    if (sgError.code === 401) {
      return {
        code: AdapterErrorCode.AUTHENTICATION_ERROR,
        message: 'Invalid SendGrid API key',
        retryable: false,
      };
    }

    if (sgError.code === 429) {
      return {
        code: AdapterErrorCode.RATE_LIMITED,
        message: 'SendGrid rate limit',
        retryable: true,
      };
    }

    const errors = sgError.response?.body?.errors;
    const message = errors?.[0]?.message ?? 'SendGrid error';

    return {
      code: AdapterErrorCode.PROVIDER_ERROR,
      message,
      retryable: (sgError.code ?? 0) >= 500,
    };
  }
}
```

## SMS: Twilio

```typescript
import twilio from 'twilio';

export interface RenderedSms {
  body: string;      // Max 1600 chars (concatenated segments)
  mediaUrls?: string[];  // MMS attachments
}

export class TwilioSmsAdapter implements NotificationAdapter<RenderedSms> {
  readonly name = 'twilio';
  private readonly client: twilio.Twilio;

  constructor(
    private readonly config: {
      accountSid: string;
      authToken: string;
      fromNumber: string;
      messagingServiceSid?: string;  // Use messaging service for better deliverability
    }
  ) {
    this.client = twilio(config.accountSid, config.authToken);
  }

  async send(recipient: string, content: RenderedSms): Promise<SendResult> {
    // Enforce max SMS length
    const body = content.body.substring(0, 1600);

    const params: twilio.MessageListInstanceCreateOptions = {
      body,
      to: recipient,
    };

    if (this.config.messagingServiceSid) {
      params.messagingServiceSid = this.config.messagingServiceSid;
    } else {
      params.from = this.config.fromNumber;
    }

    if (content.mediaUrls && content.mediaUrls.length > 0) {
      params.mediaUrl = content.mediaUrls;
    }

    try {
      const message = await this.client.messages.create(params);

      return {
        messageId: message.sid,
        provider: 'twilio',
        metadata: {
          status: message.status,
          numSegments: message.numSegments,
        },
      };
    } catch (error) {
      throw this.handleProviderError(error);
    }
  }

  validateRecipient(phone: string): boolean {
    // E.164 format: +1234567890
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }

  handleProviderError(error: unknown): AdapterError {
    const twilioError = error as { code?: number; message?: string; status?: number };

    // Twilio error codes: https://www.twilio.com/docs/api/errors
    switch (twilioError.code) {
      case 21211: // Invalid 'To' phone number
      case 21614: // 'To' number is not a valid mobile number
        return {
          code: AdapterErrorCode.INVALID_RECIPIENT,
          message: `Invalid phone number: ${twilioError.message}`,
          retryable: false,
          suppressRecipient: true,  // Remove from future sends
        };

      case 21408: // Permission denied
      case 21610: // Attempt to send to unsubscribed recipient
        return {
          code: AdapterErrorCode.RECIPIENT_BOUNCED,
          message: 'Recipient has opted out of SMS',
          retryable: false,
          suppressRecipient: true,
        };

      case 20429: // Too Many Requests
        return {
          code: AdapterErrorCode.RATE_LIMITED,
          message: 'Twilio rate limited',
          retryable: true,
        };

      default:
        return {
          code: AdapterErrorCode.PROVIDER_ERROR,
          message: twilioError.message ?? 'Twilio error',
          retryable: (twilioError.status ?? 0) >= 500,
        };
    }
  }
}
```

## Push: Firebase Cloud Messaging (FCM)

FCM handles Android push and web push. Use the Firebase Admin SDK:

```typescript
import * as admin from 'firebase-admin';

export interface RenderedPush {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;  // Custom data payload
  badge?: number;    // iOS badge count
  sound?: string;    // Sound file name
  priority?: 'normal' | 'high';
  collapseKey?: string;  // Collapse similar notifications
  ttl?: number;          // Time to live in seconds
  clickAction?: string;  // URL to open on click
}

export class FCMPushAdapter implements NotificationAdapter<RenderedPush> {
  readonly name = 'fcm';
  private readonly messaging: admin.messaging.Messaging;

  constructor(serviceAccountKey: admin.ServiceAccount) {
    const app = admin.initializeApp(
      { credential: admin.credential.cert(serviceAccountKey) },
      'fcm-app'
    );
    this.messaging = admin.messaging(app);
  }

  // Send to a single device token
  async send(deviceToken: string, content: RenderedPush): Promise<SendResult> {
    const message: admin.messaging.Message = {
      token: deviceToken,
      notification: {
        title: content.title,
        body: content.body,
        imageUrl: content.imageUrl,
      },
      data: content.data,
      android: {
        priority: content.priority === 'high' ? 'high' : 'normal',
        collapseKey: content.collapseKey,
        ttl: content.ttl ? content.ttl * 1000 : undefined,  // FCM expects ms
        notification: {
          clickAction: content.clickAction,
          sound: content.sound,
        },
      },
      webpush: {
        notification: {
          title: content.title,
          body: content.body,
          icon: content.imageUrl,
          badge: content.badge?.toString(),
        },
        fcmOptions: {
          link: content.clickAction,
        },
      },
    };

    try {
      const messageId = await this.messaging.send(message);
      return { messageId, provider: 'fcm' };
    } catch (error) {
      throw this.handleProviderError(error);
    }
  }

  // Send to multiple devices efficiently
  async sendMulticast(
    deviceTokens: string[],
    content: RenderedPush
  ): Promise<{ success: string[]; failed: Array<{ token: string; error: AdapterError }> }> {
    // FCM batch limit: 500 tokens per request
    const BATCH_SIZE = 500;
    const success: string[] = [];
    const failed: Array<{ token: string; error: AdapterError }> = [];

    for (let i = 0; i < deviceTokens.length; i += BATCH_SIZE) {
      const batch = deviceTokens.slice(i, i + BATCH_SIZE);

      const multicastMessage: admin.messaging.MulticastMessage = {
        tokens: batch,
        notification: {
          title: content.title,
          body: content.body,
        },
        data: content.data,
      };

      const response = await this.messaging.sendEachForMulticast(multicastMessage);

      response.responses.forEach((resp, idx) => {
        if (resp.success) {
          success.push(batch[idx]);
        } else {
          failed.push({
            token: batch[idx],
            error: this.handleProviderError(resp.error),
          });
        }
      });
    }

    return { success, failed };
  }

  validateRecipient(token: string): boolean {
    // FCM tokens are typically 140-200 chars
    return token.length >= 100 && token.length <= 500;
  }

  handleProviderError(error: unknown): AdapterError {
    const fcmError = error as admin.FirebaseError;

    switch (fcmError?.code) {
      case 'messaging/registration-token-not-registered':
      case 'messaging/invalid-registration-token':
        return {
          code: AdapterErrorCode.INVALID_TOKEN,
          message: 'Device token is invalid or not registered',
          retryable: false,
          suppressRecipient: true,  // Remove stale token
        };
      case 'messaging/quota-exceeded':
        return {
          code: AdapterErrorCode.RATE_LIMITED,
          message: 'FCM quota exceeded',
          retryable: true,
        };
      case 'messaging/server-unavailable':
      case 'messaging/internal-error':
        return {
          code: AdapterErrorCode.PROVIDER_ERROR,
          message: 'FCM server error',
          retryable: true,
        };
      default:
        return {
          code: AdapterErrorCode.PROVIDER_ERROR,
          message: fcmError?.message ?? 'Unknown FCM error',
          retryable: false,
        };
    }
  }
}
```

## Push: Apple Push Notification service (APNs)

```typescript
import apn from '@parse/node-apn';

export class APNsPushAdapter implements NotificationAdapter<RenderedPush> {
  readonly name = 'apns';
  private readonly provider: apn.Provider;

  constructor(config: {
    keyId: string;
    teamId: string;
    privateKey: string;  // PEM format .p8 key content
    bundleId: string;
    production: boolean;
  }) {
    this.provider = new apn.Provider({
      token: {
        key: config.privateKey,
        keyId: config.keyId,
        teamId: config.teamId,
      },
      production: config.production,
    });
  }

  async send(deviceToken: string, content: RenderedPush): Promise<SendResult> {
    const notification = new apn.Notification();

    notification.expiry = content.ttl
      ? Math.floor(Date.now() / 1000) + content.ttl
      : Math.floor(Date.now() / 1000) + 86400;  // 24h default

    notification.badge = content.badge;
    notification.sound = content.sound ?? 'default';
    notification.alert = {
      title: content.title,
      body: content.body,
    };
    notification.payload = content.data ?? {};
    notification.topic = `${process.env.APNS_BUNDLE_ID}`;
    notification.priority = content.priority === 'high' ? 10 : 5;

    if (content.collapseKey) {
      notification.collapseId = content.collapseKey;
    }

    const result = await this.provider.send(notification, deviceToken);

    if (result.failed.length > 0) {
      const failure = result.failed[0];
      throw {
        code: failure.response?.reason,
        message: failure.response?.reason ?? failure.error?.message,
      };
    }

    return {
      messageId: result.sent[0]?.device ?? deviceToken,
      provider: 'apns',
    };
  }

  validateRecipient(token: string): boolean {
    // APNs tokens are 64-char hex strings
    return /^[0-9a-fA-F]{64}$/.test(token);
  }

  handleProviderError(error: unknown): AdapterError {
    const apnsError = error as { code?: string; message?: string };

    switch (apnsError.code) {
      case 'BadDeviceToken':
      case 'Unregistered':
      case 'DeviceTokenNotForTopic':
        return {
          code: AdapterErrorCode.INVALID_TOKEN,
          message: `APNs invalid token: ${apnsError.code}`,
          retryable: false,
          suppressRecipient: true,
        };
      case 'TooManyRequests':
        return {
          code: AdapterErrorCode.RATE_LIMITED,
          message: 'APNs rate limit',
          retryable: true,
        };
      case 'InternalServerError':
      case 'ServiceUnavailable':
        return {
          code: AdapterErrorCode.PROVIDER_ERROR,
          message: 'APNs server error',
          retryable: true,
        };
      default:
        return {
          code: AdapterErrorCode.PROVIDER_ERROR,
          message: apnsError.message ?? 'APNs error',
          retryable: false,
        };
    }
  }
}
```

## In-App Notifications

In-app notifications appear in the app's notification center. They're delivered via WebSocket for real-time and stored in the database for the inbox.

```typescript
import { Server as SocketIOServer } from 'socket.io';

export interface RenderedInApp {
  title: string;
  body: string;
  iconUrl?: string;
  actionUrl?: string;   // Deep link or URL
  actionLabel?: string;
  category: string;
  metadata?: Record<string, string>;
}

export class InAppNotificationAdapter implements NotificationAdapter<RenderedInApp> {
  readonly name = 'inapp';

  constructor(
    private readonly io: SocketIOServer,
    private readonly inAppRepo: InAppNotificationRepository
  ) {}

  async send(userId: string, content: RenderedInApp): Promise<SendResult> {
    // Persist first — WebSocket delivery is best-effort
    const notification = await this.inAppRepo.create({
      userId,
      ...content,
      read: false,
    });

    // Deliver via WebSocket if user is connected
    // Use room = userId to target all user's sessions
    this.io.to(`user:${userId}`).emit('notification', {
      id: notification.id,
      title: content.title,
      body: content.body,
      iconUrl: content.iconUrl,
      actionUrl: content.actionUrl,
      actionLabel: content.actionLabel,
      category: content.category,
      createdAt: notification.createdAt.toISOString(),
    });

    return {
      messageId: notification.id,
      provider: 'inapp',
      metadata: { persisted: 'true' },
    };
  }

  validateRecipient(userId: string): boolean {
    // UUID format
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);
  }

  handleProviderError(error: unknown): AdapterError {
    return {
      code: AdapterErrorCode.PROVIDER_ERROR,
      message: (error as Error).message,
      retryable: true,
    };
  }
}
```

## Slack Adapter

For internal team notifications (ops alerts, sales notifications, system health):

```typescript
import { WebClient } from '@slack/web-api';

export interface RenderedSlack {
  text: string;
  blocks?: unknown[];   // Slack Block Kit blocks
  channel: string;      // Channel ID or #channel-name
  username?: string;
  iconEmoji?: string;
  iconUrl?: string;
  threadTs?: string;    // Reply in thread
  unfurlLinks?: boolean;
}

export class SlackAdapter implements NotificationAdapter<RenderedSlack> {
  readonly name = 'slack';
  private readonly client: WebClient;

  constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  async send(channel: string, content: RenderedSlack): Promise<SendResult> {
    const result = await this.client.chat.postMessage({
      channel: content.channel || channel,
      text: content.text,
      blocks: content.blocks as any[],
      username: content.username,
      icon_emoji: content.iconEmoji,
      icon_url: content.iconUrl,
      thread_ts: content.threadTs,
      unfurl_links: content.unfurlLinks ?? false,
      unfurl_media: false,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return {
      messageId: result.ts!,
      provider: 'slack',
      metadata: {
        channel: result.channel!,
        ts: result.ts!,
      },
    };
  }

  validateRecipient(channel: string): boolean {
    // Channel ID (C...) or channel name (#...)
    return channel.startsWith('C') || channel.startsWith('#') || channel.startsWith('U');
  }

  handleProviderError(error: unknown): AdapterError {
    const slackError = error as { data?: { error?: string } };
    const code = slackError.data?.error;

    if (code === 'channel_not_found' || code === 'not_in_channel') {
      return {
        code: AdapterErrorCode.INVALID_RECIPIENT,
        message: `Slack channel not found: ${code}`,
        retryable: false,
      };
    }

    if (code === 'ratelimited') {
      return {
        code: AdapterErrorCode.RATE_LIMITED,
        message: 'Slack rate limited',
        retryable: true,
      };
    }

    return {
      code: AdapterErrorCode.PROVIDER_ERROR,
      message: code ?? 'Slack error',
      retryable: false,
    };
  }
}
```

## Stale Token Cleanup

Push tokens become invalid when users uninstall apps. Cleanup stale tokens automatically:

```typescript
export class DeviceTokenCleanupService {
  constructor(
    private readonly tokenRepo: DeviceTokenRepository,
    private readonly fcm: FCMPushAdapter,
    private readonly apns: APNsPushAdapter
  ) {}

  async cleanupInvalidTokens(
    failedSends: Array<{ token: string; platform: 'ios' | 'android'; error: AdapterError }>
  ): Promise<void> {
    const tokensToDeactivate = failedSends
      .filter(f => f.error.suppressRecipient)
      .map(f => f.token);

    if (tokensToDeactivate.length === 0) return;

    await this.tokenRepo.deactivateMany(tokensToDeactivate);

    logger.info({
      msg: 'Deactivated invalid device tokens',
      count: tokensToDeactivate.length,
    });
  }

  // Periodic cleanup: dry run against FCM to find stale tokens
  async auditTokens(limit = 1000): Promise<{ active: number; invalid: number }> {
    const tokens = await this.tokenRepo.getOldestActiveAndroid(limit);
    if (tokens.length === 0) return { active: 0, invalid: 0 };

    // Send a dry-run check (FCM validateOnly mode)
    let invalidCount = 0;

    for (const token of tokens) {
      try {
        // Attempt to validate — FCM returns error for invalid tokens
        const message: any = {
          token: token.token,
          data: { validate: 'true' },
        };
        await (this.fcm as any).messaging.send({ ...message, android: { directBootOk: true } }, true);
        // true = validateOnly mode
      } catch (error) {
        const adapterError = this.fcm.handleProviderError(error);
        if (adapterError.suppressRecipient) {
          await this.tokenRepo.deactivate(token.id);
          invalidCount++;
        }
      }
    }

    return { active: tokens.length - invalidCount, invalid: invalidCount };
  }
}
```

::: info War Story
We had a user who received 847 push notifications in a 2-hour window. Investigation: a bug in the retry logic. A push send was failing with a transient error. The retry logic was treating "FCM connection error" as a retriable error. Correct. But the retry delay was set to 0ms instead of exponential backoff. The job retried 847 times in 2 hours before hitting the max retry limit.

The user received a notification for each retry attempt. FCM had already delivered the first one successfully, but we weren't checking for success responses before retrying.

Two bugs: (1) retry delay not configured, (2) not checking delivery status before retrying. The fix: always confirm delivery success before considering a retry, and enforce minimum exponential backoff on all retries.
:::
