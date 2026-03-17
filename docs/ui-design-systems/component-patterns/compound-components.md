---
title: "Compound Components"
description: "Deep dive into the compound component pattern in React — from React.Children API to Context-based coordination, with complete TypeScript implementations of Select, Tabs, and Accordion components"
tags: [compound-components, react, design-systems, composition, typescript, context-api]
difficulty: intermediate
prerequisites: [react, typescript, react-context]
lastReviewed: "2026-03-17"
---

# Compound Components

Compound components are a set of components that work together to form a complete UI element. They share an implicit state, managed by a parent, while giving the consumer full control over the rendering and ordering of child parts. The pattern mirrors native HTML elements like `<select>` and `<option>` — individually meaningless, but powerful when combined.

## The Problem Compound Components Solve

Consider a naive Select component:

```tsx
// The prop-heavy approach
<Select
  options={[
    { value: 'apple', label: 'Apple', icon: <AppleIcon />, disabled: false },
    { value: 'banana', label: 'Banana', icon: <BananaIcon />, disabled: true },
    { value: 'cherry', label: 'Cherry', icon: <CherryIcon />, disabled: false },
  ]}
  placeholder="Choose a fruit"
  value={selected}
  onChange={setSelected}
  searchable
  clearable
  renderOption={(option) => (
    <div className="flex gap-2">
      {option.icon}
      <span>{option.label}</span>
    </div>
  )}
  renderSelectedValue={(option) => (
    <span className="font-bold">{option.label}</span>
  )}
/>
```

Problems with this approach:

1. **Prop explosion** — every customization point is another prop
2. **Rigid API** — want to add a divider between options? Need a new prop for that
3. **Config objects as UI** — the `options` array mixes data with rendering concerns
4. **renderX callbacks** — these are render props in disguise, but attached as random props

Now compare with compound components:

```tsx
// The compound component approach
<Select value={selected} onChange={setSelected}>
  <Select.Trigger placeholder="Choose a fruit" />
  <Select.Content>
    <Select.Item value="apple">
      <AppleIcon /> Apple
    </Select.Item>
    <Select.Item value="banana" disabled>
      <BananaIcon /> Banana
    </Select.Item>
    <Select.Separator />
    <Select.Item value="cherry">
      <CherryIcon /> Cherry
    </Select.Item>
  </Select.Content>
</Select>
```

This approach:

1. **No prop explosion** — each part has a focused, minimal API
2. **Composable** — add a `Separator` wherever you want, wrap items in groups, add headers
3. **Familiar** — reads like HTML (`<select>` + `<option>`)
4. **Customizable** — each `Select.Item` receives arbitrary children for rendering

## Implementation Approaches

### Approach 1: React.Children API (Legacy)

The original compound component pattern uses `React.Children` and `React.cloneElement` to inject props into children. This approach is well-understood but has significant limitations.

```tsx
import { Children, cloneElement, useState, isValidElement, type ReactNode, type ReactElement } from 'react';

// ─── Types ──────────────────────────────────────────────────────────

type TabsProps = {
  defaultIndex?: number;
  onChange?: (index: number) => void;
  children: ReactNode;
  className?: string;
};

type TabProps = {
  /** Injected by parent — do NOT set manually */
  index?: number;
  /** Injected by parent — do NOT set manually */
  isActive?: boolean;
  /** Injected by parent — do NOT set manually */
  onSelect?: (index: number) => void;
  children: ReactNode;
  disabled?: boolean;
};

type TabPanelProps = {
  /** Injected by parent — do NOT set manually */
  index?: number;
  /** Injected by parent — do NOT set manually */
  isActive?: boolean;
  children: ReactNode;
};

// ─── Components ─────────────────────────────────────────────────────

function Tab({ isActive, onSelect, index, disabled, children }: TabProps) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => !disabled && onSelect?.(index!)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        isActive
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  );
}

function TabPanel({ isActive, children }: TabPanelProps) {
  if (!isActive) return null;
  return (
    <div role="tabpanel" className="p-4">
      {children}
    </div>
  );
}

function Tabs({ defaultIndex = 0, onChange, children, className }: TabsProps) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);

  const handleSelect = (index: number) => {
    setActiveIndex(index);
    onChange?.(index);
  };

  // Separate Tab and TabPanel children
  const tabs: ReactElement[] = [];
  const panels: ReactElement[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Tab) tabs.push(child);
    if (child.type === TabPanel) panels.push(child);
  });

  return (
    <div className={className}>
      <div role="tablist" className="flex border-b">
        {tabs.map((tab, index) =>
          cloneElement(tab, {
            index,
            isActive: index === activeIndex,
            onSelect: handleSelect,
          })
        )}
      </div>
      {panels.map((panel, index) =>
        cloneElement(panel, {
          index,
          isActive: index === activeIndex,
        })
      )}
    </div>
  );
}

// Usage:
function TabsExample() {
  return (
    <Tabs defaultIndex={0} onChange={(i) => console.log('Tab:', i)}>
      <Tab>Account</Tab>
      <Tab>Notifications</Tab>
      <Tab disabled>Billing</Tab>

      <TabPanel>Account settings content</TabPanel>
      <TabPanel>Notification preferences content</TabPanel>
      <TabPanel>Billing information content</TabPanel>
    </Tabs>
  );
}
```

