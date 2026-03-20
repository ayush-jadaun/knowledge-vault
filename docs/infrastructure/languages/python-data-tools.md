---
title: "Python Data Ecosystem"
description: "Modern Python data tooling — pandas vs polars performance, Pydantic v2 data validation, SQLAlchemy 2.0 patterns, and the new packaging landscape with Poetry, uv, and ruff"
tags: [python, pandas, polars, pydantic, data-tools]
difficulty: intermediate
prerequisites:
  - cheat-sheets/python
lastReviewed: "2026-03-20"
---

# Python Data Ecosystem

Python's data ecosystem has undergone a fundamental shift. Polars is replacing pandas for performance-critical workloads. Pydantic v2, rewritten in Rust, is 5-50x faster than v1. SQLAlchemy 2.0 introduces a modern, type-friendly API. And the packaging landscape has been upended by `uv` (a Rust-based package manager that is 10-100x faster than pip) and `ruff` (a linter that replaces flake8, isort, and black in a single tool).

This page covers the modern Python data toolkit — what to use, when to use it, and how these tools fit together.

**Related**: [Python Cheat Sheet](/cheat-sheets/python) | [Data Engineering Overview](/data-engineering/)

---

## pandas vs polars

### Architecture Differences

```mermaid
flowchart TB
    subgraph Pandas["pandas (NumPy-based)"]
        PDF[DataFrame]
        PDF --> NUMPY[NumPy Arrays]
        NUMPY --> GIL[Python GIL<br/>Single-threaded]
        GIL --> EAGER[Eager Execution]
    end

    subgraph Polars["polars (Arrow-based)"]
        PLF[DataFrame / LazyFrame]
        PLF --> ARROW[Apache Arrow<br/>Columnar Memory]
        ARROW --> RUST[Rust Engine<br/>Multi-threaded]
        RUST --> LAZY[Lazy + Eager Execution]
    end
```

### Feature Comparison

| Feature | pandas | polars |
|---------|--------|--------|
| **Backend** | NumPy (row-ish) | Apache Arrow (columnar) |
| **Language** | C / Python | Rust |
| **Threading** | GIL-bound (single core) | Multi-threaded (all cores) |
| **Execution** | Eager only | Lazy + Eager |
| **Memory** | ~2-10x dataset size | ~1-3x dataset size |
| **String handling** | Python objects (slow) | Arrow UTF-8 (fast) |
| **Index** | Yes (confusing) | No (by design) |
| **Missing values** | `NaN` / `None` (mixed) | `null` (consistent) |
| **Null handling** | Inconsistent across dtypes | First-class support |
| **Ecosystem** | Massive (15+ years) | Growing fast |
| **GPU support** | cuDF (RAPIDS) | cuDF integration |

### Code Comparison

```python
# === PANDAS ===
import pandas as pd

# Read CSV
df = pd.read_csv('sales.csv')

# Filter + aggregate
result = (
    df[df['region'] == 'EMEA']
    .groupby('product')
    .agg(
        total_revenue=('revenue', 'sum'),
        avg_price=('price', 'mean'),
        order_count=('order_id', 'nunique')
    )
    .sort_values('total_revenue', ascending=False)
    .head(10)
)


# === POLARS ===
import polars as pl

# Read CSV (auto-infers types, multi-threaded)
df = pl.read_csv('sales.csv')

# Filter + aggregate (eager)
result = (
    df.filter(pl.col('region') == 'EMEA')
    .group_by('product')
    .agg(
        total_revenue=pl.col('revenue').sum(),
        avg_price=pl.col('price').mean(),
        order_count=pl.col('order_id').n_unique()
    )
    .sort('total_revenue', descending=True)
    .head(10)
)


# === POLARS LAZY (preferred for large datasets) ===
result = (
    pl.scan_csv('sales.csv')          # LazyFrame — nothing executes yet
    .filter(pl.col('region') == 'EMEA')
    .group_by('product')
    .agg(
        total_revenue=pl.col('revenue').sum(),
        avg_price=pl.col('price').mean(),
        order_count=pl.col('order_id').n_unique()
    )
    .sort('total_revenue', descending=True)
    .head(10)
    .collect()                         # Now execute — optimizer picks best plan
)
```

::: tip
Always prefer `scan_csv()` (lazy) over `read_csv()` (eager) in polars for large files. The lazy engine optimizes the query plan — it pushes filters down, eliminates unnecessary columns, and parallelizes I/O. A lazy query on a 10GB CSV can be 10x faster than eager because it only reads the columns and rows it needs.
:::

### Performance Benchmarks

Typical benchmarks on a 10M-row CSV (16 columns, ~2GB):

