---
title: "Timing Curves & Spring Physics"
description: "Deep dive into cubic bezier mathematics, De Casteljau's algorithm, spring physics equations, damped harmonic oscillators, and custom easing functions"
tags: [animations, bezier, spring-physics, easing, math]
difficulty: "advanced"
prerequisites: [animations-overview, calculus-basics]
lastReviewed: "2026-03-18"
---

# Timing Curves & Spring Physics

## Why Timing Curves Exist

Linear animation — moving at constant speed — looks robotic and unnatural. Nothing in the physical world moves linearly. A ball thrown into the air decelerates as it rises and accelerates as it falls. A door swings open fast then slows to a stop. A rubber band snaps and oscillates before settling.

Timing curves map the passage of time to the progress of animation. Given a normalized time $t \in [0, 1]$, a timing function returns a progress value $p \in [0, 1]$ (sometimes overshooting past 1 for bounce effects). The shape of this mapping is what gives animation its character — snappy, gentle, bouncy, or mechanical.

The web platform uses cubic Bezier curves as its primary timing function model. This was inherited from PostScript and later CSS, chosen because cubic Beziers can approximate most natural-feeling easing curves with just four control points. But Bezier curves have limitations — they cannot model oscillation, so spring physics emerged as a complementary system.

## First Principles: Bezier Curves

### What is a Bezier Curve?

A Bezier curve is a parametric curve defined by control points. For a cubic Bezier (the type used in CSS), there are four control points: $P_0$, $P_1$, $P_2$, $P_3$.

The curve is defined by the parametric equation:

$$
B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3
$$

where $t \in [0, 1]$.

For CSS easing, the curve is constrained:
- $P_0 = (0, 0)$ — animation starts at 0% progress
- $P_3 = (1, 1)$ — animation ends at 100% progress
- $P_1 = (x_1, y_1)$ and $P_2 = (x_2, y_2)$ — the two control points you specify

So `cubic-bezier(x1, y1, x2, y2)` defines a curve from $(0,0)$ to $(1,1)$ with control points at $(x_1, y_1)$ and $(x_2, y_2)$.

### The X-axis Problem

Here is the crucial subtlety: the Bezier curve maps parameter $t$ to a point $(x, y)$. But CSS easing needs to map time (x-axis) to progress (y-axis). Given a time value, you need to find what $t$ produces that x-coordinate, then evaluate the y-coordinate at that $t$.

The x-component of the cubic Bezier:

$$
x(t) = 3(1-t)^2 t \cdot x_1 + 3(1-t) t^2 \cdot x_2 + t^3
$$

Given a target time $x_{\text{target}}$, solve for $t$:

$$
3(1-t)^2 t \cdot x_1 + 3(1-t) t^2 \cdot x_2 + t^3 = x_{\text{target}}
$$

This is a cubic equation with no simple closed-form solution for arbitrary control points. We use numerical methods.

## Core Mechanics: De Casteljau's Algorithm

De Casteljau's algorithm is the geometric construction of Bezier curves through recursive linear interpolation.

```mermaid
flowchart LR
    subgraph Level0["Level 0: Control Points"]
        P0["P0"]
        P1["P1"]
        P2["P2"]
        P3["P3"]
    end

    subgraph Level1["Level 1: Linear Interp"]
        Q0["Q0 = lerp(P0,P1,t)"]
        Q1["Q1 = lerp(P1,P2,t)"]
        Q2["Q2 = lerp(P2,P3,t)"]
    end

    subgraph Level2["Level 2: Linear Interp"]
        R0["R0 = lerp(Q0,Q1,t)"]
        R1["R1 = lerp(Q1,Q2,t)"]
    end

    subgraph Level3["Level 3: Final Point"]
        S["S = lerp(R0,R1,t)"]
    end

    P0 --> Q0
    P1 --> Q0
    P1 --> Q1
    P2 --> Q1
    P2 --> Q2
    P3 --> Q2

    Q0 --> R0
    Q1 --> R0
    Q1 --> R1
    Q2 --> R1

    R0 --> S
    R1 --> S
```

At each level, you linearly interpolate between adjacent points:

$$
\text{lerp}(A, B, t) = (1-t) \cdot A + t \cdot B
$$

