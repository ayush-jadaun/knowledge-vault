---
title: "Spacing Scale & Tokens"
description: "4px/8px grid mathematics, spacing token generation, semantic spacing, and layout-aware token systems"
tags: [spacing, design-tokens, css, grid-system, design-systems]
difficulty: "intermediate"
prerequisites: [spacing-layout/index]
lastReviewed: "2026-03-18"
---

# Spacing Scale & Tokens

A spacing scale is the contract that makes every component in a system align visually with every other component. When every gap, padding, and margin comes from the same mathematical set, the result is an interface with inherent visual harmony.

## The Mathematics of the 4px Grid

The 4px grid originates from the typical display pixel density and human perception thresholds. At 1x display density (96 DPI), 1px ≈ 0.26mm. 4px ≈ 1mm — a perceivable minimum unit. Everything below 4px starts to blur the distinction between "spacing" and "alignment."

The grid ensures:

$$
\text{total height} = \sum_{i} \text{height}_i + \sum_{j} \text{gap}_j
$$

where every $\text{height}_i$ and $\text{gap}_j$ is a multiple of 4px — so the total is always a multiple of 4px.

This means:
- Stack any two 4px-aligned components and the result is 4px-aligned
- Any combination of spacings in the system produces predictable totals
- Layouts align across different components without manual adjustment

### Why Not 5px or 10px?

| Base | Binary multiples | Screen pixel density |
|------|-----------------|---------------------|
| 4px  | 4, 8, 16, 32, 64 — all powers of 2 | Aligns at 1x, 2x (Retina), 3x |
| 5px  | 5, 10, 20, 40, 80 — not binary | Causes sub-pixel rendering at 1.5x density |
| 8px  | 8, 16, 32, 64 — cleanest | Good but fewer intermediate steps |
| 10px | 10, 20, 30, 40 — base 10 | Familiar but misaligns at non-1x density |

4px gives you the most intermediate steps (2, 4, 6, 8, 12, 16...) while maintaining perfect alignment at common screen densities.

## Full Scale Definition

```typescript
// tokens/spacing.ts

export const spacingTokens = {
  // Sub-unit values
  px: '1px',
  '0':   '0',
  '0.5': '0.125rem',  /* 2px  */
  '1':   '0.25rem',   /* 4px  */
  '1.5': '0.375rem',  /* 6px  */
  '2':   '0.5rem',    /* 8px  */
  '2.5': '0.625rem',  /* 10px */
  '3':   '0.75rem',   /* 12px */
  '3.5': '0.875rem',  /* 14px */

  // Main scale (4px increments)
  '4':   '1rem',      /* 16px — 1 unit */
  '5':   '1.25rem',   /* 20px */
  '6':   '1.5rem',    /* 24px — 1.5 units */
  '7':   '1.75rem',   /* 28px */
  '8':   '2rem',      /* 32px — 2 units */
  '9':   '2.25rem',   /* 36px */
  '10':  '2.5rem',    /* 40px */
  '11':  '2.75rem',   /* 44px — min touch target */
  '12':  '3rem',      /* 48px */
  '14':  '3.5rem',    /* 56px */
  '16':  '4rem',      /* 64px */
  '20':  '5rem',      /* 80px */
  '24':  '6rem',      /* 96px */
  '28':  '7rem',      /* 112px */
  '32':  '8rem',      /* 128px */
  '36':  '9rem',      /* 144px */
  '40':  '10rem',     /* 160px */
  '44':  '11rem',     /* 176px */
  '48':  '12rem',     /* 192px */
  '52':  '13rem',     /* 208px */
  '56':  '14rem',     /* 224px */
  '60':  '15rem',     /* 240px */
  '64':  '16rem',     /* 256px */
  '72':  '18rem',     /* 288px */
  '80':  '20rem',     /* 320px */
  '96':  '24rem',     /* 384px */
} as const;

// Generate CSS custom properties
export function spacingToCss(prefix = 'space'): string {
  return `:root {\n${
    Object.entries(spacingTokens)
      .map(([key, val]) => `  --${prefix}-${key}: ${val};`)
      .join('\n')
  }\n}`;
}
```

## Semantic Spacing Tokens

Semantic spacing tokens describe purpose, not dimension. They reference the primitive scale:

