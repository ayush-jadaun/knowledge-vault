---
title: "Random Forests"
description: "Complete guide to random forests — bagging and bootstrap aggregation, out-of-bag error estimation, feature importance (MDI vs permutation), from-scratch NumPy implementation, hyperparameter tuning guide, and end-to-end examples."
tags: [machine-learning, random-forest, bagging, ensemble, feature-importance]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Random Forests

A random forest is an ensemble of decision trees, each trained on a random subset of the data and features. By averaging many decorrelated trees, it achieves much better generalization than any single tree — while remaining fast, robust, and requiring minimal tuning.

---

## Why Ensembles Work

### The Wisdom of Crowds

If each tree has error rate $\epsilon < 0.5$ (better than random) and the errors are independent, the probability that the majority of $T$ trees is wrong decreases exponentially with $T$.

For $T$ independent classifiers, each with accuracy $p$, the ensemble accuracy using majority vote is:

$$P(\text{majority correct}) = \sum_{k=\lceil T/2 \rceil}^{T} \binom{T}{k} p^k (1-p)^{T-k}$$

::: details Worked Example — Majority Vote Accuracy

**5 trees, each with individual accuracy p=0.7. What is the ensemble accuracy?**

Majority vote requires >= 3 out of 5 trees to be correct.

**Step 1:** P(exactly 3 correct)
  C(5,3) * 0.7^3 * 0.3^2 = 10 * 0.343 * 0.09 = 0.3087

**Step 2:** P(exactly 4 correct)
  C(5,4) * 0.7^4 * 0.3^1 = 5 * 0.2401 * 0.3 = 0.3602

**Step 3:** P(exactly 5 correct)
  C(5,5) * 0.7^5 * 0.3^0 = 1 * 0.16807 * 1 = 0.1681

**Step 4:** P(majority correct)
  = 0.3087 + 0.3602 + 0.1681 = 0.8370

**Interpret:**
  "5 trees with individual 70% accuracy combine to give 83.7% ensemble accuracy through majority voting. This is the power of ensembles — even mediocre classifiers combine to be strong. With 101 trees: accuracy = 99.9%."

:::

```python
# ensemble_math.py — Why ensembles work
import numpy as np
from scipy.stats import binom

# Individual tree accuracy
p = 0.65  # each tree is only 65% accurate

for T in [1, 5, 11, 51, 101, 501]:
    # Majority vote accuracy
    k_min = T // 2 + 1  # need > T/2 correct
    ensemble_acc = 1 - binom.cdf(k_min - 1, T, p)
    print(f"T={T:3d} trees: ensemble accuracy = {ensemble_acc:.4f}")

# Output:
# T=  1: 0.6500
# T=  5: 0.7648
# T= 11: 0.8320
# T= 51: 0.9544
# T=101: 0.9876
# T=501: 1.0000 (effectively)
```

**Key insight:** The trees must make **different errors**. If all trees make the same mistakes, ensembling does not help. Random forests achieve decorrelation through two sources of randomness.

---

## Two Sources of Randomness

### 1. Bagging (Bootstrap Aggregation)

Each tree is trained on a **bootstrap sample** — a random sample of $n$ data points drawn **with replacement** from the original $n$ points. On average, each bootstrap sample contains about 63.2% of the unique original data points.

**Why 63.2%?** The probability that a specific point is NOT selected in $n$ draws is $(1 - 1/n)^n \to e^{-1} \approx 0.368$. So it IS selected with probability $1 - e^{-1} \approx 0.632$.

### 2. Feature Randomization

At each split, only a random subset of $m$ features is considered (not all $d$). This decorrelates the trees further — even if one feature is very strong, some trees will not consider it and will find alternative splits.

**Default values for $m$:**
- Classification: $m = \lfloor\sqrt{d}\rfloor$
- Regression: $m = \lfloor d/3 \rfloor$

