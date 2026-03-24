---
title: "EDA Workflow — The 10-Step Process"
description: "A systematic 10-step EDA workflow from data acquisition to communication — acquire, profile, clean, univariate, bivariate, multivariate, feature engineering, validate, communicate, iterate. With decision points and when to loop back."
tags: [eda, workflow, process, data-analysis, methodology]
difficulty: beginner
prerequisites: [eda/index, eda/asking-right-questions]
lastReviewed: "2026-03-24"
---

# EDA Workflow — The 10-Step Process

EDA without a workflow is just browsing data. You will miss things, repeat work, and lose track of what you have already checked. This page presents a 10-step workflow that scales from a 30-minute exploration to a multi-week deep dive. The steps are sequential but the process is iterative — every step can send you back to a previous one.

---

## The 10 Steps at a Glance

```mermaid
flowchart TD
    S1["1. Acquire"] --> S2["2. Profile"]
    S2 --> S3["3. Clean"]
    S3 --> S4["4. Univariate"]
    S4 --> S5["5. Bivariate"]
    S5 --> S6["6. Multivariate"]
    S6 --> S7["7. Feature<br/>Engineering"]
    S7 --> S8["8. Validate"]
    S8 --> S9["9. Communicate"]
    S9 --> S10["10. Iterate"]

    S10 -->|"New questions"| S4
    S10 -->|"Data quality issue"| S3
    S10 -->|"Need more data"| S1

    S3 -->|"Unexpected types"| S2
    S5 -->|"Outlier discovered"| S3
    S8 -->|"Validation fails"| S3

    style S1 fill:#2563eb,color:#fff
    style S2 fill:#2563eb,color:#fff
    style S3 fill:#dc2626,color:#fff
    style S4 fill:#7c3aed,color:#fff
    style S5 fill:#7c3aed,color:#fff
    style S6 fill:#7c3aed,color:#fff
    style S7 fill:#059669,color:#fff
    style S8 fill:#059669,color:#fff
    style S9 fill:#f97316,color:#fff
    style S10 fill:#f97316,color:#fff
```

---

## Step 1: Acquire

Get the data into your environment. This sounds trivial but is where many projects already go wrong.

```python
# step1_acquire.py — Multiple acquisition patterns
import pandas as pd
import numpy as np

# Pattern 1: CSV (most common, most problematic)
# Always specify dtypes to avoid silent type coercion
df_csv = pd.read_csv(
    "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv",
    dtype={
        'Pclass': 'int8',
        'Name': 'string',
        'Sex': 'category',
        'Embarked': 'category',
    },
    parse_dates=False,  # Parse dates manually for control
    na_values=['', 'NA', 'N/A', 'null', 'NULL', 'None', '-'],
)
print(f"Loaded {len(df_csv)} rows, {df_csv.shape[1]} columns")
print(f"Memory usage: {df_csv.memory_usage(deep=True).sum() / 1024:.1f} KB")

# Pattern 2: Multiple files that need concatenation
# files = glob.glob("data/sales_*.csv")
# dfs = [pd.read_csv(f) for f in sorted(files)]
# df = pd.concat(dfs, ignore_index=True)
# ALWAYS check: do all files have the same columns?

# Pattern 3: Database query
# from sqlalchemy import create_engine
# engine = create_engine("postgresql://user:pass@host/db")
# df = pd.read_sql("SELECT * FROM orders WHERE date >= '2025-01-01'", engine)

# Pattern 4: API response
# import requests
# response = requests.get("https://api.example.com/data", params={...})
# df = pd.json_normalize(response.json()['results'])

# Acquisition checklist
print("\n--- Acquisition Checklist ---")
print(f"  Rows: {len(df_csv):,}")
print(f"  Columns: {df_csv.shape[1]}")
print(f"  Memory: {df_csv.memory_usage(deep=True).sum() / 1024:.1f} KB")
print(f"  Source: URL / CSV")
print(f"  Date acquired: 2026-03-24")
print(f"  Any load errors: No")
```

