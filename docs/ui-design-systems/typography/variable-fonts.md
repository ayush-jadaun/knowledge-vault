---
title: "Variable Fonts"
description: "Variable font axes, animation, file size optimization, browser support, and OpenType features"
tags: [typography, variable-fonts, opentype, css, performance]
difficulty: "advanced"
prerequisites: [typography/index, typography/font-loading]
lastReviewed: "2026-03-18"
---

# Variable Fonts

Variable fonts are one of the most significant advances in web typography since WOFF2. A single variable font file can replace an entire family of static fonts — covering all weights, widths, and optical sizes in a file that's often smaller than two static fonts combined.

## What Variable Fonts Actually Are

A traditional font family requires separate files for each variation:
```
inter-thin.woff2       (100 weight)  — 42KB
inter-extralight.woff2 (200 weight)  — 43KB
inter-light.woff2      (300 weight)  — 43KB
inter-regular.woff2    (400 weight)  — 44KB
inter-medium.woff2     (500 weight)  — 44KB
inter-semibold.woff2   (600 weight)  — 44KB
inter-bold.woff2       (700 weight)  — 44KB
inter-extrabold.woff2  (800 weight)  — 44KB
inter-black.woff2      (900 weight)  — 44KB
Total: ~392KB (if you load all 9)
```

A variable font encodes all of this in one file using **delta interpolation** — each glyph stores its shape at extreme axis values, plus deltas that describe how points move between extremes.

```
inter-var.woff2 — 244KB (all weights 100-900)
Savings: ~38% smaller, infinite weight values, one HTTP request
```

## Axes — The Variable Dimensions

Every variable font defines axes that can be adjusted. Axes are either **registered** (standardized 4-letter tags) or **custom** (lowercase names).

### Registered Axes

| Axis Tag | Name | Typical Range | CSS Property |
|----------|------|---------------|--------------|
| `wght` | Weight | 100–900 | `font-weight` |
| `wdth` | Width | 75–125 | `font-stretch` |
| `ital` | Italic | 0–1 | `font-style` |
| `slnt` | Slant | -20–20° | `font-style: oblique` |
| `opsz` | Optical Size | 6–144pt | `font-optical-sizing` |

### Custom Axes (Examples)

| Font | Axis Tag | Description |
|------|----------|-------------|
| Recursive | `MONO` | 0=sans, 1=monospace |
| Recursive | `CASL` | 0=linear, 1=casual |
| Recursive | `CRSV` | 0=upright, 1=cursive |
| Amstelvar | `XTRA` | X-transparency (counter width) |
| Amstelvar | `YTRA` | Y-transparency |
| Decovar | `BLDA` | Inline decoration |
| Source Code Pro | `LIGA` | Ligature character forms |

## CSS font-variation-settings

All axis values are controlled via `font-variation-settings`:

```css
/* Registered axes — use CSS properties when possible */
.text-bold {
  font-weight: 700; /* controls 'wght' axis */
}

.text-condensed {
  font-stretch: 75%; /* controls 'wdth' axis */
}

/* Custom axes — must use font-variation-settings */
.recursive-mono {
  font-family: 'Recursive';
  font-variation-settings:
    'MONO' 1,   /* monospace */
    'CASL' 0.5, /* semi-casual */
    'CRSV' 0;   /* upright */
}

/* Combining registered and custom axes */
.display-heading {
  font-family: 'Amstelvar';
  font-weight: 800;
  font-stretch: 90%;
  font-optical-sizing: auto;
  font-variation-settings:
    'XTRA' 400, /* wider counters */
    'YOPQ' 100; /* custom axis */
}
```

::: warning Performance note
When using `font-variation-settings`, the entire value must be overridden if you want to change any single axis in a descendant rule. Unlike `font-weight`, there's no individual CSS property for custom axes. Use CSS custom properties as variables to avoid redundancy.
:::

```css
/* Pattern: use CSS custom properties for each axis */
:root {
  --font-wght: 400;
  --font-wdth: 100;
  --font-casl: 0;
}

.text-base {
  font-variation-settings:
    'wght' var(--font-wght),
    'wdth' var(--font-wdth),
    'CASL' var(--font-casl);
}

.text-bold {
  --font-wght: 700;
}

.text-condensed {
  --font-wdth: 75;
}
```

