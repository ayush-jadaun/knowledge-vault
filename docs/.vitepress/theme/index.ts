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
import KeyboardShortcuts from './components/KeyboardShortcuts.vue'
import Bookmarks from './components/Bookmarks.vue'
import BookmarksList from './components/BookmarksList.vue'
import EnhancedUX from './components/EnhancedUX.vue'
import DifficultyBadges from './components/DifficultyBadges.vue'
import VerificationBadge from './components/VerificationBadge.vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-before': () => [h(VerificationBadge), h(ReadingTime), h(ReadingProgress), h(Bookmarks)],
      'doc-after': () => [h(Feedback), h(RelatedPages)],
      'doc-top': () => [h(CodePlayground), h(SidebarScroll), h(DifficultyBadges)],
      'nav-bar-content-after': () => h(SearchButton),
      'layout-bottom': () => [h(AskAI), h(KeyboardShortcuts), h(EnhancedUX)],
    })
  },
  enhanceApp({ app }) {
    app.component('TagBrowse', TagBrowse)
    app.component('KnowledgeGraph', KnowledgeGraph)
    app.component('CompareMode', CompareMode)
    app.component('BookmarksList', BookmarksList)
  },
} satisfies Theme
