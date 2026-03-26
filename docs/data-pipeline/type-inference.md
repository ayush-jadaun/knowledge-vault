---
title: "Type Inference & Casting"
description: "Automatic type detection and optimization for DataFrames — pandas dtype optimization, handling mixed types, nullable integer types, categorical conversion, memory reduction strategies, and schema enforcement for production pipelines."
tags: [preprocessing, types, pandas, dtypes, data-quality]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Type Inference & Casting

Type inference is the most underestimated step in preprocessing. When pandas reads a CSV, it guesses types — and it often guesses wrong. Numbers stored as strings waste 10x memory. Integers with a single null become floats. Dates stay as objects. Categories with 5 unique values consume as much memory as free-text columns. Getting types right is the foundation for everything downstream: correct arithmetic, valid comparisons, efficient storage, and accurate analysis.

---

## The Problem with Default Type Inference

```python
# type_problems.py — Why default inference fails
import pandas as pd
import numpy as np
import io

# pandas guesses types from data content, and often gets it wrong

csv_data = """id,zip_code,phone,price,quantity,is_active,created_at
1,01234,555-0100,19.99,5,true,2024-01-15
2,10001,555-0200,29.99,0,false,2024-01-16
3,90210,,NA,3,true,Jan 17 2024
4,00501,555-0400,49.99,,TRUE,2024-01-18"""

df = pd.read_csv(io.StringIO(csv_data))

print("Default dtypes:")
print(df.dtypes)
# id            int64     -- OK
# zip_code      int64     -- WRONG! Lost leading zero (01234 -> 1234)
# phone         object    -- OK (string)
# price         object    -- WRONG! "NA" prevented numeric inference
# quantity      float64   -- WRONG! Should be nullable int, not float
# is_active     object    -- WRONG! Mixed case prevented bool inference
# created_at    object    -- WRONG! Mixed formats prevented date parsing

print(f"\nzip_code value: {df['zip_code'].iloc[0]}")  # 1234, not "01234"
print(f"price type: {type(df['price'].iloc[0])}")  # str, not float
print(f"quantity[3]: {df['quantity'].iloc[3]}")  # NaN (float), should be nullable int
```

---

## Systematic Type Detection

