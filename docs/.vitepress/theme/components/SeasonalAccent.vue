<script setup lang="ts">
import { onMounted } from 'vue'

onMounted(() => {
  const month = new Date().getMonth()
  let accent: string

  if (month >= 3 && month <= 5) {
    // Spring: green
    accent = '#42b983'
  } else if (month >= 6 && month <= 8) {
    // Summer: warm gold
    accent = '#e6a23c'
  } else if (month >= 9 && month <= 11) {
    // Autumn: orange
    accent = '#e67e22'
  } else {
    // Winter: cool blue
    accent = '#3b82f6'
  }

  document.documentElement.style.setProperty('--kv-seasonal-accent', accent)
})
</script>

<template><span style="display:none" /></template>
