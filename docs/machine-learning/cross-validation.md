---
title: "Cross-Validation"
description: "Complete guide to cross-validation strategies — KFold, Stratified KFold, LOOCV, TimeSeriesSplit, GroupKFold, nested cross-validation for unbiased evaluation, and a from-scratch KFold implementation with full mathematical justification."
tags: [machine-learning, cross-validation, model-evaluation, kfold, nested-cv]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Cross-Validation

A model that scores 95% accuracy on training data might score 60% on new data. The gap is **overfitting**, and you cannot detect it without a proper evaluation strategy. Cross-validation is the systematic way to estimate how well a model generalizes — by repeatedly splitting data into train and test sets, training on one and evaluating on the other.

## Why Not Just Train/Test Split?

A single 80/20 split has problems:

| Problem | Effect |
|---------|--------|
| **High variance** | Score depends heavily on which 20% ends up in test |
| **Wasted data** | 20% of data is never used for training |
| **Unlucky splits** | Rare classes might be absent from test set |
| **No confidence interval** | One number tells you nothing about reliability |

Cross-validation addresses all of these by using **every data point for both training and testing**.

---

## K-Fold Cross-Validation

### Algorithm

1. Shuffle the dataset (optional but recommended)
2. Split into $K$ equal-sized folds $F_1, F_2, \ldots, F_K$
3. For each fold $i = 1, \ldots, K$:
   - **Train** on all folds except $F_i$: $\mathcal{D}_{\text{train}} = \mathcal{D} \setminus F_i$
   - **Evaluate** on $F_i$: $s_i = \text{metric}(f_{\mathcal{D}_{\text{train}}}, F_i)$
4. Report: $\bar{s} = \frac{1}{K}\sum_{i=1}^{K} s_i \pm \text{std}(s_1, \ldots, s_K)$

::: details Worked Example — 5-Fold Cross-Validation

**Dataset: 20 samples, K=5 folds of 4 samples each. Accuracy per fold:**

| Fold | Train Size | Test Size | Accuracy |
|------|-----------|-----------|----------|
| 1    | 16        | 4         | 0.75     |
| 2    | 16        | 4         | 0.50     |
| 3    | 16        | 4         | 1.00     |
| 4    | 16        | 4         | 0.75     |
| 5    | 16        | 4         | 0.75     |

**Step 1:** Compute mean
  s_bar = (0.75 + 0.50 + 1.00 + 0.75 + 0.75) / 5 = 3.75/5 = 0.75

**Step 2:** Compute standard deviation
  deviations = [0, -0.25, +0.25, 0, 0]
  variance = (0 + 0.0625 + 0.0625 + 0 + 0) / 5 = 0.025
  std = sqrt(0.025) = 0.158

**Step 3:** Report
  CV Accuracy = 0.75 +/- 0.158

**Interpret:**
  "The model's estimated generalization accuracy is 75% with notable variability (std=0.158). Fold 2 had unusually low accuracy (0.50), suggesting the model may struggle with certain data patterns. Each sample was used for testing exactly once."

:::

### Mathematical Properties

**Bias-variance tradeoff of $K$**:

- **Small $K$ (e.g., 2)**: High bias (training on only 50% of data), low variance between folds
- **Large $K$ (e.g., $n$, LOOCV)**: Low bias (training on $n-1$ samples), high variance (folds are highly correlated)
- **$K = 5$ or $K = 10$**: Good balance — empirically validated by Kohavi (1995) and Hastie et al.

**Expected prediction error**:

$$\text{EPE} = E[\text{Loss}(Y, \hat{f}(X))]$$

Cross-validation estimates EPE by averaging over $K$ held-out folds. The estimate is approximately unbiased for $K = n$ (LOOCV) and slightly pessimistically biased for smaller $K$.

### KFold From Scratch

