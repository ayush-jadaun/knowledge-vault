---
title: "Render Props & Hooks"
description: "The evolution of logic sharing in React — from render props to custom hooks, with TypeScript implementations for composing stateful logic, sharing behavior across components, and building reusable abstractions"
tags: [render-props, custom-hooks, react, typescript, code-reuse, composition, patterns]
difficulty: intermediate
prerequisites: [react, typescript, react-hooks]
lastReviewed: "2026-03-17"
---

# Render Props & Hooks

The central problem in React architecture: how do you share stateful logic between components without coupling it to a specific UI? React has gone through several answers — mixins (deprecated), higher-order components (cumbersome), render props (powerful but verbose), and finally custom hooks (the modern standard). Understanding this evolution helps you recognize render props in legacy code and design hooks in new code.

## The Render Props Pattern

A render prop is a function prop that a component uses to know what to render. Instead of implementing its own rendering, the component delegates rendering to its consumer while managing state and behavior internally.

### Basic Render Props

```tsx
import { useState, useEffect, type ReactNode } from 'react';

// ─── A component that tracks mouse position ─────────────────────────

type MousePosition = { x: number; y: number };

type MouseTrackerProps = {
  render: (position: MousePosition) => ReactNode;
};

function MouseTracker({ render }: MouseTrackerProps) {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return <>{render(position)}</>;
}

// Usage — the consumer decides how to render the position
function App() {
  return (
    <div>
      <MouseTracker
        render={({ x, y }) => (
          <div>
            <p>Mouse position: ({x}, {y})</p>
            <div
              style={{
                position: 'fixed',
                left: x - 10,
                top: y - 10,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'red',
                pointerEvents: 'none',
              }}
            />
          </div>
        )}
      />
    </div>
  );
}
```

### Children as Render Prop

The `children` prop can serve as the render prop, which reads more naturally:

```tsx
type MouseTrackerProps = {
  children: (position: MousePosition) => ReactNode;
};

function MouseTracker({ children }: MouseTrackerProps) {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return <>{children(position)}</>;
}

// Usage — reads like a natural component
function App() {
  return (
    <MouseTracker>
      {({ x, y }) => (
        <p>The mouse is at ({x}, {y})</p>
      )}
    </MouseTracker>
  );
}
```

### Render Props for Data Fetching

A classic use case — abstracting data fetching into a render prop component:

```tsx
import { useState, useEffect, type ReactNode } from 'react';

type FetchState<T> =
  | { status: 'idle'; data: undefined; error: undefined }
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'success'; data: T; error: undefined }
  | { status: 'error'; data: undefined; error: Error };

type FetchProps<T> = {
  url: string;
  options?: RequestInit;
  children: (state: FetchState<T>) => ReactNode;
};

function Fetch<T>({ url, options, children }: FetchProps<T>) {
  const [state, setState] = useState<FetchState<T>>({
    status: 'idle',
    data: undefined,
    error: undefined,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      setState({ status: 'loading', data: undefined, error: undefined });

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as T;
        setState({ status: 'success', data, error: undefined });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          data: undefined,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }

    fetchData();
    return () => controller.abort();
  }, [url]);

  return <>{children(state)}</>;
}

// Usage
type User = { id: number; name: string; email: string };

function UserList() {
  return (
    <Fetch<User[]> url="/api/users">
      {(state) => {
        switch (state.status) {
          case 'idle':
          case 'loading':
            return <Spinner />;
          case 'error':
            return <ErrorMessage error={state.error} />;
          case 'success':
            return (
              <ul>
                {state.data.map((user) => (
                  <li key={user.id}>{user.name}</li>
                ))}
              </ul>
            );
        }
      }}
    </Fetch>
  );
}
```

### Render Props for Toggle Behavior

```tsx
import { useState, useCallback, type ReactNode } from 'react';

type ToggleRenderProps = {
  isOn: boolean;
  toggle: () => void;
  setOn: () => void;
  setOff: () => void;
};

type ToggleProps = {
  initialValue?: boolean;
  children: (props: ToggleRenderProps) => ReactNode;
};

function Toggle({ initialValue = false, children }: ToggleProps) {
  const [isOn, setIsOn] = useState(initialValue);

  const toggle = useCallback(() => setIsOn((prev) => !prev), []);
  const setOn = useCallback(() => setIsOn(true), []);
  const setOff = useCallback(() => setIsOn(false), []);

  return <>{children({ isOn, toggle, setOn, setOff })}</>;
}

// Usage
function FeatureFlag() {
  return (
    <Toggle>
      {({ isOn, toggle }) => (
        <div>
          <button onClick={toggle}>{isOn ? 'Disable' : 'Enable'} feature</button>
          {isOn && <div>Feature content is visible</div>}
        </div>
      )}
    </Toggle>
  );
}
```

