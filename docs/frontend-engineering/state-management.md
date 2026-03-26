---
title: "State Management Patterns"
description: "Comprehensive guide to frontend state management — local, global, and server state with Redux Toolkit, Zustand, Jotai, Valtio, Signals, TanStack Query, XState, and knowing when you need none of them."
tags: [state-management, redux, zustand, signals, react]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# State Management Patterns

State management is the most over-engineered problem in frontend development. Teams reach for global state libraries on day one, wrap every component in providers, and build elaborate action/reducer hierarchies — then wonder why their app is slow, brittle, and impossible to test.

The first principle of state management is this: **most state is local, most data is server-owned, and what remains is usually small enough to handle without a library.** This page builds up from that principle, covering when each category of state management is appropriate, and providing honest comparisons of the tools available.

## The Three Kinds of State

Before choosing a tool, understand what kind of state you are managing:

```mermaid
graph TD
    subgraph "UI State (Client-Owned)"
        A["Local State<br/>Modal open/closed<br/>Form inputs<br/>Active tab"]
        B["Global UI State<br/>Theme preference<br/>Sidebar collapsed<br/>Toast notifications"]
    end

    subgraph "Server State (Server-Owned)"
        C["Server Cache<br/>User profile<br/>Product list<br/>Dashboard data"]
    end

    subgraph "URL State"
        D["Navigation State<br/>Current page<br/>Search query<br/>Filter parameters"]
    end

    A -->|"useState / useReducer"| E["Component"]
    B -->|"Context / Zustand / Jotai"| E
    C -->|"TanStack Query / SWR"| E
    D -->|"Router / URL params"| E
```

| Type | Owned By | Persists Across | Examples | Solution |
|------|----------|----------------|----------|----------|
| **Local UI** | Component | Nothing | Form input, dropdown state | `useState`, `useReducer` |
| **Global UI** | App | Navigation | Theme, auth status, toasts | Context, Zustand, Jotai |
| **Server** | Backend | Refresh (cache) | User data, products, orders | TanStack Query, SWR |
| **URL** | Browser | Bookmarks, sharing | Page, filters, search query | Router, `URLSearchParams` |

::: tip The #1 State Management Mistake
Treating server data as client state. When you `fetch` user data and store it in Redux, you now own two copies of that data — the server's truth and your stale cache. You must handle loading states, errors, cache invalidation, refetching, optimistic updates, and race conditions manually. Server state libraries like TanStack Query handle all of this for you.
:::

## Local State: useState and useReducer

For state that belongs to a single component, React's built-in hooks are the right answer. No library needed.

### useState for Simple State

```typescript
import { useState } from 'react';

function SearchBar() {
  const [query, setQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div>
      <button onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? 'Close' : 'Search'}
      </button>
      {isExpanded && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
        />
      )}
    </div>
  );
}
```

### useReducer for Complex Local State

When state transitions have complex logic or multiple sub-values that change together, `useReducer` provides clarity:

```typescript
import { useReducer } from 'react';

interface FormState {
  values: { name: string; email: string; message: string };
  errors: Record<string, string>;
  status: 'idle' | 'submitting' | 'success' | 'error';
}

type FormAction =
  | { type: 'SET_FIELD'; field: string; value: string }
  | { type: 'SET_ERROR'; field: string; error: string }
  | { type: 'SUBMIT' }
  | { type: 'SUCCESS' }
  | { type: 'FAILURE'; error: string };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
        errors: { ...state.errors, [action.field]: '' },
      };
    case 'SET_ERROR':
      return {
        ...state,
        errors: { ...state.errors, [action.field]: action.error },
      };
    case 'SUBMIT':
      return { ...state, status: 'submitting', errors: {} };
    case 'SUCCESS':
      return { ...state, status: 'success' };
    case 'FAILURE':
      return { ...state, status: 'error', errors: { form: action.error } };
    default:
      return state;
  }
}
```

## Global UI State Libraries

When state truly needs to be shared across distant components that are not in a parent-child relationship, you need a global state solution.

### Redux Toolkit (RTK)

Redux Toolkit is the official, opinionated way to use Redux. It eliminates the boilerplate that made Redux infamous:

```typescript
import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  user: { id: string; name: string; email: string } | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error';
}

const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null, status: 'idle' } as AuthState,
  reducers: {
    loginStart(state) {
      state.status = 'loading';
    },
    loginSuccess(state, action: PayloadAction<AuthState['user']>) {
      state.status = 'authenticated';
      state.user = action.payload;
    },
    logout(state) {
      state.status = 'idle';
      state.user = null;
    },
  },
});

export const { loginStart, loginSuccess, logout } = authSlice.actions;

const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

**When to use Redux Toolkit:**
- Large teams that benefit from the enforced action/reducer pattern
- Apps with complex state interactions that need middleware (logging, undo/redo)
- You need Redux DevTools for time-travel debugging
- Existing Redux codebase you are modernizing

### Zustand

Zustand is a minimal global state library. No providers, no boilerplate, no opinions about structure:

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface ThemeStore {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: ThemeStore['theme']) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  devtools(
    persist(
      (set) => ({
        theme: 'system',
        setTheme: (theme) => set({ theme }),
        toggleTheme: () =>
          set((state) => ({
            theme: state.theme === 'light' ? 'dark' : 'light',
          })),
      }),
      { name: 'theme-storage' }
    )
  )
);

// Usage — no Provider needed
function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  return <button onClick={toggleTheme}>Current: {theme}</button>;
}

// Select specific state to prevent unnecessary re-renders
function ThemeLabel() {
  const theme = useThemeStore((state) => state.theme);
  return <span>{theme}</span>;
}
```

**When to use Zustand:**
- Small to medium apps that need global state
- You want minimal API surface and zero boilerplate
- You want to avoid Provider nesting
- Teams that prefer simplicity over ceremony

### Jotai (Atomic State)

Jotai takes a bottom-up approach: state is stored in individual atoms, and components subscribe only to the atoms they read. This eliminates the "one store re-renders everything" problem:

```typescript
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Primitive atoms
const countAtom = atom(0);
const nameAtom = atom('');

// Derived atom (computed from other atoms)
const greetingAtom = atom((get) => {
  const name = get(nameAtom);
  const count = get(countAtom);
  return `Hello ${name}, you've visited ${count} times`;
});

// Async atom (fetches data)
const userAtom = atom(async () => {
  const response = await fetch('/api/user');
  return response.json();
});

// Persisted atom (survives refresh)
const settingsAtom = atomWithStorage('app-settings', {
  notifications: true,
  language: 'en',
});

// Component reads only what it needs — minimal re-renders
function Counter() {
  const [count, setCount] = useAtom(countAtom);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
}

function Greeting() {
  const greeting = useAtomValue(greetingAtom); // Read-only
  return <p>{greeting}</p>;
}
```

**When to use Jotai:**
- You need fine-grained reactivity (components should re-render only when their specific data changes)
- State is naturally composed of independent pieces
- You like the mental model of atoms / signals

### Valtio (Proxy-Based)

Valtio uses JavaScript Proxies to make state mutation reactive — you mutate plain objects and the library tracks which components need to re-render:

```typescript
import { proxy, useSnapshot } from 'valtio';

// State is a plain mutable object
const state = proxy({
  count: 0,
  todos: [] as Array<{ id: string; text: string; done: boolean }>,
});

// Mutations are plain assignments
function increment() {
  state.count++;
}

function addTodo(text: string) {
  state.todos.push({ id: crypto.randomUUID(), text, done: false });
}

function toggleTodo(id: string) {
  const todo = state.todos.find((t) => t.id === id);
  if (todo) todo.done = !todo.done;
}

// Components use snapshots for render consistency
function TodoList() {
  const snap = useSnapshot(state);
  return (
    <ul>
      {snap.todos.map((todo) => (
        <li key={todo.id} onClick={() => toggleTodo(todo.id)}>
          {todo.done ? '✓' : '○'} {todo.text}
        </li>
      ))}
    </ul>
  );
}
```

## Signals

Signals are a reactivity primitive that has swept across frameworks — Preact, Solid, Angular, Qwik, and Vue's `ref()` are all signal-based. A signal is a container for a value that automatically tracks which computations depend on it and re-runs them when the value changes.

```mermaid
graph LR
    S1["Signal: count = 5"] --> C1["Computed: doubled = 10"]
    S1 --> C2["Effect: log(count)"]
    C1 --> E1["DOM: <span>10</span>"]
    S1 --> E2["DOM: <span>5</span>"]
```

### Signals vs Virtual DOM

| Aspect | Virtual DOM (React) | Signals (Solid, Preact) |
|--------|-------------------|------------------------|
| **Update granularity** | Component level (re-renders entire component) | DOM node level (updates specific text/attribute) |
| **Tracking** | Manual (`useMemo`, `useCallback`, selectors) | Automatic (dependency tracking) |
| **Re-render cost** | Diffing cost grows with component tree size | Constant — only the affected DOM nodes update |
| **Mental model** | Function re-runs on every state change | Function runs once, sets up subscriptions |

```typescript
// Preact Signals
import { signal, computed, effect } from '@preact/signals';

