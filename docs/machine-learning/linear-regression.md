---
title: "Linear Regression"
description: "Complete guide to linear regression — OLS derivation with normal equation proof, gradient descent from scratch in NumPy, Ridge (L2), Lasso (L1), ElasticNet regularization with KaTeX math, assumptions and diagnostics, California Housing end-to-end example."
tags: [machine-learning, linear-regression, gradient-descent, regularization, regression]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Linear Regression

Linear regression is the foundation of all predictive modeling. Understanding it deeply — the math, the optimization, the assumptions — gives you the vocabulary to understand every other algorithm.

---

## The Model

Linear regression models the relationship between features $\mathbf{x} \in \mathbb{R}^d$ and a continuous target $y \in \mathbb{R}$ as:

$$\hat{y} = \theta_0 + \theta_1 x_1 + \theta_2 x_2 + \cdots + \theta_d x_d = \mathbf{x}^T \boldsymbol{\theta}$$

::: details Worked Example — Linear Prediction

**Mini Dataset:**
| Bias (x0) | Size x1 (sqft/1000) | Bedrooms x2 | Price y ($k) |
|-----------|---------------------|-------------|-------------|
| 1         | 1.5                 | 2           | 200         |
| 1         | 2.0                 | 3           | 280         |
| 1         | 2.5                 | 3           | 320         |
| 1         | 3.0                 | 4           | 400         |

Suppose we have parameters: theta0=50, theta1=100, theta2=10.

**Step 1:** Predict for the first sample (x1=1.5, x2=2)
  y_hat = 50 + 100(1.5) + 10(2) = 50 + 150 + 20 = 220

**Step 2:** Predict for all samples
  y_hat1 = 50 + 100(1.5) + 10(2) = 220
  y_hat2 = 50 + 100(2.0) + 10(3) = 280
  y_hat3 = 50 + 100(2.5) + 10(3) = 330
  y_hat4 = 50 + 100(3.0) + 10(4) = 390

**Step 3:** Interpret
  "The model predicts house prices as $50k base + $100k per 1000 sqft + $10k per bedroom. For a 1500 sqft, 2-bedroom house, it predicts $220k."

:::

In matrix form for all $n$ samples:

$$\hat{\mathbf{y}} = \mathbf{X}\boldsymbol{\theta}$$

where $\mathbf{X} \in \mathbb{R}^{n \times (d+1)}$ includes a column of ones for the intercept.

---

## Ordinary Least Squares (OLS)

### The Loss Function

OLS minimizes the **Mean Squared Error (MSE)**:

$$J(\boldsymbol{\theta}) = \frac{1}{n} \sum_{i=1}^{n} (y_i - \hat{y}_i)^2 = \frac{1}{n} \|\mathbf{y} - \mathbf{X}\boldsymbol{\theta}\|^2$$

::: details Worked Example — MSE Loss

**Using the dataset above with theta0=50, theta1=100, theta2=10:**

| Sample | y_true | y_hat | Error | Error^2 |
|--------|--------|-------|-------|---------|
| 1      | 200    | 220   | -20   | 400     |
| 2      | 280    | 280   | 0     | 0       |
| 3      | 320    | 330   | -10   | 100     |
| 4      | 400    | 390   | 10    | 100     |

**Step 1:** Compute each squared error (column above)

**Step 2:** Compute MSE
  J = (1/4)(400 + 0 + 100 + 100) = 600/4 = 150

**Step 3:** Interpret
  "The mean squared error is 150, meaning the average squared prediction error is $150k^2. The RMSE = sqrt(150) = 12.25, so predictions are off by about $12.25k on average."

:::

### Normal Equation Derivation

To find the optimal $\boldsymbol{\theta}$, take the gradient of $J$ and set it to zero.

First, expand $J$:

$$J = \frac{1}{n}(\mathbf{y} - \mathbf{X}\boldsymbol{\theta})^T(\mathbf{y} - \mathbf{X}\boldsymbol{\theta})$$

$$= \frac{1}{n}(\mathbf{y}^T\mathbf{y} - 2\boldsymbol{\theta}^T\mathbf{X}^T\mathbf{y} + \boldsymbol{\theta}^T\mathbf{X}^T\mathbf{X}\boldsymbol{\theta})$$

Take the gradient with respect to $\boldsymbol{\theta}$:

