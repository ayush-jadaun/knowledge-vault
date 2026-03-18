---
title: "Dark Mode Token Mapping"
description: "Light-to-dark semantic token remapping, OKLCH lightness adjustments, and systematic palette adaptation"
tags: [dark-mode, color-tokens, oklch, theming, design-systems]
difficulty: "intermediate"
prerequisites: [dark-mode/index, color-tokens/semantic-tokens, color-tokens/palette-generation]
lastReviewed: "2026-03-18"
---

# Dark Mode Token Mapping

Token mapping is the process of defining dark-mode values for every semantic token. This requires more than inverting lightness values — it requires understanding how each token is used and what perceptual properties must be maintained in dark context.

## Mapping Strategy

For each semantic token category, there is a different adaptation strategy:

| Category | Light Mode Behavior | Dark Mode Adaptation |
|----------|--------------------|--------------------|
| Surfaces | White/light → elevation via shadow | Dark → elevation via lightness |
| Text | Dark on light | Light on dark, reduced contrast extremes |
| Brand/Interactive | Saturated, medium lightness | Higher lightness, lower chroma |
| Status colors | Standard saturation | Higher lightness, lower chroma |
| Borders | Subtle light dividers | Subtle dark dividers |

## OKLCH Lightness Mapping

The systematic approach uses OKLCH. For a token at lightness $L$ in light mode, the dark mode equivalent is approximately:

$$
L_{\text{dark}} = 1 - L_{\text{light}} + \Delta L
$$

Where $\Delta L$ is a correction factor based on category:

| Category | $\Delta L$ | Reason |
|----------|-----------|--------|
| Surfaces | -0.05 | Avoid pure white; surfaces should be muted |
| Text primary | -0.03 | Slightly reduce contrast extremes |
| Brand | +0.15 | Brand colors need to be lighter to stand out on dark bg |
| Status success/warning | +0.1 | Same — need more lightness on dark |
| Borders | 0 | Borders should be similarly subtle |

```typescript
// dark-mode-mapper.ts
import { converter, formatCss } from 'culori';

const toOklch = converter('oklch');
const fromOklch = converter('rgb');

interface TokenCategory {
  name: string;
  lightnessDelta: number;
  chromaScale?: number; // Multiplier for chroma
  hueShift?: number;    // Degrees to shift hue
}

const CATEGORIES: Record<string, TokenCategory> = {
  surface: {
    name: 'Surface',
    lightnessDelta: -0.05,
    chromaScale: 0.5, // Reduce saturation for dark surfaces
  },
  text: {
    name: 'Text',
    lightnessDelta: -0.03,
    chromaScale: 0.8,
  },
  brand: {
    name: 'Brand/Interactive',
    lightnessDelta: 0.15,
    chromaScale: 0.75, // Reduce chroma to avoid harshness
  },
  status: {
    name: 'Status',
    lightnessDelta: 0.12,
    chromaScale: 0.8,
  },
  border: {
    name: 'Border',
    lightnessDelta: 0,
    chromaScale: 1.0,
  },
};

export function mapToDarkMode(
  lightHex: string,
  category: keyof typeof CATEGORIES
): string {
  const opts = CATEGORIES[category];
  const oklch = toOklch(lightHex);
  if (!oklch) throw new Error(`Invalid color: ${lightHex}`);

  const { l = 0.5, c = 0, h = 0 } = oklch;

  // Invert lightness with correction
  const darkL = Math.max(0, Math.min(1, 1 - l + opts.lightnessDelta));
  const darkC = c * (opts.chromaScale ?? 1);
  const darkH = (h + (opts.hueShift ?? 0) + 360) % 360;

  const darkOklch = { mode: 'oklch' as const, l: darkL, c: darkC, h: darkH };
  return formatCss(darkOklch) ?? lightHex;
}
```

## Complete Token Mapping Table