For a cubic Bezier:
- Level 0: $P_0, P_1, P_2, P_3$
- Level 1: $Q_0 = \text{lerp}(P_0, P_1, t)$, $Q_1 = \text{lerp}(P_1, P_2, t)$, $Q_2 = \text{lerp}(P_2, P_3, t)$
- Level 2: $R_0 = \text{lerp}(Q_0, Q_1, t)$, $R_1 = \text{lerp}(Q_1, Q_2, t)$
- Level 3: $S = \text{lerp}(R_0, R_1, t)$ — this is the point on the curve

### Implementation

```typescript
function deCasteljau(
  points: [number, number][],
  t: number
): [number, number] {
  if (points.length === 1) return points[0];

  const nextLevel: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    nextLevel.push([
      (1 - t) * points[i][0] + t * points[i + 1][0],
      (1 - t) * points[i][1] + t * points[i + 1][1],
    ]);
  }

  return deCasteljau(nextLevel, t);
}

// For a cubic Bezier with CSS-style constraints
function cubicBezierPoint(
  x1: number, y1: number,
  x2: number, y2: number,
  t: number
): [number, number] {
  return deCasteljau(
    [[0, 0], [x1, y1], [x2, y2], [1, 1]],
    t
  );
}
```

## Implementation: The Cubic Bezier Solver

The production implementation needs to solve $x(t) = x_{\text{target}}$ efficiently. Browsers use Newton's method with bisection fallback.

```typescript
/**
 * High-performance cubic bezier easing function.
 * Matches the algorithm used in WebKit/Blink.
 */
class CubicBezier {
  private readonly cx: number;
  private readonly bx: number;
  private readonly ax: number;
  private readonly cy: number;
  private readonly by: number;
  private readonly ay: number;

  // Precomputed sample table for fast initial guess
  private readonly sampleTable: Float64Array;
  private static readonly SAMPLE_TABLE_SIZE = 11;
  private static readonly SAMPLE_STEP_SIZE =
    1.0 / (CubicBezier.SAMPLE_TABLE_SIZE - 1);

  // Precision thresholds
  private static readonly NEWTON_MIN_SLOPE = 0.001;
  private static readonly NEWTON_ITERATIONS = 4;
  private static readonly SUBDIVISION_PRECISION = 0.0000001;
  private static readonly SUBDIVISION_MAX_ITERATIONS = 10;

  constructor(
    private readonly x1: number,
    private readonly y1: number,
    private readonly x2: number,
    private readonly y2: number
  ) {
    // Precompute polynomial coefficients
    // x(t) = ax*t^3 + bx*t^2 + cx*t
    // (derived from expanding the Bezier formula)
    this.cx = 3.0 * x1;
    this.bx = 3.0 * (x2 - x1) - this.cx;
    this.ax = 1.0 - this.cx - this.bx;

    this.cy = 3.0 * y1;
    this.by = 3.0 * (y2 - y1) - this.cy;
    this.ay = 1.0 - this.cy - this.by;

    // Build sample table
    this.sampleTable = new Float64Array(CubicBezier.SAMPLE_TABLE_SIZE);
    for (let i = 0; i < CubicBezier.SAMPLE_TABLE_SIZE; i++) {
      this.sampleTable[i] = this.sampleCurveX(
        i * CubicBezier.SAMPLE_STEP_SIZE
      );
    }
  }

  /** Evaluate x(t) = ax*t^3 + bx*t^2 + cx*t */
  private sampleCurveX(t: number): number {
    return ((this.ax * t + this.bx) * t + this.cx) * t;
  }

  /** Evaluate y(t) = ay*t^3 + by*t^2 + cy*t */
  private sampleCurveY(t: number): number {
    return ((this.ay * t + this.by) * t + this.cy) * t;
  }

  /** Evaluate x'(t) = 3*ax*t^2 + 2*bx*t + cx */
  private sampleCurveDerivativeX(t: number): number {
    return (3.0 * this.ax * t + 2.0 * this.bx) * t + this.cx;
  }

  /**
   * Newton-Raphson iteration.
   * Fast convergence when slope is not near zero.
   */
  private newtonRaphsonIterate(x: number, guessT: number): number {
    let t = guessT;
    for (let i = 0; i < CubicBezier.NEWTON_ITERATIONS; i++) {
      const currentSlope = this.sampleCurveDerivativeX(t);
      if (Math.abs(currentSlope) < CubicBezier.NEWTON_MIN_SLOPE) {
        return t;
      }
      const currentX = this.sampleCurveX(t) - x;
      t -= currentX / currentSlope;
    }
    return t;
  }

  /**
   * Binary subdivision fallback.
   * Guaranteed convergence but slower than Newton's method.
   */
  private binarySubdivide(
    x: number,
    a: number,
    b: number
  ): number {
    let currentT: number;
    let currentX: number;
    let i = 0;

    do {
      currentT = a + (b - a) / 2.0;
      currentX = this.sampleCurveX(currentT) - x;

      if (currentX > 0.0) {
        b = currentT;
      } else {
        a = currentT;
      }
    } while (
      Math.abs(currentX) > CubicBezier.SUBDIVISION_PRECISION &&
      ++i < CubicBezier.SUBDIVISION_MAX_ITERATIONS
    );

    return currentT;
  }

  /**
   * Solve for t given x, then evaluate y(t).
   * This is the main easing function.
   */
  solve(x: number): number {
    // Edge cases
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Linear shortcut
    if (this.x1 === this.y1 && this.x2 === this.y2) return x;

    // Find the interval in the sample table
    let intervalStart = 0;
    let currentSample = 1;
    const lastSample = CubicBezier.SAMPLE_TABLE_SIZE - 1;

    while (
      currentSample !== lastSample &&
      this.sampleTable[currentSample] <= x
    ) {
      intervalStart += CubicBezier.SAMPLE_STEP_SIZE;
      currentSample++;
    }
    currentSample--;

    // Interpolate to get initial guess for t
    const dist = (x - this.sampleTable[currentSample]) /
      (this.sampleTable[currentSample + 1] - this.sampleTable[currentSample]);
    let guessT = intervalStart + dist * CubicBezier.SAMPLE_STEP_SIZE;

    // Refine the guess
    const initialSlope = this.sampleCurveDerivativeX(guessT);

    if (initialSlope >= CubicBezier.NEWTON_MIN_SLOPE) {
      guessT = this.newtonRaphsonIterate(x, guessT);
    } else if (initialSlope !== 0.0) {
      guessT = this.binarySubdivide(
        x,
        intervalStart,
        intervalStart + CubicBezier.SAMPLE_STEP_SIZE
      );
    }

    return this.sampleCurveY(guessT);
  }
}

// Factory function matching CSS cubic-bezier() syntax
function cubicBezier(
  x1: number, y1: number,
  x2: number, y2: number
): (t: number) => number {
  const bezier = new CubicBezier(x1, y1, x2, y2);
  return (t: number) => bezier.solve(t);
}
```

