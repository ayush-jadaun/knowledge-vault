<script setup lang="ts">
import { onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

function addAriaLabels() {
  nextTick(() => {
    setTimeout(() => {
      const diagrams = document.querySelectorAll('.mermaid')
      diagrams.forEach((el) => {
        if (el.getAttribute('aria-label')) return

        // Try to extract title from the SVG or preceding heading
        const svg = el.querySelector('svg')
        const titleEl = svg?.querySelector('title')
        let label = titleEl?.textContent?.trim() || ''

        if (!label) {
          // Check for a preceding heading
          const prev = el.previousElementSibling
          if (prev && /^H[1-6]$/.test(prev.tagName)) {
            label = prev.textContent?.trim() || ''
          }
        }

        el.setAttribute('role', 'img')
        el.setAttribute('aria-label', label || 'Architecture diagram')
      })
    }, 500)
  })
}

onMounted(addAriaLabels)
watch(() => route.path, addAriaLabels)
</script>

<template><span style="display:none" /></template>
