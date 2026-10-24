import type { SubtitlesFragment } from "@/utils/subtitles/types"
import { atom, createStore } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { targetLangCodeAtom } from "@/entrypoints/translation-hub/atoms"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { parseSubtitleFile } from "@/utils/subtitles/files"
import {
  setSubtitleFileAtom,
  subtitleFileRunStateAtom,
  subtitleFileTranslatedCountAtom,
  translateSubtitleFileAtom,
} from "../atoms"

const mocks = vi.hoisted(() => ({
  translateSubtitles: vi.fn<(...args: any[]) => any>(),
}))

// Plain atoms in place of the hub's config-backed language atoms.
vi.mock("@/entrypoints/translation-hub/atoms", () => ({
  sourceLangCodeAtom: atom("eng"),
  targetLangCodeAtom: atom("cmn"),
}))
vi.mock("@/utils/atoms/config", () => ({
  configFieldsAtomMap: { languageDetection: atom({ mode: "basic" }) },
}))
vi.mock("@/utils/i18n", () => ({ i18n: { t: (key: string) => key }, getUiLocale: () => "en" }))
vi.mock("@/utils/config/storage", () => ({ getLocalConfig: async () => DEFAULT_CONFIG }))
vi.mock("@/utils/providers/provider-ref", () => ({ canProviderRefGenerateText: () => false }))
vi.mock("@/utils/subtitles/processor/translator", () => ({
  buildSubtitlesSummaryContextHash: () => undefined,
  fetchSubtitlesSummary: async () => null,
  resolveSubtitlesProviderRef: async () => ({ kind: "local", config: {} }),
  translateSubtitles: mocks.translateSubtitles,
}))

function loadSrt(store: ReturnType<typeof createStore>, lineCount: number) {
  const text = Array.from(
    { length: lineCount },
    (_, index) =>
      `${index + 1}\n00:00:${String(index).padStart(2, "0")},000 --> 00:00:${String(index).padStart(2, "0")},900\nline ${index}`,
  ).join("\n\n")
  store.set(setSubtitleFileAtom, {
    name: "lecture.srt",
    bytes: new Uint8Array(),
    parsed: parseSubtitleFile("lecture.srt", text)!,
    encoding: "utf-8",
  })
}

describe("translateSubtitleFileAtom", () => {
  beforeEach(() => {
    mocks.translateSubtitles.mockReset()
  })

  it("translates the loaded file and reports it done", async () => {
    const store = createStore()
    loadSrt(store, 12)
    mocks.translateSubtitles.mockImplementation(async (batch: SubtitlesFragment[]) =>
      batch.map((fragment) => ({ ...fragment, translation: `译 ${fragment.text}` })),
    )

    await store.set(translateSubtitleFileAtom)

    expect(store.get(subtitleFileTranslatedCountAtom)).toBe(12)
    expect(store.get(subtitleFileRunStateAtom)).toEqual({ status: "done", errorMessage: null })
  })

  it("stops a run once the user switches to another language pair", async () => {
    const store = createStore()
    loadSrt(store, 40)
    mocks.translateSubtitles.mockImplementation(async (batch: SubtitlesFragment[]) => {
      // The user changes the target while the first window is in flight.
      if (batch[0]!.text === "line 0") {
        void store.set(targetLangCodeAtom, "jpn")
      }
      return batch.map((fragment) => ({ ...fragment, translation: `译 ${fragment.text}` }))
    })

    await store.set(translateSubtitleFileAtom)

    // Only the first window of two batches went out; the other six were never sent.
    expect(mocks.translateSubtitles).toHaveBeenCalledTimes(2)
    expect(store.get(subtitleFileRunStateAtom)).toEqual({ status: "idle" })
    expect(store.get(subtitleFileTranslatedCountAtom)).toBe(0)
  })
})