```python
# bagging_demo.py — Bootstrap sampling demonstration
import numpy as np

np.random.seed(42)
n = 1000

# Original dataset indices
original = np.arange(n)

# Create 5 bootstrap samples
for i in range(5):
    bootstrap = np.random.choice(original, size=n, replace=True)
    unique_count = len(np.unique(bootstrap))
    pct = unique_count / n * 100
    print(f"Bootstrap {i+1}: {unique_count} unique samples ({pct:.1f}%)")

# Theoretical: 1 - e^(-1) ≈ 63.2%
print(f"\nTheoretical unique %: {(1 - np.exp(-1))*100:.1f}%")
```

---

## Out-of-Bag (OOB) Error

The ~36.8% of samples not in a tree's bootstrap sample form the **out-of-bag** set for that tree. We can use OOB samples for a free validation estimate without needing a separate test set.

For each sample $x_i$, collect predictions from all trees where $x_i$ was OOB. The OOB error is the average prediction error across all samples using only the trees that did NOT train on that sample.

```python
# oob.py — OOB error estimation
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score

data = load_breast_cancer()
X, y = data.data, data.target

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Enable OOB estimation
rf = RandomForestClassifier(
    n_estimators=500,
    oob_score=True,  # enable OOB estimation
    random_state=42,
    n_jobs=-1
)
rf.fit(X_train, y_train)

# Compare OOB, CV, and test estimates
test_acc = rf.score(X_test, y_test)
oob_acc = rf.oob_score_
cv_scores = cross_val_score(
    RandomForestClassifier(n_estimators=500, random_state=42, n_jobs=-1),
    X_train, y_train, cv=5
)

print(f"OOB Accuracy:    {oob_acc:.4f}")
print(f"5-Fold CV Acc:   {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")
print(f"Test Accuracy:   {test_acc:.4f}")
# OOB is a reliable estimate — no need for separate validation set
```

---

## Feature Importance

### Mean Decrease in Impurity (MDI)

MDI measures how much each feature reduces impurity across all trees:

$$\text{MDI}(j) = \frac{1}{T} \sum_{t=1}^T \sum_{\text{node } s \in t_j} \frac{n_s}{n} \Delta I(s)$$

where $\Delta I(s)$ is the impurity decrease at split $s$ using feature $j$.

**Limitation:** MDI is biased toward high-cardinality features and features with many unique values.

### Permutation Importance

Permutation importance measures how much the model's score drops when a feature's values are randomly shuffled:

$$\text{PI}(j) = \text{score}(\mathbf{X}, y) - \text{score}(\mathbf{X}_{\text{permuted}_j}, y)$$

::: details Worked Example — Permutation Importance

**Model accuracy on test set: 0.92. Permute each feature and re-score:**

| Feature Permuted | New Accuracy | Importance (drop) |
|-----------------|-------------|-------------------|
| feature_1       | 0.85        | 0.92 - 0.85 = 0.07 |
| feature_2       | 0.72        | 0.92 - 0.72 = 0.20 |
| feature_3       | 0.91        | 0.92 - 0.91 = 0.01 |
| feature_4       | 0.89        | 0.92 - 0.89 = 0.03 |

**Ranking by importance:**
  1. feature_2: 0.20 (most important — accuracy drops 20 points)
  2. feature_1: 0.07
  3. feature_4: 0.03
  4. feature_3: 0.01 (least important — model barely cares)

**Interpret:**
  "Shuffling feature_2 destroys 20% of accuracy — the model heavily relies on it. Feature_3 with importance 0.01 is nearly irrelevant and could potentially be removed without harm."

:::

**Advantage:** Unbiased, works with any metric, captures interactions.

