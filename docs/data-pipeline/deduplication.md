---
title: "Deduplication Strategies"
description: "Production deduplication — exact duplicate detection, fuzzy matching with record linkage, blocking strategies for performance, MinHash and LSH for near-duplicates, entity resolution, and cross-source deduplication at scale."
tags: [preprocessing, deduplication, record-linkage, fuzzy-matching, data-quality]
difficulty: advanced
prerequisites: []
lastReviewed: "2026-03-25"
---

# Deduplication Strategies

Duplicate records are the silent poison of data pipelines. They inflate counts, bias averages, create phantom customers, double-count revenue, and train models on repeated samples. Exact duplicates are easy — call `drop_duplicates()`. The hard problem is near-duplicates: "John Smith" at "123 Main St" and "J. Smith" at "123 Main Street" are the same person, but no simple comparison catches that. This page covers every deduplication technique from exact matching to probabilistic entity resolution.

---

## Deduplication Spectrum

```
Simple ────────────────────────────────────── Complex
  │                                              │
  Exact          Fuzzy           Record         Entity
  Duplicates     Matching        Linkage        Resolution
  │              │               │              │
  hash/key       similarity      blocking +     ML-based
  comparison     thresholds      comparison     matching
  │              │               │              │
  O(n)           O(n^2)          O(n*b)         O(n*b*f)
  microseconds   seconds         minutes        hours
```

---

## Exact Duplicate Detection

```python
# exact_dedup.py — Find and remove exact duplicates
import pandas as pd
import hashlib
import json
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class ExactDeduplicator:
    """Detect and remove exact duplicate rows."""

    @staticmethod
    def by_columns(
        df: pd.DataFrame,
        subset: list[str] | None = None,
        keep: str = "first",
    ) -> pd.DataFrame:
        """Standard pandas deduplication."""
        before = len(df)
        result = df.drop_duplicates(subset=subset, keep=keep)
        after = len(result)
        logger.info(f"Exact dedup: {before} -> {after} rows ({before - after} removed)")
        return result

    @staticmethod
    def by_hash(
        df: pd.DataFrame,
        columns: list[str] | None = None,
    ) -> pd.DataFrame:
        """Hash-based deduplication — faster for large DataFrames."""
        cols = columns or df.columns.tolist()

        def row_hash(row):
            content = "|".join(str(row[c]) for c in cols)
            return hashlib.md5(content.encode()).hexdigest()

        df_result = df.copy()
        df_result["_hash"] = df_result.apply(row_hash, axis=1)
        df_result = df_result.drop_duplicates(subset="_hash", keep="first")
        df_result = df_result.drop(columns="_hash")

        return df_result

    @staticmethod
    def find_duplicate_groups(
        df: pd.DataFrame,
        subset: list[str],
    ) -> pd.DataFrame:
        """Find and display groups of duplicate rows."""
        duplicated = df.duplicated(subset=subset, keep=False)
        dup_groups = df[duplicated].sort_values(by=subset)
        group_counts = dup_groups.groupby(subset).size().reset_index(name="count")
        logger.info(
            f"Found {len(group_counts)} duplicate groups "
            f"({duplicated.sum()} total duplicate rows)"
        )
        return dup_groups

    @staticmethod
    def deduplicate_with_priority(
        df: pd.DataFrame,
        key_columns: list[str],
        priority_column: str,
        ascending: bool = False,
    ) -> pd.DataFrame:
        """
        Keep the highest-priority record from each duplicate group.

        Example: Keep the most recent record (by updated_at) for each customer_id.
        """
        sorted_df = df.sort_values(by=priority_column, ascending=ascending)
        return sorted_df.drop_duplicates(subset=key_columns, keep="first")


# Usage
df_clean = ExactDeduplicator.by_columns(
    df, subset=["email", "phone"], keep="last"
)

# Keep the most recently updated record per customer
df_latest = ExactDeduplicator.deduplicate_with_priority(
    df,
    key_columns=["customer_id"],
    priority_column="updated_at",
    ascending=False,  # Most recent first
)
```

---

## Fuzzy Matching with Record Linkage

