---
title: "Data Cleaning — Text"
description: "Text data cleaning for EDA — string standardization, regex patterns for emails/phones/dates/currency, fuzzy matching with fuzzywuzzy, deduplication, and record linkage across datasets."
tags: [eda, text-cleaning, regex, fuzzy-matching, deduplication]
difficulty: intermediate
prerequisites: [eda/data-types-deep-dive, eda/data-profiling]
lastReviewed: "2026-03-24"
---

# Data Cleaning — Text

Text data is the messiest data type you will encounter. The same entity appears as "United States", "US", "U.S.A.", "USA", "united states", and "The United States of America". Phone numbers come as "555-1234", "(555) 1234", "+1 555 1234", and "5551234". Names have typos, nicknames, transliterations, and extra whitespace. Cleaning text data is where most EDA time goes — and where most data quality improvements come from.

---

## String Standardization Pipeline

```mermaid
flowchart LR
    A["Raw Text"] --> B["Strip whitespace"]
    B --> C["Normalize case"]
    C --> D["Remove special chars"]
    D --> E["Standardize formats"]
    E --> F["Deduplicate"]

    style A fill:#dc2626,color:#fff
    style F fill:#22c55e,color:#fff
```

```python
# string_standardization.py — The universal text cleaning pipeline
import pandas as pd
import numpy as np
import re

# Messy customer data
df = pd.DataFrame({
    'name': ['  John Smith  ', 'JOHN SMITH', 'john smith', 'John  Smith',
             'Jon Smith', 'J. Smith', 'Smith, John', 'Jonh Smith'],
    'email': ['john@Gmail.COM', 'JOHN@gmail.com ', ' john@gmail.com',
              'john@gmail..com', 'john@gmai.com', 'john@gmail.com',
              'john@gmail.com', 'john @gmail.com'],
    'phone': ['555-1234', '(555) 1234', '+1-555-1234', '555.1234',
              '5551234', '1-555-1234', ' 555 1234 ', '555-12-34'],
    'city': ['New York', 'new york', 'NEW YORK', 'New  York',
             'New York City', 'NYC', 'N.Y.C.', 'Newyork'],
})

print("=== RAW DATA ===")
print(df.to_string())

# Step 1: Whitespace normalization
df['name_clean'] = (df['name']
    .str.strip()                          # Remove leading/trailing
    .str.replace(r'\s+', ' ', regex=True) # Collapse multiple spaces
)

# Step 2: Case normalization
df['name_clean'] = df['name_clean'].str.title()

# Step 3: Handle "Last, First" format
def normalize_name(name):
    name = name.strip()
    if ',' in name:
        parts = [p.strip() for p in name.split(',')]
        name = f"{parts[1]} {parts[0]}"
    return name.title()

df['name_clean'] = df['name'].apply(normalize_name)
df['name_clean'] = df['name_clean'].str.replace(r'\s+', ' ', regex=True).str.strip()

# Step 4: Email standardization
df['email_clean'] = (df['email']
    .str.strip()
    .str.lower()
    .str.replace(r'\s', '', regex=True)    # Remove internal spaces
    .str.replace(r'\.{2,}', '.', regex=True)  # Fix double dots
)

# Step 5: Phone standardization — extract digits only
df['phone_clean'] = df['phone'].str.replace(r'[^0-9]', '', regex=True)
# Keep last 7 digits (local number)
df['phone_clean'] = df['phone_clean'].str[-7:]

# Step 6: City standardization
city_map = {
    'new york': 'New York',
    'new york city': 'New York',
    'nyc': 'New York',
    'n.y.c.': 'New York',
    'newyork': 'New York',
}
df['city_clean'] = (df['city']
    .str.strip()
    .str.lower()
    .str.replace(r'\s+', ' ', regex=True)
    .map(city_map)
    .fillna(df['city'].str.strip().str.title())
)

print(f"\n=== CLEANED DATA ===")
print(df[['name_clean', 'email_clean', 'phone_clean', 'city_clean']].to_string())

# Count unique values before and after
print(f"\n=== DEDUPLICATION IMPACT ===")
for col_raw, col_clean in [('name', 'name_clean'), ('email', 'email_clean'),
                            ('phone', 'phone_clean'), ('city', 'city_clean')]:
    before = df[col_raw].nunique()
    after = df[col_clean].nunique()
    print(f"  {col_raw}: {before} unique -> {after} unique ({before - after} duplicates found)")
```

---

## Regex Patterns for Common Formats

