---
title: "Anomaly Detection"
description: "Complete guide to anomaly detection — Isolation Forest with random split math and anomaly scoring, Local Outlier Factor, One-Class SVM, and end-to-end Credit Card Fraud detection with imbalanced data strategies."
tags: [machine-learning, anomaly-detection, isolation-forest, lof, fraud-detection]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Anomaly Detection

Anomalies are data points that deviate significantly from the expected pattern. Detecting them is critical in fraud detection, network intrusion, manufacturing defects, medical diagnostics, and system monitoring. Unlike supervised classification (where you need labeled fraud/not-fraud), anomaly detection typically works in an **unsupervised** or **semi-supervised** setting — because anomalies are rare and hard to label.

## Taxonomy of Anomaly Detection

| Type | Description | Example |
|------|-------------|---------|
| **Point anomaly** | Single instance is anomalous | A $50,000 transaction on a card that averages $200 |
| **Contextual anomaly** | Anomalous in context, normal otherwise | 95F temperature in Alaska (normal in Arizona) |
| **Collective anomaly** | A group of instances is anomalous together | Sudden burst of failed login attempts |

### Approaches

| Approach | Assumption | Methods |
|----------|-----------|---------|
| **Statistical** | Data follows a known distribution | Z-score, Grubbs test, Mahalanobis distance |
| **Distance-based** | Anomalies are far from normal points | LOF, KNN-based |
| **Isolation-based** | Anomalies are easier to isolate | Isolation Forest |
| **Boundary-based** | Normal data occupies a region | One-Class SVM, autoencoders |

---

## Isolation Forest

### Core Intuition

Most anomaly detection methods profile "normal" and then flag deviations. Isolation Forest does the opposite — it directly **isolates anomalies**. The insight: anomalies are few and different, so they are easier to separate with random splits.

### How It Works

1. **Build isolation trees**: Randomly select a feature and a random split value between the feature's min and max. Repeat recursively until every point is isolated (alone in a leaf) or the tree reaches maximum depth.

2. **Anomaly score**: Anomalies require **fewer splits** to isolate. The path length $h(x)$ from root to leaf for a point $x$ is short for anomalies and long for normal points.

### Mathematical Formulation

The anomaly score for point $x$ is:

$$s(x, n) = 2^{-\frac{E[h(x)]}{c(n)}}$$

where $E[h(x)]$ is the average path length over all trees, and $c(n)$ is the average path length of unsuccessful search in a Binary Search Tree:

$$c(n) = 2H(n-1) - \frac{2(n-1)}{n}$$

where $H(i) = \ln(i) + \gamma$ (Euler-Mascheroni constant $\gamma \approx 0.5772$).

**Interpretation:**

| Score | Meaning |
|-------|---------|
| $s \approx 1$ | Definite anomaly (very short path) |
| $s \approx 0.5$ | Normal point (average path length) |
| $s \ll 0.5$ | Definitely normal (long path) |

### Isolation Forest From Scratch

