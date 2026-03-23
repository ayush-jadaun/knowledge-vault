<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

const section = computed(() => {
  const path = route.path.replace(/\.html$/, '')
  const segments = path.split('/').filter(Boolean)

  // Only show on deeply nested pages (at least 2 levels deep in a section)
  if (segments.length < 2) return null

  // Don't show on section index pages
  const last = segments[segments.length - 1]
  if (last === 'index' || last === '') return null

  // Build section index path
  const sectionSegment = segments[0]
  const sectionPath = '/' + sectionSegment + '/'
  const sectionName = sectionSegment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  // Don't show if we're already one level below section root
  // (BackToSection handles that) — only show for truly deep pages
  if (segments.length < 3) return null

  return { path: sectionPath, name: sectionName }
})
</script>

<template>
  <a v-if="section" :href="section.path" class="start-from-beginning">
    &#8592; Start from beginning of {{ section.name }}
  </a>
</template>

<style scoped>
.start-from-beginning {
  display: inline-block;
  font-size: 11px;
  color: var(--vp-c-text-3);
  text-decoration: none;
  padding: 2px 0;
  margin-bottom: 4px;
  opacity: 0.7;
  transition: opacity 0.15s, color 0.15s;
}

.start-from-beginning:hover {
  opacity: 1;
  color: var(--vp-c-brand-1);
}
</style>
