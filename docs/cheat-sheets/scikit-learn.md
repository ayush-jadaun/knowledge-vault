---
title: "Scikit-learn Cheat Sheet"
description: "Complete scikit-learn reference — all estimators, preprocessors, metrics, pipelines, model selection utilities, and common patterns for classification, regression, clustering, and dimensionality reduction."
tags: [scikit-learn, machine-learning, cheat-sheet, python, reference]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-25"
---

# Scikit-learn Cheat Sheet

Scikit-learn is the most widely used ML library in Python. This cheat sheet covers every major class, function, and pattern you will need — organized by task.

---

## Installation & Import

```python
pip install scikit-learn

import sklearn
print(sklearn.__version__)

# Core imports you will always need
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, mean_squared_error
from sklearn.pipeline import Pipeline
```

---

## The Estimator API

Every scikit-learn object follows the same interface:

```python
# All estimators
estimator.fit(X, y)              # Train on data
estimator.predict(X)             # Predict labels/values
estimator.score(X, y)            # Evaluate (accuracy or R²)

# Classifiers only
estimator.predict_proba(X)       # Predict class probabilities
estimator.predict_log_proba(X)   # Log probabilities

# Transformers only
transformer.fit(X)               # Learn parameters
transformer.transform(X)         # Apply transformation
transformer.fit_transform(X)     # Fit + transform in one step
transformer.inverse_transform(X) # Reverse transformation

# Common attributes (after fit)
estimator.get_params()           # Get hyperparameters
estimator.set_params(**params)   # Set hyperparameters
```

---

## Data Splitting

```python
from sklearn.model_selection import (
    train_test_split,
    KFold,
    StratifiedKFold,
    TimeSeriesSplit,
    GroupKFold,
    LeaveOneOut,
    RepeatedStratifiedKFold,
    ShuffleSplit,
)

# Basic split
X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,          # 20% test
    random_state=42,        # reproducibility
    stratify=y,             # preserve class distribution
    shuffle=True,           # shuffle before splitting
)

# K-Fold
kf = KFold(n_splits=5, shuffle=True, random_state=42)
for train_idx, test_idx in kf.split(X):
    X_train, X_test = X[train_idx], X[test_idx]

# Stratified K-Fold (classification)
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

# Time Series Split
tscv = TimeSeriesSplit(n_splits=5, gap=0)

# Group K-Fold
gkf = GroupKFold(n_splits=5)
for train_idx, test_idx in gkf.split(X, y, groups=groups):
    pass

# Repeated Stratified K-Fold
rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=42)
```

---

## Preprocessing

### Scaling

```python
from sklearn.preprocessing import (
    StandardScaler,        # zero mean, unit variance
    MinMaxScaler,          # scale to [0, 1]
    MaxAbsScaler,          # scale to [-1, 1] (sparse-friendly)
    RobustScaler,          # median and IQR (robust to outliers)
    Normalizer,            # L2 normalize each sample
    PowerTransformer,      # Gaussian-like via Box-Cox or Yeo-Johnson
    QuantileTransformer,   # uniform or normal output
)

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_train)   # fit on train
X_test_scaled = scaler.transform(X_test)   # transform test (no fit!)

# Comparison
# StandardScaler: x' = (x - mean) / std
# MinMaxScaler:   x' = (x - min) / (max - min)
# RobustScaler:   x' = (x - median) / IQR
```

### Encoding Categorical Variables

```python
from sklearn.preprocessing import (
    LabelEncoder,          # target: string -> int
    OrdinalEncoder,        # features: ordinal categories
    OneHotEncoder,         # features: nominal categories
    TargetEncoder,         # features: high-cardinality categories
    LabelBinarizer,        # binary classification target
)

# One-Hot Encoding
ohe = OneHotEncoder(sparse_output=False, handle_unknown='ignore')
X_encoded = ohe.fit_transform(X_categorical)
print(ohe.categories_)
print(ohe.get_feature_names_out())

# Ordinal Encoding
oe = OrdinalEncoder(categories=[['low', 'medium', 'high']])
X_ordinal = oe.fit_transform(X_ordinal_col)

# Target Encoding (v1.3+)
te = TargetEncoder(smooth='auto', cv=5)
X_target = te.fit_transform(X_cat, y)

# Label Encoding (for target only!)
le = LabelEncoder()
y_encoded = le.fit_transform(y_strings)
y_original = le.inverse_transform(y_encoded)
```

