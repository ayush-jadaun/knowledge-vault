---
title: "Accessibility Prompts: 25+ Prompts for WCAG Compliance and Inclusive Design"
description: "Comprehensive prompt collection for auditing, implementing, and testing accessibility across web applications and design systems"
tags: [prompt-engineering, accessibility, wcag, aria, a11y, inclusive-design]
difficulty: "intermediate"
prerequisites: [design-system-prompts]
lastReviewed: "2026-03-18"
---

# Accessibility Prompts: 25+ Prompts for WCAG Compliance and Inclusive Design

## Overview

Accessibility (a11y) is both a legal requirement and an ethical responsibility. AI assistants can dramatically accelerate accessibility work — from auditing existing code to generating accessible patterns from scratch, writing ARIA attribute configurations, and creating inclusive user flows.

This collection covers the full spectrum of accessibility work: WCAG compliance auditing, keyboard navigation implementation, screen reader optimization, color contrast analysis, and building inclusive experiences for users with disabilities.

## WCAG Audit Prompts

### 1. Comprehensive WCAG 2.1 AA Audit

```
Audit the following code/component for WCAG 2.1 Level AA compliance.

[paste component code or describe interface]

Check all four WCAG principles:

**Perceivable**
- 1.1.1 Non-text Content: Do all images have appropriate alt text?
- 1.3.1 Info and Relationships: Is structure conveyed through markup, not just visual?
- 1.3.3 Sensory Characteristics: Instructions don't rely on shape/color/position alone?
- 1.4.1 Use of Color: Color not the sole means of conveying info?
- 1.4.3 Contrast (Minimum): 4.5:1 for normal text, 3:1 for large text?
- 1.4.4 Resize Text: Text resizes to 200% without loss of content?
- 1.4.11 Non-text Contrast: UI components have 3:1 contrast against background?

**Operable**
- 2.1.1 Keyboard: All functionality available without a mouse?
- 2.1.2 No Keyboard Trap: Keyboard focus can move away from any component?
- 2.4.3 Focus Order: Focus order is logical and meaningful?
- 2.4.4 Link Purpose: Is the purpose of each link clear from its text or context?
- 2.4.7 Focus Visible: Keyboard focus is always visible?

**Understandable**
- 3.1.1 Language of Page: HTML lang attribute set correctly?
- 3.2.1 On Focus: Receiving focus doesn't cause unexpected context change?
- 3.3.1 Error Identification: Errors are identified and described to users?
- 3.3.2 Labels or Instructions: Labels or instructions provided for user input?

**Robust**
- 4.1.1 Parsing: Valid HTML markup?
- 4.1.2 Name, Role, Value: All UI components have correct name, role, and state?
- 4.1.3 Status Messages: Status messages programmatically determinable?

For each failure: criterion | severity (critical/serious/moderate/minor) | fix.
```

### 2. Screen Reader Experience Audit

```
Evaluate this interface for screen reader experience quality.

[paste code or describe the interface]

Test with all major screen readers in mind: NVDA+Firefox, JAWS+Chrome, VoiceOver+Safari.

Assess:
1. **Reading order**: Does the DOM order match the visual/logical order?
2. **Headings hierarchy**: Is there a logical h1→h2→h3 structure for navigation?
3. **Landmark regions**: Are main, nav, header, footer, aside regions used appropriately?
4. **Form labels**: Every input has an associated label? Error messages linked to inputs?
5. **Button text**: Are buttons named by their action, not their icon?
6. **Link text**: "Click here" and "Read more" are problematic — are links descriptive?
7. **Image alt text**: Appropriate for context (empty for decorative, descriptive for informational)?
8. **Dynamic content**: Is live content announced? Are modal focus traps correct?
9. **Tables**: Do data tables have headers, scope, and caption?
10. **Custom widgets**: Are custom components using correct ARIA roles and states?

Provide: A "what a screen reader user would experience" walkthrough, and fixes for each issue.
```

### 3. Color Contrast Analysis