```python
# type_detector.py — Intelligent type detection for DataFrame columns
import pandas as pd
import numpy as np
import re
from datetime import datetime
from typing import Literal


class TypeDetector:
    """
    Analyze column content to determine the best dtype.
    Goes beyond pandas' default inference.
    """

    # Common date patterns
    DATE_PATTERNS = [
        r"\d{4}-\d{2}-\d{2}",                    # 2024-01-15
        r"\d{2}/\d{2}/\d{4}",                    # 01/15/2024
        r"\d{2}-\d{2}-\d{4}",                    # 15-01-2024
        r"[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4}",   # Jan 15 2024
        r"\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}",     # 15 Jan 2024
    ]

    # Values that should be treated as boolean
    BOOL_TRUE = {"true", "True", "TRUE", "yes", "Yes", "YES", "1", "t", "y"}
    BOOL_FALSE = {"false", "False", "FALSE", "no", "No", "NO", "0", "f", "n"}

    def detect_column_type(
        self, series: pd.Series, column_name: str = ""
    ) -> dict:
        """
        Analyze a column and return recommended type info.

        Returns:
            {
                "current_dtype": str,
                "recommended_dtype": str,
                "confidence": float,
                "reason": str,
                "memory_savings_pct": float,
            }
        """
        current_dtype = str(series.dtype)
        non_null = series.dropna()

        if len(non_null) == 0:
            return {
                "current_dtype": current_dtype,
                "recommended_dtype": "object",
                "confidence": 0.0,
                "reason": "All values are null",
                "memory_savings_pct": 0.0,
            }

        # For object (string) columns, try to detect actual type
        if series.dtype == "object":
            return self._detect_from_strings(non_null, column_name)

        # For numeric columns, check if we can downcast
        if pd.api.types.is_numeric_dtype(series):
            return self._optimize_numeric(series)

        return {
            "current_dtype": current_dtype,
            "recommended_dtype": current_dtype,
            "confidence": 1.0,
            "reason": "Already optimal",
            "memory_savings_pct": 0.0,
        }

    def _detect_from_strings(self, series: pd.Series, col_name: str) -> dict:
        """Detect types from string column content."""
        values = series.astype(str).str.strip()
        sample = values.head(1000)  # Sample for performance
        current_mem = series.memory_usage(deep=True)

        # Check boolean
        all_values_set = set(sample.str.lower())
        bool_values = self.BOOL_TRUE | self.BOOL_FALSE | {""}
        if all_values_set.issubset(bool_values) and len(all_values_set - {""}) >= 2:
            return {
                "current_dtype": "object",
                "recommended_dtype": "boolean",
                "confidence": 0.95,
                "reason": "Values match boolean pattern",
                "memory_savings_pct": self._calc_savings(
                    current_mem, len(series) * 1
                ),
            }

        # Check integer
        numeric_pattern = re.compile(r"^-?\d+$")
        numeric_matches = sample.apply(lambda x: bool(numeric_pattern.match(str(x))))
        if numeric_matches.mean() > 0.95:
            return {
                "current_dtype": "object",
                "recommended_dtype": "Int64",  # Nullable integer
                "confidence": numeric_matches.mean(),
                "reason": "Values are integer-like strings",
                "memory_savings_pct": self._calc_savings(
                    current_mem, len(series) * 8
                ),
            }

        # Check float
        float_pattern = re.compile(r"^-?\d*\.?\d+([eE][+-]?\d+)?$")
        float_matches = sample.apply(lambda x: bool(float_pattern.match(str(x))))
        if float_matches.mean() > 0.95:
            return {
                "current_dtype": "object",
                "recommended_dtype": "Float64",
                "confidence": float_matches.mean(),
                "reason": "Values are float-like strings",
                "memory_savings_pct": self._calc_savings(
                    current_mem, len(series) * 8
                ),
            }

        # Check date
        for pattern in self.DATE_PATTERNS:
            date_matches = sample.apply(lambda x: bool(re.match(pattern, str(x))))
            if date_matches.mean() > 0.90:
                return {
                    "current_dtype": "object",
                    "recommended_dtype": "datetime64[ns]",
                    "confidence": date_matches.mean(),
                    "reason": f"Values match date pattern: {pattern}",
                    "memory_savings_pct": self._calc_savings(
                        current_mem, len(series) * 8
                    ),
                }

        # Check if categorical would save memory
        n_unique = series.nunique()
        cardinality_ratio = n_unique / len(series)
        if cardinality_ratio < 0.5 and n_unique < 1000:
            return {
                "current_dtype": "object",
                "recommended_dtype": "category",
                "confidence": 0.9,
                "reason": (
                    f"Low cardinality ({n_unique} unique values, "
                    f"{cardinality_ratio:.1%} ratio)"
                ),
                "memory_savings_pct": self._calc_savings(
                    current_mem,
                    n_unique * 100 + len(series) * 4,
                ),
            }

        # Check if column name suggests a type
        name_lower = col_name.lower()
        if any(x in name_lower for x in ["zip", "postal", "phone", "ssn", "code"]):
            return {
                "current_dtype": "object",
                "recommended_dtype": "string",
                "confidence": 0.8,
                "reason": "Column name suggests string type (ID/code column)",
                "memory_savings_pct": 0.0,
            }

        return {
            "current_dtype": "object",
            "recommended_dtype": "string",
            "confidence": 0.7,
            "reason": "Free text, keeping as string",
            "memory_savings_pct": 0.0,
        }

    def _optimize_numeric(self, series: pd.Series) -> dict:
        """Downcast numeric types to save memory."""
        current_dtype = str(series.dtype)
        current_mem = series.memory_usage(deep=True)

        if pd.api.types.is_integer_dtype(series):
            min_val, max_val = series.min(), series.max()

            if min_val >= 0:
                # Unsigned integer
                if max_val <= np.iinfo(np.uint8).max:
                    target = "uint8"
                elif max_val <= np.iinfo(np.uint16).max:
                    target = "uint16"
                elif max_val <= np.iinfo(np.uint32).max:
                    target = "uint32"
                else:
                    target = "uint64"
            else:
                # Signed integer
                if (min_val >= np.iinfo(np.int8).min and
                        max_val <= np.iinfo(np.int8).max):
                    target = "int8"
                elif (min_val >= np.iinfo(np.int16).min and
                      max_val <= np.iinfo(np.int16).max):
                    target = "int16"
                elif (min_val >= np.iinfo(np.int32).min and
                      max_val <= np.iinfo(np.int32).max):
                    target = "int32"
                else:
                    target = "int64"

            target_mem = len(series) * np.dtype(target).itemsize
            return {
                "current_dtype": current_dtype,
                "recommended_dtype": target,
                "confidence": 1.0,
                "reason": f"Range [{min_val}, {max_val}] fits in {target}",
                "memory_savings_pct": self._calc_savings(current_mem, target_mem),
            }

        if pd.api.types.is_float_dtype(series):
            if series.dropna().apply(float.is_integer).all():
                return {
                    "current_dtype": current_dtype,
                    "recommended_dtype": "Int64",
                    "confidence": 0.95,
                    "reason": "Float column contains only integer values (nulls caused float)",
                    "memory_savings_pct": 0.0,
                }

            if series.dtype == np.float64:
                min_val = series.min()
                max_val = series.max()
                if (min_val >= np.finfo(np.float32).min and
                        max_val <= np.finfo(np.float32).max):
                    target_mem = len(series) * 4
                    return {
                        "current_dtype": current_dtype,
                        "recommended_dtype": "float32",
                        "confidence": 0.9,
                        "reason": "Values fit in float32",
                        "memory_savings_pct": self._calc_savings(
                            current_mem, target_mem
                        ),
                    }

        return {
            "current_dtype": current_dtype,
            "recommended_dtype": current_dtype,
            "confidence": 1.0,
            "reason": "Already optimal",
            "memory_savings_pct": 0.0,
        }

    @staticmethod
    def _calc_savings(current_bytes: int, target_bytes: int) -> float:
        if current_bytes == 0:
            return 0.0
        return max(0, (1 - target_bytes / current_bytes) * 100)


# Usage
detector = TypeDetector()

df = pd.read_csv("data.csv")
print(f"{'Column':<20} {'Current':<12} {'Recommended':<15} {'Confidence':<12} {'Savings':<10}")
print("-" * 70)
for col in df.columns:
    result = detector.detect_column_type(df[col], col)
    print(
        f"{col:<20} {result['current_dtype']:<12} "
        f"{result['recommended_dtype']:<15} "
        f"{result['confidence']:<12.1%} "
        f"{result['memory_savings_pct']:<10.1f}%"
    )
```

