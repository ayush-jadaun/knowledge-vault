---
title: "Responsive Design Prompts: 25+ Prompts for Adaptive, Mobile-First Layouts"
description: "Production-ready prompts for implementing responsive design, breakpoint systems, container queries, fluid typography, and mobile-first development"
tags: [prompt-engineering, responsive-design, mobile-first, css, breakpoints, container-queries]
difficulty: "intermediate"
prerequisites: [design-system-prompts, accessibility-prompts]
lastReviewed: "2026-03-18"
---

# Responsive Design Prompts: 25+ Prompts for Adaptive, Mobile-First Layouts

## Overview

Responsive design has evolved far beyond "media queries for mobile." Modern responsive design involves fluid layouts with container queries, clamp()-based fluid typography, logical properties for internationalization, intrinsic web design principles, and performance-conscious loading strategies.

This collection covers every aspect of responsive implementation: from foundational breakpoint systems to advanced container queries, from fluid type scales to responsive image loading, from navigation patterns to testing methodologies.

## Foundational System Prompts

### 1. Responsive Design System Foundation

```
Design a complete responsive design system foundation for [project description].

Define:
1. **Breakpoint system**
   - Values and rationale (why these specific breakpoints?)
   - Mobile-first vs. desktop-first (recommend and justify)
   - Named breakpoints: xs, sm, md, lg, xl, 2xl
   - Device targeting vs. content-based breakpoints (prefer content-based)

2. **Container system**
   - Max-width per breakpoint
   - Horizontal padding/gutters per breakpoint
   - Centered vs. full-bleed container variants

3. **Grid system**
   - Column count per breakpoint
   - Gutter widths
   - CSS Grid implementation (prefer over Bootstrap-style float grids)

4. **Typography scale**
   - Font size per breakpoint (or fluid via clamp())
   - Line height adjustments per breakpoint

Output:
- CSS custom properties for all tokens
- Tailwind config extending default breakpoints
- TypeScript breakpoint utilities for JS media query matching
- Rationale document
```

### 2. Mobile-First CSS Architecture

```
Refactor this CSS from desktop-first to mobile-first.

[paste existing CSS]

Mobile-first principles:
1. Base styles (no media query) = mobile styles
2. Add complexity with min-width media queries
3. Never use max-width to "undo" styles — reorganize

Refactoring process:
1. Extract the smallest viewport styles as the base
2. Layer larger viewport additions with min-width queries
3. Remove overrides that cancel previous rules
4. Consolidate repeated values with CSS custom properties

Output:
- Refactored CSS
- List of improvements made
- Any patterns that should be abstracted to utilities
- Performance improvement estimate (fewer overrides = faster paint)

Also flag: any styles that are genuinely desktop-only (hover effects, pointer-specific interactions) and move them to appropriate queries.
```

### 3. Container Query Implementation

```
Implement container queries to replace media queries for component-level responsiveness.

Component: [describe the component]

Why container queries are better here:
- This component is reused in multiple layout contexts
- Its layout should respond to its container width, not the viewport

Implementation requirements:
1. container-type: inline-size on the parent container
2. @container queries replacing @media queries within the component
3. Named containers for nested component scenarios
4. Fallback for browsers without container query support (Safari < 16, use @supports)
5. TypeScript/JavaScript detection for progressive enhancement

Provide:
- CSS with container queries
- Equivalent media query version (for comparison/fallback)
- Browser support table and progressive enhancement strategy
- Real-world example showing the same component in a sidebar (300px) and main content (800px)
```

## Typography Prompts

### 4. Fluid Typography with clamp()

```
Implement fluid typography that scales smoothly between breakpoints without media query jumps.

Design specs:
[paste or describe: minimum viewport, maximum viewport, font sizes at each]

Use CSS clamp() to create fluid type:
font-size: clamp(min, fluid-formula, max);

The fluid formula:
calc([min-size]px + ([max-size] - [min-size]) * ((100vw - [min-vp]px) / ([max-vp] - [min-vp])))

Generate fluid values for:
- h1: [spec] at mobile → [spec] at desktop
- h2: [spec] → [spec]
- h3: [spec] → [spec]
- body: [spec] → [spec]
- small: [spec] → [spec]
- label: [spec] → [spec]

Also provide:
- CSS custom property definitions
- TypeScript utility function to generate clamp() values programmatically
- Visual explanation of how clamp() values were calculated
- WCAG check: does text still resize with user font size preferences?
```