```
Analyze the color contrast in this design for WCAG compliance.

Colors used:
[list foreground/background color pairs as: #FFFFFF on #1A1A2E]

For each combination, calculate and report:
1. Contrast ratio (to 2 decimal places)
2. WCAG AA pass/fail for:
   - Normal text (<18pt / <14pt bold): 4.5:1 required
   - Large text (≥18pt or ≥14pt bold): 3:1 required
   - UI components and graphics: 3:1 required
3. WCAG AAA pass/fail: 7:1 for text, 4.5:1 for large text
4. Recommended alternative if failing (darker/lighter variant that passes)

Also flag:
- Any text-on-image combinations (require additional analysis)
- Placeholder text (often fails — 40% opacity grey on white = ~2:1)
- Disabled state text (may be exempt from contrast requirements with UX consideration)
```

## ARIA Implementation Prompts

### 4. Complete ARIA Pattern Library

```
Generate correct ARIA implementations for these interactive widget patterns:

1. **Modal Dialog**
   - role="dialog" with aria-modal="true"
   - aria-labelledby and aria-describedby
   - Focus trap: Tab/Shift+Tab within modal
   - Close on Escape
   - Return focus to trigger on close

2. **Tabs**
   - role="tablist", role="tab", role="tabpanel"
   - aria-selected, aria-controls, aria-labelledby
   - Arrow key navigation between tabs
   - Home/End keys

3. **Dropdown Menu**
   - role="menu", role="menuitem"
   - aria-haspopup, aria-expanded
   - Arrow key navigation
   - Close on Escape/Tab

4. **Combobox (Autocomplete)**
   - role="combobox" + role="listbox" + role="option"
   - aria-autocomplete, aria-expanded, aria-controls
   - aria-activedescendant for visual-focus vs actual focus

5. **Accordion**
   - button with aria-expanded, aria-controls
   - section or div with id matching controls

For each: React TypeScript implementation with all ARIA attributes, keyboard handlers, and useRef for focus management.
```

### 5. Live Region Configuration

```
I need to implement ARIA live regions for these dynamic content scenarios:

Scenarios:
1. Form validation errors that appear after submission
2. Toast/notification messages
3. Search results count updating as user types
4. Loading spinner with status
5. Shopping cart count updating
6. Chat messages arriving
7. Autocomplete suggestions updating
8. Step-by-step progress updates

For each scenario, specify:
- aria-live value: off | polite | assertive (with reasoning)
- aria-atomic value and why
- aria-relevant value if needed
- Container placement in DOM (matters for some screen readers)
- When to announce vs. not announce
- React implementation with useEffect for triggering announcements

Common pitfall: don't add aria-live dynamically — it must be in DOM before content changes.
```

### 6. Focus Management System

```
Design a comprehensive focus management system for a React single-page application.

Handle these scenarios:
1. **Route navigation**: Where should focus go when navigating between pages?
2. **Modal open/close**: Trap focus in modal, return to trigger on close
3. **Toast notifications**: Should they receive focus?
4. **In-page navigation**: Skip links, scroll-to behavior
5. **Dynamic content**: New content loaded after user action
6. **Errors**: Focus moves to first error after form submission failure
7. **Drawer/sidebar open**: Focus moves into drawer
8. **Wizard/stepper**: Focus management between steps

Provide:
- useFocusManagement hook
- useFocusTrap hook for modals/drawers
- useAnnounce hook for live region announcements
- useFocusReturn hook for returning focus after modal close
- TypeScript implementation
- Example of each hook in use
```

## Keyboard Navigation Prompts

### 7. Keyboard Navigation Specification

```
Write the complete keyboard navigation specification for [component/page].

[describe the UI]

Format as:
| Key | Context | Action | Notes |
|-----|---------|--------|-------|
| Tab | Anywhere | Move to next focusable element | Should skip disabled elements |
| ...  | ... | ... | ... |

Cover all standard keyboard interactions:
- Tab / Shift+Tab: Forward/backward focus
- Enter / Space: Activate (context-dependent)
- Arrow keys: Navigation within composite widgets
- Escape: Close/cancel/return to parent
- Home / End: Jump to first/last in a group
- Page Up / Page Down: Scroll-sized jumps in long lists

Also document:
- Focus order (which elements are in the tab sequence and in what order)
- Focus indicators (describe how focus is visible)
- Custom keyboard shortcuts (if any, must not conflict with AT shortcuts)
```

### 8. Accessible Form Validation

