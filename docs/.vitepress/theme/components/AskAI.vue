<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'

const isOpen = ref(false)
const question = ref('')
const answer = ref('')
const isLoading = ref(false)
const sources = ref<Array<{ title: string; path: string }>>([])
const chatHistory = ref<Array<{ q: string; a: string; sources: typeof sources.value }>>([])
const messagesEl = ref<HTMLElement | null>(null)

let contextIndex: any[] | null = null

async function loadContext() {
  if (contextIndex) return contextIndex
  try {
    const res = await fetch('/ai-context.json')
    contextIndex = await res.json()
    return contextIndex
  } catch {
    return null
  }
}

function searchContext(query: string, pages: any[]): any[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  const scored = pages.map(page => {
    const text = `${page.title} ${page.description} ${page.content}`.toLowerCase()
    let score = 0
    for (const term of terms) {
      const regex = new RegExp(term, 'gi')
      const matches = text.match(regex)
      if (matches) score += matches.length
      // Boost title matches
      if (page.title.toLowerCase().includes(term)) score += 10
      if (page.description.toLowerCase().includes(term)) score += 5
    }
    return { ...page, score }
  })
  return scored.filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 10)
}

async function ask() {
  if (!question.value.trim() || isLoading.value) return

  const q = question.value.trim()
  question.value = ''
  answer.value = ''
  sources.value = []
  isLoading.value = true

  // Load context index
  const pages = await loadContext()
  if (!pages) {
    answer.value = 'Could not load the knowledge base. Please try again later.'
    isLoading.value = false
    return
  }

  // Search for relevant pages
  const relevant = searchContext(q, pages)

  // Even if no pages match, still ask Gemini (it'll use its own knowledge)
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, pages: relevant }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      answer.value = `Error: ${err.error || 'Failed to get response'}. The AI service may not be configured yet.`
      isLoading.value = false
      chatHistory.value.push({ q, a: answer.value, sources: [] })
      return
    }

    // Stream the response
    const reader = res.body?.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (reader) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.text) {
            answer.value += parsed.text
            await nextTick()
            scrollToBottom()
          }
        } catch {}
      }
    }

    // Extract sources from the answer (markdown links)
    const sourceMatches = answer.value.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)
    const seenPaths = new Set<string>()
    for (const match of sourceMatches) {
      if (match[2].startsWith('/') && !seenPaths.has(match[2])) {
        seenPaths.add(match[2])
        sources.value.push({ title: match[1], path: match[2] })
      }
    }

    chatHistory.value.push({ q, a: answer.value, sources: [...sources.value] })
  } catch (e: any) {
    answer.value = `Connection error: ${e.message}. Please check your internet connection.`
    chatHistory.value.push({ q, a: answer.value, sources: [] })
  }

  isLoading.value = false
}

function scrollToBottom() {
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
}

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    nextTick(() => {
      const input = document.querySelector('.ask-ai-input') as HTMLInputElement
      input?.focus()
    })
  }
}

onMounted(() => {
  // Preload context in background
  setTimeout(loadContext, 3000)
})
</script>

<template>
  <!-- Floating button -->
  <button class="ask-ai-fab" @click="toggle" :class="{ open: isOpen }" aria-label="Ask AI">
    <svg v-if="!isOpen" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <path d="M8 10h.01M12 10h.01M16 10h.01"/>
    </svg>
    <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  </button>

  <!-- Chat panel -->
  <Teleport to="body">
    <Transition name="chat-slide">
      <div v-if="isOpen" class="ask-ai-panel">
        <div class="ask-ai-header">
          <div class="ask-ai-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
            Ask Archon
          </div>
          <button class="ask-ai-close" @click="isOpen = false" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="ask-ai-messages" ref="messagesEl">
          <div v-if="chatHistory.length === 0 && !isLoading && !answer" class="ask-ai-welcome">
            <p>Ask anything about system design, architecture, security, DevOps, or any topic covered in the vault.</p>
            <div class="ask-ai-suggestions">
              <button @click="question = 'How does consistent hashing work?'; ask()">How does consistent hashing work?</button>
              <button @click="question = 'Compare Kafka vs RabbitMQ'; ask()">Compare Kafka vs RabbitMQ</button>
              <button @click="question = 'Explain the CAP theorem'; ask()">Explain the CAP theorem</button>
            </div>
          </div>

          <template v-for="(msg, i) in chatHistory" :key="i">
            <div class="ask-ai-msg user">{{ msg.q }}</div>
            <div class="ask-ai-msg assistant" v-html="formatAnswer(msg.a)"></div>
          </template>

          <div v-if="isLoading && !answer" class="ask-ai-msg assistant loading">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
          <div v-else-if="answer && isLoading" class="ask-ai-msg assistant" v-html="formatAnswer(answer)"></div>
        </div>

        <form class="ask-ai-input-area" @submit.prevent="ask">
          <input
            v-model="question"
            class="ask-ai-input"
            placeholder="Ask about system design, architecture..."
            :disabled="isLoading"
            autocomplete="off"
          />
          <button type="submit" class="ask-ai-send" :disabled="isLoading || !question.trim()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
