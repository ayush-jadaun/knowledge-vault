<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { frontmatter } = useData()

const tags = computed(() => {
  const t = frontmatter.value.tags
  return Array.isArray(t) ? t : []
})
</script>

<template>
  <div v-if="tags.length > 0" class="tag-pills">
    <a
      v-for="tag in tags"
      :key="tag"
      :href="`/tags?tag=${encodeURIComponent(tag)}`"
      class="tag-pill"
    >{{ tag }}</a>
  </div>
</template>

<style scoped>
.tag-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.tag-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  text-decoration: none;
  border: 1px solid var(--vp-c-divider);
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  line-height: 1.6;
}

.tag-pill:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
</style>
