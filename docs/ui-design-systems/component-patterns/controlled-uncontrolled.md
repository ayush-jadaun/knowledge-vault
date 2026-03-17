---
title: "Controlled & Uncontrolled Components"
description: "State ownership patterns in React — controlled components with value + onChange, uncontrolled components with refs, and the useControllableState hook that supports both modes seamlessly"
tags: [controlled-components, uncontrolled-components, react, forms, state-management, typescript, hooks]
difficulty: intermediate
prerequisites: [react, typescript, react-hooks, react-refs]
lastReviewed: "2026-03-17"
---

# Controlled & Uncontrolled Components

Every stateful component faces a fundamental question: who owns the state? The component itself (uncontrolled) or the parent (controlled)? This distinction affects API design, performance, testing, and composability. The best design system components support both modes with a single API using the `useControllableState` pattern.

## Controlled Components

A controlled component does not manage its own state. The parent provides the current value and a callback to update it. The component is a pure function of its props.

```tsx
// Controlled: parent owns state
function ControlledInput() {
  const [value, setValue] = useState('');

  return (
    <input
      value={value}                          // Parent provides value
      onChange={(e) => setValue(e.target.value)} // Parent handles changes
    />
  );
}
```

**Characteristics:**
- State lives in the parent
- Component receives `value` and `onChange` props
- Every state change goes through the parent (parent can intercept, validate, transform)
- Component re-renders when parent updates the value
- The parent is the single source of truth

**When to use controlled:**
- Form validation (you need to check/transform values as they change)
- Dependent fields (field B's options depend on field A's value)
- Conditional submission (disable the submit button until certain conditions are met)
- External state management (Redux, Zustand, URL state)
- Testing (you can assert on state directly)

### Controlled Component Implementation

```tsx
import { forwardRef, type ChangeEvent } from 'react';

type ControlledInputProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

const ControlledInput = forwardRef<HTMLInputElement, ControlledInputProps>(
  ({ value, onChange, onBlur, placeholder, disabled, 'aria-label': ariaLabel }, ref) => {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    };

    return (
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    );
  }
);

// Usage: parent controls everything
function PhoneNumberInput() {
  const [phone, setPhone] = useState('');

  const handleChange = (value: string) => {
    // Parent can intercept and transform — only allow digits and dashes
    const sanitized = value.replace(/[^0-9-]/g, '');
    // Auto-format: 123-456-7890
    const formatted = sanitized
      .replace(/^(\d{3})(\d)/, '$1-$2')
      .replace(/^(\d{3}-\d{3})(\d)/, '$1-$2')
      .slice(0, 12);
    setPhone(formatted);
  };

  return (
    <div>
      <ControlledInput
        value={phone}
        onChange={handleChange}
        placeholder="123-456-7890"
        aria-label="Phone number"
      />
      <p>Raw value: {phone}</p>
    </div>
  );
}
```

## Uncontrolled Components

An uncontrolled component manages its own internal state. The parent can set an initial value and read the current value via a ref, but does not control ongoing state changes.

```tsx
// Uncontrolled: component owns state
function UncontrolledInput() {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    // Read current value via ref
    console.log(inputRef.current?.value);
  };

  return (
    <div>
      <input ref={inputRef} defaultValue="initial" />
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}
```

**Characteristics:**
- State lives inside the component
- Parent provides `defaultValue` (initial state only) instead of `value`
- State changes happen without parent involvement
- Parent reads state via ref or callback events
- The DOM is the source of truth

**When to use uncontrolled:**
- Simple forms where you only need the value on submit
- File inputs (`<input type="file" />` is always uncontrolled)
- Integration with non-React code (jQuery plugins, legacy DOM manipulation)
- Performance-sensitive scenarios (avoiding re-renders on every keystroke)
- Rapid prototyping (less boilerplate)

### Uncontrolled Component Implementation