function formatAnswer(text: string): string {
  // Basic markdown → HTML conversion for the chat
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
</script>

<style>
/* Floating Action Button */
.ask-ai-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 100;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, var(--vp-c-brand-1, #5f67ee), #42d392);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(95, 103, 238, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.ask-ai-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 24px rgba(95, 103, 238, 0.4);
}

.ask-ai-fab.open {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Chat Panel */
.ask-ai-panel {
  position: fixed;
  bottom: 88px;
  right: 24px;
  z-index: 100;
  width: 400px;
  max-height: 520px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dark .ask-ai-panel {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* Header */
.ask-ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.ask-ai-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.ask-ai-close {
  background: none;
  border: none;
  color: var(--vp-c-text-3);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.15s;
}

.ask-ai-close:hover {
  color: var(--vp-c-text-1);
}

/* Messages area */
.ask-ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
  max-height: 350px;
}

.ask-ai-welcome {
  text-align: center;
  color: var(--vp-c-text-3);
  padding: 20px 0;
}

.ask-ai-welcome p {
  font-size: 13px;
  margin-bottom: 16px;
  line-height: 1.6;
}

.ask-ai-suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ask-ai-suggestions button {
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: all 0.15s;
}

.ask-ai-suggestions button:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

/* Messages */
.ask-ai-msg {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  max-width: 90%;
}

.ask-ai-msg.user {
  background: var(--vp-c-brand-1);
  color: white;
  align-self: flex-end;
  border-bottom-right-radius: 4px;
}

.ask-ai-msg.assistant {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  align-self: flex-start;
  border-bottom-left-radius: 4px;
}

.ask-ai-msg.assistant a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
  font-weight: 500;
}

.ask-ai-msg.assistant a:hover {
  text-decoration: underline;
}

.ask-ai-msg.assistant code {
  background: var(--vp-c-bg-mute, rgba(0, 0, 0, 0.06));
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}

.ask-ai-msg.assistant ul {
  margin: 4px 0;
  padding-left: 16px;
}

/* Loading dots */
.ask-ai-msg.loading {
  display: flex;
  gap: 4px;
  padding: 14px 18px;
}

.dot {
  width: 6px;
  height: 6px;
  background: var(--vp-c-text-3);
  border-radius: 50%;
  animation: dot-pulse 1.4s ease-in-out infinite;
}

.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-pulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* Input area */
.ask-ai-input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--vp-c-divider);
}

.ask-ai-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}

.ask-ai-input:focus {
  border-color: var(--vp-c-brand-1);
}

.ask-ai-send {
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: opacity 0.15s;
}

.ask-ai-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ask-ai-send:not(:disabled):hover {
  opacity: 0.9;
}

/* Transition */
.chat-slide-enter-active { transition: all 0.2s ease-out; }
.chat-slide-leave-active { transition: all 0.15s ease-in; }
.chat-slide-enter-from { opacity: 0; transform: translateY(16px) scale(0.95); }
.chat-slide-leave-to { opacity: 0; transform: translateY(8px) scale(0.98); }

/* Mobile */
@media (max-width: 640px) {
  .ask-ai-panel {
    width: calc(100vw - 32px);
    right: 16px;
    bottom: 80px;
    max-height: 70vh;
  }

  .ask-ai-fab {
    bottom: 16px;
    right: 16px;
  }
}
</style>
