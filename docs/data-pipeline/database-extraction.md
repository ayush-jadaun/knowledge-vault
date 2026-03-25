---
title: "Database Extraction"
description: "Extracting data from databases at scale — SQLAlchemy patterns, incremental extraction with watermarks, Change Data Capture with Debezium, bulk export strategies, cross-database extraction, and handling schema changes in production pipelines."
tags: [database-extraction, sqlalchemy, cdc, debezium, etl]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Database Extraction

Database extraction is the most common data collection method in enterprise pipelines. Your source of truth lives in PostgreSQL, MySQL, SQL Server, or MongoDB, and you need to get that data into a warehouse, data lake, or ML pipeline without crushing the source database, missing records, or corrupting types. This page covers every extraction pattern from simple queries to change data capture.

---

## Extraction Patterns Overview

```mermaid
flowchart TD
    A["Source Database"] --> B{"Extraction Strategy"}
    B -->|"Small table,<br/>infrequent"| C["Full Extract"]
    B -->|"Large table,<br/>frequent"| D["Incremental Extract"]
    B -->|"Real-time needed"| E["CDC<br/>(Change Data Capture)"]
    B -->|"One-time migration"| F["Bulk Export"]

    C --> G["Destination"]
    D --> G
    E --> G
    F --> G

    style A fill:#2563eb,color:#fff
    style C fill:#059669,color:#fff
    style D fill:#7c3aed,color:#fff
    style E fill:#f97316,color:#fff
    style F fill:#64748b,color:#fff
```

| Strategy | Latency | Source Load | Complexity | Best For |
|----------|---------|------------|------------|----------|
| Full Extract | High | High | Low | Small tables, reference data |
| Incremental (timestamp) | Medium | Low | Medium | Tables with `updated_at` |
| Incremental (ID) | Medium | Low | Medium | Append-only tables |
| CDC (log-based) | Low | Minimal | High | Real-time sync, audit |
| Bulk Export | Very High | Very High | Low | One-time migrations |

---

## SQLAlchemy for Extraction

SQLAlchemy provides database-agnostic extraction with connection pooling, type mapping, and query building.

### Connection Setup

```python
# db_connection.py — Configurable database connections
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.pool import QueuePool
import logging
from dataclasses import dataclass
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)


@dataclass
class DBConfig:
    """Database connection configuration."""
    dialect: str       # postgresql, mysql, mssql, sqlite
    host: str
    port: int
    database: str
    username: str
    password: str
    schema: str | None = None
    pool_size: int = 5
    max_overflow: int = 10
    pool_timeout: int = 30

    @property
    def url(self) -> str:
        password_encoded = quote_plus(self.password)
        base = (
            f"{self.dialect}://{self.username}:{password_encoded}"
            f"@{self.host}:{self.port}/{self.database}"
        )
        return base


def create_extraction_engine(config: DBConfig) -> Engine:
    """Create a SQLAlchemy engine optimized for extraction."""
    engine = create_engine(
        config.url,
        poolclass=QueuePool,
        pool_size=config.pool_size,
        max_overflow=config.max_overflow,
        pool_timeout=config.pool_timeout,
        pool_pre_ping=True,  # Verify connections before use
        echo=False,
        # Extraction-specific: large fetch sizes
        execution_options={
            "stream_results": True,  # Server-side cursors
        },
    )

    # Verify connection
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        result.fetchone()
        logger.info(f"Connected to {config.dialect}://{config.host}/{config.database}")

    return engine


def discover_schema(engine: Engine, schema: str | None = None) -> dict:
    """Discover all tables and their columns in a database."""
    inspector = inspect(engine)
    tables = {}

    for table_name in inspector.get_table_names(schema=schema):
        columns = inspector.get_columns(table_name, schema=schema)
        pk = inspector.get_pk_constraint(table_name, schema=schema)
        indexes = inspector.get_indexes(table_name, schema=schema)

        tables[table_name] = {
            "columns": {
                col["name"]: {
                    "type": str(col["type"]),
                    "nullable": col["nullable"],
                    "default": str(col.get("default", "")),
                }
                for col in columns
            },
            "primary_key": pk.get("constrained_columns", []),
            "indexes": [idx["name"] for idx in indexes],
        }

    return tables


# Usage
config = DBConfig(
    dialect="postgresql",
    host="localhost",
    port=5432,
    database="ecommerce",
    username="readonly_user",
    password="secure_password",
)
engine = create_extraction_engine(config)
schema = discover_schema(engine)
for table, info in schema.items():
    print(f"  {table}: {len(info['columns'])} columns, PK={info['primary_key']}")
```

