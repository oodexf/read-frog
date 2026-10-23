import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { ParsedSubtitleFile, SubtitleFileFormat, SubtitleOutputMode } from "./types"
import { ISO6393_TO_6391 } from "@read-frog/definitions"
import { parseAss } from "./ass"
import { parseSrt } from "./srt"
import { parseVtt } from "./vtt"

export {
  decodeSubtitleBuffer,
  guessLegacyEncoding,
  isLegacySubtitleEncoding,
  LEGACY_SUBTITLE_ENCODINGS,
} from "./decode"
export type { LegacySubtitleEncoding, SubtitleEncoding } from "./decode"
export type * from "./types"

export const SUBTITLE_FILE_EXTENSIONS = [".srt", ".vtt", ".ass", ".ssa"] as const

const FORMAT_BY_EXTENSION: Record<string, SubtitleFileFormat> = {
  srt: "srt",
  vtt: "vtt",
  ass: "ass",
  ssa: "ass",
}

export const SUBTITLE_FILE_MIME_TYPES: Record<SubtitleFileFormat, string> = {
  srt: "application/x-subrip",
  vtt: "text/vtt",
  ass: "text/x-ssa",
}

/** Plain-text extensions a subtitle file is sometimes saved under; the download drops them. */
const TEXT_EXTENSIONS = new Set(["txt", "text"])

function splitFileName(fileName: string): { base: string; extension: string } {
  const dot = fileName.lastIndexOf(".")
  return dot > 0
    ? { base: fileName.slice(0, dot), extension: fileName.slice(dot + 1) }
    : { base: fileName, extension: "" }
}

/** By extension first; the content decides for a file saved as .txt or with none. */
export function detectSubtitleFormat(fileName: string, text: string): SubtitleFileFormat | null {
  const byExtension = FORMAT_BY_EXTENSION[splitFileName(fileName).extension.toLowerCase()]
  if (byExtension) {
    return byExtension
  }

  const head = text.trimStart()
  if (head.startsWith("WEBVTT")) {
    return "vtt"
  }
  if (/^\[(?:Script Info|V4\+? Styles|Events)\]/im.test(head)) {
    return "ass"
  }
  if (head.includes("-->")) {
    return "srt"
  }
  return null
}

export function parseSubtitleFile(fileName: string, text: string): ParsedSubtitleFile | null {
  const format = detectSubtitleFormat(fileName, text)
  switch (format) {
    case "srt":
      return parseSrt(text)
    case "vtt":
      return parseVtt(text)
    case "ass":
      return parseAss(text)
    default:
      return null
  }
}

function toFileLanguageTag(code: LangCodeISO6393): string {
  return ISO6393_TO_6391[code] ?? code
}

/**
 * `movie.srt` becomes `movie.zh.srt`, or `movie.en-zh.srt` for a bilingual copy.
 * The extension is always one players recognise: a subtitle extension is kept
 * (`.ssa` stays `.ssa`), `.txt` gives way to the detected format's, and any
 * other suffix (`Movie.1080p`) stays part of the name.
 */
export function buildTranslatedSubtitleFileName(
  fileName: string,
  {
    sourceCode,
    targetCode,
    mode,
    format,
  }: {
    sourceCode: LangCodeISO6393 | null
    targetCode: LangCodeISO6393
    mode: SubtitleOutputMode
    format: SubtitleFileFormat
  },
): string {
  const { base, extension } = splitFileName(fileName)
  const normalizedExtension = extension.toLowerCase()
  const [name, outputExtension] = FORMAT_BY_EXTENSION[normalizedExtension]
    ? [base, extension]
    : TEXT_EXTENSIONS.has(normalizedExtension)
      ? [base, format]
      : [fileName, format]
  const target = toFileLanguageTag(targetCode)
  const languages =
    mode === "bilingual" && sourceCode ? `${toFileLanguageTag(sourceCode)}-${target}` : target
  return `${name}.${languages}.${outputExtension}`
}
