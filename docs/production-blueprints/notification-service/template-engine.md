---
title: "Notification Template Engine"
description: "Handlebars templates, i18n localization, versioning, preview system, and layout inheritance"
tags: [templates, handlebars, i18n, email, localization, versioning]
difficulty: "intermediate"
prerequisites: [notification-service/architecture]
lastReviewed: "2026-03-18"
---

# Notification Template Engine

## Why Templates Need Their Own Service

Hardcoding notification content in application code causes:
- Non-engineers (marketing, product) can't update copy without a deploy
- No audit trail for content changes
- No preview capability before sending to users
- A/B testing requires code changes
- Multi-language support becomes a nightmare
- Brand consistency across channels is impossible

A template engine separates content from delivery logic.

## Template Architecture

```mermaid
graph TB
    subgraph STORAGE[Template Storage]
        S3[(S3: Template files\n.hbs, .txt, .json)]
        DB[(DB: Template metadata\nversion, status, i18n)]
    end

    subgraph ENGINE[Template Engine]
        LOADER[Template Loader]
        CACHE[Template Cache\nRedis LRU]
        RENDERER[Handlebars Renderer]
        VALIDATOR[Schema Validator]
        LOCALIZER[i18n Localizer]
    end

    subgraph CHANNELS[Channel Renderers]
        EMAIL_R[Email Renderer\nHTML + Plain Text]
        SMS_R[SMS Renderer\n160 char segments]
        PUSH_R[Push Renderer\n64 char title limit]
        INAPP_R[In-App Renderer]
    end

    API[Render Request\n{templateId, locale, data}] --> LOADER
    LOADER --> CACHE
    CACHE -->|miss| S3
    S3 --> CACHE
    CACHE --> RENDERER
    RENDERER --> LOCALIZER
    LOCALIZER --> EMAIL_R
    LOCALIZER --> SMS_R
    LOCALIZER --> PUSH_R
    LOCALIZER --> INAPP_R
```

## Template Structure

Templates are stored in S3 with this directory structure:

```
templates/
├── welcome-email/
│   ├── manifest.json           # Metadata, schema, channels
│   ├── v1/
│   │   ├── email.html.hbs      # HTML email template
│   │   ├── email.txt.hbs       # Plain text fallback
│   │   ├── push.json.hbs       # Push notification
│   │   ├── sms.txt.hbs         # SMS content
│   │   └── locales/
│   │       ├── en.json         # English strings
│   │       ├── es.json         # Spanish strings
│   │       ├── fr.json         # French strings
│   │       └── de.json         # German strings
│   └── v2/
│       └── ...
└── payment-failed/
    └── ...
```

### Template Manifest

```json
{
  "id": "welcome-email",
  "name": "Welcome Email",
  "description": "Sent to new users after account creation",
  "category": "product",
  "defaultLocale": "en",
  "supportedLocales": ["en", "es", "fr", "de", "ja"],
  "channels": ["email", "push", "inapp"],
  "currentVersion": "v2",
  "versions": {
    "v1": { "status": "deprecated", "createdAt": "2024-01-01" },
    "v2": { "status": "active", "createdAt": "2025-06-01" }
  },
  "dataSchema": {
    "type": "object",
    "required": ["firstName", "productName"],
    "properties": {
      "firstName":    { "type": "string" },
      "productName":  { "type": "string" },
      "ctaUrl":       { "type": "string", "format": "uri" },
      "trialDays":    { "type": "integer", "minimum": 0 }
    }
  }
}
```

## Template Implementation

