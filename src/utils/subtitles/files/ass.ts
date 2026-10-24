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
/** `\p1` and up switch to vector drawing, `\p0` back to text; `\pos` and `\pbo` don't match. */
const DRAWING_TAG_PATTERN = /\\p(\d+)/g

type AssLine =
  | { kind: "raw"; line: string }
  | { kind: "dialogue"; fields: string; text: string; unitIndex: number }

interface AssSegment {
  raw: string
  /** An override block (`{...}`) rather than text. */
  isTags: boolean
  /** The drawing mode in effect: text drawn in it is path commands, not words. */
  drawing: boolean
}

/**
 * Splits dialogue into override blocks and the text between them, following
 * drawing mode as it switches on and off. A line can draw a shape and then go
 * back to words (`{\p1}m 0 0 l 10 10{\p0}Hello`), so mode is per segment, not
 * per line.
 */
function tokenizeAssText(text: string): { segments: AssSegment[]; endsInDrawing: boolean } {
  const segments: AssSegment[] = []
  let drawing = false
  let cursor = 0

  for (const block of text.matchAll(OVERRIDE_BLOCK_PATTERN)) {
    if (block.index > cursor) {
      segments.push({ raw: text.slice(cursor, block.index), isTags: false, drawing })
    }
    for (const tag of block[0].matchAll(DRAWING_TAG_PATTERN)) {
      drawing = Number(tag[1]) > 0
    }
    segments.push({ raw: block[0], isTags: true, drawing })
    cursor = block.index + block[0].length
  }
  if (cursor < text.length) {
    segments.push({ raw: text.slice(cursor), isTags: false, drawing })
  }

  return { segments, endsInDrawing: drawing }
}

function toPlainText(raw: string): string {
  return raw.replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ")
}

function isDialogueSegment(segment: AssSegment): boolean {
  return !segment.isTags && !segment.drawing && toPlainText(segment.raw).trim() !== ""
}

export function cleanAssText(text: string): string {
  return tokenizeAssText(text)
    .segments.filter((segment) => !segment.isTags && !segment.drawing)
    .map((segment) => toPlainText(segment.raw))
    .join("")
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
  const { segments, endsInDrawing } = tokenizeAssText(rawText)
  // Everything before the first words: position tags and any shape drawn ahead
  // of the dialogue, which stay first whichever line goes on top.
  const firstDialogue = segments.findIndex(isDialogueSegment)
  const prefix = segments
    .slice(0, Math.max(firstDialogue, 0))
    .map((segment) => segment.raw)
    .join("")
  const body = rawText.slice(prefix.length)

  if (options.mode === "translationOnly") {
    return prefix + translated
  }
  if (options.translationFirst) {
    return `${prefix}${translated}\\N${body}`
  }
  // A line that ends in drawing mode would draw the translation as path
  // commands, so drawing is switched off first. Inline overrides in the
  // original (an unclosed `{\i1}`, a colour) would also run on into the
  // translation; `\r` resets to the line's style and leaves the line-wide
  // position tags alone.
  const endDrawing = endsInDrawing ? "{\\p0}" : ""
  const reset = HAS_OVERRIDE_BLOCK_PATTERN.test(body) ? "{\\r}" : ""
  return `${rawText}${endDrawing}\\N${reset}${translated}`
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