---

## Automated Type Casting

```python
# type_caster.py — Apply detected types to a DataFrame
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)


class TypeCaster:
    """Apply type conversions based on detected or specified types."""

    def __init__(self, strict: bool = False):
        self.strict = strict  # Raise on conversion failure vs coerce
        self.conversion_log: list[dict] = []

    def cast_column(
        self,
        series: pd.Series,
        target_dtype: str,
        column_name: str = "",
    ) -> pd.Series:
        """Cast a single column to the target dtype."""
        original_dtype = str(series.dtype)
        original_nulls = series.isnull().sum()

        try:
            if target_dtype == "boolean":
                result = self._to_boolean(series)
            elif target_dtype in ("Int8", "Int16", "Int32", "Int64"):
                result = self._to_nullable_int(series, target_dtype)
            elif target_dtype in ("Float32", "Float64"):
                result = pd.to_numeric(series, errors="coerce").astype(target_dtype)
            elif target_dtype.startswith("int") or target_dtype.startswith("uint"):
                result = pd.to_numeric(series, errors="coerce").astype(target_dtype)
            elif target_dtype.startswith("float"):
                result = pd.to_numeric(series, errors="coerce").astype(target_dtype)
            elif target_dtype == "datetime64[ns]":
                result = pd.to_datetime(series, errors="coerce", infer_datetime_format=True)
            elif target_dtype == "category":
                result = series.astype("category")
            elif target_dtype == "string":
                result = series.astype("string")
            else:
                result = series.astype(target_dtype)

            new_nulls = result.isnull().sum()
            nulls_introduced = new_nulls - original_nulls

            self.conversion_log.append({
                "column": column_name,
                "from": original_dtype,
                "to": str(result.dtype),
                "nulls_introduced": nulls_introduced,
                "success": True,
            })

            if nulls_introduced > 0:
                logger.warning(
                    f"Casting {column_name}: {nulls_introduced} values "
                    f"became null during {original_dtype} -> {target_dtype}"
                )

            return result

        except Exception as e:
            if self.strict:
                raise
            logger.error(f"Failed to cast {column_name} to {target_dtype}: {e}")
            self.conversion_log.append({
                "column": column_name,
                "from": original_dtype,
                "to": target_dtype,
                "error": str(e),
                "success": False,
            })
            return series  # Return original on failure

    def _to_boolean(self, series: pd.Series) -> pd.Series:
        """Convert various boolean representations."""
        true_values = {"true", "True", "TRUE", "yes", "Yes", "YES", "1", "t", "y"}
        false_values = {"false", "False", "FALSE", "no", "No", "NO", "0", "f", "n"}

        def convert(val):
            if pd.isna(val):
                return pd.NA
            s = str(val).strip()
            if s in true_values:
                return True
            if s in false_values:
                return False
            return pd.NA

        return series.apply(convert).astype("boolean")

    def _to_nullable_int(self, series: pd.Series, dtype: str) -> pd.Series:
        """Convert to nullable integer (handles NaN without float promotion)."""
        numeric = pd.to_numeric(series, errors="coerce")
        return numeric.astype(dtype)

    def auto_cast(self, df: pd.DataFrame) -> pd.DataFrame:
        """Automatically detect and cast all columns."""
        detector = TypeDetector()
        result = df.copy()

        for col in result.columns:
            detection = detector.detect_column_type(result[col], col)

            if detection["recommended_dtype"] != detection["current_dtype"]:
                if detection["confidence"] >= 0.9:
                    result[col] = self.cast_column(
                        result[col],
                        detection["recommended_dtype"],
                        col,
                    )

        return result


# Usage
caster = TypeCaster(strict=False)
df_typed = caster.auto_cast(df_raw)

# Print conversion log
for entry in caster.conversion_log:
    if entry["success"]:
        print(f"  {entry['column']}: {entry['from']} -> {entry['to']}")
    else:
        print(f"  {entry['column']}: FAILED ({entry['error']})")
```

