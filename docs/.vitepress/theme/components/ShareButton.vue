<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useData } from 'vitepress'

const { page, frontmatter } = useData()
const open = ref(false)
const copied = ref(false)
const btnRef = ref<HTMLElement>()

function getUrl() {
  if (typeof window === 'undefined') return ''
  return window.location.href
}

function getTitle() {
  return frontmatter.value.title || page.value.title || document.title
}

function toggle() {
  open.value = !open.value
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(getUrl())
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = getUrl()
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

function shareTwitter() {
  const text = encodeURIComponent(`${getTitle()} — Archon`)
  const url = encodeURIComponent(getUrl())
  window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener')
  open.value = false
}

function shareLinkedIn() {
  const url = encodeURIComponent(getUrl())
  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank', 'noopener')
  open.value = false
}

function onClickOutside(e: MouseEvent) {
  if (btnRef.value && !btnRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))
</script>

<template>
  <div class="share-btn-wrapper" ref="btnRef">
    <button class="share-trigger" @click="toggle" title="Share this page" aria-label="Share this page">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    </button>
    <div v-if="open" class="share-dropdown">
      <button class="share-option" @click="copyLink">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        {{ copied ? 'Copied!' : 'Copy link' }}
      </button>
      <button class="share-option" @click="shareTwitter">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        Share on X
      </button>
      <button class="share-option" @click="shareLinkedIn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
        Share on LinkedIn
      </button>
    </div>
  </div>
</template>

<style scoped>
.share-btn-wrapper {
  position: relative;
  display: inline-block;
}

.share-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.share-trigger:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.share-dropdown {
  position: absolute;
  right: 0;
  top: 38px;
  z-index: 100;
  min-width: 170px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.share-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  color: var(--vp-c-text-1);
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.15s;
}

.share-option:hover {
  background: var(--vp-c-bg-soft);
}
</style>