## Optical Sizing

Fonts designed for optical sizes adjust letter spacing, stroke contrast, and x-height based on the intended display size. At small sizes, strokes are thicker, spacing is wider, and contrast is reduced for legibility. At large display sizes, strokes are thinner and contrast is higher for elegance.

```css
/* Automatic: browser maps font-size to opsz axis */
body {
  font-optical-sizing: auto; /* default — recommended */
}

/* Manual: override optical size independent of font-size */
.big-text-small-optical-size {
  font-size: 48px;
  font-optical-sizing: none;
  font-variation-settings: 'opsz' 14; /* force "text" optical size */
}
```

## Animating Variable Fonts

Variable fonts enable previously impossible animations — smoothly transitioning between weights, stretching text on hover, or creating organic breathing effects.

```css
/* Weight animation on hover */
.animated-link {
  font-variation-settings: 'wght' 400;
  transition: font-variation-settings 200ms ease-out;
}

.animated-link:hover {
  font-variation-settings: 'wght' 700;
}

/* Width pulse animation */
@keyframes stretch-pulse {
  0%, 100% { font-variation-settings: 'wdth' 100; }
  50%       { font-variation-settings: 'wdth' 125; }
}

.pulsing-text {
  font-family: 'Barlow Condensed Variable';
  animation: stretch-pulse 2s ease-in-out infinite;
}
```

### React Animation with Framer Motion

```tsx
// components/AnimatedHeading/AnimatedHeading.tsx
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';

interface AnimatedHeadingProps {
  children: string;
  intensity?: number; // 0-1
}

export function AnimatedHeading({ children, intensity = 1 }: AnimatedHeadingProps) {
  const scrollY = useMotionValue(0);

  // Map scroll 0-200px to weight 400-800
  const fontWeight = useTransform(scrollY, [0, 200], [400, 400 + 400 * intensity]);
  const letterSpacing = useTransform(scrollY, [0, 200], [0, -0.05 * intensity]);

  useEffect(() => {
    const handleScroll = () => scrollY.set(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrollY]);

  return (
    <motion.h1
      style={​{
        fontVariationSettings: useTransform(
          fontWeight,
          (w) => `'wght' ${Math.round(w)}`
        ),
        letterSpacing: useTransform(letterSpacing, (ls) => `${ls}em`),
      }}
    >
      {children}
    </motion.h1>
  );
}
```

### Canvas/WebGL Text Animation

For high-performance variable font animation (60+ fps text effects):

```typescript
// Kinetic typography using HTML5 Canvas
class KineticText {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private text: string;
  private weight = 400;
  private targetWeight = 400;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement, text: string) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.text = text;
    this.animate();
  }

  private animate = () => {
    // Spring interpolation
    this.weight += (this.targetWeight - this.weight) * 0.08;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = `${Math.round(this.weight)} 60px Inter`;
    ctx.fillStyle = '#1a1a1a';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, 40, this.canvas.height / 2);

    this.raf = requestAnimationFrame(this.animate);
  };

  setWeight(weight: number) {
    this.targetWeight = Math.max(100, Math.min(900, weight));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }
}
```

## Optical Size in Practice

```css
/* Calibrated optical sizing for a type system */
.text-caption {
  font-size: var(--font-size-xs); /* 12.8px */
  font-optical-sizing: auto;
  /* Browser sets opsz ≈ 12 — thick strokes, open counters */
}

.text-body {
  font-size: var(--font-size-md); /* 16px */
  font-optical-sizing: auto;
  /* opsz ≈ 16 — standard text rendering */
}

.text-display {
  font-size: var(--font-size-5xl); /* 61px */
  font-optical-sizing: auto;
  /* opsz ≈ 61 — thin strokes, tight spacing */
}
```

## Discovering Axes

Not all variable fonts advertise their axes clearly. Use the CSS Font Loading API to inspect:

