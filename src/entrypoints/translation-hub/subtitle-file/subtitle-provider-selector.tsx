import { HelpTooltip } from "@/components/help-tooltip"
import ProviderSelector from "@/components/llm-providers/provider-selector"
import { SetApiKeyWarning } from "@/components/llm-providers/set-api-key-warning"
import { useFeatureProvider } from "@/components/llm-providers/use-feature-providers"
import { i18n } from "@/utils/i18n"

/** The video subtitles provider, edited in place: a file is translated the way a video would be. */
export function SubtitleProviderSelector() {
  const { providers, providerId, providerConfig, setProviderId } =
    useFeatureProvider("videoSubtitles")

  return (
    <div className="flex min-w-0 items-center gap-2">
      <SetApiKeyWarning providerConfig={providerConfig} />
      <ProviderSelector
        providers={providers}
        value={providerId}
        onChange={setProviderId}
        className="w-56 min-w-0"
      />
      <HelpTooltip>{i18n.t("translationHub.subtitleFile.providerHint")}</HelpTooltip>
    </div>
  )
}