```python
import numpy as np
from sklearn.base import clone

class KFoldFromScratch:
    """K-Fold cross-validation from scratch."""

    def __init__(self, n_splits=5, shuffle=True, random_state=42):
        self.n_splits = n_splits
        self.shuffle = shuffle
        self.random_state = random_state

    def split(self, X):
        """Generate train/test indices for each fold."""
        n_samples = len(X)
        indices = np.arange(n_samples)

        if self.shuffle:
            rng = np.random.RandomState(self.random_state)
            rng.shuffle(indices)

        # Split indices into K approximately equal folds
        fold_sizes = np.full(self.n_splits, n_samples // self.n_splits)
        fold_sizes[:n_samples % self.n_splits] += 1

        current = 0
        folds = []
        for fold_size in fold_sizes:
            folds.append(indices[current:current + fold_size])
            current += fold_size

        # Yield train/test splits
        for i in range(self.n_splits):
            test_idx = folds[i]
            train_idx = np.concatenate([folds[j] for j in range(self.n_splits) if j != i])
            yield train_idx, test_idx


def cross_val_score_scratch(estimator, X, y, cv=5, scoring='accuracy'):
    """Cross-validation scoring from scratch."""
    kfold = KFoldFromScratch(n_splits=cv, shuffle=True, random_state=42)
    scores = []

    for fold_idx, (train_idx, test_idx) in enumerate(kfold.split(X)):
        X_train, X_test = X[train_idx], X[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]

        # Clone and fit
        model = clone(estimator)
        model.fit(X_train, y_train)

        # Score
        if scoring == 'accuracy':
            score = np.mean(model.predict(X_test) == y_test)
        elif scoring == 'neg_mean_squared_error':
            score = -np.mean((model.predict(X_test) - y_test) ** 2)
        else:
            score = model.score(X_test, y_test)

        scores.append(score)
        print(f"  Fold {fold_idx + 1}: {score:.4f}")

    scores = np.array(scores)
    print(f"  Mean: {scores.mean():.4f} +/- {scores.std():.4f}")
    return scores


# ---- Verify against sklearn ----
from sklearn.datasets import load_iris
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

iris = load_iris()
X, y = iris.data, iris.target

model = LogisticRegression(max_iter=200, random_state=42)

print("From scratch:")
scores_scratch = cross_val_score_scratch(model, X, y, cv=5)

print("\nSklearn:")
scores_sklearn = cross_val_score(model, X, y, cv=5, scoring='accuracy')
print(f"  Mean: {scores_sklearn.mean():.4f} +/- {scores_sklearn.std():.4f}")
```

---

## Stratified K-Fold

### Problem: Class Imbalance in Folds

With standard KFold, a fold might get 0 samples of a rare class. Stratified KFold ensures each fold has approximately the same class distribution as the full dataset.

```python
from sklearn.model_selection import StratifiedKFold, KFold
import numpy as np

# Imbalanced dataset
np.random.seed(42)
y_imbalanced = np.array([0]*90 + [1]*10)  # 90% class 0, 10% class 1

print("Standard KFold — class distribution per fold:")
kf = KFold(n_splits=5, shuffle=True, random_state=42)
for fold, (train_idx, test_idx) in enumerate(kf.split(y_imbalanced)):
    ratio = y_imbalanced[test_idx].mean()
    print(f"  Fold {fold+1}: {ratio:.2%} positive")

print("\nStratified KFold — class distribution per fold:")
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
for fold, (train_idx, test_idx) in enumerate(skf.split(y_imbalanced, y_imbalanced)):
    ratio = y_imbalanced[test_idx].mean()
    print(f"  Fold {fold+1}: {ratio:.2%} positive")
```

**When to use**: Classification tasks, especially with imbalanced classes. This is the **default** for `cross_val_score` with classifiers in scikit-learn.

---

## Leave-One-Out Cross-Validation (LOOCV)

$K = n$ — each fold contains exactly one sample.

### Properties

| Property | LOOCV |
|----------|-------|
| **Bias** | Nearly unbiased (trains on $n-1$ samples) |
| **Variance** | High — folds are highly correlated (share $n-2$ samples) |
| **Computation** | $n$ model fits — expensive for large datasets |
| **Best for** | Very small datasets ($n < 100$) |

$$\text{CV}_{\text{LOO}} = \frac{1}{n}\sum_{i=1}^{n} L(y_i, \hat{f}^{(-i)}(x_i))$$

