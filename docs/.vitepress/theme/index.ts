import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { h } from 'vue'
import './style.css'
import RelatedPages from './components/RelatedPages.vue'
import TagBrowse from './components/TagBrowse.vue'
import CodePlayground from './components/CodePlayground.vue'
import SearchButton from './components/SearchButton.vue'
import SidebarScroll from './components/SidebarScroll.vue'
import ReadingTime from './components/ReadingTime.vue'
import ReadingProgress from './components/ReadingProgress.vue'
import Feedback from './components/Feedback.vue'
import AskAI from './components/AskAI.vue'
import KnowledgeGraph from './components/KnowledgeGraph.vue'
import CompareMode from './components/CompareMode.vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-before': () => [h(ReadingTime), h(ReadingProgress)],
      'doc-after': () => [h(Feedback), h(RelatedPages)],
      'doc-top': () => [h(CodePlayground), h(SidebarScroll)],
      'nav-bar-content-after': () => h(SearchButton),
      'layout-bottom': () => h(AskAI),
    })
  },
  enhanceApp({ app }) {
    app.component('TagBrowse', TagBrowse)
    app.component('KnowledgeGraph', KnowledgeGraph)
    app.component('CompareMode', CompareMode)
  },
} satisfies Theme