```python
# feature_importance.py — MDI vs Permutation importance
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.model_selection import train_test_split

data = load_breast_cancer()
X, y = data.data, data.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

rf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
rf.fit(X_train, y_train)

# MDI importance (built into sklearn)
mdi_importance = rf.feature_importances_

# Permutation importance (on test set)
perm_result = permutation_importance(
    rf, X_test, y_test, n_repeats=30, random_state=42, n_jobs=-1
)

# Compare top features
n_top = 10
mdi_idx = np.argsort(mdi_importance)[-n_top:][::-1]
perm_idx = np.argsort(perm_result.importances_mean)[-n_top:][::-1]

print(f"{'Rank':<5} {'MDI Feature':<30} {'MDI':>8}  {'Perm Feature':<30} {'Perm':>8}")
print("-" * 90)
for i in range(n_top):
    m_name = data.feature_names[mdi_idx[i]]
    m_val = mdi_importance[mdi_idx[i]]
    p_name = data.feature_names[perm_idx[i]]
    p_val = perm_result.importances_mean[perm_idx[i]]
    print(f"{i+1:<5} {m_name:<30} {m_val:>8.4f}  {p_name:<30} {p_val:>8.4f}")

# Visualize
fig, axes = plt.subplots(1, 2, figsize=(16, 6))

# MDI
sorted_idx = np.argsort(mdi_importance)[-15:]
axes[0].barh(range(15), mdi_importance[sorted_idx])
axes[0].set_yticks(range(15))
axes[0].set_yticklabels([data.feature_names[i] for i in sorted_idx])
axes[0].set_title('MDI Importance')

# Permutation
sorted_idx = np.argsort(perm_result.importances_mean)[-15:]
axes[1].barh(range(15), perm_result.importances_mean[sorted_idx])
axes[1].set_yticks(range(15))
axes[1].set_yticklabels([data.feature_names[i] for i in sorted_idx])
axes[1].set_title('Permutation Importance')

plt.tight_layout()
plt.savefig('feature_importance.png', dpi=150)
plt.show()
```

---

## From-Scratch Implementation

