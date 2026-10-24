import { Icon } from "@iconify/react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Button } from "@/components/ui/base-ui/button"
import { i18n } from "@/utils/i18n"
import {
  detectedLangCodeAtom,
  exchangeLangCodesAtom,
  inputTextAtom,
  sourceLangCodeAtom,
  targetLangCodeAtom,
} from "../atoms"
import { SearchableLanguageSelector } from "./searchable-language-selector"
import { useSourceLanguageDetection } from "./use-source-language-detection"

interface LanguageControlPanelProps {
  /** The text `auto` is detected from; defaults to the text tab's input. */
  detectionText?: string
}

export function LanguageControlPanel({ detectionText }: LanguageControlPanelProps) {
  const [sourceLangCode, setSourceLangCode] = useAtom(sourceLangCodeAtom)
  const [targetLangCode, setTargetLangCode] = useAtom(targetLangCodeAtom)
  const exchangeLangCodes = useSetAtom(exchangeLangCodesAtom)
  const inputText = useAtomValue(inputTextAtom)
  const detectedLangCode = useAtomValue(detectedLangCodeAtom)
  useSourceLanguageDetection(detectionText ?? inputText)

  return (
    <div className="flex w-full items-center gap-3">
      <SearchableLanguageSelector
        className="min-w-0 flex-1"
        value={sourceLangCode}
        onValueChange={setSourceLangCode}
        detectedLangCode={detectedLangCode}
        label={i18n.t("side.sourceLang")}
      />

      <div className="shrink-0 self-end pb-0.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={exchangeLangCodes}
          title={i18n.t("translationHub.exchangeLanguages")}
        >
          <Icon icon="tabler:arrows-exchange" className="h-4 w-4" />
        </Button>
      </div>

      <SearchableLanguageSelector
        className="min-w-0 flex-1"
        value={targetLangCode}
        onValueChange={(value) => {
          if (value !== "auto") void setTargetLangCode(value)
        }}
        label={i18n.t("side.targetLang")}
      />
    </div>
  )
}
