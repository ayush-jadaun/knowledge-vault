---
title: "Logistic Regression"
description: "Complete guide to logistic regression — sigmoid function, log-odds interpretation, maximum likelihood estimation derivation, decision boundaries, from-scratch NumPy implementation, confusion matrix, ROC/PR curves, Breast Cancer dataset end-to-end."
tags: [machine-learning, logistic-regression, classification, sigmoid, maximum-likelihood]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Logistic Regression

Despite its name, logistic regression is a **classification** algorithm. It models the probability that an input belongs to a class using the logistic (sigmoid) function. It is the foundation of neural network neurons and remains one of the best baselines for binary classification.

---

## From Linear to Logistic

Linear regression predicts a continuous value: $\hat{y} = \mathbf{w}^T\mathbf{x} + b$. But for classification, we need a probability $P(y=1|\mathbf{x}) \in [0, 1]$.

The **sigmoid function** maps any real number to $(0, 1)$:

$$\sigma(z) = \frac{1}{1 + e^{-z}}$$

Properties of sigmoid:
- $\sigma(0) = 0.5$
- $\sigma(z) \to 1$ as $z \to +\infty$
- $\sigma(z) \to 0$ as $z \to -\infty$
- $\sigma(-z) = 1 - \sigma(z)$ (symmetric)
- $\sigma'(z) = \sigma(z)(1 - \sigma(z))$

```python
# sigmoid.py — The sigmoid function and its properties
import numpy as np
import matplotlib.pyplot as plt

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

z = np.linspace(-8, 8, 200)

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# Sigmoid function
axes[0].plot(z, sigmoid(z), 'b-', linewidth=2)
axes[0].axhline(y=0.5, color='gray', linestyle='--', alpha=0.5)
axes[0].axvline(x=0, color='gray', linestyle='--', alpha=0.5)
axes[0].set_xlabel('z')
axes[0].set_ylabel('σ(z)')
axes[0].set_title('Sigmoid Function')
axes[0].grid(True, alpha=0.3)

# Sigmoid derivative
deriv = sigmoid(z) * (1 - sigmoid(z))
axes[1].plot(z, deriv, 'r-', linewidth=2)
axes[1].set_xlabel('z')
axes[1].set_ylabel("σ'(z)")
axes[1].set_title("Sigmoid Derivative: σ(z)(1 - σ(z))")
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('sigmoid.png', dpi=150)
plt.show()

# Key values
for z_val in [-5, -2, 0, 2, 5]:
    print(f"σ({z_val:+d}) = {sigmoid(z_val):.4f}")
```

### The Logistic Regression Model

$$P(y = 1 | \mathbf{x}) = \sigma(\mathbf{w}^T\mathbf{x} + b) = \frac{1}{1 + e^{-(\mathbf{w}^T\mathbf{x} + b)}}$$

### Log-Odds Interpretation

Taking the inverse sigmoid (logit), we get:

$$\log \frac{P(y=1)}{P(y=0)} = \mathbf{w}^T\mathbf{x} + b$$

The left side is the **log-odds** (logit). Logistic regression is **linear in the log-odds**. Each weight $w_j$ tells you: a one-unit increase in $x_j$ changes the log-odds by $w_j$, which multiplies the odds by $e^{w_j}$.

```python
# log_odds.py — Interpreting coefficients as odds ratios
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.datasets import load_breast_cancer

data = load_breast_cancer()
X, y = data.data, data.target

model = LogisticRegression(max_iter=5000, C=1.0)
model.fit(X, y)

# Coefficients → odds ratios
print("Feature Interpretations (top 5 by |coefficient|):")
coef_abs = np.abs(model.coef_[0])
top5 = np.argsort(coef_abs)[-5:][::-1]

for idx in top5:
    coef = model.coef_[0][idx]
    odds_ratio = np.exp(coef)
    name = data.feature_names[idx]
    direction = "increases" if coef > 0 else "decreases"
    print(f"  {name}: coef={coef:.4f}, OR={odds_ratio:.4f}")
    print(f"    → 1 unit increase {direction} odds of benign by {abs(odds_ratio - 1)*100:.1f}%")
```