$$\nabla_{\boldsymbol{\theta}} J = \frac{1}{n}(-2\mathbf{X}^T\mathbf{y} + 2\mathbf{X}^T\mathbf{X}\boldsymbol{\theta})$$

Set to zero:

$$-2\mathbf{X}^T\mathbf{y} + 2\mathbf{X}^T\mathbf{X}\boldsymbol{\theta} = 0$$

$$\mathbf{X}^T\mathbf{X}\boldsymbol{\theta} = \mathbf{X}^T\mathbf{y}$$

$$\boldsymbol{\theta}^* = (\mathbf{X}^T\mathbf{X})^{-1}\mathbf{X}^T\mathbf{y}$$

This is the **normal equation** — a closed-form solution that requires no iteration.

::: details Worked Example — Normal Equation

**Mini Dataset (simple: 1 feature + bias):**
| x0 (bias) | x1 | y  |
|-----------|-----|-----|
| 1         | 1   | 3   |
| 1         | 2   | 5   |
| 1         | 3   | 7   |
| 1         | 4   | 9   |

So X = [[1,1],[1,2],[1,3],[1,4]], y = [3,5,7,9].

**Step 1:** Compute X^T X
  X^T X = [[1,1,1,1],[1,2,3,4]] @ [[1,1],[1,2],[1,3],[1,4]]
        = [[4, 10],[10, 30]]

**Step 2:** Compute X^T y
  X^T y = [[1,1,1,1],[1,2,3,4]] @ [3,5,7,9]
        = [3+5+7+9, 1(3)+2(5)+3(7)+4(9)] = [24, 70]

**Step 3:** Compute (X^T X)^(-1)
  det = 4(30) - 10(10) = 120 - 100 = 20
  (X^T X)^(-1) = (1/20)[[30, -10],[-10, 4]] = [[1.5, -0.5],[-0.5, 0.2]]

**Step 4:** Compute theta = (X^T X)^(-1) X^T y
  theta = [[1.5, -0.5],[-0.5, 0.2]] @ [24, 70]
        = [1.5(24) + (-0.5)(70), (-0.5)(24) + 0.2(70)]
        = [36 - 35, -12 + 14]
        = [1, 2]

**Step 5:** Interpret
  "theta0 = 1 (intercept), theta1 = 2 (slope). The model is y = 1 + 2x, which perfectly fits this data: 1+2(1)=3, 1+2(2)=5, 1+2(3)=7, 1+2(4)=9."

:::

```python
# normal_equation.py — Linear regression via the normal equation
import numpy as np

# Generate data: y = 3x1 + 5x2 + 7 + noise
np.random.seed(42)
n = 200
X_raw = np.random.randn(n, 2)
y = 3 * X_raw[:, 0] + 5 * X_raw[:, 1] + 7 + np.random.randn(n) * 0.5

# Add bias column (column of ones)
X = np.column_stack([np.ones(n), X_raw])  # shape: (200, 3)

# Normal equation: θ = (X^T X)^(-1) X^T y
XTX = X.T @ X           # (3, 200) @ (200, 3) = (3, 3)
XTy = X.T @ y           # (3, 200) @ (200,) = (3,)
theta = np.linalg.inv(XTX) @ XTy  # or use np.linalg.solve

print(f"True parameters:    [7.0, 3.0, 5.0]")
print(f"Normal equation:    {theta.round(4)}")

# More numerically stable: use np.linalg.lstsq
theta_lstsq, residuals, rank, sv = np.linalg.lstsq(X, y, rcond=None)
print(f"lstsq solution:     {theta_lstsq.round(4)}")

# Verify with scikit-learn
from sklearn.linear_model import LinearRegression
model = LinearRegression()
model.fit(X_raw, y)
print(f"sklearn:            [{model.intercept_:.4f}, {model.coef_[0]:.4f}, {model.coef_[1]:.4f}]")
```

### When to Use Normal Equation vs Gradient Descent

| Factor | Normal Equation | Gradient Descent |
|--------|----------------|-----------------|
| **Complexity** | $O(d^3)$ for matrix inverse | $O(knd)$ per iteration |
| **Features $d$** | Slow for $d > 10{,}000$ | Scales well |
| **Samples $n$** | Fits in memory | Mini-batch for large $n$ |
| **Iterative?** | No | Yes |
| **Learning rate?** | Not needed | Must tune |
| **Feature scaling?** | Not needed | Required |

---

## Gradient Descent From Scratch

### The Algorithm

