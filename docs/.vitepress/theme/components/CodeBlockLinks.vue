<script setup lang="ts">
import { onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

function setupCodeBlockAnchors() {
  nextTick(() => {
    setTimeout(() => {
      const blocks = document.querySelectorAll('.vp-doc div[class*="language-"]')
      blocks.forEach((block, i) => {
        const id = `code-${i + 1}`
        if (block.getAttribute('data-code-link')) return
        block.setAttribute('data-code-link', 'true')
        block.id = id
        block.style.position = 'relative'

        const anchor = document.createElement('button')
        anchor.className = 'code-block-anchor'
        anchor.title = 'Copy link to code block'
        anchor.setAttribute('aria-label', `Copy link to code block ${i + 1}`)
        anchor.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
        anchor.addEventListener('click', (e) => {
          e.stopPropagation()
          const url = `${window.location.origin}${window.location.pathname}#${id}`
          navigator.clipboard.writeText(url)
          anchor.classList.add('copied')
          setTimeout(() => anchor.classList.remove('copied'), 1500)
        })
        block.appendChild(anchor)
      })

      // Handle hash on load
      if (window.location.hash.startsWith('#code-')) {
        const target = document.getElementById(window.location.hash.slice(1))
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 300)
  })
}

onMounted(setupCodeBlockAnchors)
watch(() => route.path, setupCodeBlockAnchors)
</script>

<template><span style="display:none" /></template>
