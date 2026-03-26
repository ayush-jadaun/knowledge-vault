---
title: "Support Vector Machines (SVM)"
description: "Complete guide to SVMs — maximum margin classification, Lagrangian dual formulation and KKT conditions, kernel trick (RBF, polynomial), soft margin with C parameter, from-scratch linear SVM in NumPy, Iris and digits dataset examples."
tags: [machine-learning, svm, kernel-trick, classification, optimization]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Support Vector Machines (SVM)

Support Vector Machines find the hyperplane that maximizes the margin between classes. The math is elegant, the kernel trick is powerful, and SVMs remain competitive for small-to-medium datasets — especially in high dimensions.

---

## Maximum Margin Classification

### The Idea

Given linearly separable data, infinitely many hyperplanes can separate the classes. SVM finds the one that maximizes the **margin** — the distance between the hyperplane and the nearest data points from each class.

The decision function is:

$$f(\mathbf{x}) = \mathbf{w}^T \mathbf{x} + b$$

Points with $f(\mathbf{x}) > 0$ belong to class +1, points with $f(\mathbf{x}) < 0$ belong to class -1.

### The Margin

The distance from a point $\mathbf{x}_i$ to the hyperplane is:

$$\text{distance} = \frac{|{\mathbf{w}^T \mathbf{x}_i + b}|}{\|\mathbf{w}\|}$$

For the nearest points (support vectors), we normalize so that $|\mathbf{w}^T \mathbf{x}_i + b| = 1$. The margin becomes:

$$\text{margin} = \frac{2}{\|\mathbf{w}\|}$$

::: details Worked Example — SVM Margin Calculation

**2D dataset with w = [2, 1], b = -5:**

**Step 1:** Compute ||w||
  ||w|| = sqrt(2^2 + 1^2) = sqrt(4 + 1) = sqrt(5) = 2.236

**Step 2:** Compute margin
  margin = 2 / ||w|| = 2 / 2.236 = 0.894

**Step 3:** Compute distance of point x = [3, 2] from the hyperplane
  distance = |w^T x + b| / ||w|| = |2(3) + 1(2) - 5| / 2.236
           = |6 + 2 - 5| / 2.236 = |3| / 2.236 = 1.342

**Step 4:** Classify the point
  f(x) = 2(3) + 1(2) - 5 = 3 > 0 -> class +1

**Interpret:**
  "The margin is 0.894 units wide. Point [3,2] is 1.342 units from the boundary (well outside the margin of 0.447 on each side), so it's confidently classified as +1."

:::

### The Optimization Problem

Maximize the margin = minimize $\|\mathbf{w}\|^2$:

**Primal problem:**

$$\min_{\mathbf{w}, b} \frac{1}{2}\|\mathbf{w}\|^2$$

subject to:

$$y_i(\mathbf{w}^T \mathbf{x}_i + b) \geq 1, \quad \forall i = 1, \ldots, n$$

This is a convex quadratic program with linear constraints.

---

## Lagrangian Dual Formulation

### Setting Up the Lagrangian

Introduce Lagrange multipliers $\alpha_i \geq 0$ for each constraint:

$$\mathcal{L}(\mathbf{w}, b, \boldsymbol{\alpha}) = \frac{1}{2}\|\mathbf{w}\|^2 - \sum_{i=1}^n \alpha_i [y_i(\mathbf{w}^T \mathbf{x}_i + b) - 1]$$

### Deriving the Dual

Take partial derivatives and set to zero:

$$\frac{\partial \mathcal{L}}{\partial \mathbf{w}} = \mathbf{w} - \sum_{i=1}^n \alpha_i y_i \mathbf{x}_i = 0 \implies \mathbf{w} = \sum_{i=1}^n \alpha_i y_i \mathbf{x}_i$$

$$\frac{\partial \mathcal{L}}{\partial b} = -\sum_{i=1}^n \alpha_i y_i = 0 \implies \sum_{i=1}^n \alpha_i y_i = 0$$

Substituting back into the Lagrangian:

**Dual problem:**

