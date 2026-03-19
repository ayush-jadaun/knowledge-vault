<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const isBookmarked = ref(false)
const STORAGE_KEY = 'kv-bookmarks'

function getBookmarks(): Array<{ path: string; title: string; date: string }> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function checkBookmark() {
  const path = route.path.replace(/\.html$/, '')
  isBookmarked.value = getBookmarks().some(b => b.path === path)
}

function toggleBookmark() {
  const path = route.path.replace(/\.html$/, '')
  const title = document.querySelector('h1')?.textContent || 'Untitled'
  let bookmarks = getBookmarks()

  if (isBookmarked.value) {
    bookmarks = bookmarks.filter(b => b.path !== path)
  } else {
    bookmarks.unshift({ path, title, date: new Date().toISOString().split('T')[0] })
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks))
  isBookmarked.value = !isBookmarked.value
}

onMounted(checkBookmark)
watch(() => route.path, checkBookmark)
</script>

<template>
  <button class="bookmark-btn" @click="toggleBookmark" :class="{ active: isBookmarked }" :title="isBookmarked ? 'Remove bookmark' : 'Bookmark this page'">
    <svg width="16" height="16" viewBox="0 0 24 24" :fill="isBookmarked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  </button>
</template>

<style scoped>
.bookmark-btn {
  display: inline-flex; align-items: center; padding: 4px; border: none;
  background: none; color: var(--vp-c-text-3); cursor: pointer; border-radius: 4px;
  transition: all 0.15s; margin-left: 8px;
}
.bookmark-btn:hover { color: var(--vp-c-brand-1); }
.bookmark-btn.active { color: var(--vp-c-brand-1); }
</style>
