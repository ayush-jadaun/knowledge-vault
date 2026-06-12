---
title: "ML System Design: Feed Ranking"
description: "How to design a social feed ranking system like Twitter, Instagram, or TikTok — candidate retrieval, multi-objective ranking, online learning, the creator-consumer balance problem."
tags: [ml-system-design, feed-ranking, ranking, twitter, instagram, tiktok, interview]
difficulty: "advanced"
lastReviewed: "2026-06-12"
---

# ML System Design: Feed Ranking

Feed ranking determines what ~3 billion people see every day on social media. Twitter, Instagram, Facebook, TikTok, LinkedIn — all use ML to order content. The core challenge: for a given user, at this moment, rank the most engaging/valuable content from thousands of possible posts.

This is different from recommendation systems (you're ranking within a bounded set from people the user follows, not retrieving from a global catalog) and different from search (no explicit query).

---

## Clarifying Questions

**What type of content?** Posts/tweets (Twitter/X), photos (Instagram), short video (TikTok/Reels), long-form (LinkedIn articles)?

**Is this a closed graph (people I follow) or open?** Twitter: mostly closed + "For You" open feed. TikTok: entirely open — you follow nobody initially and still get a personalized feed. Facebook: mix.

**What is the primary optimization target?** Engagement? Time spent? User wellbeing? Revenue? (These conflict. Optimizing pure engagement leads to outrage/misinformation because those drive clicks.)

**Scale?** Twitter: 350M MAU, 500M tweets/day. TikTok: 1B MAU, 34M videos/day uploaded.

---

## High-Level Architecture

```
User opens app
    │
    ▼
┌─────────────────────────────┐
│  Candidate Retrieval        │  From follows: last 1000 posts from who I follow
│                             │  Social graph traversal (graph DB)
│                             │  For "For You": ANN-based retrieval
└─────────────────────────────┘
    │ (1,000-5,000 candidates)
    ▼
┌─────────────────────────────┐
│  Light Ranking              │  Fast heuristic scoring to reduce to 500
│  (heuristic / small model)  │  Recency, basic engagement signals
└─────────────────────────────┘
    │ (500 candidates)
    ▼
┌─────────────────────────────┐
│  Heavy Ranking              │  Full ML model, all features
│  (main ranking model)       │  Predicts multiple engagement outcomes
└─────────────────────────────┘
    │ (100 scored)
    ▼
┌─────────────────────────────┐
│  Policy + Re-ranking        │  Diversity, creator fairness, safety, ads
└─────────────────────────────┘
    │
    ▼
    Feed displayed (20-50 posts initially)
```

---

## Features

### Post Features
- **Engagement velocity:** likes/shares/comments per minute since posting
- **Historical performance:** creator's avg engagement rate, post quality score
- **Content type:** video/image/text/link — different baseline CTR
- **Freshness:** exponential decay on age (3-hour-old post vs 3-day-old)
- **Media quality:** video resolution, thumbnail click rate
- **Text signals:** language, topics detected, NLP embedding

### User Features
- **Interaction history:** what did this user engage with last 24h, last 30 days
- **Topic interests:** inferred from past engagement (sports fan, tech reader)
- **Creator relationships:** who does user interact with most?
- **Negative signals:** posts user scrolled past without pausing, posts user hid, accounts muted
- **Session context:** is this user actively scrolling or just glancing? Time of day?

### User-Creator Features (the most powerful)
- How often has user liked/commented on this creator's posts historically?
- When did user last interact with this creator?
- Does user follow creator vs. this being a "For You" recommendation?

### Contextual Features
- Device type: mobile vs. desktop
- Network: WiFi vs. cellular (affects video autoplay willingness)
- Time of day: morning scroll is different from late-night doom-scroll

---

## Multi-Objective Ranking

The core problem: a single engagement metric is too easy to game and leads to harmful outcomes.

**The alignment problem in feed ranking:**
- Optimize CTR → clickbait headlines
- Optimize likes → emotionally manipulative content
- Optimize comments → outrage (controversial posts get more comments)
- Optimize shares → misinformation spreads faster

**Solution: Multi-objective ranking.**

Predict multiple outcomes simultaneously, combine with explicit weights:

```
Final score = w1 × P(like) 
            + w2 × P(comment) 
            + w3 × P(share) 
            + w4 × P(click_link)
            + w5 × P(video_completion)
            + w6 × P(long_dwell_time)
            - w7 × P(hide_post)
            - w8 × P(report_post)
            - w9 × P(unfollow_after_seeing)
```

Weights `w1..w9` are tuned via A/B testing. This is where the company's values get operationalized — increasing `w8` (report rate penalty) makes the model avoid harmful content.

**Instagram/Facebook approach (2021):** Multiple specialized models for each action type. A "value model" combines them. Meta published their approach showing this reduces "bad for society" signals.

**Twitter's open-source ranking code (2023):** Shows exactly this pattern — separate predictors for retweet, reply, positive engagement, negative engagement, combined linearly with tuned weights.

---

## Model Architecture

### For Text Feeds (Twitter/LinkedIn)

**Gradient Boosted Trees on handcrafted features:**
Classic approach. Fast, interpretable, still competitive.

**BERT/Transformer-based models:**
Encode tweet text into dense representation. User's recent tweets also encoded. Compute relevance between user's interest state and candidate post content.

### For Video Feeds (TikTok, Reels)

**Separate models per objective:**
- P(like): typically GBT or DNN on engagement features
- P(completion): special — video completion is the primary signal for TikTok
- P(share): heavier weight, strong positive signal

**Content embeddings from video:**
Video → thumbnail frame + audio → multimodal embedding → content-based matching to user interests.

TikTok's key insight: **watch time is the primary signal**, not explicit actions. If users watch 90% of a video, that's a strong positive. This makes short-form video uniquely measurable.

### Two-Tower for "For You" Page

For users who follow few people (new users, TikTok), candidate retrieval uses a two-tower model:
- User tower: encodes user history as embedding
- Video tower: encodes video content as embedding
- ANN retrieval to find matching videos globally

---

## The Creator-Consumer Balance

Feed ranking affects two parties: **consumers** (users reading the feed) and **creators** (people posting). Over-optimizing for consumer engagement can hurt creators unfairly.

**Creator fairness problem:** If the algorithm always shows posts from the 10 most engaging creators, smaller creators never break through. This concentrates power, reduces content diversity, and disincentivizes new creators from posting.

**Solutions:**
- Exploration budget: a fraction of feed positions show lower-probability-of-engagement but novel content
- Impression fairness: ensure creators with similar posting quality get similar impression share
- Diversity constraints in re-ranking: at most 2 consecutive posts from same creator

**Survivorship bias in training data:** If your model never shows new creators, it never gets labels for whether users would have engaged. You can't learn that new creators would be liked if you never show them.

---

## Online Learning

Feed engagement patterns change rapidly:
- Breaking news: a topic trends in minutes
- Time-of-day: lunch vs. evening engagement patterns differ
- Seasonal: sports playoff vs. normal day
- Viral content: a post can go from 0 to 10M impressions in hours

**Batch training** (retrain daily/weekly) misses these patterns.

**Online learning approach:**
- Stream engagement events (likes, shares, view time) through Kafka
- Continuously update model with mini-batches (every few minutes)
- "Warm start" with pre-trained model, fine-tune on recent data
- Feature importance: down-weight older engagement, up-weight recent

**Concept drift detection:** Monitor if model calibration is drifting. If predicted CTR diverges from actual CTR, trigger retraining.

---

## Cold Start

**New user:** No history. Show them:
1. Onboarding: select 5+ topics of interest
2. Popular content globally
3. Content popular with demographically similar users
4. After 50 interactions: switch to personalized model

**New post:** No engagement data. Show to:
1. A random 1% of followers for initial signal collection
2. Similar to how it performed in past for this creator
3. Content-based: find users whose past engagements suggest interest in this topic

---

## Negative Signals (Often Underweighted)

Most teams over-optimize positive signals. Negative signals are equally important:

| Negative Signal | What It Means |
|----------------|---------------|
| "See less of this" | User explicitly dislikes this content type |
| "Hide this post" | Strong negative — avoid this creator/topic |
| Fast scroll past | User wasn't interested (but noisy — could be they already saw it) |
| Unfollow after seeing | Creator's post caused unfollow — very strong negative |
| Report | Content violated user's expectations |
| App close after seeing a specific post | Very strong negative signal for that post |

**Hard negative mining:** Specifically train on cases where the model predicted high engagement but user reacted negatively. These hard negatives improve model calibration.

---

## Evaluation

**Offline metrics:**
- NDCG@K: how well does ranked list match engaged posts?
- AUC per action type (like, share, etc.)
- Calibration: predicted engagement rate vs. actual

**Online (A/B test metrics):**
- Daily active users (DAU) / Monthly active users (MAU)
- Time in app
- Engagement rate (likes/comments/shares per impression)
- Explicit satisfaction surveys ("Was your feed good today?")
- Retention: did users come back tomorrow?

**Counter-metrics (watch for regressions):**
- Report rate (did harmful content increase?)
- Unfollow rate (are users alienated by recommendations?)
- Creator churn rate (are creators abandoning the platform?)

---

## Scale

| System | Scale |
|--------|-------|
| Twitter: candidate retrieval | Social graph traversal for 350M users, ~1000 following per user |
| TikTok: video embeddings | 34M new videos/day → pre-computed embeddings stored in FAISS |
| Serving latency | <150ms for entire pipeline |
| Training data | ~10 billion engagement events/day at Meta scale |
| Model size | Embedding tables dominate: 100GB+ for user/content embeddings |
| Feature store | Redis cluster for real-time features; sub-5ms reads |
