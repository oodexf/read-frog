import type { LoadedSubtitleFile } from "./atoms"
import type { LegacySubtitleEncoding } from "@/utils/subtitles/files"
import { getUiLocale, i18n } from "@/utils/i18n"
import { decodeSubtitleBuffer, parseSubtitleFile } from "@/utils/subtitles/files"

/** Far beyond any real subtitle track (a feature film's SRT is ~100 KB); guards against a wrong pick. */
const MAX_SUBTITLE_FILE_BYTES = 5 * 1024 * 1024

export type LoadSubtitleFileResult = { file: LoadedSubtitleFile } | { error: string }

/**
 * Decodes, parses and checks a subtitle file. Runs on upload, and again when
 * the user picks a different encoding for a legacy file, so the bytes are
 * kept and re-read rather than the garbled text patched up.
 */
export function loadSubtitleFile(
  name: string,
  bytes: Uint8Array,
  encoding?: LegacySubtitleEncoding,
): LoadSubtitleFileResult {
  if (bytes.byteLength > MAX_SUBTITLE_FILE_BYTES) {
    return { error: i18n.t("translationHub.subtitleFile.errors.tooLarge") }
  }

  let decoded
  try {
    decoded = decodeSubtitleBuffer(bytes, { encoding, uiLocale: getUiLocale() })
  } catch {
    return { error: i18n.t("translationHub.subtitleFile.errors.readFailed") }
  }

  const parsed = parseSubtitleFile(name, decoded.text)
  if (!parsed) {
    return { error: i18n.t("translationHub.subtitleFile.errors.unsupported") }
  }
  if (parsed.units.length === 0) {
    return { error: i18n.t("translationHub.subtitleFile.errors.noLines") }
  }

  return {
    file: {
      name,
      bytes,
      parsed,
      encoding: decoded.encoding,
    },
  }
}
