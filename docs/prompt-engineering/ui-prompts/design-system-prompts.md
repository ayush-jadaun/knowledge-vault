---
title: "Design System Prompts: 25+ Production-Ready Prompts"
description: "Comprehensive collection of prompts for generating, extending, and auditing design systems with AI assistance"
tags: [prompt-engineering, design-systems, ui, components, tokens]
difficulty: "intermediate"
prerequisites: []
lastReviewed: "2026-03-18"
---

# Design System Prompts: 25+ Production-Ready Prompts

## Overview

Design systems are complex engineering artifacts that span tokens, components, documentation, tooling, and governance. AI assistants can dramatically accelerate design system work — from generating initial tokens to auditing consistency, writing Storybook stories, and creating migration guides.

This collection provides battle-tested prompts for every phase of design system work. Each prompt includes the context needed to produce high-quality, actionable output.

## Token Generation Prompts

### 1. Generate Complete Design Token Set

```
You are a design systems engineer. Generate a complete design token system for a [B2B SaaS / consumer app / internal tool] product.

Requirements:
- Color tokens: semantic (primary, secondary, success, warning, error, info) + neutral scale (50-950)
- Typography: font families, sizes (xs through 4xl), weights, line heights, letter spacing
- Spacing: 4px base grid, t-shirt sizes (xs through 3xl) + raw scale (1-16)
- Border radius: none, sm, md, lg, full
- Shadow: sm, md, lg, xl
- Animation: duration (fast, normal, slow), easing curves
- Z-index: layered named values (below, base, raised, overlay, modal, toast)

Output as:
1. CSS custom properties (--token-name: value)
2. JavaScript/TypeScript object for styled-components/emotion
3. Figma token JSON format

Brand: [describe brand or paste brand colors]
Mode: Include both light and dark mode tokens.
```

### 2. Semantic Color Token Expansion

```
Given this base brand palette:
- Primary: #[hex]
- Secondary: #[hex]
- Neutral base: #[hex]

Generate semantic color tokens following these principles:
1. Each semantic token maps to a concrete color from the palette
2. All text-on-background combinations must meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text)
3. Interactive states: default, hover, active, disabled, focus
4. Surface tokens: background, surface-1, surface-2, surface-3 (for depth layering)
5. Border tokens: subtle, default, strong

For each token, provide:
- Token name (kebab-case)
- Light mode value
- Dark mode value
- Contrast ratio with appropriate text color

Flag any combinations that fail WCAG contrast requirements.
```

### 3. Typography Scale Generation

```
Generate a modular typography scale for a design system.

Base size: 16px
Scale ratio: 1.25 (Major Third) [or specify: 1.333 Perfect Fourth, 1.618 Golden Ratio]
Font families: [specify or use system stack]

Output:
1. Size scale (xs: Npx through display: Npx) with rem values
2. Recommended line heights per size (tighter for large, looser for small)
3. Font weight tokens (light: 300, regular: 400, medium: 500, semibold: 600, bold: 700)
4. Letter-spacing scale (tight, normal, wide, wider)
5. CSS custom property definitions
6. TypeScript type definitions for all tokens

Also provide: recommended heading hierarchy (h1-h6 mapped to scale) and body text recommendation.
```

## Component Generation Prompts

### 4. Generate Component Specification

```
Generate a complete component specification for a [component name] component.

Include:
1. **Purpose**: Single sentence description and use cases
2. **Variants**: List all variants with descriptions (e.g., Button: primary, secondary, ghost, destructive)
3. **Sizes**: All supported sizes with token references
4. **States**: Default, hover, focus, active, disabled, loading (where applicable)
5. **Props API**: TypeScript interface with JSDoc comments for every prop
6. **Accessibility**: ARIA roles, attributes, keyboard interactions, screen reader behavior
7. **Do/Don't**: 3 examples each with explanations
8. **Related components**: What components it composes or is composed by

Target: React with TypeScript. Use design tokens from the system (refer to tokens as design-system token names).
```

### 5. Generate Production React Component

