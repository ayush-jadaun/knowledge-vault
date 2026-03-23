<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const blockCount = ref(0)
const showToast = ref(false)

function countBlocks() {
  nextTick(() => {
    setTimeout(() => {
      const blocks = document.querySelectorAll('.vp-doc div[class*="language-"] code')
      blockCount.value = blocks.length
    }, 300)
  })
}

function copyAll() {
  const blocks = document.querySelectorAll('.vp-doc div[class*="language-"] code')
  const allCode = Array.from(blocks)
    .map(b => (b as HTMLElement).textContent?.trim() || '')
    .filter(Boolean)
    .join('\n\n')

  if (allCode) {
    navigator.clipboard.writeText(allCode)
    showToast.value = true
    setTimeout(() => { showToast.value = false }, 2000)
  }
}

onMounted(countBlocks)
watch(() => route.path, countBlocks)
</script>

<template>
  <div v-if="blockCount > 0" class="copy-all-code">
    <button class="copy-all-btn" @click="copyAll">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Copy all code ({{ blockCount }} block{{ blockCount > 1 ? 's' : '' }})
    </button>
    <Teleport to="body">
      <Transition name="toast-pop">
        <div v-if="showToast" class="toast">Copied {{ blockCount }} code block{{ blockCount > 1 ? 's' : '' }}!</div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.copy-all-code {
  margin-bottom: 12px;
}

.copy-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.copy-all-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.copy-all-btn svg {
  opacity: 0.6;
}
</style>
