---
title: "Security Certification Roadmap"
description: "Complete security certification guide covering CompTIA Security+ and CySA+, OSCP exam preparation and strategy, CEH comparison, CISSP for management, cloud security certifications, and free learning resources"
tags: [certifications, oscp, cissp, career, training]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-20"
---

# Security Certification Roadmap

Security certifications validate your knowledge, open doors to interviews, and provide structured learning paths. But not all certifications are equal — some are respected industry-wide, others are checkbox exercises. This page breaks down every major security certification by career path, compares their value, and provides a concrete preparation strategy for the most important ones.

The cybersecurity certification landscape can be overwhelming. This guide cuts through the noise and tells you exactly which certifications to pursue based on your career goals, experience level, and budget.

**Related**: [Cybersecurity Overview](/cybersecurity/) | [Bug Bounty Hunting](/cybersecurity/bug-bounty) | [Blue Team & SOC](/cybersecurity/blue-team-soc) | [Red Team Operations](/cybersecurity/red-team-ops)

---

## Certification Path by Career Goal

```mermaid
graph TB
    START["Where Do You<br/>Want to Go?"]

    START --> OFF["Offensive Security<br/>(Pentesting, Red Team)"]
    START --> DEF["Defensive Security<br/>(SOC, Blue Team, IR)"]
    START --> MGT["Security Management<br/>(CISO, GRC, Architecture)"]
    START --> CLD["Cloud Security<br/>(DevSecOps, Cloud Architect)"]

    subgraph "Offensive Path"
        OFF --> SECPLUS1["CompTIA Security+"]
        SECPLUS1 --> EJPT["eJPT"]
        EJPT --> OSCP["OSCP"]
        OSCP --> OSWE["OSWE"]
        OSCP --> CRTO["CRTO"]
        OSWE --> OSCE3["OSCE3"]
        CRTO --> OSCE3
    end

    subgraph "Defensive Path"
        DEF --> SECPLUS2["CompTIA Security+"]
        SECPLUS2 --> CYSA["CySA+"]
        CYSA --> BTL1["BTL1"]
        BTL1 --> GCIH["GCIH"]
        GCIH --> GCFA["GCFA"]
    end

    subgraph "Management Path"
        MGT --> SECPLUS3["CompTIA Security+"]
        SECPLUS3 --> CASP["CASP+"]
        CASP --> CISSP["CISSP"]
        CISSP --> CISM["CISM"]
    end

    subgraph "Cloud Path"
        CLD --> SECPLUS4["CompTIA Security+"]
        SECPLUS4 --> AWS["AWS Security Specialty"]
        SECPLUS4 --> AZ["AZ-500 Azure Security"]
        AWS --> CCSP["CCSP"]
        AZ --> CCSP
    end

    style OSCP fill:#dc2626,color:#fff
    style CISSP fill:#16a34a,color:#fff
    style SECPLUS1 fill:#2563eb,color:#fff
    style SECPLUS2 fill:#2563eb,color:#fff
    style SECPLUS3 fill:#2563eb,color:#fff
    style SECPLUS4 fill:#2563eb,color:#fff
```

---

## Entry-Level Certifications

### CompTIA Security+

The industry-standard entry-level security certification. Required or preferred for most security positions. DoD 8570 compliant for IAT Level II.

| Aspect | Details |
|--------|---------|
| **Exam Code** | SY0-701 (current version) |
| **Format** | 90 questions (MCQ + PBQ), 90 minutes |
| **Passing Score** | 750/900 |
| **Cost** | ~$400 USD |
| **Prerequisites** | None (2+ years IT experience recommended) |
| **Renewal** | Every 3 years (50 CEUs) |
| **Difficulty** | Entry level |
| **Value** | High — universally recognized, many jobs require it |

**Domains covered:**

| Domain | Weight | Topics |
|--------|--------|--------|
| General Security Concepts | 12% | CIA triad, security controls, change management |
| Threats, Vulnerabilities, and Mitigations | 22% | Threat actors, attack types, vulnerability management |
| Security Architecture | 18% | Network security, cloud, virtualization, IoT |
| Security Operations | 28% | Monitoring, incident response, automation, forensics |
| Security Program Management | 20% | Governance, risk, compliance, security awareness |

