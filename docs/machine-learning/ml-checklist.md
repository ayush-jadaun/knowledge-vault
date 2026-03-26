---
title: "ML Project Checklist"
description: "A comprehensive 50-item machine learning project checklist covering problem definition, data collection, preprocessing, feature engineering, modeling, evaluation, deployment, and monitoring — everything you need for production ML."
tags: [machine-learning, checklist, best-practices, production, workflow]
difficulty: beginner
prerequisites: []
lastReviewed: "2026-03-25"
---

# ML Project Checklist

This is a comprehensive checklist for machine learning projects — from initial scoping to production monitoring. Use it as a step-by-step guide for new projects and a review tool for existing ones. Every item represents a real mistake that teams have made and learned from.

---

## Phase 1: Problem Definition (Items 1-8)

### 1. Define the business objective clearly

Before writing any code, answer: **What business decision will this model improve?**

| Vague | Clear |
|-------|-------|
| "Predict churn" | "Identify customers likely to cancel in the next 30 days so retention team can call them" |
| "Detect fraud" | "Flag transactions with >80% fraud probability for manual review within 50ms" |
| "Recommend products" | "Increase average order value by 15% through personalized homepage recommendations" |

### 2. Confirm ML is the right solution

Not everything needs ML. Check:

- [ ] Is there a pattern in the data that rules cannot capture?
- [ ] Is there enough data (typically 1,000+ labeled examples minimum)?
- [ ] Does the cost of errors justify the model's complexity?
- [ ] Can a human do this task (if not, ML probably cannot either)?
- [ ] Would a simple heuristic or SQL query solve 80% of the problem?

### 3. Define the target variable precisely

- [ ] What exactly are you predicting?
- [ ] Is the label available at training time?
- [ ] Is there a time delay before the label is known (e.g., churn takes 30 days to confirm)?
- [ ] Are labels noisy or subjective?

### 4. Choose the evaluation metric

| Task | Metric | When |
|------|--------|------|
| Balanced classification | **Accuracy**, F1 | Classes are roughly equal |
| Imbalanced classification | **PR-AUC**, F1, Recall | Rare event detection |
| Regression | **RMSE**, MAE, MAPE | Continuous target |
| Ranking | **NDCG**, MAP | Recommendation, search |
| Binary with threshold | **Precision@K**, Recall@K | Alert systems |

- [ ] Metric is aligned with business objective
- [ ] Metric accounts for class imbalance if present
- [ ] Business stakeholders agree on the metric

### 5. Establish a baseline

- [ ] Random/majority-class baseline computed
- [ ] Simple heuristic baseline (if applicable)
- [ ] Human performance baseline (if applicable)
- [ ] Existing system's performance (if replacing one)

### 6. Define success criteria

- [ ] Minimum acceptable model performance
- [ ] Latency requirements (real-time vs batch?)
- [ ] Fairness constraints (performance across subgroups?)
- [ ] When to retrain / when model is "stale"

### 7. Estimate project scope and timeline

- [ ] Data availability assessed
- [ ] Compute requirements estimated
- [ ] Team skills matched to problem
- [ ] Stakeholder expectations managed

### 8. Consider ethical implications

- [ ] Does the model affect people's lives (loans, hiring, healthcare)?
- [ ] Are protected attributes (race, gender, age) present or proxied?
- [ ] Is there potential for feedback loops (model predictions influence future data)?
- [ ] Has a fairness audit been planned?

---

## Phase 2: Data Collection & Understanding (Items 9-16)

### 9. Inventory available data sources

- [ ] List all potential data sources
- [ ] Assess data quality per source
- [ ] Check data access permissions and privacy constraints
- [ ] Verify data freshness and update frequency

### 10. Collect and load data

- [ ] Data loaded into analysis environment
- [ ] Schema and data types verified
- [ ] Sample inspected visually (first/last rows, random sample)
- [ ] Data dictionary created or obtained

### 11. Exploratory Data Analysis (EDA)

- [ ] Distribution of every feature visualized
- [ ] Target variable distribution examined
- [ ] Missing values mapped (percentage, pattern — MCAR/MAR/MNAR?)
- [ ] Outliers identified
- [ ] Correlations between features examined
- [ ] Feature-target relationships explored

### 12. Assess data quality

| Check | Question |
|-------|----------|
| **Completeness** | What percentage of values are missing per column? |
| **Consistency** | Are the same entities represented the same way? |
| **Accuracy** | Do values make sense (negative ages, future dates)? |
| **Timeliness** | Is the data recent enough? |
| **Uniqueness** | Are there duplicate rows? |

### 13. Check for data leakage

- [ ] No features derived from the target
- [ ] No future information available at prediction time
- [ ] Train/test split done before any preprocessing
- [ ] Grouped data split correctly (same group not in both sets)

### 14. Understand the data generating process

- [ ] How was the data collected?
- [ ] Is there selection bias (only seeing certain customers)?
- [ ] Are there known measurement errors?
- [ ] Has the process changed over time (concept drift)?

