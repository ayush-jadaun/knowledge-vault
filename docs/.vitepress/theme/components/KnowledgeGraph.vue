<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch, nextTick } from 'vue'
import tagData from '../data/tags.json'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const tooltip = ref({ show: false, x: 0, y: 0, title: '', tags: [] as string[], path: '' })
const searchQuery = ref('')
const selectedSection = ref('all')
const hoveredNode = ref<number | null>(null)
let animationId: number | null = null

interface Node {
  id: string
  title: string
  path: string
  section: string
  tags: string[]
  x: number
  y: number
  radius: number
  color: string
  highlighted: boolean
  connections: number
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

const SECTION_LABELS: Record<string, string> = {
  'system-design': 'System Design',
  'architecture-patterns': 'Architecture',
  'infrastructure': 'Infrastructure',
  'security': 'Security',
  'devops': 'DevOps',
  'performance': 'Performance',
  'data-engineering': 'Data Eng',
  'prompt-engineering': 'Prompts',
  'ui-design-systems': 'UI/Design',
  'production-blueprints': 'Blueprints',
  'system-design-interviews': 'Interviews',
  'learning-paths': 'Paths',
  'cheat-sheets': 'Cheat Sheets',
}

let nodes: Node[] = []
let links: Link[] = []
let scale = 1
let panX = 0
let panY = 0
let centerX = 0
let centerY = 0

function getSection(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[0] || 'other'
}

function buildGraph() {
  const pages = tagData.pages as Array<{ title: string; path: string; tags: string[]; difficulty: string }>

  // Build nodes
  nodes = pages.map((page) => {
    const section = getSection(page.path)
    return {
      id: page.path,
      title: page.title,
      path: page.path,
      section,
      tags: page.tags || [],
      x: 0,
      y: 0,
      radius: 4,
      color: SECTION_COLORS[section] || '#64748b',
      highlighted: false,
      connections: 0,
    }
  })

  // Build links based on shared tags (at least 3 shared tags to reduce noise)
  const tagToNodes = new Map<string, number[]>()
  nodes.forEach((node, i) => {
    for (const tag of node.tags) {
      if (!tagToNodes.has(tag)) tagToNodes.set(tag, [])
      tagToNodes.get(tag)!.push(i)
    }
  })

  const linkSet = new Map<string, number>()
  links = []

  for (const [tag, nodeIndices] of tagToNodes) {
    if (nodeIndices.length > 20) continue // Skip very common tags
    for (let i = 0; i < nodeIndices.length; i++) {
      for (let j = i + 1; j < nodeIndices.length; j++) {
        const a = Math.min(nodeIndices[i], nodeIndices[j])
        const b = Math.max(nodeIndices[i], nodeIndices[j])
        const key = `${a}-${b}`
        linkSet.set(key, (linkSet.get(key) || 0) + 1)
      }
    }
  }

  for (const [key, strength] of linkSet) {
    if (strength >= 3) {
      const [a, b] = key.split('-').map(Number)
      links.push({ source: a, target: b, strength })
      nodes[a].connections++
      nodes[b].connections++
    }
  }

  // Set radius based on connections
  for (const node of nodes) {
    node.radius = Math.max(3, Math.min(10, 3 + node.connections * 0.3))
  }

  layoutNodes()
}

function layoutNodes() {
  const canvas = canvasRef.value
  if (!canvas) return

  centerX = canvas.width / 2
  centerY = canvas.height / 2

  // Group nodes by section
  const sectionGroups = new Map<string, number[]>()
  nodes.forEach((node, i) => {
    if (!sectionGroups.has(node.section)) sectionGroups.set(node.section, [])
    sectionGroups.get(node.section)!.push(i)
  })

  const sections = [...sectionGroups.keys()]
  const sectionCount = sections.length
  const baseRadius = Math.min(centerX, centerY) * 0.65

  sections.forEach((section, sectionIdx) => {
    const indices = sectionGroups.get(section)!
    const sectionAngle = (sectionIdx / sectionCount) * Math.PI * 2 - Math.PI / 2

    // Section center point on the ring
    const sectionCenterX = centerX + Math.cos(sectionAngle) * baseRadius
    const sectionCenterY = centerY + Math.sin(sectionAngle) * baseRadius

    // Arrange nodes in a tight cluster around section center
    const count = indices.length
    const clusterRadius = Math.min(80, Math.max(30, count * 2))

    indices.forEach((nodeIdx, i) => {
      if (count === 1) {
        nodes[nodeIdx].x = sectionCenterX
        nodes[nodeIdx].y = sectionCenterY
      } else {
        // Spiral layout within cluster
        const t = i / count
        const r = clusterRadius * Math.sqrt(t)
        const angle = i * 2.39996323 // Golden angle
        nodes[nodeIdx].x = sectionCenterX + Math.cos(angle) * r
        nodes[nodeIdx].y = sectionCenterY + Math.sin(angle) * r
      }
    })
  })
}

function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.translate(panX, panY)
  ctx.scale(scale, scale)