```css
:root {
  /* Component internal spacing */
  --space-component-xs: var(--space-1);    /* 4px  — tight button padding */
  --space-component-sm: var(--space-2);    /* 8px  — compact components */
  --space-component-md: var(--space-3);    /* 12px — default component spacing */
  --space-component-lg: var(--space-4);    /* 16px — generous component spacing */
  --space-component-xl: var(--space-6);    /* 24px — spacious components */

  /* Between related components */
  --space-related-xs: var(--space-2);      /* 8px  — very tight grouping */
  --space-related-sm: var(--space-3);      /* 12px — tight grouping */
  --space-related-md: var(--space-4);      /* 16px — default grouping */
  --space-related-lg: var(--space-6);      /* 24px — loose grouping */

  /* Between sections */
  --space-section-sm: var(--space-8);      /* 32px — small section gap */
  --space-section-md: var(--space-12);     /* 48px — standard section gap */
  --space-section-lg: var(--space-16);     /* 64px — large section gap */
  --space-section-xl: var(--space-24);     /* 96px — hero section gap */

  /* Page layout */
  --space-page-gutter-sm: var(--space-4);  /* 16px — mobile gutter */
  --space-page-gutter-md: var(--space-8);  /* 32px — tablet gutter */
  --space-page-gutter-lg: var(--space-12); /* 48px — desktop gutter */
  --space-page-gutter-xl: var(--space-16); /* 64px — wide desktop */

  /* Inset (uniform padding all sides) */
  --inset-xs:    var(--space-1);           /* 4px  */
  --inset-sm:    var(--space-2);           /* 8px  */
  --inset-md:    var(--space-4);           /* 16px */
  --inset-lg:    var(--space-6);           /* 24px */
  --inset-xl:    var(--space-8);           /* 32px */
  --inset-2xl:   var(--space-12);          /* 48px */

  /* Squish inset (more horizontal than vertical) */
  --inset-squish-sm:  var(--space-1) var(--space-2);  /* 4px 8px */
  --inset-squish-md:  var(--space-2) var(--space-4);  /* 8px 16px */
  --inset-squish-lg:  var(--space-3) var(--space-6);  /* 12px 24px */

  /* Stretch inset (more vertical than horizontal) */
  --inset-stretch-sm: var(--space-4) var(--space-2);  /* 16px 8px */
  --inset-stretch-md: var(--space-6) var(--space-4);  /* 24px 16px */

  /* Stack (vertical rhythm between elements) */
  --stack-xs:   var(--space-1);            /* 4px  */
  --stack-sm:   var(--space-2);            /* 8px  */
  --stack-md:   var(--space-4);            /* 16px */
  --stack-lg:   var(--space-6);            /* 24px */
  --stack-xl:   var(--space-8);            /* 32px */
  --stack-2xl:  var(--space-12);           /* 48px */

  /* Inline (horizontal spacing between items) */
  --inline-xs:  var(--space-1);            /* 4px  */
  --inline-sm:  var(--space-2);            /* 8px  */
  --inline-md:  var(--space-4);            /* 16px */
  --inline-lg:  var(--space-6);            /* 24px */
}
```

## The Spacing Design Language

Nathan Curtis (EightShapes) established vocabulary for spacing types that maps well to CSS properties:

| Spacing Type | Description | CSS Properties |
|-------------|-------------|---------------|
| **Inset** | Padding within a component | `padding` |
| **Inset-squish** | Top/bottom < left/right | `padding: 8px 16px` |
| **Inset-stretch** | Top/bottom > left/right | `padding: 16px 8px` |
| **Stack** | Vertical space between items | `margin-bottom`, `gap` in column flex |
| **Inline** | Horizontal space between items | `margin-right`, `gap` in row flex |
| **Grid** | Both axes between items | CSS `gap` |

```css
/* Button: squish inset */
.button {
  padding: var(--inset-squish-md); /* 8px 16px */
}

/* Card: standard inset */
.card {
  padding: var(--inset-lg); /* 24px all sides */
}

/* Form fields: stack */
.form-group + .form-group {
  margin-block-start: var(--stack-md); /* 16px between fields */
}

/* Navigation links: inline */
.nav-list {
  display: flex;
  gap: var(--inline-md); /* 16px between nav items */
}
```