Gradient descent updates parameters iteratively:

$$\boldsymbol{\theta}_{t+1} = \boldsymbol{\theta}_t - \eta \nabla J(\boldsymbol{\theta}_t)$$

For MSE loss:

$$\frac{\partial J}{\partial \theta_j} = -\frac{2}{n} \sum_{i=1}^{n} x_{ij}(y_i - \hat{y}_i)$$

In matrix form:

$$\nabla J = -\frac{2}{n} \mathbf{X}^T(\mathbf{y} - \mathbf{X}\boldsymbol{\theta})$$

::: details Worked Example — One Step of Gradient Descent

**Using y = 1 + 2x dataset, starting from theta = [0, 0], learning rate eta = 0.1:**

X = [[1,1],[1,2],[1,3],[1,4]], y = [3,5,7,9], theta = [0,0]

**Step 1:** Compute predictions y_hat = X @ theta
  y_hat = [0, 0, 0, 0]

**Step 2:** Compute residuals (y - y_hat)
  residuals = [3, 5, 7, 9]

**Step 3:** Compute gradient
  grad = -(2/4) X^T @ residuals
       = -0.5 * [1(3)+1(5)+1(7)+1(9), 1(3)+2(5)+3(7)+4(9)]
       = -0.5 * [24, 70]
       = [-12, -35]

**Step 4:** Update theta
  theta_new = [0, 0] - 0.1 * [-12, -35]
            = [0 + 1.2, 0 + 3.5]
            = [1.2, 3.5]

**Step 5:** Interpret
  "After one step, theta moved from [0,0] to [1.2, 3.5]. The true answer is [1, 2], so we overshot on theta1 but are heading in the right direction. More iterations with a smaller learning rate will converge."

:::

```python
# gradient_descent.py — Linear regression from scratch
import numpy as np
import matplotlib.pyplot as plt

class LinearRegressionGD:
    """Linear regression using gradient descent, from scratch."""

    def __init__(self, learning_rate=0.01, n_iterations=1000, tol=1e-6):
        self.lr = learning_rate
        self.n_iterations = n_iterations
        self.tol = tol
        self.weights = None
        self.bias = None
        self.loss_history = []

    def fit(self, X, y):
        n_samples, n_features = X.shape

        # Initialize weights to zeros
        self.weights = np.zeros(n_features)
        self.bias = 0.0
        self.loss_history = []

        for i in range(self.n_iterations):
            # Forward pass
            y_pred = X @ self.weights + self.bias

            # Compute loss (MSE)
            loss = np.mean((y - y_pred) ** 2)
            self.loss_history.append(loss)

            # Compute gradients
            dw = -(2 / n_samples) * (X.T @ (y - y_pred))
            db = -(2 / n_samples) * np.sum(y - y_pred)

            # Update parameters
            self.weights -= self.lr * dw
            self.bias -= self.lr * db

            # Check convergence
            if i > 0 and abs(self.loss_history[-2] - loss) < self.tol:
                print(f"Converged at iteration {i}")
                break

        return self

    def predict(self, X):
        return X @ self.weights + self.bias

    def score(self, X, y):
        """R-squared score."""
        y_pred = self.predict(X)
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - y.mean()) ** 2)
        return 1 - ss_res / ss_tot


# Generate data
np.random.seed(42)
n = 300
X = np.random.randn(n, 3)
y = 2 * X[:, 0] - 3 * X[:, 1] + 1.5 * X[:, 2] + 5 + np.random.randn(n) * 0.3

# Feature scaling is important for gradient descent
from sklearn.preprocessing import StandardScaler
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Train
model = LinearRegressionGD(learning_rate=0.1, n_iterations=500)
model.fit(X_scaled, y)

print(f"Weights: {model.weights.round(4)}")
print(f"Bias: {model.bias:.4f}")
print(f"R²: {model.score(X_scaled, y):.4f}")
print(f"Final MSE: {model.loss_history[-1]:.6f}")

# Plot loss convergence
plt.figure(figsize=(10, 5))
plt.plot(model.loss_history)
plt.xlabel('Iteration')
plt.ylabel('MSE Loss')
plt.title('Gradient Descent Convergence')
plt.grid(True)
plt.tight_layout()
plt.savefig('gd_convergence.png', dpi=150)
plt.show()
```

### Stochastic and Mini-Batch Gradient Descent

