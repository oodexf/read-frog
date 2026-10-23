import type { ParsedSubtitleFile, SubtitleOutputOptions, SubtitleUnit } from "./types"
import { parseClockTimestamp, toTranslationLines } from "./shared"

/** The v4+ default, for the rare file whose [Events] section has no Format line. */
const DEFAULT_EVENT_FORMAT = [
  "layer",
  "start",
  "end",
  "style",
  "name",
  "marginl",
  "marginr",
  "marginv",
  "effect",
  "text",
]

const SECTION_PATTERN = /^\[[^\]]+\]$/
const FORMAT_LINE_PATTERN = /^format\s*:/i
const DIALOGUE_LINE_PATTERN = /^dialogue\s*:/i
const OVERRIDE_BLOCK_PATTERN = /\{[^}]*\}/g
const HAS_OVERRIDE_BLOCK_PATTERN = /\{[^}]*\}/
const LEADING_OVERRIDE_BLOCKS_PATTERN = /^(?:\{[^}]*\})+/
/** `\p1` and up switch a line into vector drawing mode: its "text" is path commands. */
const DRAWING_MODE_PATTERN = /\{[^}]*\\p[1-9]/

type AssLine =
  | { kind: "raw"; line: string }
  | { kind: "dialogue"; fields: string; text: string; unitIndex: number }

export function cleanAssText(text: string): string {
  if (DRAWING_MODE_PATTERN.test(text)) {
    return ""
  }
  return text
    .replace(OVERRIDE_BLOCK_PATTERN, "")
    .replace(/\\[Nn]/g, "\n")
    .replace(/\\h/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
}

/** Index of the comma that ends field `count` (1-based), or -1. */
function findFieldSeparator(value: string, count: number): number {
  let position = -1
  for (let index = 0; index < count; index++) {
    position = value.indexOf(",", position + 1)
    if (position === -1) {
      return -1
    }
  }
  return position
}

function composeAssText(
  rawText: string,
  translation: string | undefined,
  options: SubtitleOutputOptions,
): string {
  // Braces would open an override block, so they cannot reach the file as text.
  const translationLines = toTranslationLines(translation).map((line) => line.replace(/[{}]/g, ""))
  if (translationLines.length === 0) {
    return rawText
  }

  const translated = translationLines.join("\\N")
  const leading = LEADING_OVERRIDE_BLOCKS_PATTERN.exec(rawText)?.[0] ?? ""
  const body = rawText.slice(leading.length)

  if (options.mode === "translationOnly") {
    return leading + translated
  }
  if (options.translationFirst) {
    return `${leading}${translated}\\N${body}`
  }
  // Inline overrides in the original (an unclosed `{\i1}`, a colour) would run on
  // into the translation; `\r` resets to the line's style, and leaves the
  // line-wide position tags alone.
  const reset = HAS_OVERRIDE_BLOCK_PATTERN.test(body) ? "{\\r}" : ""
  return `${rawText}\\N${reset}${translated}`
}

export function parseAss(text: string): ParsedSubtitleFile {
  const units: SubtitleUnit[] = []
  let section = ""
  let format = DEFAULT_EVENT_FORMAT

  const lines: AssLine[] = text.split("\n").map((line) => {
    const trimmed = line.trim()
    if (SECTION_PATTERN.test(trimmed)) {
      section = trimmed.toLowerCase()
      return { kind: "raw", line }
    }
    if (section !== "[events]") {
      return { kind: "raw", line }
    }
    if (FORMAT_LINE_PATTERN.test(trimmed)) {
      format = trimmed
        .slice(trimmed.indexOf(":") + 1)
        .split(",")
        .map((field) => field.trim().toLowerCase())
      return { kind: "raw", line }
    }
    if (!DIALOGUE_LINE_PATTERN.test(trimmed) || format.at(-1) !== "text") {
      return { kind: "raw", line }
    }

    // Text is the last field and the only one that may contain commas.
    const valueStart = line.indexOf(":") + 1
    const separator = findFieldSeparator(line.slice(valueStart), format.length - 1)
    if (separator === -1) {
      return { kind: "raw", line }
    }

    const fields = line.slice(0, valueStart + separator + 1)
    const rawText = line.slice(valueStart + separator + 1)
    const cleaned = cleanAssText(rawText)
    if (!cleaned) {
      return { kind: "raw", line }
    }

    const values = line.slice(valueStart).split(",")
    const start = parseClockTimestamp(values[format.indexOf("start")] ?? "") ?? 0
    const end = parseClockTimestamp(values[format.indexOf("end")] ?? "") ?? start

    units.push({ text: cleaned, start, end })
    return { kind: "dialogue", fields, text: rawText, unitIndex: units.length - 1 }
  })

  return {
    format: "ass",
    units,
    serialize: (translations, options) =>
      lines
        .map((line) =>
          line.kind === "raw"
            ? line.line
            : line.fields + composeAssText(line.text, translations[line.unitIndex], options),
        )
        .join("\n"),
  }
}
