<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const minutes = ref(0)

function calculateReadingTime() {
  // Wait for content to render
  nextTick(() => {
    setTimeout(() => {
      const content = document.querySelector('.vp-doc div[class*="content"]') || document.querySelector('.vp-doc')
      if (!content) return
      const text = content.textContent || ''
      const words = text.split(/\s+/).filter(Boolean).length
      minutes.value = Math.max(1, Math.ceil(words / 200))
    }, 100)
  })
}

onMounted(calculateReadingTime)
watch(() => route.path, calculateReadingTime)
</script>

<template>
  <div v-if="minutes > 0" class="reading-time">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
    <span>{{ minutes }} min read</span>
  </div>
</template>

<style scoped>
.reading-time {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--vp-c-text-3);
  padding-bottom: 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  margin-bottom: 24px;
}

.reading-time svg {
  opacity: 0.5;
}
</style>