::: tip Always Document Data Provenance
Record WHERE the data came from, WHEN you acquired it, and WHAT query or filter you used. Future-you will thank present-you when someone asks "where did this number come from?" six months later.
:::

---

## Step 2: Profile

Your first 15 minutes with any dataset. Get the lay of the land before making any decisions.

```python
# step2_profile.py — Comprehensive profiling in 15 minutes
import pandas as pd
import numpy as np

df = pd.read_csv(
    "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"
)

# 2a. Shape and size
print("=== SHAPE & SIZE ===")
print(f"Rows: {len(df):,}")
print(f"Columns: {df.shape[1]}")
print(f"Memory: {df.memory_usage(deep=True).sum() / 1024**2:.2f} MB")

# 2b. Column types
print("\n=== COLUMN TYPES ===")
print(df.dtypes)
print(f"\nNumeric columns: {df.select_dtypes(include='number').columns.tolist()}")
print(f"Object columns: {df.select_dtypes(include='object').columns.tolist()}")

# 2c. Missing data overview
print("\n=== MISSING DATA ===")
missing = df.isnull().sum()
missing_pct = (missing / len(df) * 100).round(1)
missing_df = pd.DataFrame({'count': missing, 'pct': missing_pct})
print(missing_df[missing_df['count'] > 0].sort_values('pct', ascending=False))

# 2d. Descriptive statistics
print("\n=== NUMERIC SUMMARY ===")
print(df.describe().round(2))

# 2e. Categorical summaries
print("\n=== CATEGORICAL SUMMARY ===")
for col in df.select_dtypes(include='object').columns:
    print(f"\n{col}: {df[col].nunique()} unique values")
    print(df[col].value_counts().head(5))

# 2f. Duplicates
print(f"\n=== DUPLICATES ===")
print(f"Exact duplicate rows: {df.duplicated().sum()}")
print(f"Duplicate PassengerIds: {df['PassengerId'].duplicated().sum()}")

# 2g. Quick sanity checks
print("\n=== SANITY CHECKS ===")
print(f"Age range: {df['Age'].min()} - {df['Age'].max()}")
print(f"Fare range: {df['Fare'].min()} - {df['Fare'].max()}")
print(f"Survived values: {df['Survived'].unique()}")
print(f"Pclass values: {sorted(df['Pclass'].unique())}")
```

### Decision Point After Profiling

```mermaid
flowchart TD
    P["Profiling Complete"] --> Q1{{"Missing > 50%<br/>in any column?"}}
    Q1 -->|"Yes"| A1["Consider dropping column<br/>or finding alternative source"]
    Q1 -->|"No"| Q2{{"Duplicates found?"}}

    Q2 -->|"Yes"| A2["Investigate: true duplicates<br/>or legitimate repeats?"]
    Q2 -->|"No"| Q3{{"Unexpected dtypes?"}}

    Q3 -->|"Yes"| A3["Numbers stored as strings?<br/>Dates as objects? Fix in Step 3"]
    Q3 -->|"No"| Q4{{"Data size manageable?"}}

    Q4 -->|"Yes"| S3["Proceed to Step 3: Clean"]
    Q4 -->|"No"| A4["Sample or use Dask/Polars"]

    A1 --> S3
    A2 --> S3
    A3 --> S3
    A4 --> S3

    style S3 fill:#22c55e,color:#fff
```

---

## Step 3: Clean

Fix data quality issues identified in profiling. Document every decision.