```python
# fuzzy_dedup.py — Fuzzy matching for near-duplicate detection
import pandas as pd
import numpy as np
from rapidfuzz import fuzz
from itertools import combinations
import logging

logger = logging.getLogger(__name__)


class FuzzyDeduplicator:
    """Find near-duplicate records using string similarity."""

    def __init__(
        self,
        match_columns: list[dict],
        threshold: float = 0.85,
    ):
        """
        Args:
            match_columns: List of dicts with:
                - "column": column name
                - "weight": importance weight (0-1)
                - "method": similarity method
            threshold: overall similarity threshold for match
        """
        self.match_columns = match_columns
        self.threshold = threshold

    def compute_similarity(self, row1: pd.Series, row2: pd.Series) -> float:
        """Compute weighted similarity between two records."""
        total_weight = sum(mc["weight"] for mc in self.match_columns)
        weighted_score = 0

        for mc in self.match_columns:
            col = mc["column"]
            weight = mc["weight"]
            method = mc.get("method", "token_sort_ratio")

            val1 = str(row1.get(col, ""))
            val2 = str(row2.get(col, ""))

            if not val1 or not val2:
                continue

            scorer = getattr(fuzz, method, fuzz.token_sort_ratio)
            score = scorer(val1, val2) / 100.0
            weighted_score += score * weight

        return weighted_score / total_weight if total_weight > 0 else 0

    def find_duplicates_bruteforce(
        self,
        df: pd.DataFrame,
        max_comparisons: int = 1_000_000,
    ) -> list[tuple[int, int, float]]:
        """
        Brute-force pairwise comparison.
        WARNING: O(n^2) — only use for small datasets (< 10,000 rows).
        """
        n = len(df)
        total_pairs = n * (n - 1) // 2

        if total_pairs > max_comparisons:
            logger.warning(
                f"Too many pairs ({total_pairs:,}). Use blocking. "
                f"Max allowed: {max_comparisons:,}"
            )
            return []

        matches = []
        for i in range(n):
            for j in range(i + 1, n):
                score = self.compute_similarity(df.iloc[i], df.iloc[j])
                if score >= self.threshold:
                    matches.append((df.index[i], df.index[j], score))

        logger.info(f"Found {len(matches)} duplicate pairs from {total_pairs:,} comparisons")
        return matches


# Usage
deduplicator = FuzzyDeduplicator(
    match_columns=[
        {"column": "name", "weight": 0.4, "method": "token_sort_ratio"},
        {"column": "email", "weight": 0.3, "method": "ratio"},
        {"column": "address", "weight": 0.2, "method": "partial_ratio"},
        {"column": "phone", "weight": 0.1, "method": "ratio"},
    ],
    threshold=0.85,
)

matches = deduplicator.find_duplicates_bruteforce(df_small)
for idx1, idx2, score in matches[:10]:
    print(f"  Match ({score:.1%}): [{idx1}] {df.loc[idx1, 'name']} <-> [{idx2}] {df.loc[idx2, 'name']}")
```

---

## Blocking Strategies

Blocking reduces comparisons from O(n^2) to O(n * block_size) by only comparing records within the same "block."