---

## Maximum Likelihood Estimation (MLE)

### Why Not MSE?

For classification, MSE with sigmoid creates a non-convex loss function with many local minima. MLE with the log-likelihood is convex and has a unique global minimum.

### Derivation

For a single sample $(x_i, y_i)$ where $y_i \in \{0, 1\}$:

$$P(y_i | x_i) = \hat{p}_i^{y_i} (1 - \hat{p}_i)^{1 - y_i}$$

where $\hat{p}_i = \sigma(\mathbf{w}^T\mathbf{x}_i + b)$.

The likelihood for all $n$ samples:

$$\mathcal{L}(\mathbf{w}, b) = \prod_{i=1}^n \hat{p}_i^{y_i} (1 - \hat{p}_i)^{1 - y_i}$$

The log-likelihood:

$$\ell(\mathbf{w}, b) = \sum_{i=1}^n \left[ y_i \log \hat{p}_i + (1 - y_i) \log(1 - \hat{p}_i) \right]$$

We maximize $\ell$ or equivalently minimize the **negative log-likelihood** (binary cross-entropy):

$$J(\mathbf{w}, b) = -\frac{1}{n} \sum_{i=1}^n \left[ y_i \log \hat{p}_i + (1 - y_i) \log(1 - \hat{p}_i) \right]$$

### Gradient Derivation

The gradient of the cross-entropy loss with respect to weight $w_j$:

$$\frac{\partial J}{\partial w_j} = \frac{1}{n} \sum_{i=1}^n (\hat{p}_i - y_i) x_{ij}$$

In matrix form:

$$\nabla_{\mathbf{w}} J = \frac{1}{n} \mathbf{X}^T (\hat{\mathbf{p}} - \mathbf{y})$$

This is remarkably clean: the gradient is the same as linear regression but with $\hat{p}$ instead of $\hat{y}$.

---

## From-Scratch Implementation

```python
# logistic_from_scratch.py — Complete logistic regression in NumPy
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, classification_report

class LogisticRegressionScratch:
    """Binary logistic regression from scratch using gradient descent."""

    def __init__(self, learning_rate=0.01, n_iterations=1000, tol=1e-6):
        self.lr = learning_rate
        self.n_iterations = n_iterations
        self.tol = tol
        self.weights = None
        self.bias = None
        self.loss_history = []

    def _sigmoid(self, z):
        # Clip to prevent overflow
        z = np.clip(z, -500, 500)
        return 1 / (1 + np.exp(-z))

    def _compute_loss(self, y, y_pred):
        """Binary cross-entropy loss."""
        eps = 1e-15  # prevent log(0)
        y_pred = np.clip(y_pred, eps, 1 - eps)
        return -np.mean(y * np.log(y_pred) + (1 - y) * np.log(1 - y_pred))

    def fit(self, X, y):
        n_samples, n_features = X.shape
        self.weights = np.zeros(n_features)
        self.bias = 0.0
        self.loss_history = []

        for i in range(self.n_iterations):
            # Forward pass
            z = X @ self.weights + self.bias
            y_pred = self._sigmoid(z)

            # Compute loss
            loss = self._compute_loss(y, y_pred)
            self.loss_history.append(loss)

            # Compute gradients
            error = y_pred - y
            dw = (1 / n_samples) * (X.T @ error)
            db = (1 / n_samples) * np.sum(error)

            # Update parameters
            self.weights -= self.lr * dw
            self.bias -= self.lr * db

            # Check convergence
            if i > 0 and abs(self.loss_history[-2] - loss) < self.tol:
                print(f"Converged at iteration {i}")
                break

        return self

    def predict_proba(self, X):
        z = X @ self.weights + self.bias
        return self._sigmoid(z)

    def predict(self, X, threshold=0.5):
        return (self.predict_proba(X) >= threshold).astype(int)


# Test on Breast Cancer dataset
data = load_breast_cancer()
X, y = data.data, data.target

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Feature scaling is critical for gradient descent
scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

# Train from scratch
model = LogisticRegressionScratch(learning_rate=0.1, n_iterations=500)
model.fit(X_train_s, y_train)

y_pred = model.predict(X_test_s)
print(f"\nFrom-scratch accuracy: {accuracy_score(y_test, y_pred):.4f}")
print(f"Final loss: {model.loss_history[-1]:.6f}")

# Compare with scikit-learn
from sklearn.linear_model import LogisticRegression
sk_model = LogisticRegression(max_iter=500)
sk_model.fit(X_train_s, y_train)
sk_pred = sk_model.predict(X_test_s)
print(f"sklearn accuracy:     {accuracy_score(y_test, sk_pred):.4f}")
```

