---
title: "Atomic Design"
description: "Brad Frost's atomic design methodology applied to React component libraries — atoms, molecules, organisms, templates, and pages with concrete file organization, naming conventions, and real-world implementation strategies"
tags: [atomic-design, component-hierarchy, design-systems, react, organization, architecture]
difficulty: beginner
prerequisites: [react, component-basics]
lastReviewed: "2026-03-17"
---

# Atomic Design

Brad Frost's atomic design is a methodology for building component systems by drawing an analogy to chemistry. Just as matter is composed of atoms that combine into molecules, which combine into organisms, UI components are composed in a strict hierarchy. The power of this model is not the metaphor itself — it is the discipline it imposes on how you think about composition.

## The Five Levels

### Level 1: Atoms

Atoms are the smallest, most fundamental UI components. They cannot be broken down further without ceasing to be functional. An atom is a single HTML element (or a thin wrapper around one) with styling and props.

**Characteristics:**
- Single responsibility — does exactly one thing
- No business logic
- No data fetching
- Stateless or minimally stateful (e.g., focus state)
- Styled but themeable through tokens
- Fully accessible on their own

**Examples:**

```tsx
// atoms/Button.tsx
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  // Base styles — always applied
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
  };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={buttonVariants({ variant, size, className })}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
export type { ButtonProps };
```

```tsx
// atoms/Input.tsx
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
          'text-sm ring-offset-background',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        aria-invalid={error || undefined}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };
export type { InputProps };
```

```tsx
// atoms/Badge.tsx
import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
        warning: 'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={badgeVariants({ variant, className })} {...props} />
  )
);

Badge.displayName = 'Badge';

export { Badge, badgeVariants };
export type { BadgeProps };
```

```tsx
// atoms/Avatar.tsx
import { forwardRef, useState } from 'react';
import { cn } from '@/lib/utils';

type AvatarProps = {
  src?: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;
  className?: string;
};

const sizeClasses = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  ({ src, alt, size = 'md', fallback, className }, ref) => {
    const [imageError, setImageError] = useState(false);

    const initials = fallback || alt
      .split(' ')
      .map((word) => word[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    return (
      <span
        ref={ref}
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted',
          sizeClasses[size],
          className
        )}
        role="img"
        aria-label={alt}
      >
        {src && !imageError ? (
          <img
            src={src}
            alt={alt}
            className="aspect-square h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="font-medium text-muted-foreground">{initials}</span>
        )}
      </span>
    );
  }
);

Avatar.displayName = 'Avatar';

export { Avatar };
export type { AvatarProps };
```

```tsx
// atoms/Label.tsx
import { forwardRef } from 'react';
import type { LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  required?: boolean;
};

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-1 text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
);

Label.displayName = 'Label';

export { Label };
export type { LabelProps };
```

**What atoms should NOT do:**

- Fetch data
- Import other atoms (an atom composed of atoms is a molecule)
- Contain business logic or domain-specific behavior
- Hard-code text strings (accept them as props or children)
- Make API calls or manage global state

### Level 2: Molecules

Molecules combine multiple atoms into a cohesive unit that serves a single purpose. A molecule is greater than the sum of its atoms — the combination creates new functionality that no single atom provides.

**The litmus test:** A molecule is a group of atoms that function together as a unit. A search form (Input + Button) is a molecule. A random Input next to a random Button on the page is not.

**Examples:**

```tsx
// molecules/FormField.tsx
import { forwardRef, useId } from 'react';
import { Label } from '@/atoms/Label';
import { Input, type InputProps } from '@/atoms/Input';
import { cn } from '@/lib/utils';

type FormFieldProps = InputProps & {
  label: string;
  helperText?: string;
  errorMessage?: string;
};

const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, helperText, errorMessage, required, className, id: externalId, ...inputProps }, ref) => {
    const generatedId = useId();
    const id = externalId || generatedId;
    const helperId = `${id}-helper`;
    const errorId = `${id}-error`;
    const hasError = !!errorMessage;

    return (
      <div className={cn('space-y-2', className)}>
        <Label htmlFor={id} required={required}>
          {label}
        </Label>
        <Input
          ref={ref}
          id={id}
          required={required}
          error={hasError}
          aria-describedby={
            [hasError && errorId, helperText && helperId].filter(Boolean).join(' ') || undefined
          }
          {...inputProps}
        />
        {helperText && !hasError && (
          <p id={helperId} className="text-sm text-muted-foreground">
            {helperText}
          </p>
        )}
        {hasError && (
          <p id={errorId} className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = 'FormField';

export { FormField };
export type { FormFieldProps };
```