```python
# regex_patterns.py — Battle-tested regex for data cleaning
import re
import pandas as pd

# Email validation and extraction
email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

test_emails = [
    'john@example.com',       # Valid
    'jane.doe@company.co.uk', # Valid
    'user@',                  # Invalid
    'user@.com',              # Invalid
    'user name@example.com',  # Invalid (space)
    'user+tag@gmail.com',     # Valid
]

print("=== EMAIL VALIDATION ===")
for email in test_emails:
    valid = bool(re.fullmatch(email_pattern, email))
    print(f"  {email:>30}: {'VALID' if valid else 'INVALID'}")

# Phone number extraction and normalization
phone_patterns = {
    'US': r'\+?1?[-.\s]?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})',
    'UK': r'\+?44[-.\s]?\(?0?\)?[-.\s]?(\d{2,4})[-.\s]?(\d{3,4})[-.\s]?(\d{3,4})',
}

test_phones = [
    '+1 (555) 123-4567',
    '555.123.4567',
    '5551234567',
    '1-555-123-4567',
    '(555)123-4567',
]

print(f"\n=== PHONE NORMALIZATION ===")
for phone in test_phones:
    match = re.search(phone_patterns['US'], phone)
    if match:
        normalized = f"({match.group(1)}) {match.group(2)}-{match.group(3)}"
        print(f"  {phone:>25} -> {normalized}")
    else:
        print(f"  {phone:>25} -> NO MATCH")

# Date extraction (multiple formats)
date_patterns = [
    (r'(\d{4})-(\d{2})-(\d{2})', 'YYYY-MM-DD'),
    (r'(\d{2})/(\d{2})/(\d{4})', 'MM/DD/YYYY'),
    (r'(\d{2})-(\d{2})-(\d{4})', 'DD-MM-YYYY'),
    (r'(\w{3})\s+(\d{1,2}),?\s+(\d{4})', 'Mon DD, YYYY'),
]

test_dates = [
    '2024-03-15',
    '03/15/2024',
    '15-03-2024',
    'Mar 15, 2024',
    'March 15 2024',
]

print(f"\n=== DATE EXTRACTION ===")
for date_str in test_dates:
    matched = False
    for pattern, fmt in date_patterns:
        match = re.search(pattern, date_str)
        if match:
            print(f"  {date_str:>20} -> matched as {fmt}")
            matched = True
            break
    if not matched:
        print(f"  {date_str:>20} -> NO MATCH")

# Currency extraction
currency_pattern = r'[\$\u00a3\u20ac]?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)'

test_currencies = [
    '$1,234.56', '\u00a31,234.56', '\u20ac1234.56',
    '1,234.56', '$1234', '$12.99',
]

print(f"\n=== CURRENCY EXTRACTION ===")
for curr in test_currencies:
    match = re.search(currency_pattern, curr)
    if match:
        value = float(match.group(1).replace(',', ''))
        print(f"  {curr:>15} -> {value:.2f}")

# Common cleaning regex patterns
print(f"\n=== USEFUL REGEX PATTERNS ===")
patterns = {
    'Multiple spaces -> one': (r'\s+', ' '),
    'Leading/trailing spaces': (r'^\s+|\s+$', ''),
    'Non-alphanumeric': (r'[^a-zA-Z0-9\s]', ''),
    'HTML tags': (r'<[^>]+>', ''),
    'URLs': (r'https?://\S+', ''),
    'Numbers only': (r'[^0-9]', ''),
    'Letters only': (r'[^a-zA-Z\s]', ''),
    'Consecutive duplicates': (r'(.)\1{2,}', r'\1\1'),  # "loooool" -> "lool"
}

for desc, (pattern, repl) in patterns.items():
    print(f"  {desc:>30}: re.sub(r'{pattern}', '{repl}', text)")
```

---

## Fuzzy Matching

When exact matching fails, fuzzy matching finds approximate matches.

