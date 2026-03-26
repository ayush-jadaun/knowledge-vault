---
title: "Association Rule Mining"
description: "Complete guide to association rule mining — Apriori algorithm from scratch, FP-Growth tree construction, support/confidence/lift/conviction math, and end-to-end market basket analysis on the Online Retail dataset."
tags: [machine-learning, association-rules, apriori, fp-growth, market-basket]
difficulty: intermediate
prerequisites: []
lastReviewed: "2026-03-25"
---

# Association Rule Mining

Association rule mining discovers interesting relationships between items in large transactional datasets. When Amazon says "Customers who bought X also bought Y," that recommendation comes from association rules. The technique goes far beyond retail — it is used in web usage mining, medical diagnosis (symptom co-occurrence), bioinformatics (gene co-expression), and network security (attack pattern detection).

## Core Concepts

### Transaction Database

A transaction database $\mathcal{D}$ is a set of transactions $T_1, T_2, \ldots, T_n$, where each transaction is a set of items from an itemset $\mathcal{I} = \{i_1, i_2, \ldots, i_m\}$.

| Transaction ID | Items |
|---------------|-------|
| T1 | {Bread, Milk, Eggs} |
| T2 | {Bread, Diapers, Beer, Eggs} |
| T3 | {Milk, Diapers, Beer, Cola} |
| T4 | {Bread, Milk, Diapers, Beer} |
| T5 | {Bread, Milk, Diapers, Cola} |

### Association Rule Format

A rule $X \Rightarrow Y$ means "if a transaction contains $X$, it is likely to also contain $Y$."

Example: $\{\text{Bread, Milk}\} \Rightarrow \{\text{Diapers}\}$

---

## Metrics: Support, Confidence, Lift

### Support

The fraction of transactions containing itemset $X$:

$$\text{support}(X) = \frac{|\{T \in \mathcal{D} : X \subseteq T\}|}{|\mathcal{D}|}$$

For a rule $X \Rightarrow Y$:

$$\text{support}(X \Rightarrow Y) = \text{support}(X \cup Y) = \frac{|\{T : X \cup Y \subseteq T\}|}{|\mathcal{D}|}$$

**Interpretation**: How frequently does this combination appear? Low support = rare pattern.

### Confidence

The conditional probability of $Y$ given $X$:

$$\text{confidence}(X \Rightarrow Y) = \frac{\text{support}(X \cup Y)}{\text{support}(X)} = P(Y | X)$$

**Interpretation**: When $X$ is purchased, what fraction of the time is $Y$ also purchased?

### Lift

Measures how much more likely $Y$ is purchased when $X$ is purchased, compared to $Y$'s baseline:

$$\text{lift}(X \Rightarrow Y) = \frac{\text{confidence}(X \Rightarrow Y)}{\text{support}(Y)} = \frac{P(X \cap Y)}{P(X) \cdot P(Y)}$$

| Lift | Meaning |
|------|---------|
| $> 1$ | $X$ and $Y$ appear together more than expected — **positive association** |
| $= 1$ | $X$ and $Y$ are **independent** |
| $< 1$ | $X$ and $Y$ appear together less than expected — **negative association** |

### Additional Metrics

**Conviction**:

$$\text{conviction}(X \Rightarrow Y) = \frac{1 - \text{support}(Y)}{1 - \text{confidence}(X \Rightarrow Y)}$$

High conviction means $Y$ depends strongly on $X$. If confidence = 1, conviction = $\infty$.

**Leverage**:

$$\text{leverage}(X \Rightarrow Y) = \text{support}(X \cup Y) - \text{support}(X) \cdot \text{support}(Y)$$

Measures the difference between observed and expected co-occurrence.

### Metric Calculation Example

