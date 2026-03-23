<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { page, frontmatter } = useData()

const issueUrl = computed(() => {
  const title = frontmatter.value.title || page.value.title || 'Unknown Page'
  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
  const encodedTitle = encodeURIComponent(`Inaccuracy: ${title}`)
  const encodedBody = encodeURIComponent(`Page: ${pageUrl}\n\nDescribe the issue:\n`)
  return `https://github.com/ayush-jadaun/knowledge-vault/issues/new?title=${encodedTitle}&body=${encodedBody}`
})
</script>

<template>
  <div class="report-inaccuracy">
    <a :href="issueUrl" target="_blank" rel="noopener" class="report-link">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Report inaccuracy
    </a>
  </div>
</template>

<style scoped>
.report-inaccuracy {
  margin-top: 16px;
  padding-top: 12px;
}

.report-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--vp-c-text-3);
  text-decoration: none;
  transition: color 0.15s;
  opacity: 0.7;
}

.report-link:hover {
  color: var(--vp-c-text-2);
  opacity: 1;
}
</style>