### 15. Assess class balance

- [ ] Target distribution documented
- [ ] Strategy for imbalance chosen (if applicable):
  - Oversampling (SMOTE), undersampling, class weights, threshold tuning

### 16. Create train/validation/test splits

- [ ] Time-based split for temporal data
- [ ] Stratified split for classification
- [ ] Group-aware split if samples are grouped
- [ ] Test set locked away — never touched until final evaluation

---

## Phase 3: Data Preprocessing (Items 17-24)

### 17. Handle missing values

| Strategy | When to Use |
|----------|------------|
| Drop rows | < 5% missing, MCAR |
| Impute (median/mode) | Low percentage, not informative |
| Impute (model-based) | Moderate missing, MAR |
| Add indicator column | Missingness is informative |
| Leave as-is | Tree-based models handle natively |

- [ ] Strategy chosen per feature
- [ ] No leakage (fit imputer on train only)

### 18. Encode categorical variables

| Method | When |
|--------|------|
| One-hot | < 15 unique values |
| Ordinal | Natural ordering (low/med/high) |
| Target encoding | High cardinality (> 15 categories) |
| Frequency encoding | When frequency matters |
| Binary | Two categories |

- [ ] Encoding applied consistently to train and test
- [ ] Unknown categories handled

### 19. Scale numerical features

| Method | When |
|--------|------|
| StandardScaler | Normally distributed features, SVM, KNN, neural nets |
| MinMaxScaler | Need bounded range [0,1] |
| RobustScaler | Outliers present |
| No scaling | Tree-based models |

- [ ] Scaler fit on training data only
- [ ] Same scaler applied to test data

### 20. Handle outliers

- [ ] Outliers identified (IQR, Z-score, domain knowledge)
- [ ] Decision made: remove, cap, transform, or keep
- [ ] Impact on model tested

### 21. Transform skewed features

- [ ] Skewed features identified (skewness > 1)
- [ ] Log, sqrt, or Box-Cox transformation applied
- [ ] Before/after distributions compared

### 22. Create preprocessing pipeline

```python
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer

# All preprocessing in a Pipeline — prevents leakage
preprocessor = ColumnTransformer([
    ('num', numeric_pipeline, numeric_features),
    ('cat', categorical_pipeline, categorical_features),
])
```

- [ ] Pipeline prevents data leakage
- [ ] Pipeline is serializable for deployment
- [ ] Pipeline handles unseen categories / missing values

### 23. Validate preprocessing

- [ ] No NaN/Inf after preprocessing
- [ ] Expected number of features
- [ ] Feature ranges are reasonable
- [ ] Train and test distributions are similar after preprocessing

### 24. Document all preprocessing decisions

- [ ] Each transformation has a rationale
- [ ] EDA finding linked to preprocessing choice
- [ ] Decisions are reproducible

---

## Phase 4: Feature Engineering (Items 25-30)

### 25. Create domain-specific features

- [ ] Ratios and differences that make business sense
- [ ] Time-based features (lag, rolling, cyclical encoding)
- [ ] Text features (TF-IDF, embeddings) if text data
- [ ] Geographic features (distance, region) if location data

### 26. Feature interaction and polynomial features

- [ ] Important interactions identified from EDA or domain knowledge
- [ ] Polynomial features considered for linear models
- [ ] Feature crosses for categorical variables

### 27. Feature selection

- [ ] Variance threshold applied (remove near-constant features)
- [ ] Correlation analysis (remove highly correlated features)
- [ ] Feature importance from initial model
- [ ] RFECV or sequential feature selection considered

### 28. Validate features

- [ ] No feature leaks target information
- [ ] All features available at prediction time
- [ ] Feature values are reasonable in test set
- [ ] Feature distributions stable over time

### 29. Feature documentation

- [ ] Each feature has a name, description, and data type
- [ ] Source of each feature documented
- [ ] Feature creation logic version-controlled

### 30. Assess feature-target relationships

- [ ] Mutual information computed
- [ ] Non-linear relationships visualized
- [ ] Feature importance ranked by multiple methods

---

## Phase 5: Modeling (Items 31-38)

### 31. Start with simple models

- [ ] Logistic/Linear Regression baseline
- [ ] Decision Tree baseline
- [ ] Results compared to Phase 1 baselines

### 32. Try multiple algorithm families

- [ ] Linear models (Logistic Regression, Ridge, Lasso)
- [ ] Tree-based (Random Forest, XGBoost, LightGBM)
- [ ] Instance-based (KNN) if dataset is small
- [ ] SVM if high-dimensional
- [ ] Neural network if unstructured data

### 33. Tune hyperparameters

- [ ] Random search or Bayesian optimization (not just grid search)
- [ ] Cross-validation within training set only
- [ ] Search space informed by model documentation
- [ ] Best params documented

### 34. Use proper cross-validation

