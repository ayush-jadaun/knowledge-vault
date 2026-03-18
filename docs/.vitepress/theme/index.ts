import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import './style.css'
import RelatedPages from './components/RelatedPages.vue'
import TagBrowse from './components/TagBrowse.vue'
import CodePlayground from './components/CodePlayground.vue'
import SearchButton from './components/SearchButton.vue'
import SidebarScroll from './components/SidebarScroll.vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-after': () => h(RelatedPages),
      'doc-top': () => [h(CodePlayground), h(SidebarScroll)],
      'nav-bar-content-after': () => h(SearchButton),
    })
  },
  enhanceApp({ app }) {
    app.component('TagBrowse', TagBrowse)
  },
} satisfies Theme
