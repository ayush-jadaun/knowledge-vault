---
title: "Evaluation Metrics"
description: "Complete guide to ML evaluation metrics — classification (accuracy, precision, recall, F1, ROC-AUC, PR-AUC, log-loss, MCC) and regression (MSE, RMSE, MAE, R-squared, adjusted R-squared) with full math derivations, when to use which, and code examples."
tags: [machine-learning, evaluation-metrics, classification, regression, model-evaluation]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Evaluation Metrics

Choosing the wrong metric is as dangerous as choosing the wrong model. A model that achieves 99% accuracy on an imbalanced dataset may be useless. A regression model with low RMSE may still miss the trend. This page covers every metric you need, with full math and guidance on when to use each.

---

## Classification Metrics

### The Confusion Matrix

All binary classification metrics derive from four counts:

|  | Predicted Positive | Predicted Negative |
|--|---|---|
| **Actually Positive** | True Positive (TP) | False Negative (FN) |
| **Actually Negative** | False Positive (FP) | True Negative (TN) |

```python
# confusion_matrix.py — Building the confusion matrix
import numpy as np
from sklearn.metrics import confusion_matrix

y_true = np.array([1, 1, 1, 1, 0, 0, 0, 0, 0, 0])
y_pred = np.array([1, 1, 0, 0, 0, 0, 0, 0, 1, 0])

cm = confusion_matrix(y_true, y_pred)
tn, fp, fn, tp = cm.ravel()

print(f"True Positives  (TP): {tp}")
print(f"False Positives (FP): {fp}")
print(f"False Negatives (FN): {fn}")
print(f"True Negatives  (TN): {tn}")
```

### Accuracy

$$\text{Accuracy} = \frac{TP + TN}{TP + TN + FP + FN}$$

**When to use:** Balanced classes only.
**When NOT to use:** Imbalanced data — if 99% negative, predicting all negative = 99% accuracy but 0% detection.

### Precision

$$\text{Precision} = \frac{TP}{TP + FP}$$

"Of all the items I predicted positive, how many were actually positive?"

**When to use:** When false positives are costly (spam filter — do not put legitimate email in spam).

### Recall (Sensitivity, True Positive Rate)

$$\text{Recall} = \frac{TP}{TP + FN}$$

"Of all the actually positive items, how many did I catch?"

**When to use:** When false negatives are costly (disease screening — do not miss a sick patient).

### F1 Score

The harmonic mean of precision and recall:

$$F_1 = 2 \cdot \frac{\text{Precision} \cdot \text{Recall}}{\text{Precision} + \text{Recall}} = \frac{2TP}{2TP + FP + FN}$$

**Why harmonic mean?** It penalizes extreme imbalances. If precision = 1.0 and recall = 0.01, then:
- Arithmetic mean = 0.505 (misleadingly high)
- Harmonic mean = 0.0198 (correctly low)

### F-beta Score

Generalization that lets you weight precision vs recall:

$$F_\beta = (1 + \beta^2) \cdot \frac{\text{Precision} \cdot \text{Recall}}{\beta^2 \cdot \text{Precision} + \text{Recall}}$$

- $\beta = 1$: Standard F1 (equal weight)
- $\beta = 0.5$: Weights precision more
- $\beta = 2$: Weights recall more

```python
# classification_metrics.py — All classification metrics
import numpy as np
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    fbeta_score, matthews_corrcoef, log_loss, roc_auc_score,
    average_precision_score, classification_report
)

# Simulated predictions
np.random.seed(42)
y_true = np.array([1]*100 + [0]*900)  # 10% positive
y_pred = np.random.choice([0, 1], 1000, p=[0.85, 0.15])
y_proba = np.random.beta(2, 5, 1000)  # probability estimates
y_proba[y_true == 1] += 0.3  # make positive class have higher probabilities
y_proba = np.clip(y_proba, 0, 1)

print("=== Classification Metrics ===\n")
print(f"Accuracy:           {accuracy_score(y_true, y_pred):.4f}")
print(f"Precision:          {precision_score(y_true, y_pred):.4f}")
print(f"Recall:             {recall_score(y_true, y_pred):.4f}")
print(f"F1 Score:           {f1_score(y_true, y_pred):.4f}")
print(f"F0.5 (prec-heavy):  {fbeta_score(y_true, y_pred, beta=0.5):.4f}")
print(f"F2 (recall-heavy):  {fbeta_score(y_true, y_pred, beta=2):.4f}")
print(f"MCC:                {matthews_corrcoef(y_true, y_pred):.4f}")
print(f"ROC-AUC:            {roc_auc_score(y_true, y_proba):.4f}")
print(f"PR-AUC:             {average_precision_score(y_true, y_proba):.4f}")
print(f"Log Loss:           {log_loss(y_true, y_proba):.4f}")
```

