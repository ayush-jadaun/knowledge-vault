---
title: "React Internals"
description: "Deep dive into React internals — Fiber architecture, reconciliation algorithm, virtual DOM diffing, hooks implementation, concurrent rendering, lanes, and React Server Components"
tags: [react, internals, fiber, reconciliation, virtual-dom]
difficulty: advanced
prerequisites: [react-basics, javascript]
lastReviewed: "2026-03-20"
---

# React Internals

Most React developers know *what* React does: you describe UI as a function of state, and React updates the DOM. But understanding *how* React does it — the Fiber architecture, the reconciliation algorithm, the hook linked list, the lane-based priority system — transforms you from someone who uses React into someone who can diagnose why React behaves the way it does.

This page takes you through React's internals from first principles. We start with the data structures React uses to represent your component tree, then walk through how renders are scheduled, how diffing works, and how hooks maintain state between renders.

**Related**: [Browser Rendering Pipeline](/frontend-engineering/browser-rendering) | [State Management](/frontend-engineering/state-management) | [Web Performance](/frontend-engineering/web-performance)

---

## From JSX to Fiber

When you write JSX, Babel/SWC transforms it into `React.createElement` calls (or the JSX runtime's `jsx` function in React 17+):

```jsx
// Your code
<div className="container">
  <h1>Hello</h1>
  <Counter count={5} />
</div>

// Compiled output (jsx runtime)
jsx('div', {
  className: 'container',
  children: [
    jsx('h1', { children: 'Hello' }),
    jsx(Counter, { count: 5 }),
  ]
});
```

This produces **React Elements** — plain JavaScript objects:

```javascript
{
  type: 'div',
  props: {
    className: 'container',
    children: [
      { type: 'h1', props: { children: 'Hello' } },
      { type: Counter, props: { count: 5 } },
    ]
  },
  key: null,
  ref: null
}
```

React Elements are cheap, immutable descriptions of what the UI *should* look like. They are created every render and then thrown away. The real work happens in **Fiber nodes**.

---

## Fiber Architecture

A Fiber is a JavaScript object that represents a unit of work. Every component instance, DOM element, and React internal concept gets a Fiber node. Together they form a tree — the **Fiber tree**.

### Fiber Node Structure

```typescript
interface Fiber {
  // Identity
  tag: WorkTag;             // FunctionComponent, HostComponent, etc.
  type: any;                // 'div', Counter, Fragment, etc.
  key: string | null;

  // Tree structure
  return: Fiber | null;     // Parent fiber
  child: Fiber | null;      // First child
  sibling: Fiber | null;    // Next sibling

  // State
  memoizedState: any;       // Hook linked list (functions) or state (classes)
  memoizedProps: any;       // Props from last render
  pendingProps: any;        // Props for this render

  // Effects
  flags: Flags;             // Placement, Update, Deletion, etc.
  subtreeFlags: Flags;      // Aggregated flags from children
  updateQueue: any;         // Queue of state updates

  // Alternate
  alternate: Fiber | null;  // Points to the other tree (current <-> workInProgress)

  // Priority
  lanes: Lanes;             // Which lanes this fiber has pending work in
  childLanes: Lanes;        // Lanes from descendants
}
```

### The Two-Tree Architecture (Double Buffering)

React maintains two Fiber trees at all times:

1. **Current tree** — represents what is currently on screen
2. **Work-in-progress (WIP) tree** — being built during the next render

```
Current Tree          Work-in-Progress Tree
    App ←── alternate ──→ App
   / \                   / \
  H1  Counter          H1  Counter
      |                     |
    Button               Button
```

When the WIP tree is complete, React **commits** it: the WIP tree becomes the new current tree. This is the double-buffering technique — render to an off-screen buffer, then swap.

---

## The Render Phase (Reconciliation)

The render phase is where React diffs the old tree against new elements and figures out what changed. This phase is **interruptible** in concurrent mode.

### The Work Loop

```javascript
// Simplified version of React's work loop
function workLoopConcurrent() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}

function performUnitOfWork(unitOfWork) {
  const next = beginWork(unitOfWork);  // Process this fiber, return child

  if (next !== null) {
    workInProgress = next;  // Continue to child
  } else {
    completeUnitOfWork(unitOfWork);  // No children, go to sibling or parent
  }
}
```

The work loop processes one fiber at a time. After each unit of work, it checks `shouldYield()` — if the browser needs to handle user input or paint a frame, React pauses and resumes later. This is what makes concurrent rendering possible.

### `beginWork` — Top-Down Processing

`beginWork` is called for each fiber, top-down. It:

1. Checks if the fiber can be bailed out (no changes)
2. Renders the component (calls function components, processes class render)
3. Reconciles children (diffs old children vs new elements)
4. Returns the first child fiber (or null if leaf)

```javascript
function beginWork(current, workInProgress) {
  // Optimization: if nothing changed, skip
  if (current !== null && current.memoizedProps === workInProgress.pendingProps) {
    if (!hasScheduledUpdateInFiber(workInProgress)) {
      return bailout(current, workInProgress);
    }
  }

  switch (workInProgress.tag) {
    case FunctionComponent:
      return updateFunctionComponent(current, workInProgress);
    case HostComponent:  // DOM element like 'div'
      return updateHostComponent(current, workInProgress);
    case ClassComponent:
      return updateClassComponent(current, workInProgress);
    // ... other types
  }
}
```

### `completeWork` — Bottom-Up Processing

When `beginWork` returns null (no more children), `completeWork` processes the fiber bottom-up:

1. Creates DOM nodes (for host components)
2. Collects effects (which fibers need DOM mutations)
3. Bubbles `subtreeFlags` up to parent

---

## Diffing Algorithm (Reconciliation)

React's reconciliation uses heuristics that reduce the O(n^3) tree diff problem to O(n):

### Rule 1: Different Types = Full Replace

```jsx
// Old                    // New
<div>                     <span>
  <Counter />               <Counter />
</div>                    </span>

// React destroys the entire <div> subtree and builds <span> from scratch
// Counter is unmounted and remounted — state is lost
```

### Rule 2: Same Type = Update Props

```jsx
// Old                    // New
<div className="old">     <div className="new">
  <Counter />               <Counter />
</div>                    </div>

// React updates the className on the DOM node
// Counter is preserved — state is maintained
```

### Rule 3: Lists Use Keys

```jsx
// Without keys — React can't tell items moved
<ul>
  <li>Apple</li>          // Matched by index
  <li>Banana</li>         // Matched by index
</ul>

// With keys — React tracks identity
<ul>
  <li key="a">Apple</li>   // Tracked by key "a"
  <li key="b">Banana</li>  // Tracked by key "b"
</ul>
```

The key algorithm works as follows:

1. Build a map of `key -> old fiber` for existing children
2. Walk through new elements:
   - If key matches an existing fiber, reuse it (possibly move it)
   - If no match, create a new fiber
3. Delete any old fibers that were not matched

::: danger
Using array index as key breaks this optimization. If you prepend an item, every item gets a new index, so React thinks every item changed. Use stable, unique IDs.
:::

---

## Hooks Under the Hood

Hooks are stored as a **linked list** on the fiber's `memoizedState` property. Each hook call creates or reads a node in this list.

```
Fiber.memoizedState → Hook1 → Hook2 → Hook3 → null
                      (useState)  (useEffect)  (useMemo)
```

### Why Hooks Must Be Called in the Same Order

React does not store hooks by name. It uses the call order as the identity. On the first render, hooks are created in order. On subsequent renders, React walks the existing linked list in order, matching each hook call to its previous state.

```javascript
// Simplified hook dispatcher
let currentHook = null;

function useState(initialValue) {
  if (isFirstRender) {
    const hook = { state: initialValue, queue: [], next: null };
    appendHookToList(hook);
    return [hook.state, createDispatcher(hook)];
  } else {
    // Read the next hook from the existing list
    currentHook = currentHook.next;
    processUpdateQueue(currentHook);
    return [currentHook.state, currentHook.dispatcher];
  }
}
```

If you put a hook inside a conditional, the linked list order changes between renders, and hooks read the wrong state.

```jsx
// BROKEN: conditional hook
function Bad({ showName }) {
  if (showName) {
    const [name, setName] = useState('');  // Hook 1 (sometimes)
  }
  const [age, setAge] = useState(0);       // Hook 1 or 2 — ambiguous!
}
```

### useEffect Implementation

```javascript
function useEffect(create, deps) {
  const hook = getOrCreateHook();

  if (isFirstRender) {
    hook.memoizedState = { create, destroy: undefined, deps };
    fiber.flags |= PassiveEffect;  // Mark for post-commit processing
  } else {
    const prevDeps = hook.memoizedState.deps;
    if (depsChanged(prevDeps, deps)) {
      hook.memoizedState = { create, destroy: hook.memoizedState.destroy, deps };
      fiber.flags |= PassiveEffect;
    }
  }
}
```

Effects are collected during render but executed **after** the commit phase (after DOM mutations and browser paint). This is why `useEffect` runs asynchronously. `useLayoutEffect` runs synchronously after DOM mutations but before paint.

---

## The Commit Phase

The commit phase applies all changes to the DOM. It is **synchronous and uninterruptible** — once React starts committing, it finishes before yielding to the browser.

### Three Sub-Phases

1. **Before Mutation** — read DOM layout before changes (`getSnapshotBeforeUpdate`)
2. **Mutation** — apply DOM changes (insertions, updates, deletions)
3. **Layout** — run `useLayoutEffect` callbacks, ref attachments

```
Render Phase (interruptible)
    ↓
Commit Phase (synchronous)
    ├── Before Mutation (read DOM)
    ├── Mutation (write DOM)
    └── Layout (useLayoutEffect, refs)
    ↓
Browser Paint
    ↓
Passive Effects (useEffect, async)
```

::: warning
`useLayoutEffect` blocks the browser paint. If your layout effect is slow, users see a visual delay. Use `useEffect` unless you need to read layout and synchronously re-render before the user sees the result (e.g., measuring element dimensions for tooltip positioning).
:::

---

## Concurrent Rendering

Concurrent rendering lets React prepare multiple versions of the UI simultaneously and interrupt rendering to handle higher-priority work.

### Lanes (Priority System)

React uses a bitmask-based priority system called **lanes**. Each bit represents a priority level.

| Lane | Priority | Example |
|------|----------|---------|
| `SyncLane` | Highest | Text input, click handlers |
| `InputContinuousLane` | High | Drag, scroll |
| `DefaultLane` | Normal | Data fetching, setState |
| `TransitionLane` | Low | `startTransition` updates |
| `IdleLane` | Lowest | Offscreen rendering |

```typescript
// Using transitions
function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  function handleChange(e) {
    // Sync priority: update input immediately
    setQuery(e.target.value);

    // Transition priority: can be interrupted
    startTransition(() => {
      setResults(search(e.target.value));
    });
  }

  return (
    <>
      <input value={query} onChange={handleChange} />
      <ResultsList results={results} />
    </>
  );
}
```

When the user types, the input update happens at sync priority. The search results update at transition priority. If the user types again before the search finishes, React abandons the in-progress transition render and starts a new one. The input always stays responsive.

### Time Slicing

React splits rendering work into small chunks and yields to the browser between chunks:

```
Frame 1: [React work 5ms] [Browser paint] [User input]
Frame 2: [React work 5ms] [Browser paint]
Frame 3: [React work 5ms] [Browser paint] [Commit]
```

React targets 5ms chunks using `MessageChannel` (not `requestIdleCallback`, which proved too inconsistent).

---

## React Server Components (RSC)

RSCs run on the server and send a serialized component tree (not HTML) to the client. They fundamentally change the component model.

### How RSC Works

1. Server receives a request
2. Server renders RSC tree, resolving async data
3. Server serializes the result as an RSC payload (streaming JSON-like format)
4. Client receives the payload and reconstructs the React tree
5. Client components hydrate and become interactive

```
Server Component Tree:
  ServerLayout (runs on server)
    ├── ServerHeader (runs on server, fetches data)
    ├── ClientSearch (marked "use client", shipped to browser)
    └── ServerContent (runs on server, fetches data)
        └── ClientButton (marked "use client", shipped to browser)
```

### RSC Payload Format

The RSC wire format is a streaming protocol:

```
0:["$","div",null,{"children":[["$","h1",null,{"children":"Hello"}],...]}]
1:["$","$L2",null,{"count":0}]
2:I["./ClientCounter.js","ClientCounter"]
```

Each line is a chunk:
- `$` references to React elements
- `$L` references to client component modules
- `I` module import declarations

### Key RSC Constraints

| Server Components | Client Components |
|------------------|-------------------|
| Can `async/await` | Cannot be async |
| Can access backend directly | Need API calls |
| Cannot use hooks | Can use hooks |
| Cannot use browser APIs | Can use browser APIs |
| Zero bundle size impact | Shipped to client |
| Cannot hold state | Can hold state |
| Can import client components | Cannot import server components |

::: tip
Server Components are not a replacement for SSR. SSR generates HTML for first paint. RSCs are a new component type that never ships JavaScript to the client. They work together: RSCs stream data as a React tree, which can be server-rendered to HTML for the initial load.
:::

---

## Performance Implications

Understanding internals reveals why certain patterns are faster:

### Why Keys Matter

Without keys, React uses index-based diffing. Inserting at the beginning of a list causes every item to be "updated" (index shifted). With keys, React recognizes the existing items and only inserts the new one.

### Why `React.memo` Works

`React.memo` wraps a component so `beginWork` can bail out early. If props have not changed (shallow comparison), React skips rendering that component and its entire subtree.

```jsx
const ExpensiveList = React.memo(function ExpensiveList({ items }) {
  return items.map(item => <ExpensiveRow key={item.id} item={item} />);
});
```

### Why `useMemo` and `useCallback` Exist

They store values in the hook linked list and return the cached version if deps have not changed. This prevents:
- Expensive recomputations (`useMemo`)
- Creating new function references that break `React.memo` (`useCallback`)

### Why State Updates Are Batched

React batches multiple `setState` calls into a single re-render. In React 18+, all state updates are automatically batched, even in setTimeout and event listeners.

```jsx
function handleClick() {
  setCount(c => c + 1);    // Does not trigger render
  setFlag(f => !f);         // Does not trigger render
  setText('updated');        // Does not trigger render
  // React renders once with all three updates
}
```

---

*Last updated: 2026-03-20*
