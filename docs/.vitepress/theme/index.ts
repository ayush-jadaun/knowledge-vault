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
import ImageZoom from './components/ImageZoom.vue'
import MobileNav from './components/MobileNav.vue'
import AnimatedCounter from './components/AnimatedCounter.vue'
import ScrollTitle from './components/ScrollTitle.vue'
import ShareButton from './components/ShareButton.vue'
import Breadcrumbs from './components/Breadcrumbs.vue'
import Footer from './components/Footer.vue'
import NotFound from './NotFound.vue'
import TableSort from './components/TableSort.vue'
import RandomPage from './components/RandomPage.vue'
import BackToSection from './components/BackToSection.vue'
import SwipeNav from './components/SwipeNav.vue'
import UpdatedBadge from './components/UpdatedBadge.vue'
import PageEnhancements from './components/PageEnhancements.vue'
import LinkPreview from './components/LinkPreview.vue'
import SidebarPageCount from './components/SidebarPageCount.vue'
import TagPills from './components/TagPills.vue'
import CopyMarkdown from './components/CopyMarkdown.vue'
import ReadingRuler from './components/ReadingRuler.vue'
import PageStats from './components/PageStats.vue'
import CodeBlockLinks from './components/CodeBlockLinks.vue'
import CopyAllCode from './components/CopyAllCode.vue'
import PeopleAlsoRead from './components/PeopleAlsoRead.vue'
import PageWeight from './components/PageWeight.vue'
import SeasonalAccent from './components/SeasonalAccent.vue'
import MermaidA11y from './components/MermaidA11y.vue'
import StartFromBeginning from './components/StartFromBeginning.vue'
import Prerequisites from './components/Prerequisites.vue'
import ContinueReading from './components/ContinueReading.vue'
import PageNavTimeline from './components/PageNavTimeline.vue'
import HighContrast from './components/HighContrast.vue'
import DyslexiaFont from './components/DyslexiaFont.vue'
import MermaidExport from './components/MermaidExport.vue'
import ReportInaccuracy from './components/ReportInaccuracy.vue'
import EasterEgg from './components/EasterEgg.vue'
import CollapsibleCode from './components/CollapsibleCode.vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'not-found': () => h(NotFound),
      'doc-before': () => [h(StartFromBeginning), h(BackToSection), h(Breadcrumbs), h(UpdatedBadge), h(VerificationBadge), h(TagPills), h(PageNavTimeline), h(Prerequisites), h(ReadingTime), h(PageWeight), h(CopyAllCode), h(CopyMarkdown), h(ReadingProgress), h(Bookmarks), h(ShareButton)],
      'doc-after': () => [h(PageStats), h(Feedback), h(ContinueReading), h(ReportInaccuracy), h(RelatedPages), h(PeopleAlsoRead), h(Footer)],
      'doc-top': () => [h(CodePlayground), h(SidebarScroll), h(DifficultyBadges), h(SidebarPageCount), h(TableSort), h(PageEnhancements)],
      'nav-bar-content-after': () => [h(RandomPage), h(SearchButton)],
      'layout-bottom': () => [h(AskAI), h(KeyboardShortcuts), h(EnhancedUX), h(ImageZoom), h(MobileNav), h(AnimatedCounter), h(ScrollTitle), h(SwipeNav), h(LinkPreview), h(ReadingRuler), h(CodeBlockLinks), h(SeasonalAccent), h(MermaidA11y), h(HighContrast), h(DyslexiaFont), h(MermaidExport), h(EasterEgg), h(CollapsibleCode)],
      'layout-top': () => h('a', {
        href: '#VPContent',
        class: 'skip-to-content',
        onClick: (e: MouseEvent) => {
          e.preventDefault()
          const content = document.querySelector('.vp-doc') as HTMLElement
          if (content) {
            content.setAttribute('tabindex', '-1')
            content.focus()
            content.scrollIntoView()
          }
        }
      }, 'Skip to main content'),
    })
  },
  enhanceApp({ app }) {
    app.component('TagBrowse', TagBrowse)
    app.component('KnowledgeGraph', KnowledgeGraph)
    app.component('CompareMode', CompareMode)
    app.component('BookmarksList', BookmarksList)
  },
} satisfies Theme