```typescript
// Inspect a loaded variable font's axes
async function inspectVariableFont(fontFamily: string): Promise<void> {
  await document.fonts.load(`400 1em ${fontFamily}`);

  for (const font of document.fonts) {
    if (font.family === fontFamily) {
      // @ts-expect-error — variationAxes is not in TypeScript types yet
      const axes = font.variationAxes;
      if (axes) {
        console.table(
          axes.map((axis: { tag: string; name: string; minimum: number; maximum: number; defaultValue: number }) => ({
            tag: axis.tag,
            name: axis.name,
            minimum: axis.minimum,
            maximum: axis.maximum,
            default: axis.defaultValue,
          }))
        );
      }
    }
  }
}
```

Or use tools: [wakamaifondue.com](https://wakamaifondue.com) (paste a font file to see all axes, features, and glyphs).

## File Size Optimization

### Subsetting Variable Fonts

Variable fonts can be subsetted just like static fonts:

```bash
# Subset Inter Variable to Latin only
pyftsubset \
  Inter.var.ttf \
  --output-file=inter-var-latin.woff2 \
  --flavor=woff2 \
  --layout-features="kern,liga,calt,ss01,ss02,tnum,lnum,onum,pnum" \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" \
  --axes="wght" \
  --axis-limits="wght=300:800"

# Result: 244KB → ~85KB
```

Key subsetting options:
- `--axes="wght"` — keep only the weight axis (remove width, slant, etc.)
- `--axis-limits="wght=300:800"` — limit weight range to only what you use
- Remove OpenType features you don't need (reduce by 10-20KB)

### Woff2 Compression

Ensure you're using WOFF2 (Brotli-compressed), not WOFF (zlib) or TTF:

```bash
# Check compression
ls -lh fonts/
# inter-var.ttf   → 3.2MB
# inter-var.woff  → 1.1MB
# inter-var.woff2 → 244KB  ← Use this

# Convert TTF to WOFF2 if needed
woff2_compress inter-var.ttf
```

## Browser Support and Fallbacks

Variable font support is excellent — 96%+ of browsers as of 2025. The main concern is older Android WebView and IE11.

```css
/* Progressive enhancement approach */
/* 1. Static fallback — always works */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
}

@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
}

/* 2. Variable font — overrides static for supporting browsers */
@supports (font-variation-settings: normal) {
  @font-face {
    font-family: 'Inter';
    src: url('/fonts/inter-var.woff2') format('woff2 supports variations'),
         url('/fonts/inter-var.woff2') format('woff2-variations');
    font-weight: 100 900;
    font-style: oblique 0deg 10deg;
  }
}
```

::: tip Modern approach
In 2026, you can safely use variable fonts without the `@supports` guard for consumer-facing web apps. Variable font support has exceeded 97% globally. The guard is only needed for enterprise apps with known IE11 requirements.
:::

## OpenType Features

Variable fonts typically include OpenType features — typographic refinements accessible via CSS:

```css
/* font-feature-settings reference */
.text-tabular-nums {
  font-variant-numeric: tabular-nums; /* same-width digits for tables */
  font-feature-settings: 'tnum' 1;   /* equivalent lower-level property */
}

.text-oldstyle-nums {
  font-variant-numeric: oldstyle-nums; /* figures that descend below baseline */
}

.text-fractions {
  font-variant-numeric: diagonal-fractions; /* proper 1⁄2 3⁄4 glyphs */
}

.text-smallcaps {
  font-variant-caps: small-caps; /* real small caps, not scaled caps */
}

.text-ligatures {
  font-variant-ligatures: common-ligatures; /* fi, fl, ff etc. */
}

/* Code with ligatures (for code fonts like JetBrains Mono) */
code {
  font-family: 'JetBrains Mono Variable', monospace;
  font-variant-ligatures: common-ligatures; /* =>  !=  ->  etc. */
  font-feature-settings: 'liga' 1, 'calt' 1; /* contextual alternates */
}

/* Dashboard: tabular numerics for alignment */
.metric-value {
  font-feature-settings: 'tnum' 1, 'lnum' 1; /* tabular + lining figures */
}
```

## Variable Font in a Design System

```typescript
// design-system/typography/fonts.ts
export interface VariableFontConfig {
  family: string;
  src: string[];
  axes: {
    wght?: [number, number];  // [min, max]
    wdth?: [number, number];
    ital?: [number, number];
    slnt?: [number, number];
    opsz?: [number, number];
  };
  customAxes?: Record<string, [number, number]>;
}

export const interConfig: VariableFontConfig = {
  family: 'Inter',
  src: [
    '/fonts/inter-var-latin.woff2',
  ],
  axes: {
    wght: [100, 900],
  },
};

// Generate CSS for a variable font
export function generateFontFaceCSS(config: VariableFontConfig): string {
  const { family, src, axes } = config;

  const fontWeight = axes.wght ? `${axes.wght[0]} ${axes.wght[1]}` : '400';
  const fontStyle = axes.slnt
    ? `oblique ${axes.slnt[0]}deg ${axes.slnt[1]}deg`
    : axes.ital
    ? 'italic'
    : 'normal';

  const srcList = src
    .map(url => `url('${url}') format('woff2 supports variations')`)
    .join(',\n    ');

  return `
@font-face {
  font-family: '${family}';
  src: ${srcList};
  font-weight: ${fontWeight};
  font-style: ${fontStyle};
  font-display: swap;
  font-optical-sizing: auto;
}`.trim();
}
```

## Performance Benchmarks

| Setup | Files | Total Size | First Paint (3G) |
|-------|-------|------------|-----------------|
| 9 static fonts, no preload | 9 | 392KB | 2.8s |
| 9 static fonts, preload critical | 9 | 392KB | 1.2s |
| 1 variable font, no preload | 1 | 244KB | 1.8s |
| 1 variable font, preloaded | 1 | 244KB | 0.7s |
| 1 variable font, subsetted + preloaded | 1 | 85KB | 0.3s |
| System font stack | 0 | 0KB | 0ms |

::: info War Story
A design system team at a large enterprise migrated from 12 static Roboto font files (loading all weights for compliance with the brand guide) to Roboto Flex variable font. The migration reduced font payload from 528KB to 98KB (after subsetting to the weight range 300-700 and Latin subset), eliminated 11 HTTP requests, and improved Lighthouse performance score from 72 to 94. The migration took 3 days including testing on legacy Android devices.
:::

## Edge Cases

### Variable Font + CSS Grid Layout

Animating font weight on a grid layout can cause reflow if the font changes metrics significantly. Characters in variable fonts often change width as weight changes:

```css
/* Problem: weight change causes line reflow */
.problematic {
  font-variation-settings: 'wght' 400;
  transition: font-variation-settings 0.3s;
}
.problematic:hover {
  font-variation-settings: 'wght' 700; /* Text gets wider → line breaks change */
}

/* Solution: constrain text to not affect layout on weight change */
.no-reflow-weight-change {
  /* Reserve space for boldest weight */
  font-variation-settings: 'wdth' 100, 'wght' 400;

  /* Option 1: Use invisible bold pseudo-element for space reservation */
  display: grid;
}
.no-reflow-weight-change::after {
  content: attr(data-text);
  font-weight: 700;
  height: 0;
  visibility: hidden;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  grid-area: 1 / 1; /* Same grid area */
}
```

### Optical Sizing Conflicts with Line Height

When `font-optical-sizing: auto` is enabled, the browser adjusts internal font metrics based on `font-size`. This can subtly affect line height calculations:

```css
/* Explicitly set line-height to prevent optical sizing interference */
.precise-layout {
  font-size: 16px;
  font-optical-sizing: auto;
  line-height: 1.5; /* Must be unitless — relative to actual font metrics */
}
```

### Woff2-Variations vs. Woff2 Supports Variations

Two formats for variable fonts in `@font-face`:

```css
src:
  url('font.woff2') format('woff2 supports variations'), /* Newer syntax */
  url('font.woff2') format('woff2-variations');          /* Older syntax, more support */
```

Include both for maximum compatibility. Modern browsers prefer the first matching format.
