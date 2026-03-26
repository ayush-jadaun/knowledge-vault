---
title: "File Formats Deep Dive"
description: "Comprehensive guide to data file formats — CSV gotchas and edge cases, JSON/JSONL streaming, Parquet columnar benefits, Avro with schema registry, HDF5 for scientific data, Feather/Arrow for speed, and when to use which format."
tags: [file-formats, parquet, csv, avro, data-engineering]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# File Formats Deep Dive

Choosing the wrong file format silently corrupts data, wastes storage, or makes queries orders of magnitude slower. A CSV that looks correct in Excel might have embedded newlines destroying row alignment. A JSON file might consume 10x more memory than necessary. A Parquet file might save 90% on storage and query time but requires tooling your team has never used. This page covers every major format, their gotchas, and a decision framework.

---

## Format Comparison

```
┌──────────────────────────────────────────────────────────────────┐
│                    File Format Spectrum                          │
│                                                                  │
│  Human-Readable ◄──────────────────────────────► Machine-Optimized│
│                                                                  │
│  CSV    JSON    JSONL    Avro    Parquet    Arrow/Feather    HDF5 │
│  ───    ────    ─────    ────    ───────    ────────────    ──── │
│  Text   Text    Text    Binary   Binary      Binary       Binary│
│  Row    Doc     Doc     Row     Columnar    Columnar     Multi-D │
│  No     No      No      Yes     Yes         No           Yes    │
│  schema schema  schema  schema  schema      schema       schema │
└──────────────────────────────────────────────────────────────────┘
```

| Feature | CSV | JSON | JSONL | Parquet | Avro | Arrow/Feather | HDF5 |
|---------|-----|------|-------|---------|------|---------------|------|
| Human readable | Yes | Yes | Yes | No | No | No | No |
| Schema embedded | No | No | No | Yes | Yes | Yes | Yes |
| Compression | External | External | External | Built-in | Built-in | Optional | Built-in |
| Columnar | No | No | No | Yes | No | Yes | Partial |
| Streaming write | Yes | No | Yes | No | Yes | No | Yes |
| Partial read | No | No | Yes (line) | Yes (columns) | No | Yes (columns) | Yes (datasets) |
| Typical compression | 1x | 0.3-0.5x | 0.3-0.5x | 5-10x | 3-5x | 2-3x | 3-5x |

---

## CSV: The Universal Footgun

CSV is the most common data exchange format and also the most error-prone. There is no formal standard — RFC 4180 exists but is widely ignored.

### CSV Gotchas

```python
# csv_gotchas.py — Every way CSV can break your data
import pandas as pd
import csv
import io

# GOTCHA 1: Embedded newlines in quoted fields
csv_with_newlines = '''id,name,description
1,Widget,"A widget that
spans multiple lines"
2,Gadget,"Simple gadget"'''

# pandas handles this correctly with default quoting
df = pd.read_csv(io.StringIO(csv_with_newlines))
assert len(df) == 2  # Correct: 2 rows, not 3

# GOTCHA 2: Different delimiters masquerading as CSV
tsv_data = "id\tname\tprice\n1\tWidget\t9.99"
semicolon_data = "id;name;price\n1;Widget;9,99"  # European format!

df_tsv = pd.read_csv(io.StringIO(tsv_data), sep="\t")
df_semi = pd.read_csv(
    io.StringIO(semicolon_data),
    sep=";",
    decimal=","  # European decimal separator
)

# GOTCHA 3: Leading zeros stripped
zip_csv = "zip_code,city\n01234,Springfield\n00501,Holtsville"
df_bad = pd.read_csv(io.StringIO(zip_csv))
print(df_bad["zip_code"].iloc[0])  # 1234 — WRONG, lost leading zero!

df_good = pd.read_csv(io.StringIO(zip_csv), dtype={"zip_code": str})
print(df_good["zip_code"].iloc[0])  # "01234" — Correct

# GOTCHA 4: Encoding nightmares
# UTF-8 with BOM, Latin-1, Windows-1252 all look similar but aren't
def safe_read_csv(path: str) -> pd.DataFrame:
    """Try multiple encodings until one works."""
    encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1"]
    for encoding in encodings:
        try:
            return pd.read_csv(path, encoding=encoding)
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise ValueError(f"Cannot decode {path} with any known encoding")

# GOTCHA 5: Type inference gone wrong
type_csv = "id,value,flag\n1,001,true\n2,1e3,false\n3,NA,true"
df = pd.read_csv(io.StringIO(type_csv))
# "001" becomes 1 (integer)
# "1e3" becomes 1000.0 (scientific notation)
# "NA" becomes NaN (missing value)
# "true"/"false" stay as strings unless you specify dtype

# Fix: be explicit about types
df_explicit = pd.read_csv(
    io.StringIO(type_csv),
    dtype={"id": int, "value": str, "flag": bool},
    keep_default_na=False,  # Don't treat "NA" as missing
)

# GOTCHA 6: Quoting inconsistencies
tricky = '''id,name,note
1,"O'Brien",works
2,"She said ""hello""",works
3,unquoted with, comma,BROKEN'''

# Use QUOTE_ALL when writing to avoid ambiguity
output = io.StringIO()
writer = csv.writer(output, quoting=csv.QUOTE_ALL)
writer.writerow(["id", "name", "note"])
writer.writerow([1, "O'Brien", "works"])

# GOTCHA 7: Large numbers lose precision
big_number_csv = "id,account_number\n1,99999999999999999"
df = pd.read_csv(io.StringIO(big_number_csv))
print(df["account_number"].iloc[0])  # 100000000000000000 — WRONG!
# Fix: read as string
df = pd.read_csv(io.StringIO(big_number_csv), dtype={"account_number": str})
```

