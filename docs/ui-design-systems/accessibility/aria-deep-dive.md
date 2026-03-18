---
title: "ARIA Deep Dive"
description: "ARIA roles, states, properties, live regions, common patterns, and the accessible name computation algorithm"
tags: [accessibility, aria, wcag, screen-readers, html, a11y]
difficulty: "advanced"
prerequisites: [accessibility/index]
lastReviewed: "2026-03-18"
---

# ARIA Deep Dive

ARIA (Accessible Rich Internet Applications) is a set of HTML attributes that augment the semantic meaning of elements for assistive technologies. The first rule of ARIA: **don't use ARIA**. Use correct HTML semantics first. ARIA is for when native HTML can't express the required semantics.

## ARIA First Rule

```html
<!-- Don't do this -->
<div role="button" tabindex="0" onclick="...">Save</div>

<!-- Do this instead -->
<button type="button" onclick="...">Save</button>
```

The `<button>` element gives you for free:
- `role="button"` in the accessibility tree
- Keyboard activation (Enter and Space)
- `tabindex` in focus order
- `:disabled` state handling
- Form submission behavior
- Automatic focus management in some contexts

ARIA can only add semantics to the accessibility tree — it cannot:
- Make an element keyboard-focusable (use `tabindex`)
- Make an element visible/hidden (use CSS)
- Change actual behavior (use JavaScript)
- Fix incorrect DOM structure

## ARIA Roles

Roles define what an element IS. There are five categories:

### Widget Roles

Interactive components that receive user input:

| Role | Description | Keyboard Interaction |
|------|-------------|---------------------|
| `button` | Clickable button | Enter, Space |
| `checkbox` | Toggleable option | Space toggles |
| `combobox` | Editable select | Arrow keys, Enter |
| `dialog` | Modal dialog | Escape closes, Tab cycles |
| `listbox` | Selection list | Arrow keys, Space/Enter |
| `menu` | Command menu | Arrow keys, Enter, Escape |
| `menuitem` | Item in menu | Activated by Enter |
| `option` | Item in listbox | Arrow keys navigate |
| `radio` | One-of-many choice | Arrow keys cycle |
| `radiogroup` | Container for radios | — |
| `slider` | Value slider | Arrow keys change value |
| `spinbutton` | Numeric input | Arrow keys increment |
| `switch` | Toggle switch | Space toggles |
| `tab` | Tab in tab list | Arrow keys navigate tabs |
| `tablist` | Container for tabs | — |
| `tabpanel` | Panel shown by tab | — |
| `textbox` | Text input | Standard keyboard editing |
| `tooltip` | Tooltip popup | — |
| `tree` | Expandable tree | Arrow keys |
| `treeitem` | Item in tree | Arrow keys, Enter |

### Structure Roles

Define the structural purpose of an element:

```html
<!-- Landmark roles (used for page navigation) -->
<header role="banner">…</header>      <!-- Page header -->
<nav role="navigation">…</nav>         <!-- Navigation region -->
<main role="main">…</main>             <!-- Main content -->
<aside role="complementary">…</aside>  <!-- Secondary content -->
<footer role="contentinfo">…</footer>  <!-- Page footer -->
<form role="form">…</form>             <!-- Form region -->
<section role="region" aria-labelledby="section-id">…</section>

<!-- Most HTML5 elements already have implicit roles -->
<!-- <main> is equivalent to role="main" -->
<!-- <nav>  is equivalent to role="navigation" -->
<!-- Always prefer native HTML elements -->
```

### Live Region Roles

```html
<!-- Status messages (polite, not urgent) -->
<div role="status" aria-live="polite">
  3 of 10 items loaded
</div>

<!-- Alert messages (assertive, urgent) -->
<div role="alert" aria-live="assertive">
  Error: Payment failed. Please try again.
</div>

<!-- Log (append-only content) -->
<div role="log" aria-live="polite">
  <p>12:00 - Session started</p>
  <p>12:05 - User logged in</p>
</div>
```

## ARIA States

States are dynamic properties that change based on user interaction:

