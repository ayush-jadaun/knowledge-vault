---
title: "Advanced Feature Engineering"
description: "Complete guide to advanced feature engineering — target encoding with Bayesian smoothing, polynomial and interaction features, automated feature generation with Featuretools, and comprehensive feature importance comparison across methods."
tags: [machine-learning, feature-engineering, target-encoding, featuretools, feature-importance]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Advanced Feature Engineering

Feature engineering is the process of transforming raw data into features that better represent the underlying problem to the predictive model. Andrew Ng famously said: "Coming up with features is difficult, time-consuming, requires expert knowledge. Applied machine learning is basically feature engineering." This page covers advanced techniques that go beyond basic one-hot encoding and scaling.

## Why Feature Engineering Matters

A well-engineered feature can replace an entire model upgrade:

| Scenario | Raw Features | Engineered Features | Impact |
|----------|-------------|-------------------|--------|
| House price prediction | Square footage, bedrooms | Price per sq ft in neighborhood | +15% R² |
| Fraud detection | Transaction amount | Ratio to user's average spend | +20% recall |
| Customer churn | Account age (days) | Days since last login | +25% AUC |
| Click prediction | User ID, page ID | User's historical CTR on similar pages | +30% AUC |

---

## Target Encoding

### The Problem with One-Hot Encoding

High-cardinality categorical features (ZIP codes, product IDs, user IDs) create thousands of binary columns with one-hot encoding. This causes:

- **Dimensionality explosion**: 10,000 ZIP codes = 10,000 new features
- **Sparse matrices**: Most values are 0
- **No ordinal information**: ZIP 10001 and 10002 are treated as completely unrelated

### Basic Target Encoding

Replace each category with the mean of the target for that category:

$$\text{TE}(c) = E[y | x = c] = \frac{1}{n_c} \sum_{i: x_i = c} y_i$$

**Problem**: Categories with few samples have noisy estimates. A category with 1 sample gets encoded as exactly 0 or 1 — pure memorization.

### Bayesian Smoothing (Regularized Target Encoding)

Blend the category mean with the global mean using a smoothing factor:

$$\text{TE}_{\text{smooth}}(c) = \frac{n_c \cdot \bar{y}_c + m \cdot \bar{y}_{\text{global}}}{n_c + m}$$

where:
- $\bar{y}_c$ = mean target for category $c$
- $n_c$ = number of samples in category $c$
- $\bar{y}_{\text{global}}$ = global mean target
- $m$ = smoothing parameter (higher = more regularization)

**Interpretation**: When $n_c \gg m$, trust the category mean. When $n_c \ll m$, fall back to the global mean.

### From Scratch Implementation

