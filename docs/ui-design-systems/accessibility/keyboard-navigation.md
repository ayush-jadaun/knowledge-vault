---
title: "Keyboard Navigation"
description: "Focus management, tab order, roving tabindex pattern, keyboard shortcuts, and interaction models"
tags: [accessibility, keyboard-navigation, focus-management, tabindex, a11y]
difficulty: "intermediate"
prerequisites: [accessibility/index, accessibility/aria-deep-dive]
lastReviewed: "2026-03-18"
---

# Keyboard Navigation

Keyboard navigation is the foundation of accessible interaction. Every user who relies on a keyboard — including screen reader users, motor-impaired users, power users, and anyone without a pointing device — depends on correct keyboard behavior.

## The Keyboard Interaction Model

Web keyboard navigation operates on two levels:
1. **Tab order**: moving between interactive regions and widgets
2. **Arrow key navigation**: moving within a widget (composite components)

The distinction is critical: Tab moves BETWEEN components; arrow keys move WITHIN a component.

```
Tab flow:
[Button 1] → [Input] → [Button 2] → [Tab widget] → [Button 3]
                                          ↑
                                    Tab stops here
                                    Arrow keys navigate
                                    between tabs
```

## tabindex Values

| Value | Effect |
|-------|--------|
| `tabindex="0"` | Add to tab order at natural DOM position |
| `tabindex="-1"` | Focusable programmatically, not in tab order |
| `tabindex="1+"` | Positive tabindex — AVOID, creates maintainability nightmare |

```html
<!-- tabindex="0" — add non-native element to tab order -->
<div role="button" tabindex="0">Custom Button</div>

<!-- tabindex="-1" — focusable by script, not by Tab key -->
<!-- Used for modal content, roving tabindex patterns -->
<div id="modal-content" tabindex="-1">
  <!-- Dialog content, receives focus when modal opens -->
</div>

<!-- AVOID positive tabindex -->
<button tabindex="5">Don't do this</button>
<button tabindex="1">Or this</button>
<!-- These create parallel focus orders that conflict with DOM order -->
```

## DOM Order = Focus Order

The tab order follows DOM order. Therefore: **the DOM order must match the visual reading order**.

```html
<!-- FAIL: visual order differs from DOM order via CSS float -->
<style>
  .content { float: right; }
  .sidebar { float: left; }
</style>

<div class="content">Main content</div>  <!-- Visually RIGHT -->
<nav class="sidebar">Navigation</nav>    <!-- Visually LEFT -->
<!-- Tab: "Main content" first, then "Navigation" — backwards from visual -->

<!-- PASS: DOM order matches visual order -->
<nav class="sidebar">Navigation</nav>    <!-- Visually LEFT, first in DOM -->
<div class="content">Main content</div>  <!-- Visually RIGHT, second in DOM -->
```

::: warning CSS order property
`order` in Flexbox and Grid can reorder items visually without changing DOM order. This creates a mismatch between visual and keyboard order. Use `order` only for purely decorative reordering, never for functional order.
:::

## The Roving tabindex Pattern

For composite widgets (toolbars, tab lists, grids, menus), only ONE element should be in the tab order at a time. Users Tab into the widget, then use arrow keys to navigate within it, then Tab out.

```typescript
// roving-tabindex.ts

export class RovingTabindex {
  private items: HTMLElement[] = [];
  private currentIndex = 0;
  private orientation: 'horizontal' | 'vertical' | 'both';

  constructor(
    container: HTMLElement,
    itemSelector: string,
    orientation: 'horizontal' | 'vertical' | 'both' = 'horizontal'
  ) {
    this.orientation = orientation;
    this.items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
    this.setup();
    container.addEventListener('keydown', this.handleKeyDown);
  }

  private setup(): void {
    // Only first item in tab order, rest are -1
    this.items.forEach((item, i) => {
      item.setAttribute('tabindex', i === 0 ? '0' : '-1');
    });
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const { key } = e;
    let direction: number | null = null;

    if (
      (this.orientation !== 'vertical' && key === 'ArrowRight') ||
      (this.orientation !== 'horizontal' && key === 'ArrowDown')
    ) {
      direction = 1;
    } else if (
      (this.orientation !== 'vertical' && key === 'ArrowLeft') ||
      (this.orientation !== 'horizontal' && key === 'ArrowUp')
    ) {
      direction = -1;
    } else if (key === 'Home') {
      this.moveTo(0);
      e.preventDefault();
      return;
    } else if (key === 'End') {
      this.moveTo(this.items.length - 1);
      e.preventDefault();
      return;
    }

    if (direction !== null) {
      e.preventDefault();
      const newIndex = (this.currentIndex + direction + this.items.length) % this.items.length;
      this.moveTo(newIndex);
    }
  };

  moveTo(index: number): void {
    // Remove current item from tab order
    this.items[this.currentIndex].setAttribute('tabindex', '-1');

    // Add new item to tab order and focus it
    this.currentIndex = index;
    const newItem = this.items[this.currentIndex];
    newItem.setAttribute('tabindex', '0');
    newItem.focus();
  }

  destroy(container: HTMLElement): void {
    container.removeEventListener('keydown', this.handleKeyDown);
  }
}

// Usage
const toolbar = document.querySelector<HTMLElement>('[role="toolbar"]')!;
const rovingTabindex = new RovingTabindex(toolbar, '[role="button"]', 'horizontal');
```

## React Roving Tabindex