### 5. Responsive Line Length Control

```
Implement optimal line length (measure) across viewport sizes for this article/content site.

Typography principle: Optimal reading measure is 45-75 characters per line.

Current problem: [describe — text too wide on desktop? too narrow on mobile?]

Solution approach:
1. Use `max-width: [N]ch` on content containers (ch = width of "0" character)
2. Minimum width to prevent too-narrow on mobile
3. Container padding to prevent edge-to-edge text
4. Different measures for different content types (article vs. caption vs. UI text)

Implementation:
- CSS for content containers
- How this interacts with the grid system
- Multi-column text at wider viewports (CSS columns)
- Right-to-left language support (logical properties)

Provide: working CSS + visual test with lorem ipsum at 375px, 768px, 1280px viewports.
```

## Layout Pattern Prompts

### 6. Responsive Navigation Patterns

```
Design a responsive navigation system that works across all devices.

Desktop: [describe desired navigation — horizontal nav bar, sidebar, mega menu]
Mobile: [describe — hamburger menu, bottom nav, drawer]
Tablet: [describe how it transitions]

Implement:
1. **Desktop navigation**: Full navigation with hover states
2. **Mobile hamburger**: Toggle menu with focus trap, close on outside click/Escape
3. **Transition**: At which breakpoint and how does it transition?
4. **Mega menu** (if applicable): Accessible hover+focus behavior
5. **Active states**: Current page indication
6. **Scroll behavior**: Sticky navigation, hide on scroll down, show on scroll up

Accessibility requirements:
- Keyboard navigable at all widths
- Hamburger button: aria-expanded, aria-controls
- Mobile menu: focus trap, close on Escape
- Skip navigation link

Provide: HTML + CSS + minimal JavaScript (no jQuery). React component version optional.
```

### 7. CSS Grid Responsive Layouts

```
Generate CSS Grid layouts for these common responsive patterns:

1. **Holy Grail**: Header + Left Sidebar + Main + Right Sidebar + Footer
   - Desktop: 3-column
   - Tablet: 2-column (one sidebar)
   - Mobile: 1-column, sidebar below main

2. **Card Grid**: Responsive card layout
   - Auto-fit/auto-fill with minmax
   - Cards never smaller than [N]px wide
   - Equal height cards in each row

3. **Magazine Layout**: Asymmetric multi-column with featured item
   - Featured item spans multiple columns
   - Falls back gracefully to single column

4. **Dashboard Layout**: Resizable widget grid
   - Named grid areas for easy rearrangement
   - Specific widgets span multiple columns at wide viewports
   - All single column on mobile

For each layout:
- CSS Grid implementation (no external libraries)
- How it changes at each breakpoint
- Alternative with CSS Flexbox (when Grid is overkill)
- Subgrid usage for aligned nested content
```

### 8. Responsive Image Strategy

```
Implement a comprehensive responsive image strategy for this site.

Image use cases:
1. **Hero images**: Full-width, always visible
2. **Product images**: Various sizes depending on context
3. **Profile avatars**: Small, circular
4. **Article thumbnails**: 3 sizes: featured, list, related
5. **Background images**: CSS, different for mobile/desktop
6. **Icons**: SVG (resolution independent)

For each type provide:
- HTML: srcset and sizes attributes
- Next.js Image component configuration (if applicable)
- CSS: aspect-ratio, object-fit, object-position
- Lazy loading strategy
- LQIP (Low Quality Image Placeholder) for above-the-fold images

File format strategy:
- AVIF → WebP → JPEG/PNG fallback chain
- When to use each format
- Build pipeline for generating multiple sizes (Sharp, ImageMagick)

Core Web Vitals impact:
- LCP optimization for hero images (preload, priority)
- CLS prevention (reserve space with aspect-ratio)
- FID/INP: avoid layout recalculation from image load
```

## Complex Responsive Patterns

### 9. Responsive Data Tables

```
Implement responsive data tables that work on mobile without horizontal scrolling.

Data: [describe your table — columns, importance of each column]

Options to implement:
1. **Priority columns**: Hide less important columns at small viewports
2. **Horizontal scroll with sticky first column**: Table scrolls, but row label is fixed
3. **Card view transformation**: Rows become cards at mobile, label above value
4. **Stacked cells**: Each cell becomes a key-value pair

For the card view transformation approach:
- CSS that transforms table to card layout at breakpoint
- Preserve table semantics (don't use divs) via role="presentation" hack or CSS display overrides
- Accessible approach that doesn't confuse screen readers

Also: Which approach is right for which use case?
- Dense data comparison (keep table structure, enable scroll)
- Simple lists (transform to cards)
- Priority data (hide columns)
```