```tsx
import { forwardRef, useRef, useImperativeHandle, useState, type ChangeEvent } from 'react';

// ─── Uncontrolled with imperative handle ────────────────────────────

type UncontrolledInputHandle = {
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
  reset: () => void;
};

type UncontrolledInputProps = {
  defaultValue?: string;
  onChangeComplete?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

const UncontrolledInput = forwardRef<UncontrolledInputHandle, UncontrolledInputProps>(
  ({ defaultValue = '', onChangeComplete, placeholder, disabled }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [internalValue, setInternalValue] = useState(defaultValue);

    // Expose imperative methods to parent via ref
    useImperativeHandle(ref, () => ({
      getValue: () => internalValue,
      setValue: (value: string) => {
        setInternalValue(value);
        if (inputRef.current) inputRef.current.value = value;
      },
      focus: () => inputRef.current?.focus(),
      reset: () => {
        setInternalValue(defaultValue);
        if (inputRef.current) inputRef.current.value = defaultValue;
      },
    }));

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      setInternalValue(e.target.value);
    };

    const handleBlur = () => {
      onChangeComplete?.(internalValue);
    };

    return (
      <input
        ref={inputRef}
        type="text"
        defaultValue={defaultValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  }
);

// Usage
function FormWithUncontrolledInput() {
  const inputRef = useRef<UncontrolledInputHandle>(null);

  const handleSubmit = () => {
    const value = inputRef.current?.getValue();
    console.log('Submitted:', value);
    inputRef.current?.reset();
  };

  return (
    <div>
      <UncontrolledInput
        ref={inputRef}
        defaultValue="Hello"
        onChangeComplete={(value) => console.log('Changed:', value)}
      />
      <button onClick={handleSubmit}>Submit</button>
      <button onClick={() => inputRef.current?.focus()}>Focus</button>
    </div>
  );
}
```

## The Mixed Mode Problem

In design systems, you often need components that work in BOTH modes. A `Select` should work as controlled (when the parent manages form state) AND as uncontrolled (when used in a simple form where you just want a default value).

**The problem:**

```tsx
// Consumer A wants controlled mode
<Select value={selectedFramework} onChange={setSelectedFramework} />

// Consumer B wants uncontrolled mode
<Select defaultValue="react" />

// Consumer C wants mixed: default value but also notified of changes
<Select defaultValue="react" onChange={(v) => analytics.track('selected', v)} />
```

Building separate controlled and uncontrolled variants doubles your code. The `useControllableState` hook solves this.

## useControllableState: The Complete Implementation

This hook supports three modes:
1. **Controlled:** `value` and `onChange` are provided — parent owns state
2. **Uncontrolled:** only `defaultValue` is provided — component owns state
3. **Mixed:** `defaultValue` and `onChange` but no `value` — component owns state but notifies parent

```tsx
import { useState, useCallback, useRef, useEffect } from 'react';

type UseControllableStateParams<T> = {
  /**
   * The controlled value. If provided, the component is controlled.
   * The component will not manage its own state.
   */
  value?: T;
  /**
   * The initial value for uncontrolled mode.
   * Ignored if `value` is provided.
   */
  defaultValue: T;
  /**
   * Called when the value changes.
   * In controlled mode: signals the parent to update.
   * In uncontrolled mode: optional notification.
   */
  onChange?: (value: T) => void;
};

/**
 * Hook that supports both controlled and uncontrolled component modes.
 *
 * When `value` is provided: controlled mode (component reflects parent's state).
 * When `value` is undefined: uncontrolled mode (component manages its own state).
 *
 * @returns [currentValue, setValue] — same API as useState.
 *
 * @example
 * ```tsx
 * function Toggle({ value, defaultValue = false, onChange }: ToggleProps) {
 *   const [isOn, setIsOn] = useControllableState({
 *     value,
 *     defaultValue,
 *     onChange,
 *   });
 *
 *   return <button onClick={() => setIsOn(!isOn)}>{isOn ? 'ON' : 'OFF'}</button>;
 * }
 *
 * // Controlled: <Toggle value={isEnabled} onChange={setIsEnabled} />
 * // Uncontrolled: <Toggle defaultValue={true} />
 * // Mixed: <Toggle defaultValue={true} onChange={(v) => track(v)} />
 * ```
 */
function useControllableState<T>({
  value: controlledValue,
  defaultValue,
  onChange,
}: UseControllableStateParams<T>): [T, (value: T | ((prev: T) => T)) => void] {
  // Determine if controlled on first render and warn if it changes
  const isControlled = controlledValue !== undefined;
  const isControlledRef = useRef(isControlled);

  if (process.env.NODE_ENV !== 'production') {
    // Warn if switching between controlled and uncontrolled
    if (isControlledRef.current !== isControlled) {
      console.warn(
        `A component is changing from ${
          isControlledRef.current ? 'controlled' : 'uncontrolled'
        } to ${
          isControlled ? 'controlled' : 'uncontrolled'
        }. This is likely caused by the value changing from a defined to ` +
        `undefined value, which should not happen. Decide between using a ` +
        `controlled or uncontrolled component for the lifetime of the component.`
      );
    }
  }

  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = useState<T>(defaultValue);

  // The effective value: controlled or internal
  const value = isControlled ? controlledValue : internalValue;

  // Stable reference to onChange to avoid unnecessary effect re-runs
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const setValue = useCallback(
    (nextValue: T | ((prev: T) => T)) => {
      // Resolve the next value (support function updaters like useState)
      const resolvedValue =
        typeof nextValue === 'function'
          ? (nextValue as (prev: T) => T)(
              isControlledRef.current ? controlledValue! : internalValue
            )
          : nextValue;

      // In uncontrolled mode, update internal state
      if (!isControlledRef.current) {
        setInternalValue(resolvedValue);
      }

      // Always call onChange (for both controlled and uncontrolled)
      onChangeRef.current?.(resolvedValue);
    },
    [controlledValue, internalValue]
  );

  return [value, setValue];
}

export { useControllableState };
export type { UseControllableStateParams };
```

