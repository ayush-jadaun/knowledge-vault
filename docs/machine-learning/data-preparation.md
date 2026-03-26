---
title: "Data Preparation for ML"
description: "Complete guide to preparing data for machine learning — train/test/validation splits, k-fold and stratified cross-validation, data leakage prevention, feature scaling, categorical encoding, handling imbalanced data with SMOTE and class weights."
tags: [machine-learning, data-preparation, cross-validation, scaling, imbalanced-data]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Data Preparation for ML

The quality of your model is bounded by the quality of your data preparation. A flawed split strategy, an undetected data leak, or a missing scaling step can make a model look brilliant in development and fail catastrophically in production.

This page covers every data preparation decision you will face.

---

## Train / Test / Validation Splits

### Why Split?

You need to estimate how well your model will perform on **data it has never seen**. If you evaluate on training data, you measure memorization, not generalization.

### The Three Sets

| Set | Purpose | Typical Size | When Used |
|-----|---------|-------------|-----------|
| **Training** | Fit model parameters | 60-80% | During `model.fit()` |
| **Validation** | Tune hyperparameters, select model | 10-20% | During development |
| **Test** | Final unbiased evaluation | 10-20% | Once, at the very end |

```python
# splits.py — Proper train/val/test splitting
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.datasets import load_breast_cancer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

data = load_breast_cancer()
X, y = data.data, data.target

# Method 1: Two-way split (simpler)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"Train: {X_train.shape[0]}, Test: {X_test.shape[0]}")

# Method 2: Three-way split (better for tuning)
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.25, random_state=42, stratify=y_temp
)
# 0.25 * 0.8 = 0.2, so we get 60/20/20

print(f"Train: {X_train.shape[0]}, Val: {X_val.shape[0]}, Test: {X_test.shape[0]}")
print(f"Train ratio: {X_train.shape[0] / len(X):.0%}")
print(f"Val ratio: {X_val.shape[0] / len(X):.0%}")
print(f"Test ratio: {X_test.shape[0] / len(X):.0%}")

# Verify stratification preserves class distribution
print(f"\nFull dataset class dist: {np.bincount(y) / len(y)}")
print(f"Train class dist:       {np.bincount(y_train) / len(y_train)}")
print(f"Test class dist:        {np.bincount(y_test) / len(y_test)}")
```

### Stratified Splitting

For classification, always use `stratify=y` to preserve class proportions. Without it, small datasets can end up with unrepresentative splits.

---

## Cross-Validation

### Why Cross-Validation?

A single train/test split is noisy — your performance estimate depends heavily on which data points ended up in which set. Cross-validation averages over multiple splits for a more reliable estimate.

### K-Fold Cross-Validation

```python
# kfold.py — K-Fold cross-validation
import numpy as np
from sklearn.model_selection import (
    KFold, StratifiedKFold, cross_val_score, cross_validate
)
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import load_breast_cancer

data = load_breast_cancer()
X, y = data.data, data.target
model = RandomForestClassifier(n_estimators=100, random_state=42)

# Basic K-Fold
kf = KFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(model, X, y, cv=kf, scoring='accuracy')
print(f"5-Fold Accuracy: {scores.mean():.4f} +/- {scores.std():.4f}")
print(f"Individual folds: {scores.round(4)}")

# Stratified K-Fold — preserves class proportions in each fold
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(model, X, y, cv=skf, scoring='accuracy')
print(f"\nStratified 5-Fold Accuracy: {scores.mean():.4f} +/- {scores.std():.4f}")

# Multiple metrics at once
scoring = ['accuracy', 'f1', 'roc_auc']
results = cross_validate(model, X, y, cv=skf, scoring=scoring)
for metric in scoring:
    values = results[f'test_{metric}']
    print(f"{metric}: {values.mean():.4f} +/- {values.std():.4f}")
```

### How K-Fold Works

For $K = 5$:

```
Fold 1: [TEST] [TRAIN] [TRAIN] [TRAIN] [TRAIN]
Fold 2: [TRAIN] [TEST] [TRAIN] [TRAIN] [TRAIN]
Fold 3: [TRAIN] [TRAIN] [TEST] [TRAIN] [TRAIN]
Fold 4: [TRAIN] [TRAIN] [TRAIN] [TEST] [TRAIN]
Fold 5: [TRAIN] [TRAIN] [TRAIN] [TRAIN] [TEST]
```

