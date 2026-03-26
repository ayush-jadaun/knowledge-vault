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

::: tip Key Takeaway
- React's Fiber architecture enables concurrent rendering by splitting work into small units that can be interrupted, allowing the browser to handle user input between render chunks.
- Hooks are stored as a linked list on each fiber node, which is why they must always be called in the same order — React matches hooks by position, not by name.
- The commit phase (DOM mutations) is synchronous and uninterruptible, while the render phase (reconciliation/diffing) is interruptible in concurrent mode.
:::

::: warning Common Misconceptions
- **"The virtual DOM is fast."** The virtual DOM is not fast — it is fast *enough*. Diffing and reconciling a virtual tree adds overhead compared to direct DOM manipulation. The value of the virtual DOM is that it provides a declarative programming model while keeping updates *reasonably* efficient. Frameworks like Solid and Svelte prove you can be faster without one.
- **"React re-renders mean DOM updates."** A React re-render means the component function runs again and React creates new React elements. The reconciliation algorithm then diffs these against the current fiber tree. Only if something actually changed does React mutate the DOM. Most re-renders result in zero DOM updates.
- **"useEffect is the same as componentDidMount."** `useEffect` runs after the browser has painted (asynchronously), while `componentDidMount` runs synchronously after the DOM mutation but before paint. `useLayoutEffect` is the true equivalent of `componentDidMount`.
- **"React.memo prevents all re-renders."** `React.memo` only does a shallow comparison of props. If you pass inline objects or functions (`onClick={() => ...}`), a new reference is created every render, and `React.memo` thinks props changed. You need `useCallback` and `useMemo` to stabilize references.
- **"Concurrent rendering makes everything faster."** Concurrent rendering makes the UI more *responsive* by allowing React to interrupt low-priority work for high-priority interactions. It does not reduce the total amount of work — it just schedules it more intelligently.
:::

## When NOT to Dig Into React Internals

- **Building standard CRUD applications** — You do not need to understand Fiber nodes and lanes to build a todo app or a dashboard. Learn the public API well before diving into internals.
- **Premature optimization based on internals** — Understanding the reconciliation algorithm does not mean you should micro-optimize every component. Measure first with React DevTools Profiler, then optimize the actual bottlenecks.
- **Choosing React based on internals** — Do not pick React over Solid/Svelte/Vue because Fiber sounds impressive. Pick based on ecosystem, team familiarity, and project requirements.
- **Reproducing internal patterns in userland** — Do not try to build your own hook system or reconciler unless you are building a framework. Use the public API and escape hatches React provides.

::: tip In Production
- **Meta (Facebook)** developed the Fiber architecture to solve jank on their News Feed, where long rendering of complex component trees blocked user input for 100ms+. Concurrent rendering lets the feed stay responsive during re-renders.
- **Vercel** leverages React Server Components (RSC) in Next.js App Router, where Server Components run only on the server and ship zero JavaScript, reducing client bundle sizes by 30-60% on content-heavy pages.
- **Shopify** uses `React.memo` and `useMemo` strategically in their Polaris component library to ensure design system components do not cause cascading re-renders in consuming applications.
- **Discord** found that React's batched state updates (automatic in React 18) eliminated a class of race conditions in their real-time message rendering pipeline where multiple WebSocket messages arrived in the same frame.
- **Figma** wraps their React UI around a WebGL canvas, using React only for the toolbar and panels while the canvas bypasses React's rendering pipeline entirely for maximum performance.
:::

::: details Quiz

**1. What is a Fiber node, and how does it differ from a React Element?**

::: details Answer
A React Element is a cheap, immutable JavaScript object describing what the UI should look like (`{ type, props, key, ref }`). It is created every render and discarded. A Fiber node is a mutable, persistent object that represents a unit of work, stores component state (`memoizedState`), tracks effects, and maintains tree structure (`child`, `sibling`, `return`). Fibers persist across renders; elements do not.
:::

**2. Why does React maintain two fiber trees (double buffering)?**

::: details Answer
React maintains a "current" tree (what is on screen) and a "work-in-progress" (WIP) tree (being built during the next render). This double-buffering approach lets React prepare the new UI without modifying the current one. Once the WIP tree is complete, it is committed (swapped in as the new current tree) in a single synchronous step, preventing partial/inconsistent UI states.
:::