| Operation | pandas | polars (eager) | polars (lazy) |
|-----------|--------|----------------|---------------|
| Read CSV | 12.4s | 2.1s | 0.8s* |
| Filter rows | 1.2s | 0.09s | 0.04s* |
| Group by + agg | 3.8s | 0.31s | 0.22s* |
| Join (1M x 10M) | 8.5s | 0.92s | 0.71s* |
| Sort | 2.1s | 0.28s | 0.19s* |
| Write Parquet | 4.2s | 0.84s | 0.84s |

*Lazy timings include predicate pushdown and projection pushdown optimizations.

### When to Use Which

| Scenario | Recommendation |
|----------|---------------|
| Quick EDA in Jupyter | pandas (more tutorials, StackOverflow answers) |
| Production ETL pipeline | polars (performance, memory efficiency) |
| Dataset fits in memory easily | Either works |
| Dataset larger than 50% of RAM | polars (lazy mode) |
| Need mature ecosystem (statsmodels, sklearn) | pandas (or convert at boundaries) |
| New project, no legacy code | polars |

---

## Pydantic v2

Pydantic v2 was rewritten with a Rust core (`pydantic-core`), making it 5-50x faster than v1 while keeping the same Python API.

### Core Patterns

```python
from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import datetime
from enum import Enum

class Priority(str, Enum):
    LOW = 'low'
    MEDIUM = 'medium'
    HIGH = 'high'
    CRITICAL = 'critical'

class CreateTicket(BaseModel):
    """Validated request body for creating a support ticket."""

    title: str = Field(min_length=5, max_length=200)
    description: str = Field(min_length=10)
    priority: Priority = Priority.MEDIUM
    tags: list[str] = Field(default_factory=list, max_length=10)
    assignee_email: str | None = None
    due_date: datetime | None = None

    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v: list[str]) -> list[str]:
        return [tag.lower().strip() for tag in v if tag.strip()]

    @field_validator('assignee_email')
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is not None and '@' not in v:
            raise ValueError('Invalid email address')
        return v

    @model_validator(mode='after')
    def validate_critical_has_assignee(self) -> 'CreateTicket':
        if self.priority == Priority.CRITICAL and not self.assignee_email:
            raise ValueError('Critical tickets must have an assignee')
        return self

# Usage
ticket = CreateTicket(
    title='Login page broken',
    description='Users cannot log in since the last deploy',
    priority='critical',
    assignee_email='oncall@company.com',
    tags=['  Auth ', 'URGENT', ''],
)

print(ticket.tags)       # ['auth', 'urgent'] — validated + cleaned
print(ticket.model_dump())  # dict representation
print(ticket.model_dump_json())  # JSON string
```

### Pydantic Settings

```python
from pydantic_settings import BaseSettings
from pydantic import Field

class AppConfig(BaseSettings):
    """Application configuration loaded from environment variables."""

    database_url: str = Field(alias='DATABASE_URL')
    redis_url: str = Field(default='redis://localhost:6379')
    debug: bool = False
    api_key: str = Field(min_length=32)
    max_connections: int = Field(default=10, ge=1, le=100)
    allowed_origins: list[str] = ['http://localhost:3000']

    model_config = {
        'env_file': '.env',
        'env_file_encoding': 'utf-8',
        'case_sensitive': False,
    }

# Automatically reads from environment variables / .env file
config = AppConfig()
```

### Serialization Control

```python
from pydantic import BaseModel, field_serializer, computed_field
from datetime import datetime

class User(BaseModel):
    id: int
    name: str
    email: str
    password_hash: str
    created_at: datetime

    @computed_field
    @property
    def display_name(self) -> str:
        return self.name.title()

    @field_serializer('created_at')
    def serialize_datetime(self, value: datetime) -> str:
        return value.isoformat()

    def model_dump(self, **kwargs):
        # Never include password_hash in serialization
        kwargs.setdefault('exclude', set())
        kwargs['exclude'].add('password_hash')
        return super().model_dump(**kwargs)

user = User(
    id=1, name='alice smith', email='a@b.com',
    password_hash='$2b$...', created_at=datetime(2025, 1, 15)
)

print(user.model_dump())
# {'id': 1, 'name': 'alice smith', 'email': 'a@b.com',
#  'display_name': 'Alice Smith', 'created_at': '2025-01-15T00:00:00'}
# Note: password_hash is excluded
```

::: warning
Pydantic v2 has breaking changes from v1. Key migrations: `validator` becomes `field_validator`, `root_validator` becomes `model_validator`, `.dict()` becomes `.model_dump()`, `.json()` becomes `.model_dump_json()`, and `Config` inner class becomes `model_config` dict.
:::

