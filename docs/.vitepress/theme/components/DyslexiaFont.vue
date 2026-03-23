<script setup lang="ts">
import { ref, onMounted } from 'vue'

const DF_KEY = 'kv-dyslexia-font'
const enabled = ref(false)
let fontLoaded = false

function loadFont() {
  if (fontLoaded) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.cdnfonts.com/css/opendyslexic'
  document.head.appendChild(link)
  fontLoaded = true
}

function toggle() {
  enabled.value = !enabled.value
  if (enabled.value) loadFont()
  document.body.classList.toggle('dyslexia-font', enabled.value)
  try { localStorage.setItem(DF_KEY, String(enabled.value)) } catch {}
}

onMounted(() => {
  try {
    enabled.value = localStorage.getItem(DF_KEY) === 'true'
    if (enabled.value) {
      loadFont()
      document.body.classList.add('dyslexia-font')
    }
  } catch {}
})
</script>

<template>
  <Teleport to="body">
    <button class="a11y-btn df-btn" :class="{ active: enabled }" @click="toggle" title="Dyslexia-friendly font" aria-label="Toggle dyslexia-friendly font">
      <span style="font-size: 12px; font-weight: 700; line-height: 1;">Dy</span>
    </button>
  </Teleport>
</template>

<style>
/* Dyslexia font override — only .vp-doc content */
body.dyslexia-font .vp-doc {
  font-family: 'OpenDyslexic', sans-serif !important;
}

body.dyslexia-font .vp-doc p,
body.dyslexia-font .vp-doc li,
body.dyslexia-font .vp-doc td,
body.dyslexia-font .vp-doc th,
body.dyslexia-font .vp-doc blockquote,
body.dyslexia-font .vp-doc h1,
body.dyslexia-font .vp-doc h2,
body.dyslexia-font .vp-doc h3,
body.dyslexia-font .vp-doc h4 {
  font-family: 'OpenDyslexic', sans-serif !important;
  letter-spacing: 0.02em;
  word-spacing: 0.1em;
  line-height: 1.8;
}
</style>
