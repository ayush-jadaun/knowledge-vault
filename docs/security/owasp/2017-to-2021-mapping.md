---
title: "OWASP Top 10: 2017 to 2021 Migration Guide"
description: Detailed mapping of how OWASP Top 10 categories changed between the 2017 and 2021 editions with migration guidance for security programs
tags: [security, owasp, migration, compliance, risk-assessment]
difficulty: intermediate
prerequisites:
  - owasp/index
lastReviewed: "2026-03-17"
---

# OWASP Top 10: 2017 to 2021 Migration Guide

The OWASP Top 10 was significantly restructured between the 2017 and 2021 editions. Three new categories were added, four categories were renamed and scoped differently, and several categories were merged or reorganized. This guide maps every 2017 category to its 2021 counterpart and explains what changed and why.

## Visual Mapping

```
2017 Edition                          2021 Edition
─────────────                         ─────────────

A01: Injection ──────────────────────► A03: Injection
                                       (dropped from #1 to #3)

A02: Broken Authentication ─────────► A07: Identification & Auth Failures
                                       (renamed, dropped to #7)

A03: Sensitive Data Exposure ────────► A02: Cryptographic Failures
                                       (renamed, moved to #2)

A04: XML External Entities ──┐
                              ├──────► A03: Injection (merged)
A07: Cross-Site Scripting ───┘         (XSS and XXE are now part of Injection)

A05: Broken Access Control ─────────► A01: Broken Access Control
                                       (moved from #5 to #1)

A06: Security Misconfiguration ─────► A05: Security Misconfiguration
                                       (now includes XXE)

A08: Insecure Deserialization ──────► A08: Software & Data Integrity Failures
                                       (expanded scope)

A09: Using Components with           A06: Vulnerable & Outdated Components
     Known Vulnerabilities ──────────► (renamed)

A10: Insufficient Logging &          A09: Security Logging & Monitoring
     Monitoring ─────────────────────► Failures (renamed)

NEW ─────────────────────────────────► A04: Insecure Design
NEW ─────────────────────────────────► A10: Server-Side Request Forgery
```

## Detailed Category Changes

### A01:2017 Injection → A03:2021 Injection

**What changed:**
- Dropped from position 1 to position 3 based on updated data
- XSS (previously A07:2017) was merged into this category
- XXE (previously A04:2017) was partially merged into this category
- 33 CWEs are now mapped to this category

**Why:**
The prevalence of injection attacks has decreased due to wider adoption of parameterized queries, ORMs, and modern frameworks that include built-in input validation. However, injection remains critically important and continues to be a major source of vulnerabilities.

**Migration action:**
- If your security program tracked injection and XSS separately, consolidate them under "Injection"
- Update scanning rules to include NoSQL injection and template injection alongside traditional SQL injection
- Ensure XSS testing is part of your injection testing methodology

### A02:2017 Broken Authentication → A07:2021 Identification and Authentication Failures

**What changed:**
- Renamed from "Broken Authentication" to "Identification and Authentication Failures"
- Dropped from position 2 to position 7
- Scope expanded to include identification failures, not just authentication
- 22 CWEs mapped

**Why:**
The category dropped in ranking because standardized frameworks for authentication have become more common. The availability of libraries like Passport.js, Auth0, Firebase Auth, and Cognito means fewer applications implement authentication from scratch. However, misconfiguration of these tools remains common.

**Migration action:**
- Update terminology in your security documentation
- Add identification-related checks (user enumeration, registration flaws)
- Review use of authentication frameworks for misconfigurations
- Test for credential stuffing, not just brute force

### A03:2017 Sensitive Data Exposure → A02:2021 Cryptographic Failures

**What changed:**
- Renamed from "Sensitive Data Exposure" to "Cryptographic Failures"
- Moved from position 3 to position 2
- Focus shifted from the symptom (data exposure) to the root cause (cryptographic failures)
- 29 CWEs mapped

**Why:**
The name change reflects that the root cause of sensitive data exposure is usually a cryptographic failure — using weak algorithms, failing to encrypt data, hard-coded keys, or missing encryption in transit. By focusing on the root cause, the category provides more actionable guidance.

