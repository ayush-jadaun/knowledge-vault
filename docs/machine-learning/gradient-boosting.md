---
title: "Gradient Boosting"
description: "Complete guide to gradient boosting — AdaBoost algorithm, gradient boosting machines (GBM) derivation, XGBoost histogram-based splitting and regularization, LightGBM GOSS and EFB innovations, CatBoost ordered boosting, comparison benchmarks on real data."
tags: [machine-learning, gradient-boosting, xgboost, lightgbm, catboost]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Gradient Boosting

Gradient boosting is the most powerful algorithm family for tabular data. It builds an ensemble of weak learners (usually shallow trees) **sequentially**, where each new tree corrects the errors of the previous ones. This page covers the theory from AdaBoost to XGBoost/LightGBM/CatBoost with full derivations.

---

## Boosting vs Bagging

| Aspect | Bagging (Random Forest) | Boosting (GBM) |
|--------|------------------------|----------------|
| **Training** | Parallel — trees are independent | Sequential — each tree depends on previous |
| **Goal** | Reduce **variance** | Reduce **bias** |
| **Weighting** | Equal weight for all trees | Later trees weighted by learning rate |
| **Tree depth** | Deep trees (low bias) | Shallow trees (high bias, low variance) |
| **Overfitting risk** | Low | Higher — need regularization |

---

## AdaBoost

### The Algorithm

AdaBoost (Adaptive Boosting) was the first successful boosting algorithm. It re-weights misclassified samples so subsequent classifiers focus on hard examples.

**Algorithm:**

1. Initialize sample weights: $w_i = \frac{1}{n}$ for all $i$
2. For $t = 1, \ldots, T$:
   - Train weak classifier $h_t$ on weighted data
   - Compute weighted error: $\epsilon_t = \frac{\sum_{i: h_t(x_i) \neq y_i} w_i}{\sum_i w_i}$
   - Compute classifier weight: $\alpha_t = \frac{1}{2} \ln\frac{1 - \epsilon_t}{\epsilon_t}$
   - Update sample weights: $w_i \leftarrow w_i \cdot \exp(-\alpha_t y_i h_t(x_i))$
   - Normalize weights
3. Final prediction: $H(x) = \text{sign}\left(\sum_{t=1}^T \alpha_t h_t(x)\right)$

```python
# adaboost_scratch.py — AdaBoost from scratch
import numpy as np
from sklearn.datasets import make_classification
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

class AdaBoostScratch:
    """AdaBoost classifier from scratch."""

    def __init__(self, n_estimators=50):
        self.n_estimators = n_estimators
        self.alphas = []
        self.stumps = []

    def fit(self, X, y):
        n_samples = len(y)
        # Convert labels to {-1, +1}
        y_signed = np.where(y == 1, 1, -1)

        # Initialize uniform weights
        weights = np.ones(n_samples) / n_samples

        for t in range(self.n_estimators):
            # Train weak learner (decision stump)
            stump = DecisionTreeClassifier(max_depth=1)
            stump.fit(X, y_signed, sample_weight=weights)
            pred = stump.predict(X)

            # Weighted error
            incorrect = (pred != y_signed)
            epsilon = np.sum(weights * incorrect) / np.sum(weights)

            # Avoid division by zero
            epsilon = np.clip(epsilon, 1e-10, 1 - 1e-10)

            # Classifier weight
            alpha = 0.5 * np.log((1 - epsilon) / epsilon)

            # Update sample weights
            weights *= np.exp(-alpha * y_signed * pred)
            weights /= weights.sum()  # normalize

            self.alphas.append(alpha)
            self.stumps.append(stump)

        return self

    def predict(self, X):
        # Weighted sum of predictions
        pred_sum = sum(
            alpha * stump.predict(X)
            for alpha, stump in zip(self.alphas, self.stumps)
        )
        return np.where(pred_sum >= 0, 1, 0)


# Test
X, y = make_classification(n_samples=1000, n_features=10, random_state=42)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

ada = AdaBoostScratch(n_estimators=100)
ada.fit(X_train, y_train)
y_pred = ada.predict(X_test)
print(f"AdaBoost (scratch) accuracy: {accuracy_score(y_test, y_pred):.4f}")

# Compare with sklearn
from sklearn.ensemble import AdaBoostClassifier
ada_sk = AdaBoostClassifier(n_estimators=100, random_state=42)
ada_sk.fit(X_train, y_train)
print(f"AdaBoost (sklearn) accuracy: {ada_sk.score(X_test, y_test):.4f}")
```

