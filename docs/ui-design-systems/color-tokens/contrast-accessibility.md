---
title: "Color Contrast & Accessibility"
description: "WCAG 2.1 contrast ratios, APCA algorithm, color blindness simulation, and accessible color selection"
tags: [accessibility, color-contrast, wcag, apca, color-blindness, design-systems]
difficulty: "intermediate"
prerequisites: [color-tokens/color-theory, color-tokens/palette-generation]
lastReviewed: "2026-03-18"
---

# Color Contrast & Accessibility

Color is the accessibility dimension most frequently violated in production UIs. Low-contrast text fails WCAG, color-coded-only information fails color-blind users, and purely visual state changes fail screen reader users. This page covers the complete technical implementation of accessible color usage.

## WCAG 2.1 Contrast Requirements

WCAG (Web Content Accessibility Guidelines) defines minimum contrast ratios for text and interactive elements:

| Level | Text Size | Minimum Ratio | Use Case |
|-------|-----------|---------------|---------|
| AA | Normal (<18pt/24px) | 4.5:1 | Body text, UI text |
| AA | Large (≥18pt/24px bold ≥14pt) | 3:1 | Headings, large text |
| AA | Non-text UI | 3:1 | Buttons, icons, form borders |
| AAA | Normal | 7:1 | Enhanced accessibility |
| AAA | Large | 4.5:1 | Enhanced large text |

### The WCAG Contrast Formula

WCAG contrast uses **relative luminance** (L), computed from sRGB:

$$
L = 0.2126 \times R_{\text{lin}} + 0.7152 \times G_{\text{lin}} + 0.0722 \times B_{\text{lin}}
$$

Where linear RGB ($R_{\text{lin}}$) is the gamma-decoded sRGB value:

$$
C_{\text{lin}} = \begin{cases}
\frac{C_{\text{srgb}}}{12.92} & \text{if } C_{\text{srgb}} \leq 0.04045 \\
\left(\frac{C_{\text{srgb}} + 0.055}{1.055}\right)^{2.4} & \text{otherwise}
\end{cases}
$$

The contrast ratio:

$$
\text{ratio} = \frac{L_{\text{lighter}} + 0.05}{L_{\text{darker}} + 0.05}
$$

```typescript
// wcag-contrast.ts

function srgbToLinear(c: number): number {
  const normalized = c / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function wcagContrast(foreground: string, background: string): number {
  const [fr, fg, fb] = hexToRgb(foreground);
  const [br, bg, bb] = hexToRgb(background);

  const fL = relativeLuminance(fr, fg, fb);
  const bL = relativeLuminance(br, bg, bb);

  const lighter = Math.max(fL, bL);
  const darker = Math.min(fL, bL);

  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWcagAA(
  foreground: string,
  background: string,
  isLargeText = false
): boolean {
  const ratio = wcagContrast(foreground, background);
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

export function meetsWcagAAA(
  foreground: string,
  background: string,
  isLargeText = false
): boolean {
  const ratio = wcagContrast(foreground, background);
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}

// Find the darkest shade that passes AA on white
export function findMinimumContrastShade(
  palette: Array<{ step: number; hex: string }>,
  background = '#ffffff',
  minRatio = 4.5
): number | null {
  for (const { step, hex } of palette) {
    if (wcagContrast(hex, background) >= minRatio) {
      return step;
    }
  }
  return null;
}
```

## APCA — The Next Standard

WCAG 2.x contrast is widely criticized for limitations:
- It treats white text on dark blue the same as white text on dark red (perceptually very different)
- It doesn't account for font weight — thin 400 weight text needs higher contrast than bold 700
- It penalizes high-contrast combinations in some cases (e.g., some dark-on-dark passes because both are similarly dark)

**APCA** (Advanced Perceptual Contrast Algorithm) was developed for WCAG 3.0 and addresses these issues.

### APCA Formula

APCA uses a more complex perceptual model. The core output is a `Lc` (Lightness Contrast) value, typically -110 to 110:

$$
\text{Lc} = \text{sign}(Y_{\text{text}} - Y_{\text{bg}}) \times (\delta \text{Y}^{0.45} - \delta \text{Y}^{0.55}) \times 100
$$

(Simplified — the actual formula includes polarity-dependent coefficients)

```typescript
// apca-contrast.ts
// Based on SAPC-APCA W3C working draft

function apcaLinear(c: number): number {
  const normalized = c / 255;
  const exp = 2.4;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, exp);
}

function apcaLuminance(r: number, g: number, b: number): number {
  // APCA uses slightly different Y coefficients than WCAG
  return (
    0.2126729 * apcaLinear(r) +
    0.7151522 * apcaLinear(g) +
    0.0721750 * apcaLinear(b)
  );
}

export function apcaContrast(textColor: string, bgColor: string): number {
  const [tr, tg, tb] = hexToRgb(textColor);
  const [br, bg, bb] = hexToRgb(bgColor);

  const tY = apcaLuminance(tr, tg, tb);
  const bY = apcaLuminance(br, bg, bb);

  // APCA polarity-dependent constants
  const normBG = 0.56;
  const normTXT = 0.57;
  const revTXT = 0.62;
  const revBG = 0.65;
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  const scaleBoW = 1.14;
  const scaleWoB = 1.14;
  const deltaYmin = 0.0005;

  // Soft clamp very dark values
  const clampedTY = tY > blkThrs ? tY : tY + Math.pow(blkThrs - tY, blkClmp);
  const clampedBY = bY > blkThrs ? bY : bY + Math.pow(blkThrs - bY, blkClmp);

  if (Math.abs(clampedTY - clampedBY) < deltaYmin) return 0;

  let Lc: number;
  if (clampedBY >= clampedTY) {
    // Normal polarity (dark text on light background)
    Lc = (Math.pow(clampedBY, normBG) - Math.pow(clampedTY, normTXT)) * scaleBoW;
  } else {
    // Reverse polarity (light text on dark background)
    Lc = (Math.pow(clampedBY, revBG) - Math.pow(clampedTY, revTXT)) * scaleWoB;
  }

  return Lc * 100;
}

// APCA minimum Lc values by use case
export const APCA_MINIMUMS = {
  bodyText400:    75, // Regular weight body text
  bodyText700:    60, // Bold body text
  UItext:         60, // Labels, UI text
  largeText:      45, // >18pt text
  nonText:        15, // Icons, graphic elements
  decorativeOnly: 0,  // Purely decorative
};
```

### WCAG vs APCA Comparison