```python
# step3_clean.py — Cleaning with decision logging
import pandas as pd
import numpy as np

df = pd.read_csv(
    "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"
)
original_shape = df.shape

cleaning_log = []

# 3a. Handle missing values
# Age: 19.9% missing — impute with median by Pclass+Sex
age_medians = df.groupby(['Pclass', 'Sex'])['Age'].median()
print("Age medians by Pclass+Sex:")
print(age_medians)

for (pclass, sex), median_age in age_medians.items():
    mask = (df['Pclass'] == pclass) & (df['Sex'] == sex) & df['Age'].isnull()
    n_filled = mask.sum()
    df.loc[mask, 'Age'] = median_age
    if n_filled > 0:
        cleaning_log.append(
            f"Imputed {n_filled} missing Ages with median {median_age:.0f} "
            f"for Pclass={pclass}, Sex={sex}"
        )

# Cabin: 77.1% missing — too much to impute, extract deck letter
df['Deck'] = df['Cabin'].str[0]
cleaning_log.append("Extracted Deck from Cabin (77.1% of Cabin was missing)")

# Embarked: 0.2% missing — fill with mode
mode_embarked = df['Embarked'].mode()[0]
n_embarked = df['Embarked'].isnull().sum()
df['Embarked'].fillna(mode_embarked, inplace=True)
cleaning_log.append(f"Filled {n_embarked} missing Embarked with mode '{mode_embarked}'")

# 3b. Fix data types
df['Pclass'] = df['Pclass'].astype('int8')
df['Survived'] = df['Survived'].astype('int8')
df['Sex'] = df['Sex'].astype('category')
df['Embarked'] = df['Embarked'].astype('category')
cleaning_log.append("Converted Pclass/Survived to int8, Sex/Embarked to category")

# 3c. Remove true duplicates (if any)
n_dupes = df.duplicated(subset=['Name', 'Ticket']).sum()
if n_dupes > 0:
    df = df.drop_duplicates(subset=['Name', 'Ticket'])
    cleaning_log.append(f"Removed {n_dupes} duplicate rows by Name+Ticket")
else:
    cleaning_log.append("No duplicates found on Name+Ticket")

# 3d. Validate ranges
assert df['Age'].between(0, 100).all(), "Age out of range!"
assert df['Fare'].ge(0).all(), "Negative fares found!"
assert df['Survived'].isin([0, 1]).all(), "Invalid Survived values!"
cleaning_log.append("Validated: Age 0-100, Fare >= 0, Survived in {0,1}")

# Print cleaning log
print("\n=== CLEANING LOG ===")
for i, entry in enumerate(cleaning_log, 1):
    print(f"  {i}. {entry}")

print(f"\nShape: {original_shape} -> {df.shape}")
print(f"Memory: {df.memory_usage(deep=True).sum() / 1024:.1f} KB")
```

::: warning Never Clean Silently
Every cleaning decision is a judgment call. Dropping a row, filling a null, or fixing a type can change your results. Keep a cleaning log — it is your audit trail when someone asks "why does my analysis get different numbers?"
:::

---

## Step 4: Univariate Analysis

Examine each variable in isolation. This catches problems bivariate analysis cannot.

