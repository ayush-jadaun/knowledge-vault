<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const active = ref(false)
const rulerY = ref(0)

function handleMouseMove(e: MouseEvent) {
  if (!active.value) return
  rulerY.value = e.clientY
}

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove)
})
</script>

<template>
  <button
    class="ruler-toggle"
    :class="{ active }"
    @click="active = !active"
    title="Reading ruler"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  </button>
  <div
    v-if="active"
    class="reading-ruler"
    :style="{ top: rulerY + 'px' }"
  />
</template>

<style>
.ruler-toggle {
  position: fixed;
  top: 182px;
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
  transition: all 0.15s;
}

.ruler-toggle:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.ruler-toggle.active {
  background: var(--vp-c-brand-1);
  color: white;
  border-color: var(--vp-c-brand-1);
}

.reading-ruler {
  position: fixed;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--vp-c-brand-1);
  opacity: 0.35;
  z-index: 49;
  pointer-events: none;
  transition: top 0.05s linear;
}

@media (max-width: 768px) {
  .ruler-toggle { display: none !important; }
  .reading-ruler { display: none !important; }
}
</style>