::: tip Security+ Preparation Strategy
1. **Study time:** 4-8 weeks, 2-3 hours daily
2. **Primary resource:** Professor Messer (free YouTube course) + Jason Dion practice exams
3. **Supplement:** CompTIA CertMaster Labs or TryHackMe Security+ path
4. **Practice exams:** Take at least 5 full practice exams, aim for consistent 85%+
5. **Performance-based questions (PBQs):** Practice configuring firewalls, analyzing logs, setting permissions
:::

### CompTIA CySA+ (Cybersecurity Analyst)

Blue team focused — covers threat detection, analysis, and incident response.

| Aspect | Details |
|--------|---------|
| **Exam Code** | CS0-003 |
| **Format** | 85 questions, 165 minutes |
| **Passing Score** | 750/900 |
| **Cost** | ~$400 USD |
| **Prerequisites** | Security+ recommended |
| **Difficulty** | Intermediate |
| **Value** | Good for SOC analyst and blue team roles |

### CompTIA PenTest+

Penetration testing focused — practical methodology and tools.

| Aspect | Details |
|--------|---------|
| **Exam Code** | PT0-002 |
| **Format** | 85 questions (MCQ + PBQ), 165 minutes |
| **Passing Score** | 750/900 |
| **Cost** | ~$400 USD |
| **Prerequisites** | Security+ recommended |
| **Difficulty** | Intermediate |
| **Value** | Moderate — less respected than OSCP but easier to obtain |

### eLearnSecurity eJPT (Junior Penetration Tester)

```mermaid
graph LR
    subgraph "eJPT Overview"
        E1["35-hour self-paced<br/>training course"]
        E2["48-hour practical<br/>exam (lab-based)"]
        E3["Certificate + badge<br/>upon passing"]
    end

    E1 --> E2 --> E3

    style E1 fill:#2563eb,color:#fff
    style E2 fill:#ca8a04,color:#fff
    style E3 fill:#16a34a,color:#fff
```

| Aspect | Details |
|--------|---------|
| **Provider** | INE (formerly eLearnSecurity) |
| **Format** | 48-hour practical lab exam |
| **Cost** | ~$250 USD (exam) or included with INE subscription |
| **Prerequisites** | None |
| **Difficulty** | Entry level |
| **Value** | Good stepping stone to OSCP, proves basic practical skills |

---

## CEH vs OSCP vs eJPT — The Great Debate

This is the most common comparison in offensive security certifications.

| Aspect | eJPT | CEH | OSCP |
|--------|------|-----|------|
| **Provider** | INE | EC-Council | OffSec |
| **Exam Type** | Practical lab (48h) | Multiple choice (4h) | Practical lab (24h) + report |
| **Cost** | ~$250 | ~$1,200+ | ~$1,600+ |
| **Difficulty** | Easy | Medium (memorization) | Very Hard |
| **Industry Respect** | Growing | Moderate (controversial) | Very High |
| **Proves** | Basic hands-on skills | Theoretical knowledge | Real-world exploitation |
| **HR Filter** | Sometimes | Often required by HR | Gold standard |
| **Best For** | Beginners, first cert | Checkbox requirements, HR compliance | Actual pentest jobs |
| **Time to Prepare** | 2-4 weeks | 4-8 weeks | 3-6 months |

::: warning The CEH Controversy
The CEH is widely criticized in the security community for being overly theoretical with outdated content. However, it remains on many job descriptions because HR departments recognize the name. If a job posting requires "CEH or equivalent," the OSCP is always the better equivalent. Some organizations require CEH specifically for compliance (e.g., DoD 8570).
:::

---

## OSCP Deep Dive

The Offensive Security Certified Professional (OSCP) is the gold standard certification for penetration testers. It is a grueling 24-hour practical exam that tests real exploitation skills.

### Exam Format

