---
title: "Frontend System Design Interview Guide"
description: "A complete framework for frontend system design interviews — the RADAD approach, components to cover, common questions like News Feed, Autocomplete, and Video Player, and evaluation criteria."
tags: [frontend, system-design, interview, architecture, performance]
difficulty: "intermediate"
prerequisites: [frontend-engineering/rendering-strategies, frontend-engineering/state-management]
lastReviewed: "2026-06-12"
---

# Frontend System Design Interview Guide

Frontend system design interviews assess whether you can design scalable, performant, and maintainable client-side applications. Unlike backend system design, the focus is on component architecture, state management, performance optimization, network efficiency, and user experience under constraints.

These interviews are common at senior and staff engineer levels at companies like Meta, Google, Airbnb, Twitter, and Netflix.

---

## What Interviewers Are Evaluating

1. **Scope definition:** Can you clarify requirements and scope the problem appropriately?
2. **Component architecture:** How do you break the UI into components with clear boundaries?
3. **State management:** Where does state live? How does it flow?
4. **Data layer:** How do you fetch, cache, and sync data?
5. **Performance:** What are the bottlenecks? How do you optimize?
6. **Reliability:** How do you handle network failures, slow connections, and errors?
7. **Accessibility and UX:** Are you thinking beyond the happy path?

---

## The RADAD Framework

A structured approach to answering frontend system design questions:

**R — Requirements & Constraints**  
**A — Architecture (high-level)**  
**D — Data Model & API**  
**A — Application State**  
**D — Deep Dive (performance, edge cases)**

### R: Requirements & Constraints

Start by clarifying scope. Ask:

- **Functional:** What features are in scope? MVP vs full product?
- **Scale:** How many users? DAU? Peak concurrent users?
- **Platform:** Mobile web? Desktop? Native apps? PWA?
- **Network:** Assume fast connections or optimize for slow/offline?
- **Browser support:** Modern browsers only? IE11?

**Example for "Design a News Feed":**
- In scope: feed rendering, infinite scroll, like/comment actions
- Out of scope: post creation, messaging, notifications
- Scale: 100M DAU, 1B posts
- Platform: mobile web + desktop, responsive
- Network: optimize for 3G connections

### A: Architecture (High-Level)

Sketch the high-level component architecture. Think in layers:

```
┌─────────────────────────────────────────────────┐
│                   App Shell                      │
│  (navigation, authentication, global providers)  │
├─────────────────────────────────────────────────┤
│                  Feed Page                       │
│  ┌─────────────┐  ┌────────────────────────────┐ │
│  │ Feed List   │  │    Feed Item               │ │
│  │ (virtual    │  │  ┌──────────┐ ┌──────────┐ │ │
│  │  scroll)    │  │  │  Media   │ │ Actions  │ │ │
│  │             │  │  └──────────┘ └──────────┘ │ │
│  └─────────────┘  └────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│          Data Layer (API Client + Cache)          │
└─────────────────────────────────────────────────┘
```

Identify the key components and their responsibilities:

- **Feed Container:** Pagination, scroll position, virtual list management
- **Feed Item:** Renders a single post. Pure/memoized — only re-renders when post data changes
- **Media Component:** Lazy-loads images/videos, intersection observer
- **Actions Component:** Like, comment, share — optimistic updates
- **Data Layer:** Cache, pagination cursor, real-time updates

### D: Data Model & API

Define what data you need and how you get it:

**Feed item data model:**
```typescript
interface FeedItem {
  id: string;
  type: 'post' | 'share' | 'ad';
  author: {
    id: string;
    name: string;
    avatar_url: string;
    verified: boolean;
  };
  content: {
    text?: string;
    media?: MediaItem[];
  };
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    user_liked: boolean;
    user_saved: boolean;
  };
  created_at: string;
  rank_score?: number;  // from ML ranking
}
```

**API design:**
```
GET /feed?cursor={cursor}&limit=20
→ Returns paginated feed with cursor for next page

POST /feed/{id}/like
→ Optimistic update on client, then sync
```

**Pagination strategy:** Cursor-based (not offset — feed is sorted by ML rank, items are inserted constantly, offset would skip/duplicate).

### A: Application State

Decide what state is needed and where it lives:

| State Type | Where It Lives | Why |
|-----------|---------------|-----|
| Feed items | Global store (Redux/Zustand) | Needed by multiple components, persistent across navigation |
| Pagination cursor | Same store as feed items | Tightly coupled to feed state |
| Scroll position | URL params or local state | Survives back navigation |
| Optimistic updates | Local component state + store | Immediate feedback, reconciled after server response |
| User session | Global store + cookies | Needed everywhere |
| UI state (modal open?) | Local component state | Not shared, ephemeral |

**Optimistic updates pattern:**
```typescript
// Like a post — show immediately, sync with server
async function likePost(postId: string) {
  // 1. Update UI immediately (optimistic)
  dispatch(updatePost(postId, { user_liked: true, likes: post.likes + 1 }));
  
  try {
    // 2. Sync with server
    await api.post(`/feed/${postId}/like`);
  } catch (error) {
    // 3. Rollback on failure
    dispatch(updatePost(postId, { user_liked: false, likes: post.likes }));
    showErrorToast("Failed to like post");
  }
}
```