---

## SQLAlchemy 2.0

SQLAlchemy 2.0 introduces a modern, type-annotated API that works well with `mypy` and IDE autocompletion.

### Model Definition

```python
from sqlalchemy import String, ForeignKey, func
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship
)
from datetime import datetime

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Relationship — type-safe
    posts: Mapped[list['Post']] = relationship(back_populates='author', cascade='all, delete-orphan')

    def __repr__(self) -> str:
        return f'User(id={self.id}, email={self.email})'


class Post(Base):
    __tablename__ = 'posts'

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str]
    author_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    published: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    author: Mapped['User'] = relationship(back_populates='posts')
```

### Query Patterns (2.0 Style)

```python
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import Session, selectinload

# Modern select() API (replaces legacy session.query())
async def get_active_users(session: Session) -> list[User]:
    stmt = (
        select(User)
        .where(User.is_active == True)
        .order_by(User.created_at.desc())
        .limit(50)
    )
    result = session.execute(stmt)
    return list(result.scalars().all())


async def get_user_with_posts(session: Session, user_id: int) -> User | None:
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.posts))  # Eager load posts
    )
    result = session.execute(stmt)
    return result.scalar_one_or_none()


async def search_posts(
    session: Session,
    query: str,
    author_id: int | None = None
) -> list[Post]:
    stmt = select(Post).where(Post.title.icontains(query))

    if author_id is not None:
        stmt = stmt.where(Post.author_id == author_id)

    stmt = stmt.order_by(Post.created_at.desc()).limit(20)
    result = session.execute(stmt)
    return list(result.scalars().all())


# Aggregation
async def get_post_stats(session: Session) -> list[dict]:
    stmt = (
        select(
            User.name,
            func.count(Post.id).label('post_count'),
            func.max(Post.created_at).label('last_post')
        )
        .join(Post, User.id == Post.author_id)
        .group_by(User.name)
        .having(func.count(Post.id) > 5)
        .order_by(func.count(Post.id).desc())
    )
    result = session.execute(stmt)
    return [dict(row._mapping) for row in result.all()]
```

### Async Support

```python
from sqlalchemy.ext.asyncio import (
    create_async_engine, async_sessionmaker, AsyncSession
)

# Async engine (uses asyncpg for PostgreSQL)
engine = create_async_engine(
    'postgresql+asyncpg://user:pass@localhost/db',
    pool_size=20,
    max_overflow=10,
    pool_recycle=3600,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Usage with FastAPI
async def get_user(user_id: int) -> User:
    async with async_session() as session:
        stmt = select(User).where(User.id == user_id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404)
        return user
```

---

## Python Packaging: Poetry vs uv vs pip

```mermaid
flowchart LR
    subgraph Legacy["Legacy"]
        PIP[pip + requirements.txt]
        VENV[venv / virtualenv]
    end

    subgraph Modern["Modern"]
        POETRY[Poetry<br/>pyproject.toml]
        UV[uv<br/>pyproject.toml]
    end

    PIP --> |"slow, no lockfile"| POETRY
    PIP --> |"10-100x faster"| UV
    POETRY --> |"being replaced"| UV
```

### Tool Comparison

| Feature | pip | Poetry | uv |
|---------|-----|--------|-----|
| **Speed** | Baseline | ~2x pip | 10-100x pip |
| **Language** | Python | Python | Rust |
| **Lock file** | No (`pip freeze` workaround) | `poetry.lock` | `uv.lock` |
| **Resolver** | Backtracking (slow) | Custom (medium) | PubGrub (fast) |
| **Virtual envs** | Manual (`python -m venv`) | Automatic | Automatic |
| **Build backend** | Separate tool | Built-in | Built-in |
| **Python version management** | External (pyenv) | No | Built-in (`uv python`) |
| **pyproject.toml** | Limited | Full | Full |
| **Monorepo support** | No | No | Workspaces |

### uv Workflow (Recommended for New Projects)

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create a new project
uv init my-project
cd my-project

# Add dependencies (resolves + installs in <1s)
uv add fastapi uvicorn sqlalchemy
uv add --dev pytest ruff mypy

# Install a specific Python version
uv python install 3.12

# Run scripts
uv run python main.py
uv run pytest

# Sync environment from lock file (CI)
uv sync --frozen

# Export to requirements.txt (for Docker)
uv export --format requirements-txt > requirements.txt
```

### pyproject.toml (uv)

```toml
[project]
name = "my-service"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy[asyncio]>=2.0",
    "pydantic>=2.5",
    "pydantic-settings>=2.1",
]

[tool.uv]
dev-dependencies = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "ruff>=0.6",
    "mypy>=1.11",
    "coverage>=7.0",
]