```mermaid
graph TB
    subgraph "OSCP Exam Structure (24 hours)"
        AD["Active Directory Set<br/>40 points<br/>(3 machines, full chain)"]
        S1["Standalone Machine 1<br/>20 points"]
        S2["Standalone Machine 2<br/>20 points"]
        S3["Standalone Machine 3<br/>20 points"]
        BONUS["Bonus Points<br/>10 points<br/>(lab exercises + exam)"]
        PASS["Passing: 70/100 points"]
    end

    AD --> PASS
    S1 --> PASS
    S2 --> PASS
    S3 --> PASS
    BONUS --> PASS

    style AD fill:#dc2626,color:#fff
    style PASS fill:#16a34a,color:#fff
```

| Component | Details |
|-----------|---------|
| **Exam duration** | 23 hours 45 minutes (exam) + 24 hours (report) |
| **Passing score** | 70/100 points |
| **AD set** | 3 machines forming a domain (40 points, all-or-nothing) |
| **Standalones** | 3 independent machines (20 points each, partial credit: 10 for local, 10 for root) |
| **Bonus points** | Up to 10 points for completing lab exercises |
| **Report** | Professional pentest report required (can fail with enough points but bad report) |
| **Proctored** | Yes, screen and webcam recorded |
| **Allowed tools** | Most tools allowed; no commercial tools, no auto-exploitation (Metasploit restricted to one machine) |

### OSCP Preparation Strategy

```mermaid
graph TB
    subgraph "Month 1-2: Foundation"
        M1["Complete OffSec PEN-200<br/>course material"]
        M2["Practice: TryHackMe<br/>Offensive Pentesting path"]
        M3["Build methodology notes"]
    end

    subgraph "Month 3-4: Practice"
        M4["HackTheBox: 20+ machines<br/>(TJ Null list)"]
        M5["PG Practice: 20+ machines<br/>(Proving Grounds)"]
        M6["Active Directory practice<br/>(GOAD, HTB Pro Labs)"]
    end

    subgraph "Month 5: Exam Prep"
        M7["Timed practice exams<br/>(simulate 24h format)"]
        M8["Report template ready"]
        M9["Methodology finalized"]
    end

    M1 --> M2 --> M3
    M3 --> M4 --> M5 --> M6
    M6 --> M7 --> M8 --> M9

    style M1 fill:#2563eb,color:#fff
    style M4 fill:#ca8a04,color:#fff
    style M7 fill:#dc2626,color:#fff
```

### Essential Skills for OSCP

| Skill | Why | Practice |
|-------|-----|---------|
| **Enumeration** | 90% of the exam is enumeration | Nmap, gobuster, enum4linux, SMB enumeration |
| **Web exploitation** | At least 1-2 machines will be web-based | SQLi, file upload, LFI, command injection |
| **Linux privilege escalation** | Most standalones require privesc | SUID, capabilities, cron, kernel exploits |
| **Windows privilege escalation** | AD set is all Windows | Services, SeImpersonatePrivilege, UAC bypass |
| **Active Directory** | 40 points depend on AD | BloodHound, Kerberoasting, PtH, lateral movement |
| **Buffer overflow** | May appear as a standalone | Stack-based BOF methodology |
| **Tunneling/Pivoting** | Required for AD set | Chisel, ligolo-ng, SSH tunnels, proxychains |
| **Report writing** | Bad report = fail even with enough points | Practice writing during every lab machine |

::: tip OSCP Exam Day Tips
1. **Start with the AD set** — 40 points, high ROI
2. **Take breaks** — Eat, stretch, step away when stuck. Fresh eyes solve problems
3. **Screenshot everything** — Every command, every flag, every proof.txt
4. **Time management** — If stuck for 2 hours on one machine, move on
5. **No rabbit holes** — If something seems too complex, it probably is not the right path
6. **Sleep** — A 4-hour nap in the middle is worth more than 4 hours of exhausted staring
7. **Report immediately** — Start the report during the exam, not after
:::

---

## CISSP (Management Track)

The Certified Information Systems Security Professional is the premier certification for security management, architecture, and leadership roles. Most CISO job postings list CISSP as required.

