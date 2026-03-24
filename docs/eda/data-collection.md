---
title: "Data Collection"
description: "Data acquisition for EDA — web scraping with BeautifulSoup, REST APIs with requests, database connections with SQLAlchemy, file format pitfalls (CSV, Parquet, Excel), and sampling bias awareness."
tags: [eda, data-collection, web-scraping, apis, file-formats]
difficulty: intermediate
prerequisites: [eda/data-types-deep-dive, eda/data-shapes-structures]
lastReviewed: "2026-03-24"
---

# Data Collection

EDA starts the moment you acquire data — not after. How you collect data determines what biases are baked in, what types get misread, and what information is silently lost. A CSV loaded with wrong encoding corrupts every downstream analysis. An API that paginates silently gives you incomplete data. A SQL query with an implicit filter hides the full picture.

This page covers the four main data acquisition methods (scraping, APIs, databases, files), the pitfalls unique to each, and the sampling biases you must watch for regardless of source.

---

## Data Acquisition Overview

```mermaid
flowchart TD
    A["Need Data"] --> B{{"Where is it?"}}

    B -->|"On the web"| C["Web Scraping<br/>(BeautifulSoup, Scrapy)"]
    B -->|"Behind an API"| D["REST API<br/>(requests, httpx)"]
    B -->|"In a database"| E["SQL Query<br/>(SQLAlchemy, psycopg2)"]
    B -->|"In files"| F["File Loading<br/>(pandas, pyarrow)"]

    C --> G["Validate<br/>completeness"]
    D --> G
    E --> G
    F --> G

    G --> H["Profile<br/>(Step 2 of EDA)"]

    style C fill:#2563eb,color:#fff
    style D fill:#7c3aed,color:#fff
    style E fill:#059669,color:#fff
    style F fill:#f97316,color:#fff
```

---

## Web Scraping with BeautifulSoup

```python
# web_scraping.py — Structured approach to scraping
from bs4 import BeautifulSoup
import requests
import pandas as pd
import time

# Example: Scrape a table from Wikipedia
url = "https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)"
headers = {'User-Agent': 'Mozilla/5.0 (Research Bot; educational)'}

try:
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
except requests.RequestException as e:
    print(f"Request failed: {e}")
    # Always have a fallback for scraping code
    response = None

if response:
    soup = BeautifulSoup(response.text, 'html.parser')

    # Find all tables
    tables = soup.find_all('table', class_='wikitable')
    print(f"Found {len(tables)} tables on the page")

    # Parse the first table
    if tables:
        # Use pandas read_html for table extraction (easier than manual parsing)
        dfs = pd.read_html(str(tables[0]))
        df = dfs[0]
        print(f"\nTable shape: {df.shape}")
        print(f"Columns: {df.columns.tolist()}")
        print(df.head())

# Scraping best practices
print("\n=== WEB SCRAPING CHECKLIST ===")
checklist = [
    "Check robots.txt before scraping",
    "Set a descriptive User-Agent",
    "Respect rate limits (time.sleep between requests)",
    "Handle HTTP errors (404, 429, 500)",
    "Validate scraped data immediately",
    "Store raw HTML alongside parsed data",
    "Log failed requests for debugging",
    "Check for anti-scraping measures (CAPTCHAs, IP blocks)",
]
for item in checklist:
    print(f"  [ ] {item}")
```

### Scraping Pitfalls

```python
# scraping_pitfalls.py — Common issues when scraping
import pandas as pd

# Pitfall 1: Inconsistent HTML structures
print("=== PITFALL 1: Inconsistent HTML ===")
print("Pages can change structure between requests or over time.")
print("Fix: Use robust selectors (class/id) not positional (nth-child).\n")

# Pitfall 2: JavaScript-rendered content
print("=== PITFALL 2: JavaScript Content ===")
print("BeautifulSoup only sees static HTML, not JS-rendered content.")
print("Fix: Use Selenium or Playwright for dynamic pages.\n")

# Pitfall 3: Encoding issues
print("=== PITFALL 3: Encoding ===")
# Simulate encoding corruption
original = "Caf\u00e9 M\u00fcnchen Stra\u00dfe"
print(f"Original: {original}")
# If scraped with wrong encoding:
try:
    corrupted = original.encode('utf-8').decode('latin-1')
    print(f"Wrong encoding: {corrupted}")
except:
    print("Encoding mismatch detected")
print("Fix: Check response.encoding; use response.apparent_encoding as fallback.\n")

# Pitfall 4: Missing pagination
print("=== PITFALL 4: Pagination ===")
print("Many sites show only 20-50 results per page.")
print("If you scrape page 1 only, you have incomplete data.")
print("Fix: Always check for 'next page' links or page count indicators.")
```