```python
import numpy as np

# From our transaction database
transactions = [
    {'Bread', 'Milk', 'Eggs'},
    {'Bread', 'Diapers', 'Beer', 'Eggs'},
    {'Milk', 'Diapers', 'Beer', 'Cola'},
    {'Bread', 'Milk', 'Diapers', 'Beer'},
    {'Bread', 'Milk', 'Diapers', 'Cola'},
]
n = len(transactions)

def support(itemset, transactions):
    """Compute support of an itemset."""
    count = sum(1 for t in transactions if itemset.issubset(t))
    return count / len(transactions)

# Rule: {Bread, Milk} => {Diapers}
X = {'Bread', 'Milk'}
Y = {'Diapers'}
XY = X | Y

supp_X = support(X, transactions)
supp_Y = support(Y, transactions)
supp_XY = support(XY, transactions)

confidence = supp_XY / supp_X
lift = confidence / supp_Y
conviction = (1 - supp_Y) / (1 - confidence) if confidence < 1 else float('inf')
leverage = supp_XY - supp_X * supp_Y

print(f"Rule: {{Bread, Milk}} => {{Diapers}}")
print(f"  Support(X):      {supp_X:.3f}")
print(f"  Support(Y):      {supp_Y:.3f}")
print(f"  Support(X ∪ Y):  {supp_XY:.3f}")
print(f"  Confidence:      {confidence:.3f}")
print(f"  Lift:            {lift:.3f}")
print(f"  Conviction:      {conviction:.3f}")
print(f"  Leverage:        {leverage:.3f}")
```

---

## Apriori Algorithm

### The Key Insight: Downward Closure (Anti-Monotone) Property

If an itemset is infrequent, all its supersets are also infrequent. Equivalently, all subsets of a frequent itemset must be frequent. This allows **pruning** — we never need to count supersets of infrequent itemsets.

### Algorithm Steps

1. **Generate candidate 1-itemsets** ($C_1$) and count support. Keep those above `min_support` to get frequent 1-itemsets ($L_1$).
2. **Join step**: Generate candidate $(k+1)$-itemsets ($C_{k+1}$) by joining pairs of frequent $k$-itemsets that share the first $k-1$ items.
3. **Prune step**: Remove candidates with any infrequent subset (anti-monotone property).
4. **Count step**: Scan database to count support of each candidate. Keep frequent ones as $L_{k+1}$.
5. **Repeat** until no new frequent itemsets found.
6. **Generate rules** from frequent itemsets.

### Apriori From Scratch

