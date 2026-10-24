import debounce from "debounce"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo } from "react"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { detectLanguage } from "@/utils/content/language"
import { detectedSourceLangCodeAtom } from "../atoms"

const DETECTION_DEBOUNCE_MS = 1000

/**
 * Detects the language `auto` stands for from `text`, a second after it stops
 * changing. Clearing the debounce cannot recall a detection already in flight
 * (an LLM call can take seconds), so each one asks before writing whether its
 * text is still the current one: otherwise switching from an English draft to
 * a Spanish subtitle file could end on English.
 */
export function useSourceLanguageDetection(text: string): void {
  const setDetectedSourceLangCode = useSetAtom(detectedSourceLangCodeAtom)
  const languageDetection = useAtomValue(configFieldsAtomMap.languageDetection)
  const enableLLM = languageDetection.mode === "llm"

  const debouncedDetect = useMemo(
    () =>
      debounce(async (value: string, isCurrent: () => boolean) => {
        const detected = await detectLanguage(value, { minLength: 1, enableLLM })
        if (isCurrent()) {
          setDetectedSourceLangCode(detected)
        }
      }, DETECTION_DEBOUNCE_MS),
    [setDetectedSourceLangCode, enableLLM],
  )

  useEffect(() => {
    let current = true
    void debouncedDetect(text, () => current)
    return () => {
      debouncedDetect.clear()
      // Retires a detection already in flight, including on unmount.
      current = false
    }
  }, [text, debouncedDetect])
}