---

## Memory Optimization

```python
# memory_optimizer.py — Reduce DataFrame memory usage
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)


def optimize_memory(
    df: pd.DataFrame,
    categorical_threshold: float = 0.5,
    verbose: bool = True,
) -> pd.DataFrame:
    """
    Optimize DataFrame memory usage by downcasting types.

    Typical savings: 50-80% for datasets with many int/float columns.
    """
    start_mem = df.memory_usage(deep=True).sum() / (1024 ** 2)
    result = df.copy()

    for col in result.columns:
        col_type = result[col].dtype

        if col_type == "object":
            # Check if categorical would save memory
            n_unique = result[col].nunique()
            ratio = n_unique / len(result) if len(result) > 0 else 1.0

            if ratio < categorical_threshold:
                result[col] = result[col].astype("category")
                if verbose:
                    logger.info(
                        f"  {col}: object -> category "
                        f"({n_unique} categories, {ratio:.1%} ratio)"
                    )

        elif col_type in [np.int64, np.int32]:
            # Downcast integers
            col_min = result[col].min()
            col_max = result[col].max()

            if col_min >= 0:
                if col_max <= 255:
                    result[col] = result[col].astype(np.uint8)
                elif col_max <= 65535:
                    result[col] = result[col].astype(np.uint16)
                elif col_max <= 4294967295:
                    result[col] = result[col].astype(np.uint32)
            else:
                if col_min >= -128 and col_max <= 127:
                    result[col] = result[col].astype(np.int8)
                elif col_min >= -32768 and col_max <= 32767:
                    result[col] = result[col].astype(np.int16)
                elif col_min >= -2147483648 and col_max <= 2147483647:
                    result[col] = result[col].astype(np.int32)

        elif col_type == np.float64:
            # Check if integers masquerading as floats (due to NaN)
            non_null = result[col].dropna()
            if len(non_null) > 0 and (non_null == non_null.astype(int)).all():
                result[col] = result[col].astype("Int64")
            else:
                # Downcast floats
                col_min = result[col].min()
                col_max = result[col].max()
                if (col_min >= np.finfo(np.float32).min and
                        col_max <= np.finfo(np.float32).max):
                    result[col] = result[col].astype(np.float32)

    end_mem = result.memory_usage(deep=True).sum() / (1024 ** 2)
    reduction = (1 - end_mem / start_mem) * 100

    if verbose:
        logger.info(
            f"Memory: {start_mem:.1f} MB -> {end_mem:.1f} MB "
            f"({reduction:.1f}% reduction)"
        )

    return result


# Usage
df = pd.read_csv("large_dataset.csv")
df_optimized = optimize_memory(df)
```

