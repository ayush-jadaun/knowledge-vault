<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useData } from 'vitepress'

const route = useRoute()
const { theme } = useData()

interface SidebarItem {
  text?: string
  link?: string
  items?: SidebarItem[]
}

interface TimelineDot {
  title: string
  link: string
  active: boolean
}

const dots = ref<TimelineDot[]>([])

function flattenGroup(items: SidebarItem[]): { title: string; link: string }[] {
  const result: { title: string; link: string }[] = []
  for (const item of items) {
    if (item.link) result.push({ title: item.text || '', link: item.link })
    if (item.items) result.push(...flattenGroup(item.items))
  }
  return result
}

function buildDots() {
  const sidebar = theme.value.sidebar
  if (!sidebar) { dots.value = []; return }

  const currentPath = route.path.replace(/\.html$/, '').replace(/\/$/, '') || '/'

  let sidebarItems: SidebarItem[] = []
  if (Array.isArray(sidebar)) {
    sidebarItems = sidebar
  } else {
    for (const key of Object.keys(sidebar)) {
      if (currentPath.startsWith(key.replace(/\/$/, ''))) {
        sidebarItems = sidebar[key]
        break
      }
    }
  }

  if (sidebarItems.length === 0) { dots.value = []; return }

  // Find the group that contains the current page
  let currentGroup: SidebarItem[] = []
  for (const group of sidebarItems) {
    const groupPages = flattenGroup(group.items || [])
    if (group.link) groupPages.unshift({ title: group.text || '', link: group.link })
    const found = groupPages.some(p => (p.link.replace(/\/$/, '') || '/') === currentPath)
    if (found) {
      currentGroup = groupPages
      break
    }
  }

  if (currentGroup.length <= 1) { dots.value = []; return }

  dots.value = currentGroup.map(p => ({
    title: p.title,
    link: p.link,
    active: (p.link.replace(/\/$/, '') || '/') === currentPath,
  }))
}

onMounted(buildDots)
watch(() => route.path, buildDots)
</script>

<template>
  <div v-if="dots.length > 1" class="page-nav-timeline" role="navigation" aria-label="Section progress">
    <a
      v-for="(dot, i) in dots"
      :key="dot.link"
      :href="dot.link"
      :title="dot.title"
      class="timeline-dot"
      :class="{ active: dot.active, visited: dots.findIndex(d => d.active) > i }"
      :aria-current="dot.active ? 'page' : undefined"
    />
  </div>
</template>

<style scoped>
.page-nav-timeline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0 12px;
  flex-wrap: wrap;
}

.timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vp-c-divider);
  transition: background 0.2s, transform 0.15s;
  flex-shrink: 0;
}

.timeline-dot:hover {
  transform: scale(1.4);
  background: var(--vp-c-brand-2);
}

.timeline-dot.visited {
  background: var(--vp-c-brand-3);
  opacity: 0.6;
}

.timeline-dot.active {
  background: var(--vp-c-brand-1);
  opacity: 1;
  transform: scale(1.3);
}

@media (max-width: 768px) {
  .page-nav-timeline {
    gap: 5px;
  }
  .timeline-dot {
    width: 6px;
    height: 6px;
  }
}
</style>