### Using useControllableState in Components

#### Toggle Component

```tsx
type ToggleProps = {
  /** Controlled value */
  pressed?: boolean;
  /** Initial value for uncontrolled mode */
  defaultPressed?: boolean;
  /** Change handler */
  onPressedChange?: (pressed: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
};

const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      pressed,
      defaultPressed = false,
      onPressedChange,
      disabled,
      children,
      className,
    },
    ref
  ) => {
    const [isPressed, setIsPressed] = useControllableState({
      value: pressed,
      defaultValue: defaultPressed,
      onChange: onPressedChange,
    });

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={isPressed}
        disabled={disabled}
        onClick={() => setIsPressed(!isPressed)}
        data-state={isPressed ? 'on' : 'off'}
        className={cn(
          'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isPressed
            ? 'bg-primary text-primary-foreground'
            : 'bg-transparent hover:bg-muted',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        {children}
      </button>
    );
  }
);

// ─── Usage in all three modes ───────────────────────────────────────

// Controlled: parent manages state
function ControlledExample() {
  const [bold, setBold] = useState(false);
  return <Toggle pressed={bold} onPressedChange={setBold}>Bold</Toggle>;
}

// Uncontrolled: component manages its own state
function UncontrolledExample() {
  return <Toggle defaultPressed={true}>Bold</Toggle>;
}

// Mixed: component manages state but parent is notified
function MixedExample() {
  return (
    <Toggle
      defaultPressed={false}
      onPressedChange={(pressed) => {
        analytics.track('toggle_bold', { pressed });
      }​}
    >
      Bold
    </Toggle>
  );
}
```

#### Disclosure Component (Collapsible)

