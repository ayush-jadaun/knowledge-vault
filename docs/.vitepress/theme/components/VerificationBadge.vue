<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute } from 'vitepress'

const { frontmatter } = useData()
const route = useRoute()

const isVerified = computed(() => frontmatter.value.verified === true)
const verifiedBy = computed(() => frontmatter.value.verifiedBy || '')
const verifiedDate = computed(() => frontmatter.value.verifiedDate || '')
const verifierGithub = computed(() => frontmatter.value.verifierGithub || '')
const verifierLinkedin = computed(() => frontmatter.value.verifierLinkedin || '')

// Skip badge on utility/non-content pages
const showBadge = computed(() => {
  const path = route.path.replace(/\.html$/, '')
  const skipPages = [
    '/', '/tags', '/graph', '/compare', '/bookmarks', '/changelog',
    '/technology-radar', '/start-here', '/verify', '/sample-verified',
    '/glossary', '/404',
  ]
  // Skip homepage, utility pages, and index pages
  if (skipPages.includes(path)) return false
  if (path.endsWith('/')) return false // section index pages
  // Only show on pages that have tags (actual content pages)
  return Array.isArray(frontmatter.value.tags) && frontmatter.value.tags.length > 0
})
</script>

<template>
  <div v-if="showBadge" class="verification-badge" :class="{ verified: isVerified, unverified: !isVerified }">
    <div class="badge-content">
      <svg v-if="isVerified" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>

      <template v-if="isVerified">
        <a v-if="verifierGithub" :href="`https://github.com/${verifierGithub}`" target="_blank" class="verifier-avatar" :title="verifiedBy">
          <img :src="`https://github.com/${verifierGithub}.png?size=40`" :alt="verifiedBy" width="20" height="20" />
        </a>
        <span class="badge-text">Verified by
          <a v-if="verifierGithub" :href="`https://github.com/${verifierGithub}`" target="_blank" class="verifier-name">{{ verifiedBy }}</a>
          <strong v-else>{{ verifiedBy }}</strong>
        </span>
        <span v-if="verifiedDate" class="badge-date">· {{ verifiedDate }}</span>
        <a v-if="verifierLinkedin" :href="`https://linkedin.com/in/${verifierLinkedin}`" target="_blank" class="linkedin-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          <span>{{ verifiedBy }}</span>
        </a>
      </template>

      <template v-else>
        <span class="badge-text">
          Unverified — AI-generated content.
          <a href="/verify">Help verify this page</a>
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.verification-badge {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 12px;
}

.verified {
  background: rgba(34, 197, 94, 0.08);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.15);
}

.unverified {
  background: rgba(245, 158, 11, 0.08);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.15);
}

.badge-content {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.verifier-avatar {
  display: inline-flex;
  border-radius: 50%;
  overflow: hidden;
  border: 1.5px solid #22c55e;
  flex-shrink: 0;
}

.verifier-avatar img {
  display: block;
  border-radius: 50%;
}

.verifier-name {
  color: #22c55e;
  font-weight: 600;
  text-decoration: none;
}

.verifier-name:hover {
  text-decoration: underline;
}

.badge-date {
  opacity: 0.7;
}

.linkedin-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 6px;
  background: #0a66c2;
  color: white;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s;
  margin-left: 4px;
}

.linkedin-chip:hover {
  background: #004182;
}

.badge-text a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
