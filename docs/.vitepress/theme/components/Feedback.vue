<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const voted = ref(false)
const vote = ref<'up' | 'down' | null>(null)

const STORAGE_KEY = 'kv-feedback'

function loadVote() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const path = route.path.replace(/\.html$/, '')
    if (stored[path]) {
      voted.value = true
      vote.value = stored[path]
    } else {
      voted.value = false
      vote.value = null
    }
  } catch {}
}

function submitVote(v: 'up' | 'down') {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const path = route.path.replace(/\.html$/, '')
    stored[path] = v
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    vote.value = v
    voted.value = true
  } catch {}
}

onMounted(loadVote)
</script>

<template>
  <div class="feedback-widget">
    <div v-if="!voted" class="feedback-ask">
      <span class="feedback-text">Was this page helpful?</span>
      <div class="feedback-buttons">
        <button class="feedback-btn" @click="submitVote('up')" aria-label="Yes, helpful">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
          </svg>
          Yes
        </button>
        <button class="feedback-btn" @click="submitVote('down')" aria-label="No, not helpful">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
          </svg>
          No
        </button>
      </div>
    </div>
    <div v-else class="feedback-thanks">
      <span v-if="vote === 'up'">Thanks for the feedback!</span>
      <span v-else>Thanks — we'll work on improving this page.</span>
    </div>
  </div>
</template>

<style scoped>
.feedback-widget {
  margin-top: 40px;
  padding: 20px 0;
  border-top: 1px solid var(--vp-c-divider);
}

.feedback-ask {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.feedback-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.feedback-buttons {
  display: flex;
  gap: 8px;
}

.feedback-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}

.feedback-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.feedback-thanks {
  font-size: 14px;
  color: var(--vp-c-text-3);
  font-style: italic;
}
</style>