```python
# sgd_variants.py — Batch, mini-batch, and stochastic GD
import numpy as np

np.random.seed(42)
n = 1000
X = np.random.randn(n, 5)
y = X @ np.array([1, -2, 3, -4, 5]) + 10 + np.random.randn(n) * 0.5

from sklearn.preprocessing import StandardScaler
X_scaled = StandardScaler().fit_transform(X)

def gradient_descent(X, y, variant='batch', lr=0.01, epochs=100, batch_size=32):
    n_samples, n_features = X.shape
    w = np.zeros(n_features)
    b = 0.0
    losses = []

    for epoch in range(epochs):
        if variant == 'stochastic':
            # Random permutation each epoch
            indices = np.random.permutation(n_samples)
            for i in indices:
                xi = X[i:i+1]
                yi = y[i:i+1]
                pred = xi @ w + b
                dw = -(2 / 1) * (xi.T @ (yi - pred)).ravel()
                db = -(2 / 1) * (yi - pred).sum()
                w -= lr * dw
                b -= lr * db

        elif variant == 'mini-batch':
            indices = np.random.permutation(n_samples)
            for start in range(0, n_samples, batch_size):
                end = min(start + batch_size, n_samples)
                idx = indices[start:end]
                xi, yi = X[idx], y[idx]
                pred = xi @ w + b
                dw = -(2 / len(idx)) * (xi.T @ (yi - pred))
                db = -(2 / len(idx)) * (yi - pred).sum()
                w -= lr * dw
                b -= lr * db

        else:  # batch
            pred = X @ w + b
            dw = -(2 / n_samples) * (X.T @ (y - pred))
            db = -(2 / n_samples) * (y - pred).sum()
            w -= lr * dw
            b -= lr * db

        loss = np.mean((y - (X @ w + b)) ** 2)
        losses.append(loss)

    return w, b, losses

for variant in ['batch', 'mini-batch', 'stochastic']:
    w, b, losses = gradient_descent(X_scaled, y, variant=variant, lr=0.01, epochs=50)
    print(f"{variant:12s}: final MSE={losses[-1]:.4f}, bias={b:.2f}")
```

---

## Regularization

### Why Regularize?

When features outnumber samples, or features are correlated, OLS overfits. Regularization adds a penalty to the loss function to constrain the weights.

### Ridge Regression (L2)

Ridge adds the squared magnitude of weights:

$$J_{\text{Ridge}} = \frac{1}{n}\|\mathbf{y} - \mathbf{X}\boldsymbol{\theta}\|^2 + \lambda \sum_{j=1}^{d} \theta_j^2$$

$$= \frac{1}{n}\|\mathbf{y} - \mathbf{X}\boldsymbol{\theta}\|^2 + \lambda \|\boldsymbol{\theta}\|_2^2$$

The closed-form solution becomes:

$$\boldsymbol{\theta}_{\text{Ridge}} = (\mathbf{X}^T\mathbf{X} + \lambda \mathbf{I})^{-1}\mathbf{X}^T\mathbf{y}$$

The $\lambda \mathbf{I}$ term ensures the matrix is always invertible (even if $\mathbf{X}^T\mathbf{X}$ is singular).

::: details Worked Example — Ridge Regression

**Using the same 1-feature dataset, with lambda = 10:**

From the normal equation example: X^T X = [[4,10],[10,30]], X^T y = [24,70].

**Step 1:** Add lambda * I to X^T X
  X^T X + 10*I = [[4+10, 10],[10, 30+10]] = [[14, 10],[10, 40]]

**Step 2:** Compute inverse of (X^T X + lambda*I)
  det = 14(40) - 10(10) = 560 - 100 = 460
  inverse = (1/460)[[40, -10],[-10, 14]]

**Step 3:** Compute theta_ridge
  theta = (1/460)[[40,-10],[-10,14]] @ [24, 70]
        = (1/460)[40(24)-10(70), -10(24)+14(70)]
        = (1/460)[960-700, -240+980]
        = (1/460)[260, 740]
        = [0.565, 1.609]

**Step 4:** Compare with OLS (theta = [1, 2])
  Ridge: theta = [0.565, 1.609] — coefficients are shrunk toward zero.
  OLS:   theta = [1, 2]

**Step 5:** Interpret
  "Ridge with lambda=10 shrinks the slope from 2.0 to 1.609 and the intercept from 1.0 to 0.565. The stronger the lambda, the more the coefficients are pulled toward zero, reducing overfitting at the cost of some bias."