---

## REST APIs with Requests

```python
# api_collection.py — Proper API data collection
import requests
import pandas as pd
import time

# Example: Fetch data from a public API (JSONPlaceholder for demo)
base_url = "https://jsonplaceholder.typicode.com"

# Pattern 1: Simple GET request
response = requests.get(f"{base_url}/posts", timeout=10)
posts = pd.DataFrame(response.json())
print(f"=== API: Simple GET ===")
print(f"Status: {response.status_code}")
print(f"Posts fetched: {len(posts)}")
print(posts.head())

# Pattern 2: Paginated API (many APIs paginate)
def fetch_paginated(base_url, endpoint, per_page=100, max_pages=10):
    """Fetch all pages from a paginated API."""
    all_data = []
    for page in range(1, max_pages + 1):
        response = requests.get(
            f"{base_url}/{endpoint}",
            params={'_page': page, '_limit': per_page},
            timeout=10
        )
        if response.status_code != 200:
            print(f"Error on page {page}: {response.status_code}")
            break

        data = response.json()
        if not data:  # Empty page = no more data
            break

        all_data.extend(data)
        print(f"  Page {page}: {len(data)} records")

        # Respect rate limits
        time.sleep(0.5)

    return pd.DataFrame(all_data)

print(f"\n=== API: Paginated Fetch ===")
all_posts = fetch_paginated(base_url, "posts", per_page=20, max_pages=5)
print(f"Total records: {len(all_posts)}")

# Pattern 3: API with authentication and error handling
def fetch_with_auth(url, api_key=None, max_retries=3):
    """Fetch with authentication, retries, and error handling."""
    headers = {}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
    headers['Accept'] = 'application/json'

    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                return response.json()
            elif response.status_code == 429:
                # Rate limited — wait and retry
                retry_after = int(response.headers.get('Retry-After', 60))
                print(f"Rate limited. Waiting {retry_after}s...")
                time.sleep(retry_after)
            elif response.status_code == 401:
                raise ValueError("Invalid API key")
            elif response.status_code == 404:
                raise ValueError(f"Endpoint not found: {url}")
            else:
                print(f"HTTP {response.status_code} on attempt {attempt + 1}")
                time.sleep(2 ** attempt)  # Exponential backoff

        except requests.Timeout:
            print(f"Timeout on attempt {attempt + 1}")
            time.sleep(2 ** attempt)
        except requests.ConnectionError:
            print(f"Connection error on attempt {attempt + 1}")
            time.sleep(5)

    raise RuntimeError(f"Failed after {max_retries} attempts")

# Pattern 4: Validate API response
print(f"\n=== API: Response Validation ===")
def validate_api_response(data, expected_fields, expected_types=None):
    """Validate API response structure."""
    if isinstance(data, list):
        if len(data) == 0:
            print("  WARNING: Empty response")
            return False
        sample = data[0]
    else:
        sample = data

    missing = [f for f in expected_fields if f not in sample]
    if missing:
        print(f"  MISSING fields: {missing}")
        return False

    if expected_types:
        for field, expected_type in expected_types.items():
            if field in sample and not isinstance(sample[field], expected_type):
                print(f"  TYPE MISMATCH: {field} is {type(sample[field])}, "
                      f"expected {expected_type}")
                return False

    print("  Validation PASSED")
    return True

validate_api_response(
    posts.to_dict('records'),
    expected_fields=['userId', 'id', 'title', 'body'],
    expected_types={'userId': int, 'id': int, 'title': str}
)
```

---

## Database Connections with SQLAlchemy

