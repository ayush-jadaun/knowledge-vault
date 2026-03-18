import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import './style.css'
import RelatedPages from './components/RelatedPages.vue'
import TagBrowse from './components/TagBrowse.vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-after': () => h(RelatedPages),
    })
  },
  enhanceApp({ app }) {
    app.component('TagBrowse', TagBrowse)
  },
} satisfies Theme