```tsx
// molecules/SearchBar.tsx
import { forwardRef, type FormEvent } from 'react';
import { Input } from '@/atoms/Input';
import { Button } from '@/atoms/Button';
import { cn } from '@/lib/utils';

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  className?: string;
};

const SearchBar = forwardRef<HTMLFormElement, SearchBarProps>(
  ({ value, onChange, onSubmit, placeholder = 'Search...', loading, className }, ref) => {
    const handleSubmit = (e: FormEvent) => {
      e.preventDefault();
      onSubmit(value);
    };

    return (
      <form
        ref={ref}
        onSubmit={handleSubmit}
        className={cn('flex gap-2', className)}
        role="search"
      >
        <Input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="flex-1"
        />
        <Button type="submit" loading={loading}>
          Search
        </Button>
      </form>
    );
  }
);

SearchBar.displayName = 'SearchBar';

export { SearchBar };
export type { SearchBarProps };
```

```tsx
// molecules/AvatarGroup.tsx
import { Children, type ReactNode } from 'react';
import { Avatar, type AvatarProps } from '@/atoms/Avatar';
import { cn } from '@/lib/utils';

type AvatarGroupProps = {
  max?: number;
  size?: AvatarProps['size'];
  children: ReactNode;
  className?: string;
};

function AvatarGroup({ max = 5, size = 'md', children, className }: AvatarGroupProps) {
  const avatars = Children.toArray(children);
  const visible = avatars.slice(0, max);
  const remaining = avatars.length - max;

  return (
    <div className={cn('flex -space-x-3', className)} role="group" aria-label="User avatars">
      {visible.map((child, index) => (
        <div
          key={index}
          className="relative ring-2 ring-background rounded-full"
          style={{ zIndex: visible.length - index }}
        >
          {child}
        </div>
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            'relative inline-flex items-center justify-center rounded-full bg-muted ring-2 ring-background',
            size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'
          )}
          style={{ zIndex: 0 }}
        >
          <span className="font-medium text-muted-foreground">+{remaining}</span>
        </div>
      )}
    </div>
  );
}

export { AvatarGroup };
export type { AvatarGroupProps };
```

```tsx
// molecules/NavItem.tsx
import { forwardRef, type ReactNode } from 'react';
import { Badge } from '@/atoms/Badge';
import { cn } from '@/lib/utils';

type NavItemProps = {
  icon?: ReactNode;
  label: string;
  badge?: string | number;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
};

const NavItem = forwardRef<HTMLAnchorElement, NavItemProps>(
  ({ icon, label, badge, active, href = '#', onClick, className }, ref) => (
    <a
      ref={ref}
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        className
      )}
      aria-current={active ? 'page' : undefined}
    >
      {icon && <span className="shrink-0" aria-hidden="true">{icon}</span>}
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <Badge variant="secondary" className="ml-auto">
          {badge}
        </Badge>
      )}
    </a>
  )
);

NavItem.displayName = 'NavItem';

export { NavItem };
export type { NavItemProps };
```

### Level 3: Organisms

Organisms are complex UI components composed of molecules and atoms that form a distinct section of an interface. An organism is context-aware — it typically connects to application state, handles data fetching, or encapsulates a complete user workflow.

**The distinction from molecules:** A molecule is a simple, reusable unit (FormField works anywhere). An organism is a complex, context-specific assembly (a LoginForm is specific to authentication).

**Examples:**

```tsx
// organisms/SiteHeader.tsx
import { useState } from 'react';
import { Avatar } from '@/atoms/Avatar';
import { Button } from '@/atoms/Button';
import { SearchBar } from '@/molecules/SearchBar';
import { NavItem } from '@/molecules/NavItem';
import { cn } from '@/lib/utils';

type SiteHeaderProps = {
  user: {
    name: string;
    avatar?: string;
  };
  navigation: Array<{
    label: string;
    href: string;
    icon?: React.ReactNode;
    badge?: number;
  }>;
  onSearch: (query: string) => void;
  onLogout: () => void;
  className?: string;
};

function SiteHeader({ user, navigation, onSearch, onLogout, className }: SiteHeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className
      )}
    >
      <div className="container flex h-16 items-center gap-4">
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavItem
              key={item.href}
              label={item.label}
              href={item.href}
              icon={item.icon}
              badge={item.badge}
            />
          ))}
        </nav>

        <div className="flex-1">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onSubmit={onSearch}
            placeholder="Search..."
            className="max-w-md mx-auto"
          />
        </div>

        <div className="flex items-center gap-3">
          <Avatar src={user.avatar} alt={user.name} size="sm" />
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

export { SiteHeader };
export type { SiteHeaderProps };
```