:::

### Lasso Regression (L1)

Lasso uses the absolute value of weights:

$$J_{\text{Lasso}} = \frac{1}{n}\|\mathbf{y} - \mathbf{X}\boldsymbol{\theta}\|^2 + \lambda \sum_{j=1}^{d} |\theta_j|$$

Lasso drives some coefficients to exactly zero, performing automatic feature selection. No closed-form solution exists — it requires iterative optimization (coordinate descent).

::: details Worked Example — Lasso Penalty Comparison

**Compare Ridge vs Lasso penalty for theta = [0.5, -2.0, 0.1]:**

**Step 1:** Compute L2 penalty (Ridge)
  L2 = 0.5^2 + (-2.0)^2 + 0.1^2 = 0.25 + 4.0 + 0.01 = 4.26

**Step 2:** Compute L1 penalty (Lasso)
  L1 = |0.5| + |-2.0| + |0.1| = 0.5 + 2.0 + 0.1 = 2.6

**Step 3:** With lambda = 1, compare total losses (assume MSE = 5.0)
  Ridge loss = 5.0 + 1.0 * 4.26 = 9.26
  Lasso loss = 5.0 + 1.0 * 2.6 = 7.6

**Step 4:** Interpret
  "Lasso penalizes the small coefficient theta3=0.1 almost the same as Ridge does (0.1 vs 0.01). But for large coefficients like theta2=-2.0, Ridge penalizes much more (4.0 vs 2.0). This is why Lasso tends to zero out small coefficients entirely (feature selection) while Ridge only shrinks them."

:::

### ElasticNet

Combines L1 and L2:

$$J_{\text{ElasticNet}} = \frac{1}{n}\|\mathbf{y} - \mathbf{X}\boldsymbol{\theta}\|^2 + \lambda_1 \|\boldsymbol{\theta}\|_1 + \lambda_2 \|\boldsymbol{\theta}\|_2^2$$

```python
# regularization.py — Ridge, Lasso, ElasticNet comparison
import numpy as np
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import (
    LinearRegression, Ridge, Lasso, ElasticNet, RidgeCV, LassoCV
)

# Load data
housing = fetch_california_housing()
X, y = housing.data, housing.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Compare models
models = {
    'OLS': LinearRegression(),
    'Ridge (α=1.0)': Ridge(alpha=1.0),
    'Ridge (α=10.0)': Ridge(alpha=10.0),
    'Lasso (α=0.01)': Lasso(alpha=0.01),
    'Lasso (α=0.1)': Lasso(alpha=0.1),
    'ElasticNet (α=0.01)': ElasticNet(alpha=0.01, l1_ratio=0.5),
}

print(f"{'Model':<25} {'Train R²':>10} {'Test R²':>10} {'Non-zero':>10}")
print("-" * 57)

for name, model in models.items():
    pipe = make_pipeline(StandardScaler(), model)
    pipe.fit(X_train, y_train)
    train_r2 = pipe.score(X_train, y_train)
    test_r2 = pipe.score(X_test, y_test)

    # Count non-zero coefficients
    if hasattr(model, 'coef_'):
        n_nonzero = np.sum(np.abs(pipe[-1].coef_) > 1e-10)
    else:
        n_nonzero = '-'

    print(f"{name:<25} {train_r2:>10.4f} {test_r2:>10.4f} {str(n_nonzero):>10}")

# Automatic alpha selection with cross-validation
ridge_cv = make_pipeline(StandardScaler(), RidgeCV(alphas=np.logspace(-4, 4, 50)))
ridge_cv.fit(X_train, y_train)
print(f"\nRidgeCV best alpha: {ridge_cv[-1].alpha_:.4f}")
print(f"RidgeCV test R²: {ridge_cv.score(X_test, y_test):.4f}")

lasso_cv = make_pipeline(StandardScaler(), LassoCV(alphas=np.logspace(-4, 1, 50), cv=5))
lasso_cv.fit(X_train, y_train)
print(f"LassoCV best alpha: {lasso_cv[-1].alpha_:.4f}")
print(f"LassoCV test R²: {lasso_cv.score(X_test, y_test):.4f}")
print(f"LassoCV non-zero features: {np.sum(np.abs(lasso_cv[-1].coef_) > 1e-10)}/{len(lasso_cv[-1].coef_)}")
```

### Regularization Comparison