| Aspect | Details |
|--------|---------|
| **Provider** | ISC2 |
| **Format** | 125-175 adaptive questions, 4 hours |
| **Passing Score** | 700/1000 |
| **Cost** | ~$750 USD |
| **Prerequisites** | 5 years professional experience in 2+ of 8 domains (or 4 years + relevant degree) |
| **Renewal** | Every 3 years (40 CPE credits/year) |
| **Difficulty** | Expert (breadth over depth) |
| **Value** | Very high for management roles, CISO track |

### CISSP Domains

| Domain | Weight | Focus |
|--------|--------|-------|
| Security and Risk Management | 15% | Governance, compliance, risk, legal |
| Asset Security | 10% | Data classification, ownership, retention |
| Security Architecture and Engineering | 13% | Design principles, crypto, physical security |
| Communication and Network Security | 13% | Network architecture, secure channels |
| Identity and Access Management | 13% | Authentication, authorization, identity federation |
| Security Assessment and Testing | 12% | Assessment strategies, audit, testing |
| Security Operations | 13% | Incident response, disaster recovery, forensics |
| Software Development Security | 11% | SDLC security, application vulnerabilities |

::: tip CISSP Mindset
The CISSP tests whether you think like a security **manager**, not a technician. Key principles:
- **Protect life safety first** — Always the top priority
- **Think like a risk advisor** — Cost-benefit analysis, not perfection
- **Choose the BEST answer** — Multiple answers may be correct; pick the one a CISO would recommend
- **Process over technology** — Governance and frameworks before tools
- **Least privilege, defense in depth** — Apply everywhere
:::

---

## Cloud Security Certifications

### AWS Certified Security - Specialty

| Aspect | Details |
|--------|---------|
| **Format** | 65 questions, 170 minutes |
| **Cost** | ~$300 USD |
| **Prerequisites** | AWS experience recommended (2+ years security) |
| **Domains** | Incident response, logging/monitoring, infrastructure security, IAM, data protection |
| **Difficulty** | Advanced |
| **Value** | High for AWS-focused roles |

### Microsoft AZ-500 (Azure Security Engineer)

| Aspect | Details |
|--------|---------|
| **Format** | 40-60 questions, 150 minutes |
| **Cost** | ~$165 USD |
| **Prerequisites** | AZ-104 recommended |
| **Domains** | Identity/access, network security, compute security, data security |
| **Difficulty** | Intermediate-Advanced |
| **Value** | High for Azure-focused organizations |

### Google Professional Cloud Security Engineer

| Aspect | Details |
|--------|---------|
| **Format** | 50-60 questions, 120 minutes |
| **Cost** | ~$200 USD |
| **Prerequisites** | GCP experience recommended |
| **Difficulty** | Advanced |
| **Value** | Good for GCP-focused roles, growing market |

### CCSP (Certified Cloud Security Professional)

| Aspect | Details |
|--------|---------|
| **Provider** | ISC2 |
| **Format** | 150 questions, 4 hours |
| **Cost** | ~$600 USD |
| **Prerequisites** | 5 years IT experience (3 in security, 1 in cloud) |
| **Difficulty** | Advanced |
| **Value** | High — vendor-neutral cloud security |

---

## Advanced Offensive Certifications

| Certification | Provider | Focus | Exam | Cost | Difficulty |
|--------------|----------|-------|------|------|------------|
| **OSWE** | OffSec | Web application exploitation | 48h practical | ~$1,600 | Expert |
| **OSEP** | OffSec | Advanced evasion, custom tools | 48h practical | ~$1,600 | Expert |
| **OSED** | OffSec | Windows exploit development | 48h practical | ~$1,600 | Expert |
| **OSCE3** | OffSec | OSWE + OSEP + OSED combined | All three exams | ~$5,000+ | Expert |
| **CRTO** | Zero-Point Security | Red team ops, Cobalt Strike | 48h practical | ~$450 | Advanced |
| **CRTL** | Zero-Point Security | Advanced red team, evasion | 48h practical | ~$450 | Expert |
| **GPEN** | SANS | Penetration testing | 115 questions, 3h | ~$8,500 (with course) | Advanced |
| **GXPN** | SANS | Advanced exploitation | 60 questions, 3h | ~$8,500 (with course) | Expert |

