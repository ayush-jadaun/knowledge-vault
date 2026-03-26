---
title: "Pandas EDA Cheat Sheet"
description: "100 most-used pandas operations for EDA — loading, inspection, cleaning, filtering, grouping, reshaping, time series, and visualization-ready transforms"
tags: [pandas, cheat-sheet, eda, data-wrangling, reference]
difficulty: intermediate
prerequisites: [pandas-fundamentals]
lastReviewed: "2026-03-24"
---

# Pandas EDA Cheat Sheet

The 100 most-used pandas operations for exploratory data analysis, organized by EDA workflow phase. Copy-paste ready.

---

## Loading Data (1-10)

```python
import pandas as pd
import numpy as np

# 1. CSV with common options
df = pd.read_csv('data.csv', parse_dates=['date'], dtype={'id': str},
                  na_values=['N/A', ''], low_memory=False)

# 2. Excel
df = pd.read_excel('data.xlsx', sheet_name='Sheet1', engine='openpyxl')

# 3. Parquet (fast, preserves dtypes)
df = pd.read_parquet('data.parquet', columns=['col1', 'col2'])

# 4. JSON
df = pd.read_json('data.json', orient='records')

# 5. SQL
import sqlite3
conn = sqlite3.connect('db.sqlite')
df = pd.read_sql('SELECT * FROM table WHERE active=1', conn)

# 6. CSV in chunks (large files)
chunks = pd.read_csv('big.csv', chunksize=100_000)
df = pd.concat([c[c['status'] == 'active'] for c in chunks])

# 7. Clipboard (from spreadsheet)
# df = pd.read_clipboard()

# 8. From dict
df = pd.DataFrame({'a': [1, 2], 'b': ['x', 'y']})

# 9. From list of dicts
df = pd.DataFrame.from_records([{'a': 1, 'b': 'x'}, {'a': 2, 'b': 'y'}])

# 10. Sample dataset
df = pd.DataFrame({
    'id': range(1000),
    'value': np.random.randn(1000),
    'group': np.random.choice(['A', 'B', 'C'], 1000),
    'date': pd.date_range('2024-01-01', periods=1000, freq='h'),
})
```

---

## First Look (11-20)

```python
# 11. Shape
df.shape                               # (rows, cols)

# 12. First/last rows
df.head(10)
df.tail(5)

# 13. Column info
df.info()                              # dtypes, non-null counts, memory

# 14. Describe numerics
df.describe()                          # count, mean, std, quartiles

# 15. Describe categoricals
df.describe(include='object')          # count, unique, top, freq

# 16. Data types
df.dtypes

# 17. Column names
df.columns.tolist()

# 18. Memory usage
df.memory_usage(deep=True).sum() / 1024**2  # MB

# 19. Unique values per column
df.nunique()

# 20. Sample rows
df.sample(5, random_state=42)
```

---

## Missing Data (21-30)

```python
# 21. Count missing per column
df.isna().sum()

# 22. Missing percentage
(df.isna().mean() * 100).round(2)

# 23. Rows with any missing
df[df.isna().any(axis=1)]

# 24. Total missing cells
df.isna().sum().sum()

# 25. Drop rows with missing
df.dropna()                            # any column
df.dropna(subset=['col1', 'col2'])     # specific columns

# 26. Fill with value
df['col'].fillna(0)
df['col'].fillna(df['col'].median())

# 27. Fill with group median
df['col'] = df.groupby('group')['col'].transform(lambda x: x.fillna(x.median()))

# 28. Forward/backward fill
df['col'].ffill()
df['col'].bfill()

# 29. Interpolate
df['col'].interpolate(method='linear')

# 30. Replace NaN-like strings
df.replace(['N/A', 'null', '', '-'], np.nan, inplace=True)
```

---

## Selection & Filtering (31-45)

```python
# 31. Single column
df['col']                              # Series
df[['col']]                            # DataFrame

# 32. Multiple columns
df[['col1', 'col2', 'col3']]

# 33. By dtype
df.select_dtypes(include='number')
df.select_dtypes(include=['object', 'category'])

# 34. Boolean filter
df[df['value'] > 0]

# 35. Multiple conditions
df[(df['value'] > 0) & (df['group'] == 'A')]

# 36. isin
df[df['group'].isin(['A', 'B'])]

# 37. between
df[df['value'].between(-1, 1)]

# 38. String contains
df[df['name'].str.contains('pattern', case=False, na=False)]

# 39. query (clean syntax)
df.query('value > 0 and group == "A"')

# 40. nlargest / nsmallest
df.nlargest(10, 'value')
df.nsmallest(5, 'value')

# 41. loc (label-based)
df.loc[0:5, ['col1', 'col2']]

# 42. iloc (position-based)
df.iloc[:5, :3]

# 43. Conditional column
df['flag'] = np.where(df['value'] > 0, 'positive', 'negative')

# 44. Multiple conditions
conditions = [df['value'] > 1, df['value'] > 0, df['value'] > -1]
choices = ['high', 'medium', 'low']
df['tier'] = np.select(conditions, choices, default='very low')

# 45. Drop columns
df.drop(columns=['col1', 'col2'])
```

