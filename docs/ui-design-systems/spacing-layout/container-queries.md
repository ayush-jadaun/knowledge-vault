---
title: "Container Queries"
description: "@container rules, cqi/cqb/cqw units, component-level responsive design, and practical patterns"
tags: [container-queries, css, responsive-design, component-design, layout]
difficulty: "advanced"
prerequisites: [spacing-layout/responsive-breakpoints, spacing-layout/layout-patterns]
lastReviewed: "2026-03-18"
---

# Container Queries

Container queries are the most significant CSS layout feature since Flexbox. They allow elements to respond to the size of their containing element rather than the viewport — enabling truly portable, context-aware components.

## The Problem Viewport Queries Can't Solve

Consider a card component used in two contexts:
1. Full-width (100% viewport width)
2. In a sidebar (25% viewport width)

With viewport queries, you can't differentiate these contexts:

```css
/* This media query fires at the SAME viewport width */
/* whether the card is full-width or in a sidebar */
@media (min-width: 768px) {
  .card {
    flex-direction: row; /* Wrong for cards in narrow sidebars */
  }
}
```

Container queries solve this:

```css
/* The card now responds to ITS OWN CONTAINER width */
@container (min-width: 400px) {
  .card {
    flex-direction: row; /* Only when the card's container is wide enough */
  }
}
```

The same card component, in a 500px sidebar, will remain vertical. The same card at full width will switch to horizontal. No JavaScript, no extra classes, no component variants needed.

## The Containment Model

To use container queries, the parent element must establish a **containment context**:

```css
/* The container */
.card-wrapper {
  container-type: inline-size; /* Enable inline-size queries */
  container-name: card-container; /* Optional name for targeting */

  /* Shorthand */
  container: card-container / inline-size;
}

/* The component inside responds to .card-wrapper */
@container card-container (min-width: 400px) {
  .card {
    display: flex;
    flex-direction: row;
  }
}
```

### container-type values

| Value | What it enables |
|-------|----------------|
| `inline-size` | Queries on the container's inline dimension (usually width) |
| `size` | Queries on BOTH inline and block dimensions |
| `normal` | No size queries, but style queries still work |

::: warning container-type: size
Using `size` requires the container's block size (height) to be deterministic. If the container's height depends on its children's height, setting `container-type: size` will cause the children's height to be 0. Always prefer `inline-size` for typical UI components.
:::

## Container Query Units

Container queries come with new relative units:

| Unit | Definition |
|------|------------|
| `cqw` | 1% of container's width |
| `cqh` | 1% of container's height |
| `cqi` | 1% of container's inline size |
| `cqb` | 1% of container's block size |
| `cqmin` | Smaller of `cqi` or `cqb` |
| `cqmax` | Larger of `cqi` or `cqb` |

These units work similarly to `vw`/`vh` but relative to the container:

```css
.card-title {
  /* Scale font based on card width, not viewport */
  font-size: clamp(1rem, 4cqi, 1.5rem);
}

.card-image {
  /* Image is always 40% of card width */
  width: 40cqi;
}
```

## Practical Container Query Patterns

### Pattern 1: Responsive Card

```css
.card-container {
  container-type: inline-size;
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
}

.card__image {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 0.5rem;
}

.card__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* When container ≥ 400px: horizontal layout */
@container (min-width: 400px) {
  .card {
    flex-direction: row;
    align-items: flex-start;
  }

  .card__image {
    width: 40%;
    aspect-ratio: 1;
    flex-shrink: 0;
  }
}

/* When container ≥ 700px: larger content */
@container (min-width: 700px) {
  .card {
    padding: var(--space-6);
    gap: var(--space-6);
  }

  .card__title {
    font-size: 1.5rem;
  }
}
```

### Pattern 2: Navigation Component

```css
.nav-container {
  container-type: inline-size;
  container-name: nav;
}

.nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
}

/* Compact nav for narrow containers (sidebar, drawer) */
@container nav (max-width: 200px) {
  .nav {
    flex-direction: column;
    align-items: flex-start;
  }

  .nav__label {
    display: none; /* Icon-only in very narrow contexts */
  }
}

/* Full nav for wide containers (top bar) */
@container nav (min-width: 600px) {
  .nav {
    padding: var(--space-3) var(--space-6);
    justify-content: space-between;
  }

  .nav__secondary {
    display: flex; /* Show secondary nav items */
  }
}
```

### Pattern 3: Data Table

