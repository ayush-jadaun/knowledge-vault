---
title: "Math Foundations for Machine Learning"
description: "Essential mathematics for ML — linear algebra with NumPy (vectors, matrices, eigendecomposition), calculus (derivatives, chain rule, gradients), probability (Bayes theorem, distributions), and statistics (bias-variance tradeoff) — all with Python code."
tags: [machine-learning, linear-algebra, calculus, probability, statistics]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Math Foundations for Machine Learning

Every machine learning algorithm reduces to mathematical operations. Linear regression is a matrix equation. Gradient descent is calculus. Naive Bayes is probability theory. Understanding the math does not just help you debug models — it lets you invent new ones.

This page covers the four pillars: **linear algebra**, **calculus**, **probability**, and **statistics** — each with full derivations and runnable Python code.

---

## Linear Algebra

### Vectors

A vector is an ordered list of numbers. In ML, a single data point with $d$ features is a vector $\mathbf{x} \in \mathbb{R}^d$.

```python
# vectors.py — Vector operations with NumPy
import numpy as np

# A data point with 3 features
x = np.array([1.0, 2.0, 3.0])
y = np.array([4.0, 5.0, 6.0])

# Addition — element-wise
print(f"x + y = {x + y}")  # [5. 7. 9.]

# Scalar multiplication
print(f"3x = {3 * x}")  # [3. 6. 9.]

# Dot product — measures similarity
dot = np.dot(x, y)  # 1*4 + 2*5 + 3*6 = 32
print(f"x · y = {dot}")

# Magnitude (L2 norm)
norm_x = np.linalg.norm(x)
print(f"||x|| = {norm_x:.4f}")  # sqrt(1 + 4 + 9) = 3.7417

# Unit vector
x_hat = x / norm_x
print(f"Unit vector: {x_hat}")
print(f"||x_hat|| = {np.linalg.norm(x_hat):.4f}")  # 1.0

# Cosine similarity — angle between vectors
cos_sim = np.dot(x, y) / (np.linalg.norm(x) * np.linalg.norm(y))
print(f"cos(x, y) = {cos_sim:.4f}")  # 0.9746 — very similar direction
```

The **dot product** has deep geometric meaning:

$$\mathbf{x} \cdot \mathbf{y} = \|\mathbf{x}\| \|\mathbf{y}\| \cos\theta$$

When $\theta = 0$ (same direction), $\cos\theta = 1$ and the dot product is maximized. When $\theta = 90°$ (perpendicular), the dot product is zero. This is why the dot product measures similarity.

### Matrices

A dataset with $n$ samples and $d$ features is a matrix $\mathbf{X} \in \mathbb{R}^{n \times d}$. Each row is a data point, each column is a feature.

```python
# matrices.py — Matrix operations with NumPy
import numpy as np

# Dataset: 4 samples, 3 features
X = np.array([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12]
])
print(f"Shape: {X.shape}")  # (4, 3) — 4 samples, 3 features

# Transpose — swap rows and columns
print(f"X^T shape: {X.T.shape}")  # (3, 4)

# Matrix multiplication — X^T X is the Gram matrix
# Used in linear regression normal equation
gram = X.T @ X  # (3,4) @ (4,3) = (3,3)
print(f"X^T X =\n{gram}")

# Inverse — only for square, full-rank matrices
A = np.array([[4, 7], [2, 6]])
A_inv = np.linalg.inv(A)
print(f"A^-1 =\n{A_inv}")

# Verify: A @ A^-1 = I
identity = A @ A_inv
print(f"A @ A^-1 =\n{np.round(identity, 10)}")

# Determinant — measures how much A scales volume
det = np.linalg.det(A)
print(f"det(A) = {det:.1f}")  # 10.0 — nonzero means invertible

# Trace — sum of diagonal elements
print(f"tr(A) = {np.trace(A)}")  # 4 + 6 = 10
```

### Matrix Multiplication Rules

For $\mathbf{A} \in \mathbb{R}^{m \times n}$ and $\mathbf{B} \in \mathbb{R}^{n \times p}$, the product $\mathbf{C} = \mathbf{AB}$ has shape $m \times p$:

$$C_{ij} = \sum_{k=1}^{n} A_{ik} B_{kj}$$