```tsx
// organisms/DataTable.tsx
import { useState, useMemo, type ReactNode } from 'react';
import { Button } from '@/atoms/Button';
import { Input } from '@/atoms/Input';
import { Badge } from '@/atoms/Badge';
import { cn } from '@/lib/utils';

type Column<T> = {
  key: keyof T & string;
  header: string;
  sortable?: boolean;
  render?: (value: T[keyof T], row: T) => ReactNode;
  width?: string;
};

type DataTableProps<T extends Record<string, unknown>> = {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T & string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
};

function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  searchable = false,
  searchPlaceholder = 'Filter...',
  emptyMessage = 'No results found.',
  className,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredData = useMemo(() => {
    if (!search) return data;
    const lower = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) =>
        String(row[col.key]).toLowerCase().includes(lower)
      )
    );
  }, [data, search, columns]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey as keyof T];
      const bVal = b[sortKey as keyof T];
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {searchable && (
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="max-w-sm"
          aria-label={searchPlaceholder}
        />
      )}
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left font-medium text-muted-foreground',
                    col.sortable && 'cursor-pointer select-none hover:text-foreground'
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === 'asc' ? 'ascending' : 'descending'
                      : undefined
                  }
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <span aria-hidden="true">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row) => (
                <tr key={String(row[keyField])} className="border-b last:border-0 hover:bg-muted/50">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      {col.render ? col.render(row[col.key], row) : String(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-muted-foreground">
        {sortedData.length} of {data.length} row(s)
      </div>
    </div>
  );
}

export { DataTable };
export type { DataTableProps, Column };
```

### Level 4: Templates

Templates are page-level layout structures with placeholder content. They define the content structure — where the header goes, where the sidebar lives, how the main content area is sized — without containing real data.

**Why templates exist:** Templates separate layout from content. This is critical for design systems because layout is a design concern (consistent across the application) while content is a product concern (different per page).

```tsx
// templates/DashboardTemplate.tsx
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type DashboardTemplateProps = {
  header: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  footer?: ReactNode;
  sidebarWidth?: string;
  sidebarCollapsed?: boolean;
  className?: string;
};

function DashboardTemplate({
  header,
  sidebar,
  main,
  footer,
  sidebarWidth = '16rem',
  sidebarCollapsed = false,
  className,
}: DashboardTemplateProps) {
  return (
    <div className={cn('flex min-h-screen flex-col', className)}>
      {/* Full-width header */}
      <div className="shrink-0">{header}</div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            'shrink-0 border-r bg-background transition-[width] duration-200',
            sidebarCollapsed ? 'w-16' : undefined
          )}
          style={!sidebarCollapsed ? { width: sidebarWidth } : undefined}
        >
          <nav className="sticky top-16 p-4" aria-label="Dashboard navigation">
            {sidebar}
          </nav>
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-auto">
          <div className="container py-6">{main}</div>
        </main>
      </div>

      {/* Optional footer */}
      {footer && <footer className="shrink-0 border-t">{footer}</footer>}
    </div>
  );
}

export { DashboardTemplate };
export type { DashboardTemplateProps };
```

```tsx
// templates/AuthTemplate.tsx
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type AuthTemplateProps = {
  children: ReactNode;
  illustration?: ReactNode;
  className?: string;
};

function AuthTemplate({ children, illustration, className }: AuthTemplateProps) {
  return (
    <div className={cn('grid min-h-screen lg:grid-cols-2', className)}>
      {/* Left panel: Auth form */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          {children}
        </div>
      </div>

      {/* Right panel: Illustration (hidden on mobile) */}
      <div className="hidden lg:flex items-center justify-center bg-muted p-8">
        {illustration || (
          <div className="text-muted-foreground text-center">
            <p className="text-lg">Brand illustration area</p>
          </div>
        )}
      </div>
    </div>
  );
}

export { AuthTemplate };
export type { AuthTemplateProps };
```

### Level 5: Pages

Pages are template instances with real content, data, and state. This is where templates meet the application — where React Query hooks are called, where Redux state is consumed, where route parameters are read.

