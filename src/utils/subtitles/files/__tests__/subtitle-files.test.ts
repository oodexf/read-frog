import type { SubtitleOutputOptions } from "../types"
import { describe, expect, it } from "vitest"
import {
  buildTranslatedSubtitleFileName,
  decodeSubtitleBuffer,
  detectSubtitleFormat,
  parseSubtitleFile,
} from ".."

const BILINGUAL: SubtitleOutputOptions = { mode: "bilingual", translationFirst: false }
const BILINGUAL_TRANSLATION_FIRST: SubtitleOutputOptions = {
  mode: "bilingual",
  translationFirst: true,
}
const TRANSLATION_ONLY: SubtitleOutputOptions = { mode: "translationOnly", translationFirst: false }

function parse(fileName: string, text: string) {
  const parsed = parseSubtitleFile(fileName, text)
  if (!parsed) throw new Error("expected a parsed file")
  return parsed
}

describe("srt", () => {
  const SRT = [
    "1",
    "00:00:01,000 --> 00:00:02,500",
    "<i>Hello</i> there,",
    "friend.",
    "",
    "2",
    "00:00:03,000 --> 00:00:04,000",
    "{\\an8}Up top &amp; loud",
    "",
    "3",
    "00:00:05,000 --> 00:00:06,000",
    '<font color="red"></font>',
    "",
  ].join("\n")

  it("reads cues as plain text with their timing", () => {
    const { format, units } = parse("movie.srt", SRT)

    expect(format).toBe("srt")
    expect(units).toEqual([
      { text: "Hello there,\nfriend.", start: 1000, end: 2500 },
      { text: "Up top & loud", start: 3000, end: 4000 },
    ])
  })

  it("writes the original back unchanged when nothing is translated", () => {
    expect(parse("movie.srt", SRT).serialize([], BILINGUAL)).toBe(SRT)
  })

  it("adds the translation under the original line", () => {
    const output = parse("movie.srt", SRT).serialize(["你好，朋友。", "顶部"], BILINGUAL)

    expect(output).toContain(
      "00:00:01,000 --> 00:00:02,500\n<i>Hello</i> there,\nfriend.\n你好，朋友。\n\n2",
    )
    expect(output).toContain("{\\an8}Up top &amp; loud\n顶部")
  })

  it("keeps the position tag at the start when the translation goes on top", () => {
    const output = parse("movie.srt", SRT).serialize(["你好", "顶部"], BILINGUAL_TRANSLATION_FIRST)

    expect(output).toContain("00:00:03,000 --> 00:00:04,000\n{\\an8}顶部\nUp top &amp; loud")
  })

  it("replaces the dialogue in translation-only mode and drops blank translation lines", () => {
    const output = parse("movie.srt", SRT).serialize(["你好\n\n朋友", "顶部"], TRANSLATION_ONLY)

    expect(output).toContain("00:00:01,000 --> 00:00:02,500\n你好\n朋友\n\n2")
    expect(output).toContain("00:00:03,000 --> 00:00:04,000\n{\\an8}顶部")
    expect(output).not.toContain("Hello")
  })
})

describe("vtt", () => {
  const VTT = [
    "WEBVTT - Lecture",
    "Kind: captions",
    "",
    "STYLE",
    "::cue { color: yellow }",
    "",
    "NOTE This line is a comment",
    "",
    "intro",
    "00:01.000 --> 00:02.000 align:start position:10%",
    "<v Alice>Hi <c.loud>there</c></v>",
    "",
    "00:00:03.000 --> 00:00:04.000",
    "Second",
    "",
  ].join("\n")

  it("reads only cues, with identifiers and settings left out of the text", () => {
    const { format, units } = parse("lecture.vtt", VTT)

    expect(format).toBe("vtt")
    expect(units).toEqual([
      { text: "Hi there", start: 1000, end: 2000 },
      { text: "Second", start: 3000, end: 4000 },
    ])
  })

  it("passes the header, style and note blocks through and escapes markup in translations", () => {
    const output = parse("lecture.vtt", VTT).serialize(["嗨 <你>", "第二 & 三"], BILINGUAL)

    expect(output.startsWith("WEBVTT - Lecture\nKind: captions\n\nSTYLE\n::cue")).toBe(true)
    expect(output).toContain("NOTE This line is a comment")
    expect(output).toContain(
      "intro\n00:01.000 --> 00:02.000 align:start position:10%\n<v Alice>Hi <c.loud>there</c></v>\n嗨 &lt;你&gt;",
    )
    expect(output).toContain("Second\n第二 &amp; 三")
  })
})

