<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'
import tagData from '../data/tags.json'

const route = useRoute()

const show = ref(false)
const x = ref(0)
const y = ref(0)
const title = ref('')
const description = ref('')
const difficulty = ref('')

// Build lookup map from tags.json
const pageMap = new Map<string, { title: string; description: string; difficulty: string }>()
for (const page of (tagData as any).pages) {
  if (page.path && page.title) {
    pageMap.set(page.path, {
      title: page.title,
      description: page.description || '',
      difficulty: page.difficulty || '',
    })
  }
}

let hideTimeout: ReturnType<typeof setTimeout> | null = null

function handleMouseOver(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest?.('.vp-doc a[href^="/"]') as HTMLAnchorElement | null
  if (!target) return

  // Skip external links and anchor links
  const href = target.getAttribute('href')
  if (!href || href.startsWith('http') || href.startsWith('#')) return

  // Normalize path
  const path = href.replace(/\.html$/, '').replace(/\/$/, '') || '/'
  const pathWithSlash = path.endsWith('/') ? path : path + '/'
  const info = pageMap.get(path) || pageMap.get(pathWithSlash)
  if (!info || !info.title) return

  if (hideTimeout) clearTimeout(hideTimeout)

  title.value = info.title
  description.value = info.description
  difficulty.value = info.difficulty

  // Position near cursor
  const rect = target.getBoundingClientRect()
  x.value = Math.min(rect.left, window.innerWidth - 340)
  y.value = rect.bottom + 8

  // Keep tooltip on screen vertically
  if (y.value > window.innerHeight - 120) {
    y.value = rect.top - 8
  }

  show.value = true
}

function handleMouseOut(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest?.('.vp-doc a[href^="/"]')
  if (!target) return
  hideTimeout = setTimeout(() => {
    show.value = false
  }, 150)
}

function setup() {
  const doc = document.querySelector('.vp-doc')
  if (!doc) return
  doc.addEventListener('mouseover', handleMouseOver)
  doc.addEventListener('mouseout', handleMouseOut)
}

function cleanup() {
  const doc = document.querySelector('.vp-doc')
  if (!doc) return
  doc.removeEventListener('mouseover', handleMouseOver)
  doc.removeEventListener('mouseout', handleMouseOut)
}

onMounted(setup)
onUnmounted(cleanup)
watch(() => route.path, () => {
  cleanup()
  setTimeout(setup, 200)
})
</script>

<template>
  <Transition name="link-preview-fade">
    <div
      v-if="show"
      class="link-preview-tooltip"
      :style="{ left: x + 'px', top: y + 'px' }"
      @mouseenter="hideTimeout && clearTimeout(hideTimeout)"
      @mouseleave="show = false"
    >
      <div class="link-preview-title">{{ title }}</div>
      <div v-if="description" class="link-preview-desc">{{ description.slice(0, 120) }}{{ description.length > 120 ? '...' : '' }}</div>
      <span
        v-if="difficulty"
        class="link-preview-difficulty"
        :class="difficulty"
      >{{ difficulty }}</span>
    </div>
  </Transition>
</template>

<style>
.link-preview-tooltip {
  position: fixed;
  z-index: 300;
  max-width: 320px;
  padding: 12px 14px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
}

.link-preview-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 4px;
  line-height: 1.4;
}

.link-preview-desc {
  font-size: 12px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
  margin-bottom: 6px;
}

.link-preview-difficulty {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  color: #fff;
  text-transform: capitalize;
}

.link-preview-difficulty.beginner { background: #42b983; }
.link-preview-difficulty.intermediate { background: #e6a23c; }
.link-preview-difficulty.advanced { background: #f56c6c; }
.link-preview-difficulty.expert { background: #9b59b6; }

.link-preview-fade-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.link-preview-fade-leave-active { transition: opacity 0.1s ease; }
.link-preview-fade-enter-from { opacity: 0; transform: translateY(4px); }
.link-preview-fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .link-preview-tooltip { display: none; }
}
</style>