```python
# blocking.py — Reduce comparison space for deduplication
import pandas as pd
from collections import defaultdict
import logging
from typing import Callable
import re

logger = logging.getLogger(__name__)


class BlockingStrategy:
    """Generate blocking keys to reduce comparison space."""

    @staticmethod
    def exact_key(df: pd.DataFrame, columns: list[str]) -> pd.Series:
        """Block on exact match of specified columns."""
        return df[columns].apply(
            lambda row: "|".join(str(v).lower().strip() for v in row),
            axis=1,
        )

    @staticmethod
    def first_n_chars(df: pd.DataFrame, column: str, n: int = 3) -> pd.Series:
        """Block on first N characters."""
        return df[column].astype(str).str[:n].str.lower()

    @staticmethod
    def soundex(df: pd.DataFrame, column: str) -> pd.Series:
        """Block on Soundex phonetic code."""
        import jellyfish
        return df[column].apply(
            lambda x: jellyfish.soundex(str(x)) if pd.notna(x) else "XXXX"
        )

    @staticmethod
    def metaphone(df: pd.DataFrame, column: str) -> pd.Series:
        """Block on Metaphone phonetic code (better than Soundex)."""
        import jellyfish
        return df[column].apply(
            lambda x: jellyfish.metaphone(str(x)) if pd.notna(x) else "XXXX"
        )

    @staticmethod
    def zip_code(df: pd.DataFrame, column: str) -> pd.Series:
        """Block on first 3 digits of zip code."""
        return df[column].astype(str).str[:3]

    @staticmethod
    def year_month(df: pd.DataFrame, column: str) -> pd.Series:
        """Block on year-month of a date column."""
        dates = pd.to_datetime(df[column], errors="coerce")
        return dates.dt.strftime("%Y-%m")


class BlockedDeduplicator:
    """Deduplication with blocking for scalability."""

    def __init__(
        self,
        blocking_keys: list[Callable],
        match_fn: Callable,
        threshold: float = 0.85,
    ):
        self.blocking_keys = blocking_keys
        self.match_fn = match_fn
        self.threshold = threshold

    def find_duplicates(self, df: pd.DataFrame) -> list[tuple[int, int, float]]:
        """Find duplicates using multiple blocking passes."""
        candidate_pairs = set()

        # Generate candidates from each blocking key
        for key_fn in self.blocking_keys:
            keys = key_fn(df)
            blocks = defaultdict(list)

            for idx, key in zip(df.index, keys):
                if pd.notna(key) and str(key).strip():
                    blocks[key].append(idx)

            for block_key, indices in blocks.items():
                if 1 < len(indices) <= 100:  # Skip singletons and huge blocks
                    for i, idx1 in enumerate(indices):
                        for idx2 in indices[i + 1:]:
                            candidate_pairs.add(
                                (min(idx1, idx2), max(idx1, idx2))
                            )

        logger.info(f"Generated {len(candidate_pairs):,} candidate pairs from blocking")

        # Score candidates
        matches = []
        for idx1, idx2 in candidate_pairs:
            score = self.match_fn(df.loc[idx1], df.loc[idx2])
            if score >= self.threshold:
                matches.append((idx1, idx2, score))

        logger.info(f"Found {len(matches)} confirmed matches")
        return matches

    def merge_duplicates(
        self,
        df: pd.DataFrame,
        matches: list[tuple[int, int, float]],
        keep: str = "first",
    ) -> pd.DataFrame:
        """Merge duplicate groups, keeping one record per group."""
        # Build connected components from match pairs
        from collections import deque

        graph = defaultdict(set)
        for idx1, idx2, _ in matches:
            graph[idx1].add(idx2)
            graph[idx2].add(idx1)

        # Find connected components (duplicate groups)
        visited = set()
        groups = []

        for node in graph:
            if node in visited:
                continue
            group = []
            queue = deque([node])
            while queue:
                current = queue.popleft()
                if current in visited:
                    continue
                visited.add(current)
                group.append(current)
                queue.extend(graph[current] - visited)
            groups.append(sorted(group))

        # Keep one record per group
        indices_to_drop = set()
        for group in groups:
            if keep == "first":
                indices_to_drop.update(group[1:])
            elif keep == "last":
                indices_to_drop.update(group[:-1])

        result = df.drop(index=list(indices_to_drop))
        logger.info(
            f"Merged {len(groups)} duplicate groups, "
            f"dropped {len(indices_to_drop)} rows"
        )
        return result


# Usage
def compare_records(row1, row2):
    name_score = fuzz.token_sort_ratio(str(row1["name"]), str(row2["name"])) / 100
    email_score = fuzz.ratio(str(row1["email"]), str(row2["email"])) / 100
    return 0.5 * name_score + 0.5 * email_score

dedup = BlockedDeduplicator(
    blocking_keys=[
        lambda df: BlockingStrategy.first_n_chars(df, "name", n=3),
        lambda df: BlockingStrategy.first_n_chars(df, "email", n=5),
    ],
    match_fn=compare_records,
    threshold=0.85,
)

matches = dedup.find_duplicates(df)
df_clean = dedup.merge_duplicates(df, matches, keep="first")
```

---

## MinHash / LSH for Near-Duplicates

For text documents or large-scale deduplication, MinHash with Locality-Sensitive Hashing provides sub-linear approximate matching.