---

## Decision Boundaries

The decision boundary is where $P(y=1|\mathbf{x}) = 0.5$, which means $\mathbf{w}^T\mathbf{x} + b = 0$. For 2D features, this is a straight line.

```python
# decision_boundary.py — Visualizing the decision boundary
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

# Create 2D dataset for visualization
X, y = make_classification(
    n_samples=300, n_features=2, n_redundant=0,
    n_informative=2, n_clusters_per_class=1, random_state=42
)

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

model = LogisticRegression()
model.fit(X_scaled, y)

# Create mesh grid
x_min, x_max = X_scaled[:, 0].min() - 1, X_scaled[:, 0].max() + 1
y_min, y_max = X_scaled[:, 1].min() - 1, X_scaled[:, 1].max() + 1
xx, yy = np.meshgrid(np.arange(x_min, x_max, 0.02),
                      np.arange(y_min, y_max, 0.02))
Z = model.predict_proba(np.c_[xx.ravel(), yy.ravel()])[:, 1]
Z = Z.reshape(xx.shape)

plt.figure(figsize=(10, 8))
plt.contourf(xx, yy, Z, levels=np.linspace(0, 1, 21), cmap='RdYlBu', alpha=0.8)
plt.colorbar(label='P(y=1)')
plt.scatter(X_scaled[y==0, 0], X_scaled[y==0, 1], c='blue', marker='o',
            edgecolors='black', s=40, label='Class 0')
plt.scatter(X_scaled[y==1, 0], X_scaled[y==1, 1], c='red', marker='s',
            edgecolors='black', s=40, label='Class 1')

# Draw the decision boundary (where P = 0.5)
plt.contour(xx, yy, Z, levels=[0.5], colors='black', linewidths=2)

plt.xlabel('Feature 1')
plt.ylabel('Feature 2')
plt.title('Logistic Regression Decision Boundary')
plt.legend()
plt.tight_layout()
plt.savefig('decision_boundary.png', dpi=150)
plt.show()

print(f"Weights: {model.coef_[0].round(4)}")
print(f"Bias: {model.intercept_[0]:.4f}")
print(f"Decision boundary: {model.coef_[0][0]:.3f}*x1 + {model.coef_[0][1]:.3f}*x2 + {model.intercept_[0]:.3f} = 0")
```

---

## Confusion Matrix and Classification Metrics

