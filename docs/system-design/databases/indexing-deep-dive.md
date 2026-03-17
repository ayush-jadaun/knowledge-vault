---
title: "Indexing Deep Dive"
description: "Complete deep dive into database indexing — B+tree internals, hash indexes, GIN, GiST, BRIN, partial indexes, expression indexes, covering indexes, index bloat, query planner decisions, and practical index design strategies"
tags: [databases, indexing, b-tree, query-optimization, postgresql, performance, data-structures]
difficulty: advanced
prerequisites: [storage-engines, query-planning-optimization]
lastReviewed: "2026-03-17"
---

# Indexing Deep Dive

An index is the single most impactful performance tool in a relational database. A well-chosen index can turn a 30-second full table scan into a 2-millisecond lookup. A poorly chosen index — or a missing one — is the root cause of the vast majority of production database performance problems.

But indexes are not free. Every index you add slows down writes, consumes storage, and requires maintenance. The art of indexing is understanding the internal data structures well enough to choose the right index type, the right columns, and the right column order for your specific query patterns — and knowing when NOT to add an index.

This page covers every major index type from the inside out: how they are physically stored, how lookups traverse them, what query patterns they serve, and when each type is optimal.

## Why Indexes Exist

### The Full Table Scan Problem

Without an index, every query requires a **sequential scan** (also called a full table scan). The database reads every single row in the table, evaluates the WHERE clause against each row, and returns the matches.

```
Table: users (1,000,000 rows, ~120 bytes per row, ~120 MB total)

Query: SELECT * FROM users WHERE email = 'alice@example.com';

Without index:
  - Read all 1,000,000 rows
  - Check email column for each row
  - ~120 MB of I/O
  - Time: O(N) = ~800ms on SSD, ~8000ms on HDD

With B+tree index on email:
  - Traverse tree: root → internal → internal → leaf
  - ~3-4 page reads (each 8 KB)
  - ~32 KB of I/O
  - Time: O(log N) = ~0.2ms on SSD
```

The difference is not incremental — it is **four orders of magnitude**. This is why indexing is the first thing you learn about database performance and the last thing you stop learning about.

### The Fundamental Trade-off

```
                          Reads (lookups)
                          ───────────────→
   No indexes             Many indexes
   ←───────────────────
   Writes (inserts/updates)

   Every index:
   + Speeds up reads that match the index
   - Slows down every INSERT (must update the index)
   - Slows down every UPDATE on indexed columns (must update the index)
   - Slows down every DELETE (must update the index)
   - Consumes storage (often 10-30% of table size per index)
   - Requires VACUUM maintenance (PostgreSQL) or page splits (all B+trees)
```

**Rule of thumb:** A table with 5 indexes pays roughly a 5x write amplification penalty for INSERT operations. Each index must be independently updated on every write.

## B+Tree Indexes

The B+tree is the default index type in virtually every relational database: PostgreSQL, MySQL InnoDB, SQL Server, Oracle, SQLite. It is the workhorse index for the vast majority of queries.

### B+Tree Structure

A B+tree is a balanced tree with the following properties:

1. **All data is in the leaf nodes.** Internal nodes contain only keys and pointers to child nodes.
2. **Leaf nodes are linked.** Each leaf has a pointer to the next leaf, forming a doubly-linked list. This allows efficient range scans.
3. **The tree is balanced.** Every path from root to leaf has the same length. This guarantees O(log N) lookups.
4. **Nodes map to disk pages.** Each node is typically one database page (8 KB in PostgreSQL, 16 KB in MySQL InnoDB). This minimizes disk I/O.

```
B+Tree Structure (order 4 — each node holds up to 3 keys):

                         ┌──────────────┐
                         │  [30 | 60]   │  ← Root (1 page read)
                         └──┬───┬───┬───┘
                     ┌──────┘   │   └──────┐
                     ▼          ▼          ▼
              ┌───────────┐┌───────────┐┌───────────┐
              │ [10 | 20] ││ [40 | 50] ││ [70 | 80] │  ← Internal (1 page read)
              └─┬──┬──┬───┘└─┬──┬──┬───┘└─┬──┬──┬───┘
             ┌──┘  │  └──┐┌──┘  │  └──┐┌──┘  │  └──┐
             ▼     ▼     ▼▼     ▼     ▼▼     ▼     ▼
            ┌──┐ ┌──┐ ┌──┐┌──┐ ┌──┐ ┌──┐┌──┐ ┌──┐ ┌──┐
  Leaf:     │5 │→│15│→│25│→│35│→│45│→│55│→│65│→│75│→│85│
  nodes     │8 │ │18│ │28│ │38│ │48│ │58│ │68│ │78│ │88│
            └──┘ └──┘ └──┘└──┘ └──┘ └──┘└──┘ └──┘ └──┘
              ↑                                      ↑
              └──────── Linked list of leaves ────────┘

  Each leaf node stores:
    - The indexed column value(s)
    - A pointer to the actual table row (tuple ID / row ID)
```

### Search Path: Finding a Single Row

To find the row where `id = 45`:

```
Step 1: Read root page
  [30 | 60]
  45 > 30 and 45 < 60 → follow middle pointer

Step 2: Read internal page
  [40 | 50]
  45 > 40 and 45 < 50 → follow middle pointer

Step 3: Read leaf page
  [45, 48] → Found! Leaf contains pointer to heap tuple.

Step 4: Read heap page
  Follow the pointer to the actual table row in the heap.

Total: 3 index page reads + 1 heap page read = 4 I/O operations
```

### How Many Levels Deep?

The depth of a B+tree depends on the number of keys and the branching factor (how many keys fit in each page):

```
PostgreSQL: 8 KB pages, ~4 byte key (integer), ~6 byte tuple pointer
  Keys per page ≈ 8192 / (4 + 6) ≈ 800 (internal nodes)
  Leaf entries per page ≈ 8192 / (4 + 6) ≈ 800

  Depth for N rows:
  Level 1 (root):      1 page   → up to 800 children
  Level 2:           800 pages  → up to 640,000 children
  Level 3:       640,000 pages  → up to 512,000,000 leaves

  1 million rows:   depth 3 → 3 page reads
  100 million rows: depth 3 → 3 page reads
  1 billion rows:   depth 4 → 4 page reads
```

This is remarkable: even with 1 billion rows, a B+tree index lookup requires only 4 page reads. In practice, the root and first-level internal pages are cached in the buffer pool, so a lookup typically requires only 1-2 actual disk reads.

### Range Scans: The Linked Leaf List

B+trees excel at range queries because leaf nodes are linked:

```sql
SELECT * FROM orders WHERE created_at BETWEEN '2025-01-01' AND '2025-03-31';
```

```
1. Find the leaf node containing '2025-01-01' (normal tree traversal, ~3 reads)
2. Scan forward through linked leaf nodes until '2025-03-31'
3. For each matching leaf entry, fetch the heap tuple

Index scan path:
  Root → Internal → Leaf(Jan) → Leaf(Feb) → Leaf(Mar) → stop

This is FAR faster than a full table scan, as long as the date range
is selective (returns a small fraction of total rows).
```

### Composite Indexes and the Leftmost Prefix Rule

A composite index (multi-column index) sorts by the first column, then by the second column within equal values of the first, and so on:

```sql
CREATE INDEX idx_orders_status_date ON orders (status, created_at);
```

The index is sorted like this:

```
Leaf node contents (conceptual):

  ('cancelled', '2025-01-03')  → row_ptr
  ('cancelled', '2025-02-15')  → row_ptr
  ('cancelled', '2025-06-22')  → row_ptr
  ('pending',   '2025-01-01')  → row_ptr
  ('pending',   '2025-01-05')  → row_ptr
  ('pending',   '2025-03-12')  → row_ptr
  ('shipped',   '2025-01-02')  → row_ptr
  ('shipped',   '2025-02-28')  → row_ptr
  ('shipped',   '2025-04-10')  → row_ptr
```

**The leftmost prefix rule:** The index can be used for queries that filter on a **prefix** of the indexed columns:

```sql
-- ✅ Uses the index (filters on first column)
SELECT * FROM orders WHERE status = 'pending';

-- ✅ Uses the index (filters on first column + range on second)
SELECT * FROM orders WHERE status = 'pending' AND created_at > '2025-01-01';

-- ✅ Uses the index (filters on both columns exactly)
SELECT * FROM orders WHERE status = 'shipped' AND created_at = '2025-02-28';

-- ❌ CANNOT use the index efficiently (skips first column)
SELECT * FROM orders WHERE created_at > '2025-01-01';
-- The dates are not globally sorted — they're only sorted WITHIN each status.
-- The planner might do an index scan anyway if the table is very large,
-- but it would need to scan large portions of the index.

-- ✅ Uses the index for sorting (leftmost prefix)
SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at;
-- The index already has pending orders sorted by date — no sort needed!
```

**Column order matters enormously:**