```
Create a production-ready [component name] component in React with TypeScript.

Requirements:
- TypeScript strict mode compatible
- Forward ref support (React.forwardRef)
- Polymorphic `as` prop support for semantic HTML flexibility
- CSS-in-JS with styled-components v6 / Tailwind CSS / CSS modules [choose one]
- All interactive states styled (hover, focus, active, disabled)
- ARIA attributes for accessibility
- Keyboard navigation support
- Dark mode via CSS custom properties
- Exported TypeScript types for all props

Component should support:
[List specific variants, sizes, or behaviors needed]

Do not use:
- Any inline styles
- Non-semantic HTML
- onClick handlers that aren't also keyboard accessible
- Hard-coded colors (use design tokens)
```

### 6. Storybook Stories Generation

```
Generate complete Storybook 7+ stories for [component name].

For each story:
- Use CSF3 format (const Story: StoryObj<typeof Component>)
- Include `args` with all relevant props
- Include `argTypes` for interactive controls
- Include `play` functions for interaction testing where appropriate

Stories to generate:
1. Default — basic usage
2. All variants — one story per variant
3. All sizes — one story per size
4. States — disabled, loading, error states
5. Edge cases — very long text, empty states, max content
6. Dark mode — using Storybook's dark mode addon
7. Interactive — with play function demonstrating the component

Also generate: component-level meta with tags, title, and parameter configuration.
```

### 7. Component Accessibility Audit

```
Audit this React component for accessibility issues and provide fixes:

[paste component code]

Check for:
1. **ARIA**: Missing roles, incorrect role usage, improper aria-label vs aria-labelledby
2. **Keyboard**: Tab order, focus management, keyboard shortcuts (Enter, Space, Escape, Arrow keys)
3. **Screen readers**: Hidden content that should be read, visible content that shouldn't be read
4. **Color**: Issues that need non-color indicators
5. **Focus visible**: Is focus clearly visible?
6. **Touch targets**: Are interactive elements at least 44x44px?
7. **Reduced motion**: Does it respect prefers-reduced-motion?

For each issue, provide:
- Issue description
- WCAG criterion violated
- Fixed code snippet
- Explanation of why the fix is correct
```

## Design Token Audit Prompts

### 8. Token Usage Audit

```
Analyze this codebase [or paste files] and identify:

1. **Hard-coded values**: Colors (#hex, rgb, hsl), spacing (px, rem), font sizes — values that should be design tokens
2. **Token violations**: Tokens used in contexts they're not designed for
3. **Missing tokens**: Patterns that repeat but have no token
4. **Inconsistencies**: Same visual property achieved with different values

Output as:
- Summary table: Category | Count | Examples
- Detailed findings: File | Line | Current value | Recommended token
- Priority: P0 (accessibility/brand violation), P1 (consistency), P2 (nice to have)

Files to analyze:
[paste or describe files]
```

### 9. Dark Mode Token Migration

```
Given this design token set that only has light mode values:

[paste existing tokens]

Generate a complete dark mode migration:
1. Dark mode equivalents for every token using appropriate inversion principles:
   - Surface colors: invert the lightness scale
   - Semantic colors (success, error, warning): adjust for dark background contrast
   - Text colors: inverse hierarchy
   - Shadows: reduce opacity, may use glow effects

2. Implementation using CSS custom properties with `@media (prefers-color-scheme: dark)` AND `.dark` class selector for manual toggle support

3. Migration guide: How to update existing components that use the old single-mode tokens

Flag: Any tokens where dark mode isn't a simple inversion (e.g., elevation shadows work differently in dark mode).
```

## Tooling and Process Prompts

### 10. Design Token Pipeline Setup

```
Design a design token pipeline for a team using Figma as the source of truth.

Requirements:
- Figma Variables/Tokens → Code (automated export)
- Support: CSS custom properties, JS/TS objects, Tailwind config
- CI check: PR fails if tokens drift from Figma
- Versioning: tokens have semver, breaking changes are flagged
- Multi-brand: support white-labeling for [N] brands

Provide:
1. Tool recommendations with reasoning (Style Dictionary, Token Transformer, etc.)
2. Directory structure for tokens repo
3. Build pipeline configuration
4. GitHub Actions workflow
5. Style Dictionary config file
6. Versioning strategy for breaking vs. non-breaking token changes
```

### 11. Component Documentation Generator