```python
# step4_univariate.py — Every variable, one at a time
import pandas as pd
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt
from scipy import stats

df = pd.read_csv(
    "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"
)
df['Age'].fillna(df['Age'].median(), inplace=True)

# 4a. Numeric distributions
fig, axes = plt.subplots(2, 3, figsize=(15, 10))

# Age distribution
axes[0, 0].hist(df['Age'], bins=30, edgecolor='black', alpha=0.7)
axes[0, 0].axvline(df['Age'].mean(), color='red', linestyle='--', label=f"Mean: {df['Age'].mean():.1f}")
axes[0, 0].axvline(df['Age'].median(), color='blue', linestyle='--', label=f"Median: {df['Age'].median():.1f}")
axes[0, 0].set_title('Age Distribution')
axes[0, 0].legend()

# Fare distribution (heavily skewed!)
axes[0, 1].hist(df['Fare'], bins=50, edgecolor='black', alpha=0.7)
axes[0, 1].set_title('Fare Distribution (Raw)')

# Fare log-transformed
axes[0, 2].hist(np.log1p(df['Fare']), bins=30, edgecolor='black', alpha=0.7, color='green')
axes[0, 2].set_title('Fare Distribution (Log)')

# Box plots for detecting outliers
axes[1, 0].boxplot(df['Age'])
axes[1, 0].set_title('Age Box Plot')

axes[1, 1].boxplot(df['Fare'])
axes[1, 1].set_title('Fare Box Plot')

axes[1, 2].boxplot(df['SibSp'])
axes[1, 2].set_title('SibSp Box Plot')

plt.tight_layout()
plt.savefig("univariate_numeric.png", dpi=150)
plt.show()

# 4b. Numeric summary statistics
print("=== NUMERIC UNIVARIATE ===")
for col in ['Age', 'Fare', 'SibSp', 'Parch']:
    s = df[col]
    skew = s.skew()
    kurt = s.kurtosis()
    print(f"\n{col}:")
    print(f"  Mean: {s.mean():.2f}, Median: {s.median():.2f}")
    print(f"  Std: {s.std():.2f}, IQR: {s.quantile(0.75) - s.quantile(0.25):.2f}")
    print(f"  Skewness: {skew:.2f} ({'right-skewed' if skew > 0.5 else 'left-skewed' if skew < -0.5 else 'symmetric'})")
    print(f"  Kurtosis: {kurt:.2f} ({'heavy-tailed' if kurt > 1 else 'light-tailed' if kurt < -1 else 'normal-tailed'})")
    print(f"  Range: [{s.min():.2f}, {s.max():.2f}]")

# 4c. Categorical distributions
print("\n=== CATEGORICAL UNIVARIATE ===")
for col in ['Survived', 'Pclass', 'Sex', 'Embarked']:
    vc = df[col].value_counts()
    print(f"\n{col} (n={df[col].notna().sum()}):")
    for val, count in vc.items():
        pct = count / len(df) * 100
        bar = '#' * int(pct / 2)
        print(f"  {val:>12}: {count:5d} ({pct:5.1f}%) {bar}")
```

---

## Step 5: Bivariate Analysis

Examine relationships between pairs of variables.

```python
# step5_bivariate.py — Pairwise relationships
import pandas as pd
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt

df = pd.read_csv(
    "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"
)
df['Age'].fillna(df['Age'].median(), inplace=True)

# 5a. Numeric vs Numeric — scatter + correlation
print("=== CORRELATION MATRIX ===")
numeric_cols = ['Age', 'Fare', 'SibSp', 'Parch', 'Survived']
corr = df[numeric_cols].corr()
print(corr.round(3))

# Heatmap
plt.figure(figsize=(8, 6))
sns.heatmap(corr, annot=True, cmap='RdBu_r', center=0, vmin=-1, vmax=1)
plt.title('Correlation Matrix')
plt.tight_layout()
plt.savefig("correlation_matrix.png", dpi=150)
plt.show()

# 5b. Numeric vs Categorical — group comparisons
print("\n=== SURVIVAL BY FEATURES ===")

# Age by survival
survived_age = df[df['Survived'] == 1]['Age']
died_age = df[df['Survived'] == 0]['Age']
print(f"Survived mean age: {survived_age.mean():.1f}")
print(f"Died mean age: {died_age.mean():.1f}")

# Fare by survival
survived_fare = df[df['Survived'] == 1]['Fare']
died_fare = df[df['Survived'] == 0]['Fare']
print(f"Survived mean fare: {survived_fare.mean():.1f}")
print(f"Died mean fare: {died_fare.mean():.1f}")

# 5c. Categorical vs Categorical — cross-tabulation
print("\n=== CROSS-TABULATION: Sex x Survived ===")
ct = pd.crosstab(df['Sex'], df['Survived'], margins=True, normalize='index')
print(ct.round(3))

print("\n=== CROSS-TABULATION: Pclass x Survived ===")
ct2 = pd.crosstab(df['Pclass'], df['Survived'], margins=True, normalize='index')
print(ct2.round(3))

# 5d. Visual bivariate analysis
fig, axes = plt.subplots(2, 2, figsize=(12, 10))

# Violin: Age by Survived
sns.violinplot(data=df, x='Survived', y='Age', ax=axes[0, 0])
axes[0, 0].set_title('Age by Survival')

# Box: Fare by Pclass
sns.boxplot(data=df, x='Pclass', y='Fare', ax=axes[0, 1])
axes[0, 1].set_title('Fare by Class')

# Bar: Survival rate by Sex
survival_by_sex = df.groupby('Sex')['Survived'].mean()
survival_by_sex.plot(kind='bar', ax=axes[1, 0], color=['#2563eb', '#dc2626'])
axes[1, 0].set_title('Survival Rate by Sex')
axes[1, 0].set_ylabel('Survival Rate')

# Scatter: Age vs Fare colored by Survived
colors = df['Survived'].map({0: '#dc2626', 1: '#22c55e'})
axes[1, 1].scatter(df['Age'], df['Fare'], c=colors, alpha=0.4, s=20)
axes[1, 1].set_title('Age vs Fare (green=survived)')
axes[1, 1].set_xlabel('Age')
axes[1, 1].set_ylabel('Fare')

plt.tight_layout()
plt.savefig("bivariate_analysis.png", dpi=150)
plt.show()
```

