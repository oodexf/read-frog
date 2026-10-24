/**
 * Encodings a subtitle file without a BOM can be in besides UTF-8: the legacy
 * code pages that subtitle tools on Windows still write. Every one is a
 * WHATWG label, so `TextDecoder` reads it in every browser.
 */
export const LEGACY_SUBTITLE_ENCODINGS = [
  "gb18030",
  "big5",
  "shift_jis",
  "euc-kr",
  "windows-1252",
  "windows-1250",
  "windows-1251",
  "windows-1253",
  "windows-1254",
  "windows-1256",
  "windows-874",
  "windows-1258",
] as const

export type LegacySubtitleEncoding = (typeof LEGACY_SUBTITLE_ENCODINGS)[number]

export type SubtitleEncoding = "utf-8" | "utf-16le" | "utf-16be" | LegacySubtitleEncoding

export function isLegacySubtitleEncoding(
  encoding: SubtitleEncoding,
): encoding is LegacySubtitleEncoding {
  return (LEGACY_SUBTITLE_ENCODINGS as readonly string[]).includes(encoding)
}

export interface DecodedSubtitleFile {
  text: string
  encoding: SubtitleEncoding
  /**
   * True when the bytes are not Unicode and the encoding is a guess: nothing in
   * a legacy file says which code page wrote it, so the UI has to let the user
   * correct it.
   */
  isLegacy: boolean
}

/**
 * The multi-byte code page a CJK UI language's own subtitles most likely use.
 * Tried first: where several CJK code pages decode the same bytes cleanly,
 * the reader's own language is the better bet.
 */
const PREFERRED_CJK_ENCODING_BY_LOCALE: ReadonlyArray<[RegExp, LegacySubtitleEncoding]> = [
  [/^zh-(?:tw|hk|mo|hant)/i, "big5"],
  [/^zh/i, "gb18030"],
  [/^ja/i, "shift_jis"],
  [/^ko/i, "euc-kr"],
]

/**
 * The Latin-script code page of a UI language whose text also reads as
 * plausible Windows-1252 (`ş` as `þ`, `ğ` as `ð`), and so can only be told
 * apart by who is reading.
 */
const PREFERRED_LATIN_ENCODING_BY_LOCALE: ReadonlyArray<[RegExp, LegacySubtitleEncoding]> = [
  [/^(?:tr|az)/i, "windows-1254"],
  [/^vi/i, "windows-1258"],
]

/**
 * Multi-byte encodings first: they reject byte sequences they don't define,
 * so a wrong one shows up as U+FFFD. Single-byte code pages accept any byte
 * and so can only come last; Cyrillic still lands on 1251, because its
 * odd-length words leave a CJK lead byte in front of a space.
 */
const FALLBACK_ENCODING_ORDER: readonly LegacySubtitleEncoding[] = [
  "gb18030",
  "big5",
  "shift_jis",
  "euc-kr",
  "windows-1251",
  "windows-1252",
]

const REPLACEMENT_CHARACTER = String.fromCodePoint(0xfffd)

/** Latin letters Windows-1252 can hold beyond ASCII (accented letters, Œ, Š, Ž, Ÿ). */
const WINDOWS_1252_LETTER_PATTERN = /[À-ÖØ-öø-ÿŒœŠšŸŽž]/
const ASCII_LETTER_PATTERN = /[A-Z]/i

/**
 * Whether bytes read as Windows-1252 look like Western European writing: its
 * non-ASCII characters are mostly accented letters inside ASCII words
 * (`très`, `Größe`). CJK or Cyrillic bytes read that way come out as symbols
 * (`§A¦n`) or as runs of accented letters with no ASCII letter beside them
 * (`ÄãºÃ`, `Ïðèâåò`). This has to be settled before trying the CJK code
 * pages, which would otherwise accept `è` plus the next ASCII letter as one
 * plausible ideograph.
 */
function looksLikeWesternEuropeanText(text: string): boolean {
  const chars = Array.from(text)
  let nonAscii = 0
  let lettersInWords = 0

  chars.forEach((char, index) => {
    if (char.charCodeAt(0) < 0x80) return
    nonAscii++
    if (
      WINDOWS_1252_LETTER_PATTERN.test(char) &&
      (ASCII_LETTER_PATTERN.test(chars[index - 1] ?? "") ||
        ASCII_LETTER_PATTERN.test(chars[index + 1] ?? ""))
    ) {
      lettersInWords++
    }
  })

  return nonAscii > 0 && lettersInWords * 2 >= nonAscii
}

export function guessLegacyEncoding(
  bytes: Uint8Array,
  uiLocale?: string | null,
): LegacySubtitleEncoding {
  const preferredFor = (table: ReadonlyArray<[RegExp, LegacySubtitleEncoding]>) =>
    uiLocale ? table.find(([pattern]) => pattern.test(uiLocale))?.[1] : undefined

  if (looksLikeWesternEuropeanText(new TextDecoder("windows-1252").decode(bytes))) {
    return preferredFor(PREFERRED_LATIN_ENCODING_BY_LOCALE) ?? "windows-1252"
  }

  // Only a multi-byte preference may jump the queue: a single-byte one never
  // fails to decode, so it would win for every file, CJK ones included.
  const preferred = preferredFor(PREFERRED_CJK_ENCODING_BY_LOCALE)
  const candidates = preferred
    ? [preferred, ...FALLBACK_ENCODING_ORDER.filter((encoding) => encoding !== preferred)]
    : FALLBACK_ENCODING_ORDER

  for (const encoding of candidates) {
    if (!new TextDecoder(encoding).decode(bytes).includes(REPLACEMENT_CHARACTER)) {
      return encoding
    }
  }
  return "windows-1252"
}

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
}

/**
 * Subtitle files arrive in whatever encoding the tool that made them chose.
 * UTF-8 is the norm and UTF-16 announces itself with a BOM; anything else is a
 * legacy code page that has to be guessed, and is reported as such so the
 * caller can offer the user a different one.
 */
export function decodeSubtitleBuffer(
  buffer: ArrayBuffer | Uint8Array,
  {
    encoding,
    uiLocale,
  }: {
    /** Read with this encoding instead of detecting one: the user's correction. */
    encoding?: LegacySubtitleEncoding
    uiLocale?: string | null
  } = {},
): DecodedSubtitleFile {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

  if (encoding) {
    return {
      text: normalizeText(new TextDecoder(encoding).decode(bytes)),
      encoding,
      isLegacy: true,
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: normalizeText(new TextDecoder("utf-16le").decode(bytes)),
      encoding: "utf-16le",
      isLegacy: false,
    }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {
      text: normalizeText(new TextDecoder("utf-16be").decode(bytes)),
      encoding: "utf-16be",
      isLegacy: false,
    }
  }
  try {
    return {
      text: normalizeText(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      encoding: "utf-8",
      isLegacy: false,
    }
  } catch {
    const guessed = guessLegacyEncoding(bytes, uiLocale)
    return {
      text: normalizeText(new TextDecoder(guessed).decode(bytes)),
      encoding: guessed,
      isLegacy: true,
    }
  }
}
