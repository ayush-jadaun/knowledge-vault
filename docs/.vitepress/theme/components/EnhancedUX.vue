<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const scrollProgress = ref(0)
const showBackToTop = ref(false)
const showToast = ref(false)
const toastMsg = ref('')
const fontSize = ref(16)
const focusMode = ref(false)
const noteText = ref('')
const showNotes = ref(false)
const streak = ref(0)

const NOTES_KEY = 'kv-notes'
const FONT_KEY = 'kv-font-size'
const STREAK_KEY = 'kv-streak'

// ============ Scroll Progress + Back to Top ============
function handleScroll() {
  const h = document.documentElement.scrollHeight - window.innerHeight
  scrollProgress.value = h > 0 ? (window.scrollY / h) * 100 : 0
  showBackToTop.value = window.scrollY > 400
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ============ Copy Heading Link ============
function setupHeadingLinks() {
  setTimeout(() => {
    const headings = document.querySelectorAll('.vp-doc h2[id], .vp-doc h3[id], .vp-doc h4[id]')
    headings.forEach(h => {
      if (h.querySelector('.heading-copy')) return
      h.style.cursor = 'pointer'
      h.addEventListener('click', () => {
        const url = `${window.location.origin}${window.location.pathname}#${h.id}`
        navigator.clipboard.writeText(url).then(() => {
          showToastMsg('Link copied!')
        })
      })
    })
  }, 500)
}

// ============ Code Copy Toast ============
function setupCopyToast() {
  setTimeout(() => {
    const observer = new MutationObserver(() => {
      const copyBtns = document.querySelectorAll('.vp-code-group button, div[class*="language-"] button')
      copyBtns.forEach(btn => {
        if (btn.getAttribute('data-toast') === 'true') return
        btn.setAttribute('data-toast', 'true')
        btn.addEventListener('click', () => showToastMsg('Copied!'))
      })
    })
    const doc = document.querySelector('.vp-doc')
    if (doc) observer.observe(doc, { childList: true, subtree: true })
  }, 500)
}

// ============ Toast ============
function showToastMsg(msg: string) {
  toastMsg.value = msg
  showToast.value = true
  setTimeout(() => { showToast.value = false }, 2000)
}

// ============ Font Size ============
function loadFontSize() {
  try {
    const stored = localStorage.getItem(FONT_KEY)
    if (stored) fontSize.value = parseInt(stored)
    applyFontSize()
  } catch {}
}

function changeFontSize(delta: number) {
  fontSize.value = Math.max(12, Math.min(22, fontSize.value + delta))
  localStorage.setItem(FONT_KEY, String(fontSize.value))
  applyFontSize()
}

function applyFontSize() {
  const doc = document.querySelector('.vp-doc') as HTMLElement
  if (doc) doc.style.fontSize = `${fontSize.value}px`
}

// ============ Focus Mode ============
function toggleFocus() {
  focusMode.value = !focusMode.value
  document.body.classList.toggle('focus-mode', focusMode.value)
  // Listen for Escape to exit
  if (focusMode.value) {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        focusMode.value = false
        document.body.classList.remove('focus-mode')
        document.removeEventListener('keydown', handler)
      }
    }
    document.addEventListener('keydown', handler)
  }
}

// ============ Quick Notes ============
function loadNotes() {
  try {
    const path = route.path.replace(/\.html$/, '')
    const stored = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}')
    noteText.value = stored[path] || ''
  } catch {}
}

function saveNotes() {
  try {
    const path = route.path.replace(/\.html$/, '')
    const stored = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}')
    if (noteText.value.trim()) {
      stored[path] = noteText.value
    } else {
      delete stored[path]
    }
    localStorage.setItem(NOTES_KEY, JSON.stringify(stored))
  } catch {}
}

// ============ Reading Streak ============
function updateStreak() {
  try {
    const stored = JSON.parse(localStorage.getItem(STREAK_KEY) || '{}')
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    if (stored.lastVisit === today) {
      streak.value = stored.count || 1
      return
    }

    if (stored.lastVisit === yesterday) {
      stored.count = (stored.count || 1) + 1
    } else {
      stored.count = 1
    }

    stored.lastVisit = today
    streak.value = stored.count
    localStorage.setItem(STREAK_KEY, JSON.stringify(stored))
  } catch {}
}