```python
from sklearn.model_selection import LeaveOneOut, cross_val_score
from sklearn.svm import SVC

# LOOCV on small dataset
from sklearn.datasets import load_wine
wine = load_wine()
X_wine, y_wine = wine.data, wine.target

loo = LeaveOneOut()
svc = SVC(kernel='rbf', C=1.0, random_state=42)

scores = cross_val_score(svc, X_wine, y_wine, cv=loo, scoring='accuracy')
print(f"LOOCV: {scores.mean():.4f} +/- {scores.std():.4f}")
print(f"Number of folds: {len(scores)}")
# LOO is feasible here because n=178
```

### LOOCV Shortcut for Linear Models

For linear regression, LOOCV can be computed in **closed form** without refitting:

$$\text{CV}_{\text{LOO}} = \frac{1}{n}\sum_{i=1}^{n}\left(\frac{y_i - \hat{y}_i}{1 - h_{ii}}\right)^2$$

where $h_{ii}$ is the $i$-th diagonal element of the hat matrix $H = X(X^TX)^{-1}X^T$. This avoids $n$ separate fits.

::: details Worked Example — LOOCV Shortcut for Linear Regression

**3 points: X = [[1,1],[1,2],[1,3]], y = [2, 4, 5]**

**Step 1:** Fit full model (OLS on all data)
  X^T X = [[3,6],[6,14]], (X^T X)^(-1) = (1/6)[[14,-6],[-6,3]]
  theta = (X^T X)^(-1) X^T y = (1/6)[[14,-6],[-6,3]] @ [11,28]
        = (1/6)[154-168, -66+84] = (1/6)[-14, 18] = [-2.33, 3.0]
  Wait, let me recompute... X^T y = [2+4+5, 1(2)+2(4)+3(5)] = [11, 25]
  theta = (1/6)[[14,-6],[-6,3]] @ [11, 25] = (1/6)[154-150, -66+75] = (1/6)[4, 9] = [0.667, 1.500]
  y_hat = [0.667+1.5, 0.667+3.0, 0.667+4.5] = [2.167, 3.667, 5.167]

**Step 2:** Compute H = X(X^T X)^(-1)X^T
  H diag: h11, h22, h33 (leverage values)
  For balanced design: h11 = 5/6, h22 = 2/6, h33 = 5/6
  (Simplified: h_ii values are typically between 1/n and 1)

**Step 3:** Apply LOOCV shortcut
  LOOCV = (1/3) * sum[(y_i - y_hat_i)^2 / (1-h_ii)^2]

  Residual_1 = 2 - 2.167 = -0.167, adjusted = -0.167/(1-5/6) = -0.167/0.167 = -1.0
  Residual_2 = 4 - 3.667 = 0.333, adjusted = 0.333/(1-2/6) = 0.333/0.667 = 0.500
  Residual_3 = 5 - 5.167 = -0.167, adjusted = -0.167/(1-5/6) = -1.0

  LOOCV MSE = (1.0^2 + 0.5^2 + 1.0^2)/3 = (1+0.25+1)/3 = 0.750

**Interpret:**
  "The LOOCV MSE is 0.750, computed from a single model fit using the hat matrix trick. Without the shortcut, we'd need to fit 3 separate models."

:::

```python
from sklearn.linear_model import LinearRegression
from sklearn.datasets import load_diabetes

diabetes = load_diabetes()
X_d, y_d = diabetes.data, diabetes.target

# Closed-form LOOCV for linear regression
reg = LinearRegression().fit(X_d, y_d)
y_hat = reg.predict(X_d)
H = X_d @ np.linalg.pinv(X_d.T @ X_d) @ X_d.T
h_ii = np.diag(H)

loocv_mse_closed = np.mean(((y_d - y_hat) / (1 - h_ii)) ** 2)
print(f"LOOCV MSE (closed form): {loocv_mse_closed:.2f}")

# Verify with brute-force LOOCV
loo = LeaveOneOut()
scores = cross_val_score(reg, X_d, y_d, cv=loo, scoring='neg_mean_squared_error')
loocv_mse_brute = -scores.mean()
print(f"LOOCV MSE (brute force): {loocv_mse_brute:.2f}")
# Both should match
```

---

## Time Series Split

### Why Standard KFold Fails for Time Series

Standard KFold randomly assigns samples to folds, which means future data leaks into training. For time series, you must always train on the past and evaluate on the future.