## Component-Specific Spacing Tokens

For complex components, define explicit component tokens:

```css
/* Card component tokens */
:root {
  /* Card layout */
  --card-padding:          var(--inset-lg);    /* 24px */
  --card-padding-compact:  var(--inset-md);    /* 16px */
  --card-gap:              var(--stack-md);    /* 16px between card sections */
  --card-border-radius:    0.75rem;            /* 12px */

  /* Form component tokens */
  --form-label-gap:        var(--space-1-5);   /* 6px — label to input */
  --form-input-padding:    var(--inset-squish-md); /* 8px 16px */
  --form-group-gap:        var(--space-4);     /* 16px between fields */
  --form-section-gap:      var(--space-8);     /* 32px between sections */

  /* Button tokens */
  --button-padding-sm:     var(--space-1-5) var(--space-3); /* 6px 12px */
  --button-padding-md:     var(--space-2) var(--space-4);   /* 8px 16px */
  --button-padding-lg:     var(--space-3) var(--space-6);   /* 12px 24px */
  --button-gap:            var(--space-2);     /* 8px between icon and text */

  /* Table tokens */
  --table-cell-padding:    var(--space-3) var(--space-4); /* 12px 16px */
  --table-header-padding:  var(--space-3) var(--space-4);

  /* Modal tokens */
  --modal-padding:         var(--inset-xl);    /* 32px */
  --modal-header-gap:      var(--space-6);     /* 24px below header */
  --modal-footer-gap:      var(--space-6);     /* 24px above footer */
}
```

## Fluid Spacing

Just as fluid typography scales with viewport, fluid spacing prevents over-spaced mobile layouts:

```css
:root {
  /* Fluid spacing — scales from mobile to desktop */
  --space-fluid-sm:  clamp(0.5rem, 1vw, 1rem);        /* 8px → 16px */
  --space-fluid-md:  clamp(1rem, 2.5vw, 2rem);        /* 16px → 32px */
  --space-fluid-lg:  clamp(1.5rem, 4vw, 3rem);        /* 24px → 48px */
  --space-fluid-xl:  clamp(2rem, 6vw, 4rem);          /* 32px → 64px */
  --space-fluid-2xl: clamp(3rem, 8vw, 6rem);          /* 48px → 96px */

  /* Section spacing — generous on desktop, tight on mobile */
  --space-section-fluid: clamp(3rem, 8vw + 1rem, 8rem); /* 48px → 128px */
}
```

## TypeScript Spacing Utilities

```typescript
// utils/spacing.ts

type SpacingKey = keyof typeof spacingTokens;

/**
 * Returns a CSS custom property reference for a spacing token.
 * Usage: padding(4) → "var(--space-4)"
 */
export function spacing(key: SpacingKey): string {
  return `var(--space-${key})`;
}

/**
 * Multi-value shorthand builder
 * Usage: padding(4, 6) → "var(--space-4) var(--space-6)"
 */
export function spacingMulti(...keys: SpacingKey[]): string {
  return keys.map(k => `var(--space-${k})`).join(' ');
}

/**
 * Inset helper (uniform padding)
 * Usage: inset('md') → "var(--inset-md)"
 */
export function inset(size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'): string {
  return `var(--inset-${size})`;
}

// React inline style helper
interface SpacingProps {
  p?: SpacingKey;  // padding all sides
  px?: SpacingKey; // padding horizontal
  py?: SpacingKey; // padding vertical
  pt?: SpacingKey; // padding top
  pr?: SpacingKey; // padding right
  pb?: SpacingKey; // padding bottom
  pl?: SpacingKey; // padding left
  m?: SpacingKey;  // margin all sides
  mx?: SpacingKey; // margin horizontal
  my?: SpacingKey; // margin vertical
  mt?: SpacingKey; // margin top
  mr?: SpacingKey; // margin right
  mb?: SpacingKey; // margin bottom
  ml?: SpacingKey; // margin left
  gap?: SpacingKey;
  gapX?: SpacingKey;
  gapY?: SpacingKey;
}

export function spacingStyles(props: SpacingProps): React.CSSProperties {
  const styles: React.CSSProperties = {};

  if (props.p)  styles.padding         = spacing(props.p);
  if (props.px) { styles.paddingLeft   = spacing(props.px); styles.paddingRight = spacing(props.px); }
  if (props.py) { styles.paddingTop    = spacing(props.py); styles.paddingBottom = spacing(props.py); }
  if (props.pt) styles.paddingTop      = spacing(props.pt);
  if (props.pr) styles.paddingRight    = spacing(props.pr);
  if (props.pb) styles.paddingBottom   = spacing(props.pb);
  if (props.pl) styles.paddingLeft     = spacing(props.pl);

  if (props.m)  styles.margin          = spacing(props.m);
  if (props.mx) { styles.marginLeft    = spacing(props.mx); styles.marginRight = spacing(props.mx); }
  if (props.my) { styles.marginTop     = spacing(props.my); styles.marginBottom = spacing(props.my); }
  if (props.mt) styles.marginTop       = spacing(props.mt);
  if (props.mr) styles.marginRight     = spacing(props.mr);
  if (props.mb) styles.marginBottom    = spacing(props.mb);
  if (props.ml) styles.marginLeft      = spacing(props.ml);

  if (props.gap)  styles.gap           = spacing(props.gap);
  if (props.gapX) styles.columnGap     = spacing(props.gapX);
  if (props.gapY) styles.rowGap        = spacing(props.gapY);

  return styles;
}
```