```python
# database_collection.py — Database queries for EDA
from sqlalchemy import create_engine, text
import pandas as pd

# Connection patterns for different databases
connection_strings = {
    'PostgreSQL': 'postgresql://user:pass@localhost:5432/dbname',
    'MySQL':      'mysql+pymysql://user:pass@localhost:3306/dbname',
    'SQLite':     'sqlite:///path/to/database.db',
    'SQL Server': 'mssql+pyodbc://user:pass@server/db?driver=ODBC+Driver+17',
}

print("=== DATABASE CONNECTION PATTERNS ===")
for db, conn in connection_strings.items():
    print(f"  {db:>12}: {conn}")

# SQLite example (runs anywhere without setup)
engine = create_engine('sqlite:///:memory:')

# Create sample data
sample_data = pd.DataFrame({
    'id': range(1, 10001),
    'customer_name': [f'Customer_{i}' for i in range(1, 10001)],
    'revenue': [float(x) for x in __import__('numpy').random.lognormal(5, 1, 10000)],
    'signup_date': pd.date_range('2023-01-01', periods=10000, freq='h'),
    'region': __import__('numpy').random.choice(['East', 'West', 'North', 'South'], 10000).tolist(),
})
sample_data.to_sql('customers', engine, index=False, if_exists='replace')

# EDA-oriented queries
print("\n=== EDA SQL QUERIES ===")

# Query 1: Quick profile
with engine.connect() as conn:
    result = conn.execute(text("""
        SELECT
            COUNT(*) as row_count,
            COUNT(DISTINCT customer_name) as unique_customers,
            COUNT(DISTINCT region) as unique_regions,
            MIN(signup_date) as earliest_signup,
            MAX(signup_date) as latest_signup
        FROM customers
    """))
    profile = result.fetchone()
    print(f"\nTable Profile:")
    print(f"  Rows: {profile[0]:,}")
    print(f"  Unique customers: {profile[1]:,}")
    print(f"  Regions: {profile[2]}")
    print(f"  Date range: {profile[3]} to {profile[4]}")

# Query 2: Distribution summary
df_summary = pd.read_sql("""
    SELECT
        region,
        COUNT(*) as n,
        ROUND(AVG(revenue), 2) as avg_revenue,
        ROUND(MIN(revenue), 2) as min_revenue,
        ROUND(MAX(revenue), 2) as max_revenue
    FROM customers
    GROUP BY region
    ORDER BY avg_revenue DESC
""", engine)
print(f"\nRevenue by Region:")
print(df_summary.to_string(index=False))

# Query 3: Load only what you need (memory efficiency)
print(f"\n=== CHUNKED LOADING ===")
chunks = pd.read_sql("SELECT * FROM customers", engine, chunksize=2000)
total_rows = 0
for i, chunk in enumerate(chunks):
    total_rows += len(chunk)
    print(f"  Chunk {i+1}: {len(chunk)} rows, "
          f"memory = {chunk.memory_usage(deep=True).sum() / 1024:.1f} KB")
print(f"Total rows processed: {total_rows:,}")
```

::: warning SQL Injection in EDA Code
Even in exploratory notebooks, never concatenate user input into SQL strings. Use parameterized queries: `pd.read_sql("SELECT * FROM t WHERE id = :id", engine, params={"id": user_id})`. It takes 5 seconds and prevents catastrophic data loss.
:::

---

## File Format Pitfalls

### CSV: The Most Dangerous Format

