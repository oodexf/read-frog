export type SubtitleFileFormat = "srt" | "vtt" | "ass"

export type SubtitleOutputMode = "bilingual" | "translationOnly"

export interface SubtitleOutputOptions {
  mode: SubtitleOutputMode
  /** Bilingual only: put the translation above the original line instead of below it. */
  translationFirst: boolean
}

/** One translatable cue: `text` is the plain dialogue, with markup stripped for the model. */
export interface SubtitleUnit {
  text: string
  start: number
  end: number
}

/**
 * A parsed file keeps everything it does not translate (headers, styles, cue
 * ids and settings, comments) inside `serialize`, so the copy it writes differs
 * from the upload only in the dialogue text.
 */
export interface ParsedSubtitleFile {
  format: SubtitleFileFormat
  units: SubtitleUnit[]
  /**
   * `translations[i]` belongs to `units[i]`. An empty translation keeps that
   * cue's original text, so a partly failed run still writes a usable file.
   */
  serialize: (translations: readonly string[], options: SubtitleOutputOptions) => string
}
