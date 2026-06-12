---
title: "ML System Design: Recommendation System"
description: "How to design a production recommendation system for Netflix, YouTube, or Amazon — candidate generation, two-tower models, ranking, cold start, and serving at scale."
tags: [ml-system-design, recommendation, collaborative-filtering, two-tower, ranking, interview]
difficulty: "advanced"
lastReviewed: "2026-06-12"
---

# ML System Design: Recommendation System

Recommendation systems are the single most impactful ML product at most consumer companies. Netflix attributes 80% of watched content to recommendations. YouTube's recommendation drives 70% of watch time. Amazon's "customers who bought this" accounts for 35% of revenue.

This page walks through designing a recommendation system end-to-end the way you'd approach it in an ML system design interview at a FAANG company.

---

## Clarifying the Problem

Before designing anything, establish scope:

**Who are we recommending to?** Logged-in users (personalized) or anonymous visitors (popularity-based)?

**What are we recommending?** Videos (YouTube), movies (Netflix), products (Amazon), posts (Instagram)?

**What is the success metric?** Click-through rate? Watch time? Revenue? Return visits? These lead to very different systems — maximizing CTR leads to clickbait; maximizing watch time leads to recommendation of longer content regardless of quality.

**What is the scale?** 100M users, 10M items, 1B interactions/day?

**Latency requirement?** Homepage load → <100ms for recommendations. Real-time feed scroll → <50ms.

---

## System Requirements

**Functional:**
- Given a user, return a ranked list of N items they haven't seen (or haven't seen recently)
- Recommendations update as the user interacts (new watch → recommendations adjust)
- New items should appear in recommendations quickly (not days later)

**Non-functional:**
- P99 latency < 100ms for recommendation serving
- 99.9% availability (homepage shows recommendations, not a blank space)
- Support 100M daily active users
- Item catalog: 10M+ items
- Fresh: recommendations should reflect activity from the last few hours

---

## High-Level Architecture

Production recommendation systems universally use a **multi-stage pipeline**. A single model over 10M items at 100ms is impossible — you use a funnel:

```
User Request
    │
    ▼
┌──────────────────────┐
│  Candidate Generation │  10M items → 1,000 candidates
│  (Recall)            │  Fast, approximate, high recall
└──────────────────────┘
    │
    ▼
┌──────────────────────┐
│  Scoring / Ranking   │  1,000 candidates → 100 ranked
│  (Precision)         │  Slow, accurate, personalized
└──────────────────────┘
    │
    ▼
┌──────────────────────┐
│  Re-ranking /        │  100 → 20-50 shown
│  Business Rules      │  Diversity, freshness, safety, ads
└──────────────────────┘
    │
    ▼
    User Sees 20 Recommendations
```

---

## Stage 1: Candidate Generation

Goal: quickly retrieve ~1,000 items from 10M+ that are plausibly relevant.

### Collaborative Filtering
"Users who liked what you liked also liked these items."

**Matrix Factorization:** Decompose the user-item interaction matrix (ratings, clicks, watches) into user embeddings and item embeddings. The dot product of a user embedding and an item embedding predicts the interaction score.

```
R ≈ U × Vᵀ
Where: R[user][item] = U[user] · V[item]
```

**Implicit feedback:** For most systems, you don't have star ratings. You have watches, clicks, time spent. Treat watch > 80% as positive, watch < 10% as negative.

**ALS (Alternating Least Squares):** Standard training for matrix factorization with implicit feedback. Fix user embeddings, optimize item embeddings. Repeat. Used by Spotify, Netflix.

### Content-Based Filtering
"You liked X, here are items similar to X."

For each item, extract features: genre, director, duration, tags. Build item-item similarity. Recommend items similar to what the user has engaged with.

Advantage: works for new items immediately (no interaction history needed). Disadvantage: doesn't discover new categories.

### Two-Tower Model (Modern Standard)
A neural network with two separate encoders — one for users, one for items — that produces embeddings in a shared space.

```
User features ──► User Tower ──► user_embedding (128-dim)
                                        │
                                        ▼ dot product
Item features ──► Item Tower ──► item_embedding (128-dim)
```

Train to maximize dot product for engaged (user, item) pairs, minimize for non-engaged pairs (sampled negatives).

After training, pre-compute item embeddings for all 10M items. At serving time, compute user embedding (fast, just a forward pass of user tower), then use **approximate nearest neighbor (ANN)** search to find the top 1,000 closest item embeddings.

**ANN libraries:** FAISS (Facebook), ScaNN (Google), Annoy (Spotify). These can search 10M vectors in <10ms.

### Multiple Candidate Sources
Production systems use several candidate generators in parallel:
- Two-tower ANN: personalized retrieval
- Trending / popular items: for cold start users
- Session-based: items similar to what user watched in this session
- Social signals: what friends watched recently
- Direct matches: items matching explicit search or category filter

Merge and deduplicate. Typically 1,000-5,000 candidates.

---

## Stage 2: Ranking Model

Goal: given 1,000 candidates, score each one accurately for the specific user.

### Features

**User features:**
- Demographics (age group, location, language)
- Historical engagement: genres watched, avg watch duration, time of day
- Recent activity: last 10 items watched (sequence features)
- Device and context: mobile vs TV, time of day

