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

      // Add legend to sidebar (once)
      addLegend()
    }, 300)
  })
}

function addLegend() {
  const sidebar = document.querySelector('.VPSidebar .nav')
  if (!sidebar || sidebar.querySelector('.diff-legend')) return

  const legend = document.createElement('div')
  legend.className = 'diff-legend'
  legend.innerHTML = `
    <div class="diff-legend-title">Difficulty</div>
    <div class="diff-legend-items">
      <span class="diff-legend-item"><span class="diff-legend-dot" style="background:#42b983"></span>Beginner</span>
      <span class="diff-legend-item"><span class="diff-legend-dot" style="background:#e6a23c"></span>Intermediate</span>
      <span class="diff-legend-item"><span class="diff-legend-dot" style="background:#f56c6c"></span>Advanced</span>
      <span class="diff-legend-item"><span class="diff-legend-dot" style="background:#9b59b6"></span>Expert</span>
    </div>
  `
  sidebar.appendChild(legend)
}

onMounted(addBadges)
watch(() => route.path, addBadges)
</script>

<template>
  <div class="difficulty-badges-provider" />
</template>

<style>
/* Ensure dots align nicely */
.VPSidebar .text {
  display: inline-flex;
  align-items: center;
}

/* Difficulty legend at bottom of sidebar */
.diff-legend {
  padding: 12px 16px;
  margin-top: 16px;
  border-top: 1px solid var(--vp-c-divider);
}

.diff-legend-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-3);
  margin-bottom: 8px;
}

.diff-legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.diff-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--vp-c-text-2);
}

.diff-legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
</style>