const count = signal(0);
const doubled = computed(() => count.value * 2);

// This effect re-runs automatically when count changes
effect(() => {
  console.log(`Count is ${count.value}, doubled is ${doubled.value}`);
});

count.value = 5; // Logs: "Count is 5, doubled is 10"

// SolidJS Signals
import { createSignal, createMemo, createEffect } from 'solid-js';

const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);

createEffect(() => {
  console.log(`Count is ${count()}, doubled is ${doubled()}`);
});

setCount(5); // Logs: "Count is 5, doubled is 10"
```

### Angular Signals (v16+)

```typescript
import { signal, computed, effect } from '@angular/core';

@Component({
  template: `
    <button (click)="increment()">
      Count: {​{ count() }} | Doubled: {​{ doubled() }}
    </button>
  `,
})
export class CounterComponent {
  count = signal(0);
  doubled = computed(() => this.count() * 2);

  constructor() {
    effect(() => {
      console.log(`Count changed to ${this.count()}`);
    });
  }

  increment() {
    this.count.update((c) => c + 1);
  }
}
```

## Server State: TanStack Query

Server state (data that lives on the server) has fundamentally different requirements than UI state: it needs caching, background refetching, stale-while-revalidate, optimistic updates, and error retry. TanStack Query (formerly React Query) handles all of this:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Fetch data with automatic caching, refetching, and error handling
function ProductList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetch('/api/products').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,     // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000,       // Keep in cache for 30 minutes
    refetchOnWindowFocus: true,    // Refetch when user returns to tab
    retry: 3,                      // Retry failed requests 3 times
  });

  if (isLoading) return <Skeleton />;
  if (error) return <Error message={error.message} />;

  return (
    <ul>
      {data.map((product: Product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </ul>
  );
}

// Mutations with optimistic updates
function AddProductButton() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newProduct: NewProduct) =>
      fetch('/api/products', {
        method: 'POST',
        body: JSON.stringify(newProduct),
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json()),

    // Optimistic update: immediately show the new product
    onMutate: async (newProduct) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['products'] });

      // Snapshot previous value
      const previous = queryClient.getQueryData(['products']);

      // Optimistically add to cache
      queryClient.setQueryData(['products'], (old: Product[]) => [
        ...old,
        { ...newProduct, id: 'temp-' + Date.now() },
      ]);

      return { previous };
    },

    // Rollback on error
    onError: (_err, _newProduct, context) => {
      queryClient.setQueryData(['products'], context?.previous);
    },

    // Refetch after success or error to sync with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate({ name: 'New Product', price: 29.99 })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Adding...' : 'Add Product'}
    </button>
  );
}
```

## State Machines: XState

When your state has complex transitions, guards, and side effects — think multi-step forms, checkout flows, or WebSocket connection states — state machines formalize the logic and make impossible states impossible:

```typescript
import { createMachine, assign } from 'xstate';
import { useMachine } from '@xstate/react';

interface CheckoutContext {
  items: CartItem[];
  shippingAddress: Address | null;
  paymentMethod: PaymentMethod | null;
  error: string | null;
}

type CheckoutEvent =
  | { type: 'SET_ADDRESS'; address: Address }
  | { type: 'SET_PAYMENT'; method: PaymentMethod }
  | { type: 'SUBMIT' }
  | { type: 'BACK' }
  | { type: 'RETRY' };

const checkoutMachine = createMachine({
  id: 'checkout',
  initial: 'cart',
  context: {
    items: [],
    shippingAddress: null,
    paymentMethod: null,
    error: null,
  } as CheckoutContext,
  states: {
    cart: {
      on: { SUBMIT: 'shipping' },
    },
    shipping: {
      on: {
        SET_ADDRESS: {
          actions: assign({ shippingAddress: ({ event }) => event.address }),
        },
        SUBMIT: {
          guard: ({ context }) => context.shippingAddress !== null,
          target: 'payment',
        },
        BACK: 'cart',
      },
    },
    payment: {
      on: {
        SET_PAYMENT: {
          actions: assign({ paymentMethod: ({ event }) => event.method }),
        },
        SUBMIT: {
          guard: ({ context }) => context.paymentMethod !== null,
          target: 'processing',
        },
        BACK: 'shipping',
      },
    },
    processing: {
      invoke: {
        src: 'processPayment',
        onDone: 'success',
        onError: {
          target: 'error',
          actions: assign({ error: ({ event }) => event.error.message }),
        },
      },
    },
    success: { type: 'final' },
    error: {
      on: {
        RETRY: 'processing',
        BACK: 'payment',
      },
    },
  },
});
```