```sql
-- Index A: (status, created_at)
-- Index B: (created_at, status)

-- Query 1: WHERE status = 'pending' AND created_at > '2025-01-01'
-- Both indexes work, but:
--   Index A: find 'pending', scan dates > Jan 1. Very efficient.
--   Index B: find all dates > Jan 1, filter for 'pending'. Less efficient
--            if there are many statuses.

-- Query 2: WHERE created_at > '2025-01-01' (no status filter)
--   Index A: Cannot use efficiently (status is first column)
--   Index B: Perfect — dates are the first column

-- Query 3: WHERE status = 'pending' (no date filter)
--   Index A: Perfect — status is the first column
--   Index B: Cannot use efficiently (created_at is first column)
```

**Design principle:** Put the column with equality predicates first, and the column with range predicates second. Equality narrows to a specific subtree; range then scans within that subtree.

### Covering Indexes and Index-Only Scans

A **covering index** contains all the columns a query needs, eliminating the need to fetch the actual table row (heap fetch). This is called an **index-only scan**.

```sql
-- Query: Get the count of pending orders per day
SELECT created_at::date, COUNT(*)
FROM orders
WHERE status = 'pending'
GROUP BY created_at::date;

-- Without covering index:
-- Index scan on (status, created_at) → for each match, fetch heap row
-- The heap fetch is the expensive part for large result sets

-- With covering index:
CREATE INDEX idx_orders_covering ON orders (status, created_at);
-- This index already contains both columns the query needs!
-- The planner can answer the query entirely from the index.
-- No heap fetches needed → index-only scan.
```

In PostgreSQL 11+, you can use `INCLUDE` to add non-key columns to the index:

```sql
-- INCLUDE columns are stored in leaf pages but NOT in internal pages
-- They cannot be used for searching/sorting, only for covering
CREATE INDEX idx_orders_cover ON orders (status, created_at)
  INCLUDE (total_amount, customer_id);

-- Now this query can be answered entirely from the index:
SELECT created_at, total_amount, customer_id
FROM orders
WHERE status = 'pending' AND created_at > '2025-01-01';
```

**The visibility map requirement (PostgreSQL):**

PostgreSQL's MVCC means that even with a covering index, the database must check whether each row is visible to the current transaction. This requires checking the **visibility map** — a bitmap that tracks which heap pages contain only tuples visible to all transactions. If a page is "all-visible," the index-only scan can skip the heap fetch. If not, it must fetch the heap page to check visibility.

```
Index-only scan efficiency depends on VACUUM:

  Table freshly VACUUMed:
    - All pages marked all-visible in visibility map
    - Index-only scan: 0 heap fetches → FAST

  Table with many recent updates (not yet VACUUMed):
    - Many pages NOT marked all-visible
    - Index-only scan: many heap fetches → NOT much faster than index scan
    - Run VACUUM to improve index-only scan performance
```

### B+Tree Limitations

B+trees are excellent for:
- Equality lookups (`WHERE id = 42`)
- Range queries (`WHERE price BETWEEN 10 AND 50`)
- Sorting (`ORDER BY created_at`)
- Min/max queries (`SELECT MAX(price)`)

B+trees are poor or useless for:
- Full-text search (`WHERE body LIKE '%database%'`)
- Array containment (`WHERE tags @> ARRAY['postgres']`)
- Geometric nearest-neighbor (`ORDER BY point <-> my_point`)
- JSONB key containment (`WHERE metadata @> '{"key": "value"}'`)
- Pattern matching without left-anchor (`WHERE name LIKE '%son'`)

## Hash Indexes

Hash indexes provide O(1) equality lookups — faster than B+tree's O(log N). But they support ONLY equality, making them a niche tool.

### Structure

A hash index is a hash table stored on disk:

```
Hash Index Structure:

  Key → hash(key) → bucket number → overflow pages

  Bucket 0: [(key1, ptr1), (key5, ptr5), ...]
  Bucket 1: [(key2, ptr2), (key8, ptr8), ...]
  Bucket 2: [(key3, ptr3), ...]
  Bucket 3: [(key4, ptr4), (key7, ptr7), (key9, ptr9), ...]
  ...

  Lookup: hash('alice@example.com') % num_buckets = 2
  → Read bucket 2 → find the matching key → follow pointer to heap
```

### When to Use Hash Indexes

```sql
-- PostgreSQL: Hash indexes are WAL-logged since PostgreSQL 10
-- Before PG10, hash indexes were not crash-safe!

CREATE INDEX idx_users_email_hash ON users USING hash (email);

-- This index is useful ONLY for:
SELECT * FROM users WHERE email = 'alice@example.com';  -- ✅ O(1)

-- These CANNOT use the hash index:
SELECT * FROM users WHERE email > 'a';                  -- ❌ No range support
SELECT * FROM users WHERE email LIKE 'ali%';            -- ❌ No prefix support
SELECT * FROM users ORDER BY email;                     -- ❌ No sort support
```

**Hash vs B+tree performance comparison:**

```
Benchmark: equality lookups on 10M row table, 100-byte varchar key

                    B+tree        Hash
                    ──────        ────
Lookup time:        0.15 ms       0.08 ms
Index size:         890 MB        620 MB
Insert time:        0.12 ms       0.09 ms

Hash is ~2x faster for equality lookups.
But B+tree supports ranges, sorting, and prefix matching.
```

**When hash indexes make sense:**
- Very high-volume equality-only lookups (session tokens, cache keys)
- You need every microsecond of lookup performance
- You are absolutely certain you will never need range queries on this column

**When hash indexes do NOT make sense:**
- Almost everywhere else. B+tree's versatility usually wins.

## GIN (Generalized Inverted Index)

GIN indexes are designed for values that contain multiple elements — arrays, JSONB documents, and full-text search vectors. They are called "inverted" because they map from element values to the rows containing them (the inverse of a normal index, which maps from rows to values).

### How GIN Works

```
Normal B+tree index:
  Row 1 → tags: ['postgres', 'database', 'sql']
  Row 2 → tags: ['redis', 'cache']
  Row 3 → tags: ['postgres', 'performance']

  Index maps: Row → Value (one entry per row)

GIN inverted index:
  'cache'       → {Row 2}
  'database'    → {Row 1}
  'performance' → {Row 3}
  'postgres'    → {Row 1, Row 3}
  'redis'       → {Row 2}
  'sql'         → {Row 1}

  Index maps: Value → Set of Rows (one entry per distinct element)
```

The internal structure is a B+tree of keys, where each key points to a **posting list** — a sorted list of row IDs (TIDs) that contain that key.

```
GIN Structure:

  B+tree of keys:
    ┌──────────────┐
    │  [m]         │  ← Root
    └──┬───────┬───┘
       ▼       ▼
  ┌────────┐ ┌────────┐
  │cache   │ │postgres│  ← Leaf keys
  │database│ │redis   │
  │        │ │sql     │
  └────────┘ └────────┘
       │          │
       ▼          ▼
  Posting lists:
    cache → [row2]
    database → [row1]
    postgres → [row1, row3, row47, row198, ...]
    redis → [row2]
    sql → [row1]
```

For large posting lists, GIN uses a **posting tree** — a B+tree of row IDs — instead of a flat list.

### GIN for Full-Text Search

```sql
-- Create a GIN index on a tsvector column
ALTER TABLE articles ADD COLUMN search_vector tsvector;
UPDATE articles SET search_vector =
  to_tsvector('english', title || ' ' || body);

CREATE INDEX idx_articles_search ON articles USING gin (search_vector);

-- Query using the index
SELECT title, ts_rank(search_vector, query) AS rank
FROM articles, to_tsquery('english', 'database & optimization') AS query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 10;

-- How it works internally:
-- 1. Parse query: 'database & optimization' → need both terms
-- 2. Look up 'database' in GIN → posting list: [row1, row5, row12, row45, ...]
-- 3. Look up 'optimization' in GIN → posting list: [row5, row23, row45, row89, ...]
-- 4. Intersect posting lists → [row5, row45, ...]
-- 5. Fetch only those rows from the heap
```

### GIN for JSONB

```sql
-- Default GIN operator class for JSONB
CREATE INDEX idx_events_data ON events USING gin (data);

-- Supports containment queries:
SELECT * FROM events WHERE data @> '{"type": "purchase", "amount": 99.99}';
-- GIN looks up each key-value pair and intersects the posting lists

-- Supports existence queries:
SELECT * FROM events WHERE data ? 'error_code';
-- GIN looks up the key 'error_code' and returns all rows containing it

-- Supports any-key existence:
SELECT * FROM events WHERE data ?| ARRAY['error_code', 'warning'];
-- GIN looks up both keys and unions the posting lists

-- jsonb_path_ops: more compact, supports only @>
CREATE INDEX idx_events_data_path ON events USING gin (data jsonb_path_ops);
-- Hashes the full path (key → value), so the index is smaller
-- but cannot answer ? or ?| queries
```

**GIN operator classes for JSONB:**