```
Standard KFold (WRONG for time series):
  Fold 1: Train=[2,3,4,5] Test=[1]    ← Training on future to predict past!

TimeSeriesSplit (CORRECT):
  Fold 1: Train=[1]       Test=[2]
  Fold 2: Train=[1,2]     Test=[3]
  Fold 3: Train=[1,2,3]   Test=[4]
  Fold 4: Train=[1,2,3,4] Test=[5]
```

```python
from sklearn.model_selection import TimeSeriesSplit
import matplotlib.pyplot as plt
import numpy as np

# Visualize TimeSeriesSplit
n_samples = 100
X_ts = np.arange(n_samples).reshape(-1, 1)
y_ts = np.sin(np.linspace(0, 4 * np.pi, n_samples)) + np.random.normal(0, 0.3, n_samples)

tscv = TimeSeriesSplit(n_splits=5)

fig, axes = plt.subplots(5, 1, figsize=(14, 8), sharex=True)

for fold, (train_idx, test_idx) in enumerate(tscv.split(X_ts)):
    ax = axes[fold]
    ax.scatter(train_idx, y_ts[train_idx], c='blue', s=10, label='Train')
    ax.scatter(test_idx, y_ts[test_idx], c='red', s=10, label='Test')
    ax.set_ylabel(f'Fold {fold+1}')
    ax.axvline(x=test_idx[0] - 0.5, color='black', linestyle='--', alpha=0.5)
    if fold == 0:
        ax.legend(loc='upper right')

plt.xlabel('Time Index')
plt.suptitle('TimeSeriesSplit — Always Train on Past, Test on Future', fontsize=13)
plt.tight_layout()
plt.savefig('time_series_split.png', dpi=150, bbox_inches='tight')
plt.show()
```

### TimeSeriesSplit with Gap

Prevent information leakage from adjacent windows:

```python
tscv_gap = TimeSeriesSplit(n_splits=5, gap=5)
# Gap of 5 samples between train and test prevents short-term autocorrelation leakage

for fold, (train_idx, test_idx) in enumerate(tscv_gap.split(X_ts)):
    print(f"Fold {fold+1}: Train [{train_idx[0]}..{train_idx[-1]}], "
          f"Gap [{train_idx[-1]+1}..{test_idx[0]-1}], "
          f"Test [{test_idx[0]}..{test_idx[-1]}]")
```

---

## Group K-Fold

### Problem: Data Leakage Through Groups

If multiple samples belong to the same group (same patient, same user, same store), standard KFold might put some samples from a group in training and others in test — the model "sees" the group during training.

```python
from sklearn.model_selection import GroupKFold, cross_val_score
from sklearn.ensemble import RandomForestClassifier
import numpy as np

# Medical dataset: multiple measurements per patient
np.random.seed(42)
n_patients = 50
samples_per_patient = np.random.randint(3, 10, n_patients)
n_total = samples_per_patient.sum()

X_med = np.random.randn(n_total, 10)
y_med = np.random.randint(0, 2, n_total)
groups = np.repeat(np.arange(n_patients), samples_per_patient)

print(f"Total samples: {n_total}")
print(f"Unique patients: {len(np.unique(groups))}")

# Standard KFold — WRONG (same patient in train and test)
rf = RandomForestClassifier(n_estimators=100, random_state=42)
scores_standard = cross_val_score(rf, X_med, y_med, cv=5, scoring='accuracy')
print(f"\nStandard KFold: {scores_standard.mean():.4f} +/- {scores_standard.std():.4f}")

# GroupKFold — CORRECT (entire patient in one split)
gkf = GroupKFold(n_splits=5)
scores_group = cross_val_score(rf, X_med, y_med, cv=gkf, groups=groups,
                                scoring='accuracy')
print(f"Group KFold:    {scores_group.mean():.4f} +/- {scores_group.std():.4f}")
# GroupKFold score is typically lower (more honest)
```

---

## Repeated K-Fold

Run K-Fold multiple times with different random shuffles to get a more stable estimate:

```python
from sklearn.model_selection import RepeatedStratifiedKFold, cross_val_score
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.datasets import load_breast_cancer

cancer = load_breast_cancer()
X_c, y_c = cancer.data, cancer.target

gb = GradientBoostingClassifier(n_estimators=100, random_state=42)

# Single 5-fold
scores_single = cross_val_score(gb, X_c, y_c, cv=5, scoring='accuracy')
print(f"Single 5-Fold: {scores_single.mean():.4f} +/- {scores_single.std():.4f}")

# Repeated 5-fold (10 repeats = 50 fits)
rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=42)
scores_repeated = cross_val_score(gb, X_c, y_c, cv=rskf, scoring='accuracy')
print(f"Repeated 5x10: {scores_repeated.mean():.4f} +/- {scores_repeated.std():.4f}")
# More stable standard deviation estimate
```

---

## Nested Cross-Validation

### The Problem: Optimistic Bias

Using the same CV loop for hyperparameter tuning AND evaluation gives optimistically biased results. The model is indirectly trained on the test fold.

### The Solution: Two Loops

- **Outer loop**: Evaluate model generalization (get unbiased score)
- **Inner loop**: Tune hyperparameters (find best settings)

```
Outer CV (5-fold):
  Fold 1: Train_outer=[2,3,4,5] → Inner CV (3-fold) → Best params → Test on [1]
  Fold 2: Train_outer=[1,3,4,5] → Inner CV (3-fold) → Best params → Test on [2]
  ...
Total fits: 5 outer × 3 inner × n_param_combos
```

```python
from sklearn.model_selection import (cross_val_score, GridSearchCV,
                                      StratifiedKFold)
from sklearn.svm import SVC
from sklearn.datasets import load_breast_cancer
import numpy as np

cancer = load_breast_cancer()
X_c, y_c = cancer.data, cancer.target

# ---- Non-nested CV (biased) ----
param_grid = {'C': [0.01, 0.1, 1, 10, 100], 'gamma': ['scale', 'auto']}

grid = GridSearchCV(SVC(kernel='rbf'), param_grid, cv=5, scoring='accuracy')
grid.fit(X_c, y_c)
print(f"Non-nested CV (biased): {grid.best_score_:.4f}")
print(f"Best params: {grid.best_params_}")

# ---- Nested CV (unbiased) ----
outer_cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
inner_cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)

nested_scores = []
for fold, (train_idx, test_idx) in enumerate(outer_cv.split(X_c, y_c)):
    X_train, X_test = X_c[train_idx], X_c[test_idx]
    y_train, y_test = y_c[train_idx], y_c[test_idx]

    # Inner loop: tune hyperparameters
    inner_grid = GridSearchCV(SVC(kernel='rbf'), param_grid,
                               cv=inner_cv, scoring='accuracy')
    inner_grid.fit(X_train, y_train)

    # Outer loop: evaluate with best params
    score = inner_grid.score(X_test, y_test)
    nested_scores.append(score)
    print(f"Fold {fold+1}: {score:.4f} (best params: {inner_grid.best_params_})")

nested_scores = np.array(nested_scores)
print(f"\nNested CV (unbiased): {nested_scores.mean():.4f} +/- {nested_scores.std():.4f}")
print(f"Non-nested (biased):  {grid.best_score_:.4f}")
print(f"Difference:           {grid.best_score_ - nested_scores.mean():.4f} (optimistic bias)")
```

---

## Practical Comparison

```python
from sklearn.model_selection import (KFold, StratifiedKFold, LeaveOneOut,
                                      TimeSeriesSplit, GroupKFold,
                                      RepeatedStratifiedKFold, cross_val_score)
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import load_breast_cancer
import numpy as np
import time

cancer = load_breast_cancer()
X, y = cancer.data, cancer.target

rf = RandomForestClassifier(n_estimators=50, random_state=42)

strategies = {
    'KFold(5)': KFold(n_splits=5, shuffle=True, random_state=42),
    'KFold(10)': KFold(n_splits=10, shuffle=True, random_state=42),
    'StratifiedKFold(5)': StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
    'StratifiedKFold(10)': StratifiedKFold(n_splits=10, shuffle=True, random_state=42),
    'Repeated(5x3)': RepeatedStratifiedKFold(n_splits=5, n_repeats=3, random_state=42),
}

print(f"{'Strategy':<25} {'Mean':>8} {'Std':>8} {'Folds':>6} {'Time(s)':>8}")
print("-" * 60)

for name, cv in strategies.items():
    start = time.time()
    scores = cross_val_score(rf, X, y, cv=cv, scoring='accuracy')
    elapsed = time.time() - start
    print(f"{name:<25} {scores.mean():8.4f} {scores.std():8.4f} "
          f"{len(scores):6d} {elapsed:8.2f}")
```

