/**
 * Subtitle files arrive in whatever encoding the tool that made them chose.
 * UTF-8 is the norm, but a large share of Chinese subtitles are still GBK, and
 * some Windows tools write UTF-16 — read as UTF-8 those turn into mojibake that
 * would then be sent off for translation.
 */
export function decodeSubtitleBuffer(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

  let text: string
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder("utf-16le").decode(bytes)
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = new TextDecoder("utf-16be").decode(bytes)
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
      // gb18030 is a superset of GBK and GB2312, so it covers all three.
      text = new TextDecoder("gb18030").decode(bytes)
    }
  }

  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
}
