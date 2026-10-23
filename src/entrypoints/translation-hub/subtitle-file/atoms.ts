import type { LangCodeISO6393 } from "@read-frog/definitions"
import type {
  LegacySubtitleEncoding,
  ParsedSubtitleFile,
  SubtitleEncoding,
  SubtitleOutputOptions,
} from "@/utils/subtitles/files"
import { atom } from "jotai"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { detectLanguage } from "@/utils/content/language"
import { i18n } from "@/utils/i18n"
import { sourceLangCodeAtom, targetLangCodeAtom } from "../atoms"
import { loadSubtitleFile } from "./load-subtitle-file"
import { translateSubtitleFile } from "./translate-subtitle-file"

/** Enough dialogue for language detection without sending a whole film to an LLM detector. */
const DETECTION_SAMPLE_MAX_CHARS = 1000

export interface LoadedSubtitleFile {
  name: string
  /** Kept so a legacy file can be read again in the encoding the user picks. */
  bytes: Uint8Array
  parsed: ParsedSubtitleFile
  /** A legacy (non-Unicode) encoding is a guess the user may need to correct. */
  encoding: SubtitleEncoding
}

interface SubtitleFileTranslations {
  /** The languages these were made for: switching either one makes them stale. */
  sourceCode: LangCodeISO6393 | "auto"
  targetCode: LangCodeISO6393
  /** What `auto` resolved to for this file; names the source side of a bilingual download. */
  detectedSourceCode: LangCodeISO6393 | null
  values: string[]
}

export type SubtitleFileRunState =
  | { status: "idle" }
  | { status: "running" }
  /** `errorMessage`: why the lines still untranslated failed, when some did. */
  | { status: "done"; errorMessage: string | null }
  | { status: "error"; message: string }

export const subtitleFileAtom = atom<LoadedSubtitleFile | null>(null)

export const subtitleOutputOptionsAtom = atom<SubtitleOutputOptions>({
  mode: "bilingual",
  translationFirst: false,
})

export const subtitleFileRunStateAtom = atom<SubtitleFileRunState>({ status: "idle" })

const subtitleFileTranslationsStoreAtom = atom<SubtitleFileTranslations | null>(null)

/** One entry per unit, empty where a line has no translation yet (or the languages changed). */
export const subtitleFileTranslationsAtom = atom((get) => {
  const file = get(subtitleFileAtom)
  const stored = get(subtitleFileTranslationsStoreAtom)
  const units = file?.parsed.units ?? []
  if (
    !stored ||
    stored.sourceCode !== get(sourceLangCodeAtom) ||
    stored.targetCode !== get(targetLangCodeAtom)
  ) {
    return units.map(() => "")
  }
  return units.map((_, index) => stored.values[index] ?? "")
})

export const subtitleFileDetectedSourceCodeAtom = atom(
  (get) => get(subtitleFileTranslationsStoreAtom)?.detectedSourceCode ?? null,
)

export const subtitleFileTranslatedCountAtom = atom(
  (get) => get(subtitleFileTranslationsAtom).filter(Boolean).length,
)

export const subtitleFileDetectionTextAtom = atom((get) => {
  const units = get(subtitleFileAtom)?.parsed.units ?? []
  let sample = ""
  for (const unit of units) {
    if (sample.length >= DETECTION_SAMPLE_MAX_CHARS) break
    sample += `${unit.text}\n`
  }
  return sample.slice(0, DETECTION_SAMPLE_MAX_CHARS)
})

// Module scope rather than component state: a run keeps going when the user
// switches to the text tab, and has to be cancellable when they come back.
let activeController: AbortController | null = null

function abortActiveRun() {
  activeController?.abort()
  activeController = null
}

export const setSubtitleFileAtom = atom(null, (_get, set, file: LoadedSubtitleFile | null) => {
  abortActiveRun()
  set(subtitleFileAtom, file)
  set(subtitleFileTranslationsStoreAtom, null)
  set(subtitleFileRunStateAtom, { status: "idle" })
})

/**
 * Re-reads the loaded file in another legacy encoding. Translations made from
 * the garbled text are dropped with it. Returns an error message when the file
 * no longer parses that way, and keeps the current reading.
 */
export const changeSubtitleFileEncodingAtom = atom(
  null,
  (get, set, encoding: LegacySubtitleEncoding): string | null => {
    const file = get(subtitleFileAtom)
    if (!file) return null
    const result = loadSubtitleFile(file.name, file.bytes, encoding)
    if ("error" in result) return result.error
    set(setSubtitleFileAtom, result.file)
    return null
  },
)

export const cancelSubtitleFileTranslationAtom = atom(null, (_get, set) => {
  abortActiveRun()
  // What already came back stays, so "translate the rest" picks up from there.
  set(subtitleFileRunStateAtom, { status: "idle" })
})

/** Translates every line that has no translation yet: the whole file on a first run. */
export const translateSubtitleFileAtom = atom(null, async (get, set) => {
  const file = get(subtitleFileAtom)
  if (!file || get(subtitleFileRunStateAtom).status === "running") return

  abortActiveRun()
  const controller = new AbortController()
  activeController = controller

  const sourceCode = get(sourceLangCodeAtom)
  const targetCode = get(targetLangCodeAtom)
  const previousTranslations = get(subtitleFileTranslationsAtom)
  let detectedSourceCode: LangCodeISO6393 | null = null
  const store = (values: readonly string[]) => {
    if (activeController !== controller) return
    set(subtitleFileTranslationsStoreAtom, {
      sourceCode,
      targetCode,
      detectedSourceCode,
      values: [...values],
    })
  }

  set(subtitleFileRunStateAtom, { status: "running" })
  try {
    // Detected here rather than read from the language panel, whose debounced
    // detection may still hold the text tab's language right after a switch.
    if (sourceCode === "auto") {
      detectedSourceCode = await detectLanguage(get(subtitleFileDetectionTextAtom), {
        minLength: 1,
        enableLLM: get(configFieldsAtomMap.languageDetection).mode === "llm",
      })
    }
    const { translations, stoppedEarly, errorMessage } = await translateSubtitleFile({
      title: file.name.replace(/\.[^.]+$/, ""),
      units: file.parsed.units,
      sourceCode,
      detectedSourceCode,
      targetCode,
      previousTranslations,
      signal: controller.signal,
      onProgress: store,
    })
    store(translations)
    if (activeController === controller) {
      set(
        subtitleFileRunStateAtom,
        stoppedEarly
          ? {
              status: "error",
              message: i18n.t("translationHub.subtitleFile.stopped", [
                // The template ends the sentence itself.
                (errorMessage ?? i18n.t("subtitles.errors.translatedExportIncomplete")).replace(
                  /[.。!！]+$/,
                  "",
                ),
              ]),
            }
          : { status: "done", errorMessage },
      )
    }
  } catch (error) {
    if (activeController !== controller || controller.signal.aborted) return
    set(subtitleFileRunStateAtom, {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    if (activeController === controller) {
      activeController = null
    }
  }
})