```python
# minhash_dedup.py — MinHash LSH for near-duplicate text detection
from datasketch import MinHash, MinHashLSH
import pandas as pd
import re
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class MinHashDeduplicator:
    """
    Near-duplicate detection using MinHash + LSH.

    How it works:
    1. Convert each document to a set of shingles (n-grams)
    2. Create a MinHash signature (fixed-size fingerprint)
    3. Use LSH to find candidate pairs efficiently
    4. Verify candidates with full comparison

    Complexity: O(n) instead of O(n^2)
    """

    def __init__(
        self,
        num_perm: int = 128,
        threshold: float = 0.5,
        shingle_size: int = 3,
    ):
        self.num_perm = num_perm
        self.threshold = threshold
        self.shingle_size = shingle_size
        self.lsh = MinHashLSH(threshold=threshold, num_perm=num_perm)

    def _text_to_shingles(self, text: str) -> set:
        """Convert text to character n-gram shingles."""
        text = re.sub(r"\s+", " ", text.lower().strip())
        return {
            text[i:i + self.shingle_size]
            for i in range(len(text) - self.shingle_size + 1)
        }

    def _create_minhash(self, shingles: set) -> MinHash:
        """Create MinHash signature from shingles."""
        m = MinHash(num_perm=self.num_perm)
        for shingle in shingles:
            m.update(shingle.encode("utf-8"))
        return m

    def find_duplicates(
        self,
        documents: dict[str, str],
    ) -> list[tuple[str, str, float]]:
        """
        Find near-duplicate documents.

        Args:
            documents: {doc_id: text_content}

        Returns: List of (id1, id2, estimated_similarity) tuples
        """
        minhashes = {}

        # Build LSH index
        for doc_id, text in documents.items():
            shingles = self._text_to_shingles(text)
            if not shingles:
                continue
            mh = self._create_minhash(shingles)
            minhashes[doc_id] = mh

            try:
                self.lsh.insert(doc_id, mh)
            except ValueError:
                pass  # Duplicate key

        # Query for duplicates
        duplicate_pairs = set()
        for doc_id, mh in minhashes.items():
            candidates = self.lsh.query(mh)
            for candidate_id in candidates:
                if candidate_id != doc_id:
                    pair = tuple(sorted([doc_id, candidate_id]))
                    if pair not in duplicate_pairs:
                        # Estimate similarity
                        similarity = minhashes[doc_id].jaccard(
                            minhashes[candidate_id]
                        )
                        duplicate_pairs.add(pair)

        results = []
        for id1, id2 in duplicate_pairs:
            similarity = minhashes[id1].jaccard(minhashes[id2])
            results.append((id1, id2, similarity))

        results.sort(key=lambda x: x[2], reverse=True)
        logger.info(
            f"Found {len(results)} near-duplicate pairs "
            f"from {len(documents)} documents"
        )
        return results


# Usage
documents = {
    "doc1": "The quick brown fox jumps over the lazy dog",
    "doc2": "The quick brown fox jumped over a lazy dog",
    "doc3": "A completely different sentence about cats",
    "doc4": "the Quick Brown Fox Jumps Over The Lazy Dog!",
}

dedup = MinHashDeduplicator(threshold=0.5, shingle_size=3)
pairs = dedup.find_duplicates(documents)
for id1, id2, sim in pairs:
    print(f"  {id1} ~ {id2}: similarity = {sim:.2%}")
```

---

## Entity Resolution