### 10. Responsive Forms

```
Design a responsive form layout system for this form:

[paste form fields or describe: field types, number of fields, relationship between fields]

Layout considerations:
1. **Field grouping**: Related fields side-by-side on wide viewports, stacked on mobile
2. **Label position**: Above input (universal) vs. floating label (context-dependent)
3. **Field width**: Full-width vs. content-sized (e.g., postal code is narrow)
4. **Multi-column**: 2-column form layout on desktop
5. **Error messages**: Inline vs. summary; positioning at different widths

Mobile-specific:
- Appropriate input types (email, tel, number, date) to trigger correct keyboard
- Autocomplete attributes for password managers and autofill
- Large enough touch targets for inputs
- Zoom prevention (min 16px font-size in inputs — do NOT use user-scalable=no)

Provide:
- HTML form structure
- CSS responsive layout
- React component with TypeScript
```

### 11. Responsive Typography Hierarchy

```
Establish a responsive typographic hierarchy for [content type: editorial, marketing, app UI].

Requirements:
- Heading levels h1-h4 with responsive sizes
- Body text with optimal measure at each breakpoint
- Supporting text (captions, labels, metadata) at different sizes
- Appropriate line heights (tighter for headings, looser for body)
- Font weight variation per heading level and viewport

Fluid approach using clamp():
[I'll provide the viewport range: Xpx to Ypx]

Also handle:
- Very large displays (2560px+) — cap type sizes
- Zoom/user font size preferences — use rem, respect user settings
- Print styles — adjust typography for print
- CJK characters — different line-height recommendations

Output:
- CSS custom properties for all type tokens
- Tailwind prose plugin customization
- Example HTML showing the full type hierarchy
```

### 12. Intrinsic Web Design Patterns

```
Implement these intrinsic web design patterns that adapt to content rather than viewport:

1. **Squeezed layout**: Content-based breakpoints using min/max/clamp
   - Grid that reflows when content is cramped, not at arbitrary breakpoints

2. **Auto-fill grid**: Cards that fit as many as possible per row
   grid-template-columns: repeat(auto-fill, minmax(250px, 1fr))
   - What's the ideal minmax value for [content type]?

3. **RAM pattern** (Repeat, Auto, Minmax)
   - Different behavior: auto-fill vs auto-fit
   - When to use each

4. **Flexible components**: Components that work correctly in any context
   - No fixed pixel widths that break in narrow containers
   - Using min-content, max-content, fit-content

5. **Logical properties**: Responsive to writing direction (LTR/RTL/vertical)
   - padding-inline vs. padding-left/right
   - border-block-start vs. border-top
   - Full logical property list for [component type]

Provide working examples of each pattern with comments explaining the intrinsic behavior.
```

## Performance-Focused Responsive Prompts

### 13. Responsive Performance Optimization

```
Optimize this responsive layout for Core Web Vitals performance.

Current implementation: [paste or describe]
Current scores: LCP: [N]ms, CLS: [N], FID/INP: [N]ms

Optimization targets:
- LCP < 2.5s (Good)
- CLS < 0.1 (Good)
- INP < 200ms (Good)

Specific issues to solve:
1. **CLS from images**: Add width/height or aspect-ratio to all images
2. **CLS from ads/embeds**: Reserve space before content loads
3. **CLS from dynamic content**: Anchor content to specific positions
4. **LCP image**: Preload, priority loading, no lazy loading for above-fold
5. **Layout recalculation**: Identify and remove causes of costly reflow

Changes to make:
- CSS changes that eliminate CLS
- HTML changes for LCP optimization
- JavaScript changes for INP improvement
- Network changes for faster LCP (preconnect, preload)

Provide: Before/after comparison with explanation of why each change helps.
```

### 14. Responsive Loading Strategy

