<script setup lang="ts">
import { onMounted, ref, nextTick } from 'vue'

const isOpen = ref(false)
let pagefindUI: any = null

const activeResultIndex = ref(-1)

function getResultLinks(): HTMLAnchorElement[] {
  const container = document.getElementById('pagefind-container')
  if (!container) return []
  return Array.from(container.querySelectorAll('.pagefind-ui__result-link')) as HTMLAnchorElement[]
}

function handleSearchKeys(e: KeyboardEvent) {
  if (!isOpen.value) return

  const links = getResultLinks()
  if (links.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeResultIndex.value = Math.min(activeResultIndex.value + 1, links.length - 1)
    links.forEach((l, i) => l.classList.toggle('pagefind-kb-active', i === activeResultIndex.value))
    links[activeResultIndex.value]?.scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeResultIndex.value = Math.max(activeResultIndex.value - 1, 0)
    links.forEach((l, i) => l.classList.toggle('pagefind-kb-active', i === activeResultIndex.value))
    links[activeResultIndex.value]?.scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'Enter' && activeResultIndex.value >= 0) {
    e.preventDefault()
    const link = links[activeResultIndex.value]
    if (link) {
      isOpen.value = false
      window.location.href = link.href
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      toggle()
    }
    if (e.key === 'Escape' && isOpen.value) {
      isOpen.value = false
    }
    handleSearchKeys(e)
  })
})

function toggle() {
  isOpen.value = !isOpen.value
  activeResultIndex.value = -1
  if (isOpen.value) {
    nextTick(() => initPagefind())
  }
}

async function initPagefind() {
  if (pagefindUI) {
    setTimeout(() => {
      const input = document.querySelector('#pagefind-container input') as HTMLInputElement
      input?.focus()
    }, 50)
    return
  }

  // Load Pagefind CSS
  if (!document.querySelector('link[href*="pagefind"]')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = '/pagefind/pagefind-ui.css'
    document.head.appendChild(link)
  }

  try {
    await new Promise<void>((resolve, reject) => {
      if ((window as any).PagefindUI) { resolve(); return }
      const script = document.createElement('script')
      script.src = '/pagefind/pagefind-ui.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Pagefind not available'))
      document.head.appendChild(script)
    })

    pagefindUI = new (window as any).PagefindUI({
      element: '#pagefind-container',
      showSubResults: true,
      showImages: false,
      excerptLength: 15,
      resetStyles: true,
    })

    // Close modal when a result link is clicked
    setTimeout(() => {
      const container = document.getElementById('pagefind-container')
      if (container) {
        container.addEventListener('click', (e) => {
          const target = e.target as HTMLElement
          if (target.tagName === 'A' || target.closest('a')) {
            isOpen.value = false
          }
        })
      }
    }, 200)

    // Reset keyboard index when user types
    setTimeout(() => {
      const input = document.querySelector('#pagefind-container input') as HTMLInputElement
      if (input) {
        input.addEventListener('input', () => { activeResultIndex.value = -1 })
      }
    }, 150)

    setTimeout(() => {
      const input = document.querySelector('#pagefind-container input') as HTMLInputElement
      input?.focus()
    }, 100)
  } catch {
    const el = document.querySelector('#pagefind-container')
    if (el) {
      el.innerHTML = `
        <div class="search-dev-msg">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <p>Search available after build</p>
          <code>npm run docs:build && npm run docs:preview</code>
        </div>`
    }
  }
}

function onOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('search-overlay')) {
    isOpen.value = false
  }
}
</script>