```python
# confusion_matrix.py — Complete classification evaluation
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    confusion_matrix, classification_report,
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score
)

data = load_breast_cancer()
X, y = data.data, data.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

model = LogisticRegression(max_iter=5000)
model.fit(X_train_s, y_train)

y_pred = model.predict(X_test_s)
y_proba = model.predict_proba(X_test_s)[:, 1]

# Confusion matrix
cm = confusion_matrix(y_test, y_pred)
tn, fp, fn, tp = cm.ravel()

print("Confusion Matrix:")
print(f"              Predicted")
print(f"              Neg    Pos")
print(f"Actual Neg   {tn:4d}   {fp:4d}")
print(f"Actual Pos   {fn:4d}   {tp:4d}")

print(f"\nAccuracy:  {accuracy_score(y_test, y_pred):.4f}")
print(f"Precision: {precision_score(y_test, y_pred):.4f}")
print(f"Recall:    {recall_score(y_test, y_pred):.4f}")
print(f"F1:        {f1_score(y_test, y_pred):.4f}")
print(f"ROC-AUC:   {roc_auc_score(y_test, y_proba):.4f}")
print(f"PR-AUC:    {average_precision_score(y_test, y_proba):.4f}")

# Full classification report
print(f"\n{classification_report(y_test, y_pred, target_names=data.target_names)}")
```

---

## ROC and Precision-Recall Curves

```python
# roc_pr.py — ROC and PR curves
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_curve, precision_recall_curve, auc

data = load_breast_cancer()
X, y = data.data, data.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

scaler = StandardScaler()
model = LogisticRegression(max_iter=5000)
model.fit(scaler.fit_transform(X_train), y_train)
y_proba = model.predict_proba(scaler.transform(X_test))[:, 1]

fig, axes = plt.subplots(1, 2, figsize=(14, 6))

# ROC Curve
fpr, tpr, roc_thresholds = roc_curve(y_test, y_proba)
roc_auc = auc(fpr, tpr)
axes[0].plot(fpr, tpr, 'b-', linewidth=2, label=f'Logistic Regression (AUC={roc_auc:.3f})')
axes[0].plot([0, 1], [0, 1], 'k--', label='Random')
axes[0].set_xlabel('False Positive Rate')
axes[0].set_ylabel('True Positive Rate')
axes[0].set_title('ROC Curve')
axes[0].legend()
axes[0].grid(True, alpha=0.3)

# PR Curve
precision, recall, pr_thresholds = precision_recall_curve(y_test, y_proba)
pr_auc = auc(recall, precision)
axes[1].plot(recall, precision, 'r-', linewidth=2, label=f'Logistic Regression (AUC={pr_auc:.3f})')
baseline = y_test.sum() / len(y_test)
axes[1].axhline(y=baseline, color='k', linestyle='--', label=f'Baseline ({baseline:.2f})')
axes[1].set_xlabel('Recall')
axes[1].set_ylabel('Precision')
axes[1].set_title('Precision-Recall Curve')
axes[1].legend()
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('roc_pr_curves.png', dpi=150)
plt.show()
```

---

## Multi-Class Logistic Regression

For $K > 2$ classes, logistic regression generalizes to **softmax regression**:

$$P(y = k | \mathbf{x}) = \frac{e^{\mathbf{w}_k^T \mathbf{x} + b_k}}{\sum_{j=1}^{K} e^{\mathbf{w}_j^T \mathbf{x} + b_j}}$$

The loss becomes categorical cross-entropy:

$$J = -\frac{1}{n}\sum_{i=1}^n \sum_{k=1}^K y_{ik} \log \hat{p}_{ik}$$

```python
# multiclass.py — Softmax regression on Iris dataset
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix
import numpy as np

iris = load_iris()
X, y = iris.data, iris.target

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

# multi_class='multinomial' uses softmax
model = LogisticRegression(
    multi_class='multinomial',
    solver='lbfgs',
    max_iter=1000
)
model.fit(X_train_s, y_train)

y_pred = model.predict(X_test_s)
y_proba = model.predict_proba(X_test_s)

print(classification_report(y_test, y_pred, target_names=iris.target_names))
print(f"Confusion Matrix:\n{confusion_matrix(y_test, y_pred)}")

# Show probabilities for first 5 test samples
print("\nPredicted probabilities (first 5):")
for i in range(5):
    probs = y_proba[i]
    pred = iris.target_names[y_pred[i]]
    actual = iris.target_names[y_test[i]]
    print(f"  {actual:>10} → {pred:>10}: {probs.round(3)}")
```