```mermaid
stateDiagram-v2
    [*] --> Cart
    Cart --> Shipping: SUBMIT
    Shipping --> Payment: SUBMIT (has address)
    Shipping --> Cart: BACK
    Payment --> Processing: SUBMIT (has payment)
    Payment --> Shipping: BACK
    Processing --> Success: Payment OK
    Processing --> Error: Payment Failed
    Error --> Processing: RETRY
    Error --> Payment: BACK
    Success --> [*]
```

## When You Don't Need a State Library

Before adding a dependency, consider:

1. **Can you lift state up?** If two siblings need shared state, move it to their common parent.
2. **Can you use URL state?** Search queries, filters, pagination — these belong in the URL, not in a store.
3. **Can you use React Context?** For truly global, rarely-changing values (theme, locale, auth), Context is sufficient.
4. **Is it server data?** Use TanStack Query or SWR — not a state library.

```typescript
// Context is fine for rarely-changing global state
const AuthContext = createContext<AuthState | null>(null);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Auth state changes rarely (login/logout), so Context re-renders are fine
  return (
    <AuthContext.Provider value={​{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be within AuthProvider');
  return context;
}
```

::: warning Context Is Not a State Manager
React Context is a dependency injection mechanism, not a state management tool. It re-renders every consumer when any part of the context value changes. If you have 10 values in a context and one changes, all 10 consumers re-render. For frequently changing state, use Zustand or Jotai.
:::

## Comparison Matrix

| Library | Bundle Size | Learning Curve | Re-render Control | DevTools | Best For |
|---------|-----------|---------------|-------------------|----------|----------|
| **useState** | 0 KB | Low | Manual | React DevTools | Local component state |
| **Redux Toolkit** | ~11 KB | Medium | Selectors | Excellent | Large teams, complex state |
| **Zustand** | ~1.2 KB | Low | Selectors | Good | Most apps, simple global state |
| **Jotai** | ~3.5 KB | Low | Automatic (atomic) | Good | Fine-grained reactivity |
| **Valtio** | ~3.8 KB | Low | Automatic (proxy) | Good | Mutable-style API preference |
| **TanStack Query** | ~13 KB | Medium | Automatic | Excellent | Server state / API caching |
| **XState** | ~15 KB | High | N/A | Excellent | Complex state machines |

## Further Reading

- [Rendering Strategies](/frontend-engineering/rendering-strategies) — How state management interacts with SSR, RSC, and hydration
- [Architecture Patterns > Event-Driven](/architecture-patterns/event-driven/) — Event-driven patterns that parallel frontend state management
- [UI & Design Systems > Component Patterns](/ui-design-systems/component-patterns/) — Compound, controlled, and headless component patterns
- [Bundle Optimization](/frontend-engineering/bundle-optimization) — Tree-shake unused state library code

---

::: tip Key Takeaway
- Most state is local, most data is server-owned, and what remains rarely justifies a global state library — the first rule is to question whether you need one at all.
- Treating server data as client state (fetching into Redux) is the most common mistake — use TanStack Query or SWR to handle caching, refetching, and staleness automatically.
- Signals represent a paradigm shift from React's component-level re-rendering to DOM-node-level updates, eliminating the need for manual memoization.
:::

::: warning Common Misconceptions
- **"Redux is required for large React apps."** Redux is one option among many. Zustand, Jotai, and even React Context + TanStack Query cover most use cases with far less boilerplate. Redux Toolkit is justified for teams that benefit from enforced patterns and time-travel debugging.
- **"Context is a state manager."** React Context is a dependency injection mechanism. It re-renders every consumer when any part of the context value changes. For frequently changing state (typing in an input, drag position), Context causes unnecessary re-renders.
- **"Global state is simpler than prop drilling."** Global state introduces hidden dependencies, makes components harder to test, and couples unrelated parts of the app. Prop drilling is explicit and traceable — it is often the better choice.
- **"You need a state library for forms."** Form state is local to the form component. Libraries like React Hook Form or Formik handle it without needing global state. Putting form state in Redux is an anti-pattern.
- **"Signals make React obsolete."** Signals offer fine-grained reactivity that React lacks, but React's ecosystem, tooling, and community are unmatched. Signals are a reactivity primitive available in Preact, Solid, Angular, and Vue — each with different trade-offs.
:::

## When NOT to Use State Management Libraries