**Limitations of `React.Children` + `cloneElement`:**

1. **Fragile to wrapping** — if a consumer wraps a `Tab` in a `<div>` or a custom component, `cloneElement` will inject props into the wrong element
2. **Only direct children** — cannot inject into deeply nested children without recursive traversal
3. **TypeScript friction** — the injected props (`isActive`, `onSelect`) are technically optional even though they are always present, leading to `!` assertions
4. **Performance** — `cloneElement` creates new element objects on every render
5. **React team discourages it** — the React documentation recommends Context over `cloneElement` for compound components

### Approach 2: Context-Based (Modern Standard)

The modern approach uses React Context to share state between compound components. This eliminates all `React.Children` limitations.

```tsx
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useId,
  forwardRef,
  useRef,
  useEffect,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { cn } from '@/lib/utils';

// ─── Context ────────────────────────────────────────────────────────

type TabsContextValue = {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  registerTab: (index: number, id: string, disabled: boolean) => void;
  tabs: Map<number, { id: string; disabled: boolean }>;
  baseId: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error(
      'Tabs compound components must be rendered within a <Tabs> parent. ' +
      'Found a Tabs sub-component rendered outside of its parent.'
    );
  }
  return context;
}

// ─── Root Component ─────────────────────────────────────────────────

type TabsProps = {
  defaultValue?: number;
  value?: number;
  onChange?: (index: number) => void;
  children: ReactNode;
  className?: string;
};

function Tabs({ defaultValue = 0, value, onChange, children, className }: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const baseId = useId();
  const tabsRef = useRef(new Map<number, { id: string; disabled: boolean }>());

  // Support both controlled and uncontrolled modes
  const activeIndex = value !== undefined ? value : internalValue;

  const setActiveIndex = useCallback(
    (index: number) => {
      if (value === undefined) {
        setInternalValue(index);
      }
      onChange?.(index);
    },
    [value, onChange]
  );

  const registerTab = useCallback((index: number, id: string, disabled: boolean) => {
    tabsRef.current.set(index, { id, disabled });
  }, []);

  return (
    <TabsContext.Provider
      value={{
        activeIndex,
        setActiveIndex,
        registerTab,
        tabs: tabsRef.current,
        baseId,
      }}
    >
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

// ─── TabList ────────────────────────────────────────────────────────

type TabListProps = {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
};

const TabList = forwardRef<HTMLDivElement, TabListProps>(
  ({ children, className, 'aria-label': ariaLabel }, ref) => {
    const { activeIndex, setActiveIndex, tabs } = useTabsContext();

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      const tabIndices = Array.from(tabs.keys()).sort((a, b) => a - b);
      const currentPos = tabIndices.indexOf(activeIndex);

      const getNextEnabled = (start: number, direction: 1 | -1): number => {
        let pos = start;
        const len = tabIndices.length;
        for (let i = 0; i < len; i++) {
          pos = (pos + direction + len) % len;
          const tab = tabs.get(tabIndices[pos]);
          if (tab && !tab.disabled) return tabIndices[pos];
        }
        return activeIndex;
      };

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(getNextEnabled(currentPos, 1));
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(getNextEnabled(currentPos, -1));
          break;
        case 'Home':
          e.preventDefault();
          setActiveIndex(getNextEnabled(-1, 1));
          break;
        case 'End':
          e.preventDefault();
          setActiveIndex(getNextEnabled(tabIndices.length, -1));
          break;
      }
    };

    return (
      <div
        ref={ref}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className={cn('flex border-b', className)}
      >
        {children}
      </div>
    );
  }
);
TabList.displayName = 'TabList';

// ─── Tab ────────────────────────────────────────────────────────────

type TabProps = {
  index: number;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

const Tab = forwardRef<HTMLButtonElement, TabProps>(
  ({ index, disabled = false, children, className }, ref) => {
    const { activeIndex, setActiveIndex, registerTab, baseId } = useTabsContext();
    const isActive = activeIndex === index;
    const tabId = `${baseId}-tab-${index}`;
    const panelId = `${baseId}-panel-${index}`;

    useEffect(() => {
      registerTab(index, tabId, disabled);
    }, [index, tabId, disabled, registerTab]);

    const internalRef = useRef<HTMLButtonElement>(null);
    const mergedRef = (ref as React.RefObject<HTMLButtonElement>) || internalRef;

    useEffect(() => {
      if (isActive && mergedRef.current) {
        mergedRef.current.focus();
      }
    }, [isActive, mergedRef]);

    return (
      <button
        ref={mergedRef}
        id={tabId}
        role="tab"
        aria-selected={isActive}
        aria-controls={panelId}
        tabIndex={isActive ? 0 : -1}
        disabled={disabled}
        onClick={() => !disabled && setActiveIndex(index)}
        className={cn(
          'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
          isActive
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        {children}
      </button>
    );
  }
);
Tab.displayName = 'Tab';

// ─── TabPanel ───────────────────────────────────────────────────────

type TabPanelProps = {
  index: number;
  children: ReactNode;
  className?: string;
  /** Keep the panel in the DOM when inactive (for preserving state) */
  keepMounted?: boolean;
};

const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(
  ({ index, children, className, keepMounted = false }, ref) => {
    const { activeIndex, baseId } = useTabsContext();
    const isActive = activeIndex === index;
    const tabId = `${baseId}-tab-${index}`;
    const panelId = `${baseId}-panel-${index}`;

    if (!isActive && !keepMounted) return null;

    return (
      <div
        ref={ref}
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId}
        tabIndex={0}
        hidden={!isActive}
        className={cn('p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
      >
        {children}
      </div>
    );
  }
);
TabPanel.displayName = 'TabPanel';

// ─── Attach sub-components ──────────────────────────────────────────

Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

export { Tabs };
export type { TabsProps, TabListProps, TabProps, TabPanelProps };
```