// ============ Outline Progress ============
function updateOutlineProgress() {
  const outline = document.querySelector('.VPDocAsideOutline')
  if (!outline) return
  let existing = outline.querySelector('.outline-progress') as HTMLElement
  if (!existing) {
    existing = document.createElement('div')
    existing.className = 'outline-progress'
    existing.innerHTML = '<div class="outline-progress-fill"></div>'
    outline.prepend(existing)
  }
  const fill = existing.querySelector('.outline-progress-fill') as HTMLElement
  if (fill) fill.style.height = `${scrollProgress.value}%`
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('scroll', updateOutlineProgress, { passive: true })
  setupHeadingLinks()
  setupCopyToast()
  loadFontSize()
  loadNotes()
  updateStreak()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('scroll', updateOutlineProgress)
})

watch(() => route.path, () => {
  setupHeadingLinks()
  loadNotes()
  applyFontSize()
})
</script>

<template>
  <!-- Scroll progress bar at top -->
  <div class="scroll-progress-bar">
    <div class="scroll-progress-fill" :style="{ width: scrollProgress + '%' }"></div>
  </div>

  <!-- Back to top ring -->
  <Transition name="btt-fade">
    <button v-if="showBackToTop" class="back-to-top" @click="scrollToTop" title="Back to top">
      <svg class="btt-ring" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="16" fill="none" stroke="var(--vp-c-divider)" stroke-width="2"/>
        <circle cx="18" cy="18" r="16" fill="none" stroke="var(--vp-c-brand-1)" stroke-width="2"
          :stroke-dasharray="100.53" :stroke-dashoffset="100.53 - (scrollProgress / 100 * 100.53)"
          transform="rotate(-90 18 18)" stroke-linecap="round"/>
      </svg>
      <svg class="btt-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M18 15l-6-6-6 6"/>
      </svg>
    </button>
  </Transition>

  <!-- Toolbar (font size + focus + notes + streak) -->
  <div class="ux-toolbar">
    <div v-if="streak > 1" class="streak-badge" :title="`${streak} day reading streak!`">
      {{ streak }}d streak
    </div>
    <button class="tool-btn" @click="changeFontSize(-1)" title="Decrease font">A-</button>
    <button class="tool-btn" @click="changeFontSize(1)" title="Increase font">A+</button>
    <button class="tool-btn" :class="{ active: focusMode }" @click="toggleFocus" title="Focus mode">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
      </svg>
    </button>
    <button class="tool-btn" :class="{ active: showNotes }" @click="showNotes = !showNotes" title="Quick notes">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>
  </div>

  <!-- Quick notes panel -->
  <Transition name="notes-slide">
    <div v-if="showNotes" class="notes-panel">
      <div class="notes-header">
        <span>Notes for this page</span>
        <button @click="showNotes = false" class="notes-close">&times;</button>
      </div>
      <textarea v-model="noteText" @input="saveNotes" placeholder="Jot your thoughts..." class="notes-textarea"></textarea>
    </div>
  </Transition>

  <!-- Focus mode exit hint -->
  <button v-if="focusMode" class="focus-exit-hint" @click="toggleFocus">
    Exit focus mode <kbd>Esc</kbd>
  </button>

  <!-- Toast -->
  <Transition name="toast-pop">
    <div v-if="showToast" class="toast">{{ toastMsg }}</div>
  </Transition>
</template>

