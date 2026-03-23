<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const hasAnimated = ref(false)
let observer: IntersectionObserver | null = null

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

function parseStatValue(text: string): { num: number; suffix: string } {
  const match = text.trim().match(/^([\d,]+\.?\d*)\s*(\+|K\+|M\+|%|)$/)
  if (!match) return { num: 0, suffix: '' }
  const num = parseFloat(match[1].replace(/,/g, ''))
  const suffix = match[2] || ''
  return { num, suffix }
}

function formatNumber(n: number, original: string): string {
  // Preserve K+ format
  if (original.includes('K')) {
    return Math.round(n) + 'K'
  }
  // Use comma formatting for large numbers
  if (n >= 1000) {
    return Math.round(n).toLocaleString('en-US')
  }
  return Math.round(n).toString()
}

function animateCounters(container: HTMLElement) {
  if (hasAnimated.value) return
  hasAnimated.value = true

  const statNumbers = container.querySelectorAll('.stat-number')
  statNumbers.forEach((el) => {
    const element = el as HTMLElement
    const originalText = element.textContent || ''
    const { num, suffix } = parseStatValue(originalText)
    if (num === 0) return

    const duration = 2000
    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOutQuart(progress)
      const current = easedProgress * num

      element.textContent = formatNumber(current, originalText) + suffix

      if (progress < 1) {
        requestAnimationFrame(tick)
      }
    }

    element.textContent = '0' + suffix
    requestAnimationFrame(tick)
  })
}

onMounted(() => {
  const statsContainer = document.querySelector('.home-stats') as HTMLElement
  if (!statsContainer) return

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasAnimated.value) {
          animateCounters(entry.target as HTMLElement)
        }
      })
    },
    { threshold: 0.3 }
  )

  observer.observe(statsContainer)
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})
</script>

<template>
  <div style="display: none;"></div>
</template>
