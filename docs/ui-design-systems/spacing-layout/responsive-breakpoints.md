---
title: "Responsive Breakpoints"
description: "Mobile-first strategy, content-driven breakpoints, breakpoint tokens, and modern fluid alternatives"
tags: [responsive-design, breakpoints, mobile-first, css, media-queries]
difficulty: "intermediate"
prerequisites: [spacing-layout/index, spacing-layout/layout-patterns]
lastReviewed: "2026-03-18"
---

# Responsive Breakpoints

Breakpoints are the boundaries where a layout shifts to better fit available space. The challenge: there is no "correct" set of breakpoints. Users access the web on everything from 320px feature phones to 2560px 4K monitors. The goal is a breakpoint strategy that handles the realistic range gracefully.

## Mobile-First vs. Desktop-First

**Mobile-first**: write base CSS for mobile, override for wider viewports.
**Desktop-first**: write base CSS for desktop, override for narrower viewports.

Mobile-first is strongly preferred because:
1. The smallest screen is the hardest constraint — solve it first
2. CSS reads top-to-bottom; mobile styles load first, desktop overrides load only when needed
3. It naturally produces simpler mobile styles with progressive enhancement

```css
/* Mobile-first approach */
.card-grid {
  /* Base: single column (mobile) */
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}

@media (min-width: 640px) {
  .card-grid {
    /* Small tablet: 2 columns */
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-6);
  }
}

@media (min-width: 1024px) {
  .card-grid {
    /* Desktop: 3 columns */
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-8);
  }
}
```

## Content-Driven Breakpoints

The biggest mistake in responsive design: choosing breakpoints based on popular device widths (320px, 768px, 1024px, 1440px).

The right approach: **let your content decide where it breaks**. Add a breakpoint only when the layout actually looks wrong at a given width.

Process:
1. Start with mobile styles
2. Resize the browser wider slowly
3. Note the width where the layout starts looking wrong
4. That width is your breakpoint

The result: breakpoints that are specific to your content, not arbitrary device widths.

```css
/* Instead of: */
@media (min-width: 768px) { /* iPad width — meaningless for layout */ }

/* Use: */
@media (min-width: 52em) {
  /* This specific content looks bad below 52em (832px) */
  /* so we add a breakpoint here */
}
```

## Standard Breakpoint Tokens

While content-driven is ideal, having a standard vocabulary helps teams communicate:

```typescript
// tokens/breakpoints.ts

export const breakpoints = {
  sm:   '640px',   /* Small: landscape phones */
  md:   '768px',   /* Medium: tablets */
  lg:   '1024px',  /* Large: laptops */
  xl:   '1280px',  /* XL: desktop */
  '2xl': '1536px', /* 2XL: wide monitors */
} as const;

export type Breakpoint = keyof typeof breakpoints;

// CSS: use as custom media queries (requires PostCSS plugin)
export const cssBreakpoints = `
  @custom-media --sm (min-width: 640px);
  @custom-media --md (min-width: 768px);
  @custom-media --lg (min-width: 1024px);
  @custom-media --xl (min-width: 1280px);
  @custom-media --2xl (min-width: 1536px);

  /* Range media queries */
  @custom-media --mobile-only (max-width: 639px);
  @custom-media --tablet-only (min-width: 640px) and (max-width: 1023px);
  @custom-media --desktop-only (min-width: 1024px);
`;
```

## Breakpoint Tokens in CSS

```css
/* Define as CSS custom properties — not yet standard, but polyfillable */
/* For now, use as documentation reference */
:root {
  --bp-sm:  640px;
  --bp-md:  768px;
  --bp-lg:  1024px;
  --bp-xl:  1280px;
  --bp-2xl: 1536px;
}

/* Usage: same values but documented intent */
@media (min-width: 640px) { /* --bp-sm */ }
@media (min-width: 768px) { /* --bp-md */ }
@media (min-width: 1024px) { /* --bp-lg */ }
```

## The em vs. px Debate in Media Queries

Browser default font size affects em-based media queries:

- `min-width: 768px` — absolute, ignores font size
- `min-width: 48em` — relative to browser base font size (default: 16px → 768px)

**Use em for media queries.** Reason: users who increase their browser's default font size (accessibility) will trigger the breakpoint sooner — meaning they get more spacious layouts when they need it. With px breakpoints, a user who doubles their font size still gets the narrow layout at 768px, even though their content effectively needs double the width.

```css
/* Preferred: em-based media queries */
@media (min-width: 40em)  { /* ~640px at 16px base */ }
@media (min-width: 48em)  { /* ~768px */ }
@media (min-width: 64em)  { /* ~1024px */ }
@media (min-width: 80em)  { /* ~1280px */ }
@media (min-width: 96em)  { /* ~1536px */ }
```

## React useBreakpoint Hook

