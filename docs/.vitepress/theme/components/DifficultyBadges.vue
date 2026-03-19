<script setup lang="ts">
import { onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'
import tagData from '../data/tags.json'

const route = useRoute()

const COLORS: Record<string, string> = {
  beginner: '#42b983',
  intermediate: '#e6a23c',
  advanced: '#f56c6c',
  expert: '#9b59b6',
}

// Build path → difficulty map from tags.json
const difficultyMap = new Map<string, string>()
for (const page of (tagData as any).pages) {
  if (page.difficulty) {
    difficultyMap.set(page.path, page.difficulty)
  }
}

function addBadges() {
  nextTick(() => {
    setTimeout(() => {
      const sidebarLinks = document.querySelectorAll('.VPSidebar a.link')

      sidebarLinks.forEach(link => {
        // Skip if already has a badge
        if (link.querySelector('.diff-dot')) return

        const href = link.getAttribute('href')
        if (!href) return

        // Normalize path
        const path = href.replace(/\.html$/, '')
        const difficulty = difficultyMap.get(path)
        if (!difficulty) return

        const dot = document.createElement('span')
        dot.className = 'diff-dot'
        dot.title = difficulty
        dot.style.cssText = `
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${COLORS[difficulty] || '#909399'};
          margin-left: 6px;
          flex-shrink: 0;
          vertical-align: middle;
        `

        const textEl = link.querySelector('.text') || link
        textEl.appendChild(dot)
      })
    }, 300)
  })
}

onMounted(addBadges)
watch(() => route.path, addBadges)
</script>

<template>
  <div class="difficulty-badges-provider" />
</template>

<style>
/* Legend at bottom of sidebar */
.VPSidebar::after {
  content: '';
  display: block;
  padding: 12px 16px;
  margin-top: 16px;
  border-top: 1px solid var(--vp-c-divider);
}

/* Ensure dots align nicely */
.VPSidebar .text {
  display: inline-flex;
  align-items: center;
}
</style>