### Limitations of Render Props

Render props solved the code reuse problem but introduced their own issues:

**1. Callback hell (wrapper pyramid)**

```tsx
// Composing multiple render props becomes deeply nested
function Dashboard() {
  return (
    <ThemeProvider>
      {(theme) => (
        <AuthProvider>
          {(auth) => (
            <Fetch<DashboardData> url={`/api/dashboard/${auth.userId}`}>
              {(data) => (
                <MouseTracker>
                  {(mouse) => (
                    <WindowSize>
                      {(windowSize) => (
                        // Finally, the actual UI — 6 levels deep
                        <DashboardView
                          theme={theme}
                          user={auth.user}
                          data={data}
                          mouse={mouse}
                          windowSize={windowSize}
                        />
                      )}
                    </WindowSize>
                  )}
                </MouseTracker>
              )}
            </Fetch>
          )}
        </AuthProvider>
      )}
    </ThemeProvider>
  );
}
```

**2. False hierarchy** — the nesting implies a parent-child relationship that does not exist. Theme, Auth, and Fetch are independent concerns forced into a tree structure.

**3. Performance** — every render creates a new function for the render prop, which can cause unnecessary re-renders of children unless carefully memoized.

**4. Readability** — the actual UI is buried under layers of callbacks.

## Custom Hooks: The Modern Equivalent

Custom hooks solve every limitation of render props while maintaining the same power of logic extraction. A custom hook is a JavaScript function whose name starts with `use` and that may call other hooks.

### Converting Render Props to Hooks

Every render prop component has a direct hook equivalent:

```tsx
// ─── Mouse position: render prop → hook ─────────────────────────────

// Before (render prop)
function MouseTracker({ children }: { children: (pos: MousePosition) => ReactNode }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  useEffect(() => { /* ... */ }, []);
  return <>{children(position)}</>;
}

// After (hook)
function useMousePosition(): MousePosition {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return position;
}

// Usage — flat, no nesting
function Cursor() {
  const { x, y } = useMousePosition();
  return <p>Mouse: ({x}, {y})</p>;
}
```

```tsx
// ─── Toggle: render prop → hook ─────────────────────────────────────

function useToggle(initialValue = false) {
  const [isOn, setIsOn] = useState(initialValue);

  const toggle = useCallback(() => setIsOn((prev) => !prev), []);
  const setOn = useCallback(() => setIsOn(true), []);
  const setOff = useCallback(() => setIsOn(false), []);

  return { isOn, toggle, setOn, setOff } as const;
}

function FeatureFlag() {
  const { isOn, toggle } = useToggle();
  return (
    <div>
      <button onClick={toggle}>{isOn ? 'Disable' : 'Enable'}</button>
      {isOn && <div>Feature content</div>}
    </div>
  );
}
```

```tsx
// ─── Fetch: render prop → hook ──────────────────────────────────────

function useFetch<T>(url: string, options?: RequestInit): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    status: 'idle',
    data: undefined,
    error: undefined,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      setState({ status: 'loading', data: undefined, error: undefined });
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as T;
        setState({ status: 'success', data, error: undefined });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({
          status: 'error',
          data: undefined,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }

    fetchData();
    return () => controller.abort();
  }, [url]);

  return state;
}

// Usage — flat composition
function UserList() {
  const { status, data, error } = useFetch<User[]>('/api/users');

  if (status === 'loading') return <Spinner />;
  if (status === 'error') return <ErrorMessage error={error} />;
  if (status === 'success') {
    return (
      <ul>
        {data.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    );
  }
  return null;
}
```

### Composing Hooks — No Nesting Required

The pyramid of doom from render props becomes flat composition with hooks:

```tsx
// Before: render prop pyramid
function Dashboard() {
  return (
    <ThemeProvider>{(theme) => (
      <AuthProvider>{(auth) => (
        <Fetch url={...}>{(data) => (
          // ... deeply nested
        )}</Fetch>
      )}</AuthProvider>
    )}</ThemeProvider>
  );
}

// After: flat hook composition
function Dashboard() {
  const theme = useTheme();
  const auth = useAuth();
  const { data, status } = useFetch<DashboardData>(`/api/dashboard/${auth.userId}`);
  const { x, y } = useMousePosition();
  const windowSize = useWindowSize();

  // All values are available at the same scope level
  if (status === 'loading') return <Spinner />;

  return (
    <DashboardView
      theme={theme}
      user={auth.user}
      data={data}
      mouse={{ x, y }}
      windowSize={windowSize}
    />
  );
}
```

### Building Real-World Custom Hooks

#### useLocalStorage — Persistent State