### Robust CSV Reading

```python
# robust_csv.py — Production CSV reader
import pandas as pd
import chardet
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def detect_encoding(filepath: str | Path, sample_size: int = 100_000) -> str:
    """Detect file encoding using chardet."""
    with open(filepath, "rb") as f:
        raw = f.read(sample_size)
    result = chardet.detect(raw)
    encoding = result["encoding"]
    confidence = result["confidence"]
    logger.info(f"Detected encoding: {encoding} (confidence: {confidence:.1%})")
    return encoding


def detect_delimiter(filepath: str | Path, encoding: str = "utf-8") -> str:
    """Detect CSV delimiter by analyzing the first few lines."""
    with open(filepath, "r", encoding=encoding) as f:
        sample = f.read(8192)

    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(sample, delimiters=",;\t|")
        return dialect.delimiter
    except csv.Error:
        return ","  # Default fallback


def read_csv_robust(
    filepath: str | Path,
    dtype_overrides: dict | None = None,
    parse_dates: list[str] | None = None,
) -> pd.DataFrame:
    """Read CSV with automatic encoding and delimiter detection."""
    filepath = Path(filepath)

    # Step 1: Detect encoding
    encoding = detect_encoding(filepath)

    # Step 2: Detect delimiter
    delimiter = detect_delimiter(filepath, encoding)
    logger.info(f"Detected delimiter: {repr(delimiter)}")

    # Step 3: Read with detected settings
    df = pd.read_csv(
        filepath,
        encoding=encoding,
        sep=delimiter,
        dtype=dtype_overrides or {},
        parse_dates=parse_dates or False,
        na_values=["", "N/A", "n/a", "NULL", "null", "None", "none", "-"],
        keep_default_na=True,
        low_memory=False,  # Consistent type inference
        on_bad_lines="warn",
    )

    logger.info(f"Read {len(df)} rows, {len(df.columns)} columns from {filepath}")
    return df
```

---

## JSON and JSONL

### JSON Pitfalls

