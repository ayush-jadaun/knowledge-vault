<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useData } from 'vitepress'

const route = useRoute()
const { theme } = useData()

interface SidebarItem {
  text?: string
  link?: string
  items?: SidebarItem[]
  collapsed?: boolean
}

const nextPage = ref<{ title: string; link: string; section: string } | null>(null)

function flattenSidebar(items: SidebarItem[], section = ''): { title: string; link: string; section: string }[] {
  const result: { title: string; link: string; section: string }[] = []
  for (const item of items) {
    const currentSection = item.text || section
    if (item.link) {
      result.push({ title: item.text || '', link: item.link, section: currentSection !== item.text ? section : '' })
    }
    if (item.items) {
      result.push(...flattenSidebar(item.items, item.text || section))
    }
  }
  return result
}

function findNext() {
  const sidebar = theme.value.sidebar
  if (!sidebar) { nextPage.value = null; return }

  const currentPath = route.path.replace(/\.html$/, '').replace(/\/$/, '') || '/'

  // Find which sidebar section we're in
  let sidebarItems: SidebarItem[] = []
  if (Array.isArray(sidebar)) {
    sidebarItems = sidebar
  } else {
    // Object sidebar: find matching key
    for (const key of Object.keys(sidebar)) {
      if (currentPath.startsWith(key.replace(/\/$/, ''))) {
        sidebarItems = sidebar[key]
        break
      }
    }
  }

  if (sidebarItems.length === 0) { nextPage.value = null; return }

  const flat = flattenSidebar(sidebarItems)
  const currentIndex = flat.findIndex(p => {
    const pPath = p.link.replace(/\/$/, '') || '/'
    return pPath === currentPath
  })

  if (currentIndex >= 0 && currentIndex < flat.length - 1) {
    const next = flat[currentIndex + 1]
    nextPage.value = { title: next.title, link: next.link, section: next.section }
  } else {
    nextPage.value = null
  }
}

onMounted(findNext)
watch(() => route.path, findNext)
</script>

<template>
  <div v-if="nextPage" class="continue-reading">
    <span class="continue-label">Continue reading</span>
    <a :href="nextPage.link" class="continue-card">
      <div class="continue-card-body">
        <span class="continue-title">{{ nextPage.title }}</span>
        <span v-if="nextPage.section" class="continue-section">{{ nextPage.section }}</span>
      </div>
      <svg class="continue-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </a>
  </div>
</template>

<style scoped>
.continue-reading {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--vp-c-divider);
}

.continue-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-3);
  margin-bottom: 10px;
}

.continue-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
}

.continue-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 2px 12px rgba(95, 103, 238, 0.1);
  transform: translateX(2px);
}

.continue-card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.continue-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.continue-section {
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.continue-arrow {
  color: var(--vp-c-text-3);
  flex-shrink: 0;
  transition: color 0.15s, transform 0.15s;
}

.continue-card:hover .continue-arrow {
  color: var(--vp-c-brand-1);
  transform: translateX(3px);
}
</style>
