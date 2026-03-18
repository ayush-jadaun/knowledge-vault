<script setup lang="ts">
import { onMounted, ref } from 'vue'

const isOpen = ref(false)
let pagefindUI: any = null

onMounted(async () => {
  // Load Pagefind CSS
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = '/pagefind/pagefind-ui.css'
  document.head.appendChild(link)

  // Listen for keyboard shortcut (Ctrl+K or Cmd+K)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      isOpen.value = !isOpen.value
      if (isOpen.value) initPagefind()
    }
    if (e.key === 'Escape') {
      isOpen.value = false
    }
  })
})

async function initPagefind() {
  if (pagefindUI) return
  try {
    // @ts-ignore - Pagefind UI is loaded from static files
    const PagefindUI = (await import(/* @vite-ignore */ '/pagefind/pagefind-ui.js')).PagefindUI
    pagefindUI = new PagefindUI({
      element: '#pagefind-container',
      showSubResults: true,
      showImages: false,
      excerptLength: 20,
    })
    // Auto-focus the search input
    setTimeout(() => {
      const input = document.querySelector('#pagefind-container input') as HTMLInputElement
      input?.focus()
    }, 100)
  } catch (e) {
    console.warn('Pagefind not available (run pagefind after build)', e)
  }
}

function open() {
  isOpen.value = true
  initPagefind()
}

function closeOnOverlay(e: Event) {
  if ((e.target as HTMLElement).classList.contains('search-overlay')) {
    isOpen.value = false
  }
}
</script>

<template>
  <!-- Search button in nav -->
  <button class="search-trigger" @click="open" aria-label="Search">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
    <span class="search-text">Search</span>
    <span class="search-shortcut">
      <kbd>Ctrl</kbd>
      <kbd>K</kbd>
    </span>
  </button>

  <!-- Search modal -->
  <Teleport to="body">
    <div v-if="isOpen" class="search-overlay" @click="closeOnOverlay">
      <div class="search-modal">
        <div class="search-header">
          <span>Search Knowledge Vault</span>
          <button class="search-close" @click="isOpen = false">
            <kbd>Esc</kbd>
          </button>
        </div>
        <div id="pagefind-container"></div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.search-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.2s;
}

.search-trigger:hover {
  border-color: var(--vp-c-brand-1);
}

.search-text {
  color: var(--vp-c-text-3);
}

.search-shortcut {
  display: flex;
  gap: 2px;
  margin-left: 8px;
}

.search-shortcut kbd {
  font-size: 11px;
  padding: 1px 5px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3);
  font-family: inherit;
}

.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  padding-top: 10vh;
}

.search-modal {
  width: 90%;
  max-width: 640px;
  max-height: 75vh;
  background: var(--vp-c-bg);
  border-radius: 12px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-1);
}

.search-close {
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.search-close kbd {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3);
}

#pagefind-container {
  padding: 12px 18px;
  overflow-y: auto;
}

/* Override Pagefind UI styles to match VitePress theme */
.pagefind-ui__search-input {
  font-family: inherit !important;
  border-radius: 8px !important;
  border: 1px solid var(--vp-c-divider) !important;
  background: var(--vp-c-bg) !important;
  color: var(--vp-c-text-1) !important;
  font-size: 14px !important;
  padding: 10px 14px !important;
}

.pagefind-ui__search-input:focus {
  border-color: var(--vp-c-brand-1) !important;
  outline: none !important;
}

.pagefind-ui__result-link {
  color: var(--vp-c-brand-1) !important;
}

.pagefind-ui__result-excerpt {
  color: var(--vp-c-text-2) !important;
}

.dark .pagefind-ui__search-input {
  background: var(--vp-c-bg-soft) !important;
}

@media (max-width: 640px) {
  .search-text,
  .search-shortcut {
    display: none;
  }

  .search-modal {
    width: 95%;
    max-height: 85vh;
  }
}
</style>