```tsx
import { useState, useCallback, useEffect } from 'react';

function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // Initialize state from localStorage or fallback to initialValue
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Update localStorage when state changes
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const nextValue = value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(nextValue));
        } catch (error) {
          console.warn(`Error setting localStorage key "${key}":`, error);
        }
        return nextValue;
      });
    },
    [key]
  );

  // Remove from localStorage
  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  // Sync across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T);
        } catch {
          // Ignore parse errors from other tabs
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [storedValue, setValue, removeValue];
}

// Usage
function Settings() {
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');
  const [fontSize, setFontSize] = useLocalStorage<number>('fontSize', 16);

  return (
    <div>
      <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <input
        type="range"
        min={12}
        max={24}
        value={fontSize}
        onChange={(e) => setFontSize(Number(e.target.value))}
      />
    </div>
  );
}
```

#### useMediaQuery — Responsive Logic in JS

```tsx
import { useState, useEffect } from 'react';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    // Set initial value
    setMatches(mediaQuery.matches);

    // Modern browsers
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

// Composed hooks built on useMediaQuery
function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}

function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

function usePrefersDarkMode(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)');
}

// Usage
function ResponsiveLayout() {
  const isMobile = useIsMobile();
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div>
      {isMobile ? <MobileNav /> : <DesktopNav />}
      <main>
        {!prefersReducedMotion && <AnimatedHero />}
      </main>
    </div>
  );
}
```

#### useDebounce — Debounced Values

```tsx
import { useState, useEffect } from 'react';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Usage: debounced search
function SearchPage() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const { data: results } = useFetch<SearchResult[]>(
    debouncedQuery ? `/api/search?q=${encodeURIComponent(debouncedQuery)}` : ''
  );

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      {results && (
        <ul>
          {results.map((result) => (
            <li key={result.id}>{result.title}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

#### useClickOutside — Detecting Outside Clicks

```tsx
import { useEffect, type RefObject } from 'react';

function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T>,
  handler: (event: globalThis.MouseEvent | TouchEvent) => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    const listener = (event: globalThis.MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (!ref.current || ref.current.contains(target)) {
        return;
      }
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler, enabled]);
}

// Usage
function Dropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);

  return (
    <div ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
      {isOpen && (
        <div className="dropdown-content">
          <p>Click outside to close</p>
        </div>
      )}
    </div>
  );
}
```

#### usePrevious — Accessing Previous State

```tsx
import { useRef, useEffect } from 'react';

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  });

  return ref.current;
}

// Usage: detecting value changes
function PriceDisplay({ price }: { price: number }) {
  const previousPrice = usePrevious(price);

  const direction = previousPrice !== undefined
    ? price > previousPrice ? 'up' : price < previousPrice ? 'down' : 'same'
    : 'same';

  return (
    <span className={direction === 'up' ? 'text-green-500' : direction === 'down' ? 'text-red-500' : ''}>
      ${price.toFixed(2)}
      {direction === 'up' && ' \u2191'}
      {direction === 'down' && ' \u2193'}
    </span>
  );
}
```

### Hook Composition Patterns

The real power of hooks is composition — building complex behavior from simple primitives:

```tsx
// ─── Compose hooks into higher-level abstractions ───────────────────

