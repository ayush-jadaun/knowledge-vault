---
title: "Bundle Optimization"
description: "Deep dive into frontend bundle optimization — tree shaking, code splitting, dynamic imports, bundle analysis, module/nomodule pattern, compression, and edge-side includes for production applications."
tags: [bundling, tree-shaking, code-splitting, webpack, vite]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-20"
---

# Bundle Optimization

Every kilobyte of JavaScript you ship to the browser has a cost. It must be downloaded, decompressed, parsed, compiled, and executed — all on the user's device, using their battery and bandwidth. A 1MB JavaScript bundle takes ~4 seconds to process on a mid-range mobile device. For many users, that is the difference between using your app and closing the tab.

Bundle optimization is the discipline of shipping the minimum viable JavaScript to make each page work. This page covers the techniques from first principles — not just how to enable tree shaking or code splitting, but how they work internally and why they sometimes fail.

## Tree Shaking Deep Dive

Tree shaking is dead code elimination for ES modules. The bundler analyzes your import/export graph and removes any exported code that is never imported anywhere.

### How It Works

Tree shaking relies on the **static structure** of ES module `import`/`export` statements. Unlike CommonJS `require()`, ES module imports and exports can be analyzed at build time without executing the code:

```typescript
// math.ts — exports three functions
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

// app.ts — only uses add
import { add } from './math';
console.log(add(1, 2));

// After tree shaking:
// subtract and multiply are removed from the bundle
```

```mermaid
graph TD
    subgraph "Source (Before)"
        A["math.ts<br/>add()<br/>subtract()<br/>multiply()"]
        B["app.ts<br/>import { add }"]
    end

    subgraph "Bundle (After Tree Shaking)"
        C["bundle.js<br/>add() only<br/><s>subtract()</s><br/><s>multiply()</s>"]
    end

    A --> |"tree shake"| C
    B --> C
```

### Why Tree Shaking Fails

Tree shaking can only remove code that has **no side effects**. A side effect is any code that affects something outside its own scope when the module is loaded:

```typescript
// SIDE EFFECT: This runs when the module is imported, even if nothing is used
console.log('math module loaded');

export function add(a: number, b: number): number {
  return a + b;
}

// SIDE EFFECT: Modifies global state
window.MathUtils = { version: '1.0' };

export function multiply(a: number, b: number): number {
  return a * b;
}

// The bundler CANNOT remove multiply, because removing the module
// would also remove the side effects (console.log, window mutation),
// which might be intentional.
```

### The sideEffects Field

The `package.json` `sideEffects` field tells bundlers which files are safe to tree-shake:

```json
{
  "name": "my-library",
  "sideEffects": false
}
```

```json
{
  "name": "my-library",
  "sideEffects": [
    "*.css",
    "./src/polyfills.ts",
    "./src/register-globals.ts"
  ]
}
```

::: warning Barrel Files Kill Tree Shaking
Barrel files (`index.ts` that re-export everything) are the #1 reason tree shaking fails in practice:

```typescript
// components/index.ts (barrel file)
export { Button } from './Button';
export { Modal } from './Modal';      // 50KB
export { DataGrid } from './DataGrid'; // 200KB
export { Chart } from './Chart';       // 150KB

// app.ts — only needs Button
import { Button } from './components';
// Depending on the bundler and library, this might pull in
// ALL components because the barrel file is a single module
```

**Fix: Import directly from the source file:**
```typescript
import { Button } from './components/Button';
```
:::

### Verifying Tree Shaking

```typescript
// vite.config.ts — analyze tree shaking results
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    visualizer({
      filename: 'bundle-analysis.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined, // Let Rollup optimize
      },
    },
  },
});
```

## Code Splitting Strategies

Code splitting divides your bundle into smaller chunks that are loaded on demand. Instead of one massive `bundle.js`, you ship a small initial chunk and load additional code as the user navigates.

### Route-Based Splitting

The most common and highest-impact strategy — each route gets its own chunk:

```typescript
// React with React.lazy
import { lazy, Suspense } from 'react';

// Each of these becomes a separate chunk
const HomePage = lazy(() => import('./pages/Home'));
const ProductsPage = lazy(() => import('./pages/Products'));
const CheckoutPage = lazy(() => import('./pages/Checkout'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
      </Routes>
    </Suspense>
  );
}
```