```python
# json_handling.py — JSON for data pipelines
import json
import ijson  # Streaming JSON parser
import pandas as pd
from pathlib import Path
from typing import Iterator, Any
import logging

logger = logging.getLogger(__name__)


# PROBLEM: Loading a 2GB JSON file into memory kills your machine
# SOLUTION: Stream with ijson

def stream_json_array(filepath: str | Path) -> Iterator[dict]:
    """
    Stream a JSON array without loading the entire file into memory.
    Works with files of any size.

    Expected format: [{"key": "value"}, {"key": "value"}, ...]
    """
    with open(filepath, "rb") as f:
        parser = ijson.items(f, "item")
        for item in parser:
            yield item


def stream_nested_json(filepath: str | Path, path: str) -> Iterator[dict]:
    """
    Extract items from a nested JSON path.
    Example: path="response.data.items.item" for:
    {"response": {"data": {"items": [{"id": 1}, {"id": 2}]}}}
    """
    with open(filepath, "rb") as f:
        parser = ijson.items(f, path)
        for item in parser:
            yield item


# JSONL (JSON Lines) — one JSON object per line
# This is the BEST format for streaming/append workloads

def read_jsonl(filepath: str | Path) -> list[dict]:
    """Read a JSONL file."""
    records = []
    with open(filepath, "r") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as e:
                logger.warning(f"Skipping invalid JSON at line {line_num}: {e}")
    return records


def write_jsonl(records: list[dict], filepath: str | Path):
    """Write records as JSONL (append-safe)."""
    with open(filepath, "a") as f:
        for record in records:
            f.write(json.dumps(record, default=str) + "\n")


def jsonl_to_dataframe(
    filepath: str | Path,
    chunksize: int | None = None,
) -> pd.DataFrame | Iterator[pd.DataFrame]:
    """Convert JSONL to DataFrame, optionally in chunks."""
    if chunksize:
        return pd.read_json(filepath, lines=True, chunksize=chunksize)
    return pd.read_json(filepath, lines=True)


# Flatten nested JSON for tabular storage
def flatten_json(nested: dict, prefix: str = "") -> dict:
    """
    Flatten nested JSON into dot-notation keys.
    {"a": {"b": 1, "c": [2, 3]}} -> {"a.b": 1, "a.c": [2, 3]}
    """
    flat = {}
    for key, value in nested.items():
        new_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            flat.update(flatten_json(value, new_key))
        else:
            flat[new_key] = value
    return flat


# Usage
records = [
    {"user": {"name": "Alice", "age": 30}, "score": 95},
    {"user": {"name": "Bob", "age": 25}, "score": 87},
]
flat = [flatten_json(r) for r in records]
df = pd.DataFrame(flat)
# Columns: user.name, user.age, score
```

---

## Parquet: The Gold Standard

Parquet is a columnar storage format designed for analytics workloads. It is the default choice for any pipeline producing data for analysis or ML.

### Why Parquet Wins

```python
# parquet_benefits.py — Demonstrating Parquet advantages
import pandas as pd
import numpy as np
from pathlib import Path
import time
import os

# Generate sample data
np.random.seed(42)
n_rows = 1_000_000
df = pd.DataFrame({
    "id": range(n_rows),
    "category": np.random.choice(["A", "B", "C", "D"], n_rows),
    "value": np.random.randn(n_rows),
    "timestamp": pd.date_range("2024-01-01", periods=n_rows, freq="s"),
    "description": [f"Item {i} description text" for i in range(n_rows)],
    "flag": np.random.choice([True, False], n_rows),
})

# Save in different formats and compare
csv_path = Path("/tmp/benchmark.csv")
json_path = Path("/tmp/benchmark.json")
parquet_path = Path("/tmp/benchmark.parquet")
parquet_zstd_path = Path("/tmp/benchmark_zstd.parquet")

# Write
t0 = time.time()
df.to_csv(csv_path, index=False)
csv_write_time = time.time() - t0

t0 = time.time()
df.to_parquet(parquet_path, index=False, engine="pyarrow")
parquet_write_time = time.time() - t0

t0 = time.time()
df.to_parquet(parquet_zstd_path, index=False, engine="pyarrow", compression="zstd")
parquet_zstd_write_time = time.time() - t0

# File sizes
csv_size = csv_path.stat().st_size / (1024 * 1024)
parquet_size = parquet_path.stat().st_size / (1024 * 1024)
parquet_zstd_size = parquet_zstd_path.stat().st_size / (1024 * 1024)

print(f"CSV:            {csv_size:.1f} MB (write: {csv_write_time:.2f}s)")
print(f"Parquet:        {parquet_size:.1f} MB (write: {parquet_write_time:.2f}s)")
print(f"Parquet (zstd): {parquet_zstd_size:.1f} MB (write: {parquet_zstd_write_time:.2f}s)")

# Read performance — read only 2 columns
t0 = time.time()
df_csv = pd.read_csv(csv_path, usecols=["category", "value"])
csv_read_time = time.time() - t0

t0 = time.time()
df_pq = pd.read_parquet(parquet_path, columns=["category", "value"])
parquet_read_time = time.time() - t0

print(f"\nRead 2 columns from {n_rows:,} rows:")
print(f"CSV:     {csv_read_time:.3f}s (must read entire file)")
print(f"Parquet: {parquet_read_time:.3f}s (reads only requested columns)")
print(f"Speedup: {csv_read_time / parquet_read_time:.1f}x")
```