Each data point appears in exactly one test fold. Final score = average of all fold scores.

### Other Cross-Validation Strategies

```python
# cv_strategies.py — Different CV strategies
from sklearn.model_selection import (
    LeaveOneOut, RepeatedStratifiedKFold, GroupKFold,
    TimeSeriesSplit, cross_val_score
)
from sklearn.linear_model import LogisticRegression
from sklearn.datasets import load_breast_cancer
import numpy as np

data = load_breast_cancer()
X, y = data.data, data.target
model = LogisticRegression(max_iter=5000)

# Repeated Stratified K-Fold — most robust for small datasets
rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=42)
scores = cross_val_score(model, X, y, cv=rskf, scoring='accuracy')
print(f"Repeated 5x10 Accuracy: {scores.mean():.4f} +/- {scores.std():.4f}")

# Leave-One-Out — extreme: K = n, every sample is a test set once
# Only practical for very small datasets
# loo = LeaveOneOut()
# scores = cross_val_score(model, X[:50], y[:50], cv=loo, scoring='accuracy')
# print(f"LOO Accuracy: {scores.mean():.4f}")

# Time Series Split — for temporal data
tscv = TimeSeriesSplit(n_splits=5)
print("\nTime Series Split indices:")
for i, (train_idx, test_idx) in enumerate(tscv.split(X)):
    print(f"  Fold {i+1}: Train={len(train_idx)}, Test={len(test_idx)}")

# Group K-Fold — when samples belong to groups (e.g., patients)
groups = np.random.randint(0, 20, len(X))  # 20 groups
gkf = GroupKFold(n_splits=5)
scores = cross_val_score(model, X, y, cv=gkf, groups=groups, scoring='accuracy')
print(f"\nGroup K-Fold Accuracy: {scores.mean():.4f} +/- {scores.std():.4f}")
```

### CV Strategy Selection

| Strategy | When to Use | K |
|----------|------------|---|
| **Stratified K-Fold** | Classification (default) | 5 or 10 |
| **K-Fold** | Regression | 5 or 10 |
| **Repeated K-Fold** | Small datasets, want stable estimates | 5x10 |
| **Leave-One-Out** | Very small datasets (<100) | n |
| **Group K-Fold** | Data has groups (patients, users) | 5 |
| **Time Series Split** | Temporal data | 5 |

---

## Data Leakage

Data leakage is the single most dangerous pitfall in ML. It occurs when information from the test set influences training, leading to overly optimistic results.

### Types of Leakage

#### 1. Target Leakage

A feature that is a proxy for the target or is created using the target:

```python
# target_leakage.py — Dangerous leakage examples
import pandas as pd
import numpy as np

# LEAKAGE: Using a feature that encodes the target
# Example: "treatment_response" when predicting "disease_outcome"
# If the patient was treated, they had the disease

# LEAKAGE: Using future data
# Example: Using "total_purchases_2024" to predict "will_churn_in_march_2024"
# Some of those purchases happen AFTER the churn event

# How to detect:
# 1. Any feature with suspiciously high correlation with target (r > 0.95)
# 2. Any feature that would not be available at prediction time
# 3. Any feature derived from the target variable
```

#### 2. Preprocessing Leakage

Fitting preprocessing on the full dataset before splitting:

```python
# preprocessing_leakage.py — The most common leakage
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.datasets import load_breast_cancer

data = load_breast_cancer()
X, y = data.data, data.target

# WRONG — leaks test statistics into training
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)  # fit on ALL data including test
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42
)

# CORRECT — fit only on training data
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)  # fit on train only
X_test_scaled = scaler.transform(X_test)         # transform test with train stats

# BEST — use Pipeline (cannot leak)
from sklearn.pipeline import make_pipeline
pipeline = make_pipeline(StandardScaler(), LogisticRegression(max_iter=5000))
pipeline.fit(X_train, y_train)
score = pipeline.score(X_test, y_test)
print(f"Pipeline score: {score:.4f}")
```