---

## Step 6: Multivariate Analysis

Look at 3+ variables simultaneously. This is where you find confounders and interactions.

```python
# step6_multivariate.py — Beyond pairwise
import pandas as pd
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt

df = pd.read_csv(
    "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"
)
df['Age'].fillna(df['Age'].median(), inplace=True)

# 6a. Faceted plots — survival by BOTH Sex AND Pclass
print("=== SURVIVAL: Sex x Pclass ===")
pivot = df.groupby(['Sex', 'Pclass'])['Survived'].mean().unstack()
print(pivot.round(3))

# Key finding: 1st class women survived at 96.8%
# 3rd class men survived at only 13.5%
# The interaction of Sex AND Pclass matters enormously

# 6b. Pair plot for multivariate patterns
g = sns.pairplot(
    df[['Survived', 'Pclass', 'Age', 'Fare']].dropna(),
    hue='Survived',
    diag_kind='kde',
    plot_kws={'alpha': 0.4, 's': 20},
    palette={0: '#dc2626', 1: '#22c55e'}
)
g.fig.suptitle('Pair Plot: Survival Patterns', y=1.02)
plt.savefig("multivariate_pairplot.png", dpi=150)
plt.show()

# 6c. Three-way interaction
print("\n=== THREE-WAY: Sex x Pclass x Age Group ===")
df['AgeGroup'] = pd.cut(df['Age'], bins=[0, 12, 18, 35, 60, 100],
                         labels=['Child', 'Teen', 'Young Adult', 'Adult', 'Senior'])

three_way = df.groupby(['Sex', 'Pclass', 'AgeGroup'])['Survived'].agg(
    ['mean', 'count']
).round(3)
print(three_way[three_way['count'] >= 5])  # Only show groups with enough data

# 6d. Conditional relationships
print("\n=== FARE vs SURVIVAL: Conditioned on Pclass ===")
for pclass in [1, 2, 3]:
    subset = df[df['Pclass'] == pclass]
    surv_fare = subset[subset['Survived'] == 1]['Fare'].median()
    died_fare = subset[subset['Survived'] == 0]['Fare'].median()
    print(f"Class {pclass}: Survived median fare=${surv_fare:.0f}, "
          f"Died median fare=${died_fare:.0f}")
# Within the same class, fare STILL predicts survival
# This means it is not just a Pclass proxy
```

### Decision Point: What Patterns Emerge?

```mermaid
flowchart TD
    M["Multivariate Complete"] --> Q1{{"Found interactions<br/>between features?"}}
    Q1 -->|"Yes"| A1["Create interaction<br/>features in Step 7"]
    Q1 -->|"No"| Q2{{"Found confounders?"}}

    Q2 -->|"Yes"| A2["Control for confounders<br/>in modeling"]
    Q2 -->|"No"| Q3{{"Clusters visible?"}}

    Q3 -->|"Yes"| A3["Consider segmentation<br/>or clustering"]
    Q3 -->|"No"| S7["Proceed to<br/>Step 7"]

    A1 --> S7
    A2 --> S7
    A3 --> S7

    style S7 fill:#22c55e,color:#fff
```

---

## Step 7: Feature Engineering

