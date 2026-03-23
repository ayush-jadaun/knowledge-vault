<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']
let seq: string[] = []
let handler: ((e: KeyboardEvent) => void) | null = null

function triggerMatrixRain() {
  console.log('%c You found the Konami code! Welcome, engineer. The Archon acknowledges you.', 'color: #42d392; font-size: 16px; font-weight: bold;')

  const canvas = document.createElement('canvas')
  canvas.className = 'matrix-rain'
  canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:0.85;'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')!
  const cols = Math.floor(canvas.width / 16)
  const drops = new Array(cols).fill(0)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()_+-=[]{}|;:<>?'

  const interval = setInterval(() => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#42d392'
    ctx.font = '14px monospace'

    for (let i = 0; i < drops.length; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)]
      ctx.fillText(char, i * 16, drops[i] * 16)
      if (drops[i] * 16 > canvas.height && Math.random() > 0.975) drops[i] = 0
      drops[i]++
    }
  }, 50)

  setTimeout(() => {
    clearInterval(interval)
    canvas.style.transition = 'opacity 0.5s'
    canvas.style.opacity = '0'
    setTimeout(() => canvas.remove(), 500)
  }, 3000)
}

onMounted(() => {
  handler = (e: KeyboardEvent) => {
    seq.push(e.key)
    if (seq.length > KONAMI.length) seq.shift()
    if (seq.length === KONAMI.length && seq.every((k, i) => k === KONAMI[i])) {
      seq = []
      triggerMatrixRain()
    }
  }
  document.addEventListener('keydown', handler)
})

onUnmounted(() => {
  if (handler) document.removeEventListener('keydown', handler)
})
</script>

<template>
  <div class="easter-egg-provider" />
</template>