```
Design a performance-conscious responsive loading strategy.

Site type: [ecommerce / editorial / SaaS dashboard / landing page]
Priority content (above the fold): [describe]

Strategy components:
1. **Critical CSS**: Inline CSS for above-fold content to unblock rendering
2. **Lazy loading**: Images, components, and routes that are below fold or on-demand
3. **Responsive images**: srcset/sizes for appropriate resolution delivery
4. **Conditional loading**: Some components only needed at certain breakpoints
   - Heavy desktop components not loaded on mobile
   - Mobile-only components not loaded on desktop
   - Use matchMedia + dynamic import or React.lazy

Implementation:
- Next.js or Vite code splitting strategy per breakpoint
- Custom hook: useBreakpoint() for conditional rendering
- CSS containment for layout performance
- Will-change hints for animated elements

Bundle impact:
- Estimated bundle size savings from conditional loading
- Measuring impact with WebPageTest
```

### 15. Responsive Animation Performance

```
Optimize these animations for performance across all devices, especially mobile.

[paste or describe animations]

Performance principles:
1. **Animate only**: opacity, transform (translate, scale, rotate) — these use GPU
2. **Never animate**: width, height, top, left, margin, padding — these trigger layout
3. **will-change**: Pre-promote animated elements to their own layer
4. **Reduced motion**: Respect prefers-reduced-motion media query
5. **60fps target**: 16ms per frame budget

Device-specific considerations:
- Low-end mobile: limit simultaneous animations, reduce duration
- High refresh rate screens (120Hz): animations should work at all frame rates
- Battery saver mode: reduce animation intensity

For each animation in the codebase:
- Is it triggering layout? (list properties)
- GPU acceleration opportunity?
- Reduced motion alternative?
- Mobile simplification needed?

Provide: Optimized CSS/JS for each animation.
```

## Testing Prompts

### 16. Responsive Design Testing Protocol

```
Create a comprehensive responsive design testing protocol.

Breakpoints to test: [list your project's breakpoints]
Devices to cover:
- iPhone SE (375px) — smallest modern phone
- iPhone 14 Pro (390px) — common modern phone
- iPad (768px) — tablet portrait
- iPad landscape (1024px) — tablet landscape
- Laptop (1280px) — typical laptop
- Desktop (1440px) — typical desktop
- Wide (1920px+) — large monitors

For each breakpoint test:
**Layout**
- No horizontal scrollbar
- Content not cut off
- Text not overflowing containers
- Images not distorted
- Grid layout correct

**Typography**
- Text readable (no smaller than 12px)
- Line length in optimal range
- Heading hierarchy visible
- No widows/orphans in critical text

**Interactions**
- Touch targets ≥ 44px on mobile
- Hover states not stuck on touch devices
- Modals/drawers accessible at all sizes

**Performance**
- No layout shift (CLS)
- Images loaded at appropriate size

Provide: Playwright test script for automated breakpoint testing.
```

### 17. Cross-Browser Responsive Testing

```
Develop a cross-browser testing plan for responsive layout compatibility.

Priority browser matrix:
- Chrome 120+ (desktop + Android)
- Safari 16+ (macOS + iOS — most restrictive for CSS features)
- Firefox 120+ (desktop)
- Samsung Internet (Android)
- Edge 120+ (desktop)

CSS features to verify cross-browser:
1. Container queries (@container) — Safari 16+, fallback needed?
2. CSS Grid subgrid — Safari 16+
3. :has() selector — Safari 15.4+
4. aspect-ratio — Universal now
5. gap in flexbox — Universal now
6. clamp() — Universal
7. logical properties — Universal but check inheritance

Create:
- BrowserStack / LambdaTest test matrix
- Automated cross-browser test setup with Playwright
- Feature detection strategy (CSS @supports)
- Polyfill/fallback plan for each unsupported feature
- Known Safari mobile quirks reference card (100vh issue, etc.)
```

### 18. Responsive Visual Regression Testing

```
Set up visual regression testing for responsive layouts.

Tool options to evaluate: Chromatic, Percy, Playwright screenshots, Storybook visual tests

Requirements:
- Capture screenshots at all breakpoints automatically
- Compare against approved baseline screenshots
- Detect layout shifts, overflow, visual regressions
- Integrate with GitHub PRs (fail PR if visual regression detected)
- Handle dynamic content (timestamps, user data) — mask these

Configuration to provide:
1. Tool recommendation with rationale
2. Screenshot configuration (viewports, full-page vs. viewport)
3. Baseline approval workflow
4. Threshold settings (how much change triggers failure)
5. GitHub Actions integration
6. How to update baselines when intentional changes are made

Also: How to handle flaky tests from dynamic content, animations, external resources.
```

