---
title: "Pandera Schema Validation"
description: "Lightweight DataFrame validation with Pandera — DataFrameSchema, column checks, hypothesis tests, schema inference, lazy validation, integration with pandas and Polars, and CI/CD pipeline integration for data quality gates."
tags: [pandera, data-validation, schema, pandas, python]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Pandera Schema Validation

Pandera is a lightweight, Pythonic library for validating pandas DataFrames. Where Great Expectations is a full platform with configuration, checkpoints, and HTML reports, Pandera is a library that integrates directly into your Python code. You define schemas as Python classes, validate DataFrames with a single function call, and get clear error messages when validation fails. It is the fastest path from "no validation" to "validated pipeline."

---

## Why Pandera over Great Expectations

| Aspect | Pandera | Great Expectations |
|--------|---------|-------------------|
| Learning curve | 15 minutes | 2-3 hours |
| Setup | `pip install pandera` | Project initialization |
| Integration style | Python code, decorators | Configuration files, checkpoints |
| Best for | In-code validation | Platform-level validation |
| HTML reports | No (use with pytest) | Yes (Data Docs) |
| Complexity | Simple | Full-featured |

Use Pandera when: you want validation embedded in your Python pipeline code.
Use Great Expectations when: you need a validation platform with reporting and alerting.

---

## DataFrameSchema Basics

```python
# schema_basics.py — Define and validate DataFrame schemas
import pandera as pa
from pandera import Column, Check, Index, DataFrameSchema
import pandas as pd
import numpy as np


# Method 1: Object-based schema definition
product_schema = DataFrameSchema(
    columns={
        "id": Column(
            int,
            checks=[
                Check.greater_than(0),
                Check.unique(),  # CUSTOM: removed Check() alias
            ],
            nullable=False,
        ),
        "name": Column(
            str,
            checks=[
                Check.str_length(min_value=1, max_value=500),
            ],
            nullable=False,
        ),
        "price": Column(
            float,
            checks=[
                Check.greater_than_or_equal_to(0),
                Check.less_than(1_000_000),
            ],
            nullable=False,
        ),
        "category": Column(
            str,
            checks=[
                Check.isin(["electronics", "clothing", "food", "books", "home"]),
            ],
            nullable=True,
        ),
        "rating": Column(
            float,
            checks=[
                Check.in_range(0, 5),
            ],
            nullable=True,
        ),
        "created_at": Column(
            "datetime64[ns]",
            nullable=False,
        ),
    },
    # DataFrame-level checks
    checks=[
        Check(lambda df: len(df) > 0, error="DataFrame must not be empty"),
        Check(lambda df: df["price"].mean() < 10000, error="Average price too high"),
    ],
    index=Index(int),
    coerce=True,  # Auto-coerce types before validation
    strict=False,  # Allow extra columns not in schema
)


# Validate
df = pd.DataFrame({
    "id": [1, 2, 3],
    "name": ["Widget", "Gadget", "Doohickey"],
    "price": [19.99, 29.99, 9.99],
    "category": ["electronics", "electronics", "home"],
    "rating": [4.5, 3.8, 4.2],
    "created_at": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-01-03"]),
})

validated_df = product_schema.validate(df)
print("Validation passed!")


# Method 2: Class-based schema (recommended for complex schemas)
class ProductSchema(pa.DataFrameModel):
    """Schema for product data using class-based API."""

    id: pa.typing.Series[int] = pa.Field(gt=0, unique=True, nullable=False)
    name: pa.typing.Series[str] = pa.Field(str_length={"min_value": 1, "max_value": 500}, nullable=False)
    price: pa.typing.Series[float] = pa.Field(ge=0, lt=1_000_000, nullable=False)
    category: pa.typing.Series[str] = pa.Field(
        isin=["electronics", "clothing", "food", "books", "home"],
        nullable=True,
    )
    rating: pa.typing.Series[float] = pa.Field(ge=0, le=5, nullable=True)
    created_at: pa.typing.Series[pa.DateTime] = pa.Field(nullable=False)

    class Config:
        coerce = True
        strict = False

    @pa.check("price")
    def price_not_suspiciously_round(cls, series: pd.Series) -> pd.Series:
        """Flag prices that are exactly round numbers (possible placeholders)."""
        return series % 1 != 0  # At least some should have decimals

    @pa.dataframe_check
    def at_least_one_row(cls, df: pd.DataFrame) -> bool:
        return len(df) > 0


# Validate with class-based schema
validated = ProductSchema.validate(df)
```