### Parquet Partitioning

```python
# parquet_partitioning.py — Partition for efficient queries
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
import numpy as np

# Generate sample data
np.random.seed(42)
n = 500_000
df = pd.DataFrame({
    "order_id": range(n),
    "date": pd.date_range("2023-01-01", periods=n, freq="h"),
    "category": np.random.choice(["electronics", "clothing", "food", "books"], n),
    "amount": np.random.uniform(5, 500, n).round(2),
    "customer_id": np.random.randint(1, 10000, n),
})

# Add partition columns
df["year"] = df["date"].dt.year
df["month"] = df["date"].dt.month

# Write partitioned Parquet
table = pa.Table.from_pandas(df)
pq.write_to_dataset(
    table,
    root_path="./orders_partitioned",
    partition_cols=["year", "month"],
    use_legacy_dataset=False,
)

# Result:
# orders_partitioned/
# ├── year=2023/
# │   ├── month=1/
# │   │   └── part-0.parquet
# │   ├── month=2/
# │   │   └── part-0.parquet
# │   └── ...
# └── year=2024/
#     └── ...

# Read with partition pruning — only reads relevant partitions
df_jan_2024 = pd.read_parquet(
    "./orders_partitioned",
    filters=[("year", "=", 2024), ("month", "=", 1)],
)
print(f"January 2024 orders: {len(df_jan_2024)}")

# Read with predicate pushdown (row-group level filtering)
df_big_orders = pd.read_parquet(
    "./orders_partitioned",
    filters=[("amount", ">", 400)],
    columns=["order_id", "amount", "customer_id"],
)
```

### Parquet Schema Evolution

```python
# parquet_schema_evolution.py — Adding columns safely
import pyarrow as pa
import pyarrow.parquet as pq
import pandas as pd


def write_with_schema(df: pd.DataFrame, path: str, schema: pa.Schema):
    """Write DataFrame with explicit schema for consistency."""
    table = pa.Table.from_pandas(df, schema=schema, preserve_index=False)
    pq.write_table(table, path)


# Version 1 schema
schema_v1 = pa.schema([
    ("id", pa.int64()),
    ("name", pa.string()),
    ("price", pa.float64()),
])

# Version 2 schema — added column with default
schema_v2 = pa.schema([
    ("id", pa.int64()),
    ("name", pa.string()),
    ("price", pa.float64()),
    ("category", pa.string()),  # New column
])

# Reading mixed-schema Parquet files
# PyArrow handles missing columns gracefully
df_v1 = pd.read_parquet("data_v1.parquet")  # No "category" column
df_v2 = pd.read_parquet("data_v2.parquet")  # Has "category" column

# When reading, specify the expected schema
merged = pq.read_table(
    "data_v1.parquet",
    schema=schema_v2,  # Will fill missing "category" with nulls
)
```

---

## Avro with Schema Registry

Avro is a row-based binary format with a built-in schema. It is the standard for Kafka message serialization.

