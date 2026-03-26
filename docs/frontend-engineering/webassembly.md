---
title: "WebAssembly"
description: "Deep dive into WebAssembly — compilation, linear memory, use cases (browser compute, edge, plugins), WASI, compiling Rust/Go/C++ to WASM, and performance vs JavaScript"
tags: [webassembly, wasm, wasi, rust, performance]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-20"
---

# WebAssembly

WebAssembly (WASM) is a binary instruction format designed as a portable compilation target for high-level languages. It runs in browsers at near-native speed and is expanding to server-side, edge computing, and plugin systems.

WASM is not a replacement for JavaScript. It is a complement — a way to run compute-intensive code (image processing, physics simulation, cryptography, video encoding) at speeds JavaScript cannot match, while JavaScript handles the DOM, network requests, and application logic.

Understanding when and how to use WASM is increasingly important as it moves beyond the browser into server-side runtimes, edge functions, and universal plugin systems.

**Related**: [Browser Rendering Pipeline](/frontend-engineering/browser-rendering) | [Web Performance](/frontend-engineering/web-performance) | [Edge Computing](/performance/edge-computing/)

---

## How WebAssembly Works

### The Compilation Pipeline

```
Source Code (Rust, C++, Go, etc.)
    ↓
Compiler (rustc, Emscripten, TinyGo)
    ↓
.wasm binary (WebAssembly module)
    ↓
Browser/Runtime loads and validates
    ↓
Compiled to native machine code (JIT or AOT)
    ↓
Executed at near-native speed
```

### What Makes WASM Fast

| Property | Why It Matters |
|----------|---------------|
| **Compact binary format** | Smaller than minified JS, faster to parse |
| **Predictable types** | No type coercion, no JIT deoptimization |
| **Linear memory model** | Simple flat memory, no GC pauses |
| **Streaming compilation** | Compiled as it downloads (no parse-then-compile) |
| **Near-native execution** | Maps closely to CPU instructions |
| **Validation before execution** | Caught errors upfront, no runtime type checks |

### Binary Format

WASM is a stack-based virtual machine with a binary encoding:

```wasm
;; WAT (WebAssembly Text Format) — human-readable version
(module
  (func $add (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add
  )
  (export "add" (func $add))
)
```

The binary version of this is approximately 30 bytes. The equivalent JavaScript function plus V8's optimization overhead is orders of magnitude more complex.

### Type System

WASM has exactly four value types:

| Type | Description |
|------|-------------|
| `i32` | 32-bit integer |
| `i64` | 64-bit integer |
| `f32` | 32-bit float (IEEE 754) |
| `f64` | 64-bit float (IEEE 754) |

There are also `v128` (SIMD), `funcref`, and `externref` in newer proposals. Notably, there are no strings, objects, or arrays — those must be managed in linear memory.

---

## Linear Memory

WASM modules operate on a contiguous, byte-addressable block of memory called **linear memory**. This is fundamentally different from JavaScript's garbage-collected heap.

```javascript
// JavaScript side — create and share memory
const memory = new WebAssembly.Memory({ initial: 1, maximum: 10 }); // 1 page = 64KB

// WASM module writes to memory
// JavaScript reads from the same memory
const buffer = new Uint8Array(memory.buffer);
```

### Passing Complex Data

Since WASM only understands numbers, complex data (strings, arrays, structs) must be serialized into linear memory:

```javascript
// Passing a string to WASM
function passString(wasmInstance, str) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);

  // Allocate memory in WASM (exported alloc function)
  const ptr = wasmInstance.exports.alloc(encoded.length);

  // Write bytes to WASM memory
  const memory = new Uint8Array(wasmInstance.exports.memory.buffer);
  memory.set(encoded, ptr);

  // Call WASM function with pointer and length
  return wasmInstance.exports.processString(ptr, encoded.length);
}

// Reading a string from WASM
function readString(wasmInstance, ptr, len) {
  const memory = new Uint8Array(wasmInstance.exports.memory.buffer);
  const bytes = memory.slice(ptr, ptr + len);
  return new TextDecoder().decode(bytes);
}
```