---

## Column Checks

```python
# column_checks.py — Every type of column check
import pandera as pa
from pandera import Column, Check
import pandas as pd
import numpy as np


# Built-in checks
comprehensive_schema = pa.DataFrameSchema({
    # Numeric checks
    "age": Column(int, [
        Check.greater_than_or_equal_to(0),
        Check.less_than_or_equal_to(150),
        Check.not_equal_to(-1),  # Sentinel value check
    ]),

    "score": Column(float, [
        Check.in_range(0, 100),
        Check(lambda s: s.std() > 0, error="Score has zero variance"),
    ]),

    # String checks
    "email": Column(str, [
        Check.str_matches(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"),
        Check.str_length(min_value=5, max_value=254),
    ]),

    "phone": Column(str, [
        Check.str_matches(r"^\+?1?\d{10,11}$"),
    ], nullable=True),

    "country_code": Column(str, [
        Check.str_length(min_value=2, max_value=2),
        Check.str_matches(r"^[A-Z]{2}$"),
    ]),

    # Categorical checks
    "status": Column(str, [
        Check.isin(["active", "inactive", "pending", "suspended"]),
    ]),

    # Date checks
    "created_at": Column("datetime64[ns]", [
        Check.greater_than(pd.Timestamp("2020-01-01")),
        Check.less_than(pd.Timestamp("2030-01-01")),
    ]),

    # Custom lambda checks
    "balance": Column(float, [
        Check(
            lambda s: (s >= 0).mean() > 0.95,
            error="More than 5% of balances are negative",
        ),
    ]),
})


# Custom reusable checks
def check_no_whitespace_padding(series: pd.Series) -> pd.Series:
    """Check that strings have no leading/trailing whitespace."""
    return series.apply(
        lambda x: x == x.strip() if isinstance(x, str) else True
    )

def check_monotonically_increasing(series: pd.Series) -> bool:
    """Check that values are monotonically increasing."""
    return series.is_monotonic_increasing

no_whitespace = Check(check_no_whitespace_padding, element_wise=False)
monotonic = Check(check_monotonically_increasing, element_wise=False)

# Apply custom checks
clean_schema = pa.DataFrameSchema({
    "name": Column(str, [no_whitespace]),
    "timestamp": Column("datetime64[ns]", [monotonic]),
})
```

---

## Hypothesis Tests

```python
# hypothesis_tests.py — Statistical hypothesis testing in schemas
import pandera as pa
from pandera import Column, Check, Hypothesis
import pandas as pd
import numpy as np


schema_with_hypotheses = pa.DataFrameSchema({
    "group": Column(str, Check.isin(["control", "treatment"])),
    "value": Column(float),
    "category": Column(str, Check.isin(["A", "B", "C"])),
}, checks=[
    # Two-sample t-test: treatment group should not differ
    # significantly from control (p > 0.05)
    Hypothesis.two_sample_ttest(
        sample1="value",
        sample2="value",
        groupby="group",
        relationship="equal",
        alpha=0.05,
    ),
])


# Custom hypothesis checks
class ExperimentSchema(pa.DataFrameModel):
    group: pa.typing.Series[str] = pa.Field(isin=["control", "treatment"])
    conversion: pa.typing.Series[int] = pa.Field(isin=[0, 1])
    revenue: pa.typing.Series[float] = pa.Field(ge=0)

    @pa.dataframe_check
    def balanced_groups(cls, df: pd.DataFrame) -> bool:
        """Groups should be approximately balanced (within 10%)."""
        counts = df["group"].value_counts()
        if len(counts) < 2:
            return False
        ratio = counts.min() / counts.max()
        return ratio > 0.9

    @pa.dataframe_check
    def minimum_sample_size(cls, df: pd.DataFrame) -> bool:
        """Each group should have at least 100 observations."""
        counts = df["group"].value_counts()
        return counts.min() >= 100
```

---

## Schema Inference