The inner dimensions must match: $(m \times \mathbf{n}) \times (\mathbf{n} \times p)$.

### Eigendecomposition

An eigenvector of matrix $\mathbf{A}$ is a vector that, when multiplied by $\mathbf{A}$, only gets scaled (not rotated):

$$\mathbf{A}\mathbf{v} = \lambda \mathbf{v}$$

where $\lambda$ is the eigenvalue. Eigendecomposition is the foundation of PCA (principal component analysis).

```python
# eigen.py — Eigendecomposition and its role in PCA
import numpy as np

# Covariance matrix of 2D data
np.random.seed(42)
data = np.random.randn(200, 2) @ np.array([[2, 1], [1, 3]])

cov = np.cov(data.T)
print(f"Covariance matrix:\n{cov}")

# Eigendecomposition
eigenvalues, eigenvectors = np.linalg.eigh(cov)

# Sort by descending eigenvalue
idx = np.argsort(eigenvalues)[::-1]
eigenvalues = eigenvalues[idx]
eigenvectors = eigenvectors[:, idx]

print(f"\nEigenvalues: {eigenvalues}")
print(f"Eigenvectors:\n{eigenvectors}")

# Variance explained ratio — this IS PCA
total_var = eigenvalues.sum()
var_ratio = eigenvalues / total_var
print(f"\nVariance explained: {var_ratio}")
print(f"First component captures {var_ratio[0]:.1%} of variance")

# Project data onto first eigenvector (1D PCA)
projected = data @ eigenvectors[:, 0]
print(f"Original shape: {data.shape}, Projected shape: {projected.shape}")
```

### The Normal Equation Uses All of This

Linear regression's closed-form solution ties it all together:

$$\boldsymbol{\theta} = (\mathbf{X}^T \mathbf{X})^{-1} \mathbf{X}^T \mathbf{y}$$

This requires matrix transpose, matrix multiplication, and matrix inversion — three core linear algebra operations.

---

## Calculus

### Derivatives

The derivative of $f(x)$ measures the instantaneous rate of change — the slope of the tangent line:

$$f'(x) = \lim_{h \to 0} \frac{f(x + h) - f(x)}{h}$$

In ML, we care about derivatives because **training = minimizing a loss function**, and derivatives tell us which direction to move.

```python
# derivatives.py — Derivatives numerically and symbolically
import numpy as np

# Numerical derivative
def numerical_derivative(f, x, h=1e-7):
    """Central difference — more accurate than forward difference."""
    return (f(x + h) - f(x - h)) / (2 * h)

# Example: f(x) = x^2 → f'(x) = 2x
f = lambda x: x**2
x = 3.0
print(f"f'({x}) numerical = {numerical_derivative(f, x):.6f}")  # ≈ 6.0
print(f"f'({x}) analytical = {2 * x}")  # 6.0

# MSE loss derivative
# L(θ) = (1/n) Σ (yi - θxi)^2
# dL/dθ = -(2/n) Σ xi(yi - θxi)
X = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
y = np.array([2.1, 3.9, 6.2, 7.8, 10.1])
theta = 1.5

loss = lambda t: np.mean((y - t * X)**2)
grad_numerical = numerical_derivative(loss, theta)
grad_analytical = -2 * np.mean(X * (y - theta * X))

print(f"\nMSE loss at θ={theta}: {loss(theta):.4f}")
print(f"Gradient (numerical):  {grad_numerical:.6f}")
print(f"Gradient (analytical): {grad_analytical:.6f}")
```

### Key Derivative Rules for ML

| Rule | Formula | ML Use |
|------|---------|--------|
| **Power rule** | $\frac{d}{dx}x^n = nx^{n-1}$ | MSE loss gradient |
| **Chain rule** | $\frac{d}{dx}f(g(x)) = f'(g(x)) \cdot g'(x)$ | Backpropagation |
| **Product rule** | $\frac{d}{dx}[f(x)g(x)] = f'g + fg'$ | Regularized loss |
| **Log derivative** | $\frac{d}{dx}\ln x = \frac{1}{x}$ | Log-likelihood |
| **Exponential** | $\frac{d}{dx}e^x = e^x$ | Sigmoid, softmax |

### The Chain Rule

The chain rule is the single most important calculus concept for ML. It says: if $y = f(g(x))$, then:

$$\frac{dy}{dx} = \frac{dy}{dg} \cdot \frac{dg}{dx}$$

This is how backpropagation works — it applies the chain rule repeatedly through layers of a neural network.

```python
# chain_rule.py — Chain rule in action
import numpy as np

# Sigmoid function: σ(z) = 1 / (1 + e^(-z))
def sigmoid(z):
    return 1 / (1 + np.exp(-z))

# Derivative of sigmoid using chain rule:
# σ(z) = (1 + e^(-z))^(-1)
# Let u = 1 + e^(-z)
# σ = u^(-1) → dσ/du = -u^(-2)
# du/dz = -e^(-z)
# dσ/dz = (-u^(-2))(-e^(-z)) = e^(-z) / (1 + e^(-z))^2
# Simplifies to: σ(z)(1 - σ(z))

def sigmoid_derivative(z):
    s = sigmoid(z)
    return s * (1 - s)

# Verify with numerical derivative
z = 2.0
analytical = sigmoid_derivative(z)
numerical = (sigmoid(z + 1e-7) - sigmoid(z - 1e-7)) / (2e-7)
print(f"σ'({z}) analytical = {analytical:.8f}")
print(f"σ'({z}) numerical  = {numerical:.8f}")

# Full chain: loss = (y - σ(wx + b))^2
# dloss/dw = dloss/dσ · dσ/dz · dz/dw
# = -2(y - σ(z)) · σ(z)(1-σ(z)) · x
w, b, x, y_true = 0.5, 0.1, 2.0, 1.0
z = w * x + b
y_pred = sigmoid(z)

dloss_dsigma = -2 * (y_true - y_pred)
dsigma_dz = sigmoid_derivative(z)
dz_dw = x

dloss_dw = dloss_dsigma * dsigma_dz * dz_dw
print(f"\n∂loss/∂w = {dloss_dw:.6f}")
```

### Partial Derivatives and Gradients

When a function has multiple inputs, the partial derivative measures how it changes with respect to one input while holding others fixed.

The **gradient** is the vector of all partial derivatives:

$$\nabla f(\mathbf{x}) = \begin{bmatrix} \frac{\partial f}{\partial x_1} \\ \frac{\partial f}{\partial x_2} \\ \vdots \\ \frac{\partial f}{\partial x_d} \end{bmatrix}$$

The gradient points in the direction of steepest ascent. To minimize a loss, we move in the **opposite** direction — this is gradient descent.

```python
# gradient.py — Gradient of a function with multiple variables
import numpy as np

# f(x1, x2) = x1^2 + 3*x1*x2 + x2^2
# ∂f/∂x1 = 2*x1 + 3*x2
# ∂f/∂x2 = 3*x1 + 2*x2

def f(x):
    return x[0]**2 + 3*x[0]*x[1] + x[1]**2

def gradient_f(x):
    return np.array([2*x[0] + 3*x[1], 3*x[0] + 2*x[1]])

# Numerical gradient for verification
def numerical_gradient(f, x, h=1e-7):
    grad = np.zeros_like(x)
    for i in range(len(x)):
        x_plus = x.copy(); x_plus[i] += h
        x_minus = x.copy(); x_minus[i] -= h
        grad[i] = (f(x_plus) - f(x_minus)) / (2 * h)
    return grad

x = np.array([1.0, 2.0])
print(f"Analytical gradient: {gradient_f(x)}")
print(f"Numerical gradient:  {numerical_gradient(f, x)}")

# Gradient descent on this function
x = np.array([5.0, 5.0])
lr = 0.1
for i in range(20):
    grad = gradient_f(x)
    x = x - lr * grad
    if i % 5 == 0:
        print(f"Step {i:2d}: x = [{x[0]:.4f}, {x[1]:.4f}], f(x) = {f(x):.4f}")
```

### Gradient Descent Derivation

For a loss function $\mathcal{L}(\boldsymbol{\theta})$, gradient descent updates parameters as:

$$\boldsymbol{\theta}_{t+1} = \boldsymbol{\theta}_t - \eta \nabla \mathcal{L}(\boldsymbol{\theta}_t)$$

where $\eta$ is the learning rate. The derivation comes from the first-order Taylor expansion:

$$\mathcal{L}(\boldsymbol{\theta} + \boldsymbol{\delta}) \approx \mathcal{L}(\boldsymbol{\theta}) + \nabla \mathcal{L}(\boldsymbol{\theta})^T \boldsymbol{\delta}$$

To decrease $\mathcal{L}$, choose $\boldsymbol{\delta} = -\eta \nabla \mathcal{L}(\boldsymbol{\theta})$, giving:

$$\mathcal{L}(\boldsymbol{\theta} + \boldsymbol{\delta}) \approx \mathcal{L}(\boldsymbol{\theta}) - \eta \|\nabla \mathcal{L}(\boldsymbol{\theta})\|^2$$

Since $\|\nabla \mathcal{L}\|^2 \geq 0$, the loss decreases (for small enough $\eta$).

---

## Probability

### Basic Probability Rules

| Concept | Formula | Example |
|---------|---------|---------|
| **Complement** | $P(A^c) = 1 - P(A)$ | $P(\text{not spam}) = 1 - P(\text{spam})$ |
| **Union** | $P(A \cup B) = P(A) + P(B) - P(A \cap B)$ | $P(\text{rain or cold})$ |
| **Conditional** | $P(A \mid B) = \frac{P(A \cap B)}{P(B)}$ | $P(\text{spam} \mid \text{"free"})$ |
| **Independence** | $P(A \cap B) = P(A)P(B)$ | Naive Bayes assumption |

### Bayes' Theorem

Bayes' theorem relates conditional probabilities:

$$P(A \mid B) = \frac{P(B \mid A) \cdot P(A)}{P(B)}$$

**Derivation:** Start from the definition of conditional probability in both directions:

$$P(A \mid B) = \frac{P(A \cap B)}{P(B)}, \quad P(B \mid A) = \frac{P(A \cap B)}{P(A)}$$

From the second equation: $P(A \cap B) = P(B \mid A) \cdot P(A)$. Substitute into the first:

$$P(A \mid B) = \frac{P(B \mid A) \cdot P(A)}{P(B)}$$

Expanding $P(B)$ using the law of total probability:

$$P(B) = P(B \mid A)P(A) + P(B \mid A^c)P(A^c)$$

```python
# bayes.py — Bayes' theorem: medical test example
import numpy as np

# A disease affects 1% of the population
# Test sensitivity (true positive rate): 95%
# Test specificity (true negative rate): 90%
P_disease = 0.01
P_positive_given_disease = 0.95     # sensitivity
P_positive_given_healthy = 0.10     # 1 - specificity

# P(disease | positive) = ?
# Using Bayes' theorem:
P_positive = (P_positive_given_disease * P_disease +
              P_positive_given_healthy * (1 - P_disease))

P_disease_given_positive = (P_positive_given_disease * P_disease) / P_positive

print(f"P(disease)               = {P_disease:.2%}")
print(f"P(positive | disease)    = {P_positive_given_disease:.2%}")
print(f"P(positive | healthy)    = {P_positive_given_healthy:.2%}")
print(f"P(positive)              = {P_positive:.4f}")
print(f"P(disease | positive)    = {P_disease_given_positive:.2%}")
# Only ~8.8% — despite a 95% sensitive test!
# This is the base rate fallacy — low prevalence means
# most positives are false positives

# Simulation to verify
np.random.seed(42)
n = 1_000_000
has_disease = np.random.rand(n) < P_disease
test_positive = np.where(
    has_disease,
    np.random.rand(n) < P_positive_given_disease,
    np.random.rand(n) < P_positive_given_healthy
)

actual = has_disease[test_positive].mean()
print(f"\nSimulated P(disease|positive) = {actual:.2%}")
```

### Probability Distributions