---

## Schema Enforcement

```python
# schema_enforcement.py — Validate and enforce DataFrame schemas
import pandas as pd
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ColumnSchema:
    """Schema definition for a single column."""
    name: str
    dtype: str
    nullable: bool = True
    min_value: Any = None
    max_value: Any = None
    allowed_values: list | None = None
    regex_pattern: str | None = None


@dataclass
class DataFrameSchema:
    """Complete schema for a DataFrame."""
    columns: list[ColumnSchema]
    allow_extra_columns: bool = False
    min_rows: int = 0

    def validate(self, df: pd.DataFrame) -> list[str]:
        """Validate a DataFrame against this schema. Returns list of errors."""
        errors = []

        # Check minimum rows
        if len(df) < self.min_rows:
            errors.append(
                f"Expected at least {self.min_rows} rows, got {len(df)}"
            )

        # Check required columns
        expected_cols = {col.name for col in self.columns}
        actual_cols = set(df.columns)

        missing = expected_cols - actual_cols
        if missing:
            errors.append(f"Missing columns: {missing}")

        extra = actual_cols - expected_cols
        if extra and not self.allow_extra_columns:
            errors.append(f"Unexpected columns: {extra}")

        # Validate each column
        for col_schema in self.columns:
            if col_schema.name not in df.columns:
                continue

            series = df[col_schema.name]

            # Null check
            if not col_schema.nullable and series.isnull().any():
                null_count = series.isnull().sum()
                errors.append(
                    f"Column '{col_schema.name}': {null_count} nulls found "
                    f"but column is not nullable"
                )

            # Type check
            actual_dtype = str(series.dtype)
            if not self._types_compatible(actual_dtype, col_schema.dtype):
                errors.append(
                    f"Column '{col_schema.name}': expected dtype "
                    f"'{col_schema.dtype}', got '{actual_dtype}'"
                )

            # Range check
            if col_schema.min_value is not None:
                below = (series.dropna() < col_schema.min_value).sum()
                if below > 0:
                    errors.append(
                        f"Column '{col_schema.name}': {below} values "
                        f"below minimum {col_schema.min_value}"
                    )

            if col_schema.max_value is not None:
                above = (series.dropna() > col_schema.max_value).sum()
                if above > 0:
                    errors.append(
                        f"Column '{col_schema.name}': {above} values "
                        f"above maximum {col_schema.max_value}"
                    )

            # Allowed values check
            if col_schema.allowed_values is not None:
                invalid = ~series.dropna().isin(col_schema.allowed_values)
                if invalid.any():
                    bad_values = series.dropna()[invalid].unique()[:5]
                    errors.append(
                        f"Column '{col_schema.name}': invalid values "
                        f"found: {list(bad_values)}"
                    )

        return errors

    def enforce(self, df: pd.DataFrame) -> pd.DataFrame:
        """Cast DataFrame to match schema, raising on incompatibility."""
        errors = self.validate(df)
        # Only enforce types, not constraints
        result = df.copy()
        caster = TypeCaster(strict=False)

        for col_schema in self.columns:
            if col_schema.name in result.columns:
                result[col_schema.name] = caster.cast_column(
                    result[col_schema.name],
                    col_schema.dtype,
                    col_schema.name,
                )

        return result

    @staticmethod
    def _types_compatible(actual: str, expected: str) -> bool:
        compatible_groups = {
            "int": {"int8", "int16", "int32", "int64", "Int8", "Int16", "Int32", "Int64"},
            "uint": {"uint8", "uint16", "uint32", "uint64"},
            "float": {"float16", "float32", "float64", "Float32", "Float64"},
            "string": {"object", "string", "str"},
            "bool": {"bool", "boolean"},
        }
        for group_values in compatible_groups.values():
            if actual in group_values and expected in group_values:
                return True
        return actual == expected


# Usage
product_schema = DataFrameSchema(
    columns=[
        ColumnSchema("id", "Int64", nullable=False, min_value=1),
        ColumnSchema("name", "string", nullable=False),
        ColumnSchema("price", "Float64", nullable=False, min_value=0, max_value=100000),
        ColumnSchema("category", "category", nullable=True,
                     allowed_values=["electronics", "clothing", "food", "books"]),
        ColumnSchema("created_at", "datetime64[ns]", nullable=False),
    ],
    allow_extra_columns=False,
    min_rows=1,
)

errors = product_schema.validate(df)
if errors:
    for error in errors:
        print(f"  VALIDATION ERROR: {error}")
else:
    print("Schema validation passed")
```

