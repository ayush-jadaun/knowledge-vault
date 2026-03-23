<script setup lang="ts">
import { onMounted, watch, nextTick } from 'vue'
import { useRoute, useData } from 'vitepress'

const route = useRoute()
const { page } = useData()

// ============ Lazy Image Loading with Blur Placeholder ============
function setupLazyImages() {
  nextTick(() => {
    setTimeout(() => {
      const images = document.querySelectorAll('.vp-doc img') as NodeListOf<HTMLImageElement>
      images.forEach(img => {
        if (img.getAttribute('data-lazy-setup') === 'true') return
        img.setAttribute('data-lazy-setup', 'true')
        img.setAttribute('loading', 'lazy')

        if (img.complete) {
          img.classList.add('loaded')
        } else {
          img.setAttribute('data-loading', 'true')
          img.addEventListener('load', () => {
            img.removeAttribute('data-loading')
            img.classList.add('loaded')
          }, { once: true })
          img.addEventListener('error', () => {
            img.removeAttribute('data-loading')
          }, { once: true })
        }
      })
    }, 100)
  })
}

// ============ Cheat Sheet Detection ============
function detectCheatSheet() {
  const path = route.path || ''
  if (path.includes('/cheat-sheets/') || path.includes('/cheat-sheet')) {
    document.documentElement.setAttribute('data-cheat-sheet', 'true')
  } else {
    document.documentElement.removeAttribute('data-cheat-sheet')
  }
}

// ============ Changelog Timeline Class ============
function detectChangelog() {
  const path = route.path || ''
  const vpDoc = document.querySelector('.VPDoc')
  if (path.includes('/changelog')) {
    vpDoc?.classList.add('changelog')
  } else {
    vpDoc?.classList.remove('changelog')
  }
}

// ============ Page Depth Dots ============
function addDepthDots() {
  // Remove existing dots
  document.querySelectorAll('.page-depth-dots').forEach(el => el.remove())

  const relativePath = page.value.relativePath
  if (!relativePath || relativePath === 'index.md') return

  const clean = relativePath.replace(/\.md$/, '').replace(/\/index$/, '')
  const depth = clean.split('/').length

  if (depth < 1) return

  const breadcrumbs = document.querySelector('.breadcrumbs ol')
  if (!breadcrumbs) return

  const dots = document.createElement('span')
  dots.className = 'page-depth-dots'
  dots.setAttribute('title', `Depth level: ${depth}`)
  dots.setAttribute('aria-label', `Page depth: ${depth} levels`)

  for (let i = 0; i < depth; i++) {
    const dot = document.createElement('span')
    dot.className = 'depth-dot'
    dots.appendChild(dot)
  }

  breadcrumbs.parentElement?.appendChild(dots)
}

// ============ Loading Skeleton ============
function showSkeleton() {
  const vpDoc = document.querySelector('.vp-doc')
  if (vpDoc) {
    vpDoc.classList.add('is-loading')
    // Max visible time: 200ms
    setTimeout(() => {
      vpDoc.classList.remove('is-loading')
    }, 200)
  }
}

function runAll() {
  nextTick(() => {
    showSkeleton()
    detectCheatSheet()
    detectChangelog()
    setupLazyImages()
    setTimeout(addDepthDots, 150)
  })
}

onMounted(runAll)

watch(() => route.path, () => {
  runAll()
})
</script>

<template>
  <div class="page-enhancements-provider" />
</template>