```python
import numpy as np
import pandas as pd
from sklearn.model_selection import KFold

class TargetEncoderFromScratch:
    """Target encoding with Bayesian smoothing and CV regularization."""

    def __init__(self, smoothing=10, cv=5, random_state=42):
        self.smoothing = smoothing
        self.cv = cv
        self.random_state = random_state

    def fit_transform(self, X, y, columns):
        """Fit and transform using out-of-fold encoding to prevent leakage."""
        X = X.copy()
        self.encodings_ = {}
        self.global_mean_ = y.mean()

        for col in columns:
            # For transform (test data): use full training data
            self.encodings_[col] = self._compute_encodings(X[col], y)

            # For train data: use out-of-fold to prevent leakage
            X[f'{col}_target_enc'] = np.nan
            kf = KFold(n_splits=self.cv, shuffle=True,
                       random_state=self.random_state)

            for train_idx, val_idx in kf.split(X):
                encodings_fold = self._compute_encodings(
                    X.iloc[train_idx][col], y.iloc[train_idx]
                )
                X.iloc[val_idx, X.columns.get_loc(f'{col}_target_enc')] = (
                    X.iloc[val_idx][col].map(encodings_fold)
                )

            # Fill unknown categories with global mean
            X[f'{col}_target_enc'].fillna(self.global_mean_, inplace=True)

        return X

    def transform(self, X, columns):
        """Transform new data using fitted encodings."""
        X = X.copy()
        for col in columns:
            X[f'{col}_target_enc'] = (
                X[col].map(self.encodings_[col]).fillna(self.global_mean_)
            )
        return X

    def _compute_encodings(self, feature, target):
        """Compute smoothed target encoding."""
        stats = pd.DataFrame({'feature': feature, 'target': target})
        agg = stats.groupby('feature')['target'].agg(['mean', 'count'])

        smooth = (
            (agg['count'] * agg['mean'] + self.smoothing * self.global_mean_) /
            (agg['count'] + self.smoothing)
        )
        return smooth.to_dict()


# ---- Demo ----
np.random.seed(42)
n = 1000
df = pd.DataFrame({
    'city': np.random.choice(['NYC', 'LA', 'Chicago', 'Houston', 'Phoenix',
                               'Rare1', 'Rare2', 'Rare3'], n,
                              p=[0.25, 0.2, 0.15, 0.15, 0.1, 0.05, 0.05, 0.05]),
    'category': np.random.choice(['A', 'B', 'C', 'D'], n),
})
# Target depends on city
city_effect = {'NYC': 0.8, 'LA': 0.6, 'Chicago': 0.5, 'Houston': 0.4,
               'Phoenix': 0.3, 'Rare1': 0.9, 'Rare2': 0.1, 'Rare3': 0.5}
df['target'] = [np.random.binomial(1, city_effect.get(c, 0.5)) for c in df['city']]

encoder = TargetEncoderFromScratch(smoothing=10, cv=5)
df_encoded = encoder.fit_transform(df, df['target'], ['city', 'category'])

print("Target encoding results:")
print(df_encoded.groupby('city')['city_target_enc'].first().sort_values())
print(f"\nGlobal mean: {df['target'].mean():.3f}")
print("Note: Rare categories are pulled toward global mean by smoothing")
```

### Scikit-learn Target Encoding

```python
from sklearn.preprocessing import TargetEncoder

te = TargetEncoder(smooth='auto', cv=5, random_state=42)
X_encoded = te.fit_transform(df[['city', 'category']], df['target'])

print("Sklearn TargetEncoder:")
print(pd.DataFrame(X_encoded, columns=['city_enc', 'category_enc']).describe())
```

---

## Interaction Features

### Polynomial Features

Create all polynomial and interaction terms up to a given degree:

For features $[x_1, x_2]$ with degree 2:

$$[1, x_1, x_2, x_1^2, x_1 x_2, x_2^2]$$

Number of output features: $\binom{d + \text{degree}}{\text{degree}}$ where $d$ is the number of input features.

```python
from sklearn.preprocessing import PolynomialFeatures
import numpy as np

X_demo = np.array([[2, 3], [4, 5], [6, 7]])

poly = PolynomialFeatures(degree=2, include_bias=False, interaction_only=False)
X_poly = poly.fit_transform(X_demo)

print("Feature names:", poly.get_feature_names_out())
print("Shape:", X_demo.shape, "->", X_poly.shape)
print(X_poly)
```

### Targeted Interaction Features

Instead of generating all interactions (combinatorial explosion), create domain-specific ones:

```python
def create_interaction_features(df):
    """Create domain-specific interaction features."""
    df = df.copy()

    # Ratios (more interpretable than products)
    df['price_per_sqft'] = df['price'] / df['sqft'].clip(lower=1)
    df['rooms_per_sqft'] = df['rooms'] / df['sqft'].clip(lower=1)
    df['bathrooms_ratio'] = df['bathrooms'] / df['bedrooms'].clip(lower=1)

    # Products (capture joint effects)
    df['location_size'] = df['location_score'] * df['sqft']
    df['age_condition'] = df['age'] * df['condition_score']

    # Differences
    df['listed_minus_avg'] = df['listed_price'] - df['neighborhood_avg_price']

    # Grouping + aggregation (statistical features)
    df['price_vs_zip_median'] = df.groupby('zipcode')['price'].transform(
        lambda x: x / x.median()
    )

    return df
```

### Feature Crosses for Categorical Variables

