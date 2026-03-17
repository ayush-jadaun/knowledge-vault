---
title: Authentication
description: Deep dive into authentication mechanisms — JWT internals, OAuth 2.0 and OIDC flows, session management, multi-factor authentication, passwordless login, API key design, and biometric authentication with production TypeScript implementations.
tags:
  - security
  - authentication
  - jwt
  - oauth
  - oidc
  - mfa
  - sessions
  - passwordless
  - api-keys
  - webauthn
difficulty: intermediate
prerequisites:
  - Basic understanding of HTTP and cookies
  - Familiarity with cryptographic primitives (hashing, signing)
  - TypeScript fundamentals
lastReviewed: "2026-03-17"
---

# Authentication

Authentication answers the question: **who are you?** It is the process of verifying that a user, device, or system is who it claims to be. Authorization (a separate concern) answers what they are allowed to do. Getting authentication wrong means every authorization check downstream is meaningless — you are enforcing permissions against an identity that might be forged.

## The Authentication Landscape

Modern applications rarely rely on a single authentication mechanism. A typical production system combines several layers:

```mermaid
graph TB
    subgraph "User-Facing"
        A[Password + MFA] --> AUTH[Auth Service]
        B[Passwordless / Passkeys] --> AUTH
        C[Social Login / OIDC] --> AUTH
        D[Biometric / WebAuthn] --> AUTH
    end

    subgraph "Service-to-Service"
        E[mTLS Certificates] --> GW[API Gateway]
        F[API Keys] --> GW
        G[OAuth Client Credentials] --> GW
    end

    AUTH --> T[Token Issuance]
    GW --> T
    T --> S[Session / JWT]

    style AUTH fill:#2563eb,color:#fff
    style GW fill:#7c3aed,color:#fff
    style T fill:#dc2626,color:#fff
    style S fill:#16a34a,color:#fff
```

## Core Principles

::: tip Principle 1 — Defense in Depth
Never rely on a single authentication factor. Combine something the user knows (password), something they have (phone, security key), and something they are (biometric). Each additional factor exponentially increases the difficulty for an attacker.
:::

::: tip Principle 2 — Fail Closed
If the authentication system is unavailable, deny access. Never fall back to a weaker mechanism or bypass authentication entirely because the identity provider is down.
:::

::: tip Principle 3 — Minimize Token Lifetime
Short-lived tokens limit the window of exploitation. A stolen JWT that expires in 15 minutes is far less dangerous than one that is valid for 30 days.
:::

::: warning Principle 4 — Never Roll Your Own Crypto
Use battle-tested libraries for token signing, password hashing, and key derivation. Custom implementations almost always contain subtle flaws that attackers can exploit.
:::

## Authentication Factors

| Factor | Category | Examples | Strength |
|--------|----------|----------|----------|
| Password | Knowledge | Passphrase, PIN | Low (phishable) |
| TOTP Code | Possession | Authenticator app | Medium (phishable) |
| Hardware Key | Possession | YubiKey, Titan | High (phishing-resistant) |
| Passkey | Possession + Inherence | FIDO2 credential | High (phishing-resistant) |
| Biometric | Inherence | Fingerprint, Face ID | Medium (not revocable) |
| Magic Link | Possession | Email with token | Medium (depends on email security) |
| Client Certificate | Possession | mTLS cert | High (mutual verification) |

## Attack Surface Overview

```mermaid
graph LR
    subgraph "Credential Attacks"
        A1[Brute Force]
        A2[Credential Stuffing]
        A3[Password Spraying]
        A4[Phishing]
    end

    subgraph "Token Attacks"
        B1[Token Theft / XSS]
        B2[Session Hijacking]
        B3[JWT Algorithm Confusion]
        B4[Replay Attacks]
    end

    subgraph "Protocol Attacks"
        C1[OAuth Redirect Manipulation]
        C2[CSRF on Login]
        C3[Session Fixation]
        C4[Token Substitution]
    end

    A1 --> D[Compromised Account]
    A2 --> D
    A3 --> D
    A4 --> D
    B1 --> D
    B2 --> D
    B3 --> D
    B4 --> D
    C1 --> D
    C2 --> D
    C3 --> D
    C4 --> D

    style D fill:#dc2626,color:#fff
```

## Section Contents

| Topic | What You Will Learn |
|-------|-------------------|
| [JWT Deep Dive](./jwt-deep-dive.md) | JWT structure, signing algorithms, token lifecycle, refresh rotation, revocation strategies, and claims design with `jose` |
| [OAuth 2.0 & OIDC](./oauth2-oidc.md) | Authorization Code + PKCE, Client Credentials, Device Code flows, OIDC ID tokens, and sequence diagrams |
| [Session Management](./session-management.md) | Server-side sessions with Redis, secure cookie configuration, session fixation prevention |
| [MFA Implementation](./mfa-implementation.md) | TOTP (RFC 6238), WebAuthn/FIDO2, backup codes, and production TypeScript implementations |
| [Passwordless Authentication](./passwordless.md) | Magic links, passkeys, email OTP, and the UX-security tradeoff |
| [API Key Design](./api-key-design.md) | Key generation, hashing, rotation, scoping, and rate limiting per key |
| [Biometric Authentication](./biometric-auth.md) | WebAuthn API, FIDO2 protocol, platform authenticators, and attestation |

## Choosing the Right Mechanism

```mermaid
flowchart TD
    START[What are you authenticating?] --> Q1{Human or Machine?}

    Q1 -->|Human - Browser| Q2{Need SSO?}
    Q1 -->|Human - Mobile| Q3{Platform capabilities?}
    Q1 -->|Machine - Service| Q4{Internal or External?}

    Q2 -->|Yes| OIDC[OAuth 2.0 + OIDC]
    Q2 -->|No| Q5{Security priority?}

    Q5 -->|Maximum| PASSKEY[Passkeys / WebAuthn]
    Q5 -->|Balanced| PWD_MFA[Password + MFA]
    Q5 -->|User convenience| MAGIC[Magic Links]

    Q3 -->|Biometric available| BIO[Biometric + Passkey]
    Q3 -->|Basic| PWD_MFA

    Q4 -->|Internal| MTLS[mTLS / SPIFFE]
    Q4 -->|External 3rd party| APIKEY[API Keys]
    Q4 -->|External trusted| CC[Client Credentials]

    style START fill:#2563eb,color:#fff
    style OIDC fill:#16a34a,color:#fff
    style PASSKEY fill:#16a34a,color:#fff
    style PWD_MFA fill:#16a34a,color:#fff
    style MAGIC fill:#16a34a,color:#fff
    style BIO fill:#16a34a,color:#fff
    style MTLS fill:#16a34a,color:#fff
    style APIKEY fill:#16a34a,color:#fff
    style CC fill:#16a34a,color:#fff
```

::: danger Common Mistakes
- Storing passwords in plaintext or with weak hashing (MD5, SHA-1)
- Using JWTs with `"alg": "none"` or accepting unsigned tokens
- Not implementing rate limiting on login endpoints
- Trusting the `redirect_uri` parameter without validation in OAuth flows
- Storing session tokens in localStorage (vulnerable to XSS)
- Not rotating refresh tokens on use
- Hardcoding API keys in client-side code
:::