```
Generate documentation for [component name] component in MDX format.

Documentation should include:
1. Overview and when to use (vs. when not to use)
2. Live examples using Storybook-embeds or code playgrounds
3. API reference table (prop | type | default | description)
4. Accessibility notes
5. Keyboard interactions table
6. Design guidelines (layout, spacing, content rules)
7. Code examples for every variant
8. Migration guide from [old component/version] if applicable

Target: Storybook MDX format compatible with Storybook 7+

Tone: Technical but approachable. Assume readers are developers who know React but may not know design system internals.
```

### 12. Breaking Change Analysis

```
Analyze this component API change for breaking changes and generate a migration guide:

Previous API:
[paste old TypeScript interface]

New API:
[paste new TypeScript interface]

Provide:
1. **Breaking changes**: Props removed, renamed, or with changed types
2. **Deprecations**: Props that are deprecated (still work but will be removed)
3. **New features**: New props or behaviors
4. **Codemod**: Write a jscodeshift codemod to automatically migrate the breaking changes
5. **Migration guide**: Human-readable step-by-step migration guide with before/after examples
6. **Semver recommendation**: Should this be a major, minor, or patch version bump?
```

## Component Library Architecture Prompts

### 13. Compound Component Pattern

```
Refactor this [component name] from a monolithic props API to a compound component pattern.

Current implementation:
[paste current component]

Requirements for compound component version:
- Context-based state sharing between subcomponents
- Flexible composition — subcomponents can be reordered or omitted
- TypeScript: all subcomponents correctly typed
- Accessibility: compound component maintains correct ARIA relationships
- Backward compatibility: old API still works (via adapter or wrapper)

Example usage after refactor:
[Show how you want the component to be used]

Provide: TypeScript implementation + migration notes.
```

### 14. Design System Governance Rules

```
Write a design system contribution guide and governance model for a [size: small startup / mid-size company / enterprise] engineering team.

Include:
1. **Request process**: How teams propose new components or tokens
2. **Acceptance criteria**: What makes a component ready for the design system vs. local
3. **Review process**: Who reviews, what they check, how long it takes
4. **Versioning policy**: When to cut versions, how to communicate changes
5. **Deprecation policy**: How long deprecated components stay, how teams are notified
6. **Quality gates**: Required tests, accessibility audit, design review, performance budget
7. **Ownership model**: Who owns the design system and what that means day-to-day

Also write:
- PR template for component contributions
- Issue template for component requests
- Definition of Done checklist
```

### 15. Performance Budget for Components

```
Define and implement a performance budget for a React component library.

Components to budget: [list or describe your components]
Target: Core Web Vitals (LCP, CLS, FID/INP)

Generate:
1. Bundle size budget per component (in KB, gzipped)
2. Render performance targets (initial render, re-render)
3. Automated size-limit configuration (size-limit npm package)
4. Bundlewatch configuration for CI
5. Webpack bundle analyzer setup
6. Performance regression detection in CI/CD

Also: Identify which components are likely to cause CLS (Cumulative Layout Shift) and how to prevent it (skeleton screens, reserved space, etc.)
```

## Design Review and Critique Prompts

### 16. Component Review Checklist

```
Review this design system component and provide structured feedback:

[paste component code and/or design screenshots]

Evaluate against:
**Functionality**
- Does it handle all specified use cases?
- Edge cases: empty states, long content, dynamic content
- Error states properly handled?

**API Design**
- Is the props API intuitive?
- Are prop names consistent with the rest of the system?
- Is there unnecessary complexity?

**Accessibility**
- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader support

**Performance**
- Unnecessary re-renders?
- Heavy dependencies?
- Bundle size impact?

**Consistency**
- Aligns with existing patterns?
- Uses design tokens correctly?
- Naming consistent with component library?

Rate each area 1-5 and provide specific, actionable feedback.
```

### 17. Cross-Component Consistency Audit

```
Audit these components for consistency issues:

[paste or describe multiple components]

Check for:
1. **Naming inconsistencies**: Props named differently across components for same concept (e.g., `onClick` vs `onPress` vs `handleClick`)
2. **Spacing inconsistencies**: Different padding/margin values for visually similar elements
3. **Color inconsistencies**: Same semantic color used with different tokens
4. **Pattern inconsistencies**: Different implementations of same pattern (e.g., loading states)
5. **API inconsistencies**: Different approaches to common patterns (controlled vs uncontrolled)

Output:
- Inconsistency inventory table
- Recommended standardization
- Migration effort estimate for each
```