### Imputation

```python
from sklearn.impute import (
    SimpleImputer,         # mean, median, most_frequent, constant
    KNNImputer,            # K-nearest neighbors imputation
    IterativeImputer,      # MICE-style iterative imputation
)

# Simple
imp = SimpleImputer(strategy='median')
X_imputed = imp.fit_transform(X)

# KNN
imp_knn = KNNImputer(n_neighbors=5)
X_imputed = imp_knn.fit_transform(X)

# Iterative (experimental)
from sklearn.experimental import enable_iterative_imputer
imp_iter = IterativeImputer(max_iter=10, random_state=42)
X_imputed = imp_iter.fit_transform(X)
```

### Feature Creation & Transformation

```python
from sklearn.preprocessing import (
    PolynomialFeatures,    # x1, x2 -> x1, x2, x1^2, x1*x2, x2^2
    FunctionTransformer,   # apply custom function
    SplineTransformer,     # B-spline features
    Binarizer,             # threshold to 0/1
    KBinsDiscretizer,      # bin continuous to categorical
)

# Polynomial
poly = PolynomialFeatures(degree=2, include_bias=False, interaction_only=False)
X_poly = poly.fit_transform(X)

# Custom function
from sklearn.preprocessing import FunctionTransformer
log_transformer = FunctionTransformer(np.log1p, inverse_func=np.expm1)
X_log = log_transformer.fit_transform(X)

# Binning
kbd = KBinsDiscretizer(n_bins=5, encode='ordinal', strategy='quantile')
X_binned = kbd.fit_transform(X)
```

---

## Feature Selection

```python
from sklearn.feature_selection import (
    VarianceThreshold,       # remove low-variance features
    SelectKBest,             # top K by score function
    SelectPercentile,        # top percentile by score
    f_classif,               # ANOVA F-score (classification)
    f_regression,            # F-score (regression)
    mutual_info_classif,     # mutual information (classification)
    mutual_info_regression,  # mutual information (regression)
    chi2,                    # chi-squared (non-negative features)
    RFECV,                   # recursive feature elimination with CV
    SequentialFeatureSelector, # forward/backward selection
    SelectFromModel,         # select by model importance
)

# Variance threshold
vt = VarianceThreshold(threshold=0.01)
X_high_var = vt.fit_transform(X)

# Select K best by ANOVA F-score
selector = SelectKBest(f_classif, k=10)
X_best = selector.fit_transform(X, y)
selected_features = selector.get_support(indices=True)

# Mutual information
selector_mi = SelectKBest(mutual_info_classif, k=10)

# Recursive Feature Elimination with CV
from sklearn.ensemble import RandomForestClassifier
rfecv = RFECV(RandomForestClassifier(n_estimators=100), step=1, cv=5,
              scoring='accuracy', min_features_to_select=5)
rfecv.fit(X, y)
print(f"Optimal features: {rfecv.n_features_}")

# Select from model (L1 or tree importance)
from sklearn.linear_model import LassoCV
sfm = SelectFromModel(LassoCV(cv=5), threshold='median')
X_selected = sfm.fit_transform(X, y)
```

---

## Classification Models

```python
# ---- Linear ----
from sklearn.linear_model import (
    LogisticRegression,
    SGDClassifier,
    RidgeClassifier,
    Perceptron,
)

lr = LogisticRegression(C=1.0, penalty='l2', solver='lbfgs',
                         max_iter=1000, random_state=42)

# ---- Tree-Based ----
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier,
    AdaBoostClassifier,
    ExtraTreesClassifier,
    BaggingClassifier,
    VotingClassifier,
    StackingClassifier,
    HistGradientBoostingClassifier,  # fastest for large data
)

rf = RandomForestClassifier(n_estimators=100, max_depth=None,
                             min_samples_split=2, random_state=42, n_jobs=-1)

gb = GradientBoostingClassifier(n_estimators=100, max_depth=3,
                                 learning_rate=0.1, random_state=42)

hgb = HistGradientBoostingClassifier(max_iter=100, max_depth=None,
                                      learning_rate=0.1, random_state=42)

# ---- SVM ----
from sklearn.svm import SVC, LinearSVC

svc = SVC(kernel='rbf', C=1.0, gamma='scale', probability=True,
          random_state=42)

# ---- Neighbors ----
from sklearn.neighbors import KNeighborsClassifier

knn = KNeighborsClassifier(n_neighbors=5, weights='uniform',
                            metric='minkowski', n_jobs=-1)

# ---- Naive Bayes ----
from sklearn.naive_bayes import (
    GaussianNB,       # continuous features
    MultinomialNB,    # count data (text)
    BernoulliNB,      # binary features
    ComplementNB,     # imbalanced text
)

gnb = GaussianNB()
mnb = MultinomialNB(alpha=1.0)  # Laplace smoothing

# ---- Discriminant Analysis ----
from sklearn.discriminant_analysis import (
    LinearDiscriminantAnalysis,
    QuadraticDiscriminantAnalysis,
)

# ---- Ensemble ----
voting = VotingClassifier(
    estimators=[('lr', lr), ('rf', rf), ('gb', gb)],
    voting='soft'  # 'hard' for majority vote
)

stacking = StackingClassifier(
    estimators=[('lr', lr), ('rf', rf), ('gb', gb)],
    final_estimator=LogisticRegression(),
    cv=5
)
```