```python
def create_feature_crosses(df, col1, col2):
    """Create a feature cross (combination) of two categorical columns."""
    df = df.copy()
    df[f'{col1}_x_{col2}'] = df[col1].astype(str) + '_' + df[col2].astype(str)
    return df

# Example: city + property_type -> "NYC_condo", "LA_house"
# This captures interactions like "condos are expensive in NYC but cheap in Houston"
```

---

## Automated Feature Engineering with Featuretools

Featuretools automatically creates features from relational data using **Deep Feature Synthesis (DFS)**.

### Primitives

| Type | Primitive | Example |
|------|-----------|---------|
| **Aggregation** | `count`, `sum`, `mean`, `max`, `std` | Mean transaction amount per customer |
| **Transform** | `year`, `month`, `hour`, `absolute` | Extract month from date |
| **Aggregation** | `num_unique`, `mode`, `percent_true` | Number of unique products bought |

```python
import featuretools as ft
import pandas as pd
import numpy as np

# ---- Create sample relational data ----
np.random.seed(42)
n_customers = 200
n_transactions = 2000

customers = pd.DataFrame({
    'customer_id': range(n_customers),
    'signup_date': pd.date_range('2023-01-01', periods=n_customers, freq='D'),
    'age': np.random.randint(18, 70, n_customers),
    'region': np.random.choice(['East', 'West', 'Central'], n_customers),
})

transactions = pd.DataFrame({
    'transaction_id': range(n_transactions),
    'customer_id': np.random.choice(n_customers, n_transactions),
    'amount': np.random.exponential(50, n_transactions).round(2),
    'product_category': np.random.choice(['Electronics', 'Clothing', 'Food', 'Books'],
                                          n_transactions),
    'timestamp': pd.date_range('2023-01-01', periods=n_transactions, freq='2h'),
})

# ---- Create EntitySet ----
es = ft.EntitySet(id='retail')

es.add_dataframe(
    dataframe_name='customers',
    dataframe=customers,
    index='customer_id',
    time_index='signup_date'
)

es.add_dataframe(
    dataframe_name='transactions',
    dataframe=transactions,
    index='transaction_id',
    time_index='timestamp'
)

es.add_relationship('customers', 'customer_id', 'transactions', 'customer_id')

# ---- Deep Feature Synthesis ----
feature_matrix, feature_defs = ft.dfs(
    entityset=es,
    target_dataframe_name='customers',
    max_depth=2,                   # depth of primitive stacking
    agg_primitives=['count', 'mean', 'sum', 'std', 'max', 'min',
                    'num_unique', 'mode'],
    trans_primitives=['year', 'month', 'weekday'],
    verbose=True
)

print(f"\nGenerated {len(feature_defs)} features:")
for fd in feature_defs[:20]:
    print(f"  {fd}")

print(f"\nFeature matrix shape: {feature_matrix.shape}")
print(feature_matrix.head())
```

### Selecting the Best Auto-Generated Features

```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

# Create a target (e.g., high-value customer)
customer_total_spend = transactions.groupby('customer_id')['amount'].sum()
y = (customer_total_spend > customer_total_spend.median()).astype(int)
y = y.reindex(feature_matrix.index).fillna(0).astype(int)

# Handle missing values
X_auto = feature_matrix.select_dtypes(include=[np.number])

pipe = Pipeline([
    ('imputer', SimpleImputer(strategy='median')),
    ('model', RandomForestClassifier(n_estimators=100, random_state=42))
])

scores = cross_val_score(pipe, X_auto, y, cv=5, scoring='accuracy')
print(f"\nAuto-engineered features accuracy: {scores.mean():.4f} +/- {scores.std():.4f}")

# Compare with raw features only
X_raw = customers[['age']].values
scores_raw = cross_val_score(
    RandomForestClassifier(n_estimators=100, random_state=42),
    X_raw, y, cv=5, scoring='accuracy'
)
print(f"Raw features only accuracy: {scores_raw.mean():.4f} +/- {scores_raw.std():.4f}")
```

---

## Feature Importance Comparison

Different methods measure "importance" differently. Always compare multiple methods.

### Method 1: Permutation Importance (Model-Agnostic)

Randomly shuffle one feature and measure how much the score drops. Large drop = important.

