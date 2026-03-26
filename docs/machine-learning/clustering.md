---
title: "Clustering"
description: "Complete guide to clustering algorithms — K-Means (Lloyd's algorithm from scratch), DBSCAN, hierarchical agglomerative clustering, GMM with EM algorithm, evaluation with silhouette score and elbow method."
tags: [machine-learning, clustering, k-means, dbscan, unsupervised]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Clustering

Clustering groups unlabeled data points so that points within a cluster are more similar to each other than to points in other clusters. It is the most fundamental unsupervised learning task — used in customer segmentation, image compression, anomaly detection, topic discovery, and gene expression analysis.

## Why Clustering Matters

Supervised learning requires labels. Labels are expensive. In most organizations, 95%+ of data is unlabeled. Clustering finds hidden structure without human annotation:

- **Customer segmentation**: Group customers by purchasing behavior for targeted marketing
- **Image compression**: Reduce color palette by clustering pixel colors
- **Document organization**: Group similar documents without predefined categories
- **Anomaly detection**: Points that don't belong to any cluster are anomalies
- **Pre-labeling**: Generate pseudo-labels for semi-supervised pipelines

## Intuition: What Makes a Good Cluster?

A good clustering maximizes **intra-cluster similarity** and minimizes **inter-cluster similarity**. The challenge: "similarity" depends on the distance metric, and the "right" number of clusters is rarely known in advance.

---

## K-Means: Lloyd's Algorithm

### The Idea

Partition $n$ data points into $K$ clusters by iterating between two steps:
1. **Assign** each point to the nearest centroid
2. **Update** each centroid to the mean of its assigned points

### Mathematical Formulation

Given data $X = \{x_1, x_2, \ldots, x_n\}$ where $x_i \in \mathbb{R}^d$, K-Means minimizes the **within-cluster sum of squares (WCSS)**:

$$J = \sum_{k=1}^{K} \sum_{x_i \in C_k} \|x_i - \mu_k\|^2$$

where $C_k$ is the set of points in cluster $k$ and $\mu_k = \frac{1}{|C_k|} \sum_{x_i \in C_k} x_i$ is the centroid.

### Lloyd's Algorithm Step-by-Step

1. **Initialize** $K$ centroids $\mu_1, \ldots, \mu_K$ (randomly or via K-Means++)
2. **Assignment step**: For each point $x_i$, assign to nearest centroid:

$$c_i = \arg\min_{k} \|x_i - \mu_k\|^2$$

3. **Update step**: Recompute each centroid:

$$\mu_k = \frac{1}{|C_k|} \sum_{x_i \in C_k} x_i$$

4. **Repeat** until centroids converge (movement $< \epsilon$) or max iterations reached

**Convergence guarantee**: WCSS decreases monotonically at each step. Since there are finitely many partitions, the algorithm always converges — but possibly to a local minimum.

### K-Means++ Initialization

Random initialization can lead to poor convergence. K-Means++ selects initial centroids that are spread out:

1. Choose first centroid uniformly at random from data
2. For each remaining centroid, choose point $x$ with probability proportional to $D(x)^2$, where $D(x)$ is the distance to the nearest existing centroid
3. Repeat until $K$ centroids are chosen

This gives an $O(\log K)$-competitive approximation to the optimal WCSS.

### From-Scratch NumPy Implementation