```python
from itertools import combinations
from collections import defaultdict

class AprioriFromScratch:
    """Apriori algorithm for frequent itemset mining."""

    def __init__(self, min_support=0.3, min_confidence=0.7):
        self.min_support = min_support
        self.min_confidence = min_confidence

    def fit(self, transactions):
        """Find frequent itemsets and generate rules."""
        self.transactions = [frozenset(t) for t in transactions]
        self.n_transactions = len(self.transactions)
        self.min_count = self.min_support * self.n_transactions

        # Step 1: Frequent 1-itemsets
        item_counts = defaultdict(int)
        for t in self.transactions:
            for item in t:
                item_counts[frozenset([item])] += 1

        L1 = {
            itemset: count / self.n_transactions
            for itemset, count in item_counts.items()
            if count >= self.min_count
        }

        # Iteratively find frequent k-itemsets
        self.frequent_itemsets_ = dict(L1)
        Lk = L1
        k = 2

        while Lk:
            # Generate candidates
            candidates = self._generate_candidates(list(Lk.keys()), k)

            # Count support
            candidate_counts = defaultdict(int)
            for t in self.transactions:
                for candidate in candidates:
                    if candidate.issubset(t):
                        candidate_counts[candidate] += 1

            # Filter by min_support
            Lk = {
                itemset: count / self.n_transactions
                for itemset, count in candidate_counts.items()
                if count >= self.min_count
            }

            self.frequent_itemsets_.update(Lk)
            k += 1

        # Generate association rules
        self.rules_ = self._generate_rules()
        return self

    def _generate_candidates(self, prev_frequent, k):
        """Generate candidate k-itemsets from frequent (k-1)-itemsets."""
        candidates = set()
        prev_list = sorted([sorted(list(s)) for s in prev_frequent])

        for i in range(len(prev_list)):
            for j in range(i + 1, len(prev_list)):
                # Join: merge if first k-2 items match
                if prev_list[i][:k-2] == prev_list[j][:k-2]:
                    candidate = frozenset(prev_list[i]) | frozenset(prev_list[j])
                    if len(candidate) == k:
                        # Prune: check all (k-1) subsets are frequent
                        all_subsets_frequent = all(
                            frozenset(sub) in self.frequent_itemsets_
                            for sub in combinations(candidate, k - 1)
                        )
                        if all_subsets_frequent:
                            candidates.add(candidate)

        return candidates

    def _generate_rules(self):
        """Generate association rules from frequent itemsets."""
        rules = []
        for itemset, supp_xy in self.frequent_itemsets_.items():
            if len(itemset) < 2:
                continue

            # Generate all non-empty proper subsets as antecedents
            items = list(itemset)
            for i in range(1, len(items)):
                for antecedent in combinations(items, i):
                    antecedent = frozenset(antecedent)
                    consequent = itemset - antecedent

                    supp_x = self.frequent_itemsets_.get(antecedent, 0)
                    supp_y = self.frequent_itemsets_.get(consequent, 0)

                    if supp_x > 0:
                        confidence = supp_xy / supp_x
                        if confidence >= self.min_confidence:
                            lift = confidence / supp_y if supp_y > 0 else 0
                            rules.append({
                                'antecedent': set(antecedent),
                                'consequent': set(consequent),
                                'support': supp_xy,
                                'confidence': confidence,
                                'lift': lift,
                            })

        # Sort by lift descending
        rules.sort(key=lambda x: x['lift'], reverse=True)
        return rules

    def print_rules(self, top_n=10):
        """Pretty-print top rules."""
        print(f"\n{'Antecedent':>30} => {'Consequent':<20} "
              f"{'Support':>8} {'Confidence':>10} {'Lift':>6}")
        print("-" * 85)
        for rule in self.rules_[:top_n]:
            ant = ', '.join(sorted(rule['antecedent']))
            con = ', '.join(sorted(rule['consequent']))
            print(f"{ant:>30} => {con:<20} "
                  f"{rule['support']:8.3f} {rule['confidence']:10.3f} "
                  f"{rule['lift']:6.2f}")


# ---- Demo on grocery transactions ----
transactions = [
    {'Bread', 'Milk', 'Eggs'},
    {'Bread', 'Diapers', 'Beer', 'Eggs'},
    {'Milk', 'Diapers', 'Beer', 'Cola'},
    {'Bread', 'Milk', 'Diapers', 'Beer'},
    {'Bread', 'Milk', 'Diapers', 'Cola'},
    {'Bread', 'Milk'},
    {'Diapers', 'Beer'},
    {'Bread', 'Eggs'},
    {'Milk', 'Diapers', 'Beer', 'Bread'},
    {'Bread', 'Milk', 'Cola'},
]

apriori = AprioriFromScratch(min_support=0.3, min_confidence=0.5)
apriori.fit(transactions)
apriori.print_rules(top_n=15)
```

---

## FP-Growth Algorithm

### Why FP-Growth?

Apriori requires multiple database scans (one per $k$) and generates many candidates. FP-Growth compresses the database into an **FP-Tree** and mines patterns without candidate generation — making it much faster for large datasets.

### FP-Tree Construction

1. **First scan**: Count item frequencies. Sort items by frequency descending. Remove infrequent items.
2. **Second scan**: For each transaction (items sorted by frequency), insert into the tree. Shared prefixes are merged (increment count).

### FP-Growth Mining

1. Build a **conditional pattern base** for each item (all prefix paths ending at that item)
2. Build a **conditional FP-Tree** from the conditional pattern base
3. Recursively mine the conditional FP-Tree