```css
.table-container {
  container-type: inline-size;
  container-name: table;
  overflow-x: auto;
}

/* Default: horizontal scroll table */
.data-table {
  width: 100%;
  border-collapse: collapse;
}

/* Small container: card-based layout */
@container table (max-width: 600px) {
  .data-table thead { display: none; } /* Hide column headers */

  .data-table tr {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border-default);
    border-radius: 0.5rem;
    margin-block-end: var(--space-2);
  }

  .data-table td::before {
    /* Recreate column header as data-label */
    content: attr(data-label);
    font-weight: 600;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    display: block;
    margin-block-end: var(--space-1);
  }
}
```

```html
<!-- data-label required for CSS card layout -->
<tr>
  <td data-label="Name">John Doe</td>
  <td data-label="Email">john@example.com</td>
  <td data-label="Role">Developer</td>
  <td data-label="Status">Active</td>
</tr>
```

## React Container Query Hook

```typescript
// hooks/useContainerSize.ts
import { useRef, useState, useEffect } from 'react';

interface ContainerSize {
  width: number;
  height: number;
  inlineSize: number;
  blockSize: number;
}

export function useContainerSize<T extends HTMLElement>(): [
  React.RefObject<T>,
  ContainerSize
] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
    inlineSize: 0,
    blockSize: 0,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const [borderBoxSize] = entry.borderBoxSize;

        setSize({
          width,
          height,
          inlineSize: borderBoxSize?.inlineSize ?? width,
          blockSize: borderBoxSize?.blockSize ?? height,
        });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

// Usage: JavaScript-driven container queries (fallback or complex logic)
function ResponsiveCard() {
  const [containerRef, { width }] = useContainerSize<HTMLDivElement>();

  const layout = width >= 500 ? 'horizontal' : 'vertical';

  return (
    <div ref={containerRef} className="card-container">
      <div className={`card card--${layout}`}>
        {/* ... */}
      </div>
    </div>
  );
}
```

## CSS Style Queries

Beyond size queries, CSS also supports **style queries** — responding to the computed style values of a container (currently limited to custom properties):

```css
.card-container {
  container-type: normal; /* Style queries don't need size containment */
  container-name: card;
}

/* Style query: responds to a custom property on the container */
@container card style(--variant: featured) {
  .card {
    border: 2px solid var(--color-brand);
    background: var(--color-surface-brand);
  }

  .card__badge {
    display: block; /* Show "Featured" badge */
  }
}
```

```html
<!-- Toggle featured variant via custom property -->
<div class="card-container" style="--variant: featured">
  <article class="card">
    <!-- Automatically styled as featured -->
  </article>
</div>
```

## Container Queries vs. Media Queries

| Feature | Media Queries | Container Queries |
|---------|--------------|-------------------|
| Responds to | Viewport dimensions | Container dimensions |
| Component portability | Low — tied to viewport | High — works anywhere |
| Nesting | Not aware of context | Full context awareness |
| Browser support | Universal | 90%+ (Chrome 105+, Firefox 110+, Safari 16+) |
| Performance | Static breakpoints | Dynamic via ResizeObserver internally |
| Use for | Page-level layout | Component-level layout |

::: tip Use both
Container queries replace most uses of media queries for *component-level* responsive behavior. Media queries are still appropriate for:
- Page layout (sidebar visible/hidden at screen level)
- Loading different asset sizes (`<source media="...">`)
- OS preferences (`prefers-color-scheme`, `prefers-reduced-motion`)
- Print styles (`@media print`)
:::

## Nesting Container Queries

Container queries respect the nearest container ancestor:

```css
.outer {
  container-type: inline-size;
  container-name: outer;
}

.inner {
  container-type: inline-size;
  container-name: inner;
}

/* Targets the inner container's size */
@container inner (min-width: 300px) {
  .deep-child { font-size: 1.2rem; }
}

/* Targets the outer container's size */
@container outer (min-width: 800px) {
  .inner-element { max-width: 50%; }
}
```

## Performance

Container queries are implemented using ResizeObserver internally by browsers. Performance characteristics:
- Each container query rule adds an observer on the container element
- ResizeObserver callbacks are debounced per frame (60fps max)
- No layout thrashing — queries are evaluated in a single pass
- More efficient than JavaScript-based responsive patterns

Benchmark: 100 container query rules on 100 elements = ~2ms overhead per resize event. Comparable to 100 CSS transitions.

::: info War Story
A design system team was shipping 3 variants of every card component — "compact", "standard", and "wide" — as separate React components. When the product added a new layout context (a three-column feature grid), they needed to build a fourth "feature" variant. Using container queries, they were able to reduce to a single card component. The three component variants were deleted, saving 800 lines of code. The single component worked correctly in all 4 layout contexts automatically.
:::
