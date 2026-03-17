---
title: "Headless Components"
description: "Separating component logic from UI — building headless components with custom hooks, the architecture behind Radix UI, Headless UI, and React Aria, with a complete headless Combobox implementation"
tags: [headless-components, headless-ui, react-aria, radix-ui, design-systems, accessibility, hooks]
difficulty: advanced
prerequisites: [react, typescript, custom-hooks, accessibility-basics]
lastReviewed: "2026-03-17"
---

# Headless Components

A headless component encapsulates behavior, state management, and accessibility — everything except the visual presentation. It provides the logic layer (keyboard navigation, focus management, ARIA attributes, state machines) and lets the consumer provide 100% of the markup and styling. This is the architecture behind the most flexible component libraries in the React ecosystem.

## Why Headless?

### The Design System Adoption Problem

Traditional component libraries couple behavior to presentation. When a library's `Select` component does not match your design, you have three bad options:

1. **Override styles** — fight CSS specificity wars with `!important` and deep selectors
2. **Fork the component** — copy-paste the source and modify it, losing future updates
3. **Build from scratch** — reimplement keyboard navigation, focus management, and ARIA from zero

Headless components eliminate this problem entirely. The library handles the hard parts (accessibility, keyboard navigation, state machines), and you handle the easy part (how it looks).

### The Separation

```
Traditional component:
┌──────────────────────────────────┐
│  Behavior (state, events, ARIA)  │
│  + Presentation (markup, styles) │
│  = Tightly Coupled               │
└──────────────────────────────────┘

Headless component:
┌──────────────────────────────────┐
│  Behavior (state, events, ARIA)  │  ← Library provides
├──────────────────────────────────┤
│  Presentation (markup, styles)   │  ← You provide
└──────────────────────────────────┘
```

## Headless Libraries in Production

### Radix Primitives

Radix provides unstyled, accessible components as compound components:

```tsx
import * as Dialog from '@radix-ui/react-dialog';

// Radix provides behavior and accessibility.
// You provide all the styles.
function CustomDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="my-trigger-styles">
        Open Dialog
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="my-overlay-styles" />
        <Dialog.Content className="my-content-styles">
          <Dialog.Title className="my-title-styles">
            Dialog Title
          </Dialog.Title>
          <Dialog.Description className="my-description-styles">
            Dialog description text.
          </Dialog.Description>
          <Dialog.Close className="my-close-styles">
            Close
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

**What Radix handles for you:**
- Focus trapping inside the dialog
- Return focus to trigger on close
- Escape key to close
- Click outside overlay to close
- `aria-modal`, `aria-labelledby`, `aria-describedby` attributes
- Portal rendering to avoid z-index issues
- Scroll locking on the body
- Animation support with `data-state` attributes

### Headless UI (Tailwind Labs)

Similar approach, designed to pair with Tailwind CSS:

```tsx
import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState } from 'react';

function MyDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open</button>
      <Transition show={isOpen} as={Fragment}>
        <Dialog onClose={setIsOpen} className="relative z-50">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          </Transition.Child>

          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="w-full max-w-md rounded-xl bg-white p-6">
              <Dialog.Title className="text-lg font-medium">
                Deactivate account
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-gray-500">
                This will permanently deactivate your account.
              </Dialog.Description>
              <div className="mt-4 flex gap-3">
                <button onClick={() => setIsOpen(false)}>Cancel</button>
                <button onClick={() => setIsOpen(false)}>Deactivate</button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
```

### React Aria (Adobe)

The most granular approach — provides hooks rather than components:

```tsx
import { useComboBox } from 'react-aria';
import { useComboBoxState } from 'react-stately';
import { useFilter } from 'react-aria';

