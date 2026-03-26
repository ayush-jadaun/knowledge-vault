---
title: "K-Nearest Neighbors (KNN)"
description: "Complete guide to KNN — distance metrics (Euclidean, Manhattan, Minkowski), choosing K with cross-validation, curse of dimensionality, KD-tree acceleration, weighted KNN, from-scratch NumPy implementation, Wine Quality dataset end-to-end."
tags: [machine-learning, knn, distance-metrics, classification, instance-based]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# K-Nearest Neighbors (KNN)

KNN is the simplest machine learning algorithm: to classify a new point, find the $K$ closest training points and take a majority vote. No model is trained — the training data IS the model. This makes KNN a **lazy learner** (non-parametric, instance-based).

---

## How KNN Works

### The Algorithm

1. Store the entire training dataset
2. For a new query point $\mathbf{x}_q$:
   - Compute the distance from $\mathbf{x}_q$ to every training point
   - Find the $K$ nearest neighbors
   - **Classification:** Return the majority class
   - **Regression:** Return the mean (or weighted mean) of neighbors' targets

```python
# knn_intuition.py — KNN step by step
import numpy as np

# Training data: 2D points with labels
X_train = np.array([
    [1.0, 2.0],  # Class 0
    [1.5, 1.8],  # Class 0
    [2.0, 2.5],  # Class 0
    [5.0, 8.0],  # Class 1
    [6.0, 8.5],  # Class 1
    [5.5, 7.0],  # Class 1
])
y_train = np.array([0, 0, 0, 1, 1, 1])

# New query point
x_query = np.array([3.0, 4.0])

# Step 1: Compute distances
distances = np.sqrt(np.sum((X_train - x_query)**2, axis=1))
print("Distances to query point:")
for i, (point, label, dist) in enumerate(zip(X_train, y_train, distances)):
    print(f"  Point {i} {point} (class {label}): distance = {dist:.2f}")

# Step 2: Find K nearest neighbors
K = 3
nearest_idx = np.argsort(distances)[:K]
nearest_labels = y_train[nearest_idx]
print(f"\n{K} nearest neighbors: indices={nearest_idx}, labels={nearest_labels}")

# Step 3: Majority vote
from collections import Counter
prediction = Counter(nearest_labels).most_common(1)[0][0]
print(f"Prediction: class {prediction}")
```

---

## Distance Metrics

The choice of distance metric fundamentally affects KNN's behavior.

### Minkowski Distance Family

$$d_p(\mathbf{x}, \mathbf{z}) = \left(\sum_{j=1}^d |x_j - z_j|^p\right)^{1/p}$$

| Distance | $p$ | Name | Properties |
|----------|-----|------|-----------|
| Manhattan | $p=1$ | $L_1$ norm | Better for sparse, high-dimensional data |
| Euclidean | $p=2$ | $L_2$ norm | Default, sensitive to scale |
| Chebyshev | $p \to \infty$ | $L_\infty$ norm | Maximum coordinate difference |

```python
# distance_metrics.py — All distance metrics compared
import numpy as np
from scipy.spatial.distance import cdist

x = np.array([[1.0, 2.0, 3.0]])
z = np.array([[4.0, 6.0, 3.0]])

# Minkowski family
for p in [1, 2, 3, np.inf]:
    if p == np.inf:
        dist = np.max(np.abs(x - z))
        name = "Chebyshev (L∞)"
    else:
        dist = np.sum(np.abs(x - z)**p)**(1/p)
        name = f"Minkowski (p={p})"
    print(f"{name:25s}: {dist:.4f}")

# Other useful distances
# Cosine distance — angle between vectors
cos_sim = np.dot(x.ravel(), z.ravel()) / (np.linalg.norm(x) * np.linalg.norm(z))
print(f"\n{'Cosine similarity':25s}: {cos_sim:.4f}")
print(f"{'Cosine distance':25s}: {1 - cos_sim:.4f}")

# Hamming distance — for categorical data
a = np.array([1, 0, 1, 1, 0])
b = np.array([1, 1, 1, 0, 0])
hamming = np.mean(a != b)
print(f"\n{'Hamming distance':25s}: {hamming:.4f}")
```

