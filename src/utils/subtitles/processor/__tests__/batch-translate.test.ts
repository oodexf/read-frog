import type { SubtitlesFragment } from "@/utils/subtitles/types"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { translateFragmentsInBatches } from "../batch-translate"

const mocks = vi.hoisted(() => ({
  translateSubtitles: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("../translator", () => ({ translateSubtitles: mocks.translateSubtitles }))

const VIDEO_CONTEXT = { videoTitle: "video", subtitlesTextContent: "" }

function lines(count: number): SubtitlesFragment[] {
  return Array.from({ length: count }, (_, index) => ({
    text: `line ${index}`,
    start: index * 1000,
    end: index * 1000 + 900,
  }))
}

/** Batches whose first line is in `failing` throw, the way an all-failed batch does. */
function translateExcept(failing: Set<string>) {
  mocks.translateSubtitles.mockImplementation(async (batch: SubtitlesFragment[]) => {
    if (failing.has(batch[0]!.text)) {
      throw new Error("API authentication failed")
    }
    return batch.map((fragment) => ({ ...fragment, translation: `译 ${fragment.text}` }))
  })
}

describe("translateFragmentsInBatches", () => {
  beforeEach(() => {
    mocks.translateSubtitles.mockReset()
  })

  it("fails the whole run on a failed batch when the caller can't take a partial result", async () => {
    translateExcept(new Set(["line 0"]))

    await expect(
      translateFragmentsInBatches(lines(20), VIDEO_CONTEXT, DEFAULT_CONFIG, { concurrency: 2 }),
    ).rejects.toThrow("API authentication failed")
    expect(mocks.translateSubtitles).toHaveBeenCalledTimes(2)
  })

  it("keeps the other batch in the window and moves on when failures are tolerated", async () => {
    translateExcept(new Set(["line 0"]))
    const onBatchFailed = vi.fn<(source: SubtitlesFragment[], error: unknown) => void>()

    const result = await translateFragmentsInBatches(lines(20), VIDEO_CONTEXT, DEFAULT_CONFIG, {
      concurrency: 2,
      onBatchFailed,
    })

    expect(result).toHaveLength(20)
    expect(result.slice(0, 5).map((fragment) => fragment.translation)).toEqual(
      Array.from({ length: 5 }, () => ""),
    )
    expect(result[5]!.translation).toBe("译 line 5")
    expect(result[19]!.translation).toBe("译 line 19")
    expect(mocks.translateSubtitles).toHaveBeenCalledTimes(4)
    expect(onBatchFailed).toHaveBeenCalledWith(lines(5), expect.any(Error))
  })

  it("aborts when the failure hook throws", async () => {
    translateExcept(new Set(["line 0"]))

    await expect(
      translateFragmentsInBatches(lines(20), VIDEO_CONTEXT, DEFAULT_CONFIG, {
        concurrency: 2,
        onBatchFailed: () => {
          throw new Error("cancelled")
        },
      }),
    ).rejects.toThrow("cancelled")
  })

  it("stops before the next window once asked to, returning what is done", async () => {
    translateExcept(new Set())
    let windows = 0

    const result = await translateFragmentsInBatches(lines(30), VIDEO_CONTEXT, DEFAULT_CONFIG, {
      concurrency: 2,
      shouldStop: () => windows++ >= 1,
    })

    expect(result).toHaveLength(10)
    expect(mocks.translateSubtitles).toHaveBeenCalledTimes(2)
  })
})
