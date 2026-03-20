---
title: "Bug Bounty Hunting Guide"
description: "Getting started with bug bounties, platform comparison for HackerOne and Bugcrowd, reconnaissance methodology, high-value vulnerability classes, report writing, automation pipelines, and common beginner mistakes"
tags: [bug-bounty, hunting, hackerone, recon, vulnerability-research]
difficulty: intermediate
prerequisites: [cybersecurity/web-app-pentesting, cybersecurity/networking-fundamentals]
lastReviewed: "2026-03-20"
---

# Bug Bounty Hunting Guide

Bug bounty hunting is the practice of finding security vulnerabilities in organizations' systems and reporting them for rewards. It is the most accessible path into professional security — you need no degree, no certification, and no employment. What you need is skill, persistence, and a systematic methodology.

The best bug bounty hunters earn six to seven figures annually. But most beginners give up within weeks because they lack a structured approach. This page provides the methodology, tools, and mindset to go from your first bug to consistent findings.

**Related**: [Cybersecurity Overview](/cybersecurity/) | [Web App Pentesting](/cybersecurity/web-app-pentesting) | [API Security Testing](/cybersecurity/api-security-testing) | [Mobile Security](/cybersecurity/mobile-security)

::: warning Scope Is Everything
Only test assets listed in the program scope. Out-of-scope testing is unauthorized access. Read the program policy carefully before testing. Some programs exclude certain vulnerability types, subdomains, or testing methods.
:::

---

## Getting Started

### Prerequisites

Before hunting for bugs, you need a foundation. Jumping straight into bug bounties without fundamentals leads to frustration and duplicate reports.

```mermaid
graph TB
    subgraph "Foundation (Build First)"
        F1["Networking basics<br/>TCP/IP, DNS, HTTP"]
        F2["Web security<br/>OWASP Top 10"]
        F3["Burp Suite proficiency"]
        F4["Linux command line"]
        F5["Basic scripting<br/>Python or Bash"]
    end

    subgraph "Practice (CTFs and Labs)"
        P1["PortSwigger Web Academy<br/>(Free, comprehensive)"]
        P2["HackTheBox / TryHackMe"]
        P3["DVWA, WebGoat, Juice Shop"]
        P4["PentesterLab"]
    end

    subgraph "Hunt (Real Programs)"
        H1["Start with wide-scope programs"]
        H2["Focus on one target deeply"]
        H3["Develop your recon methodology"]
        H4["Submit quality reports"]
    end

    F1 --> F2 --> F3
    F4 --> F5
    F3 --> P1
    F5 --> P1
    P1 --> P2 --> P3 --> H1
    H1 --> H2 --> H3 --> H4

    style F1 fill:#2563eb,color:#fff
    style P1 fill:#ca8a04,color:#fff
    style H1 fill:#16a34a,color:#fff
```

### Bug Bounty Platforms

| Platform | Programs | Avg Payout | Best For | Triage Quality |
|----------|----------|-----------|----------|---------------|
| **HackerOne** | 3000+ | $500-$10K | Beginners, large programs | Good |
| **Bugcrowd** | 1000+ | $300-$5K | VDP + paid, good variety | Good |
| **Intigriti** | 200+ | $500-$8K | European programs | Excellent |
| **YesWeHack** | 500+ | $300-$5K | European programs, CTFs | Good |
| **Synack (Red Team)** | Invite-only | $1K-$20K | Experienced hunters, high payouts | Private |
| **Direct Programs** | Varies | Varies | Google, Microsoft, Apple, Meta | Varies |

::: tip Platform Selection for Beginners
Start on **HackerOne** or **Bugcrowd** with programs that have:
- Wide scope (*.target.com)
- High response rate (> 80%)
- Good signal (bounty table visible)
- Recently launched (less competition)
- VDP (Vulnerability Disclosure Programs) — no bounty but easier to find bugs and build reputation
:::

---

## Reconnaissance Methodology

Recon is the most important phase of bug bounty hunting. The hunter who finds the most assets finds the most bugs. Spend 60-70% of your time on reconnaissance.

### Recon Workflow