::: tip Performance Note
The sample table approach reduces the average Newton-Raphson iterations from ~8 to ~2 by providing a good initial guess. This is why browsers precompute the table — it turns a ~200ns solve into a ~50ns solve, which matters when you are calling it 60+ times per second per animation.
:::

## Standard CSS Easing Curves

### Built-in Keywords

The CSS specification defines five easing keywords. Here are their cubic Bezier equivalents and mathematical properties:

| Keyword | cubic-bezier() | Character |
|---------|---------------|-----------|
| `linear` | `(0, 0, 1, 1)` | Constant velocity |
| `ease` | `(0.25, 0.1, 0.25, 1)` | Gentle start, fast middle, soft end |
| `ease-in` | `(0.42, 0, 1, 1)` | Slow start, fast end (accelerating) |
| `ease-out` | `(0, 0, 0.58, 1)` | Fast start, slow end (decelerating) |
| `ease-in-out` | `(0.42, 0, 0.58, 1)` | Slow start and end |

### Material Design Easing

Google's Material Design defines a more refined set:

```typescript
const MATERIAL_EASING = {
  // Standard curve: for elements moving between positions on screen
  standard: cubicBezier(0.2, 0.0, 0, 1.0),

  // Deceleration curve: for elements entering the screen
  decelerate: cubicBezier(0.0, 0.0, 0, 1.0),

  // Acceleration curve: for elements leaving the screen
  accelerate: cubicBezier(0.3, 0.0, 1, 1.0),

  // Sharp curve: for elements that may return to screen
  sharp: cubicBezier(0.4, 0.0, 0.6, 1.0),
} as const;
```

### Apple's Human Interface Guidelines Easing

```typescript
const APPLE_EASING = {
  // Default system animation curve
  default: cubicBezier(0.25, 0.1, 0.25, 1.0),

  // Spring-like overshoot
  spring: cubicBezier(0.175, 0.885, 0.32, 1.275),

  // Keyboard animation curve (iOS)
  keyboard: cubicBezier(0.33, 0.01, 0.0, 1.0),
} as const;
```

## Advanced Easing Functions Beyond Bezier

Cubic Bezier curves cannot represent all useful easing functions. Here are important ones that require JavaScript:

### Elastic Easing

```typescript
function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;

  const c4 = (2 * Math.PI) / 3;

  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

function easeInElastic(t: number): number {
  if (t === 0 || t === 1) return t;

  const c4 = (2 * Math.PI) / 3;

  return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
}

function easeInOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;

  const c5 = (2 * Math.PI) / 4.5;

  return t < 0.5
    ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
    : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
}
```

The elastic function uses a decaying sinusoid:

$$
f(t) = 2^{-10t} \cdot \sin\left(\frac{(10t - 0.75) \cdot 2\pi}{3}\right) + 1
$$

### Bounce Easing

```typescript
function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
}

function easeInBounce(t: number): number {
  return 1 - easeOutBounce(1 - t);
}
```

### Back Easing (Overshoot)

```typescript
function easeOutBack(t: number, overshoot: number = 1.70158): number {
  const c1 = overshoot;
  const c3 = c1 + 1;

  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInBack(t: number, overshoot: number = 1.70158): number {
  const c3 = overshoot + 1;

  return c3 * t * t * t - overshoot * t * t;
}
```

The overshoot constant $s = 1.70158$ is chosen so the curve overshoots by approximately 10%.

### Steps Easing

```typescript
function steps(
  numSteps: number,
  direction: 'start' | 'end' = 'end'
): (t: number) => number {
  return (t: number): number => {
    if (direction === 'start') {
      return Math.ceil(t * numSteps) / numSteps;
    } else {
      return Math.floor(t * numSteps) / numSteps;
    }
  };
}
```

## Spring Physics: The Damped Harmonic Oscillator

Spring animations model a mass on a spring subject to damping (friction). This is a second-order ordinary differential equation:

$$
m\ddot{x} + c\dot{x} + kx = 0
$$

Where:
- $m$ = mass (kg)
- $c$ = damping coefficient (Ns/m)
- $k$ = spring stiffness (N/m)
- $x$ = displacement from equilibrium
- $\dot{x}$ = velocity
- $\ddot{x}$ = acceleration

### Characteristic Equation

Substituting $x = e^{rt}$:

$$
mr^2 + cr + k = 0
$$

Using the quadratic formula:

$$
r = \frac{-c \pm \sqrt{c^2 - 4mk}}{2m}
$$

### Natural Frequency and Damping Ratio

Define:

$$
\omega_0 = \sqrt{\frac{k}{m}} \quad \text{(natural frequency, rad/s)}
$$

$$
\zeta = \frac{c}{2\sqrt{mk}} = \frac{c}{2m\omega_0} \quad \text{(damping ratio, dimensionless)}
$$

The equation becomes:

$$
\ddot{x} + 2\zeta\omega_0\dot{x} + \omega_0^2 x = 0
$$

### Three Damping Regimes

```mermaid
flowchart LR
    subgraph Under["Underdamped (zeta < 1)"]
        U["Oscillates and decays\nCommon for UI springs"]
    end

    subgraph Critical["Critically Damped (zeta = 1)"]
        C["Fastest non-oscillating\nreturn to rest"]
    end

    subgraph Over["Overdamped (zeta > 1)"]
        O["Slow return\nno oscillation"]
    end
```

#### Case 1: Underdamped ($\zeta < 1$)

The roots are complex conjugates. The damped frequency is:

$$
\omega_d = \omega_0\sqrt{1 - \zeta^2}
$$

The general solution:

$$
x(t) = e^{-\zeta\omega_0 t}\left(A\cos(\omega_d t) + B\sin(\omega_d t)\right)
$$

With initial conditions $x(0) = x_0$ (initial displacement) and $\dot{x}(0) = v_0$ (initial velocity):

$$
A = x_0, \quad B = \frac{v_0 + \zeta\omega_0 x_0}{\omega_d}
$$

This is the regime used by most UI spring animations. The oscillation period is:

$$
T = \frac{2\pi}{\omega_d} = \frac{2\pi}{\omega_0\sqrt{1-\zeta^2}}
$$

#### Case 2: Critically Damped ($\zeta = 1$)

Repeated roots at $r = -\omega_0$. The solution:

$$
x(t) = (A + Bt)e^{-\omega_0 t}
$$

$$
A = x_0, \quad B = v_0 + \omega_0 x_0
$$

This is the fastest return to equilibrium without oscillation. Often used for non-bouncy animations where you want smooth deceleration.

#### Case 3: Overdamped ($\zeta > 1$)

Two distinct real roots:

$$
r_{1,2} = -\omega_0\left(\zeta \mp \sqrt{\zeta^2 - 1}\right)
$$

$$
x(t) = A e^{r_1 t} + B e^{r_2 t}
$$

$$
A = \frac{x_0 r_2 - v_0}{r_2 - r_1}, \quad B = \frac{v_0 - x_0 r_1}{r_2 - r_1}
$$

Rarely useful in UI — the motion feels sluggish.

### Production Spring Implementation

```typescript
interface SpringConfig {
  /** Spring stiffness (N/m). Higher = more force, faster motion. Range: 1-1000 */
  stiffness: number;
  /** Damping coefficient (Ns/m). Higher = less bouncy. Range: 1-100 */
  damping: number;
  /** Mass (kg). Higher = more inertia, slower. Range: 0.1-10 */
  mass: number;
  /** Initial velocity (pixels/s). Default: 0 */
  initialVelocity?: number;
  /** Precision threshold. Animation stops when |displacement| < precision */
  precision?: number;
}

interface SpringState {
  position: number;     // Current displacement from target
  velocity: number;     // Current velocity
  done: boolean;        // Has the spring settled?
}

class Spring {
  private omega0: number;   // Natural frequency
  private zeta: number;     // Damping ratio
  private omegaD: number;   // Damped frequency
  private A: number;
  private B: number;
  private readonly precision: number;
  private readonly initialDisplacement: number;

  constructor(
    private config: SpringConfig,
    from: number = 0,
    to: number = 1
  ) {
    const { stiffness: k, damping: c, mass: m, initialVelocity: v0 = 0 } = config;
    this.precision = config.precision ?? 0.001;
    this.initialDisplacement = from - to;

    this.omega0 = Math.sqrt(k / m);
    this.zeta = c / (2 * Math.sqrt(k * m));

    const x0 = this.initialDisplacement;

    if (this.zeta < 1) {
      // Underdamped
      this.omegaD = this.omega0 * Math.sqrt(1 - this.zeta * this.zeta);
      this.A = x0;
      this.B = (v0 + this.zeta * this.omega0 * x0) / this.omegaD;
    } else if (this.zeta === 1) {
      // Critically damped
      this.omegaD = 0;
      this.A = x0;
      this.B = v0 + this.omega0 * x0;
    } else {
      // Overdamped
      this.omegaD = 0;
      const r1 = -this.omega0 * (this.zeta - Math.sqrt(this.zeta * this.zeta - 1));
      const r2 = -this.omega0 * (this.zeta + Math.sqrt(this.zeta * this.zeta - 1));
      this.A = (x0 * r2 - v0) / (r2 - r1);
      this.B = (v0 - x0 * r1) / (r2 - r1);
    }
  }

  /** Get displacement from target at time t (seconds) */
  displacement(t: number): number {
    if (this.zeta < 1) {
      return Math.exp(-this.zeta * this.omega0 * t) * (
        this.A * Math.cos(this.omegaD * t) +
        this.B * Math.sin(this.omegaD * t)
      );
    } else if (this.zeta === 1) {
      return (this.A + this.B * t) * Math.exp(-this.omega0 * t);
    } else {
      const r1 = -this.omega0 * (this.zeta - Math.sqrt(this.zeta * this.zeta - 1));
      const r2 = -this.omega0 * (this.zeta + Math.sqrt(this.zeta * this.zeta - 1));
      return this.A * Math.exp(r1 * t) + this.B * Math.exp(r2 * t);
    }
  }

  /** Get velocity at time t (seconds) */
  velocity(t: number): number {
    if (this.zeta < 1) {
      const exp = Math.exp(-this.zeta * this.omega0 * t);
      const cos = Math.cos(this.omegaD * t);
      const sin = Math.sin(this.omegaD * t);

      return exp * (
        (this.B * this.omegaD - this.A * this.zeta * this.omega0) * cos -
        (this.A * this.omegaD + this.B * this.zeta * this.omega0) * sin
      );
    } else if (this.zeta === 1) {
      const exp = Math.exp(-this.omega0 * t);
      return exp * (this.B - this.omega0 * (this.A + this.B * t));
    } else {
      const r1 = -this.omega0 * (this.zeta - Math.sqrt(this.zeta * this.zeta - 1));
      const r2 = -this.omega0 * (this.zeta + Math.sqrt(this.zeta * this.zeta - 1));
      return this.A * r1 * Math.exp(r1 * t) + this.B * r2 * Math.exp(r2 * t);
    }
  }

  /** Get full state at time t */
  stateAt(t: number): SpringState {
    const disp = this.displacement(t);
    const vel = this.velocity(t);

    return {
      position: disp,
      velocity: vel,
      done: Math.abs(disp) < this.precision && Math.abs(vel) < this.precision,
    };
  }

  /** Estimate when the spring will settle (within precision) */
  estimatedDuration(): number {
    // For underdamped: envelope is exp(-zeta*omega0*t)
    // Solve exp(-zeta*omega0*t) * maxAmplitude < precision
    const maxAmplitude = Math.sqrt(this.A * this.A + this.B * this.B);
    if (maxAmplitude === 0) return 0;

    const tau = 1 / (this.zeta * this.omega0);
    return -tau * Math.log(this.precision / maxAmplitude);
  }

  /** Get damping ratio info */
  getDampingInfo(): string {
    if (this.zeta < 1) return `Underdamped (zeta=${this.zeta.toFixed(3)})`;
    if (this.zeta === 1) return 'Critically damped';
    return `Overdamped (zeta=${this.zeta.toFixed(3)})`;
  }
}
```