```css
/* ================================================
   COMPLETE LIGHT/DARK TOKEN MAPPING
   ================================================ */

:root {
  /* ---- Surface Tokens ---- */
  --color-surface-page:    oklch(97%  0.002 264);
  --color-surface-default: oklch(100% 0     0);
  --color-surface-raised:  oklch(100% 0     0);
  --color-surface-overlay: oklch(100% 0     0);
  --color-surface-sunken:  oklch(94%  0.005 264);
  --color-surface-tooltip: oklch(15%  0     0);

  /* ---- Text Tokens ---- */
  --color-text-primary:   oklch(12% 0     0);
  --color-text-secondary: oklch(35% 0.01  264);
  --color-text-tertiary:  oklch(55% 0.01  264);
  --color-text-disabled:  oklch(70% 0.005 264);
  --color-text-inverse:   oklch(98% 0     0);
  --color-text-link:      oklch(50% 0.22  264);

  /* ---- Brand Tokens ---- */
  --color-brand:           oklch(50% 0.22 264);
  --color-brand-hover:     oklch(43% 0.22 264);
  --color-brand-light:     oklch(95% 0.04 264);
  --color-brand-text:      oklch(98% 0    0);

  /* ---- Status Tokens ---- */
  --color-success:         oklch(45% 0.18 145);
  --color-success-surface: oklch(95% 0.04 145);
  --color-warning:         oklch(55% 0.16 85);
  --color-warning-surface: oklch(96% 0.04 85);
  --color-danger:          oklch(50% 0.20 25);
  --color-danger-surface:  oklch(95% 0.04 25);
  --color-info:            oklch(50% 0.18 220);
  --color-info-surface:    oklch(95% 0.03 220);

  /* ---- Border Tokens ---- */
  --color-border-default:  oklch(88% 0.01 264);
  --color-border-strong:   oklch(75% 0.02 264);
  --color-border-subtle:   oklch(93% 0.005 264);
  --color-border-focus:    oklch(50% 0.22 264);
}

/* ---- DARK MODE OVERRIDES ---- */

[data-theme="dark"],
@media (prefers-color-scheme: dark) {
  :root {
    /* ---- Surface Tokens (dark) ---- */
    /* Light mode logic: higher L = higher elevation
       Dark mode logic: lower L = lower elevation, higher L = raised */
    --color-surface-page:    oklch(9%  0.003 264); /* Darkest — behind everything */
    --color-surface-default: oklch(13% 0.003 264); /* Base cards */
    --color-surface-raised:  oklch(17% 0.003 264); /* Raised cards, dropdowns */
    --color-surface-overlay: oklch(20% 0.003 264); /* Modals */
    --color-surface-sunken:  oklch(10% 0.003 264); /* Inputs, inset areas */
    --color-surface-tooltip: oklch(25% 0.003 264); /* Tooltips on dark */

    /* ---- Text Tokens (dark) ---- */
    --color-text-primary:   oklch(92% 0     0);    /* High contrast on dark */
    --color-text-secondary: oklch(65% 0.01  264);  /* Reduced — still readable */
    --color-text-tertiary:  oklch(45% 0.01  264);  /* Placeholders */
    --color-text-disabled:  oklch(35% 0.005 264);  /* Disabled elements */
    --color-text-inverse:   oklch(12% 0     0);    /* Dark text on light bg elements */
    --color-text-link:      oklch(70% 0.18  264);  /* Brighter for dark bg */

    /* ---- Brand Tokens (dark) ---- */
    /* Brand colors need more lightness to be visible on dark surfaces */
    --color-brand:           oklch(68% 0.18 264);  /* Brighter blue */
    --color-brand-hover:     oklch(75% 0.15 264);  /* Even brighter on hover */
    --color-brand-light:     oklch(18% 0.06 264);  /* Dark tinted surface */
    --color-brand-text:      oklch(98% 0    0);

    /* ---- Status Tokens (dark) ---- */
    --color-success:         oklch(60% 0.16 145);  /* Brighter green */
    --color-success-surface: oklch(15% 0.06 145);  /* Dark green tint */
    --color-warning:         oklch(70% 0.14 85);   /* Brighter amber */
    --color-warning-surface: oklch(15% 0.06 85);   /* Dark amber tint */
    --color-danger:          oklch(65% 0.18 25);   /* Brighter red */
    --color-danger-surface:  oklch(15% 0.07 25);   /* Dark red tint */
    --color-info:            oklch(65% 0.16 220);  /* Brighter teal */
    --color-info-surface:    oklch(15% 0.05 220);

    /* ---- Border Tokens (dark) ---- */
    --color-border-default:  oklch(25% 0.01 264);  /* Subtle dark borders */
    --color-border-strong:   oklch(35% 0.015 264);
    --color-border-subtle:   oklch(18% 0.005 264); /* Nearly invisible */
    --color-border-focus:    oklch(70% 0.18 264);  /* Bright focus ring */
  }
}
```