```python
from collections import defaultdict, OrderedDict

class FPNode:
    """A node in the FP-Tree."""
    def __init__(self, item=None, count=0, parent=None):
        self.item = item
        self.count = count
        self.parent = parent
        self.children = {}
        self.next = None  # link to next node with same item

class FPTree:
    """FP-Tree data structure."""

    def __init__(self, transactions, min_support_count, item_order=None):
        self.root = FPNode()
        self.header_table = {}  # item -> first FPNode
        self.min_support_count = min_support_count

        if item_order is None:
            # Count frequencies
            freq = defaultdict(int)
            for trans in transactions:
                for item in trans:
                    freq[item] += 1

            # Filter by min support and sort by frequency
            self.item_order = {
                item: i for i, (item, count)
                in enumerate(sorted(freq.items(), key=lambda x: -x[1]))
                if count >= min_support_count
            }
        else:
            self.item_order = item_order

        # Insert transactions
        for trans in transactions:
            # Filter and sort items
            filtered = [item for item in trans if item in self.item_order]
            filtered.sort(key=lambda x: self.item_order[x])
            self._insert(filtered)

    def _insert(self, items):
        """Insert a sorted transaction into the tree."""
        node = self.root
        for item in items:
            if item in node.children:
                node.children[item].count += 1
            else:
                new_node = FPNode(item, 1, node)
                node.children[item] = new_node

                # Update header table
                if item in self.header_table:
                    current = self.header_table[item]
                    while current.next is not None:
                        current = current.next
                    current.next = new_node
                else:
                    self.header_table[item] = new_node

            node = node.children[item]

    def get_prefix_paths(self, item):
        """Get all prefix paths for an item."""
        paths = []
        node = self.header_table.get(item)

        while node is not None:
            path = []
            parent = node.parent
            while parent.item is not None:
                path.append(parent.item)
                parent = parent.parent
            if path:
                paths.append((path[::-1], node.count))
            node = node.next

        return paths


def fp_growth(transactions, min_support=0.3):
    """FP-Growth algorithm for frequent itemset mining."""
    n = len(transactions)
    min_count = min_support * n
    frequent_itemsets = {}

    def _mine(tree, prefix, min_count):
        # Process items in reverse frequency order (least frequent first)
        items = sorted(tree.header_table.keys(),
                       key=lambda x: tree.item_order.get(x, 0),
                       reverse=True)

        for item in items:
            # Count total support for this item
            total_count = 0
            node = tree.header_table[item]
            while node is not None:
                total_count += node.count
                node = node.next

            if total_count >= min_count:
                new_prefix = prefix + [item]
                frequent_itemsets[frozenset(new_prefix)] = total_count / n

                # Build conditional pattern base
                paths = tree.get_prefix_paths(item)
                if paths:
                    # Create conditional transactions
                    cond_transactions = []
                    for path, count in paths:
                        for _ in range(count):
                            cond_transactions.append(path)

                    if cond_transactions:
                        # Build conditional FP-Tree
                        cond_tree = FPTree(cond_transactions, min_count,
                                          tree.item_order)
                        if cond_tree.header_table:
                            _mine(cond_tree, new_prefix, min_count)

    tree = FPTree(transactions, min_count)
    _mine(tree, [], min_count)

    return frequent_itemsets


# Compare with Apriori
fp_itemsets = fp_growth(transactions, min_support=0.3)
print(f"\nFP-Growth found {len(fp_itemsets)} frequent itemsets")
for itemset, supp in sorted(fp_itemsets.items(), key=lambda x: -x[1])[:10]:
    print(f"  {set(itemset)}: support = {supp:.3f}")
```

---

## mlxtend: Production-Ready Implementation

```python
import pandas as pd
from mlxtend.frequent_patterns import apriori, fpgrowth, association_rules
from mlxtend.preprocessing import TransactionEncoder

# Encode transactions
te = TransactionEncoder()
te_array = te.fit_transform(transactions)
df = pd.DataFrame(te_array, columns=te.columns_)

print("Transaction matrix:")
print(df.astype(int).to_string())

# Frequent itemsets via Apriori
freq_apriori = apriori(df, min_support=0.3, use_colnames=True)
print(f"\nApriori: {len(freq_apriori)} frequent itemsets")

# Frequent itemsets via FP-Growth (faster)
freq_fpgrowth = fpgrowth(df, min_support=0.3, use_colnames=True)
print(f"FP-Growth: {len(freq_fpgrowth)} frequent itemsets")

# Generate rules
rules = association_rules(freq_fpgrowth, metric='lift', min_threshold=1.0)
rules = rules.sort_values('lift', ascending=False)

print(f"\nTop 10 rules by lift:")
print(rules[['antecedents', 'consequents', 'support', 'confidence',
             'lift', 'conviction']].head(10).to_string())
```

---

## End-to-End: Online Retail Dataset

The UCI Online Retail dataset contains 541,909 transactions from a UK online retailer (2010-2011).

