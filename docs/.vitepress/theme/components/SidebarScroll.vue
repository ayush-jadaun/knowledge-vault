<script setup lang="ts">
import { onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
let scrollHandler: (() => void) | null = null

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
  // Remove old handler
  if (scrollHandler) {
    window.removeEventListener('scroll', scrollHandler)
    scrollHandler = null
  }

  nextTick(() => {
    setTimeout(() => {
      // Get headings from content
      const headings = Array.from(
        document.querySelectorAll('.vp-doc :is(h2, h3, h4)[id]')
      ) as HTMLElement[]

      if (headings.length === 0) return

      // Find outline links - try multiple selectors for different VitePress versions
      const outlineLinks = Array.from(
        document.querySelectorAll(
          '.VPDocAsideOutline a, .aside-outline a, [class*="outline"] a[href^="#"]'
        )
      ) as HTMLAnchorElement[]

      if (outlineLinks.length === 0) return

      scrollHandler = () => {
        // Find the heading closest to top of viewport
        let activeId = ''
        const scrollTop = window.scrollY

        for (const heading of headings) {
          const top = heading.offsetTop
          if (top <= scrollTop + 120) {
            activeId = heading.id
          }
        }

        // If at very top, no active
        if (scrollTop < 100) activeId = headings[0]?.id || ''

        // Update all outline links
        for (const link of outlineLinks) {
          const href = link.getAttribute('href') || ''
          const id = href.replace('#', '')

          if (id === activeId) {
            link.classList.add('active')
            link.style.color = 'var(--vp-c-brand-1)'
            link.style.fontWeight = '600'
            link.style.opacity = '1'
            // Scroll the outline to keep active link visible
            link.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          } else {
            link.classList.remove('active')
            link.style.color = ''
            link.style.fontWeight = ''
            link.style.opacity = '0.7'
          }
        }
      }

      window.addEventListener('scroll', scrollHandler, { passive: true })
      // Initial call
      scrollHandler()
    }, 800)
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

onUnmounted(() => {
  if (scrollHandler) window.removeEventListener('scroll', scrollHandler)
})
</script>

<template>
  <div class="sidebar-scroll-provider" />
</template>