```
Implement fully accessible form validation for this form:

[paste form code or describe form fields]

Requirements:
1. **Error announcement**: Errors announced to screen readers immediately after submit
2. **Error association**: Each error message linked to its input via aria-describedby
3. **Error styling**: Not relying on color alone (icon + text + border)
4. **Focus on error**: Focus moves to first error on submit failure
5. **Inline validation**: Real-time validation on blur (not on keypress — too disruptive)
6. **Required fields**: aria-required="true" on required inputs + visual indicator
7. **Error message format**: "Field name is required" not just "Required"
8. **Recovery**: Error clears when user corrects the value
9. **Success**: Accessible success indication after successful submit

Provide:
- React hook: useAccessibleForm with validation logic
- Error announcement component (aria-live region)
- Complete implementation TypeScript
- Example for: text input, select, checkbox group, radio group
```

## Content and Copy Prompts

### 9. Accessible Alt Text Guide

```
I have a set of images. Provide correct alt text for each image type and use case:

Image types to cover:
1. **Decorative images**: Images that are purely aesthetic
2. **Functional images**: Images that are buttons or links
3. **Informative images**: Images that convey information not in surrounding text
4. **Text images**: Images containing text
5. **Complex images**: Charts, graphs, diagrams
6. **Thumbnail images**: Link to larger version
7. **Repeated images**: Same image used multiple times on page

For each:
- When to use: `alt=""` (empty, for decorative)
- When to use: `aria-label` (for SVGs, CSS background images)
- When to use: `aria-labelledby` (referencing visible caption)
- When to use: `role="img"` + `aria-label` (for SVG)
- When to use: `longdesc` or adjacent description (complex images)

Also: critique these specific image descriptions: [paste examples]
```

### 10. Accessible Error Message Copy

```
Rewrite these error messages to be accessible and user-friendly:

Current error messages:
[paste error messages]

Rules for accessible error messages:
1. Identify the field: "Email address is required" not "Required"
2. Explain what happened: "Email address is invalid" not "Invalid"
3. Tell them how to fix it: "Enter a valid email address (example: you@domain.com)"
4. Be specific: "Password must be at least 8 characters" not "Password too short"
5. No jargon: "This field cannot be empty" not "null value not allowed"
6. No blame: "Please enter..." not "You forgot to enter..."
7. Pattern: "[field name] [what's wrong]. [how to fix]"

Also flag:
- Error messages that are unclear even after rewriting (need UX rethinking)
- Missing error messages for form fields that need them
```

## Assistive Technology Testing Prompts

### 11. Screen Reader Testing Protocol

```
Create a comprehensive screen reader testing protocol for [application/feature].

Test environment matrix:
- NVDA 2024 + Firefox (Windows, most common screen reader)
- JAWS 2024 + Chrome (enterprise, financial sector)
- VoiceOver + Safari (Mac/iOS, all Apple users)
- TalkBack + Chrome (Android)

For each environment, test:
1. **Navigation**: Can users navigate using headings, landmarks, links?
2. **Form completion**: Can users complete all forms?
3. **Error recovery**: Do error messages get announced?
4. **Custom widgets**: Do ARIA widgets (menus, modals, tabs) work correctly?
5. **Dynamic content**: Are updates announced?
6. **Images**: Are all meaningful images described?

Also provide:
- Setup instructions for each screen reader
- Common NVDA commands for testing
- Common VoiceOver commands for testing
- Bug report template specific to screen reader issues
- How to report screen reader vs. ARIA vs. browser bugs
```

### 12. Automated Accessibility Testing Setup

```
Set up automated accessibility testing for a React application.

Tools to integrate:
1. **jest-axe**: Component-level accessibility tests in unit tests
2. **Playwright + axe-core**: Page-level accessibility tests in E2E tests
3. **Storybook a11y addon**: Visual accessibility checks during development
4. **ESLint jsx-a11y**: Lint-time accessibility checks

Provide:
- Installation and configuration for each tool
- jest-axe example test for a form component
- Playwright test with axe-core for a full page
- Storybook a11y addon configuration
- ESLint .eslintrc configuration for jsx-a11y
- CI/CD integration (GitHub Actions)
- How to interpret and triage violations
- What automated tests can't catch (manual testing requirements)
```

## Motor Accessibility Prompts

### 13. Touch Target Size Audit

