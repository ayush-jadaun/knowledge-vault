<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

function scrollToActive() {
  // Wait for DOM to update
  setTimeout(() => {
    const sidebar = document.querySelector('.VPSidebar')
    if (!sidebar) return

    const activeLink = sidebar.querySelector('a.active')
    if (!activeLink) return

    activeLink.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    })
  }, 200)
}

onMounted(scrollToActive)

watch(() => route.path, scrollToActive)
</script>

<template>
  <div class="sidebar-scroll-provider" />
</template>