Transform EDA insights into model-ready features.

```python
# step7_feature_engineering.py — EDA-driven feature creation
import pandas as pd
import numpy as np

df = pd.read_csv(
    "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"
)
df['Age'].fillna(df['Age'].median(), inplace=True)

# Feature ideas from EDA findings:

# Finding 1: Family size matters (from Step 5-6)
df['FamilySize'] = df['SibSp'] + df['Parch'] + 1
df['IsAlone'] = (df['FamilySize'] == 1).astype(int)
print("Feature: FamilySize")
print(df.groupby('FamilySize')['Survived'].agg(['mean', 'count']).round(3))

# Finding 2: Titles in names correlate with survival (Step 4)
df['Title'] = df['Name'].str.extract(r' ([A-Za-z]+)\.', expand=False)
# Consolidate rare titles
title_map = {
    'Mr': 'Mr', 'Miss': 'Miss', 'Mrs': 'Mrs', 'Master': 'Master',
    'Dr': 'Rare', 'Rev': 'Rare', 'Col': 'Rare', 'Major': 'Rare',
    'Mlle': 'Miss', 'Countess': 'Rare', 'Ms': 'Miss', 'Lady': 'Rare',
    'Jonkheer': 'Rare', 'Don': 'Rare', 'Dona': 'Rare', 'Mme': 'Mrs',
    'Capt': 'Rare', 'Sir': 'Rare',
}
df['Title'] = df['Title'].map(title_map).fillna('Rare')
print("\nFeature: Title")
print(df.groupby('Title')['Survived'].agg(['mean', 'count']).round(3))

# Finding 3: Fare is heavily skewed (Step 4)
df['LogFare'] = np.log1p(df['Fare'])
print(f"\nFeature: LogFare")
print(f"  Fare skewness:    {df['Fare'].skew():.2f}")
print(f"  LogFare skewness: {df['LogFare'].skew():.2f}")

# Finding 4: Cabin deck matters (Step 2)
df['Deck'] = df['Cabin'].str[0].fillna('U')  # U for unknown
df['HasCabin'] = (df['Cabin'].notna()).astype(int)
print("\nFeature: Deck / HasCabin")
print(df.groupby('HasCabin')['Survived'].mean().round(3))

# Finding 5: Age groups have different survival patterns (Step 6)
df['AgeBin'] = pd.cut(df['Age'], bins=[0, 12, 18, 35, 60, 100],
                       labels=['Child', 'Teen', 'YoungAdult', 'Adult', 'Senior'])
print("\nFeature: AgeBin")
print(df.groupby('AgeBin')['Survived'].agg(['mean', 'count']).round(3))

# Summary of engineered features
print("\n=== ENGINEERED FEATURES SUMMARY ===")
new_features = ['FamilySize', 'IsAlone', 'Title', 'LogFare', 'Deck',
                'HasCabin', 'AgeBin']
print(f"Created {len(new_features)} new features from EDA insights")
for f in new_features:
    print(f"  {f}: {df[f].dtype}, {df[f].nunique()} unique values")
```

---

## Step 8: Validate

Check that your cleaning and engineering did not introduce errors.