---

## Regularization in Logistic Regression

Logistic regression uses the `C` parameter, which is the **inverse** of regularization strength (opposite of `alpha` in Ridge/Lasso):

$$J = -\frac{1}{n} \sum \left[ y \log \hat{p} + (1-y) \log(1-\hat{p}) \right] + \frac{1}{C} \cdot \text{penalty}$$

- Large `C` = less regularization (more complex)
- Small `C` = more regularization (simpler)

```python
# regularization.py — Effect of C on logistic regression
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import StandardScaler
import numpy as np

data = load_breast_cancer()
X, y = data.data, data.target

scaler = StandardScaler()
X_s = scaler.fit_transform(X)

print(f"{'C':>10} {'Penalty':>8} {'CV F1':>10} {'Non-zero':>10}")
print("-" * 42)

for C in [0.001, 0.01, 0.1, 1.0, 10.0, 100.0]:
    for penalty in ['l1', 'l2']:
        solver = 'liblinear' if penalty == 'l1' else 'lbfgs'
        model = LogisticRegression(C=C, penalty=penalty, solver=solver, max_iter=5000)
        scores = cross_val_score(model, X_s, y, cv=5, scoring='f1')

        model.fit(X_s, y)
        n_nonzero = np.sum(np.abs(model.coef_) > 1e-10)

        print(f"{C:>10.3f} {penalty:>8} {scores.mean():>10.4f} {n_nonzero:>10}")
```

---

## End-to-End: Breast Cancer Dataset

```python
# breast_cancer.py — Complete classification pipeline
import numpy as np
import pandas as pd
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    classification_report, roc_auc_score,
    average_precision_score
)

# Load and explore
data = load_breast_cancer()
X, y = data.data, data.target
print(f"Shape: {X.shape}")
print(f"Classes: {data.target_names}")
print(f"Distribution: {np.bincount(y)} ({np.bincount(y)/len(y)*100}%)")

# Split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Pipeline
pipeline = make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000))

# Hyperparameter tuning
param_grid = {
    'logisticregression__C': [0.001, 0.01, 0.1, 1.0, 10.0],
    'logisticregression__penalty': ['l1', 'l2'],
    'logisticregression__solver': ['liblinear'],
}

grid = GridSearchCV(pipeline, param_grid, cv=5, scoring='f1', n_jobs=-1)
grid.fit(X_train, y_train)

print(f"\nBest params: {grid.best_params_}")
print(f"Best CV F1: {grid.best_score_:.4f}")

# Final evaluation
best_model = grid.best_estimator_
y_pred = best_model.predict(X_test)
y_proba = best_model.predict_proba(X_test)[:, 1]

print(f"\nTest Results:")
print(classification_report(y_test, y_pred, target_names=data.target_names))
print(f"ROC-AUC: {roc_auc_score(y_test, y_proba):.4f}")
print(f"PR-AUC:  {average_precision_score(y_test, y_proba):.4f}")

# Feature importance
lr = best_model.named_steps['logisticregression']
coefs = pd.Series(lr.coef_[0], index=data.feature_names)
top_features = coefs.abs().sort_values(ascending=False).head(10)
print(f"\nTop 10 features by |coefficient|:")
for feat in top_features.index:
    print(f"  {feat}: {coefs[feat]:.4f}")
```

---

## Further Reading

- **[Linear Regression](/machine-learning/linear-regression)** — The foundation this builds on
- **[Decision Trees](/machine-learning/decision-trees)** — Non-linear alternative
- **[Evaluation Metrics](/machine-learning/evaluation-metrics)** — Deep dive into all classification metrics
- **[SVM](/machine-learning/svm)** — Another linear classifier with different optimization