---

## Regression Models

```python
from sklearn.linear_model import (
    LinearRegression,
    Ridge,                   # L2 regularization
    Lasso,                   # L1 regularization (sparse)
    ElasticNet,              # L1 + L2
    RidgeCV,                 # Ridge with built-in CV
    LassoCV,                 # Lasso with built-in CV
    ElasticNetCV,
    SGDRegressor,
    HuberRegressor,          # robust to outliers
    BayesianRidge,
)
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import (
    RandomForestRegressor,
    GradientBoostingRegressor,
    AdaBoostRegressor,
    ExtraTreesRegressor,
    BaggingRegressor,
    VotingRegressor,
    StackingRegressor,
    HistGradientBoostingRegressor,
)
from sklearn.svm import SVR, LinearSVR
from sklearn.neighbors import KNeighborsRegressor

# Common patterns
ridge = Ridge(alpha=1.0)
lasso = Lasso(alpha=0.1)
enet = ElasticNet(alpha=0.1, l1_ratio=0.5)

# Auto-tuned
ridge_cv = RidgeCV(alphas=[0.01, 0.1, 1.0, 10.0], cv=5)
lasso_cv = LassoCV(cv=5, random_state=42)
```

---

## Clustering

```python
from sklearn.cluster import (
    KMeans,
    MiniBatchKMeans,
    DBSCAN,
    AgglomerativeClustering,
    SpectralClustering,
    Birch,
    MeanShift,
    OPTICS,
    AffinityPropagation,
)
from sklearn.mixture import GaussianMixture

kmeans = KMeans(n_clusters=3, n_init=10, random_state=42)
labels = kmeans.fit_predict(X)

dbscan = DBSCAN(eps=0.5, min_samples=5)
labels = dbscan.fit_predict(X)

gmm = GaussianMixture(n_components=3, random_state=42)
labels = gmm.fit_predict(X)
probs = gmm.predict_proba(X)  # soft assignment
```

---

## Dimensionality Reduction

```python
from sklearn.decomposition import (
    PCA,
    KernelPCA,
    TruncatedSVD,          # for sparse data
    NMF,                   # non-negative matrix factorization
    FastICA,               # independent component analysis
    FactorAnalysis,
    LatentDirichletAllocation,  # topic modeling
)
from sklearn.manifold import (
    TSNE,
    Isomap,
    LocallyLinearEmbedding,
    MDS,
    SpectralEmbedding,
)
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis

pca = PCA(n_components=2, random_state=42)
X_2d = pca.fit_transform(X)
print(f"Explained variance: {pca.explained_variance_ratio_}")

tsne = TSNE(n_components=2, perplexity=30, random_state=42)
X_tsne = tsne.fit_transform(X)  # no transform for new data!

svd = TruncatedSVD(n_components=50)  # for sparse matrices
X_dense = svd.fit_transform(X_sparse)
```

---

## Metrics

### Classification Metrics

