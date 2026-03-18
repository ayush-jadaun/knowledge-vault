---
title: "System Preference Detection"
description: "prefers-color-scheme, matchMedia API, localStorage persistence, and cross-tab synchronization"
tags: [dark-mode, prefers-color-scheme, matchMedia, localStorage, javascript]
difficulty: "intermediate"
prerequisites: [dark-mode/implementation-patterns]
lastReviewed: "2026-03-18"
---

# System Preference Detection

Dark mode preference comes from two sources: the operating system (reported via the `prefers-color-scheme` media query) and the user's explicit in-app choice (stored in localStorage or a cookie). A complete implementation handles both, with explicit preference overriding the system default.

## The prefers-color-scheme Media Feature

`prefers-color-scheme` reports the OS/browser color scheme preference:

```css
/* Responds automatically to system setting */
@media (prefers-color-scheme: dark) {
  :root { /* dark variables */ }
}

@media (prefers-color-scheme: light) {
  :root { /* light variables — usually the default */ }
}
```

This works in CSS, JavaScript (`window.matchMedia`), and via the `media` attribute on `<picture><source>`.

## JavaScript Detection

```typescript
// utils/theme-detection.ts

export function getSystemPreference(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light'; // SSR fallback
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function watchSystemPreference(
  callback: (preference: 'dark' | 'light') => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches ? 'dark' : 'light');
  };

  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

// React hook
import { useState, useEffect } from 'react';

export function useSystemTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>(getSystemPreference);

  useEffect(() => {
    return watchSystemPreference(setTheme);
  }, []);

  return theme;
}
```

## Storage Strategy

User preference needs to persist across sessions. Options:

| Storage | Persistence | SSR Access | Size Limit |
|---------|------------|-----------|-----------|
| `localStorage` | Until cleared | No (client only) | 5MB |
| `sessionStorage` | Tab lifetime | No | 5MB |
| Cookie | Configurable | Yes (in request headers) | 4KB |
| URL parameter | Per-URL | Yes | ~2KB |

For most apps: `localStorage` is correct. For SSR-critical apps (Next.js App Router): use a cookie so the server knows the preference before rendering.

### localStorage Pattern

```typescript
// utils/theme-storage.ts
const THEME_KEY = 'color-scheme-preference';

export type ThemePreference = 'system' | 'light' | 'dark';

export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';

  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage unavailable (private browsing mode, storage quota exceeded)
  }

  return 'system';
}

export function storeTheme(theme: ThemePreference): void {
  try {
    if (theme === 'system') {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, theme);
    }
  } catch {
    // Silently fail if storage unavailable
  }
}
```

### Cookie Pattern (SSR-Compatible)

For SSR (Next.js): set a cookie so the server can read it and render the correct theme:

```typescript
// utils/theme-cookie.ts
export function getThemeCookie(): ThemePreference {
  if (typeof document === 'undefined') return 'system';

  const match = document.cookie.match(/(?:^|;\s*)color-scheme=([^;]*)/);
  const value = match?.[1];
  return (value === 'light' || value === 'dark' || value === 'system')
    ? value
    : 'system';
}

export function setThemeCookie(theme: ThemePreference): void {
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  const sameSite = 'Lax';
  const secure = location.protocol === 'https:' ? '; Secure' : '';

  document.cookie = `color-scheme=${theme}; Max-Age=${maxAge}; SameSite=${sameSite}; Path=/${secure}`;
}
```

```typescript
// Next.js server component reading the cookie
// app/layout.tsx
import { cookies } from 'next/headers';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const themePref = cookieStore.get('color-scheme')?.value ?? 'system';

  // Resolve system preference server-side is not possible without user agent hinting
  // Default to light if 'system'; client JS will override if needed
  const resolvedTheme = themePref === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang="en"
      data-theme={themePref !== 'system' ? themePref : undefined}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
```

## Cross-Tab Synchronization

When a user changes theme in one tab, other tabs should update:

```typescript
// theme-sync.ts
export function setupCrossTabSync(
  onThemeChange: (theme: ThemePreference) => void
): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === THEME_KEY) {
      const newTheme = (e.newValue as ThemePreference) ?? 'system';
      onThemeChange(newTheme);
    }
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

// React integration
export function useThemeSync() {
  const { setPreference } = useTheme();

  useEffect(() => {
    return setupCrossTabSync((theme) => {
      setPreference(theme);
    });
  }, [setPreference]);
}
```

## Complete useTheme Hook

```typescript
// hooks/useTheme.ts
import { useState, useEffect, useCallback, useRef } from 'react';

type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeHookReturn {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  systemPreference: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  isDark: boolean;
}

const STORAGE_KEY = 'color-scheme';

function getSystemPref(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredPref(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {}
  return 'system';
}

export function useTheme(): ThemeHookReturn {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredPref);
  const [systemPref, setSystemPref] = useState<ResolvedTheme>(getSystemPref);
  const initialized = useRef(false);

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemPref(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const newPref = (e.newValue as ThemePreference) ?? 'system';
        setPreferenceState(newPref);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? systemPref : preference;

  // Apply to DOM
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    const next = preference === 'system' ? null : preference;

    if (prev !== next) {
      if (initialized.current) {
        // Disable transitions during theme switch to prevent jarring
        root.style.setProperty('--transition-duration', '0');
        requestAnimationFrame(() => {
          if (next === null) root.removeAttribute('data-theme');
          else root.setAttribute('data-theme', next);
          root.style.colorScheme = resolved;

          requestAnimationFrame(() => {
            root.style.removeProperty('--transition-duration');
          });
        });
      } else {
        if (next === null) root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', next);
        root.style.colorScheme = resolved;
        initialized.current = true;
      }
    }
  }, [preference, resolved]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    try {
      if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, pref);
    } catch {}
  }, []);

  return {
    preference,
    resolved,
    systemPreference: systemPref,
    setPreference,
    isDark: resolved === 'dark',
  };
}
```

## Theme Toggle Component

```tsx
// components/ThemeToggle/ThemeToggle.tsx
import { useTheme } from '../../hooks/useTheme';

const icons = {
  light: '☀️',
  dark: '🌙',
  system: '💻',
};

export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();

  const cycle = () => {
    const order: Array<typeof preference> = ['system', 'light', 'dark'];
    const current = order.indexOf(preference);
    setPreference(order[(current + 1) % order.length]);
  };

  return (
    <button
      onClick={cycle}
      aria-label={`Current theme: ${preference}. Click to change.`}
      title={`Theme: ${preference} (showing ${resolved})`}
    >
      {icons[preference]}
    </button>
  );
}

// Or explicit selector
export function ThemeSelector() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset>
      <legend>Color scheme</legend>
      {(['system', 'light', 'dark'] as const).map(option => (
        <label key={option}>
          <input
            type="radio"
            name="theme"
            value={option}
            checked={preference === option}
            onChange={() => setPreference(option)}
          />
          {option.charAt(0).toUpperCase() + option.slice(1)}
        </label>
      ))}
    </fieldset>
  );
}
```