<template>
  <button class="VPSearch" @click="toggle" aria-label="Search">
    <span class="vp-search-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <circle cx="10.5" cy="10.5" r="7.5"/>
        <path d="m21 21-5.2-5.2"/>
      </svg>
      <span class="search-label">Search</span>
      <span class="search-keys">
        <kbd class="search-kbd">⌘</kbd>
        <kbd class="search-kbd">K</kbd>
      </span>
    </span>
  </button>

  <Teleport to="body">
    <Transition name="search-fade">
      <div v-if="isOpen" class="search-overlay" @mousedown="onOverlayClick">
        <div class="search-dialog" role="dialog" aria-label="Search">
          <div class="search-dialog-header">
            <div class="search-dialog-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <circle cx="10.5" cy="10.5" r="7.5"/>
                <path d="m21 21-5.2-5.2"/>
              </svg>
              Search documentation
            </div>
            <button class="search-dialog-close" @click="isOpen = false">
              <kbd>esc</kbd>
            </button>
          </div>
          <div class="search-dialog-body">
            <div id="pagefind-container"></div>
          </div>
          <div class="search-dialog-footer">
            <span class="search-footer-hint">
              <kbd>↵</kbd> to select
              <kbd>↑↓</kbd> to navigate
              <kbd>esc</kbd> to close
            </span>
            <span class="search-footer-brand">Powered by Pagefind</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
/* ============================================
   Search Trigger Button — matches VitePress
   ============================================ */
.VPSearch {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  margin-right: 12px;
}

.vp-search-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-alt, var(--vp-c-bg));
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
  min-width: 170px;
}

.vp-search-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.search-label {
  flex: 1;
  text-align: left;
  color: var(--vp-c-text-3);
  font-weight: 400;
}

.search-keys {
  display: flex;
  gap: 3px;
}

.search-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
  box-shadow: 0 1px 0 var(--vp-c-divider);
}

/* ============================================
   Search Overlay
   ============================================ */
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: min(10vh, 80px);
}

.dark .search-overlay {
  background: rgba(0, 0, 0, 0.75);
}

/* ============================================
   Search Dialog — polished modal
   ============================================ */
.search-dialog {
  width: 92%;
  max-width: 620px;
  max-height: 80vh;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.03),
    0 4px 16px rgba(0, 0, 0, 0.12),
    0 24px 56px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: search-dialog-enter 0.15s ease-out;
}

.dark .search-dialog {
  background: var(--vp-c-bg-soft, #1e1e2e);
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03),
    0 4px 24px rgba(0, 0, 0, 0.4),
    0 24px 56px rgba(0, 0, 0, 0.5);
}

@keyframes search-dialog-enter {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ============================================
   Dialog Header
   ============================================ */
.search-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.search-dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.search-dialog-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.search-dialog-close kbd {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
  box-shadow: 0 1px 0 var(--vp-c-divider);
  transition: all 0.15s;
}

.search-dialog-close kbd:hover {
  border-color: var(--vp-c-text-3);
  color: var(--vp-c-text-1);
}

/* ============================================
   Dialog Body — Pagefind container
   ============================================ */
.search-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  overscroll-behavior: contain;
}

#pagefind-container {
  padding: 16px;
}

/* ============================================
   Dialog Footer
   ============================================ */
.search-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 11px;
  color: var(--vp-c-text-3);
}

.search-footer-hint {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-footer-hint kbd {
  display: inline-flex;
  align-items: center;
  padding: 1px 4px;
  font-size: 10px;
  font-family: inherit;
  border: 1px solid var(--vp-c-divider);
  border-radius: 3px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
}

.search-footer-brand {
  opacity: 0.5;
}

/* ============================================
   Dev mode message
   ============================================ */
.search-dev-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--vp-c-text-3);
  text-align: center;
}

.search-dev-msg p {
  margin: 0;
  font-size: 14px;
}

.search-dev-msg code {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
}

/* ============================================
   Pagefind UI Overrides — match VitePress
   ============================================ */
.pagefind-ui {
  --pagefind-ui-scale: 0.9;
  --pagefind-ui-primary: var(--vp-c-brand-1, #5f67ee);
  --pagefind-ui-text: var(--vp-c-text-1);
  --pagefind-ui-background: transparent;
  --pagefind-ui-border: var(--vp-c-divider);
  --pagefind-ui-tag: var(--vp-c-bg-soft);
  --pagefind-ui-border-width: 1px;
  --pagefind-ui-border-radius: 8px;
  --pagefind-ui-font: inherit;
}

.pagefind-ui__search-input {
  font-family: inherit !important;
  font-size: 15px !important;
  font-weight: 400 !important;
  padding: 12px 16px 12px 40px !important;
  border: 1px solid var(--vp-c-divider) !important;
  border-radius: 8px !important;
  background: var(--vp-c-bg) !important;
  color: var(--vp-c-text-1) !important;
  width: 100% !important;
  outline: none !important;
  transition: border-color 0.2s !important;
}

.pagefind-ui__search-input:focus {
  border-color: var(--vp-c-brand-1) !important;
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft, rgba(95, 103, 238, 0.1)) !important;
}

