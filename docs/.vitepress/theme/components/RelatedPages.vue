<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import tagData from '../data/tags.json'

const { frontmatter, page } = useData()

// Build path → page info map for descriptions
const pageInfoMap = new Map<string, { description: string }>()
for (const p of (tagData as any).pages) {
  if (p.path) {
    pageInfoMap.set(p.path, { description: p.description || '' })
  }
}

const relatedPages = computed(() => {
  const currentTags: string[] = frontmatter.value.tags || []
  const currentPath = '/' + page.value.relativePath
    .replace(/\/index\.md$/, '/')
    .replace(/\.md$/, '')

  if (currentTags.length === 0) return []

  // Score pages by number of matching tags
  const scored = new Map<string, { title: string; path: string; difficulty: string; description: string; score: number; matchedTags: string[] }>()

  for (const tag of currentTags) {
    const pagesWithTag = tagData.tags[tag] || []
    for (const p of pagesWithTag) {
      if (p.path === currentPath) continue
      const existing = scored.get(p.path)
      if (existing) {
        existing.score++
        existing.matchedTags.push(tag)
      } else {
        const info = pageInfoMap.get(p.path)
        scored.set(p.path, {
          title: p.title,
          path: p.path,
          difficulty: p.difficulty,
          description: info?.description || '',
          score: 1,
          matchedTags: [tag],
        })
      }
    }
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
})

const difficultyColor = (d: string) => {
  switch (d) {
    case 'beginner': return '#42b983'
    case 'intermediate': return '#e6a23c'
    case 'advanced': return '#f56c6c'
    case 'expert': return '#9b59b6'
    default: return '#909399'
  }
}
</script>

<template>
  <div v-if="relatedPages.length > 0" class="related-pages">
    <h2>Related Pages</h2>
    <div class="related-grid">
      <a
        v-for="rp in relatedPages"
        :key="rp.path"
        :href="rp.path"
        class="related-card"
      >
        <div class="related-card-title">{{ rp.title }}</div>
        <div v-if="rp.description" class="related-card-desc">
          {{ rp.description.slice(0, 100) }}{{ rp.description.length > 100 ? '...' : '' }}
        </div>
        <div class="related-card-meta">
          <span
            v-if="rp.difficulty"
            class="difficulty-badge"
            :style="{ backgroundColor: difficultyColor(rp.difficulty) }"
          >
            {{ rp.difficulty }}
          </span>
          <span class="match-count">{{ rp.score }} matching tag{{ rp.score > 1 ? 's' : '' }}</span>
        </div>
        <div class="related-tags">
          <span v-for="tag in rp.matchedTags.slice(0, 3)" :key="tag" class="related-tag">
            {{ tag }}
          </span>
        </div>
      </a>
    </div>
  </div>
</template>

<style scoped>
.related-pages {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--vp-c-divider);
}

.related-pages h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  border: none;
  padding: 0;
  margin-top: 0;
}

.related-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.related-card {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.related-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 2px 12px rgba(95, 103, 238, 0.1);
}

.related-card-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 6px;
  color: var(--vp-c-text-1);
  line-height: 1.4;
}

.related-card-desc {
  font-size: 12px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
  margin-bottom: 8px;
  flex: 1;
}

.related-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.difficulty-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  color: #fff;
  font-weight: 500;
}

.match-count {
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.related-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.related-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

@media (max-width: 768px) {
  .related-grid {
    grid-template-columns: 1fr;
  }
}
</style>