## Advanced Design System Prompts

### 18. Multi-Brand Theming System

```
Design a multi-brand theming system that allows one component library to support [N] distinct brands.

Brand requirements:
- Brand A: [describe colors, typography, border radius style]
- Brand B: [describe]
- Shared: [what's the same across all brands]

Design the system so that:
1. Brands share component behavior and structure
2. Brands can independently override any visual token
3. Adding a new brand requires only a new theme file (no component changes)
4. TypeScript enforces all required tokens are provided per brand

Provide:
- Theme interface TypeScript definition
- ThemeProvider implementation
- Example theme for Brand A
- How to implement in React (Context-based)
- How to implement with CSS custom properties
- Testing strategy for multi-brand visual regression
```

### 19. Icon System Design

```
Design a scalable icon system for a design system.

Requirements:
- Source: SVG files optimized with SVGO
- Output: React components, web font (optional), sprite sheet
- Sizes: 16, 20, 24, 32px (configurable via size prop)
- Color: inherits from currentColor by default
- Accessibility: aria-label and role="img" when semantic, aria-hidden when decorative
- Tree-shakeable: only icons used are in the bundle

Provide:
1. SVGO optimization config
2. SVG-to-React component build script
3. TypeScript interface for icon props
4. Icon component implementation
5. Icon catalog Storybook story
6. Naming conventions for icon files
7. Process for adding new icons (including design review → code)
```

### 20. Figma-Code Sync Workflow

```
Design a workflow to keep Figma design tokens in sync with the code design token definitions.

Assumptions:
- Figma uses Variables (not Figma Tokens plugin)
- Code tokens are defined in [JSON/CSS/TS files]
- Team uses GitHub

Design:
1. Export from Figma: How to extract Variables to a format compatible with the code
2. Comparison: How to detect drift between Figma and code
3. PR automation: Auto-create PR when Figma tokens change
4. Conflict resolution: What happens when code tokens diverge from Figma (who wins?)
5. Rollback: How to revert a bad token change

Provide:
- GitHub Actions workflow YAML
- Figma API integration script
- Token diff algorithm (TypeScript)
- Notification strategy for breaking changes
```

### 21. Component Versioning Strategy

```
Design a versioning strategy for a design system component library used by 15 teams.

Constraints:
- Teams cannot always upgrade immediately (some are on LTS versions)
- Major versions ship quarterly
- Security fixes need to ship immediately
- Some teams are 2 major versions behind

Design:
1. **Version support policy**: How long is each major version supported?
2. **Deprecation timeline**: From deprecated to removed
3. **Changelog format**: What's in each version entry
4. **Migration tooling**: Codemods, automated checks
5. **Communication**: How teams learn about breaking changes
6. **Emergency patches**: Process for shipping security fixes to old versions

Also provide: Semantic versioning decision tree (when to bump major vs minor vs patch for component changes)
```

### 22. Design System Testing Strategy

```
Design a comprehensive testing strategy for a React design system component library.

Test categories to cover:
1. **Unit tests**: Component rendering, prop handling, state management
2. **Accessibility tests**: jest-axe automated a11y checks
3. **Visual regression tests**: Chromatic or Percy integration
4. **Interaction tests**: Storybook play functions + Playwright
5. **Performance tests**: render-perf, re-render counts
6. **Integration tests**: Components working together
7. **Token tests**: No hard-coded values, tokens exist

Provide:
- Testing setup (jest + React Testing Library config)
- Example test for each category
- CI/CD integration
- Test coverage targets per category
- When each test type runs in the pipeline
```

### 23. Design Critique Prompt for AI

```
You are a senior design systems designer reviewing work from a junior contributor.
Review this component design/implementation with constructive feedback:

[paste design file link, screenshot, or code]

Provide feedback structured as:
**What works well** (be specific and genuine)

**Concerns** (ranked by severity: critical → minor)
For each concern:
- What the issue is
- Why it matters (user impact or system coherence)
- Suggested resolution (with example if possible)

**Questions to consider**
- Edge cases to design for
- Open decisions

Tone: Direct but encouraging. Focus on the work, not the person.
No more than 5 concerns to avoid overwhelming the contributor.
```