```typescript
import Handlebars from 'handlebars';
import Ajv from 'ajv';
import i18next from 'i18next';
import { S3TemplateLoader } from './s3-template-loader';
import { RedisTemplateCache } from './redis-template-cache';

export interface RenderRequest {
  templateId: string;
  version?: string;     // Omit for current version
  locale?: string;      // Omit for default locale
  channel: NotificationChannel;
  data: Record<string, unknown>;
}

export interface RenderResult {
  templateId: string;
  version: string;
  locale: string;
  channel: NotificationChannel;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  pushTitle?: string;
  pushBody?: string;
  smsBody?: string;
  inAppTitle?: string;
  inAppBody?: string;
}

export class TemplateEngine {
  private readonly handlebars: typeof Handlebars;
  private readonly ajv: Ajv;

  constructor(
    private readonly loader: S3TemplateLoader,
    private readonly cache: RedisTemplateCache
  ) {
    this.handlebars = Handlebars.create();
    this.ajv = new Ajv({ allErrors: true });
    this.registerHelpers();
  }

  async render(request: RenderRequest): Promise<RenderResult> {
    // 1. Load manifest and template files
    const manifest = await this.loadManifest(request.templateId);
    const version = request.version ?? manifest.currentVersion;
    const locale = this.resolveLocale(request.locale, manifest.supportedLocales, manifest.defaultLocale);

    // 2. Validate input data against schema
    this.validateData(request.data, manifest.dataSchema, request.templateId);

    // 3. Load locale strings for i18n interpolation
    const strings = await this.loadLocaleStrings(request.templateId, version, locale);

    // 4. Load template files for the requested channel
    const templates = await this.loadTemplates(request.templateId, version, request.channel);

    // 5. Render
    const renderContext = {
      ...request.data,
      t: (key: string, params?: Record<string, unknown>) =>
        this.interpolate(strings[key] ?? key, params),
      locale,
    };

    return this.renderForChannel(request.channel, templates, renderContext, {
      templateId: request.templateId,
      version,
      locale,
      channel: request.channel,
    });
  }

  private async loadManifest(templateId: string): Promise<TemplateManifest> {
    const cacheKey = `manifest:${templateId}`;
    const cached = await this.cache.get<TemplateManifest>(cacheKey);
    if (cached) return cached;

    const manifest = await this.loader.loadManifest(templateId);
    await this.cache.set(cacheKey, manifest, 300);  // 5 minute TTL
    return manifest;
  }

  private validateData(
    data: Record<string, unknown>,
    schema: object,
    templateId: string
  ): void {
    const validate = this.ajv.compile(schema);
    const valid = validate(data);

    if (!valid) {
      const errors = validate.errors
        ?.map(e => `${e.instancePath} ${e.message}`)
        .join(', ');
      throw new Error(`Template data validation failed for ${templateId}: ${errors}`);
    }
  }

  private resolveLocale(
    requested: string | undefined,
    supported: string[],
    defaultLocale: string
  ): string {
    if (!requested) return defaultLocale;

    // Exact match
    if (supported.includes(requested)) return requested;

    // Language-only match (e.g., 'en-GB' → 'en')
    const language = requested.split('-')[0];
    if (supported.includes(language)) return language;

    return defaultLocale;
  }

  private interpolate(
    template: string,
    params?: Record<string, unknown>
  ): string {
    if (!params) return template;
    // Simple interpolation for locale strings (different from Handlebars)
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      String(params[key] ?? `{​{${key}}}`)
    );
  }

  private renderForChannel(
    channel: NotificationChannel,
    templates: ChannelTemplates,
    context: Record<string, unknown>,
    meta: Pick<RenderResult, 'templateId' | 'version' | 'locale' | 'channel'>
  ): RenderResult {
    switch (channel) {
      case 'email':
        return {
          ...meta,
          subject: this.compile(templates.emailSubject!, context),
          htmlBody: this.compile(templates.emailHtml!, context),
          textBody: this.compile(templates.emailText!, context),
        };

      case 'sms': {
        const smsBody = this.compile(templates.smsBody!, context);
        // Validate SMS length (160 chars per segment, 1600 max)
        if (smsBody.length > 1600) {
          throw new Error(`SMS body exceeds 1600 chars: ${smsBody.length}`);
        }
        return { ...meta, smsBody };
      }

      case 'push':
        return {
          ...meta,
          pushTitle: this.compile(templates.pushTitle!, context).substring(0, 64),
          pushBody: this.compile(templates.pushBody!, context).substring(0, 240),
        };

      case 'inapp':
        return {
          ...meta,
          inAppTitle: this.compile(templates.inAppTitle!, context),
          inAppBody: this.compile(templates.inAppBody!, context),
        };

      default:
        throw new Error(`Unsupported channel: ${channel}`);
    }
  }

  private compile(
    template: string,
    context: Record<string, unknown>
  ): string {
    const compiled = this.handlebars.compile(template);
    return compiled(context);
  }

  private registerHelpers(): void {
    // Date formatting helper
    this.handlebars.registerHelper('date', (date: Date | string, format: string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      // Use toLocaleDateString with format options
      if (format === 'short') {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      return d.toISOString().split('T')[0];
    });

    // Currency formatting helper
    this.handlebars.registerHelper('currency', (amountCents: number, currency: string) => {
      const amount = amountCents / 100;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount);
    });

    // Conditional helper
    this.handlebars.registerHelper('ifEquals', function(
      this: unknown,
      arg1: unknown,
      arg2: unknown,
      options: Handlebars.HelperOptions
    ) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    // Plural helper
    this.handlebars.registerHelper('plural', (count: number, singular: string, plural: string) => {
      return count === 1 ? singular : plural;
    });

    // Truncate helper
    this.handlebars.registerHelper('truncate', (str: string, len: number) => {
      if (!str) return '';
      return str.length > len ? str.substring(0, len - 3) + '...' : str;
    });
  }
}
```

