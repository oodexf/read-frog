import type { SubtitleOutputOptions } from "./types"

const LINE_BREAK_PATTERN = /\n/

/** One translation as display lines: trimmed, no blank lines (a blank line ends an SRT/VTT cue). */
export function toTranslationLines(translation: string | undefined): string[] {
  return (translation ?? "")
    .replace(/\r\n?/g, "\n")
    .split(LINE_BREAK_PATTERN)
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Splits a document into blank-line separated blocks, each as its lines. */
export function splitBlocks(text: string): string[][] {
  return text
    .split(/\n[ \t]*\n/)
    .map((block) => block.split("\n"))
    .map((lines) => {
      // A block can open with stray blank lines when the file uses several in a row.
      while (lines.length > 0 && lines[0]!.trim() === "") lines.shift()
      while (lines.length > 0 && lines.at(-1)!.trim() === "") lines.pop()
      return lines
    })
    .filter((lines) => lines.length > 0)
}

/** `hh:mm:ss,mmm`, `hh:mm:ss.mmm` or `mm:ss.mmm` to milliseconds. */
export function parseClockTimestamp(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(value.trim())
  if (!match) {
    return null
  }
  const [, hours = "0", minutes, seconds, fraction] = match
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1000 +
    Number(fraction!.padEnd(3, "0"))
  )
}

export const CUE_TIMING_PATTERN = /^\s*(\S+)\s+-->\s+(\S+)/

export function parseCueTiming(line: string): { start: number; end: number } | null {
  const match = CUE_TIMING_PATTERN.exec(line)
  if (!match) {
    return null
  }
  const start = parseClockTimestamp(match[1]!)
  const end = parseClockTimestamp(match[2]!)
  return start === null || end === null ? null : { start, end }
}

/**
 * The payload lines a cue is written back with. `leadingTags` matches markup
 * that positions the whole cue (an SRT `{\an8}`), which must stay at the very
 * start whichever line ends up on top.
 */
export function composeCuePayload(
  rawLines: readonly string[],
  translationLines: readonly string[],
  options: SubtitleOutputOptions,
  leadingTags?: RegExp,
): string[] {
  if (translationLines.length === 0) {
    return [...rawLines]
  }

  const [firstRawLine = "", ...restRawLines] = rawLines
  const prefix = leadingTags?.exec(firstRawLine)?.[0] ?? ""
  const [firstTranslationLine, ...restTranslationLines] = translationLines

  if (options.mode === "translationOnly") {
    return [prefix + firstTranslationLine, ...restTranslationLines]
  }
  if (!options.translationFirst) {
    return [...rawLines, ...translationLines]
  }

  const bodyLines = [firstRawLine.slice(prefix.length), ...restRawLines].filter(
    (line, index) => index > 0 || line.trim() !== "",
  )
  return [prefix + firstTranslationLine, ...restTranslationLines, ...bodyLines]
}