```python
# distributions.py — Key distributions for ML
import numpy as np
from scipy import stats

# --- Gaussian (Normal) Distribution ---
# PDF: f(x) = (1/√(2πσ²)) exp(-(x-μ)²/(2σ²))
mu, sigma = 5.0, 2.0
x = np.linspace(-2, 12, 1000)
pdf = stats.norm.pdf(x, mu, sigma)
print(f"Normal: mean={mu}, std={sigma}")
print(f"P(3 < X < 7) = {stats.norm.cdf(7, mu, sigma) - stats.norm.cdf(3, mu, sigma):.4f}")

# --- Bernoulli Distribution ---
# P(X=1) = p, P(X=0) = 1-p
p = 0.3
samples = stats.bernoulli.rvs(p, size=10000)
print(f"\nBernoulli: p={p}, sample mean={samples.mean():.4f}")

# --- Binomial Distribution ---
# n trials, each with probability p
n_trials, p = 100, 0.3
print(f"\nBinomial: n={n_trials}, p={p}")
print(f"Expected value = np = {n_trials * p}")
print(f"P(X = 30) = {stats.binom.pmf(30, n_trials, p):.4f}")
print(f"P(X <= 25) = {stats.binom.cdf(25, n_trials, p):.4f}")

# --- Multinomial Distribution ---
# Used in Naive Bayes for text classification
probs = [0.5, 0.3, 0.2]  # word probabilities
counts = np.random.multinomial(100, probs)
print(f"\nMultinomial sample (100 words): {counts}")

# --- Poisson Distribution ---
# P(X=k) = λ^k e^(-λ) / k!
lam = 4.0
print(f"\nPoisson: λ={lam}")
print(f"P(X=3) = {stats.poisson.pmf(3, lam):.4f}")
print(f"P(X<=5) = {stats.poisson.cdf(5, lam):.4f}")
```

### Maximum Likelihood Estimation (MLE)

MLE finds the parameters that make the observed data most probable. Given data $x_1, \ldots, x_n$ and a model with parameter $\theta$:

$$\hat{\theta}_{MLE} = \arg\max_\theta \prod_{i=1}^n P(x_i \mid \theta)$$

Taking the log (since log is monotonic):

$$\hat{\theta}_{MLE} = \arg\max_\theta \sum_{i=1}^n \log P(x_i \mid \theta)$$

```python
# mle.py — MLE for Gaussian parameters
import numpy as np

# Generate data from a Gaussian
np.random.seed(42)
true_mu, true_sigma = 5.0, 2.0
data = np.random.normal(true_mu, true_sigma, 1000)

# MLE for μ: take the derivative of log-likelihood, set to 0
# log L = -n/2 log(2π) - n/2 log(σ²) - 1/(2σ²) Σ(xi - μ)²
# ∂log L/∂μ = 1/σ² Σ(xi - μ) = 0
# → μ_MLE = (1/n) Σ xi = sample mean

# MLE for σ²: ∂log L/∂σ² = -n/(2σ²) + 1/(2σ⁴) Σ(xi - μ)² = 0
# → σ²_MLE = (1/n) Σ(xi - μ)²

mu_mle = np.mean(data)
sigma_mle = np.sqrt(np.mean((data - mu_mle)**2))

print(f"True μ = {true_mu}, MLE μ = {mu_mle:.4f}")
print(f"True σ = {true_sigma}, MLE σ = {sigma_mle:.4f}")
```

---

## Statistics

### Expectation and Variance

**Expected value** (mean):

$$\mathbb{E}[X] = \sum_x x \cdot P(X = x) \quad \text{(discrete)}$$

$$\mathbb{E}[X] = \int_{-\infty}^{\infty} x \cdot f(x) \, dx \quad \text{(continuous)}$$

**Variance** — measures spread:

$$\text{Var}(X) = \mathbb{E}[(X - \mu)^2] = \mathbb{E}[X^2] - (\mathbb{E}[X])^2$$

```python
# expectation_variance.py — Computing and verifying
import numpy as np

# Discrete: fair six-sided die
outcomes = np.arange(1, 7)
probs = np.ones(6) / 6

E_X = np.sum(outcomes * probs)
E_X2 = np.sum(outcomes**2 * probs)
Var_X = E_X2 - E_X**2

print(f"E[X] = {E_X:.4f}")    # 3.5
print(f"Var(X) = {Var_X:.4f}") # 2.9167

# Verify with simulation
rolls = np.random.randint(1, 7, 100000)
print(f"\nSimulated E[X] = {rolls.mean():.4f}")
print(f"Simulated Var(X) = {rolls.var():.4f}")
```

### Bias-Variance Tradeoff

The expected prediction error can be decomposed:

$$\mathbb{E}[(y - \hat{f}(x))^2] = \text{Bias}[\hat{f}(x)]^2 + \text{Var}[\hat{f}(x)] + \sigma^2$$