function ComboBox(props) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const state = useComboBoxState({ ...props, defaultFilter: contains });

  const inputRef = useRef(null);
  const listBoxRef = useRef(null);
  const popoverRef = useRef(null);

  const {
    inputProps,
    listBoxProps,
    labelProps,
  } = useComboBox(
    { ...props, inputRef, listBoxRef, popoverRef },
    state
  );

  // You build ALL the markup. React Aria only provides prop getters.
  return (
    <div>
      <label {...labelProps}>{props.label}</label>
      <input {...inputProps} ref={inputRef} />
      {state.isOpen && (
        <div ref={popoverRef}>
          <ListBox {...listBoxProps} ref={listBoxRef} state={state} />
        </div>
      )}
    </div>
  );
}
```

## Building Headless Components with Custom Hooks

The most flexible headless pattern uses hooks that return prop getters — functions that generate the correct props for each element.

### Pattern: Prop Getters

```tsx
// A prop getter is a function that returns props to spread onto an element.
// It merges the component's required props with any user-provided props.

type PropGetter<E extends HTMLElement = HTMLElement> = (
  userProps?: React.HTMLAttributes<E>
) => React.HTMLAttributes<E>;

function mergeProps<E extends HTMLElement>(
  ...propsList: Array<React.HTMLAttributes<E> | undefined>
): React.HTMLAttributes<E> {
  const merged: Record<string, unknown> = {};

  for (const props of propsList) {
    if (!props) continue;

    for (const [key, value] of Object.entries(props)) {
      if (/^on[A-Z]/.test(key) && typeof value === 'function') {
        // Compose event handlers
        const existing = merged[key] as ((...args: unknown[]) => void) | undefined;
        if (existing) {
          merged[key] = (...args: unknown[]) => {
            existing(...args);
            (value as Function)(...args);
          };
        } else {
          merged[key] = value;
        }
      } else if (key === 'className') {
        // Concatenate classNames
        merged[key] = [merged[key], value].filter(Boolean).join(' ');
      } else if (key === 'style') {
        // Merge style objects
        merged[key] = { ...(merged[key] as object), ...(value as object) };
      } else {
        // Last value wins
        merged[key] = value;
      }
    }
  }

  return merged as React.HTMLAttributes<E>;
}
```

### Headless Toggle Hook

```tsx
type UseToggleProps = {
  defaultPressed?: boolean;
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  disabled?: boolean;
};

type UseToggleReturn = {
  isPressed: boolean;
  toggle: () => void;
  getToggleProps: PropGetter<HTMLButtonElement>;
};

function useToggle({
  defaultPressed = false,
  pressed: controlledPressed,
  onPressedChange,
  disabled = false,
}: UseToggleProps = {}): UseToggleReturn {
  const [internalPressed, setInternalPressed] = useState(defaultPressed);

  const isPressed = controlledPressed !== undefined ? controlledPressed : internalPressed;

  const toggle = useCallback(() => {
    if (disabled) return;
    const next = !isPressed;
    if (controlledPressed === undefined) {
      setInternalPressed(next);
    }
    onPressedChange?.(next);
  }, [isPressed, disabled, controlledPressed, onPressedChange]);

  const getToggleProps: PropGetter<HTMLButtonElement> = useCallback(
    (userProps = {}) =>
      mergeProps(
        {
          role: 'switch',
          'aria-checked': isPressed,
          'aria-disabled': disabled || undefined,
          tabIndex: disabled ? -1 : 0,
          onClick: toggle,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              toggle();
            }
          },
          'data-state': isPressed ? 'on' : 'off',
          'data-disabled': disabled ? '' : undefined,
        } as React.HTMLAttributes<HTMLButtonElement>,
        userProps
      ),
    [isPressed, disabled, toggle]
  );

  return { isPressed, toggle, getToggleProps };
}

// ─── Usage: the consumer provides ALL the UI ────────────────────────