```python
import numpy as np

class IsolationTreeNode:
    """A single node in an Isolation Tree."""
    def __init__(self, depth=0):
        self.depth = depth
        self.left = None
        self.right = None
        self.split_feature = None
        self.split_value = None
        self.size = 0  # number of samples at this node (for leaves)
        self.is_leaf = False

class IsolationTree:
    """A single Isolation Tree."""
    def __init__(self, max_depth):
        self.max_depth = max_depth

    def fit(self, X, depth=0):
        node = IsolationTreeNode(depth=depth)
        n_samples, n_features = X.shape

        # Stop if only one sample, all identical, or max depth reached
        if n_samples <= 1 or depth >= self.max_depth:
            node.is_leaf = True
            node.size = n_samples
            return node

        # Random feature and random split value
        feature = np.random.randint(n_features)
        feat_min, feat_max = X[:, feature].min(), X[:, feature].max()

        if feat_min == feat_max:
            node.is_leaf = True
            node.size = n_samples
            return node

        split_val = np.random.uniform(feat_min, feat_max)

        node.split_feature = feature
        node.split_value = split_val

        left_mask = X[:, feature] < split_val
        right_mask = ~left_mask

        node.left = self.fit(X[left_mask], depth + 1)
        node.right = self.fit(X[right_mask], depth + 1)
        return node

    def path_length(self, x, node):
        """Compute path length for a single point."""
        if node.is_leaf:
            # Adjustment for unsplit samples
            return node.depth + _c(node.size)

        if x[node.split_feature] < node.split_value:
            return self.path_length(x, node.left)
        else:
            return self.path_length(x, node.right)


def _c(n):
    """Average path length of unsuccessful search in BST."""
    if n <= 1:
        return 0
    return 2.0 * (np.log(n - 1) + 0.5772156649) - 2.0 * (n - 1) / n


class IsolationForestFromScratch:
    """Isolation Forest anomaly detector."""

    def __init__(self, n_estimators=100, max_samples=256, contamination=0.1,
                 random_state=42):
        self.n_estimators = n_estimators
        self.max_samples = max_samples
        self.contamination = contamination
        self.random_state = random_state

    def fit(self, X):
        np.random.seed(self.random_state)
        n_samples = X.shape[0]
        self.max_depth_ = int(np.ceil(np.log2(self.max_samples)))
        sample_size = min(self.max_samples, n_samples)

        self.trees_ = []
        self.roots_ = []

        for _ in range(self.n_estimators):
            # Subsample
            idx = np.random.choice(n_samples, size=sample_size, replace=False)
            X_sub = X[idx]

            tree = IsolationTree(max_depth=self.max_depth_)
            root = tree.fit(X_sub)
            self.trees_.append(tree)
            self.roots_.append(root)

        # Compute threshold from training data
        scores = self.score_samples(X)
        self.threshold_ = np.percentile(scores, 100 * self.contamination)
        return self

    def score_samples(self, X):
        """Compute anomaly scores. Lower = more anomalous."""
        avg_path_lengths = np.zeros(X.shape[0])

        for tree, root in zip(self.trees_, self.roots_):
            for i in range(X.shape[0]):
                avg_path_lengths[i] += tree.path_length(X[i], root)

        avg_path_lengths /= self.n_estimators
        # Convert to anomaly score (sklearn convention: negative = anomalous)
        scores = -2 ** (-avg_path_lengths / _c(self.max_samples))
        return scores

    def predict(self, X):
        """Return -1 for anomalies, 1 for normal."""
        scores = self.score_samples(X)
        return np.where(scores < self.threshold_, -1, 1)


# ---- Test on synthetic data ----
from sklearn.datasets import make_blobs

X_normal, _ = make_blobs(n_samples=300, centers=1, cluster_std=0.5, random_state=42)
X_anomaly = np.random.uniform(-4, 4, size=(20, 2))
X_all = np.vstack([X_normal, X_anomaly])
y_true = np.array([1]*300 + [-1]*20)

iforest_scratch = IsolationForestFromScratch(n_estimators=100, max_samples=256,
                                              contamination=0.06)
iforest_scratch.fit(X_all)
y_pred = iforest_scratch.predict(X_all)

print(f"Detected {(y_pred == -1).sum()} anomalies out of {len(X_all)} points")
```

### Scikit-learn Isolation Forest

```python
from sklearn.ensemble import IsolationForest
import matplotlib.pyplot as plt

clf = IsolationForest(n_estimators=200, max_samples=256,
                      contamination=0.06, random_state=42)
clf.fit(X_all)
y_pred_sk = clf.predict(X_all)
scores = clf.decision_function(X_all)

fig, axes = plt.subplots(1, 2, figsize=(14, 6))

# Decision boundary
xx, yy = np.meshgrid(np.linspace(-5, 5, 200), np.linspace(-5, 5, 200))
Z = clf.decision_function(np.c_[xx.ravel(), yy.ravel()]).reshape(xx.shape)

axes[0].contourf(xx, yy, Z, levels=20, cmap='RdBu_r', alpha=0.6)
axes[0].scatter(X_all[y_pred_sk == 1, 0], X_all[y_pred_sk == 1, 1],
                c='blue', s=20, label='Normal')
axes[0].scatter(X_all[y_pred_sk == -1, 0], X_all[y_pred_sk == -1, 1],
                c='red', s=50, marker='x', label='Anomaly')
axes[0].legend()
axes[0].set_title('Isolation Forest Decision Boundary')

# Score distribution
axes[1].hist(scores[y_true == 1], bins=30, alpha=0.7, label='Normal', density=True)
axes[1].hist(scores[y_true == -1], bins=15, alpha=0.7, label='Anomaly', density=True)
axes[1].axvline(x=0, color='black', linestyle='--', label='Threshold')
axes[1].legend()
axes[1].set_title('Anomaly Score Distribution')
axes[1].set_xlabel('Decision Function Score')

plt.tight_layout()
plt.savefig('isolation_forest.png', dpi=150, bbox_inches='tight')
plt.show()
```