#### 3. Leakage Checklist

| Check | Action |
|-------|--------|
| Is any feature suspiciously predictive (AUC > 0.99)? | Investigate, likely leakage |
| Would all features be available at prediction time? | Remove future data |
| Was any preprocessing fit on test data? | Use Pipeline |
| Does feature engineering use target info? | Use target encoding with CV |
| Are there duplicate rows across train/test? | Deduplicate before splitting |

---

## Feature Scaling

### When Is Scaling Required?

| Algorithm | Needs Scaling? | Why |
|-----------|---------------|-----|
| Linear Regression | Yes | Coefficients depend on scale |
| Logistic Regression | Yes | Gradient descent converges faster |
| SVM | Yes | Distance-based, scale-sensitive |
| KNN | Yes | Distance-based, scale-sensitive |
| Neural Networks | Yes | Gradient-based optimization |
| Decision Trees | **No** | Splits are rank-based |
| Random Forest | **No** | Tree-based |
| XGBoost / LightGBM | **No** | Tree-based |
| Naive Bayes | **No** | Probability-based |

### Scaling Methods

```python
# scaling.py — All major scaling methods compared
import numpy as np
from sklearn.preprocessing import (
    StandardScaler, MinMaxScaler, RobustScaler,
    MaxAbsScaler, PowerTransformer, QuantileTransformer
)

# Sample data with different scales and outliers
np.random.seed(42)
X = np.column_stack([
    np.random.normal(100, 20, 200),        # mean=100, std=20
    np.random.exponential(5, 200),          # skewed
    np.concatenate([np.random.normal(50, 5, 195), [500, 600, 700, 800, 900]]),  # outliers
])

scalers = {
    'StandardScaler': StandardScaler(),
    'MinMaxScaler': MinMaxScaler(),
    'RobustScaler': RobustScaler(),
    'MaxAbsScaler': MaxAbsScaler(),
    'PowerTransformer': PowerTransformer(method='yeo-johnson'),
    'QuantileTransformer': QuantileTransformer(output_distribution='normal'),
}

print(f"{'Scaler':<25} {'Mean':>10} {'Std':>10} {'Min':>10} {'Max':>10}")
print("-" * 67)

for name, scaler in scalers.items():
    X_scaled = scaler.fit_transform(X)
    col = X_scaled[:, 0]  # show stats for first column
    print(f"{name:<25} {col.mean():>10.3f} {col.std():>10.3f} "
          f"{col.min():>10.3f} {col.max():>10.3f}")
```

### Which Scaler to Use

| Scaler | Formula | Best When |
|--------|---------|-----------|
| `StandardScaler` | $z = \frac{x - \mu}{\sigma}$ | Normal-ish distributions, no extreme outliers |
| `MinMaxScaler` | $z = \frac{x - x_{min}}{x_{max} - x_{min}}$ | Bounded features, neural networks |
| `RobustScaler` | $z = \frac{x - \text{median}}{\text{IQR}}$ | Outliers present |
| `PowerTransformer` | Yeo-Johnson | Skewed distributions |
| `QuantileTransformer` | Maps to uniform/normal quantiles | Any distribution |

---

## Categorical Encoding

### Encoding Methods