```python
import numpy as np

class KMeansFromScratch:
    """K-Means clustering with K-Means++ initialization."""

    def __init__(self, n_clusters=3, max_iter=300, tol=1e-4, random_state=42):
        self.n_clusters = n_clusters
        self.max_iter = max_iter
        self.tol = tol
        self.rng = np.random.RandomState(random_state)

    def _init_centroids_plus_plus(self, X):
        """K-Means++ initialization."""
        n_samples = X.shape[0]
        centroids = [X[self.rng.randint(n_samples)]]

        for _ in range(1, self.n_clusters):
            # Squared distances to nearest centroid
            dists = np.min(
                [np.sum((X - c) ** 2, axis=1) for c in centroids], axis=0
            )
            # Probability proportional to D(x)^2
            probs = dists / dists.sum()
            idx = self.rng.choice(n_samples, p=probs)
            centroids.append(X[idx])

        return np.array(centroids)

    def fit(self, X):
        """Fit K-Means to data X of shape (n_samples, n_features)."""
        self.centroids_ = self._init_centroids_plus_plus(X)
        self.inertia_history_ = []

        for iteration in range(self.max_iter):
            # Assignment step: compute distances to all centroids
            distances = np.array([
                np.sum((X - c) ** 2, axis=1) for c in self.centroids_
            ]).T  # shape: (n_samples, n_clusters)
            self.labels_ = np.argmin(distances, axis=1)

            # Compute inertia (WCSS)
            inertia = sum(
                np.sum((X[self.labels_ == k] - self.centroids_[k]) ** 2)
                for k in range(self.n_clusters)
            )
            self.inertia_history_.append(inertia)

            # Update step: recompute centroids
            new_centroids = np.array([
                X[self.labels_ == k].mean(axis=0)
                if np.any(self.labels_ == k)
                else self.centroids_[k]  # keep old if empty cluster
                for k in range(self.n_clusters)
            ])

            # Check convergence
            shift = np.sum((new_centroids - self.centroids_) ** 2)
            self.centroids_ = new_centroids
            if shift < self.tol:
                break

        self.n_iter_ = iteration + 1
        self.inertia_ = self.inertia_history_[-1]
        return self

    def predict(self, X):
        """Assign new points to nearest centroid."""
        distances = np.array([
            np.sum((X - c) ** 2, axis=1) for c in self.centroids_
        ]).T
        return np.argmin(distances, axis=1)
```

### Scikit-learn K-Means

```python
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.datasets import make_blobs
import matplotlib.pyplot as plt

# Generate synthetic data
X, y_true = make_blobs(n_samples=500, centers=4, cluster_std=0.8,
                        random_state=42)

# Always scale before clustering
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Fit K-Means
kmeans = KMeans(n_clusters=4, init='k-means++', n_init=10,
                max_iter=300, random_state=42)
kmeans.fit(X_scaled)

print(f"Inertia (WCSS): {kmeans.inertia_:.2f}")
print(f"Iterations: {kmeans.n_iter_}")
print(f"Cluster sizes: {np.bincount(kmeans.labels_)}")
```

---

## Choosing K: Elbow Method and Silhouette Score

### Elbow Method

Plot WCSS (inertia) vs. $K$. The "elbow" — where adding more clusters yields diminishing returns — suggests the right $K$.

```python
inertias = []
K_range = range(2, 11)

for k in K_range:
    km = KMeans(n_clusters=k, n_init=10, random_state=42)
    km.fit(X_scaled)
    inertias.append(km.inertia_)

plt.figure(figsize=(8, 4))
plt.plot(K_range, inertias, 'bo-')
plt.xlabel('Number of Clusters (K)')
plt.ylabel('Inertia (WCSS)')
plt.title('Elbow Method')
plt.grid(True, alpha=0.3)
plt.show()
```

**Limitation**: The elbow is often ambiguous. Use silhouette score for a more quantitative answer.

### Silhouette Score

For each point $i$, the silhouette coefficient is:

$$s(i) = \frac{b(i) - a(i)}{\max(a(i), b(i))}$$

where:
- $a(i)$ = mean distance from $i$ to all other points in the **same cluster** (cohesion)
- $b(i)$ = mean distance from $i$ to all points in the **nearest other cluster** (separation)

The overall silhouette score is $\bar{s} = \frac{1}{n} \sum_{i=1}^{n} s(i)$.