### Matthews Correlation Coefficient (MCC)

MCC uses all four confusion matrix values and works well even with imbalanced data:

$$\text{MCC} = \frac{TP \cdot TN - FP \cdot FN}{\sqrt{(TP+FP)(TP+FN)(TN+FP)(TN+FN)}}$$

- MCC = +1: Perfect prediction
- MCC = 0: Random prediction
- MCC = -1: Total disagreement

```python
# mcc.py — Why MCC is superior for imbalanced data
import numpy as np
from sklearn.metrics import accuracy_score, f1_score, matthews_corrcoef

# Scenario: 99% negative, model predicts all negative
y_true = np.array([0]*990 + [1]*10)
y_pred_all_neg = np.zeros(1000, dtype=int)

print("Model: Predict all negative (on 99% negative data)")
print(f"  Accuracy: {accuracy_score(y_true, y_pred_all_neg):.4f}")  # 0.99 — misleading!
print(f"  F1:       {f1_score(y_true, y_pred_all_neg):.4f}")        # 0.00 — correct
print(f"  MCC:      {matthews_corrcoef(y_true, y_pred_all_neg):.4f}")  # 0.00 — correct

# Model that catches 8 out of 10 positives
y_pred_good = np.zeros(1000, dtype=int)
y_pred_good[990:998] = 1  # catches 8 positives
y_pred_good[50:60] = 1    # 10 false positives

print("\nModel: Catches 8/10 positives with 10 false positives")
print(f"  Accuracy: {accuracy_score(y_true, y_pred_good):.4f}")
print(f"  F1:       {f1_score(y_true, y_pred_good):.4f}")
print(f"  MCC:      {matthews_corrcoef(y_true, y_pred_good):.4f}")
```

### ROC-AUC

The **Receiver Operating Characteristic** curve plots True Positive Rate vs False Positive Rate at all thresholds.

$$\text{TPR} = \frac{TP}{TP + FN}, \quad \text{FPR} = \frac{FP}{FP + TN}$$

**AUC** (Area Under the ROC Curve) measures the probability that a randomly chosen positive example is ranked higher than a randomly chosen negative example.

- AUC = 1.0: Perfect
- AUC = 0.5: Random
- AUC < 0.5: Worse than random (flip predictions)

```python
# roc_auc.py — ROC curve and AUC
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import roc_curve, auc

data = load_breast_cancer()
X, y = data.data, data.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

models = {
    'Logistic Regression': make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000)),
    'Random Forest': RandomForestClassifier(n_estimators=100, random_state=42),
}

plt.figure(figsize=(8, 6))

for name, model in models.items():
    model.fit(X_train, y_train)
    y_proba = model.predict_proba(X_test)[:, 1]
    fpr, tpr, thresholds = roc_curve(y_test, y_proba)
    roc_auc = auc(fpr, tpr)
    plt.plot(fpr, tpr, linewidth=2, label=f'{name} (AUC={roc_auc:.3f})')

plt.plot([0, 1], [0, 1], 'k--', label='Random (AUC=0.5)')
plt.xlabel('False Positive Rate')
plt.ylabel('True Positive Rate')
plt.title('ROC Curves')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('roc_curves.png', dpi=150)
plt.show()
```

### PR-AUC (Precision-Recall AUC)

For imbalanced datasets, PR-AUC is more informative than ROC-AUC. ROC-AUC can be misleadingly high when negatives vastly outnumber positives.