```html
<!-- Selection states -->
<button aria-pressed="true">Bold</button>         <!-- Toggle button -->
<button aria-pressed="false">Italic</button>

<li role="option" aria-selected="true">Option 1</li>
<li role="option" aria-selected="false">Option 2</li>

<!-- Expansion states -->
<button aria-expanded="true" aria-controls="menu-1">Open Menu</button>
<ul id="menu-1" role="menu">…</ul>

<details>
  <summary aria-expanded="true">See more</summary><!-- HTML handles this -->
  <p>More content here</p>
</details>

<!-- Disabled and read-only -->
<button aria-disabled="true">Submit</button><!-- Visual disabled, still focusable -->
<button disabled>Submit</button>            <!-- Native disabled, not focusable -->

<input aria-readonly="true" />  <!-- Readable but not editable -->
<input readonly />              <!-- Native readonly -->

<!-- Current/selected in navigation -->
<a href="/dashboard" aria-current="page">Dashboard</a>
<a href="/settings">Settings</a>

<!-- Invalid form field -->
<input
  aria-invalid="true"
  aria-describedby="email-error"
  type="email"
/>
<span id="email-error" role="alert">Invalid email address</span>
```

## ARIA Properties

Properties are static descriptors:

### Labeling Properties

```html
<!-- aria-label: direct string label -->
<button aria-label="Close dialog">×</button>
<input type="search" aria-label="Search products" />

<!-- aria-labelledby: reference another element's text -->
<h2 id="card-title">Account Settings</h2>
<section aria-labelledby="card-title">…</section>

<!-- aria-describedby: additional description -->
<input
  type="password"
  aria-describedby="password-help"
/>
<p id="password-help">
  Must be at least 8 characters, include a number and special character.
</p>

<!-- Combining: label + description -->
<input
  type="email"
  id="email"
  aria-labelledby="email-label"
  aria-describedby="email-hint email-error"
/>
<label id="email-label" for="email">Email</label>
<span id="email-hint">We'll never share your email</span>
<span id="email-error" aria-live="polite" hidden>Invalid format</span>
```

### Relationship Properties

```html
<!-- aria-controls: this element controls another -->
<button
  aria-controls="sidebar"
  aria-expanded="false"
  id="toggle-btn"
>
  Toggle Sidebar
</button>
<nav id="sidebar" aria-labelledby="toggle-btn">…</nav>

<!-- aria-owns: declares parent-child relationship (DOM doesn't match) -->
<!-- Used when visual parent-child differs from DOM order -->
<ul role="tree" aria-owns="subtree-1">
  <li role="treeitem">Item 1</li>
</ul>
<ul id="subtree-1" role="group">
  <li role="treeitem">Subitem 1</li>
</ul>

<!-- aria-flowto: override reading order -->
<p id="para-1" aria-flowto="para-3">Paragraph 1</p>
<p id="para-2">Paragraph 2 (skipped in flow)</p>
<p id="para-3">Paragraph 3 (follows 1 in screen reader)</p>
```

### Value Properties

```html
<!-- Sliders and range inputs -->
<div
  role="slider"
  aria-valuenow="50"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuetext="50%"
  tabindex="0"
/>

<!-- Progress indicators -->
<div
  role="progressbar"
  aria-valuenow="65"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-label="Upload progress"
/>

<!-- Spinbutton -->
<input
  role="spinbutton"
  aria-valuenow="5"
  aria-valuemin="1"
  aria-valuemax="10"
  aria-label="Quantity"
/>
```

## The Accessible Name Computation Algorithm

When a screen reader encounters an element, it computes the accessible name through a specific algorithm (the Accessible Name and Description Computation, ANDC):

```
Priority order for accessible name:
1. aria-labelledby (highest priority — references other elements)
2. aria-label (string override)
3. Native name (for inputs: <label>, for images: alt, for links: text content)
4. aria-describedby (supplementary description, lower priority)
5. title attribute (tooltip, lowest priority — fallback only)
```

```typescript
// Simulate accessible name computation (simplified)
function getAccessibleName(element: HTMLElement): string {
  // 1. aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labels = labelledBy.split(' ')
      .map(id => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (labels.length > 0) return labels.join(' ');
  }

  // 2. aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  // 3. Native labeling
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label.textContent?.trim() ?? '';
    }
  }

  if (tagName === 'img') {
    return element.getAttribute('alt') ?? '';
  }

  // Text content (for buttons, links, etc.)
  return element.textContent?.trim() ?? '';
}
```

::: warning Accessible name traps
- `aria-label` on a `<div>` does NOT make it appear as labeled in the accessibility tree unless it has a role
- `title` attribute is accessible but not visible on touch devices and should not be the primary accessible name
- Using `aria-labelledby` and `aria-label` together: `aria-labelledby` wins
:::