describe("ass", () => {
  const ASS = [
    "[Script Info]",
    "Title: Test",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize",
    "Style: Default,Arial,20",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    "Dialogue: 0,0:00:01.20,0:00:03.00,Default,,0,0,0,,{\\an8\\pos(10,10)}Well, hello\\Nthere",
    "Comment: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Translator note",
    "Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100{\\p0}",
    "Dialogue: 0,0:00:06.00,0:00:07.00,Default,,0,0,0,,Plain {\\i1}italic{\\i0} words",
  ].join("\n")

  it("reads dialogue text, commas included, and skips comments and drawings", () => {
    const { format, units } = parse("show.ass", ASS)

    expect(format).toBe("ass")
    expect(units).toEqual([
      { text: "Well, hello\nthere", start: 1200, end: 3000 },
      { text: "Plain italic words", start: 6000, end: 7000 },
    ])
  })

  it("writes untouched lines verbatim", () => {
    expect(parse("show.ass", ASS).serialize([], BILINGUAL)).toBe(ASS)
  })

  it("appends the translation, resetting inline overrides first", () => {
    const output = parse("show.ass", ASS).serialize(["嗯，你好\n那边", "普通 {斜体} 词"], BILINGUAL)
    const lines = output.split("\n")

    expect(lines[9]).toBe(
      "Dialogue: 0,0:00:01.20,0:00:03.00,Default,,0,0,0,,{\\an8\\pos(10,10)}Well, hello\\Nthere\\N嗯，你好\\N那边",
    )
    expect(lines[12]).toBe(
      "Dialogue: 0,0:00:06.00,0:00:07.00,Default,,0,0,0,,Plain {\\i1}italic{\\i0} words\\N{\\r}普通 斜体 词",
    )
  })

  it("keeps the leading override block for translation-first and translation-only output", () => {
    const first = parse("show.ass", ASS).serialize(["你好"], BILINGUAL_TRANSLATION_FIRST)
    const only = parse("show.ass", ASS).serialize(["你好"], TRANSLATION_ONLY)

    expect(first.split("\n")[9]).toBe(
      "Dialogue: 0,0:00:01.20,0:00:03.00,Default,,0,0,0,,{\\an8\\pos(10,10)}你好\\NWell, hello\\Nthere",
    )
    expect(only.split("\n")[9]).toBe(
      "Dialogue: 0,0:00:01.20,0:00:03.00,Default,,0,0,0,,{\\an8\\pos(10,10)}你好",
    )
  })
})

describe("detectSubtitleFormat", () => {
  it("goes by extension, then by content", () => {
    expect(detectSubtitleFormat("a.SSA", "")).toBe("ass")
    expect(detectSubtitleFormat("a.txt", "WEBVTT\n\n00:01.000 --> 00:02.000\nHi")).toBe("vtt")
    expect(detectSubtitleFormat("a.txt", "[Script Info]\nTitle: x")).toBe("ass")
    expect(detectSubtitleFormat("a", "1\n00:00:01,000 --> 00:00:02,000\nHi")).toBe("srt")
    expect(detectSubtitleFormat("notes.txt", "just text")).toBeNull()
  })
})

describe("decodeSubtitleBuffer", () => {
  it("reads UTF-8 and strips the BOM and carriage returns", () => {
    // BOM, then "你好\r\nhi" in UTF-8. Spelled out: the test environment's
    // TextEncoder only keeps the low byte of each character.
    const bytes = new Uint8Array([
      0xef, 0xbb, 0xbf, 0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd, 0x0d, 0x0a, 0x68, 0x69,
    ])
    expect(decodeSubtitleBuffer(bytes)).toBe("你好\nhi")
  })

  it("falls back to GBK when the bytes are not valid UTF-8", () => {
    // "你好" in GBK.
    expect(decodeSubtitleBuffer(new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]))).toBe("你好")
  })

  it("reads UTF-16 with a byte order mark", () => {
    expect(decodeSubtitleBuffer(new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]))).toBe("Hi")
    expect(decodeSubtitleBuffer(new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x69]))).toBe("Hi")
  })
})

describe("buildTranslatedSubtitleFileName", () => {
  it("names a translated copy after the target, and a bilingual one after both languages", () => {
    expect(
      buildTranslatedSubtitleFileName("movie.en.srt", {
        sourceCode: "eng",
        targetCode: "cmn",
        mode: "translationOnly",
        format: "srt",
      }),
    ).toBe("movie.en.zh.srt")
    expect(
      buildTranslatedSubtitleFileName("show.ssa", {
        sourceCode: "eng",
        targetCode: "jpn",
        mode: "bilingual",
        format: "ass",
      }),
    ).toBe("show.en-ja.ssa")
    expect(
      buildTranslatedSubtitleFileName("captions", {
        sourceCode: null,
        targetCode: "cmn",
        mode: "bilingual",
        format: "vtt",
      }),
    ).toBe("captions.zh.vtt")
  })
})
