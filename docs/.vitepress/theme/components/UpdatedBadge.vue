<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { frontmatter } = useData()

const isRecentlyUpdated = computed(() => {
  const lastReviewed = frontmatter.value.lastReviewed
  if (!lastReviewed) return false

  try {
    const reviewDate = new Date(lastReviewed)
    const now = new Date()
    const diffMs = now.getTime() - reviewDate.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return diffDays >= 0 && diffDays <= 7
  } catch {
    return false
  }
})
</script>

<template>
  <span v-if="isRecentlyUpdated" class="updated-badge">Updated</span>
</template>
