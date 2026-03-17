---
title: "Polymorphic Components"
description: "The 'as' prop pattern for rendering components as different HTML elements or custom components — with full TypeScript generics for type-safe polymorphism using React.ElementType and ComponentPropsWithRef"
tags: [polymorphic-components, as-prop, react, typescript, generics, design-systems, component-api]
difficulty: advanced
prerequisites: [react, typescript-generics, react-refs]
lastReviewed: "2026-03-17"
---

# Polymorphic Components

A polymorphic component renders as different HTML elements or custom components based on a prop (typically called `as`). A `Button` that can be an `<a>` when it links somewhere. A `Text` that can be a `<p>`, `<span>`, `<h1>`, or a `<label>`. A `Box` that can be any element at all. The challenge is not making this work — it is making TypeScript understand what props are valid for the rendered element.

## The Problem

```tsx
// A Button should sometimes be a link
<Button as="a" href="/about">About</Button>

// TypeScript challenge:
// - When as="button", accept onClick, type, disabled
// - When as="a", accept href, target, rel
// - When as={Link}, accept to, replace (React Router props)
// - Reject invalid combinations: <Button as="a" disabled /> (anchors don't have disabled)
```

Without proper typing, you get one of two outcomes:
1. **Over-permissive:** Accept any prop on any element (no type safety)
2. **Under-permissive:** Only accept props for the default element (breaks `as`)

## Basic Implementation Without Types

The runtime implementation is simple — the `as` prop determines the rendered element:

```tsx
function Box({ as: Component = 'div', children, ...props }) {
  return <Component {...props}>{children}</Component>;
}

// Works at runtime...
<Box as="a" href="/about">Link</Box>
<Box as="button" onClick={() => {}}>Click</Box>
<Box as="section">Section</Box>

// ...but TypeScript knows nothing about which props are valid
// These are also accepted (incorrectly):
<Box as="a" disabled />  // anchors don't have disabled
<Box as="div" href="/x" />  // divs don't have href
```

## Complete Type-Safe Implementation

### Step 1: The Core Type Definitions

```tsx
import {
  type ElementType,
  type ComponentPropsWithRef,
  type ComponentPropsWithoutRef,
  type PropsWithChildren,
  forwardRef,
  type ForwardRefRenderFunction,
  type ReactElement,
} from 'react';

/**
 * Extracts the `as` prop type.
 * `as` must be a valid React element type: a string tag name ("div", "a")
 * or a React component (typeof Link, typeof motion.div).
 */
type AsProp<C extends ElementType> = {
  as?: C;
};

/**
 * Resolves the props for a polymorphic component:
 * 1. Start with the component's own props
 * 2. Add the `as` prop
 * 3. Merge in the native props of the rendered element
 * 4. Omit any props from the native element that the component overrides
 *    (to prevent conflicts like { onClick: string } from native clashing
 *     with { onClick: () => void } from the component)
 */
type PolymorphicComponentProps<
  C extends ElementType,
  OwnProps = {}
> = OwnProps &
  AsProp<C> &
  Omit<ComponentPropsWithoutRef<C>, keyof OwnProps | 'as'>;

/**
 * Same as above but includes ref typing.
 */
type PolymorphicComponentPropsWithRef<
  C extends ElementType,
  OwnProps = {}
> = PolymorphicComponentProps<C, OwnProps> & {
  ref?: ComponentPropsWithRef<C>['ref'];
};

/**
 * Extracts the ref type for a given element type.
 */
type PolymorphicRef<C extends ElementType> = ComponentPropsWithRef<C>['ref'];
```

### Step 2: A Simple Polymorphic Component (No Ref)

