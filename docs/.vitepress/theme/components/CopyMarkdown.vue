<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useData, useRoute } from 'vitepress'

const { page } = useData()
const route = useRoute()
const copied = ref(false)
const loading = ref(false)

const isContentPage = computed(() => {
  const path = route.path.replace(/\.html$/, '')
  const skipPages = ['/', '/tags', '/graph', '/compare', '/bookmarks', '/changelog', '/technology-radar', '/start-here', '/verify', '/glossary', '/404']
  return !skipPages.includes(path)
})

async function copyMarkdown() {
  if (loading.value) return
  loading.value = true

  try {
    // Construct raw markdown URL from the page's relative path
    const relativePath = page.value.relativePath
    if (!relativePath) return

    const rawUrl = `https://raw.githubusercontent.com/ayush-jadaun/knowledge-vault/main/docs/${relativePath}`
    const res = await fetch(rawUrl)
    if (!res.ok) throw new Error('Failed to fetch')

    const text = await res.text()
    await navigator.clipboard.writeText(text)

    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Fallback: copy page text content
    const doc = document.querySelector('.vp-doc')
    if (doc) {
      await navigator.clipboard.writeText(doc.textContent || '')
      copied.value = true
      setTimeout(() => { copied.value = false }, 2000)
    }
  } finally {
    loading.value = false
  }
}

watch(() => route.path, () => { copied.value = false })
</script>

<template>
  <button
    v-if="isContentPage"
    class="copy-md-btn"
    :class="{ copied }"
    :disabled="loading"
    @click="copyMarkdown"
    :title="copied ? 'Copied!' : 'Copy raw markdown'"
  >
    <svg v-if="!copied" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    <span>{{ copied ? 'Copied!' : 'Copy MD' }}</span>
  </button>
</template>

<style scoped>
.copy-md-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
  cursor: pointer;
  transition: all 0.15s;
  margin-left: 8px;
}

.copy-md-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.copy-md-btn.copied {
  border-color: #42b983;
  color: #42b983;
}

.copy-md-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}
</style>