---

## Advanced Defensive Certifications

| Certification | Provider | Focus | Exam | Cost | Difficulty |
|--------------|----------|-------|------|------|------------|
| **GCIH** | SANS | Incident handling, hacker tools | 106 questions, 4h | ~$8,500 (with course) | Advanced |
| **GCFA** | SANS | Advanced forensics | 82 questions, 3h | ~$8,500 (with course) | Expert |
| **GNFA** | SANS | Network forensics | 66 questions, 3h | ~$8,500 (with course) | Expert |
| **GREM** | SANS | Reverse engineering malware | 66 questions, 2h | ~$8,500 (with course) | Expert |
| **BTL1** | Security Blue Team | Blue team level 1 | 24h practical | ~$500 | Intermediate |
| **BTL2** | Security Blue Team | Blue team level 2 | 48h practical | ~$800 | Advanced |
| **CDSA** | HTB Academy | Certified Defensive Security Analyst | Practical | ~$200 | Intermediate |

::: warning SANS Certification Costs
SANS certifications (GIAC) are world-class but extremely expensive. A single course + exam costs ~$8,500. Many employers sponsor SANS training. If paying out of pocket, consider OffSec or Security Blue Team certifications for better ROI.
:::

---

## Free Resources and Practice Labs

### Learning Platforms

| Platform | Type | Best For | Cost |
|----------|------|----------|------|
| **TryHackMe** | Guided rooms and paths | Beginners, structured learning | Free tier + $14/mo |
| **HackTheBox** | Challenge machines | Intermediate-advanced, OSCP prep | Free tier + $14/mo |
| **HackTheBox Academy** | Structured courses | CPTS certification path | Free tier + paid |
| **PentesterLab** | Web security exercises | Web app pentesting, OSWE prep | $20/mo |
| **PortSwigger Web Academy** | Web security labs | Web vulnerabilities, free | Free |
| **CyberDefenders** | Blue team challenges | DFIR, threat hunting | Free |
| **LetsDefend** | SOC analyst simulator | SOC operations, alert triage | Free tier + $25/mo |
| **OverTheWire** | Linux wargames | Linux fundamentals | Free |
| **VulnHub** | Downloadable VMs | Offline practice | Free |
| **Immersive Labs** | Cyber exercises | Enterprise training | Free for students |

### Free Courses

| Course | Provider | Topics | Length |
|--------|----------|--------|--------|
| **Security+ Full Course** | Professor Messer (YouTube) | Complete SY0-701 content | 25+ hours |
| **Introduction to Cybersecurity** | Cisco Networking Academy | Security fundamentals | 15 hours |
| **CS50 Cybersecurity** | Harvard (edX) | Security concepts | Self-paced |
| **MITRE ATT&CK Training** | MITRE (online) | Threat intelligence, ATT&CK | Self-paced |
| **Splunk Fundamentals** | Splunk Education | SIEM basics | 12 hours |
| **AWS Security Fundamentals** | AWS Skill Builder | Cloud security basics | 4 hours |

### Practice Labs for OSCP Preparation

```mermaid
graph TB
    subgraph "Beginner"
        B1["TryHackMe<br/>Complete Beginner Path"]
        B2["OverTheWire Bandit<br/>(Linux fundamentals)"]
    end

    subgraph "Intermediate"
        I1["TryHackMe<br/>Offensive Pentesting Path"]
        I2["HackTheBox<br/>Easy machines"]
        I3["VulnHub<br/>Easy machines"]
    end

    subgraph "OSCP Ready"
        A1["HackTheBox<br/>TJ Null OSCP list"]
        A2["Proving Grounds<br/>Practice machines"]
        A3["HackTheBox Pro Labs<br/>(Offshore, RastaLabs)"]
    end

    B1 --> I1
    B2 --> I1
    I1 --> I2
    I2 --> I3
    I3 --> A1
    A1 --> A2
    A2 --> A3

    style B1 fill:#16a34a,color:#fff
    style I1 fill:#ca8a04,color:#fff
    style A1 fill:#dc2626,color:#fff
```