```python
# encoding.py — Categorical encoding strategies
import pandas as pd
import numpy as np
from sklearn.preprocessing import (
    OneHotEncoder, OrdinalEncoder, LabelEncoder
)

df = pd.DataFrame({
    'color': ['red', 'blue', 'green', 'red', 'blue', 'green', 'red', 'blue'],
    'size': ['S', 'M', 'L', 'XL', 'S', 'M', 'L', 'XL'],
    'city': ['NYC', 'LA', 'NYC', 'CHI', 'LA', 'NYC', 'CHI', 'LA'],
})

# 1. One-Hot Encoding — for nominal (no order) categoricals
ohe = OneHotEncoder(sparse_output=False)
X_ohe = ohe.fit_transform(df[['color']])
print("One-Hot Encoding:")
print(pd.DataFrame(X_ohe, columns=ohe.get_feature_names_out()))

# 2. Ordinal Encoding — for ordinal (ordered) categoricals
oe = OrdinalEncoder(categories=[['S', 'M', 'L', 'XL']])
X_oe = oe.fit_transform(df[['size']])
print(f"\nOrdinal Encoding (size): {X_oe.ravel()}")

# 3. Label Encoding — for target variable only
le = LabelEncoder()
y_encoded = le.fit_transform(['cat', 'dog', 'bird', 'cat', 'bird'])
print(f"\nLabel Encoding: {y_encoded}")
print(f"Classes: {le.classes_}")

# 4. Target Encoding — mean of target per category
# Must be done with cross-validation to prevent leakage
from sklearn.model_selection import KFold

def target_encode_cv(df, col, target, n_splits=5):
    """Target encoding with K-Fold to prevent leakage."""
    encoded = pd.Series(index=df.index, dtype=float)
    kf = KFold(n_splits=n_splits, shuffle=True, random_state=42)

    for train_idx, val_idx in kf.split(df):
        means = df.iloc[train_idx].groupby(col)[target].mean()
        encoded.iloc[val_idx] = df.iloc[val_idx][col].map(means)

    # Fill missing with global mean
    encoded = encoded.fillna(df[target].mean())
    return encoded

# 5. Frequency Encoding — replace with count/frequency
freq = df['city'].value_counts(normalize=True)
df['city_freq'] = df['city'].map(freq)
print(f"\nFrequency Encoding:\n{df[['city', 'city_freq']]}")
```

### Encoding Decision Guide

| Encoding | Use When | Max Cardinality | Tree-Based OK? |
|----------|----------|----------------|---------------|
| One-Hot | Nominal, low cardinality | ~10-20 | Yes, but adds dimensions |
| Ordinal | Ordered categories | Any | Yes |
| Target | High cardinality | Any | Yes, best for trees |
| Frequency | High cardinality, quick | Any | Yes |
| Binary | Exactly 2 categories | 2 | Yes |
| Embeddings | Very high cardinality | 1000+ | No, neural nets only |

---

## Handling Imbalanced Data

### The Problem

When one class dominates (e.g., 95% negative, 5% positive), models learn to predict the majority class and achieve high accuracy while being useless.

### Strategy 1: Class Weights

```python
# class_weights.py — Adjusting class weights
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report

# Create imbalanced dataset
X, y = make_classification(
    n_samples=10000, n_features=20,
    weights=[0.95, 0.05],  # 95% negative, 5% positive
    random_state=42
)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"Class distribution: {np.bincount(y_train)}")

# Without class weights — biased toward majority
model_no_weight = LogisticRegression(max_iter=1000)
model_no_weight.fit(X_train, y_train)
y_pred = model_no_weight.predict(X_test)
print("\n--- Without class weights ---")
print(classification_report(y_test, y_pred))

# With class weights — balanced
model_weighted = LogisticRegression(class_weight='balanced', max_iter=1000)
model_weighted.fit(X_train, y_train)
y_pred = model_weighted.predict(X_test)
print("--- With balanced class weights ---")
print(classification_report(y_test, y_pred))
```

### Strategy 2: SMOTE (Oversampling)

```python
# smote.py — Synthetic Minority Over-sampling
from imblearn.over_sampling import SMOTE, ADASYN
from imblearn.under_sampling import RandomUnderSampler
from imblearn.pipeline import Pipeline as ImbPipeline
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score
import numpy as np

X, y = make_classification(
    n_samples=10000, n_features=20,
    weights=[0.95, 0.05], random_state=42
)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"Before SMOTE: {np.bincount(y_train)}")

# Apply SMOTE — only on training data
smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X_train, y_train)
print(f"After SMOTE:  {np.bincount(y_resampled)}")

# Train on resampled data
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_resampled, y_resampled)
y_pred = model.predict(X_test)
print(f"F1 Score with SMOTE: {f1_score(y_test, y_pred):.4f}")

# Combined pipeline: SMOTE + under-sampling (recommended)
pipeline = ImbPipeline([
    ('smote', SMOTE(sampling_strategy=0.5, random_state=42)),
    ('undersampler', RandomUnderSampler(sampling_strategy=0.8, random_state=42)),
    ('model', RandomForestClassifier(n_estimators=100, random_state=42)),
])

pipeline.fit(X_train, y_train)
y_pred = pipeline.predict(X_test)
print(f"F1 Score with SMOTE+Under: {f1_score(y_test, y_pred):.4f}")
```

