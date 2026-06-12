---
title: "ML System Design: Ad Click Prediction"
description: "How to design a production ad click prediction system — feature engineering, model selection, calibration, real-time serving, and the business context that makes CTR prediction different from other ML problems."
tags: [ml-system-design, ads, ctr, click-prediction, logistic-regression, deep-learning, interview]
difficulty: "advanced"
lastReviewed: "2026-06-12"
---

# ML System Design: Ad Click Prediction

Ad click prediction (CTR prediction) is the core ML problem that funds most of the internet. Google, Meta, TikTok, and Amazon collectively generate ~$600B/year in ad revenue — almost entirely powered by ML models that predict the probability a user will click a specific ad.

The problem sounds simple: binary classification, click or no-click. The reality is a system that runs billions of inferences per day, must serve in <10ms, and directly loses real money for every 0.001 decrease in log-loss.

---

## The Business Context

Ads are sold in real-time auctions (RTB — Real-Time Bidding). When a user loads a page:

```
1. Publisher (website) sends bid request to ad exchange
2. Ad exchange broadcasts to 50+ advertisers: "User X is loading this page. What do you bid?"
3. Each advertiser predicts: P(click | user, ad, context) × bid_value = expected value
4. Highest expected value wins the auction
5. Winner's ad is shown
Total time budget: 100ms
```

**The model's job:** predict P(click) as accurately as possible. This feeds into the auction. A better model = higher revenue = more winning auctions = more money.

Advertisers pay on CPC (cost per click) — they only pay when users click. So the platform needs to accurately predict click probability to price the ad correctly.

---

## Clarifying Questions

**Platform type?** Search ads (Google) vs social feed ads (Meta, TikTok) vs display ads (programmatic banners)?

- Search ads: user intent is explicit ("buy running shoes" → high-intent click)
- Feed ads: user is browsing, no explicit intent — harder to predict