function useSearchWithHistory(key: string) {
  // Compose multiple hooks
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const [history, setHistory] = useLocalStorage<string[]>(`${key}-history`, []);

  const search = useCallback((term: string) => {
    setQuery(term);
    setHistory((prev) => {
      const filtered = prev.filter((h) => h !== term);
      return [term, ...filtered].slice(0, 10); // Keep last 10
    });
  }, [setHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  return {
    query,
    setQuery,
    debouncedQuery,
    search,
    history,
    clearHistory,
  };
}

// ─── Compose into a full feature hook ───────────────────────────────

function useAutocomplete<T>(config: {
  fetchSuggestions: (query: string) => Promise<T[]>;
  minChars?: number;
  debounceMs?: number;
}) {
  const { fetchSuggestions, minChars = 2, debounceMs = 300 } = config;

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, debounceMs);
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { isOn: isOpen, setOn: open, setOff: close } = useToggle(false);

  useEffect(() => {
    if (debouncedQuery.length < minChars) {
      setSuggestions([]);
      close();
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchSuggestions(debouncedQuery)
      .then((results) => {
        if (!cancelled) {
          setSuggestions(results);
          setSelectedIndex(-1);
          if (results.length > 0) open();
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [debouncedQuery, minChars, fetchSuggestions, open, close]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
          break;
        case 'Escape':
          close();
          break;
        case 'Enter':
          if (selectedIndex >= 0) {
            e.preventDefault();
            // Consumer handles selection
          }
          break;
      }
    },
    [suggestions.length, selectedIndex, close]
  );

  return {
    query,
    setQuery,
    suggestions,
    isLoading,
    isOpen,
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    close,
  };
}
```

## TypeScript Patterns for Hooks

### Return Types: Object vs Tuple

```tsx
// Tuple return — when hook returns 2-3 values with clear order
// Convention from useState: [value, setter]
function useToggle(initial = false): [boolean, () => void] {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle];
}

const [isOpen, toggleOpen] = useToggle(); // Destructure with any name

// Object return — when hook returns many values
// Consumer picks what they need
function useForm<T>(initialValues: T) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ... more logic

  return {
    values,
    errors,
    touched,
    isSubmitting,
    setFieldValue: (field: keyof T, value: T[keyof T]) => { /* ... */ },
    setFieldError: (field: keyof T, error: string) => { /* ... */ },
    handleSubmit: (onSubmit: (values: T) => Promise<void>) => { /* ... */ },
    reset: () => { /* ... */ },
  };
}

const { values, errors, handleSubmit } = useForm({ name: '', email: '' });
```

### Generic Hooks

```tsx
// Generic hook with constraints
function useSelection<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const select = useCallback((item: T) => {
    setSelectedIds((prev) => new Set(prev).add(item.id));
  }, []);

  const deselect = useCallback((item: T) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  }, []);

  const toggle = useCallback((item: T) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  return {
    selectedIds,
    selectedItems,
    isSelected: (item: T) => selectedIds.has(item.id),
    select,
    deselect,
    toggle,
    selectAll,
    deselectAll,
    selectedCount: selectedIds.size,
    isAllSelected: selectedIds.size === items.length && items.length > 0,
    isPartiallySelected: selectedIds.size > 0 && selectedIds.size < items.length,
  };
}
```

### Overloaded Hook Signatures

```tsx
// Hook with different behavior based on arguments
function useAsync<T>(
  asyncFn: () => Promise<T>,
  immediate?: true
): { data: T | undefined; error: Error | undefined; loading: boolean; execute: () => Promise<void> };

function useAsync<T>(
  asyncFn: () => Promise<T>,
  immediate: false
): { data: T | undefined; error: Error | undefined; loading: boolean; execute: () => Promise<void> };

function useAsync<T>(asyncFn: () => Promise<T>, immediate = true) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(immediate);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await asyncFn();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [asyncFn]);

  useEffect(() => {
    if (immediate) execute();
  }, [immediate, execute]);

  return { data, error, loading, execute };
}
```

## When to Still Use Render Props

Hooks replaced most render prop use cases, but render props are still valuable in specific scenarios:

### 1. When You Need JSX-Level Control

```tsx
// AnimatePresence from Framer Motion uses render-prop-like patterns
// because it needs to control when children mount/unmount
<AnimatePresence>
  {isVisible && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      Content
    </motion.div>
  )}
</AnimatePresence>
```

### 2. Libraries with Compound + Render Props

```tsx
// Downshift combines compound components with render props
<Downshift onChange={(selection) => console.log(selection)}>
  {({ getInputProps, getItemProps, isOpen, highlightedIndex }) => (
    <div>
      <input {...getInputProps()} />
      {isOpen && (
        <ul>
          {items.map((item, index) => (
            <li
              key={item.id}
              {...getItemProps({
                item,
                index,
                style: {
                  backgroundColor: highlightedIndex === index ? '#eee' : 'transparent',
                },
              })}
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )}
</Downshift>
```

### 3. When the Consumer Needs to Decide the Element Type

If a hook needs to return JSX (not just data/state), a render prop or component with slots may be clearer than a hook returning React elements.

## Testing Hooks

Use `renderHook` from React Testing Library:

```tsx
import { renderHook, act } from '@testing-library/react';
import { useToggle } from './useToggle';

describe('useToggle', () => {
  it('starts with initial value', () => {
    const { result } = renderHook(() => useToggle(false));
    expect(result.current.isOn).toBe(false);
  });

  it('toggles the value', () => {
    const { result } = renderHook(() => useToggle(false));
    act(() => result.current.toggle());
    expect(result.current.isOn).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOn).toBe(false);
  });

  it('provides setOn and setOff helpers', () => {
    const { result } = renderHook(() => useToggle(false));
    act(() => result.current.setOn());
    expect(result.current.isOn).toBe(true);
    act(() => result.current.setOff());
    expect(result.current.isOn).toBe(false);
  });
});

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('debounces value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'hello' } }
    );

    rerender({ value: 'world' });
    expect(result.current).toBe('hello'); // Still old value

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('world'); // Now updated
  });
});
```

## Further Reading

- **React documentation:** [Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)
- **Kent C. Dodds:** "How to use React Context effectively"
- **Next:** [Controlled & Uncontrolled](./controlled-uncontrolled) — state ownership patterns
- **Related:** [Headless Components](./headless-components) — hooks as the engine of headless component architecture