function CustomToggle() {
  const { isPressed, getToggleProps } = useToggle({
    onPressedChange: (pressed) => console.log('Toggled:', pressed),
  });

  return (
    <button
      {...getToggleProps({
        className: `w-12 h-6 rounded-full transition-colors ${
          isPressed ? 'bg-green-500' : 'bg-gray-300'
        }`,
      })}
    >
      <span
        className={`block w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
          isPressed ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// Different consumer, completely different UI, same behavior:
function ToggleButton() {
  const { isPressed, getToggleProps } = useToggle();

  return (
    <button
      {...getToggleProps({
        className: `px-4 py-2 rounded ${
          isPressed ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
        }`,
      })}
    >
      {isPressed ? 'Active' : 'Inactive'}
    </button>
  );
}
```

## Complete Headless Combobox Implementation

A full-featured, accessible, headless Combobox (autocomplete/typeahead) with keyboard navigation, filtering, and ARIA compliance.

```tsx
import {
  useState,
  useCallback,
  useRef,
  useId,
  useMemo,
  useEffect,
  type KeyboardEvent,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LiHTMLAttributes,
} from 'react';

// ─── Types ──────────────────────────────────────────────────────────

type ComboboxItem<T = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type UseComboboxProps<T = string> = {
  /** All available items */
  items: ComboboxItem<T>[];
  /** Controlled selected value */
  selectedValue?: T;
  /** Default selected value (uncontrolled) */
  defaultSelectedValue?: T;
  /** Called when selection changes */
  onSelectedValueChange?: (value: T | undefined) => void;
  /** Controlled input value */
  inputValue?: string;
  /** Called when input value changes */
  onInputValueChange?: (value: string) => void;
  /** Custom filter function */
  filter?: (item: ComboboxItem<T>, inputValue: string) => boolean;
  /** Whether the combobox is open */
  isOpen?: boolean;
  /** Default open state */
  defaultIsOpen?: boolean;
  /** Called when open state changes */
  onIsOpenChange?: (isOpen: boolean) => void;
  /** Allow custom values not in the list */
  allowCustomValue?: boolean;
  /** Comparison function for values */
  isEqual?: (a: T, b: T) => boolean;
};

type UseComboboxReturn<T = string> = {
  // State
  isOpen: boolean;
  inputValue: string;
  selectedValue: T | undefined;
  highlightedIndex: number;
  filteredItems: ComboboxItem<T>[];

  // Actions
  openMenu: () => void;
  closeMenu: () => void;
  setInputValue: (value: string) => void;
  selectItem: (item: ComboboxItem<T>) => void;
  highlightItem: (index: number) => void;
  reset: () => void;

  // Prop getters
  getLabelProps: (props?: HTMLAttributes<HTMLLabelElement>) => HTMLAttributes<HTMLLabelElement>;
  getInputProps: (props?: InputHTMLAttributes<HTMLInputElement>) => InputHTMLAttributes<HTMLInputElement>;
  getMenuProps: (props?: HTMLAttributes<HTMLUListElement>) => HTMLAttributes<HTMLUListElement>;
  getItemProps: (
    item: ComboboxItem<T>,
    index: number,
    props?: LiHTMLAttributes<HTMLLIElement>
  ) => LiHTMLAttributes<HTMLLIElement>;
  getToggleButtonProps: (props?: HTMLAttributes<HTMLButtonElement>) => HTMLAttributes<HTMLButtonElement>;
  getClearButtonProps: (props?: HTMLAttributes<HTMLButtonElement>) => HTMLAttributes<HTMLButtonElement>;
};

// ─── Hook Implementation ────────────────────────────────────────────

function useCombobox<T = string>({
  items,
  selectedValue: controlledSelectedValue,
  defaultSelectedValue,
  onSelectedValueChange,
  inputValue: controlledInputValue,
  onInputValueChange,
  filter: customFilter,
  isOpen: controlledIsOpen,
  defaultIsOpen = false,
  onIsOpenChange,
  allowCustomValue = false,
  isEqual = (a, b) => a === b,
}: UseComboboxProps<T>): UseComboboxReturn<T> {
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  // ─── State management (controlled/uncontrolled) ─────────────────

  const [internalSelectedValue, setInternalSelectedValue] = useState<T | undefined>(
    defaultSelectedValue
  );
  const selectedValue =
    controlledSelectedValue !== undefined ? controlledSelectedValue : internalSelectedValue;

  const selectedItem = items.find(
    (item) => selectedValue !== undefined && isEqual(item.value, selectedValue)
  );

  const [internalInputValue, setInternalInputValue] = useState(
    selectedItem?.label ?? ''
  );
  const inputValue =
    controlledInputValue !== undefined ? controlledInputValue : internalInputValue;

  const [internalIsOpen, setInternalIsOpen] = useState(defaultIsOpen);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // ─── Filtering ──────────────────────────────────────────────────

  const defaultFilter = useCallback(
    (item: ComboboxItem<T>, query: string): boolean => {
      if (!query) return true;
      return item.label.toLowerCase().includes(query.toLowerCase());
    },
    []
  );

  const filter = customFilter ?? defaultFilter;

  const filteredItems = useMemo(
    () => items.filter((item) => filter(item, inputValue)),
    [items, filter, inputValue]
  );

  // ─── Actions ────────────────────────────────────────────────────

  const setIsOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledIsOpen === undefined) {
        setInternalIsOpen(nextOpen);
      }
      onIsOpenChange?.(nextOpen);
    },
    [controlledIsOpen, onIsOpenChange]
  );

  const setInputValueAction = useCallback(
    (value: string) => {
      if (controlledInputValue === undefined) {
        setInternalInputValue(value);
      }
      onInputValueChange?.(value);
    },
    [controlledInputValue, onInputValueChange]
  );

  const openMenu = useCallback(() => {
    setIsOpen(true);
    setHighlightedIndex(-1);
  }, [setIsOpen]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, [setIsOpen]);

  const selectItem = useCallback(
    (item: ComboboxItem<T>) => {
      if (item.disabled) return;

      if (controlledSelectedValue === undefined) {
        setInternalSelectedValue(item.value);
      }
      onSelectedValueChange?.(item.value);
      setInputValueAction(item.label);
      closeMenu();
      inputRef.current?.focus();
    },
    [controlledSelectedValue, onSelectedValueChange, setInputValueAction, closeMenu]
  );

  const highlightItem = useCallback((index: number) => {
    setHighlightedIndex(index);
  }, []);

  const reset = useCallback(() => {
    if (controlledSelectedValue === undefined) {
      setInternalSelectedValue(undefined);
    }
    onSelectedValueChange?.(undefined);
    setInputValueAction('');
    closeMenu();
  }, [controlledSelectedValue, onSelectedValueChange, setInputValueAction, closeMenu]);

  // ─── Close on outside click ─────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (
        inputRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }

      // If input value doesn't match a valid item, revert to selected item's label
      if (!allowCustomValue && selectedItem) {
        setInputValueAction(selectedItem.label);
      }
      closeMenu();
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, allowCustomValue, selectedItem, setInputValueAction, closeMenu]);

  // ─── Prop getters ───────────────────────────────────────────────

  const getLabelProps = useCallback(
    (userProps: HTMLAttributes<HTMLLabelElement> = {}): HTMLAttributes<HTMLLabelElement> =>
      mergeProps(
        {
          id: `${baseId}-label`,
          htmlFor: `${baseId}-input`,
        } as HTMLAttributes<HTMLLabelElement>,
        userProps
      ),
    [baseId]
  );

  const getInputProps = useCallback(
    (
      userProps: InputHTMLAttributes<HTMLInputElement> = {}
    ): InputHTMLAttributes<HTMLInputElement> =>
      mergeProps(
        {
          id: `${baseId}-input`,
          role: 'combobox',
          'aria-expanded': isOpen,
          'aria-haspopup': 'listbox' as const,
          'aria-controls': `${baseId}-listbox`,
          'aria-labelledby': `${baseId}-label`,
          'aria-autocomplete': 'list' as const,
          'aria-activedescendant':
            highlightedIndex >= 0
              ? `${baseId}-option-${highlightedIndex}`
              : undefined,
          autoComplete: 'off',
          value: inputValue,
          ref: inputRef,

          onChange: (e: ChangeEvent<HTMLInputElement>) => {
            setInputValueAction(e.target.value);
            if (!isOpen) openMenu();
            setHighlightedIndex(0);
          },

          onFocus: () => {
            if (!isOpen && inputValue) {
              openMenu();
            }
          },

          onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
            const enabledItems = filteredItems
              .map((item, idx) => (!item.disabled ? idx : -1))
              .filter((idx) => idx >= 0);

            switch (e.key) {
              case 'ArrowDown': {
                e.preventDefault();
                if (!isOpen) {
                  openMenu();
                  setHighlightedIndex(enabledItems[0] ?? 0);
                  return;
                }
                const currentDown = enabledItems.indexOf(highlightedIndex);
                const nextDown = enabledItems[(currentDown + 1) % enabledItems.length];
                setHighlightedIndex(nextDown ?? 0);
                break;
              }
              case 'ArrowUp': {
                e.preventDefault();
                if (!isOpen) {
                  openMenu();
                  setHighlightedIndex(enabledItems[enabledItems.length - 1] ?? 0);
                  return;
                }
                const currentUp = enabledItems.indexOf(highlightedIndex);
                const nextUp =
                  enabledItems[(currentUp - 1 + enabledItems.length) % enabledItems.length];
                setHighlightedIndex(nextUp ?? 0);
                break;
              }
              case 'Enter': {
                e.preventDefault();
                if (isOpen && highlightedIndex >= 0 && filteredItems[highlightedIndex]) {
                  selectItem(filteredItems[highlightedIndex]);
                }
                break;
              }
              case 'Escape': {
                e.preventDefault();
                if (isOpen) {
                  closeMenu();
                  if (selectedItem) {
                    setInputValueAction(selectedItem.label);
                  }
                } else {
                  reset();
                }
                break;
              }
              case 'Home': {
                if (isOpen) {
                  e.preventDefault();
                  setHighlightedIndex(enabledItems[0] ?? 0);
                }
                break;
              }
              case 'End': {
                if (isOpen) {
                  e.preventDefault();
                  setHighlightedIndex(enabledItems[enabledItems.length - 1] ?? 0);
                }
                break;
              }
            }
          },
        } as InputHTMLAttributes<HTMLInputElement>,
        userProps
      ),
    [
      baseId, isOpen, inputValue, highlightedIndex, filteredItems,
      setInputValueAction, openMenu, closeMenu, selectItem, selectedItem, reset,
    ]
  );

  const getMenuProps = useCallback(
    (userProps: HTMLAttributes<HTMLUListElement> = {}): HTMLAttributes<HTMLUListElement> =>
      mergeProps(
        {
          id: `${baseId}-listbox`,
          role: 'listbox',
          'aria-labelledby': `${baseId}-label`,
          ref: menuRef,
          tabIndex: -1,
        } as HTMLAttributes<HTMLUListElement>,
        userProps
      ),
    [baseId]
  );

  const getItemProps = useCallback(
    (
      item: ComboboxItem<T>,
      index: number,
      userProps: LiHTMLAttributes<HTMLLIElement> = {}
    ): LiHTMLAttributes<HTMLLIElement> => {
      const isSelected = selectedValue !== undefined && isEqual(item.value, selectedValue);
      const isHighlighted = highlightedIndex === index;

      return mergeProps(
        {
          id: `${baseId}-option-${index}`,
          role: 'option',
          'aria-selected': isSelected,
          'aria-disabled': item.disabled || undefined,
          'data-highlighted': isHighlighted ? '' : undefined,
          'data-selected': isSelected ? '' : undefined,
          'data-disabled': item.disabled ? '' : undefined,

          onClick: () => {
            if (!item.disabled) selectItem(item);
          },

          onMouseEnter: () => {
            if (!item.disabled) setHighlightedIndex(index);
          },

          onMouseLeave: () => {
            setHighlightedIndex(-1);
          },
        } as LiHTMLAttributes<HTMLLIElement>,
        userProps
      );
    },
    [baseId, selectedValue, highlightedIndex, isEqual, selectItem]
  );

  const getToggleButtonProps = useCallback(
    (userProps: HTMLAttributes<HTMLButtonElement> = {}): HTMLAttributes<HTMLButtonElement> =>
      mergeProps(
        {
          'aria-label': isOpen ? 'Close menu' : 'Open menu',
          'aria-expanded': isOpen,
          tabIndex: -1,
          onClick: () => {
            if (isOpen) closeMenu();
            else openMenu();
            inputRef.current?.focus();
          },
        } as HTMLAttributes<HTMLButtonElement>,
        userProps
      ),
    [isOpen, openMenu, closeMenu]
  );

  const getClearButtonProps = useCallback(
    (userProps: HTMLAttributes<HTMLButtonElement> = {}): HTMLAttributes<HTMLButtonElement> =>
      mergeProps(
        {
          'aria-label': 'Clear selection',
          tabIndex: -1,
          onClick: () => {
            reset();
            inputRef.current?.focus();
          },
        } as HTMLAttributes<HTMLButtonElement>,
        userProps
      ),
    [reset]
  );

  // ─── Scroll highlighted item into view ──────────────────────────

  useEffect(() => {
    if (highlightedIndex < 0 || !isOpen) return;

    const option = document.getElementById(`${baseId}-option-${highlightedIndex}`);
    option?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen, baseId]);

  return {
    // State
    isOpen,
    inputValue,
    selectedValue,
    highlightedIndex,
    filteredItems,

    // Actions
    openMenu,
    closeMenu,
    setInputValue: setInputValueAction,
    selectItem,
    highlightItem,
    reset,

    // Prop getters
    getLabelProps,
    getInputProps,
    getMenuProps,
    getItemProps,
    getToggleButtonProps,
    getClearButtonProps,
  };
}

export { useCombobox };
export type { UseComboboxProps, UseComboboxReturn, ComboboxItem };
```

### Using the Headless Combobox

The same hook powers completely different UIs:

#### Example 1: Minimal Combobox

```tsx
function MinimalCombobox() {
  const items: ComboboxItem[] = [
    { value: 'react', label: 'React' },
    { value: 'vue', label: 'Vue' },
    { value: 'svelte', label: 'Svelte' },
    { value: 'angular', label: 'Angular' },
    { value: 'solid', label: 'SolidJS' },
    { value: 'qwik', label: 'Qwik' },
  ];

  const {
    isOpen,
    filteredItems,
    getLabelProps,
    getInputProps,
    getMenuProps,
    getItemProps,
  } = useCombobox({
    items,
    onSelectedValueChange: (value) => console.log('Selected:', value),
  });

  return (
    <div className="relative w-64">
      <label {...getLabelProps({ className: 'block text-sm font-medium mb-1' })}>
        Framework
      </label>
      <input
        {...getInputProps({
          className: 'w-full rounded-md border px-3 py-2 text-sm',
          placeholder: 'Search frameworks...',
        })}
      />
      {isOpen && filteredItems.length > 0 && (
        <ul
          {...getMenuProps({
            className: 'absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg max-h-60 overflow-auto',
          })}
        >
          {filteredItems.map((item, index) => (
            <li
              key={item.value}
              {...getItemProps(item, index, {
                className: `px-3 py-2 text-sm cursor-pointer
                  data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700
                  data-[selected]:font-medium data-[selected]:bg-blue-100
                  data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed`,
              })}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredItems.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-white p-3 text-sm text-gray-500 shadow-lg">
          No results found.
        </div>
      )}
    </div>
  );
}
```

#### Example 2: Rich Combobox with Icons and Groups

```tsx
type Framework = {
  value: string;
  label: string;
  category: 'frontend' | 'backend' | 'fullstack';
  icon: string;
  disabled?: boolean;
};

function RichCombobox() {
  const allItems: Framework[] = [
    { value: 'react', label: 'React', category: 'frontend', icon: '\u269B\uFE0F' },
    { value: 'vue', label: 'Vue', category: 'frontend', icon: '\u{1F49A}' },
    { value: 'next', label: 'Next.js', category: 'fullstack', icon: '\u25B2' },
    { value: 'nuxt', label: 'Nuxt', category: 'fullstack', icon: '\u{1F49A}' },
    { value: 'express', label: 'Express', category: 'backend', icon: '\u{1F6E0}\uFE0F' },
    { value: 'fastify', label: 'Fastify', category: 'backend', icon: '\u26A1' },
  ];

  const comboboxItems: ComboboxItem<string>[] = allItems.map((f) => ({
    value: f.value,
    label: f.label,
    disabled: f.disabled,
  }));

  const {
    isOpen,
    filteredItems,
    selectedValue,
    getLabelProps,
    getInputProps,
    getMenuProps,
    getItemProps,
    getToggleButtonProps,
    getClearButtonProps,
  } = useCombobox({
    items: comboboxItems,
    onSelectedValueChange: (v) => console.log('Selected:', v),
  });

  // Group filtered items by category
  const grouped = useMemo(() => {
    const map = new Map<string, { item: ComboboxItem<string>; framework: Framework; index: number }[]>();

    filteredItems.forEach((item, index) => {
      const framework = allItems.find((f) => f.value === item.value);
      if (!framework) return;
      const group = map.get(framework.category) ?? [];
      group.push({ item, framework, index });
      map.set(framework.category, group);
    });

    return map;
  }, [filteredItems, allItems]);

  return (
    <div className="relative w-80">
      <label {...getLabelProps({ className: 'block text-sm font-medium text-gray-700 mb-1' })}>
        Choose a framework
      </label>
      <div className="relative">
        <input
          {...getInputProps({
            className: 'w-full rounded-lg border-2 border-gray-200 px-4 py-2.5 pr-20 text-sm focus:border-blue-500 focus:ring-0',
            placeholder: 'Type to search...',
          })}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
          {selectedValue && (
            <button
              {...getClearButtonProps({
                className: 'p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600',
              })}
            >
              x
            </button>
          )}
          <button
            {...getToggleButtonProps({
              className: 'p-1 rounded hover:bg-gray-100 text-gray-400',
            })}
          >
            {isOpen ? '\u25B2' : '\u25BC'}
          </button>
        </div>
      </div>

      {isOpen && (
        <ul
          {...getMenuProps({
            className: 'absolute z-20 mt-2 w-full rounded-lg border bg-white shadow-xl max-h-72 overflow-auto py-1',
          })}
        >
          {grouped.size === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500 text-center">
              No frameworks match your search.
            </li>
          ) : (
            Array.from(grouped.entries()).map(([category, groupItems]) => (
              <li key={category} role="presentation">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {category}
                </div>
                <ul role="group">
                  {groupItems.map(({ item, framework, index }) => (
                    <li
                      key={item.value}
                      {...getItemProps(item, index, {
                        className: `flex items-center gap-3 px-3 py-2 text-sm cursor-pointer
                          data-[highlighted]:bg-blue-50
                          data-[selected]:bg-blue-100 data-[selected]:font-medium
                          data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed`,
                      })}
                    >
                      <span className="text-lg">{framework.icon}</span>
                      <span>{framework.label}</span>
                      {item.value === selectedValue && (
                        <span className="ml-auto text-blue-600">\u2713</span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
```

## Advantages of Headless Architecture for Design Systems

### 1. Design System Flexibility

A headless component library can power multiple design systems simultaneously:

```
┌─────────────────────────────┐
│  useCombobox() hook         │  ← One headless implementation
│  useDialog() hook           │
│  useSelect() hook           │
│  useTabs() hook             │
└──────────┬──────────────────┘
           │
     ┌─────┼──────────────────────┐
     │     │                      │
     ▼     ▼                      ▼
┌─────────┐ ┌────────────┐ ┌──────────┐
│ Brand A  │ │  Brand B   │ │ Brand C  │
│ (Shadcn) │ │ (Material) │ │ (Custom) │
└──────────┘ └────────────┘ └──────────┘
```

### 2. Testing Isolation

Behavior tests are separate from visual tests:

```tsx
// Test the hook (behavior) — no rendering needed
describe('useCombobox', () => {
  it('filters items based on input', () => {
    const { result } = renderHook(() =>
      useCombobox({
        items: [
          { value: 'apple', label: 'Apple' },
          { value: 'banana', label: 'Banana' },
          { value: 'avocado', label: 'Avocado' },
        ],
      })
    );

    act(() => {
      result.current.setInputValue('a');
    });

    // "Banana" is filtered out
    expect(result.current.filteredItems).toHaveLength(2);
    expect(result.current.filteredItems.map((i) => i.label)).toEqual([
      'Apple',
      'Avocado',
    ]);
  });

  it('selects an item and closes the menu', () => {
    const onSelectedValueChange = vi.fn();
    const { result } = renderHook(() =>
      useCombobox({
        items: [{ value: 'apple', label: 'Apple' }],
        onSelectedValueChange,
      })
    );

    act(() => result.current.openMenu());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.selectItem({ value: 'apple', label: 'Apple' }));
    expect(onSelectedValueChange).toHaveBeenCalledWith('apple');
    expect(result.current.isOpen).toBe(false);
    expect(result.current.inputValue).toBe('Apple');
  });

  it('navigates with keyboard', () => {
    const items = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta', disabled: true },
      { value: 'c', label: 'Gamma' },
    ];

    const { result } = renderHook(() => useCombobox({ items }));

    act(() => result.current.openMenu());

    // Simulate ArrowDown — skips disabled Beta
    const inputProps = result.current.getInputProps();
    act(() => {
      (inputProps.onKeyDown as Function)({
        key: 'ArrowDown',
        preventDefault: () => {},
      });
    });
    expect(result.current.highlightedIndex).toBe(0); // Alpha

    act(() => {
      (inputProps.onKeyDown as Function)({
        key: 'ArrowDown',
        preventDefault: () => {},
      });
    });
    expect(result.current.highlightedIndex).toBe(2); // Gamma (skipped Beta)
  });
});
```

### 3. Server-Side Rendering Compatibility

Headless hooks can detect SSR environments and return safe defaults:

```tsx
function useCombobox(props) {
  const isSSR = typeof window === 'undefined';

  // During SSR, return static values
  if (isSSR) {
    return {
      isOpen: false,
      inputValue: '',
      filteredItems: props.items,
      // prop getters return minimal static props
      getInputProps: () => ({ role: 'combobox', 'aria-expanded': false }),
      getMenuProps: () => ({ role: 'listbox' }),
      // ...
    };
  }

  // Client-side: full implementation
  // ...
}
```

## When NOT to Use Headless Components

Headless is not always the right choice:

1. **Small teams with one design** — if you control the design and it is unlikely to change, the overhead of headless is not justified. Use Shadcn/ui or a pre-styled library.

2. **Rapid prototyping** — headless requires you to build all the UI. For prototyping, Material UI or Ant Design gets you to a working product faster.

3. **Simple components** — a `Badge` or `Avatar` does not need headless architecture. There is no complex behavior to share.

4. **When performance matters less than development speed** — headless hooks can have slightly more overhead than direct implementations because of the prop getter abstraction layer.

**Use headless when:**
- You are building a design system that will be used across multiple products or brands
- You need to match a specific design exactly and cannot compromise
- Accessibility is critical and you want battle-tested ARIA implementations
- You want to decouple your design from your component logic for long-term maintainability

## Further Reading

- **React Aria documentation:** [react-spectrum.adobe.com/react-aria](https://react-spectrum.adobe.com/react-aria/)
- **Radix Primitives:** [radix-ui.com/primitives](https://www.radix-ui.com/primitives)
- **Headless UI:** [headlessui.com](https://headlessui.com/)
- **Downshift:** The original headless combobox by Kent C. Dodds
- **Related:** [Compound Components](./compound-components) — when you want headless with compound structure
- **Related:** [Render Props & Hooks](./render-props-hooks) — the hook patterns that power headless architecture