### Full Table Extraction

```python
# full_extract.py — Extract entire tables with chunking
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from pathlib import Path
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class FullExtractor:
    """Extract entire tables, optionally in chunks to limit memory."""

    def __init__(self, engine: Engine, output_dir: str = "./extracted"):
        self.engine = engine
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def extract_table(
        self,
        table_name: str,
        schema: str | None = None,
        chunk_size: int = 50_000,
        columns: list[str] | None = None,
        where_clause: str | None = None,
    ) -> Path:
        """
        Extract a full table to Parquet, processing in chunks.
        Uses server-side cursors to avoid loading entire table into memory.
        """
        qualified_name = f"{schema}.{table_name}" if schema else table_name
        col_list = ", ".join(columns) if columns else "*"
        query = f"SELECT {col_list} FROM {qualified_name}"
        if where_clause:
            query += f" WHERE {where_clause}"

        logger.info(f"Extracting: {query}")

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        output_path = self.output_dir / f"{table_name}_{timestamp}.parquet"

        # Read in chunks and write incrementally
        chunk_num = 0
        total_rows = 0
        parquet_files = []

        with self.engine.connect() as conn:
            for chunk_df in pd.read_sql(
                text(query),
                conn,
                chunksize=chunk_size,
            ):
                chunk_path = self.output_dir / f"{table_name}_{timestamp}_chunk{chunk_num:04d}.parquet"
                chunk_df.to_parquet(chunk_path, index=False, engine="pyarrow")
                parquet_files.append(chunk_path)
                total_rows += len(chunk_df)
                chunk_num += 1
                logger.info(
                    f"Chunk {chunk_num}: {len(chunk_df)} rows "
                    f"(total: {total_rows})"
                )

        # Merge chunks into single file
        if parquet_files:
            dfs = [pd.read_parquet(f) for f in parquet_files]
            combined = pd.concat(dfs, ignore_index=True)
            combined.to_parquet(output_path, index=False, engine="pyarrow")

            # Cleanup chunk files
            for f in parquet_files:
                f.unlink()

        logger.info(f"Extracted {total_rows} rows to {output_path}")
        return output_path

    def extract_query(self, query: str, name: str) -> Path:
        """Extract results of an arbitrary SQL query."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        output_path = self.output_dir / f"{name}_{timestamp}.parquet"

        with self.engine.connect() as conn:
            df = pd.read_sql(text(query), conn)

        df.to_parquet(output_path, index=False)
        logger.info(f"Query '{name}': {len(df)} rows to {output_path}")
        return output_path


# Usage
extractor = FullExtractor(engine)
extractor.extract_table("products", chunk_size=10_000)
extractor.extract_table(
    "orders",
    columns=["id", "customer_id", "total", "created_at"],
    where_clause="created_at >= '2024-01-01'",
)
```

### Incremental Extraction