## Shadow Adaptation

Shadows (elevation) must be adapted for dark mode. Dark mode doesn't use black shadows on dark surfaces — instead, use lighter surfaces or subtle inner highlights:

```css
:root {
  /* Light mode: shadows provide elevation */
  --shadow-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --shadow-xl:  0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

[data-theme="dark"] {
  /* Dark mode: lighter surfaces create elevation, but shadows still help */
  /* Reduce shadow opacity; surface lightness does most of the work */
  --shadow-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3);
  --shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3);
  --shadow-xl:  0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.4);

  /* Optional: add subtle top highlight for extra depth */
  --shadow-inset-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.05);
}
```

## Automated Token Mapping Tool

```typescript
// scripts/generate-dark-tokens.ts
// Given a light-mode token file, generate dark-mode counterparts

import { hexToOklch, oklchToHex } from './color-conversion';

interface TokenPair {
  token: string;
  lightValue: string;
  darkValue: string;
  category: string;
}

function parseCssTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const regex = /--([\w-]+):\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    tokens[`--${match[1]}`] = match[2].trim();
  }
  return tokens;
}

function categorizeToken(tokenName: string): keyof typeof CATEGORIES {
  if (tokenName.includes('surface') || tokenName.includes('background') || tokenName.includes('-bg')) {
    return 'surface';
  }
  if (tokenName.includes('text') || tokenName.includes('foreground') || tokenName.includes('-fg')) {
    return 'text';
  }
  if (tokenName.includes('brand') || tokenName.includes('interactive') || tokenName.includes('action')) {
    return 'brand';
  }
  if (tokenName.includes('success') || tokenName.includes('warning') || tokenName.includes('danger') || tokenName.includes('error')) {
    return 'status';
  }
  return 'border';
}

export async function generateDarkTokens(lightTokensCss: string): Promise<string> {
  const lightTokens = parseCssTokens(lightTokensCss);
  const darkTokenPairs: TokenPair[] = [];

  for (const [token, value] of Object.entries(lightTokens)) {
    // Only process color values
    if (!value.startsWith('#') && !value.startsWith('oklch') && !value.startsWith('rgb')) {
      continue;
    }

    const category = categorizeToken(token);
    const darkValue = mapToDarkMode(value, category);

    darkTokenPairs.push({
      token,
      lightValue: value,
      darkValue,
      category,
    });
  }

  return [
    '[data-theme="dark"] {',
    ...darkTokenPairs.map(p =>
      `  ${p.token}: ${p.darkValue}; /* was: ${p.lightValue} (${p.category}) */`
    ),
    '}',
  ].join('\n');
}
```

::: tip Manual refinement required
Automated token mapping produces a reasonable starting point but never a finished result. Always review generated dark tokens visually before shipping. Pay particular attention to:
- Status color surfaces (green/red/yellow tints on dark can look muddy)
- Brand color contrast against dark surfaces
- Gradient start/end colors
- Decorative accent colors
:::

::: info War Story
A SaaS startup auto-generated their dark mode using a CSS filter hack (`filter: invert(100%) hue-rotate(180deg)` on the root). It looked mostly fine for solid colors but completely destroyed photos (negative film effect), charts (axis labels unreadable), and any image containing text. After three user complaints and a viral tweet about their "broken" dark mode, they spent 2 weeks doing it properly with semantic tokens. The irony: the token mapping was the easy part — the hard part was finding all 200+ hardcoded color values in the codebase that needed to become token references.
:::