```python
import pandas as pd
import numpy as np
from mlxtend.frequent_patterns import fpgrowth, association_rules
import matplotlib.pyplot as plt

# ---- Load data ----
# Download: https://archive.ics.uci.edu/ml/datasets/Online+Retail
df = pd.read_excel('Online Retail.xlsx')
print(f"Raw shape: {df.shape}")
print(f"Columns: {list(df.columns)}")

# ---- Clean data ----
# Remove cancellations (InvoiceNo starts with 'C')
df = df[~df['InvoiceNo'].astype(str).str.startswith('C')]

# Remove missing descriptions and customer IDs
df = df.dropna(subset=['Description', 'CustomerID'])

# Remove non-positive quantities
df = df[df['Quantity'] > 0]

# Focus on UK (largest market)
df_uk = df[df['Country'] == 'United Kingdom']
print(f"UK transactions: {df_uk.shape[0]}")
print(f"Unique invoices: {df_uk['InvoiceNo'].nunique()}")
print(f"Unique products: {df_uk['Description'].nunique()}")

# ---- Create basket matrix ----
# Each row = invoice, each column = product, values = quantity
basket = df_uk.groupby(['InvoiceNo', 'Description'])['Quantity'].sum().unstack()
basket = basket.fillna(0)

# Convert to binary (bought or not)
basket_binary = (basket > 0).astype(int)
print(f"Basket matrix shape: {basket_binary.shape}")

# ---- Filter low-frequency items ----
# Keep items appearing in at least 2% of transactions
min_item_support = 0.02
item_freq = basket_binary.mean()
frequent_items = item_freq[item_freq >= min_item_support].index
basket_filtered = basket_binary[frequent_items]
print(f"Items after filtering (>{min_item_support:.0%}): {len(frequent_items)}")

# ---- FP-Growth ----
freq_itemsets = fpgrowth(basket_filtered, min_support=0.03, use_colnames=True)
print(f"\nFrequent itemsets found: {len(freq_itemsets)}")

# ---- Generate rules ----
rules = association_rules(freq_itemsets, metric='lift', min_threshold=1.5)
rules = rules.sort_values('lift', ascending=False)

print(f"Association rules found: {len(rules)}")
print(f"\nTop 15 rules by lift:")
for _, rule in rules.head(15).iterrows():
    ant = ', '.join(sorted(rule['antecedents']))
    con = ', '.join(sorted(rule['consequents']))
    print(f"  {ant:50s} => {con:30s} "
          f"sup={rule['support']:.3f} conf={rule['confidence']:.3f} "
          f"lift={rule['lift']:.2f}")
```

### Visualizing Rules

```python
fig, axes = plt.subplots(1, 3, figsize=(18, 5))

# Support vs Confidence
scatter1 = axes[0].scatter(rules['support'], rules['confidence'],
                           c=rules['lift'], cmap='YlOrRd', s=20, alpha=0.6)
plt.colorbar(scatter1, ax=axes[0], label='Lift')
axes[0].set_xlabel('Support')
axes[0].set_ylabel('Confidence')
axes[0].set_title('Support vs Confidence (color=Lift)')

# Support vs Lift
axes[1].scatter(rules['support'], rules['lift'],
                c=rules['confidence'], cmap='viridis', s=20, alpha=0.6)
axes[1].set_xlabel('Support')
axes[1].set_ylabel('Lift')
axes[1].set_title('Support vs Lift')
axes[1].axhline(y=1, color='red', linestyle='--', alpha=0.5)

# Lift distribution
axes[2].hist(rules['lift'], bins=50, edgecolor='black', alpha=0.7)
axes[2].axvline(x=1, color='red', linestyle='--', label='Lift=1 (independent)')
axes[2].set_xlabel('Lift')
axes[2].set_ylabel('Count')
axes[2].set_title('Distribution of Lift Values')
axes[2].legend()

plt.tight_layout()
plt.savefig('association_rules_analysis.png', dpi=150, bbox_inches='tight')
plt.show()
```

### Network Graph of Strong Rules

```python
import networkx as nx

# Build graph from top rules
top_rules = rules.head(30)
G = nx.DiGraph()

for _, rule in top_rules.iterrows():
    for ant in rule['antecedents']:
        for con in rule['consequents']:
            G.add_edge(ant[:25], con[:25], weight=rule['lift'],
                      confidence=rule['confidence'])

plt.figure(figsize=(14, 10))
pos = nx.spring_layout(G, k=2, seed=42)
edge_weights = [G[u][v]['weight'] for u, v in G.edges()]

nx.draw_networkx_nodes(G, pos, node_size=800, node_color='lightblue',
                       edgecolors='black')
nx.draw_networkx_labels(G, pos, font_size=7)
nx.draw_networkx_edges(G, pos, edge_color=edge_weights, edge_cmap=plt.cm.Reds,
                       width=2, arrows=True, arrowsize=15,
                       connectionstyle='arc3,rad=0.1')

plt.title('Association Rule Network (edge color = lift)', fontsize=14)
plt.axis('off')
plt.tight_layout()
plt.savefig('rule_network.png', dpi=150, bbox_inches='tight')
plt.show()
```