| Operator Class | Supported Operators | Index Size | Use When |
|---------------|--------------------|-----------| ---------|
| `jsonb_ops` (default) | `@>`, `?`, `?&`, `?\|`, `@?`, `@@` | Larger | Need key existence queries |
| `jsonb_path_ops` | `@>` only | ~3x smaller | Only need containment queries |

### GIN for Arrays

```sql
CREATE INDEX idx_products_tags ON products USING gin (tags);

-- Array containment (does the row's array contain all these elements?)
SELECT * FROM products WHERE tags @> ARRAY['organic', 'gluten-free'];

-- Array overlap (does the row's array share any elements with this array?)
SELECT * FROM products WHERE tags && ARRAY['organic', 'vegan'];

-- GIN internally:
-- 1. Look up 'organic' → posting list of rows containing 'organic'
-- 2. Look up 'gluten-free' → posting list
-- 3. For @>: intersect the lists (rows must contain ALL elements)
-- 4. For &&: union the lists (rows must contain ANY element)
```

### GIN Performance Characteristics

```
Benchmark: JSONB containment query on 5M row table

                    No Index        GIN (jsonb_ops)    GIN (jsonb_path_ops)
                    ────────        ───────────────    ────────────────────
Query time:         4,200 ms        1.2 ms             0.9 ms
Index size:         —               1.8 GB             620 MB
Build time:         —               45 sec             32 sec
Insert overhead:    —               +35%               +25%
```

**GIN write performance — the pending list:**

GIN indexes are expensive to update because a single row insertion may add many entries (one per element). To mitigate this, PostgreSQL uses a **pending list**:

1. New entries are added to an unsorted pending list (fast)
2. When the pending list reaches `gin_pending_list_limit` (default 4 MB), it is batch-merged into the main GIN structure
3. The `gin_fuzzy_search_limit` setting can limit results from large posting lists

```sql
-- Tune GIN write performance:
SET gin_pending_list_limit = '8MB';   -- Larger = fewer merges, more memory
-- Or per-index:
ALTER INDEX idx_articles_search SET (gin_pending_list_limit = 8388608);

-- Force merge of pending list:
VACUUM articles;  -- VACUUM merges the pending list
```

## GiST (Generalized Search Tree)

GiST is a framework for building tree-based indexes over complex data types. Unlike B+trees (which require a total ordering) and GIN (which require decomposition into elements), GiST works with data types that have a notion of "containment" or "proximity."

### How GiST Works

GiST is a balanced tree where each internal node contains a **bounding predicate** that covers all entries in its subtree. The three key functions that define a GiST index for a specific data type:

1. **Consistent:** Given a query predicate and a tree entry, can any entry in this subtree match the query?
2. **Union:** Given a set of entries, what is the smallest bounding predicate that covers all of them?
3. **Penalty:** How much does the bounding predicate need to "expand" to accommodate a new entry? (Used for insertion — pick the subtree with the least penalty.)

```
GiST for 2D points (R-tree):

                    ┌─────────────────────────┐
                    │  Bounding box: (0,0)-(100,100)  │  ← Root
                    └──────┬──────────┬───────┘
                    ┌──────┘          └──────┐
                    ▼                        ▼
         ┌──────────────────┐    ┌──────────────────┐
         │ BBox: (0,0)-(50,50)│    │ BBox: (40,40)-(100,100)│
         └───┬──────┬────────┘    └───┬──────┬────────┘
             ▼      ▼                 ▼      ▼
          ┌─────┐ ┌─────┐         ┌─────┐ ┌─────┐
          │(5,5)│ │(30,20)│       │(60,70)│ │(90,85)│
          │(10,3)│ │(45,48)│       │(55,45)│ │(80,95)│
          └─────┘ └─────┘         └─────┘ └─────┘

  Query: Find all points within 10 units of (55, 50)

  1. Root: Does query circle overlap (0,0)-(100,100)? Yes → descend both children
  2. Left child: Does query circle overlap (0,0)-(50,50)? Barely → descend
  3. Right child: Does query circle overlap (40,40)-(100,100)? Yes → descend
  4. Check actual points in qualifying leaf nodes
```

### GiST for Geometric Data

```sql
-- PostGIS: spatial indexing
CREATE INDEX idx_locations_geom ON locations USING gist (geom);

-- Find all restaurants within 1km of a point
SELECT name, ST_Distance(geom, ST_MakePoint(-73.9857, 40.7484)) AS dist
FROM locations
WHERE ST_DWithin(geom, ST_MakePoint(-73.9857, 40.7484), 1000)
ORDER BY dist;

-- The GiST index uses an R-tree structure:
-- 1. Check root bounding box — does it intersect the 1km circle?
-- 2. Descend into overlapping children
-- 3. Only read leaf nodes that might contain matching points
-- 4. Verify actual distance for leaf entries
```

### GiST for Range Types

```sql
-- Index on a range column
CREATE INDEX idx_reservations_during ON reservations USING gist (during);

-- Find overlapping reservations (double-booking check)
SELECT * FROM reservations
WHERE during && tstzrange('2025-03-01 14:00', '2025-03-01 16:00');

-- The GiST index efficiently finds ranges that overlap the query range
-- by traversing only subtrees whose bounding ranges could overlap
```

### GiST for Nearest-Neighbor Search

GiST supports **ordered search** — returning results sorted by distance without sorting the entire result set:

```sql
-- Find the 5 closest restaurants to a point
SELECT name, geom <-> ST_MakePoint(-73.9857, 40.7484) AS dist
FROM locations
ORDER BY geom <-> ST_MakePoint(-73.9857, 40.7484)
LIMIT 5;

-- The <-> operator triggers an index-ordered scan:
-- Instead of finding ALL locations and sorting by distance,
-- the GiST index returns results in distance order.
-- With LIMIT 5, only ~5-20 index entries are examined.

-- Without GiST: O(N log N) — scan all rows, sort by distance
-- With GiST: O(log N + K) — tree traversal + K results
```

### GiST vs GIN

| Property | GiST | GIN |
|----------|------|-----|
| Structure | Bounding predicate tree | Inverted index (key → posting list) |
| Best for | Proximity, containment, ranges | Set membership, full-text search |
| Lookup speed | O(log N) per query | O(log N + posting list scan) |
| Insert speed | Faster | Slower (pending list helps) |
| Index size | Smaller | Larger |
| Nearest-neighbor | Yes (ordered scan) | No |
| Full-text search | Yes (but slower than GIN) | Yes (preferred) |
| Supports `ORDER BY <->` | Yes | No |

**Rule of thumb:** Use GIN for full-text search and JSONB. Use GiST for geometric data, ranges, and nearest-neighbor queries. If you need full-text search with ordering by distance, you need GiST — but GIN will be faster for simple containment queries.

## BRIN (Block Range Index)

BRIN is the most space-efficient index type in PostgreSQL. It stores summary information (min/max values) for ranges of physical table blocks, rather than indexing individual rows.

### How BRIN Works

```
Table stored on disk (heap pages):

  Block 0:   rows with created_at from 2024-01-01 to 2024-01-03
  Block 1:   rows with created_at from 2024-01-03 to 2024-01-05
  Block 2:   rows with created_at from 2024-01-05 to 2024-01-08
  ...
  Block 127: rows with created_at from 2024-06-15 to 2024-06-18
  Block 128: rows with created_at from 2024-06-18 to 2024-06-20

BRIN index (pages_per_range = 128):

  Range 0 (blocks 0-127):   min=2024-01-01, max=2024-06-18
  Range 1 (blocks 128-255): min=2024-06-18, max=2024-12-31
  Range 2 (blocks 256-383): min=2025-01-01, max=2025-06-15
  ...

Query: WHERE created_at = '2025-03-15'
  - Check Range 0: max=2024-06-18 < 2025-03-15 → SKIP entire 128 blocks
  - Check Range 1: max=2024-12-31 < 2025-03-15 → SKIP entire 128 blocks
  - Check Range 2: min=2025-01-01, max=2025-06-15 → MIGHT MATCH
    → Scan blocks 256-383 (instead of all blocks)
```

### When BRIN Is Effective

BRIN works well when the physical order of rows on disk **correlates** with the indexed column values. This happens naturally for:

- **Timestamps:** Rows inserted sequentially have monotonically increasing timestamps
- **Auto-incrementing IDs:** Same reason
- **Append-only log tables:** Data arrives in order and is never updated
- **Partitioned tables:** Each partition covers a time range

BRIN is **ineffective** when:
- The column values are random relative to insertion order (e.g., UUIDs)
- Rows are frequently updated, causing physical reordering
- The column has many distinct values randomly distributed across blocks

### BRIN vs B+Tree