### Which Distance to Use

| Metric | Best For | Scaling Required? |
|--------|---------|-------------------|
| Euclidean | General purpose | Yes |
| Manhattan | High-dimensional, sparse | Yes |
| Cosine | Text/embeddings, direction matters | No |
| Hamming | Categorical/binary features | No |
| Mahalanobis | Correlated features | No (accounts for covariance) |

---

## Choosing K

The choice of $K$ is the primary hyperparameter:

- **Small $K$ (e.g., 1-3):** Low bias, high variance — sensitive to noise
- **Large $K$ (e.g., 50+):** High bias, low variance — over-smoothed boundaries
- **$K = 1$:** Nearest neighbor — Voronoi tessellation
- **Odd $K$:** Avoids ties in binary classification

```python
# choosing_k.py — Finding optimal K with cross-validation
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer
from sklearn.neighbors import KNeighborsClassifier
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline

data = load_breast_cancer()
X, y = data.data, data.target

k_values = range(1, 51)
cv_scores = []
cv_stds = []

for k in k_values:
    pipe = make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=k))
    scores = cross_val_score(pipe, X, y, cv=10, scoring='accuracy')
    cv_scores.append(scores.mean())
    cv_stds.append(scores.std())

cv_scores = np.array(cv_scores)
cv_stds = np.array(cv_stds)

best_k = k_values[np.argmax(cv_scores)]
best_score = cv_scores.max()

print(f"Best K: {best_k}")
print(f"Best CV Accuracy: {best_score:.4f}")

# Plot
plt.figure(figsize=(12, 6))
plt.plot(k_values, cv_scores, 'b-o', markersize=3)
plt.fill_between(k_values, cv_scores - cv_stds, cv_scores + cv_stds, alpha=0.2)
plt.axvline(x=best_k, color='r', linestyle='--', label=f'Best K={best_k}')
plt.xlabel('K (Number of Neighbors)')
plt.ylabel('CV Accuracy')
plt.title('KNN: Accuracy vs K')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('knn_k_selection.png', dpi=150)
plt.show()
```

---

## The Curse of Dimensionality

As dimensionality increases, distances become less meaningful. In high dimensions, the nearest and farthest neighbors have nearly the same distance — breaking KNN.

### The Math

For uniformly distributed data in a $d$-dimensional hypercube $[0, 1]^d$, the expected distance to the nearest neighbor grows as:

$$\mathbb{E}[d_{\min}] \propto n^{-1/d}$$

For $d = 100$ and $n = 1000$: $n^{-1/d} = 1000^{-0.01} = 0.93$. The nearest neighbor is at 93% of the way to the boundary — essentially useless.

```python
# curse.py — Demonstrating the curse of dimensionality
import numpy as np
import matplotlib.pyplot as plt

np.random.seed(42)
n_samples = 1000

dimensions = [2, 5, 10, 20, 50, 100, 500, 1000]
nearest_ratios = []

for d in dimensions:
    # Random points in d-dimensional unit hypercube
    X = np.random.rand(n_samples, d)
    query = np.random.rand(1, d)

    # Compute all distances
    dists = np.sqrt(np.sum((X - query)**2, axis=1))
    d_min = dists.min()
    d_max = dists.max()

    ratio = d_min / d_max
    nearest_ratios.append(ratio)
    print(f"d={d:4d}: nearest={d_min:.3f}, farthest={d_max:.3f}, ratio={ratio:.4f}")

plt.figure(figsize=(10, 6))
plt.plot(dimensions, nearest_ratios, 'ro-', markersize=8)
plt.xlabel('Number of Dimensions')
plt.ylabel('Nearest / Farthest Distance Ratio')
plt.title('Curse of Dimensionality: Distance Ratio Approaches 1')
plt.xscale('log')
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('curse_dimensionality.png', dpi=150)
plt.show()
```

### Mitigations

| Strategy | How It Helps |
|----------|-------------|
| **PCA** | Reduce to important dimensions |
| **Feature selection** | Remove irrelevant features |
| **Manhattan distance** | More robust in high dimensions |
| **Use tree-based models instead** | Not distance-based |

---

## KD-Tree and Ball Tree