**Migration action:**
- Update your vulnerability taxonomy to use the new name
- Shift testing focus from "is data exposed?" to "are cryptographic controls correct?"
- Add checks for: weak algorithms, missing encryption in transit, insecure random number generation, hard-coded secrets, improper key management
- Review TLS configuration, certificate management, and HSTS deployment

### A04:2017 XML External Entities → Merged into A05:2021 Security Misconfiguration

**What changed:**
- XXE is no longer a standalone category
- It is now considered a type of security misconfiguration (insecure XML parser configuration)
- Some XXE CWEs also map to A03:2021 Injection (for the injection aspects)

**Why:**
As applications move away from XML toward JSON, XXE has become less prevalent. Additionally, most XXE vulnerabilities result from misconfigured XML parsers (a misconfiguration issue) rather than a fundamental design flaw.

**Migration action:**
- Move XXE test cases under "Security Misconfiguration"
- Continue testing for XXE in applications that process XML
- Add checks for other parser misconfigurations (YAML, templating engines)

### A05:2017 Broken Access Control → A01:2021 Broken Access Control

**What changed:**
- Moved from position 5 to position 1 (the most critical category)
- 34 CWEs mapped — the most of any category
- Highest incidence rate in the contributing dataset

**Why:**
Broken access control has the most occurrences in real-world applications. Unlike injection (where frameworks provide built-in protection), access control is still largely implemented manually by developers. Automated testing tools have limited ability to detect access control flaws, making human review essential.

**Migration action:**
- Elevate the priority of access control testing
- Implement automated access control testing (multi-user test scripts)
- Add IDOR testing to all API endpoints
- Review authorization checks for completeness (are ALL endpoints protected?)
- Test for horizontal and vertical privilege escalation

### A06:2017 Security Misconfiguration → A05:2021 Security Misconfiguration

**What changed:**
- Dropped from position 6 to position 5
- Now includes XXE (formerly A04:2017)
- 20 CWEs mapped
- Highest incidence rate among all categories (4.51%)

**Why:**
The scope expanded to include XXE and other parser misconfigurations. The high incidence rate reflects the complexity of modern application stacks (cloud, containers, microservices, CDN, proxies) — more components means more opportunities for misconfiguration.

**Migration action:**
- Add XXE to your misconfiguration testing checklist
- Expand configuration reviews to include cloud services (S3 bucket policies, IAM roles, security groups)
- Implement infrastructure-as-code scanning (Checkov, tfsec, cfn-nag)
- Automate security header validation

### A07:2017 Cross-Site Scripting → Merged into A03:2021 Injection

**What changed:**
- XSS is no longer a standalone category
- It is now part of the broader "Injection" category
- All three XSS types (Reflected, Stored, DOM-based) remain important

**Why:**
XSS is fundamentally an injection attack — injecting malicious scripts into web pages. Grouping it with other injection types creates a more cohesive category and encourages developers to think about the root cause (mixing code and data) rather than the specific injection context.

**Migration action:**
- Move XSS test cases under "Injection"
- Continue testing for all three XSS types
- Add Content Security Policy validation to your testing
- Consider DOM-based XSS as part of the "Insecure Design" category as well

### A08:2017 Insecure Deserialization → A08:2021 Software and Data Integrity Failures

**What changed:**
- Expanded from "Insecure Deserialization" to include all integrity failures
- Now covers CI/CD pipeline integrity, unsigned updates, and supply chain attacks
- 10 CWEs mapped

**Why:**
Insecure deserialization is just one type of integrity failure. The expanded category recognizes that modern software depends on complex supply chains (npm packages, CI/CD pipelines, auto-updates) that all require integrity verification. Supply chain attacks (SolarWinds, Codecov, ua-parser-js) have demonstrated the critical importance of this broader category.

**Migration action:**
- Keep insecure deserialization testing
- Add supply chain security assessments (dependency scanning, SBOM)
- Review CI/CD pipeline security (secret management, branch protection)
- Implement Subresource Integrity for third-party resources
- Add code signing and artifact verification to your release process
- Review auto-update mechanisms for integrity verification

### A09:2017 Using Components with Known Vulnerabilities → A06:2021 Vulnerable and Outdated Components

**What changed:**
- Renamed to include "Outdated" — acknowledging that outdated components are a risk even without known CVEs
- Moved from position 9 to position 6
- Only 3 CWEs mapped, but highest weighted incidence rate (8.77%)

