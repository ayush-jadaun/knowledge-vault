<script setup lang="ts">
import { onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

function addPageCounts() {
  nextTick(() => {
    setTimeout(() => {
      // Find all sidebar groups (sections with collapsible items)
      const groups = document.querySelectorAll('.VPSidebar .VPSidebarItem.level-0')

      groups.forEach(group => {
        const titleEl = group.querySelector(':scope > .item > .text')
        if (!titleEl) return

        // Skip if already has a count badge
        if (titleEl.querySelector('.sidebar-page-count')) return

        // Count child links in this group
        const links = group.querySelectorAll('.items a.link')
        const count = links.length
        if (count === 0) return

        const badge = document.createElement('span')
        badge.className = 'sidebar-page-count'
        badge.textContent = `${count}`
        badge.title = `${count} pages`
        titleEl.appendChild(badge)
      })
    }, 400)
  })
}

onMounted(addPageCounts)
watch(() => route.path, addPageCounts)
</script>

<template>
  <div class="sidebar-page-count-provider" />
</template>

<style>
.sidebar-page-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 500;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
  padding: 0 5px;
  border-radius: 8px;
  margin-left: 6px;
  min-width: 18px;
  height: 16px;
  line-height: 1;
  flex-shrink: 0;
}
</style>
