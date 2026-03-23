<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { withBase } from 'vitepress'

const searchQuery = ref('')
const searchInitialized = ref(false)

const popularPages = [
  { title: 'System Design Overview', link: '/system-design/' },
  { title: 'Architecture Patterns', link: '/architecture-patterns/' },
  { title: 'Distributed Systems', link: '/system-design/distributed-systems/' },
  { title: 'DevOps', link: '/devops/' },
  { title: 'Learning Paths', link: '/learning-paths/' },
]

async function initPagefind() {
  try {
    // @ts-ignore
    const pf = await import(/* @vite-ignore */ '/pagefind/pagefind.js')
    await pf.init()
    searchInitialized.value = true
  } catch {
    // Pagefind only available after build
  }
}

function triggerSearch() {
  // Try to trigger the global Pagefind search UI
  const searchBtn = document.querySelector('.pagefind-ui__search-input, .search-btn, [data-pagefind-search]') as HTMLInputElement
  if (searchBtn) {
    searchBtn.focus()
    if (searchQuery.value) {
      searchBtn.value = searchQuery.value
      searchBtn.dispatchEvent(new Event('input', { bubbles: true }))
    }
  } else {
    // Fallback: navigate to home with search
    if (searchQuery.value) {
      window.location.href = withBase(`/?q=${encodeURIComponent(searchQuery.value)}`)
    }
  }
}

onMounted(() => {
  initPagefind()
})
</script>

<template>
  <div class="not-found">
    <div class="not-found-content">
      <p class="code">404</p>
      <h1 class="title">Page not found</h1>
      <p class="message">The page you're looking for doesn't exist or has been moved.</p>

      <form class="search-form" @submit.prevent="triggerSearch">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search Archon..."
          aria-label="Search"
        />
        <button type="submit" class="search-submit">Search</button>
      </form>

      <div class="popular-section">
        <p class="popular-heading">Popular pages</p>
        <ul class="popular-list">
          <li v-for="p in popularPages" :key="p.link">
            <a :href="withBase(p.link)">{{ p.title }}</a>
          </li>
        </ul>
      </div>

      <a :href="withBase('/')" class="home-link">Go Home</a>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  padding: 32px 24px;
}

.not-found-content {
  text-align: center;
  max-width: 440px;
}

.code {
  font-size: 4rem;
  font-weight: 700;
  color: var(--vp-c-brand-1);
  margin: 0;
  line-height: 1;
}

.title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin: 12px 0 8px;
}

.message {
  font-size: 14px;
  color: var(--vp-c-text-2);
  margin: 0 0 24px;
}

.search-form {
  display: flex;
  gap: 8px;
  margin-bottom: 28px;
}

.search-input {
  flex: 1;
  padding: 8px 14px;
  font-size: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--vp-c-brand-1);
}

.search-submit {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: #fff;
  cursor: pointer;
  transition: opacity 0.2s;
}

.search-submit:hover {
  opacity: 0.9;
}

.popular-section {
  margin-bottom: 28px;
  text-align: left;
}

.popular-heading {
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px;
}

.popular-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.popular-list li {
  margin: 0;
}

.popular-list a {
  display: block;
  padding: 6px 0;
  font-size: 14px;
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: color 0.15s;
}

.popular-list a:hover {
  color: var(--vp-c-brand-1);
}

.home-link {
  display: inline-block;
  padding: 8px 24px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 8px;
  text-decoration: none;
  transition: background-color 0.2s, color 0.2s;
}

.home-link:hover {
  background: var(--vp-c-brand-1);
  color: #fff;
}
</style>