$$\max_{\boldsymbol{\alpha}} \sum_{i=1}^n \alpha_i - \frac{1}{2} \sum_{i=1}^n \sum_{j=1}^n \alpha_i \alpha_j y_i y_j \mathbf{x}_i^T \mathbf{x}_j$$

subject to:

$$\alpha_i \geq 0, \quad \sum_{i=1}^n \alpha_i y_i = 0$$

### KKT Conditions

The Karush-Kuhn-Tucker conditions give us:

$$\alpha_i [y_i(\mathbf{w}^T \mathbf{x}_i + b) - 1] = 0$$

This means either $\alpha_i = 0$ (the point is not a support vector) or $y_i(\mathbf{w}^T \mathbf{x}_i + b) = 1$ (the point is on the margin — a support vector).

**Key insight:** Only support vectors have $\alpha_i > 0$. The solution depends only on a small subset of training points.

```python
# svm_math.py — Visualizing margin and support vectors
import numpy as np
import matplotlib.pyplot as plt
from sklearn.svm import SVC
from sklearn.datasets import make_blobs

# Create linearly separable data
X, y = make_blobs(n_samples=100, centers=2, random_state=42, cluster_std=1.2)
y = 2 * y - 1  # Convert to {-1, +1}

# Train linear SVM
svm = SVC(kernel='linear', C=100)  # large C ≈ hard margin
svm.fit(X, y)

# Get decision function parameters
w = svm.coef_[0]
b = svm.intercept_[0]

print(f"Weight vector w: {w}")
print(f"Bias b: {b:.4f}")
print(f"||w|| = {np.linalg.norm(w):.4f}")
print(f"Margin = 2/||w|| = {2/np.linalg.norm(w):.4f}")
print(f"Number of support vectors: {svm.n_support_}")

# Plot
fig, ax = plt.subplots(1, 1, figsize=(10, 8))

# Data points
ax.scatter(X[y==1, 0], X[y==1, 1], c='blue', marker='o', s=50, label='Class +1')
ax.scatter(X[y==-1, 0], X[y==-1, 1], c='red', marker='s', s=50, label='Class -1')

# Support vectors
sv = svm.support_vectors_
ax.scatter(sv[:, 0], sv[:, 1], s=200, facecolors='none', edgecolors='black',
           linewidths=2, label='Support Vectors')

# Decision boundary and margins
xx = np.linspace(X[:, 0].min()-1, X[:, 0].max()+1, 200)
yy = -(w[0] * xx + b) / w[1]
yy_up = -(w[0] * xx + b - 1) / w[1]
yy_down = -(w[0] * xx + b + 1) / w[1]

ax.plot(xx, yy, 'k-', linewidth=2, label='Decision boundary')
ax.plot(xx, yy_up, 'k--', linewidth=1, label='Margin')
ax.plot(xx, yy_down, 'k--', linewidth=1)

ax.set_xlabel('Feature 1')
ax.set_ylabel('Feature 2')
ax.set_title('SVM: Maximum Margin Classification')
ax.legend()
ax.set_xlim(X[:, 0].min()-1, X[:, 0].max()+1)
ax.set_ylim(X[:, 1].min()-1, X[:, 1].max()+1)
plt.tight_layout()
plt.savefig('svm_margin.png', dpi=150)
plt.show()
```

---

## Soft Margin SVM

Real data is rarely linearly separable. Soft margin SVM allows some points to violate the margin using **slack variables** $\xi_i \geq 0$:

$$\min_{\mathbf{w}, b, \boldsymbol{\xi}} \frac{1}{2}\|\mathbf{w}\|^2 + C \sum_{i=1}^n \xi_i$$

subject to:

$$y_i(\mathbf{w}^T \mathbf{x}_i + b) \geq 1 - \xi_i, \quad \xi_i \geq 0$$

The parameter $C$ controls the trade-off:
- **Large $C$**: Small margin, few violations (close to hard margin)
- **Small $C$**: Large margin, more violations allowed

