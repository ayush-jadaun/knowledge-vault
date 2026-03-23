<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vitepress'

const route = useRoute()
const isOpen = ref(false)
const zoomedHtml = ref('')

function openZoom(el: HTMLElement) {
  if (el.tagName === 'IMG') {
    const img = el as HTMLImageElement
    zoomedHtml.value = `<img src="${img.src}" alt="${img.alt || ''}" />`
  } else {
    // SVG (mermaid diagram) — clone it
    zoomedHtml.value = el.outerHTML
  }
  isOpen.value = true
  document.body.style.overflow = 'hidden'
}

function closeZoom() {
  isOpen.value = false
  document.body.style.overflow = ''
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    closeZoom()
  }
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement

  // Check if it's an image inside .vp-doc
  const img = target.closest('.vp-doc img') as HTMLImageElement
  if (img) {
    e.preventDefault()
    openZoom(img)
    return
  }

  // Check if it's a mermaid SVG
  const mermaidSvg = target.closest('.mermaid svg') as SVGElement
  if (mermaidSvg) {
    e.preventDefault()
    openZoom(mermaidSvg)
    return
  }
}

onMounted(() => {
  document.addEventListener('click', handleClick)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClick)
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})

watch(() => route.path, () => {
  if (isOpen.value) closeZoom()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="image-zoom">
      <div v-if="isOpen" class="image-zoom-overlay" @click="closeZoom">
        <div v-html="zoomedHtml"></div>
      </div>
    </Transition>
  </Teleport>
</template>