.dark .pagefind-ui__search-input {
  background: var(--vp-c-bg-soft, #1a1a2e) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.dark .pagefind-ui__search-input:focus {
  border-color: var(--vp-c-brand-1) !important;
}

/* Search clear button */
.pagefind-ui__search-clear {
  right: 12px !important;
  color: var(--vp-c-text-3) !important;
  opacity: 0.6;
}

.pagefind-ui__search-clear:hover {
  opacity: 1;
}

/* Result items */
.pagefind-ui__result {
  padding: 12px 0 !important;
  border-bottom: 1px solid var(--vp-c-divider) !important;
}

.pagefind-ui__result:last-child {
  border-bottom: none !important;
}

.pagefind-ui__result-link {
  font-size: 14px !important;
  font-weight: 600 !important;
  color: var(--vp-c-brand-1) !important;
  text-decoration: none !important;
  transition: color 0.15s !important;
}

.pagefind-ui__result-link:hover {
  color: var(--vp-c-brand-2, #747bff) !important;
}

.pagefind-ui__result-title {
  font-weight: 600 !important;
}

.pagefind-ui__result-excerpt {
  font-size: 13px !important;
  line-height: 1.6 !important;
  color: var(--vp-c-text-2) !important;
  margin-top: 4px !important;
}

mark.pagefind-ui__result-highlight {
  background: rgba(95, 103, 238, 0.15) !important;
  color: var(--vp-c-brand-1) !important;
  padding: 1px 2px !important;
  border-radius: 2px !important;
  font-weight: 600 !important;
}

.dark mark.pagefind-ui__result-highlight {
  background: rgba(116, 123, 255, 0.2) !important;
  color: var(--vp-c-brand-2) !important;
}

/* Message when no results */
.pagefind-ui__message {
  font-size: 13px !important;
  color: var(--vp-c-text-3) !important;
  padding: 20px 0 !important;
  text-align: center !important;
}

/* Sub-results */
.pagefind-ui__result-nested {
  padding-left: 16px !important;
  border-left: 2px solid var(--vp-c-divider) !important;
  margin-left: 8px !important;
}

/* Hide default pagefind branding */
.pagefind-ui__drawer .pagefind-ui__message::after {
  display: none !important;
}

/* Keyboard navigation active result */
.pagefind-ui__result-link.pagefind-kb-active {
  background: var(--vp-c-brand-soft) !important;
  border-radius: 4px !important;
  outline: 2px solid var(--vp-c-brand-1) !important;
  outline-offset: 1px !important;
}

/* Load more button */
.pagefind-ui__button {
  background: var(--vp-c-bg-soft) !important;
  border: 1px solid var(--vp-c-divider) !important;
  border-radius: 6px !important;
  color: var(--vp-c-text-2) !important;
  font-family: inherit !important;
  font-size: 13px !important;
  padding: 8px 16px !important;
  cursor: pointer !important;
  transition: all 0.15s !important;
  margin-top: 8px !important;
}

.pagefind-ui__button:hover {
  border-color: var(--vp-c-brand-1) !important;
  color: var(--vp-c-brand-1) !important;
}

/* ============================================
   Transition
   ============================================ */
.search-fade-enter-active {
  transition: opacity 0.15s ease;
}
.search-fade-leave-active {
  transition: opacity 0.1s ease;
}
.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
}

/* ============================================
   Responsive
   ============================================ */
@media (max-width: 640px) {
  .search-label,
  .search-keys {
    display: none;
  }

  .vp-search-btn {
    min-width: auto;
    padding: 6px 10px;
  }

  .search-dialog {
    width: 100%;
    max-height: 100vh;
    border-radius: 0;
    margin: 0;
  }

  .search-overlay {
    padding-top: 0;
  }

  .search-dialog-footer {
    display: none;
  }
}
</style>
