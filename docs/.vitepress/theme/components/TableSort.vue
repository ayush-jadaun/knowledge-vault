<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()

function setupSortableTables() {
  setTimeout(() => {
    const tables = document.querySelectorAll('.vp-doc table')
    tables.forEach(table => {
      if (table.getAttribute('data-sortable') === 'true') return
      table.setAttribute('data-sortable', 'true')

      const headers = table.querySelectorAll('th')
      if (headers.length === 0) return

      headers.forEach((th, colIndex) => {
        th.style.cursor = 'pointer'
        th.style.userSelect = 'none'
        th.style.position = 'relative'
        th.setAttribute('aria-sort', 'none')
        th.setAttribute('role', 'columnheader')
        th.setAttribute('tabindex', '0')

        // Add sort indicator
        const indicator = document.createElement('span')
        indicator.className = 'sort-indicator'
        indicator.setAttribute('aria-hidden', 'true')
        th.appendChild(indicator)

        const sortHandler = () => {
          const tbody = table.querySelector('tbody') || table
          const rows = Array.from(tbody.querySelectorAll('tr')).filter(
            row => row.querySelector('td')
          )

          // Determine current sort direction
          const currentDir = th.getAttribute('data-sort-dir') || 'none'
          const newDir = currentDir === 'asc' ? 'desc' : 'asc'

          // Clear all headers
          headers.forEach(h => {
            h.setAttribute('data-sort-dir', 'none')
            h.setAttribute('aria-sort', 'none')
            const ind = h.querySelector('.sort-indicator')
            if (ind) ind.textContent = ''
          })

          th.setAttribute('data-sort-dir', newDir)
          th.setAttribute('aria-sort', newDir === 'asc' ? 'ascending' : 'descending')
          const ind = th.querySelector('.sort-indicator')
          if (ind) ind.textContent = newDir === 'asc' ? ' \u25B2' : ' \u25BC'

          rows.sort((a, b) => {
            const cellA = a.querySelectorAll('td')[colIndex]?.textContent?.trim() || ''
            const cellB = b.querySelectorAll('td')[colIndex]?.textContent?.trim() || ''

            // Try numeric comparison
            const numA = parseFloat(cellA.replace(/[^0-9.\-]/g, ''))
            const numB = parseFloat(cellB.replace(/[^0-9.\-]/g, ''))

            if (!isNaN(numA) && !isNaN(numB)) {
              return newDir === 'asc' ? numA - numB : numB - numA
            }

            // String comparison
            return newDir === 'asc'
              ? cellA.localeCompare(cellB)
              : cellB.localeCompare(cellA)
          })

          // Re-append sorted rows
          const parent = rows[0]?.parentElement
          if (parent) {
            rows.forEach(row => parent.appendChild(row))
          }
        }

        th.addEventListener('click', sortHandler)
        th.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            sortHandler()
          }
        })
      })
    })
  }, 500)
}

onMounted(() => {
  setupSortableTables()
})

watch(() => route.path, () => {
  setupSortableTables()
})
</script>

<template>
  <div class="table-sort-provider" />
</template>

<style>
.vp-doc th .sort-indicator {
  font-size: 10px;
  opacity: 0.6;
  margin-left: 4px;
}

.vp-doc th[data-sort-dir="asc"] .sort-indicator,
.vp-doc th[data-sort-dir="desc"] .sort-indicator {
  opacity: 1;
  color: var(--vp-c-brand-1);
}

.vp-doc th[data-sortable="true"]:hover,
.vp-doc table[data-sortable="true"] th:hover {
  color: var(--vp-c-brand-1);
}
</style>
