<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue'
import tagData from '../data/tags.json'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const tooltip = ref({ show: false, x: 0, y: 0, title: '', tags: [] as string[], path: '' })
const searchQuery = ref('')
const selectedSection = ref('all')
let animationId: number | null = null

interface Node {
  id: string
  title: string
  path: string
  section: string
  tags: string[]
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  highlighted: boolean
}

interface Link {
  source: number
  target: number
  strength: number
}

const SECTION_COLORS: Record<string, string> = {
  'system-design': '#6366f1',
  'architecture-patterns': '#8b5cf6',
  'infrastructure': '#06b6d4',
  'security': '#ef4444',
  'devops': '#f59e0b',
  'performance': '#22c55e',
  'data-engineering': '#3b82f6',
  'prompt-engineering': '#ec4899',
  'ui-design-systems': '#a855f7',
  'production-blueprints': '#14b8a6',
  'system-design-interviews': '#f97316',
  'learning-paths': '#84cc16',
  'cheat-sheets': '#64748b',
}

let nodes: Node[] = []
let links: Link[] = []
let isDragging = false
let dragNode: Node | null = null
let offsetX = 0
let offsetY = 0
let scale = 1
let panX = 0
let panY = 0
let simulationTicks = 0
let isSettled = false

function getSection(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[0] || 'other'
}

function buildGraph() {
  const pages = tagData.pages as Array<{ title: string; path: string; tags: string[]; difficulty: string }>

  // Build nodes
  nodes = pages.map((page, i) => {
    const section = getSection(page.path)
    return {
      id: page.path,
      title: page.title,
      path: page.path,
      section,
      tags: page.tags || [],
      x: Math.random() * 800 + 100,
      y: Math.random() * 600 + 100,
      vx: 0,
      vy: 0,
      radius: Math.min(8, 3 + (page.tags?.length || 0) * 0.5),
      color: SECTION_COLORS[section] || '#64748b',
      highlighted: false,
    }
  })

  // Build links based on shared tags (at least 2 shared tags)
  const tagToNodes = new Map<string, number[]>()
  nodes.forEach((node, i) => {
    for (const tag of node.tags) {
      if (!tagToNodes.has(tag)) tagToNodes.set(tag, [])
      tagToNodes.get(tag)!.push(i)
    }
  })

  const linkSet = new Set<string>()
  links = []

  for (const [, nodeIndices] of tagToNodes) {
    if (nodeIndices.length > 30) continue // Skip very common tags
    for (let i = 0; i < nodeIndices.length; i++) {
      for (let j = i + 1; j < nodeIndices.length; j++) {
        const a = Math.min(nodeIndices[i], nodeIndices[j])
        const b = Math.max(nodeIndices[i], nodeIndices[j])
        const key = `${a}-${b}`
        if (!linkSet.has(key)) {
          linkSet.add(key)
          // Count shared tags for link strength
          const shared = nodes[a].tags.filter(t => nodes[b].tags.includes(t)).length
          if (shared >= 2) {
            links.push({ source: a, target: b, strength: shared })
          }
        }
      }
    }
  }

  // Position nodes by section in clusters
  const sectionCenters: Record<string, { x: number; y: number }> = {}
  const sections = [...new Set(nodes.map(n => n.section))]
  const angleStep = (2 * Math.PI) / sections.length

  sections.forEach((section, i) => {
    sectionCenters[section] = {
      x: 500 + Math.cos(angleStep * i) * 300,
      y: 400 + Math.sin(angleStep * i) * 250,
    }
  })

  nodes.forEach(node => {
    const center = sectionCenters[node.section] || { x: 500, y: 400 }
    node.x = center.x + (Math.random() - 0.5) * 200
    node.y = center.y + (Math.random() - 0.5) * 200
  })
}

