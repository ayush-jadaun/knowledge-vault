---
title: "Dark Mode Image Handling"
description: "Brightness filters, dark image variants, SVG currentColor, and media-specific images"
tags: [dark-mode, images, svg, css-filters, design-systems]
difficulty: "intermediate"
prerequisites: [dark-mode/index, dark-mode/implementation-patterns]
lastReviewed: "2026-03-18"
---

# Dark Mode Image Handling

Images are the most complex element in dark mode. Photos, illustrations, screenshots, diagrams, and icons all need different handling strategies. A one-size-fits-all approach will break something.

## The Image Dark Mode Problem Space

| Image Type | Light Mode Issue | Dark Mode Challenge |
|-----------|-----------------|-------------------|
| Photos | None | Overly bright on dark backgrounds |
| Screenshots | None | Light UI screenshots look jarring in dark mode |
| Logos (raster) | None | May disappear on dark backgrounds |
| Logos (SVG) | None | Can adapt via CSS if designed correctly |
| Illustrations | None | May have white backgrounds or light fills |
| Diagrams/charts | Dark borders OK | May need inverted or alternate version |
| Icons (SVG) | Inherits text color if currentColor | Must use currentColor |
| Icons (raster) | None | Hard to invert; need dark variants |

## Strategy 1: CSS Brightness Filter

A subtle brightness reduction on photos in dark mode:

```css
/* Slightly dim images in dark mode */
/* This prevents photos from being overly bright against dark backgrounds */
[data-theme="dark"] img:not([data-no-dim]) {
  filter: brightness(0.85) saturate(1.1);
  /* brightness(0.85): 15% darker
     saturate(1.1): slight saturation boost to compensate perceived washout */
}

/* More aggressive for specific contexts */
[data-theme="dark"] .hero-image {
  filter: brightness(0.75) saturate(1.2);
}

/* Exclude specific images from dimming */
[data-theme="dark"] .user-avatar {
  filter: none; /* Profile photos should not be dimmed */
}
```

::: warning Use filter sparingly
`filter` forces GPU compositing layer creation. Applying to every image on a page with many images can cause memory pressure on mobile devices. Use the data attribute pattern to opt specific images in/out.
:::

## Strategy 2: Dark Mode Image Variants

Provide explicitly designed dark versions of key images:

```html
<!-- HTML picture element — best control -->
<picture>
  <source
    srcset="/logo-dark.svg"
    media="(prefers-color-scheme: dark)"
  />
  <source
    srcset="/logo-dark.svg"
    media="[data-theme='dark']" />
  <!-- Fallback: light mode logo -->
  <img src="/logo-light.svg" alt="Acme Corp" />
</picture>
```

::: warning media attribute limitation
The `media` attribute on `<source>` only accepts CSS media queries, not CSS selectors like `[data-theme='dark']`. For user-toggled dark mode (not system preference), you need JavaScript or a different technique.
:::

```tsx
// React approach: select image based on resolved theme
import { useTheme } from '../context/ThemeContext';

interface ThemedImageProps {
  lightSrc: string;
  darkSrc?: string;
  alt: string;
  className?: string;
}

export function ThemedImage({ lightSrc, darkSrc, alt, className }: ThemedImageProps) {
  const { isDark } = useTheme();
  const src = isDark && darkSrc ? darkSrc : lightSrc;

  return <img src={src} alt={alt} className={className} />;
}

// Usage
<ThemedImage
  lightSrc="/logo-light.svg"
  darkSrc="/logo-dark.svg"
  alt="Acme Corp"
/>
```

## Strategy 3: SVG currentColor

The cleanest solution for icons and simple illustrations: design SVGs to use `currentColor` for strokes and fills. They automatically adapt to any color context.

```xml
<!-- Before: hardcoded colors -->
<svg viewBox="0 0 24 24">
  <path fill="#1a1a1a" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10..." />
</svg>

<!-- After: currentColor -->
<svg viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10..." />
</svg>
```

```css
/* Icons inherit text color */
.icon {
  color: var(--color-text-secondary); /* Light: dark gray; Dark: light gray */
}

/* Works for any context */
.icon--brand {
  color: var(--color-brand); /* Light: blue-600; Dark: blue-400 */
}

.icon--success {
  color: var(--color-success);
}
```

### Multi-color SVGs

For multi-color SVGs, use CSS custom properties:

```xml
<!-- SVG with CSS variable fills -->
<svg viewBox="0 0 100 100">
  <rect fill="var(--icon-bg, #3b82f6)" x="0" y="0" width="50" height="50" />
  <rect fill="var(--icon-accent, #1d4ed8)" x="50" y="0" width="50" height="50" />
  <circle fill="var(--icon-highlight, #fff)" cx="50" cy="50" r="20" />
</svg>
```