```python
# entity_resolution.py — Resolve records referring to the same entity
import pandas as pd
import numpy as np
from rapidfuzz import fuzz
from sklearn.ensemble import RandomForestClassifier
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class EntityResolver:
    """
    ML-based entity resolution.

    Steps:
    1. Generate candidate pairs (blocking)
    2. Compute similarity features per pair
    3. Train/apply classifier to predict match/non-match
    4. Cluster matched pairs into entity groups
    """

    def __init__(self, feature_columns: list[dict]):
        self.feature_columns = feature_columns
        self.model = None

    def compute_pair_features(
        self, row1: pd.Series, row2: pd.Series
    ) -> dict:
        """Compute similarity features for a pair of records."""
        features = {}

        for fc in self.feature_columns:
            col = fc["column"]
            val1 = str(row1.get(col, ""))
            val2 = str(row2.get(col, ""))

            features[f"{col}_ratio"] = fuzz.ratio(val1, val2) / 100
            features[f"{col}_partial"] = fuzz.partial_ratio(val1, val2) / 100
            features[f"{col}_token_sort"] = fuzz.token_sort_ratio(val1, val2) / 100
            features[f"{col}_token_set"] = fuzz.token_set_ratio(val1, val2) / 100
            features[f"{col}_exact"] = float(val1.lower() == val2.lower())
            features[f"{col}_len_diff"] = abs(len(val1) - len(val2))

        return features

    def train(
        self,
        labeled_pairs: pd.DataFrame,
        df: pd.DataFrame,
    ):
        """
        Train the entity resolution model on labeled pairs.

        labeled_pairs should have columns: idx1, idx2, is_match
        """
        X_rows = []
        y = []

        for _, pair in labeled_pairs.iterrows():
            row1 = df.loc[pair["idx1"]]
            row2 = df.loc[pair["idx2"]]
            features = self.compute_pair_features(row1, row2)
            X_rows.append(features)
            y.append(pair["is_match"])

        X = pd.DataFrame(X_rows)
        self.model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.model.fit(X, y)

        logger.info(
            f"Model trained on {len(X)} pairs. "
            f"Feature importances: "
            + ", ".join(
                f"{name}: {imp:.3f}"
                for name, imp in sorted(
                    zip(X.columns, self.model.feature_importances_),
                    key=lambda x: x[1],
                    reverse=True,
                )[:5]
            )
        )

    def predict_match(
        self, row1: pd.Series, row2: pd.Series
    ) -> tuple[bool, float]:
        """Predict whether two records refer to the same entity."""
        features = self.compute_pair_features(row1, row2)
        X = pd.DataFrame([features])
        probability = self.model.predict_proba(X)[0][1]
        return probability > 0.5, probability

    def resolve(
        self,
        df: pd.DataFrame,
        candidate_pairs: list[tuple[int, int]],
    ) -> dict[int, int]:
        """
        Resolve entities from candidate pairs.

        Returns: {record_idx: entity_id}
        """
        # Score all pairs
        matches = []
        for idx1, idx2 in candidate_pairs:
            is_match, probability = self.predict_match(
                df.loc[idx1], df.loc[idx2]
            )
            if is_match:
                matches.append((idx1, idx2, probability))

        # Build entity clusters using Union-Find
        parent = {}

        def find(x):
            while parent.get(x, x) != x:
                parent[x] = parent.get(parent[x], parent[x])
                x = parent[x]
            return x

        def union(x, y):
            px, py = find(x), find(y)
            if px != py:
                parent[px] = py

        for idx1, idx2, _ in matches:
            union(idx1, idx2)

        # Assign entity IDs
        entity_map = {}
        entity_counter = 0
        for idx in df.index:
            root = find(idx)
            if root not in entity_map:
                entity_map[root] = entity_counter
                entity_counter += 1
            entity_map[idx] = entity_map[root]

        logger.info(
            f"Resolved {len(df)} records into {entity_counter} entities "
            f"({len(matches)} matches)"
        )
        return entity_map
```

---

## Cross-Source Deduplication

