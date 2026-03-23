<script setup lang="ts">
import { ref, onMounted } from 'vue'

const HC_KEY = 'kv-high-contrast'
const enabled = ref(false)

function toggle() {
  enabled.value = !enabled.value
  document.body.classList.toggle('high-contrast', enabled.value)
  try { localStorage.setItem(HC_KEY, String(enabled.value)) } catch {}
}

onMounted(() => {
  try {
    enabled.value = localStorage.getItem(HC_KEY) === 'true'
    if (enabled.value) document.body.classList.add('high-contrast')
  } catch {}
})
</script>

<template>
  <Teleport to="body">
    <button class="a11y-btn hc-btn" :class="{ active: enabled }" @click="toggle" title="High contrast mode" aria-label="Toggle high contrast">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a10 10 0 0 1 0 20z"/>
      </svg>
    </button>
  </Teleport>
</template>

<style>
/* High contrast overrides */
body.high-contrast {
  --vp-c-text-1: #000 !important;
  --vp-c-text-2: #1a1a1a !important;
  --vp-c-text-3: #333 !important;
  --vp-c-divider: #666 !important;
  --vp-c-bg-soft: #f0f0f0 !important;
}

body.high-contrast.dark {
  --vp-c-text-1: #fff !important;
  --vp-c-text-2: #e8e8e8 !important;
  --vp-c-text-3: #ccc !important;
  --vp-c-divider: #888 !important;
  --vp-c-bg-soft: #2a2a2a !important;
}

body.high-contrast .vp-doc p,
body.high-contrast .vp-doc li,
body.high-contrast .vp-doc td {
  font-weight: 450;
}

body.high-contrast .vp-doc h1,
body.high-contrast .vp-doc h2,
body.high-contrast .vp-doc h3,
body.high-contrast .vp-doc h4 {
  font-weight: 800;
}

body.high-contrast .vp-doc a {
  text-decoration: underline;
}

body.high-contrast .vp-doc table,
body.high-contrast .vp-doc th,
body.high-contrast .vp-doc td {
  border: 1px solid var(--vp-c-divider);
}

body.high-contrast .vp-doc .custom-block {
  border-width: 2px;
}

/* Accessibility buttons — positioned below the UX toolbar */
.a11y-btn {
  position: fixed;
  right: 12px;
  z-index: 50;
  width: 32px;
  height: 32px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: all 0.15s;
}

.a11y-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.a11y-btn.active {
  background: var(--vp-c-brand-1);
  color: white;
  border-color: var(--vp-c-brand-1);
}

.hc-btn {
  top: 260px;
}

.df-btn {
  top: 296px;
}

@media (max-width: 768px) {
  .a11y-btn { display: none !important; }
}
</style>
