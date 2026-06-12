---
title: "Mobile System Design Interview Guide"
description: "A complete framework for mobile system design interviews — the PASSPORT approach, iOS vs Android trade-offs, offline-first design, common questions like Ride Sharing and Social Feed, and evaluation criteria."
tags: [mobile, system-design, interview, architecture, ios, android, offline-first]
difficulty: "intermediate"
prerequisites: [mobile-engineering/mobile-architecture, mobile-engineering/offline-first]
lastReviewed: "2026-06-12"
---

# Mobile System Design Interview Guide

Mobile system design interviews assess whether you can design native or cross-platform applications that work reliably under real-world constraints: unreliable networks, limited battery, diverse device capabilities, and platform-specific behavior (push notifications, background processing, deep linking).

These interviews appear at senior and staff levels at companies with significant mobile footprints: Uber, Lyft, Airbnb, Instagram, Spotify, and others.

---

## Mobile vs Backend System Design

Mobile system design has unique concerns that don't appear in backend design:

| Concern | Backend | Mobile |
|---------|---------|--------|
| Network | Usually reliable, fast | Unreliable, expensive, variable speed |
| Processing power | Effectively unlimited | Constrained — battery drains |
| Storage | Effectively unlimited | Limited (user gets unhappy with 2GB app) |
| Memory | Effectively unlimited | Limited — OOM kills processes |
| Deployment | You control | App store review, user upgrade adoption |
| State | Stateless services | Persistent, must survive app restarts |
| Background work | Always on | OS heavily restricts |
| Security | Server-side enforcement | Can't trust client code |

---

## The PASSPORT Framework

**P — Platform & Requirements**  
**A — Architecture (high-level)**  
**S — State & Storage**  
**S — Sync & Networking**  
**P — Performance & Battery**  
**O — Offline Support**  
**R — Real-time Features**  
**T — Trade-offs & Edge Cases**

### P: Platform & Requirements

Before designing, clarify:

- **Platform:** iOS only? Android only? Cross-platform (React Native, Flutter)?
- **Target devices:** Minimum OS version? Low-end devices in emerging markets?
- **Network assumptions:** Optimize for poor connectivity? Offline-first?
- **Authentication:** OAuth? Biometrics? SSO?
- **Features in scope:** Core MVP vs full feature set

### A: Architecture

Mobile architecture typically follows a layered approach:

```
┌───────────────────────────────────────┐
│              UI Layer                 │
│  (ViewControllers, Composables,       │
│   React components)                   │
├───────────────────────────────────────┤
│           Presentation Layer          │
│  (ViewModels, Presenters, Reducers)   │
├───────────────────────────────────────┤
│            Domain Layer               │
│  (Use cases, Business logic)          │
├───────────────────────────────────────┤
│             Data Layer                │
│  (Repositories, API clients,          │
│   Local DB, Cache)                    │
└───────────────────────────────────────┘
```

**Common patterns:**
- **MVVM** (iOS + SwiftUI, Android + Jetpack Compose): ViewModel holds state, UI observes
- **MVI (Model-View-Intent)**: Unidirectional data flow, good for complex state
- **Redux/Flux**: Predictable state for cross-platform (React Native, Flutter)

### S: State & Storage

Decide what to persist and where:

| Data Type | Storage | Why |
|-----------|---------|-----|
| User session / auth tokens | Keychain (iOS) / EncryptedSharedPreferences (Android) | Secure storage, survives app updates |
| User preferences | SharedPreferences / UserDefaults | Small key-value pairs |
| Cached API responses | SQLite / Realm / Room | Structured, queryable |
| Media (images, audio) | FileSystem / Cache directory | Large binary data |
| Search history | SQLite | Need full-text search |
| Draft messages | SQLite | Need persistence across app restarts |

**iOS storage hierarchy:**
```
Keychain → sensitive data (tokens, passwords)
NSUserDefaults → small preferences
CoreData / SQLite → structured data
Documents directory → user-generated files (iCloud backup)
Cache directory → app-generated files (NOT backed up, can be purged by OS)
```