### Strategy 3: Threshold Tuning

```python
# threshold.py — Tune decision threshold
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import precision_recall_curve, f1_score
import numpy as np

X, y = make_classification(
    n_samples=10000, n_features=20,
    weights=[0.95, 0.05], random_state=42
)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Get probabilities instead of hard predictions
y_proba = model.predict_proba(X_test)[:, 1]

# Default threshold = 0.5
y_pred_default = (y_proba >= 0.5).astype(int)
print(f"Default (0.5) F1: {f1_score(y_test, y_pred_default):.4f}")

# Find optimal threshold
precisions, recalls, thresholds = precision_recall_curve(y_test, y_proba)
f1_scores = 2 * (precisions * recalls) / (precisions + recalls + 1e-8)
best_idx = np.argmax(f1_scores)
best_threshold = thresholds[best_idx]

y_pred_tuned = (y_proba >= best_threshold).astype(int)
print(f"Optimal ({best_threshold:.3f}) F1: {f1_score(y_test, y_pred_tuned):.4f}")
```

### Imbalanced Data Strategy Selection

| Strategy | When | Pros | Cons |
|----------|------|------|------|
| **Class weights** | Always try first | Simple, no extra data | May not be enough |
| **SMOTE** | Small minority class | Creates diverse samples | Can create noise |
| **Under-sampling** | Very large dataset | Reduces training time | Loses information |
| **Threshold tuning** | Need probability output | No retraining needed | Requires calibration |
| **Ensemble** | Production systems | Robust | Complex |

---

## Complete Data Preparation Pipeline

```python
# complete_pipeline.py — Production-ready data preparation
import numpy as np
import pandas as pd
from sklearn.datasets import fetch_california_housing
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder, FunctionTransformer
from sklearn.impute import SimpleImputer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_squared_error, r2_score

# Load and prepare data
housing = fetch_california_housing(as_frame=True)
df = housing.frame

# Feature engineering
df['rooms_per_house'] = df['AveRooms'] / df['AveOccup'].clip(0.1)
df['bedrooms_ratio'] = df['AveBedrms'] / df['AveRooms'].clip(0.1)
df['income_bin'] = pd.cut(df['MedInc'], bins=5, labels=False)

X = df.drop('MedHouseVal', axis=1)
y = df['MedHouseVal']

# Split FIRST — before any preprocessing
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Define column groups
numeric_features = ['MedInc', 'HouseAge', 'AveRooms', 'AveBedrms',
                    'Population', 'AveOccup', 'Latitude', 'Longitude',
                    'rooms_per_house', 'bedrooms_ratio']
categorical_features = ['income_bin']

# Build pipeline
preprocessor = ColumnTransformer([
    ('num', Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler()),
    ]), numeric_features),
    ('cat', Pipeline([
        ('imputer', SimpleImputer(strategy='most_frequent')),
        ('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=False)),
    ]), categorical_features),
])

full_pipeline = Pipeline([
    ('preprocess', preprocessor),
    ('model', GradientBoostingRegressor(n_estimators=200, random_state=42)),
])

# Cross-validate
cv_scores = cross_val_score(
    full_pipeline, X_train, y_train, cv=5,
    scoring='neg_root_mean_squared_error'
)
print(f"CV RMSE: {-cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")

# Final evaluation
full_pipeline.fit(X_train, y_train)
y_pred = full_pipeline.predict(X_test)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
r2 = r2_score(y_test, y_pred)
print(f"Test RMSE: {rmse:.4f}")
print(f"Test R²:   {r2:.4f}")
```

---

## Further Reading

- **[ML Workflow](/machine-learning/ml-workflow)** — Where data prep fits in the lifecycle
- **[Linear Regression](/machine-learning/linear-regression)** — Scaling matters for gradient descent
- **[Evaluation Metrics](/machine-learning/evaluation-metrics)** — Choosing the right metric for imbalanced data
- **[KNN](/machine-learning/knn)** — Distance-based models need careful scaling