```python
# csv_pitfalls.py — Everything that can go wrong with CSV
import pandas as pd
import numpy as np
import io

# Pitfall 1: Encoding
print("=== CSV PITFALL 1: Encoding ===")
# Many CSVs from Europe/Asia use different encodings
encodings_to_try = ['utf-8', 'latin-1', 'cp1252', 'utf-8-sig', 'iso-8859-1']
print(f"If pd.read_csv fails with UnicodeDecodeError, try: {encodings_to_try}")
print("Or auto-detect: import chardet; chardet.detect(open(f, 'rb').read())\n")

# Pitfall 2: Delimiter confusion
print("=== CSV PITFALL 2: Delimiters ===")
csv_semicolon = "name;age;city\nAlice;30;New York\nBob;25;Los Angeles"
# Default read_csv assumes comma — this gives ONE column
df_wrong = pd.read_csv(io.StringIO(csv_semicolon))
df_right = pd.read_csv(io.StringIO(csv_semicolon), sep=';')
print(f"With comma delimiter: {df_wrong.shape} columns (WRONG)")
print(f"With semicolon delimiter: {df_right.shape} columns (CORRECT)\n")

# Pitfall 3: Type coercion
print("=== CSV PITFALL 3: Type Coercion ===")
csv_types = "id,zip,phone,value\n1,01234,0012345,100\n2,90210,5551234,200"
df_auto = pd.read_csv(io.StringIO(csv_types))
print(f"Auto-detected types:\n{df_auto.dtypes}")
print(f"ZIP '01234' became: {df_auto['zip'].iloc[0]} (leading zero LOST!)")
print(f"Phone '0012345' became: {df_auto['phone'].iloc[0]} (leading zeros LOST!)")

# Fix: specify dtypes
df_fixed = pd.read_csv(io.StringIO(csv_types),
                         dtype={'zip': str, 'phone': str})
print(f"\nWith dtype=str:")
print(f"ZIP: '{df_fixed['zip'].iloc[0]}' (leading zero preserved)")
print(f"Phone: '{df_fixed['phone'].iloc[0]}' (leading zeros preserved)\n")

# Pitfall 4: Quoted fields with commas
print("=== CSV PITFALL 4: Commas in Fields ===")
csv_commas = 'name,address,city\nAlice,"123 Main St, Apt 4",New York\nBob,"456 Oak Ave",LA'
df_commas = pd.read_csv(io.StringIO(csv_commas))
print(df_commas)
print("pandas handles quoted fields correctly, but Excel exports can mangle them.\n")

# Pitfall 5: Multiline fields
print("=== CSV PITFALL 5: Newlines in Fields ===")
print("Fields with embedded newlines break naive line-counting.")
print("wc -l myfile.csv != number of rows!")
print("Use: len(pd.read_csv('myfile.csv')) for accurate count.")
```

### Parquet: The Better Default

```python
# parquet_vs_csv.py — Why Parquet is better for analytics
import pandas as pd
import numpy as np
import time

np.random.seed(42)
n = 500_000

# Create a realistic DataFrame
df = pd.DataFrame({
    'id': range(n),
    'category': np.random.choice(['A', 'B', 'C', 'D', 'E'], n),
    'value': np.random.normal(100, 25, n),
    'timestamp': pd.date_range('2024-01-01', periods=n, freq='min'),
    'flag': np.random.choice([True, False], n),
})

# Save as CSV
csv_path = '/tmp/test_data.csv'
t0 = time.time()
df.to_csv(csv_path, index=False)
csv_write_time = time.time() - t0

# Save as Parquet
parquet_path = '/tmp/test_data.parquet'
t0 = time.time()
df.to_parquet(parquet_path, index=False)
parquet_write_time = time.time() - t0

# Read CSV
t0 = time.time()
df_csv = pd.read_csv(csv_path)
csv_read_time = time.time() - t0

# Read Parquet
t0 = time.time()
df_parquet = pd.read_parquet(parquet_path)
parquet_read_time = time.time() - t0

# Compare
import os
csv_size = os.path.getsize(csv_path) / 1024**2
parquet_size = os.path.getsize(parquet_path) / 1024**2

print("=== CSV vs PARQUET COMPARISON ===")
comparison = pd.DataFrame({
    'Metric': ['File size (MB)', 'Write time (s)', 'Read time (s)',
               'Preserves types', 'Preserves dates', 'Column selection'],
    'CSV': [f'{csv_size:.1f}', f'{csv_write_time:.2f}', f'{csv_read_time:.2f}',
            'No', 'No (become strings)', 'No (reads all)'],
    'Parquet': [f'{parquet_size:.1f}', f'{parquet_write_time:.2f}',
                f'{parquet_read_time:.2f}',
                'Yes', 'Yes (native datetime)', 'Yes (column pruning)'],
})
print(comparison.to_string(index=False))

# Parquet column selection (read only what you need)
t0 = time.time()
df_subset = pd.read_parquet(parquet_path, columns=['category', 'value'])
subset_time = time.time() - t0
print(f"\nParquet column selection (2 of 5 columns): {subset_time:.3f}s")
print(f"CSV must read ALL columns even if you only need 2")
```