---

## Quick Reference

| Pandas Default | Problem | Fix |
|----------------|---------|-----|
| `int64` for all integers | Wastes 8 bytes for small values | Downcast to `int8`/`int16`/`int32` |
| `float64` for integers with NaN | Precision loss, wrong type | Use `Int64` (nullable integer) |
| `object` for strings | No string methods, high memory | Use `string` dtype or `category` |
| `object` for dates | No date arithmetic | Parse with `pd.to_datetime()` |
| `object` for booleans | No boolean logic | Cast with explicit true/false mapping |
| `float64` for all floats | Wastes 4 bytes per value | Downcast to `float32` if range allows |
| `object` for categories | High memory for repeated values | Convert to `category` dtype |

---

::: tip Key Takeaway
- Pandas default type inference is wrong more often than it is right: leading zeros vanish, nulls promote integers to floats, and booleans stay as strings.
- Systematic type detection followed by automated casting can reduce DataFrame memory usage by 50-80% with zero data loss.
- Schema enforcement at the pipeline boundary catches type drift before it corrupts downstream analysis.
:::

::: details Exercise
**Build a Type Optimizer**

Write a function `optimize_dataframe(df)` that:
1. Detects all columns where the current dtype is suboptimal.
2. Downcasts integers and floats to the smallest type that fits the range.
3. Converts low-cardinality string columns (fewer than 50% unique values) to `category`.
4. Detects and parses date-like string columns using regex patterns.
5. Reports the memory savings achieved.