**Android:**
```
EncryptedSharedPreferences → sensitive data
SharedPreferences → small preferences
Room (SQLite) → structured data
Internal storage → private files
External storage → user-visible files
```

### S: Sync & Networking

**Network stack design:**

```
UI Layer
    │
ViewModel/Repository
    │
    ├─ In-memory cache (TTL-based)
    │
    ├─ Persistent cache (SQLite/Room)
    │
    └─ Network Client (Retrofit/URLSession/Dio)
           │
         API Server
```

**Caching strategy:**

```swift
// Cache-first with background refresh
func getUserProfile(userId: String) async -> User {
    // 1. Return cached data immediately (if fresh)
    if let cached = cache.get(userId), !cached.isStale {
        Task { await refreshInBackground(userId) }  // refresh silently
        return cached.value
    }
    
    // 2. Return cached data while fetching (stale-while-revalidate)
    if let stale = cache.get(userId) {
        Task { cache.set(await api.getUser(userId)) }
        return stale.value
    }
    
    // 3. No cache — network only
    let user = await api.getUser(userId)
    cache.set(userId, user, ttl: 300)  // 5 minute TTL
    return user
}
```

**Request prioritization:**
```kotlin
// Critical path (user-visible): immediate
val feedRequest = networkQueue.create(priority = HIGH)

// Background prefetch (not immediately visible): defer
val prefetchRequest = networkQueue.create(priority = LOW)

// Analytics: batch and send on WiFi
val analyticsRequest = networkQueue.create(
    priority = LOWEST,
    conditions = [NetworkCondition.WIFI]
)
```

### P: Performance & Battery

Battery is the biggest mobile-specific constraint.

**CPU:** Avoid background computation. Batch work. Use efficient algorithms.

