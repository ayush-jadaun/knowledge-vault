<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const progress = ref<Record<string, string[]>>({})

const STORAGE_KEY = 'kv-reading-progress'

const paths: Record<string, { label: string; pages: string[] }> = {
  'backend': {
    label: 'Backend Engineer',
    pages: [
      '/system-design/databases/', '/system-design/databases/storage-engines', '/system-design/databases/write-ahead-logging',
      '/system-design/databases/mvcc', '/system-design/databases/isolation-levels', '/system-design/databases/indexing-deep-dive',
      '/system-design/databases/connection-pooling', '/system-design/databases/replication', '/system-design/databases/sharding',
      '/system-design/caching/', '/system-design/caching/caching-strategies', '/system-design/caching/cache-invalidation',
      '/system-design/message-queues/', '/system-design/message-queues/kafka-internals',
      '/architecture-patterns/microservices/', '/architecture-patterns/domain-driven-design/',
      '/architecture-patterns/cqrs-event-sourcing/',
    ],
  },
  'devops': {
    label: 'DevOps Engineer',
    pages: [
      '/infrastructure/docker/', '/infrastructure/docker/internals', '/infrastructure/docker/multi-stage-builds',
      '/infrastructure/kubernetes/', '/infrastructure/kubernetes/pod-lifecycle', '/infrastructure/kubernetes/helm-charts',
      '/infrastructure/terraform/', '/infrastructure/terraform/fundamentals',
      '/infrastructure/ci-cd/', '/infrastructure/ci-cd/github-actions-deep-dive',
      '/devops/monitoring/', '/devops/logging/', '/devops/alerting/',
      '/devops/deployment-strategies/', '/devops/incident-response/',
    ],
  },
  'interview': {
    label: 'System Design Interview',
    pages: [
      '/system-design/distributed-systems/', '/system-design/distributed-systems/cap-theorem',
      '/system-design/databases/', '/system-design/caching/',
      '/system-design/message-queues/', '/system-design/load-balancing/',
      '/system-design-interviews/', '/system-design-interviews/url-shortener',
      '/system-design-interviews/instagram', '/system-design-interviews/chat-system',
      '/system-design-interviews/youtube', '/system-design-interviews/uber',
    ],
  },
}

function loadProgress() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) progress.value = JSON.parse(stored)
  } catch {}
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress.value))
  } catch {}
}

function markAsRead(path: string) {
  for (const [key, config] of Object.entries(paths)) {
    if (config.pages.includes(path)) {
      if (!progress.value[key]) progress.value[key] = []
      if (!progress.value[key].includes(path)) {
        progress.value[key].push(path)
        saveProgress()
      }
    }
  }
}

function getPathProgress(key: string): number {
  const config = paths[key]
  if (!config) return 0
  const read = progress.value[key]?.length || 0
  return Math.round((read / config.pages.length) * 100)
}

const currentPagePaths = computed(() => {
  const current = route.path.replace(/\.html$/, '')
  return Object.entries(paths)
    .filter(([_, config]) => config.pages.includes(current))
    .map(([key]) => key)
})

const showWidget = computed(() => currentPagePaths.value.length > 0)

onMounted(() => {
  loadProgress()
  // Mark current page as read after 30 seconds
  setTimeout(() => {
    const current = route.path.replace(/\.html$/, '')
    markAsRead(current)
  }, 30000)
})

watch(() => route.path, () => {
  setTimeout(() => {
    const current = route.path.replace(/\.html$/, '')
    markAsRead(current)
  }, 30000)
})
</script>

<template>
  <div v-if="showWidget" class="reading-progress-widget">
    <div v-for="key in currentPagePaths" :key="key" class="path-progress">
      <div class="path-header">
        <span class="path-label">{{ paths[key].label }}</span>
        <span class="path-percent">{{ getPathProgress(key) }}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: getPathProgress(key) + '%' }"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reading-progress-widget {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  margin-bottom: 16px;
  border: 1px solid var(--vp-c-divider);
}

.path-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.path-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.path-percent {
  font-size: 12px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
}

.progress-bar {
  height: 4px;
  background: var(--vp-c-divider);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--vp-c-brand-1), #42d392);
  border-radius: 2px;
  transition: width 0.5s ease;
}
</style>
