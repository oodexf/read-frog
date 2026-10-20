import type { ComponentType } from "react"
import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router"
import { ROUTE_DEFS } from "./app-sidebar/nav-items"

type RoutePath = (typeof ROUTE_DEFS)[number]["path"]

const PreferencePage = lazy(() =>
  import("./pages/preference").then((module) => ({ default: module.PreferencePage })),
)
const ShortcutsPage = lazy(() =>
  import("./pages/shortcuts").then((module) => ({ default: module.ShortcutsPage })),
)
const ApiProvidersPage = lazy(() =>
  import("./pages/api-providers").then((module) => ({ default: module.ApiProvidersPage })),
)
const CustomActionsPage = lazy(() =>
  import("./pages/custom-actions").then((module) => ({ default: module.CustomActionsPage })),
)
const TranslationPage = lazy(() =>
  import("./pages/translation").then((module) => ({ default: module.TranslationPage })),
)
const VideoSubtitlesPage = lazy(() =>
  import("./pages/video-subtitles").then((module) => ({ default: module.VideoSubtitlesPage })),
)
const FloatingButtonPage = lazy(() =>
  import("./pages/floating-button").then((module) => ({ default: module.FloatingButtonPage })),
)
const SelectionToolbarPage = lazy(() =>
  import("./pages/selection-toolbar").then((module) => ({ default: module.SelectionToolbarPage })),
)
const ContextMenuPage = lazy(() =>
  import("./pages/context-menu").then((module) => ({ default: module.ContextMenuPage })),
)
const InputTranslationPage = lazy(() =>
  import("./pages/input-translation").then((module) => ({ default: module.InputTranslationPage })),
)
const TextToSpeechPage = lazy(() =>
  import("./pages/text-to-speech").then((module) => ({ default: module.TextToSpeechPage })),
)
const GlossaryPage = lazy(() =>
  import("./pages/advanced/glossary").then((module) => ({ default: module.GlossaryPage })),
)
const GlossaryEditorPage = lazy(() =>
  import("./pages/advanced/glossary/editor-page").then((module) => ({
    default: module.GlossaryEditorPage,
  })),
)

/** Advanced has no page of its own; its group's only entry is the glossary. */
function AdvancedRedirect() {
  return <Navigate to="/advanced/glossary" replace />
}

/** WebDAV backup moved from Preference to the Sync page. */
function LegacyWebdavBackupRedirect() {
  return <Navigate to="/sync/webdav-backup" replace />
}
const LocalNotesPage = lazy(() =>
  import("./pages/local-notes").then((module) => ({ default: module.LocalNotesPage })),
)
const LocalNotesReviewPage = lazy(() =>
  import("./pages/local-notes/review-page").then((module) => ({
    default: module.LocalNotesReviewPage,
  })),
)
const HelpAndCommunityPage = lazy(() =>
  import("./pages/help-and-community").then((module) => ({ default: module.HelpAndCommunityPage })),
)
const CustomCssPage = lazy(() =>
  import("./pages/translation/translation-style/custom-css").then((module) => ({
    default: module.CustomCssPage,
  })),
)
const PersonalizedPromptsPage = lazy(() =>
  import("./pages/translation/personalized-prompts/prompts").then((module) => ({
    default: module.PersonalizedPromptsPage,
  })),
)
const AutoTranslateWebsitesPage = lazy(() =>
  import("./pages/translation/translation-control/website-patterns-page").then((module) => ({
    default: module.AutoTranslateWebsitesPage,
  })),
)
const NeverAutoTranslateWebsitesPage = lazy(() =>
  import("./pages/translation/translation-control/website-patterns-page").then((module) => ({
    default: module.NeverAutoTranslateWebsitesPage,
  })),
)
const TranslationControlPage = lazy(() =>
  import("./pages/translation/translation-control/control-page").then((module) => ({
    default: module.TranslationControlPage,
  })),
)
const SiteRulesPage = lazy(() =>
  import("./pages/translation/translation-control/site-rules").then((module) => ({
    default: module.SiteRulesPage,
  })),
)
const TranslationQueuePage = lazy(() =>
  import("./pages/translation/translation-queue/queue-page").then((module) => ({
    default: module.TranslationQueuePage,
  })),
)
const ConfigBackupPage = lazy(() =>
  import("./pages/preference/config/config-backup").then((module) => ({
    default: module.ConfigBackupPage,
  })),
)
const SyncPage = lazy(() => import("./pages/sync").then((module) => ({ default: module.SyncPage })))
const WebdavBackupPage = lazy(() =>
  import("./pages/sync/webdav-backup").then((module) => ({
    default: module.WebdavBackupPage,
  })),
)
const ExtensionActivationPage = lazy(() =>
  import("./pages/preference/extension-activation/activation-page").then((module) => ({
    default: module.ExtensionActivationPage,
  })),
)
const SubtitlesCustomCssPage = lazy(() =>
  import("./pages/video-subtitles/subtitles-style/custom-css").then((module) => ({
    default: module.SubtitlesCustomCssPage,
  })),
)
const SubtitlesAutoStartPage = lazy(() =>
  import("./pages/video-subtitles/preference/auto-start-page").then((module) => ({
    default: module.SubtitlesAutoStartPage,
  })),
)
const SubtitlesStylePage = lazy(() =>
  import("./pages/video-subtitles/subtitles-style/style-editor").then((module) => ({
    default: module.SubtitlesStylePage,
  })),
)
const SubtitlesCustomPromptsPage = lazy(() =>
  import("./pages/video-subtitles/custom-prompts/prompts").then((module) => ({
    default: module.SubtitlesCustomPromptsPage,
  })),
)
const SubtitlesQueuePage = lazy(() =>
  import("./pages/video-subtitles/subtitles-queue/queue-page").then((module) => ({
    default: module.SubtitlesQueuePage,
  })),
)

