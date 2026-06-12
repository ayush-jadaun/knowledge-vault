---
title: "API Error Handling"
description: "HTTP status codes used correctly, structured error response bodies, RFC 7807 Problem Details, validation errors, and how to design error handling that's actually useful to API consumers."
tags: [api-design, errors, http-status-codes, problem-details, validation]
difficulty: "beginner"
prerequisites: [system-design/api-design/index]
lastReviewed: "2026-06-12"
---

# API Error Handling

Bad error handling is one of the most common API design failures. The symptom: API consumers paste cryptic `{"error": "internal server error"}` responses into Stack Overflow trying to understand what went wrong. Good error handling tells clients exactly what failed, why, and what to do about it.

---

## HTTP Status Codes — Used Correctly

HTTP status codes communicate the outcome class. The response body explains the specific error. Use standard codes; don't invent your own semantic system on top.

### 2xx Success

| Code | Name | When to Use |
|------|------|------------|
| 200 | OK | Generic success for GET, PUT, PATCH |
| 201 | Created | POST that created a resource — include `Location` header with new resource URL |
| 202 | Accepted | Async operation accepted but not yet complete |
| 204 | No Content | Successful operation with no response body (DELETE, some PUT) |

### 3xx Redirect

| Code | Name | When to Use |
|------|------|------------|
| 301 | Moved Permanently | Resource URL has permanently changed |
| 302 | Found | Temporary redirect |
| 304 | Not Modified | Conditional GET, resource hasn't changed (use with ETags) |

### 4xx Client Errors

The client did something wrong. Retrying the same request won't help.

| Code | Name | When to Use |
|------|------|------------|
| 400 | Bad Request | Malformed JSON, missing required field, invalid value |
| 401 | Unauthorized | Not authenticated — credentials required |
| 403 | Forbidden | Authenticated but not authorized for this action |
| 404 | Not Found | Resource doesn't exist |
| 405 | Method Not Allowed | Correct URL, wrong HTTP method |
| 409 | Conflict | State conflict — creating a resource that already exists, optimistic lock conflict |
| 410 | Gone | Resource existed but has been permanently deleted |
| 422 | Unprocessable Entity | Syntactically valid but semantically invalid (business rule violation) |
| 429 | Too Many Requests | Rate limit exceeded — include `Retry-After` header |

**401 vs 403:** 401 = "I don't know who you are." 403 = "I know who you are, but you can't do this." If a user doesn't have access to resource `/admin/settings`, 403 is correct. If they're not logged in at all, 401 is correct.

**404 vs 403 for unauthorized resources:** This is a judgment call. Returning 404 for a resource a user isn't authorized to see prevents enumeration attacks — the user can't distinguish "doesn't exist" from "exists but you can't access it." For most APIs, 403 is correct and more helpful. For privacy-sensitive resources (private profiles), 404 is better.

### 5xx Server Errors

Something went wrong on your side. Clients should typically retry with backoff.

| Code | Name | When to Use |
|------|------|------------|
| 500 | Internal Server Error | Unhandled exception, something unexpected failed |
| 502 | Bad Gateway | Upstream service returned invalid response |
| 503 | Service Unavailable | Overloaded or in maintenance — include `Retry-After` |
| 504 | Gateway Timeout | Upstream service timed out |

---

## Error Response Body Structure

The status code tells the client the outcome class. The response body tells them what specifically went wrong and how to fix it.

**Minimum viable error response:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "must be a valid email address"
      }
    ]
  }
}
```

**What makes errors useful:**
- **Machine-readable error code** (`code: "RATE_LIMIT_EXCEEDED"`) — client code can `switch` on this
- **Human-readable message** — for logging and display
- **Field-level detail** for validation errors — tell them which field failed and why
- **Trace/request ID** — so both client and server logs can be correlated

---

## RFC 7807: Problem Details

RFC 7807 is an IETF standard for error response bodies. It's worth following — it's widely understood and has good tooling support.

```json
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json