---

## Cross-Validation for Different Tasks

### Regression

```python
from sklearn.model_selection import cross_val_score
from sklearn.linear_model import Ridge
from sklearn.datasets import load_diabetes

diabetes = load_diabetes()
ridge = Ridge(alpha=1.0)

# Multiple metrics
for metric in ['neg_mean_squared_error', 'neg_mean_absolute_error', 'r2']:
    scores = cross_val_score(ridge, diabetes.data, diabetes.target,
                              cv=5, scoring=metric)
    print(f"{metric:<30}: {scores.mean():.4f} +/- {scores.std():.4f}")
```

### Multi-Metric Evaluation

```python
from sklearn.model_selection import cross_validate
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import load_breast_cancer

cancer = load_breast_cancer()
rf = RandomForestClassifier(n_estimators=100, random_state=42)

scoring = ['accuracy', 'precision', 'recall', 'f1', 'roc_auc']
results = cross_validate(rf, cancer.data, cancer.target,
                          cv=5, scoring=scoring, return_train_score=True)

print(f"{'Metric':<20} {'Train':>10} {'Test':>10}")
print("-" * 42)
for metric in scoring:
    train_mean = results[f'train_{metric}'].mean()
    test_mean = results[f'test_{metric}'].mean()
    print(f"{metric:<20} {train_mean:10.4f} {test_mean:10.4f}")
```

---

## Which CV Strategy to Use?

| Scenario | Strategy | Why |
|----------|----------|-----|
| Standard classification | StratifiedKFold(5) | Preserves class balance |
| Standard regression | KFold(5) or KFold(10) | No class to stratify |
| Time series | TimeSeriesSplit | Prevents future leakage |
| Grouped data (patients, users) | GroupKFold | Prevents group leakage |
| Very small dataset ($n < 100$) | LOOCV or Repeated KFold | Maximize training data |
| Hyperparameter tuning + evaluation | Nested CV | Unbiased performance estimate |
| High-variance estimate | RepeatedStratifiedKFold | Average over multiple random splits |
| Very large dataset ($n > 100K$) | Single hold-out or 3-fold | CV unnecessary, single split stable |

---

## Common Pitfalls

### Pitfall 1: Data Leakage in Preprocessing

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# WRONG: Scale before split → test data leaks into training
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)  # fits on ALL data including test
scores = cross_val_score(rf, X_scaled, y, cv=5)

# RIGHT: Scale inside CV → no leakage
pipeline = Pipeline([
    ('scaler', StandardScaler()),
    ('model', RandomForestClassifier(n_estimators=100, random_state=42))
])
scores = cross_val_score(pipeline, X, y, cv=5)
```

### Pitfall 2: Using CV Score to Report Final Performance

CV gives you an estimate of generalization. For the final model, train on ALL data and deploy. The CV score is your expected performance.

### Pitfall 3: Comparing Models on Different Folds

When comparing models, use the same CV folds:

```python
from sklearn.model_selection import StratifiedKFold

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

# Same folds for both models
scores_rf = cross_val_score(RandomForestClassifier(random_state=42),
                             X, y, cv=cv)
scores_svc = cross_val_score(SVC(random_state=42), X, y, cv=cv)

# Paired comparison
diffs = scores_rf - scores_svc
print(f"RF - SVC per fold: {diffs}")
print(f"Mean difference: {diffs.mean():.4f} +/- {diffs.std():.4f}")
```

---

## Key Takeaways

| Concept | Remember |
|---------|----------|
| Cross-validation estimates generalization error | More reliable than a single train/test split |
| $K = 5$ or $K = 10$ is standard | Good bias-variance tradeoff for the estimate |
| Always use StratifiedKFold for classification | Preserves class distribution in each fold |
| TimeSeriesSplit for temporal data | Never train on future, test on past |
| GroupKFold for grouped data | Same patient/user never in both train and test |
| Nested CV for unbiased tuned-model evaluation | Inner loop tunes, outer loop evaluates |
| Preprocessing inside the CV loop | Prevents data leakage from test into training |
| Same folds for model comparison | Paired comparison reduces variance |