### D: Deep Dive — Performance

The deep dive is where you demonstrate senior thinking.

**Virtual scrolling (critical for feeds):**
```
Without virtual scroll:
- 1000 posts × ~800px each = 800,000px DOM
- All 1000 items in DOM → 50MB+ memory
- Scroll performance degrades severely

With virtual scroll:
- Only ~10-20 items in DOM at any time
- Items are recycled as you scroll
- DOM size stays constant
```

Use `react-virtual` or `react-window` for implementation. The browser viewport is the "window" — you only render what's visible plus a small buffer.

**Image lazy loading:**
```typescript
// Intersection Observer for lazy loading
const imageObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target as HTMLImageElement;
      img.src = img.dataset.src!;
      imageObserver.unobserve(img);
    }
  });
}, { rootMargin: '200px' });  // start loading 200px before visible

// Register image
<img 
  data-src="https://cdn.example.com/photo.jpg" 
  ref={el => el && imageObserver.observe(el)}
/>
```

**Feed prefetching:**
```typescript
// When user is 5 items from end, fetch next page
function useFeedPrefetch(items, cursor) {
  const { ref, inView } = useInView({ threshold: 0 });
  
  useEffect(() => {
    if (inView && cursor) {
      fetchNextPage(cursor);
    }
  }, [inView, cursor]);
  
  // Attach ref to 5th-from-last item
  const prefetchTriggerIndex = Math.max(0, items.length - 5);
  return { prefetchTriggerRef: ref, prefetchTriggerIndex };
}
```

**Network optimization:**
- Request deduplication: cache in-flight requests so two components requesting the same data don't both make network calls
- Data normalization: store entities by ID, avoid duplicate data (same user referenced by 50 posts → stored once)
- CDN for static assets, images with WebP format and responsive sizes

---

## Common Frontend System Design Questions

### News Feed (Facebook/Twitter/LinkedIn)
Key challenges: Infinite scroll with virtual rendering, real-time updates (WebSocket), optimistic likes/comments, ranking (ML output from server)

### Autocomplete / Search Bar (Google/Amazon search)
Key challenges: Debouncing (don't query on every keystroke), caching (same prefix = cached results), keyboard navigation, canceling in-flight requests when new query starts

```typescript
function useAutocomplete(query: string) {
  const [results, setResults] = useState([]);
  const abortControllerRef = useRef<AbortController>();
  
  useEffect(() => {
    if (!query) return;
    
    // Cancel previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    const timer = setTimeout(async () => {
      const data = await fetch(`/autocomplete?q=${query}`, {
        signal: abortControllerRef.current?.signal
      });
      setResults(await data.json());
    }, 200);  // 200ms debounce
    
    return () => clearTimeout(timer);
  }, [query]);
  
  return results;
}
```

### Video Player (YouTube/Netflix)
Key challenges: Adaptive bitrate streaming (HLS/DASH), buffer management, thumbnail seeking, playback state persistence, picture-in-picture

### Collaborative Editor (Google Docs)
Key challenges: Operational transformation or CRDT for concurrent edits, cursor position sync, offline editing with merge on reconnect

### E-commerce Product Listing
Key challenges: Filters + sorting without page reload, infinite scroll vs pagination trade-offs, cart state (guest vs logged-in), image optimization

---

## Performance Budget

Define constraints upfront:

| Metric | Target | Why |
|--------|--------|-----|
| Time to First Contentful Paint | < 1.5s | User sees something is happening |
| Time to Interactive | < 3.5s | User can interact with content |
| Bundle size (initial JS) | < 100KB gzipped | Parse/execute time on mobile |
| Images (per feed item) | < 50KB WebP | Bandwidth on mobile |
| API response time | < 200ms p99 | Feed feels instant |

---

## Accessibility Considerations (Show You Think About This)

- ARIA roles on custom components (`role="feed"`, `aria-label`)
- Keyboard navigation for all interactive elements
- Focus management after route changes
- Screen reader announcements for dynamic content (live regions)
- Color contrast ratios ≥ 4.5:1 for text

---

## Evaluation Rubric

| Area | Junior | Mid | Senior | Staff |
|------|--------|-----|--------|-------|
| Requirements | Basic features | Edge cases | Non-functional reqs | Product trade-offs |
| Architecture | Component tree | Clean separation | Data flow, patterns | System-level thinking |
| Performance | Awareness | Specific techniques | Metrics and trade-offs | Proactive optimization |
| State | Local state | Global store | Server state + sync | Complex offline/real-time |
| Error handling | Happy path only | Error states | Retry + recovery | Graceful degradation |

---

## Interview Time Management (45 minutes)

| Phase | Time | Content |
|-------|------|---------|
| Requirements | 5 min | Clarify scope, constraints, scale |
| High-level architecture | 10 min | Sketch component tree, identify key components |
| Data model & API | 8 min | Define interfaces, API contract |
| State management | 7 min | Where state lives, data flow |
| Deep dives | 12 min | Performance, real-time, edge cases |
| Wrap up | 3 min | Trade-offs, what you'd do next |