### TJ Null's OSCP-Like Machines

| Platform | Count | Difficulty | Focus |
|----------|-------|-----------|-------|
| HackTheBox (Retired) | 50+ | Easy-Hard | Linux + Windows exploitation |
| Proving Grounds (Practice) | 30+ | Intermediate-Hard | Realistic OSCP-style |
| VulnHub | 20+ | Easy-Medium | Offline practice |

---

## Certification Comparison by ROI

| Certification | Cost | Salary Increase | Time to Prepare | Job Requirement Frequency | ROI Score |
|--------------|------|-----------------|-----------------|--------------------------|-----------|
| **Security+** | $400 | +$5-10K | 4-8 weeks | Very High | Excellent |
| **OSCP** | $1,600 | +$15-30K | 3-6 months | High (pentest roles) | Excellent |
| **CISSP** | $750 | +$20-40K | 3-6 months | Very High (management) | Excellent |
| **AWS Security** | $300 | +$10-20K | 4-8 weeks | High (cloud roles) | Very Good |
| **CySA+** | $400 | +$5-15K | 4-6 weeks | Medium | Good |
| **CEH** | $1,200 | +$5-10K | 4-6 weeks | Medium (HR filter) | Moderate |
| **GCIH** | $8,500 | +$15-25K | 8-12 weeks | Medium | Moderate (unless sponsored) |
| **CRTO** | $450 | +$10-20K | 4-8 weeks | Growing | Very Good |

---

## Building Your Certification Plan

### Step-by-Step Approach

| Year | Offensive Track | Defensive Track | Management Track |
|------|----------------|-----------------|------------------|
| **Year 1** | Security+ then eJPT | Security+ then CySA+ | Security+ |
| **Year 2** | OSCP | BTL1 then GCIH | CASP+ or CCSP |
| **Year 3** | CRTO or OSWE | GCFA or BTL2 | CISSP |
| **Year 4+** | OSCE3 | GREM or specialized SANS | CISM or CCSP |

::: tip Certification Is Not a Substitute for Skills
Certifications open doors, but skills keep you employed. The best approach:
1. **Build skills first** — Practice in labs, do CTFs, build projects
2. **Certify to validate** — Take the exam when you can already pass
3. **Never stop learning** — Certifications expire; skills compound
4. **Portfolio matters** — Blog posts, GitHub repos, and CTF rankings complement certifications
:::

---

## Further Reading

- [Cybersecurity Overview](/cybersecurity/) — Career paths and learning stack
- [Web App Pentesting](/cybersecurity/web-app-pentesting) — Core skill for OSCP
- [Active Directory](/cybersecurity/active-directory) — Critical for OSCP AD set
- [Blue Team & SOC](/cybersecurity/blue-team-soc) — Skills for CySA+, GCIH, BTL1
- [Bug Bounty Hunting](/cybersecurity/bug-bounty) — Real-world practice alongside certification study
- [Malware Analysis](/cybersecurity/malware-analysis) — Skills for GREM certification

---

::: tip Key Takeaway
- CompTIA Security+ is the universal starting point — it is required or preferred for most security positions and is worth getting first regardless of your career path
- OSCP is the gold standard for offensive security roles — its 24-hour practical exam proves real-world exploitation skills that no multiple-choice exam can match
- Certifications open doors, but skills keep you employed — practice in labs and CTFs first, then certify to validate what you already know
:::

::: details Hands-On Lab
**Lab: OSCP Preparation Practice**

1. Set up your OSCP lab environment: Kali Linux with all tools configured and note-taking ready (Obsidian or CherryTree)
2. Complete 5 machines from TJ Null's OSCP-like list on HackTheBox (start with Easy, progress to Medium)
3. For each machine, follow the methodology: enumerate, identify vulnerabilities, exploit, escalate privileges
4. Write a pentest report for each machine: executive summary, findings, reproduction steps, and remediation
5. Practice Active Directory: set up GOAD (Game of Active Directory) and practice the full attack chain from domain user to domain admin
6. Time yourself: complete one machine in under 3 hours, simulating exam conditions
7. Review your methodology gaps and create cheat sheets for common enumeration commands, privilege escalation paths, and AD attacks
:::