```mermaid
graph TD
    A["Initial Load"] --> B["shell.js (50KB)<br/>Router, Layout, Nav"]
    B --> |"/products"| C["products.chunk.js (80KB)<br/>ProductList, Filters"]
    B --> |"/checkout"| D["checkout.chunk.js (120KB)<br/>Cart, Payment Form"]
    B --> |"/admin"| E["admin.chunk.js (200KB)<br/>Dashboard, Charts"]

    style B fill:#4ade80,color:#000
    style C fill:#60a5fa,color:#000
    style D fill:#60a5fa,color:#000
    style E fill:#60a5fa,color:#000
```

### Component-Based Splitting

Split individual heavy components, not just routes:

```typescript
import { lazy, Suspense, useState } from 'react';

// Heavy components loaded only when needed
const MarkdownEditor = lazy(() => import('./MarkdownEditor'));  // 300KB
const ImageCropper = lazy(() => import('./ImageCropper'));      // 150KB
const CodeHighlighter = lazy(() =>
  import('./CodeHighlighter').then((mod) => ({ default: mod.CodeHighlighter }))
);

function ArticleEditor() {
  const [showImageCropper, setShowImageCropper] = useState(false);

  return (
    <div>
      <Suspense fallback={<EditorSkeleton />}>
        <MarkdownEditor />
      </Suspense>

      <button onClick={() => setShowImageCropper(true)}>
        Add Image
      </button>

      {showImageCropper && (
        <Suspense fallback={<CropperSkeleton />}>
          <ImageCropper onComplete={(img) => {
            setShowImageCropper(false);
          }} />
        </Suspense>
      )}
    </div>
  );
}
```

### Vendor Splitting

Separate your code from third-party libraries. Your code changes frequently; vendor code rarely does, so it can be cached aggressively:

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // All node_modules in a vendor chunk
          if (id.includes('node_modules')) {
            // Split large libraries into their own chunks
            if (id.includes('chart.js') || id.includes('d3')) {
              return 'vendor-charts';
            }
            if (id.includes('@tanstack/react-query')) {
              return 'vendor-query';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            return 'vendor'; // Everything else
          }
        },
      },
    },
  },
});
```

## Dynamic Imports and Lazy Loading

Dynamic `import()` is the mechanism that enables code splitting. It returns a Promise that resolves to the module:

```typescript
// Prefetching: load the chunk before the user needs it
function ProductCard({ product }: { product: Product }) {
  const handleMouseEnter = () => {
    // Prefetch the product detail page when user hovers
    import('./pages/ProductDetail');
  };

  return (
    <Link
      to={`/products/${product.id}`}
      onMouseEnter={handleMouseEnter}
      onFocus={handleMouseEnter}
    >
      <h3>{product.name}</h3>
    </Link>
  );
}

// Conditional loading based on feature flags
async function loadEditor(): Promise<typeof import('./RichEditor')> {
  const flags = await getFeatureFlags();

  if (flags.newEditor) {
    return import('./RichEditorV2');
  }
  return import('./RichEditor');
}

// Loading based on user interaction
document.getElementById('export-btn')!.addEventListener('click', async () => {
  const { exportToPDF } = await import('./pdf-exporter');
  await exportToPDF(document.getElementById('report')!);
});
```

### Prefetch and Preload Hints

```html
<!-- Prefetch: low-priority, load when browser is idle -->
<link rel="prefetch" href="/chunks/checkout.chunk.js">

<!-- Preload: high-priority, load immediately -->
<link rel="preload" href="/chunks/critical-above-fold.js" as="script">

<!-- Module preload: for ES modules specifically -->
<link rel="modulepreload" href="/chunks/app.js">
```

```typescript
// Vite automatically adds prefetch/preload for dynamic imports
// You can also add magic comments in webpack:

// webpack magic comments
const AdminPage = lazy(() =>
  import(
    /* webpackChunkName: "admin" */
    /* webpackPrefetch: true */
    './pages/Admin'
  )
);
```

## Bundle Analysis

You cannot optimize what you cannot see. Bundle analyzers visualize your dependency graph, showing exactly what is in your bundle and how large each piece is.

### Tools

| Tool | Bundler | What It Shows |
|------|---------|--------------|
| `rollup-plugin-visualizer` | Vite / Rollup | Interactive treemap of all modules |
| `webpack-bundle-analyzer` | Webpack | Treemap with raw/gzip/parsed sizes |
| `source-map-explorer` | Any (needs source maps) | Treemap from source maps |
| `bundle-buddy` | Any | Duplicated modules across chunks |
| `bundlephobia.com` | npm packages | Size impact of adding a dependency |
| `pkg-size.dev` | npm packages | Actual bundle size after tree shaking |

### Setting Up Analysis

```typescript
// Vite: rollup-plugin-visualizer
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    visualizer({
      filename: 'stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap', // or 'sunburst', 'network'
    }),
  ],
});
```

```typescript
// Webpack: webpack-bundle-analyzer
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = {
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      reportFilename: 'bundle-report.html',
      openAnalyzer: false,
    }),
  ],
};
```

### What to Look For

```
Common bundle analysis findings:

1. DUPLICATE DEPENDENCIES
   - lodash appears 3 times (different versions)
   - Fix: dedupe in package.json, or use lodash-es

2. UNUSED LARGE LIBRARIES
   - moment.js (300KB) imported for one date format call
   - Fix: replace with date-fns (tree-shakeable) or Intl.DateTimeFormat

3. ENTIRE LIBRARY IMPORTED
   - import _ from 'lodash' pulls in 70KB
   - Fix: import debounce from 'lodash/debounce' (4KB)

4. HEAVY POLYFILLS
   - core-js shipping 200KB of polyfills for features your targets support
   - Fix: configure browserslist, use useBuiltIns: 'usage'

5. DEV-ONLY CODE IN PRODUCTION
   - PropTypes, debug logging, or test utilities in the bundle
   - Fix: DefinePlugin / import.meta.env.PROD guards
```

## Module/Nomodule Pattern

The module/nomodule pattern serves modern JavaScript to modern browsers and transpiled JavaScript with polyfills to legacy browsers:

```html
<!-- Modern browsers: ES2020, no polyfills, smaller bundle -->
<script type="module" src="/app.modern.js"></script>

<!-- Legacy browsers (IE11, old Safari): ES5, polyfills, larger bundle -->
<script nomodule src="/app.legacy.js"></script>
```

Modern browsers understand `type="module"` and ignore `nomodule`. Legacy browsers ignore `type="module"` and load `nomodule`. The result: 85%+ of users get the smaller, faster bundle.

```typescript
// vite.config.ts — Vite handles this with @vitejs/plugin-legacy
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11'],
      // Generates both modern and legacy bundles automatically
    }),
  ],
});
```

### Size Impact

| | Modern Bundle | Legacy Bundle | Savings |
|---|---|---|---|
| **JavaScript** | 180 KB | 320 KB | 44% smaller |
| **Polyfills** | 0 KB | 85 KB | No polyfills |
| **Parse time** | ~40ms | ~110ms | 63% faster |
| **Users served** | 95%+ | 5% | Most users get fast bundle |

## Compression

The final optimization before bytes hit the wire is compression. All modern bundled assets should be served with either Brotli or gzip compression.

### Brotli vs Gzip

| | Brotli | Gzip |
|---|---|---|
| **Compression ratio** | 15-20% better than gzip | Baseline |
| **Compression speed** | Slower (use pre-compression) | Faster |
| **Decompression speed** | Same as gzip | Baseline |
| **Browser support** | 97%+ (HTTPS only) | Universal |
| **Best for** | Static assets (pre-compressed) | Dynamic responses |

### Pre-Compressing at Build Time

```typescript
// vite.config.ts — pre-compress during build
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    // Generate .br files (Brotli)
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024, // Only compress files > 1KB
    }),
    // Generate .gz files (gzip fallback)
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024,
    }),
  ],
});
```

### Nginx Configuration

```nginx
# Serve pre-compressed files
location /assets/ {
    # Try Brotli first, then gzip, then uncompressed
    gzip_static on;
    brotli_static on;

    # Aggressive caching for hashed assets
    add_header Cache-Control "public, max-age=31536000, immutable";

    # Correct content types
    types {
        application/javascript js mjs;
        text/css css;
        image/svg+xml svg;
        application/wasm wasm;
    }
}
```

### Compression Impact

```
Typical compression results for a 500KB JavaScript bundle:

Uncompressed:     500 KB
Gzip (level 9):   145 KB  (71% reduction)
Brotli (level 11): 120 KB  (76% reduction)

Transfer time on 4G (15 Mbps):
Uncompressed:     267 ms
Gzip:              77 ms
Brotli:            64 ms
```

## Edge-Side Includes (ESI)

ESI allows you to compose pages at the CDN edge, serving cached fragments with dynamic pieces:

```html
<!-- The CDN assembles this page from cached fragments -->
<html>
<head>
  <title>Product Page</title>
  <!-- Cached for 1 year -->
  <esi:include src="/fragments/critical-css" />
</head>
<body>
  <!-- Cached for 1 hour -->
  <esi:include src="/fragments/header" />

  <!-- Cached for 5 minutes (product data changes) -->
  <esi:include src="/fragments/product/abc-123" />

  <!-- Not cached (personalized) -->
  <esi:include src="/fragments/recommendations?user=current" />

  <!-- Cached for 1 year (rarely changes) -->
  <esi:include src="/fragments/footer" />