```python
# incremental_extract.py — Extract only new/changed records
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from pathlib import Path
from datetime import datetime
import json
import logging

logger = logging.getLogger(__name__)


class IncrementalExtractor:
    """
    Extract only records that have changed since the last run.
    Uses a high-water mark (timestamp or ID) to track progress.
    """

    def __init__(self, engine: Engine, state_dir: str = "./extract_state"):
        self.engine = engine
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True)

    def _load_watermark(self, table_name: str) -> dict:
        """Load the last extraction state."""
        state_file = self.state_dir / f"{table_name}.json"
        if state_file.exists():
            return json.loads(state_file.read_text())
        return {}

    def _save_watermark(self, table_name: str, state: dict):
        """Save extraction state for next run."""
        state_file = self.state_dir / f"{table_name}.json"
        state_file.write_text(json.dumps(state, default=str))

    def extract_by_timestamp(
        self,
        table_name: str,
        timestamp_column: str = "updated_at",
        output_dir: str = "./extracted",
    ) -> pd.DataFrame:
        """
        Extract records modified since last extraction.
        Requires: table has a reliable updated_at column that
        is updated on every INSERT and UPDATE.
        """
        state = self._load_watermark(table_name)
        last_timestamp = state.get("last_timestamp", "1970-01-01T00:00:00")

        query = text(f"""
            SELECT *
            FROM {table_name}
            WHERE {timestamp_column} > :last_timestamp
            ORDER BY {timestamp_column} ASC
        """)

        with self.engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"last_timestamp": last_timestamp})

        if df.empty:
            logger.info(f"No new records in {table_name} since {last_timestamp}")
            return df

        # Update watermark to latest timestamp in extracted data
        new_watermark = df[timestamp_column].max()
        self._save_watermark(table_name, {
            "last_timestamp": str(new_watermark),
            "last_run": datetime.utcnow().isoformat(),
            "records_extracted": len(df),
        })

        # Save extracted data
        output_path = Path(output_dir) / f"{table_name}_incremental.parquet"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(output_path, index=False)

        logger.info(
            f"Extracted {len(df)} records from {table_name} "
            f"(since {last_timestamp}, new watermark: {new_watermark})"
        )
        return df

    def extract_by_id(
        self,
        table_name: str,
        id_column: str = "id",
        output_dir: str = "./extracted",
    ) -> pd.DataFrame:
        """
        Extract records with IDs higher than last extracted.
        Only works for append-only tables (no updates).
        """
        state = self._load_watermark(table_name)
        last_id = state.get("last_id", 0)

        query = text(f"""
            SELECT *
            FROM {table_name}
            WHERE {id_column} > :last_id
            ORDER BY {id_column} ASC
        """)

        with self.engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"last_id": last_id})

        if df.empty:
            logger.info(f"No new records in {table_name} since ID {last_id}")
            return df

        new_last_id = df[id_column].max()
        self._save_watermark(table_name, {
            "last_id": int(new_last_id),
            "last_run": datetime.utcnow().isoformat(),
            "records_extracted": len(df),
        })

        output_path = Path(output_dir) / f"{table_name}_incremental.parquet"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(output_path, index=False)

        logger.info(
            f"Extracted {len(df)} new records from {table_name} "
            f"(IDs {last_id + 1} to {new_last_id})"
        )
        return df


# Usage
extractor = IncrementalExtractor(engine)

# First run extracts everything, subsequent runs only new/changed records
orders_df = extractor.extract_by_timestamp("orders", "updated_at")
events_df = extractor.extract_by_id("events", "event_id")
```

---

## Change Data Capture (CDC)

CDC captures every INSERT, UPDATE, and DELETE as it happens by reading the database's write-ahead log (WAL). Zero impact on query performance.

### CDC Architecture with Debezium

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  PostgreSQL  │────>│   Debezium   │────>│    Kafka      │────>│  Consumer    │
│  (WAL)       │     │  Connector   │     │   Topic       │     │  (Python)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
     │                                          │
     │ Reads binary                             │ Events:
     │ replication slot                         │ - INSERT
     │                                          │ - UPDATE (before + after)
     │                                          │ - DELETE (before image)
```

### Debezium Connector Configuration

```python
# debezium_setup.py — Register a Debezium connector via REST API
import requests
import json


def register_postgres_connector(
    connect_url: str,
    connector_name: str,
    db_host: str,
    db_port: int,
    db_name: str,
    db_user: str,
    db_password: str,
    tables: list[str],
    kafka_bootstrap: str = "kafka:9092",
) -> dict:
    """Register a Debezium PostgreSQL connector."""
    config = {
        "name": connector_name,
        "config": {
            "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
            "database.hostname": db_host,
            "database.port": str(db_port),
            "database.user": db_user,
            "database.password": db_password,
            "database.dbname": db_name,
            "database.server.name": connector_name,

            # Tables to capture
            "table.include.list": ",".join(tables),

            # Kafka settings
            "topic.prefix": connector_name,

            # Capture settings
            "plugin.name": "pgoutput",
            "slot.name": f"{connector_name}_slot",
            "publication.name": f"{connector_name}_pub",

            # Snapshot mode
            "snapshot.mode": "initial",  # Full snapshot first, then CDC

            # Schema handling
            "schema.history.internal.kafka.bootstrap.servers": kafka_bootstrap,
            "schema.history.internal.kafka.topic": f"{connector_name}.schema-changes",

            # Transforms: flatten the event structure
            "transforms": "unwrap",
            "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
            "transforms.unwrap.add.fields": "op,source.ts_ms",
            "transforms.unwrap.delete.handling.mode": "rewrite",

            # Heartbeat to keep replication slot active
            "heartbeat.interval.ms": "30000",
        },
    }

    response = requests.post(
        f"{connect_url}/connectors",
        headers={"Content-Type": "application/json"},
        data=json.dumps(config),
    )
    response.raise_for_status()
    return response.json()