**Usage:**

```tsx
function TabsDemo() {
  return (
    <Tabs defaultValue={0}>
      <Tabs.List aria-label="Account settings">
        <Tabs.Tab index={0}>Profile</Tabs.Tab>
        <Tabs.Tab index={1}>Security</Tabs.Tab>
        <Tabs.Tab index={2} disabled>Billing</Tabs.Tab>
        <Tabs.Tab index={3}>Notifications</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel index={0}>
        <h3>Profile Settings</h3>
        <p>Update your name, email, and avatar.</p>
      </Tabs.Panel>
      <Tabs.Panel index={1}>
        <h3>Security Settings</h3>
        <p>Change password and enable 2FA.</p>
      </Tabs.Panel>
      <Tabs.Panel index={2}>
        <h3>Billing</h3>
        <p>This tab is disabled.</p>
      </Tabs.Panel>
      <Tabs.Panel index={3}>
        <h3>Notification Preferences</h3>
        <p>Choose which notifications you receive.</p>
      </Tabs.Panel>
    </Tabs>
  );
}
```

## Complete Implementation: Compound Select/Dropdown

Here is a full, production-quality compound Select component with keyboard navigation, accessibility, and TypeScript types.

```tsx
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useId,
  forwardRef,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────

type SelectContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  selectedValue: string | undefined;
  setSelectedValue: (value: string) => void;
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  options: Array<{ value: string; disabled: boolean; label: string }>;
  registerOption: (value: string, label: string, disabled: boolean) => void;
  unregisterOption: (value: string) => void;
  baseId: string;
  triggerRef: React.RefObject<HTMLButtonElement>;
  listRef: React.RefObject<HTMLUListElement>;
};

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const ctx = useContext(SelectContext);
  if (!ctx) {
    throw new Error(
      'Select compound components must be used within a <Select> parent.'
    );
  }
  return ctx;
}

// ─── Root ───────────────────────────────────────────────────────────

type SelectProps = {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
};

function Select({ value, defaultValue, onChange, children, className }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [options, setOptions] = useState<Array<{ value: string; disabled: boolean; label: string }>>([]);
  const baseId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null!);
  const listRef = useRef<HTMLUListElement>(null!);

  const selectedValue = value !== undefined ? value : internalValue;

  const setSelectedValue = useCallback(
    (val: string) => {
      if (value === undefined) {
        setInternalValue(val);
      }
      onChange?.(val);
      setIsOpen(false);
    },
    [value, onChange]
  );

  const registerOption = useCallback((optValue: string, label: string, disabled: boolean) => {
    setOptions((prev) => {
      if (prev.some((o) => o.value === optValue)) {
        return prev.map((o) => (o.value === optValue ? { ...o, label, disabled } : o));
      }
      return [...prev, { value: optValue, disabled, label }];
    });
  }, []);

  const unregisterOption = useCallback((optValue: string) => {
    setOptions((prev) => prev.filter((o) => o.value !== optValue));
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: globalThis.MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        listRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Reset highlight when closed
  useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  return (
    <SelectContext.Provider
      value={{
        isOpen,
        setIsOpen,
        selectedValue,
        setSelectedValue,
        highlightedIndex,
        setHighlightedIndex,
        options,
        registerOption,
        unregisterOption,
        baseId,
        triggerRef,
        listRef,
      }}
    >
      <div className={cn('relative inline-block', className)}>{children}</div>
    </SelectContext.Provider>
  );
}

// ─── Trigger ────────────────────────────────────────────────────────

type SelectTriggerProps = {
  placeholder?: string;
  children?: ReactNode;
  className?: string;
};

const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ placeholder = 'Select...', children, className }, externalRef) => {
    const ctx = useSelectContext();

    const selectedOption = ctx.options.find((o) => o.value === ctx.selectedValue);

    const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
      switch (e.key) {
        case 'Enter':
        case ' ':
        case 'ArrowDown':
          e.preventDefault();
          ctx.setIsOpen(true);
          // Highlight first non-disabled option
          const firstEnabled = ctx.options.findIndex((o) => !o.disabled);
          ctx.setHighlightedIndex(firstEnabled >= 0 ? firstEnabled : 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          ctx.setIsOpen(true);
          // Highlight last non-disabled option
          const lastEnabled = ctx.options.findLastIndex((o) => !o.disabled);
          ctx.setHighlightedIndex(lastEnabled >= 0 ? lastEnabled : ctx.options.length - 1);
          break;
      }
    };

    return (
      <button
        ref={(node) => {
          // Merge refs
          (ctx.triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
          if (typeof externalRef === 'function') externalRef(node);
          else if (externalRef) (externalRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
        }}
        type="button"
        role="combobox"
        aria-expanded={ctx.isOpen}
        aria-haspopup="listbox"
        aria-controls={`${ctx.baseId}-listbox`}
        aria-activedescendant={
          ctx.highlightedIndex >= 0
            ? `${ctx.baseId}-option-${ctx.highlightedIndex}`
            : undefined
        }
        onClick={() => ctx.setIsOpen(!ctx.isOpen)}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2',
          'text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !selectedOption && 'text-muted-foreground',
          className
        )}
      >
        <span className="truncate">
          {children || selectedOption?.label || placeholder}
        </span>
        <svg
          className={cn('ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform', ctx.isOpen && 'rotate-180')}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    );
  }
);
SelectTrigger.displayName = 'SelectTrigger';

// ─── Content ────────────────────────────────────────────────────────

type SelectContentProps = {
  children: ReactNode;
  className?: string;
};

const SelectContent = forwardRef<HTMLUListElement, SelectContentProps>(
  ({ children, className }, externalRef) => {
    const ctx = useSelectContext();

    const handleKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
      const enabledIndices = ctx.options
        .map((o, i) => (!o.disabled ? i : -1))
        .filter((i) => i >= 0);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const current = enabledIndices.indexOf(ctx.highlightedIndex);
          const next = enabledIndices[(current + 1) % enabledIndices.length];
          ctx.setHighlightedIndex(next);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const current = enabledIndices.indexOf(ctx.highlightedIndex);
          const prev = enabledIndices[(current - 1 + enabledIndices.length) % enabledIndices.length];
          ctx.setHighlightedIndex(prev);
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (ctx.highlightedIndex >= 0) {
            const option = ctx.options[ctx.highlightedIndex];
            if (option && !option.disabled) {
              ctx.setSelectedValue(option.value);
              ctx.triggerRef.current?.focus();
            }
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          ctx.setHighlightedIndex(enabledIndices[0] ?? 0);
          break;
        }
        case 'End': {
          e.preventDefault();
          ctx.setHighlightedIndex(enabledIndices[enabledIndices.length - 1] ?? 0);
          break;
        }
        case 'Tab':
          ctx.setIsOpen(false);
          break;
      }
    };

    if (!ctx.isOpen) return null;

    return (
      <ul
        ref={(node) => {
          (ctx.listRef as React.MutableRefObject<HTMLUListElement | null>).current = node;
          if (typeof externalRef === 'function') externalRef(node);
          else if (externalRef) (externalRef as React.MutableRefObject<HTMLUListElement | null>).current = node;
          // Auto-focus the list when it opens
          node?.focus();
        }}
        id={`${ctx.baseId}-listbox`}
        role="listbox"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          'absolute z-50 mt-1 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md',
          'max-h-60 focus-visible:outline-none',
          'animate-in fade-in-0 zoom-in-95',
          className
        )}
      >
        {children}
      </ul>
    );
  }
);
SelectContent.displayName = 'SelectContent';

// ─── Item ───────────────────────────────────────────────────────────

type SelectItemProps = {
  value: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

const SelectItem = forwardRef<HTMLLIElement, SelectItemProps>(
  ({ value, disabled = false, children, className }, ref) => {
    const ctx = useSelectContext();

    const index = ctx.options.findIndex((o) => o.value === value);
    const isSelected = ctx.selectedValue === value;
    const isHighlighted = ctx.highlightedIndex === index;

    // Derive label from children for display in trigger
    const label = typeof children === 'string' ? children : value;

    useEffect(() => {
      ctx.registerOption(value, label, disabled);
      return () => ctx.unregisterOption(value);
    }, [value, label, disabled, ctx.registerOption, ctx.unregisterOption]);

    const handleClick = (e: MouseEvent<HTMLLIElement>) => {
      e.preventDefault();
      if (!disabled) {
        ctx.setSelectedValue(value);
        ctx.triggerRef.current?.focus();
      }
    };

    const handleMouseEnter = () => {
      if (!disabled) {
        ctx.setHighlightedIndex(index);
      }
    };

    return (
      <li
        ref={ref}
        id={`${ctx.baseId}-option-${index}`}
        role="option"
        aria-selected={isSelected}
        aria-disabled={disabled || undefined}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        className={cn(
          'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
          isHighlighted && 'bg-accent text-accent-foreground',
          isSelected && 'font-medium',
          disabled && 'pointer-events-none opacity-50',
          className
        )}
      >
        <span className="flex-1">{children}</span>
        {isSelected && (
          <svg
            className="ml-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </li>
    );
  }
);
SelectItem.displayName = 'SelectItem';

// ─── Separator ──────────────────────────────────────────────────────

function SelectSeparator({ className }: { className?: string }) {
  return (
    <li
      role="separator"
      className={cn('my-1 h-px bg-muted', className)}
      aria-hidden="true"
    />
  );
}

// ─── Group ──────────────────────────────────────────────────────────

type SelectGroupProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

function SelectGroup({ label, children, className }: SelectGroupProps) {
  const groupId = useId();
  return (
    <li role="presentation" className={className}>
      <div
        id={groupId}
        className="px-2 py-1.5 text-xs font-semibold text-muted-foreground"
        role="presentation"
      >
        {label}
      </div>
      <ul role="group" aria-labelledby={groupId} className="space-y-0.5">
        {children}
      </ul>
    </li>
  );
}

// ─── Attach Sub-Components ──────────────────────────────────────────

Select.Trigger = SelectTrigger;
Select.Content = SelectContent;
Select.Item = SelectItem;
Select.Separator = SelectSeparator;
Select.Group = SelectGroup;

export { Select };
export type {
  SelectProps,
  SelectTriggerProps,
  SelectContentProps,
  SelectItemProps,
  SelectGroupProps,
};
```