::: warning
When WASM memory grows (via `memory.grow()`), the underlying `ArrayBuffer` is detached and replaced. Any `Uint8Array` views you hold become invalid. Always re-create views from `memory.buffer` after potential growth.
:::

---

## Using WASM in the Browser

### Loading a WASM Module

```javascript
// Method 1: Streaming compilation (preferred — compiles as it downloads)
const { instance, module } = await WebAssembly.instantiateStreaming(
  fetch('module.wasm'),
  importObject
);

// Method 2: From ArrayBuffer
const response = await fetch('module.wasm');
const bytes = await response.arrayBuffer();
const { instance, module } = await WebAssembly.instantiate(bytes, importObject);

// Method 3: Compile then instantiate (reuse compiled module)
const module = await WebAssembly.compileStreaming(fetch('module.wasm'));
const instance1 = await WebAssembly.instantiate(module, imports1);
const instance2 = await WebAssembly.instantiate(module, imports2);
```

### Import Object (JS functions callable from WASM)

```javascript
const importObject = {
  env: {
    // WASM can call these JavaScript functions
    consoleLog: (ptr, len) => {
      const str = readString(instance, ptr, len);
      console.log(str);
    },
    getTimestamp: () => Date.now(),
    abort: (msg, file, line, col) => {
      throw new Error(`WASM abort at ${file}:${line}:${col}`);
    },
  },
  js: {
    memory: new WebAssembly.Memory({ initial: 256 }),
    table: new WebAssembly.Table({ initial: 0, element: 'anyfunc' }),
  },
};
```

---

## Use Cases

### 1. Browser Compute

| Application | Examples |
|------------|----------|
| Image/video processing | Squoosh (image compression), FFmpeg.wasm |
| Games | Unity, Unreal Engine web exports |
| CAD/3D rendering | Figma (C++ rendering engine), AutoCAD Web |
| Audio processing | Soundtrap, Amped Studio |
| Scientific computing | Molecular simulations, data visualization |
| Cryptography | Password hashing (Argon2), encryption |

### 2. Edge Computing

WASM modules start in microseconds (vs milliseconds for containers), making them ideal for edge runtimes:

```
Cold start comparison:
  Container:     100-500ms
  V8 Isolate:    5-10ms
  WASM module:   0.1-1ms
```

Platforms using WASM at the edge:
- **Cloudflare Workers** — WASM modules alongside JavaScript
- **Fastly Compute** — WASM-first edge platform
- **Fermyon Spin** — WASM microservices framework
- **Vercel Edge Functions** — WASM support via Edge Runtime

### 3. Plugin Systems

WASM provides a sandboxed execution environment for untrusted code:

| Platform | How They Use WASM |
|----------|------------------|
| **Envoy Proxy** | WASM filters for custom proxy logic |
| **Shopify** | WASM plugins for checkout customization |
| **Figma** | WASM plugins for design tools |
| **Zed Editor** | WASM extensions for editor functionality |
| **OPA (Open Policy Agent)** | Compile policies to WASM for fast evaluation |

### 4. Blockchain

Smart contracts on chains like NEAR, Polkadot, and Cosmos compile to WASM for deterministic, sandboxed execution.

---

## WASI (WebAssembly System Interface)

WASI is a standard system interface for WASM modules running outside the browser. It provides capabilities like file system access, networking, clocks, and random number generation — but in a capability-based security model.

```
Traditional process:    WASI module:
  Full OS access         Only granted capabilities
  Ambient authority      Explicit permissions
  Can read any file      Can only read passed file descriptors
```

### Running WASM with WASI

```bash
# Using Wasmtime runtime
wasmtime run --dir ./data module.wasm -- --input data/file.txt

# Using Wasmer
wasmer run module.wasm --dir ./data

# Using Node.js (experimental)
node --experimental-wasi-unstable-preview1 run.mjs
```

