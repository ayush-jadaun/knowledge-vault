<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const label = ref('')
const tier = ref('')

function calculate() {
  nextTick(() => {
    setTimeout(() => {
      const content = document.querySelector('.vp-doc div[class*="content"]') || document.querySelector('.vp-doc')
      if (!content) return
      const text = content.textContent || ''
      const words = text.split(/\s+/).filter(Boolean).length
      const minutes = Math.max(1, Math.ceil(words / 200))

      if (minutes < 5) {
        label.value = 'Quick read'
        tier.value = 'quick'
      } else if (minutes <= 15) {
        label.value = 'Standard'
        tier.value = 'standard'
      } else {
        label.value = 'Deep dive'
        tier.value = 'deep'
      }
    }, 150)
  })
}

onMounted(calculate)
watch(() => route.path, calculate)
</script>

<template>
  <span v-if="label" :class="['page-weight-badge', tier]">{{ label }}</span>
</template>

<style scoped>
.page-weight-badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
  margin-left: 8px;
  vertical-align: middle;
}

.page-weight-badge.quick {
  background: rgba(66, 185, 131, 0.1);
  color: #42b983;
}

.page-weight-badge.standard {
  background: rgba(95, 103, 238, 0.1);
  color: var(--vp-c-brand-1);
}

.page-weight-badge.deep {
  background: rgba(245, 108, 108, 0.12);
  color: #f56c6c;
}
</style>