```tsx
// pages/DashboardPage.tsx
import { useMemo, useState } from 'react';
import { DashboardTemplate } from '@/templates/DashboardTemplate';
import { SiteHeader } from '@/organisms/SiteHeader';
import { DataTable, type Column } from '@/organisms/DataTable';
import { NavItem } from '@/molecules/NavItem';
import { Badge } from '@/atoms/Badge';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useOrders } from '@/hooks/useOrders';

type Order = {
  id: string;
  customer: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  total: number;
  date: string;
};

function DashboardPage() {
  const user = useCurrentUser();
  const { data: orders = [] } = useOrders();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const columns: Column<Order>[] = useMemo(
    () => [
      { key: 'id', header: 'Order ID', sortable: true },
      { key: 'customer', header: 'Customer', sortable: true },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (value) => {
          const variant = {
            pending: 'warning' as const,
            processing: 'default' as const,
            completed: 'success' as const,
            cancelled: 'destructive' as const,
          };
          return <Badge variant={variant[value as Order['status']]}>{String(value)}</Badge>;
        },
      },
      {
        key: 'total',
        header: 'Total',
        sortable: true,
        render: (value) => `$${(value as number).toFixed(2)}`,
      },
      { key: 'date', header: 'Date', sortable: true },
    ],
    []
  );

  return (
    <DashboardTemplate
      sidebarCollapsed={sidebarCollapsed}
      header={
        <SiteHeader
          user={user}
          navigation={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Orders', href: '/orders', badge: orders.length },
          ]}
          onSearch={(query) => console.log('Search:', query)}
          onLogout={() => console.log('Logout')}
        />
      }
      sidebar={
        <div className="space-y-1">
          <NavItem label="Dashboard" href="/dashboard" active />
          <NavItem label="Orders" href="/orders" badge={orders.length} />
          <NavItem label="Products" href="/products" />
          <NavItem label="Customers" href="/customers" />
          <NavItem label="Settings" href="/settings" />
        </div>
      }
      main={
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <DataTable
            data={orders}
            columns={columns}
            keyField="id"
            searchable
            searchPlaceholder="Search orders..."
          />
        </div>
      }
    />
  );
}

export { DashboardPage };
```

## Applying Atomic Design in React

### File Organization

The most common file structure maps each atomic level to a directory:

```
src/
├── components/
│   ├── atoms/
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.test.tsx
│   │   │   ├── Button.stories.tsx
│   │   │   └── index.ts
│   │   ├── Input/
│   │   ├── Label/
│   │   ├── Badge/
│   │   ├── Avatar/
│   │   ├── Icon/
│   │   ├── Spinner/
│   │   ├── Text/
│   │   └── index.ts          ← barrel export
│   │
│   ├── molecules/
│   │   ├── FormField/
│   │   ├── SearchBar/
│   │   ├── NavItem/
│   │   ├── AvatarGroup/
│   │   ├── Tooltip/
│   │   ├── Dropdown/
│   │   └── index.ts
│   │
│   ├── organisms/
│   │   ├── SiteHeader/
│   │   ├── DataTable/
│   │   ├── LoginForm/
│   │   ├── CommandPalette/
│   │   ├── Sidebar/
│   │   └── index.ts
│   │
│   ├── templates/
│   │   ├── DashboardTemplate/
│   │   ├── AuthTemplate/
│   │   ├── SettingsTemplate/
│   │   └── index.ts
│   │
│   └── pages/
│       ├── DashboardPage/
│       ├── LoginPage/
│       └── SettingsPage/
│
├── hooks/               ← shared hooks (not component-specific)
├── lib/                 ← utilities (cn, formatters)
├── tokens/              ← design tokens (colors, spacing, typography)
└── styles/              ← global styles, CSS custom properties
```

### Naming Conventions

Consistent naming makes atomic levels instantly recognizable:

| Level | Naming Pattern | Examples |
|-------|---------------|----------|
| Atom | The element it wraps or its visual purpose | `Button`, `Input`, `Badge`, `Avatar`, `Icon`, `Text` |
| Molecule | What it does (compound noun) | `FormField`, `SearchBar`, `NavItem`, `AvatarGroup` |
| Organism | What section it represents | `SiteHeader`, `DataTable`, `LoginForm`, `CommentThread` |
| Template | `[Feature]Template` suffix | `DashboardTemplate`, `AuthTemplate`, `SettingsTemplate` |
| Page | `[Feature]Page` suffix | `DashboardPage`, `LoginPage`, `SettingsPage` |

### Import Rules

Enforce a strict dependency direction to prevent circular dependencies and maintain the hierarchy:

```
Pages → Templates → Organisms → Molecules → Atoms → Tokens
```