**Usage with groups and separators:**

```tsx
function SelectDemo() {
  const [value, setValue] = useState<string>();

  return (
    <div className="w-64">
      <Select value={value} onChange={setValue}>
        <Select.Trigger placeholder="Choose a framework..." />
        <Select.Content>
          <Select.Group label="Frontend">
            <Select.Item value="react">React</Select.Item>
            <Select.Item value="vue">Vue</Select.Item>
            <Select.Item value="svelte">Svelte</Select.Item>
            <Select.Item value="angular" disabled>Angular (deprecated)</Select.Item>
          </Select.Group>
          <Select.Separator />
          <Select.Group label="Backend">
            <Select.Item value="express">Express</Select.Item>
            <Select.Item value="fastify">Fastify</Select.Item>
            <Select.Item value="hono">Hono</Select.Item>
          </Select.Group>
        </Select.Content>
      </Select>

      <p className="mt-4 text-sm text-muted-foreground">
        Selected: {value || 'none'}
      </p>
    </div>
  );
}
```

## TypeScript Patterns for Compound Components

### Typing the Compound Object

The standard TypeScript pattern for attaching sub-components to a parent component:

```tsx
import { type FC } from 'react';

// Define each sub-component's types
type SelectComponent = FC<SelectProps> & {
  Trigger: typeof SelectTrigger;
  Content: typeof SelectContent;
  Item: typeof SelectItem;
  Separator: typeof SelectSeparator;
  Group: typeof SelectGroup;
};

// Cast the parent component
const Select = (({ value, defaultValue, onChange, children, className }) => {
  // ... implementation
}) as SelectComponent;

// Attach sub-components (TypeScript now knows about these)
Select.Trigger = SelectTrigger;
Select.Content = SelectContent;
Select.Item = SelectItem;
Select.Separator = SelectSeparator;
Select.Group = SelectGroup;
```

