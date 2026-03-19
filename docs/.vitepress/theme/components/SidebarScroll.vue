<script setup lang="ts">
import { onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

function scrollSidebarToActive() {
  setTimeout(() => {
    const sidebar = document.querySelector('.VPSidebar')
    if (!sidebar) return
    const activeLink = sidebar.querySelector('a.active')
    if (!activeLink) return
    activeLink.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, 300)
}

function setupOutlineTracking() {
  // Wait for page content + outline to render
  nextTick(() => {
    setTimeout(() => {
      const docContent = document.querySelector('.vp-doc')
      if (!docContent) return

      // Get all headings with IDs in the doc content
      const headings = Array.from(docContent.querySelectorAll('h2[id], h3[id], h4[id]'))
      if (headings.length === 0) return

      // Get all outline links from the right sidebar
      const outlineContainer = document.querySelector('.VPDocAsideOutline')
      if (!outlineContainer) return

      const outlineLinks = Array.from(outlineContainer.querySelectorAll('a'))
      if (outlineLinks.length === 0) return

      function updateActiveHeading() {
        // Find the heading closest to the top of the viewport
        let activeHeading: Element | null = null
        const scrollY = window.scrollY

        for (const heading of headings) {
          const rect = heading.getBoundingClientRect()
          const headingTop = rect.top + scrollY
          // Give 100px buffer from top
          if (headingTop <= scrollY + 100) {
            activeHeading = heading
          }
        }

        // If at the very top, select first heading
        if (!activeHeading && headings.length > 0) {
          activeHeading = headings[0]
        }

        // Update outline link styles
        for (const link of outlineLinks) {
          const href = link.getAttribute('href')
          if (!href) continue
          const targetId = href.replace('#', '')

          if (activeHeading && activeHeading.id === targetId) {
            link.classList.add('outline-active')
          } else {
            link.classList.remove('outline-active')
          }
        }
      }

      // Listen to scroll
      window.addEventListener('scroll', updateActiveHeading, { passive: true })

      // Initial check
      updateActiveHeading()

      // Cleanup on route change
      const cleanup = watch(() => route.path, () => {
        window.removeEventListener('scroll', updateActiveHeading)
        cleanup()
      })
    }, 500)
  })
}

onMounted(() => {
  scrollSidebarToActive()
  setupOutlineTracking()
})

watch(() => route.path, () => {
  scrollSidebarToActive()
  setupOutlineTracking()
})
</script>

<template>
  <div class="sidebar-scroll-provider" />
</template>

<style>
/* Active outline link styling */
.VPDocAsideOutline a.outline-active {
  color: var(--vp-c-brand-1) !important;
  font-weight: 600 !important;
  transition: color 0.15s;
}

/* Dim non-active outline links slightly */
.VPDocAsideOutline a:not(.outline-active) {
  opacity: 0.7;
}

.VPDocAsideOutline a:not(.outline-active):hover {
  opacity: 1;
}
</style>