```sql
-- Create indexes on a 100M row time-series table
CREATE INDEX idx_ts_btree ON sensor_data USING btree (recorded_at);
-- Size: 2.1 GB, Build time: 180 sec

CREATE INDEX idx_ts_brin ON sensor_data USING brin (recorded_at)
  WITH (pages_per_range = 128);
-- Size: 256 KB (!), Build time: 12 sec

-- Query performance:
-- SELECT * FROM sensor_data WHERE recorded_at = '2025-03-15 14:30:00'

-- B+tree:  0.1 ms (direct lookup)
-- BRIN:    15 ms (scans ~128 pages in the matching range)
-- Seq scan: 45,000 ms (scans all 100M rows)
```

```
Comparison: 100M row table, timestamp column

                    B+tree         BRIN (128)      BRIN (32)
                    ──────         ──────────      ─────────
Index size:         2.1 GB         256 KB          1 MB
Build time:         180 sec        12 sec          14 sec
Point lookup:       0.1 ms         15 ms           4 ms
Range (1 day):      2 ms           20 ms           8 ms
Range (1 month):    45 ms          50 ms           48 ms
Range (1 year):     400 ms         420 ms          410 ms
Insert overhead:    +15%           +0.5%           +0.8%
```

**Key insight:** BRIN is not about making queries as fast as B+tree. It is about providing 90% of the benefit at 0.01% of the cost. For large time-series tables, BRIN gives you acceptable query performance with negligible storage and write overhead.

### Tuning BRIN: pages_per_range

```sql
-- Smaller pages_per_range = more precise, larger index, faster queries
CREATE INDEX idx_brin_tight ON data USING brin (ts) WITH (pages_per_range = 16);

-- Larger pages_per_range = less precise, smaller index, slower queries
CREATE INDEX idx_brin_loose ON data USING brin (ts) WITH (pages_per_range = 256);

-- Rule of thumb:
-- pages_per_range = 128 is the default and works well for most cases
-- Use 16-32 if you need faster point lookups and can afford the (still small) index
-- Use 256+ if the table is enormous and you need the absolute smallest index
```

### BRIN Auto-Summarization

When new blocks are added to the table, they are not automatically included in the BRIN index. PostgreSQL can auto-summarize new ranges:

```sql
-- Enable auto-summarization
ALTER INDEX idx_ts_brin SET (autosummarize = on);

-- Or manually summarize:
SELECT brin_summarize_new_values('idx_ts_brin');

-- Check which ranges are summarized:
SELECT * FROM brin_page_items(get_raw_page('idx_ts_brin', 2), 'idx_ts_brin');
```

## Partial Indexes

A partial index indexes only a subset of rows in a table, defined by a WHERE clause on the index itself. This reduces index size and maintenance cost while still accelerating queries on the indexed subset.

### When Partial Indexes Shine

```sql
-- Full index: indexes ALL 10M orders
CREATE INDEX idx_orders_status ON orders (status);
-- Size: 210 MB
-- But 95% of orders are 'completed' — you almost never query for those

-- Partial index: indexes only the 5% that matter
CREATE INDEX idx_orders_pending ON orders (created_at)
  WHERE status = 'pending';
-- Size: 10 MB (95% smaller!)
-- Only maintained when a row's status is 'pending'
```

**The query must match the index predicate:**

```sql
-- ✅ Uses the partial index (WHERE clause matches)
SELECT * FROM orders WHERE status = 'pending' AND created_at > '2025-01-01';

-- ❌ Cannot use the partial index (different status)
SELECT * FROM orders WHERE status = 'shipped' AND created_at > '2025-01-01';

-- ❌ Cannot use the partial index (no status filter)
SELECT * FROM orders WHERE created_at > '2025-01-01';

-- ✅ Can use the partial index (implies the predicate)
SELECT * FROM orders WHERE status = 'pending';
-- The planner knows all rows in the index have status='pending'
```

### Common Partial Index Patterns

```sql
-- 1. Soft deletes: index only non-deleted rows
CREATE INDEX idx_users_active_email ON users (email)
  WHERE deleted_at IS NULL;

-- 2. Queue processing: index only unprocessed items
CREATE INDEX idx_jobs_unprocessed ON jobs (priority, created_at)
  WHERE processed_at IS NULL;

-- 3. Unique constraint on a subset: unique email only for active users
CREATE UNIQUE INDEX idx_users_unique_email ON users (email)
  WHERE deleted_at IS NULL;
-- This allows multiple deleted users to have the same email!

-- 4. Flag-based filtering: index only flagged rows
CREATE INDEX idx_orders_flagged ON orders (flagged_at, customer_id)
  WHERE is_flagged = true;
```

## Expression Indexes

An expression index indexes the result of a function or expression applied to a column, rather than the column value itself.

### Common Expression Index Patterns

```sql
-- 1. Case-insensitive email lookup
CREATE INDEX idx_users_email_lower ON users (lower(email));

-- This query uses the index:
SELECT * FROM users WHERE lower(email) = 'alice@example.com';
-- Without this index, even with an index on email,
-- the query would do a seq scan because lower(email) ≠ email

-- 2. Date extraction from timestamp
CREATE INDEX idx_orders_month ON orders (date_trunc('month', created_at));

SELECT * FROM orders WHERE date_trunc('month', created_at) = '2025-03-01';

-- 3. JSONB field extraction
CREATE INDEX idx_events_type ON events ((data->>'type'));

SELECT * FROM events WHERE data->>'type' = 'purchase';

-- 4. Computed value
CREATE INDEX idx_products_price_cents ON products ((price * 100)::integer);

-- 5. Text pattern matching (for LIKE 'prefix%')
CREATE INDEX idx_users_name_pattern ON users (name text_pattern_ops);
-- text_pattern_ops uses byte-by-byte comparison, enabling LIKE 'Ali%'
```

### Important Rules for Expression Indexes

1. **The query must use the exact same expression.** `WHERE lower(email) = 'x'` uses the index; `WHERE LOWER(email) = 'x'` also works (case-insensitive SQL keywords); but `WHERE email ILIKE 'x'` does NOT use a `lower(email)` index.

2. **The expression must be IMMUTABLE.** PostgreSQL requires that the function used in the expression always returns the same output for the same input. This excludes functions that depend on locale, timezone, or session settings (unless explicitly marked IMMUTABLE).

3. **Expression indexes are maintained on every write.** If the expression is expensive to compute, every INSERT and UPDATE pays that cost.

```sql
-- Check if a function is immutable:
SELECT proname, provolatile
FROM pg_proc
WHERE proname = 'lower';
-- provolatile = 'i' means immutable ✓
-- provolatile = 's' means stable (depends on session settings)
-- provolatile = 'v' means volatile (changes between calls)
```

## Multi-Column Index Design: Selectivity Analysis

Choosing the right column order in a composite index requires understanding **selectivity** — the fraction of rows that match a particular value.

### Selectivity Defined

```sql
-- Selectivity = 1 / number of distinct values
-- (for uniformly distributed data)

-- Column: status (5 distinct values: pending, shipped, delivered, cancelled, returned)
-- Selectivity = 1/5 = 0.20 → Each value matches 20% of rows → LOW selectivity

-- Column: email (unique)
-- Selectivity = 1/1000000 = 0.000001 → Each value matches 1 row → HIGH selectivity

-- Column: country (200 distinct values)
-- Selectivity = 1/200 = 0.005 → Each value matches 0.5% of rows → MEDIUM selectivity
```

### Column Order Strategy

**For equality-only queries (all columns use `=`):**

Put the most selective column first. This narrows the search space most quickly.

```sql
-- 10M rows. email has 10M distinct values. status has 5.

-- Index: (email, status) — BETTER for equality on both
--   Find email → 1 row → check status → done

-- Index: (status, email) — WORSE for equality on both
--   Find status → 2M rows → binary search for email → done
--   (Still fast, but the first approach is more direct)
```

**For mixed equality + range queries:**

Put equality columns first, range column last.

```sql
-- Query: WHERE status = 'pending' AND created_at > '2025-01-01'

-- Index: (status, created_at) — OPTIMAL
--   Jump to 'pending' (equality) → scan forward from Jan 1 (range)
--   Reads only the relevant portion of the index

-- Index: (created_at, status) — SUBOPTIMAL
--   Start at Jan 1, scan forward → but rows are ordered by date,
--   not by status within each date → must check every row's status
```

**For queries with different filter combinations:**

```sql
-- Your app runs these queries:
-- Q1: WHERE status = ? AND customer_id = ?        (frequent)
-- Q2: WHERE status = ? AND created_at > ?          (frequent)
-- Q3: WHERE customer_id = ?                        (occasional)

-- Strategy: Design indexes to cover the most frequent queries
CREATE INDEX idx_1 ON orders (status, customer_id);   -- Covers Q1, partially Q2
CREATE INDEX idx_2 ON orders (status, created_at);    -- Covers Q2
CREATE INDEX idx_3 ON orders (customer_id);            -- Covers Q3

-- Note: idx_1 with (status, customer_id) also covers
-- WHERE status = 'pending' (leftmost prefix). So if Q4 is just
-- WHERE status = ?, idx_1 handles it — no separate index needed.
```