### Generic Compound Components

When the compound component needs to work with generic data (like a generic `<Listbox>` that works with any value type):

```tsx
import { createContext, useContext, type ReactNode } from 'react';

// ─── Generic Context ────────────────────────────────────────────────

type ListboxContextValue<T> = {
  selectedValue: T | undefined;
  onChange: (value: T) => void;
  compare: (a: T, b: T) => boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ListboxContext = createContext<ListboxContextValue<any> | null>(null);

function useListboxContext<T>() {
  const ctx = useContext(ListboxContext) as ListboxContextValue<T> | null;
  if (!ctx) throw new Error('Listbox components must be used within <Listbox>');
  return ctx;
}

// ─── Generic Root ───────────────────────────────────────────────────

type ListboxProps<T> = {
  value?: T;
  onChange: (value: T) => void;
  compare?: (a: T, b: T) => boolean;
  children: ReactNode;
};

function Listbox<T>({
  value,
  onChange,
  compare = (a, b) => a === b,
  children,
}: ListboxProps<T>) {
  return (
    <ListboxContext.Provider value={{ selectedValue: value, onChange, compare }}>
      <div role="listbox">{children}</div>
    </ListboxContext.Provider>
  );
}

// ─── Generic Option ─────────────────────────────────────────────────

type ListboxOptionProps<T> = {
  value: T;
  disabled?: boolean;
  children: ReactNode | ((props: { selected: boolean; disabled: boolean }) => ReactNode);
};

function ListboxOption<T>({ value, disabled = false, children }: ListboxOptionProps<T>) {
  const ctx = useListboxContext<T>();
  const selected = ctx.selectedValue !== undefined && ctx.compare(ctx.selectedValue, value);

  return (
    <div
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && ctx.onChange(value)}
      className={cn(
        'cursor-pointer px-3 py-2 text-sm',
        selected && 'bg-primary text-primary-foreground',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {typeof children === 'function' ? children({ selected, disabled }) : children}
    </div>
  );
}

// ─── Usage with complex objects ─────────────────────────────────────

type User = { id: string; name: string; email: string };

function UserListbox() {
  const [selected, setSelected] = useState<User>();

  return (
    <Listbox<User>
      value={selected}
      onChange={setSelected}
      compare={(a, b) => a.id === b.id}
    >
      <ListboxOption value={{ id: '1', name: 'Alice', email: 'alice@example.com' }}>
        {({ selected }) => (
          <div className="flex items-center gap-2">
            <span>{selected ? '\u2713' : ' '}</span>
            <span>Alice</span>
          </div>
        )}
      </ListboxOption>
      <ListboxOption value={{ id: '2', name: 'Bob', email: 'bob@example.com' }}>
        {({ selected }) => (
          <div className="flex items-center gap-2">
            <span>{selected ? '\u2713' : ' '}</span>
            <span>Bob</span>
          </div>
        )}
      </ListboxOption>
    </Listbox>
  );
}
```

