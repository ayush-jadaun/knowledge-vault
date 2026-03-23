<script setup lang="ts">
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const wordCount = ref(0)
const readingTime = ref(0)
const codeBlockCount = ref(0)
const headingCount = ref(0)

const hasStats = computed(() => wordCount.value > 0)

// Skip utility pages
const isContentPage = computed(() => {
  const path = route.path.replace(/\.html$/, '')
  const skipPages = ['/', '/tags', '/graph', '/compare', '/bookmarks', '/changelog', '/technology-radar', '/start-here', '/verify', '/glossary', '/404']
  return !skipPages.includes(path)
})

function computeStats() {
  nextTick(() => {
    setTimeout(() => {
      const doc = document.querySelector('.vp-doc')
      if (!doc) return

      const text = doc.textContent || ''
      const words = text.split(/\s+/).filter(Boolean).length
      wordCount.value = words
      readingTime.value = Math.max(1, Math.ceil(words / 200))

      codeBlockCount.value = doc.querySelectorAll('div[class*="language-"]').length
      headingCount.value = doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length
    }, 200)
  })
}

onMounted(computeStats)
watch(() => route.path, computeStats)
</script>

<template>
  <div v-if="isContentPage && hasStats" class="page-stats">
    <span class="page-stat">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      {{ wordCount.toLocaleString() }} words
    </span>
    <span class="page-stat-divider"></span>
    <span class="page-stat">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      {{ readingTime }} min read
    </span>
    <span class="page-stat-divider"></span>
    <span class="page-stat">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
      {{ codeBlockCount }} code block{{ codeBlockCount !== 1 ? 's' : '' }}
    </span>
    <span class="page-stat-divider"></span>
    <span class="page-stat">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 7V4h16v3"/>
        <path d="M9 20h6"/>
        <path d="M12 4v16"/>
      </svg>
      {{ headingCount }} heading{{ headingCount !== 1 ? 's' : '' }}
    </span>
  </div>
</template>

<style scoped>
.page-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
  padding: 12px 0;
  margin-top: 32px;
  border-top: 1px solid var(--vp-c-divider);
}

.page-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--vp-c-text-3);
  padding: 0 12px;
}

.page-stat:first-child {
  padding-left: 0;
}

.page-stat svg {
  opacity: 0.5;
  flex-shrink: 0;
}

.page-stat-divider {
  width: 1px;
  height: 12px;
  background: var(--vp-c-divider);
}

@media (max-width: 640px) {
  .page-stats {
    gap: 8px;
  }
  .page-stat-divider {
    display: none;
  }
  .page-stat {
    padding: 0;
  }
}
</style>
