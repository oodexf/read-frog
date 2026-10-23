import type { SubtitlesFragment } from "../types"
import type { SubtitlesVideoContext } from "./translator"
import type { Config } from "@/types/config/config"
import { TRANSLATION_BATCH_SIZE } from "@/utils/constants/subtitles"
import { translateSubtitles } from "./translator"

export interface BatchTranslateOptions {
  /** How many batches are in flight at once. */
  concurrency: number
  /** Runs as each batch lands; throwing aborts the run (a cancelled job, a batch the caller can't use). */
  onBatchTranslated?: (source: SubtitlesFragment[], translated: SubtitlesFragment[]) => void
  /** Runs once per batch, in order, after its window settles, with the fragments done so far. */
  onProgress?: (translated: readonly SubtitlesFragment[]) => void
}

function buildTranslationBatches(fragments: SubtitlesFragment[]): SubtitlesFragment[][] {
  const batches: SubtitlesFragment[][] = []

  for (let index = 0; index < fragments.length; index += TRANSLATION_BATCH_SIZE) {
    batches.push(fragments.slice(index, index + TRANSLATION_BATCH_SIZE))
  }

  return batches
}

/**
 * Translates a whole track ahead of time, for the exports that write a file
 * rather than follow playback. Fragments come back in order; a line whose
 * request failed comes back with an empty translation, as `translateSubtitles`
 * returns it, unless `onBatchTranslated` throws on it.
 */
export async function translateFragmentsInBatches(
  fragments: SubtitlesFragment[],
  videoContext: SubtitlesVideoContext,
  config: Config,
  { concurrency, onBatchTranslated, onProgress }: BatchTranslateOptions,
): Promise<SubtitlesFragment[]> {
  const translatedFragments: SubtitlesFragment[] = []
  const batches = buildTranslationBatches(fragments)

  for (let index = 0; index < batches.length; index += concurrency) {
    const batchWindow = batches.slice(index, index + concurrency)
    const translatedBatchWindow = await Promise.all(
      batchWindow.map(async (batch) => {
        const translatedBatch = await translateSubtitles(batch, videoContext, config)
        onBatchTranslated?.(batch, translatedBatch)
        return translatedBatch
      }),
    )
    for (const translatedBatch of translatedBatchWindow) {
      translatedFragments.push(...translatedBatch)
      onProgress?.(translatedFragments)
    }
  }

  return translatedFragments
}