  const showAll = selectedSection.value === 'all'
  const query = searchQuery.value.toLowerCase()

  // Draw links
  for (const link of links) {
    const a = nodes[link.source]
    const b = nodes[link.target]

    if (!showAll && a.section !== selectedSection.value && b.section !== selectedSection.value) continue

    const isHovered = hoveredNode.value === link.source || hoveredNode.value === link.target
    const isHighlighted = a.highlighted || b.highlighted

    if (!isHovered && !isHighlighted && query) continue

    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = isHovered ? a.color : '#94a3b8'
    ctx.globalAlpha = isHovered ? 0.4 : (isHighlighted ? 0.2 : 0.04)
    ctx.lineWidth = isHovered ? 1.5 : 0.5
    ctx.stroke()
  }

  ctx.globalAlpha = 1

  // Draw section labels
  const sectionGroups = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    if (!sectionGroups.has(node.section)) {
      sectionGroups.set(node.section, { x: 0, y: 0 })
    }
    const g = sectionGroups.get(node.section)!
    g.x += node.x
    g.y += node.y
  }

  for (const [section, sum] of sectionGroups) {
    if (!showAll && section !== selectedSection.value) continue
    const count = nodes.filter(n => n.section === section).length
    const cx = sum.x / count
    const cy = sum.y / count

    // Draw label above cluster
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = SECTION_COLORS[section] || '#64748b'
    ctx.globalAlpha = 0.8
    ctx.fillText(SECTION_LABELS[section] || section, cx, cy - (Math.max(30, count * 2) + 14))
    ctx.globalAlpha = 1
  }

  // Draw nodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    if (!showAll && node.section !== selectedSection.value) {
      ctx.globalAlpha = 0.05
    } else if (query && !node.highlighted) {
      ctx.globalAlpha = 0.1
    } else if (hoveredNode.value !== null && hoveredNode.value !== i) {
      // Check if connected to hovered node
      const isConnected = links.some(l =>
        (l.source === hoveredNode.value && l.target === i) ||
        (l.target === hoveredNode.value && l.source === i)
      )
      ctx.globalAlpha = isConnected ? 0.9 : 0.2
    } else {
      ctx.globalAlpha = 0.85
    }

    const isHovered = hoveredNode.value === i
    const r = isHovered ? node.radius * 2 : node.radius

    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2)
    ctx.fillStyle = node.color
    ctx.fill()

    if (isHovered) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw title next to hovered node
      ctx.font = '500 12px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#e2e8f0'
      ctx.globalAlpha = 1
      ctx.fillText(node.title, node.x + r + 8, node.y + 4)
    }

    ctx.globalAlpha = 1
  }

  ctx.restore()
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
  render()
}

function getNodeAtPosition(e: MouseEvent): number | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const mx = (e.clientX - rect.left - panX) / scale
  const my = (e.clientY - rect.top - panY) / scale

  for (let i = 0; i < nodes.length; i++) {
    const dx = nodes[i].x - mx
    const dy = nodes[i].y - my
    const hitRadius = nodes[i].radius + 4
    if (dx * dx + dy * dy < hitRadius * hitRadius) return i
  }
  return null
}

function handleMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return

  const idx = getNodeAtPosition(e)
  hoveredNode.value = idx

  if (idx !== null) {
    tooltip.value = {
      show: true,
      x: e.clientX + 12,
      y: e.clientY - 8,
      title: nodes[idx].title,
      tags: nodes[idx].tags.slice(0, 5),
      path: nodes[idx].path,
    }
    canvas.style.cursor = 'pointer'
  } else {
    tooltip.value.show = false
    canvas.style.cursor = 'default'
  }

  render()
}

function handleClick(e: MouseEvent) {
  const idx = getNodeAtPosition(e)
  if (idx !== null) {
    window.location.href = nodes[idx].path
  }
}

function handleWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  scale = Math.max(0.3, Math.min(3, scale * delta))
  render()
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const container = canvas.parentElement
  if (!container) return
  canvas.width = container.clientWidth
  canvas.height = Math.max(500, Math.min(700, window.innerHeight * 0.6))
  layoutNodes()
  render()
}

function selectSection(section: string) {
  selectedSection.value = selectedSection.value === section ? 'all' : section
  render()
}

const sections = Object.keys(SECTION_COLORS)

onMounted(() => {
  buildGraph()
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
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
          @click="selectSection('all')"
        >All ({{ nodes.length }})</button>
        <button
          v-for="section in sections"
          :key="section"
          :class="['filter-btn', { active: selectedSection === section }]"
          :style="{ '--btn-color': SECTION_COLORS[section] }"
          @click="selectSection(section)"
        >
          <span class="color-dot" :style="{ background: SECTION_COLORS[section] }"></span>
          {{ SECTION_LABELS[section] || section }}
          <span class="filter-count">({{ nodes.filter(n => n.section === section).length }})</span>
        </button>
      </div>
    </div>

    <div class="graph-container">
      <canvas
        ref="canvasRef"
        @mousemove="handleMouseMove"
        @mouseleave="hoveredNode = null; tooltip.show = false; render()"
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
  </div>
</template>

<style scoped>
.knowledge-graph { max-width: 100%; margin: 20px 0; }

.graph-controls { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }

.graph-search {
  width: 100%; padding: 10px 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px;
  background: var(--vp-c-bg); color: var(--vp-c-text-1); font-size: 14px; font-family: inherit; outline: none;
}
.graph-search:focus { border-color: var(--vp-c-brand-1); }

.section-filters { display: flex; flex-wrap: wrap; gap: 6px; }

.filter-btn {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
  border: 1px solid var(--vp-c-divider); border-radius: 16px; background: var(--vp-c-bg);
  color: var(--vp-c-text-2); font-size: 11px; cursor: pointer; font-family: inherit;
  transition: all 0.15s;
}
.filter-btn:hover { border-color: var(--btn-color, var(--vp-c-brand-1)); }
.filter-btn.active { background: var(--btn-color, var(--vp-c-brand-1)); color: white; border-color: transparent; }
.filter-count { opacity: 0.6; font-size: 10px; }

.color-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

.graph-container {
  position: relative; background: #0c0c1d; border: 1px solid var(--vp-c-divider);
  border-radius: 12px; overflow: hidden;
}

canvas { display: block; }

.graph-tooltip {
  position: fixed; z-index: 100; background: var(--vp-c-bg); border: 1px solid var(--vp-c-divider);
  border-radius: 8px; padding: 10px 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  pointer-events: none; max-width: 250px;
}
.tooltip-title { font-size: 13px; font-weight: 600; color: var(--vp-c-text-1); margin-bottom: 6px; }
.tooltip-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px; }
.tooltip-tag { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(95,103,238,0.1); color: var(--vp-c-brand-1); }
.tooltip-hint { font-size: 10px; color: var(--vp-c-text-3); }

@media (max-width: 768px) {
  .section-filters { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
  .filter-btn { white-space: nowrap; }
  .graph-container { margin: 0 -16px; border-radius: 0; }
}
</style>