{
  "type": "https://docs.example.com/errors/insufficient-funds",
  "title": "Insufficient Funds",
  "status": 422,
  "detail": "Your account balance of $4.99 is insufficient for this $19.99 charge.",
  "instance": "/orders/12345",
  "balance": 4.99,
  "charge": 19.99
}
```

**Fields:**
- `type` (URI) — unique identifier for the error type; linking to documentation is ideal
- `title` — short human-readable summary of the problem type (same for all instances of this type)
- `status` — HTTP status code (redundant but useful)
- `detail` — human-readable explanation specific to this occurrence
- `instance` — URI identifying this specific occurrence (for tracing)
- Additional properties — extend freely with machine-readable context

**Content-Type:** `application/problem+json` (not `application/json`)

---

## Validation Errors

Validation errors deserve special treatment — the client needs to know exactly which fields failed and why.

```json
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "type": "https://docs.example.com/errors/validation-error",
  "title": "Validation Error",
  "status": 400,
  "detail": "One or more fields failed validation.",
  "errors": [
    {
      "field": "email",
      "code": "INVALID_FORMAT",
      "message": "must be a valid email address",
      "value": "not-an-email"
    },
    {
      "field": "age",
      "code": "OUT_OF_RANGE",
      "message": "must be between 18 and 120",
      "minimum": 18,
      "maximum": 120,
      "value": 15
    }
  ]
}
```

**FastAPI (Python) — automatic validation errors:**
```python
from fastapi import FastAPI
from pydantic import BaseModel, validator

class CreateUserRequest(BaseModel):
    email: str
    age: int
    
    @validator('email')
    def email_must_be_valid(cls, v):
        if '@' not in v:
            raise ValueError('must be a valid email address')
        return v

# FastAPI automatically returns 422 with field-level errors
# when Pydantic validation fails
```

**Express.js (Node.js) — with express-validator:**
```javascript
const { body, validationResult } = require('express-validator');

app.post('/users', [
    body('email').isEmail().withMessage('must be a valid email'),
    body('age').isInt({ min: 18, max: 120 }).withMessage('must be between 18 and 120'),
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            type: 'https://docs.example.com/errors/validation-error',
            title: 'Validation Error',
            status: 400,
            errors: errors.array().map(e => ({
                field: e.param,
                message: e.msg,
                value: e.value
            }))
        });
    }
    // ... create user
});
```

---

## Rate Limiting Error Headers

When returning 429, include headers that tell the client when they can retry:

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1699872000

{
  "type": "https://docs.example.com/errors/rate-limit-exceeded",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "detail": "You have exceeded the limit of 100 requests per minute.",
  "retry_after": 60
}
```

**Include rate limit headers on ALL requests**, not just when exceeding limits — clients can proactively avoid hitting limits:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 47
X-RateLimit-Reset: 1699872000  (Unix timestamp when the window resets)
```

---

## Common Anti-Patterns

**Returning 200 for errors:**
```json
// WRONG
HTTP/1.1 200 OK
{ "success": false, "error": "User not found" }

// RIGHT
HTTP/1.1 404 Not Found
{ "type": "...", "title": "Not Found", "detail": "User 123 does not exist" }
```

**Leaking implementation details:**
```json
// WRONG — reveals internal table name, SQL structure
{
  "error": "ERROR: duplicate key value violates unique constraint \"users_email_key\""
}

// RIGHT
{
  "type": "https://docs.example.com/errors/email-already-exists",
  "title": "Email Already Registered",
  "detail": "An account with this email address already exists."
}
```

**Generic errors for everything:**
```json
// WRONG — what should the client do?
{ "error": "Something went wrong" }

// RIGHT — actionable
{
  "type": "https://docs.example.com/errors/payment-failed",
  "title": "Payment Failed",
  "detail": "Your card was declined. Please try a different payment method.",
  "decline_code": "insufficient_funds"
}
```

---

## Checklist for Error Handling

- [ ] Status codes match semantics (401 vs 403, 422 vs 400, 404 vs 410)
- [ ] Error response has machine-readable error code
- [ ] Validation errors name the specific fields that failed
- [ ] 429 responses include `Retry-After` header
- [ ] 503 responses include `Retry-After` header
- [ ] No internal details leaked (SQL errors, stack traces, internal service names)
- [ ] All errors have a request/trace ID for log correlation
- [ ] `Content-Type: application/problem+json` for error responses (optional but recommended)