```tsx
// ─── Text component that can be any text element ────────────────────

type TextOwnProps = {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  color?: 'default' | 'muted' | 'accent' | 'destructive';
  truncate?: boolean;
};

type TextProps<C extends ElementType = 'span'> = PolymorphicComponentProps<C, TextOwnProps>;

const sizeClasses: Record<NonNullable<TextOwnProps['size']>, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
};

const weightClasses: Record<NonNullable<TextOwnProps['weight']>, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const colorClasses: Record<NonNullable<TextOwnProps['color']>, string> = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  accent: 'text-primary',
  destructive: 'text-destructive',
};

function Text<C extends ElementType = 'span'>({
  as,
  size = 'md',
  weight = 'normal',
  color = 'default',
  truncate = false,
  className,
  children,
  ...props
}: TextProps<C>) {
  const Component = as || 'span';

  return (
    <Component
      className={cn(
        sizeClasses[size],
        weightClasses[weight],
        colorClasses[color],
        truncate && 'truncate',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

// ─── Usage — TypeScript validates props based on `as` ───────────────

// Renders as <span> (default) — span props accepted
<Text size="lg" weight="bold">Hello</Text>

// Renders as <p> — paragraph props accepted
<Text as="p" size="sm" color="muted">A paragraph</Text>

// Renders as <h1> — heading props accepted
<Text as="h1" size="3xl" weight="bold">Page Title</Text>

// Renders as <label> — label props accepted (htmlFor is valid)
<Text as="label" htmlFor="email" size="sm" weight="medium">Email</Text>

// Renders as <a> — anchor props accepted (href, target are valid)
<Text as="a" href="/about" target="_blank" color="accent">About Us</Text>

// TypeScript ERROR: <span> does not have `href`
// @ts-expect-error
<Text href="/about">Bad</Text>

// TypeScript ERROR: <a> does not have `htmlFor`
// @ts-expect-error
<Text as="a" htmlFor="email">Bad</Text>
```

### Step 3: Polymorphic Component With Ref Forwarding

Adding ref support is the hardest part because `forwardRef` does not natively support generics. The solution uses a type assertion.

```tsx
// ─── Box: the universal polymorphic primitive ───────────────────────

type BoxOwnProps = {
  // Box has no own props beyond what the rendered element provides.
  // It exists purely to enable the `as` pattern.
};

type BoxProps<C extends ElementType = 'div'> = PolymorphicComponentPropsWithRef<C, BoxOwnProps>;

type BoxComponent = <C extends ElementType = 'div'>(
  props: BoxProps<C>
) => ReactElement | null;

const Box: BoxComponent = forwardRef(
  <C extends ElementType = 'div'>(
    { as, ...props }: BoxProps<C>,
    ref: PolymorphicRef<C>
  ) => {
    const Component = as || 'div';
    return <Component ref={ref} {...props} />;
  }
) as BoxComponent;

// ─── Button: polymorphic with own props and ref ─────────────────────

type ButtonOwnProps = {
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

type ButtonProps<C extends ElementType = 'button'> = PolymorphicComponentPropsWithRef<
  C,
  ButtonOwnProps
>;

type ButtonComponent = <C extends ElementType = 'button'>(
  props: ButtonProps<C>
) => ReactElement | null;

const Button: ButtonComponent = forwardRef(
  <C extends ElementType = 'button'>(
    {
      as,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className,
      children,
      ...props
    }: ButtonProps<C>,
    ref: PolymorphicRef<C>
  ) => {
    const Component = as || 'button';

    const variantClasses: Record<string, string> = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
    };

    const sizeClasses: Record<string, string> = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-6 text-base',
    };

    return (
      <Component
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </Component>
    );
  }
) as ButtonComponent;

// ─── Usage with full type safety ────────────────────────────────────

// As a button (default)
<Button variant="primary" onClick={() => console.log('clicked')}>
  Save
</Button>

// As an anchor — href and target are now valid
<Button as="a" href="/about" target="_blank" variant="ghost">
  About
</Button>

// As a React Router Link — `to` prop is valid
import { Link } from 'react-router-dom';
<Button as={Link} to="/dashboard" variant="outline">
  Dashboard
</Button>

// As a Next.js Link
import NextLink from 'next/link';
<Button as={NextLink} href="/dashboard" variant="primary">
  Dashboard
</Button>

// With ref — ref type matches the rendered element
const buttonRef = useRef<HTMLButtonElement>(null);
<Button ref={buttonRef} onClick={() => buttonRef.current?.focus()}>
  Focus me
</Button>

const anchorRef = useRef<HTMLAnchorElement>(null);
<Button as="a" ref={anchorRef} href="/about">
  About
</Button>
```

