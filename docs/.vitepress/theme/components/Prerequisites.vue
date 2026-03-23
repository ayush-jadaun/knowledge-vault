<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'

const { frontmatter } = useData()
const collapsed = ref(true)

const prerequisites = computed(() => {
  const raw = frontmatter.value.prerequisites
  if (!Array.isArray(raw) || raw.length === 0) return []

  return raw.map((item: any) => {
    if (typeof item === 'string') {
      // Format: "Page Title:/path/to/page" or just "/path/to/page"
      if (item.includes(':')) {
        const [text, link] = item.split(':')
        return { text: text.trim(), link: link.trim() }
      }
      // Derive title from path
      const segments = item.replace(/\/$/, '').split('/')
      const last = segments[segments.length - 1] || segments[segments.length - 2] || item
      const title = last.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      return { text: title, link: item }
    }
    if (item && typeof item === 'object') {
      return { text: item.text || item.title || item.link, link: item.link || '#' }
    }
    return null
  }).filter(Boolean)
})
</script>

<template>
  <div v-if="prerequisites.length > 0" class="prerequisites-banner">
    <button class="prerequisites-toggle" @click="collapsed = !collapsed" :aria-expanded="!collapsed">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
      </svg>
      <span class="prerequisites-label">Prerequisites</span>
      <svg class="prerequisites-chevron" :class="{ expanded: !collapsed }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </button>
    <div v-show="!collapsed" class="prerequisites-content">
      <span class="prerequisites-text">Before reading this, check out: </span>
      <span v-for="(prereq, i) in prerequisites" :key="prereq.link">
        <a :href="prereq.link" class="prerequisites-link">{{ prereq.text }}</a><span v-if="i < prerequisites.length - 1">, </span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.prerequisites-banner {
  margin-bottom: 16px;
  border: 1px solid rgba(234, 179, 8, 0.3);
  border-left: 3px solid rgba(234, 179, 8, 0.6);
  border-radius: 6px;
  background: rgba(234, 179, 8, 0.06);
  overflow: hidden;
}

.dark .prerequisites-banner {
  background: rgba(234, 179, 8, 0.04);
  border-color: rgba(234, 179, 8, 0.2);
  border-left-color: rgba(234, 179, 8, 0.5);
}

.prerequisites-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  transition: color 0.15s;
}

.prerequisites-toggle:hover {
  color: var(--vp-c-text-1);
}

.prerequisites-toggle svg:first-child {
  color: rgba(234, 179, 8, 0.8);
  flex-shrink: 0;
}

.prerequisites-label {
  flex: 1;
  text-align: left;
}

.prerequisites-chevron {
  transition: transform 0.2s ease;
  opacity: 0.5;
}

.prerequisites-chevron.expanded {
  transform: rotate(180deg);
}

.prerequisites-content {
  padding: 0 14px 12px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

.prerequisites-link {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-weight: 500;
}

.prerequisites-link:hover {
  text-decoration: underline;
}
</style>