## Email Template Example

```handlebars
{​{! templates/payment-failed/v1/email.html.hbs }}
<!DOCTYPE html>
<html lang="{​{locale}}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{​{t "email.subject"}}</title>
  <style>
    /* Inline CSS required for email clients */
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .alert-box { background: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 4px; }
    .cta-button {
      display: inline-block;
      background: #3B82F6;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <p>{​{t "greeting" firstName=firstName}}</p>

    <div class="alert-box">
      <strong>{​{t "alert.title"}}</strong>
      <p>{​{t "alert.body" amount=(currency amountCents currency) planName=planName}}</p>
    </div>

    <p>{​{t "instructions"}}</p>

    <a href="{​{updatePaymentUrl}}" class="cta-button">
      {​{t "cta.updatePayment"}}
    </a>

    {​{#if daysUntilSuspension}}
    <p>
      {​{t "suspension.warning" days=daysUntilSuspension}}
    </p>
    {​{/if}}

    <hr>
    <p style="color: #6B7280; font-size: 12px;">
      {​{t "footer.companyName"}} &mdash;
      <a href="{​{unsubscribeUrl}}">{​{t "footer.unsubscribe"}}</a>
    </p>
  </div>
</body>
</html>
```

```json
// templates/payment-failed/v1/locales/en.json
{
  "email.subject": "Action required: Update your payment method",
  "greeting": "Hi {​{firstName}},",
  "alert.title": "Payment failed",
  "alert.body": "We were unable to charge {​{amount}} for your {​{planName}} subscription.",
  "instructions": "Please update your payment method to continue using the service.",
  "cta.updatePayment": "Update Payment Method",
  "suspension.warning": "Your account will be suspended in {​{days}} days if payment is not received.",
  "footer.companyName": "Acme Corp",
  "footer.unsubscribe": "Unsubscribe"
}
```

## Template Versioning