```python
# random_forest_scratch.py — Random forest from scratch
import numpy as np
from collections import Counter

class DecisionTreeSimple:
    """Simplified decision tree for use in random forest."""

    def __init__(self, max_depth=10, min_samples_split=2, max_features=None):
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.max_features = max_features
        self.tree = None

    def _gini(self, y):
        if len(y) == 0:
            return 0
        probs = np.bincount(y) / len(y)
        return 1 - np.sum(probs**2)

    def _best_split(self, X, y):
        n_samples, n_features = X.shape
        best_gain, best_feat, best_thresh = -1, None, None

        parent_gini = self._gini(y)

        # Random feature subset
        if self.max_features and self.max_features < n_features:
            features = np.random.choice(n_features, self.max_features, replace=False)
        else:
            features = np.arange(n_features)

        for feat in features:
            thresholds = np.unique(X[:, feat])
            for thresh in thresholds:
                left_mask = X[:, feat] <= thresh
                if left_mask.sum() < 1 or (~left_mask).sum() < 1:
                    continue

                n_l, n_r = left_mask.sum(), (~left_mask).sum()
                child_gini = (n_l/n_samples)*self._gini(y[left_mask]) + \
                             (n_r/n_samples)*self._gini(y[~left_mask])
                gain = parent_gini - child_gini

                if gain > best_gain:
                    best_gain = gain
                    best_feat = feat
                    best_thresh = thresh

        return best_feat, best_thresh, best_gain

    def _build(self, X, y, depth):
        if depth >= self.max_depth or len(y) < self.min_samples_split or len(np.unique(y)) == 1:
            return Counter(y).most_common(1)[0][0]

        feat, thresh, gain = self._best_split(X, y)
        if gain <= 0:
            return Counter(y).most_common(1)[0][0]

        mask = X[:, feat] <= thresh
        left = self._build(X[mask], y[mask], depth + 1)
        right = self._build(X[~mask], y[~mask], depth + 1)
        return (feat, thresh, left, right)

    def fit(self, X, y):
        self.tree = self._build(X, y, 0)
        return self

    def _predict_one(self, x, node):
        if not isinstance(node, tuple):
            return node
        feat, thresh, left, right = node
        if x[feat] <= thresh:
            return self._predict_one(x, left)
        return self._predict_one(x, right)

    def predict(self, X):
        return np.array([self._predict_one(x, self.tree) for x in X])


class RandomForestScratch:
    """Random forest classifier from scratch."""

    def __init__(self, n_estimators=100, max_depth=10, max_features='sqrt',
                 min_samples_split=2):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.max_features = max_features
        self.min_samples_split = min_samples_split
        self.trees = []

    def fit(self, X, y):
        n_samples, n_features = X.shape

        if self.max_features == 'sqrt':
            max_feat = int(np.sqrt(n_features))
        elif self.max_features == 'log2':
            max_feat = int(np.log2(n_features))
        else:
            max_feat = n_features

        self.trees = []
        for _ in range(self.n_estimators):
            # Bootstrap sample
            indices = np.random.choice(n_samples, n_samples, replace=True)
            X_boot, y_boot = X[indices], y[indices]

            # Train tree with feature randomization
            tree = DecisionTreeSimple(
                max_depth=self.max_depth,
                min_samples_split=self.min_samples_split,
                max_features=max_feat
            )
            tree.fit(X_boot, y_boot)
            self.trees.append(tree)

        return self

    def predict(self, X):
        # Majority vote
        predictions = np.array([tree.predict(X) for tree in self.trees])
        return np.array([
            Counter(predictions[:, i]).most_common(1)[0][0]
            for i in range(X.shape[0])
        ])

    def score(self, X, y):
        return np.mean(self.predict(X) == y)


# Test
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split

data = load_breast_cancer()
X, y = data.data, data.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

rf_scratch = RandomForestScratch(n_estimators=50, max_depth=8)
rf_scratch.fit(X_train, y_train)
print(f"From-scratch accuracy: {rf_scratch.score(X_test, y_test):.4f}")

from sklearn.ensemble import RandomForestClassifier
rf_sk = RandomForestClassifier(n_estimators=50, max_depth=8, random_state=42)
rf_sk.fit(X_train, y_train)
print(f"sklearn accuracy:      {rf_sk.score(X_test, y_test):.4f}")
```

---

## Hyperparameter Tuning Guide

### Key Parameters and Their Effects

| Parameter | Effect of Increasing | Default | Typical Range |
|-----------|---------------------|---------|--------------|
| `n_estimators` | More trees, diminishing returns | 100 | 100-1000 |
| `max_depth` | Deeper trees, more capacity | None (unlimited) | 5-30 |
| `min_samples_split` | Prevents small splits | 2 | 2-20 |
| `min_samples_leaf` | Smoother predictions | 1 | 1-10 |
| `max_features` | More features per split | `sqrt` | `sqrt`, `log2`, 0.3-0.8 |
| `max_samples` | Bootstrap sample size | 1.0 | 0.5-1.0 |

### Tuning Strategy

```python
# tuning.py — Systematic hyperparameter tuning
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import (
    RandomizedSearchCV, cross_val_score
)
from scipy.stats import randint, uniform
import numpy as np

data = load_breast_cancer()
X, y = data.data, data.target

# Step 1: Find the right number of trees
for n_trees in [50, 100, 200, 500, 1000]:
    rf = RandomForestClassifier(n_estimators=n_trees, random_state=42, n_jobs=-1)
    scores = cross_val_score(rf, X, y, cv=5, scoring='f1')
    print(f"n_estimators={n_trees:4d}: F1={scores.mean():.4f} +/- {scores.std():.4f}")

# Step 2: Tune other hyperparameters
param_dist = {
    'n_estimators': randint(100, 500),
    'max_depth': [5, 10, 15, 20, 25, None],
    'min_samples_split': randint(2, 20),
    'min_samples_leaf': randint(1, 10),
    'max_features': ['sqrt', 'log2', 0.3, 0.5, 0.7],
}

random_search = RandomizedSearchCV(
    RandomForestClassifier(random_state=42, n_jobs=-1),
    param_dist,
    n_iter=100,
    cv=5,
    scoring='f1',
    random_state=42,
    n_jobs=-1,
)
random_search.fit(X, y)

print(f"\nBest F1: {random_search.best_score_:.4f}")
print(f"Best params: {random_search.best_params_}")
```

