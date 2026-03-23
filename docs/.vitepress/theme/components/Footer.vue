<script setup lang="ts">
import { withBase } from 'vitepress'

const buildDate = __BUILD_DATE__
const version = __APP_VERSION__

const navigation = [
  { text: 'System Design', link: '/system-design/' },
  { text: 'Architecture', link: '/architecture-patterns/' },
  { text: 'Infrastructure', link: '/infrastructure/' },
  { text: 'DevOps', link: '/devops/' },
  { text: 'Security', link: '/security/' },
]

const resources = [
  { text: 'Cheat Sheets', link: '/cheat-sheets/' },
  { text: 'Learning Paths', link: '/learning-paths/' },
  { text: 'Production Blueprints', link: '/production-blueprints/' },
  { text: 'Build From Scratch', link: '/build-from-scratch/' },
  { text: 'Tech Radar', link: '/technology-radar' },
]
</script>

<template>
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-columns">
        <div class="footer-col">
          <h4>Navigation</h4>
          <ul>
            <li v-for="item in navigation" :key="item.link">
              <a :href="withBase(item.link)">{{ item.text }}</a>
            </li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Resources</h4>
          <ul>
            <li v-for="item in resources" :key="item.link">
              <a :href="withBase(item.link)">{{ item.text }}</a>
            </li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Connect</h4>
          <ul>
            <li>
              <a href="https://github.com/ayush-jadaun/knowledge-vault" target="_blank" rel="noopener">
                GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span class="footer-built">852 pages &middot; Built with <a href="https://vitepress.dev" target="_blank" rel="noopener">VitePress</a> &middot; <a href="https://github.com/ayush-jadaun/knowledge-vault" target="_blank" rel="noopener">Open Source</a></span>
        <span class="footer-meta">Last built: {{ buildDate }} &middot; v{{ version }}</span>
        <span class="footer-copyright">&copy; {{ new Date().getFullYear() }} Archon</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  border-top: 1px solid var(--vp-c-divider);
  padding: 32px 24px 24px;
  margin-top: 48px;
}

.footer-inner {
  max-width: 1152px;
  margin: 0 auto;
}

.footer-columns {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
  margin-bottom: 24px;
}

.footer-col h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.footer-col ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.footer-col li {
  margin: 0;
}

.footer-col a {
  display: block;
  padding: 3px 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.15s;
}

.footer-col a:hover {
  color: var(--vp-c-brand-1);
}

.footer-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.footer-built a {
  color: var(--vp-c-text-2);
  text-decoration: none;
}

.footer-built a:hover {
  color: var(--vp-c-brand-1);
}

.footer-meta {
  font-size: 11px;
  color: var(--vp-c-text-3);
  opacity: 0.7;
}

@media (max-width: 640px) {
  .footer-columns {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .footer-bottom {
    flex-direction: column;
    gap: 6px;
    text-align: center;
  }
}
</style>