```typescript
// hooks/useBreakpoint.ts
import { useState, useEffect, useCallback } from 'react';

const BREAKPOINTS = {
  sm:  640,
  md:  768,
  lg:  1024,
  xl:  1280,
  '2xl': 1536,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

interface BreakpointState {
  width: number;
  breakpoint: Breakpoint | 'xs';
  isSmall: boolean;
  isMedium: boolean;
  isLarge: boolean;
  isXL: boolean;
  is2XL: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

function getBreakpoint(width: number): Breakpoint | 'xs' {
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl)    return 'xl';
  if (width >= BREAKPOINTS.lg)    return 'lg';
  if (width >= BREAKPOINTS.md)    return 'md';
  if (width >= BREAKPOINTS.sm)    return 'sm';
  return 'xs';
}

export function useBreakpoint(): BreakpointState {
  const [width, setWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  const handleResize = useCallback(() => {
    setWidth(window.innerWidth);
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  const breakpoint = getBreakpoint(width);

  return {
    width,
    breakpoint,
    isSmall:   width >= BREAKPOINTS.sm,
    isMedium:  width >= BREAKPOINTS.md,
    isLarge:   width >= BREAKPOINTS.lg,
    isXL:      width >= BREAKPOINTS.xl,
    is2XL:     width >= BREAKPOINTS['2xl'],
    isMobile:  width < BREAKPOINTS.md,
    isTablet:  width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isDesktop: width >= BREAKPOINTS.lg,
  };
}

// Usage
function Sidebar() {
  const { isDesktop } = useBreakpoint();
  if (!isDesktop) return null;
  return <aside>...</aside>;
}
```

::: warning Server-side rendering caveat
`window.innerWidth` is not available in SSR (Next.js, Remix server components). Initialize with a safe default (1024) and accept a flash of incorrect layout, or use `useMemo` with SSR-safe checks. Better: use CSS for layout changes when possible, reserve JavaScript breakpoints for conditional rendering of entire components.
:::

## Responsive Typography Breakpoints

Typography should be responsive but often doesn't need explicit breakpoints if using clamp():

```css
/* Without breakpoints (preferred) */
h1 { font-size: clamp(2rem, 5vw + 1rem, 4rem); }

/* With breakpoints (acceptable for specific cases) */
h1 {
  font-size: 2rem;
}

@media (min-width: 40em) {
  h1 { font-size: 3rem; }
}

@media (min-width: 64em) {
  h1 { font-size: 4rem; }
}
```

## Responsive Images

Images need different approaches at different sizes:

```html
<!-- srcset: different resolutions for same image -->
<img
  src="/hero-800.jpg"
  srcset="
    /hero-400.jpg   400w,
    /hero-800.jpg   800w,
    /hero-1200.jpg  1200w,
    /hero-1600.jpg  1600w
  "
  sizes="
    (max-width: 640px)  100vw,
    (max-width: 1024px) 80vw,
    1200px
  "
  alt="Hero image"
  width="1200"
  height="600"
/>

<!-- picture: art direction (different crops) -->
<picture>
  <source
    media="(max-width: 640px)"
    srcset="/hero-portrait-400.jpg, /hero-portrait-800.jpg 2x"
  />
  <source
    media="(max-width: 1024px)"
    srcset="/hero-landscape-800.jpg, /hero-landscape-1600.jpg 2x"
  />
  <img
    src="/hero-landscape-1200.jpg"
    alt="Hero image"
    width="1200"
    height="600"
  />
</picture>
```

## Print Breakpoints

Often forgotten: print media queries:

```css
@media print {
  /* Hide navigation, sidebars, ads */
  nav, aside, .ad, .social-share { display: none; }

  /* Full-width main content */
  main { width: 100%; max-width: none; }

  /* Ensure text is print-friendly */
  body {
    font-size: 12pt;
    color: #000;
    background: #fff;
  }

  /* Page breaks */
  h2, h3 { page-break-after: avoid; }
  img { page-break-inside: avoid; }

  /* Show link URLs */
  a[href]::after {
    content: " (" attr(href) ")";
    font-size: 0.8em;
    color: #666;
  }

  /* Don't show for internal links */
  a[href^="#"]::after { content: none; }
}
```

## Breakpoint Debugging Utilities

```css
/* Visual breakpoint indicator — dev only */
body::before {
  position: fixed;
  bottom: 0;
  left: 0;
  padding: 4px 8px;
  font: 12px monospace;
  background: rgba(0,0,0,0.7);
  color: white;
  z-index: 9999;
  pointer-events: none;
  content: 'xs (<640px)';
}

@media (min-width: 640px)  { body::before { content: 'sm (640px+)'; } }
@media (min-width: 768px)  { body::before { content: 'md (768px+)'; } }
@media (min-width: 1024px) { body::before { content: 'lg (1024px+)'; } }
@media (min-width: 1280px) { body::before { content: 'xl (1280px+)'; } }
@media (min-width: 1536px) { body::before { content: '2xl (1536px+)'; } }
```

::: info War Story
A team built their product with 7 breakpoints, thinking more breakpoints meant better responsiveness. In practice, the breakpoints conflicted — a change at 768px broke the 800px layout, which was fixed by adding an 800px breakpoint, which then caused problems at 840px... After 6 months, the breakpoint cascade was unmaintainable. They rebuilt using only 3 breakpoints (640px, 1024px, 1440px) and solved the rest with fluid sizing via clamp(). The codebase shrank by 30% and was significantly easier to maintain.
:::
