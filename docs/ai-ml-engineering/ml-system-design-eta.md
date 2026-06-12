---
title: "ML System Design: ETA Prediction"
description: "How to design an ETA (Estimated Time of Arrival) prediction system like Uber or Google Maps — graph routing, real-time traffic features, gradient boosted trees vs GNNs, uncertainty quantification."
tags: [ml-system-design, eta, routing, uber, google-maps, geospatial, interview]
difficulty: "advanced"
lastReviewed: "2026-06-12"
---

# ML System Design: ETA Prediction

ETA prediction is one of the most technically challenging ML problems in production. Uber, Lyft, Google Maps, DoorDash, and Amazon Logistics all have massive ML teams dedicated to it. A 1-minute improvement in ETA accuracy at Uber scale directly impacts driver matching, surge pricing, route optimization, and — most importantly — user trust.

The problem: given an origin, destination, and current time, predict how long a trip will take.

---

## Why ETA Is Hard

**Traffic is non-stationary:** A route that takes 15 minutes at 2pm takes 45 minutes at 5pm. What matters is traffic at the time the vehicle reaches each road segment — not current traffic.

**Real-time events:** Accidents, road closures, sports events, weather — all change travel time dramatically and unpredictably.

**Multi-segment routes:** A trip from A to B may traverse 50 road segments. The error compounds. If each segment has 10% uncertainty, the total uncertainty is large.

**Sparsity:** Some routes (rural roads, unusual times) have very few historical observations.

**Two distinct problems:**
1. **Routing:** which path to take?
2. **ETA prediction on that path:** given the chosen path, how long will it take?

These are often solved separately and combined.

---

## Clarifying Questions

**What type of trip?** Driving (Uber), walking (food delivery to front door), cycling (different speeds), transit?

**What's the prediction horizon?** Immediate departure (predict right now) vs. schedule for tomorrow 5pm (need to forecast future traffic)?

**What level of accuracy?** Within 2 minutes? 5 minutes? Consumer-facing apps need tighter bounds than logistics optimization.

**What data do you have?** GPS traces from past trips? Road network graph? Historical traffic from third parties (HERE, TomTom)?

---

## Data Sources

### Road Network Graph

The foundation. A directed weighted graph:
- **Nodes:** road intersections
- **Edges:** road segments with attributes: distance, speed limit, road type (highway vs. residential), number of lanes, turn restrictions

Sources: OpenStreetMap (free, crowd-sourced), HERE Maps, Google Maps API, TomTom.

### GPS Probe Data (the most valuable)

For Uber/Lyft: every driver's GPS pings every 5 seconds = massive real-time speed observations on every road segment.

```
GPS trace: [lat, lng, timestamp, speed] every 5 seconds
Map matching: snap GPS points to road segments
Segment speed: compute speed on each segment from trace
```

Uber has millions of drivers generating constant real-time traffic observations. This is a major competitive advantage.

### Historical Traffic Patterns

For each road segment, build a historical speed profile:
```
Segment ID 12345:
  Mon 8:00am: avg 15 mph (congested)
  Mon 10:00am: avg 35 mph (moderate)
  Mon 3:00pm: avg 40 mph (free flow)
  Fri 5:00pm: avg 8 mph (very congested)
```

This captures recurring patterns (rush hour, Friday afternoon) but not real-time incidents.

### Real-Time Signals

- Weather: rain reduces speed on affected segments
- Incidents: accidents, road closures (from police feeds, user reports)
- Events: stadium events, concerts (crowd routing)
- Construction zones

---

## Two-Phase Approach: Routing + ETA

### Phase 1: Routing (Path Finding)

Find the optimal path from origin to destination.

**Dijkstra's algorithm** on the road graph with travel time as edge weight. Works but slow for large graphs.

**A\* search:** Dijkstra + heuristic (straight-line distance to destination). Much faster in practice.

**Contraction Hierarchies (CH):** Pre-process the graph to create shortcuts between important nodes. Real-time query: bidirectional search in milliseconds even on continental-scale graphs. Used by OSRM, GraphHopper, Valhalla.

**Dynamic routing:** The graph edge weights change over time with real-time traffic. Re-run routing periodically to account for traffic changes en route.

### Phase 2: ETA Prediction on Path

Given the chosen path (sequence of road segments), predict total travel time.

**Naive approach:** Sum speed-limit-based time for each segment.

**Better:** Sum historical average speed × segment length for each segment, at the expected time of traversal.

**ML approach:** Learn segment-level travel time from GPS traces, then sum.

---

## ML Model Design

### Segment-Level Speed Prediction

For each road segment, predict speed at time T:

**Features:**
- Segment attributes: road type, lanes, speed limit, slope
- Historical speed at this time (day of week + hour)
- Current real-time probe speed (from GPS)
- Weather at location
- Incident flag: is there an accident reported?
- Event flag: is there an event nearby?
- Temporal: holiday, day of week, school year vs. vacation

**Model:** Gradient boosted trees (LightGBM) per segment, or a shared model with segment ID as a feature (embedding).

