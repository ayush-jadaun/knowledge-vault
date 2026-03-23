<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
let originalTitle = ''
let ticking = false

function updateTitle() {
  const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
  if (scrollHeight <= 0) {
    if (document.title !== originalTitle) {
      document.title = originalTitle
    }
    return
  }

  const percentage = Math.round((window.scrollY / scrollHeight) * 100)

  if (percentage <= 0) {
    document.title = originalTitle
  } else {
    document.title = `${percentage}% | ${originalTitle}`
  }
}

function onScroll() {
  if (!ticking) {
    ticking = true
    requestAnimationFrame(() => {
      updateTitle()
      ticking = false
    })
  }
}

function captureTitle() {
  // Capture after VitePress sets the title
  setTimeout(() => {
    // Strip any existing percentage prefix
    const current = document.title
    const stripped = current.replace(/^\d+%\s*\|\s*/, '')
    originalTitle = stripped
  }, 100)
}

onMounted(() => {
  captureTitle()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  if (originalTitle) {
    document.title = originalTitle
  }
})

watch(() => route.path, () => {
  captureTitle()
})
</script>

<template>
  <div style="display: none;"></div>
</template>