```python
# schema_inference.py — Auto-generate schemas from data
import pandera as pa
import pandas as pd
import json


def infer_and_export_schema(df: pd.DataFrame) -> pa.DataFrameSchema:
    """
    Infer a schema from data — starting point for refinement.

    WARNING: Inferred schemas are a starting point only.
    Always review and tighten constraints manually.
    """
    schema = pa.infer_schema(df)

    # Print the inferred schema as Python code
    print(schema.to_script())

    # Export as YAML for version control
    yaml_str = schema.to_yaml()
    print(yaml_str)

    return schema


def schema_from_yaml(yaml_path: str) -> pa.DataFrameSchema:
    """Load schema from YAML file (version-controlled)."""
    return pa.DataFrameSchema.from_yaml(yaml_path)


# Example YAML schema
YAML_SCHEMA = """
schema_type: dataframe
version: 0.18.0
columns:
  id:
    dtype: int64
    nullable: false
    checks:
      greater_than: 0
    unique: true
  name:
    dtype: str
    nullable: false
    checks:
      str_length:
        min_value: 1
        max_value: 500
  price:
    dtype: float64
    nullable: false
    checks:
      greater_than_or_equal_to: 0
      less_than: 1000000
  category:
    dtype: str
    nullable: true
    checks:
      isin:
        - electronics
        - clothing
        - food
        - books
coerce: true
strict: false
"""
```

---

## Lazy Validation

```python
# lazy_validation.py — Collect all errors instead of failing on first
import pandera as pa
from pandera import Column, Check
from pandera.errors import SchemaErrors
import pandas as pd


schema = pa.DataFrameSchema({
    "id": Column(int, Check.greater_than(0), nullable=False),
    "name": Column(str, Check.str_length(min_value=1), nullable=False),
    "price": Column(float, Check.greater_than_or_equal_to(0), nullable=False),
    "email": Column(str, Check.str_matches(r".+@.+\..+"), nullable=True),
})


# Bad data with multiple issues
bad_df = pd.DataFrame({
    "id": [1, -2, 3, 0],         # -2 and 0 violate > 0
    "name": ["Widget", "", None, "OK"],  # "" and None violate constraints
    "price": [19.99, -5.0, 29.99, 0],   # -5.0 violates >= 0
    "email": ["a@b.com", "invalid", None, "c@d.com"],  # "invalid" fails regex
})


# Lazy validation: collect ALL errors
try:
    schema.validate(bad_df, lazy=True)
except SchemaErrors as e:
    print(f"Found {len(e.failure_cases)} validation failures:\n")

    # DataFrame of all failures
    failure_df = e.failure_cases
    print(failure_df.to_string())

    # Structured access to errors
    for _, failure in failure_df.iterrows():
        print(
            f"  Column: {failure.get('column', 'N/A')}, "
            f"  Check: {failure.get('check', 'N/A')}, "
            f"  Index: {failure.get('index', 'N/A')}, "
            f"  Value: {failure.get('failure_case', 'N/A')}"
        )

    # Get the error DataFrame for programmatic handling
    # e.failure_cases is a DataFrame with columns:
    # schema_context, column, check, check_number, failure_case, index
```

---

## Decorator-Based Validation

```python
# decorator_validation.py — Validate function inputs/outputs automatically
import pandera as pa
from pandera.typing import DataFrame
import pandas as pd


class InputSchema(pa.DataFrameModel):
    """Schema for raw input data."""
    id: pa.typing.Series[int] = pa.Field(gt=0)
    name: pa.typing.Series[str] = pa.Field(nullable=False)
    price: pa.typing.Series[str] = pa.Field(nullable=False)  # String (raw)


class OutputSchema(pa.DataFrameModel):
    """Schema for cleaned output data."""
    id: pa.typing.Series[int] = pa.Field(gt=0, unique=True)
    name: pa.typing.Series[str] = pa.Field(str_length={"min_value": 1})
    price: pa.typing.Series[float] = pa.Field(ge=0)
    name_length: pa.typing.Series[int] = pa.Field(ge=0)


@pa.check_input(InputSchema)
@pa.check_output(OutputSchema)
def clean_products(df: DataFrame[InputSchema]) -> DataFrame[OutputSchema]:
    """
    Clean product data.
    Input is validated against InputSchema before execution.
    Output is validated against OutputSchema after execution.
    If either fails, a SchemaError is raised.
    """
    result = df.copy()
    result["name"] = result["name"].str.strip().str.title()
    result["price"] = pd.to_numeric(result["price"], errors="coerce")
    result = result.dropna(subset=["price"])
    result = result[result["price"] >= 0]
    result = result.drop_duplicates(subset=["id"])
    result["name_length"] = result["name"].str.len()
    return result


# The decorators automatically validate on every call
df_raw = pd.DataFrame({
    "id": [1, 2, 3],
    "name": ["  widget  ", "Gadget", "Doohickey"],
    "price": ["19.99", "29.99", "invalid"],
})

df_clean = clean_products(df_raw)  # Validates input AND output
```