**Item features:**
- Metadata: duration, genre, release year, language
- Popularity signals: total views, trending score, CTR in similar demographics
- Quality signals: completion rate, like/dislike ratio
- Freshness: recency score

**User-item interaction features:**
- Has user watched similar items by same creator?
- Has user watched items in this genre recently?
- Time since user last engaged with this topic

### Model Architectures

**Gradient Boosted Trees (LightGBM/XGBoost):**
- Works well with tabular features
- Fast to train and serve
- Interpretable (feature importance)
- Doesn't handle sequential/embedding features natively

**Wide & Deep (Google, 2016):**
- Wide component: linear model, memorization (specific user-item feature crosses)
- Deep component: DNN, generalization (dense embeddings)
- Used by Google Play app store, YouTube circa 2016

**Deep & Cross Network (DCN-V2):**
- Explicitly models feature interactions up to arbitrary order
- Better than Wide & Deep for sparse features

**Transformer-based (YouTube, TikTok, 2022+):**
- User's watch history as a sequence → transformer → user representation
- Captures temporal patterns, long-range dependencies
- Expensive but state of the art

### Objectives / Labels

**Engagement objectives:**
- P(click) — did user click?
- P(watch_fraction > 0.8) — did user finish watching?
- P(like) — did user explicitly like?

**Multi-task learning:** Modern systems predict multiple objectives simultaneously. YouTube's 2019 system predicted both engagement (watch time) and satisfaction (like, survey response) jointly, preventing over-optimization on engagement-at-the-expense-of-quality.

```
Model output:
  - score_click
  - score_completion
  - score_like
  
Final score = w1 * score_click + w2 * score_completion + w3 * score_like
```

Weights are tuned via A/B testing.

---

## Stage 3: Re-ranking & Business Rules

Raw ranking scores aren't directly used. Additional logic applies:

**Diversity:** Don't show 10 videos from the same creator. Sliding window deduplication ensures variety.

**Freshness:** Boost recently uploaded items to surface new content. Time-decayed scoring.

**Safety / Policy:** Filter out age-restricted content, flagged content, violating content.

**Business rules:** Promote paid/sponsored content at defined positions. Ensure licensed content is region-appropriate.

**Exploration:** A small fraction of recommendations are random or novel to support exploration for the learning algorithm.

---

## Feature Pipeline

```
User interactions (clicks, watches, skips)
    │
    ▼
Stream processing (Flink/Kafka Streams)
    │
    ├── Real-time features (last 10 mins activity) → Feature store (Redis)
    │
    └── Batch features (historical patterns) → Feature store (Hive/Cassandra)
                                                   │
                                              Recommendation service reads at serving time
```

**Feature store:** Central system (Feast, Tecton, Hopsworks) that serves features to both training and serving — ensuring training-serving skew is minimized.

---

## Training Pipeline

```
Offline logs (impressions + engagement outcomes)
    │
    ▼
Training data generation (join impressions with outcomes)
    │
    ▼
Negative sampling (not every non-clicked item is negative)
    │
    ▼
Model training (TensorFlow/PyTorch, distributed on GPUs)
    │
    ▼
Offline evaluation (AUC, NDCG, precision@K)
    │
    ▼
Shadow deployment (run new model alongside old, compare)
    │
    ▼
A/B test (10% traffic → measure CTR, watch time, satisfaction)
    │
    ▼
Full rollout
```

**Training frequency:** YouTube retrains daily. TikTok retrains every few hours. Some systems use online learning (continuous updates from real-time feedback).

---

## Cold Start Problem

**New user:** No interaction history. Solutions:
- Onboarding: ask preferences explicitly
- Popularity fallback: serve trending/popular items
- Demographic-based: items popular with similar demographic

**New item:** No engagement data. Solutions:
- Content-based features: item metadata available immediately
- Exploration budget: serve to small random audience, get initial signals
- "Hot start": fast-track newly uploaded items to get initial impressions

---

## Evaluation

| Metric | What It Measures | Limitation |
|--------|-----------------|------------|
| CTR (Click-through rate) | Users click recommendations | Gameable with clickbait thumbnails |
| Watch fraction | Did user complete the content | Doesn't capture satisfaction |
| Return visit rate | Does user come back to the platform | Lagging indicator |
| Explicit satisfaction survey | User rates recommendation quality | Low response rate |
| NDCG@K | Offline ranking quality | Doesn't match online engagement |
| A/B test on watch time | True business impact | Takes 2+ weeks, expensive |

---

## Scale Considerations

| Component | Scale Decision |
|----------|---------------|
| User embeddings | 100M users × 128 dims × 4 bytes = 51GB — fits in distributed cache |
| Item embeddings | 10M items × 128 dims × 4 bytes = 5.1GB — fits in single server RAM |
| ANN index | FAISS on 10M items, sharded across 10 servers |
| Feature store reads | Redis cluster, <5ms P99 |
| Ranking model serving | GPU-accelerated TF Serving, batch multiple requests |
| Total serving latency | <100ms P99: ANN retrieval ~10ms + feature fetch ~5ms + ranking ~50ms + re-ranking ~5ms |