```python
# step8_validate.py — Validation checks
import pandas as pd
import numpy as np

df = pd.read_csv(
    "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"
)
original_len = len(df)

# Run cleaning and feature engineering (abbreviated)
df['Age'].fillna(df['Age'].median(), inplace=True)
df['Embarked'].fillna(df['Embarked'].mode()[0], inplace=True)
df['FamilySize'] = df['SibSp'] + df['Parch'] + 1
df['LogFare'] = np.log1p(df['Fare'])

# 8a. Row count validation
assert len(df) == original_len, \
    f"Row count changed: {original_len} -> {len(df)}"
print(f"Row count: {len(df)} (unchanged)")

# 8b. No remaining nulls in critical columns
critical_cols = ['Survived', 'Pclass', 'Age', 'Sex', 'Fare', 'Embarked']
for col in critical_cols:
    null_count = df[col].isnull().sum()
    assert null_count == 0, f"{col} still has {null_count} nulls!"
    print(f"{col}: 0 nulls")

# 8c. Value range checks
validations = [
    ('Age', df['Age'].between(0, 100).all(), "0-100"),
    ('Fare', df['Fare'].ge(0).all(), ">= 0"),
    ('Survived', df['Survived'].isin([0, 1]).all(), "{0, 1}"),
    ('Pclass', df['Pclass'].isin([1, 2, 3]).all(), "{1, 2, 3}"),
    ('FamilySize', df['FamilySize'].ge(1).all(), ">= 1"),
    ('LogFare', df['LogFare'].notna().all(), "no NaN"),
]
print("\n=== RANGE VALIDATIONS ===")
for col, valid, expected in validations:
    status = "PASS" if valid else "FAIL"
    print(f"  [{status}] {col} in range {expected}")

# 8d. Distribution sanity — did cleaning change distributions dramatically?
print("\n=== DISTRIBUTION SANITY ===")
print(f"Survived mean: {df['Survived'].mean():.3f} (expect ~0.384)")
print(f"Age mean: {df['Age'].mean():.1f} (expect ~29-30)")
print(f"Fare mean: {df['Fare'].mean():.1f} (expect ~32)")
print(f"Pclass distribution:\n{df['Pclass'].value_counts(normalize=True).round(3)}")

# 8e. Feature correlation sanity
print("\n=== FEATURE CORRELATION SANITY ===")
# LogFare should still correlate with Survived
corr_fare = df['Fare'].corr(df['Survived'])
corr_logfare = df['LogFare'].corr(df['Survived'])
print(f"Fare-Survived correlation: {corr_fare:.3f}")
print(f"LogFare-Survived correlation: {corr_logfare:.3f}")
print("(Log transform should preserve or improve correlation)")
```

---

## Step 9: Communicate

EDA without communication is just data tourism. Structure your findings for your audience.

```python
# step9_communicate.py — Structuring EDA findings
import pandas as pd
import numpy as np

# EDA Report Template
report_template = """
# EDA Report: Titanic Survival Prediction

## Executive Summary
- Dataset: 891 passengers with 12 features
- Target: Survived (binary, 38.4% positive)
- Key insight: Sex and Pclass are the strongest predictors
- Data quality: Age 19.9% missing (imputed), Cabin 77.1% missing

## Top 5 Findings (ranked by impact)

### 1. Women survived at 3.7x the rate of men
- Female survival: 74.2%, Male survival: 18.9%
- This single feature explains more variance than all others combined
- Recommendation: Sex is the #1 feature for any model

### 2. First-class passengers survived at 2.5x the rate of third-class
- Class 1: 62.9%, Class 2: 47.3%, Class 3: 24.2%
- Confounded with Fare — higher fare within same class also helps
- Recommendation: Include both Pclass and Fare as features

### 3. Children (< 12) had higher survival across all classes
- Children survival: 57.5% vs Adult: 36.2%
- "Women and children first" policy is visible in the data
- Recommendation: Create AgeBin feature

### 4. Family size has a non-linear effect
- Solo travelers: 30.4% survival
- Families of 2-4: 57.8% survival
- Families of 5+: 16.1% survival
- Recommendation: Create FamilySize + IsAlone features

### 5. Fare distribution is heavily right-skewed
- Mean: $32.20, Median: $14.45 (2.2x difference)
- Log transform reduces skewness from 4.79 to 0.42
- Recommendation: Use LogFare instead of raw Fare

## Data Quality Issues
| Issue | Severity | Resolution |
|-------|----------|------------|
| Age 19.9% missing | Medium | Imputed by Pclass+Sex median |
| Cabin 77.1% missing | High | Extracted Deck letter, created HasCabin |
| Embarked 0.2% missing | Low | Filled with mode (S) |

## Next Steps
1. Build baseline model with top features
2. Try ensemble methods (Random Forest, XGBoost)
3. Engineer ticket-based features (shared tickets)
4. Investigate Cabin/Deck patterns further
"""

print(report_template)
```