---

## Aggregation & GroupBy (46-60)

```python
# 46. Value counts
df['group'].value_counts()
df['group'].value_counts(normalize=True)    # percentages

# 47. Basic groupby
df.groupby('group')['value'].mean()

# 48. Multiple aggregations
df.groupby('group')['value'].agg(['mean', 'median', 'std', 'count'])

# 49. Named aggregations
df.groupby('group').agg(
    avg_val=('value', 'mean'),
    n=('value', 'count'),
    unique_ids=('id', 'nunique'),
)

# 50. Multiple group keys
df.groupby(['group', 'date'])['value'].sum()

# 51. Transform (same shape output)
df['group_mean'] = df.groupby('group')['value'].transform('mean')

# 52. Z-score within group
df['zscore'] = df.groupby('group')['value'].transform(
    lambda x: (x - x.mean()) / x.std()
)

# 53. Percent of group total
df['pct'] = df.groupby('group')['value'].transform(lambda x: x / x.sum())

# 54. Rank within group
df['rank'] = df.groupby('group')['value'].rank(ascending=False)

# 55. Top N per group
df.sort_values('value', ascending=False).groupby('group').head(3)

# 56. Filter groups
df.groupby('group').filter(lambda g: len(g) > 100)

# 57. Crosstab
pd.crosstab(df['group'], df['flag'])
pd.crosstab(df['group'], df['flag'], normalize='index')

# 58. Pivot table
pd.pivot_table(df, values='value', index='group', columns='flag',
               aggfunc='mean', margins=True)

# 59. Cumulative sum within group
df['cumsum'] = df.groupby('group')['value'].cumsum()

# 60. Custom aggregation
df.groupby('group').apply(
    lambda g: pd.Series({
        'mean': g['value'].mean(),
        'iqr': g['value'].quantile(0.75) - g['value'].quantile(0.25),
        'pct_positive': (g['value'] > 0).mean(),
    })
)
```

---

## Sorting & Ranking (61-65)

```python
# 61. Sort by column
df.sort_values('value', ascending=False)

# 62. Sort by multiple columns
df.sort_values(['group', 'value'], ascending=[True, False])

# 63. Rank
df['rank'] = df['value'].rank(ascending=False, method='dense')

# 64. Percentile rank
df['pctile'] = df['value'].rank(pct=True)

# 65. Sort index
df.sort_index()
```

---

## Reshaping (66-75)

```python
# 66. Melt (wide to long)
pd.melt(df, id_vars=['id'], value_vars=['col1', 'col2'],
        var_name='variable', value_name='value')

# 67. Pivot (long to wide)
df.pivot(index='id', columns='group', values='value')

# 68. Stack / unstack
df.set_index(['group', 'date'])['value'].unstack('group')

# 69. Explode lists
df.explode('list_column')

# 70. Transpose
df.T

# 71. Concat vertically
pd.concat([df1, df2], ignore_index=True)

# 72. Concat horizontally
pd.concat([df1, df2], axis=1)

# 73. Merge (join)
df.merge(other, on='key', how='left', validate='m:1')

# 74. Merge with indicator
df.merge(other, on='key', how='outer', indicator=True)

# 75. Get dummies
pd.get_dummies(df, columns=['group'], drop_first=True)
```

---

## Datetime (76-85)

```python
# 76. Parse dates
df['date'] = pd.to_datetime(df['date'])

# 77. Extract components
df['year'] = df['date'].dt.year
df['month'] = df['date'].dt.month
df['weekday'] = df['date'].dt.day_name()
df['hour'] = df['date'].dt.hour

# 78. Is weekend
df['is_weekend'] = df['date'].dt.dayofweek >= 5

# 79. Date difference
df['days_since'] = (pd.Timestamp.now() - df['date']).dt.days

# 80. Resample (time aggregation)
df.set_index('date').resample('W')['value'].sum()
df.set_index('date').resample('M')['value'].agg(['sum', 'mean', 'count'])

# 81. Rolling window
df['ma_7'] = df['value'].rolling(7).mean()
df['ma_30'] = df['value'].rolling(30).mean()
df['rolling_std'] = df['value'].rolling(21).std()

# 82. Expanding
df['cummax'] = df['value'].expanding().max()

# 83. Shift / lag
df['prev_value'] = df['value'].shift(1)
df['change'] = df['value'].diff()
df['pct_change'] = df['value'].pct_change()

# 84. Between dates
mask = df['date'].between('2024-01-01', '2024-06-30')
df[mask]

# 85. Time since last event per group
df['days_since_last'] = df.groupby('group')['date'].diff().dt.days
```

---

## String Operations (86-90)