---

## Integration with Polars

```python
# polars_validation.py — Pandera with Polars DataFrames
import pandera.polars as pa
import polars as pl


class PolarsProductSchema(pa.DataFrameModel):
    """Schema for validating Polars DataFrames."""
    id: int = pa.Field(gt=0, unique=True)
    name: str = pa.Field(nullable=False)
    price: float = pa.Field(ge=0, lt=1_000_000)
    category: str = pa.Field(
        isin=["electronics", "clothing", "food"],
        nullable=True,
    )

    class Config:
        coerce = True


# Validate a Polars DataFrame
df_polars = pl.DataFrame({
    "id": [1, 2, 3],
    "name": ["Widget", "Gadget", "Thing"],
    "price": [19.99, 29.99, 9.99],
    "category": ["electronics", "clothing", "food"],
})

validated = PolarsProductSchema.validate(df_polars)
```

---

## CI Pipeline Integration

```python
# test_data_schemas.py — pytest tests for data validation
import pytest
import pandera as pa
from pandera.errors import SchemaError, SchemaErrors
import pandas as pd
from my_pipeline.schemas import ProductSchema, OrderSchema
from my_pipeline.transforms import clean_products


class TestProductSchema:
    """Test product data schema validation."""

    def test_valid_data_passes(self):
        """Valid data should pass validation."""
        df = pd.DataFrame({
            "id": [1, 2, 3],
            "name": ["Widget", "Gadget", "Thing"],
            "price": [19.99, 29.99, 9.99],
            "category": ["electronics", "clothing", "food"],
            "created_at": pd.to_datetime(["2024-01-01"] * 3),
        })
        validated = ProductSchema.validate(df)
        assert len(validated) == 3

    def test_negative_price_fails(self):
        """Negative prices should fail validation."""
        df = pd.DataFrame({
            "id": [1],
            "name": ["Widget"],
            "price": [-5.0],
            "category": ["electronics"],
            "created_at": pd.to_datetime(["2024-01-01"]),
        })
        with pytest.raises(SchemaError):
            ProductSchema.validate(df)

    def test_null_name_fails(self):
        """Null names should fail validation."""
        df = pd.DataFrame({
            "id": [1],
            "name": [None],
            "price": [19.99],
            "category": ["electronics"],
            "created_at": pd.to_datetime(["2024-01-01"]),
        })
        with pytest.raises(SchemaError):
            ProductSchema.validate(df)

    def test_transform_produces_valid_output(self):
        """Transformation should always produce schema-valid output."""
        raw = pd.DataFrame({
            "id": [1, 2, 2],  # Has duplicate
            "name": ["  Widget  ", "Gadget", "Gadget"],
            "price": ["19.99", "invalid", "29.99"],
            "category": ["electronics", "clothing", "clothing"],
            "created_at": ["2024-01-01", "2024-01-02", "2024-01-02"],
        })
        result = clean_products(raw)
        # Should not raise
        ProductSchema.validate(result)


# Run with: pytest test_data_schemas.py -v
```

---

## Quick Reference

| Check Type | Example | Description |
|-----------|---------|-------------|
| `Check.gt(0)` | Greater than 0 | Numeric lower bound (exclusive) |
| `Check.ge(0)` | Greater than or equal to 0 | Numeric lower bound (inclusive) |
| `Check.lt(100)` | Less than 100 | Numeric upper bound (exclusive) |
| `Check.in_range(0, 100)` | Between 0 and 100 | Numeric range |
| `Check.isin(["a", "b"])` | In set | Categorical membership |
| `Check.str_matches(r"...")` | Regex match | String pattern |
| `Check.str_length(min, max)` | String length | Length bounds |
| `Check.unique()` | All values unique | Uniqueness |
| `Check(lambda s: ...)` | Custom check | Any custom logic |
| `@pa.dataframe_check` | DataFrame-level | Cross-column checks |

| Feature | Syntax |
|---------|--------|
| Coerce types | `coerce=True` in Config |
| Allow extra columns | `strict=False` |
| Collect all errors | `schema.validate(df, lazy=True)` |
| Input validation | `@pa.check_input(Schema)` |
| Output validation | `@pa.check_output(Schema)` |
| YAML export | `schema.to_yaml()` |
| Schema inference | `pa.infer_schema(df)` |