# Usage
register_postgres_connector(
    connect_url="http://localhost:8083",
    connector_name="ecommerce",
    db_host="postgres",
    db_port=5432,
    db_name="ecommerce",
    db_user="debezium",
    db_password="dbz_password",
    tables=["public.orders", "public.products", "public.customers"],
)
```

### Consuming CDC Events in Python

```python
# cdc_consumer.py — Process Debezium CDC events
from confluent_kafka import Consumer, KafkaError, KafkaException
import json
import logging
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)


class CDCEvent:
    """Parsed CDC event from Debezium."""

    def __init__(self, raw_event: dict):
        self.operation = raw_event.get("__op", "r")  # c=create, u=update, d=delete, r=read
        self.timestamp = raw_event.get("__source_ts_ms", 0)
        self.before = raw_event.get("__before", {})
        # After unwrap transform, the payload IS the after state
        self.after = {
            k: v for k, v in raw_event.items()
            if not k.startswith("__")
        }

    @property
    def operation_name(self) -> str:
        return {"c": "INSERT", "u": "UPDATE", "d": "DELETE", "r": "SNAPSHOT"}.get(
            self.operation, "UNKNOWN"
        )

    def __repr__(self):
        return f"CDCEvent({self.operation_name}, ts={self.timestamp})"


class CDCConsumer:
    """Consume and process CDC events from Kafka."""

    def __init__(
        self,
        bootstrap_servers: str,
        group_id: str,
        topics: list[str],
        batch_size: int = 100,
        output_dir: str = "./cdc_output",
    ):
        self.consumer = Consumer({
            "bootstrap.servers": bootstrap_servers,
            "group.id": group_id,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        })
        self.topics = topics
        self.batch_size = batch_size
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.batch: list[dict] = []

    def start(self, handler: Callable[[CDCEvent], None] | None = None):
        """Start consuming CDC events."""
        self.consumer.subscribe(self.topics)
        logger.info(f"Subscribed to topics: {self.topics}")

        try:
            while True:
                msg = self.consumer.poll(timeout=1.0)
                if msg is None:
                    if self.batch:
                        self._flush_batch()
                    continue
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    raise KafkaException(msg.error())

                # Parse event
                value = json.loads(msg.value().decode("utf-8"))
                event = CDCEvent(value)

                if handler:
                    handler(event)

                # Collect for batch writing
                record = {**event.after}
                record["_cdc_operation"] = event.operation
                record["_cdc_timestamp"] = event.timestamp
                record["_cdc_topic"] = msg.topic()
                self.batch.append(record)

                if len(self.batch) >= self.batch_size:
                    self._flush_batch()
                    self.consumer.commit()

        except KeyboardInterrupt:
            logger.info("Shutting down...")
        finally:
            if self.batch:
                self._flush_batch()
            self.consumer.close()

    def _flush_batch(self):
        """Write batch to Parquet."""
        if not self.batch:
            return

        df = pd.DataFrame(self.batch)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
        path = self.output_dir / f"cdc_{timestamp}.parquet"
        df.to_parquet(path, index=False)
        logger.info(f"Flushed {len(self.batch)} CDC events to {path}")
        self.batch = []


# Usage
consumer = CDCConsumer(
    bootstrap_servers="localhost:9092",
    group_id="pipeline-consumer",
    topics=["ecommerce.public.orders", "ecommerce.public.products"],
    batch_size=500,
)

def on_event(event: CDCEvent):
    if event.operation == "d":
        logger.warning(f"DELETE detected: {event.after}")

consumer.start(handler=on_event)
```

---

## Bulk Export Strategies

For one-time migrations or initial loads of very large tables.

```python
# bulk_export.py — High-performance bulk export
import subprocess
import logging
from pathlib import Path
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class BulkExportConfig:
    host: str
    port: int
    database: str
    username: str
    password: str
    output_dir: str = "./bulk_export"