- $s(i) \approx 1$: Point is well-clustered
- $s(i) \approx 0$: Point is on the border between clusters
- $s(i) < 0$: Point is likely in the wrong cluster

```python
from sklearn.metrics import silhouette_score, silhouette_samples

sil_scores = []
for k in K_range:
    km = KMeans(n_clusters=k, n_init=10, random_state=42)
    labels = km.fit_predict(X_scaled)
    score = silhouette_score(X_scaled, labels)
    sil_scores.append(score)
    print(f"K={k}: Silhouette = {score:.3f}")

best_k = K_range[np.argmax(sil_scores)]
print(f"\nBest K by silhouette: {best_k}")
```

---

## DBSCAN: Density-Based Clustering

### The Idea

Unlike K-Means, DBSCAN doesn't require specifying $K$. It finds clusters as dense regions separated by sparse regions and can discover clusters of arbitrary shape.

### Key Parameters

- **eps ($\varepsilon$)**: Maximum distance between two points to be considered neighbors
- **min_samples**: Minimum number of points in the $\varepsilon$-neighborhood to form a core point

### Point Types

1. **Core point**: Has at least `min_samples` points within radius $\varepsilon$
2. **Border point**: Within $\varepsilon$ of a core point but not a core point itself
3. **Noise point**: Neither core nor border — labeled as -1

### Algorithm

1. For each unvisited point $p$:
   - Find all points within $\varepsilon$ distance (the $\varepsilon$-neighborhood)
   - If $|N_\varepsilon(p)| \geq$ `min_samples`, $p$ is a core point — start a new cluster
   - Expand the cluster by recursively adding all density-reachable points
2. Points not reachable from any core point are noise

### Choosing eps with the k-Distance Graph

```python
from sklearn.neighbors import NearestNeighbors

# Use k = min_samples - 1 (convention)
k = 4
nn = NearestNeighbors(n_neighbors=k + 1)
nn.fit(X_scaled)
distances, _ = nn.kneighbors(X_scaled)

# Sort k-th nearest neighbor distances
k_distances = np.sort(distances[:, k])

plt.figure(figsize=(8, 4))
plt.plot(k_distances)
plt.xlabel('Points (sorted by distance)')
plt.ylabel(f'{k}-th Nearest Neighbor Distance')
plt.title('k-Distance Graph for Choosing eps')
plt.grid(True, alpha=0.3)
plt.show()
# Look for the "elbow" — that distance is a good eps
```

### Scikit-learn DBSCAN

```python
from sklearn.cluster import DBSCAN

dbscan = DBSCAN(eps=0.5, min_samples=5, metric='euclidean')
labels = dbscan.fit_predict(X_scaled)

n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
n_noise = list(labels).count(-1)

print(f"Clusters found: {n_clusters}")
print(f"Noise points: {n_noise}")
print(f"Silhouette (excl. noise): "
      f"{silhouette_score(X_scaled[labels != -1], labels[labels != -1]):.3f}")
```

### DBSCAN vs K-Means

| Feature | K-Means | DBSCAN |
|---------|---------|--------|
| Requires K | Yes | No |
| Cluster shape | Spherical | Arbitrary |
| Handles noise | No | Yes (labels as -1) |
| Handles varying density | No | Poorly (single eps) |
| Complexity | $O(nKd \cdot i)$ | $O(n \log n)$ with tree |
| Deterministic | No (init-dependent) | Yes |

---

## Hierarchical Agglomerative Clustering

### The Idea

Start with each point as its own cluster. Repeatedly merge the two closest clusters until only one remains. The result is a **dendrogram** — a tree showing the merge history.

### Linkage Criteria

The "distance between clusters" depends on the linkage method:

- **Single linkage**: $d(A, B) = \min_{a \in A, b \in B} d(a, b)$ — prone to chaining
- **Complete linkage**: $d(A, B) = \max_{a \in A, b \in B} d(a, b)$ — produces compact clusters
- **Average linkage**: $d(A, B) = \frac{1}{|A||B|} \sum_{a \in A} \sum_{b \in B} d(a, b)$
- **Ward's method**: Minimizes the increase in total within-cluster variance — most commonly used