```python
# fuzzy_matching.py — Finding similar strings
# pip install thefuzz python-Levenshtein
from thefuzz import fuzz, process
import pandas as pd

# Scenario: matching customer names across two systems
system_a = ['John Smith', 'Jane Doe', 'Robert Johnson', 'Maria Garcia',
            'David Williams', 'Sarah Miller', 'Michael Brown']
system_b = ['Jon Smith', 'Jane M. Doe', 'Bob Johnson', 'Maria Garcia Lopez',
            'Dave Williams', 'Sara Miller', 'Mike Brown']

print("=== FUZZY MATCHING ===\n")

# Different matching algorithms
name_a, name_b = 'John Smith', 'Jon Smith'
print(f"Comparing: '{name_a}' vs '{name_b}'")
print(f"  Simple ratio:   {fuzz.ratio(name_a, name_b)}")
print(f"  Partial ratio:  {fuzz.partial_ratio(name_a, name_b)}")
print(f"  Token sort:     {fuzz.token_sort_ratio(name_a, name_b)}")
print(f"  Token set:      {fuzz.token_set_ratio(name_a, name_b)}")

name_a2, name_b2 = 'Robert Johnson', 'Johnson, Robert'
print(f"\nComparing: '{name_a2}' vs '{name_b2}'")
print(f"  Simple ratio:   {fuzz.ratio(name_a2, name_b2)}")
print(f"  Token sort:     {fuzz.token_sort_ratio(name_a2, name_b2)}")
print(f"  Token set:      {fuzz.token_set_ratio(name_a2, name_b2)}")

# Match all names between systems
print(f"\n--- Cross-System Matching ---")
matches = []
for name in system_a:
    best_match, score, idx = process.extractOne(name, system_b,
                                                  scorer=fuzz.token_set_ratio)
    confidence = 'HIGH' if score >= 90 else 'MEDIUM' if score >= 75 else 'LOW'
    matches.append({
        'system_a': name,
        'best_match_b': best_match,
        'score': score,
        'confidence': confidence,
    })
    print(f"  {name:>20} -> {best_match:<25} (score: {score}, {confidence})")

# Matching algorithm selection guide
print(f"\n--- Algorithm Selection Guide ---")
guide = pd.DataFrame({
    'Algorithm': ['fuzz.ratio', 'fuzz.partial_ratio', 'fuzz.token_sort_ratio',
                  'fuzz.token_set_ratio'],
    'Best For': [
        'Same length, similar strings',
        'Substring matching (short in long)',
        'Same words, different order',
        'Different word count, overlapping words',
    ],
    'Example': [
        "'John' vs 'Jon' -> 86",
        "'Smith' vs 'John Smith' -> 100",
        "'John Smith' vs 'Smith John' -> 100",
        "'John Smith' vs 'John Michael Smith' -> 100",
    ],
})
print(guide.to_string(index=False))
```

---

## Deduplication

```python
# deduplication.py — Finding and merging duplicate records
import pandas as pd
import numpy as np
from thefuzz import fuzz

# Messy customer database with duplicates
customers = pd.DataFrame({
    'id': range(1, 11),
    'name': ['John Smith', 'Jon Smith', 'JOHN SMITH', 'Jane Doe',
             'Jane M Doe', 'Robert Brown', 'Bob Brown', 'Alice Johnson',
             'Alice K Johnson', 'Alice Johnson'],
    'email': ['john@ex.com', 'john@ex.com', 'john@ex.com', 'jane@ex.com',
              'jane.doe@ex.com', 'rbrown@ex.com', 'rbrown@ex.com',
              'alice@ex.com', 'alice@ex.com', 'alicej@ex.com'],
    'phone': ['5551234', '5551234', '5551234', '5555678', '5555678',
              '5559012', '5559012', '5553456', '5553456', '5553456'],
    'revenue': [100, 50, 200, 300, 150, 75, 125, 80, 90, 60],
})

print("=== DEDUPLICATION ===\n")
print("Original data:")
print(customers.to_string(index=False))

# Step 1: Normalize for comparison
customers['name_norm'] = customers['name'].str.lower().str.strip()
customers['email_norm'] = customers['email'].str.lower().str.strip()

# Step 2: Block on email (exact match first)
print(f"\n--- Step 1: Exact Email Match ---")
email_groups = customers.groupby('email_norm')['id'].apply(list)
for email, ids in email_groups.items():
    if len(ids) > 1:
        print(f"  {email}: IDs {ids}")

# Step 3: Fuzzy match within blocks
print(f"\n--- Step 2: Fuzzy Name Match ---")
seen = set()
duplicate_groups = []

for i, row_i in customers.iterrows():
    if i in seen:
        continue
    group = [i]
    for j, row_j in customers.iterrows():
        if j <= i or j in seen:
            continue
        # Match on phone OR (fuzzy name + similar email domain)
        phone_match = row_i['phone'] == row_j['phone']
        name_score = fuzz.token_set_ratio(row_i['name_norm'], row_j['name_norm'])
        name_match = name_score >= 80

        if phone_match and name_match:
            group.append(j)
            seen.add(j)

    if len(group) > 1:
        duplicate_groups.append(group)
        seen.update(group)

print(f"Found {len(duplicate_groups)} duplicate groups:")
for group in duplicate_groups:
    names = customers.loc[group, 'name'].tolist()
    total_rev = customers.loc[group, 'revenue'].sum()
    print(f"  {names} -> total revenue: ${total_rev}")

# Step 4: Merge duplicates (keep best record)
print(f"\n--- Step 3: Merge Strategy ---")
print("For each duplicate group:")
print("  - Name: keep longest (most complete)")
print("  - Email: keep first non-null")
print("  - Revenue: SUM (aggregate)")
print("  - Other fields: keep mode or most recent")

merged = []
processed = set()
for group in duplicate_groups:
    rows = customers.loc[group]
    merged_record = {
        'name': rows.loc[rows['name'].str.len().idxmax(), 'name'],
        'email': rows['email'].iloc[0],
        'phone': rows['phone'].iloc[0],
        'revenue': rows['revenue'].sum(),
    }
    merged.append(merged_record)
    processed.update(group)

# Add non-duplicate records
for i, row in customers.iterrows():
    if i not in processed:
        merged.append({
            'name': row['name'],
            'email': row['email'],
            'phone': row['phone'],
            'revenue': row['revenue'],
        })

df_clean = pd.DataFrame(merged)
print(f"\nBefore dedup: {len(customers)} records")
print(f"After dedup: {len(df_clean)} records")
print(f"Revenue before: ${customers['revenue'].sum()}")
print(f"Revenue after: ${df_clean['revenue'].sum()}")
print(f"\nCleaned data:")
print(df_clean.to_string(index=False))
```