```python
# cross_source_dedup.py — Deduplicate across multiple data sources
import pandas as pd
from rapidfuzz import fuzz
import logging

logger = logging.getLogger(__name__)


def cross_source_deduplicate(
    sources: dict[str, pd.DataFrame],
    match_columns: list[dict],
    blocking_column: str,
    threshold: float = 0.85,
) -> pd.DataFrame:
    """
    Deduplicate records across multiple data sources.

    Each source gets a _source column. Records are matched
    across sources, and the best version is kept based on
    data completeness.
    """
    # Combine all sources
    combined_dfs = []
    for source_name, df in sources.items():
        df_copy = df.copy()
        df_copy["_source"] = source_name
        df_copy["_completeness"] = df_copy.notna().sum(axis=1) / len(df_copy.columns)
        combined_dfs.append(df_copy)

    combined = pd.concat(combined_dfs, ignore_index=True)
    logger.info(
        f"Combined {len(combined)} records from {len(sources)} sources"
    )

    # Block and match across sources only
    blocks = combined.groupby(
        combined[blocking_column].str[:3].str.lower()
    ).groups

    matches = []
    for block_key, indices in blocks.items():
        block = combined.loc[indices]
        # Only compare records from different sources
        for i, idx1 in enumerate(block.index):
            for idx2 in block.index[i + 1:]:
                if block.loc[idx1, "_source"] == block.loc[idx2, "_source"]:
                    continue  # Skip same-source pairs

                score = _compute_match_score(
                    block.loc[idx1], block.loc[idx2], match_columns
                )
                if score >= threshold:
                    matches.append((idx1, idx2, score))

    # Merge: keep the most complete record
    to_remove = set()
    for idx1, idx2, score in matches:
        comp1 = combined.loc[idx1, "_completeness"]
        comp2 = combined.loc[idx2, "_completeness"]
        to_remove.add(idx1 if comp1 < comp2 else idx2)

    result = combined.drop(index=list(to_remove))
    result = result.drop(columns=["_completeness"])

    logger.info(
        f"Cross-source dedup: {len(combined)} -> {len(result)} "
        f"({len(to_remove)} duplicates removed)"
    )
    return result


def _compute_match_score(row1, row2, match_columns):
    total_weight = sum(mc["weight"] for mc in match_columns)
    score = 0
    for mc in match_columns:
        col = mc["column"]
        val1 = str(row1.get(col, ""))
        val2 = str(row2.get(col, ""))
        score += mc["weight"] * fuzz.token_sort_ratio(val1, val2) / 100
    return score / total_weight


# Usage
crm_customers = pd.DataFrame({
    "name": ["John Smith", "Jane Doe"],
    "email": ["john@example.com", "jane@example.com"],
})

billing_customers = pd.DataFrame({
    "name": ["J. Smith", "Janet Doe"],
    "email": ["john.smith@example.com", "jane.doe@example.com"],
})

unified = cross_source_deduplicate(
    sources={"crm": crm_customers, "billing": billing_customers},
    match_columns=[
        {"column": "name", "weight": 0.5},
        {"column": "email", "weight": 0.5},
    ],
    blocking_column="name",
    threshold=0.75,
)
```

---

## Quick Reference

| Method | Scale | Accuracy | Speed | Use Case |
|--------|-------|----------|-------|----------|
| `drop_duplicates()` | Any | Exact only | O(n) | Identical rows |
| Hash-based | Any | Exact only | O(n) | Large datasets, exact match |
| Brute-force fuzzy | < 10K | High | O(n^2) | Small datasets |
| Blocked fuzzy | < 1M | High | O(n * b) | Medium datasets |
| MinHash/LSH | Any | Approximate | O(n) | Text documents, large scale |
| ML entity resolution | < 1M | Highest | O(n * b * f) | Critical accuracy needs |

| Blocking Key | Reduction | Use Case |
|-------------|-----------|----------|
| First 3 chars of name | 10-100x | Name matching |
| Soundex/Metaphone | 5-50x | Phonetic name variants |
| Zip code prefix | 10-1000x | Address matching |
| Year-month | 12x | Temporal data |
| Email domain | 5-50x | Contact deduplication |

---

::: tip Key Takeaway
- Exact deduplication (`drop_duplicates`) only catches identical rows; real-world duplicates like "J. Smith" and "John Smith" require fuzzy matching.
- Blocking reduces the O(n^2) comparison problem by only comparing records within the same block (e.g., same zip code prefix), making million-row deduplication feasible.
- MinHash/LSH enables near-linear-time approximate duplicate detection for text documents, trading perfect recall for massive speed gains.
:::

::: details Exercise
**Build a Customer Deduplication Pipeline**

Given a customer DataFrame with `name`, `email`, `phone`, and `address`:
1. Remove exact duplicates by email.
2. Implement blocking on the first 3 characters of the last name.
3. Compute weighted similarity (name 40%, email 30%, phone 20%, address 10%) for each candidate pair.
4. Merge duplicate groups using connected components, keeping the most complete record.
5. Report how many duplicates were found and merged.

**Solution Sketch**