```
Audit this interface for touch target accessibility.

[describe or paste code for the interface]

Requirements:
- WCAG 2.5.5 Target Size: 44x44px minimum (Level AA)
- WCAG 2.5.8 Target Size (Minimum): 24x24px (Level AA in WCAG 2.2)
- Apple HIG: 44x44pt minimum
- Material Design: 48x48dp minimum

Identify:
1. All interactive elements smaller than 44x44px
2. Interactive elements too close together (< 8px between targets)
3. Hit area vs visual size mismatch (button appears small but hit area is large)
4. On mobile: are any elements reachable with one hand at the top of the screen?

Fixes to provide:
- How to extend hit area without changing visual size (padding, pseudo-elements)
- Responsive touch targets (larger on mobile, normal on desktop)
- Implementation in CSS and React
```

### 14. Reduced Motion Implementation

```
Implement prefers-reduced-motion support throughout this application.

[describe or paste animated components]

Affected animation types to handle:
1. **CSS transitions**: Fade, slide, scale on hover/focus
2. **CSS animations**: Loading spinners, pulsing indicators, carousels
3. **JavaScript animations**: GSAP, Framer Motion, custom requestAnimationFrame
4. **Video**: Auto-playing video or animated GIFs

Implementation approach:
- CSS: `@media (prefers-reduced-motion: reduce)` — remove or reduce animations
- React hook: useReducedMotion() — disable JS animations
- Framer Motion: `useReducedMotion()` built-in
- For loading indicators: replace spinning animation with static indicator or progress bar

Rules:
- Never remove animation entirely if it conveys status (replace with equivalent)
- Preserve animations that don't trigger vestibular disorders (color changes, opacity)
- Remove: spinning, bouncing, flashing, parallax, large-scale movement

Provide TypeScript implementation for React with CSS-in-JS and plain CSS examples.
```

## Cognitive Accessibility Prompts

### 15. Cognitive Accessibility Review

```
Review this interface for cognitive accessibility.

[describe or paste interface]

WCAG 2.1 and COGA (Cognitive Accessibility) guidelines to check:

**Clarity**
- 3.3.2 Labels or Instructions: Are form fields clearly labeled?
- Are error messages clear and actionable?
- Is the reading level appropriate? (target: 8th grade or lower for general audience)

**Consistency**
- 3.2.3 Consistent Navigation: Navigation in same place on every page?
- 3.2.4 Consistent Identification: Same components look and behave the same way?
- Are icon meanings consistent throughout?

**Forgiveness**
- 3.3.4 Error Prevention: Is data recoverable? Confirmations before irreversible actions?
- Can users undo actions?
- Is user data preserved if the browser is accidentally closed?

**Simplicity**
- Is there unnecessary information on the page? (cognitive load)
- Are there too many options? (decision fatigue)
- Are instructions in plain language?

Also provide:
- Readability score calculation method
- Examples of simplified copy for any complex text found
```

### 16. Plain Language Rewrite

```
Rewrite this UI copy in plain language accessible to users with cognitive disabilities.

Original copy:
[paste UI text, error messages, instructions, labels]

Plain language principles to apply:
1. Active voice instead of passive
2. Short sentences (target: under 20 words)
3. Common words instead of technical jargon
4. Positive framing ("do X" not "don't do Y")
5. One idea per sentence
6. Concrete and specific over abstract
7. Consistent terminology (pick one word and use it throughout)

Also consider:
- Add plain language summary for complex processes
- Replace jargon with accessible equivalents
- Identify terms that need tooltips or glossary links for clarification

Target reading level: [Flesch-Kincaid Grade 6-8 for consumer, Grade 10-12 for professional]
```

## Advanced Accessibility Prompts

### 17. Accessible Data Visualization

```
Make this data visualization accessible to screen reader users.

[describe or paste chart/graph code]

Approach:
1. **Text alternative**: Provide a data table as an alternative to the chart
2. **Chart title and description**: Use aria-label or aria-labelledby for the SVG
3. **Data point narration**: Each data point navigable by keyboard with value
4. **Color independence**: Don't rely on color alone for data series
5. **Pattern fills**: Use different patterns for colorblind users
6. **Summary**: Provide key insights as text (not just visual)

For this specific chart type ([line/bar/pie/scatter]):
- ARIA structure for the SVG
- Keyboard navigation between data points
- VoiceOver/NVDA reading order
- React implementation with proper accessibility attributes

Also: provide accessible color palette recommendations for data visualization.
```