```mermaid
graph TB
    subgraph "Asset Discovery"
        SD["Subdomain Enumeration"]
        PS["Port Scanning"]
        TF["Technology Fingerprinting"]
    end

    subgraph "Content Discovery"
        CD["Directory Brute-forcing"]
        JS["JavaScript Analysis"]
        WB["Wayback Machine"]
        GD["Google Dorking"]
    end

    subgraph "Vulnerability Discovery"
        VD["Manual Testing (Burp)"]
        NS["Nuclei Scanning"]
        PA["Parameter Analysis"]
    end

    SD --> PS --> TF
    TF --> CD --> JS --> WB --> GD
    GD --> VD --> NS --> PA

    style SD fill:#2563eb,color:#fff
    style CD fill:#ca8a04,color:#fff
    style VD fill:#dc2626,color:#fff
```

### Subdomain Enumeration

```bash
# Passive subdomain enumeration (does not touch the target)

# subfinder — aggregates many sources
subfinder -d target.com -all -o subdomains.txt

# amass — comprehensive OSINT
amass enum -passive -d target.com -o amass_subs.txt

# crt.sh — Certificate Transparency logs
curl -s "https://crt.sh/?q=%25.target.com&output=json" | jq -r '.[].name_value' | sort -u >> ct_subs.txt

# SecurityTrails API
curl -s "https://api.securitytrails.com/v1/domain/target.com/subdomains" \
    -H "APIKEY: YOUR_API_KEY" | jq -r '.subdomains[]' | sed "s/$/.target.com/" >> st_subs.txt

# GitHub dorking for subdomains
# Search: "target.com" site:github.com

# Combine and deduplicate
cat subdomains.txt amass_subs.txt ct_subs.txt st_subs.txt | sort -u > all_subs.txt

# Active resolution — check which subdomains are alive
cat all_subs.txt | httpx -silent -status-code -title -tech-detect -o live_subs.txt

# DNS resolution
cat all_subs.txt | dnsx -silent -a -resp -o resolved.txt
```

### Port Scanning

```bash
# Scan discovered subdomains for open ports
# naabu — fast port scanner
cat live_subs.txt | naabu -top-ports 1000 -silent -o ports.txt

# Nmap for detailed service detection on interesting hosts
nmap -sV -sC -p- --min-rate 1000 -oN detailed_scan.txt interesting_host.target.com

# Combine host:port for httpx probing
cat ports.txt | httpx -silent -status-code -title -o http_services.txt
```

### Content Discovery

```bash
# Directory brute-forcing with ffuf
ffuf -u https://target.com/FUZZ -w /usr/share/seclists/Discovery/Web-Content/raft-large-directories.txt \
    -mc 200,201,204,301,302,307,401,403 -o ffuf_results.json -of json

# Recursive scanning
ffuf -u https://target.com/FUZZ -w /usr/share/seclists/Discovery/Web-Content/raft-medium-words.txt \
    -mc 200,301,302 -recursion -recursion-depth 2

# Wayback Machine — historical URLs
echo "target.com" | gau --threads 5 | sort -u > wayback_urls.txt
echo "target.com" | waybackurls | sort -u >> wayback_urls.txt

# Filter interesting URLs
cat wayback_urls.txt | grep -iE "\.(php|asp|aspx|jsp|json|xml|config|env|sql|bak|old|log)" > interesting_urls.txt
cat wayback_urls.txt | grep -iE "(api|admin|debug|test|staging|internal|dev)" >> interesting_urls.txt

# Google dorking
# site:target.com filetype:pdf
# site:target.com inurl:admin
# site:target.com inurl:api
# site:target.com ext:env | ext:config | ext:xml
# site:target.com intitle:"index of"
```

### JavaScript Analysis

