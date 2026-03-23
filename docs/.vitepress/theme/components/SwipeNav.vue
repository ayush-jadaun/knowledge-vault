<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vitepress'

const router = useRouter()

let startX = 0
let startY = 0
let swiping = false
const THRESHOLD = 100
const swipeDir = ref<'left' | 'right' | ''>('')
const swipeVisible = ref(false)

function isMobile() {
  return window.innerWidth < 768
}

function getNavLinks(): { prev: string | null; next: string | null } {
  const prevEl = document.querySelector('.pager-link.prev a, .prev-next .prev a, a.pager-link.prev') as HTMLAnchorElement
  const nextEl = document.querySelector('.pager-link.next a, .prev-next .next a, a.pager-link.next') as HTMLAnchorElement

  // VitePress uses .VPDocFooter with prev/next links
  const footer = document.querySelector('.VPDocFooter')
  let prev: string | null = null
  let next: string | null = null

  if (footer) {
    const links = footer.querySelectorAll('a')
    links.forEach(a => {
      const parent = a.closest('.prev, .next, [class*="prev"], [class*="next"]')
      if (!parent) {
        // Fallback: first link = prev, second = next
        if (!prev) prev = a.getAttribute('href')
        else if (!next) next = a.getAttribute('href')
        return
      }
      const cls = parent.className || ''
      if (cls.includes('prev')) prev = a.getAttribute('href')
      if (cls.includes('next')) next = a.getAttribute('href')
    })
  }

  return { prev: prev || prevEl?.getAttribute('href') || null, next: next || nextEl?.getAttribute('href') || null }
}

function onTouchStart(e: TouchEvent) {
  if (!isMobile()) return
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
  swiping = true
  swipeDir.value = ''
  swipeVisible.value = false
}

function onTouchMove(e: TouchEvent) {
  if (!swiping || !isMobile()) return

  const dx = e.touches[0].clientX - startX
  const dy = e.touches[0].clientY - startY

  // If vertical scroll is dominant, cancel swipe
  if (Math.abs(dy) > Math.abs(dx)) {
    swiping = false
    swipeDir.value = ''
    swipeVisible.value = false
    return
  }

  const absDx = Math.abs(dx)
  if (absDx > 30) {
    swipeDir.value = dx > 0 ? 'left' : 'right'
    swipeVisible.value = absDx > THRESHOLD * 0.5

    // Slight tilt effect
    const tilt = Math.min(absDx / THRESHOLD, 1) * 2
    const sign = dx > 0 ? 1 : -1
    document.body.style.transform = `translateX(${sign * tilt}px)`
    document.body.classList.add('swiping')
  }
}

function onTouchEnd(e: TouchEvent) {
  if (!swiping || !isMobile()) return

  document.body.style.transform = ''
  document.body.classList.remove('swiping')

  const endX = e.changedTouches[0].clientX
  const dx = endX - startX

  if (Math.abs(dx) >= THRESHOLD) {
    const { prev, next } = getNavLinks()
    if (dx > 0 && prev) {
      router.go(prev)
    } else if (dx < 0 && next) {
      router.go(next)
    }
  }

  swiping = false
  swipeDir.value = ''
  swipeVisible.value = false
}

function bind() {
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
}

function unbind() {
  document.removeEventListener('touchstart', onTouchStart)
  document.removeEventListener('touchmove', onTouchMove)
  document.removeEventListener('touchend', onTouchEnd)
}

onMounted(bind)
onUnmounted(unbind)
</script>

<template>
  <div class="swipe-indicator left" :class="{ visible: swipeVisible && swipeDir === 'left' }"></div>
  <div class="swipe-indicator right" :class="{ visible: swipeVisible && swipeDir === 'right' }"></div>
</template>