**Ward's merge criterion**: Merge clusters $A$ and $B$ that minimize:

$$\Delta = \frac{|A| \cdot |B|}{|A| + |B|} \|\mu_A - \mu_B\|^2$$

### Scikit-learn + Dendrogram

```python
from sklearn.cluster import AgglomerativeClustering
from scipy.cluster.hierarchy import dendrogram, linkage

# Compute linkage matrix for dendrogram
Z = linkage(X_scaled, method='ward')

plt.figure(figsize=(12, 5))
dendrogram(Z, truncate_mode='lastp', p=20, leaf_rotation=90)
plt.title('Hierarchical Clustering Dendrogram (Ward)')
plt.xlabel('Cluster Size')
plt.ylabel('Distance')
plt.show()

# Cut the dendrogram at desired number of clusters
agg = AgglomerativeClustering(n_clusters=4, linkage='ward')
agg_labels = agg.fit_predict(X_scaled)

print(f"Silhouette: {silhouette_score(X_scaled, agg_labels):.3f}")
```

---

## Gaussian Mixture Models (GMM)

### The Idea

K-Means assigns each point to exactly one cluster (hard assignment). GMMs model data as a mixture of $K$ Gaussian distributions and provide **soft assignments** — the probability that each point belongs to each cluster.

### Generative Model

The data is generated by:

1. Choose cluster $k$ with probability $\pi_k$ (mixing coefficient)
2. Draw $x$ from $\mathcal{N}(\mu_k, \Sigma_k)$

The probability density:

$$p(x) = \sum_{k=1}^{K} \pi_k \cdot \mathcal{N}(x \mid \mu_k, \Sigma_k)$$

where:

$$\mathcal{N}(x \mid \mu, \Sigma) = \frac{1}{(2\pi)^{d/2} |\Sigma|^{1/2}} \exp\left(-\frac{1}{2}(x - \mu)^T \Sigma^{-1} (x - \mu)\right)$$

### The EM Algorithm

Since we can't directly maximize the log-likelihood (it involves a sum inside the log), we use **Expectation-Maximization**:

**E-step** — Compute responsibilities (posterior probability that point $i$ belongs to cluster $k$):

$$\gamma_{ik} = \frac{\pi_k \cdot \mathcal{N}(x_i \mid \mu_k, \Sigma_k)}{\sum_{j=1}^{K} \pi_j \cdot \mathcal{N}(x_i \mid \mu_j, \Sigma_j)}$$

**M-step** — Update parameters using responsibilities:

$$N_k = \sum_{i=1}^{n} \gamma_{ik}$$

$$\mu_k = \frac{1}{N_k} \sum_{i=1}^{n} \gamma_{ik} \cdot x_i$$

$$\Sigma_k = \frac{1}{N_k} \sum_{i=1}^{n} \gamma_{ik} (x_i - \mu_k)(x_i - \mu_k)^T$$

$$\pi_k = \frac{N_k}{n}$$

Repeat until log-likelihood converges.

### Scikit-learn GMM

```python
from sklearn.mixture import GaussianMixture

gmm = GaussianMixture(n_components=4, covariance_type='full',
                       n_init=5, random_state=42)
gmm.fit(X_scaled)

# Soft assignments (probabilities)
probs = gmm.predict_proba(X_scaled)
labels = gmm.predict(X_scaled)

print(f"Log-likelihood: {gmm.score(X_scaled):.3f}")
print(f"BIC: {gmm.bic(X_scaled):.1f}")
print(f"AIC: {gmm.aic(X_scaled):.1f}")

# Use BIC to select number of components
bics = []
for k in range(2, 10):
    g = GaussianMixture(n_components=k, random_state=42)
    g.fit(X_scaled)
    bics.append(g.bic(X_scaled))

best_k = range(2, 10)[np.argmin(bics)]
print(f"Best K by BIC: {best_k}")
```

