<script setup lang="ts">
import { ref, onMounted } from 'vue'

const bookmarks = ref<Array<{ path: string; title: string; date: string }>>([])
const STORAGE_KEY = 'kv-bookmarks'

function load() {
  try { bookmarks.value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch {}
}

function remove(path: string) {
  bookmarks.value = bookmarks.value.filter(b => b.path !== path)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks.value))
}

function clearAll() {
  bookmarks.value = []
  localStorage.setItem(STORAGE_KEY, '[]')
}

onMounted(load)
</script>

<template>
  <div class="bookmarks-list">
    <div v-if="bookmarks.length === 0" class="bookmarks-empty">
      <p>No bookmarks yet. Click the bookmark icon on any page to save it here.</p>
    </div>
    <div v-else>
      <div class="bookmarks-header">
        <span>{{ bookmarks.length }} saved page{{ bookmarks.length !== 1 ? 's' : '' }}</span>
        <button class="clear-btn" @click="clearAll">Clear all</button>
      </div>
      <div class="bookmarks-grid">
        <div v-for="b in bookmarks" :key="b.path" class="bookmark-card">
          <a :href="b.path" class="bookmark-title">{{ b.title }}</a>
          <div class="bookmark-meta">
            <span class="bookmark-path">{{ b.path }}</span>
            <span class="bookmark-date">{{ b.date }}</span>
          </div>
          <button class="bookmark-remove" @click="remove(b.path)" title="Remove">&times;</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bookmarks-empty { text-align: center; padding: 40px; color: var(--vp-c-text-3); }
.bookmarks-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.bookmarks-header span { font-size: 14px; color: var(--vp-c-text-2); }
.clear-btn { padding: 4px 12px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg); color: var(--vp-c-text-3); font-size: 12px; cursor: pointer; font-family: inherit; }
.clear-btn:hover { border-color: #ef4444; color: #ef4444; }
.bookmarks-grid { display: flex; flex-direction: column; gap: 8px; }
.bookmark-card { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px; transition: border-color 0.15s; position: relative; }
.bookmark-card:hover { border-color: var(--vp-c-brand-1); }
.bookmark-title { font-size: 14px; font-weight: 600; color: var(--vp-c-text-1); text-decoration: none; flex: 1; }
.bookmark-title:hover { color: var(--vp-c-brand-1); }
.bookmark-meta { display: flex; gap: 12px; }
.bookmark-path { font-size: 12px; color: var(--vp-c-text-3); font-family: monospace; }
.bookmark-date { font-size: 12px; color: var(--vp-c-text-3); }
.bookmark-remove { background: none; border: none; color: var(--vp-c-text-3); font-size: 18px; cursor: pointer; padding: 0 4px; }
.bookmark-remove:hover { color: #ef4444; }
</style>
