<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute, withBase } from 'vitepress'

const route = useRoute()
const { page } = useData()

const crumbs = computed(() => {
  const path = page.value.relativePath
  if (!path || path === 'index.md') return []

  // Split path into segments, remove the file extension
  const clean = path.replace(/\.md$/, '').replace(/\/index$/, '')
  const parts = clean.split('/')

  if (parts.length === 0) return []

  const result: { text: string; link: string }[] = [
    { text: 'Home', link: '/' }
  ]

  let accumulated = ''
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i]
    accumulated += '/' + segment
    const isLast = i === parts.length - 1
    const label = segment
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

    result.push({
      text: label,
      link: isLast ? '' : withBase(accumulated + '/'),
    })
  }

  return result
})

const isHomePage = computed(() => {
  const path = page.value.relativePath
  return !path || path === 'index.md'
})
</script>

<template>
  <nav v-if="!isHomePage && crumbs.length > 1" class="breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li v-for="(crumb, i) in crumbs" :key="i">
        <a v-if="crumb.link" :href="crumb.link">{{ crumb.text }}</a>
        <span v-else class="current">{{ crumb.text }}</span>
        <span v-if="i < crumbs.length - 1" class="separator" aria-hidden="true">/</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.breadcrumbs {
  margin-bottom: 8px;
}

.breadcrumbs ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  list-style: none;
  padding: 0;
  margin: 0;
  gap: 0;
}

.breadcrumbs li {
  display: flex;
  align-items: center;
  font-size: 12px;
  line-height: 1;
  color: var(--vp-c-text-3);
}

.breadcrumbs a {
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.15s;
}

.breadcrumbs a:hover {
  color: var(--vp-c-brand-1);
}

.breadcrumbs .current {
  color: var(--vp-c-text-3);
}

.breadcrumbs .separator {
  margin: 0 6px;
  color: var(--vp-c-text-3);
  opacity: 0.5;
}
</style>