### Covariance Types

| Type | Parameters per component | Shape |
|------|--------------------------|-------|
| `'full'` | $d(d+1)/2$ | Arbitrary ellipsoid |
| `'tied'` | $d(d+1)/2$ (shared) | Same ellipsoid, different centers |
| `'diag'` | $d$ | Axis-aligned ellipsoid |
| `'spherical'` | $1$ | Sphere (like K-Means) |

---

## Real Dataset: Mall Customers Segmentation

```python
import pandas as pd
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
import matplotlib.pyplot as plt
import numpy as np

# Load Mall Customers dataset
# Columns: CustomerID, Gender, Age, Annual Income (k$), Spending Score (1-100)
url = "https://raw.githubusercontent.com/dsrscientist/dataset1/master/mall_customers.csv"
df = pd.read_csv(url)
print(df.head())
print(f"\nShape: {df.shape}")
print(df.describe())

# Use Annual Income and Spending Score for 2D visualization
X = df[['Annual Income (k$)', 'Spending Score (1-100)']].values
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# --- Elbow Method ---
inertias = []
sil_scores = []
K_range = range(2, 11)

for k in K_range:
    km = KMeans(n_clusters=k, n_init=10, random_state=42)
    km.fit(X_scaled)
    inertias.append(km.inertia_)
    sil_scores.append(silhouette_score(X_scaled, km.labels_))

fig, axes = plt.subplots(1, 2, figsize=(14, 5))
axes[0].plot(K_range, inertias, 'bo-')
axes[0].set_title('Elbow Method')
axes[0].set_xlabel('K')
axes[0].set_ylabel('Inertia')

axes[1].plot(K_range, sil_scores, 'ro-')
axes[1].set_title('Silhouette Score')
axes[1].set_xlabel('K')
axes[1].set_ylabel('Score')
plt.tight_layout()
plt.show()

# --- K-Means with best K ---
best_k = 5  # Typical result for this dataset
kmeans = KMeans(n_clusters=best_k, n_init=10, random_state=42)
km_labels = kmeans.fit_predict(X_scaled)

# --- Compare all methods ---
methods = {
    'K-Means (K=5)': km_labels,
    'DBSCAN (eps=0.5)': DBSCAN(eps=0.5, min_samples=5).fit_predict(X_scaled),
    'Agglomerative (K=5)': AgglomerativeClustering(n_clusters=5).fit_predict(X_scaled),
    'GMM (K=5)': GaussianMixture(n_components=5, random_state=42).fit_predict(X_scaled),
}

fig, axes = plt.subplots(1, 4, figsize=(20, 5))
for ax, (name, labels) in zip(axes, methods.items()):
    scatter = ax.scatter(X[:, 0], X[:, 1], c=labels, cmap='viridis', s=30, alpha=0.7)
    ax.set_title(name)
    ax.set_xlabel('Annual Income (k$)')
    ax.set_ylabel('Spending Score')
    # Silhouette (skip noise-only results)
    valid = labels[labels != -1]
    if len(set(valid)) > 1:
        sil = silhouette_score(X_scaled[labels != -1], valid)
        ax.text(0.05, 0.95, f'Sil: {sil:.3f}', transform=ax.transAxes, va='top')

plt.tight_layout()
plt.show()

# --- Segment profiling ---
df['Cluster'] = km_labels
profile = df.groupby('Cluster').agg({
    'Age': 'mean',
    'Annual Income (k$)': 'mean',
    'Spending Score (1-100)': 'mean',
    'CustomerID': 'count'
}).rename(columns={'CustomerID': 'Count'}).round(1)
print("\nCluster Profiles:")
print(profile)
```

---

## Hyperparameters Reference

### K-Means