where:
- **Bias** = $\mathbb{E}[\hat{f}(x)] - f(x)$ — error from wrong assumptions
- **Variance** = $\mathbb{E}[(\hat{f}(x) - \mathbb{E}[\hat{f}(x)])^2]$ — error from sensitivity to training data
- $\sigma^2$ = irreducible noise

**Derivation:**

Let $y = f(x) + \epsilon$ where $\mathbb{E}[\epsilon] = 0$ and $\text{Var}(\epsilon) = \sigma^2$.

$$\mathbb{E}[(y - \hat{f})^2] = \mathbb{E}[(f + \epsilon - \hat{f})^2]$$

$$= \mathbb{E}[(f - \hat{f})^2] + \mathbb{E}[\epsilon^2] + 2\mathbb{E}[(f - \hat{f})\epsilon]$$

Since $\epsilon$ is independent of $\hat{f}$, the cross term vanishes:

$$= \mathbb{E}[(f - \hat{f})^2] + \sigma^2$$

Now expand $(f - \hat{f})^2$ by adding and subtracting $\mathbb{E}[\hat{f}]$:

$$\mathbb{E}[(f - \hat{f})^2] = (f - \mathbb{E}[\hat{f}])^2 + \mathbb{E}[(\hat{f} - \mathbb{E}[\hat{f}])^2]$$

$$= \text{Bias}^2 + \text{Variance}$$

```python
# bias_variance.py — Demonstrate the tradeoff
import numpy as np
from sklearn.preprocessing import PolynomialFeatures
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import make_pipeline
from sklearn.metrics import mean_squared_error

# True function
def true_f(x):
    return np.sin(2 * x) + 0.5 * x

# Generate many datasets to estimate bias and variance
np.random.seed(42)
n_datasets = 200
n_train = 30
x_test = np.linspace(0, 5, 100).reshape(-1, 1)
y_true = true_f(x_test.ravel())

for degree in [1, 4, 15]:
    predictions = np.zeros((n_datasets, len(x_test)))

    for i in range(n_datasets):
        x_train = np.sort(np.random.uniform(0, 5, n_train)).reshape(-1, 1)
        y_train = true_f(x_train.ravel()) + np.random.normal(0, 0.5, n_train)

        model = make_pipeline(PolynomialFeatures(degree), LinearRegression())
        model.fit(x_train, y_train)
        predictions[i] = model.predict(x_test)

    mean_pred = predictions.mean(axis=0)
    bias_sq = np.mean((mean_pred - y_true)**2)
    variance = np.mean(predictions.var(axis=0))
    mse = np.mean((predictions - y_true)**2)

    print(f"Degree {degree:2d}: Bias²={bias_sq:.4f}, Var={variance:.4f}, "
          f"Bias²+Var={bias_sq + variance:.4f}, MSE={mse:.4f}")
# Degree 1 — high bias (underfitting)
# Degree 4 — good balance
# Degree 15 — high variance (overfitting)
```

### Covariance and Correlation

Covariance measures how two variables move together:

$$\text{Cov}(X, Y) = \mathbb{E}[(X - \mu_X)(Y - \mu_Y)]$$

Pearson correlation normalizes to $[-1, 1]$:

$$\rho_{X,Y} = \frac{\text{Cov}(X, Y)}{\sigma_X \sigma_Y}$$

```python
# correlation.py — Covariance, correlation, and their matrix forms
import numpy as np

# Generate correlated data
np.random.seed(42)
n = 500
x1 = np.random.randn(n)
x2 = 0.8 * x1 + 0.6 * np.random.randn(n)  # correlated with x1
x3 = np.random.randn(n)  # independent

data = np.column_stack([x1, x2, x3])

# Covariance matrix — used in PCA, Gaussian distributions
cov_matrix = np.cov(data.T)
print("Covariance matrix:")
print(np.round(cov_matrix, 3))

# Correlation matrix — used in feature selection
corr_matrix = np.corrcoef(data.T)
print("\nCorrelation matrix:")
print(np.round(corr_matrix, 3))

# x1 and x2 are correlated (~0.8), x3 is independent (~0.0)
print(f"\ncorr(x1, x2) = {corr_matrix[0, 1]:.3f}")
print(f"corr(x1, x3) = {corr_matrix[0, 2]:.3f}")
```

