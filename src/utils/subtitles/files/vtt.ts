import type { ParsedSubtitleFile, SubtitleUnit } from "./types"
import { cleanCueText } from "@/utils/subtitles/fetchers/text-track/cues"
import { composeCuePayload, parseCueTiming, splitBlocks, toTranslationLines } from "./shared"

/** Blocks WebVTT defines besides cues; they carry no dialogue and pass through as written. */
const NON_CUE_BLOCK_PATTERN = /^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/

interface VttBlock {
  head: string[]
  payload: string[]
  unitIndex: number | null
}

/** Cue text is markup: a bare `<` or `&` in a translation would be read as a tag or an entity. */
function escapeCueText(line: string): string {
  return line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

export function parseVtt(text: string): ParsedSubtitleFile {
  const units: SubtitleUnit[] = []
  const blocks: VttBlock[] = splitBlocks(text).map((lines) => {
    if (NON_CUE_BLOCK_PATTERN.test(lines[0]!)) {
      return { head: lines, payload: [], unitIndex: null }
    }

    // The timing line is first, or second after an optional cue identifier.
    const timingIndex = lines.slice(0, 2).findIndex((line) => parseCueTiming(line) !== null)
    if (timingIndex === -1) {
      return { head: lines, payload: [], unitIndex: null }
    }

    const timing = parseCueTiming(lines[timingIndex]!)!
    const head = lines.slice(0, timingIndex + 1)
    const payload = lines.slice(timingIndex + 1)
    const cleaned = cleanCueText(payload.join("\n"))
    if (!cleaned) {
      return { head, payload, unitIndex: null }
    }

    units.push({ text: cleaned, ...timing })
    return { head, payload, unitIndex: units.length - 1 }
  })

  return {
    format: "vtt",
    units,
    serialize: (translations, options) =>
      `${blocks
        .map((block) => {
          const payload =
            block.unitIndex === null
              ? block.payload
              : composeCuePayload(
                  block.payload,
                  toTranslationLines(translations[block.unitIndex]).map(escapeCueText),
                  options,
                )
          return [...block.head, ...payload].join("\n")
        })
        .join("\n\n")}\n`,
  }
}