### Using pg_stats to Analyze Selectivity

```sql
-- Check column statistics
SELECT
  attname,
  n_distinct,
  most_common_vals,
  most_common_freqs,
  correlation  -- Physical vs logical ordering (1.0 = perfect, good for BRIN)
FROM pg_stats
WHERE tablename = 'orders'
AND attname IN ('status', 'customer_id', 'created_at');

-- Example output:
-- attname      | n_distinct | correlation
-- status       | 5          | 0.12        (random physical order → bad for BRIN)
-- customer_id  | 50000      | 0.03        (random → bad for BRIN)
-- created_at   | -0.95      | 0.99        (nearly unique, nearly ordered → great for BRIN)
```

## Index Bloat

Index bloat is one of the most common operational problems with PostgreSQL indexes. It occurs when dead tuples (from updates and deletes) leave behind empty or sparsely-filled index pages that are never reclaimed.

### How Bloat Happens

```
1. Row is updated: old tuple marked dead, new tuple inserted
2. Index entry for old tuple still exists (points to dead tuple)
3. VACUUM removes dead tuples from the heap AND marks index entries as dead
4. BUT: B+tree pages are not merged or compacted by VACUUM
5. Half-empty index pages accumulate → index grows beyond its useful size

Timeline:
  After initial load:   Index size = 1 GB, 90% fill factor
  After 6 months:       Index size = 2.5 GB, 35% fill factor
  After REINDEX:        Index size = 1.1 GB, 90% fill factor
```

### Detecting Index Bloat

```sql
-- Method 1: Compare actual size vs estimated size
SELECT
  indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) AS actual_size,
  pg_size_pretty(
    pg_relation_size(indexrelid) *
    (1.0 - (SELECT COUNT(*) FROM pg_stat_user_indexes
             WHERE indexrelid = i.indexrelid
             AND idx_scan > 0)::float /
            GREATEST(1, (SELECT n_live_tup FROM pg_stat_user_tables
                         WHERE relid = i.indrelid)))
  ) AS estimated_bloat
FROM pg_stat_user_indexes i
WHERE pg_relation_size(indexrelid) > 10 * 1024 * 1024  -- > 10MB
ORDER BY pg_relation_size(indexrelid) DESC;

-- Method 2: Use pgstattuple extension (more accurate)
CREATE EXTENSION IF NOT EXISTS pgstattuple;

SELECT
  index_name,
  pg_size_pretty(index_size) AS size,
  avg_leaf_density,         -- Ideally > 80%. Below 50% = bloated
  leaf_fragmentation        -- Percentage of out-of-order leaf pages
FROM (
  SELECT
    indexrelname AS index_name,
    pg_relation_size(indexrelid) AS index_size,
    (pgstatindex(indexrelname)).avg_leaf_density,
    (pgstatindex(indexrelname)).leaf_fragmentation
  FROM pg_stat_user_indexes
  WHERE pg_relation_size(indexrelid) > 10 * 1024 * 1024
) sub
ORDER BY avg_leaf_density ASC;

-- avg_leaf_density < 50% → significant bloat, consider REINDEX
-- avg_leaf_density < 30% → severe bloat, REINDEX urgently
```

### Fixing Index Bloat

```sql
-- Option 1: REINDEX (blocks writes on the index during rebuild)
REINDEX INDEX idx_orders_status;
-- Downtime: blocks INSERT/UPDATE/DELETE on the table while rebuilding

-- Option 2: REINDEX CONCURRENTLY (PostgreSQL 12+, no blocking)
REINDEX INDEX CONCURRENTLY idx_orders_status;
-- Builds a new index alongside the old one, then swaps
-- Requires extra disk space for the duration
-- Takes longer than regular REINDEX

-- Option 3: CREATE INDEX CONCURRENTLY + DROP (manual approach)
CREATE INDEX CONCURRENTLY idx_orders_status_new ON orders (status);
-- Verify the new index is valid:
SELECT indexrelid::regclass, indisvalid FROM pg_index
WHERE indexrelid = 'idx_orders_status_new'::regclass;
-- Drop the old index:
DROP INDEX idx_orders_status;
-- Rename:
ALTER INDEX idx_orders_status_new RENAME TO idx_orders_status;

-- Option 4: pg_repack (external tool, no locks, no bloat)
-- pg_repack rebuilds the table AND its indexes without blocking
-- Install: CREATE EXTENSION pg_repack;
-- Run: pg_repack --table orders --only-indexes mydb
```

### Preventing Index Bloat

```sql
-- 1. Tune autovacuum for high-update tables
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.01,    -- Vacuum when 1% of rows are dead
  autovacuum_vacuum_cost_delay = 2,          -- Reduce throttling (ms between pages)
  autovacuum_vacuum_cost_limit = 1000        -- Process more pages per cycle
);

-- 2. Use fillfactor to leave room for HOT updates
ALTER TABLE orders SET (fillfactor = 80);
-- Leaves 20% free space per page for in-place updates (HOT updates)
-- HOT updates don't create new index entries → less index bloat

-- 3. Use B-tree deduplication (PostgreSQL 13+)
-- Automatically deduplicate index entries with the same key value
-- Reduces index size by up to 50% for low-cardinality columns
-- Enabled by default in PG13+
CREATE INDEX idx_orders_status ON orders (status) WITH (deduplicate_items = on);
```

## Index Selection by the Query Planner

The query planner (optimizer) decides whether to use an index — and which index — based on **cost estimation**. Understanding these decisions helps you create indexes that the planner will actually use.

### Cost Model Basics

The planner estimates the cost of each possible plan in terms of abstract "cost units":

```sql
-- View cost parameters
SHOW seq_page_cost;          -- 1.0 (baseline: cost of reading one sequential page)
SHOW random_page_cost;       -- 4.0 (random I/O is ~4x more expensive than sequential)
SHOW cpu_tuple_cost;         -- 0.01 (cost of processing one tuple)
SHOW cpu_index_tuple_cost;   -- 0.005 (cost of processing one index entry)
SHOW cpu_operator_cost;      -- 0.0025 (cost of executing one operator)

-- For SSDs, you should lower random_page_cost:
SET random_page_cost = 1.1;  -- SSDs have nearly no seek penalty
-- This makes the planner more likely to choose index scans
```

### When the Planner Chooses NOT to Use an Index

There are several important scenarios where a seq scan is faster than an index scan:

**1. Low selectivity (large fraction of table):**

```sql
-- Table: orders (1M rows), Index on status
-- 5 statuses, roughly equal distribution (200K rows each)

EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'pending';
-- The planner estimates 200K rows (20% of table)
-- Index scan cost: 200K random page reads (each costs 4.0)
-- Seq scan cost: ~12K sequential page reads (each costs 1.0)
-- Seq scan wins! 12K < 800K

-- Rule of thumb: index scan is faster when selecting < 5-15% of rows
-- (exact threshold depends on random_page_cost and table layout)
```

**2. Small tables:**

```sql
-- Table: countries (200 rows, fits in ~1-2 pages)
-- Index on name

EXPLAIN ANALYZE SELECT * FROM countries WHERE name = 'Japan';
-- Seq scan cost: 2 page reads
-- Index scan cost: 3 page reads (root → leaf → heap)
-- Seq scan is faster for tiny tables!
```

**3. Correlation between physical and logical order:**

```sql
-- Table: sensor_data, ordered by timestamp (correlation ≈ 1.0)
-- B+tree index on timestamp

SELECT * FROM sensor_data WHERE timestamp > '2025-03-01';
-- If this returns 10% of rows, the planner knows they are
-- physically clustered together (high correlation).
-- A bitmap index scan or even seq scan might be cheaper
-- than a regular index scan, because the matching rows
-- are on consecutive pages.
```

**4. Type mismatch or function on indexed column:**

```sql
-- Index on: (email varchar)
SELECT * FROM users WHERE email::text = 'alice@example.com';
-- The cast prevents index usage because the planner cannot
-- match the expression to the index definition.

-- Index on: (created_at timestamp)
SELECT * FROM orders WHERE EXTRACT(YEAR FROM created_at) = 2025;
-- Function on the column prevents index usage.
-- Fix: use a range query instead:
SELECT * FROM orders
WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01';
```

### Reading EXPLAIN Output

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders
WHERE status = 'pending' AND created_at > '2025-01-01'
ORDER BY created_at
LIMIT 20;