function simulate() {
  // Simple force simulation
  const REPULSION = 300
  const ATTRACTION = 0.008
  const DAMPING = 0.85
  const CENTER_PULL = 0.002

  // Repulsion between nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x
      const dy = nodes[j].y - nodes[i].y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      if (dist < 150) {
        const force = REPULSION / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        nodes[i].vx -= fx
        nodes[i].vy -= fy
        nodes[j].vx += fx
        nodes[j].vy += fy
      }
    }
  }

  // Attraction along links
  for (const link of links) {
    const a = nodes[link.source]
    const b = nodes[link.target]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const force = (dist - 80) * ATTRACTION * link.strength
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    a.vx += fx
    a.vy += fy
    b.vx -= fx
    b.vy -= fy
  }

  // Center pull
  for (const node of nodes) {
    node.vx += (500 - node.x) * CENTER_PULL
    node.vy += (400 - node.y) * CENTER_PULL
  }

  // Apply velocities
  for (const node of nodes) {
    if (node === dragNode) continue
    node.vx *= DAMPING
    node.vy *= DAMPING
    node.x += node.vx
    node.y += node.vy
  }
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height

  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.translate(panX, panY)
  ctx.scale(scale, scale)

  // Draw links
  ctx.globalAlpha = 0.08
  for (const link of links) {
    const a = nodes[link.source]
    const b = nodes[link.target]
    if (!a.highlighted && !b.highlighted && searchQuery.value) continue
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = Math.min(2, link.strength * 0.5)
    ctx.stroke()
  }

  // Draw highlighted links
  ctx.globalAlpha = 0.3
  for (const link of links) {
    const a = nodes[link.source]
    const b = nodes[link.target]
    if (!a.highlighted && !b.highlighted) continue
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = a.color
    ctx.lineWidth = link.strength
    ctx.stroke()
  }

  ctx.globalAlpha = 1

  // Draw nodes
  for (const node of nodes) {
    if (selectedSection.value !== 'all' && node.section !== selectedSection.value) {
      ctx.globalAlpha = 0.1
    } else if (searchQuery.value && !node.highlighted) {
      ctx.globalAlpha = 0.15
    } else {
      ctx.globalAlpha = node.highlighted ? 1 : 0.7
    }

    ctx.beginPath()
    ctx.arc(node.x, node.y, node.highlighted ? node.radius * 1.5 : node.radius, 0, Math.PI * 2)
    ctx.fillStyle = node.color
    ctx.fill()

    if (node.highlighted) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    ctx.globalAlpha = 1
  }

  ctx.restore()

  // Simulate for 300 ticks then stop (settle)
  if (!isSettled) {
    simulate()
    simulationTicks++
    if (simulationTicks > 300) {
      isSettled = true
    }
  }

  // Only keep animating if not settled or dragging
  if (!isSettled || isDragging) {
    animationId = requestAnimationFrame(render)
  }
}

function handleSearch() {
  const q = searchQuery.value.toLowerCase()
  for (const node of nodes) {
    node.highlighted = q ? (
      node.title.toLowerCase().includes(q) ||
      node.tags.some(t => t.toLowerCase().includes(q)) ||
      node.section.includes(q)
    ) : false
  }
}

function handleMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left - panX) / scale
  const my = (e.clientY - rect.top - panY) / scale

  if (isDragging && dragNode) {
    dragNode.x = mx
    dragNode.y = my
    dragNode.vx = 0
    dragNode.vy = 0
    // Re-render while dragging
    if (isSettled) render()
    return
  }

  let found = false
  for (const node of nodes) {
    const dx = node.x - mx
    const dy = node.y - my
    if (dx * dx + dy * dy < (node.radius + 4) * (node.radius + 4)) {
      tooltip.value = {
        show: true,
        x: e.clientX + 12,
        y: e.clientY - 8,
        title: node.title,
        tags: node.tags.slice(0, 5),
        path: node.path,
      }
      canvas.style.cursor = 'pointer'
      found = true
      break
    }
  }
  if (!found) {
    tooltip.value.show = false
    canvas.style.cursor = 'grab'
  }
}