$$\text{PI}(f_j) = s - \frac{1}{K}\sum_{k=1}^{K} s_{k,j}$$

where $s$ is the baseline score and $s_{k,j}$ is the score after the $k$-th permutation of feature $j$.

### Method 2: Tree-Based Impurity Importance

Sum of impurity decreases (Gini or entropy) across all splits using feature $j$, weighted by the number of samples reaching each node.

**Warning**: Biased toward high-cardinality features (more split opportunities).

### Method 3: SHAP Values

Based on cooperative game theory. Measures each feature's contribution to each individual prediction.

### Comprehensive Comparison

```python
from sklearn.inspection import permutation_importance
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.datasets import load_breast_cancer
import matplotlib.pyplot as plt
import numpy as np

cancer = load_breast_cancer()
X, y = cancer.data, cancer.target
feature_names = cancer.feature_names

# ---- Train a Random Forest ----
rf = RandomForestClassifier(n_estimators=200, random_state=42)
rf.fit(X, y)

# ---- Method 1: Impurity-based importance ----
imp_impurity = rf.feature_importances_

# ---- Method 2: Permutation importance ----
perm_result = permutation_importance(rf, X, y, n_repeats=30,
                                      random_state=42, n_jobs=-1)
imp_perm = perm_result.importances_mean

# ---- Method 3: Coefficient-based (Logistic Regression) ----
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
lr = LogisticRegression(max_iter=5000, C=1.0, random_state=42)
lr.fit(X_scaled, y)
imp_coef = np.abs(lr.coef_[0])

# ---- Method 4: Mutual Information ----
from sklearn.feature_selection import mutual_info_classif
imp_mi = mutual_info_classif(X, y, random_state=42)

# ---- Normalize all to [0, 1] for comparison ----
def normalize(x):
    return (x - x.min()) / (x.max() - x.min() + 1e-10)

importances = {
    'Impurity (RF)': normalize(imp_impurity),
    'Permutation (RF)': normalize(imp_perm),
    'Coefficient (LR)': normalize(imp_coef),
    'Mutual Info': normalize(imp_mi),
}

# ---- Compare top features across methods ----
fig, axes = plt.subplots(2, 2, figsize=(16, 12))

for ax, (name, imp) in zip(axes.ravel(), importances.items()):
    sorted_idx = np.argsort(imp)[-15:]  # top 15
    ax.barh(range(15), imp[sorted_idx], color=f'C{list(importances.keys()).index(name)}')
    ax.set_yticks(range(15))
    ax.set_yticklabels(feature_names[sorted_idx], fontsize=8)
    ax.set_title(name)
    ax.set_xlabel('Normalized Importance')

plt.suptitle('Feature Importance: Four Methods Compared', fontsize=14)
plt.tight_layout()
plt.savefig('feature_importance_comparison.png', dpi=150, bbox_inches='tight')
plt.show()

# ---- Rank correlation between methods ----
from scipy.stats import spearmanr

methods = list(importances.keys())
print("\nSpearman rank correlation between importance methods:")
print(f"{'':>20}", end='')
for m in methods:
    print(f"{m:>20}", end='')
print()

for m1 in methods:
    print(f"{m1:>20}", end='')
    for m2 in methods:
        corr, _ = spearmanr(importances[m1], importances[m2])
        print(f"{corr:>20.3f}", end='')
    print()
```

---

## Feature Selection Strategies

### Filter Methods (Before Training)

```python
from sklearn.feature_selection import (SelectKBest, f_classif,
                                        mutual_info_classif,
                                        VarianceThreshold)

# Remove constant/near-constant features
vt = VarianceThreshold(threshold=0.01)
X_var = vt.fit_transform(X)
print(f"Variance threshold: {X.shape[1]} -> {X_var.shape[1]} features")

# Select top K by ANOVA F-score
selector = SelectKBest(f_classif, k=10)
X_best = selector.fit_transform(X, y)
selected = feature_names[selector.get_support()]
print(f"\nTop 10 features (F-test): {list(selected)}")

# Select by mutual information
selector_mi = SelectKBest(mutual_info_classif, k=10)
X_mi = selector_mi.fit_transform(X, y)
selected_mi = feature_names[selector_mi.get_support()]
print(f"Top 10 features (MI):     {list(selected_mi)}")
```