## Understanding the Type Magic

### Why `Omit<ComponentPropsWithoutRef<C>, keyof OwnProps | 'as'>` ?

This is the critical line. Without the `Omit`, you get type conflicts:

```tsx
// Without Omit:
type BadProps<C extends ElementType> = ButtonOwnProps & ComponentPropsWithoutRef<C>;

// Problem: both ButtonOwnProps and HTMLButtonElement define `disabled`
// ButtonOwnProps might define `disabled?: boolean`
// HTMLButtonElement defines `disabled?: boolean`
// TypeScript tries to intersect them — usually fine for identical types,
// but breaks for conflicting types (e.g., if ButtonOwnProps defines `type: 'primary' | 'secondary'`
// while <button> has `type: 'button' | 'submit' | 'reset'`)

// With Omit:
type GoodProps<C extends ElementType> = ButtonOwnProps &
  Omit<ComponentPropsWithoutRef<C>, keyof ButtonOwnProps>;
// Native element props are included EXCEPT those that ButtonOwnProps already defines.
// ButtonOwnProps wins any conflicts.
```

### Why the `as BoxComponent` Type Assertion?

`forwardRef` returns `ForwardRefExoticComponent<Props>`, which does not support generics. The generic `C extends ElementType` is lost after `forwardRef`. The type assertion restores it:

```tsx
// forwardRef strips the generic:
const Bad = forwardRef(
  <C extends ElementType>(props: BoxProps<C>, ref: PolymorphicRef<C>) => {
    // ...
  }
);
// typeof Bad = ForwardRefExoticComponent<BoxProps<"div">>
// The generic C is gone — it defaults to "div"

// Type assertion restores it:
const Good = forwardRef(/* ... */) as BoxComponent;
// typeof Good = <C extends ElementType>(props: BoxProps<C>) => ReactElement | null
// The generic C is preserved
```

### Why `ElementType` and Not `keyof JSX.IntrinsicElements`?

`ElementType` is the union of all valid React element types:

```tsx
type ElementType =
  | keyof JSX.IntrinsicElements  // "div", "span", "a", "button", etc.
  | ComponentType<any>;          // React.FC, React.Component, forwardRef components

// keyof JSX.IntrinsicElements only covers HTML/SVG elements.
// ElementType also covers custom React components like Link, motion.div, etc.
```

## Polymorphic Patterns in Production Libraries

### Chakra UI's Approach

Chakra uses a dedicated `chakra` factory function:

```tsx
// Chakra's internal approach (simplified)
const chakra = {
  button: styled('button', { baseStyle: { ... } }),
  a: styled('a', { baseStyle: { ... } }),
  // ...
};

// Their Button component:
const Button = forwardRef<ButtonProps, 'button'>((props, ref) => {
  const { as, ...rest } = props;
  const Component = as || 'button';
  return <Component ref={ref} {...rest} />;
});

// Usage:
<Button as="a" href="/about">Link Button</Button>
```

### Mantine's Approach

Mantine uses a `createPolymorphicComponent` helper:

```tsx
// Mantine's approach (simplified)
function createPolymorphicComponent<
  DefaultElement extends ElementType,
  Props
>(component: any) {
  type ComponentType = <C extends ElementType = DefaultElement>(
    props: PolymorphicComponentProps<C, Props>
  ) => ReactElement;

  return component as ComponentType & {
    displayName?: string;
  };
}

const Button = createPolymorphicComponent<'button', ButtonOwnProps>(
  forwardRef<HTMLButtonElement, ButtonProps<'button'>>((props, ref) => {
    const { as: Component = 'button', ...rest } = props;
    return <Component ref={ref} {...rest} />;
  })
);
```

### Radix UI's Approach

Radix uses a `Slot` component with `asChild` instead of `as`:

```tsx
// Radix's approach — `asChild` instead of `as`
<Button asChild>
  <a href="/about">About</a>
</Button>

// The `asChild` approach:
// - Instead of changing the rendered element, it "merges" the Button's behavior
//   onto the child element
// - The child element is the actual rendered element
// - Button's props (event handlers, classes, refs) are merged onto the child
```