```python
# avro_handling.py — Avro with schema evolution
import avro.schema
import avro.datafile
import avro.io
import io
import json
import requests
import logging

logger = logging.getLogger(__name__)


# Define Avro schema
PRODUCT_SCHEMA = {
    "type": "record",
    "name": "Product",
    "namespace": "com.example.pipeline",
    "fields": [
        {"name": "id", "type": "long"},
        {"name": "name", "type": "string"},
        {"name": "price", "type": "double"},
        {"name": "category", "type": ["null", "string"], "default": None},
        {"name": "created_at", "type": {"type": "long", "logicalType": "timestamp-millis"}},
    ],
}


def write_avro(records: list[dict], filepath: str, schema_dict: dict):
    """Write records to an Avro file."""
    schema = avro.schema.parse(json.dumps(schema_dict))
    with open(filepath, "wb") as f:
        writer = avro.datafile.DataFileWriter(
            f, avro.io.DatumWriter(), schema, codec="deflate"
        )
        for record in records:
            writer.append(record)
        writer.close()


def read_avro(filepath: str) -> list[dict]:
    """Read records from an Avro file (schema embedded in file)."""
    records = []
    with open(filepath, "rb") as f:
        reader = avro.datafile.DataFileReader(f, avro.io.DatumReader())
        for record in reader:
            records.append(record)
        reader.close()
    return records


# Schema Registry integration (Confluent)
class SchemaRegistry:
    """Interact with Confluent Schema Registry."""

    def __init__(self, url: str):
        self.url = url.rstrip("/")

    def register_schema(self, subject: str, schema: dict) -> int:
        """Register a schema and return its ID."""
        response = requests.post(
            f"{self.url}/subjects/{subject}/versions",
            json={"schema": json.dumps(schema)},
            headers={"Content-Type": "application/vnd.schemaregistry.v1+json"},
        )
        response.raise_for_status()
        return response.json()["id"]

    def get_schema(self, subject: str, version: str = "latest") -> dict:
        """Get a schema by subject and version."""
        response = requests.get(
            f"{self.url}/subjects/{subject}/versions/{version}"
        )
        response.raise_for_status()
        return json.loads(response.json()["schema"])

    def check_compatibility(self, subject: str, schema: dict) -> bool:
        """Check if a new schema is compatible with existing versions."""
        response = requests.post(
            f"{self.url}/compatibility/subjects/{subject}/versions/latest",
            json={"schema": json.dumps(schema)},
            headers={"Content-Type": "application/vnd.schemaregistry.v1+json"},
        )
        response.raise_for_status()
        return response.json()["is_compatible"]


# Usage
registry = SchemaRegistry("http://localhost:8081")
schema_id = registry.register_schema("products-value", PRODUCT_SCHEMA)
```

---

## HDF5 for Scientific Data

HDF5 handles multi-dimensional arrays and hierarchical datasets that tabular formats cannot represent.

```python
# hdf5_handling.py — HDF5 for scientific and ML data
import h5py
import numpy as np
import pandas as pd
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def create_hdf5_dataset(filepath: str):
    """Create an HDF5 file with multiple dataset types."""
    with h5py.File(filepath, "w") as f:
        # Store a 2D array (e.g., image features)
        features = np.random.randn(10000, 512).astype(np.float32)
        f.create_dataset(
            "features",
            data=features,
            compression="gzip",
            compression_opts=4,
            chunks=(100, 512),  # Chunk for efficient partial reads
        )

        # Store labels
        labels = np.random.randint(0, 10, 10000)
        f.create_dataset("labels", data=labels)

        # Store metadata as attributes
        f.attrs["description"] = "Image feature vectors"
        f.attrs["model"] = "ResNet50"
        f.attrs["created_at"] = "2024-01-15"

        # Hierarchical groups
        train_group = f.create_group("splits/train")
        train_group.create_dataset("indices", data=np.arange(8000))

        val_group = f.create_group("splits/val")
        val_group.create_dataset("indices", data=np.arange(8000, 9000))

        test_group = f.create_group("splits/test")
        test_group.create_dataset("indices", data=np.arange(9000, 10000))


def read_hdf5_partial(filepath: str):
    """Read only what you need from HDF5."""
    with h5py.File(filepath, "r") as f:
        # Read only first 100 feature vectors
        features_subset = f["features"][:100]
        labels_subset = f["labels"][:100]

        # Read specific columns (dimensions)
        first_10_dims = f["features"][:, :10]

        # Read metadata
        model = f.attrs["model"]

        print(f"Model: {model}")
        print(f"Subset shape: {features_subset.shape}")
        print(f"First 10 dims shape: {first_10_dims.shape}")


# Store DataFrames in HDF5 (pandas HDFStore)
def store_dataframes_hdf5(filepath: str):
    """Use pandas HDFStore for DataFrames in HDF5."""
    df = pd.DataFrame({
        "id": range(100000),
        "value": np.random.randn(100000),
        "category": np.random.choice(["A", "B", "C"], 100000),
    })

    # table format supports queries
    with pd.HDFStore(filepath, mode="w") as store:
        store.put("data", df, format="table", data_columns=True)

    # Query without loading entire dataset
    with pd.HDFStore(filepath, mode="r") as store:
        subset = store.select("data", where="category == 'A' and value > 0")
        print(f"Filtered: {len(subset)} rows (from 100,000)")
```

---

## Feather / Arrow: Speed for Interop

