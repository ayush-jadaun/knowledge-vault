<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

const parentSection = computed(() => {
  const path = route.path.replace(/\.html$/, '')
  const segments = path.split('/').filter(Boolean)

  // Only show on nested pages (not index/root pages)
  if (segments.length < 2) return null

  // If the last segment is 'index', we're on a section index page — hide
  const lastSegment = segments[segments.length - 1]
  if (lastSegment === 'index' || lastSegment === '') return null

  // Derive parent path and label
  const parentSegments = segments.slice(0, -1)
  const parentPath = '/' + parentSegments.join('/') + '/'
  const parentLabel = parentSegments[parentSegments.length - 1]
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  return { path: parentPath, label: parentLabel }
})
</script>

<template>
  <a v-if="parentSection" :href="parentSection.path" class="back-to-section">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
    {{ parentSection.label }}
  </a>
</template>

<style scoped>
.back-to-section {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-c-text-3);
  text-decoration: none;
  padding: 4px 0;
  margin-bottom: 8px;
  transition: color 0.15s;
}

.back-to-section:hover {
  color: var(--vp-c-brand-1);
}
</style>