```typescript
export class TemplateVersionService {
  constructor(
    private readonly s3: S3Client,
    private readonly templateRepo: TemplateRepository
  ) {}

  async publishVersion(params: {
    templateId: string;
    version: string;
    files: Array<{ path: string; content: string }>;
    publishedBy: string;
    changelog?: string;
  }): Promise<void> {
    // Upload files to S3
    for (const file of params.files) {
      await this.s3.send(new PutObjectCommand({
        Bucket: process.env.TEMPLATES_BUCKET,
        Key: `templates/${params.templateId}/${params.version}/${file.path}`,
        Body: file.content,
        ContentType: this.getContentType(file.path),
      }));
    }

    // Update manifest in DB
    await this.templateRepo.addVersion({
      templateId: params.templateId,
      version: params.version,
      status: 'draft',  // Must be promoted to active
      publishedBy: params.publishedBy,
      changelog: params.changelog,
    });
  }

  async promoteVersion(params: {
    templateId: string;
    version: string;
    promotedBy: string;
  }): Promise<void> {
    // Deprecate current active version
    const current = await this.templateRepo.getActiveVersion(params.templateId);
    if (current) {
      await this.templateRepo.updateVersionStatus(
        params.templateId,
        current.version,
        'deprecated'
      );
    }

    // Promote new version
    await this.templateRepo.updateVersionStatus(
      params.templateId,
      params.version,
      'active'
    );

    // Invalidate cache
    await this.cache.invalidate(`manifest:${params.templateId}`);
    await this.cache.invalidatePrefix(`template:${params.templateId}:${params.version}`);

    // Audit log
    await this.templateRepo.logVersionChange({
      templateId: params.templateId,
      fromVersion: current?.version ?? null,
      toVersion: params.version,
      promotedBy: params.promotedBy,
      promotedAt: new Date(),
    });
  }
}
```

## Template Preview API

```typescript
// Preview endpoint for non-engineers to review templates
export const previewRouter = express.Router();

previewRouter.post('/templates/:templateId/preview', async (req, res) => {
  const { templateId } = req.params;
  const { version, locale, channel, data } = req.body;

  try {
    const result = await templateEngine.render({
      templateId,
      version,
      locale: locale ?? 'en',
      channel: channel ?? 'email',
      data: data ?? {},  // Allow preview with example data
    });

    // Return rendered content for browser preview
    if (channel === 'email') {
      res.json({
        subject: result.subject,
        htmlBody: result.htmlBody,
        textBody: result.textBody,
        // Include a safe preview URL
        previewUrl: `/templates/${templateId}/preview-frame?token=${generatePreviewToken(result)}`,
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Safe iframe preview for HTML emails
previewRouter.get('/templates/:templateId/preview-frame', async (req, res) => {
  const { token } = req.query;
  const result = verifyPreviewToken(token as string);

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline'");
  res.send(result.htmlBody);
});
```

## i18n Completeness Checking

```typescript
// CI tool: check all locales have all required keys
export async function auditLocaleCompleteness(templateId: string): Promise<AuditReport> {
  const manifest = await loadManifest(templateId);
  const defaultStrings = await loadLocaleStrings(templateId, manifest.currentVersion, manifest.defaultLocale);
  const defaultKeys = new Set(Object.keys(defaultStrings));

  const report: AuditReport = {
    templateId,
    version: manifest.currentVersion,
    locales: {},
  };

  for (const locale of manifest.supportedLocales) {
    if (locale === manifest.defaultLocale) continue;

    const localeStrings = await loadLocaleStrings(templateId, manifest.currentVersion, locale);
    const localeKeys = new Set(Object.keys(localeStrings));

    const missing = [...defaultKeys].filter(k => !localeKeys.has(k));
    const extra = [...localeKeys].filter(k => !defaultKeys.has(k));

    report.locales[locale] = {
      complete: missing.length === 0,
      missingKeys: missing,
      extraKeys: extra,
    };
  }

  return report;
}
```

## Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| Template render (cache hit) | 1-3ms | Compiled template in Redis |
| Template render (cold) | 50-200ms | S3 load + compilation |
| S3 manifest load | 20-100ms | Network + S3 read |
| Handlebars compile | 1-5ms | Template parsing |
| Schema validation | 0.5-2ms | AJV compiled validator |

Cache compiled templates with TTL of 5-15 minutes. Invalidate on version promotion.

::: tip Template Testing
Always test templates with:
1. All required fields present
2. Missing optional fields (must degrade gracefully)
3. Extreme values: very long names, zero amounts, 100-item lists
4. All supported locales
5. All supported channels
:::