class PostgresBulkExporter:
    """Use COPY command for maximum export performance."""

    def __init__(self, config: BulkExportConfig):
        self.config = config
        self.output_dir = Path(config.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def export_table_copy(self, table_name: str) -> Path:
        """
        Use PostgreSQL COPY TO for fastest possible export.
        Bypasses SQL layer entirely — reads directly from storage.
        """
        output_path = self.output_dir / f"{table_name}.csv"

        copy_command = f"\\COPY {table_name} TO STDOUT WITH (FORMAT csv, HEADER true)"

        cmd = [
            "psql",
            "-h", self.config.host,
            "-p", str(self.config.port),
            "-U", self.config.username,
            "-d", self.config.database,
            "-c", copy_command,
        ]

        env = {"PGPASSWORD": self.config.password}

        with open(output_path, "w") as f:
            result = subprocess.run(
                cmd,
                stdout=f,
                stderr=subprocess.PIPE,
                env={**dict(__import__("os").environ), **env},
                timeout=3600,
            )

        if result.returncode != 0:
            raise RuntimeError(f"COPY failed: {result.stderr.decode()}")

        size_mb = output_path.stat().st_size / (1024 * 1024)
        logger.info(f"Exported {table_name}: {size_mb:.1f} MB to {output_path}")
        return output_path

    def export_with_python(
        self,
        table_name: str,
        engine,
        chunk_size: int = 100_000,
    ) -> Path:
        """Fallback: Python-based chunked export using SQLAlchemy."""
        import pandas as pd
        from sqlalchemy import text

        output_path = self.output_dir / f"{table_name}.parquet"
        chunks = []

        with engine.connect() as conn:
            query = text(f"SELECT * FROM {table_name}")
            for chunk_df in pd.read_sql(query, conn, chunksize=chunk_size):
                chunks.append(chunk_df)
                logger.info(
                    f"Read chunk: {len(chunk_df)} rows "
                    f"(total: {sum(len(c) for c in chunks)})"
                )

        if chunks:
            df = pd.concat(chunks, ignore_index=True)
            df.to_parquet(output_path, index=False, engine="pyarrow")
            logger.info(f"Exported {len(df)} rows to {output_path}")

        return output_path
```

---

## Cross-Database Extraction

Extracting from multiple databases into a unified format.

```python
# cross_db_extract.py — Unified extraction from multiple databases
from sqlalchemy import create_engine, text, inspect
import pandas as pd
import logging
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)


@dataclass
class SourceConfig:
    name: str
    connection_url: str
    tables: list[str]
    schema: str | None = None


class CrossDatabaseExtractor:
    """Extract from multiple databases in parallel."""

    def __init__(self, sources: list[SourceConfig], output_dir: str = "./multi_source"):
        self.sources = sources
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.engines = {}

    def _get_engine(self, source: SourceConfig):
        if source.name not in self.engines:
            self.engines[source.name] = create_engine(
                source.connection_url,
                pool_size=3,
                pool_pre_ping=True,
            )
        return self.engines[source.name]

    def extract_all(self, max_workers: int = 4) -> dict:
        """Extract all tables from all sources in parallel."""
        results = {}

        tasks = []
        for source in self.sources:
            for table in source.tables:
                tasks.append((source, table))

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(self._extract_one, source, table): (source.name, table)
                for source, table in tasks
            }

            for future in as_completed(futures):
                source_name, table = futures[future]
                try:
                    path, row_count = future.result()
                    results[f"{source_name}.{table}"] = {
                        "status": "success",
                        "rows": row_count,
                        "path": str(path),
                    }
                except Exception as e:
                    results[f"{source_name}.{table}"] = {
                        "status": "error",
                        "error": str(e),
                    }
                    logger.error(f"Failed {source_name}.{table}: {e}")

        return results

    def _extract_one(self, source: SourceConfig, table: str) -> tuple[Path, int]:
        """Extract a single table from a source."""
        engine = self._get_engine(source)
        qualified = f"{source.schema}.{table}" if source.schema else table

        with engine.connect() as conn:
            df = pd.read_sql(text(f"SELECT * FROM {qualified}"), conn)

        source_dir = self.output_dir / source.name
        source_dir.mkdir(exist_ok=True)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        path = source_dir / f"{table}_{timestamp}.parquet"
        df.to_parquet(path, index=False)

        logger.info(f"{source.name}.{table}: {len(df)} rows")
        return path, len(df)


# Usage
sources = [
    SourceConfig(
        name="ecommerce_pg",
        connection_url="postgresql://user:pass@pg-host:5432/ecommerce",
        tables=["orders", "products", "customers"],
    ),
    SourceConfig(
        name="analytics_mysql",
        connection_url="mysql+pymysql://user:pass@mysql-host:3306/analytics",
        tables=["page_views", "sessions", "events"],
    ),
    SourceConfig(
        name="crm_mssql",
        connection_url="mssql+pyodbc://user:pass@mssql-host/crm?driver=ODBC+Driver+18",
        tables=["contacts", "deals", "activities"],
        schema="dbo",
    ),
]

extractor = CrossDatabaseExtractor(sources)
results = extractor.extract_all(max_workers=6)