## Flexible API Design Principles

### 1. Sensible Defaults, Full Override

Every compound component should work with minimal props while allowing full customization:

```tsx
// Minimal usage — everything has defaults
<Select value={value} onChange={setValue}>
  <Select.Trigger />
  <Select.Content>
    <Select.Item value="a">Alpha</Select.Item>
    <Select.Item value="b">Beta</Select.Item>
  </Select.Content>
</Select>

// Fully customized — every part is overridden
<Select value={value} onChange={setValue}>
  <Select.Trigger className="custom-trigger" placeholder="Pick one">
    <CustomSelectedDisplay value={value} />
  </Select.Trigger>
  <Select.Content className="custom-popover">
    <Select.Group label="Letters">
      <Select.Item value="a" className="custom-item">
        <LetterIcon letter="A" />
        <span>Alpha</span>
        <Badge>New</Badge>
      </Select.Item>
    </Select.Group>
  </Select.Content>
</Select>
```

### 2. Meaningful Error Messages

When a sub-component is used outside its parent, throw a clear error:

```tsx
function useSelectContext() {
  const ctx = useContext(SelectContext);
  if (!ctx) {
    throw new Error(
      'Select.Item must be used within a <Select> component. ' +
      'Example:\n' +
      '  <Select>\n' +
      '    <Select.Content>\n' +
      '      <Select.Item value="...">...</Select.Item>\n' +
      '    </Select.Content>\n' +
      '  </Select>'
    );
  }
  return ctx;
}
```