### 18. Accessibility for SPAs and React Router

```
Implement proper accessibility for React Router-based single-page application navigation.

Problems to solve:
1. **Focus management on route change**: Browser doesn't manage focus in SPA; user is stranded at last focused element
2. **Page title updates**: document.title must update per route for screen reader users
3. **Loading state**: Screen reader users need to know page is loading
4. **Scroll restoration**: Screen reader users expect to be at page top after navigation
5. **Skip links**: "Skip to main content" link that works with SPA routing

Provide:
- useRouteAccessibility hook that handles all of the above
- Integration with React Router v6
- Page-level focus management strategy
- Dynamic document title component
- Live region for announcing route changes
- Skip link component that works with SPA navigation
```

### 19. Mobile Accessibility Testing

```
Create a mobile accessibility testing plan for [app description].

iOS + VoiceOver:
- Swipe navigation
- Double-tap to activate
- Three-finger swipe for scroll
- Custom rotor items (headings, links, form controls)
- Magic Tap and other gestures
- Large text and Dynamic Type support

Android + TalkBack:
- Linear navigation
- Tap to focus, double-tap to activate
- Two-finger scroll
- Reading controls
- Switch access compatibility

Test cases to cover:
[list key user journeys]

For each user journey:
- Can VoiceOver/TalkBack users complete the task?
- Are all interactive elements reachable?
- Is content logical in linear reading order?
- Are all images described?
- Do custom gestures have accessible alternatives?

Provide: Testing checklist, common VoiceOver and TalkBack commands reference card.
```

### 20. ARIA Anti-Patterns

```
Identify and fix ARIA anti-patterns in this code:

[paste code]

Common ARIA anti-patterns to check:
1. **Role redundancy**: role="button" on a <button> (redundant)
2. **Broken patterns**: aria-expanded without managing the expanded element
3. **Misleading roles**: div with role="list" but children aren't role="listitem"
4. **Orphaned ARIA**: aria-labelledby pointing to non-existent id
5. **Conflicting roles**: Interactive element inside another interactive element
6. **Hiding visible content**: aria-hidden="true" on visible, meaningful content
7. **Exposing hidden content**: aria-hidden="false" doesn't work as expected
8. **Overriding native semantics**: button role on anchor destroys navigation semantics
9. **Using aria-label on non-interactive elements**: Meaningless and confusing
10. **Missing required ARIA**: tabpanel without aria-labelledby

For each anti-pattern found: explain why it's wrong and provide the correct implementation.
```

### 21. Accessible PDF and Document Generation

```
Our application generates documents (PDFs, Word files). Make them accessible.

Document types: [describe what you generate]

PDF Accessibility:
1. Tagged PDF structure (heading tags, paragraph tags, list tags)
2. Reading order defined in Tags panel
3. Alternative text for all images
4. Table headers and structure
5. Form fields: labels, tab order, required fields
6. Language settings
7. Title in document properties
8. Bookmarks for long documents

Implementation:
- If using [pdfmake / react-pdf / puppeteer / wkhtmltopdf / other]: provide specific config
- PDF/UA compliance checklist
- Testing with PAC 2024 (PDF Accessibility Checker)
- Remediation workflow for PDF accessibility issues

Also consider: offer HTML as an accessible alternative to PDF for screen-reader users.
```

### 22. Accessible Date Picker

```
Implement a fully accessible date picker component.

This is notoriously complex. Requirements:

Keyboard interaction:
- Tab: Move to/from the date picker
- Enter/Space: Open calendar
- Arrow keys: Navigate days
- Page Up/Down: Previous/next month
- Shift+Page Up/Down: Previous/next year
- Home/End: First/last day of week
- Escape: Close without selection

ARIA:
- role="dialog" for calendar popup
- aria-label for calendar grid ("Choose date")
- role="grid" for the month table
- role="gridcell" + aria-selected for days
- aria-disabled for unavailable dates
- aria-current="date" for today
- Live region announcing month/year on navigation

Additional:
- Type-in date format (keyboard users shouldn't need to navigate calendar)
- Clear date option
- Min/max date constraints
- Accessible today button

Provide: Full React TypeScript implementation. Test cases for keyboard navigation.
```

