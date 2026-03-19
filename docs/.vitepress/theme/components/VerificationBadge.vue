<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { frontmatter } = useData()

const isVerified = computed(() => frontmatter.value.verified === true)
const verifiedBy = computed(() => frontmatter.value.verifiedBy || '')
const verifiedDate = computed(() => frontmatter.value.verifiedDate || '')
const verifierGithub = computed(() => frontmatter.value.verifierGithub || '')
const verifierLinkedin = computed(() => frontmatter.value.verifierLinkedin || '')
</script>

<template>
  <div class="verification-badge" :class="{ verified: isVerified, unverified: !isVerified }">
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
        <span class="badge-text">Verified by <strong>{{ verifiedBy }}</strong></span>
        <span v-if="verifiedDate" class="badge-date">· {{ verifiedDate }}</span>
        <span class="badge-links">
          <a v-if="verifierGithub" :href="`https://github.com/${verifierGithub}`" target="_blank" title="GitHub" class="profile-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
          </a>
          <a v-if="verifierLinkedin" :href="`https://linkedin.com/in/${verifierLinkedin}`" target="_blank" title="LinkedIn" class="profile-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          </a>
        </span>
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

.badge-date {
  opacity: 0.7;
}

.badge-links {
  display: flex;
  gap: 6px;
  margin-left: 4px;
}

.profile-link {
  display: inline-flex;
  align-items: center;
  color: var(--vp-c-text-2);
  opacity: 0.6;
  transition: opacity 0.15s;
}

.profile-link:hover {
  opacity: 1;
  color: var(--vp-c-brand-1);
}

.badge-text a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