### 3. Ref Forwarding on Every Part

Every sub-component should forward refs. Consumers need refs for focus management, positioning, measuring, and integration with third-party libraries:

```tsx
const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  (props, ref) => {
    // ... implementation
    return <button ref={ref} {...buttonProps} />;
  }
);
```

### 4. Data Attributes for Styling

Expose component state through data attributes so consumers can style based on state without JavaScript:

```tsx
<button
  data-state={isOpen ? 'open' : 'closed'}
  data-highlighted={isHighlighted || undefined}
  data-disabled={disabled || undefined}
  // CSS: [data-state="open"] { background: var(--accent); }
>
```

This is the approach Radix UI uses, and it is more powerful than className toggling because CSS selectors can query data attributes across the tree.

## Real-World Compound Component: Accordion

A complete Accordion implementation demonstrating all the principles:

```tsx
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useId,
  forwardRef,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { cn } from '@/lib/utils';

// ─── Context ────────────────────────────────────────────────────────

type AccordionContextValue = {
  expandedItems: Set<string>;
  toggleItem: (value: string) => void;
  type: 'single' | 'multiple';
};

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordionContext() {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error('Accordion components must be used within <Accordion>');
  return ctx;
}

type AccordionItemContextValue = {
  value: string;
  isOpen: boolean;
  triggerId: string;
  contentId: string;
  disabled: boolean;
};

const AccordionItemContext = createContext<AccordionItemContextValue | null>(null);

function useAccordionItemContext() {
  const ctx = useContext(AccordionItemContext);
  if (!ctx) throw new Error('AccordionTrigger/Content must be used within <Accordion.Item>');
  return ctx;
}

// ─── Root ───────────────────────────────────────────────────────────

type AccordionProps = {
  type?: 'single' | 'multiple';
  defaultExpanded?: string[];
  children: ReactNode;
  className?: string;
};

function Accordion({
  type = 'single',
  defaultExpanded = [],
  children,
  className,
}: AccordionProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    new Set(defaultExpanded)
  );

  const toggleItem = useCallback(
    (value: string) => {
      setExpandedItems((prev) => {
        const next = new Set(prev);
        if (next.has(value)) {
          next.delete(value);
        } else {
          if (type === 'single') {
            next.clear();
          }
          next.add(value);
        }
        return next;
      });
    },
    [type]
  );

  return (
    <AccordionContext.Provider value={{ expandedItems, toggleItem, type }}>
      <div className={cn('divide-y rounded-md border', className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

// ─── Item ───────────────────────────────────────────────────────────

type AccordionItemProps = {
  value: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ value, disabled = false, children, className }, ref) => {
    const { expandedItems } = useAccordionContext();
    const baseId = useId();
    const isOpen = expandedItems.has(value);
    const triggerId = `${baseId}-trigger`;
    const contentId = `${baseId}-content`;

    return (
      <AccordionItemContext.Provider value={{ value, isOpen, triggerId, contentId, disabled }}>
        <div
          ref={ref}
          data-state={isOpen ? 'open' : 'closed'}
          data-disabled={disabled || undefined}
          className={cn('px-0', className)}
        >
          {children}
        </div>
      </AccordionItemContext.Provider>
    );
  }
);
AccordionItem.displayName = 'AccordionItem';

// ─── Trigger ────────────────────────────────────────────────────────

type AccordionTriggerProps = {
  children: ReactNode;
  className?: string;
};

const AccordionTrigger = forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ children, className }, ref) => {
    const { toggleItem } = useAccordionContext();
    const { value, isOpen, triggerId, contentId, disabled } = useAccordionItemContext();

    return (
      <h3 className="flex">
        <button
          ref={ref}
          id={triggerId}
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          disabled={disabled}
          onClick={() => toggleItem(value)}
          className={cn(
            'flex flex-1 items-center justify-between py-4 px-4 text-sm font-medium transition-all',
            'hover:underline [&[data-state=open]>svg]:rotate-180',
            disabled && 'cursor-not-allowed opacity-50',
            className
          )}
          data-state={isOpen ? 'open' : 'closed'}
        >
          {children}
          <svg
            className="h-4 w-4 shrink-0 transition-transform duration-200"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>
    );
  }
);
AccordionTrigger.displayName = 'AccordionTrigger';

// ─── Content ────────────────────────────────────────────────────────

type AccordionContentProps = {
  children: ReactNode;
  className?: string;
};

const AccordionContent = forwardRef<HTMLDivElement, AccordionContentProps>(
  ({ children, className }, ref) => {
    const { isOpen, triggerId, contentId } = useAccordionItemContext();
    const contentRef = useRef<HTMLDivElement>(null);

    return (
      <div
        ref={ref}
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!isOpen}
        data-state={isOpen ? 'open' : 'closed'}
        className={cn(
          'overflow-hidden text-sm transition-all',
          isOpen ? 'animate-accordion-down' : 'animate-accordion-up',
          className
        )}
      >
        <div ref={contentRef} className="pb-4 px-4 pt-0">
          {children}
        </div>
      </div>
    );
  }
);
AccordionContent.displayName = 'AccordionContent';

// ─── Attach Sub-Components ──────────────────────────────────────────

Accordion.Item = AccordionItem;
Accordion.Trigger = AccordionTrigger;
Accordion.Content = AccordionContent;

export { Accordion };
export type { AccordionProps, AccordionItemProps, AccordionTriggerProps, AccordionContentProps };
```