-- Output:
-- Limit  (cost=0.43..12.50 rows=20 width=120)
--        (actual time=0.082..0.145 rows=20 loops=1)
--   ->  Index Scan using idx_orders_status_date on orders
--        (cost=0.43..48520.30 rows=80453 width=120)
--        (actual time=0.080..0.138 rows=20 loops=1)
--         Index Cond: (status = 'pending' AND created_at > '2025-01-01')
--         Buffers: shared hit=5
-- Planning Time: 0.215 ms
-- Execution Time: 0.172 ms
```

Key things to look for:

| Field | Meaning |
|-------|---------|
| `cost=0.43..12.50` | Estimated startup cost..total cost |
| `rows=20` | Estimated number of rows |
| `actual time=0.082..0.145` | Real time in ms (startup..total) |
| `actual rows=20` | Real number of rows |
| `Buffers: shared hit=5` | Pages read from buffer cache |
| `Buffers: shared read=3` | Pages read from disk |
| `loops=1` | Number of times this node was executed |

## The Overhead of Indexes

### Write Amplification

Every index on a table adds overhead to every write operation:

```
INSERT into a table with N indexes:
  1. Insert tuple into heap (1 write)
  2. Insert entry into Index 1 (1 write)
  3. Insert entry into Index 2 (1 write)
  ...
  N+1. Insert entry into Index N (1 write)

  Total writes: N + 1

UPDATE of an indexed column on a table with N indexes:
  1. Mark old heap tuple as dead
  2. Insert new heap tuple (1 write)
  3. Insert new entry into each affected index
  4. (Old index entries are cleaned up by VACUUM)

  Note: PostgreSQL's HOT (Heap-Only Tuple) optimization can avoid
  index updates if the updated column is NOT indexed AND the new
  tuple fits on the same page. This is why fillfactor < 100 helps.
```

**Benchmark: INSERT throughput vs number of indexes:**

```
Table: 50 columns, 200-byte rows
Database: PostgreSQL 16, SSD, 32 GB RAM

Indexes    INSERT/sec    Relative Speed
────────   ──────────    ──────────────
0          45,000        100%
1          32,000        71%
2          25,000        56%
3          20,000        44%
5          14,000        31%
8          9,000         20%
10         7,000         16%
15         4,500         10%

Every index roughly halves your INSERT throughput
when going from 0 to ~3 indexes.
```

### Storage Cost

```sql
-- Check index sizes for a table
SELECT
  indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan AS times_used,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE relname = 'orders'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Example output:
-- index_name              | index_size | times_used | tuples_read
-- idx_orders_pkey         | 214 MB     | 4,521,300  | 4,521,300
-- idx_orders_customer     | 182 MB     | 892,100    | 2,314,500
-- idx_orders_status_date  | 320 MB     | 156,200    | 12,450,300
-- idx_orders_email        | 245 MB     | 12         | 36
-- idx_orders_old_status   | 210 MB     | 0          | 0       ← UNUSED!
```

## PostgreSQL-Specific Features

### CREATE INDEX CONCURRENTLY

Normal index creation locks the table against writes for the entire duration. For large tables, this can mean minutes or hours of downtime.

```sql
-- Regular index creation: BLOCKS writes
CREATE INDEX idx_orders_date ON orders (created_at);
-- Duration: 90 seconds. All INSERTs/UPDATEs blocked for 90 seconds.

-- Concurrent index creation: does NOT block writes
CREATE INDEX CONCURRENTLY idx_orders_date ON orders (created_at);
-- Duration: 120 seconds (slightly longer). No write blocking.
-- The table is scanned twice:
--   Pass 1: Build the index from current table contents
--   Pass 2: Add any rows that were inserted/updated during Pass 1
```

**Caveats of CONCURRENTLY:**

1. Takes longer than regular CREATE INDEX (2-3x)
2. Requires more disk space temporarily
3. Cannot be run inside a transaction block
4. If it fails partway through, leaves an INVALID index that must be dropped:

```sql
-- Check for invalid indexes:
SELECT indexrelid::regclass, indisvalid
FROM pg_index
WHERE NOT indisvalid;

-- Drop invalid index:
DROP INDEX CONCURRENTLY idx_orders_date;
-- Then retry the creation
```

### B-Tree Deduplication (PostgreSQL 13+)

For columns with many duplicate values, PostgreSQL 13+ can store each distinct value once with a list of TIDs, rather than storing separate index entries for each occurrence:

```
Before deduplication (status column with 5 values, 1M rows):
  'cancelled' → TID(0,1)
  'cancelled' → TID(0,5)
  'cancelled' → TID(0,12)
  ... (200K entries for 'cancelled')
  'pending' → TID(0,2)
  'pending' → TID(0,3)
  ... (200K entries for 'pending')

After deduplication:
  'cancelled' → [TID(0,1), TID(0,5), TID(0,12), ...]  ← Single entry
  'pending' → [TID(0,2), TID(0,3), ...]                ← Single entry

Space savings: 30-50% for low-cardinality columns
```

```sql
-- Deduplication is enabled by default in PG13+
-- You can disable it per index:
CREATE INDEX idx_status ON orders (status) WITH (deduplicate_items = off);

-- Check if an index is using deduplication:
SELECT
  indexrelname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE relname = 'orders';
```

### Index-Only Scan and the Visibility Map

```sql
-- Check visibility map coverage:
CREATE EXTENSION IF NOT EXISTS pg_visibility;

SELECT
  all_visible AS pages_visible,
  all_frozen AS pages_frozen,
  (SELECT relpages FROM pg_class WHERE relname = 'orders') AS total_pages,
  round(
    100.0 * all_visible /
    NULLIF((SELECT relpages FROM pg_class WHERE relname = 'orders'), 0),
    1
  ) AS pct_visible
FROM (
  SELECT
    count(*) FILTER (WHERE all_visible) AS all_visible,
    count(*) FILTER (WHERE all_frozen) AS all_frozen
  FROM pg_visibility('orders')
) sub;

-- If pct_visible is low, index-only scans will be slow.
-- Run VACUUM to mark pages as all-visible.
VACUUM orders;
```

## Real Benchmarks: Index Type Comparison

All benchmarks on PostgreSQL 16, 10M rows, 8 vCPU, 32 GB RAM, NVMe SSD.

### Equality Lookup

```
Query: SELECT * FROM users WHERE email = 'specific@example.com'

No index:       4,200 ms (seq scan)
B+tree:         0.15 ms
Hash:           0.08 ms