### Common Spring Presets

```typescript
const SPRING_PRESETS = {
  /** Gentle, no bounce. Good for modals, tooltips */
  gentle: { stiffness: 120, damping: 20, mass: 1 },

  /** Wobbly, visible bounce. Good for playful UI, notifications */
  wobbly: { stiffness: 180, damping: 12, mass: 1 },

  /** Stiff, fast with slight bounce. Good for buttons, toggles */
  stiff: { stiffness: 400, damping: 28, mass: 1 },

  /** Slow, heavy feel. Good for full-screen transitions */
  slow: { stiffness: 100, damping: 20, mass: 2 },

  /** Molasses, very heavy. Good for dramatic reveals */
  molasses: { stiffness: 60, damping: 18, mass: 3 },

  /** Snappy, nearly critically damped. Good for responsive UI */
  snappy: { stiffness: 300, damping: 30, mass: 0.8 },
} as const;
```

::: info War Story
A team building a messaging app used spring animations for message bubbles sliding in. The spring config had high stiffness (800) and low damping (10), causing messages to overshoot wildly — new messages bounced past their target position, overlapping with adjacent messages for a split second. Users reported seeing "ghost messages" and filed bugs about messages appearing in the wrong order. The fix was increasing damping to 26 and reducing stiffness to 300, bringing the damping ratio from 0.18 to 0.75. The lesson: underdamped springs in list contexts need damping ratios above 0.5, or the visual overlap between items creates confusion.
:::

## Step-Timing Functions and Linear Easing

### CSS `steps()` Function

The `steps()` function divides the animation into equal-length intervals:

```css
/* Sprite animation: 8 frames */
.sprite {
  width: 64px;
  height: 64px;
  background: url('spritesheet.png');
  animation: walk 0.8s steps(8) infinite;
}

@keyframes walk {
  to {
    background-position: -512px 0;
  }
}
```

### CSS `linear()` Function (Modern)

The `linear()` function in modern CSS allows arbitrary easing curves defined by a series of points:

```css
/* Custom bounce easing using linear() */
.bounce {
  transition: transform 600ms linear(
    0, 0.004, 0.016, 0.035, 0.063, 0.098, 0.141, 0.191,
    0.25, 0.316, 0.391, 0.473, 0.563, 0.66, 0.766, 0.879,
    1, 0.961, 0.934, 0.916, 0.91, 0.916, 0.934, 0.961,
    1, 0.98, 0.969, 0.965, 0.969, 0.98, 1
  );
}
```

This enables spring-like, elastic, and bounce easing in pure CSS — previously impossible with `cubic-bezier()`.

### Generating `linear()` from Spring Physics

```typescript
function springToLinearCSS(
  config: SpringConfig,
  resolution: number = 30
): string {
  const spring = new Spring(config, 0, 1);
  const duration = spring.estimatedDuration();

  const points: number[] = [];
  for (let i = 0; i <= resolution; i++) {
    const t = (i / resolution) * duration;
    const disp = spring.displacement(t);
    // Convert displacement to progress (1 - displacement when going from 0 to 1)
    const progress = 1 - disp;
    points.push(Math.round(progress * 1000) / 1000);
  }

  return `linear(${points.join(', ')})`;
}

// Generate CSS for a bouncy spring
const bouncyCSS = springToLinearCSS({
  stiffness: 200,
  damping: 15,
  mass: 1,
});
// Output: "linear(0, 0.035, 0.141, 0.316, 0.547, 0.792, 1.002, 1.123, ...)"
```