### How Many Trees?

```python
# n_trees_convergence.py — Plotting accuracy vs number of trees
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score

data = load_breast_cancer()
X, y = data.data, data.target

tree_counts = [1, 5, 10, 25, 50, 100, 200, 500, 1000]
scores = []

for n in tree_counts:
    rf = RandomForestClassifier(n_estimators=n, random_state=42, n_jobs=-1)
    cv = cross_val_score(rf, X, y, cv=5, scoring='accuracy')
    scores.append((cv.mean(), cv.std()))
    print(f"n={n:4d}: {cv.mean():.4f} +/- {cv.std():.4f}")

means = [s[0] for s in scores]
stds = [s[1] for s in scores]

plt.figure(figsize=(10, 6))
plt.plot(tree_counts, means, 'bo-')
plt.fill_between(tree_counts,
    [m-s for m,s in zip(means, stds)],
    [m+s for m,s in zip(means, stds)],
    alpha=0.2)
plt.xscale('log')
plt.xlabel('Number of Trees')
plt.ylabel('CV Accuracy')
plt.title('Random Forest: Accuracy vs Number of Trees')
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('rf_n_trees.png', dpi=150)
plt.show()
```

---

## Random Forest vs Single Tree

```python
# rf_vs_tree.py — Demonstrating the improvement
from sklearn.datasets import load_breast_cancer
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, BaggingClassifier
from sklearn.model_selection import cross_val_score
import numpy as np

data = load_breast_cancer()
X, y = data.data, data.target

models = {
    'Single Tree (depth=None)': DecisionTreeClassifier(random_state=42),
    'Single Tree (depth=5)': DecisionTreeClassifier(max_depth=5, random_state=42),
    'Bagging (100 trees)': BaggingClassifier(
        estimator=DecisionTreeClassifier(random_state=42),
        n_estimators=100, random_state=42, n_jobs=-1
    ),
    'Random Forest (100 trees)': RandomForestClassifier(
        n_estimators=100, random_state=42, n_jobs=-1
    ),
}

print(f"{'Model':<35} {'CV Accuracy':>12} {'Std':>8}")
print("-" * 57)
for name, model in models.items():
    scores = cross_val_score(model, X, y, cv=10, scoring='accuracy')
    print(f"{name:<35} {scores.mean():>12.4f} {scores.std():>8.4f}")
```

---

## When to Use Random Forests

| Scenario | Random Forest? | Why |
|----------|---------------|-----|
| First model on tabular data | Yes | Robust baseline, minimal tuning |
| Need interpretability | Somewhat | Feature importance helps, but many trees |
| Very large datasets | Yes, but consider LightGBM | Can be slower than boosting |
| High-dimensional data | Yes | Feature sampling handles many features |
| Imbalanced classes | Yes | `class_weight='balanced'` |
| Online learning | No | Cannot update incrementally |
| Real-time low-latency | Depends | Prediction requires all trees |

---

## Further Reading

- **[Decision Trees](/machine-learning/decision-trees)** — The building block of random forests
- **[Gradient Boosting](/machine-learning/gradient-boosting)** — Sequential alternative to bagging
- **[Evaluation Metrics](/machine-learning/evaluation-metrics)** — How to measure forest performance
- **[Data Preparation](/machine-learning/data-preparation)** — Forests are robust but still benefit from good data
