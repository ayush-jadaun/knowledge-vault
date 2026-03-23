<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const LINE_THRESHOLD = 20

function processCodeBlocks() {
  const codeBlocks = document.querySelectorAll('.vp-doc div[class*="language-"]')

  codeBlocks.forEach((block) => {
    // Skip if already wrapped or inside a code group
    if (block.closest('.collapsible-code') || block.closest('.vp-code-group')) return

    const code = block.querySelector('code')
    if (!code) return

    const lineCount = code.textContent?.split('\n').length ?? 0
    if (lineCount <= LINE_THRESHOLD) return

    // Create wrapper
    const wrapper = document.createElement('div')
    wrapper.className = 'collapsible-code is-collapsed'

    // Create fade overlay
    const overlay = document.createElement('div')
    overlay.className = 'code-fade-overlay'

    // Create toggle button
    const toggle = document.createElement('button')
    toggle.className = 'collapsible-code-toggle'
    toggle.textContent = `Show all ${lineCount} lines`
    toggle.setAttribute('aria-expanded', 'false')

    toggle.addEventListener('click', () => {
      const isCollapsed = wrapper.classList.contains('is-collapsed')
      wrapper.classList.toggle('is-collapsed')
      toggle.textContent = isCollapsed ? 'Show less' : `Show all ${lineCount} lines`
      toggle.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false')
    })

    // Wrap the code block
    block.parentNode?.insertBefore(wrapper, block)
    wrapper.appendChild(block)
    wrapper.appendChild(overlay)
    wrapper.appendChild(toggle)
  })
}

function cleanup() {
  document.querySelectorAll('.collapsible-code').forEach((wrapper) => {
    const block = wrapper.querySelector('div[class*="language-"]')
    if (block && wrapper.parentNode) {
      wrapper.parentNode.insertBefore(block, wrapper)
      wrapper.remove()
    }
  })
}

let observer: MutationObserver | null = null

onMounted(() => {
  // Initial run with slight delay to let VitePress render
  setTimeout(processCodeBlocks, 100)

  // Re-process on route change (VitePress SPA navigation)
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList' && m.addedNodes.length > 0) {
        // Check if new content was added to the doc area
        const hasDocContent = Array.from(m.addedNodes).some(
          (n) => n instanceof HTMLElement && (n.classList?.contains('vp-doc') || n.querySelector?.('.vp-doc'))
        )
        if (hasDocContent) {
          setTimeout(processCodeBlocks, 100)
        }
      }
    }
  })

  const content = document.querySelector('.VPContent')
  if (content) {
    observer.observe(content, { childList: true, subtree: true })
  }
})

onUnmounted(() => {
  cleanup()
  observer?.disconnect()
})
</script>

<template>
  <div style="display: none" aria-hidden="true" />
</template>
