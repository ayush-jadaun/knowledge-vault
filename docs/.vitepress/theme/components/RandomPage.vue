<script setup lang="ts">
import { onMounted, ref } from 'vue'

function goToRandomPage() {
  const links = document.querySelectorAll('.VPSidebar a[href]')
  if (links.length === 0) return
  const hrefs: string[] = []
  links.forEach(link => {
    const href = (link as HTMLAnchorElement).getAttribute('href')
    if (href && !href.startsWith('#')) hrefs.push(href)
  })
  if (hrefs.length === 0) return
  const random = hrefs[Math.floor(Math.random() * hrefs.length)]
  window.location.href = random
}
</script>

<template>
  <button class="random-page-btn" @click="goToRandomPage" title="Go to a random page" aria-label="Random page">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="16 3 21 3 21 8"/>
      <line x1="4" y1="20" x2="21" y2="3"/>
      <polyline points="21 16 21 21 16 21"/>
      <line x1="15" y1="15" x2="21" y2="21"/>
      <line x1="4" y1="4" x2="9" y2="9"/>
    </svg>
  </button>
</template>

<style>
.random-page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-alt, var(--vp-c-bg));
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-right: 8px;
  flex-shrink: 0;
}

.random-page-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.random-page-btn:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
</style>
