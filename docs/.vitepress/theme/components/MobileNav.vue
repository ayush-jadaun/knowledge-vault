<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vitepress'

const router = useRouter()
const sidebarOpen = ref(false)

function goHome() {
  router.go('/')
}

function openSearch() {
  // Trigger the existing search button
  const searchBtn = document.querySelector('.VPSearch') as HTMLElement
  if (searchBtn) {
    searchBtn.click()
  }
}

function openBookmarks() {
  router.go('/bookmarks')
}

function toggleSidebar() {
  // VitePress uses a hamburger button to toggle sidebar on mobile
  const hamburger = document.querySelector('.VPLocalNav .menu') as HTMLElement
    || document.querySelector('.VPNavBarHamburger') as HTMLElement
    || document.querySelector('.VPLocalNav button[aria-label]') as HTMLElement
  if (hamburger) {
    hamburger.click()
  }
}
</script>

<template>
  <nav class="mobile-bottom-nav" aria-label="Mobile navigation">
    <button class="mobile-nav-btn" @click="goHome" title="Home">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <span>Home</span>
    </button>

    <button class="mobile-nav-btn" @click="openSearch" title="Search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <span>Search</span>
    </button>

    <button class="mobile-nav-btn" @click="openBookmarks" title="Bookmarks">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
      <span>Bookmarks</span>
    </button>

    <button class="mobile-nav-btn" @click="toggleSidebar" title="Menu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
      <span>Menu</span>
    </button>
  </nav>
</template>
