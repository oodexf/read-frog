import type { SubtitleUnit } from "@/utils/subtitles/files"
import type { SubtitlesFragment } from "@/utils/subtitles/types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { SubtitleFileTranslationError, translateSubtitleFile } from "../translate-subtitle-file"

const mocks = vi.hoisted(() => ({
  fetchSubtitlesSummary: vi.fn<(...args: any[]) => any>(),
  getLocalConfig: vi.fn<(...args: any[]) => any>(),
  resolveSubtitlesProviderRef: vi.fn<(...args: any[]) => any>(),
  translateSubtitles: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("@/utils/config/storage", () => ({ getLocalConfig: mocks.getLocalConfig }))
vi.mock("@/utils/providers/provider-ref", () => ({ canProviderRefGenerateText: () => true }))
vi.mock("@/utils/subtitles/processor/translator", () => ({
  buildSubtitlesSummaryContextHash: () => "summary-hash",
  fetchSubtitlesSummary: mocks.fetchSubtitlesSummary,
  resolveSubtitlesProviderRef: mocks.resolveSubtitlesProviderRef,
  translateSubtitles: mocks.translateSubtitles,
}))

function units(count: number): SubtitleUnit[] {
  return Array.from({ length: count }, (_, index) => ({
    text: `line ${index}`,
    start: index * 1000,
    end: index * 1000 + 900,
  }))
}

function translateAll(fail: (text: string) => boolean = () => false) {
  mocks.translateSubtitles.mockImplementation(async (fragments: SubtitlesFragment[]) =>
    fragments.map((fragment) => ({
      ...fragment,
      translation: fail(fragment.text) ? "" : `译 ${fragment.text}`,
    })),
  )
}

const BASE_REQUEST = {
  title: "movie",
  sourceCode: "auto" as const,
  detectedSourceCode: "eng" as const,
  targetCode: "cmn" as const,
}

describe("translateSubtitleFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLocalConfig.mockResolvedValue(DEFAULT_CONFIG)
    mocks.resolveSubtitlesProviderRef.mockResolvedValue({ kind: "local", config: {} })
    mocks.fetchSubtitlesSummary.mockResolvedValue("a summary")
  })

  it("translates every line with the hub's languages and the file as context", async () => {
    translateAll()
    const progress: string[][] = []

    const result = await translateSubtitleFile({
      ...BASE_REQUEST,
      units: units(12),
      onProgress: (translations) => progress.push([...translations]),
    })

    expect(result.failedCount).toBe(0)
    expect(result.translations[11]).toBe("译 line 11")
    const [fragments, videoContext, config] = mocks.translateSubtitles.mock.calls[0]!
    expect(fragments).toHaveLength(5)
    expect(videoContext).toMatchObject({ videoTitle: "movie", summary: "a summary" })
    expect(config.language).toMatchObject({ sourceCode: "auto", targetCode: "cmn" })
    // An initial empty snapshot, then one per batch of five.
    expect(progress).toHaveLength(4)
    expect(progress.at(-1)).toEqual(result.translations)
  })

  it("reports failed lines and retries only those on the next run", async () => {
    translateAll((text) => text === "line 3")
    const first = await translateSubtitleFile({ ...BASE_REQUEST, units: units(7) })

    expect(first.failedCount).toBe(1)
    expect(first.translations[3]).toBe("")

    translateAll()
    mocks.translateSubtitles.mockClear()
    const second = await translateSubtitleFile({
      ...BASE_REQUEST,
      units: units(7),
      previousTranslations: first.translations,
    })

    expect(second.failedCount).toBe(0)
    expect(mocks.translateSubtitles).toHaveBeenCalledTimes(1)
    expect(mocks.translateSubtitles.mock.calls[0]![0]).toEqual([
      { text: "line 3", start: 3000, end: 3900 },
    ])
  })

  it("refuses to translate into the language the file is already in", async () => {
    await expect(
      translateSubtitleFile({ ...BASE_REQUEST, detectedSourceCode: "cmn", units: units(1) }),
    ).rejects.toThrow(SubtitleFileTranslationError)
    expect(mocks.translateSubtitles).not.toHaveBeenCalled()
  })

  it("fails without a subtitles provider instead of writing an empty file", async () => {
    mocks.resolveSubtitlesProviderRef.mockResolvedValue(null)

    await expect(translateSubtitleFile({ ...BASE_REQUEST, units: units(1) })).rejects.toThrow(
      SubtitleFileTranslationError,
    )
    expect(mocks.translateSubtitles).not.toHaveBeenCalled()
  })

  it("stops between batches once cancelled", async () => {
    const controller = new AbortController()
    mocks.translateSubtitles.mockImplementation(async (fragments: SubtitlesFragment[]) => {
      controller.abort()
      return fragments.map((fragment) => ({ ...fragment, translation: "x" }))
    })

    await expect(
      translateSubtitleFile({ ...BASE_REQUEST, units: units(30), signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" })
    // Only the first window of two batches was in flight.
    expect(mocks.translateSubtitles).toHaveBeenCalledTimes(2)
  })
})
