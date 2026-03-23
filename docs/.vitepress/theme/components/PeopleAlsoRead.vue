<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import tagData from '../data/tags.json'

const { frontmatter, page } = useData()

const suggestions = computed(() => {
  const currentTags: string[] = frontmatter.value.tags || []
  const currentPath = '/' + page.value.relativePath
    .replace(/\/index\.md$/, '/')
    .replace(/\.md$/, '')

  if (currentTags.length === 0) return []

  const scored = new Map<string, { title: string; path: string; score: number }>()

  for (const tag of currentTags) {
    const pagesWithTag = (tagData as any).tags[tag] || []
    for (const p of pagesWithTag) {
      if (p.path === currentPath) continue
      const existing = scored.get(p.path)
      if (existing) {
        existing.score++
      } else {
        scored.set(p.path, { title: p.title, path: p.path, score: 1 })
      }
    }
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
})
</script>

<template>
  <div v-if="suggestions.length > 0" class="people-also-read">
    <span class="par-label">People also read:</span>
    <template v-for="(item, i) in suggestions" :key="item.path">
      <a :href="item.path" class="par-link">{{ item.title }}</a>
      <span v-if="i < suggestions.length - 1" class="par-sep">, </span>
    </template>
  </div>
</template>

<style scoped>
.people-also-read {
  margin-top: 20px;
  padding: 12px 0;
  font-size: 13px;
  color: var(--vp-c-text-3);
  line-height: 1.6;
}

.par-label {
  font-weight: 500;
  margin-right: 4px;
}

.par-link {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  transition: color 0.15s;
}

.par-link:hover {
  color: var(--vp-c-brand-2, #747bff);
  text-decoration: underline;
}

.par-sep {
  color: var(--vp-c-text-3);
}
</style>