---

## Record Linkage

```python
# record_linkage.py — Matching records across different datasets
import pandas as pd
from thefuzz import fuzz

# Two datasets with overlapping but differently formatted records
dataset_a = pd.DataFrame({
    'name': ['Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown'],
    'city': ['New York', 'Los Angeles', 'Chicago', 'Houston'],
    'amount_a': [5000, 3000, 7000, 2000],
})

dataset_b = pd.DataFrame({
    'full_name': ['A. Johnson', 'Robert Smith', 'Carol W.', 'Dave Brown', 'Eve Davis'],
    'location': ['NYC', 'LA', 'Chicago, IL', 'Houston, TX', 'Seattle'],
    'amount_b': [4500, 2800, 6500, 1800, 3500],
})

print("=== RECORD LINKAGE ===\n")
print("Dataset A:")
print(dataset_a.to_string(index=False))
print("\nDataset B:")
print(dataset_b.to_string(index=False))

# City normalization for blocking
city_aliases = {
    'new york': 'new york', 'nyc': 'new york',
    'los angeles': 'los angeles', 'la': 'los angeles',
    'chicago': 'chicago', 'chicago, il': 'chicago',
    'houston': 'houston', 'houston, tx': 'houston',
}

dataset_a['city_norm'] = dataset_a['city'].str.lower().map(city_aliases)
dataset_b['city_norm'] = dataset_b['location'].str.lower().map(city_aliases)

# Match records
links = []
for i, row_a in dataset_a.iterrows():
    best_score = 0
    best_j = None

    for j, row_b in dataset_b.iterrows():
        # Block on city (only compare same city)
        if row_a['city_norm'] != row_b['city_norm']:
            continue

        # Fuzzy match on name
        name_score = fuzz.token_set_ratio(
            row_a['name'].lower(),
            row_b['full_name'].lower()
        )

        if name_score > best_score:
            best_score = name_score
            best_j = j

    if best_j is not None and best_score >= 60:
        links.append({
            'name_a': row_a['name'],
            'name_b': dataset_b.loc[best_j, 'full_name'],
            'match_score': best_score,
            'amount_a': row_a['amount_a'],
            'amount_b': dataset_b.loc[best_j, 'amount_b'],
        })

print(f"\n--- Linked Records ---")
links_df = pd.DataFrame(links)
print(links_df.to_string(index=False))
```

::: tip Record Linkage at Scale
For datasets with > 10,000 records, pairwise fuzzy matching is O(n^2) and too slow. Use **blocking** (only compare records in the same city/state/zip) and **indexing** (sorted neighborhood, TF-IDF on name tokens) to reduce comparisons. Libraries: `recordlinkage`, `dedupe`, `splink`.
:::

---

## Summary

| Technique | When to Use | Key Tool |
|-----------|-------------|----------|
| Whitespace normalization | Always, as first step | `str.strip()`, `re.sub(r'\s+', ' ')` |
| Case normalization | Always | `str.lower()` or `str.title()` |
| Regex extraction | Structured patterns (email, phone, date) | `re.search()`, `str.extract()` |
| Fuzzy matching | Similar but not identical strings | `thefuzz.fuzz.token_set_ratio()` |
| Deduplication | Same entity appears multiple times | Block + fuzzy match + merge |
| Record linkage | Matching across different datasets | Blocking + scoring + threshold |

---

## What's Next

| Page | What You'll Learn |
|------|------------------|
| [Data Cleaning — Dates](/eda/data-cleaning-dates) | Datetime parsing, timezones, DST |
| [Data Cleaning — Categories](/eda/data-cleaning-categories) | Inconsistent category standardization |
| [Data Cleaning — Edge Cases](/eda/data-cleaning-edge-cases) | Encoding issues, NaN vs None |