---

## Gradient Boosting Machines (GBM)

### The Key Insight

AdaBoost re-weights samples. Gradient boosting generalizes this by fitting each new tree to the **negative gradient** of the loss function — the **pseudo-residuals**.

For squared error loss $L(y, F) = \frac{1}{2}(y - F)^2$:

$$-\frac{\partial L}{\partial F} = y - F(x)$$

The negative gradient is just the residual. So each new tree fits the residuals of the previous ensemble.

### GBM Derivation

Given a differentiable loss function $L(y, F(\mathbf{x}))$:

1. Initialize: $F_0(\mathbf{x}) = \arg\min_c \sum_{i=1}^n L(y_i, c)$

2. For $t = 1, \ldots, T$:
   - Compute pseudo-residuals: $r_{it} = -\frac{\partial L(y_i, F_{t-1}(\mathbf{x}_i))}{\partial F_{t-1}(\mathbf{x}_i)}$
   - Fit a tree $h_t$ to pseudo-residuals: $h_t(\mathbf{x}) \approx r_{it}$
   - Find optimal step size: $\rho_t = \arg\min_\rho \sum_{i=1}^n L(y_i, F_{t-1}(\mathbf{x}_i) + \rho \cdot h_t(\mathbf{x}_i))$
   - Update: $F_t(\mathbf{x}) = F_{t-1}(\mathbf{x}) + \eta \cdot \rho_t \cdot h_t(\mathbf{x})$

where $\eta$ is the learning rate (shrinkage).

```python
# gbm_scratch.py — Gradient Boosting from scratch for regression
import numpy as np
from sklearn.tree import DecisionTreeRegressor
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error

class GradientBoostingRegressorScratch:
    """Gradient boosting regressor from scratch (squared error loss)."""

    def __init__(self, n_estimators=100, learning_rate=0.1, max_depth=3):
        self.n_estimators = n_estimators
        self.lr = learning_rate
        self.max_depth = max_depth
        self.trees = []
        self.initial_prediction = None

    def fit(self, X, y):
        # Step 1: Initialize with mean
        self.initial_prediction = np.mean(y)
        F = np.full(len(y), self.initial_prediction)

        self.trees = []
        for t in range(self.n_estimators):
            # Step 2: Compute pseudo-residuals (negative gradient of MSE)
            residuals = y - F

            # Step 3: Fit tree to residuals
            tree = DecisionTreeRegressor(max_depth=self.max_depth)
            tree.fit(X, residuals)

            # Step 4: Update predictions
            F += self.lr * tree.predict(X)
            self.trees.append(tree)

            if (t + 1) % 20 == 0:
                mse = mean_squared_error(y, F)
                print(f"  Iteration {t+1}: train MSE = {mse:.4f}")

        return self

    def predict(self, X):
        F = np.full(X.shape[0], self.initial_prediction)
        for tree in self.trees:
            F += self.lr * tree.predict(X)
        return F


# Test on California Housing
housing = fetch_california_housing()
X, y = housing.data, housing.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

print("Training from-scratch GBM:")
gbm = GradientBoostingRegressorScratch(n_estimators=100, learning_rate=0.1, max_depth=4)
gbm.fit(X_train, y_train)

y_pred = gbm.predict(X_test)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
print(f"\nFrom-scratch RMSE: {rmse:.4f}")

# Compare with sklearn
from sklearn.ensemble import GradientBoostingRegressor
gbm_sk = GradientBoostingRegressor(n_estimators=100, learning_rate=0.1,
                                    max_depth=4, random_state=42)
gbm_sk.fit(X_train, y_train)
y_pred_sk = gbm_sk.predict(X_test)
rmse_sk = np.sqrt(mean_squared_error(y_test, y_pred_sk))
print(f"sklearn RMSE:      {rmse_sk:.4f}")
```

