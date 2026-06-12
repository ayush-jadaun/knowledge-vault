---
title: "ML System Design: Search Ranking"
description: "How to design a production search ranking system for Airbnb, DoorDash, LinkedIn, or e-commerce — query understanding, candidate retrieval, learning-to-rank, personalization, and A/B testing search."
tags: [ml-system-design, search, ranking, learning-to-rank, bm25, dense-retrieval, interview]
difficulty: "advanced"
lastReviewed: "2026-06-12"
---

# ML System Design: Search Ranking

Search ranking is the ML problem at the heart of every marketplace, job board, and e-commerce platform. The user types "cozy studio apartment in Seattle" on Airbnb, or "devops engineer" on LinkedIn, and the system must rank 100,000+ options to surface the 20 most relevant results.

Unlike recommendation (no explicit query) and unlike web search (very broad corpus), marketplace search has a crucial difference: both the **relevance** (how well the listing matches the query) and **utility** (how likely the user is to convert on this result) matter equally.

---

## Clarifying Questions

**What type of search?** 
- Structured (Airbnb: location + dates + price range)
- Unstructured text (LinkedIn: "senior devops engineer NYC")
- Mixed (Amazon: "red running shoes size 10")

**What counts as success?** Click? Booking/purchase? Message sent? Different platforms optimize for different conversion events.