Feather (Arrow IPC format) provides the fastest read/write for DataFrames. Use it for intermediate pipeline stages and Python-R interop.

```python
# arrow_feather.py — Apache Arrow and Feather format
import pyarrow as pa
import pyarrow.feather as feather
import pyarrow.parquet as pq
import pandas as pd
import numpy as np
import time

# Generate test data
np.random.seed(42)
n = 2_000_000
df = pd.DataFrame({
    "id": np.arange(n),
    "value_a": np.random.randn(n),
    "value_b": np.random.randn(n),
    "category": np.random.choice(["X", "Y", "Z"], n),
    "flag": np.random.choice([True, False], n),
})


# Feather write/read benchmark
t0 = time.time()
feather.write_feather(df, "/tmp/test.feather")
feather_write = time.time() - t0

t0 = time.time()
df_feather = feather.read_feather("/tmp/test.feather")
feather_read = time.time() - t0

# Parquet comparison
t0 = time.time()
df.to_parquet("/tmp/test.parquet")
parquet_write = time.time() - t0

t0 = time.time()
df_parquet = pd.read_parquet("/tmp/test.parquet")
parquet_read = time.time() - t0

# CSV comparison
t0 = time.time()
df.to_csv("/tmp/test.csv", index=False)
csv_write = time.time() - t0

t0 = time.time()
df_csv = pd.read_csv("/tmp/test.csv")
csv_read = time.time() - t0

print(f"{'Format':<15} {'Write':>8} {'Read':>8}")
print(f"{'Feather':<15} {feather_write:>7.3f}s {feather_read:>7.3f}s")
print(f"{'Parquet':<15} {parquet_write:>7.3f}s {parquet_read:>7.3f}s")
print(f"{'CSV':<15} {csv_write:>7.3f}s {csv_read:>7.3f}s")

# Arrow zero-copy: share data between pandas and other libraries
# without copying memory
table = pa.Table.from_pandas(df)
# table can be passed to DuckDB, Polars, or R without copying


# Feather with compression (LZ4 or ZSTD)
feather.write_feather(
    df,
    "/tmp/test_compressed.feather",
    compression="zstd",
    compression_level=3,
)

# Read specific columns (columnar access)
df_subset = feather.read_feather(
    "/tmp/test.feather",
    columns=["id", "value_a"],
)
```

---

## Format Selection Decision Tree

```python
# format_selector.py — Choose the right format
def select_format(
    use_case: str,
    human_readable: bool = False,
    streaming_writes: bool = False,
    partial_column_reads: bool = False,
    schema_evolution: bool = False,
    interop_languages: list[str] | None = None,
    max_file_size_gb: float = 1.0,
) -> str:
    """Recommend a file format based on requirements."""

    interop = interop_languages or []

    # Decision logic
    if use_case == "kafka_messages":
        return "AVRO — Built for Kafka, schema registry integration, row-oriented for streaming"

    if use_case == "ml_features" and max_file_size_gb > 10:
        return "HDF5 — Multi-dimensional arrays, partial reads, chunked storage"

    if streaming_writes and human_readable:
        return "JSONL — Append-friendly, one record per line, human readable"

    if streaming_writes and not human_readable:
        return "AVRO — Binary, schema embedded, append-friendly"

    if partial_column_reads and schema_evolution:
        return "PARQUET — Columnar, predicate pushdown, schema evolution, compression"

    if "R" in interop or use_case == "pipeline_intermediate":
        return "FEATHER — Fastest read/write, zero-copy Arrow interop"

    if partial_column_reads:
        return "PARQUET — Columnar reads, excellent compression, wide tool support"

    if human_readable and max_file_size_gb < 0.1:
        return "CSV — Universal compatibility, human readable, but be careful with types"

    if human_readable:
        return "JSONL — Structured, self-documenting, streamable"

    return "PARQUET — Safe default for analytics and ML pipelines"


# Examples
print(select_format("analytics", partial_column_reads=True))
# PARQUET

print(select_format("kafka_messages"))
# AVRO

print(select_format("pipeline_intermediate", interop_languages=["R", "Python"]))
# FEATHER

print(select_format("logging", streaming_writes=True, human_readable=True))
# JSONL
```

---

## Format Conversion Utilities