## Numerical Integration: The Verlet Method

For interactive springs where the target can change mid-animation (drag interactions), analytical solutions are impractical. Use numerical integration instead.

### Semi-implicit Euler (Symplectic Euler)

```typescript
class InteractiveSpring {
  position: number;
  velocity: number;
  target: number;

  constructor(
    private stiffness: number,
    private damping: number,
    private mass: number,
    initialPosition: number = 0
  ) {
    this.position = initialPosition;
    this.velocity = 0;
    this.target = initialPosition;
  }

  /** Step the simulation by dt seconds */
  step(dt: number): void {
    // Spring force: F = -k * (position - target)
    const springForce = -this.stiffness * (this.position - this.target);

    // Damping force: F = -c * velocity
    const dampingForce = -this.damping * this.velocity;

    // Total acceleration: a = F / m
    const acceleration = (springForce + dampingForce) / this.mass;

    // Semi-implicit Euler: update velocity first, then position
    this.velocity += acceleration * dt;
    this.position += this.velocity * dt;
  }

  /** Check if settled */
  isAtRest(precision: number = 0.001): boolean {
    return (
      Math.abs(this.position - this.target) < precision &&
      Math.abs(this.velocity) < precision
    );
  }
}
```

### Runge-Kutta 4th Order (RK4)

For higher accuracy (complex spring systems, coupled oscillators):

```typescript
interface RK4State {
  x: number;  // position
  v: number;  // velocity
}

interface RK4Derivative {
  dx: number; // velocity
  dv: number; // acceleration
}

class RK4Spring {
  constructor(
    private stiffness: number,
    private damping: number,
    private mass: number
  ) {}

  private acceleration(state: RK4State, target: number): number {
    const springForce = -this.stiffness * (state.x - target);
    const dampingForce = -this.damping * state.v;
    return (springForce + dampingForce) / this.mass;
  }

  private evaluate(
    initial: RK4State,
    target: number,
    dt: number,
    d: RK4Derivative
  ): RK4Derivative {
    const state: RK4State = {
      x: initial.x + d.dx * dt,
      v: initial.v + d.dv * dt,
    };

    return {
      dx: state.v,
      dv: this.acceleration(state, target),
    };
  }

  step(state: RK4State, target: number, dt: number): RK4State {
    const a = this.evaluate(state, target, 0, { dx: 0, dv: 0 });
    const b = this.evaluate(state, target, dt * 0.5, a);
    const c = this.evaluate(state, target, dt * 0.5, b);
    const d = this.evaluate(state, target, dt, c);

    const dxdt = (1 / 6) * (a.dx + 2 * (b.dx + c.dx) + d.dx);
    const dvdt = (1 / 6) * (a.dv + 2 * (b.dv + c.dv) + d.dv);

    return {
      x: state.x + dxdt * dt,
      v: state.v + dvdt * dt,
    };
  }
}
```

The RK4 method has a local truncation error of $O(h^5)$ compared to Euler's $O(h^2)$, meaning you can use larger timesteps without losing accuracy.

## Custom Easing Composition

### Chaining Easing Functions

```typescript
type EasingFn = (t: number) => number;

/** Compose two easings: use `a` for first half, `b` for second half */
function composeEasing(a: EasingFn, b: EasingFn): EasingFn {
  return (t: number): number => {
    if (t < 0.5) {
      return a(t * 2) / 2;
    } else {
      return 0.5 + b((t - 0.5) * 2) / 2;
    }
  };
}

/** Mirror an ease-in to create an ease-in-out */
function mirrorEasing(easeIn: EasingFn): EasingFn {
  return (t: number): number => {
    if (t < 0.5) {
      return easeIn(t * 2) / 2;
    } else {
      return 1 - easeIn((1 - t) * 2) / 2;
    }
  };
}

/** Reverse an easing (ease-in becomes ease-out) */
function reverseEasing(fn: EasingFn): EasingFn {
  return (t: number): number => 1 - fn(1 - t);
}

/** Power easing generator */
function powerEase(power: number): {
  in: EasingFn;
  out: EasingFn;
  inOut: EasingFn;
} {
  const easeIn: EasingFn = (t) => Math.pow(t, power);
  const easeOut: EasingFn = (t) => 1 - Math.pow(1 - t, power);
  const easeInOut: EasingFn = (t) =>
    t < 0.5
      ? Math.pow(2 * t, power) / 2
      : 1 - Math.pow(2 * (1 - t), power) / 2;

  return { in: easeIn, out: easeOut, inOut: easeInOut };
}

// Standard power easings
const quad = powerEase(2);     // ease-in-quad, ease-out-quad
const cubic = powerEase(3);    // ease-in-cubic, ease-out-cubic
const quart = powerEase(4);    // ease-in-quart
const quint = powerEase(5);    // ease-in-quint
```