**What is a click?** Just any click? Or a "good" click (user lands on page and doesn't immediately bounce)?

**Scale?** Google processes 8.5 billion searches/day. Meta serves 10M ad impressions/second.

**What to optimize?** Just CTR? Or also conversion rate (user clicks AND buys)? Multi-objective?

---

## Features

Feature engineering is the most impactful part of CTR models. The model architecture matters less than good features.

### User Features
- Demographics: age bracket, gender (estimated), location, language
- Device: mobile/desktop, OS, browser, connection type
- Behavioral history: categories browsed, purchase history, search history
- Engagement signals: avg session duration, click rate on past ads
- Time-based: time of day, day of week, holiday proximity

### Ad Features
- Ad format: banner, video, native, carousel
- Advertiser category: finance, tech, fashion, healthcare
- Historical performance: CTR across all users, CTR in similar contexts
- Creative signals: image quality score, text sentiment
- Landing page signals: page load speed, relevance to ad text
- Bid amount (higher bids correlate with higher-quality advertisers)

### Context Features
- Publisher/placement: which website/app, which page type
- Position on page: above-fold vs below-fold
- Adjacent content: what articles/posts surround the ad
- Query (for search ads): the search terms, intent classification

### User-Ad Interaction Features (Crosses)
These are the most powerful signals — how has this specific user interacted with ads in this category before?

- User's CTR on ads in this category (last 30 days)
- User's CTR on ads from this advertiser
- User's historical interest in the advertiser's product category

---

## Model Evolution

### Logistic Regression (Baseline, still used at Meta)

```
P(click) = sigmoid(w · features)
```

Simple, fast, interpretable. With good feature engineering (manual feature crosses), LR achieves competitive performance. Meta/Facebook used LR as their primary model for years.

**Advantage:** Extremely fast to serve (matrix multiply + sigmoid). Easy to update with online learning. Easy to calibrate.

**Limitation:** Can't learn non-linear interactions automatically. Requires manual feature engineering.

### Gradient Boosted Trees (GBDT)

Add tree models on top of LR or standalone:
- XGBoost/LightGBM learns non-linear patterns automatically
- Often used as the "second stage" after feature extraction
- Very fast at serving (just tree traversal)

Facebook (2014): Used GBDT to learn feature transformations, fed outputs into LR. Combined non-linear power of trees with calibration of LR.

### Wide & Deep (Google, 2016)

```
Wide component (memorization):
  Linear model on sparse features + manual feature crosses
  → P_wide(click)

Deep component (generalization):
  DNN on dense embeddings of categorical features
  → P_deep(click)

Final: sigmoid(wide_output + deep_output)
```

**Wide** memorizes specific patterns: "user who searched 'running shoes' + ad for Nike Running = high probability." 

**Deep** generalizes: "users who like outdoor sports + ads for fitness products."

Used by Google Play for app recommendations, Google Ads.

### Deep Interest Network (DIN) — Alibaba

Key insight: user's interest in an ad depends on which past behaviors are relevant to that ad — not equally weighted across all history.

```
User history: [bought running shoes, bought laptop, bought coffee maker, ...]
Target ad: Nike running shorts

DIN: attention mechanism weights "bought running shoes" highly,
     "bought laptop" low, "bought coffee maker" very low
```

The attention weights are computed using the target ad to query the user's history. Much more effective than averaging all past behavior.

### Deep & Cross Network V2 (DCN-V2) — Google

Explicit feature crossing via a cross network, combined with DNN. Better than Wide & Deep for sparse feature interactions.

### DLRM (Deep Learning Recommendation Model) — Meta

Meta's production model (open-sourced 2019). Key characteristics:
- Embedding tables for high-cardinality categorical features (user IDs, advertiser IDs) — the dominant memory cost
- Bottom MLP for dense features
- Feature interaction layer (all-vs-all dot products)
- Top MLP for final scoring

Scale: embedding tables alone are terabytes. Require model parallelism across GPU/CPU memory.

---

## Training

### Data Collection

Every ad impression generates a training example:
```
Features: (user, ad, context at time of impression)
Label: click = 1, no-click = 0
Delay: click label available within seconds; conversion label may take days/weeks
```

**Click-through rate is typically 0.1–2%** — massive class imbalance. Solutions:
- Negative downsampling: keep 100% of clicks, sample ~1-4% of non-clicks
- Re-calibrate: if you downsample 1% of negatives, model outputs will be 100x too high — apply calibration correction

### Negative Sampling

Not all non-clicked impressions are equally negative. A user who never saw an ad can't be a negative. Carefully construct negatives:
- Random sampled non-clicked impressions
- Hard negatives: impressions where user viewed but didn't click (most useful)

### Training Frequency

**Batch training:** Retrain daily on last N days of data. Simple, stable.

**Online learning:** Continuously update model on new data stream. Critical for:
- New advertisers (no historical data)
- Breaking news / trending topics
- Day-of-week / time-of-day patterns

Most production systems use hybrid: retrain model daily + online fine-tuning throughout the day.

---

## Calibration

The raw model output P_model(click) is not always equal to the true probability. After negative downsampling, outputs need recalibration.

**Isotonic regression** or **Platt scaling** aligns model outputs to empirical click rates.

Why calibration matters: advertisers bid based on expected value = P(click) × CPC_bid. If P_model is off by 2x, bids are off by 2x, and auction prices are wrong.

```python
# Simple calibration check
# Bucket predictions into deciles, compute actual CTR in each bucket
# Should form a 45-degree line
```

---

## Serving Architecture

```
Ad request (user loads page)
    │
    ▼ (< 100ms budget)
┌─────────────────────────┐
│   Ad Retrieval          │  Candidate ads: from targeting (demographic, keyword)
│   (10-50 candidates)    │
└─────────────────────────┘
    │ (<10ms)
    ▼
┌─────────────────────────┐
│   Feature Assembly      │  User features (from cache), ad features (pre-computed),
│                         │  context features (real-time)
└─────────────────────────┘
    │ (<5ms)
    ▼
┌─────────────────────────┐
│   CTR Model Inference   │  Score all candidate ads in a batch
│                         │  GPU-accelerated serving (TF Serving, Triton)
└─────────────────────────┘
    │ (<5ms)
    ▼
┌─────────────────────────┐
│   Auction               │  rank by: P(click) × bid
│   + Business rules      │  Filter policy violations, frequency caps
└─────────────────────────┘
    │
    ▼
    Ad displayed
```

**Feature freshness vs latency tradeoff:**
- Some user features are computed offline (updated hourly/daily): stored in Redis, fetched at serving
- Real-time session features (what user did in last 5 minutes): computed in-memory during request

---

## Evaluation Metrics

| Metric | Formula | Meaning |
|--------|---------|---------|
| **Log-loss (cross-entropy)** | −(y log p + (1−y) log(1−p)) | Primary offline metric — 0.001 improvement = significant |
| AUC | Area under ROC curve | Ranking quality regardless of calibration |
| Calibration | predicted_CTR / actual_CTR per bucket | Is the model properly calibrated? |
| **Online CTR** | clicks / impressions | The business metric (A/B test) |
| RPM (Revenue per 1000) | revenue / impressions × 1000 | Actual revenue impact |

**Online experiments (A/B test) are the ground truth.** A model can improve log-loss but hurt revenue (if calibration changes and bidding behavior shifts). Always validate with online experiments.

---

## Key Challenges

**Feedback delay:** User may not click for minutes. Conversion (purchase) may not happen for days. Training labels have variable delays — careful cutoff needed to avoid future leakage.

**Distribution shift:** User behavior changes (new product launch, viral trend, holiday). Model trained on last 30 days may not reflect today. Online learning partially addresses this.

**Selection bias:** You only observe outcomes for ads that were shown (won the auction). Users who would have clicked an ad you didn't show are invisible. Your training set is biased toward ads that won auctions.

**Privacy regulations (GDPR, CCPA):** Can't use cross-site tracking. Shifts toward on-device ML (Apple's SKAdNetwork), aggregated measurement (Privacy Sandbox), contextual targeting.

**Advertiser gaming:** Some advertisers click their own ads, use bots, create misleading ads with high CTR but low satisfaction. Need fraud detection as a separate system.