**Rules:**
1. Atoms import only from tokens/utilities (never from molecules, organisms, etc.)
2. Molecules import from atoms and tokens
3. Organisms import from molecules, atoms, and tokens
4. Templates import from organisms, molecules, and atoms
5. Pages import from everything

You can enforce this with ESLint:

```js
// .eslintrc.js
module.exports = {
  rules: {
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          // Atoms cannot import from molecules or above
          {
            target: './src/components/atoms',
            from: './src/components/molecules',
            message: 'Atoms cannot import from molecules',
          },
          {
            target: './src/components/atoms',
            from: './src/components/organisms',
            message: 'Atoms cannot import from organisms',
          },
          // Molecules cannot import from organisms or above
          {
            target: './src/components/molecules',
            from: './src/components/organisms',
            message: 'Molecules cannot import from organisms',
          },
          {
            target: './src/components/molecules',
            from: './src/components/templates',
            message: 'Molecules cannot import from templates',
          },
          // Organisms cannot import from templates or pages
          {
            target: './src/components/organisms',
            from: './src/components/templates',
            message: 'Organisms cannot import from templates',
          },
          {
            target: './src/components/organisms',
            from: './src/components/pages',
            message: 'Organisms cannot import from pages',
          },
        ],
      },
    ],
  },
};
```

### Barrel Exports

Each atomic level has a barrel file that re-exports all components at that level:

```ts
// components/atoms/index.ts
export { Button, type ButtonProps } from './Button';
export { Input, type InputProps } from './Input';
export { Label, type LabelProps } from './Label';
export { Badge, type BadgeProps } from './Badge';
export { Avatar, type AvatarProps } from './Avatar';
```

Consumers import from the level, not from individual component files:

```ts
// Good: import from the atomic level barrel
import { Button, Input, Badge } from '@/components/atoms';

// Avoid: importing from individual component files
import { Button } from '@/components/atoms/Button/Button';
```

::: warning Barrel File Performance
Barrel files can cause bundle size issues if your bundler does not tree-shake effectively. With modern bundlers (Vite, esbuild, SWC), this is rarely a problem. With older Webpack configurations, you may need `sideEffects: false` in `package.json` or should use direct imports.
:::

## When Atomic Design Breaks Down

Atomic design is a useful mental model, but it is not a rigid taxonomy. Real-world components do not always fit neatly into one level.

### The Classification Problem

Is a `Tooltip` an atom or a molecule? It is a single component (atom), but it wraps other content and manages positioning state (molecule). Is a `Modal` a molecule or an organism? It is a container (molecule) but it manages focus trapping, portals, and keyboard events (organism).

**The answer:** It does not matter. If you spend more than 30 seconds debating which level a component belongs to, you are over-indexing on the metaphor. Put it where it makes sense for your team and document the decision.

### The Middle-Out Approach

Some teams find it more practical to start from the middle (molecules/organisms) and extract atoms as patterns emerge, rather than building atoms first and composing upward. This is valid — atomic design is a mental model, not a mandatory build order.

### Alternative Organizational Models

Not every team uses atomic design. Other valid approaches:

| Model | Structure | Best For |
|-------|-----------|----------|
| **Feature-based** | `features/auth/components/`, `features/dashboard/components/` | Product teams, feature-driven development |
| **Domain-based** | `domains/user/`, `domains/order/`, `shared/` | Domain-driven design teams |
| **Flat** | `components/Button.tsx`, `components/DataTable.tsx` | Small teams, < 20 components |
| **Shadcn-style** | `components/ui/button.tsx` (co-located, no nesting) | Projects using Shadcn conventions |

The right organization is the one your team actually follows consistently.

## Storybook Integration

Each atomic level maps naturally to Storybook's hierarchy:

```tsx
// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button', // ← atomic level in the Storybook sidebar
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'destructive', 'outline', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'icon'],
    },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Button',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const Loading: Story = {
  args: {
    children: 'Saving...',
    loading: true,
  },
};
```

This creates a Storybook sidebar organized by atomic level:

```
Atoms/
  Button
  Input
  Badge
  Avatar
  Label
Molecules/
  FormField
  SearchBar
  NavItem
Organisms/
  SiteHeader
  DataTable
Templates/
  DashboardTemplate
  AuthTemplate
```

## Further Reading

- **Brad Frost's _Atomic Design_ book:** [atomicdesign.bradfrost.com](https://atomicdesign.bradfrost.com/)
- **Next:** [Compound Components](./compound-components) — the pattern for multi-part components that share implicit state
- **Related:** [Headless Components](./headless-components) — when atomic design meets behavior-first architecture
