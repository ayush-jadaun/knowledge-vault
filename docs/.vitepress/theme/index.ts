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
import NotFound from './NotFound.vue'
import ImageZoom from './components/ImageZoom.vue'
import CollapsibleCode from './components/CollapsibleCode.vue'
import Breadcrumbs from './components/Breadcrumbs.vue'
import ShareButton from './components/ShareButton.vue'
import Footer from './components/Footer.vue'
import TableSort from './components/TableSort.vue'
import ScrollTitle from './components/ScrollTitle.vue'
import PageEnhancements from './components/PageEnhancements.vue'
import EasterEgg from './components/EasterEgg.vue'
import MermaidA11y from './components/MermaidA11y.vue'
import SeasonalAccent from './components/SeasonalAccent.vue'
import CodeBlockLinks from './components/CodeBlockLinks.vue'
import MermaidExport from './components/MermaidExport.vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'not-found': () => h(NotFound),
      'doc-before': () => [h(Breadcrumbs), h(VerificationBadge), h(ReadingTime), h(ReadingProgress), h(Bookmarks)],
      'doc-after': () => [h(Feedback), h(RelatedPages), h(Footer)],
      'doc-top': () => [h(CodePlayground), h(SidebarScroll), h(DifficultyBadges), h(TableSort), h(PageEnhancements)],
      'nav-bar-content-after': () => [h(ShareButton), h(SearchButton)],
      'layout-bottom': () => [h(AskAI), h(KeyboardShortcuts), h(EnhancedUX), h(ImageZoom), h(CollapsibleCode), h(ScrollTitle), h(EasterEgg), h(MermaidA11y), h(SeasonalAccent), h(CodeBlockLinks), h(MermaidExport)],
    })
  },
  enhanceApp({ app }) {
    app.component('TagBrowse', TagBrowse)
    app.component('KnowledgeGraph', KnowledgeGraph)
    app.component('CompareMode', CompareMode)
    app.component('BookmarksList', BookmarksList)
  },
} satisfies Theme