---

## Local Outlier Factor (LOF)

### Intuition

LOF measures the **local density** of each point relative to its neighbors. A point in a sparse region surrounded by dense neighbors has a high LOF (anomalous). This makes LOF especially good at detecting anomalies near dense clusters.

### Mathematical Definition

1. **k-distance**: Distance to the $k$-th nearest neighbor of point $x$

2. **Reachability distance**: $\text{reach-dist}_k(x, o) = \max(\text{k-dist}(o), d(x, o))$
   This smooths out statistical fluctuations for points deep inside clusters.

3. **Local reachability density**: $\text{lrd}_k(x) = \frac{1}{\frac{1}{|N_k(x)|} \sum_{o \in N_k(x)} \text{reach-dist}_k(x, o)}$

4. **Local Outlier Factor**: $\text{LOF}_k(x) = \frac{1}{|N_k(x)|} \sum_{o \in N_k(x)} \frac{\text{lrd}_k(o)}{\text{lrd}_k(x)}$

| LOF Value | Meaning |
|-----------|---------|
| $\approx 1$ | Same density as neighbors — normal |
| $> 1$ | Lower density than neighbors — potential outlier |
| $\gg 1$ | Much lower density — strong anomaly |

### LOF in Practice

```python
from sklearn.neighbors import LocalOutlierFactor
import numpy as np
import matplotlib.pyplot as plt

# Create data with clusters of different densities
np.random.seed(42)
X1 = np.random.normal(0, 0.5, (200, 2))         # Dense cluster
X2 = np.random.normal(5, 1.5, (100, 2))          # Sparse cluster
X_outliers = np.array([[2.5, 2.5], [-3, 3], [7, -2], [0, 5]])  # Outliers
X_lof = np.vstack([X1, X2, X_outliers])
y_lof_true = np.array([1]*300 + [-1]*4)

lof = LocalOutlierFactor(n_neighbors=20, contamination=0.05)
y_lof_pred = lof.fit_predict(X_lof)
lof_scores = -lof.negative_outlier_factor_  # Higher = more anomalous

fig, axes = plt.subplots(1, 2, figsize=(14, 6))

# Predictions
colors = ['blue' if y == 1 else 'red' for y in y_lof_pred]
sizes = [10 if y == 1 else 80 for y in y_lof_pred]
axes[0].scatter(X_lof[:, 0], X_lof[:, 1], c=colors, s=sizes, alpha=0.6)
axes[0].set_title(f'LOF Predictions (detected {(y_lof_pred == -1).sum()} anomalies)')

# LOF scores heatmap
scatter = axes[1].scatter(X_lof[:, 0], X_lof[:, 1], c=lof_scores,
                           cmap='YlOrRd', s=20, alpha=0.7)
plt.colorbar(scatter, ax=axes[1], label='LOF Score')
axes[1].set_title('LOF Score Heatmap (higher = more anomalous)')

plt.tight_layout()
plt.savefig('lof_detection.png', dpi=150, bbox_inches='tight')
plt.show()
```

---

## One-Class SVM

### Concept

One-Class SVM learns a boundary around "normal" data. It maps data to a high-dimensional feature space via a kernel and finds the hyperplane that separates the data from the origin with maximum margin.

### Formulation

Minimize:

$$\min_{w, \xi, \rho} \frac{1}{2}\|w\|^2 + \frac{1}{\nu n}\sum_{i=1}^{n}\xi_i - \rho$$

subject to $w \cdot \phi(x_i) \geq \rho - \xi_i$ and $\xi_i \geq 0$.

The parameter $\nu \in (0, 1]$ is an upper bound on the fraction of outliers and a lower bound on the fraction of support vectors.

```python
from sklearn.svm import OneClassSVM

# One-Class SVM with RBF kernel
ocsvm = OneClassSVM(kernel='rbf', gamma='scale', nu=0.05)
ocsvm.fit(X_lof)
y_ocsvm = ocsvm.predict(X_lof)

# Decision boundary
xx, yy = np.meshgrid(np.linspace(-5, 10, 300), np.linspace(-5, 8, 300))
Z = ocsvm.decision_function(np.c_[xx.ravel(), yy.ravel()]).reshape(xx.shape)

plt.figure(figsize=(10, 7))
plt.contourf(xx, yy, Z, levels=np.linspace(Z.min(), 0, 10), cmap='Blues_r', alpha=0.4)
plt.contour(xx, yy, Z, levels=[0], linewidths=2, colors='darkred')
plt.contourf(xx, yy, Z, levels=[0, Z.max()], colors='lightyellow', alpha=0.3)

plt.scatter(X_lof[y_ocsvm == 1, 0], X_lof[y_ocsvm == 1, 1],
            c='blue', s=15, label='Normal', alpha=0.6)
plt.scatter(X_lof[y_ocsvm == -1, 0], X_lof[y_ocsvm == -1, 1],
            c='red', s=60, marker='x', label='Anomaly')
plt.legend()
plt.title('One-Class SVM Decision Boundary')
plt.savefig('ocsvm_boundary.png', dpi=150, bbox_inches='tight')
plt.show()
```