### Communication Pyramid

```mermaid
flowchart TD
    subgraph Pyramid["Communication Pyramid"]
        direction TB
        A["Executive Summary<br/>(30 seconds)"] --> B["Key Findings<br/>(5 minutes)"]
        B --> C["Supporting Analysis<br/>(15 minutes)"]
        C --> D["Full Details + Code<br/>(reference)"]
    end

    E["CEO / VP"] --> A
    F["Manager /<br/>Product Owner"] --> B
    G["Data Scientist<br/>Peer"] --> C
    H["Future You"] --> D

    style A fill:#dc2626,color:#fff
    style B fill:#f97316,color:#fff
    style C fill:#2563eb,color:#fff
    style D fill:#6b7280,color:#fff
```

---

## Step 10: Iterate

EDA is never truly "done." New questions emerge from modeling, from stakeholders, and from new data.

```python
# step10_iterate.py — When and why to loop back
iteration_triggers = [
    {
        "trigger": "Model residuals show a pattern",
        "action": "Go back to Step 5-6: the model is missing a relationship",
        "example": "Residuals are higher for young passengers — age interaction missing"
    },
    {
        "trigger": "New data arrives with different distributions",
        "action": "Go back to Step 2: profile new data, compare to training data",
        "example": "New data has Embarked='X' — a value not in training data"
    },
    {
        "trigger": "Stakeholder asks unexpected question",
        "action": "Go back to Step 4-5: analyze the dimension they asked about",
        "example": "'How does nationality affect survival?' — not in current analysis"
    },
    {
        "trigger": "Feature importance reveals surprising feature",
        "action": "Go back to Step 5: investigate why this feature matters",
        "example": "Ticket number is important — maybe shared tickets indicate family"
    },
    {
        "trigger": "Data quality issue discovered during modeling",
        "action": "Go back to Step 3: fix and re-validate",
        "example": "Fare=0 for some passengers — were they crew? Stowaways?"
    },
]

print("=== EDA ITERATION TRIGGERS ===")
for i, t in enumerate(iteration_triggers, 1):
    print(f"\n{i}. {t['trigger']}")
    print(f"   Action: {t['action']}")
    print(f"   Example: {t['example']}")
```

::: tip The 3-Pass Approach
For any serious analysis, plan for 3 EDA passes:
1. **Quick pass** (1-2 hours): Profile, clean, basic distributions, key relationships
2. **Deep pass** (1-2 days): Multivariate analysis, feature engineering, edge cases
3. **Model-driven pass** (ongoing): Residual analysis, error patterns, drift detection
:::

---

## Complete Workflow Checklist

| Step | Time Budget | Key Output | Go/No-Go Check |
|------|-------------|------------|-----------------|
| 1. Acquire | 15 min | Loaded DataFrame, provenance doc | Data loads without errors |
| 2. Profile | 30 min | Shape, types, missing, duplicates | No critical data issues |
| 3. Clean | 1-2 hr | Clean DataFrame, cleaning log | All validations pass |
| 4. Univariate | 1 hr | Distribution for every column | No unexplained anomalies |
| 5. Bivariate | 1-2 hr | Correlation matrix, cross-tabs | Key relationships identified |
| 6. Multivariate | 1-2 hr | Interaction analysis, confounders | Confounders documented |
| 7. Feature Engineering | 1-2 hr | New features with rationale | Features have signal |
| 8. Validate | 30 min | Validation report | All checks pass |
| 9. Communicate | 1-2 hr | EDA report at 4 levels | Stakeholders can act on findings |
| 10. Iterate | Ongoing | Updated analyses | New insights documented |

---

## What's Next

| Page | What You'll Learn |
|------|------------------|
| [Common Mistakes](/eda/common-mistakes) | 30+ mistakes that derail analyses |
| [Data Profiling](/eda/data-profiling) | Deep dive into Step 2 |
| [Understanding Distributions](/eda/understanding-distributions) | Deep dive into Step 4 |
| [Missing Data](/eda/missing-data) | Deep dive into Step 3 |