```bash
# Extract JS files from URLs
cat wayback_urls.txt | grep "\.js$" | sort -u > js_files.txt
cat live_subs.txt | getJS --complete | sort -u >> js_files.txt

# Download and analyze JS files for secrets, endpoints, and subdomains
cat js_files.txt | while read url; do
    curl -sk "$url" >> all_js_content.txt
done

# Extract API endpoints from JavaScript
cat all_js_content.txt | grep -oE "(/api/[a-zA-Z0-9_/.-]+)" | sort -u > api_endpoints.txt

# Extract potential secrets
cat all_js_content.txt | grep -oiE "(api_key|apikey|secret|token|password|aws_access)['\"]?\s*[:=]\s*['\"][a-zA-Z0-9_/+=.-]+['\"]" | sort -u > potential_secrets.txt

# LinkFinder — extract endpoints from JS
python3 linkfinder.py -i https://target.com/main.js -o cli

# SecretFinder — find secrets in JS
python3 SecretFinder.py -i https://target.com/main.js -o cli
```

---

## Vulnerability Classes That Pay the Most

| Vulnerability | Avg Bounty | Difficulty to Find | Where to Look |
|--------------|-----------|-------------------|---------------|
| **Remote Code Execution (RCE)** | $10K-$100K+ | Very Hard | File uploads, deserialization, SSTI, command injection |
| **SQL Injection** | $3K-$20K | Medium | Search, filters, sort params, hidden params |
| **SSRF** | $2K-$15K | Medium | URL inputs, webhooks, integrations, PDF generators |
| **Authentication Bypass** | $5K-$30K | Hard | Login flows, password reset, OAuth, JWT |
| **IDOR / BOLA** | $1K-$10K | Easy-Medium | Every API endpoint with an object ID |
| **XSS (Stored)** | $500-$5K | Easy | User input that gets reflected: profiles, comments, names |
| **Information Disclosure** | $200-$3K | Easy | Error messages, debug endpoints, exposed configs |
| **Business Logic** | $1K-$20K | Hard | Payment flows, referral systems, coupon abuse |
| **Subdomain Takeover** | $200-$2K | Easy | Unclaimed CNAME records (GitHub Pages, Heroku, S3) |

### Finding IDORs Systematically

```bash
# IDOR is the most common high-impact vulnerability class
# Step 1: Create two accounts (Account A and Account B)
# Step 2: Map all endpoints that reference user-specific objects
# Step 3: Using Account A's session, access Account B's resources

# Look for IDs in:
# URL paths: /api/v1/users/123/profile
# Query parameters: /api/v1/orders?user_id=123
# Request body: {"account_id": 123}
# Headers: X-User-Id: 123

# Test ID formats:
# Sequential integers: 123, 124, 125
# UUIDs: try other users' UUIDs from elsewhere in the app
# Encoded: base64, hex — decode, modify, re-encode
# Hashed: check if hash is predictable (MD5 of sequential ID)
```

---

## Writing Good Reports

Report quality directly affects your bounty and reputation. A well-written report gets resolved faster and earns higher payouts. A poorly written report gets marked as "needs more info" or "not applicable."

### Report Template

```markdown
## Title
[Vulnerability Type] in [Feature/Endpoint] allows [Impact]
Example: "IDOR in /api/v1/users/{id}/documents allows unauthorized access to any user's documents"

## Severity
Critical / High / Medium / Low
(Use CVSS 3.1 calculator for objectivity)

## Description
Clear, concise explanation of the vulnerability.
What is the root cause? Why does it exist?

## Steps to Reproduce
1. Create Account A (attacker) and Account B (victim)
2. Log in as Account A
3. Navigate to /documents and note your document ID (e.g., 1001)
4. Change the document ID in the URL to Account B's document (e.g., 1002)
5. Observe that Account B's document is returned

## Impact
- An attacker can access any user's private documents
- PII exposure for all users of the platform
- No authentication or special permissions required beyond a valid account
- Estimated affected users: all registered users (~500K based on ID range)

## Proof of Concept
[Screenshots, HTTP requests/responses, video]

## Suggested Fix
- Implement server-side authorization check: verify the authenticated
  user owns the requested resource before returning it
- Example: WHERE document.user_id = authenticated_user.id

## Environment
- Browser: Chrome 120
- OS: macOS 14.0
- Target: app.target.com
- Date: 2026-03-20
```