---

## Method Comparison

| Method | Strengths | Weaknesses | Best For |
|--------|-----------|-----------|----------|
| **Isolation Forest** | Fast, scales well, no distance computation | Struggles with high-D, uniform anomalies | General purpose, tabular data |
| **LOF** | Detects local anomalies near dense clusters | Slow for large data ($O(n^2)$), sensitive to $k$ | Varying density clusters |
| **One-Class SVM** | Strong boundary with kernel trick | Slow ($O(n^2)$ to $O(n^3)$), kernel selection | Small-medium datasets |
| **DBSCAN** | Clustering + anomaly in one step | Not designed for scoring | When clustering is also needed |
| **Autoencoder** | Captures complex nonlinear patterns | Requires training, architecture design | High-dimensional data |

---

## End-to-End: Credit Card Fraud Detection

### Dataset Overview

The Kaggle Credit Card Fraud dataset contains 284,807 transactions over 2 days, with 492 frauds (0.172%). Features V1-V28 are PCA-transformed (for privacy), plus `Time` and `Amount`.

```python
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.svm import OneClassSVM
from sklearn.metrics import (classification_report, precision_recall_curve,
                             average_precision_score, roc_auc_score,
                             confusion_matrix)
import matplotlib.pyplot as plt

# ---- Load data ----
# Download from: https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud
df = pd.read_csv('creditcard.csv')
print(f"Shape: {df.shape}")
print(f"Fraud rate: {df['Class'].mean():.4%}")
print(f"Fraud count: {df['Class'].sum()}")

# ---- Preprocessing ----
# Scale Amount and Time (V1-V28 are already PCA-scaled)
scaler = StandardScaler()
df['Amount_scaled'] = scaler.fit_transform(df[['Amount']])
df['Time_scaled'] = scaler.fit_transform(df[['Time']])

features = [f'V{i}' for i in range(1, 29)] + ['Amount_scaled', 'Time_scaled']
X = df[features].values
y = df['Class'].values  # 0 = normal, 1 = fraud

# ---- Train/test split ----
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"\nTrain: {X_train.shape[0]} samples, {y_train.sum()} frauds")
print(f"Test:  {X_test.shape[0]} samples, {y_test.sum()} frauds")
```

### Unsupervised Approach (No Labels During Training)

```python
# ---- Isolation Forest ----
iforest = IsolationForest(
    n_estimators=300,
    max_samples=2048,
    contamination=0.002,  # expected fraud rate
    random_state=42,
    n_jobs=-1
)
iforest.fit(X_train)

# Predict: -1 = anomaly (fraud), 1 = normal
y_pred_if = iforest.predict(X_test)
y_pred_if_binary = np.where(y_pred_if == -1, 1, 0)
y_scores_if = -iforest.decision_function(X_test)  # higher = more anomalous

print("\n=== Isolation Forest ===")
print(classification_report(y_test, y_pred_if_binary,
                            target_names=['Normal', 'Fraud']))
print(f"ROC-AUC: {roc_auc_score(y_test, y_scores_if):.4f}")
print(f"Average Precision: {average_precision_score(y_test, y_scores_if):.4f}")
```

### Semi-Supervised Approach (Train on Normal Only)

```python
# Train only on normal transactions
X_train_normal = X_train[y_train == 0]
print(f"\nTraining on {X_train_normal.shape[0]} normal transactions only")

# ---- One-Class SVM (on subset due to speed) ----
# Subsample for speed — OCSVM is O(n^2)
np.random.seed(42)
subsample_idx = np.random.choice(len(X_train_normal), size=10000, replace=False)
X_train_sub = X_train_normal[subsample_idx]

ocsvm = OneClassSVM(kernel='rbf', gamma='scale', nu=0.01)
ocsvm.fit(X_train_sub)

y_pred_ocsvm = ocsvm.predict(X_test)
y_pred_ocsvm_binary = np.where(y_pred_ocsvm == -1, 1, 0)
y_scores_ocsvm = -ocsvm.decision_function(X_test)

print("\n=== One-Class SVM ===")
print(classification_report(y_test, y_pred_ocsvm_binary,
                            target_names=['Normal', 'Fraud']))
print(f"ROC-AUC: {roc_auc_score(y_test, y_scores_ocsvm):.4f}")
```