| Property | Ridge (L2) | Lasso (L1) | ElasticNet |
|----------|-----------|-----------|------------|
| Penalty | $\lambda\sum \theta_j^2$ | $\lambda\sum |\theta_j|$ | Both |
| Feature selection | No | Yes (zeros out features) | Yes |
| Correlated features | Keeps all, shrinks equally | Picks one randomly | Keeps groups |
| Closed-form | Yes | No | No |
| When to use | Many small effects | Few important features | Groups of correlated features |

---

## Assumptions and Diagnostics

Linear regression makes assumptions. Violating them does not always ruin the model, but understanding them helps diagnose problems.

### The Five Assumptions

1. **Linearity**: The relationship between features and target is linear
2. **Independence**: Observations are independent of each other
3. **Homoscedasticity**: Constant variance of residuals
4. **Normality**: Residuals are normally distributed
5. **No multicollinearity**: Features are not highly correlated with each other

```python
# diagnostics.py — Check regression assumptions
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import fetch_california_housing
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from scipy import stats

housing = fetch_california_housing()
X, y = housing.data, housing.target
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

model = LinearRegression()
model.fit(X_train_s, y_train)
y_pred = model.predict(X_test_s)
residuals = y_test - y_pred

fig, axes = plt.subplots(2, 2, figsize=(12, 10))

# 1. Residuals vs Predicted — check linearity and homoscedasticity
axes[0, 0].scatter(y_pred, residuals, alpha=0.3, s=10)
axes[0, 0].axhline(y=0, color='r', linestyle='--')
axes[0, 0].set_xlabel('Predicted')
axes[0, 0].set_ylabel('Residuals')
axes[0, 0].set_title('Residuals vs Predicted')

# 2. Q-Q plot — check normality of residuals
stats.probplot(residuals, dist="norm", plot=axes[0, 1])
axes[0, 1].set_title('Q-Q Plot (Normality Check)')

# 3. Residual histogram
axes[1, 0].hist(residuals, bins=50, edgecolor='black')
axes[1, 0].set_title('Residual Distribution')
axes[1, 0].set_xlabel('Residual')

# 4. Predicted vs Actual
axes[1, 1].scatter(y_test, y_pred, alpha=0.3, s=10)
axes[1, 1].plot([y_test.min(), y_test.max()],
                [y_test.min(), y_test.max()], 'r--')
axes[1, 1].set_xlabel('Actual')
axes[1, 1].set_ylabel('Predicted')
axes[1, 1].set_title('Predicted vs Actual')

plt.tight_layout()
plt.savefig('regression_diagnostics.png', dpi=150)
plt.show()

# Multicollinearity check — Variance Inflation Factor
from numpy.linalg import inv
corr_matrix = np.corrcoef(X_train, rowvar=False)
try:
    vif_matrix = inv(corr_matrix)
    vif = np.diag(vif_matrix)
    print("\nVariance Inflation Factors:")
    for name, v in zip(housing.feature_names, vif):
        flag = " <-- HIGH" if v > 10 else ""
        print(f"  {name}: {v:.2f}{flag}")
except np.linalg.LinAlgError:
    print("Correlation matrix is singular — severe multicollinearity")
```

---

## End-to-End: California Housing