```tsx
// components/Toolbar/Toolbar.tsx
import React, { useRef, useState, useCallback, KeyboardEvent } from 'react';

interface ToolbarItem {
  id: string;
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface ToolbarProps {
  items: ToolbarItem[];
  label: string;
}

export function Toolbar({ items, label }: ToolbarProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const enabledItems = items.filter(item => !item.disabled);

  const moveTo = useCallback((index: number) => {
    const newIndex = Math.max(0, Math.min(enabledItems.length - 1, index));
    setActiveIndex(newIndex);
    itemRefs.current[newIndex]?.focus();
  }, [enabledItems.length]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        moveTo((activeIndex + 1) % enabledItems.length);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveTo((activeIndex - 1 + enabledItems.length) % enabledItems.length);
        break;
      case 'Home':
        e.preventDefault();
        moveTo(0);
        break;
      case 'End':
        e.preventDefault();
        moveTo(enabledItems.length - 1);
        break;
    }
  }, [activeIndex, enabledItems.length, moveTo]);

  return (
    <div
      role="toolbar"
      aria-label={label}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(el) => { itemRefs.current[index] = el; }}
          tabIndex={index === activeIndex ? 0 : -1}
          onClick={item.onClick}
          disabled={item.disabled}
          aria-label={item.label}
        >
          {item.icon}
          <span className="sr-only">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
```

## Skip Navigation Links

Long pages need skip links so keyboard users can bypass repetitive navigation:

```html
<!-- Skip link — visually hidden, appears on focus -->
<a href="#main-content" class="skip-link">
  Skip to main content
</a>

<!-- Other skip links if needed -->
<a href="#main-navigation" class="skip-link">Skip to navigation</a>
<a href="#search" class="skip-link">Skip to search</a>

<header>…</header>
<main id="main-content" tabindex="-1">
  <!-- tabindex="-1" allows programmatic focus -->
</main>
```

```css
/* Skip link pattern */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--color-surface-default);
  color: var(--color-text-primary);
  padding: var(--space-2) var(--space-4);
  text-decoration: none;
  font-weight: 600;
  z-index: 999;
  border-radius: 0 0 0.25rem 0;
  transition: top 0.15s;
}

.skip-link:focus {
  top: 0; /* Reveal on focus */
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}
```

## Keyboard Shortcuts

Application-level keyboard shortcuts must not conflict with browser/screen reader shortcuts:

```typescript
// keyboard-shortcuts.ts

interface KeyboardShortcut {
  key: string;
  modifiers?: {
    ctrl?: boolean;
    meta?: boolean;  // Cmd on Mac
    alt?: boolean;
    shift?: boolean;
  };
  action: () => void;
  description: string;
  // Prevent in these contexts
  excludeWhen?: () => boolean;
}

class KeyboardShortcutManager {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private isActive = true;

  constructor() {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  register(shortcut: KeyboardShortcut): void {
    const key = this.getKey(shortcut);
    this.shortcuts.set(key, shortcut);
  }

  unregister(shortcut: KeyboardShortcut): void {
    this.shortcuts.delete(this.getKey(shortcut));
  }

  private getKey(shortcut: KeyboardShortcut): string {
    const mods = shortcut.modifiers ?? {};
    const parts = [
      mods.ctrl ? 'ctrl' : '',
      mods.meta ? 'meta' : '',
      mods.alt ? 'alt' : '',
      mods.shift ? 'shift' : '',
      shortcut.key.toLowerCase(),
    ].filter(Boolean);
    return parts.join('+');
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.isActive) return;

    // Don't fire shortcuts when typing in input/textarea
    const target = e.target as HTMLElement;
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      || target.isContentEditable;

    const key = [
      e.ctrlKey ? 'ctrl' : '',
      e.metaKey ? 'meta' : '',
      e.altKey ? 'alt' : '',
      e.shiftKey ? 'shift' : '',
      e.key.toLowerCase(),
    ].filter(Boolean).join('+');

    const shortcut = this.shortcuts.get(key);

    if (shortcut) {
      // Allow single-key shortcuts only in non-input contexts
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      if (isTyping && !hasModifier) return;

      // Check exclusion condition
      if (shortcut.excludeWhen?.()) return;

      e.preventDefault();
      shortcut.action();
    }
  };

  disable(): void { this.isActive = false; }
  enable(): void { this.isActive = true; }

  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
  }
}

// Usage
const shortcuts = new KeyboardShortcutManager();

shortcuts.register({
  key: '/',
  description: 'Open search',
  action: () => document.querySelector<HTMLElement>('#search')?.focus(),
  excludeWhen: () => !!document.querySelector('[role="dialog"]'), // Disable in modals
});

shortcuts.register({
  key: 'k',
  modifiers: { ctrl: true },
  description: 'Open command palette',
  action: () => openCommandPalette(),
});
```

## Focus Indicators

The W3C recommends at minimum a 3:1 contrast ratio for focus indicators relative to adjacent colors (WCAG 2.4.11):

```css
/* Remove default outline — provide custom visible indicator */
:focus {
  outline: none; /* Remove browser default */
}

/* FAIL: removed focus and not replaced */
/* Users cannot see where focus is */

/* PASS: custom focus indicator */
:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}

/* Enhanced: double-ring for any background */
:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
  box-shadow:
    0 0 0 2px white,       /* White offset ring — contrasts against dark */
    0 0 0 4px var(--color-focus-ring); /* Outer ring */
}
```

The `:focus-visible` pseudo-class shows the focus ring only when navigating by keyboard (not on mouse click), providing a clean experience for mouse users while maintaining keyboard accessibility.

::: info War Story
A major e-commerce site removed `outline: none` globally as a CSS reset (a common anti-pattern) and never replaced it. Their screen reader tester found they had removed ALL visible focus indicators from 500+ interactive elements. Screen reader users couldn't tell where focus was. The WCAG report listed this as a critical violation affecting every page. The fix was global (2 CSS lines), but testing every component to ensure the custom focus styles were visible against all backgrounds took 2 weeks.
:::