```css
/* Light mode defaults already set in SVG */

/* Dark mode overrides */
[data-theme="dark"] .my-icon {
  --icon-bg: #60a5fa;
  --icon-accent: #3b82f6;
  --icon-highlight: #0f172a;
}
```

## Strategy 4: CSS filter for Logo Inversion

If only one logo variant is available:

```css
/* Invert a dark logo for light backgrounds */
.logo-dark-variant {
  /* Simple invert */
  filter: invert(1);
}

/* Better: preserve hue while inverting lightness */
/* Works for black/white/gray logos only */
.logo-monochrome {
  filter: invert(1);
}

/* For colored logos: invert then adjust hue */
[data-theme="dark"] .logo-light-on-dark {
  filter: brightness(0) invert(1);
  /* brightness(0): make all pixels black
     invert(1): make all pixels white
     Result: a white silhouette of the image */
}

/* For logos with specific colors: not a great solution
   Provide a proper dark variant instead */
```

## Strategy 5: Backdrop Color Manipulation

Prevent images with white backgrounds from bleeding on dark surfaces:

```css
/* For screenshots, diagrams, and illustrations with white backgrounds */
[data-theme="dark"] .screenshot {
  /* Option 1: Rounded border to separate from dark surface */
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 0 0 1px var(--color-border-default);
}

[data-theme="dark"] .light-bg-illustration {
  /* Option 2: Mix-blend-mode to integrate with dark bg */
  /* multiply: dark bg × white = dark bg (blends white away) */
  mix-blend-mode: screen;
  /* Caution: may affect image colors significantly */
}
```

## Video and Embedded Content

```css
/* Videos are usually fine — they have their own color management */
/* But dim slightly in dark mode for consistency */
[data-theme="dark"] video {
  filter: brightness(0.9);
}

/* Iframes (embedded content from other pages) */
/* Cannot be styled — provide alternative or just let them be light */
[data-theme="dark"] iframe:not([allow*="theme"]) {
  /* Optional: add a label that this is external content */
  outline: 2px solid var(--color-border-default);
  border-radius: 0.25rem;
}
```

## React Image Component with Dark Mode

```tsx
// components/SmartImage/SmartImage.tsx
import { useTheme } from '../../context/ThemeContext';
import { useState } from 'react';

interface SmartImageProps {
  lightSrc: string;
  darkSrc?: string;
  alt: string;
  dimInDark?: boolean;       // Apply brightness filter
  invertInDark?: boolean;    // For monochrome images
  width?: number;
  height?: number;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export function SmartImage({
  lightSrc,
  darkSrc,
  alt,
  dimInDark = true,
  invertInDark = false,
  width,
  height,
  className,
  loading = 'lazy',
}: SmartImageProps) {
  const { isDark } = useTheme();
  const [loaded, setLoaded] = useState(false);

  const src = isDark && darkSrc ? darkSrc : lightSrc;

  let filter: string | undefined;
  if (isDark) {
    if (invertInDark) {
      filter = 'brightness(0) invert(1)';
    } else if (dimInDark) {
      filter = 'brightness(0.85) saturate(1.1)';
    }
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      className={className}
      style={​{ filter, transition: 'filter 200ms ease' }}
      onLoad={() => setLoaded(true)}
    />
  );
}
```

## Screenshot Handling Pattern

Screenshots (UI documentation, tutorials) present a unique challenge — they typically show a light-mode UI and look jarring in dark mode:

```css
/* Wrap screenshots in a styled container */
.screenshot-container {
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid var(--color-border-default);
  background: oklch(97% 0 0); /* Always light background */
  box-shadow: var(--shadow-md);
}

[data-theme="dark"] .screenshot-container {
  /* In dark mode: add more contrast to separate from page */
  border-color: var(--color-border-strong);
  box-shadow: 0 0 0 1px var(--color-border-default), var(--shadow-lg);
}

.screenshot-container img {
  display: block;
  width: 100%;
}

[data-theme="dark"] .screenshot-container img {
  filter: none; /* Don't dim — it's shown in a light container */
}
```

::: info War Story
A documentation site shipped dark mode and received dozens of complaints that diagrams and architecture charts were "invisible." The diagrams were SVGs with hardcoded `stroke="#000"` and `fill="none"` — on a dark background, black strokes were nearly invisible. The fix: update the SVG generation tooling (Mermaid.js config) to output `stroke="currentColor"` and set `color: var(--color-text-primary)` on the container. 200 existing diagrams were regenerated in an automated script. Total fix time: 3 hours including the script.
:::