</body>
</html>
```

ESI is supported by Varnish, Akamai, Fastly, and Cloudflare. It enables per-fragment caching — the header can be cached for a day while the product price fragment is cached for 5 minutes.

## Optimization Checklist

### Build Configuration

- [ ] Enable tree shaking (`sideEffects: false` in libraries)
- [ ] Configure route-based code splitting
- [ ] Set up vendor chunk splitting
- [ ] Enable Brotli and gzip pre-compression
- [ ] Configure `browserslist` targets to avoid unnecessary transpilation
- [ ] Add bundle analysis to CI pipeline

### Dependency Hygiene

- [ ] Audit dependencies with bundle analyzer quarterly
- [ ] Replace heavy libraries with lighter alternatives (moment -> date-fns, lodash -> lodash-es)
- [ ] Import only what you use (no barrel file imports for external libraries)
- [ ] Remove unused dependencies (`depcheck`, `knip`)
- [ ] Check for duplicate packages (`npm ls <package>`)

### Runtime Loading

- [ ] Lazy load below-the-fold components
- [ ] Prefetch likely next navigations
- [ ] Use `modulepreload` for critical dynamic chunks
- [ ] Implement the facade pattern for heavy third-party widgets
- [ ] Use Web Workers for CPU-intensive operations

## Further Reading

- [Web Performance & Core Web Vitals](/frontend-engineering/web-performance) — Measure the impact of bundle optimization on real users
- [Browser Rendering Pipeline](/frontend-engineering/browser-rendering) — Understand how JavaScript execution blocks rendering
- [Micro-Frontends](/frontend-engineering/micro-frontends) — Code splitting at the architectural level with Module Federation
- [Rendering Strategies](/frontend-engineering/rendering-strategies) — SSR and RSC reduce client-side JavaScript by moving work to the server
- [Infrastructure > CI/CD](/infrastructure/ci-cd/) — Enforce bundle budgets in your CI pipeline

---

::: tip Key Takeaway
- Tree shaking depends on the static structure of ES module imports and the `sideEffects` field in `package.json` — barrel files and CommonJS modules defeat it.
- Code splitting by route is the highest-leverage optimization: users download only the JavaScript needed for the current page, not the entire application.
- Compression (Brotli > gzip) is the final optimization layer and should be pre-computed at build time, not computed on every request by the server.
:::

::: warning Common Misconceptions
- **"Tree shaking is automatic and always works."** Tree shaking fails when modules have side effects (global mutations, console.log at module scope), when libraries use CommonJS instead of ES modules, or when barrel files force the bundler to include entire packages.
- **"Code splitting means smaller total bundle size."** Code splitting does not reduce total JavaScript — it distributes it across multiple chunks loaded on demand. Total size stays the same (or slightly increases due to chunk overhead), but initial load shrinks.
- **"Barrel files are just an organizational pattern."** Barrel files (`index.ts` with re-exports) can prevent tree shaking because importing one export may force the bundler to evaluate the entire barrel, pulling in all re-exported modules.
- **"Vendor splitting always helps."** Splitting node_modules into a separate chunk helps caching (vendor code changes rarely), but creating too many small chunks increases HTTP request overhead and parsing cost. Find the balance.
- **"Brotli is always better than gzip."** Brotli compression at high levels (11) is significantly slower than gzip, making it unsuitable for dynamic responses. Pre-compress static assets with Brotli at build time and use gzip for dynamic API responses.
:::

## When NOT to Optimize Bundles

- **Small applications under 100KB** — If your entire app is 80KB gzipped, spending days configuring manual chunks and analyzing the bundle provides negligible benefit. Focus on features.
- **Library development (premature chunking)** — Libraries should publish ES modules with `sideEffects: false` and let the consuming application's bundler handle splitting. Do not code-split a library.
- **Over-splitting into micro-chunks** — Creating 50 separate chunks of 2-5KB each adds HTTP overhead, parsing cost, and makes waterfall loading worse. Aim for chunks in the 30-150KB range.
- **Premature vendor chunk splitting** — Splitting React, ReactDOM, and every small utility into separate vendor chunks only helps if your code changes frequently while dependencies do not. For apps that deploy weekly, the caching benefit is minimal.

::: tip In Production
- **Vercel** automatically analyzes Next.js builds and reports per-page bundle sizes. Their build output shows exactly how much JavaScript each route ships, enabling teams to track bundle growth over time.
- **Shopify** reduced their Polaris admin bundle by 40% by replacing barrel file imports with direct imports and marking their component library as `sideEffects: false`.
- **Airbnb** replaced moment.js (300KB) with date-fns (tree-shakeable, 6KB per function used), cutting their JavaScript payload by 280KB on pages that only needed date formatting.
- **Netflix** uses route-based code splitting aggressively — their browse page loads only 150KB of JavaScript initially, with profile and settings pages loaded on navigation.
- **Webpack's creator Tobias Koppers** built Module Federation to solve Shopify's micro-frontend bundling challenges, and later created Turbopack (the Rust-based successor) for Vercel.
:::

::: details Quiz

**1. Why can tree shaking not remove code with side effects?**

::: details Answer
A side effect is code that affects something outside its own scope when the module is imported (e.g., `console.log()`, `window.X = ...`, polyfills). The bundler cannot determine if the side effect is intentional, so it must include the entire module to preserve correctness. The `sideEffects: false` field in `package.json` tells the bundler it is safe to remove unused exports.
:::

**2. What is the difference between `async` and `defer` on a script tag?**

::: details Answer
`async` downloads the script in parallel with HTML parsing and executes it as soon as it downloads (potentially before parsing finishes). `defer` downloads in parallel but waits until HTML parsing is complete before executing, and maintains execution order. `defer` is preferred for non-critical scripts because it never blocks parsing.
:::

**3. What is the module/nomodule pattern and why does it reduce bundle size for most users?**

::: details Answer
`<script type="module">` is loaded by modern browsers (95%+) and can contain ES2020+ syntax without polyfills. `<script nomodule>` is loaded by legacy browsers and contains transpiled ES5 with polyfills. Modern browsers ignore `nomodule` and legacy browsers ignore `type="module"`, so most users get the smaller modern bundle (typically 30-45% smaller).
:::

**4. How does the `visualizer` plugin help with bundle optimization?**

::: details Answer
The `rollup-plugin-visualizer` generates an interactive treemap showing every module in your bundle, its raw size, gzipped size, and brotli size. It reveals duplicate dependencies, unexpectedly large imports, dev-only code in production, and unused library features — all of which are invisible without visualization.
:::

**5. What is Edge-Side Includes (ESI) and when is it useful?**

::: details Answer
ESI allows a CDN to compose a page from independently cached fragments, each with its own cache TTL. The header might be cached for a day, product data for 5 minutes, and personalized recommendations not cached at all. It is useful for pages with mixed freshness requirements, supported by Varnish, Akamai, Fastly, and Cloudflare.
:::

:::

::: details Exercise
**Bundle Audit and Optimization**

Take a real project (or clone a popular open-source React/Vue app) and perform a complete bundle audit:

1. Add `rollup-plugin-visualizer` (Vite) or `webpack-bundle-analyzer` (Webpack) and generate a treemap
2. Identify the three largest dependencies and evaluate if lighter alternatives exist
3. Find any barrel file imports that could be replaced with direct imports
4. Implement route-based code splitting with `React.lazy()` or dynamic `import()`
5. Measure before/after: total JS size (raw + gzipped), number of chunks, and initial load chunk size

::: details Solution
Example audit results for a hypothetical React app:

**Before optimization:**
- Total JS: 680KB gzipped
- Initial chunk: 450KB gzipped
- 1 monolithic bundle

**Findings:**
1. `moment.js` (72KB gzipped) used for one `format()` call -> Replace with `Intl.DateTimeFormat` (0KB)
2. `lodash` (24KB gzipped) imported as `import _ from 'lodash'` -> Replace with `import debounce from 'lodash-es/debounce'` (1KB)
3. Barrel file `import { Button } from '@ui'` pulling in DataGrid (50KB) -> Direct import `import { Button } from '@ui/Button'`
4. Admin routes loaded eagerly -> Wrap with `React.lazy(() => import('./pages/Admin'))`

**After optimization:**
- Total JS: 520KB gzipped (23% reduction)
- Initial chunk: 180KB gzipped (60% reduction)
- 6 route-based chunks + 1 vendor chunk

```typescript
// vite.config.ts with route splitting
const routes = {
  home: lazy(() => import('./pages/Home')),
  products: lazy(() => import('./pages/Products')),
  admin: lazy(() => import('./pages/Admin')),
  settings: lazy(() => import('./pages/Settings')),
};
```
:::

:::

> **One-Liner Summary:** Every kilobyte of JavaScript you ship must be downloaded, parsed, compiled, and executed on the user's device — bundle optimization is the discipline of deciding which kilobytes earn that privilege.
