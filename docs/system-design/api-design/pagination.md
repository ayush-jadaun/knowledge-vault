---
title: "Pagination Patterns"
description: "Offset, cursor, and keyset pagination — how each works, when each breaks, and how to design pagination that stays fast at scale."
tags: [api-design, pagination, cursor, offset, keyset, performance]
difficulty: "intermediate"
prerequisites: [system-design/api-design/index]
lastReviewed: "2026-06-12"
---

# Pagination Patterns

Pagination is not a convenience feature — it's a safety feature. An unpaginated endpoint that returns all results will work fine in development with 100 rows, and will bring down your database in production when someone queries a table with 50 million rows. Every list endpoint must be paginated.

The question is which pagination strategy to use. The three main approaches differ dramatically in performance, consistency, and complexity as datasets grow.

---

## Strategy 1: Offset Pagination

The simplest approach. Use `offset` (skip N rows) and `limit` (return N rows).

```
GET /posts?offset=0&limit=20    → rows 1-20
GET /posts?offset=20&limit=20   → rows 21-40
GET /posts?offset=40&limit=20   → rows 41-60
```

**SQL equivalent:**
```sql
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 40;
```

**API response:**
```json
{
  "data": [...],
  "pagination": {
    "total": 10000,
    "offset": 40,
    "limit": 20,
    "has_next": true
  }
}
```

### Why Offset Breaks at Scale

**The database must scan and skip:** `OFFSET 40000 LIMIT 20` doesn't mean "read rows 40001-40020." The database reads rows 1-40020, discards 1-40000, and returns 40001-40020. At page 2000, you're scanning 40,000 rows per request.

**Benchmark on PostgreSQL with 10M rows:**
```
OFFSET 0:       1ms
OFFSET 10,000:  40ms
OFFSET 100,000: 400ms
OFFSET 1,000,000: 4,000ms
```

**Consistency problem:** If rows are inserted or deleted between page requests, results shift. Page 2 might contain the last item from page 1 (an item was deleted, everything shifted left). Or an item might appear on two different pages.

```
Client fetches page 1: items [1, 2, 3, 4, 5]
Someone deletes item 3.
Client fetches page 2: items [5, 6, 7, 8, 9]  ← item 5 appeared on page 1 AND page 2
```

### When Offset Works Well

- Small datasets (< 10,000 rows)
- Random access pagination is required (user jumps to page 47)
- Total count display is needed ("Showing results 41-60 of 1,847")
- Data doesn't change frequently

**Don't use offset for:** Feed pagination, infinite scroll, large exports, real-time data.

---

## Strategy 2: Cursor Pagination

Use an opaque cursor (a token) that encodes the position of the last item seen. The server knows how to resume from that position.

```
GET /posts?limit=20
→ Returns items + cursor: "cursor": "eyJpZCI6MTAwfQ=="

GET /posts?after=eyJpZCI6MTAwfQ==&limit=20
→ Returns next 20 items after item 100
```

**Implementation:**
```python
# Cursor is base64-encoded JSON with the position marker
import base64, json

def encode_cursor(item_id: int) -> str:
    return base64.b64encode(json.dumps({"id": item_id}).encode()).decode()

def decode_cursor(cursor: str) -> dict:
    return json.loads(base64.b64decode(cursor.encode()).decode())

@router.get('/posts')
async def list_posts(after: str = None, limit: int = 20):
    query = db.select(Post).order_by(Post.id.desc()).limit(limit + 1)
    
    if after:
        cursor_data = decode_cursor(after)
        query = query.where(Post.id < cursor_data['id'])
    
    posts = await query.all()
    has_next = len(posts) > limit
    posts = posts[:limit]
    
    return {
        "data": [p.to_dict() for p in posts],
        "cursor": encode_cursor(posts[-1].id) if has_next else None,
        "has_next": has_next
    }
```

**SQL equivalent:**
```sql
-- Much better than OFFSET
SELECT * FROM posts WHERE id < 100 ORDER BY id DESC LIMIT 20;
```

This uses the index on `id` directly — constant time regardless of how far into the dataset you are.

### Properties

- **O(1) page fetch time** — doesn't slow down as you paginate deeper
- **Stable** — insertions/deletions don't cause duplicates or skipped items (as long as ordering is stable)
- **No random access** — you can't jump to page 47
- **No total count** — can show "load more" but not "showing 41-60 of 1,847"

### Cursor Design

The cursor should encode everything needed to resume: typically the value(s) of the ORDER BY column(s).

**Simple case (ordering by single unique column):**
```json
{"id": 12345}
```

**Composite ordering (created_at + id tiebreaker):**
```json
{"created_at": "2024-01-15T10:30:00Z", "id": 12345}
```

**SQL for composite cursor:**
```sql
SELECT * FROM posts 
WHERE (created_at, id) < ('2024-01-15T10:30:00', 12345)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

**Opaque cursors:** Base64-encode the cursor payload. This lets you change the internal cursor format without clients needing to change (since they treat it as opaque).

---

## Strategy 3: Keyset Pagination

Keyset pagination is cursor pagination done at the SQL level using indexed column values directly (rather than encoding them in a token). Often faster because the WHERE clause can use composite indexes efficiently.

```
GET /posts?created_before=2024-01-15T10:30:00Z&id_before=12345&limit=20
```

**SQL:**
```sql
SELECT * FROM posts
WHERE (created_at < '2024-01-15T10:30:00' 
   OR (created_at = '2024-01-15T10:30:00' AND id < 12345))
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

With a composite index on `(created_at, id)`, this is very fast.

**Difference from cursor:** Keyset exposes the actual column values in the API. Cursor encodes them in a token. Both achieve O(1) pagination performance. Cursor is cleaner for external APIs (clients don't need to know your sort key). Keyset is sometimes easier to implement and debug.

---

## Bidirectional Pagination

For feeds that need both "load more" (older items) and "refresh" (newer items):

```json
{
  "data": [...],
  "cursors": {
    "before": "eyJpZCI6MTI1fQ==",  // next_page cursor (older items)
    "after": "eyJpZCI6MTAwfQ=="    // prev_page cursor (newer items, for refresh)
  },
  "has_next": true,
  "has_prev": false
}
```

```
GET /feed?before=eyJpZCI6MTI1fQ==  → older items
GET /feed?after=eyJpZCI6MTAwfQ==   → newer items (since last sync)
```

This is the pattern used by social media feeds — infinite scroll downward, pull-to-refresh upward.

---

## Comparison Table

| | Offset | Cursor | Keyset |
|-|-|-|-|
| Performance at depth | O(N) — degrades | O(1) | O(1) |
| Random access (jump to page N) | Yes | No | No |
| Total count | Yes | No | No |
| Stability with concurrent writes | No | Yes | Yes |
| Bidirectional | Yes | Yes (with effort) | Yes |
| Complexity | Low | Medium | Medium |
| Best for | Admin UIs, small datasets | Feeds, infinite scroll | High-performance lists |

---

## Practical Recommendations

**Default page size:** 20-100. Never return all results by default.

**Maximum page size:** Cap it — even cursor pagination can return too much if `limit=100000`.

**Always paginate list endpoints.** Even if there are only 5 rows today.

**Return `has_next` not just a cursor:** Clients shouldn't have to check if the cursor is null to know there are more results.

**Consider Facebook-style `?limit=20&after=cursor`** for feeds — it's widely understood and easy to implement.

```json
// Standard paginated response structure
{
  "data": [],
  "pagination": {
    "cursor": "eyJpZCI6MTAwfQ==",
    "has_next": true,
    "limit": 20
  }
}
```