```tsx
type DisclosureProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

type DisclosureTriggerProps = {
  children: React.ReactNode;
  className?: string;
};

type DisclosureContentProps = {
  children: React.ReactNode;
  className?: string;
};

// Context for sharing state between sub-components
type DisclosureContextValue = {
  isOpen: boolean;
  toggle: () => void;
  triggerId: string;
  contentId: string;
};

const DisclosureContext = createContext<DisclosureContextValue | null>(null);

function useDisclosureContext() {
  const ctx = useContext(DisclosureContext);
  if (!ctx) throw new Error('Disclosure sub-components must be used within <Disclosure>');
  return ctx;
}

function Disclosure({ open, defaultOpen = false, onOpenChange, children }: DisclosureProps) {
  const [isOpen, setIsOpen] = useControllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });

  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;

  const toggle = useCallback(() => setIsOpen((prev) => !prev), [setIsOpen]);

  return (
    <DisclosureContext.Provider value={​{ isOpen, toggle, triggerId, contentId }​}>
      <div data-state={isOpen ? 'open' : 'closed'}>
        {children}
      </div>
    </DisclosureContext.Provider>
  );
}

function DisclosureTrigger({ children, className }: DisclosureTriggerProps) {
  const { isOpen, toggle, triggerId, contentId } = useDisclosureContext();

  return (
    <button
      id={triggerId}
      type="button"
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={toggle}
      className={className}
    >
      {children}
    </button>
  );
}

function DisclosureContent({ children, className }: DisclosureContentProps) {
  const { isOpen, triggerId, contentId } = useDisclosureContext();

  if (!isOpen) return null;

  return (
    <div
      id={contentId}
      role="region"
      aria-labelledby={triggerId}
      className={className}
    >
      {children}
    </div>
  );
}

Disclosure.Trigger = DisclosureTrigger;
Disclosure.Content = DisclosureContent;

// ─── Usage ──────────────────────────────────────────────────────────

// Controlled: FAQ page where the parent tracks which section is open
function FAQPage() {
  const [openSection, setOpenSection] = useState<string | null>(null);

  return (
    <div>
      {faqItems.map((item) => (
        <Disclosure
          key={item.id}
          open={openSection === item.id}
          onOpenChange={(isOpen) => setOpenSection(isOpen ? item.id : null)}
        >
          <Disclosure.Trigger>{item.question}</Disclosure.Trigger>
          <Disclosure.Content>{item.answer}</Disclosure.Content>
        </Disclosure>
      ))}
    </div>
  );
}

// Uncontrolled: sidebar section that remembers its own state
function Sidebar() {
  return (
    <Disclosure defaultOpen={true}>
      <Disclosure.Trigger>Filters</Disclosure.Trigger>
      <Disclosure.Content>
        <FilterForm />
      </Disclosure.Content>
    </Disclosure>
  );
}
```

#### Slider Component

```tsx
type SliderProps = {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  'aria-label': string;
  className?: string;
};

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      value: controlledValue,
      defaultValue = 0,
      onChange,
      min = 0,
      max = 100,
      step = 1,
      disabled,
      'aria-label': ariaLabel,
      className,
    },
    ref
  ) => {
    const [value, setValue] = useControllableState({
      value: controlledValue,
      defaultValue,
      onChange,
    });

    // Calculate percentage for custom track fill
    const percentage = ((value - min) / (max - min)) * 100;

    return (
      <div className={cn('relative w-full', className)}>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="w-full appearance-none bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={​{
            // Custom track fill using a gradient
            background: `linear-gradient(to right, var(--primary) ${percentage}%, var(--muted) ${percentage}%)`,
          }​}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{min}</span>
          <span className="font-medium text-foreground">{value}</span>
          <span>{max}</span>
        </div>
      </div>
    );
  }
);

// Controlled: volume slider connected to state
function VolumeControl() {
  const [volume, setVolume] = useState(75);
  return (
    <div>
      <Slider value={volume} onChange={setVolume} min={0} max={100} aria-label="Volume" />
      <span>Volume: {volume}%</span>
    </div>
  );
}

// Uncontrolled: brightness slider that manages itself
function BrightnessControl() {
  return <Slider defaultValue={50} min={0} max={100} aria-label="Brightness" />;
}
```

## Form Library Integration

Design system components with `useControllableState` integrate seamlessly with form libraries because they support the controlled pattern that form libraries expect.

### React Hook Form Integration

```tsx
import { useForm, Controller } from 'react-hook-form';

type FormData = {
  name: string;
  framework: string;
  volume: number;
  darkMode: boolean;
};

function SettingsForm() {
  const { control, handleSubmit, watch } = useForm<FormData>({
    defaultValues: {
      name: '',
      framework: 'react',
      volume: 50,
      darkMode: false,
    },
  });

  const onSubmit = (data: FormData) => console.log(data);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Controller wraps our components in controlled mode */}
      <Controller
        name="framework"
        control={control}
        render={({ field }) => (
          <Select
            value={field.value}
            onChange={field.onChange}
          >
            <Select.Trigger placeholder="Framework" />
            <Select.Content>
              <Select.Item value="react">React</Select.Item>
              <Select.Item value="vue">Vue</Select.Item>
              <Select.Item value="svelte">Svelte</Select.Item>
            </Select.Content>
          </Select>
        )}
      />

      <Controller
        name="volume"
        control={control}
        render={({ field }) => (
          <Slider
            value={field.value}
            onChange={field.onChange}
            min={0}
            max={100}
            aria-label="Volume"
          />
        )}
      />

      <Controller
        name="darkMode"
        control={control}
        render={({ field }) => (
          <Toggle
            pressed={field.value}
            onPressedChange={field.onChange}
          >
            Dark Mode
          </Toggle>
        )}
      />

      <button type="submit">Save</button>
    </form>
  );
}
```