```python
# pr_auc.py — Precision-Recall curve
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import precision_recall_curve, auc, average_precision_score

# Imbalanced dataset
X, y = make_classification(n_samples=5000, weights=[0.95, 0.05], random_state=42)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)
y_proba = model.predict_proba(X_test)[:, 1]

precision, recall, thresholds = precision_recall_curve(y_test, y_proba)
pr_auc = auc(recall, precision)
ap = average_precision_score(y_test, y_proba)

print(f"PR-AUC: {pr_auc:.4f}")
print(f"Average Precision: {ap:.4f}")

baseline = y_test.mean()
print(f"Baseline (random): {baseline:.4f}")

plt.figure(figsize=(8, 6))
plt.plot(recall, precision, 'b-', linewidth=2, label=f'Model (AP={ap:.3f})')
plt.axhline(y=baseline, color='r', linestyle='--', label=f'Baseline ({baseline:.3f})')
plt.xlabel('Recall')
plt.ylabel('Precision')
plt.title('Precision-Recall Curve')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('pr_curve.png', dpi=150)
plt.show()
```

### Log Loss (Binary Cross-Entropy)

$$\text{Log Loss} = -\frac{1}{n}\sum_{i=1}^n [y_i \log(\hat{p}_i) + (1 - y_i)\log(1 - \hat{p}_i)]$$

Log loss measures the quality of probability estimates, not just binary predictions. It penalizes confident wrong predictions heavily.

```python
# log_loss_demo.py — Why log loss matters for probability calibration
import numpy as np
from sklearn.metrics import log_loss

# True label: positive (1)
y_true = [1]

# Confident and correct: low loss
print(f"P(1)=0.99: log_loss = {log_loss(y_true, [[0.01, 0.99]]):.4f}")

# Slightly confident: moderate loss
print(f"P(1)=0.70: log_loss = {log_loss(y_true, [[0.30, 0.70]]):.4f}")

# Uncertain: higher loss
print(f"P(1)=0.51: log_loss = {log_loss(y_true, [[0.49, 0.51]]):.4f}")

# Confident and WRONG: very high loss
print(f"P(1)=0.01: log_loss = {log_loss(y_true, [[0.99, 0.01]]):.4f}")
```

---

## Regression Metrics

### Mean Squared Error (MSE)

$$\text{MSE} = \frac{1}{n}\sum_{i=1}^n (y_i - \hat{y}_i)^2$$

Properties:
- Always non-negative
- Penalizes large errors quadratically
- Units are target-units-squared

### Root Mean Squared Error (RMSE)

$$\text{RMSE} = \sqrt{\text{MSE}} = \sqrt{\frac{1}{n}\sum_{i=1}^n (y_i - \hat{y}_i)^2}$$

Properties:
- Same units as target variable
- Sensitive to outliers (due to squaring)

### Mean Absolute Error (MAE)

$$\text{MAE} = \frac{1}{n}\sum_{i=1}^n |y_i - \hat{y}_i|$$

Properties:
- Same units as target
- More robust to outliers than RMSE
- Linear penalty for all errors

### R-Squared ($R^2$)

$$R^2 = 1 - \frac{\sum_{i=1}^n (y_i - \hat{y}_i)^2}{\sum_{i=1}^n (y_i - \bar{y})^2} = 1 - \frac{SS_{res}}{SS_{tot}}$$

Properties:
- $R^2 = 1$: Perfect prediction
- $R^2 = 0$: Model is as good as predicting the mean
- $R^2 < 0$: Model is worse than predicting the mean
- Can be arbitrarily negative for bad models

**Derivation:**
$SS_{tot}$ is the total variance in $y$. $SS_{res}$ is the unexplained variance. $R^2$ is the fraction of variance explained by the model.

### Adjusted R-Squared

Standard $R^2$ always increases (or stays the same) when you add features — even useless ones. Adjusted $R^2$ penalizes complexity:

$$R^2_{adj} = 1 - \frac{(1 - R^2)(n - 1)}{n - d - 1}$$

where $n$ is the number of samples and $d$ is the number of features.

