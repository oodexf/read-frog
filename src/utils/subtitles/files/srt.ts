import type { ParsedSubtitleFile, SubtitleUnit } from "./types"
import { cleanCueText } from "@/utils/subtitles/fetchers/text-track/cues"
import { composeCuePayload, parseCueTiming, splitBlocks, toTranslationLines } from "./shared"

/** SSA-style override tags some SRT files carry, e.g. `{\an8}` to lift a line to the top. */
const OVERRIDE_TAG_PATTERN = /\{\\[^}]*\}/g
const LEADING_OVERRIDE_TAGS_PATTERN = /^(?:\{\\[^}]*\})+/

interface SrtBlock {
  /** Index and timing lines, or the whole block when it is not a cue. */
  head: string[]
  payload: string[]
  unitIndex: number | null
}

export function cleanSrtText(text: string): string {
  return cleanCueText(text.replace(OVERRIDE_TAG_PATTERN, ""))
}

export function parseSrt(text: string): ParsedSubtitleFile {
  const units: SubtitleUnit[] = []
  const blocks: SrtBlock[] = splitBlocks(text).map((lines) => {
    const timingIndex = lines.findIndex((line) => parseCueTiming(line) !== null)
    if (timingIndex === -1) {
      return { head: lines, payload: [], unitIndex: null }
    }

    const timing = parseCueTiming(lines[timingIndex]!)!
    const head = lines.slice(0, timingIndex + 1)
    const payload = lines.slice(timingIndex + 1)
    const cleaned = cleanSrtText(payload.join("\n"))
    if (!cleaned) {
      return { head, payload, unitIndex: null }
    }

    units.push({ text: cleaned, ...timing })
    return { head, payload, unitIndex: units.length - 1 }
  })

  return {
    format: "srt",
    units,
    serialize: (translations, options) =>
      `${blocks
        .map((block) => {
          const payload =
            block.unitIndex === null
              ? block.payload
              : composeCuePayload(
                  block.payload,
                  toTranslationLines(translations[block.unitIndex]),
                  options,
                  LEADING_OVERRIDE_TAGS_PATTERN,
                )
          return [...block.head, ...payload].join("\n")
        })
        .join("\n\n")}\n`,
  }
}