```javascript
// Node.js WASI example
import { WASI } from 'node:wasi';
import { readFile } from 'node:fs/promises';

const wasi = new WASI({
  version: 'preview1',
  args: ['module', '--input', 'data.txt'],
  env: { HOME: '/home/user' },
  preopens: { '/data': './data' },  // Grant access to ./data as /data
});

const wasm = await WebAssembly.compile(await readFile('module.wasm'));
const instance = await WebAssembly.instantiate(wasm, wasi.getImportObject());
wasi.start(instance);
```

### WASI Capabilities

| Capability | API | Status |
|------------|-----|--------|
| File system | `wasi:filesystem` | Stable (preview1) |
| Clocks | `wasi:clocks` | Stable |
| Random | `wasi:random` | Stable |
| Sockets | `wasi:sockets` | Preview2 |
| HTTP | `wasi:http` | Preview2 |
| Key-value store | `wasi:keyvalue` | Proposal |
| Blob store | `wasi:blobstore` | Proposal |

---

## Compiling to WASM

### Rust (Best WASM Support)

```bash
# Setup
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# Build for browser (with wasm-bindgen)
wasm-pack build --target web

# Build for Node.js
wasm-pack build --target nodejs

# Build for WASI
rustup target add wasm32-wasi
cargo build --target wasm32-wasi --release
```

::: code-group

```rust
// src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fibonacci(n: u32) -> u64 {
    if n <= 1 {
        return n as u64;
    }
    let mut a: u64 = 0;
    let mut b: u64 = 1;
    for _ in 2..=n {
        let temp = a + b;
        a = b;
        b = temp;
    }
    b
}

#[wasm_bindgen]
pub struct ImageProcessor {
    width: u32,
    height: u32,
    pixels: Vec<u8>,
}

#[wasm_bindgen]
impl ImageProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            pixels: vec![0; (width * height * 4) as usize],
        }
    }

    pub fn grayscale(&mut self) {
        for chunk in self.pixels.chunks_exact_mut(4) {
            let gray = (0.299 * chunk[0] as f32
                + 0.587 * chunk[1] as f32
                + 0.114 * chunk[2] as f32) as u8;
            chunk[0] = gray;
            chunk[1] = gray;
            chunk[2] = gray;
        }
    }

    pub fn pixels_ptr(&self) -> *const u8 {
        self.pixels.as_ptr()
    }
}
```

```javascript
// JavaScript usage (with wasm-pack generated bindings)
import init, { fibonacci, ImageProcessor } from './pkg/my_module.js';

await init();

console.log(fibonacci(50));  // 12586269025

const processor = new ImageProcessor(1920, 1080);
processor.grayscale();
```

:::

### Go (via TinyGo)

```bash
# Standard Go (large output, includes Go runtime)
GOOS=js GOARCH=wasm go build -o main.wasm main.go

# TinyGo (much smaller output, recommended)
tinygo build -o main.wasm -target wasm main.go

# For WASI
tinygo build -o main.wasm -target wasi main.go
```

```go
// main.go (TinyGo)
package main

import "syscall/js"

func fibonacci(this js.Value, args []js.Value) interface{} {
    n := args[0].Int()
    a, b := 0, 1
    for i := 0; i < n; i++ {
        a, b = b, a+b
    }
    return a
}

func main() {
    js.Global().Set("fibonacci", js.FuncOf(fibonacci))
    select {} // Keep the Go runtime alive
}
```

::: warning
Standard Go's WASM output includes the entire Go runtime and garbage collector, resulting in modules of 2-10MB+. Use TinyGo for browser WASM — it produces modules of 10-500KB. TinyGo does not support all Go features (reflection, goroutine scaling).
:::

### C/C++ (via Emscripten)

```bash
# Install Emscripten
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest

# Compile C to WASM
emcc -O3 -s WASM=1 -o output.js input.c

# With exported functions
emcc -O3 -s WASM=1 -s EXPORTED_FUNCTIONS='["_add","_multiply"]' \
     -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
     -o output.js input.c
```

