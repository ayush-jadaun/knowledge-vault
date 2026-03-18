---
title: "Dark Mode Overview"
description: "Dark mode fundamentals, token-based theming, SSR considerations, and implementation strategies"
tags: [dark-mode, theming, css, design-tokens, design-systems]
difficulty: "intermediate"
prerequisites: [color-tokens/index, color-tokens/semantic-tokens]
lastReviewed: "2026-03-18"
---

# Dark Mode Overview

Dark mode is not simply "inverting colors." It requires rethinking every color decision — surfaces don't just go white-to-black, text doesn't just go black-to-white, and brand colors must be recalibrated for legibility against dark backgrounds.

## Why Dark Mode is Complex

A naive inversion:
```css
/* WRONG: naive dark mode */
@media (prefers-color-scheme: dark) {
  :root { filter: invert(1); }
}
```

This inverts everything — including photos (they look photonegative), videos, and any embedded content. It also inverts grays in unintuitive ways.

The correct approach requires a curated color token system where each semantic token has a light and dark value:

```css
/* CORRECT: semantic token approach */
:root {
  --color-bg: oklch(98% 0 0);
  --color-text: oklch(12% 0 0);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: oklch(12% 0 0);
    --color-text: oklch(92% 0 0);
  }
}
```

## Dark Mode Design Principles

### 1. Elevation Through Lightness

In dark mode, lighter surfaces convey higher elevation (the opposite of light mode shadows):

| Surface Level | Light Mode | Dark Mode |
|---------------|------------|-----------|
| Page background | `oklch(97% 0 0)` (white-ish) | `oklch(10% 0 0)` (near black) |
| Card default | `oklch(100% 0 0)` (white) | `oklch(15% 0 0)` (dark gray) |
| Card hover/raised | Same + shadow | `oklch(18% 0 0)` (slightly lighter) |
| Modal overlay | White + strong shadow | `oklch(20% 0 0)` (visibly distinct) |
| Tooltip | `oklch(15% 0 0)` (dark) | `oklch(25% 0 0)` |

The gradient is: background → card → elevated card → modal → tooltip, each progressively lighter in dark mode.

### 2. Reduced Saturation

Pure, fully saturated colors look harsh against dark backgrounds. Dark mode palettes typically reduce chroma (saturation):

```css
:root {
  /* Light mode: full saturation */
  --color-brand: oklch(50% 0.22 264);
}

[data-theme="dark"] {
  /* Dark mode: reduced chroma, increased lightness */
  --color-brand: oklch(70% 0.15 264);
}
```

### 3. Avoid Pure Black

`#000000` (L=0%) creates too much contrast with dark gray surfaces, causing eye strain. Use very dark grays:

```css
/* AVOID */
background: #000000; /* Pure black */

/* PREFER */
background: oklch(8% 0 0);  /* Very dark gray */
background: oklch(10% 0 0); /* Common choice */
background: oklch(12% 0 0); /* Slightly lighter */
```

GitHub uses #0d1117 (~L=7%). Discord uses #313338 (~L=22%). Figma uses #1e1e1e (~L=12%).

### 4. Text Contrast Still Applies

WCAG contrast requirements don't change for dark mode. White text on dark gray background must still meet 4.5:1 for body text:

```css
/* Light mode: dark text on light bg */
.body-text {
  color: oklch(12% 0 0);      /* ~98% contrast with white */
  background: oklch(98% 0 0);  /* white */
  /* Contrast: ~20:1 ✓ */
}

/* Dark mode: light text on dark bg — must still meet 4.5:1 */
[data-theme="dark"] .body-text {
  color: oklch(90% 0 0);      /* Light gray */
  background: oklch(12% 0 0); /* Dark gray */
  /* Contrast: ~12:1 ✓ */
}
```

## What's in This Section

| Page | Focus |
|------|-------|
| [Token Mapping](./token-mapping.md) | Light→dark token remapping, OKLCH adjustments |
| [Implementation Patterns](./implementation-patterns.md) | CSS properties, class toggling, SSR flash |
| [Image Handling](./image-handling.md) | Filter techniques, dark variants, SVG |
| [System Preference Detection](./system-preference-detection.md) | prefers-color-scheme, matchMedia, storage |

## Quick Architecture

The minimal dark mode implementation:

```css
/* 1. Define semantic tokens at root level */
:root {
  --bg: oklch(98% 0 0);
  --text: oklch(12% 0 0);
  --surface: oklch(100% 0 0);
  --brand: oklch(50% 0.22 264);
  --border: oklch(88% 0.01 264);
}

/* 2. Override semantics in dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: oklch(10% 0 0);
    --text: oklch(92% 0 0);
    --surface: oklch(15% 0 0);
    --brand: oklch(70% 0.15 264);
    --border: oklch(28% 0.01 264);
  }
}

/* 3. Components use tokens — unchanged between modes */
body { background: var(--bg); color: var(--text); }
.card { background: var(--surface); border: 1px solid var(--border); }
.button { background: var(--brand); }
```