```python
# format_converter.py — Convert between formats
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.feather as feather
import json
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class FormatConverter:
    """Convert data between file formats with type preservation."""

    @staticmethod
    def csv_to_parquet(
        csv_path: str,
        parquet_path: str,
        dtypes: dict | None = None,
        parse_dates: list[str] | None = None,
        compression: str = "snappy",
    ) -> int:
        """Convert CSV to Parquet with explicit type control."""
        df = pd.read_csv(
            csv_path,
            dtype=dtypes or {},
            parse_dates=parse_dates or False,
            low_memory=False,
        )
        df.to_parquet(parquet_path, index=False, compression=compression)
        logger.info(f"Converted {len(df)} rows: {csv_path} -> {parquet_path}")
        return len(df)

    @staticmethod
    def jsonl_to_parquet(
        jsonl_path: str,
        parquet_path: str,
        compression: str = "snappy",
    ) -> int:
        """Convert JSONL to Parquet."""
        records = []
        with open(jsonl_path) as f:
            for line in f:
                if line.strip():
                    records.append(json.loads(line))

        df = pd.DataFrame(records)
        df.to_parquet(parquet_path, index=False, compression=compression)
        logger.info(f"Converted {len(df)} records: {jsonl_path} -> {parquet_path}")
        return len(df)

    @staticmethod
    def parquet_to_feather(parquet_path: str, feather_path: str) -> int:
        """Convert Parquet to Feather (zero-copy via Arrow)."""
        table = pq.read_table(parquet_path)
        feather.write_feather(table, feather_path)
        logger.info(f"Converted {table.num_rows} rows: {parquet_path} -> {feather_path}")
        return table.num_rows

    @staticmethod
    def any_to_parquet(input_path: str, output_path: str | None = None) -> str:
        """Auto-detect format and convert to Parquet."""
        path = Path(input_path)
        output = output_path or str(path.with_suffix(".parquet"))

        if path.suffix == ".csv":
            FormatConverter.csv_to_parquet(str(path), output)
        elif path.suffix == ".jsonl" or path.suffix == ".ndjson":
            FormatConverter.jsonl_to_parquet(str(path), output)
        elif path.suffix == ".json":
            df = pd.read_json(str(path))
            df.to_parquet(output, index=False)
        elif path.suffix == ".feather":
            table = feather.read_table(str(path))
            pq.write_table(table, output)
        elif path.suffix in (".xls", ".xlsx"):
            df = pd.read_excel(str(path))
            df.to_parquet(output, index=False)
        else:
            raise ValueError(f"Unsupported format: {path.suffix}")

        return output


# Usage
converter = FormatConverter()
converter.csv_to_parquet(
    "raw_data.csv",
    "clean_data.parquet",
    dtypes={"zip_code": str, "phone": str},
    parse_dates=["created_at", "updated_at"],
)
```

---

## Quick Reference

| Format | Read Speed | Write Speed | Compression | Column Pruning | Best Use Case |
|--------|-----------|-------------|-------------|----------------|---------------|
| CSV | Slow | Medium | None | No | Data exchange, Excel compat |
| JSON | Slow | Slow | None | No | Config, nested data |
| JSONL | Medium | Fast (append) | None | No | Logging, streaming |
| Parquet | Fast | Medium | Excellent | Yes | Analytics, ML, data lakes |
| Avro | Fast | Fast | Good | No | Kafka, schema evolution |
| Feather | Fastest | Fastest | Good | Yes | Pipeline intermediates |
| HDF5 | Fast | Fast | Good | Partial | Scientific, ML tensors |

---

::: tip Key Takeaway
- Parquet is the default choice for analytics and ML pipelines because of columnar reads, excellent compression, and embedded schema.
- CSV is a universal footgun: no schema, no types, encoding ambiguity, and silent data corruption from leading zeros and embedded newlines.
- Choose the format based on read pattern (columnar vs row), schema needs, and whether humans need to inspect the data.
:::

::: details Exercise
**Format Benchmark and Migration**

1. Generate a DataFrame with 1M rows and 10 columns (mix of int, float, string, datetime, boolean).
2. Write it in CSV, JSON, JSONL, Parquet (snappy), Parquet (zstd), and Feather.
3. Measure and compare: file size, write time, full-read time, and 2-column read time.
4. Write a `convert_to_parquet(input_path)` function that auto-detects CSV/JSON/JSONL and converts to Parquet with explicit dtypes.