**Why:**
The widespread adoption of open-source components and the increasing frequency of supply chain attacks made this category more critical. The name change emphasizes that keeping components updated is important even when no specific vulnerability is known — outdated components are more likely to have undiscovered vulnerabilities.

**Migration action:**
- Update terminology in your security program
- Track component age and update frequency, not just known CVEs
- Implement automated dependency updates (Dependabot, Renovate)
- Add SBOM generation to your build process
- Implement supply chain security controls (lock files, npm audit, Snyk)

### A10:2017 Insufficient Logging & Monitoring → A09:2021 Security Logging and Monitoring Failures

**What changed:**
- Moved from position 10 to position 9
- Renamed to include "Security" — emphasizing security-specific logging requirements
- 4 CWEs mapped
- Second-highest incidence rate (6.51%)

**Why:**
The high incidence rate reflects that most organizations still lack adequate security logging. The average breach detection time remains over 200 days, indicating that monitoring capabilities are insufficient across the industry.

**Migration action:**
- Review security logging completeness against the OWASP Logging Cheat Sheet
- Implement structured logging with correlation IDs
- Set up SIEM integration and alert rules for security events
- Ensure audit trails meet compliance requirements (PCI DSS, HIPAA, SOC 2)
- Test that logging captures all authentication, authorization, and data access events

### NEW: A04:2021 Insecure Design

**What is it:**
A new category focusing on design and architectural flaws — risks that cannot be fixed by perfect implementation because the security controls were never designed.

**Why it was added:**
The security community recognized that many vulnerabilities stem from missing security controls rather than implementation bugs. A missing rate limiter, a lack of abuse case analysis, or an absence of fraud detection are design problems, not coding problems. This category encourages organizations to adopt threat modeling and secure design practices.

**Migration action:**
- Integrate threat modeling into the design phase
- Develop abuse cases alongside use cases
- Adopt the OWASP Application Security Verification Standard (ASVS) for security requirements
- Train development teams on secure design patterns
- Establish security architecture review processes

### NEW: A10:2021 Server-Side Request Forgery (SSRF)

**What is it:**
A new category for SSRF vulnerabilities, where an attacker can induce the server to make requests to arbitrary destinations.

**Why it was added:**
SSRF was added based on community survey data (it ranked #1 in the community survey). The growth of cloud services with metadata endpoints (169.254.169.254) has made SSRF significantly more dangerous. A successful SSRF attack can lead to cloud credential theft, internal service access, and full infrastructure compromise.

**Migration action:**
- Add SSRF testing to your security testing methodology
- Implement URL validation for all server-side HTTP requests
- Block access to cloud metadata endpoints from application subnets
- Enable IMDSv2 on AWS EC2 instances
- Implement network segmentation and egress filtering
- Use an egress proxy for outbound HTTP traffic

---

## Compliance Mapping

If your organization maps security controls to the OWASP Top 10 for compliance purposes, update the mappings as follows:

| Compliance Control | 2017 Category | 2021 Category |
|-------------------|---------------|---------------|
| Input validation | A01, A07 | A03 |
| Authentication | A02 | A07 |
| Encryption | A03 | A02 |
| XML processing | A04 | A05 |
| Access control | A05 | A01 |
| Server hardening | A06 | A05 |
| Deserialization | A08 | A08 |
| Dependency management | A09 | A06 |
| Logging and monitoring | A10 | A09 |
| Threat modeling | (not covered) | A04 |
| SSRF prevention | (not covered) | A10 |

## Timeline and Future

| Edition | Release Year | Next Expected |
|---------|-------------|---------------|
| OWASP Top 10 2013 | 2013 | — |
| OWASP Top 10 2017 | 2017 | — |
| OWASP Top 10 2021 | 2021 | ~2025-2026 |

The OWASP Top 10 is typically updated every 3-4 years. The next edition is expected around 2025-2026 and will likely reflect the increasing prevalence of AI-related vulnerabilities, API-specific risks, and supply chain attacks.

## References

- OWASP Top 10:2021 Official Documentation
- OWASP Top 10:2017 Official Documentation
- OWASP Data Analysis Methodology
- OWASP Top 10 Mapping Project