```python
# soft_margin.py — Effect of C parameter
import numpy as np
import matplotlib.pyplot as plt
from sklearn.svm import SVC
from sklearn.datasets import make_classification
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler

X, y = make_classification(n_samples=200, n_features=2, n_redundant=0,
                           n_informative=2, random_state=42, n_clusters_per_class=1)
scaler = StandardScaler()
X = scaler.fit_transform(X)

fig, axes = plt.subplots(1, 3, figsize=(18, 5))

for ax, C in zip(axes, [0.01, 1.0, 100.0]):
    svm = SVC(kernel='linear', C=C)
    svm.fit(X, y)

    # Decision boundary
    xx, yy = np.meshgrid(np.linspace(-3, 3, 200), np.linspace(-3, 3, 200))
    Z = svm.decision_function(np.c_[xx.ravel(), yy.ravel()])
    Z = Z.reshape(xx.shape)

    ax.contourf(xx, yy, Z, levels=[-1, 0, 1], alpha=0.2, colors=['red', 'blue'])
    ax.contour(xx, yy, Z, levels=[-1, 0, 1], colors='black', linewidths=[1, 2, 1],
               linestyles=['--', '-', '--'])
    ax.scatter(X[y==0, 0], X[y==0, 1], c='red', marker='o', s=30)
    ax.scatter(X[y==1, 0], X[y==1, 1], c='blue', marker='s', s=30)
    sv = svm.support_vectors_
    ax.scatter(sv[:, 0], sv[:, 1], s=100, facecolors='none', edgecolors='black')
    ax.set_title(f'C={C} ({len(sv)} support vectors)')

plt.tight_layout()
plt.savefig('soft_margin.png', dpi=150)
plt.show()
```

---

## The Kernel Trick

### Why Kernels?

When data is not linearly separable, we can map it to a higher-dimensional space where it is. A kernel function $K(\mathbf{x}_i, \mathbf{x}_j)$ computes the dot product in the transformed space **without explicitly computing the transformation**:

$$K(\mathbf{x}_i, \mathbf{x}_j) = \phi(\mathbf{x}_i)^T \phi(\mathbf{x}_j)$$

This is computationally brilliant — the dual problem only needs dot products between data points, so we replace $\mathbf{x}_i^T \mathbf{x}_j$ with $K(\mathbf{x}_i, \mathbf{x}_j)$.

### Common Kernels

| Kernel | Formula | Parameters |
|--------|---------|------------|
| **Linear** | $K(\mathbf{x}, \mathbf{z}) = \mathbf{x}^T \mathbf{z}$ | None |
| **Polynomial** | $K(\mathbf{x}, \mathbf{z}) = (\gamma \mathbf{x}^T \mathbf{z} + r)^d$ | $\gamma$, $r$, degree $d$ |
| **RBF (Gaussian)** | $K(\mathbf{x}, \mathbf{z}) = \exp(-\gamma \|\mathbf{x} - \mathbf{z}\|^2)$ | $\gamma$ |
| **Sigmoid** | $K(\mathbf{x}, \mathbf{z}) = \tanh(\gamma \mathbf{x}^T \mathbf{z} + r)$ | $\gamma$, $r$ |

::: details Worked Example — Kernel Computations

**Two points: x = [1, 2], z = [3, 1], gamma = 0.5:**

**Step 1:** Linear kernel
  K_linear = x^T z = 1(3) + 2(1) = 3 + 2 = 5

**Step 2:** Polynomial kernel (degree=2, r=1, gamma=1)
  K_poly = (1 * x^T z + 1)^2 = (1*5 + 1)^2 = 6^2 = 36

**Step 3:** RBF kernel (gamma=0.5)
  ||x - z||^2 = (1-3)^2 + (2-1)^2 = 4 + 1 = 5
  K_rbf = exp(-0.5 * 5) = exp(-2.5) = 0.082

**Step 4:** RBF with same point (x = z)
  ||x - x||^2 = 0
  K_rbf = exp(-0.5 * 0) = exp(0) = 1.0

**Interpret:**
  "The RBF kernel gives 1.0 for identical points and decays to 0 as points move apart. With gamma=0.5, points 5 squared-distance units apart have similarity 0.082 (very dissimilar). Higher gamma makes the kernel more local."

:::

### RBF Kernel Deep Dive

The RBF kernel maps data to an **infinite-dimensional** space. The $\gamma$ parameter controls the influence radius:

- **Small $\gamma$**: Large radius, smooth boundary, can underfit
- **Large $\gamma$**: Small radius, tight boundary, can overfit