### 23. Accessibility Statement Generator

```
Generate an accessibility statement for [product/website name].

Organization: [Name]
WCAG conformance level claimed: [A / AA / AAA]
Date last reviewed: [Date]

Statement should include:
1. **Commitment**: Organization's commitment to accessibility
2. **Conformance status**: Full / partial / non-conformance with WCAG level
3. **Known issues**: Any known accessibility limitations with workarounds
4. **Technologies relied upon**: HTML, WAI-ARIA, CSS, JavaScript
5. **Assessment approach**: How you assessed accessibility (self-evaluation, external audit)
6. **Feedback mechanism**: How users can report accessibility issues
7. **Enforcement procedure**: Escalation path if response is unsatisfactory
8. **Formal complaints**: Relevant regulatory body (ADA, EN 301 549, etc.)

Also include:
- Contact information for accessibility help
- Alternative access methods if available
- Timeline for fixing known issues

Format: Appropriate for a public webpage. Plain language, not legal jargon.
```

### 24. Video and Media Accessibility

```
Define accessibility requirements for video and audio content.

Content types:
1. Instructional videos
2. Marketing videos
3. Live webinars
4. Podcasts
5. Animated demos/GIFs

Requirements per type:
**Captions**
- Closed captions for pre-recorded audio (WCAG 1.2.2)
- Live captions for live audio (WCAG 1.2.4)
- Caption quality requirements (timing, accuracy, speaker identification)
- Format: WebVTT vs SRT, styling

**Audio Descriptions**
- When required (visual content not conveyed in audio track)
- Extended audio description (pausing video)
- Implementation with video players

**Transcripts**
- Full transcript requirements
- Format (HTML, downloadable)
- Searchability

**Player Controls**
- All player controls keyboard accessible
- Play/pause, volume, captions toggle
- Custom player vs. native controls

Also: tool recommendations for caption generation (AI + human review workflow).
```

### 25. Accessibility Regression Testing

```
Design an accessibility regression testing process to prevent regressions.

Problem: Accessibility fixes get undone by future code changes.

Strategy:

1. **Automated regression tests**
   - jest-axe tests for component behavior
   - Playwright with axe for E2E critical paths
   - Visual regression for focus indicators
   - When each runs in CI/CD pipeline

2. **Manual regression checklist**
   - Keyboard navigation smoke test (5 minutes)
   - Screen reader smoke test (10 minutes)
   - Touch device smoke test (5 minutes)
   - Run before: major releases, design system updates, UI redesigns

3. **Code review requirements**
   - ESLint jsx-a11y as PR requirement
   - Accessibility review for: new components, form changes, modal/dialog changes
   - PR template checklist for accessibility

4. **Monitoring in production**
   - Sentry integration for accessibility errors
   - User feedback channel for accessibility issues
   - Periodic manual audits (quarterly)

Provide: GitHub Actions workflow, PR template additions, and team process documentation.
```

## Prompt Engineering Best Practices for Accessibility

### Getting Accurate ARIA Guidance

AI models sometimes generate incorrect ARIA patterns. Always verify with:
- The WAI-ARIA Authoring Practices Guide (APG) at w3.org
- Testing with actual assistive technology
- The ARIA spec at w3.org/TR/wai-aria-1.2

Cross-check generated patterns with:

```
I generated this ARIA implementation: [paste code]

Verify against WAI-ARIA APG patterns. Does it match the recommended:
- Role usage
- Required/supported attributes
- Keyboard interactions
- Focus management

Point out any deviations and whether they're intentional improvements or errors.
```

### Legal Compliance Context

When using these prompts for legal compliance work (ADA, EN 301 549, Section 508), add:

```
This is for legal compliance purposes (ADA Title III / EN 301 549 / Section 508).
Please be precise and cite the specific WCAG criterion for each issue.
Do not speculate — if you're uncertain, say so.
```

::: warning
AI-generated accessibility guidance should always be validated by a human expert and tested with actual assistive technologies. Automated tools catch only ~30-40% of accessibility issues. Manual testing by screen reader users is irreplaceable.
:::