### Excel Gotchas

```python
# excel_gotchas.py — Excel-specific data corruption issues
import pandas as pd
import numpy as np

print("=== EXCEL GOTCHAS ===\n")

gotchas = [
    {
        "issue": "Dates auto-formatted",
        "example": "Gene names like 'MARCH1' become 'Mar-01' (March 1st)",
        "severity": "Critical in genomics — published papers retracted",
        "fix": "Format cells as 'Text' BEFORE entering data, or use CSV",
    },
    {
        "issue": "Large numbers lose precision",
        "example": "ID 123456789012345 becomes 123456789012350 (15+ digits truncated)",
        "severity": "High — corrupts IDs, phone numbers, credit card numbers",
        "fix": "Store as text, or use CSV with dtype=str in pandas",
    },
    {
        "issue": "Leading zeros stripped",
        "example": "ZIP code '01234' becomes 1234",
        "severity": "High — 10% of US ZIP codes start with 0",
        "fix": "Store as text in Excel or load with dtype=str",
    },
    {
        "issue": "Hidden characters",
        "example": "Non-breaking spaces, zero-width characters from web copy-paste",
        "severity": "Medium — causes string matching failures",
        "fix": "df['col'].str.replace(r'\\s+', ' ', regex=True).str.strip()",
    },
    {
        "issue": "Multiple sheets / headers",
        "example": "Data starts on row 5, merged cells in header",
        "severity": "Medium — pandas reads garbage rows",
        "fix": "pd.read_excel('file.xlsx', sheet_name='Data', header=4, skiprows=3)",
    },
    {
        "issue": "1048576 row limit",
        "example": "Files with > 1M rows silently truncated",
        "severity": "Critical — you analyze a subset thinking it is complete",
        "fix": "Check row count vs expected. Use Parquet/CSV for large datasets.",
    },
]

for g in gotchas:
    print(f"ISSUE: {g['issue']}")
    print(f"  Example: {g['example']}")
    print(f"  Severity: {g['severity']}")
    print(f"  Fix: {g['fix']}\n")
```

---

## Sampling Bias

Regardless of how you collect data, you must think about what your data represents — and what it does not.

