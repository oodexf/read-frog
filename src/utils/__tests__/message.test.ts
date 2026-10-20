import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { onMessage, sendMessage } from "../message"

describe("extension messaging", () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it("round-trips async responses through the callback-based browser API", async () => {
    const removeListener = onMessage("getInitialConfig", async () => null)

    try {
      await expect(sendMessage("getInitialConfig", undefined)).resolves.toBeNull()
    } finally {
      removeListener()
    }
  })

  // Patched in patches/@webext-core__messaging@4.0.0.patch: 4.0.0 never reads
  // lastError on the tab path, so Chrome logs "Unchecked runtime.lastError".
  it("rejects with the lastError message when a tab has no receiver", async () => {
    const lastErrorMessage = "Could not establish connection. Receiving end does not exist."
    vi.spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation(
      (
        _tabId: number,
        _message: unknown,
        _options: unknown,
        callback: (response?: unknown) => void,
      ) => {
        Object.defineProperty(fakeBrowser.runtime, "lastError", {
          configurable: true,
          get: () => ({ message: lastErrorMessage }),
        })
        callback(undefined)
        Reflect.deleteProperty(fakeBrowser.runtime, "lastError")
      },
    )

    await expect(sendMessage("refreshDetectedPageLanguage", undefined, 1)).rejects.toThrow(
      lastErrorMessage,
    )
  })
})