Brute-force KNN is $O(nd)$ per query (scan all $n$ points). KD-tree and Ball tree reduce this.

### KD-Tree

A binary tree that recursively partitions space along feature axes. Average query time: $O(d \log n)$ for low dimensions.

**Limitation:** Degrades to $O(nd)$ for $d > 20$ due to the curse of dimensionality.

### Ball Tree

Organizes points into nested hyperspheres. Works better than KD-tree in higher dimensions.

```python
# tree_acceleration.py — KD-Tree vs Ball Tree vs Brute Force
import numpy as np
import time
from sklearn.neighbors import KNeighborsClassifier
from sklearn.datasets import make_classification

# Generate dataset
X, y = make_classification(n_samples=10000, n_features=20, random_state=42)

algorithms = ['brute', 'kd_tree', 'ball_tree']

print(f"{'Algorithm':<15} {'Fit Time':>12} {'Query Time':>12}")
print("-" * 41)

for algo in algorithms:
    knn = KNeighborsClassifier(n_neighbors=5, algorithm=algo)

    start = time.time()
    knn.fit(X, y)
    fit_time = time.time() - start

    start = time.time()
    knn.predict(X[:1000])
    query_time = time.time() - start

    print(f"{algo:<15} {fit_time:>12.4f}s {query_time:>12.4f}s")
```

---

## Weighted KNN

Standard KNN treats all $K$ neighbors equally. Weighted KNN gives closer neighbors more influence:

$$\hat{y} = \frac{\sum_{i \in N_K} w_i \cdot y_i}{\sum_{i \in N_K} w_i}$$

Common weight functions:
- **Uniform:** $w_i = 1$ (standard KNN)
- **Distance:** $w_i = \frac{1}{d(\mathbf{x}_q, \mathbf{x}_i)}$
- **Gaussian:** $w_i = \exp\left(-\frac{d(\mathbf{x}_q, \mathbf{x}_i)^2}{2\sigma^2}\right)$

```python
# weighted_knn.py — Uniform vs distance-weighted KNN
from sklearn.datasets import load_breast_cancer
from sklearn.neighbors import KNeighborsClassifier
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline

data = load_breast_cancer()
X, y = data.data, data.target

for weights in ['uniform', 'distance']:
    for k in [3, 5, 11, 21]:
        pipe = make_pipeline(
            StandardScaler(),
            KNeighborsClassifier(n_neighbors=k, weights=weights)
        )
        scores = cross_val_score(pipe, X, y, cv=10, scoring='accuracy')
        print(f"K={k:2d}, weights={weights:8s}: {scores.mean():.4f} +/- {scores.std():.4f}")
```

---

## From-Scratch Implementation

```python
# knn_scratch.py — KNN classifier from scratch
import numpy as np
from collections import Counter
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score

class KNNScratch:
    """K-Nearest Neighbors classifier from scratch."""

    def __init__(self, k=5, weights='uniform', metric='euclidean'):
        self.k = k
        self.weights = weights
        self.metric = metric
        self.X_train = None
        self.y_train = None

    def _compute_distance(self, x1, x2):
        if self.metric == 'euclidean':
            return np.sqrt(np.sum((x1 - x2)**2, axis=1))
        elif self.metric == 'manhattan':
            return np.sum(np.abs(x1 - x2), axis=1)
        else:
            raise ValueError(f"Unknown metric: {self.metric}")

    def fit(self, X, y):
        self.X_train = np.array(X)
        self.y_train = np.array(y)
        return self

    def _predict_single(self, x):
        # Compute distances to all training points
        distances = self._compute_distance(self.X_train, x)

        # Find K nearest neighbors
        k_idx = np.argsort(distances)[:self.k]
        k_labels = self.y_train[k_idx]
        k_distances = distances[k_idx]

        if self.weights == 'uniform':
            # Majority vote
            return Counter(k_labels).most_common(1)[0][0]
        elif self.weights == 'distance':
            # Distance-weighted vote
            w = 1 / (k_distances + 1e-10)
            class_weights = {}
            for label, weight in zip(k_labels, w):
                class_weights[label] = class_weights.get(label, 0) + weight
            return max(class_weights, key=class_weights.get)

    def predict(self, X):
        return np.array([self._predict_single(x) for x in X])

    def score(self, X, y):
        return np.mean(self.predict(X) == y)


# Test
data = load_breast_cancer()
X, y = data.data, data.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

# From scratch
knn = KNNScratch(k=5, weights='distance', metric='euclidean')
knn.fit(X_train_s, y_train)
print(f"From-scratch accuracy: {knn.score(X_test_s, y_test):.4f}")

# sklearn comparison
from sklearn.neighbors import KNeighborsClassifier
sk_knn = KNeighborsClassifier(n_neighbors=5, weights='distance')
sk_knn.fit(X_train_s, y_train)
print(f"sklearn accuracy:      {sk_knn.score(X_test_s, y_test):.4f}")
```

