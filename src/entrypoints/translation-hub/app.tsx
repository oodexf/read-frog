import { Icon } from "@iconify/react"
import { useAtomValue } from "jotai"
import { useState } from "react"
import { PageLayout } from "@/components/page-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/base-ui/tabs"
import { i18n } from "@/utils/i18n"
import { inputTextAtom } from "./atoms"
import { LanguageControlPanel } from "./components/language-control-panel"
import { PromptSelector } from "./components/prompt-selector"
import { TextInput } from "./components/text-input"
import { TranslationPanel } from "./components/translation-panel"
import { TranslationPanelActions } from "./components/translation-panel-actions"
import { TranslationServiceDropdown } from "./components/translation-service-dropdown"
import { subtitleFileDetectionTextAtom } from "./subtitle-file/atoms"
import { SubtitleFileTab } from "./subtitle-file/subtitle-file-tab"
import { SubtitleProviderSelector } from "./subtitle-file/subtitle-provider-selector"

type HubTab = "text" | "subtitles"

/** `#subtitles` opens the subtitle file tab, so it can be linked to directly. */
const SUBTITLES_HASH = "#subtitles"

function readTabFromHash(): HubTab {
  return window.location.hash === SUBTITLES_HASH ? "subtitles" : "text"
}

export default function App() {
  const [tab, setTab] = useState<HubTab>(readTabFromHash)
  const inputText = useAtomValue(inputTextAtom)
  const subtitleDetectionText = useAtomValue(subtitleFileDetectionTextAtom)

  const handleTabChange = (value: HubTab) => {
    setTab(value)
    const { pathname, search } = window.location
    window.history.replaceState(
      null,
      "",
      `${pathname}${search}${value === "subtitles" ? SUBTITLES_HASH : ""}`,
    )
  }

  return (
    <div className="min-h-screen">
      <PageLayout title={i18n.t("translationHub.title")}>
        <Tabs value={tab} onValueChange={handleTabChange} className="gap-6">
          <TabsList>
            <TabsTrigger value="text">
              <Icon icon="tabler:align-left" />
              {i18n.t("translationHub.tabs.text")}
            </TabsTrigger>
            <TabsTrigger value="subtitles">
              <Icon icon="tabler:file-text" />
              {i18n.t("translationHub.tabs.subtitleFile")}
            </TabsTrigger>
          </TabsList>

          {/* One language row for both tabs: `auto` is detected from whichever tab
              is showing, since both read the same detected-language atom. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <LanguageControlPanel
              detectionText={tab === "text" ? inputText : subtitleDetectionText}
            />
            <div className="flex justify-end lg:h-full lg:items-end">
              {tab === "text" ? (
                <div className="flex max-w-full min-w-0 items-center gap-2">
                  <PromptSelector />
                  <TranslationServiceDropdown />
                  <TranslationPanelActions />
                </div>
              ) : (
                <SubtitleProviderSelector />
              )}
            </div>
          </div>

          {/* Kept mounted: remounting the text tab would re-run every card's translation. */}
          <TabsContent value="text" keepMounted>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Wrapped: as a stretched grid item the input's absolutely placed
                  buttons would drop to the bottom of a tall translation column. */}
              <div>
                <TextInput />
              </div>
              <div>
                <TranslationPanel />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="subtitles" keepMounted>
            <SubtitleFileTab />
          </TabsContent>
        </Tabs>
      </PageLayout>
    </div>
  )
}