**Network:** Network radio consumes ~30% of battery during active use. Strategies:
- Batch small requests (analytics, logging)
- Request only what you need (don't download whole user object if you need just the name)
- Use delta/diff responses where available
- Compression (gzip for JSON, WebP for images)
- Send analytics on WiFi when possible

**Memory:** 
- Prefetch images but limit cache size
- Release images when views are recycled
- Use memory-mapped files for large datasets
- Avoid retaining references in closures (memory leaks)

**Image optimization:**
```swift
// Progressive loading: show thumbnail first, load full quality
struct FeedImage: View {
    let thumbnailURL: URL
    let fullURL: URL
    
    var body: some View {
        AsyncImage(url: thumbnailURL) { thumbnail in
            AsyncImage(url: fullURL) { full in
                full.resizable()
            } placeholder: {
                thumbnail.resizable().blur(radius: 2)  // blurred thumbnail while loading
            }
        } placeholder: {
            Color.gray.shimmer()  // shimmer placeholder
        }
    }
}
```

### O: Offline Support

**Offline-first design:** Assume the network is unavailable. Read from local cache immediately. Queue writes for later sync.

```kotlin
// Repository with offline-first pattern (Android Room + Retrofit)
class PostRepository(
    private val localDb: PostDao,
    private val api: PostApi
) {
    fun getPosts(): Flow<List<Post>> = flow {
        // 1. Emit from database immediately
        emitAll(localDb.getPosts())
        
        // 2. Fetch from network
        try {
            val networkPosts = api.getPosts()
            localDb.insertAll(networkPosts)  // updates database → Flow re-emits
        } catch (e: NetworkException) {
            // Network failed — user sees cached data
            // Error is surfaced separately
        }
    }
    
    suspend fun likePost(postId: String) {
        // Write to local DB immediately
        localDb.updateLikeCount(postId, +1)
        
        // Queue for sync when network returns
        syncQueue.enqueue(SyncOperation.LikePost(postId))
    }
}
```

**Conflict resolution:** When the user makes changes offline, and the server has different data:
- **Last-write-wins:** Simple. Offline change overwrites server. Acceptable for user preferences.
- **Server-wins:** Offline changes are discarded. For content that multiple users edit.
- **Merge:** Combine changes. Required for collaborative editing (use CRDTs).
- **Prompt user:** Show conflict, let user decide. For critical data (calendar events).

**Sync queue with exponential backoff:**
```swift
class SyncQueue {
    func sync() async {
        while let operation = queue.next() {
            var attempt = 0
            while attempt < MAX_RETRIES {
                do {
                    try await execute(operation)
                    queue.remove(operation)
                    break
                } catch NetworkError.offline {
                    return  // Don't retry — wait for network
                } catch {
                    attempt += 1
                    let delay = pow(2.0, Double(attempt))  // exponential backoff
                    await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            }
        }
    }
}
```

### R: Real-time Features

**WebSockets:** Full-duplex, best for chat, collaborative editing, real-time presence.

**Server-Sent Events (SSE):** One-direction server push, best for feed updates, notifications, live scores.

**Long polling:** HTTP fallback when WebSockets not available.

**Mobile-specific: Push Notifications (APNs/FCM)**

When the app is in background, use push notifications to wake it:

```
Server has new message → sends push notification via APNs/FCM
APNs/FCM delivers to device
Device shows notification OR wakes app (silent push)
App fetches fresh data via API
```

```swift
// iOS: background fetch triggered by silent push
func application(_ application: UIApplication, 
                 didReceiveRemoteNotification userInfo: [AnyHashable : Any],
                 fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    Task {
        let result = await messageRepository.fetchNewMessages()
        completionHandler(result.isEmpty ? .noData : .newData)
    }
}
```

### T: Trade-offs & Edge Cases

Always address these before wrapping up:

**App updates:** If you change the API, old app versions are still in the wild. Use:
- API versioning (include app version in headers)
- Force update for critical changes
- Graceful degradation for unknown fields

**Large datasets:** Paginate everything. Virtual lists for long lists. Never load 10,000 items at once.

**Low-end devices:** Reduce animation complexity. Decrease image quality. Disable features that require too much CPU/memory.

**Accessibility:** Dynamic type sizes, VoiceOver/TalkBack support, sufficient touch target sizes (44×44pt iOS, 48×48dp Android).

---

## Common Mobile System Design Questions

### Ride-Sharing App (Uber/Lyft)
Key challenges:
- Real-time location updates (WebSocket at ~1s intervals while ride is active)
- Map rendering (MapKit/Google Maps, custom overlays)
- Background location updates (CLLocationManager always authorization)
- Battery drain from GPS (reduce accuracy between rides)
- Offline resilience (driver can't accept rides if offline)

### Social Media Feed (Instagram/TikTok)
Key challenges:
- Prefetch next 3 videos while current video is playing
- Adaptive bitrate for video streaming based on network quality
- Background video download on WiFi
- Memory management (limit concurrent video buffers)

### Chat Application (WhatsApp/iMessage)
Key challenges:
- E2E encryption (Signal protocol)
- Message delivery receipts (sent → delivered → read)
- Offline message queueing — deliver when recipient comes online
- Media sending with progress and retry
- Message sync across devices

### Maps/Navigation (Google Maps)
Key challenges:
- Tile caching (download region for offline use)
- Real-time traffic overlay (WebSocket updates)
- Route calculation (client-side with A* for last-mile, server-side for full route)
- Background location for turn-by-turn navigation

---

## Interview Time Management (45 minutes)

| Phase | Time | Focus |
|-------|------|-------|
| Clarify & Scope | 5 min | Platform, offline needs, key features |
| High-level Architecture | 8 min | Layer diagram, key components |
| State & Storage | 7 min | What to persist, where, TTL |
| Networking & Sync | 8 min | Caching strategy, offline queue |
| Deep Dive (pick 1-2) | 12 min | Real-time, offline conflicts, performance |
| Trade-offs & Wrap-up | 5 min | What you'd do differently, open questions |

---

## Platform-Specific Signals

**iOS:** Mention APNS, URLSession, Combine/async-await, SwiftUI, Core Data, Keychain, DispatchQueue, NSCache

**Android:** Mention FCM, Retrofit/OkHttp, Room, WorkManager, Jetpack Compose, Coroutines/Flow, EncryptedSharedPreferences

**Cross-platform:** Mention React Native + Redux Toolkit + React Query, or Flutter + Riverpod/Bloc + SQLite. Note where you'd hit platform-specific limitations.
