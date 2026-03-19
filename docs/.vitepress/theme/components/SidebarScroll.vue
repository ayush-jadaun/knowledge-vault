<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
let observer: IntersectionObserver | null = null

function scrollSidebarToActive() {
  setTimeout(() => {
    const sidebar = document.querySelector('.VPSidebar')
    if (!sidebar) return
    const activeLink = sidebar.querySelector('a.active')
    if (!activeLink) return
    activeLink.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, 200)
}

function setupOutlineTracking() {
  // Clean up previous observer
  if (observer) observer.disconnect()

  setTimeout(() => {
    const headings = document.querySelectorAll('.vp-doc h2[id], .vp-doc h3[id], .vp-doc h4[id]')
    const outlineLinks = document.querySelectorAll('.VPDocOutlineItem a')

    if (headings.length === 0 || outlineLinks.length === 0) return

    // Build a map of heading id → outline link
    const linkMap = new Map<string, Element>()
    outlineLinks.forEach(link => {
      const href = link.getAttribute('href')
      if (href) linkMap.set(href.slice(1), link) // remove #
    })

    let activeId = ''

    observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible heading
        for (const entry of entries) {
          if (entry.isIntersecting) {
            activeId = entry.target.id
          }
        }

        // If no heading is intersecting, find the last one above viewport
        if (!activeId) {
          for (const heading of headings) {
            const rect = heading.getBoundingClientRect()
            if (rect.top < 100) activeId = heading.id
          }
        }

        // Update active state
        outlineLinks.forEach(link => link.classList.remove('active'))
        if (activeId && linkMap.has(activeId)) {
          linkMap.get(activeId)!.classList.add('active')
        }
      },
      {
        rootMargin: '-64px 0px -75% 0px',
        threshold: 0,
      }
    )

    headings.forEach(h => observer!.observe(h))
  }, 500)
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
  if (observer) observer.disconnect()
})
</script>

<template>
  <div class="sidebar-scroll-provider" />
</template>

<style>
/* Ensure outline active link is visible */
.VPDocOutlineItem a.active {
  color: var(--vp-c-brand-1) !important;
  font-weight: 600 !important;
  transition: color 0.15s;
}
</style>