## Specialized Responsive Prompts

### 19. Responsive Email Templates

```
Create a responsive email template for [email type: transactional / marketing / newsletter].

Email vs. web: Email clients use ancient CSS support — no Grid, no Flexbox in Outlook, no custom properties.

Requirements:
- Works in: Gmail (web, iOS, Android), Apple Mail, Outlook 2016+ (uses Word rendering engine!)
- Mobile-first: single column on mobile, 2-column on desktop
- Max width: 600px
- Fonts: System-safe font stack (email clients don't support web fonts reliably)
- Images: All images have alt text, decorative images have alt=""
- Dark mode: @media (prefers-color-scheme: dark) support

Techniques to use:
- Table-based layout for Outlook compatibility
- MSO conditional comments for Outlook
- Hybrid/fluid approach for Gmail
- Inline CSS (email clients strip <style> blocks)

Provide:
- HTML with inline CSS
- MJML version (preprocessor that handles cross-client compatibility)
- Litmus testing checklist
- Known rendering issues and workarounds
```

### 20. Print CSS

```
Create print CSS for this web page/application.

[describe the page: news article / invoice / dashboard / documentation]

Print CSS goals:
1. Remove non-essential elements (navigation, ads, social buttons, video)
2. Adjust layout (single column, full width)
3. Show href for links (print: a::after)
4. Page break control (avoid breaking inside cards, keep headings with content)
5. Typography: serif body text for print, larger leading
6. Color: remove dark backgrounds, ensure sufficient contrast on white
7. Images: ensure high-resolution print images are used

Specific elements:
- Navigation: hide
- Hero images: show or hide?
- Data tables: how to handle wide tables?
- Code blocks: monospace, preserve formatting
- Footer: add print-specific footer with URL and date

Provide:
- @media print CSS
- How to test print CSS in browser DevTools
- CSS variables for print-specific overrides
```

### 21. Responsive Dashboard Layout

```
Design a responsive dashboard layout for [dashboard type: analytics / admin / monitoring].

Components to place:
- Navigation (left sidebar on desktop, bottom nav on mobile)
- Stats cards (4 key metrics)
- Primary chart (largest visual element)
- Secondary charts (2-3 smaller charts)
- Data table (complex, many columns)
- Activity feed (right sidebar on wide desktop)

Layout requirements:
- Desktop (1280px+): All components visible simultaneously, 3-column
- Tablet (768-1280px): 2-column, some components collapse or move
- Mobile (<768px): Single column, all components stacked, stats first

Responsive behaviors:
- Stats cards: 4 across desktop → 2x2 on tablet → 1 column on mobile
- Charts: Full width on mobile, with horizontal scrolling for complex charts
- Table: Horizontal scroll with sticky first column on all sizes
- Sidebar: Hidden on mobile, accessible via settings/menu

Provide: CSS Grid layout using named grid areas, complete responsive implementation.
```

### 22. Responsive Modal and Overlay Patterns

```
Implement responsive modal/overlay patterns that work across devices.

Variations to implement:
1. **Desktop modal**: Centered overlay, max-width, scrollable content
2. **Mobile full-screen**: Modal takes full viewport on small screens
3. **Bottom sheet**: Slides up from bottom on mobile (common pattern)
4. **Drawer**: Slides from side, typically for navigation
5. **Toast/snackbar**: Fixed position notifications

For each:
- CSS: how it's positioned and sized at each breakpoint
- Animation: slides in from below on mobile, fades in on desktop
- Scroll: body scroll lock when modal is open
- Keyboard trap: focus stays within modal
- Close mechanisms: X button, outside click, Escape key, swipe down (mobile)
- Stacking: Multiple modals (nested/stacked)

Platform conventions to follow:
- iOS: bottom sheet with spring animation, pull-down to dismiss
- Android: Material Design modal patterns
- Desktop: conventional dialog patterns

Provide: TypeScript React implementation with CSS.
```

### 23. Responsive Scrolling and Navigation

