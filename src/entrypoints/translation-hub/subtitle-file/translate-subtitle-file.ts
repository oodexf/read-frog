import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { SubtitleUnit } from "@/utils/subtitles/files"
import type { SubtitlesVideoContext } from "@/utils/subtitles/processor/translator"
import { getLocalConfig } from "@/utils/config/storage"
import { i18n } from "@/utils/i18n"
import { canProviderRefGenerateText } from "@/utils/providers/provider-ref"
import { translateFragmentsInBatches } from "@/utils/subtitles/processor/batch-translate"
import {
  buildSubtitlesSummaryContextHash,
  fetchSubtitlesSummary,
  resolveSubtitlesProviderRef,
} from "@/utils/subtitles/processor/translator"

/** Same pace as the video export: the background queue owns the real rate limit. */
const SUBTITLE_FILE_BATCH_CONCURRENCY = 2

/**
 * Two full windows in a row with nothing translated: the provider is down or
 * refusing (a bad key, a spent quota), and the rest of the file would only
 * queue up the same failure hundreds of times.
 */
const MAX_CONSECUTIVE_FAILED_BATCHES = SUBTITLE_FILE_BATCH_CONCURRENCY * 2

export interface SubtitleFileTranslationRequest {
  /** Stands in for the video title in the prompt context. */
  title: string
  units: readonly SubtitleUnit[]
  sourceCode: LangCodeISO6393 | "auto"
  /** What `auto` resolved to for this file, for the same-language check. */
  detectedSourceCode: LangCodeISO6393 | null
  targetCode: LangCodeISO6393
  /**
   * A previous run's output. Lines it already translated are kept as they are
   * and only the empty ones are sent again, so retrying a partial run costs
   * just the lines that failed.
   */
  previousTranslations?: readonly string[]
  signal?: AbortSignal
  onProgress?: (translations: readonly string[]) => void
}

export interface SubtitleFileTranslationResult {
  /** `translations[i]` belongs to `units[i]`; empty where the line failed. */
  translations: string[]
  failedCount: number
  /** True when repeated failures ended the run before every line was tried. */
  stoppedEarly: boolean
  /** Why the last failed batch failed, for showing next to the untranslated count. */
  errorMessage: string | null
}

export class SubtitleFileTranslationError extends Error {}

export async function translateSubtitleFile({
  title,
  units,
  sourceCode,
  detectedSourceCode,
  targetCode,
  previousTranslations,
  signal,
  onProgress,
}: SubtitleFileTranslationRequest): Promise<SubtitleFileTranslationResult> {
  const effectiveSourceCode = sourceCode === "auto" ? detectedSourceCode : sourceCode
  if (effectiveSourceCode === targetCode) {
    throw new SubtitleFileTranslationError(i18n.t("subtitles.errors.translatedExportSameLanguage"))
  }

  const storedConfig = await getLocalConfig()
  signal?.throwIfAborted()
  if (!storedConfig) {
    throw new SubtitleFileTranslationError(i18n.t("subtitles.errors.translatedExportFailed"))
  }
  // The hub picks its own languages; everything else (provider, glossary,
  // context awareness) follows the video subtitles settings.
  const config = {
    ...storedConfig,
    language: { ...storedConfig.language, sourceCode, targetCode },
  }

  const providerRef = await resolveSubtitlesProviderRef(config, "lineTranslation")
  signal?.throwIfAborted()
  if (!providerRef) {
    throw new SubtitleFileTranslationError(i18n.t("translationHub.subtitleFile.errors.noProvider"))
  }
  const promptableProviderRef = canProviderRefGenerateText(providerRef) ? providerRef : null

  const videoContext: SubtitlesVideoContext = {
    videoTitle: title,
    subtitlesTextContent: units.map((unit) => unit.text).join("\n"),
  }
  if (buildSubtitlesSummaryContextHash(videoContext, promptableProviderRef ?? undefined)) {
    try {
      videoContext.summary = await fetchSubtitlesSummary(
        videoContext,
        config,
        promptableProviderRef,
      )
    } catch {
      videoContext.summary = null
    }
    signal?.throwIfAborted()
  }

  const translations = units.map((_, index) => previousTranslations?.[index]?.trim() ?? "")
  const pendingIndexes = translations.flatMap((translation, index) => (translation ? [] : [index]))
  onProgress?.([...translations])

  // A failed batch must not cost the batches around it: they keep their lines,
  // the run moves on, and "translate the rest" resends only what is still empty.
  let consecutiveFailedBatches = 0
  let lastErrorMessage: string | null = null
  const pendingFragments = pendingIndexes.map((index) => ({ ...units[index]! }))
  const translatedFragments = await translateFragmentsInBatches(
    pendingFragments,
    videoContext,
    config,
    {
      concurrency: SUBTITLE_FILE_BATCH_CONCURRENCY,
      onBatchTranslated: (_batch, translatedBatch) => {
        signal?.throwIfAborted()
        consecutiveFailedBatches = translatedBatch.some((fragment) => fragment.translation?.trim())
          ? 0
          : consecutiveFailedBatches + 1
      },
      onBatchFailed: (_batch, error) => {
        signal?.throwIfAborted()
        lastErrorMessage =
          error instanceof Error && error.message
            ? error.message
            : i18n.t("subtitles.errors.translatedExportIncomplete")
        consecutiveFailedBatches += 1
      },
      shouldStop: () => consecutiveFailedBatches >= MAX_CONSECUTIVE_FAILED_BATCHES,
      onProgress: (translated) => {
        signal?.throwIfAborted()
        translated.forEach((fragment, position) => {
          translations[pendingIndexes[position]!] = fragment.translation?.trim() ?? ""
        })
        onProgress?.([...translations])
      },
    },
  )

  return {
    translations,
    failedCount: translations.filter((translation) => !translation).length,
    stoppedEarly: translatedFragments.length < pendingFragments.length,
    errorMessage: lastErrorMessage,
  }
}