**Usage:**

```tsx
function AccordionDemo() {
  return (
    <Accordion type="single" defaultExpanded={['item-1']}>
      <Accordion.Item value="item-1">
        <Accordion.Trigger>What is a compound component?</Accordion.Trigger>
        <Accordion.Content>
          A compound component is a set of components that work together through shared
          implicit state to form a complete UI element.
        </Accordion.Content>
      </Accordion.Item>

      <Accordion.Item value="item-2">
        <Accordion.Trigger>When should I use this pattern?</Accordion.Trigger>
        <Accordion.Content>
          Use compound components when you have a multi-part UI element where the
          consumer needs control over the rendering and ordering of parts.
        </Accordion.Content>
      </Accordion.Item>

      <Accordion.Item value="item-3" disabled>
        <Accordion.Trigger>Can I disable an item?</Accordion.Trigger>
        <Accordion.Content>
          Yes, this item is disabled.
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}
```

## Testing Compound Components

Testing compound components requires testing the collaboration between parts, not just individual elements:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

describe('Select', () => {
  it('shows placeholder when no value is selected', () => {
    render(
      <Select>
        <Select.Trigger placeholder="Choose..." />
        <Select.Content>
          <Select.Item value="a">Alpha</Select.Item>
        </Select.Content>
      </Select>
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose...');
  });

  it('opens dropdown on click and selects an item', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Select onChange={onChange}>
        <Select.Trigger />
        <Select.Content>
          <Select.Item value="a">Alpha</Select.Item>
          <Select.Item value="b">Beta</Select.Item>
        </Select.Content>
      </Select>
    );

    // Open the dropdown
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeVisible();

    // Select an option
    await user.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Select onChange={onChange}>
        <Select.Trigger />
        <Select.Content>
          <Select.Item value="a">Alpha</Select.Item>
          <Select.Item value="b" disabled>Beta</Select.Item>
          <Select.Item value="c">Gamma</Select.Item>
        </Select.Content>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}'); // Skips disabled "Beta"
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('closes on Escape and restores focus to trigger', async () => {
    const user = userEvent.setup();

    render(
      <Select>
        <Select.Trigger />
        <Select.Content>
          <Select.Item value="a">Alpha</Select.Item>
        </Select.Content>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('throws when sub-component is used outside parent', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<Select.Item value="a">Alpha</Select.Item>);
    }).toThrow('Select compound components must be used within a <Select> parent');

    spy.mockRestore();
  });
});
```

## Further Reading

- **Radix UI source code:** The gold standard for compound components with accessibility
- **Kent C. Dodds:** "Compound Components" pattern explanation
- **Next:** [Render Props & Hooks](./render-props-hooks) — the evolution from render props to hooks for logic sharing
- **Related:** [Headless Components](./headless-components) — when you want compound components without any UI opinions