### Precision-Recall Analysis

```python
fig, axes = plt.subplots(1, 2, figsize=(14, 6))

# Precision-Recall curves
for name, scores in [('Isolation Forest', y_scores_if),
                     ('One-Class SVM', y_scores_ocsvm)]:
    precision, recall, _ = precision_recall_curve(y_test, scores)
    ap = average_precision_score(y_test, scores)
    axes[0].plot(recall, precision, label=f'{name} (AP={ap:.3f})')

axes[0].set_xlabel('Recall')
axes[0].set_ylabel('Precision')
axes[0].set_title('Precision-Recall Curve')
axes[0].legend()
axes[0].grid(True, alpha=0.3)

# Confusion matrix for Isolation Forest
cm = confusion_matrix(y_test, y_pred_if_binary)
im = axes[1].imshow(cm, cmap='Blues')
axes[1].set_xticks([0, 1])
axes[1].set_yticks([0, 1])
axes[1].set_xticklabels(['Normal', 'Fraud'])
axes[1].set_yticklabels(['Normal', 'Fraud'])
axes[1].set_xlabel('Predicted')
axes[1].set_ylabel('Actual')
axes[1].set_title('Isolation Forest Confusion Matrix')

for i in range(2):
    for j in range(2):
        axes[1].text(j, i, f'{cm[i, j]:,}', ha='center', va='center',
                     color='white' if cm[i, j] > cm.max() / 2 else 'black',
                     fontsize=14)

plt.tight_layout()
plt.savefig('fraud_detection_results.png', dpi=150, bbox_inches='tight')
plt.show()
```

### Threshold Tuning

```python
# In fraud detection, we care more about recall (catch all fraud)
# than precision (some false alerts are acceptable)

scores = -iforest.decision_function(X_test)
thresholds = np.percentile(scores, np.arange(95, 100, 0.5))

print(f"\n{'Threshold':>10} {'Precision':>10} {'Recall':>10} {'F1':>10} {'FP Rate':>10}")
print("-" * 55)

for thresh in thresholds:
    y_pred_t = (scores >= thresh).astype(int)
    tp = ((y_pred_t == 1) & (y_test == 1)).sum()
    fp = ((y_pred_t == 1) & (y_test == 0)).sum()
    fn = ((y_pred_t == 0) & (y_test == 1)).sum()
    tn = ((y_pred_t == 0) & (y_test == 0)).sum()

    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-10)
    fpr = fp / max(fp + tn, 1)

    print(f"{thresh:10.4f} {precision:10.4f} {recall:10.4f} {f1:10.4f} {fpr:10.4f}")
```

---

## Evaluation Metrics for Anomaly Detection

Standard accuracy is **useless** for anomaly detection because data is extremely imbalanced. Use these instead:

| Metric | Formula | Why It Matters |
|--------|---------|---------------|
| **Precision** | $\frac{TP}{TP + FP}$ | Of flagged anomalies, how many are real? |
| **Recall** | $\frac{TP}{TP + FN}$ | Of real anomalies, how many did we catch? |
| **F1 Score** | $\frac{2 \cdot P \cdot R}{P + R}$ | Harmonic mean of precision and recall |
| **PR-AUC** | Area under Precision-Recall curve | Threshold-independent performance |
| **ROC-AUC** | Area under ROC curve | Can be misleading with severe imbalance |

::: warning ROC-AUC Can Be Misleading
With 0.17% fraud rate, a model that flags 1% of transactions as fraud catches 80% of fraud. ROC-AUC will be high (0.90+), but precision might be only 14%. Always use **PR-AUC** for imbalanced data.
:::

---

## Multivariate Statistical Methods

### Mahalanobis Distance

Accounts for correlations between features:

$$D_M(x) = \sqrt{(x - \mu)^T \Sigma^{-1} (x - \mu)}$$

where $\mu$ is the mean vector and $\Sigma$ is the covariance matrix. Under multivariate normality, $D_M^2$ follows a $\chi^2_d$ distribution.

