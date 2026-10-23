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
  /**
   * Without this, a batch whose request throws fails the whole run, which is
   * what an export that must be complete wants. With it, the batch comes back
   * untranslated and the run carries on; throwing from it still aborts.
   */
  onBatchFailed?: (source: SubtitlesFragment[], error: unknown) => void
  /** Checked before each window starts: true ends the run with what is done so far. */
  shouldStop?: () => boolean
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
 * returns it, unless `onBatchTranslated` throws on it. A run that `shouldStop`
 * ends early returns fewer fragments than it was given.
 */
export async function translateFragmentsInBatches(
  fragments: SubtitlesFragment[],
  videoContext: SubtitlesVideoContext,
  config: Config,
  { concurrency, onBatchTranslated, onBatchFailed, shouldStop, onProgress }: BatchTranslateOptions,
): Promise<SubtitlesFragment[]> {
  const translatedFragments: SubtitlesFragment[] = []
  const batches = buildTranslationBatches(fragments)

  for (let index = 0; index < batches.length; index += concurrency) {
    if (shouldStop?.()) {
      break
    }

    const batchWindow = batches.slice(index, index + concurrency)
    const translatedBatchWindow = await Promise.all(
      batchWindow.map(async (batch) => {
        let translatedBatch: SubtitlesFragment[]
        try {
          translatedBatch = await translateSubtitles(batch, videoContext, config)
        } catch (error) {
          if (!onBatchFailed) {
            throw error
          }
          // Caught per batch so the other batch in the window keeps its lines.
          onBatchFailed(batch, error)
          return batch.map((fragment) => ({ ...fragment, translation: "" }))
        }
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