```c
// input.c
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE
int add(int a, int b) {
    return a + b;
}

EMSCRIPTEN_KEEPALIVE
void process_image(unsigned char* pixels, int width, int height) {
    for (int i = 0; i < width * height * 4; i += 4) {
        unsigned char gray = (unsigned char)(
            0.299f * pixels[i] +
            0.587f * pixels[i+1] +
            0.114f * pixels[i+2]
        );
        pixels[i] = gray;
        pixels[i+1] = gray;
        pixels[i+2] = gray;
    }
}
```

---

## WASM vs JavaScript Performance

### When WASM Wins

| Workload | WASM Speedup | Why |
|----------|-------------|-----|
| Image processing | 2-10x | Tight loops on typed data, SIMD |
| Crypto (Argon2, SHA) | 5-20x | Bitwise ops, no GC, constant-time |
| Physics simulation | 3-8x | Math-heavy, predictable memory |
| Video codec | 5-15x | Byte-level manipulation, SIMD |
| Compression (zstd) | 3-10x | Pointer arithmetic, bit manipulation |

### When JavaScript Wins (or Ties)

| Workload | Why |
|----------|-----|
| DOM manipulation | WASM cannot access the DOM directly (must call through JS) |
| String-heavy processing | JS strings are optimized; WASM must encode/decode |
| Small functions | JS-WASM boundary call overhead dominates |
| JSON parsing | V8's JSON.parse is extremely optimized native code |
| Async I/O | JavaScript's event loop is purpose-built for this |

### The JS-WASM Boundary

Every call between JavaScript and WASM has overhead: argument conversion, stack switching, and type marshaling. This cost is small per call but adds up:

```javascript
// BAD: call WASM per pixel (millions of boundary crossings)
for (let i = 0; i < pixels.length; i++) {
  pixels[i] = wasmInstance.exports.processPixel(pixels[i]);
}

// GOOD: pass entire buffer, process in WASM (one boundary crossing)
const ptr = wasmInstance.exports.alloc(pixels.length);
new Uint8Array(wasmInstance.exports.memory.buffer).set(pixels, ptr);
wasmInstance.exports.processAllPixels(ptr, pixels.length);
```

::: tip
The general rule: pass large chunks of data to WASM, let it process everything, then read results back. Minimize boundary crossings. Think of WASM calls like database queries — batch your work.
:::

---

## Module Size Optimization

| Technique | Effect |
|-----------|--------|
| Compile with `-O3` or `--release` | Standard optimization |
| Use `wasm-opt -Oz` (Binaryen) | Aggressive size optimization |
| Strip debug info | Remove DWARF sections |
| Use TinyGo instead of Go | 10x smaller modules |
| Use `wasm-bindgen` (Rust) | Only include used bindings |
| Enable LTO (Link Time Optimization) | Cross-module dead code elimination |
| Use `wee_alloc` (Rust) | Smaller allocator (trades speed for size) |

```bash
# Rust optimization in Cargo.toml
[profile.release]
opt-level = 'z'      # Optimize for size
lto = true            # Link-time optimization
codegen-units = 1     # Better optimization, slower compile
strip = true          # Strip debug symbols

# Post-build optimization
wasm-opt -Oz -o optimized.wasm input.wasm
```

---

## The Future of WASM

| Proposal | Impact |
|----------|--------|
| **Component Model** | Compose WASM modules like packages; language-agnostic interfaces |
| **Garbage Collection** | Native GC support for Java, C#, Kotlin, Dart targeting WASM |
| **Threads** | Shared memory + atomics for true parallelism |
| **SIMD** | 128-bit SIMD operations (shipped in all major browsers) |
| **Exception Handling** | Native try/catch instead of workarounds |
| **Tail Calls** | Efficient recursive algorithms |
| **Stack Switching** | Coroutines, green threads, async/await |

The Component Model is the most transformative proposal. It enables a universal plugin system where a Rust module can call a Python module can call a Go module — all through strongly-typed interfaces, with no serialization overhead.

---

*Last updated: 2026-03-20*