```python
# sampling_bias.py — Types of sampling bias and how to detect them
import pandas as pd
import numpy as np

np.random.seed(42)

# The full population
n_population = 100_000
population = pd.DataFrame({
    'age': np.random.normal(40, 15, n_population).clip(18, 85).astype(int),
    'income': np.random.lognormal(10.5, 0.8, n_population),
    'has_smartphone': np.random.binomial(1, 0.85, n_population),
    'health_score': np.random.normal(70, 15, n_population),
})
# Younger people are healthier and have smartphones
population['health_score'] += (40 - population['age']) * 0.3
population['has_smartphone'] = np.where(
    population['age'] < 50,
    np.random.binomial(1, 0.95, n_population),
    np.random.binomial(1, 0.60, n_population)
)

print("=== TRUE POPULATION ===")
print(f"Mean age: {population['age'].mean():.1f}")
print(f"Mean income: ${population['income'].mean():,.0f}")
print(f"Smartphone ownership: {population['has_smartphone'].mean():.1%}")
print(f"Mean health score: {population['health_score'].mean():.1f}")

# Bias 1: Selection bias (online survey)
print("\n=== BIAS 1: Selection Bias (Online Survey) ===")
online_sample = population[population['has_smartphone'] == 1].sample(1000, random_state=42)
print(f"Mean age: {online_sample['age'].mean():.1f} (pop: {population['age'].mean():.1f})")
print(f"Mean health: {online_sample['health_score'].mean():.1f} (pop: {population['health_score'].mean():.1f})")
print("Online surveys over-represent young, healthy, tech-savvy people!")

# Bias 2: Survivorship bias (only active customers)
print("\n=== BIAS 2: Survivorship Bias (Active Customers Only) ===")
population['churned'] = np.where(
    population['health_score'] < 60,
    np.random.binomial(1, 0.6, n_population),
    np.random.binomial(1, 0.1, n_population)
)
active_customers = population[population['churned'] == 0].sample(1000, random_state=42)
print(f"Active mean health: {active_customers['health_score'].mean():.1f}")
print(f"Full pop mean health: {population['health_score'].mean():.1f}")
print("Analyzing only active customers overestimates health scores!")

# Bias 3: Temporal bias
print("\n=== BIAS 3: Temporal Bias ===")
print("Data from December is not representative of June.")
print("Holiday shopping ≠ normal shopping. Flu season ≠ summer health.")
print("Always check: does your data span the full time period of interest?")

# Summary
print("\n=== SAMPLING BIAS TYPES ===")
biases = pd.DataFrame({
    'Type': ['Selection bias', 'Survivorship bias', 'Temporal bias',
             'Volunteer bias', 'Recall bias', 'Attrition bias'],
    'Description': [
        'Sample is not random from population',
        'Only survivors/successes are in the data',
        'Data time period is not representative',
        'Volunteers differ from non-volunteers',
        'Self-reported data is inaccurate',
        'Different dropout rates between groups',
    ],
    'Detection': [
        'Compare sample demographics to known population stats',
        'Ask: what is MISSING from this dataset?',
        'Check date ranges, seasonal patterns',
        'Compare response rate across segments',
        'Cross-validate with objective measures',
        'Track dropout rates per cohort',
    ],
})
print(biases.to_string(index=False))
```

```mermaid
flowchart TD
    A["Your Dataset"] --> B{{"Who is NOT<br/>in the data?"}}
    B --> C["People without internet<br/>(online surveys)"]
    B --> D["Failed companies<br/>(success analysis)"]
    B --> E["Churned users<br/>(active user DB)"]
    B --> F["Non-respondents<br/>(survey data)"]

    C --> G["Your analysis may<br/>be biased"]
    D --> G
    E --> G
    F --> G

    G --> H["Acknowledge limitations<br/>in your report"]

    style G fill:#dc2626,color:#fff
    style H fill:#22c55e,color:#fff
```

::: danger The Most Important EDA Question You Can Ask
"Who is NOT in this dataset?" Every dataset excludes someone. Online surveys exclude the digitally disconnected. Hospital records exclude the healthy. App analytics exclude non-users. If your conclusions do not account for who is missing, they may be completely wrong.
:::

---

## Data Collection Decision Guide

| Source | Speed | Quality | Cost | Best For |
|--------|-------|---------|------|----------|
| Internal DB | Fast | High | Free | Production data, metrics |
| Public API | Medium | Medium-High | Free-$$ | Third-party data, enrichment |
| Web scraping | Slow | Variable | Free | Data not available via API |
| CSV/Excel files | Fast | Variable | Free | Ad-hoc analysis, exports |
| Parquet/Arrow | Fast | High | Free | Analytical workloads |
| Paid data vendors | Medium | High | $$$ | Market data, demographics |

---

## Summary

| Concept | Key Takeaway |
|---------|-------------|
| Web scraping | Check robots.txt, handle errors, validate completeness |
| APIs | Handle pagination, rate limits, and auth; validate response schema |
| Databases | Use parameterized queries, chunked loading for large tables |
| CSV pitfalls | Encoding, delimiters, type coercion, and leading zeros |
| Parquet advantage | 3-10x smaller, 5-10x faster, preserves types |
| Excel gotchas | Date auto-formatting, precision loss, 1M row limit |
| Sampling bias | Always ask "who is NOT in this dataset?" |

---

## What's Next

| Page | What You'll Learn |
|------|------------------|
| [Data Profiling](/eda/data-profiling) | Your first 15 minutes with any dataset |
| [Data Quality Validation](/eda/data-quality-validation) | Pandera, Great Expectations, constraint checking |
| [Data Cleaning — Edge Cases](/eda/data-cleaning-edge-cases) | Encoding issues, mixed types, NaN vs None |