---

## End-to-End: Wine Quality Dataset

```python
# wine_quality.py — KNN on Wine Quality
import numpy as np
from sklearn.datasets import load_wine
from sklearn.model_selection import train_test_split, GridSearchCV, cross_val_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import classification_report

# Load data
wine = load_wine()
X, y = wine.data, wine.target
print(f"Shape: {X.shape}")
print(f"Classes: {wine.target_names}")
print(f"Features: {wine.feature_names}")

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Grid search for best KNN configuration
param_grid = {
    'kneighborsclassifier__n_neighbors': range(1, 31),
    'kneighborsclassifier__weights': ['uniform', 'distance'],
    'kneighborsclassifier__metric': ['euclidean', 'manhattan'],
}

pipe = make_pipeline(StandardScaler(), KNeighborsClassifier())
grid = GridSearchCV(pipe, param_grid, cv=5, scoring='accuracy', n_jobs=-1)
grid.fit(X_train, y_train)

print(f"\nBest params: {grid.best_params_}")
print(f"Best CV accuracy: {grid.best_score_:.4f}")

# Final evaluation
y_pred = grid.predict(X_test)
print(f"\nTest accuracy: {grid.score(X_test, y_test):.4f}")
print(classification_report(y_test, y_pred, target_names=wine.target_names))

# Feature importance via permutation (KNN has no built-in importance)
from sklearn.inspection import permutation_importance
perm = permutation_importance(grid.best_estimator_, X_test, y_test,
                              n_repeats=30, random_state=42)
idx = np.argsort(perm.importances_mean)[::-1]
print("Feature importance (permutation):")
for i in idx[:5]:
    print(f"  {wine.feature_names[i]}: {perm.importances_mean[i]:.4f} +/- {perm.importances_std[i]:.4f}")
```

---

## KNN for Regression

```python
# knn_regression.py — KNN as a regressor
from sklearn.datasets import fetch_california_housing
from sklearn.neighbors import KNeighborsRegressor
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import mean_squared_error, r2_score
import numpy as np

housing = fetch_california_housing()
X, y = housing.data, housing.target

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

for k in [3, 5, 11, 21]:
    pipe = make_pipeline(StandardScaler(), KNeighborsRegressor(n_neighbors=k, weights='distance'))
    pipe.fit(X_train, y_train)
    y_pred = pipe.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2 = r2_score(y_test, y_pred)
    print(f"K={k:2d}: RMSE={rmse:.4f}, R²={r2:.4f}")
```

---

## When to Use KNN

| Scenario | Use KNN? | Why |
|----------|---------|-----|
| Small dataset (<10K) | Yes | Competitive, simple |
| Low dimensions (<20) | Yes | Distances are meaningful |
| Need explainability | Yes | "These 5 similar cases..." |
| Large dataset (>100K) | No | Prediction is slow |
| High dimensions (>50) | No | Curse of dimensionality |
| Streaming data | No | Cannot update incrementally |
| Mixed feature types | Careful | Need appropriate distance metric |

---

## Further Reading

- **[SVM](/machine-learning/svm)** — Another distance-based algorithm
- **[Data Preparation](/machine-learning/data-preparation)** — Scaling is critical for KNN
- **[Evaluation Metrics](/machine-learning/evaluation-metrics)** — Classification and regression metrics
- **[Naive Bayes](/machine-learning/naive-bayes)** — Another simple baseline