::: details CTF Challenge
**Challenge: The Certification Decision**

You are a junior SOC analyst with 1 year of experience. Your employer offers to sponsor one certification. You want to move into penetration testing within 2 years. Which certification should you choose, and what is your study plan?

**Hints:**
1. Consider the certification that would be most valuable for a pentesting career
2. Think about prerequisites and whether you have them
3. Consider ROI: cost vs salary increase vs career progression

::: details Answer
Choose OSCP. It is the gold standard for penetration testing roles, has the highest ROI for career transition, and proves practical skills. Study plan: Months 1-2: Complete PEN-200 course material and TryHackMe Offensive Pentesting path. Months 3-4: Complete 30+ machines from TJ Null's list and Proving Grounds. Month 5: Practice AD attacks and timed exam simulations. The OSCP title opens doors to pentesting roles immediately. Flag: `CTF{oscp_is_the_golden_ticket_to_pentesting}`.
:::
:::

::: warning Common Misconceptions
- **"You need a degree to work in cybersecurity"** — Many successful security professionals have no degree. Certifications, practical experience, and a portfolio of CTF achievements matter more.
- **"CEH is as valuable as OSCP"** — CEH tests theoretical knowledge with multiple-choice questions. OSCP tests real-world exploitation in a 24-hour practical exam. The industry overwhelmingly values OSCP higher.
- **"CISSP is for technical roles"** — CISSP tests management thinking, not technical skills. It is designed for security managers, architects, and CISOs, not hands-on pentesters or analysts.
- **"More certifications mean better job prospects"** — Employers value depth over breadth. Two relevant certifications with demonstrable skills beat five irrelevant certifications.
- **"You should wait until you are ready before taking the exam"** — You will never feel 100% ready. If you consistently score 85%+ on practice exams, take the real one.
:::

::: details Quiz
**1. What makes OSCP different from most other security certifications?**

a) It is cheaper
b) It is a 24-hour practical exam requiring real exploitation and a professional report
c) It is multiple choice
d) It does not expire

::: details Answer
b) OSCP requires exploiting machines in a 24-hour practical exam and submitting a professional penetration test report. This format proves real-world skills, unlike multiple-choice exams.
:::

**2. What is the minimum experience recommended for CISSP?**

a) No experience required
b) 2 years in IT
c) 5 years in 2+ of 8 security domains (or 4 years + degree)
d) 10 years in cybersecurity

::: details Answer
c) CISSP requires 5 years of cumulative paid work experience in two or more of the eight CISSP domains. A four-year degree or approved credential can substitute for one year.
:::

**3. Which certification path provides the best ROI for a career in SOC/blue team?**

a) CEH then CISSP
b) Security+ then CySA+ then BTL1
c) eJPT then OSCP
d) AWS Security then CCSP

::: details Answer
b) Security+ provides the foundation, CySA+ validates blue team analysis skills, and BTL1 proves practical incident response and detection capabilities — a focused blue team career path.
:::

**4. What is the OSCP passing score?**

a) 70/100 points
b) 750/900 points
c) 85% on multiple choice
d) 50/100 points

::: details Answer
a) OSCP requires 70 out of 100 points. The exam consists of an AD set (40 points), three standalone machines (20 points each), and up to 10 bonus points from lab exercises.
:::

**5. Why are SANS/GIAC certifications expensive compared to OffSec certifications?**

a) They are more prestigious
b) The price includes a week-long intensive training course (~$8,500 total)
c) They are harder
d) They include free retakes

::: details Answer
b) SANS certifications bundle a week-long intensive training course with the exam. The ~$8,500 price covers both the training and the GIAC exam. OffSec provides self-paced materials at a lower price point.
:::
:::

> **One-Liner Summary:** Certifications prove what you know, but labs and CTFs build what you can do — the best professionals have both.