For high-traffic segments: use the real-time speed directly (lots of probe data → very accurate).
For low-traffic segments: fall back to historical patterns + road type.

### End-to-End Trip ETA Model

Instead of summing segment predictions, an end-to-end model predicts trip ETA directly.

**Features:**
- Route summary: total distance, number of highway segments, number of intersections, number of turns
- Traffic state: current congestion level on route, incidents on route
- Historical: avg ETA for this origin-destination pair at this time
- Departure time features: rush hour flag, weekend, holiday
- Driver/vehicle features: estimated driver behavior, vehicle type

**Model:** Gradient Boosted Trees (XGBoost/LightGBM) — Uber published their use of this in 2018.

**Training targets:** Actual trip duration (measured post-trip from GPS traces). Labels are continuous (regression).

**Loss function:** Mean absolute error? Asymmetric loss? 

Key insight: **users prefer under-promising and over-delivering.** An ETA of 15 minutes that takes 16 minutes is worse UX than an ETA of 20 minutes that takes 16 minutes. Use asymmetric loss to bias toward slight over-estimation.

### Deep Learning Approaches

**Graph Neural Networks (GNNs):**
Model traffic as flows on a graph. Node features = road segment attributes. Edge features = flow between segments. GNN propagates information across the graph — congestion on segment A affects predicted travel time on adjacent segment B.

Useful for capturing spillover effects: a closed highway causes congestion on parallel surface streets.

**Temporal Graph Networks:**
Add temporal dimension to GNN. Each node has a time series of historical speeds. Combine graph structure with sequence modeling (LSTM or Transformer on historical traffic time series per segment).

Didi Chuxing (Chinese ride-hailing), Google Maps, and Baidu Maps have published research using GNN-based approaches.

---

## Real-Time Traffic Integration

The most critical challenge: incorporating real-time traffic quickly enough to matter.

**GPS probe aggregation pipeline:**
```
Driver GPS pings (5-sec interval)
    │
    ▼
Stream processing (Kafka + Flink)
    │ map-match GPS to road segments
    ▼
Real-time segment speed estimates (computed in ~30 seconds)
    │
    ▼
Feature store (Redis) — segment speed features, TTL 60 seconds
    │
    ▼
ETA model reads at inference time
```

**Latency to reflect real-world speed change in ETA: ~60-90 seconds.**

This is why your Uber ETA updates every minute — it's polling the feature store for fresh traffic observations.

### Incident Integration

External incident feeds (police, user reports) update a separate incident layer:
- Road segment flagged as closed → travel time set to infinity (route must go around)
- Accident on segment → speed reduced by incident severity factor

---

## ETA Under Uncertainty

A single point estimate ("15 minutes") misrepresents certainty. Better UX: provide a range.

**Quantile regression:** Instead of predicting mean ETA, predict percentiles.
- P10 (optimistic): 12 minutes
- P50 (median): 16 minutes
- P90 (conservative): 22 minutes

Show user: "13-22 minutes" — they can reason about the uncertainty.

For surge pricing, Uber needs P90 (don't want to commit a driver to a trip that takes much longer than predicted).

For trip duration guarantees (DoorDash "guaranteed by X time"), use P90 or higher.

---

## Post-Trip Learning

Every completed trip is a training example:
- Actual duration observed from GPS trace
- Compare to predicted ETA at trip start
- Update model with new (features, actual_duration) pair

**Online learning:** Fine-tune model continuously on recent trips. Captures regime changes (new construction, permanent speed limit changes, seasonal patterns).

**Calibration monitoring:** Track `actual_duration / predicted_ETA` ratio by segment, time of day, region. If ratio drifts from 1.0, retrain or apply correction factor.

---

## Scale Considerations

| Component | Scale |
|-----------|-------|
| Road graph | NYC: 300K nodes, 750K edges. US: 25M nodes, 60M edges |
| GPS pings ingested | Uber: ~1B GPS pings/day |
| Route computations | Uber: 15M trips/day = 15M+ route queries |
| Segment speed updates | Real-time: update high-traffic segments every 30s |
| Feature store | Redis: segment speed features, ~100M key-value pairs |
| Model inference | <50ms P99 per ETA query |

---

## ETA vs. Routing Optimization

ETA prediction feeds into **route optimization:**

If ETA model says route A takes 18 minutes and route B takes 16 minutes → choose B.

But routing adds complexity:
- **Multi-stop routing** (Uber POOL, DoorDash multi-order): combinatorial optimization over many possible orderings
- **Dynamic re-routing en route:** if accident occurs mid-trip, re-route and re-predict ETA
- **Fleet-level optimization:** Uber needs to assign drivers to riders such that total ETA across all matches is minimized — not just individual ETA

---

## Google Maps Approach (Published)

Google Maps (2020 paper) revealed their DeepMind-powered ETA system:
- Uses GNNs to model road network
- Segments road into "supersegments" (groups of related roads)
- GNN aggregates real-time and historical speed data across supersegment graph
- Improved ETAs by 40% on average, 50% for routes with incidents
- Deployed on all Google Maps traffic ETA since 2020