- [ ] Stratified for classification
- [ ] Time-based for temporal data
- [ ] Group-based if samples are grouped
- [ ] Nested CV if reporting tuned model performance

### 35. Evaluate on multiple metrics

- [ ] Primary metric (aligned with business goal)
- [ ] Secondary metrics (to catch blind spots)
- [ ] Confusion matrix analyzed
- [ ] Per-class performance checked

### 36. Analyze errors

- [ ] What types of examples does the model get wrong?
- [ ] Are errors systematic or random?
- [ ] Do errors correlate with specific feature values?
- [ ] Would more data or better features help?

### 37. Consider ensemble methods

- [ ] Voting ensemble of top models
- [ ] Stacking with meta-learner
- [ ] Seed averaging (same model, different seeds)
- [ ] Improvement justifies added complexity?

### 38. Final evaluation on test set

- [ ] Test set used ONCE — final evaluation only
- [ ] Confidence intervals computed (bootstrap or CV)
- [ ] Performance meets success criteria from Phase 1
- [ ] Results compared to all baselines

---

## Phase 6: Deployment (Items 39-44)

### 39. Serialize the model

- [ ] Model saved in versioned format (joblib, pickle, ONNX)
- [ ] Preprocessing pipeline saved with model
- [ ] Model loading tested in clean environment
- [ ] Model version tagged with git commit

### 40. Create prediction API

- [ ] Input validation implemented
- [ ] Error handling for edge cases
- [ ] Response time meets requirements
- [ ] Batch and real-time endpoints if needed

### 41. Test in staging environment

- [ ] Model produces correct predictions on known inputs
- [ ] Performance matches offline evaluation
- [ ] Edge cases handled (missing values, new categories)
- [ ] Load testing passed

### 42. Shadow mode / A-B testing

- [ ] Model runs alongside existing system before replacing it
- [ ] Predictions logged for comparison
- [ ] Business metrics tracked (not just model metrics)
- [ ] Rollback plan documented

### 43. Document deployment

- [ ] Model card created (model type, training data, metrics, limitations)
- [ ] API documentation written
- [ ] Runbook for common issues
- [ ] On-call responsibilities assigned

### 44. Security and privacy

- [ ] No PII in model features (or properly handled)
- [ ] Model access controlled
- [ ] Predictions logged securely
- [ ] Compliance requirements met (GDPR, HIPAA, etc.)

---

## Phase 7: Monitoring & Maintenance (Items 45-50)

### 45. Monitor prediction distribution

- [ ] Distribution of predictions tracked over time
- [ ] Alerts for sudden shifts in prediction distribution
- [ ] Dashboard for key model metrics

### 46. Monitor input data quality

- [ ] Feature distributions tracked (detect drift)
- [ ] Missing value rates monitored
- [ ] Schema validation on incoming data
- [ ] Alert on out-of-distribution inputs

### 47. Monitor model performance

- [ ] If ground truth is available: track accuracy over time
- [ ] If delayed: track proxy metrics
- [ ] Compare to baseline continuously
- [ ] Alert when performance drops below threshold

### 48. Detect concept drift

- [ ] Statistical tests for distribution shift (KS test, PSI)
- [ ] Window-based performance monitoring
- [ ] Scheduled performance reviews (weekly/monthly)

### 49. Retrain strategy

- [ ] Trigger: scheduled (monthly) or event-based (drift detected)
- [ ] Retrain on latest data
- [ ] Validate new model against current production model
- [ ] Automatic rollback if new model is worse

### 50. Continuous improvement

- [ ] Regular review of model with stakeholders
- [ ] New data sources explored
- [ ] New features and algorithms tested
- [ ] Lessons learned documented for future projects

---

## Quick Reference Card

| Phase | Key Question | Time Allocation |
|-------|-------------|----------------|
| **Problem Definition** | What are we solving and why? | 10% |
| **Data Collection** | Is the data good enough? | 15% |
| **Preprocessing** | Is the data ready for modeling? | 20% |
| **Feature Engineering** | Can we create better signal? | 20% |
| **Modeling** | Which model and settings work best? | 20% |
| **Deployment** | Can we serve predictions reliably? | 10% |
| **Monitoring** | Is the model still working? | 5% (ongoing) |

::: tip The 80/20 Rule of ML
80% of the value comes from proper data handling (Phases 2-4). Spending an extra week on feature engineering almost always beats spending an extra week on model tuning.
:::

---

## Common Failure Modes

| Failure | Phase | Prevention |
|---------|-------|-----------|
| Solving the wrong problem | 1 | Clear business objective, stakeholder alignment |
| Data leakage | 2-3 | Strict temporal splits, pipeline-based preprocessing |
| Overfitting | 5 | Cross-validation, regularization, simpler models |
| Training-serving skew | 6 | Same preprocessing pipeline in train and serve |
| Silent model degradation | 7 | Continuous monitoring, drift detection |
| Optimizing the wrong metric | 1 | Business-aligned metrics from day one |