```python
# regression_metrics.py — All regression metrics
import numpy as np
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import (
    mean_squared_error, mean_absolute_error, r2_score,
    mean_absolute_percentage_error, median_absolute_error
)

housing = fetch_california_housing()
X, y = housing.data, housing.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = GradientBoostingRegressor(n_estimators=200, random_state=42)
model.fit(X_train, y_train)
y_pred = model.predict(X_test)

mse = mean_squared_error(y_test, y_pred)
rmse = np.sqrt(mse)
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)
mape = mean_absolute_percentage_error(y_test, y_pred)
med_ae = median_absolute_error(y_test, y_pred)

# Adjusted R²
n = len(y_test)
d = X_test.shape[1]
r2_adj = 1 - (1 - r2) * (n - 1) / (n - d - 1)

print("=== Regression Metrics ===\n")
print(f"MSE:          {mse:.4f}")
print(f"RMSE:         {rmse:.4f}")
print(f"MAE:          {mae:.4f}")
print(f"Median AE:    {med_ae:.4f}")
print(f"MAPE:         {mape:.4f} ({mape*100:.2f}%)")
print(f"R²:           {r2:.4f}")
print(f"Adjusted R²:  {r2_adj:.4f}")

# Baseline comparison
baseline_pred = np.full_like(y_test, y_train.mean())
baseline_rmse = np.sqrt(mean_squared_error(y_test, baseline_pred))
print(f"\nBaseline RMSE (predict mean): {baseline_rmse:.4f}")
print(f"Model improves by: {(1 - rmse/baseline_rmse)*100:.1f}%")
```

### RMSE vs MAE: When to Use Which

```python
# rmse_vs_mae.py — Sensitivity to outliers
import numpy as np
from sklearn.metrics import mean_squared_error, mean_absolute_error

# True values
y_true = np.array([10, 20, 30, 40, 50])

# Predictions with one outlier error
y_pred_good = np.array([11, 19, 31, 39, 51])  # all close
y_pred_outlier = np.array([11, 19, 31, 39, 80])  # one big error on last

for name, y_pred in [("Good", y_pred_good), ("One outlier", y_pred_outlier)]:
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    mae = mean_absolute_error(y_true, y_pred)
    print(f"{name:12s}: RMSE={rmse:.2f}, MAE={mae:.2f}, RMSE/MAE={rmse/mae:.2f}")

# RMSE/MAE > 1 always. The ratio increases with outliers.
# If all errors equal: RMSE/MAE = 1
# As outlier errors increase: RMSE/MAE increases
```

---

## When to Use Which Metric

### Classification

| Metric | Use When | Avoid When |
|--------|---------|-----------|
| **Accuracy** | Balanced classes | Imbalanced data |
| **Precision** | FP is costly (spam filter) | FN is more important |
| **Recall** | FN is costly (disease detection) | FP is more important |
| **F1** | Need balance of precision/recall | One matters much more |
| **F2** | Recall is 2x more important | Precision matters more |
| **ROC-AUC** | Comparing models, balanced | Heavily imbalanced data |
| **PR-AUC** | Imbalanced data | Balanced data (use ROC-AUC) |
| **MCC** | Imbalanced data, single number | Need threshold-free metric |
| **Log Loss** | Need calibrated probabilities | Only need class labels |

### Regression

| Metric | Use When | Properties |
|--------|---------|-----------|
| **MSE** | Standard loss function | Penalizes large errors |
| **RMSE** | Want interpretable units | Sensitive to outliers |
| **MAE** | Robust to outliers needed | Linear penalty |
| **MAPE** | Relative error matters | Fails when $y$ near zero |
| **R-squared** | Compare to baseline | Can be negative |
| **Adjusted R-squared** | Comparing models with different features | Penalizes complexity |

---

## Multi-Class Metrics

### Averaging Strategies

For $K$ classes, precision/recall/F1 are computed per-class, then averaged:

| Strategy | Formula | When |
|----------|---------|------|
| **Macro** | $\frac{1}{K}\sum_{k=1}^K \text{metric}_k$ | All classes equally important |
| **Weighted** | $\sum_{k=1}^K \frac{n_k}{n} \text{metric}_k$ | Proportional to class size |
| **Micro** | Compute from total TP, FP, FN | Equivalent to accuracy |

```python
# multiclass_metrics.py — Multi-class evaluation
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    classification_report, accuracy_score,
    precision_score, recall_score, f1_score
)
import numpy as np

iris = load_iris()
X, y = iris.data, iris.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)
y_pred = model.predict(X_test)

print("Per-class report:")
print(classification_report(y_test, y_pred, target_names=iris.target_names))

for avg in ['macro', 'weighted', 'micro']:
    p = precision_score(y_test, y_pred, average=avg)
    r = recall_score(y_test, y_pred, average=avg)
    f = f1_score(y_test, y_pred, average=avg)
    print(f"{avg:>10}: P={p:.4f}, R={r:.4f}, F1={f:.4f}")
```

---

## Metric Selection Framework