```python
# california_housing.py — Complete regression pipeline
import numpy as np
import pandas as pd
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.linear_model import LinearRegression, Ridge, Lasso, ElasticNet
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

# Load data
housing = fetch_california_housing(as_frame=True)
df = housing.frame
print(f"Shape: {df.shape}")
print(f"\nFeatures: {housing.feature_names}")
print(f"\nTarget stats:\n{df['MedHouseVal'].describe()}")

# EDA: correlations
print(f"\nCorrelations with target:")
corrs = df.corr()['MedHouseVal'].drop('MedHouseVal').sort_values(ascending=False)
for feat, corr in corrs.items():
    print(f"  {feat}: {corr:.3f}")

X = df.drop('MedHouseVal', axis=1)
y = df['MedHouseVal']

# Feature engineering
X['rooms_per_household'] = X['AveRooms'] / X['AveOccup'].clip(0.1)
X['bedrooms_ratio'] = X['AveBedrms'] / X['AveRooms'].clip(0.1)
X['pop_per_household'] = X['Population'] / X['AveOccup'].clip(0.1)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Compare models
models = {
    'Linear': Pipeline([('scaler', StandardScaler()), ('model', LinearRegression())]),
    'Ridge': Pipeline([('scaler', StandardScaler()), ('model', Ridge(alpha=1.0))]),
    'Lasso': Pipeline([('scaler', StandardScaler()), ('model', Lasso(alpha=0.01))]),
    'ElasticNet': Pipeline([('scaler', StandardScaler()), ('model', ElasticNet(alpha=0.01))]),
    'Poly2+Ridge': Pipeline([
        ('scaler', StandardScaler()),
        ('poly', PolynomialFeatures(degree=2, interaction_only=True)),
        ('model', Ridge(alpha=10.0))
    ]),
}

print(f"\n{'Model':<20} {'RMSE':>10} {'MAE':>10} {'R²':>10} {'CV RMSE':>12}")
print("-" * 64)

for name, pipe in models.items():
    pipe.fit(X_train, y_train)
    y_pred = pipe.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    cv = cross_val_score(pipe, X_train, y_train, cv=5,
                         scoring='neg_root_mean_squared_error')
    cv_rmse = -cv.mean()
    print(f"{name:<20} {rmse:>10.4f} {mae:>10.4f} {r2:>10.4f} {cv_rmse:>12.4f}")

# Coefficient interpretation (Ridge model)
ridge_pipe = models['Ridge']
ridge_model = ridge_pipe.named_steps['model']
feature_names = X_train.columns
coefs = pd.Series(ridge_model.coef_, index=feature_names).sort_values()

print(f"\nRidge Coefficients (scaled features):")
for feat, coef in coefs.items():
    direction = "+" if coef > 0 else "-"
    print(f"  {direction} {feat}: {coef:.4f}")
print(f"  Intercept: {ridge_model.intercept_:.4f}")
```

---

## Polynomial Regression

When the relationship is non-linear, you can add polynomial features while keeping the model linear in parameters:

$$\hat{y} = \theta_0 + \theta_1 x + \theta_2 x^2 + \theta_3 x^3$$

This is still "linear" regression because it is linear in $\boldsymbol{\theta}$.

```python
# polynomial.py — Polynomial regression to capture non-linearity
import numpy as np
import matplotlib.pyplot as plt
from sklearn.preprocessing import PolynomialFeatures
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.pipeline import make_pipeline
from sklearn.metrics import mean_squared_error

np.random.seed(42)
n = 100
X = np.sort(np.random.uniform(-3, 3, n)).reshape(-1, 1)
y = 0.5 * X.ravel()**3 - 2 * X.ravel() + np.random.randn(n) * 3

X_plot = np.linspace(-3, 3, 200).reshape(-1, 1)

plt.figure(figsize=(14, 5))

for i, degree in enumerate([1, 3, 15]):
    plt.subplot(1, 3, i + 1)
    model = make_pipeline(PolynomialFeatures(degree), Ridge(alpha=0.1))
    model.fit(X, y)
    y_plot = model.predict(X_plot)

    plt.scatter(X, y, alpha=0.5, s=20)
    plt.plot(X_plot, y_plot, 'r-', linewidth=2)
    plt.title(f'Degree {degree} (MSE={mean_squared_error(y, model.predict(X)):.2f})')
    plt.ylim(-30, 30)

plt.tight_layout()
plt.savefig('polynomial_regression.png', dpi=150)
plt.show()
```

---

## Key Takeaways

| Concept | Remember |
|---------|----------|
| Normal equation | $\boldsymbol{\theta} = (\mathbf{X}^T\mathbf{X})^{-1}\mathbf{X}^T\mathbf{y}$ — exact, but $O(d^3)$ |
| Gradient descent | Iterative, scales to large $d$, needs feature scaling |
| Ridge (L2) | Shrinks all coefficients, never zeros them out |
| Lasso (L1) | Zeros out coefficients — built-in feature selection |
| ElasticNet | Best of both — use when features are correlated |
| Always check | Residual plots, VIF for multicollinearity |
| Feature engineering | Often matters more than the algorithm choice |

---

## Further Reading

- **[Math Foundations](/machine-learning/math-foundations)** — Linear algebra and calculus behind this page
- **[Logistic Regression](/machine-learning/logistic-regression)** — Extending linear regression to classification
- **[Evaluation Metrics](/machine-learning/evaluation-metrics)** — MSE, RMSE, MAE, R-squared in depth
- **[Data Preparation](/machine-learning/data-preparation)** — Scaling and encoding for linear models