The `asChild` pattern has a TypeScript advantage: the child's type is already known from JSX, so no generic gymnastics are needed. The disadvantage is slightly more verbose usage.

## Advanced: Constraining the `as` Prop

Sometimes you want to limit which elements a component can render as:

```tsx
// ─── Only allow inline elements ─────────────────────────────────────

type InlineElements = 'span' | 'a' | 'strong' | 'em' | 'code' | 'abbr' | 'time';

type InlineTextProps<C extends InlineElements = 'span'> = PolymorphicComponentProps<
  C,
  { color?: 'default' | 'muted' | 'accent' }
>;

function InlineText<C extends InlineElements = 'span'>({
  as,
  color = 'default',
  ...props
}: InlineTextProps<C>) {
  const Component = as || 'span';
  return <Component {...props} />;
}

// Valid:
<InlineText as="a" href="/link">Link</InlineText>
<InlineText as="strong">Bold</InlineText>
<InlineText as="code">code</InlineText>

// TypeScript ERROR: "div" is not assignable to InlineElements
// @ts-expect-error
<InlineText as="div">Not allowed</InlineText>

// ─── Only allow heading elements ────────────────────────────────────

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

type HeadingProps<C extends HeadingLevel = 'h2'> = PolymorphicComponentProps<
  C,
  {
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    tracking?: 'tight' | 'normal' | 'wide';
  }
>;

function Heading<C extends HeadingLevel = 'h2'>({
  as,
  size,
  tracking = 'tight',
  className,
  ...props
}: HeadingProps<C>) {
  const Component = as || 'h2';
  return (
    <Component
      className={cn(
        'font-bold',
        tracking === 'tight' && 'tracking-tight',
        tracking === 'wide' && 'tracking-wide',
        className
      )}
      {...props}
    />
  );
}

// Valid:
<Heading as="h1" size="2xl">Page Title</Heading>
<Heading as="h3" size="md">Section Title</Heading>

// TypeScript ERROR: "p" is not a heading level
// @ts-expect-error
<Heading as="p">Not a heading</Heading>
```

## Performance Considerations

Polymorphic components have minimal runtime overhead — the `as` prop is just a variable holding a component or string tag. However, there are TypeScript compilation costs:

- **Complex generic types slow down the TypeScript compiler.** In large projects with hundreds of polymorphic components, this can measurably increase type-checking time.
- **IDE autocompletion may lag** because the union of all possible HTML element props is large.
- **Error messages can be cryptic** when the generic type resolution fails.

To mitigate:
- Only make components polymorphic when there is a real need (Button, Text, Box). Not every component needs `as`.
- Consider the `asChild` pattern (Radix) if TypeScript complexity becomes a concern.
- Cache the type aliases — define `ButtonProps` once rather than inline.

## Testing Polymorphic Components

```tsx
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button (polymorphic)', () => {
  it('renders as a button by default', () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders as an anchor when as="a"', () => {
    render(<Button as="a" href="/about">About</Button>);
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/about');
  });

  it('forwards ref to the rendered element', () => {
    const ref = { current: null as HTMLAnchorElement | null };
    render(<Button as="a" ref={ref} href="/test">Test</Button>);
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
    expect(ref.current?.href).toContain('/test');
  });

  it('applies variant classes regardless of rendered element', () => {
    render(<Button as="a" href="#" variant="destructive">Delete</Button>);
    const link = screen.getByRole('link');
    expect(link.className).toContain('bg-destructive');
  });

  it('merges custom className with variant classes', () => {
    render(<Button className="custom-class" variant="primary">Save</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('custom-class');
    expect(button.className).toContain('bg-primary');
  });
});
```

## Further Reading

- **Ben Ilegbodu:** "Polymorphic React Components in TypeScript"
- **Ohans Emmanuel:** "React Polymorphic Components with TypeScript"
- **Radix UI Slot:** An alternative to the `as` prop pattern
- **Next:** [Slot Pattern](./slot-pattern) — Radix's `asChild` and named slot composition
- **Related:** [Headless Components](./headless-components) — polymorphism at the architecture level