| Parameter | Default | Guidance |
|-----------|---------|----------|
| `n_clusters` | 8 | Use elbow + silhouette to choose |
| `init` | `'k-means++'` | Always use K-Means++ |
| `n_init` | 10 | More runs = better chance of global optimum |
| `max_iter` | 300 | Increase if not converging |
| `tol` | 1e-4 | Convergence threshold for centroid movement |

### DBSCAN

| Parameter | Default | Guidance |
|-----------|---------|----------|
| `eps` | 0.5 | Use k-distance graph to choose |
| `min_samples` | 5 | Rule of thumb: $2 \times d$ (dimensions) |
| `metric` | `'euclidean'` | Try `'cosine'` for text data |

### Agglomerative

| Parameter | Default | Guidance |
|-----------|---------|----------|
| `n_clusters` | 2 | Use dendrogram to pick cutoff |
| `linkage` | `'ward'` | Ward for compact clusters, average for varied |
| `metric` | `'euclidean'` | Ward requires euclidean |

### GMM

| Parameter | Default | Guidance |
|-----------|---------|----------|
| `n_components` | 1 | Use BIC/AIC to select |
| `covariance_type` | `'full'` | Start full, try diag if overfitting |
| `n_init` | 1 | Use 5-10 for stability |
| `reg_covar` | 1e-6 | Increase if singular covariance errors |

---

## Edge Cases and Pitfalls

### Scaling Is Mandatory
K-Means and DBSCAN use distance metrics. If features have different scales, the feature with the largest range dominates. **Always standardize** with `StandardScaler` or `MinMaxScaler`.

### Empty Clusters in K-Means
If a centroid has no assigned points, the cluster dies. Scikit-learn handles this by reinitializing the centroid, but from-scratch implementations must handle it explicitly.

### DBSCAN with Varying Density
A single `eps` cannot capture clusters with different densities. Use **HDBSCAN** (hierarchical DBSCAN) instead:

```python
import hdbscan

clusterer = hdbscan.HDBSCAN(min_cluster_size=15, min_samples=5)
labels = clusterer.fit_predict(X_scaled)
```

### High-Dimensional Data
Distance metrics become less meaningful in high dimensions (curse of dimensionality). Apply [dimensionality reduction](/machine-learning/dimensionality-reduction) before clustering.

### Non-Convex Clusters
K-Means assumes convex, spherical clusters. For non-convex shapes, use DBSCAN, spectral clustering, or GMM.

### Categorical Features
K-Means uses Euclidean distance and cannot handle categorical features directly. Use **K-Modes** or **K-Prototypes** for mixed data, or encode categoricals properly.

---

## Comparison Summary

| Algorithm | Best For | Weaknesses | Complexity |
|-----------|----------|------------|------------|
| K-Means | Large datasets, spherical clusters | Requires K, sensitive to init | $O(nKdi)$ |
| DBSCAN | Arbitrary shapes, noise detection | Struggles with varying density | $O(n \log n)$ |
| Agglomerative | Small-medium data, dendrogram | $O(n^2)$ memory, no predict | $O(n^2 \log n)$ |
| GMM | Soft assignments, elliptical clusters | Can overfit, slow with many features | $O(nKd^2i)$ |
| HDBSCAN | Varying density, robust | More complex to tune | $O(n \log n)$ |

---

## Cross-References

- [Dimensionality Reduction](/machine-learning/dimensionality-reduction) — Reduce dimensions before clustering high-dimensional data
- [Anomaly Detection](/machine-learning/anomaly-detection) — Clustering-based anomaly detection
- [Evaluation Metrics](/machine-learning/evaluation-metrics) — Silhouette, adjusted Rand index, normalized mutual information
- [Feature Engineering](/machine-learning/feature-engineering-advanced) — Feature scaling and transformation for clustering
- [Algorithm Selection Guide](/machine-learning/algorithm-selection-guide) — When to choose clustering vs other methods