```python
from scipy.spatial.distance import mahalanobis
from scipy.stats import chi2

def mahalanobis_anomaly_detection(X, alpha=0.01):
    """Detect anomalies using Mahalanobis distance."""
    mu = X.mean(axis=0)
    cov = np.cov(X, rowvar=False)
    cov_inv = np.linalg.pinv(cov)

    distances = np.array([mahalanobis(x, mu, cov_inv) for x in X])

    # Chi-squared threshold
    threshold = np.sqrt(chi2.ppf(1 - alpha, df=X.shape[1]))

    return distances, distances > threshold

# Demo
from sklearn.datasets import make_blobs
X_demo, _ = make_blobs(n_samples=200, centers=1, cluster_std=1.0, random_state=42)
X_demo = np.vstack([X_demo, [[5, 5], [-4, 3], [3, -4]]])  # add outliers

distances, is_anomaly = mahalanobis_anomaly_detection(X_demo)
print(f"Detected {is_anomaly.sum()} anomalies via Mahalanobis distance")
```

---

## Ensemble Anomaly Detection

Combining multiple detectors improves robustness:

```python
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import MinMaxScaler

def ensemble_anomaly_scores(X, contamination=0.01):
    """Combine Isolation Forest and LOF scores."""
    # Isolation Forest scores
    iforest = IsolationForest(n_estimators=200, contamination=contamination,
                               random_state=42)
    iforest.fit(X)
    scores_if = -iforest.decision_function(X)

    # LOF scores
    lof = LocalOutlierFactor(n_neighbors=20, contamination=contamination)
    lof.fit_predict(X)
    scores_lof = -lof.negative_outlier_factor_

    # Normalize both to [0, 1]
    scaler = MinMaxScaler()
    scores_if_norm = scaler.fit_transform(scores_if.reshape(-1, 1)).ravel()
    scores_lof_norm = scaler.fit_transform(scores_lof.reshape(-1, 1)).ravel()

    # Average ensemble
    ensemble_scores = (scores_if_norm + scores_lof_norm) / 2

    return ensemble_scores, scores_if_norm, scores_lof_norm

ensemble_scores, if_scores, lof_scores = ensemble_anomaly_scores(X_demo)

# Threshold at specified contamination
threshold = np.percentile(ensemble_scores, 100 * (1 - 0.02))
anomalies = ensemble_scores > threshold
print(f"Ensemble detected {anomalies.sum()} anomalies")
```

---

## Production Considerations

### Streaming Anomaly Detection

```python
class OnlineIsolationForest:
    """Simplified online anomaly detector using sliding window."""

    def __init__(self, window_size=5000, n_estimators=100):
        self.window_size = window_size
        self.n_estimators = n_estimators
        self.buffer = []
        self.model = None

    def update(self, x):
        """Add new observation and retrain if window full."""
        self.buffer.append(x)
        if len(self.buffer) > self.window_size:
            self.buffer = self.buffer[-self.window_size:]

        if len(self.buffer) >= 100 and len(self.buffer) % 500 == 0:
            X_window = np.array(self.buffer)
            self.model = IsolationForest(
                n_estimators=self.n_estimators,
                contamination=0.01,
                random_state=42
            )
            self.model.fit(X_window)

    def predict(self, x):
        """Score a single point. Returns anomaly score."""
        if self.model is None:
            return 0.0
        return -self.model.decision_function(x.reshape(1, -1))[0]
```

### Alert Fatigue Mitigation

| Strategy | Description |
|----------|-------------|
| **Adaptive thresholds** | Different thresholds for different times/regions |
| **Cooldown periods** | Suppress repeated alerts for the same entity |
| **Severity scoring** | Rank anomalies by magnitude, alert only high-severity |
| **Feedback loops** | Label alerts as true/false positive, retrain accordingly |
| **Context enrichment** | Add business context before alerting |

---

## Key Takeaways

| Concept | Remember |
|---------|----------|
| Isolation Forest isolates anomalies (short paths) | Anomaly score $s \approx 1$ means anomaly |
| LOF compares local density to neighbor density | Good for varying-density data |
| One-Class SVM learns a boundary around normal data | $\nu$ controls expected outlier fraction |
| Always use PR-AUC for imbalanced data | ROC-AUC is misleading at extreme imbalance |
| Contamination parameter is critical | Set it to expected anomaly rate |
| Ensemble methods improve robustness | Average normalized scores from multiple detectors |
| Threshold tuning depends on business cost | High recall if missing anomalies is expensive |