### Formik Integration

```tsx
import { Formik, Field, type FieldProps } from 'formik';

function SettingsFormFormik() {
  return (
    <Formik
      initialValues={​{ framework: 'react', volume: 50 }​}
      onSubmit={(values) => console.log(values)}
    >
      {({ handleSubmit }) => (
        <form onSubmit={handleSubmit}>
          <Field name="framework">
            {({ field, form }: FieldProps) => (
              <Select
                value={field.value}
                onChange={(value) => form.setFieldValue('framework', value)}
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="react">React</Select.Item>
                  <Select.Item value="vue">Vue</Select.Item>
                </Select.Content>
              </Select>
            )}
          </Field>

          <Field name="volume">
            {({ field, form }: FieldProps) => (
              <Slider
                value={field.value}
                onChange={(value) => form.setFieldValue('volume', value)}
                min={0}
                max={100}
                aria-label="Volume"
              />
            )}
          </Field>

          <button type="submit">Save</button>
        </form>
      )}
    </Formik>
  );
}
```

## Common Pitfalls

### Pitfall 1: Switching Between Controlled and Uncontrolled

```tsx
// BUG: value flips between controlled (string) and uncontrolled (undefined)
function BuggyComponent() {
  const [name, setName] = useState<string | undefined>(undefined);
  return <input value={name} onChange={(e) => setName(e.target.value)} />;
  //            ^ starts as undefined (uncontrolled), becomes string (controlled)
}

// FIX: always provide a string value
function FixedComponent() {
  const [name, setName] = useState(''); // Always a string
  return <input value={name} onChange={(e) => setName(e.target.value)} />;
}
```

### Pitfall 2: Ignoring onChange in Controlled Mode

```tsx
// BUG: providing value without onChange makes input read-only
function ReadOnlyBug() {
  return <input value="frozen" />;
  // React warns: "You provided a `value` prop to a form field without an
  // `onChange` handler. This will render a read-only field."
}

// FIX: either use onChange or use readOnly/defaultValue
function Fixed() {
  return <input value="frozen" readOnly />;
  // or
  return <input defaultValue="frozen" />;
}
```

### Pitfall 3: Stale Closures in useControllableState

```tsx
// BUG: using stale value in onChange
function BuggySlider() {
  const [value, setValue] = useControllableState({
    defaultValue: 50,
    onChange: (v) => {
      // BUG: `value` here might be stale
      console.log(`Changed from ${value} to ${v}`);
    },
  });
  // ...
}

// FIX: use the callback value or usePrevious
function FixedSlider() {
  const previousValue = usePrevious(value);
  const [value, setValue] = useControllableState({
    defaultValue: 50,
    onChange: (v) => {
      console.log(`Changed to ${v}`);
    },
  });
  // ...
}
```

### Pitfall 4: defaultValue vs value in useEffect

```tsx
// BUG: treating defaultValue like value — re-initializing on every change
function BuggyComponent({ defaultFilter }: { defaultFilter: string }) {
  const [filter, setFilter] = useState(defaultFilter);

  // BUG: resets filter every time defaultFilter prop changes
  useEffect(() => {
    setFilter(defaultFilter);
  }, [defaultFilter]);
  // ...
}

// FIX: defaultValue should only set initial state
// If you need it to be reactive, it should be `value` (controlled)
function FixedComponent({ defaultFilter }: { defaultFilter: string }) {
  const [filter, setFilter] = useState(defaultFilter);
  // No useEffect — defaultFilter is only used for initialization
  // If parent needs to control the filter, use value + onChange
}
```