for key, result in results.items():
    print(f"  {key}: {result['status']} ({result.get('rows', 'N/A')} rows)")
```

---

## Handling Schema Changes

Databases schemas change. Your extraction pipeline must detect and adapt.

```python
# schema_tracker.py — Detect and handle schema changes
import json
import logging
from pathlib import Path
from sqlalchemy import inspect
from sqlalchemy.engine import Engine
from datetime import datetime
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class SchemaChange:
    table: str
    change_type: str  # "column_added", "column_removed", "type_changed"
    column: str
    details: str
    detected_at: str


class SchemaTracker:
    """Track and detect database schema changes between extraction runs."""

    def __init__(self, engine: Engine, state_dir: str = "./schema_state"):
        self.engine = engine
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True)

    def _get_current_schema(self, table_name: str, schema: str | None = None) -> dict:
        """Get current column definitions from database."""
        inspector = inspect(self.engine)
        columns = inspector.get_columns(table_name, schema=schema)
        return {
            col["name"]: {
                "type": str(col["type"]),
                "nullable": col["nullable"],
            }
            for col in columns
        }

    def check_table(
        self,
        table_name: str,
        schema: str | None = None,
        fail_on_breaking_change: bool = False,
    ) -> list[SchemaChange]:
        """Compare current schema against saved baseline."""
        state_file = self.state_dir / f"{table_name}_schema.json"
        current = self._get_current_schema(table_name, schema)

        if not state_file.exists():
            state_file.write_text(json.dumps(current, indent=2))
            logger.info(f"Saved baseline schema for {table_name}")
            return []

        previous = json.loads(state_file.read_text())
        changes = []
        now = datetime.utcnow().isoformat()

        # Check for added columns
        for col in set(current) - set(previous):
            changes.append(SchemaChange(
                table=table_name,
                change_type="column_added",
                column=col,
                details=f"Type: {current[col]['type']}, Nullable: {current[col]['nullable']}",
                detected_at=now,
            ))

        # Check for removed columns
        for col in set(previous) - set(current):
            changes.append(SchemaChange(
                table=table_name,
                change_type="column_removed",
                column=col,
                details=f"Was: {previous[col]['type']}",
                detected_at=now,
            ))

        # Check for type changes
        for col in set(current) & set(previous):
            if current[col]["type"] != previous[col]["type"]:
                changes.append(SchemaChange(
                    table=table_name,
                    change_type="type_changed",
                    column=col,
                    details=f"{previous[col]['type']} -> {current[col]['type']}",
                    detected_at=now,
                ))

        if changes:
            logger.warning(
                f"Schema changes detected in {table_name}:\n"
                + "\n".join(
                    f"  [{c.change_type}] {c.column}: {c.details}"
                    for c in changes
                )
            )

            breaking = [c for c in changes if c.change_type in ("column_removed", "type_changed")]
            if breaking and fail_on_breaking_change:
                raise RuntimeError(
                    f"Breaking schema change in {table_name}: {breaking}"
                )

            # Update saved schema
            state_file.write_text(json.dumps(current, indent=2))

            # Log changes to history
            history_file = self.state_dir / f"{table_name}_history.jsonl"
            with open(history_file, "a") as f:
                for change in changes:
                    f.write(json.dumps({
                        "table": change.table,
                        "type": change.change_type,
                        "column": change.column,
                        "details": change.details,
                        "detected_at": change.detected_at,
                    }) + "\n")

        return changes


# Usage
tracker = SchemaTracker(engine)

# Run before every extraction
changes = tracker.check_table("orders", fail_on_breaking_change=True)
if not changes:
    print("Schema unchanged, safe to extract")
```

---

## Quick Reference

| Extraction Method | Source Load | Latency | Captures Deletes | Complexity |
|-------------------|-----------|---------|------------------|------------|
| Full extract (SELECT *) | High | High | Yes (by comparison) | Low |
| Incremental (timestamp) | Low | Medium | No | Medium |
| Incremental (ID) | Low | Medium | No | Low |
| CDC (Debezium) | Minimal | Seconds | Yes | High |
| pg_dump / COPY | High (one-time) | N/A | N/A | Low |

| SQLAlchemy Feature | Use Case |
|--------------------|----------|
| `create_engine(stream_results=True)` | Server-side cursors for large tables |
| `pd.read_sql(chunksize=N)` | Memory-bounded chunked reading |
| `inspect(engine)` | Schema discovery |
| `pool_pre_ping=True` | Auto-reconnect on stale connections |
| `text()` | Raw SQL with parameter binding |