- **Fewer than 3 components sharing the same state** — Lifting state to a common parent is simpler, more explicit, and has zero bundle cost.
- **State that belongs in the URL** — Search queries, filters, pagination, and sort order should live in URL params (shareable, bookmarkable, back-button-friendly) — not in a store.
- **Server data** — If the data originates from an API, it is server state. Use TanStack Query or SWR, not Redux or Zustand. Server state has fundamentally different requirements (caching, refetching, staleness).
- **Auth state that rarely changes** — Login/logout happens once per session. React Context is perfectly sufficient for this — you do not need Zustand or Redux for state that changes twice per session.
- **State machine overkill** — XState is powerful but heavy (15KB). A checkout flow with 3 steps does not need a formal state machine. A simple `useState<'cart' | 'shipping' | 'payment'>` suffices.

::: tip In Production
- **Shopify** uses Zustand for their admin dashboard's UI state, choosing it over Redux for its minimal API surface and zero-provider architecture.
- **Airbnb** contributed Visx (data visualization) but uses a combination of React Context for theme/auth and TanStack Query for all server data, with no global state library for UI state.
- **Vercel** built the Next.js App Router around React Server Components, which eliminate the need for client-side data fetching libraries entirely for server-owned data.
- **Discord** moved from Redux to a custom state solution and later evaluated Zustand, citing Redux's boilerplate overhead for their real-time, high-frequency update patterns.
- **Facebook/Meta** developed Recoil (atomic state) for their internal apps but the broader React community has largely converged on Jotai and Zustand as lighter alternatives with stronger maintenance.
:::

::: details Quiz

**1. What are the four types of frontend state, and what tool handles each?**

::: details Answer
Local UI state (useState/useReducer), Global UI state (Context, Zustand, Jotai), Server state (TanStack Query, SWR), and URL state (Router, URLSearchParams). The key insight is that most "state management problems" are actually server state problems masquerading as client state problems.
:::

**2. Why does React Context re-render all consumers when any value changes?**

::: details Answer
Context uses reference equality to detect changes. When you provide an object like `{ user, theme, locale }`, even if only `locale` changes, a new object reference is created, causing all consumers to re-render — even those that only read `user`. This is why Context is a dependency injection tool, not a state manager.
:::

**3. What problem does TanStack Query solve that Redux does not?**

::: details Answer
TanStack Query handles the entire server state lifecycle: caching, background refetching, stale-while-revalidate, cache invalidation, optimistic updates, error retry, pagination, and infinite queries. With Redux, you must implement all of this manually. TanStack Query treats server data as a cache with a defined staleness window, not as client-owned state.
:::

**4. How do Signals differ from React's virtual DOM approach to reactivity?**

::: details Answer
React re-renders entire components when state changes, then diffs the virtual DOM to find what changed. Signals track dependencies at the individual value level and update only the specific DOM nodes that depend on the changed value. This means signals have O(1) update cost regardless of component tree size, while React's cost grows with component tree depth.
:::

**5. When is XState (state machines) justified over a simple `useState`?**

::: details Answer
XState is justified when your state has complex transitions with guards (conditions), parallel states, or when impossible states must be impossible (e.g., a checkout flow where you cannot reach "payment" without "shipping address" being set). For simple toggles or linear flows, useState is clearer and 15KB lighter.
:::

:::

::: details Exercise
**State Architecture Audit**

Take an existing React (or Vue/Svelte) application you work on and conduct a state audit:

1. List every piece of state in the app (component state, global stores, URL params, server data)
2. Classify each into: Local UI, Global UI, Server, or URL state
3. Identify state that is in the wrong category (e.g., server data stored in Redux)
4. Propose a migration plan that moves each piece of state to the appropriate tool

::: details Solution
Example audit for a hypothetical e-commerce app:

| Current State | Current Tool | Category | Correct Tool | Migration |
|---|---|---|---|---|
| Product list | Redux store | Server | TanStack Query | Replace `fetchProducts` action with `useQuery` |
| Cart items | Redux store | Global UI | Zustand | Create `useCartStore` (persisted to localStorage) |
| Search query | Redux store | URL | URLSearchParams | Move to `?q=` URL param with router |
| Modal open/close | Redux store | Local UI | useState | Move to component-level state |
| User auth | Redux store | Global UI | React Context | Auth changes rarely; Context is sufficient |
| Product filters | Redux store | URL | URLSearchParams | Move to `?category=&sort=` URL params |
| Form inputs | Redux store | Local UI | React Hook Form | Remove from global state entirely |

After migration: Redux can be removed entirely. Server state is handled by TanStack Query (with caching, refetching). UI state is split between Zustand (cart) and Context (auth). URL state is in the URL. Form state is local. Total reduction: ~11KB (Redux Toolkit) from the bundle.
:::

:::

> **One-Liner Summary:** The first rule of state management is that most state does not need managing — it is either local to a component, owned by the server, or belongs in the URL.