### 24. Responsive Component Design

```
Design responsive behavior for [component name] across breakpoints.

Breakpoints: mobile (<640px), tablet (640-1024px), desktop (>1024px) [adjust as needed]
Current component: [describe or paste]

Define:
1. **Layout changes**: How does the component layout change per breakpoint?
2. **Content changes**: What content is shown/hidden at each breakpoint?
3. **Size changes**: Which tokens scale with breakpoint?
4. **Behavior changes**: Do interactions change (e.g., hover → tap, sidebar → drawer)?

Implementation:
- Container queries vs. media queries — which to use and why
- CSS custom properties for breakpoint-specific token overrides
- TypeScript props for responsive variants (accept `{ mobile: value, desktop: value }`)

Output: CSS (Tailwind or CSS-in-JS), TypeScript types, and Storybook story showing responsive behavior.
```

### 25. Design Token Documentation

```
Generate documentation for this design token set:

[paste token definitions]

Documentation should cover:
1. **Token categories**: Explanation of each category and what it's for
2. **Usage guide**: When to use which token (with examples)
3. **Naming convention**: How token names are structured and why
4. **Anti-patterns**: Common misuses to avoid
5. **Visual reference**: (describe format) Show all color tokens as swatches with values
6. **Dark mode guide**: How light/dark tokens relate

Format: MDX suitable for Storybook or a documentation site.
Include: Code snippets showing correct token usage in CSS, styled-components, and Tailwind.
```

### 26. Design System Onboarding Guide

```
Write a getting started guide for engineers who are new to using [Design System Name].

Audience: Frontend engineers who know React/TypeScript but have never used this design system.

Cover:
1. **Installation**: npm install, peer dependencies, provider setup
2. **First component**: Step-by-step tutorial building a form with design system components
3. **Design tokens**: How to access and use tokens in custom components
4. **Theming**: How to use themes and when to create custom tokens
5. **Accessibility**: The design system's accessibility guarantees and what the developer must still do
6. **Getting help**: Contributing, filing issues, design system office hours

Style: Tutorial-first (do something useful in 5 minutes), reference-second.
Length: Enough to be useful but not overwhelming (1000-2000 words max).
Include: Working code examples for every step.
```

### 27. Component Migration Automation

```
Write a jscodeshift codemod to migrate from [Old Component] to [New Component].

Migration specification:

Old usage:
[paste example of old usage]

New usage:
[paste example of new usage]

Changes to handle:
1. Import path change
2. Prop renames
3. Prop removals with migration alternatives
4. Prop value changes (e.g., size="small" → size="sm")
5. Composition changes (if structure changed)

The codemod should:
- Handle both named and default imports
- Handle JSX spread props (flag them as needing manual review)
- Not touch non-component usage of the same identifier
- Add TODO comments where automated migration isn't possible
- Preserve formatting and comments

Also provide: Test cases for the codemod covering all migration scenarios.
```

## Best Practices for Design System Prompts

### Providing Good Context

The quality of AI-generated design system output is directly proportional to the context you provide. Always include:

1. **Technology stack**: React version, CSS solution, TypeScript version
2. **Existing patterns**: Sample of existing components for consistency
3. **Token definitions**: Your actual token names, not hypotheticals
4. **Team constraints**: Bundle size limits, browser support, accessibility requirements
5. **Brand guidelines**: Colors, typography, personality

### Iterative Refinement

Use these follow-up prompts to refine output:

- "Make the TypeScript types stricter — use discriminated unions for variants"
- "Add ARIA attributes for [specific interaction pattern]"
- "Rewrite using CSS custom properties instead of JavaScript"
- "Add comprehensive error states and edge cases"
- "Simplify the API — [specific concern] is unnecessary complexity"

### Quality Validation

After generating components, validate with:
- `tsc --strict` compilation
- jest-axe accessibility tests
- Manual keyboard navigation testing
- Cross-browser testing at major breakpoints
- Bundle size check (size-limit)

::: tip
The most effective design system prompts are specific about constraints. "Generate a Button component" produces generic output. "Generate a Button component for a B2B SaaS product with strict WCAG AA compliance, Tailwind CSS, and a 4KB size limit" produces production-usable output.
:::