::: tip Report Writing Best Practices
1. **Be specific** — Include exact URLs, parameters, and payloads
2. **Prove impact** — Do not just show the bug exists; show what damage an attacker could do
3. **Include HTTP requests** — Copy from Burp Suite, not just browser screenshots
4. **One report per vulnerability** — Do not bundle multiple bugs
5. **Do not over-claim severity** — Self-XSS is not Critical; IDOR on public data is not High
6. **Suggest a fix** — Shows understanding and professionalism
7. **Follow up politely** — If no response after 2 weeks, send a polite ping
:::

---

## Automation Pipeline

Automating repetitive recon tasks lets you scale your testing across many targets.

```mermaid
graph LR
    subgraph "Asset Discovery"
        A1["subfinder"] --> A2["httpx"]
        A3["amass"] --> A2
    end

    subgraph "Content Discovery"
        A2 --> B1["gau / waybackurls"]
        A2 --> B2["ffuf"]
        B1 --> B3["Filter interesting URLs"]
    end

    subgraph "Vulnerability Scanning"
        B3 --> C1["nuclei"]
        A2 --> C1
        B2 --> C2["Manual testing (Burp)"]
    end

    subgraph "Notification"
        C1 --> D1["Slack / Discord / Email"]
    end

    style A1 fill:#2563eb,color:#fff
    style C1 fill:#dc2626,color:#fff
    style D1 fill:#16a34a,color:#fff
```

### One-Liner Recon Pipeline

```bash
# Full recon pipeline — subdomain discovery to vulnerability scanning
subfinder -d target.com -silent | \
    httpx -silent -status-code -title -tech-detect | \
    tee alive_hosts.txt | \
    nuclei -t /path/to/nuclei-templates/ -severity medium,high,critical -o vulnerabilities.txt

# Parameter discovery pipeline
echo "target.com" | gau | \
    grep "=" | \
    uro | \
    httpx -silent | \
    nuclei -t /path/to/nuclei-templates/fuzzing/ -o param_vulns.txt

# Subdomain monitoring — run daily with cron
# Compare today's subdomains with yesterday's
subfinder -d target.com -silent > today_subs.txt
comm -13 <(sort yesterday_subs.txt) <(sort today_subs.txt) > new_subs.txt
if [ -s new_subs.txt ]; then
    cat new_subs.txt | httpx -silent | nuclei -t /path/to/nuclei-templates/ -severity medium,high,critical
    # Send notification for new subdomains
    cat new_subs.txt | notify -provider-config notify-config.yaml
fi
mv today_subs.txt yesterday_subs.txt
```

### Nuclei Templates

```bash
# Run Nuclei with community templates
nuclei -u https://target.com -t /path/to/nuclei-templates/ -severity medium,high,critical

# Specific template categories
nuclei -l urls.txt -t /path/to/nuclei-templates/http/cves/          # Known CVEs
nuclei -l urls.txt -t /path/to/nuclei-templates/http/exposures/     # Exposed configs
nuclei -l urls.txt -t /path/to/nuclei-templates/http/misconfiguration/  # Misconfigs
nuclei -l urls.txt -t /path/to/nuclei-templates/http/takeovers/     # Subdomain takeover

# Custom Nuclei template example — check for exposed .env files
```

```yaml
# nuclei-template: detect-env-file.yaml
id: exposed-env-file
info:
  name: Exposed .env File
  author: hunter
  severity: high
  description: Detects exposed .env files containing secrets

http:
  - method: GET
    path:
      - "{​{BaseURL}}/.env"
      - "{​{BaseURL}}/.env.local"
      - "{​{BaseURL}}/.env.production"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "DB_PASSWORD"
          - "API_KEY"
          - "SECRET_KEY"
          - "AWS_ACCESS"
        condition: or

      - type: status
        status:
          - 200
```

---

## Common Beginner Mistakes