```python
# 86. Clean strings
df['name'] = df['name'].str.strip().str.lower().str.replace(' ', '_')

# 87. Extract pattern
df['domain'] = df['email'].str.extract(r'@(\w+\.\w+)')

# 88. Contains
df[df['text'].str.contains('error', case=False, na=False)]

# 89. Split
df[['first', 'last']] = df['name'].str.split(' ', n=1, expand=True)

# 90. String length
df['name_len'] = df['name'].str.len()
```

---

## Data Quality (91-95)

```python
# 91. Duplicates
df.duplicated().sum()
df.drop_duplicates(subset=['col1', 'col2'], keep='first')

# 92. Value ranges
df['value'].clip(lower=0, upper=100)

# 93. Outliers (IQR)
q1, q3 = df['value'].quantile([0.25, 0.75])
iqr = q3 - q1
outliers = df[(df['value'] < q1 - 1.5*iqr) | (df['value'] > q3 + 1.5*iqr)]

# 94. Dtypes optimization
df['group'] = df['group'].astype('category')
df['value'] = df['value'].astype('float32')

# 95. Correlation
df.select_dtypes('number').corr()
df.select_dtypes('number').corr(method='spearman')
```

---

## Statistics & Analysis (96-100)

```python
# 96. Descriptive stats
df['value'].agg(['mean', 'median', 'std', 'skew', 'kurt', 'min', 'max'])

# 97. Quantiles
df['value'].quantile([0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99])

# 98. Binning
df['bin'] = pd.cut(df['value'], bins=5)                # equal-width
df['qbin'] = pd.qcut(df['value'], q=5, labels=False)   # equal-frequency

# 99. Correlation with target
df.select_dtypes('number').corrwith(df['target']).sort_values(ascending=False)

# 100. Skewness check
skew = df.select_dtypes('number').skew()
print("Columns needing transform (|skew| > 1):")
print(skew[abs(skew) > 1])
```

---

## Quick Reference Card

| Task | Code |
|------|------|
| Shape | `df.shape` |
| Info | `df.info()` |
| Stats | `df.describe()` |
| Missing | `df.isna().sum()` |
| Value counts | `df['col'].value_counts()` |
| Filter | `df.query('col > 0')` |
| Group stats | `df.groupby('g')['v'].agg(['mean','count'])` |
| Sort | `df.sort_values('col', ascending=False)` |
| Merge | `df.merge(other, on='key', how='left')` |
| Pivot | `pd.pivot_table(df, values='v', index='g', aggfunc='mean')` |
| Melt | `pd.melt(df, id_vars=['id'], value_vars=['a','b'])` |
| Rolling mean | `df['v'].rolling(7).mean()` |
| Correlation | `df.corr()` |
| Bin | `pd.cut(df['v'], bins=5)` |
| Crosstab | `pd.crosstab(df['a'], df['b'], normalize='index')` |

---

::: details Test Yourself
1. **What method shows dtypes, non-null counts, and memory usage for a DataFrame?**
   `df.info()`

2. **How do you get the percentage of missing values per column?**
   `(df.isna().mean() * 100).round(2)`

3. **What method fills missing values with the group median?**
   `df.groupby('group')['col'].transform(lambda x: x.fillna(x.median()))`

4. **How do you filter rows using a clean SQL-like syntax?**
   `df.query('value > 0 and group == "A"')`

5. **What is the difference between `groupby().agg()` and `groupby().transform()`?**
   `agg()` returns one row per group (reduced shape); `transform()` returns the same shape as the input.

6. **How do you get the top 3 rows per group by value?**
   `df.sort_values('value', ascending=False).groupby('group').head(3)`

7. **What method converts a wide DataFrame to long format?**
   `pd.melt(df, id_vars=['id'], value_vars=['col1', 'col2'])`

8. **How do you compute a 7-day rolling mean?**
   `df['value'].rolling(7).mean()`

9. **What method detects outliers using the IQR method?**
   Compute `q1, q3 = df['col'].quantile([0.25, 0.75])`, then `iqr = q3 - q1`, then filter `< q1 - 1.5*iqr` or `> q3 + 1.5*iqr`.

10. **How do you merge two DataFrames with an indicator showing which rows matched?**
    `df.merge(other, on='key', how='outer', indicator=True)`
:::

::: danger Common Gotchas
- **Chained assignment warning.** `df[df['x'] > 0]['y'] = 1` does NOT modify the original DataFrame. Use `df.loc[df['x'] > 0, 'y'] = 1` instead.
- **Fitting scaler on test data.** Always `fit_transform` on training data and `transform` on test data. Fitting on test data leaks information.
- **Using `inplace=True` everywhere.** It is being deprecated in many methods, makes debugging harder, and prevents method chaining. Prefer reassignment: `df = df.dropna()`.
- **Forgetting `na=False` in `.str.contains()`.** If the column has NaN values, `.str.contains()` returns NaN for those rows, which causes boolean indexing to fail.
:::

## One-Liner Summary

Pandas is Python's DataFrame library for exploratory data analysis -- master `groupby`, `merge`, `pivot_table`, `rolling`, and `query` to wrangle any dataset from raw CSV to analysis-ready form.