```python
from sklearn.metrics import (
    # Basic
    accuracy_score,
    balanced_accuracy_score,

    # Precision / Recall / F1
    precision_score,
    recall_score,
    f1_score,
    precision_recall_fscore_support,
    classification_report,

    # Probability-based
    roc_auc_score,
    average_precision_score,
    log_loss,
    brier_score_loss,

    # Curves
    roc_curve,
    precision_recall_curve,

    # Matrix
    confusion_matrix,
    ConfusionMatrixDisplay,

    # Multi-class
    cohen_kappa_score,
    matthews_corrcoef,
    top_k_accuracy_score,
)

# Usage
print(classification_report(y_test, y_pred))
print(f"AUC: {roc_auc_score(y_test, y_proba[:, 1]):.4f}")

# Confusion matrix plot
ConfusionMatrixDisplay.from_predictions(y_test, y_pred)
plt.show()

# Multi-class
f1_score(y_test, y_pred, average='macro')    # unweighted mean
f1_score(y_test, y_pred, average='weighted') # weighted by support
f1_score(y_test, y_pred, average='micro')    # global TP/FP/FN
```

### Regression Metrics

```python
from sklearn.metrics import (
    mean_squared_error,
    mean_absolute_error,
    root_mean_squared_error,
    r2_score,
    mean_absolute_percentage_error,
    median_absolute_error,
    explained_variance_score,
    max_error,
)

rmse = root_mean_squared_error(y_test, y_pred)
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)
mape = mean_absolute_percentage_error(y_test, y_pred)
```

### Clustering Metrics

```python
from sklearn.metrics import (
    # With ground truth
    adjusted_rand_score,
    normalized_mutual_info_score,
    homogeneity_score,
    completeness_score,
    v_measure_score,
    fowlkes_mallows_score,

    # Without ground truth
    silhouette_score,
    calinski_harabasz_score,
    davies_bouldin_score,
)

sil = silhouette_score(X, labels)       # higher is better [-1, 1]
ch = calinski_harabasz_score(X, labels)  # higher is better
db = davies_bouldin_score(X, labels)     # lower is better
```

---

## Pipelines

```python
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.compose import ColumnTransformer, make_column_transformer

# Simple pipeline
pipe = Pipeline([
    ('scaler', StandardScaler()),
    ('model', LogisticRegression()),
])
pipe.fit(X_train, y_train)
pipe.score(X_test, y_test)

# Shorthand
pipe = make_pipeline(StandardScaler(), LogisticRegression())

# Column transformer (different preprocessing per column type)
numeric_features = ['age', 'income']
categorical_features = ['city', 'gender']

preprocessor = ColumnTransformer([
    ('num', Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler()),
    ]), numeric_features),
    ('cat', Pipeline([
        ('imputer', SimpleImputer(strategy='most_frequent')),
        ('encoder', OneHotEncoder(handle_unknown='ignore')),
    ]), categorical_features),
])

full_pipeline = Pipeline([
    ('preprocess', preprocessor),
    ('model', RandomForestClassifier(n_estimators=100)),
])

full_pipeline.fit(X_train, y_train)
```

---

## Model Selection & Hyperparameter Tuning

```python
from sklearn.model_selection import (
    cross_val_score,
    cross_validate,
    GridSearchCV,
    RandomizedSearchCV,
    learning_curve,
    validation_curve,
)

# Cross-validation
scores = cross_val_score(model, X, y, cv=5, scoring='accuracy')
print(f"{scores.mean():.4f} +/- {scores.std():.4f}")

# Multi-metric cross-validation
results = cross_validate(model, X, y, cv=5,
                          scoring=['accuracy', 'f1', 'roc_auc'],
                          return_train_score=True)

# Grid Search
param_grid = {'C': [0.1, 1, 10], 'kernel': ['rbf', 'linear']}
grid = GridSearchCV(SVC(), param_grid, cv=5, scoring='accuracy',
                     n_jobs=-1, refit=True)
grid.fit(X, y)
print(grid.best_params_, grid.best_score_)
best_model = grid.best_estimator_

# Random Search
from scipy.stats import loguniform, randint
param_dist = {'C': loguniform(1e-3, 1e3), 'gamma': loguniform(1e-4, 1e1)}
random = RandomizedSearchCV(SVC(), param_dist, n_iter=50, cv=5,
                             random_state=42, n_jobs=-1)
random.fit(X, y)

# Learning Curve
train_sizes, train_scores, test_scores = learning_curve(
    model, X, y, cv=5, train_sizes=np.linspace(0.1, 1.0, 10),
    scoring='accuracy'
)
```

---

## Model Inspection