**Solution Sketch**

```python
import pandas as pd, numpy as np

def optimize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    start_mem = df.memory_usage(deep=True).sum()
    result = df.copy()
    for col in result.columns:
        if result[col].dtype == "object":
            if result[col].nunique() / len(result) < 0.5:
                result[col] = result[col].astype("category")
        elif result[col].dtype == np.int64:
            c_min, c_max = result[col].min(), result[col].max()
            if c_min >= 0 and c_max <= 255:
                result[col] = result[col].astype(np.uint8)
            elif c_min >= -128 and c_max <= 127:
                result[col] = result[col].astype(np.int8)
        elif result[col].dtype == np.float64:
            result[col] = pd.to_numeric(result[col], downcast="float")
    end_mem = result.memory_usage(deep=True).sum()
    print(f"Memory: {start_mem/1e6:.1f}MB -> {end_mem/1e6:.1f}MB ({(1-end_mem/start_mem)*100:.0f}% saved)")
    return result
```
:::

::: details Debugging Scenario
**You load a CSV with a `quantity` column that should be integer. After loading, some rows show `5.0` instead of `5`, and your integer validation fails.**

Diagnose and fix it.

**Answer**

This is the classic **NaN promotes int to float** problem in pandas. If even one value in the column is missing (NaN), pandas cannot store the column as `int64` because NumPy integers have no NaN representation. The entire column is silently promoted to `float64`.

Fix: use pandas' **nullable integer type** `Int64` (capital I) instead of `int64`:

```python
df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce").astype("Int64")
```

`Int64` uses pandas' extension array system that supports `pd.NA` natively, keeping the column as integers while allowing missing values.
:::

::: warning Common Misconceptions
- **"Pandas correctly infers types from CSV files."** Pandas guesses, and it guesses wrong on leading zeros, mixed-case booleans, mixed date formats, and columns with a single NaN.
- **"int64 is the right default for integers."** Most integer columns fit in `int8` (range -128 to 127) or `int16`. Using `int64` for everything wastes 4-7 bytes per value.
- **"Float columns should stay float64."** `float32` has 7 digits of precision, which is sufficient for prices, measurements, and most real-world values. Downcasting halves memory usage.
- **"Category dtype is only for ML encoding."** Category dtype is a general memory optimization: a column with 5 unique values across 1M rows uses ~4MB as `object` but ~1MB as `category`.
- **"Type casting is a nice-to-have optimization."** Wrong types cause wrong arithmetic (string "5" + string "3" = "53"), broken comparisons, and silent data corruption. It is a correctness requirement, not an optimization.
:::

::: details Quiz
**1. Why does a single NaN in an integer column cause pandas to use float64?**

> NumPy's integer types have no native representation for missing values. When pandas encounters a NaN, it promotes the entire column to float64, which does support NaN. The fix is to use nullable integer types like `Int64`.

**2. What is the difference between `int64` and `Int64` in pandas?**

> `int64` (lowercase) is the NumPy integer type that cannot hold NaN values. `Int64` (uppercase) is pandas' nullable integer extension type that supports `pd.NA` for missing values.

**3. When should you use the `category` dtype?**

> When a string column has low cardinality (many repeated values relative to unique values), typically a ratio below 50%. It saves memory by storing an integer lookup table instead of repeating strings.

**4. What does `pd.to_numeric(series, errors="coerce")` do with non-numeric values?**

> It converts valid values to numbers and replaces non-numeric values (like "N/A" or "unknown") with `NaN` instead of raising an error.

**5. How can you detect that a float column actually contains only integer values?**

> Check `series.dropna().apply(float.is_integer).all()`. If True, the column was promoted from integer due to NaN values and can be safely cast to a nullable integer type.
:::

> **One-Liner Summary:** Pandas type inference is a well-meaning guess that routinely destroys leading zeros, promotes integers to floats, and wastes 80% of memory -- explicit type casting is a correctness requirement, not an optimization.
