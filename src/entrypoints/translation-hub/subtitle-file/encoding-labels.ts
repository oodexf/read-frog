import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { LegacySubtitleEncoding } from "@/utils/subtitles/files"
import { i18n } from "@/utils/i18n"
import { getLanguageName } from "@/utils/language-labels"

const ENCODING_NAMES: Record<LegacySubtitleEncoding, string> = {
  gb18030: "GB18030",
  big5: "Big5",
  shift_jis: "Shift_JIS",
  "euc-kr": "EUC-KR",
  "windows-1252": "Windows-1252",
  "windows-1250": "Windows-1250",
  "windows-1251": "Windows-1251",
  "windows-1253": "Windows-1253",
  "windows-1254": "Windows-1254",
  "windows-1256": "Windows-1256",
  "windows-874": "Windows-874",
  "windows-1258": "Windows-1258",
}

/** What each code page is for, which is how a user recognises the right one. */
const ENCODING_SCRIPTS: Record<
  LegacySubtitleEncoding,
  LangCodeISO6393 | "westernEuropean" | "centralEuropean" | "cyrillic"
> = {
  gb18030: "cmn",
  big5: "cmn-Hant",
  shift_jis: "jpn",
  "euc-kr": "kor",
  "windows-1252": "westernEuropean",
  "windows-1250": "centralEuropean",
  "windows-1251": "cyrillic",
  "windows-1253": "ell",
  "windows-1254": "tur",
  "windows-1256": "arb",
  "windows-874": "tha",
  "windows-1258": "vie",
}

export function getSubtitleEncodingLabel(encoding: LegacySubtitleEncoding): string {
  const script = ENCODING_SCRIPTS[encoding]
  const scriptName =
    script === "westernEuropean" || script === "centralEuropean" || script === "cyrillic"
      ? i18n.t(`translationHub.subtitleFile.encodings.${script}`)
      : getLanguageName(script)
  return `${ENCODING_NAMES[encoding]} · ${scriptName}`
}
