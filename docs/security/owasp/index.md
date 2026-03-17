---
title: OWASP Top 10 — Overview & Threat Modeling
description: Comprehensive introduction to the OWASP Top 10, risk-rating methodology, and practical threat modeling for modern web applications
tags: [security, owasp, threat-modeling, web-security, risk-assessment]
difficulty: intermediate
prerequisites:
  - Basic understanding of HTTP and web architecture
  - Familiarity with server-side programming concepts
lastReviewed: "2026-03-17"
---

# OWASP Top 10 — Overview & Threat Modeling

## What Is OWASP?

The Open Worldwide Application Security Project (OWASP) is a nonprofit foundation that works to improve the security of software. Founded in 2001, OWASP produces freely available articles, methodologies, documentation, tools, and technologies in the field of web application security. OWASP operates as an open community where anyone can participate, and all materials are available under free and open software licenses.

## The OWASP Top 10

The OWASP Top 10 is a standard awareness document for developers and security practitioners. It represents a broad consensus about the most critical security risks to web applications. The list is updated periodically based on data contributed by security firms, bug bounty programs, and community surveys.

### 2021 Edition Categories

| Rank | Category | CWEs Mapped | Incidence Rate |
|------|----------|-------------|----------------|
| A01 | Broken Access Control | 34 | 3.81% |
| A02 | Cryptographic Failures | 29 | 4.49% |
| A03 | Injection | 33 | 3.37% |
| A04 | Insecure Design | 40 | 3.00% |
| A05 | Security Misconfiguration | 20 | 4.51% |
| A06 | Vulnerable and Outdated Components | 3 | 8.77% |
| A07 | Identification and Authentication Failures | 22 | 2.55% |
| A08 | Software and Data Integrity Failures | 10 | 2.05% |
| A09 | Security Logging and Monitoring Failures | 4 | 6.51% |
| A10 | Server-Side Request Forgery (SSRF) | 1 | 2.72% |

## Risk Rating Methodology

OWASP uses a risk-rating methodology that considers both the likelihood of an attack and its technical and business impact. Understanding this methodology is essential for prioritizing remediation efforts.

### Risk = Likelihood x Impact

Each category is scored across four factors:

**Likelihood Factors:**
- **Exploitability** — How easy is it for an attacker to exploit this vulnerability? (1 = difficult, 3 = easy)
- **Prevalence** — How common is this vulnerability in the wild? (1 = uncommon, 3 = widespread)
- **Detectability** — How easy is it to discover this vulnerability? (1 = difficult, 3 = easy)

**Impact Factors:**
- **Technical Impact** — What is the impact on the application? (1 = minor, 3 = severe)
- **Business Impact** — Organization-specific; depends on data sensitivity, regulatory exposure, reputational risk

### Calculating a Risk Score

```
Likelihood = (Exploitability + Prevalence + Detectability) / 3
Impact = (Technical Impact + Business Impact) / 2
Risk = Likelihood × Impact
```

Scores range from 0 to 9. Categorize the result:

| Score | Severity |
|-------|----------|
| 0–3 | Low |
| 3–6 | Medium |
| 6–9 | High / Critical |

## Threat Modeling Introduction

Threat modeling is a structured process for identifying security threats, understanding their implications, and determining countermeasures. It should be done early in the design phase and revisited as the system evolves.

### Why Threat Model?

1. **Find security issues before code is written** — Far cheaper to fix in design than in production
2. **Build shared understanding** — The team develops a common mental model of the system's attack surface
3. **Prioritize security work** — Focus on the highest-risk areas first
4. **Satisfy compliance requirements** — Many standards (PCI DSS, SOC 2, ISO 27001) require documented risk assessments

### The STRIDE Framework

STRIDE is a mnemonic for six categories of threats. For each component of your system, ask whether any of these threats apply.

| Threat | Security Property Violated | Example |
|--------|---------------------------|---------|
| **S**poofing | Authentication | Attacker logs in as another user |
| **T**ampering | Integrity | Attacker modifies data in transit |
| **R**epudiation | Non-repudiation | User denies performing an action |
| **I**nformation Disclosure | Confidentiality | Database contents leaked |
| **D**enial of Service | Availability | Service overwhelmed by requests |
| **E**levation of Privilege | Authorization | Regular user gains admin access |

### Threat Modeling Process

**Step 1: Decompose the Application**

Create a data flow diagram (DFD) showing:
- External entities (users, third-party services)
- Processes (application components)
- Data stores (databases, file systems, caches)
- Data flows (HTTP requests, database queries, API calls)
- Trust boundaries (where privilege levels change)

**Step 2: Identify Threats**

For each element in the DFD, apply STRIDE:

```
For each data flow crossing a trust boundary:
  Can the sender be spoofed?
  Can the data be tampered with?
  Can the action be repudiated?
  Can the data be disclosed to unauthorized parties?
  Can the flow be disrupted (DoS)?
  Can privilege be escalated through this flow?
```

**Step 3: Rate the Threats**

Use the DREAD model or OWASP risk rating:

| Factor | Question |
|--------|----------|
| **D**amage Potential | How much damage if exploited? |
| **R**eproducibility | How easy to reproduce? |
| **E**xploitability | How easy to exploit? |
| **A**ffected Users | How many users affected? |
| **D**iscoverability | How easy to discover? |

**Step 4: Determine Countermeasures**

For each high-risk threat, select one or more mitigations:
- **Mitigate** — Implement a control to reduce the risk
- **Eliminate** — Remove the feature or component
- **Transfer** — Shift the risk (insurance, third-party service)
- **Accept** — Document the risk and accept it (low-risk items only)

### Practical Threat Modeling Example

Consider a REST API that handles user authentication and file uploads:

```
Trust Boundary
┌─────────────────────────────────┐
│  Internet (Untrusted)           │
│  ┌──────────┐                   │
│  │  Browser  │                  │
│  └─────┬────┘                   │
│        │ HTTPS                  │
├────────┼────────────────────────┤
│  DMZ   │                       │
│  ┌─────▼────┐  ┌────────────┐  │
│  │  Nginx   ├──►  Express   │  │
│  │  Proxy   │  │  API       │  │
│  └──────────┘  └──┬───┬─────┘  │
├───────────────────┼───┼────────┤
│  Internal Network │   │        │
│  ┌────────────────▼┐ ┌▼──────┐ │
│  │  PostgreSQL     │ │ Redis │ │
│  └─────────────────┘ └───────┘ │
└─────────────────────────────────┘
```

Threats identified at the Browser → Nginx boundary:
- **Spoofing**: Attacker replays a stolen JWT
- **Tampering**: Man-in-the-middle modifies request body
- **Information Disclosure**: Credentials sent over unencrypted connection

Countermeasures:
- Short-lived JWTs with refresh token rotation (Spoofing)
- TLS 1.3 with HSTS (Tampering, Information Disclosure)
- Request signing for sensitive operations (Tampering)

## How to Use This Section

Each subsequent page covers one OWASP Top 10 category in depth. For every vulnerability covered, you will find:

1. **Description** — What the vulnerability is and why it matters
2. **Vulnerable Code** — A realistic example of insecure code
3. **Exploitation** — How an attacker would exploit it
4. **Secure Code** — The corrected implementation with explanation
5. **Testing Methodology** — How to detect and verify the vulnerability
6. **References** — Links to CWEs, standards, and further reading

All code examples use TypeScript with Express.js unless otherwise noted.