<style>
/* Scroll progress bar */
.scroll-progress-bar {
  position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 200; background: transparent;
}
.scroll-progress-fill {
  height: 100%; background: linear-gradient(90deg, var(--vp-c-brand-1), #42d392); transition: width 0.1s;
}

/* Back to top */
.back-to-top {
  position: fixed; bottom: 90px; right: 24px; z-index: 90; width: 40px; height: 40px;
  border: none; background: var(--vp-c-bg); border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.2s;
}
.back-to-top:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
.btt-ring { position: absolute; }
.btt-arrow { color: var(--vp-c-text-2); }

/* Toolbar */
.ux-toolbar {
  position: fixed; top: 70px; right: 12px; z-index: 50;
  display: flex; flex-direction: column; gap: 4px; align-items: center;
}

.tool-btn {
  width: 32px; height: 32px; border: 1px solid var(--vp-c-divider); border-radius: 6px;
  background: var(--vp-c-bg); color: var(--vp-c-text-3); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; font-family: inherit; transition: all 0.15s;
}
.tool-btn:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.tool-btn.active { background: var(--vp-c-brand-1); color: white; border-color: var(--vp-c-brand-1); }

.streak-badge {
  font-size: 10px; font-weight: 700; color: #f59e0b; background: rgba(245,158,11,0.1);
  padding: 2px 6px; border-radius: 8px; margin-bottom: 4px; white-space: nowrap;
}

/* Notes panel */
.notes-panel {
  position: fixed; bottom: 24px; left: 24px; z-index: 90; width: 300px;
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider); border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15); overflow: hidden;
}
.notes-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border-bottom: 1px solid var(--vp-c-divider);
  font-size: 13px; font-weight: 600; color: var(--vp-c-text-2);
}
.notes-close { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--vp-c-text-3); }
.notes-textarea {
  width: 100%; height: 150px; padding: 12px 14px; border: none; resize: none;
  background: var(--vp-c-bg); color: var(--vp-c-text-1); font-size: 13px;
  font-family: inherit; line-height: 1.6; outline: none;
}

/* Toast */
.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 400;
  background: var(--vp-c-text-1); color: var(--vp-c-bg); padding: 8px 20px;
  border-radius: 8px; font-size: 13px; font-weight: 500;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
}

/* Focus mode */
body.focus-mode .VPSidebar,
body.focus-mode .VPNavBar,
body.focus-mode .VPLocalNav,
body.focus-mode .VPDocAsideOutline { display: none !important; }
body.focus-mode .VPContent { max-width: 100% !important; margin: 0 !important; padding: 40px 80px !important; }
body.focus-mode .VPDoc { max-width: 100% !important; }
body.focus-mode .vp-doc { max-width: 100% !important; }
body.focus-mode .VPDoc > div { max-width: 100% !important; padding: 0 !important; }
body.focus-mode .content-container { max-width: 100% !important; }

/* Focus mode exit hint */
.focus-exit-hint {
  position: fixed; top: 12px; right: 12px; z-index: 100;
  padding: 6px 14px; border-radius: 8px;
  background: var(--vp-c-bg-soft); border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-3); font-size: 12px; cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  transition: all 0.15s; font-family: inherit;
}
.focus-exit-hint:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-text-1); }
.focus-exit-hint kbd {
  font-size: 10px; padding: 1px 4px; border: 1px solid var(--vp-c-divider);
  border-radius: 3px; background: var(--vp-c-bg); font-family: inherit;
}

/* Outline progress bar */
.outline-progress {
  position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--vp-c-divider);
}
.outline-progress-fill {
  width: 100%; background: var(--vp-c-brand-1); transition: height 0.1s;
}

/* Transitions */
.btt-fade-enter-active, .btt-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.btt-fade-enter-from, .btt-fade-leave-to { opacity: 0; transform: translateY(8px); }

.notes-slide-enter-active { transition: all 0.2s ease-out; }
.notes-slide-leave-active { transition: all 0.15s ease-in; }
.notes-slide-enter-from { opacity: 0; transform: translateY(16px); }
.notes-slide-leave-to { opacity: 0; transform: translateY(8px); }

.toast-pop-enter-active { transition: all 0.2s ease-out; }
.toast-pop-leave-active { transition: all 0.3s ease-in; }
.toast-pop-enter-from { opacity: 0; transform: translateX(-50%) translateY(8px); }
.toast-pop-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }

@media (max-width: 768px) {
  .ux-toolbar { display: none !important; }
  .notes-panel { display: none !important; }
  .focus-exit-hint { display: none !important; }
  .back-to-top { bottom: 80px; right: 16px; }
}
</style>