Winner: Hash (2x faster), but B+tree is close and more versatile
```

### Range Query

```
Query: SELECT * FROM orders WHERE created_at BETWEEN '2025-01-01' AND '2025-01-31'
Returns: ~83K rows (1/12th of a year's data)

No index:       3,800 ms (seq scan)
B+tree:         120 ms (index scan)
B+tree:         45 ms (bitmap index scan — planner prefers this for 0.8% selectivity)
BRIN (128):     180 ms (scans more pages than needed, but tiny index)
Hash:           N/A (does not support range queries)

Winner: B+tree (bitmap scan mode)
```

### Full-Text Search

```
Query: SELECT * FROM articles WHERE search_vector @@ to_tsquery('database & performance')
Returns: ~200 rows from 5M articles

No index:       8,500 ms (seq scan with tsvector match)
GIN:            1.2 ms
GiST:           3.8 ms (GiST is slower for FTS but supports ranking in scan)

Winner: GIN (3x faster than GiST for containment queries)
```

### JSONB Containment

```
Query: SELECT * FROM events WHERE data @> '{"type": "purchase"}'
Returns: ~50K rows from 10M events

No index:       6,200 ms (seq scan)
GIN (jsonb_ops):   12 ms
GIN (path_ops):    8 ms

Winner: GIN jsonb_path_ops (smaller index, faster for @>)
```

### Nearest-Neighbor (PostGIS)

```
Query: SELECT * FROM locations ORDER BY geom <-> ST_MakePoint(-73.98, 40.74) LIMIT 10
Table: 2M geographic points

No index:       12,000 ms (seq scan + sort)
GiST:           0.5 ms (index-ordered scan)

Winner: GiST (only option for ordered distance scan)
```

### Time-Series Point Lookup

```
Query: SELECT * FROM sensor_data WHERE recorded_at = '2025-03-15 14:30:00'
Table: 100M rows, append-only, naturally ordered by time

No index:       45,000 ms
B+tree:         0.1 ms (but index size: 2.1 GB)
BRIN (128):     15 ms (index size: 256 KB)
BRIN (32):      4 ms (index size: 1 MB)

Winner: B+tree for speed, BRIN for storage efficiency
Recommendation: BRIN unless sub-millisecond lookups are critical
```

## TypeScript: B+Tree vs Sequential Scan Simulation

```typescript
// ============================================================
// B+Tree Index Lookup vs Sequential Scan Simulation
// Demonstrates the O(log N) vs O(N) performance difference
// ============================================================

interface DataRow {
  id: number;
  email: string;
  name: string;
  balance: number;
}

// ============================================================
// B+Tree Implementation (simplified, in-memory)
// ============================================================

interface BTreeLeafNode {
  type: 'leaf';
  keys: number[];
  values: number[]; // Row indices into the table
  next: BTreeLeafNode | null;
}

interface BTreeInternalNode {
  type: 'internal';
  keys: number[];
  children: (BTreeInternalNode | BTreeLeafNode)[];
}

type BTreeNode = BTreeInternalNode | BTreeLeafNode;

class BPlusTree {
  private root: BTreeNode;
  private readonly order: number;
  public pageReads = 0;

  constructor(order: number = 50) {
    this.order = order;
    this.root = { type: 'leaf', keys: [], values: [], next: null };
  }

  insert(key: number, rowIndex: number): void {
    const result = this.insertRecursive(this.root, key, rowIndex);
    if (result) {
      // Root was split — create a new root
      const newRoot: BTreeInternalNode = {
        type: 'internal',
        keys: [result.key],
        children: [this.root, result.node],
      };
      this.root = newRoot;
    }
  }

  private insertRecursive(
    node: BTreeNode,
    key: number,
    rowIndex: number
  ): { key: number; node: BTreeNode } | null {
    if (node.type === 'leaf') {
      // Find insertion position
      let pos = 0;
      while (pos < node.keys.length && node.keys[pos] < key) pos++;
      node.keys.splice(pos, 0, key);
      node.values.splice(pos, 0, rowIndex);

      // Split if overflow
      if (node.keys.length >= this.order) {
        const mid = Math.floor(node.keys.length / 2);
        const newLeaf: BTreeLeafNode = {
          type: 'leaf',
          keys: node.keys.splice(mid),
          values: node.values.splice(mid),
          next: node.next,
        };
        node.next = newLeaf;
        return { key: newLeaf.keys[0], node: newLeaf };
      }
      return null;
    }

    // Internal node: find child to descend into
    let childIdx = 0;
    while (childIdx < node.keys.length && key >= node.keys[childIdx]) {
      childIdx++;
    }

    const result = this.insertRecursive(
      node.children[childIdx], key, rowIndex
    );
    if (!result) return null;

    // Insert the promoted key
    node.keys.splice(childIdx, 0, result.key);
    node.children.splice(childIdx + 1, 0, result.node);

    // Split if overflow
    if (node.keys.length >= this.order) {
      const mid = Math.floor(node.keys.length / 2);
      const promotedKey = node.keys[mid];
      const newInternal: BTreeInternalNode = {
        type: 'internal',
        keys: node.keys.splice(mid + 1),
        children: node.children.splice(mid + 1),
      };
      node.keys.pop(); // Remove the promoted key from left node
      return { key: promotedKey, node: newInternal };
    }
    return null;
  }

  search(key: number): number | null {
    this.pageReads = 0;
    return this.searchRecursive(this.root, key);
  }

  private searchRecursive(node: BTreeNode, key: number): number | null {
    this.pageReads++; // Each node access = 1 page read

    if (node.type === 'leaf') {
      const idx = node.keys.indexOf(key);
      return idx >= 0 ? node.values[idx] : null;
    }

    // Find the child to descend into
    let childIdx = 0;
    while (childIdx < node.keys.length && key >= node.keys[childIdx]) {
      childIdx++;
    }
    return this.searchRecursive(node.children[childIdx], key);
  }

  rangeSearch(low: number, high: number): number[] {
    this.pageReads = 0;
    const results: number[] = [];

    // Find the leaf containing `low`
    let leaf = this.findLeaf(this.root, low);

    // Scan forward through linked leaves
    while (leaf) {
      this.pageReads++; // Reading a leaf page
      for (let i = 0; i < leaf.keys.length; i++) {
        if (leaf.keys[i] > high) return results;
        if (leaf.keys[i] >= low) results.push(leaf.values[i]);
      }
      leaf = leaf.next;
    }
    return results;
  }

  private findLeaf(node: BTreeNode, key: number): BTreeLeafNode | null {
    this.pageReads++;
    if (node.type === 'leaf') return node;

    let childIdx = 0;
    while (childIdx < node.keys.length && key >= node.keys[childIdx]) {
      childIdx++;
    }
    return this.findLeaf(node.children[childIdx], key);
  }

  getDepth(): number {
    let depth = 0;
    let node: BTreeNode = this.root;
    while (node.type === 'internal') {
      depth++;
      node = node.children[0];
    }
    return depth + 1; // +1 for the leaf level
  }
}

// ============================================================
// Sequential Scan Implementation
// ============================================================

class SequentialScanner {
  public rowsExamined = 0;

  search(table: DataRow[], predicate: (row: DataRow) => boolean): DataRow[] {
    this.rowsExamined = 0;
    const results: DataRow[] = [];
    for (const row of table) {
      this.rowsExamined++;
      if (predicate(row)) results.push(row);
    }
    return results;
  }
}

// ============================================================
// Performance Comparison
// ============================================================

function generateTable(size: number): DataRow[] {
  const table: DataRow[] = [];
  for (let i = 0; i < size; i++) {
    table.push({
      id: i,
      email: `user${i}@example.com`,
      name: `User ${i}`,
      balance: Math.floor(Math.random() * 10000),
    });
  }
  return table;
}

function runComparison(tableSize: number): void {
  console.log(`\nTable size: ${tableSize.toLocaleString()} rows`);
  console.log('-'.repeat(50));

  const table = generateTable(tableSize);

  // Build B+tree index on id column
  const buildStart = performance.now();
  const index = new BPlusTree(100); // Order 100 for realistic branching factor
  for (let i = 0; i < table.length; i++) {
    index.insert(table[i].id, i);
  }
  const buildTime = performance.now() - buildStart;

  console.log(`Index build time: ${buildTime.toFixed(1)} ms`);
  console.log(`Index depth: ${index.getDepth()} levels`);

  // Point lookup comparison
  const targetId = Math.floor(tableSize * 0.73); // Arbitrary target

  // B+tree lookup
  const indexStart = performance.now();
  const rowIdx = index.search(targetId);
  const indexTime = performance.now() - indexStart;
  const indexPageReads = index.pageReads;

  // Sequential scan
  const scanner = new SequentialScanner();
  const seqStart = performance.now();
  scanner.search(table, (r) => r.id === targetId);
  const seqTime = performance.now() - seqStart;

  console.log(`\nPoint lookup (id = ${targetId}):`);
  console.log(
    `  B+tree: ${indexTime.toFixed(3)} ms, ` +
    `${indexPageReads} page reads`
  );
  console.log(
    `  SeqScan: ${seqTime.toFixed(3)} ms, ` +
    `${scanner.rowsExamined.toLocaleString()} rows examined`
  );
  console.log(
    `  Speedup: ${(seqTime / Math.max(indexTime, 0.001)).toFixed(1)}x`
  );

  // Range query comparison
  const rangeLow = Math.floor(tableSize * 0.4);
  const rangeHigh = Math.floor(tableSize * 0.41); // ~1% of table

  const rangeIndexStart = performance.now();
  const rangeResults = index.rangeSearch(rangeLow, rangeHigh);
  const rangeIndexTime = performance.now() - rangeIndexStart;
  const rangePageReads = index.pageReads;

  const rangeSeqStart = performance.now();
  const seqRangeResults = scanner.search(
    table, (r) => r.id >= rangeLow && r.id <= rangeHigh
  );
  const rangeSeqTime = performance.now() - rangeSeqStart;

  console.log(
    `\nRange query (${rangeLow} <= id <= ${rangeHigh}, ` +
    `~${rangeResults.length} rows):`
  );
  console.log(
    `  B+tree: ${rangeIndexTime.toFixed(3)} ms, ` +
    `${rangePageReads} page reads`
  );
  console.log(
    `  SeqScan: ${rangeSeqTime.toFixed(3)} ms, ` +
    `${scanner.rowsExamined.toLocaleString()} rows examined`
  );
  console.log(
    `  Speedup: ${(rangeSeqTime / Math.max(rangeIndexTime, 0.001)).toFixed(1)}x`
  );
}

// Run benchmarks at different scales
console.log('B+Tree Index vs Sequential Scan Performance Comparison');
console.log('='.repeat(55));

runComparison(1_000);
runComparison(10_000);
runComparison(100_000);
runComparison(1_000_000);

console.log('\n' + '='.repeat(55));
console.log('Key takeaway: B+tree advantage grows with table size');
console.log('1K rows: ~10x faster, 1M rows: ~1000x faster');
console.log('='.repeat(55));
```

## Decision Framework: Which Index Type for Which Query Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     INDEX TYPE DECISION FRAMEWORK                       │
├─────────────────────┬───────────────────────────────────────────────────┤
│ Query Pattern       │ Recommended Index                                │
├─────────────────────┼───────────────────────────────────────────────────┤
│ WHERE col = value   │ B+tree (default) or Hash (if ONLY equality)     │
│ WHERE col > value   │ B+tree                                          │
│ WHERE col BETWEEN   │ B+tree                                          │
│ ORDER BY col        │ B+tree                                          │
│ WHERE col LIKE 'x%' │ B+tree with text_pattern_ops                   │
│ WHERE col LIKE '%x' │ GIN with pg_trgm (trigram)                     │
│ WHERE ts @@ query   │ GIN (fastest) or GiST (supports ordering)      │
│ WHERE json @> '{}'  │ GIN (jsonb_path_ops for @> only)               │
│ WHERE json ? 'key'  │ GIN (jsonb_ops — default)                      │
│ WHERE arr @> '{x}'  │ GIN                                             │
│ WHERE arr && '{x}'  │ GIN                                             │
│ WHERE ST_DWithin()  │ GiST (PostGIS)                                 │
│ ORDER BY p <-> q    │ GiST (nearest-neighbor)                        │
│ WHERE range && range│ GiST                                            │
│ WHERE ts = value    │ BRIN (if data is physically ordered by ts)      │
│ WHERE ts > value    │ BRIN (if data is physically ordered by ts)      │
│ WHERE col = val     │ Partial index WHERE condition (if subset)       │
│ WHERE f(col) = val  │ Expression index on f(col)                      │
│ SELECT a,b only     │ Covering index: (a) INCLUDE (b)                │
│ Low-card + High-card│ Composite: (low_card, high_card)               │
│ Equality + Range    │ Composite: (equality_col, range_col)            │
└─────────────────────┴───────────────────────────────────────────────────┘
```

## Anti-Patterns: Common Indexing Mistakes

### Anti-Pattern 1: Over-Indexing

```sql
-- DON'T: Create an index for every possible query
CREATE INDEX idx_1 ON users (email);
CREATE INDEX idx_2 ON users (name);
CREATE INDEX idx_3 ON users (email, name);           -- Redundant! idx_1 covers email
CREATE INDEX idx_4 ON users (name, email);           -- Partially redundant with idx_2
CREATE INDEX idx_5 ON users (status);
CREATE INDEX idx_6 ON users (status, created_at);    -- Makes idx_5 redundant
CREATE INDEX idx_7 ON users (email, status);
CREATE INDEX idx_8 ON users (status, email);         -- Overlaps with idx_7

-- Each index costs ~15% INSERT performance.
-- 8 indexes = ~55% slower INSERTs!

-- DO: Analyze actual query patterns and create minimal covering indexes
CREATE INDEX idx_users_email ON users (email);                -- Covers email lookups
CREATE INDEX idx_users_status_date ON users (status, created_at); -- Covers status + date
CREATE INDEX idx_users_name ON users (name);                  -- Covers name lookups
-- 3 indexes instead of 8. Same query coverage, 40% faster writes.
```

### Anti-Pattern 2: Unused Indexes

```sql
-- Find indexes that have NEVER been used since the last stats reset:
SELECT
  schemaname || '.' || relname AS table,
  indexrelname AS index,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  idx_scan AS scans
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexrelname NOT LIKE '%pkey%'      -- Don't drop primary keys
AND indexrelname NOT LIKE '%unique%'    -- Don't drop unique constraints
ORDER BY pg_relation_size(indexrelid) DESC;

-- Check when stats were last reset:
SELECT stats_reset FROM pg_stat_database
WHERE datname = current_database();

-- If stats haven't been reset in months and an index has 0 scans,
-- it's safe to drop. But first verify with a staging environment.
```

### Anti-Pattern 3: Redundant Indexes

```sql
-- An index on (a, b) makes a standalone index on (a) redundant,
-- because the composite index covers queries on just (a).

-- Find redundant indexes:
WITH index_cols AS (
  SELECT
    indexrelid,
    indrelid,
    array_agg(attnum ORDER BY array_position(indkey, attnum)) AS cols
  FROM pg_index
  JOIN unnest(indkey) WITH ORDINALITY AS a(attnum, ord) ON true
  GROUP BY indexrelid, indrelid, indkey
)
SELECT
  i1.indexrelid::regclass AS redundant_index,
  i2.indexrelid::regclass AS covering_index,
  pg_size_pretty(pg_relation_size(i1.indexrelid)) AS wasted_space
FROM index_cols i1
JOIN index_cols i2
  ON i1.indrelid = i2.indrelid
  AND i1.indexrelid != i2.indexrelid
  AND i1.cols = i2.cols[1:array_length(i1.cols, 1)]
  AND array_length(i1.cols, 1) < array_length(i2.cols, 1);
```

### Anti-Pattern 4: Indexing Low-Cardinality Columns Alone

```sql
-- DON'T: Create a B+tree index on a boolean or status column alone
CREATE INDEX idx_orders_is_active ON orders (is_active);
-- With 2 values (true/false), each matches 50% of rows.
-- The planner will NEVER use this index — seq scan is faster.

-- DO: Use a partial index instead
CREATE INDEX idx_orders_active ON orders (created_at)
  WHERE is_active = true;
-- If only 5% of orders are active, this is a small, useful index.

-- DO: Use the low-cardinality column as the FIRST column in a composite index
CREATE INDEX idx_orders_status_date ON orders (is_active, created_at);
-- Useful for: WHERE is_active = true AND created_at > '2025-01-01'
-- The equality on is_active narrows to the true subtree,
-- then the range on created_at scans within that subtree.
```

### Anti-Pattern 5: Wrong Column Order in Composite Indexes

```sql
-- Query: WHERE status = 'pending' AND created_at > '2025-01-01'

-- WRONG: Range column first
CREATE INDEX idx_wrong ON orders (created_at, status);
-- The index is sorted by date first. To find 'pending' orders,
-- it must scan ALL dates > Jan 1 and filter by status.

-- RIGHT: Equality column first
CREATE INDEX idx_right ON orders (status, created_at);
-- Jump directly to 'pending', then scan forward from Jan 1.
-- Much fewer index entries examined.
```

### Anti-Pattern 6: Indexing for Functions Without Expression Indexes

```sql
-- WRONG: Index on the raw column, query uses a function
CREATE INDEX idx_users_email ON users (email);
SELECT * FROM users WHERE lower(email) = 'alice@example.com';
-- The planner CANNOT use idx_users_email because lower(email) != email

-- RIGHT: Expression index matching the query's expression
CREATE INDEX idx_users_email_lower ON users (lower(email));
SELECT * FROM users WHERE lower(email) = 'alice@example.com';
-- Now the planner matches the expression and uses the index
```

### Anti-Pattern 7: Not Considering Index Maintenance in Migration Plans

```sql
-- WRONG: Adding 5 indexes in a single migration to a 100M row table
-- on a production database during business hours
ALTER TABLE orders ADD INDEX idx_1 (...);  -- Blocks writes for 5 minutes
ALTER TABLE orders ADD INDEX idx_2 (...);  -- Blocks writes for 5 more minutes
-- Total downtime: 25 minutes

-- RIGHT: Use CONCURRENTLY and deploy indexes one at a time
CREATE INDEX CONCURRENTLY idx_1 ON orders (...);
-- No write blocking. Deploy the next index after this one finishes.
-- Schedule during low-traffic periods.
-- Monitor disk I/O and replication lag during index creation.
```

## Summary: Index Type Quick Reference

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        INDEX TYPE QUICK REFERENCE                            │
├──────────┬───────────────┬────────────────┬────────────────┬────────────────┤
│ Type     │ Structure     │ Best For       │ Cannot Do      │ Size           │
├──────────┼───────────────┼────────────────┼────────────────┼────────────────┤
│ B+tree   │ Balanced tree │ =, <, >, BETWEEN│ FTS, arrays   │ ~20-30% of    │
│          │ linked leaves │ ORDER BY, LIKE%│ JSONB, geometry│ table size     │
├──────────┼───────────────┼────────────────┼────────────────┼────────────────┤
│ Hash     │ Hash table    │ = (equality)   │ <, >, BETWEEN  │ ~15-25% of    │
│          │               │ O(1) lookup    │ ORDER BY, LIKE │ table size     │
├──────────┼───────────────┼────────────────┼────────────────┼────────────────┤
│ GIN      │ Inverted index│ FTS, JSONB     │ Range queries  │ ~30-80% of    │
│          │ key→row_list  │ Arrays, @>, ?  │ ORDER BY dist  │ table size     │
├──────────┼───────────────┼────────────────┼────────────────┼────────────────┤
│ GiST     │ Bounding      │ Geometry, range│ Equality (use  │ ~20-40% of    │
│          │ predicate tree│ KNN, <->       │ B+tree instead)│ table size     │
├──────────┼───────────────┼────────────────┼────────────────┼────────────────┤
│ BRIN     │ Min/max per   │ Time-series    │ Random data    │ ~0.01-0.1%    │
│          │ block range   │ ordered data   │ Point lookups  │ of table size  │
├──────────┼───────────────┼────────────────┼────────────────┼────────────────┤
│ Partial  │ Any of above  │ Subset queries │ Queries not    │ Proportional  │
│          │ + WHERE       │ hot/cold data  │ matching WHERE │ to subset      │
├──────────┼───────────────┼────────────────┼────────────────┼────────────────┤
│ Express. │ Any of above  │ Function-based │ Queries not    │ Same as base   │
│          │ + function    │ queries        │ using function │ type           │
└──────────┴───────────────┴────────────────┴────────────────┴────────────────┘
```