### Hypothesis Testing Intuition

While you rarely do formal hypothesis testing in ML, the concepts appear everywhere:

- **p-value** in feature importance tests
- **Confidence intervals** for model performance
- **A/B testing** for model comparison in production

```python
# hypothesis.py — Comparing two model performances
import numpy as np
from scipy import stats

# Two models evaluated on 30 test folds
np.random.seed(42)
model_a_scores = np.random.normal(0.82, 0.03, 30)
model_b_scores = np.random.normal(0.85, 0.03, 30)

# Paired t-test — are the models significantly different?
t_stat, p_value = stats.ttest_rel(model_a_scores, model_b_scores)
print(f"Model A mean: {model_a_scores.mean():.4f}")
print(f"Model B mean: {model_b_scores.mean():.4f}")
print(f"t-statistic: {t_stat:.4f}")
print(f"p-value: {p_value:.6f}")

if p_value < 0.05:
    print("Difference is statistically significant at α=0.05")
else:
    print("No statistically significant difference")

# Bootstrap confidence interval for Model B accuracy
n_bootstrap = 10000
bootstrap_means = np.array([
    np.random.choice(model_b_scores, size=len(model_b_scores), replace=True).mean()
    for _ in range(n_bootstrap)
])
ci_lower = np.percentile(bootstrap_means, 2.5)
ci_upper = np.percentile(bootstrap_means, 97.5)
print(f"\n95% CI for Model B: [{ci_lower:.4f}, {ci_upper:.4f}]")
```

---

## Information Theory

### Entropy

Entropy measures the uncertainty of a random variable:

$$H(X) = -\sum_{i=1}^n p_i \log_2 p_i$$

Maximum entropy: uniform distribution (maximum uncertainty). Minimum entropy: deterministic (zero uncertainty).

```python
# entropy.py — Entropy and its role in decision trees
import numpy as np

def entropy(probs):
    """Shannon entropy in bits."""
    probs = np.array(probs)
    probs = probs[probs > 0]  # avoid log(0)
    return -np.sum(probs * np.log2(probs))

# Fair coin: maximum entropy for binary
print(f"Fair coin entropy:   {entropy([0.5, 0.5]):.4f} bits")  # 1.0

# Biased coin: lower entropy
print(f"Biased (0.9, 0.1):   {entropy([0.9, 0.1]):.4f} bits")  # 0.469

# Certain outcome: zero entropy
print(f"Certain (1.0, 0.0):  {entropy([1.0, 0.0]):.4f} bits")  # 0.0

# 3-class classification: how pure is this split?
print(f"\nPure split [1, 0, 0]:   {entropy([1.0, 0.0, 0.0]):.4f}")
print(f"Mixed [0.33,0.33,0.34]: {entropy([0.33, 0.33, 0.34]):.4f}")
print(f"Skewed [0.8, 0.1, 0.1]: {entropy([0.8, 0.1, 0.1]):.4f}")
```

### KL Divergence

Measures how one probability distribution differs from another:

$$D_{KL}(P \| Q) = \sum_x P(x) \log \frac{P(x)}{Q(x)}$$

KL divergence is not symmetric: $D_{KL}(P \| Q) \neq D_{KL}(Q \| P)$.

Cross-entropy (used as loss in classification) is related:

$$H(P, Q) = -\sum_x P(x) \log Q(x) = H(P) + D_{KL}(P \| Q)$$

Since $H(P)$ is constant during training, minimizing cross-entropy is equivalent to minimizing KL divergence.

```python
# kl_divergence.py — Cross-entropy loss connection
import numpy as np

def cross_entropy(p, q):
    """Cross-entropy between true distribution p and predicted q."""
    q = np.clip(q, 1e-15, 1)  # avoid log(0)
    return -np.sum(p * np.log(q))

def kl_divergence(p, q):
    """KL divergence D_KL(P || Q)."""
    mask = p > 0
    return np.sum(p[mask] * np.log(p[mask] / np.clip(q[mask], 1e-15, 1)))

# True distribution (one-hot for class 2 in 3-class problem)
p = np.array([0.0, 0.0, 1.0])

# Good prediction
q_good = np.array([0.05, 0.05, 0.90])
# Bad prediction
q_bad = np.array([0.40, 0.30, 0.30])

print(f"Cross-entropy (good): {cross_entropy(p, q_good):.4f}")
print(f"Cross-entropy (bad):  {cross_entropy(p, q_bad):.4f}")
print(f"KL divergence (good): {kl_divergence(p, q_good):.4f}")
print(f"KL divergence (bad):  {kl_divergence(p, q_bad):.4f}")
```