function handleMouseDown(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left - panX) / scale
  const my = (e.clientY - rect.top - panY) / scale

  for (const node of nodes) {
    const dx = node.x - mx
    const dy = node.y - my
    if (dx * dx + dy * dy < (node.radius + 4) * (node.radius + 4)) {
      isDragging = true
      dragNode = node
      if (isSettled) { isSettled = false; simulationTicks = 250; render() }
      return
    }
  }

  // Pan
  isDragging = true
  dragNode = null
  offsetX = e.clientX - panX
  offsetY = e.clientY - panY
}

function handleMouseUp() {
  isDragging = false
  dragNode = null
}

function handleClick(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left - panX) / scale
  const my = (e.clientY - rect.top - panY) / scale

  for (const node of nodes) {
    const dx = node.x - mx
    const dy = node.y - my
    if (dx * dx + dy * dy < (node.radius + 4) * (node.radius + 4)) {
      window.location.href = node.path
      return
    }
  }
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale = Math.max(0.3, Math.min(3, scale * delta))
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const container = canvas.parentElement
  if (!container) return
  canvas.width = container.clientWidth
  canvas.height = 600
}

const sections = Object.keys(SECTION_COLORS)

onMounted(() => {
  buildGraph()
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  render()
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<template>
  <div class="knowledge-graph">
    <div class="graph-controls">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search topics..."
        class="graph-search"
        @input="handleSearch"
      />
      <div class="section-filters">
        <button
          :class="['filter-btn', { active: selectedSection === 'all' }]"
          @click="selectedSection = 'all'"
        >All</button>
        <button
          v-for="section in sections"
          :key="section"
          :class="['filter-btn', { active: selectedSection === section }]"
          :style="{ '--btn-color': SECTION_COLORS[section] }"
          @click="selectedSection = selectedSection === section ? 'all' : section"
        >
          <span class="color-dot" :style="{ background: SECTION_COLORS[section] }"></span>
          {{ section.replace(/-/g, ' ') }}
        </button>
      </div>
    </div>

    <div class="graph-container">
      <canvas
        ref="canvasRef"
        @mousemove="handleMouseMove"
        @mousedown="handleMouseDown"
        @mouseup="handleMouseUp"
        @click="handleClick"
        @wheel="handleWheel"
      ></canvas>

      <div
        v-if="tooltip.show"
        class="graph-tooltip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        <div class="tooltip-title">{{ tooltip.title }}</div>
        <div class="tooltip-tags">
          <span v-for="tag in tooltip.tags" :key="tag" class="tooltip-tag">{{ tag }}</span>
        </div>
        <div class="tooltip-hint">Click to open</div>
      </div>
    </div>

    <div class="graph-legend">
      <span class="legend-item" v-for="(color, section) in SECTION_COLORS" :key="section">
        <span class="legend-dot" :style="{ background: color }"></span>
        {{ section.replace(/-/g, ' ') }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.knowledge-graph {
  max-width: 100%;
  margin: 20px 0;
}

.graph-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.graph-search {
  width: 100%;
  padding: 10px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-family: inherit;
  outline: none;
}

.graph-search:focus {
  border-color: var(--vp-c-brand-1);
}

.section-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  text-transform: capitalize;
  transition: all 0.15s;
}

.filter-btn:hover {
  border-color: var(--btn-color, var(--vp-c-brand-1));
}

.filter-btn.active {
  background: var(--btn-color, var(--vp-c-brand-1));
  color: white;
  border-color: transparent;
}

.color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.graph-container {
  position: relative;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
}

canvas {
  display: block;
  cursor: grab;
}

canvas:active {
  cursor: grabbing;
}

.graph-tooltip {
  position: fixed;
  z-index: 100;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 10px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  max-width: 250px;
}

.tooltip-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 6px;
}

.tooltip-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 6px;
}

.tooltip-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--vp-c-brand-soft, rgba(95, 103, 238, 0.1));
  color: var(--vp-c-brand-1);
}

.tooltip-hint {
  font-size: 10px;
  color: var(--vp-c-text-3);
}

.graph-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  justify-content: center;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--vp-c-text-3);
  text-transform: capitalize;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

@media (max-width: 768px) {
  .section-filters {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 4px;
  }

  .filter-btn {
    white-space: nowrap;
  }
}
</style>