```python
from sklearn.inspection import (
    permutation_importance,
    PartialDependenceDisplay,
    DecisionBoundaryDisplay,
)

# Permutation importance (model-agnostic)
perm = permutation_importance(model, X_test, y_test,
                               n_repeats=30, random_state=42)
sorted_idx = perm.importances_mean.argsort()[::-1]
for i in sorted_idx[:10]:
    print(f"{feature_names[i]:>20}: {perm.importances_mean[i]:.4f}")

# Partial Dependence Plot
PartialDependenceDisplay.from_estimator(model, X_test, [0, 1, (0, 1)],
                                         feature_names=feature_names)

# Decision Boundary (2D only)
DecisionBoundaryDisplay.from_estimator(model, X_2d, alpha=0.5)
```

---

## Saving & Loading Models

```python
import joblib
import pickle

# joblib (preferred for large numpy arrays)
joblib.dump(pipeline, 'model.joblib')
loaded_pipeline = joblib.load('model.joblib')

# pickle
with open('model.pkl', 'wb') as f:
    pickle.dump(pipeline, f)
with open('model.pkl', 'rb') as f:
    loaded = pickle.load(f)

# ONNX (for cross-platform deployment)
# pip install skl2onnx
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

initial_type = [('input', FloatTensorType([None, X.shape[1]]))]
onnx_model = convert_sklearn(pipeline, initial_types=initial_type)
with open('model.onnx', 'wb') as f:
    f.write(onnx_model.SerializeToString())
```

---

## Common Patterns

### Pattern 1: Full Pipeline with CV

```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.model_selection import cross_val_score

pipe = Pipeline([
    ('preprocess', preprocessor),
    ('model', GradientBoostingClassifier())
])

scores = cross_val_score(pipe, X, y, cv=5, scoring='accuracy')
```

### Pattern 2: Nested CV for Unbiased Evaluation

```python
from sklearn.model_selection import GridSearchCV, StratifiedKFold

inner_cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
outer_cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

grid = GridSearchCV(SVC(), {'C': [0.1, 1, 10]}, cv=inner_cv)
scores = cross_val_score(grid, X, y, cv=outer_cv, scoring='accuracy')
```

### Pattern 3: Custom Scorer

```python
from sklearn.metrics import make_scorer, fbeta_score

# F2 score (recall-weighted)
f2_scorer = make_scorer(fbeta_score, beta=2)
scores = cross_val_score(model, X, y, cv=5, scoring=f2_scorer)

# Custom function
def custom_metric(y_true, y_pred):
    return np.mean(y_true == y_pred)  # your logic

custom_scorer = make_scorer(custom_metric, greater_is_better=True)
```

### Pattern 4: Calibration

```python
from sklearn.calibration import CalibratedClassifierCV

# Calibrate probabilities (Platt scaling or isotonic)
calibrated = CalibratedClassifierCV(base_estimator=svc, cv=5,
                                     method='sigmoid')
calibrated.fit(X_train, y_train)
proba = calibrated.predict_proba(X_test)
```

---

## Version Compatibility

| Feature | Min Version |
|---------|------------|
| `HistGradientBoosting*` | 1.0 |
| `TargetEncoder` | 1.3 |
| `set_output(transform='pandas')` | 1.2 |
| `root_mean_squared_error` | 1.4 |
| `ColumnTransformer` | 0.20 |
| `StackingClassifier` | 0.22 |

```python
# Enable pandas output from transformers
from sklearn import set_config
set_config(transform_output='pandas')
```

---

## Quick Reference Summary

| Task | Go-To Class | Key Parameters |
|------|------------|---------------|
| Scale features | `StandardScaler` | — |
| Encode categories | `OneHotEncoder` | `handle_unknown='ignore'` |
| Impute missing | `SimpleImputer` | `strategy='median'` |
| Feature reduction | `PCA` | `n_components` |
| Split data | `train_test_split` | `test_size, stratify, random_state` |
| Cross-validate | `cross_val_score` | `cv, scoring` |
| Tune params | `GridSearchCV` or `RandomizedSearchCV` | `param_grid, cv, scoring` |
| Classify (fast) | `LogisticRegression` | `C, penalty` |
| Classify (best) | `HistGradientBoostingClassifier` | `max_iter, learning_rate` |
| Regress (fast) | `Ridge` | `alpha` |
| Regress (best) | `HistGradientBoostingRegressor` | `max_iter, learning_rate` |
| Cluster | `KMeans` | `n_clusters, n_init` |
| Pipeline | `Pipeline` + `ColumnTransformer` | estimators list |
| Save model | `joblib.dump` | filename |