```
Implement advanced responsive scrolling patterns.

Patterns to implement:
1. **Sticky navigation**: Sticks at top after scrolling past hero
2. **Hide on scroll down, show on scroll up**: For mobile (saves screen space)
3. **Progress indicator**: Reading progress bar
4. **Back to top**: Appears after scrolling down
5. **Infinite scroll**: Load more content as user scrolls (with pagination fallback)
6. **Horizontal scroll**: Touch-friendly horizontal scroll for cards/tabs
7. **Parallax**: Subtle on desktop, disabled on mobile (performance + motion)

Performance requirements:
- Use IntersectionObserver (not scroll event listener)
- Passive scroll event listeners
- requestAnimationFrame for animations
- CSS scroll-snap for horizontal scroll carousels
- Avoid layout thrashing (no reading layout properties in scroll handlers)

Accessibility:
- Infinite scroll needs pagination alternative for keyboard users
- Progress indicator with accessible label
- Back-to-top announces action to screen readers

Provide: TypeScript React hooks for each pattern.
```

### 24. Responsive States and Feedback

```
Design responsive loading states, empty states, and error states.

Loading states:
1. **Skeleton screens**: Content placeholders that match the layout
   - Implement for: [card / list / table / form]
   - Animated shimmer effect
   - Accessible: aria-busy, aria-label on container

2. **Progress indicators**: For longer operations
   - Determinate vs. indeterminate
   - Responsive positioning

3. **Loading overlays**: Block interaction during critical operations

Empty states:
1. **First use**: User has no data yet — engaging, actionable
2. **Zero search results**: Helpful, suggests alternatives
3. **No permission**: Clear explanation, action to request access
4. **Error state**: Clear error, recovery action

For each:
- Desktop version: more illustration space
- Mobile version: simpler illustration, more whitespace
- Illustration guidelines: when to use vs. icon vs. text only
- Copy guidelines: tone, length

Provide: React components for each state type.
```

### 25. Responsive Color Scheme

```
Implement a complete responsive color scheme supporting light mode, dark mode, and high contrast.

Current palette: [paste brand colors]

Three modes to support:
1. **Light mode**: Default, optimized for normal ambient light
2. **Dark mode**: Reduced eye strain in low light, OLED-friendly (true black)
3. **High contrast**: Windows High Contrast Mode / forced colors compatibility

Implementation:
- CSS custom properties for all color tokens
- @media (prefers-color-scheme: dark) for auto dark mode
- .dark class on body for manual toggle
- @media (forced-colors: active) for high contrast mode
- User preference storage (localStorage) for manual override
- System preference change detection (JS)

Forced colors mode specifics:
- Use system colors: ButtonText, ButtonFace, LinkText, etc.
- Borders become visible (add transparent borders for when forced colors activates)
- Images: forced-color-adjust: none for important images
- SVG icons: need forced-color-aware fills

Provide:
- Complete CSS token system
- React useColorScheme hook
- ColorSchemeToggle component
- Testing instructions for each mode
```

## Reference: Responsive Prompt Templates

### Quick Audit Prompt

```
Quickly audit this UI for responsive design issues:
[paste code or screenshot description]

Check: Overflow, fixed pixel widths, missing mobile styles, touch target sizes, font scaling.
Give me the top 5 issues to fix first.
```

### Convert Component Prompt

```
Convert this desktop-only component to responsive:
[paste component]

Make it work at 375px (mobile), 768px (tablet), 1280px (desktop).
Use mobile-first CSS. Preserve all existing functionality.
```

### Breakpoint Rationale Prompt

```
I'm designing a web app. Recommend breakpoints and explain why.
Target users: [describe audience and devices]
Content: [describe content types and complexity]
Should I use fixed breakpoints or content-based breakpoints?
```

::: tip
The most effective responsive prompts describe both the **content structure** and the **user context** (what device, what task, what environment). A dashboard viewed on a factory floor on a tablet has very different requirements than a news article read on a phone on the subway, even if both need to be "responsive."
:::

## Related Deep Dives

- [Spacing and Layout](/ui-design-systems/spacing-layout/) — Spacing scales, responsive breakpoints, container queries, and layout patterns that form the foundation of responsive design systems
- [Animations](/ui-design-systems/animations/) — Timing curves, CSS animations, performance considerations, and motion principles for responsive transitions and interactions
- [Typography](/ui-design-systems/typography/) — Type scales, responsive typography with fluid sizing, and font loading strategies for multi-device experiences
- [Accessibility](/ui-design-systems/accessibility/) — Keyboard navigation, focus management, and touch target considerations that responsive designs must satisfy across devices