---

## Apriori vs FP-Growth

| Aspect | Apriori | FP-Growth |
|--------|---------|-----------|
| **Database scans** | $k$ scans for $k$-itemsets | 2 scans total |
| **Candidate generation** | Yes — exponential candidates possible | No candidates |
| **Memory** | Low (only candidates in memory) | High (entire FP-Tree in memory) |
| **Speed** | Slow for many items / low support | 10-100x faster |
| **When to use** | Small datasets, educational | Production systems |

---

## Advanced: Sequential Pattern Mining

When transaction order matters (e.g., user browsing sessions):

```python
# Example: Web page sequences
sessions = [
    ['Home', 'Products', 'Cart', 'Checkout'],
    ['Home', 'Products', 'Product Detail', 'Cart', 'Checkout'],
    ['Home', 'Search', 'Products', 'Cart'],
    ['Home', 'Products', 'Cart', 'Checkout'],
    ['Home', 'Blog', 'Products', 'Product Detail'],
]

# Find frequent subsequences
from collections import Counter

def find_ngrams(sequence, n):
    return [tuple(sequence[i:i+n]) for i in range(len(sequence) - n + 1)]

# Count 2-grams and 3-grams
bigrams = Counter()
trigrams = Counter()
for session in sessions:
    bigrams.update(find_ngrams(session, 2))
    trigrams.update(find_ngrams(session, 3))

print("Most common page transitions (bigrams):")
for pattern, count in bigrams.most_common(5):
    print(f"  {' -> '.join(pattern)}: {count} ({count/len(sessions):.0%})")

print("\nMost common 3-step paths (trigrams):")
for pattern, count in trigrams.most_common(5):
    print(f"  {' -> '.join(pattern)}: {count} ({count/len(sessions):.0%})")
```

---

## Practical Tips

### Choosing min_support and min_confidence

| Dataset Size | Typical min_support | Rationale |
|-------------|-------------------|-----------|
| < 1,000 transactions | 0.05 - 0.10 | Small data needs lower thresholds |
| 1,000 - 100,000 | 0.01 - 0.05 | Balance between coverage and noise |
| > 100,000 | 0.001 - 0.01 | Very rare but meaningful patterns |

::: warning Common Pitfalls
1. **Trivially obvious rules**: "People who buy printers also buy ink" — filter out category-level obvious rules
2. **Simpson's paradox**: A rule may hold overall but reverse in subgroups
3. **Ignoring lift**: High confidence alone is misleading if the consequent has high support
4. **Too many rules**: Set high thresholds first, then gradually lower
5. **Spurious correlations**: More items + low support = more false patterns
:::

### Business Applications

| Application | Antecedent | Consequent | Action |
|------------|------------|------------|--------|
| **Cross-selling** | Laptop | Laptop bag | Bundle suggestion |
| **Store layout** | Bread | Butter | Place near each other |
| **Promotion** | Product A | Product B (high margin) | Discount A to drive B sales |
| **Churn prevention** | Cancelled service X | Cancel service Y | Proactive retention |
| **Medical diagnosis** | Symptoms {A, B} | Disease C | Diagnostic aid |

---

## Key Takeaways

| Concept | Remember |
|---------|----------|
| Support = frequency of itemset | Filter rare patterns |
| Confidence = conditional probability | $P(Y \mid X)$ — but can be misleading alone |
| Lift > 1 means positive association | The most useful metric for actionable rules |
| Apriori prunes via anti-monotone property | Subsets of infrequent sets are never counted |
| FP-Growth avoids candidate generation | 10-100x faster than Apriori for large data |
| Always check lift, not just confidence | High confidence + high support(Y) = meaningless rule |
| Business context matters | Not every statistically significant rule is actionable |
