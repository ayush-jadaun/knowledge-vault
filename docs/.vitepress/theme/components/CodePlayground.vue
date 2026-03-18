<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import sdk from '@stackblitz/sdk'

let observer: MutationObserver | null = null

function extractCode(block: Element): string {
  const codeEl = block.querySelector('code')
  if (!codeEl) return ''
  // Get text content, stripping line numbers if present
  return codeEl.textContent || ''
}

function openInStackBlitz(code: string, lang: string) {
  const isTS = lang.includes('typescript') || lang.includes('ts')

  const files: Record<string, string> = isTS
    ? {
        'index.ts': code,
        'tsconfig.json': JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ES2022',
              moduleResolution: 'bundler',
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              outDir: './dist',
            },
          },
          null,
          2
        ),
        'package.json': JSON.stringify(
          {
            name: 'knowledge-vault-playground',
            private: true,
            scripts: { start: 'npx tsx index.ts' },
            devDependencies: { tsx: '^4.0.0', typescript: '^5.0.0' },
          },
          null,
          2
        ),
      }
    : {
        'index.js': code,
        'package.json': JSON.stringify(
          {
            name: 'knowledge-vault-playground',
            private: true,
            scripts: { start: 'node index.js' },
          },
          null,
          2
        ),
      }

  sdk.openProject(
    {
      title: 'Knowledge Vault Playground',
      description: 'Try this code from Knowledge Vault',
      template: 'node',
      files,
    },
    { openFile: isTS ? 'index.ts' : 'index.js' }
  )
}

function addButtons() {
  const selectors = [
    'div[class*="language-typescript"]',
    'div[class*="language-ts"]',
    'div[class*="language-javascript"]',
    'div[class*="language-js"]',
  ]

  const blocks = document.querySelectorAll(selectors.join(','))

  blocks.forEach((block) => {
    // Skip if already has a button
    if (block.querySelector('.playground-btn')) return

    // Skip very short code blocks (< 3 lines)
    const code = extractCode(block)
    if (code.split('\n').filter((l) => l.trim()).length < 3) return

    // Skip code blocks that are clearly config/yaml-like
    if (code.startsWith('{') && code.includes('"name"')) return

    const btn = document.createElement('button')
    btn.className = 'playground-btn'
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run`
    btn.title = 'Open in StackBlitz'

    const lang = block.className || ''
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      openInStackBlitz(code, lang)
    })

    // Insert button into the code block header area
    const existingBtns = block.querySelector('.lang') || block.querySelector('button')
    if (existingBtns && existingBtns.parentElement) {
      existingBtns.parentElement.insertBefore(btn, existingBtns)
    } else {
      block.style.position = 'relative'
      block.insertBefore(btn, block.firstChild)
    }
  })
}

onMounted(() => {
  // Initial scan
  setTimeout(addButtons, 500)

  // Watch for route changes (SPA navigation)
  observer = new MutationObserver(() => {
    setTimeout(addButtons, 300)
  })

  const content = document.querySelector('.vp-doc')
  if (content) {
    observer.observe(content, { childList: true, subtree: true })
  }
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <div class="code-playground-provider" />
</template>

<style>
.playground-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: none;
  border-radius: 4px;
  background: #1389fd;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s;
  position: relative;
  z-index: 10;
}

.playground-btn:hover {
  background: #0070e0;
}

.playground-btn svg {
  flex-shrink: 0;
}

/* Position in code block header */
div[class*='language-'] .playground-btn {
  position: absolute;
  top: 8px;
  right: 60px;
  z-index: 10;
}
</style>
