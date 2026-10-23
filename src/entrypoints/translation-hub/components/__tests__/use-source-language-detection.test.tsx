// @vitest-environment jsdom

import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { ReactNode } from "react"
import { act, renderHook } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { detectedSourceLangCodeAtom } from "@/entrypoints/translation-hub/atoms"
import { useSourceLanguageDetection } from "@/entrypoints/translation-hub/components/use-source-language-detection"

const mocks = vi.hoisted(() => ({
  detectLanguage: vi.fn<(text: string) => Promise<LangCodeISO6393 | null>>(),
}))

vi.mock("@/utils/content/language", () => ({ detectLanguage: mocks.detectLanguage }))

describe("useSourceLanguageDetection", () => {
  const resolvers = new Map<string, (code: LangCodeISO6393) => void>()

  beforeEach(() => {
    vi.useFakeTimers()
    resolvers.clear()
    mocks.detectLanguage.mockReset().mockImplementation(
      (text) =>
        new Promise((resolve) => {
          resolvers.set(text, resolve)
        }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderDetection(text: string) {
    const store = createStore()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )
    const view = renderHook(({ value }) => useSourceLanguageDetection(value), {
      initialProps: { value: text },
      wrapper,
    })
    return { store, ...view }
  }

  it("ignores a detection that lands after the text it was for has changed", async () => {
    const { store, rerender } = renderDetection("an English draft")
    await act(async () => vi.advanceTimersByTime(1000))
    expect(mocks.detectLanguage).toHaveBeenCalledTimes(1)

    // Switching to a Spanish subtitle file while the English detection is still in flight.
    rerender({ value: "un subtítulo en español" })
    await act(async () => vi.advanceTimersByTime(1000))
    await act(async () => resolvers.get("un subtítulo en español")!("spa"))
    await act(async () => resolvers.get("an English draft")!("eng"))

    expect(store.get(detectedSourceLangCodeAtom)).toBe("spa")
  })

  it("drops a detection still in flight when unmounted", async () => {
    const { store, unmount } = renderDetection("an English draft")
    await act(async () => vi.advanceTimersByTime(1000))

    unmount()
    await act(async () => resolvers.get("an English draft")!("eng"))

    expect(store.get(detectedSourceLangCodeAtom)).toBeNull()
  })
})
