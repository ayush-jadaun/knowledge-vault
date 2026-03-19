<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vitepress'

const router = useRouter()
const showHelp = ref(false)

onMounted(() => {
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in input/textarea
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if ((e.target as HTMLElement).isContentEditable) return

    // ? — show keyboard shortcuts help
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      showHelp.value = !showHelp.value
      return
    }

    // Escape — close help
    if (e.key === 'Escape' && showHelp.value) {
      showHelp.value = false
      return
    }

    // / — focus search
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      const searchBtn = document.querySelector('.VPSearch button, .vp-search-btn') as HTMLElement
      if (searchBtn) searchBtn.click()
      return
    }

    // g then h — go home
    if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
      if (lastKey === 'g' && Date.now() - lastKeyTime < 500) {
        e.preventDefault()
        router.go('/')
        return
      }
    }

    // g then i — go to system design interviews
    if (e.key === 'i' && !e.ctrlKey && !e.metaKey) {
      if (lastKey === 'g' && Date.now() - lastKeyTime < 500) {
        e.preventDefault()
        router.go('/system-design-interviews/')
        return
      }
    }

    // g then c — go to cheat sheets
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
      if (lastKey === 'g' && Date.now() - lastKeyTime < 500) {
        e.preventDefault()
        router.go('/cheat-sheets/')
        return
      }
    }

    // g then g — go to knowledge graph
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
      if (lastKey === 'g' && Date.now() - lastKeyTime < 500) {
        e.preventDefault()
        router.go('/graph')
        return
      }
    }

    // g then r — random page
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
      if (lastKey === 'g' && Date.now() - lastKeyTime < 500) {
        e.preventDefault()
        goToRandomPage()
        return
      }
    }

    // t — toggle dark mode
    if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      const toggle = document.querySelector('.VPSwitch') as HTMLElement
      if (toggle) toggle.click()
      return
    }

    // [ — previous page
    if (e.key === '[' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      const prev = document.querySelector('.pager-link.prev, a[class*="prev"]') as HTMLAnchorElement
      if (prev) prev.click()
      return
    }

    // ] — next page
    if (e.key === ']' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      const next = document.querySelector('.pager-link.next, a[class*="next"]') as HTMLAnchorElement
      if (next) next.click()
      return
    }

    // e — edit on GitHub
    if (e.key === 'e' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      const edit = document.querySelector('.edit-link-button, a[class*="edit"]') as HTMLAnchorElement
      if (edit) window.open(edit.href, '_blank')
      return
    }

    // s — scroll to top
    if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    lastKey = e.key
    lastKeyTime = Date.now()
  })
})

let lastKey = ''
let lastKeyTime = 0

function goToRandomPage() {
  // Get all sidebar links
  const links = document.querySelectorAll('.VPSidebar a[href]')
  if (links.length === 0) return
  const random = links[Math.floor(Math.random() * links.length)] as HTMLAnchorElement
  if (random.href) window.location.href = random.href
}

function close() {
  showHelp.value = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="kbd-fade">
      <div v-if="showHelp" class="kbd-overlay" @click.self="close">
        <div class="kbd-modal">
          <div class="kbd-header">
            <h3>Keyboard Shortcuts</h3>
            <button @click="close" class="kbd-close">
              <kbd>esc</kbd>
            </button>
          </div>

          <div class="kbd-sections">
            <div class="kbd-section">
              <h4>Navigation</h4>
              <div class="kbd-row"><kbd>[</kbd> <span>Previous page</span></div>
              <div class="kbd-row"><kbd>]</kbd> <span>Next page</span></div>
              <div class="kbd-row"><kbd>s</kbd> <span>Scroll to top</span></div>
              <div class="kbd-row"><kbd>t</kbd> <span>Toggle dark mode</span></div>
            </div>

            <div class="kbd-section">
              <h4>Go to</h4>
              <div class="kbd-row"><kbd>g</kbd><kbd>h</kbd> <span>Home</span></div>
              <div class="kbd-row"><kbd>g</kbd><kbd>i</kbd> <span>System Design Interviews</span></div>
              <div class="kbd-row"><kbd>g</kbd><kbd>c</kbd> <span>Cheat Sheets</span></div>
              <div class="kbd-row"><kbd>g</kbd><kbd>g</kbd> <span>Knowledge Graph</span></div>
              <div class="kbd-row"><kbd>g</kbd><kbd>r</kbd> <span>Random page</span></div>
            </div>

            <div class="kbd-section">
              <h4>Actions</h4>
              <div class="kbd-row"><kbd>/</kbd> <span>Search</span></div>
              <div class="kbd-row"><kbd>Ctrl</kbd><kbd>K</kbd> <span>Search</span></div>
              <div class="kbd-row"><kbd>e</kbd> <span>Edit on GitHub</span></div>
              <div class="kbd-row"><kbd>?</kbd> <span>Show this help</span></div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.kbd-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
}

.kbd-modal {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  padding: 24px 28px;
  max-width: 520px;
  width: 90%;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
}

.kbd-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.kbd-header h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin: 0;
}

.kbd-close {
  background: none;
  border: none;
  cursor: pointer;
}

.kbd-close kbd {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3);
  font-family: inherit;
}

.kbd-sections {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 20px;
}

.kbd-section h4 {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-3);
  margin-bottom: 10px;
}

.kbd-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.kbd-row kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  box-shadow: 0 1px 0 var(--vp-c-divider);
}

.kbd-row span {
  margin-left: 4px;
}

.kbd-fade-enter-active { transition: opacity 0.15s ease; }
.kbd-fade-leave-active { transition: opacity 0.1s ease; }
.kbd-fade-enter-from, .kbd-fade-leave-to { opacity: 0; }
</style>