**Solution Sketch**

```python
import pandas as pd, numpy as np, time
from pathlib import Path

np.random.seed(42)
n = 1_000_000
df = pd.DataFrame({
    "id": np.arange(n), "value": np.random.randn(n),
    "cat": np.random.choice(["A","B","C"], n),
    "ts": pd.date_range("2024-01-01", periods=n, freq="s"),
    "flag": np.random.choice([True, False], n),
})

formats = {
    "csv": lambda p: df.to_csv(p, index=False),
    "parquet_snappy": lambda p: df.to_parquet(p, compression="snappy"),
    "parquet_zstd": lambda p: df.to_parquet(p, compression="zstd"),
    "feather": lambda p: df.to_feather(p),
}

for name, writer in formats.items():
    path = f"/tmp/bench.{name}"
    t0 = time.time()
    writer(path)
    print(f"{name}: write={time.time()-t0:.2f}s, size={Path(path).stat().st_size/1e6:.1f}MB")
```
:::

::: details Debugging Scenario
**Your pipeline reads a CSV file daily. One day, the row count drops by 40% with no errors. The source confirms they sent the same number of records.**

Diagnose and fix it.

**Answer**

The most likely cause is **embedded newlines in quoted fields** combined with a misconfigured CSV reader. When a field contains a literal newline (e.g., a product description with line breaks) and the parser does not handle quoting correctly, it splits one logical row into multiple rows, some of which fail silently or are dropped.

Diagnosis steps:
1. Compare raw file line count (`wc -l`) with expected row count -- if line count is much higher than row count, embedded newlines are present.
2. Open the file in a hex editor or use `python -c "import csv; print(sum(1 for _ in csv.reader(open('file.csv'))))"` which handles quoting correctly.
3. Check if the source system changed its CSV quoting style (e.g., removed `QUOTE_ALL`).

Fix: use `pd.read_csv()` with `quoting=csv.QUOTE_ALL` and `engine="python"` for maximum compatibility, or better yet, ask the source to switch to Parquet which has no ambiguity.
:::

::: warning Common Misconceptions
- **"CSV is a simple, safe format."** CSV has no formal standard, no types, no schema, and dozens of edge cases (encoding, quoting, delimiters, newlines) that silently corrupt data.
- **"JSON is efficient for large datasets."** JSON is verbose, slow to parse, and cannot be partially read. For datasets over 100MB, Parquet or Feather is 5-20x more efficient.
- **"Parquet files are immutable and append-unfriendly."** You cannot append to a single Parquet file, but you can use partitioned datasets (one file per partition) for append-like workflows.
- **"Feather is just fast Parquet."** Feather (Arrow IPC) is optimized for speed, not compression. It is best for intermediate pipeline stages and inter-language data sharing, not long-term storage.
:::

::: details Quiz
**1. Why does Parquet achieve much better compression than CSV for the same data?**

> Parquet stores data in columnar layout, so values of the same type and distribution are adjacent. This enables run-length encoding, dictionary encoding, and delta encoding that exploit data homogeneity -- impossible in row-oriented CSV.

**2. What is the difference between Avro and Parquet, and when would you choose each?**

> Avro is row-oriented with an embedded schema, optimized for write-heavy streaming (Kafka). Parquet is columnar, optimized for read-heavy analytics queries. Use Avro for message serialization and Parquet for data lakes.

**3. What happens when you read a CSV with `pd.read_csv()` and a column contains "NA" as a valid value?**

> Pandas interprets "NA" as a missing value (`NaN`) by default. Fix with `keep_default_na=False` or by specifying `na_values` explicitly.

**4. What is predicate pushdown in Parquet?**

> Predicate pushdown filters rows at the storage layer using row group statistics (min/max values), so only relevant row groups are read from disk. This dramatically speeds up filtered queries.

**5. Why is Feather faster than Parquet for read/write but not recommended for long-term storage?**

> Feather uses Arrow's IPC format with minimal encoding overhead, making serialization near-instant. However, it lacks Parquet's advanced compression, partitioning, and ecosystem support for data lake storage.
:::

> **One-Liner Summary:** Parquet is the safe default for analytics pipelines; CSV is for human exchange only; Avro is for streaming; and choosing wrong silently wastes storage, corrupts types, or makes queries 10x slower.
