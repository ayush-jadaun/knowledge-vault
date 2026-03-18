<script setup lang="ts">
import { ref, computed } from 'vue'
import tagData from '../data/tags.json'

const selectedTag = ref<string | null>(null)
const searchQuery = ref('')
const selectedDifficulty = ref<string>('all')

const allTags = computed(() => {
  return Object.entries(tagData.tags as Record<string, Array<{ title: string; path: string; difficulty: string }>>)
    .map(([name, pages]) => ({ name, count: pages.length }))
    .sort((a, b) => b.count - a.count)
})

const filteredTags = computed(() => {
  if (!searchQuery.value) return allTags.value
  const q = searchQuery.value.toLowerCase()
  return allTags.value.filter(t => t.name.toLowerCase().includes(q))
})

const selectedPages = computed(() => {
  if (!selectedTag.value) return []
  const pages = (tagData.tags as Record<string, Array<{ title: string; path: string; difficulty: string }>>)[selectedTag.value] || []
  if (selectedDifficulty.value === 'all') return pages
  return pages.filter(p => p.difficulty === selectedDifficulty.value)
})

const tagSize = (count: number) => {
  const max = allTags.value[0]?.count || 1
  const ratio = count / max
  if (ratio > 0.5) return 'tag-xl'
  if (ratio > 0.25) return 'tag-lg'
  if (ratio > 0.1) return 'tag-md'
  return 'tag-sm'
}

const difficultyColor = (d: string) => {
  switch (d) {
    case 'beginner': return '#42b983'
    case 'intermediate': return '#e6a23c'
    case 'advanced': return '#f56c6c'
    case 'expert': return '#9b59b6'
    default: return '#909399'
  }
}

const resultsRef = ref<HTMLElement | null>(null)

function selectTag(tag: string) {
  selectedTag.value = selectedTag.value === tag ? null : tag
  if (selectedTag.value) {
    // Scroll results into view
    setTimeout(() => {
      resultsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }
}
</script>

<template>
  <div class="tag-browse">
    <div class="tag-stats">
      <span class="stat">{{ tagData.totalPages }} pages</span>
      <span class="stat-sep">/</span>
      <span class="stat">{{ tagData.totalTags }} tags</span>
    </div>

    <div class="tag-search">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search tags..."
        class="tag-search-input"
      />
    </div>

    <!-- Results shown ABOVE tag cloud when a tag is selected -->
    <div v-if="selectedTag" ref="resultsRef" class="tag-results">
      <div class="tag-results-header">
        <h2>Pages tagged "{{ selectedTag }}"</h2>
        <button class="clear-tag" @click="selectedTag = null">Clear</button>
        <div class="difficulty-filter">
          <button
            v-for="d in ['all', 'beginner', 'intermediate', 'advanced', 'expert']"
            :key="d"
            :class="['diff-btn', { active: selectedDifficulty === d }]"
            @click="selectedDifficulty = d"
          >
            {{ d }}
          </button>
        </div>
      </div>

      <div class="results-list">
        <a
          v-for="page in selectedPages"
          :key="page.path"
          :href="page.path"
          class="result-item"
        >
          <span class="result-title">{{ page.title }}</span>
          <span
            v-if="page.difficulty"
            class="result-difficulty"
            :style="{ color: difficultyColor(page.difficulty) }"
          >
            {{ page.difficulty }}
          </span>
        </a>
        <p v-if="selectedPages.length === 0" class="no-results">
          No pages match this filter.
        </p>
      </div>
    </div>

    <!-- Tag cloud (collapsed to max-height when results are showing) -->
    <div :class="['tag-cloud', { collapsed: !!selectedTag }]">
      <button
        v-for="tag in filteredTags"
        :key="tag.name"
        :class="['tag-pill', tagSize(tag.count), { active: selectedTag === tag.name }]"
        @click="selectTag(tag.name)"
      >
        {{ tag.name }}
        <span class="tag-count">{{ tag.count }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tag-browse {
  max-width: 900px;
  margin: 0 auto;
}

.tag-stats {
  text-align: center;
  margin-bottom: 20px;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.stat-sep {
  margin: 0 8px;
  color: var(--vp-c-divider);
}

.tag-search {
  margin-bottom: 20px;
}

.tag-search-input {
  width: 100%;
  padding: 10px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  font-size: 14px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  outline: none;
  transition: border-color 0.2s;
}

.tag-search-input:focus {
  border-color: var(--vp-c-brand-1);
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 32px;
  padding: 16px;
  background: var(--vp-c-bg-soft);
  border-radius: 12px;
  max-height: 600px;
  overflow-y: auto;
  transition: max-height 0.3s;
}

.tag-cloud.collapsed {
  max-height: 150px;
  overflow-y: auto;
}

.clear-tag {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}

.clear-tag:hover {
  border-color: #f56c6c;
  color: #f56c6c;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.tag-pill:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.tag-pill.active {
  background: var(--vp-c-brand-1);
  color: #fff;
  border-color: var(--vp-c-brand-1);
}

.tag-pill.active .tag-count {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.tag-sm { font-size: 12px; }
.tag-md { font-size: 13px; }
.tag-lg { font-size: 14px; font-weight: 500; }
.tag-xl { font-size: 15px; font-weight: 600; }

.tag-count {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3);
}

.tag-results {
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 20px;
}

.tag-results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.tag-results-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  border: none;
  padding: 0;
}

.difficulty-filter {
  display: flex;
  gap: 4px;
}

.diff-btn {
  padding: 4px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  text-transform: capitalize;
  transition: all 0.2s;
}

.diff-btn:hover {
  border-color: var(--vp-c-brand-1);
}

.diff-btn.active {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--vp-c-text-1);
  transition: background 0.2s;
}

.result-item:hover {
  background: var(--vp-c-bg-soft);
}

.result-title {
  font-size: 14px;
}

.result-difficulty {
  font-size: 12px;
  font-weight: 500;
  text-transform: capitalize;
}

.no-results {
  color: var(--vp-c-text-3);
  text-align: center;
  padding: 20px;
}

@media (max-width: 640px) {
  .tag-results-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .difficulty-filter {
    flex-wrap: wrap;
  }
}
</style>