## Touch Target Spacing

Minimum touch target sizes for accessibility (WCAG 2.5.5):

```css
/* Minimum touch target: 44×44px */
:root {
  --touch-target-min: var(--space-11); /* 44px */
  --touch-target-comfortable: var(--space-12); /* 48px */
}

/* Interactive elements must meet minimum */
.button,
.link,
[role="button"] {
  min-height: var(--touch-target-min);
  min-width: var(--touch-target-min);
}

/* For small visual elements, use padding to expand touch area */
.icon-button {
  /* Visual icon: 24×24px */
  width: 1.5rem;
  height: 1.5rem;

  /* Touch target: 44×44px */
  padding: calc((var(--touch-target-min) - 1.5rem) / 2);
}

/* Or use ::after pseudo-element to expand hit area */
.small-link {
  position: relative;
}
.small-link::after {
  content: '';
  position: absolute;
  inset: -12px; /* Expand tap area by 12px in all directions */
}
```

## Spacing Audit Tool

```typescript
// scripts/spacing-audit.ts
// Check that all spacing values in CSS match the token scale

const VALID_SPACING_PX = new Set([
  0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48,
  56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256,
]);

interface SpacingViolation {
  value: string;
  file: string;
  line: number;
  suggestion: string;
}

function nearestValidSpacing(px: number): number {
  return Array.from(VALID_SPACING_PX).reduce((prev, curr) =>
    Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev
  );
}

// Used with PostCSS to lint spacing values
export const spacingLintPlugin = {
  postcssPlugin: 'postcss-spacing-lint',
  Declaration(decl: import('postcss').Declaration) {
    const spacingProps = ['padding', 'margin', 'gap', 'top', 'right', 'bottom', 'left', 'inset'];
    const prop = decl.prop.replace(/^-webkit-|-moz-/, '');

    if (!spacingProps.some(p => prop.startsWith(p))) return;
    if (decl.value.includes('var(--space')) return; // Using tokens — OK
    if (decl.value === '0' || decl.value === 'auto') return;

    const pxMatch = decl.value.match(/^(\d+(?:\.\d+)?)px$/);
    if (pxMatch) {
      const px = parseFloat(pxMatch[1]);
      if (!VALID_SPACING_PX.has(px)) {
        const nearest = nearestValidSpacing(px);
        decl.warn(decl.root() as any, `Spacing value ${px}px is not on the 4px grid. Nearest: ${nearest}px`);
      }
    }
  },
};
```

::: info War Story
A product team built a dashboard with "eyeballed" spacing. The codebase had 847 unique padding/margin values across 200 components, ranging from 3px to 97px. When a redesign required increasing overall density (reducing most spacings by 20%), the engineering team had to manually update every component. It took 6 engineers 3 weeks. After migrating to a token system with 20 spacing values, the same redesign change took 2 engineers 2 days — updating 20 token values and testing all components.
:::