```python
# kernel_demo.py — Different kernels on non-linear data
import numpy as np
import matplotlib.pyplot as plt
from sklearn.svm import SVC
from sklearn.datasets import make_circles, make_moons

datasets = [
    ("Circles", make_circles(n_samples=300, factor=0.5, noise=0.1, random_state=42)),
    ("Moons", make_moons(n_samples=300, noise=0.15, random_state=42)),
]

kernels = ['linear', 'poly', 'rbf']

fig, axes = plt.subplots(2, 3, figsize=(18, 10))

for row, (name, (X, y)) in enumerate(datasets):
    for col, kernel in enumerate(kernels):
        ax = axes[row, col]
        svm = SVC(kernel=kernel, C=1.0, gamma='scale', degree=3)
        svm.fit(X, y)

        xx, yy = np.meshgrid(
            np.linspace(X[:, 0].min()-0.5, X[:, 0].max()+0.5, 200),
            np.linspace(X[:, 1].min()-0.5, X[:, 1].max()+0.5, 200)
        )
        Z = svm.predict(np.c_[xx.ravel(), yy.ravel()]).reshape(xx.shape)

        ax.contourf(xx, yy, Z, alpha=0.3, cmap='RdYlBu')
        ax.scatter(X[y==0, 0], X[y==0, 1], c='red', s=20)
        ax.scatter(X[y==1, 0], X[y==1, 1], c='blue', s=20)
        acc = svm.score(X, y)
        ax.set_title(f'{name} — {kernel} (acc={acc:.2f})')

plt.tight_layout()
plt.savefig('kernel_comparison.png', dpi=150)
plt.show()
```

### Effect of Gamma on RBF

```python
# gamma_effect.py — How gamma affects RBF SVM
import numpy as np
import matplotlib.pyplot as plt
from sklearn.svm import SVC
from sklearn.datasets import make_moons

X, y = make_moons(n_samples=200, noise=0.15, random_state=42)

fig, axes = plt.subplots(1, 4, figsize=(20, 4))

for ax, gamma in zip(axes, [0.1, 1.0, 10.0, 100.0]):
    svm = SVC(kernel='rbf', gamma=gamma, C=1.0)
    svm.fit(X, y)

    xx, yy = np.meshgrid(
        np.linspace(-1.5, 2.5, 200),
        np.linspace(-1, 1.5, 200)
    )
    Z = svm.decision_function(np.c_[xx.ravel(), yy.ravel()]).reshape(xx.shape)

    ax.contourf(xx, yy, Z, levels=20, cmap='RdYlBu', alpha=0.7)
    ax.scatter(X[y==0, 0], X[y==0, 1], c='red', s=20, edgecolors='black', linewidths=0.5)
    ax.scatter(X[y==1, 0], X[y==1, 1], c='blue', s=20, edgecolors='black', linewidths=0.5)
    n_sv = svm.n_support_.sum()
    ax.set_title(f'gamma={gamma} ({n_sv} SVs)')

plt.tight_layout()
plt.savefig('rbf_gamma.png', dpi=150)
plt.show()
```

---

## From-Scratch Linear SVM