```python
# metric_selection.py — Decision tree for metric selection
def recommend_metric(task, class_balance, cost_priority, need_probabilities):
    """Recommend the best metric based on problem characteristics."""

    if task == 'regression':
        print("Regression metrics:")
        print("  Primary: RMSE (interpretable units)")
        print("  Also report: MAE (robust to outliers), R² (vs baseline)")
        return

    # Classification
    if class_balance == 'balanced':
        if need_probabilities:
            metric = "Log Loss (for probability quality) + ROC-AUC"
        else:
            metric = "F1-Score (macro for multi-class)"
    else:  # imbalanced
        if cost_priority == 'false_negatives':
            metric = "Recall + F2-Score + PR-AUC"
        elif cost_priority == 'false_positives':
            metric = "Precision + F0.5-Score"
        else:
            metric = "MCC + PR-AUC (most robust for imbalanced)"

    print(f"Recommended: {metric}")

# Examples
print("=== Disease screening ===")
recommend_metric('classification', 'imbalanced', 'false_negatives', True)

print("\n=== Spam filter ===")
recommend_metric('classification', 'imbalanced', 'false_positives', True)

print("\n=== House price prediction ===")
recommend_metric('regression', 'n/a', 'n/a', False)

print("\n=== Balanced binary classification ===")
recommend_metric('classification', 'balanced', 'equal', True)
```

---

## Cross-Validated Evaluation

```python
# cv_evaluation.py — Robust evaluation with cross-validation
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_validate, StratifiedKFold
import numpy as np

data = load_breast_cancer()
X, y = data.data, data.target

cv = StratifiedKFold(n_splits=10, shuffle=True, random_state=42)
model = RandomForestClassifier(n_estimators=100, random_state=42)

scoring = {
    'accuracy': 'accuracy',
    'precision': 'precision',
    'recall': 'recall',
    'f1': 'f1',
    'roc_auc': 'roc_auc',
    'mcc': 'matthews_corrcoef',
}

results = cross_validate(model, X, y, cv=cv, scoring=scoring)

print(f"{'Metric':<15} {'Mean':>10} {'Std':>8} {'Min':>10} {'Max':>10}")
print("-" * 55)
for metric in scoring:
    values = results[f'test_{metric}']
    print(f"{metric:<15} {values.mean():>10.4f} {values.std():>8.4f} "
          f"{values.min():>10.4f} {values.max():>10.4f}")
```

---

## Quick Reference

### Classification

| Metric | Formula | Range | Higher is Better |
|--------|---------|-------|-----------------|
| Accuracy | $(TP+TN) / (TP+TN+FP+FN)$ | $[0, 1]$ | Yes |
| Precision | $TP / (TP+FP)$ | $[0, 1]$ | Yes |
| Recall | $TP / (TP+FN)$ | $[0, 1]$ | Yes |
| F1 | $2 \cdot \frac{P \cdot R}{P + R}$ | $[0, 1]$ | Yes |
| ROC-AUC | Area under ROC | $[0, 1]$ | Yes |
| PR-AUC | Area under PR curve | $[0, 1]$ | Yes |
| MCC | $\frac{TP \cdot TN - FP \cdot FN}{\sqrt{\ldots}}$ | $[-1, 1]$ | Yes |
| Log Loss | $-\frac{1}{n}\sum y\log\hat{p}$ | $[0, \infty)$ | No (lower) |

### Regression

| Metric | Formula | Range | Lower is Better |
|--------|---------|-------|----------------|
| MSE | $\frac{1}{n}\sum(y-\hat{y})^2$ | $[0, \infty)$ | Yes |
| RMSE | $\sqrt{MSE}$ | $[0, \infty)$ | Yes |
| MAE | $\frac{1}{n}\sum|y-\hat{y}|$ | $[0, \infty)$ | Yes |
| R-squared | $1 - SS_{res}/SS_{tot}$ | $(-\infty, 1]$ | No (higher) |
| MAPE | $\frac{1}{n}\sum|y-\hat{y}|/|y|$ | $[0, \infty)$ | Yes |

---

## Further Reading

- **[ML Workflow](/machine-learning/ml-workflow)** — Where evaluation fits in the pipeline
- **[Data Preparation](/machine-learning/data-preparation)** — Handling imbalanced data
- **[Logistic Regression](/machine-learning/logistic-regression)** — ROC and PR curves in practice
- **[Linear Regression](/machine-learning/linear-regression)** — Regression diagnostics and R-squared