[tool.ruff]
target-version = "py311"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "W", "I", "N", "UP", "B", "SIM", "RUF"]

[tool.mypy]
python_version = "3.11"
strict = true
```

---

## ruff: The One Linter to Rule Them All

ruff replaces flake8, isort, pyflakes, pycodestyle, pydocstyle, and (optionally) black — in a single Rust binary that runs 10-100x faster.

```bash
# Lint
ruff check .

# Lint + auto-fix
ruff check --fix .

# Format (replaces black)
ruff format .

# Check formatting without modifying
ruff format --check .
```

### ruff Configuration

```toml
# pyproject.toml
[tool.ruff]
target-version = "py311"
line-length = 100
src = ["src", "tests"]

[tool.ruff.lint]
select = [
    "E",    # pycodestyle errors
    "F",    # pyflakes
    "W",    # pycodestyle warnings
    "I",    # isort
    "N",    # pep8-naming
    "UP",   # pyupgrade
    "B",    # flake8-bugbear
    "SIM",  # flake8-simplify
    "RUF",  # ruff-specific rules
    "S",    # flake8-bandit (security)
    "DTZ",  # flake8-datetimez
    "ICN",  # flake8-import-conventions
]
ignore = ["E501"]  # line length handled by formatter

[tool.ruff.lint.isort]
known-first-party = ["my_project"]

[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["S101"]  # allow assert in tests
```

::: tip
ruff is not just fast — it also catches bugs that flake8 misses. The `B` (bugbear) rules catch common Python footguns like mutable default arguments, assert statements in production, and bare `except` clauses. Enable `B` and `SIM` at minimum.
:::

---

## Putting It All Together

A modern Python project structure using all these tools:

```
my-service/
  pyproject.toml          # uv + ruff + mypy config
  uv.lock                 # deterministic lock file
  src/
    my_service/
      __init__.py
      config.py           # Pydantic Settings
      models/
        __init__.py
        user.py            # SQLAlchemy 2.0 models
        schemas.py         # Pydantic request/response models
      services/
        __init__.py
        analytics.py       # polars for data processing
      api/
        __init__.py
        routes.py          # FastAPI routes
      db.py                # SQLAlchemy async engine
  tests/
    conftest.py
    test_api.py
    test_services.py
```

```python
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str = 'redis://localhost:6379'
    debug: bool = False

    model_config = {'env_file': '.env'}

settings = Settings()


# models/schemas.py — Pydantic for API validation
from pydantic import BaseModel, Field

class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str


# models/user.py — SQLAlchemy for database
from sqlalchemy.orm import Mapped, mapped_column

class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    email: Mapped[str] = mapped_column(unique=True)


# services/analytics.py — polars for data crunching
import polars as pl

def compute_revenue_by_region(path: str) -> pl.DataFrame:
    return (
        pl.scan_csv(path)
        .group_by('region')
        .agg(pl.col('revenue').sum())
        .sort('revenue', descending=True)
        .collect()
    )
```

::: danger
Do not mix pandas and polars DataFrames within the same function. If you must interop, convert at the boundary: `polars_df = pl.from_pandas(pandas_df)` or `pandas_df = polars_df.to_pandas()`. Each conversion copies the data — avoid doing it in hot loops.
:::

---

## Migration Decision Guide

```mermaid
flowchart TD
    START[Python Project] --> Q1{New or existing?}
    Q1 -->|New| UV[Use uv + ruff + polars + Pydantic v2]
    Q1 -->|Existing| Q2{Pain point?}

    Q2 -->|Slow CI / installs| ADOPT_UV[Adopt uv<br/>Drop-in pip replacement]
    Q2 -->|Slow data processing| ADOPT_POLARS[Adopt polars<br/>Replace pandas incrementally]
    Q2 -->|Validation bugs| ADOPT_PYDANTIC[Upgrade to Pydantic v2]
    Q2 -->|Messy linting| ADOPT_RUFF[Adopt ruff<br/>Replace flake8 + isort + black]

    style UV fill:#4a9
    style ADOPT_UV fill:#4a9
    style ADOPT_POLARS fill:#4a9
    style ADOPT_PYDANTIC fill:#4a9
    style ADOPT_RUFF fill:#4a9
```

---

## Further Reading

- [Python Cheat Sheet](/cheat-sheets/python) — quick reference for Python syntax and idioms
- [gRPC Deep Dive](/system-design/api-design/grpc-deep-dive) — using gRPC with Python services
- [Docker Compose Cheat Sheet](/cheat-sheets/docker-compose) — containerizing Python applications
- [Supply Chain Security](/security/supply-chain/) — securing Python dependencies