## Testing Controlled vs Uncontrolled

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  describe('controlled mode', () => {
    it('reflects the controlled value', () => {
      const { rerender } = render(
        <Toggle pressed={false} onPressedChange={() => {}​}>Bold</Toggle>
      );
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');

      rerender(
        <Toggle pressed={true} onPressedChange={() => {}​}>Bold</Toggle>
      );
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });

    it('calls onChange but does not update internally', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<Toggle pressed={false} onPressedChange={onChange}>Bold</Toggle>);
      await user.click(screen.getByRole('switch'));

      expect(onChange).toHaveBeenCalledWith(true);
      // Still false because parent did not update the value prop
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('uncontrolled mode', () => {
    it('uses defaultPressed as initial value', () => {
      render(<Toggle defaultPressed={true}>Bold</Toggle>);
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });

    it('toggles internally without onChange', async () => {
      const user = userEvent.setup();
      render(<Toggle defaultPressed={false}>Bold</Toggle>);

      await user.click(screen.getByRole('switch'));
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

      await user.click(screen.getByRole('switch'));
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('mixed mode', () => {
    it('manages state internally but calls onChange', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<Toggle defaultPressed={false} onPressedChange={onChange}>Bold</Toggle>);
      await user.click(screen.getByRole('switch'));

      expect(onChange).toHaveBeenCalledWith(true);
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });
  });
});
```

## Advanced: useControllableState with Validation

An extended version that supports validation before accepting a value change:

```tsx
type UseControllableStateWithValidationParams<T> = UseControllableStateParams<T> & {
  validate?: (value: T) => boolean;
  onRejected?: (value: T) => void;
};

function useControllableStateWithValidation<T>({
  value: controlledValue,
  defaultValue,
  onChange,
  validate,
  onRejected,
}: UseControllableStateWithValidationParams<T>): [T, (value: T | ((prev: T) => T)) => void] {
  const [currentValue, setCurrentValue] = useControllableState({
    value: controlledValue,
    defaultValue,
    onChange: (nextValue) => {
      if (validate && !validate(nextValue)) {
        onRejected?.(nextValue);
        return; // Do not propagate invalid values
      }
      onChange?.(nextValue);
    },
  });

  const setValidatedValue = useCallback(
    (nextValue: T | ((prev: T) => T)) => {
      const resolved = typeof nextValue === 'function'
        ? (nextValue as (prev: T) => T)(currentValue)
        : nextValue;

      if (validate && !validate(resolved)) {
        onRejected?.(resolved);
        return;
      }

      setCurrentValue(resolved);
    },
    [currentValue, setCurrentValue, validate, onRejected]
  );

  return [currentValue, setValidatedValue];
}

// Usage: number input that rejects values outside bounds
function BoundedNumberInput({ min = 0, max = 100 }: { min?: number; max?: number }) {
  const [value, setValue] = useControllableStateWithValidation({
    defaultValue: min,
    validate: (v) => v >= min && v <= max,
    onRejected: (v) => console.warn(`Value ${v} is out of bounds [${min}, ${max}]`),
  });

  return (
    <input
      type="number"
      value={value}
      onChange={(e) => setValue(Number(e.target.value))}
      min={min}
      max={max}
    />
  );
}
```

## How Open Source Libraries Handle This

| Library | Pattern | Notes |
|---------|---------|-------|
| **Radix UI** | `useControllableState` hook | Nearly identical to the implementation above. Source: `@radix-ui/react-use-controllable-state` |
| **Chakra UI** | `useControllableState` hook | Adds `shouldUpdate` option for conditional state updates |
| **Headless UI** | Controlled-first, optional `defaultValue` | Uses a simpler internal implementation |
| **React Aria** | `useControlledState` hook | From Adobe. Strict TypeScript, supports `undefined` explicitly |
| **Mantine** | `useUncontrolled` hook | Similar concept, different naming convention |
| **Ariakit** | `useControlledState` hook | Similar to React Aria's approach |

## Further Reading

- **React docs:** [Sharing State Between Components](https://react.dev/learn/sharing-state-between-components)
- **Radix source:** `packages/react/use-controllable-state/src/useControllableState.tsx`
- **Next:** [Polymorphic Components](./polymorphic-components) — the `as` prop pattern for flexible rendering
- **Related:** [Compound Components](./compound-components) — controlled/uncontrolled at the compound level