**Is it personalized?** Search results for the same query should differ for different users (Airbnb should show me pet-friendly listings if I've searched for pet-friendly before).

**Inventory size?** Airbnb: ~7M listings. LinkedIn: 900M member profiles. Amazon: 350M products.

---

## High-Level Architecture

```
User query: "cozy studio Seattle Sept 15-20"
    │
    ▼
┌────────────────────────┐
│  Query Understanding   │  Parse intent, extract filters, expand query
└────────────────────────┘
    │
    ▼
┌────────────────────────┐
│  Candidate Retrieval   │  7M listings → ~50,000 available listings
│  (hard filters first)  │  Filter: location, dates, capacity
└────────────────────────┘
    │
    ▼
┌────────────────────────┐
│  L1 Ranking (fast)     │  50,000 → 5,000
│  Lightweight model     │  BM25 + simple features
└────────────────────────┘
    │
    ▼
┌────────────────────────┐
│  L2 Ranking (precise)  │  5,000 → 100 ordered results
│  Full ML ranking model │  Relevance + conversion probability + personalization
└────────────────────────┘
    │
    ▼
┌────────────────────────┐
│  Business Rules        │  Diversity, paid boosts, policy, freshness
└────────────────────────┘
    │
    ▼
    Results page (top 20 shown, paginated)
```

---

## Stage 1: Query Understanding

Before ranking, understand what the user actually wants.

### Query Parsing
Extract structured intent from free text:
```
"2 bedroom apartment Seattle under $3000"
→ property_type: apartment
→ bedrooms: 2
→ location: Seattle
→ max_price: 3000
```

Use NER (Named Entity Recognition) models trained on domain-specific data.

### Query Classification
Classify the query intent:
- **Navigational:** user wants a specific listing ("Ace Hotel Seattle")
- **Transactional:** user wants to book something ("studio Seattle weekend")
- **Informational:** user is browsing ("Seattle neighborhoods")

Different intents need different ranking strategies.

### Query Expansion
Broaden query to increase recall:
- "apartment" → also include "flat", "condo", "studio"
- "Seattle" → include listings in Bellevue, Kirkland within 15 miles
- "cozy" → match listings with "charming", "quaint", "intimate" in description

Use word2vec or fine-tuned BERT embeddings to find semantically similar terms.

---

## Stage 2: Candidate Retrieval

Two main approaches, usually combined:

### Lexical (BM25)
Traditional TF-IDF variant. Matches query terms against listing text (title, description, amenities).

```
Score = Σ IDF(term) × (TF(term) × (k1+1)) / (TF(term) + k1 × (1 - b + b × |doc|/avgdl))
```

**Advantages:** Exact keyword matching, no training data needed, fast (inverted index), interpretable.

**Disadvantages:** Vocabulary mismatch ("apartment" doesn't match "flat"), no semantic understanding, no personalization.

### Dense Retrieval (Neural)
Encode query and listings into a shared embedding space. Use ANN search.

```
Query: "cozy studio near Pike Place" → query_embedding (768-dim)
Listing: "Charming studio steps from Pike Market" → listing_embedding (768-dim)

Similarity: cosine(query_embedding, listing_embedding) = 0.92 → retrieve
```

Train with contrastive learning: clicked/booked listings are positive examples, random listings are negatives. Fine-tune pre-trained BERT (or domain-specific model) on platform data.

**Advantages:** Semantic matching (cozy ≈ charming), learns domain-specific language, no vocabulary mismatch.

**Disadvantages:** Requires training data, higher compute, embedding quality depends on training.

### Hybrid: BM25 + Dense
Most production systems use both and merge the candidate lists:
- BM25 handles exact matches (host name, specific property names)
- Dense handles semantic matches (style descriptions, neighborhood vibe)
- Union the candidate sets, deduplicate, proceed to ranking

---

## Stage 3: Ranking Features

### Relevance Features (Query-Item Match)

**Text matching:**
- BM25 score of query against title
- BM25 score against description
- Query term coverage: what fraction of query terms appear in listing?
- Dense retrieval similarity score

**Structured match:**
- Location: distance from query center, in queried neighborhood?
- Price: within queried range, distance from median price?
- Capacity: does listing fit the group size?
- Amenities: does listing have the requested amenities (pool, parking, pet-friendly)?

### Supply-Side Features (Listing Quality)

- **Conversion rate:** historical booking rate for this listing (strong signal)
- **Review score:** average rating across reviews
- **Review count:** number of reviews (social proof)
- **Response rate:** does the host respond quickly?
- **Photos:** number of photos, professional photography flag
- **Listing freshness:** when was listing last updated?
- **Acceptance rate:** does host accept most requests?
- **Superhost status:** platform's host quality signal

### Demand-Side Signals

- **Wishlist saves:** how often has this listing been saved?
- **View-to-book rate:** what fraction of people who view this listing book it?
- **Similar listing popularity:** how popular are similar listings?

### Personalization Features

- **User's past bookings:** has user booked similar price range, style, location before?
- **User's search history:** what have they searched for in this trip?
- **User's browse history:** which listings did they view without booking?
- **User segments:** budget traveler vs. luxury, solo vs. family

---

## Stage 4: Learning to Rank

### Label Construction

The challenge: what is the "correct" ranking? 

**Click labels:** Did user click on this result? Easy to collect, but clicks are biased (higher positions get more clicks regardless of quality — position bias).

**Conversion labels:** Did user book/purchase? Strong signal, but rare (conversion rate ~3%). Delayed by days.

**Explicit relevance judgments:** Human raters judge query-listing relevance. Expensive, doesn't capture user preferences.

**De-biased click models:** Use position-aware models to correct for position bias. If position 1 always gets 10x more clicks than position 5, don't use raw click counts — correct for this.

### Listwise vs. Pairwise vs. Pointwise

**Pointwise:** Score each item independently. Simple but ignores relative ordering.

**Pairwise:** For pairs of items, predict which should rank higher. **LambdaMART** is the classic — used in production at LinkedIn, Airbnb.

```
For pair (item_i, item_j):
  label = 1 if item_i was clicked/booked more than item_j
  loss = logistic loss on P(item_i ranks higher)
```

**Listwise:** Optimize the entire ranked list at once. LambdaLoss, SoftRank. Theoretically best but harder to train.

**In practice:** LambdaMART (pairwise GBDT) is the workhorse. Airbnb, Booking.com, LinkedIn all published papers using variants of LambdaMART.

### Airbnb's Ranking System (Published, 2018)

Airbnb's landmark paper on search ranking revealed their approach:
- **GBDT with 100+ features** trained with pairwise loss
- Key insight: **long-term booking rate** is a better training signal than click rate
- User and listing **embeddings from listing2vec** (word2vec on booking session sequences)
- Personalization: user's historic booking style matched against listing style

---

## Two-Objective Ranking: Relevance + Conversion

A critical distinction: relevance alone isn't enough.

A highly relevant listing that never gets booked (bad photos, poor reviews) shouldn't rank high. A listing that books well for similar queries should rank higher even with slightly lower text relevance.

```
Final score = α × relevance_score + β × predicted_conversion_rate
```

`α` and `β` are tuned via A/B test on actual booking revenue.

**The tension:** 
- Pure relevance → users see exactly what they searched for, but bad-quality listings appear
- Pure conversion rate → popular/cheap listings dominate, niche queries get generic results

---

## Handling Sparse Data

**New listings (cold start):**
- No booking history, no reviews
- Use content-based features: price relative to market, photos quality score, description length
- Exploration budget: show new listings to some users to get initial data

**Long-tail queries:**
- "2 bedroom treehouse Vermont October" — very few searches, very few historical clicks
- Generalize: use embeddings to find similar queries with more data
- Content features carry more weight when behavioral data is sparse

---

## Position Bias Correction

Users click position 1 much more than position 5, regardless of content quality. If you train on raw click data, you'll learn to rank whatever was previously ranked first higher — a self-fulfilling prophecy.

**Solution: Inverse Propensity Scoring (IPS)**

```
Unbiased click weight = click_label / P(shown_at_position_k)

P(shown_at_position_1) = 1.0  (position 1 always visible)
P(shown_at_position_5) = 0.7  (users sometimes don't scroll)
P(shown_at_position_10) = 0.3 (rarely seen)
```

Weight clicks by inverse of the probability they were seen. Positions that are rarely seen get higher weight when they do result in clicks.

Alternatively: **Randomized controlled experiments** — periodically shuffle rankings randomly to collect unbiased click data. Painful UX, but gold standard for debiasing.

---

## A/B Testing Search

Search A/B testing is harder than most A/B tests:

**Problem 1: Query distribution changes.** If Model A gets "Seattle" queries and Model B gets "NYC" queries, you can't compare them directly.

**Problem 2: Two-sided markets.** Showing listing A for a query means listing B doesn't get the booking. The "supply" side is shared.

**Solution: Interleaved testing.**
For the same query, interleave results from Model A and Model B. User can only click one result — attribution to whichever model placed that item higher. Unbiased comparison from the same user, same query.

---

## Evaluation Metrics

| Metric | Formula | Meaning |
|--------|---------|---------|
| NDCG@K | Normalized Discounted Cumulative Gain | Quality of top K ranking, rewards placing relevant items high |
| MRR | Mean Reciprocal Rank | How high does the first relevant result appear? |
| CTR@K | clicks in top K / impressions | Are users clicking results? |
| Conversion rate | bookings / searches | Did search lead to bookings? |
| Zero-result rate | searches with no results / total searches | Is retrieval too restrictive? |
| P99 latency | 99th percentile query time | Is search fast enough? |