| Mistake | Why It Hurts | Fix |
|---------|-------------|-----|
| **Hunting without fundamentals** | You cannot find what you do not understand | Complete PortSwigger Academy first |
| **Scanning wide, testing shallow** | Automated tools find low-hanging fruit already picked | Go deep on fewer targets |
| **Duplicating known bugs** | Wastes your time and damages reputation | Check disclosed reports before testing |
| **Poor reports** | Reports get closed as "needs more info" | Use the template above, include repro steps |
| **Giving up too fast** | First bugs take weeks to find; it gets faster | Commit to 3 months of consistent effort |
| **Only using automated tools** | Scanners miss business logic, IDORs, auth issues | Use tools for recon, manual testing for bugs |
| **Ignoring the scope** | Out-of-scope testing can get you banned | Read program policy first, every time |
| **Chasing only XSS** | XSS is overcrowded; IDOR/auth bugs pay more | Diversify your skill set |
| **Not learning from others** | Bug bounty write-ups teach real-world patterns | Read write-ups daily (HackerOne Hacktivity) |
| **No notes or tracking** | You forget what you tested, repeat work | Use Notion, Obsidian, or a simple spreadsheet |

---

## Bug Bounty Income Expectations

| Level | Monthly Earnings | Time Investment | Skills |
|-------|-----------------|-----------------|--------|
| **Beginner (0-6 months)** | $0-$500 | 20-40 hrs/week | Basic web security, recon |
| **Intermediate (6-18 months)** | $500-$3K | 20-30 hrs/week | IDOR, SSRF, auth bypass |
| **Advanced (1.5-3 years)** | $3K-$15K | 15-25 hrs/week | Business logic, RCE, mobile |
| **Elite (3+ years)** | $15K-$50K+ | 10-20 hrs/week | Custom tooling, deep specialization |

::: tip Making Bug Bounty Sustainable
1. **Specialize** — Become the best at one vulnerability class (SSRF, IDOR, auth bypass)
2. **Build relationships** — Consistent quality reports on one platform build trust and invite-only access
3. **Automate recon** — Free up time for manual testing where humans beat scanners
4. **Track everything** — Know your hourly rate, best programs, highest-paying vuln types
5. **Take breaks** — Burnout is the biggest threat to long-term success
:::

---

## Recommended Learning Path

```mermaid
graph TB
    W1["Week 1-4<br/>PortSwigger Web Academy<br/>(all free labs)"] --> W2["Week 5-8<br/>Burp Suite mastery<br/>Practice on DVWA/Juice Shop"]
    W2 --> W3["Week 9-12<br/>Set up recon tooling<br/>Start with VDP programs"]
    W3 --> W4["Month 4-6<br/>First paid program<br/>Focus on IDOR and access control"]
    W4 --> W5["Month 6-12<br/>Develop specialization<br/>Automate recon pipeline"]
    W5 --> W6["Year 2+<br/>Private programs<br/>Mobile/API testing<br/>Mentoring"]

    style W1 fill:#2563eb,color:#fff
    style W3 fill:#ca8a04,color:#fff
    style W4 fill:#16a34a,color:#fff
    style W6 fill:#7c3aed,color:#fff
```

---

## Essential Resources

| Resource | Type | Cost | Best For |
|----------|------|------|----------|
| **PortSwigger Web Academy** | Interactive labs | Free | Web vulnerability fundamentals |
| **HackerOne Hacktivity** | Disclosed reports | Free | Learning from real findings |
| **Pentester Land** | Write-up aggregator | Free | Bug bounty write-ups |
| **The Bug Hunters Methodology (TBHM)** | Methodology guide | Free | Recon methodology |
| **Nahamsec (YouTube)** | Video content | Free | Live recon, methodology |
| **STOK (YouTube)** | Video content | Free | Recon, tools, mindset |
| **Bug Bounty Bootcamp (book)** | Book | $40 | Comprehensive guide |
| **Real-World Bug Hunting (book)** | Book | $35 | Vulnerability examples |

---

## Further Reading

- [Web App Pentesting](/cybersecurity/web-app-pentesting) — Detailed web vulnerability testing
- [API Security Testing](/cybersecurity/api-security-testing) — APIs are the top bug bounty target
- [Mobile Security](/cybersecurity/mobile-security) — Mobile app testing for bounties
- [Web3 Security](/cybersecurity/web3-security) — Smart contract bounties (highest payouts)
- [Security Certifications](/cybersecurity/security-certifications) — eJPT, OSCP to complement hunting
