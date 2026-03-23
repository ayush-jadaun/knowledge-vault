<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

function addExportButtons() {
  setTimeout(() => {
    const diagrams = document.querySelectorAll('.mermaid')
    diagrams.forEach(container => {
      if (container.querySelector('.mermaid-export-btn')) return
      const svg = container.querySelector('svg')
      if (!svg) return

      const btn = document.createElement('button')
      btn.className = 'mermaid-export-btn'
      btn.textContent = 'Download SVG'
      btn.title = 'Download as SVG'
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const svgEl = container.querySelector('svg')
        if (!svgEl) return
        const serializer = new XMLSerializer()
        const svgStr = serializer.serializeToString(svgEl)
        const blob = new Blob([svgStr], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'diagram.svg'
        a.click()
        URL.revokeObjectURL(url)
      })

      // Wrap mermaid in a relative container if needed
      const el = container as HTMLElement
      if (getComputedStyle(el).position === 'static') {
        el.style.position = 'relative'
      }
      el.appendChild(btn)
    })
  }, 1000)
}

onMounted(addExportButtons)
watch(() => route.path, addExportButtons)
</script>

<template>
  <div class="mermaid-export-provider" />
</template>

<style>
.mermaid-export-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, border-color 0.15s, color 0.15s;
  z-index: 5;
}

.mermaid:hover .mermaid-export-btn {
  opacity: 1;
}

.mermaid-export-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
</style>