const ROUTE_COMPONENTS: Record<RoutePath, ComponentType> = {
  "/": ApiProvidersPage,
  "/preference": PreferencePage,
  "/sync": SyncPage,
  "/shortcuts": ShortcutsPage,
  "/api-providers": ApiProvidersPage,
  "/custom-actions": CustomActionsPage,
  "/page-translation": TranslationPage,
  "/video-subtitles": VideoSubtitlesPage,
  "/floating-button": FloatingButtonPage,
  "/selection-toolbar": SelectionToolbarPage,
  "/context-menu": ContextMenuPage,
  "/input-translation": InputTranslationPage,
  "/tts": TextToSpeechPage,
  "/advanced": AdvancedRedirect,
  "/help-and-community": HelpAndCommunityPage,
  "/notes": LocalNotesPage,
  "/notes/review": LocalNotesReviewPage,
  "/advanced/glossary": GlossaryPage,
  "/advanced/glossary/:glossaryId": GlossaryEditorPage,
  "/preference/config-backup": ConfigBackupPage,
  "/preference/webdav-backup": LegacyWebdavBackupRedirect,
  "/sync/webdav-backup": WebdavBackupPage,
  "/preference/extension-activation": ExtensionActivationPage,
  "/page-translation/custom-css": CustomCssPage,
  "/page-translation/prompts": PersonalizedPromptsPage,
  "/page-translation/translation-control": TranslationControlPage,
  "/page-translation/translation-control/auto-translate-websites": AutoTranslateWebsitesPage,
  "/page-translation/translation-control/never-auto-translate-websites":
    NeverAutoTranslateWebsitesPage,
  "/page-translation/translation-control/site-rules": SiteRulesPage,
  "/page-translation/translation-queue": TranslationQueuePage,
  "/video-subtitles/auto-start": SubtitlesAutoStartPage,
  "/video-subtitles/style": SubtitlesStylePage,
  "/video-subtitles/style/custom-css": SubtitlesCustomCssPage,
  "/video-subtitles/prompts": SubtitlesCustomPromptsPage,
  "/video-subtitles/subtitles-queue": SubtitlesQueuePage,
}

function RouteLoadingFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      Loading settings...
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {ROUTE_DEFS.map(({ path }) => {
          const Component = ROUTE_COMPONENTS[path]
          return <Route key={path} path={path} element={<Component />} />
        })}
      </Routes>
    </Suspense>
  )
}