```python
from rapidfuzz import fuzz
from collections import defaultdict, deque
import pandas as pd

def deduplicate_customers(df, threshold=0.85):
    # Step 1: exact dedup
    df = df.drop_duplicates(subset=["email"], keep="last")

    # Step 2: blocking
    df["_block"] = df["name"].str.split().str[-1].str[:3].str.lower()
    blocks = df.groupby("_block").apply(lambda g: g.index.tolist()).to_dict()

    # Step 3: pairwise scoring
    matches = []
    for indices in blocks.values():
        if len(indices) < 2 or len(indices) > 100:
            continue
        for i, idx1 in enumerate(indices):
            for idx2 in indices[i+1:]:
                score = (0.4 * fuzz.token_sort_ratio(str(df.loc[idx1,"name"]), str(df.loc[idx2,"name"])) +
                         0.3 * fuzz.ratio(str(df.loc[idx1,"email"]), str(df.loc[idx2,"email"])) +
                         0.2 * fuzz.ratio(str(df.loc[idx1,"phone"]), str(df.loc[idx2,"phone"])) +
                         0.1 * fuzz.partial_ratio(str(df.loc[idx1,"address"]), str(df.loc[idx2,"address"]))) / 100
                if score >= threshold:
                    matches.append((idx1, idx2))

    # Step 4: connected components, keep most complete
    graph = defaultdict(set)
    for a, b in matches:
        graph[a].add(b); graph[b].add(a)
    visited, to_drop = set(), set()
    for node in graph:
        if node in visited: continue
        group, queue = [], deque([node])
        while queue:
            cur = queue.popleft()
            if cur in visited: continue
            visited.add(cur); group.append(cur)
            queue.extend(graph[cur] - visited)
        best = max(group, key=lambda i: df.loc[i].notna().sum())
        to_drop.update(set(group) - {best})

    return df.drop(index=to_drop).drop(columns=["_block"])
```
:::

::: details Debugging Scenario
**Your deduplication pipeline runs daily, but the number of "unique" customers keeps growing even though no new customers are being added. After investigation, you find that the same customer keeps getting re-added.**

Diagnose and fix it.

**Answer**

The pipeline is not **idempotent with respect to deduplication state**. Each run deduplicates within the current batch but does not check against previously deduplicated records. If the source system has duplicates across batches (e.g., a customer appears in Monday's extract and Tuesday's extract with slightly different data), each batch passes deduplication independently.

Fixes:
1. **Cross-batch deduplication**: maintain a master entity table and deduplicate new records against it, not just within the batch.
2. **Stable entity IDs**: assign a deterministic entity ID based on matching keys (e.g., hash of normalized email), so the same customer always maps to the same ID regardless of when they are processed.
3. **Upsert pattern**: use `INSERT ... ON CONFLICT (entity_id) DO UPDATE` at the destination to merge rather than append.
:::

::: warning Common Misconceptions
- **"drop_duplicates() handles deduplication."** It only catches exact row matches. Real duplicates have spelling variations, formatting differences, and missing fields.
- **"Fuzzy matching is O(n^2) and therefore impractical."** With blocking, you compare only within blocks, reducing complexity to O(n * average_block_size). Million-row deduplication takes minutes, not years.
- **"MinHash gives exact Jaccard similarity."** MinHash is an approximation. With 128 permutations, the estimate has roughly 9% standard error. Increase permutations for better accuracy at the cost of memory.
- **"ML entity resolution is always better than rule-based."** ML needs labeled training data (matched/unmatched pairs). Without it, well-tuned rule-based systems with domain-specific weights often outperform.
:::

::: details Quiz
**1. What is the difference between deduplication and entity resolution?**

> Deduplication finds duplicate records within a single dataset. Entity resolution matches records across multiple datasets (e.g., matching CRM customers with billing records) to determine which records refer to the same real-world entity.

**2. How does blocking reduce the computational cost of fuzzy deduplication?**

> Instead of comparing every pair (O(n^2)), blocking groups records by a coarse key (e.g., first 3 characters of name) and only compares records within the same block. This reduces comparisons by 10-1000x.

**3. What is MinHash, and how does it estimate Jaccard similarity?**

> MinHash creates a fixed-size signature (fingerprint) for each document by applying multiple hash functions to its shingles. The probability that two signatures agree at a position equals the Jaccard similarity of the original sets, enabling fast approximate matching.

**4. Why is connected components used to merge duplicate groups?**

> If A matches B and B matches C, then A, B, and C are all the same entity even if A and C do not directly match. Connected components in a graph of match pairs correctly identifies these transitive groups.

**5. What is a Soundex blocking key, and when is it useful?**

> Soundex maps names to a phonetic code based on consonant sounds ("Smith" and "Smyth" both map to "S530"). It is useful when name variants are phonetic (different spellings of the same pronunciation) rather than typographic.
:::

> **One-Liner Summary:** Deduplication is the spectrum from trivial `drop_duplicates()` to ML-powered entity resolution, where blocking makes fuzzy matching scalable and connected components merge transitive matches.