```python
# svm_scratch.py — Linear SVM using gradient descent on hinge loss
import numpy as np
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score

class LinearSVMScratch:
    """Linear SVM using sub-gradient descent on hinge loss.

    Minimizes: (1/n) Σ max(0, 1 - yi(w·xi + b)) + λ||w||²
    """

    def __init__(self, learning_rate=0.01, lambda_param=0.01, n_iterations=1000):
        self.lr = learning_rate
        self.lambda_param = lambda_param
        self.n_iterations = n_iterations
        self.w = None
        self.b = None

    def fit(self, X, y):
        n_samples, n_features = X.shape
        # Convert labels to {-1, +1}
        y_ = np.where(y <= 0, -1, 1)

        self.w = np.zeros(n_features)
        self.b = 0.0

        for epoch in range(self.n_iterations):
            for i in range(n_samples):
                # Check if point satisfies margin condition
                condition = y_[i] * (np.dot(X[i], self.w) + self.b) >= 1

                if condition:
                    # Correctly classified with margin — only regularization gradient
                    self.w -= self.lr * (2 * self.lambda_param * self.w)
                else:
                    # Misclassified or within margin — hinge loss gradient
                    self.w -= self.lr * (2 * self.lambda_param * self.w - y_[i] * X[i])
                    self.b -= self.lr * (-y_[i])

        return self

    def predict(self, X):
        decision = np.dot(X, self.w) + self.b
        return np.where(decision >= 0, 1, 0)

    def decision_function(self, X):
        return np.dot(X, self.w) + self.b


# Test
X, y = make_classification(n_samples=500, n_features=10, random_state=42)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

svm = LinearSVMScratch(learning_rate=0.001, lambda_param=0.01, n_iterations=500)
svm.fit(X_train_s, y_train)
y_pred = svm.predict(X_test_s)
print(f"From-scratch accuracy: {accuracy_score(y_test, y_pred):.4f}")

from sklearn.svm import SVC
sk_svm = SVC(kernel='linear', C=1.0)
sk_svm.fit(X_train_s, y_train)
print(f"sklearn accuracy:      {sk_svm.score(X_test_s, y_test):.4f}")
```

---

## End-to-End Examples

### Iris Dataset

```python
# iris_svm.py — SVM on Iris with kernel comparison
from sklearn.datasets import load_iris
from sklearn.svm import SVC
from sklearn.model_selection import cross_val_score, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline

iris = load_iris()
X, y = iris.data, iris.target

kernels = ['linear', 'poly', 'rbf']
for kernel in kernels:
    pipe = make_pipeline(StandardScaler(), SVC(kernel=kernel))
    scores = cross_val_score(pipe, X, y, cv=5, scoring='accuracy')
    print(f"{kernel:>8}: {scores.mean():.4f} +/- {scores.std():.4f}")

# Grid search for RBF
param_grid = {
    'svc__C': [0.1, 1, 10, 100],
    'svc__gamma': ['scale', 'auto', 0.01, 0.1, 1],
}

pipe = make_pipeline(StandardScaler(), SVC(kernel='rbf'))
grid = GridSearchCV(pipe, param_grid, cv=5, scoring='accuracy')
grid.fit(X, y)
print(f"\nBest: {grid.best_score_:.4f} with {grid.best_params_}")
```

### Digits Dataset

```python
# digits_svm.py — SVM on handwritten digits (high dimensional)
from sklearn.datasets import load_digits
from sklearn.svm import SVC
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import classification_report
import time

digits = load_digits()
X, y = digits.data, digits.target
print(f"Shape: {X.shape}")  # (1797, 64) — 8x8 pixel images

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# RBF SVM excels in high dimensions
pipe = make_pipeline(StandardScaler(), SVC(kernel='rbf', C=10, gamma=0.001))

start = time.time()
pipe.fit(X_train, y_train)
train_time = time.time() - start

y_pred = pipe.predict(X_test)
print(f"Training time: {train_time:.3f}s")
print(f"Accuracy: {pipe.score(X_test, y_test):.4f}")
print(classification_report(y_test, y_pred))
```

---

## SVM Strengths and Weaknesses

| Aspect | Assessment |
|--------|-----------|
| **Strengths** | |
| High-dimensional data | Excellent — kernel trick scales well |
| Small-medium datasets | Very competitive |
| Margin-based | Robust to outliers (with proper C) |
| Theoretical foundations | Strong generalization bounds |
| **Weaknesses** | |
| Large datasets ($n > 100K$) | $O(n^2)$ to $O(n^3)$ training time |
| Feature scaling required | Always need StandardScaler |
| Probability estimates | Not native — need Platt scaling |
| Interpretability | Black box — no feature importance |
| Multi-class | One-vs-one or one-vs-rest (slower) |

---

## Further Reading

- **[Math Foundations](/machine-learning/math-foundations)** — Linear algebra and optimization background
- **[Logistic Regression](/machine-learning/logistic-regression)** — Another linear classifier to compare
- **[KNN](/machine-learning/knn)** — Another distance-based algorithm
- **[Evaluation Metrics](/machine-learning/evaluation-metrics)** — Evaluating SVM performance