**3. What are the three heuristics React uses for O(n) reconciliation?**

::: details Answer
(1) Different element types mean a full replacement — React destroys the subtree and rebuilds from scratch. (2) Same element type means an update — React patches the existing DOM node/component. (3) Lists use keys for identity tracking — keys let React detect moves, additions, and deletions efficiently instead of relying on index-based matching.
:::

**4. Why does `useLayoutEffect` block the browser paint while `useEffect` does not?**

::: details Answer
`useLayoutEffect` runs synchronously after DOM mutations (commit phase, "Layout" sub-phase) but before the browser paints. This is necessary when you need to read layout and synchronously re-render before the user sees the initial result (e.g., measuring dimensions for tooltip positioning). `useEffect` runs asynchronously after the browser has already painted, making it non-blocking.
:::

**5. How does React's lane-based priority system improve interactivity?**

::: details Answer
Lanes are a bitmask-based priority system where each bit represents a priority level (SyncLane for clicks, TransitionLane for `startTransition`, IdleLane for offscreen). When a user types in an input during a transition render, React abandons the in-progress transition (low priority) and immediately processes the input (high priority). The transition restarts after the input is processed, keeping the UI responsive.
:::

:::

::: details Exercise
**Build a Minimal React-like Reconciler**

Implement a simplified version of React's reconciliation algorithm:

1. Create a `createElement(type, props, ...children)` function that returns element objects
2. Implement a `render(element, container)` function that creates DOM nodes
3. Add a `reconcile(oldFiber, newElement)` function that diffs and patches:
   - Same type: update props
   - Different type: replace
   - New element: insert
   - Missing element: delete
4. Add basic `useState` support using a module-level hook array

::: details Solution
```javascript
// Minimal reconciler (simplified)
let hookIndex = 0;
let hooks = [];
let rootFiber = null;

function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.flat().map(c =>
        typeof c === 'object' ? c : { type: 'TEXT', props: { nodeValue: c, children: [] } }
      ),
    },
  };
}

function createDom(fiber) {
  const dom = fiber.type === 'TEXT'
    ? document.createTextNode('')
    : document.createElement(fiber.type);

  Object.keys(fiber.props)
    .filter(k => k !== 'children')
    .forEach(k => { dom[k] = fiber.props[k]; });

  return dom;
}

function reconcile(parentDom, oldFiber, element) {
  const sameType = oldFiber && element && oldFiber.type === element.type;

  if (sameType) {
    // UPDATE: same type, patch props
    Object.keys(element.props)
      .filter(k => k !== 'children')
      .forEach(k => { oldFiber.dom[k] = element.props[k]; });
    // Recurse children
    const children = element.props.children;
    const oldChildren = oldFiber.children || [];
    const max = Math.max(children.length, oldChildren.length);
    for (let i = 0; i < max; i++) {
      reconcile(oldFiber.dom, oldChildren[i], children[i]);
    }
    return oldFiber;
  }

  if (element && !sameType) {
    // INSERT or REPLACE
    const fiber = { type: element.type, props: element.props, dom: createDom({ type: element.type, props: element.props }), children: [] };
    if (oldFiber) parentDom.replaceChild(fiber.dom, oldFiber.dom);
    else parentDom.appendChild(fiber.dom);
    // Recurse children
    fiber.children = element.props.children.map(child => reconcile(fiber.dom, null, child));
    return fiber;
  }

  if (oldFiber && !element) {
    // DELETE
    parentDom.removeChild(oldFiber.dom);
    return null;
  }
}

function useState(initial) {
  const idx = hookIndex;
  hooks[idx] = hooks[idx] ?? initial;
  const setState = (val) => {
    hooks[idx] = typeof val === 'function' ? val(hooks[idx]) : val;
    hookIndex = 0;
    // Re-render (simplified)
    rootFiber = reconcile(rootFiber.dom.parentNode, rootFiber, rootFiber.element);
  };
  hookIndex++;
  return [hooks[idx], setState];
}
```

This exercise demonstrates why hooks must be called in order (array index), why reconciliation compares types, and why keys matter for lists.
:::

:::

> **One-Liner Summary:** Understanding React's Fiber architecture, hook linked list, and lane-based scheduling turns you from someone who uses React into someone who can explain why React behaves the way it does.

*Last updated: 2026-03-20*