## Live Regions

Live regions announce dynamic content changes to screen readers without requiring focus:

```html
<!-- polite: announces when user is idle -->
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  id="status-message"
>
  <!-- Injected by JS: "5 items saved" -->
</div>

<!-- assertive: interrupts current announcement -->
<div
  role="alert"
  aria-live="assertive"
  aria-atomic="true"
  id="error-message"
>
  <!-- Injected by JS: "Error: Network request failed" -->
</div>
```

```typescript
// Live region manager
class LiveRegionAnnouncer {
  private politeRegion: HTMLElement;
  private assertiveRegion: HTMLElement;

  constructor() {
    this.politeRegion = this.createRegion('polite');
    this.assertiveRegion = this.createRegion('assertive');
  }

  private createRegion(politeness: 'polite' | 'assertive'): HTMLElement {
    const region = document.createElement('div');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');

    // Visually hidden but available to screen readers
    Object.assign(region.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0',
    });

    document.body.appendChild(region);
    return region;
  }

  announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
    const region = politeness === 'assertive' ? this.assertiveRegion : this.politeRegion;

    // Clear and re-set to ensure announcement even if message is same
    region.textContent = '';
    // Use setTimeout to ensure DOM update triggers announcement
    setTimeout(() => {
      region.textContent = message;
    }, 50);
  }

  destroy(): void {
    this.politeRegion.remove();
    this.assertiveRegion.remove();
  }
}

// React hook
export function useAnnouncer() {
  const announcerRef = useRef<LiveRegionAnnouncer | null>(null);

  useEffect(() => {
    announcerRef.current = new LiveRegionAnnouncer();
    return () => announcerRef.current?.destroy();
  }, []);

  return {
    announce: (msg: string) => announcerRef.current?.announce(msg, 'polite'),
    announceAssertive: (msg: string) => announcerRef.current?.announce(msg, 'assertive'),
  };
}
```

## Complex Widget Patterns

### Tab Widget

```html
<div class="tabs">
  <div role="tablist" aria-label="Account sections">
    <button
      role="tab"
      id="tab-profile"
      aria-controls="panel-profile"
      aria-selected="true"
      tabindex="0"
    >Profile</button>
    <button
      role="tab"
      id="tab-security"
      aria-controls="panel-security"
      aria-selected="false"
      tabindex="-1"
    >Security</button>
    <button
      role="tab"
      id="tab-billing"
      aria-controls="panel-billing"
      aria-selected="false"
      tabindex="-1"
    >Billing</button>
  </div>

  <div
    role="tabpanel"
    id="panel-profile"
    aria-labelledby="tab-profile"
    tabindex="0"
  >
    <!-- Profile content -->
  </div>
  <div
    role="tabpanel"
    id="panel-security"
    aria-labelledby="tab-security"
    tabindex="0"
    hidden
  >
    <!-- Security content -->
  </div>
</div>
```

```typescript
// Tab keyboard interaction
function initTabWidget(tablist: HTMLElement): void {
  const tabs = Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]'));

  tablist.addEventListener('keydown', (e: KeyboardEvent) => {
    const currentIndex = tabs.indexOf(e.target as HTMLElement);
    if (currentIndex === -1) return;

    let newIndex: number;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        newIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    activateTab(tabs[newIndex]);
  });

  function activateTab(tab: HTMLElement): void {
    // Deactivate all tabs
    tabs.forEach(t => {
      t.setAttribute('aria-selected', 'false');
      t.setAttribute('tabindex', '-1');
      document.getElementById(t.getAttribute('aria-controls')!)
        ?.setAttribute('hidden', '');
    });

    // Activate selected tab
    tab.setAttribute('aria-selected', 'true');
    tab.setAttribute('tabindex', '0');
    tab.focus();

    const panel = document.getElementById(tab.getAttribute('aria-controls')!);
    panel?.removeAttribute('hidden');
  }
}
```

::: info War Story
A product team built a custom dropdown component using `<div>` elements with click handlers. It worked perfectly with a mouse. When they ran their first screen reader test (VoiceOver on macOS), they discovered: the screen reader announced "Group" with no list count, all items were inaccessible by keyboard, and the selected state was not communicated. The fix required a complete rebuild with `role="listbox"`, `role="option"`, `aria-selected`, `tabindex`, and full keyboard interaction. It took 3 days. If they had used the WAI-ARIA Listbox Pattern from the start, it would have taken 3 hours.
:::