### Wrapper Methods (With Training)

```python
from sklearn.feature_selection import RFECV

# Recursive Feature Elimination with CV
rfecv = RFECV(
    estimator=RandomForestClassifier(n_estimators=100, random_state=42),
    step=1,
    cv=5,
    scoring='accuracy',
    min_features_to_select=5,
    n_jobs=-1
)
rfecv.fit(X, y)

print(f"\nOptimal features: {rfecv.n_features_}")
print(f"Selected: {list(feature_names[rfecv.support_])}")
print(f"CV score with selected: {rfecv.cv_results_['mean_test_score'][rfecv.n_features_ - 5]:.4f}")
```

### Embedded Methods (During Training)

```python
from sklearn.linear_model import LassoCV
from sklearn.datasets import load_diabetes

diabetes = load_diabetes()

# L1 regularization (Lasso) naturally zeros out unimportant features
lasso = LassoCV(cv=5, random_state=42)
lasso.fit(diabetes.data, diabetes.target)

feature_importance = np.abs(lasso.coef_)
selected = feature_importance > 0
print(f"\nLasso selected {selected.sum()} of {len(selected)} features")
print(f"Best alpha: {lasso.alpha_:.4f}")
for name, coef in zip(diabetes.feature_names, lasso.coef_):
    status = "SELECTED" if abs(coef) > 0 else "dropped"
    print(f"  {name:>10}: {coef:>8.3f} ({status})")
```

---

## Time-Based Feature Engineering

```python
def create_time_features(df, datetime_col='timestamp'):
    """Extract temporal features from a datetime column."""
    df = df.copy()
    dt = pd.to_datetime(df[datetime_col])

    # Cyclical encoding (preserves continuity: hour 23 is close to hour 0)
    df['hour_sin'] = np.sin(2 * np.pi * dt.dt.hour / 24)
    df['hour_cos'] = np.cos(2 * np.pi * dt.dt.hour / 24)
    df['day_sin'] = np.sin(2 * np.pi * dt.dt.dayofweek / 7)
    df['day_cos'] = np.cos(2 * np.pi * dt.dt.dayofweek / 7)
    df['month_sin'] = np.sin(2 * np.pi * dt.dt.month / 12)
    df['month_cos'] = np.cos(2 * np.pi * dt.dt.month / 12)

    # Binary features
    df['is_weekend'] = dt.dt.dayofweek.isin([5, 6]).astype(int)
    df['is_month_start'] = dt.dt.is_month_start.astype(int)
    df['is_month_end'] = dt.dt.is_month_end.astype(int)

    # Ordinal
    df['day_of_year'] = dt.dt.dayofyear
    df['week_of_year'] = dt.dt.isocalendar().week.astype(int)
    df['quarter'] = dt.dt.quarter

    return df
```

---

## Feature Engineering Checklist

| Step | Technique | When to Use |
|------|-----------|------------|
| 1 | Missing value indicators | When missingness is informative |
| 2 | Log/sqrt transforms | Skewed distributions |
| 3 | Target encoding | High-cardinality categories |
| 4 | Interaction features | Domain knowledge suggests feature pairs matter |
| 5 | Cyclical encoding | Periodic features (hour, day, month) |
| 6 | Aggregation features | Relational/grouped data |
| 7 | Lag features | Time series |
| 8 | Feature selection | After generating many candidates |

---

## Key Takeaways

| Concept | Remember |
|---------|----------|
| Target encoding replaces categories with target means | Must use out-of-fold encoding to prevent leakage |
| Bayesian smoothing regularizes rare categories | $m$ controls pull toward global mean |
| Interaction features capture joint effects | Domain-driven beats exhaustive generation |
| Featuretools automates relational feature creation | DFS generates hundreds of candidates automatically |
| Always compare multiple importance methods | No single method is universally correct |
| Permutation importance is model-agnostic | Works with any model, measures real predictive value |
| Impurity importance is biased toward high cardinality | Use permutation importance instead |
| Feature selection reduces overfitting | Filter → Wrapper → Embedded, in order of speed |