---

## XGBoost Internals

### What XGBoost Adds to GBM

1. **Regularized objective**: Adds L1 and L2 penalties on leaf weights
2. **Second-order approximation**: Uses both gradient and Hessian
3. **Histogram-based splitting**: Bins continuous features for speed
4. **Column subsampling**: Like random forests, samples features
5. **Sparsity-aware**: Handles missing values natively
6. **Parallel tree construction**: Parallelizes feature-level splitting

### Regularized Objective

XGBoost minimizes:

$$\text{Obj} = \sum_{i=1}^n L(y_i, \hat{y}_i) + \sum_{t=1}^T \Omega(f_t)$$

where the regularization term is:

$$\Omega(f) = \gamma T + \frac{1}{2}\lambda \sum_{j=1}^T w_j^2$$

- $T$ = number of leaves
- $w_j$ = weight (prediction) in leaf $j$
- $\gamma$ = penalty per leaf (controls tree complexity)
- $\lambda$ = L2 regularization on leaf weights

### Second-Order Taylor Expansion

At iteration $t$, XGBoost approximates the loss with a second-order Taylor expansion:

$$\text{Obj}^{(t)} \approx \sum_{i=1}^n \left[ g_i f_t(x_i) + \frac{1}{2} h_i f_t(x_i)^2 \right] + \Omega(f_t) + \text{const}$$

where:
- $g_i = \frac{\partial L(y_i, \hat{y}_i^{(t-1)})}{\partial \hat{y}_i^{(t-1)}}$ (gradient)
- $h_i = \frac{\partial^2 L(y_i, \hat{y}_i^{(t-1)})}{\partial (\hat{y}_i^{(t-1)})^2}$ (Hessian)

The optimal weight for leaf $j$ is:

$$w_j^* = -\frac{\sum_{i \in I_j} g_i}{\sum_{i \in I_j} h_i + \lambda}$$

The optimal split gain is:

$$\text{Gain} = \frac{1}{2}\left[\frac{(\sum_{i \in I_L} g_i)^2}{\sum_{i \in I_L} h_i + \lambda} + \frac{(\sum_{i \in I_R} g_i)^2}{\sum_{i \in I_R} h_i + \lambda} - \frac{(\sum_{i \in I} g_i)^2}{\sum_{i \in I} h_i + \lambda}\right] - \gamma$$

```python
# xgboost_detailed.py — XGBoost with detailed configuration
import xgboost as xgb
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error
import numpy as np

housing = fetch_california_housing()
X, y = housing.data, housing.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

dtrain = xgb.DMatrix(X_train, label=y_train)
dtest = xgb.DMatrix(X_test, label=y_test)

# Detailed parameter configuration
params = {
    # Booster parameters
    'booster': 'gbtree',          # tree-based boosting
    'eta': 0.1,                   # learning rate
    'max_depth': 6,               # tree depth
    'min_child_weight': 1,        # min sum of hessian in child

    # Regularization
    'gamma': 0.1,                 # min loss reduction for split
    'lambda': 1.0,                # L2 regularization
    'alpha': 0.0,                 # L1 regularization

    # Sampling
    'subsample': 0.8,             # row sampling
    'colsample_bytree': 0.8,     # column sampling per tree
    'colsample_bylevel': 1.0,    # column sampling per level

    # Objective
    'objective': 'reg:squarederror',
    'eval_metric': 'rmse',

    # Performance
    'tree_method': 'hist',        # histogram-based (fast)
    'seed': 42,
}

evals = [(dtrain, 'train'), (dtest, 'test')]
model = xgb.train(
    params, dtrain,
    num_boost_round=500,
    evals=evals,
    early_stopping_rounds=20,
    verbose_eval=50
)

y_pred = model.predict(dtest)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
print(f"\nXGBoost RMSE: {rmse:.4f}")
print(f"Best iteration: {model.best_iteration}")
```