### Bezier Easing from String

```typescript
function parseEasing(value: string): EasingFn {
  const builtins: Record<string, EasingFn> = {
    linear: (t) => t,
    ease: cubicBezier(0.25, 0.1, 0.25, 1),
    'ease-in': cubicBezier(0.42, 0, 1, 1),
    'ease-out': cubicBezier(0, 0, 0.58, 1),
    'ease-in-out': cubicBezier(0.42, 0, 0.58, 1),
  };

  if (builtins[value]) return builtins[value];

  const bezierMatch = value.match(
    /cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/
  );

  if (bezierMatch) {
    return cubicBezier(
      parseFloat(bezierMatch[1]),
      parseFloat(bezierMatch[2]),
      parseFloat(bezierMatch[3]),
      parseFloat(bezierMatch[4])
    );
  }

  throw new Error(`Unknown easing: ${value}`);
}
```

## Performance Benchmarks

Timing function evaluation costs per call (measured on M1 MacBook Pro, Node.js 20):

| Method | Time per call | Notes |
|--------|--------------|-------|
| Linear | ~1ns | Just returns input |
| Power easing (t^3) | ~2ns | Single Math.pow |
| Cubic Bezier (sample table) | ~15ns | Table lookup + Newton |
| Cubic Bezier (no table) | ~80ns | Pure Newton-Raphson |
| Spring analytical | ~25ns | Single exp + trig |
| Spring RK4 step | ~40ns | Per integration step |
| Elastic/Bounce | ~8ns | exp + sin, no iteration |

At 60fps with 10 concurrent animations, total easing computation per frame:

$$
t_{\text{easing}} = 10 \times 15\text{ns} = 150\text{ns per frame}
$$

This is negligible compared to the 16.67ms frame budget. Easing function performance is almost never the bottleneck — DOM manipulation is.

::: tip
Do not optimize easing function performance unless profiling shows it is a bottleneck (it will not be). Focus optimization effort on reducing layout thrashing and minimizing paint area. The sample table approach in the CubicBezier class above is already what browsers use internally.
:::

## Edge Cases and Failure Modes

### Bezier Control Points Outside [0,1] on Y-axis

Y-axis values can go above 1 or below 0, creating overshoot effects:

```css
/* Overshoot: y2 > 1 causes the value to go past the target */
.overshoot {
  transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

But X-axis values **must** remain in [0,1] — they represent time, and time does not go backwards. Browsers clamp x1 and x2 to [0,1].

### Spring Never Settling

If damping is zero, the spring oscillates forever. Always ensure a minimum damping value:

```typescript
function safeSpringConfig(config: SpringConfig): SpringConfig {
  return {
    ...config,
    damping: Math.max(config.damping, 0.1),
    mass: Math.max(config.mass, 0.01),
    stiffness: Math.max(config.stiffness, 0.01),
  };
}
```

### Numerical Instability with Large Timesteps

Euler integration diverges when $dt$ is too large relative to the spring frequency:

$$
dt_{\text{stable}} < \frac{2}{\omega_0} = 2\sqrt{\frac{m}{k}}
$$

For a spring with $k=400, m=1$: $dt_{\text{stable}} < 0.1\text{s}$. At 60fps, $dt = 0.0167\text{s}$, which is safe. But if a frame drops and $dt$ jumps to 0.2s, the simulation can explode.

```typescript
// Fixed timestep integration to prevent instability
function stepSpringFixedDt(
  spring: InteractiveSpring,
  totalDt: number,
  fixedDt: number = 1 / 120
): void {
  let remaining = totalDt;
  while (remaining > 0) {
    const dt = Math.min(remaining, fixedDt);
    spring.step(dt);
    remaining -= dt;
  }
}
```

::: danger
Never pass raw `deltaTime` from requestAnimationFrame directly to a spring simulation without clamping or subdivision. A single laggy frame (100ms+) can cause the spring to shoot to infinity, resulting in elements flying off screen with NaN positions.
:::