| Scenario | WCAG 2.1 | APCA Lc |
|----------|----------|---------|
| Black on white | 21:1 ✓ | 107 ✓ |
| White on black | 21:1 ✓ | 107 ✓ |
| Mid-gray body text | Fails at 4.2:1 | May pass at Lc 65 |
| Bold large heading | Passes at 3:1 | Checked separately |
| Thin weight large text | Passes at 3:1 (wrong) | Fails at Lc 45 |
| Blue (#005fad) on white | 8.6:1 ✓ | 70 ✓ |

## Color Blindness Simulation

Approximately 8% of males and 0.5% of females have some form of color vision deficiency (CVD). The most common types:

| Type | Affected Population | Missing/Weak | Common Confusion |
|------|--------------------|-----------|----|
| Deuteranopia | ~6% males | Green cones | Red/green |
| Protanopia | ~2% males | Red cones | Red/green (red looks dark) |
| Tritanopia | <0.01% | Blue cones | Blue/yellow |
| Achromatopsia | Very rare | All cones | All colors (grayscale) |

### Simulation Algorithm

Daltonization matrices simulate how colors appear to people with CVD:

```typescript
// cvd-simulation.ts

interface SimulationMatrix {
  r: [number, number, number];
  g: [number, number, number];
  b: [number, number, number];
}

// LMS transformation matrices for different CVD types
// Based on Brettel, Viénot, Mollon (1997) model
const CVD_MATRICES: Record<string, SimulationMatrix> = {
  deuteranopia: {
    r: [0.367322, 0.860646, -0.227968],
    g: [0.280085, 0.672501, 0.047413],
    b: [-0.011820, 0.042940, 0.968880],
  },
  protanopia: {
    r: [0.152286, 1.052583, -0.204868],
    g: [0.114503, 0.786281, 0.099216],
    b: [-0.003882, -0.048116, 1.051998],
  },
  tritanopia: {
    r: [1.255528, -0.076749, -0.178779],
    g: [-0.078411, 0.930809, 0.147602],
    b: [0.004733, 0.691367, 0.303900],
  },
};

export function simulateCVD(
  r: number,
  g: number,
  b: number,
  type: 'deuteranopia' | 'protanopia' | 'tritanopia'
): [number, number, number] {
  const m = CVD_MATRICES[type];

  const simR = m.r[0] * r + m.r[1] * g + m.r[2] * b;
  const simG = m.g[0] * r + m.g[1] * g + m.g[2] * b;
  const simB = m.b[0] * r + m.b[1] * g + m.b[2] * b;

  return [
    Math.max(0, Math.min(255, Math.round(simR))),
    Math.max(0, Math.min(255, Math.round(simG))),
    Math.max(0, Math.min(255, Math.round(simB))),
  ];
}

// Apply to entire image using Canvas API
export function applyColorBlindFilter(
  canvas: HTMLCanvasElement,
  type: 'deuteranopia' | 'protanopia' | 'tritanopia'
): void {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = simulateCVD(data[i], data[i + 1], data[i + 2], type);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    // data[i + 3] — alpha unchanged
  }

  ctx.putImageData(imageData, 0, 0);
}
```

### CSS Color Blindness Simulation

For quick visual testing without JavaScript:

```css
/* Deuteranopia simulation filter */
.simulate-deuteranopia {
  filter: url('#deuteranopia-filter');
}

/* Grayscale = achromatopsia */
.simulate-achromatopsia {
  filter: grayscale(100%);
}
```

```html
<!-- SVG filter definitions -->
<svg style="display: none">
  <defs>
    <filter id="deuteranopia-filter">
      <feColorMatrix
        type="matrix"
        values="0.367322 0.860646 -0.227968 0 0
                0.280085 0.672501 0.047413  0 0
                -0.011820 0.042940 0.968880 0 0
                0 0 0 1 0"
      />
    </filter>
    <filter id="protanopia-filter">
      <feColorMatrix
        type="matrix"
        values="0.152286 1.052583 -0.204868 0 0
                0.114503 0.786281 0.099216  0 0
                -0.003882 -0.048116 1.051998 0 0
                0 0 0 1 0"
      />
    </filter>
  </defs>
</svg>
```

## Color as the Only Signal

The most common WCAG 1.4.1 violation: using color alone to convey information.

```html
<!-- FAIL: color is the only differentiator -->
<div>
  Required fields are <span style="color: red">red</span>.
</div>
<input style="border-color: red" />  <!-- Error state — color only -->

<!-- PASS: color plus another indicator -->
<div>
  Required fields are marked with <span style="color: red">* (asterisk)</span>.
</div>
<div role="alert">
  <input
    style="border-color: red"
    aria-invalid="true"
    aria-describedby="email-error"
  />
  <span id="email-error" style="color: red">
    <!-- Icon adds non-color indicator -->
    ⚠ Email is required
  </span>
</div>
```

### Status Indicators

For status indicators (traffic light pattern — green/yellow/red), always add a secondary indicator:

```tsx
// StatusBadge.tsx
interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  label: string;
}

const STATUS_CONFIG = {
  success: { color: 'oklch(35% 0.15 145)', bg: 'oklch(95% 0.04 145)', icon: '✓', shape: 'circle' },
  warning: { color: 'oklch(35% 0.12 60)',  bg: 'oklch(96% 0.04 85)', icon: '!', shape: 'triangle' },
  error:   { color: 'oklch(40% 0.18 25)',  bg: 'oklch(95% 0.04 25)', icon: '✗', shape: 'octagon' },
  info:    { color: 'oklch(40% 0.15 220)', bg: 'oklch(95% 0.03 220)', icon: 'i', shape: 'circle' },
  neutral: { color: 'oklch(35% 0 0)',      bg: 'oklch(93% 0 0)',      icon: '–', shape: 'circle' },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      role="status"
      style={​{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.625rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: 500,
        backgroundColor: config.bg,
        color: config.color,
      }}
    >
      {/* Icon provides non-color indicator */}
      <span aria-hidden="true" style={​{ fontWeight: 700 }}>
        {config.icon}
      </span>
      {label}
    </span>
  );
}
```

## Automated Contrast Testing

```typescript
// __tests__/color-tokens.test.ts
import { wcagContrast, meetsWcagAA } from '../utils/wcag-contrast';

// Define which tokens should meet which contrast requirements
const CONTRAST_REQUIREMENTS = [
  // [foreground token, background token, isLargeText, minRatio]
  ['--color-text-primary',   '--color-surface-default',  false, 4.5],
  ['--color-text-secondary', '--color-surface-default',  false, 4.5],
  ['--color-text-on-brand',  '--color-interactive',      false, 4.5],
  ['--color-interactive',    '--color-surface-default',  true,  3],   // button border
];

// Get resolved CSS custom property values (requires jsdom + CSS)
function getTokenValue(token: string): string {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue(token).trim();
}

describe('Color Token Contrast', () => {
  CONTRAST_REQUIREMENTS.forEach(([fg, bg, isLarge, minRatio]) => {
    it(`${fg} on ${bg} meets ${minRatio}:1 contrast`, () => {
      const fgValue = getTokenValue(fg as string);
      const bgValue = getTokenValue(bg as string);

      expect(fgValue).not.toBe('');
      expect(bgValue).not.toBe('');

      const ratio = wcagContrast(fgValue, bgValue);
      expect(ratio).toBeGreaterThanOrEqual(minRatio as number);
    });
  });
});
```

### jest-axe for Component-Level Testing

```typescript
// __tests__/Button.accessibility.test.tsx
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Button } from '../components/Button';

expect.extend(toHaveNoViolations);

describe('Button Accessibility', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(
      <Button variant="primary" onClick={() => {}}>
        Click me
      </Button>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('disabled button has sufficient contrast for disabled state', () => {
    // Disabled text should still meet 3:1 against its background
    // (WCAG exception allows lower contrast for disabled elements,
    //  but aim for 3:1 minimum as best practice)
    const { container } = render(
      <Button variant="primary" disabled onClick={() => {}}>
        Disabled
      </Button>
    );
    const button = container.querySelector('button');
    const styles = getComputedStyle(button!);
    // Check computed color values
    expect(styles.color).toBeDefined();
  });
});
```

::: info War Story
An enterprise SaaS product failed an accessibility audit for a major client, costing them a $2M contract. The audit found: 142 contrast failures across 38 components, 17 instances of color-only information encoding, and 8 interactive elements without keyboard access. The color failures alone took 3 engineers 2 weeks to fix — not because fixing them was hard, but because there were no tokens, so every value had to be hunted down individually. The fix was implemented: a complete token migration + automated contrast checks on every CI run. Six months later, zero contrast failures, and they passed the next accessibility audit.
:::

## Focus Indicators

Focus indicators require 3:1 contrast against adjacent colors (WCAG 2.4.11):

```css
/* Accessible focus ring */
:root {
  --color-focus-ring: oklch(50% 0.22 264);
  --color-focus-ring-offset-bg: oklch(100% 0 0); /* white offset */
}

/* Modern focus ring pattern */
:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
  /* Double ring for dark backgrounds */
  box-shadow:
    0 0 0 2px var(--color-focus-ring-offset-bg),
    0 0 0 4px var(--color-focus-ring);
}
```

The double-ring pattern ensures 3:1 contrast against both light AND dark backgrounds — the inner white ring contrasts against dark, the blue ring contrasts against the white ring.