---

## LightGBM Innovations

### GOSS (Gradient-based One-Side Sampling)

Instead of using all data, GOSS keeps all instances with large gradients (which contribute most to information gain) and randomly samples instances with small gradients. This speeds up training while maintaining accuracy.

### EFB (Exclusive Feature Bundling)

Many features are mutually exclusive (never non-zero simultaneously). EFB bundles these features together, reducing the effective number of features.

### Leaf-Wise vs Level-Wise Growth

- **Level-wise** (XGBoost default): Grows tree layer by layer
- **Leaf-wise** (LightGBM): Grows the leaf with maximum delta loss, creating asymmetric trees that can be more accurate

```python
# lightgbm_detailed.py — LightGBM with tuning
import lightgbm as lgb
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_squared_error
import numpy as np

housing = fetch_california_housing()
X, y = housing.data, housing.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# LightGBM native API
dtrain = lgb.Dataset(X_train, label=y_train)
dtest = lgb.Dataset(X_test, label=y_test, reference=dtrain)

params = {
    'objective': 'regression',
    'metric': 'rmse',
    'boosting_type': 'gbdt',     # or 'dart', 'goss'
    'num_leaves': 31,            # main complexity control
    'learning_rate': 0.1,
    'feature_fraction': 0.8,     # colsample_bytree
    'bagging_fraction': 0.8,     # subsample
    'bagging_freq': 5,           # bagging every 5 iterations
    'min_child_samples': 20,
    'lambda_l1': 0.1,
    'lambda_l2': 1.0,
    'verbose': -1,
    'seed': 42,
}

callbacks = [
    lgb.early_stopping(20),
    lgb.log_evaluation(50),
]

model = lgb.train(
    params, dtrain,
    num_boost_round=500,
    valid_sets=[dtrain, dtest],
    valid_names=['train', 'test'],
    callbacks=callbacks,
)

y_pred = model.predict(X_test)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
print(f"\nLightGBM RMSE: {rmse:.4f}")
print(f"Best iteration: {model.best_iteration}")

# Feature importance
importance = model.feature_importance(importance_type='gain')
for name, imp in sorted(zip(housing.feature_names, importance), key=lambda x: -x[1])[:5]:
    print(f"  {name}: {imp:.1f}")
```

---

## CatBoost: Ordered Boosting

### Prediction Shift Problem

Standard boosting has a subtle bias: the model used to compute residuals was trained on the same data. CatBoost's **ordered boosting** solves this by maintaining a separate model for computing residuals for each training example, using only the examples that came before it in a random permutation.

### Native Categorical Handling

CatBoost computes **ordered target statistics** for categorical features:

$$\hat{x}_k^i = \frac{\sum_{j: \pi(j) < \pi(i), x_j^k = x_i^k} y_j + a \cdot P}{\sum_{j: \pi(j) < \pi(i), x_j^k = x_i^k} 1 + a}$$

where $\pi$ is a random permutation, $a$ is a smoothing parameter, and $P$ is the prior (target mean).

```python
# catboost_detailed.py — CatBoost with categorical features
from catboost import CatBoostRegressor, Pool
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error
import numpy as np
import pandas as pd

housing = fetch_california_housing(as_frame=True)
df = housing.frame

# Add categorical features for demonstration
df['income_bin'] = pd.cut(df['MedInc'], bins=5, labels=['very_low', 'low', 'mid', 'high', 'very_high'])
df['age_bin'] = pd.cut(df['HouseAge'], bins=4, labels=['new', 'recent', 'old', 'very_old'])

X = df.drop('MedHouseVal', axis=1)
y = df['MedHouseVal']

cat_features = ['income_bin', 'age_bin']

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = CatBoostRegressor(
    iterations=500,
    depth=6,
    learning_rate=0.1,
    cat_features=cat_features,
    l2_leaf_reg=3.0,
    random_seed=42,
    verbose=100,
    early_stopping_rounds=20,
)

model.fit(X_train, y_train, eval_set=(X_test, y_test))

y_pred = model.predict(X_test)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
print(f"\nCatBoost RMSE: {rmse:.4f}")
```