---

## Putting It All Together: Math in a Real ML Pipeline

```python
# full_pipeline_math.py — See all four pillars in action
import numpy as np
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score

# Load data — LINEAR ALGEBRA: data is a matrix
iris = load_iris()
X, y = iris.data, iris.target
print(f"Data matrix shape: {X.shape}")  # (150, 4)

# Train/test split — PROBABILITY: random sampling
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Scaling — STATISTICS: standardize to zero mean, unit variance
# z = (x - μ) / σ
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
print(f"Train mean: {X_train_scaled.mean(axis=0).round(10)}")  # ~0
print(f"Train std:  {X_train_scaled.std(axis=0).round(4)}")     # ~1

# Logistic Regression — CALCULUS: gradient descent minimizes cross-entropy
# The model learns: P(y=k|x) = softmax(Wx + b)
model = LogisticRegression(max_iter=200)
model.fit(X_train_scaled, y_train)

# Weights — LINEAR ALGEBRA: weight matrix W ∈ R^(3×4)
print(f"\nWeight matrix shape: {model.coef_.shape}")
print(f"Weights:\n{model.coef_.round(3)}")

# Prediction — LINEAR ALGEBRA: matrix multiply + CALCULUS: softmax
y_pred = model.predict(X_test_scaled)

# Evaluation — STATISTICS: accuracy is an estimator of true performance
accuracy = accuracy_score(y_test, y_pred)
print(f"\nAccuracy: {accuracy:.4f}")

# PROBABILITY: predicted probabilities via softmax
probs = model.predict_proba(X_test_scaled)[:3]
print(f"\nPredicted probabilities (first 3):\n{probs.round(4)}")
```

---

## Quick Reference

| Math Concept | ML Application | Key Formula |
|-------------|---------------|-------------|
| Dot product | Similarity, linear models | $\mathbf{w} \cdot \mathbf{x} = \sum w_i x_i$ |
| Matrix inverse | Normal equation | $\boldsymbol{\theta} = (\mathbf{X}^T\mathbf{X})^{-1}\mathbf{X}^T\mathbf{y}$ |
| Eigenvalues | PCA | $\mathbf{A}\mathbf{v} = \lambda\mathbf{v}$ |
| Derivative | Gradient descent | $\theta \leftarrow \theta - \eta \frac{\partial \mathcal{L}}{\partial \theta}$ |
| Chain rule | Backpropagation | $\frac{\partial \mathcal{L}}{\partial w} = \frac{\partial \mathcal{L}}{\partial \hat{y}} \cdot \frac{\partial \hat{y}}{\partial z} \cdot \frac{\partial z}{\partial w}$ |
| Bayes' theorem | Naive Bayes, Bayesian models | $P(A \mid B) = \frac{P(B \mid A)P(A)}{P(B)}$ |
| MLE | Parameter estimation | $\hat{\theta} = \arg\max \sum \log P(x_i \mid \theta)$ |
| Bias-variance | Model selection | $\text{Error} = \text{Bias}^2 + \text{Var} + \text{Noise}$ |
| Entropy | Decision trees, cross-entropy loss | $H = -\sum p_i \log p_i$ |
| KL divergence | Cross-entropy loss | $D_{KL}(P \| Q) = \sum P \log \frac{P}{Q}$ |

---

## Further Reading

- **[Linear Regression](/machine-learning/linear-regression)** — Normal equation and gradient descent applied
- **[Logistic Regression](/machine-learning/logistic-regression)** — MLE for classification
- **[Decision Trees](/machine-learning/decision-trees)** — Entropy and information gain in practice
- **[SVM](/machine-learning/svm)** — Lagrangian optimization and the dual problem
- **[Naive Bayes](/machine-learning/naive-bayes)** — Bayes' theorem as a classifier