---

## Head-to-Head Benchmark

```python
# benchmark.py — Comprehensive comparison
import numpy as np
import time
from sklearn.datasets import fetch_california_housing, load_breast_cancer
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.ensemble import GradientBoostingRegressor, GradientBoostingClassifier
from sklearn.metrics import mean_squared_error, accuracy_score
import xgboost as xgb
import lightgbm as lgb
from catboost import CatBoostRegressor, CatBoostClassifier

# --- Regression benchmark ---
housing = fetch_california_housing()
X, y = housing.data, housing.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

reg_models = {
    'sklearn GBM': GradientBoostingRegressor(
        n_estimators=200, max_depth=5, learning_rate=0.1, random_state=42),
    'XGBoost': xgb.XGBRegressor(
        n_estimators=200, max_depth=5, learning_rate=0.1,
        random_state=42, eval_metric='rmse'),
    'LightGBM': lgb.LGBMRegressor(
        n_estimators=200, max_depth=5, learning_rate=0.1,
        random_state=42, verbose=-1),
    'CatBoost': CatBoostRegressor(
        iterations=200, depth=5, learning_rate=0.1,
        random_seed=42, verbose=0),
}

print("=== Regression: California Housing ===")
print(f"{'Model':<20} {'RMSE':>10} {'Train Time':>12}")
print("-" * 44)

for name, model in reg_models.items():
    start = time.time()
    model.fit(X_train, y_train)
    train_time = time.time() - start
    y_pred = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    print(f"{name:<20} {rmse:>10.4f} {train_time:>12.3f}s")

# --- Classification benchmark ---
data = load_breast_cancer()
X, y = data.data, data.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

clf_models = {
    'sklearn GBM': GradientBoostingClassifier(
        n_estimators=200, max_depth=5, learning_rate=0.1, random_state=42),
    'XGBoost': xgb.XGBClassifier(
        n_estimators=200, max_depth=5, learning_rate=0.1,
        random_state=42, eval_metric='logloss'),
    'LightGBM': lgb.LGBMClassifier(
        n_estimators=200, max_depth=5, learning_rate=0.1,
        random_state=42, verbose=-1),
    'CatBoost': CatBoostClassifier(
        iterations=200, depth=5, learning_rate=0.1,
        random_seed=42, verbose=0),
}

print("\n=== Classification: Breast Cancer ===")
print(f"{'Model':<20} {'Accuracy':>10} {'Train Time':>12}")
print("-" * 44)

for name, model in clf_models.items():
    start = time.time()
    model.fit(X_train, y_train)
    train_time = time.time() - start
    acc = model.score(X_test, y_test)
    print(f"{name:<20} {acc:>10.4f} {train_time:>12.3f}s")
```

---

## When to Use Which

| Library | Best For | Key Advantage | Weakness |
|---------|----------|--------------|----------|
| **sklearn GBM** | Small data, learning | Simple API | Slow, no GPU |
| **XGBoost** | General purpose, competitions | Well-tuned defaults, regularization | Slower than LightGBM |
| **LightGBM** | Large data (>100K rows) | Fastest training | Can overfit with small data |
| **CatBoost** | Categorical features | No encoding needed, robust | Slower than LightGBM |

### Quick Selection Rule

1. Have categorical features? Start with **CatBoost**
2. Very large dataset? Start with **LightGBM**
3. Competition / need best accuracy? Try all three, ensemble top two
4. Learning / prototyping? Start with **sklearn GBM**

---

## Further Reading

- **[Decision Trees](/machine-learning/decision-trees)** — The weak learner used in boosting
- **[Random Forests](/machine-learning/random-forests)** — Bagging alternative to boosting
- **[Python ML Ecosystem](/machine-learning/python-ml-ecosystem)** — Installation and API comparison
- **[Evaluation Metrics](/machine-learning/evaluation-metrics)** — How to measure boosting performance
